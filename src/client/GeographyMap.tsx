import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import { ISRAEL_SHAPE, BAVEL_SHAPE } from './geoShapes';
import { GENERATION_BY_ID, type GenerationId } from './generations';

export type Region = 'israel' | 'bavel' | 'other';

export interface KnownCity {
  name: string;
  nameHe: string;
  aliases: string[];
  region: Region;
  x: number;
  y: number;
}

// Each region is rendered in its own card with its own SVG / viewBox. City
// coordinates below are expressed in shape-local space (0..shape.width for
// x, 0..shape.height for y) — no global offset needed.
const ISRAEL_X_OFFSET = 0;
const ISRAEL_Y_OFFSET = 0;
const BAVEL_X_OFFSET = 0;
const BAVEL_Y_OFFSET = 0;

export const KNOWN_CITIES: KnownCity[] = [
  // Eretz Yisrael — real Israel outline (Vecteezy flat-simple, simplified)
  // at 67 wide × 180 tall. Cities positioned to roughly match real
  // geography: Galilee cluster top (~y=15-35), coastal plain west
  // (x=10-20), Judean hills center (x=28-40, y=60-85), Negev south.
  { name: 'Tyre',         nameHe: 'צור',       aliases: ['tyre', 'tzor', 'sor'],                                                                region: 'israel', x: ISRAEL_X_OFFSET + 63, y: ISRAEL_Y_OFFSET + 3 },
  { name: 'Gush Halav',   nameHe: 'גוש חלב',  aliases: ['gush halav', 'gush chalav', 'giscala', 'gischala'],                                    region: 'israel', x: ISRAEL_X_OFFSET + 52, y: ISRAEL_Y_OFFSET + 14 },
  { name: "Peki'in",      nameHe: 'פקיעין',   aliases: ['pekiin', "peki'in"],                                                                   region: 'israel', x: ISRAEL_X_OFFSET + 42, y: ISRAEL_Y_OFFSET + 20 },
  { name: 'Tiberias',     nameHe: 'טבריה',    aliases: ['tiberias', 'teveria'],                                                                 region: 'israel', x: ISRAEL_X_OFFSET + 50, y: ISRAEL_Y_OFFSET + 27 },
  { name: 'Arbel',        nameHe: 'ארבל',     aliases: ['arbel'],                                                                               region: 'israel', x: ISRAEL_X_OFFSET + 44, y: ISRAEL_Y_OFFSET + 26 },
  { name: 'Sikhnin',      nameHe: 'סכנין',    aliases: ['sikhnin', 'sogane'],                                                                   region: 'israel', x: ISRAEL_X_OFFSET + 35, y: ISRAEL_Y_OFFSET + 28 },
  { name: 'Tzipori',      nameHe: 'ציפורי',   aliases: ['tzipori', 'sepphoris', 'zippori', 'sippori'],                                          region: 'israel', x: ISRAEL_X_OFFSET + 38, y: ISRAEL_Y_OFFSET + 36 },
  { name: 'Usha',         nameHe: 'אושא',     aliases: ['usha'],                                                                                region: 'israel', x: ISRAEL_X_OFFSET + 30, y: ISRAEL_Y_OFFSET + 32 },
  { name: "Beit She'an",  nameHe: 'בית שאן', aliases: ["beit she'an", 'beit shean', 'beit shan', 'beth shan', 'scythopolis'],                   region: 'israel', x: ISRAEL_X_OFFSET + 48, y: ISRAEL_Y_OFFSET + 46 },
  { name: 'Caesarea',     nameHe: 'קיסריה',   aliases: ['caesarea', 'kisrin', 'kisarya'],                                                       region: 'israel', x: ISRAEL_X_OFFSET + 25, y: ISRAEL_Y_OFFSET + 52 },
  { name: 'Shechem',      nameHe: 'שכם',      aliases: ['shechem', 'nablus'],                                                                   region: 'israel', x: ISRAEL_X_OFFSET + 40, y: ISRAEL_Y_OFFSET + 65 },
  { name: 'Bnei Brak',    nameHe: 'בני ברק', aliases: ['bnei brak', 'bene berak', 'benei berak'],                                               region: 'israel', x: ISRAEL_X_OFFSET + 19, y: ISRAEL_Y_OFFSET + 72 },
  { name: 'Lod',          nameHe: 'לוד',      aliases: ['lod', 'lydda', 'lud'],                                                                 region: 'israel', x: ISRAEL_X_OFFSET + 22, y: ISRAEL_Y_OFFSET + 76 },
  { name: 'Yavneh',       nameHe: 'יבנה',    aliases: ['yavneh', 'jamnia', 'yavne', 'jabneh'],                                                  region: 'israel', x: ISRAEL_X_OFFSET + 14, y: ISRAEL_Y_OFFSET + 82 },
  { name: 'Jerusalem',    nameHe: 'ירושלים', aliases: ['jerusalem', 'yerushalayim', 'yerushalaim'],                                             region: 'israel', x: ISRAEL_X_OFFSET + 34, y: ISRAEL_Y_OFFSET + 80 },
  { name: 'Tekoa',        nameHe: 'תקוע',     aliases: ['tekoa'],                                                                               region: 'israel', x: ISRAEL_X_OFFSET + 38, y: ISRAEL_Y_OFFSET + 92 },

  // Bavel — shape ~182 wide x 180 tall. Western cluster along the Euphrates
  // (Pumbedita → Nehardea → Sura → Naresh); Tigris cluster east (Ctesiphon,
  // Mehoza near Baghdad).
  { name: 'Nisibis',      nameHe: 'נציבין',    aliases: ['nisibis', 'netzivin'],                                                                region: 'bavel', x: BAVEL_X_OFFSET + 82,  y: BAVEL_Y_OFFSET + 8 },
  { name: 'Pumbedita',    nameHe: 'פומבדיתא',  aliases: ['pumbedita', 'pumbeditha', 'pumbedisa'],                                              region: 'bavel', x: BAVEL_X_OFFSET + 52,  y: BAVEL_Y_OFFSET + 38 },
  { name: 'Pum Nahara',   nameHe: 'פום נהרא', aliases: ['pum nahara', 'pum nehara'],                                                           region: 'bavel', x: BAVEL_X_OFFSET + 50,  y: BAVEL_Y_OFFSET + 58 },
  { name: 'Nehardea',     nameHe: 'נהרדעא',    aliases: ['nehardea', 'nehardeah', "neharde'a"],                                                region: 'bavel', x: BAVEL_X_OFFSET + 58,  y: BAVEL_Y_OFFSET + 70 },
  { name: 'Hini',         nameHe: 'היני',      aliases: ['hini', 'hene'],                                                                       region: 'bavel', x: BAVEL_X_OFFSET + 76,  y: BAVEL_Y_OFFSET + 85 },
  { name: 'Sichra',       nameHe: 'שיכרא',     aliases: ['sichra', 'sikra', 'shikra'],                                                          region: 'bavel', x: BAVEL_X_OFFSET + 90,  y: BAVEL_Y_OFFSET + 92 },
  { name: 'Ctesiphon',    nameHe: 'קטספון',    aliases: ['ctesiphon', 'qtesiphon'],                                                             region: 'bavel', x: BAVEL_X_OFFSET + 140, y: BAVEL_Y_OFFSET + 100 },
  { name: 'Mehoza',       nameHe: 'מחוזא',     aliases: ['mehoza', 'mahoza', 'machuza', 'maḥoza'],                                              region: 'bavel', x: BAVEL_X_OFFSET + 128, y: BAVEL_Y_OFFSET + 110 },
  { name: 'Sura',         nameHe: 'סורא',      aliases: ['sura'],                                                                              region: 'bavel', x: BAVEL_X_OFFSET + 72,  y: BAVEL_Y_OFFSET + 135 },
  { name: 'Mata Mehasya', nameHe: 'מתא מחסיא', aliases: ['mata mehasya', 'mata mahasya', 'mata meḥasya'],                                       region: 'bavel', x: BAVEL_X_OFFSET + 72,  y: BAVEL_Y_OFFSET + 148 },
  { name: 'Naresh',       nameHe: 'נרש',       aliases: ['naresh', 'narash'],                                                                  region: 'bavel', x: BAVEL_X_OFFSET + 95,  y: BAVEL_Y_OFFSET + 158 },
  { name: 'Kafri',        nameHe: 'כפרי',      aliases: ['kafri', 'kufri'],                                                                     region: 'bavel', x: BAVEL_X_OFFSET + 115, y: BAVEL_Y_OFFSET + 160 },
  { name: 'Shekanziv',    nameHe: 'שקנציב',    aliases: ['shekanziv', 'shikanzib'],                                                             region: 'bavel', x: BAVEL_X_OFFSET + 105, y: BAVEL_Y_OFFSET + 140 },
];

export interface RabbiPlaceEnrichment {
  places: string[];                       // city names (matching KNOWN_CITIES)
  region: 'israel' | 'bavel' | null;
  canonical: string;
  bio?: string | null;
  wiki?: string | null;
  image?: string | null;
  generation?: string | null;
  moved?: 'bavel->israel' | 'israel->bavel' | 'both' | null;
}

export interface GeographyMapProps {
  onHighlightLocation: (cityName: string | null, rabbiNames: string[]) => void;
  activeLocation: string | null;
  tractate?: string;
  page?: string;
  /** Authoritative places per rabbi, derived from Sefaria PersonTopic bios.
   *  Drives every rabbi dot on the map — the same list that feeds the
   *  generation timeline, rabbi underlines, and bio sidebar. */
  rabbiPlaces?: Map<string, RabbiPlaceEnrichment> | null;
  /** True while the daf-context fetch that populates `rabbiPlaces` is in
   *  flight. Drives the loading spinner shown in place of the maps. */
  loading?: boolean;
  /** Rabbi → generation mapping (from /api/generations). Used to pick the
   *  color for each rabbi's dot so the map matches the timeline palette. */
  generationByName?: Map<string, GenerationId> | null;
  /** When set, clicking a single rabbi dot highlights that single rabbi
   *  (instead of everyone at that city). */
  onHighlightSingleRabbi?: (rabbiName: string) => void;
  /** Transient hover highlight — pass the rabbi name on mouseenter, null on
   *  mouseleave. Additive to click-driven highlights; lets the Migration
   *  rows light up a rabbi in the daf without stomping sidebar state. */
  onHoverRabbi?: (rabbiName: string | null) => void;
  /** Set of city names (matching KNOWN_CITIES.name) that are mentioned by
   *  name in the daf's Hebrew text. Each one gets a gray place-dot even if
   *  no rabbi in the list is placed there. */
  placesInText?: Set<string> | null;
  /** Clicking a place-dot highlights that city's name in the daf body. */
  onHighlightPlace?: (cityName: string | null) => void;
  /** Currently highlighted place, so the dot knows to render its active
   *  ring. Mutually exclusive with `activeLocation`. */
  activePlace?: string | null;
}

interface CityDot {
  city: KnownCity;
  rabbis: string[];
  count: number;
}

/**
 * Given N points centered on (cx, cy), return N (x, y) coords arranged in
 * a sunflower-style pattern so multiple rabbi dots at the same city don't
 * overlap. First point sits on center; subsequent points spiral outward.
 * Spacing tuned for ~2.5px-radius dots on a 180-tall viewBox.
 */
function clusterOffsets(n: number, cx: number, cy: number): Array<{ x: number; y: number }> {
  if (n <= 1) return [{ x: cx, y: cy }];
  const out: Array<{ x: number; y: number }> = [];
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const scale = 2.8; // base radius unit in shape coords
  for (let i = 0; i < n; i++) {
    if (i === 0) { out.push({ x: cx, y: cy }); continue; }
    const r = scale * Math.sqrt(i);
    const theta = i * GOLDEN;
    out.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
  }
  return out;
}

// Pseudo-city entries used when a rabbi's bio only carries a region ("Israel"
// or "Bavel") without a specific city. Positioned near the centroid of each
// region shape so the dot always has somewhere to land.
const UNSPECIFIED_ISRAEL: KnownCity = {
  name: 'Eretz Yisrael (city unspecified)',
  nameHe: 'ארץ ישראל',
  aliases: [],
  region: 'israel',
  x: ISRAEL_X_OFFSET + 30,
  y: ISRAEL_Y_OFFSET + 72,
};
const UNSPECIFIED_BAVEL: KnownCity = {
  name: 'Bavel (city unspecified)',
  nameHe: 'בבל',
  aliases: [],
  region: 'bavel',
  x: BAVEL_X_OFFSET + 95,
  y: BAVEL_Y_OFFSET + 80,
};

export function GeographyMap(props: GeographyMapProps): JSX.Element {
  // Local hover state for the Migration rows. Only controls the row's own
  // background tint; the daf-side highlight is driven by props.onHoverRabbi.
  const [hoveredMoverRow, setHoveredMoverRow] = createSignal<string | null>(null);

  // Each dot is one rabbi from `rabbiPlaces` — the same dafContext.rabbis
  // list that drives the generation timeline, rabbi underlines, and bio
  // sidebar. Cities pulled from each rabbi's Sefaria-bio `places[0]`; when
  // the bio only carries a region, the rabbi lands in an "unspecified"
  // bucket rendered at the region centroid.
  const data = createMemo(() => {
    const byCity = new Map<string, { city: KnownCity; rabbis: Set<string> }>();
    const unknownIsrael = new Set<string>();
    const unknownBavel = new Set<string>();

    const cityByName = new Map<string, KnownCity>(KNOWN_CITIES.map((c) => [c.name, c]));
    const enrich = props.rabbiPlaces;

    if (enrich) {
      for (const [name, info] of enrich.entries()) {
        if (info.places.length > 0) {
          const placeName = info.places[0];
          const city = cityByName.get(placeName);
          if (city) {
            if (!byCity.has(city.name)) byCity.set(city.name, { city, rabbis: new Set() });
            byCity.get(city.name)!.rabbis.add(name);
            continue;
          }
        }
        if (info.region === 'israel') unknownIsrael.add(name);
        else if (info.region === 'bavel') unknownBavel.add(name);
        // Rabbis with neither a known place nor a region are skipped — we
        // have nowhere to put them on a two-region map.
      }
    }

    const dots: CityDot[] = Array.from(byCity.values()).map((v) => ({
      city: v.city,
      rabbis: Array.from(v.rabbis),
      count: v.rabbis.size,
    }));
    if (unknownIsrael.size > 0) {
      dots.push({ city: UNSPECIFIED_ISRAEL, rabbis: Array.from(unknownIsrael), count: unknownIsrael.size });
    }
    if (unknownBavel.size > 0) {
      dots.push({ city: UNSPECIFIED_BAVEL, rabbis: Array.from(unknownBavel), count: unknownBavel.size });
    }

    // Place-only dots: a city mentioned by name in the daf text but not
    // occupied by any rabbi dot. Rendered as a single gray circle with no
    // cluster.
    const occupied = new Set(dots.map((d) => d.city.name));
    const placeDots: KnownCity[] = [];
    if (props.placesInText) {
      for (const name of props.placesInText) {
        if (occupied.has(name)) continue;
        const city = cityByName.get(name);
        if (city) placeDots.push(city);
      }
    }

    let israelCount = 0;
    let bavelCount = 0;
    for (const d of dots) {
      if (d.city.region === 'israel') israelCount += d.count;
      else if (d.city.region === 'bavel') bavelCount += d.count;
    }

    // Movers: rabbis on this daf whose bio has `moved` set. One row per
    // rabbi so the Migration list can show them individually and wire each
    // row to its own hover/click target. Ordered by direction first so the
    // list visually groups Bavel→EY, EY→Bavel, and bidirectional together.
    type Direction = 'bavel->israel' | 'israel->bavel' | 'both';
    const DIR_ORDER: Direction[] = ['bavel->israel', 'israel->bavel', 'both'];
    const buckets: Record<Direction, string[]> = {
      'bavel->israel': [],
      'israel->bavel': [],
      'both':          [],
    };
    if (enrich) {
      const seenMover = new Set<string>();
      for (const [name, info] of enrich.entries()) {
        const mv = info.moved;
        if (mv !== 'bavel->israel' && mv !== 'israel->bavel' && mv !== 'both') continue;
        const display = info.canonical ?? name;
        if (seenMover.has(display)) continue;
        seenMover.add(display);
        buckets[mv].push(display);
      }
    }
    for (const dir of DIR_ORDER) buckets[dir].sort((a, b) => a.localeCompare(b));
    const moverRows: Array<{ name: string; direction: Direction }> = [];
    for (const dir of DIR_ORDER) {
      for (const name of buckets[dir]) moverRows.push({ name, direction: dir });
    }

    return {
      dots,
      placeDots,
      israelCount,
      bavelCount,
      moverRows,
    };
  });

  const GEN_FALLBACK_COLOR = '#9ca3af';

  const renderDot = (d: CityDot): JSX.Element => {
    const offsets = clusterOffsets(d.count, d.city.x, d.city.y);
    const activeCity = () => props.activeLocation === d.city.name;
    return (
      <g>
        <For each={d.rabbis}>
          {(name, i) => {
            const off = offsets[i()];
            const gen = props.generationByName?.get(name);
            const genColor = gen ? GENERATION_BY_ID[gen]?.color : undefined;
            const fill = genColor ?? GEN_FALLBACK_COLOR;
            return (
              <circle
                cx={off.x}
                cy={off.y}
                r={2.6}
                fill={fill}
                stroke={activeCity() ? '#000' : 'rgba(0,0,0,0.25)'}
                stroke-width={activeCity() ? 0.6 : 0.3}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (props.onHighlightSingleRabbi) props.onHighlightSingleRabbi(name);
                  else onDotClick(d);
                }}
              >
                <title>{`${name} · ${d.city.name} (${d.city.nameHe})${gen ? ' · ' + (GENERATION_BY_ID[gen]?.label ?? '') : ''}`}</title>
              </circle>
            );
          }}
        </For>
      </g>
    );
  };

  const onDotClick = (d: CityDot) => {
    const isActive = props.activeLocation === d.city.name;
    props.onHighlightLocation(isActive ? null : d.city.name, d.rabbis);
  };

  const onRegionClick = (region: 'israel' | 'bavel') => {
    const d = data();
    const list = d.dots
      .filter((x) => x.city.region === region)
      .flatMap((x) => x.rabbis);
    const key = region === 'israel' ? '_Israel' : '_Bavel';
    const isActive = props.activeLocation === key;
    props.onHighlightLocation(isActive ? null : key, list);
  };

  const renderPlaceDot = (city: KnownCity): JSX.Element => {
    const active = () => props.activePlace === city.name;
    return (
      <circle
        cx={city.x}
        cy={city.y}
        r={2.6}
        fill={GEN_FALLBACK_COLOR}
        stroke={active() ? '#000' : 'rgba(0,0,0,0.25)'}
        stroke-width={active() ? 0.6 : 0.3}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          if (!props.onHighlightPlace) return;
          props.onHighlightPlace(active() ? null : city.name);
        }}
      >
        <title>{`${city.name} (${city.nameHe}) · mentioned in daf`}</title>
      </circle>
    );
  };

  return (
    <section
      style={{
        padding: '0.75rem 0.75rem 0.5rem',
        border: '1px solid #eee',
        'border-radius': '6px',
        background: '#fcfcfa',
        'font-family': 'system-ui, -apple-system, sans-serif',
        'font-size': '0.8rem',
        color: '#555',
      }}
    >
      <div style={{ color: '#999', 'font-size': '0.72rem', 'margin-bottom': '0.35rem', 'text-transform': 'uppercase', 'letter-spacing': '0.06em' }}>
        Geography · click a dot to highlight
      </div>

      <Show
        when={props.rabbiPlaces}
        fallback={
          <p style={{ color: '#888', margin: 0, 'font-size': '0.75rem', display: 'inline-flex', 'align-items': 'center', gap: '0.4rem' }}>
            <span style={{
              display: 'inline-block', width: '0.75rem', height: '0.75rem',
              'border-radius': '50%',
              border: '2px solid #d6d3d1', 'border-top-color': '#92400e',
              animation: 'daf-spin 0.8s linear infinite',
            }} />
            {props.loading ? 'Mapping rabbi geography…' : 'Loading…'}
          </p>
        }
      >
        <div style={{ display: 'flex', gap: '0.5rem', 'align-items': 'stretch' }}>
          {/* ========== Eretz Yisrael card ========== */}
          <div
            style={{
              flex: 1,
              border: '1px solid #e5e7eb',
              'border-radius': '8px',
              background: '#fff',
              padding: '0.5rem 0.5rem 0.4rem',
              display: 'flex',
              'flex-direction': 'column',
              'align-items': 'center',
            }}
          >
            <div style={{ 'font-size': '0.8rem', 'font-weight': 600, color: '#1f2937', 'margin-bottom': '0.3rem' }}>
              Eretz Yisrael
            </div>
            <svg
              viewBox={`-6 -4 ${ISRAEL_SHAPE.width + 12} ${ISRAEL_SHAPE.height + 8}`}
              style={{ width: '100%', height: 'auto', display: 'block', 'max-height': '280px' }}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="Eretz Yisrael — rabbi geographic origins"
            >
              <path
                d={ISRAEL_SHAPE.d}
                fill="none"
                stroke="#1f2937"
                stroke-width="1.6"
                stroke-linejoin="round"
                opacity="0.85"
                style={{ cursor: 'pointer' }}
                onClick={() => onRegionClick('israel')}
              />
              <For each={data().placeDots.filter((c) => c.region === 'israel')}>
                {(c) => renderPlaceDot(c)}
              </For>
              <For each={data().dots.filter((d) => d.city.region === 'israel')}>
                {(d) => renderDot(d)}
              </For>
            </svg>
          </div>

          {/* ========== Bavel card ========== */}
          <div
            style={{
              flex: 1,
              border: '1px solid #e5e7eb',
              'border-radius': '8px',
              background: '#fff',
              padding: '0.5rem 0.5rem 0.4rem',
              display: 'flex',
              'flex-direction': 'column',
              'align-items': 'center',
            }}
          >
            <div style={{ 'font-size': '0.8rem', 'font-weight': 600, color: '#1e40af', 'margin-bottom': '0.3rem' }}>
              Bavel
            </div>
            <svg
              viewBox="30 -10 95 195"
              style={{ width: '100%', height: 'auto', display: 'block', 'max-height': '280px' }}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="Bavel — rabbi geographic origins"
            >
              {/* Invisible hit-box so clicks anywhere inside the region fire onRegionClick */}
              <rect
                x="30" y="-10" width="95" height="195"
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => onRegionClick('bavel')}
              />
              {/* Euphrates — Pumbedita → Nehardea → Sura → Naresh */}
              <path
                d="M 45,3 C 48,12 40,18 44,28 C 52,36 38,44 46,54 C 54,62 40,72 48,82 C 58,92 50,100 56,110 C 64,120 58,130 66,138 C 74,146 68,154 78,162 C 86,168 90,172 96,174"
                fill="none"
                stroke="#2563eb"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                opacity="0.8"
              />
              {/* Tigris — Nisibis → Ctesiphon/Mehoza → confluence */}
              <path
                d="M 105,14 C 108,26 100,34 106,44 C 114,54 105,64 110,74 C 118,84 108,96 114,106 C 122,116 110,126 108,136 C 104,146 100,156 96,166 C 94,172 94,174 96,174"
                fill="none"
                stroke="#2563eb"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                opacity="0.8"
              />
              <text x="50" y="-3" text-anchor="middle" font-family="Georgia,serif" font-size="7" font-style="italic" fill="#1e40af" opacity="0.85">
                Euphrates
              </text>
              <text x="108" y="-3" text-anchor="middle" font-family="Georgia,serif" font-size="7" font-style="italic" fill="#1e40af" opacity="0.85">
                Tigris
              </text>
              <circle cx="96" cy="174" r="1.5" fill="#2563eb" opacity="0.8" />
              <For each={data().placeDots.filter((c) => c.region === 'bavel')}>
                {(c) => renderPlaceDot(c)}
              </For>
              <For each={data().dots.filter((d) => d.city.region === 'bavel')}>
                {(d) => renderDot(d)}
              </For>
            </svg>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
            'margin-top': '0.3rem',
            'font-size': '0.78rem',
            color: '#555',
          }}
        >
          <span>
            Eretz Yisrael: <strong style={{ color: '#1f2937' }}>{data().israelCount}</strong>
          </span>
          <Show when={data().placeDots.length > 0}>
            <span style={{ color: '#888' }}>Places mentioned: {data().placeDots.length}</span>
          </Show>
          <span>
            Bavel: <strong style={{ color: '#92400e' }}>{data().bavelCount}</strong>
          </span>
        </div>

        <Show when={data().moverRows.length > 0}>
          <div
            style={{
              'margin-top': '0.45rem',
              'padding-top': '0.4rem',
              'border-top': '1px dashed #e5e7eb',
              'font-size': '0.72rem',
              color: '#555',
              display: 'flex',
              'flex-direction': 'column',
              gap: '0.1rem',
            }}
          >
            <div style={{ color: '#6b7280', 'font-size': '0.64rem', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', 'margin-bottom': '0.15rem' }}>
              Migration
            </div>
            <For each={data().moverRows}>
              {(row) => {
                const hovered = () => hoveredMoverRow() === row.name;
                // Hover → transient daf highlight via onHoverRabbi (additive,
                // non-destructive). Click → open bio card via
                // onHighlightSingleRabbi (same path as clicking the map dot).
                const onEnter = () => { setHoveredMoverRow(row.name); props.onHoverRabbi?.(row.name); };
                const onLeave = () => { setHoveredMoverRow(null); props.onHoverRabbi?.(null); };
                const Bavel = <span style={{ 'font-family': 'ui-monospace, SFMono-Regular, monospace', 'font-weight': 600, color: '#92400e' }}>Bavel</span>;
                const EY    = <span style={{ 'font-family': 'ui-monospace, SFMono-Regular, monospace', 'font-weight': 600, color: '#1f2937' }}>Eretz Yisrael</span>;
                const arrow = row.direction === 'both'
                  ? <span style={{ 'font-size': '0.95rem', color: '#111' }}>&harr;</span>
                  : <span style={{ 'font-size': '0.95rem', color: '#111' }}>&rarr;</span>;
                const from = row.direction === 'bavel->israel' ? Bavel : EY;
                const to   = row.direction === 'bavel->israel' ? EY : Bavel;
                return (
                  <div
                    onMouseEnter={onEnter}
                    onMouseLeave={onLeave}
                    onFocus={onEnter}
                    onBlur={onLeave}
                    onClick={() => props.onHighlightSingleRabbi?.(row.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        props.onHighlightSingleRabbi?.(row.name);
                      }
                    }}
                    tabIndex={0}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '0.4rem',
                      padding: '0.15rem 0.35rem',
                      'border-radius': '4px',
                      cursor: props.onHighlightSingleRabbi ? 'pointer' : 'default',
                      'background-color': hovered() ? 'rgba(234, 179, 8, 0.18)' : 'transparent',
                      transition: 'background-color 120ms',
                    }}
                  >
                    {from}
                    {arrow}
                    {to}
                    <span style={{ color: '#555' }}>&middot; {row.name}</span>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  );
}
