import { describe, expect, it } from 'vitest';
import { listObservedConcepts, recordObservedConcept } from '../src/worker/unknown-registry';

// The observed-concept backlog collects every term the daf-background.concepts
// enrichment emits, so a canonical glossary can be grown from real usage later
// (the same collect-now / canonicalise-later pattern as observed-place). These
// guard the keying (Hebrew-first identity) + per-daf sighting accumulation.

// Minimal in-memory KVNamespace: only the get/put/list surface the registry uses.
function fakeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async list({
      prefix = '',
      limit = 1000,
      cursor,
    }: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    } = {}) {
      const all = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const slice = all.slice(start, start + limit);
      const next = start + limit;
      const complete = next >= all.length;
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: complete,
        cursor: complete ? undefined : String(next),
      };
    },
  } as unknown as KVNamespace;
}

// waitUntil that lets the test await the fire-and-forget KV writes. Each daf is
// a separate worker request in production, so sightings of the same term arrive
// serially (one read-modify-write completes before the next begins) — settle()
// after each record models that, rather than racing concurrent writes on one key.
function collector() {
  let pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p);
    },
  };
  return {
    ctx,
    settle: async () => {
      await Promise.all(pending);
      pending = [];
    },
  };
}

describe('observed-concept backlog', () => {
  it('accumulates sightings of the same term (keyed on Hebrew) across dapim', async () => {
    const CACHE = fakeKV();
    const { ctx, settle } = collector();

    // Same Hebrew term, drifting English label + gloss, three sightings (two dapim).
    recordObservedConcept({ CACHE }, ctx, {
      term: 'Kohen',
      termHe: 'כהן',
      gloss: 'A priest.',
      category: 'realia',
      tractate: 'Berakhot',
      page: '2a',
    });
    await settle();
    recordObservedConcept({ CACHE }, ctx, {
      term: 'priest',
      termHe: 'כהן',
      gloss: 'A descendant of Aharon.',
      category: 'realia',
      tractate: 'Shabbat',
      page: '5b',
    });
    await settle();
    recordObservedConcept({ CACHE }, ctx, {
      term: 'kohanim',
      termHe: 'כהן',
      gloss: 'The priestly class.',
      category: 'realia',
      tractate: 'Shabbat',
      page: '5b',
    });
    await settle();

    const out = await listObservedConcepts(CACHE);
    expect(out.total).toBe(1); // one canonical key despite three English variants
    expect(out.sightings).toBe(3);
    const c = out.sample[0];
    expect(c.termHe).toBe('כהן');
    expect(c.count).toBe(3);
    expect(c.term).toBe('Kohen'); // first-seen English label retained
    expect(c.gloss).toBe('A priest.'); // first-seen gloss retained
    expect(c.dafs).toEqual(['Berakhot 2a', 'Shabbat 5b']); // distinct dapim only
  });

  it('keeps distinct terms separate and ranks by sighting count', async () => {
    const CACHE = fakeKV();
    const { ctx, settle } = collector();

    recordObservedConcept({ CACHE }, ctx, {
      term: 'Eruv',
      termHe: 'עירוב',
      gloss: 'g',
      tractate: 'Eruvin',
      page: '2a',
    });
    recordObservedConcept({ CACHE }, ctx, {
      term: 'Eruv',
      termHe: 'עירוב',
      gloss: 'g',
      tractate: 'Eruvin',
      page: '3a',
    });
    recordObservedConcept({ CACHE }, ctx, {
      term: 'Terumah',
      termHe: 'תרומה',
      gloss: 'g',
      tractate: 'Berakhot',
      page: '2a',
    });
    await settle();

    const out = await listObservedConcepts(CACHE);
    expect(out.total).toBe(2);
    expect(out.sample.map((c) => c.termHe)).toEqual(['עירוב', 'תרומה']); // count desc
  });

  it('ignores terms with no term/termHe and is a no-op without a CACHE binding', async () => {
    const CACHE = fakeKV();
    const { ctx, settle } = collector();
    recordObservedConcept({ CACHE }, ctx, {
      term: '',
      termHe: '',
      gloss: 'x',
      tractate: 'Berakhot',
      page: '2a',
    });
    recordObservedConcept({}, ctx, {
      term: 'Kohen',
      termHe: 'כהן',
      gloss: 'x',
      tractate: 'Berakhot',
      page: '2a',
    });
    await settle();
    const out = await listObservedConcepts(CACHE);
    expect(out.total).toBe(0);
  });
});
