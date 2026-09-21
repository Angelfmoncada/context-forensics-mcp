import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer } from '../../src/server/createServer.js';
import { loadPricing } from '../../src/pricing/pricing.js';
import { mkTmpRoot } from '../helpers/tmpRoot.js';
import { assistantLine, userLine, toolUse, toolResult, titleLine } from '../helpers/lines.js';

interface Envelope { ok: boolean; data?: unknown; error?: string; hint?: string; summary?: string }

let client: Client;

async function call(name: string, args: Record<string, unknown>): Promise<Envelope> {
  const r = await client.callTool({ name, arguments: args });
  const first = (r.content as { type: string; text: string }[])[0];
  return JSON.parse(first?.text ?? '{}') as Envelope;
}

beforeAll(async () => {
  const root = mkTmpRoot([{ project: 'demo', id: 'sess1', lines: [
    titleLine('Demo'),
    userLine({ ts: '2026-09-20T10:00:00.000Z' }),
    assistantLine({ ts: '2026-09-20T10:00:01.000Z', usage: { input: 100, output: 50 }, content: [toolUse('r1', 'Read', { file_path: '/a.ts' })] }),
    userLine({ ts: '2026-09-20T10:00:02.000Z', content: [toolResult('r1', 'x'.repeat(4000))] }),
    assistantLine({ ts: '2026-09-20T10:00:03.000Z', usage: { cacheRead: 100, c5m: 1100, output: 10 } })
  ] }]);
  const server = createServer({ roots: [root], pricing: await loadPricing() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientTransport);
});

describe('MCP tools', () => {
  it('lists all six tools with descriptions', async () => {
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(['analyze_session', 'diff_context_growth', 'estimate_cost', 'list_sessions', 'rank_token_hogs', 'suggest_compaction']);
    expect(tools.every((t) => (t.description ?? '').length > 20)).toBe(true);
  });

  it('list_sessions', async () => {
    const r = await call('list_sessions', {});
    expect(r.ok).toBe(true);
    expect((r.data as { id: string; title: string }[])[0]).toMatchObject({ id: 'sess1', title: 'Demo' });
    expect((await call('list_sessions', { project: 'nomatch' })).summary).toMatch(/0 session/);
  });

  it('analyze_session latest', async () => {
    const r = await call('analyze_session', { session: 'latest' });
    expect(r.ok).toBe(true);
    expect((r.data as { title: string; turns: { assistant: number } })).toMatchObject({ title: 'Demo', turns: { assistant: 2 } });
    expect(r.summary).toMatch(/2 assistant turns/);
  });

  it('rank_token_hogs by file and empty summary', async () => {
    const r = await call('rank_token_hogs', { session: 'sess1', by: 'file' });
    expect((r.data as { key: string }[])[0]?.key).toBe('/a.ts');
    expect((await call('rank_token_hogs', { session: 'sess1', by: 'mcp_server' })).summary).toMatch(/No tool results/);
  });

  it('estimate_cost by session and by project; rejects both/none', async () => {
    expect((await call('estimate_cost', { session: 'sess1' })).ok).toBe(true);
    const p = await call('estimate_cost', { project: 'demo', since: '2026-01-01', until: '2027-01-01' });
    expect(p.ok).toBe(true);
    expect((p.data as { sessions: number }).sessions).toBe(1);
    expect((await call('estimate_cost', {})).ok).toBe(false);
    expect((await call('estimate_cost', { session: 'sess1', project: 'demo' })).ok).toBe(false);
  });

  it('rejects malformed dates instead of silently matching nothing', async () => {
    const bad = await client.callTool({ name: 'list_sessions', arguments: { since: 'not-a-date' } });
    expect(bad.isError).toBe(true);
    expect((bad.content as { text: string }[])[0]?.text).toMatch(/ISO date/);
    const badCost = await client.callTool({ name: 'estimate_cost', arguments: { project: 'demo', until: '2026-13-01' } });
    expect(badCost.isError).toBe(true);
    const good = await call('list_sessions', { since: '2026-9-1' });
    expect(good.ok).toBe(true);
  });

  it('project cost reports truncated=false when under the limit', async () => {
    const p = await call('estimate_cost', { project: 'demo' });
    expect((p.data as { truncated: boolean }).truncated).toBe(false);
    expect(p.summary).not.toMatch(/most recent/);
  });

  it('diff_context_growth', async () => {
    const r = await call('diff_context_growth', { session: 'sess1', minDelta: 0 });
    expect((r.data as { peak: { contextTokens: number } }).peak.contextTokens).toBe(1200);
  });

  it('suggest_compaction', async () => {
    const r = await call('suggest_compaction', { session: 'sess1' });
    expect(r.ok).toBe(true);
    expect(r.summary).toMatch(/No compaction findings/);
  });

  it('unknown session returns ok:false with hint', async () => {
    const r = await call('analyze_session', { session: 'nope' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Session not found/);
    expect(r.hint).toMatch(/list_sessions/);
  });

  it('rejects invalid input via schema with isError', async () => {
    const r = await client.callTool({ name: 'rank_token_hogs', arguments: { session: 'sess1', by: 'galaxy' } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0]?.text).toMatch(/Invalid option/);
  });
});
