import { parseTranscript } from '../parser/parseTranscript.js';
import { findTranscripts, type TranscriptFile } from './resolveSession.js';

export interface SessionInfo {
  readonly id: string;
  readonly project: string;
  readonly path: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly turns: number;
  readonly models: readonly string[];
  readonly title: string | undefined;
  readonly sizeBytes: number;
}

export interface ListFilter {
  readonly project?: string | undefined;
  readonly since?: string | undefined;
  readonly limit?: number | undefined;
}

const DEFAULT_LIMIT = 20;

async function describeFile(f: TranscriptFile): Promise<SessionInfo> {
  const t = await parseTranscript(f.path);
  const stamps = t.turns.map((x) => x.timestamp).filter((s) => s !== '');
  const models = [...new Set(t.turns.flatMap((x) => (x.kind === 'assistant' ? [x.model] : [])))];
  return {
    id: f.id,
    project: f.project,
    path: f.path,
    startedAt: stamps[0] ?? null,
    endedAt: stamps[stamps.length - 1] ?? null,
    turns: t.turns.length,
    models,
    title: t.title,
    sizeBytes: f.sizeBytes
  };
}

/** Filters and sorts by mtime first, then parses only the selected files. */
export async function listSessions(roots: readonly string[], filter: ListFilter): Promise<readonly SessionInfo[]> {
  const sinceMs = filter.since ? Date.parse(filter.since) : Number.NEGATIVE_INFINITY;
  if (Number.isNaN(sinceMs)) throw new Error(`Invalid "since" date: ${filter.since}`);
  const needle = filter.project?.toLowerCase();
  const selected = (await findTranscripts(roots))
    .filter((f) => f.mtimeMs >= sinceMs && (!needle || f.project.toLowerCase().includes(needle)))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, filter.limit ?? DEFAULT_LIMIT);
  return Promise.all(selected.map(describeFile));
}
