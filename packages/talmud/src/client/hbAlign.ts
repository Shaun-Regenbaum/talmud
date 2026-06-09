/**
 * @fileoverview Locate external content on the HebrewBooks daf at word
 * granularity — the core of "align dafyomi/Sefaria/Rashi/Tosafot to the HB text."
 *
 * The rendered HB daf is a stream of `<span class="daf-word" data-word-index>`
 * (from tokenize.ts), each also tagged with `data-seg` (from
 * injectSegmentMarkers.ts). `buildHbWords` parses that stream once;
 * `locateInHb` places a query — a Hebrew phrase and/or Sefaria segments — onto
 * the exact HB word indices it covers.
 *
 * Matching is two-tier: an EXACT normalized match first (precise), then a
 * FUZZY match (reusing the alignment lib's `wordsMatchFuzzy`) but only WITHIN
 * the item's segment window — because the HB text is full of abbreviations
 * (א"ר, ס"ד) that never equal the spelled-out Sefaria/commentary Hebrew, and
 * fuzzy matching is only safe when the search space is one segment.
 */

import { wordsMatchFuzzy } from '../lib/sefref/alignment';

export interface HbWords {
  /** Raw `.daf-word` text, in document order (for fuzzy matching). */
  raw: string[];
  /** Normalized text per word (for exact matching). */
  norm: string[];
  /** Parallel `data-word-index` per word (== array position in practice). */
  wordIndex: number[];
  /** Sefaria segment index per word (or null when unaligned). */
  seg: (number | null)[];
  /** segment index -> inclusive [first,last] positions in the arrays above. */
  segRange: Map<number, { first: number; last: number }>;
}

export type LocateVia = 'phrase' | 'phrase-in-seg' | 'phrase-fuzzy' | 'segment' | 'ai';

export interface Located {
  /** Exact HB `data-word-index` values to highlight. */
  words: number[];
  via: LocateVia;
  /** 0..1 — how confident the placement is. */
  confidence: number;
}

/** Strip niqqud/cantillation, fold final letters, drop punctuation, collapse. */
export function normHe(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(
      /[ךםןףץ]/g,
      (c) => (({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }) as Record<string, string>)[c] ?? c,
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/[.,:;?!"'״׳`()[\]{}־–—]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildHbWords(html: string): HbWords {
  const out: HbWords = { raw: [], norm: [], wordIndex: [], seg: [], segRange: new Map() };
  if (!html || typeof document === 'undefined') return out;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const spans = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  spans.forEach((el, pos) => {
    const text = el.textContent ?? '';
    const wiRaw = el.getAttribute('data-word-index');
    const wi = wiRaw != null && Number.isFinite(Number(wiRaw)) ? Number(wiRaw) : pos;
    const segRaw = el.getAttribute('data-seg');
    const seg = segRaw != null && Number.isFinite(Number(segRaw)) ? Number(segRaw) : null;
    out.raw.push(text);
    out.norm.push(normHe(text));
    out.wordIndex.push(wi);
    out.seg.push(seg);
    if (seg != null) {
      const e = out.segRange.get(seg);
      if (e) e.last = pos;
      else out.segRange.set(seg, { first: pos, last: pos });
    }
  });
  return out;
}

/** Exact: norm equality, last needle token may be a prefix. Bounded to [start,end]. */
function findExact(norm: string[], needle: string[], start: number, end: number): number {
  const n = needle.length;
  if (n === 0) return -1;
  const hi = Math.min(end, norm.length - 1) - (n - 1);
  outer: for (let i = Math.max(0, start); i <= hi; i++) {
    for (let j = 0; j < n; j++) {
      if (j === n - 1) {
        if (!norm[i + j].startsWith(needle[j])) continue outer;
      } else if (norm[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Fuzzy: per-token `wordsMatchFuzzy`. Looser — only used inside a segment window. */
function findFuzzy(raw: string[], needle: string[], start: number, end: number): number {
  const n = needle.length;
  if (n === 0) return -1;
  const hi = Math.min(end, raw.length - 1) - (n - 1);
  outer: for (let i = Math.max(0, start); i <= hi; i++) {
    for (let j = 0; j < n; j++) {
      if (!wordsMatchFuzzy(raw[i + j], needle[j])) continue outer;
    }
    return i;
  }
  return -1;
}

function segWindow(hb: HbWords, segs: number[]): { first: number; last: number } | null {
  let first = Infinity;
  let last = -Infinity;
  for (const s of segs) {
    const r = hb.segRange.get(s);
    if (!r) continue;
    if (r.first < first) first = r.first;
    if (r.last > last) last = r.last;
  }
  return last >= first ? { first, last } : null;
}

export interface LocateQuery {
  phrase?: string;
  segs?: number[];
}

/**
 * Place a query on the HB daf. Exact phrase first (in-window, then whole-daf for
 * multi-word); then fuzzy within the segment window; then the whole segment
 * range as a coarse fallback; else null (caller keeps it whole-daf).
 */
export function locateInHb(hb: HbWords, q: LocateQuery): Located | null {
  if (hb.norm.length === 0) return null;
  const win = q.segs && q.segs.length ? segWindow(hb, q.segs) : null;
  const rawTokens = q.phrase
    ? q.phrase
        .replace(/<[^>]+>/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
    : [];
  const normTokens = rawTokens.map(normHe).filter(Boolean);
  const multi = normTokens.length >= 2;
  const single = normTokens.length === 1;
  const lastWord = hb.norm.length - 1;

  if (multi || (single && win)) {
    // 1. exact, inside the segment window.
    if (win) {
      const at = findExact(hb.norm, normTokens, win.first, win.last);
      if (at >= 0)
        return mk(hb, at, normTokens.length, 'phrase-in-seg', conf(normTokens.length, true, false));
    }
    // 2. exact, anywhere (multi-word only — single words are too common).
    if (multi) {
      const at = findExact(hb.norm, normTokens, 0, lastWord);
      if (at >= 0)
        return mk(hb, at, normTokens.length, 'phrase', conf(normTokens.length, false, false));
    }
    // 3. fuzzy, inside the window (abbreviation-tolerant; scoped to stay safe).
    if (win) {
      const at = findFuzzy(hb.raw, rawTokens, win.first, win.last);
      if (at >= 0)
        return mk(hb, at, rawTokens.length, 'phrase-fuzzy', conf(normTokens.length, true, true));
    }
    // 3b. fuzzy, ANYWHERE — only for a distinctive (>=3-token) phrase with no
    //     window, so an unsegmented Rishon's dibur-ha'maschil still lands
    //     despite the daf's leading prefixes (וְ/הַ/…). First run wins; >=3
    //     tokens keeps false hits unlikely.
    if (!win && normTokens.length >= 3) {
      const at = findFuzzy(hb.raw, rawTokens, 0, lastWord);
      if (at >= 0)
        return mk(hb, at, rawTokens.length, 'phrase-fuzzy', conf(normTokens.length, false, true));
    }
  }

  // 4. coarse fallback: the whole segment range.
  if (win) {
    const words: number[] = [];
    for (let p = win.first; p <= win.last; p++) words.push(hb.wordIndex[p]);
    return { words, via: 'segment', confidence: 0.3 };
  }
  return null;
}

function mk(hb: HbWords, at: number, len: number, via: LocateVia, confidence: number): Located {
  const words: number[] = [];
  for (let p = at; p < at + len && p < hb.wordIndex.length; p++) words.push(hb.wordIndex[p]);
  return { words, via, confidence };
}

function conf(nTokens: number, inWindow: boolean, fuzzy: boolean): number {
  let c = nTokens === 1 ? 0.45 : Math.min(0.6 + 0.08 * nTokens, 0.92);
  if (inWindow) c += 0.05;
  if (fuzzy) c -= 0.2;
  return Math.max(0.2, Math.min(0.97, c));
}
