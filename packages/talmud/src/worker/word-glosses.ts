/**
 * Hardcoded gloss dictionary for high-frequency Talmudic words.
 *
 * Skips the LLM for words whose Talmudic gloss is essentially context-free:
 * Aramaic discourse markers, Mishnaic structural terms, and common Hebrew
 * nouns that small models routinely botch the plural of (e.g. שעות → "watches").
 *
 * Lookup is exact-match on the nikud-stripped, whitespace-collapsed key.
 */

const NIKUD = /[֑-ׇ]/g;

function normalize(word: string): string {
  return word
    .normalize('NFC')
    .replace(NIKUD, '')
    .replace(/[\s ‎‏]+/g, ' ')
    .trim();
}

const GLOSSES: Record<string, string> = {
  // Aramaic / Talmudic discourse markers
  אמר: 'said',
  אמרי: 'they say',
  תניא: 'it was taught (baraita)',
  'תנו רבנן': 'our Rabbis taught',
  'ת"ר': 'our Rabbis taught',
  מתניתין: 'our Mishnah',
  "מתני'": 'our Mishnah',
  גמרא: 'Gemara',
  מאי: 'what',
  'מאי טעמא': 'what is the reason',
  מנא: 'from where',
  מנלן: 'from where do we know',
  אלא: 'rather',
  אבל: 'but',
  אטו: 'is it the case that?',
  אדרבה: 'on the contrary',
  איתמר: 'it was stated',
  'איבעיא להו': 'they raised a dilemma',
  אי: 'if',
  אנא: 'I',
  אנן: 'we',
  הני: 'these',
  הא: 'this',
  ההוא: 'that one',
  בעי: 'asked',
  'קמ"ל': 'it teaches us',
  "וכו'": 'etc.',
  ליה: 'to him',
  לה: 'to her',
  דאמר: 'who said',
  דתנן: 'as we learned (in the Mishnah)',
  דתניא: 'as it was taught (in a baraita)',
  דתני: 'as he taught',
  בשלמא: 'granted',
  מיגו: 'since-they-could-have (legal principle)',
  תיובתא: 'refutation',
  'קל וחומר': 'a fortiori',
  'ק"ו': 'a fortiori',
  'גזירה שווה': 'analogical derivation',
  גברא: 'person (legal)',
  חפצא: 'object (legal)',
  כי: 'when / because',
  היכי: 'how',
  היכא: 'where',
  'היכי דמי': 'what are the circumstances',
  'שמע מינה': 'learn from this',
  'ש"מ': 'learn from this',
  'ת"ש': 'come and hear',
  'תא שמע': 'come and hear',

  // Mishnaic structural / legal terms
  רישא: 'first clause',
  סיפא: 'last clause',
  קמא: 'the first [view]',
  בתרא: 'the later [view]',
  הלכה: 'halakha',
  מצוה: 'mitzvah',
  איסור: 'prohibition',
  מותר: 'permitted',
  אסור: 'forbidden',
  חייב: 'liable',
  פטור: 'exempt',
  כשר: 'valid',
  פסול: 'invalid',
  טהור: 'ritually pure',
  טמא: 'ritually impure',

  // High-frequency Hebrew nouns small models often mis-translate the plural of
  שעה: 'hour',
  שעות: 'hours',
  יום: 'day',
  ימים: 'days',
  לילה: 'night',
  לילות: 'nights',
  שנה: 'year',
  שנים: 'years',
  אדם: 'person',
  'בני אדם': 'people',
  בית: 'house',
  בתים: 'houses',
  איש: 'man',
  אנשים: 'men',
  אשה: 'woman',
  נשים: 'women',
};

const NORMALIZED = new Map<string, string>(
  Object.entries(GLOSSES).map(([k, v]) => [normalize(k), v]),
);

export function lookupGloss(word: string): string | null {
  const key = normalize(word);
  if (!key) return null;
  return NORMALIZED.get(key) ?? null;
}
