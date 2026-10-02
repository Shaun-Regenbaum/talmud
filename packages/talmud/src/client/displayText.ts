import { createMemo } from 'solid-js';
import { type BilingualItem, hebrewFirst } from '../lib/bilingual';
import { useBilingual } from './bilingual';
import { capitalizeFirst, DISPLAY_ITEMS, prepareDisplayText, stripEchoParens } from './hebraize';
import { lang } from './i18n';

interface DisplayTextOptions {
  items?: readonly BilingualItem[];
  cleanGlosses?: (text: string) => string;
  capitalize?: boolean;
  english?: boolean;
}

/** Keep generated punctuation consistent without changing saved text. */
export function plainGeneratedText(text: string): string {
  return text.replace(/(\d+[ab]?)\s*—\s*(\d+[ab]?)/gi, '$1 to $2').replace(/\s*—\s*/g, ', ');
}

/** The only paragraph formatter. Dictionary lookup preserves existing glosses;
 * one Hebrew-first rewrite owns names, terms, aliases and first mentions.
 * Always start from source text when new pairs arrive, never from rendered text. */
export function finishDisplayText(text: string, options: DisplayTextOptions = {}): string {
  const source = stripEchoParens(prepareDisplayText(text));
  const english = options.english !== false && /[A-Za-z]/.test(source);
  const bilingual = english
    ? hebrewFirst(source, [...(options.items ?? []), ...DISPLAY_ITEMS])
    : source;
  const cleaned = options.cleanGlosses ? options.cleanGlosses(bilingual) : bilingual;
  const plain = plainGeneratedText(cleaned);
  return options.capitalize ? capitalizeFirst(plain) : plain;
}

/** Both plain and linked prose use the same input, pair discovery and formatter.
 * Unknown spellings remain readable. A second whole-paragraph rewrite cannot
 * remove English glosses after the formatter has supplied them. */
export function useDisplayText(
  source: () => string,
  options: () => DisplayTextOptions = () => ({}),
): () => string {
  const prepared = createMemo(() => prepareDisplayText(source()));
  const judged = useBilingual(prepared);
  return createMemo(() => {
    const settings = options();
    return finishDisplayText(judged().text, {
      ...settings,
      english: settings.english ?? lang() === 'en',
      items: [...judged().pairs, ...(settings.items ?? [])],
    });
  });
}
