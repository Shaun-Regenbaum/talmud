/**
 * Chronological timeline of places associated with a rabbi.
 *
 * Vertical strip rendered top → bottom in best-effort life order:
 *   1. Birthplace
 *   2. Movements (each "from → to" step in declared order)
 *   3. Primary study places (in declared order)
 *   4. Notable places (in declared order)
 *
 * Each step is a row with a small region color marker on the left (Israel
 * blue / Bavel amber / other gray), the place name, and a short context
 * line (birth / study / movement-reason / notable-event). Movement rows
 * carry an explicit "→" between the two places to visualize the transition.
 *
 * Places referenced by `rabbi.geography.evidence` on the current daf get a
 * soft yellow background + click handler that paints the daf via
 * onHighlightRange — same plumbing the lineage tree and geography card use.
 *
 * The component intentionally does NOT try to determine "where the rabbi
 * was during THIS sugya" — that would require a per-daf inference we don't
 * have yet. It just lays out the rabbi's geographic life chronologically;
 * the user can scan it to form their own contextual guess.
 */

import { For, Show, createSignal, createMemo, type JSX } from 'solid-js';
import type { BirthPlace, GeographyData, GeographyEvidence, Movement, NotablePlace, StudyPlace } from './RabbiGeographyCard';
import { t } from './i18n';

export interface LocationInference {
  place: string;
  region: 'israel' | 'bavel' | 'other' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  justification: string;
}

interface Props {
  data: GeographyData;
  evidence: GeographyEvidence[];
  /** Per-daf inference of WHERE the rabbi is in this sugya. When provided,
   *  the row matching `location.place` gets a "you are here" marker + the
   *  justification text rendered inline. Pulled from rabbi.location
   *  enrichment in the synthesis's deps_resolved. */
  location?: LocationInference | null;
  onHighlightRange?: (range: { start: number; end: number; key: string; tokenStart?: number; tokenEnd?: number } | null) => void;
}

const ISRAEL_COLOR = '#1d4ed8';
const BAVEL_COLOR = '#b45309';
const OTHER_COLOR = '#475569';
const EVIDENCE_BG = '#fef3c7';
const EVIDENCE_BORDER = '#eab308';

type Region = 'israel' | 'bavel' | 'other' | 'unknown';

interface TimelineEvent {
  key: string;
  kind: 'birth' | 'movement' | 'study' | 'notable';
  region: Region;
  /** For birth/study/notable: the single place name. For movement: "from →
   *  to" rendered as two cells. */
  primaryPlace: string;
  secondaryPlace?: string; // movement destination
  secondaryRegion?: Region; // movement destination region
  label: string;          // small uppercase tag (e.g. "BIRTH", "STUDY")
  detail: string;         // 1-line context (academy/period/event/reason)
  /** Which kind to look up in the evidence map for this row. */
  evidenceKind: GeographyEvidence['kind'];
  /** Place name to look up evidence by. For movement rows, prefer the
   *  destination place (where the rabbi LANDED) since that's typically
   *  what the daf would mention. */
  evidencePlace: string;
}

function inferRegion(place: string): Region {
  const p = place.toLowerCase();
  if (/bavel|babylonia|sura|pumbedita|nehardea|machoza|mata mehasya/.test(p)) return 'bavel';
  if (/eretz yisrael|israel|tiberias|tiberya|sepphoris|tzipori|yavneh|caesarea|lod|jerusalem|usha|bnei brak/.test(p)) return 'israel';
  return 'other';
}

function regionColor(r: Region): string {
  if (r === 'israel') return ISRAEL_COLOR;
  if (r === 'bavel') return BAVEL_COLOR;
  return OTHER_COLOR;
}

function regionLabel(r: Region): string {
  if (r === 'israel') return t('geography.eretzYisrael');
  if (r === 'bavel') return t('geography.bavel');
  return r === 'unknown' ? t('region.unknown') : t('region.other');
}

function buildEvents(data: GeographyData): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // 1. Birthplace
  if (data.birthplace?.place) {
    const bp: BirthPlace = data.birthplace;
    events.push({
      key: `birth:${bp.place}`,
      kind: 'birth',
      region: bp.region,
      primaryPlace: bp.place,
      label: 'BIRTH',
      detail: regionLabel(bp.region),
      evidenceKind: 'birthplace',
      evidencePlace: bp.place,
    });
  }

  // 2. Movements (in declared order; each becomes its own step)
  for (const mv of data.movements ?? []) {
    const fromRegion = inferRegion(mv.from);
    const toRegion = inferRegion(mv.to);
    const detailParts: string[] = [];
    if (mv.approximateWhen) detailParts.push(mv.approximateWhen);
    if (mv.reason) detailParts.push(mv.reason);
    events.push({
      key: `movement:${mv.from}→${mv.to}`,
      kind: 'movement',
      region: fromRegion,
      primaryPlace: mv.from,
      secondaryPlace: mv.to,
      secondaryRegion: toRegion,
      label: 'MOVED',
      detail: detailParts.join(' · ') || 'movement',
      evidenceKind: 'movement',
      evidencePlace: mv.to,
    });
  }

  // 3. Primary study places
  for (const sp of data.primaryStudyPlaces ?? []) {
    const sub: string[] = [];
    if (sp.academy) sub.push(sp.academy);
    if (sp.period) sub.push(sp.period);
    events.push({
      key: `study:${sp.place}`,
      kind: 'study',
      region: inferRegion(sp.place),
      primaryPlace: sp.place,
      label: 'STUDY',
      detail: sub.join(' · ') || regionLabel(inferRegion(sp.place)),
      evidenceKind: 'study',
      evidencePlace: sp.place,
    });
  }

  // 4. Notable places
  for (const np of data.notablePlaces ?? []) {
    events.push({
      key: `notable:${np.place}`,
      kind: 'notable',
      region: inferRegion(np.place),
      primaryPlace: np.place,
      label: 'NOTABLE',
      detail: np.event || '',
      evidenceKind: 'notable',
      evidencePlace: np.place,
    });
  }

  return events;
}

export default function RabbiPlacesTimeline(props: Props): JSX.Element {
  const [activeEvidenceKey, setActiveEvidenceKey] = createSignal<string | null>(null);

  const events = () => buildEvents(props.data);

  const evidenceByPlace = (): Map<string, GeographyEvidence> => {
    const m = new Map<string, GeographyEvidence>();
    for (const e of props.evidence) {
      const k = `${e.kind}:${e.place}`.toLowerCase();
      if (!m.has(k)) m.set(k, e);
    }
    return m;
  };

  const lookupEvidence = (ev: TimelineEvent): GeographyEvidence | undefined =>
    evidenceByPlace().get(`${ev.evidenceKind}:${ev.evidencePlace}`.toLowerCase());

  // The "you are here" marker + justification belong to exactly ONE row.
  // location.place can match several events (e.g. a movement TO Eretz Yisrael
  // AND a notable event there), which previously double-rendered the badge and
  // the whole justification. Pick a single best row: prefer the movement whose
  // destination is the inferred place (the rabbi landed there — what the
  // justification usually describes), else the first matching event.
  const hereIndex = createMemo<number>(() => {
    const place = props.location?.place?.toLowerCase();
    if (!place) return -1;
    const evs = events();
    const primary = (ev: TimelineEvent) => ev.primaryPlace.toLowerCase() === place;
    const secondary = (ev: TimelineEvent) => ev.secondaryPlace?.toLowerCase() === place;
    // 1. A movement that LANDED here (the justification usually describes the
    //    arrival), then 2. a non-movement event AT this place (birth/study/
    //    notable), and only then 3. any remaining match (e.g. a movement's
    //    origin — the rabbi LEFT here, the weakest "you are here").
    let i = evs.findIndex((ev) => ev.kind === 'movement' && secondary(ev));
    if (i < 0) i = evs.findIndex((ev) => ev.kind !== 'movement' && primary(ev));
    if (i < 0) i = evs.findIndex((ev) => primary(ev) || secondary(ev));
    return i;
  });

  const clickEvent = (ev: TimelineEvent) => {
    const e = lookupEvidence(ev);
    if (!e || typeof e.startSegIdx !== 'number' || typeof e.endSegIdx !== 'number') return;
    const key = `rabbi-place-timeline:${ev.kind}:${ev.evidencePlace}:${e.startSegIdx}:${e.tokenStart ?? 0}`;
    if (activeEvidenceKey() === key) {
      setActiveEvidenceKey(null);
      props.onHighlightRange?.(null);
    } else {
      setActiveEvidenceKey(key);
      props.onHighlightRange?.({
        start: e.startSegIdx,
        end: e.endSegIdx,
        key,
        tokenStart: e.tokenStart,
        tokenEnd: e.tokenEnd,
      });
    }
  };

  // Compact region-color legend rendered inline in the header so the bottom
  // of the card stays clean. Showing only the regions actually present in
  // this rabbi's timeline (rather than always all three) — keeps the legend
  // light and informative.
  const regionsPresent = (): Region[] => {
    const set = new Set<Region>();
    for (const ev of events()) {
      set.add(ev.region);
      if (ev.secondaryRegion) set.add(ev.secondaryRegion);
    }
    return Array.from(set).filter((r) => r !== 'unknown');
  };

  return (
    <Show when={events().length > 0}>
      <div style={{
        border: '1px solid #eae8e0',
        'border-radius': '6px',
        background: '#fafaf7',
        padding: '0.75rem 0.95rem 0.85rem',
        'margin-top': '0.7rem',
      }}>
        {/* Header — title on the left, mini region legend on the right */}
        <div style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          gap: '0.5rem',
          'margin-bottom': '0.7rem',
        }}>
          <span style={{
            'font-size': '0.7rem',
            'text-transform': 'uppercase',
            'letter-spacing': '0.08em',
            color: '#888',
          }}>{t('rabbi.places.title')}</span>
          <Show when={regionsPresent().length > 0}>
            <span style={{
              display: 'inline-flex', 'align-items': 'center',
              gap: '0.6rem',
              'font-size': '0.62rem', color: '#999',
            }}>
              <For each={regionsPresent()}>{(r) => (
                <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.25rem' }}>
                  <span style={{
                    display: 'inline-block',
                    width: '7px', height: '7px',
                    'border-radius': '50%',
                    background: regionColor(r),
                  }} />
                  {regionLabel(r)}
                </span>
              )}</For>
            </span>
          </Show>
        </div>

        {/* Standard vertical timeline pattern: a relatively-positioned
            container with the spine as an absolute pseudo-element-style
            div running the full inner height; each <li> is a relative
            block; the marker is absolutely positioned at a fixed x offset
            so it ALWAYS sits exactly on the spine regardless of how tall
            the row's content is. Content is left-padded to clear the
            marker. No flex shenanigans → no alignment drift. */}
        <ol style={{
          position: 'relative',
          'list-style': 'none',
          padding: '4px 0 4px 0',
          margin: 0,
        }}>
          {/* Spine — fixed column at left:11px (centered under the
              16px-wide marker positioned at left:3px). Runs the full
              inner height of the <ol>. */}
          <div style={{
            position: 'absolute',
            left: '11px',
            top: '6px',
            bottom: '6px',
            width: '2px',
            background: '#e5e3dc',
            'pointer-events': 'none',
          }} />

          <For each={events()}>{(ev, idx) => {
            const e = lookupEvidence(ev);
            const hasEv = !!e;
            const key = e ? `rabbi-place-timeline:${ev.kind}:${ev.evidencePlace}:${e.startSegIdx}:${e.tokenStart ?? 0}` : '';
            // Functions, not plain consts: the <For> mapper runs once per row,
            // so these must stay reactive to track activeEvidenceKey() (click)
            // and hereIndex() (async location inference) after first render.
            const isActive = () => activeEvidenceKey() === key;
            const color = regionColor(ev.region);
            const isHere = () => idx() === hereIndex();

            return (
              <li style={{
                position: 'relative',
                'min-height': '24px',
                padding: '0 0 14px 32px',
                margin: 0,
              }}>
                {/* Marker — absolutely positioned in the spine column.
                    Always at left:3px, top:4px regardless of content. */}
                <span style={{
                  position: 'absolute',
                  left: '3px',
                  top: '4px',
                  width: '16px',
                  height: '16px',
                  'border-radius': '50%',
                  background: isHere() ? '#0066CC' : '#fafaf7',
                  border: '2.5px solid ' + (isHere() ? '#0066CC' : color),
                  'box-shadow': isHere() ? '0 0 0 3px rgba(0,102,204,0.18)' : 'none',
                  'z-index': 1,
                  'box-sizing': 'border-box',
                }} />

                {/* Content button — clickable when evidence exists.
                    Padding/border applied to the button itself so the
                    marker stays fixed on the spine. */}
                <button
                  type="button"
                  onClick={() => hasEv && clickEvent(ev)}
                  disabled={!hasEv}
                  title={e ? t('rabbi.onThisDaf', { text: e.note || e.excerpt }) : undefined}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '2px 8px 4px',
                    margin: 0,
                    border: '1px solid ' + (
                      isActive() ? EVIDENCE_BORDER
                        : isHere() ? '#0066CC'
                        : hasEv ? '#fde68a'
                        : 'transparent'
                    ),
                    background: (
                      isActive() ? EVIDENCE_BG
                        : isHere() ? '#eff6ff'
                        : hasEv ? '#fefce8'
                        : 'transparent'
                    ),
                    'border-radius': '4px',
                    cursor: hasEv ? 'pointer' : 'default',
                    'font-family': 'inherit',
                    'text-align': 'left',
                    'box-sizing': 'border-box',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    'align-items': 'baseline',
                    gap: '0.45rem',
                    'flex-wrap': 'wrap',
                  }}>
                    <Show when={ev.kind === 'movement' && ev.secondaryPlace} fallback={
                      <span style={{ 'font-weight': 600, color: '#222', 'font-size': '0.92rem' }}>
                        {ev.primaryPlace}
                      </span>
                    }>
                      <span style={{ display: 'inline-flex', 'align-items': 'baseline', gap: '0.3rem', 'flex-wrap': 'wrap' }}>
                        <span style={{ color: color, 'font-weight': 600, 'font-size': '0.92rem' }}>{ev.primaryPlace}</span>
                        <span style={{ color: '#bbb' }}>→</span>
                        <span style={{ color: ev.secondaryRegion ? regionColor(ev.secondaryRegion) : OTHER_COLOR, 'font-weight': 600, 'font-size': '0.92rem' }}>{ev.secondaryPlace}</span>
                      </span>
                    </Show>
                    <span style={{
                      'font-size': '0.6rem', color: '#999',
                      'text-transform': 'uppercase', 'letter-spacing': '0.07em',
                      'font-weight': 500,
                    }}>{t(`rabbi.places.kind.${ev.kind}`)}</span>
                    <Show when={isHere()}>
                      <span style={{
                        color: '#0066CC', 'font-size': '0.6rem',
                        'font-weight': 700, 'margin-left': 'auto',
                        'text-transform': 'uppercase', 'letter-spacing': '0.08em',
                      }}>{t('rabbi.places.youAreHere')}{props.location?.confidence ? ` · ${t(`rabbi.places.confidence.${props.location.confidence}`)}` : ''}</span>
                    </Show>
                    <Show when={hasEv && !isHere()}>
                      <span style={{ color: '#a16207', 'font-size': '0.6rem', 'margin-left': 'auto', 'font-weight': 600 }}>{t('rabbi.onDaf')}</span>
                    </Show>
                  </div>
                  <Show when={ev.detail}>
                    <div style={{
                      'font-size': '0.76rem', color: '#666',
                      'margin-top': '0.15rem',
                      'line-height': 1.5,
                    }}>{ev.detail}</div>
                  </Show>
                  <Show when={isHere() && props.location?.justification}>
                    <div style={{
                      'font-size': '0.74rem', color: '#1e40af',
                      'margin-top': '0.3rem',
                      'line-height': 1.5,
                    }}>{props.location!.justification}</div>
                  </Show>
                </button>
              </li>
            );
          }}</For>
        </ol>
      </div>
    </Show>
  );
}
