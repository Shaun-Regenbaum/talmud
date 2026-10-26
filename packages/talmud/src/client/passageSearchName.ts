/** The name to search the story passages for. Those passages are written in Hebrew, so an
 * English name or a slug can only find nothing. The short form comes first: the texts say
 * "רבי עקיבא", not "רבי עקיבא בן יוסף". */
const HEBREW = /[֐-׿]/;

export function passageSearchName(candidates: (string | null | undefined)[]): string | null {
  for (const name of candidates) {
    const trimmed = name?.trim();
    if (trimmed && HEBREW.test(trimmed)) return trimmed;
  }
  return null;
}
