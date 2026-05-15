import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaptureBox } from './CaptureBox';

describe('CaptureBox', () => {
  test('renders placeholder and disables submit when empty', () => {
    render(<CaptureBox onCapture={() => undefined} />);
    expect(screen.getByTestId('capture-input')).toHaveAttribute(
      'placeholder',
      'Capture an idea, reminder, or task. Project is optional.',
    );
    expect(screen.getByTestId('capture-submit')).toBeDisabled();
  });

  test('calls onCapture with trimmed text and clears the input', async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn().mockResolvedValue(undefined);
    render(<CaptureBox onCapture={onCapture} />);

    const input = screen.getByTestId('capture-input');
    await user.type(input, '  fix oauth callback  ');
    await user.click(screen.getByTestId('capture-submit'));

    expect(onCapture).toHaveBeenCalledWith('fix oauth callback');
    expect(input).toHaveValue('');
  });

  test('does not call onCapture for whitespace-only input', async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn();
    render(<CaptureBox onCapture={onCapture} />);

    await user.type(screen.getByTestId('capture-input'), '   ');
    // Submit button stays disabled; even direct click should no-op.
    expect(screen.getByTestId('capture-submit')).toBeDisabled();
    expect(onCapture).not.toHaveBeenCalled();
  });
});
