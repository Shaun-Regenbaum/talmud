/**
 * The Shas-wide sage identity index (src/worker/sage-index.ts): row unpacking,
 * the page verdict rule, and the loader's handling of a missing file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INDEX_PIN_MIN_P,
  indexVerdict,
  loadSageIndex,
  resetSageIndexCache,
  type SageIndexRow,
  sageIndexForPage,
  sageIndexPath,
  unpackRows,
} from '../src/worker/sage-index';

const row = (slug: string, p: number, method: 'u' | 'j' | 'l' = 'j', seg = 0): SageIndexRow => ({
  seg,
  wordIdx: 0,
  surface: 'x',
  slug,
  p,
  method,
});

describe('sageIndexPath', () => {
  it('maps a tractate to its static file', () => {
    expect(sageIndexPath('Bava Kamma')).toBe('/sage-index/Bava_Kamma.json');
    expect(sageIndexPath('Berakhot')).toBe('/sage-index/Berakhot.json');
  });
});

describe('unpackRows', () => {
  it('unpacks the packed tuple and folds duplicate registry slugs', () => {
    const rows = unpackRows([
      [3, 7, 'רבה', 'rabbah-bar-nahmani', 0.71, 'j'],
      [4, 0, 'רב', 'rav', 1, 'u'],
    ]);
    expect(rows).toEqual([
      { seg: 3, wordIdx: 7, surface: 'רבה', slug: 'rabbah-b-nachmani', p: 0.71, method: 'j' },
      { seg: 4, wordIdx: 0, surface: 'רב', slug: 'rav', p: 1, method: 'u' },
    ]);
  });
  it('skips malformed rows and an absent page', () => {
    expect(unpackRows(undefined)).toEqual([]);
    expect(unpackRows([[1, 2, 'x', 'slug', 0.5, 'zzz'] as never, ['bad'] as never])).toEqual([]);
  });
});

describe('indexVerdict', () => {
  const cands = ['rabbi-elazar-b-pedat', 'rabbi-elazar-b-azarya', 'rabbi-elazar-b-shamua'];

  it('pins when every mention of the name on the page agrees at high probability', () => {
    const v = indexVerdict(
      [row('rabbi-elazar-b-pedat', 0.97), row('rabbi-elazar-b-pedat', 0.93), row('rava', 1, 'u')],
      cands,
    );
    expect(v.slug).toBe('rabbi-elazar-b-pedat');
    expect(v.n).toBe(2);
    expect(v.agree).toBe(2);
    expect(v.meanP).toBe(0.95);
    expect(v.reason).toContain('2 of 2');
  });

  it('does not pin when the mentions split between bearers', () => {
    const v = indexVerdict(
      [row('rabbi-elazar-b-pedat', 0.95), row('rabbi-elazar-b-azarya', 0.94)],
      cands,
    );
    expect(v.slug).toBeNull();
    expect(v.reason).toContain('split');
  });

  it('does not pin on probability under the floor, even when unanimous', () => {
    const v = indexVerdict([row('rabbi-elazar-b-pedat', INDEX_PIN_MIN_P - 0.05)], cands);
    expect(v.slug).toBeNull();
    expect(v.reason).toContain(`p >= ${INDEX_PIN_MIN_P}`);
  });

  it('a low-confidence (l) row never counts toward a pin', () => {
    const v = indexVerdict([row('rabbi-elazar-b-pedat', 0.95, 'l')], cands);
    expect(v.slug).toBeNull();
  });

  it('ignores rows for people who are not candidates', () => {
    const v = indexVerdict([row('rava', 1, 'u'), row('abaye', 1, 'u')], cands);
    expect(v.slug).toBeNull();
    expect(v.n).toBe(0);
  });

  it('a minority dissenter under 20% does not block the pin', () => {
    const rows = [
      row('rabbi-elazar-b-pedat', 0.98),
      row('rabbi-elazar-b-pedat', 0.96),
      row('rabbi-elazar-b-pedat', 0.95),
      row('rabbi-elazar-b-pedat', 0.94),
      row('rabbi-elazar-b-pedat', 0.97),
      row('rabbi-elazar-b-azarya', 0.6),
    ];
    const v = indexVerdict(rows, cands);
    expect(v.slug).toBe('rabbi-elazar-b-pedat');
    expect(v.agree).toBe(5);
    expect(v.n).toBe(6);
  });
});

describe('loadSageIndex', () => {
  beforeEach(() => resetSageIndexCache());
  afterEach(() => resetSageIndexCache());

  const assetsReturning = (body: string, ok = true): Fetcher =>
    ({
      fetch: async () => new Response(body, { status: ok ? 200 : 404 }),
    }) as unknown as Fetcher;

  it('returns the rows for a page from the tractate file', async () => {
    const doc = {
      version: 1,
      generatedAt: '',
      source: 't',
      model: 'm',
      promptVersion: 'v',
      tractate: 'Berakhot',
      amudim: { '2a': [[0, 1, 'רבי אליעזר', 'rabbi-eliezer-b-hyrcanus', 0.99, 'j']] },
    };
    const rows = await sageIndexForPage(
      assetsReturning(JSON.stringify(doc)),
      'Berakhot',
      '2a',
      null,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe('rabbi-eliezer-b-hyrcanus');
    expect(
      await sageIndexForPage(assetsReturning(JSON.stringify(doc)), 'Berakhot', '2b', null),
    ).toEqual([]);
  });

  it('treats the SPA fallback page and a 404 as "no index" (no origin fallback)', async () => {
    expect(
      await loadSageIndex(assetsReturning('<!doctype html><html>'), 'Berakhot', null),
    ).toBeNull();
    expect(await loadSageIndex(assetsReturning('', false), 'Berakhot', null)).toBeNull();
    expect(await loadSageIndex(undefined, 'Berakhot', null)).toBeNull();
  });

  it("without an assets binding (the generation worker) reads the reader's public copy", async () => {
    const doc = {
      version: 1,
      generatedAt: '',
      source: 't',
      model: 'm',
      promptVersion: 'v',
      tractate: 'Temurah',
      amudim: { '3b': [[2, 5, 'רבי אלעזר', 'rabbi-elazar-b-pedat', 0.99, 'j']] },
    };
    const calls: string[] = [];
    const fetchStub = vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(doc), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchStub);
    try {
      const rows = await sageIndexForPage(undefined, 'Temurah', '3b', 'https://example.test');
      expect(rows).toHaveLength(1);
      expect(rows[0].slug).toBe('rabbi-elazar-b-pedat');
      expect(calls).toEqual(['https://example.test/sage-index/Temurah.json']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to the public copy when the assets binding serves the SPA page', async () => {
    const doc = {
      version: 1,
      generatedAt: '',
      source: 't',
      model: 'm',
      promptVersion: 'v',
      tractate: 'X',
      amudim: { '2a': [] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(doc), { status: 200 })),
    );
    try {
      const loaded = await loadSageIndex(
        assetsReturning('<!doctype html>'),
        'X',
        'https://example.test',
      );
      expect(loaded?.tractate).toBe('X');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
