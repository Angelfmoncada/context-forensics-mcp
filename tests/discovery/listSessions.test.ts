import { describe, it, expect } from 'vitest';
import { listSessions } from '../../src/discovery/listSessions.js';
import { mkTmpRoot } from '../helpers/tmpRoot.js';
import { assistantLine, userLine, titleLine } from '../helpers/lines.js';

describe('listSessions', () => {
  it('lists newest first with metadata, honoring project/since/limit', async () => {
    const r = mkTmpRoot([
      { project: 'alpha', id: 's1', mtime: new Date('2026-01-01T00:00:00Z'), lines: [userLine({ ts: '2026-01-01T00:00:00Z' }), assistantLine({ ts: '2026-01-01T00:01:00Z', model: 'claude-opus-5' })] },
      { project: 'beta', id: 's2', mtime: new Date('2026-09-01T00:00:00Z'), lines: [
        titleLine('Beta work'),
        userLine({ ts: '2026-09-01T00:00:00Z' }),
        assistantLine({ ts: '2026-09-01T00:05:00Z', model: 'claude-sonnet-5' }),
        assistantLine({ ts: '2026-09-01T00:06:00Z', model: 'claude-opus-5' })
      ] },
      { project: 'gamma', id: 's3', mtime: new Date('2026-05-01T00:00:00Z'), lines: [] }
    ]);
    const all = await listSessions([r], {});
    expect(all.map((s) => s.id)).toEqual(['s2', 's3', 's1']);
    expect(all[0]).toMatchObject({
      project: 'beta', title: 'Beta work', turns: 3, models: ['claude-sonnet-5', 'claude-opus-5'],
      startedAt: '2026-09-01T00:00:00Z', endedAt: '2026-09-01T00:06:00Z'
    });
    expect(all[1]).toMatchObject({ turns: 0, startedAt: null, endedAt: null, models: [] });
    expect((await listSessions([r], { project: 'ALP' })).map((s) => s.id)).toEqual(['s1']);
    expect((await listSessions([r], { since: '2026-06-01' })).map((s) => s.id)).toEqual(['s2']);
    expect((await listSessions([r], { limit: 1 })).map((s) => s.id)).toEqual(['s2']);
  });
});
