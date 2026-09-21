import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { parseLine } from './parseLine.js';
import type { Transcript, Turn } from './types.js';

/** Streams a JSONL transcript line by line; large files never load fully into memory. */
export async function parseTranscript(path: string): Promise<Transcript> {
  try {
    await access(path);
  } catch {
    throw new Error(`Transcript not found: ${path}`);
  }
  const turns: Turn[] = [];
  let title: string | undefined;
  let parseWarnings = 0;
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    const parsed = parseLine(line);
    if (parsed.kind === 'turn') turns.push(parsed.turn);
    else if (parsed.kind === 'title') title = parsed.title;
    else if (parsed.kind === 'warning') parseWarnings += 1;
  }
  return { path, sessionId: basename(path, '.jsonl'), title, turns, parseWarnings };
}
