import { Show, type JSX } from 'solid-js';
import { ArgumentSidebar, type SidebarContent } from './ArgumentSidebar';
import type { GenerationId } from './generations';

export type MobileInteractionMode = 'select' | 'translate';
export type MobileDrawerTab = 'commentary' | 'geography' | 'chain';

interface MobileShelfProps {
  // Interaction mode controls
  mode: MobileInteractionMode;
  onModeChange: (m: MobileInteractionMode) => void;

  // Gutter-icon driven expansion (argument / halacha / aggadata / rabbi).
  sidebar: SidebarContent | null;
  onCloseExpansion: () => void;

  // Drawer tabs — at most one is active at a time. `null` means only the
  // toolbar is showing. Tapping a toolbar button toggles its tab.
  drawerTab: MobileDrawerTab | null;
  onToggleDrawerTab: (t: MobileDrawerTab) => void;

  // Each tab's rendered content.
  commentaryChildren: JSX.Element;
  geographyChildren: JSX.Element;
  chainChildren: JSX.Element;
  // Which tabs are enabled (reflects the header toggles).
  commentaryEnabled: boolean;
  geographyEnabled: boolean;
  chainEnabled: boolean;

  // ArgumentSidebar props
  tractate: string;
  page: string;
  activeRabbi: string | null;
  onHighlightRabbi: (name: string | null) => void;
  onOpenRabbiSlug: (slug: string) => void;
  generationByName: Map<string, GenerationId>;
}

// Fixed-bottom sheet on mobile. Toolbar has interaction-mode pills (Select /
// Translate) and a row of drawer-tab buttons (Commentaries / Geography /
// Chain). An active drawer tab or a non-null sidebar turns the toolbar into
// an expansion view showing the chosen content.
export function MobileShelf(props: MobileShelfProps): JSX.Element {
  const inExpansion = () => props.sidebar !== null || props.drawerTab !== null;

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
        'max-height': '65vh',
        display: 'flex',
        'flex-direction': 'column',
      }}
    >
      <Show
        when={inExpansion()}
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
  const tabButtons: Array<{ id: MobileDrawerTab; label: string; enabled: boolean }> = [
    { id: 'commentary', label: 'Commentaries', enabled: props.commentaryEnabled },
    { id: 'geography', label: 'Geography', enabled: props.geographyEnabled },
    { id: 'chain', label: 'Chain', enabled: props.chainEnabled },
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
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {tabButtons.map((b) => (
          <button
            type="button"
            onClick={() => props.onToggleDrawerTab(b.id)}
            disabled={!b.enabled}
            style={{
              flex: 1,
              padding: '0.5rem 0.3rem',
              border: '1px solid #d6d3d1',
              background: '#fff',
              'border-radius': '6px',
              cursor: b.enabled ? 'pointer' : 'not-allowed',
              'font-family': 'inherit',
              'font-size': '0.78rem',
              color: b.enabled ? '#1a1a1a' : '#bbb',
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
  const title = () => {
    if (props.drawerTab === 'commentary') return 'Commentaries';
    if (props.drawerTab === 'geography') return 'Geography';
    if (props.drawerTab === 'chain') return 'Chain';
    return labelForSidebar(props.sidebar);
  };
  const close = () => {
    if (props.drawerTab !== null) props.onToggleDrawerTab(props.drawerTab);
    else props.onCloseExpansion();
  };
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
          {title()}
        </span>
        <button
          type="button"
          onClick={close}
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
        <Show when={props.drawerTab === 'commentary'}>{props.commentaryChildren}</Show>
        <Show when={props.drawerTab === 'geography'}>{props.geographyChildren}</Show>
        <Show when={props.drawerTab === 'chain'}>{props.chainChildren}</Show>
        <Show when={props.drawerTab === null && props.sidebar !== null}>
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
    case 'pesuk': return 'Pasuk';
    case 'rabbi': return 'Rabbi';
  }
}
