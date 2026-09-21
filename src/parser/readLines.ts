import { createReadStream } from 'node:fs';

/** Default per-line cap. Real transcripts reach a few MB per line (base64 images); anything larger is dropped. */
export const DEFAULT_MAX_LINE_BYTES = 32 * 1024 * 1024;

const NEWLINE = String.fromCharCode(10);

export type LineEvent = { readonly kind: 'line'; readonly text: string } | { readonly kind: 'oversized' };

/**
 * Streams a file line by line with a hard cap on line length, so a newline-free or
 * multi-gigabyte line cannot buffer into memory. Oversized lines are reported, not yielded.
 */
export async function* readLines(path: string, maxLineBytes = DEFAULT_MAX_LINE_BYTES): AsyncGenerator<LineEvent> {
  let pending = '';
  let skipping = false;
  for await (const chunk of createReadStream(path, { encoding: 'utf8' })) {
    let rest: string = chunk;
    while (rest !== '') {
      const nl = rest.indexOf(NEWLINE);
      if (nl === -1) {
        if (skipping) { rest = ''; continue; }
        pending += rest;
        rest = '';
        if (pending.length > maxLineBytes) { skipping = true; pending = ''; }
        continue;
      }
      const head = rest.slice(0, nl);
      rest = rest.slice(nl + 1);
      if (skipping) { skipping = false; yield { kind: 'oversized' }; continue; }
      pending += head;
      if (pending.length > maxLineBytes) { pending = ''; yield { kind: 'oversized' }; continue; }
      yield { kind: 'line', text: pending };
      pending = '';
    }
  }
  if (skipping) yield { kind: 'oversized' };
  else if (pending !== '') yield { kind: 'line', text: pending };
}
