import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  type JSX,
  Show,
} from 'solid-js';
import type { StatementSpine } from '../lib/typing/statementSpine';
import { connectionKinds, FlowLegend } from './ArgumentFlowGraph';
import { ArgumentMoveCard, type ArgumentMoveInstance } from './ArgumentSidebar';
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

// Coverage producer kinds, recoloured off neon onto app-native hues.
const COV_COLOR: Record<string, string> = {
  source: '#475569',
  mark: 'var(--accent)',
  enrichment: '#7c3aed',
};

// A modest set of quick-pick tractates (the full set is whatever the server
// recognises; this is just for convenience). The page also takes free text.
const PRESETS = [
  'berakhot',
  'shabbat',
  'eruvin',
  'pesachim',
  'sukkah',
  'bava_metzia',
  'bava_kamma',
  'sanhedrin',
];

// Reserved ONLY for tabular/coord values, per the app's monospace convention.
const MONO = "'SF Mono', Menlo, Monaco, Consolas, monospace";
const HILITE = '#b8860b'; // rabbi-trace highlight (matches SpineFlowGraph)

const PANEL: JSX.CSSProperties = {
  border: '1px solid var(--line)',
  'border-radius': '8px',
  background: '#fff',
  padding: '0.85rem 1rem',
  margin: '0 0 1rem',
};
const PANEL_H: JSX.CSSProperties = {
  'font-size': '0.78rem',
  'text-transform': 'uppercase',
  'letter-spacing': '0.07em',
  color: 'var(--muted)',
  'font-weight': 700,
  margin: 0,
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

async function fetchSpineView(
  tractate: string,
): Promise<{ tractate: string; dapim: SpineViewDaf[] }> {
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
  // The stitched flow view (real per-daf flow graphs, connected by cross-daf
  // edges). Auto-loads with the tractate (keyed like the coverage report);
  // the panel button re-fetches. It is read-only over cached pieces — the
  // sweep reads ~4 KV keys per daf and computes nothing.
  const [flowView, { refetch: refetchFlow }] = createResource(tractate, fetchSpineView);
  const [trace, setTrace] = createSignal<string | null>(null); // rabbi being traced across the tractate
  // #spine/<tractate>/flow/overview deep-links straight to the overview.
  const fourthSeg = () => window.location.hash.replace(/^#/, '').split('/')[3];
  const [flowMode, setFlowMode] = createSignal<'detail' | 'overview'>(
    fourthSeg() === 'overview' ? 'overview' : 'detail',
  );

  // Statement drill-in (same as the reader Overview, lifted to the tractate map):
  // click a section to focus it -> its statement spine expands in the map; click a
  // statement -> its per-move detail shows below. Demand-fetches /api/statement-spine
  // for the focused daf only (one fetch, exactly like the reader — no tractate sweep).
  type SectionSpine = { index: number; spine: StatementSpine; moves: ArgumentMoveInstance[] };
  const [focusedSec, setFocusedSec] = createSignal<{ page: string; index: number } | null>(null);
  const [selectedStmt, setSelectedStmt] = createSignal<string | null>(null);
  createEffect(() => {
    void tractate();
    setFocusedSec(null);
  });
  createEffect(() => {
    void focusedSec();
    setSelectedStmt(null);
  });
  const [spineDaf] = createResource(
    () => (focusedSec() ? `${tractate()}|${focusedSec()!.page}` : null),
    async (key: string): Promise<SectionSpine[]> => {
      const [t, p] = key.split('|');
      try {
        const r = await fetch(
          `/api/statement-spine/${encodeURIComponent(t)}/${encodeURIComponent(p)}`,
        );
        if (!r.ok) return [];
        return ((await r.json()) as { sections?: SectionSpine[] }).sections ?? [];
      } catch {
        return [];
      }
    },
  );
  const activeKey = (): string | null =>
    focusedSec() ? `${focusedSec()!.page}#${focusedSec()!.index}` : null;
  const focusedSecSpine = (): SectionSpine | undefined =>
    (spineDaf() ?? []).find((s) => s.index === focusedSec()?.index);
  const selectedMove = (): ArgumentMoveInstance | undefined =>
    focusedSecSpine()?.moves.find((m) => m.fields.id === selectedStmt());
  // Inject the focused section's statements/links into the dapim handed to the map.
  const withStatements = (dapim: SpineViewDaf[]): SpineViewDaf[] => {
    const f = focusedSec();
    const sp = focusedSecSpine();
    if (!f || !sp) return dapim;
    return dapim.map((d) =>
      d.page !== f.page
        ? d
        : {
            ...d,
            sections: d.sections.map((s) =>
              s.index !== f.index
                ? s
                : { ...s, statements: sp.spine.nodes, statementLinks: sp.spine.links },
            ),
          },
    );
  };

  const go = (t: string) => {
    const slug = t.trim().toLowerCase().replace(/\s+/g, '_');
    if (slug) window.location.hash = `spine/${slug}`;
  };

  const prettyTractate = () => tractate().replace(/_/g, ' ');

  return (
    <main class="page-shell" style={{ '--page-max': '1040px' }}>
      <header style={{ 'margin-bottom': '1.1rem' }}>
        <a
          href="#daf"
          style={{ color: 'var(--muted)', 'text-decoration': 'none', 'font-size': '0.85rem' }}
        >
          &larr; back to daf
        </a>
        <h1
          style={{
            margin: '0.4rem 0 0',
            'font-size': '1.5rem',
            'letter-spacing': '-0.02em',
            color: 'var(--fg)',
            'text-transform': 'capitalize',
          }}
        >
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(input());
          }}
          placeholder="tractate (e.g. bava_metzia)"
          style={{ width: '220px' }}
        />
        <button
          type="button"
          class="tb-primary"
          style={{ 'border-radius': 'var(--tb-radius)' }}
          onClick={() => go(input())}
        >
          Go
        </button>
        <For each={PRESETS}>
          {(p) => (
            <button
              type="button"
              onClick={() => go(p)}
              style={{
                'font-family': 'inherit',
                'font-size': '0.78rem',
                padding: '0.2rem 0.6rem',
                cursor: 'pointer',
                'border-radius': '999px',
                border: p === tractate() ? '1px solid var(--accent)' : '1px solid var(--line)',
                background: p === tractate() ? 'var(--accent)' : '#fff',
                color: p === tractate() ? '#fff' : 'var(--muted)',
              }}
            >
              {p}
            </button>
          )}
        </For>
      </div>

      <Show when={report.loading}>
        <p style={{ 'font-size': '0.88rem', color: 'var(--muted)', 'font-style': 'italic' }}>
          probing cache&hellip;
        </p>
      </Show>
      <Show when={report.error}>
        <p style={{ 'font-size': '0.88rem', color: '#b3261e' }}>
          error: {String(report.error?.message || report.error)}
        </p>
      </Show>

      <Show when={report()}>
        {(r) => (
          <>
            {/* summary */}
            <div
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '0.7rem',
                'margin-bottom': '1.1rem',
                'font-size': '0.88rem',
                'flex-wrap': 'wrap',
              }}
            >
              <span style={{ 'font-weight': 700, color: 'var(--fg)' }}>{r().summary.pct}%</span>
              <span
                style={{
                  display: 'inline-block',
                  width: '160px',
                  height: '8px',
                  background: 'var(--line)',
                  'border-radius': '999px',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: `${r().summary.pct}%`,
                    height: '100%',
                    background: 'var(--accent)',
                  }}
                />
              </span>
              <span style={{ color: 'var(--muted)' }}>
                {r().summary.computed} / {r().summary.total} pieces &middot; {r().rows.length} dapim
                &times; {r().columns.length} producers &middot; to {r().endAmud}
              </span>
            </div>

            {/* stitched flow view — real per-daf flow graphs down the tractate,
                connected by the cross-daf edges */}
            <div style={PANEL}>
              <div
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'space-between',
                  gap: '10px',
                }}
              >
                <span style={PANEL_H}>
                  Stitched flow &mdash; the argument map down the tractate
                </span>
                <button
                  type="button"
                  class="tb-select"
                  disabled={flowView.loading}
                  onClick={() => refetchFlow()}
                >
                  {flowView.loading ? 'loading…' : flowView() ? 'reload' : 'load'}
                </button>
              </div>
              <Show when={flowView.error}>
                <p style={{ 'font-size': '0.85rem', color: '#b3261e', margin: '6px 0 0' }}>
                  error: {String(flowView.error?.message || flowView.error)}
                </p>
              </Show>
              <Show when={flowView()}>
                {(v) => {
                  // Render dapim with flow OR the daf a cross-edge points INTO, so
                  // both ends of every drawn cross-daf arrow are present.
                  const shown = createMemo(() => {
                    const keep = new Set<string>();
                    for (const d of v().dapim) {
                      if (d.flow.length || d.cross.length) {
                        keep.add(d.page);
                        if (d.cross.length && d.nextPage) keep.add(d.nextPage);
                      }
                    }
                    return v().dapim.filter((d) => keep.has(d.page));
                  });
                  const capped = createMemo(() => shown().slice(0, FLOW_VIEW_CAP));
                  const allKinds = createMemo(() =>
                    connectionKinds(
                      capped().flatMap((d) => d.flow) as Parameters<typeof connectionKinds>[0],
                    ),
                  );
                  const crossCount = createMemo(() =>
                    capped().reduce((n, d) => n + d.cross.length, 0),
                  );
                  // Cross-daf warming progress across the whole tractate: a
                  // boundary = a daf with a next daf; connected = its cross-daf
                  // link has been computed (warmer/sweep reached it).
                  const connectivity = createMemo(() => {
                    let total = 0;
                    let done = 0;
                    for (const d of v().dapim) {
                      if (!d.nextPage) continue;
                      total++;
                      if (d.crossComputed) done++;
                    }
                    return { total, done };
                  });
                  const segChip = (active: boolean): JSX.CSSProperties => ({
                    font: 'inherit',
                    'font-size': '0.78rem',
                    padding: '0.15rem 0.6rem',
                    cursor: 'pointer',
                    'border-radius': '999px',
                    border: active ? '1px solid var(--accent)' : '1px solid var(--line)',
                    background: active ? 'var(--accent)' : '#fff',
                    color: active ? '#fff' : 'var(--muted)',
                  });
                  return (
                    <div style={{ 'margin-top': '0.7rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          'align-items': 'center',
                          gap: '0.4rem',
                          'margin-bottom': '0.4rem',
                        }}
                      >
                        <button
                          type="button"
                          style={segChip(flowMode() === 'detail')}
                          onClick={() => setFlowMode('detail')}
                        >
                          detail
                        </button>
                        <button
                          type="button"
                          style={segChip(flowMode() === 'overview')}
                          onClick={() => setFlowMode('overview')}
                        >
                          overview (whole tractate)
                        </button>
                      </div>
                      <div
                        style={{
                          'font-size': '0.8rem',
                          color: 'var(--muted)',
                          'margin-bottom': '0.3rem',
                        }}
                      >
                        <Show
                          when={flowMode() === 'detail'}
                          fallback={`whole tractate — ${v().dapim.length} dapim, one node each; tinted = has cross-daf links. Click a daf for detail.`}
                        >
                          showing {capped().length} of {shown().length} dapim{' '}
                          {shown().length > FLOW_VIEW_CAP ? '(capped)' : ''} &middot; {crossCount()}{' '}
                          cross-daf arrows (thicker lines span the page break) &middot;{' '}
                          {connectivity().done}/{connectivity().total} boundaries connected
                          {connectivity().done < connectivity().total
                            ? ' (dashed = not computed yet)'
                            : ''}{' '}
                          &middot; click a rabbi to trace
                        </Show>
                      </div>
                      <FlowLegend kinds={allKinds()} />
                      <Show when={trace()}>
                        {(slug) => {
                          let display = slug();
                          let boxes = 0;
                          for (const d of capped())
                            for (const s of d.sections) {
                              const hit = s.rabbis.find((rb) => rb.slug === slug());
                              if (hit) {
                                boxes++;
                                display = hit.name;
                              }
                            }
                          return (
                            <div
                              style={{
                                margin: '0.5rem 0',
                                padding: '0.3rem 0.6rem',
                                border: `1px solid ${HILITE}`,
                                'border-radius': '6px',
                                background: '#fffaf0',
                                'font-size': '0.85rem',
                                display: 'inline-block',
                              }}
                            >
                              tracing{' '}
                              <span style={{ 'font-weight': 700, color: HILITE }}>{display}</span>{' '}
                              &middot; {boxes} {boxes === 1 ? 'box' : 'boxes'}{' '}
                              <button
                                type="button"
                                class="tb-select"
                                style={{
                                  'margin-left': '0.5rem',
                                  height: 'auto',
                                  padding: '0.1rem 0.5rem',
                                  'font-size': '0.78rem',
                                }}
                                onClick={() => setTrace(null)}
                              >
                                clear
                              </button>
                            </div>
                          );
                        }}
                      </Show>
                      <SpineFlowGraph
                        dapim={withStatements(
                          (flowMode() === 'overview' ? v().dapim : capped()) as SpineViewDaf[],
                        )}
                        mode={flowMode()}
                        highlight={trace()}
                        onRabbi={(slug) => setTrace((prev) => (prev === slug ? null : slug))}
                        onPickDaf={() => setFlowMode('detail')}
                        activeKey={activeKey()}
                        onSelectSection={(page, index) =>
                          setFocusedSec((prev) =>
                            prev?.page === page && prev?.index === index ? null : { page, index },
                          )
                        }
                        selectedStatementId={selectedStmt()}
                        onSelectStatement={setSelectedStmt}
                      />
                      {/* The selected statement's detail (per-move synthesis + Q&A) —
                          the SAME card the reader uses. keyed so it re-mounts per pick. */}
                      <Show keyed when={selectedMove()}>
                        {(m) => (
                          <div style={{ 'margin-top': '0.6rem', 'max-width': '640px' }}>
                            <ArgumentMoveCard
                              move={m}
                              tractate={tractate()}
                              page={focusedSec()?.page ?? ''}
                              highlightedMoveId={null}
                              onHighlightMove={() => {}}
                            />
                          </div>
                        )}
                      </Show>
                    </div>
                  );
                }}
              </Show>
            </div>

            {/* coverage punchcard */}
            <div style={PANEL}>
              <span style={PANEL_H}>Coverage &mdash; pieces per daf</span>
              {/* legend */}
              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  'flex-wrap': 'wrap',
                  margin: '0.6rem 0',
                  'font-size': '0.78rem',
                  color: 'var(--muted)',
                  'align-items': 'center',
                }}
              >
                <For
                  each={[
                    ['source', 'source text'],
                    ['mark', 'mark'],
                    ['enrichment', 'enrichment'],
                  ]}
                >
                  {([k, lbl]) => (
                    <span
                      style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.35rem' }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: '11px',
                          height: '11px',
                          'border-radius': '3px',
                          background: COV_COLOR[k],
                        }}
                      />{' '}
                      {lbl}
                    </span>
                  )}
                </For>
                <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.35rem' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '11px',
                      height: '11px',
                      'border-radius': '3px',
                      border: '1px solid var(--line)',
                    }}
                  />{' '}
                  not computed
                </span>
              </div>

              {/* column header */}
              <div
                style={{
                  display: 'flex',
                  'font-size': '0.72rem',
                  color: 'var(--muted)',
                  'margin-bottom': '0.3rem',
                  'border-bottom': '1px solid var(--line)',
                  'padding-bottom': '0.3rem',
                }}
              >
                <span style={{ width: '44px', 'flex-shrink': 0 }} />
                <For each={r().columns}>
                  {(col) => (
                    <span
                      title={`${col.label} (${col.kind} ${col.version})`}
                      style={{
                        width: '34px',
                        'flex-shrink': 0,
                        'text-align': 'center',
                        color: COV_COLOR[col.kind],
                      }}
                    >
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
                    const filledCount = createMemo(
                      () => r().columns.filter((c) => row.cells[c.id]).length,
                    );
                    const toggleRow = () => setExpanded(isOpen() ? null : row.page);
                    return (
                      <>
                        {/* biome-ignore lint/a11y/useSemanticElements: a native <button> would inject UA layout/typography into this tightly inline-styled grid row; role+tabIndex+keydown give the same semantics */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={toggleRow}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleRow();
                            }
                          }}
                          style={{
                            display: 'flex',
                            'align-items': 'center',
                            cursor: 'pointer',
                            'border-radius': '4px',
                            'font-size': '0.8rem',
                            padding: '0.1rem 0',
                            background: isOpen() ? '#f2eee4' : 'transparent',
                          }}
                        >
                          <span
                            style={{
                              width: '44px',
                              'flex-shrink': 0,
                              'font-family': MONO,
                              'font-size': '0.78rem',
                              color: filledCount() ? 'var(--fg)' : 'var(--muted)',
                              'font-weight': isOpen() ? 700 : 400,
                              'padding-left': '0.2rem',
                            }}
                          >
                            {row.page}
                          </span>
                          <For each={r().columns}>
                            {(col) => (
                              <span
                                style={{
                                  width: '34px',
                                  'flex-shrink': 0,
                                  display: 'flex',
                                  'justify-content': 'center',
                                }}
                                title={`${row.page} · ${col.label}: ${row.cells[col.id] ? 'computed' : 'not computed'}`}
                              >
                                <span
                                  style={{
                                    width: '11px',
                                    height: '11px',
                                    'border-radius': '3px',
                                    background: row.cells[col.id]
                                      ? COV_COLOR[col.kind]
                                      : 'transparent',
                                    border: row.cells[col.id] ? 'none' : '1px solid var(--line)',
                                  }}
                                />
                              </span>
                            )}
                          </For>
                        </div>
                        <Show when={isOpen()}>
                          <div
                            style={{
                              margin: '0.2rem 0 0.5rem 44px',
                              padding: '0.5rem 0.7rem',
                              border: '1px solid #eae8e0',
                              'border-radius': '6px',
                              background: '#fafaf7',
                              'font-size': '0.83rem',
                            }}
                          >
                            <div
                              style={{
                                'font-weight': 700,
                                'margin-bottom': '0.3rem',
                                'text-transform': 'capitalize',
                              }}
                            >
                              {prettyTractate()} {row.page}
                            </div>
                            <For each={r().columns}>
                              {(col) => (
                                <div
                                  style={{
                                    display: 'flex',
                                    'justify-content': 'space-between',
                                    padding: '1px 0',
                                  }}
                                >
                                  <span style={{ color: COV_COLOR[col.kind] }}>
                                    {col.label}{' '}
                                    <span style={{ color: 'var(--muted)', 'font-size': '0.7rem' }}>
                                      {col.kind}
                                    </span>
                                  </span>
                                  <span
                                    style={{
                                      color: row.cells[col.id] ? '#15803d' : 'var(--muted)',
                                    }}
                                  >
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
