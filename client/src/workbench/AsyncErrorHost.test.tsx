import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AsyncErrorHost } from './AsyncErrorHost';
import { reportAsyncError } from './reportAsyncError';

describe('AsyncErrorHost', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows scope and message, then dismisses one error', () => {
    render(<AsyncErrorHost />);

    act(() => reportAsyncError('load budgets', new Error('budget service unavailable')));

    expect(screen.getByRole('alert')).toHaveTextContent('load budgets');
    expect(screen.getByRole('alert')).toHaveTextContent('budget service unavailable');

    fireEvent.click(screen.getByRole('button', { name: 'dismiss load budgets' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('deduplicates by scope and keeps only the three newest scopes', () => {
    render(<AsyncErrorHost />);

    act(() => {
      reportAsyncError('scope one', new Error('old one'));
      reportAsyncError('scope two', new Error('two'));
      reportAsyncError('scope one', new Error('new one'));
      reportAsyncError('scope three', new Error('three'));
      reportAsyncError('scope four', new Error('four'));
    });

    expect(screen.queryByText('old one')).not.toBeInTheDocument();
    expect(screen.queryByText('two')).not.toBeInTheDocument();
    expect(screen.getByText('new one')).toBeInTheDocument();
    expect(screen.getByText('three')).toBeInTheDocument();
    expect(screen.getByText('four')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(3);
  });

  test('keeps three long alerts in a bounded scrollable stack', () => {
    const { container } = render(<AsyncErrorHost />);
    const longMessage = 'long failure detail '.repeat(40);

    act(() => {
      reportAsyncError('long scope one', new Error(longMessage));
      reportAsyncError('long scope two', new Error(longMessage));
      reportAsyncError('long scope three', new Error(longMessage));
    });

    expect(screen.getAllByRole('alert')).toHaveLength(3);
    const stylesheet = Array.from(container.querySelectorAll('style'))
      .map((style) => style.textContent)
      .join('\n');
    expect(stylesheet).toContain('max-height: min(70vh, 560px)');
    expect(stylesheet).toContain('overflow-y: auto');
    expect(stylesheet).toContain('overscroll-behavior: contain');
  });

  test('runs a safe retry once and removes the resolved error', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    render(<AsyncErrorHost />);
    act(() => reportAsyncError('load prompt', new Error('compose failed'), retry));

    const retryButton = screen.getByRole('button', { name: 'retry load prompt' });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    expect(retry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('compose failed')).not.toBeInTheDocument());
  });

  test('keeps a newer error emitted while an older retry is in flight', async () => {
    let resolveRetry: (() => void) | undefined;
    const retry = vi.fn(() => new Promise<void>((resolve) => { resolveRetry = resolve; }));
    render(<AsyncErrorHost />);
    act(() => reportAsyncError('load prompt', new Error('first failure'), retry));

    fireEvent.click(screen.getByRole('button', { name: 'retry load prompt' }));
    act(() => reportAsyncError('load prompt', new Error('retry still failed')));
    act(() => resolveRetry?.());

    await waitFor(() => expect(screen.getByText('retry still failed')).toBeInTheDocument());
    expect(screen.queryByText('first failure')).not.toBeInTheDocument();
  });

  test('turns an unexpected retry rejection into the current visible message', async () => {
    const retry = vi.fn().mockRejectedValue(new Error('retry crashed'));
    render(<AsyncErrorHost />);
    act(() => reportAsyncError('load prompt', new Error('compose failed'), retry));

    fireEvent.click(screen.getByRole('button', { name: 'retry load prompt' }));

    expect(await screen.findByText('retry crashed')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('load prompt');
  });
});
