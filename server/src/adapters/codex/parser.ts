import { readFileSync } from 'fs';
import type { AgentSession, AgentSessionEvent, AgentSessionStatus } from '@stash/shared';

interface RawRecord {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown> & {
    type?: string;
    role?: string;
    id?: string;
    cwd?: string;
    content?: unknown;
    name?: string;
    arguments?: unknown;
  };
}

interface ContentPart {
  type?: string;
  text?: string;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const p of content as ContentPart[]) {
    if (typeof p === 'string') parts.push(p);
    else if (p?.type === 'text' && typeof p.text === 'string') parts.push(p.text);
  }
  return parts.join('\n');
}

function pickFilePath(args: unknown): string | undefined {
  if (typeof args !== 'object' || !args) return undefined;
  const obj = args as Record<string, unknown>;
  const candidate = obj.path ?? obj.file_path ?? obj.filepath ?? obj.target ?? obj.filename;
  return typeof candidate === 'string' ? candidate : undefined;
}

export interface ParseCodexOptions {
  sourcePath: string;
}

export function parseCodexSession(opts: ParseCodexOptions): AgentSession {
  const raw = readFileSync(opts.sourcePath, 'utf8');
  const lines = raw.split(/\n+/).filter(Boolean);

  let sessionId = '';
  let cwd = '';
  let startedAt: string | undefined;
  let lastTimestamp: string | undefined;
  let firstUserContent: string | undefined;
  let lastAssistantContent: string | undefined;
  let lastTool: string | undefined;
  let lastToolInput: string | undefined;
  const filesTouched = new Set<string>();
  let toolCount = 0;
  let messageCount = 0;

  for (const line of lines) {
    let rec: RawRecord;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = rec.timestamp;
    if (ts) {
      if (!startedAt || ts < startedAt) startedAt = ts;
      if (!lastTimestamp || ts > lastTimestamp) lastTimestamp = ts;
    }

    if (rec.type === 'session_meta' && rec.payload) {
      if (typeof rec.payload.id === 'string' && !sessionId) sessionId = rec.payload.id;
      if (typeof rec.payload.cwd === 'string' && !cwd) cwd = rec.payload.cwd;
      const payloadTs =
        typeof rec.payload.timestamp === 'string' ? rec.payload.timestamp : undefined;
      if (payloadTs && (!startedAt || payloadTs < startedAt)) startedAt = payloadTs;
    } else if (rec.type === 'response_item' && rec.payload?.type === 'message') {
      const role = rec.payload.role;
      const text = extractText(rec.payload.content);
      if (role === 'user') {
        messageCount++;
        if (!firstUserContent && text) firstUserContent = text;
      } else if (role === 'assistant') {
        messageCount++;
        if (text) lastAssistantContent = text;
      }
      // 'developer' messages are system-side context, skip from counts.
    } else if (rec.type === 'response_item' && rec.payload?.type === 'function_call') {
      toolCount++;
      const name = typeof rec.payload.name === 'string' ? rec.payload.name : undefined;
      if (name) lastTool = name;
      const args = rec.payload.arguments;
      const path = pickFilePath(args);
      if (path) filesTouched.add(path);
      try {
        const stringified =
          typeof args === 'string' ? args : JSON.stringify(args ?? {});
        lastToolInput = stringified.slice(0, 200);
      } catch {
        // ignore
      }
    } else if (rec.type === 'response_item' && rec.payload?.type === 'image_generation_call') {
      toolCount++;
      lastTool = 'image_generation';
    }
  }

  const lastActiveAt = lastTimestamp ?? startedAt ?? new Date(0).toISOString();
  const status: AgentSessionStatus = computeStatus(lastActiveAt);
  const title = truncate(firstUserContent ?? 'codex session', 80);

  return {
    id: sessionId || basenameNoExt(opts.sourcePath),
    provider: 'codex',
    sourcePath: opts.sourcePath,
    cwd: cwd || 'unknown',
    status,
    title,
    initialPrompt: firstUserContent,
    lastMessage: lastAssistantContent,
    lastTool,
    lastToolInput,
    filesTouched: Array.from(filesTouched).slice(0, 20),
    toolCount,
    messageCount,
    startedAt,
    lastActiveAt,
  };
}

export function parseCodexEvents(sourcePath: string, limit = 200): AgentSessionEvent[] {
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
    if (rec.type === 'response_item' && rec.payload?.type === 'message') {
      const role = rec.payload.role;
      const text = extractText(rec.payload.content);
      if (!text) continue;
      if (role === 'user') out.push({ kind: 'user', text, timestamp: rec.timestamp });
      else if (role === 'assistant') out.push({ kind: 'assistant', text, timestamp: rec.timestamp });
      else out.push({ kind: 'system', text, timestamp: rec.timestamp });
    } else if (rec.type === 'response_item' && rec.payload?.type === 'function_call') {
      out.push({
        kind: 'tool_call',
        text: typeof rec.payload.name === 'string' ? rec.payload.name : 'tool',
        tool: typeof rec.payload.name === 'string' ? rec.payload.name : undefined,
        timestamp: rec.timestamp,
        meta: rec.payload.arguments && typeof rec.payload.arguments === 'object'
          ? (rec.payload.arguments as Record<string, unknown>)
          : undefined,
      });
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
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + '…';
}
