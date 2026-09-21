/**
 * Produce a structure-only copy of a Claude Code transcript for use as a test fixture.
 * Keeps types, ids, models, tool names, timestamps and every number (usage!) intact;
 * replaces all other strings with same-length filler and hashes file paths.
 *
 *   npx tsx scripts/anonymize.ts <in.jsonl> <out.jsonl>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

const KEEP = new Set(['type', 'role', 'model', 'name', 'id', 'tool_use_id', 'uuid', 'parentUuid', 'timestamp', 'isSidechain', 'stop_reason', 'service_tier', 'speed', 'inference_geo']);
const DROP = new Set(['cwd', 'gitBranch', 'sessionId', 'requestId', 'promptId', 'toolUseResult', 'snapshot', 'diagnostics', 'aiTitle', 'lastPrompt', 'version', 'entrypoint']);
const PATH_KEYS = new Set(['file_path', 'path', 'notebook_path']);

const hashPath = (p: string): string => `/f/${createHash('sha1').update(p).digest('hex').slice(0, 8)}${extname(p)}`;

function anonymize(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((v) => anonymize(v));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !DROP.has(k))
        .map(([k, v]) => [k, anonymize(v, k)])
    );
  }
  if (typeof value !== 'string') return value;
  if (KEEP.has(key)) return value;
  if (PATH_KEYS.has(key)) return hashPath(value);
  return 'x'.repeat(value.length);
}

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: npx tsx scripts/anonymize.ts <in.jsonl> <out.jsonl>');
  process.exit(1);
}
const lines = readFileSync(input, 'utf8').split('\n').filter((l) => l.trim() !== '');
const out = lines.map((l) => {
  try {
    return JSON.stringify(anonymize(JSON.parse(l)));
  } catch {
    return '';
  }
}).filter((l) => l !== '');
writeFileSync(output, out.join('\n') + '\n');
console.log(`wrote ${out.length} lines to ${output}`);
