import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AgentSession, AgentSessionEvent, AgentSessionEventPage } from '@stash/shared';
import { getAgentSession, getAgentSessionEvents } from '../../api/agent-sessions';
import { SessionDetailPage, EmptyTranscript, EstimatedSessionMetrics, formatToolCallDetails, RealTranscript } from './SessionDetailPage';
import type { WBData, WBSession } from '../data';

vi.mock('../../api/agent-sessions', () => ({
  getAgentSession: vi.fn(),
  getAgentSessionEvents: vi.fn(),
}));

function session(overrides: Partial<WBSession> = {}): WBSession {
  return {
    id: 'codex-fixture-1',
    provider: 'codex',
    project: '/Users/test/demo-codex',
    model: 'gpt-5',
    tool: 'codex',
    state: 'done',
    title: 'codex session',
    preview: '',
    estimatedTokens: 0,
    estimatedCost: 0,
    estimatedDuration: 60,
    at: Date.now(),
    ...overrides,
  };
}

function agentSession(value = session()): AgentSession {
  return {
    id: value.id,
    provider: value.provider,
    sourcePath: `/tmp/${value.provider}/${value.id}.jsonl`,
    cwd: value.project,
    projectId: value.project,
    status: 'completed',
    title: value.title,
    lastMessage: value.preview,
    filesTouched: [],
    toolCount: 0,
    messageCount: 0,
    model: value.model,
    lastActiveAt: new Date(value.at).toISOString(),
  };
}

function eventPage(
  data: AgentSessionEvent[],
  nextCursor: string | null = null,
): AgentSessionEventPage {
  return {
    data,
    page: {
      cursor: null,
      nextCursor,
      hasMore: nextCursor !== null,
      limit: 100,
      totalEvents: data.length,
      responseBytes: 100,
    },
    summary: {
      totalToolCalls: data.filter((event) => event.kind === 'tool_call').length,
      totalFiles: 0,
      toolCalls: [],
      filesTouched: [],
    },
  };
}

function renderSessionDetailPage(
  sessionValue = session(),
  route = `/sessions/${sessionValue.provider}/${sessionValue.id}`,
  dataSessions: WBSession[] = [sessionValue],
) {
  const data: WBData = {
    runtime: { timeZone: 'UTC', calendarDate: '2026-07-11', now: '2026-07-11T00:00:00.000Z' },
    projects: [],
    sessions: dataSessions,
    todos: [],
    sourceErrors: [],
    stats: {
      activeSessions: 0,
      totalEstimatedTokens: sessionValue.estimatedTokens,
      totalEstimatedCost: sessionValue.estimatedCost,
      projects: 0,
      todosOpen: 0,
      todosDone: 0,
    },
  };
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/sessions/:provider/:sessionId" element={<SessionDetailPage data={data} reload={vi.fn()} />} />
        <Route path="/sessions/:sessionId" element={<SessionDetailPage data={data} reload={vi.fn()} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAgentSession).mockImplementation(async (_provider, _id) => ({
    ...agentSession(),
    linkedWorkItemIds: [],
  }));
  vi.mocked(getAgentSessionEvents).mockResolvedValue(eventPage([]));
});

describe('SessionDetailPage real transcript', () => {
  test('renders a truthful empty state without demo evidence', () => {
    render(<EmptyTranscript />);

    expect(screen.getByTestId('empty-session-events')).toHaveTextContent('no real events available');
    expect(screen.queryByText(/src\/auth\/oauth\.ts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/edit_file/)).not.toBeInTheDocument();
    expect(screen.queryByText(/FAIL/)).not.toBeInTheDocument();
  });

  test('routes an empty events response through the truthful empty state', async () => {
    vi.mocked(getAgentSessionEvents).mockResolvedValue(eventPage([]));
    renderSessionDetailPage();

    expect(await screen.findByTestId('empty-session-events')).toBeInTheDocument();
    expect(screen.queryByText(/src\/auth\/oauth\.ts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/edit_file/)).not.toBeInTheDocument();
  });

  test('keeps event load failures distinct from an empty session', async () => {
    vi.mocked(getAgentSessionEvents).mockRejectedValue(new Error('events unavailable'));
    renderSessionDetailPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('events unavailable');
    expect(screen.queryByTestId('empty-session-events')).not.toBeInTheDocument();
  });

  test('fetches a provider-qualified session even when it is outside the recent list', async () => {
    renderSessionDetailPage(session(), '/sessions/codex/codex-fixture-1', []);

    expect(await screen.findByText('codex session')).toBeInTheDocument();
    expect(getAgentSession).toHaveBeenCalledWith('codex', 'codex-fixture-1');
  });

  test('shows provider choices when a legacy ID is ambiguous', async () => {
    vi.mocked(getAgentSession).mockImplementation(async (provider, id) => ({
      ...agentSession(session({ id, provider, tool: provider === 'codex' ? 'codex' : 'claude-code' })),
      linkedWorkItemIds: [],
    }));
    renderSessionDetailPage(session(), '/sessions/shared-id', []);

    expect(await screen.findByText('This ID exists in multiple providers.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open claude/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open codex/ })).toBeInTheDocument();
  });

  test('appends transcript pages and pairs a call with output across the boundary', async () => {
    const user = userEvent.setup();
    const call: AgentSessionEvent = {
      kind: 'tool_call',
      text: 'exec_command',
      tool: 'exec_command',
      timestamp: '2026-05-14T08:00:10.000Z',
      callId: 'call_1',
      meta: { cmd: 'pwd' },
    };
    const output: AgentSessionEvent = {
      kind: 'tool_output',
      text: '/tmp/demo',
      timestamp: '2026-05-14T08:00:11.000Z',
      callId: 'call_1',
    };
    vi.mocked(getAgentSessionEvents)
      .mockResolvedValueOnce(eventPage([call], 'djE6MQ'))
      .mockResolvedValueOnce(eventPage([output]));
    renderSessionDetailPage();

    await user.click(await screen.findByRole('button', { name: 'load more transcript' }));
    const callButton = screen.getByRole('button', { name: /exec_command/ });
    await user.click(callButton);

    expect(screen.getByText(/\/tmp\/demo/)).toBeInTheDocument();
    expect(getAgentSessionEvents).toHaveBeenLastCalledWith(
      'codex',
      'codex-fixture-1',
      'djE6MQ',
    );
  });

  test('labels all activity-derived session metrics as estimates', () => {
    render(<EstimatedSessionMetrics session={session({ estimatedTokens: 640, estimatedCost: 0.008, estimatedDuration: 90 })} />);

    const metrics = screen.getByTestId('estimated-session-metrics');
    expect(metrics).toHaveTextContent('estimated from activity counts');
    expect(metrics).toHaveTextContent('estimated tokens');
    expect(metrics).toHaveTextContent('estimated cost');
    expect(metrics).toHaveTextContent('estimated duration');
    expect(metrics).not.toHaveTextContent('24h');
    expect(metrics).not.toHaveTextContent('composition');
  });

  test('formats tool-call arguments and paired output', () => {
    const call: AgentSessionEvent = {
      kind: 'tool_call',
      text: 'exec_command',
      tool: 'exec_command',
      timestamp: '2026-05-14T08:00:10.000Z',
      callId: 'call_1',
      meta: { cmd: 'pwd', workdir: '/tmp/demo' },
    };
    const output: AgentSessionEvent = {
      kind: 'tool_output',
      text: 'Output:\n/tmp/demo\n',
      timestamp: '2026-05-14T08:00:11.000Z',
      callId: 'call_1',
    };

    expect(formatToolCallDetails(call, output)).toContain('"cmd": "pwd"');
    expect(formatToolCallDetails(call, output)).toContain('/tmp/demo');
    expect(formatToolCallDetails({ ...call, truncated: true }, output))
      .toContain('event truncated to the transcript response limit');
  });

  test('expands a Codex tool call to reveal parsed details', async () => {
    const user = userEvent.setup();
    const events: AgentSessionEvent[] = [
      {
        kind: 'tool_call',
        text: 'exec_command',
        tool: 'exec_command',
        timestamp: '2026-05-14T08:00:10.000Z',
        callId: 'call_1',
        meta: { cmd: 'pwd', workdir: '/tmp/demo' },
      },
      {
        kind: 'tool_output',
        text: 'Chunk ID: abc\nOutput:\n/tmp/demo\n',
        timestamp: '2026-05-14T08:00:11.000Z',
        callId: 'call_1',
      },
    ];

    render(<RealTranscript events={events} session={session()} />);

    const button = screen.getByRole('button', { name: /exec_command/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Chunk ID: abc/)).not.toBeInTheDocument();

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/"cmd": "pwd"/)).toBeInTheDocument();
    expect(screen.getByText(/Chunk ID: abc/)).toBeInTheDocument();
  });

  test('pairs batched Codex tool outputs by call id', async () => {
    const user = userEvent.setup();
    const events: AgentSessionEvent[] = [
      {
        kind: 'tool_call',
        text: 'exec_command',
        tool: 'exec_command',
        timestamp: '2026-05-14T08:00:10.000Z',
        callId: 'call_1',
        meta: { cmd: 'pwd' },
      },
      {
        kind: 'tool_call',
        text: 'exec_command',
        tool: 'exec_command',
        timestamp: '2026-05-14T08:00:10.100Z',
        callId: 'call_2',
        meta: { cmd: 'ls' },
      },
      {
        kind: 'tool_output',
        text: 'first output',
        timestamp: '2026-05-14T08:00:11.000Z',
        callId: 'call_1',
      },
      {
        kind: 'tool_output',
        text: 'second output',
        timestamp: '2026-05-14T08:00:11.100Z',
        callId: 'call_2',
      },
    ];

    render(<RealTranscript events={events} session={session()} />);

    expect(screen.queryByText(/first output/)).not.toBeInTheDocument();
    expect(screen.queryByText(/second output/)).not.toBeInTheDocument();

    const buttons = screen.getAllByRole('button', { name: /exec_command/ });
    await user.click(buttons[0]!);

    expect(screen.getByText(/"cmd": "pwd"/)).toBeInTheDocument();
    expect(screen.getByText(/first output/)).toBeInTheDocument();
    expect(screen.queryByText(/second output/)).not.toBeInTheDocument();

    await user.click(buttons[1]!);

    expect(screen.getByText(/"cmd": "ls"/)).toBeInTheDocument();
    expect(screen.getByText(/second output/)).toBeInTheDocument();
  });
});
