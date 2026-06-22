import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DafViewPiece,
  dafViewLoaded,
  dafViewPieceResult,
  dafViewWholeDafResult,
  loadDafView,
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
