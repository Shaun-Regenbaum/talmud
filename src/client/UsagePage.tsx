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
    recentErrors: RecentError[];
    totalCount: number;
  };
  reports: BugReport[];
}

async function fetchUsage(): Promise<UsagePayload> {
  const res = await fetch('/api/usage');
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

export function UsagePage(): JSX.Element {
  const [data, { refetch }] = createResource(fetchUsage);
  // Auto-refresh every 30s.
  const interval = setInterval(() => { void refetch(); }, 30000);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => clearInterval(interval));

  return (
    <main
      style={{
        padding: '1.5rem 2rem',
        'max-width': '960px',
        margin: '0 auto',
        'font-family': 'system-ui, -apple-system, sans-serif',
        color: '#222',
      }}
    >
      <header style={{ display: 'flex', 'align-items': 'center', gap: '1rem', 'margin-bottom': '1.2rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.4rem' }}>Usage</h1>
        <a href="#daf" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>← back to daf</a>
        <button
          onClick={() => void refetch()}
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

      <Show when={data.error}>
        <p style={{ color: '#c33' }}>Failed to load: {String(data.error)}</p>
      </Show>

      <Show when={data()}>
        {(d) => (
          <>
            <section style={{ 'margin-bottom': '1.6rem' }}>
              <h2 style={{ 'font-size': '0.95rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', color: '#999', 'margin-bottom': '0.5rem' }}>
                Latency per endpoint ({d().telemetry.totalCount} recent calls)
              </h2>
              <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '0.85rem' }}>
                <thead>
                  <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
                    <th style={{ padding: '0.4rem 0.5rem' }}>Endpoint</th>
                    <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>Calls</th>
                    <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>Cache hit%</th>
                    <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>p50</th>
                    <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>p95</th>
                    <th style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>Errors</th>
                    <th style={{ padding: '0.4rem 0.5rem' }}>Kinds</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={Object.entries(d().telemetry.perEndpoint)}>
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
            </section>

            <section style={{ 'margin-bottom': '1.6rem' }}>
              <h2 style={{ 'font-size': '0.95rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', color: '#999', 'margin-bottom': '0.5rem' }}>
                Recent errors
              </h2>
              <Show when={d().telemetry.recentErrors.length > 0} fallback={<p style={{ color: '#888' }}>None.</p>}>
                <ul style={{ 'list-style': 'none', padding: 0, margin: 0, 'font-size': '0.8rem' }}>
                  <For each={d().telemetry.recentErrors}>
                    {(e) => (
                      <li style={{ padding: '0.3rem 0', 'border-bottom': '1px solid #f4f4f4', display: 'flex', gap: '0.6rem' }}>
                        <span style={{ color: '#999', 'white-space': 'nowrap' }}>{fmtTime(e.ts)}</span>
                        <span style={{ 'font-family': 'monospace' }}>{e.endpoint}</span>
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
              <h2 style={{ 'font-size': '0.95rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', color: '#999', 'margin-bottom': '0.5rem' }}>
                Bug reports ({d().reports.length})
              </h2>
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
