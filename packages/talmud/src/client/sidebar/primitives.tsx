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
import { createEffect, createSignal, For, type JSX, Show } from 'solid-js';
import { type CatalogKey, lang, t } from '../i18n';
import MarkEnrichmentCards, { InspectDot } from '../MarkEnrichmentCards';
import QAPanel from '../QAPanel';
import { HebraizedWithRabbis } from '../rabbiLinks';

/** Per-type accent (the title color). Bodies pass `accent={ACCENTS.x}` so the
 *  six hardcoded hex values stop drifting. */
export const ACCENTS = {
  argument: '#8a2a2b',
  'argument-overview': '#8a2a2b',
  'daf-background': '#8a6d3b',
  tidbit: '#2f6b66',
  biyun: '#3f4ea0',
  geography: '#1e40af',
  halacha: '#1e40af',
  chart: '#0e7490',
  aggadata: '#7c3aed',
  yerushalmi: '#0f766e',
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
    case 'argument':
      return 'sidebar.kind.argument';
    case 'argument-overview':
      return 'sidebar.kind.argument-overview';
    case 'daf-background':
      return 'sidebar.kind.daf-background';
    case 'tidbit':
      return 'sidebar.kind.tidbit';
    case 'biyun':
      return 'sidebar.kind.biyun';
    case 'geography':
      return 'sidebar.kind.geography';
    case 'halacha':
      return 'sidebar.kind.halacha';
    case 'chart':
      return 'sidebar.kind.chart';
    case 'aggadata':
      return 'sidebar.kind.aggadata';
    case 'yerushalmi':
      return 'sidebar.kind.yerushalmi';
    case 'pesuk':
      return 'sidebar.kind.pesuk';
    case 'place':
      return 'sidebar.kind.place';
    case 'rishonim':
      return 'sidebar.kind.rishonim';
    case 'voice-group':
      return 'sidebar.kind.voice-group';
    case 'rabbi':
      return 'sidebar.kind.rabbi';
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

export const HE_FONT = '"Mekorot Vilna", serif';
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
  // CatalogKey for literal call-sites (keeps autocomplete); a recipe's labelKey
  // arrives as a plain string — t() resolves known keys and falls back otherwise.
  label: CatalogKey | (string & {});
  spacing?: 'tight' | 'loose';
  text?: string;
  children?: JSX.Element;
  /** Dev-mode 'i' affordance: opens the instance inspector focused on this
   *  section's leaf enrichment. `leafId` is the enrichment id that produced
   *  the section (e.g. 'pesukim.tanach-context'). */
  inspect?: { instanceKey: string; leafId: string };
  /** When set, the body is collapsible behind the label. `true` starts
   *  collapsed (the "dig deeper" default for explainer cards), `false` starts
   *  open but still toggleable. Omitted → the original always-open card. */
  collapsed?: boolean;
}): JSX.Element {
  // Signal-driven (not native <details>) so the inspect 'i' — which lives in the
  // label row and stops propagation — never toggles the fold.
  const collapsible = (): boolean => props.collapsed != null;
  const [open, setOpen] = createSignal(props.collapsed !== true);
  const labelRow = (): JSX.Element => (
    <div
      style={{
        ...SECTION_LABEL,
        'margin-bottom': open() ? (props.spacing === 'loose' ? '0.5rem' : '0.4rem') : 0,
        display: 'flex',
        'align-items': 'center',
        gap: '0.4rem',
      }}
    >
      <Show when={collapsible()}>
        <span
          style={{
            color: '#bbb',
            'font-size': '0.7rem',
            width: '0.7rem',
            display: 'inline-block',
            transform: open() ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.12s',
          }}
        >
          ▸
        </span>
      </Show>
      <span>{t(props.label)}</span>
      <Show when={props.inspect}>
        {(ins) => (
          <InspectDot
            instanceKey={ins().instanceKey}
            leafId={ins().leafId}
            style={{ 'margin-left': 'auto' }}
          />
        )}
      </Show>
    </div>
  );
  const body = (): JSX.Element => (
    <Show when={props.text != null} fallback={props.children}>
      <div style={SECTION_PROSE}>
        <HebraizedWithRabbis text={props.text!} />
      </div>
    </Show>
  );
  return (
    <div style={SECTION_BOX}>
      <Show
        when={collapsible()}
        fallback={
          <>
            {labelRow()}
            {body()}
          </>
        }
      >
        {/* clickable label toggles; the inspect 'i' inside stops propagation */}
        {/* biome-ignore lint/a11y/useSemanticElements: the label row nests the inspect 'i' button; a native button cannot contain another button */}
        <div
          onClick={() => setOpen((v) => !v)}
          role="button"
          tabIndex={0}
          aria-expanded={open()}
          onKeyDown={(e) => {
            // Only the wrapper itself toggles — a keydown bubbled up from the
            // focused inspect 'i' button must not also flip the fold.
            if (e.currentTarget !== e.target) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
          style={{ cursor: 'pointer', 'user-select': 'none' }}
        >
          {labelRow()}
        </div>
        <Show when={open()}>{body()}</Show>
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
      {/* No title → the card owns its header via a special section (e.g. pasuk). */}
      <Show when={primary()}>
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
            style={{
              margin: '0 0 0.3rem',
              'font-size': '1.05rem',
              color: props.accent,
              'font-family': HE_FONT,
            }}
          >
            {primary()}
          </h3>
        </Show>
      </Show>
      <Show when={secondary()}>
        <Show
          when={secondaryIsHe()}
          fallback={
            <p style={{ margin: '0 0 0.5rem', 'font-size': '0.95rem', color: '#666' }}>
              {secondary()}
            </p>
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
  onResolved?: (r: {
    deps_resolved?: Record<string, unknown>;
    anchors_resolved?: Record<string, unknown>;
  }) => void;
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
export function resolveSidebarHint(
  hint: SidebarHint,
  fields: Record<string, unknown>,
): ResolvedSidebarHint {
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
/** A reader-text highlight request, threaded sidebar → reader (the same shape
 *  argument-move / rabbi cards use). */
export type HighlightRange = {
  start: number;
  end: number;
  key: string;
  tokenStart?: number;
  tokenEnd?: number;
};

export interface SpecialBlockProps {
  deps: Record<string, unknown>;
  /** The synthesis aggregate's resolved ANCHOR outputs (anchors_resolved), keyed
   *  by mark id — e.g. the argument card's `argument-move` instances. Distinct
   *  from `deps` (leaf enrichments); empty until the synthesis resolves. */
  anchors: Record<string, unknown>;
  /** True once the recipe's synthesis section has resolved (cache hit or fresh).
   *  Lets a block distinguish "still loading" from "settled, no data" — a `deps`
   *  bag is `{}` in both states, so it can't tell them apart on its own. */
  synthesisResolved: boolean;
  instance: { fields: Record<string, unknown> };
  tractate: string;
  page: string;
  instanceKey: string;
  /** Optional reader-highlight channel for blocks that drive daf highlighting
   *  (rabbi lineage/geography, future voices). Undefined for cards that don't. */
  onHighlightRange?: (range: HighlightRange | null) => void;
  /** Optional card-specific context a block needs beyond the standard contract
   *  (e.g. rabbi's `generationByName` map). Opaque to the renderer. */
  extras?: Record<string, unknown>;
}
export type SpecialBlock = (props: SpecialBlockProps) => JSX.Element;

// The recipe shape (SectionSpec / SidebarRecipe) now lives in src/lib/sidebar/
// recipe.ts so the worker mark definition can carry it. Re-exported here so the
// many `from './sidebar/primitives'` importers keep working.
import type { SectionSpec, SidebarRecipe } from '@corpus/core/sidebar/recipe';

export type { SectionSpec, SidebarRecipe } from '@corpus/core/sidebar/recipe';

/** A flat, render-ready description of a recipe for the dev shelf's Recipe panel.
 *  Pure (no reactivity) so it's unit-testable and the panel needn't know the
 *  SectionSpec union internals. */
export interface RecipeSectionInfo {
  n: number;
  type: SectionSpec['type'];
  /** What the section pulls from — field name(s), the dep/leaf id, or the block
   *  name. null for self-contained sections (synthesis, qa). */
  target: string | null;
  /** A special block's declared dependent leaf ids (its inputs). */
  inputs?: string[];
  /** What this section's inspect 'i' opens in the bottom drawer — a leaf id, or
   *  null for the synthesis/instance view (where the mark extraction lives).
   *  `null` (the whole field) means the section has no inspectable source (qa). */
  inspect: { leafId: string | null } | null;
  /** True only for `special` blocks: genuinely-custom code, not a standard type. */
  custom: boolean;
}
export interface RecipeInfo {
  kind: string;
  markId: string;
  header: string;
  sections: RecipeSectionInfo[];
}
export function describeRecipe(recipe: SidebarRecipe): RecipeInfo {
  const header = recipe.titleField
    ? recipe.titleHeField
      ? `${recipe.titleField} / ${recipe.titleHeField}`
      : recipe.titleField
    : '(custom header)';
  const sections = recipe.sections.map((s, i): RecipeSectionInfo => {
    const n = i + 1;
    // tags/prose render fields off the mark instance → their provenance is the
    // extraction, surfaced as the synthesis/instance view (leafId null).
    switch (s.type) {
      case 'tags':
        return {
          n,
          type: s.type,
          target: s.fields.join(', '),
          inspect: { leafId: null },
          custom: false,
        };
      case 'prose':
        return { n, type: s.type, target: s.field, inspect: { leafId: null }, custom: false };
      case 'synthesis':
        return { n, type: s.type, target: null, inspect: { leafId: null }, custom: false };
      case 'explainer':
        return { n, type: s.type, target: s.dep, inspect: { leafId: s.dep }, custom: false };
      case 'qa':
        return { n, type: s.type, target: null, inspect: null, custom: false };
      default:
        return {
          n,
          type: s.type,
          target: s.block,
          inputs: s.deps,
          inspect: s.deps && s.deps.length > 0 ? { leafId: s.deps[0] } : { leafId: null },
          custom: true,
        };
    }
  });
  return { kind: recipe.kind, markId: recipe.markId, header, sections };
}

/** The currently-open sidebar card, published for the dev shelf's Recipe panel:
 *  its recipe + the `instanceKey` (so each panel row's inspect 'i' can target the
 *  drawer for this exact instance). null when no card is open OR the open card is
 *  still a bespoke (un-converted) *Body — so the panel doubles as a conversion
 *  scoreboard. ArgumentSidebar's dispatch is the single writer (CARD_DEFS). */
export interface ActiveCard {
  recipe: SidebarRecipe;
  instanceKey: string;
}
const [activeCardSig, setActiveCardSig] = createSignal<ActiveCard | null>(null);
export function activeCard(): ActiveCard | null {
  return activeCardSig();
}
export function setActiveCard(c: ActiveCard | null): void {
  setActiveCardSig(c);
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
  /** The shape sent to the mark synthesis as mark_input, when it differs from the
   *  display `instance` (e.g. rabbi's flat {name,…} vs the {fields} display
   *  shape). Defaults to `instance`. Keeps the mark_input — and its cache — stable
   *  across a recipe conversion. */
  synthInstance?: unknown;
  /** Reader-highlight channel + card-specific extras, forwarded to special blocks. */
  onHighlightRange?: (range: HighlightRange | null) => void;
  extras?: Record<string, unknown>;
}): JSX.Element {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const fields = (): Record<string, unknown> => props.instance.fields;
  const accent = (): string => ACCENTS[props.recipe.kind as SidebarKind] ?? '#222';
  const [deps, setDeps] = createSignal<Record<string, unknown>>({});
  // The synthesis aggregate's resolved ANCHOR outputs (anchors_resolved), keyed
  // by mark id — distinct from `deps` (leaf enrichments). Carries e.g. the
  // argument card's `argument-move` instances to its detail block.
  const [anchors, setAnchors] = createSignal<Record<string, unknown>>({});
  // True once the synthesis has resolved (cache hit or fresh). A `prose` section
  // with `untilSynthesis` shows only until then — the instant `summary` field
  // fills the slot, then the richer synthesis paragraph replaces it. Also handed
  // to special blocks so they can tell "loading" from "settled, no data".
  const [synthesisReady, setSynthesisReady] = createSignal(false);
  // Reset captured leaves/anchors + the synthesis-ready flag when the instance
  // changes (mirrors each old body's handleResolved reset) so a new instance
  // doesn't show the previous one's deps or skip its placeholder.
  createEffect(() => {
    void props.instanceKey;
    setDeps({});
    setAnchors({});
    setSynthesisReady(false);
  });

  const renderSection = (s: SectionSpec): JSX.Element => {
    switch (s.type) {
      case 'tags': {
        const dropped = new Set((s.drop ?? []).map((d) => d.toLowerCase()));
        const vals = (): string[] =>
          s.fields.map((f) => str(fields()[f])).filter((v) => v && !dropped.has(v.toLowerCase()));
        return (
          <Show when={vals().length > 0}>
            <div
              style={{
                display: 'flex',
                'flex-wrap': 'wrap',
                gap: '0.3rem',
                'margin-bottom': '0.7rem',
              }}
            >
              <For each={vals()}>
                {(v) => (
                  // Neutral & quiet: a theme tag is a coarse, not-fully-trusted
                  // label, so it stays unobtrusive — muted gray, faint fill,
                  // hairline border. Title-case so single-word themes read cleanly.
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.1rem 0.5rem',
                      'font-size': '0.7rem',
                      'text-transform': 'capitalize',
                      'letter-spacing': '0.02em',
                      color: '#777',
                      background: '#f5f5f4',
                      border: '1px solid #e8e8e6',
                      'border-radius': '3px',
                    }}
                  >
                    {v}
                  </span>
                )}
              </For>
            </div>
          </Show>
        );
      }
      case 'prose':
        return (
          <Show when={str(fields()[s.field]) && !(s.untilSynthesis && synthesisReady())}>
            <p style={{ margin: '0 0 0.8rem', color: '#333', 'line-height': 1.55 }}>
              <HebraizedWithRabbis text={str(fields()[s.field])} />
            </p>
          </Show>
        );
      case 'synthesis':
        return (
          <Synthesis
            markId={props.recipe.markId}
            instance={props.synthInstance ?? props.instance}
            instanceKey={props.instanceKey}
            tractate={props.tractate}
            page={props.page}
            onResolved={(r) => {
              setDeps(r.deps_resolved ?? {});
              setAnchors(r.anchors_resolved ?? {});
              setSynthesisReady(true);
            }}
          />
        );
      case 'explainer': {
        const text = (): string => {
          const d = deps()[s.dep] as Record<string, unknown> | undefined;
          return d ? str(d[s.textField]) : '';
        };
        return (
          <Show when={text()}>
            <SectionCard
              label={s.labelKey}
              text={text()}
              inspect={{ instanceKey: props.instanceKey, leafId: s.dep }}
              collapsed={!s.defaultOpen}
            />
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
          <Block
            deps={deps()}
            anchors={anchors()}
            synthesisResolved={synthesisReady()}
            instance={props.instance}
            tractate={props.tractate}
            page={props.page}
            instanceKey={props.instanceKey}
            onHighlightRange={props.onHighlightRange}
            extras={props.extras}
          />
        ) : null;
      }
    }
  };

  return (
    <Panel
      accent={accent()}
      title={props.recipe.titleField ? str(fields()[props.recipe.titleField]) : ''}
      titleHe={
        props.recipe.titleHeField
          ? str(fields()[props.recipe.titleHeField]) || undefined
          : undefined
      }
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
