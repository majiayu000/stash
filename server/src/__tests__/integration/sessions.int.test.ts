import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import type { Hono } from 'hono';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fixedClock } from '@stash/shared';
import { openDatabase } from '../../db/connection.js';
import { migrate } from '../../db/migrate.js';
import { createApp, type AppContext } from '../../web/app-factory.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLAUDE_FIXTURE_ROOT = join(here, '..', '..', 'adapters', 'claude', 'fixtures');

function setupApp(
  overrides: Pick<Partial<AppContext>, 'sessionSpawnMode' | 'claudeRoot' | 'codexRoot'> = {},
): { app: Hono; db: Database } {
  const db = openDatabase({ path: ':memory:', inMemory: true });
  migrate(db);
  const app = createApp({
    db,
    clock: fixedClock('2026-05-14T10:00:00.000Z'),
    claudeRoot: CLAUDE_FIXTURE_ROOT,
    ...overrides,
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

describe('GET /api/agent-sessions', () => {
  test('returns fixture Claude sessions with linkedWorkItemIds', async () => {
    const { app } = setupApp();
    const res = await jsonReq(app, 'GET', '/api/agent-sessions?provider=claude');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    const fixture = res.body.data.find((s: any) => s.id === 'sess-fixture-1');
    expect(fixture).toBeDefined();
    expect(fixture.provider).toBe('claude');
    expect(fixture.title).toBe('Auth middleware secure cookies refactor');
    expect(fixture.linkedWorkItemIds).toEqual([]);
  });

  test('provider=all returns Claude (no Codex source configured)', async () => {
    const { app } = setupApp();
    const res = await jsonReq(app, 'GET', '/api/agent-sessions?provider=all');
    expect(res.status).toBe(200);
    expect(res.body.data.every((s: any) => s.provider === 'claude')).toBe(true);
  });
});

describe('GET /api/agent-sessions/:provider/:id/events', () => {
  test('returns bounded cursor pages for a known session', async () => {
    const { app } = setupApp();
    const res = await jsonReq(app, 'GET', '/api/agent-sessions/claude/sess-fixture-1/events?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.page).toMatchObject({ limit: 1, hasMore: true });
    expect(res.body.page.nextCursor).toEqual(expect.any(String));
    expect(res.body.page.responseBytes).toBeLessThanOrEqual(512 * 1024);
    expect(res.body.summary.totalToolCalls).toBeGreaterThanOrEqual(1);
    const kinds = new Set(res.body.data.map((e: any) => e.kind));
    expect(kinds.has('user')).toBe(true);

    const next = await jsonReq(
      app,
      'GET',
      `/api/agent-sessions/claude/sess-fixture-1/events?limit=1&cursor=${encodeURIComponent(res.body.page.nextCursor)}`,
    );
    expect(next.status).toBe(200);
    expect(next.body.data[0]).not.toEqual(res.body.data[0]);
  });

  test('rejects invalid cursor and limit query values', async () => {
    const { app } = setupApp();
    const cursor = await jsonReq(
      app,
      'GET',
      '/api/agent-sessions/claude/sess-fixture-1/events?cursor=invalid',
    );
    const limit = await jsonReq(
      app,
      'GET',
      '/api/agent-sessions/claude/sess-fixture-1/events?limit=201',
    );

    expect(cursor.status).toBe(400);
    expect(cursor.body.error.code).toBe('VALIDATION');
    expect(limit.status).toBe(400);
    expect(limit.body.error.code).toBe('VALIDATION');
  });

  test('keeps health responsive while a large transcript page runs in the worker', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-large-events-'));
    const projectDir = join(root, 'projects', 'large');
    mkdirSync(projectDir, { recursive: true });
    const sourcePath = join(projectDir, 'large.jsonl');
    const records: unknown[] = [
      claudeUserRecord('large-session', '2026-05-14T08:00:00.000Z'),
    ];
    for (let index = 0; index < 8_000; index++) {
      records.push({
        type: 'assistant',
        timestamp: new Date(Date.parse('2026-05-14T08:00:01.000Z') + index).toISOString(),
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: `large-${index}-${'x'.repeat(1_000)}` }],
        },
      });
    }
    writeFileSync(sourcePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
    const { app, db } = setupApp({ claudeRoot: root });
    try {
      const events = app.request('/api/agent-sessions/claude/large-session/events?limit=10');
      await Promise.resolve();
      const healthStarted = performance.now();
      const health = await app.request('/health');
      const healthMs = performance.now() - healthStarted;

      expect(health.status).toBe(200);
      expect(healthMs).toBeLessThanOrEqual(250);
      expect((await events).status).toBe(200);
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('GET /api/agent-sessions/:provider/:id', () => {
  test('finds an exact session older than the recent 30', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-old-session-'));
    const projectDir = join(root, 'projects', 'history');
    mkdirSync(projectDir, { recursive: true });
    for (let index = 0; index < 31; index++) {
      const id = `session-${String(index).padStart(2, '0')}`;
      writeFileSync(
        join(projectDir, `${id}.jsonl`),
        `${JSON.stringify(claudeUserRecord(id, new Date(Date.parse('2026-05-01T00:00:00.000Z') + index * 1000).toISOString()))}\n`,
      );
    }
    const { app, db } = setupApp({ claudeRoot: root });
    try {
      const res = await jsonReq(app, 'GET', '/api/agent-sessions/claude/session-00');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ provider: 'claude', id: 'session-00' });
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function claudeUserRecord(sessionId: string, timestamp: string) {
  return {
    type: 'user',
    timestamp,
    sessionId,
    cwd: '/tmp/project',
    message: { role: 'user', content: `session ${sessionId}` },
  };
}

describe('dispatch run lifecycle errors', () => {
  test('matching a missing dispatch run returns 404', async () => {
    const { app } = setupApp();
    const res = await jsonReq(app, 'POST', '/api/sessions/runs/missing/match', {
      sessionId: 'sess-404',
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('closing a missing dispatch run returns 404', async () => {
    const { app } = setupApp();
    const res = await jsonReq(app, 'POST', '/api/sessions/runs/missing/close');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('decision candidate mutation errors', () => {
  test('accepting a missing decision candidate returns 404', async () => {
    const { app } = setupApp();
    const res = await jsonReq(app, 'POST', '/api/agent-sessions/decision-candidates/missing/accept', {
      decisionId: 'decision-404',
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('ignoring a missing decision candidate returns 404', async () => {
    const { app } = setupApp();
    const res = await jsonReq(app, 'POST', '/api/agent-sessions/decision-candidates/missing/ignore');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/sessions/start', () => {
  test('disabled spawn mode composes without launching an agent CLI', async () => {
    const { app } = setupApp({ sessionSpawnMode: 'disabled' });
    const create = await jsonReq(app, 'POST', '/api/work-items', {
      title: 'safe dispatch from e2e',
    });
    const id = create.body.data.id;

    const res = await jsonReq(app, 'POST', '/api/sessions/start', {
      workItemId: id,
      tool: 'claude',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.spawned).toBe(false);
    expect(res.body.data.pid).toBeUndefined();
    expect(res.body.data.spawnError).toContain('disabled');
    expect(res.body.data.prompt).toContain('# Task: safe dispatch from e2e');
  });
});

describe('link-session', () => {
  test('POST link → GET sessions for item → DELETE unlink', async () => {
    const { app } = setupApp();
    const create = await jsonReq(app, 'POST', '/api/work-items', {
      title: 'auth refactor',
      projectId: '/Users/test/demo-repo',
    });
    const id = create.body.data.id;

    const link = await jsonReq(app, 'POST', `/api/work-items/${id}/link-session`, {
      provider: 'claude',
      sessionId: 'sess-fixture-1',
    });
    expect(link.status).toBe(201);

    const list = await jsonReq(app, 'GET', `/api/work-items/${id}/sessions`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].sessionId).toBe('sess-fixture-1');

    const sessions = await jsonReq(app, 'GET', '/api/agent-sessions?provider=claude');
    const fixture = sessions.body.data.find((s: any) => s.id === 'sess-fixture-1');
    expect(fixture.linkedWorkItemIds).toContain(id);

    const del = await jsonReq(
      app,
      'DELETE',
      `/api/work-items/${id}/link-session/claude/sess-fixture-1`,
    );
    expect(del.status).toBe(204);

    const after = await jsonReq(app, 'GET', `/api/work-items/${id}/sessions`);
    expect(after.body.data).toEqual([]);
  });

  test('link to missing work item returns 404', async () => {
    const { app } = setupApp();
    const res = await jsonReq(app, 'POST', '/api/work-items/missing/link-session', {
      provider: 'claude',
      sessionId: 'sess-fixture-1',
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/workboard', () => {
  test('groups items by projectId and attaches linked sessions', async () => {
    const { app } = setupApp();
    const a = await jsonReq(app, 'POST', '/api/work-items', {
      title: 'auth refactor',
      projectId: '/Users/test/demo-repo',
      status: 'active',
    });
    const b = await jsonReq(app, 'POST', '/api/work-items', {
      title: 'orphan idea',
    });
    await jsonReq(app, 'POST', `/api/work-items/${a.body.data.id}/link-session`, {
      provider: 'claude',
      sessionId: 'sess-fixture-1',
    });

    const board = await jsonReq(app, 'GET', '/api/workboard');
    expect(board.status).toBe(200);
    expect(board.body.data.projects).toHaveLength(1);
    const proj = board.body.data.projects[0];
    expect(proj.projectId).toBe('/Users/test/demo-repo');
    expect(proj.activeCount).toBe(1);
    expect(proj.sessions).toHaveLength(1);
    expect(proj.sessions[0].id).toBe('sess-fixture-1');
    expect(board.body.data.unassigned.map((i: any) => i.id)).toContain(b.body.data.id);
  });
});
