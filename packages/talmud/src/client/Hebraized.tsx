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
import { createMemo, For, type JSX } from 'solid-js';
import { useDisplayText } from './displayText';

// A maximal run of Hebrew/Aramaic — letters plus internal spaces, geresh/
// gershayim, maqaf — starting and ending on a Hebrew character. We isolate each
// such run in a <bdi> so the surrounding English punctuation (quotes, parens,
// commas) keeps its correct left-to-right position instead of being reordered
// by the bidi algorithm into a scrambled mix.
// Explicit ranges (not literal chars — a composed char like יִ would silently
// blow the range open). Geresh/gershayim (׳/״) and maqaf (־) stay
// inside a run (Hebrew abbreviations/compounds).
//
// ASCII straight quotes (' ") are ALSO kept inside a run when they sit BETWEEN
// Hebrew letters: the LLM routinely writes Hebrew abbreviations with ASCII
// gershayim/geresh instead of the Hebrew glyphs (\u05D1\u05E7"\u05E9 for \u05D1\u05E7\u05F4\u05E9, \u05E8' for \u05E8\u05F3), and
// quotes a multi-word Aramaic citation. If those internal quotes split the run,
// each fragment becomes its own <bdi> with a stray LTR quote between them, and
// the bidi algorithm scrambles the visual order (observed: a Ritva citation
// rendering as `'\u05D1\u05E7` \u2026 `),` mid-sentence). They live in the CONNECTOR class
// only, never the boundary classes, so a run still has to END on a Hebrew
// letter / geresh / gershayim \u2014 a trailing/closing quote and an English `'s`
// after a Hebrew word both stay OUT, keeping their English position.
const HE_RUN =
  /([\u0590-\u05FF\uFB1D-\uFB4F](?:[\u0590-\u05FF\uFB1D-\uFB4F\u05BE\u05F3\u05F4'" -]*[\u0590-\u05FF\uFB1D-\uFB4F\u05F3\u05F4])?)/g;
const isHe = (s: string): boolean => /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(s);

/** Split mixed Hebrew/English text into alternating runs, flagging which are
 *  Hebrew/Aramaic. Each Hebrew run gets bidi-isolated by the caller. Pure +
 *  exported so the run boundaries (the part that scrambles when wrong) are
 *  unit-testable without rendering. */
export function bidiSegments(text: string): { text: string; he: boolean }[] {
  // String.split with a capturing group alternates non-match / match.
  return text
    .split(HE_RUN)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, he: isHe(part) }));
}

/** Render mixed Hebrew/English text with each Hebrew run bidi-isolated, so the
 *  surrounding English punctuation doesn't get reordered into a scramble. */
export function BidiText(props: { text: string }): JSX.Element {
  const parts = createMemo(() => bidiSegments(props.text));
  return <For each={parts()}>{(part) => (part.he ? <bdi>{part.text}</bdi> : part.text)}</For>;
}

export function Hebraized(props: {
  text: string | undefined | null;
  capitalize?: boolean;
}): JSX.Element {
  const out = useDisplayText(
    () => props.text ?? '',
    () => ({ capitalize: props.capitalize }),
  );
  return <BidiText text={out()} />;
}
