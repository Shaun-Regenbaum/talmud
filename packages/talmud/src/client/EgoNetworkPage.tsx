/**
 * #network/<slug> — one sage's LEARNED circle: who they demonstrably argue
 * with, cite, answer, and support across every analyzed daf, from the
 * Shas-wide voice graph (GET /api/rabbi-network/:slug). One row per
 * neighboring sage (strongest tie first), with per-relation chips and the
 * daf citations as receipts; click a neighbor to re-center on them.
 *
 * Same visual language as the #voices graph: generation-striped node boxes,
 * the flow palette for relation kinds. Rows instead of lanes because every
 * edge here shares the center endpoint — a column of neighbors IS the graph.
 */
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
} from 'solid-js';
import { KIND_COLOR, stmtRelKind } from './ArgumentFlowGraph';
import { type EgoRow, type EgoWire, groupEgoEdges, splitDafLabel } from './egoNetwork';
import {
  colorForGeneration,
  GENERATION_BY_ID,
  type GenerationInfo,
  generationLabelHe,
} from './generations';
import { lang, t } from './i18n';
import { type IndexRow, searchSages } from './sageSearch';

const SUPPORTS_COLOR = '#0891b2';
function relColor(kind: string): string {
  return kind === 'supports' ? SUPPORTS_COLOR : KIND_COLOR[stmtRelKind(kind)];
}

function slugFromHash(): string | null {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw.startsWith('network/')) return null;
  const slug = raw.slice('network/'.length).trim();
  return slug || null;
}

function genLabel(generation: string | null): string {
  if (!generation) return '';
  const info = (GENERATION_BY_ID as Record<string, GenerationInfo | undefined>)[generation];
  if (!info) return generation;
  return lang() === 'he' ? generationLabelHe(info) : info.label;
}

function dafHref(label: string): string | null {
  const d = splitDafLabel(label);
  if (!d) return null;
  return `?tractate=${encodeURIComponent(d.tractate)}&page=${encodeURIComponent(d.page)}#daf`;
}

interface NetworkSummary {
  dapim?: number;
  nodes?: number;
  edges?: number;
  newlyConnected?: number;
}

export function EgoNetworkPage(): JSX.Element {
  const [slug, setSlug] = createSignal<string | null>(slugFromHash());
  const sync = () => setSlug(slugFromHash());
  window.addEventListener('hashchange', sync);
  window.addEventListener('popstate', sync);
  onCleanup(() => {
    window.removeEventListener('hashchange', sync);
    window.removeEventListener('popstate', sync);
  });

  const [index] = createResource(async () => {
    const r = await fetch('/api/sages-index');
    if (!r.ok) return [] as IndexRow[];
    return ((await r.json()) as { rows: IndexRow[] }).rows;
  });

  const [summary] = createResource(async () => {
    const r = await fetch('/api/rabbi-network');
    if (!r.ok) return null;
    return (await r.json()) as NetworkSummary;
  });

  const [ego] = createResource(
    () => slug(),
    async (s) => {
      const r = await fetch(`/api/rabbi-network/${encodeURIComponent(s)}`);
      if (r.status === 404) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        return { miss: body.error?.includes('not compiled') ? 'building' : 'absent' } as const;
      }
      if (!r.ok) return { miss: 'error' } as const;
      return { wire: (await r.json()) as EgoWire } as const;
    },
  );

  const rows = createMemo<EgoRow[]>(() => {
    const e = ego();
    return e && 'wire' in e && e.wire ? groupEgoEdges(e.wire.edges) : [];
  });

  const [query, setQuery] = createSignal('');
  const hits = createMemo(() => searchSages(index() ?? [], query(), 8));
  const go = (s: string) => {
    setQuery('');
    window.location.hash = `network/${s}`;
  };

  const [openRow, setOpenRow] = createSignal<string | null>(null);
  createEffect(() => {
    slug(); // re-centering collapses any expanded neighbor row
    setOpenRow(null);
  });

  return (
    <main class="page-shell" style={{ '--page-max': '880px', color: '#222' }}>
      <header style={{ 'margin-bottom': '1rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.45rem' }}>{t('network.page.title')}</h1>
        <p
          style={{ margin: '0.3rem 0 0', color: '#666', 'font-size': '0.9rem', 'line-height': 1.5 }}
        >
          {t('network.page.blurb')}
          <Show when={summary()?.dapim}>
            {' '}
            {t('network.page.coverage', {
              dapim: summary()?.dapim ?? 0,
              edges: summary()?.edges ?? 0,
            })}
          </Show>
        </p>
      </header>

      {/* search */}
      <div style={{ position: 'relative', 'margin-bottom': '1.2rem', 'max-width': '420px' }}>
        <input
          type="search"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('network.page.search')}
          style={{
            width: '100%',
            padding: '0.5rem 0.7rem',
            border: '1px solid #d8d2c4',
            'border-radius': '8px',
            'font-size': '0.95rem',
          }}
        />
        <Show when={hits().length > 0}>
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              'z-index': 10,
              background: '#fff',
              border: '1px solid #d8d2c4',
              'border-radius': '8px',
              'box-shadow': '0 4px 14px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            <For each={hits()}>
              {(r) => (
                <button
                  type="button"
                  onClick={() => go(r.slug)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    gap: '0.5rem',
                    'align-items': 'baseline',
                    padding: '0.45rem 0.7rem',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    'text-align': 'start',
                    'font-size': '0.9rem',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      'border-radius': '50%',
                      background: colorForGeneration(r.generation),
                      'flex-shrink': 0,
                      'align-self': 'center',
                    }}
                  />
                  <span>{lang() === 'he' ? (r.canonicalHe ?? r.canonical) : r.canonical}</span>
                  <span style={{ color: '#999', 'font-size': '0.8rem' }}>
                    {genLabel(r.generation)}
                  </span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show when={slug()} fallback={<p style={{ color: '#666' }}>{t('network.page.pickOne')}</p>}>
        <Show when={ego()} keyed>
          {(e) => (
            <Show
              when={'wire' in e ? e.wire : null}
              keyed
              fallback={
                <p style={{ color: '#8a6d3b' }}>
                  {'miss' in e && e.miss === 'building'
                    ? t('network.page.building')
                    : t('network.page.notInGraph')}
                </p>
              }
            >
              {(wire) => (
                <section>
                  {/* center sage header */}
                  <div
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '0.7rem',
                      padding: '0.7rem 0.9rem',
                      border: '1px solid #d8d2c4',
                      'border-inline-start': `6px solid ${colorForGeneration(wire.node.generation)}`,
                      'border-radius': '10px',
                      background: '#fffdf8',
                      'margin-bottom': '0.9rem',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ 'font-weight': 600, 'font-size': '1.1rem' }}>
                        {wire.node.name}
                      </div>
                      <div style={{ color: '#777', 'font-size': '0.82rem' }}>
                        {genLabel(wire.node.generation)}
                        {' · '}
                        {t('network.page.meta', {
                          sections: wire.node.sections,
                          partners: rows().length,
                        })}
                        <Show when={(wire.node.curatedEdges ?? 0) === 0 && rows().length > 0}>
                          {' · '}
                          <span style={{ color: '#0a7a4b', 'font-weight': 600 }}>
                            {t('network.page.newlyConnected')}
                          </span>
                        </Show>
                      </div>
                    </div>
                    <a
                      href={`#sages/${wire.id}`}
                      style={{
                        'font-size': '0.82rem',
                        color: '#8a2a2b',
                        'text-decoration': 'none',
                      }}
                    >
                      {t('network.page.sagePage')} →
                    </a>
                  </div>

                  <Show
                    when={rows().length > 0}
                    fallback={<p style={{ color: '#666' }}>{t('network.page.noEdges')}</p>}
                  >
                    <ol style={{ 'list-style': 'none', margin: 0, padding: 0 }}>
                      <For each={rows()}>
                        {(row) => (
                          <li
                            style={{
                              border: '1px solid #e4ded1',
                              'border-inline-start': `6px solid ${colorForGeneration(row.other.generation)}`,
                              'border-radius': '10px',
                              padding: '0.55rem 0.8rem',
                              'margin-bottom': '0.5rem',
                              background: '#fff',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                'flex-wrap': 'wrap',
                                gap: '0.45rem',
                                'align-items': 'center',
                              }}
                            >
                              <a
                                href={`#network/${row.other.slug}`}
                                style={{
                                  'font-weight': 600,
                                  color: '#222',
                                  'text-decoration': 'none',
                                }}
                              >
                                {row.other.name}
                              </a>
                              <span style={{ color: '#999', 'font-size': '0.78rem' }}>
                                {genLabel(row.other.generation)}
                              </span>
                              <For each={row.chips}>
                                {(c) => (
                                  <span
                                    style={{
                                      border: `1px solid ${relColor(c.kind)}`,
                                      color: relColor(c.kind),
                                      'border-radius': '999px',
                                      padding: '0.05rem 0.5rem',
                                      'font-size': '0.75rem',
                                      'white-space': 'nowrap',
                                    }}
                                    title={t('network.page.chipTitle', {
                                      strict: c.strict,
                                      weight: c.weight,
                                    })}
                                  >
                                    {c.direction === 'out' ? '→ ' : '← '}
                                    {t(`dafvoices.rel.${c.kind}`)}
                                    {c.weight > 1 ? ` ×${c.weight}` : ''}
                                  </span>
                                )}
                              </For>
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenRow((o) => (o === row.other.slug ? null : row.other.slug))
                                }
                                style={{
                                  'margin-inline-start': 'auto',
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#8a6d3b',
                                  cursor: 'pointer',
                                  'font-size': '0.78rem',
                                }}
                              >
                                {openRow() === row.other.slug
                                  ? t('network.page.hideDafs')
                                  : t('network.page.showDafs', { n: row.dafs.length })}
                              </button>
                            </div>
                            <Show when={openRow() === row.other.slug}>
                              <div
                                style={{
                                  display: 'flex',
                                  'flex-wrap': 'wrap',
                                  gap: '0.35rem',
                                  'margin-top': '0.45rem',
                                }}
                              >
                                <For each={row.dafs}>
                                  {(d) => (
                                    <a
                                      href={dafHref(d) ?? '#'}
                                      style={{
                                        border: '1px solid #d8d2c4',
                                        'border-radius': '6px',
                                        padding: '0.05rem 0.45rem',
                                        'font-size': '0.75rem',
                                        color: '#555',
                                        'text-decoration': 'none',
                                        background: '#faf8f2',
                                      }}
                                    >
                                      {d}
                                    </a>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </li>
                        )}
                      </For>
                    </ol>
                  </Show>
                </section>
              )}
            </Show>
          )}
        </Show>
      </Show>
    </main>
  );
}
