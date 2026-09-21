import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveSession } from '../../discovery/resolveSession.js';
import { parseTranscript } from '../../parser/parseTranscript.js';
import { contextGrowth } from '../../analysis/growth.js';
import { SESSION_REF_DESC, type ServerContext } from '../context.js';
import { ok, failFrom } from '../respond.js';

const DEFAULT_MIN_DELTA = 2000;

export function registerDiffContextGrowth(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    'diff_context_growth',
    {
      title: 'Diff context growth',
      description:
        'Turn-by-turn timeline of context size with the tool result that caused each jump, percent of the model window, and the turns where 80% and 90% were crossed.',
      inputSchema: z.object({
        session: z.string().describe(SESSION_REF_DESC),
        minDelta: z.number().int().min(0).optional().describe(`Only list turns whose context changed by at least this many tokens (default ${DEFAULT_MIN_DELTA})`)
      })
    },
    async ({ session, minDelta }) => {
      try {
        const g = contextGrowth(await parseTranscript(await resolveSession(session, ctx.roots)), minDelta ?? DEFAULT_MIN_DELTA, ctx.pricing);
        const cross = g.crossed80At !== undefined ? ` Crossed 80% of the window at turn ${g.crossed80At}.` : '';
        return ok(g, `Peak ${g.peak.contextTokens} tokens at turn ${g.peak.turnIndex}; ${g.timeline.length} notable point(s).${cross}`);
      } catch (e) {
        return failFrom(e);
      }
    }
  );
}
