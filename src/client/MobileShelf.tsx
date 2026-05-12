import { Show, type JSX } from 'solid-js';
import { ArgumentSidebar, type SidebarContent } from './ArgumentSidebar';
import type { GenerationId } from './generations';

export type MobileInteractionMode = 'select' | 'translate';

// Legacy: the drawer used to have its own tabs (commentaries / geography).
// Both moved to other surfaces — commentary became per-segment via the
// rishonim gutter icon, geography is desktop-only via the Map pill. The
// drawer now exclusively hosts the active ArgumentSidebar content.
export type MobileDrawerTab = never;

interface MobileShelfProps {
  mode: MobileInteractionMode;
  onModeChange: (m: MobileInteractionMode) => void;

  // Gutter-icon driven expansion (argument / halacha / aggadata / pesuk /
  // rabbi / rishonim).
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

// Fixed-bottom sheet on mobile. Toolbar shows interaction-mode pills
// (Select / Translate); when a sidebar content is active, the toolbar
// flips to an expansion view that renders the ArgumentSidebar inline.
export function MobileShelf(props: MobileShelfProps): JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fff',
        'border-top': '1px solid #d6d3d1',
        'box-shadow': '0 -4px 12px rgba(0, 0, 0, 0.06)',
        'z-index': 100,
        'max-height': '65vh',
        display: 'flex',
        'flex-direction': 'column',
      }}
    >
      <Show
        when={props.sidebar !== null}
        fallback={<ToolbarView {...props} />}
      >
        <ExpansionView {...props} />
      </Show>
    </div>
  );
}

function ToolbarView(props: MobileShelfProps): JSX.Element {
  const modeButtons: Array<{ id: MobileInteractionMode; label: string }> = [
    { id: 'select', label: 'Select' },
    { id: 'translate', label: 'Translate' },
  ];
  return (
    <div style={{ padding: '0.7rem 0.8rem', display: 'flex', 'flex-direction': 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {modeButtons.map((b) => (
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
              'font-size': '0.85rem',
              'font-weight': props.mode === b.id ? 600 : 400,
            }}
          >
            {b.label}
          </button>
        ))}
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
    case 'pesuk': return 'Pasuk';
    case 'rabbi': return 'Rabbi';
    case 'rishonim': return 'Rishonim';
  }
}
