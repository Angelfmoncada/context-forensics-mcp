type UsageIn = { input?: number; cacheRead?: number; c5m?: number; c1h?: number; output?: number; thinking?: number };
export type Block = Record<string, unknown>;

export function assistantLine(o: {
  uuid?: string; ts?: string; model?: string; usage?: UsageIn; content?: Block[]; sidechain?: boolean;
}): string {
  const u = o.usage ?? {};
  return JSON.stringify({
    type: 'assistant',
    uuid: o.uuid ?? 'a1',
    parentUuid: null,
    timestamp: o.ts ?? '2026-09-20T10:00:00.000Z',
    isSidechain: o.sidechain ?? false,
    message: {
      model: o.model ?? 'claude-opus-5',
      role: 'assistant',
      content: o.content ?? [{ type: 'text', text: 'hi' }],
      usage: {
        input_tokens: u.input ?? 0,
        output_tokens: u.output ?? 0,
        cache_read_input_tokens: u.cacheRead ?? 0,
        cache_creation_input_tokens: (u.c5m ?? 0) + (u.c1h ?? 0),
        cache_creation: { ephemeral_5m_input_tokens: u.c5m ?? 0, ephemeral_1h_input_tokens: u.c1h ?? 0 },
        output_tokens_details: { thinking_tokens: u.thinking ?? 0 }
      }
    }
  });
}

export function toolUse(id: string, name: string, input: Record<string, unknown> = {}): Block {
  return { type: 'tool_use', id, name, input };
}

export function toolResult(toolUseId: string, content: unknown): Block {
  return { type: 'tool_result', tool_use_id: toolUseId, content };
}

export function userLine(o: { uuid?: string; ts?: string; content?: Block[] | string; sidechain?: boolean }): string {
  return JSON.stringify({
    type: 'user',
    uuid: o.uuid ?? 'u1',
    parentUuid: null,
    timestamp: o.ts ?? '2026-09-20T10:00:01.000Z',
    isSidechain: o.sidechain ?? false,
    message: { role: 'user', content: o.content ?? 'hello' }
  });
}

export function titleLine(title: string): string {
  return JSON.stringify({ type: 'ai-title', aiTitle: title, sessionId: 's' });
}
