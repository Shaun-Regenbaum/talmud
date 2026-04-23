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
}

export function CommentaryPicker(props: CommentaryPickerProps): JSX.Element {
  const onChange = (e: Event & { currentTarget: HTMLSelectElement }) => {
    const v = e.currentTarget.value;
    props.onSelect(v === '' ? null : v);
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
        <Show when={props.activeTitle}>
          <div style={{ 'margin-top': '0.5rem', 'font-size': '0.72rem', color: '#666' }}>
            Click any highlighted span on the daf to open the specific comment.
          </div>
        </Show>
      </Show>
    </section>
  );
}
