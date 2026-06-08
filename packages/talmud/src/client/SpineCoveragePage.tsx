import { createResource, createSignal, createMemo, For, Show, type JSX } from 'solid-js';
import { FlowLegend, connectionKinds, KIND_COLOR } from './ArgumentFlowGraph';
import SpineFlowGraph, { type SpineViewDaf } from './SpineFlowGraph';

/**
 * Spine coverage — a punchcard of the global spine. Rows are dapim down a
 * tractate; columns are the pieces we can compute. A filled cell = a piece is
 * cached for that (daf, producer); empty = not built yet. The whole tractate
 * reads as a map that fills in as study/warming progresses. Read-only; backed by
 * GET /api/spine-coverage/:tractate (no piece is computed by opening this page).
 *
 * Styled to the app: system-ui + the shared CSS tokens (--bg/--fg/--muted/
 * --accent/--line), card surfaces, and the .tb-* control vocabulary. Monospace
 * is reserved for genuinely tabular values only (daf column, coords, run chains).
 */

interface CoverageColumn {
  id: string;
  label: string;
  kind: 'source' | 'mark' | 'enrichment';
  version: string;
}
interface CoverageRow {
  page: string;
  cells: Record<string, boolean>;
}
interface CoverageReport {
  tractate: string;
  endAmud: string;
  columns: CoverageColumn[];
  rows: CoverageRow[];
  summary: { computed: number; total: number; pct: number };
}

interface SpineGraph {
  tractate: string;
  nodes: { key: string; coord: { tractate: string; page: string; seg: number } }[];
  edges: { source: string; target: string; relation: string; via: string; note?: string }[];
  byRelation: Record<string, number>;
  byVia: Record<string, number>;
  continuityRuns: string[][];
  coverage: { dapimWithLinks: number; dapimTotal: number };
}

// coordKey "tractate:page:seg" -> compact "page §seg" ("page" when whole-daf).
function coordLabel(key: string): string {
  const parts = key.split(':');
  const seg = Number(parts[parts.length - 1]);
  const page = parts[parts.length - 2];
  return seg < 0 ? page : `${page} §${seg}`;
}

// Relation colors come from the daf reader's own muted KIND_COLOR (imported), so
// #spine never drifts from the reader. `glosses` isn't a flow kind — fall back.
const relColor = (rel: string): string => (KIND_COLOR as Record<string, string>)[rel] ?? 'var(--muted)';

// Coverage producer kinds, recoloured off neon onto app-native hues.
const COV_COLOR: Record<string, string> = { source: '#475569', mark: 'var(--accent)', enrichment: '#7c3aed' };

// A modest set of quick-pick tractates (the full set is whatever the server
// recognises; this is just for convenience). The page also takes free text.
const PRESETS = ['berakhot', 'shabbat', 'eruvin', 'pesachim', 'sukkah', 'bava_metzia', 'bava_kamma', 'sanhedrin'];

// Reserved ONLY for tabular/coord values, per the app's monospace convention.
const MONO = "'SF Mono', Menlo, Monaco, Consolas, monospace";
const HILITE = '#b8860b'; // rabbi-trace highlight (matches SpineFlowGraph)

const PANEL: JSX.CSSProperties = { border: '1px solid var(--line)', 'border-radius': '8px', background: '#fff', padding: '0.85rem 1rem', margin: '0 0 1rem' };
const PANEL_H: JSX.CSSProperties = { 'font-size': '0.78rem', 'text-transform': 'uppercase', 'letter-spacing': '0.07em', color: 'var(--muted)', 'font-weight': 700, margin: 0 };
const CHIP = (color: string): JSX.CSSProperties => ({
  display: 'inline-flex', 'align-items': 'center', gap: '0.35rem', padding: '0.1rem 0.5rem',
  background: '#faf8f3', border: '1px solid #ece7db', 'border-radius': '999px', 'font-size': '0.7rem', color: 'var(--muted)',
  'border-left': `3px solid ${color}`,
});

function routeTractate(): string {
  const raw = window.location.hash.replace(/^#/, '');
  const parts = raw.split('/');
  return (parts[1] || 'berakhot').toLowerCase();
}

async function fetchCoverage(tractate: string): Promise<CoverageReport> {
  const r = await fetch(`/api/spine-coverage/${encodeURIComponent(tractate)}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${r.status}`);
  }
  return r.json();
}

async function fetchSpineGraph(tractate: string): Promise<SpineGraph> {
  const r = await fetch(`/api/spine-links/${encodeURIComponent(tractate)}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${r.status}`);
  }
  return r.json();
}

async function fetchSpineView(tractate: string): Promise<{ tractate: string; dapim: SpineViewDaf[] }> {
  const r = await fetch(`/api/spine-view/${encodeURIComponent(tractate)}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${r.status}`);
  }
  return r.json();
}

const FLOW_VIEW_CAP = 40; // keep the stitched render light; note when truncated

export function SpineCoveragePage(): JSX.Element {
  const [tractate, setTractate] = createSignal(routeTractate());
  window.addEventListener('hashchange', () => setTractate(routeTractate()));
  const [report] = createResource(tractate, fetchCoverage);
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [input, setInput] = createSignal('');
  // The assembled spine graph loads on demand (it sweeps the whole tractate).
  // A non-null trigger (the tractate) activates the resource. A third hash
  // segment (#spine/<tractate>/assemble) auto-loads it — a shareable deep link.
  const thirdSeg = () => window.location.hash.replace(/^#/, '').split('/')[2];
  const [graphTrigger, setGraphTrigger] = createSignal<string | null>(thirdSeg() === 'assemble' ? routeTractate() : null);
  const [graph] = createResource(graphTrigger, fetchSpineGraph);
  // The stitched flow view (real per-daf flow graphs, connected by cross-daf
  // edges). Loads on demand; #spine/<tractate>/flow auto-loads it.
  const [viewTrigger, setViewTrigger] = createSignal<string | null>(thirdSeg() === 'flow' ? routeTractate() : null);
  const [flowView] = createResource(viewTrigger, fetchSpineView);
  const [trace, setTrace] = createSignal<string | null>(null); // rabbi being traced across the tractate

  const go = (t: string) => {
    const slug = t.trim().toLowerCase().replace(/\s+/g, '_');
    if (slug) window.location.hash = `spine/${slug}`;
  };

  const prettyTractate = () => tractate().replace(/_/g, ' ');

  return (
    <main class="page-shell" style={{ '--page-max': '1040px' }}>
      <header style={{ 'margin-bottom': '1.1rem' }}>
        <a href="#daf" style={{ color: 'var(--muted)', 'text-decoration': 'none', 'font-size': '0.85rem' }}>&larr; back to daf</a>
        <h1 style={{ margin: '0.4rem 0 0', 'font-size': '1.5rem', 'letter-spacing': '-0.02em', color: 'var(--fg)', 'text-transform': 'capitalize' }}>
          Spine &middot; <span style={{ color: 'var(--accent)' }}>{prettyTractate()}</span>
        </h1>
        <p style={{ margin: '0.25rem 0 0', 'font-size': '0.85rem', color: 'var(--muted)' }}>
          which pieces of the whole tractate are computed, and how they link
        </p>
      </header>

      {/* tractate picker */}
      <div class="responsive-row" style={{ 'margin-bottom': '1.1rem', gap: '0.4rem' }}>
        <input
          class="tb-select"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(input()); }}
          placeholder="tractate (e.g. bava_metzia)"
          style={{ width: '220px' }}
        />
        <button class="tb-primary" style={{ 'border-radius': 'var(--tb-radius)' }} onClick={() => go(input())}>Go</button>
        <For each={PRESETS}>
          {(p) => (
            <button
              onClick={() => go(p)}
              style={{
                'font-family': 'inherit', 'font-size': '0.78rem', padding: '0.2rem 0.6rem', cursor: 'pointer',
                'border-radius': '999px',
                border: p === tractate() ? '1px solid var(--accent)' : '1px solid var(--line)',
                background: p === tractate() ? 'var(--accent)' : '#fff',
                color: p === tractate() ? '#fff' : 'var(--muted)',
              }}
            >{p}</button>
          )}
        </For>
      </div>

      <Show when={report.loading}>
        <p style={{ 'font-size': '0.88rem', color: 'var(--muted)', 'font-style': 'italic' }}>probing cache&hellip;</p>
      </Show>
      <Show when={report.error}>
        <p style={{ 'font-size': '0.88rem', color: '#b3261e' }}>error: {String(report.error?.message || report.error)}</p>
      </Show>

      <Show when={report()}>
        {(r) => (
          <>
            {/* summary */}
            <div style={{ display: 'flex', 'align-items': 'center', gap: '0.7rem', 'margin-bottom': '1.1rem', 'font-size': '0.88rem', 'flex-wrap': 'wrap' }}>
              <span style={{ 'font-weight': 700, color: 'var(--fg)' }}>{r().summary.pct}%</span>
              <span style={{ display: 'inline-block', width: '160px', height: '8px', background: 'var(--line)', 'border-radius': '999px', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${r().summary.pct}%`, height: '100%', background: 'var(--accent)' }} />
              </span>
              <span style={{ color: 'var(--muted)' }}>
                {r().summary.computed} / {r().summary.total} pieces &middot; {r().rows.length} dapim &times; {r().columns.length} producers &middot; to {r().endAmud}
              </span>
            </div>

            {/* assembled spine graph (loads on demand) */}
            <div style={PANEL}>
              <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '10px' }}>
                <span style={PANEL_H}>Assembled spine &mdash; tractate link graph</span>
                <button class="tb-select" disabled={graph.loading} onClick={() => setGraphTrigger(tractate())}>
                  {graph.loading ? 'assembling…' : (graph() ? 'rebuild' : 'assemble')}
                </button>
              </div>
              <Show when={graph.error}>
                <p style={{ 'font-size': '0.85rem', color: '#b3261e', margin: '6px 0 0' }}>error: {String(graph.error?.message || graph.error)}</p>
              </Show>
              <Show when={graph()}>
                {(g) => (
                  <div style={{ 'margin-top': '0.7rem', 'font-size': '0.85rem' }}>
                    <div style={{ color: 'var(--muted)', 'margin-bottom': '0.5rem' }}>
                      {g().nodes.length} nodes &middot; {g().edges.length} edges &middot; backbone from {g().coverage.dapimWithLinks} / {g().coverage.dapimTotal} dapim with links
                    </div>
                    <div style={{ 'font-size': '0.78rem', color: 'var(--muted)', 'margin-bottom': '0.5rem' }}>
                      by producer: {Object.entries(g().byVia).map(([v, n]) => `${v} ${n}`).join('  ·  ') || '—'}
                    </div>
                    {/* relation breakdown */}
                    <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'margin-bottom': '0.7rem' }}>
                      <For each={Object.entries(g().byRelation).sort((a, b) => b[1] - a[1])}>
                        {([rel, n]) => (
                          <span style={CHIP(relColor(rel))}>{rel} {n}</span>
                        )}
                      </For>
                    </div>
                    {/* continuity backbone — sugya chains that carry across daf boundaries */}
                    <Show when={g().continuityRuns.length} fallback={<div style={{ color: 'var(--muted)', 'font-style': 'italic' }}>no continuity edges cached yet (warm bridges to grow the backbone)</div>}>
                      <div style={{ ...PANEL_H, 'margin-bottom': '0.3rem', color: relColor('continues') }}>
                        Continuity backbone &mdash; {g().continuityRuns.length} runs
                      </div>
                      <div style={{ 'max-height': '180px', 'overflow-y': 'auto', 'font-family': MONO, 'font-size': '0.8rem' }}>
                        <For each={g().continuityRuns.sort((a, b) => b.length - a.length)}>
                          {(run) => (
                            <div style={{ padding: '1px 0', color: 'var(--fg)' }}>
                              <span style={{ color: 'var(--muted)' }}>{String(run.length).padStart(2)} </span>
                              {run.join(' → ')}
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                    {/* cross-daf edges — the AI Stage 1 layer (section -> section across the page break) */}
                    <Show when={g().edges.some((e) => e.via === 'cross-flow')}>
                      <div style={{ ...PANEL_H, margin: '0.7rem 0 0.3rem', color: relColor('parallels') }}>
                        Cross-daf edges (AI) &mdash; {g().edges.filter((e) => e.via === 'cross-flow').length}
                      </div>
                      <div style={{ 'max-height': '200px', 'overflow-y': 'auto', 'font-size': '0.83rem' }}>
                        <For each={g().edges.filter((e) => e.via === 'cross-flow')}>
                          {(e) => (
                            <div style={{ padding: '1px 0' }}>
                              <span style={{ 'font-family': MONO }}>{coordLabel(e.source)}</span>
                              <span style={{ color: relColor(e.relation), margin: '0 0.4rem' }}>&mdash;{e.relation}&rarr;</span>
                              <span style={{ 'font-family': MONO }}>{coordLabel(e.target)}</span>
                              <Show when={e.note}><span style={{ color: 'var(--muted)' }}>  {e.note}</span></Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                )}
              </Show>
            </div>

            {/* stitched flow view — real per-daf flow graphs down the tractate,
                connected by the cross-daf edges */}
            <div style={PANEL}>
              <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '10px' }}>
                <span style={PANEL_H}>Stitched flow &mdash; the argument map down the tractate</span>
                <button class="tb-select" disabled={flowView.loading} onClick={() => setViewTrigger(tractate())}>
                  {flowView.loading ? 'loading…' : (flowView() ? 'reload' : 'load')}
                </button>
              </div>
              <Show when={flowView.error}>
                <p style={{ 'font-size': '0.85rem', color: '#b3261e', margin: '6px 0 0' }}>error: {String(flowView.error?.message || flowView.error)}</p>
              </Show>
              <Show when={flowView()}>
                {(v) => {
                  // Render dapim with flow OR the daf a cross-edge points INTO, so
                  // both ends of every drawn cross-daf arrow are present.
                  const shown = createMemo(() => {
                    const keep = new Set<string>();
                    for (const d of v().dapim) {
                      if (d.flow.length || d.cross.length) { keep.add(d.page); if (d.cross.length && d.nextPage) keep.add(d.nextPage); }
                    }
                    return v().dapim.filter((d) => keep.has(d.page));
                  });
                  const capped = createMemo(() => shown().slice(0, FLOW_VIEW_CAP));
                  const allKinds = createMemo(() => connectionKinds(capped().flatMap((d) => d.flow) as Parameters<typeof connectionKinds>[0]));
                  const crossCount = createMemo(() => capped().reduce((n, d) => n + d.cross.length, 0));
                  return (
                    <div style={{ 'margin-top': '0.7rem' }}>
                      <div style={{ 'font-size': '0.8rem', color: 'var(--muted)', 'margin-bottom': '0.3rem' }}>
                        showing {capped().length} of {shown().length} dapim {shown().length > FLOW_VIEW_CAP ? '(capped)' : ''} &middot; {crossCount()} cross-daf arrows (thicker lines span the page break) &middot; click a rabbi to trace
                      </div>
                      <FlowLegend kinds={allKinds()} />
                      <Show when={trace()}>
                        {(slug) => {
                          let display = slug();
                          let boxes = 0;
                          for (const d of capped()) for (const s of d.sections) {
                            const hit = s.rabbis.find((rb) => rb.slug === slug());
                            if (hit) { boxes++; display = hit.name; }
                          }
                          return (
                            <div style={{ margin: '0.5rem 0', padding: '0.3rem 0.6rem', border: `1px solid ${HILITE}`, 'border-radius': '6px', background: '#fffaf0', 'font-size': '0.85rem', display: 'inline-block' }}>
                              tracing <span style={{ 'font-weight': 700, color: HILITE }}>{display}</span> &middot; {boxes} {boxes === 1 ? 'box' : 'boxes'}{' '}
                              <button class="tb-select" style={{ 'margin-left': '0.5rem', height: 'auto', padding: '0.1rem 0.5rem', 'font-size': '0.78rem' }} onClick={() => setTrace(null)}>clear</button>
                            </div>
                          );
                        }}
                      </Show>
                      <SpineFlowGraph
                        dapim={capped() as SpineViewDaf[]}
                        highlight={trace()}
                        onRabbi={(slug) => setTrace((prev) => (prev === slug ? null : slug))}
                      />
                    </div>
                  );
                }}
              </Show>
            </div>

            {/* coverage punchcard */}
            <div style={PANEL}>
              <span style={PANEL_H}>Coverage &mdash; pieces per daf</span>
              {/* legend */}
              <div style={{ display: 'flex', gap: '1rem', 'flex-wrap': 'wrap', margin: '0.6rem 0', 'font-size': '0.78rem', color: 'var(--muted)', 'align-items': 'center' }}>
                <For each={[['source', 'source text'], ['mark', 'mark'], ['enrichment', 'enrichment']]}>
                  {([k, lbl]) => (
                    <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.35rem' }}>
                      <span style={{ display: 'inline-block', width: '11px', height: '11px', 'border-radius': '3px', background: COV_COLOR[k] }} /> {lbl}
                    </span>
                  )}
                </For>
                <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.35rem' }}>
                  <span style={{ display: 'inline-block', width: '11px', height: '11px', 'border-radius': '3px', border: '1px solid var(--line)' }} /> not computed
                </span>
              </div>

              {/* column header */}
              <div style={{ display: 'flex', 'font-size': '0.72rem', color: 'var(--muted)', 'margin-bottom': '0.3rem', 'border-bottom': '1px solid var(--line)', 'padding-bottom': '0.3rem' }}>
                <span style={{ width: '44px', 'flex-shrink': 0 }} />
                <For each={r().columns}>
                  {(col) => (
                    <span title={`${col.label} (${col.kind} ${col.version})`} style={{ width: '34px', 'flex-shrink': 0, 'text-align': 'center', color: COV_COLOR[col.kind] }}>
                      {col.label.slice(0, 3)}
                    </span>
                  )}
                </For>
              </div>

              {/* grid */}
              <div>
                <For each={r().rows}>
                  {(row) => {
                    const isOpen = createMemo(() => expanded() === row.page);
                    const filledCount = createMemo(() => r().columns.filter((c) => row.cells[c.id]).length);
                    return (
                      <>
                        <div
                          onClick={() => setExpanded(isOpen() ? null : row.page)}
                          style={{
                            display: 'flex', 'align-items': 'center', cursor: 'pointer', 'border-radius': '4px',
                            'font-size': '0.8rem', padding: '0.1rem 0',
                            background: isOpen() ? '#f2eee4' : 'transparent',
                          }}
                        >
                          <span style={{ width: '44px', 'flex-shrink': 0, 'font-family': MONO, 'font-size': '0.78rem', color: filledCount() ? 'var(--fg)' : 'var(--muted)', 'font-weight': isOpen() ? 700 : 400, 'padding-left': '0.2rem' }}>
                            {row.page}
                          </span>
                          <For each={r().columns}>
                            {(col) => (
                              <span style={{ width: '34px', 'flex-shrink': 0, display: 'flex', 'justify-content': 'center' }}
                                title={`${row.page} · ${col.label}: ${row.cells[col.id] ? 'computed' : 'not computed'}`}>
                                <span style={{
                                  width: '11px', height: '11px', 'border-radius': '3px',
                                  background: row.cells[col.id] ? COV_COLOR[col.kind] : 'transparent',
                                  border: row.cells[col.id] ? 'none' : '1px solid var(--line)',
                                }} />
                              </span>
                            )}
                          </For>
                        </div>
                        <Show when={isOpen()}>
                          <div style={{ margin: '0.2rem 0 0.5rem 44px', padding: '0.5rem 0.7rem', border: '1px solid #eae8e0', 'border-radius': '6px', background: '#fafaf7', 'font-size': '0.83rem' }}>
                            <div style={{ 'font-weight': 700, 'margin-bottom': '0.3rem', 'text-transform': 'capitalize' }}>{prettyTractate()} {row.page}</div>
                            <For each={r().columns}>
                              {(col) => (
                                <div style={{ display: 'flex', 'justify-content': 'space-between', padding: '1px 0' }}>
                                  <span style={{ color: COV_COLOR[col.kind] }}>
                                    {col.label} <span style={{ color: 'var(--muted)', 'font-size': '0.7rem' }}>{col.kind}</span>
                                  </span>
                                  <span style={{ color: row.cells[col.id] ? '#15803d' : 'var(--muted)' }}>
                                    {row.cells[col.id] ? '✓ cached' : '· missing'}
                                  </span>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </>
                    );
                  }}
                </For>
              </div>
            </div>
          </>
        )}
      </Show>
    </main>
  );
}
