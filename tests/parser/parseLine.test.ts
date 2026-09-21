import { describe, it, expect } from 'vitest';
import { parseLine } from '../../src/parser/parseLine.js';
import { assistantLine, userLine, titleLine, toolUse, toolResult } from '../helpers/lines.js';

describe('parseLine', () => {
  it('parses assistant usage incl. cache split and thinking', () => {
    const r = parseLine(assistantLine({
      usage: { input: 6, cacheRead: 100, c5m: 50, c1h: 20, output: 30, thinking: 25 },
      content: [{ type: 'text', text: 'abcd' }, toolUse('t1', 'Read', { file_path: '/a' })]
    }));
    expect(r.kind).toBe('turn');
    if (r.kind !== 'turn' || r.turn.kind !== 'assistant') throw new Error('bad');
    expect(r.turn.usage).toEqual({ input: 6, cacheRead: 100, cacheCreate5m: 50, cacheCreate1h: 20, output: 30, thinking: 25 });
    expect(r.turn.toolCalls).toEqual([{ id: 't1', name: 'Read', input: { file_path: '/a' } }]);
    expect(r.turn.textChars).toBe(4);
    expect(r.turn.model).toBe('claude-opus-5');
    expect(r.turn.isSidechain).toBe(false);
  });

  it('falls back to cache_creation_input_tokens as 5m when sub-object missing', () => {
    const raw = JSON.parse(assistantLine({ usage: { c5m: 40 } }));
    delete raw.message.usage.cache_creation;
    const r = parseLine(JSON.stringify(raw));
    if (r.kind !== 'turn' || r.turn.kind !== 'assistant') throw new Error('bad');
    expect(r.turn.usage.cacheCreate5m).toBe(40);
    expect(r.turn.usage.cacheCreate1h).toBe(0);
  });

  it('parses user tool_results with byte sizes and binary flag', () => {
    const r = parseLine(userLine({
      content: [toolResult('t1', 'x'.repeat(400)), toolResult('t2', [{ type: 'image', source: { type: 'base64', data: 'AAAA' } }])]
    }));
    if (r.kind !== 'turn' || r.turn.kind !== 'user') throw new Error('bad');
    expect(r.turn.toolResults[0]).toEqual({ toolUseId: 't1', bytes: 402, isBinary: false });
    expect(r.turn.toolResults[1]?.isBinary).toBe(true);
  });

  it('measures plain string user prompts', () => {
    const r = parseLine(userLine({ content: 'hello world' }));
    if (r.kind !== 'turn' || r.turn.kind !== 'user') throw new Error('bad');
    expect(r.turn.promptChars).toBe(11);
    expect(r.turn.toolResults).toEqual([]);
  });

  it('returns title for ai-title lines', () => {
    expect(parseLine(titleLine('My session'))).toEqual({ kind: 'title', title: 'My session' });
  });

  it('skips irrelevant types and blank lines', () => {
    expect(parseLine(JSON.stringify({ type: 'queue-operation' }))).toEqual({ kind: 'skip' });
    expect(parseLine('   ')).toEqual({ kind: 'skip' });
  });

  it('flags malformed JSON and non-objects as warning', () => {
    expect(parseLine('{not json')).toEqual({ kind: 'warning' });
    expect(parseLine('[1,2]')).toEqual({ kind: 'warning' });
  });

  it('flags assistant line without usage and user line without message as warning', () => {
    expect(parseLine(JSON.stringify({ type: 'assistant', uuid: 'a', message: { model: 'm', content: [] } }))).toEqual({ kind: 'warning' });
    expect(parseLine(JSON.stringify({ type: 'user', uuid: 'u' }))).toEqual({ kind: 'warning' });
  });
});
