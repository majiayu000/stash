import { describe, expect, test } from 'bun:test';
import type { Area } from '@stash/shared';
import { buildCapturePreview, parseCaptureInput, parseDateToken } from './parser.js';

const NOW = '2026-05-14T12:00:00.000Z'; // Thursday

function area(id: string, name: string): Area {
  return {
    id,
    name,
    reviewCadence: 'ad_hoc',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const AREAS: Area[] = [area('a1', 'aurora'), area('a2', 'borealis'), area('a3', 'AI tooling'), area('a4', '家庭')];
const CTX = { areas: AREAS, nowIso: NOW, time_zone: 'UTC' };

describe('parseCaptureInput', () => {
  test('plain title is preserved with no tokens', () => {
    const r = parseCaptureInput('write the readme', CTX);
    expect(r.title).toBe('write the readme');
    expect(r.labels).toEqual([]);
    expect(r.priority).toBeUndefined();
  });

  test('extracts #project and resolves to area id', () => {
    const r = parseCaptureInput('fix login #aurora', CTX);
    expect(r.title).toBe('fix login');
    expect(r.projectId).toBe('a1');
    expect(r.areaId).toBe('a1');
  });

  test('unknown #project goes to unresolved, title unaffected', () => {
    const r = parseCaptureInput('fix login #ghost', CTX);
    expect(r.title).toBe('fix login');
    expect(r.projectId).toBeUndefined();
    expect(r.unresolved).toContain('#ghost');
  });

  test('multiple @tag tokens accumulate without duplicates', () => {
    const r = parseCaptureInput('audit @sec @auth @sec', CTX);
    expect(r.title).toBe('audit');
    expect(r.labels).toEqual(['sec', 'auth']);
  });

  test('^p1 sets priority', () => {
    const r = parseCaptureInput('triage ^p1', CTX);
    expect(r.priority).toBe('p1');
    expect(r.title).toBe('triage');
  });

  test('system token sets kind and is stripped from title', () => {
    const r = parseCaptureInput('morning routine :system @daily', CTX);
    expect(r.title).toBe('morning routine');
    expect(r.kind).toBe('system');
    expect(r.labels).toEqual(['daily']);
  });

  test('! sets scheduledFor', () => {
    const r = parseCaptureInput('plan !tomorrow', CTX);
    expect(r.scheduledFor).toBe('2026-05-15');
    expect(r.dueAt).toBeUndefined();
    expect(r.title).toBe('plan');
  });

  test('!! sets dueAt (not scheduledFor)', () => {
    const r = parseCaptureInput('ship v1 !!2026-05-30', CTX);
    expect(r.dueAt).toBe('2026-05-30');
    expect(r.scheduledFor).toBeUndefined();
  });

  test('*1h and *45m set estimate', () => {
    const r1 = parseCaptureInput('refactor *1h', CTX);
    expect(r1.estimateMinutes).toBe(60);
    const r2 = parseCaptureInput('quick *45m', CTX);
    expect(r2.estimateMinutes).toBe(45);
  });

  test('multi-token capture combined', () => {
    const r = parseCaptureInput('finish OAuth flow #aurora @auth ^p1 !tomorrow *2h', CTX);
    expect(r.title).toBe('finish OAuth flow');
    expect(r.projectId).toBe('a1');
    expect(r.labels).toEqual(['auth']);
    expect(r.priority).toBe('p1');
    expect(r.scheduledFor).toBe('2026-05-15');
    expect(r.estimateMinutes).toBe(120);
  });

  test('title preserves order with tokens removed from middle', () => {
    const r = parseCaptureInput('audit #aurora the auth flow', CTX);
    expect(r.title).toBe('audit the auth flow');
  });

  test('case-insensitive #project match', () => {
    const r = parseCaptureInput('thing #AURORA', CTX);
    expect(r.projectId).toBe('a1');
  });

  test('hyphenated #project token matches spaced area names', () => {
    const r = parseCaptureInput('wire homepage #ai-tooling', CTX);
    expect(r.title).toBe('wire homepage');
    expect(r.projectId).toBe('a3');
    expect(r.areaId).toBe('a3');
  });

  test('Chinese date and time phrases set scheduledFor and startAt', () => {
    const r = parseCaptureInput('明天下午3点半 修门 #家庭 @家务 ^p2 *30m', CTX);
    expect(r.title).toBe('修门');
    expect(r.projectId).toBe('a4');
    expect(r.labels).toEqual(['家务']);
    expect(r.priority).toBe('p2');
    expect(r.scheduledFor).toBe('2026-05-15');
    expect(r.startAt).toBe('2026-05-15T15:30:00.000Z');
    expect(r.estimateMinutes).toBe(30);
  });

  test('numeric time combines with existing v0.3 date token', () => {
    const r = parseCaptureInput('deploy !tomorrow 20:30 @ops', CTX);
    expect(r.title).toBe('deploy');
    expect(r.scheduledFor).toBe('2026-05-15');
    expect(r.startAt).toBe('2026-05-15T20:30:00.000Z');
    expect(r.labels).toEqual(['ops']);
  });

  test('tonight schedules today with an evening start time', () => {
    const r = parseCaptureInput('今晚 写总结', CTX);
    expect(r.title).toBe('写总结');
    expect(r.scheduledFor).toBe('2026-05-14');
    expect(r.startAt).toBe('2026-05-14T20:00:00.000Z');
  });

  test('buildCapturePreview exposes normalized server chip labels', () => {
    const parsed = parseCaptureInput('明天下午3点半 修门 #家庭 @家务 :system ^p2 *30m', CTX);
    const preview = buildCapturePreview(parsed, AREAS, 'UTC');
    expect(preview.projectName).toBe('家庭');
    expect(preview.chips).toEqual([
      { type: 'proj', label: '#家庭', value: 'a4' },
      { type: 'tag', label: '@家务', value: '家务' },
      { type: 'kind', label: 'kind:system', value: 'system' },
      { type: 'pri', label: '^p2', value: 'p2' },
      { type: 'date', label: 'scheduled 2026-05-15', value: '2026-05-15' },
      { type: 'time', label: 'start 15:30', value: '2026-05-15T15:30:00.000Z' },
      { type: 'est', label: 'estimate 30m', value: '30' },
    ]);
  });
});

describe('parseDateToken', () => {
  test('today / tomorrow', () => {
    expect(parseDateToken('today', NOW, 'UTC')).toBe('2026-05-14');
    expect(parseDateToken('tomorrow', NOW, 'UTC')).toBe('2026-05-15');
    expect(parseDateToken('tomo', NOW, 'UTC')).toBe('2026-05-15');
  });

  test('weekday yields next occurrence (Thu → Fri = +1, Thu → Thu = +7)', () => {
    expect(parseDateToken('fri', NOW, 'UTC')).toBe('2026-05-15'); // +1
    expect(parseDateToken('thu', NOW, 'UTC')).toBe('2026-05-21'); // +7 (same-day → next week)
    expect(parseDateToken('mon', NOW, 'UTC')).toBe('2026-05-18'); // +4
  });

  test('next-<weekday> always +7 from "this <weekday>"', () => {
    expect(parseDateToken('next-fri', NOW, 'UTC')).toBe('2026-05-22');
    expect(parseDateToken('next-mon', NOW, 'UTC')).toBe('2026-05-25');
  });

  test('ISO date passes through', () => {
    expect(parseDateToken('2026-05-20', NOW, 'UTC')).toBe('2026-05-20');
  });

  test('Chinese relative dates and weekdays', () => {
    expect(parseDateToken('今天', NOW, 'UTC')).toBe('2026-05-14');
    expect(parseDateToken('明天', NOW, 'UTC')).toBe('2026-05-15');
    expect(parseDateToken('后天', NOW, 'UTC')).toBe('2026-05-16');
    expect(parseDateToken('大后天', NOW, 'UTC')).toBe('2026-05-17');
    expect(parseDateToken('周一', NOW, 'UTC')).toBe('2026-05-18');
    expect(parseDateToken('下周', NOW, 'UTC')).toBe('2026-05-18');
    expect(parseDateToken('下周一', NOW, 'UTC')).toBe('2026-05-25');
  });

  test('+N day/week offsets', () => {
    expect(parseDateToken('+3d', NOW, 'UTC')).toBe('2026-05-17');
    expect(parseDateToken('+2w', NOW, 'UTC')).toBe('2026-05-28');
  });

  test('due-<phrase> normalised (used by !! tokens)', () => {
    expect(parseDateToken('due-tomorrow', NOW, 'UTC')).toBe('2026-05-15');
    expect(parseDateToken('due-fri', NOW, 'UTC')).toBe('2026-05-15');
  });

  test('garbage returns undefined', () => {
    expect(parseDateToken('blorp', NOW, 'UTC')).toBeUndefined();
  });
});
