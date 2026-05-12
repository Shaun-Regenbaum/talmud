/**
 * Renderer dispatcher — applies mark run outputs to the daf HTML by picking
 * the right inline transform based on (mark.anchor, mark.render.kind).
 *
 * Each renderer is a pure function (html, instances, def) → html. The
 * dispatcher walks all enabled marks (in deterministic order) and pipes the
 * HTML through each.
 *
 * Currently implemented:
 *   - phrase + inline → wraps existing injectRabbiUnderlines for now (it
 *     already handles Hebrew normalization, abbreviation expansion, and
 *     per-occurrence wrapping). When more phrase+inline marks land we'll
 *     factor out a general inline-decorator that accepts color/style as
 *     config, but for the rabbi proof-point reusing the existing primitive
 *     keeps visual parity.
 *
 * To add a new (anchor, render) combination: implement a renderer function,
 * register it in the RENDERERS table.
 */

import { injectRabbiUnderlines, type GenerationRabbi, normalizeHebrew } from '../injectRabbiUnderlines';
import type { GenerationId } from '../generations';
import { recordRender } from '../rendererActivity';

export interface MarkInstance {
  excerpt?: string;
  segIdx?: number;
  startSegIdx?: number;
  endSegIdx?: number;
  tokenStart?: number;
  tokenEnd?: number;
  fields: Record<string, unknown>;
}

export interface MarkRunOutput {
  parsed: { instances: MarkInstance[] } | null;
}

export interface MarkDef {
  id: string;
  anchor: 'segment' | 'segment-range' | 'phrase' | 'multi-anchor' | 'cross-daf' | 'external' | 'whole-daf';
  render: { kind: string; [key: string]: unknown };
}

type Renderer = (html: string, instances: MarkInstance[], def: MarkDef) => string;

/**
 * phrase + inline → for the rabbi mark, dispatch to injectRabbiUnderlines.
 * For places, wrap each matched Hebrew place name as a `.city-marker` span
 * (legacy GeographyMap click-highlighting reads `.city-marker[data-city]`).
 * Other phrase+inline marks pass through unchanged.
 */
const phraseInline: Renderer = (html, instances, def) => {
  if (!html || instances.length === 0) return html;
  if (def.id === 'rabbi') {
    const rabbis: GenerationRabbi[] = instances
      .map((i) => ({
        name: String(i.fields?.name ?? ''),
        nameHe: String(i.fields?.nameHe ?? i.excerpt ?? ''),
        generation: (i.fields?.generation ?? 'unknown') as GenerationId,
      }))
      .filter((r) => r.nameHe.length > 0);
    return injectRabbiUnderlines(html, rabbis);
  }
  if (def.id === 'places') {
    const places = instances
      .map((i) => ({
        name: String(i.fields?.name ?? ''),
        nameHe: String(i.fields?.nameHe ?? i.excerpt ?? ''),
      }))
      .filter((p) => p.name && p.nameHe);
    return injectPlaceMarkers(html, places);
  }
  return html;
};

/**
 * Wrap every occurrence of each place's canonical Hebrew name (with attached
 * Hebrew particle prefixes ב/מ/ל/כ/ש/ו) as a `.city-marker[data-city=NAME]`
 * span. Mirrors the legacy heuristic-driven injectCityMarkers but driven by
 * LLM-extracted instances.
 */
function injectPlaceMarkers(html: string, places: Array<{ name: string; nameHe: string }>): string {
  if (typeof document === 'undefined' || places.length === 0) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length === 0) return html;

  const normed = words.map((el) => normalizeHebrew(el.textContent ?? ''));
  const HEBREW_PARTICLES = ['ב', 'מ', 'ל', 'כ', 'ש', 'ו'];

  interface Candidate { tokens: string[]; name: string }
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const p of places) {
    const base = normalizeHebrew(p.nameHe).split(' ').filter(Boolean);
    if (base.length === 0) continue;
    const key = `${p.name}${base.join(' ')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ tokens: base, name: p.name });
    for (const particle of HEBREW_PARTICLES) {
      candidates.push({ tokens: [particle + base[0], ...base.slice(1)], name: p.name });
    }
  }
  candidates.sort((a, b) => b.tokens.length - a.tokens.length);

  const wrapped = new Uint8Array(words.length);
  interface Wrap { start: number; end: number; name: string }
  const wraps: Wrap[] = [];
  for (const c of candidates) {
    const n = c.tokens.length;
    for (let i = 0; i <= words.length - n; i++) {
      let clear = true;
      for (let j = 0; j < n; j++) { if (wrapped[i + j]) { clear = false; break; } }
      if (!clear) continue;
      let ok = true;
      for (let j = 0; j < n; j++) { if (normed[i + j] !== c.tokens[j]) { ok = false; break; } }
      if (!ok) continue;
      wraps.push({ start: i, end: i + n - 1, name: c.name });
      for (let j = 0; j < n; j++) wrapped[i + j] = 1;
    }
  }
  if (wraps.length === 0) return html;

  for (const w of wraps) {
    const first = words[w.start];
    const last = words[w.end];
    const parent = first.parentNode;
    if (!parent) continue;
    const wrapper = doc.createElement('span');
    wrapper.className = 'city-marker';
    wrapper.setAttribute('data-city', w.name);
    parent.insertBefore(wrapper, first);
    const nodes: Node[] = [];
    let cur: Node | null = first;
    while (cur) { nodes.push(cur); if (cur === last) break; cur = cur.nextSibling; }
    for (const node of nodes) wrapper.appendChild(node);
  }
  return doc.body.innerHTML;
}

/**
 * segment + gutter+sidebar → for the rishonim mark, inject an invisible
 * `.daf-rishonim-anchor[data-idx=N]` span at the START of each commented
 * segment. The GutterIcons component reads these anchors' DOM positions
 * and overlays per-segment icons in the daf's left/right gutter. Click on
 * an icon → DafViewer opens the RishonimInspectorShelf for that segment.
 *
 * Anchor placement (start of segment, not end) matters: GutterIcons aligns
 * the icon vertically against the anchor's bounding rect, so the icon
 * lines up with the first line of the segment.
 */
const segmentGutterSidebar: Renderer = (html, instances, def) => {
  if (!html || instances.length === 0) return html;
  if (def.id === 'rishonim') {
    const segIdxs = instances
      .map((i) => Number(i.segIdx))
      .filter((n) => Number.isFinite(n) && n >= 0);
    return injectRishonimAnchors(html, segIdxs);
  }
  return html;
};

/**
 * Inject a zero-width `.daf-rishonim-anchor[data-idx="N"]` span before the
 * first `.daf-word[data-seg=N]` of each commented segment. GutterIcons
 * measures anchor rects to position per-segment icons in the gutter.
 */
function injectRishonimAnchors(html: string, segIdxs: number[]): string {
  if (typeof document === 'undefined' || segIdxs.length === 0) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const wanted = new Set(segIdxs);
  // Find the first .daf-word of each wanted segment in one pass.
  const firstBySeg = new Map<number, HTMLElement>();
  const words = doc.body.querySelectorAll<HTMLSpanElement>('.daf-word[data-seg]');
  for (const el of Array.from(words)) {
    const segAttr = el.getAttribute('data-seg');
    if (segAttr === null) continue;
    const seg = Number(segAttr);
    if (!wanted.has(seg)) continue;
    if (firstBySeg.has(seg)) continue;
    firstBySeg.set(seg, el);
  }
  if (firstBySeg.size === 0) return html;
  for (const [seg, firstEl] of firstBySeg) {
    const anchor = doc.createElement('span');
    anchor.className = 'daf-rishonim-anchor';
    anchor.setAttribute('data-idx', String(seg));
    // Zero-width / inert — GutterIcons measures the anchor's getBoundingClientRect
    // to position its icon vertically aligned with the segment's first line.
    anchor.setAttribute('aria-hidden', 'true');
    firstEl.parentNode?.insertBefore(anchor, firstEl);
  }
  return doc.body.innerHTML;
}

const RENDERERS: Record<string, Renderer> = {
  'phrase:inline': phraseInline,
  'segment:gutter+sidebar': segmentGutterSidebar,
};

/**
 * Apply every enabled mark's renderer to the HTML in turn. `marks` is the
 * list of currently-enabled marks (order matters — earlier marks are applied
 * first); `runs` maps mark.id → run output.
 */
export function applyMarkRenderers(
  html: string,
  marks: MarkDef[],
  runs: Record<string, MarkRunOutput | undefined>,
): string {
  let out = html;
  for (const def of marks) {
    const run = runs[def.id];
    const key = `${def.anchor}:${def.render.kind}`;
    const at = Date.now();
    if (!run?.parsed) {
      recordRender(def.id, key, { kind: 'skip-no-run', at });
      continue;
    }
    const r = RENDERERS[key];
    if (!r) {
      // No renderer registered for this (anchor, render) combo — expected
      // for marks that render through the legacy DafViewer bridge
      // (argument / halacha / aggadata / pesukim via gutter+sidebar).
      recordRender(def.id, key, { kind: 'skip-no-renderer', at });
      continue;
    }
    const instances = run.parsed.instances ?? [];
    if (instances.length === 0) {
      recordRender(def.id, key, { kind: 'skip-zero-instances', at });
      continue;
    }
    const t0 = performance.now();
    try {
      const before = out.length;
      out = r(out, instances, def);
      const ms = Math.round(performance.now() - t0);
      recordRender(def.id, key, {
        kind: 'applied',
        instances: instances.length,
        bytesBefore: before,
        bytesAfter: out.length,
        ms,
        at,
      });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      recordRender(def.id, key, { kind: 'error', error: msg, at });
    }
  }
  return out;
}
