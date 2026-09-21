import { parseLine } from '../../src/parser/parseLine.js';
import type { Transcript, Turn } from '../../src/parser/types.js';

/** Builds an in-memory Transcript from JSONL lines (helpers in ./lines.ts). */
export function tx(lines: string[]): Transcript {
  const turns: Turn[] = lines.map(parseLine).flatMap((p) => (p.kind === 'turn' ? [p.turn] : []));
  return { path: '/x/s.jsonl', sessionId: 's', title: undefined, turns, parseWarnings: 0 };
}
