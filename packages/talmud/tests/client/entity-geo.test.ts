// fetchEntityGeoPieces — the whole-daf map's per-rabbi entity fetch helper.
// Locks the two behaviors the map relies on for rapid page turns:
//   1. in-flight dedup: concurrent calls for one slug share ONE fetch;
//   2. abort hygiene: an aborted fetch caches nothing and cleans its
//      in-flight entry, so the next daf's request for the same slug starts
//      fresh instead of joining a doomed promise (or seeing a cached miss).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchEntityGeoPieces, resetEntityGeoForTests } from '../../src/client/entityGeo';

const PIECES_BODY = JSON.stringify({
  pieces: { identity: { places: ['Sura'], region: 'bavel' }, geography: null },
});

function okResponse(body: string = PIECES_BODY): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  resetEntityGeoForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchEntityGeoPieces', () => {
  it('dedupes concurrent requests for the same slug into one fetch', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const ac = new AbortController();
    const [a, b] = await Promise.all([
      fetchEntityGeoPieces('rav-huna', ac.signal),
      fetchEntityGeoPieces('rav-huna', ac.signal),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The single request asks only for the facets the map consumes.
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/entity/rabbi/rav-huna?facets=identity,geography',
    );
    expect(a).toEqual({ identity: { places: ['Sura'], region: 'bavel' }, geography: null });
    expect(b).toEqual(a);
  });

  it('serves the result cache on later calls (no second fetch)', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const ac = new AbortController();
    await fetchEntityGeoPieces('rav-huna', ac.signal);
    const again = await fetchEntityGeoPieces('rav-huna', new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(again).toEqual({ identity: { places: ['Sura'], region: 'bavel' }, geography: null });
  });

  it('caches a 404 as a known miss (null) so revisits skip the fetch', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"not found"}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchEntityGeoPieces('nobody', new AbortController().signal)).toBeNull();
    expect(await fetchEntityGeoPieces('nobody', new AbortController().signal)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('an aborted fetch caches nothing and the next call refetches fresh', async () => {
    // First fetch hangs until aborted (a real fetch rejects on abort).
    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const oldDaf = new AbortController();
    const pending = fetchEntityGeoPieces('rav-huna', oldDaf.signal);
    oldDaf.abort();
    // Abort => undefined (transient; NOT a cached miss).
    expect(await pending).toBeUndefined();

    // The next daf asks for the same slug: the doomed in-flight entry must
    // not be joined — a fresh fetch fires and succeeds.
    fetchMock.mockImplementation(async () => okResponse());
    const next = await fetchEntityGeoPieces('rav-huna', new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(next).toEqual({ identity: { places: ['Sura'], region: 'bavel' }, geography: null });
  });

  it('a transient HTTP failure is not cached — the next call retries', async () => {
    const fetchMock = vi.fn(async () => new Response('oops', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchEntityGeoPieces('rav-huna', new AbortController().signal)).toBeUndefined();
    fetchMock.mockImplementation(async () => okResponse());
    const next = await fetchEntityGeoPieces('rav-huna', new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(next).toEqual({ identity: { places: ['Sura'], region: 'bavel' }, geography: null });
  });

  it('does not join a doomed (already-aborted) in-flight promise synchronously', async () => {
    // The old daf's fetch never settles before abort; the new daf's call
    // arrives AFTER abort() but BEFORE the rejection handlers ran — the
    // in-flight entry is still present, and must be skipped via its signal.
    let hangingCalls = 0;
    const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      hangingCalls += 1;
      if (hangingCalls === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        });
      }
      return Promise.resolve(okResponse());
    });
    vi.stubGlobal('fetch', fetchMock);

    const oldDaf = new AbortController();
    const doomed = fetchEntityGeoPieces('rav-huna', oldDaf.signal);
    oldDaf.abort();
    // Synchronously (no await yet) ask again with a live signal.
    const fresh = fetchEntityGeoPieces('rav-huna', new AbortController().signal);
    expect(await doomed).toBeUndefined();
    expect(await fresh).toEqual({
      identity: { places: ['Sura'], region: 'bavel' },
      geography: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
