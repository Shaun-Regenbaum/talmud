import { instanceIdOf } from '@corpus/core/cache/keys';
import { aiStatus } from '@corpus/ui/aiStatus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DafViewPiece,
  dafViewHas,
  dafViewLoaded,
  dafViewPieceResult,
  dafViewWholeDafResult,
  ensureDafView,
  isViewDriven,
  loadDafView,
  openDafView,
  synthRunResult,
} from '../src/client/dafViewStore';
// The SERVER's key function — the client lookups must agree with it byte-for-byte
// or the bridge silently misses every piece.
import { pieceKey } from '../src/worker/daf-view';

function piece(over: Partial<DafViewPiece>): DafViewPiece {
  return { producerId: 'x', kind: 'enrichment', label: 'X', parsed: {}, ...over };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('synthRunResult', () => {
  it('builds a faithful cache-hit RunResult from a view piece', () => {
    const r = synthRunResult(
      piece({ parsed: { synthesis: 'hi' }, content: 'raw', deps_resolved: { a: 1 } }),
    );
    expect(r.cache_hit).toBe(true);
    expect(r.parsed).toEqual({ synthesis: 'hi' });
    expect(r.content).toBe('raw');
    expect(r.deps_resolved).toEqual({ a: 1 });
    expect(r.parse_error).toBeNull();
  });

  it('tolerates a piece with no content', () => {
    expect(synthRunResult(piece({ content: undefined })).content).toBe('');
  });
});

describe('loadDafView + dafViewWholeDafResult', () => {
  function stubFetch(payload: unknown, ok = true) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: ok ? 200 : 500 })),
    );
  }

  it('serves a WHOLE-DAF piece (keyed by producer id) after the view loads', async () => {
    stubFetch({
      pieces: {
        'argument-overview.synthesis': piece({ producerId: 'argument-overview.synthesis' }),
      },
    });
    await loadDafView('Chullin', '52a', 'en');
    const r = dafViewWholeDafResult('argument-overview.synthesis', 'Chullin', '52a', 'en');
    expect(r?.cache_hit).toBe(true);
  });

  it('does NOT serve per-instance pieces (keyed producerId::instanceId)', async () => {
    stubFetch({
      pieces: { 'pesukim.synthesis::abaye': piece({ producerId: 'pesukim.synthesis' }) },
    });
    await loadDafView('Chullin', '52a', 'en');
    // The whole-daf lookup (bare producer id) must miss a producerId::instanceId
    // key — the per-instance tier (below) owns those; the two must not collide.
    expect(dafViewWholeDafResult('pesukim.synthesis', 'Chullin', '52a', 'en')).toBeUndefined();
  });

  it('never serves a view from a DIFFERENT daf or lang (key guard)', async () => {
    stubFetch({ pieces: { tidbit: piece({ producerId: 'tidbit' }) } });
    await loadDafView('Chullin', '52a', 'en');
    expect(dafViewWholeDafResult('tidbit', 'Chullin', '52a', 'en')?.cache_hit).toBe(true);
    expect(dafViewWholeDafResult('tidbit', 'Chullin', '53a', 'en')).toBeUndefined(); // other page
    expect(dafViewWholeDafResult('tidbit', 'Chullin', '52a', 'he')).toBeUndefined(); // other lang
  });

  it('is best-effort: a failed fetch leaves nothing to serve (caller fetches as before)', async () => {
    stubFetch({}, false);
    await loadDafView('Berakhot', '2a', 'en');
    expect(dafViewWholeDafResult('tidbit', 'Berakhot', '2a', 'en')).toBeUndefined();
  });
});

// The card effect gates its /api/run on dafViewLoaded(). For that gate to be
// fail-safe (never hang a card), loadDafView MUST settle the loaded flag even
// when the fetch fails — the card then falls through and fetches as before.
describe('loadDafView fail-safe settle', () => {
  it('marks the view LOADED even on an HTTP error (so the card gate resolves)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    await loadDafView('Berakhot', '4a', 'en');
    expect(dafViewLoaded('Berakhot', '4a', 'en')).toBe(true); // settled...
    expect(dafViewWholeDafResult('tidbit', 'Berakhot', '4a', 'en')).toBeUndefined(); // ...but empty
  });

  it('marks the view LOADED even when fetch throws (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await loadDafView('Berakhot', '4b', 'en');
    expect(dafViewLoaded('Berakhot', '4b', 'en')).toBe(true);
  });
});

// The prefetcher consults dafViewHas to SKIP warming pieces the view already
// serves — the fix that collapses the warm-daf /api/run fan-out. It must match
// both the whole-daf key (bare id) and the per-instance key (id::instanceIdOf).
describe('dafViewHas (prefetch skip predicate)', () => {
  function stubFetch(payload: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );
  }

  it('true for a whole-daf piece already in the view', async () => {
    stubFetch({ pieces: { 'tidbit.essay': piece({ producerId: 'tidbit.essay' }) } });
    await loadDafView('Chullin', '52a', 'en');
    expect(await dafViewHas('tidbit.essay', { fields: {} }, 'Chullin', '52a', 'en')).toBe(true);
  });

  it('true for a per-instance piece keyed by the real instanceIdOf hash', async () => {
    const inst = { fields: { name: 'Rabbi Akiva' } };
    const iid = await instanceIdOf(inst); // the same hash the server keys by
    stubFetch({
      pieces: { [`rabbi.synthesis::${iid}`]: piece({ producerId: 'rabbi.synthesis' }) },
    });
    await loadDafView('Chullin', '52a', 'en');
    expect(await dafViewHas('rabbi.synthesis', inst, 'Chullin', '52a', 'en')).toBe(true);
  });

  it('false when the piece is absent (cold) — prefetcher warms it', async () => {
    stubFetch({ pieces: { 'tidbit.essay': piece({ producerId: 'tidbit.essay' }) } });
    await loadDafView('Chullin', '52a', 'en');
    expect(
      await dafViewHas('halacha.synthesis', { fields: { topic: 'x' } }, 'Chullin', '52a', 'en'),
    ).toBe(false);
  });

  it('false when no view is loaded for this daf (fail-safe: prefetcher proceeds)', async () => {
    expect(await dafViewHas('tidbit.essay', { fields: {} }, 'Sanhedrin', '90a', 'en')).toBe(false);
  });
});

describe('ensureDafView', () => {
  it('shares ONE fetch across concurrent callers (DafViewer + prefetcher)', async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify({ pieces: { tidbit: piece({ producerId: 'tidbit' }) } }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', spy);
    await Promise.all([
      ensureDafView('Nazir', '2a', 'en'),
      ensureDafView('Nazir', '2a', 'en'),
      loadDafView('Nazir', '2a', 'en'),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch once the view is already loaded', async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify({ pieces: { tidbit: piece({ producerId: 'tidbit' }) } }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', spy);
    await loadDafView('Nazir', '3a', 'en');
    await ensureDafView('Nazir', '3a', 'en'); // already settled → no fetch
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// A slow load for a daf the reader already left must never overwrite the view of
// the daf now on screen (the user navigates while a fetch is in flight).
describe('loadDafView latest-key guard', () => {
  it('a stale load resolving LAST does not clobber the current daf', async () => {
    const resolvers: Record<string, (r: Response) => void> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string) =>
          new Promise<Response>((res) => {
            resolvers[url.includes('/52a') ? 'stale' : 'current'] = res;
          }),
      ),
    );
    const pStale = loadDafView('Chullin', '52a', 'en'); // reader was here
    const pCurrent = loadDafView('Chullin', '53a', 'en'); // ...then navigated here
    const body = (id: string) =>
      new Response(JSON.stringify({ pieces: { tidbit: piece({ producerId: id }) } }), {
        status: 200,
      });
    // current resolves first, the stale one resolves AFTER (the race we guard).
    resolvers.current(body('current'));
    resolvers.stale(body('stale'));
    await Promise.all([pStale, pCurrent]);
    expect(dafViewLoaded('Chullin', '53a', 'en')).toBe(true); // current view stands
    expect(dafViewLoaded('Chullin', '52a', 'en')).toBe(false); // stale never took over
  });
});

describe('dafViewLoaded', () => {
  function stubFetch(payload: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );
  }

  it('is true only after the view loads, for the SAME daf+lang', async () => {
    stubFetch({ pieces: { tidbit: piece({ producerId: 'tidbit' }) } });
    await loadDafView('Eruvin', '13a', 'en');
    expect(dafViewLoaded('Eruvin', '13a', 'en')).toBe(true);
    expect(dafViewLoaded('Eruvin', '13b', 'en')).toBe(false); // other page
    expect(dafViewLoaded('Eruvin', '13a', 'he')).toBe(false); // other lang
    expect(dafViewLoaded('Shabbat', '2a', 'en')).toBe(false); // other tractate
  });
});

describe('dafViewPieceResult (per-instance tier)', () => {
  function stubFetch(payload: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );
  }

  it('serves a per-instance piece by producerId + instanceId (the instanceIdOf hash)', async () => {
    stubFetch({
      pieces: {
        'pesukim.synthesis::abc123': piece({
          producerId: 'pesukim.synthesis',
          instanceId: 'abc123',
          parsed: { synthesis: 'p' },
        }),
      },
    });
    await loadDafView('Chullin', '52a', 'en');
    const r = dafViewPieceResult('pesukim.synthesis', 'abc123', 'Chullin', '52a', 'en');
    expect(r?.cache_hit).toBe(true);
    expect(r?.parsed).toEqual({ synthesis: 'p' });
  });

  it('misses for a wrong/unknown instanceId (caller fetches that instance)', async () => {
    stubFetch({
      pieces: { 'pesukim.synthesis::abc123': piece({ producerId: 'pesukim.synthesis' }) },
    });
    await loadDafView('Chullin', '52a', 'en');
    expect(
      dafViewPieceResult('pesukim.synthesis', 'WRONG', 'Chullin', '52a', 'en'),
    ).toBeUndefined();
  });

  it('does NOT match a whole-daf piece (keyed by bare producer id)', async () => {
    stubFetch({ pieces: { tidbit: piece({ producerId: 'tidbit' }) } });
    await loadDafView('Chullin', '52a', 'en');
    expect(dafViewPieceResult('tidbit', 'anything', 'Chullin', '52a', 'en')).toBeUndefined();
  });

  it('respects the daf+lang key guard', async () => {
    stubFetch({
      pieces: {
        'halacha.synthesis::h1': piece({ producerId: 'halacha.synthesis', instanceId: 'h1' }),
      },
    });
    await loadDafView('Chullin', '52a', 'en');
    expect(dafViewPieceResult('halacha.synthesis', 'h1', 'Chullin', '52a', 'en')?.cache_hit).toBe(
      true,
    );
    expect(dafViewPieceResult('halacha.synthesis', 'h1', 'Chullin', '53a', 'en')).toBeUndefined();
    expect(dafViewPieceResult('halacha.synthesis', 'h1', 'Chullin', '52a', 'he')).toBeUndefined();
  });

  it('returns undefined before any view has loaded for this daf', () => {
    expect(dafViewPieceResult('x.synthesis', 'i', 'Megillah', '5a', 'en')).toBeUndefined();
  });
});

// The single most important regression guard for the bridge: the client's
// lookups must read the EXACT key the server wrote (server `pieceKey`). Store the
// piece under the server key, look it up via the client — if the two key formats
// ever drift, these fail.
describe('client lookups agree with the server pieceKey format', () => {
  function stubFetch(payload: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );
  }

  it('whole-daf: dafViewWholeDafResult finds a piece stored under pieceKey(producerId)', async () => {
    const key = pieceKey('argument-overview.synthesis');
    stubFetch({ pieces: { [key]: piece({ producerId: 'argument-overview.synthesis' }) } });
    await loadDafView('Chullin', '52a', 'en');
    expect(
      dafViewWholeDafResult('argument-overview.synthesis', 'Chullin', '52a', 'en')?.cache_hit,
    ).toBe(true);
  });

  it('per-instance: dafViewPieceResult finds a piece stored under pieceKey(producerId, instanceId)', async () => {
    const key = pieceKey('pesukim.synthesis', 'abc123');
    stubFetch({
      pieces: { [key]: piece({ producerId: 'pesukim.synthesis', instanceId: 'abc123' }) },
    });
    await loadDafView('Chullin', '52a', 'en');
    expect(
      dafViewPieceResult('pesukim.synthesis', 'abc123', 'Chullin', '52a', 'en')?.cache_hit,
    ).toBe(true);
  });
});

// Phase B: the cold-path cutover. openDafView loads the view; if the daf is cold
// it fires POST /api/daf-generate and re-polls the view (view-driven), so cards
// render from the Workflow instead of fanning out. The crucial property is that
// view-driven mode ALWAYS releases — on completion, generate-failure, a stall,
// or navigation — so cards can never be stuck waiting forever.
describe('openDafView (cold-path, view-driven)', () => {
  // Route fetches by URL so one stub serves daf-view + daf-generate.
  function routeFetch(opts: {
    generate: { generating: boolean } & Record<string, unknown>;
    view: (callIdx: number) => { complete?: boolean; cached?: number; pieces?: unknown };
  }) {
    let viewCalls = 0;
    const spy = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/daf-generate')) {
        return new Response(JSON.stringify(opts.generate), { status: 200 });
      }
      const body = opts.view(viewCalls++);
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('WARM daf: never triggers generation, never goes view-driven', async () => {
    const spy = routeFetch({
      generate: { generating: true },
      view: () => ({ complete: true, pieces: {} }),
    });
    await openDafView('Warm', '2a', 'en');
    expect(isViewDriven('Warm', '2a', 'en')).toBe(false);
    expect(spy.mock.calls.some(([u]) => String(u).includes('/api/daf-generate'))).toBe(false);
  });

  it('COLD daf: triggers generation, goes view-driven, releases on complete', async () => {
    vi.useFakeTimers();
    try {
      // first view call cold; the poll's view call reports complete.
      routeFetch({
        generate: { generating: true },
        view: (i) =>
          i === 0
            ? { complete: false, cached: 1, pieces: {} }
            : { complete: true, cached: 9, pieces: {} },
      });
      const p = openDafView('Cold', '3a', 'en');
      await vi.advanceTimersByTimeAsync(50); // flush initial load + generate trigger
      expect(isViewDriven('Cold', '3a', 'en')).toBe(true);
      await vi.advanceTimersByTimeAsync(9000); // drive one poll → complete
      await p;
      expect(isViewDriven('Cold', '3a', 'en')).toBe(false); // released
    } finally {
      vi.useRealTimers();
    }
  });

  it('COLD daf but generation PAUSED (generating:false): never goes view-driven (cards fetch)', async () => {
    routeFetch({
      generate: { generating: false },
      view: () => ({ complete: false, cached: 0, pieces: {} }),
    });
    await openDafView('Paused', '4a', 'en');
    expect(isViewDriven('Paused', '4a', 'en')).toBe(false);
  });

  it('COLD daf + AI DOWN: the refused trigger raises the shared AI-paused banner in one round-trip', async () => {
    expect(aiStatus()).toBeNull();
    routeFetch({
      generate: { generating: false, paused: true, aiUnavailable: true, reason: 'credits' },
      view: () => ({ complete: false, cached: 0, pieces: {} }),
    });
    await openDafView('Down', '6a', 'en');
    expect(isViewDriven('Down', '6a', 'en')).toBe(false); // cards fall back to /api/run
    expect(aiStatus()?.reason).toBe('credits'); // and the banner is already up
  });

  it('releases view-driven when the cached count STALLS (a stuck producer)', async () => {
    vi.useFakeTimers();
    try {
      // always incomplete, cached count never grows → stall detection fires.
      routeFetch({
        generate: { generating: true },
        view: () => ({ complete: false, cached: 2, pieces: {} }),
      });
      const p = openDafView('Stuck', '5a', 'en');
      await vi.advanceTimersByTimeAsync(50);
      expect(isViewDriven('Stuck', '5a', 'en')).toBe(true);
      // 4 stall polls (STALL_LIMIT) at 8s each → released.
      await vi.advanceTimersByTimeAsync(8000 * 5);
      await p;
      expect(isViewDriven('Stuck', '5a', 'en')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
