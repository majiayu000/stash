import type { AgentSessionEvent } from '@stash/shared';

/**
 * SPEC v0.3 §3h — extract decision candidates from a session's events.
 *
 * Pure function. Returns the candidate phrases — caller decides whether to
 * insert as `confidence='pending'` decisions in the knowledge backend.
 *
 * Regex-only, no LLM dependency. Sentences matching the common decision
 * markers are normalised, deduped, and trimmed.
 */
export interface DecisionCandidate {
  /** Original line from the session. */
  raw: string;
  /** Short title extracted from the line. */
  title: string;
  /** ISO timestamp of the source event. */
  timestamp: string;
}

const MARKERS = [
  /\b(?:we|i)\s+(?:decided|are\s+going)\s+to\s+(.+?)(?:[.!?\n]|$)/i,
  /\b(?:we|i)\s+(?:chose|went\s+with|picked)\s+(.+?)(?:[.!?\n]|$)/i,
  /\b(?:let'?s\s+go\s+with|going\s+with|we'?ll\s+use|using)\s+(.+?)(?:[.!?\n]|$)/i,
  /\b(?:settling|landed)\s+on\s+(.+?)(?:[.!?\n]|$)/i,
  /\b(?:rejected|ruling\s+out)\s+(.+?)(?:[.!?\n]|$)/i,
];

export function extractDecisions(events: AgentSessionEvent[]): DecisionCandidate[] {
  const out: DecisionCandidate[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.kind !== 'assistant' && ev.kind !== 'user') continue;
    const lines = ev.text.split(/\n/);
    for (const line of lines) {
      for (const re of MARKERS) {
        const m = re.exec(line);
        if (!m || !m[1]) continue;
        const titleRaw = m[1].trim().replace(/[*_`]/g, '');
        const title = titleRaw.length > 90 ? titleRaw.slice(0, 87) + '…' : titleRaw;
        const key = title.toLowerCase();
        if (!title || seen.has(key)) continue;
        seen.add(key);
        out.push({ raw: line.trim(), title, timestamp: ev.timestamp });
      }
    }
  }
  return out;
}
