import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { BurnPricingCoverage, BurnSnapshot } from '@stash/shared';
import { getBurnSnapshot } from '../../api/analytics';
import { deleteModelRate, getModelRates, upsertModelRate } from '../../api/model-rates';
import { WorkbenchDialogProvider } from '../../components/ui/workbench-dialogs';
import { ModelRatesPanel } from './settings.model-rates';

vi.mock('../../api/analytics', () => ({
  getBurnSnapshot: vi.fn(),
  getBudgetSpendSnapshot: vi.fn(),
  getWeeklySnapshot: vi.fn(),
}));

vi.mock('../../api/model-rates', () => ({
  getModelRates: vi.fn(),
  upsertModelRate: vi.fn(),
  deleteModelRate: vi.fn(),
}));

function burn(pricing: BurnPricingCoverage): BurnSnapshot {
  return {
    calendar: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-07T00:00:00.000Z', startDate: '2026-08-01', endDateExclusive: '2026-08-07', timeZone: 'UTC' },
    totals: { tokens: 2_000_000, cost: 0, sessions: 1 },
    dailySpend: [],
    hourlyHeatmap: [],
    modelMix: [],
    perProjectLeaderboard: [],
    pricing,
  } as unknown as BurnSnapshot;
}

function renderPanel() {
  return render(
    <WorkbenchDialogProvider>
      <ModelRatesPanel />
    </WorkbenchDialogProvider>,
  );
}

describe('ModelRatesPanel', () => {
  beforeEach(() => {
    vi.mocked(getModelRates).mockReset();
    vi.mocked(upsertModelRate).mockReset();
    vi.mocked(deleteModelRate).mockReset();
    vi.mocked(getBurnSnapshot).mockReset();
  });

  test('lists the unpriced models from history with a way to price each one', async () => {
    vi.mocked(getModelRates).mockResolvedValue({ overrides: [], effective: [] });
    vi.mocked(getBurnSnapshot).mockResolvedValue(
      burn({ unknownModels: ['k3', 'qwen3.8-max-preview'], unpricedTokens: 2_000_000 }),
    );

    renderPanel();

    expect(await screen.findByText('qwen3.8-max-preview')).toBeInTheDocument();
    expect(screen.getByText('k3')).toBeInTheDocument();
    expect(screen.getByText(/2 models in your history with no rate/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'add rate' })).toHaveLength(2);
  });

  test('offers no suggested price — the rate field starts empty', async () => {
    vi.mocked(getModelRates).mockResolvedValue({ overrides: [], effective: [] });
    vi.mocked(getBurnSnapshot).mockResolvedValue(
      burn({ unknownModels: ['k3'], unpricedTokens: 1_000 }),
    );

    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'add rate' }));

    // A guessed price is exactly what #144 removed; the user supplies it.
    const field = await screen.findByLabelText(/input \$\/M/i);
    expect(field).toHaveValue('');
  });

  test('a priced model drops off the unpriced list', async () => {
    vi.mocked(getModelRates).mockResolvedValue({
      overrides: [{ model: 'k3', inputPerM: 1, outputPerM: 2, createdAt: 'x', updatedAt: 'x' }],
      effective: [{ model: 'k3', inputPerM: 1, outputPerM: 2 }],
    });
    vi.mocked(getBurnSnapshot).mockResolvedValue(
      burn({ unknownModels: ['k3'], unpricedTokens: 1_000 }),
    );

    renderPanel();

    await waitFor(() => expect(screen.getByText('$1 / $2 per M')).toBeInTheDocument());
    expect(screen.queryByText(/in your history with no rate/)).not.toBeInTheDocument();
  });

  test('keeps the rate list usable when the history scan fails', async () => {
    vi.mocked(getModelRates).mockResolvedValue({
      overrides: [{ model: 'k3', inputPerM: 1, outputPerM: 2, createdAt: 'x', updatedAt: 'x' }],
      effective: [{ model: 'k3', inputPerM: 1, outputPerM: 2 }],
    });
    vi.mocked(getBurnSnapshot).mockRejectedValue(new Error('scan failed'));

    renderPanel();

    expect(await screen.findByText(/could not read usage history/)).toBeInTheDocument();
    expect(screen.getByText('k3')).toBeInTheDocument();
  });

  test('says what deleting a rate means before doing it', async () => {
    vi.mocked(getModelRates).mockResolvedValue({
      overrides: [{ model: 'k3', inputPerM: 1, outputPerM: 2, createdAt: 'x', updatedAt: 'x' }],
      effective: [{ model: 'k3', inputPerM: 1, outputPerM: 2 }],
    });
    vi.mocked(getBurnSnapshot).mockResolvedValue(burn({ unknownModels: [], unpricedTokens: 0 }));

    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'delete' }));

    expect(await screen.findByText(/goes back to unpriced/)).toBeInTheDocument();
    expect(screen.getByText(/not counted as \$0/)).toBeInTheDocument();
    expect(deleteModelRate).not.toHaveBeenCalled();
  });
});
