import { describe, it, expect } from 'vitest';
import { suggestCompaction } from '../../src/analysis/compaction.js';
import { loadPricing, type Pricing } from '../../src/pricing/pricing.js';
import { assistantLine, userLine, toolUse, toolResult } from '../helpers/lines.js';
import { tx } from '../helpers/tx.js';

const kinds = (f: readonly { kind: string }[]) => f.map((x) => x.kind);

describe('suggestCompaction', () => {
  it('repeated_read when same file read 3+ times', async () => {
    const t = tx([
      assistantLine({ content: [toolUse('1', 'Read', { file_path: '/f' }), toolUse('2', 'Read', { file_path: '/f' }), toolUse('3', 'Read', { file_path: '/f' })] }),
      userLine({ content: [toolResult('1', 'x'.repeat(400)), toolResult('2', 'x'.repeat(400)), toolResult('3', 'x'.repeat(400))] })
    ]);
    const f = suggestCompaction(t, await loadPricing());
    expect(kinds(f)).toEqual(['repeated_read']);
    expect(f[0]).toMatchObject({ severity: 'medium', estSavingsTokens: 202 });
  });

  it('oversized_result over 20k approx tokens (high)', async () => {
    const t = tx([assistantLine({ content: [toolUse('1', 'Bash')] }), userLine({ content: [toolResult('1', 'x'.repeat(90_000))] })]);
    const f = suggestCompaction(t, await loadPricing());
    expect(kinds(f)).toEqual(['oversized_result']);
    expect(f[0]?.severity).toBe('high');
  });

  it('binary_in_context', async () => {
    const t = tx([
      assistantLine({ content: [toolUse('1', 'Read', { file_path: '/i.png' })] }),
      userLine({ content: [toolResult('1', [{ type: 'image', source: { type: 'base64', data: 'AAAA' } }])] })
    ]);
    expect(kinds(suggestCompaction(t, await loadPricing()))).toEqual(['binary_in_context']);
  });

  it('thinking_heavy when thinking > 5x visible output', async () => {
    const t = tx([assistantLine({ usage: { output: 6000, thinking: 5900 } })]);
    const f = suggestCompaction(t, await loadPricing());
    expect(kinds(f)).toEqual(['thinking_heavy']);
    expect(f[0]?.severity).toBe('low');
  });

  it('window_pressure when context crosses 80%', async () => {
    const p: Pricing = { asOf: 'x', models: { 'claude-opus-5': { input: 1, cacheRead: 1, cacheWrite5m: 1, cacheWrite1h: 1, output: 1, contextWindow: 1000 } } };
    const f = suggestCompaction(tx([assistantLine({ usage: { cacheRead: 900 } })]), p);
    expect(kinds(f)).toEqual(['window_pressure']);
    expect(f[0]?.estSavingsTokens).toBe(400);
  });

  it('noisy_bash when 5+ Bash results over 5k tokens', async () => {
    const calls = Array.from({ length: 5 }, (_, i) => toolUse(`b${i}`, 'Bash'));
    const res = Array.from({ length: 5 }, (_, i) => toolResult(`b${i}`, 'x'.repeat(21_000)));
    expect(kinds(suggestCompaction(tx([assistantLine({ content: calls }), userLine({ content: res })]), await loadPricing()))).toEqual(['noisy_bash']);
  });

  it('sorted high → low then savings desc; empty on clean sessions', async () => {
    const p = await loadPricing();
    expect(suggestCompaction(tx([assistantLine({})]), p)).toEqual([]);
    const t = tx([
      assistantLine({ usage: { output: 6000, thinking: 5900 }, content: [toolUse('1', 'Bash'), toolUse('2', 'Read', { file_path: '/f' }), toolUse('3', 'Read', { file_path: '/f' }), toolUse('4', 'Read', { file_path: '/f' })] }),
      userLine({ content: [toolResult('1', 'x'.repeat(90_000)), toolResult('2', 'y'.repeat(40)), toolResult('3', 'y'.repeat(40)), toolResult('4', 'y'.repeat(40))] })
    ]);
    expect(kinds(suggestCompaction(t, p))).toEqual(['oversized_result', 'repeated_read', 'thinking_heavy']);
  });
});
