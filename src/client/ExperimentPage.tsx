import { createResource, createSignal, For, Show, createMemo, type JSX } from 'solid-js';
import { TRACTATE_OPTIONS, type TalmudPageData } from '../lib/sefref';
import { classifyDaf } from '../lib/era/heuristic';
import { extractTalmudContent } from '../lib/sefref/alignment';
import { GENERATION_BY_ID, GENERATIONS, type GenerationId } from './generations';
import { GenerationTimeline } from './GenerationTimeline';
import type { SegmentEra, EraSignalSource } from '../lib/era/types';

interface LlmPick { idx: number; era: GenerationId; why: string }
interface LlmResponse { picks: LlmPick[]; _cached?: boolean; _ms?: number; error?: string }

async function fetchEraLlm(
  tractate: string,
  page: string,
  segments: { idx: number; text: string; before?: string; after?: string; heuristicGuess?: string }[],
): Promise<LlmResponse> {
  const res = await fetch(
    `/api/era-llm/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ segments }),
    },
  );
  const json = await res.json() as LlmResponse;
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

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
  const [llmPicks, setLlmPicks] = createSignal<Map<number, LlmPick> | null>(null);
  const [llmLoading, setLlmLoading] = createSignal(false);
  const [llmError, setLlmError] = createSignal<string | null>(null);
  const [llmCached, setLlmCached] = createSignal(false);
  const [llmMs, setLlmMs] = createSignal<number | null>(null);

  const ref = createMemo(() => ({ tractate: tractate(), page: page() }));
  const [daf] = createResource(ref, fetchDaf);

  const eraContext = createMemo(() => {
    const d = daf();
    if (!d?.mainSegmentsHe?.length) return null;
    // Reset LLM picks whenever the daf changes — they no longer apply.
    setLlmPicks(null); setLlmError(null); setLlmCached(false); setLlmMs(null);
    return classifyDaf(d.mainSegmentsHe);
  });

  // Effective era per segment: LLM pick wins when present, otherwise heuristic.
  const effectiveSegments = createMemo<SegmentEra[]>(() => {
    const ctx = eraContext();
    if (!ctx) return [];
    const llm = llmPicks();
    if (!llm || llm.size === 0) return ctx.segments;
    return ctx.segments.map((s) => {
      const pick = llm.get(s.segIdx);
      if (!pick) return s;
      return { ...s, era: pick.era, source: 'llm' as const, why: `LLM: ${pick.why}` };
    });
  });

  const runLlm = async () => {
    const d = daf();
    const ctx = eraContext();
    if (!d?.mainSegmentsHe || !ctx) return;
    const lowConf = ctx.segments.filter((s) => s.source === 'register' || s.source === 'stam-default');
    if (lowConf.length === 0) {
      setLlmError('No low-confidence segments to send.');
      return;
    }
    const plain = d.mainSegmentsHe.map((html) => extractTalmudContent(html));
    const payload = lowConf.map((s) => ({
      idx: s.segIdx,
      text: plain[s.segIdx] ?? '',
      before: s.segIdx > 0 ? plain[s.segIdx - 1]?.slice(0, 200) : undefined,
      after: s.segIdx + 1 < plain.length ? plain[s.segIdx + 1]?.slice(0, 200) : undefined,
      heuristicGuess: s.era,
    }));
    setLlmLoading(true); setLlmError(null);
    try {
      const r = await fetchEraLlm(tractate(), page(), payload);
      const m = new Map<number, LlmPick>();
      for (const p of r.picks) m.set(p.idx, p);
      setLlmPicks(m);
      setLlmCached(!!r._cached);
      setLlmMs(r._ms ?? null);
    } catch (e) {
      setLlmError(String(e));
    } finally {
      setLlmLoading(false);
    }
  };

  const sourceCounts = createMemo(() => {
    const segs = effectiveSegments();
    if (segs.length === 0) return null;
    const c: Record<EraSignalSource, number> = {
      'speaker': 0, 'marker': 0, 'register': 0, 'stam-default': 0, 'llm': 0,
    };
    for (const s of segs) c[s.source]++;
    return c;
  });

  const eraCounts = createMemo(() => {
    const m = new Map<GenerationId, number>();
    for (const s of effectiveSegments()) m.set(s.era, (m.get(s.era) ?? 0) + 1);
    return m;
  });

  const lowConfCount = createMemo(() => {
    const ctx = eraContext();
    if (!ctx) return 0;
    return ctx.segments.filter((s) => s.source === 'register' || s.source === 'stam-default').length;
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
        <div style={{ 'margin-left': 'auto', display: 'flex', 'align-items': 'center', gap: '0.5rem' }}>
          <Show when={llmError()}>
            <span style={{ color: '#c33', 'font-size': '0.75rem' }}>{llmError()}</span>
          </Show>
          <Show when={llmPicks() && !llmLoading()}>
            <span style={{ color: '#666', 'font-size': '0.72rem' }}>
              LLM applied to {llmPicks()!.size} seg{llmPicks()!.size === 1 ? '' : 's'}
              {llmCached() ? ' (cached)' : llmMs() != null ? ` (${llmMs()}ms)` : ''}
            </span>
          </Show>
          <button
            type="button"
            onClick={runLlm}
            disabled={llmLoading() || lowConfCount() === 0}
            style={{
              padding: '0.35rem 0.75rem',
              border: '1px solid #6d28d9',
              'border-radius': '4px',
              background: llmLoading() ? '#ede9fe' : '#7c3aed',
              color: llmLoading() ? '#6d28d9' : '#fff',
              cursor: (llmLoading() || lowConfCount() === 0) ? 'default' : 'pointer',
              'font-size': '0.78rem',
              'font-family': 'inherit',
              opacity: lowConfCount() === 0 ? 0.5 : 1,
            }}
          >
            {llmLoading() ? 'Running Kimi K2.6…' : `Run LLM on ${lowConfCount()} low-conf seg${lowConfCount() === 1 ? '' : 's'}`}
          </button>
        </div>
      </header>

      <Show when={daf.loading}><p style={{ color: '#888' }}>Loading…</p></Show>
      <Show when={daf.error}><p style={{ color: '#c33' }}>Error: {String(daf.error)}</p></Show>

      <Show when={daf() && eraContext()}>
        <>
            {/* GenerationTimeline driven by era stratification (no rabbis here yet —
                the experiment scope is segment-era only). Click a cell to filter. */}
            <GenerationTimeline
              rabbis={null}
              eraSegmentCounts={eraCounts()}
              activeGeneration={activeEra()}
              onHighlightGeneration={(gen) => setActiveEra(gen)}
              showGenMarkers={false}
              onToggleGenMarkers={() => { /* no-op on /experiment */ }}
              width={900}
            />

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
                <For each={effectiveSegments()}>
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

            {/* Per-segment list — heuristic and (when LLM ran) the override */}
            <SegmentList
              daf={daf()!}
              segments={effectiveSegments()}
              heuristic={eraContext()!.segments}
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
  heuristic: SegmentEra[];
  activeEra: GenerationId | null;
}

function SegmentList(props: SegmentListProps): JSX.Element {
  return (
    <ol style={{ 'list-style': 'none', padding: 0, margin: 0 }}>
      <For each={props.segments}>
        {(s) => {
          const heHtml = props.daf.mainSegmentsHe?.[s.segIdx] ?? '';
          const enText = props.daf.mainSegmentsEn?.[s.segIdx] ?? '';
          const heur = props.heuristic[s.segIdx];
          const llmOverride = s.source === 'llm';
          const disagrees = llmOverride && heur && heur.era !== s.era;
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
              {/* Index + era label (+ heuristic-was when LLM overrode) */}
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
                <Show when={disagrees && heur}>
                  <div style={{ 'margin-top': '0.2rem', 'font-size': '0.6rem', color: '#888' }}>
                    heur was: <span style={{ color: eraColor(heur!.era) }}>{eraLabel(heur!.era)}</span>
                  </div>
                </Show>
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
