/**
 * Word lens: underline rare words in a verse and say how rare they are.
 *
 * The concordance is built offline by scripts/build-words.mjs from the Open
 * Scriptures Hebrew Bible. Each book file lists, per verse, the words whose
 * dictionary form is rare: [letters, which occurrence in the verse, lemma key,
 * uses in this exact spelling]. We find those words in the verse text by their
 * letters, not by position, so a spelling or maqaf difference between the two
 * texts can only drop an underline, never put one on the wrong word.
 */

/** [letters, nth occurrence of those letters in the verse, lemma key, uses of this spelling] */
export type WordMark = [string, number, string, number];

export interface BookWords {
  book: string;
  words: Record<string, WordMark[]>;
}

export interface Lemma {
  /** Hebrew dictionary form, with vowels. */
  h: string;
  /** Short English meaning. */
  g: string;
  /** Uses in the whole Tanach. */
  c: number;
  /** Every place it appears, as "Genesis 27:36". */
  o: string[];
}

export type LemmaIndex = Record<string, Lemma>;

/** Letters only: drops vowels, cantillation marks and maqaf. */
export function consonants(s: string): string {
  return s.replace(/[֑-ׇ־]/g, '').replace(/[^א-ת]/g, '');
}

/** How rare a word is, in words a reader would use. */
export function rarityLabel(count: number): string {
  if (count <= 1) return 'once';
  if (count === 2) return 'twice';
  return `${count} times`;
}

/** Splits verse text into words and the gaps (spaces, maqaf) between them. */
const WORD_SPLIT = /([\s־]+)/;

/**
 * Wrap each marked word in a verse's HTML in a span the reader can tap.
 * Only text outside tags is touched. Returns the HTML unchanged when there
 * are no marks.
 */
export function markVerseHtml(html: string, marks: WordMark[] | undefined): string {
  if (!marks || marks.length === 0) return html;
  const want = new Map<string, string>();
  for (const [cons, k, lemma] of marks) want.set(`${cons}#${k}`, lemma);
  const seen = new Map<string, number>();
  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith('<')) return part;
      return part
        .split(WORD_SPLIT)
        .map((tok, i) => {
          if (i % 2 === 1 || !tok) return tok;
          const cons = consonants(tok);
          if (!cons) return tok;
          const k = (seen.get(cons) ?? 0) + 1;
          seen.set(cons, k);
          const lemma = want.get(`${cons}#${k}`);
          if (!lemma) return tok;
          return `<span class="rw" data-lemma="${lemma}" data-w="${cons}" data-k="${k}">${tok}</span>`;
        })
        .join('');
    })
    .join('');
}

/** Marks for one verse out of a book file. */
export function marksForVerse(
  words: BookWords | null | undefined,
  chapter: number,
  verse: number,
): WordMark[] | undefined {
  return words?.words[`${chapter}:${verse}`];
}

/** The places a word appears, one entry per verse, in book order as stored. */
export function uniquePlaces(places: string[]): string[] {
  return [...new Set(places)];
}
