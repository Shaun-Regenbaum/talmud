import { describe, expect, it } from 'vitest';
import { capitalizeFirst, hebraize } from '../src/client/hebraize';
import {
  alwaysHebraizeBlock,
  CANONICAL_HEBREW_TERMS,
  canonicalDictEntries,
} from '../src/lib/hebrewTerms';
import { CODE_ENRICHMENTS } from '../src/worker/code-marks';

// ---------------------------------------------------------------------------
// capitalizeFirst — used by the appliesWhen / exceptions chips, which the LLM
// emits lowercase. Capitalizes the first cased letter, skipping leading
// quotes/parens/space; Hebrew-script leads are a no-op (Hebrew has no case).
// ---------------------------------------------------------------------------

const CAPITALIZE: Array<[string, string]> = [
  // The exact chips from the reported bug.
  ['locking a door on Shabbat', 'Locking a door on Shabbat'],
  ['using a detached bolt or rod', 'Using a detached bolt or rod'],
  ['the bolt was designated for locking', 'The bolt was designated for locking'],
  ['a bolt that was never prepared', 'A bolt that was never prepared'],
  ['in the Temple, a dragging bolt', 'In the Temple, a dragging bolt'],
  // Already capitalized — unchanged.
  ['A sick person is exempt', 'A sick person is exempt'],
  // Leading opener punctuation is skipped, then the letter is capitalized.
  ['(an aside) matters', '(An aside) matters'],
  ["'bishochbecha' marks the time", "'Bishochbecha' marks the time"],
  // Hebrew-script lead — no case to change, returned as-is.
  ['מוקצה applies here', 'מוקצה applies here'],
  ['שבת locking is the case', 'שבת locking is the case'],
  // A leading Hebrew quote stays untouched too.
  ["'בשכבך' marks the time", "'בשכבך' marks the time"],
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
    expect(capitalizeFirst(hebraize('muktzeh (set aside) may not be handled'))).toBe(
      'Set aside (מוקצה) may not be handled',
    );
  });
  it('leaves a Form-A chip Hebrew-first and uncapitalized at the Hebrew', () => {
    // Hebrew already leads — capitalization is a no-op, Hebrew preserved.
    expect(capitalizeFirst(hebraize('מוקצה (set aside) may not be handled'))).toBe(
      'מוקצה (set aside) may not be handled',
    );
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

describe('alwaysHebraizeBlock — renders every canonical term in its display orientation', () => {
  const block = alwaysHebraizeBlock();
  for (const t of CANONICAL_HEBREW_TERMS) {
    // The list now encodes the per-term display policy so it can't contradict
    // the prompt's Form A/B rule: english-first terms read "en (hebrew)",
    // hebrew-first terms read "translit → hebrew (gloss)".
    if (t.display === 'english' && t.en) {
      it(`block lists ${t.en} (${t.hebrew}) English-first`, () => {
        expect(block).toContain(`${t.en} (${t.hebrew})`);
        expect(block).not.toContain(`${t.translit} → ${t.hebrew}`);
      });
    } else {
      it(`block lists ${t.translit} → ${t.hebrew} (Form A)`, () => {
        expect(block).toContain(`${t.translit} → ${t.hebrew} (${t.gloss})`);
      });
    }
  }
  it('block carries no raw display-enum metadata', () => {
    expect(block).not.toMatch(/hebrew-first-gloss|display/);
  });
});

// Every canonical term must carry a Hebrew gloss too — that is the tooltip
// surface in Hebrew mode (so a Hebrew reader hovering a term gets a Hebrew
// explanation, not the English `gloss`). Locks future additions in.
describe('canonical terms carry a Hebrew gloss', () => {
  for (const term of CANONICAL_HEBREW_TERMS) {
    it(`${term.hebrew} has a non-empty Hebrew gloss in Hebrew script`, () => {
      expect(term.glossHe.trim().length).toBeGreaterThan(0);
      expect(term.glossHe).toMatch(/[֐-׿]/); // contains Hebrew letters
    });
  }
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
const practicalSys =
  (CODE_ENRICHMENTS as unknown as Enrichment[]).find((e) => e.id === 'halacha.practical')?.extractor
    .system_prompt ?? '';

describe('halacha.practical prompt — always-list wiring', () => {
  it('embeds the single-sourced always-hebraize block', () => {
    expect(practicalSys).toContain(alwaysHebraizeBlock());
  });
});

// The HEBREW_GLOSS_STYLE block was shrunk (PR4) — collapsed the Form A/B example
// walls and removed the model's freedom to pick a form. These guard that the
// shrink kept every load-bearing rule, so a future trim can't silently drop one.
describe('HEBREW_GLOSS_STYLE — hard rules survive the shrink', () => {
  const required = [
    'FORM A (DEFAULT)', // Form A is the default
    'FORM B', // Form B reserved for english-first
    'GLOSS ONCE', // first-use-only gloss (pairs with the PR3 dedup pass)
    'calque', // no-calque rule
    'SCRIPT HYGIENE', // english + hebrew script only
    'AUTHORITATIVE', // daf glossary is authoritative
    'transliteration', // no-transliteration rule
  ];
  for (const marker of required) {
    it(`still states: ${marker}`, () => {
      expect(practicalSys).toContain(marker);
    });
  }
});

// The applies-when / exceptions chip lists were retired in the shape-aware
// practical reshape (best-fallback | statement | taxonomy + one optional note),
// so the old "uniform Form A chip convention" prompt rules no longer exist.
