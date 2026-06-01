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
import { Show, For, createSignal, createEffect, type JSX } from 'solid-js';
import { lang, t, type CatalogKey } from '../i18n';
import { HebraizedWithRabbis } from '../rabbiLinks';
import MarkEnrichmentCards, { InspectDot } from '../MarkEnrichmentCards';
import QAPanel from '../QAPanel';

/** Per-type accent (the title color). Bodies pass `accent={ACCENTS.x}` so the
 *  six hardcoded hex values stop drifting. */
export const ACCENTS = {
  argument: '#8a2a2b',
  'argument-overview': '#8a2a2b',
  'daf-background': '#8a6d3b',
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
    case 'argument-overview': return 'sidebar.kind.argument-overview';
    case 'daf-background': return 'sidebar.kind.daf-background';
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
  /** Dev-mode 'i' affordance: opens the instance inspector focused on this
   *  section's leaf enrichment. `leafId` is the enrichment id that produced
   *  the section (e.g. 'pesukim.tanach-context'). */
  inspect?: { instanceKey: string; leafId: string };
}): JSX.Element {
  return (
    <div style={SECTION_BOX}>
      <div style={{
        ...SECTION_LABEL,
        'margin-bottom': props.spacing === 'loose' ? '0.5rem' : '0.4rem',
        display: 'flex', 'align-items': 'center', gap: '0.4rem',
      }}>
        <span>{t(props.label)}</span>
        <Show when={props.inspect}>
          {(ins) => <InspectDot instanceKey={ins().instanceKey} leafId={ins().leafId} style={{ 'margin-left': 'auto' }} />}
        </Show>
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
 * A render hint: the small, declarative description of how a piece's enrichment
 * renders in the sidebar. The end state of "generic sidebar" is that every mark
 * carries one of these (authored in the registry) instead of a bespoke `*Body`
 * component. `kind` selects the accent + chrome label; `markId` is the synthesis
 * enrichment to render; the `*Field` names say which instance fields supply the
 * heading + the instanceKey. Mark-specific chrome (chips) is passed to the
 * adapter as JSX, so it stays where its formatting lives.
 */
export interface SidebarHint {
  kind: SidebarKind;
  markId: string;
  /** instance.fields[titleField] → the heading. */
  titleField: string;
  /** instance.fields[titleHeField] → the Hebrew twin heading (optional). */
  titleHeField?: string;
  /** instance.fields[...] → the instanceKey suffix. Defaults to titleField. */
  instanceKeyField?: string;
}

export interface ResolvedSidebarHint {
  accent: string;
  title: string;
  titleHe?: string;
  markId: string;
  instanceKey: string;
}

/** Resolve a hint against an instance's fields into concrete display props. Pure
 *  (no DOM) so the render-hint vocabulary is unit-testable. */
export function resolveSidebarHint(hint: SidebarHint, fields: Record<string, unknown>): ResolvedSidebarHint {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const titleHe = hint.titleHeField ? str(fields[hint.titleHeField]) : '';
  const keyVal = str(fields[hint.instanceKeyField ?? hint.titleField]);
  return {
    accent: ACCENTS[hint.kind],
    title: str(fields[hint.titleField]),
    titleHe: titleHe || undefined,
    markId: hint.markId,
    instanceKey: `${hint.markId}:${keyVal}`,
  };
}

/**
 * Generic sidebar panel driven by a render hint: the Panel skeleton (accent +
 * heading from the hint) wrapping the synthesis card, with mark-specific chips
 * slotted above. Replaces the per-mark `*Body` boilerplate — each new mark that
 * follows the heading+chips+synthesis shape needs a hint, not a component.
 */
export function SidebarPanelFromHint(props: {
  hint: SidebarHint;
  instance: { fields: Record<string, unknown> };
  tractate: string;
  page: string;
  chips?: JSX.Element;
}): JSX.Element {
  const r = (): ResolvedSidebarHint => resolveSidebarHint(props.hint, props.instance.fields);
  return (
    <Panel accent={r().accent} title={r().title} titleHe={r().titleHe}>
      {props.chips}
      <Synthesis
        markId={r().markId}
        instance={props.instance}
        instanceKey={r().instanceKey}
        tractate={props.tractate}
        page={props.page}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Recipe-driven card: a card = header + an ordered list of SECTIONS. Each
// section is one of a few standard types or a NAMED custom block, so a card is
// described by a recipe instead of hand-coded. (See docs/framework.md / the
// "generic sidebar" roadmap item.)
// ---------------------------------------------------------------------------

/** Uniform contract every named custom block receives. `deps` is the synthesis
 *  aggregate's resolved leaf outputs (deps_resolved), keyed by enrichment id. */
export interface SpecialBlockProps {
  deps: Record<string, unknown>;
  instance: { fields: Record<string, unknown> };
  tractate: string;
  page: string;
  instanceKey: string;
}
export type SpecialBlock = (props: SpecialBlockProps) => JSX.Element;

/** One section of a card, top → bottom. */
export type SectionSpec =
  /** Accent-tinted chips from instance fields (e.g. an aggadata theme). */
  | { type: 'tags'; fields: string[] }
  /** A paragraph of an instance field, rabbi-linked + Hebraized (e.g. a summary). */
  | { type: 'prose'; field: string }
  /** The synthesis card for the recipe's mark; feeds the shared `deps`. */
  | { type: 'synthesis' }
  /** A labeled prose box rendering one dependent enrichment's `textField`. */
  | { type: 'explainer'; dep: string; textField: string; labelKey: CatalogKey }
  /** The follow-up Q&A affordance. */
  | { type: 'qa' }
  /** A genuinely-custom block, looked up by name in the card's `specialBlocks`. */
  | { type: 'special'; block: string };

export interface SidebarRecipe {
  kind: SidebarKind;
  markId: string;
  titleField: string;
  titleHeField?: string;
  titleLang?: 'en' | 'he';
  flip?: 'name' | 'rabbi';
  sections: SectionSpec[];
}

/**
 * Render a card from its recipe. Draws the Panel header, holds one shared `deps`
 * signal that the `synthesis` section fills via onResolved, then walks the
 * sections in order. The card-specific keys (`instanceKey` for the client memo,
 * `qaInstanceId` for the Q&A qualifier) and `meta` are passed by the caller
 * since they involve per-card derivation; everything else comes from the recipe.
 */
export function SidebarCardFromHint(props: {
  recipe: SidebarRecipe;
  instance: { fields: Record<string, unknown> };
  tractate: string;
  page: string;
  instanceKey: string;
  qaInstanceId?: string;
  meta?: JSX.Element;
  specialBlocks?: Record<string, SpecialBlock>;
}): JSX.Element {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const fields = (): Record<string, unknown> => props.instance.fields;
  const accent = (): string => ACCENTS[props.recipe.kind];
  const [deps, setDeps] = createSignal<Record<string, unknown>>({});
  // Reset captured leaves when the instance changes (mirrors each old body's
  // handleResolved reset) so a new instance doesn't show the previous one's deps.
  createEffect(() => { void props.instanceKey; setDeps({}); });

  const renderSection = (s: SectionSpec): JSX.Element => {
    switch (s.type) {
      case 'tags': {
        const vals = (): string[] => s.fields.map((f) => str(fields()[f])).filter(Boolean);
        return (
          <Show when={vals().length > 0}>
            <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem', 'margin-bottom': '0.7rem' }}>
              <For each={vals()}>{(v) => (
                <span style={{
                  display: 'inline-block', padding: '0.1rem 0.5rem', 'font-size': '0.7rem',
                  'text-transform': 'uppercase', 'letter-spacing': '0.06em',
                  color: accent(), background: `${accent()}14`, border: `1px solid ${accent()}40`,
                  'border-radius': '3px',
                }}>{v}</span>
              )}</For>
            </div>
          </Show>
        );
      }
      case 'prose':
        return (
          <Show when={str(fields()[s.field])}>
            <p style={{ margin: '0 0 0.8rem', color: '#333', 'line-height': 1.55 }}>
              <HebraizedWithRabbis text={str(fields()[s.field])} />
            </p>
          </Show>
        );
      case 'synthesis':
        return (
          <Synthesis
            markId={props.recipe.markId}
            instance={props.instance}
            instanceKey={props.instanceKey}
            tractate={props.tractate}
            page={props.page}
            onResolved={(r) => setDeps(r.deps_resolved ?? {})}
          />
        );
      case 'explainer': {
        const text = (): string => {
          const d = deps()[s.dep] as Record<string, unknown> | undefined;
          return d ? str(d[s.textField]) : '';
        };
        return (
          <Show when={text()}>
            <SectionCard label={s.labelKey} text={text()} inspect={{ instanceKey: props.instanceKey, leafId: s.dep }} />
          </Show>
        );
      }
      case 'qa':
        return (
          <QASection
            mark={props.recipe.markId as 'argument-move' | 'pesukim' | 'aggadata'}
            instanceId={props.qaInstanceId ?? props.instanceKey}
            instance={props.instance}
            tractate={props.tractate}
            page={props.page}
          />
        );
      case 'special': {
        const Block = props.specialBlocks?.[s.block];
        return Block ? (
          <Block deps={deps()} instance={props.instance} tractate={props.tractate} page={props.page} instanceKey={props.instanceKey} />
        ) : null;
      }
    }
  };

  return (
    <Panel
      accent={accent()}
      title={str(fields()[props.recipe.titleField])}
      titleHe={props.recipe.titleHeField ? str(fields()[props.recipe.titleHeField]) || undefined : undefined}
      titleLang={props.recipe.titleLang}
      flip={props.recipe.flip}
      meta={props.meta}
    >
      <For each={props.recipe.sections}>{renderSection}</For>
    </Panel>
  );
}

/**
 * The follow-up Q&A affordance. Thin forwarder over QAPanel so panel bodies
 * compose it from the same primitive vocabulary as the rest of the section.
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
