/**
 * DevModeShelf — LEFT SIDEBAR shown when dev mode is on. Houses the
 * marks-toggle list (top) and a captured console log (bottom). Resizable
 * via a drag handle on its right edge.
 *
 * The console log captures console.debug / console.warn / console.error
 * calls and tags them by source (anything matching /^\[(\w+)\]/ at the start
 * of a string arg gets that tag).
 *
 * The shelf's open/closed state IS the canonical dev-mode flag. When the
 * sidebar is open, devModeActive() returns true and other components
 * (e.g. MarkEnrichmentCards) reveal dev-only affordances like the
 * leaf-enrichment dropdown. localStorage key 'dev-mode:v1' persists state
 * across reloads.
 */

import { createSignal, createEffect, onMount, onCleanup, For, Show, type JSX } from 'solid-js';

const DEV_MODE_KEY = 'dev-mode:v1';
const SHELF_WIDTH_KEY = 'dev-mode:shelf-width:v1';
const MAX_LOG_ENTRIES = 500;

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

interface LogEntry {
  id: number;
  level: 'debug' | 'log' | 'info' | 'warn' | 'error';
  tag: string;
  args: unknown[];
  at: number;
}

let logCounter = 0;

function tagOf(args: unknown[]): string {
  if (args.length === 0) return '';
  const first = args[0];
  if (typeof first !== 'string') return '';
  const m = first.match(/^\[([\w-]+)\]/);
  return m ? m[1] : '';
}

function formatArgs(args: unknown[]): string {
  return args.map((a) => {
    if (typeof a === 'string') return a;
    // Error objects don't serialize via JSON.stringify (their props are
    // non-enumerable). Without this branch error logs show as `{}`.
    if (a instanceof Error) {
      return a.stack ? `${a.message}\n${a.stack}` : a.message;
    }
    try { return JSON.stringify(a); }
    catch { return String(a); }
  }).join(' ');
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Slot for the marks panel (DafViewer passes <MarksRegistryPanel /> here). */
  children: JSX.Element;
}

export default function DevModeShelf(props: Props) {
  const [logs, setLogs] = createSignal<LogEntry[]>([]);
  const [tagFilter, setTagFilter] = createSignal<string>('');
  const [paused, setPaused] = createSignal(false);
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
  // CSS rule (added below as a <style>) reads it.
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

  // Mirror console.* into the in-shelf log. Original methods are kept and
  // still print to the browser console.
  onMount(() => {
    const orig = {
      debug: console.debug.bind(console),
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    const wrap = (level: LogEntry['level']) => (...args: unknown[]) => {
      orig[level](...args);
      if (paused()) return;
      const entry: LogEntry = {
        id: ++logCounter,
        level,
        tag: tagOf(args),
        args,
        at: Date.now(),
      };
      setLogs((cur) => {
        const next = [...cur, entry];
        return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
      });
    };
    console.debug = wrap('debug');
    console.log = wrap('log');
    console.info = wrap('info');
    console.warn = wrap('warn');
    console.error = wrap('error');
    onCleanup(() => {
      console.debug = orig.debug;
      console.log = orig.log;
      console.info = orig.info;
      console.warn = orig.warn;
      console.error = orig.error;
    });
  });

  const visibleLogs = () => {
    const f = tagFilter();
    if (!f) return logs();
    return logs().filter((l) => l.tag === f);
  };

  const tagsSeen = () => {
    const set = new Set<string>();
    for (const l of logs()) if (l.tag) set.add(l.tag);
    return [...set].sort();
  };

  const levelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return '#c00';
      case 'warn': return '#a60';
      case 'info': return '#0066cc';
      case 'debug': return '#888';
      default: return '#222';
    }
  };

  const onCopyLogs = async () => {
    const lines = visibleLogs().map((l) => {
      const ts = new Date(l.at).toLocaleTimeString('en-US', { hour12: false });
      return `${ts} [${l.level}]${l.tag ? ` [${l.tag}]` : ''} ${formatArgs(l.args)}`;
    }).join('\n');
    try {
      await navigator.clipboard.writeText(lines);
    } catch (err) {
      console.warn('[DevModeShelf] clipboard write failed:', err);
    }
  };

  // Always render the aside — toggle visibility via CSS so children
  // (MarksRegistryPanel) stay mounted and their createEffects keep firing
  // runs even when the shelf is collapsed. If we used <Show> the panel
  // would unmount and the rabbi extraction would never start.
  return (
    <>
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
          <span style={{ color: '#888', 'font-size': '0.75rem' }}>marks + log</span>
          <button
            onClick={props.onClose}
            style={{ 'margin-left': 'auto', padding: '2px 10px', cursor: 'pointer', background: 'transparent', border: '1px solid #ccc', 'border-radius': '3px', 'font-size': '0.75rem' }}
          >
            close
          </button>
        </div>

        {/* Marks slot — top section. flex:1 so it can grow; capped via
            max-height so the log section is always visible. */}
        <div style={{
          'border-bottom': '1px solid #eee',
          padding: '0.5rem 0.75rem',
          'overflow-y': 'auto',
          'max-height': '50%',
          'flex-shrink': 0,
        }}>
          {props.children}
        </div>

        {/* Log section — fills remaining space */}
        <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column', 'min-height': 0 }}>
          <div style={{
            display: 'flex',
            'align-items': 'center',
            gap: '0.4rem',
            padding: '0.3rem 0.6rem',
            background: '#f8f8f8',
            'border-bottom': '1px solid #eee',
            'font-size': '0.75rem',
            'flex-wrap': 'wrap',
            'min-width': 0,
          }}>
            <strong style={{ color: '#666' }}>Log</strong>
            <span style={{ color: '#aaa' }}>{visibleLogs().length}/{logs().length}</span>
            <select
              value={tagFilter()}
              onChange={(e) => setTagFilter(e.currentTarget.value)}
              style={{ padding: '1px 4px', 'font-size': '0.75rem', 'min-width': 0, 'max-width': '120px' }}
            >
              <option value="">all tags</option>
              <For each={tagsSeen()}>{(t) => <option value={t}>[{t}]</option>}</For>
            </select>
            <label style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.25rem' }}>
              <input type="checkbox" checked={paused()} onChange={(e) => setPaused(e.currentTarget.checked)} />
              pause
            </label>
            <button
              onClick={onCopyLogs}
              style={{ 'margin-left': 'auto', padding: '1px 6px', 'font-size': '0.7rem', cursor: 'pointer', background: 'transparent', border: '1px solid #ddd', 'border-radius': '3px' }}
              title="Copy all visible logs to clipboard"
            >
              copy
            </button>
            <button
              onClick={() => setLogs([])}
              style={{ padding: '1px 6px', 'font-size': '0.7rem', cursor: 'pointer', background: 'transparent', border: '1px solid #ddd', 'border-radius': '3px' }}
            >
              clear
            </button>
          </div>
          <div style={{
            flex: 1,
            'overflow-y': 'auto',
            'font-family': 'ui-monospace, Menlo, monospace',
            'font-size': '11px',
            'line-height': 1.4,
            padding: '0.3rem 0.75rem',
          }}>
            <For each={visibleLogs()}>{(l) => (
              <div style={{ color: levelColor(l.level), 'border-bottom': '1px dotted #f0f0f0', padding: '1px 0' }}>
                <span style={{ color: '#999', 'margin-right': '0.4rem' }}>{new Date(l.at).toLocaleTimeString('en-US', { hour12: false })}</span>
                <Show when={l.tag}>
                  <span style={{ color: '#558', 'margin-right': '0.4rem' }}>[{l.tag}]</span>
                </Show>
                <span>{formatArgs(l.args)}</span>
              </div>
            )}</For>
          </div>
        </div>
      </aside>
    </>
  );
}
