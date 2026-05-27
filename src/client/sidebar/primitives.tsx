/**
 * Sidebar section primitives — the closed vocabulary every enrichment panel
 * composes from. The goal (see plans/sidebar standardization) is that a panel
 * body reads as a thin, explicit composition:
 *
 *   <Panel accent={ACCENTS.aggadata} title={story.title} titleHe={story.titleHe}>
 *     <Synthesis markId="aggadata" ... />
 *     <SectionCard label="aggadata.background" text={bg().background} />
 *     <QASection mark="aggadata" ... />
 *   </Panel>
 *
 * Consistency + bilingual correctness come from these blocks, not from a config
 * registry: `SectionCard`/`Panel` accept catalog *keys* (not raw strings) so a label
 * can't silently ship untranslated, and the rabbi name-flip is a declared
 * `flip` policy rather than per-body branching.
 *
 * Boundary note: the type-agnostic chrome (back button, the "KIND · tractate
 * page" line, the close button) stays in ArgumentSidebar's container — it is
 * already shared there. `Panel` owns only the per-type title block, which is
 * what was duplicated/divergent across the bodies.
 */
import { Show, type JSX } from 'solid-js';
import { lang, t, type CatalogKey } from '../i18n';
import { HebraizedWithRabbis } from '../rabbiLinks';
import MarkEnrichmentCards from '../MarkEnrichmentCards';
import QAPanel from '../QAPanel';

/** Per-type accent (the title color). Bodies pass `accent={ACCENTS.x}` so the
 *  six hardcoded hex values stop drifting. */
export const ACCENTS = {
  argument: '#8a2a2b',
  halacha: '#1e40af',
  aggadata: '#7c3aed',
  pesuk: '#9a3412',
  rishonim: '#475569',
  rabbi: '#222',
  place: '#222',
  'voice-group': '#222',
} as const;

export type SidebarKind = keyof typeof ACCENTS;

/** The catalog key for a kind's chrome label ("Aggada", "Rishonim", …). Replaces
 *  the long ternary in the container header. */
export function kindLabelKey(kind: SidebarKind): CatalogKey {
  switch (kind) {
    case 'argument': return 'sidebar.kind.argument';
    case 'halacha': return 'sidebar.kind.halacha';
    case 'aggadata': return 'sidebar.kind.aggadata';
    case 'pesuk': return 'sidebar.kind.pesuk';
    case 'place': return 'sidebar.kind.place';
    case 'rishonim': return 'sidebar.kind.rishonim';
    case 'voice-group': return 'sidebar.kind.voice-group';
    case 'rabbi': return 'sidebar.kind.rabbi';
  }
}

// — shared style fragments (single source of truth for the repeated blocks) —

const SECTION_BOX: JSX.CSSProperties = {
  border: '1px solid #eae8e0',
  'border-radius': '6px',
  background: '#fafaf7',
  padding: '0.7rem 0.85rem',
  'margin-top': '0.7rem',
};

const SECTION_LABEL: JSX.CSSProperties = {
  'font-size': '0.7rem',
  'text-transform': 'uppercase',
  'letter-spacing': '0.08em',
  color: '#888',
};

const SECTION_PROSE: JSX.CSSProperties = {
  'font-size': '0.88rem',
  color: '#222',
  'line-height': 1.55,
};

const HE_FONT = '"Mekorot Vilna", serif';
// Tanakh verses carry cantillation; widen the fallback chain so a reader
// without Mekorot still gets correct mark placement.
const HE_FONT_TANAKH =
  '"Mekorot Vilna", "Cardo", "SBL Hebrew", "Taamey Frank CLM", "Frank Ruehl CLM", "Times New Roman", "Times", serif';

/**
 * RTL Hebrew prose in the Vilna serif. `text` runs through the rabbi-link
 * hebraizer; `children` is for pre-styled runs (e.g. a verse's dim prev/next
 * spans). `variant="tanakh"` widens the font fallback for cantillation.
 */
export function HebrewProse(props: {
  text?: string;
  children?: JSX.Element;
  variant?: 'default' | 'tanakh';
  size?: string;
  color?: string;
  margin?: string;
  lineHeight?: number;
}): JSX.Element {
  return (
    <p
      dir="rtl"
      lang="he"
      style={{
        margin: props.margin ?? '0 0 0.5rem',
        'font-family': props.variant === 'tanakh' ? HE_FONT_TANAKH : HE_FONT,
        'font-size': props.size ?? '1rem',
        color: props.color ?? '#666',
        ...(props.lineHeight ? { 'line-height': props.lineHeight } : {}),
      }}
    >
      {props.text != null ? <HebraizedWithRabbis text={props.text} /> : props.children}
    </p>
  );
}

/**
 * A labeled card — the #fafaf7 box used for every leaf section. Pass `text` for
 * the common inline-hebraized prose body, or `children` for custom content
 * (chip lists, dispute rows). `spacing` controls the label→body gap; default
 * 'tight' (0.4rem) is the canonical value, 'loose' (0.5rem) is a bridge for
 * halacha until harmonized.
 */
export function SectionCard(props: {
  label: CatalogKey;
  spacing?: 'tight' | 'loose';
  text?: string;
  children?: JSX.Element;
}): JSX.Element {
  return (
    <div style={SECTION_BOX}>
      <div style={{ ...SECTION_LABEL, 'margin-bottom': props.spacing === 'loose' ? '0.5rem' : '0.4rem' }}>
        {t(props.label)}
      </div>
      <Show when={props.text != null} fallback={props.children}>
        <div style={SECTION_PROSE}>
          <HebraizedWithRabbis text={props.text!} />
        </div>
      </Show>
    </div>
  );
}

/**
 * The per-type title block: accent-colored title, optional Hebrew twin, an
 * optional meta slot (rabbi generation/region, rishonim counts), then the
 * sections region (children). `flip='rabbi'` swaps primary/secondary by lang so
 * the rabbi panel leads with the Hebrew name in he mode; every other type uses
 * the default (title primary, Hebrew twin as subtitle).
 */
export function Panel(props: {
  accent: string;
  title: string;
  /** The title's own language. 'he' (e.g. a pasuk's verse reference) renders
   *  the heading itself RTL in the Vilna serif. Default 'en'. */
  titleLang?: 'en' | 'he';
  titleHe?: string;
  flip?: 'name' | 'rabbi';
  meta?: JSX.Element;
  children?: JSX.Element;
}): JSX.Element {
  const flipped = () => props.flip === 'rabbi' && lang() === 'he' && !!props.titleHe;
  const primary = () => (flipped() ? props.titleHe! : props.title);
  const primaryIsHe = () => props.titleLang === 'he' || flipped();
  const secondary = () => (flipped() ? props.title : props.titleHe);
  // The secondary line is Hebrew unless we flipped (then it's the Latin name).
  const secondaryIsHe = () => !flipped();

  return (
    <div>
      <Show
        when={primaryIsHe()}
        fallback={
          <h3 style={{ margin: '0 0 0.3rem', 'font-size': '1.05rem', color: props.accent }}>
            {primary()}
          </h3>
        }
      >
        <h3
          dir="rtl"
          lang="he"
          style={{ margin: '0 0 0.3rem', 'font-size': '1.05rem', color: props.accent, 'font-family': HE_FONT }}
        >
          {primary()}
        </h3>
      </Show>
      <Show when={secondary()}>
        <Show
          when={secondaryIsHe()}
          fallback={
            <p style={{ margin: '0 0 0.5rem', 'font-size': '0.95rem', color: '#666' }}>{secondary()}</p>
          }
        >
          <HebrewProse>{secondary()}</HebrewProse>
        </Show>
      </Show>
      {props.meta}
      {props.children}
    </div>
  );
}

/**
 * The synthesis card. Paper-thin forwarder over MarkEnrichmentCards (which owns
 * the fetch/render and hands leaves back via onResolved). Exists as a stable
 * name in the composition and a future seam for per-enrichment renderers.
 */
export function Synthesis(props: {
  markId: string;
  instance: unknown;
  instanceKey: string;
  tractate: string;
  page: string;
  onResolved?: (r: { deps_resolved?: Record<string, unknown>; anchors_resolved?: Record<string, unknown> }) => void;
}): JSX.Element {
  return (
    <MarkEnrichmentCards
      markId={props.markId}
      instance={props.instance}
      instanceKey={props.instanceKey}
      tractate={props.tractate}
      page={props.page}
      onResolved={props.onResolved}
    />
  );
}

/**
 * The follow-up Q&A affordance. Thin forwarder over QAPanel using only the
 * current (non-deprecated) prop names, so once every body routes through here
 * QAPanel's legacy moveId/moveInstance props can be deleted.
 */
export function QASection(props: {
  mark: 'argument-move' | 'pesukim' | 'aggadata';
  instanceId: string;
  instance: unknown;
  tractate: string;
  page: string;
}): JSX.Element {
  return (
    <QAPanel
      mark={props.mark}
      instanceId={props.instanceId}
      instance={props.instance}
      tractate={props.tractate}
      page={props.page}
    />
  );
}
