import { describe, expect, it } from 'vitest';
import { TRACTATE_END_AMUD } from '../src/lib/sefref/amudim';
import {
  buildDafyomiUrl,
  buildRevachUrl,
  dafToNNN,
  getContentTypeSpec,
  getDafyomiMasechet,
  resolveDafRef,
  resolveTractateName,
} from '../src/lib/sefref/dafyomi/masechtos';
import { sefariaPageToHebrewBooksDaf, TRACTATE_IDS } from '../src/lib/sefref/hebrewbooks/client';
import { TRACTATE_OPTIONS } from '../src/lib/sefref/tractates';
import { keyForHebrewBooks, keyForSefariaBundle } from '../src/worker/cache-keys';

/**
 * Cross-source tractate-naming alignment.
 * ---------------------------------------
 * The app navigates by ONE canonical tractate slug (tractates.ts), but four
 * independent layers fetch the underlying daf, each with its own naming table:
 *
 *   - Sefaria        — ref / index_title / cache key use the slug VERBATIM
 *                      ("Berakhot 2a", "Rashi on Berakhot", sefaria-bundle:…:Berakhot:2a)
 *   - HebrewBooks    — TRACTATE_IDS maps the slug -> numeric mesechta id
 *   - dafyomi folders— SEED maps the slug -> dir/prefix/gid (the .htm tree)
 *   - dafyomi Revach — SEED maps the slug -> tid (revdaf.php)
 *
 * These tables are maintained by hand and independently, so the real hazard is
 * DRIFT: rename or drop a tractate in one table and that source silently
 * resolves to a different daf (or fails) while the others don't. This suite
 * pins the contract — every source resolves every canonical slug, to the SAME
 * tractate and the SAME daf — so any future drift fails here instead of in prod.
 */

const CANONICAL = TRACTATE_OPTIONS.map((o) => o.value);
const canonicalSet = new Set(CANONICAL);

describe('tractate naming — coverage parity across sources', () => {
  it('the canonical list is the full 37-tractate Shas surface', () => {
    expect(CANONICAL).toHaveLength(37);
    expect(new Set(CANONICAL).size).toBe(37); // no dup slugs
  });

  it('HebrewBooks TRACTATE_IDS covers exactly the canonical slugs', () => {
    expect(new Set(Object.keys(TRACTATE_IDS))).toEqual(canonicalSet);
  });

  it('the end-amud table covers exactly the canonical slugs (lowercased)', () => {
    // dafyomi range checks + lastDaf read off this; a missing key = a tractate
    // that resolves a name but can't bound its dapim.
    const ends = new Set(Object.keys(TRACTATE_END_AMUD));
    expect(ends).toEqual(new Set(CANONICAL.map((v) => v.toLowerCase())));
  });
});

describe('tractate naming — every source resolves every canonical slug', () => {
  it('HebrewBooks maps each slug to a unique mesechta id 1..37', () => {
    const ids = CANONICAL.map((slug) => {
      const id = TRACTATE_IDS[slug];
      expect(id, `HebrewBooks id for ${slug}`).toBeTypeOf('number');
      return id;
    });
    expect(new Set(ids).size).toBe(CANONICAL.length); // unique
    expect([...ids].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i + 1));
  });

  it('dafyomi resolves each slug to the SAME tractate (folder + Revach + prose)', () => {
    for (const slug of CANONICAL) {
      const m = getDafyomiMasechet(slug);
      expect(m, `dafyomi masechet for ${slug}`).not.toBeNull();
      // The seed's tractate is the canonical slug — not a dafyomi variant.
      expect(m!.tractate).toBe(slug);
      // Revach tid is mapped for every tractate (verified upstream), so the
      // Revach URL is buildable — no source silently drops a tractate.
      expect(m!.tid, `Revach tid for ${slug}`).toBeTypeOf('number');
      expect(buildRevachUrl(m!, 2)).toContain(`tid=${m!.tid}`);
      // The canonical name resolves to itself through the prose resolver.
      expect(resolveTractateName(slug)).toBe(slug);
    }
  });

  it('Sefaria keys off the slug verbatim (ref + cache key)', () => {
    for (const slug of CANONICAL) {
      // The reader builds Sefaria refs as `${slug} ${page}` and the bundle
      // cache key embeds the slug unchanged — no Sefaria-specific spelling map.
      expect(keyForSefariaBundle(slug, '2a')).toBe(`sefaria-bundle:v5:${slug}:2a`);
      expect(keyForHebrewBooks(slug, '2a')).toContain(`:${slug}:`);
    }
  });
});

describe('tractate naming — a (tractate, daf) lands on the SAME daf everywhere', () => {
  // Daf number a source ultimately addresses, from each layer's page encoding.
  const sefariaDaf = (page: string): number => parseInt(page.replace(/[ab]$/i, ''), 10);
  const hbDaf = (page: string): number =>
    parseInt(sefariaPageToHebrewBooksDaf(page).replace(/b$/i, ''), 10);

  // Exercise every tractate at a shared coordinate that is in-range for all of
  // Shas (daf 2 exists in every tractate; "5b" is well within the shortest).
  for (const page of ['2a', '5b']) {
    it(`daf ${page} resolves to one daf number across Sefaria / HebrewBooks / dafyomi`, () => {
      const dafNum = sefariaDaf(page);
      for (const slug of CANONICAL) {
        // Sefaria: page passes through unchanged → same daf number.
        expect(keyForSefariaBundle(slug, page)).toBe(`sefaria-bundle:v5:${slug}:${page}`);
        // HebrewBooks: amud-stripping keeps the daf number identical.
        expect(hbDaf(page)).toBe(dafNum);
        // dafyomi: folder + Revach URLs both address the same zero-padded daf.
        const m = getDafyomiMasechet(slug)!;
        const url = buildDafyomiUrl(m, getContentTypeSpec('insights'), dafNum);
        expect(url).toContain(`-${dafToNNN(dafNum)}.htm`);
        expect(buildRevachUrl(m, dafNum)).toContain(`id=${dafNum}`);
        // resolveDafRef (the dafyomi prose path) round-trips to the same coord.
        expect(resolveDafRef(slug, page)).toEqual({ tractate: slug, page });
      }
    });
  }
});

describe('tractate naming — dafyomi prose variants fold into the canonical slug', () => {
  // dafyomi.co.il prose spells tractates its own way; these MUST resolve to the
  // app slug so an in-text cross-reference lands on the same daf the reader
  // navigates by. (The seam the alias map fills — see masechtos.ts.)
  const VARIANTS: [string, string][] = [
    ['Berachos', 'Berakhot'],
    ['Bava Kama', 'Bava Kamma'],
    ['Bava Basra', 'Bava Batra'],
    ['Rosh Hashana', 'Rosh Hashanah'],
    ['Avodah Zara', 'Avodah Zarah'],
    ['Kesubos', 'Ketubot'],
    ['Makkos', 'Makkot'],
    ['Arachin', 'Arakhin'],
    ['Megila', 'Megillah'],
    ['Taanis', 'Taanit'],
  ];

  it('resolveTractateName folds each prose variant to its canonical slug', () => {
    for (const [variant, canonical] of VARIANTS) {
      expect(canonicalSet.has(canonical)).toBe(true); // guard the fixture
      expect(resolveTractateName(variant), variant).toBe(canonical);
    }
  });

  it('a prose cross-ref (variant + daf) resolves to the canonical (slug, page)', () => {
    // e.g. dafyomi prose "Berachos (31a)" must point at the same daf as the
    // app's "Berakhot 31a".
    expect(resolveDafRef('Berachos', '31a')).toEqual({ tractate: 'Berakhot', page: '31a' });
    expect(resolveDafRef('Bava Kama', '50b')).toEqual({ tractate: 'Bava Kamma', page: '50b' });
    expect(resolveTractateName('Maseches Pesachim')).toBe('Pesachim'); // qualifier stripped
  });
});
