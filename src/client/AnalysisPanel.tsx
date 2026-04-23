import { createSignal, createEffect, For, Show, type JSX } from 'solid-js';

export interface Rabbi {
  name: string;
  nameHe: string;
  period: string;
  location: string;
  role: string;
  opinionStart?: string;
}

export interface Section {
  title: string;
  summary: string;
  excerpt?: string;
  rabbis: Rabbi[];
}

export interface DafAnalysis {
  summary: string;
  sections: Section[];
  _cached?: boolean;
  _model?: string;
  error?: string;
}

export interface AnalysisPanelProps {
  tractate: string;
  page: string;
}

// In-session cache to skip even the 6ms KV-backed probe on repeat navigation
// to a daf we've already loaded this session.
const sessionCache = new Map<string, DafAnalysis>();

export function AnalysisPanel(props: AnalysisPanelProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [analysis, setAnalysis] = createSignal<DafAnalysis | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Reset state + probe server cache whenever the daf changes. The probe
  // endpoint (?cached_only=1) returns the cached analysis if present or 404
  // if not — it never kicks off a slow Kimi run.
  createEffect(() => {
    const tractate = props.tractate;
    const page = props.page;
    const key = `${tractate}:${page}`;

    // Fresh-daf reset
    setError(null);
    setLoading(false);

    const sessionHit = sessionCache.get(key);
    if (sessionHit) {
      setAnalysis(sessionHit);
      setOpen(true);
      return;
    }

    // Clear any stale result from a previous daf so the UI doesn't flash it
    setAnalysis(null);
    setOpen(false);

    // Probe for server-side cache. If present, populate & open; else stay idle.
    const controller = new AbortController();
    fetch(`/api/analyze/${encodeURIComponent(tractate)}/${page}?cached_only=1`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status !== 200) return null;
        const data = (await res.json()) as DafAnalysis;
        if (data.error) return null;
        return data;
      })
      .then((data) => {
        // Guard against stale responses (user already navigated to yet another daf)
        if (tractate !== props.tractate || page !== props.page) return;
        if (data) {
          sessionCache.set(key, data);
          setAnalysis(data);
          setOpen(true);
        }
      })
      .catch(() => {
        /* probe failure is non-fatal; user can still click Analyze */
      });

    // Cleanup: abort the probe if the effect re-runs before it finishes
    return () => controller.abort();
  });

  const run = async (refresh = false) => {
    const tractate = props.tractate;
    const page = props.page;
    const key = `${tractate}:${page}`;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/analyze/${encodeURIComponent(tractate)}/${page}${refresh ? '?refresh=1' : ''}`;
      const res = await fetch(url);
      const data = (await res.json()) as DafAnalysis & { attempts?: string[] };
      // If user navigated away while this was pending, drop the result
      if (tractate !== props.tractate || page !== props.page) return;
      if (!res.ok || data.error) {
        const errStr = (data.error ?? '') + ' ' + (data.attempts ?? []).join(' ');
        if (/1031|UpstreamError/i.test(errStr)) {
          throw new Error(
            "Cloudflare's AI upstream is temporarily unavailable (error 1031). Try again in a minute.",
          );
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      sessionCache.set(key, data);
      setAnalysis(data);
    } catch (err) {
      if (tractate !== props.tractate || page !== props.page) return;
      setError(String(err));
    } finally {
      if (tractate === props.tractate && page === props.page) setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open();
    setOpen(next);
    if (next && !analysis() && !loading()) run();
  };

  return (
    <section
      style={{
        'margin-top': '2rem',
        'max-width': '720px',
        'margin-left': 'auto',
        'margin-right': 'auto',
        'font-family': 'system-ui, -apple-system, sans-serif',
      }}
    >
      <button
        onClick={toggle}
        style={{
          width: '100%',
          padding: '0.6rem 0.9rem',
          'font-size': '0.95rem',
          'font-weight': 600,
          background: open() ? '#8a2a2b' : '#fafafa',
          color: open() ? '#fff' : '#333',
          border: '1px solid ' + (open() ? '#8a2a2b' : '#ccc'),
          'border-radius': '6px',
          cursor: 'pointer',
          'text-align': 'left',
          display: 'flex',
          'justify-content': 'space-between',
          'align-items': 'center',
        }}
      >
        <span>{open() ? '▾' : '▸'} Argument structure & rabbis — {props.tractate} {props.page}</span>
        <span style={{ 'font-size': '0.8rem', opacity: 0.8 }}>
          {loading() ? 'analyzing…' : analysis()?._cached ? 'cached' : ''}
        </span>
      </button>

      <Show when={open()}>
        <div
          style={{
            'margin-top': '0.75rem',
            padding: '1rem 1.25rem',
            border: '1px solid #e5e3dc',
            'border-radius': '6px',
            background: '#fff',
          }}
        >
          <Show when={loading()}>
            <p style={{ margin: 0, color: '#666', 'font-style': 'italic' }}>
              Kimi K2 is analyzing the daf. First analysis takes 1–2 minutes; afterward it's instant (KV cached).
            </p>
          </Show>

          <Show when={error()}>
            <p style={{ color: '#c33', margin: 0 }}>
              {error()}
              <button
                onClick={() => run()}
                style={{
                  'margin-left': '0.75rem',
                  padding: '0.25rem 0.5rem',
                  'font-size': '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </p>
          </Show>

          <Show when={!loading() && !error() && analysis()}>
            {(() => {
              const a = analysis()!;
              return (
                <div>
                  <p
                    style={{
                      margin: '0 0 1rem',
                      'font-size': '0.95rem',
                      'line-height': 1.55,
                      color: '#222',
                    }}
                  >
                    {a.summary}
                  </p>

                  <For each={a.sections}>
                    {(section, i) => (
                      <article
                        style={{
                          'margin-bottom': '1.25rem',
                          'padding-bottom': '1rem',
                          'border-bottom':
                            i() === a.sections.length - 1 ? 'none' : '1px solid #eee',
                        }}
                      >
                        <h3
                          style={{
                            margin: '0 0 0.35rem',
                            'font-size': '1rem',
                            color: '#8a2a2b',
                          }}
                        >
                          {section.title}
                        </h3>
                        <Show when={section.excerpt}>
                          <p
                            dir="rtl"
                            lang="he"
                            style={{
                              margin: '0 0 0.4rem',
                              'font-family': '"Mekorot Vilna", serif',
                              'font-size': '0.95rem',
                              color: '#555',
                            }}
                          >
                            {section.excerpt}…
                          </p>
                        </Show>
                        <p
                          style={{
                            margin: '0 0 0.6rem',
                            'font-size': '0.9rem',
                            'line-height': 1.5,
                            color: '#333',
                          }}
                        >
                          {section.summary}
                        </p>
                        <Show when={section.rabbis.length > 0}>
                          <div
                            style={{
                              display: 'grid',
                              'grid-template-columns': 'repeat(auto-fill, minmax(220px, 1fr))',
                              gap: '0.5rem',
                            }}
                          >
                            <For each={section.rabbis}>
                              {(r) => (
                                <div
                                  style={{
                                    padding: '0.5rem 0.65rem',
                                    background: '#fafaf7',
                                    border: '1px solid #eee',
                                    'border-radius': '4px',
                                    'font-size': '0.85rem',
                                  }}
                                >
                                  <div style={{ 'font-weight': 600, color: '#333' }}>
                                    {r.name}{' '}
                                    <span
                                      dir="rtl"
                                      lang="he"
                                      style={{ 'font-family': '"Mekorot Vilna", serif', color: '#888', 'font-weight': 'normal' }}
                                    >
                                      {r.nameHe}
                                    </span>
                                  </div>
                                  <div style={{ color: '#666', 'margin-top': '0.2rem', 'font-size': '0.8rem' }}>
                                    {r.period} · {r.location}
                                  </div>
                                  <div style={{ color: '#444', 'margin-top': '0.3rem', 'line-height': 1.4 }}>
                                    {r.role}
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </article>
                    )}
                  </For>

                  <div style={{ 'margin-top': '0.5rem', 'text-align': 'right' }}>
                    <button
                      onClick={() => run(true)}
                      disabled={loading()}
                      style={{
                        padding: '0.25rem 0.6rem',
                        'font-size': '0.8rem',
                        color: '#666',
                        background: 'transparent',
                        border: '1px solid #ddd',
                        'border-radius': '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Re-analyze (bypass cache)
                    </button>
                  </div>
                </div>
              );
            })()}
          </Show>
        </div>
      </Show>
    </section>
  );
}
