import type { Transcript, Usage } from '../parser/types.js';
import { lookupModel, type ModelPrice, type Pricing } from '../pricing/pricing.js';

export interface CostBreakdown {
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheCreate5m: number;
  readonly cacheCreate1h: number;
  readonly output: number;
  readonly total: number;
}

export interface CostReport {
  readonly currency: 'USD';
  readonly pricingAsOf: string;
  readonly byModel: Readonly<Record<string, CostBreakdown>>;
  readonly total: CostBreakdown;
  readonly unknownModels: readonly string[];
}

export const ZERO_COST: CostBreakdown = { input: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0, output: 0, total: 0 };

const PER_MILLION = 1_000_000;
const PRECISION = 1e6;
const round = (n: number): number => Math.round(n * PRECISION) / PRECISION;

/** Sums two breakdowns; `total` is always recomputed from the buckets. */
export function addCost(a: CostBreakdown, b: CostBreakdown): CostBreakdown {
  const input = round(a.input + b.input);
  const cacheRead = round(a.cacheRead + b.cacheRead);
  const cacheCreate5m = round(a.cacheCreate5m + b.cacheCreate5m);
  const cacheCreate1h = round(a.cacheCreate1h + b.cacheCreate1h);
  const output = round(a.output + b.output);
  return { input, cacheRead, cacheCreate5m, cacheCreate1h, output, total: round(input + cacheRead + cacheCreate5m + cacheCreate1h + output) };
}

export function priceUsage(u: Usage, p: ModelPrice): CostBreakdown {
  return addCost(ZERO_COST, {
    input: (u.input / PER_MILLION) * p.input,
    cacheRead: (u.cacheRead / PER_MILLION) * p.cacheRead,
    cacheCreate5m: (u.cacheCreate5m / PER_MILLION) * p.cacheWrite5m,
    cacheCreate1h: (u.cacheCreate1h / PER_MILLION) * p.cacheWrite1h,
    output: (u.output / PER_MILLION) * p.output,
    total: 0
  });
}

function sumByModel(entries: readonly (readonly [string, CostBreakdown])[]): Readonly<Record<string, CostBreakdown>> {
  return entries.reduce<Record<string, CostBreakdown>>(
    (acc, [model, cost]) => ({ ...acc, [model]: addCost(acc[model] ?? ZERO_COST, cost) }),
    {}
  );
}

/** Exact cost from recorded usage. Unknown models are reported, never guessed. */
export function computeCost(t: Transcript, pricing: Pricing): CostReport {
  const assistant = t.turns.flatMap((x) => (x.kind === 'assistant' ? [x] : []));
  const unknownModels = [...new Set(assistant.filter((x) => lookupModel(pricing, x.model) === null).map((x) => x.model))].sort();
  const priced = assistant.flatMap((x) => {
    const price = lookupModel(pricing, x.model);
    return price ? [[x.model, priceUsage(x.usage, price)] as const] : [];
  });
  const byModel = sumByModel(priced);
  return { currency: 'USD', pricingAsOf: pricing.asOf, byModel, total: Object.values(byModel).reduce(addCost, ZERO_COST), unknownModels };
}

export function mergeCostReports(reports: readonly CostReport[], asOf: string): CostReport {
  const byModel = sumByModel(reports.flatMap((r) => Object.entries(r.byModel)));
  const unknownModels = [...new Set(reports.flatMap((r) => r.unknownModels))].sort();
  return { currency: 'USD', pricingAsOf: asOf, byModel, total: Object.values(byModel).reduce(addCost, ZERO_COST), unknownModels };
}
