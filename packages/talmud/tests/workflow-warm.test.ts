import { describe, expect, it } from 'vitest';
import {
  createDagPool,
  dafGenSentinelKey,
  expandInlineDeps,
  perInstanceEnrichments,
  topoTiers,
  wholeDafEnrichmentIds,
} from '../src/worker/workflow-warm';

const MARKS = [
  { id: 'argument-overview', anchor: 'whole-daf' },
  { id: 'daf-background', anchor: 'whole-daf' },
  { id: 'tidbit', anchor: 'whole-daf' },
  { id: 'argument', anchor: 'segment' },
  { id: 'pesukim', anchor: 'segment' },
  { id: 'rabbi', anchor: 'name' },
];

// The two selectors must PARTITION the local enrichments: whole-daf vs
// per-instance, with `argument` excluded from both. If a producer leaked into
// both (or neither), the Workflow would double-run or skip it.
describe('perInstanceEnrichments', () => {
  it('returns {id,targetMark} for non-whole-daf, non-argument local enrichments', () => {
    const out = perInstanceEnrichments(MARKS, [
      { id: 'pesukim.synthesis', scope: 'local', target_mark: 'pesukim' },
      { id: 'rabbi.synthesis', scope: 'local', target_mark: 'rabbi' },
    ]);
    expect(out).toEqual([
      { id: 'pesukim.synthesis', targetMark: 'pesukim' },
      { id: 'rabbi.synthesis', targetMark: 'rabbi' },
    ]);
  });

  it('EXCLUDES whole-daf, argument, global, and no-target enrichments', () => {
    const out = perInstanceEnrichments(MARKS, [
      { id: 'tidbit.essay', scope: 'local', target_mark: 'tidbit' }, // whole-daf
      { id: 'argument.synthesis', scope: 'local', target_mark: 'argument' }, // argument
      { id: 'rabbi.identity', scope: 'global', target_mark: 'rabbi' }, // global
      { id: 'standalone', scope: 'local' }, // no target
    ]);
    expect(out).toEqual([]);
  });

  it('EXCLUDES demand-driven enrichments (.qa, the lazy pin) — never warmed', () => {
    const out = perInstanceEnrichments(MARKS, [
      { id: 'pesukim.synthesis', scope: 'local', target_mark: 'pesukim' }, // warmed
      { id: 'pesukim.qa', scope: 'local', target_mark: 'pesukim', demand_driven: true }, // on-demand
      { id: 'rabbi.identity.pin', scope: 'local', target_mark: 'rabbi', demand_driven: true }, // lazy
    ]);
    expect(out).toEqual([{ id: 'pesukim.synthesis', targetMark: 'pesukim' }]);
  });

  it('partitions cleanly vs wholeDafEnrichmentIds (no overlap, argument in neither)', () => {
    const enrichments = [
      { id: 'argument-overview.synthesis', scope: 'local', target_mark: 'argument-overview' },
      { id: 'pesukim.synthesis', scope: 'local', target_mark: 'pesukim' },
      { id: 'argument.synthesis', scope: 'local', target_mark: 'argument' },
    ];
    const whole = new Set(wholeDafEnrichmentIds(MARKS, enrichments));
    const perInst = new Set(perInstanceEnrichments(MARKS, enrichments).map((e) => e.id));
    // disjoint
    for (const id of whole) expect(perInst.has(id)).toBe(false);
    // argument excluded from both
    expect(whole.has('argument.synthesis')).toBe(false);
    expect(perInst.has('argument.synthesis')).toBe(false);
    // each non-argument piece is in exactly one bucket
    expect(whole.has('argument-overview.synthesis')).toBe(true);
    expect(perInst.has('pesukim.synthesis')).toBe(true);
  });
});

// The warm Workflow's step list. It must include exactly the WHOLE-DAF
// enrichments (target mark is whole-daf, or none) and exclude per-instance ones —
// the same bucketing the daf-view uses, so the warm surface stays in sync.
describe('wholeDafEnrichmentIds', () => {
  const marks = [
    { id: 'argument-overview', anchor: 'whole-daf' },
    { id: 'daf-background', anchor: 'whole-daf' },
    { id: 'tidbit', anchor: 'whole-daf' },
    { id: 'argument', anchor: 'segment' },
    { id: 'pesukim', anchor: 'segment' },
    { id: 'rabbi', anchor: 'name' },
  ];

  it('includes enrichments whose target mark is whole-daf', () => {
    const ids = wholeDafEnrichmentIds(marks, [
      { id: 'argument-overview.synthesis', scope: 'local', target_mark: 'argument-overview' },
      { id: 'daf-background.synthesis', scope: 'local', target_mark: 'daf-background' },
      { id: 'tidbit.essay', scope: 'local', target_mark: 'tidbit' },
    ]);
    expect(ids.sort()).toEqual([
      'argument-overview.synthesis',
      'daf-background.synthesis',
      'tidbit.essay',
    ]);
  });

  it('EXCLUDES per-instance enrichments (target mark is segment/name)', () => {
    const ids = wholeDafEnrichmentIds(marks, [
      { id: 'pesukim.synthesis', scope: 'local', target_mark: 'pesukim' },
      { id: 'rabbi.synthesis', scope: 'local', target_mark: 'rabbi' },
      { id: 'argument.synthesis', scope: 'local', target_mark: 'argument' },
    ]);
    expect(ids).toEqual([]);
  });

  it('includes enrichments with NO target mark', () => {
    const ids = wholeDafEnrichmentIds(marks, [{ id: 'standalone.synthesis', scope: 'local' }]);
    expect(ids).toEqual(['standalone.synthesis']);
  });

  it('excludes non-local (global/entity) enrichments', () => {
    const ids = wholeDafEnrichmentIds(marks, [
      { id: 'rabbi.identity', scope: 'global', target_mark: 'rabbi' },
      { id: 'daf-background.synthesis', scope: 'local', target_mark: 'daf-background' },
    ]);
    expect(ids).toEqual(['daf-background.synthesis']);
  });

  it('treats an unknown target mark as NOT whole-daf (excluded — safe default)', () => {
    const ids = wholeDafEnrichmentIds(marks, [
      { id: 'x.synthesis', scope: 'local', target_mark: 'does-not-exist' },
    ]);
    expect(ids).toEqual([]);
  });

  it('is empty for an empty registry', () => {
    expect(wholeDafEnrichmentIds([], [])).toEqual([]);
  });
});

// The /api/daf-generate single-flight sentinel. N concurrent readers of the
// same daf+lang MUST land on the same key (so they coalesce onto one Workflow),
// and EN/HE must differ (they generate distinct pieces). A silent prefix/format
// change here would break single-flight (every reader starts its own Workflow),
// so the format is pinned byte-for-byte.
describe('dafGenSentinelKey', () => {
  it('is byte-stable per (tractate, page, lang)', () => {
    expect(dafGenSentinelKey('Berakhot', '2a', 'en')).toBe('dafgen:v1:Berakhot:2a:en');
    expect(dafGenSentinelKey('Chullin', '52a', 'he')).toBe('dafgen:v1:Chullin:52a:he');
  });

  it('is identical for the same daf+lang (so concurrent readers coalesce)', () => {
    expect(dafGenSentinelKey('Shabbat', '21b', 'en')).toBe(
      dafGenSentinelKey('Shabbat', '21b', 'en'),
    );
  });

  it('differs by language (EN and HE generate distinct pieces)', () => {
    expect(dafGenSentinelKey('Shabbat', '21b', 'en')).not.toBe(
      dafGenSentinelKey('Shabbat', '21b', 'he'),
    );
  });

  it('differs by daf (no cross-daf coalescing)', () => {
    expect(dafGenSentinelKey('Shabbat', '21a', 'en')).not.toBe(
      dafGenSentinelKey('Shabbat', '21b', 'en'),
    );
  });
});

// Tiering is what makes parallel generation SAFE: every dep is generated by an
// earlier tier, so concurrent steps in one tier never regenerate a shared dep.
describe('topoTiers', () => {
  it('puts a linear chain A->B->C in three ordered tiers', () => {
    const deps: Record<string, string[]> = { a: [], b: ['a'], c: ['b'] };
    expect(topoTiers(['c', 'b', 'a'], (id) => deps[id] ?? [])).toEqual([['a'], ['b'], ['c']]);
  });

  it('groups independent ids into ONE tier (max parallelism)', () => {
    expect(topoTiers(['a', 'b', 'c'], () => [])).toEqual([['a', 'b', 'c']]);
  });

  it('models the real case: suggested-questions after its synthesis', () => {
    const deps: Record<string, string[]> = {
      'argument-move.synthesis': ['argument-move'], // mark dep — outside the set
      'argument-move.suggested-questions': ['argument-move.synthesis'],
    };
    const tiers = topoTiers(
      ['argument-move.suggested-questions', 'argument-move.synthesis'],
      (id) => deps[id] ?? [],
    );
    expect(tiers).toEqual([['argument-move.synthesis'], ['argument-move.suggested-questions']]);
  });

  it('ignores deps OUTSIDE the id set (satisfied by an earlier phase)', () => {
    // enrichment depends on a mark id not in the per-instance set → tier 0.
    expect(topoTiers(['x'], () => ['some-mark'])).toEqual([['x']]);
  });

  it('ignores a self-dependency', () => {
    expect(topoTiers(['x'], () => ['x'])).toEqual([['x']]);
  });

  it('preserves input order within a tier (deterministic step names on replay)', () => {
    expect(topoTiers(['b', 'a', 'c'], () => [])).toEqual([['b', 'a', 'c']]);
  });

  it('does not loop forever on a cycle — emits the remainder as a final tier', () => {
    const deps: Record<string, string[]> = { a: ['b'], b: ['a'] };
    const tiers = topoTiers(['a', 'b'], (id) => deps[id] ?? []);
    expect(tiers.flat().sort()).toEqual(['a', 'b']); // both still emitted
  });
});

describe('expandInlineDeps', () => {
  // The real shape: biyun.essay depends on argument.synthesis, which the warm
  // never generates (the excluded `argument` family). Its inline regeneration
  // reads the argument + argument-move + rabbi marks and daf-background.concepts
  // — so the dependent must gate on THOSE.
  const META: Record<string, { targetMark?: string; deps: string[] }> = {
    'argument.synthesis': {
      targetMark: 'argument',
      deps: ['gemara', 'argument-move', 'rabbi', 'argument.background', 'daf-background.concepts'],
    },
    'argument.background': { targetMark: 'argument', deps: ['gemara', 'argument-move'] },
  };
  const KNOWN = new Set([
    'argument',
    'argument-move',
    'rabbi',
    'daf-background.concepts',
    'rishonim.synthesis',
  ]);
  const known = (id: string) => KNOWN.has(id);
  const meta = (id: string) => META[id];

  it('passes known ids through unchanged', () => {
    expect(expandInlineDeps(['rishonim.synthesis', 'rabbi'], known, meta)).toEqual([
      'rishonim.synthesis',
      'rabbi',
    ]);
  });

  it('expands an excluded producer into its in-graph transitive inputs', () => {
    const out = expandInlineDeps(['argument.synthesis'], known, meta);
    expect(out.sort()).toEqual(['argument', 'argument-move', 'daf-background.concepts', 'rabbi']);
  });

  it('drops source ids entirely', () => {
    expect(expandInlineDeps(['gemara', 'context'], known, meta)).toEqual([]);
  });

  it('tolerates cycles among excluded producers', () => {
    const cyc = (id: string) =>
      id === 'a' ? { deps: ['b'] } : id === 'b' ? { deps: ['a', 'rabbi'] } : undefined;
    expect(expandInlineDeps(['a'], known, cyc)).toEqual(['rabbi']);
  });
});

describe('createDagPool', () => {
  /** A manually-resolvable run fn, to control completion order in tests. */
  function gate() {
    let release!: () => void;
    let fail!: (e: unknown) => void;
    const p = new Promise<void>((res, rej) => {
      release = res;
      fail = rej;
    });
    return { run: () => p, release, fail };
  }
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  it('runs every node and respects dependency order', async () => {
    const order: string[] = [];
    const pool = createDagPool(4);
    pool.add('a', [], async () => {
      order.push('a');
    });
    pool.add('b', ['a'], async () => {
      order.push('b');
    });
    pool.add('c', ['b'], async () => {
      order.push('c');
    });
    await pool.drain();
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('never exceeds the width limit in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const pool = createDagPool(3);
    for (let i = 0; i < 12; i++) {
      pool.add(`n${i}`, [], async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await tick();
        inFlight--;
      });
    }
    await pool.drain();
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('starts a node the moment a slot frees (sliding pool, no batch barrier)', async () => {
    // Width 2: a slow node + a fast node start together; the third node must
    // start as soon as the fast one finishes, NOT wait for the slow one.
    const slow = gate();
    const started: string[] = [];
    const pool = createDagPool(2);
    pool.add('slow', [], () => {
      started.push('slow');
      return slow.run();
    });
    pool.add('fast', [], async () => {
      started.push('fast');
    });
    pool.add('third', [], async () => {
      started.push('third');
    });
    const done = pool.drain();
    await tick();
    expect(started).toContain('third'); // slot freed by 'fast' — 'slow' still running
    slow.release();
    await done;
  });

  it('releases a node when ITS deps finish, not when a whole tier does', async () => {
    // a and x are independent roots; b depends only on a. b must start while x
    // (same "tier" as a) is still running — the barrier the tiers used to impose.
    const x = gate();
    const started: string[] = [];
    const pool = createDagPool(3);
    pool.add('x', [], () => {
      started.push('x');
      return x.run();
    });
    pool.add('a', [], async () => {
      started.push('a');
    });
    pool.add('b', ['a'], async () => {
      started.push('b');
    });
    const done = pool.drain();
    await tick();
    expect(started).toContain('b');
    expect(started).toContain('x'); // still in flight
    x.release();
    await done;
  });

  it('declare(): dependents WAIT for a future node instead of dropping the dep', async () => {
    const order: string[] = [];
    const pool = createDagPool(2);
    pool.declare('future');
    pool.add('dependent', ['future'], async () => {
      order.push('dependent');
    });
    pool.add('root', [], async () => {
      order.push('root');
      // dynamic fulfillment from inside a run — how a mark fans out its units
      pool.add('future', [], async () => {
        order.push('future');
      });
    });
    await pool.drain();
    expect(order).toEqual(['root', 'future', 'dependent']);
  });

  it('predeclared ids gate a dependent added BEFORE its dep (registration order is irrelevant)', async () => {
    // The geography ← places regression: geography registers before places in
    // CODE_MARKS order. With both predeclared, the edge must still hold.
    const order: string[] = [];
    const pool = createDagPool(4);
    pool.declare('geography');
    pool.declare('places');
    pool.add('geography', ['places'], async () => {
      order.push('geography');
    });
    pool.add('places', [], async () => {
      order.push('places');
    });
    await pool.drain();
    expect(order).toEqual(['places', 'geography']);
  });

  it('drops deps the pool does not know (source ids resolve inline at run time)', async () => {
    const order: string[] = [];
    const pool = createDagPool(2);
    pool.add('n', ['gemara', 'context'], async () => {
      order.push('n');
    });
    await pool.drain();
    expect(order).toEqual(['n']);
  });

  it('group nodes (no run) complete without occupying a slot', async () => {
    const order: string[] = [];
    const pool = createDagPool(1); // one slot — a slot-holding group would deadlock
    pool.add('u1', [], async () => {
      order.push('u1');
    });
    pool.add('u2', [], async () => {
      order.push('u2');
    });
    pool.add('group', ['u1', 'u2']);
    pool.add('after', ['group'], async () => {
      order.push('after');
    });
    await pool.drain();
    expect(order).toEqual(['u1', 'u2', 'after']);
  });

  it('models the real shape: units fan out from a mark; a static node waits on the group', async () => {
    // mark -> units (added dynamically) -> group; 'essay' (static) gates on the
    // group so it sees every unit, while 'independent' overlaps with everything.
    const order: string[] = [];
    const pool = createDagPool(6);
    pool.declare('synth'); // the per-instance enrichment, declared up front
    pool.add('essay', ['synth'], async () => {
      order.push('essay');
    });
    pool.add('independent', [], async () => {
      order.push('independent');
    });
    pool.add('mark', [], async () => {
      order.push('mark');
      const unitIds: string[] = [];
      for (const iid of ['i1', 'i2']) {
        pool.add(`synth::${iid}`, [], async () => {
          order.push(`synth::${iid}`);
        });
        unitIds.push(`synth::${iid}`);
      }
      pool.add('synth', unitIds);
    });
    await pool.drain();
    const pos = (id: string) => order.indexOf(id);
    expect(pos('essay')).toBeGreaterThan(pos('synth::i1'));
    expect(pos('essay')).toBeGreaterThan(pos('synth::i2'));
    expect(pos('essay')).toBeGreaterThan(pos('mark'));
    expect(order).toHaveLength(5);
  });

  it('a failed node rejects drain and its dependents never run', async () => {
    const ran: string[] = [];
    const pool = createDagPool(2);
    pool.add('boom', [], async () => {
      throw new Error('boom');
    });
    pool.add('child', ['boom'], async () => {
      ran.push('child');
    });
    await expect(pool.drain()).rejects.toThrow('boom');
    expect(ran).toEqual([]);
  });

  it('an unfulfilled declare rejects loudly instead of hanging', async () => {
    const pool = createDagPool(2);
    pool.declare('never-added');
    pool.add('dependent', ['never-added'], async () => {});
    await expect(pool.drain()).rejects.toThrow(/stalled/);
  });

  it('an empty pool drains immediately', async () => {
    await expect(createDagPool(2).drain()).resolves.toBeUndefined();
  });
});
