import type { Transcript, Usage } from '../parser/types.js';
import { lookupModel, type Pricing } from '../pricing/pricing.js';
import { attributeResults, type AttributedResult } from './attribution.js';

export interface GrowthCause { readonly tool: string; readonly approxTokens: number; readonly filePath: string | undefined }

export interface GrowthPoint {
  readonly turnIndex: number;
  readonly timestamp: string;
  readonly contextTokens: number;
  readonly delta: number;
  readonly pctOfWindow: number | null;
  readonly cause: GrowthCause | undefined;
}

export interface GrowthReport {
  readonly windowTokens: number | null;
  readonly peak: { readonly turnIndex: number; readonly contextTokens: number };
  readonly timeline: readonly GrowthPoint[];
  readonly crossed80At: number | undefined;
  readonly crossed90At: number | undefined;
}

const NO_PEAK = { turnIndex: -1, contextTokens: 0 } as const;

/** Everything the model had to read on this turn: fresh input plus cache reads and writes. */
export const contextSize = (u: Usage): number => u.input + u.cacheRead + u.cacheCreate5m + u.cacheCreate1h;

const pctOf = (n: number, window: number | null): number | null => (window ? Math.round((n / window) * 1000) / 10 : null);

/** Context window of the first assistant model, or null when the model is unknown. */
export function windowFor(t: Transcript, pricing: Pricing): number | null {
  const first = t.turns.find((x) => x.kind === 'assistant');
  return first?.kind === 'assistant' ? (lookupModel(pricing, first.model)?.contextWindow ?? null) : null;
}

function largestResultBetween(results: readonly AttributedResult[], from: number, to: number): GrowthCause | undefined {
  const best = results
    .filter((r) => r.turnIndex > from && r.turnIndex < to)
    .reduce<AttributedResult | undefined>((b, r) => (b === undefined || r.bytes > b.bytes ? r : b), undefined);
  return best ? { tool: best.tool, approxTokens: best.approxTokens, filePath: best.filePath } : undefined;
}

/** Context size per main-thread assistant turn, with the tool result most likely responsible for each jump. */
export function contextGrowth(t: Transcript, minDelta: number, pricing: Pricing): GrowthReport {
  const windowTokens = windowFor(t, pricing);
  const results = attributeResults(t);
  const points = t.turns.flatMap((turn, i) =>
    turn.kind === 'assistant' && !turn.isSidechain ? [{ i, ts: turn.timestamp, ctx: contextSize(turn.usage) }] : []
  );
  const all: readonly GrowthPoint[] = points.map((p, k) => {
    const prev = points[k - 1];
    return {
      turnIndex: p.i,
      timestamp: p.ts,
      contextTokens: p.ctx,
      delta: prev ? p.ctx - prev.ctx : p.ctx,
      pctOfWindow: pctOf(p.ctx, windowTokens),
      cause: prev ? largestResultBetween(results, prev.i, p.i) : undefined
    };
  });
  const peak = all.reduce<{ turnIndex: number; contextTokens: number }>(
    (best, p) => (p.contextTokens > best.contextTokens ? { turnIndex: p.turnIndex, contextTokens: p.contextTokens } : best),
    NO_PEAK
  );
  const timeline = all.filter((p, k) => k === 0 || p.turnIndex === peak.turnIndex || Math.abs(p.delta) >= minDelta);
  const crossing = (frac: number): number | undefined =>
    windowTokens ? all.find((p) => p.contextTokens >= windowTokens * frac)?.turnIndex : undefined;
  return { windowTokens, peak, timeline, crossed80At: crossing(0.8), crossed90At: crossing(0.9) };
}
