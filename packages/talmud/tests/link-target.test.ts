import { describe, expect, it } from 'vitest';
import { dafTarget, linkCorpus, linkTarget } from '../src/lib/context/linkTarget';

describe('linkCorpus', () => {
  it('classifies a Bavli daf by its page shape', () => {
    expect(linkCorpus({ tractate: 'Berakhot', page: '13a', seg: -1 })).toBe('bavli');
    expect(linkCorpus({ tractate: 'Bava Metzia', page: '59b', seg: 4 })).toBe('bavli');
  });
  it('classifies the Yerushalmi by title (its page shape collides with Tanakh)', () => {
    expect(linkCorpus({ tractate: 'Jerusalem Talmud Berakhot', page: '1:1', seg: -1 })).toBe(
      'yerushalmi',
    );
  });
  it('classifies a commentary spine', () => {
    expect(linkCorpus({ tractate: 'Berakhot', page: '2a', seg: -1, spine: 'Rashi' })).toBe(
      'commentary',
    );
  });
  it('falls back to other for Tanakh verses / unknown corpora', () => {
    expect(linkCorpus({ tractate: 'Genesis', page: '1:1', seg: -1 })).toBe('other');
  });
});

describe('linkTarget', () => {
  it('makes a Bavli daf navigable with a relative reader href', () => {
    expect(linkTarget({ tractate: 'Berakhot', page: '13a', seg: -1 })).toEqual({
      label: 'Berakhot 13a',
      corpus: 'bavli',
      navigable: true,
      href: '?tractate=Berakhot&page=13a',
    });
  });
  it('url-encodes a multi-word tractate', () => {
    expect(linkTarget({ tractate: 'Bava Metzia', page: '59a', seg: -1 }).href).toBe(
      '?tractate=Bava%20Metzia&page=59a',
    );
  });
  it('labels a segment coord', () => {
    expect(linkTarget({ tractate: 'Shabbat', page: '31a', seg: 5 }).label).toBe('Shabbat 31a:5');
  });
  it('leaves a Yerushalmi target non-navigable (no in-app reader)', () => {
    const t = linkTarget({ tractate: 'Jerusalem Talmud Berakhot', page: '1:1', seg: -1 });
    expect(t.corpus).toBe('yerushalmi');
    expect(t.navigable).toBe(false);
    expect(t.href).toBeNull();
  });
  it('leaves a commentary-spine target non-navigable + labels with the spine', () => {
    const t = linkTarget({ tractate: 'Berakhot', page: '2a', seg: -1, spine: 'Rashi' });
    expect(t.corpus).toBe('commentary');
    expect(t.navigable).toBe(false);
    expect(t.label).toBe('Rashi · Berakhot 2a');
  });
});

describe('dafTarget', () => {
  it('resolves a bare daf reference', () => {
    expect(dafTarget({ tractate: 'Pesachim', page: '50a' })).toEqual({
      label: 'Pesachim 50a',
      corpus: 'bavli',
      navigable: true,
      href: '?tractate=Pesachim&page=50a',
    });
  });
});
