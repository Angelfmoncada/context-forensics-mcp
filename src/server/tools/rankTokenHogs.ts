import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveSession } from '../../discovery/resolveSession.js';
import { parseTranscript } from '../../parser/parseTranscript.js';
import { rankHogs } from '../../analysis/hogs.js';
import { SESSION_REF_DESC, type ServerContext } from '../context.js';
import { ok, failFrom } from '../respond.js';

const DEFAULT_TOP = 10;
const MAX_TOP = 100;

export function registerRankTokenHogs(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    'rank_token_hogs',
    {
      title: 'Rank token hogs',
      description:
        'Rank what filled the context: by tool name, by file path (Read/Write/Edit), or by MCP server. Bytes are exact; tokens are approximate (bytes/4).',
      inputSchema: z.object({
        session: z.string().describe(SESSION_REF_DESC),
        by: z.enum(['tool', 'file', 'mcp_server']).optional().describe('Grouping (default "tool")'),
        top: z.number().int().min(1).max(MAX_TOP).optional().describe(`Rows to return (default ${DEFAULT_TOP})`)
      })
    },
    async ({ session, by, top }) => {
      try {
        const rows = rankHogs(await parseTranscript(await resolveSession(session, ctx.roots)), by ?? 'tool', top ?? DEFAULT_TOP);
        const lead = rows[0];
        const summary = lead
          ? `Top ${by ?? 'tool'}: ${lead.key} (~${lead.approxTokens} tokens over ${lead.calls} call(s), ${lead.pctOfToolBytes}% of tool output).`
          : 'No tool results in this session.';
        return ok(rows, summary);
      } catch (e) {
        return failFrom(e);
      }
    }
  );
}
