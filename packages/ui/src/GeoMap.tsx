/**
 * @corpus/ui — GeoMap.
 *
 * One shared cartographic map for every corpus app. A clean atlas (not tiles):
 * a bundled, public-domain Natural-Earth basemap (coastline + rivers + inland
 * seas) projected to SVG, with toggleable layers and labelled points/routes/
 * regions fed by the app. Both Talmud (sages & academies) and Tanach (biblical
 * sites) render through it — only the data + bbox differ.
 *
 * Grounding principle: callers pass REAL coordinates ({lat,lng}) — typically
 * from a deterministic gazetteer, not an LLM. The map only draws what it's
 * given. Styling: `.geomap*` in geomap.css (shared tokens).
 */

import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { BASEMAP } from './geo/basemap.ts';

export interface GeoBBox {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}
export interface GeoPoint {
  /** Stable id (for selection + keys). */
  id?: string;
  /** Label; empty string renders no label (e.g. a clustered satellite dot). */
  name: string;
  nameHe?: string;
  lat: number;
  lng: number;
  /** Emphasised marker (filled with the accent). */
  star?: boolean;
  /** Per-point marker fill (e.g. a generation colour). Overrides the default. */
  color?: string;
}
export interface GeoRoute {
  name?: string;
  nameHe?: string;
  /** Ordered [lng, lat] waypoints. */
  pts: [number, number][];
}
export interface GeoRegion {
  name: string;
  nameHe?: string;
  lat: number;
  lng: number;
}
export type GeoLayer = 'water' | 'rivers' | 'regions' | 'routes' | 'sites' | 'labels';

/** An ordered stop on a numbered drill-down path (e.g. a sage's life route). */
export interface GeoTrajectoryStop {
  lat: number;
  lng: number;
  /** Badge number (1-based); falls back to position when omitted. */
  seq?: number;
  label?: string;
  /** Emphasised stop (e.g. the "you are here" / selected node). */
  active?: boolean;
}

export interface GeoMapProps {
  bbox: GeoBBox;
  points: GeoPoint[];
  routes?: GeoRoute[];
  regions?: GeoRegion[];
  lang?: 'en' | 'he';
  /** Target pixel height; width follows the projection's aspect. */
  height?: number;
  /** Initial layer visibility (merged over the defaults). */
  layers?: Partial<Record<GeoLayer, boolean>>;
  /** Show the built-in layer-toggle chip bar (default true). */
  layerToggle?: boolean;
  onSelect?: (p: GeoPoint) => void;
  /** id of the currently-selected point. */
  selected?: string;
  /** When set, draws a NUMBERED life-path (stops connected + numbered badges)
   *  and dims the regular markers — a drill-down overlay (e.g. one sage's
   *  journey). Clear it to return to the full map. */
  trajectory?: GeoTrajectoryStop[];
  /** Click a numbered trajectory badge (makes them interactive buttons). */
  onTrajectoryStop?: (stop: GeoTrajectoryStop, index: number) => void;
}

/** Standard viewports apps can reuse. */
export const GEO_BBOX = {
  nearEast: { lonMin: 29, lonMax: 49, latMin: 27, latMax: 38 },
  israel: { lonMin: 34, lonMax: 36.3, latMin: 29.4, latMax: 33.6 },
  // Babylonia + Eretz Yisrael — the talmudic world.
  bavelToEy: { lonMin: 33.5, lonMax: 46.5, latMin: 30.5, latMax: 35.5 },
  // Bavel alone (the academies cluster) — for a zoom preset.
  bavel: { lonMin: 42.5, lonMax: 45.6, latMin: 31, latMax: 34 },
} satisfies Record<string, GeoBBox>;

/** Fit a bbox to a set of points (with padding + a minimum span so a lone or
 *  tightly-clustered set isn't a pinprick). Falls back when there are none. */
export function fitBbox(
  pts: { lat: number; lng: number }[],
  fallback: GeoBBox = GEO_BBOX.israel,
  opts?: { padFrac?: number; minSpan?: number },
): GeoBBox {
  if (!pts.length) return fallback;
  const padFrac = opts?.padFrac ?? 0.3;
  const minSpan = opts?.minSpan ?? 0.7;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lngMin = Math.min(...lngs);
  const lngMax = Math.max(...lngs);
  const padLat = Math.max((latMax - latMin) * padFrac, minSpan);
  const padLng = Math.max((lngMax - lngMin) * padFrac, minSpan);
  return {
    latMin: latMin - padLat,
    latMax: latMax + padLat,
    lonMin: lngMin - padLng,
    lonMax: lngMax + padLng,
  };
}

const LAYER_LABELS: Record<GeoLayer, string> = {
  water: 'Seas',
  rivers: 'Rivers',
  regions: 'Regions',
  routes: 'Routes',
  sites: 'Sites',
  labels: 'Labels',
};
const DEFAULT_LAYERS: Record<GeoLayer, boolean> = {
  water: true,
  rivers: true,
  regions: true,
  routes: true,
  sites: true,
  labels: true,
};

function projection(bbox: GeoBBox, height: number) {
  const meanLat = ((bbox.latMin + bbox.latMax) / 2) * (Math.PI / 180);
  const k = Math.cos(meanLat);
  const scale = height / (bbox.latMax - bbox.latMin);
  const W = (bbox.lonMax - bbox.lonMin) * k * scale;
  const project = (lng: number, lat: number): [number, number] => [
    (lng - bbox.lonMin) * k * scale,
    (bbox.latMax - lat) * scale,
  ];
  return { project, W: +W.toFixed(1), H: height };
}

const ringD = (ring: number[][], project: (a: number, b: number) => [number, number]) =>
  `M${ring
    .map(([lon, lat]) =>
      project(lon, lat)
        .map((n) => n.toFixed(1))
        .join(','),
    )
    .join('L')}Z`;
const lineD = (line: number[][], project: (a: number, b: number) => [number, number]) =>
  `M${line
    .map(([lon, lat]) =>
      project(lon, lat)
        .map((n) => n.toFixed(1))
        .join(','),
    )
    .join('L')}`;

export function GeoMap(props: GeoMapProps): JSX.Element {
  const height = () => props.height ?? 560;
  const he = () => props.lang === 'he';

  const proj = createMemo(() => projection(props.bbox, height()));

  const land = createMemo(() => BASEMAP.land.map((r) => ringD(r, proj().project)));
  const lakes = createMemo(() => BASEMAP.lakes.map((r) => ringD(r, proj().project)));
  const rivers = createMemo(() => BASEMAP.rivers.map((l) => lineD(l, proj().project)));

  const [overrides, setOverrides] = createSignal<Partial<Record<GeoLayer, boolean>>>({});
  const layers = createMemo<Record<GeoLayer, boolean>>(() => ({
    ...DEFAULT_LAYERS,
    ...props.layers,
    ...overrides(),
  }));
  const toggle = (l: GeoLayer) => setOverrides((o) => ({ ...o, [l]: !layers()[l] }));

  // points/regions kept in-frame (the SVG clips, but skipping off-view labels
  // avoids stray text in the margins).
  const inView = (lng: number, lat: number) => {
    const b = props.bbox;
    return lng >= b.lonMin && lng <= b.lonMax && lat >= b.latMin && lat <= b.latMax;
  };
  // Project points, then DE-OVERLAP co-located ones (many points at the same
  // place — e.g. several sages in one city): spiral the group around its centre
  // with a sunflower/golden-angle pattern so each marker is distinct. Index 0
  // of a group stays at the centre (the labelled "anchor", e.g. the city dot);
  // the rest fan out. Single points are untouched.
  const GOLDEN = 2.39996323; // golden angle (radians)
  const SPIRAL_STEP = 7; // px between successive ring radii
  const sites = createMemo(() => {
    const visible = props.points.filter((p) => inView(p.lng, p.lat));
    const groups = new Map<string, number>(); // location key -> running index
    return visible.map((p) => {
      const [x, y] = proj().project(p.lng, p.lat);
      const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
      const i = groups.get(key) ?? 0;
      groups.set(key, i + 1);
      if (i === 0) return { p, xy: [x, y] as [number, number] };
      const r = SPIRAL_STEP * Math.sqrt(i);
      const a = i * GOLDEN;
      return { p, xy: [x + r * Math.cos(a), y + r * Math.sin(a)] as [number, number] };
    });
  });
  const regions = createMemo(() =>
    (props.regions ?? [])
      .filter((r) => inView(r.lng, r.lat))
      .map((r) => ({ r, xy: proj().project(r.lng, r.lat) })),
  );
  const routes = createMemo(() => (props.routes ?? []).map((rt) => lineD(rt.pts, proj().project)));

  // Trajectory drill-down: the ordered stops projected, plus the connecting
  // path. When present, the regular markers dim so the numbered path reads.
  const trajActive = () => (props.trajectory?.length ?? 0) > 0;
  const trajStops = createMemo(() =>
    (props.trajectory ?? []).map((s, i) => ({
      xy: proj().project(s.lng, s.lat),
      seq: s.seq ?? i + 1,
      label: s.label,
      active: !!s.active,
      stop: s,
      index: i,
    })),
  );
  const trajPath = createMemo(() => {
    const pts = trajStops();
    if (pts.length < 2) return '';
    return `M${pts.map((s) => s.xy.map((n) => n.toFixed(1)).join(',')).join('L')}`;
  });

  const labelFor = (p: GeoPoint) => (he() ? p.nameHe || p.name : p.name);
  // RTL labels sit left of the marker (flipping to the right near the left
  // edge); LTR to the right (flipping left near the right edge).
  const labelGeom = (x: number): { x: number; anchor: 'start' | 'end'; dir: 'ltr' | 'rtl' } => {
    const W = proj().W;
    if (he()) {
      const flip = x < W * 0.22;
      return { x: flip ? x + 7 : x - 7, anchor: flip ? 'start' : 'end', dir: 'rtl' };
    }
    const flip = x > W * 0.78;
    return { x: flip ? x - 7 : x + 7, anchor: flip ? 'end' : 'start', dir: 'ltr' };
  };

  return (
    <div class="geomap" classList={{ 'geomap-he': he() }}>
      <Show when={props.layerToggle ?? true}>
        <div class="geomap-layers">
          <For each={Object.keys(LAYER_LABELS) as GeoLayer[]}>
            {(l) => (
              <button
                type="button"
                class="geomap-chip"
                classList={{ on: layers()[l] }}
                onClick={() => toggle(l)}
              >
                {LAYER_LABELS[l]}
              </button>
            )}
          </For>
        </div>
      </Show>
      <svg
        class="geomap-svg"
        viewBox={`0 0 ${proj().W} ${proj().H}`}
        width={proj().W}
        height={proj().H}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Map"
      >
        <Show when={!layers().water}>
          <rect x="0" y="0" width={proj().W} height={proj().H} class="geomap-drybg" />
        </Show>
        <For each={land()}>{(d) => <path class="geomap-land" d={d} />}</For>
        <Show when={layers().water}>
          <For each={lakes()}>{(d) => <path class="geomap-lake" d={d} />}</For>
        </Show>
        <Show when={layers().rivers}>
          <For each={rivers()}>{(d) => <path class="geomap-river" d={d} />}</For>
        </Show>
        <Show when={layers().regions}>
          <For each={regions()}>
            {(r) => (
              <text class="geomap-region" x={r.xy[0]} y={r.xy[1]} text-anchor="middle">
                {he() ? r.r.nameHe || r.r.name : r.r.name}
              </text>
            )}
          </For>
        </Show>
        <Show when={layers().routes}>
          <For each={routes()}>{(d) => <path class="geomap-route" d={d} />}</For>
        </Show>
        <Show when={layers().sites}>
          {/* base markers dim while a trajectory drill-down is active */}
          <g classList={{ 'geomap-dim': trajActive() }}>
            <For each={sites()}>
              {(s) => {
                const g = labelGeom(s.xy[0]);
                const interactive = !!props.onSelect;
                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: an SVG <g> marker can't be a real <button>; role + tabindex + keydown below make it a proper, keyboard-operable button
                  <g
                    class="geomap-site"
                    classList={{
                      selected: !!props.selected && props.selected === s.p.id,
                      interactive,
                    }}
                    role={interactive ? 'button' : undefined}
                    tabindex={interactive ? 0 : undefined}
                    aria-label={interactive ? labelFor(s.p) : undefined}
                    onClick={() => props.onSelect?.(s.p)}
                    onKeyDown={(e) => {
                      if (interactive && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        props.onSelect?.(s.p);
                      }
                    }}
                  >
                    <Show when={!!props.selected && props.selected === s.p.id}>
                      <circle
                        class="geomap-halo"
                        cx={s.xy[0]}
                        cy={s.xy[1]}
                        r={s.p.star ? 7.5 : 6.5}
                      />
                    </Show>
                    <circle
                      class="geomap-dot"
                      classList={{ star: !!s.p.star }}
                      style={
                        s.p.color
                          ? { '--dot-fill': s.p.color, '--dot-stroke': '#ffffff' }
                          : undefined
                      }
                      cx={s.xy[0]}
                      cy={s.xy[1]}
                      r={s.p.star ? 4.5 : 3.5}
                    />
                    <Show when={layers().labels && labelFor(s.p)}>
                      <text
                        class="geomap-label"
                        x={g.x}
                        y={s.xy[1] + 3}
                        text-anchor={g.anchor}
                        direction={g.dir}
                      >
                        {labelFor(s.p)}
                      </text>
                    </Show>
                  </g>
                );
              }}
            </For>
          </g>
        </Show>
        {/* the numbered drill-down path on top */}
        <Show when={trajActive()}>
          <g class="geomap-traj">
            <Show when={trajPath()}>
              <path class="geomap-traj-path" d={trajPath()} />
            </Show>
            <For each={trajStops()}>
              {(s) => {
                const interactive = !!props.onTrajectoryStop;
                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: an SVG <g> badge can't be a real <button>; role + tabindex + keydown make it keyboard-operable
                  <g
                    class="geomap-traj-stop"
                    classList={{ active: s.active, interactive }}
                    role={interactive ? 'button' : undefined}
                    tabindex={interactive ? 0 : undefined}
                    aria-label={interactive ? s.label || `Stop ${s.seq}` : undefined}
                    onClick={() => props.onTrajectoryStop?.(s.stop, s.index)}
                    onKeyDown={(e) => {
                      if (interactive && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        props.onTrajectoryStop?.(s.stop, s.index);
                      }
                    }}
                  >
                    <circle
                      class="geomap-traj-badge"
                      classList={{ active: s.active }}
                      cx={s.xy[0]}
                      cy={s.xy[1]}
                      r="8"
                    />
                    <text class="geomap-traj-num" x={s.xy[0]} y={s.xy[1] + 3} text-anchor="middle">
                      {s.seq}
                    </text>
                    <Show when={s.active && s.label}>
                      <text
                        class="geomap-traj-label"
                        x={s.xy[0]}
                        y={s.xy[1] + 19}
                        text-anchor="middle"
                      >
                        {s.label}
                      </text>
                    </Show>
                  </g>
                );
              }}
            </For>
          </g>
        </Show>
      </svg>
    </div>
  );
}
