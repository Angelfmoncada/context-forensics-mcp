import { describe, it, expect } from 'vitest';
import { rankHogs } from '../../src/analysis/hogs.js';
import { assistantLine, userLine, toolUse, toolResult } from '../helpers/lines.js';
import { tx } from '../helpers/tx.js';

const t = tx([
  assistantLine({ content: [
    toolUse('r1', 'Read', { file_path: '/big.ts' }), toolUse('r2', 'Read', { file_path: '/big.ts' }),
    toolUse('b1', 'Bash'), toolUse('m1', 'mcp__pw__snap'), toolUse('m2', 'mcp__pw__click')
  ] }),
  userLine({ content: [
    toolResult('r1', 'x'.repeat(398)), toolResult('r2', 'x'.repeat(398)), toolResult('b1', 'y'.repeat(98)),
    toolResult('m1', 'z'.repeat(48)), toolResult('m2', 'z'.repeat(48))
  ] })
]);

describe('rankHogs', () => {
  it('by tool', () => {
    const rows = rankHogs(t, 'tool', 10);
    expect(rows[0]).toEqual({ key: 'Read', calls: 2, bytes: 800, approxTokens: 200, pctOfToolBytes: 80 });
    expect(rows.map((r) => r.key)).toEqual(['Read', 'Bash', 'mcp__pw__snap', 'mcp__pw__click']);
  });
  it('by file only includes file-bearing tools', () => {
    expect(rankHogs(t, 'file', 10)).toEqual([{ key: '/big.ts', calls: 2, bytes: 800, approxTokens: 200, pctOfToolBytes: 80 }]);
  });
  it('by mcp_server groups mcp tools', () => {
    expect(rankHogs(t, 'mcp_server', 10)).toEqual([{ key: 'pw', calls: 2, bytes: 100, approxTokens: 25, pctOfToolBytes: 10 }]);
  });
  it('respects top and handles empty sessions', () => {
    expect(rankHogs(t, 'tool', 1)).toHaveLength(1);
    expect(rankHogs(tx([assistantLine({})]), 'tool', 5)).toEqual([]);
  });
});
