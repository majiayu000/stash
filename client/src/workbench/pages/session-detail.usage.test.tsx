import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionUsageSummary } from '@stash/shared';
import { getAgentSessionUsage } from '../../api/agent-sessions';
import type { WBSession } from '../data';
import { SessionUsageMetrics } from './session-detail.usage';

vi.mock('../../api/agent-sessions', () => ({
  getAgentSession: vi.fn(),
  getAgentSessionEvents: vi.fn(),
  getAgentSessionUsage: vi.fn(),
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

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

function usage(overrides: Partial<SessionUsageSummary> = {}): SessionUsageSummary {
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
    sessionLastActiveAt: new Date(Date.now() - 6 * 60_000).toISOString(),
    sessionStatus: 'idle',
    ...overrides,
  };
}

function renderMetrics(currentSession: WBSession = session()) {
  return render(
    <SessionUsageMetrics provider="codex" sessionId="codex-fixture-1" session={currentSession} />,
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

  test('shows a measured-usage error with a working retry', async () => {
    vi.mocked(getAgentSessionUsage)
      .mockRejectedValueOnce(new Error('scan failed'))
      .mockResolvedValueOnce(usage());

    renderMetrics();

    const error = await screen.findByTestId('load-error-panel');
    expect(error).toHaveTextContent('measured session usage failed to load');
    expect(screen.queryByTestId('estimated-session-metrics')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));

    expect(await screen.findByTestId('measured-session-metrics')).toHaveTextContent('$4.50');
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

  test('renders cache-only usage as measured billable activity', async () => {
    vi.mocked(getAgentSessionUsage).mockResolvedValue(usage({
      totals: {
        inputTokens: 0, outputTokens: 0,
        cacheReadTokens: 250_000, cacheWriteTokens: 50_000,
        tokens: 0, cost: 0.25,
      },
      modelMix: [{ model: 'gpt-5', tokens: 0, cost: 0.25 }],
    }));

    renderMetrics();

    const metrics = await screen.findByTestId('measured-session-metrics');
    expect(metrics).toHaveTextContent('$0.25');
    expect(metrics).toHaveTextContent(/cache read/);
    expect(metrics).toHaveTextContent(/cache write/);
    expect(metrics).not.toHaveTextContent('no token usage recorded');
  });

  test('preserves a fully priced sub-cent cost instead of rounding it to zero', async () => {
    vi.mocked(getAgentSessionUsage).mockResolvedValue(usage({
      totals: {
        inputTokens: 1_000, outputTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0,
        tokens: 1_000, cost: 0.004,
      },
      modelMix: [{ model: 'gpt-5', tokens: 1_000, cost: 0.004 }],
    }));

    renderMetrics();

    const metrics = await screen.findByTestId('measured-session-metrics');
    expect(metrics).toHaveTextContent('< $0.01');
    expect(metrics).not.toHaveTextContent('$0.00');
  });

  test('labels cache-only usage as unpriced when no cache rate exists', async () => {
    vi.mocked(getAgentSessionUsage).mockResolvedValue(usage({
      totals: {
        inputTokens: 0, outputTokens: 0,
        cacheReadTokens: 250_000, cacheWriteTokens: 0,
        tokens: 0, cost: 0,
      },
      modelMix: [{ model: 'k3', tokens: 0, cost: undefined }],
      pricing: { unknownModels: ['k3'], unpricedTokens: 250_000 },
    }));

    renderMetrics();

    const metrics = await screen.findByTestId('measured-session-metrics');
    expect(metrics).toHaveTextContent('unpriced');
    expect(metrics).toHaveTextContent('250.0k tokens excluded from cost');
    expect(metrics).not.toHaveTextContent('≥ $0.00');
  });

  test('never rounds an extremely small positive partial cost to zero', async () => {
    vi.mocked(getAgentSessionUsage).mockResolvedValue(usage({
      totals: {
        inputTokens: 1, outputTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0,
        tokens: 1, cost: 1e-9,
      },
      modelMix: [
        { model: 'gpt-5', tokens: 1, cost: 1e-9 },
        { model: 'k3', tokens: 0, cost: undefined },
      ],
      pricing: { unknownModels: ['k3'], unpricedTokens: 1 },
    }));

    renderMetrics();

    const metrics = await screen.findByTestId('measured-session-metrics');
    expect(metrics).toHaveTextContent('≥ $1.00e-9');
    expect(metrics).not.toHaveTextContent('≥ $0.00000000');
  });

  test.each([
    [0.009999, '≥ $0.0099'],
    [1.999, '≥ $1.99'],
    [9.999e-9, '≥ $9.99e-9'],
    [0.049999999999999996, '≥ $0.04'],
    [1.0099999999999998e-9, '≥ $1.00e-9'],
  ])('never rounds the known cost floor %s upward', async (cost, expected) => {
    vi.mocked(getAgentSessionUsage).mockResolvedValue(usage({
      totals: {
        inputTokens: 1, outputTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0,
        tokens: 1, cost,
      },
      modelMix: [
        { model: 'gpt-5', tokens: 1, cost },
        { model: 'k3', tokens: 0, cost: undefined },
      ],
      pricing: { unknownModels: ['k3'], unpricedTokens: 1 },
    }));

    renderMetrics();

    expect(await screen.findByTestId('measured-session-metrics')).toHaveTextContent(expected);
  });

  test('keeps polling an explicitly live session past five minutes and stops when it completes', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getAgentSessionUsage)
        .mockResolvedValueOnce(usage({
          sessionLastActiveAt: new Date(Date.now() - 6 * 60_000).toISOString(),
          sessionStatus: 'idle',
        }))
        .mockResolvedValueOnce(usage({
          totals: {
            inputTokens: 1_100_000, outputTokens: 200_000,
            cacheReadTokens: 0, cacheWriteTokens: 0,
            tokens: 1_300_000, cost: 6,
          },
          modelMix: [{ model: 'gpt-5', tokens: 1_300_000, cost: 6 }],
          sessionLastActiveAt: new Date(Date.now() - 6 * 60_000).toISOString(),
          sessionStatus: 'completed',
        }));

      renderMetrics({ ...session(), state: 'live' });
      await act(async () => { await Promise.resolve(); });
      expect(getAgentSessionUsage).toHaveBeenCalledTimes(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

      expect(getAgentSessionUsage).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('measured-session-metrics')).toHaveTextContent('$6.00');

      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(getAgentSessionUsage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('preserves measured usage and automatically retries after a live refresh fails', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getAgentSessionUsage)
        .mockResolvedValueOnce(usage({ sessionLastActiveAt: new Date().toISOString() }))
        .mockRejectedValueOnce(new Error('refresh failed'))
        .mockResolvedValueOnce(usage({
          totals: {
            inputTokens: 1_100_000, outputTokens: 200_000,
            cacheReadTokens: 0, cacheWriteTokens: 0,
            tokens: 1_300_000, cost: 6,
          },
          modelMix: [{ model: 'gpt-5', tokens: 1_300_000, cost: 6 }],
        }));

      renderMetrics({ ...session(), state: 'live' });
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

      expect(screen.getByTestId('measured-session-metrics')).toHaveTextContent('$4.50');
      expect(screen.getByTestId('load-error-panel')).toHaveTextContent('refresh failed');

      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

      expect(getAgentSessionUsage).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId('measured-session-metrics')).toHaveTextContent('$6.00');
      expect(screen.queryByTestId('load-error-panel')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('stops retrying stale status after refresh failures cross the lost threshold', async () => {
    vi.useFakeTimers();
    try {
      const last_active_at = new Date(Date.now() - 29 * 60_000).toISOString();
      vi.mocked(getAgentSessionUsage)
        .mockResolvedValueOnce(usage({ sessionLastActiveAt: last_active_at, sessionStatus: 'idle' }))
        .mockRejectedValue(new Error('refresh failed'));

      renderMetrics({ ...session(), state: 'live' });
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });

      const calls_after_cutoff = vi.mocked(getAgentSessionUsage).mock.calls.length;
      expect(calls_after_cutoff).toBeGreaterThan(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
      expect(getAgentSessionUsage).toHaveBeenCalledTimes(calls_after_cutoff);
    } finally {
      vi.useRealTimers();
    }
  });

  test('applies the activity cutoff when an older API omits sessionStatus', async () => {
    vi.useFakeTimers();
    try {
      const without_status = {
        ...usage({ sessionLastActiveAt: new Date().toISOString() }),
        sessionStatus: undefined,
      } as unknown as SessionUsageSummary;
      vi.mocked(getAgentSessionUsage).mockResolvedValue(without_status);

      renderMetrics({ ...session(), state: 'live' });
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60_000); });

      const calls_after_cutoff = vi.mocked(getAgentSessionUsage).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(getAgentSessionUsage).toHaveBeenCalledTimes(calls_after_cutoff);
    } finally {
      vi.useRealTimers();
    }
  });

  test('keeps polling when a manual retry of a live refresh also fails', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getAgentSessionUsage)
        .mockResolvedValueOnce(usage({ sessionLastActiveAt: new Date().toISOString() }))
        .mockRejectedValueOnce(new Error('automatic refresh failed'))
        .mockRejectedValueOnce(new Error('manual refresh failed'))
        .mockResolvedValueOnce(usage({
          totals: {
            inputTokens: 1_100_000, outputTokens: 200_000,
            cacheReadTokens: 0, cacheWriteTokens: 0,
            tokens: 1_300_000, cost: 6,
          },
          modelMix: [{ model: 'gpt-5', tokens: 1_300_000, cost: 6 }],
        }));

      renderMetrics({ ...session(), state: 'live' });
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

      fireEvent.click(screen.getByRole('button', { name: 'retry' }));
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByTestId('load-error-panel')).toHaveTextContent('manual refresh failed');

      // The second consecutive failure backs off to a 30-second retry.
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

      expect(getAgentSessionUsage).toHaveBeenCalledTimes(4);
      expect(screen.getByTestId('measured-session-metrics')).toHaveTextContent('$6.00');
      expect(screen.queryByTestId('load-error-panel')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not expose manual retry while an automatic retry is in flight', async () => {
    vi.useFakeTimers();
    try {
      const retry_request = deferred<SessionUsageSummary>();
      vi.mocked(getAgentSessionUsage)
        .mockResolvedValueOnce(usage({ sessionLastActiveAt: new Date().toISOString() }))
        .mockRejectedValueOnce(new Error('refresh failed'))
        .mockReturnValueOnce(retry_request.promise);

      renderMetrics({ ...session(), state: 'live' });
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();

      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

      expect(getAgentSessionUsage).toHaveBeenCalledTimes(3);
      expect(screen.queryByRole('button', { name: 'retry' })).not.toBeInTheDocument();

      await act(async () => retry_request.resolve(usage()));
      expect(screen.queryByTestId('load-error-panel')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
