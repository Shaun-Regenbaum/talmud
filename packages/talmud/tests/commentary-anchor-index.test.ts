import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fetchCommentaryAnchorIndex } from '../src/client/commentaryAnchorIndex';

// The anchor index module pulls Sefaria links through getSefariaLinks. We
// stub fetch so the test exercises the depth-2 ref parsing without touching
// the live Sefaria API.
describe('commentaryAnchorIndex', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('keys pieces by Sefaria "S:P" so depth-2 refs round-trip to data-piece-key', async () => {
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (!url.includes('/api/related/')) {
        throw new Error(`unexpected fetch: ${url}`);
      }
      // Mirrors the real Sefaria shape: depth-2 commentary refs, with
      // 1-based segment/piece numbers. The segment-anchored anchorRef is
      // a *daf* segment (e.g. "Berakhot 2a:11"); the trailing piece slot
      // belongs to the commentary's own structure, not the daf.
      return new Response(
        JSON.stringify({
          links: [
            {
              index_title: 'Rashi on Berakhot',
              collectiveTitle: { en: 'Rashi', he: 'רש"י' },
              category: 'Commentary',
              ref: 'Rashi on Berakhot 2a:1:1',
              anchorRef: 'Berakhot 2a:1',
            },
            {
              index_title: 'Rashi on Berakhot',
              collectiveTitle: { en: 'Rashi', he: 'רש"י' },
              category: 'Commentary',
              ref: 'Rashi on Berakhot 2a:1:2',
              anchorRef: 'Berakhot 2a:1',
            },
            {
              index_title: 'Rashi on Berakhot',
              collectiveTitle: { en: 'Rashi', he: 'רש"י' },
              category: 'Commentary',
              ref: 'Rashi on Berakhot 2a:11:1',
              anchorRef: 'Berakhot 2a:11',
            },
            {
              index_title: 'Tosafot on Berakhot',
              collectiveTitle: { en: 'Tosafot', he: 'תוס׳' },
              category: 'Commentary',
              ref: 'Tosafot on Berakhot 2a:5:2',
              anchorRef: 'Berakhot 2a:5-7',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const idx = await fetchCommentaryAnchorIndex(`Berakhot-unique-${Date.now()}`, '2a');

    // Forward: daf segment → piece keys. Segment indices are 0-based
    // internally (links.ts subtracts 1), so anchorRef "Berakhot 2a:11"
    // becomes seg 10.
    expect(idx.segToPieces.get(0)).toEqual({ rashi: ['1:1', '1:2'], tosafot: [] });
    expect(idx.segToPieces.get(10)).toEqual({ rashi: ['11:1'], tosafot: [] });
    // Tosafot anchorRef "Berakhot 2a:5-7" expands to internal segs 4,5,6.
    expect(idx.segToPieces.get(4)?.tosafot).toEqual(['5:2']);
    expect(idx.segToPieces.get(5)?.tosafot).toEqual(['5:2']);
    expect(idx.segToPieces.get(6)?.tosafot).toEqual(['5:2']);

    // Reverse: piece key → daf segs. Crucially, the "11:1" Rashi maps to
    // seg 10 — NOT to seg 0, which was the pre-fix bug (the index used to
    // parse only the trailing ":1" as a global piece idx and conflate
    // every "X:1" ref with the first piece on the daf).
    expect(idx.pieceToSegs.get('rashi:11:1')).toEqual([10]);
    expect(idx.pieceToSegs.get('rashi:1:1')).toEqual([0]);
    expect(idx.pieceToSegs.get('rashi:1:2')).toEqual([0]);
    expect(idx.pieceToSegs.get('tosafot:5:2')).toEqual([4, 5, 6]);
  });
});
