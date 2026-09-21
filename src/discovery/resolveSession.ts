import { readdir, stat, realpath } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { isInsideRoots } from './roots.js';

export interface TranscriptFile {
  readonly path: string;
  readonly project: string;
  readonly id: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}

const EXT = '.jsonl';

async function filesIn(root: string, project: string): Promise<readonly TranscriptFile[]> {
  const dir = join(root, project);
  const names = await readdir(dir).catch(() => [] as string[]);
  const entries = await Promise.all(
    names
      .filter((f) => f.endsWith(EXT))
      .map(async (f) => {
        const path = join(dir, f);
        const s = await stat(path).catch(() => null);
        return s?.isFile() ? [{ path, project, id: f.slice(0, -EXT.length), mtimeMs: s.mtimeMs, sizeBytes: s.size }] : [];
      })
  );
  return entries.flat();
}

/** Every <root>/<project>/<id>.jsonl under the allowed roots. Unreadable roots are skipped. */
export async function findTranscripts(roots: readonly string[]): Promise<readonly TranscriptFile[]> {
  const perRoot = await Promise.all(
    roots.map(async (root) => {
      const dirents = await readdir(root, { withFileTypes: true }).catch(() => []);
      const projects = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
      return (await Promise.all(projects.map((p) => filesIn(root, p)))).flat();
    })
  );
  return perRoot.flat();
}

async function resolvePath(ref: string, roots: readonly string[]): Promise<string> {
  const real = await realpath(ref).catch(() => null);
  if (real === null) throw new Error(`Session not found: ${ref}`);
  if (!isInsideRoots(real, roots)) throw new Error(`Path outside allowed roots: ${ref}`);
  return real;
}

/**
 * Resolves "latest", a session id, or an absolute .jsonl path to a real path inside the allowed roots.
 * Every branch ends in resolvePath, so a symlink planted under a root cannot point outside it.
 */
export async function resolveSession(ref: string, roots: readonly string[]): Promise<string> {
  if (ref === 'latest') {
    const newest = [...(await findTranscripts(roots))].sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    if (!newest) throw new Error('Session not found: no transcripts under allowed roots');
    return resolvePath(newest.path, roots);
  }
  if (isAbsolute(ref)) return resolvePath(ref, roots);
  const id = ref.endsWith(EXT) ? ref.slice(0, -EXT.length) : ref;
  const match = (await findTranscripts(roots)).find((t) => t.id === id);
  if (!match) throw new Error(`Session not found: ${ref}`);
  return resolvePath(match.path, roots);
}
