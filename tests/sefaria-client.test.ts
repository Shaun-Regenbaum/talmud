import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flattenPieces, pickV3Version, sefariaAPI } from '../src/lib/sefref/sefaria/client';

describe('flattenPieces', () => {
  it('returns a one-element array for a non-empty string', () => {
    expect(flattenPieces('hello')).toEqual(['hello']);
  });

  it('drops empty strings', () => {
    expect(flattenPieces('')).toEqual([]);
  });

  it('keeps non-empty entries in a flat array (depth-1, Rishonim shape)', () => {
    expect(flattenPieces(['a', '', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('flattens depth-2 arrays into one list (Talmud commentary shape)', () => {
    // Mirror of how Sefaria stores Rashi/Tosafot on Talmud: outer index =
    // gemara segment, inner = pieces per segment. Many segments are empty.
    const text = [
      ['piece-0a', 'piece-0b'],
      [],
      ['piece-2a'],
      [],
      ['piece-4a', 'piece-4b', 'piece-4c'],
    ];
    expect(flattenPieces(text)).toEqual([
      'piece-0a',
      'piece-0b',
      'piece-2a',
      'piece-4a',
      'piece-4b',
      'piece-4c',
    ]);
  });

  it('ignores non-string leaves', () => {
    // Defensive: if Sefaria ever emits null/number/object inside the array
    // we should drop it rather than coerce to "null"/"42".
    const text: unknown = ['ok', null, 42, ['nested', undefined, { a: 1 }, 'also-ok']];
    expect(flattenPieces(text)).toEqual(['ok', 'nested', 'also-ok']);
  });

  it('returns [] for null/undefined/non-array scalars', () => {
    expect(flattenPieces(null)).toEqual([]);
    expect(flattenPieces(undefined)).toEqual([]);
    expect(flattenPieces(42)).toEqual([]);
    expect(flattenPieces({})).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(flattenPieces([])).toEqual([]);
  });
});

describe('pickV3Version', () => {
  it('finds hebrew by actualLanguage="he"', () => {
    const versions = [
      { actualLanguage: 'en', text: ['english'] },
      { actualLanguage: 'he', text: ['עברית'] },
    ];
    expect(pickV3Version(versions, 'he')).toEqual(['עברית']);
  });

  it('finds english by actualLanguage="en"', () => {
    const versions = [
      { actualLanguage: 'he', text: ['עברית'] },
      { actualLanguage: 'en', text: ['english'] },
    ];
    expect(pickV3Version(versions, 'en')).toEqual(['english']);
  });

  it('falls back to the language field when actualLanguage is missing', () => {
    const versions = [{ language: 'hebrew', text: ['עברית'] }];
    expect(pickV3Version(versions, 'he')).toEqual(['עברית']);
  });

  it('returns undefined when the requested language is not in the versions list', () => {
    const versions = [{ actualLanguage: 'he', text: ['עברית'] }];
    expect(pickV3Version(versions, 'en')).toBeUndefined();
  });

  it('returns undefined for an empty versions array', () => {
    expect(pickV3Version([], 'he')).toBeUndefined();
  });
});

describe('getTalmudPageWithCommentaries', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // Helper to build a Response from a JSON body.
  const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('uses v3 for Rashi/Tosafot and flattens nested commentary pieces', async () => {
    // Mock the three endpoints getTalmudPageWithCommentaries calls:
    //   1. /api/texts/Berakhot.2a       (main text)
    //   2. /api/related/Berakhot.2a     (commentary refs)
    //   3. /api/v3/texts/Rashi_on_Berakhot.2a
    //   4. /api/v3/texts/Tosafot_on_Berakhot.2a
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/texts/Berakhot.2a')) {
        return jsonResponse({
          ref: 'Berakhot 2a',
          he: ['gemara-seg-1', 'gemara-seg-2'],
          text: ['gemara-en-1', 'gemara-en-2'],
        });
      }
      if (url.endsWith('/api/related/Berakhot.2a')) {
        // Sefaria returns segment-anchored refs here (e.g.
        // "Rashi on Berakhot 2a:1:1") — not the daf-level ref. Passing
        // that suffix through to v3 would narrow the fetch to a single
        // piece, which is the bug we're guarding against. The
        // implementation must build the daf-level ref itself.
        return jsonResponse({
          links: [
            {
              index_title: 'Rashi on Berakhot',
              type: 'commentary',
              ref: 'Rashi on Berakhot 2a:1:1',
            },
            {
              index_title: 'Tosafot on Berakhot',
              type: 'commentary',
              ref: 'Tosafot on Berakhot 2a:5:1',
            },
          ],
        });
      }
      if (url.includes('/api/v3/texts/') && url.includes('Rashi%20on%20Berakhot%202a')) {
        // Depth-2 Talmud commentary shape with several non-empty segments —
        // this is the case v1 silently truncates to just segment 0.
        return jsonResponse({
          ref: 'Rashi on Berakhot 2a',
          versions: [
            {
              actualLanguage: 'he',
              text: [
                ['rashi-piece-0a', 'rashi-piece-0b'],
                [],
                ['rashi-piece-2a'],
                ['rashi-piece-3a', 'rashi-piece-3b'],
              ],
            },
            { actualLanguage: 'en', text: [['rashi-en-0a'], [], ['rashi-en-2a']] },
          ],
        });
      }
      if (url.includes('/api/v3/texts/') && url.includes('Tosafot%20on%20Berakhot%202a')) {
        return jsonResponse({
          ref: 'Tosafot on Berakhot 2a',
          versions: [
            { actualLanguage: 'he', text: [['tos-0a'], [], ['tos-2a', 'tos-2b']] },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const data = await sefariaAPI.getTalmudPageWithCommentaries('Berakhot', '2a');

    // Main text — joined string from the v1 `he` array.
    expect(data.mainText.hebrew).toBe('gemara-seg-1 gemara-seg-2');
    expect(data.mainText.english).toBe('gemara-en-1 gemara-en-2');

    // Rashi pieces are the depth-2 array flattened to non-empty entries.
    // This is the regression guard: prior to v3 the result was 2 pieces
    // (segment 0 only); the real shape has 5 across 3 non-empty segments.
    expect(data.rashi?.pieces).toEqual([
      'rashi-piece-0a',
      'rashi-piece-0b',
      'rashi-piece-2a',
      'rashi-piece-3a',
      'rashi-piece-3b',
    ]);
    expect(data.rashi?.hebrew).toBe(
      'rashi-piece-0a rashi-piece-0b rashi-piece-2a rashi-piece-3a rashi-piece-3b',
    );
    expect(data.rashi?.english).toBe('rashi-en-0a rashi-en-2a');

    // Tosafot also flattens correctly even when one language version is
    // missing from the v3 response.
    expect(data.tosafot?.pieces).toEqual(['tos-0a', 'tos-2a', 'tos-2b']);
    expect(data.tosafot?.english).toBe('');

    // Sanity: we called the v3 endpoint, not v1, for both commentaries —
    // and with the daf-level ref, NOT the segment-anchored ref from
    // /api/related. A regression that re-introduces the suffix would
    // produce single-piece results in production.
    const calls = fetchSpy.mock.calls.map((c) =>
      typeof c[0] === 'string' ? c[0] : c[0].toString(),
    );
    expect(calls.some((u) => u.includes('/api/v3/texts/') && u.includes('Rashi')))
      .toBe(true);
    expect(calls.some((u) => u.includes('/api/v3/texts/') && u.includes('Tosafot')))
      .toBe(true);
    // Specifically: no v3 URL carries the ":N:N" segment suffix.
    expect(calls.find((u) => u.includes('/api/v3/texts/') && /%3A\d+%3A\d+/.test(u)))
      .toBeUndefined();
  });

  it('omits commentary entries when Sefaria has no link for them', async () => {
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/texts/Berakhot.2a')) {
        return jsonResponse({ he: ['main'], text: ['main-en'] });
      }
      if (url.endsWith('/api/related/Berakhot.2a')) {
        // No commentary links present.
        return jsonResponse({ links: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const data = await sefariaAPI.getTalmudPageWithCommentaries('Berakhot', '2a');
    expect(data.rashi).toBeUndefined();
    expect(data.tosafot).toBeUndefined();
  });

  it('returns undefined commentary when the v3 fetch returns no pieces', async () => {
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/texts/Berakhot.2a')) {
        return jsonResponse({ he: ['main'], text: ['main-en'] });
      }
      if (url.endsWith('/api/related/Berakhot.2a')) {
        return jsonResponse({
          links: [
            { index_title: 'Rashi on Berakhot', type: 'commentary', ref: 'Rashi on Berakhot 2a' },
          ],
        });
      }
      if (url.includes('/api/v3/texts/')) {
        return jsonResponse({ ref: 'Rashi on Berakhot 2a', versions: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const data = await sefariaAPI.getTalmudPageWithCommentaries('Berakhot', '2a');
    expect(data.rashi).toBeUndefined();
  });
});
