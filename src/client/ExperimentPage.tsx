import { createResource, createSignal, For, Show, createMemo, type JSX } from 'solid-js';
import { TRACTATE_OPTIONS, type TalmudPageData } from '../lib/sefref';
import { classifyDaf } from '../lib/era/heuristic';
import { GENERATION_BY_ID, GENERATIONS, type GenerationId } from './generations';
import type { SegmentEra, EraSignalSource } from '../lib/era/types';

interface ExperimentDaf extends TalmudPageData {
  mainSegmentsHe?: string[];
  mainSegmentsEn?: string[];
}

async function fetchDaf(input: { tractate: string; page: string }): Promise<ExperimentDaf> {
  const res = await fetch(`/api/daf/${encodeURIComponent(input.tractate)}/${input.page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const SOURCE_LABEL: Record<EraSignalSource, string> = {
  'speaker': 'speaker',
  'marker': 'marker',
  'register': 'register',
  'stam-default': 'default',
  'llm': 'llm',
};

const SOURCE_BG: Record<EraSignalSource, string> = {
  'speaker': '#dcfce7',       // green — strongest
  'marker': '#dbeafe',        // blue — structural
  'register': '#fef3c7',      // amber — soft signal
  'stam-default': '#f3f4f6',  // grey — guessed
  'llm': '#ede9fe',           // violet
};

function eraColor(era: GenerationId): string {
  return GENERATION_BY_ID[era]?.color ?? '#d1d5db';
}

function eraLabel(era: GenerationId): string {
  return GENERATION_BY_ID[era]?.label ?? era;
}

export default function ExperimentPage(): JSX.Element {
  const initialParams = new URLSearchParams(window.location.search);
  const [tractate, setTractate] = createSignal(initialParams.get('tractate') ?? 'Berakhot');
  const [page, setPage] = createSignal(initialParams.get('page') ?? '2a');
  const [activeEra, setActiveEra] = createSignal<GenerationId | null>(null);

  const ref = createMemo(() => ({ tractate: tractate(), page: page() }));
  const [daf] = createResource(ref, fetchDaf);

  const eraContext = createMemo(() => {
    const d = daf();
    if (!d?.mainSegmentsHe?.length) return null;
    return classifyDaf(d.mainSegmentsHe);
  });

  const sourceCounts = createMemo(() => {
    const ctx = eraContext();
    if (!ctx) return null;
    const c: Record<EraSignalSource, number> = {
      'speaker': 0, 'marker': 0, 'register': 0, 'stam-default': 0, 'llm': 0,
    };
    for (const s of ctx.segments) c[s.source]++;
    return c;
  });

  const eraCounts = createMemo(() => {
    const ctx = eraContext();
    if (!ctx) return new Map<GenerationId, number>();
    const m = new Map<GenerationId, number>();
    for (const s of ctx.segments) m.set(s.era, (m.get(s.era) ?? 0) + 1);
    return m;
  });

  const presentInOrder = createMemo<GenerationId[]>(() => {
    const counts = eraCounts();
    return GENERATIONS
      .map((g) => g.id)
      .filter((id): id is GenerationId => counts.has(id));
  });

  return (
    <main style={{ padding: '1.5rem 2rem', 'max-width': '1500px', margin: '0 auto', 'font-family': 'system-ui, -apple-system, sans-serif', color: '#222' }}>
      <header style={{ display: 'flex', 'align-items': 'center', gap: '0.8rem', 'flex-wrap': 'wrap', 'margin-bottom': '1rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.4rem' }}>Era Stratification — Experiment</h1>
        <a href="#daf" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>← back to daf</a>
        <a href="#align" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>alignment →</a>
        <select
          value={tractate()}
          onChange={(e) => { setTractate(e.currentTarget.value); setActiveEra(null); }}
          style={{ padding: '0.3rem 0.5rem', 'font-size': '0.9rem', 'margin-left': '1rem' }}
        >
          <For each={TRACTATE_OPTIONS}>
            {(o) => <option value={o.value}>{o.value}</option>}
          </For>
        </select>
        <input
          value={page()}
          onInput={(e) => { setPage(e.currentTarget.value); setActiveEra(null); }}
          style={{ width: '5rem', padding: '0.3rem 0.5rem', 'font-size': '0.9rem' }}
        />
        <span style={{ color: '#888', 'font-size': '0.78rem', 'margin-left': '0.5rem' }}>
          heuristic-only · no LLM yet
        </span>
      </header>

      <Show when={daf.loading}><p style={{ color: '#888' }}>Loading…</p></Show>
      <Show when={daf.error}><p style={{ color: '#c33' }}>Error: {String(daf.error)}</p></Show>

      <Show when={daf() && eraContext()}>
        <>
            {/* Summary band: which generations are present, source breakdown */}
            <section style={{
              display: 'grid',
              'grid-template-columns': '1fr auto',
              gap: '1.5rem',
              padding: '0.9rem 1rem',
              border: '1px solid #eee',
              'border-radius': '6px',
              background: '#fafafa',
              'margin-bottom': '1rem',
            }}>
              <div>
                <div style={{ 'font-size': '0.75rem', color: '#888', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', 'margin-bottom': '0.4rem' }}>
                  Generations present ({presentInOrder().length}) — click to filter
                </div>
                <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.4rem' }}>
                  <For each={presentInOrder()}>
                    {(id) => {
                      const isActive = () => activeEra() === id;
                      const count = () => eraCounts().get(id) ?? 0;
                      return (
                        <button
                          type="button"
                          onClick={() => setActiveEra(isActive() ? null : id)}
                          style={{
                            display: 'inline-flex',
                            'align-items': 'center',
                            gap: '0.35rem',
                            padding: '0.25rem 0.55rem',
                            border: isActive() ? `2px solid ${eraColor(id)}` : '1px solid #ddd',
                            'border-radius': '4px',
                            background: isActive() ? '#fff' : '#fff',
                            cursor: 'pointer',
                            'font-size': '0.78rem',
                            'font-family': 'inherit',
                            color: '#333',
                          }}
                        >
                          <span style={{
                            display: 'inline-block',
                            width: '10px',
                            height: '10px',
                            'border-radius': '2px',
                            background: eraColor(id),
                          }} />
                          <span>{eraLabel(id)}</span>
                          <span style={{ color: '#888', 'font-size': '0.72rem' }}>{count()}</span>
                        </button>
                      );
                    }}
                  </For>
                  <Show when={activeEra() !== null}>
                    <button
                      type="button"
                      onClick={() => setActiveEra(null)}
                      style={{
                        padding: '0.25rem 0.55rem',
                        border: '1px solid #ddd',
                        'border-radius': '4px',
                        background: '#fff',
                        cursor: 'pointer',
                        'font-size': '0.78rem',
                        color: '#666',
                      }}
                    >clear</button>
                  </Show>
                </div>
              </div>
              <div style={{ 'min-width': '200px' }}>
                <div style={{ 'font-size': '0.75rem', color: '#888', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', 'margin-bottom': '0.4rem' }}>
                  Signal source
                </div>
                <Show when={sourceCounts()}>
                  {(c) => (
                    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.2rem', 'font-size': '0.78rem' }}>
                      <For each={(['speaker', 'marker', 'register', 'stam-default'] as EraSignalSource[])}>
                        {(src) => (
                          <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem' }}>
                            <span style={{
                              display: 'inline-block',
                              width: '10px',
                              height: '10px',
                              'border-radius': '2px',
                              background: SOURCE_BG[src],
                              border: '1px solid #ccc',
                            }} />
                            <span style={{ flex: 1, color: '#444' }}>{SOURCE_LABEL[src]}</span>
                            <span style={{ color: '#888', 'font-family': 'monospace' }}>{c()[src]}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  )}
                </Show>
              </div>
            </section>

            {/* Mini era ribbon: one cell per segment, colored by era */}
            <section style={{ 'margin-bottom': '1rem' }}>
              <div style={{ 'font-size': '0.75rem', color: '#888', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', 'margin-bottom': '0.4rem' }}>
                Daf stratification (segments left → right)
              </div>
              <div style={{ display: 'flex', height: '24px', border: '1px solid #ddd', 'border-radius': '3px', overflow: 'hidden' }}>
                <For each={eraContext()!.segments}>
                  {(s) => {
                    const isMatch = () => activeEra() === null || s.era === activeEra();
                    return (
                      <div
                        title={`#${s.segIdx} · ${eraLabel(s.era)} · ${s.why}`}
                        style={{
                          flex: 1,
                          background: eraColor(s.era),
                          opacity: isMatch() ? 1 : 0.18,
                          cursor: 'pointer',
                          'border-right': '1px solid rgba(255,255,255,0.4)',
                          transition: 'opacity .15s',
                        }}
                        onClick={() => setActiveEra(activeEra() === s.era ? null : s.era)}
                      />
                    );
                  }}
                </For>
              </div>
            </section>

            {/* Per-segment list */}
            <SegmentList
              daf={daf()!}
              segments={eraContext()!.segments}
              activeEra={activeEra()}
            />
        </>
      </Show>
    </main>
  );
}

interface SegmentListProps {
  daf: ExperimentDaf;
  segments: SegmentEra[];
  activeEra: GenerationId | null;
}

function SegmentList(props: SegmentListProps): JSX.Element {
  return (
    <ol style={{ 'list-style': 'none', padding: 0, margin: 0 }}>
      <For each={props.segments}>
        {(s) => {
          const heHtml = props.daf.mainSegmentsHe?.[s.segIdx] ?? '';
          const enText = props.daf.mainSegmentsEn?.[s.segIdx] ?? '';
          const isMatch = () => props.activeEra === null || s.era === props.activeEra;
          return (
            <li style={{
              display: 'grid',
              'grid-template-columns': '60px 1fr 320px',
              gap: '0.8rem',
              'align-items': 'start',
              padding: '0.7rem 0.8rem',
              'margin-bottom': '0.45rem',
              border: '1px solid #eee',
              'border-left': `4px solid ${eraColor(s.era)}`,
              'border-radius': '4px',
              background: '#fff',
              opacity: isMatch() ? 1 : 0.32,
              transition: 'opacity .15s',
            }}>
              {/* Index + era label */}
              <div style={{ 'font-family': 'monospace', 'font-size': '0.75rem', color: '#666' }}>
                <div>#{s.segIdx}</div>
                <div style={{
                  display: 'inline-block',
                  'margin-top': '0.25rem',
                  padding: '1px 5px',
                  background: eraColor(s.era),
                  color: '#fff',
                  'border-radius': '2px',
                  'font-size': '0.65rem',
                }}>{eraLabel(s.era)}</div>
              </div>
              {/* Hebrew + English */}
              <div>
                <div
                  dir="rtl"
                  lang="he"
                  innerHTML={heHtml}
                  style={{ 'font-family': '"Mekorot Vilna", serif', 'font-size': '1rem', 'line-height': 1.55 }}
                />
                <Show when={enText}>
                  <div style={{ 'font-size': '0.78rem', color: '#666', 'margin-top': '0.3rem', 'font-style': 'italic' }}>
                    {enText}
                  </div>
                </Show>
              </div>
              {/* Why panel */}
              <div style={{
                background: SOURCE_BG[s.source],
                border: '1px solid rgba(0,0,0,0.06)',
                'border-radius': '3px',
                padding: '0.45rem 0.55rem',
                'font-size': '0.74rem',
                color: '#333',
              }}>
                <div style={{ 'font-family': 'monospace', 'font-size': '0.7rem', color: '#666', 'margin-bottom': '0.25rem' }}>
                  {SOURCE_LABEL[s.source]}
                </div>
                <div style={{ 'line-height': 1.4 }}>{s.why}</div>
                <Show when={s.speakers && s.speakers.length > 1}>
                  <div style={{ 'margin-top': '0.35rem', 'font-size': '0.7rem', color: '#666' }}>
                    speakers:
                    <For each={s.speakers}>
                      {(sp) => (
                        <span dir="rtl" style={{ 'margin-left': '0.4rem' }}>
                          {sp.nameHe} <span style={{ color: '#999' }}>({sp.era})</span>
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </li>
          );
        }}
      </For>
    </ol>
  );
}
