import { access } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseLine } from './parseLine.js';
import { readLines } from './readLines.js';
import type { Transcript, Turn } from './types.js';

/** Streams a JSONL transcript line by line; large files never load fully into memory and oversized lines count as warnings. */
export async function parseTranscript(path: string, maxLineBytes?: number): Promise<Transcript> {
  try {
    await access(path);
  } catch {
    throw new Error(`Transcript not found: ${path}`);
  }
  const turns: Turn[] = [];
  let title: string | undefined;
  let parseWarnings = 0;
  for await (const ev of readLines(path, maxLineBytes)) {
    if (ev.kind === 'oversized') { parseWarnings += 1; continue; }
    const parsed = parseLine(ev.text);
    if (parsed.kind === 'turn') turns.push(parsed.turn);
    else if (parsed.kind === 'title') title = parsed.title;
    else if (parsed.kind === 'warning') parseWarnings += 1;
  }
  return { path, sessionId: basename(path, '.jsonl'), title, turns, parseWarnings };
}
