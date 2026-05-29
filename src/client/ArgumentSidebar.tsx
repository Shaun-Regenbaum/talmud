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
import { selectSectionMoves } from '../lib/argumentMoves';
import { t, lang } from './i18n';
import { ACCENTS, HebrewProse, Panel, QASection, SectionCard, Synthesis, kindLabelKey } from './sidebar/primitives';
import { InspectDot } from './MarkEnrichmentCards';

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
 *  TypeProfile (deterministic, cached marks, via /api/studio/type-profiles) and
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
        const r = await fetch(`/api/studio/type-profiles/${encodeURIComponent(tractate())}/${encodeURIComponent(page())}`);
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

/** A small dev-mode note explaining why the voice-dispute map was hidden. */
function VoicesSuppressedNote(props: { profile: SectionTypeProfile | undefined }): JSX.Element {
  return (
    <div style={{
      'margin-top': '0.6rem', padding: '0.45rem 0.6rem', 'border-radius': '4px',
      background: '#f8fafc', border: '1px dashed #cbd5e1', color: '#64748b', 'font-size': '0.75rem', 'line-height': 1.5,
    }}>
      <b>Section typing (dev):</b> typed <b>{props.profile?.primary ?? 'pure-dialectic'}</b>
      {props.profile?.isDispute ? '' : ' · not a dispute'} — the voice-dispute map is hidden here
      because this section isn't a real מחלוקת. The move flow below is the right view.
    </div>
  );
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
  | { kind: 'argument-overview' };

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
            <Show when={sectionMoves()} fallback={<VoicesSuppressedNote profile={voicesGate.profile()} />}>
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
      <Show when={voicesGate.suppress()}>
        <Show when={voicesGate.profile()?.primary === 'aggadata'} fallback={<VoicesSuppressedNote profile={voicesGate.profile()} />}>
          <ArgumentNarrative section={props.section} tractate={props.tractate} page={props.page} />
        </Show>
      </Show>
    </div>
  );
}

/** Whole-daf argument overview. Top: a one-paragraph synthesis + a flow graph
 *  of how the daf's argument sections relate (from `argument-overview.flow`,
 *  surfaced via the synthesis aggregate's deps_resolved). Click a section node
 *  to drill into that argument's voice map. Shows every argument on the daf,
 *  not one collapsed graph. */
function ArgumentOverviewBody(props: {
  tractate: string;
  page: string;
  sections: Section[];
  onPushRabbi: (name: string) => void;
}): JSX.Element {
  const [connections, setConnections] = createSignal<FlowConnection[]>([]);
  const [active, setActive] = createSignal<number | null>(null);

  createEffect(() => {
    void `${props.tractate}/${props.page}`;
    setConnections([]);
    setActive(null);
  });

  const handleResolved = (r: { deps_resolved?: Record<string, unknown>; anchors_resolved?: Record<string, unknown> }) => {
    const flow = r.deps_resolved?.['argument-overview.flow'] as { connections?: FlowConnection[] } | undefined;
    if (flow && Array.isArray(flow.connections)) setConnections(flow.connections);
  };

  const nodes = () => props.sections.map((s, i) => ({ index: i, title: s.title }));

  return (
    <Panel accent={ACCENTS.argument} title={t('overview.title')}>
      <HebrewProse size="0.8rem" color="#999" margin="0 0 0.6rem">
        {t('overview.experimental')}
      </HebrewProse>
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
        <ArgumentFlowGraph
          nodes={nodes()}
          connections={connections()}
          activeIndex={active()}
          onSelect={(i) => setActive(active() === i ? null : i)}
        />
        <Show when={active() !== null && props.sections[active()!]}>
          <OverviewSectionVoices
            section={props.sections[active()!]}
            tractate={props.tractate}
            page={props.page}
            onPushRabbi={props.onPushRabbi}
          />
        </Show>
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
export function RabbiBody(props: {
  rabbi: IdentifiedRabbi;
  tractate: string;
  page: string;
  generationByName: Map<string, GenerationId>;
  onHighlightRange: (range: { start: number; end: number; key: string; tokenStart?: number; tokenEnd?: number } | null) => void;
}): JSX.Element {
  const [relationships, setRelationships] = createSignal<RelationshipsData | null>(null);
  const [relationshipsEvidence, setRelationshipsEvidence] = createSignal<RelationshipsEvidence[]>([]);
  const [geography, setGeography] = createSignal<GeographyData | null>(null);
  const [geographyEvidence, setGeographyEvidence] = createSignal<GeographyEvidence[]>([]);
  const [location, setLocation] = createSignal<LocationInference | null>(null);
  // Canonical identity (slug/region/places/moved) from the rabbi.identity
  // enrichment, carried in the synthesis aggregate's deps_resolved. When the
  // rabbi was opened from a mark stub (no region/places), this fills them in.
  const [identity, setIdentity] = createSignal<IdentifiedRabbi | null>(null);

  const instanceKey = () => props.rabbi.name;

  // Reset on rabbi change.
  createEffect(() => {
    void instanceKey();
    setRelationships(null);
    setRelationshipsEvidence([]);
    setGeography(null);
    setGeographyEvidence([]);
    setLocation(null);
    setIdentity(null);
    props.onHighlightRange(null);
  });

  const handleResolved = (r: { deps_resolved?: Record<string, unknown>; anchors_resolved?: Record<string, unknown> }) => {
    const deps = r.deps_resolved ?? {};
    const ident = deps['rabbi.identity'] as IdentifiedRabbi | undefined;
    if (ident && typeof ident.name === 'string') setIdentity(ident);
    const rel = deps['rabbi.relationships'] as RelationshipsData | undefined;
    if (rel && Array.isArray(rel.teachers)) {
      setRelationships(rel);
    } else if (rel) {
      // eslint-disable-next-line no-console
      console.warn('[rabbi] relationships present but wrong shape — teachers not an array:', rel);
    }
    const relEv = deps['rabbi.relationships.evidence'] as { evidence?: RelationshipsEvidence[] } | undefined;
    if (relEv?.evidence) setRelationshipsEvidence(relEv.evidence);
    const geo = deps['rabbi.geography'] as GeographyData | undefined;
    if (geo && (geo.birthplace || Array.isArray(geo.primaryStudyPlaces))) {
      setGeography(geo);
    } else if (geo) {
      // eslint-disable-next-line no-console
      console.warn('[rabbi] geography present but wrong shape:', geo);
    }
    const geoEv = deps['rabbi.geography.evidence'] as { evidence?: GeographyEvidence[] } | undefined;
    if (geoEv?.evidence) setGeographyEvidence(geoEv.evidence);
    const loc = deps['rabbi.location'] as LocationInference | undefined;
    if (loc && typeof loc.place === 'string' && loc.place.length > 0) setLocation(loc);
  };

  // Effective fields: prefer the resolved rabbi.identity over the (possibly
  // stub) instance the rabbi was opened with.
  const effRegion = () => identity()?.region ?? props.rabbi.region;
  const effPlaces = () => identity()?.places ?? props.rabbi.places;
  const gen = () => GENERATION_BY_ID[props.rabbi.generation];
  const regionLabel = () => effRegion() === 'israel' ? t('geography.eretzYisrael')
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
    <Panel
      accent={ACCENTS.rabbi}
      flip="rabbi"
      title={props.rabbi.name}
      titleHe={props.rabbi.nameHe}
      meta={
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
      }
    >
      <Synthesis
        markId="rabbi"
        instance={{
          name: props.rabbi.name,
          nameHe: props.rabbi.nameHe,
          generation: props.rabbi.generation,
          region: props.rabbi.region,
          places: props.rabbi.places,
        }}
        instanceKey={instanceKey()}
        tractate={props.tractate}
        page={props.page}
        onResolved={handleResolved}
      />
      <Show when={relationships()}>
        {(rel) => (
          <div style={{ position: 'relative' }}>
            <InspectDot instanceKey={instanceKey()} leafId="rabbi.relationships" style={{ position: 'absolute', top: '0.2rem', right: 0, 'z-index': 2 }} />
            <RabbiLineageTree
              subjectName={props.rabbi.name}
              subjectGeneration={props.rabbi.generation}
              data={rel()}
              evidence={relationshipsEvidence()}
              generationByName={props.generationByName}
              onHighlightRange={props.onHighlightRange}
            />
          </div>
        )}
      </Show>
      <Show when={geography()}>
        {(geo) => (
          <div style={{ position: 'relative' }}>
            <InspectDot instanceKey={instanceKey()} leafId="rabbi.geography" style={{ position: 'absolute', top: '0.2rem', right: 0, 'z-index': 2 }} />
            <RabbiPlacesTimeline
              data={geo()}
              evidence={geographyEvidence()}
              location={location()}
              onHighlightRange={props.onHighlightRange}
            />
          </div>
        )}
      </Show>
    </Panel>
  );
}

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

export function HalachaBody(props: {
  topic: HalachaTopic;
  index: number;
  tractate: string;
  page: string;
}): JSX.Element {
  const [codification, setCodification] = createSignal<CodificationData | null>(null);
  const [practical, setPractical] = createSignal<PracticalData | null>(null);
  const [disputes, setDisputes] = createSignal<DisputeItem[]>([]);

  const instanceKey = () => `${props.tractate}:${props.page}:${props.index}:${props.topic.topic}`;

  createEffect(() => {
    void instanceKey();
    setCodification(null);
    setPractical(null);
    setDisputes([]);
  });

  const handleResolved = (r: { deps_resolved?: Record<string, unknown>; anchors_resolved?: Record<string, unknown> }) => {
    const deps = r.deps_resolved ?? {};
    const cod = deps['halacha.codification'] as CodificationData | undefined;
    if (cod && typeof cod.prose === 'string') setCodification(cod);
    const pr = deps['halacha.practical'] as PracticalData | undefined;
    if (pr && typeof pr.prose === 'string') setPractical(pr);
    const dp = deps['halacha.disputes'] as DisputesData | undefined;
    if (dp && Array.isArray(dp.disputes)) setDisputes(dp.disputes);
  };

  // The mark instance shape the registry's halacha extractor emits — its
  // `mark_input` becomes the topic JSON we pass to leaf prompts.
  const markInstance = () => ({
    startSegIdx: 0,
    endSegIdx: 0,
    fields: {
      topic: props.topic.topic,
      topicHe: props.topic.topicHe ?? '',
      summary: '',
      excerpt: props.topic.excerpt ?? '',
    },
  });

  return (
    <Panel accent={ACCENTS.halacha} title={props.topic.topic} titleHe={props.topic.topicHe}>
      <Synthesis
        markId="halacha"
        instance={markInstance()}
        instanceKey={instanceKey()}
        tractate={props.tractate}
        page={props.page}
        onResolved={handleResolved}
      />
      <Show when={codification()}>
        {(cod) => (
          <div style={{ 'margin-top': '0.9rem' }}>
            <div style={{
              'font-size': '0.7rem', 'text-transform': 'uppercase',
              'letter-spacing': '0.08em', color: '#888', 'margin-bottom': '0.5rem',
              display: 'flex', 'align-items': 'center', gap: '0.4rem',
            }}>
              <span>{t('halacha.codification')}</span>
              <InspectDot instanceKey={instanceKey()} leafId="halacha.codification" style={{ 'margin-left': 'auto' }} />
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
      <Show when={practical()}>
        {(pr) => (
          <SectionCard label="halacha.practical" inspect={{ instanceKey: instanceKey(), leafId: 'halacha.practical' }}>
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
      <Show when={disputes().length > 0}>
        <SectionCard label="halacha.disputes" inspect={{ instanceKey: instanceKey(), leafId: 'halacha.disputes' }}>
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
    </Panel>
  );
}

/** Sidebar panel for a cited pasuk: shows the full Hebrew Tanakh verse and,
 *  on expand, the surrounding verses inlined as one continuous Hebrew block
 *  (prev + cited + next) with the cited verse rendered dark and the others
 *  dimmed so the citation still stands out. */
export function PasukPanel(props: { pasuk: Pasuk; tractate: string; page: string }): JSX.Element {
  const [expanded, setExpanded] = createSignal(true);
  const [detail] = createResource(() => props.pasuk.verseRef, fetchPasuk);
  const [prev] = createResource(
    () => (expanded() ? detail()?.prevRef ?? null : null),
    (r) => fetchPasuk(r),
  );
  const [next] = createResource(
    () => (expanded() ? detail()?.nextRef ?? null : null),
    (r) => fetchPasuk(r),
  );

  // Section leaves, surfaced from the synthesis aggregate's deps_resolved
  // (same mechanism HalachaBody uses). Each renders as its own card below the
  // synthesis paragraph.
  const [tanachContext, setTanachContext] = createSignal<string | null>(null);
  const [whyHere, setWhyHere] = createSignal<string | null>(null);
  const [mechanism, setMechanism] = createSignal<string | null>(null);
  const [landing, setLanding] = createSignal<string | null>(null);

  createEffect(() => {
    void props.pasuk.verseRef;
    setTanachContext(null);
    setWhyHere(null);
    setMechanism(null);
    setLanding(null);
  });

  const handleResolved = (r: { deps_resolved?: Record<string, unknown>; anchors_resolved?: Record<string, unknown> }) => {
    const deps = r.deps_resolved ?? {};
    const tc = deps['pesukim.tanach-context'] as { context?: string } | undefined;
    if (tc && typeof tc.context === 'string') setTanachContext(tc.context);
    const wh = deps['pesukim.why-here'] as { why_here?: string } | undefined;
    if (wh && typeof wh.why_here === 'string') setWhyHere(wh.why_here);
    const me = deps['pesukim.mechanism'] as { mechanism?: string } | undefined;
    if (me && typeof me.mechanism === 'string') setMechanism(me.mechanism);
    const la = deps['pesukim.landing'] as { landing?: string } | undefined;
    if (la && typeof la.landing === 'string') setLanding(la.landing);
  };

  const pesukimInstance = () => ({
    startSegIdx: props.pasuk.startSegIdx,
    endSegIdx: props.pasuk.endSegIdx,
    fields: {
      verseRef: props.pasuk.verseRef,
      citationStyle: props.pasuk.citationStyle,
      excerpt: props.pasuk.excerpt,
      summary: props.pasuk.summary,
    },
  });

  return (
    <Panel accent={ACCENTS.pesuk} title={detail()?.heRef ?? props.pasuk.verseRef} titleLang="he">
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
      {/* Per-pasuk synthesis card. Mounts MarkEnrichmentCards markId="pesukim":
          the synthesis paragraph renders in its own box, and its resolved
          leaves (tanach-context / why-here / mechanism / landing) come back
          via onResolved and render as separate section cards below — the same
          structure as the halacha panel. */}
      <Synthesis
        markId="pesukim"
        instance={pesukimInstance()}
        instanceKey={props.pasuk.verseRef}
        tractate={props.tractate}
        page={props.page}
        onResolved={handleResolved}
      />
      <Show when={tanachContext()}>{(tc) => <SectionCard label="pasuk.tanachContext" text={tc()} inspect={{ instanceKey: props.pasuk.verseRef, leafId: 'pesukim.tanach-context' }} />}</Show>
      <Show when={whyHere()}>{(wh) => <SectionCard label="pasuk.whyHere" text={wh()} inspect={{ instanceKey: props.pasuk.verseRef, leafId: 'pesukim.why-here' }} />}</Show>
      <Show when={mechanism()}>{(me) => <SectionCard label="pasuk.mechanism" text={me()} inspect={{ instanceKey: props.pasuk.verseRef, leafId: 'pesukim.mechanism' }} />}</Show>
      <Show when={landing()}>{(la) => <SectionCard label="pasuk.landing" text={la()} inspect={{ instanceKey: props.pasuk.verseRef, leafId: 'pesukim.landing' }} />}</Show>
      {/* Questions panel: curated follow-ups + community + free-form asking. */}
      <QASection
        mark="pesukim"
        instanceId={props.pasuk.verseRef}
        instance={pesukimInstance()}
        tractate={props.tractate}
        page={props.page}
      />
    </Panel>
  );
}

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

export function AggadataPanel(props: {
  story: AggadataStory;
  index: number;
  tractate: string;
  page: string;
}): JSX.Element {
  const [background, setBackground] = createSignal<AggadataBackgroundData | null>(null);
  const [interpretation, setInterpretation] = createSignal<AggadataInterpretationData | null>(null);
  const [parallels, setParallels] = createSignal<AggadataParallelsData | null>(null);

  const instanceKey = () => `${props.tractate}:${props.page}:${props.index}:${props.story.title}`;

  // Wipe captured leaves when the user opens a different story, so the new
  // story's enrichments don't render the previous story's content during the
  // refetch window.
  createEffect(() => {
    void instanceKey();
    setBackground(null);
    setInterpretation(null);
    setParallels(null);
  });

  const handleResolved = (r: { deps_resolved?: Record<string, unknown>; anchors_resolved?: Record<string, unknown> }) => {
    const deps = r.deps_resolved ?? {};
    const bg = deps['aggadata.background'] as AggadataBackgroundData | undefined;
    if (bg && typeof bg.background === 'string') setBackground(bg);
    const ip = deps['aggadata.interpretation'] as AggadataInterpretationData | undefined;
    if (ip && typeof ip.interpretation === 'string') setInterpretation(ip);
    const pa = deps['aggadata.parallels'] as AggadataParallelsData | undefined;
    if (pa && Array.isArray(pa.parallels)) setParallels(pa);
  };

  const markInstance = () => ({
    startSegIdx: props.story.startSegIdx ?? 0,
    endSegIdx: props.story.endSegIdx ?? 0,
    fields: {
      title: props.story.title,
      titleHe: props.story.titleHe ?? '',
      summary: props.story.summary,
      excerpt: props.story.excerpt,
      endExcerpt: props.story.endExcerpt ?? '',
      theme: props.story.theme ?? '',
    },
  });
  const instanceId = () => `${props.story.title}|${props.story.excerpt}`;
  const visibleParallels = () => {
    const pa = parallels();
    return pa && (pa.parallels.length > 0 || pa.prose) ? pa : null;
  };

  return (
    <Panel accent={ACCENTS.aggadata} title={props.story.title} titleHe={props.story.titleHe}>
      <Show when={props.story.theme}>
        <div style={{ 'margin-bottom': '0.7rem' }}>
          <span style={{
            display: 'inline-block',
            padding: '0.1rem 0.5rem',
            'font-size': '0.7rem',
            'text-transform': 'uppercase',
            'letter-spacing': '0.06em',
            color: '#7c3aed',
            background: '#faf5ff',
            border: '1px solid #d8b4fe',
            'border-radius': '3px',
          }}>
            {props.story.theme}
          </span>
        </div>
      </Show>
      <p style={{ margin: '0 0 0.8rem', color: '#333', 'line-height': 1.55 }}>
        <HebraizedWithRabbis text={props.story.summary} />
      </p>
      <Synthesis
        markId="aggadata"
        instance={markInstance()}
        instanceKey={instanceKey()}
        tractate={props.tractate}
        page={props.page}
        onResolved={handleResolved}
      />
      <Show when={background()}>
        {(bg) => <SectionCard label="aggadata.background" text={bg().background} inspect={{ instanceKey: instanceKey(), leafId: 'aggadata.background' }} />}
      </Show>
      <Show when={interpretation()}>
        {(ip) => <SectionCard label="aggadata.interpretation" text={ip().interpretation} inspect={{ instanceKey: instanceKey(), leafId: 'aggadata.interpretation' }} />}
      </Show>
      <Show when={visibleParallels()}>
        {(pa) => (
          <SectionCard label="aggadata.parallels" inspect={{ instanceKey: instanceKey(), leafId: 'aggadata.parallels' }}>
            <Show when={pa().prose}>
              <div style={{
                'font-size': '0.82rem', color: '#555', 'line-height': 1.5,
                'font-style': 'italic', 'margin-bottom': '0.5rem',
              }}>
                <HebraizedWithRabbis text={pa().prose} />
              </div>
            </Show>
            <For each={pa().parallels}>{(p) => (
              <div style={{ 'margin-bottom': '0.5rem' }}>
                <div style={{ 'margin-bottom': '0.15rem', display: 'flex', 'align-items': 'baseline', gap: '0.4rem', 'flex-wrap': 'wrap' }}>
                  <span style={{ 'font-weight': 600, color: '#1e40af', 'font-size': '0.85rem' }}>
                    {p.ref}
                  </span>
                  <span style={{
                    'font-size': '0.65rem', padding: '0.1rem 0.4rem',
                    background: '#faf5ff', border: '1px solid #d8b4fe',
                    color: '#7c3aed', 'border-radius': '999px',
                    'text-transform': 'uppercase', 'letter-spacing': '0.06em',
                  }}>
                    {t(`aggadata.parallel.${p.kind}`)}
                  </span>
                </div>
                <div style={{ 'font-size': '0.82rem', color: '#444', 'line-height': 1.5 }}>
                  <HebraizedWithRabbis text={p.note} />
                </div>
              </div>
            )}</For>
          </SectionCard>
        )}
      </Show>
      <QASection
        mark="aggadata"
        instanceId={instanceId()}
        instance={markInstance()}
        tractate={props.tractate}
        page={props.page}
      />
    </Panel>
  );
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
export function PlaceBody(props: { place: PlaceInstance; tractate: string; page: string }): JSX.Element {
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
    <Panel accent={ACCENTS.place} title={f().name} titleHe={f().nameHe}>
      <div style={{ display: 'flex', gap: '0.35rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.7rem' }}>
        <Show when={f().kind}>{chip(f().kind)}</Show>
        <Show when={f().region}>{chip(regionLabel(f().region))}</Show>
        <Show when={(f().knownAs ?? []).length > 0}>
          {chip(t('place.alsoKnownAs', { names: (f().knownAs ?? []).join(', ') }))}
        </Show>
      </div>
      <Synthesis
        markId="places"
        instance={props.place}
        instanceKey={`places:${f().name}`}
        tractate={props.tractate}
        page={props.page}
      />
    </Panel>
  );
}

// MarkEnrichmentCards handles the LLM synthesis (rishonim.synthesis) and
// the leaf walk; below it we render the primary-source Hebrew + English
// per rishon as collapsible details so the user can drop into Rashi /
// Tosafot / Ramban / etc. directly.
export function RishonimBody(props: { instance: RishonimInstance; tractate: string; page: string }): JSX.Element {
  const inst = () => props.instance;
  const meta = (
    <div style={{ color: '#94a3b8', 'font-size': '0.78rem', 'margin-bottom': '0.5rem' }}>
      {t(inst().fields.commentCount === 1 ? 'rishonim.commentCount.one' : 'rishonim.commentCount.other', { count: inst().fields.commentCount })}
      {' · '}
      {t(inst().fields.works.length === 1 ? 'rishonim.workCount.one' : 'rishonim.workCount.other', { count: inst().fields.works.length })}
    </div>
  );
  return (
    <Panel accent={ACCENTS.rishonim} title={t('rishonim.onSegment', { n: inst().segIdx + 1 })} meta={meta}>
      <Synthesis
        markId="rishonim"
        instance={inst()}
        instanceKey={`rishonim:${props.tractate}:${props.page}:${inst().segIdx}`}
        tractate={props.tractate}
        page={props.page}
      />

      <div style={{ 'margin-top': '0.8rem' }}>
        <div style={{
          'font-size': '0.65rem', color: '#94a3b8',
          'text-transform': 'uppercase', 'letter-spacing': '0.06em',
          'margin-bottom': '0.3rem',
        }}>
          {t('rishonim.primarySources')}
        </div>
        <For each={inst().fields.comments}>{(c) => (
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
    </Panel>
  );
}

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
                {props.tractate} {props.page}
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

            <Show when={c().kind === 'rabbi'}>
              <RabbiBody
                rabbi={(c() as Extract<SidebarContent, { kind: 'rabbi' }>).rabbi}
                tractate={props.tractate}
                page={props.page}
                generationByName={props.generationByName}
                onHighlightRange={(r) => props.onHighlightRange?.(r)}
              />
            </Show>

            <Show when={c().kind === 'voice-group'}>
              <VoiceGroupBody group={(c() as Extract<SidebarContent, { kind: 'voice-group' }>).group} />
            </Show>

            <Show when={c().kind === 'halacha'}>
              <HalachaBody
                topic={(c() as Extract<SidebarContent, { kind: 'halacha' }>).topic}
                index={(c() as Extract<SidebarContent, { kind: 'halacha' }>).index}
                tractate={props.tractate}
                page={props.page}
              />
            </Show>

            <Show when={c().kind === 'pesuk'}>
              <PasukPanel
                pasuk={(c() as Extract<SidebarContent, { kind: 'pesuk' }>).pasuk}
                tractate={props.tractate}
                page={props.page}
              />
            </Show>

            <Show when={c().kind === 'place'}>
              <PlaceBody
                place={(c() as Extract<SidebarContent, { kind: 'place' }>).place}
                tractate={props.tractate}
                page={props.page}
              />
            </Show>

            <Show when={c().kind === 'rishonim'}>
              <RishonimBody
                instance={(c() as Extract<SidebarContent, { kind: 'rishonim' }>).instance}
                tractate={props.tractate}
                page={props.page}
              />
            </Show>

            <Show when={c().kind === 'aggadata'}>
              <AggadataPanel
                story={(c() as Extract<SidebarContent, { kind: 'aggadata' }>).story}
                index={(c() as Extract<SidebarContent, { kind: 'aggadata' }>).index}
                tractate={props.tractate}
                page={props.page}
              />
            </Show>

            <Show when={c().kind === 'argument-overview'}>
              <ArgumentOverviewBody
                tractate={props.tractate}
                page={props.page}
                sections={props.dafSections ?? []}
                onPushRabbi={props.onPushRabbi}
              />
            </Show>

        </aside>
        </RabbiLinkProvider>
      )}
    </Show>
  );
}
