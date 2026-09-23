import { describe, expect, it } from 'vitest';
import {
  applyBilingual,
  applyGlossary,
  buildBilingualQuestions,
  buildGlossary,
  findHebrewParens,
  heKey,
  type ParenDecision,
  pairsFromDecisions,
  proseWithHebrew,
  rabbiHebrewOnce,
  readDecisions,
  spanCandidates,
} from '../src/lib/bilingual';

const name = (span: string): ParenDecision => ({ kind: 'name', kindP: 1, span, spanP: 0.9 });
const term = (span: string): ParenDecision => ({ kind: 'term', kindP: 1, span, spanP: 0.9 });

describe('findHebrewParens', () => {
  it('finds Hebrew-only parens and skips mixed, digits and Hebrew-first phrases', () => {
    const t =
      'Rabbi Yochanan (רבי יוחנן) cites (Numbers 18:15) and (5b, s.v. אך חלק), then לכתחילה (the ideal) and a גזירה (גזרה).';
    const ps = findHebrewParens(t);
    expect(ps.map((p) => p.inner)).toEqual(['רבי יוחנן']);
  });

  it('keys ignore nikud and quote marks', () => {
    expect(heKey('רַבִּי יוֹחָנָן')).toBe('רבי יוחנן');
    expect(heKey('רש"י')).toBe(heKey('רש״י'));
  });
});

describe('spanCandidates', () => {
  it('offers 1..6 word suffixes of the clause, stopping at punctuation', () => {
    const t = 'He argued, via a verbal analogy (גזירה שווה)';
    expect(spanCandidates(t, t.indexOf('('))).toEqual([
      'analogy',
      'verbal analogy',
      'a verbal analogy',
      'via a verbal analogy',
    ]);
  });
});

describe('applyBilingual', () => {
  it('moves a name gloss from a later mention to the first', () => {
    const t = 'Rabbi Yoḥanan holds they were. Later Rabbi Yoḥanan (רבי יוחנן) answers.';
    const ps = findHebrewParens(t);
    expect(applyBilingual(t, ps, [name('Rabbi Yoḥanan')])).toBe(
      'Rabbi Yoḥanan (רבי יוחנן) holds they were. Later Rabbi Yoḥanan answers.',
    );
  });

  it('drops repeats of the same Hebrew, keeping the first', () => {
    const t = 'A lamb (שה) is given. The lamb (שה) is the redemption.';
    const ps = findHebrewParens(t);
    expect(applyBilingual(t, ps, [term('lamb'), term('lamb')])).toBe(
      'A lamb (שה) is given. The lamb is the redemption.',
    );
  });

  it('never touches "other" or low-confidence parens', () => {
    const t = 'He quotes it (לי יהיו). He quotes it (לי יהיו).';
    const ps = findHebrewParens(t);
    const other: ParenDecision = { kind: 'other', kindP: 1, span: 'it', spanP: 1 };
    expect(applyBilingual(t, ps, [other, other])).toBe(t);
    const unsure: ParenDecision = { kind: 'term', kindP: 0.4, span: 'it', spanP: 1 };
    expect(applyBilingual(t, ps, [unsure, unsure])).toBe(t);
  });

  it('leaves the gloss in place when the span is unsure or the first mention has its own paren', () => {
    const t = 'The court (Sanhedrin) ruled. The court (בית דין) agreed.';
    const ps = findHebrewParens(t);
    expect(applyBilingual(t, ps, [term('court')])).toBe(t);
    const t2 = 'The court ruled. The court (בית דין) agreed.';
    const ps2 = findHebrewParens(t2);
    expect(applyBilingual(t2, ps2, [{ ...term('court'), spanP: 0.3 }])).toBe(t2);
  });

  it('is idempotent', () => {
    const t = 'Rabbi Yoḥanan holds. Rabbi Yoḥanan (רבי יוחנן) answers.';
    const once = applyBilingual(t, findHebrewParens(t), [name('Rabbi Yoḥanan')]);
    expect(applyBilingual(once, findHebrewParens(once), [name('Rabbi Yoḥanan')])).toBe(once);
  });
});

describe('readDecisions / buildBilingualQuestions', () => {
  it('asks a kind per paren and a span only when there is a choice', () => {
    const t = 'Abaye (אביי) says, via a verbal analogy (גזירה שווה), yes.';
    const ps = findHebrewParens(t);
    const qs = buildBilingualQuestions(t, ps);
    expect(Object.keys(qs).sort()).toEqual(['k0', 'k1', 's1']);
    const d = readDecisions(t, ps, {
      k0: { choice: 'name', probabilities: { name: 0.99, term: 0.01, other: 0 } },
      k1: { choice: 'term', probabilities: { name: 0, term: 0.95, other: 0.05 } },
      s1: { choice: 'w2', probabilities: { w1: 0.1, w2: 0.8, w3: 0.1, w4: 0 } },
    });
    expect(d[0]).toMatchObject({ kind: 'name', span: 'Abaye', spanP: 1 });
    expect(d[1]).toMatchObject({ kind: 'term', span: 'verbal analogy', spanP: 0.8 });
  });
});

describe('rabbiHebrewOnce', () => {
  const rabbis = [
    { name: 'Rabbi Yochanan', nameHe: 'רַבִּי יוֹחָנָן' },
    { name: 'Rabban Yochanan ben Zakkai', nameHe: 'רבן יוחנן בן זכאי' },
    { name: 'Reish Lakish', nameHe: 'ריש לקיש' },
  ];

  it('adds Hebrew (without nikud) to the first mention and drops it from later ones', () => {
    const t = 'Rabbi Yoḥanan and Resh Lakish argue. Rabbi Yoḥanan (רבי יוחנן) wins.';
    expect(rabbiHebrewOnce(t, rabbis)).toBe(
      'Rabbi Yoḥanan (רבי יוחנן) and Resh Lakish (ריש לקיש) argue. Rabbi Yoḥanan wins.',
    );
  });

  it('keeps an existing first-mention gloss and matches the longest name', () => {
    const t = 'Rabban Yochanan ben Zakkai (רבן יוחנן בן זכאי) answered Rabbi Yochanan.';
    expect(rabbiHebrewOnce(t, rabbis)).toBe(
      'Rabban Yochanan ben Zakkai (רבן יוחנן בן זכאי) answered Rabbi Yochanan (רבי יוחנן).',
    );
  });

  it("puts the Hebrew after a possessive 's", () => {
    expect(rabbiHebrewOnce("Rabbi Yochanan's objection", rabbis)).toBe(
      "Rabbi Yochanan's (רבי יוחנן) objection",
    );
  });

  it('skips mentions inside parentheses and is idempotent', () => {
    const t = 'The view (as Rabbi Yochanan held) stands.';
    expect(rabbiHebrewOnce(t, rabbis)).toBe(t);
    const once = rabbiHebrewOnce('Rabbi Yochanan and Rabbi Yochanan.', rabbis);
    expect(rabbiHebrewOnce(once, rabbis)).toBe(once);
  });
});

describe('page glossary', () => {
  const d = (kind: 'name' | 'term' | 'other', span: string, p = 0.9): ParenDecision => ({
    kind,
    kindP: p,
    span,
    spanP: p,
  });

  it('keeps names that start with a capital and terms of two words or more', () => {
    const t =
      "Kontrokos' (קונטרוקוס) asked; a maneh of the Sanctuary (מנה של קודש) with a lamb (שה) and the verse (לי יהיו).";
    const ps = findHebrewParens(t);
    const pairs = pairsFromDecisions(ps, [
      d('name', "Kontrokos'"),
      d('term', 'a maneh of the Sanctuary'),
      d('term', 'lamb'),
      d('other', 'the verse'),
    ]);
    expect(pairs).toEqual([
      { en: 'Kontrokos', he: 'קונטרוקוס', kind: 'name' },
      { en: 'a maneh of the Sanctuary', he: 'מנה של קודש', kind: 'term' },
    ]);
  });

  it('merges paragraphs by majority and drops ties', () => {
    const a = { en: 'Kontrokos', he: 'קונטרוקוס', kind: 'name' as const };
    const b = { en: 'Kontrokos', he: 'קונטרקוס', kind: 'name' as const };
    expect(buildGlossary([[a], [a], [b]])).toEqual([a]);
    expect(buildGlossary([[a], [b]])).toEqual([]);
  });

  it('adds Hebrew to the first mention only, after a possessive, and never twice', () => {
    const g = [
      { en: 'Kontrokos', he: 'קונטרוקוס', kind: 'name' as const },
      { en: 'Sanctuary maneh', he: 'מנה של קודש', kind: 'term' as const },
    ];
    const t = "It recounts Kontrokos's questions. Kontrokos asks again about the Sanctuary maneh.";
    const once = applyGlossary(t, g);
    expect(once).toBe(
      "It recounts Kontrokos's (קונטרוקוס) questions. Kontrokos asks again about the Sanctuary maneh (מנה של קודש).",
    );
    expect(applyGlossary(once, g)).toBe(once);
  });

  it('skips a paragraph that already has the Hebrew, and lowercase uses of a name', () => {
    const g = [{ en: 'Rava', he: 'רבא', kind: 'name' as const }];
    expect(applyGlossary('Later, רבא (Rava) spoke.', g)).toBe('Later, רבא (Rava) spoke.');
    expect(applyGlossary('a rava of it', g)).toBe('a rava of it');
  });

  it('finds the prose with Hebrew parens in a page view, skipping raw JSON and duplicates', () => {
    const para =
      'Rabbi Yochanan (רבי יוחנן) holds that firstborns were sanctified in the wilderness.';
    const pieces = {
      a: { parsed: { summary: para } },
      b: { deps_resolved: { x: para } },
      c: '{"synthesis": "Rav Ashi (רב אשי) says so in a long enough string"}',
      d: 'Plain English with no Hebrew in parentheses at all, long enough.',
    };
    expect(proseWithHebrew(pieces)).toEqual([para]);
  });
});

describe('longer names and weak terms', () => {
  it('never puts a short name inside a longer one', () => {
    const rabbis = [{ name: 'Rav', nameHe: 'רב' }];
    expect(rabbiHebrewOnce('Rav Papa asks and Rav answers.', rabbis)).toBe(
      'Rav Papa asks and Rav (רב) answers.',
    );
    const g = [{ en: 'Rabbi Elazar', he: 'רבי אלעזר', kind: 'name' as const }];
    expect(applyGlossary('Rabbi Elazar ben Pedat taught. Then Rabbi Elazar spoke.', g)).toBe(
      'Rabbi Elazar ben Pedat taught. Then Rabbi Elazar (רבי אלעזר) spoke.',
    );
  });

  it('keeps a capitalized word before a name', () => {
    const rabbis = [{ name: 'Rabbi Yochanan', nameHe: 'רבי יוחנן' }];
    expect(rabbiHebrewOnce('Later Rabbi Yochanan answers.', rabbis)).toBe(
      'Later Rabbi Yochanan (רבי יוחנן) answers.',
    );
  });

  it('drops one-word terms (after an article) and terms from a single paragraph', () => {
    const t = 'the conclusion (ופסקו) and the sacred maneh (מנה של קודש)';
    const ps = findHebrewParens(t);
    const dec: ParenDecision[] = [
      { kind: 'term', kindP: 1, span: 'the conclusion', spanP: 1 },
      { kind: 'term', kindP: 1, span: 'the sacred maneh', spanP: 1 },
    ];
    const pairs = pairsFromDecisions(ps, dec);
    expect(pairs.map((p) => p.en)).toEqual(['the sacred maneh']);
    expect(buildGlossary([pairs])).toEqual([]);
    expect(
      buildGlossary([pairs, [{ en: 'sacred maneh', he: 'מנה של קודש', kind: 'term' }]]),
    ).toHaveLength(1);
  });
});
