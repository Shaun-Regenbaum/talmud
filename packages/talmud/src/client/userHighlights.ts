/**
 * User pieces — personal highlights + notes on the daf.
 *
 * Client-only: persisted to `localStorage` per (tractate, page), no backend
 * and no auth (a local-session feature). Each highlight pins to a word-range
 * using the same (seg, tok) coordinate the worker-anchored pieces use, so it
 * survives reflow and re-paints through the existing `buildTokenRange` /
 * `paintRangeOverlay` machinery in DafViewer.
 *
 * This module is pure DOM + storage logic (no Solid, no app imports) so the
 * selection→coordinate mapping can be unit-tested under jsdom.
 */

/** A persisted personal highlight, optionally carrying a note. */
export interface UserHighlight {
  id: string;
  /** Word-range anchor (inclusive), matching the daf's `.daf-word` data-seg /
   *  per-segment token index. */
  startSeg: number;
  startTok: number;
  endSeg: number;
  endTok: number;
  /** Verbatim selected text — shown in the notes list and as a fallback label
   *  if the anchor ever fails to resolve against a re-rendered daf. */
  text: string;
  /** Free-text note (empty string when the user only highlighted). */
  note: string;
  /** One of HIGHLIGHT_COLORS' `key`s. */
  color: string;
  createdAt: number;
}

/** Highlighter palette. `key` is stored; `bg` is the painted (translucent)
 *  fill; `swatch` is the opaque toolbar chip. */
export const HIGHLIGHT_COLORS: ReadonlyArray<{ key: string; label: string; bg: string; swatch: string }> = [
  { key: 'yellow', label: 'Yellow', bg: 'rgba(250, 204, 21, 0.40)', swatch: '#facc15' },
  { key: 'green', label: 'Green', bg: 'rgba(74, 222, 128, 0.38)', swatch: '#4ade80' },
  { key: 'blue', label: 'Blue', bg: 'rgba(96, 165, 250, 0.38)', swatch: '#60a5fa' },
  { key: 'pink', label: 'Pink', bg: 'rgba(244, 114, 182, 0.38)', swatch: '#f472b6' },
];

const DEFAULT_COLOR = HIGHLIGHT_COLORS[0].key;

/** Translucent fill for a stored color key (falls back to yellow). */
export function bgForColor(key: string): string {
  return (HIGHLIGHT_COLORS.find((c) => c.key === key) ?? HIGHLIGHT_COLORS[0]).bg;
}

const KEY_PREFIX = 'talmud:user-highlights:v1';

function storageKey(tractate: string, page: string): string {
  return `${KEY_PREFIX}:${tractate}:${page}`;
}

function getStore(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    // Access can throw in private-mode / sandboxed iframes.
    return null;
  }
}

/** Load this daf's highlights (empty array on absence or corruption). */
export function loadUserHighlights(tractate: string, page: string): UserHighlight[] {
  const store = getStore();
  if (!store) return [];
  try {
    const raw = store.getItem(storageKey(tractate, page));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidHighlight).map(normalizeHighlight);
  } catch {
    return [];
  }
}

/** Coerce the optional/display fields to safe defaults so a hand-edited or
 *  partially-corrupt record can't crash the UI (e.g. note().trim()). */
function normalizeHighlight(h: UserHighlight): UserHighlight {
  return {
    ...h,
    note: typeof h.note === 'string' ? h.note : '',
    color: typeof h.color === 'string' ? h.color : DEFAULT_COLOR,
    createdAt: typeof h.createdAt === 'number' ? h.createdAt : 0,
  };
}

/** Persist this daf's highlights (a no-op when storage is unavailable). */
export function saveUserHighlights(tractate: string, page: string, list: UserHighlight[]): void {
  const store = getStore();
  if (!store) return;
  try {
    if (list.length === 0) store.removeItem(storageKey(tractate, page));
    else store.setItem(storageKey(tractate, page), JSON.stringify(list));
  } catch {
    // Quota / disabled storage — silently drop; highlights stay in-memory.
  }
}

function isValidHighlight(h: unknown): h is UserHighlight {
  if (!h || typeof h !== 'object') return false;
  const o = h as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.startSeg === 'number' &&
    typeof o.startTok === 'number' &&
    typeof o.endSeg === 'number' &&
    typeof o.endTok === 'number' &&
    typeof o.text === 'string'
  );
}

let idCounter = 0;
/** A stable-enough id for a single session (crypto.randomUUID when present). */
export function makeHighlightId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  idCounter += 1;
  return `uh-${Date.now().toString(36)}-${idCounter}`;
}

/** The token index of `span` within its own segment (position among the
 *  `.daf-word[data-seg=N]` spans in document order). */
function tokenIndexOf(mainCol: HTMLElement, span: HTMLElement): number {
  const seg = span.getAttribute('data-seg');
  if (seg == null) return 0;
  const sibs = mainCol.querySelectorAll<HTMLElement>(`.daf-word[data-seg="${seg}"]`);
  for (let i = 0; i < sibs.length; i++) if (sibs[i] === span) return i;
  return 0;
}

/**
 * Map a live DOM selection range to a word-range coordinate over the daf's
 * `.daf-word` spans. Returns null when the selection covers no tagged words
 * (e.g. landed entirely in commentary columns or between segments).
 *
 * Uses boundary-point comparison (portable across jsdom/browsers) to find
 * every `.daf-word` that overlaps the range, then takes the first and last.
 */
export function selectionToTokenRange(
  range: Range,
  mainCol: HTMLElement,
): { startSeg: number; startTok: number; endSeg: number; endTok: number; text: string } | null {
  if (range.collapsed) return null;
  const spans = Array.from(mainCol.querySelectorAll<HTMLElement>('.daf-word'));
  if (spans.length === 0) return null;

  const hit: HTMLElement[] = [];
  for (const span of spans) {
    const spanRange = span.ownerDocument.createRange();
    spanRange.selectNode(span);
    // Overlap iff span.start < sel.end AND span.end > sel.start. With `range`
    // as the context object: START_TO_END compares sel.end to span.start (>0
    // ⇒ span.start < sel.end); END_TO_START compares sel.start to span.end
    // (<0 ⇒ span.end > sel.start).
    const spanStartsBeforeSelEnd = range.compareBoundaryPoints(Range.START_TO_END, spanRange) > 0;
    const spanEndsAfterSelStart = range.compareBoundaryPoints(Range.END_TO_START, spanRange) < 0;
    if (spanStartsBeforeSelEnd && spanEndsAfterSelStart) hit.push(span);
  }
  if (hit.length === 0) return null;

  const first = hit[0];
  const last = hit[hit.length - 1];
  const startSeg = Number(first.getAttribute('data-seg'));
  const endSeg = Number(last.getAttribute('data-seg'));
  if (!Number.isFinite(startSeg) || !Number.isFinite(endSeg)) return null;

  const text = hit
    .map((s) => s.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    startSeg,
    startTok: tokenIndexOf(mainCol, first),
    endSeg,
    endTok: tokenIndexOf(mainCol, last),
    text,
  };
}

/** Does a highlight's word-range cover the (seg, tok) of a single word?
 *  Used for click-to-open: a plain click on a highlighted word opens it. */
export function highlightCoversWord(h: UserHighlight, seg: number, tok: number): boolean {
  const afterStart = seg > h.startSeg || (seg === h.startSeg && tok >= h.startTok);
  const beforeEnd = seg < h.endSeg || (seg === h.endSeg && tok <= h.endTok);
  return afterStart && beforeEnd;
}

/** Build a UserHighlight from a mapped selection + chosen color/note. */
export function buildHighlight(
  coords: { startSeg: number; startTok: number; endSeg: number; endTok: number; text: string },
  opts?: { color?: string; note?: string },
): UserHighlight {
  return {
    id: makeHighlightId(),
    startSeg: coords.startSeg,
    startTok: coords.startTok,
    endSeg: coords.endSeg,
    endTok: coords.endTok,
    text: coords.text,
    note: opts?.note ?? '',
    color: opts?.color ?? DEFAULT_COLOR,
    createdAt: Date.now(),
  };
}

/** Resolve the (seg, tok) of the `.daf-word` a click landed on, if any. */
export function wordCoordFromTarget(
  target: EventTarget | null,
  mainCol: HTMLElement,
): { seg: number; tok: number } | null {
  // A click target is usually the `.daf-word` element; a selection boundary is
  // usually a text node inside one — resolve both to the enclosing element.
  const el =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!el) return null;
  const word = el.closest<HTMLElement>('.daf-word');
  if (!word || !mainCol.contains(word)) return null;
  const seg = Number(word.getAttribute('data-seg'));
  if (!Number.isFinite(seg)) return null;
  return { seg, tok: tokenIndexOf(mainCol, word) };
}
