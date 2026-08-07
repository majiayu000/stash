import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { UsageSummary } from '@stash/shared';
import { getAgentSessionUsage } from '../../api/agent-sessions';
import type { WBSession } from '../data';
import { SessionUsageMetrics } from './session-detail.usage';

vi.mock('../../api/agent-sessions', () => ({
  getAgentSession: vi.fn(),
  getAgentSessionEvents: vi.fn(),
  getAgentSessionUsage: vi.fn(),
}));

function session(): WBSession {
  return {
    id: 'codex-fixture-1',
    provider: 'codex',
    project: '/Users/test/demo-codex',
    model: 'gpt-5',
    tool: 'codex',
    state: 'done',
    title: 'codex session',
    preview: '',
    estimatedTokens: 640,
    estimatedDuration: 90,
    at: Date.now(),
  };
}

function usage(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    totals: {
      inputTokens: 900_000,
      outputTokens: 100_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      tokens: 1_000_000,
      cost: 4.5,
    },
    modelMix: [{ model: 'gpt-5', tokens: 1_000_000, cost: 4.5 }],
    pricing: { unknownModels: [], unpricedTokens: 0 },
    ...overrides,
  };
}

function renderMetrics() {
  return render(
    <SessionUsageMetrics provider="codex" sessionId="codex-fixture-1" session={session()} />,
  );
}

describe('SessionUsageMetrics', () => {
  beforeEach(() => {
    vi.mocked(getAgentSessionUsage).mockReset();
  });

  test('shows measured tokens and cost once usage resolves', async () => {
    vi.mocked(getAgentSessionUsage).mockResolvedValue(usage());

    renderMetrics();

    const metrics = await screen.findByTestId('measured-session-metrics');
    expect(metrics).toHaveTextContent('measured from session usage');
    expect(metrics).toHaveTextContent('$4.50');
    // A fully priced session states the cost outright, with no floor marker.
    expect(metrics).not.toHaveTextContent('≥ $');
    expect(metrics).not.toHaveTextContent('no rate');
  });

  test('marks the cost as a floor and names the unpriced model', async () => {
    vi.mocked(getAgentSessionUsage).mockResolvedValue(usage({
      totals: {
        inputTokens: 1_500_000, outputTokens: 500_000,
        cacheReadTokens: 0, cacheWriteTokens: 0,
        tokens: 2_000_000, cost: 4.5,
      },
      modelMix: [
        { model: 'gpt-5', tokens: 1_000_000, cost: 4.5 },
        { model: 'k3', tokens: 1_000_000, cost: undefined },
      ],
      pricing: { unknownModels: ['k3'], unpricedTokens: 1_000_000 },
    }));

    renderMetrics();

    const metrics = await screen.findByTestId('measured-session-metrics');
    expect(metrics).toHaveTextContent('≥ $4.50');
    expect(metrics).toHaveTextContent('no rate');
    expect(metrics).toHaveTextContent(/no rate for k3/);
    expect(metrics).toHaveTextContent(/Settings → model rates/);
  });

  test('falls back to activity estimates when the usage read fails', async () => {
    vi.mocked(getAgentSessionUsage).mockRejectedValue(new Error('scan failed'));

    renderMetrics();

    const metrics = await screen.findByTestId('estimated-session-metrics');
    expect(metrics).toHaveTextContent('measured usage unavailable');
    expect(metrics).toHaveTextContent('estimated tokens');
    // A failed read must not read as a session that cost nothing.
    expect(metrics).not.toHaveTextContent('$');
  });

  test('a session with no recorded usage says so instead of showing $0.00', async () => {
    vi.mocked(getAgentSessionUsage).mockResolvedValue(usage({
      totals: {
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
        tokens: 0, cost: 0,
      },
      modelMix: [],
    }));

    renderMetrics();

    const metrics = await screen.findByTestId('measured-session-metrics');
    expect(metrics).toHaveTextContent('no token usage recorded');
    expect(metrics).not.toHaveTextContent('$0.00');
  });

  test('reports cache traffic when the session used any', async () => {
    vi.mocked(getAgentSessionUsage).mockResolvedValue(usage({
      totals: {
        inputTokens: 900_000, outputTokens: 100_000,
        cacheReadTokens: 250_000, cacheWriteTokens: 50_000,
        tokens: 1_000_000, cost: 4.5,
      },
    }));

    renderMetrics();

    const metrics = await screen.findByTestId('measured-session-metrics');
    expect(metrics).toHaveTextContent(/cache read/);
    expect(metrics).toHaveTextContent(/cache write/);
  });
});
