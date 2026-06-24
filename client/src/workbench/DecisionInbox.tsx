import { useEffect, useMemo, useState } from 'react';
import type { AiGenerationRun, DecisionDraft, Priority } from '@stash/shared';
import {
  acceptDecisionDrafts,
  listDecisionDrafts,
  rejectDecisionDraft,
} from '../api/ai-drafts';
import { importMeetingTriage } from '../api/meeting-triage';

interface DraftEdit {
  selected: boolean;
  title: string;
  description: string;
  priority: Priority;
  labels: string;
}

export function DecisionInbox({ reload }: { reload: () => void }) {
  const [drafts, setDrafts] = useState<DecisionDraft[]>([]);
  const [runs, setRuns] = useState<AiGenerationRun[]>([]);
  const [edits, setEdits] = useState<Record<string, DraftEdit>>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meetingText, setMeetingText] = useState('');

  async function loadDecisionDrafts(options: { openAfter?: boolean } = {}) {
    try {
      const res = await listDecisionDrafts({ status: 'draft' });
      setDrafts(res.data);
      setRuns(res.runs);
      setEdits((current) => {
        const next: Record<string, DraftEdit> = {};
        for (const draft of res.data) next[draft.id] = current[draft.id] ?? editFromDraft(draft);
        return next;
      });
      if (options.openAfter && res.data.length > 0) setOpen(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void loadDecisionDrafts(); }, []);

  useEffect(() => {
    function onDrafts() { void loadDecisionDrafts({ openAfter: true }); }
    window.addEventListener('stash:decision-drafts', onDrafts);
    return () => window.removeEventListener('stash:decision-drafts', onDrafts);
  }, []);

  const selected = drafts.filter((draft) => edits[draft.id]?.selected);
  const autoAcceptDrafts = drafts.filter(canAutoAdoptDraft);
  const runMap = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);

  function patchEdit(id: string, patch: Partial<DraftEdit>) {
    setEdits((current) => ({
      ...current,
      [id]: { ...current[id], ...patch } as DraftEdit,
    }));
  }

  async function acceptDraftTargets(targets: DecisionDraft[]) {
    if (targets.length === 0 || busy) return;
    setBusy('accept');
    try {
      for (const [runId, group] of groupByRun(targets)) {
        await acceptDecisionDrafts(runId, {
          sourceIdeaStatus: group.some((draft) => draft.sourceKind === 'idea_decomposition') ? 'planned' : undefined,
          drafts: group.map((draft) => acceptInput(draft, edits[draft.id] ?? editFromDraft(draft))),
        });
      }
      await loadDecisionDrafts();
      reload();
      window.dispatchEvent(new CustomEvent('stash:captured'));
      if (targets.length === drafts.length) setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function discard(targets: DecisionDraft[]) {
    if (targets.length === 0 || busy) return;
    setBusy('discard');
    try {
      for (const draft of targets) await rejectDecisionDraft(draft.id, 'discarded in Decision Inbox');
      await loadDecisionDrafts();
      if (targets.length === drafts.length) setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function importMeeting() {
    const text = meetingText.trim();
    if (!text || busy) return;
    setBusy('meeting');
    setError(null);
    try {
      await importMeetingTriage({ text });
      setMeetingText('');
      await loadDecisionDrafts({ openAfter: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className="decision-inbox-affordance"
        data-testid="decision-inbox-button"
        onClick={() => setOpen(true)}
      >
        <span>AI drafts</span>
        <strong>{drafts.length}</strong>
      </button>

      {open && (
        <div className="decision-inbox-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <section
            className="decision-inbox-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Decision Inbox"
            data-testid="decision-inbox-dialog"
          >
            <header className="decision-inbox-header">
              <div>
                <div className="decision-inbox-eyebrow">Decision Inbox</div>
                <h2>{drafts.length} pending AI draft{drafts.length === 1 ? '' : 's'}</h2>
              </div>
              <button className="decision-icon-btn" type="button" onClick={() => setOpen(false)} aria-label="close Decision Inbox">×</button>
            </header>

            {error && <div className="decision-inbox-error" role="status">{error}</div>}

            <div className="meeting-import" data-testid="meeting-import">
              <textarea
                value={meetingText}
                onChange={(e) => setMeetingText(e.currentTarget.value)}
                placeholder="paste meeting notes"
                data-testid="meeting-import-text"
              />
              <button type="button" onClick={importMeeting} disabled={!meetingText.trim() || !!busy} data-testid="meeting-import-submit">
                import meeting
              </button>
            </div>

            <div className="decision-inbox-list">
              {drafts.map((draft) => {
                const edit = edits[draft.id] ?? editFromDraft(draft);
                const run = runMap.get(draft.runId);
                return (
                  <article key={draft.id} className="decision-draft-card" data-testid="decision-draft-card">
                    <label className="decision-draft-check">
                      <input
                        type="checkbox"
                        checked={edit.selected}
                        onChange={(e) => patchEdit(draft.id, { selected: e.currentTarget.checked })}
                      />
                      <span>{draft.sourceKind.replace('_', ' ')}</span>
                    </label>
                    <input
                      className="decision-draft-title"
                      data-testid="decision-draft-title"
                      value={edit.title}
                      onChange={(e) => patchEdit(draft.id, { title: e.currentTarget.value })}
                    />
                    <textarea
                      className="decision-draft-description"
                      value={edit.description}
                      onChange={(e) => patchEdit(draft.id, { description: e.currentTarget.value })}
                      placeholder="description"
                    />
                    <div className="decision-draft-row">
                      <select
                        value={edit.priority}
                        onChange={(e) => patchEdit(draft.id, { priority: e.currentTarget.value as Priority })}
                        aria-label="priority"
                      >
                        <option value="p0">p0</option>
                        <option value="p1">p1</option>
                        <option value="p2">p2</option>
                        <option value="p3">p3</option>
                      </select>
                      <input
                        value={edit.labels}
                        onChange={(e) => patchEdit(draft.id, { labels: e.currentTarget.value })}
                        placeholder="labels"
                        aria-label="labels"
                      />
                      <span>{run?.provider ?? 'provider'} · {run?.status ?? 'draft'}</span>
                    </div>
                    {draft.sourceSpans.length > 0 && (
                      <div className="decision-source-spans" data-testid="decision-source-spans">
                        {draft.sourceSpans.map((span, index) => (
                          <mark key={`${draft.id}-${index}`}>{span.label ? `${span.label}: ` : ''}{span.text}</mark>
                        ))}
                      </div>
                    )}
                    {draft.reviewFlags.length > 0 && (
                      <div className="decision-review-flags" data-testid="decision-review-flags">
                        {draft.reviewFlags.map((flag) => <span key={flag}>{flag.replaceAll('_', ' ')}</span>)}
                        {draft.reviewReason && <em>{draft.reviewReason}</em>}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <footer className="decision-inbox-actions">
              <button type="button" onClick={() => discard(selected)} disabled={selected.length === 0 || !!busy}>
                discard selected
              </button>
              <button type="button" onClick={() => acceptDraftTargets(selected)} disabled={selected.length === 0 || !!busy}>
                accept selected
              </button>
              <button type="button" className="primary" onClick={() => acceptDraftTargets(autoAcceptDrafts)} disabled={autoAcceptDrafts.length === 0 || !!busy}>
                {autoAcceptDrafts.length === drafts.length ? 'accept all' : 'accept safe'}
              </button>
            </footer>
          </section>
        </div>
      )}

      <style>{decisionInboxStyles}</style>
    </>
  );
}

function editFromDraft(draft: DecisionDraft): DraftEdit {
  return {
    selected: true,
    title: draft.proposedTitle,
    description: draft.proposedDescription ?? '',
    priority: draft.proposedPriority,
    labels: draft.proposedLabels.join(', '),
  };
}

function groupByRun(drafts: DecisionDraft[]): Array<[string, DecisionDraft[]]> {
  const grouped = new Map<string, DecisionDraft[]>();
  for (const draft of drafts) grouped.set(draft.runId, [...(grouped.get(draft.runId) ?? []), draft]);
  return Array.from(grouped.entries());
}

function acceptInput(draft: DecisionDraft, edit: DraftEdit) {
  return {
    draftId: draft.id,
    title: edit.title.trim(),
    description: edit.description.trim() || undefined,
    priority: edit.priority,
    labels: edit.labels.split(',').map((label) => label.trim()).filter(Boolean),
  };
}

function canAutoAdoptDraft(draft: DecisionDraft): boolean {
  return !draft.reviewFlags.includes('high_risk') && !draft.reviewFlags.includes('unclear');
}

const decisionInboxStyles = `
  .decision-inbox-affordance {
    position: fixed;
    left: 24px;
    bottom: 24px;
    z-index: 70;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid rgba(0, 255, 242, 0.35);
    background: rgba(5, 9, 20, 0.92);
    color: var(--text-primary);
    font: 700 0.72rem var(--font-mono);
    cursor: pointer;
    box-shadow: var(--glow-cyan);
  }
  .decision-inbox-affordance strong {
    min-width: 22px;
    height: 22px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    background: var(--neon-cyan);
    color: var(--bg-void);
  }
  .decision-inbox-overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(1, 4, 12, 0.72);
    backdrop-filter: blur(12px);
  }
  .decision-inbox-panel {
    width: min(880px, calc(100vw - 32px));
    max-height: min(760px, calc(100vh - 32px));
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(0, 255, 242, 0.22);
    border-radius: 8px;
    background: rgba(5, 9, 20, 0.96);
    box-shadow: var(--glow-purple);
    color: var(--text-primary);
    overflow: hidden;
  }
  .decision-inbox-header,
  .decision-inbox-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-hair);
  }
  .decision-inbox-actions {
    justify-content: flex-end;
    border-top: 1px solid var(--border-hair);
    border-bottom: 0;
  }
  .decision-inbox-eyebrow {
    color: var(--neon-cyan);
    font: 700 0.66rem var(--font-mono);
    text-transform: uppercase;
  }
  .decision-inbox-header h2 {
    margin: 3px 0 0;
    font-size: 1rem;
    line-height: 1.3;
  }
  .decision-icon-btn,
  .decision-inbox-actions button {
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: rgba(255,255,255,0.03);
    color: var(--text-primary);
    font: 700 0.72rem var(--font-mono);
    padding: 7px 10px;
    cursor: pointer;
  }
  .decision-inbox-actions .primary {
    background: var(--neon-cyan);
    color: var(--bg-void);
    border-color: var(--neon-cyan);
  }
  .decision-inbox-actions button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .decision-inbox-error {
    margin: 12px 16px 0;
    padding: 8px 10px;
    border: 1px solid rgba(255, 69, 149, 0.35);
    color: var(--neon-pink);
    font: 0.72rem var(--font-mono);
  }
  .decision-inbox-list {
    overflow: auto;
    padding: 14px 16px;
    display: grid;
    gap: 10px;
  }
  .meeting-import {
    margin: 12px 16px 0;
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr auto;
    align-items: end;
  }
  .meeting-import textarea {
    min-height: 72px;
    resize: vertical;
    border: 1px solid var(--border-hair);
    border-radius: 6px;
    background: rgba(0,0,0,0.18);
    color: var(--text-primary);
    padding: 8px 10px;
    font: 0.78rem var(--font-body);
  }
  .meeting-import button {
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: rgba(255,255,255,0.03);
    color: var(--text-primary);
    font: 700 0.72rem var(--font-mono);
    padding: 8px 10px;
    cursor: pointer;
  }
  .decision-draft-card {
    border: 1px solid var(--border-hair);
    border-radius: 8px;
    background: rgba(255,255,255,0.025);
    padding: 10px;
    display: grid;
    gap: 8px;
  }
  .decision-draft-check,
  .decision-draft-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    font: 0.68rem var(--font-mono);
  }
  .decision-draft-title,
  .decision-draft-description,
  .decision-draft-row input,
  .decision-draft-row select {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border-hair);
    border-radius: 6px;
    background: rgba(0,0,0,0.18);
    color: var(--text-primary);
    font: 0.78rem var(--font-mono);
    padding: 7px 8px;
  }
  .decision-draft-description {
    min-height: 64px;
    resize: vertical;
    font-family: var(--font-body);
    line-height: 1.45;
  }
  .decision-draft-row select {
    max-width: 88px;
  }
  .decision-source-spans {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .decision-source-spans mark {
    border: 1px solid rgba(191,90,242,0.26);
    border-radius: 5px;
    background: rgba(191,90,242,0.08);
    color: var(--text-secondary);
    padding: 4px 6px;
    font: 0.68rem var(--font-mono);
  }
  .decision-review-flags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font: 0.68rem var(--font-mono);
  }
  .decision-review-flags span {
    border: 1px solid rgba(255, 159, 10, 0.35);
    border-radius: 5px;
    color: var(--neon-orange);
    padding: 3px 6px;
    background: rgba(255, 159, 10, 0.08);
  }
  .decision-review-flags em {
    font-style: normal;
  }
`;
