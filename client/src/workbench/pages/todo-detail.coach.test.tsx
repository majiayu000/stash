import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { WorkItem } from '@stash/shared';
import { TaskCoachPanel } from './todo-detail.coach';
import { askCoach, listCoachMessages } from '../../api/work-item-coach';

vi.mock('../../api/work-item-coach', () => ({
  listCoachMessages: vi.fn(),
  askCoach: vi.fn(),
  summarizeCoach: vi.fn(),
  applyCoachSummary: vi.fn(),
}));

const item: WorkItem = {
  id: 'task-1',
  title: 'Coach this task',
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
  createdAt: '2026-06-24T00:00:00.000Z',
  updatedAt: '2026-06-24T00:00:00.000Z',
};

describe('TaskCoachPanel', () => {
  test('Enter does not submit while IME composition is active', async () => {
    vi.mocked(listCoachMessages).mockResolvedValue([]);
    vi.mocked(askCoach).mockResolvedValue({
      userMessage: {
        id: 'm-user',
        workItemId: item.id,
        role: 'user',
        purpose: 'chat',
        body: 'next step',
        createdAt: item.createdAt,
      },
      assistantMessage: {
        id: 'm-assistant',
        workItemId: item.id,
        role: 'assistant',
        purpose: 'chat',
        body: 'do the next step',
        createdAt: item.createdAt,
      },
      run: {
        id: 'run-1',
        feature: 'task_coach',
        sourceKind: 'task_coach',
        sourceWorkItemId: item.id,
        provider: 'mock',
        model: 'mock',
        promptHash: 'hash',
        status: 'succeeded',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
      suggestedActions: [],
    });

    render(<TaskCoachPanel item={item} onApplied={vi.fn()} onFlash={vi.fn()} />);
    const input = await screen.findByTestId('coach-input');
    fireEvent.change(input, { target: { value: 'next step' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(askCoach).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', isComposing: false });
    await waitFor(() => expect(askCoach).toHaveBeenCalledWith(item.id, 'next step'));
  });
});
