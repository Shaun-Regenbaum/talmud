import { describe, it, expect } from 'vitest';
import {
  classifyCodifier, buildCodificationChain, hasCodification, CODIFIERS,
  classifyShasSource, baseDafRef, buildDerivation,
  type RelatedLink,
} from '../src/lib/halacha/codifiers';
import type { HalachicRefBundle } from '../src/lib/sefref/sefaria/client';

// Fixtures below are the SHAPES observed live from Sefaria (/api/related):
// index_titles like "Mishneh Torah, Reading the Shema", "Tur, Orach Chayim",
// "Shulchan Arukh, Orach Chayim", plus the noise we must filter out, and the
// reverse Talmud/Tanakh sources for a code ref.

describe('classifyCodifier', () => {
  it('matches the canonical codifiers by index_title prefix', () => {
    expect(classifyCodifier('Mishneh Torah, Reading the Shema')?.id).toBe('mishneh-torah');
    expect(classifyCodifier('Mishneh Torah, Ritual Slaughter')?.id).toBe('mishneh-torah');
    expect(classifyCodifier('Tur, Orach Chayim')?.id).toBe('tur');
    expect(classifyCodifier('Tur, Choshen Mishpat')?.id).toBe('tur');
    expect(classifyCodifier('Shulchan Arukh, Orach Chayim')?.id).toBe('shulchan-aruch');
    expect(classifyCodifier('Shulchan Aruch, Yoreh Deah')?.id).toBe('shulchan-aruch'); // alt spelling
    expect(classifyCodifier('Mishnah Berurah')?.id).toBe('mishnah-berurah');
    expect(classifyCodifier("Arukh HaShulchan, Yoreh De'ah")?.id).toBe('arukh-hashulchan');
  });

  it('rejects the noisy "Halakhah" non-codifiers', () => {
    for (const noise of [
      'Sefer Mitzvot Gadol, Positive Commandments',
      'Halakhot Gedolot',
      'Sefer Yereim',
      'Peninei Halakhah, Prayer',
      'Ben Ish Hai, Halachot',
      'Sefer HaChinukh',
      'Contemporary Halakhic Problems, Vol IV, Chapter XIII',
      'Ohr Zarua, Volume I',
    ]) {
      expect(classifyCodifier(noise)).toBeNull();
    }
  });

  it('tiers the big-three as primary and the glosses as secondary', () => {
    const primary = CODIFIERS.filter((c) => c.tier === 'primary').map((c) => c.id);
    expect(primary).toEqual(['mishneh-torah', 'tur', 'shulchan-aruch']);
  });
});

describe('buildCodificationChain', () => {
  // Berakhot 2a (evening Shema) as the bundle arrives today: a mix of canonical
  // codifiers (under several MT sub-books) and noise.
  const bundle: HalachicRefBundle = {
    'Mishneh Torah, Reading the Shema': [{ ref: 'Mishneh Torah, Reading the Shema 1:9', hebrew: 'he', english: 'en' }],
    'Mishneh Torah, Heave Offerings': [{ ref: 'Mishneh Torah, Heave Offerings 7:2', hebrew: 'he', english: 'en' }],
    'Tur, Orach Chayim': [{ ref: 'Tur, Orach Chayim 235', hebrew: 'he', english: 'en' }],
    'Shulchan Arukh, Orach Chayim': [{ ref: 'Shulchan Arukh, Orach Chayim 235:1', hebrew: 'he', english: 'en' }],
    'Sefer Mitzvot Gadol, Positive Commandments': [{ ref: 'Sefer Mitzvot Gadol, Positive Commandments 18', hebrew: 'he', english: 'en' }],
    'Mishnah Berurah': [{ ref: 'Mishnah Berurah 235:1', hebrew: 'he', english: 'en' }],
  };

  it('keeps only allowlisted codifiers, ordered chronologically, by default primary-only', () => {
    const chain = buildCodificationChain(bundle);
    expect(chain.map((n) => n.id)).toEqual(['mishneh-torah', 'tur', 'shulchan-aruch']);
    expect(chain.map((n) => n.short)).toEqual(['Rambam', 'Tur', 'Mechaber']);
  });

  it("merges a codifier's sub-books into one node", () => {
    const chain = buildCodificationChain(bundle);
    const mt = chain.find((n) => n.id === 'mishneh-torah')!;
    expect(mt.refs.map((r) => r.ref)).toEqual([
      'Mishneh Torah, Reading the Shema 1:9',
      'Mishneh Torah, Heave Offerings 7:2',
    ]);
  });

  it('adds the secondary glosses only when asked', () => {
    const chain = buildCodificationChain(bundle, { includeSecondary: true });
    expect(chain.map((n) => n.id)).toEqual(['mishneh-torah', 'tur', 'shulchan-aruch', 'mishnah-berurah']);
  });

  it('returns empty for a bundle with no codifiers (the aggadah case)', () => {
    const aggadic: HalachicRefBundle = {
      'Sefer Yereim': [{ ref: 'Sefer Yereim 300:1', hebrew: 'he', english: 'en' }],
      'Ohr Zarua, Volume I': [{ ref: 'Ohr Zarua, Volume I 1:1', hebrew: 'he', english: 'en' }],
    };
    expect(buildCodificationChain(aggadic)).toEqual([]);
    expect(hasCodification(aggadic)).toBe(false);
    expect(hasCodification(bundle)).toBe(true);
    expect(hasCodification(undefined)).toBe(false);
  });
});

describe('classifyShasSource + baseDafRef', () => {
  it('distinguishes Bavli, Yerushalmi, Tanakh', () => {
    expect(classifyShasSource('Berakhot 2a:1', 'Talmud')).toBe('bavli');
    expect(classifyShasSource('Jerusalem Talmud Berakhot 1:1:1', 'Talmud')).toBe('yerushalmi');
    expect(classifyShasSource('Leviticus 19:5', 'Tanakh')).toBe('tanakh');
    expect(classifyShasSource('Rashi on Berakhot 2a', 'Commentary')).toBe('other');
  });

  it('collapses a Talmud ref to its daf', () => {
    expect(baseDafRef('Berakhot 2a:1-3')).toBe('Berakhot 2a');
    expect(baseDafRef('Sanhedrin 2a:1-2b:2')).toBe('Sanhedrin 2a'); // range across amudim → first
    expect(baseDafRef('Shabbat 35b:2')).toBe('Shabbat 35b');
  });
});

describe('buildDerivation', () => {
  // Reverse links observed for "Mishneh Torah, Reading the Shema 1:9".
  const links: RelatedLink[] = [
    { ref: 'Shabbat 34b', category: 'Talmud' },
    { ref: 'Pesachim 94a', category: 'Talmud' },
    { ref: 'Berakhot 2a:1', category: 'Talmud' },
    { ref: 'Berakhot 2a:2', category: 'Talmud' },
    { ref: 'Berakhot 2a:3', category: 'Talmud' },
    { ref: 'Jerusalem Talmud Berakhot 1:1:1', category: 'Talmud' },
    { ref: 'Leviticus 19:5', category: 'Tanakh' },
    { ref: 'Rashi on Berakhot 2a', category: 'Commentary' }, // dropped
  ];

  it('dedupes to base dapim, marks the current daf, orders primary→related→root', () => {
    const d = buildDerivation(links, { tractate: 'Berakhot', page: '2a' });
    expect(d.map((s) => s.ref)).toEqual([
      'Berakhot 2a',                  // primary + current → first
      'Pesachim 94a',                 // primary
      'Shabbat 34b',                  // primary
      'Jerusalem Talmud Berakhot 1:1:1', // related (yerushalmi)
      'Leviticus 19:5',               // root (tanakh)
    ]);
    const current = d.find((s) => s.isCurrent)!;
    expect(current).toMatchObject({ ref: 'Berakhot 2a', kind: 'bavli', role: 'primary', isCurrent: true });
    expect(d.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(d.find((s) => s.kind === 'tanakh')!.role).toBe('root');
  });

  it('drops commentary/other and survives no-current', () => {
    const d = buildDerivation(links);
    expect(d.some((s) => s.ref.startsWith('Rashi'))).toBe(false);
    expect(d.every((s) => !s.isCurrent)).toBe(true);
  });
});
