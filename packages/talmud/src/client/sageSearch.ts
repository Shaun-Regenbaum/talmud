/**
 * Fuzzy sage search over the /api/sages-index rows — shared by SagesPage and
 * the #network ego view. Scores slug + canonical EN/HE + aliases; a Hebrew
 * query scores only against canonicalHe.
 */

export interface IndexRow {
  slug: string;
  canonical: string;
  canonicalHe: string | null;
  aliases: string[];
  generation: string | null;
  region: 'israel' | 'bavel' | null;
}

// Lowercases ASCII and strips common punctuation. Hebrew is preserved as-is.
export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[.,;:'"`()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Returns true if `q` chars appear in order anywhere in `s` (subsequence).
const subseq = (q: string, s: string): boolean => {
  let i = 0;
  for (const ch of s) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return i === q.length;
};

const scoreField = (q: string, field: string): number => {
  if (!field) return 0;
  const f = normalize(field);
  if (!f) return 0;
  if (f === q) return 1000;
  if (f.startsWith(q)) return 600 - Math.min(100, f.length - q.length);
  const idx = f.indexOf(q);
  if (idx >= 0) return 350 - Math.min(100, idx);
  if (q.length >= 3 && subseq(q, f)) return 80;
  return 0;
};

// Hebrew shortcut — no lowercase, just substring/subseq.
const scoreHebrew = (q: string, field: string | null): number => {
  if (!field) return 0;
  if (field === q) return 1000;
  if (field.startsWith(q)) return 600;
  if (field.includes(q)) return 350;
  if (q.length >= 2 && subseq(q, field)) return 80;
  return 0;
};

export const isHebrewQuery = (q: string): boolean => /[֐-׿]/.test(q);

export const scoreRow = (qNorm: string, qHe: string | null, row: IndexRow): number => {
  let best = 0;
  // Hebrew query → only score against canonicalHe.
  if (qHe) {
    best = Math.max(best, scoreHebrew(qHe, row.canonicalHe));
    return best;
  }
  best = Math.max(best, scoreField(qNorm, row.slug.replace(/-/g, ' ')));
  best = Math.max(best, scoreField(qNorm, row.canonical));
  for (const a of row.aliases) best = Math.max(best, scoreField(qNorm, a) - 30); // slight penalty vs canonical
  return best;
};

/** Top-N rows for a raw query, strongest first. */
export function searchSages(rows: readonly IndexRow[], query: string, limit = 12): IndexRow[] {
  const q = query.trim();
  if (!q) return [];
  const qHe = isHebrewQuery(q) ? q : null;
  const qNorm = normalize(q);
  return rows
    .map((row) => ({ row, score: scoreRow(qNorm, qHe, row) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.row);
}
