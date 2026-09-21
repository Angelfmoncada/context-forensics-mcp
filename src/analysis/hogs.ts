import type { Transcript } from '../parser/types.js';
import { attributeResults, approxTokens, type AttributedResult } from './attribution.js';

export type HogBy = 'tool' | 'file' | 'mcp_server';

export interface HogRow {
  readonly key: string;
  readonly calls: number;
  readonly bytes: number;
  readonly approxTokens: number;
  readonly pctOfToolBytes: number;
}

interface Group { readonly calls: number; readonly bytes: number }

function keyOf(r: AttributedResult, by: HogBy): string | undefined {
  if (by === 'tool') return r.tool;
  if (by === 'file') return r.filePath;
  return r.mcpServer;
}

const pct = (part: number, whole: number): number => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

/** Ranks tool-result bytes by tool, file path, or MCP server. Percentages are of all tool-result bytes. */
export function rankHogs(t: Transcript, by: HogBy, top: number): readonly HogRow[] {
  const results = attributeResults(t);
  const totalBytes = results.reduce((n, r) => n + r.bytes, 0);
  // Local accumulator: inputs are never mutated, only this map built here.
  const groups = new Map<string, Group>();
  for (const r of results) {
    const key = keyOf(r, by);
    if (key === undefined) continue;
    const g = groups.get(key) ?? { calls: 0, bytes: 0 };
    groups.set(key, { calls: g.calls + 1, bytes: g.bytes + r.bytes });
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, calls: g.calls, bytes: g.bytes, approxTokens: approxTokens(g.bytes), pctOfToolBytes: pct(g.bytes, totalBytes) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, top);
}
