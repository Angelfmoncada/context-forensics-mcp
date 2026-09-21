import { describe, it, expect } from 'vitest';
import { computeCost, mergeCostReports, addCost, ZERO_COST } from '../../src/analysis/cost.js';
import { loadPricing } from '../../src/pricing/pricing.js';
import { assistantLine } from '../helpers/lines.js';
import { tx } from '../helpers/tx.js';

const M = 1_000_000;

describe('computeCost', () => {
  it('prices each bucket per model and totals', async () => {
    const p = await loadPricing();
    const t = tx([
      assistantLine({ model: 'claude-opus-5', usage: { input: M, cacheRead: M, c5m: M, c1h: M, output: M } }),
      assistantLine({ model: 'claude-haiku-4-5', usage: { output: 2 * M } })
    ]);
    const c = computeCost(t, p);
    expect(c.byModel['claude-opus-5']).toEqual({ input: 5, cacheRead: 0.5, cacheCreate5m: 6.25, cacheCreate1h: 10, output: 25, total: 46.75 });
    expect(c.byModel['claude-haiku-4-5']?.total).toBe(10);
    expect(c.total.total).toBeCloseTo(56.75, 6);
    expect(c.unknownModels).toEqual([]);
    expect(c.currency).toBe('USD');
    expect(c.pricingAsOf).toBe(p.asOf);
  });

  it('lists unknown models and excludes them from totals', async () => {
    const c = computeCost(tx([assistantLine({ model: 'mystery-1', usage: { output: 5 } })]), await loadPricing());
    expect(c.unknownModels).toEqual(['mystery-1']);
    expect(c.total).toEqual(ZERO_COST);
    expect(c.byModel['mystery-1']).toBeUndefined();
  });

  it('addCost rounds to 1e-6', () => {
    const r = addCost({ ...ZERO_COST, input: 0.1 }, { ...ZERO_COST, input: 0.2 });
    expect(r.input).toBe(0.3);
    expect(r.total).toBe(0.3);
  });

  it('merges reports', async () => {
    const p = await loadPricing();
    const a = computeCost(tx([assistantLine({ model: 'claude-opus-5', usage: { output: M } })]), p);
    const b = computeCost(tx([assistantLine({ model: 'claude-opus-5', usage: { output: M } }), assistantLine({ model: 'zz', usage: { output: 1 } })]), p);
    const m = mergeCostReports([a, b], p.asOf);
    expect(m.byModel['claude-opus-5']?.output).toBe(50);
    expect(m.total.total).toBe(50);
    expect(m.unknownModels).toEqual(['zz']);
  });
});
