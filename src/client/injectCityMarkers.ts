import { normalizeHebrew } from './injectRabbiUnderlines';
import { KNOWN_CITIES } from './GeographyMap';

/**
 * For each KnownCity, find every occurrence of its Hebrew name in the
 * tokenized daf HTML and wrap the matched run of `.daf-word` spans in a
 * `<span class="city-marker" data-city="<name>">`. Click-highlighting in
 * DafViewer's applyHighlights toggles `.city-highlighted` on these markers.
 *
 * Matching mirrors injectRabbiUnderlines: whitespace-tokenized, normalized
 * through `normalizeHebrew` (drops nikkud/punctuation, collapses whitespace),
 * multi-token city names match as consecutive word sequences. Single-letter
 * Hebrew particles (ב/מ/ל/כ/ש/ו) are tried as prefixes on the first token so
 * forms like `בטבריה` ("in Tiberias") match `טבריה`.
 *
 * Returns the modified HTML plus the set of city names that were matched at
 * least once — used by the GeographyMap to decide which place-dots to draw.
 */
export function injectCityMarkers(html: string): { html: string; matched: Set<string> } {
  const matched = new Set<string>();
  if (!html || typeof document === 'undefined') return { html, matched };

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length === 0) return { html, matched };

  const normed = words.map((el) => normalizeHebrew(el.textContent ?? ''));

  interface Candidate { tokens: string[]; cityName: string }
  const HEBREW_PARTICLES = ['ב', 'מ', 'ל', 'כ', 'ש', 'ו'];

  const candidates: Candidate[] = [];
  for (const city of KNOWN_CITIES) {
    const base = normalizeHebrew(city.nameHe).split(' ').filter(Boolean);
    if (base.length === 0) continue;
    candidates.push({ tokens: base, cityName: city.name });
    for (const p of HEBREW_PARTICLES) {
      candidates.push({ tokens: [p + base[0], ...base.slice(1)], cityName: city.name });
    }
  }
  candidates.sort((a, b) => b.tokens.length - a.tokens.length);

  const wrapped = new Uint8Array(words.length);
  interface Wrap { start: number; end: number; cityName: string }
  const wraps: Wrap[] = [];

  for (const c of candidates) {
    const n = c.tokens.length;
    for (let i = 0; i <= words.length - n; i++) {
      let clear = true;
      for (let j = 0; j < n; j++) {
        if (wrapped[i + j]) { clear = false; break; }
      }
      if (!clear) continue;

      let ok = true;
      for (let j = 0; j < n; j++) {
        if (normed[i + j] !== c.tokens[j]) { ok = false; break; }
      }
      if (!ok) continue;

      wraps.push({ start: i, end: i + n - 1, cityName: c.cityName });
      for (let j = 0; j < n; j++) wrapped[i + j] = 1;
      matched.add(c.cityName);
    }
  }

  if (wraps.length === 0) return { html, matched };

  for (const w of wraps) {
    const first = words[w.start];
    const last = words[w.end];
    const parent = first.parentNode;
    if (!parent) continue;

    const wrapperEl = doc.createElement('span');
    wrapperEl.className = 'city-marker';
    wrapperEl.setAttribute('data-city', w.cityName);

    parent.insertBefore(wrapperEl, first);
    const nodesToMove: Node[] = [];
    let current: Node | null = first;
    while (current) {
      nodesToMove.push(current);
      if (current === last) break;
      current = current.nextSibling;
    }
    for (const node of nodesToMove) wrapperEl.appendChild(node);
  }

  return { html: doc.body.innerHTML, matched };
}
