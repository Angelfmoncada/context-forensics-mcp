import { describe, it, expect } from 'vitest';
import { summarize } from '../../src/analysis/summarize.js';
import { loadPricing } from '../../src/pricing/pricing.js';
import { assistantLine, userLine, toolUse, toolResult } from '../helpers/lines.js';
import { tx } from '../helpers/tx.js';

describe('summarize', () => {
  it('aggregates turns, models, tokens, cost, peak and top lists', async () => {
    const t = tx([
      userLine({ ts: '2026-09-20T10:00:00.000Z' }),
      assistantLine({ ts: '2026-09-20T10:00:05.000Z', model: 'claude-opus-5', usage: { input: 10, cacheRead: 1000, c5m: 200, output: 50, thinking: 20 }, content: [toolUse('1', 'Bash')] }),
      userLine({ content: [toolResult('1', 'x'.repeat(40))] }),
      assistantLine({ ts: '2026-09-20T10:01:05.000Z', model: 'claude-sonnet-5', sidechain: true, usage: { input: 5, output: 5 } })
    ]);
    const s = summarize(t, await loadPricing());
    expect(s.id).toBe('s');
    expect(s.turns).toEqual({ assistant: 2, user: 2, sidechain: 1 });
    expect(s.models).toEqual({ 'claude-opus-5': 1, 'claude-sonnet-5': 1 });
    expect(s.tokens).toEqual({ input: 15, cacheRead: 1000, cacheCreate5m: 200, cacheCreate1h: 0, output: 55, thinking: 20 });
    expect(s.startedAt).toBe('2026-09-20T10:00:00.000Z');
    expect(s.endedAt).toBe('2026-09-20T10:01:05.000Z');
    expect(s.durationMs).toBe(65_000);
    expect(s.peakContext).toEqual({ tokens: 1210, turnIndex: 1, pctOfWindow: 0.1 });
    expect(s.topHogs[0]?.key).toBe('Bash');
    expect(s.cost.total.total).toBeGreaterThan(0);
    expect(s.topFindings).toEqual([]);
    expect(s.parseWarnings).toBe(0);
  });

  it('handles an empty transcript', async () => {
    const s = summarize(tx([]), await loadPricing());
    expect(s.durationMs).toBeNull();
    expect(s.startedAt).toBeNull();
    expect(s.peakContext.pctOfWindow).toBeNull();
    expect(s.models).toEqual({});
  });
});
