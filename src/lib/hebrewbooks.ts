// HebrewBooks scraping service
// Uses Cloudflare Browser Rendering to extract structured data from HebrewBooks.org

export interface HebrewBooksPage {
  tractate: string;
  daf: string;
  amud: string;
  mainText: string;
  rashi?: string;
  tosafot?: string;
  otherCommentaries?: Record<string, string>;
  timestamp: number;
}

export interface HebrewBooksParams {
  mesechta: number; // Tractate ID (e.g., 27 for Berakhot)
  daf: number; // Page number
  format?: 'text' | 'pdf';
}

// Tractate ID mapping
export const TRACTATE_IDS: Record<string, number> = {
  'Berakhot': 1,
  'Shabbat': 2,
  'Eruvin': 3,
  'Pesachim': 4,
  'Shekalim': 5,
  'Yoma': 6,
  'Sukkah': 7,
  'Beitzah': 8,
  'Rosh Hashanah': 9,
  'Taanit': 10,
  'Megillah': 11,
  'Moed Katan': 12,
  'Chagigah': 13,
  'Yevamot': 14,
  'Ketubot': 15,
  'Nedarim': 16,
  'Nazir': 17,
  'Sotah': 18,
  'Gittin': 19,
  'Kiddushin': 20,
  'Bava Kamma': 21,
  'Bava Metzia': 22,
  'Bava Batra': 23,
  'Sanhedrin': 24,
  'Makkot': 25,
  'Shevuot': 26,
  'Avodah Zarah': 27,
  'Horayot': 28,
  'Zevachim': 29,
  'Menachot': 30,
  'Chullin': 31,
  'Bekhorot': 32,
  'Arakhin': 33,
  'Temurah': 34,
  'Keritot': 35,
  'Meilah': 36,
  'Niddah': 37
};

// Note: HebrewBooksService class removed - we now fetch directly from daf-supplier

// Note: HebrewBooksAPI class removed - we now fetch directly from daf-supplier

// Utility function to convert Sefaria format (2a, 2b) to HebrewBooks format (2, 2b)
export function convertDafToHebrewBooksFormat(daf: string): string {
  // HebrewBooks expects daf in format: "2", "2b", "3", "3b" etc.
  // So for "2a" we send "2", for "2b" we send "2b"
  const dafNum = parseInt(daf.replace(/[ab]/, ''));
  const amud = daf.includes('b') ? 'b' : 'a';
  return amud === 'a' ? dafNum.toString() : `${dafNum}b`;
}

// Note: All exports removed - we now fetch directly from daf-supplier