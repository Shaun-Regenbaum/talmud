/**
 * <Hebraized text={...}> — drop-in span that hebraizes its text input with
 * the static dict synchronously (instant), then upgrades to an LLM pass for
 * any parens the dict couldn't resolve (~2s, KV-cached forever per text).
 *
 * Use this anywhere LLM-emitted English text contains parenthesized Hebrew /
 * Aramaic transliterations: argument summaries, rabbi roles, halacha
 * descriptions, aggadata summaries, pesuk synthesize. The LLM upgrade is
 * fire-and-forget — render never blocks on it; on completion the text just
 * swaps in place. On any LLM error, the dict-pass result stays.
 */
import { createResource, createMemo, type JSX } from 'solid-js';
import { hebraize, unresolvedParens, hebraizeLLM } from './hebraize';

export function Hebraized(props: { text: string | undefined | null }): JSX.Element {
  const dictPass = createMemo(() => hebraize(props.text ?? ''));
  // Only fire the LLM pass when the dict pass has unresolved parens. The
  // resource source returns null otherwise, which short-circuits the fetch.
  const llmInput = createMemo(() => {
    const t = dictPass();
    return unresolvedParens(t).length > 0 ? t : null;
  });
  const [llmPass] = createResource(llmInput, (t) => hebraizeLLM(t));
  return <>{llmPass() ?? dictPass()}</>;
}
