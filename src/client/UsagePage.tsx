import { createResource, For, Show, type JSX } from 'solid-js';

interface PerEndpoint {
  count: number;
  cacheHits: number;
  cacheHitRate: number;
  p50Ms: number;
  p95Ms: number;
  errorCount: number;
  errorsByKind: Record<string, number>;
}

interface RecentError {
  ts: number;
  endpoint: string;
  tractate?: string;
  page?: string;
  error_kind?: string;
  model?: string;
  mark_id?: string;
  enrichment_id?: string;
}

interface BugReport {
  ts: number;
  tractate: string;
  page: string;
  description: string;
  ua: string | null;
  country: string | null;
}

interface UsagePayload {
  telemetry: {
    perEndpoint: Record<string, PerEndpoint>;
    perMark: Record<string, PerEndpoint>;
    perEnrichment: Record<string, PerEndpoint>;
    recentErrors: RecentError[];
    totalCount: number;
  };
  reports: BugReport[];
}

interface CacheBucket {
  count: number;
  percent: number;
}

interface MarkRow {
  id: string;
  label: string;
  source: 'code' | 'kv';
  cache_version: string;
  count: number;
  percent: number;
}

interface EnrichmentRow {
  id: string;
  label: string;
  target_mark: string;
  scope: 'global' | 'local';
  source: 'code' | 'kv';
  cache_version: string;
  count: number;
}

interface CacheStats {
  generatedAt: string;
  total: number;
  source: {
    hebrewbooks: CacheBucket;
    gemara: CacheBucket;
    commentaries: CacheBucket;
  };
  marks: MarkRow[];
  enrichments: EnrichmentRow[];
  rabbis: {
    totalRabbis: number;
    withBio: number;
    withSefariaBio: number | null;
    withWiki: number;
    withGeneration: number;
    withRegion: number;
    withPlaces: number;
    withHierarchyEdges: number;
    withFamily: number;
    withOrientation: number;
    unknownRabbis: number | null;
  };
  hierarchy: {
    totalNodes: number;
    processedNodes: number;
    nodesWithEdges: number;
    totalEdges: number;
    generatedAt: string | null;
  };
}

async function fetchUsage(): Promise<UsagePayload> {
  const res = await fetch('/api/usage');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchCacheStats(): Promise<CacheStats> {
  const res = await fetch('/api/admin/cache-stats');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

interface CacheRowProps {
  label: string;
  count: number;
  total: number;
  percent: number;
  extra?: string;
}

function CacheRow(props: CacheRowProps): JSX.Element {
  const complete = () => props.percent >= 100;
  return (
    <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
      <td style={{ padding: '0.4rem 0.5rem' }}>
        {props.label}
        <Show when={props.extra}>
          <span style={{ color: '#888', 'font-size': '0.75rem', 'margin-left': '0.4rem' }}>
            ({props.extra})
          </span>
        </Show>
      </td>
      <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>
        {fmtInt(props.count)} / {fmtInt(props.total)}
      </td>
      <td style={{ padding: '0.4rem 0.5rem', width: '40%' }}>
        <div
          style={{
            height: '8px',
            background: '#f0f0f0',
            'border-radius': '3px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(100, props.percent)}%`,
              height: '100%',
              background: complete() ? '#2a8a42' : '#4b7bec',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </td>
      <td
        style={{
          padding: '0.4rem 0.5rem',
          'text-align': 'right',
          'font-variant-numeric': 'tabular-nums',
          color: complete() ? '#2a8a42' : '#333',
          'white-space': 'nowrap',
        }}
      >
        {props.percent.toFixed(1)}%
        <Show when={complete()}>
          <span style={{ 'margin-left': '0.3rem' }}>✓</span>
        </Show>
      </td>
    </tr>
  );
}

interface SectionHeadingProps {
  title: string;
  hint?: string;
}
function SectionHeading(props: SectionHeadingProps): JSX.Element {
  return (
    <h2 style={{ 'font-size': '0.95rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', color: '#999', 'margin-bottom': '0.5rem' }}>
      {props.title}
      <Show when={props.hint}>
        <span style={{ 'font-size': '0.75rem', color: '#888', 'margin-left': '0.5rem', 'text-transform': 'none', 'letter-spacing': 'normal' }}>
          {props.hint}
        </span>
      </Show>
    </h2>
  );
}

function CacheStatusSection(props: { stats: CacheStats }): JSX.Element {
  const s = () => props.stats.source;
  const r = () => props.stats.rabbis;
  const total = () => props.stats.total;
  return (
    <section style={{ 'margin-bottom': '1.6rem' }}>
      <SectionHeading title="Source caches" hint={`per-daf — denominator ${fmtInt(total())} dafim`} />
      <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '0.85rem' }}>
        <thead>
          <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
            <th style={{ padding: '0.4rem 0.5rem' }}>Cache</th>
            <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>Cached</th>
            <th style={{ padding: '0.4rem 0.5rem' }} />
            <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>%</th>
          </tr>
        </thead>
        <tbody>
          <CacheRow label="HebrewBooks (hb:v1)" count={s().hebrewbooks.count} total={total()} percent={s().hebrewbooks.percent} />
          <CacheRow label="Sefaria gemara slice (ctx:gemara:v1)" count={s().gemara.count} total={total()} percent={s().gemara.percent} />
          <CacheRow label="Sefaria commentaries (ctx:commentaries:v1)" count={s().commentaries.count} total={total()} percent={s().commentaries.percent} />
        </tbody>
      </table>

      <div style={{ 'margin-top': '1.2rem' }}>
        <SectionHeading title="Marks" hint="per-daf — one cache entry per (mark, daf)" />
        <Show when={props.stats.marks.length > 0} fallback={<p style={{ color: '#888' }}>No marks registered.</p>}>
          <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '0.85rem' }}>
            <thead>
              <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
                <th style={{ padding: '0.4rem 0.5rem' }}>Mark</th>
                <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>Cached</th>
                <th style={{ padding: '0.4rem 0.5rem' }} />
                <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>%</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.stats.marks}>
                {(m) => (
                  <CacheRow
                    label={`${m.label} (${m.id})`}
                    extra={`v${m.cache_version} · ${m.source}`}
                    count={m.count}
                    total={total()}
                    percent={m.percent}
                  />
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>

      <div style={{ 'margin-top': '1.2rem' }}>
        <SectionHeading title="Enrichments" hint="per-instance — denominator depends on mark instance count, so % is omitted" />
        <Show when={props.stats.enrichments.length > 0} fallback={<p style={{ color: '#888' }}>No enrichments registered.</p>}>
          <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '0.85rem' }}>
            <thead>
              <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
                <th style={{ padding: '0.4rem 0.5rem' }}>Enrichment</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Mark</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Scope</th>
                <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>Cached</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.stats.enrichments}>
                {(e) => (
                  <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                    <td style={{ padding: '0.4rem 0.5rem' }}>
                      {e.label}
                      <span style={{ color: '#888', 'font-size': '0.75rem', 'margin-left': '0.4rem' }}>
                        ({e.id} · v{e.cache_version} · {e.source})
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', 'font-family': 'monospace', color: '#555' }}>{e.target_mark}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>
                      <span style={{
                        'font-size': '0.7rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em',
                        padding: '0.1rem 0.4rem', 'border-radius': '3px',
                        background: e.scope === 'global' ? '#dbeafe' : '#fef3c7',
                        color: e.scope === 'global' ? '#1e40af' : '#92400e',
                      }}>
                        {e.scope}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>
                      {fmtInt(e.count)}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>

      <div style={{ 'margin-top': '1.2rem', 'font-size': '0.85rem', color: '#333' }}>
        <SectionHeading title="Rabbi dataset coverage" hint={`bundled JSON — ${fmtInt(r().totalRabbis)} total`} />
        <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '0.85rem' }}>
          <tbody>
            <RabbiCoverageRow label="Bio (any source)" filled={r().withBio} total={r().totalRabbis} />
            <RabbiCoverageRow
              label="Sefaria bio"
              filled={r().withSefariaBio}
              total={r().totalRabbis}
              hint="bio sourced from Sefaria's PersonTopic API"
            />
            <RabbiCoverageRow
              label="Hebrew Wikipedia"
              filled={r().withWiki}
              total={r().totalRabbis}
              hint="has a Hebrew Wikipedia page linked"
            />
            <RabbiCoverageRow label="Generation identified" filled={r().withGeneration} total={r().totalRabbis} />
            <RabbiCoverageRow label="Region (E.Y. / Bavel)" filled={r().withRegion} total={r().totalRabbis} />
            <RabbiCoverageRow label="Places (cities)" filled={r().withPlaces} total={r().totalRabbis} />
            <RabbiCoverageRow
              label="Chain of tradition"
              filled={r().withHierarchyEdges}
              total={r().totalRabbis}
              hint="at least one teacher / student / contemporary"
            />
            <RabbiCoverageRow
              label="Familial relations"
              filled={r().withFamily}
              total={r().totalRabbis}
              hint="father / mother / spouse / child / sibling / in-law"
            />
            <RabbiCoverageRow
              label="Orientation"
              filled={r().withOrientation}
              total={r().totalRabbis}
              hint="mystical / practical / mixed"
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface RabbiCoverageRowProps {
  label: string;
  filled: number | null;           // null = coverage isn't tracked yet
  total: number;
  hint?: string;
}

function RabbiCoverageRow(props: RabbiCoverageRowProps): JSX.Element {
  const tracked = () => props.filled !== null;
  const filled = () => props.filled ?? 0;
  const missing = () => Math.max(0, props.total - filled());
  const percent = () => props.total > 0 ? (filled() / props.total) * 100 : 0;
  const complete = () => tracked() && percent() >= 100;
  return (
    <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
      <td style={{ padding: '0.35rem 0.5rem' }}>
        {props.label}
        <Show when={props.hint}>
          <span style={{ color: '#999', 'font-size': '0.72rem', 'margin-left': '0.4rem' }}>
            ({props.hint})
          </span>
        </Show>
      </td>
      <td style={{ padding: '0.35rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>
        <Show when={tracked()} fallback={<span style={{ color: '#999' }}>—</span>}>
          <span style={{ color: '#333' }}>{fmtInt(filled())}</span>
          <span style={{ color: '#999' }}> / {fmtInt(props.total)}</span>
        </Show>
      </td>
      <td style={{ padding: '0.35rem 0.5rem', width: '32%' }}>
        <Show when={tracked()}>
          <div style={{ height: '6px', background: '#f0f0f0', 'border-radius': '3px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, percent())}%`,
                height: '100%',
                background: complete() ? '#2a8a42' : '#4b7bec',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </Show>
      </td>
      <td style={{ padding: '0.35rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', color: complete() ? '#2a8a42' : '#333', 'white-space': 'nowrap' }}>
        <Show when={tracked()} fallback={<span style={{ color: '#999', 'font-size': '0.78rem' }}>not tracked</span>}>
          {percent().toFixed(1)}%
        </Show>
      </td>
      <td style={{ padding: '0.35rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', color: missing() === 0 ? '#999' : '#c33', 'font-size': '0.78rem', 'white-space': 'nowrap' }}>
        <Show when={tracked()} fallback={<span>—</span>}>
          {missing() === 0 ? '—' : `${fmtInt(missing())} missing`}
        </Show>
      </td>
    </tr>
  );
}

function LatencyTable(props: { title: string; hint?: string; rows: Array<[string, PerEndpoint]> }): JSX.Element {
  return (
    <section style={{ 'margin-bottom': '1.6rem' }}>
      <SectionHeading title={props.title} hint={props.hint} />
      <Show when={props.rows.length > 0} fallback={<p style={{ color: '#888' }}>No data yet.</p>}>
        <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '0.85rem' }}>
          <thead>
            <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
              <th style={{ padding: '0.4rem 0.5rem' }}>Name</th>
              <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>Calls</th>
              <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>Cache hit%</th>
              <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>p50</th>
              <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>p95</th>
              <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>Errors</th>
              <th style={{ padding: '0.4rem 0.5rem' }}>Kinds</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {([name, row]) => (
                <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                  <td style={{ padding: '0.4rem 0.5rem', 'font-family': 'monospace' }}>{name}</td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>{row.count}</td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>
                    {row.count ? `${Math.round(row.cacheHitRate * 100)}%` : '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>{row.count ? fmtMs(row.p50Ms) : '—'}</td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>{row.count ? fmtMs(row.p95Ms) : '—'}</td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', color: row.errorCount ? '#c33' : '#888' }}>
                    {row.errorCount}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', 'font-size': '0.75rem', color: '#888' }}>
                    {Object.entries(row.errorsByKind).map(([k, n]) => `${k}:${n}`).join(', ')}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  );
}

export function UsagePage(): JSX.Element {
  const [data, { refetch }] = createResource(fetchUsage);
  const [cacheStats, { refetch: refetchCache }] = createResource(fetchCacheStats);
  // Auto-refresh every 30s.
  const interval = setInterval(() => { void refetch(); void refetchCache(); }, 30000);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => clearInterval(interval));

  return (
    <main
      class="page-shell"
      style={{
        '--page-max': '960px',
        'font-family': 'system-ui, -apple-system, sans-serif',
        color: '#222',
      }}
    >
      <header class="responsive-row" style={{ 'margin-bottom': '1.2rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.4rem' }}>Usage</h1>
        <a href="#daf" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>← back to daf</a>
        <button
          onClick={() => { void refetch(); void refetchCache(); }}
          style={{
            'margin-left': 'auto',
            padding: '0.3rem 0.7rem',
            border: '1px solid #ddd',
            'border-radius': '4px',
            background: '#fff',
            cursor: 'pointer',
            'font-size': '0.8rem',
          }}
        >
          Refresh
        </button>
      </header>

      <Show when={cacheStats()}>
        {(cs) => <CacheStatusSection stats={cs()} />}
      </Show>

      <Show when={data.error}>
        <p style={{ color: '#c33' }}>Failed to load: {String(data.error)}</p>
      </Show>

      <Show when={data()}>
        {(d) => (
          <>
            <LatencyTable
              title={`Latency by endpoint (${d().telemetry.totalCount} recent calls)`}
              rows={Object.entries(d().telemetry.perEndpoint).sort(([a], [b]) => a.localeCompare(b))}
            />

            <LatencyTable
              title="Studio runs by mark"
              hint="rolled up across /api/studio/run with mark_id"
              rows={Object.entries(d().telemetry.perMark).sort(([a], [b]) => a.localeCompare(b))}
            />

            <LatencyTable
              title="Studio runs by enrichment"
              hint="rolled up across /api/studio/run with enrichment_id"
              rows={Object.entries(d().telemetry.perEnrichment).sort(([a], [b]) => a.localeCompare(b))}
            />

            <section style={{ 'margin-bottom': '1.6rem' }}>
              <SectionHeading title="Recent errors" />
              <Show when={d().telemetry.recentErrors.length > 0} fallback={<p style={{ color: '#888' }}>None.</p>}>
                <ul style={{ 'list-style': 'none', padding: 0, margin: 0, 'font-size': '0.8rem' }}>
                  <For each={d().telemetry.recentErrors}>
                    {(e) => (
                      <li style={{ padding: '0.3rem 0', 'border-bottom': '1px solid #f4f4f4', display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap' }}>
                        <span style={{ color: '#999', 'white-space': 'nowrap' }}>{fmtTime(e.ts)}</span>
                        <span style={{ 'font-family': 'monospace' }}>{e.endpoint}</span>
                        <Show when={e.mark_id}>
                          <span style={{ 'font-family': 'monospace', color: '#555' }}>mark={e.mark_id}</span>
                        </Show>
                        <Show when={e.enrichment_id}>
                          <span style={{ 'font-family': 'monospace', color: '#555' }}>enrich={e.enrichment_id}</span>
                        </Show>
                        <Show when={e.tractate || e.page}>
                          <span style={{ color: '#666' }}>{e.tractate} {e.page}</span>
                        </Show>
                        <span style={{ color: '#c33' }}>{e.error_kind ?? 'other'}</span>
                        <Show when={e.model}>
                          <span style={{ color: '#888', 'font-size': '0.75rem' }}>({e.model})</span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>

            <section>
              <SectionHeading title={`Bug reports (${d().reports.length})`} />
              <Show when={d().reports.length > 0} fallback={<p style={{ color: '#888' }}>Inbox empty.</p>}>
                <ul style={{ 'list-style': 'none', padding: 0, margin: 0 }}>
                  <For each={d().reports}>
                    {(r) => (
                      <li style={{ padding: '0.7rem 0.8rem', margin: '0 0 0.5rem', 'background': '#fcfcfa', border: '1px solid #eee', 'border-radius': '4px' }}>
                        <div style={{ 'font-size': '0.75rem', color: '#888', 'margin-bottom': '0.3rem' }}>
                          {fmtTime(r.ts)} · <b>{r.tractate} {r.page}</b>
                          <Show when={r.country}><span> · {r.country}</span></Show>
                        </div>
                        <div style={{ 'white-space': 'pre-wrap', 'font-size': '0.88rem', color: '#222', 'line-height': 1.45 }}>
                          {r.description}
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>
          </>
        )}
      </Show>
    </main>
  );
}
