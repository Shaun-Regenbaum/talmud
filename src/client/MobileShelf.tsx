import { Show, type JSX } from 'solid-js';
import { ArgumentSidebar, type SidebarContent } from './ArgumentSidebar';
import type { GenerationId } from './generations';

export type MobileInteractionMode = 'pointer' | 'select' | 'translate';

interface MobileShelfProps {
  // Interaction mode controls
  mode: MobileInteractionMode;
  onModeChange: (m: MobileInteractionMode) => void;

  // Expansion content — when `sidebar` is non-null the shelf replaces its
  // toolbar with the sidebar content.
  sidebar: SidebarContent | null;
  onCloseExpansion: () => void;

  // ArgumentSidebar props
  tractate: string;
  page: string;
  activeRabbi: string | null;
  onHighlightRabbi: (name: string | null) => void;
  onOpenRabbiSlug: (slug: string) => void;
  generationByName: Map<string, GenerationId>;
}

// Fixed-bottom sheet on mobile. Default state shows 3 interaction mode
// buttons (pointer / select / translate). When a gutter icon fires
// (argument / halacha / aggadata) the sidebar signal becomes non-null and
// the shelf swaps its toolbar for the matching ArgumentSidebar content.
// Closing the expansion reverts to the toolbar with the previously-selected
// mode still active.
export function MobileShelf(props: MobileShelfProps): JSX.Element {
  const inExpansion = () => props.sidebar !== null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        'background': '#fff',
        'border-top': '1px solid #d6d3d1',
        'box-shadow': '0 -4px 12px rgba(0, 0, 0, 0.06)',
        'z-index': 100,
        'max-height': '55vh',
        display: 'flex',
        'flex-direction': 'column',
      }}
    >
      <Show when={inExpansion()} fallback={<ToolbarView mode={props.mode} onModeChange={props.onModeChange} />}>
        <ExpansionView {...props} />
      </Show>
    </div>
  );
}

function ToolbarView(props: { mode: MobileInteractionMode; onModeChange: (m: MobileInteractionMode) => void }): JSX.Element {
  const buttons: Array<{ id: MobileInteractionMode; label: string; hint: string; icon: string }> = [
    { id: 'pointer', label: 'Pan', hint: 'Pan and zoom only', icon: '✋' },
    { id: 'select', label: 'Select', hint: 'Select text to copy', icon: '▯' },
    { id: 'translate', label: 'Translate', hint: 'Tap a word to translate', icon: '✎' },
  ];
  return (
    <div style={{ padding: '0.7rem 0.8rem', display: 'flex', 'flex-direction': 'column', gap: '0.55rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {buttons.map((b) => (
          <button
            type="button"
            onClick={() => props.onModeChange(b.id)}
            style={{
              flex: 1,
              padding: '0.6rem 0.4rem',
              border: props.mode === b.id ? '2px solid #8a2a2b' : '1px solid #d6d3d1',
              background: props.mode === b.id ? '#fff7e6' : '#fff',
              'border-radius': '6px',
              cursor: 'pointer',
              'font-family': 'inherit',
              display: 'flex',
              'flex-direction': 'column',
              'align-items': 'center',
              gap: '0.2rem',
              'font-size': '0.78rem',
            }}
          >
            <span style={{ 'font-size': '1.1rem' }}>{b.icon}</span>
            <span style={{ 'font-weight': props.mode === b.id ? 600 : 400 }}>{b.label}</span>
          </button>
        ))}
      </div>
      <div style={{ 'text-align': 'center', color: '#888', 'font-size': '0.7rem' }}>
        {buttons.find((b) => b.id === props.mode)?.hint}
      </div>
    </div>
  );
}

function ExpansionView(props: MobileShelfProps): JSX.Element {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', 'min-height': 0 }}>
      <div style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        padding: '0.5rem 0.75rem',
        'border-bottom': '1px solid #eee',
      }}>
        <span style={{ 'font-size': '0.8rem', color: '#666', 'text-transform': 'uppercase', 'letter-spacing': '0.05em' }}>
          {labelForSidebar(props.sidebar)}
        </span>
        <button
          type="button"
          onClick={props.onCloseExpansion}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            'font-size': '1.1rem',
            padding: '0.25rem 0.5rem',
            color: '#666',
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, 'min-height': 0, overflow: 'auto', padding: '0.5rem 0.75rem' }}>
        <Show when={props.sidebar !== null}>
          <ArgumentSidebar
            content={props.sidebar}
            tractate={props.tractate}
            page={props.page}
            activeRabbi={props.activeRabbi}
            onClose={props.onCloseExpansion}
            onHighlightRabbi={props.onHighlightRabbi}
            onOpenRabbiSlug={props.onOpenRabbiSlug}
            generationByName={props.generationByName}
          />
        </Show>
      </div>
    </div>
  );
}

function labelForSidebar(s: SidebarContent | null): string {
  if (!s) return '';
  switch (s.kind) {
    case 'argument': return 'Argument';
    case 'halacha': return 'Halacha';
    case 'aggadata': return 'Aggadata';
    case 'rabbi': return 'Rabbi';
  }
}
