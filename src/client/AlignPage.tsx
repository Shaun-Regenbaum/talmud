import { createResource, createSignal, For, Show, createMemo, type JSX } from 'solid-js';
import { TRACTATE_OPTIONS, type TalmudPageData } from '../lib/sefref';
import { tokenizeHebrewHtml } from './tokenize';
import { injectHadran } from './injectHadran';
import { injectSegmentMarkers, type SegmentStats } from './injectSegmentMarkers';
import { ContextSourcePanel } from './ContextSourcePanel';
import type { ContextItem } from '../lib/context/types';
import { applyMatches, type SegMatch } from '../lib/context/match';

interface AlignedDaf extends TalmudPageData {
  _source?: string;
  mainSegmentsHe?: string[];
  mainSegmentsEn?: string[];
}

async function fetchDaf(input: { tractate: string; page: string }): Promise<AlignedDaf> {
  const res = await fetch(`/api/daf/${encodeURIComponent(input.tractate)}/${input.page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchContext(input: { tractate: string; page: string }): Promise<ContextItem[]> {
  const res = await fetch(`/api/context/${encodeURIComponent(input.tractate)}/${input.page}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: ContextItem[] };
  return data.items ?? [];
}

const PALETTE = [
  '#fee2e2', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe',
  '#fce7f3', '#ffedd5', '#d1fae5', '#cffafe', '#e0e7ff',
];
const segColor = (idx: number) => PALETTE[idx % PALETTE.length];

function renderAlignedHtml(mainHtml: string, segmentsHe: string[]): { html: string; stats: SegmentStats } {
  const tokenized = tokenizeHebrewHtml(mainHtml);
  const hadran = injectHadran(tokenized);
  return injectSegmentMarkers(hadran, segmentsHe);
}

// --- left-pane "base layer" views ---------------------------------------
// All views emit `.daf-word[data-seg]` spans so the segment-coloring + the
// hover-highlight <style> (and the onMouseOver handler) work identically.

type LeftView = 'hb' | 'segments' | 'rashi' | 'tosafot';
const LEFT_VIEWS: { id: LeftView; label: string }[] = [
  { id: 'hb', label: 'HebrewBooks' },
  { id: 'segments', label: 'Sefaria segments' },
  { id: 'rashi', label: 'Rashi' },
  { id: 'tosafot', label: 'Tosafot' },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** Sefaria text carries markup (<b>/<strong>/…); strip it, escape, collapse. */
function clean(s: string): string {
  return escapeHtml(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}
/** Sefaria "S:P" pieceKey (1-based segment) -> 0-based segment index. */
function segOfKey(key: string | undefined): number | null {
  if (!key) return null;
  const s = parseInt(String(key).split(':')[0], 10);
  return Number.isFinite(s) ? s - 1 : null;
}

/** Exact view: each Sefaria segment is its own colored span (no fuzzy match). */
function buildSegmentsHtml(segs: string[]): string {
  if (!segs.length) return '<p style="color:#aaa">No Sefaria segments for this daf.</p>';
  return segs.map((s, i) => `<span class="daf-word" data-seg="${i}">${clean(s)} </span>`).join('');
}

/** Commentary view: each piece is a block, colored by the segment it anchors
 *  to (via its parallel pieceKey). Pieces without a key are left uncolored. */
function buildCommentaryHtml(pieces?: string[], keys?: string[]): string {
  if (!pieces?.length) return '<p style="color:#aaa">No pieces for this commentary on this daf.</p>';
  return pieces.map((p, i) => {
    const seg = segOfKey(keys?.[i]);
    const attr = seg != null ? ` data-seg="${seg}"` : '';
    const tag = seg != null ? `<span style="font-family:monospace;font-size:0.7rem;color:#888">#${seg} </span>` : '';
    return `<div class="daf-word"${attr} style="margin-bottom:0.35rem;padding:0.15rem 0.3rem">${tag}${clean(p)}</div>`;
  }).join('');
}

export function AlignPage(): JSX.Element {
  const initialParams = new URLSearchParams(window.location.search);
  const [tractate, setTractate] = createSignal(initialParams.get('tractate') ?? 'Berakhot');
  const [page, setPage] = createSignal(initialParams.get('page') ?? '5a');
  // Which base text fills the left "alignment canvas".
  const [leftView, setLeftView] = createSignal<LeftView>('hb');
  // Two highlight layers: `pinned` from the selected source (persistent),
  // `hover` from hovering a card/segment (transient). Hover wins when active.
  const [pinnedSegs, setPinnedSegs] = createSignal<number[]>([]);
  const [hoverSegs, setHoverSegs] = createSignal<number[]>([]);
  const highlight = () => (hoverSegs().length ? hoverSegs() : pinnedSegs());
  // AI matches applied on top of the server-assembled pool.
  const [matches, setMatches] = createSignal<SegMatch[]>([]);
  const [matchingSource, setMatchingSource] = createSignal<string | null>(null);

  const ref = createMemo(() => ({ tractate: tractate(), page: page() }));
  const [daf] = createResource(ref, fetchDaf);
  const [context] = createResource(ref, fetchContext);
  // Reset client-side AI matches when the daf changes.
  createMemo(() => { ref(); setMatches([]); setPinnedSegs([]); });

  const rendered = createMemo(() => {
    const d = daf();
    if (!d) return null;
    return renderAlignedHtml(d.mainText.hebrew, d.mainSegmentsHe ?? []);
  });

  const segmentCount = () => daf()?.mainSegmentsHe?.length ?? 0;
  const stats = () => rendered()?.stats;
  const isHot = (i: number) => highlight().includes(i);

  // HTML for the left canvas, per the selected base-layer view. Every view
  // emits `.daf-word[data-seg]` spans so coloring + highlighting are shared.
  const leftHtml = createMemo(() => {
    const d = daf();
    if (!d) return '';
    switch (leftView()) {
      case 'segments': return buildSegmentsHtml(d.mainSegmentsHe ?? []);
      case 'rashi': return buildCommentaryHtml(d.rashi?.pieces, d.rashi?.pieceKeys);
      case 'tosafot': return buildCommentaryHtml(d.tosafot?.pieces, d.tosafot?.pieceKeys);
      default: return rendered()?.html ?? '';
    }
  });

  // The unified external-context pool, assembled server-side from dafyomi.co.il
  // + Sefaria sources (commentary text, Mishnayot, Rishonim, halacha, topics),
  // already anchored deterministically. Client-side AI-match promotions are
  // layered on top (cloned so the resource stays pristine).
  const contextItems = createMemo<ContextItem[]>(() => {
    const items = (context() ?? []).map((i) => ({ ...i }));
    if (matches().length) applyMatches(items, matches());
    return items;
  });

  const runAiMatch = async (source: string, items: ContextItem[]) => {
    setMatchingSource(source);
    try {
      const res = await fetch('/api/context/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tractate: tractate(),
          page: page(),
          items: items.map((it) => ({
            key: it.key,
            label: it.sourceLabel,
            title: it.title?.en ?? it.title?.he,
            text: (it.body?.en ?? it.body?.he ?? '').slice(0, 600),
          })),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { matches?: SegMatch[] };
      if (data.matches?.length) setMatches((prev) => [...prev, ...data.matches!]);
    } finally {
      setMatchingSource(null);
    }
  };

  const perSegmentWordCounts = createMemo<number[]>(() => {
    const html = rendered()?.html ?? '';
    const n = segmentCount();
    const counts = new Array(n).fill(0);
    const re = /data-seg="(\d+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const idx = Number(m[1]);
      if (idx >= 0 && idx < n) counts[idx]++;
    }
    return counts;
  });

  return (
    <main class="page-shell" style={{ '--page-max': '1400px', 'font-family': 'system-ui, -apple-system, sans-serif', color: '#222' }}>
      <header class="responsive-row" style={{ 'margin-bottom': '1rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.4rem' }}>Alignment workbench</h1>
        <a href="#daf" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>← back to daf</a>
        <a href="#about" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>sources & credits</a>
        <select
          value={tractate()}
          onChange={(e) => setTractate(e.currentTarget.value)}
          style={{ padding: '0.3rem 0.5rem', 'font-size': '0.9rem', 'margin-left': '1rem' }}
        >
          <For each={TRACTATE_OPTIONS}>{(o) => <option value={o.value}>{o.value}</option>}</For>
        </select>
        <input
          value={page()}
          onInput={(e) => setPage(e.currentTarget.value)}
          style={{ width: '5rem', padding: '0.3rem 0.5rem', 'font-size': '0.9rem' }}
        />
        <Show when={stats()}>
          {(s) => (
            <span style={{ color: '#666', 'font-size': '0.85rem', 'margin-left': 'auto' }}>
              Aligned <b>{s().alignedSegments}</b> / {s().totalSegments} segments · {s().alignedWords} / {s().totalWords} words
              {' '}({Math.round((s().alignedWords / Math.max(1, s().totalWords)) * 100)}%)
            </span>
          )}
        </Show>
      </header>

      <Show when={daf.loading}><p style={{ color: '#888' }}>Loading…</p></Show>
      <Show when={daf.error}><p style={{ color: '#c33' }}>Error: {String(daf.error)}</p></Show>

      <Show when={daf()}>
        {(d) => (
          <>
            <div class="responsive-2col">
              <section>
                <div style={{ display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '0.4rem', 'margin-bottom': '0.4rem' }}>
                  <h2 style={{ 'font-size': '0.9rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', margin: 0 }}>
                    Alignment canvas — segments colored
                  </h2>
                  <div style={{ display: 'flex', gap: '0.25rem', 'margin-left': 'auto' }}>
                    <For each={LEFT_VIEWS}>
                      {(v) => (
                        <button
                          type="button"
                          onClick={() => setLeftView(v.id)}
                          style={{
                            padding: '0.15rem 0.5rem', 'font-size': '0.75rem', 'border-radius': '999px', cursor: 'pointer',
                            border: `1px solid ${leftView() === v.id ? '#8a2a2b' : '#ddd'}`,
                            background: leftView() === v.id ? '#8a2a2b' : '#fff',
                            color: leftView() === v.id ? '#fff' : '#555',
                          }}
                        >
                          {v.label}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
                <div
                  dir="rtl"
                  lang="he"
                  style={{
                    'font-family': '"Mekorot Vilna", serif',
                    'font-size': '1.05rem',
                    'line-height': 1.7,
                    padding: '1rem',
                    border: '1px solid #eee',
                    'border-radius': '6px',
                    background: '#fff',
                    'text-align': leftView() === 'hb' || leftView() === 'segments' ? 'justify' : 'right',
                  }}
                  innerHTML={leftHtml()}
                  onMouseOver={(e) => {
                    const t = e.target as HTMLElement;
                    const w = t.closest('.daf-word') as HTMLElement | null;
                    const s = w?.getAttribute('data-seg');
                    if (s !== null && s !== undefined) setHoverSegs([Number(s)]);
                  }}
                  onMouseLeave={() => setHoverSegs([])}
                />
                <style>{`
                  ${Array.from({ length: segmentCount() }).map((_, i) =>
                    `.daf-word[data-seg="${i}"] { background-color: ${segColor(i)}; border-radius: 2px; }`
                  ).join('\n')}
                  ${highlight().map((i) => `.daf-word[data-seg="${i}"] { outline: 2px solid #8a2a2b; }`).join('\n')}
                `}</style>
              </section>

              <section>
                <h2 style={{ 'font-size': '0.9rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', 'margin-bottom': '0.4rem' }}>
                  Sefaria segments
                </h2>
                <ol style={{ 'list-style': 'none', padding: 0, margin: 0, 'font-size': '0.9rem' }}>
                  <For each={d().mainSegmentsHe ?? []}>
                    {(seg, i) => {
                      const words = () => perSegmentWordCounts()[i()] ?? 0;
                      const aligned = () => words() > 0;
                      return (
                        <li
                          style={{
                            padding: '0.5rem 0.7rem',
                            'margin-bottom': '0.4rem',
                            'border-radius': '4px',
                            border: isHot(i()) ? '2px solid #8a2a2b' : '1px solid #eee',
                            background: isHot(i()) ? '#fef3c7' : segColor(i()),
                            opacity: aligned() ? 1 : 0.45,
                          }}
                          onMouseEnter={() => setHoverSegs([i()])}
                          onMouseLeave={() => setHoverSegs([])}
                        >
                          <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.5rem', 'margin-bottom': '0.25rem' }}>
                            <span style={{ 'font-family': 'monospace', 'font-size': '0.72rem', color: '#555' }}>#{i()}</span>
                            <span style={{ 'font-size': '0.72rem', color: aligned() ? '#059669' : '#c33' }}>
                              {aligned() ? `${words()} word${words() === 1 ? '' : 's'} aligned` : 'not aligned'}
                            </span>
                          </div>
                          <div dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif', 'line-height': 1.55, 'font-size': '0.95rem' }}>
                            {seg}
                          </div>
                          <Show when={(d().mainSegmentsEn ?? [])[i()]}>
                            <div style={{ 'font-size': '0.78rem', color: '#555', 'margin-top': '0.3rem', 'font-style': 'italic' }}>
                              {(d().mainSegmentsEn ?? [])[i()]}
                            </div>
                          </Show>
                        </li>
                      );
                    }}
                  </For>
                </ol>
              </section>
            </div>

            <div style={{ 'margin-top': '1.5rem' }}>
              <Show when={context.loading}>
                <p style={{ color: '#aaa', 'font-size': '0.85rem' }}>Loading external context…</p>
              </Show>
              <Show when={!context.loading && contextItems().length === 0}>
                <p style={{ color: '#aaa', 'font-size': '0.85rem' }}>
                  No external context for {tractate()} {page()}. For dafyomi.co.il content, run{' '}
                  <code>node scripts/scrape-dafyomi.mjs --tractate {tractate()} --daf {(page().match(/\d+/) ?? [''])[0]}</code>.
                </p>
              </Show>
              <ContextSourcePanel
                items={contextItems()}
                onHover={(segs) => setHoverSegs(segs)}
                onLeave={() => setHoverSegs([])}
                onSelectSource={(_source, segs) => setPinnedSegs(segs)}
                onMatch={runAiMatch}
                matchingSource={matchingSource()}
              />
            </div>
          </>
        )}
      </Show>
    </main>
  );
}
