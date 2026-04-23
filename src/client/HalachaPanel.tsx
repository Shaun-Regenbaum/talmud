import { createSignal, createEffect, For, Show, type JSX } from 'solid-js';

interface Ruling {
  ref: string;
  summary: string;
}

export interface HalachaTopic {
  topic: string;
  topicHe?: string;
  excerpt?: string;
  rulings: {
    mishnehTorah?: Ruling;
    shulchanAruch?: Ruling;
    rema?: Ruling;
  };
}

export interface HalachaResult {
  topics: HalachaTopic[];
  _cached?: boolean;
  _model?: string;
  error?: string;
}

export interface HalachaPanelProps {
  tractate: string;
  page: string;
}

const sessionCache = new Map<string, HalachaResult>();

/**
 * Turn a Shulchan Aruch / Mishneh Torah / Rema ref into a Sefaria URL.
 * E.g. "Orach Chaim 235:1" → https://www.sefaria.org/Shulchan_Arukh%2C_Orach_Chayyim.235.1
 * Best-effort — if the ref shape is surprising, returns null and we just
 * render plain text.
 */
function sefariaUrl(source: 'mishnehTorah' | 'shulchanAruch' | 'rema', ref: string): string | null {
  const trimmed = ref.trim();
  if (source === 'mishnehTorah') {
    // "Hilchot Kriat Shema 1:9" — Mishneh Torah path on Sefaria is
    // "Mishneh_Torah,_Recitation_of_Shema.1.9" which requires English
    // hilchot name mapping; we don't have that mapping yet, so link to
    // a full-text search.
    return `https://www.sefaria.org/search?q=${encodeURIComponent('Mishneh Torah ' + trimmed)}`;
  }
  if (source === 'shulchanAruch' || source === 'rema') {
    // "Orach Chaim 235:1" → Shulchan_Arukh,_Orach_Chayyim.235.1
    const match = trimmed.match(/^(Orach(?:\s+)?(?:Ch|H)(?:aim|ayyim)?|Yoreh\s+De'?ah|Yoreh\s+Deah|Even\s+Ha'?Ezer|Even\s+HaEzer|Choshen\s+Mishpat)\s+(\d+):(\d+)/i);
    if (match) {
      const sectionMap: Record<string, string> = {
        'orachchaim':    'Orach_Chayyim',
        'orachchaayim':  'Orach_Chayyim',
        'orachchayyim':  'Orach_Chayyim',
        'orachhaim':     'Orach_Chayyim',
        'yorehdeah':     'Yoreh_De%27ah',
        "yohrehde'ah":   'Yoreh_De%27ah',
        'evenhaezer':    'Even_HaEzer',
        "evenha'ezer":   'Even_HaEzer',
        'choshenmishpat': 'Choshen_Mishpat',
      };
      const normalized = match[1].toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
      const section = sectionMap[normalized];
      if (section) {
        const prefix = source === 'rema' ? 'Mappah' : 'Shulchan_Arukh';
        return `https://www.sefaria.org/${prefix}%2C_${section}.${match[2]}.${match[3]}`;
      }
    }
    return `https://www.sefaria.org/search?q=${encodeURIComponent(trimmed)}`;
  }
  return null;
}

function RulingCell(props: {
  source: 'mishnehTorah' | 'shulchanAruch' | 'rema';
  label: string;
  color: string;
  ruling?: Ruling;
}): JSX.Element {
  return (
    <div
      style={{
        padding: '0.55rem 0.7rem',
        background: props.ruling ? '#fafaf7' : 'transparent',
        border: '1px solid ' + (props.ruling ? '#eae8e0' : 'transparent'),
        'border-radius': '4px',
        'font-size': '0.85rem',
        'min-height': '3rem',
      }}
    >
      <div
        style={{
          'font-size': '0.7rem',
          'text-transform': 'uppercase',
          'letter-spacing': '0.06em',
          'font-weight': 600,
          color: props.color,
          'margin-bottom': '0.25rem',
        }}
      >
        {props.label}
      </div>
      <Show when={props.ruling} fallback={<div style={{ color: '#bbb', 'font-style': 'italic' }}>—</div>}>
        {(r) => {
          const url = sefariaUrl(props.source, r().ref);
          return (
            <div>
              <div style={{ 'font-weight': 500, color: '#333', 'margin-bottom': '0.2rem' }}>
                <Show when={url} fallback={<span>{r().ref}</span>}>
                  <a
                    href={url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: props.color, 'text-decoration': 'none' }}
                    title="Open on Sefaria"
                  >
                    {r().ref} ↗
                  </a>
                </Show>
              </div>
              <div style={{ color: '#555', 'line-height': 1.5 }}>{r().summary}</div>
            </div>
          );
        }}
      </Show>
    </div>
  );
}

export function HalachaPanel(props: HalachaPanelProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [data, setData] = createSignal<HalachaResult | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    const tractate = props.tractate;
    const page = props.page;
    const key = `${tractate}:${page}`;
    setError(null);
    setLoading(false);

    const hit = sessionCache.get(key);
    if (hit) {
      setData(hit);
      setOpen(true);
      return;
    }
    setData(null);
    setOpen(false);

    const controller = new AbortController();
    fetch(`/api/halacha/${encodeURIComponent(tractate)}/${page}?cached_only=1`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status !== 200) return null;
        const d = (await res.json()) as HalachaResult;
        return d.error ? null : d;
      })
      .then((d) => {
        if (tractate !== props.tractate || page !== props.page) return;
        if (d) {
          sessionCache.set(key, d);
          setData(d);
          setOpen(true);
        }
      })
      .catch(() => {/* probe failure non-fatal */});

    return () => controller.abort();
  });

  const run = async (refresh = false) => {
    const tractate = props.tractate;
    const page = props.page;
    const key = `${tractate}:${page}`;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/halacha/${encodeURIComponent(tractate)}/${page}${refresh ? '?refresh=1' : ''}`;
      const res = await fetch(url);
      const d = (await res.json()) as HalachaResult & { attempts?: string[] };
      if (tractate !== props.tractate || page !== props.page) return;
      if (!res.ok || d.error) {
        const detail = (d.error ?? '') + ' ' + (d.attempts ?? []).join(' ');
        if (/1031|UpstreamError/i.test(detail)) {
          throw new Error("Cloudflare AI upstream unavailable (1031). Try again shortly.");
        }
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      sessionCache.set(key, d);
      setData(d);
    } catch (err) {
      if (tractate !== props.tractate || page !== props.page) return;
      setError(String((err as Error).message ?? err));
    } finally {
      if (tractate === props.tractate && page === props.page) setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open();
    setOpen(next);
    if (next && !data() && !loading()) run();
  };

  return (
    <section
      style={{
        'margin-top': '1rem',
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
          background: open() ? '#1e40af' : '#fafafa',
          color: open() ? '#fff' : '#333',
          border: '1px solid ' + (open() ? '#1e40af' : '#ccc'),
          'border-radius': '6px',
          cursor: 'pointer',
          'text-align': 'left',
          display: 'flex',
          'justify-content': 'space-between',
          'align-items': 'center',
        }}
      >
        <span>{open() ? '▾' : '▸'} Practical Halacha — {props.tractate} {props.page}</span>
        <span style={{ 'font-size': '0.8rem', opacity: 0.8 }}>
          {loading() ? 'analyzing…' : data()?._cached ? 'cached' : ''}
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
              Identifying Mishneh Torah, Shulchan Aruch, and Rema rulings relevant to this daf. First analysis takes 1–2 minutes; afterward it's instant (KV cached).
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

          <Show when={!loading() && !error() && data()}>
            {(() => {
              const d = data()!;
              if (d.topics.length === 0) {
                return (
                  <p style={{ color: '#666', 'font-style': 'italic', margin: 0 }}>
                    No practical halachic rulings identified for this daf.
                  </p>
                );
              }
              return (
                <div>
                  <For each={d.topics}>
                    {(topic, i) => (
                      <article
                        style={{
                          'margin-bottom': '1.25rem',
                          'padding-bottom': '1rem',
                          'border-bottom':
                            i() === d.topics.length - 1 ? 'none' : '1px solid #eee',
                        }}
                      >
                        <h3 style={{ margin: '0 0 0.1rem', 'font-size': '1rem', color: '#1e40af' }}>
                          {topic.topic}
                        </h3>
                        <Show when={topic.topicHe}>
                          <p
                            dir="rtl"
                            lang="he"
                            style={{
                              margin: '0 0 0.6rem',
                              'font-family': '"Mekorot Vilna", serif',
                              'font-size': '0.95rem',
                              color: '#666',
                            }}
                          >
                            {topic.topicHe}
                          </p>
                        </Show>
                        <div
                          style={{
                            display: 'grid',
                            'grid-template-columns': 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '0.5rem',
                          }}
                        >
                          <RulingCell
                            source="mishnehTorah"
                            label="Mishneh Torah"
                            color="#8a2a2b"
                            ruling={topic.rulings.mishnehTorah}
                          />
                          <RulingCell
                            source="shulchanAruch"
                            label="Shulchan Aruch"
                            color="#1e40af"
                            ruling={topic.rulings.shulchanAruch}
                          />
                          <RulingCell
                            source="rema"
                            label="Rema"
                            color="#7c3aed"
                            ruling={topic.rulings.rema}
                          />
                        </div>
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
