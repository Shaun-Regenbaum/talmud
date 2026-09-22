/** Keep punctuation between a speaker and the first word of their statement.
 * Shabbat 55b:12–13 says "רב: פנחס לא חטא", not the name "רב פנחס".
 * Source: https://www.sefaria.org/Shabbat.55b.12
 */
function normalize(text: string): string {
  return text
    .replace(/[֑-ׇ]/g, '')
    .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** For each occurrence, report whether punctuation splits the name. */
export function nameBoundaryMatches(text: string): (nameHe: string) => boolean[] {
  const words = normalize(text.replace(/[:;.!?׃—–]/g, ' | ')).split(' ');
  return (nameHe) => {
    const name = normalize(nameHe).split(' ');
    if (name.length < 2) return [];
    const matches: boolean[] = [];
    for (let start = 0; start < words.length; start++) {
      if (words[start] !== name[0]) continue;
      let pos = start + 1;
      let crossed = false;
      let matched = true;
      for (const token of name.slice(1)) {
        while (words[pos] === '|') {
          crossed = true;
          pos++;
        }
        if (words[pos++] !== token) {
          matched = false;
          break;
        }
      }
      if (matched) matches.push(crossed);
    }
    return matches;
  };
}

/** Missing text or a different spelling is not evidence against a name. */
export function nameCrossesBoundary(text: string): (nameHe: string) => boolean {
  const matches = nameBoundaryMatches(text);
  return (nameHe) => {
    const occurrences = matches(nameHe);
    return occurrences.length > 0 && occurrences.every(Boolean);
  };
}

/** Preserve every field on surviving instances, including human annotations. */
export function filterRabbiBoundaries<T>(parsed: T, text: string): T {
  const p = parsed as { instances?: Array<{ fields?: { nameHe?: string } }> } | null;
  if (!Array.isArray(p?.instances)) return parsed;
  const crosses = nameCrossesBoundary(text);
  const instances = p.instances.filter((i) => !crosses(i.fields?.nameHe ?? ''));
  return instances.length === p.instances.length ? parsed : { ...parsed, instances };
}
