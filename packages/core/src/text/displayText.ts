import { type DisplayItem, hebrewFirst } from './bilingual';
import { capitalizeFirst, DISPLAY_ITEMS, prepareDisplayText, stripEchoParens } from './hebraize';

export interface DisplayTextOptions {
  items?: readonly DisplayItem[];
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
  if (/\n\s*\n/.test(text)) {
    return text
      .split(/(\n\s*\n)/)
      .map((part, i) => (i % 2 ? part : finishDisplayText(part, options)))
      .join('');
  }
  const source = stripEchoParens(prepareDisplayText(text));
  const english = options.english !== false && /[A-Za-z]/.test(source);
  const bilingual = english
    ? hebrewFirst(source, [...(options.items ?? []), ...DISPLAY_ITEMS])
    : source;
  const cleaned = options.cleanGlosses ? options.cleanGlosses(bilingual) : bilingual;
  const plain = plainGeneratedText(cleaned);
  return options.capitalize ? capitalizeFirst(plain) : plain;
}
