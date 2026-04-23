import { For, Show, type JSX } from 'solid-js';

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
  /** The comments for the active segment (empty when none). */
  activeComments: CommentaryComment[];
  /** Collapse the expanded segment (keeps the work selected). */
  onCloseSegment: () => void;
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

        {/* Inline expansion: active segment's comments for the active work. */}
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
                      <h3 style={{ margin: 0, 'font-size': '1rem', color: '#1e40af' }}>
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
              {(comment, i) => (
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
                        'margin-bottom': comment.textEn ? '0.45rem' : 0,
                      }}
                      innerHTML={comment.textHe}
                    />
                  </Show>
                  <Show when={comment.textEn}>
                    <div
                      style={{
                        'font-size': '0.8rem',
                        color: '#555',
                        'line-height': 1.5,
                      }}
                      innerHTML={comment.textEn}
                    />
                  </Show>
                  <Show when={!comment.textHe && !comment.textEn}>
                    <div style={{ color: '#999', 'font-style': 'italic', 'font-size': '0.78rem' }}>
                      (No text available)
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  );
}
