import type { InitialPlacement } from '../lib/sage-graph/initial-placement';

// Match the complete segment using literal letters. No abbreviation expansion,
// segment repair, repeated-quote selection or replacement of existing marks.
function letters(text: string) {
  return Array.from(text).flatMap((letter, at) => (/\p{L}/u.test(letter) ? [{ letter, at }] : []));
}
export function injectInitialNames(
  html: string,
  placement: InitialPlacement,
): { html: string; painted: number } {
  if (typeof document === 'undefined' || placement.version !== 'initial-name-placement-v1')
    return { html, painted: 0 };
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let painted = 0;
  for (const row of placement.occurrences) {
    const source = placement.sources.find((s) => s.key === row.sourceKey),
      segment = row.ref.match(/:(\d+)$/);
    if (
      !source ||
      !segment ||
      source.ref !== row.ref ||
      !source.edition ||
      row.people.length !== 1 ||
      row.offsetUnit !== 'Unicode code points' ||
      !Number.isInteger(row.start) ||
      !Number.isInteger(row.end) ||
      row.start < 0 ||
      row.end <= row.start ||
      Array.from(source.text).slice(row.start, row.end).join('') !== row.quote ||
      source.text.indexOf(row.quote) !== source.text.lastIndexOf(row.quote)
    )
      continue;
    const words = [
      ...doc.querySelectorAll<HTMLElement>(`.daf-word[data-seg="${Number(segment[1]) - 1}"]`),
    ];
    const sourceWords = source.text
      .split(/\s+/)
      .map((word) =>
        letters(word)
          .map((x) => x.letter)
          .join(''),
      )
      .filter(Boolean);
    const pageWords = words
      .map((word) =>
        letters(word.textContent ?? '')
          .map((x) => x.letter)
          .join(''),
      )
      .filter(Boolean);
    if (JSON.stringify(sourceWords) !== JSON.stringify(pageWords)) continue;
    const mapped = words.flatMap((word) =>
      letters(word.textContent ?? '').map((x) => ({ ...x, word })),
    );
    const original = letters(source.text);
    if (
      !mapped.length ||
      mapped.map((x) => x.letter).join('') !== original.map((x) => x.letter).join('')
    )
      continue;
    const start = original.findIndex((x) => x.at >= row.start);
    let end = original.findIndex((x) => x.at >= row.end);
    if (end < 0) end = original.length;
    if (
      start < 0 ||
      end <= start ||
      (start > 0 && mapped[start - 1].word === mapped[start].word) ||
      (end < mapped.length && mapped[end - 1].word === mapped[end].word)
    )
      continue;
    const chosen = [...new Set(mapped.slice(start, end).map((x) => x.word))],
      parent = chosen[0].parentElement;
    if (
      !parent ||
      (!['BODY', 'DIV', 'P'].includes(parent.tagName) &&
        !(parent.tagName === 'SPAN' && parent.attributes.length === 0)) ||
      chosen.some(
        (w) =>
          w.parentElement !== parent ||
          w.closest('a,button,.rabbi-underline,.city-marker,[data-mark-id]'),
      )
    )
      continue;
    // Only plain whitespace may lie between the selected words.
    let cursor: Node | null = chosen[0];
    const nodes: Node[] = [];
    while (cursor) {
      if (cursor instanceof Element && !chosen.includes(cursor as HTMLElement)) break;
      if (cursor.nodeType === Node.TEXT_NODE && cursor.textContent?.trim()) break;
      nodes.push(cursor);
      if (cursor === chosen[chosen.length - 1]) break;
      cursor = cursor.nextSibling;
    }
    if (nodes[nodes.length - 1] !== chosen[chosen.length - 1]) continue;
    const wrapper = doc.createElement('span');
    wrapper.className = 'rabbi-underline rabbi-gen-unknown';
    wrapper.dataset.rabbi = row.people[0].name;
    wrapper.dataset.rabbiSlug = row.people[0].id;
    wrapper.dataset.initialReading = row.key;
    parent.insertBefore(wrapper, chosen[0]);
    for (const node of nodes) wrapper.appendChild(node);
    painted++;
  }
  return { html: doc.body.innerHTML, painted };
}
