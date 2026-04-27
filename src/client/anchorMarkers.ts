/**
 * Inject invisible marker spans at each anchor's first matching Hebrew
 * sequence in the tokenized daf HTML. The gutter-icons component then queries
 * these markers (by class) and measures their y-positions to place clickable
 * icons alongside the daf.
 *
 * Shared utility: geography, argument, and halacha each use their own marker
 * class so they don't collide.
 */

import { logMiss } from './missLog';

interface Anchor {
  excerpt: string;
  index: number; // which section/topic this anchor belongs to
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
  let searchStart = 0;
  for (const a of anchors) {
    const tokens = normalizeHebrew(a.excerpt).split(' ').filter(Boolean);
    if (tokens.length === 0) continue;
    const idx = findSequence(normed, tokens, searchStart);
    if (idx < 0) {
      // Excerpt couldn't be located in the tokenized Hebrew — log so we
      // can revisit the excerpt (LLM may have paraphrased instead of
      // quoting verbatim, or the normalization dropped key chars).
      logMiss('anchor', { markerClass, index: a.index, excerpt: a.excerpt }, ctx);
      continue;
    }

    const marker = doc.createElement('span');
    marker.className = markerClass;
    marker.setAttribute('data-idx', String(a.index));
    marker.setAttribute('data-excerpt-len', String(tokens.length));
    marker.setAttribute('aria-hidden', 'true');
    words[idx].parentNode?.insertBefore(marker, words[idx]);
    searchStart = idx + tokens.length;
  }
  return doc.body.innerHTML;
}

export interface AggadataAnchor {
  excerpt: string;
  endExcerpt?: string;
  index: number;
}

/**
 * Aggadata stories need both a start anchor (opening phrase) and an end
 * anchor (closing phrase) so the highlight can terminate at the actual end
 * of the narrative rather than bleeding into the next topic. The two anchors
 * for a given story are inserted as `.daf-aggadata-anchor` and
 * `.daf-aggadata-end-anchor` respectively, and a single cursor advances
 * through the token stream so story N's end always sits before story N+1's
 * start.
 */
export function injectAggadataAnchors(
  html: string,
  stories: AggadataAnchor[],
  ctx?: { tractate?: string; page?: string },
): string {
  if (!html || typeof document === 'undefined' || stories.length === 0) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length === 0) return html;

  const normed = words.map((el) => normalizeHebrew(el.textContent ?? ''));
  let cursor = 0;
  for (const story of stories) {
    const startTokens = normalizeHebrew(story.excerpt).split(' ').filter(Boolean);
    if (startTokens.length === 0) continue;
    const startIdx = findSequence(normed, startTokens, cursor);
    if (startIdx < 0) {
      logMiss('anchor', { markerClass: 'daf-aggadata-anchor', index: story.index, excerpt: story.excerpt }, ctx);
      continue;
    }

    const startMarker = doc.createElement('span');
    startMarker.className = 'daf-aggadata-anchor';
    startMarker.setAttribute('data-idx', String(story.index));
    startMarker.setAttribute('data-excerpt-len', String(startTokens.length));
    startMarker.setAttribute('aria-hidden', 'true');
    words[startIdx].parentNode?.insertBefore(startMarker, words[startIdx]);

    let advancedTo = startIdx + startTokens.length;

    if (story.endExcerpt) {
      const endTokens = normalizeHebrew(story.endExcerpt).split(' ').filter(Boolean);
      if (endTokens.length > 0) {
        // Search for the end phrase from (at minimum) the start of this
        // story. Allow overlap with the start excerpt for single-sentence
        // stories by beginning the search at startIdx rather than startIdx +
        // startTokens.length.
        const endIdx = findSequence(normed, endTokens, startIdx);
        if (endIdx < 0) {
          logMiss('anchor', { markerClass: 'daf-aggadata-end-anchor', index: story.index, excerpt: story.endExcerpt }, ctx);
        } else {
          const endMarker = doc.createElement('span');
          endMarker.className = 'daf-aggadata-end-anchor';
          endMarker.setAttribute('data-idx', String(story.index));
          endMarker.setAttribute('data-excerpt-len', String(endTokens.length));
          endMarker.setAttribute('aria-hidden', 'true');
          // Insert AFTER the last word of the end phrase so the range ends
          // past the phrase, not before it.
          const lastWord = words[endIdx + endTokens.length - 1];
          lastWord.parentNode?.insertBefore(endMarker, lastWord.nextSibling);
          advancedTo = Math.max(advancedTo, endIdx + endTokens.length);
        }
      }
    }

    cursor = advancedTo;
  }
  return doc.body.innerHTML;
}

export interface PesukimAnchor {
  excerpt: string;
  endExcerpt?: string;
  index: number;
}

/**
 * Pesukim citations carry an opening phrase (excerpt) and a closing phrase
 * (endExcerpt), so the highlight span can cover the full quoted verse rather
 * than just the citation marker. Mirrors injectAggadataAnchors but uses
 * `.daf-pesuk-anchor` / `.daf-pesuk-end-anchor` so the gutter-icon and
 * range-highlight code can target pesukim independently.
 */
export function injectPesukimAnchors(
  html: string,
  pesukim: PesukimAnchor[],
  ctx?: { tractate?: string; page?: string },
): string {
  if (!html || typeof document === 'undefined' || pesukim.length === 0) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length === 0) return html;

  const normed = words.map((el) => normalizeHebrew(el.textContent ?? ''));
  let cursor = 0;
  for (const pasuk of pesukim) {
    const startTokens = normalizeHebrew(pasuk.excerpt).split(' ').filter(Boolean);
    if (startTokens.length === 0) continue;
    const startIdx = findSequence(normed, startTokens, cursor);
    if (startIdx < 0) {
      logMiss('anchor', { markerClass: 'daf-pesuk-anchor', index: pasuk.index, excerpt: pasuk.excerpt }, ctx);
      continue;
    }

    const startMarker = doc.createElement('span');
    startMarker.className = 'daf-pesuk-anchor';
    startMarker.setAttribute('data-idx', String(pasuk.index));
    startMarker.setAttribute('data-excerpt-len', String(startTokens.length));
    startMarker.setAttribute('aria-hidden', 'true');
    words[startIdx].parentNode?.insertBefore(startMarker, words[startIdx]);

    let advancedTo = startIdx + startTokens.length;

    if (pasuk.endExcerpt) {
      const endTokens = normalizeHebrew(pasuk.endExcerpt).split(' ').filter(Boolean);
      if (endTokens.length > 0) {
        const endIdx = findSequence(normed, endTokens, startIdx);
        if (endIdx < 0) {
          logMiss('anchor', { markerClass: 'daf-pesuk-end-anchor', index: pasuk.index, excerpt: pasuk.endExcerpt }, ctx);
        } else {
          const endMarker = doc.createElement('span');
          endMarker.className = 'daf-pesuk-end-anchor';
          endMarker.setAttribute('data-idx', String(pasuk.index));
          endMarker.setAttribute('data-excerpt-len', String(endTokens.length));
          endMarker.setAttribute('aria-hidden', 'true');
          const lastWord = words[endIdx + endTokens.length - 1];
          lastWord.parentNode?.insertBefore(endMarker, lastWord.nextSibling);
          advancedTo = Math.max(advancedTo, endIdx + endTokens.length);
        }
      }
    }

    cursor = advancedTo;
  }
  return doc.body.innerHTML;
}

export interface OpinionSection {
  excerpt?: string;
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
 * section.
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

  // Pre-resolve each section's start word index. Sections are ordered in the
  // daf, and each excerpt only matches forward from the previous match.
  const sectionStarts: number[] = [];
  let cursor = 0;
  for (const s of sections) {
    const tokens = s.excerpt ? normalizeHebrew(s.excerpt).split(' ').filter(Boolean) : [];
    if (tokens.length === 0) {
      sectionStarts.push(cursor);
      continue;
    }
    const idx = findSequence(normed, tokens, cursor);
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
