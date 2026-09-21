#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server/createServer.js';
import { getRoots } from './discovery/roots.js';
import { loadPricing } from './pricing/pricing.js';

async function main(): Promise<void> {
  const pricing = await loadPricing(process.env['CONTEXT_FORENSICS_PRICING']);
  const server = createServer({ roots: getRoots(process.env), pricing });
  await server.connect(new StdioServerTransport());
}

main().catch((e: unknown) => {
  console.error(`context-forensics-mcp failed to start: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
