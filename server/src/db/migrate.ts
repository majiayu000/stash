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
        set scheduled_for = ?, due_at = ?, review_at = ?, recurrence_json = ?
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
    validate_utc_instant(row.reminder_at, `work_items[${row.id}].reminder_at`);
    validate_utc_instant(row.start_at, `work_items[${row.id}].start_at`);
    validate_utc_instant(row.created_at, `work_items[${row.id}].created_at`);
    validate_utc_instant(row.updated_at, `work_items[${row.id}].updated_at`);
    validate_utc_instant(row.completed_at, `work_items[${row.id}].completed_at`);
    if (
      scheduled_for !== row.scheduled_for
      || due_at !== row.due_at
      || review_at !== row.review_at
      || recurrence_json !== row.recurrence_json
    ) {
      update_work_item.run(scheduled_for, due_at, review_at, recurrence_json, row.id);
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

function validate_utc_instant(value: string | null, location: string): void {
  if (value === null) return;
  try {
    assert_utc_instant(value);
  } catch {
    throw new Error(`migration 019 blocked: ${location} has invalid UTC instant ${JSON.stringify(value)}`);
  }
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
