import { createMemo, createResource } from 'solid-js';
import { type BilingualItem, hebrewFirst } from '../lib/bilingual';
import {
  capitalizeFirst,
  hasEmptyParens,
  hebraize,
  hebraizeLLM,
  stripEchoParens,
  unresolvedParens,
} from './hebraize';

interface DisplayTextOptions {
  items?: readonly BilingualItem[];
  cleanGlosses?: (text: string) => string;
  capitalize?: boolean;
}

/** Keep generated punctuation consistent without changing saved text. */
export function plainGeneratedText(text: string): string {
  return text.replace(/(\d+[ab]?)\s*—\s*(\d+[ab]?)/gi, '$1 to $2').replace(/\s*—\s*/g, ', ');
}

/** Finish an entire paragraph before names and terms are split into links. */
export function finishDisplayText(text: string, options: DisplayTextOptions = {}): string {
  const source = stripEchoParens(text);
  const bilingual = options.items?.length ? hebrewFirst(source, options.items) : source;
  const noEcho = stripEchoParens(bilingual);
  const cleaned = options.cleanGlosses ? options.cleanGlosses(noEcho) : noEcho;
  const plain = plainGeneratedText(cleaned);
  return options.capitalize ? capitalizeFirst(plain) : plain;
}

/** Apply the dictionary immediately, then finish the same whole paragraph
 * again if the cached Hebrew conversion arrives. Link renderers only display. */
export function useDisplayText(
  source: () => string,
  options: () => DisplayTextOptions = () => ({}),
): () => string {
  const dict = createMemo(() => hebraize(source()));
  const unresolved = createMemo(() => (unresolvedParens(dict()).length ? dict() : null));
  const [converted] = createResource(unresolved, async (input) => ({
    input,
    text: await hebraizeLLM(input),
  }));
  return createMemo(() => {
    const current = dict();
    const answer = converted();
    const candidate = answer?.input === current ? answer.text : current;
    const valid = hasEmptyParens(candidate) && !hasEmptyParens(current) ? current : candidate;
    return finishDisplayText(valid, options());
  });
}
