import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveSession } from '../../discovery/resolveSession.js';
import { listSessions } from '../../discovery/listSessions.js';
import { parseTranscript } from '../../parser/parseTranscript.js';
import { computeCost, mergeCostReports } from '../../analysis/cost.js';
import { SESSION_REF_DESC, type ServerContext } from '../context.js';
import { ok, fail, failFrom, type ToolReply } from '../respond.js';

const PROJECT_LIMIT = 200;

async function costOfSession(session: string, ctx: ServerContext): Promise<ToolReply> {
  const c = computeCost(await parseTranscript(await resolveSession(session, ctx.roots)), ctx.pricing);
  const unknown = c.unknownModels.length ? ` Unknown models (not priced): ${c.unknownModels.join(', ')}.` : '';
  return ok(c, `$${c.total.total.toFixed(4)} (pricing as of ${c.pricingAsOf}).${unknown}`);
}

async function costOfProject(project: string, since: string | undefined, until: string | undefined, ctx: ServerContext): Promise<ToolReply> {
  const untilMs = until ? Date.parse(until) : Number.POSITIVE_INFINITY;
  const rows = (await listSessions(ctx.roots, { project, ...(since !== undefined && { since }), limit: PROJECT_LIMIT }))
    .filter((r) => r.endedAt === null || Date.parse(r.endedAt) <= untilMs);
  const reports = await Promise.all(rows.map(async (r) => computeCost(await parseTranscript(r.path), ctx.pricing)));
  const merged = mergeCostReports(reports, ctx.pricing.asOf);
  return ok({ sessions: rows.length, ...merged }, `${rows.length} session(s) in "${project}": $${merged.total.total.toFixed(2)}.`);
}

export function registerEstimateCost(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    'estimate_cost',
    {
      title: 'Estimate cost',
      description:
        'Exact USD cost from recorded usage, split by model and by bucket (input, cache read, 5m/1h cache write, output). Give either one session, or a project name plus optional date range to aggregate.',
      inputSchema: z.object({
        session: z.string().optional().describe(SESSION_REF_DESC),
        project: z.string().optional().describe('Project directory substring; aggregates all matching sessions'),
        since: z.string().optional().describe('ISO date lower bound (project mode)'),
        until: z.string().optional().describe('ISO date upper bound (project mode)')
      })
    },
    async ({ session, project, since, until }) => {
      if ((session ? 1 : 0) + (project ? 1 : 0) !== 1) {
        return fail('Provide exactly one of "session" or "project".', 'Example: {"session":"latest"} or {"project":"my-app","since":"2026-09-01"}.');
      }
      try {
        return session ? await costOfSession(session, ctx) : await costOfProject(project ?? '', since, until, ctx);
      } catch (e) {
        return failFrom(e);
      }
    }
  );
}
