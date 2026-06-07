import { createResource, createSignal, createMemo, For, Show, type JSX } from 'solid-js';
import { FlowLegend, connectionKinds } from './ArgumentFlowGraph';
import SpineFlowGraph, { type SpineViewDaf } from './SpineFlowGraph';

/**
 * Spine coverage — a punchcard of the global spine. Rows are dapim down a
 * tractate; columns are the pieces we can compute. A filled cell = a piece is
 * cached for that (daf, producer); empty = not built yet. The whole tractate
 * reads as a map that fills in as study/warming progresses. Read-only; backed by
 * GET /api/spine-coverage/:tractate (no piece is computed by opening this page).
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

// Relation -> color, mirroring the flow-graph palette intent.
const RELATION_COLOR: Record<string, string> = {
  continues: '#0066CC',
  resolves: '#00A36C',
  'depends-on': '#FF9900',
  parallels: '#9933CC',
  contrasts: '#FF3366',
  generalizes: '#666666',
  cites: '#333333',
  glosses: '#888888',
};

// A modest set of quick-pick tractates (the full set is whatever the server
// recognises; this is just for convenience). The page also takes free text.
const PRESETS = ['berakhot', 'shabbat', 'eruvin', 'pesachim', 'sukkah', 'bava_metzia', 'bava_kamma', 'sanhedrin'];

const MONO = "'Berkeley Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace";
const KIND_COLOR: Record<string, string> = {
  source: '#666666',
  mark: '#0066CC',
  enrichment: '#FF3366',
};

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

  const go = (t: string) => {
    const slug = t.trim().toLowerCase().replace(/\s+/g, '_');
    if (slug) window.location.hash = `spine/${slug}`;
  };

  const bar = (pct: number) => {
    const filled = Math.round(pct / 5);
    return '█'.repeat(filled) + '░'.repeat(20 - filled);
  };

  // Short 3-char column codes so the grid stays narrow; full label on hover.
  const code = (label: string) => label.slice(0, 3);

  const cellChar = '██'; // ██
  const emptyChar = '··'; // ··

  return (
    <main
      class="page-shell"
      style={{
        '--page-max': '980px',
        'font-family': MONO,
        color: '#333333',
        background: '#FAFAFA',
        'min-height': '100vh',
        padding: '1.5rem',
      }}
    >
      <header style={{ 'margin-bottom': '1rem' }}>
        <a href="#daf" style={{ color: '#666', 'text-decoration': 'none', 'font-size': '13px' }}>&larr; back to daf</a>
        <h1 style={{ margin: '0.4rem 0 0', 'font-size': '20px', 'font-weight': 700, 'letter-spacing': '0.04em' }}>
          [SPINE] {tractate().toUpperCase().replace(/_/g, ' ')}
        </h1>
        <p style={{ margin: '0.2rem 0 0', 'font-size': '12px', color: '#666' }}>
          coverage map &mdash; which pieces of the whole tractate are computed
        </p>
      </header>

      {/* tractate picker */}
      <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '6px', 'align-items': 'center', 'margin-bottom': '1rem' }}>
        <input
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(input()); }}
          placeholder="tractate (e.g. bava_metzia)"
          style={{
            'font-family': MONO, 'font-size': '12px', padding: '4px 8px',
            border: '1.5px solid #333', background: '#fff', color: '#333', width: '200px',
          }}
        />
        <button
          onClick={() => go(input())}
          style={{ 'font-family': MONO, 'font-size': '12px', padding: '4px 10px', border: '1.5px solid #000', background: '#fff', cursor: 'pointer' }}
        >GO</button>
        <For each={PRESETS}>
          {(p) => (
            <button
              onClick={() => go(p)}
              style={{
                'font-family': MONO, 'font-size': '11px', padding: '3px 8px',
                border: '1px solid #ccc', cursor: 'pointer',
                background: p === tractate() ? '#333' : '#fff',
                color: p === tractate() ? '#fff' : '#666',
              }}
            >{p}</button>
          )}
        </For>
      </div>

      <Show when={report.loading}>
        <p style={{ 'font-size': '13px', color: '#666' }}>probing cache&hellip;</p>
      </Show>
      <Show when={report.error}>
        <p style={{ 'font-size': '13px', color: '#FF3366' }}>error: {String(report.error?.message || report.error)}</p>
      </Show>

      <Show when={report()}>
        {(r) => (
          <>
            {/* summary */}
            <div style={{ 'margin-bottom': '1rem', 'font-size': '13px' }}>
              <span style={{ 'font-weight': 700 }}>{r().summary.pct}%</span>{' '}
              <span style={{ color: KIND_COLOR.mark, 'letter-spacing': '-1px' }}>{bar(r().summary.pct)}</span>{' '}
              <span style={{ color: '#666' }}>
                {r().summary.computed} / {r().summary.total} pieces &middot; {r().rows.length} dapim &times; {r().columns.length} producers &middot; to {r().endAmud}
              </span>
            </div>

            {/* assembled spine graph (loads on demand) */}
            <div style={{ margin: '0 0 1rem', padding: '10px 12px', border: '1.5px solid #333', background: '#fff' }}>
              <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '10px' }}>
                <span style={{ 'font-size': '12px', 'font-weight': 700 }}>ASSEMBLED SPINE &mdash; tractate link graph (so far)</span>
                <button
                  onClick={() => { setGraphTrigger(tractate()); }}
                  disabled={graph.loading}
                  style={{ 'font-family': MONO, 'font-size': '11px', padding: '3px 10px', border: '1.5px solid #000', background: graph.loading ? '#eee' : '#fff', cursor: 'pointer' }}
                >{graph.loading ? 'assembling…' : (graph() ? 'rebuild' : 'assemble')}</button>
              </div>
              <Show when={graph.error}>
                <p style={{ 'font-size': '12px', color: '#FF3366', margin: '6px 0 0' }}>error: {String(graph.error?.message || graph.error)}</p>
              </Show>
              <Show when={graph()}>
                {(g) => (
                  <div style={{ 'margin-top': '8px', 'font-size': '12px' }}>
                    <div style={{ color: '#666', 'margin-bottom': '6px' }}>
                      {g().nodes.length} nodes &middot; {g().edges.length} edges &middot; backbone from {g().coverage.dapimWithLinks} / {g().coverage.dapimTotal} dapim with links
                    </div>
                    {/* by producer — distinguishes the deterministic layers from the AI cross-daf one */}
                    <div style={{ 'font-size': '11px', color: '#888', 'margin-bottom': '6px' }}>
                      by producer: {Object.entries(g().byVia).map(([v, n]) => `${v} ${n}`).join('  ·  ') || '—'}
                    </div>
                    {/* relation breakdown */}
                    <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '6px', 'margin-bottom': '8px' }}>
                      <For each={Object.entries(g().byRelation).sort((a, b) => b[1] - a[1])}>
                        {([rel, n]) => (
                          <span style={{ 'font-size': '11px', padding: '2px 7px', border: `1px solid ${RELATION_COLOR[rel] || '#999'}`, color: RELATION_COLOR[rel] || '#333' }}>
                            {rel} {n}
                          </span>
                        )}
                      </For>
                    </div>
                    {/* continuity backbone — sugya chains that carry across daf boundaries */}
                    <Show when={g().continuityRuns.length} fallback={<div style={{ color: '#999' }}>no continuity edges cached yet (warm bridges to grow the backbone)</div>}>
                      <div style={{ 'font-weight': 700, 'font-size': '11px', 'margin-bottom': '4px', color: RELATION_COLOR.continues }}>
                        CONTINUITY BACKBONE &mdash; {g().continuityRuns.length} runs
                      </div>
                      <div style={{ 'max-height': '180px', 'overflow-y': 'auto' }}>
                        <For each={g().continuityRuns.sort((a, b) => b.length - a.length)}>
                          {(run) => (
                            <div style={{ 'font-size': '12px', padding: '1px 0', color: '#333' }}>
                              <span style={{ color: '#999' }}>{String(run.length).padStart(2)} </span>
                              {run.join(' → ')}
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                    {/* cross-daf edges — the AI Stage 1 layer (section -> section across the page break) */}
                    <Show when={g().edges.some((e) => e.via === 'cross-flow')}>
                      <div style={{ 'font-weight': 700, 'font-size': '11px', margin: '10px 0 4px', color: RELATION_COLOR.parallels }}>
                        CROSS-DAF EDGES (AI) &mdash; {g().edges.filter((e) => e.via === 'cross-flow').length}
                      </div>
                      <div style={{ 'max-height': '200px', 'overflow-y': 'auto' }}>
                        <For each={g().edges.filter((e) => e.via === 'cross-flow')}>
                          {(e) => (
                            <div style={{ 'font-size': '12px', padding: '1px 0' }}>
                              <span>{coordLabel(e.source)}</span>
                              <span style={{ color: RELATION_COLOR[e.relation] || '#666', margin: '0 6px' }}>&mdash;{e.relation}&rarr;</span>
                              <span>{coordLabel(e.target)}</span>
                              <Show when={e.note}><span style={{ color: '#999' }}>  {e.note}</span></Show>
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
            <div style={{ margin: '0 0 1rem', padding: '10px 12px', border: '1.5px solid #333', background: '#fff' }}>
              <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '10px' }}>
                <span style={{ 'font-size': '12px', 'font-weight': 700 }}>STITCHED FLOW &mdash; the argument map down the tractate</span>
                <button
                  onClick={() => setViewTrigger(tractate())}
                  disabled={flowView.loading}
                  style={{ 'font-family': MONO, 'font-size': '11px', padding: '3px 10px', border: '1.5px solid #000', background: flowView.loading ? '#eee' : '#fff', cursor: 'pointer' }}
                >{flowView.loading ? 'loading…' : (flowView() ? 'reload' : 'load')}</button>
              </div>
              <Show when={flowView.error}>
                <p style={{ 'font-size': '12px', color: '#FF3366', margin: '6px 0 0' }}>error: {String(flowView.error?.message || flowView.error)}</p>
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
                    <div style={{ 'margin-top': '8px' }}>
                      <div style={{ 'font-size': '11px', color: '#666', 'margin-bottom': '4px' }}>
                        showing {capped().length} of {shown().length} dapim {shown().length > FLOW_VIEW_CAP ? '(capped)' : ''} &middot; {crossCount()} cross-daf arrows (thicker lines span the page break)
                      </div>
                      <FlowLegend kinds={allKinds()} />
                      <SpineFlowGraph dapim={capped() as SpineViewDaf[]} />
                    </div>
                  );
                }}
              </Show>
            </div>

            {/* legend */}
            <div style={{ display: 'flex', gap: '14px', 'margin-bottom': '10px', 'font-size': '11px', color: '#666' }}>
              <For each={[['source', 'source text'], ['mark', 'mark'], ['enrichment', 'enrichment']]}>
                {([k, lbl]) => (
                  <span><span style={{ color: KIND_COLOR[k], 'font-weight': 700 }}>{cellChar}</span> {lbl}</span>
                )}
              </For>
              <span><span style={{ color: '#d0d0d0' }}>{emptyChar}</span> not computed</span>
            </div>

            {/* column header */}
            <div style={{ display: 'flex', 'font-size': '11px', color: '#333', 'margin-bottom': '4px', 'border-bottom': '1.5px solid #333', 'padding-bottom': '4px' }}>
              <span style={{ width: '44px', 'flex-shrink': 0 }} />
              <For each={r().columns}>
                {(col) => (
                  <span title={`${col.label} (${col.kind} ${col.version})`} style={{ width: '34px', 'flex-shrink': 0, 'text-align': 'center', color: KIND_COLOR[col.kind] }}>
                    {code(col.label)}
                  </span>
                )}
              </For>
            </div>

            {/* grid */}
            <div style={{ 'line-height': 1.15 }}>
              <For each={r().rows}>
                {(row) => {
                  const isOpen = createMemo(() => expanded() === row.page);
                  const filledCount = createMemo(() => r().columns.filter((c) => row.cells[c.id]).length);
                  return (
                    <>
                      <div
                        onClick={() => setExpanded(isOpen() ? null : row.page)}
                        style={{
                          display: 'flex', 'align-items': 'center', cursor: 'pointer',
                          'font-size': '12px', padding: '1px 0',
                          background: isOpen() ? '#eef2f7' : (filledCount() === 0 ? 'transparent' : 'transparent'),
                        }}
                      >
                        <span style={{ width: '44px', 'flex-shrink': 0, color: filledCount() ? '#333' : '#bbb', 'font-weight': isOpen() ? 700 : 400 }}>
                          {row.page}
                        </span>
                        <For each={r().columns}>
                          {(col) => (
                            <span
                              title={`${row.page} · ${col.label}: ${row.cells[col.id] ? 'computed' : 'not computed'}`}
                              style={{ width: '34px', 'flex-shrink': 0, 'text-align': 'center', color: row.cells[col.id] ? KIND_COLOR[col.kind] : '#dcdcdc' }}
                            >
                              {row.cells[col.id] ? cellChar : emptyChar}
                            </span>
                          )}
                        </For>
                      </div>
                      <Show when={isOpen()}>
                        <div style={{ margin: '2px 0 8px 44px', padding: '8px 10px', border: '1px solid #ddd', background: '#fff', 'font-size': '12px' }}>
                          <div style={{ 'font-weight': 700, 'margin-bottom': '4px' }}>{tractate().replace(/_/g, ' ')} {row.page}</div>
                          <For each={r().columns}>
                            {(col) => (
                              <div style={{ display: 'flex', 'justify-content': 'space-between', padding: '1px 0' }}>
                                <span style={{ color: KIND_COLOR[col.kind] }}>
                                  {col.label} <span style={{ color: '#aaa', 'font-size': '10px' }}>{col.kind}</span>
                                </span>
                                <span style={{ color: row.cells[col.id] ? '#0a0' : '#bbb' }}>
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
          </>
        )}
      </Show>
    </main>
  );
}
