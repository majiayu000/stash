import type { WeeklySnapshot, WorkItem } from '@stash/shared';
import { nextIsoWeekRange } from './weekly-review.week';

export interface WeeklyReviewExportProject {
  id: string;
  name: string;
  emoji?: string;
}

export interface WeeklyReviewMarkdownInput {
  week: WeeklySnapshot;
  doneItems: readonly WorkItem[];
  staleItems: readonly WorkItem[];
  nextWeekItems: readonly WorkItem[];
  projects: readonly WeeklyReviewExportProject[];
}

export function buildWeeklyReviewMarkdown(input: WeeklyReviewMarkdownInput): string {
  const { week, doneItems, staleItems, nextWeekItems, projects } = input;
  const nextWeek = nextIsoWeekRange(week.week);
  const lines: string[] = [
    `# Weekly Review ${week.week}`,
    '',
    `Range: ${week.rangeStart.slice(0, 10)} to ${previousDate(week.rangeEnd)}`,
    '',
    '## Summary',
    `- Todos done: ${week.doneCount}`,
    `- Focus hours: ${week.focusHours}`,
    `- Sessions: ${week.wow.sessions.now} (${deltaLabel(week.wow.sessions.now, week.wow.sessions.prev)} vs previous week)`,
    `- Tokens: ${week.wow.tokens.now} (${deltaLabel(week.wow.tokens.now, week.wow.tokens.prev)} vs previous week)`,
    `- Cost: $${week.wow.cost.now.toFixed(2)} (${deltaLabel(week.wow.cost.now, week.wow.cost.prev)} vs previous week)`,
    '',
    '## Completed Work',
  ];

  const doneGroups = groupByProject(doneItems, projects);
  if (doneGroups.length === 0) {
    lines.push('- No completed work.');
  } else {
    for (const group of doneGroups) {
      lines.push('', `### ${group.projectName}`);
      for (const item of group.items) {
        lines.push(`- [x] ${clean(item.title)}`);
      }
    }
  }

  lines.push('', '## Features Advanced');
  if (week.featuresAdvanced.length === 0) {
    lines.push('- No feature progress recorded.');
  } else {
    for (const feature of week.featuresAdvanced) {
      lines.push(`- ${clean(feature.title)}: ${clean(feature.from)} -> ${clean(feature.to)}`);
    }
  }

  lines.push('', '## Stale Work');
  if (staleItems.length === 0) {
    lines.push('- No stale work.');
  } else {
    for (const item of staleItems) {
      lines.push(`- [ ] ${clean(item.title)} (${item.status}, updated ${item.updatedAt.slice(0, 10)})`);
    }
  }

  lines.push('', `## Next Week Plan (${nextWeek.week})`);
  const byDate = groupByDate(nextWeekItems);
  for (const day of nextWeek.days) {
    lines.push('', `### ${day.label} ${day.isoDate}`);
    const items = byDate.get(day.isoDate) ?? [];
    if (items.length === 0) {
      lines.push('- No planned work.');
    } else {
      for (const item of items) {
        lines.push(`- [ ] ${clean(item.title)} (${item.priority})`);
      }
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function groupByProject(
  items: readonly WorkItem[],
  projects: readonly WeeklyReviewExportProject[],
): Array<{ projectName: string; items: WorkItem[] }> {
  const projectNames = new Map(projects.map((project) => [project.id, `${project.emoji ? `${project.emoji} ` : ''}${project.name}`]));
  const groups = new Map<string, WorkItem[]>();
  for (const item of items) {
    const key = item.areaId ?? item.projectId ?? '__unassigned__';
    const bucket = groups.get(key);
    if (bucket) bucket.push(item); else groups.set(key, [item]);
  }

  return [...groups.entries()]
    .map(([key, groupItems]) => ({
      projectName: projectNames.get(key) ?? 'No project',
      items: [...groupItems].sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));
}

function groupByDate(items: readonly WorkItem[]): Map<string, WorkItem[]> {
  const out = new Map<string, WorkItem[]>();
  for (const item of items) {
    if (!item.scheduledFor) continue;
    const bucket = out.get(item.scheduledFor);
    if (bucket) bucket.push(item); else out.set(item.scheduledFor, [item]);
  }
  for (const [date, itemsForDate] of out.entries()) {
    out.set(date, itemsForDate.sort((a, b) => a.priority.localeCompare(b.priority) || a.title.localeCompare(b.title)));
  }
  return out;
}

function deltaLabel(now: number, prev: number): string {
  const delta = now - prev;
  if (delta === 0) return 'no change';
  return `${delta > 0 ? '+' : ''}${Number.isInteger(delta) ? delta : delta.toFixed(2)}`;
}

function previousDate(exclusiveIso: string): string {
  return new Date(Date.parse(exclusiveIso) - 86_400_000).toISOString().slice(0, 10);
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
