import { useEffect, useState } from 'react';
import type {
  AiWriteDestination,
  CoachApplySummaryResponse,
  WorkItem,
  WorkItemCoachMessage,
} from '@stash/shared';
import {
  applyCoachSummary,
  askCoach,
  listCoachMessages,
  summarizeCoach,
} from '../../api/work-item-coach';
import { isComposingKeyEvent } from '../keyboard';

export function TaskCoachPanel({
  item,
  onApplied,
  onFlash,
}: {
  item: WorkItem | null;
  onApplied: (result: CoachApplySummaryResponse) => void;
  onFlash: (message: string) => void;
}) {
  const [messages, setMessages] = useState<WorkItemCoachMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [destination, setDestination] = useState<AiWriteDestination>('journal');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!item) {
      setMessages([]);
      return () => { cancelled = true; };
    }
    listCoachMessages(item.id)
      .then((rows) => { if (!cancelled) setMessages(rows); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [item?.id]);

  if (!item || item.kind === 'idea') return null;

  async function submitQuestion() {
    if (!item || busy) return;
    const body = draft.trim();
    if (!body) return;
    setBusy('ask');
    setError(null);
    setDraft('');
    try {
      const result = await askCoach(item.id, body);
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
    } catch (e) {
      setDraft(body);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function summarize(destinationOverride = destination) {
    if (!item || busy || messages.length === 0) return;
    setBusy('summary');
    setError(null);
    try {
      const result = await summarizeCoach(item.id, destinationOverride);
      setDestination(result.destination);
      setMessages((current) => [...current, result.message]);
      onFlash('summary ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function applySummary(message: WorkItemCoachMessage) {
    if (!item || !message.runId || busy) return;
    setBusy('apply');
    setError(null);
    try {
      const result = await applyCoachSummary(item.id, {
        runId: message.runId,
        sourceMessageId: message.id,
        destination,
      });
      onApplied(result);
      onFlash(destination === 'journal' ? '+ coach journal' : '+ coach description');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const pendingSummary = [...messages].reverse().find((message) => message.purpose === 'summary');

  return (
    <div className="td-section td-coach" data-testid="task-coach-panel">
      <div className="td-section-label">
        <span>task coach</span>
        <select
          value={destination}
          onChange={(e) => setDestination(e.currentTarget.value as AiWriteDestination)}
          aria-label="summary destination"
        >
          <option value="journal">journal</option>
          <option value="description">description</option>
        </select>
      </div>
      <div className="td-coach-messages">
        {messages.length === 0 ? (
          <div className="td-coach-empty">ask for a next step or summarize the current thread when it exists.</div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`td-coach-message ${message.role} ${message.purpose}`}>
              <span>{message.purpose === 'summary' ? 'summary' : message.role}</span>
              <p>{message.body}</p>
              {message.purpose === 'summary' && (
                <button
                  type="button"
                  onClick={() => applySummary(message)}
                  disabled={!!busy}
                  data-testid="coach-apply-summary"
                >
                  append
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !isComposingKeyEvent(e)) {
            e.preventDefault();
            void submitQuestion();
          }
        }}
        placeholder="ask for a next action"
        data-testid="coach-input"
      />
      {error && <div className="td-coach-error" role="status">{error}</div>}
      <div className="td-coach-actions">
        <button type="button" onClick={submitQuestion} disabled={!draft.trim() || !!busy} data-testid="coach-send">
          send
        </button>
        <button type="button" onClick={() => summarize()} disabled={messages.length === 0 || !!busy} data-testid="coach-summarize">
          summarize
        </button>
        {pendingSummary && (
          <button type="button" onClick={() => applySummary(pendingSummary)} disabled={!!busy}>
            append latest
          </button>
        )}
      </div>
    </div>
  );
}
