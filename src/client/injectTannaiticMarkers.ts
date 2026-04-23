/**
 * Detect explicit Tannaitic quotation markers in the daf and underline them in
 * the SAME visual family as rabbi-generation underlines — the markers cite
 * Tannaitic-era teachings, so they belong to the Tanna palette. A dashed
 * underline distinguishes "anonymous tannaitic" (specific generation unknown)
 * from a specific named sage's solid underline.
 *
 * Only explicit quotation markers are detected (the ד-prefixed forms):
 *   דתנן / דתני / דתניא
 *
 * Standalone תנן / תניא are dropped because they're ambiguous (תנן can mean
 * "we hold [legally]"). Structural headers (גמ' / מתני') are dropped because
 * they span editorial generations, not a Tannaitic voice.
 */

// Class applied via the same generation-marker system so styles cascade from
// styles.css's .rabbi-underline rules plus a dashed variant.
const TANNAITIC_CLASSES = 'rabbi-underline rabbi-underline-anonymous rabbi-gen-tanna-anonymous';

const MARKERS = new Set<string>([
  'דתנן',   // "as we learned [in the Mishnah]"
  'דתניא',  // "as it was taught [in a baraita]"
  'דתני',   // "as was taught"
]);

function normalizeHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/[.,:;?!"'״׳]/g, '')
    .trim();
}

export function injectTannaiticMarkers(html: string): string {
  if (!html || typeof document === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length === 0) return html;

  for (const el of words) {
    // Don't double-wrap words already inside a rabbi underline.
    if (el.parentElement?.classList.contains('rabbi-underline')) continue;
    const text = normalizeHebrew(el.textContent ?? '');
    if (!MARKERS.has(text)) continue;

    const wrapper = doc.createElement('span');
    wrapper.className = TANNAITIC_CLASSES;
    wrapper.setAttribute('title', 'Anonymous Tannaitic quotation');
    wrapper.setAttribute('data-marker', 'tannaitic');

    const parent = el.parentNode;
    if (!parent) continue;
    parent.insertBefore(wrapper, el);
    wrapper.appendChild(el);
  }

  return doc.body.innerHTML;
}
