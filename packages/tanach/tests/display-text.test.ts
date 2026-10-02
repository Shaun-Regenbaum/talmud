import { finishDisplayText } from '@corpus/core/text/displayText';
import { describe, expect, it } from 'vitest';
import { formatGeneratedText, generatedTextFor } from '../src/lib/displayText';

// Name spellings from the existing dictionary; terms from parsha.test.ts.
const terms = [{ he: 'ברכה', en: 'blessing' }];

describe('Tanach generated prose', () => {
  it('uses the same formatter for known names', () => {
    const input = 'Rashi (רש"י); Ramban (רמב"ן)';
    expect(formatGeneratedText(input, 'en')).toBe('רש״י (Rashi); רמב״ן (Ramban)');
    expect(formatGeneratedText(input, 'en')).toBe(finishDisplayText(input));
  });
  it('uses supplied Hebrew terms without guessing at ordinary English words', () => {
    expect(formatGeneratedText('a blessing and a curse', 'en', terms)).toBe(
      'a blessing and a curse',
    );
    expect(formatGeneratedText('ברכה (blessing); ברכה (blessing)', 'en', terms)).toBe(
      'ברכה (blessing); ברכה',
    );
    expect(formatGeneratedText('blessing (ברכה)', 'en', terms)).toBe('ברכה (blessing)');
  });
  it('preserves Hebrew fields and follows the actual fallback language', () => {
    const hebrew = 'וזאת הברכה';
    expect(formatGeneratedText(hebrew, 'he', terms)).toBe(hebrew);
    expect(generatedTextFor('en', '', hebrew, terms)).toBe(hebrew);
    expect(generatedTextFor('he', 'Rashi (רש"י)', '')).toBe('רש״י (Rashi)');
    expect(generatedTextFor('he', 'Rashi', hebrew)).toBe(hebrew);
  });
  it('formats a copied multi-paragraph note with the same first mentions as its display', () => {
    expect(generatedTextFor('en', 'Rashi; Rashi\n\nRashi; Rashi', '')).toBe(
      'רש״י (Rashi); רש״י\n\nרש״י (Rashi); רש״י',
    );
  });
});
