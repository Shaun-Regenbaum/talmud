import { For, Show, createSignal, createEffect, type JSX } from 'solid-js';

export interface CommentaryComment {
  anchorRef: string;
  anchorSegIdx: number;
  sourceRef: string;
  textHe: string;
  textEn: string;
}

export interface CommentaryWork {
  title: string;
  titleHe: string;
  count: number;
  comments: CommentaryComment[];
}

export interface CommentaryPickerProps {
  works: CommentaryWork[] | null;
  loading: boolean;
  activeTitle: string | null;
  onSelect: (title: string | null) => void;
  /** Segment index currently expanded inside this card, or null. */
  activeSegIdx: number | null;
  /** Comments for the active segment (empty when none). */
  activeComments: CommentaryComment[];
  /** Collapse the expanded segment (keeps the work selected). */
  onCloseSegment: () => void;
  /** Needed for commentary-translate requests (segment-anchored context). */
  tractate: string;
  page: string;
}

// Per-sourceRef translation cache (module-scoped; survives re-renders).
const translationCache = new Map<string, string>();
const pendingTranslations = new Map<string, Promise<string>>();

type TxState =
  | { state: 'ready'; text: string }
  | { state: 'loading' }
  | { state: 'error'; error: string };

async function fetchTranslation(
  comment: CommentaryComment,
  tractate: string,
  page: string,
): Promise<string> {
  const cached = translationCache.get(comment.sourceRef);
  if (cached !== undefined) return cached;
  const pending = pendingTranslations.get(comment.sourceRef);
  if (pending) return pending;
  const p = (async () => {
    try {
      const res = await fetch('/api/commentary-translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceRef: comment.sourceRef,
          textHe: comment.textHe,
          tractate, page,
          anchorSegIdx: comment.anchorSegIdx,
        }),
      });
      const json = (await res.json()) as { translation?: string; error?: string };
      if (!res.ok || json.error || !json.translation) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      translationCache.set(comment.sourceRef, json.translation);
      return json.translation;
    } finally {
      pendingTranslations.delete(comment.sourceRef);
    }
  })();
  pendingTranslations.set(comment.sourceRef, p);
  return p;
}

export function CommentaryPicker(props: CommentaryPickerProps): JSX.Element {
  const onChange = (e: Event & { currentTarget: HTMLSelectElement }) => {
    const v = e.currentTarget.value;
    props.onSelect(v === '' ? null : v);
  };

  const activeWork = () => {
    const t = props.activeTitle;
    if (!t) return null;
    return (props.works ?? []).find((w) => w.title === t) ?? null;
  };

  // Per-comment translation state. Reactive so the inline text swaps in when
  // the fetch resolves. Keyed by sourceRef.
  const [translations, setTranslations] = createSignal<Record<string, TxState>>({});

  // Kick translation fetches for any visible comment without its own English.
  createEffect(() => {
    const comments = props.activeComments;
    if (!comments || comments.length === 0) return;
    for (const c of comments) {
      if (c.textEn && c.textEn.trim()) continue;
      const state = translations()[c.sourceRef];
      const cached = translationCache.get(c.sourceRef);
      if (cached !== undefined) {
        if (!state || state.state !== 'ready') {
          setTranslations((prev) => ({ ...prev, [c.sourceRef]: { state: 'ready', text: cached } }));
        }
        continue;
      }
      if (state) continue;
      setTranslations((prev) => ({ ...prev, [c.sourceRef]: { state: 'loading' } }));
      void fetchTranslation(c, props.tractate, props.page)
        .then((text) => {
          setTranslations((prev) => ({ ...prev, [c.sourceRef]: { state: 'ready', text } }));
        })
        .catch((err) => {
          setTranslations((prev) => ({
            ...prev,
            [c.sourceRef]: { state: 'error', error: String(err).slice(0, 160) },
          }));
        });
    }
  });

  return (
    <section
      style={{
        background: '#fff',
        border: '1px solid #e5e3dc',
        'border-radius': '6px',
        'box-shadow': '0 2px 8px rgba(0,0,0,0.06)',
        padding: '0.85rem 1rem',
        'font-family': 'system-ui, -apple-system, sans-serif',
        'font-size': '0.85rem',
        color: '#222',
      }}
    >
      <div
        style={{
          'font-size': '0.7rem',
          color: '#999',
          'text-transform': 'uppercase',
          'letter-spacing': '0.08em',
          'margin-bottom': '0.45rem',
        }}
      >
        Commentaries on this daf
      </div>

      <Show when={props.loading}>
        <div style={{ color: '#888', 'font-style': 'italic', 'font-size': '0.82rem' }}>
          Loading…
        </div>
      </Show>

      <Show when={!props.loading && props.works && props.works.length === 0}>
        <div style={{ color: '#888', 'font-style': 'italic', 'font-size': '0.82rem' }}>
          No commentary links on this daf.
        </div>
      </Show>

      <Show when={props.works && props.works.length > 0}>
        <select
          value={props.activeTitle ?? ''}
          onChange={onChange}
          style={{
            width: '100%',
            padding: '0.45rem 0.55rem',
            'font-size': '0.9rem',
            border: '1px solid #ddd',
            'border-radius': '4px',
            background: '#fcfcfa',
            color: '#333',
            'font-family': 'inherit',
            cursor: 'pointer',
          }}
        >
          <option value="">— choose a commentary —</option>
          <For each={props.works ?? []}>
            {(w) => (
              <option value={w.title}>
                {w.title}
                {w.titleHe ? ` · ${w.titleHe}` : ''}
                {` · ${w.count}`}
              </option>
            )}
          </For>
        </select>

        <Show when={props.activeTitle && props.activeSegIdx === null}>
          <div style={{ 'margin-top': '0.5rem', 'font-size': '0.72rem', color: '#666' }}>
            Click any highlighted span on the daf to open the specific comment.
          </div>
        </Show>

        <Show when={props.activeSegIdx !== null && props.activeComments.length > 0}>
          <div
            style={{
              'margin-top': '0.7rem',
              'padding-top': '0.7rem',
              'border-top': '1px solid #eee',
            }}
          >
            <header
              style={{
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'space-between',
                'margin-bottom': '0.5rem',
              }}
            >
              <div>
                <Show when={activeWork()}>
                  {(w) => (
                    <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem' }}>
                      <h3 style={{ margin: 0, 'font-size': '1rem', color: '#7c3aed' }}>
                        {w().title}
                      </h3>
                      <Show when={w().titleHe}>
                        <span
                          dir="rtl"
                          lang="he"
                          style={{
                            'font-family': '"Mekorot Vilna", serif',
                            'font-size': '0.95rem',
                            color: '#666',
                          }}
                        >
                          {w().titleHe}
                        </span>
                      </Show>
                    </div>
                  )}
                </Show>
                <div style={{ 'font-size': '0.72rem', color: '#999', 'margin-top': '0.2rem' }}>
                  {props.activeComments.length} comment
                  {props.activeComments.length === 1 ? '' : 's'} on segment #
                  {(props.activeSegIdx ?? 0) + 1}
                </div>
              </div>
              <button
                onClick={props.onCloseSegment}
                aria-label="Close segment"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  'font-size': '1.1rem',
                  color: '#888',
                  padding: '0.1rem 0.35rem',
                  'font-family': 'inherit',
                }}
              >
                ×
              </button>
            </header>

            <For each={props.activeComments}>
              {(comment, i) => {
                const tx = () => translations()[comment.sourceRef];
                const englishPair = (): { text: string; kind: 'sefaria' | 'kimi' } | null => {
                  if (comment.textEn && comment.textEn.trim()) {
                    return { text: comment.textEn, kind: 'sefaria' };
                  }
                  const t = tx();
                  if (t && t.state === 'ready') return { text: t.text, kind: 'kimi' };
                  return null;
                };
                return (
                  <div
                    style={{
                      padding: '0.55rem 0.7rem',
                      margin: '0 0 0.4rem',
                      background: '#fcfcfa',
                      border: '1px solid #eee',
                      'border-radius': '4px',
                    }}
                  >
                    <div style={{ 'font-size': '0.7rem', color: '#999', 'margin-bottom': '0.3rem' }}>
                      #{i() + 1} · {comment.sourceRef}
                    </div>
                    <Show when={comment.textHe}>
                      <div
                        dir="rtl"
                        lang="he"
                        style={{
                          'font-family': '"Mekorot Vilna", serif',
                          'font-size': '0.93rem',
                          'line-height': 1.55,
                          color: '#333',
                          'margin-bottom': '0.45rem',
                        }}
                        innerHTML={comment.textHe}
                      />
                    </Show>
                    <Show when={englishPair()}>
                      {(pair) => (
                        <>
                          <div
                            style={{
                              'font-size': '0.8rem',
                              color: '#555',
                              'line-height': 1.5,
                            }}
                            innerHTML={pair().text}
                          />
                          <Show when={pair().kind === 'kimi'}>
                            <div style={{ 'margin-top': '0.3rem', 'font-size': '0.65rem', color: '#999', 'font-style': 'italic' }}>
                              auto-translated
                            </div>
                          </Show>
                        </>
                      )}
                    </Show>
                    <Show when={!comment.textEn && tx()?.state === 'loading'}>
                      <div style={{ color: '#888', 'font-style': 'italic', 'font-size': '0.78rem' }}>
                        Translating…
                      </div>
                    </Show>
                    <Show when={!comment.textEn && tx()?.state === 'error'}>
                      <div style={{ color: '#c33', 'font-size': '0.75rem' }}>
                        Couldn't translate: {(tx() as { state: 'error'; error: string }).error}
                      </div>
                    </Show>
                    <Show when={!comment.textHe && !englishPair()}>
                      <div style={{ color: '#999', 'font-style': 'italic', 'font-size': '0.78rem' }}>
                        (No text available)
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  );
}
