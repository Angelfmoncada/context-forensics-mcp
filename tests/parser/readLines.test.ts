import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readLines } from '../../src/parser/readLines.js';
import { parseTranscript } from '../../src/parser/parseTranscript.js';
import { assistantLine } from '../helpers/lines.js';

function tmpFile(content: string): string {
  const p = join(mkdtempSync(join(tmpdir(), 'cfm-lines-')), 'f.jsonl');
  writeFileSync(p, content);
  return p;
}
async function collect(path: string, max?: number) {
  const out: string[] = [];
  for await (const ev of readLines(path, max)) out.push(ev.kind === 'line' ? ev.text : '<oversized>');
  return out;
}

describe('readLines', () => {
  it('yields lines, keeps a trailing unterminated line, drops empty trailing newline', async () => {
    expect(await collect(tmpFile('a\nbb\nccc'))).toEqual(['a', 'bb', 'ccc']);
    expect(await collect(tmpFile('a\nbb\n'))).toEqual(['a', 'bb']);
  });

  it('drops oversized lines and keeps going', async () => {
    const big = 'x'.repeat(5000);
    expect(await collect(tmpFile(`ok\n${big}\nafter\n`), 1000)).toEqual(['ok', '<oversized>', 'after']);
    expect(await collect(tmpFile(`ok\n${big}`), 1000)).toEqual(['ok', '<oversized>']);
  });

  it('parseTranscript counts an oversized line as a warning instead of buffering it', async () => {
    const p = tmpFile(`${assistantLine({})}\n${'y'.repeat(200_000)}\n${assistantLine({ uuid: 'a2' })}\n`);
    const t = await parseTranscript(p, 100_000);
    expect(t.turns).toHaveLength(2);
    expect(t.parseWarnings).toBe(1);
  });
});
