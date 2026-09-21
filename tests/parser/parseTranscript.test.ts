import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseTranscript } from '../../src/parser/parseTranscript.js';
import { mkTmpRoot } from '../helpers/tmpRoot.js';
import { assistantLine, userLine, titleLine } from '../helpers/lines.js';

describe('parseTranscript', () => {
  it('streams a file into turns, title and warning count', async () => {
    const root = mkTmpRoot([{ project: 'p', id: 'abc', lines: [titleLine('T'), userLine({}), assistantLine({}), '{bad', ''] }]);
    const t = await parseTranscript(join(root, 'p', 'abc.jsonl'));
    expect(t.sessionId).toBe('abc');
    expect(t.title).toBe('T');
    expect(t.turns.map((x) => x.kind)).toEqual(['user', 'assistant']);
    expect(t.parseWarnings).toBe(1);
    expect(t.path).toBe(join(root, 'p', 'abc.jsonl'));
  });

  it('rejects a missing file with a clear error', async () => {
    await expect(parseTranscript('/nope/x.jsonl')).rejects.toThrow(/Transcript not found/);
  });
});
