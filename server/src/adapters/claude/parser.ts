import { readFileSync } from 'fs';
import type { AgentSession, AgentSessionEvent, AgentSessionStatus } from '@stash/shared';

interface RawRecord {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  aiTitle?: string;
  content?: string;
  uuid?: string;
}

interface MessageContentPart {
  type?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const part of content as MessageContentPart[]) {
    if (typeof part === 'string') parts.push(part);
    else if (part?.type === 'text' && typeof part.text === 'string') parts.push(part.text);
  }
  return parts.join('\n');
}

function extractToolUses(content: unknown): MessageContentPart[] {
  if (!Array.isArray(content)) return [];
  return (content as MessageContentPart[]).filter((p) => p?.type === 'tool_use');
}

function pickFilePath(input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;
  const candidate =
    input.file_path ??
    input.filePath ??
    input.path ??
    input.notebook_path ??
    undefined;
  return typeof candidate === 'string' ? candidate : undefined;
}

export interface ClaudeSessionSummary extends AgentSession {}

export interface ParseClaudeOptions {
  sourcePath: string;
  /** Optional explicit sessionId; otherwise inferred from records or filename. */
  fallbackSessionId?: string;
}

export function parseClaudeSession(opts: ParseClaudeOptions): ClaudeSessionSummary {
  const raw = readFileSync(opts.sourcePath, 'utf8');
  const lines = raw.split(/\n+/).filter(Boolean);

  let sessionId = opts.fallbackSessionId ?? '';
  let cwd = '';
  let firstUserContent: string | undefined;
  let lastUserOrAssistant: string | undefined;
  let lastTool: string | undefined;
  let lastToolInput: string | undefined;
  let aiTitle: string | undefined;
  const filesTouched = new Set<string>();
  let toolCount = 0;
  let messageCount = 0;
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;

  for (const line of lines) {
    let rec: RawRecord;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }

    if (!sessionId && rec.sessionId) sessionId = rec.sessionId;
    if (!cwd && rec.cwd) cwd = rec.cwd;
    if (rec.aiTitle && !aiTitle) aiTitle = rec.aiTitle;
    if (rec.timestamp) {
      if (!firstTimestamp || rec.timestamp < firstTimestamp) firstTimestamp = rec.timestamp;
      if (!lastTimestamp || rec.timestamp > lastTimestamp) lastTimestamp = rec.timestamp;
    }

    if (rec.type === 'user' && rec.message?.role === 'user') {
      messageCount++;
      const text = extractText(rec.message.content);
      if (!firstUserContent && text) firstUserContent = text;
      if (text) lastUserOrAssistant = text;
    } else if (rec.type === 'assistant' && rec.message?.role === 'assistant') {
      messageCount++;
      const text = extractText(rec.message.content);
      if (text) lastUserOrAssistant = text;
      const tools = extractToolUses(rec.message.content);
      for (const t of tools) {
        toolCount++;
        if (t.name) lastTool = t.name;
        const path = pickFilePath(t.input);
        if (path) filesTouched.add(path);
        if (t.input) lastToolInput = JSON.stringify(t.input).slice(0, 200);
      }
    } else if (rec.type === 'queue-operation' && typeof rec.content === 'string' && !firstUserContent) {
      // The very first system enqueue often holds the task description.
      firstUserContent = rec.content;
    }
  }

  const lastActiveAt = lastTimestamp ?? firstTimestamp ?? new Date(0).toISOString();
  const status: AgentSessionStatus = computeStatus(lastActiveAt);
  const title = aiTitle ?? truncate(firstUserContent ?? 'untitled session', 80);

  return {
    id: sessionId || basenameNoExt(opts.sourcePath),
    provider: 'claude',
    sourcePath: opts.sourcePath,
    cwd: cwd || 'unknown',
    status,
    title,
    initialPrompt: firstUserContent,
    lastMessage: lastUserOrAssistant,
    lastTool,
    lastToolInput,
    filesTouched: Array.from(filesTouched).slice(0, 20),
    toolCount,
    messageCount,
    startedAt: firstTimestamp,
    lastActiveAt,
  };
}

export function parseClaudeEvents(sourcePath: string, limit = 200): AgentSessionEvent[] {
  const raw = readFileSync(sourcePath, 'utf8');
  const lines = raw.split(/\n+/).filter(Boolean).slice(-limit);
  const out: AgentSessionEvent[] = [];
  for (const line of lines) {
    let rec: RawRecord;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (!rec.timestamp) continue;
    if (rec.type === 'user' && rec.message?.role === 'user') {
      const text = extractText(rec.message.content);
      if (text) out.push({ kind: 'user', text, timestamp: rec.timestamp });
    } else if (rec.type === 'assistant' && rec.message?.role === 'assistant') {
      const text = extractText(rec.message.content);
      if (text) out.push({ kind: 'assistant', text, timestamp: rec.timestamp });
      for (const t of extractToolUses(rec.message.content)) {
        out.push({
          kind: 'tool_call',
          text: t.name ?? 'tool',
          tool: t.name,
          timestamp: rec.timestamp,
          meta: t.input,
        });
      }
    }
  }
  return out;
}

function computeStatus(lastActiveAt: string): AgentSessionStatus {
  const ageMin = (Date.now() - new Date(lastActiveAt).getTime()) / 60000;
  if (Number.isNaN(ageMin)) return 'lost';
  if (ageMin < 5) return 'running';
  if (ageMin < 30) return 'idle';
  return 'lost';
}

function basenameNoExt(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? p;
  return base.replace(/\.jsonl$/, '');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
