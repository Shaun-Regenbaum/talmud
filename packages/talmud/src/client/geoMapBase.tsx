/**
 * Shared geography-map rendering base — the two region cards (Eretz Yisrael +
 * Bavel) drawn from real projected geography (geoShapes.ts) and the numbered
 * "trajectory" path overlay. Used by BOTH the whole-daf GeographyMap (rabbis
 * placed as dots) and the per-rabbi RabbiTrajectoryMap (one life path), so the
 * two surfaces share one map vocabulary and can't drift.
 *
 * Pure rendering + geometry only: no data fetching, no DafGeoModel coupling.
 * Each consumer draws its own overlay content (dots / a single path) into a
 * RegionMapCard via children, in shape-local coordinates.
 */

import { For, type JSX } from 'solid-js';
import type { TrajectoryStop } from '../lib/geographyModel';
import {
  BAVEL_SHAPE,
  GEO_CITIES,
  type GeoCity,
  type GeoRegionId,
  type GeoRegionShape,
  ISRAEL_SHAPE,
} from './geoShapes';

export const LAND_COLOR = '#6b7280';
export const WATER_COLOR = '#3b82f6';
export const WATER_FILL = 'rgba(96, 165, 250, 0.25)';
// The numbered trajectory path — violet, distinct from the generation-colored
// rabbi dots on the whole-daf map.
export const TRAJ_COLOR = '#7c3aed';
export const DIMMED_OPACITY = 0.18;

// Both region shapes share the same projected HEIGHT (180) but differ in WIDTH;
// every card uses ONE common aspect ratio (the widest shape's) with the shape
// centered, so the pair reads as a matched set. City/rabbi coords are
// shape-local, so this viewBox is transparent to them. PAD = breathing room.
export const PAD = 4;
export const SHARED_HEIGHT = Math.max(ISRAEL_SHAPE.height, BAVEL_SHAPE.height);
export const SHARED_WIDTH = Math.max(ISRAEL_SHAPE.width, BAVEL_SHAPE.width);
const LAND_STROKE_PX = 1.2;
const RIVER_STROKE_PX = 0.9;

export function sharedViewBox(shape: GeoRegionShape): string {
  const x0 = -PAD - (SHARED_WIDTH - shape.width) / 2;
  const y0 = -PAD - (SHARED_HEIGHT - shape.height) / 2;
  return `${x0} ${y0} ${SHARED_WIDTH + PAD * 2} ${SHARED_HEIGHT + PAD * 2}`;
}

/** Centroid of a region's cities — where a "region known, city unknown" marker
 *  (or stop) lands. */
export function regionCentroid(region: 'israel' | 'bavel'): { x: number; y: number } {
  const cities = GEO_CITIES.filter((c) => c.region === region);
  let x = 0;
  let y = 0;
  for (const c of cities) {
    x += c.x;
    y += c.y;
  }
  return { x: x / cities.length, y: y / cities.length };
}

const CITY_BY_NAME = new Map<string, GeoCity>(GEO_CITIES.map((c) => [c.name, c]));

/** Region tint matching the daf-count colors: Bavel amber, Eretz Yisrael dark. */
export function regionTint(r: GeoRegionId | null): string {
  if (r === 'bavel') return '#92400e';
  if (r === 'israel') return '#1f2937';
  return '#6b7280';
}

/** Shape-local position of a trajectory stop: its city coords when the place
 *  matched a known city, else the region centroid, else null (unplottable). */
export function stopPosition(stop: TrajectoryStop): { x: number; y: number } | null {
  if (stop.cityName) {
    const c = CITY_BY_NAME.get(stop.cityName);
    if (c) return { x: c.x, y: c.y };
  }
  if (stop.region === 'israel' || stop.region === 'bavel') return regionCentroid(stop.region);
  return null;
}

/** A positioned, numbered stop (index in the full ordered trajectory). */
export interface PlacedStop {
  /** Representative stop (the first at this spot) — drives the badge + position. */
  stop: TrajectoryStop;
  /** ALL events collapsed at this spot (e.g. moved-to + studied + notable in
   *  Sura). The detail card renders every one so no event is lost; the map shows
   *  a single badge. Always contains at least `stop`. */
  stops: TrajectoryStop[];
  num: number;
  pos: { x: number; y: number } | null;
}

/** Number a trajectory's stops in life order, collapsing consecutive stops that
 *  resolve to the SAME spot (e.g. studied AND was a notable authority in Sura)
 *  into one node so badges don't stack illegibly; a later RETURN to an earlier
 *  place stays a distinct node. Collapsed events are RETAINED on `stops`. */
export function collapsePlaced(stops: TrajectoryStop[]): PlacedStop[] {
  const out: PlacedStop[] = [];
  let lastKey: string | null = null;
  let num = 0;
  for (const stop of stops) {
    const pos = stopPosition(stop);
    const key = pos ? `${Math.round(pos.x * 10)},${Math.round(pos.y * 10)}` : `np:${stop.place}`;
    if (key === lastKey && out.length > 0) {
      out[out.length - 1].stops.push(stop);
      continue;
    }
    lastKey = key;
    out.push({ stop, stops: [stop], num: ++num, pos });
  }
  return out;
}

/** One arrow segment of the trajectory path: a violet line + arrowhead, drawn
 *  shape-local. Endpoints are pulled in by ENDR so they touch the badge edges. */
function arrowSeg(a: { x: number; y: number }, b: { x: number; y: number }): JSX.Element {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ENDR = 3.4; // stop short of the badge circle (r≈3.2)
  const sx = a.x + ux * ENDR;
  const sy = a.y + uy * ENDR;
  const ex = b.x - ux * ENDR;
  const ey = b.y - uy * ENDR;
  const h = 2.0; // arrowhead length
  const w = 1.2; // arrowhead half-width
  const ax1 = ex - ux * h - uy * w;
  const ay1 = ey - uy * h + ux * w;
  const ax2 = ex - ux * h + uy * w;
  const ay2 = ey - uy * h - ux * w;
  return (
    <g>
      <line
        x1={sx}
        y1={sy}
        x2={ex}
        y2={ey}
        stroke={TRAJ_COLOR}
        stroke-width={1.1}
        vector-effect="non-scaling-stroke"
        stroke-linecap="round"
        opacity={0.9}
      />
      <polygon points={`${ex},${ey} ${ax1},${ay1} ${ax2},${ay2}`} fill={TRAJ_COLOR} opacity={0.9} />
    </g>
  );
}

/** The numbered path overlay for ONE region: arrows between consecutive
 *  same-region stops, then a numbered badge per positioned stop. `placed` is the
 *  FULL ordered list (so cross-region arrows are correctly skipped). When `onPick`
 *  is given the badges are interactive (the per-rabbi map); otherwise inert (the
 *  whole-daf drill-down draws on top of dots). `activeNum` rings the open stop. */
export function TrajectoryBadges(props: {
  placed: PlacedStop[];
  region: 'israel' | 'bavel';
  onPick?: (p: PlacedStop) => void;
  activeNum?: number | null;
}): JSX.Element {
  const segs = (): Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> => {
    const all = props.placed;
    const out: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> = [];
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i];
      const b = all[i + 1];
      if (a.pos && b.pos && a.stop.region === props.region && b.stop.region === props.region) {
        out.push({ a: a.pos, b: b.pos });
      }
    }
    return out;
  };
  const badges = () => props.placed.filter((p) => p.pos && p.stop.region === props.region);
  const interactive = (): boolean => !!props.onPick;
  return (
    <g style={{ 'pointer-events': interactive() ? 'auto' : 'none' }}>
      <For each={segs()}>{(s) => arrowSeg(s.a, s.b)}</For>
      <For each={badges()}>
        {(p) => {
          const active = () => props.activeNum === p.num;
          // Interactivity lives on the <circle> (same accepted pattern as the
          // whole-daf rabbi dots); the number <text> is click-through.
          return (
            <g>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: a native <button> can't live in an SVG map; role is set when interactive */}
              <circle
                cx={p.pos!.x}
                cy={p.pos!.y}
                r={3.2}
                fill={TRAJ_COLOR}
                stroke={active() ? '#111' : '#fff'}
                stroke-width={active() ? 1.4 : 0.9}
                vector-effect="non-scaling-stroke"
                role={interactive() ? 'button' : undefined}
                tabindex={interactive() ? 0 : undefined}
                style={{ cursor: interactive() ? 'pointer' : 'default' }}
                onClick={interactive() ? () => props.onPick?.(p) : undefined}
                onKeyDown={
                  interactive()
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          props.onPick?.(p);
                        }
                      }
                    : undefined
                }
              />
              <text
                x={p.pos!.x}
                y={p.pos!.y}
                text-anchor="middle"
                dominant-baseline="central"
                font-size="3.4"
                font-weight="700"
                fill="#fff"
                style={{ 'pointer-events': 'none' }}
              >
                {p.num}
              </text>
            </g>
          );
        }}
      </For>
    </g>
  );
}

/** Shared region card chrome: heading + the outlined SVG (rivers + land) with a
 *  children overlay slot drawn on top in shape-local coords. Consumers pass
 *  their own dots / path / hit-box as children. */
export function RegionMapCard(props: {
  shape: GeoRegionShape;
  heading: string;
  headingColor: string;
  aria: string;
  layout?: 'row' | 'column';
  children?: JSX.Element;
}): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        border: props.layout === 'column' ? 'none' : '1px solid #e5e7eb',
        'border-radius': props.layout === 'column' ? '0' : '8px',
        background: props.layout === 'column' ? 'transparent' : '#fff',
        padding: '0.5rem 0.5rem 0.4rem',
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        'min-width': 0,
      }}
    >
      <div
        style={{
          'font-size': '0.8rem',
          'font-weight': 600,
          color: props.headingColor,
          'margin-bottom': '0.3rem',
        }}
      >
        {props.heading}
      </div>
      <svg
        viewBox={sharedViewBox(props.shape)}
        style={{ width: '100%', flex: 1, display: 'block', 'min-height': 0 }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={props.aria}
      >
        {/* Water under land: rivers as thin blue lines; closed rings (the
            Kinneret / Dead Sea) get a light fill. */}
        <For each={props.shape.riverPaths}>
          {(d) => (
            <path
              d={d}
              fill={d.endsWith('Z') ? WATER_FILL : 'none'}
              stroke={WATER_COLOR}
              stroke-width={RIVER_STROKE_PX}
              vector-effect="non-scaling-stroke"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity={0.75}
            />
          )}
        </For>
        <For each={props.shape.landPaths}>
          {(d) => (
            <path
              d={d}
              fill="none"
              stroke={LAND_COLOR}
              stroke-width={LAND_STROKE_PX}
              vector-effect="non-scaling-stroke"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity={0.85}
            />
          )}
        </For>
        {props.children}
      </svg>
    </div>
  );
}
