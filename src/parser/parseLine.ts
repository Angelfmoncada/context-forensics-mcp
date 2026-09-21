import type { AssistantTurn, ParsedLine, ToolCall, ToolResult, Usage, UserTurn } from './types.js';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** Parse one JSONL line of a Claude Code transcript. Never throws. */
export function parseLine(raw: string): ParsedLine {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'skip' };
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return { kind: 'warning' };
  }
  if (!isObj(obj)) return { kind: 'warning' };
  switch (obj['type']) {
    case 'assistant':
      return parseAssistant(obj);
    case 'user':
      return parseUser(obj);
    case 'ai-title':
      return { kind: 'title', title: str(obj['aiTitle']) };
    default:
      return { kind: 'skip' };
  }
}

function parseUsage(u: unknown): Usage | null {
  if (!isObj(u)) return null;
  const cc = isObj(u['cache_creation']) ? u['cache_creation'] : null;
  const details = isObj(u['output_tokens_details']) ? u['output_tokens_details'] : null;
  return {
    input: num(u['input_tokens']),
    cacheRead: num(u['cache_read_input_tokens']),
    cacheCreate5m: cc ? num(cc['ephemeral_5m_input_tokens']) : num(u['cache_creation_input_tokens']),
    cacheCreate1h: cc ? num(cc['ephemeral_1h_input_tokens']) : 0,
    output: num(u['output_tokens']),
    thinking: details ? num(details['thinking_tokens']) : 0
  };
}

function parseAssistant(o: Obj): ParsedLine {
  const m = isObj(o['message']) ? o['message'] : null;
  const usage = m ? parseUsage(m['usage']) : null;
  if (!m || !usage) return { kind: 'warning' };
  const blocks = Array.isArray(m['content']) ? m['content'].filter(isObj) : [];
  const toolCalls: ToolCall[] = blocks
    .filter((b) => b['type'] === 'tool_use')
    .map((b) => ({ id: str(b['id']), name: str(b['name'], 'unknown'), input: isObj(b['input']) ? b['input'] : {} }));
  const textChars = blocks.filter((b) => b['type'] === 'text').reduce((n, b) => n + str(b['text']).length, 0);
  const turn: AssistantTurn = {
    kind: 'assistant',
    uuid: str(o['uuid']),
    timestamp: str(o['timestamp']),
    isSidechain: o['isSidechain'] === true,
    model: str(m['model'], 'unknown'),
    usage,
    toolCalls,
    textChars
  };
  return { kind: 'turn', turn };
}

function parseUser(o: Obj): ParsedLine {
  const m = isObj(o['message']) ? o['message'] : null;
  if (!m) return { kind: 'warning' };
  const content = m['content'];
  const blocks = Array.isArray(content) ? content.filter(isObj) : [];
  const toolResults: ToolResult[] = blocks
    .filter((b) => b['type'] === 'tool_result')
    .map((b) => ({
      toolUseId: str(b['tool_use_id']),
      bytes: Buffer.byteLength(JSON.stringify(b['content'] ?? ''), 'utf8'),
      isBinary: hasBinary(b['content'])
    }));
  const turn: UserTurn = {
    kind: 'user',
    uuid: str(o['uuid']),
    timestamp: str(o['timestamp']),
    isSidechain: o['isSidechain'] === true,
    toolResults,
    promptChars: typeof content === 'string' ? content.length : 0
  };
  return { kind: 'turn', turn };
}

function hasBinary(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((c) => isObj(c) && (c['type'] === 'image' || (isObj(c['source']) && c['source']['type'] === 'base64')));
}
