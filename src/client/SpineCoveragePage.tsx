import { createResource, createSignal, createMemo, For, Show, type JSX } from 'solid-js';

/**
 * Spine coverage — a punchcard of the global spine. Rows are dapim down a
 * tractate; columns are the pieces we can compute. A filled cell = a piece is
 * cached for that (daf, producer); empty = not built yet. The whole tractate
 * reads as a map that fills in as study/warming progresses. Read-only; backed by
 * GET /api/spine/coverage/:tractate (no piece is computed by opening this page).
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
  const r = await fetch(`/api/spine/coverage/${encodeURIComponent(tractate)}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${r.status}`);
  }
  return r.json();
}

export function SpineCoveragePage(): JSX.Element {
  const [tractate, setTractate] = createSignal(routeTractate());
  window.addEventListener('hashchange', () => setTractate(routeTractate()));
  const [report] = createResource(tractate, fetchCoverage);
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [input, setInput] = createSignal('');

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
