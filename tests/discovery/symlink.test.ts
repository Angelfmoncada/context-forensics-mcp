import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { symlinkSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolveSession } from '../../src/discovery/resolveSession.js';
import { mkTmpRoot } from '../helpers/tmpRoot.js';
import { assistantLine } from '../helpers/lines.js';

/** Windows needs elevation or Developer Mode for symlinks; skip there rather than fail. */
function canSymlink(): boolean {
  try {
    const d = mkdtempSync(join(tmpdir(), 'cfm-sym-'));
    writeFileSync(join(d, 't'), '');
    symlinkSync(join(d, 't'), join(d, 'l'));
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!canSymlink())('resolveSession symlink containment', () => {
  it('refuses a planted .jsonl symlink whose target is outside the roots, for latest and by id', async () => {
    const root = mkTmpRoot([{ project: 'p', id: 'legit', lines: [assistantLine({})], mtime: new Date('2026-01-01T00:00:00Z') }]);
    const outside = join(mkdtempSync(join(tmpdir(), 'cfm-out-')), 'secret.jsonl');
    writeFileSync(outside, assistantLine({}));
    symlinkSync(outside, join(root, 'p', 'evil.jsonl'));
    await expect(resolveSession('evil', [root])).rejects.toThrow(/outside allowed roots/);
    await expect(resolveSession('latest', [root])).rejects.toThrow(/outside allowed roots/);
  });
});
