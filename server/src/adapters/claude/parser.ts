import { readFileSync } from 'fs';
import type { AgentSession, AgentSessionEvent, AgentSessionStatus, UsageEvent } from '@stash/shared';
import { isClearlyIncompleteJsonlTail } from '../jsonl-tail.js';

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface RawRecord {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  message?: {
    role?: string;
    content?: unknown;
    model?: string;
    usage?: RawUsage;
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
  let model: string | undefined;
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
      if (rec.message.model) model = rec.message.model;
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
    model,
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

export function parseClaudeUsage(sourcePath: string): UsageEvent[] {
  const raw = readFileSync(sourcePath, 'utf8');
  const lines = raw.split(/\n+/).filter(Boolean);
  const out: UsageEvent[] = [];
  for (const line of lines) {
    let rec: RawRecord;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const event = claudeUsageEvent(rec, sourcePath);
    if (event) out.push(event);
  }
  return out;
}

export interface ClaudeAnalyticsData {
  lastActiveAt: string;
  usage: UsageEvent[];
}

/**
 * Strict Weekly parser. Event timestamps are independent of physical append
 * order, so every complete candidate record must be validated before the
 * maximum activity timestamp and exact usage buckets are known.
 */
export function parseClaudeAnalytics(
  sourcePath: string,
  _activeSinceMs: number,
  _sourceSizeBytes?: number,
): ClaudeAnalyticsData {
  const raw = readFileSync(sourcePath, 'utf8');
  const usage: UsageEvent[] = [];
  let lastActiveAt: string | undefined;
  let lastActiveMs = Number.NEGATIVE_INFINITY;
  for (const rec of parseClaudeAnalyticsRecords(raw, sourcePath)) {
    if (rec.timestamp) {
      const timestampMs = Date.parse(rec.timestamp);
      if (Number.isNaN(timestampMs)) {
        throw new Error(`Claude analytics record has an invalid timestamp: ${sourcePath}`);
      }
      if (timestampMs > lastActiveMs) {
        lastActiveMs = timestampMs;
        lastActiveAt = rec.timestamp;
      }
    }
    const event = claudeUsageEvent(rec, sourcePath);
    if (event) {
      if (!rec.timestamp) {
        throw new Error(`Claude usage record has no timestamp: ${sourcePath}`);
      }
      usage.push(event);
    }
  }
  if (!lastActiveAt) throw new Error(`Claude session has no valid timestamped records: ${sourcePath}`);
  return { lastActiveAt, usage };
}

function parseClaudeAnalyticsRecords(raw: string, sourcePath: string): RawRecord[] {
  const hasTrailingNewline = raw.endsWith('\n');
  const lines = raw.split('\n');
  if (hasTrailingNewline) lines.pop();
  const records: RawRecord[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as RawRecord);
    } catch {
      const isTrailingPartial = !hasTrailingNewline
        && index === lines.length - 1
        && isClearlyIncompleteJsonlTail(line);
      if (isTrailingPartial) continue;
      throw new Error(`Claude session contains malformed complete JSONL: ${sourcePath}`);
    }
  }
  return records;
}

function claudeUsageEvent(rec: RawRecord, sourcePath: string): UsageEvent | undefined {
  if (rec.type !== 'assistant' || rec.message?.role !== 'assistant') return undefined;
  const usage = rec.message?.usage;
  if (!usage) return undefined;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  if (inputTokens === 0 && outputTokens === 0) return undefined;
  return {
    ts: rec.timestamp ?? new Date(0).toISOString(),
    model: rec.message?.model ?? 'unknown',
    inputTokens,
    outputTokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens,
    sourcePath,
  };
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
