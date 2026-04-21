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