import { beforeEach, describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { createApp } from '../app-factory.js';
import type { Hono } from 'hono';

/**
 * Route-level tests for SPEC v0.3 endpoints. Service-level tests cover the
 * underlying logic; these guard against schema typos, status-code mistakes,
 * and area-resolution edge cases that only surface at the HTTP boundary.
 */

const NOW = '2026-05-14T10:00:00.000Z';

function setupApp(): Hono {
  return createApp({ db: freshDb(), clock: fixedClock(NOW) });
}

async function postJson(app: Hono, path: string, body: unknown): Promise<Response> {
  return app.fetch(new Request(`http://test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

async function getJson(app: Hono, path: string): Promise<Response> {
  return app.fetch(new Request(`http://test${path}`));
}

describe('POST /api/work-items/capture', () => {
  let app: Hono;
  beforeEach(() => { app = setupApp(); });

  test('parses tokens and creates an inbox work item', async () => {
    const area = await postJson(app, '/api/areas', { name: 'aurora' });
    expect(area.status).toBe(201);

    const res = await postJson(app, '/api/work-items/capture', {
      raw: 'fix login #aurora ^p1 !tomorrow @auth *45m',
    });
    expect(res.status).toBe(201);
    const json = await res.json() as { data: any; parsed: any };
    expect(json.data.title).toBe('fix login');
    expect(json.data.priority).toBe('p1');
    expect(json.data.labels).toContain('auth');
    expect(json.data.estimateMinutes).toBe(45);
    expect(json.data.scheduledFor).toBe('2026-05-15');
    expect(json.data.rawInput).toBe('fix login #aurora ^p1 !tomorrow @auth *45m');
    expect(json.parsed.projectName).toBe('aurora');
  });

  test('unknown #project leaves the project unresolved but still creates the item', async () => {
    const res = await postJson(app, '/api/work-items/capture', { raw: 'thing #ghost' });
    expect(res.status).toBe(201);
    const json = await res.json() as { data: any; parsed: any };
    expect(json.data.projectId).toBeUndefined();
    expect(json.parsed.unresolved).toContain('#ghost');
  });

  test('empty raw is rejected with 400', async () => {
    const res = await postJson(app, '/api/work-items/capture', { raw: '' });
    expect(res.status).toBe(400);
  });

  test('missing body is rejected', async () => {
    const res = await postJson(app, '/api/work-items/capture', {});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/work-items/today + /stale', () => {
  let app: Hono;
  beforeEach(() => { app = setupApp(); });

  test('today returns pinned + scheduled-for-today items only', async () => {
    await postJson(app, '/api/work-items', { title: 'pinned', todayPinned: true });
    await postJson(app, '/api/work-items', { title: 'today',  scheduledFor: '2026-05-14' });
    await postJson(app, '/api/work-items', { title: 'future', scheduledFor: '2026-06-01' });

    const res = await getJson(app, '/api/work-items/today');
    expect(res.status).toBe(200);
    const json = await res.json() as { data: any[] };
    const titles = json.data.map((i) => i.title).sort();
    expect(titles).toEqual(['pinned', 'today'].sort());
  });

  test('stale defaults to 30 days and respects ?days', async () => {
    // Note: created items have updatedAt = NOW = 2026-05-14. They are not stale
    // by default. We can only confirm the endpoint runs and filters correctly.
    await postJson(app, '/api/work-items', { title: 'fresh' });
    const res = await getJson(app, '/api/work-items/stale');
    expect(res.status).toBe(200);
    const json = await res.json() as { data: any[] };
    expect(json.data.length).toBe(0);

    // With days=0 (clamped to 1) nothing is stale yet either since updatedAt == NOW.
    const res2 = await getJson(app, '/api/work-items/stale?days=1');
    expect(res2.status).toBe(200);
  });
});

describe('POST /api/work-items/:id/today-pin + /priority', () => {
  let app: Hono;
  beforeEach(() => { app = setupApp(); });

  test('today-pin toggle round-trips', async () => {
    const create = await postJson(app, '/api/work-items', { title: 'pin me' });
    const id = ((await create.json()) as any).data.id;

    const pin = await postJson(app, `/api/work-items/${id}/today-pin`, { pinned: true });
    expect(pin.status).toBe(200);
    expect(((await pin.json()) as any).data.todayPinned).toBe(true);

    const unpin = await postJson(app, `/api/work-items/${id}/today-pin`, { pinned: false });
    expect(((await unpin.json()) as any).data.todayPinned).toBe(false);
  });

  test('today-pin rejects non-boolean body', async () => {
    const create = await postJson(app, '/api/work-items', { title: 'pin me' });
    const id = ((await create.json()) as any).data.id;
    const res = await postJson(app, `/api/work-items/${id}/today-pin`, { pinned: 'yes' });
    expect(res.status).toBe(400);
  });

  test('priority round-trips', async () => {
    const create = await postJson(app, '/api/work-items', { title: 'prio' });
    const id = ((await create.json()) as any).data.id;

    const res = await postJson(app, `/api/work-items/${id}/priority`, { priority: 'p0' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.priority).toBe('p0');
  });

  test('priority rejects invalid value', async () => {
    const create = await postJson(app, '/api/work-items', { title: 'prio' });
    const id = ((await create.json()) as any).data.id;
    const res = await postJson(app, `/api/work-items/${id}/priority`, { priority: 'p9' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/lessons/relevant', () => {
  let app: Hono;
  beforeEach(() => { app = setupApp(); });

  test('matches by tag overlap, top N', async () => {
    await postJson(app, '/api/lessons', { title: 'about auth', tags: ['auth', 'security'] });
    await postJson(app, '/api/lessons', { title: 'unrelated', tags: ['design'] });

    const res = await getJson(app, '/api/lessons/relevant?label=auth&limit=5');
    expect(res.status).toBe(200);
    const json = await res.json() as { data: any[] };
    expect(json.data.length).toBe(1);
    expect(json.data[0].title).toBe('about auth');
  });

  test('returns empty when no overlap', async () => {
    await postJson(app, '/api/lessons', { title: 'cross', tags: ['design'] });
    const res = await getJson(app, '/api/lessons/relevant?label=database');
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.length).toBe(0);
  });
});
