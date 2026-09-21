import type { ToolCall, Transcript } from '../parser/types.js';

export interface AttributedResult {
  readonly turnIndex: number;
  readonly tool: string;
  readonly toolUseId: string;
  readonly bytes: number;
  readonly approxTokens: number;
  readonly isBinary: boolean;
  readonly filePath: string | undefined;
  readonly mcpServer: string | undefined;
}

const BYTES_PER_TOKEN = 4;
const UNKNOWN_TOOL = 'unknown';

/** Rough token estimate; always reported as `approxTokens`, never as exact. */
export const approxTokens = (bytes: number): number => Math.round(bytes / BYTES_PER_TOKEN);

/** `mcp__<server>__<tool>` → `<server>`. */
export function mcpServerOf(toolName: string): string | undefined {
  const m = /^mcp__(.+?)__/.exec(toolName);
  return m?.[1];
}

function buildToolIndex(t: Transcript): ReadonlyMap<string, ToolCall> {
  return new Map(t.turns.flatMap((turn) => (turn.kind === 'assistant' ? turn.toolCalls.map((c) => [c.id, c] as const) : [])));
}

/** Joins every tool_result back to the tool_use that produced it. */
export function attributeResults(t: Transcript): readonly AttributedResult[] {
  const index = buildToolIndex(t);
  return t.turns.flatMap((turn, turnIndex) => {
    if (turn.kind !== 'user') return [];
    return turn.toolResults.map((r) => {
      const call = index.get(r.toolUseId);
      const name = call?.name ?? UNKNOWN_TOOL;
      const fp = call?.input['file_path'];
      return {
        turnIndex,
        tool: name,
        toolUseId: r.toolUseId,
        bytes: r.bytes,
        approxTokens: approxTokens(r.bytes),
        isBinary: r.isBinary,
        filePath: typeof fp === 'string' ? fp : undefined,
        mcpServer: mcpServerOf(name)
      };
    });
  });
}
