import { describe, expect, test } from 'bun:test';
import type { Area } from '@stash/shared';
import { parseCaptureInput, parseDateToken } from './parser.js';

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

const AREAS: Area[] = [area('a1', 'aurora'), area('a2', 'borealis')];
const CTX = { areas: AREAS, nowIso: NOW };

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
});

describe('parseDateToken', () => {
  test('today / tomorrow', () => {
    expect(parseDateToken('today', NOW)).toBe('2026-05-14');
    expect(parseDateToken('tomorrow', NOW)).toBe('2026-05-15');
    expect(parseDateToken('tomo', NOW)).toBe('2026-05-15');
  });

  test('weekday yields next occurrence (Thu → Fri = +1, Thu → Thu = +7)', () => {
    expect(parseDateToken('fri', NOW)).toBe('2026-05-15'); // +1
    expect(parseDateToken('thu', NOW)).toBe('2026-05-21'); // +7 (same-day → next week)
    expect(parseDateToken('mon', NOW)).toBe('2026-05-18'); // +4
  });

  test('next-<weekday> always +7 from "this <weekday>"', () => {
    expect(parseDateToken('next-fri', NOW)).toBe('2026-05-22');
    expect(parseDateToken('next-mon', NOW)).toBe('2026-05-25');
  });

  test('ISO date passes through', () => {
    expect(parseDateToken('2026-05-20', NOW)).toBe('2026-05-20');
  });

  test('due-<phrase> normalised (used by !! tokens)', () => {
    expect(parseDateToken('due-tomorrow', NOW)).toBe('2026-05-15');
    expect(parseDateToken('due-fri', NOW)).toBe('2026-05-15');
  });

  test('garbage returns undefined', () => {
    expect(parseDateToken('blorp', NOW)).toBeUndefined();
  });
});
