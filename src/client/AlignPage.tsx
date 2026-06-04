/**
 * Alignment workbench — the sources spine.
 *
 * A debug view centred on SOURCES: what we pull in to build a daf and feed its
 * smart notes, and where each piece attaches. The daf text is the spine (one row
 * per Sefaria segment); the whole-page scope is a continuous margin rail; sources
 * that don't land on a line are surfaced under that scope, tagged `unaligned`
 * when it's a placement gap (vs reference-by-nature, or another amud). Marks are
 * an optional overlay (real gutter icons) — each fully transparent about how it
 * was built (the "made from" waterfall: per-source collect timing + the
 * generation's real cost / latency / cache off its RunResult).
 *
 * Data (all read-only — the page never triggers generation or LLM spend):
 *   GET /api/daf/:t/:p      -> mainSegmentsHe (segment idx = array idx)
 *   GET /api/context/:t/:p  -> { items, timing }  (the pool + collect timing)
 *   GET /api/marks/:t/:p    -> cached gutter marks + run metadata
 */
import { createResource, createSignal, createMemo, createEffect, onMount, For, Show, type JSX } from 'solid-js';
import { TRACTATE_OPTIONS } from '../lib/sefref';
import type { ContextItem } from '../lib/context/types';
import { isReferenceSource } from '../lib/context/placement';
import { SOURCES, SOURCE_META } from '../lib/context/sources';
import { colorForKind, type GutterKind } from './GutterIcons';

interface DafResp { mainSegmentsHe?: string[] }
interface SourceTiming { fetcher: string; sources: string[]; ms: number; cache: 'hit' | 'miss' | 'mixed' | 'unknown' }
interface CtxResp { items?: ContextItem[]; timing?: SourceTiming[] }
interface CostStamp { billedUsd: number | null; estimatedUsd: number | null; tokensIn: number; tokensOut: number }
interface MarkInst { startSegIdx: number; endSegIdx: number; label: string }
interface MarkMeta { cache_hit: boolean; elapsed_ms: number; model: string; recipe_hash: string | null; cost: CostStamp | null }
interface MarkRow { id: string; kind: GutterKind; label: string; cached: boolean; instances: MarkInst[]; meta: MarkMeta | null }
interface MarksResp { marks?: MarkRow[] }

type Detail = null | { t: 'src'; key: string } | { t: 'gen'; mid: string; inst: number };

const fetchJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
};
const fmtMs = (n: number) => (n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(1)}s`);
const fmtUsd = (u: number | null | undefined) => (u == null ? '—' : u < 0.01 ? `$${u.toFixed(4)}` : `$${u.toFixed(3)}`);
const esc = (s: string | undefined) => (s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const amudOf = (page: string): 'a' | 'b' => (/b$/i.test(page.trim()) ? 'b' : 'a');

// Real gutter glyphs (verbatim from GutterIcons.tsx) as strings, so the badge
// can be built into innerHTML alongside the rest of the spine/inspector markup.
const SA = 'viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const GLYPH: Record<GutterKind, string> = {
  argument: `<svg ${SA}><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"/></svg>`,
  halacha: `<svg ${SA}><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381"/><path d="m16 16 6-6"/><path d="m21.5 10.5-8-8"/><path d="m8 8 6-6"/><path d="m8.5 7.5 8 8"/></svg>`,
  chart: `<svg ${SA}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>`,
  aggadata: `<svg ${SA}><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`,
  yerushalmi: '<span class="aw-heb">י</span>', rishonim: '<span class="aw-heb">ר</span>', pesuk: '<span class="aw-heb">פ</span>',
};
function markIconHtml(kind: GutterKind, ring = false): string {
  const c = colorForKind(kind);
  return `<span class="aw-ic" style="background:${c}${ring ? `;box-shadow:0 0 0 2px ${c}60` : ''}" title="${kind}">${GLYPH[kind]}</span>`;
}

export function AlignPage(): JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const [tractate, setTractate] = createSignal(params.get('tractate') ?? 'Berakhot');
  const [page, setPage] = createSignal(params.get('page') ?? '2a');
  const [marksOn, setMarksOn] = createSignal(true);
  const [view, setView] = createSignal<{ kind: 'seg' | 'page'; val: number; detail: Detail }>({ kind: 'seg', val: 0, detail: null });

  const ref = createMemo(() => ({ t: tractate(), p: page() }));
  const [daf] = createResource(ref, (r) => fetchJson<DafResp>(`/api/daf/${encodeURIComponent(r.t)}/${r.p}`));
  const [ctx] = createResource(ref, (r) => fetchJson<CtxResp>(`/api/context/${encodeURIComponent(r.t)}/${r.p}`).catch(() => ({ items: [], timing: [] })));
  const [marksRes] = createResource(ref, (r) => fetchJson<MarksResp>(`/api/marks/${encodeURIComponent(r.t)}/${r.p}`).catch(() => ({ marks: [] })));

  const segs = () => daf()?.mainSegmentsHe ?? [];
  const items = () => ctx()?.items ?? [];
  const timing = () => ctx()?.timing ?? [];
  const marks = () => (marksRes()?.marks ?? []).filter((m) => m.cached && m.instances.length > 0);
  const onLine = () => items().filter((i) => i.segs.length > 0);
  const offLine = () => items().filter((i) => i.segs.length === 0);
  const tally = createMemo(() => {
    const its = items();
    const off = its.filter((i) => i.segs.length === 0);
    return { total: its.length, line: its.length - off.length, off: off.length, unaligned: off.filter((i) => !isReferenceSource(i)).length };
  });
  // Registry coverage: every declared source vs what actually showed up on this
  // daf. `unknown` should always be empty (the pool can only carry registered
  // sources) — a non-empty list means a source reached the pool unregistered.
  const coverage = createMemo(() => {
    const present = new Set(items().map((i) => i.source));
    const absent = SOURCES.filter((s) => !present.has(s));
    const unknown = [...present].filter((s) => !(s in SOURCE_META));
    return { declared: SOURCES.length, present: present.size, absent, unknown };
  });

  let spineEl!: HTMLDivElement;
  let inspEl!: HTMLDivElement;

  const marksCovering = (i: number) => marks().filter((m) => m.instances.some((x) => i >= x.startSegIdx && i <= x.endSegIdx));
  const marksStartingAt = (i: number) => marks().filter((m) => m.instances.some((x) => x.startSegIdx === i));
  const rangeOf = (m: MarkRow): number[] => {
    const set = new Set<number>();
    for (const x of m.instances) for (let s = x.startSegIdx; s <= x.endSegIdx; s++) set.add(s);
    return [...set].sort((a, b) => a - b);
  };
  // The context fetchers whose sources actually land in a mark's range — the
  // honest "collect" cost of assembling what's available to build a note there.
  const collectFor = (m: MarkRow): SourceTiming[] => {
    const range = new Set(rangeOf(m));
    const srcs = new Set<string>(onLine().filter((it) => it.segs.some((s) => range.has(s))).map((it) => it.source));
    return timing().filter((t) => t.sources.some((s) => srcs.has(s)));
  };

  const dot = (color: string) => `<span class="aw-dot" style="background:${color}"></span>`;
  function waterfallHtml(m: MarkRow): string {
    const collect = collectFor(m);
    let html = '<div class="aw-wf">';
    if (collect.length) {
      const max = Math.max(...collect.map((t) => t.ms), 1);
      html += '<div class="aw-wfband">collect — gather the context</div>';
      html += collect.map((t) => {
        const w = Math.max(3, (t.ms / max) * 100);
        const cache = t.cache === 'hit' ? 'cached' : t.cache === 'miss' ? 'fetched' : t.cache;
        return `<div class="aw-wfrow"><div class="aw-wflabel">${dot('#16a34a')}${esc(t.fetcher)}</div>
          <div class="aw-wftrack"><div class="aw-wfbar src" style="width:${w}%"></div></div>
          <div class="aw-wfmeta">${fmtMs(t.ms)} · <span class="free">${cache}</span></div></div>`;
      }).join('');
    }
    if (m.meta) {
      const usd = m.meta.cost ? (m.meta.cost.billedUsd ?? m.meta.cost.estimatedUsd) : null;
      html += '<div class="aw-wfband">generate — model run</div>';
      html += `<div class="aw-wfrow" data-gen="${esc(m.id)}"><div class="aw-wflabel">${markIconHtml(m.kind)}${esc(m.label)} generation</div>
        <div class="aw-wftrack"><div class="aw-wfbar gen" style="width:100%;background:${colorForKind(m.kind)}"></div></div>
        <div class="aw-wfmeta">${fmtMs(m.meta.elapsed_ms)} · ${usd == null ? '<span class="free">unpriced</span>' : `<span class="cost">${fmtUsd(usd)}</span>`}</div></div>`;
    }
    return `${html}</div>`;
  }
  function markRowHtml(m: MarkRow): string {
    const hit = m.meta?.cache_hit;
    const usd = m.meta?.cost ? (m.meta.cost.billedUsd ?? m.meta.cost.estimatedUsd) : null;
    const c = colorForKind(m.kind);
    return `<div class="aw-li aw-mkrow" style="--mkc:${c}">
      <div class="aw-mkhead" data-mkhead data-hl="${esc(rangeOf(m).join(','))}">
        ${markIconHtml(m.kind, true)}<span class="aw-nm" style="color:${c}">${esc(m.label)}</span>
        <span class="aw-chev">▸</span><span class="aw-minimeta">mark · ${fmtUsd(usd)} · ${m.meta ? fmtMs(m.meta.elapsed_ms) : '—'}</span></div>
      <div class="aw-mkdetail">
        <div class="aw-metarow"><span class="aw-badge ${hit ? 'hit' : 'miss'}">cache: ${hit ? 'hit' : 'miss'}</span>
          <span class="aw-badge">${fmtUsd(usd)}</span><span class="aw-badge">${m.meta ? fmtMs(m.meta.elapsed_ms) : '—'}</span>
          <span class="aw-badge">${esc(m.meta?.model ?? '')}</span></div>
        <span class="aw-label" style="display:block;margin-top:.5rem">made from — how it was built (click a bar to inspect)</span>
        ${waterfallHtml(m)}</div></div>`;
  }
  function sourceRowHtml(it: ContextItem, seg: number): string {
    const conf = it.confidence != null ? `<span class="aw-conf">${it.confidence.toFixed(2)}</span>` : '';
    const via = it.via ? `<span class="aw-via">${esc(it.via)}</span>` : '';
    return `<div class="aw-li aw-src" data-src="${esc(it.key)}" data-hl="${seg}">${dot('#16a34a')}
      <span class="aw-nm">${esc(it.sourceLabel)}</span>${via}<span class="aw-bd">${esc(it.title?.en || it.title?.he || it.kind)}</span>${conf}</div>`;
  }
  function scopeGroupsHtml(): string {
    const me = amudOf(page());
    const groups = new Map<string, { label: string; key: string; count: number; ref: boolean; other: boolean }>();
    for (const it of offLine()) {
      const g = groups.get(it.sourceLabel) ?? { label: it.sourceLabel, key: it.key, count: 0, ref: isReferenceSource(it), other: false };
      g.count++;
      if (it.amud && it.amud !== me) g.other = true;
      groups.set(it.sourceLabel, g);
    }
    const rows = [...groups.values()].sort((a, b) => Number(a.ref) - Number(b.ref)).map((g) => {
      const tag = g.other ? '<span class="aw-utag" style="color:#0e7490;background:#ecfeff;border-color:#a5f3fc">⊗ other amud</span>'
        : g.ref ? '' : '<span class="aw-utag">⊘ unaligned</span>';
      const color = g.ref ? '#16a34a' : g.other ? '#0e7490' : '#fb923c';
      return `<div class="aw-li aw-src" data-src="${esc(g.key)}" data-hlscope="page">${dot(color)}
        <span class="aw-nm">${esc(g.label)}</span><span class="aw-x">×${g.count}</span>${tag}
        <span class="aw-bd">${g.ref ? 'reference' : g.other ? 'other amud' : 'no line anchor'}</span></div>`;
    }).join('');
    const total = offLine().length;
    const un = offLine().filter((i) => !isReferenceSource(i) && !(i.amud && i.amud !== me)).length;
    return `<div class="aw-card"><h3><span class="aw-scopetag">▏ daf ${esc(page())}</span> Page-level sources <span class="aw-cnt">${total}</span></h3>
      <div class="aw-note">Served for the page, not tied to a line — reference context${un ? ` · <b style="color:#b45309">${un} unaligned</b> (no finer anchor yet)` : ''}.</div>${rows || '<div class="aw-note">none</div>'}</div>`;
  }
  function scopeOrSeg(): string {
    const v = view();
    if (v.kind === 'page') return scopeGroupsHtml();
    const i = v.val;
    const its = onLine().filter((x) => x.segs.includes(i));
    const mk = marksOn() ? marksCovering(i) : [];
    const list = its.map((x) => sourceRowHtml(x, i)).join('') + mk.map(markRowHtml).join('');
    return `<div class="aw-card"><h3><span class="aw-n">seg ${i}</span> Pinned here <span class="aw-cnt">${its.length} sources${mk.length ? ` · ${mk.length} marks` : ''}</span></h3>
      ${list || '<div class="aw-note">No sources anchored to this line.</div>'}</div>`;
  }
  function inspectorHtml(): string {
    const d = view().detail;
    if (d?.t === 'src') {
      const it = items().find((x) => x.key === d.key);
      if (!it) return scopeOrSeg();
      const t = it.title?.en || it.title?.he;
      return `<div class="aw-card"><button class="aw-back" data-back>← back to list</button>
        <div class="aw-dtitle">${dot('#16a34a')} ${esc(it.sourceLabel)}${t ? ` — ${esc(t)}` : ''}</div>
        <div class="aw-dsub"><span class="aw-badge">source</span><span class="aw-badge">${esc(it.source)}</span>${it.via ? `<span class="aw-via">${esc(it.via)}</span>` : ''}${it.url ? `<a class="aw-badge" href="${esc(it.url)}" target="_blank" rel="noreferrer">open ↗</a>` : ''}</div>
        <div class="aw-dbody">${it.body?.he ? `<div class="aw-he" dir="rtl">${esc(it.body.he)}</div>` : ''}${it.body?.en ? `<div class="aw-en">${esc(it.body.en)}</div>` : ''}${!it.body?.he && !it.body?.en ? '<div class="aw-en" style="color:#94a3b8">(no body text)</div>' : ''}</div></div>`;
    }
    if (d?.t === 'gen') {
      const m = marks().find((x) => x.id === d.mid);
      if (!m || !m.meta) return scopeOrSeg();
      const usd = m.meta.cost ? (m.meta.cost.billedUsd ?? m.meta.cost.estimatedUsd) : null;
      const inst = m.instances[d.inst] ?? m.instances[0];
      return `<div class="aw-card"><button class="aw-back" data-back>← back to list</button>
        <div class="aw-dtitle">${markIconHtml(m.kind, true)} ${esc(m.label)}</div>
        <div class="aw-dsub"><span class="aw-badge">generation</span><span class="aw-badge">${esc(m.meta.model)}</span><span class="aw-badge">${fmtUsd(usd)}</span><span class="aw-badge">${fmtMs(m.meta.elapsed_ms)}</span><span class="aw-badge ${m.meta.cache_hit ? 'hit' : 'miss'}">cache: ${m.meta.cache_hit ? 'hit' : 'miss'}</span></div>
        <div class="aw-dbody"><div class="aw-en"><b>${esc(inst?.label || '(instance)')}</b> &nbsp;<span style="color:#94a3b8">seg ${inst?.startSegIdx}–${inst?.endSegIdx}</span></div>
          <div class="aw-en" style="color:#64748b;margin-top:.4rem">tokens ${m.meta.cost?.tokensIn ?? '?'} in / ${m.meta.cost?.tokensOut ?? '?'} out · recipe ${esc(m.meta.recipe_hash?.slice(0, 8) ?? 'n/a')}</div>
          <div class="aw-en" style="color:#94a3b8;margin-top:.4rem">The rendered note text lives on the daf page; this view is its provenance.</div></div></div>`;
    }
    return scopeOrSeg();
  }

  function spineHtml(): string {
    const ss = segs();
    if (!ss.length) return '<div class="aw-note" style="padding:1rem">No segments for this daf.</div>';
    const rows = ss.map((t, i) => {
      const cover = marksOn() ? marksCovering(i)[0] : undefined;
      const starts = marksOn() ? marksStartingAt(i) : [];
      const tint = cover ? `--tint:${colorForKind(cover.kind)}14;--edgec:${colorForKind(cover.kind)};` : '';
      return `<div class="aw-row${cover ? ' inmark' : ''}" data-seg="${i}" style="${tint}">
        <div class="aw-rail"></div><div class="aw-mk">${starts.map((m) => markIconHtml(m.kind)).join('')}</div>
        <div class="aw-tx" dir="rtl">${esc(t)}</div></div>`;
    }).join('');
    return `<div class="aw-pagerail" data-pagerail title="page scope"><span class="aw-raillab">daf ${esc(page())}</span></div>${rows}`;
  }

  const pageRows = () => segs().map((_, i) => i);
  const setRowClass = (cls: string, segIdxs: number[]) => {
    if (!spineEl) return;
    spineEl.querySelectorAll(`.aw-row.${cls}`).forEach((r) => r.classList.remove(cls));
    for (const i of segIdxs) spineEl.querySelector(`.aw-row[data-seg="${i}"]`)?.classList.add(cls);
  };
  const markSelected = () => { const v = view(); setRowClass('sel', v.kind === 'seg' ? [v.val] : []); };
  const pinForView = () => {
    const d = view().detail;
    if (!d) { setRowClass('pin', []); markSelected(); return; }
    if (d.t === 'gen') { const m = marks().find((x) => x.id === d.mid); setRowClass('pin', m ? rangeOf(m) : []); return; }
    const it = items().find((x) => x.key === d.key);
    setRowClass('pin', it ? (it.segs.length ? it.segs : pageRows()) : []);
  };

  onMount(() => {
    spineEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-pagerail]')) { setView({ kind: 'page', val: 0, detail: null }); return; }
      const row = t.closest('.aw-row') as HTMLElement | null;
      if (row) setView({ kind: 'seg', val: Number(row.dataset.seg), detail: null });
    });
    inspEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const wf = t.closest('[data-gen]') as HTMLElement | null;
      if (wf) { setView({ ...view(), detail: { t: 'gen', mid: wf.dataset.gen!, inst: 0 } }); return; }
      const mh = t.closest('[data-mkhead]') as HTMLElement | null;
      if (mh) { mh.closest('.aw-mkrow')?.classList.toggle('open'); return; }
      if (t.closest('[data-back]')) { setView({ ...view(), detail: null }); return; }
      const sl = t.closest('.aw-src[data-src]') as HTMLElement | null;
      if (sl) { setView({ ...view(), detail: { t: 'src', key: sl.dataset.src! } }); return; }
    });
    inspEl.addEventListener('mouseover', (e) => {
      const t = (e.target as HTMLElement).closest('[data-hl],[data-hlscope]') as HTMLElement | null;
      if (!t) { setRowClass('hl', []); return; }
      if (t.dataset.hl !== undefined) setRowClass('hl', t.dataset.hl.split(',').filter(Boolean).map(Number));
      else setRowClass('hl', pageRows());
    });
    inspEl.addEventListener('mouseleave', () => setRowClass('hl', []));
  });

  createEffect(() => { ref(); daf(); marksRes(); marksOn(); if (spineEl) { spineEl.innerHTML = spineHtml(); markSelected(); pinForView(); } });
  createEffect(() => { view(); ctx(); marksRes(); marksOn(); if (inspEl) inspEl.innerHTML = inspectorHtml(); pinForView(); });

  return (
    <main class="page-shell" style={{ '--page-max': '1480px', color: '#1a1a1a' }}>
      <style>{STYLE}</style>
      <div class="aw-top">
        <h1>Alignment workbench <span class="aw-sub">— sources spine</span></h1>
        <select class="aw-select" value={tractate()} onChange={(e) => setTractate(e.currentTarget.value)}>
          <For each={TRACTATE_OPTIONS}>{(o) => <option value={o.value}>{o.value}</option>}</For>
        </select>
        <input class="aw-select" style={{ width: '4rem' }} value={page()} onChange={(e) => setPage(e.currentTarget.value)} />
        <div class="aw-spacer" />
        <Show when={!daf.loading}>
          <div class="aw-tally">
            <span><b>{tally().total}</b> sources</span><span><b>{tally().line}</b> on a line</span>
            <span><b>{tally().off}</b> daf-level</span><span class="warn"><b>{tally().unaligned}</b> unaligned</span>
          </div>
        </Show>
        <button class={`aw-toggle${marksOn() ? ' on' : ''}`} onClick={() => setMarksOn((v) => !v)}>marks overlay</button>
      </div>

      <Show when={!ctx.loading}>
        <div class={`aw-cov${coverage().unknown.length ? ' bad' : ''}`}>
          <b>registry coverage</b>
          <span>{coverage().declared} declared</span>
          <span>{coverage().present} present on this daf</span>
          <Show when={coverage().absent.length} fallback={<span class="ok">all declared sources present ✓</span>}>
            <span>{coverage().absent.length} absent: <span class="aw-abs">{coverage().absent.map((s) => SOURCE_META[s].label).join(', ')}</span></span>
          </Show>
          <Show when={coverage().unknown.length}><span class="aw-bad">UNREGISTERED: {coverage().unknown.join(', ')}</span></Show>
        </div>
      </Show>

      <Show when={daf.loading}><p class="aw-note" style={{ padding: '1rem' }}>Loading…</p></Show>
      <Show when={daf.error}><p style={{ color: '#b91c1c', padding: '1rem' }}>Error: {String(daf.error)}</p></Show>

      <div class="aw-work">
        <div>
          <div class="aw-colh"><span class="aw-label">Spine · segments</span>
            <span class="aw-hint">click a line or the page rail · hover the inspector to highlight</span></div>
          <div class="aw-spinebox"><div class="aw-focal" ref={spineEl} /></div>
          <div class="aw-legend">
            <span><span class="aw-sw" style={{ background: '#8a6d3b' }} /> page scope (rail)</span>
            <For each={marks()}>{(m) => <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '.3rem' }} innerHTML={`${markIconHtml(m.kind)} ${esc(m.label)}`} />}</For>
          </div>
        </div>
        <div>
          <div class="aw-colh"><span class="aw-label">What's pinned here</span>
            <span class="aw-hint">click a source or a waterfall bar to inspect</span></div>
          <div ref={inspEl} />
        </div>
      </div>
    </main>
  );
}

const STYLE = `
.aw-top{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:0 0 .8rem}
.aw-top h1{font-size:1.4rem;margin:0;letter-spacing:-.01em}
.aw-sub{color:#6b6b6b;font-size:.85rem;font-weight:400}
.aw-select{height:2.15rem;font:inherit;font-size:.85rem;border-radius:6px;padding:0 .55rem;border:1px solid #e5e3dc;background:#fff;color:#1a1a1a;cursor:pointer}
.aw-spacer{margin-left:auto}
.aw-tally{display:inline-flex;gap:.9rem;font-size:.82rem;color:#6b6b6b}.aw-tally b{color:#1a1a1a}.aw-tally .warn{color:#b45309}
.aw-toggle{height:2.15rem;padding:0 .65rem;border:1px solid #e5e3dc;background:#fff;color:#6b6b6b;font-family:ui-monospace,Menlo,monospace;font-size:.78rem;border-radius:6px;cursor:pointer}
.aw-toggle.on{background:#1a1a1a;border-color:#1a1a1a;color:#fafaf7}
.aw-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#888;font-weight:600}
.aw-cov{display:flex;gap:.9rem;flex-wrap:wrap;align-items:baseline;font-size:11.5px;color:#6b6b6b;background:#f5f3ec;border:1px solid #e5e3dc;border-radius:6px;padding:.4rem .7rem;margin:0 0 1rem}
.aw-cov b{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:#888}
.aw-cov .ok{color:#166534}.aw-cov .aw-abs{color:#b45309}
.aw-cov.bad{background:#fef2f2;border-color:#fecaca}.aw-cov .aw-bad{color:#b91c1c;font-weight:700}
.aw-work{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(360px,1fr);gap:1.4rem;align-items:start}
.aw-colh{display:flex;align-items:baseline;gap:.5rem;margin-bottom:.5rem}.aw-hint{font-size:11px;color:#6b6b6b}
.aw-spinebox{background:#fff;border:1px solid #e5e3dc;border-radius:8px;padding:.5rem .2rem}
.aw-focal{position:relative}
.aw-row{display:grid;grid-template-columns:16px 30px 1fr;align-items:stretch;cursor:pointer}
.aw-rail{display:flex;justify-content:center}
.aw-mk{display:flex;align-items:center;justify-content:center;gap:1px;flex-wrap:wrap}
.aw-tx{font-family:"Mekorot Vilna","Frank Ruhl Libre","Times New Roman",serif;font-size:1.18rem;line-height:1.95;padding:.18rem .5rem;border-radius:3px}
.aw-row:hover .aw-tx{background:#fdf6e3}
.aw-row.sel .aw-tx{background:#fde68a;outline:2px solid #8a2a2b}
.aw-row.hl .aw-tx{background:#fff1c9;box-shadow:inset 0 0 0 1.5px #f59e0b}
.aw-row.pin .aw-tx{background:#fff7e0;box-shadow:inset 0 0 0 1.5px #f59e0b}
.aw-row.hl.sel .aw-tx,.aw-row.pin.sel .aw-tx{background:#fde68a}
.aw-row.inmark .aw-tx{background:var(--tint);box-shadow:inset 3px 0 0 var(--edgec)}
.aw-pagerail{position:absolute;left:6px;top:3px;bottom:3px;width:2px;background:#8a6d3b;border-radius:2px;cursor:pointer;z-index:1}
.aw-pagerail:hover{width:4px;left:5px}
.aw-raillab{position:absolute;left:-4px;top:0;writing-mode:vertical-rl;transform:rotate(180deg);font-size:8.5px;font-family:ui-monospace,monospace;color:#8a6d3b}
.aw-ic{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;color:#fff;line-height:0;flex:none;vertical-align:middle}
.aw-heb{font-family:"Mekorot Vilna","Times New Roman",serif;font-size:11px;font-weight:700;line-height:1;color:#fff}
.aw-legend{display:flex;gap:1.1rem;flex-wrap:wrap;margin-top:.7rem;font-size:11px;color:#6b6b6b;align-items:center}
.aw-sw{width:3px;height:14px;border-radius:2px;display:inline-block;vertical-align:middle}
.aw-card{background:#fff;border:1px solid #e5e3dc;border-radius:6px;padding:.75rem .9rem}
.aw-card h3{font-size:.74rem;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:0 0 .55rem;display:flex;gap:.4rem;align-items:baseline}
.aw-card h3 .aw-n{color:#cbd5e1}.aw-cnt{margin-left:auto;color:#cbd5e1}
.aw-note{font-size:11.5px;color:#6b6b6b;margin-bottom:.4rem}
.aw-li{display:flex;gap:.4rem;align-items:center;padding:.4rem .15rem;border-top:1px solid #f3f1e9;font-size:12.5px}
.aw-li:first-of-type{border-top:none}
.aw-src{cursor:pointer;border-radius:3px}.aw-src:hover{background:#f5f2ea}
.aw-nm{font-weight:600;color:#334155}.aw-x{color:#cbd5e1;font-size:11px}
.aw-bd{color:#6b6b6b;font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aw-dot{width:7px;height:7px;border-radius:50%;flex:none;display:inline-block}
.aw-via{font-family:ui-monospace,Menlo,monospace;font-size:10px;padding:1px 5px;border-radius:3px;background:#eef2ff;color:#6366f1}
.aw-conf{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#94a3b8}
.aw-utag{display:inline-flex;align-items:center;gap:.2rem;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#b45309;background:#fff7ed;border:1px solid #fed7aa;border-radius:3px;padding:0 4px;line-height:1.6}
.aw-scopetag{display:inline-flex;align-items:center;gap:.3rem;font-size:10px;font-family:ui-monospace,monospace;color:#fff;padding:1px 6px;border-radius:3px;background:#8a6d3b}
.aw-mkrow{flex-direction:column;align-items:stretch;gap:0;border-left:3px solid var(--mkc,#999);padding:0;margin:.3rem 0;background:#faf8f3;border-radius:0 5px 5px 0;border-top:none}
.aw-mkhead{display:flex;gap:.4rem;align-items:center;cursor:pointer;padding:.5rem .6rem}
.aw-mkhead:hover{background:#f3eee3}.aw-mkhead .aw-nm{font-weight:700}
.aw-chev{color:#b0aa9e;font-size:11px;transition:transform .12s}.aw-mkrow.open .aw-chev{transform:rotate(90deg)}
.aw-minimeta{margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#94a3b8}
.aw-mkdetail{display:none;padding:0 .6rem .6rem}.aw-mkrow.open .aw-mkdetail{display:block}
.aw-metarow{display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.45rem}
.aw-badge{display:inline-flex;align-items:center;gap:.25rem;font-family:ui-monospace,Menlo,monospace;font-size:10px;padding:2px 6px;border-radius:3px;border:1px solid #e5e3dc;background:#fff;color:#475569;text-decoration:none}
.aw-badge.hit{background:#dcfce7;border-color:#86efac;color:#166534}
.aw-badge.miss{background:#fef9c3;border-color:#fde047;color:#854d0e}
.aw-wf{margin-top:.55rem}
.aw-wfband{font-size:8.5px;text-transform:uppercase;letter-spacing:.07em;color:#b0aa9e;margin:.45rem 0 .15rem}
.aw-wfrow{display:grid;grid-template-columns:140px 1fr 92px;gap:.5rem;align-items:center;cursor:pointer;padding:2px 4px;border-radius:3px}
.aw-wfrow:hover{background:#f1ece2}
.aw-wflabel{font-size:11px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:.3rem}
.aw-wftrack{position:relative;height:13px;background:#efece4;border-radius:3px}
.aw-wfbar{position:absolute;top:0;left:0;height:13px;border-radius:3px;min-width:3px}.aw-wfbar.src{background:#c2ccd6}
.aw-wfmeta{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:#64748b;text-align:right;white-space:nowrap}
.aw-wfmeta .cost{color:#166534;font-weight:600}.aw-wfmeta .free{color:#94a3b8}
.aw-back{background:transparent;border:none;color:#6b6b6b;font:inherit;font-size:12px;cursor:pointer;padding:.1rem 0;margin-bottom:.6rem}
.aw-back:hover{color:#8a2a2b}
.aw-dtitle{display:flex;align-items:center;gap:.5rem;font-size:1.02rem;font-weight:600}
.aw-dsub{display:flex;gap:.5rem;flex-wrap:wrap;margin:.3rem 0 .7rem;align-items:center}
.aw-dbody{border-top:1px solid #f0eee6;padding-top:.7rem}
.aw-he{font-family:"Mekorot Vilna","Frank Ruhl Libre",serif;font-size:1.15rem;line-height:1.9;color:#222}
.aw-en{font-size:13px;line-height:1.6;color:#444;margin-top:.5rem}
@media(max-width:880px){.aw-work{grid-template-columns:1fr}}
`;
