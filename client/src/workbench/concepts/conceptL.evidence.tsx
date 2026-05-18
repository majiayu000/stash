import { useEffect, useState } from 'react';
import type { ProgressEvidence, WorkItem } from '@stash/shared';
import {
  acceptCompletion,
  inferEvidence,
  listEvidence,
  rejectCompletion,
} from '../../api/evidence';

interface UsePendingEvidenceArgs {
  workItemId: string;
  onAccepted: (item: WorkItem) => void;
  onFlash: (msg: string) => void;
  reload: () => void;
}

export interface PendingEvidenceState {
  evidence: ProgressEvidence[];
  scanning: boolean;
  scan: () => Promise<void>;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
}

/**
 * SPEC v0.3 §3i — Pending completion evidence (from the JSONL inference pass)
 * surfaces in the todo-detail view so the user can accept ("this counts as
 * done") or reject ("the agent didn't actually finish this") without
 * leaving the modal.
 */
export function usePendingEvidence(args: UsePendingEvidenceArgs): PendingEvidenceState {
  const { workItemId, onAccepted, onFlash, reload } = args;
  const [evidence, setEvidence] = useState<ProgressEvidence[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listEvidence({ workItemId, pendingOnly: true })
      .then((rows) => { if (!cancelled) setEvidence(rows); })
      .catch(() => { if (!cancelled) setEvidence([]); });
    return () => { cancelled = true; };
  }, [workItemId]);

  async function scan() {
    setScanning(true);
    try {
      const rows = await inferEvidence(workItemId);
      setEvidence(rows);
      onFlash(rows.length === 0 ? 'no signals yet' : `+ ${rows.length} candidate${rows.length === 1 ? '' : 's'}`);
    } catch (e) {
      onFlash(`✕ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScanning(false);
    }
  }

  async function accept() {
    try {
      const updated = await acceptCompletion(workItemId);
      onAccepted(updated);
      setEvidence([]);
      onFlash('✓ marked done from evidence');
      reload();
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (e) {
      onFlash(`✕ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function reject() {
    try {
      const cleared = await rejectCompletion(workItemId);
      setEvidence([]);
      onFlash(cleared > 0 ? `✕ cleared ${cleared} candidate${cleared === 1 ? '' : 's'}` : 'nothing pending');
    } catch (e) {
      onFlash(`✕ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { evidence, scanning, scan, accept, reject };
}

export function EvidencePanel({ state }: { state: PendingEvidenceState }) {
  const { evidence, scanning, scan, accept, reject } = state;

  return (
    <div className="td-section">
      <div className="td-section-label">
        <span>💡 candidates for done</span>
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--neon-cyan)',
            cursor: scanning ? 'default' : 'pointer',
            fontFamily: 'inherit',
            fontSize: '0.72rem',
            opacity: scanning ? 0.6 : 1,
          }}
          data-testid="td-evidence-scan"
        >{scanning ? 'scanning…' : '↻ scan now'}</button>
      </div>
      {evidence.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          no completion signals — linked agent sessions will surface here when an assistant summary mentions finishing this todo.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {evidence.map((e) => (
              <div
                key={e.id}
                style={{
                  padding: '6px 8px',
                  background: 'rgba(0,255,242,0.04)',
                  border: '1px solid rgba(0,255,242,0.15)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.74rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: '0.62rem', color: 'var(--neon-cyan)', textTransform: 'uppercase' }}>{e.kind}</span>
                  {e.provider && (
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{e.provider}</span>
                  )}
                </div>
                <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {e.text}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={accept}
              className="np-btn primary"
              style={{ fontSize: '0.72rem' }}
              data-testid="td-evidence-accept"
            >✓ yes, mark done</button>
            <button
              type="button"
              onClick={reject}
              className="np-btn ghost"
              style={{ fontSize: '0.72rem' }}
              data-testid="td-evidence-reject"
            >✕ not yet</button>
          </div>
        </>
      )}
    </div>
  );
}
