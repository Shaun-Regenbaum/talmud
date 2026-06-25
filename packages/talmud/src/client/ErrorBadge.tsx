/**
 * A compact failure indicator for a card/stage that errored while the page was
 * being built. Instead of dumping the (often long, technical) error into the
 * content flow, the card shows a small badge; the full message appears as a
 * hover/focus overlay. Keeps a failed enrichment from shoving the reading layout
 * around while keeping the detail one hover away.
 *
 * `tone` 'error' = a genuine bug (red); 'calm' = an expected, benign state like
 * paused / provider temporarily unavailable (amber). Keyboard-accessible: the
 * trigger is a real <button> so it focuses + the overlay shows on focus as well
 * as hover, with the detail also exposed via the native `title` as a
 * no-JS/screen-reader fallback.
 */
import { createSignal, type JSX, Show } from 'solid-js';

export function ErrorBadge(props: {
  tone: 'error' | 'calm';
  label: string;
  detail: string;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const isError = () => props.tone === 'error';
  const fg = () => (isError() ? '#c00' : '#a16207');
  const bg = () => (isError() ? '#fff5f5' : '#fffbeb');
  const border = () => (isError() ? '#f0caca' : '#f0e0b0');
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={props.detail || props.label}
        title={props.detail || props.label}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        style={{
          display: 'inline-flex',
          'align-items': 'center',
          gap: '0.35rem',
          margin: 0,
          padding: '0.15rem 0.45rem',
          'border-radius': '999px',
          'font-size': '0.72rem',
          'font-weight': 600,
          color: fg(),
          background: bg(),
          border: `1px solid ${border()}`,
          cursor: 'default',
        }}
      >
        {/* warning triangle (inline SVG, not an emoji) */}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3L1.5 21h21L12 3z"
            stroke={fg()}
            stroke-width="2"
            stroke-linejoin="round"
            fill="none"
          />
          <path d="M12 10v4" stroke={fg()} stroke-width="2" stroke-linecap="round" />
          <circle cx="12" cy="17" r="1.1" fill={fg()} />
        </svg>
        {props.label}
      </button>
      <Show when={open() && !!props.detail && props.detail !== props.label}>
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.3rem)',
            left: 0,
            'z-index': 50,
            'max-width': '300px',
            'min-width': '160px',
            width: 'max-content',
            padding: '0.4rem 0.55rem',
            background: '#fff',
            color: '#333',
            border: '1px solid #e2e0dd',
            'border-radius': '6px',
            'box-shadow': '0 4px 14px rgba(0,0,0,0.12)',
            'font-family': isError() ? 'monospace' : 'inherit',
            'font-size': '0.72rem',
            'line-height': 1.45,
            'white-space': 'normal',
            'overflow-wrap': 'anywhere',
          }}
        >
          {props.detail}
        </span>
      </Show>
    </span>
  );
}
