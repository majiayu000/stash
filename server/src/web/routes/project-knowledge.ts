import { Hono } from 'hono';
import type { ProjectKnowledgeService } from '../../domain/project-knowledge/service.js';
import { handleError } from '../errors.js';
import {
  CreateDecisionBody,
  CreateLessonBody,
  CreateMilestoneBody,
  ListLessonsQuery,
  SetIntentBody,
  SetNotesBody,
  UpdateDecisionBody,
  UpdateLessonBody,
  UpdateMilestoneBody,
} from '../schemas.js';

/**
 * Project-scoped knowledge under /api/projects/:projectId/{intent,milestones,decisions,notes}.
 */
export function createProjectKnowledgeRouter(service: ProjectKnowledgeService): Hono {
  const r = new Hono();

  // ─── intent ─────────────────────────────────────────────────────────────

  r.get('/:projectId/intent', (c) => {
    try {
      const intent = service.getIntent(c.req.param('projectId'));
      return c.json({ data: intent });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.put('/:projectId/intent', async (c) => {
    try {
      const body = SetIntentBody.parse(await c.req.json());
      const intent = service.setIntent(c.req.param('projectId'), body.text);
      return c.json({ data: intent });
    } catch (e) {
      return handleError(c, e);
    }
  });

  // ─── milestones ─────────────────────────────────────────────────────────

  r.get('/:projectId/milestones', (c) => {
    try {
      return c.json({ data: service.listMilestones(c.req.param('projectId')) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/:projectId/milestones', async (c) => {
    try {
      const body = CreateMilestoneBody.parse(await c.req.json());
      const m = service.createMilestone(c.req.param('projectId'), body);
      return c.json({ data: m }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.patch('/:projectId/milestones/:milestoneId', async (c) => {
    try {
      const body = UpdateMilestoneBody.parse(await c.req.json());
      const m = service.updateMilestone(c.req.param('milestoneId'), body);
      return c.json({ data: m });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.delete('/:projectId/milestones/:milestoneId', (c) => {
    try {
      service.deleteMilestone(c.req.param('milestoneId'));
      return c.body(null, 204);
    } catch (e) {
      return handleError(c, e);
    }
  });

  // ─── decisions ──────────────────────────────────────────────────────────

  r.get('/:projectId/decisions', (c) => {
    try {
      return c.json({ data: service.listDecisions(c.req.param('projectId')) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/:projectId/decisions', async (c) => {
    try {
      const body = CreateDecisionBody.parse(await c.req.json());
      const d = service.createDecision(c.req.param('projectId'), body);
      return c.json({ data: d }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.patch('/:projectId/decisions/:decisionId', async (c) => {
    try {
      const body = UpdateDecisionBody.parse(await c.req.json());
      const d = service.updateDecision(c.req.param('decisionId'), body);
      return c.json({ data: d });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.delete('/:projectId/decisions/:decisionId', (c) => {
    try {
      service.deleteDecision(c.req.param('decisionId'));
      return c.body(null, 204);
    } catch (e) {
      return handleError(c, e);
    }
  });

  // ─── notes ──────────────────────────────────────────────────────────────

  r.get('/:projectId/notes', (c) => {
    try {
      return c.json({ data: service.getNotes(c.req.param('projectId')) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.put('/:projectId/notes', async (c) => {
    try {
      const body = SetNotesBody.parse(await c.req.json());
      const n = service.setNotes(c.req.param('projectId'), body.markdown);
      return c.json({ data: n });
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}

/**
 * Lessons live at /api/lessons (cross-project by default) with optional
 * projectId filtering. Some lessons are scoped to a single project, but
 * the SPEC keeps them mounted at the top level so cross-search is cheap.
 */
export function createLessonsRouter(service: ProjectKnowledgeService): Hono {
  const r = new Hono();

  r.get('/', (c) => {
    try {
      const q = ListLessonsQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams));
      return c.json({ data: service.listLessons(q) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/', async (c) => {
    try {
      const body = CreateLessonBody.parse(await c.req.json());
      const l = service.createLesson(body);
      return c.json({ data: l }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.patch('/:id', async (c) => {
    try {
      const body = UpdateLessonBody.parse(await c.req.json());
      const l = service.updateLesson(c.req.param('id'), body);
      return c.json({ data: l });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.delete('/:id', (c) => {
    try {
      service.deleteLesson(c.req.param('id'));
      return c.body(null, 204);
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
