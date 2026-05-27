import { Show, type JSX } from 'solid-js';
import { ArgumentSidebar, type SidebarContent } from './ArgumentSidebar';
import type { GenerationId } from './generations';
import type { IdentifiedRabbi } from './dafContext';

export type MobileInteractionMode = 'read' | 'translate';

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
  onPushRabbi: (name: string) => void;
  previousLabel: string | null;
  onBack: () => void;
  dafRabbis: IdentifiedRabbi[];
  dafRabbiNames: string[];
  onOpenRabbiSlug: (slug: string) => void;
  generationByName: Map<string, GenerationId>;
  onHighlightRange?: (
    range: { start: number; end: number; key: string; tokenStart?: number; tokenEnd?: number } | null,
  ) => void;
}

// Fixed-bottom sheet on mobile. The interaction-mode bar (Read / Translate)
// is pinned at the very bottom and is ALWAYS visible so the user can switch
// modes even while reading drawer content. When a sidebar is active its
// content expands above the bar.
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
      <Show when={props.sidebar !== null}>
        <ExpansionView {...props} />
      </Show>
      <ModeBar mode={props.mode} onModeChange={props.onModeChange} />
    </div>
  );
}

const MODE_BUTTONS: Array<{ id: MobileInteractionMode; label: string; hint: string }> = [
  { id: 'read', label: 'Read', hint: 'Pan & zoom; tap icons to open' },
  { id: 'translate', label: 'Translate', hint: 'Tap words to translate' },
];

// Pinned interaction-mode pills. Stays at the bottom of the shelf regardless
// of whether a drawer is open, so mode is always switchable and visible.
function ModeBar(props: { mode: MobileInteractionMode; onModeChange: (m: MobileInteractionMode) => void }): JSX.Element {
  return (
    <div style={{
      padding: '0.6rem 0.8rem',
      display: 'flex',
      gap: '0.5rem',
      'border-top': '1px solid #eee',
      'flex-shrink': 0,
      background: '#fff',
    }}>
      {MODE_BUTTONS.map((b) => (
        <button
          type="button"
          onClick={() => props.onModeChange(b.id)}
          aria-pressed={props.mode === b.id}
          title={b.hint}
          style={{
            flex: 1,
            padding: '0.55rem 0.4rem',
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
  );
}

function ExpansionView(props: MobileShelfProps): JSX.Element {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', flex: 1, 'min-height': 0 }}>
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
          onPushRabbi={props.onPushRabbi}
          previousLabel={props.previousLabel}
          onBack={props.onBack}
          dafRabbis={props.dafRabbis}
          dafRabbiNames={props.dafRabbiNames}
          onHighlightRange={props.onHighlightRange}
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
    case 'place': return 'Place';
    case 'voice-group': return 'Voice';
    case 'rishonim': return 'Rishonim';
    case 'argument-overview': return 'Argument map';
  }
}
