import type { CheckedOccurrence } from '../lib/sage-graph/types';
import { colorForGeneration, GENERATION_BY_ID, type GenerationId } from './generations';

/** Expand only the forms needed by the checked passages; the complete segment must still agree. */
function letters(text: string) {
  const output: { letter: string; at: number }[] = [];
  const forms: Record<string, string> = { אל: 'אמרליה', תל: 'תלמודלומר', רמ: 'רבימאיר' };
  // Printed verse references may be absent from the page's running text.
  // Mask only a known book followed by chapter and verse; retain original offsets.
  const books =
    'בראשית|שמות|ויקרא|במדבר|דברים|יהושע|שופטים|שמואל [אב]|מלכים [אב]|ישעיה|ירמיה|יחזקאל|הושע|יואל|עמוס|עובדיה|יונה|מיכה|נחום|חבקוק|צפניה|חגי|זכריה|מלאכי|תהלים|משלי|איוב|שיר השירים|רות|איכה|קהלת|אסתר|דניאל|עזרא|נחמיה|דברי הימים [אב]';
  const references = new RegExp(`\\((?:${books}) [א-ת׳״"']+, [א-ת׳״"']+\\)`, 'g');
  const runningText = text.replace(references, (reference) => ' '.repeat(reference.length));
  const tokens = [...runningText.matchAll(/\S+/g)];
  const cleanToken = (index: number) =>
    (tokens[index]?.[0] ?? '').replace(/[֑-ׇ]/g, '').replace(/[.,:;!?]+$/, '');
  for (const [index, match] of tokens.entries()) {
    const raw = match[0];
    const clean = raw.replace(/[֑-ׇ]/g, '');
    const key = clean.replace(/[^א-ת]/g, '');
    let expanded = /["״]/.test(clean) ? forms[key] : undefined;
    // Expand compound names only with their written qualifier. A bare ר"א or
    // ר"ש remains ambiguous; the complete source paragraph must still match.
    const first = cleanToken(index).match(/^(ד?)ר["״]א$/);
    if (first && /^בר["״]ש$/.test(cleanToken(index + 1))) expanded = `${first[1]}רביאלעזר`;
    else if (/^בר["״]ש$/.test(cleanToken(index)) && /^(ד?)ר["״]א$/.test(cleanToken(index - 1)))
      expanded = 'ברבישמעון';
    else if (/^ר["״]ש$/.test(cleanToken(index)) && cleanToken(index + 1) === 'ברבי')
      expanded = 'רבישמעון';
    if (expanded) {
      for (const letter of expanded) output.push({ letter, at: match.index! });
      continue;
    }
    for (let i = 0; i < raw.length; i++) {
      const letter = raw[i];
      if (!/[א-ת]/.test(letter)) continue;
      output.push({ letter, at: match.index! + i });
      if (letter === 'ר' && /^[֑-ׇ]*['׳]/.test(raw.slice(i + 1))) {
        output.push({ letter: 'ב', at: match.index! + i }, { letter: 'י', at: match.index! + i });
      }
    }
  }
  return output;
}

// Repair only a complete, unique source match between the neighboring segment
// markers. This does not extend the fuzzy aligner or search another segment.
function restoreSegment(doc: Document, segment: number, source: string): HTMLElement[] {
  const all = [...doc.querySelectorAll<HTMLElement>('.daf-word')];
  const tagged = (word: HTMLElement) =>
    word.dataset.seg === undefined ? undefined : Number(word.dataset.seg);
  let previous = -1;
  for (let i = 0; i < all.length; i++) {
    const tag = tagged(all[i]);
    if (tag !== undefined && tag < segment) previous = i;
  }
  const next = all.findIndex((word, i) => {
    const tag = tagged(word);
    return i > previous && tag !== undefined && tag > segment;
  });
  const existing = all.filter((word) => tagged(word) === segment);
  if (
    !existing.length &&
    (previous < 0 || tagged(all[previous]) !== segment - 1) &&
    (next < 0 || tagged(all[next]) !== segment + 1)
  )
    return [];
  if (source.trim().split(/\s+/).length < 4) return [];
  const window = all.slice(previous + 1, next < 0 ? all.length : next);
  const words = window.filter((word) => {
    // The printed footnote labels טו] and יד] are not part of the sentence.
    const text = (word.textContent ?? '').trim();
    return !(tagged(word) === undefined && /^[א-ת]{1,3}\]$/.test(text));
  });
  const mapped = words.flatMap((word) =>
    letters(word.textContent ?? '').map(({ letter }) => ({ letter, word })),
  );
  const needle = letters(source)
    .map((x) => x.letter)
    .join('');
  const haystack = mapped.map((x) => x.letter).join('');
  const start = haystack.indexOf(needle);
  if (!needle || start < 0 || haystack.indexOf(needle, start + 1) >= 0) return [];
  const end = start + needle.length;
  // Never accept a match that begins or ends inside a printed word.
  if (
    (start > 0 && mapped[start - 1].word === mapped[start].word) ||
    (end < mapped.length && mapped[end - 1].word === mapped[end].word)
  )
    return [];
  const selected = [...new Set(mapped.slice(start, end).map((x) => x.word))];
  if (existing.some((word) => !selected.includes(word))) return [];
  for (const word of selected) word.dataset.seg = String(segment);
  return selected;
}

export function injectCheckedNames(html: string, occurrences: CheckedOccurrence[]): string {
  if (!occurrences.length || typeof document === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const candidates: { row: CheckedOccurrence; words: HTMLElement[] }[] = [];
  for (const row of occurrences) {
    const segment = row.ref.match(/:(\d+)$/);
    if (!segment || row.source.slice(row.characterStart, row.characterEnd) !== row.quote) continue;
    let words = [
      ...doc.querySelectorAll<HTMLElement>(`.daf-word[data-seg="${Number(segment[1]) - 1}"]`),
    ];
    const sourceLetters = letters(row.source);
    const normalizedSource = sourceLetters.map((x) => x.letter).join('');
    let pageLetters = letters(words.map((w) => w.textContent ?? '').join(' '));
    if (normalizedSource !== pageLetters.map((x) => x.letter).join('')) {
      words = restoreSegment(doc, Number(segment[1]) - 1, row.source);
      pageLetters = letters(words.map((w) => w.textContent ?? '').join(' '));
    }
    if (!words.length || normalizedSource !== pageLetters.map((x) => x.letter).join('')) continue;
    const start = sourceLetters.findIndex((x) => x.at >= row.characterStart);
    let end = sourceLetters.findIndex((x) => x.at >= row.characterEnd);
    if (end < 0) end = sourceLetters.length;
    if (start < 0 || end <= start) continue;
    const from = pageLetters[start].at;
    const through = pageLetters[end - 1].at;
    let offset = 0;
    const selected = words.filter((word) => {
      const begin = offset;
      offset += (word.textContent ?? '').length + 1;
      return begin <= through && offset - 1 > from;
    });
    if (selected.length) candidates.push({ row, words: selected });
  }
  // A checked assignment replaces broader saved guesses on exactly these words.
  // Conflicting checked assignments leave those words unlinked.
  const touched = new Set(candidates.flatMap((c) => c.words));
  for (const old of doc.querySelectorAll('.rabbi-underline')) {
    if ([...old.querySelectorAll<HTMLElement>('.daf-word')].some((w) => touched.has(w)))
      old.replaceWith(...old.childNodes);
  }
  // A place used inside a checked full name belongs to the person link.
  // Only unwrap a place marker wholly covered by one accepted occurrence.
  for (const place of doc.querySelectorAll('.city-marker')) {
    const placeWords = [...place.querySelectorAll<HTMLElement>('.daf-word')];
    if (
      placeWords.length > 0 &&
      candidates.some(
        (candidate) =>
          placeWords.every((word) => candidate.words.includes(word)) &&
          !candidates.some(
            (other) =>
              other.row.personId !== candidate.row.personId &&
              other.words.some((word) => candidate.words.includes(word)),
          ),
      )
    )
      place.replaceWith(...place.childNodes);
  }
  const painted = new Set<HTMLElement>();
  for (const candidate of candidates) {
    const { row, words } = candidate;
    if (
      candidates.some(
        (other) =>
          other.row.personId !== row.personId && other.words.some((w) => words.includes(w)),
      )
    )
      continue;
    if (words.some((w) => painted.has(w))) continue;
    const parent = words[0].parentNode;
    if (!parent || words.some((w) => w.parentNode !== parent)) continue;
    const generation =
      row.generation && row.generation in GENERATION_BY_ID
        ? (row.generation as GenerationId)
        : 'unknown';
    // A footnote may sit inside a name. Link the name on either side while
    // leaving the footnote in its original position and outside the link.
    const groups: HTMLElement[][] = [];
    for (const word of words) {
      const group = groups[groups.length - 1];
      let sibling = group?.[group.length - 1].nextSibling;
      while (sibling && sibling !== word) {
        if (sibling instanceof Element && sibling.querySelector('.daf-word')) break;
        if (sibling instanceof Element && sibling.matches('.daf-word')) break;
        sibling = sibling.nextSibling;
      }
      if (group && sibling === word) group.push(word);
      else groups.push([word]);
    }
    for (const group of groups) {
      const first = group[0],
        last = group[group.length - 1];
      const wrapper = doc.createElement('span');
      wrapper.className = `rabbi-underline rabbi-gen-${generation}`;
      wrapper.style.borderBottomColor = colorForGeneration(generation);
      wrapper.dataset.rabbi = row.name;
      wrapper.dataset.rabbiSlug = row.personId;
      wrapper.dataset.checkedPerson = row.personKey;
      parent.insertBefore(wrapper, first);
      let current: Node | null = first;
      while (current) {
        const next: Node | null = current.nextSibling;
        wrapper.appendChild(current);
        if (current === last) break;
        current = next;
      }
    }
    for (const word of words) painted.add(word);
  }
  return doc.body.innerHTML;
}
