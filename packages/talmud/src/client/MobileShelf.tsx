import { Button } from '@corpus/ui/Button';
import './reader-controls.css';
import { BottomSheet } from '@corpus/ui/BottomSheet';
import { type JSX, Show } from 'solid-js';
import type { Term } from '../lib/terms/registry';
import { ArgumentSidebar, type GeographyExtras, type SidebarContent } from './ArgumentSidebar';
import DafLoadProgress from './DafLoadProgress';
import type { IdentifiedRabbi } from './dafContext';
import type { GenerationId } from './generations';
import { t } from './i18n';
import type { Section } from './shapes';
import { tutorialNoteInteractive } from './tutorial';

interface MobileShelfProps {
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
  glossaryTerms: Term[];
  onOpenRabbiSlug: (slug: string) => void;
  generationByName: Map<string, GenerationId>;
  dafSections?: Section[];
  onOpenArgument?: (index: number) => void;
  onFocusSection?: (index: number) => void;
  onHighlightRange?: (
    range: {
      start: number;
      end: number;
      key: string;
      tokenStart?: number;
      tokenEnd?: number;
    } | null,
  ) => void;

  /** Whole-daf geography card's model + interaction callbacks. Forwarded to the
   *  ArgumentSidebar so the kind:'geography' card (opened via the chip, like
   *  every other whole-daf chip) renders through the standard sidebar. */
  geography?: GeographyExtras;
}

// Fixed-bottom sheet on mobile. When a sidebar is active its content
// expands here; otherwise only the daf-load progress shows, and only while
// something is loading.
export function MobileShelf(props: MobileShelfProps): JSX.Element {
  return (
    <BottomSheet tour="note-panel" zIndex={tutorialNoteInteractive() ? 6001 : 100}>
      <Show when={props.sidebar !== null}>
        <ExpansionView {...props} />
      </Show>
      {/* Daf-load progress lives here on mobile so it never sits on top of
          the daf text. Self-hides when nothing's loading, so it adds no height
          when idle. */}
      <div style={{ padding: '0 0.8rem', 'flex-shrink': 0 }}>
        <DafLoadProgress embedded />
      </div>
    </BottomSheet>
  );
}

function ExpansionView(props: MobileShelfProps): JSX.Element {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', flex: 1, 'min-height': 0 }}>
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          padding: '0.5rem 0.75rem',
          'border-bottom': '1px solid var(--line)',
        }}
      >
        <span
          style={{
            'font-size': '0.8rem',
            color: 'var(--muted)',
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
          }}
        >
          {labelForSidebar(props.sidebar)}
        </span>
        <Button
          class="reader-shelf-close"
          onClick={props.onCloseExpansion}
          aria-label={t('common.close')}
        >
          ×
        </Button>
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
          glossaryTerms={props.glossaryTerms}
          onHighlightRange={props.onHighlightRange}
          onOpenRabbiSlug={props.onOpenRabbiSlug}
          generationByName={props.generationByName}
          dafSections={props.dafSections}
          onOpenArgument={props.onOpenArgument}
          onFocusSection={props.onFocusSection}
          geography={props.geography}
        />
      </div>
    </div>
  );
}

function labelForSidebar(s: SidebarContent | null): string {
  if (!s) return '';
  // The map-first Overview (opened from a section's Argument icon) reads as
  // that section's argument, not as the whole-daf overview.
  if (s.kind === 'argument-overview' && s.mapFirst) return t('sidebar.kind.argument');
  return t(`sidebar.kind.${s.kind}`);
}
