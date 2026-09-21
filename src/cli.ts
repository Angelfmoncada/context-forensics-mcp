#!/usr/bin/env node
import { getRoots } from './discovery/roots.js';
import { loadPricing } from './pricing/pricing.js';
import { resolveSession } from './discovery/resolveSession.js';
import { listSessions } from './discovery/listSessions.js';
import { parseTranscript } from './parser/parseTranscript.js';
import { summarize, type Summary } from './analysis/summarize.js';

const USAGE = 'Usage:\n  context-forensics report [<session-id>|<path.jsonl>|latest]\n  context-forensics list [<project-substring>]';
const fmt = (n: number): string => n.toLocaleString('en-US');

function renderReport(s: Summary): string {
  const pct = s.peakContext.pctOfWindow !== null ? ` (${s.peakContext.pctOfWindow}% of window)` : '';
  const unknown = s.cost.unknownModels.length ? ` — unknown models: ${s.cost.unknownModels.join(', ')}` : '';
  return [
    `Session ${s.id}${s.title ? ` — ${s.title}` : ''}`,
    `Turns:   ${s.turns.assistant} assistant / ${s.turns.user} user / ${s.turns.sidechain} sidechain`,
    `Models:  ${Object.entries(s.models).map(([m, n]) => `${m} ×${n}`).join(', ') || 'none'}`,
    `Tokens:  input ${fmt(s.tokens.input)} | cache read ${fmt(s.tokens.cacheRead)} | cache write 5m ${fmt(s.tokens.cacheCreate5m)} / 1h ${fmt(s.tokens.cacheCreate1h)} | output ${fmt(s.tokens.output)} (thinking ${fmt(s.tokens.thinking)})`,
    `Cost:    $${s.cost.total.total.toFixed(4)} (pricing ${s.cost.pricingAsOf})${unknown}`,
    `Peak:    ${fmt(s.peakContext.tokens)} tokens at turn ${s.peakContext.turnIndex}${pct}`,
    'Top hogs:',
    ...s.topHogs.map((h) => `  ${h.key}: ~${fmt(h.approxTokens)} tokens, ${h.calls} call(s), ${h.pctOfToolBytes}%`),
    'Findings:',
    ...(s.topFindings.length ? s.topFindings.map((f) => `  [${f.severity}] ${f.title} — ${f.evidence}`) : ['  none'])
  ].join('\n');
}

async function report(ref: string): Promise<string> {
  const roots = getRoots(process.env);
  const pricing = await loadPricing(process.env['CONTEXT_FORENSICS_PRICING']);
  return renderReport(summarize(await parseTranscript(await resolveSession(ref, roots)), pricing));
}

async function list(project: string | undefined): Promise<string> {
  const rows = await listSessions(getRoots(process.env), { project, limit: 20 });
  if (rows.length === 0) return 'No sessions found.';
  return rows.map((r) => `${(r.endedAt ?? '?').slice(0, 19)}  ${r.id.slice(0, 8)}  ${String(r.turns).padStart(5)} turns  ${r.project}${r.title ? `  — ${r.title}` : ''}`).join('\n');
}

const [command, arg] = process.argv.slice(2);
const run = command === 'report' ? report(arg ?? 'latest') : command === 'list' ? list(arg) : Promise.resolve(USAGE);
run
  .then((out) => console.log(out))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
