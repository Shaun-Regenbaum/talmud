import { describe, expect, it } from 'vitest';
import { CANONICAL_HEBREW_TERMS } from '../src/lib/hebrewTerms';
import { conceptToTerm, globalTerms, glossaryForDaf, type Term } from '../src/lib/terms/registry';

// ---------------------------------------------------------------------------
// display policy — every global carries an explicit, valid verdict, and the
// 'english' display implies an English surface to render. These guard the
// authoring invariants the first-mention gloss pass (PR3) will rely on.
// ---------------------------------------------------------------------------

const VALID_DISPLAY = new Set(['hebrew', 'english', 'hebrew-first-gloss']);

describe('canonical display policy', () => {
  for (const t of CANONICAL_HEBREW_TERMS) {
    it(`${t.translit} has a valid display`, () => {
      expect(VALID_DISPLAY.has(t.display)).toBe(true);
    });
  }
  it("every display:'english' term has an `en` surface", () => {
    for (const t of CANONICAL_HEBREW_TERMS) {
      if (t.display === 'english') expect(t.en, t.translit).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// globalTerms — faithful, isolated projection of the canonical list to Term.
// ---------------------------------------------------------------------------

describe('globalTerms', () => {
  const g = globalTerms();
  it('projects every canonical term, scoped global', () => {
    expect(g.length).toBe(CANONICAL_HEBREW_TERMS.length);
    expect(g.every((t) => t.scope === 'global')).toBe(true);
  });
  it('carries display + gloss + hebrew through', () => {
    const halacha = g.find((t) => t.hebrew === 'הלכה');
    expect(halacha).toMatchObject({ display: 'hebrew', gloss: 'binding law', translit: 'halacha' });
  });
  it('does not alias the source variants array (mutation safety)', () => {
    const src = CANONICAL_HEBREW_TERMS.find((t) => t.translit === 'halacha');
    const proj = g.find((t) => t.hebrew === 'הלכה');
    expect(proj!.variants).not.toBe(src!.variants);
    expect(proj!.variants).toEqual(src!.variants);
  });
});

// ---------------------------------------------------------------------------
// conceptToTerm — normalize a daf-background concept to Term; drop the ones
// with no Hebrew surface (nothing to anchor).
// ---------------------------------------------------------------------------

describe('conceptToTerm', () => {
  it('normalizes a concept with Hebrew to a daf-scoped Term', () => {
    expect(
      conceptToTerm({
        term: 'Twilight',
        termHe: 'בין השמשות',
        gloss: 'the dusk window',
        category: 'realia',
      }),
    ).toEqual<Term>({
      hebrew: 'בין השמשות',
      en: 'Twilight',
      gloss: 'the dusk window',
      display: 'hebrew-first-gloss',
      category: 'realia',
      scope: 'daf',
    });
  });
  it('returns null when the concept has no Hebrew surface', () => {
    expect(conceptToTerm({ term: 'Twilight', gloss: 'x' })).toBeNull();
    expect(conceptToTerm({ term: 'Twilight', termHe: '   ', gloss: 'x' })).toBeNull();
  });
  it('drops an unknown category rather than passing it through', () => {
    const t = conceptToTerm({ term: 'X', termHe: 'איקס', gloss: 'g', category: 'bogus' as never });
    expect(t!.category).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// glossaryForDaf — globals ∪ daf, daf wins on a Hebrew-key collision.
// ---------------------------------------------------------------------------

describe('glossaryForDaf', () => {
  it('with no daf terms equals the globals', () => {
    expect(glossaryForDaf([])).toEqual(globalTerms());
  });
  it('appends daf-only terms after the globals', () => {
    const daf = conceptToTerm({ term: 'Twilight', termHe: 'בין השמשות', gloss: 'dusk' })!;
    const out = glossaryForDaf([daf]);
    expect(out.length).toBe(globalTerms().length + 1);
    expect(out.at(-1)).toEqual(daf);
  });
  it('lets a daf term override a global of the same Hebrew, in place', () => {
    const sharpened: Term = {
      hebrew: 'הלכה',
      gloss: 'binding law as this sugya applies it',
      display: 'hebrew',
      scope: 'daf',
    };
    const out = glossaryForDaf([sharpened]);
    expect(out.length).toBe(globalTerms().length); // no growth — overrode
    const hit = out.filter((t) => t.hebrew === 'הלכה');
    expect(hit.length).toBe(1);
    expect(hit[0]).toEqual(sharpened); // daf won
  });
});
