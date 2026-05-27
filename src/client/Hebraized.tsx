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
import { hebraize, unresolvedParens, hebraizeLLM, capitalizeFirst, stripEchoParens } from './hebraize';

export function Hebraized(props: { text: string | undefined | null; capitalize?: boolean }): JSX.Element {
  const dictPass = createMemo(() => hebraize(props.text ?? ''));
  // Only fire the LLM pass when the dict pass has unresolved parens. The
  // resource source returns null otherwise, which short-circuits the fetch.
  const llmInput = createMemo(() => {
    const t = dictPass();
    return unresolvedParens(t).length > 0 ? t : null;
  });
  const [llmPass] = createResource(llmInput, (t) => hebraizeLLM(t));
  // Capitalize AFTER both passes — the inverted pass can move an English gloss
  // to the front, so capitalizing earlier would strand a lowercase word.
  const out = createMemo(() => {
    // The LLM pass output is otherwise used raw — unlike dictPass(), which
    // ends with stripEchoParens. A model can over-translate a Form B gloss
    // into an echo (`מעשה (מעשה)`), and stale KV entries from the old model
    // may still carry one, so collapse echoes here too. dictPass() is already
    // echo-clean, so the guard only matters on the LLM branch.
    const llm = llmPass();
    const s = llm != null ? stripEchoParens(llm) : dictPass();
    return props.capitalize ? capitalizeFirst(s) : s;
  });
  return <>{out()}</>;
}
