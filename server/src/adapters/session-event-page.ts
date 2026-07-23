import type {
  AgentSessionEvent,
  AgentSessionEventPage,
  AgentSessionEventSummary,
} from '@stash/shared';

export const DEFAULT_SESSION_EVENT_PAGE_LIMIT = 100;
export const MAX_SESSION_EVENT_PAGE_LIMIT = 200;
export const MAX_SESSION_EVENT_RESPONSE_BYTES = 512 * 1024;

const EVENT_TEXT_LIMIT = 24 * 1024;
const EVENT_META_LIMIT = 24 * 1024;
const PAGE_DATA_BUDGET = 384 * 1024;
const SUMMARY_ENTRY_LIMIT = 64;
const SUMMARY_LABEL_BYTES = 512;

export function buildSessionEventPage(
  events: AgentSessionEvent[],
  input: { cursor?: string; limit: number },
): AgentSessionEventPage {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_SESSION_EVENT_PAGE_LIMIT) {
    throw new Error(`session event page limit must be between 1 and ${MAX_SESSION_EVENT_PAGE_LIMIT}`);
  }
  const offset = input.cursor ? decodeSessionEventCursor(input.cursor) : 0;
  if (offset > events.length) throw new Error('session event cursor is outside the transcript');

  const data: AgentSessionEvent[] = [];
  let response_bytes = 2;
  let next_offset = offset;
  while (next_offset < events.length && data.length < input.limit) {
    const event = boundEvent(events[next_offset]!);
    const event_bytes = Buffer.byteLength(JSON.stringify(event));
    if (data.length > 0 && response_bytes + event_bytes > PAGE_DATA_BUDGET) break;
    data.push(event);
    response_bytes += event_bytes;
    next_offset += 1;
  }

  const has_more = next_offset < events.length;
  const result: AgentSessionEventPage = {
    data,
    page: {
      cursor: input.cursor ?? null,
      nextCursor: has_more ? encodeSessionEventCursor(next_offset) : null,
      hasMore: has_more,
      limit: input.limit,
      totalEvents: events.length,
      responseBytes: 0,
    },
    summary: summarizeEvents(events),
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const measured = Buffer.byteLength(JSON.stringify(result));
    if (measured === result.page.responseBytes) break;
    result.page.responseBytes = measured;
  }
  if (result.page.responseBytes > MAX_SESSION_EVENT_RESPONSE_BYTES) {
    throw new Error('session event page exceeded its response byte limit');
  }
  return result;
}

export function encodeSessionEventCursor(offset: number): string {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('session event cursor offset is invalid');
  }
  return Buffer.from(`v1:${offset}`, 'utf8').toString('base64url');
}

export function decodeSessionEventCursor(cursor: string): number {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new Error('session event cursor is invalid');
  }
  if (!/^v1:(0|[1-9]\d*)$/.test(decoded)) {
    throw new Error('session event cursor is invalid');
  }
  const offset = Number(decoded.slice(3));
  if (!Number.isSafeInteger(offset)) throw new Error('session event cursor is invalid');
  return offset;
}

export function isSessionEventCursor(cursor: string): boolean {
  try {
    decodeSessionEventCursor(cursor);
    return true;
  } catch {
    return false;
  }
}

function boundEvent(event: AgentSessionEvent): AgentSessionEvent {
  const text = truncateText(event.text, EVENT_TEXT_LIMIT);
  const meta = event.meta ? boundMeta(event.meta) : undefined;
  const truncated = text.truncated || meta?.truncated || event.truncated;
  return {
    ...event,
    text: text.value,
    ...(meta ? { meta: meta.value } : {}),
    ...(truncated ? { truncated: true } : {}),
  };
}

function boundMeta(meta: Record<string, unknown>): {
  value: Record<string, unknown>;
  truncated: boolean;
} {
  const json = safeStringify(meta);
  if (Buffer.byteLength(json) <= EVENT_META_LIMIT) {
    return { value: meta, truncated: false };
  }
  return {
    value: {
      truncatedPreview: truncateText(json, EVENT_META_LIMIT).value,
    },
    truncated: true,
  };
}

function truncateText(value: string, max_bytes: number): { value: string; truncated: boolean } {
  if (Buffer.byteLength(value) <= max_bytes) return { value, truncated: false };
  const suffix = '…';
  const content_limit = Math.max(0, max_bytes - Buffer.byteLength(suffix));
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, middle)) <= content_limit) low = middle;
    else high = middle - 1;
  }
  return { value: `${value.slice(0, low)}${suffix}`, truncated: true };
}

function summarizeEvents(events: AgentSessionEvent[]): AgentSessionEventSummary {
  const tools = new Map<string, number>();
  const files = new Map<string, number>();
  let total_tool_calls = 0;
  for (const event of events) {
    if (event.kind !== 'tool_call') continue;
    total_tool_calls += 1;
    const name = truncateText(event.tool ?? event.text, SUMMARY_LABEL_BYTES).value;
    tools.set(name, (tools.get(name) ?? 0) + 1);
    const path = event.meta ? pickPath(event.meta) : undefined;
    if (path) {
      const bounded_path = truncateText(path, SUMMARY_LABEL_BYTES).value;
      files.set(bounded_path, (files.get(bounded_path) ?? 0) + 1);
    }
  }
  return {
    totalToolCalls: total_tool_calls,
    totalFiles: files.size,
    toolCalls: Array.from(tools, ([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
      .slice(0, SUMMARY_ENTRY_LIMIT),
    filesTouched: Array.from(files, ([path, count]) => ({ path, count }))
      .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
      .slice(0, SUMMARY_ENTRY_LIMIT),
  };
}

function pickPath(meta: Record<string, unknown>): string | undefined {
  for (const key of ['file_path', 'filePath', 'path', 'notebook_path']) {
    const value = meta[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
