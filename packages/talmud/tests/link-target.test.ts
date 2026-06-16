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
  it('falls back to other for spine-less Tanakh verses / unknown corpora', () => {
    expect(linkCorpus({ tractate: 'Genesis', page: '1:1', seg: -1 })).toBe('other');
  });
  it('classifies a pasuk on the tanach spine', () => {
    expect(linkCorpus({ spine: 'tanach', tractate: 'Genesis', page: '19', seg: 5 })).toBe('tanach');
  });
  it('classifies a codifier ref on a code spine', () => {
    expect(
      linkCorpus({ spine: 'mishneh-torah', tractate: 'Reading the Shema', page: '1', seg: 1 }),
    ).toBe('halacha');
  });
});

describe('linkTarget', () => {
  it('makes a Bavli daf navigable with a relative reader href', () => {
    expect(linkTarget({ tractate: 'Berakhot', page: '13a', seg: -1 })).toEqual({
      label: 'Berakhot 13a',
      corpus: 'bavli',
      navigable: true,
      href: '?tractate=Berakhot&page=13a',
      external: false,
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
  it('makes a pasuk navigable cross-app to the Tanach reader (new tab)', () => {
    const t = linkTarget({ spine: 'tanach', tractate: 'Genesis', page: '19', seg: 5 });
    expect(t).toEqual({
      label: 'Genesis 19:5',
      corpus: 'tanach',
      navigable: true,
      href: 'https://tanach.shaunregenbaum.com/?book=Genesis&chapter=19',
      external: true,
    });
  });
  it('labels a codifier ref by author + ref, inert (the card is the home)', () => {
    const t = linkTarget({
      spine: 'mishneh-torah',
      tractate: 'Reading the Shema',
      page: '1',
      seg: 1,
    });
    expect(t.corpus).toBe('halacha');
    expect(t.navigable).toBe(false);
    expect(t.href).toBeNull();
    expect(t.external).toBe(false);
    expect(t.label).toBe('Rambam · Reading the Shema 1:1');
  });
  it('handles a section-less codifier ref (Mishnah Berurah, siman only)', () => {
    const t = linkTarget({ spine: 'mishnah-berurah', tractate: '', page: '235', seg: 1 });
    expect(t.label).toBe('Mishnah Berurah · 235:1');
  });
});

describe('dafTarget', () => {
  it('resolves a bare daf reference', () => {
    expect(dafTarget({ tractate: 'Pesachim', page: '50a' })).toEqual({
      label: 'Pesachim 50a',
      corpus: 'bavli',
      navigable: true,
      href: '?tractate=Pesachim&page=50a',
      external: false,
    });
  });
});
