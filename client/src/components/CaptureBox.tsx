import { useState } from 'react';

export interface CaptureBoxProps {
  placeholder?: string;
  onCapture: (text: string) => Promise<void> | void;
  buttonLabel?: string;
}

export function CaptureBox({
  placeholder = 'Capture an idea, reminder, or task. Project is optional.',
  onCapture,
  buttonLabel = 'Save to Inbox',
}: CaptureBoxProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onCapture(trimmed);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        data-testid="capture-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="input min-h-[86px] resize-y leading-snug"
      />
      <button
        type="button"
        data-testid="capture-submit"
        className="btn-primary"
        disabled={busy || !text.trim()}
        onClick={submit}
      >
        {busy ? 'Saving…' : buttonLabel}
      </button>
    </div>
  );
}
