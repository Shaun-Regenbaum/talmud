/**
 * Discriminator vocabularies for language-register classification.
 *
 * Kept narrow on purpose — every token here should be a strong signal for
 * exactly one register, with low false-positive rate. Common verbs that appear
 * in *all three* registers (e.g. אמר, הוה) are excluded.
 *
 * Scoring is `count / segmentTokenCount`, picked-max wins. See heuristic.ts.
 */

import type { GenerationId } from '../../client/generations';

// Mishnaic Hebrew — Tannaitic register. Drives picks in the tanna-* range.
export const MISHNAIC_HEBREW: ReadonlySet<string> = new Set([
  'כיצד', 'כיצדיכן', 'הא', 'הרי', 'שאם', 'שאין', 'שאינו', 'הריני',
  'מנין', 'מנלן',
  'מפני', 'מפניש',
  'דברי', 'הדן',
  'אומר', 'אומרת', 'אומרים',
  'נאמר', 'שנאמר',
  'תלמוד',
  'אלא', 'אבל',
  'חייב', 'חייבת', 'חייבים', 'פטור', 'פטורה', 'פטורים',
  'מותר', 'אסור', 'מצוה', 'הלכה',
  'נדה', 'תרומה', 'מעשר',
]);

// Babylonian Aramaic — Bavli framing voice / Stammaitic.
export const BAVLI_ARAMAIC: ReadonlySet<string> = new Set([
  'איתמר', 'איבעיא',           // איבעיא להו
  'מתקיף', 'מתיב',
  'תנן', 'תנא', 'תניא',         // careful: also tannaitic, but in Bavli framing they introduce
  'גמרא', 'גמ',
  'מאי', 'מאי טעמא', 'טעמא',
  'פשיטא', 'איצטריך', 'אצטריך',
  'דלמא', 'דילמא',
  'איכא', 'ליכא',
  'קאמר', 'קאמרי', 'קמ',         // קמ"ל = קא משמע לן
  'קאי', 'קיימא',
  'אלא', 'אלא אמר',
  'הכי', 'הכא', 'התם', 'הני', 'הא',
  'מילתא', 'מידי',
  'הוה', 'הווה',
  'אביי', 'רבא',                 // names that anchor in Bavel-4 specifically — useful when they appear unattributed
]);

// Galilean Aramaic / Yerushalmi — Amora-EY register.
// (We're a Bavli-only project; this lexicon mostly serves to *demote* an EY
// pick when these tokens are absent.)
export const GALILEAN_ARAMAIC: ReadonlySet<string> = new Set([
  'הוון', 'אתון', 'אתינן', 'בעון', 'דאמרי',
  'מהו', 'דמר',
]);

// Biblical-citation introducers. When these appear, the *quoted* fragment is
// not the segment's voice and should be excluded from register scoring.
export const BIBLICAL_INTRODUCERS: ReadonlySet<string> = new Set([
  'שנאמר', 'שנא', 'שנ',
  'דכתיב', 'כדכתיב', 'כתיב',
  'אמר', 'תלמוד', // need 2-token check: 'אמר קרא', 'תלמוד לומר' — handled in heuristic.ts
]);

export interface RegisterScore {
  era: GenerationId;
  score: number;
  hits: string[];
}

/**
 * Score a tokenized segment against each lexicon.
 * Returns one RegisterScore per band; the heuristic picks the max.
 *
 * Tokens should already be normalized (no nikkud, no punctuation).
 */
export function scoreRegisters(tokens: string[]): RegisterScore[] {
  if (tokens.length === 0) {
    return [
      { era: 'tanna-5', score: 0, hits: [] },
      { era: 'amora-bavel-8', score: 0, hits: [] },
      { era: 'amora-ey-2', score: 0, hits: [] },
    ];
  }
  const denom = tokens.length;
  const mishnaicHits: string[] = [];
  const bavliHits: string[] = [];
  const galileanHits: string[] = [];
  for (const tok of tokens) {
    if (MISHNAIC_HEBREW.has(tok)) mishnaicHits.push(tok);
    if (BAVLI_ARAMAIC.has(tok)) bavliHits.push(tok);
    if (GALILEAN_ARAMAIC.has(tok)) galileanHits.push(tok);
  }
  return [
    { era: 'tanna-5', score: mishnaicHits.length / denom, hits: mishnaicHits },
    { era: 'amora-bavel-8', score: bavliHits.length / denom, hits: bavliHits },
    { era: 'amora-ey-2', score: galileanHits.length / denom, hits: galileanHits },
  ];
}
