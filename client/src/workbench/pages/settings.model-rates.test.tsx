import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { BudgetSpendSnapshot, BurnPricingCoverage } from '@stash/shared';
import { getBudgetSpendSnapshot, invalidate_weekly_snapshot_cache } from '../../api/analytics';
import { deleteModelRate, getModelRates, upsertModelRate } from '../../api/model-rates';
import { WorkbenchDialogProvider } from '../../components/ui/workbench-dialogs';
import { ModelRatesPanel } from './settings.model-rates';

vi.mock('../../api/analytics', () => ({
  getBurnSnapshot: vi.fn(),
  getBudgetSpendSnapshot: vi.fn(),
  getWeeklySnapshot: vi.fn(),
  invalidate_weekly_snapshot_cache: vi.fn(),
}));

vi.mock('../../api/model-rates', () => ({
  getModelRates: vi.fn(),
  upsertModelRate: vi.fn(),
  deleteModelRate: vi.fn(),
}));

function budgetSpend(pricing: BurnPricingCoverage): BudgetSpendSnapshot {
  return {
    calendar: { timeZone: 'UTC', generatedAt: '2026-08-07T00:00:00.000Z' },
    periods: {},
    pricing,
  } as unknown as BudgetSpendSnapshot;
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
    vi.mocked(getBudgetSpendSnapshot).mockReset();
    vi.mocked(invalidate_weekly_snapshot_cache).mockReset();
  });

  test('lists the unpriced models from history with a way to price each one', async () => {
    vi.mocked(getModelRates).mockResolvedValue({ overrides: [], effective: [] });
    vi.mocked(getBudgetSpendSnapshot).mockResolvedValue(
      budgetSpend({ unknownModels: ['k3', 'qwen3.8-max-preview'], unpricedTokens: 2_000_000 }),
    );

    renderPanel();

    expect(await screen.findByText('qwen3.8-max-preview')).toBeInTheDocument();
    expect(screen.getByText('k3')).toBeInTheDocument();
    expect(screen.getByText(/2 models in your history with no rate/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'add rate' })).toHaveLength(2);
  });

  test('offers no suggested price — the rate field starts empty', async () => {
    vi.mocked(getModelRates).mockResolvedValue({ overrides: [], effective: [] });
    vi.mocked(getBudgetSpendSnapshot).mockResolvedValue(
      budgetSpend({ unknownModels: ['k3'], unpricedTokens: 1_000 }),
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
    vi.mocked(getBudgetSpendSnapshot).mockResolvedValue(
      budgetSpend({ unknownModels: [], unpricedTokens: 0 }),
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
    vi.mocked(getBudgetSpendSnapshot).mockRejectedValue(new Error('scan failed'));

    renderPanel();

    expect(await screen.findByText(/could not read usage history/)).toBeInTheDocument();
    expect(screen.getByText('k3')).toBeInTheDocument();
  });

  test('says what deleting a rate means before doing it', async () => {
    vi.mocked(getModelRates).mockResolvedValue({
      overrides: [{ model: 'k3', inputPerM: 1, outputPerM: 2, createdAt: 'x', updatedAt: 'x' }],
      effective: [{ model: 'k3', inputPerM: 1, outputPerM: 2 }],
    });
    vi.mocked(getBudgetSpendSnapshot).mockResolvedValue(budgetSpend({ unknownModels: [], unpricedTokens: 0 }));

    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'delete' }));

    expect(await screen.findByText(/goes back to unpriced/)).toBeInTheDocument();
    expect(screen.getByText(/not counted as \$0/)).toBeInTheDocument();
    expect(deleteModelRate).not.toHaveBeenCalled();
  });

  test('rejects an empty required rate instead of coercing it to free', async () => {
    vi.mocked(getModelRates).mockResolvedValue({ overrides: [], effective: [] });
    vi.mocked(getBudgetSpendSnapshot).mockResolvedValue(
      budgetSpend({ unknownModels: ['k3'], unpricedTokens: 1_000 }),
    );

    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'add rate' }));
    await userEvent.click(screen.getByRole('button', { name: 'next' }));

    expect(await screen.findByText(/input rate is required/i)).toBeInTheDocument();
    expect(upsertModelRate).not.toHaveBeenCalled();
  });

  test('collects cache prices, normalizes dated ids, and invalidates weekly analytics', async () => {
    vi.mocked(getModelRates)
      .mockResolvedValueOnce({ overrides: [], effective: [] })
      .mockResolvedValueOnce({
        overrides: [{
          model: 'deepseek-v4', inputPerM: 1, outputPerM: 2,
          cacheReadPerM: 0.1, cacheWritePerM: 1.25, createdAt: 'x', updatedAt: 'x',
        }],
        effective: [],
      });
    vi.mocked(getBudgetSpendSnapshot)
      .mockResolvedValueOnce(budgetSpend({ unknownModels: ['deepseek-v4-20260401'], unpricedTokens: 1_000 }))
      .mockResolvedValueOnce(budgetSpend({ unknownModels: [], unpricedTokens: 0 }));
    vi.mocked(upsertModelRate).mockResolvedValue({
      model: 'deepseek-v4', inputPerM: 1, outputPerM: 2,
      cacheReadPerM: 0.1, cacheWritePerM: 1.25, createdAt: 'x', updatedAt: 'x',
    });

    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'add rate' }));
    for (const [label, value, button] of [
      [/input \$\/M/i, '1', 'next'],
      [/output \$\/M/i, '2', 'next'],
      [/cache read \$\/M/i, '0.1', 'next'],
      [/cache write \$\/M/i, '1.25', 'save rate'],
    ] as const) {
      await userEvent.type(await screen.findByLabelText(label), value);
      await userEvent.click(screen.getByRole('button', { name: button }));
    }

    await waitFor(() => expect(upsertModelRate).toHaveBeenCalledWith({
      model: 'deepseek-v4',
      inputPerM: 1,
      outputPerM: 2,
      cacheReadPerM: 0.1,
      cacheWritePerM: 1.25,
    }));
    expect(invalidate_weekly_snapshot_cache).toHaveBeenCalledTimes(1);
  });

  test('describes deleting a shipped override as restoring the shipped rate', async () => {
    vi.mocked(getModelRates).mockResolvedValue({
      overrides: [{ model: 'gpt-5', inputPerM: 1, outputPerM: 2, createdAt: 'x', updatedAt: 'x' }],
      effective: [],
    });
    vi.mocked(getBudgetSpendSnapshot).mockResolvedValue(budgetSpend({ unknownModels: [], unpricedTokens: 0 }));

    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'delete' }));

    expect(await screen.findByText(/restores the shipped rate/i)).toBeInTheDocument();
    expect(screen.queryByText(/goes back to unpriced/i)).not.toBeInTheDocument();
  });
});
