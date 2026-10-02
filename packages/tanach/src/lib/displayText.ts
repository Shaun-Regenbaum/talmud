import { finishDisplayText } from '@corpus/core/text/displayText';
import { type ParshaTerm, sanitizeParshaTerms } from './parsha';

/** Format generated English only. Hebrew fields and original sources stay verbatim. */
export function formatGeneratedText(
  text: string,
  language: 'en' | 'he',
  terms: readonly ParshaTerm[] = [],
): string {
  if (language === 'he') return text;
  return finishDisplayText(text, {
    items: sanitizeParshaTerms(terms).map(({ en, he }) => ({
      en,
      he,
      kind: 'term',
      requireGloss: true,
    })),
  });
}

/** Formatting follows the field actually shown, including fallbacks. */
export function generatedTextFor(
  language: 'en' | 'he',
  en: string,
  he: string,
  terms: readonly ParshaTerm[] = [],
): string {
  const shown = language === 'he' ? (he ? 'he' : 'en') : en ? 'en' : 'he';
  return formatGeneratedText(shown === 'he' ? he : en, shown, terms);
}
