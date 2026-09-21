import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { listSessions } from '../../discovery/listSessions.js';
import type { ServerContext } from '../context.js';
import { ok, failFrom } from '../respond.js';

const MAX_LIMIT = 200;

export function registerListSessions(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    'list_sessions',
    {
      title: 'List sessions',
      description:
        'List Claude Code sessions (newest first) with project, dates, turn count, models and title. Use it to find a session id for the other tools.',
      inputSchema: z.object({
        project: z.string().optional().describe('Case-insensitive substring filter on the project directory name'),
        since: z.string().optional().describe('ISO date; only sessions modified at or after this'),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('Max rows (default 20)')
      })
    },
    async (args) => {
      try {
        const rows = await listSessions(ctx.roots, args);
        return ok(rows, `${rows.length} session(s)${args.project ? ` matching "${args.project}"` : ''}.`);
      } catch (e) {
        return failFrom(e);
      }
    }
  );
}
