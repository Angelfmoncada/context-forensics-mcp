import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveSession } from '../../discovery/resolveSession.js';
import { parseTranscript } from '../../parser/parseTranscript.js';
import { summarize, type Summary } from '../../analysis/summarize.js';
import { SESSION_REF_DESC, type ServerContext } from '../context.js';
import { ok, failFrom } from '../respond.js';

function describe(s: Summary): string {
  const pct = s.peakContext.pctOfWindow !== null ? ` (${s.peakContext.pctOfWindow}% of window)` : '';
  return `${s.turns.assistant} assistant turns, $${s.cost.total.total.toFixed(2)} total, peak context ${s.peakContext.tokens} tokens${pct}, top hog: ${s.topHogs[0]?.key ?? 'none'}.`;
}

export function registerAnalyzeSession(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    'analyze_session',
    {
      title: 'Analyze session',
      description:
        'Full forensic summary of one session: turns, models, exact token buckets (input, cache read, cache write 5m/1h, output, thinking), USD cost, peak context, top token hogs and top compaction findings.',
      inputSchema: z.object({ session: z.string().describe(SESSION_REF_DESC) })
    },
    async ({ session }) => {
      try {
        const s = summarize(await parseTranscript(await resolveSession(session, ctx.roots)), ctx.pricing);
        return ok(s, describe(s));
      } catch (e) {
        return failFrom(e);
      }
    }
  );
}
