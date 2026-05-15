import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkItem } from '@stash/shared';
import { TaskRow } from './TaskRow';

const baseItem: WorkItem = {
  id: 'wi1',
  title: 'fix oauth callback',
  kind: 'task',
  status: 'planned',
  priority: 'p1',
  source: 'manual',
  confidence: 'explicit',
  assignee: 'human',
  labels: ['oauth', 'security'],
  checklist: [],
  links: [],
  areaId: 'AI tooling',
  scheduledFor: '2026-05-14',
  createdAt: '2026-05-14T10:00:00Z',
  updatedAt: '2026-05-14T10:00:00Z',
};

describe('TaskRow', () => {
  test('renders title, area, priority, scheduled date, and status pill', () => {
    render(<TaskRow item={baseItem} />);
    expect(screen.getByText('fix oauth callback')).toBeInTheDocument();
    expect(screen.getByText('AI tooling')).toBeInTheDocument();
    expect(screen.getByText('p1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-14')).toBeInTheDocument();
    expect(screen.getByText('planned')).toBeInTheDocument();
  });

  test('fires onSelect when title clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TaskRow item={baseItem} onSelect={onSelect} />);
    await user.click(screen.getByText('fix oauth callback'));
    expect(onSelect).toHaveBeenCalledWith('wi1');
  });

  test('fires onToggleDone when checkbox clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<TaskRow item={baseItem} onToggleDone={onToggle} />);
    await user.click(screen.getByRole('button', { name: /mark done/i }));
    expect(onToggle).toHaveBeenCalledWith('wi1');
  });

  test('shows "no project" when projectId missing', () => {
    render(<TaskRow item={baseItem} />);
    expect(screen.getByText(/no project/)).toBeInTheDocument();
  });
});
