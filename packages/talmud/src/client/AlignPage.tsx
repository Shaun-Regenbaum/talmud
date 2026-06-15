/**
 * Alignment workbench — the sources spine.
 *
 * A SOURCES-centred debug view. The daf renders as continuous text (the same
 * tokenize -> segment-marker pipeline the reader uses), bracketed by the last
 * line of the previous amud and the first line of the next amud in gray. The
 * right column is one scrollable, category-filtered list of EVERY source —
 * hovering a row highlights what it anchors to on the spine (and scrolls it into
 * view): a segment span for line/page sources, or just the rabbi's NAME (the
 * `rabbi` mark's own occurrences) for name-anchored entities.
 *
 * Read-only — the page never triggers generation or LLM spend.
 */

import { isReferenceSource } from '@corpus/core/context/placement';
import type { ContextItem } from '@corpus/core/context/types';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  type JSX,
  onMount,
  Show,
} from 'solid-js';
import { TRACTATE_OPTIONS } from '../lib/sefref';
import { colorForKind } from './GutterIcons';
import type { GenerationId } from './generations';
import { injectHadran } from './injectHadran';
import { injectRabbiUnderlines } from './injectRabbiUnderlines';
import { injectSegmentMarkers } from './injectSegmentMarkers';
import { RunTreeDag } from './RunTreeDag';
import { tokenizeHebrewHtml } from './tokenize';

interface DafResp {
  mainText?: { hebrew?: string };
  mainSegmentsHe?: string[];
}
interface SourceTiming {
  fetcher: string;
  sources: string[];
  ms: number;
  cache: 'hit' | 'miss' | 'mixed' | 'unknown';
}
interface CtxResp {
  items?: ContextItem[];
  timing?: SourceTiming[];
}
interface CostStamp {
  billedUsd: number | null;
  estimatedUsd: number | null;
  tokensIn: number;
  tokensOut: number;
}
interface SegInst {
  startSegIdx: number;
  endSegIdx: number;
  label: string;
}
interface NameInst {
  name: string;
  nameHe: string;
  generation: string;
  excerpt: string;
}
interface MarkMeta {
  cache_hit: boolean;
  elapsed_ms: number;
  model: string;
  recipe_hash: string | null;
  cost: CostStamp | null;
}
interface MarkRow {
  id: string;
  kind: string;
  label: string;
  anchorBy: 'segment' | 'name' | 'whole-daf';
  cached: boolean;
  instances: (SegInst | NameInst)[];
  meta: MarkMeta | null;
}
interface MarksResp {
  marks?: MarkRow[];
}
interface Entity {
  key: string;
  name: string;
  nameHe: string;
  nameNorm: string;
  extra: string;
  segs: number[];
}
type Detail =
  | null
  | { t: 'src'; key: string }
  | { t: 'gen'; mid: string }
  | { t: 'ent'; key: string };

const fetchJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
};
const fmtMs = (n: number) => (n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(1)}s`);
const fmtUsd = (u: number | null | undefined) =>
  u == null ? '—' : u < 0.01 ? `$${u.toFixed(4)}` : `$${u.toFixed(3)}`;
const esc = (s: string | undefined) =>
  (s ?? '').replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!,
  );
const cssEsc = (s: string) => s.replace(/["\\]/g, '\\$&');
const normHe = (s = '') =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[׳״'"]/g, '')
    .replace(/[^א-ת ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^| )ר( |$)/g, '$1רבי$2');

function adjPage(page: string, dir: 'prev' | 'next'): string | null {
  const m = page.trim().match(/^(\d+)([ab])$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const a = m[2].toLowerCase();
  if (dir === 'next') return a === 'a' ? `${n}b` : `${n + 1}a`;
  if (a === 'b') return `${n}a`;
  return n <= 2 ? null : `${n - 1}b`;
}

const SA =
  'viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const GLYPH: Record<string, string> = {
  argument: `<svg ${SA}><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"/></svg>`,
  halacha: `<svg ${SA}><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381"/><path d="m16 16 6-6"/><path d="m21.5 10.5-8-8"/><path d="m8 8 6-6"/><path d="m8.5 7.5 8 8"/></svg>`,
  chart: `<svg ${SA}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>`,
  aggadata: `<svg ${SA}><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`,
  rabbi: `<svg ${SA}><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`,
  place: `<svg ${SA}><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`,
  yerushalmi: '<span class="aw-heb">י</span>',
  rishonim: '<span class="aw-heb">ר</span>',
  pesuk: '<span class="aw-heb">פ</span>',
};
const GUTTER_KINDS = new Set([
  'argument',
  'halacha',
  'chart',
  'aggadata',
  'yerushalmi',
  'rishonim',
  'pesuk',
]);
const kindColor = (k: string): string =>
  GUTTER_KINDS.has(k)
    ? colorForKind(k as Parameters<typeof colorForKind>[0])
    : k === 'rabbi'
      ? '#0066cc'
      : k === 'place'
        ? '#9a3412'
        : '#222';
const markIconHtml = (kind: string, ring = false) =>
  `<span class="aw-ic" style="background:${kindColor(kind)}${ring ? `;box-shadow:0 0 0 2px ${kindColor(kind)}60` : ''}" title="${kind}">${GLYPH[kind] ?? ''}</span>`;

export function AlignPage(): JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const [tractate, setTractate] = createSignal(params.get('tractate') ?? 'Berakhot');
  const [page, setPage] = createSignal(params.get('page') ?? '2a');
  const [cat, setCat] = createSignal('all');
  const [hl, setHl] = createSignal<number[]>([]); // segment highlight (hover)
  const [pin, setPin] = createSignal<number[]>([]); // segment highlight (pinned)
  const [hlWords, setHlWords] = createSignal<number[]>([]); // word highlight (place names)
  const [pinWords, setPinWords] = createSignal<number[]>([]);
  const [hlRabbi, setHlRabbi] = createSignal<string | null>(null); // rabbi name (via injectRabbiUnderlines)
  const [pinRabbi, setPinRabbi] = createSignal<string | null>(null);
  const [hlAdj, setHlAdj] = createSignal<'prev' | 'next' | null>(null);
  const [prevOpen, setPrevOpen] = createSignal(false);
  const [nextOpen, setNextOpen] = createSignal(false);
  const togglePrevOpen = () => setPrevOpen((o) => !o);
  const toggleNextOpen = () => setNextOpen((o) => !o);
  const [detail, setDetail] = createSignal<Detail>(null);

  const ref = createMemo(() => ({ t: tractate(), p: page() }));
  const [daf] = createResource(ref, (r) =>
    fetchJson<DafResp>(`/api/daf/${encodeURIComponent(r.t)}/${r.p}`),
  );
  const [ctx] = createResource(ref, (r) =>
    fetchJson<CtxResp>(`/api/context/${encodeURIComponent(r.t)}/${r.p}`).catch(() => ({
      items: [],
      timing: [],
    })),
  );
  const [marksRes] = createResource(ref, (r) =>
    fetchJson<MarksResp>(`/api/marks/${encodeURIComponent(r.t)}/${r.p}`).catch(() => ({
      marks: [],
    })),
  );
  const prevRef = createMemo(() => {
    const p = adjPage(page(), 'prev');
    return p ? { t: tractate(), p } : null;
  });
  const nextRef = createMemo(() => {
    const p = adjPage(page(), 'next');
    return p ? { t: tractate(), p } : null;
  });
  const [prevDaf] = createResource(prevRef, (r) =>
    fetchJson<DafResp>(`/api/daf/${encodeURIComponent(r.t)}/${r.p}`).catch(() => ({})),
  );
  const [nextDaf] = createResource(nextRef, (r) =>
    fetchJson<DafResp>(`/api/daf/${encodeURIComponent(r.t)}/${r.p}`).catch(() => ({})),
  );

  const items = () => ctx()?.items ?? [];
  const timing = () => ctx()?.timing ?? [];
  const allMarks = () =>
    // whole-daf marks (geography, daf-background, …) anchor to the spine as a
    // whole, so they carry no instances — keep them on `cached` alone.
    (marksRes()?.marks ?? []).filter(
      (m) => m.cached && (m.instances.length > 0 || m.anchorBy === 'whole-daf'),
    );
  const segMarks = () => allMarks().filter((m) => m.anchorBy === 'segment');
  const nameMarks = () => allMarks().filter((m) => m.anchorBy === 'name');
  const wholeDafMarks = () => allMarks().filter((m) => m.anchorBy === 'whole-daf');
  const onLine = () => items().filter((i) => i.segs.length > 0);
  const offLine = () => items().filter((i) => i.segs.length === 0);
  const byKey = createMemo(() => new Map(items().map((i) => [i.key, i])));
  const meAmud = () => (/b$/i.test(page()) ? 'b' : 'a');
  const siblingAdj = (): 'prev' | 'next' => (meAmud() === 'a' ? 'next' : 'prev');

  // the rabbi mark's name anchors, fed to the SAME matcher the reader uses
  // (longest-name-first + claimed-word tracking ⇒ a bare רב/רבי can't grab the
  // title word of a longer name like רב ששת). Each match carries data-rabbi.
  const rabbiList = createMemo(() => {
    const m = nameMarks().find((x) => x.id === 'rabbi');
    return m
      ? (m.instances as NameInst[])
          .filter((i) => i.nameHe)
          .map((i) => ({
            name: i.name,
            nameHe: i.nameHe,
            generation: i.generation as GenerationId,
          }))
      : [];
  });
  const rendered = createMemo(() => {
    const html = daf()?.mainText?.hebrew;
    if (!html) return '';
    const segHtml = injectSegmentMarkers(
      injectHadran(tokenizeHebrewHtml(html)),
      daf()?.mainSegmentsHe ?? [],
    ).html;
    return injectRabbiUnderlines(segHtml, rabbiList());
  });
  const segCount = () => daf()?.mainSegmentsHe?.length ?? 0;
  const allSegs = () => Array.from({ length: segCount() }, (_, i) => i);
  const segNorm = createMemo(() => (daf()?.mainSegmentsHe ?? []).map(normHe));

  const entitiesFor = (m: MarkRow): Entity[] => {
    const segs = segNorm();
    const map = new Map<string, Entity & { _s: Set<number> }>();
    for (const inst of m.instances as NameInst[]) {
      const nh = normHe(inst.nameHe);
      const k = nh || inst.name;
      if (!k) continue;
      const e = map.get(k) ?? {
        key: `${m.id}:${k}`,
        name: inst.name,
        nameHe: inst.nameHe,
        nameNorm: nh,
        extra: inst.generation || '',
        segs: [],
        _s: new Set<number>(),
      };
      if (nh)
        segs.forEach((sg, i) => {
          if (sg.includes(nh)) e._s.add(i);
        });
      map.set(k, e);
    }
    return [...map.values()].map((e) => ({
      key: e.key,
      name: e.name,
      nameHe: e.nameHe,
      nameNorm: e.nameNorm,
      extra: e.extra,
      segs: [...e._s].sort((a, b) => a - b),
    }));
  };
  const entityIndex = createMemo(() => {
    const m = new Map<string, Entity>();
    for (const nm of nameMarks()) for (const e of entitiesFor(nm)) m.set(e.key, e);
    return m;
  });

  const tally = createMemo(() => {
    const its = items();
    const off = its.filter((i) => i.segs.length === 0);
    return {
      total: its.length,
      line: its.length - off.length,
      off: off.length,
      unaligned: off.filter((i) => !isReferenceSource(i)).length,
    };
  });
  const rangeOfInst = (i: SegInst): number[] => {
    const o: number[] = [];
    for (let s = i.startSegIdx; s <= i.endSegIdx; s++) o.push(s);
    return o;
  };
  const cats = createMemo(() => {
    const c: { id: string; label: string; n: number }[] = [
      { id: 'all', label: 'All', n: items().length },
    ];
    if (onLine().length) c.push({ id: 'line', label: 'On a line', n: onLine().length });
    if (offLine().length) c.push({ id: 'page', label: 'Page-level', n: offLine().length });
    // "Marks" covers both segment instances and whole-daf computed marks, so
    // the chip shows (and counts) even on a daf whose only marks are whole-daf.
    const nInst = segMarks().reduce((a, m) => a + m.instances.length, 0) + wholeDafMarks().length;
    if (nInst) c.push({ id: 'marks', label: 'Marks', n: nInst });
    for (const m of nameMarks()) {
      const e = entitiesFor(m).length;
      if (e) c.push({ id: m.id, label: m.label, n: e });
    }
    return c;
  });

  // ---- spine highlight CSS: mark underlines (always), segment + word highlight ----
  const highlightCss = createMemo(() => {
    const rules: string[] = [];
    for (const m of segMarks())
      for (const inst of m.instances as SegInst[])
        for (const s of rangeOfInst(inst))
          rules.push(
            `.aw-daf .daf-word[data-seg="${s}"]{box-shadow:inset 0 -3px 0 ${kindColor(m.kind)}}`,
          );
    for (const s of [...new Set([...hl(), ...pin()])])
      rules.push(
        `.aw-daf .daf-word[data-seg="${s}"]{background:#fde68a !important;outline:1.5px solid #8a2a2b;border-radius:2px}`,
      );
    for (const w of [...new Set([...hlWords(), ...pinWords()])])
      rules.push(
        `.aw-daf .daf-word[data-word-index="${w}"]{background:#cfe3ff !important;outline:1.5px solid #0066cc;border-radius:2px}`,
      );
    for (const nm of [hlRabbi(), pinRabbi()])
      if (nm)
        rules.push(
          `.aw-daf [data-rabbi="${cssEsc(nm)}"]{background:#cfe3ff !important;outline:1.5px solid #0066cc;border-radius:3px}`,
        );
    return rules.join('\n');
  });

  const dot = (c: string) => `<span class="aw-dot" style="background:${c}"></span>`;
  const cleanRef = (s: string) => s.trim().replace(/[\s:·,–-]+$/, '');
  function srcRow(it: ContextItem): string {
    // Show what it actually IS — the reference (Mishneh Torah …, Shulchan Arukh …)
    // — as the primary label, with the generic source kind as a muted tag.
    const ref = cleanRef(it.title?.en || it.title?.he || '');
    const name = ref || it.sourceLabel;
    const tag = ref ? `<span class="aw-srctag">${esc(it.sourceLabel)}</span>` : '';
    const via = it.via ? `<span class="aw-via">${esc(it.via)}</span>` : '';
    const conf =
      it.confidence != null ? `<span class="aw-conf">${it.confidence.toFixed(2)}</span>` : '';
    return `<div class="aw-li aw-src" data-src="${esc(it.key)}" data-hl="${it.segs.join(',')}">${dot('#16a34a')}
      <span class="aw-nm aw-grow">${esc(name)}</span>${tag}${via}${conf}</div>`;
  }
  function entityRow(kind: string, e: Entity): string {
    const c = kindColor(kind);
    // rabbis locate via injectRabbiUnderlines' data-rabbi (robust); other
    // entities (places) fall back to the normalized-name word match.
    const locate =
      kind === 'rabbi' ? `data-rabbi-name="${esc(e.name)}"` : `data-name="${esc(e.nameNorm)}"`;
    return `<div class="aw-li aw-src" data-ent="${esc(e.key)}" ${locate}>${markIconHtml(kind)}
      <span class="aw-nm">${esc(e.name || e.nameHe)}</span><span class="aw-he2" dir="rtl">${esc(e.nameHe)}</span>
      ${e.extra ? `<span class="aw-via" style="background:${c}1a;color:${c}">${esc(e.extra)}</span>` : ''}
      <span class="aw-range">${e.segs.length ? `seg ${e.segs.join(', ')}` : 'no text match'}</span></div>`;
  }
  function collectRowsHtml(range: Set<number>): string {
    // group by the SOURCE id (not the label) so the two "Halacha" sources
    // (sefaria-halacha vs dafyomi:halacha) stay distinct and never read as the
    // Halacha *mark*; show the id so a context source is unambiguous.
    const groups = new Map<
      string,
      { label: string; key: string; segs: Set<number>; source: string }
    >();
    for (const it of onLine()) {
      if (!it.segs.some((s) => range.has(s))) continue;
      const g = groups.get(it.source) ?? {
        label: it.sourceLabel,
        key: it.key,
        segs: new Set(),
        source: it.source,
      };
      it.segs.forEach((s) => {
        g.segs.add(s);
      });
      groups.set(it.source, g);
    }
    const rows = [...groups.values()];
    if (!rows.length)
      return '<div class="aw-note" style="margin:.2rem 0 0">whole-daf context only</div>';
    const max = Math.max(
      ...rows.map((g) => timing().find((t) => t.sources.includes(g.source))?.ms ?? 0),
      1,
    );
    return rows
      .map((g) => {
        const t = timing().find((x) => x.sources.includes(g.source));
        const ms = t?.ms ?? 0;
        const cache = t
          ? t.cache === 'hit'
            ? 'cached'
            : t.cache === 'miss'
              ? 'fetched'
              : t.cache
          : '—';
        return `<div class="aw-wfrow aw-src" data-src="${esc(g.key)}" data-hl="${[...g.segs].join(',')}">
        <div class="aw-wflabel">${dot('#16a34a')}${esc(g.label)} <span class="aw-srcid">${esc(g.source)}</span></div>
        <div class="aw-wftrack"><div class="aw-wfbar src" style="width:${Math.max(4, (ms / max) * 100)}%"></div></div>
        <div class="aw-wfmeta">${fmtMs(ms)} · <span class="free">${cache}</span></div></div>`;
      })
      .join('');
  }
  function instRowHtml(m: MarkRow, inst: SegInst, idx: number): string {
    const c = kindColor(m.kind);
    const range = rangeOfInst(inst);
    const usd = m.meta?.cost ? (m.meta.cost.billedUsd ?? m.meta.cost.estimatedUsd) : null;
    const title = inst.label || `${m.label} #${idx + 1}`;
    const gen = m.meta
      ? `<div class="aw-wfband">generate — model run (this whole mark, ${m.instances.length} instance${m.instances.length > 1 ? 's' : ''})</div>
         <div class="aw-wfrow" data-gen="${esc(m.id)}" data-hl="${range.join(',')}"><div class="aw-wflabel">${markIconHtml(m.kind)}${esc(m.label)} run</div>
           <div class="aw-wftrack"><div class="aw-wfbar gen" style="width:100%;background:${c}"></div></div>
           <div class="aw-wfmeta">${fmtMs(m.meta.elapsed_ms)} · ${usd == null ? '<span class="free">unpriced</span>' : `<span class="cost">${fmtUsd(usd)}</span>`}</div></div>`
      : '';
    return `<div class="aw-li aw-mkrow" style="--mkc:${c}">
      <div class="aw-mkhead" data-mkhead data-hl="${range.join(',')}">${markIconHtml(m.kind, true)}<span class="aw-nm" style="color:${c}">${esc(title)}</span>
        <span class="aw-range">seg ${inst.startSegIdx}${inst.endSegIdx !== inst.startSegIdx ? `–${inst.endSegIdx}` : ''}</span><span class="aw-chev">▸</span></div>
      <div class="aw-mkdetail"><span class="aw-label" style="display:block">made from — how it was built (hover to locate · click to inspect)</span>
        <div class="aw-wf"><div class="aw-wfband">collect — sources it drew on</div>${collectRowsHtml(new Set(range))}${gen}</div></div></div>`;
  }
  // A whole-daf computed mark (geography, daf-background, tidbit, biyun,
  // argument-overview): no span/name anchor, so it highlights the whole spine
  // (data-hl="*") and exposes its generation DAG (data-gen) for debugging.
  function wholeDafRow(m: MarkRow): string {
    const c = kindColor(m.kind);
    const usd = m.meta?.cost ? (m.meta.cost.billedUsd ?? m.meta.cost.estimatedUsd) : null;
    const gen = m.meta
      ? `<div class="aw-wfband">generate — model run (whole daf)</div>
         <div class="aw-wfrow" data-gen="${esc(m.id)}" data-hl="*"><div class="aw-wflabel">${markIconHtml(m.kind)}${esc(m.label)} run</div>
           <div class="aw-wftrack"><div class="aw-wfbar gen" style="width:100%;background:${c}"></div></div>
           <div class="aw-wfmeta">${fmtMs(m.meta.elapsed_ms)} · ${usd == null ? '<span class="free">unpriced</span>' : `<span class="cost">${fmtUsd(usd)}</span>`}</div></div>`
      : '';
    return `<div class="aw-li aw-mkrow" style="--mkc:${c}">
      <div class="aw-mkhead" data-mkhead data-hl="*">${markIconHtml(m.kind, true)}<span class="aw-nm" style="color:${c}">${esc(m.label)}</span>
        <span class="aw-range">whole daf</span><span class="aw-chev">▸</span></div>
      <div class="aw-mkdetail"><span class="aw-label" style="display:block">made from — how it was built (hover to locate · click to inspect)</span>
        <div class="aw-wf">${gen || '<div class="aw-note">not generated yet</div>'}</div></div></div>`;
  }
  function scopeRowsHtml(): string {
    const me = meAmud();
    const groups = new Map<
      string,
      { label: string; key: string; count: number; ref: boolean; other: boolean }
    >();
    for (const it of offLine()) {
      const g = groups.get(it.sourceLabel) ?? {
        label: it.sourceLabel,
        key: it.key,
        count: 0,
        ref: isReferenceSource(it),
        other: false,
      };
      g.count++;
      if (it.amud && it.amud !== me) g.other = true;
      groups.set(it.sourceLabel, g);
    }
    return [...groups.values()]
      .sort((a, b) => Number(a.ref) - Number(b.ref))
      .map((g) => {
        const tag = g.other
          ? '<span class="aw-utag" style="color:#0e7490;background:#ecfeff;border-color:#a5f3fc">⊗ other amud</span>'
          : g.ref
            ? ''
            : '<span class="aw-utag">⊘ unaligned</span>';
        const hlAttr = g.other ? `data-adj="${siblingAdj()}"` : 'data-hl="*"';
        return `<div class="aw-li aw-src" data-src="${esc(g.key)}" ${hlAttr}>${dot(g.ref ? '#16a34a' : g.other ? '#0e7490' : '#fb923c')}
        <span class="aw-nm">${esc(g.label)}</span><span class="aw-x">×${g.count}</span>${tag}<span class="aw-bd">${g.ref ? 'reference' : g.other ? 'other amud' : 'no line anchor'}</span></div>`;
      })
      .join('');
  }
  function detailHtml(): string {
    const d = detail();
    if (d?.t === 'src') {
      const it = byKey().get(d.key);
      if (!it) return '';
      const t = it.title?.en || it.title?.he;
      return `<div class="aw-card aw-detail"><button class="aw-back" data-back>← back to list</button>
        <div class="aw-dtitle">${dot('#16a34a')} ${esc(it.sourceLabel)}${t ? ` — ${esc(t)}` : ''}</div>
        <div class="aw-dsub"><span class="aw-badge">source</span><span class="aw-badge">${esc(it.source)}</span>${it.via ? `<span class="aw-via">${esc(it.via)}</span>` : ''}${it.segs.length ? `<span class="aw-badge">seg ${it.segs.join(', ')}</span>` : ''}${it.amud ? `<span class="aw-badge">amud ${it.amud}</span>` : ''}${it.url ? `<a class="aw-badge" href="${esc(it.url)}" target="_blank" rel="noreferrer">open ↗</a>` : ''}</div>
        <div class="aw-dbody">${it.body?.he ? `<div class="aw-he" dir="rtl">${esc(it.body.he)}</div>` : ''}${it.body?.en ? `<div class="aw-en">${esc(it.body.en)}</div>` : ''}${!it.body?.he && !it.body?.en ? '<div class="aw-en" style="color:#94a3b8">(no body text)</div>' : ''}</div></div>`;
    }
    if (d?.t === 'ent') {
      const e = entityIndex().get(d.key);
      if (!e) return '';
      return `<div class="aw-card aw-detail"><button class="aw-back" data-back>← back to list</button>
        <div class="aw-dtitle">${markIconHtml(d.key.startsWith('places') ? 'place' : 'rabbi', true)} ${esc(e.name || e.nameHe)} <span class="aw-he2" dir="rtl" style="font-size:1rem">${esc(e.nameHe)}</span></div>
        <div class="aw-dsub">${e.extra ? `<span class="aw-badge">${esc(e.extra)}</span>` : ''}<span class="aw-badge">${e.segs.length ? `appears in seg ${e.segs.join(', ')}` : 'no text match on this daf'}</span></div>
        <div class="aw-dbody"><div class="aw-en">Highlights just the name occurrences in the daf text (the <b>rabbi</b> mark's own name anchors — not the rabbis cited inside argument sections).</div></div></div>`;
    }
    if (d?.t === 'gen') {
      const m = allMarks().find((x) => x.id === d.mid);
      if (!m?.meta) return '';
      const usd = m.meta.cost ? (m.meta.cost.billedUsd ?? m.meta.cost.estimatedUsd) : null;
      return `<div class="aw-card aw-detail"><button class="aw-back" data-back>← back to list</button>
        <div class="aw-dtitle">${markIconHtml(m.kind, true)} ${esc(m.label)} <span style="color:#94a3b8;font-weight:400;font-size:12px">· ${m.instances.length} instances</span></div>
        <div class="aw-dsub"><span class="aw-badge">generation</span><span class="aw-badge">${esc(m.meta.model)}</span><span class="aw-badge">${fmtUsd(usd)}</span><span class="aw-badge">${fmtMs(m.meta.elapsed_ms)}</span><span class="aw-badge ${m.meta.cache_hit ? 'hit' : 'miss'}">cache: ${m.meta.cache_hit ? 'hit' : 'miss'}</span></div>
        <div class="aw-dbody"><div class="aw-en">tokens ${m.meta.cost?.tokensIn ?? '?'} in / ${m.meta.cost?.tokensOut ?? '?'} out · recipe ${esc(m.meta.recipe_hash?.slice(0, 8) ?? 'n/a')}</div></div></div>`;
    }
    return '';
  }
  function listHtml(): string {
    const c = cat();
    const show = (g: string) => c === 'all' || c === g;
    const blocks: string[] = [];
    if (show('line')) {
      const line = [...onLine()]
        .sort((a, b) => Math.min(...a.segs) - Math.min(...b.segs))
        .map(srcRow)
        .join('');
      blocks.push(
        `<div class="aw-grouph">On a line · ${onLine().length}</div>${line || '<div class="aw-note">none</div>'}`,
      );
    }
    if (show('page'))
      blocks.push(
        `<div class="aw-grouph">Page-level · ${offLine().length}</div>${scopeRowsHtml() || '<div class="aw-note">none</div>'}`,
      );
    if (show('marks')) {
      const instances = segMarks().flatMap((m) =>
        (m.instances as SegInst[]).map((inst, i) => instRowHtml(m, inst, i)),
      );
      if (instances.length)
        blocks.push(
          `<div class="aw-grouph">Marks · ${instances.length}</div>${instances.join('')}`,
        );
      const wd = wholeDafMarks();
      if (wd.length)
        blocks.push(
          `<div class="aw-grouph">Whole-daf · ${wd.length}</div>${wd.map(wholeDafRow).join('')}`,
        );
    }
    for (const m of nameMarks()) {
      if (!show(m.id)) continue;
      const list = entitiesFor(m);
      if (list.length)
        blocks.push(
          `<div class="aw-grouph">${esc(m.label)} · ${list.length}</div>${list.map((e) => entityRow(m.kind, e)).join('')}`,
        );
    }
    if ((c === 'all' || c === 'marks') && !allMarks().length) {
      blocks.push(
        marksRes.loading
          ? '<div class="aw-note">loading marks…</div>'
          : '<div class="aw-note">No marks generated for this daf yet — the sources above are everything cached. Open it in the reader to generate.</div>',
      );
    }
    return `<div class="aw-list">${blocks.join('') || '<div class="aw-note">loading…</div>'}</div>`;
  }

  // The mark whose generation DAG is open (detail = gen). Rendered as a real
  // Solid component (RunTreeDag), so it lives outside the innerHTML inspector.
  const genMark = createMemo(() => {
    const d = detail();
    return d?.t === 'gen' ? (allMarks().find((x) => x.id === d.mid) ?? null) : null;
  });

  let inspEl!: HTMLDivElement;
  let spineBox!: HTMLDivElement;
  createEffect(() => {
    detail();
    ctx();
    marksRes();
    daf();
    cat();
    if (inspEl && detail()?.t !== 'gen') inspEl.innerHTML = detail() ? detailHtml() : listHtml();
  });

  function scrollIntoSpine(sel: string) {
    if (!spineBox) return;
    const el = spineBox.querySelector(sel) as HTMLElement | null;
    if (!el) return;
    const br = spineBox.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top < br.top + 8 || er.bottom > br.bottom - 8)
      spineBox.scrollTop += er.top - br.top - spineBox.clientHeight / 2 + er.height / 2;
  }
  /** Word indices of a normalized name's occurrences in the rendered daf. */
  function nameWordIdx(nameNorm: string): number[] {
    if (!spineBox || !nameNorm) return [];
    const words = [...spineBox.querySelectorAll('.aw-daf .daf-word')] as HTMLElement[];
    const wn = words.map((w) => normHe(w.textContent || ''));
    const toks = nameNorm.split(' ').filter(Boolean);
    if (!toks.length) return [];
    const out: number[] = [];
    for (let i = 0; i + toks.length <= words.length; i++) {
      let ok = true;
      for (let j = 0; j < toks.length; j++)
        if (wn[i + j] !== toks[j]) {
          ok = false;
          break;
        }
      if (ok)
        for (let j = 0; j < toks.length; j++) {
          const idx = Number(words[i + j].getAttribute('data-word-index'));
          if (Number.isFinite(idx)) out.push(idx);
        }
    }
    return out;
  }
  function clearWordish() {
    setHlWords([]);
    setHlRabbi(null);
  }
  function hoverFrom(t: HTMLElement | null) {
    if (!t) {
      setHl([]);
      clearWordish();
      setHlAdj(null);
      return;
    }
    if (t.dataset.adj) {
      setHlAdj(t.dataset.adj as 'prev' | 'next');
      setHl([]);
      clearWordish();
      scrollIntoSpine(`.aw-adj[data-adj="${t.dataset.adj}"]`);
      return;
    }
    setHlAdj(null);
    if (t.dataset.rabbiName !== undefined) {
      // rabbi: highlight just this rabbi's name spans
      setHlRabbi(t.dataset.rabbiName);
      setHl([]);
      setHlWords([]);
      scrollIntoSpine(`.aw-daf [data-rabbi="${cssEsc(t.dataset.rabbiName)}"]`);
      return;
    }
    if (t.dataset.name !== undefined) {
      // place: normalized-name word match
      const idx = nameWordIdx(t.dataset.name);
      setHlWords(idx);
      setHl([]);
      setHlRabbi(null);
      if (idx.length) scrollIntoSpine(`.aw-daf .daf-word[data-word-index="${Math.min(...idx)}"]`);
      return;
    }
    clearWordish();
    if (t.dataset.hl === '*') {
      setHl(allSegs());
      return;
    }
    const segs = t.dataset.hl ? t.dataset.hl.split(',').filter(Boolean).map(Number) : [];
    setHl(segs);
    if (segs.length) scrollIntoSpine(`.aw-daf .daf-word[data-seg="${Math.min(...segs)}"]`);
  }
  function clearPinWordish() {
    setPinWords([]);
    setPinRabbi(null);
  }
  onMount(() => {
    inspEl.addEventListener('mouseover', (e) =>
      hoverFrom(
        (e.target as HTMLElement).closest(
          '[data-hl],[data-adj],[data-name],[data-rabbi-name]',
        ) as HTMLElement | null,
      ),
    );
    inspEl.addEventListener('mouseleave', () => {
      setHl([]);
      clearWordish();
      setHlAdj(null);
    });
    inspEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-back]')) {
        setDetail(null);
        setPin([]);
        clearPinWordish();
        return;
      }
      const mh = t.closest('[data-mkhead]') as HTMLElement | null;
      if (mh) {
        mh.closest('.aw-mkrow')?.classList.toggle('open');
        return;
      }
      const gen = t.closest('[data-gen]') as HTMLElement | null;
      if (gen) {
        const m = segMarks().find((x) => x.id === gen.dataset.gen);
        const segs = m ? (m.instances as SegInst[]).flatMap(rangeOfInst) : [];
        clearPinWordish();
        setPin(segs);
        if (segs.length) scrollIntoSpine(`.aw-daf .daf-word[data-seg="${Math.min(...segs)}"]`);
        setDetail({ t: 'gen', mid: gen.dataset.gen! });
        return;
      }
      const ent = t.closest('[data-ent]') as HTMLElement | null;
      if (ent) {
        const key = ent.dataset.ent!;
        setPin([]);
        clearPinWordish();
        if (ent.dataset.rabbiName !== undefined) {
          setPinRabbi(ent.dataset.rabbiName);
          scrollIntoSpine(`.aw-daf [data-rabbi="${cssEsc(ent.dataset.rabbiName)}"]`);
        } else {
          const e = entityIndex().get(key);
          const idx = e ? nameWordIdx(e.nameNorm) : [];
          setPinWords(idx);
          if (idx.length)
            scrollIntoSpine(`.aw-daf .daf-word[data-word-index="${Math.min(...idx)}"]`);
        }
        setDetail({ t: 'ent', key });
        return;
      }
      const adj = t.closest('[data-adj]') as HTMLElement | null;
      if (adj) {
        (adj.dataset.adj === 'prev' ? setPrevOpen : setNextOpen)(true);
      }
      const sl = t.closest('.aw-src[data-src]') as HTMLElement | null;
      if (sl) {
        const it = byKey().get(sl.dataset.src!);
        clearPinWordish();
        setPin(it?.segs ?? []);
        if (it?.segs.length)
          scrollIntoSpine(`.aw-daf .daf-word[data-seg="${Math.min(...it.segs)}"]`);
        setDetail({ t: 'src', key: sl.dataset.src! });
        return;
      }
    });
  });

  const adjPreview = (d: DafResp | undefined, which: 'first' | 'last', open: boolean) => {
    const segs = d?.mainSegmentsHe ?? [];
    if (!segs.length) return '';
    return open ? segs.join(' ') : which === 'first' ? segs[0] : segs[segs.length - 1];
  };
  const go = (dir: 'prev' | 'next') => {
    const p = adjPage(page(), dir);
    if (p) setPage(p);
  };

  return (
    <main class="page-shell" style={{ '--page-max': '1480px', color: '#1a1a1a' }}>
      <style>{STYLE}</style>
      <style>{highlightCss()}</style>
      <header class="daf-header aw-header">
        <h1 class="tb-wordmark">Alignment</h1>
        <select
          class="tb-select"
          value={tractate()}
          onChange={(e) => setTractate(e.currentTarget.value)}
        >
          <For each={TRACTATE_OPTIONS}>
            {(o) => (
              <option value={o.value}>
                {o.value} · {o.label}
              </option>
            )}
          </For>
        </select>
        <div class="tb-nav">
          <button
            type="button"
            class="tb-navbtn"
            onClick={() => go('prev')}
            disabled={!adjPage(page(), 'prev')}
          >
            ‹
          </button>
          <input
            class="tb-daf"
            style={{ width: '3.2rem', 'text-align': 'center' }}
            value={page()}
            onChange={(e) => setPage(e.currentTarget.value.trim())}
          />
          <button
            type="button"
            class="tb-navbtn"
            onClick={() => go('next')}
            disabled={!adjPage(page(), 'next')}
          >
            ›
          </button>
        </div>
        <Show when={!daf.loading}>
          <span class="aw-tally">
            <b>{tally().total}</b> sources · <b>{tally().line}</b> on a line · <b>{tally().off}</b>{' '}
            daf-level ·{' '}
            <span class="warn">
              <b>{tally().unaligned}</b> unaligned
            </span>
          </span>
        </Show>
      </header>

      <Show when={daf.loading}>
        <p class="aw-note" style={{ padding: '1rem' }}>
          Loading…
        </p>
      </Show>
      <Show when={daf.error}>
        <p style={{ color: '#b91c1c', padding: '1rem' }}>Error: {String(daf.error)}</p>
      </Show>

      <div class="aw-work">
        <div>
          <div class="aw-colh">
            <span class="aw-label">Spine · HebrewBooks</span>
            <span class="aw-hint">
              hover a source to locate it · adjacent amud in gray (click to expand)
            </span>
          </div>
          <div class="aw-spinebox" ref={spineBox}>
            <Show when={adjPreview(prevDaf(), 'last', prevOpen())}>
              {/* biome-ignore lint/a11y/useSemanticElements: holds block-level children (.aw-adjlab/.aw-adjtext divs) styled by the .aw-adj class rules; a native button's content model and UA styles would break it */}
              <div
                class={`aw-adj${hlAdj() === 'prev' ? ' hot' : ''}`}
                data-adj="prev"
                role="button"
                tabIndex={0}
                onClick={togglePrevOpen}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    togglePrevOpen();
                  }
                }}
              >
                <div class="aw-adjlab">
                  ‹ prev · {adjPage(page(), 'prev')} ·{' '}
                  {prevOpen() ? 'full amud (collapse)' : 'last line (expand)'}
                </div>
                <div
                  class="aw-adjtext"
                  dir="rtl"
                  innerHTML={adjPreview(prevDaf(), 'last', prevOpen())}
                />
              </div>
            </Show>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-to-locate highlight over per-word spans in injected HTML; mouse-position-driven, not an activatable control */}
            {/* biome-ignore lint/a11y/useKeyWithMouseEvents: focusing the whole amud container has no meaningful keyboard equivalent of per-word hover */}
            <div
              class="aw-daf"
              dir="rtl"
              innerHTML={rendered()}
              onMouseOver={(e) => {
                const w = (e.target as HTMLElement).closest('.daf-word') as HTMLElement | null;
                const s = w?.getAttribute('data-seg');
                setHl(s != null ? [Number(s)] : []);
                clearWordish();
              }}
              onMouseLeave={() => setHl([])}
            />
            <Show when={adjPreview(nextDaf(), 'first', nextOpen())}>
              {/* biome-ignore lint/a11y/useSemanticElements: holds block-level children (.aw-adjlab/.aw-adjtext divs) styled by the .aw-adj class rules; a native button's content model and UA styles would break it */}
              <div
                class={`aw-adj${hlAdj() === 'next' ? ' hot' : ''}`}
                data-adj="next"
                role="button"
                tabIndex={0}
                onClick={toggleNextOpen}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleNextOpen();
                  }
                }}
              >
                <div class="aw-adjlab">
                  › next · {adjPage(page(), 'next')} ·{' '}
                  {nextOpen() ? 'full amud (collapse)' : 'first line (expand)'}
                </div>
                <div
                  class="aw-adjtext"
                  dir="rtl"
                  innerHTML={adjPreview(nextDaf(), 'first', nextOpen())}
                />
              </div>
            </Show>
          </div>
          <Show when={allMarks().length}>
            <div class="aw-legend">
              <For each={allMarks()}>
                {(m) => (
                  <span
                    style={{ display: 'inline-flex', 'align-items': 'center', gap: '.3rem' }}
                    innerHTML={`${markIconHtml(m.kind)} ${esc(m.label)}`}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
        <div>
          <div class="aw-colh">
            <span class="aw-label">All sources</span>
            <div class="aw-cats">
              <For each={cats()}>
                {(cc) => (
                  <button
                    type="button"
                    class={`aw-chip${cat() === cc.id ? ' on' : ''}`}
                    onClick={() => setCat(cc.id)}
                  >
                    {cc.label} <span class="aw-chipn">{cc.n}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
          <Show
            when={detail()?.t === 'gen'}
            fallback={
              <>
                <Show when={ctx.loading || marksRes.loading}>
                  <div class="aw-loadbar">
                    <div class="aw-loadbar-fill" />
                  </div>
                </Show>
                <div ref={inspEl} />
              </>
            }
          >
            <div class="aw-card">
              <button type="button" class="aw-back" onClick={() => setDetail(null)}>
                ← back to list
              </button>
              <Show when={genMark()}>
                {(mm) => (
                  <>
                    <div class="aw-dtitle">
                      <span innerHTML={markIconHtml(mm().kind, true)} /> {mm().label}
                      <span style={{ color: '#94a3b8', 'font-weight': 400, 'font-size': '12px' }}>
                        · build DAG ({mm().instances.length} instance
                        {mm().instances.length > 1 ? 's' : ''})
                      </span>
                    </div>
                    <div style={{ 'margin-top': '.6rem' }}>
                      <RunTreeDag tractate={tractate()} page={page()} pieceId={mm().id} />
                    </div>
                  </>
                )}
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </main>
  );
}

const STYLE = `
.aw-header{margin:0 0 1rem;padding-right:7rem}
.aw-tally{font-size:.82rem;color:#6b6b6b}.aw-tally b{color:#1a1a1a}.aw-tally .warn{color:#b45309}
.aw-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#888;font-weight:600}
.aw-work{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(380px,1fr);gap:1.4rem;align-items:start}
.aw-colh{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}.aw-hint{font-size:11px;color:#6b6b6b}
.aw-spinebox{background:#fff;border:1px solid #e5e3dc;border-radius:8px;padding:.8rem 1.1rem;position:sticky;top:.5rem;max-height:calc(100vh - 120px);overflow:auto}
.aw-daf{font-family:"Mekorot Vilna","Frank Ruhl Libre","Times New Roman",serif;font-size:1.2rem;line-height:2;text-align:justify;padding:.5rem 0}
.aw-daf .daf-word{transition:background .08s}
.aw-adj{color:#b3ada0;cursor:pointer;border-radius:4px;padding:.3rem .4rem;border:1px solid transparent}
.aw-adj:hover{background:#faf8f3}
.aw-adj.hot{background:#fff1c9;border-color:#f59e0b;color:#8a7a55}
.aw-adjlab{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#c9c3b6;margin-bottom:.15rem}
.aw-adjtext{font-family:"Mekorot Vilna","Frank Ruhl Libre",serif;font-size:1.02rem;line-height:1.8;text-align:justify}
.aw-legend{display:flex;gap:1.1rem;flex-wrap:wrap;margin-top:.7rem;font-size:11px;color:#6b6b6b;align-items:center}
.aw-ic{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;color:#fff;line-height:0;flex:none;vertical-align:middle}
.aw-heb{font-family:"Mekorot Vilna","Times New Roman",serif;font-size:11px;font-weight:700;line-height:1;color:#fff}
.aw-he2{font-family:"Mekorot Vilna","Frank Ruhl Libre",serif;color:#64748b;font-size:13px}
.aw-cats{display:flex;gap:.35rem;flex-wrap:wrap;margin-left:auto}
.aw-chip{font:inherit;font-size:11px;border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:999px;padding:.12rem .55rem;cursor:pointer;display:inline-flex;gap:.25rem;align-items:center}
.aw-chip:hover{background:#f1f5f9}.aw-chip.on{background:#1e293b;border-color:#0f172a;color:#fff}
.aw-chipn{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;opacity:.65}
.aw-loadbar{height:3px;background:#eee;border-radius:2px;overflow:hidden;margin:0 0 .5rem}
.aw-loadbar-fill{height:100%;width:35%;background:#8a2a2b;border-radius:2px;animation:awload 1.1s ease-in-out infinite}
@keyframes awload{0%{margin-left:-35%}100%{margin-left:100%}}
.aw-list{max-height:calc(100vh - 150px);overflow-y:auto;padding-right:.3rem}
.aw-grouph{font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;color:#b0aa9e;font-weight:600;margin:.9rem 0 .25rem;position:sticky;top:0;background:#fafaf7;padding:.25rem 0;z-index:1}
.aw-grouph:first-child{margin-top:0}
.aw-li{display:flex;gap:.4rem;align-items:center;padding:.34rem .15rem;border-top:1px solid #f3f1e9;font-size:12.5px}
.aw-src{cursor:pointer;border-radius:3px}.aw-src:hover{background:#f5f2ea}
.aw-nm{font-weight:600;color:#334155}.aw-x{color:#cbd5e1;font-size:11px}
.aw-grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aw-srctag{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;background:#f1efe9;border-radius:3px;padding:0 4px;line-height:1.6;flex:none}
.aw-bd{color:#6b6b6b;font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aw-dot{width:7px;height:7px;border-radius:50%;flex:none;display:inline-block}
.aw-via{font-family:ui-monospace,Menlo,monospace;font-size:10px;padding:1px 5px;border-radius:3px;background:#eef2ff;color:#6366f1}
.aw-conf{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#94a3b8}
.aw-range{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#94a3b8;margin-left:auto;white-space:nowrap}
.aw-utag{display:inline-flex;align-items:center;gap:.2rem;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#b45309;background:#fff7ed;border:1px solid #fed7aa;border-radius:3px;padding:0 4px;line-height:1.6}
.aw-note{font-size:11.5px;color:#94a3b8;padding:.3rem 0}
.aw-mkrow{flex-direction:column;align-items:stretch;gap:0;border-left:3px solid var(--mkc,#999);padding:0;margin:.3rem 0;background:#faf8f3;border-radius:0 5px 5px 0;border-top:none}
.aw-mkhead{display:flex;gap:.4rem;align-items:center;cursor:pointer;padding:.5rem .6rem}
.aw-mkhead:hover{background:#f3eee3}.aw-mkhead .aw-nm{font-weight:700}
.aw-chev{color:#b0aa9e;font-size:11px;transition:transform .12s}.aw-mkrow.open .aw-chev{transform:rotate(90deg)}
.aw-mkdetail{display:none;padding:0 .6rem .6rem}.aw-mkrow.open .aw-mkdetail{display:block}
.aw-badge{display:inline-flex;align-items:center;gap:.25rem;font-family:ui-monospace,Menlo,monospace;font-size:10px;padding:2px 6px;border-radius:3px;border:1px solid #e5e3dc;background:#fff;color:#475569;text-decoration:none}
.aw-badge.hit{background:#dcfce7;border-color:#86efac;color:#166534}.aw-badge.miss{background:#fef9c3;border-color:#fde047;color:#854d0e}
.aw-wf{margin-top:.4rem}
.aw-wfband{font-size:8.5px;text-transform:uppercase;letter-spacing:.07em;color:#b0aa9e;margin:.45rem 0 .15rem}
.aw-wfrow{display:grid;grid-template-columns:130px 1fr 92px;gap:.5rem;align-items:center;cursor:pointer;padding:2px 4px;border-radius:3px}
.aw-wfrow:hover{background:#f1ece2}
.aw-wflabel{font-size:11px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:.3rem}
.aw-srcid{font-family:ui-monospace,Menlo,monospace;font-size:9px;color:#94a3b8}
.aw-wftrack{position:relative;height:13px;background:#efece4;border-radius:3px}
.aw-wfbar{position:absolute;top:0;left:0;height:13px;border-radius:3px;min-width:3px}.aw-wfbar.src{background:#c2ccd6}
.aw-wfmeta{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:#64748b;text-align:right;white-space:nowrap}
.aw-wfmeta .cost{color:#166534;font-weight:600}.aw-wfmeta .free{color:#94a3b8}
.aw-detail{position:sticky;top:0}
.aw-back{background:transparent;border:none;color:#6b6b6b;font:inherit;font-size:12px;cursor:pointer;padding:.1rem 0;margin-bottom:.6rem}
.aw-back:hover{color:#8a2a2b}
.aw-dtitle{display:flex;align-items:center;gap:.5rem;font-size:1.02rem;font-weight:600}
.aw-dsub{display:flex;gap:.5rem;flex-wrap:wrap;margin:.3rem 0 .7rem;align-items:center}
.aw-card{background:#fff;border:1px solid #e5e3dc;border-radius:6px;padding:.75rem .9rem}
.aw-dbody{border-top:1px solid #f0eee6;padding-top:.7rem;max-height:calc(100vh - 260px);overflow:auto}
.aw-he{font-family:"Mekorot Vilna","Frank Ruhl Libre",serif;font-size:1.15rem;line-height:1.9;color:#222}
.aw-en{font-size:13px;line-height:1.6;color:#444;margin-top:.5rem}
@media(max-width:880px){.aw-work{grid-template-columns:1fr}.aw-spinebox{position:static;max-height:none}.aw-header{padding-right:0}}
`;
