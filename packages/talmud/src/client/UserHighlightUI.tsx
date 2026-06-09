import { createSignal, For, type JSX, onCleanup, Show } from 'solid-js';
import { t } from './i18n';
import { HIGHLIGHT_COLORS, type UserHighlight } from './userHighlights';

/** View / edit / delete a single personal highlight, anchored near the word
 *  the user clicked. */
export function HighlightNotePopover(props: {
  highlight: UserHighlight;
  anchor: { left: number; top: number; bottom: number };
  onSave: (note: string) => void;
  onDelete: () => void;
  onClose: () => void;
}): JSX.Element {
  const [note, setNote] = createSignal(props.highlight.note);
  let ref: HTMLDivElement | undefined;

  const onDocDown = (e: MouseEvent) => {
    if (ref && !ref.contains(e.target as Node)) {
      // Persist any in-progress edit before dismissing.
      if (note().trim() !== props.highlight.note) props.onSave(note().trim());
      props.onClose();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
  };
  document.addEventListener('mousedown', onDocDown, true);
  window.addEventListener('keydown', onKey);
  onCleanup(() => {
    document.removeEventListener('mousedown', onDocDown, true);
    window.removeEventListener('keydown', onKey);
  });

  const style = (): JSX.CSSProperties => {
    const a = props.anchor;
    const h = 120;
    const above = a.top > h + 16;
    return {
      position: 'fixed',
      top: above ? `${a.top - h - 8}px` : `${a.bottom + 8}px`,
      left: `${a.left}px`,
      'z-index': '1001',
    };
  };

  return (
    <div
      ref={ref}
      style={{
        ...style(),
        background: '#fff',
        border: '1px solid #d0d0d0',
        'border-radius': '6px',
        'box-shadow': '0 4px 16px rgba(0,0,0,0.14)',
        padding: '0.6rem',
        'min-width': '15rem',
        'max-width': '20rem',
        'font-family': 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        dir="rtl"
        lang="he"
        style={{
          'font-family': '"Mekorot Vilna", serif',
          'font-size': '0.95rem',
          color: '#555',
          'margin-bottom': '0.45rem',
          'max-height': '3.2em',
          overflow: 'hidden',
        }}
      >
        {props.highlight.text}
      </div>
      <textarea
        value={note()}
        onInput={(e) => setNote(e.currentTarget.value)}
        placeholder={t('highlight.notePlaceholder')}
        rows={3}
        style={{
          width: '100%',
          'box-sizing': 'border-box',
          'font-size': '0.85rem',
          padding: '0.35rem 0.45rem',
          border: '1px solid #ddd',
          'border-radius': '4px',
          resize: 'vertical',
          'font-family': 'system-ui, -apple-system, sans-serif',
        }}
      />
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-top': '0.5rem' }}>
        <button
          type="button"
          onClick={() => props.onDelete()}
          style={{
            'font-size': '0.78rem',
            color: '#c0392b',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.25rem 0',
          }}
        >
          {t('highlight.delete')}
        </button>
        <button
          type="button"
          onClick={() => {
            props.onSave(note().trim());
            props.onClose();
          }}
          style={{
            'font-size': '0.78rem',
            'font-weight': 600,
            color: '#fff',
            background: '#2563eb',
            border: 'none',
            'border-radius': '4px',
            cursor: 'pointer',
            padding: '0.3rem 0.8rem',
          }}
        >
          {t('highlight.save')}
        </button>
      </div>
    </div>
  );
}

/** A compact list of this daf's highlights — click to jump, with delete. */
export function NotesPanel(props: {
  highlights: UserHighlight[];
  onJump: (h: UserHighlight) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const swatch = (key: string) =>
    (HIGHLIGHT_COLORS.find((c) => c.key === key) ?? HIGHLIGHT_COLORS[0]).swatch;

  return (
    <div
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: '4.5rem',
        width: '18rem',
        'max-height': '60vh',
        overflow: 'auto',
        background: '#fff',
        border: '1px solid #d0d0d0',
        'border-radius': '8px',
        'box-shadow': '0 6px 20px rgba(0,0,0,0.16)',
        'z-index': '1000',
        'font-family': 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          'justify-content': 'space-between',
          'align-items': 'center',
          padding: '0.6rem 0.8rem',
          'border-bottom': '1px solid #eee',
          position: 'sticky',
          top: '0',
          background: '#fff',
        }}
      >
        <strong style={{ 'font-size': '0.85rem' }}>{t('highlight.notesTitle')}</strong>
        <button
          type="button"
          onClick={() => props.onClose()}
          aria-label="Close"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            'font-size': '1rem',
            color: '#888',
          }}
        >
          ×
        </button>
      </div>
      <Show
        when={props.highlights.length > 0}
        fallback={
          <p
            style={{
              padding: '0.8rem',
              color: '#999',
              'font-size': '0.82rem',
              'font-style': 'italic',
            }}
          >
            {t('highlight.notesEmpty')}
          </p>
        }
      >
        <For each={props.highlights}>
          {(h) => (
            <div
              style={{
                padding: '0.55rem 0.8rem',
                'border-bottom': '1px solid #f3f3f3',
                cursor: 'pointer',
                display: 'flex',
                gap: '0.5rem',
              }}
              onClick={() => props.onJump(h)}
            >
              <span
                style={{
                  flex: '0 0 auto',
                  width: '10px',
                  height: '10px',
                  'border-radius': '50%',
                  background: swatch(h.color),
                  'margin-top': '0.25rem',
                  border: '1px solid rgba(0,0,0,0.15)',
                }}
              />
              <div style={{ 'min-width': '0', flex: '1 1 auto' }}>
                <div
                  dir="rtl"
                  lang="he"
                  style={{
                    'font-family': '"Mekorot Vilna", serif',
                    'font-size': '0.9rem',
                    color: '#333',
                    'white-space': 'nowrap',
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                  }}
                >
                  {h.text}
                </div>
                <Show when={h.note}>
                  <div style={{ 'font-size': '0.78rem', color: '#666', 'margin-top': '0.15rem' }}>
                    {h.note}
                  </div>
                </Show>
              </div>
              <button
                type="button"
                aria-label={t('highlight.delete')}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDelete(h.id);
                }}
                style={{
                  flex: '0 0 auto',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#bbb',
                  'font-size': '0.95rem',
                }}
              >
                ×
              </button>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
