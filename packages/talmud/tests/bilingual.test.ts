import { describe, expect, it } from 'vitest';
import {
  applyBilingual,
  buildBilingualQuestions,
  findHebrewParens,
  heKey,
  type ParenDecision,
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
