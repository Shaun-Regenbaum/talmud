import { describe, it, expect } from 'vitest';
import {
  CANONICAL_HEBREW_TERMS,
  canonicalDictEntries,
  alwaysHebraizeBlock,
} from '../src/lib/hebrewTerms';
import { hebraize, capitalizeFirst } from '../src/client/hebraize';
import { CODE_ENRICHMENTS } from '../src/worker/code-marks';

// ---------------------------------------------------------------------------
// capitalizeFirst — used by the appliesWhen / exceptions chips, which the LLM
// emits lowercase. Capitalizes the first cased letter, skipping leading
// quotes/parens/space; Hebrew-script leads are a no-op (Hebrew has no case).
// ---------------------------------------------------------------------------

const CAPITALIZE: Array<[string, string]> = [
  // The exact chips from the reported bug.
  ['locking a door on Shabbat',          'Locking a door on Shabbat'],
  ['using a detached bolt or rod',       'Using a detached bolt or rod'],
  ['the bolt was designated for locking', 'The bolt was designated for locking'],
  ['a bolt that was never prepared',     'A bolt that was never prepared'],
  ['in the Temple, a dragging bolt',     'In the Temple, a dragging bolt'],
  // Already capitalized — unchanged.
  ['A sick person is exempt',            'A sick person is exempt'],
  // Leading opener punctuation is skipped, then the letter is capitalized.
  ['(an aside) matters',                 '(An aside) matters'],
  ["'bishochbecha' marks the time",      "'Bishochbecha' marks the time"],
  // Hebrew-script lead — no case to change, returned as-is.
  ['מוקצה applies here',                  'מוקצה applies here'],
  ['שבת locking is the case',            'שבת locking is the case'],
  // A leading Hebrew quote stays untouched too.
  ["'בשכבך' marks the time",             "'בשכבך' marks the time"],
  // Degenerate inputs.
  ['', ''],
  ['   ', '   '],
];

describe('capitalizeFirst', () => {
  for (const [input, expected] of CAPITALIZE) {
    it(`"${input}" → "${expected}"`, () => {
      expect(capitalizeFirst(input)).toBe(expected);
    });
  }
});

// The chips render as capitalizeFirst(hebraize(item)). When hebraize's inverted
// pass moves an English gloss to the front, capitalization must apply AFTER —
// otherwise the leading word lands lowercase. This locks the ordering in.
describe('capitalizeFirst composes after hebraize for chips', () => {
  it('capitalizes the English gloss the inverted pass surfaces', () => {
    expect(capitalizeFirst(hebraize('muktzeh (set aside) may not be handled')))
      .toBe('Set aside (מוקצה) may not be handled');
  });
  it('leaves a Form-A chip Hebrew-first and uncapitalized at the Hebrew', () => {
    // Hebrew already leads — capitalization is a no-op, Hebrew preserved.
    expect(capitalizeFirst(hebraize('מוקצה (set aside) may not be handled')))
      .toBe('מוקצה (set aside) may not be handled');
  });
});

// ---------------------------------------------------------------------------
// Drift guard — the whole point of the shared CANONICAL_HEBREW_TERMS module is
// that the generation prompt and the client dict can't fall out of sync. Every
// canonical term (and each variant spelling) MUST resolve through hebraize() to
// its Hebrew, AND must appear in the prompt's always-hebraize block.
// ---------------------------------------------------------------------------

describe('canonical terms resolve through hebraize() (dict side)', () => {
  for (const t of CANONICAL_HEBREW_TERMS) {
    for (const form of [t.translit, ...(t.variants ?? [])]) {
      it(`"${form}" → ${t.hebrew}`, () => {
        // Pass 1 form: `content (translit)` → `content (Hebrew)`. "noun" is a
        // content word, so the parens are kept (not stripped as a stopword).
        expect(hebraize(`a noun (${form})`)).toContain(t.hebrew);
      });
    }
  }
});

describe('alwaysHebraizeBlock — renders every canonical term (prompt side)', () => {
  const block = alwaysHebraizeBlock();
  for (const t of CANONICAL_HEBREW_TERMS) {
    it(`block lists ${t.translit} → ${t.hebrew}`, () => {
      expect(block).toContain(`${t.translit} → ${t.hebrew} (${t.gloss})`);
    });
  }
  // The display field is metadata for the gloss pass, not prompt content — the
  // always-list block must stay byte-for-byte as it was, so adding `display`
  // can't silently perturb generation. (Output unchanged is the PR1 contract.)
  it('block carries no display metadata — translit → hebrew (gloss) only', () => {
    expect(block).not.toMatch(/hebrew-first-gloss|display/);
  });
});

describe('canonicalDictEntries — closes the historical drift gaps', () => {
  const d = canonicalDictEntries();
  it('includes pidyon haben (was missing from the dict)', () => {
    expect(d['pidyon haben']).toBe('פדיון הבן');
  });
  it('includes sheva mitzvot bnei Noach (was missing from the dict)', () => {
    expect(d['sheva mitzvot bnei noach']).toBe('שבע מצוות בני נח');
  });
  it('lowercases keys to match the dict convention', () => {
    expect(d['bnei noach']).toBe('בני נח');
    expect(Object.keys(d).every((k) => k === k.toLowerCase())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wiring — the practical enrichment prompt must actually embed the block, and
// the EN prompt must carry the chip-language rule (plain English, capitalized,
// Hebrew only when no clean gloss). HE is all-Hebrew, so the rule is EN-only.
// ---------------------------------------------------------------------------

type Enrichment = { id: string; extractor: { system_prompt?: string } };
const practicalSys = (CODE_ENRICHMENTS as unknown as Enrichment[])
  .find((e) => e.id === 'halacha.practical')?.extractor.system_prompt ?? '';

describe('halacha.practical prompt — always-list wiring', () => {
  it('embeds the single-sourced always-hebraize block', () => {
    expect(practicalSys).toContain(alwaysHebraizeBlock());
  });
});

// The applies-when / exceptions chip lists were retired in the shape-aware
// practical reshape (best-fallback | statement | taxonomy + one optional note),
// so the old "uniform Form A chip convention" prompt rules no longer exist.
