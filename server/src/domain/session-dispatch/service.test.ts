import { beforeEach, describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { AreaService } from '../area/service.js';
import { ProjectKnowledgeService } from '../project-knowledge/service.js';
import { SkillService } from '../skill/service.js';
import { WorkItemService } from '../work-item/service.js';
import { DispatchRunService } from './runs.js';
import { SessionDispatchService } from './service.js';

describe('SessionDispatchService.composePrompt', () => {
  const at = '2026-05-18T10:00:00.000Z';
  let writes: Array<{ path: string; contents: string }>;
  let spawns: Array<{ cmd: string; args: string[]; stdin: string }>;
  let workItems: WorkItemService;
  let areas: AreaService;
  let knowledge: ProjectKnowledgeService;
  let skills: SkillService;
  let dispatch: SessionDispatchService;

  beforeEach(() => {
    const db = freshDb();
    const clock = fixedClock(at);
    workItems = new WorkItemService({ db, clock });
    areas = new AreaService({ db, clock });
    knowledge = new ProjectKnowledgeService({ db, clock });
    skills = new SkillService({ db, clock });
    const runs = new DispatchRunService({ db, clock });
    writes = [];
    spawns = [];
    dispatch = new SessionDispatchService({
      workItems, areas, knowledge, skills, clock, runs, cwd: '/repo',
      writeFileImpl: (path, contents) => { writes.push({ path, contents }); },
      spawnImpl: (cmd, args, stdin) => { spawns.push({ cmd, args, stdin }); return { pid: 12345 }; },
    });
  });

  test('minimal todo without project still composes a runnable prompt', () => {
    const item = workItems.create({ title: 'fix the failing auth test' });
    const res = dispatch.dispatch({ workItemId: item.id, tool: 'claude' });

    expect(res.spawned).toBe(true);
    expect(res.pid).toBe(12345);
    expect(res.run.status).toBe('spawned');
    expect(res.run.pid).toBe(12345);
    expect(res.run.cwd).toBe('/repo');
    expect(res.run.promptHash).toHaveLength(64);
    expect(res.prompt).toContain('# Task: fix the failing auth test');
    expect(res.prompt).toContain('Begin.');
    expect(writes.length).toBe(1);
    expect(writes[0]?.path).toMatch(/claude-/);
    expect(spawns.length).toBe(1);
    expect(spawns[0]?.cmd).toBe('claude');
  });

  test('composes project intent + bound skills + relevant lessons', () => {
    const area = areas.create({ name: 'aurora' });
    knowledge.setIntent(area.id, 'ship v1 by friday.');
    knowledge.createLesson({ projectId: area.id, title: 'TTL inverted is the bug', body: 'last time, ttl check was negated.', tags: ['auth'] });

    // Skill bound to the project
    skills.create({ id: 'security-review', name: 'Security Review', description: 'OWASP pass.', installed: true });
    skills.toggleBinding(area.id, 'security-review', true);

    const item = workItems.create({
      title: 'investigate session expiry',
      description: 'session.test.ts expects 401, sees 200.',
      labels: ['auth'],
      projectId: area.id,
      areaId: area.id,
    });

    const res = dispatch.dispatch({ workItemId: item.id, tool: 'claude' });

    expect(res.prompt).toContain('## Project: aurora');
    expect(res.prompt).toContain('**Intent.** ship v1 by friday.');
    expect(res.prompt).toContain('Security Review');
    expect(res.prompt).toContain('## Relevant lessons');
    expect(res.prompt).toContain('TTL inverted is the bug');
  });

  test('includes open sub-tasks', () => {
    const parent = workItems.create({ title: 'auth rework' });
    workItems.create({ title: 'add audit log', parentId: parent.id });
    workItems.create({ title: 'rotate refresh tokens', parentId: parent.id });
    const done = workItems.create({ title: 'old subtask', parentId: parent.id });
    workItems.update(done.id, { status: 'done' });

    const res = dispatch.dispatch({ workItemId: parent.id, tool: 'claude' });
    expect(res.prompt).toContain('## Sub-tasks');
    expect(res.prompt).toContain('- [ ] add audit log');
    expect(res.prompt).toContain('- [ ] rotate refresh tokens');
    expect(res.prompt).not.toContain('old subtask'); // done ones suppressed
  });

  test('spawn failure returns spawned=false + error + suggested command', () => {
    const db = freshDb();
    const clock = fixedClock(at);
    const localWorkItems = new WorkItemService({ db, clock });
    const localAreas = new AreaService({ db, clock });
    const localKnowledge = new ProjectKnowledgeService({ db, clock });
    const localSkills = new SkillService({ db, clock });
    const localRuns = new DispatchRunService({ db, clock });
    const failing = new SessionDispatchService({
      workItems: localWorkItems, areas: localAreas, knowledge: localKnowledge, skills: localSkills, clock, runs: localRuns,
      writeFileImpl: (path, contents) => { writes.push({ path, contents }); },
      spawnImpl: () => ({ error: 'spawn claude ENOENT' }),
    });
    const item = localWorkItems.create({ title: 'try it anyway' });
    const res = failing.dispatch({ workItemId: item.id, tool: 'claude' });
    expect(res.spawned).toBe(false);
    expect(res.pid).toBeUndefined();
    expect(res.spawnError).toMatch(/ENOENT/);
    expect(res.run.status).toBe('failed');
    expect(res.run.error).toMatch(/ENOENT/);
    expect(res.suggestedCommand).toMatch(/^claude < /);
  });

  test('dispatch run can be matched and closed', () => {
    const db = freshDb();
    const clock = fixedClock(at);
    const localWorkItems = new WorkItemService({ db, clock });
    const localAreas = new AreaService({ db, clock });
    const localKnowledge = new ProjectKnowledgeService({ db, clock });
    const localSkills = new SkillService({ db, clock });
    const localRuns = new DispatchRunService({ db, clock });
    const service = new SessionDispatchService({
      workItems: localWorkItems, areas: localAreas, knowledge: localKnowledge, skills: localSkills, clock, runs: localRuns,
      writeFileImpl: (path, contents) => { writes.push({ path, contents }); },
      spawnImpl: () => ({ pid: 456 }),
    });
    const item = localWorkItems.create({ title: 'track me' });
    const res = service.dispatch({ workItemId: item.id, tool: 'codex' });
    expect(localRuns.list({ workItemId: item.id }).map((r) => r.id)).toEqual([res.run.id]);
    const matched = localRuns.markMatched(res.run.id, 'sess-123');
    expect(matched.status).toBe('matched');
    expect(matched.matchedSessionId).toBe('sess-123');
    const closed = localRuns.close(res.run.id);
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).toBe(at);
  });

  test('extra instructions land in a Notes section', () => {
    const item = workItems.create({ title: 'do thing' });
    const res = dispatch.dispatch({ workItemId: item.id, tool: 'claude', extraInstructions: 'first read README.md.' });
    expect(res.prompt).toContain('## Notes');
    expect(res.prompt).toContain('first read README.md.');
  });

  test('rejects unknown work item id', () => {
    expect(() => dispatch.dispatch({ workItemId: 'ghost', tool: 'claude' })).toThrow();
  });

  test('compose() composes prompt + writes file but never spawns', () => {
    const item = workItems.create({ title: 'audit the auth flow' });
    const res = dispatch.compose({ workItemId: item.id, tool: 'codex' });
    expect(res.prompt).toContain('# Task: audit the auth flow');
    expect(res.prompt).toContain('Begin.');
    expect(res.suggestedCommand).toMatch(/^codex < /);
    expect(writes.length).toBe(1);
    expect(spawns.length).toBe(0);
  });

  test('compose() rejects unknown work item id', () => {
    expect(() => dispatch.compose({ workItemId: 'ghost', tool: 'claude' })).toThrow();
  });
});
