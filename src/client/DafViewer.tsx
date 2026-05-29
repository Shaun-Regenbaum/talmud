import { createResource, createSignal, createEffect, createMemo, onMount, onCleanup, For, Show, type JSX } from 'solid-js';
import type { TalmudPageData } from '../lib/sefref';
import { TRACTATE_OPTIONS } from '../lib/sefref';
import { DafRenderer } from '../lib/daf-render';
import { tokenizeHebrewHtml } from './tokenize';
import { TranslationPopup } from './TranslationPopup';
import type {
  DafAnalysis, Section,
  HalachaResult, HalachaTopic,
  AggadataResult,
  PesukimResult,
} from './shapes';
import { injectRabbiUnderlines, type GenerationRabbi } from './injectRabbiUnderlines';
import { injectSegmentMarkers } from './injectSegmentMarkers';
import { injectHadran } from './injectHadran';
import { ensureMasechetIncipit } from './ensureMasechetIncipit';
import { injectAnchorMarkers, injectOpinionMarkers, injectAggadataAnchors, injectPesukimAnchors } from './anchorMarkers';
import { buildTokenRange } from './highlightRange';
import { GutterIcons, type GutterKind } from './GutterIcons';
import { GutterOverlay } from './GutterOverlay';
import { ArgumentSidebar, type SidebarContent, type PlaceInstance } from './ArgumentSidebar';
import { BugReport } from './BugReport';
import { type CommentaryWork, type CommentaryComment } from './CommentaryPicker';
import { CommentaryStrip } from './CommentaryStrip';
// GeographyStrip removed pending rederivation — see TODO(geography-rederive).
import { MobileShelf, type MobileInteractionMode } from './MobileShelf';
import MarksRegistryPanel, { enabledMarkDefs, markRunsByMarkId, markStatuses } from './MarksRegistryPanel';
import DafLoadProgress from './DafLoadProgress';
import { prefetchDaf, cancelPrefetch } from './dafPrefetch';
import { buildSeedMarks } from './seed-marks';
import { partitionSections, dedupeBy } from '../lib/argumentMoves';
import { fetchCommentaryAnchorIndex, type CommentaryAnchorIndex } from './commentaryAnchorIndex';
import { recordStage } from './rendererActivity';
import { applyMarkRenderers } from './renderers/dispatch';
import DevModeShelf, { readDevMode, setDevModeActive } from './DevModeShelf';
import ChecksPanel from './ChecksPanel';
import type { GenerationId } from './generations';
import { GENERATION_BY_ID } from './generations';
import { resolveVoiceGroup, voiceGroupNames } from './voiceGroups';
import { t, lang, setLang } from './i18n';

/** Normalize a rabbi name for fuzzy lookup: drop honorific prefixes, lower
 *  case, collapse whitespace. Mirrors rabbiLinks.normalizeRabbiName but
 *  inlined to avoid a circular module dependency for the resolver. */
function normalizeRabbiName(s: string): string {
  return s
    .replace(/\b(Rabbi|Rabban|Rav|Rabbah|R\.)\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface Ref {
  tractate: string;
  page: string;
}

function parsePage(raw: string): { num: number; amud: 'a' | 'b' } {
  const m = raw.match(/^(\d+)([ab])$/i);
  if (!m) return { num: 2, amud: 'a' };
  return { num: parseInt(m[1], 10), amud: (m[2].toLowerCase() as 'a' | 'b') };
}

function formatPage(num: number, amud: 'a' | 'b'): string {
  return `${num}${amud}`;
}

function nextPage(p: string): string {
  const { num, amud } = parsePage(p);
  return amud === 'a' ? formatPage(num, 'b') : formatPage(num + 1, 'a');
}

function prevPage(p: string): string {
  const { num, amud } = parsePage(p);
  if (amud === 'b') return formatPage(num, 'a');
  return num > 2 ? formatPage(num - 1, 'b') : formatPage(2, 'a');
}

async function fetchDaf(ref: Ref): Promise<TalmudPageData> {
  const t0 = performance.now();
  const res = await fetch(`/api/daf/${encodeURIComponent(ref.tractate)}/${ref.page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as TalmudPageData & { _source?: string };
  const ms = Math.round(performance.now() - t0);
  // The worker emits x-cache: hit|miss|partial reflecting KV state across
  // the three slice reads. 'partial' (some hit, some miss) renders as
  // 'miss' since at least one upstream fetch ran.
  const xCache = res.headers.get('x-cache');
  const cache: 'hit' | 'miss' = xCache === 'hit' ? 'hit' : 'miss';
  const cacheDetail = xCache === 'partial' ? ' (partial)' : '';
  const detail = `${ref.tractate} ${ref.page} · ${json._source ?? 'unknown'}${cacheDetail}`;
  recordStage('daf-fetch', 'Daf fetch', ms, { cache, detail });
  return json;
}

interface ActiveWord {
  word: string;
  anchor: { top: number; left: number; bottom: number; right: number };
  els: HTMLElement[];
  hebrewBefore: string;
  hebrewAfter: string;
  /** Sefaria segment index (from data-seg on the first clicked .daf-word). */
  segIdx?: number;
}

// Merges a Range's per-word client rects into one band per line and paints
// them as absolute-positioned divs into `overlay`. Coordinates are resolved
// against `origin` (which must be a positioned ancestor of `overlay`).
function paintRangeOverlay(
  overlay: HTMLElement,
  origin: HTMLElement,
  ranges: Range[],
  kind: 'section' | 'halacha' | 'aggadata' | 'pesuk' | 'rishonim' | 'move' | 'commentary' | 'commentary-active' | 'comm-anchor',
  /** Optional per-range inline background color. */
  bgFor?: (rangeIdx: number) => string | undefined,
): void {
  if (ranges.length === 0) return;
  const originRect = origin.getBoundingClientRect();
  // getClientRects() returns visually-scaled coordinates when an ancestor is
  // CSS-transformed (mobile fit-to-width). The band divs are appended inside
  // that same transformed frame, so writing scaled px would scale a second
  // time. Divide deltas/dimensions by the effective scale (visual width /
  // layout width) to cancel it. scale === 1 on desktop → no-op.
  const scale = origin.offsetWidth > 0 ? originRect.width / origin.offsetWidth : 1;
  // Rects on the same visual line share a `top` within a few px (hebrew
  // diacritics, anchors, etc. can nudge it). Half a line-height is a safe
  // bucketing tolerance.
  const TOL = 6;
  for (let ri = 0; ri < ranges.length; ri++) {
    const range = ranges[ri];
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (rects.length === 0) continue;
    const lines: DOMRect[][] = [];
    for (const r of rects) {
      const line = lines.find((l) => Math.abs(l[0].top - r.top) <= TOL);
      if (line) line.push(r);
      else lines.push([r]);
    }
    const bands = lines.map((line) => {
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      for (const r of line) {
        if (r.left < left) left = r.left;
        if (r.right > right) right = r.right;
        if (r.top < top) top = r.top;
        if (r.bottom > bottom) bottom = r.bottom;
      }
      return { left, right, top, bottom };
    });
    // Extend each band's bottom to the next band's top so multi-line ranges
    // read as one continuous block (fills the inter-line line-height gap).
    // Leaves a small diagonal notch when first/last line is partial-width.
    bands.sort((a, b) => a.top - b.top);
    for (let i = 0; i < bands.length - 1; i++) {
      bands[i].bottom = bands[i + 1].top;
    }
    const bg = bgFor?.(ri);
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const el = document.createElement('div');
      el.className = `daf-range-highlight daf-range-highlight-${kind}`;
      if (i === 0) el.classList.add('daf-range-highlight-first');
      if (i === bands.length - 1) el.classList.add('daf-range-highlight-last');
      el.style.left = `${(b.left - originRect.left) / scale}px`;
      el.style.top = `${(b.top - originRect.top) / scale}px`;
      el.style.width = `${(b.right - b.left) / scale}px`;
      el.style.height = `${(b.bottom - b.top) / scale}px`;
      if (bg) el.style.backgroundColor = bg;
      overlay.appendChild(el);
    }
  }
}

const MAX_PHRASE_WORDS = 20;
const CONTEXT_WINDOW_WORDS = 30;

/** Side-column normalization for matching a Sefaria commentary's textHe
 *  against the rendered HebrewBooks Rashi/Tosafot column. Strips nikkud,
 *  Hebrew gereshim, final-letter variants, and all punctuation — same
 *  shape as the alignment module's `normalizeHebrew`. */
const SIDE_FINAL_MAP: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
function sideColumnNormalize(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/[֑-ׇװ-״]/g, '')
    .replace(/[ךםןףץ]/g, (m) => SIDE_FINAL_MAP[m] ?? m)
    .replace(/[^א-ת\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Locate a single commentary comment inside a side-column span stream by
 *  matching its first few normalized words. Extends the match as far as
 *  consecutive words agree. Returns the Range + the end index (for the
 *  caller to advance its search pointer). */
function findCommentRangeInColumn(
  spans: HTMLElement[],
  colNorm: string[],
  commentTextHe: string,
  searchFrom: number,
): { range: Range; endIdx: number } | null {
  const commentWords = sideColumnNormalize(commentTextHe).split(' ').filter(Boolean);
  if (commentWords.length < 2) return null;
  const probeLen = Math.min(4, commentWords.length);
  for (let i = Math.max(0, searchFrom); i <= colNorm.length - probeLen; i++) {
    let ok = true;
    for (let k = 0; k < probeLen; k++) {
      if (colNorm[i + k] !== commentWords[k]) { ok = false; break; }
    }
    if (!ok) continue;
    // Greedily extend the match; stop at first word that drifts.
    let end = i + probeLen;
    let cj = probeLen;
    while (end < colNorm.length && cj < commentWords.length) {
      if (colNorm[end] !== commentWords[cj]) break;
      end++; cj++;
    }
    const range = document.createRange();
    range.setStartBefore(spans[i]);
    range.setEndAfter(spans[end - 1]);
    return { range, endIdx: end };
  }
  return null;
}

/** Walk the daf text and collect up to N .daf-word text contents immediately
 *  before the first selected element, and N immediately after the last selected
 *  element. Scoped to the main column (ignores Rashi / Tosafot neighbors). */
function collectSurroundingHebrew(els: HTMLElement[], windowSize = CONTEXT_WINDOW_WORDS): { before: string; after: string } {
  if (els.length === 0) return { before: '', after: '' };
  const mainRoot = els[0].closest('.daf-main .daf-text');
  if (!mainRoot) return { before: '', after: '' };
  const all = Array.from(mainRoot.querySelectorAll<HTMLElement>('.daf-word'));
  const first = all.indexOf(els[0]);
  const last = all.indexOf(els[els.length - 1]);
  if (first < 0 || last < 0) return { before: '', after: '' };
  const pick = (range: HTMLElement[]) => range.map((e) => (e.textContent ?? '').trim()).filter(Boolean).join(' ');
  return {
    before: pick(all.slice(Math.max(0, first - windowSize), first)),
    after: pick(all.slice(last + 1, last + 1 + windowSize)),
  };
}

// Module-level session caches shared across remounts. Bounded with LRU
// eviction so they restore instantly on back-nav / language flip but don't
// grow without limit over a long session (one entry per daf × lang). ~16 dapim
// per language is far more than any realistic back-nav window.
import type { IdentifiedRabbi } from './dafContext';
import { LruMap } from '../lib/lruMap';

const SESSION_CACHE_MAX = 32;
const analysisSessionCache = new LruMap<string, DafAnalysis>(SESSION_CACHE_MAX);
const halachaSessionCache = new LruMap<string, HalachaResult>(SESSION_CACHE_MAX);
const aggadataSessionCache = new LruMap<string, AggadataResult>(SESSION_CACHE_MAX);
const pesukimSessionCache = new LruMap<string, PesukimResult>(SESSION_CACHE_MAX);

const GEN_KEY = 'daf.showGenMarkers';
const COMMENTARIES_KEY = 'daf.toggle.commentaries';
const ARGUMENTS_KEY = 'daf.toggle.arguments';
const HALACHOT_KEY = 'daf.toggle.halachot';
const AGGADATOT_KEY = 'daf.toggle.aggadatot';
const PESUKIM_KEY = 'daf.toggle.pesukim';
function loadToggle(key: string, def: boolean): boolean {
  if (typeof localStorage === 'undefined') return def;
  const v = localStorage.getItem(key);
  return v === null ? def : v === 'true';
}

/** Pill-shaped toggle switch for the daf picker. Persistence is handled by
 *  the caller via createEffect + localStorage. */
function ToggleSwitch(props: { label: string; value: boolean; onChange: (next: boolean) => void }): JSX.Element {
  return (
    <label class="daf-toggle" data-on={props.value ? 'true' : 'false'} title={props.label}>
      <input
        type="checkbox"
        checked={props.value}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span class="daf-toggle-track" aria-hidden="true">
        <span class="daf-toggle-thumb" />
      </span>
      <span class="daf-toggle-label">{props.label}</span>
    </label>
  );
}

/** Find all .daf-word elements that intersect the given Range. */
function collectSnappedWords(range: Range): HTMLElement[] {
  const out: HTMLElement[] = [];
  const all = document.querySelectorAll<HTMLElement>('.daf-word');
  for (const el of all) {
    if (range.intersectsNode(el)) out.push(el);
  }
  return out;
}

export default function DafViewer(): JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const [tractate, setTractate] = createSignal(params.get('tractate') ?? 'Berakhot');
  const [page, setPage] = createSignal(params.get('page') ?? '2a');
  const [active, setActive] = createSignal<ActiveWord | null>(null);

  // Daf sizing. On desktop, scale down for narrow viewports; on phones the
  // daf stays at full 520px and the wrapping .daf-surface scrolls
  // horizontally (with browser pinch-zoom) so the traditional Tzurat
  // HaDaf layout is preserved verbatim.
  // 16px main padding × 2 + 12px edge-icon slack × 2 = 56px clearance so
  // edge-positioned gutter icons stay on-screen on narrow desktops.
  const [viewportW, setViewportW] = createSignal(window.innerWidth);
  onMount(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  });
  const dafWidth = () => {
    if (viewportW() <= 767) return 520;
    return Math.min(520, Math.max(280, viewportW() - 56));
  };

  // Mobile fit-to-width: the daf is rendered at its sacred 520px and then
  // visually scaled down (CSS transform) so the whole page fits on load —
  // the user pinch-zooms in from there. Desktop reflows via dafWidth instead,
  // so scale stays 1. `surfaceW` is the measured available width of the
  // scroll surface; `dafNaturalH` is the un-scaled rendered daf height,
  // needed to size the wrapper so page flow below the daf is correct.
  // NOTE: transforming the daf double-scales any overlay painted from
  // getBoundingClientRect deltas — paintRangeOverlay and GutterIcons both
  // divide by the measured ancestor scale to compensate.
  // Seed with an innerWidth-based estimate (minus rough section padding) so
  // the first mobile paint is already scaled; the ResizeObserver refines it.
  const [surfaceW, setSurfaceW] = createSignal(
    typeof window !== 'undefined' && window.innerWidth <= 767 ? window.innerWidth - 24 : 0,
  );
  const [dafNaturalH, setDafNaturalH] = createSignal(0);
  const dafScale = () => {
    if (viewportW() > 767) return 1;
    const w = surfaceW();
    if (w <= 0) return 1;
    return Math.min(1, w / 520);
  };
  let surfaceEl: HTMLDivElement | undefined;
  onMount(() => {
    if (typeof ResizeObserver === 'undefined' || !surfaceEl) return;
    const ro = new ResizeObserver(() => {
      if (surfaceEl) setSurfaceW(surfaceEl.clientWidth);
    });
    ro.observe(surfaceEl);
    setSurfaceW(surfaceEl.clientWidth);
    onCleanup(() => ro.disconnect());
  });

  const ref = createMemo<Ref>(() => ({ tractate: tractate(), page: page() }));
  const [daf] = createResource(ref, fetchDaf);

  // Per-daf rabbi list — derived from the `rabbi` mark run (see dafRabbis()
  // below). The legacy /api/daf-context fetch + its dafContext signal were
  // removed; the mark + rabbi.identity enrichment are the single source now.
  // Defaults flipped to false — fresh users see an unannotated daf, then
  // opt into individual layers via the marks panel. Existing users keep
  // their persisted state in localStorage.
  const [showGenMarkers, setShowGenMarkers] = createSignal(loadToggle(GEN_KEY, false));
  const [showCommentaries, setShowCommentaries] = createSignal(loadToggle(COMMENTARIES_KEY, false));
  const [showArguments, setShowArguments] = createSignal(loadToggle(ARGUMENTS_KEY, false));
  const [showHalachot, setShowHalachot] = createSignal(loadToggle(HALACHOT_KEY, false));
  const [showAggadatot, setShowAggadatot] = createSignal(loadToggle(AGGADATOT_KEY, false));
  const [showPesukim, setShowPesukim] = createSignal(loadToggle(PESUKIM_KEY, false));
  // Dev shelf — bottom drawer with marks toggles + activity panels.
  const [devOpen, setDevOpen] = createSignal(readDevMode());

  // Adapter: derive analysis() from the new registry-driven `argument` mark
  // run output. The new schema is { instances: [{startSegIdx, endSegIdx,
  // fields: { title, summary, excerpt, rabbiNames }}] } — we map it to the
  // legacy DafAnalysis shape so existing gutter+sidebar rendering continues
  // to work. rabbiNames map to per-section rabbi entries with empty rich
  // fields (period/location/role/opinionStart will come from a follow-up
  // per-section enrichment).
  createEffect(() => {
    const runs = markRunsByMarkId();
    const argRun = runs['argument'];
    if (!argRun?.parsed) return;
    const p = argRun.parsed as {
      summary?: string;
      instances?: Array<{
        startSegIdx: number;
        endSegIdx: number;
        fields: { title: string; summary: string; excerpt: string; rabbiNames?: string[] };
      }>;
    };
    if (!Array.isArray(p.instances)) return;
    // Collapse a doubled / overlapping section partition (the Shabbat 126a
    // class: the argument extractor occasionally emits its partition twice).
    // Without this, an already-cached doubled blob renders duplicate gutter
    // icons and duplicate sidebar sections. Mirrors the server's
    // postProcessArgument so client + worker agree on the partition.
    const lastSeg = Math.max(0, ...p.instances.map((i) => i.endSegIdx));
    const cleanInstances = partitionSections(p.instances, lastSeg);
    const sections: Section[] = cleanInstances.map((inst) => ({
      title: inst.fields.title,
      summary: inst.fields.summary,
      excerpt: inst.fields.excerpt,
      startSegIdx: inst.startSegIdx,
      endSegIdx: inst.endSegIdx,
      rabbis: (inst.fields.rabbiNames ?? []).map((name) => ({
        name,
        nameHe: '',
        period: '',
        location: '',
        role: '',
        opinionStart: '',
      })),
    }));
    const adapted: DafAnalysis = { summary: p.summary ?? '', sections };
    setAnalysis(adapted);
    analysisSessionCache.set(`${tractate()}:${page()}:${lang()}`, adapted);
  });

  // Adapter: halacha mark instances → HalachaResult shape consumed by the
  // gutter+sidebar renderer.
  createEffect(() => {
    const runs = markRunsByMarkId();
    const r = runs['halacha'];
    if (!r?.parsed) return;
    const p = r.parsed as {
      instances?: Array<{
        startSegIdx: number;
        endSegIdx: number;
        fields: { topic: string; topicHe?: string; summary?: string; excerpt?: string };
      }>;
    };
    if (!Array.isArray(p.instances)) return;
    // Defensive: drop exact-duplicate topics (same topic at the same range)
    // a doubled LLM output could emit, without collapsing distinct topics.
    const topicInstances = dedupeBy(
      p.instances,
      (i) => `${i.fields.topic}|${i.startSegIdx}|${i.endSegIdx}`,
    );
    const adapted: HalachaResult = {
      topics: topicInstances.map((inst) => ({
        topic: inst.fields.topic,
        topicHe: inst.fields.topicHe,
        excerpt: inst.fields.excerpt,
        startSegIdx: inst.startSegIdx,
        endSegIdx: inst.endSegIdx,
        rulings: {},
      })),
    };
    setHalacha(adapted);
    halachaSessionCache.set(`${tractate()}:${page()}:${lang()}`, adapted);
  });

  // Adapter: aggadata mark instances → AggadataResult.
  createEffect(() => {
    const runs = markRunsByMarkId();
    const r = runs['aggadata'];
    if (!r?.parsed) return;
    const p = r.parsed as {
      instances?: Array<{
        startSegIdx: number;
        endSegIdx: number;
        fields: {
          title: string;
          titleHe?: string;
          summary: string;
          excerpt: string;
          endExcerpt?: string;
          tokenStart?: number;
          tokenEnd?: number;
          theme?: string;
        };
      }>;
    };
    if (!Array.isArray(p.instances)) return;
    // Defensive: drop exact-duplicate stories (same title at the same range).
    const storyInstances = dedupeBy(
      p.instances,
      (i) => `${i.fields.title}|${i.startSegIdx}|${i.endSegIdx}`,
    );
    const adapted: AggadataResult = {
      stories: storyInstances.map((inst) => ({
        title: inst.fields.title,
        titleHe: inst.fields.titleHe,
        summary: inst.fields.summary,
        excerpt: inst.fields.excerpt,
        endExcerpt: inst.fields.endExcerpt,
        startSegIdx: inst.startSegIdx,
        endSegIdx: inst.endSegIdx,
        tokenStart: inst.fields.tokenStart,
        tokenEnd: inst.fields.tokenEnd,
        theme: inst.fields.theme,
      })),
    };
    setAggadata(adapted);
    aggadataSessionCache.set(`${tractate()}:${page()}:${lang()}`, adapted);
  });

  // Adapter: pesukim mark instances → PesukimResult.
  createEffect(() => {
    const runs = markRunsByMarkId();
    const r = runs['pesukim'];
    if (!r?.parsed) return;
    const p = r.parsed as {
      instances?: Array<{
        startSegIdx: number;
        endSegIdx: number;
        fields: {
          verseRef?: string;
          citationStyle?: string;
          excerpt?: string;
          endExcerpt?: string;
          summary?: string;
          tokenStart?: number;
          tokenEnd?: number;
        };
      }>;
    };
    if (!Array.isArray(p.instances)) return;
    // Defensive: drop exact-duplicate citations (same verse, same spot, same
    // excerpt). The location is in the key so the same verse cited at two
    // different points on the daf is preserved.
    const pesukimInstances = dedupeBy(
      p.instances,
      (i) => `${i.fields.verseRef ?? ''}|${i.startSegIdx}|${i.endSegIdx}|${i.fields.excerpt ?? ''}`,
    );
    const pesukim = pesukimInstances.map((inst) => ({
      verseRef: inst.fields.verseRef ?? '',
      citationStyle: inst.fields.citationStyle ?? 'explicit',
      excerpt: inst.fields.excerpt ?? '',
      endExcerpt: inst.fields.endExcerpt,
      summary: inst.fields.summary ?? '',
      startSegIdx: inst.startSegIdx,
      endSegIdx: inst.endSegIdx,
      tokenStart: inst.fields.tokenStart,
      tokenEnd: inst.fields.tokenEnd,
    })) as unknown as PesukimResult['pesukim'];
    const adapted: PesukimResult = { pesukim };
    setPesukim(adapted);
    pesukimSessionCache.set(`${tractate()}:${page()}:${lang()}`, adapted);
  });

  // Bridge: when a code-defined registry mark is enabled (rabbi already has
  // its own renderer; argument/halacha/aggadata/pesukim still rely on the
  // legacy createResource + sidebar code paths), flip the corresponding
  // legacy signal so the existing rendering kicks in. When the registry
  // mark is disabled, flip it off. This is the transitional glue while the
  // four segment-range marks remain `legacy-endpoint` proxies.
  createEffect(() => {
    const ids = new Set(enabledMarkDefs().map((m) => m.id));
    const want = (id: string) => ids.has(id);
    // showGenMarkers gates a CSS class (`daf-no-rabbi-underlines`) that
    // hides the rabbi-underline spans. Without this bridge the renderer
    // dispatcher injects the markup correctly but CSS keeps it invisible.
    if (showGenMarkers() !== want('rabbi')) setShowGenMarkers(want('rabbi'));
    if (showArguments() !== want('argument')) setShowArguments(want('argument'));
    if (showHalachot() !== want('halacha')) setShowHalachot(want('halacha'));
    if (showAggadatot() !== want('aggadata')) setShowAggadatot(want('aggadata'));
    if (showPesukim() !== want('pesukim')) setShowPesukim(want('pesukim'));
  });

  // Cities matched on this daf, derived from the `places` mark's run output.
  // Replaces the heuristic injectCityMarkers placeMatches set. Returns null
  // when the mark hasn't yielded yet (so GeographyMap can show a loading state).
  const placesMatchedFromMark = (): Set<string> => {
    const run = markRunsByMarkId()['places'];
    const out = new Set<string>();
    if (!run?.parsed?.instances) return out;
    for (const inst of run.parsed.instances) {
      const name = String(inst.fields?.name ?? '').trim();
      if (name) out.add(name);
    }
    return out;
  };

  // Prefetch trigger: once the daf's anchor marks have settled (none still
  // loading), warm the section-level syntheses + suggested-questions so the
  // reader doesn't wait on a cold generation when they open a sidebar. The
  // signature (daf + per-mark instance counts) guards against re-firing and
  // self-corrects if a daf change briefly leaves stale mark runs visible — the
  // generation-guarded prefetchDaf supersedes any stale cohort.
  let lastPrefetchSig = '';
  createEffect(() => {
    const t = tractate();
    const p = page();
    const statuses = markStatuses();
    const relevant = statuses.filter((s) => s.kind !== 'idle');
    if (relevant.length === 0) return;             // no marks enabled / loaded yet
    if (relevant.some((s) => s.kind === 'loading')) return; // anchors not done
    const runs = markRunsByMarkId();
    // The argument-overview warm only fires in dev mode (the chip is dev-only),
    // so dev state is part of the signature — opening dev re-runs and warms it.
    const dev = devOpen();
    const sig = `${t}:${p}:${dev ? 'ov' : ''}|` + Object.entries(runs)
      .map(([m, r]) => `${m}=${(r?.parsed as { instances?: unknown[] } | undefined)?.instances?.length ?? 0}`)
      .sort()
      .join(',');
    if (sig === lastPrefetchSig) return;
    lastPrefetchSig = sig;
    prefetchDaf(t, p, runs, { overview: dev });
  });

  // Comprehensively pre-warm the adjacent dapim on idle so navigating either
  // direction lands on a fully-cached page: the assembled text (instant render)
  // plus a server-side deep-warm (marks + every per-instance enrichment up to
  // suggested-questions, cache-respecting). Fired ~2.5s after the daf settles
  // and aborted on daf change so we don't warm a page the reader has left.
  // lang() is tracked so a language switch re-warms the neighbours in the new
  // language.
  createEffect(() => {
    const t = tractate();
    const p = page();
    const l = lang();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      for (const np of [nextPage(p), prevPage(p)]) {
        // Prime the assembled-daf cache (zero LLM cost) for instant render.
        void fetch(`/api/daf/${encodeURIComponent(t)}/${np}`, { signal: controller.signal }).catch(() => {});
        // Deep-warm marks + enrichments (cache-respecting — a settled neighbour
        // is just KV reads).
        void fetch('/api/warm-daf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tractate: t, page: np, lang: l }),
          signal: controller.signal,
        }).catch(() => {});
      }
    }, 2500);
    onCleanup(() => { clearTimeout(timer); controller.abort(); });
  });

  // The `rabbi` mark run (post-augmentWithKnownRabbis) is the single source of
  // identified rabbis on the daf.
  const rabbiMarkInstances = createMemo(() => {
    const parsed = markRunsByMarkId()['rabbi']?.parsed as {
      instances?: Array<{ excerpt?: string; fields?: { name?: string; nameHe?: string; generation?: GenerationId } }>;
    } | undefined;
    return parsed?.instances ?? [];
  });

  // Underline injection + timeline take a GenerationRabbi[]; derive it from the
  // rabbi mark (every occurrence, no dedup — underlines wrap each match).
  const generations = createMemo<GenerationRabbi[] | null>(() => {
    const insts = rabbiMarkInstances();
    if (insts.length === 0) return null;
    return insts
      .map((i) => ({
        name: String(i.fields?.name ?? ''),
        nameHe: String(i.fields?.nameHe ?? i.excerpt ?? ''),
        generation: (i.fields?.generation ?? 'unknown') as GenerationId,
      }))
      .filter((r) => r.nameHe || r.name);
  });

  // Daf rabbi list as IdentifiedRabbi[] for the sidebar + routing. Thin —
  // slug/region/places are null/empty here; the per-rabbi bio sidebar fills
  // them from the rabbi.identity enrichment when a rabbi is opened. Deduped
  // by canonical name.
  const dafRabbis = createMemo<IdentifiedRabbi[]>(() => {
    const seen = new Set<string>();
    const out: IdentifiedRabbi[] = [];
    for (const i of rabbiMarkInstances()) {
      const name = String(i.fields?.name ?? '');
      const nameHe = String(i.fields?.nameHe ?? i.excerpt ?? '');
      const dedupKey = name || nameHe;
      if (!dedupKey || seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      out.push({
        slug: null, name, nameHe,
        generation: (i.fields?.generation ?? 'unknown') as GenerationId,
        region: null, places: [], moved: null, bio: null, image: null, wiki: null,
      });
    }
    return out;
  });

  // TODO(geography-rederive): the rabbiPlaces memo previously fed
  // GeographyMap from the legacy dafContext fetch. Removed pending a
  // proper rebuild from per-rabbi `rabbi.geography` enrichment data.

  // Argument / halacha / aggadata / pesukim state — populated by the
  // registry-mark adapter effects from `markRunsByMarkId()`. Loading and
  // error states are surfaced via `markStatuses()` from the registry.
  const [analysis, setAnalysis] = createSignal<DafAnalysis | null>(null);
  const [halacha, setHalacha] = createSignal<HalachaResult | null>(null);
  const [aggadata, setAggadata] = createSignal<AggadataResult | null>(null);
  const [pesukim, setPesukim] = createSignal<PesukimResult | null>(null);

  // Other-commentary state (Sefaria links). Driven by the picker in the
  // right sidebar and the data-seg alignment in the daf text.
  const [commentaryWorks, setCommentaryWorks] = createSignal<CommentaryWork[] | null>(null);
  const [commentariesLoading, setCommentariesLoading] = createSignal(false);
  const [activeCommentaryWork, setActiveCommentaryWork] = createSignal<string | null>(null);
  // Segment currently expanded inside the CommentaryPicker card (not in the
  // argument/halacha/rabbi sidebar). `null` means dropdown-only; a number
  // means the picker card expands to show that segment's comments inline.
  const [activeCommentarySegIdx, setActiveCommentarySegIdx] = createSignal<number | null>(null);

  // Sidebar state — a navigation stack. The TOP of the stack is the view
  // currently rendered. Most callers replace the stack outright (a gutter
  // click opens a fresh argument); cross-enrichment jumps (rabbi chip
  // inside an argument, bio link inside a rabbi) PUSH so the back chip
  // can pop them and restore the previous view.
  const [sidebarStack, setSidebarStack] = createSignal<SidebarContent[]>([]);
  const sidebar = (): SidebarContent | null => {
    const s = sidebarStack();
    return s.length > 0 ? s[s.length - 1] : null;
  };
  const setSidebar = (content: SidebarContent | null) => {
    setSidebarStack(content ? [content] : []);
  };
  const pushSidebar = (content: SidebarContent) => {
    setSidebarStack((s) => {
      // Skip a redundant push if the top of stack is already this exact
      // entry (same kind + same primary id). Cheap idempotence so a
      // double-click on a chip doesn't pile duplicates.
      const top = s[s.length - 1];
      if (top && sidebarKey(top) === sidebarKey(content)) return s;
      return [...s, content];
    });
  };
  const popSidebar = () => {
    setSidebarStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };
  // Short label for a stack entry — used to title the back chip so the
  // user sees what they're returning to.
  const sidebarLabel = (c: SidebarContent): string => {
    if (c.kind === 'argument') return c.section.title || 'Argument';
    if (c.kind === 'halacha') return c.topic.topic || 'Halacha';
    if (c.kind === 'aggadata') return c.story.title || 'Aggada';
    if (c.kind === 'pesuk') return c.pasuk.verseRef || 'Pasuk';
    if (c.kind === 'rabbi') return c.rabbi.name || 'Rabbi';
    if (c.kind === 'place') return c.place.fields.name || 'Place';
    if (c.kind === 'voice-group') return c.group.name;
    if (c.kind === 'rishonim') return `Rishonim · seg ${c.instance.segIdx + 1}`;
    if (c.kind === 'argument-overview') return t('overview.chip');
    return 'Back';
  };
  const sidebarKey = (c: SidebarContent): string => {
    if (c.kind === 'argument') return `argument:${c.section.startSegIdx}-${c.section.endSegIdx}`;
    if (c.kind === 'halacha') return `halacha:${c.topic.topic}`;
    if (c.kind === 'aggadata') return `aggadata:${c.story.title}`;
    if (c.kind === 'pesuk') return `pesuk:${c.pasuk.verseRef}`;
    if (c.kind === 'rabbi') return `rabbi:${c.rabbi.slug ?? c.rabbi.name}`;
    if (c.kind === 'place') return `place:${c.place.fields.name}`;
    if (c.kind === 'voice-group') return `voice-group:${c.group.name}`;
    if (c.kind === 'rishonim') return `rishonim:${c.instance.segIdx}`;
    if (c.kind === 'argument-overview') return 'argument-overview';
    return 'unknown';
  };

  // Whole-daf 'chip' marks (anchor: 'whole-daf', render.kind: 'chip') surface
  // as a button bar above the daf. Clicking opens the mark's daf-level sidebar
  // panel. Generic over the registry — any future chip mark gets a button; the
  // open routing is per-mark id.
  const chipMarks = createMemo(() =>
    enabledMarkDefs().filter((m) => (m.render as { kind?: string }).kind === 'chip'),
  );
  const openChip = (id: string) => {
    if (id === 'argument-overview') setSidebar({ kind: 'argument-overview' });
  };
  // Set by ArgumentSidebar when the user clicks an argument-move card. Paints
  // a yellow band over the move's segment range in the main daf text. When
  // tokenStart/tokenEnd are present, paints just those words within the
  // segment(s) — sub-segment precision when the LLM emitted token offsets
  // (see postProcessArgumentMove in the worker). Cleared on daf change
  // and on sidebar close.
  const [argumentMoveHighlight, setArgumentMoveHighlight] = createSignal<{
    start: number; end: number; key: string;
    tokenStart?: number; tokenEnd?: number;
  } | null>(null);
  const [activeRabbi, setActiveRabbi] = createSignal<string | null>(null);

  // Bidirectional commentary anchor: clicking a daf word lights up the
  // Rashi/Tosafot pieces glossing that segment; clicking a Rashi/Tosafot
  // piece lights up the matching daf segment(s). Sourced from Sefaria's
  // link API via commentaryAnchorIndex.ts. Cleared on daf change.
  const [commentaryAnchorIndex, setCommentaryAnchorIndex] = createSignal<CommentaryAnchorIndex | null>(null);
  const [commAnchorActive, setCommAnchorActive] = createSignal<{
    /** Which side initiated the click. Determines which surface gets the
     *  highlight:
     *    - 'from-main' → only the linked Rashi/Tosafot pieces light up.
     *      The daf itself stays untouched (the user already knows what
     *      they clicked).
     *    - 'from-piece' → the matching daf segment(s) get the continuous
     *      range overlay (same painter argument-move uses) AND the
     *      clicked piece keeps its highlight as the source. */
    direction: 'from-main' | 'from-piece';
    segs: number[];
    pieces: Array<{ comm: 'rashi' | 'tosafot'; key: string }>;
  } | null>(null);


  // Commentary and argument previously shared an aside-reorder signal; now
  // they live in separate regions (commentary = left strip, argument =
  // right aside) so no reordering is needed. Kept as a no-op to minimize
  // churn in the setters that still reference it.
  const setLastInteractedCard = (_v: 'argument' | 'commentary' | null): void => { /* no-op after layout split */ };

  // Mobile-only viewport detection + interaction mode. Default `read` is a
  // quiet survey posture: pan/zoom freely, tap-and-hold for copy/paste, and
  // tap rabbi/city icons to open their drawer — but plain word taps do
  // nothing. `translate` re-enables the desktop word-click translation popup.
  const [isMobile, setIsMobile] = createSignal(
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches,
  );
  const [mobileMode, setMobileMode] = createSignal<MobileInteractionMode>('read');
  createEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    onCleanup(() => mq.removeEventListener('change', update));
  });

  // Geography-driven highlight: when the user clicks a city/region on the
  // GeographyMap, we highlight every rabbi in the set across the whole daf,
  // not scoped to a single argument section.
  const [activeLocation, setActiveLocation] = createSignal<string | null>(null);
  const [activeLocationRabbis, setActiveLocationRabbis] = createSignal<string[]>([]);

  // Transient hover highlight — driven by hovering a row in the Migration
  // list. Additive on top of click-driven highlights so hovering doesn't
  // stomp the sidebar / active-location state the user already committed to.
  const [hoveredRabbi, setHoveredRabbi] = createSignal<string | null>(null);

  // Place-dot highlight: clicking a city dot (not a rabbi dot) lights up
  // every `.city-marker[data-city="<name>"]` in the daf body. Mutually
  // exclusive with the rabbi/location highlights above.
  const [activePlace, setActivePlace] = createSignal<string | null>(null);

  // Ref to the DafRenderer's .daf-root — resolved imperatively because
  // DafRenderer renders it internally.
  const [dafRootEl, setDafRootEl] = createSignal<HTMLElement | null>(null);
  // Track the un-scaled daf height so the mobile scale wrapper can reserve the
  // correct (scaled) vertical space. offsetHeight is a layout value, so it is
  // unaffected by the CSS transform applied to the same element.
  createEffect(() => {
    const root = dafRootEl();
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setDafNaturalH(root.offsetHeight));
    ro.observe(root);
    setDafNaturalH(root.offsetHeight);
    onCleanup(() => ro.disconnect());
  });

  createEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(GEN_KEY, String(showGenMarkers()));
  });
  createEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(COMMENTARIES_KEY, String(showCommentaries()));
  });
  createEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ARGUMENTS_KEY, String(showArguments()));
  });
  createEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(HALACHOT_KEY, String(showHalachot()));
  });
  createEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(AGGADATOT_KEY, String(showAggadatot()));
  });
  createEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PESUKIM_KEY, String(showPesukim()));
  });

  // Turning off arguments/halachot/aggadatot should also dismiss any open
  // sidebar content for that category so the view doesn't strand state.
  createEffect(() => {
    if (!showArguments() && sidebar()?.kind === 'argument') {
      setSidebar(null);
      setActiveRabbi(null);
    }
  });
  createEffect(() => {
    if (!showHalachot() && sidebar()?.kind === 'halacha') {
      setSidebar(null);
      setActiveRabbi(null);
    }
  });
  createEffect(() => {
    if (!showAggadatot() && sidebar()?.kind === 'aggadata') {
      setSidebar(null);
    }
  });
  // Close any pesuk sidebar when the toggle is turned off.
  createEffect(() => {
    if (!showPesukim() && sidebar()?.kind === 'pesuk') setSidebar(null);
  });
  createEffect(() => {
    if (!showCommentaries()) {
      setActiveCommentaryWork(null);
      setActiveCommentarySegIdx(null);
    }
  });

  // Generic fetcher used by both geography and generations endpoints. Probes
  // cache with ?cached_only=1 first to avoid triggering a slow AI call if the
  // daf hasn't been classified yet.
  const runMarkerFetch = <T,>(params: {
    tractate: string;
    page: string;
    urlFor: (cachedOnly: boolean) => string;
    parseOk: (json: unknown) => T | null;
    setData: (data: T | null) => void;
    setLoading: (v: boolean) => void;
    setError: (v: string | null) => void;
  }) => {
    const { tractate: t, page: p, urlFor, parseOk, setData, setLoading, setError } = params;
    const controller = new AbortController();
    const go = async () => {
      const fetchOne = async (cachedOnly: boolean): Promise<T | null> => {
        const res = await fetch(urlFor(cachedOnly), { signal: controller.signal });
        if (res.status === 404) return null;
        const json = (await res.json()) as { error?: string; attempts?: string[] };
        if (!res.ok || json.error) {
          const detail = (json.error ?? '') + ' ' + (json.attempts ?? []).join(' ');
          if (/1031|UpstreamError/i.test(detail)) {
            throw new Error('Cloudflare AI temporarily unavailable (1031).');
          }
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        return parseOk(json);
      };
      try {
        const cached = await fetchOne(true);
        if (t !== tractate() || p !== page()) return;
        if (cached) { setData(cached); return; }
        setLoading(true);
        const fresh = await fetchOne(false);
        if (t !== tractate() || p !== page()) return;
        if (fresh) setData(fresh);
      } catch (err) {
        if (t !== tractate() || p !== page()) return;
        if ((err as Error).name === 'AbortError') return;
        setError(String((err as Error).message ?? err));
      } finally {
        if (t === tractate() && p === page()) setLoading(false);
      }
    };
    void go();
    return () => controller.abort();
  };


  // analysis()/halacha()/aggadata()/pesukim() are now hydrated entirely by
  // the registry-mark adapter effects above (search "Adapter:"). On daf change
  // — or a language switch — we clear the stale data; the adapter effect
  // re-fires once the corresponding mark run lands under the new lang. Session
  // caches are keyed per-lang so back-nav and EN↔HE both restore instantly
  // without showing the other language's text.
  createEffect(() => {
    const t = tractate();
    const p = page();
    const l = lang();
    const key = `${t}:${p}:${l}`;
    setAnalysis(analysisSessionCache.get(key) ?? null);
    setHalacha(halachaSessionCache.get(key) ?? null);
    setAggadata(aggadataSessionCache.get(key) ?? null);
    setPesukim(pesukimSessionCache.get(key) ?? null);
  });

  // Fetch the list of commentaries for this daf (Sefaria links, non-Rashi/
  // Tosafot). Clears any previously-active selection on daf change.
  createEffect(() => {
    const t = tractate();
    const p = page();
    setActiveCommentaryWork(null);
    setActiveCommentarySegIdx(null);
    setCommentaryWorks(null);
    setCommentariesLoading(true);
    const controller = new AbortController();
    fetch(`/api/commentaries/${encodeURIComponent(t)}/${p}`, { signal: controller.signal })
      .then(async (res) => (res.ok ? (await res.json()) as { works?: CommentaryWork[] } : null))
      .then((d) => {
        if (t !== tractate() || p !== page()) return;
        setCommentaryWorks(d?.works ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (t === tractate() && p === page()) setCommentariesLoading(false);
      });
    onCleanup(() => controller.abort());
  });

  // Build a Map<name, GenerationId> so the sidebar can color-code each rabbi.
  const generationByName = createMemo<Map<string, GenerationId>>(() => {
    const m = new Map<string, GenerationId>();
    for (const r of generations() ?? []) m.set(r.name, r.generation);
    return m;
  });

  // Daf-wide rabbi-name pool. Joins dafRabbis() (the rabbi mark) with every
  // name the LLM mentioned in structured fields: argument section.rabbiNames,
  // argument-move.rabbiNames, and argument.voices[].name. Used by the
  // sidebar's RabbiText to make rabbi mentions in enrichment prose clickable
  // even when the rabbi isn't covered by the rabbi-places dataset.
  const dafRabbiNames = createMemo<string[]>(() => {
    const names = new Set<string>();
    for (const r of dafRabbis()) {
      if (r.name) names.add(r.name);
    }
    const runs = markRunsByMarkId();
    const argParsed = runs['argument']?.parsed as {
      instances?: Array<{ fields?: { rabbiNames?: string[] } }>;
    } | undefined;
    for (const inst of argParsed?.instances ?? []) {
      for (const n of inst.fields?.rabbiNames ?? []) if (n) names.add(n);
    }
    const moveParsed = runs['argument-move']?.parsed as {
      instances?: Array<{ fields?: { rabbiNames?: string[]; voice?: string } }>;
    } | undefined;
    for (const inst of moveParsed?.instances ?? []) {
      for (const n of inst.fields?.rabbiNames ?? []) if (n) names.add(n);
    }
    const rabbiParsed = runs['rabbi']?.parsed as {
      instances?: Array<{ fields?: { name?: string } }>;
    } | undefined;
    for (const inst of rabbiParsed?.instances ?? []) {
      if (inst.fields?.name) names.add(inst.fields.name);
    }
    // Collective voices ("Sages", "Tanna Kamma", etc.) always match — they
    // appear in prose constantly but rarely show up in rabbiNames since
    // the LLM treats them as anonymous. pushRabbi routes them to a static
    // descriptive bio via VOICE_GROUPS.
    for (const n of voiceGroupNames()) names.add(n);
    return Array.from(names);
  });

  // Reset sidebar state on daf change.
  createEffect(() => {
    void tractate(); void page();
    // Abort the previous daf's section-prefetch cohort so its queued/polling
    // tasks free the shared enrichment-queue slots immediately; the
    // prefetch-trigger effect re-arms a fresh cohort once the new daf's marks
    // settle.
    cancelPrefetch();
    setSidebar(null);
    setActiveRabbi(null);
    setActiveLocation(null);
    setActiveLocationRabbis([]);
    setActivePlace(null);
    setArgumentMoveHighlight(null);
    setCommAnchorActive(null);
    setCommentaryAnchorIndex(null);
  });

  // Close any open sidebar when the language flips. Its contents are being
  // re-fetched under the new lang (see the per-lang adapter + enrichment-card
  // logic), so the stale panel — still showing the old language's text —
  // shouldn't linger. Skip the initial run (nothing is open at mount).
  let langInited = false;
  createEffect(() => {
    void lang();
    if (!langInited) { langInited = true; return; }
    setSidebar(null);
    setArgumentMoveHighlight(null);
  });

  // Fetch the bidirectional commentary anchor index for the current daf
  // (Sefaria links → segToPieces + pieceToSegs maps). Session-cached
  // inside the helper, so re-mounts within a single page session are
  // free. Silently noops on fetch failure — the bidirectional anchor is
  // a best-effort affordance, not load-bearing.
  createEffect(() => {
    const t = tractate();
    const p = page();
    if (!t || !p) return;
    void (async () => {
      try {
        const idx = await fetchCommentaryAnchorIndex(t, p);
        // Discard the result if the user changed daf mid-fetch.
        if (t !== tractate() || p !== page()) return;
        setCommentaryAnchorIndex(idx);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[commentary-anchor] failed to fetch index:', err);
      }
    })();
  });

  // Tracks the selection identity (sidebar item + optional sub-move) we last
  // auto-scrolled into view on mobile, so repaints from hover / resize / late
  // font-load don't re-yank the scroll position. Reset to null when the
  // selection clears so reopening the same item scrolls again.
  let lastScrolledSelKey: string | null = null;

  // Apply all highlights (section / halacha range + per-rabbi accent) based
  // on the current sidebar + activeRabbi state. Range tints are drawn as
  // absolute-positioned overlay divs computed from Range.getClientRects() so
  // multi-word spans read as one continuous band — no per-word gaps from
  // .daf-word padding, no unpainted justification whitespace.
  const applyHighlights = () => {
    const s = sidebar();
    const name = activeRabbi();
    if (typeof document === 'undefined') return;
    const root = dafRootEl();
    if (!root) return;

    const dafRootDiv = root.querySelector<HTMLElement>('.daf-root') ?? root;

    // Clear prior rabbi-name highlights.
    dafRootDiv.querySelectorAll('.rabbi-underline.rabbi-highlighted').forEach((el) =>
      el.classList.remove('rabbi-highlighted'),
    );
    // Clear prior city-name highlights.
    dafRootDiv.querySelectorAll('.city-marker.city-highlighted').forEach((el) =>
      el.classList.remove('city-highlighted'),
    );

    const sectionRanges: Range[] = [];
    const halachaRanges: Range[] = [];
    const aggadataRanges: Range[] = [];
    const pesukRanges: Range[] = [];
    const rishonimRanges: Range[] = [];
    const moveRanges: Range[] = [];
    const commentaryRanges: Range[] = [];
    const commentaryActiveRanges: Range[] = [];
    /** Continuous band painted over the daf seg(s) that a clicked
     *  Rashi/Tosafot piece anchors to. Populated only when
     *  commAnchorActive.direction === 'from-piece'. */
    const commAnchorRanges: Range[] = [];

    const collectRange = (range: Range, bucket: 'section' | 'halacha' | 'aggadata' | 'pesuk' | 'rishonim') => {
      if (range.collapsed) return;
      if (bucket === 'section') sectionRanges.push(range);
      else if (bucket === 'halacha') halachaRanges.push(range);
      else if (bucket === 'aggadata') aggadataRanges.push(range);
      else if (bucket === 'pesuk') pesukRanges.push(range);
      else rishonimRanges.push(range);
    };

    // Build a Range covering all `.daf-word[data-seg=N]` spans (first→last) in
    // the given column. Returns null if the segment has no tagged words.
    const rangeForSegment = (columnRoot: HTMLElement | null, segIdx: number): Range | null => {
      if (!columnRoot) return null;
      const spans = columnRoot.querySelectorAll<HTMLElement>(`.daf-word[data-seg="${segIdx}"]`);
      if (spans.length === 0) return null;
      const range = document.createRange();
      range.setStartBefore(spans[0]);
      range.setEndAfter(spans[spans.length - 1]);
      return range;
    };

    // ── Sidebar-card highlight ──────────────────────────────────────────
    // The daf-text range(s) tinted for the currently-open sidebar card,
    // dispatched on sidebar().kind (+ activeRabbi for the per-rabbi argument
    // case). Each kind resolves its span differently — opinion anchors, an
    // excerpt-length marker walk, a token range, or a single segment — so they
    // stay as distinct blocks rather than one forced union. The move /
    // commentary / rabbi-class highlights further below are independent of
    // sidebar().kind and intentionally remain separate.
    //
    // Argument: whole section (no rabbi) or a single rabbi's opinion range(s).
    // Skip the section-wide tint when the user has clicked a specific
    // sub-section card — the move-range highlight (painted below) is the
    // more specific selection and stacking the two reads as one large blob.
    //
    // The section's true span lives on the Section object as
    // (startSegIdx, endSegIdx) — both anchored server-side to the LLM's
    // verbatim Hebrew (excerpt + endExcerpt, resolved by
    // postProcessArgument). Paint by walking the .daf-word spans for that
    // seg range. The earlier implementation painted "from this section's
    // start anchor to the NEXT section's start anchor" which (a) ignored
    // endSegIdx entirely and (b) for the last section had no "next anchor"
    // and ran to the end of mainText — i.e. highlighted the whole rest of
    // the daf. The per-rabbi case still uses per-opinion anchors since
    // those mark sub-section positions the seg range can't express.
    if (s?.kind === 'argument' && !argumentMoveHighlight()) {
      const a = analysis();
      const section = a?.sections?.[s.index];
      const mainCol = dafRootDiv.querySelector<HTMLElement>('.daf-main .daf-text');

      const startSeg = section?.startSegIdx;
      const endSeg = section?.endSegIdx;
      const hasRange = section && mainCol && typeof startSeg === 'number' && typeof endSeg === 'number';

      if (hasRange && name) {
        // Per-rabbi sub-section paint. Per-opinion anchors still drive this
        // because opinionStart sits inside the section, not at seg boundaries.
        const sectionOpinions = Array.from(
          dafRootDiv.querySelectorAll<HTMLElement>(
            `.daf-opinion-anchor[data-section-idx="${s.index}"]`,
          ),
        );
        let painted = 0;
        const rangeBetween = (start: Node, end: Node | null): Range | null => {
          const range = document.createRange();
          range.setStartAfter(start);
          if (end) range.setEndBefore(end);
          else {
            // Bound by the section's last word, not the end of mainText.
            const lastWords = mainCol.querySelectorAll<HTMLElement>(
              `.daf-word[data-seg="${endSeg}"]`,
            );
            if (lastWords.length === 0) return null;
            range.setEndAfter(lastWords[lastWords.length - 1]);
          }
          return range;
        };
        for (let i = 0; i < sectionOpinions.length; i++) {
          const op = sectionOpinions[i];
          if (op.getAttribute('data-rabbi') !== name) continue;
          const next = sectionOpinions[i + 1] ?? null;
          const range = rangeBetween(op, next);
          if (range) { collectRange(range, 'section'); painted++; }
        }
        // No opinion anchors hit — fall back to the whole section.
        if (painted === 0) {
          const range = buildTokenRange(mainCol, startSeg, endSeg);
          if (range) collectRange(range, 'section');
        }
      } else if (hasRange) {
        // Whole-section paint: use the seg range directly.
        const range = buildTokenRange(mainCol, startSeg, endSeg);
        if (range) collectRange(range, 'section');
      }
    }

    // Halacha: the 2-4 word excerpt anchored by the injected marker.
    if (s?.kind === 'halacha') {
      const anchor = dafRootDiv.querySelector<HTMLElement>(
        `.daf-halacha-anchor[data-idx="${s.index}"]`,
      );
      const len = Number(anchor?.getAttribute('data-excerpt-len') ?? 0);
      const mainText = dafRootDiv.querySelector<HTMLElement>('.daf-main .daf-text');
      if (anchor && len > 0 && mainText) {
        const words = Array.from(mainText.querySelectorAll<HTMLElement>('.daf-word'));
        const after = words.filter(
          (w) => !!(anchor.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING),
        );
        const target = after.slice(0, len);
        if (target.length > 0) {
          const range = document.createRange();
          range.setStartBefore(target[0]);
          range.setEndAfter(target[target.length - 1]);
          collectRange(range, 'halacha');
        }
      }
    }

    if (s?.kind === 'aggadata') {
      const story = s.story;
      const mainText = dafRootDiv.querySelector<HTMLElement>('.daf-main .daf-text');
      const hasTokens = typeof story.tokenStart === 'number' && typeof story.tokenEnd === 'number'
        && typeof story.startSegIdx === 'number' && typeof story.endSegIdx === 'number';
      if (hasTokens && mainText) {
        // Worker post-processor resolved both anchors to (seg, tok) — paint
        // exactly that span, ignoring the injected anchor markers entirely.
        const r = buildTokenRange(mainText, story.startSegIdx!, story.endSegIdx!, story.tokenStart, story.tokenEnd);
        if (r) collectRange(r, 'aggadata');
      } else {
        const anchor = dafRootDiv.querySelector<HTMLElement>(
          `.daf-aggadata-anchor[data-idx="${s.index}"]`,
        );
        if (anchor && mainText) {
          // Fallback: rely on the injected anchor markers. Prefer the
          // story's explicit closing anchor; otherwise the next story's
          // start; otherwise (worst case) the end of the amud.
          const endAnchor = dafRootDiv.querySelector<HTMLElement>(
            `.daf-aggadata-end-anchor[data-idx="${s.index}"]`,
          );
          const range = document.createRange();
          range.setStartAfter(anchor);
          if (endAnchor) {
            range.setEndAfter(endAnchor);
          } else {
            const allStoryAnchors = Array.from(
              dafRootDiv.querySelectorAll<HTMLElement>('.daf-aggadata-anchor'),
            ).sort((a, b) => Number(a.getAttribute('data-idx') ?? 0) - Number(b.getAttribute('data-idx') ?? 0));
            const pos = allStoryAnchors.findIndex((el) => el === anchor);
            const next = pos >= 0 && pos + 1 < allStoryAnchors.length ? allStoryAnchors[pos + 1] : null;
            if (next) range.setEndBefore(next);
            else range.setEndAfter(mainText);
          }
          collectRange(range, 'aggadata');
        }
      }
    }

    // Pesuk: highlight the citation's start→end span when the matching
    // pasuk is open in the sidebar. Preference order:
    //   1. tokenStart/tokenEnd on the pasuk instance (worker post-
    //      processor wrote them) → exact word-range paint via
    //      buildTokenRange, ignoring the injected anchor markers.
    //   2. Explicit .daf-pesuk-end-anchor (legacy /api/pesukim).
    //   3. Bound by endSegIdx alone (anchor → end of segment).
    //   4. Fall through to the next pesuk anchor (wide upper bound).
    const sidebarPasuk = sidebar()?.kind === 'pesuk' ? sidebar() as Extract<SidebarContent, { kind: 'pesuk' }> : null;
    if (sidebarPasuk) {
      const mainText = dafRootDiv.querySelector<HTMLElement>('.daf-main .daf-text');
      const pasuk = sidebarPasuk.pasuk;
      const hasTokens = typeof pasuk.tokenStart === 'number' && typeof pasuk.tokenEnd === 'number'
        && typeof pasuk.startSegIdx === 'number' && typeof pasuk.endSegIdx === 'number';
      if (hasTokens && mainText) {
        const r = buildTokenRange(mainText, pasuk.startSegIdx!, pasuk.endSegIdx!, pasuk.tokenStart, pasuk.tokenEnd);
        if (r) collectRange(r, 'pesuk');
      } else {
        const anchor = dafRootDiv.querySelector<HTMLElement>(
          `.daf-pesuk-anchor[data-idx="${sidebarPasuk.index}"]`,
        );
        if (anchor && mainText) {
          const endAnchor = dafRootDiv.querySelector<HTMLElement>(
            `.daf-pesuk-end-anchor[data-idx="${sidebarPasuk.index}"]`,
          );
          const range = document.createRange();
          range.setStartAfter(anchor);
          if (endAnchor) {
            range.setEndAfter(endAnchor);
          } else if (typeof pasuk.endSegIdx === 'number') {
            let endSpans: NodeListOf<HTMLElement> | null = null;
            for (let s = pasuk.endSegIdx; s >= (pasuk.startSegIdx ?? s) && !endSpans; s--) {
              const found = mainText.querySelectorAll<HTMLElement>(`.daf-word[data-seg="${s}"]`);
              if (found.length > 0) endSpans = found;
            }
            if (endSpans && endSpans.length > 0) {
              range.setEndAfter(endSpans[endSpans.length - 1]);
            } else {
              const allPesukAnchors = Array.from(
                dafRootDiv.querySelectorAll<HTMLElement>('.daf-pesuk-anchor'),
              ).sort((a, b) => Number(a.getAttribute('data-idx') ?? 0) - Number(b.getAttribute('data-idx') ?? 0));
              const pos = allPesukAnchors.findIndex((el) => el === anchor);
              const next = pos >= 0 && pos + 1 < allPesukAnchors.length ? allPesukAnchors[pos + 1] : null;
              if (next) range.setEndBefore(next);
              else range.setEndAfter(mainText);
            }
          } else {
            const allPesukAnchors = Array.from(
              dafRootDiv.querySelectorAll<HTMLElement>('.daf-pesuk-anchor'),
            ).sort((a, b) => Number(a.getAttribute('data-idx') ?? 0) - Number(b.getAttribute('data-idx') ?? 0));
            const pos = allPesukAnchors.findIndex((el) => el === anchor);
            const next = pos >= 0 && pos + 1 < allPesukAnchors.length ? allPesukAnchors[pos + 1] : null;
            if (next) range.setEndBefore(next);
            else range.setEndAfter(mainText);
          }
          collectRange(range, 'pesuk');
        }
      }
    }

    // Rishonim: tint the single segment the open rishonim card covers. The
    // mark is per-segment (segIdx, not a range), so paint start == end.
    if (s?.kind === 'rishonim') {
      const mainText = dafRootDiv.querySelector<HTMLElement>('.daf-main .daf-text');
      const seg = s.instance.segIdx;
      const r = mainText ? buildTokenRange(mainText, seg, seg) : null;
      if (r) collectRange(r, 'rishonim');
    }

    // Argument-move highlight — set by ArgumentSidebar when the user clicks
    // a subsection card. Paints a yellow band over the move's segment range
    // in the main column. When tokenStart/tokenEnd are present (worker's
    // post-processor extracted them), paints exactly those words within
    // the matching segments — sub-segment precision so multiple moves
    // packaged into one Sefaria segment (Mishnah block) each highlight
    // their own words. Independent of `sidebar` kind so the highlight stays
    // visible while the user reads the per-move synthesis.
    const moveHL = argumentMoveHighlight();
    if (moveHL) {
      const mainCol = dafRootDiv.querySelector<HTMLElement>('.daf-main .daf-text');
      if (mainCol) {
        const r = buildTokenRange(mainCol, moveHL.start, moveHL.end, moveHL.tokenStart, moveHL.tokenEnd);
        if (r) moveRanges.push(r);
      }
    }

    // Daf↔commentary anchor — when the user clicks a Rashi/Tosafot piece,
    // paint a continuous band over the daf seg(s) the piece anchors to.
    // Only active for direction='from-piece' since clicking the daf
    // itself shouldn't re-highlight the daf (that's noisy and redundant).
    const commActive = commAnchorActive();
    if (commActive && commActive.direction === 'from-piece' && commActive.segs.length > 0) {
      const mainCol = dafRootDiv.querySelector<HTMLElement>('.daf-main .daf-text');
      if (mainCol) {
        // Build one range per contiguous seg run. The simplest correct
        // thing: one range per seg. paintRangeOverlay handles per-line
        // banding so multiple segs render as a single visual block when
        // they sit on the same line.
        for (const seg of commActive.segs) {
          const r = buildTokenRange(mainCol, seg, seg);
          if (r) commAnchorRanges.push(r);
        }
      }
    } else if (commActive && commActive.direction === 'from-main' && commActive.pieces.length > 0) {
      // User clicked a daf word → paint a continuous teal band over each
      // Rashi/Tosafot piece that glosses it, in the inner/outer column.
      // Painting a range overlay (rather than a CSS outline on the wrapping
      // .daf-comm-piece span) gives one clean band per line; an inline
      // outline on a span that wraps across lines renders as a separate
      // broken-up box per line fragment, which reads as a glitch.
      for (const p of commActive.pieces) {
        // Piece keys are "S:P" (digits + colon), so a literal selector is fine.
        dafRootDiv
          .querySelectorAll<HTMLElement>(
            `.daf-comm-piece[data-piece-key="${p.key}"][data-comm="${p.comm}"]`,
          )
          .forEach((el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            commAnchorRanges.push(r);
          });
      }
    }

    // Commentary: whenever a work is active, tint every main-text segment
    // the work anchors to (ambient). If a specific segment is currently
    // open in the sidebar, paint it with the darker "active" color.
    //
    // Additionally: when the active work is Rashi or Tosafot, try to paint
    // the actual gloss text in the inner / outer column for each open
    // comment, by finding the comment's textHe as a normalized-word run
    // inside the column's .daf-word spans.
    const activeWork = activeCommentaryWorkObj();
    const openCommentSegIdx = activeCommentarySegIdx();
    const openComments = activeCommentaryComments();
    if (activeWork) {
      const mainColumn = dafRootDiv.querySelector<HTMLElement>('.daf-main .daf-text');
      const coveredSegs = Array.from(commentaryBySegIdx().keys());
      const openSegIdx = openCommentSegIdx ?? -1;
      for (const segIdx of coveredSegs) {
        const r = rangeForSegment(mainColumn, segIdx);
        if (!r) continue;
        if (segIdx === openSegIdx) commentaryActiveRanges.push(r);
        else commentaryRanges.push(r);
      }

      // Side-column painting for Rashi/Tosafot: the open segment's comments
      // are located by substring-matching each comment's Hebrew text against
      // the normalized .daf-word stream of the right column.
      const colSel = activeWork.title === 'Rashi'   ? '.daf-inner .daf-text'
                   : activeWork.title === 'Tosafot' ? '.daf-outer .daf-text'
                   : null;
      if (colSel && openCommentSegIdx !== null && openComments.length > 0) {
        const colRoot = dafRootDiv.querySelector<HTMLElement>(colSel);
        if (colRoot) {
          const spans = Array.from(colRoot.querySelectorAll<HTMLElement>('.daf-word'));
          const colNorm = spans.map((el) => sideColumnNormalize(el.textContent ?? ''));
          let searchFrom = 0;
          for (const comment of openComments) {
            const rr = findCommentRangeInColumn(spans, colNorm, comment.textHe, searchFrom);
            if (rr) {
              commentaryActiveRanges.push(rr.range);
              searchFrom = rr.endIdx;
            }
          }
        }
      }
    }

    // Paint the collected ranges as absolute-positioned overlay divs, one
    // per line of text, merging all the per-word client rects on each line
    // into a single band. This fills the padding dead-zones between .daf-word
    // spans and the justification whitespace that ::highlight() leaves bare.
    let overlay = dafRootDiv.querySelector<HTMLElement>(':scope > .daf-range-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'daf-range-overlay';
      dafRootDiv.appendChild(overlay);
    }
    overlay.replaceChildren();
    paintRangeOverlay(overlay, dafRootDiv, commentaryRanges, 'commentary');
    paintRangeOverlay(overlay, dafRootDiv, commentaryActiveRanges, 'commentary-active');
    paintRangeOverlay(overlay, dafRootDiv, sectionRanges, 'section');
    paintRangeOverlay(overlay, dafRootDiv, halachaRanges, 'halacha');
    paintRangeOverlay(overlay, dafRootDiv, aggadataRanges, 'aggadata');
    paintRangeOverlay(overlay, dafRootDiv, pesukRanges, 'pesuk');
    paintRangeOverlay(overlay, dafRootDiv, rishonimRanges, 'rishonim');
    paintRangeOverlay(overlay, dafRootDiv, moveRanges, 'move');
    paintRangeOverlay(overlay, dafRootDiv, commAnchorRanges, 'comm-anchor');

    // Per-rabbi name accent (yellow) — always applied on top of any tint.
    if (name) {
      const selector = `.rabbi-underline[data-rabbi="${name.replace(/"/g, '\\"')}"]`;
      dafRootDiv.querySelectorAll(selector).forEach((el) => el.classList.add('rabbi-highlighted'));
    }

    // Geography-driven multi-rabbi highlight — light up every mention of
    // each rabbi from the clicked city/region across the whole daf.
    const locRabbis = activeLocationRabbis();
    if (locRabbis.length > 0) {
      for (const rn of locRabbis) {
        const sel = `.rabbi-underline[data-rabbi="${rn.replace(/"/g, '\\"')}"]`;
        dafRootDiv.querySelectorAll(sel).forEach((el) => el.classList.add('rabbi-highlighted'));
      }
    }

    // Transient hover highlight (Migration rows). Additive — applied last so
    // hover always wins visually, and clears when the mouse leaves without
    // touching the click-driven state.
    const hover = hoveredRabbi();
    if (hover) {
      const sel = `.rabbi-underline[data-rabbi="${hover.replace(/"/g, '\\"')}"]`;
      dafRootDiv.querySelectorAll(sel).forEach((el) => el.classList.add('rabbi-highlighted'));
    }

    // Place-dot highlight — light up every mention of the selected city.
    const place = activePlace();
    if (place) {
      const sel = `.city-marker[data-city="${place.replace(/"/g, '\\"')}"]`;
      dafRootDiv.querySelectorAll(sel).forEach((el) => el.classList.add('city-highlighted'));
    }

    // Mobile: when the selection (a section / halacha / aggadata / pesuk, or a
    // sub-move clicked in the shelf) changes, scroll the daf so the
    // highlighted span sits near the top of the viewport — otherwise it
    // routinely lands behind the fixed bottom shelf or off-screen and the
    // user never sees the highlight they just triggered. Keyed on the
    // selection identity so the many non-selection repaints (hover, resize,
    // font-load) don't fight the user's own scrolling.
    const moveKey = argumentMoveHighlight()?.key ?? '';
    const selKey = s ? `${sidebarActiveKey() ?? ''}#${moveKey}` : null;
    if (!selKey) {
      lastScrolledSelKey = null;
    } else if (isMobile() && selKey !== lastScrolledSelKey) {
      lastScrolledSelKey = selKey;
      // Scroll to the topmost *selection* band only (ignore the ambient
      // commentary tint, which can sit higher up the daf).
      const bands = overlay.querySelectorAll<HTMLElement>(
        '.daf-range-highlight-section, .daf-range-highlight-halacha, .daf-range-highlight-aggadata, .daf-range-highlight-pesuk, .daf-range-highlight-move',
      );
      let topY = Infinity;
      bands.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.top < topY) topY = r.top;
      });
      if (topY !== Infinity) {
        // Park the span ~12% down from the top of the viewport: clears the
        // page header while keeping it well above the bottom shelf.
        const desiredTop = window.innerHeight * 0.12;
        window.scrollBy({ top: topY - desiredTop, behavior: 'smooth' });
      }
    }
  };

  createEffect(() => {
    // Re-run when any of these change.
    void tokenized(); void sidebar(); void activeRabbi(); void activeLocationRabbis();
    void hoveredRabbi();
    void activeCommentaryWork();
    void activeCommentarySegIdx();
    void activePlace();
    void argumentMoveHighlight();
    void commAnchorActive();
    // Defer one frame so layout is settled before we measure client rects.
    queueMicrotask(() => queueMicrotask(applyHighlights));
  });

  // Overlay rects are pixel-absolute, so we need to repaint whenever the
  // daf reflows: window resize, column-width changes, or late font loading
  // (Mekorot Vilna loads async and shifts line breaks when it lands).
  createEffect(() => {
    const root = dafRootEl();
    if (!root) return;
    const dafRootDiv = root.querySelector<HTMLElement>('.daf-root') ?? root;
    let rafId = 0;
    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        applyHighlights();
      });
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(dafRootDiv);
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    let cancelled = false;
    fonts?.ready?.then(() => { if (!cancelled) schedule(); });
    onCleanup(() => {
      cancelled = true;
      ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    });
  });


  const tokenized = createMemo(() => {
    // createResource keeps the previous resolved value during a refetch (default
    // behavior). Without gating on loading, switching pages shows stale tokens
    // until the new HTTP request returns — visible as "old daf sticks around".
    if (daf.loading) return null;
    const d = daf();
    if (!d) return null;
    let main = tokenizeHebrewHtml(d.mainText.hebrew);
    // When Sefaria provided per-piece arrays, wrap each piece with a
    // .daf-comm-piece[data-piece-key][data-comm="rashi|tosafot"] span so the
    // commentary↔daf anchor click handler can highlight specific Rashi /
    // Tosafot pieces (rather than the whole column). Falls back to the
    // joined hebrew string when pieces aren't available. The key is
    // Sefaria's 1-based "S:P" ref position ("segment 11, piece 1" →
    // "11:1") so it maps directly to the related-links ref shape. When
    // pieceKeys is missing (pre-v5 cache), we omit the attribute — the
    // click handler treats that as "no anchor data".
    const wrapPieces = (
      pieces: string[] | undefined,
      pieceKeys: string[] | undefined,
      joined: string,
      comm: 'rashi' | 'tosafot',
    ): string => {
      if (!pieces || pieces.length === 0) return tokenizeHebrewHtml(joined);
      return pieces
        .map((p, i) => {
          const key = pieceKeys?.[i];
          const keyAttr = key ? ` data-piece-key="${key}"` : '';
          return `<span class="daf-comm-piece" data-comm="${comm}"${keyAttr}>${tokenizeHebrewHtml(p)}</span>`;
        })
        .join(' ');
    };
    let inner = d.rashi ? wrapPieces(d.rashi.pieces, d.rashi.pieceKeys, d.rashi.hebrew, 'rashi') : '';
    let outer = d.tosafot ? wrapPieces(d.tosafot.pieces, d.tosafot.pieceKeys, d.tosafot.hebrew, 'tosafot') : '';

    // First word of the masechet (always daf 2a) renders as a centered block
    // incipit. Source HTML from HebrewBooks inconsistently marks this word
    // with `.gdropcap` — the helper adds it when missing.
    const { num: pageNumNow, amud: pageAmudNow } = parsePage(page());
    if (pageNumNow === 2 && pageAmudNow === 'a') {
      main = ensureMasechetIncipit(main);
    }

    // Sefaria segment alignment — tag each .daf-word in the main column with
    // `data-seg="<idx>"` so commentary anchors (Rashi/Tosafot/others) can be
    // resolved into concrete span ranges for highlighting.
    const mainSegs = (d as unknown as { mainSegmentsHe?: string[] }).mainSegmentsHe ?? [];
    if (mainSegs.length > 0) {
      const t0 = performance.now();
      const { html, stats } = injectSegmentMarkers(main, mainSegs);
      main = html;
      const ms = Math.round(performance.now() - t0);
      recordStage('sefaria-align', 'Sefaria align', ms, {
        detail: `${stats.alignedSegments}/${stats.totalSegments} segs · ${stats.alignedWords}/${stats.totalWords} words`,
      });
    }

    // Chapter-closing formula "הדרן עלך ..." renders as its own centered
    // line at a larger size. Applied to the main column AND the commentaries
    // (Rashi/Tosafot can carry their own chapter boundary when a commentary
    // run wraps from one chapter into the next). Runs before section /
    // rabbi injection so the hadran wrapper is stable.
    main = injectHadran(main);
    if (inner) inner = injectHadran(inner);
    if (outer) outer = injectHadran(outer);

    // Geography no longer renders inline section-origin dots — the info is
    // shown in the GeographyMap component in the right-side legend instead.

    // Rabbi underlining: legacy path (createResource → generations()) only
    // when the new registry-driven 'rabbi' mark isn't enabled. When the
    // user toggles the new rabbi mark on, the renderer dispatcher below
    // owns the painting; otherwise fall through to the legacy injection so
    // existing flows keep working.
    const newSystemRabbi = enabledMarkDefs().some((m) => m.id === 'rabbi');
    if (!newSystemRabbi) {
      const rabbis = generations();
      if (rabbis) {
        main = injectRabbiUnderlines(main, rabbis);
        if (inner) inner = injectRabbiUnderlines(inner, rabbis);
        if (outer) outer = injectRabbiUnderlines(outer, rabbis);
      }
    }

    // Apply registry-driven renderers (the new system). For each currently
    // enabled mark with parsed run output, dispatch to the renderer keyed
    // by (anchor, render.kind). Today only phrase+inline (rabbi) is
    // implemented; more shapes land as we port more built-ins.
    {
      const defs = enabledMarkDefs();
      const runs = markRunsByMarkId();
      if (defs.length > 0) {
        main = applyMarkRenderers(main, defs, runs);
        if (inner) inner = applyMarkRenderers(inner, defs, runs);
        if (outer) outer = applyMarkRenderers(outer, defs, runs);
      }
    }

    // City-marker wraps + the per-daf places list now come from the
    // `places` worker mark via applyMarkRenderers above. citiesInText
    // (derived below) reads from the mark's run output rather than a
    // heuristic match set.
    const placeMatches = placesMatchedFromMark();

    const ctx = { tractate: tractate(), page: page() };

    // Argument-section anchors: one per section that has a Hebrew excerpt.
    const a = analysis();
    if (a && showArguments()) {
      const anchors = a.sections
        .map((s, i) => ({ excerpt: s.excerpt ?? '', index: i, startSegIdx: s.startSegIdx }))
        .filter((x) => x.excerpt.length > 0 || x.startSegIdx != null);
      if (anchors.length > 0) main = injectAnchorMarkers(main, anchors, 'daf-argument-anchor', ctx);
      // Per-rabbi opinion anchors so the highlight can narrow to one rabbi's
      // statement (rather than the whole section) when the sidebar surfaces
      // a specific rabbi.
      main = injectOpinionMarkers(main, a.sections, ctx);
    }

    // Halacha anchors: one per topic with an excerpt.
    const h = halacha();
    if (h && showHalachot()) {
      const anchors = h.topics
        .map((t, i) => ({ excerpt: t.excerpt ?? '', index: i, startSegIdx: t.startSegIdx }))
        .filter((x) => x.excerpt.length > 0 || x.startSegIdx != null);
      if (anchors.length > 0) main = injectAnchorMarkers(main, anchors, 'daf-halacha-anchor', ctx);
    }

    // Aggadata anchors: one start + one end per story so the highlight spans
    // from the opening phrase to the closing phrase, rather than bleeding
    // into the next topic.
    const ag = aggadata();
    if (ag && showAggadatot()) {
      const anchors = ag.stories
        .map((s, i) => ({ excerpt: s.excerpt ?? '', endExcerpt: s.endExcerpt, index: i, startSegIdx: s.startSegIdx, endSegIdx: s.endSegIdx }))
        .filter((x) => x.excerpt.length > 0 || x.startSegIdx != null);
      if (anchors.length > 0) main = injectAggadataAnchors(main, anchors, ctx);
    }

    // Pesukim anchors: start + end per Tanach citation so the highlight covers
    // the whole quoted verse rather than only the citation marker.
    const pe = pesukim();
    if (pe && showPesukim()) {
      const anchors = pe.pesukim
        .map((p, i) => ({ excerpt: p.excerpt ?? '', endExcerpt: p.endExcerpt, index: i, startSegIdx: p.startSegIdx, endSegIdx: p.endSegIdx }))
        .filter((x) => x.excerpt.length > 0 || x.startSegIdx != null);
      if (anchors.length > 0) main = injectPesukimAnchors(main, anchors, ctx);
    }

    return { main, inner, outer, placeMatches };
  });

  // Cities found in the daf's Hebrew text — passed to GeographyMap so each
  // explicit mention gets a gray place-dot even when no rabbi in the list
  // is placed there.
  const citiesInText = createMemo<Set<string> | null>(() => {
    const t = tokenized();
    return t ? t.placeMatches : null;
  });

  // Changes to this key force GutterIcons to re-measure anchor positions.
  const gutterKey = createMemo(() => {
    const t = tokenized();
    if (!t) return '';
    return `${tractate()}:${page()}:${t.main.length}:${analysis()?.sections.length ?? 0}:${halacha()?.topics.length ?? 0}:${aggadata()?.stories.length ?? 0}:${pesukim()?.pesukim.length ?? 0}`;
  });

  // Mutual exclusion: opening anything in the argument/rabbi/aggadata sidebar
  // should close the commentary card, and picking a commentary should close
  // the argument sidebar. These helpers make the clearing explicit so
  // intent is visible at every entry point.
  const clearCommentarySelection = () => {
    setActiveCommentaryWork(null);
    setActiveCommentarySegIdx(null);
  };
  const clearArgumentSidebar = () => {
    setSidebar(null);
    setActiveRabbi(null);
  };

  const openArgument = (index: number) => {
    const a = analysis();
    if (!a || !a.sections[index]) return;
    clearCommentarySelection();
    setActiveRabbi(null);
    setSidebar({ kind: 'argument', section: a.sections[index], index });
    setLastInteractedCard('argument');
  };

  const openHalacha = (index: number) => {
    const h = halacha();
    if (!h || !h.topics[index]) return;
    clearCommentarySelection();
    setActiveRabbi(null);
    setSidebar({ kind: 'halacha', topic: h.topics[index], index });
    setLastInteractedCard('argument');
  };

  const openStory = (index: number) => {
    const ag = aggadata();
    if (!ag || !ag.stories[index]) return;
    const current = sidebar();
    if (current?.kind === 'aggadata' && current.index === index) {
      setSidebar(null);
      if (activeCommentarySegIdx() === null) setLastInteractedCard(null);
      return;
    }
    clearCommentarySelection();
    setActiveRabbi(null);
    setSidebar({ kind: 'aggadata', story: ag.stories[index], index });
    setLastInteractedCard('argument');
  };

  const openPasuk = (index: number) => {
    const list = pesukim()?.pesukim;
    if (!list || !list[index]) return;
    clearCommentarySelection();
    setActiveRabbi(null);
    setSidebar({ kind: 'pesuk', pasuk: list[index], index });
    setLastInteractedCard('argument');
  };

  const onGutterClick = (kind: GutterKind, index: number) => {
    // Toggle: clicking the already-active gutter icon closes the sidebar and
    // clears the span highlight.
    const current = sidebar();
    if (current && current.kind === kind && 'index' in current && current.index === index) {
      setSidebar(null);
      setActiveRabbi(null);
      if (activeCommentarySegIdx() === null) setLastInteractedCard(null);
      return;
    }
    if (kind === 'argument') openArgument(index);
    else if (kind === 'halacha') openHalacha(index);
    else if (kind === 'aggadata') openStory(index);
    else if (kind === 'pesuk') openPasuk(index);
    else if (kind === 'rishonim') openRishonim(index);
  };

  // Open the per-segment rishonim sidebar. `index` is the segIdx; we look up
  // the matching instance in the rishonim mark's run output, then push a
  // 'rishonim' SidebarContent so the existing right-aside renders it.
  const openRishonim = (segIdx: number) => {
    const run = markRunsByMarkId()['rishonim'];
    const inst = (run?.parsed?.instances as Array<{ segIdx: number; fields: unknown }> | undefined)
      ?.find((i) => i.segIdx === segIdx);
    if (!inst) return;
    clearArgumentSidebar();
    setActiveRabbi(null);
    setActivePlace(null);
    setSidebar({
      kind: 'rishonim',
      instance: inst as Extract<SidebarContent, { kind: 'rishonim' }>['instance'],
      index: segIdx,
    });
    setLastInteractedCard('argument');
  };

  const sidebarActiveKey = createMemo(() => {
    const s = sidebar();
    if (!s) return null;
    if (s.kind === 'rabbi') return `rabbi:${s.rabbi.name}`;
    if (s.kind === 'place') return `place:${s.place.fields.name}`;
    if (s.kind === 'voice-group') return `voice-group:${s.group.name}`;
    if (s.kind === 'argument-overview') return 'argument-overview';
    return `${s.kind}:${s.index}`;
  });

  const onHighlightLocation = (cityName: string | null, rabbiNames: string[]) => {
    setActiveRabbi(null);
    setSidebar(null);
    setActivePlace(null);
    clearCommentarySelection();
    setActiveLocation(cityName);
    setActiveLocationRabbis(cityName ? rabbiNames : []);
  };

  // Timeline-driven rabbi highlight. Encodes generation id as the activeLocation
  // string with a `gen:` prefix so the map + timeline can each tell when the
  // other is driving the highlight. If the generation contains exactly one
  // rabbi, also open their bio card.
  const onHighlightGeneration = (gen: GenerationId | null, rabbiNames: string[]) => {
    if (gen && rabbiNames.length === 1) {
      openRabbi(rabbiNames[0]);
      return;
    }
    setActiveRabbi(null);
    setSidebar(null);
    setActivePlace(null);
    clearCommentarySelection();
    setActiveLocation(gen ? `gen:${gen}` : null);
    setActiveLocationRabbis(gen ? rabbiNames : []);
  };
  const activeGenerationId = createMemo<GenerationId | null>(() => {
    const loc = activeLocation();
    if (!loc || !loc.startsWith('gen:')) return null;
    return loc.slice(4) as GenerationId;
  });

  // sidePercent = (1 - mainWidth) / 2 * 100. With mainWidth 0.48, that's 26%.
  // The actual visible gap between the commentary text column and the main
  // text is the `.daf-main .daf-inner-mid` spacer's 8px margin-right (and the
  // mirror on the outer side). Shift icons inward by half of that (+4px) so
  // they center in the whitespace rather than on the float boundary.
  //
  // EDGE_X is used when an anchor falls inside the double-extend region
  // (top start spacer or bottom end spacer) where main text runs
  // edge-to-edge — the icon moves out past the text to sit at the daf
  // margin instead of overlapping the words.
  const SIDE_PCT = ((1 - 0.48) / 2) * 100;
  const ARG_X = `calc(${SIDE_PCT}% + 8px)`;
  const HALACHA_X = `calc(${100 - SIDE_PCT}% - 8px)`;
  const ARG_EDGE_X = '-10px';
  const HALACHA_EDGE_X = 'calc(100% + 10px)';
  // Aggadata icons share the right-hand gutter column with halacha gavels.
  const AGG_X = HALACHA_X;
  const AGG_EDGE_X = HALACHA_EDGE_X;
  // Pesuk badges sit on the left (argument) gutter — Tanach citations are
  // foundational to the gemara's argumentative weave, so they belong on the
  // same side as the argument-section icons.
  const PESUK_X = ARG_X;
  const PESUK_EDGE_X = ARG_EDGE_X;
  // Rishonim icons go on the right gutter, but inset further than halacha
  // so they don't collide with halacha gavels when both are enabled.
  const RISHONIM_X = `calc(${100 - SIDE_PCT}% - 22px)`;
  const RISHONIM_EDGE_X = 'calc(100% + 22px)';

  const syncUrl = () => {
    const u = new URL(window.location.href);
    u.searchParams.set('tractate', tractate());
    u.searchParams.set('page', page());
    window.history.replaceState({}, '', u.toString());
  };

  const go = (p: string) => {
    clearActive();
    setPage(p);
    syncUrl();
  };

  const setTractateAndSync = (t: string) => {
    clearActive();
    setTractate(t);
    // Reset to 2a when tractate changes
    setPage('2a');
    syncUrl();
  };

  // "Today's Daf" — fetches the daily Daf Yomi from Sefaria's public
  // calendar API (same source the yomi-cron pre-warm uses) and jumps to
  // the "a" amud of that daf.
  const [yomiLoading, setYomiLoading] = createSignal(false);
  const [yomiError, setYomiError] = createSignal<string | null>(null);
  const goToYomi = async () => {
    if (yomiLoading()) return;
    setYomiError(null);
    setYomiLoading(true);
    try {
      const now = new Date();
      const url = `https://www.sefaria.org/api/calendars?year=${now.getFullYear()}&month=${now.getMonth() + 1}&day=${now.getDate()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Sefaria ${res.status}`);
      const data = await res.json() as {
        calendar_items?: Array<{ title?: { en?: string }; displayValue?: { en?: string }; category?: string }>;
      };
      const item = data.calendar_items?.find(
        (ci) => ci.title?.en === 'Daf Yomi' && ci.category === 'Talmud',
      );
      const display = item?.displayValue?.en;
      const m = display?.match(/^(.+?)\s+(\d+)$/);
      if (!m) throw new Error('No Daf Yomi entry for today');
      const t = m[1].trim();
      const p = `${parseInt(m[2], 10)}a`;
      clearActive();
      setTractate(t);
      setPage(p);
      syncUrl();
    } catch (err) {
      setYomiError(err instanceof Error ? err.message : String(err));
    } finally {
      setYomiLoading(false);
    }
  };

  const pageNum = () => parsePage(page()).num;
  const pageAmud = () => parsePage(page()).amud;

  const setPageNum = (n: number) => {
    if (Number.isFinite(n) && n >= 2) go(formatPage(Math.floor(n), pageAmud()));
  };
  const toggleAmud = () => {
    go(formatPage(pageNum(), pageAmud() === 'a' ? 'b' : 'a'));
  };

  const clearActive = () => {
    const current = active();
    if (current) current.els.forEach((el) => el.classList.remove('daf-word-active'));
    setActive(null);
  };

  const setActiveFromWordEls = (els: HTMLElement[], e?: MouseEvent) => {
    const prev = active();
    if (prev) prev.els.forEach((el) => el.classList.remove('daf-word-active'));
    els.forEach((el) => el.classList.add('daf-word-active'));
    // Snap the visible browser selection to the word boundaries so the user
    // sees exactly what will be translated.
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.setStartBefore(els[0]);
      range.setEndAfter(els[els.length - 1]);
      sel.removeAllRanges();
      sel.addRange(range);
      const r = range.getBoundingClientRect();
      const word = els.map((el) => (el.textContent ?? '').trim()).filter(Boolean).join(' ');
      const { before, after } = collectSurroundingHebrew(els);
      const segAttr = els[0].getAttribute('data-seg');
      const segIdx = segAttr !== null ? Number(segAttr) : undefined;
      setActive({
        word,
        anchor: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
        els,
        hebrewBefore: before,
        hebrewAfter: after,
        segIdx: Number.isFinite(segIdx) ? segIdx : undefined,
      });
    }
    if (e) e.stopPropagation();
  };

  // Click handler shared by text / map / timeline / sidebar — opens the rabbi
  // card AND highlights every mention of that rabbi across the daf.
  // Source: dafRabbis() (the rabbi mark; name/nameHe/generation). The
  // per-rabbi enrichment cards in the sidebar fill in places/bio/region/slug
  // contextually via the rabbi.identity + rabbi.* enrichments.
  const openRabbi = (name: string) => {
    let r: IdentifiedRabbi | null = dafRabbis().find((x) => x.name === name) ?? null;
    if (!r) {
      const argRun = markRunsByMarkId()['rabbi'];
      const inst = (argRun?.parsed as { instances?: Array<{ excerpt?: string; fields: Record<string, unknown> }> } | undefined)
        ?.instances?.find((i) => i.fields?.name === name);
      if (inst) {
        r = {
          slug: null,
          name,
          nameHe: String(inst.fields.nameHe ?? inst.excerpt ?? ''),
          generation: (inst.fields.generation ?? 'unknown') as GenerationId,
          region: null,
          places: [],
          moved: null,
          bio: null,
          image: null,
          wiki: null,
        };
      }
    }
    setActivePlace(null);
    clearCommentarySelection();
    if (!r) {
      setActiveRabbi(name);
      setLastInteractedCard('argument');
      return;
    }
    setActiveRabbi(r.name);
    setSidebar({ kind: 'rabbi', rabbi: r });
    setLastInteractedCard('argument');
  };

  // City-marker click → highlight every mention of the place AND open the
  // place card. The card needs the full mark instance (nameHe/kind/region) so
  // it can fire places.synthesis with the same shape the prefetcher warmed;
  // `data-city` only carries the canonical English name, so we look the
  // instance back up in the places mark run. Falls back to a minimal instance
  // (still opens the card; the synthesis re-derives from the name) if the run
  // hasn't landed or the name isn't found.
  const openPlace = (name: string) => {
    const run = markRunsByMarkId()['places'];
    const instances = (run?.parsed as { instances?: PlaceInstance[] } | undefined)?.instances;
    const found = instances?.find((i) => i.fields?.name === name) ?? null;
    const place: PlaceInstance = found ?? {
      fields: { name, nameHe: '', kind: '', region: '', knownAs: [] },
    };
    setActiveRabbi(null);
    setActiveLocation(null);
    setActiveLocationRabbis([]);
    clearCommentarySelection();
    setActivePlace(name);
    setSidebar({ kind: 'place', place });
    setLastInteractedCard('argument');
  };

  // Cross-enrichment rabbi click (chip / voice node / prose mention inside
  // an open sidebar). Resolves a display name to an IdentifiedRabbi
  // through a layered chain so common phrasing mismatches still land on a
  // useful sidebar entry. Push (not replace) so the back chip can pop.
  //
  // Resolution chain:
  //   1. Exact name match in dafContext.
  //   2. Normalized (strip Rabbi/Rav/R. prefix, lowercase) match in dafContext.
  //   3. Substring match: dafContext name contains the query, or vice
  //      versa. Only when EXACTLY one candidate matches — multiple matches
  //      mean ambiguity (e.g. two Rabbi Yochanans), and we'd rather fall
  //      through than route to the wrong one.
  //   4. Rabbi mark (registry-driven, generation only).
  //   5. Collective voice (Sages, Tanna Kamma, Stam, etc.) — synthesizes a
  //      stub with a static descriptive bio.
  //   6. Stub fallback: open the sidebar with just the name + 'unknown'
  //      generation so the user at least sees what they clicked.
  const pushRabbi = (name: string) => {
    const ctx = dafRabbis();
    let r: IdentifiedRabbi | null = null;

    // 1. exact
    r = ctx.find((x) => x.name === name) ?? null;

    // 2. normalized
    if (!r) {
      const norm = normalizeRabbiName(name);
      if (norm) r = ctx.find((x) => normalizeRabbiName(x.name) === norm) ?? null;
    }

    // 3. substring (single-match guard)
    if (!r) {
      const norm = normalizeRabbiName(name);
      if (norm) {
        const candidates = ctx.filter((x) => {
          const cnorm = normalizeRabbiName(x.name);
          return cnorm.includes(norm) || norm.includes(cnorm);
        });
        if (candidates.length === 1) r = candidates[0];
      }
    }

    // 4. rabbi mark
    if (!r) {
      const argRun = markRunsByMarkId()['rabbi'];
      const inst = (argRun?.parsed as { instances?: Array<{ excerpt?: string; fields: Record<string, unknown> }> } | undefined)
        ?.instances?.find((i) => i.fields?.name === name);
      if (inst) {
        r = {
          slug: null,
          name,
          nameHe: String(inst.fields.nameHe ?? inst.excerpt ?? ''),
          generation: (inst.fields.generation ?? 'unknown') as GenerationId,
          region: null,
          places: [],
          moved: null,
          bio: null,
          image: null,
          wiki: null,
        };
      }
    }

    // 5. collective voice — push a dedicated voice-group sidebar entry
    // rather than masquerading as a rabbi. Returns early because
    // voice-groups render through their own panel, not RabbiBody.
    if (!r) {
      const g = resolveVoiceGroup(name);
      if (g) {
        setActiveRabbi(g.name);
        setActivePlace(null);
        pushSidebar({ kind: 'voice-group', group: g });
        setLastInteractedCard('argument');
        return;
      }
    }

    // 6. last-resort stub — push something so the click isn't a dead end.
    if (!r) {
      r = {
        slug: null,
        name,
        nameHe: '',
        generation: 'unknown' as GenerationId,
        region: null,
        places: [],
        moved: null,
        bio: null,
        image: null,
        wiki: null,
      };
    }

    setActiveRabbi(r.name);
    setActivePlace(null);
    pushSidebar({ kind: 'rabbi', rabbi: r });
    setLastInteractedCard('argument');
  };

  // Bio-text link → open that rabbi's bio. Prefer the in-context entry (so
  // we also light up daf highlights); otherwise pull the standalone entry
  // from the dataset via /api/rabbi/:slug. ALWAYS pushes so chains of
  // rabbi → cited-rabbi → ... can be unwound by the back chip.
  const openRabbiSlug = async (slug: string) => {
    // dafRabbis() carries null slugs (the join lives in the rabbi.identity
    // enrichment now), so this won't match by slug — fall through to the
    // standalone /api/rabbi/:slug fetch, which resolves the dataset entry.
    const inCtx = dafRabbis().find((x) => x.slug === slug);
    if (inCtx) { pushRabbi(inCtx.name); return; }
    try {
      const res = await fetch(`/api/rabbi/${encodeURIComponent(slug)}`);
      if (!res.ok) return;
      const body = await res.json() as { rabbi?: IdentifiedRabbi };
      if (!body.rabbi) return;
      setActiveRabbi(null);
      setActivePlace(null);
      pushSidebar({ kind: 'rabbi', rabbi: body.rabbi });
      setLastInteractedCard('argument');
    } catch { /* silent — link falls back to no-op */ }
  };

  // Active commentary → Map<segIdx, Comment[]> for fast click lookup
  // and a flat Set of segment indices for CSS highlighting.
  const activeCommentaryWorkObj = createMemo<CommentaryWork | null>(() => {
    const title = activeCommentaryWork();
    if (!title) return null;
    return (commentaryWorks() ?? []).find((w) => w.title === title) ?? null;
  });
  const commentaryBySegIdx = createMemo<Map<number, CommentaryComment[]>>(() => {
    const m = new Map<number, CommentaryComment[]>();
    const work = activeCommentaryWorkObj();
    if (!work) return m;
    for (const c of work.comments) {
      const arr = m.get(c.anchorSegIdx) ?? [];
      arr.push(c);
      m.set(c.anchorSegIdx, arr);
    }
    return m;
  });
  // Comments to show in the picker card's expanded slot. Empty when no
  // segment is active or the active work changes underneath.
  const activeCommentaryComments = createMemo<CommentaryComment[]>(() => {
    const idx = activeCommentarySegIdx();
    if (idx === null) return [];
    return commentaryBySegIdx().get(idx) ?? [];
  });

  const openCommentaryAtSeg = (segIdx: number) => {
    const work = activeCommentaryWorkObj();
    if (!work) return;
    const comments = commentaryBySegIdx().get(segIdx);
    if (!comments || comments.length === 0) return;
    // Close anything in the argument sidebar + per-word highlights so the
    // commentary card is the sole "open" dynamic surface.
    clearArgumentSidebar();
    setActivePlace(null);
    setActiveLocation(null);
    setActiveLocationRabbis([]);
    setActiveCommentarySegIdx(segIdx);
    setLastInteractedCard('commentary');
    // Legacy mobile commentary drawer tab was removed when the per-segment
    // commentary mark + CommentaryInspectorShelf became the primary surface.
    // This codepath is dormant — kept to avoid a wide rewrite while the
    // legacy picker state is still in place.
  };

  // Wrapped picker-select: collapses any open segment so a new work doesn't
  // inherit a stale segment, and floats the picker card to the top.
  const selectCommentaryWork = (title: string | null) => {
    setActiveCommentarySegIdx(null);
    setActiveCommentaryWork(title);
    if (title) {
      clearArgumentSidebar();
      setActivePlace(null);
      setActiveLocation(null);
      setActiveLocationRabbis([]);
      setLastInteractedCard('commentary');
    }
  };

  /** Bidirectional daf↔commentary anchor click. When the user clicks a
   *  word, look up which side of the bridge they're on (main column = look
   *  forward to which Rashi/Tosafot pieces gloss this seg; inner/outer
   *  column = look back to which daf seg(s) the piece anchors to) and
   *  set commAnchorActive accordingly. The paint effect below applies
   *  the highlight class to the matching DOM nodes. Clicking the same
   *  word twice clears the active state. Returns true when the click
   *  produced an anchor highlight (so the caller can suppress fallback
   *  click behaviour like the translate popup). */
  const handleCommentaryAnchorClick = (e: MouseEvent): boolean => {
    const idx = commentaryAnchorIndex();
    if (!idx) return false;
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    const wordEl = target.closest?.('.daf-word') as HTMLElement | null;
    // Clicked something that isn't a daf-word inside the daf surface (a
    // gutter icon, between words, the column background, etc.) — clear
    // any active anchor highlight so the user can move on without the
    // stale highlight following them around.
    if (!wordEl) {
      if (commAnchorActive()) setCommAnchorActive(null);
      return false;
    }

    // Walk up to determine which column we're in. main has no .daf-comm-piece
    // ancestor; inner/outer DO.
    const pieceEl = wordEl.closest('.daf-comm-piece') as HTMLElement | null;

    if (pieceEl) {
      // Reverse direction: piece → segs. Highlight is on the daf (range
      // overlay) so the user sees what the piece is commenting on.
      const pieceKey = pieceEl.getAttribute('data-piece-key');
      const comm = pieceEl.getAttribute('data-comm') as 'rashi' | 'tosafot' | null;
      if (!comm || !pieceKey) {
        // No piece-key on this span means the renderer fell back to the
        // pieceless path (no Sefaria piece array available) — there's
        // nothing to anchor against. Clear any prior highlight so the
        // click reads as a dismissal.
        if (commAnchorActive()) setCommAnchorActive(null);
        return false;
      }
      const segs = idx.pieceToSegs.get(`${comm}:${pieceKey}`) ?? [];
      if (segs.length === 0) {
        // The piece exists but has no daf segs mapped — clear anything
        // active so a click on an unmapped piece reads as "dismiss",
        // not "leave the previous highlight".
        if (commAnchorActive()) setCommAnchorActive(null);
        return false;
      }
      const cur = commAnchorActive();
      const sameClick = cur && cur.direction === 'from-piece'
        && cur.pieces.length === 1
        && cur.pieces[0].comm === comm
        && cur.pieces[0].key === pieceKey;
      setCommAnchorActive(sameClick ? null : {
        direction: 'from-piece',
        segs,
        pieces: [{ comm, key: pieceKey }],
      });
      return true;
    }

    // Forward direction: seg → pieces. Highlight is on the Rashi/Tosafot
    // pieces only — the daf word the user clicked stays untouched (it's
    // already the reference; lighting it up just adds noise).
    const segAttr = wordEl.getAttribute('data-seg');
    if (segAttr === null) {
      if (commAnchorActive()) setCommAnchorActive(null);
      return false;
    }
    const seg = Number(segAttr);
    if (!Number.isFinite(seg)) {
      if (commAnchorActive()) setCommAnchorActive(null);
      return false;
    }
    const bucket = idx.segToPieces.get(seg);
    if (!bucket || (bucket.rashi.length === 0 && bucket.tosafot.length === 0)) {
      // Clicked a main-column word that has no commentary attached.
      // Treat as "dismiss the existing highlight" so the user can clear
      // by clicking any unrelated word.
      if (commAnchorActive()) setCommAnchorActive(null);
      return false;
    }
    const pieces: Array<{ comm: 'rashi' | 'tosafot'; key: string }> = [
      ...bucket.rashi.map((k) => ({ comm: 'rashi' as const, key: k })),
      ...bucket.tosafot.map((k) => ({ comm: 'tosafot' as const, key: k })),
    ];
    const cur = commAnchorActive();
    const sameClick = cur && cur.direction === 'from-main'
      && cur.segs.length === 1 && cur.segs[0] === seg;
    setCommAnchorActive(sameClick ? null : {
      direction: 'from-main',
      segs: [seg],
      pieces,
    });
    return true;
  };

  // Esc clears the anchor highlight — same key already closes sidebars
  // elsewhere, so the behaviour reads consistently. AND any click that
  // lands outside the daf surface (sidebar, top nav, page background)
  // clears as well: once the user's focus has left the daf, the stale
  // anchor highlight is just noise. Inside-daf clicks are handled by
  // handleCommentaryAnchorClick via onMouseUpRoot — this document-level
  // listener only fires when the surface handler didn't apply.
  if (typeof window !== 'undefined') {
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && commAnchorActive()) setCommAnchorActive(null);
    };
    const onDocMouseUp = (ev: MouseEvent) => {
      if (!commAnchorActive()) return;
      const target = ev.target as HTMLElement | null;
      // Inside the daf surface: handleCommentaryAnchorClick owns the
      // clear-vs-swap decision. Document-level clear only applies when
      // the click is genuinely outside.
      if (target?.closest?.('.daf-surface')) return;
      setCommAnchorActive(null);
    };
    window.addEventListener('keydown', onEsc);
    document.addEventListener('mouseup', onDocMouseUp);
    onCleanup(() => {
      window.removeEventListener('keydown', onEsc);
      document.removeEventListener('mouseup', onDocMouseUp);
    });
  }

  // Note: when direction === 'from-main' (user clicked a daf word), the
  // Rashi/Tosafot pieces that gloss it are painted as range overlays in the
  // main paint effect above — same continuous-band treatment as everything
  // else — rather than via a CSS outline on the wrapping .daf-comm-piece span.

  // On mouseup: prefer a text selection snapped to word boundaries over a plain
  // word click. Any .daf-word element intersecting the selection range counts
  // as "selected", so starting a drag mid-word includes the whole word. Mobile
  // multi-word selection uses native iOS/Android long-press-and-extend handles,
  // which produce the same selection range this code reads.
  const onMouseUpRoot = (e: MouseEvent) => {
    // Commentary anchor highlight fires alongside any other click behaviour
    // (translate popup, commentary-on-tap, etc). Runs first so it lights
    // up the cross-references even when the click also triggers something
    // else.
    handleCommentaryAnchorClick(e);

    const sel = window.getSelection();

    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const snapped = collectSnappedWords(sel.getRangeAt(0));
      if (snapped.length >= 2 && snapped.length <= MAX_PHRASE_WORDS) {
        // Mobile read mode opts out of translation entirely — the user is
        // selecting for native copy/paste, not asking to translate.
        if (isMobile() && mobileMode() === 'read') return;
        setActiveFromWordEls(snapped, e);
        return;
      }
      if (snapped.length > MAX_PHRASE_WORDS) {
        // Too long — ignore
        return;
      }
      // snapped.length is 0 or 1 → fall through to single-click handling
    }

    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Mobile interaction modes apply to single-tap behaviour only — native
    // multi-word selection above already triggered or bailed.
    if (isMobile()) {
      const wordEl = target.closest('.daf-word') as HTMLElement | null;
      // Commentary-on-tap takes precedence in both modes when a work is open.
      if (activeCommentaryWork() && wordEl) {
        const segAttr = wordEl.getAttribute('data-seg');
        if (segAttr !== null) {
          const s = Number(segAttr);
          if (Number.isFinite(s) && commentaryBySegIdx().has(s)) {
            openCommentaryAtSeg(s);
            return;
          }
        }
      }
      if (mobileMode() === 'read') {
        // Read mode: rabbi/city taps still open their drawers; plain words
        // are left alone so native long-press selection isn't pre-empted.
        const rabbiEl = target.closest('.rabbi-underline') as HTMLElement | null;
        if (rabbiEl) {
          const rabbiName = rabbiEl.getAttribute('data-rabbi');
          if (rabbiName) { openRabbi(rabbiName); return; }
        }
        const cityEl = target.closest('.city-marker') as HTMLElement | null;
        if (cityEl) {
          const cityName = cityEl.getAttribute('data-city');
          if (cityName) { openPlace(cityName); return; }
        }
        return;
      }
      // Translate mode: tap-to-translate, bypassing rabbi/city handlers so
      // the drawer doesn't hijack the popup on rabbi-underlined words.
      if (!wordEl) return;
      if (active()?.els.includes(wordEl)) {
        clearActive();
        return;
      }
      setActiveFromWordEls([wordEl], e);
      return;
    }

    // Desktop single-click flow.
    // Click on a rabbi name → open the bio card + highlight, skip translation.
    const rabbiEl = target.closest('.rabbi-underline') as HTMLElement | null;
    if (rabbiEl) {
      const rabbiName = rabbiEl.getAttribute('data-rabbi');
      if (rabbiName) { openRabbi(rabbiName); return; }
    }
    // Click on a city marker → highlight every mention of that city across
    // the daf AND open the place card (profile/significance/figures synthesis).
    const cityEl = target.closest('.city-marker') as HTMLElement | null;
    if (cityEl) {
      const cityName = cityEl.getAttribute('data-city');
      if (cityName) { openPlace(cityName); return; }
    }
    const wordEl = target.closest('.daf-word') as HTMLElement | null;
    if (!wordEl) return;
    // When a commentary work is active, clicking a word inside one of its
    // anchored segments opens that work's comments for the segment instead of
    // triggering a translation.
    if (activeCommentaryWork()) {
      const segAttr = wordEl.getAttribute('data-seg');
      if (segAttr !== null) {
        const s = Number(segAttr);
        if (Number.isFinite(s) && commentaryBySegIdx().has(s)) {
          openCommentaryAtSeg(s);
          return;
        }
      }
    }
    setActiveFromWordEls([wordEl], e);
  };

  // Keyboard nav — arrow keys go to prev/next page when not typing into an input.
  createEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(prevPage(page())); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(nextPage(page())); }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  return (
    <main class="daf-page" classList={{ 'daf-no-rabbi-underlines': !showGenMarkers() }}>
      <header class="daf-header">
        <h1 class="tb-wordmark">{t('app.title')}</h1>

        <select
          class="tb-select"
          value={tractate()}
          onChange={(e) => setTractateAndSync(e.currentTarget.value)}
        >
          <For each={TRACTATE_OPTIONS}>
            {(opt) => <option value={opt.value}>{opt.value} · {opt.label}</option>}
          </For>
        </select>

        {/* Back | daf | amud | forward share one segmented pill so the page
            reference reads as a single unit. */}
        <div class="tb-nav">
          <button class="tb-navbtn" onClick={() => go(prevPage(page()))} title={t('header.nav.hint')}>‹</button>
          <input
            class="tb-daf"
            type="number"
            min={2}
            value={pageNum()}
            onInput={(e) => setPageNum(Number(e.currentTarget.value))}
          />
          <button class="tb-amud" onClick={toggleAmud} title={t('header.amud.title')}>
            {pageAmud()}
          </button>
          <button class="tb-navbtn" onClick={() => go(nextPage(page()))} title={t('header.nav.hint')}>›</button>
        </div>

        <button
          class="tb-primary"
          classList={{ 'is-error': !!yomiError() }}
          onClick={goToYomi}
          disabled={yomiLoading()}
          title={yomiError() ?? t('header.todaysDaf.title')}
        >
          {yomiLoading() ? t('header.todaysDaf.finding') : t('header.todaysDaf')}
        </button>

        <div class="tb-utils">
          <button
            class="tb-toggle"
            classList={{ 'is-active': devOpen() }}
            onClick={() => { const v = !devOpen(); setDevOpen(v); setDevModeActive(v); }}
            title={t('header.dev.title')}
          >
            {t('header.dev')}
          </button>
          {/* EN/HE language toggle, folded inline here on the daf page; the
              floating TopBar overlay covers the other routes (see App.tsx). */}
          <div class="tb-seg" role="group" aria-label="Language">
            <button class="tb-seg-btn" classList={{ 'is-active': lang() === 'en' }} aria-pressed={lang() === 'en'} onClick={() => setLang('en')}>EN</button>
            <button class="tb-seg-btn" classList={{ 'is-active': lang() === 'he' }} aria-pressed={lang() === 'he'} onClick={() => setLang('he')}>עב</button>
          </div>
        </div>

        <span class="tb-hint">
          {tractate()} {page()} · {t('header.nav.hint')}
        </span>
      </header>

      {/* Mark errors still surface explicitly — the progress bar abstracts
          them into its count, but a failed anchor is worth naming. */}
      <Show when={markStatuses().some((s) => s.kind === 'error')}>
        <section
          style={{
            'margin-bottom': '1rem',
            'max-width': '720px',
            'margin-left': 'auto',
            'margin-right': 'auto',
            display: 'flex',
            gap: '0.75rem',
            'flex-wrap': 'wrap',
            'align-items': 'center',
            'justify-content': 'center',
            'font-size': '0.75rem',
            color: '#c33',
          }}
        >
          <For each={markStatuses().filter((s) => s.kind === 'error')}>{(s) => (
            <span>{s.label || s.id}: {s.error}</span>
          )}</For>
        </section>
      </Show>

      <div class="daf-layout">
      <div class="daf-cluster">
      <section class="daf-body-col">
      {/* TODO(geography-rederive): the right-side Geography panel + its
          "Map" pill were removed because their data source (legacy
          /api/daf-context fetch returning rabbiPlaces) hangs or 1031s.
          Rederive the panel from registry data — per-rabbi places live in
          the `rabbi.geography` enrichment now, and the rabbi sidebar's
          RabbiPlacesTimeline already renders them well. A whole-daf map
          would aggregate those per-rabbi enrichments. Until then, the
          top-bar toggle nav is empty and hidden. */}
      {/* Unified load bar — one progress indicator + status line for the whole
          daf (anchor extraction + section prefetch). Lives inside the daf
          body column so it's exactly the daf's width, pinned (sticky) directly
          above the daf as the reader scrolls. */}
      <DafLoadProgress />

      {/* Whole-daf chip marks (argument map) are experimental — shown only when
          dev mode is open. */}
      <Show when={devOpen() && chipMarks().length > 0}>
        <div class="daf-chip-bar" style={{ display: 'flex', gap: '0.4rem', 'flex-wrap': 'wrap', margin: '0 0 0.6rem' }}>
          <For each={chipMarks()}>{(m) => {
            const color = (m.render as { color?: string }).color ?? '#8a2a2b';
            const label = m.id === 'argument-overview' ? t('overview.chip') : m.id;
            const active = () => sidebar()?.kind === 'argument-overview' && m.id === 'argument-overview';
            return (
              <button
                type="button"
                onClick={() => openChip(m.id)}
                title={label}
                style={{
                  'font-size': '0.75rem',
                  'font-weight': 600,
                  padding: '0.25rem 0.7rem',
                  'border-radius': '999px',
                  border: `1px solid ${color}`,
                  color: active() ? '#fff' : color,
                  background: active() ? color : '#fff',
                  cursor: 'pointer',
                  'font-family': 'system-ui, -apple-system, sans-serif',
                }}
              >{label}</button>
            );
          }}</For>
        </div>
      </Show>

      <div ref={surfaceEl} class="daf-surface" onMouseUp={onMouseUpRoot} style={{ display: 'flex', 'justify-content': 'center' }}>
        <Show
          when={!daf.loading && tokenized()}
          fallback={
            <p style={{ color: '#888', 'font-style': 'italic' }}>
              {daf.error ? `Error: ${String(daf.error)}` : 'Opening the daf…'}
            </p>
          }
          keyed
        >
          {(t) => (
            <div
              class="daf-scale-wrap"
              style={dafScale() < 1
                ? {
                    width: `${Math.round(520 * dafScale())}px`,
                    height: dafNaturalH() > 0 ? `${Math.round(dafNaturalH() * dafScale())}px` : undefined,
                  }
                : {}}
            >
            <div
              ref={setDafRootEl as (el: HTMLDivElement) => void}
              style={dafScale() < 1
                ? {
                    position: 'relative',
                    width: '520px',
                    transform: `scale(${dafScale()})`,
                    'transform-origin': 'top left',
                  }
                : { position: 'relative' }}
            >
              <DafRenderer
                main={t.main}
                inner={t.inner}
                outer={t.outer}
                amud={pageAmud()}
                options={{ contentWidth: dafWidth(), mainWidth: 0.48 }}
                onLayout={(r) => {
                  // Surface layout/spacer computation timing in the dev
                  // renderer panel. The layout case + exception come from
                  // the spacer engine; useful for debugging the rare
                  // pages that hit a non-default layout case.
                  recordStage('layout-spacers', 'Layout / spacers', Math.round(r.computeMs), {
                    detail: `case=${r.spacers.layoutCase} · exc=${r.spacers.exception} · h=${Math.round(r.totalHeight)}px`,
                  });
                }}
              />
              {/* Per-kind measurement instances — each publishes its anchor
                  positions to the shared gutterStack. The single
                  GutterOverlay below renders all clusters with collision-
                  aware stacking + hover-expand. */}
              <Show when={showArguments()}>
                <GutterIcons
                  containerRef={dafRootEl}
                  triggerKey={gutterKey()}
                  onClick={onGutterClick}
                  kind="argument"
                  activeKey={sidebarActiveKey()}
                />
              </Show>
              <Show when={showHalachot()}>
                <GutterIcons
                  containerRef={dafRootEl}
                  triggerKey={gutterKey()}
                  onClick={onGutterClick}
                  kind="halacha"
                  activeKey={sidebarActiveKey()}
                />
              </Show>
              <Show when={showAggadatot()}>
                <GutterIcons
                  containerRef={dafRootEl}
                  triggerKey={gutterKey()}
                  onClick={onGutterClick}
                  kind="aggadata"
                  activeKey={sidebarActiveKey()}
                />
              </Show>
              <Show when={showPesukim()}>
                <GutterIcons
                  containerRef={dafRootEl}
                  triggerKey={gutterKey()}
                  onClick={onGutterClick}
                  kind="pesuk"
                  activeKey={sidebarActiveKey()}
                />
              </Show>
              <Show when={enabledMarkDefs().some((m) => m.id === 'rishonim')}>
                <GutterIcons
                  containerRef={dafRootEl}
                  triggerKey={gutterKey()}
                  onClick={onGutterClick}
                  kind="rishonim"
                  activeKey={sidebarActiveKey()}
                />
              </Show>
              <GutterOverlay />
            </div>
            </div>
          )}
        </Show>
      </div>

      <Show when={active()}>
        {(a) => (
          <TranslationPopup
            word={a().word}
            tractate={tractate()}
            page={page()}
            anchor={a().anchor}
            hebrewBefore={a().hebrewBefore}
            hebrewAfter={a().hebrewAfter}
            segIdx={a().segIdx}
            onClose={clearActive}
          />
        )}
      </Show>

      <BugReport tractate={tractate()} page={page()} />

      <footer style={{
        'margin-top': '0.5rem',
        'text-align': 'center',
        'font-size': '0.7rem',
        color: '#aaa',
      }}>
        <a
          href="#usage"
          style={{ color: 'inherit', 'text-decoration': 'none', 'border-bottom': '1px dotted #bbb' }}
        >
          {t('dev.usageReports')}
        </a>
        {' · '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            const u = new URL(window.location.href);
            u.searchParams.set('tractate', tractate());
            u.searchParams.set('page', page());
            u.hash = 'align';
            window.location.href = u.toString();
          }}
          style={{ color: 'inherit', 'text-decoration': 'none', 'border-bottom': '1px dotted #bbb' }}
        >
          {t('dev.alignmentDebug')}
        </a>
        {' · '}
        <a
          href="#mcp"
          style={{ color: 'inherit', 'text-decoration': 'none', 'border-bottom': '1px dotted #bbb' }}
        >
          {t('dev.mcpGuide')}
        </a>
      </footer>
      </section>
      </div>

      {/* Right-side aside — currently only ArgumentSidebar mounts here.
          GeographyStrip was removed pending rederivation from registry
          data; see the TODO(geography-rederive) note above. */}
      <Show when={!isMobile() && sidebar() !== null}>
        <aside
          class="daf-aside"
          style={{
            position: 'sticky',
            top: '1rem',
            'align-self': 'flex-start',
            'max-height': 'calc(100vh - 2rem)',
            width: '420px',
            'flex-shrink': 0,
            display: 'flex',
            'flex-direction': 'column',
            gap: '0.4rem',
            overflow: 'auto',
          }}
        >
          <Show when={sidebar() !== null}>
            <ArgumentSidebar
              content={sidebar()}
              tractate={tractate()}
              page={page()}
              activeRabbi={activeRabbi()}
              onClose={() => {
                setSidebar(null);
                setActiveRabbi(null);
                setArgumentMoveHighlight(null);
                if (activeCommentarySegIdx() === null) setLastInteractedCard(null);
              }}
              onHighlightRabbi={(name) => (name ? openRabbi(name) : setActiveRabbi(null))}
              onPushRabbi={pushRabbi}
              previousLabel={sidebarStack().length > 1 ? sidebarLabel(sidebarStack()[sidebarStack().length - 2]) : null}
              onBack={popSidebar}
              dafRabbis={dafRabbis()}
              dafRabbiNames={dafRabbiNames()}
              onHighlightRange={setArgumentMoveHighlight}
              onOpenRabbiSlug={openRabbiSlug}
              generationByName={generationByName()}
              dafSections={analysis()?.sections ?? []}
            />
          </Show>
        </aside>
      </Show>
      </div>

      <Show when={isMobile()}>
        <MobileShelf
          mode={mobileMode()}
          onModeChange={setMobileMode}
          sidebar={sidebar()}
          onCloseExpansion={() => {
            setSidebar(null);
            setActiveRabbi(null);
            setArgumentMoveHighlight(null);
            if (activeCommentarySegIdx() === null) setLastInteractedCard(null);
          }}
          tractate={tractate()}
          page={page()}
          activeRabbi={activeRabbi()}
          onHighlightRabbi={(name) => (name ? openRabbi(name) : setActiveRabbi(null))}
          onPushRabbi={pushRabbi}
          previousLabel={sidebarStack().length > 1 ? sidebarLabel(sidebarStack()[sidebarStack().length - 2]) : null}
          onBack={popSidebar}
          dafRabbis={dafRabbis()}
          dafRabbiNames={dafRabbiNames()}
          onHighlightRange={setArgumentMoveHighlight}
          onOpenRabbiSlug={openRabbiSlug}
          generationByName={generationByName()}
          dafSections={analysis()?.sections ?? []}
        />
      </Show>
      <DevModeShelf open={devOpen()} onClose={() => { setDevOpen(false); setDevModeActive(false); }}>
        <ChecksPanel tractate={tractate()} page={page()} />
        <MarksRegistryPanel
          tractate={tractate()}
          page={page()}
          seedMarks={buildSeedMarks({
            showGenMarkers, setShowGenMarkers,
            showArguments, setShowArguments,
            showHalachot, setShowHalachot,
            showAggadatot, setShowAggadatot,
            showPesukim, setShowPesukim,
          })}
        />
      </DevModeShelf>

    </main>
  );
}
