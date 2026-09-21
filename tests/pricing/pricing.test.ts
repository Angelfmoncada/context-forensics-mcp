import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPricing, lookupModel } from '../../src/pricing/pricing.js';

function tmpJson(content: string): string {
  const f = join(mkdtempSync(join(tmpdir(), 'cfm-price-')), 'p.json');
  writeFileSync(f, content);
  return f;
}

describe('pricing', () => {
  it('loads bundled table', async () => {
    const p = await loadPricing();
    expect(p.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lookupModel(p, 'claude-opus-5')?.output).toBe(25);
  });

  it('matches dated ids by longest prefix', async () => {
    const p = await loadPricing();
    expect(lookupModel(p, 'claude-sonnet-5-20260401')?.input).toBe(2);
    expect(lookupModel(p, 'claude-fable-5-1')?.cacheRead).toBe(0.25);
    expect(lookupModel(p, 'claude-fable-5-20260101')?.cacheRead).toBe(1);
  });

  it('returns null for unknown model', async () => {
    expect(lookupModel(await loadPricing(), 'gpt-9')).toBeNull();
  });

  it('merges an override file over the bundled table', async () => {
    const f = tmpJson(JSON.stringify({ asOf: '2030-01-01', models: { 'claude-opus-5': { output: 1 } } }));
    const p = await loadPricing(f);
    expect(p.asOf).toBe('2030-01-01');
    expect(lookupModel(p, 'claude-opus-5')?.output).toBe(1);
    expect(lookupModel(p, 'claude-opus-5')?.input).toBe(5);
    expect(lookupModel(p, 'claude-haiku-4-5')?.output).toBe(5);
  });

  it('rejects an invalid override and a missing file', async () => {
    await expect(loadPricing(tmpJson('{"models": {"x": {"input": "no"}}}'))).rejects.toThrow(/pricing/i);
    await expect(loadPricing(tmpJson('{"models": {"brand-new": {"input": 1}}}'))).rejects.toThrow(/incomplete/i);
    await expect(loadPricing('/nope/p.json')).rejects.toThrow(/pricing/i);
  });
});
