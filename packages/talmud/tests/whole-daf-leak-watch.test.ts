import { instanceIdOf } from '@corpus/core/cache/keys';
import { describe, expect, it } from 'vitest';
import { leakedKeys, leakWatchTargets } from '../src/worker/whole-daf-leak-watch';

// The sentinel exists because this leak class shipped twice (#426, #534) and
// burned real money both times, silently. These tests pin its two pure parts:
// which producers it audits, and how it classifies a listed key.

describe('leakWatchTargets', () => {
  it('audits exactly the whole-daf enrichments, each with its current version', () => {
    const targets = leakWatchTargets();
    const ids = targets.map((t) => t.id).sort();
    expect(ids).toEqual(
      [
        'argument-overview.flow',
        'argument-overview.synthesis',
        'biyun.essay',
        'daf-background.concepts',
        'daf-background.synthesis',
        'tidbit.essay',
      ].sort(),
    );
    for (const t of targets) expect(t.version, t.id).toMatch(/^\d+$/);
  });
});

describe('leakedKeys', () => {
  const PREFIX = 'enrich:daf-background.concepts:5:';
  const CANON = 'f35cd02cd97b';

  it('keeps canonical EN and HE keys quiet', () => {
    expect(
      leakedKeys(
        [
          `${PREFIX}${CANON}:chullin:75a`,
          `${PREFIX}he:${CANON}:chullin:75a`,
          `${PREFIX}${CANON}:berakhot:2b`,
        ],
        PREFIX,
        CANON,
      ),
    ).toEqual([]);
  });

  it('flags per-rabbi / per-section keys — the real leak fingerprints', () => {
    const bad = [
      `${PREFIX}rabbi_elazar:chullin:74b`, // rabbi.synthesis parent (seen live)
      `${PREFIX}abaye_s_ruling_on_training_a_minor:chagigah:6a`, // argument section (seen live)
      `${PREFIX}74234e98afe7:arakhin:16a`, // instanceIdOf(undefined) — the bare-run family
      `${PREFIX}he:rava:chullin:74b`, // leaked under the he namespace too
    ];
    expect(leakedKeys([...bad, `${PREFIX}${CANON}:chullin:74b`], PREFIX, CANON)).toEqual(bad);
  });

  it('ignores names outside the prefix (other producers, superseded versions)', () => {
    expect(
      leakedKeys(
        ['enrich:daf-background.concepts:4:rava:chullin:74b', 'enrich:rabbi.synthesis:3:rava:x:y'],
        PREFIX,
        CANON,
      ),
    ).toEqual([]);
  });

  it('the pinned canonical constant IS instanceIdOf({fields:{}})', async () => {
    expect(await instanceIdOf({ fields: {} })).toBe(CANON);
  });
});
