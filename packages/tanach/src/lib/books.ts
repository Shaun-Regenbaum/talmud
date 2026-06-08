/**
 * The Tanach corpus registry — the addressable books of the Hebrew Bible, in
 * Sefaria's English ref names (what `getText('Genesis 1')` expects) plus their
 * Hebrew names. Grouped Torah / Nevi'im / Ketuvim.
 *
 * Chapter COUNTS are intentionally omitted: chapter nav is driven by Sefaria's
 * own `next`/`prev` section refs in the text response, so we never hand-maintain
 * (and risk drifting) per-book chapter totals. This list only needs to name the
 * books for the picker and validate an incoming book param.
 *
 * This is the Tanach analogue of the Talmud app's TRACTATE_OPTIONS. In the
 * shared coordinate model a verse maps as book -> tractate, chapter -> page,
 * verse -> seg, so @corpus/core's coordLabel renders "Genesis 1:3" unchanged.
 */

export type Section = 'Torah' | "Nevi'im" | 'Ketuvim';

export interface TanachBook {
  /** Sefaria English ref name, e.g. "Genesis", "I Samuel". */
  name: string;
  /** Hebrew name, e.g. "בְּרֵאשִׁית". */
  he: string;
  section: Section;
}

export const BOOKS: TanachBook[] = [
  // Torah
  { name: 'Genesis', he: 'בְּרֵאשִׁית', section: 'Torah' },
  { name: 'Exodus', he: 'שְׁמוֹת', section: 'Torah' },
  { name: 'Leviticus', he: 'וַיִּקְרָא', section: 'Torah' },
  { name: 'Numbers', he: 'בְּמִדְבַּר', section: 'Torah' },
  { name: 'Deuteronomy', he: 'דְּבָרִים', section: 'Torah' },
  // Nevi'im
  { name: 'Joshua', he: 'יְהוֹשֻׁעַ', section: "Nevi'im" },
  { name: 'Judges', he: 'שׁוֹפְטִים', section: "Nevi'im" },
  { name: 'I Samuel', he: 'שְׁמוּאֵל א׳', section: "Nevi'im" },
  { name: 'II Samuel', he: 'שְׁמוּאֵל ב׳', section: "Nevi'im" },
  { name: 'I Kings', he: 'מְלָכִים א׳', section: "Nevi'im" },
  { name: 'II Kings', he: 'מְלָכִים ב׳', section: "Nevi'im" },
  { name: 'Isaiah', he: 'יְשַׁעְיָהוּ', section: "Nevi'im" },
  { name: 'Jeremiah', he: 'יִרְמְיָהוּ', section: "Nevi'im" },
  { name: 'Ezekiel', he: 'יְחֶזְקֵאל', section: "Nevi'im" },
  { name: 'Hosea', he: 'הוֹשֵׁעַ', section: "Nevi'im" },
  { name: 'Joel', he: 'יוֹאֵל', section: "Nevi'im" },
  { name: 'Amos', he: 'עָמוֹס', section: "Nevi'im" },
  { name: 'Obadiah', he: 'עֹבַדְיָה', section: "Nevi'im" },
  { name: 'Jonah', he: 'יוֹנָה', section: "Nevi'im" },
  { name: 'Micah', he: 'מִיכָה', section: "Nevi'im" },
  { name: 'Nahum', he: 'נַחוּם', section: "Nevi'im" },
  { name: 'Habakkuk', he: 'חֲבַקּוּק', section: "Nevi'im" },
  { name: 'Zephaniah', he: 'צְפַנְיָה', section: "Nevi'im" },
  { name: 'Haggai', he: 'חַגַּי', section: "Nevi'im" },
  { name: 'Zechariah', he: 'זְכַרְיָה', section: "Nevi'im" },
  { name: 'Malachi', he: 'מַלְאָכִי', section: "Nevi'im" },
  // Ketuvim
  { name: 'Psalms', he: 'תְּהִלִּים', section: 'Ketuvim' },
  { name: 'Proverbs', he: 'מִשְׁלֵי', section: 'Ketuvim' },
  { name: 'Job', he: 'אִיּוֹב', section: 'Ketuvim' },
  { name: 'Song of Songs', he: 'שִׁיר הַשִּׁירִים', section: 'Ketuvim' },
  { name: 'Ruth', he: 'רוּת', section: 'Ketuvim' },
  { name: 'Lamentations', he: 'אֵיכָה', section: 'Ketuvim' },
  { name: 'Ecclesiastes', he: 'קֹהֶלֶת', section: 'Ketuvim' },
  { name: 'Esther', he: 'אֶסְתֵּר', section: 'Ketuvim' },
  { name: 'Daniel', he: 'דָּנִיֵּאל', section: 'Ketuvim' },
  { name: 'Ezra', he: 'עֶזְרָא', section: 'Ketuvim' },
  { name: 'Nehemiah', he: 'נְחֶמְיָה', section: 'Ketuvim' },
  { name: 'I Chronicles', he: 'דִּבְרֵי הַיָּמִים א׳', section: 'Ketuvim' },
  { name: 'II Chronicles', he: 'דִּבְרֵי הַיָּמִים ב׳', section: 'Ketuvim' },
];

const BY_NAME = new Map(BOOKS.map((b) => [b.name, b]));

/** Look up a book by its Sefaria English name. */
export function bookByName(name: string): TanachBook | undefined {
  return BY_NAME.get(name);
}

/** Whether `name` is a valid addressable Tanach book. */
export function isBook(name: string): boolean {
  return BY_NAME.has(name);
}

export const SECTIONS: Section[] = ['Torah', "Nevi'im", 'Ketuvim'];
