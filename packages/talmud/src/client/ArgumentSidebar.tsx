// Recipes now live in the shared lib (carried on the worker mark def too).
// Re-exported so existing importers (CARD_DEFS, tests) keep their `from
// './ArgumentSidebar'` path.

import {
  AGGADATA_RECIPE,
  ARGUMENT_OVERVIEW_RECIPE,
  ARGUMENT_RECIPE,
  BIYUN_RECIPE,
  CHART_RECIPE,
  DAF_BACKGROUND_RECIPE,
  GEOGRAPHY_RECIPE,
  HALACHA_RECIPE,
  PASUK_RECIPE,
  RABBI_RECIPE,
  RISHONIM_RECIPE,
  TIDBIT_RECIPE,
  YERUSHALMI_RECIPE,
} from '@corpus/core/sidebar/recipe';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  type JSX,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import { selectSectionMoves } from '../lib/argumentMoves';
import type { SectionExit } from '../lib/context/sectionExits';
import type { DafGeoModel } from '../lib/geographyModel';
import { type DerivationSource, parseBavliRef } from '../lib/halacha/codifiers';
import { adjacentAmud } from '../lib/sefref/amudim';
import { dafRefHe, pageLabelHe } from '../lib/sefref/tractates';
import type { Term } from '../lib/terms/registry';
import { voicesMapEligible, voicesShowFallback, voicesShowMap } from '../lib/typing/profile';
import {
  buildStatementSpine,
  type StatementSpine as StatementSpineData,
} from '../lib/typing/statementSpine';
import { deriveVoiceEdges } from '../lib/typing/voices';
import ArgumentFlowGraph, { type FlowConnection } from './ArgumentFlowGraph';
import ArgumentNarrative from './ArgumentNarrative';
import type { ArgumentVoicesData } from './ArgumentVoiceMap';
import { type BackgroundGroup, orderBackgroundGroups } from './backgroundGroups';
import { ChartTableView } from './ChartTableView';
import CodificationMap from './CodificationMap';
import { buildConceptMatcher, ConceptLinkProvider } from './conceptLinks';
import type { IdentifiedRabbi } from './dafContext';
import { type CodificationData, codeMapFromCodification, SIDE_COLOR } from './flow/codeMapLayout';
import { GeographyMap } from './GeographyMap';
import { GENERATION_BY_ID, type GenerationId, generationLabelHe } from './generations';
import { Hebraized } from './Hebraized';
import { type CatalogKey, lang, t } from './i18n';
import { CorpusBadge } from './LinkRef';
import { InspectDot, registerMarkRenderer } from './MarkEnrichmentCards';
import type { GeographyData, GeographyEvidence } from './RabbiGeographyCard';
import RabbiLineageTree, {
  type RelationshipsData,
  type RelationshipsEvidence,
} from './RabbiLineageTree';
import RabbiObservations from './RabbiObservations';
import RabbiTrajectoryMap, { type LocationInference } from './RabbiTrajectoryMap';
import { HebraizedWithRabbis, RabbiLinkProvider } from './rabbiLinks';
import { StatementSpine } from './StatementSpine';
import type {
  AggadataStory,
  ChartTable,
  HalachaTopic,
  Pasuk,
  Rabbi,
  Section,
  YerushalmiParallel,
} from './shapes';
import {
  ACCENTS,
  HE_FONT,
  HebrewProse,
  kindLabelKey,
  Panel,
  QASection,
  SectionCard,
  SidebarCardFromHint,
  type SidebarHint,
  SidebarPanelFromHint,
  type SidebarRecipe,
  type SpecialBlockProps,
  Synthesis,
  setActiveCard,
} from './sidebar/primitives';

export {
  AGGADATA_RECIPE,
  ARGUMENT_OVERVIEW_RECIPE,
  ARGUMENT_RECIPE,
  BIYUN_RECIPE,
  DAF_BACKGROUND_RECIPE,
  GEOGRAPHY_RECIPE,
  HALACHA_RECIPE,
  PASUK_RECIPE,
  RABBI_RECIPE,
  RISHONIM_RECIPE,
  TIDBIT_RECIPE,
  YERUSHALMI_RECIPE,
};

/** Localize an era date-range ("c. 290 – 320 CE") for Hebrew display. */
function eraLabel(era: string): string {
  if (lang() !== 'he' || !era) return era;
  return era
    .replace(/\bBCE\b/g, 'לפנה״ס')
    .replace(/\bCE\b/g, 'לספירה')
    .replace(/\bc\.\s*/g, '~');
}

/** Translate an argument move-kind to the active language, falling back to the
 *  raw kind string when the catalog has no entry. */
function moveKindLabel(kind: string): string {
  const key = `move.kind.${kind}`;
  const v = t(key);
  return v === key ? kind : v;
}

/** Translate a halacha dispute axis (rishonim / acharonim / …), falling back to
 *  the raw axis string when the catalog has no entry. */
function axisLabel(axis: string): string {
  const key = `axis.${axis}`;
  const v = t(key);
  return v === key ? axis : v;
}

export interface RishonComment {
  work: string;
  workHe: string;
  textHe: string;
  textEn: string;
  sourceRef: string;
}

export interface RishonimInstance {
  segIdx: number;
  fields: {
    works: string[];
    commentCount: number;
    comments: RishonComment[];
  };
}

/** A `places` mark instance, as emitted by the LLM extractor. */
export interface PlaceInstance {
  excerpt?: string;
  fields: {
    name: string;
    nameHe: string;
    kind: string;
    region: string;
    knownAs?: string[];
  };
}

/** Section-typing gate for the voice-dispute map (Track C, P2). The voices
 *  graph models a מחלוקת; rendering it on a story or a one-sided Stam Q&A is the
 *  "Demons"/"Stam questioner→respondent" pathology. We compute the section's
 *  TypeProfile (deterministic, cached marks, via /api/type-profiles).
 *
 *  Two signals, deliberately split by where they're reliable:
 *   - DETERMINISTIC (from the profile, always available): `primary` (a story is
 *     never a dispute map) and `hasNamedSpeaker` (a fabricated dispute on an
 *     anonymous Stam section has no named move-speaker to ground it). These form
 *     `mapEligible` — could this section EVER show the map.
 *   - LIVE (from the loaded voices graph, passed in at render): real opposition
 *     (`hasOpposingVoices`). We read this from the just-loaded graph rather than
 *     the profile's cached `isDispute` because `isDispute` suffers a warming
 *     race — on a cold daf the profile reports `false` until the (LLM) voices
 *     warm, which silently hid the map on genuine disputes (e.g. Gittin 90a's
 *     Beit Hillel/Shammai). The live graph is present exactly when we'd draw. */
interface SectionTypeProfile {
  unit: { startSegIdx: number; endSegIdx: number };
  primary: string;
  isDispute: boolean;
  hasNamedSpeaker?: boolean;
}
function useVoicesGate(
  tractate: () => string,
  page: () => string,
  section: () => { startSegIdx?: number; endSegIdx?: number } | undefined,
) {
  const [profiles] = createResource(
    () => `${tractate()}|${page()}`,
    async (): Promise<SectionTypeProfile[]> => {
      try {
        const r = await fetch(
          `/api/type-profiles/${encodeURIComponent(tractate())}/${encodeURIComponent(page())}`,
        );
        if (!r.ok) return [];
        return ((await r.json()) as { profiles?: SectionTypeProfile[] }).profiles ?? [];
      } catch {
        return [];
      }
    },
  );
  const profile = (): SectionTypeProfile | undefined => {
    const s = section();
    if (!s || typeof s.startSegIdx !== 'number' || typeof s.endSegIdx !== 'number')
      return undefined;
    return (profiles() ?? []).find(
      (p) => p.unit.startSegIdx === s.startSegIdx && p.unit.endSegIdx === s.endSegIdx,
    );
  };
  // The three decisions are pure functions in src/lib/typing/profile.ts
  // (voicesMapEligible / voicesShowMap / voicesShowFallback) so the gate logic
  // is unit-tested against the regressions it fixes (Chullin 2a hallucination,
  // Gittin 90a warming race); here we just bind them to the reactive profile.
  const mapEligible = (): boolean => voicesMapEligible(profile());
  const showVoiceMap = (voices: ArgumentVoicesData | null): boolean =>
    voicesShowMap(profile(), voices);
  const showFallback = (voices: ArgumentVoicesData | null, resolved: boolean): boolean =>
    voicesShowFallback(profile(), voices, resolved);
  return { profile, mapEligible, showVoiceMap, showFallback };
}

export type SidebarContent =
  | { kind: 'argument'; section: Section; index: number }
  | { kind: 'halacha'; topic: HalachaTopic; index: number }
  | { kind: 'chart'; chart: ChartTable; index: number }
  | { kind: 'aggadata'; story: AggadataStory; index: number }
  | { kind: 'yerushalmi'; parallel: YerushalmiParallel; index: number }
  | { kind: 'pesuk'; pasuk: Pasuk; index: number }
  | { kind: 'rabbi'; rabbi: IdentifiedRabbi }
  | { kind: 'place'; place: PlaceInstance }
  | { kind: 'voice-group'; group: { name: string; nameHe: string; bio: string } }
  | { kind: 'rishonim'; instance: RishonimInstance; index: number }
  | { kind: 'argument-overview'; focus?: number }
  | { kind: 'daf-background' }
  | { kind: 'tidbit' }
  | { kind: 'biyun' }
  | { kind: 'geography' };

export interface ArgumentSidebarProps {
  content: SidebarContent | null;
  tractate: string;
  page: string;
  activeRabbi: string | null;
  onClose: () => void;
  onHighlightRabbi: (name: string | null) => void;
  /** Push a rabbi onto the sidebar stack (called by chips, voice nodes,
   *  and prose mentions). Distinct from onHighlightRabbi (which only
   *  toggles daf highlights without changing the sidebar). */
  onPushRabbi: (name: string) => void;
  /** Label of the previous stack entry — null when the stack is at depth 1
   *  (no back available). When non-null, the sidebar renders a back chip. */
  previousLabel: string | null;
  onBack: () => void;
  /** Daf-wide identified rabbis. Used to resolve display names mentioned
   *  in enrichment prose to clickable links. */
  dafRabbis: IdentifiedRabbi[];
  /** Bare rabbi names from LLM-extracted structured fields (move.rabbiNames,
   *  section.rabbiNames, voice nodes) that may not be in dafRabbis (the
   *  rabbi-places dataset has gaps). Matched in prose; routing falls
   *  through pushRabbi's name-lookup chain. */
  dafRabbiNames: string[];
  /** The daf's glossary pool: the always-known global terms ∪ this daf's
   *  background concepts (src/lib/terms/registry). Mentions of any of these in a
   *  card's prose — in Hebrew or English — get a gloss tooltip. */
  glossaryTerms: Term[];
  /** Highlights a contiguous segment range on the daf. Used when the user
   *  clicks an argument-move card so the corresponding sub-range of the
   *  section is painted. Pass null to clear. `key` is a stable id (e.g. the
   *  move's fields.id) so DafViewer can dedupe overlapping highlight reqs. */
  onHighlightRange?: (
    range: {
      start: number;
      end: number;
      key: string;
      tokenStart?: number;
      tokenEnd?: number;
    } | null,
  ) => void;
  onOpenRabbiSlug?: (slug: string) => void;
  generationByName: Map<string, GenerationId>;
  /** The daf's ordered argument sections (from the `argument` mark). Feeds the
   *  whole-daf overview's flow graph — its nodes are these sections. */
  dafSections?: Section[];
  /** Open the in-depth `argument` card for a section (by index). Lets the
   *  whole-daf overview hand off into the full per-section argument. */
  onOpenArgument?: (index: number) => void;
  /** The whole-daf geography card's model + interaction callbacks. The model
   *  comes from the computed `geography` mark run; the callbacks drive in-text
   *  highlighting. Forwarded to the geography-map special block via extras. */
  geography?: GeographyExtras;
}

// Parse markdown-style links out of a bio string. Sefaria `/topics/<slug>`
// links become internal buttons that swap the sidebar to that rabbi's bio
// (via `onOpenSlug`); every other link stays as an external anchor. Links
// whose URL doesn't parse fall back to the raw bracketed text.
const BIO_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const SEFARIA_TOPIC_RE = /^https?:\/\/(?:www\.)?sefaria\.org\/topics\/([^/?#]+)/i;

function _renderBioWithLinks(bio: string, onOpenSlug?: (slug: string) => void): JSX.Element[] {
  const out: JSX.Element[] = [];
  let last = 0;
  BIO_LINK_RE.lastIndex = 0;
  for (let m = BIO_LINK_RE.exec(bio); m !== null; m = BIO_LINK_RE.exec(bio)) {
    if (m.index > last) out.push(bio.slice(last, m.index));
    const [, text, rawUrl] = m;
    const url = rawUrl.replace(/&amp;/g, '&');
    const topic = url.match(SEFARIA_TOPIC_RE);
    if (topic && onOpenSlug) {
      const slug = topic[1];
      out.push(
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onOpenSlug(slug);
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            color: '#1e40af',
            cursor: 'pointer',
            'text-decoration': 'underline',
            font: 'inherit',
          }}
        >
          {text}
        </button>,
      );
    } else {
      out.push(
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af' }}>
          {text}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < bio.length) out.push(bio.slice(last));
  return out;
}

function _RabbiRow(props: {
  rabbi: Rabbi;
  active: boolean;
  generationId?: GenerationId;
  onToggle: () => void;
}): JSX.Element {
  const genInfo = () => (props.generationId ? GENERATION_BY_ID[props.generationId] : null);
  return (
    <button
      type="button"
      onClick={props.onToggle}
      style={{
        width: '100%',
        'text-align': 'left',
        display: 'block',
        padding: '0.55rem 0.7rem',
        margin: '0 0 0.4rem',
        background: props.active ? '#fef3c7' : '#fafaf7',
        border: `1px solid ${props.active ? '#eab308' : '#eae8e0'}`,
        'border-radius': '4px',
        cursor: 'pointer',
        'font-family': 'inherit',
        'font-size': '0.85rem',
      }}
      title={props.active ? t('rabbi.row.unhighlight') : t('rabbi.row.highlight')}
    >
      <div style={{ 'font-weight': 600, color: '#333' }}>
        {props.rabbi.name}{' '}
        <span
          dir="rtl"
          lang="he"
          style={{
            'font-family': '"Mekorot Vilna", serif',
            color: '#888',
            'font-weight': 'normal',
          }}
        >
          {props.rabbi.nameHe}
        </span>
      </div>
      <Show when={genInfo()}>
        {(g) => (
          <div
            style={{
              'margin-top': '0.25rem',
              display: 'flex',
              'align-items': 'center',
              gap: '0.4rem',
              'font-size': '0.72rem',
              color: '#666',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '1.4rem',
                height: '0.35rem',
                'background-color': g().color,
                'border-radius': '2px',
              }}
            />
            <span>
              {g().label} · {g().era}
            </span>
          </div>
        )}
      </Show>
      <div style={{ color: '#666', 'margin-top': '0.2rem', 'font-size': '0.78rem' }}>
        {props.rabbi.period} · {props.rabbi.location}
      </div>
      <div style={{ color: '#444', 'margin-top': '0.35rem', 'line-height': 1.45 }}>
        <Hebraized text={props.rabbi.role} />
      </div>
    </button>
  );
}

// ===========================================================================
// Argument body
// -------------
// Top    : title + Hebrew excerpt + section synthesis (4-5 sentences from
//          `argument.synthesis`).
// Below  : per-move cards. Each move comes from the `argument-move` mark
//          (one daf-wide LLM extraction; surfaced via the section synthesis
//          run's `anchors_resolved.argument-move`). Each card mounts its
//          OWN MarkEnrichmentCards markId="argument-move" so the per-move
//          synthesis renders independently with its own "built from" tray.
// Click  : clicking a move calls `onHighlightRange(start,end)` to paint the
//          move's segment range on the daf.
// ===========================================================================

interface ArgumentMoveInstance {
  startSegIdx: number;
  endSegIdx: number;
  fields: {
    id: string;
    sectionStartSegIdx: number;
    sectionEndSegIdx: number;
    moveOrder: number;
    role: string;
    voice: string;
    rabbiNames: string[];
    excerpt: string;
    summary: string;
    /** Word offsets within startSegIdx / endSegIdx, set by the worker's
     *  postProcessArgumentMove for sub-segment-precise highlighting.
     *  Critical for sections that pack multiple moves into one Sefaria
     *  segment (e.g. the opening Mishnah of a tractate). */
    tokenStart?: number;
    tokenEnd?: number;
  };
}

const ROLE_COLORS: Record<string, string> = {
  opening: '#475569',
  question: '#0369a1',
  answer: '#15803d',
  objection: '#b91c1c',
  rejection: '#9f1239',
  'supporting-evidence': '#0891b2',
  resolution: '#15803d',
  digression: '#a16207',
  shift: '#7c3aed',
  other: '#64748b',
};

function ArgumentMoveCard(props: {
  move: ArgumentMoveInstance;
  tractate: string;
  page: string;
  highlightedMoveId: string | null;
  onHighlightMove: (move: ArgumentMoveInstance | null) => void;
}): JSX.Element {
  const f = props.move.fields;
  const roleColor = () => ROLE_COLORS[f.role] ?? '#64748b';
  const isActive = () => props.highlightedMoveId === f.id;
  const toggleHighlight = () => props.onHighlightMove(isActive() ? null : props.move);

  return (
    <div
      style={{
        border: `1px solid ${isActive() ? '#eab308' : '#eae8e0'}`,
        'border-left': `3px solid ${roleColor()}`,
        'border-radius': '4px',
        padding: '0.55rem 0.7rem',
        'margin-bottom': '0.55rem',
        background: isActive() ? '#fefce8' : '#fafaf7',
      }}
    >
      {/* Click target: the role/voice header + Hebrew excerpt act as a single
          button that toggles the daf-side range highlight. The synthesis card
          and rabbi chips below are NOT inside this button so dropdowns and
          chip clicks work normally. */}
      <button
        type="button"
        onClick={toggleHighlight}
        title={isActive() ? t('move.highlight.clear') : t('move.highlight.set')}
        style={{
          all: 'unset',
          display: 'block',
          cursor: 'pointer',
          width: '100%',
          'box-sizing': 'border-box',
          'padding-bottom': '0.4rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '0.5rem',
            'margin-bottom': '0.3rem',
            'font-size': '0.7rem',
          }}
        >
          <span
            style={{
              'text-transform': 'uppercase',
              'letter-spacing': '0.06em',
              'font-weight': 600,
              color: roleColor(),
            }}
          >
            {moveKindLabel(f.role)}
          </span>
          <span style={{ color: '#999' }}>·</span>
          <span style={{ color: '#555' }}>{f.voice}</span>
          <span
            style={{
              color: '#bbb',
              'font-size': '0.65rem',
              'font-family': 'ui-monospace, Menlo, monospace',
            }}
          >
            seg{' '}
            {props.move.startSegIdx === props.move.endSegIdx
              ? props.move.startSegIdx
              : `${props.move.startSegIdx}–${props.move.endSegIdx}`}
          </span>
          <Show when={isActive()}>
            <span style={{ color: '#a16207', 'font-size': '0.65rem', 'margin-left': 'auto' }}>
              {t('move.highlighted')}
            </span>
          </Show>
        </div>
        <Show when={f.excerpt}>
          <p
            dir="rtl"
            lang="he"
            style={{
              margin: 0,
              'font-family': '"Mekorot Vilna", serif',
              'font-size': '0.9rem',
              color: '#555',
            }}
          >
            {f.excerpt}…
          </p>
        </Show>
      </button>
      {/* Per-move synthesis. Mounts its own MarkEnrichmentCards so each move
          gets its own "built from" tray. The wrapping div extends the move
          card's click-to-highlight target to the synthesis body — clicks
          on rabbi-link buttons + chips stopPropagation so they don't toggle
          the highlight. */}
      {/* biome-ignore lint/a11y/useSemanticElements: wraps the synthesis prose block, which nests rabbi-link buttons and chips; a native button cannot contain them */}
      <div
        onClick={toggleHighlight}
        onKeyDown={(e) => {
          // Only the wrapper itself toggles — a keydown bubbled up from a
          // focused rabbi-link button or chip inside must not also toggle.
          if (e.currentTarget !== e.target) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleHighlight();
          }
        }}
        role="button"
        tabIndex={0}
        title={isActive() ? t('move.highlight.clear') : t('move.highlight.set')}
        style={{ cursor: 'pointer' }}
      >
        <Synthesis
          markId="argument-move"
          instance={props.move}
          instanceKey={f.id}
          tractate={props.tractate}
          page={props.page}
        />
      </div>
      {/* Explore-deeper Q&A panel — collapsed by default; the first expand
          lazily loads suggested questions + community-asked registry, and
          per-question answers stream in via shared KV-cached
          argument-move.qa runs. */}
      <QASection
        mark="argument-move"
        instanceId={f.id}
        instance={props.move}
        tractate={props.tractate}
        page={props.page}
      />
    </div>
  );
}

// ===========================================================================
// Argument (in-depth, per-section) card — recipe blocks.
// ---------------------------------------------------------------------------
// The recipe header renders the section title; the synthesis section renders the
// orienting paragraph. These two blocks cover the rest: the Hebrew excerpt above
// the synthesis, and below it the voice-dispute map / dialectic-or-narrative
// fallback / per-move cards (one block because they share the highlighted-move
// state and the section-typing gate, and read both the `argument.voices` leaf
// and the `argument-move` anchors). The full Section + onPushRabbi arrive via
// `extras` (the projected instance.fields can't carry the rabbis array).
// ===========================================================================

/** The Hebrew section excerpt (RTL), shown above the synthesis. */
function ArgumentExcerpt(props: SpecialBlockProps): JSX.Element {
  const excerpt = (): string =>
    typeof props.instance.fields.excerpt === 'string' ? props.instance.fields.excerpt : '';
  return (
    <Show when={excerpt()}>
      <HebrewProse size="0.95rem" color="#555" margin="0 0 0.75rem">
        {excerpt()}…
      </HebrewProse>
    </Show>
  );
}

/** Everything below the synthesis: the voice-dispute map, the dialectic /
 *  narrative fallback, and the per-move cards. */
function ArgumentDetail(props: SpecialBlockProps): JSX.Element {
  const section = (): Section => props.extras?.section as Section;
  const onPushRabbi = (): ((name: string) => void) =>
    (props.extras?.onPushRabbi as (name: string) => void) ?? (() => {});
  const [highlightedMoveId, setHighlightedMoveId] = createSignal<string | null>(null);
  // Section-typing gate: hide the voice-dispute map on non-dispute sections.
  const voicesGate = useVoicesGate(
    () => props.tractate,
    () => props.page,
    () => section(),
  );

  // argument.voices leaf → structured voices graph. Edges may be absent on older
  // cached entries (default []); deriveVoiceEdges repairs directions / drops
  // malformed edges so even pre-transform cached graphs render right.
  const voicesData = createMemo<ArgumentVoicesData | null>(() => {
    const v = props.deps['argument.voices'] as ArgumentVoicesData | undefined;
    if (!v || !Array.isArray(v.voices)) return null;
    return deriveVoiceEdges({
      voices: v.voices,
      edges: Array.isArray(v.edges) ? v.edges : [],
    }) as ArgumentVoicesData;
  });

  // argument-move anchors → this section's moves. selectSectionMoves dedupes by
  // move id and prefers an exact parent-section match, so a stale / doubled
  // argument-move cache (the Shabbat 126a bug) renders as one clean set.
  const sectionMoves = createMemo<ArgumentMoveInstance[] | null>(() => {
    const all = props.anchors['argument-move'] as ArgumentMoveInstance[] | undefined;
    if (!Array.isArray(all)) return null;
    return selectSectionMoves(all, {
      startSegIdx: section().startSegIdx,
      endSegIdx: section().endSegIdx,
    });
  });

  // The unified statement spine: this section's moves + voices folded into ONE
  // graph (typing/statementSpine). It degenerates by topology — a linear chain
  // when there's no dispute (the old "dialectic" view), branching where two named
  // statements oppose (the old "voices" view) — so one renderer replaces the
  // former voice-map / dialectic-flow gate. Built client-side from the already-
  // resolved deps/anchors (no extra fetch); null until the moves anchor lands.
  const statementSpine = createMemo(() => {
    const moves = sectionMoves();
    if (!moves || moves.length === 0) return null;
    return buildStatementSpine({ moves, voices: voicesData() });
  });

  // Clear the highlighted move + reader range when the section changes.
  createEffect(() => {
    void props.instanceKey;
    setHighlightedMoveId(null);
    props.onHighlightRange?.(null);
  });

  const handleHighlightMove = (move: ArgumentMoveInstance | null) => {
    if (!move) {
      setHighlightedMoveId(null);
      props.onHighlightRange?.(null);
      return;
    }
    setHighlightedMoveId(move.fields.id);
    props.onHighlightRange?.({
      start: move.startSegIdx,
      end: move.endSegIdx,
      key: move.fields.id,
      tokenStart: move.fields.tokenStart,
      tokenEnd: move.fields.tokenEnd,
    });
  };

  return (
    <>
      {/* One view, two topologies. An aggadata section stays a NARRATIVE (a story
          isn't a dispute or a שקלא-וטריא); everything else renders as the single
          statement spine — linear when it's a progression, branching when named
          voices oppose. This replaces the old voice-map / dialectic-flow gate. */}
      <Show
        when={voicesGate.profile()?.primary === 'aggadata'}
        fallback={
          <Show when={statementSpine()}>
            {(sp) => (
              <div style={{ position: 'relative' }}>
                <InspectDot
                  instanceKey={props.instanceKey}
                  leafId="argument.voices"
                  style={{ position: 'absolute', top: '0.2rem', right: 0, 'z-index': 2 }}
                />
                <StatementSpine
                  spine={sp()}
                  onPushRabbi={onPushRabbi()}
                  onHighlight={(r) =>
                    props.onHighlightRange?.(
                      r
                        ? {
                            start: r.start,
                            end: r.end,
                            key: `stmt-${r.start}-${r.tokenStart ?? 0}`,
                            tokenStart: r.tokenStart,
                            tokenEnd: r.tokenEnd,
                          }
                        : null,
                    )
                  }
                />
              </div>
            )}
          </Show>
        }
      >
        <ArgumentNarrative
          section={section()}
          tractate={props.tractate}
          page={props.page}
          onHighlight={(r) =>
            props.onHighlightRange?.(
              r
                ? {
                    start: r.start,
                    end: r.end,
                    key: `beat-${r.start}-${r.tokenStart ?? 0}`,
                    tokenStart: r.tokenStart,
                    tokenEnd: r.tokenEnd,
                  }
                : null,
            )
          }
        />
      </Show>
      {/* Per-move detail cards (with Q&A) — kept below the spine for non-narrative
          sections; folding the Q&A into the spine is a follow-up. */}
      <Show when={voicesGate.profile()?.primary !== 'aggadata' && sectionMoves()}>
        {(moves) => (
          <div style={{ 'margin-top': '1rem' }}>
            <div
              style={{
                'font-size': '0.7rem',
                'text-transform': 'uppercase',
                'letter-spacing': '0.08em',
                color: '#999',
                'margin-bottom': '0.5rem',
              }}
            >
              {t('argument.moves')}
            </div>
            <For each={moves()}>
              {(move) => (
                <ArgumentMoveCard
                  move={move}
                  tractate={props.tractate}
                  page={props.page}
                  highlightedMoveId={highlightedMoveId()}
                  onHighlightMove={handleHighlightMove}
                />
              )}
            </For>
          </div>
        )}
      </Show>
    </>
  );
}

export const ARGUMENT_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'argument-excerpt': ArgumentExcerpt,
  'argument-detail': ArgumentDetail,
};

/** Display instance for the argument card: the section's projected fields (the
 *  heading + excerpt block read these). The full Section (rabbis array, etc.)
 *  travels via `extras`. */
export function argumentDisplayInstance(section: Section): { fields: Record<string, unknown> } {
  return {
    fields: {
      title: section.title,
      summary: section.summary,
      excerpt: section.excerpt,
      rabbiNames: section.rabbis.map((r) => r.name),
    },
  };
}

/** The exact shape sent to the `argument` synthesis as mark_input — unchanged
 *  from the old ArgumentBody so the run cache stays warm across this conversion. */
export function argumentSynthInstance(section: Section): unknown {
  return {
    startSegIdx: section.startSegIdx,
    endSegIdx: section.endSegIdx,
    fields: {
      title: section.title,
      summary: section.summary,
      excerpt: section.excerpt,
      rabbiNames: section.rabbis.map((r) => r.name),
    },
  };
}

// Flow kinds that bind two sections into ONE continuous discussion (sugya).
// The others (parallels / contrasts / generalizes / cites) are cross-references
// between DISTINCT sugyot, so they don't merge sections into the same map.
const SUGYA_BINDING_KINDS = new Set(['continues', 'resolves', 'depends-on']);

/** Partition a daf's argument sections into discussion groups (sugyot) as
 *  CONTIGUOUS runs in daf order. The daf is linear, so a sugya is a run of
 *  consecutive sections; a boundary falls between section b-1 and b only where
 *  NO binding edge spans that point (a clean cut). This keeps maps in reading
 *  order and never orphans a passed-over section (e.g. a section the flow
 *  skipped over with a 2→4 edge stays inside the surrounding discussion).
 *  Returns contiguous groups of section indices, top-to-bottom. */
export function groupSectionsBySugya(
  sectionCount: number,
  connections: FlowConnection[],
): number[][] {
  if (sectionCount <= 0) return [];
  const bindings = connections.filter(
    (c) =>
      SUGYA_BINDING_KINDS.has(c.kind) &&
      c.from >= 0 &&
      c.to >= 0 &&
      c.from < sectionCount &&
      c.to < sectionCount &&
      c.from !== c.to,
  );
  // A binding edge spans the gap before section b iff min(endpoints) < b <= max.
  const spans = (b: number) =>
    bindings.some((c) => Math.min(c.from, c.to) < b && b <= Math.max(c.from, c.to));
  const groups: number[][] = [];
  let cur = [0];
  for (let b = 1; b < sectionCount; b++) {
    if (spans(b)) cur.push(b);
    else {
      groups.push(cur);
      cur = [b];
    }
  }
  groups.push(cur);
  return groups;
}

/** What the overview's maps region should render. A map is a flow graph whose
 *  edges are the daf's connections; before the flow enrichment resolves there
 *  are no connections, so rendering the maps then would show disconnected,
 *  link-less nodes. Gate on resolution: 'loading' until the flow resolves,
 *  'ready' after (a daf may legitimately resolve to zero edges), 'empty' when
 *  the daf has no sections at all. Pure + exported for tests. */
export function mapsState(
  sectionCount: number,
  flowResolved: boolean,
): 'empty' | 'loading' | 'ready' {
  if (sectionCount <= 0) return 'empty';
  return flowResolved ? 'ready' : 'loading';
}

// ===========================================================================
// Whole-daf argument OVERVIEW card — recipe block.
// ---------------------------------------------------------------------------
// The recipe header renders the localized "Overview" title; the synthesis
// section renders the one-paragraph daf orientation. This block renders the
// rest: the daf's argument sections as flow-graph MAPS — one map per discussion
// (sugya), split where the sections stop binding to each other; maps whose
// discussion carries over from the previous daf, or continues onto the next, are
// flagged; clicking a section node drills straight into that section's full
// argument card (pushed onto the Overview, with a back chip returning here).
// Each section node also carries its off-node connections (cross-daf parallels,
// cites, pesukim, halacha) as click-to-expand exit markers. The daf `sections`
// and `onOpenArgument` arrive via `extras`.
// ===========================================================================
function ArgumentOverviewMaps(props: SpecialBlockProps): JSX.Element {
  const sections = (): Section[] => (props.extras?.sections as Section[]) ?? [];
  const onPushRabbi = (): ((name: string) => void) =>
    (props.extras?.onPushRabbi as (name: string) => void) ?? (() => {});

  // The focused section (array index) whose statement spine shows below the map.
  // Clicking a map node sets it — the deep-dive happens IN PLACE under the map
  // (the "extra"), not in a separate pushed card. Seeded from the incoming `focus`
  // (a gutter marker / reader chip that opened a specific section) or the first
  // section; re-syncs when a new section is opened from the daf, while a local map
  // click (which doesn't change `focus`/daf) is left alone.
  const incomingFocus = (): number | undefined => props.extras?.focus as number | undefined;
  const [focused, setFocused] = createSignal(incomingFocus() ?? 0);
  createEffect(() => {
    void props.tractate;
    void props.page;
    setFocused(incomingFocus() ?? 0);
  });

  // The daf-level flow leaf's section connections. Empty until the synthesis
  // resolves; `props.synthesisResolved` is the "flow resolved" gate (a daf can
  // legitimately resolve to zero edges — see `mapsState`).
  const connections = createMemo<FlowConnection[]>(() => {
    const flow = props.deps['argument-overview.flow'] as
      | { connections?: FlowConnection[] }
      | undefined;
    return flow && Array.isArray(flow.connections) ? flow.connections : [];
  });

  // The daf's statement spines (one per section), built server-side from the
  // cached moves + voices (GET /api/statement-spine). The map's "extra" reads the
  // focused section's spine from here — the single source the #spine view pulls.
  const [spines] = createResource(
    () => `${props.tractate}|${props.page}`,
    async (): Promise<{ index: number; title: string; spine: StatementSpineData }[]> => {
      try {
        const r = await fetch(
          `/api/statement-spine/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}`,
        );
        if (!r.ok) return [];
        return (
          (
            (await r.json()) as {
              sections?: { index: number; title: string; spine: StatementSpineData }[];
            }
          ).sections ?? []
        );
      } catch {
        return [];
      }
    },
  );
  const focusedSpine = (): { title: string; spine: StatementSpineData } | undefined =>
    (spines() ?? []).find((s) => s.index === focused());
  // The selected statement WITHIN the focused section — its detail renders below
  // the map. Clears whenever the focused section changes.
  const [selectedStmt, setSelectedStmt] = createSignal<string | null>(null);
  createEffect(() => {
    void focused();
    setSelectedStmt(null);
  });
  const selectedNode = (): StatementSpineData['nodes'][number] | undefined =>
    focusedSpine()?.spine.nodes.find((n) => n.id === selectedStmt());
  // Selecting a statement highlights its range in the reader (cleared when none).
  createEffect(() => {
    const n = selectedNode();
    props.onHighlightRange?.(
      n
        ? {
            start: n.startSegIdx,
            end: n.endSegIdx,
            key: `stmt-${n.startSegIdx}-${n.tokenStart ?? 0}`,
            tokenStart: n.tokenStart,
            tokenEnd: n.tokenEnd,
          }
        : null,
    );
  });

  // Split the daf's sections into discussion maps. With no flow yet (cold), each
  // section is its own group; once the flow loads they merge into real sugyot.
  const groups = () => groupSectionsBySugya(sections().length, connections());

  // Cross-page continuation: does the previous daf continue INTO this one (so
  // the first map carries over), and does this daf continue onto the next (so
  // the last map spills forward)? Read from the cached cross-daf bridges.
  const [bridge] = createResource(
    () => `${props.tractate}|${props.page}`,
    async (): Promise<{
      prev: string | null;
      next: string | null;
      fromPrev: boolean;
      toNext: boolean;
    }> => {
      // The tractate-spine neighborhood in one read (GET /api/spine assembles
      // both cross-daf bridges server-side). Falls back to local page
      // arithmetic + no-continuation on any failure.
      const fallback = {
        prev: adjacentAmud(props.tractate, props.page, -1),
        next: adjacentAmud(props.tractate, props.page, 1),
        fromPrev: false,
        toNext: false,
      };
      try {
        const r = await fetch(
          `/api/spine/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}`,
        );
        if (!r.ok) return fallback;
        const d = (await r.json()) as {
          prev: string | null;
          next: string | null;
          fromPrev?: boolean;
          toNext?: boolean;
        };
        return { prev: d.prev, next: d.next, fromPrev: !!d.fromPrev, toNext: !!d.toNext };
      } catch {
        return fallback;
      }
    },
  );

  // The daf's per-section exit marks (GET /api/links computes them from the
  // unified link graph): the off-node connections — cross-daf parallels, cites,
  // pesukim, halacha — anchored to each section, keyed by section start seg. Each
  // section node in the maps places them as click-to-expand exit markers, so the
  // cross-references live ON the section that owns them (retiring the old
  // detached chip list).
  const [sectionExits] = createResource(
    () => `${props.tractate}|${props.page}`,
    async (): Promise<Record<number, SectionExit[]>> => {
      try {
        const r = await fetch(
          `/api/links/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}`,
        );
        if (!r.ok) return {};
        return (
          ((await r.json()) as { sectionExits?: Record<number, SectionExit[]> }).sectionExits ?? {}
        );
      } catch {
        return {};
      }
    },
  );

  // Adjacent-amud page label for the continuation caption: Hebrew daf form
  // ('ב.') in he mode, the raw '2a' slug in en.
  const pageRef = (p: string | null): string => (p ? (lang() === 'he' ? pageLabelHe(p) : p) : '');

  // Cross-page continuation hint: a muted caption, not a chip. Subtle on
  // purpose — it's an aside, not a heading (no fill, no border, no bold).
  const crossLabel = (text: string): JSX.Element => (
    <div
      style={{
        'font-size': '0.66rem',
        'font-weight': 400,
        color: '#9ca3af',
        'letter-spacing': '0.02em',
        padding: '0.1rem 0.15rem',
        margin: '0.05rem 0',
      }}
    >
      {text}
    </div>
  );

  return (
    <Show
      when={sections().length > 0}
      fallback={
        <HebrewProse size="0.85rem" color="#999" margin="0.6rem 0 0">
          {t('overview.empty')}
        </HebrewProse>
      }
    >
      {/* One flow-graph map per discussion. Multiple maps = multiple sugyot on
            the daf; the cross-page flags show where a discussion runs past the
            page break. Until the flow resolves we have no connections, so we
            show a loading state rather than disconnected, link-less nodes. */}
      <Show
        when={mapsState(sections().length, props.synthesisResolved) === 'ready'}
        fallback={
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '0.6rem',
              padding: '0.7rem 0.2rem',
              color: '#666',
              'font-size': '0.82rem',
              'font-style': 'italic',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '0.85rem',
                height: '0.85rem',
                'border-radius': '50%',
                border: '2px solid #d6d3d1',
                'border-top-color': '#8a2a2b',
                animation: 'daf-spin 0.8s linear infinite',
                'flex-shrink': 0,
              }}
            />
            {t('overview.mapping')}
          </div>
        }
      >
        <For each={groups()}>
          {(grp) => {
            const hasFirst = grp.includes(0);
            const hasLast = grp.includes(sections().length - 1);
            const grpNodes = grp.map((i) => ({
              index: i,
              title: sections()[i].title,
              exits: sectionExits()?.[sections()[i].startSegIdx ?? -1] ?? [],
              // The focused section carries its statement spine, rendered as
              // nested sub-nodes under the node (the in-map drill-in).
              statements: i === focused() ? focusedSpine()?.spine.nodes : undefined,
            }));
            return (
              <div style={{ 'margin-bottom': '0.7rem' }}>
                <Show when={hasFirst && bridge()?.fromPrev}>
                  {crossLabel(t('overview.continuesFrom', { page: pageRef(bridge()!.prev) }))}
                </Show>
                <ArgumentFlowGraph
                  nodes={grpNodes}
                  connections={connections()}
                  activeIndex={focused()}
                  onSelect={setFocused}
                  selectedStatementId={selectedStmt()}
                  onSelectStatement={setSelectedStmt}
                />
                <Show when={hasLast && bridge()?.toNext}>
                  {crossLabel(t('overview.continuesOnto', { page: pageRef(bridge()!.next) }))}
                </Show>
              </div>
            );
          }}
        </For>
        {/* The "extra": the SELECTED statement's detail, below the map. Clicking a
            nested statement node above selects it; this panel shows its summary
            (synthesis + Q&A land here next). Highlights its range in the reader. */}
        <Show when={selectedNode()}>
          {(n) => (
            <div
              style={{
                'margin-top': '0.5rem',
                padding: '0.7rem 0.85rem',
                border: '1px solid #e4e0d4',
                'border-left': `4px solid ${STMT_SIDE_TINT[n().side ?? ''] ?? '#8a2a2b'}`,
                'border-radius': '6px',
                background: '#fdfcf9',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  gap: '0.45rem',
                  'flex-wrap': 'wrap',
                  'margin-bottom': '0.3rem',
                }}
              >
                <span
                  style={{
                    'font-size': '0.62rem',
                    'font-weight': 700,
                    'text-transform': 'uppercase',
                    'letter-spacing': '0.05em',
                    color: STMT_DETAIL_ROLE_COLOR[n().role] ?? '#64748b',
                  }}
                >
                  {n().role}
                </span>
                <Show when={n().speaker}>
                  <button
                    type="button"
                    disabled={!n().named}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (n().named) onPushRabbi()(n().speaker);
                    }}
                    style={{
                      font: 'inherit',
                      'font-weight': 600,
                      color: n().named ? '#0b5cad' : '#444',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: n().named ? 'pointer' : 'default',
                      'text-decoration': n().named ? 'underline' : 'none',
                      'text-underline-offset': '2px',
                    }}
                  >
                    {n().speaker}
                  </button>
                </Show>
              </div>
              <Show when={n().excerpt}>
                <div
                  dir="rtl"
                  lang="he"
                  style={{
                    'font-family': '"Mekorot Vilna", serif',
                    'font-size': '1rem',
                    color: '#333',
                    'margin-bottom': '0.3rem',
                  }}
                >
                  {n().excerpt}…
                </div>
              </Show>
              <Show
                when={n().summary}
                fallback={
                  <p style={{ margin: 0, color: '#999', 'font-style': 'italic' }}>
                    {t('overview.statementHint')}
                  </p>
                }
              >
                <p
                  style={{ margin: 0, color: '#333', 'line-height': 1.55, 'font-size': '0.88rem' }}
                >
                  <HebraizedWithRabbis text={n().summary ?? ''} />
                </p>
              </Show>
            </div>
          )}
        </Show>
      </Show>
    </Show>
  );
}

// Position side → tint for the selected-statement detail panel's accent bar.
const STMT_SIDE_TINT: Record<string, string> = {
  A: '#1d4ed8',
  B: '#b91c1c',
  C: '#92400e',
  'support-A': '#1d4ed8',
  'support-B': '#b91c1c',
};
// Role → colour for the selected-statement detail panel (matches the spine).
const STMT_DETAIL_ROLE_COLOR: Record<string, string> = {
  opening: '#475569',
  question: '#0369a1',
  answer: '#15803d',
  objection: '#b91c1c',
  rejection: '#9f1239',
  'supporting-evidence': '#0891b2',
  resolution: '#15803d',
  digression: '#a16207',
  shift: '#7c3aed',
  other: '#64748b',
};

export const ARGUMENT_OVERVIEW_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'argument-overview-maps': ArgumentOverviewMaps,
};

// ---------------------------------------------------------------------------
// Whole-daf Background: the terms/concepts a reader needs to follow the daf,
// grouped into themed sections. The `daf-background.synthesis` aggregate renders
// a one-sentence orientation; its deps_resolved carries `daf-background.concepts`
// (the themed groups), surfaced below without a second /api/run call.
// ---------------------------------------------------------------------------

function BackgroundGroups(props: { groups: BackgroundGroup[] }): JSX.Element {
  return (
    <div
      style={{
        'margin-top': '0.7rem',
        display: 'flex',
        'flex-direction': 'column',
        gap: '0.95rem',
      }}
    >
      <For each={props.groups}>
        {(g) => (
          <div>
            <div
              style={{
                'font-size': '0.68rem',
                'text-transform': 'uppercase',
                'letter-spacing': '0.08em',
                color: ACCENTS['daf-background'],
                'font-weight': 600,
                'margin-bottom': '0.4rem',
              }}
            >
              {t(`background.cat.${g.category}`)}
            </div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.55rem' }}>
              <For each={g.terms}>
                {(tm) => (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.4rem',
                        'align-items': 'baseline',
                        'flex-wrap': 'wrap',
                        'font-size': '0.86rem',
                        'font-weight': 600,
                        color: '#222',
                      }}
                    >
                      <span>{tm.term}</span>
                      <Show when={tm.termHe}>
                        <span
                          dir="rtl"
                          style={{ color: ACCENTS['daf-background'], 'font-weight': 500 }}
                        >
                          {tm.termHe}
                        </span>
                      </Show>
                    </div>
                    <div style={{ 'font-size': '0.82rem', color: '#444', 'line-height': 1.5 }}>
                      <HebraizedWithRabbis text={tm.gloss} />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

/** The grouped key-terms/concepts under the daf-background synthesis — read from
 *  the daf-background.concepts leaf, ordered, with an empty state once the
 *  synthesis settles with no groups. */
function DafBackgroundGroups(props: SpecialBlockProps): JSX.Element {
  const groups = createMemo<BackgroundGroup[]>(() => {
    const concepts = props.deps['daf-background.concepts'] as
      | { groups?: BackgroundGroup[] }
      | undefined;
    return orderBackgroundGroups(concepts?.groups);
  });
  return (
    <>
      <Show when={groups().length > 0}>
        <BackgroundGroups groups={groups()} />
      </Show>
      <Show when={props.synthesisResolved && groups().length === 0}>
        <HebrewProse size="0.85rem" color="#999" margin="0.6rem 0 0">
          {t('background.empty')}
        </HebrewProse>
      </Show>
    </>
  );
}

export const DAF_BACKGROUND_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'daf-background-groups': DafBackgroundGroups,
};

// ===========================================================================
// Tidbit body
// -----------
// The whole-daf "did you notice…" chip. One curated reading: a hook + 3-4
// flowing paragraphs, a flavor tag, the sources it rests on, and two honest
// confidence dots (TEXT grounding vs. how editorial the READING is). The essay
// is the tidbit.essay aggregate's OWN parsed output, so it renders via the
// registered mark renderer (registerMarkRenderer below) rather than the deps
// channel the other *Body components use.
// ===========================================================================

const TIDBIT_FLAVOR_KEY = {
  aggadah: 'tidbit.flavor.aggadah',
  'legal-concept': 'tidbit.flavor.legal-concept',
  machloket: 'tidbit.flavor.machloket',
  textual: 'tidbit.flavor.textual',
  'hidden-point': 'tidbit.flavor.hidden-point',
} as const;

const TIDBIT_CONF_KEY = {
  high: 'tidbit.conf.high',
  medium: 'tidbit.conf.medium',
  low: 'tidbit.conf.low',
} as const;

type TidbitConfLevel = keyof typeof TIDBIT_CONF_KEY;

function tidbitConfColor(level: TidbitConfLevel): string {
  return level === 'high' ? '#3f6b3a' : level === 'medium' ? '#a9802f' : '#9c4a1f';
}

function TidbitConf(props: { label: string; level: string }): JSX.Element {
  const lvl = (): TidbitConfLevel =>
    props.level === 'high' || props.level === 'medium' ? props.level : 'low';
  return (
    <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.3rem' }}>
      <span>{props.label}</span>
      <span
        style={{
          display: 'inline-block',
          width: '0.5rem',
          height: '0.5rem',
          'border-radius': '50%',
          'background-color': tidbitConfColor(lvl()),
        }}
      />
      <span>{t(TIDBIT_CONF_KEY[lvl()])}</span>
    </span>
  );
}

interface TidbitSource {
  ref?: string;
  note?: string;
}

function TidbitEssayView(parsed: Record<string, unknown>): JSX.Element {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const flavor = str(parsed.flavor);
  const hook = str(parsed.hook);
  const paragraphs = Array.isArray(parsed.paragraphs)
    ? (parsed.paragraphs as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];
  const sources = Array.isArray(parsed.sources) ? (parsed.sources as TidbitSource[]) : [];
  const textConf = str(parsed.textConfidence);
  const readingConf = str(parsed.readingConfidence);
  const flavorKey = TIDBIT_FLAVOR_KEY[flavor as keyof typeof TIDBIT_FLAVOR_KEY];
  return (
    <div>
      <Show when={flavorKey}>
        <div
          style={{
            'font-size': '0.66rem',
            'letter-spacing': '0.12em',
            'text-transform': 'uppercase',
            'font-weight': 700,
            color: ACCENTS.tidbit,
            'margin-bottom': '0.5rem',
          }}
        >
          {t(flavorKey!)}
        </div>
      </Show>
      <Show when={hook}>
        <p
          style={{
            margin: '0 0 0.85rem',
            'font-size': '1.02rem',
            'line-height': 1.4,
            'font-weight': 600,
            color: '#1f1b18',
          }}
        >
          <HebraizedWithRabbis text={hook} />
        </p>
      </Show>
      <For each={paragraphs}>
        {(p) => (
          <p
            style={{
              margin: '0 0 0.7rem',
              'font-size': '0.92rem',
              'line-height': 1.62,
              color: '#2b2622',
            }}
          >
            <HebraizedWithRabbis text={p} />
          </p>
        )}
      </For>
      <Show when={sources.length > 0}>
        <div style={{ 'margin-top': '0.9rem' }}>
          <div
            style={{
              'font-size': '0.62rem',
              'letter-spacing': '0.1em',
              'text-transform': 'uppercase',
              color: '#a99c83',
              'margin-bottom': '0.4rem',
            }}
          >
            {t('tidbit.sources')}
          </div>
          <div
            style={{
              display: 'flex',
              'flex-wrap': 'wrap',
              gap: '0.3rem 0.4rem',
              'align-items': 'baseline',
            }}
          >
            <For each={sources}>
              {(s) => (
                <span
                  title={str(s.note)}
                  style={{
                    'font-size': '0.72rem',
                    color: '#6b6256',
                    'border-bottom': '1px dotted #c9bb9e',
                    cursor: 'default',
                    'white-space': 'nowrap',
                    'max-width': '100%',
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                  }}
                >
                  {str(s.ref)}
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={textConf || readingConf}>
        <div
          style={{
            display: 'flex',
            'flex-wrap': 'wrap',
            gap: '1.1rem',
            'margin-top': '0.75rem',
            'padding-top': '0.55rem',
            'border-top': '1px solid #eee',
            'font-size': '0.66rem',
            'font-family': 'ui-monospace, monospace',
            color: '#9a8d76',
          }}
        >
          <Show when={textConf}>
            <TidbitConf label={t('tidbit.conf.text')} level={textConf} />
          </Show>
          <Show when={readingConf}>
            <TidbitConf label={t('tidbit.conf.reading')} level={readingConf} />
          </Show>
        </div>
      </Show>
    </div>
  );
}

// The essay is the tidbit.essay aggregate's own output → render it via the
// per-mark renderer seam in MarkEnrichmentCards (so caching/polling/telemetry
// stay shared) rather than the deps_resolved channel.
registerMarkRenderer('tidbit', TidbitEssayView);
// Bi'yun reuses the same essay renderer (its output has no `flavor`, so the
// flavor tag simply doesn't render); only the panel accent + title differ.
registerMarkRenderer('biyun', TidbitEssayView);
// tidbit + biyun are recipe-driven (TIDBIT_RECIPE / BIYUN_RECIPE → CARD_DEFS):
// header + synthesis, the essay rendering through the seam registered above.

interface PasukDetail {
  ref: string;
  heRef: string | null;
  he: string;
  en: string;
  prevRef: string | null;
  nextRef: string | null;
  error?: string;
}

async function fetchPasuk(ref: string): Promise<PasukDetail> {
  const res = await fetch(`/api/pasuk?ref=${encodeURIComponent(ref)}`);
  return res.json() as Promise<PasukDetail>;
}

// ===========================================================================
// Rabbi body
// ---------
// Top    : name + nameHe + era/region/places meta line
// Middle : synthesis paragraph (existing MarkEnrichmentCards on `rabbi`).
//          Synthesis aggregate's deps_resolved carries rabbi.relationships,
//          rabbi.geography, and both .evidence enrichments.
// Below  : RabbiLineageTree + RabbiGeographyCard read from those resolved
//          deps. Items the daf actually mentions (via .evidence) get a
//          soft-highlight and clicking them paints the daf range.
// ===========================================================================
// Rabbi card — converted to a recipe (RABBI_RECIPE below). Its three custom
// sections are NAMED special blocks: the formatted meta line (generation / era /
// region / places, with the generation dot), the lineage tree, and the places
// timeline. The mark synthesis still receives the FLAT {name,…} instance via the
// recipe's synthInstance, so the rabbi mark_input — and its cache — is unchanged.

const EMPTY_GEN_MAP: Map<string, GenerationId> = new Map();

// Formatted identity meta: generation label + era + region + places, with the
// generation-color dot. Prefers the resolved rabbi.identity (deps) over the
// possibly-stub instance the rabbi was opened with.
function RabbiMeta(props: SpecialBlockProps): JSX.Element {
  const f = (): Record<string, unknown> => props.instance.fields;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const identity = (): IdentifiedRabbi | undefined => {
    const i = props.deps['rabbi.identity'] as IdentifiedRabbi | undefined;
    return i && typeof i.name === 'string' ? i : undefined;
  };
  const gen = () => GENERATION_BY_ID[f().generation as GenerationId];
  const effRegion = (): string => identity()?.region ?? str(f().region);
  const effPlaces = (): string[] =>
    identity()?.places ?? (f().places as string[] | undefined) ?? [];
  const regionLabel = (): string =>
    effRegion() === 'israel'
      ? t('geography.eretzYisrael')
      : effRegion() === 'bavel'
        ? t('geography.bavel')
        : effRegion();
  const metaParts = (): string[] => {
    const g = gen();
    const parts: string[] = [];
    if (g) parts.push(lang() === 'he' ? generationLabelHe(g) : g.label);
    if (g) parts.push(eraLabel(g.era));
    const rl = regionLabel();
    if (rl) parts.push(rl);
    const pl = effPlaces();
    if (pl.length > 0) parts.push(pl.join(', '));
    return parts;
  };
  // Homonym uncertainty: grounding refused to pin this name (genSource
  // 'ambiguous') because several registry rabbis share it — say so instead of
  // leaving an unexplained gray "unknown" era.
  const homonymNote = (): string | null => {
    const n = f().homonyms;
    if (f().genSource !== 'ambiguous' || typeof n !== 'number' || n <= 1) return null;
    return t('rabbi.generationUncertain', { count: n });
  };
  return (
    <Show when={metaParts().length > 0 || homonymNote()}>
      <div style={{ 'margin-bottom': '0.85rem' }}>
        <Show when={metaParts().length > 0}>
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '0.45rem',
              'font-size': '0.78rem',
              color: '#666',
              'flex-wrap': 'wrap',
              'line-height': 1.5,
            }}
          >
            <Show when={gen()}>
              <span
                style={{
                  display: 'inline-block',
                  width: '0.55rem',
                  height: '0.55rem',
                  'background-color': gen()!.color,
                  'border-radius': '50%',
                  'flex-shrink': 0,
                }}
              />
            </Show>
            <span>{metaParts().join(' · ')}</span>
          </div>
        </Show>
        <Show when={homonymNote()}>
          <div
            style={{
              'font-size': '0.74rem',
              color: '#8a6d1a',
              'line-height': 1.5,
              'margin-top': metaParts().length > 0 ? '0.2rem' : '0',
            }}
          >
            {homonymNote()}
          </div>
        </Show>
      </div>
    </Show>
  );
}

function RabbiLineage(props: SpecialBlockProps): JSX.Element {
  const f = (): Record<string, unknown> => props.instance.fields;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  // Clear any active reader-highlight when the rabbi changes (the old body did this).
  createEffect(() => {
    void props.instanceKey;
    props.onHighlightRange?.(null);
  });
  const rel = (): RelationshipsData | undefined => {
    const r = props.deps['rabbi.relationships'] as RelationshipsData | undefined;
    return r && Array.isArray(r.teachers) ? r : undefined;
  };
  const relEv = (): RelationshipsEvidence[] => {
    const e = props.deps['rabbi.relationships.evidence'] as
      | { evidence?: RelationshipsEvidence[] }
      | undefined;
    return e?.evidence ?? [];
  };
  const generationByName = (): Map<string, GenerationId> =>
    (props.extras?.generationByName as Map<string, GenerationId> | undefined) ?? EMPTY_GEN_MAP;
  return (
    <Show when={rel()}>
      {(r) => (
        <div style={{ position: 'relative' }}>
          <InspectDot
            instanceKey={props.instanceKey}
            leafId="rabbi.relationships"
            style={{ position: 'absolute', top: '0.2rem', right: 0, 'z-index': 2 }}
          />
          <RabbiLineageTree
            subjectName={str(f().name)}
            subjectGeneration={f().generation as GenerationId}
            data={r()}
            evidence={relEv()}
            generationByName={generationByName()}
            onHighlightRange={props.onHighlightRange ?? (() => {})}
          />
        </div>
      )}
    </Show>
  );
}

function RabbiGeography(props: SpecialBlockProps): JSX.Element {
  const geo = (): GeographyData | undefined => {
    const g = props.deps['rabbi.geography'] as GeographyData | undefined;
    return g && (g.birthplace || Array.isArray(g.primaryStudyPlaces)) ? g : undefined;
  };
  const geoEv = (): GeographyEvidence[] => {
    const e = props.deps['rabbi.geography.evidence'] as
      | { evidence?: GeographyEvidence[] }
      | undefined;
    return e?.evidence ?? [];
  };
  const loc = (): LocationInference | null => {
    const l = props.deps['rabbi.location'] as LocationInference | undefined;
    return l && typeof l.place === 'string' && l.place.length > 0 ? l : null;
  };
  return (
    <Show when={geo()}>
      {(g) => (
        <div style={{ position: 'relative' }}>
          <InspectDot
            instanceKey={props.instanceKey}
            leafId="rabbi.geography"
            style={{ position: 'absolute', top: '0.2rem', right: 0, 'z-index': 2 }}
          />
          <RabbiTrajectoryMap
            data={g()}
            evidence={geoEv()}
            location={loc()}
            onHighlightRange={props.onHighlightRange ?? (() => {})}
          />
        </div>
      )}
    </Show>
  );
}

// "Across the Talmud" — the accumulated reverse-index (rabbi.observations),
// fetched lazily by the rabbi's canonical slug. The LIVING counterpart to the
// static geography biography above it: it grows as more dapim are studied.
function RabbiObservationsBlock(props: SpecialBlockProps): JSX.Element {
  const slug = (): string | null => {
    const i = props.deps['rabbi.identity'] as IdentifiedRabbi | undefined;
    return i?.slug ?? null;
  };
  return <RabbiObservations slug={slug()} />;
}

/** Display instance ({fields} for the heading + meta). genSource/homonyms are
 *  the grounding stamps RabbiMeta uses to surface homonym uncertainty. */
export function rabbiDisplayInstance(rabbi: IdentifiedRabbi): { fields: Record<string, unknown> } {
  return {
    fields: {
      name: rabbi.name,
      nameHe: rabbi.nameHe,
      generation: rabbi.generation,
      region: rabbi.region,
      places: rabbi.places,
      genSource: rabbi.genSource,
      homonyms: rabbi.homonyms,
    },
  };
}
/** The FLAT shape the rabbi mark synthesis expects as mark_input. Cache-key
 *  safe: instanceIdOf keys this shape off `name` (we never set `id`), so the
 *  grounding stamps below don't shift any enrichment cache key. slug/genSource/
 *  homonyms are how the server short-circuits (rabbi.identity / .relationships
 *  / .observations) see the mark's grounding verdict — without them the server
 *  re-resolves by NAME (first-wins, homonym-blind) and can re-pin an
 *  ambiguous "Rav Kahana" to the wrong registry entry. */
export function rabbiSynthInstance(rabbi: IdentifiedRabbi): unknown {
  return {
    name: rabbi.name,
    nameHe: rabbi.nameHe,
    generation: rabbi.generation,
    region: rabbi.region,
    places: rabbi.places,
    ...(rabbi.slug ? { slug: rabbi.slug } : {}),
    ...(rabbi.genSource ? { genSource: rabbi.genSource } : {}),
    ...(typeof rabbi.homonyms === 'number' ? { homonyms: rabbi.homonyms } : {}),
  };
}
export const RABBI_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'rabbi-meta': RabbiMeta,
  'rabbi-lineage': RabbiLineage,
  'rabbi-geography': RabbiGeography,
  'rabbi-observations': RabbiObservationsBlock,
};

// ===========================================================================
// Halacha body
// ------------
// Top   : topic title + Hebrew label + anchor excerpt
// Mid   : synthesis paragraph via MarkEnrichmentCards(markId="halacha"). Its
//         deps_resolved carries halacha.codification, halacha.practical,
//         halacha.disputes.
// Below : structured RulingRows (Mishneh Torah / Tur / Shulchan Aruch / Rema),
//         Practical card (lechatchila/bedieved/applies-when/exceptions),
//         Disputes card (rendered only when non-empty).
// ===========================================================================

interface PracticalRow {
  when: string;
  value: string;
}
interface PracticalData {
  shape: 'best-fallback' | 'statement' | 'taxonomy';
  best: string;
  fallback: string;
  statement: string;
  rows: PracticalRow[];
  note: string;
}
/** Old practical shape, still served during the cache-bump stale window
 *  (stale-while-revalidate). Normalized into the new shape so the card renders
 *  cleanly until the v5 value lands. */
interface PracticalLegacy {
  lechatchila?: string;
  bedieved?: string;
  appliesWhen?: string[];
  exceptions?: string[];
  prose?: string;
}
function normalizePractical(raw: unknown): PracticalData | undefined {
  const d = raw as (Partial<PracticalData> & PracticalLegacy) | undefined;
  if (!d) return undefined;
  if (typeof d.shape === 'string') return d as PracticalData;
  // Legacy → best-fallback, dropping the retired appliesWhen pills; the most
  // important old exception becomes the single note.
  if (typeof d.prose === 'string' || typeof d.lechatchila === 'string') {
    return {
      shape: 'best-fallback',
      best: d.lechatchila ?? '',
      fallback: d.bedieved ?? '',
      statement: '',
      rows: [],
      note: (d.exceptions ?? []).filter(Boolean)[0] ?? '',
    };
  }
  return undefined;
}
interface DisputePosition {
  voice: string;
  side: 'a' | 'b' | 'neutral';
  stance: string;
  ref: string;
}
interface DisputeData {
  present: boolean;
  axis: string;
  label: string;
  positions: DisputePosition[];
  sephardi: string;
  ashkenazi: string;
  settled: string;
}

// Halacha codification: the codifier lineage as a CodificationMap — Gemara →
// Rambam → Tur → Shulchan Aruch, with a present Rema folded in as the
// Mechaber/Rema disagree edge. A NAMED special block reading the
// halacha.codification leaf (the {mishnehTorah,tur,shulchanAruch,rema,prose}
// shape) and mapping it via codeMapFromCodification.
function HalachaCodification(props: SpecialBlockProps): JSX.Element {
  const codification = (): CodificationData | undefined => {
    const d = props.deps['halacha.codification'] as CodificationData | undefined;
    return d && typeof d.prose === 'string' ? d : undefined;
  };
  const map = () => {
    const cod = codification();
    const dafRef =
      lang() === 'he' ? dafRefHe(props.tractate, props.page) : `${props.tractate} ${props.page}`;
    return cod ? codeMapFromCodification(cod, dafRef) : null;
  };
  return (
    <Show when={map()}>
      {(m) => (
        <div style={{ 'margin-top': '0.9rem', position: 'relative' }}>
          <div
            style={{
              'font-size': '0.7rem',
              'text-transform': 'uppercase',
              'letter-spacing': '0.08em',
              color: '#888',
              'margin-bottom': '0.5rem',
              display: 'flex',
              'align-items': 'center',
              gap: '0.4rem',
            }}
          >
            <span>{t('halacha.codification')}</span>
            <InspectDot
              instanceKey={props.instanceKey}
              leafId="halacha.codification"
              style={{ 'margin-left': 'auto' }}
            />
          </div>
          <CodificationMap nodes={m().nodes} edges={m().edges} />
        </div>
      )}
    </Show>
  );
}

// Shape-aware practical "what to do": best/fallback rows, a single statement
// line, or a case→answer map — chosen by `shape`. Plain English leads, Hebrew
// term as a tag. The old applies-when / exceptions pill lists are retired (an
// optional single `note` carries the one key caveat).
const PRACTICAL_LABEL_STYLE: JSX.CSSProperties = {
  'font-size': '0.65rem',
  color: '#999',
  'text-transform': 'uppercase',
  'letter-spacing': '0.06em',
  'margin-bottom': '0.15rem',
};
const PRACTICAL_TEXT_STYLE: JSX.CSSProperties = {
  'font-size': '0.88rem',
  color: '#222',
  'line-height': 1.5,
};

function PracticalLine(props: { heTag: string; label: string; text: string }): JSX.Element {
  return (
    <div style={{ 'margin-bottom': '0.4rem' }}>
      <div style={PRACTICAL_LABEL_STYLE}>
        <span
          lang="he"
          dir="ltr"
          style={{
            'font-family': '"Mekorot Vilna", serif',
            'font-size': '0.85rem',
            'text-transform': 'none',
            color: '#666',
          }}
        >
          {props.heTag}
        </span>
        <span style={{ 'margin-left': '0.35rem' }}>{props.label}</span>
      </div>
      <div style={PRACTICAL_TEXT_STYLE}>
        <HebraizedWithRabbis text={props.text} />
      </div>
    </div>
  );
}

function HalachaPractical(props: SpecialBlockProps): JSX.Element {
  const practical = (): PracticalData | undefined =>
    normalizePractical(props.deps['halacha.practical']);
  return (
    <Show when={practical()}>
      {(pr) => (
        <SectionCard
          label="halacha.practical"
          inspect={{ instanceKey: props.instanceKey, leafId: 'halacha.practical' }}
        >
          <Switch>
            <Match when={pr().shape === 'best-fallback'}>
              <Show when={pr().best}>
                <PracticalLine heTag="לכתחילה" label={t('halacha.lechatchila')} text={pr().best} />
              </Show>
              <Show when={pr().fallback}>
                <PracticalLine heTag="בדיעבד" label={t('halacha.bedieved')} text={pr().fallback} />
              </Show>
            </Match>
            <Match when={pr().shape === 'taxonomy'}>
              {/* Stacked case → value, NOT a 2-column grid: values can be full
                  sentences (a side-by-side column squeezes them to one word per
                  line in the narrow sidebar). The value sits under its case with
                  a left accent — reads cleanly whether short (food → bracha) or
                  a full clause. */}
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem' }}>
                <For each={pr().rows}>
                  {(row) => (
                    <div>
                      <div
                        style={{
                          'font-size': '0.82rem',
                          color: '#555',
                          'line-height': 1.4,
                          'margin-bottom': '0.15rem',
                        }}
                      >
                        <Hebraized text={row.when} capitalize />
                      </div>
                      <div
                        style={{
                          'font-size': '0.88rem',
                          color: '#161616',
                          'font-weight': 500,
                          'line-height': 1.5,
                          'padding-left': '0.6rem',
                          'border-left': '2px solid #e3ddcb',
                        }}
                      >
                        <HebraizedWithRabbis text={row.value} />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Match>
            <Match when={pr().shape === 'statement'}>
              <div style={PRACTICAL_TEXT_STYLE}>
                <HebraizedWithRabbis text={pr().statement} />
              </div>
            </Match>
          </Switch>
          <Show when={pr().note}>
            <div
              style={{
                'margin-top': '0.5rem',
                'font-size': '0.8rem',
                color: '#6b5e3a',
                background: '#fcf7ea',
                border: '1px solid #ecdfbe',
                'border-radius': '5px',
                padding: '0.4rem 0.55rem',
                'line-height': 1.45,
              }}
            >
              <span style={{ 'font-weight': 600 }}>{t('halacha.note')}: </span>
              <HebraizedWithRabbis text={pr().note} />
            </div>
          </Show>
        </SectionCard>
      )}
    </Show>
  );
}

// Halacha dispute: ONE grounded dispute object — shown only when present. The
// practical consequence (Sephardi / Ashkenazi) leads; the positions are listed
// with a side-colour dot in the Voices palette. Built from codification + the
// dafyomi poskim context (where the daf is ingested).
function HalachaDispute(props: SpecialBlockProps): JSX.Element {
  const dispute = (): DisputeData | undefined => {
    const d = props.deps['halacha.dispute'] as DisputeData | undefined;
    return d && d.present === true ? d : undefined;
  };
  return (
    <Show when={dispute()}>
      {(d) => (
        <SectionCard
          label="halacha.dispute"
          inspect={{ instanceKey: props.instanceKey, leafId: 'halacha.dispute' }}
        >
          <Show when={d().label}>
            <div
              style={{
                'font-weight': 500,
                color: '#333',
                'font-size': '0.88rem',
                'margin-bottom': '0.3rem',
              }}
            >
              {d().label}
              <Show when={d().axis && d().axis !== 'none'}>
                <span
                  style={{
                    'font-size': '0.65rem',
                    color: '#999',
                    'margin-left': '0.4rem',
                    'text-transform': 'uppercase',
                    'letter-spacing': '0.06em',
                  }}
                >
                  {axisLabel(d().axis)}
                </span>
              </Show>
            </div>
          </Show>
          <Show when={d().sephardi || d().ashkenazi}>
            <div
              style={{
                display: 'flex',
                'flex-direction': 'column',
                gap: '0.25rem',
                'margin-bottom': '0.4rem',
              }}
            >
              <Show when={d().sephardi}>
                <div style={{ 'font-size': '0.84rem', 'line-height': 1.45, color: '#222' }}>
                  <span
                    lang="he"
                    dir="ltr"
                    style={{ 'font-family': '"Mekorot Vilna", serif', color: '#1a3e7e' }}
                  >
                    ספרד
                  </span>
                  <span
                    style={{
                      'font-family': 'system-ui, sans-serif',
                      'font-size': '0.68rem',
                      'font-weight': 700,
                      color: '#1a3e7e',
                      margin: '0 0.35rem',
                    }}
                  >
                    SEPHARDI
                  </span>
                  <HebraizedWithRabbis text={d().sephardi} />
                </div>
              </Show>
              <Show when={d().ashkenazi}>
                <div style={{ 'font-size': '0.84rem', 'line-height': 1.45, color: '#222' }}>
                  <span
                    lang="he"
                    dir="ltr"
                    style={{ 'font-family': '"Mekorot Vilna", serif', color: '#7e1a1a' }}
                  >
                    אשכנז
                  </span>
                  <span
                    style={{
                      'font-family': 'system-ui, sans-serif',
                      'font-size': '0.68rem',
                      'font-weight': 700,
                      color: '#7e1a1a',
                      margin: '0 0.35rem',
                    }}
                  >
                    ASHKENAZI
                  </span>
                  <HebraizedWithRabbis text={d().ashkenazi} />
                </div>
              </Show>
            </div>
          </Show>
          <For each={d().positions}>
            {(p) => (
              <div
                style={{
                  'font-size': '0.82rem',
                  'line-height': 1.5,
                  color: '#444',
                  'margin-bottom': '0.2rem',
                  display: 'flex',
                  gap: '0.4rem',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    'border-radius': '50%',
                    background: SIDE_COLOR[p.side],
                    'flex-shrink': 0,
                    'margin-top': '0.35rem',
                  }}
                />
                <div>
                  <span style={{ 'font-weight': 600, color: '#222' }}>
                    {p.voice}
                    {p.ref ? ` (${p.ref})` : ''}:
                  </span>{' '}
                  <HebraizedWithRabbis text={p.stance} />
                </div>
              </div>
            )}
          </For>
          <Show when={d().settled}>
            <div
              style={{
                'font-size': '0.78rem',
                color: '#666',
                'font-style': 'italic',
                'margin-top': '0.25rem',
              }}
            >
              <HebraizedWithRabbis text={d().settled} />
            </div>
          </Show>
        </SectionCard>
      )}
    </Show>
  );
}

/** The halacha mark-instance shape (mark_input for the leaves). */
async function fetchDerivation(args: {
  tractate: string;
  page: string;
  refs: string[];
}): Promise<DerivationSource[]> {
  if (args.refs.length === 0) return [];
  const qs = args.refs.map((r) => `ref=${encodeURIComponent(r)}`).join('&');
  const r = await fetch(
    `/api/derivation/${encodeURIComponent(args.tractate)}/${encodeURIComponent(args.page)}?${qs}`,
  );
  if (!r.ok) return [];
  const j = (await r.json()) as { sources?: DerivationSource[] };
  return j.sources ?? [];
}

const DERIVATION_ROLE_KEY: Record<DerivationSource['role'], CatalogKey> = {
  primary: 'halacha.role.primary',
  related: 'halacha.role.related',
  root: 'halacha.role.root',
};

// `parseBavliRef` (imported from lib/halacha/codifiers) turns a Bavli source
// ref into the tractate + page this reader navigates by. Tanakh roots and
// Yerushalmi refs return null — not dapim here — so they stay non-clickable.

// Same `?tractate=&page=` URL contract the overview cross-references use. The
// href is real (middle-click / open-in-new-tab work); onClick keeps the SPA
// navigation in the common case.
function dafHref(target: { tractate: string; page: string }): string {
  const u = new URL(window.location.href);
  u.searchParams.set('tractate', target.tractate);
  u.searchParams.set('page', target.page);
  u.hash = '';
  return u.pathname + u.search;
}
function navigateToDaf(target: { tractate: string; page: string }): void {
  window.location.href = dafHref(target);
}

// Halacha "where it comes from": the gemara (+ scriptural) sources the codified
// ruling derives from. Reads the codifier refs off the halacha.codification leaf
// and fetches the deterministic /api/derivation (reverse Sefaria). The current
// daf is highlighted — a card belongs to its codified law and surfaces on every
// daf that is a source for it.
function HalachaDerivation(props: SpecialBlockProps): JSX.Element {
  const refs = (): string[] => {
    const d = props.deps['halacha.codification'] as CodificationData | undefined;
    if (!d) return [];
    return [d.mishnehTorah?.ref, d.tur?.ref, d.shulchanAruch?.ref].filter(
      (r): r is string => typeof r === 'string' && r.trim().length > 0,
    );
  };
  const [sources] = createResource(
    () => ({ tractate: props.tractate, page: props.page, refs: refs() }),
    fetchDerivation,
  );
  return (
    <Show when={(sources() ?? []).length > 0}>
      <div style={{ 'margin-top': '0.9rem' }}>
        <div
          style={{
            'font-size': '0.7rem',
            'text-transform': 'uppercase',
            'letter-spacing': '0.08em',
            color: '#888',
            'margin-bottom': '0.5rem',
          }}
        >
          {t('halacha.derivation')}
        </div>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.4rem' }}>
          <For each={sources()}>
            {(s) => {
              // Bavli sources (other than the current daf) navigate to that daf.
              const target = s.kind === 'bavli' && !s.isCurrent ? parseBavliRef(s.ref) : null;
              // In Hebrew mode a Bavli ref reads as the Hebrew daf form; Tanakh /
              // Yerushalmi refs keep their own string (no Hebrew daf shape).
              const refLabel = (): string => {
                if (lang() === 'he' && s.kind === 'bavli') {
                  const p = parseBavliRef(s.ref);
                  if (p) return dafRefHe(p.tractate, p.page);
                }
                return s.ref;
              };
              const rowStyle: JSX.CSSProperties = {
                display: 'flex',
                'align-items': 'baseline',
                gap: '0.5rem',
                background: s.isCurrent ? '#fdf2f2' : '#fff',
                border: s.isCurrent ? '1.5px solid #8a2a2b' : '1px solid #e4e0d4',
                'border-radius': '8px',
                padding: '0.4rem 0.6rem',
                'box-shadow': '0 1px 1.4px rgba(58,51,32,0.1)',
                'text-decoration': 'none',
                cursor: target ? 'pointer' : 'default',
              };
              const inner = (
                <>
                  <span
                    style={{
                      'font-family': 'system-ui, -apple-system, sans-serif',
                      'font-size': '0.82rem',
                      'font-weight': 600,
                      color: '#2a2723',
                    }}
                  >
                    {refLabel()}
                  </span>
                  {/* Corpus badge — shared with the overview chips. Only the
                      Yerushalmi shows one; Bavli + Tanakh read for themselves. */}
                  <CorpusBadge corpus={s.kind === 'tanakh' ? 'other' : s.kind} />
                  <span
                    style={{
                      'font-family': 'system-ui, -apple-system, sans-serif',
                      'font-size': '0.62rem',
                      'text-transform': 'uppercase',
                      'letter-spacing': '0.04em',
                      color: '#9a958a',
                    }}
                  >
                    {t(DERIVATION_ROLE_KEY[s.role])}
                  </span>
                  <Show when={s.isCurrent}>
                    <span
                      style={{
                        'margin-left': 'auto',
                        'font-family': 'system-ui, -apple-system, sans-serif',
                        'font-size': '0.58rem',
                        'font-weight': 700,
                        color: '#fff',
                        background: '#8a2a2b',
                        'border-radius': '3px',
                        padding: '0.05rem 0.3rem',
                        'flex-shrink': 0,
                      }}
                    >
                      {t('halacha.youAreHere')}
                    </span>
                  </Show>
                  <Show when={target}>
                    <span
                      aria-hidden="true"
                      style={{
                        'margin-left': 'auto',
                        color: '#b8b2a4',
                        'font-size': '0.95rem',
                        'line-height': 1,
                        'flex-shrink': 0,
                      }}
                    >
                      ›
                    </span>
                  </Show>
                </>
              );
              return (
                <Show when={target} fallback={<div style={rowStyle}>{inner}</div>}>
                  <a
                    href={dafHref(target!)}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateToDaf(target!);
                    }}
                    title={t('overview.goToDaf', { daf: refLabel() })}
                    style={rowStyle}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#8a2a2b';
                      e.currentTarget.style.background = '#fbf6f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e4e0d4';
                      e.currentTarget.style.background = '#fff';
                    }}
                  >
                    {inner}
                  </a>
                </Show>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
}

export function halachaInstance(topic: HalachaTopic): {
  fields: Record<string, unknown>;
  startSegIdx: number;
  endSegIdx: number;
} {
  return {
    startSegIdx: 0,
    endSegIdx: 0,
    fields: {
      topic: topic.topic,
      topicHe: topic.topicHe ?? '',
      summary: '',
      excerpt: topic.excerpt ?? '',
    },
  };
}
export const HALACHA_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'halacha-codification': HalachaCodification,
  'halacha-practical': HalachaPractical,
  'halacha-derivation': HalachaDerivation,
  'halacha-dispute': HalachaDispute,
};

// ---------------------------------------------------------------------------
// Chart (experimental) — the whole card IS the comparison table. The instance
// fields carry {headers, rows, notes}; ChartTableView renders the RTL grid.
// ---------------------------------------------------------------------------

export function chartInstance(chart: ChartTable): {
  fields: Record<string, unknown>;
  startSegIdx: number;
  endSegIdx: number;
} {
  return {
    startSegIdx: chart.startSegIdx ?? 0,
    endSegIdx: chart.endSegIdx ?? chart.startSegIdx ?? 0,
    fields: {
      caption: chart.caption ?? '',
      captionHe: chart.captionHe ?? '',
      headers: chart.headers,
      rows: chart.rows,
      notes: chart.notes ?? [],
      grounded: chart.grounded ?? false,
    },
  };
}

type BiCell = { en?: string; he?: string };
function ChartTableBlock(props: SpecialBlockProps): JSX.Element {
  const f = () =>
    props.instance.fields as {
      headers?: BiCell[];
      rows?: BiCell[][];
      notes?: { marker: string; en?: string; he?: string }[];
    };
  const he = () => lang() === 'he';
  // Resolve each bilingual cell to the reader's language (fall back to the
  // other language if one side is missing).
  const pick = (c: BiCell | undefined): string => (he() ? c?.he || c?.en : c?.en || c?.he) ?? '';
  const headers = () => (f().headers ?? []).map(pick);
  const rows = () => (f().rows ?? []).map((r) => r.map(pick));
  const notes = () =>
    (f().notes ?? []).map((n) => ({
      marker: n.marker,
      text: (he() ? n.he || n.en : n.en || n.he) ?? '',
    }));
  return (
    <Show when={(f().headers?.length ?? 0) > 0 && (f().rows?.length ?? 0) > 0}>
      <ChartTableView
        table={{ headers: headers(), rows: rows(), notes: notes() }}
        dir={he() ? 'rtl' : 'ltr'}
        lang={he() ? 'he' : 'en'}
        accent="#0e7490"
      />
    </Show>
  );
}

export const CHART_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'chart-table': ChartTableBlock,
};

// ---------------------------------------------------------------------------
// Geography map block — renders the computed `geography` mark's DafGeoModel
// (the two region cards). The model + the daf's interaction callbacks ride in
// via `extras` (the model lives in the mark run, the callbacks in DafViewer);
// the block itself is a thin GeographyMap mount, so the registry-fed mark
// instance — not client-assembled data — is what's drawn.
// ---------------------------------------------------------------------------

/** The geography card's `extras` bundle: the computed model + the daf's
 *  highlight/navigation callbacks, assembled by DafViewer. */
export interface GeographyExtras {
  model: DafGeoModel | null;
  /** True while a dependency mark (rabbi, or places-if-loading) is still
   *  resolving — so an empty/null model isn't yet trustworthy. The block shows
   *  a loading line instead of the terminal "no rabbis" message. */
  loading: boolean;
  activeLocation: string | null;
  activePlace: string | null;
  generationByName: Map<string, GenerationId> | null;
  onHighlightLocation: (cityName: string | null, rabbiNames: string[]) => void;
  onHighlightSingleRabbi: (rabbiName: string, slug?: string) => void;
  onHoverRabbi: (rabbiName: string | null) => void;
  onHighlightPlace: (cityName: string | null) => void;
}

function GeographyMapBlock(props: SpecialBlockProps): JSX.Element {
  const ex = (): GeographyExtras | undefined => props.extras as GeographyExtras | undefined;
  const model = (): DafGeoModel | null => ex()?.model ?? null;
  const hasMap = (): boolean => !!model() && !model()!.empty;
  return (
    <Show
      when={hasMap()}
      fallback={
        // No map yet. If a dependency mark is still resolving, the empty/null
        // model isn't trustworthy — show a loading line (italic muted, matching
        // pasuk.loading) rather than the terminal "no rabbis" message, which
        // would pin a false-empty until reload. Only once loading settles and
        // the model is still empty do we show the terminal copy.
        <Show
          when={ex()?.loading}
          fallback={
            <p style={{ margin: '0.4rem 0 0', color: '#888', 'font-size': '0.82rem' }}>
              {t('geography.empty')}
            </p>
          }
        >
          <p
            style={{
              margin: '0.4rem 0 0',
              color: '#999',
              'font-style': 'italic',
              'font-size': '0.82rem',
            }}
          >
            {t('geography.loading')}
          </p>
        </Show>
      }
    >
      <GeographyMap
        model={model()!}
        layout="column"
        activeLocation={ex()?.activeLocation ?? null}
        activePlace={ex()?.activePlace ?? null}
        generationByName={ex()?.generationByName ?? null}
        onHighlightLocation={(c, r) => ex()?.onHighlightLocation(c, r)}
        onHighlightSingleRabbi={(n, s) => ex()?.onHighlightSingleRabbi(n, s)}
        onHoverRabbi={(n) => ex()?.onHoverRabbi(n)}
        onHighlightPlace={(n) => ex()?.onHighlightPlace(n)}
      />
    </Show>
  );
}

export const GEOGRAPHY_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'geography-map': GeographyMapBlock,
};

/** Sidebar panel for a cited pasuk: shows the full Hebrew Tanakh verse and,
 *  on expand, the surrounding verses inlined as one continuous Hebrew block
 *  (prev + cited + next) with the cited verse rendered dark and the others
 *  dimmed so the citation still stands out. */
// The pasuk card's custom header + verse block: the fetched Hebrew verse
// reference as the heading, the verse text (Tanakh font), and the prev/next
// verses shown dimmed while expanded. A NAMED special block referenced first in
// PASUK_RECIPE — everything below it (synthesis + the four explainers + Q&A) is
// standard recipe vocabulary.
function PasukVerse(props: SpecialBlockProps): JSX.Element {
  const verseRef = (): string =>
    typeof props.instance.fields.verseRef === 'string' ? props.instance.fields.verseRef : '';
  const [expanded, setExpanded] = createSignal(true);
  const [detail] = createResource(verseRef, fetchPasuk);
  const [prev] = createResource(
    () => (expanded() ? (detail()?.prevRef ?? null) : null),
    (r) => fetchPasuk(r),
  );
  const [next] = createResource(
    () => (expanded() ? (detail()?.nextRef ?? null) : null),
    (r) => fetchPasuk(r),
  );
  return (
    <>
      {/* Hebrew verse ref heading — the card's real header (fetched, so it can't
          be a static recipe title; the recipe omits titleField for this). */}
      <h3
        dir="rtl"
        lang="he"
        style={{
          margin: '0 0 0.3rem',
          'font-size': '1.05rem',
          color: ACCENTS.pesuk,
          'font-family': HE_FONT,
        }}
      >
        {detail()?.heRef ?? verseRef()}
      </h3>
      <Show when={detail.loading && !detail()}>
        <p style={{ color: '#999', 'font-style': 'italic', margin: '0 0 0.5rem' }}>
          {t('pasuk.loading')}
        </p>
      </Show>
      {/* Verse text in the Tanakh font variant — the widened fallback chain so
          cantillation te'amim resolve where Mekorot Vilna has no glyph; prev /
          next context dimmed and shown only while expanded. */}
      <HebrewProse variant="tanakh" size="1.05rem" margin="0 0 0.4rem" lineHeight={1.85}>
        <Show when={expanded() && prev()?.he}>
          <span style={{ color: '#a8a29e' }}>{prev()!.he} </span>
        </Show>
        <Show when={detail()?.he}>
          <span style={{ color: '#451a03' }}>{detail()!.he}</span>
        </Show>
        <Show when={expanded() && next()?.he}>
          <span style={{ color: '#a8a29e' }}> {next()!.he}</span>
        </Show>
      </HebrewProse>
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        style={{
          background: 'none',
          border: 'none',
          padding: '0.15rem 0',
          margin: '0.1rem 0 0.7rem',
          color: '#a8a29e',
          cursor: 'pointer',
          font: 'inherit',
          'font-size': '0.62rem',
          'letter-spacing': '0.06em',
          'text-transform': 'uppercase',
        }}
        title={expanded() ? t('pasuk.verses.hide') : t('pasuk.verses.show')}
      >
        {expanded() ? `› ${t('common.collapse')} ‹` : `‹ ${t('common.expand')} ›`}
      </button>
    </>
  );
}

/** The pasuk mark-instance shape (mark_input for the pesukim leaves). Seg indices
 *  are passed through as-is (may be undefined) — coercing an absent index to 0
 *  would mis-scope a malformed pasuk to segment 0, which the old panel avoided. */
export function pasukInstance(pasuk: Pasuk): {
  fields: Record<string, unknown>;
  startSegIdx?: number;
  endSegIdx?: number;
} {
  return {
    startSegIdx: pasuk.startSegIdx,
    endSegIdx: pasuk.endSegIdx,
    fields: {
      verseRef: pasuk.verseRef,
      citationStyle: pasuk.citationStyle,
      excerpt: pasuk.excerpt,
      summary: pasuk.summary,
    },
  };
}
export const PASUK_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'pasuk-verse': PasukVerse,
};

// ===========================================================================
// Aggadata — per-story narrative sidebar panel.
// ---------------------------------------------------------------------------
// Top   : story title + Hebrew label + theme chip + summary
// Mid   : synthesis paragraph via MarkEnrichmentCards(markId="aggadata"). Its
//         deps_resolved carries aggadata.background / aggadata.interpretation /
//         aggadata.parallels.
// Below : structured leaf cards (Background, Interpretation, Parallels) so
//         the user can read each lens independently rather than parsing the
//         synthesis wall of text.
// Bottom: QAPanel for suggested-questions + free-form Q&A.
// ===========================================================================

type AggadataParallelKind = 'same-story' | 'same-actors' | 'same-motif' | 'tanach-source';
interface AggadataParallelItem {
  ref: string;
  kind: AggadataParallelKind;
  note: string;
}
interface AggadataParallelsData {
  parallels: AggadataParallelItem[];
  prose: string;
}

// The genuinely-custom part of the aggadata card: cross-text parallels with kind
// badges. A NAMED special block referenced from AGGADATA_RECIPE.
function AggadataParallels(props: SpecialBlockProps): JSX.Element {
  const pa = (): AggadataParallelsData | null => {
    const p = props.deps['aggadata.parallels'] as AggadataParallelsData | undefined;
    return p && Array.isArray(p.parallels) && (p.parallels.length > 0 || p.prose) ? p : null;
  };
  return (
    <Show when={pa()}>
      {(p) => (
        <SectionCard
          label="aggadata.parallels"
          inspect={{ instanceKey: props.instanceKey, leafId: 'aggadata.parallels' }}
        >
          <Show when={p().prose}>
            <div
              style={{
                'font-size': '0.82rem',
                color: '#555',
                'line-height': 1.5,
                'font-style': 'italic',
                'margin-bottom': '0.5rem',
              }}
            >
              <HebraizedWithRabbis text={p().prose} />
            </div>
          </Show>
          <For each={p().parallels}>
            {(par) => (
              <div style={{ 'margin-bottom': '0.5rem' }}>
                <div
                  style={{
                    'margin-bottom': '0.15rem',
                    display: 'flex',
                    'align-items': 'baseline',
                    gap: '0.4rem',
                    'flex-wrap': 'wrap',
                  }}
                >
                  <span style={{ 'font-weight': 600, color: '#1e40af', 'font-size': '0.85rem' }}>
                    {par.ref}
                  </span>
                  <span
                    style={{
                      'font-size': '0.65rem',
                      padding: '0.1rem 0.4rem',
                      background: '#faf5ff',
                      border: '1px solid #d8b4fe',
                      color: '#7c3aed',
                      'border-radius': '999px',
                      'text-transform': 'uppercase',
                      'letter-spacing': '0.06em',
                    }}
                  >
                    {t(`aggadata.parallel.${par.kind}`)}
                  </span>
                </div>
                <div style={{ 'font-size': '0.82rem', color: '#444', 'line-height': 1.5 }}>
                  <HebraizedWithRabbis text={par.note} />
                </div>
              </div>
            )}
          </For>
        </SectionCard>
      )}
    </Show>
  );
}

/** The aggadata card as a recipe: a theme tag, the story summary, the synthesis,
 *  two explainer boxes, the custom parallels block, then follow-up Q&A. */ export const AGGADATA_BLOCKS: Record<
  string,
  (p: SpecialBlockProps) => JSX.Element
> = {
  'aggadata-parallels': AggadataParallels,
};

/** Which sidebar kinds are recipe-driven today (the rest are still bespoke
 *  *Body components). The single source of truth for both the dispatch and the
 *  dev shelf's Recipe panel — adding an entry here as a card is converted makes
 *  it light up in the shelf automatically.
 *
 *  Invariant: any recipe whose sections expose inspect dots must include a
 *  `synthesis` section — that's what mounts the MarkEnrichmentCards host the
 *  inspect drawer renders inside. Without it the panel's 'i' targets an
 *  unmounted instanceKey (a dead click). */
/** The instanceKey a recipe-driven card mounts under (the client run memo + the
 *  inspect drawer are keyed by it). Single source of truth so the dispatch and
 *  the dev Recipe panel target the SAME drawer byte-for-byte. null for kinds not
 *  yet recipe-driven. */
export function instanceKeyForContent(
  content: SidebarContent,
  tractate: string,
  page: string,
): string | null {
  switch (content.kind) {
    // Matches the old ArgumentBody synthesis instanceKey byte-for-byte so the
    // run cache stays warm across this conversion.
    case 'argument':
      return `${content.section.startSegIdx}-${content.section.endSegIdx}-${content.section.title}`;
    case 'argument-overview':
      return `${tractate}/${page}/overview`;
    // Whole-daf essay/background cards — match the old *Body instanceKeys.
    case 'tidbit':
      return `${tractate}/${page}/tidbit`;
    case 'biyun':
      return `${tractate}/${page}/biyun`;
    case 'daf-background':
      return `${tractate}/${page}/background`;
    case 'geography':
      return `${tractate}/${page}/geography`;
    case 'aggadata':
      return `${tractate}:${page}:${content.index}:${content.story.title}`;
    case 'yerushalmi':
      return `${tractate}:${page}:${content.index}:${content.parallel.yerushalmiRef}`;
    case 'pesuk':
      return content.pasuk.verseRef;
    case 'halacha':
      return `${tractate}:${page}:${content.index}:${content.topic.topic}`;
    case 'chart':
      return `${tractate}:${page}:${content.index}:${content.chart.caption ?? content.chart.excerpt ?? ''}`;
    case 'rabbi':
      return content.rabbi.name;
    case 'rishonim':
      return `rishonim:${tractate}:${page}:${content.instance.segIdx}`;
    default:
      return null;
  }
}

/** The mark-instance shape the aggadata extractor emits (mark_input for leaves). */
export function aggadataInstance(story: AggadataStory): {
  fields: Record<string, unknown>;
  startSegIdx: number;
  endSegIdx: number;
} {
  return {
    startSegIdx: story.startSegIdx ?? 0,
    endSegIdx: story.endSegIdx ?? 0,
    fields: {
      title: story.title,
      titleHe: story.titleHe ?? '',
      summary: story.summary,
      excerpt: story.excerpt,
      endExcerpt: story.endExcerpt ?? '',
      theme: story.theme ?? '',
    },
  };
}

// ===========================================================================
// Yerushalmi — Bavli↔Yerushalmi parallel sidebar card.
// ---------------------------------------------------------------------------
// The card's whole point is the DIFFERENCES between the two Talmuds. The diff
// block leads with a one-line "what they share" summary (when present) and the
// labeled "Differences" box; the parallel block then shows the ACTUAL Jerusalem
// Talmud passage (fetched from the daf's cached yerushalmi bundle), collapsed by
// default. The ref is the Panel title (English / Hebrew). No synthesis — the
// `differences` field already IS the prose.
// ===========================================================================
function YerushalmiDiff(props: SpecialBlockProps): JSX.Element {
  const summary = (): string =>
    typeof props.instance.fields.summary === 'string' ? props.instance.fields.summary : '';
  const differences = (): string =>
    typeof props.instance.fields.differences === 'string' ? props.instance.fields.differences : '';
  // 'aligned' = the deterministic floor backstop placed this anchor (verbatim
  // shared text) but no written contrast was generated — flag it honestly so a
  // reader knows the box below isn't an analyzed difference.
  const autoAligned = (): boolean => props.instance.fields.placement === 'aligned';
  return (
    <>
      <Show when={summary()}>
        <p
          style={{
            margin: '0 0 0.7rem',
            color: '#555',
            'line-height': 1.55,
            'font-size': '0.86rem',
          }}
        >
          <HebraizedWithRabbis text={summary()} />
        </p>
      </Show>
      <Show when={differences()}>
        <SectionCard label="yerushalmi.differences">
          <Show when={autoAligned()}>
            <span
              style={{
                display: 'inline-block',
                margin: '0 0 0.4rem',
                padding: '0.08rem 0.4rem',
                'border-radius': '3px',
                background: '#eee',
                color: '#777',
                'font-size': '0.7rem',
                'letter-spacing': '0.03em',
                'text-transform': 'uppercase',
              }}
            >
              {t('yerushalmi.autoAligned')}
            </span>
          </Show>
          <div style={{ 'font-size': '0.88rem', color: '#222', 'line-height': 1.55 }}>
            <HebraizedWithRabbis text={differences()} />
          </div>
        </SectionCard>
      </Show>
    </>
  );
}

interface YerushalmiPassage {
  ref: string;
  heRef: string;
  hebrew: string;
  english: string;
}
interface YerushalmiCurated {
  ref: string;
  title: string;
  summary: string;
  url: string;
  bavliAnchor: string;
  hebrew: string;
  english: string;
}
interface YerushalmiData {
  parallels: YerushalmiPassage[];
  curated: YerushalmiCurated[];
}
async function fetchYerushalmiData(key: string): Promise<YerushalmiData> {
  const [tractate, page] = key.split('|');
  const res = await fetch(
    `/api/yerushalmi/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}`,
  );
  if (!res.ok) return { parallels: [], curated: [] };
  const data = (await res.json()) as {
    parallels?: YerushalmiPassage[];
    curated?: YerushalmiCurated[];
  };
  return {
    parallels: Array.isArray(data.parallels) ? data.parallels : [],
    curated: Array.isArray(data.curated) ? data.curated : [],
  };
}

/** The actual Jerusalem Talmud passage(s) for this daf — He + En, from the daf's
 *  cached yerushalmi bundle (the same text the mark was grounded on), plus any
 *  CURATED Bavli<->Yerushalmi parallels (hand-made cross-references, often
 *  cross-tractate, with an editorial summary + a link to the source). Collapsed
 *  by default; the differences above are the headline, this is the "show me the
 *  source" layer. One cached GET per card open. */
function YerushalmiParallelBlock(props: SpecialBlockProps): JSX.Element {
  const wantedRef = (): string =>
    typeof props.instance.fields.yerushalmiRef === 'string'
      ? props.instance.fields.yerushalmiRef
      : '';
  const [data] = createResource(() => `${props.tractate}|${props.page}`, fetchYerushalmiData);
  const curated = (): YerushalmiCurated[] => data()?.curated ?? [];
  const sefariaUrl = (ref: string): string =>
    `https://www.sefaria.org/${encodeURIComponent(ref.replace(/ /g, '_'))}`;
  return (
    <>
      {/* Link out to the full Yerushalmi — never reproduce the whole halacha
          inline. The differences above are the content; this is the source. */}
      <Show when={wantedRef()}>
        <a
          href={sefariaUrl(wantedRef())}
          target="_blank"
          rel="noopener"
          style={{
            display: 'inline-block',
            margin: '0.2rem 0 0.6rem',
            'font-size': '0.8rem',
            color: ACCENTS.yerushalmi,
            'text-decoration': 'none',
          }}
        >
          {t('yerushalmi.readOnSefaria')} ({wantedRef()}) ↗
        </a>
      </Show>
      <Show when={curated().length > 0}>
        <SectionCard label="yerushalmi.curatedParallel" collapsed={true}>
          <For each={curated()}>
            {(c) => (
              <div style={{ 'margin-bottom': '0.6rem' }}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener"
                  style={{
                    'font-weight': 600,
                    color: ACCENTS.yerushalmi,
                    'font-size': '0.9rem',
                    'text-decoration': 'none',
                  }}
                >
                  {c.title}
                </a>
                <div style={{ 'font-size': '0.7rem', color: '#888', margin: '0.1rem 0 0.3rem' }}>
                  {c.ref}
                </div>
                <p
                  style={{ 'font-size': '0.84rem', color: '#444', 'line-height': 1.55, margin: 0 }}
                >
                  {c.summary}
                </p>
              </div>
            )}
          </For>
        </SectionCard>
      </Show>
    </>
  );
}

export const YERUSHALMI_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'yerushalmi-diff': YerushalmiDiff,
  'yerushalmi-parallel': YerushalmiParallelBlock,
};

/** The mark-instance shape the yerushalmi extractor emits (mark_input for the
 *  synthesis). Seg indices feed segment-scoped enrichment context. */
export function yerushalmiInstance(parallel: YerushalmiParallel): {
  fields: Record<string, unknown>;
  startSegIdx: number;
  endSegIdx: number;
} {
  return {
    startSegIdx: parallel.startSegIdx ?? 0,
    endSegIdx: parallel.endSegIdx ?? 0,
    fields: {
      yerushalmiRef: parallel.yerushalmiRef,
      yerushalmiRefHe: parallel.yerushalmiRefHe ?? '',
      summary: parallel.summary,
      differences: parallel.differences,
      excerpt: parallel.excerpt,
    },
  };
}

// ---------------------------------------------------------------------------
// Rishonim — per-segment commentary digest panel.
// ---------------------------------------------------------------------------
//
// Mounted in the right sidebar when a rishonim gutter icon is clicked.
// MarkEnrichmentCards fires places.synthesis (which aggregates the
// daf-agnostic profile/significance/figures leaves) and renders it. The
// instanceKey mirrors the prefetcher's `places:<name>` so a warmed run is
// reused instantly. region/kind render as small chips above the card.
// The place mark's render hint: heading from `name`/`nameHe`, synthesis from the
// `places` enrichment. The skeleton (Panel + Synthesis) is now the generic
// SidebarPanelFromHint; only the place-specific chips remain bespoke. This hint
// is a client constant for now; the registry-driven step authors it on the mark
// definition in code-marks.ts so the client needs no per-mark wiring at all.
export const PLACES_HINT: SidebarHint = {
  kind: 'place',
  markId: 'places',
  titleField: 'name',
  titleHeField: 'nameHe',
  instanceKeyField: 'name',
};

/** Place-specific chrome: kind / region / also-known-as chips. The only part of
 *  the old PlaceBody that isn't captured by the generic hint. */
export function PlaceChips(props: { place: PlaceInstance }): JSX.Element {
  const f = () => props.place.fields;
  const regionLabel = (r: string): string =>
    r === 'israel'
      ? t('geography.eretzYisrael')
      : r === 'bavel'
        ? t('geography.bavel')
        : r === 'other'
          ? t('region.other')
          : r;
  const chip = (text: string): JSX.Element => (
    <span
      style={{
        'font-size': '0.65rem',
        color: '#9a3412',
        background: '#fff7ed',
        border: '1px solid #fed7aa',
        'border-radius': '999px',
        padding: '0.1rem 0.45rem',
        'text-transform': 'uppercase',
        'letter-spacing': '0.05em',
      }}
    >
      {text}
    </span>
  );
  return (
    <div
      style={{ display: 'flex', gap: '0.35rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.7rem' }}
    >
      <Show when={f().kind}>{chip(f().kind)}</Show>
      <Show when={f().region}>{chip(regionLabel(f().region))}</Show>
      <Show when={(f().knownAs ?? []).length > 0}>
        {chip(t('place.alsoKnownAs', { names: (f().knownAs ?? []).join(', ') }))}
      </Show>
    </div>
  );
}

// MarkEnrichmentCards handles the LLM synthesis (rishonim.synthesis) and
// the leaf walk; below it we render the primary-source Hebrew + English
// per rishon as collapsible details so the user can drop into Rashi /
// Tosafot / Ramban / etc. directly.
// Rishonim card — converted to a recipe (RISHONIM_RECIPE). The computed
// "on segment N" heading + the count line, and the primary-sources list, become
// NAMED special blocks (both read the instance, not synthesis deps). The mark
// synthesis still gets the real RishonimInstance via synthInstance, so its
// mark_input is unchanged.
function RishonimHeader(props: SpecialBlockProps): JSX.Element {
  const f = (): Record<string, unknown> => props.instance.fields;
  const segIdx = (): number => (f().segIdx as number | undefined) ?? 0;
  const commentCount = (): number => (f().commentCount as number | undefined) ?? 0;
  const works = (): string[] => (f().works as string[] | undefined) ?? [];
  return (
    <>
      <h3 style={{ margin: '0 0 0.3rem', 'font-size': '1.05rem', color: ACCENTS.rishonim }}>
        {t('rishonim.onSegment', { n: segIdx() + 1 })}
      </h3>
      <div style={{ color: '#94a3b8', 'font-size': '0.78rem', 'margin-bottom': '0.5rem' }}>
        {t(commentCount() === 1 ? 'rishonim.commentCount.one' : 'rishonim.commentCount.other', {
          count: commentCount(),
        })}
        {' · '}
        {t(works().length === 1 ? 'rishonim.workCount.one' : 'rishonim.workCount.other', {
          count: works().length,
        })}
      </div>
    </>
  );
}

function RishonimSources(props: SpecialBlockProps): JSX.Element {
  const comments = (): RishonComment[] =>
    (props.instance.fields.comments as RishonComment[] | undefined) ?? [];
  return (
    <div style={{ 'margin-top': '0.8rem' }}>
      <div
        style={{
          'font-size': '0.65rem',
          color: '#94a3b8',
          'text-transform': 'uppercase',
          'letter-spacing': '0.06em',
          'margin-bottom': '0.3rem',
        }}
      >
        {t('rishonim.primarySources')}
      </div>
      <For each={comments()}>
        {(c) => (
          <details
            style={{
              'margin-bottom': '0.5rem',
              'border-bottom': '1px solid #f1f5f9',
              'padding-bottom': '0.45rem',
            }}
          >
            <summary style={{ cursor: 'pointer', 'font-weight': 500, color: '#1f2937' }}>
              {/* In Hebrew mode the Hebrew work name leads (serif, rtl) and the
                  English is the muted aside; in English mode the reverse. The
                  Sefaria sourceRef ("Rashi on Chullin 47b:1:1") is English-only
                  and pure breadcrumb, so it's dropped in Hebrew mode. */}
              <Show
                when={lang() === 'he'}
                fallback={
                  <>
                    {c.work}
                    <Show when={c.workHe}>
                      <span
                        style={{
                          'margin-left': '0.4rem',
                          color: '#94a3b8',
                          'font-size': '0.78rem',
                          'font-family': '"Mekorot Vilna", serif',
                        }}
                        dir="rtl"
                        lang="he"
                      >
                        {c.workHe}
                      </span>
                    </Show>
                  </>
                }
              >
                <span dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif' }}>
                  {c.workHe || c.work}
                </span>
                <Show when={c.workHe && c.work}>
                  <span
                    style={{
                      'margin-inline-start': '0.4rem',
                      color: '#94a3b8',
                      'font-size': '0.78rem',
                    }}
                  >
                    {c.work}
                  </span>
                </Show>
              </Show>
              <Show when={c.sourceRef && lang() !== 'he'}>
                <span
                  style={{
                    'margin-left': '0.4rem',
                    color: '#cbd5e1',
                    'font-size': '0.7rem',
                    'font-family': 'ui-monospace, Menlo, monospace',
                  }}
                >
                  {c.sourceRef}
                </span>
              </Show>
            </summary>
            <Show when={c.textHe}>
              <p
                dir="rtl"
                lang="he"
                style={{
                  margin: '0.4rem 0 0',
                  'font-family': '"Mekorot Vilna", serif',
                  'font-size': '1rem',
                  'line-height': 1.65,
                  color: '#222',
                }}
                innerHTML={c.textHe}
              />
            </Show>
            <Show when={c.textEn}>
              <p
                style={{
                  margin: '0.4rem 0 0',
                  'font-size': '0.86rem',
                  'line-height': 1.55,
                  color: '#475569',
                }}
                innerHTML={c.textEn}
              />
            </Show>
          </details>
        )}
      </For>
    </div>
  );
}

/** Display instance ({fields} with segIdx flattened in for the blocks). */
export function rishonimDisplayInstance(inst: RishonimInstance): {
  fields: Record<string, unknown>;
} {
  return {
    fields: {
      segIdx: inst.segIdx,
      works: inst.fields.works,
      commentCount: inst.fields.commentCount,
      comments: inst.fields.comments,
    },
  };
}
/** The real RishonimInstance the mark synthesis expects as mark_input (unchanged). */
export function rishonimSynthInstance(inst: RishonimInstance): unknown {
  return inst;
}

export const RISHONIM_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'rishonim-header': RishonimHeader,
  'rishonim-sources': RishonimSources,
};

// ===========================================================================
// CARD_DEFS — the single registry of recipe-driven sidebar cards. One entry per
// SidebarContent kind that renders through SidebarCardFromHint, replacing a wall
// of per-kind dispatch arms with one generic render. Each entry is the
// client-side adapter (recipe + special blocks + how to build the display /
// synthesis instance) — the shape the worker mark-def `recipe` field will later
// supply directly. Place keeps the older hint adapter; the voice-group card
// stays bespoke (no enrichments, so no recipe).
//
// The builders receive the (kind-narrowed) SidebarContent; CARD_DEFS is keyed by
// kind and only invoked for its own kind, so the casts are sound.
// ===========================================================================

/** Sidebar context an `extras` builder may draw on, beyond the content itself —
 *  the daf's rabbi generations + sections + the sidebar callbacks a special
 *  block needs (e.g. the argument card's full Section + onPushRabbi, the
 *  overview's daf sections + onOpenArgument). */
interface CardExtrasCtx {
  content: SidebarContent;
  generationByName: Map<string, GenerationId>;
  onPushRabbi: (name: string) => void;
  dafSections: Section[];
  onOpenArgument?: (index: number) => void;
  /** The whole-daf geography card's model + interaction callbacks (the
   *  geography-map block's `extras`). */
  geography?: GeographyExtras;
}

interface CardDef {
  recipe: SidebarRecipe;
  blocks: Record<string, (p: SpecialBlockProps) => JSX.Element>;
  /** Display instance ({fields}) feeding the heading + non-synthesis sections. */
  instance: (c: SidebarContent) => { fields: Record<string, unknown> };
  /** Optional distinct shape sent to the mark synthesis as mark_input. */
  synthInstance?: (c: SidebarContent) => unknown;
  /** Optional Q&A cache qualifier (defaults to instanceKey). */
  qaInstanceId?: (c: SidebarContent) => string;
  /** Forward the reader-highlight channel to the card's special blocks. */
  forwardHighlight?: boolean;
  /** Card-specific extras for special blocks (e.g. rabbi's generationByName,
   *  the argument card's full Section). */
  extras?: (ctx: CardExtrasCtx) => Record<string, unknown>;
}

export const CARD_DEFS: Partial<Record<SidebarContent['kind'], CardDef>> = {
  argument: {
    recipe: ARGUMENT_RECIPE,
    blocks: ARGUMENT_BLOCKS,
    instance: (c) =>
      argumentDisplayInstance((c as Extract<SidebarContent, { kind: 'argument' }>).section),
    synthInstance: (c) =>
      argumentSynthInstance((c as Extract<SidebarContent, { kind: 'argument' }>).section),
    forwardHighlight: true,
    extras: (ctx) => ({
      section: (ctx.content as Extract<SidebarContent, { kind: 'argument' }>).section,
      onPushRabbi: ctx.onPushRabbi,
    }),
  },
  'argument-overview': {
    recipe: ARGUMENT_OVERVIEW_RECIPE,
    blocks: ARGUMENT_OVERVIEW_BLOCKS,
    // Whole-daf: the only display field is the localized "Overview" heading;
    // the daf's sections travel via extras (they aren't on the content).
    instance: () => ({ fields: { title: t('overview.title') } }),
    // The synthesis mark_input stays the old empty `{fields:{}}` byte-for-byte —
    // the localized heading is display-only and must not leak into the warmed
    // overview cache key (which would cold-miss all of Shas).
    synthInstance: () => ({ fields: {} }),
    forwardHighlight: true,
    extras: (ctx) => ({
      sections: ctx.dafSections,
      onPushRabbi: ctx.onPushRabbi,
      focus: (ctx.content as Extract<SidebarContent, { kind: 'argument-overview' }>).focus,
    }),
  },
  // Whole-daf essay cards: header + synthesis only (the essay renders through
  // the registerMarkRenderer seam). Display instance carries the localized
  // heading; synthInstance keeps the old `{fields:{}}` mark_input so the warmed
  // whole-daf caches still hit.
  tidbit: {
    recipe: TIDBIT_RECIPE,
    blocks: {},
    instance: () => ({ fields: { title: t('tidbit.title') } }),
    synthInstance: () => ({ fields: {} }),
  },
  biyun: {
    recipe: BIYUN_RECIPE,
    blocks: {},
    instance: () => ({ fields: { title: t('biyun.title') } }),
    synthInstance: () => ({ fields: {} }),
  },
  'daf-background': {
    recipe: DAF_BACKGROUND_RECIPE,
    blocks: DAF_BACKGROUND_BLOCKS,
    instance: () => ({ fields: { title: t('background.title') } }),
    synthInstance: () => ({ fields: {} }),
  },
  // Whole-daf geography: no synthesis (computed mark). The geography-map block
  // renders the model that arrives via extras (from the mark run). The display
  // instance carries only the localized heading.
  geography: {
    recipe: GEOGRAPHY_RECIPE,
    blocks: GEOGRAPHY_BLOCKS,
    instance: () => ({ fields: { title: t('geography.title') } }),
    extras: (ctx) => ({ ...(ctx.geography ?? {}) }),
  },
  aggadata: {
    recipe: AGGADATA_RECIPE,
    blocks: AGGADATA_BLOCKS,
    instance: (c) => aggadataInstance((c as Extract<SidebarContent, { kind: 'aggadata' }>).story),
    qaInstanceId: (c) => {
      const s = (c as Extract<SidebarContent, { kind: 'aggadata' }>).story;
      return `${s.title}|${s.excerpt}`;
    },
  },
  yerushalmi: {
    recipe: YERUSHALMI_RECIPE,
    blocks: YERUSHALMI_BLOCKS,
    instance: (c) =>
      yerushalmiInstance((c as Extract<SidebarContent, { kind: 'yerushalmi' }>).parallel),
  },
  pesuk: {
    recipe: PASUK_RECIPE,
    blocks: PASUK_BLOCKS,
    instance: (c) => pasukInstance((c as Extract<SidebarContent, { kind: 'pesuk' }>).pasuk),
  },
  halacha: {
    recipe: HALACHA_RECIPE,
    blocks: HALACHA_BLOCKS,
    instance: (c) => halachaInstance((c as Extract<SidebarContent, { kind: 'halacha' }>).topic),
  },
  chart: {
    recipe: CHART_RECIPE,
    blocks: CHART_BLOCKS,
    instance: (c) => chartInstance((c as Extract<SidebarContent, { kind: 'chart' }>).chart),
  },
  rishonim: {
    recipe: RISHONIM_RECIPE,
    blocks: RISHONIM_BLOCKS,
    instance: (c) =>
      rishonimDisplayInstance((c as Extract<SidebarContent, { kind: 'rishonim' }>).instance),
    synthInstance: (c) =>
      rishonimSynthInstance((c as Extract<SidebarContent, { kind: 'rishonim' }>).instance),
  },
  rabbi: {
    recipe: RABBI_RECIPE,
    blocks: RABBI_BLOCKS,
    instance: (c) => rabbiDisplayInstance((c as Extract<SidebarContent, { kind: 'rabbi' }>).rabbi),
    synthInstance: (c) =>
      rabbiSynthInstance((c as Extract<SidebarContent, { kind: 'rabbi' }>).rabbi),
    forwardHighlight: true,
    extras: (ctx) => ({ generationByName: ctx.generationByName }),
  },
};

/** Collective "voice group" panel (e.g. the Stam / anonymous Gemara voice):
 *  a name + Hebrew twin + a one-line collective bio. No enrichments. */
export function VoiceGroupBody(props: {
  group: { name: string; nameHe: string; bio: string };
}): JSX.Element {
  return (
    <Panel accent={ACCENTS['voice-group']} title={props.group.name} titleHe={props.group.nameHe}>
      <div
        style={{
          'font-size': '0.7rem',
          color: '#999',
          'text-transform': 'uppercase',
          'letter-spacing': '0.08em',
          'margin-bottom': '0.45rem',
        }}
      >
        {t('voiceGroup.collective')}
      </div>
      <p style={{ margin: 0, color: '#333', 'line-height': 1.6 }}>{props.group.bio}</p>
    </Panel>
  );
}

export function ArgumentSidebar(props: ArgumentSidebarProps): JSX.Element {
  // Compile the daf's glossary matcher once (not per prose fragment).
  const conceptMatcher = createMemo(() => buildConceptMatcher(props.glossaryTerms));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
  };
  window.addEventListener('keydown', onKey);
  onCleanup(() => window.removeEventListener('keydown', onKey));

  // Publish the open card (recipe + instanceKey) for the dev shelf's Recipe
  // panel — null when no card is open or it's still a bespoke *Body. Single
  // writer. The instanceKey matches what the dispatch mounts, so each panel
  // row's inspect 'i' targets the very drawer that card renders.
  createEffect(() => {
    const content = props.content;
    if (!content) {
      setActiveCard(null);
      return;
    }
    const recipe = CARD_DEFS[content.kind]?.recipe;
    const instanceKey = instanceKeyForContent(content, props.tractate, props.page);
    setActiveCard(recipe && instanceKey ? { recipe, instanceKey } : null);
  });
  onCleanup(() => setActiveCard(null));

  return (
    <Show when={props.content}>
      {(c) => (
        <RabbiLinkProvider
          value={{
            rabbis: () => props.dafRabbis,
            extraNames: () => props.dafRabbiNames,
            onPushRabbi: props.onPushRabbi,
          }}
        >
          <ConceptLinkProvider value={{ matcher: conceptMatcher }}>
            <aside
              style={{
                background: '#fff',
                border: '1px solid #e5e3dc',
                'border-radius': '6px',
                'box-shadow': '0 2px 8px rgba(0,0,0,0.06)',
                padding: '1rem 1.1rem 1.5rem',
                'font-family': 'system-ui, -apple-system, sans-serif',
                'font-size': '0.9rem',
                color: '#222',
              }}
            >
              <Show when={props.previousLabel}>
                {(label) => (
                  <button
                    type="button"
                    onClick={props.onBack}
                    title={t('sidebar.backTo', { label: label() })}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '0.35rem',
                      width: '100%',
                      'text-align': 'left',
                      background: '#f5f3ee',
                      border: '1px solid #e5e3dc',
                      'border-radius': '4px',
                      padding: '0.35rem 0.55rem',
                      margin: '0 0 0.55rem',
                      cursor: 'pointer',
                      font: 'inherit',
                      'font-size': '0.75rem',
                      color: '#555',
                    }}
                  >
                    <span style={{ 'font-size': '0.85rem', 'line-height': 1 }}>←</span>
                    <span
                      style={{
                        'white-space': 'nowrap',
                        overflow: 'hidden',
                        'text-overflow': 'ellipsis',
                      }}
                    >
                      {label()}
                    </span>
                  </button>
                )}
              </Show>
              <header
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'space-between',
                  'padding-bottom': '0.6rem',
                  'border-bottom': '1px solid #eee',
                  'margin-bottom': '0.75rem',
                }}
              >
                <span
                  style={{
                    'font-size': '0.7rem',
                    color: '#999',
                    'text-transform': 'uppercase',
                    'letter-spacing': '0.08em',
                  }}
                >
                  {t(kindLabelKey(c().kind))}
                  {' · '}
                  {lang() === 'he'
                    ? dafRefHe(props.tractate, props.page)
                    : `${props.tractate} ${props.page}`}
                </span>
                <button
                  type="button"
                  onClick={props.onClose}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    'font-size': '1.2rem',
                    color: '#888',
                    padding: '0.1rem 0.3rem',
                  }}
                  aria-label={t('common.close')}
                >
                  ×
                </button>
              </header>

              {/* All recipe-driven cards (argument family + aggadata/pesuk/halacha/
                rishonim/rabbi/yerushalmi) render through one generic arm, keyed
                by CARD_DEFS. Place keeps the hint adapter; voice-group stays
                bespoke (no enrichments). */}
              <Show when={CARD_DEFS[c().kind]}>
                {(def) => (
                  <SidebarCardFromHint
                    recipe={def().recipe}
                    instance={def().instance(c())}
                    synthInstance={def().synthInstance?.(c())}
                    instanceKey={instanceKeyForContent(c(), props.tractate, props.page)!}
                    qaInstanceId={def().qaInstanceId?.(c())}
                    tractate={props.tractate}
                    page={props.page}
                    specialBlocks={def().blocks}
                    onHighlightRange={
                      def().forwardHighlight ? (r) => props.onHighlightRange?.(r) : undefined
                    }
                    extras={def().extras?.({
                      content: c(),
                      generationByName: props.generationByName,
                      onPushRabbi: props.onPushRabbi,
                      dafSections: props.dafSections ?? [],
                      onOpenArgument: props.onOpenArgument,
                      geography: props.geography,
                    })}
                  />
                )}
              </Show>

              <Show when={c().kind === 'voice-group'}>
                <VoiceGroupBody
                  group={(c() as Extract<SidebarContent, { kind: 'voice-group' }>).group}
                />
              </Show>

              <Show when={c().kind === 'place'}>
                <SidebarPanelFromHint
                  hint={PLACES_HINT}
                  instance={(c() as Extract<SidebarContent, { kind: 'place' }>).place}
                  tractate={props.tractate}
                  page={props.page}
                  chips={
                    <PlaceChips place={(c() as Extract<SidebarContent, { kind: 'place' }>).place} />
                  }
                />
              </Show>
            </aside>
          </ConceptLinkProvider>
        </RabbiLinkProvider>
      )}
    </Show>
  );
}
