import { useState, type ReactNode } from 'react';
import type { AgentSessionEvent } from '@stash/shared';
import { fmt, type WBSession } from '../data';
import { ModelBadge, ToolBadge } from '../shared';

/**
 * Transcript rendering for the session detail page: turns, tool calls, and
 * the call/output pairing that decides which events are rendered on their own.
 */

export function EmptyTranscript() {
  return (
    <div
      className="surface"
      data-testid="empty-session-events"
      style={{ padding: '1.25rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
    >
      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>no recorded session events</div>
      <div style={{ marginTop: 6, fontSize: '0.74rem', lineHeight: 1.5 }}>
        This session has no real events available to display.
      </div>
    </div>
  );
}

function Turn({ kind, who, at, children, pending }: { kind: 'user' | 'assistant' | 'thinking' | 'tool'; who?: string; at: string; children?: ReactNode; pending?: boolean }) {
  const ico = kind === 'user' ? '$' : kind === 'assistant' ? '>' : kind === 'thinking' ? '∿' : '·';
  const color = kind === 'user' ? 'var(--neon-green)' : kind === 'assistant' ? 'var(--neon-cyan)' : kind === 'thinking' ? 'var(--neon-purple)' : 'var(--text-muted)';
  return (
    <div className={`td-turn ${kind} ${pending ? 'pending' : ''}`}>
      <div className="td-turn-icon" style={{ color }}>{ico}</div>
      <div className="td-turn-body">
        <div className="td-turn-meta">
          <span style={{ color, fontWeight: 600 }}>{kind === 'thinking' ? 'thinking' : (who || (kind === 'assistant' ? 'agent' : 'agent'))}</span>
          <span style={{ color: 'var(--text-muted)' }}>· {at}</span>
        </div>
        <div className="td-turn-content">{children}</div>
      </div>
    </div>
  );
}

function ToolCall({ name, args, status, lines, plus, minus, collapsed, children }: {
  name: string; args: string; status: 'ok' | 'warn' | 'error';
  lines?: number; plus?: number; minus?: number; collapsed?: boolean; children?: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsed);
  const statusColor = status === 'ok' ? 'var(--neon-green)' : status === 'warn' ? 'var(--neon-orange)' : 'var(--neon-pink)';
  const statusGlyph = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✕';
  return (
    <div className={`td-tool ${open ? 'open' : ''}`}>
      <button className="td-tool-head" onClick={() => setOpen(!open)} type="button" aria-expanded={open}>
        <span className="td-tool-chevron">{open ? '▾' : '▸'}</span>
        <span className="td-tool-name">tool_call</span>
        <span className="td-tool-fn">{name}</span>
        <span className="td-tool-arg">{args}</span>
        <span className="td-tool-status" style={{ color: statusColor }}>{statusGlyph} {status}</span>
        {plus != null && <span style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>+{plus}</span>}
        {minus != null && <span style={{ color: 'var(--neon-pink)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>−{minus}</span>}
        {lines != null && <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{lines} lines</span>}
      </button>
      {open && children && <div className="td-tool-body">{children}</div>}
    </div>
  );
}

/**
 * Real transcript renderer over /events. Maps AgentSessionEvent → existing
 * Turn / ToolCall layout so the design stays intact.
 */
export function RealTranscript({ events, session }: { events: AgentSessionEvent[]; session: WBSession }) {
  const pairedOutputIndexes = findPairedToolOutputIndexes(events);
  return (
    <>
      {events.map((e, i) => {
        if (e.kind === 'tool_call') {
          const argPreview = e.meta ? truncateArgs(e.meta) : '';
          const output = findPairedToolOutput(events, i)?.event;
          const details = formatToolCallDetails(e, output);
          return (
            <ToolCall key={i} name={e.tool ?? e.text} args={argPreview} status="ok" collapsed={Boolean(details)}>
              {details ? <pre className="td-code">{details}</pre> : null}
            </ToolCall>
          );
        }
        if (e.kind === 'tool_output' && pairedOutputIndexes.has(i)) {
          return null;
        }
        const who = e.kind === 'user' ? 'you' : e.kind === 'assistant' ? 'agent' : e.kind;
        const kind: 'user' | 'assistant' | 'thinking' | 'tool' =
          e.kind === 'user' ? 'user' :
            e.kind === 'assistant' ? 'assistant' :
              e.kind === 'plan' ? 'thinking' : 'tool';
        return (
          <Turn key={i} kind={kind} who={who} at={fmt.ago(new Date(e.timestamp).getTime())}>
            {e.text}
            {e.truncated && <div style={{ color: 'var(--neon-orange)' }}>[event truncated to the transcript response limit]</div>}
          </Turn>
        );
      })}
      {session.state === 'live' && (
        <Turn kind="assistant" at="now" pending>
          <p>streaming…<span className="td-cursor">▎</span></p>
        </Turn>
      )}
    </>
  );
}

function findPairedToolOutputIndexes(events: AgentSessionEvent[]): Set<number> {
  const indexes = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event?.kind !== 'tool_call') continue;
    const output = findPairedToolOutput(events, i);
    if (output) indexes.add(output.index);
  }
  return indexes;
}

function findPairedToolOutput(events: AgentSessionEvent[], toolCallIndex: number): { event: AgentSessionEvent; index: number } | undefined {
  const call = events[toolCallIndex];
  if (!call || call.kind !== 'tool_call') return undefined;

  if (call.callId) {
    for (let i = toolCallIndex + 1; i < events.length; i++) {
      const candidate = events[i];
      if (candidate?.kind === 'tool_output' && candidate.callId === call.callId) {
        return { event: candidate, index: i };
      }
    }
    return undefined;
  }

  for (let i = toolCallIndex + 1; i < events.length; i++) {
    const candidate = events[i];
    if (!candidate) continue;
    if (candidate.kind === 'tool_call') return undefined;
    if (candidate.kind !== 'tool_output') continue;
    if (!candidate.callId) {
      return { event: candidate, index: i };
    }
  }
  return undefined;
}

export function formatToolCallDetails(call: AgentSessionEvent, output?: AgentSessionEvent): string {
  const sections: string[] = [];
  if (call.meta && Object.keys(call.meta).length > 0) {
    sections.push(`Arguments:\n${stringifyToolValue(call.meta)}`);
  }
  if (output?.text) {
    sections.push(`Output:\n${output.text.trimEnd()}`);
  }
  if (call.truncated || output?.truncated) sections.push('[event truncated to the transcript response limit]');
  return sections.join('\n\n');
}

function stringifyToolValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateArgs(meta: Record<string, unknown> | undefined): string {
  if (!meta) return '';
  try {
    const s = JSON.stringify(meta);
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  } catch { return ''; }
}
