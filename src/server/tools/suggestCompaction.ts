import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveSession } from '../../discovery/resolveSession.js';
import { parseTranscript } from '../../parser/parseTranscript.js';
import { suggestCompaction } from '../../analysis/compaction.js';
import { SESSION_REF_DESC, type ServerContext } from '../context.js';
import { ok, failFrom } from '../respond.js';

export function registerSuggestCompaction(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    'suggest_compaction',
    {
      title: 'Suggest compaction',
      description:
        'Findings with evidence and estimated token savings: repeated file reads, oversized tool results, binaries in context, thinking-heavy turns, window pressure, noisy shell output.',
      inputSchema: z.object({ session: z.string().describe(SESSION_REF_DESC) })
    },
    async ({ session }) => {
      try {
        const findings = suggestCompaction(await parseTranscript(await resolveSession(session, ctx.roots)), ctx.pricing);
        const savings = findings.reduce((n, f) => n + f.estSavingsTokens, 0);
        const summary = findings.length === 0
          ? 'No compaction findings.'
          : `${findings.length} finding(s), ~${savings} tokens recoverable. Top: ${findings[0]?.title}.`;
        return ok(findings, summary);
      } catch (e) {
        return failFrom(e);
      }
    }
  );
}
