import { describe, it, expect } from 'vitest';
import { attributeResults, approxTokens, mcpServerOf } from '../../src/analysis/attribution.js';
import { assistantLine, userLine, toolUse, toolResult } from '../helpers/lines.js';
import { tx } from '../helpers/tx.js';

describe('attribution', () => {
  it('links tool_result to the tool_use that produced it', () => {
    const t = tx([
      assistantLine({ content: [toolUse('t1', 'Read', { file_path: '/a.ts' }), toolUse('t2', 'mcp__srv__do')] }),
      userLine({ content: [toolResult('t1', 'x'.repeat(8)), toolResult('t2', 'y'.repeat(4))] })
    ]);
    expect(attributeResults(t)).toEqual([
      { turnIndex: 1, tool: 'Read', toolUseId: 't1', bytes: 10, approxTokens: 3, isBinary: false, filePath: '/a.ts', mcpServer: undefined },
      { turnIndex: 1, tool: 'mcp__srv__do', toolUseId: 't2', bytes: 6, approxTokens: 2, isBinary: false, filePath: undefined, mcpServer: 'srv' }
    ]);
  });

  it('labels orphan results as unknown', () => {
    const r = attributeResults(tx([userLine({ content: [toolResult('nope', 'z')] })]));
    expect(r[0]?.tool).toBe('unknown');
    expect(r[0]?.filePath).toBeUndefined();
  });

  it('approxTokens rounds bytes/4', () => {
    expect(approxTokens(10)).toBe(3);
    expect(approxTokens(0)).toBe(0);
  });

  it('mcpServerOf extracts the server segment', () => {
    expect(mcpServerOf('mcp__a__b')).toBe('a');
    expect(mcpServerOf('mcp__plugin_pw_pw__click')).toBe('plugin_pw_pw');
    expect(mcpServerOf('Bash')).toBeUndefined();
  });
});
