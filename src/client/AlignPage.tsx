import { createResource, createSignal, For, Show, createMemo, type JSX } from 'solid-js';
import { TRACTATE_OPTIONS, type TalmudPageData } from '../lib/sefref';
import { tokenizeHebrewHtml } from './tokenize';
import { injectHadran } from './injectHadran';
import { injectSegmentMarkers, type SegmentStats } from './injectSegmentMarkers';

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

// Cycle through a pleasant, distinguishable palette so adjacent segments
// stand out visually. Same indices always produce the same color.
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

export function AlignPage(): JSX.Element {
  const initialParams = new URLSearchParams(window.location.search);
  const [tractate, setTractate] = createSignal(initialParams.get('tractate') ?? 'Berakhot');
  const [page, setPage] = createSignal(initialParams.get('page') ?? '5a');
  const [hoveredSeg, setHoveredSeg] = createSignal<number | null>(null);

  const ref = createMemo(() => ({ tractate: tractate(), page: page() }));
  const [daf] = createResource(ref, fetchDaf);

  const rendered = createMemo(() => {
    const d = daf();
    if (!d) return null;
    return renderAlignedHtml(d.mainText.hebrew, d.mainSegmentsHe ?? []);
  });

  const segmentCount = () => daf()?.mainSegmentsHe?.length ?? 0;
  const stats = () => rendered()?.stats;

  // Per-segment word counts by grepping the rendered HTML for data-seg="<i>".
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
    <main style={{ padding: '1.5rem 2rem', 'max-width': '1400px', margin: '0 auto', 'font-family': 'system-ui, -apple-system, sans-serif', color: '#222' }}>
      <header style={{ display: 'flex', 'align-items': 'center', gap: '0.8rem', 'flex-wrap': 'wrap', 'margin-bottom': '1rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.4rem' }}>Alignment</h1>
        <a href="#daf" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>← back to daf</a>
        <select
          value={tractate()}
          onChange={(e) => setTractate(e.currentTarget.value)}
          style={{ padding: '0.3rem 0.5rem', 'font-size': '0.9rem', 'margin-left': '1rem' }}
        >
          <For each={TRACTATE_OPTIONS}>
            {(o) => <option value={o.value}>{o.value}</option>}
          </For>
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
          <div style={{ display: 'grid', 'grid-template-columns': '1.2fr 1fr', gap: '1.5rem', 'align-items': 'start' }}>
            <section>
              <h2 style={{ 'font-size': '0.9rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', 'margin-bottom': '0.4rem' }}>
                Rendered daf (HebrewBooks) — segments colored
              </h2>
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
                  'text-align': 'justify',
                }}
                innerHTML={rendered()?.html ?? ''}
                onMouseOver={(e) => {
                  const t = e.target as HTMLElement;
                  const w = t.closest('.daf-word') as HTMLElement | null;
                  const s = w?.getAttribute('data-seg');
                  if (s !== null && s !== undefined) setHoveredSeg(Number(s));
                }}
                onMouseLeave={() => setHoveredSeg(null)}
              />
              <style>{`
                ${Array.from({ length: segmentCount() }).map((_, i) =>
                  `.daf-word[data-seg="${i}"] { background-color: ${segColor(i)}; border-radius: 2px; }`
                ).join('\n')}
                .daf-word[data-seg].hovered { outline: 2px solid #8a2a2b; }
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
                    const isHover = () => hoveredSeg() === i();
                    return (
                      <li
                        style={{
                          padding: '0.5rem 0.7rem',
                          'margin-bottom': '0.4rem',
                          'border-radius': '4px',
                          border: '1px solid #eee',
                          background: isHover() ? '#fef3c7' : segColor(i()),
                          opacity: aligned() ? 1 : 0.45,
                        }}
                        onMouseEnter={() => setHoveredSeg(i())}
                        onMouseLeave={() => setHoveredSeg(null)}
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
        )}
      </Show>
    </main>
  );
}
