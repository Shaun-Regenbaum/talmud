import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, type JSX } from 'solid-js';
import type { Section, Rabbi, HalachaTopic, AggadataStory, Pasuk } from './shapes';
import { GENERATION_BY_ID, generationLabelHe, type GenerationId } from './generations';
import type { IdentifiedRabbi } from './dafContext';
import { Hebraized } from './Hebraized';
import { RabbiText, RabbiLinkProvider, HebraizedWithRabbis } from './rabbiLinks';

import RabbiLineageTree, { type RelationshipsData, type RelationshipsEvidence } from './RabbiLineageTree';
import { type GeographyData, type GeographyEvidence } from './RabbiGeographyCard';
import RabbiPlacesTimeline, { type LocationInference } from './RabbiPlacesTimeline';
import ArgumentVoiceMap, { type ArgumentVoicesData } from './ArgumentVoiceMap';
import ArgumentNarrative from './ArgumentNarrative';
import { deriveVoiceEdges } from '../lib/typing/voices';
import ArgumentFlowGraph, { type FlowConnection } from './ArgumentFlowGraph';
import { orderBackgroundGroups, type BackgroundGroup } from './backgroundGroups';
import { adjacentAmud } from '../lib/sefref/amudim';
import { dafRefHe, pageLabelHe } from '../lib/sefref/tractates';
import { selectSectionMoves } from '../lib/argumentMoves';
import { t, lang } from './i18n';
import { ACCENTS, HE_FONT, HebrewProse, Panel, QASection, SectionCard, Synthesis, SidebarPanelFromHint, SidebarCardFromHint, setActiveCard, kindLabelKey, type SidebarHint, type SidebarRecipe, type SpecialBlockProps } from './sidebar/primitives';
import { InspectDot } from './MarkEnrichmentCards';
// Recipes now live in the shared lib (carried on the worker mark def too).
// Re-exported so existing importers (CARD_DEFS, tests) keep their `from
// './ArgumentSidebar'` path.
import { AGGADATA_RECIPE, PASUK_RECIPE, HALACHA_RECIPE, RISHONIM_RECIPE, RABBI_RECIPE } from '../lib/sidebar/recipe';
export { AGGADATA_RECIPE, PASUK_RECIPE, HALACHA_RECIPE, RISHONIM_RECIPE, RABBI_RECIPE };

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
 *  TypeProfile (deterministic, cached marks, via /api/type-profiles) and
 *  suppress the map unless the section is a real, non-narrative dispute. Gated
 *  to dev mode + reversible: readers are unaffected until this is promoted, and
 *  when the profile is unknown we default to showing (current behavior). The
 *  reliable signal is `primary` (the deterministic composition) overriding the
 *  noisy `isDispute` voices flag — a story can carry stray `opposes` edges. */
interface SectionTypeProfile { unit: { startSegIdx: number; endSegIdx: number }; primary: string; isDispute: boolean }
function useVoicesGate(tractate: () => string, page: () => string, section: () => { startSegIdx?: number; endSegIdx?: number } | undefined) {
  const [profiles] = createResource(
    () => `${tractate()}|${page()}`,
    async (): Promise<SectionTypeProfile[]> => {
      try {
        const r = await fetch(`/api/type-profiles/${encodeURIComponent(tractate())}/${encodeURIComponent(page())}`);
        if (!r.ok) return [];
        return ((await r.json()) as { profiles?: SectionTypeProfile[] }).profiles ?? [];
      } catch { return []; }
    },
  );
  const profile = (): SectionTypeProfile | undefined => {
    const s = section();
    if (!s || typeof s.startSegIdx !== 'number' || typeof s.endSegIdx !== 'number') return undefined;
    return (profiles() ?? []).find((p) => p.unit.startSegIdx === s.startSegIdx && p.unit.endSegIdx === s.endSegIdx);
  };
  const suppress = (): boolean => {
    // Promoted to readers: section typing now drives the view for everyone, not
    // just dev mode. Safe-by-default — an unknown/uncomputed profile shows the
    // voice graph exactly as before, so a missing profile never regresses.
    const p = profile();
    if (!p) return false;                          // unknown → show (safe default)
    return !(p.isDispute && p.primary !== 'aggadata'); // hide unless a real, non-narrative dispute
  };
  return { profile, suppress };
}

export type SidebarContent =
  | { kind: 'argument'; section: Section; index: number }
  | { kind: 'halacha'; topic: HalachaTopic; index: number }
  | { kind: 'aggadata'; story: AggadataStory; index: number }
  | { kind: 'pesuk'; pasuk: Pasuk; index: number }
  | { kind: 'rabbi'; rabbi: IdentifiedRabbi }
  | { kind: 'place'; place: PlaceInstance }
  | { kind: 'voice-group'; group: { name: string; nameHe: string; bio: string } }
  | { kind: 'rishonim'; instance: RishonimInstance; index: number }
  | { kind: 'argument-overview' }
  | { kind: 'daf-background' };

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
  /** Highlights a contiguous segment range on the daf. Used when the user
   *  clicks an argument-move card so the corresponding sub-range of the
   *  section is painted. Pass null to clear. `key` is a stable id (e.g. the
   *  move's fields.id) so DafViewer can dedupe overlapping highlight reqs. */
  onHighlightRange?: (range: { start: number; end: number; key: string; tokenStart?: number; tokenEnd?: number } | null) => void;
  onOpenRabbiSlug?: (slug: string) => void;
  generationByName: Map<string, GenerationId>;
  /** The daf's ordered argument sections (from the `argument` mark). Feeds the
   *  whole-daf overview's flow graph — its nodes are these sections. */
  dafSections?: Section[];
  /** Open the in-depth `argument` card for a section (by index). Lets the
   *  whole-daf overview hand off into the full per-section argument. */
  onOpenArgument?: (index: number) => void;
}

// Parse markdown-style links out of a bio string. Sefaria `/topics/<slug>`
// links become internal buttons that swap the sidebar to that rabbi's bio
// (via `onOpenSlug`); every other link stays as an external anchor. Links
// whose URL doesn't parse fall back to the raw bracketed text.
const BIO_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const SEFARIA_TOPIC_RE = /^https?:\/\/(?:www\.)?sefaria\.org\/topics\/([^/?#]+)/i;

function renderBioWithLinks(
  bio: string,
  onOpenSlug?: (slug: string) => void,
): JSX.Element[] {
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
          onClick={(e) => { e.preventDefault(); onOpenSlug(slug); }}
          style={{
            background: 'none', border: 'none', padding: 0, margin: 0,
            color: '#1e40af', cursor: 'pointer', 'text-decoration': 'underline',
            font: 'inherit',
          }}
        >{text}</button>
      );
    } else {
      out.push(
        <a href={url} target="_blank" rel="noopener noreferrer"
           style={{ color: '#1e40af' }}>{text}</a>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < bio.length) out.push(bio.slice(last));
  return out;
}

function RabbiRow(props: {
  rabbi: Rabbi;
  active: boolean;
  generationId?: GenerationId;
  onToggle: () => void;
}): JSX.Element {
  const genInfo = () => (props.generationId ? GENERATION_BY_ID[props.generationId] : null);
  return (
    <button
      onClick={props.onToggle}
      style={{
        width: '100%',
        'text-align': 'left',
        display: 'block',
        padding: '0.55rem 0.7rem',
        margin: '0 0 0.4rem',
        background: props.active ? '#fef3c7' : '#fafaf7',
        border: '1px solid ' + (props.active ? '#eab308' : '#eae8e0'),
        'border-radius': '4px',
        cursor: 'pointer',
        'font-family': 'inherit',
        'font-size': '0.85rem',
      }}
      title={props.active ? t('rabbi.row.unhighlight') : t('rabbi.row.highlight')}
    >
      <div style={{ 'font-weight': 600, color: '#333' }}>
        {props.rabbi.name}{' '}
        <span dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif', color: '#888', 'font-weight': 'normal' }}>
          {props.rabbi.nameHe}
        </span>
      </div>
      <Show when={genInfo()}>
        {(g) => (
          <div style={{ 'margin-top': '0.25rem', display: 'flex', 'align-items': 'center', gap: '0.4rem', 'font-size': '0.72rem', color: '#666' }}>
            <span style={{
              display: 'inline-block',
              width: '1.4rem',
              height: '0.35rem',
              'background-color': g().color,
              'border-radius': '2px',
            }} />
            <span>{g().label} · {g().era}</span>
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
  activeRabbi: string | null;
  highlightedMoveId: string | null;
  onHighlightRabbi: (name: string | null) => void;
  onHighlightMove: (move: ArgumentMoveInstance | null) => void;
  onPushRabbi: (name: string) => void;
  dafRabbis: IdentifiedRabbi[];
  generationByName: Map<string, GenerationId>;
}): JSX.Element {
  const f = props.move.fields;
  const roleColor = () => ROLE_COLORS[f.role] ?? '#64748b';
  const isActive = () => props.highlightedMoveId === f.id;
  const toggleHighlight = () => props.onHighlightMove(isActive() ? null : props.move);

  return (
    <div style={{
      border: '1px solid ' + (isActive() ? '#eab308' : '#eae8e0'),
      'border-left': `3px solid ${roleColor()}`,
      'border-radius': '4px',
      padding: '0.55rem 0.7rem',
      'margin-bottom': '0.55rem',
      background: isActive() ? '#fefce8' : '#fafaf7',
    }}>
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
        <div style={{
          display: 'flex', 'align-items': 'center', gap: '0.5rem',
          'margin-bottom': '0.3rem', 'font-size': '0.7rem',
        }}>
          <span style={{
            'text-transform': 'uppercase', 'letter-spacing': '0.06em',
            'font-weight': 600, color: roleColor(),
          }}>{moveKindLabel(f.role)}</span>
          <span style={{ color: '#999' }}>·</span>
          <span style={{ color: '#555' }}>{f.voice}</span>
          <span style={{ color: '#bbb', 'font-size': '0.65rem', 'font-family': 'ui-monospace, Menlo, monospace' }}>
            seg {props.move.startSegIdx === props.move.endSegIdx ? props.move.startSegIdx : `${props.move.startSegIdx}–${props.move.endSegIdx}`}
          </span>
          <Show when={isActive()}>
            <span style={{ color: '#a16207', 'font-size': '0.65rem', 'margin-left': 'auto' }}>{t('move.highlighted')}</span>
          </Show>
        </div>
        <Show when={f.excerpt}>
          <p dir="rtl" lang="he" style={{
            margin: 0, 'font-family': '"Mekorot Vilna", serif',
            'font-size': '0.9rem', color: '#555',
          }}>{f.excerpt}…</p>
        </Show>
      </button>
      {/* Per-move synthesis. Mounts its own MarkEnrichmentCards so each move
          gets its own "built from" tray. The wrapping div extends the move
          card's click-to-highlight target to the synthesis body — clicks
          on rabbi-link buttons + chips stopPropagation so they don't toggle
          the highlight. */}
      <div
        onClick={toggleHighlight}
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
      <Show when={f.rabbiNames.length > 0}>
        <div style={{
          'margin-top': '0.5rem',
          display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem',
        }}>
          <For each={f.rabbiNames}>{(name) => {
            const active = () => props.activeRabbi === name;
            const genId = props.generationByName.get(name);
            const genInfo = genId ? GENERATION_BY_ID[genId] : null;
            return (
              <button
                onClick={() => props.onPushRabbi(name)}
                title={t('common.open', { name })}
                style={{
                  border: '1px solid ' + (active() ? '#eab308' : '#d6d3d1'),
                  background: active() ? '#fef3c7' : '#fff',
                  color: '#333',
                  'border-radius': '999px',
                  padding: '0.15rem 0.55rem',
                  'font-size': '0.72rem',
                  cursor: 'pointer',
                  'font-family': 'inherit',
                  display: 'inline-flex',
                  'align-items': 'center',
                  gap: '0.3rem',
                }}
              >
                <Show when={genInfo}>
                  <span style={{
                    display: 'inline-block', width: '0.5rem', height: '0.5rem',
                    'border-radius': '50%', background: genInfo!.color,
                  }} />
                </Show>
                {name}
              </button>
            );
          }}</For>
        </div>
      </Show>
    </div>
  );
}

/** Compact dialectical move-flow for pure-dialectic sections (שקלא וטריא) — the
 *  third section-typing view, alongside the dispute voice graph and the
 *  narrative beats. Shows the section's moves as an ordered, role-colored
 *  sequence (question -> answer -> objection -> resolution …), click-to-highlight
 *  on the daf. Where the voices graph is wrong (no real dispute) and the
 *  narrative view is wrong (not a story), THIS is the fit-for-purpose view. */
function ArgumentMoveFlow(props: {
  moves: ArgumentMoveInstance[];
  highlightedMoveId: string | null;
  onHighlightMove: (move: ArgumentMoveInstance | null) => void;
}): JSX.Element {
  return (
    <div style={{ 'margin-top': '0.6rem' }}>
      <div style={{
        'font-size': '0.7rem', 'text-transform': 'uppercase', 'letter-spacing': '0.08em',
        color: '#999', 'margin-bottom': '0.4rem', display: 'flex', 'align-items': 'center', gap: '0.4rem',
      }}>
        Dialectic
        <span dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif', 'font-size': '0.8rem', color: '#666', 'text-transform': 'none', 'letter-spacing': 0 }}>שקלא וטריא</span>
      </div>
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.15rem' }}>
        <For each={props.moves}>{(m) => {
          const f = m.fields;
          const color = ROLE_COLORS[f.role] ?? '#64748b';
          const isActive = () => props.highlightedMoveId === f.id;
          return (
            <div
              onClick={() => props.onHighlightMove(isActive() ? null : m)}
              title="Highlight this move on the daf"
              style={{
                display: 'flex', 'align-items': 'baseline', gap: '0.45rem', cursor: 'pointer',
                padding: '0.2rem 0.4rem', 'border-radius': '4px',
                'border-left': `3px solid ${color}`,
                background: isActive() ? '#fff7ed' : '#fafaf7',
              }}
            >
              <span style={{
                'flex-shrink': 0, 'font-size': '0.62rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em',
                'font-weight': 600, color, 'min-width': '5.5rem',
              }}>{moveKindLabel(f.role)}</span>
              <span style={{ 'flex-shrink': 0, color: '#555', 'font-size': '0.74rem' }}>{f.voice}</span>
              <span dir="rtl" lang="he" style={{
                flex: 1, 'min-width': 0, 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis',
                'font-family': '"Mekorot Vilna", serif', 'font-size': '0.8rem', color: '#777',
              }}>{f.excerpt}</span>
            </div>
          );
        }}</For>
      </div>
    </div>
  );
}

export function ArgumentBody(props: {
  section: Section;
  tractate: string;
  page: string;
  activeRabbi: string | null;
  onHighlightRabbi: (name: string | null) => void;
  onPushRabbi: (name: string) => void;
  dafRabbis: IdentifiedRabbi[];
  onHighlightRange: (range: { start: number; end: number; key: string; tokenStart?: number; tokenEnd?: number } | null) => void;
  generationByName: Map<string, GenerationId>;
}): JSX.Element {
  // All moves on this daf, flat. Filtered to this section by sectionStartSegIdx.
  const [allMoves, setAllMoves] = createSignal<ArgumentMoveInstance[] | null>(null);
  const [highlightedMoveId, setHighlightedMoveId] = createSignal<string | null>(null);
  // argument.voices output (structured voices + edges) — resolved via the
  // section synthesis aggregate's deps_resolved. Drives ArgumentVoiceMap.
  const [voicesData, setVoicesData] = createSignal<ArgumentVoicesData | null>(null);
  // Section-typing gate: hide the voice-dispute map on non-dispute sections (dev mode).
  const voicesGate = useVoicesGate(() => props.tractate, () => props.page, () => props.section);

  // Clear stale move state when the user opens a different section. The
  // section's synthesis run will repopulate via onResolved as soon as the
  // section synthesis aggregate's `anchors_resolved.argument-move` arrives.
  //
  // Guard against `props.section` being momentarily undefined: Solid can
  // re-evaluate this getter while the parent <Show> is mid-transition (e.g.
  // sidebar closing or switching to a non-argument kind), and the cast in
  // ArgumentSidebar.tsx isn't a runtime check.
  const instanceKey = () => {
    const s = props.section;
    if (!s) return '';
    return `${s.startSegIdx}-${s.endSegIdx}-${s.title}`;
  };
  createEffect(() => {
    void instanceKey();
    setAllMoves(null);
    setHighlightedMoveId(null);
    setVoicesData(null);
    props.onHighlightRange(null);
  });

  const handleResolved = (r: { deps_resolved?: Record<string, unknown>; anchors_resolved?: Record<string, unknown> }) => {
    const moves = r.anchors_resolved?.['argument-move'] as ArgumentMoveInstance[] | undefined;
    if (Array.isArray(moves)) setAllMoves(moves);
    const voices = r.deps_resolved?.['argument.voices'] as ArgumentVoicesData | undefined;
    if (voices && Array.isArray(voices.voices)) {
      // Edges may be absent on older cached entries — default to [].
      // Repair edge directions / drop malformed edges deterministically, so even
      // already-cached graphs (pre the derive-voice-edges transform) render right.
      setVoicesData(deriveVoiceEdges({ voices: voices.voices, edges: Array.isArray(voices.edges) ? voices.edges : [] }) as ArgumentVoicesData);
    }
  };

  const sectionMoves = createMemo(() => {
    const all = allMoves();
    if (!all) return null;
    // selectSectionMoves dedupes by move id and prefers an exact parent-section
    // match, so a stale / doubled argument-move cache (two partitions' worth of
    // moves for the same daf — the Shabbat 126a bug) renders as one clean set
    // instead of duplicate cards, each of which would spin its own synthesis.
    return selectSectionMoves(all, {
      startSegIdx: props.section.startSegIdx,
      endSegIdx: props.section.endSegIdx,
    });
  });

  const handleHighlightMove = (move: ArgumentMoveInstance | null) => {
    if (!move) {
      setHighlightedMoveId(null);
      props.onHighlightRange(null);
      return;
    }
    setHighlightedMoveId(move.fields.id);
    props.onHighlightRange({
      start: move.startSegIdx,
      end: move.endSegIdx,
      key: move.fields.id,
      tokenStart: move.fields.tokenStart,
      tokenEnd: move.fields.tokenEnd,
    });
  };

  // If the parent transitioned the sidebar away from kind='argument' but the
  // unmount hasn't flushed yet, props.section can be undefined for a tick.
  // Bail rather than crash the whole tree.
  return (
    <Show when={props.section}>
    <Panel accent={ACCENTS.argument} title={props.section.title}>
      <Show when={props.section.excerpt}>
        <HebrewProse size="0.95rem" color="#555" margin="0 0 0.75rem">
          {props.section.excerpt}…
        </HebrewProse>
      </Show>
      <Synthesis
        markId="argument"
        instance={{
          startSegIdx: props.section.startSegIdx,
          endSegIdx: props.section.endSegIdx,
          fields: {
            title: props.section.title,
            summary: props.section.summary,
            excerpt: props.section.excerpt,
            rabbiNames: props.section.rabbis.map((r) => r.name),
          },
        }}
        instanceKey={instanceKey()}
        tractate={props.tractate}
        page={props.page}
        onResolved={handleResolved}
      />
      <Show when={!voicesGate.suppress() && voicesData()}>
        {(data) => (
          <div style={{ position: 'relative' }}>
            <InspectDot instanceKey={instanceKey()} leafId="argument.voices" style={{ position: 'absolute', top: '0.2rem', right: 0, 'z-index': 2 }} />
            <ArgumentVoiceMap data={data()} onClickVoice={props.onPushRabbi} />
          </div>
        )}
      </Show>
      <Show when={voicesGate.suppress()}>
        <Show
          when={voicesGate.profile()?.primary === 'aggadata'}
          fallback={
            <Show when={sectionMoves()}>
              {(moves) => <ArgumentMoveFlow moves={moves()} highlightedMoveId={highlightedMoveId()} onHighlightMove={handleHighlightMove} />}
            </Show>
          }
        >
          <ArgumentNarrative
            section={props.section}
            tractate={props.tractate}
            page={props.page}
            onHighlight={(r) => props.onHighlightRange(r ? { start: r.start, end: r.end, key: `beat-${r.start}-${r.tokenStart ?? 0}`, tokenStart: r.tokenStart, tokenEnd: r.tokenEnd } : null)}
          />
        </Show>
      </Show>
      {/* Dialectical move list — hidden on narrative-primary sections, where the
          anchored beat list in the narrative view above IS the move layer. */}
      <Show when={voicesGate.profile()?.primary !== 'aggadata' && sectionMoves()}>
        {(moves) => (
          <div style={{ 'margin-top': '1rem' }}>
            <div style={{
              'font-size': '0.7rem',
              'text-transform': 'uppercase',
              'letter-spacing': '0.08em',
              color: '#999',
              'margin-bottom': '0.5rem',
            }}>{t('argument.moves')}</div>
            <For each={moves()}>{(move) => (
              <ArgumentMoveCard
                move={move}
                tractate={props.tractate}
                page={props.page}
                activeRabbi={props.activeRabbi}
                highlightedMoveId={highlightedMoveId()}
                onHighlightRabbi={props.onHighlightRabbi}
                onHighlightMove={handleHighlightMove}
                onPushRabbi={props.onPushRabbi}
                dafRabbis={props.dafRabbis}
                generationByName={props.generationByName}
              />
            )}</For>
          </div>
        )}
      </Show>
    </Panel>
    </Show>
  );
}

/** Drill-in: one argument section's voice map, fed by that section's
 *  `argument.voices` (the same per-section enrichment the section panel uses;
 *  warmed on daf load, so this is usually a cache hit). */
function OverviewSectionVoices(props: {
  section: Section;
  tractate: string;
  page: string;
  onPushRabbi: (name: string) => void;
}): JSX.Element {
  const [voices, setVoices] = createSignal<ArgumentVoicesData | null>(null);
  const voicesGate = useVoicesGate(() => props.tractate, () => props.page, () => props.section);
  const instanceKey = () => `${props.section.startSegIdx}-${props.section.endSegIdx}-${props.section.title}`;
  createEffect(() => { void instanceKey(); setVoices(null); });
  const onResolved = (r: { deps_resolved?: Record<string, unknown> }) => {
    const v = r.deps_resolved?.['argument.voices'] as ArgumentVoicesData | undefined;
    if (v && Array.isArray(v.voices)) setVoices(deriveVoiceEdges({ voices: v.voices, edges: Array.isArray(v.edges) ? v.edges : [] }) as ArgumentVoicesData);
  };
  return (
    <div style={{ 'margin-top': '0.6rem', 'border-top': '1px dashed #e5e3dc', 'padding-top': '0.6rem' }}>
      {/* The section summary was rendered here via HebrewProse (RTL/centered),
          which mis-styles the English summary AND duplicates the synthesis prose
          below. Dropped — the Synthesis card is the single prose source, matching
          the main section panel. */}
      <Synthesis
        markId="argument"
        instance={{
          startSegIdx: props.section.startSegIdx,
          endSegIdx: props.section.endSegIdx,
          fields: {
            title: props.section.title,
            summary: props.section.summary,
            excerpt: props.section.excerpt,
            rabbiNames: props.section.rabbis.map((r) => r.name),
          },
        }}
        instanceKey={instanceKey()}
        tractate={props.tractate}
        page={props.page}
        onResolved={onResolved}
      />
      <Show when={!voicesGate.suppress() && voices()}>
        {(data) => <ArgumentVoiceMap data={data()} onClickVoice={props.onPushRabbi} />}
      </Show>
      <Show when={voicesGate.suppress() && voicesGate.profile()?.primary === 'aggadata'}>
        <ArgumentNarrative section={props.section} tractate={props.tractate} page={props.page} />
      </Show>
    </div>
  );
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
export function groupSectionsBySugya(sectionCount: number, connections: FlowConnection[]): number[][] {
  if (sectionCount <= 0) return [];
  const bindings = connections.filter(
    (c) => SUGYA_BINDING_KINDS.has(c.kind)
      && c.from >= 0 && c.to >= 0 && c.from < sectionCount && c.to < sectionCount && c.from !== c.to,
  );
  // A binding edge spans the gap before section b iff min(endpoints) < b <= max.
  const spans = (b: number) => bindings.some((c) => Math.min(c.from, c.to) < b && b <= Math.max(c.from, c.to));
  const groups: number[][] = [];
  let cur = [0];
  for (let b = 1; b < sectionCount; b++) {
    if (spans(b)) cur.push(b);
    else { groups.push(cur); cur = [b]; }
  }
  groups.push(cur);
  return groups;
}

/** A link from the unified link layer (GET /api/links). Minimal client shape. */
interface DafLinkLite {
  via: string;
  relation: string;
  targets: { tractate: string; page: string; seg: number }[];
  note?: string;
}

/** Whole-daf argument overview. A one-paragraph synthesis, then the daf's
 *  argument sections drawn as flow-graph MAPS — one map per discussion (sugya),
 *  split where the sections stop binding to each other. Maps whose discussion
 *  carries over from the previous daf, or continues onto the next, are flagged.
 *  Click a section node to drill into its voice map. */
function ArgumentOverviewBody(props: {
  tractate: string;
  page: string;
  sections: Section[];
  onPushRabbi: (name: string) => void;
  onHighlightRange?: (range: { start: number; end: number; key: string } | null) => void;
  onOpenArgument?: (index: number) => void;
}): JSX.Element {
  const [connections, setConnections] = createSignal<FlowConnection[]>([]);
  const [active, setActive] = createSignal<number | null>(null);

  createEffect(() => {
    void `${props.tractate}/${props.page}`;
    setConnections([]);
    setActive(null);
    props.onHighlightRange?.(null);
  });

  // Clicking a section card both opens its voices and paints the section's
  // segment range on the daf (clicking the active card again clears both).
  const selectSection = (i: number) => {
    const next = active() === i ? null : i;
    setActive(next);
    if (next === null) { props.onHighlightRange?.(null); return; }
    const s = props.sections[i];
    if (s && s.startSegIdx != null && s.endSegIdx != null) {
      props.onHighlightRange?.({ start: s.startSegIdx, end: s.endSegIdx, key: `overview:${i}` });
    } else {
      props.onHighlightRange?.(null);
    }
  };

  const handleResolved = (r: { deps_resolved?: Record<string, unknown>; anchors_resolved?: Record<string, unknown> }) => {
    const flow = r.deps_resolved?.['argument-overview.flow'] as { connections?: FlowConnection[] } | undefined;
    if (flow && Array.isArray(flow.connections)) setConnections(flow.connections);
  };

  // Split the daf's sections into discussion maps. With no flow yet (cold), each
  // section is its own group; once the flow loads they merge into real sugyot.
  const groups = () => groupSectionsBySugya(props.sections.length, connections());

  // Cross-page continuation: does the previous daf continue INTO this one (so
  // the first map carries over), and does this daf continue onto the next (so
  // the last map spills forward)? Read from the cached cross-daf bridges.
  const [bridge] = createResource(
    () => `${props.tractate}|${props.page}`,
    async (): Promise<{ prev: string | null; next: string | null; fromPrev: boolean; toNext: boolean }> => {
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
        const r = await fetch(`/api/spine/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}`);
        if (!r.ok) return fallback;
        const d = (await r.json()) as { prev: string | null; next: string | null; fromPrev?: boolean; toNext?: boolean };
        return { prev: d.prev, next: d.next, fromPrev: !!d.fromPrev, toNext: !!d.toNext };
      } catch { return fallback; }
    },
  );

  // Unified link layer for this daf (src/lib/context/link.ts → /api/links): the
  // continuity, flow, and CITATIONS in one shape. We surface the citations —
  // cross-references to OTHER dapim — which no other view shows; the flow is in
  // the maps above and the continuity in the captions.
  const [links] = createResource(
    () => `${props.tractate}|${props.page}`,
    async (): Promise<DafLinkLite[]> => {
      try {
        const r = await fetch(`/api/links/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}`);
        if (!r.ok) return [];
        return ((await r.json()) as { links?: DafLinkLite[] }).links ?? [];
      } catch { return []; }
    },
  );
  // The daf's connections, ALL from the unified /api/links layer, rendered
  // uniformly: cross-daf links (cites + continues + any off-daf flow) grouped by
  // relation as navigable chips, plus a compact count of the within-daf flow
  // (whose detailed view is the maps above). Retires the old cites-only list.
  const relLabel = (rel: string): string => t(`link.rel.${rel}` as Parameters<typeof t>[0]);
  const crossDafByRelation = (): { relation: string; pages: { tractate: string; page: string; label: string }[] }[] => {
    const byRel = new Map<string, { tractate: string; page: string; label: string }[]>();
    const seen = new Set<string>();
    for (const l of links() ?? []) {
      for (const tgt of l.targets) {
        if (tgt.tractate === props.tractate && tgt.page === props.page) continue; // same daf → not here
        const k = `${l.relation}|${tgt.tractate}|${tgt.page}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const label = tgt.seg >= 0 ? `${tgt.tractate} ${tgt.page}:${tgt.seg}` : `${tgt.tractate} ${tgt.page}`;
        const arr = byRel.get(l.relation) ?? [];
        arr.push({ tractate: tgt.tractate, page: tgt.page, label });
        byRel.set(l.relation, arr);
      }
    }
    return [...byRel.entries()].map(([relation, pages]) => ({ relation, pages }));
  };
  const withinFlowCounts = (): { relation: string; count: number }[] => {
    const byRel = new Map<string, number>();
    for (const l of links() ?? []) {
      if (l.via !== 'flow') continue;
      for (const tgt of l.targets) {
        if (tgt.tractate !== props.tractate || tgt.page !== props.page) continue; // within-daf only
        byRel.set(l.relation, (byRel.get(l.relation) ?? 0) + 1);
      }
    }
    return [...byRel.entries()].map(([relation, count]) => ({ relation, count }));
  };
  const hasConnections = (): boolean => crossDafByRelation().length > 0 || withinFlowCounts().length > 0;
  const goToDaf = (tractate: string, page: string): void => {
    const u = new URL(window.location.href);
    u.searchParams.set('tractate', tractate);
    u.searchParams.set('page', page);
    u.hash = '';
    window.location.href = u.toString();
  };

  // Adjacent-amud page label for the continuation caption: Hebrew daf form
  // ('ב.') in he mode, the raw '2a' slug in en.
  const pageRef = (p: string | null): string => (p ? (lang() === 'he' ? pageLabelHe(p) : p) : '');

  // Cross-page continuation hint: a muted caption, not a chip. Subtle on
  // purpose — it's an aside, not a heading (no fill, no border, no bold).
  const crossLabel = (text: string): JSX.Element => (
    <div style={{
      'font-size': '0.66rem', 'font-weight': 400, color: '#9ca3af',
      'letter-spacing': '0.02em', padding: '0.1rem 0.15rem', margin: '0.05rem 0',
    }}>{text}</div>
  );

  return (
    <Panel accent={ACCENTS.argument} title={t('overview.title')}>
      <Synthesis
        markId="argument-overview"
        instance={{ fields: {} }}
        instanceKey={`${props.tractate}/${props.page}/overview`}
        tractate={props.tractate}
        page={props.page}
        onResolved={handleResolved}
      />
      <Show
        when={props.sections.length > 0}
        fallback={
          <HebrewProse size="0.85rem" color="#999" margin="0.6rem 0 0">
            {t('overview.empty')}
          </HebrewProse>
        }
      >
        {/* One flow-graph map per discussion. Multiple maps = multiple sugyot on
            the daf; the cross-page flags show where a discussion runs past the
            page break. */}
        <For each={groups()}>{(grp) => {
          const hasFirst = grp.includes(0);
          const hasLast = grp.includes(props.sections.length - 1);
          const grpNodes = grp.map((i) => ({ index: i, title: props.sections[i].title }));
          const activeInGroup = () => active() !== null && grp.includes(active()!);
          return (
            <div style={{ 'margin-bottom': '0.7rem' }}>
              <Show when={hasFirst && bridge()?.fromPrev}>
                {crossLabel(t('overview.continuesFrom', { page: pageRef(bridge()!.prev) }))}
              </Show>
              <ArgumentFlowGraph
                nodes={grpNodes}
                connections={connections()}
                activeIndex={active()}
                onSelect={selectSection}
              />
              <Show when={hasLast && bridge()?.toNext}>
                {crossLabel(t('overview.continuesOnto', { page: pageRef(bridge()!.next) }))}
              </Show>
              <Show when={activeInGroup() && props.sections[active()!]}>
                <OverviewSectionVoices
                  section={props.sections[active()!]}
                  tractate={props.tractate}
                  page={props.page}
                  onPushRabbi={props.onPushRabbi}
                />
              </Show>
            </div>
          );
        }}</For>
      </Show>
      <Show when={hasConnections()}>
        <div style={{ 'margin-top': '0.7rem', 'border-top': '1px solid #f0f0f0', 'padding-top': '0.55rem' }}>
          <div style={{
            'font-size': '0.65rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em',
            color: '#9ca3af', 'margin-bottom': '0.35rem',
          }}>{t('overview.connections')}</div>
          {/* Cross-daf links, grouped by relation — each navigable. */}
          <For each={crossDafByRelation()}>{(grp) => (
            <div style={{ display: 'flex', 'align-items': 'baseline', 'flex-wrap': 'wrap', gap: '0.3rem', 'margin-bottom': '0.25rem' }}>
              <span style={{
                'font-size': '0.62rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em',
                color: '#9ca3af', 'flex-shrink': 0,
              }}>{relLabel(grp.relation)}</span>
              <For each={grp.pages}>{(p) => (
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); goToDaf(p.tractate, p.page); }}
                  title={t('overview.goToDaf', { daf: p.label })}
                  style={{
                    'font-size': '0.72rem', color: '#1d4ed8', 'text-decoration': 'none',
                    background: '#eff6ff', border: '1px solid #dbeafe', 'border-radius': '5px',
                    padding: '0.12rem 0.4rem', 'white-space': 'nowrap',
                  }}
                >{p.label}</a>
              )}</For>
            </div>
          )}</For>
          {/* Within-daf flow — the detail is in the maps above; here just a count. */}
          <Show when={withinFlowCounts().length > 0}>
            <div style={{ 'font-size': '0.66rem', color: '#9ca3af', 'margin-top': '0.2rem' }}>
              {t('overview.withinFlow')}: {withinFlowCounts().map((f) => `${f.count} ${relLabel(f.relation)}`).join(' · ')}
            </div>
          </Show>
        </div>
      </Show>
      {/* Hand off into the in-depth argument card. Opens the section the reader
       *  has drilled into (active), else the start of the argument. */}
      <Show when={props.onOpenArgument && props.sections.length > 0}>
        <div style={{ 'margin-top': '0.8rem', 'border-top': '1px solid #f0f0f0', 'padding-top': '0.6rem' }}>
          <button
            onClick={() => props.onOpenArgument?.(active() ?? 0)}
            style={{
              width: '100%', 'text-align': 'center', cursor: 'pointer', 'font-family': 'inherit',
              'font-size': '0.78rem', color: '#8a2a2b', background: '#fdf3f3',
              border: '1px solid #f0dcdc', 'border-radius': '7px', padding: '0.45rem 0.6rem',
            }}
          >{t('overview.openArgument')}</button>
        </div>
      </Show>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Whole-daf Background: the terms/concepts a reader needs to follow the daf,
// grouped into themed sections. The `daf-background.synthesis` aggregate renders
// a one-sentence orientation; its deps_resolved carries `daf-background.concepts`
// (the themed groups), surfaced below without a second /api/run call.
// ---------------------------------------------------------------------------

function BackgroundGroups(props: { groups: BackgroundGroup[] }): JSX.Element {
  return (
    <div style={{ 'margin-top': '0.7rem', display: 'flex', 'flex-direction': 'column', gap: '0.95rem' }}>
      <For each={props.groups}>{(g) => (
        <div>
          <div style={{
            'font-size': '0.68rem', 'text-transform': 'uppercase', 'letter-spacing': '0.08em',
            color: ACCENTS['daf-background'], 'font-weight': 600, 'margin-bottom': '0.4rem',
          }}>
            {t(`background.cat.${g.category}`)}
          </div>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.55rem' }}>
            <For each={g.terms}>{(tm) => (
              <div>
                <div style={{
                  display: 'flex', gap: '0.4rem', 'align-items': 'baseline', 'flex-wrap': 'wrap',
                  'font-size': '0.86rem', 'font-weight': 600, color: '#222',
                }}>
                  <span>{tm.term}</span>
                  <Show when={tm.termHe}>
                    <span dir="rtl" style={{ color: ACCENTS['daf-background'], 'font-weight': 500 }}>{tm.termHe}</span>
                  </Show>
                </div>
                <div style={{ 'font-size': '0.82rem', color: '#444', 'line-height': 1.5 }}>
                  <HebraizedWithRabbis text={tm.gloss} />
                </div>
              </div>
            )}</For>
          </div>
        </div>
      )}</For>
    </div>
  );
}

function DafBackgroundBody(props: { tractate: string; page: string }): JSX.Element {
  const [groups, setGroups] = createSignal<BackgroundGroup[]>([]);
  const [resolved, setResolved] = createSignal(false);

  createEffect(() => {
    void `${props.tractate}/${props.page}`;
    setGroups([]);
    setResolved(false);
  });

  const handleResolved = (r: { deps_resolved?: Record<string, unknown> }) => {
    const concepts = r.deps_resolved?.['daf-background.concepts'] as { groups?: BackgroundGroup[] } | undefined;
    setGroups(orderBackgroundGroups(concepts?.groups));
    setResolved(true);
  };

  return (
    <Panel accent={ACCENTS['daf-background']} title={t('background.title')}>
      <Synthesis
        markId="daf-background"
        instance={{ fields: {} }}
        instanceKey={`${props.tractate}/${props.page}/background`}
        tractate={props.tractate}
        page={props.page}
        onResolved={handleResolved}
      />
      <Show when={groups().length > 0}>
        <BackgroundGroups groups={groups()} />
      </Show>
      <Show when={resolved() && groups().length === 0}>
        <HebrewProse size="0.85rem" color="#999" margin="0.6rem 0 0">
          {t('background.empty')}
        </HebrewProse>
      </Show>
    </Panel>
  );
}

function sefariaUrl(source: 'mishnehTorah' | 'shulchanAruch' | 'rema', ref: string): string | null {
  const trimmed = ref.trim();
  if (source === 'mishnehTorah') {
    return `https://www.sefaria.org/search?q=${encodeURIComponent('Mishneh Torah ' + trimmed)}`;
  }
  const match = trimmed.match(/^(Orach(?:\s+)?(?:Ch|H)(?:aim|ayyim)?|Yoreh\s+De'?ah|Even\s+Ha'?Ezer|Choshen\s+Mishpat)\s+(\d+):(\d+)/i);
  if (match) {
    const sectionMap: Record<string, string> = {
      orachchaim: 'Orach_Chayyim', orachchayyim: 'Orach_Chayyim', orachhaim: 'Orach_Chayyim',
      yorehdeah: 'Yoreh_De%27ah', evenhaezer: 'Even_HaEzer', choshenmishpat: 'Choshen_Mishpat',
    };
    const normalized = match[1].toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
    const section = sectionMap[normalized];
    if (section) {
      const prefix = source === 'rema' ? 'Mappah' : 'Shulchan_Arukh';
      return `https://www.sefaria.org/${prefix}%2C_${section}.${match[2]}.${match[3]}`;
    }
  }
  return `https://www.sefaria.org/search?q=${encodeURIComponent(trimmed)}`;
}

function RulingRow(props: {
  source: 'mishnehTorah' | 'shulchanAruch' | 'rema';
  label: string;
  color: string;
  ruling?: { ref: string; summary: string };
}): JSX.Element {
  return (
    <Show when={props.ruling}>
      {(r) => {
        const url = sefariaUrl(props.source, r().ref);
        return (
          <div style={{
            padding: '0.55rem 0.7rem',
            background: '#fafaf7',
            border: '1px solid #eae8e0',
            'border-radius': '4px',
            'margin-bottom': '0.45rem',
          }}>
            <div style={{
              'font-size': '0.68rem',
              'text-transform': 'uppercase',
              'letter-spacing': '0.06em',
              'font-weight': 600,
              color: props.color,
              'margin-bottom': '0.25rem',
            }}>
              {props.label}
            </div>
            <div style={{ 'font-weight': 500, color: '#333', 'margin-bottom': '0.2rem', 'font-size': '0.85rem' }}>
              <a href={url ?? '#'} target="_blank" rel="noopener noreferrer"
                 style={{ color: props.color, 'text-decoration': 'none' }}>
                {r().ref} ↗
              </a>
            </div>
            <div style={{ color: '#555', 'line-height': 1.45, 'font-size': '0.85rem' }}>
              <HebraizedWithRabbis text={r().summary} />
            </div>
          </div>
        );
      }}
    </Show>
  );
}

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
  const effPlaces = (): string[] => identity()?.places ?? ((f().places as string[] | undefined) ?? []);
  const regionLabel = (): string => effRegion() === 'israel' ? t('geography.eretzYisrael')
    : effRegion() === 'bavel' ? t('geography.bavel')
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
  return (
    <Show when={metaParts().length > 0}>
      <div style={{
        display: 'flex', 'align-items': 'center', gap: '0.45rem',
        'font-size': '0.78rem', color: '#666',
        'margin-bottom': '0.85rem', 'flex-wrap': 'wrap',
        'line-height': 1.5,
      }}>
        <Show when={gen()}>
          <span style={{
            display: 'inline-block', width: '0.55rem', height: '0.55rem',
            'background-color': gen()!.color, 'border-radius': '50%',
            'flex-shrink': 0,
          }} />
        </Show>
        <span>{metaParts().join(' · ')}</span>
      </div>
    </Show>
  );
}

function RabbiLineage(props: SpecialBlockProps): JSX.Element {
  const f = (): Record<string, unknown> => props.instance.fields;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  // Clear any active reader-highlight when the rabbi changes (the old body did this).
  createEffect(() => { void props.instanceKey; props.onHighlightRange?.(null); });
  const rel = (): RelationshipsData | undefined => {
    const r = props.deps['rabbi.relationships'] as RelationshipsData | undefined;
    return r && Array.isArray(r.teachers) ? r : undefined;
  };
  const relEv = (): RelationshipsEvidence[] => {
    const e = props.deps['rabbi.relationships.evidence'] as { evidence?: RelationshipsEvidence[] } | undefined;
    return e?.evidence ?? [];
  };
  const generationByName = (): Map<string, GenerationId> =>
    (props.extras?.generationByName as Map<string, GenerationId> | undefined) ?? EMPTY_GEN_MAP;
  return (
    <Show when={rel()}>
      {(r) => (
        <div style={{ position: 'relative' }}>
          <InspectDot instanceKey={props.instanceKey} leafId="rabbi.relationships" style={{ position: 'absolute', top: '0.2rem', right: 0, 'z-index': 2 }} />
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
    const e = props.deps['rabbi.geography.evidence'] as { evidence?: GeographyEvidence[] } | undefined;
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
          <InspectDot instanceKey={props.instanceKey} leafId="rabbi.geography" style={{ position: 'absolute', top: '0.2rem', right: 0, 'z-index': 2 }} />
          <RabbiPlacesTimeline
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

/** Display instance ({fields} for the heading + meta). */
export function rabbiDisplayInstance(rabbi: IdentifiedRabbi): { fields: Record<string, unknown> } {
  return { fields: { name: rabbi.name, nameHe: rabbi.nameHe, generation: rabbi.generation, region: rabbi.region, places: rabbi.places } };
}
/** The FLAT shape the rabbi mark synthesis expects as mark_input (unchanged from
 *  the bespoke body, so the rabbi.synthesis cache stays valid). */
export function rabbiSynthInstance(rabbi: IdentifiedRabbi): unknown {
  return { name: rabbi.name, nameHe: rabbi.nameHe, generation: rabbi.generation, region: rabbi.region, places: rabbi.places };
}
export const RABBI_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
  'rabbi-meta': RabbiMeta,
  'rabbi-lineage': RabbiLineage,
  'rabbi-geography': RabbiGeography,
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

interface CodificationRuling { ref: string; ruling: string; }
interface CodificationData {
  mishnehTorah: CodificationRuling | null;
  tur: CodificationRuling | null;
  shulchanAruch: CodificationRuling | null;
  rema: CodificationRuling | null;
  prose: string;
}
interface PracticalData {
  lechatchila: string;
  bedieved: string;
  appliesWhen: string[];
  exceptions: string[];
  prose: string;
}
interface DisputePosition { voice: string; position: string; }
interface DisputeItem {
  axis: 'ashkenaz-sefarad' | 'rishonim' | 'acharonim' | 'modern' | 'other';
  label: string;
  positions: DisputePosition[];
  settled: string;
}
interface DisputesData { disputes: DisputeItem[]; }

// Halacha codification: structured ruling rows (Mishneh Torah / Tur / Shulchan
// Aruch / Rema). A NAMED special block reading the halacha.codification leaf.
function HalachaCodification(props: SpecialBlockProps): JSX.Element {
  const codification = (): CodificationData | undefined => {
    const d = props.deps['halacha.codification'] as CodificationData | undefined;
    return d && typeof d.prose === 'string' ? d : undefined;
  };
  return (
      <Show when={codification()}>
        {(cod) => (
          <div style={{ 'margin-top': '0.9rem' }}>
            <div style={{
              'font-size': '0.7rem', 'text-transform': 'uppercase',
              'letter-spacing': '0.08em', color: '#888', 'margin-bottom': '0.5rem',
              display: 'flex', 'align-items': 'center', gap: '0.4rem',
            }}>
              <span>{t('halacha.codification')}</span>
              <InspectDot instanceKey={props.instanceKey} leafId="halacha.codification" style={{ 'margin-left': 'auto' }} />
            </div>
            <RulingRow
              source="mishnehTorah" label={t('source.mishnehTorah')} color="#8a2a2b"
              ruling={cod().mishnehTorah ? { ref: cod().mishnehTorah!.ref, summary: cod().mishnehTorah!.ruling } : undefined}
            />
            <Show when={cod().tur}>
              {(tur) => (
                <div style={{
                  padding: '0.55rem 0.7rem', background: '#fafaf7',
                  border: '1px solid #eae8e0', 'border-radius': '4px',
                  'margin-bottom': '0.45rem',
                }}>
                  <div style={{
                    'font-size': '0.68rem', 'text-transform': 'uppercase',
                    'letter-spacing': '0.06em', 'font-weight': 600, color: '#a16207',
                    'margin-bottom': '0.25rem',
                  }}>{t('source.tur')}</div>
                  <div style={{ 'font-weight': 500, color: '#333', 'margin-bottom': '0.2rem', 'font-size': '0.85rem' }}>
                    {tur().ref}
                  </div>
                  <div style={{ color: '#555', 'line-height': 1.45, 'font-size': '0.85rem' }}>
                    <HebraizedWithRabbis text={tur().ruling} />
                  </div>
                </div>
              )}
            </Show>
            <RulingRow
              source="shulchanAruch" label={t('source.shulchanAruch')} color="#1e40af"
              ruling={cod().shulchanAruch ? { ref: cod().shulchanAruch!.ref, summary: cod().shulchanAruch!.ruling } : undefined}
            />
            <RulingRow
              source="rema" label={t('source.rema')} color="#7c3aed"
              ruling={cod().rema ? { ref: cod().rema!.ref, summary: cod().rema!.ruling } : undefined}
            />
          </div>
        )}
      </Show>
  );
}

// Halacha practical guidance: lechatchila / bedieved + applies-when / exceptions.
function HalachaPractical(props: SpecialBlockProps): JSX.Element {
  const practical = (): PracticalData | undefined => {
    const d = props.deps['halacha.practical'] as PracticalData | undefined;
    return d && typeof d.prose === 'string' ? d : undefined;
  };
  return (
      <Show when={practical()}>
        {(pr) => (
          <SectionCard label="halacha.practical" inspect={{ instanceKey: props.instanceKey, leafId: 'halacha.practical' }}>
            <Show when={pr().lechatchila}>
              <div style={{ 'margin-bottom': '0.4rem' }}>
                <div style={{ 'font-size': '0.65rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', 'margin-bottom': '0.15rem' }}>
                  <span lang="he" dir="ltr" style={{ 'font-family': '"Mekorot Vilna", serif', 'font-size': '0.85rem', 'text-transform': 'none', color: '#666' }}>לכתחילה</span>
                  <span style={{ 'margin-left': '0.35rem' }}>{t('halacha.lechatchila')}</span>
                </div>
                <div style={{ 'font-size': '0.88rem', color: '#222', 'line-height': 1.5 }}>
                  <HebraizedWithRabbis text={pr().lechatchila} />
                </div>
              </div>
            </Show>
            <Show when={pr().bedieved}>
              <div style={{ 'margin-bottom': '0.4rem' }}>
                <div style={{ 'font-size': '0.65rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', 'margin-bottom': '0.15rem' }}>
                  <span lang="he" dir="ltr" style={{ 'font-family': '"Mekorot Vilna", serif', 'font-size': '0.85rem', 'text-transform': 'none', color: '#666' }}>בדיעבד</span>
                  <span style={{ 'margin-left': '0.35rem' }}>{t('halacha.bedieved')}</span>
                </div>
                <div style={{ 'font-size': '0.88rem', color: '#222', 'line-height': 1.5 }}>
                  <HebraizedWithRabbis text={pr().bedieved} />
                </div>
              </div>
            </Show>
            <Show when={pr().appliesWhen.length > 0}>
              <div style={{ 'margin-bottom': '0.4rem' }}>
                <div style={{ 'font-size': '0.65rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', 'margin-bottom': '0.15rem' }}>{t('halacha.appliesWhen')}</div>
                <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem' }}>
                  <For each={pr().appliesWhen}>{(item) => (
                    <span style={{
                      'font-size': '0.75rem', padding: '0.15rem 0.5rem',
                      background: '#fff', border: '1px solid #e5e3dc',
                      'border-radius': '999px', color: '#444',
                    }}><Hebraized text={item} capitalize /></span>
                  )}</For>
                </div>
              </div>
            </Show>
            <Show when={pr().exceptions.length > 0}>
              <div style={{ 'margin-bottom': '0.4rem' }}>
                <div style={{ 'font-size': '0.65rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', 'margin-bottom': '0.15rem' }}>{t('halacha.exceptions')}</div>
                <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem' }}>
                  <For each={pr().exceptions}>{(item) => (
                    <span style={{
                      'font-size': '0.75rem', padding: '0.15rem 0.5rem',
                      background: '#fef3c7', border: '1px solid #fde68a',
                      'border-radius': '999px', color: '#92400e',
                    }}><Hebraized text={item} capitalize /></span>
                  )}</For>
                </div>
              </div>
            </Show>
          </SectionCard>
        )}
      </Show>
  );
}

// Halacha disputes: machlokes positions grouped per axis.
function HalachaDisputes(props: SpecialBlockProps): JSX.Element {
  const disputes = (): DisputeItem[] => {
    const d = props.deps['halacha.disputes'] as DisputesData | undefined;
    return d && Array.isArray(d.disputes) ? d.disputes : [];
  };
  return (
      <Show when={disputes().length > 0}>
        <SectionCard label="halacha.disputes" inspect={{ instanceKey: props.instanceKey, leafId: 'halacha.disputes' }}>
          <For each={disputes()}>{(d) => (
            <div style={{ 'margin-bottom': '0.6rem' }}>
              <div style={{ 'font-weight': 500, color: '#333', 'font-size': '0.88rem', 'margin-bottom': '0.25rem' }}>
                {d.label}
                <span style={{ 'font-size': '0.65rem', color: '#999', 'margin-left': '0.4rem', 'text-transform': 'uppercase', 'letter-spacing': '0.06em' }}>
                  {axisLabel(d.axis)}
                </span>
              </div>
              <For each={d.positions}>{(p) => (
                <div style={{ 'font-size': '0.82rem', 'line-height': 1.5, color: '#444', 'margin-bottom': '0.2rem' }}>
                  <span style={{ 'font-weight': 600, color: '#222' }}>{p.voice}:</span> <HebraizedWithRabbis text={p.position} />
                </div>
              )}</For>
              <Show when={d.settled}>
                <div style={{ 'font-size': '0.78rem', color: '#666', 'font-style': 'italic', 'margin-top': '0.2rem' }}>
                  <HebraizedWithRabbis text={d.settled} />
                </div>
              </Show>
            </div>
          )}</For>
        </SectionCard>
      </Show>
  );
}

/** The halacha mark-instance shape (mark_input for the leaves). */
export function halachaInstance(topic: HalachaTopic): { fields: Record<string, unknown>; startSegIdx: number; endSegIdx: number } {
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
  'halacha-disputes': HalachaDisputes,
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
  const verseRef = (): string => (typeof props.instance.fields.verseRef === 'string' ? props.instance.fields.verseRef : '');
  const [expanded, setExpanded] = createSignal(true);
  const [detail] = createResource(verseRef, fetchPasuk);
  const [prev] = createResource(() => (expanded() ? detail()?.prevRef ?? null : null), (r) => fetchPasuk(r));
  const [next] = createResource(() => (expanded() ? detail()?.nextRef ?? null : null), (r) => fetchPasuk(r));
  return (
    <>
      {/* Hebrew verse ref heading — the card's real header (fetched, so it can't
          be a static recipe title; the recipe omits titleField for this). */}
      <h3 dir="rtl" lang="he" style={{ margin: '0 0 0.3rem', 'font-size': '1.05rem', color: ACCENTS.pesuk, 'font-family': HE_FONT }}>
        {detail()?.heRef ?? verseRef()}
      </h3>
      <Show when={detail.loading && !detail()}>
        <p style={{ color: '#999', 'font-style': 'italic', margin: '0 0 0.5rem' }}>{t('pasuk.loading')}</p>
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
          background: 'none', border: 'none', padding: '0.15rem 0',
          margin: '0.1rem 0 0.7rem', color: '#a8a29e', cursor: 'pointer',
          font: 'inherit', 'font-size': '0.62rem',
          'letter-spacing': '0.06em', 'text-transform': 'uppercase',
        }}
        title={expanded() ? t('pasuk.verses.hide') : t('pasuk.verses.show')}
      >{expanded() ? `› ${t('common.collapse')} ‹` : `‹ ${t('common.expand')} ›`}</button>
    </>
  );
}

/** The pasuk mark-instance shape (mark_input for the pesukim leaves). Seg indices
 *  are passed through as-is (may be undefined) — coercing an absent index to 0
 *  would mis-scope a malformed pasuk to segment 0, which the old panel avoided. */
export function pasukInstance(pasuk: Pasuk): { fields: Record<string, unknown>; startSegIdx?: number; endSegIdx?: number } {
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

interface AggadataBackgroundData { background: string; }
interface AggadataInterpretationData { interpretation: string; }
type AggadataParallelKind = 'same-story' | 'same-actors' | 'same-motif' | 'tanach-source';
interface AggadataParallelItem { ref: string; kind: AggadataParallelKind; note: string; }
interface AggadataParallelsData { parallels: AggadataParallelItem[]; prose: string; }

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
        <SectionCard label="aggadata.parallels" inspect={{ instanceKey: props.instanceKey, leafId: 'aggadata.parallels' }}>
          <Show when={p().prose}>
            <div style={{ 'font-size': '0.82rem', color: '#555', 'line-height': 1.5, 'font-style': 'italic', 'margin-bottom': '0.5rem' }}>
              <HebraizedWithRabbis text={p().prose} />
            </div>
          </Show>
          <For each={p().parallels}>{(par) => (
            <div style={{ 'margin-bottom': '0.5rem' }}>
              <div style={{ 'margin-bottom': '0.15rem', display: 'flex', 'align-items': 'baseline', gap: '0.4rem', 'flex-wrap': 'wrap' }}>
                <span style={{ 'font-weight': 600, color: '#1e40af', 'font-size': '0.85rem' }}>{par.ref}</span>
                <span style={{ 'font-size': '0.65rem', padding: '0.1rem 0.4rem', background: '#faf5ff', border: '1px solid #d8b4fe', color: '#7c3aed', 'border-radius': '999px', 'text-transform': 'uppercase', 'letter-spacing': '0.06em' }}>{t(`aggadata.parallel.${par.kind}`)}</span>
              </div>
              <div style={{ 'font-size': '0.82rem', color: '#444', 'line-height': 1.5 }}><HebraizedWithRabbis text={par.note} /></div>
            </div>
          )}</For>
        </SectionCard>
      )}
    </Show>
  );
}

/** The aggadata card as a recipe: a theme tag, the story summary, the synthesis,
 *  two explainer boxes, the custom parallels block, then follow-up Q&A. */export const AGGADATA_BLOCKS: Record<string, (p: SpecialBlockProps) => JSX.Element> = {
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
export function instanceKeyForContent(content: SidebarContent, tractate: string, page: string): string | null {
  switch (content.kind) {
    case 'aggadata': return `${tractate}:${page}:${content.index}:${content.story.title}`;
    case 'pesuk': return content.pasuk.verseRef;
    case 'halacha': return `${tractate}:${page}:${content.index}:${content.topic.topic}`;
    case 'rabbi': return content.rabbi.name;
    case 'rishonim': return `rishonim:${tractate}:${page}:${content.instance.segIdx}`;
    default: return null;
  }
}

/** The mark-instance shape the aggadata extractor emits (mark_input for leaves). */
export function aggadataInstance(story: AggadataStory): { fields: Record<string, unknown>; startSegIdx: number; endSegIdx: number } {
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
    r === 'israel' ? t('geography.eretzYisrael') : r === 'bavel' ? t('geography.bavel') : r === 'other' ? t('region.other') : r;
  const chip = (text: string): JSX.Element => (
    <span style={{
      'font-size': '0.65rem', color: '#9a3412', background: '#fff7ed',
      border: '1px solid #fed7aa', 'border-radius': '999px',
      padding: '0.1rem 0.45rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em',
    }}>{text}</span>
  );
  return (
    <div style={{ display: 'flex', gap: '0.35rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.7rem' }}>
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
        {t(commentCount() === 1 ? 'rishonim.commentCount.one' : 'rishonim.commentCount.other', { count: commentCount() })}
        {' · '}
        {t(works().length === 1 ? 'rishonim.workCount.one' : 'rishonim.workCount.other', { count: works().length })}
      </div>
    </>
  );
}

function RishonimSources(props: SpecialBlockProps): JSX.Element {
  const comments = (): RishonComment[] => (props.instance.fields.comments as RishonComment[] | undefined) ?? [];
  return (
    <div style={{ 'margin-top': '0.8rem' }}>
      <div style={{
        'font-size': '0.65rem', color: '#94a3b8',
        'text-transform': 'uppercase', 'letter-spacing': '0.06em',
        'margin-bottom': '0.3rem',
      }}>
        {t('rishonim.primarySources')}
      </div>
      <For each={comments()}>{(c) => (
        <details style={{
          'margin-bottom': '0.5rem',
          'border-bottom': '1px solid #f1f5f9',
          'padding-bottom': '0.45rem',
        }}>
          <summary style={{ cursor: 'pointer', 'font-weight': 500, color: '#1f2937' }}>
            {c.work}
            <Show when={c.workHe}>
              <span style={{ 'margin-left': '0.4rem', color: '#94a3b8', 'font-size': '0.78rem', 'font-family': '"Mekorot Vilna", serif' }} dir="rtl" lang="he">{c.workHe}</span>
            </Show>
            <span style={{ 'margin-left': '0.4rem', color: '#cbd5e1', 'font-size': '0.7rem', 'font-family': 'ui-monospace, Menlo, monospace' }}>{c.sourceRef}</span>
          </summary>
          <Show when={c.textHe}>
            <p dir="rtl" lang="he" style={{
              margin: '0.4rem 0 0', 'font-family': '"Mekorot Vilna", serif',
              'font-size': '1rem', 'line-height': 1.65, color: '#222',
            }} innerHTML={c.textHe} />
          </Show>
          <Show when={c.textEn}>
            <p style={{ margin: '0.4rem 0 0', 'font-size': '0.86rem', 'line-height': 1.55, color: '#475569' }} innerHTML={c.textEn} />
          </Show>
        </details>
      )}</For>
    </div>
  );
}

/** Display instance ({fields} with segIdx flattened in for the blocks). */
export function rishonimDisplayInstance(inst: RishonimInstance): { fields: Record<string, unknown> } {
  return { fields: { segIdx: inst.segIdx, works: inst.fields.works, commentCount: inst.fields.commentCount, comments: inst.fields.comments } };
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
// supply directly. Place keeps the older hint adapter; the argument-family +
// voice-group cards are bespoke views (no recipe).
//
// The builders receive the (kind-narrowed) SidebarContent; CARD_DEFS is keyed by
// kind and only invoked for its own kind, so the casts are sound.
// ===========================================================================
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
  /** Card-specific extras for special blocks (e.g. rabbi's generationByName). */
  extras?: (ctx: { generationByName: Map<string, GenerationId> }) => Record<string, unknown>;
}

export const CARD_DEFS: Partial<Record<SidebarContent['kind'], CardDef>> = {
  aggadata: {
    recipe: AGGADATA_RECIPE,
    blocks: AGGADATA_BLOCKS,
    instance: (c) => aggadataInstance((c as Extract<SidebarContent, { kind: 'aggadata' }>).story),
    qaInstanceId: (c) => {
      const s = (c as Extract<SidebarContent, { kind: 'aggadata' }>).story;
      return `${s.title}|${s.excerpt}`;
    },
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
  rishonim: {
    recipe: RISHONIM_RECIPE,
    blocks: RISHONIM_BLOCKS,
    instance: (c) => rishonimDisplayInstance((c as Extract<SidebarContent, { kind: 'rishonim' }>).instance),
    synthInstance: (c) => rishonimSynthInstance((c as Extract<SidebarContent, { kind: 'rishonim' }>).instance),
  },
  rabbi: {
    recipe: RABBI_RECIPE,
    blocks: RABBI_BLOCKS,
    instance: (c) => rabbiDisplayInstance((c as Extract<SidebarContent, { kind: 'rabbi' }>).rabbi),
    synthInstance: (c) => rabbiSynthInstance((c as Extract<SidebarContent, { kind: 'rabbi' }>).rabbi),
    forwardHighlight: true,
    extras: (ctx) => ({ generationByName: ctx.generationByName }),
  },
};

/** Collective "voice group" panel (e.g. the Stam / anonymous Gemara voice):
 *  a name + Hebrew twin + a one-line collective bio. No enrichments. */
export function VoiceGroupBody(props: { group: { name: string; nameHe: string; bio: string } }): JSX.Element {
  return (
    <Panel accent={ACCENTS['voice-group']} title={props.group.name} titleHe={props.group.nameHe}>
      <div style={{
        'font-size': '0.7rem', color: '#999',
        'text-transform': 'uppercase', 'letter-spacing': '0.08em',
        'margin-bottom': '0.45rem',
      }}>{t('voiceGroup.collective')}</div>
      <p style={{ margin: 0, color: '#333', 'line-height': 1.6 }}>
        {props.group.bio}
      </p>
    </Panel>
  );
}

export function ArgumentSidebar(props: ArgumentSidebarProps): JSX.Element {
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
    if (!content) { setActiveCard(null); return; }
    const recipe = CARD_DEFS[content.kind]?.recipe;
    const instanceKey = instanceKeyForContent(content, props.tractate, props.page);
    setActiveCard(recipe && instanceKey ? { recipe, instanceKey } : null);
  });
  onCleanup(() => setActiveCard(null));

  return (
    <Show when={props.content}>
      {(c) => (
        <RabbiLinkProvider value={{
          rabbis: () => props.dafRabbis,
          extraNames: () => props.dafRabbiNames,
          onPushRabbi: props.onPushRabbi,
        }}>
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
                    display: 'flex', 'align-items': 'center', gap: '0.35rem',
                    width: '100%', 'text-align': 'left',
                    background: '#f5f3ee', border: '1px solid #e5e3dc',
                    'border-radius': '4px',
                    padding: '0.35rem 0.55rem', margin: '0 0 0.55rem',
                    cursor: 'pointer', font: 'inherit',
                    'font-size': '0.75rem', color: '#555',
                  }}
                >
                  <span style={{ 'font-size': '0.85rem', 'line-height': 1 }}>←</span>
                  <span style={{
                    'white-space': 'nowrap', overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                  }}>{label()}</span>
                </button>
              )}
            </Show>
            <header style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
              'padding-bottom': '0.6rem',
              'border-bottom': '1px solid #eee',
              'margin-bottom': '0.75rem',
            }}>
              <span style={{ 'font-size': '0.7rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.08em' }}>
                {t(kindLabelKey(c().kind))}
                {' · '}
                {lang() === 'he' ? dafRefHe(props.tractate, props.page) : `${props.tractate} ${props.page}`}
              </span>
              <button
                onClick={props.onClose}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  'font-size': '1.2rem', color: '#888', padding: '0.1rem 0.3rem',
                }}
                aria-label={t('common.close')}
              >×</button>
            </header>

            <Show when={c().kind === 'argument'}>
              <ArgumentBody
                section={(c() as Extract<SidebarContent, { kind: 'argument' }>).section}
                tractate={props.tractate}
                page={props.page}
                activeRabbi={props.activeRabbi}
                onHighlightRabbi={props.onHighlightRabbi}
                onPushRabbi={props.onPushRabbi}
                dafRabbis={props.dafRabbis}
                onHighlightRange={(r) => props.onHighlightRange?.(r)}
                generationByName={props.generationByName}
              />
            </Show>

            {/* All recipe-driven cards (aggadata/pesuk/halacha/rishonim/rabbi)
                render through one generic arm, keyed by CARD_DEFS. Place keeps
                the hint adapter; the argument-family + voice-group stay bespoke. */}
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
                  onHighlightRange={def().forwardHighlight ? (r) => props.onHighlightRange?.(r) : undefined}
                  extras={def().extras?.({ generationByName: props.generationByName })}
                />
              )}
            </Show>

            <Show when={c().kind === 'voice-group'}>
              <VoiceGroupBody group={(c() as Extract<SidebarContent, { kind: 'voice-group' }>).group} />
            </Show>

            <Show when={c().kind === 'place'}>
              <SidebarPanelFromHint
                hint={PLACES_HINT}
                instance={(c() as Extract<SidebarContent, { kind: 'place' }>).place}
                tractate={props.tractate}
                page={props.page}
                chips={<PlaceChips place={(c() as Extract<SidebarContent, { kind: 'place' }>).place} />}
              />
            </Show>

            <Show when={c().kind === 'argument-overview'}>
              <ArgumentOverviewBody
                tractate={props.tractate}
                page={props.page}
                sections={props.dafSections ?? []}
                onPushRabbi={props.onPushRabbi}
                onHighlightRange={props.onHighlightRange}
                onOpenArgument={props.onOpenArgument}
              />
            </Show>

            <Show when={c().kind === 'daf-background'}>
              <DafBackgroundBody tractate={props.tractate} page={props.page} />
            </Show>

        </aside>
        </RabbiLinkProvider>
      )}
    </Show>
  );
}
