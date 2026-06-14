/**
 * Per-rabbi places MAP — the map-first replacement for the old vertical
 * "Places — Timeline". A rabbi's life is drawn as a numbered path across the
 * same two region maps the whole-daf geography card uses (shared geoMapBase),
 * built from the one shared builder (buildTrajectory). Clicking a numbered stop
 * opens its detail below the maps: the life-stage, the context sentence, the
 * on-daf evidence ("show on daf"), and the "you are here" marker for the
 * current sugya.
 *
 * Replaces RabbiPlacesTimeline: same data + evidence + location, map instead of
 * a list.
 */

import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { buildTrajectory, type TrajectoryStop } from '../lib/geographyModel';
import {
  collapsePlaced,
  type PlacedStop,
  RegionMapCard,
  regionTint,
  TRAJ_COLOR,
  TrajectoryBadges,
} from './geoMapBase';
import { BAVEL_SHAPE, ISRAEL_SHAPE } from './geoShapes';
import { t } from './i18n';
import type { GeographyData, GeographyEvidence } from './RabbiGeographyCard';

export interface LocationInference {
  place: string;
  region: 'israel' | 'bavel' | 'other' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  justification: string;
}

interface Props {
  data: GeographyData;
  evidence: GeographyEvidence[];
  /** Per-daf inference of WHERE the rabbi is in this sugya — its stop gets the
   *  "you are here" marker and is the detail shown by default. */
  location?: LocationInference | null;
  onHighlightRange?: (
    range: {
      start: number;
      end: number;
      key: string;
      tokenStart?: number;
      tokenEnd?: number;
    } | null,
  ) => void;
}

const EVIDENCE_BG = '#fef3c7';
const EVIDENCE_BORDER = '#eab308';

export default function RabbiTrajectoryMap(props: Props): JSX.Element {
  const [activeEvidenceKey, setActiveEvidenceKey] = createSignal<string | null>(null);
  const [picked, setPicked] = createSignal<number | null>(null);

  const placed = (): PlacedStop[] => collapsePlaced(buildTrajectory(props.data));
  // Stops we can actually plot — the detail card + default selection key off
  // these so a numbered badge is always reachable.
  const positioned = (): PlacedStop[] => placed().filter((p) => p.pos);
  // Only render a region's map when the rabbi actually has a stop there — a
  // pure-Bavel rabbi shows just Bavel; a pure-Eretz-Yisrael one just that.
  const showIsrael = (): boolean => positioned().some((p) => p.stop.region === 'israel');
  const showBavel = (): boolean => positioned().some((p) => p.stop.region === 'bavel');

  const evidenceByKey = (): Map<string, GeographyEvidence> => {
    const m = new Map<string, GeographyEvidence>();
    for (const e of props.evidence) {
      const k = `${e.kind}:${e.place}`.toLowerCase();
      if (!m.has(k)) m.set(k, e);
    }
    return m;
  };
  // Evidence for ONE event: by (kind, place); for a movement, also by its origin
  // (the daf may cite either end). birth's evidence kind is 'birthplace'.
  const evidenceForStop = (stop: TrajectoryStop): GeographyEvidence | undefined => {
    const m = evidenceByKey();
    const kind = stop.kind === 'birth' ? 'birthplace' : stop.kind;
    const hit = m.get(`${kind}:${stop.place}`.toLowerCase());
    if (hit) return hit;
    if (stop.kind === 'movement' && stop.from?.place)
      return m.get(`movement:${stop.from.place}`.toLowerCase());
    return undefined;
  };

  // The placed node the rabbi is at in THIS sugya (rabbi.location), scanning ALL
  // merged events at each node: prefer a movement that landed here, then a
  // non-movement event here, then a movement's origin.
  const hereNum = createMemo<number | null>(() => {
    const place = props.location?.place?.toLowerCase();
    if (!place) return null;
    const ps = placed();
    const isPlace = (s: TrajectoryStop) => s.place.toLowerCase() === place;
    const isFrom = (s: TrajectoryStop) => s.from?.place?.toLowerCase() === place;
    const hit =
      ps.find((p) => p.stops.some((s) => s.kind === 'movement' && isPlace(s))) ??
      ps.find((p) => p.stops.some((s) => s.kind !== 'movement' && isPlace(s))) ??
      ps.find((p) => p.stops.some((s) => isPlace(s) || isFrom(s)));
    return hit?.num ?? null;
  });

  // Which node's detail is open: an explicit click wins, else the current-daf
  // "you are here" node (when plottable), else the first plottable node.
  const activeNum = (): number | null => {
    if (picked() != null) return picked();
    const h = hereNum();
    if (h != null && placed().find((p) => p.num === h)?.pos) return h;
    return positioned()[0]?.num ?? null;
  };
  const activeStop = (): PlacedStop | undefined => placed().find((p) => p.num === activeNum());

  const pick = (p: PlacedStop) => {
    setPicked(p.num);
    // Selecting a different stop drops any active daf highlight.
    setActiveEvidenceKey(null);
    props.onHighlightRange?.(null);
  };

  const toggleEvidence = (stop: TrajectoryStop) => {
    const e = evidenceForStop(stop);
    if (!e || typeof e.startSegIdx !== 'number' || typeof e.endSegIdx !== 'number') return;
    const key = `rabbi-traj:${stop.kind}:${stop.place}:${e.startSegIdx}:${e.tokenStart ?? 0}`;
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

  const regionLabel = (r: 'israel' | 'bavel' | 'other' | 'unknown' | null): string => {
    if (r === 'israel') return t('geography.eretzYisrael');
    if (r === 'bavel') return t('geography.bavel');
    return r === 'unknown' ? t('region.unknown') : t('region.other');
  };

  return (
    <Show when={positioned().length > 0}>
      <div
        style={{
          border: '1px solid #eae8e0',
          'border-radius': '6px',
          background: '#fafaf7',
          padding: '0.7rem 0.8rem 0.8rem',
          'margin-top': '0.7rem',
        }}
      >
        <div
          style={{
            'font-size': '0.7rem',
            'text-transform': 'uppercase',
            'letter-spacing': '0.08em',
            color: '#888',
            'margin-bottom': '0.5rem',
          }}
        >
          {t('rabbi.places.title')}
        </div>

        {/* The region maps, stacked — only those the rabbi actually visited. */}
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.4rem' }}>
          <Show when={showIsrael()}>
            <RegionMapCard
              shape={ISRAEL_SHAPE}
              heading={t('geography.eretzYisrael')}
              headingColor="#1f2937"
              aria={t('geography.eretzYisrael.aria')}
              layout="column"
            >
              <TrajectoryBadges
                placed={placed()}
                region="israel"
                onPick={pick}
                activeNum={activeNum()}
              />
            </RegionMapCard>
          </Show>
          <Show when={showBavel()}>
            <RegionMapCard
              shape={BAVEL_SHAPE}
              heading={t('geography.bavel')}
              headingColor="#1e40af"
              aria={t('geography.bavel.aria')}
              layout="column"
            >
              <TrajectoryBadges
                placed={placed()}
                region="bavel"
                onPick={pick}
                activeNum={activeNum()}
              />
            </RegionMapCard>
          </Show>
        </div>

        {/* Detail card for the open node — renders EVERY event collapsed at that
            spot (e.g. moved-to + studied + notable in one city) so nothing the
            old timeline showed is lost. */}
        <Show when={activeStop()}>
          {(p) => {
            const isHere = (): boolean => p().num === hereNum();
            return (
              <div
                style={{
                  'margin-top': '0.55rem',
                  padding: '0.5rem 0.6rem',
                  border: `1px solid ${isHere() ? '#bfdbfe' : '#eae8e0'}`,
                  'border-radius': '6px',
                  background: isHere() ? '#eff6ff' : '#fff',
                }}
              >
                {/* Header: number + place + region (shared by all merged events). */}
                <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem' }}>
                  <span
                    style={{
                      'flex-shrink': 0,
                      width: '1.15rem',
                      height: '1.15rem',
                      'border-radius': '50%',
                      background: TRAJ_COLOR,
                      color: '#fff',
                      'font-size': '0.64rem',
                      'font-weight': 700,
                      display: 'inline-flex',
                      'align-items': 'center',
                      'justify-content': 'center',
                    }}
                  >
                    {p().num}
                  </span>
                  <span style={{ 'font-weight': 600, color: '#222', 'font-size': '0.9rem' }}>
                    {p().stop.place}
                  </span>
                  <span
                    style={{
                      color: regionTint(p().stop.region),
                      'font-size': '0.62rem',
                      'text-transform': 'uppercase',
                      'letter-spacing': '0.06em',
                    }}
                  >
                    {regionLabel(p().stop.region)}
                  </span>
                  <Show when={isHere()}>
                    <span
                      style={{
                        color: '#0066CC',
                        'font-size': '0.6rem',
                        'font-weight': 700,
                        'margin-left': 'auto',
                        'text-transform': 'uppercase',
                        'letter-spacing': '0.08em',
                      }}
                    >
                      {t('rabbi.places.youAreHere')}
                      {props.location?.confidence
                        ? ` · ${t(`rabbi.places.confidence.${props.location.confidence}`)}`
                        : ''}
                    </span>
                  </Show>
                </div>

                {/* One line per merged event: kind · detail (+ on-daf evidence). */}
                <For each={p().stops}>
                  {(s) => {
                    const ev = (): GeographyEvidence | undefined => evidenceForStop(s);
                    const evActive = (): boolean =>
                      activeEvidenceKey()?.startsWith(`rabbi-traj:${s.kind}:${s.place}:`) === true;
                    return (
                      <div style={{ 'margin-top': '0.3rem' }}>
                        <span
                          style={{
                            color: regionTint(s.region),
                            'font-size': '0.6rem',
                            'text-transform': 'uppercase',
                            'letter-spacing': '0.06em',
                            'font-weight': 600,
                          }}
                        >
                          {t(`rabbi.places.kind.${s.kind}`)}
                        </span>
                        <Show when={s.detail}>
                          <span
                            style={{ 'font-size': '0.8rem', color: '#555', 'line-height': 1.5 }}
                          >
                            {' · '}
                            {s.detail}
                          </span>
                        </Show>
                        <Show when={ev()}>
                          {' '}
                          <button
                            type="button"
                            onClick={() => toggleEvidence(s)}
                            title={ev()?.note || ev()?.excerpt}
                            style={{
                              padding: '0.05rem 0.4rem',
                              border: `1px solid ${evActive() ? EVIDENCE_BORDER : '#fde68a'}`,
                              background: evActive() ? EVIDENCE_BG : '#fefce8',
                              'border-radius': '4px',
                              cursor: 'pointer',
                              'font-family': 'inherit',
                              'font-size': '0.68rem',
                              color: '#a16207',
                              'font-weight': 600,
                            }}
                          >
                            {t('rabbi.onDaf')}
                          </button>
                        </Show>
                      </div>
                    );
                  }}
                </For>

                <Show when={isHere() && props.location?.justification}>
                  <div
                    style={{
                      'font-size': '0.78rem',
                      color: '#1e40af',
                      'margin-top': '0.3rem',
                      'line-height': 1.5,
                    }}
                  >
                    {props.location?.justification}
                  </div>
                </Show>
              </div>
            );
          }}
        </Show>
      </div>
    </Show>
  );
}
