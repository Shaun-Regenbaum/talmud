import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DafViewPiece,
  dafViewWholeDafResult,
  loadDafView,
  synthRunResult,
} from '../src/client/dafViewStore';

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
    // Looking up by the bare producer id must miss — per-instance is a later pass.
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
