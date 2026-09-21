import type { CallToolResult } from '@modelcontextprotocol/server';

export type ToolReply = CallToolResult;

const NOT_FOUND_HINT = 'Call list_sessions to see available session ids, or use "latest".';
const GENERIC_HINT = 'Check the input and try again.';

/** Success envelope: `summary` for humans, `data` for the agent. */
export function ok<T>(data: T, summary: string): ToolReply {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary, data }) }] };
}

export function fail(error: string, hint: string): ToolReply {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error, hint }) }], isError: true };
}

/** Maps a thrown error to a `fail` reply with a targeted hint. */
export function failFrom(e: unknown): ToolReply {
  const message = e instanceof Error ? e.message : String(e);
  const hint = /Session not found|outside allowed roots/.test(message) ? NOT_FOUND_HINT : GENERIC_HINT;
  return fail(message, hint);
}
