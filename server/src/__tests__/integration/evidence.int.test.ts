import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import type { Hono } from 'hono';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fixedClock } from '@stash/shared';
import { openDatabase } from '../../db/connection.js';
import { migrate } from '../../db/migrate.js';
import { createApp } from '../../web/app-factory.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLAUDE_FIXTURE_ROOT = join(here, '..', '..', 'adapters', 'claude', 'fixtures');

function setupApp(): { app: Hono; db: Database } {
  const db = openDatabase({ path: ':memory:', inMemory: true });
  migrate(db);
  const app = createApp({
    db,
    clock: fixedClock('2026-05-14T10:00:00.000Z'),
    claudeRoot: CLAUDE_FIXTURE_ROOT,
  });
  return { app, db };
}

async function jsonReq(app: Hono, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe('evidence API', () => {
  test('POST /api/evidence creates manual evidence', async () => {
    const { app } = setupApp();
    const create = await jsonReq(app, 'POST', '/api/work-items', { title: 'thing' });
    const id = create.body.data.id;
    const ev = await jsonReq(app, 'POST', '/api/evidence', {
      workItemId: id,
      kind: 'manual_note',
      text: 'manually verified',
    });
    expect(ev.status).toBe(201);
    expect(ev.body.data.text).toBe('manually verified');

    const list = await jsonReq(app, 'GET', `/api/evidence?workItemId=${id}`);
    expect(list.body.count).toBe(1);
  });

  test('POST /api/evidence/infer/:id proposes pending candidate from linked Claude session', async () => {
    const { app } = setupApp();
    const create = await jsonReq(app, 'POST', '/api/work-items', { title: 'auth work' });
    const id = create.body.data.id;
    await jsonReq(app, 'POST', `/api/work-items/${id}/link-session`, {
      provider: 'claude',
      sessionId: 'sess-fixture-1',
    });

    const proposed = await jsonReq(app, 'POST', `/api/evidence/infer/${id}`);
    expect(proposed.status).toBe(200);
    expect(proposed.body.count).toBe(1);
    expect(proposed.body.data[0].pendingAcceptance).toBe(true);
    expect(proposed.body.data[0].provider).toBe('claude');

    const pending = await jsonReq(app, 'GET', `/api/evidence?workItemId=${id}&pendingOnly=true`);
    expect(pending.body.count).toBe(1);
  });

  test('POST /:id/accept-completion flips to done; rejects when no candidate', async () => {
    const { app } = setupApp();
    const create = await jsonReq(app, 'POST', '/api/work-items', { title: 'auth work' });
    const id = create.body.data.id;

    // No candidate yet → 422.
    const earlyAccept = await jsonReq(app, 'POST', `/api/work-items/${id}/accept-completion`);
    expect(earlyAccept.status).toBe(422);
    expect(earlyAccept.body.error.code).toBe('NO_PENDING_CANDIDATE');

    // Link the fixture, infer, then accept.
    await jsonReq(app, 'POST', `/api/work-items/${id}/link-session`, {
      provider: 'claude',
      sessionId: 'sess-fixture-1',
    });
    await jsonReq(app, 'POST', `/api/evidence/infer/${id}`);

    const accepted = await jsonReq(app, 'POST', `/api/work-items/${id}/accept-completion`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('done');

    const pending = await jsonReq(app, 'GET', `/api/evidence?workItemId=${id}&pendingOnly=true`);
    expect(pending.body.data).toEqual([]);
  });

  test('POST /:id/reject-completion clears pending without changing status', async () => {
    const { app } = setupApp();
    const create = await jsonReq(app, 'POST', '/api/work-items', { title: 'auth work' });
    const id = create.body.data.id;
    await jsonReq(app, 'POST', `/api/work-items/${id}/link-session`, {
      provider: 'claude',
      sessionId: 'sess-fixture-1',
    });
    await jsonReq(app, 'POST', `/api/evidence/infer/${id}`);

    const rej = await jsonReq(app, 'POST', `/api/work-items/${id}/reject-completion`);
    expect(rej.status).toBe(200);
    expect(rej.body.data.cleared).toBeGreaterThanOrEqual(1);

    const item = await jsonReq(app, 'GET', `/api/work-items/${id}`);
    expect(item.body.data.status).not.toBe('done');
  });
});
