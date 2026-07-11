import { readFileSync } from 'fs';
import type { AgentSession, AgentSessionEvent, AgentSessionStatus, UsageEvent } from '@stash/shared';
import { isClearlyIncompleteJsonlTail, readJsonlLinesReverse } from '../jsonl-tail.js';

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
    call_id?: string;
    output?: unknown;
  };
}

interface ContentPart {
  type?: string;
  text?: string;
}

const TEXT_CONTENT_TYPES = new Set(['text', 'input_text', 'output_text']);

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const p of content as ContentPart[]) {
    if (typeof p === 'string') parts.push(p);
    else if (p?.type && TEXT_CONTENT_TYPES.has(p.type) && typeof p.text === 'string') {
      parts.push(p.text);
    }
  }
  return parts.join('\n');
}

function pickFilePath(args: unknown): string | undefined {
  if (typeof args !== 'object' || !args) return undefined;
  const obj = args as Record<string, unknown>;
  const candidate = obj.path ?? obj.file_path ?? obj.filepath ?? obj.target ?? obj.filename;
  return typeof candidate === 'string' ? candidate : undefined;
}

function parseToolArguments(args: unknown): Record<string, unknown> | undefined {
  if (!args) return undefined;
  if (typeof args === 'object' && !Array.isArray(args)) return args as Record<string, unknown>;
  if (typeof args !== 'string') return { value: args };

  const trimmed = args.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { arguments: args };
  }
}

function extractOutputText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output == null) return '';
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
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
  let model: string | undefined;
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
    } else if (rec.type === 'turn_context' && rec.payload && typeof (rec.payload as { model?: unknown }).model === 'string') {
      model = (rec.payload as { model: string }).model;
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
      const parsedArgs = parseToolArguments(args);
      const path = pickFilePath(parsedArgs);
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
    model,
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
      const meta = parseToolArguments(rec.payload.arguments);
      out.push({
        kind: 'tool_call',
        text: typeof rec.payload.name === 'string' ? rec.payload.name : 'tool',
        tool: typeof rec.payload.name === 'string' ? rec.payload.name : undefined,
        timestamp: rec.timestamp,
        callId: typeof rec.payload.call_id === 'string' ? rec.payload.call_id : undefined,
        meta,
      });
    } else if (rec.type === 'response_item' && rec.payload?.type === 'function_call_output') {
      const text = extractOutputText(rec.payload.output);
      if (!text) continue;
      out.push({
        kind: 'tool_output',
        text,
        timestamp: rec.timestamp,
        callId: typeof rec.payload.call_id === 'string' ? rec.payload.call_id : undefined,
      });
    }
  }
  return out;
}

export function parseCodexUsage(sourcePath: string): UsageEvent[] {
  const raw = readFileSync(sourcePath, 'utf8');
  const records: RawRecord[] = [];
  for (const line of raw.split(/\n+/).filter(Boolean)) {
    let rec: RawRecord;
    try { rec = JSON.parse(line); } catch { continue; }
    records.push(rec);
  }
  return codexFinalUsageFromRecords(records, sourcePath);
}

export interface CodexAnalyticsData {
  lastActiveAt: string;
  usage: UsageEvent[];
}

/**
 * Reads a Codex rollout backwards until it has all cumulative token counters
 * needed to derive exact deltas at and after `activeSinceMs`, plus one prior
 * counter and model context as the baseline. Large tool output earlier in the
 * session stays off the weekly request path.
 */
export function parseCodexAnalytics(
  sourcePath: string,
  activeSinceMs: number,
  sourceSizeBytes?: number,
): CodexAnalyticsData {
  const reverseRecords: RawRecord[] = [];
  let lastActiveAt: string | undefined;
  let foundAfterBoundaryToken = false;
  let foundBaselineToken = false;
  let foundModelBeforeOldestAfterBoundaryToken = false;
  let trailingPartial = false;
  let newerTimestampMs = Number.POSITIVE_INFINITY;

  for (const line of readJsonlLinesReverse(sourcePath, undefined, sourceSizeBytes)) {
    if (!line.text.trim()) continue;

    let rec: RawRecord;
    try {
      rec = JSON.parse(line.text);
    } catch {
      if (!line.terminated && isClearlyIncompleteJsonlTail(line.text)) {
        trailingPartial = true;
        continue;
      }
      throw new Error(`Codex session contains malformed complete JSONL: ${sourcePath}`);
    }

    if (rec.timestamp) {
      const timestampMs = Date.parse(rec.timestamp);
      if (Number.isNaN(timestampMs)) {
        throw new Error(`Codex analytics record has an invalid timestamp: ${sourcePath}`);
      }
      if (timestampMs > newerTimestampMs) {
        throw new Error(`Codex analytics timestamps are not append-ordered: ${sourcePath}`);
      }
      newerTimestampMs = timestampMs;
      const isLastAppendedTimestamp = lastActiveAt === undefined;
      if (isLastAppendedTimestamp) {
        lastActiveAt = rec.timestamp;
      }
      if (isLastAppendedTimestamp && !trailingPartial && timestampMs < activeSinceMs) {
        return { lastActiveAt: rec.timestamp, usage: [] };
      }
    }

    const isToken = rec.type === 'event_msg' && rec.payload?.type === 'token_count';
    const isModel = rec.type === 'turn_context' && typeof rec.payload?.model === 'string';
    if (isToken && !rec.timestamp) {
      throw new Error(`Codex token_count record has no timestamp: ${sourcePath}`);
    }
    if (!isToken && !isModel) continue;
    reverseRecords.push(rec);

    if (isToken && rec.timestamp) {
      const timestampMs = Date.parse(rec.timestamp);
      if (!Number.isNaN(timestampMs)) {
        if (timestampMs >= activeSinceMs) {
          foundAfterBoundaryToken = true;
          // A model already seen while walking backwards is newer than this
          // token, so it cannot provide the initial context for this now-oldest
          // in-window sample.
          foundModelBeforeOldestAfterBoundaryToken = false;
        } else {
          foundBaselineToken = true;
        }
      }
    } else if (isModel && foundAfterBoundaryToken) {
      foundModelBeforeOldestAfterBoundaryToken = true;
    }

    if (
      foundBaselineToken
      && (!foundAfterBoundaryToken || foundModelBeforeOldestAfterBoundaryToken)
    ) break;
  }

  if (lastActiveAt === undefined) {
    throw new Error(`Codex session has no valid timestamped records: ${sourcePath}`);
  }
  reverseRecords.reverse();
  return { lastActiveAt, usage: codexDeltaUsageFromRecords(reverseRecords, sourcePath) };
}

interface CumulativeTokens {
  input: number;
  output: number;
  cached: number;
}

function codexFinalUsageFromRecords(records: RawRecord[], sourcePath: string): UsageEvent[] {
  let model: string | undefined;
  let lastTimestamp: string | undefined;
  let current: CumulativeTokens = { input: 0, output: 0, cached: 0 };

  for (const rec of records) {
    if (rec.type === 'turn_context' && rec.payload?.model && typeof rec.payload.model === 'string') {
      model = rec.payload.model;
    }
    if (rec.type !== 'event_msg' || rec.payload?.type !== 'token_count') continue;
    const info = (rec.payload as { info?: Record<string, unknown> }).info;
    const total = info?.total_token_usage as Record<string, unknown> | undefined;
    if (!total) continue;
    current = {
      input: numericTotal(total.input_tokens, current.input),
      output: numericTotal(total.output_tokens, current.output),
      cached: numericTotal(total.cached_input_tokens, current.cached),
    };
    if (rec.timestamp) lastTimestamp = rec.timestamp;
  }

  if (!lastTimestamp || (current.input === 0 && current.output === 0)) return [];
  return [{
    ts: lastTimestamp,
    model: model ?? 'codex-1',
    inputTokens: current.input,
    outputTokens: current.output,
    cacheReadTokens: current.cached || undefined,
    sourcePath,
  }];
}

function codexDeltaUsageFromRecords(records: RawRecord[], sourcePath: string): UsageEvent[] {
  const usage: UsageEvent[] = [];
  let model: string | undefined;
  let previous: CumulativeTokens = { input: 0, output: 0, cached: 0 };

  for (const rec of records) {
    if (rec.type === 'turn_context' && rec.payload?.model && typeof rec.payload.model === 'string') {
      model = rec.payload.model;
    }

    if (rec.type !== 'event_msg' || rec.payload?.type !== 'token_count') continue;
    const info = (rec.payload as { info?: Record<string, unknown> }).info;
    const total = info?.total_token_usage as Record<string, unknown> | undefined;
    if (!total) continue;
    const current: CumulativeTokens = {
      input: numericTotal(total.input_tokens, previous.input),
      output: numericTotal(total.output_tokens, previous.output),
      cached: numericTotal(total.cached_input_tokens, previous.cached),
    };
    const reset = current.input < previous.input
      || current.output < previous.output
      || current.cached < previous.cached;
    const inputTokens = reset ? current.input : current.input - previous.input;
    const outputTokens = reset ? current.output : current.output - previous.output;
    const cacheReadTokens = reset ? current.cached : current.cached - previous.cached;
    previous = current;

    if (!rec.timestamp || (inputTokens === 0 && outputTokens === 0)) continue;
    usage.push({
      ts: rec.timestamp,
      model: model ?? 'codex-1',
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheReadTokens || undefined,
      sourcePath,
    });
  }
  return usage;
}

function numericTotal(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
