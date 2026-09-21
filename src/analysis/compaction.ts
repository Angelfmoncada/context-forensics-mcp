import type { Transcript } from '../parser/types.js';
import type { Pricing } from '../pricing/pricing.js';
import { attributeResults, type AttributedResult } from './attribution.js';
import { contextGrowth } from './growth.js';

export type FindingKind = 'repeated_read' | 'oversized_result' | 'binary_in_context' | 'thinking_heavy' | 'window_pressure' | 'noisy_bash';
export type Severity = 'high' | 'medium' | 'low';

export interface Finding {
  readonly kind: FindingKind;
  readonly severity: Severity;
  readonly title: string;
  readonly evidence: string;
  readonly estSavingsTokens: number;
}

const OVERSIZED_TOKENS = 20_000;
const NOISY_BASH_TOKENS = 5_000;
const NOISY_BASH_MIN_CALLS = 5;
const REPEAT_MIN_READS = 3;
const THINKING_RATIO = 5;
const WINDOW_TARGET_FRACTION = 0.5;
const SEVERITY_RANK: Readonly<Record<Severity, number>> = { high: 0, medium: 1, low: 2 };

const sumTokens = (rs: readonly AttributedResult[]): number => rs.reduce((n, r) => n + r.approxTokens, 0);

function groupByFile(results: readonly AttributedResult[]): ReadonlyMap<string, readonly AttributedResult[]> {
  const byFile = new Map<string, AttributedResult[]>();
  for (const r of results) {
    if (r.tool !== 'Read' || !r.filePath) continue;
    byFile.set(r.filePath, [...(byFile.get(r.filePath) ?? []), r]);
  }
  return byFile;
}

function repeatedReads(results: readonly AttributedResult[]): readonly Finding[] {
  return [...groupByFile(results).entries()]
    .filter(([, rs]) => rs.length >= REPEAT_MIN_READS)
    .map(([file, rs]) => {
      const total = sumTokens(rs);
      const savings = total - (rs[0]?.approxTokens ?? 0);
      return {
        kind: 'repeated_read' as const,
        severity: savings > OVERSIZED_TOKENS ? ('high' as const) : ('medium' as const),
        title: `${file} read ${rs.length}×`,
        evidence: `${rs.length} Read calls, ~${total} tokens total; keep one read and use offset/limit for later lookups`,
        estSavingsTokens: savings
      };
    });
}

function oversized(results: readonly AttributedResult[]): readonly Finding[] {
  return results
    .filter((r) => r.approxTokens > OVERSIZED_TOKENS)
    .map((r) => ({
      kind: 'oversized_result' as const,
      severity: 'high' as const,
      title: `${r.tool} result ~${r.approxTokens} tokens at turn ${r.turnIndex}`,
      evidence: r.filePath ? `file ${r.filePath}` : `tool ${r.tool}; truncate, filter or paginate the output`,
      estSavingsTokens: r.approxTokens - OVERSIZED_TOKENS
    }));
}

function binaries(results: readonly AttributedResult[]): readonly Finding[] {
  const bin = results.filter((r) => r.isBinary);
  if (bin.length === 0) return [];
  return [{
    kind: 'binary_in_context',
    severity: 'medium',
    title: `${bin.length} binary/image result(s) in context`,
    evidence: bin.map((r) => `${r.tool}@turn ${r.turnIndex}`).join(', '),
    estSavingsTokens: sumTokens(bin)
  }];
}

function thinkingHeavy(t: Transcript): readonly Finding[] {
  const assistant = t.turns.flatMap((x) => (x.kind === 'assistant' ? [x] : []));
  const thinking = assistant.reduce((n, x) => n + x.usage.thinking, 0);
  const visible = assistant.reduce((n, x) => n + Math.max(0, x.usage.output - x.usage.thinking), 0);
  if (thinking === 0 || thinking <= visible * THINKING_RATIO) return [];
  return [{
    kind: 'thinking_heavy',
    severity: 'low',
    title: `thinking is ${Math.round(thinking / Math.max(visible, 1))}× visible output`,
    evidence: `${thinking} thinking vs ${visible} visible output tokens; consider a lower effort level for routine turns`,
    estSavingsTokens: 0
  }];
}

function windowPressure(t: Transcript, pricing: Pricing): readonly Finding[] {
  const g = contextGrowth(t, Number.MAX_SAFE_INTEGER, pricing);
  if (g.crossed80At === undefined || g.windowTokens === null) return [];
  return [{
    kind: 'window_pressure',
    severity: 'high',
    title: `context crossed 80% of ${g.windowTokens} at turn ${g.crossed80At}`,
    evidence: `peak ${g.peak.contextTokens} tokens at turn ${g.peak.turnIndex}; compact before this point`,
    estSavingsTokens: Math.max(0, g.peak.contextTokens - Math.round(g.windowTokens * WINDOW_TARGET_FRACTION))
  }];
}

function noisyBash(results: readonly AttributedResult[]): readonly Finding[] {
  const noisy = results.filter((r) => r.tool === 'Bash' && r.approxTokens > NOISY_BASH_TOKENS);
  if (noisy.length < NOISY_BASH_MIN_CALLS) return [];
  const total = sumTokens(noisy);
  return [{
    kind: 'noisy_bash',
    severity: 'medium',
    title: `${noisy.length} Bash results over ${NOISY_BASH_TOKENS} tokens`,
    evidence: `~${total} tokens of shell output; pipe through head, tail or grep`,
    estSavingsTokens: total - noisy.length * NOISY_BASH_TOKENS
  }];
}

/** Ordered findings: severity first, then estimated savings. */
export function suggestCompaction(t: Transcript, pricing: Pricing): readonly Finding[] {
  const results = attributeResults(t);
  return [...repeatedReads(results), ...oversized(results), ...binaries(results), ...thinkingHeavy(t), ...windowPressure(t, pricing), ...noisyBash(results)]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.estSavingsTokens - a.estSavingsTokens);
}
