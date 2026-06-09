/**
 * @fileoverview Pure helpers for extracting the dibur ha'maschil — the Gemara
 * lemma a commentary quotes — and leading Hebrew words. Kept out of the client
 * component so they're unit-testable (the DH format has bitten us repeatedly:
 * Rashi/Tosafot use a " - " dash, Rishonim bold the lemma `<b>…</b>`, and some
 * use a sentence period/colon/"כו'").
 */

/** Drop HTML markup (Sefaria text carries <b>/<strong>/<i>/<big>) for display. */
export function stripTags(s: string | undefined): string {
  return s
    ? s
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

/** First `n` whitespace words of a Hebrew string, or undefined. */
export function leadingWords(s: string | undefined, n: number): string | undefined {
  if (!s) return undefined;
  const w = stripTags(s).split(/\s+/).slice(0, n).join(' ');
  return w || undefined;
}

/**
 * The dibur ha'maschil a commentary quotes from the Gemara — its opening Gemara
 * words, separated from the comment body. Sefaria bolds the lemma at the start
 * (`<b>נגר הנגרר נועלין בו במקדש</b> פיר…`); otherwise the lemma ends at the
 * first separator — a dash, sentence period, colon, or "כו'/וכו'"
 * (e.g. `המונח כאן וכאן אסור. פירש רש"י…`).
 */
export function diburHaMaschil(he: string | undefined): string | undefined {
  if (!he) return undefined;
  const bold = /^\s*<(b|strong)>([\s\S]*?)<\/\1>/i.exec(he);
  const lemma = bold
    ? stripTags(bold[2])
    : stripTags(he).split(/\s[-־–—]\s|\.\s|:\s|\s?[וב]?כו['׳]/)[0];
  return leadingWords(lemma, 6);
}
