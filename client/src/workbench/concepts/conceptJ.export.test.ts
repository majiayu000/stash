import { describe, expect, test } from 'vitest';
import type { WeeklySnapshot, WorkItem } from '@stash/shared';
import { buildWeeklyReviewMarkdown } from './conceptJ.export';

describe('Concept J markdown export', () => {
  test('includes completed work, stale work, and next-week plan', () => {
    const markdown = buildWeeklyReviewMarkdown({
      week: weekly,
      projects: [{ id: 'area-1', name: 'Aurora' }],
      doneItems: [
        item({ id: 'done-1', title: 'Ship weekly review actions', status: 'done', areaId: 'area-1' }),
      ],
      staleItems: [
        item({ id: 'stale-1', title: 'Revisit backlog item', status: 'planned', updatedAt: '2026-04-01T08:00:00.000Z' }),
      ],
      nextWeekItems: [
        item({ id: 'next-1', title: 'Draft Monday plan', status: 'planned', priority: 'p1', scheduledFor: '2026-05-18' }),
      ],
    });

    expect(markdown).toContain('# Weekly Review 2026-W20');
    expect(markdown).toContain('Range: 2026-05-11 to 2026-05-17');
    expect(markdown).toContain('### Aurora');
    expect(markdown).toContain('- [x] Ship weekly review actions');
    expect(markdown).toContain('## Stale Work');
    expect(markdown).toContain('- [ ] Revisit backlog item (planned, updated 2026-04-01)');
    expect(markdown).toContain('## Next Week Plan (2026-W21)');
    expect(markdown).toContain('### mon 2026-05-18');
    expect(markdown).toContain('- [ ] Draft Monday plan (p1)');
  });
});

const weekly: WeeklySnapshot = {
  week: '2026-W20',
  rangeStart: '2026-05-11T00:00:00.000Z',
  rangeEnd: '2026-05-18T00:00:00.000Z',
  doneCount: 1,
  focusHours: 4,
  featuresAdvanced: [{ id: 'feat-1', title: 'Weekly review', from: 'planned', to: 'active' }],
  sessionsByDay: [0, 1, 0, 1, 0, 0, 0],
  donePerProject: [{ projectId: 'area-1', projectName: 'Aurora', count: 1 }],
  wow: {
    tokens: { now: 1200, prev: 1000 },
    cost: { now: 1.25, prev: 1 },
    sessions: { now: 2, prev: 1 },
  },
};

function item(input: Partial<WorkItem> & { id: string; title: string }): WorkItem {
  const defaults: Omit<WorkItem, 'id' | 'title'> = {
    kind: 'task',
    status: 'planned',
    priority: 'p2',
    source: 'manual',
    confidence: 'explicit',
    assignee: 'human',
    labels: [],
    checklist: [],
    links: [],
    todayPinned: false,
    createdAt: '2026-05-14T10:00:00.000Z',
    updatedAt: '2026-05-14T10:00:00.000Z',
  };
  return { ...defaults, ...input };
}
