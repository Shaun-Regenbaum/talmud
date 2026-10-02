import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finishDisplayText, plainGeneratedText } from '../src/client/displayText';
import { DISPLAY_ITEMS, prepareDisplayText } from '../src/client/hebraize';

describe('finishDisplayText', () => {
  it('cleans repeated Hebrew before adding the first English name gloss', () => {
    expect(
      finishDisplayText('רבי שמעון (רבי שמעון) agrees.', {
        items: [{ en: 'Rabbi Shimon', he: 'רבי שמעון', kind: 'name' }],
      }),
    ).toBe('רבי שמעון (Rabbi Shimon) agrees.');
  });

  it('keeps a Hebrew clarification that adds words', () => {
    expect(finishDisplayText('מלא צואר (מלא צואר וחוץ לצואר)')).toBe(
      'מלא צואר (מלא צואר וחוץ לצואר)',
    );
  });

  it('drops the alternate spelling repeated after neck breaking', () => {
    expect(finishDisplayText('after עריפה (עורפה), benefit is forbidden.')).toBe(
      'after עריפה, benefit is forbidden.',
    );
  });

  it('removes em dashes from generated prose', () => {
    expect(plainGeneratedText('Shemot 13:13 — the firstborn donkey — supports the rule.')).toBe(
      'Shemot 13:13, the firstborn donkey, supports the rule.',
    );
  });

  it('keeps number and daf ranges readable', () => {
    expect(plainGeneratedText('chapters 3—5 and Bekhorot 10a—11b')).toBe(
      'chapters 3 to 5 and Bekhorot 10a to 11b',
    );
  });
});

// The reported sentence, with spelling/order variants of its Rashi mention.
const reported =
  'The mishna\'s inference that only redeemed animals are exempt from the firstborn and gifts leads רש״י (רש"י) to explain';

describe('one paragraph formatter', () => {
  it.each(['Rashi', 'Rashi (רש"י)', 'Rashi (רש״י)', 'רש"י (Rashi)', 'רש״י (רש"י)', 'רש״י (רש”י)'])(
    'repairs the reported sentence with %s',
    (mention) => {
      const input = reported.replace('רש״י (רש"י)', mention);
      const out = finishDisplayText(input);
      expect(out).toBe(
        reported.replace('רש״י (רש"י)', mention === 'רש"י (Rashi)' ? mention : 'רש״י (Rashi)'),
      );
      expect(finishDisplayText(out)).toBe(out);
    },
  );

  for (const { en, he } of DISPLAY_ITEMS) {
    it(`keeps the English once for the existing dictionary entry ${en}`, () => {
      const out = finishDisplayText(`${en}; ${en}`);
      expect(out).toBe(`${he} (${en}); ${he}`);
      expect(finishDisplayText(out)).toBe(out);
      expect(finishDisplayText(`${en} (${he.replace(/״/g, '"')})`)).toBe(`${he} (${en})`);
      expect(finishDisplayText(`${he} (${en})`)).toBe(`${he} (${en})`);
    });
  }

  it('counts aliases as one name', () => {
    expect(finishDisplayText('Tosafot; Tosfos')).toBe('תוספות (Tosafot); תוספות');
    expect(finishDisplayText('Tosfos; Tosafot')).toBe('תוספות (Tosfos); תוספות');
  });

  it('removes only repeated matching English glosses', () => {
    expect(finishDisplayText('רש״י (Rashi); רש"י (Rashi)')).toBe('רש״י (Rashi); רש״י');
    expect(finishDisplayText('רש״י (Rashi); רש"י (a commentary)')).toBe(
      'רש״י (Rashi); רש"י (a commentary)',
    );
  });

  it('protects an English gloss that is also a dictionary spelling', () => {
    const input = 'the מצוה (mitzvah) of the priest'; // Existing dictionary regression.
    expect(prepareDisplayText(input)).toBe(input);
    expect(finishDisplayText(input)).toBe(input);
  });

  it('keeps the supplied meaning of a transliterated term', () => {
    expect(finishDisplayText('kushya (a difficulty raised) is resolved')).toBe(
      'קושיא (a difficulty raised) is resolved',
    );
    expect(finishDisplayText('muktzeh (set aside) may not be handled', { capitalize: true })).toBe(
      'מוקצה (set aside) may not be handled',
    );
  });

  it('preserves references and complete work titles', () => {
    expect(finishDisplayText('Mishneh Torah (Hilchot Shabbat 8:1)')).toBe(
      'משנה תורה (Mishneh Torah) (Hilchot Shabbat 8:1)',
    );
    expect(finishDisplayText('Tosafot HaRosh; Tosafot')).toBe(
      'תוספות הרא״ש (Tosafot HaRosh); תוספות (Tosafot)',
    );
    expect(finishDisplayText('Rosh Hashanah; Rosh Chodesh')).toBe('Rosh Hashanah; Rosh Chodesh');
  });

  it('does not add English to Hebrew-mode prose', () => {
    expect(finishDisplayText('רש״י', { english: false })).toBe('רש״י');
    expect(finishDisplayText('רש״י')).toBe('רש״י');
  });

  it('applies new page pairs to the source without losing the fixed name gloss', () => {
    const input = reported.replace('רש״י (רש"י)', 'Rashi (רש"י)');
    const before = finishDisplayText(input);
    expect(finishDisplayText(input, { items: [{ en: 'Rashi', he: 'רש״י', kind: 'name' }] })).toBe(
      before,
    );
  });
});

it('preserves English after Hebrew vowel marks', () => {
  // Same dictionary regression with Hebrew vowel marks retained.
  const input = 'the מִצְוָהּ (mitzvah) of the priest';
  expect(finishDisplayText(input)).toBe(input);
});

it('preserves possession when removing a repeated name gloss', () => {
  expect(finishDisplayText("Rashi; רש״י (Rashi's) position")).toBe("רש״י (Rashi); רש״י's position");
});

it('matches the longest supplied term alias before a shorter one', () => {
  const items = [
    { en: 'analogy', he: 'גזירה שווה', kind: 'term' as const },
    { en: 'verbal analogy', he: 'גזירה שווה', kind: 'term' as const },
  ];
  expect(finishDisplayText('verbal analogy', { items })).toBe('גזירה שווה (verbal analogy)');
});

it('keeps paragraph rewrites in the formatter, outside link renderers', () => {
  const root = new URL('../src/client/', import.meta.url);
  for (const file of readdirSync(root, { recursive: true })) {
    if (typeof file !== 'string' || !/\.tsx?$/.test(file)) continue;
    if (file === 'displayText.ts' || file === 'hebraize.ts') continue;
    const source = readFileSync(join(root.pathname, file), 'utf8');
    expect(source, file).not.toMatch(
      /\b(?:hebrewFirst|prepareDisplayText|stripEchoParens|hebraizeBareNames)\s*\(/,
    );
    expect(source, file).not.toContain('/api/hebraize');
  }
});

it('resolves overlaps by the phrase found, across different Hebrew terms', () => {
  const items = [
    { en: 'ritual slaughter', he: 'שחיטה', kind: 'term' as const },
    { en: 'slaughter', he: 'שחיטה', kind: 'term' as const },
    { en: 'slaughter knife', he: 'סכין שחיטה', kind: 'term' as const },
  ];
  expect(finishDisplayText('slaughter knife', { items })).toBe('סכין שחיטה (slaughter knife)');
});

it('keeps Hebrew-first possessives together', () => {
  expect(finishDisplayText("רש״י's position")).toBe("רש״י (Rashi's) position");
  const input = 'מצוה’s (mitzvah) requirement';
  expect(finishDisplayText(input)).toBe(input);
});
