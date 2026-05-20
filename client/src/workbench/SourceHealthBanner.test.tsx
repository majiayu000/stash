import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SourceHealthBanner } from './SourceHealthBanner';

describe('SourceHealthBanner', () => {
  test('renders source scanner failures with retry', async () => {
    const onRetry = vi.fn();
    render(
      <SourceHealthBanner
        errors={[
          { provider: 'codex', sourcePath: '/tmp/broken.jsonl', message: 'invalid json' },
        ]}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Agent source scan issue');
    expect(screen.getByText('/tmp/broken.jsonl')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('renders nothing without errors', () => {
    const { container } = render(<SourceHealthBanner errors={[]} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
