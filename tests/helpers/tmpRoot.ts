import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TmpSession { project: string; id: string; lines: string[]; mtime?: Date }

/** Creates <tmp>/<project>/<id>.jsonl for each session and returns the root. */
export function mkTmpRoot(sessions: TmpSession[]): string {
  const root = mkdtempSync(join(tmpdir(), 'cfm-'));
  for (const s of sessions) {
    const dir = join(root, s.project);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, `${s.id}.jsonl`);
    writeFileSync(p, s.lines.join('\n') + '\n');
    if (s.mtime) utimesSync(p, s.mtime, s.mtime);
  }
  return root;
}
