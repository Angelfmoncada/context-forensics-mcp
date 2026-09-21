import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { resolveSession, findTranscripts } from '../../src/discovery/resolveSession.js';
import { mkTmpRoot } from '../helpers/tmpRoot.js';
import { assistantLine } from '../helpers/lines.js';

const old = new Date('2026-01-01T00:00:00Z');
const recent = new Date('2026-09-01T00:00:00Z');
const root = () => mkTmpRoot([
  { project: 'p1', id: 'aaaa', lines: [assistantLine({})], mtime: old },
  { project: 'p2', id: 'bbbb', lines: [assistantLine({})], mtime: recent }
]);

describe('findTranscripts', () => {
  it('finds <root>/<project>/<id>.jsonl and ignores missing roots', async () => {
    const found = await findTranscripts([root(), '/does/not/exist']);
    expect(found.map((f) => f.id).sort()).toEqual(['aaaa', 'bbbb']);
    expect(found.find((f) => f.id === 'bbbb')?.project).toBe('p2');
  });
});

describe('resolveSession', () => {
  it('resolves "latest" to most recently modified', async () => {
    const r = root();
    expect(await resolveSession('latest', [r])).toBe(realpathSync(join(r, 'p2', 'bbbb.jsonl')));
  });
  it('resolves by id', async () => {
    const r = root();
    expect(await resolveSession('aaaa', [r])).toBe(realpathSync(join(r, 'p1', 'aaaa.jsonl')));
  });
  it('resolves by absolute path inside roots', async () => {
    const r = root();
    const p = join(r, 'p1', 'aaaa.jsonl');
    expect(await resolveSession(p, [r])).toBe(realpathSync(p));
  });
  it('rejects a path outside roots', async () => {
    const r = root();
    const other = root();
    await expect(resolveSession(join(other, 'p1', 'aaaa.jsonl'), [r])).rejects.toThrow(/outside allowed roots/);
  });
  it('rejects unknown id, missing path and empty roots', async () => {
    await expect(resolveSession('zzzz', [root()])).rejects.toThrow(/Session not found/);
    await expect(resolveSession('/nope/x.jsonl', [root()])).rejects.toThrow(/Session not found/);
    await expect(resolveSession('latest', ['/does/not/exist'])).rejects.toThrow(/Session not found/);
  });
});
