/**
 * Inject invisible marker spans at each anchor's first matching Hebrew
 * sequence in the tokenized daf HTML. The gutter-icons component then queries
 * these markers (by class) and measures their y-positions to place clickable
 * icons alongside the daf.
 *
 * Shared utility: geography, argument, and halacha each use their own marker
 * class so they don't collide.
 *
 * Two-stage anchoring. The primary stage matches the enrichment's verbatim
 * `excerpt` against the tokenized Hebrew. That fails surprisingly often
 * because the rendered daf is HebrewBooks text (riddled with abbreviations
 * like `ס"ד`, `א"ר`, `אפי׳`) while the LLM excerpts come from Sefaria's
 * spelled-out, vocalized text — so `סלקא דעתך` never equals `ס"ד` after
 * normalization. When the verbatim match misses, we fall back to the
 * segment-aligned position: `injectSegmentMarkers` runs first and tags every
 * .daf-word with `data-seg="<idx>"` using an abbreviation-aware aligner, so
 * an instance's `startSegIdx`/`endSegIdx` resolves to a concrete word even
 * when its excerpt doesn't. This keeps the gutter icon (and the marker-based
 * highlight) from silently disappearing.
 */

import { logMiss } from './missLog';

interface Anchor {
  excerpt: string;
  index: number; // which section/topic this anchor belongs to
  startSegIdx?: number; // Sefaria segment for the seg-aligned fallback
}

function normalizeHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/[.,:;?!"'״׳-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findSequence(haystack: string[], needle: string[], startIdx: number): number {
  const n = needle.length;
  outer: for (let i = startIdx; i <= haystack.length - n; i++) {
    for (let j = 0; j < n; j++) {
      if (j === n - 1) {
        if (!haystack[i + j].startsWith(needle[j])) continue outer;
      } else if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

/**
 * Map each Sefaria segment index to the first/last `.daf-word` position that
 * carries it (set by injectSegmentMarkers' `data-seg`). Used as the fallback
 * anchor when verbatim excerpt matching fails.
 */
function buildSegIndex(words: HTMLSpanElement[]): Map<number, { first: number; last: number }> {
  const m = new Map<number, { first: number; last: number }>();
  for (let i = 0; i < words.length; i++) {
    const raw = words[i].getAttribute('data-seg');
    if (raw == null) continue;
    const seg = Number(raw);
    if (!Number.isFinite(seg)) continue;
    const e = m.get(seg);
    if (e) e.last = i;
    else m.set(seg, { first: i, last: i });
  }
  return m;
}

function insertMarker(
  doc: Document,
  before: HTMLSpanElement,
  markerClass: string,
  index: number,
  excerptLen: number,
  via?: 'seg',
): void {
  const marker = doc.createElement('span');
  marker.className = markerClass;
  marker.setAttribute('data-idx', String(index));
  marker.setAttribute('data-excerpt-len', String(Math.max(1, excerptLen)));
  if (via) marker.setAttribute('data-anchor-fallback', via);
  marker.setAttribute('aria-hidden', 'true');
  before.parentNode?.insertBefore(marker, before);
}

export function injectAnchorMarkers(
  html: string,
  anchors: Anchor[],
  markerClass: string,
  ctx?: { tractate?: string; page?: string },
): string {
  if (!html || typeof document === 'undefined' || anchors.length === 0) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length === 0) return html;

  const normed = words.map((el) => normalizeHebrew(el.textContent ?? ''));
  const segIndex = buildSegIndex(words);
  let searchStart = 0;
  for (const a of anchors) {
    const tokens = normalizeHebrew(a.excerpt).split(' ').filter(Boolean);
    const idx = tokens.length > 0 ? findSequence(normed, tokens, searchStart) : -1;
    if (idx >= 0) {
      insertMarker(doc, words[idx], markerClass, a.index, tokens.length);
      searchStart = idx + tokens.length;
      continue;
    }

    // Verbatim match missed (or the instance carries no excerpt). Fall back
    // to the segment-aligned position so the gutter marker still appears.
    const seg = a.startSegIdx != null ? segIndex.get(a.startSegIdx) : undefined;
    if (seg) {
      const len = tokens.length > 0 ? tokens.length : seg.last - seg.first + 1;
      insertMarker(doc, words[seg.first], markerClass, a.index, len, 'seg');
      searchStart = Math.max(searchStart, seg.first + 1);
      // Still log — a recovered anchor means the excerpt didn't quote the
      // gemara verbatim, which is useful signal for tightening the prompt.
      logMiss('anchor', { markerClass, index: a.index, excerpt: a.excerpt, recovered: 'seg', startSegIdx: a.startSegIdx }, ctx);
      continue;
    }

    // No excerpt match AND no usable segment — nothing to anchor on.
    if (tokens.length === 0) continue;
    logMiss('anchor', { markerClass, index: a.index, excerpt: a.excerpt }, ctx);
  }
  return doc.body.innerHTML;
}

export interface AggadataAnchor {
  excerpt: string;
  endExcerpt?: string;
  index: number;
  startSegIdx?: number;
  endSegIdx?: number;
}

export interface PesukimAnchor {
  excerpt: string;
  endExcerpt?: string;
  index: number;
  startSegIdx?: number;
  endSegIdx?: number;
}

interface RangeAnchor {
  excerpt: string;
  endExcerpt?: string;
  index: number;
  startSegIdx?: number;
  endSegIdx?: number;
}

/**
 * Shared start+end anchor injection for aggadata stories and pesukim
 * citations. Both need an opening anchor (so the highlight can begin at the
 * narrative/verse start) and a closing anchor (so it ends at the actual end
 * rather than bleeding into the next topic). A single cursor advances through
 * the token stream so item N's end always sits before item N+1's start.
 *
 * Start and end each resolve independently: try the verbatim excerpt first,
 * then fall back to the segment-aligned position (start → first word of
 * startSegIdx; end → last word of endSegIdx). The end marker is inserted
 * AFTER its last word so the highlight range covers the phrase.
 */
function injectRangeAnchors(
  html: string,
  items: RangeAnchor[],
  startClass: string,
  endClass: string,
  ctx?: { tractate?: string; page?: string },
): string {
  if (!html || typeof document === 'undefined' || items.length === 0) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length === 0) return html;

  const normed = words.map((el) => normalizeHebrew(el.textContent ?? ''));
  const segIndex = buildSegIndex(words);
  let cursor = 0;
  for (const item of items) {
    const startTokens = normalizeHebrew(item.excerpt).split(' ').filter(Boolean);
    let startIdx = startTokens.length > 0 ? findSequence(normed, startTokens, cursor) : -1;
    let startViaSeg = false;
    if (startIdx < 0) {
      const seg = item.startSegIdx != null ? segIndex.get(item.startSegIdx) : undefined;
      if (seg) {
        startIdx = seg.first;
        startViaSeg = true;
      }
    }
    if (startIdx < 0) {
      if (startTokens.length > 0) {
        logMiss('anchor', { markerClass: startClass, index: item.index, excerpt: item.excerpt }, ctx);
      }
      continue;
    }

    insertMarker(doc, words[startIdx], startClass, item.index, startTokens.length, startViaSeg ? 'seg' : undefined);
    if (startViaSeg) {
      logMiss('anchor', { markerClass: startClass, index: item.index, excerpt: item.excerpt, recovered: 'seg', startSegIdx: item.startSegIdx }, ctx);
    }

    let advancedTo = startViaSeg ? startIdx + 1 : startIdx + startTokens.length;

    const endTokens = item.endExcerpt ? normalizeHebrew(item.endExcerpt).split(' ').filter(Boolean) : [];
    if (endTokens.length > 0 || item.endSegIdx != null) {
      // Search the end phrase from (at minimum) the start of this item so a
      // single-sentence story can overlap its own start excerpt.
      let endLastIdx = -1;
      let endViaSeg = false;
      if (endTokens.length > 0) {
        const endIdx = findSequence(normed, endTokens, startIdx);
        if (endIdx >= 0) endLastIdx = endIdx + endTokens.length - 1;
      }
      if (endLastIdx < 0) {
        const seg = item.endSegIdx != null ? segIndex.get(item.endSegIdx) : undefined;
        if (seg) {
          endLastIdx = seg.last;
          endViaSeg = true;
        }
      }
      if (endLastIdx >= 0) {
        const lastWord = words[endLastIdx];
        const endMarker = doc.createElement('span');
        endMarker.className = endClass;
        endMarker.setAttribute('data-idx', String(item.index));
        endMarker.setAttribute('data-excerpt-len', String(Math.max(1, endTokens.length)));
        if (endViaSeg) endMarker.setAttribute('data-anchor-fallback', 'seg');
        endMarker.setAttribute('aria-hidden', 'true');
        // Insert AFTER the last word so the range ends past the phrase.
        lastWord.parentNode?.insertBefore(endMarker, lastWord.nextSibling);
        advancedTo = Math.max(advancedTo, endLastIdx + 1);
        if (endViaSeg && endTokens.length > 0) {
          logMiss('anchor', { markerClass: endClass, index: item.index, excerpt: item.endExcerpt, recovered: 'seg', endSegIdx: item.endSegIdx }, ctx);
        }
      } else if (endTokens.length > 0) {
        logMiss('anchor', { markerClass: endClass, index: item.index, excerpt: item.endExcerpt }, ctx);
      }
    }

    cursor = advancedTo;
  }
  return doc.body.innerHTML;
}

/**
 * Aggadata stories need both a start anchor (opening phrase) and an end
 * anchor (closing phrase) so the highlight can terminate at the actual end
 * of the narrative rather than bleeding into the next topic. The two anchors
 * for a given story are inserted as `.daf-aggadata-anchor` and
 * `.daf-aggadata-end-anchor` respectively.
 */
export function injectAggadataAnchors(
  html: string,
  stories: AggadataAnchor[],
  ctx?: { tractate?: string; page?: string },
): string {
  return injectRangeAnchors(html, stories, 'daf-aggadata-anchor', 'daf-aggadata-end-anchor', ctx);
}

/**
 * Pesukim citations carry an opening phrase (excerpt) and a closing phrase
 * (endExcerpt), so the highlight span can cover the full quoted verse rather
 * than just the citation marker. Uses `.daf-pesuk-anchor` /
 * `.daf-pesuk-end-anchor` so the gutter-icon and range-highlight code can
 * target pesukim independently.
 */
export function injectPesukimAnchors(
  html: string,
  pesukim: PesukimAnchor[],
  ctx?: { tractate?: string; page?: string },
): string {
  return injectRangeAnchors(html, pesukim, 'daf-pesuk-anchor', 'daf-pesuk-end-anchor', ctx);
}

export interface YerushalmiAnchor {
  excerpt: string;
  index: number;
  startSegIdx?: number;
  endSegIdx?: number;
}

/**
 * Yerushalmi-parallel anchors carry only an opening phrase (excerpt) — the mark
 * highlights the BEGINNING of the parallel span on the Bavli daf, where the
 * gutter icon sits. Uses `.daf-yerushalmi-anchor` so the gutter measurement +
 * range code can target it independently. (No end anchor: the parallel's extent
 * is conveyed in the sidebar, not painted across the daf.)
 */
export function injectYerushalmiAnchors(
  html: string,
  parallels: YerushalmiAnchor[],
  ctx?: { tractate?: string; page?: string },
): string {
  return injectRangeAnchors(html, parallels, 'daf-yerushalmi-anchor', 'daf-yerushalmi-end-anchor', ctx);
}

export interface OpinionSection {
  excerpt?: string;
  startSegIdx?: number;
  rabbis: Array<{ name: string; nameHe: string; opinionStart?: string }>;
}

/**
 * For every rabbi in every argument section that carries an `opinionStart`,
 * inject a `.daf-opinion-anchor[data-rabbi][data-section-idx]` span at the
 * first matching Hebrew occurrence within that section's text range. The
 * client uses these anchors to highlight the rabbi's opinion range
 * (from their anchor to the next opinion anchor in the same section, or to
 * the section's end).
 *
 * Matching is bounded per-section (excerpt → next section's excerpt) so a
 * rabbi named elsewhere on the daf doesn't get an anchor inside the wrong
 * section. Section starts fall back to the segment-aligned position when the
 * section excerpt doesn't match verbatim, so the per-section bounds stay
 * correct even when the excerpt is paraphrased.
 */
export function injectOpinionMarkers(
  html: string,
  sections: OpinionSection[],
  ctx?: { tractate?: string; page?: string },
): string {
  if (!html || typeof document === 'undefined' || sections.length === 0) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length === 0) return html;

  const normed = words.map((el) => normalizeHebrew(el.textContent ?? ''));
  const segIndex = buildSegIndex(words);

  // Pre-resolve each section's start word index. Sections are ordered in the
  // daf, and each excerpt only matches forward from the previous match. When
  // the excerpt misses, the segment-aligned start keeps the bounds honest.
  const sectionStarts: number[] = [];
  let cursor = 0;
  for (const s of sections) {
    const tokens = s.excerpt ? normalizeHebrew(s.excerpt).split(' ').filter(Boolean) : [];
    let idx = tokens.length > 0 ? findSequence(normed, tokens, cursor) : -1;
    if (idx < 0 && s.startSegIdx != null) {
      const seg = segIndex.get(s.startSegIdx);
      if (seg) idx = seg.first;
    }
    if (idx < 0) {
      sectionStarts.push(cursor);
    } else {
      sectionStarts.push(idx);
      cursor = idx;
    }
  }

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const sectionStart = sectionStarts[sIdx];
    const sectionEnd = sIdx + 1 < sectionStarts.length ? sectionStarts[sIdx + 1] : words.length;
    let opinionCursor = sectionStart;
    for (const rabbi of section.rabbis) {
      if (!rabbi.opinionStart) continue;
      const rtokens = normalizeHebrew(rabbi.opinionStart).split(' ').filter(Boolean);
      if (rtokens.length === 0) continue;
      const idx = findSequence(normed, rtokens, opinionCursor);
      if (idx < 0 || idx + rtokens.length > sectionEnd) {
        logMiss(
          'opinion',
          { rabbi: rabbi.name, section: sIdx, opinionStart: rabbi.opinionStart, reason: idx < 0 ? 'no match' : 'past section end' },
          ctx,
        );
        continue;
      }

      const marker = doc.createElement('span');
      marker.className = 'daf-opinion-anchor';
      marker.setAttribute('data-rabbi', rabbi.name);
      marker.setAttribute('data-section-idx', String(sIdx));
      marker.setAttribute('data-opinion-len', String(rtokens.length));
      marker.setAttribute('aria-hidden', 'true');
      words[idx].parentNode?.insertBefore(marker, words[idx]);
      opinionCursor = idx + rtokens.length;
    }
  }

  return doc.body.innerHTML;
}
