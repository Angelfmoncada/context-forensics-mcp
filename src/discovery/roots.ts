import { homedir } from 'node:os';
import { delimiter, resolve, sep } from 'node:path';

const ROOTS_ENV = 'CONTEXT_FORENSICS_ROOTS';

export function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.length > 1 && p[0] === '~' && (p[1] === '/' || p[1] === sep)) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

/** Allowed transcript roots. Defaults to ~/.claude/projects; env overrides with a delimiter-separated list. */
export function getRoots(env: NodeJS.ProcessEnv): readonly string[] {
  const raw = env[ROOTS_ENV];
  if (!raw || raw.trim() === '') return [resolve(homedir(), '.claude', 'projects')];
  return raw
    .split(delimiter)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(expandHome);
}

const normalize = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));

/** Separator-aware containment check so `/r/projects-evil` is not inside `/r/projects`. */
export function isInsideRoots(realPath: string, roots: readonly string[]): boolean {
  const target = normalize(realPath);
  return roots.some((r) => {
    const root = normalize(r);
    return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep);
  });
}
