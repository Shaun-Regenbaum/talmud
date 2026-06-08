import { describe, it, expect } from 'vitest';
import {
  lintTransliterationInParens,
  lintBareTransliteration,
  lintHalachaText,
  lintHalachaParsed,
  type GlossIssue,
} from '../src/lib/halachaLint';

// ---------------------------------------------------------------------------
// transliteration-in-parens — "(lechatchila)" is the explicitly forbidden form
// (HEBREW_GLOSS_STYLE: "NEVER write a transliteration alone in parens"). The
// parens MUST hold Hebrew script, not a romanization.
// ---------------------------------------------------------------------------

describe('lintTransliterationInParens — flags romanization-only parens', () => {
  const FLAG: Array<[string, string]> = [
    ['performed (lechatchila) one may eat',        'לכתחילה'],
    ['the (bedieved) status is permitted',         'בדיעבד'],
    ['below the (rov basar) threshold',            'רוב בשר'],
    ['set aside as (terumah)',                     'תרומה'],
    ['the (kiddushin) is valid',                   'קידושין'],
    // Hyphenated variant normalizes to the same term.
    ['performed (le-chatchila) at the outset',     'לכתחילה'],
    // Capitalized romanization still matches.
    ['the (Bedieved) ruling',                      'בדיעבד'],
  ];
  for (const [input, hebrew] of FLAG) {
    it(`flags "${input}"`, () => {
      const issues = lintTransliterationInParens(input);
      expect(issues).toHaveLength(1);
      expect(issues[0].kind).toBe('transliteration-in-parens');
      expect(issues[0].hebrew).toBe(hebrew);
    });
  }
});

describe('lintTransliterationInParens — leaves valid / unrelated parens alone', () => {
  const OK: string[] = [
    // Parens already hold the Hebrew anchor.
    'performed לכתחילה (the ideal standard)',
    'set aside as (תרומה)',
    // English gloss in parens — the correct Form A shape.
    'a bolt never prepared is מוקצה (set aside)',
    // Verse / source refs.
    'Mishneh Torah (Hilchot Shabbat 8:1)',
    'compiled (c. 200 CE)',
    // English homograph deliberately excluded from this check.
    'you (get) the document',
    'a (kosher) kitchen',
    // Plain English parenthetical that is not a known romanization.
    'the rule (with one exception) applies',
  ];
  for (const input of OK) {
    it(`leaves "${input}" alone`, () => {
      expect(lintTransliterationInParens(input)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// bare-transliteration — a clearly-technical romanization standing alone with
// no Hebrew anchor nearby. The render backstop cannot repair this, so it is the
// violation that actually reaches the user.
// ---------------------------------------------------------------------------

describe('lintBareTransliteration — flags stranded technical romanizations', () => {
  const FLAG: Array<[string, string]> = [
    ['lechatchila one may lock the door',          'לכתחילה'],
    ['the meat is permitted bedieved',             'בדיעבד'],
    ['this falls below the rov basar line',        'רוב בשר'],
    ['pidyon haben is performed on the firstborn', 'פדיון הבן'],
    ['the ben shnato requirement',                 'בן שנתו'],
    ['set aside as terumah for the kohen',         'תרומה'],
    ['relies on a chazaka here',                    'חזקה'],
  ];
  for (const [input, hebrew] of FLAG) {
    it(`flags "${input}"`, () => {
      const issues = lintBareTransliteration(input);
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues.some((i: GlossIssue) => i.hebrew === hebrew)).toBe(true);
    });
  }
});

describe('lintBareTransliteration — no false positives', () => {
  const OK: string[] = [
    // Hebrew anchor present nearby — legit pairing / doubled form.
    'performed לכתחילה (lechatchila) at the outset',
    'the meat is בדיעבד permitted',
    'a bolt never prepared is מוקצה (set aside) and may not be handled',
    // Bare Hebrew script — already correct, no romanization at all.
    'מוקצה applies here, so it may not be handled',
    'Locking a door on שבת is permitted',
    // English-adopted / homograph terms are excluded from this check.
    'light the Shabbat candles before sunset',
    'it is a mitzvah to hear the shofar',
    'a kosher kitchen needs two sinks',
    'get the milk from the fridge',
    'the rov of the cases follow this',
    'eating matzah on seder night',
    // Plain English with no romanization.
    'A sick person is exempt from the obligation',
  ];
  for (const input of OK) {
    it(`leaves "${input}" alone`, () => {
      expect(lintBareTransliteration(input)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// lintHalachaText — the combined entry point folds in calque detection and
// returns every issue sorted by position.
// ---------------------------------------------------------------------------

describe('lintHalachaText — composes parens + bare + calques', () => {
  it('returns [] for clean, compliant prose', () => {
    const clean = 'A bolt may be used on שבת to lock a door לכתחילה (the ideal standard) if it was prepared before שבת. A bolt never prepared is מוקצה (set aside).';
    expect(lintHalachaText(clean)).toEqual([]);
  });

  it('catches a calque (delegated to lintCalques)', () => {
    const issues = lintHalachaText("the seven commandments of the sons of Noah bind all");
    expect(issues.some((i) => i.kind === 'calque')).toBe(true);
  });

  it('catches a bare romanization and a parens romanization together, sorted', () => {
    const issues = lintHalachaText('lechatchila one acts, but (bedieved) it still counts');
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.map((i) => i.kind)).toContain('bare-transliteration');
    expect(issues.map((i) => i.kind)).toContain('transliteration-in-parens');
    // Sorted by position in the source.
    const indices = issues.map((i) => i.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('returns [] for empty input', () => {
    expect(lintHalachaText('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// lintHalachaParsed — deep-collects string leaves from a parsed enrichment
// payload (prose fields + chip arrays) and lints each. Shape-agnostic across
// the halacha.practical / codification / disputes payloads.
// ---------------------------------------------------------------------------

describe('lintHalachaParsed — lints prose fields and chip arrays', () => {
  it('returns [] for a clean halacha.practical payload', () => {
    const clean = {
      lechatchila: 'A bolt may be used on שבת לכתחילה (the ideal standard) if prepared before שבת.',
      bedieved: '',
      appliesWhen: ['Locking a door on שבת', 'Using a detached bolt'],
      exceptions: ['A bolt never prepared is מוקצה (set aside)'],
      prose: 'The נגר is permitted when prepared.',
    };
    expect(lintHalachaParsed(clean)).toEqual([]);
  });

  it('flags a bare romanization inside a chip array', () => {
    const bad = {
      lechatchila: 'Permitted when prepared.',
      appliesWhen: ['Locking a door bedieved', 'Using a detached bolt'],
      exceptions: [],
      prose: '',
    };
    const issues = lintHalachaParsed(bad);
    expect(issues.some((i) => i.kind === 'bare-transliteration' && i.hebrew === 'בדיעבד')).toBe(true);
  });

  it('flags a calque in a prose field', () => {
    const bad = { prose: 'This is one of the seven commandments of the sons of Noah.' };
    const issues = lintHalachaParsed(bad);
    expect(issues.some((i) => i.kind === 'calque')).toBe(true);
  });

  it('returns [] for null / non-object input', () => {
    expect(lintHalachaParsed(null)).toEqual([]);
    expect(lintHalachaParsed(undefined)).toEqual([]);
  });
});
