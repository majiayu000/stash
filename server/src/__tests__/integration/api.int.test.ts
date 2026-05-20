import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { fixedClock } from '@stash/shared';
import { openDatabase } from '../../db/connection.js';
import { migrate } from '../../db/migrate.js';
import { createApp } from '../../web/app-factory.js';
import type { Hono } from 'hono';

function setupApp(options: { allowedOrigins?: string[] } = {}): { app: Hono; db: Database } {
  const db = openDatabase({ path: ':memory:', inMemory: true });
  migrate(db);
  const app = createApp({
    db,
    clock: fixedClock('2026-05-14T10:00:00.000Z'),
    allowedOrigins: options.allowedOrigins,
  });
  return { app, db };
}

async function jsonRequest(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const init: RequestInit = {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await app.request(path, init);
  const text = await res.text();
  return {
    status: res.status,
    body: text ? JSON.parse(text) : null,
  };
}

describe('GET /health', () => {
  test('returns 200', async () => {
    const { app } = setupApp();
    const res = await jsonRequest(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('browser origin guard', () => {
  test('rejects a non-allowlisted Origin before reaching routes', async () => {
    const { app } = setupApp();
    const res = await app.request('/api/sessions/start', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ workItemId: 'wi-1', tool: 'codex' }),
    });

    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('FORBIDDEN_ORIGIN');
  });

  test('allows the local Vite client origin', async () => {
    const { app } = setupApp();
    const res = await app.request('/health', {
      headers: { origin: 'http://localhost:5173' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  test('allows explicitly configured local client origins', async () => {
    const { app } = setupApp({ allowedOrigins: ['http://localhost:5273'] });
    const res = await app.request('/health', {
      headers: { origin: 'http://localhost:5273' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5273');
  });
});

describe('areas API', () => {
  test('POST creates, GET lists, PATCH updates, DELETE removes', async () => {
    const { app } = setupApp();
    const create = await jsonRequest(app, 'POST', '/api/areas', { name: 'Side hustle' });
    expect(create.status).toBe(201);
    expect(create.body.data.name).toBe('Side hustle');
    const id = create.body.data.id;

    const list = await jsonRequest(app, 'GET', '/api/areas');
    expect(list.status).toBe(200);
    expect(list.body.data.map((a: any) => a.name)).toContain('Side hustle');

    const patch = await jsonRequest(app, 'PATCH', `/api/areas/${id}`, {
      reviewCadence: 'monthly',
    });
    expect(patch.status).toBe(200);
    expect(patch.body.data.reviewCadence).toBe('monthly');

    const del = await jsonRequest(app, 'DELETE', `/api/areas/${id}`);
    expect(del.status).toBe(204);
  });

  test('POST rejects duplicate names with 409', async () => {
    const { app } = setupApp();
    await jsonRequest(app, 'POST', '/api/areas', { name: 'AI tooling' });
    const dup = await jsonRequest(app, 'POST', '/api/areas', { name: 'AI tooling' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
  });

  test('POST rejects missing name with 400', async () => {
    const { app } = setupApp();
    const res = await jsonRequest(app, 'POST', '/api/areas', {});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});

describe('work-items API', () => {
  test('POST creates a minimal task and GET fetches it', async () => {
    const { app } = setupApp();
    const create = await jsonRequest(app, 'POST', '/api/work-items', {
      title: 'try the new dashboard',
    });
    expect(create.status).toBe(201);
    const id = create.body.data.id;
    expect(create.body.data.status).toBe('inbox');
    expect(create.body.data.priority).toBe('p2');

    const get = await jsonRequest(app, 'GET', `/api/work-items/${id}`);
    expect(get.status).toBe(200);
    expect(get.body.data.title).toBe('try the new dashboard');
  });

  test('GET / supports filters', async () => {
    const { app } = setupApp();
    await jsonRequest(app, 'POST', '/api/work-items', { title: 'A inbox' });
    await jsonRequest(app, 'POST', '/api/work-items', {
      title: 'B planned today',
      status: 'planned',
      scheduledFor: '2026-05-14',
    });
    await jsonRequest(app, 'POST', '/api/work-items', {
      title: 'C planned tomorrow',
      status: 'planned',
      scheduledFor: '2026-05-15',
    });

    const inboxRes = await jsonRequest(app, 'GET', '/api/work-items?status=inbox');
    expect(inboxRes.status).toBe(200);
    expect(inboxRes.body.count).toBe(1);
    expect(inboxRes.body.data[0].title).toBe('A inbox');

    const today = await jsonRequest(
      app,
      'GET',
      '/api/work-items?status=planned&status=active&scheduledFrom=2026-05-14&scheduledTo=2026-05-14',
    );
    expect(today.body.count).toBe(1);
    expect(today.body.data[0].title).toBe('B planned today');
  });

  test('PATCH transitions status; 422 on invalid transition', async () => {
    const { app } = setupApp();
    const create = await jsonRequest(app, 'POST', '/api/work-items', {
      title: 'thing',
      status: 'done',
    });
    const id = create.body.data.id;

    const bad = await jsonRequest(app, 'PATCH', `/api/work-items/${id}`, { status: 'blocked' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('PATCH on missing id returns 404', async () => {
    const { app } = setupApp();
    const res = await jsonRequest(app, 'PATCH', '/api/work-items/missing', { title: 'x' });
    expect(res.status).toBe(404);
  });

  test('checklist append + toggle + delete', async () => {
    const { app } = setupApp();
    const create = await jsonRequest(app, 'POST', '/api/work-items', { title: 'parent' });
    const id = create.body.data.id;

    const append = await jsonRequest(app, 'POST', `/api/work-items/${id}/checklist`, {
      text: 'step one',
    });
    expect(append.status).toBe(201);
    expect(append.body.data.checklist).toHaveLength(1);
    const childId = append.body.data.checklist[0].id;

    const toggle = await jsonRequest(
      app,
      'PATCH',
      `/api/work-items/${id}/checklist/${childId}`,
      { toggle: true },
    );
    expect(toggle.body.data.checklist[0].completed).toBe(true);

    const del = await jsonRequest(app, 'DELETE', `/api/work-items/${id}/checklist/${childId}`);
    expect(del.body.data.checklist).toEqual([]);
  });
});

describe('overview API', () => {
  test('returns counts, today, waiting, and needsAttention', async () => {
    const { app } = setupApp();
    // Inbox pressure: 5 inbox items
    for (let i = 0; i < 5; i++) {
      await jsonRequest(app, 'POST', '/api/work-items', { title: `inbox-${i}` });
    }
    await jsonRequest(app, 'POST', '/api/work-items', {
      title: 'today task',
      status: 'planned',
      scheduledFor: '2026-05-14',
    });
    await jsonRequest(app, 'POST', '/api/work-items', {
      title: 'blocker',
      status: 'blocked',
    });

    const res = await jsonRequest(app, 'GET', '/api/overview');
    expect(res.status).toBe(200);
    expect(res.body.data.counts.inbox).toBe(5);
    expect(res.body.data.counts.today).toBe(1);
    expect(res.body.data.counts.blocked).toBe(1);
    expect(res.body.data.today[0].title).toBe('today task');
    const kinds = res.body.data.needsAttention.map((n: any) => n.kind);
    expect(kinds).toContain('inbox_pressure');
    expect(kinds).toContain('blocked');
  });
});
