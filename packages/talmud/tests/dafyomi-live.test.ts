/**
 * Regression tests for the on-demand live dafyomi.co.il fetch path
 * (src/worker/dafyomi-live.ts), with `fetch` stubbed so nothing hits the
 * network. The point is to lock in the Revach l'Daf guarantees that are easy to
 * regress in a refactor:
 *   - Revach is fetched directly (it isn't in the folder hub).
 *   - Revach uses the memdb URL with the masechet's verified tid.
 *   - A failed hub is NOT fatal — Revach still loads (this is what makes Revach
 *     work on tractates whose folder dir/prefix/gid are unverified).
 *   - Revach uses the "A BIT MORE" presence marker, not `id="content"`.
 */

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyForDafyomi } from '../src/worker/cache-keys';
import { scrapeDafyomiLive } from '../src/worker/dafyomi-live';

const revachHtml = readFileSync(
  new URL('./fixtures/dafyomi/chulin-revach-110.htm', import.meta.url),
  'utf-8',
);

/** A minimal folder-hub page listing one content URL (insights for Chulin). */
const HUB_WITH_INSIGHTS = '<a href="chulin/insites/ch-dt-110.htm">Insights</a>';
/** The insights fixture stands in for any folder content page (has #content). */
const insightsHtml = readFileSync(
  new URL('./fixtures/dafyomi/chulin-insites-076.htm', import.meta.url),
  'utf-8',
);

function res(body: string, status = 200) {
  // fetchText now reads arrayBuffer() (to charset-sniff); keep text() too.
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}

/** Install a fetch stub driven by a (url) -> Response map function. Records the
 *  URLs requested so tests can assert exactly what was hit. */
function stubFetch(
  route: (url: string) => { ok: boolean; status: number; text: () => Promise<string> },
) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return route(String(url));
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('scrapeDafyomiLive — Revach', () => {
  it('fetches Revach directly at the memdb tid URL even when the folder hub is empty', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('new_daflinks.php')) return res('', 404); // hub fails
      if (url.includes('memdb/revdaf.php')) return res(revachHtml);
      return res('', 404);
    });

    const daf = await scrapeDafyomiLive('Chullin', 110);

    // Revach survived the hub failure and was placed as a whole-daf block.
    expect(daf).not.toBeNull();
    const revach = daf!.amudim.a?.revach;
    expect(revach?.body.type).toBe('revach');
    if (revach?.body.type !== 'revach') throw new Error('unreachable');
    expect(revach.body.entries.length).toBe(5);
    expect(daf!.source.urls.revach).toBe(
      'https://www.dafyomi.co.il/memdb/revdaf.php?tid=31&id=110',
    );

    // It was fetched at the verified Chullin tid (31), id = plain daf (no padding).
    expect(calls.some((u) => u.includes('memdb/revdaf.php?tid=31&id=110'))).toBe(true);
  });

  it('includes both the folder hub content AND Revach when both are present', async () => {
    stubFetch((url) => {
      if (url.includes('new_daflinks.php')) return res(HUB_WITH_INSIGHTS);
      if (url.includes('memdb/revdaf.php')) return res(revachHtml);
      if (url.includes('insites')) return res(insightsHtml);
      return res('', 404);
    });

    const daf = await scrapeDafyomiLive('Chullin', 110);
    const present = { ...daf!.amudim.a, ...daf!.amudim.b };
    expect(Object.keys(present)).toContain('insights');
    expect(Object.keys(present)).toContain('revach');
  });

  it('treats a Revach page missing the "A BIT MORE" marker as absent (not parsed as content)', async () => {
    stubFetch((url) => {
      if (url.includes('new_daflinks.php')) return res('', 404);
      // A 404/landing page that lacks the marker — must NOT be parsed as Revach.
      if (url.includes('memdb/revdaf.php')) return res('<html><body>not found</body></html>');
      return res('', 404);
    });

    const daf = await scrapeDafyomiLive('Chullin', 110);
    expect(daf).toBeNull(); // nothing present at all
  });

  it('returns null for an out-of-range or unmapped daf without fetching', async () => {
    const calls = stubFetch(() => res('', 404));
    expect(await scrapeDafyomiLive('Chullin', 999)).toBeNull(); // > lastDaf
    expect(await scrapeDafyomiLive('Nonsense', 2)).toBeNull(); // unmapped
    expect(calls).toEqual([]); // guarded before any network call
  });
});

describe('keyForDafyomi cache version', () => {
  // The version MUST advance past v1 so pre-Revach cached dapim (written with no
  // TTL, i.e. permanent) become unreachable and re-fetch with Revach included.
  // Adding a new content type without bumping this strands every already-cached
  // daf on the old shape — bump the version when the ingested set changes.
  it('is at v2 or later (the Revach bump)', () => {
    const key = keyForDafyomi('Chullin', '76');
    const m = key.match(/^dafyomi:v(\d+):/);
    expect(m, key).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(2);
  });
});
