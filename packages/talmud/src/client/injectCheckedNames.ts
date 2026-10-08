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
  for (const match of runningText.matchAll(/\S+/g)) {
    const raw = match[0];
    const clean = raw.replace(/[֑-ׇ]/g, '');
    const key = clean.replace(/[^א-ת]/g, '');
    const expanded = /["״]/.test(clean) ? forms[key] : undefined;
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

export function injectCheckedNames(html: string, occurrences: CheckedOccurrence[]): string {
  if (!occurrences.length || typeof document === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const candidates: { row: CheckedOccurrence; words: HTMLElement[] }[] = [];
  for (const row of occurrences) {
    const segment = row.ref.match(/:(\d+)$/);
    if (!segment || row.source.slice(row.characterStart, row.characterEnd) !== row.quote) continue;
    const words = [
      ...doc.querySelectorAll<HTMLElement>(`.daf-word[data-seg="${Number(segment[1]) - 1}"]`),
    ];
    if (!words.length) continue;
    const rendered = words.map((w) => w.textContent ?? '').join(' ');
    const sourceLetters = letters(row.source);
    const pageLetters = letters(rendered);
    if (sourceLetters.map((x) => x.letter).join('') !== pageLetters.map((x) => x.letter).join(''))
      continue;
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
    const first = words[0],
      last = words[words.length - 1],
      parent = first.parentNode;
    if (!parent || words.some((w) => w.parentNode !== parent)) continue;
    const generation =
      row.generation && row.generation in GENERATION_BY_ID
        ? (row.generation as GenerationId)
        : 'unknown';
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
    for (const word of words) painted.add(word);
  }
  return doc.body.innerHTML;
}
