import { McpServer } from '@modelcontextprotocol/server';
import type { ServerContext } from './context.js';
import { registerListSessions } from './tools/listSessions.js';
import { registerAnalyzeSession } from './tools/analyzeSession.js';
import { registerRankTokenHogs } from './tools/rankTokenHogs.js';
import { registerEstimateCost } from './tools/estimateCost.js';
import { registerDiffContextGrowth } from './tools/diffContextGrowth.js';
import { registerSuggestCompaction } from './tools/suggestCompaction.js';

export const SERVER_NAME = 'context-forensics-mcp';
export const SERVER_VERSION = '0.1.0';

const REGISTRARS = [
  registerListSessions,
  registerAnalyzeSession,
  registerRankTokenHogs,
  registerEstimateCost,
  registerDiffContextGrowth,
  registerSuggestCompaction
] as const;

export function createServer(ctx: ServerContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  for (const register of REGISTRARS) register(server, ctx);
  return server;
}
