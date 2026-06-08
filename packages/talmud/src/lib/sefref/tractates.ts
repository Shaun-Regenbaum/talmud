/**
 * @fileoverview Tractate Constants
 * 
 * Defines the list of Talmud tractates with their names in English and Hebrew
 */

export interface TractateOption {
	value: string;
	label: string;
	id: number;
}

/**
 * List of all Talmud tractates with their English names, Hebrew names, and IDs
 */
export const TRACTATE_OPTIONS: TractateOption[] = [
	{ value: 'Berakhot', label: 'ברכות', id: 1 },
	{ value: 'Shabbat', label: 'שבת', id: 2 },
	{ value: 'Eruvin', label: 'עירובין', id: 3 },
	{ value: 'Pesachim', label: 'פסחים', id: 4 },
	{ value: 'Shekalim', label: 'שקלים', id: 5 },
	{ value: 'Yoma', label: 'יומא', id: 6 },
	{ value: 'Sukkah', label: 'סוכה', id: 7 },
	{ value: 'Beitzah', label: 'ביצה', id: 8 },
	{ value: 'Rosh Hashanah', label: 'ראש השנה', id: 9 },
	{ value: 'Taanit', label: 'תענית', id: 10 },
	{ value: 'Megillah', label: 'מגילה', id: 11 },
	{ value: 'Moed Katan', label: 'מועד קטן', id: 12 },
	{ value: 'Chagigah', label: 'חגיגה', id: 13 },
	{ value: 'Yevamot', label: 'יבמות', id: 14 },
	{ value: 'Ketubot', label: 'כתובות', id: 15 },
	{ value: 'Nedarim', label: 'נדרים', id: 16 },
	{ value: 'Nazir', label: 'נזיר', id: 17 },
	{ value: 'Sotah', label: 'סוטה', id: 18 },
	{ value: 'Gittin', label: 'גיטין', id: 19 },
	{ value: 'Kiddushin', label: 'קידושין', id: 20 },
	{ value: 'Bava Kamma', label: 'בבא קמא', id: 21 },
	{ value: 'Bava Metzia', label: 'בבא מציעא', id: 22 },
	{ value: 'Bava Batra', label: 'בבא בתרא', id: 23 },
	{ value: 'Sanhedrin', label: 'סנהדרין', id: 24 },
	{ value: 'Makkot', label: 'מכות', id: 25 },
	{ value: 'Shevuot', label: 'שבועות', id: 26 },
	{ value: 'Avodah Zarah', label: 'עבודה זרה', id: 27 },
	{ value: 'Horayot', label: 'הוריות', id: 28 },
	{ value: 'Zevachim', label: 'זבחים', id: 29 },
	{ value: 'Menachot', label: 'מנחות', id: 30 },
	{ value: 'Chullin', label: 'חולין', id: 31 },
	{ value: 'Bekhorot', label: 'בכורות', id: 32 },
	{ value: 'Arakhin', label: 'ערכין', id: 33 },
	{ value: 'Temurah', label: 'תמורה', id: 34 },
	{ value: 'Keritot', label: 'כריתות', id: 35 },
	{ value: 'Meilah', label: 'מעילה', id: 36 },
	{ value: 'Niddah', label: 'נידה', id: 37 }
];

/**
 * Hebrew number mapping for page numbers
 */
export const HEBREW_NUMBERS: Record<number, string> = {
	1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט', 10: 'י',
	11: 'יא', 12: 'יב', 13: 'יג', 14: 'יד', 15: 'טו', 16: 'טז', 17: 'יז', 18: 'יח', 19: 'יט', 20: 'כ',
	21: 'כא', 22: 'כב', 23: 'כג', 24: 'כד', 25: 'כה', 26: 'כו', 27: 'כז', 28: 'כח', 29: 'כט', 30: 'ל',
	31: 'לא', 32: 'לב', 33: 'לג', 34: 'לד', 35: 'לה', 36: 'לו', 37: 'לז', 38: 'לח', 39: 'לט', 40: 'מ',
	41: 'מא', 42: 'מב', 43: 'מג', 44: 'מד', 45: 'מה', 46: 'מו', 47: 'מז', 48: 'מח', 49: 'מט', 50: 'נ',
	51: 'נא', 52: 'נב', 53: 'נג', 54: 'נד', 55: 'נה', 56: 'נו', 57: 'נז', 58: 'נח', 59: 'נט', 60: 'ס',
	61: 'סא', 62: 'סב', 63: 'סג', 64: 'סד', 65: 'סה', 66: 'סו', 67: 'סז', 68: 'סח', 69: 'סט', 70: 'ע',
	71: 'עא', 72: 'עב', 73: 'עג', 74: 'עד', 75: 'עה', 76: 'עו'
};

/**
 * Generate Hebrew page number from numeric value
 */
export function getHebrewPageNumber(num: number): string {
	return HEBREW_NUMBERS[num] || num.toString();
}

/**
 * Convert a positive integer to its Hebrew-numeral (gematria) form, e.g.
 * 2 -> 'ב', 15 -> 'טו', 127 -> 'קכז'. Covers the full daf range of Shas (the
 * HEBREW_NUMBERS table above stops at 76, which leaves Latin digits leaking
 * onto deeper dafim). 15 and 16 use טו/טז to avoid spelling the divine name.
 * Non-positive / non-finite input falls back to the decimal string.
 */
export function toHebrewNumeral(num: number): string {
	if (!Number.isInteger(num) || num <= 0) return String(num);
	const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];
	const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
	const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
	let out = '';
	let n = num;
	// Hundreds beyond 400 stack ת's (e.g. 500 = תק), matching the gematria
	// convention; daf numbers never reach this, but it keeps the fn total.
	while (n >= 400) { out += 'ת'; n -= 400; }
	out += HUNDREDS[Math.floor(n / 100)];
	n %= 100;
	if (n === 15) return out + 'טו';
	if (n === 16) return out + 'טז';
	out += TENS[Math.floor(n / 10)];
	out += ONES[n % 10];
	return out;
}

/** English-slug -> Hebrew-label lookup, built once from TRACTATE_OPTIONS. */
const HE_LABEL_BY_VALUE = new Map(TRACTATE_OPTIONS.map((o) => [o.value, o.label]));

/**
 * Hebrew name for a tractate's English slug (e.g. 'Berakhot' -> 'ברכות').
 * Falls back to the input unchanged when the slug is unknown, so a caller
 * never renders a blank tractate.
 */
export function tractateLabelHe(value: string): string {
	return HE_LABEL_BY_VALUE.get(value) ?? value;
}

/**
 * Hebrew daf form for an 'Na' / 'Nb' page string: '2a' -> 'ב.', '2b' -> 'ב:'
 * — the standard amud-alef '.' / amud-bet ':' citation marks. Anything that
 * doesn't match the page pattern is returned unchanged.
 */
export function pageLabelHe(page: string): string {
	const m = /^(\d+)([ab])$/.exec(page.trim());
	if (!m) return page;
	return `${toHebrewNumeral(parseInt(m[1], 10))}${m[2] === 'a' ? '.' : ':'}`;
}

/**
 * Full Hebrew daf reference, e.g. dafRefHe('Berakhot', '2b') -> 'ברכות ב:'.
 * Used wherever the UI shows a tractate+page label in Hebrew mode (the English
 * slug would otherwise leak as transliterated Latin, e.g. "BERAKHOT 2B").
 */
export function dafRefHe(tractate: string, page: string): string {
	return `${tractateLabelHe(tractate)} ${pageLabelHe(page)}`;
}