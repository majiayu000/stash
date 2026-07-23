import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { add_calendar_days, calendar_date_at } from '@stash/shared';

const repo_root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const time_zone = new Date().getUTCHours() <= 10
  ? 'Pacific/Pago_Pago'
  : 'Pacific/Kiritimati';

describe('rich demo seed', () => {
  test('accepts current calendar fields and is idempotent for database rows', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-rich-seed-test-'));
    const db_path = join(root, 'seed.db');
    const expected_today = calendar_date_at(new Date(), time_zone);
    try {
      const first = await run_seed(root, db_path);
      expect(first.exit_code).toBe(0);
      expect(first.stderr).toContain('[seed-rich] done.');

      const db = new Database(db_path, { readonly: true });
      const first_count = db.query<{ count: number }, []>(
        'select count(*) as count from work_items',
      ).get()!.count;
      const calendar_rows = db.query<{
        title: string;
        scheduled_for: string | null;
        due_at: string | null;
      }, []>(
        `select title, scheduled_for, due_at
           from work_items
          where title in (
            'daily standup notes',
            'audit-log column migration',
            'renew SSL cert'
          )`,
      ).all();
      db.close();
      expect(first_count).toBeGreaterThan(0);
      const by_title = new Map(calendar_rows.map((row) => [row.title, row]));
      expect(by_title.get('daily standup notes')?.scheduled_for).toBe(expected_today);
      expect(by_title.get('audit-log column migration')?.due_at)
        .toBe(add_calendar_days(expected_today, 3));
      expect(by_title.get('renew SSL cert')?.due_at)
        .toBe(add_calendar_days(expected_today, -1));

      const second = await run_seed(root, db_path);
      expect(second.exit_code).toBe(0);
      expect(second.stderr).toContain('work items already exist');

      const reopened = new Database(db_path, { readonly: true });
      const second_count = reopened.query<{ count: number }, []>(
        'select count(*) as count from work_items',
      ).get()!.count;
      reopened.close();
      expect(second_count).toBe(first_count);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

async function run_seed(
  root: string,
  db_path: string,
): Promise<{ exit_code: number; stderr: string }> {
  const process = Bun.spawn(
    ['bun', 'run', 'server/fixtures/seed-rich.ts', '--with-sessions'],
    {
      cwd: repo_root,
      env: {
        ...Bun.env,
        STASH_DB_PATH: db_path,
        STASH_BACKUP_DIR: join(root, 'backups'),
        CLAUDE_ROOT: join(root, 'claude'),
        CODEX_ROOT: join(root, 'codex'),
        STASH_TIME_ZONE: time_zone,
        STASH_SESSION_SPAWN_MODE: 'disabled',
      },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  );
  const [exit_code, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);
  return { exit_code, stderr };
}
