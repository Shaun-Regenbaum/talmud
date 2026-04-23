/**
 * Align Sefaria-segmented Hebrew against the rendered HebrewBooks daf by
 * walking .daf-word spans and tagging each with `data-seg="<idx>"`.
 *
 * Differences from the naïve first version:
 *   - Uses `normalizeHebrew` from the existing alignment module, which
 *     correctly strips Hebrew gereshim (U+05F3/U+05F4) and normalizes final
 *     letters — two real mismatches the first version missed (e.g. `גמ׳`
 *     vs `גמ'`, `״וּבָא הַשֶּׁמֶשׁ״`).
 *   - Uses `wordsMatchFuzzy` for fuzzy per-word equality (handles minor
 *     orthographic drift between Sefaria and HebrewBooks).
 *   - Pre-strips HTML so `<big><strong>מֵאֵימָתַי</strong></big>` doesn't leak
 *     tag-letter noise into the word stream.
 *   - Expands common Talmudic abbreviations on the HebrewBooks side: `ר' →
 *     רבי` (1→1), `ר"י → רבי יהודה`, `א"ר → אמר רבי`, `ת"ר → תנו רבנן`,
 *     `ת"ש → תא שמע`, `קמ"ל → קא משמע לן`, `אע"פ → אף על פי` (1→N).
 *   - When a segment's opening probe doesn't match at the current scan
 *     position, we scan forward word-by-word to re-sync; the alignment is
 *     tolerant of gaps on either side.
 */

import { normalizeHebrew, wordsMatchFuzzy, extractTalmudContent } from '../lib/sefref/alignment';

export interface SegmentStats {
  totalSegments: number;
  alignedSegments: number;
  totalWords: number;
  alignedWords: number;
}

/**
 * Return N if the HebrewBooks word at position `i` is an abbreviation whose
 * expansion matches the next N words in `sefWords` starting at `sj`.
 * Returns 0 if no abbreviation pattern matches.
 *
 * `hbRaw` should be the RAW HebrewBooks word (pre-normalization) so we can
 * detect the abbreviation punctuation (geresh / gershayim / ASCII quotes).
 */
function abbreviationMatches(hbRaw: string, sefWords: string[], sj: number): number {
  // Strip nikkud/cantillation but KEEP punctuation so we can see the ' / ׳ / " / ״ markers.
  const s = hbRaw.replace(/[֑-ׇ]/g, '').trim();
  const eq = (a: string, b: string): boolean => normalizeHebrew(a) === normalizeHebrew(b);
  const startsWith = (word: string, prefix: string): boolean =>
    normalizeHebrew(word).startsWith(normalizeHebrew(prefix));

  // ר' / ר׳  →  רבי  (1 Sefaria word)
  if (/^ר[׳'׳]$/.test(s)) {
    return sj < sefWords.length && eq(sefWords[sj], 'רבי') ? 1 : 0;
  }

  // ר"X / ר״X  →  רבי X  (2 Sefaria words; X is the next expanded letter/name)
  let m = s.match(/^ר[״"״](.+)$/);
  if (m) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'רבי') && startsWith(sefWords[sj + 1], m[1])) return 2;
    return 0;
  }

  // א"ר  →  אמר רבי
  if (/^א[״"״]ר$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'אמר') && eq(sefWords[sj + 1], 'רבי')) return 2;
    return 0;
  }

  // וא"ר  →  ואמר רבי
  if (/^וא[״"״]ר$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'ואמר') && eq(sefWords[sj + 1], 'רבי')) return 2;
    return 0;
  }

  // ת"ר  →  תנו רבנן
  if (/^ת[״"״]ר$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'תנו') && eq(sefWords[sj + 1], 'רבנן')) return 2;
    return 0;
  }

  // ת"ש  →  תא שמע
  if (/^ת[״"״]ש$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'תא') && eq(sefWords[sj + 1], 'שמע')) return 2;
    return 0;
  }

  // ק"ו  →  קל וחומר
  if (/^ק[״"״]ו$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'קל') && eq(sefWords[sj + 1], 'וחומר')) return 2;
    return 0;
  }

  // ק"ש  →  קריאת שמע
  if (/^ק[״"״]ש$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'קריאת') && eq(sefWords[sj + 1], 'שמע')) return 2;
    return 0;
  }

  // ד"א  →  דבר אחר
  if (/^ד[״"״]א$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'דבר') && eq(sefWords[sj + 1], 'אחר')) return 2;
    return 0;
  }

  // ב"ד  →  בית דין
  if (/^ב[״"״]ד$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'בית') && eq(sefWords[sj + 1], 'דין')) return 2;
    return 0;
  }

  // ב"ה  →  בית הלל  (in context — also "blessed is He" but rare as a standalone word)
  if (/^ב[״"״]ה$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'בית') && eq(sefWords[sj + 1], 'הלל')) return 2;
    return 0;
  }

  // ב"ש  →  בית שמאי
  if (/^ב[״"״]ש$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'בית') && eq(sefWords[sj + 1], 'שמאי')) return 2;
    return 0;
  }

  // מ"מ  →  מכל מקום
  if (/^מ[״"״]מ$/.test(s)) {
    if (sj + 1 < sefWords.length && eq(sefWords[sj], 'מכל') && eq(sefWords[sj + 1], 'מקום')) return 2;
    return 0;
  }

  // קמ"ל  →  קא משמע לן  (3)
  if (/^קמ[״"״]ל$/.test(s)) {
    if (sj + 2 < sefWords.length && eq(sefWords[sj], 'קא') && eq(sefWords[sj + 1], 'משמע') && eq(sefWords[sj + 2], 'לן')) return 3;
    return 0;
  }

  // הקב"ה  →  הקדוש ברוך הוא (3)
  if (/^הקב[״"״]ה$/.test(s)) {
    if (sj + 2 < sefWords.length && eq(sefWords[sj], 'הקדוש') && eq(sefWords[sj + 1], 'ברוך') && eq(sefWords[sj + 2], 'הוא')) return 3;
    return 0;
  }

  // אע"פ  →  אף על פי  (3)
  if (/^אע[״"״]פ$/.test(s)) {
    if (sj + 2 < sefWords.length && eq(sefWords[sj], 'אף') && eq(sefWords[sj + 1], 'על') && eq(sefWords[sj + 2], 'פי')) return 3;
    return 0;
  }

  // ואע"ג  →  ואף על גב  (3)
  if (/^ואע[״"״]ג$/.test(s)) {
    if (sj + 2 < sefWords.length && eq(sefWords[sj], 'ואף') && eq(sefWords[sj + 1], 'על') && eq(sefWords[sj + 2], 'גב')) return 3;
    return 0;
  }

  // רשב"י  →  רבי שמעון בן יוחאי  (4)
  if (/^רשב[״"״]י$/.test(s)) {
    if (sj + 3 < sefWords.length
        && eq(sefWords[sj], 'רבי') && eq(sefWords[sj + 1], 'שמעון')
        && eq(sefWords[sj + 2], 'בן') && eq(sefWords[sj + 3], 'יוחאי')) return 4;
    return 0;
  }

  // רשב"ל  →  רבי שמעון בן לקיש  (4)
  if (/^רשב[״"״]ל$/.test(s)) {
    if (sj + 3 < sefWords.length
        && eq(sefWords[sj], 'רבי') && eq(sefWords[sj + 1], 'שמעון')
        && eq(sefWords[sj + 2], 'בן') && eq(sefWords[sj + 3], 'לקיש')) return 4;
    return 0;
  }

  // גמ׳ / גמ'  →  גמרא (1; Sefaria often wraps this as גְּמָ׳ which normalizes to גמ,
  // but some editions use גמרא in full — match either).
  if (/^גמ[׳'׳]$/.test(s)) {
    if (sj < sefWords.length) {
      const n = normalizeHebrew(sefWords[sj]);
      if (n === 'גמ' || n === 'גמרא') return 1;
    }
    return 0;
  }

  // מתני׳ / מתני'  →  מתניתין (1)
  if (/^מתני[׳'׳]$/.test(s)) {
    if (sj < sefWords.length) {
      const n = normalizeHebrew(sefWords[sj]);
      if (n === 'מתני' || n === 'מתניתין') return 1;
    }
    return 0;
  }

  return 0;
}

/**
 * Does `hbRaw` match `sefWord` directly (fuzzy equality on normalized forms)?
 * This is the base case; `abbreviationMatches` handles 1-to-N expansions.
 */
function singleWordMatch(hbRaw: string, sefWord: string): boolean {
  if (!sefWord) return false;
  const n1 = normalizeHebrew(hbRaw);
  const n2 = normalizeHebrew(sefWord);
  if (!n1 || !n2) return false;
  return wordsMatchFuzzy(n1, n2);
}

export function injectSegmentMarkers(html: string, segmentsHe: string[]): { html: string; stats: SegmentStats } {
  if (!html || typeof document === 'undefined' || segmentsHe.length === 0) {
    return { html, stats: { totalSegments: segmentsHe.length, alignedSegments: 0, totalWords: 0, alignedWords: 0 } };
  }

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length === 0) {
    return { html, stats: { totalSegments: segmentsHe.length, alignedSegments: 0, totalWords: 0, alignedWords: 0 } };
  }

  // Raw text per rendered daf-word (preserves punctuation so abbreviation
  // detection can read the geresh/gershayim).
  const wordRaw = words.map((el) => (el.textContent ?? '').trim());

  // For each Sefaria segment, strip HTML, then split into words. Also keep
  // the empty-after-normalization marker list so we can skip such tokens.
  const segWordLists: string[][] = segmentsHe.map((seg) => {
    const plain = extractTalmudContent(seg);
    return plain.split(/\s+/).filter((w) => !!normalizeHebrew(w));
  });

  let hbPtr = 0;
  let alignedSegments = 0;
  let alignedWords = 0;

  for (let segIdx = 0; segIdx < segWordLists.length; segIdx++) {
    const segWords = segWordLists[segIdx];
    if (segWords.length === 0) continue;

    // Find the segment's start. Scan forward from hbPtr; at each candidate
    // position, try to consume the first 3 Sefaria words (or the whole
    // segment if shorter) using singleWordMatch + abbreviationMatches. If
    // we can, that's the start.
    const needed = Math.min(3, segWords.length);
    let segStart = -1;

    // Scan forward for a starting position where we can consume at least
    // `needed` Sefaria words of this segment in order — via either single-word
    // matches or 1-to-N abbreviation expansions. The counter `sj` measures
    // Sefaria-word progress (not HB iterations), so `א"ר + יצחק` correctly
    // consumes 3 Sefaria words from only 2 HB iterations.
    for (let i = hbPtr; i < words.length; i++) {
      let hb = i;
      let sj = 0;
      while (sj < needed && hb < words.length) {
        const raw = wordRaw[hb];
        if (!normalizeHebrew(raw)) { hb++; continue; }
        const abbrev = abbreviationMatches(raw, segWords, sj);
        if (abbrev > 0) { hb++; sj += abbrev; continue; }
        if (singleWordMatch(raw, segWords[sj])) { hb++; sj++; continue; }
        break;
      }
      if (sj >= needed) { segStart = i; break; }
    }

    if (segStart < 0) continue;

    // Consume the full segment from segStart. Break on first unmatched word.
    let sj = 0;
    let i = segStart;
    while (sj < segWords.length && i < words.length) {
      const raw = wordRaw[i];
      if (!normalizeHebrew(raw)) { i++; continue; }
      const abbrev = abbreviationMatches(raw, segWords, sj);
      if (abbrev > 0) {
        words[i].setAttribute('data-seg', String(segIdx));
        i++;
        sj += abbrev;
        alignedWords++;
        continue;
      }
      if (singleWordMatch(raw, segWords[sj])) {
        words[i].setAttribute('data-seg', String(segIdx));
        i++;
        sj++;
        alignedWords++;
        continue;
      }
      break;
    }

    alignedSegments++;
    hbPtr = i;
  }

  return {
    html: doc.body.innerHTML,
    stats: {
      totalSegments: segmentsHe.length,
      alignedSegments,
      totalWords: words.length,
      alignedWords,
    },
  };
}
