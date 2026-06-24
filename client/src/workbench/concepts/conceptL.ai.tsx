import { useState } from 'react';
import type { WorkItem } from '@stash/shared';
import { decomposeIdea } from '../../api/ai-drafts';

export function IdeaDecomposeAction({
  item,
  onFlash,
}: {
  item: WorkItem | null;
  onFlash: (message: string) => void;
}) {
  const [decomposing, setDecomposing] = useState(false);
  if (!item || item.kind !== 'idea') return null;

  async function runDecompose() {
    if (!item || decomposing) return;
    setDecomposing(true);
    try {
      const result = await decomposeIdea(item.id);
      onFlash(`+ ${result.drafts.length} AI draft${result.drafts.length === 1 ? '' : 's'}`);
      window.dispatchEvent(new CustomEvent('stash:decision-drafts', { detail: { runId: result.run.id } }));
    } catch (e) {
      onFlash(`✕ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDecomposing(false);
    }
  }

  return (
    <button
      className="td-run-btn"
      type="button"
      onClick={runDecompose}
      disabled={decomposing}
      data-testid="td-ai-decompose"
    >
      <span style={{ fontSize: '1.05rem' }}>◇</span>
      <span>{decomposing ? 'decomposing…' : 'decompose into drafts'}</span>
      <span className="td-run-kbd">AI</span>
    </button>
  );
}
