import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseTranscript } from '../../src/parser/parseTranscript.js';
import { summarize } from '../../src/analysis/summarize.js';
import { attributeResults } from '../../src/analysis/attribution.js';
import { loadPricing } from '../../src/pricing/pricing.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'real-anonymized.jsonl');

describe('real anonymized transcript', () => {
  it('parses cleanly with full attribution and a positive cost', async () => {
    const t = await parseTranscript(FIXTURE);
    expect(t.turns.length).toBeGreaterThan(30);
    expect(t.parseWarnings).toBe(0);
    const s = summarize(t, await loadPricing());
    expect(s.cost.total.total).toBeGreaterThan(0);
    expect(s.cost.unknownModels).toEqual([]);
    expect(s.peakContext.tokens).toBeGreaterThan(0);
    const results = attributeResults(t);
    const orphans = results.filter((r) => r.tool === 'unknown').length;
    expect(results.length).toBeGreaterThan(10);
    expect(orphans / results.length).toBeLessThan(0.05);
  });
});
