interface KeyboardLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  target?: EventTarget | null;
  nativeEvent?: {
    isComposing?: boolean;
  };
}

export function isComposingKeyEvent(event: KeyboardLike): boolean {
  return event.isComposing === true || event.nativeEvent?.isComposing === true || event.key === 'Process';
}

export function isTextEditingTarget(target: EventTarget | null | undefined): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    target.isContentEditable ||
    target.getAttribute('contenteditable') === 'true'
  );
}

export function shouldOpenQuickCapture(event: KeyboardLike): boolean {
  if (isComposingKeyEvent(event)) return false;
  if (isTextEditingTarget(event.target)) return false;
  return event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function shouldSubmitQuickCapture(event: KeyboardLike): boolean {
  return event.key === 'Enter' && !isComposingKeyEvent(event);
}
