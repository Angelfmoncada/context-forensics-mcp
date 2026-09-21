import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join, delimiter, resolve } from 'node:path';
import { getRoots, isInsideRoots, expandHome } from '../../src/discovery/roots.js';

describe('roots', () => {
  it('defaults to ~/.claude/projects', () => {
    expect(getRoots({})).toEqual([join(homedir(), '.claude', 'projects')]);
    expect(getRoots({ CONTEXT_FORENSICS_ROOTS: '  ' })).toEqual([join(homedir(), '.claude', 'projects')]);
  });

  it('reads CONTEXT_FORENSICS_ROOTS split by delimiter and expands ~', () => {
    const roots = getRoots({ CONTEXT_FORENSICS_ROOTS: ['~/a', '/b', ''].join(delimiter) });
    expect(roots).toEqual([join(homedir(), 'a'), resolve('/b')]);
    expect(expandHome('~')).toBe(homedir());
  });

  it('isInsideRoots accepts children and the root itself, rejects sibling-prefix escapes', () => {
    const root = resolve('/r/projects');
    expect(isInsideRoots(resolve('/r/projects/x/y.jsonl'), [root])).toBe(true);
    expect(isInsideRoots(root, [root])).toBe(true);
    expect(isInsideRoots(resolve('/r/projects-evil/y.jsonl'), [root])).toBe(false);
    expect(isInsideRoots(resolve('/r/other'), [root])).toBe(false);
  });
});
