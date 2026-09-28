import { describe, expect, it } from 'vitest';
import { finishDisplayText, plainGeneratedText } from '../src/client/displayText';

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
