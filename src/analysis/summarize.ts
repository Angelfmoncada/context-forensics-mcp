import type { Transcript, Usage } from '../parser/types.js';
import { ZERO_USAGE } from '../parser/types.js';
import type { Pricing } from '../pricing/pricing.js';
import { computeCost, type CostReport } from './cost.js';
import { rankHogs, type HogRow } from './hogs.js';
import { contextGrowth } from './growth.js';
import { suggestCompaction, type Finding } from './compaction.js';

export interface Summary {
  readonly id: string;
  readonly path: string;
  readonly title: string | undefined;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly durationMs: number | null;
  readonly turns: { readonly assistant: number; readonly user: number; readonly sidechain: number };
  readonly models: Readonly<Record<string, number>>;
  readonly tokens: Usage;
  readonly cost: CostReport;
  readonly peakContext: { readonly tokens: number; readonly turnIndex: number; readonly pctOfWindow: number | null };
  readonly topHogs: readonly HogRow[];
  readonly topFindings: readonly Finding[];
  readonly parseWarnings: number;
}

const TOP_N = 3;

const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheCreate5m: a.cacheCreate5m + b.cacheCreate5m,
  cacheCreate1h: a.cacheCreate1h + b.cacheCreate1h,
  output: a.output + b.output,
  thinking: a.thinking + b.thinking
});

/** One-call overview of a session; the other analyses are its building blocks. */
export function summarize(t: Transcript, pricing: Pricing): Summary {
  const assistant = t.turns.flatMap((x) => (x.kind === 'assistant' ? [x] : []));
  const stamped = t.turns.filter((x) => x.timestamp !== '');
  const times = stamped.map((x) => Date.parse(x.timestamp)).filter(Number.isFinite);
  const models = assistant.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.model]: (acc[x.model] ?? 0) + 1 }), {});
  const growth = contextGrowth(t, Number.MAX_SAFE_INTEGER, pricing);
  const pctOfWindow = growth.windowTokens ? Math.round((growth.peak.contextTokens / growth.windowTokens) * 1000) / 10 : null;
  return {
    id: t.sessionId,
    path: t.path,
    title: t.title,
    startedAt: stamped[0]?.timestamp ?? null,
    endedAt: stamped[stamped.length - 1]?.timestamp ?? null,
    durationMs: times.length >= 2 ? Math.max(...times) - Math.min(...times) : null,
    turns: { assistant: assistant.length, user: t.turns.length - assistant.length, sidechain: t.turns.filter((x) => x.isSidechain).length },
    models,
    tokens: assistant.reduce((acc, x) => addUsage(acc, x.usage), ZERO_USAGE),
    cost: computeCost(t, pricing),
    peakContext: { tokens: growth.peak.contextTokens, turnIndex: growth.peak.turnIndex, pctOfWindow },
    topHogs: rankHogs(t, 'tool', TOP_N),
    topFindings: suggestCompaction(t, pricing).slice(0, TOP_N),
    parseWarnings: t.parseWarnings
  };
}
