import { describe, expect, it } from 'vitest';
import { BASE_URL } from './helpers';

/**
 * /api/daf x-cache header tests.
 *
 * The worker peeks KV for each of its three slice fetches (HB main,
 * Sefaria segments, Sefaria bundle) and emits x-cache: hit|miss|partial
 * to reflect whether the whole response was served from KV. The renderer
 * activity panel reads this header to label "daf-fetch (cache hit)" —
 * previously a brittle ms<50 heuristic that always reported miss.
 */
describe(`integration: /api/daf x-cache header (against ${BASE_URL})`, () => {
  const tractate = 'Berakhot';
  const page = '2a';
  const url = `${BASE_URL}/api/daf/${tractate}/${page}`;

  it('emits an x-cache header with a known state value', async () => {
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    const state = res.headers.get('x-cache');
    expect(state, 'x-cache header should be present on /api/daf').not.toBeNull();
    expect(['hit', 'miss', 'partial']).toContain(state);
  });

  it('reports x-cache: hit on a repeated request', async () => {
    // First request guarantees all three slices are warmed; the second
    // must therefore be a full KV hit regardless of starting cache state.
    const warm = await fetch(url);
    expect(warm.ok).toBe(true);

    const res = await fetch(url);
    expect(res.ok).toBe(true);
    expect(res.headers.get('x-cache')).toBe('hit');
  });
});
