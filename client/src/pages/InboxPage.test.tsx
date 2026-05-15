import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { WorkItem } from '@stash/shared';
import { InboxPage } from './InboxPage';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function setupFetch(initialItems: WorkItem[]) {
  let items: WorkItem[] = [...initialItems];
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    const method = init?.method ?? 'GET';

    if (method === 'GET' && u.includes('/api/work-items?')) {
      return new Response(JSON.stringify({ data: items, count: items.length }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (method === 'POST' && u.endsWith('/api/work-items')) {
      const body = JSON.parse(init!.body as string) as { title: string };
      const created: WorkItem = {
        id: 'wi-' + (items.length + 1),
        title: body.title,
        kind: 'idea',
        status: 'inbox',
        priority: 'p2',
        source: 'manual',
        confidence: 'explicit',
        assignee: 'human',
        labels: [],
        checklist: [],
        links: [],
        createdAt: '2026-05-14T10:00:00Z',
        updatedAt: '2026-05-14T10:00:00Z',
      };
      items = [created, ...items];
      return new Response(JSON.stringify({ data: created }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (method === 'PATCH' && u.match(/\/api\/work-items\/[^/]+$/)) {
      const id = u.split('/').pop()!;
      const patch = JSON.parse(init!.body as string) as Partial<WorkItem>;
      items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
      if (patch.status === 'planned') {
        items = items.filter((i) => i.id !== id); // inbox view excludes it now
      }
      const updated = items.find((i) => i.id === id) ?? { ...initialItems[0]!, ...patch, id };
      return new Response(JSON.stringify({ data: updated }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls, getItems: () => items };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InboxPage', () => {
  test('captures a new inbox item via the CaptureBox', async () => {
    const user = userEvent.setup();
    setupFetch([]);
    render(
      <MemoryRouter>
        <InboxPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByPlaceholderText(/Capture/)).toBeInTheDocument());
    await user.type(screen.getByTestId('capture-input'), 'remember to talk to alex');
    await user.click(screen.getByTestId('capture-submit'));

    await waitFor(() => {
      const list = screen.getByTestId('inbox-list');
      expect(within(list).getByText('remember to talk to alex')).toBeInTheDocument();
    });
  });

  test('Plan today moves an inbox item into a scheduled task', async () => {
    const user = userEvent.setup();
    const initial: WorkItem = {
      id: 'wi-original',
      title: 'design the inbox sidebar',
      kind: 'idea',
      status: 'inbox',
      priority: 'p2',
      source: 'manual',
      confidence: 'explicit',
      assignee: 'human',
      labels: [],
      checklist: [],
      links: [],
      createdAt: '2026-05-14T10:00:00Z',
      updatedAt: '2026-05-14T10:00:00Z',
    };
    setupFetch([initial]);

    render(
      <MemoryRouter>
        <InboxPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const list = screen.getByTestId('inbox-list');
      expect(within(list).getByText('design the inbox sidebar')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('plan-today'));

    await waitFor(() => {
      const list = screen.getByTestId('inbox-list');
      expect(within(list).queryByText('design the inbox sidebar')).not.toBeInTheDocument();
    });
  });
});
