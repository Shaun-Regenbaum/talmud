/**
 * @corpus/ui — WorldBubbleMap.
 *
 * A flat world map for "where traffic comes from": filled land (one continuous
 * landmass, no borders) with one bubble per country, sized by request volume
 * (sqrt-scaled so a couple of giants don't drown the long tail). Data is just
 * `{ code, requests }[]` keyed by ISO alpha-2 code; the bundled world basemap
 * (`geo/worldmap.ts`) supplies both the land geometry and the code -> centroid
 * lookup, so callers pass no coordinates. Styling: `.wbmap*` in
 * worldbubblemap.css. A plain equirectangular projection (its own, not GeoMap's
 * region-tuned one) keeps the whole-world framing honest.
 */

import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { WORLD_MAP } from './geo/worldmap.ts';

export interface CountryTraffic {
  /** ISO alpha-2 country code (e.g. "US", "IL"). "" / unknown is skipped. */
  code: string;
  requests: number;
}

export interface WorldBubbleMapProps {
  data: CountryTraffic[];
  /** Target pixel height; width follows the projection's aspect. */
  height?: number;
  lang?: 'en' | 'he';
  /** How many top countries get a permanent code label (default 5). */
  labelTop?: number;
}

const BBOX = WORLD_MAP.bbox;
const LON_SPAN = BBOX.lonMax - BBOX.lonMin;
const LAT_SPAN = BBOX.latMax - BBOX.latMin;

/** ISO alpha-2 -> display name, via the platform (no bundle cost); falls back
 *  to the raw code where unavailable. */
function countryName(code: string, lang: 'en' | 'he'): string {
  try {
    const dn = new Intl.DisplayNames([lang], { type: 'region' });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

const fmtInt = (n: number) => (n ?? 0).toLocaleString();

export function WorldBubbleMap(props: WorldBubbleMapProps): JSX.Element {
  const height = () => props.height ?? 380;
  // Plate carrée: equal px-per-degree on both axes so land shapes aren't skewed.
  const scale = () => height() / LAT_SPAN;
  const W = () => +(LON_SPAN * scale()).toFixed(1);
  const H = () => height();
  const project = (lng: number, lat: number): [number, number] => [
    (lng - BBOX.lonMin) * scale(),
    (BBOX.latMax - lat) * scale(),
  ];

  const landPaths = createMemo(() =>
    WORLD_MAP.land.map(
      (ring) =>
        `M${ring
          .map(([lon, lat]) =>
            project(lon, lat)
              .map((n) => n.toFixed(1))
              .join(','),
          )
          .join('L')}Z`,
    ),
  );

  // Bubbles: known-centroid rows only, sorted big-first so small dots render on
  // top and stay hoverable. Radius sqrt-scaled between rMin and rMax.
  const bubbles = createMemo(() => {
    const rows = props.data
      .filter((d) => d.code && d.requests > 0 && WORLD_MAP.centroids[d.code])
      .sort((a, b) => b.requests - a.requests);
    const max = rows.length ? rows[0].requests : 1;
    const rMin = height() * 0.008;
    const rMax = height() * 0.06;
    return rows.map((d, i) => {
      const [lng, lat] = WORLD_MAP.centroids[d.code];
      const [x, y] = project(lng, lat);
      const r = rMin + (rMax - rMin) * Math.sqrt(d.requests / max);
      return { ...d, x, y, r, rank: i };
    });
  });

  const labelTop = () => props.labelTop ?? 5;
  const [hover, setHover] = createSignal<{ code: string; requests: number } | null>(null);
  const [tip, setTip] = createSignal<{ x: number; y: number } | null>(null);
  const lang = () => props.lang ?? 'en';

  return (
    <div class="wbmap">
      <div class="wbmap-stage">
        <svg
          class="wbmap-svg"
          viewBox={`0 0 ${W()} ${H()}`}
          width={W()}
          height={H()}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Requests by country"
        >
          <For each={landPaths()}>{(d) => <path class="wbmap-land" d={d} />}</For>
          <For each={bubbles()}>
            {(b) => (
              // biome-ignore lint/a11y/noStaticElementInteractions: the bubble is a hover-only visual affordance; its data (country + count) is conveyed accessibly by the <title> and by the map's aria-label
              <circle
                class="wbmap-bubble"
                classList={{ hot: hover()?.code === b.code }}
                cx={b.x}
                cy={b.y}
                r={b.r}
                onMouseEnter={() => setHover({ code: b.code, requests: b.requests })}
                onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => {
                  setHover(null);
                  setTip(null);
                }}
              >
                <title>{`${countryName(b.code, lang())} — ${fmtInt(b.requests)}`}</title>
              </circle>
            )}
          </For>
          {/* Permanent code labels for the top few (skipped while hovering one). */}
          <For each={bubbles().filter((b) => b.rank < labelTop())}>
            {(b) => (
              <text class="wbmap-label" x={b.x} y={b.y - b.r - 2} text-anchor="middle">
                {b.code}
              </text>
            )}
          </For>
        </svg>
        <Show when={hover() && tip()}>
          <div
            class="wbmap-tip"
            style={{ left: `${tip()!.x}px`, top: `${tip()!.y}px` }}
            aria-hidden="true"
          >
            <span class="wbmap-tip-name">{countryName(hover()!.code, lang())}</span>
            <span class="wbmap-tip-num">{fmtInt(hover()!.requests)}</span>
          </div>
        </Show>
      </div>
    </div>
  );
}
