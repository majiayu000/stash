import { describe, expect, test } from 'vitest';
import { shouldOpenQuickCapture, shouldSubmitQuickCapture } from './keyboard';

describe('quick capture keyboard helpers', () => {
  test('plain c opens quick capture outside editable targets', () => {
    expect(shouldOpenQuickCapture({ key: 'c', target: document.body })).toBe(true);
  });

  test('modified c and editable targets do not open quick capture', () => {
    const input = document.createElement('input');
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');

    expect(shouldOpenQuickCapture({ key: 'c', metaKey: true, target: document.body })).toBe(false);
    expect(shouldOpenQuickCapture({ key: 'c', target: input })).toBe(false);
    expect(shouldOpenQuickCapture({ key: 'c', target: editor })).toBe(false);
  });

  test('IME composition blocks the global shortcut', () => {
    expect(shouldOpenQuickCapture({ key: 'c', isComposing: true, target: document.body })).toBe(false);
    expect(shouldOpenQuickCapture({ key: 'Process', target: document.body })).toBe(false);
  });

  test('Enter submits only outside IME composition', () => {
    expect(shouldSubmitQuickCapture({ key: 'Enter' })).toBe(true);
    expect(shouldSubmitQuickCapture({ key: 'Enter', isComposing: true })).toBe(false);
    expect(shouldSubmitQuickCapture({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(false);
    expect(shouldSubmitQuickCapture({ key: 'Process' })).toBe(false);
  });
});
