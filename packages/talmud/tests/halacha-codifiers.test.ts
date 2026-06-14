import { describe, expect, it } from 'vitest';
import {
  baseDafRef,
  buildCodificationChain,
  buildDerivation,
  CODIFIERS,
  classifyCodifier,
  classifyShasSource,
  formatGroundedRefsForPrompt,
  hasCodification,
  parseBavliRef,
  type RelatedLink,
} from '../src/lib/halacha/codifiers';
import type { HalachicRefBundle } from '../src/lib/sefref/sefaria/client';
import { TRACTATE_OPTIONS } from '../src/lib/sefref/tractates';

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
    'Mishneh Torah, Reading the Shema': [
      { ref: 'Mishneh Torah, Reading the Shema 1:9', hebrew: 'he', english: 'en' },
    ],
    'Mishneh Torah, Heave Offerings': [
      { ref: 'Mishneh Torah, Heave Offerings 7:2', hebrew: 'he', english: 'en' },
    ],
    'Tur, Orach Chayim': [{ ref: 'Tur, Orach Chayim 235', hebrew: 'he', english: 'en' }],
    'Shulchan Arukh, Orach Chayim': [
      { ref: 'Shulchan Arukh, Orach Chayim 235:1', hebrew: 'he', english: 'en' },
    ],
    'Sefer Mitzvot Gadol, Positive Commandments': [
      { ref: 'Sefer Mitzvot Gadol, Positive Commandments 18', hebrew: 'he', english: 'en' },
    ],
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
    expect(chain.map((n) => n.id)).toEqual([
      'mishneh-torah',
      'tur',
      'shulchan-aruch',
      'mishnah-berurah',
    ]);
  });

  it('flags einMishpat on the node and sorts attested refs first', () => {
    // Two MT sub-books: the second carries the Ein Mishpat attestation.
    const chain = buildCodificationChain({
      'Mishneh Torah, Reading the Shema': [
        { ref: 'Mishneh Torah, Reading the Shema 4:1', hebrew: 'he', english: 'en' }, // topical
        {
          ref: 'Mishneh Torah, Reading the Shema 1:9',
          hebrew: 'he',
          english: 'en',
          einMishpat: true,
        },
      ],
      'Tur, Orach Chayim': [{ ref: 'Tur, Orach Chayim 235', hebrew: 'he', english: 'en' }],
    });
    const mt = chain.find((n) => n.id === 'mishneh-torah')!;
    expect(mt.einMishpat).toBe(true);
    // Ein Mishpat ref leads even though it arrived second.
    expect(mt.refs[0].ref).toBe('Mishneh Torah, Reading the Shema 1:9');
    expect(chain.find((n) => n.id === 'tur')!.einMishpat).toBe(false);
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

describe('formatGroundedRefsForPrompt', () => {
  it('lists allowlisted codifiers with their refs + capped snippets, in lineage order', () => {
    const out = formatGroundedRefsForPrompt({
      'Tur, Orach Chayim': [
        { ref: 'Tur, Orach Chayim 235', hebrew: 'זמן קריאת שמע', english: 'The time for Shema' },
      ],
      'Mishneh Torah, Reading the Shema': [
        {
          ref: 'Mishneh Torah, Reading the Shema 1:9',
          hebrew: 'מצאת הכוכבים',
          english: 'From nightfall',
        },
      ],
      'Sefer Yereim': [{ ref: 'Sefer Yereim 300:1', hebrew: 'x', english: 'y' }], // noise, dropped
    });
    // Mishneh Torah (order 1) precedes Tur (order 2); noise excluded.
    expect(out.indexOf('Mishneh Torah')).toBeLessThan(out.indexOf('Tur'));
    expect(out).not.toContain('Sefer Yereim');
    expect(out).toContain('Mishneh Torah, Reading the Shema 1:9');
    expect(out).toContain('HE: מצאת הכוכבים');
    expect(out).toContain('EN: The time for Shema');
  });

  it('tags Ein Mishpat refs and adds the prefer-these header', () => {
    const out = formatGroundedRefsForPrompt({
      'Mishneh Torah, Reading the Shema': [
        {
          ref: 'Mishneh Torah, Reading the Shema 1:9',
          hebrew: 'he',
          english: 'en',
          einMishpat: true,
        },
      ],
      'Tur, Orach Chayim': [{ ref: 'Tur, Orach Chayim 235', hebrew: 'he', english: 'en' }],
    });
    expect(out).toContain('Mishneh Torah, Reading the Shema 1:9 [Ein Mishpat');
    expect(out).toContain('PREFER them'); // header instruction present
    // Untagged refs carry no marker.
    expect(out).toMatch(/Tur, Orach Chayim 235(?!\s*\[Ein Mishpat)/);
  });

  it('omits the prefer-these header when nothing is Ein Mishpat-attested', () => {
    const out = formatGroundedRefsForPrompt({
      'Tur, Orach Chayim': [{ ref: 'Tur, Orach Chayim 235', hebrew: 'he', english: 'en' }],
    });
    expect(out).not.toContain('Ein Mishpat');
  });

  it('caps long snippets and marks an empty bundle', () => {
    expect(formatGroundedRefsForPrompt({})).toBe('(no codifier links found for this daf)');
    const long = 'א'.repeat(800);
    const out = formatGroundedRefsForPrompt({
      'Shulchan Arukh, Orach Chayim': [{ ref: 'OC 235:1', hebrew: long, english: '' }],
    });
    expect(out).toContain('…');
    expect(out.length).toBeLessThan(long.length);
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
      'Berakhot 2a', // primary + current → first
      'Pesachim 94a', // primary
      'Shabbat 34b', // primary
      'Jerusalem Talmud Berakhot 1:1:1', // related (yerushalmi)
      'Leviticus 19:5', // root (tanakh)
    ]);
    const current = d.find((s) => s.isCurrent)!;
    expect(current).toMatchObject({
      ref: 'Berakhot 2a',
      kind: 'bavli',
      role: 'primary',
      isCurrent: true,
    });
    expect(d.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(d.find((s) => s.kind === 'tanakh')!.role).toBe('root');
  });

  it('drops commentary/other and survives no-current', () => {
    const d = buildDerivation(links);
    expect(d.some((s) => s.ref.startsWith('Rashi'))).toBe(false);
    expect(d.every((s) => !s.isCurrent)).toBe(true);
  });

  it('orders Ein Mishpat-attested sources ahead of topical ones within a role', () => {
    const d = buildDerivation([
      { ref: 'Shabbat 34b', category: 'Talmud' }, // topical
      { ref: 'Pesachim 94a', category: 'Talmud', einMishpat: true }, // attested
    ]);
    expect(d.map((s) => s.ref)).toEqual(['Pesachim 94a', 'Shabbat 34b']);
    expect(d[0].einMishpat).toBe(true);
  });

  it('keeps a base ref authoritative if any contributing link is Ein Mishpat', () => {
    const d = buildDerivation([
      { ref: 'Berakhot 2a:1', category: 'Talmud' }, // topical segment
      { ref: 'Berakhot 2a:2', category: 'Talmud', einMishpat: true }, // attested segment
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ ref: 'Berakhot 2a', einMishpat: true });
  });
});

describe('parseBavliRef — derivation refs → in-app navigation', () => {
  it('splits single- and multi-word tractates off the daf', () => {
    expect(parseBavliRef('Berakhot 31a')).toEqual({ tractate: 'Berakhot', page: '31a' });
    expect(parseBavliRef('Niddah 66a')).toEqual({ tractate: 'Niddah', page: '66a' });
    // The daf (\d+[ab]) is the anchor, so multi-word tractates stay intact.
    expect(parseBavliRef('Bava Metzia 59b')).toEqual({ tractate: 'Bava Metzia', page: '59b' });
    expect(parseBavliRef('Rosh Hashanah 16a')).toEqual({ tractate: 'Rosh Hashanah', page: '16a' });
    expect(parseBavliRef('Avodah Zarah 18a')).toEqual({ tractate: 'Avodah Zarah', page: '18a' });
    expect(parseBavliRef('Moed Katan 28a')).toEqual({ tractate: 'Moed Katan', page: '28a' });
  });

  it('returns null for non-Bavli refs (Tanakh roots, Yerushalmi, junk)', () => {
    expect(parseBavliRef('Leviticus 19:5')).toBeNull();
    expect(parseBavliRef('Jerusalem Talmud Berakhot 1:1:1')).toBeNull();
    expect(parseBavliRef('Berakhot 2a:3')).toBeNull(); // segment-precise, not a base daf
    expect(parseBavliRef('')).toBeNull();
  });

  // The claim under test: a derivation ref navigates cleanly only when its
  // tractate spelling matches an app URL slug. Today every Bavli tractate the
  // app serves is spelled the same way Sefaria spells it, so a "<slug> <daf>"
  // ref round-trips straight back to a navigable slug — no normalization map
  // needed.
  const APP_SLUGS = new Set(TRACTATE_OPTIONS.map((o) => o.value));

  it('round-trips every app tractate slug to a navigable target', () => {
    for (const slug of APP_SLUGS) {
      const parsed = parseBavliRef(`${slug} 5b`);
      expect(parsed).toEqual({ tractate: slug, page: '5b' });
      // The parsed tractate is a real app slug → goToDaf lands on a real page.
      expect(APP_SLUGS.has(parsed!.tractate)).toBe(true);
    }
  });

  it('does NOT normalize spelling — a variant tractate parses but is not navigable', () => {
    // If a future source spelled a tractate differently than the app slug
    // (these are NOT in TRACTATE_OPTIONS), parseBavliRef still returns the
    // tractate VERBATIM — and that verbatim string is not a known slug, so
    // navigation would miss. This is exactly the seam a normalization map fills.
    for (const variant of ['Avoda Zara 18a', 'Rosh HaShana 16a', 'Beitza 4a', 'Eiruvin 13b']) {
      const parsed = parseBavliRef(variant)!;
      expect(parsed).not.toBeNull();
      expect(APP_SLUGS.has(parsed.tractate)).toBe(false); // would 404 until normalized
    }
    // Sanity: the canonical spellings these mimic ARE valid slugs.
    expect(APP_SLUGS.has('Avodah Zarah')).toBe(true);
    expect(APP_SLUGS.has('Rosh Hashanah')).toBe(true);
    expect(APP_SLUGS.has('Beitzah')).toBe(true);
    expect(APP_SLUGS.has('Eruvin')).toBe(true);
  });
});
