/**
 * Ensure the opening word of a masechet carries the `.gdropcap` class so it
 * renders as a centered block incipit (styled in daf-render/styles.css).
 *
 * HebrewBooks source markup is inconsistent — most masechetot wrap the
 * opening word in `<span class="gdropcap">`, but some (Shabbat, Kiddushin,
 * Yevamot, etc.) do not. When gdropcap is already present we leave the
 * document untouched; otherwise we tag the first `.daf-word` span.
 *
 * Call site is gated on daf 2a (first amud of every masechet).
 */
export function ensureMasechetIncipit(html: string): string {
  if (!html || typeof document === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  if (doc.body.querySelector('.gdropcap')) return html;

  const firstWord = doc.body.querySelector('.daf-word');
  if (!firstWord) return html;

  firstWord.classList.add('gdropcap');
  return doc.body.innerHTML;
}
