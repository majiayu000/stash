import type { AgentSession } from '@stash/shared';

const SESSION_LIST_TEXT_BYTES = 4 * 1024;

export function bound_session_list_item(session: AgentSession): AgentSession {
  const initial_prompt = session.initialPrompt === undefined
    ? undefined
    : truncate_utf8(session.initialPrompt, SESSION_LIST_TEXT_BYTES);
  const last_message = session.lastMessage === undefined
    ? undefined
    : truncate_utf8(session.lastMessage, SESSION_LIST_TEXT_BYTES);
  const preview_truncated = session.previewTruncated === true
    || initial_prompt?.truncated === true
    || last_message?.truncated === true;
  return {
    ...session,
    initialPrompt: initial_prompt?.value,
    lastMessage: last_message?.value,
    ...(preview_truncated ? { previewTruncated: true } : {}),
  };
}

function truncate_utf8(
  value: string,
  max_bytes: number,
): { value: string; truncated: boolean } {
  if (Buffer.byteLength(value) <= max_bytes) return { value, truncated: false };
  const suffix = '…';
  const content_limit = max_bytes - Buffer.byteLength(suffix);
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, middle)) <= content_limit) low = middle;
    else high = middle - 1;
  }
  if (
    low > 0
    && low < value.length
    && value.charCodeAt(low - 1) >= 0xd800
    && value.charCodeAt(low - 1) <= 0xdbff
    && value.charCodeAt(low) >= 0xdc00
    && value.charCodeAt(low) <= 0xdfff
  ) {
    low -= 1;
  }
  return { value: `${value.slice(0, low)}${suffix}`, truncated: true };
}
