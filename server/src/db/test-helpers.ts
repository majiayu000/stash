import type { Database } from 'bun:sqlite';
import { openDatabase } from './connection.js';
import { migrate } from './migrate.js';

/**
 * Fresh in-memory SQLite database with all migrations applied. Use in tests
 * that need a clean schema per `beforeEach`. Replaces the per-suite copies
 * that used to live inside each domain's `service.test.ts`.
 */
export function freshDb(): Database {
  const db = openDatabase({ path: ':memory:', inMemory: true });
  migrate(db);
  return db;
}
