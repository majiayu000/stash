import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import type { AgentSessionEvent } from '@stash/shared';
import { EmptyTranscript, EstimatedSessionMetrics, formatToolCallDetails, RealTranscript } from './ConceptG';
import type { WBSession } from '../data';

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

describe('ConceptG real transcript', () => {
  test('renders a truthful empty state without demo evidence', () => {
    render(<EmptyTranscript />);

    expect(screen.getByTestId('empty-session-events')).toHaveTextContent('no real events available');
    expect(screen.queryByText(/src\/auth\/oauth\.ts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/edit_file/)).not.toBeInTheDocument();
    expect(screen.queryByText(/FAIL/)).not.toBeInTheDocument();
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
