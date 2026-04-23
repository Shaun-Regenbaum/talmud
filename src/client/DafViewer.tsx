import { createResource, createSignal, createEffect, createMemo, onCleanup, For, Show, type JSX } from 'solid-js';
import type { TalmudPageData } from '../lib/sefref';
import { TRACTATE_OPTIONS } from '../lib/sefref';
import { DafRenderer } from '../lib/daf-render';
import { tokenizeHebrewHtml } from './tokenize';
import { TranslationPopup } from './TranslationPopup';
import type { DafAnalysis, Section } from './AnalysisPanel';
import type { HalachaResult, HalachaTopic } from './HalachaPanel';
import { injectRabbiUnderlines, type GenerationRabbi } from './injectRabbiUnderlines';
import { injectSegmentMarkers } from './injectSegmentMarkers';
import { injectTannaiticMarkers } from './injectTannaiticMarkers';
import { injectHadran } from './injectHadran';
import { injectAnchorMarkers, injectOpinionMarkers } from './anchorMarkers';
import { GutterIcons } from './GutterIcons';
import { ArgumentSidebar, type SidebarContent } from './ArgumentSidebar';
import { GeographyMap } from './GeographyMap';
import { GenerationTimeline } from './GenerationTimeline';
import { BugReport } from './BugReport';
import type { GenerationId } from './generations';

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
  const res = await fetch(`/api/daf/${encodeURIComponent(ref.tractate)}/${ref.page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface ActiveWord {
  word: string;
  anchor: { top: number; left: number; bottom: number; right: number };
  els: HTMLElement[];
  hebrewBefore: string;
  hebrewAfter: string;
}

// Merges a Range's per-word client rects into one band per line and paints
// them as absolute-positioned divs into `overlay`. Coordinates are resolved
// against `origin` (which must be a positioned ancestor of `overlay`).
function paintRangeOverlay(
  overlay: HTMLElement,
  origin: HTMLElement,
  ranges: Range[],
  kind: 'section' | 'halacha',
): void {
  if (ranges.length === 0) return;
  const originRect = origin.getBoundingClientRect();
  // Rects on the same visual line share a `top` within a few px (hebrew
  // diacritics, anchors, etc. can nudge it). Half a line-height is a safe
  // bucketing tolerance.
  const TOL = 6;
  for (const range of ranges) {
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
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const el = document.createElement('div');
      el.className = `daf-range-highlight daf-range-highlight-${kind}`;
      if (i === 0) el.classList.add('daf-range-highlight-first');
      if (i === bands.length - 1) el.classList.add('daf-range-highlight-last');
      el.style.left = `${b.left - originRect.left}px`;
      el.style.top = `${b.top - originRect.top}px`;
      el.style.width = `${b.right - b.left}px`;
      el.style.height = `${b.bottom - b.top}px`;
      overlay.appendChild(el);
    }
  }
}

const MAX_PHRASE_WORDS = 20;
const CONTEXT_WINDOW_WORDS = 30;

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

// Module-level session caches shared across remounts.
import type { DafContext, IdentifiedRabbi } from './dafContext';

const dafContextSessionCache = new Map<string, DafContext>();
const analysisSessionCache = new Map<string, DafAnalysis>();
const halachaSessionCache = new Map<string, HalachaResult>();

const GEN_KEY = 'daf.showGenMarkers';
function loadToggle(key: string, def: boolean): boolean {
  if (typeof localStorage === 'undefined') return def;
  const v = localStorage.getItem(key);
  return v === null ? def : v === 'true';
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

  const ref = createMemo<Ref>(() => ({ tractate: tractate(), page: page() }));
  const [daf] = createResource(ref, fetchDaf);

  // Unified per-daf state — the single source of truth for underlines,
  // timeline, geography map, and bio sidebar. Populated from /api/daf-context.
  const [dafContext, setDafContext] = createSignal<DafContext | null>(null);
  const [genLoading, setGenLoading] = createSignal(false);
  const [genError, setGenError] = createSignal<string | null>(null);
  const [showGenMarkers, setShowGenMarkers] = createSignal(loadToggle(GEN_KEY, true));

  // Back-compat: underline injection + timeline take a GenerationRabbi[]; derive it.
  const generations = createMemo<GenerationRabbi[] | null>(() => {
    const ctx = dafContext();
    if (!ctx) return null;
    return ctx.rabbis.map((r) => ({ name: r.name, nameHe: r.nameHe, generation: r.generation }));
  });

  // Back-compat view for the GeographyMap — same shape as the old rabbiPlaces
  // signal but derived from dafContext so there's only one fetch.
  const rabbiPlaces = createMemo(() => {
    const ctx = dafContext();
    if (!ctx) return null;
    const m = new Map<string, { places: string[]; region: 'israel' | 'bavel' | null; canonical: string; bio?: string | null; wiki?: string | null; image?: string | null; generation?: string | null; moved?: 'bavel->israel' | 'israel->bavel' | 'both' | null }>();
    for (const r of ctx.rabbis) {
      m.set(r.name, {
        places: r.places,
        region: r.region,
        canonical: r.name,
        bio: r.bio, wiki: r.wiki, image: r.image, generation: r.generation,
        moved: r.moved,
      });
    }
    return m;
  });

  // Argument analysis state (for gutter icons + sidebar)
  const [analysis, setAnalysis] = createSignal<DafAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = createSignal(false);
  const [analysisError, setAnalysisError] = createSignal<string | null>(null);

  // Halacha state (for gutter icons + sidebar)
  const [halacha, setHalacha] = createSignal<HalachaResult | null>(null);
  const [halachaLoading, setHalachaLoading] = createSignal(false);
  const [halachaError, setHalachaError] = createSignal<string | null>(null);

  // Sidebar state
  const [sidebar, setSidebar] = createSignal<SidebarContent | null>(null);
  const [activeRabbi, setActiveRabbi] = createSignal<string | null>(null);

  // Geography-driven highlight: when the user clicks a city/region on the
  // GeographyMap, we highlight every rabbi in the set across the whole daf,
  // not scoped to a single argument section.
  const [activeLocation, setActiveLocation] = createSignal<string | null>(null);
  const [activeLocationRabbis, setActiveLocationRabbis] = createSignal<string[]>([]);

  // Ref to the DafRenderer's .daf-root — resolved imperatively because
  // DafRenderer renders it internally.
  const [dafRootEl, setDafRootEl] = createSignal<HTMLElement | null>(null);

  createEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GEN_KEY, String(showGenMarkers()));
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

  createEffect(() => {
    const t = tractate();
    const p = page();
    const key = `${t}:${p}`;
    setGenError(null);
    const cached = dafContextSessionCache.get(key);
    if (cached) { setDafContext(cached); setGenLoading(false); return; }
    setDafContext(null);

    const controller = new AbortController();
    const url = (cachedOnly: boolean, stage2 = false) =>
      `/api/daf-context/${encodeURIComponent(t)}/${p}`
      + (stage2 ? '?stage=2' : cachedOnly ? '?cached_only=1' : '');

    // Stage 2 poller — upgrades the rabbi set once Kimi+thinking finishes.
    const pollStage2 = async () => {
      const delays = [3000, 5000, 8000, 12000, 20000, 30000];
      for (const d of delays) {
        await new Promise((r) => setTimeout(r, d));
        if (controller.signal.aborted) return;
        if (t !== tractate() || p !== page()) return;
        try {
          const res = await fetch(url(false, true), { signal: controller.signal });
          if (res.status === 204) continue;
          if (!res.ok) continue;
          const json = (await res.json()) as { rabbis?: IdentifiedRabbi[]; _stage?: number };
          if (json.rabbis && json._stage === 2) {
            const ctx = { rabbis: json.rabbis };
            dafContextSessionCache.set(key, ctx);
            setDafContext(ctx);
            return;
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
        }
      }
    };

    const go = async () => {
      const fetchOne = async (cachedOnly: boolean): Promise<{ ctx: DafContext; stage: number } | null> => {
        const res = await fetch(url(cachedOnly), { signal: controller.signal });
        if (res.status === 404) return null;
        const json = (await res.json()) as { rabbis?: IdentifiedRabbi[]; _stage?: number; error?: string; attempts?: string[] };
        if (!res.ok || json.error) {
          const detail = (json.error ?? '') + ' ' + (json.attempts ?? []).join(' ');
          if (/1031|UpstreamError/i.test(detail)) throw new Error('Cloudflare AI temporarily unavailable (1031).');
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (!json.rabbis) return null;
        return { ctx: { rabbis: json.rabbis }, stage: json._stage ?? 1 };
      };
      try {
        const cached = await fetchOne(true);
        if (t !== tractate() || p !== page()) return;
        if (cached) {
          dafContextSessionCache.set(key, cached.ctx);
          setDafContext(cached.ctx);
          if (cached.stage === 1) void pollStage2();
          return;
        }
        setGenLoading(true);
        const fresh = await fetchOne(false);
        if (t !== tractate() || p !== page()) return;
        if (fresh) {
          dafContextSessionCache.set(key, fresh.ctx);
          setDafContext(fresh.ctx);
          if (fresh.stage === 1) void pollStage2();
        }
      } catch (err) {
        if (t !== tractate() || p !== page()) return;
        if ((err as Error).name === 'AbortError') return;
        setGenError(String((err as Error).message ?? err));
      } finally {
        if (t === tractate() && p === page()) setGenLoading(false);
      }
    };
    void go();
    return () => controller.abort();
  });

  // Analyze (argument structure). Probe cache first; if nothing is cached,
  // auto-kick off a fresh run so the Geography + sidebar aren't blocked
  // on an explicit "Analyze" click. Kimi K2.6 with thinking runs in ~30-90s
  // so auto-running is tolerable per daf.
  createEffect(() => {
    const t = tractate();
    const p = page();
    const key = `${t}:${p}`;
    const cached = analysisSessionCache.get(key);
    if (cached) { setAnalysis(cached); return; }
    setAnalysis(null);
    const controller = new AbortController();
    fetch(`/api/analyze/${encodeURIComponent(t)}/${p}?cached_only=1`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 200) return (await res.json()) as DafAnalysis;
        return null;
      })
      .then((d) => {
        if (t !== tractate() || p !== page()) return;
        if (d && !d.error) {
          analysisSessionCache.set(key, d);
          setAnalysis(d);
          return;
        }
        // Cache miss — auto-run a fresh analysis in the background so the
        // Geography tab populates without user interaction.
        if (!analysisLoading()) void runAnalysis();
      })
      .catch(() => {});
    onCleanup(() => controller.abort());
  });

  // (rabbiPlaces is now derived from dafContext; no extra fetch needed.)

  // Halacha — probe cache first; auto-kick off a fresh run on cache miss
  // so the ⚖ icons populate without requiring an explicit click.
  createEffect(() => {
    const t = tractate();
    const p = page();
    const key = `${t}:${p}`;
    const cached = halachaSessionCache.get(key);
    if (cached) { setHalacha(cached); return; }
    setHalacha(null);
    const controller = new AbortController();
    fetch(`/api/halacha/${encodeURIComponent(t)}/${p}?cached_only=1`, { signal: controller.signal })
      .then(async (res) => res.status === 200 ? (await res.json()) as HalachaResult : null)
      .then((d) => {
        if (t !== tractate() || p !== page()) return;
        if (d && !d.error) {
          halachaSessionCache.set(key, d);
          setHalacha(d);
          return;
        }
        if (!halachaLoading()) void runHalacha();
      })
      .catch(() => {});
    onCleanup(() => controller.abort());
  });

  // Manual trigger for the slow Kimi argument analysis (first-time per daf).
  const runAnalysis = async () => {
    const t = tractate();
    const p = page();
    const key = `${t}:${p}`;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`/api/analyze/${encodeURIComponent(t)}/${p}`);
      const d = (await res.json()) as DafAnalysis & { attempts?: string[] };
      if (t !== tractate() || p !== page()) return;
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      analysisSessionCache.set(key, d);
      setAnalysis(d);
    } catch (err) {
      if (t !== tractate() || p !== page()) return;
      setAnalysisError(String((err as Error).message ?? err));
    } finally {
      if (t === tractate() && p === page()) setAnalysisLoading(false);
    }
  };

  const runHalacha = async () => {
    const t = tractate();
    const p = page();
    const key = `${t}:${p}`;
    setHalachaLoading(true);
    setHalachaError(null);
    try {
      const res = await fetch(`/api/halacha/${encodeURIComponent(t)}/${p}`);
      const d = (await res.json()) as HalachaResult & { attempts?: string[] };
      if (t !== tractate() || p !== page()) return;
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      halachaSessionCache.set(key, d);
      setHalacha(d);
    } catch (err) {
      if (t !== tractate() || p !== page()) return;
      setHalachaError(String((err as Error).message ?? err));
    } finally {
      if (t === tractate() && p === page()) setHalachaLoading(false);
    }
  };

  // Build a Map<name, GenerationId> so the sidebar can color-code each rabbi.
  const generationByName = createMemo<Map<string, GenerationId>>(() => {
    const m = new Map<string, GenerationId>();
    for (const r of generations() ?? []) m.set(r.name, r.generation);
    return m;
  });

  // Reset sidebar + trigger-error state on daf change.
  createEffect(() => {
    void tractate(); void page();
    setSidebar(null);
    setActiveRabbi(null);
    setActiveLocation(null);
    setActiveLocationRabbis([]);
    setAnalysisError(null);
    setHalachaError(null);
    setAnalysisLoading(false);
    setHalachaLoading(false);
  });

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

    const sectionRanges: Range[] = [];
    const halachaRanges: Range[] = [];

    const collectRange = (range: Range, bucket: 'section' | 'halacha') => {
      if (range.collapsed) return;
      if (bucket === 'section') sectionRanges.push(range);
      else halachaRanges.push(range);
    };

    // Argument: whole section (no rabbi) or a single rabbi's opinion range(s).
    if (s?.kind === 'argument') {
      const idx = s.index;
      const sectionAnchor = dafRootDiv.querySelector<HTMLElement>(
        `.daf-argument-anchor[data-idx="${idx}"]`,
      );
      const nextSectionAnchor = dafRootDiv.querySelector<HTMLElement>(
        `.daf-argument-anchor[data-idx="${idx + 1}"]`,
      );
      const mainText = dafRootDiv.querySelector<HTMLElement>('.daf-main .daf-text');

      const rangeBetween = (start: Node, end: Node | null): Range | null => {
        if (!mainText) return null;
        const range = document.createRange();
        range.setStartAfter(start);
        if (end) range.setEndBefore(end);
        else range.setEndAfter(mainText);
        return range;
      };

      if (name && sectionAnchor) {
        const sectionOpinions = Array.from(
          dafRootDiv.querySelectorAll<HTMLElement>(
            `.daf-opinion-anchor[data-section-idx="${idx}"]`,
          ),
        );
        let painted = 0;
        for (let i = 0; i < sectionOpinions.length; i++) {
          const op = sectionOpinions[i];
          if (op.getAttribute('data-rabbi') !== name) continue;
          const next = sectionOpinions[i + 1] ?? nextSectionAnchor ?? null;
          const range = rangeBetween(op, next);
          if (range) { collectRange(range, 'section'); painted++; }
        }
        // If we couldn't locate any opinion anchor for this rabbi (the
        // model didn't emit an opinionStart, or the injected marker
        // missed), fall back to highlighting the whole section so the
        // user still sees the relevant block.
        if (painted === 0) {
          const range = rangeBetween(sectionAnchor, nextSectionAnchor);
          if (range) collectRange(range, 'section');
        }
      } else if (sectionAnchor) {
        const range = rangeBetween(sectionAnchor, nextSectionAnchor);
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
    paintRangeOverlay(overlay, dafRootDiv, sectionRanges, 'section');
    paintRangeOverlay(overlay, dafRootDiv, halachaRanges, 'halacha');

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
  };

  createEffect(() => {
    // Re-run when any of these change.
    void tokenized(); void sidebar(); void activeRabbi(); void activeLocationRabbis();
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
    const d = daf();
    if (!d) return null;
    let main = tokenizeHebrewHtml(d.mainText.hebrew);
    let inner = d.rashi ? tokenizeHebrewHtml(d.rashi.hebrew) : '';
    let outer = d.tosafot ? tokenizeHebrewHtml(d.tosafot.hebrew) : '';

    // Sefaria segment alignment — tag each .daf-word in the main column with
    // `data-seg="<idx>"` so commentary anchors (Rashi/Tosafot/others) can be
    // resolved into concrete span ranges for highlighting.
    const mainSegs = (d as unknown as { mainSegmentsHe?: string[] }).mainSegmentsHe ?? [];
    if (mainSegs.length > 0) {
      const { html } = injectSegmentMarkers(main, mainSegs);
      main = html;
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

    const rabbis = generations();
    if (rabbis && showGenMarkers()) {
      main = injectRabbiUnderlines(main, rabbis);
      // Rabbi names also appear in commentaries; underline there too.
      if (inner) inner = injectRabbiUnderlines(inner, rabbis);
      if (outer) outer = injectRabbiUnderlines(outer, rabbis);
    }

    // Tannaitic quotation markers (דתנן/דתניא/דתני) use the same underline
    // family as rabbi generations (dashed variant, Tanna-era blue). Gate on
    // the same toggle so it's one conceptual feature.
    if (showGenMarkers()) {
      main = injectTannaiticMarkers(main);
      if (inner) inner = injectTannaiticMarkers(inner);
      if (outer) outer = injectTannaiticMarkers(outer);
    }

    const ctx = { tractate: tractate(), page: page() };

    // Argument-section anchors: one per section that has a Hebrew excerpt.
    const a = analysis();
    if (a) {
      const anchors = a.sections
        .map((s, i) => ({ excerpt: s.excerpt ?? '', index: i }))
        .filter((x) => x.excerpt.length > 0);
      if (anchors.length > 0) main = injectAnchorMarkers(main, anchors, 'daf-argument-anchor', ctx);
      // Per-rabbi opinion anchors so the highlight can narrow to one rabbi's
      // statement (rather than the whole section) when the sidebar surfaces
      // a specific rabbi.
      main = injectOpinionMarkers(main, a.sections, ctx);
    }

    // Halacha anchors: one per topic with an excerpt.
    const h = halacha();
    if (h) {
      const anchors = h.topics
        .map((t, i) => ({ excerpt: t.excerpt ?? '', index: i }))
        .filter((x) => x.excerpt.length > 0);
      if (anchors.length > 0) main = injectAnchorMarkers(main, anchors, 'daf-halacha-anchor', ctx);
    }

    return { main, inner, outer };
  });

  // Changes to this key force GutterIcons to re-measure anchor positions.
  const gutterKey = createMemo(() => {
    const t = tokenized();
    if (!t) return '';
    return `${tractate()}:${page()}:${t.main.length}:${analysis()?.sections.length ?? 0}:${halacha()?.topics.length ?? 0}`;
  });

  const openArgument = (index: number) => {
    const a = analysis();
    if (!a || !a.sections[index]) return;
    setActiveRabbi(null);
    setSidebar({ kind: 'argument', section: a.sections[index], index });
  };

  const openHalacha = (index: number) => {
    const h = halacha();
    if (!h || !h.topics[index]) return;
    setActiveRabbi(null);
    setSidebar({ kind: 'halacha', topic: h.topics[index], index });
  };

  const onGutterClick = (kind: 'argument' | 'halacha', index: number) => {
    // Toggle: clicking the already-active gutter icon closes the sidebar and
    // clears the span highlight.
    const current = sidebar();
    if (current && current.kind === kind && 'index' in current && current.index === index) {
      setSidebar(null);
      setActiveRabbi(null);
      return;
    }
    if (kind === 'argument') openArgument(index);
    else openHalacha(index);
  };

  const sidebarActiveKey = createMemo(() => {
    const s = sidebar();
    if (!s) return null;
    if (s.kind === 'rabbi') return `rabbi:${s.rabbi.name}`;
    return `${s.kind}:${s.index}`;
  });

  const onHighlightLocation = (cityName: string | null, rabbiNames: string[]) => {
    setActiveRabbi(null);
    setSidebar(null);
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
      setActive({
        word,
        anchor: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
        els,
        hebrewBefore: before,
        hebrewAfter: after,
      });
    }
    if (e) e.stopPropagation();
  };

  // Click handler shared by text / map / timeline / sidebar — opens the rabbi
  // card AND highlights every mention of that rabbi across the daf.
  const openRabbi = (name: string) => {
    const ctx = dafContext();
    const r = ctx?.rabbis.find((x) => x.name === name) ?? null;
    if (!r) {
      setActiveRabbi(name);
      return;
    }
    setActiveRabbi(r.name);
    setSidebar({ kind: 'rabbi', rabbi: r });
  };

  // On mouseup: prefer a text selection snapped to word boundaries over a plain
  // word click. Any .daf-word element intersecting the selection range counts
  // as "selected", so starting a drag mid-word includes the whole word.
  const onMouseUpRoot = (e: MouseEvent) => {
    const sel = window.getSelection();

    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const snapped = collectSnappedWords(sel.getRangeAt(0));
      if (snapped.length >= 2 && snapped.length <= MAX_PHRASE_WORDS) {
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
    // Click on a rabbi name → open the bio card + highlight, skip translation.
    const rabbiEl = target.closest('.rabbi-underline') as HTMLElement | null;
    if (rabbiEl) {
      const rabbiName = rabbiEl.getAttribute('data-rabbi');
      if (rabbiName) { openRabbi(rabbiName); return; }
    }
    const wordEl = target.closest('.daf-word') as HTMLElement | null;
    if (!wordEl) return;
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
    <main
      style={{
        padding: '1rem',
        'font-family': 'system-ui, sans-serif',
        display: 'flex',
        'align-items': 'flex-start',
        gap: '1rem',
      }}
    >
      <section style={{ flex: 1, 'min-width': 0 }}>
      <header style={{ display: 'flex', 'align-items': 'center', gap: '0.75rem', 'flex-wrap': 'wrap', 'margin-bottom': '1rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.25rem' }}>Talmud</h1>

        <select
          value={tractate()}
          onChange={(e) => setTractateAndSync(e.currentTarget.value)}
          style={{ padding: '0.4rem 0.55rem', 'font-size': '0.95rem' }}
        >
          <For each={TRACTATE_OPTIONS}>
            {(opt) => <option value={opt.value}>{opt.value} · {opt.label}</option>}
          </For>
        </select>

        <div style={{ display: 'flex', 'align-items': 'center', gap: '0.3rem' }}>
          <button onClick={() => go(prevPage(page()))} style={{ padding: '0.35rem 0.6rem', cursor: 'pointer' }}>←</button>
          <input
            type="number"
            min={2}
            value={pageNum()}
            onInput={(e) => setPageNum(Number(e.currentTarget.value))}
            style={{ width: '4rem', padding: '0.35rem 0.4rem', 'font-size': '0.95rem', 'text-align': 'center' }}
          />
          <button
            onClick={toggleAmud}
            style={{
              padding: '0.35rem 0.65rem',
              cursor: 'pointer',
              'font-weight': 'bold',
              'min-width': '2rem',
              background: pageAmud() === 'a' ? '#8a2a2b' : '#0066cc',
              color: 'white',
              border: 'none',
              'border-radius': '4px',
            }}
            title="Toggle amud (side)"
          >
            {pageAmud()}
          </button>
          <button onClick={() => go(nextPage(page()))} style={{ padding: '0.35rem 0.6rem', cursor: 'pointer' }}>→</button>
        </div>

        <span style={{ color: '#888', 'font-size': '0.85rem' }}>
          {tractate()} {page()} · ← / → to navigate · click any word to translate
        </span>
      </header>

      {/* Generation timeline — spans the daf's content width, above the daf. */}
      <GenerationTimeline
        rabbis={generations()}
        activeGeneration={activeGenerationId()}
        onHighlightGeneration={onHighlightGeneration}
        width={520}
        showGenMarkers={showGenMarkers()}
        onToggleGenMarkers={setShowGenMarkers}
        genLoading={genLoading()}
        genError={genError()}
      />

      <div onMouseUp={onMouseUpRoot} style={{ display: 'flex', 'justify-content': 'center' }}>
        <Show
          when={!daf.loading && tokenized()}
          fallback={
            <p style={{ color: '#888', 'font-style': 'italic' }}>
              {daf.error ? `Error: ${String(daf.error)}` : 'Loading…'}
            </p>
          }
          keyed
        >
          {(t) => (
            <div
              ref={setDafRootEl as (el: HTMLDivElement) => void}
              style={{ position: 'relative' }}
            >
              <DafRenderer
                main={t.main}
                inner={t.inner}
                outer={t.outer}
                amud={pageAmud()}
                options={{ contentWidth: 520, mainWidth: 0.48 }}
              />
              <GutterIcons
                containerRef={dafRootEl}
                triggerKey={gutterKey()}
                onClick={onGutterClick}
                kind="argument"
                x={ARG_X}
                edgeX={ARG_EDGE_X}
                activeKey={sidebarActiveKey()}
              />
              <GutterIcons
                containerRef={dafRootEl}
                triggerKey={gutterKey()}
                onClick={onGutterClick}
                kind="halacha"
                x={HALACHA_X}
                edgeX={HALACHA_EDGE_X}
                activeKey={sidebarActiveKey()}
              />
            </div>
          )}
        </Show>
      </div>

      <Show when={analysisLoading() || halachaLoading() || analysisError() || halachaError()}>
        <section
          style={{
            'margin-top': '1rem',
            'max-width': '720px',
            'margin-left': 'auto',
            'margin-right': 'auto',
            display: 'flex',
            gap: '0.75rem',
            'flex-wrap': 'wrap',
            'align-items': 'center',
            'justify-content': 'center',
            'font-size': '0.75rem',
            color: '#888',
          }}
        >
          <Show when={analysisLoading()}>
            <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.4rem' }}>
              <span style={{
                display: 'inline-block', width: '0.75rem', height: '0.75rem',
                'border-radius': '50%',
                border: '2px solid #d6d3d1', 'border-top-color': '#8a2a2b',
                animation: 'daf-spin 0.8s linear infinite',
              }} />
              Analyzing arguments…
            </span>
          </Show>
          <Show when={halachaLoading()}>
            <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.4rem' }}>
              <span style={{
                display: 'inline-block', width: '0.75rem', height: '0.75rem',
                'border-radius': '50%',
                border: '2px solid #d6d3d1', 'border-top-color': '#1e40af',
                animation: 'daf-spin 0.8s linear infinite',
              }} />
              Identifying halacha…
            </span>
          </Show>
          <Show when={analysisError()}>
            <span style={{ color: '#c33' }}>Arguments: {analysisError()}</span>
          </Show>
          <Show when={halachaError()}>
            <span style={{ color: '#c33' }}>Halacha: {halachaError()}</span>
          </Show>
          <style>{`@keyframes daf-spin { to { transform: rotate(360deg); } }`}</style>
        </section>
      </Show>

      <Show when={active()}>
        {(a) => (
          <TranslationPopup
            word={a().word}
            tractate={tractate()}
            page={page()}
            anchor={a().anchor}
            hebrewBefore={a().hebrewBefore}
            hebrewAfter={a().hebrewAfter}
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
          Usage &amp; reports
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
          Alignment debug
        </a>
      </footer>
      </section>

      <aside
        style={{
          position: 'sticky',
          top: '1rem',
          'align-self': 'flex-start',
          'max-height': 'calc(100vh - 2rem)',
          width: '380px',
          'flex-shrink': 0,
          display: 'flex',
          'flex-direction': 'column',
          gap: '0.75rem',
          overflow: 'auto',
        }}
      >
        <GeographyMap
          analysis={analysis()}
          onHighlightLocation={onHighlightLocation}
          activeLocation={activeLocation()}
          tractate={tractate()}
          page={page()}
          rabbiPlaces={rabbiPlaces()}
          analysisLoading={analysisLoading()}
          generationByName={generationByName()}
          onHighlightSingleRabbi={openRabbi}
        />
        <ArgumentSidebar
          content={sidebar()}
          tractate={tractate()}
          page={page()}
          activeRabbi={activeRabbi()}
          onClose={() => { setSidebar(null); setActiveRabbi(null); }}
          onHighlightRabbi={(name) => (name ? openRabbi(name) : setActiveRabbi(null))}
          generationByName={generationByName()}
        />
      </aside>
    </main>
  );
}
