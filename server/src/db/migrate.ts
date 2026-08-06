import type { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { backupDatabase, type BackupDatabaseResult } from './backup.js';
import { assert_utc_instant, parse_calendar_date } from '@stash/shared';

const MIGRATIONS_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'migrations');

export interface MigrationRow {
  id: string;
  applied_at: string;
}

export function listMigrationFiles(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export function ensureMigrationsTable(db: Database): void {
  db.exec(`
    create table if not exists _migrations (
      id text primary key,
      applied_at text not null
    )
  `);
}

export function listAppliedMigrations(db: Database): string[] {
  const rows = db.query<MigrationRow, []>('select id, applied_at from _migrations order by id').all();
  return rows.map((r) => r.id);
}

export interface MigrateResult {
  applied: string[];
  alreadyApplied: string[];
  backup?: BackupDatabaseResult;
}

export interface MigrateOptions {
  backup?: {
    dbPath: string;
    backupDir?: string;
    now?: Date;
  };
}

export function migrate(db: Database, dir: string = MIGRATIONS_DIR, options: MigrateOptions = {}): MigrateResult {
  ensureMigrationsTable(db);
  const files = listMigrationFiles(dir);
  const applied = new Set(listAppliedMigrations(db));
  const pending = files.filter((file) => !applied.has(file));
  const newly: string[] = [];
  const backup = pending.length > 0 && options.backup
    ? backupDatabase(db, { ...options.backup, reason: 'migration' })
    : undefined;

  for (const file of pending) {
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      if (file === '019_calendar_field_formats.sql') {
        normalizeCalendarFieldFormats(db);
      }
      db.exec(sql);
      db.prepare('insert into _migrations(id, applied_at) values (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    })();
    newly.push(file);
  }

  return {
    applied: newly,
    alreadyApplied: [...applied],
    backup,
  };
}

interface WorkItemCalendarRow {
  id: string;
  scheduled_for: string | null;
  due_at: string | null;
  review_at: string | null;
  recurrence_json: string | null;
  reminder_at: string | null;
  start_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface AreaCalendarRow {
  id: string;
  created_at: string;
  updated_at: string;
}

interface DecisionDraftCalendarRow {
  id: string;
  proposed_scheduled_for: string | null;
  proposed_due_at: string | null;
}

function normalizeCalendarFieldFormats(db: Database): void {
  const work_items = db.query<WorkItemCalendarRow, []>(
    `select id, scheduled_for, due_at, review_at, recurrence_json,
            reminder_at, start_at, created_at, updated_at, completed_at
       from work_items`,
  ).all();
  const update_work_item = db.prepare(
    `update work_items
        set scheduled_for = ?, due_at = ?, review_at = ?, recurrence_json = ?,
            reminder_at = ?, start_at = ?, created_at = ?, updated_at = ?, completed_at = ?
      where id = ?`,
  );
  for (const row of work_items) {
    const scheduled_for = normalize_calendar_date(
      row.scheduled_for,
      `work_items[${row.id}].scheduled_for`,
    );
    const due_at = normalize_calendar_date(row.due_at, `work_items[${row.id}].due_at`);
    const review_at = normalize_calendar_date(row.review_at, `work_items[${row.id}].review_at`);
    const recurrence_json = normalize_recurrence(row.recurrence_json, row.id);
    const reminder_at = normalize_utc_instant(row.reminder_at, `work_items[${row.id}].reminder_at`);
    const start_at = normalize_utc_instant(row.start_at, `work_items[${row.id}].start_at`);
    const created_at = normalize_utc_instant(row.created_at, `work_items[${row.id}].created_at`);
    const updated_at = normalize_utc_instant(row.updated_at, `work_items[${row.id}].updated_at`);
    const completed_at = normalize_utc_instant(row.completed_at, `work_items[${row.id}].completed_at`);
    if (
      scheduled_for !== row.scheduled_for
      || due_at !== row.due_at
      || review_at !== row.review_at
      || recurrence_json !== row.recurrence_json
      || reminder_at !== row.reminder_at
      || start_at !== row.start_at
      || created_at !== row.created_at
      || updated_at !== row.updated_at
      || completed_at !== row.completed_at
    ) {
      update_work_item.run(
        scheduled_for, due_at, review_at, recurrence_json,
        reminder_at, start_at, created_at, updated_at, completed_at,
        row.id,
      );
    }
  }

  // `areas` was never covered here. Its instants are read with Date.parse,
  // which treats a space-separated timestamp as *local* time, so leaving them
  // unrepaired silently shifted them by the machine's UTC offset.
  const areas = db.query<AreaCalendarRow, []>(
    'select id, created_at, updated_at from areas',
  ).all();
  const update_area = db.prepare(
    'update areas set created_at = ?, updated_at = ? where id = ?',
  );
  for (const row of areas) {
    const created_at = normalize_utc_instant(row.created_at, `areas[${row.id}].created_at`);
    const updated_at = normalize_utc_instant(row.updated_at, `areas[${row.id}].updated_at`);
    if (created_at !== row.created_at || updated_at !== row.updated_at) {
      update_area.run(created_at, updated_at, row.id);
    }
  }

  const drafts = db.query<DecisionDraftCalendarRow, []>(
    'select id, proposed_scheduled_for, proposed_due_at from decision_drafts',
  ).all();
  const update_draft = db.prepare(
    `update decision_drafts
        set proposed_scheduled_for = ?, proposed_due_at = ?
      where id = ?`,
  );
  for (const row of drafts) {
    const proposed_scheduled_for = normalize_calendar_date(
      row.proposed_scheduled_for,
      `decision_drafts[${row.id}].proposed_scheduled_for`,
    );
    const proposed_due_at = normalize_calendar_date(
      row.proposed_due_at,
      `decision_drafts[${row.id}].proposed_due_at`,
    );
    if (
      proposed_scheduled_for !== row.proposed_scheduled_for
      || proposed_due_at !== row.proposed_due_at
    ) {
      update_draft.run(proposed_scheduled_for, proposed_due_at, row.id);
    }
  }
}

function normalize_calendar_date(value: string | null, location: string): string | null {
  if (value === null) return null;
  try {
    parse_calendar_date(value);
    return value;
  } catch {
    const legacy = /^(\d{4}-\d{2}-\d{2})T00:00:00\.000Z$/.exec(value);
    if (legacy?.[1]) {
      try {
        parse_calendar_date(legacy[1]);
        return legacy[1];
      } catch {
        // The location-rich migration error below is more useful than the parser error.
      }
    }
    throw new Error(`migration 019 blocked: ${location} has noncanonical date ${JSON.stringify(value)}`);
  }
}

function normalize_recurrence(value: string | null, id: string): string | null {
  if (value === null) return null;
  let recurrence: unknown;
  try {
    recurrence = JSON.parse(value);
  } catch {
    throw new Error(`migration 019 blocked: work_items[${id}].recurrence_json is invalid JSON`);
  }
  if (!is_record(recurrence) || recurrence.until === undefined) return value;
  if (typeof recurrence.until !== 'string') {
    throw new Error(`migration 019 blocked: work_items[${id}].recurrence_json.until is not a string`);
  }
  const until = normalize_calendar_date(
    recurrence.until,
    `work_items[${id}].recurrence_json.until`,
  );
  if (until === recurrence.until) return value;
  return JSON.stringify({ ...recurrence, until });
}

/** SQLite's own `CURRENT_TIMESTAMP` / `datetime('now')` output shape. */
const SQLITE_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

/**
 * Canonical UTC instant for a stored value, repairing the one legacy shape we
 * can resolve without guessing.
 *
 * Date columns already had a repair path here while instant columns were
 * validate-only, so a database written by raw SQL rather than the application
 * could not be opened at all: `updated_at` of `2026-05-26 10:46:23` failed the
 * check with no way forward. That shape is SQLite's documented
 * `CURRENT_TIMESTAMP` output, which is always UTC, so it is promoted to a
 * canonical instant. Anything else stays a hard failure — an unrecognised
 * format has no knowable time zone, and quietly assuming one would shift real
 * timestamps.
 */
function normalize_utc_instant(value: string | null, location: string): string | null {
  if (value === null) return null;
  try {
    assert_utc_instant(value);
    return value;
  } catch {
    const sqlite = SQLITE_TIMESTAMP.exec(value);
    if (sqlite) {
      const candidate = `${sqlite[1]}T${sqlite[2]}.000Z`;
      try {
        assert_utc_instant(candidate);
        return candidate;
      } catch {
        // Fall through to the location-rich failure below.
      }
    }
    throw new Error(`migration 019 blocked: ${location} has invalid UTC instant ${JSON.stringify(value)}`);
  }
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
