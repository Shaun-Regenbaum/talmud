/**
 * Shared daf-text preamble — the shared-prefix backbone of provider-side
 * prompt caching.
 *
 * Every producer that works on a daf used to inline the daf text (Hebrew +
 * English, ~8-15k tokens) somewhere in the MIDDLE of its own prompt, behind
 * producer-specific framing — so across the ~40-120 LLM calls of a cold daf
 * the byte-shared prefix was zero and provider prefix caching (first-party
 * DeepSeek: cache reads at ~1% of the input price) never engaged.
 *
 * This module restructures every daf-bound request as:
 *
 *   [ DAF CONTEXT preamble — byte-identical for a given daf across ALL
 *     producers and BOTH languages ]  +  [ producer instructions ]  +
 *   [ per-call content, most-shared first ]
 *
 * so call 2..N of a warm burst reads the daf at the cache-hit price.
 *
 * Byte-identity is BY CONSTRUCTION: the preamble is built here, from the
 * canonical segment arrays only, with fixed formatting — producers never
 * render their own copy (one byte of drift = a cold prefix; same failure
 * class as the cache-key slug lesson). The daf-text template variables are
 * then "pointerized" so the text is not paid for twice in one prompt.
 * Segment numbering is [0]-based, matching the app renderers' `[i] seg`
 * convention, so producer prompts that reference segment numbers stay valid.
 *
 * Producers whose vars carry no segment arrays (daf-agnostic work: rabbi
 * biography leaves, translate/hebraize utilities) get no preamble — the
 * builder returns null and their prompts are untouched.
 */

/** Template vars that carry (a rendering of) the daf text. */
export const DAF_TEXT_VAR_KEYS = [
  'gemara',
  'gemara_he',
  'gemara_en',
  'hebrew',
  'english',
  'segments_he',
  'segments_en',
] as const;

/** What a pointerized daf-text var renders as inside a producer template. */
export const DAF_TEXT_POINTER =
  '(the full daf text is in the DAF CONTEXT block at the top of this prompt)';

function numbered(segs: string[]): string {
  return segs.map((s, i) => `[${i}] ${s}`).join('\n');
}

/**
 * Build the canonical bilingual daf-context block, or null when the vars
 * carry no Hebrew segment array (daf-agnostic producers, non-daf spines).
 * Depends ONLY on tractate/page + the segment arrays — never on producer,
 * language, or call shape — so it is byte-identical wherever it appears.
 */
export function buildDafPreamble(vars: Record<string, unknown>): string | null {
  const he = vars.segments_he;
  if (!Array.isArray(he) || he.length === 0) return null;
  const en = vars.segments_en;
  const tractate = typeof vars.tractate === 'string' ? vars.tractate : '';
  const page = typeof vars.page === 'string' ? vars.page : '';
  const enBlock =
    Array.isArray(en) && en.length > 0
      ? `\n\n=== ENGLISH SEGMENTS ===\n${numbered(en as string[])}`
      : '';
  return (
    `=== DAF CONTEXT: ${tractate} ${page} ===\n` +
    'The canonical text of this daf follows. The task below refers to it; ' +
    'segment numbers [n] refer to these lines.\n\n' +
    `=== HEBREW SEGMENTS ===\n${numbered(he as string[])}${enBlock}`
  );
}

/**
 * Shallow-copy `vars` with every daf-text var replaced by a short pointer,
 * so templates keep their structure without re-paying for the text the
 * preamble already carries. `keepInline` exempts vars whose value is
 * per-call (e.g. a fan-out's narrowed section slice — that IS the
 * instance-specific content and must stay in the tail).
 */
export function pointerizeDafVars(
  vars: Record<string, unknown>,
  keepInline: readonly string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...vars };
  for (const k of DAF_TEXT_VAR_KEYS) {
    if (keepInline.includes(k)) continue;
    if (out[k] !== undefined) out[k] = DAF_TEXT_POINTER;
  }
  return out;
}

/**
 * Prepend the preamble as its OWN leading system message. Measured on
 * first-party DeepSeek: a byte-identical complete leading message reliably
 * prefix-caches across different producers (96% of prompt tokens at the
 * cache-read price), while the same bytes merged into one system message
 * that diverges later in the SAME message did not. Downstream, the
 * schema-inlining transform appends to the LAST system message, so the
 * preamble message is never perturbed.
 */
export function prependPreamble<M extends { role: string; content: string }>(
  preamble: string | null | undefined,
  messages: M[],
): M[] {
  if (!preamble) return messages;
  return [{ role: 'system', content: preamble } as M, ...messages];
}
