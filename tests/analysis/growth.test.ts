import { describe, it, expect } from 'vitest';
import { contextGrowth, contextSize } from '../../src/analysis/growth.js';
import { loadPricing, type Pricing } from '../../src/pricing/pricing.js';
import { assistantLine, userLine, toolUse, toolResult } from '../helpers/lines.js';
import { tx } from '../helpers/tx.js';

const small = (): Pricing => ({
  asOf: 'test',
  models: { 'claude-opus-5': { input: 5, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, output: 25, contextWindow: 100_000 } }
});

describe('contextGrowth', () => {
  it('builds a timeline with deltas, causes, peak and threshold crossings', () => {
    const t = tx([
      assistantLine({ ts: 't0', usage: { input: 10_000 }, content: [toolUse('r1', 'Read', { file_path: '/a' })] }),
      userLine({ content: [toolResult('r1', 'x'.repeat(280_000))] }),
      assistantLine({ ts: 't2', usage: { cacheRead: 10_000, c5m: 75_000 } }),
      userLine({}),
      assistantLine({ ts: 't4', usage: { cacheRead: 85_000, c5m: 500 } }),
      userLine({}),
      assistantLine({ ts: 't6', usage: { cacheRead: 85_500, c5m: 10_000 } }),
      assistantLine({ ts: 'side', sidechain: true, usage: { input: 999_999 } })
    ]);
    const g = contextGrowth(t, 2000, small());
    expect(g.windowTokens).toBe(100_000);
    expect(g.timeline.map((x) => x.turnIndex)).toEqual([0, 2, 6]);
    expect(g.timeline[0]).toMatchObject({ contextTokens: 10_000, delta: 10_000, pctOfWindow: 10, cause: undefined });
    expect(g.timeline[1]).toMatchObject({ contextTokens: 85_000, delta: 75_000, pctOfWindow: 85, cause: { tool: 'Read', approxTokens: 70_001, filePath: '/a' } });
    expect(g.peak).toEqual({ turnIndex: 6, contextTokens: 95_500 });
    expect(g.crossed80At).toBe(2);
    expect(g.crossed90At).toBe(6);
  });

  it('null window for unknown model, no crossings, empty session', async () => {
    const p = await loadPricing();
    const g = contextGrowth(tx([assistantLine({ model: 'zz', usage: { input: 5 } })]), 0, p);
    expect(g.windowTokens).toBeNull();
    expect(g.timeline[0]?.pctOfWindow).toBeNull();
    expect(g.crossed80At).toBeUndefined();
    const empty = contextGrowth(tx([userLine({})]), 0, p);
    expect(empty.timeline).toEqual([]);
    expect(empty.peak).toEqual({ turnIndex: -1, contextTokens: 0 });
  });

  it('contextSize sums all input-side buckets', () => {
    expect(contextSize({ input: 1, cacheRead: 2, cacheCreate5m: 3, cacheCreate1h: 4, output: 99, thinking: 9 })).toBe(10);
  });
});
