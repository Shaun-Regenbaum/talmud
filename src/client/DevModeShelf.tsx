/**
 * DevModeShelf — LEFT SIDEBAR shown when dev mode is on. Houses the
 * marks-toggle list and a pair of live activity panels (AI runs +
 * renderer applies). Resizable via a drag handle on its right edge.
 *
 * The shelf's open/closed state IS the canonical dev-mode flag. When the
 * sidebar is open, devModeActive() returns true and other components
 * (e.g. MarkEnrichmentCards) reveal dev-only affordances like the
 * per-instance inspector button. localStorage key 'dev-mode:v1' persists
 * state across reloads.
 */

import { createSignal, createEffect, onCleanup, Show, type JSX } from 'solid-js';
import AIActivityPanel from './AIActivityPanel';
import PipelinePanel from './PipelinePanel';

const DEV_MODE_KEY = 'dev-mode:v1';
const SHELF_WIDTH_KEY = 'dev-mode:shelf-width:v1';

export function readDevMode(): boolean {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === 'true';
  } catch { return false; }
}

export function writeDevMode(v: boolean) {
  try { localStorage.setItem(DEV_MODE_KEY, v ? 'true' : 'false'); } catch { /* ignore */ }
}

// Shared reactive flag — anything that wants to gate UI on "dev mode"
// reads this. Single source of truth: the dev sidebar open/closed.
const [globalDevActive, setGlobalDevActive] = createSignal(readDevMode());
export function devModeActive(): boolean { return globalDevActive(); }
export function setDevModeActive(v: boolean) {
  setGlobalDevActive(v);
  writeDevMode(v);
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Slot for the marks panel (DafViewer passes <MarksRegistryPanel /> here). */
  children: JSX.Element;
}

export default function DevModeShelf(props: Props) {
  const initialWidth = (() => {
    try {
      const v = parseInt(localStorage.getItem(SHELF_WIDTH_KEY) ?? '0', 10);
      return v > 200 ? v : 380;
    } catch { return 380; }
  })();
  const [width, setWidth] = createSignal<number>(initialWidth);
  let dragStartX = 0;
  let dragStartW = 0;

  const onDragStart = (ev: MouseEvent) => {
    ev.preventDefault();
    dragStartX = ev.clientX;
    dragStartW = width();
    document.body.style.userSelect = 'none';
    const move = (e: MouseEvent) => {
      const dx = e.clientX - dragStartX;
      const next = Math.max(260, Math.min(window.innerWidth - 200, dragStartW + dx));
      setWidth(next);
    };
    const up = () => {
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      try { localStorage.setItem(SHELF_WIDTH_KEY, String(width())); } catch { /* ignore */ }
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  // Push the rest of the page over by the sidebar width when open, so the
  // daf renders centered in the remaining viewport space instead of being
  // overlapped by the sidebar. We set a CSS variable on <body>; a global
  // CSS rule reads it.
  createEffect(() => {
    if (props.open) {
      document.body.style.setProperty('--dev-shelf-width', `${width()}px`);
      document.body.classList.add('dev-shelf-open');
    } else {
      document.body.classList.remove('dev-shelf-open');
      document.body.style.removeProperty('--dev-shelf-width');
    }
  });
  onCleanup(() => {
    document.body.classList.remove('dev-shelf-open');
    document.body.style.removeProperty('--dev-shelf-width');
  });

  // Always render the aside — toggle visibility via CSS so children
  // (MarksRegistryPanel) stay mounted and their createEffects keep firing
  // even when the shelf is collapsed. If we used <Show> the panel
  // would unmount and the rabbi extraction would never start.
  return (
    <aside style={{
      position: 'fixed',
      top: 0, left: 0, bottom: 0,
      width: `${width()}px`,
      background: '#fff',
      'border-right': '1px solid #ddd',
      'box-shadow': '4px 0 16px rgba(0,0,0,0.08)',
      'z-index': 900,
      display: props.open ? 'flex' : 'none',
      'flex-direction': 'column',
      'font-family': 'system-ui, sans-serif',
      'font-size': '13px',
      'box-sizing': 'border-box',
      overflow: 'hidden',
    }}>
      {/* Drag handle on the right edge */}
      <div
        onMouseDown={onDragStart}
        style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0,
          width: '6px',
          cursor: 'ew-resize',
          background: 'transparent',
          'border-left': '1px solid #eee',
          'z-index': 1,
        }}
        title="drag to resize"
      />

      {/* Header */}
      <div style={{
        display: 'flex',
        'align-items': 'center',
        gap: '0.6rem',
        padding: '0.4rem 0.75rem',
        'border-bottom': '1px solid #eee',
        background: '#fafafa',
      }}>
        <strong style={{ 'font-size': '0.8rem', 'letter-spacing': '0.04em', 'text-transform': 'uppercase', color: '#444' }}>Dev</strong>
        <button
          onClick={props.onClose}
          style={{ 'margin-left': 'auto', padding: '2px 10px', cursor: 'pointer', background: 'transparent', border: '1px solid #ccc', 'border-radius': '3px', 'font-size': '0.75rem' }}
        >
          close
        </button>
      </div>

      {/* Activity panels — live spinners for AI runs + last apply per
          renderer. Both self-hide when empty. */}
      <Show when={props.open}>
        <div style={{ padding: '0.5rem 0.75rem 0', display: 'flex', 'flex-direction': 'column', gap: '0.5rem', 'flex-shrink': 0 }}>
          <AIActivityPanel />
          <PipelinePanel />
        </div>
      </Show>

      {/* Marks slot — fills remaining space. */}
      <div style={{
        flex: 1,
        'overflow-y': 'auto',
        padding: '0.5rem 0.75rem',
        'min-height': 0,
      }}>
        {props.children}
      </div>
    </aside>
  );
}
