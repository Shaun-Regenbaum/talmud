/**
 * Wrap the traditional chapter-closing formula "הדרן עלך <chapter>" in a
 * block-level span so it renders on its own line at a slightly larger size.
 * Scans tokenized `.daf-word` spans for the sequence הדרן + עלך (ignoring
 * nikkud / punctuation) and wraps those two words plus the next 1-4 words
 * (the chapter name, sometimes followed by "וסליק פרקא ...") into a
 * `<span class="daf-hadran">`.
 */

function normalize(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')        // nikkud + cantillation
    .replace(/[.,:;?!"'״׳]/g, '') // common Hebrew punctuation
    .trim();
}

export function injectHadran(html: string): string {
  if (!html || typeof document === 'undefined') return html;
  if (!html.includes('הדרן')) return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length < 3) return html;

  const normed = words.map((el) => normalize(el.textContent ?? ''));

  // Collect wrap ranges: [startIdx, endIdx] inclusive per match.
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (normed[i] !== 'הדרן' || normed[i + 1] !== 'עלך') continue;
    // Chapter name starts at i+2. Extend through up to 6 more words or until
    // we cross a DOM boundary (different immediate parent), whichever first.
    const parent = words[i].parentNode;
    let end = Math.min(i + 2, words.length - 1);
    const hardLimit = Math.min(i + 8, words.length - 1);
    for (let j = i + 2; j <= hardLimit; j++) {
      if (words[j].parentNode !== parent) break;
      end = j;
    }
    ranges.push([i, end]);
    i = end; // skip past wrapped range
  }

  if (ranges.length === 0) return html;

  for (const [start, end] of ranges) {
    const first = words[start];
    const last = words[end];
    const parent = first.parentNode;
    if (!parent) continue;

    const wrapper = doc.createElement('span');
    wrapper.className = 'daf-hadran';

    // Collect nodes from first through last (inclusive), including text nodes
    // between them (whitespace / HebrewBooks markup).
    parent.insertBefore(wrapper, first);
    const nodesToMove: Node[] = [];
    let current: Node | null = first;
    while (current) {
      nodesToMove.push(current);
      if (current === last) break;
      current = current.nextSibling;
    }
    for (const n of nodesToMove) wrapper.appendChild(n);
  }

  return doc.body.innerHTML;
}
