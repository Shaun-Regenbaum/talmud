import { describe, expect, it } from 'vitest';
import {
  type BilingualItem,
  buildBilingualQuestions,
  buildGlossary,
  findHebrewParens,
  flipQuotes,
  hebrewFirst,
  heKey,
  type ParenDecision,
  pairsFromDecisions,
  proseWithHebrew,
  rabbiItems,
  readDecisions,
  spanCandidates,
} from '../src/lib/bilingual';

const name = (en: string, he: string): BilingualItem => ({ en, he, kind: 'name' });
const term = (en: string, he: string): BilingualItem => ({ en, he, kind: 'term' });

describe('findHebrewParens', () => {
  it('finds Hebrew-only parens and skips mixed, digits and Hebrew-first phrases', () => {
    const t =
      'Rabbi Yochanan (רבי יוחנן) cites (Numbers 18:15) and (5b, s.v. אך חלק), then לכתחילה (the ideal) and a גזירה (גזרה).';
    expect(findHebrewParens(t).map((p) => p.inner)).toEqual(['רבי יוחנן']);
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

describe('hebrewFirst', () => {
  it('turns "English (Hebrew)" into "Hebrew (English)" and later mentions into Hebrew', () => {
    const t = 'Rabbi Yoḥanan (רבי יוחנן) holds they were. Later Rabbi Yoḥanan answers.';
    expect(hebrewFirst(t, [name('Rabbi Yochanan', 'רבי יוחנן')])).toBe(
      'רבי יוחנן (Rabbi Yoḥanan) holds they were. Later רבי יוחנן answers.',
    );
  });

  it('puts the Hebrew on the first mention even when the model glossed a later one', () => {
    const t = 'Rabbi Yoḥanan holds. Later Rabbi Yoḥanan (רבי יוחנן) answers.';
    expect(hebrewFirst(t, [name('Rabbi Yoḥanan', 'רבי יוחנן')])).toBe(
      'רבי יוחנן (Rabbi Yoḥanan) holds. Later רבי יוחנן answers.',
    );
  });

  it('adds Hebrew where the model gave none, keeping a possessive in the English', () => {
    const t = "Rabbi Yochanan's objection stands, and Rabbi Yochanan's student agrees.";
    expect(hebrewFirst(t, [name('Rabbi Yochanan', 'רַבִּי יוֹחָנָן')])).toBe(
      "רבי יוחנן (Rabbi Yochanan's) objection stands, and רבי יוחנן's student agrees.",
    );
  });

  it('keeps an article outside a term and leaves Hebrew-first text alone', () => {
    const t = 'the sacred maneh (מנה של קודש) was double; the sacred maneh held.';
    expect(hebrewFirst(t, [term('the sacred maneh', 'מנה של קודש')])).toBe(
      'the מנה של קודש (sacred maneh) was double; the מנה של קודש held.',
    );
    const done = 'מנה של קודש (sacred maneh) was double.';
    expect(hebrewFirst(done, [term('sacred maneh', 'מנה של קודש')])).toBe(done);
  });

  it('handles a bare-apostrophe possessive and keeps later one-word terms English', () => {
    const t =
      "Kontrokos' (קונטרוקוס) questions. The halachic (הלכתית) standard and halachic (הלכתית) derivation.";
    expect(hebrewFirst(t, [name('Kontrokos', 'קונטרוקוס'), term('halachic', 'הלכתית')])).toBe(
      "קונטרוקוס (Kontrokos') questions. The הלכתית (halachic) standard and halachic derivation.",
    );
  });

  it('glosses a bare Hebrew first mention with its English', () => {
    expect(hebrewFirst('רבי אליעזר says so.', [name('Rabbi Eliezer', 'רבי אליעזר')])).toBe(
      'רבי אליעזר (Rabbi Eliezer) says so.',
    );
  });

  it('never splits a longer name, and matches the longest item first', () => {
    const items = [name('Rav', 'רב'), name('Rabban Yochanan ben Zakkai', 'רבן יוחנן בן זכאי')];
    expect(hebrewFirst('Rav Papa asks and Rav answers.', items)).toBe(
      'Rav Papa asks and רב (Rav) answers.',
    );
    expect(hebrewFirst('Rabban Yochanan ben Zakkai answered.', items)).toBe(
      'רבן יוחנן בן זכאי (Rabban Yochanan ben Zakkai) answered.',
    );
  });

  it('skips mentions inside parentheses and is idempotent', () => {
    const items = [name('Rabbi Yochanan', 'רבי יוחנן')];
    expect(hebrewFirst('The view (as Rabbi Yochanan held) stands.', items)).toBe(
      'The view (as Rabbi Yochanan held) stands.',
    );
    const once = hebrewFirst('Rabbi Yochanan and Rabbi Yochanan.', items);
    expect(once).toBe('רבי יוחנן (Rabbi Yochanan) and רבי יוחנן.');
    expect(hebrewFirst(once, items)).toBe(once);
  });

  it('uses the daf rabbi list without nikud', () => {
    expect(rabbiItems([{ name: 'Rava', nameHe: 'רָבָא' }])).toEqual([name('Rava', 'רבא')]);
  });
});

describe('flipQuotes', () => {
  it("puts a quotation's Hebrew inside the quote marks", () => {
    const t = "the baraita's phrase 'from that day onward' (מאותו היום ואילך) shows it.";
    const ps = findHebrewParens(t);
    const d: ParenDecision[] = [{ kind: 'quote', kindP: 0.9, span: null, spanP: 0 }];
    expect(flipQuotes(t, ps, d)).toBe(
      "the baraita's phrase 'מאותו היום ואילך' (from that day onward) shows it.",
    );
  });

  it('leaves non-quotes and unquoted English alone', () => {
    const t = 'the sacred maneh (מנה של קודש) was double.';
    const ps = findHebrewParens(t);
    expect(flipQuotes(t, ps, [{ kind: 'quote', kindP: 0.9, span: null, spanP: 0 }])).toBe(t);
    expect(flipQuotes(t, ps, [{ kind: 'term', kindP: 0.9, span: 'sacred maneh', spanP: 1 }])).toBe(
      t,
    );
  });
});

describe('readDecisions / buildBilingualQuestions', () => {
  it('asks a kind per paren and a span only when there is a choice', () => {
    const t = 'Abaye (אביי) says, via a verbal analogy (גזירה שווה), yes.';
    const ps = findHebrewParens(t);
    const qs = buildBilingualQuestions(t, ps);
    expect(Object.keys(qs).sort()).toEqual(['k0', 'k1', 's1']);
    const d = readDecisions(t, ps, {
      k0: { choice: 'name', probabilities: { name: 0.99, term: 0.01, quote: 0, other: 0 } },
      k1: { choice: 'term', probabilities: { name: 0, term: 0.95, quote: 0, other: 0.05 } },
      s1: { choice: 'w2', probabilities: { w1: 0.1, w2: 0.8, w3: 0.1, w4: 0 } },
    });
    expect(d[0]).toMatchObject({ kind: 'name', span: 'Abaye', spanP: 1 });
    expect(d[1]).toMatchObject({ kind: 'term', span: 'verbal analogy', spanP: 0.8 });
  });
});

describe('pairs and the page glossary', () => {
  const d = (kind: ParenDecision['kind'], span: string, p = 0.9): ParenDecision => ({
    kind,
    kindP: p,
    span,
    spanP: p,
  });

  it('keeps names and terms, drops quotes, lowercase names and names cut too short', () => {
    const t =
      "Kontrokos' (קונטרוקוס) asked; Hyrcanus (רבי אליעזר) too; a lamb (שה) and the verse (לי יהיו).";
    const pairs = pairsFromDecisions(findHebrewParens(t), [
      d('name', "Kontrokos'"),
      d('name', 'Hyrcanus'),
      d('term', 'a lamb'),
      d('quote', 'the verse'),
    ]);
    expect(pairs).toEqual([name('Kontrokos', 'קונטרוקוס'), term('a lamb', 'שה')]);
  });

  it('spreads names from one paragraph, terms only with two words and two paragraphs', () => {
    const k = name('Kontrokos', 'קונטרוקוס');
    const maneh = term('the sacred maneh', 'מנה של קודש');
    const lamb = term('a lamb', 'שה');
    expect(buildGlossary([[k, maneh, lamb]])).toEqual([k]);
    expect(
      buildGlossary([
        [maneh, lamb],
        [term('sacred maneh', 'מנה של קודש'), lamb],
      ]),
    ).toEqual([maneh]);
  });

  it('keeps the majority Hebrew and drops ties', () => {
    const a = name('Kontrokos', 'קונטרוקוס');
    const b = name('Kontrokos', 'קונטרקוס');
    expect(buildGlossary([[a], [a], [b]])).toEqual([a]);
    expect(buildGlossary([[a], [b]])).toEqual([]);
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
