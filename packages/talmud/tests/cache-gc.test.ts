/**
 * Stale-cache GC (src/worker/cache-gc.ts). The version-staleness predicate is
 * safety-critical — deleting a CURRENT entry would be data loss — so it's
 * pinned hard here: only superseded-version keys are ever stale, prefixes don't
 * bleed (argument vs argument-move), and the `:he` marker never makes a current
 * entry look stale.
 */
import { describe, expect, it } from 'vitest';
import { type GcKV, gcPrefix, isStaleKey, versionSegment } from '../src/worker/cache-gc';

const P = 'mark:argument:';

describe('versionSegment / isStaleKey', () => {
  it('parses the version segment under a prefix', () => {
    expect(versionSegment('mark:argument:4:gittin:67b', P)).toBe('4');
    expect(versionSegment('mark:argument:3:he:gittin:67b', P)).toBe('3');
  });

  it('does not match a sibling prefix (argument vs argument-move)', () => {
    expect(versionSegment('mark:argument-move:9:gittin:67b', P)).toBeNull();
    expect(isStaleKey('mark:argument-move:9:gittin:67b', P, '4')).toBe(false);
  });

  it('current version (either language) is never stale', () => {
    expect(isStaleKey('mark:argument:4:gittin:67b', P, '4')).toBe(false);
    expect(isStaleKey('mark:argument:4:he:gittin:67b', P, '4')).toBe(false);
  });

  it('a superseded version (either language) IS stale', () => {
    expect(isStaleKey('mark:argument:3:gittin:67b', P, '4')).toBe(true);
    expect(isStaleKey('mark:argument:3:he:gittin:67b', P, '4')).toBe(true);
    expect(isStaleKey('mark:argument:llm-v2:gittin:67b', P, '4')).toBe(true);
  });
});

/** Fake KV returning a fixed key set in one page; records deletions. */
function fakeKV(names: string[]): GcKV & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async list({ prefix }) {
      return {
        keys: names.filter((n) => n.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
      };
    },
    async delete(name: string) {
      deleted.push(name);
      names.splice(names.indexOf(name), 1);
    },
  };
}

describe('gcPrefix', () => {
  const keys = () => [
    'mark:argument:4:gittin:67b', // current — keep
    'mark:argument:4:he:gittin:67b', // current he — keep
    'mark:argument:3:gittin:67b', // stale — delete
    'mark:argument:3:he:gittin:68a', // stale he — delete
    'mark:argument:2:berakhot:2a', // stale — delete
  ];

  it('dry-run counts stale but deletes nothing', async () => {
    const kv = fakeKV(keys());
    const r = await gcPrefix(
      kv,
      { prefix: P, currentVersion: '4' },
      { dryRun: true, maxDeletes: 999 },
    );
    expect(r.scanned).toBe(5);
    expect(r.stale).toBe(3);
    expect(r.deleted).toBe(0);
    expect(kv.deleted).toEqual([]);
  });

  it('apply deletes only the superseded entries, keeping current (+he)', async () => {
    const kv = fakeKV(keys());
    const r = await gcPrefix(
      kv,
      { prefix: P, currentVersion: '4' },
      { dryRun: false, maxDeletes: 999 },
    );
    expect(r.deleted).toBe(3);
    expect(kv.deleted.sort()).toEqual([
      'mark:argument:2:berakhot:2a',
      'mark:argument:3:gittin:67b',
      'mark:argument:3:he:gittin:68a',
    ]);
    // The two current entries survive.
  });

  it('respects maxDeletes (bounded pass)', async () => {
    const kv = fakeKV(keys());
    const r = await gcPrefix(
      kv,
      { prefix: P, currentVersion: '4' },
      { dryRun: false, maxDeletes: 1 },
    );
    expect(r.stale).toBe(3);
    expect(r.deleted).toBe(1);
    expect(kv.deleted).toHaveLength(1);
  });
});
