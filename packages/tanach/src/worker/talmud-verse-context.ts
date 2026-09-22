/** Read existing verse cards through Talmud's public, non-generating study view. */
export interface TalmudContextFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface VerseAddress {
  book: string;
  chapter: number;
  verse: number;
}

function focalAddress(ref: string): VerseAddress | null {
  const match = ref.trim().match(/^(.+?)\s+(\d+):(\d+)$/);
  return match
    ? {
        book: match[1].replace(/_/g, ' ').toLowerCase(),
        chapter: Number(match[2]),
        verse: Number(match[3]),
      }
    : null;
}

/** Match exact verses and explicit ranges. Never accept an entire chapter as a match. */
export function includesVerse(citation: string, focal: string): boolean {
  const target = focalAddress(focal);
  const match = citation.trim().match(/^(.+?)\s+(\d+):(\d+)(?:[-–](?:(\d+):)?(\d+))?$/);
  if (!target || !match || match[1].replace(/_/g, ' ').toLowerCase() !== target.book) return false;
  const start = [Number(match[2]), Number(match[3])];
  const end = [Number(match[4] ?? match[2]), Number(match[5] ?? match[3])];
  const after =
    target.chapter > start[0] || (target.chapter === start[0] && target.verse >= start[1]);
  const before = target.chapter < end[0] || (target.chapter === end[0] && target.verse <= end[1]);
  return after && before;
}

export function citedDafs(ref: string): { tractate: string; page: string }[] {
  if (/^(Jerusalem|Tractate)\b/.test(ref)) return [];
  const match = ref.match(/^(.+?)\s+(\d+[ab])(?::\d+)?(?:-(?:(\d+[ab])(?::\d+)?|\d+))?$/);
  if (!match) return [];
  const ordinal = (page: string) => Number(page.slice(0, -1)) * 2 + (page.endsWith('b') ? 1 : 0);
  const start = ordinal(match[2]);
  const end = ordinal(match[3] ?? match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return [];
  return Array.from({ length: Math.min(6, end - start + 1) }, (_, offset) => {
    const n = start + offset;
    return { tractate: match[1], page: `${Math.floor(n / 2)}${n % 2 ? 'b' : 'a'}` };
  });
}

/** A failed links request must not look like a verse with no linked Talmud passages. */
export async function linkedTalmudRefs(
  ref: string,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const response = await fetcher(
    `https://www.sefaria.org/api/links/${encodeURIComponent(ref)}?with_text=0`,
    { signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok) throw new Error(`Talmud links request failed (${response.status})`);
  const links: unknown = await response.json();
  if (!Array.isArray(links)) throw new Error('Invalid Talmud links response');
  return [
    ...new Set(
      links.flatMap((link) => {
        if (!link || typeof link !== 'object' || link.category !== 'Talmud') return [];
        const value = link.sourceRef || link.ref;
        return typeof value === 'string' && value.trim() ? [value] : [];
      }),
    ),
  ];
}

const FIELDS = ['tanachContext', 'whyHere', 'mechanism', 'landing', 'synthesis'] as const;

/** Keep the original verse and daf addresses beside every piece of generated context. */
export function matchingCards(payload: unknown, focal: string): Record<string, unknown>[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('verses' in payload) ||
    !Array.isArray(payload.verses)
  ) {
    throw new Error('Invalid Talmud verse-card response');
  }
  return payload.verses
    .filter(
      (card): card is Record<string, unknown> =>
        !!card &&
        typeof card === 'object' &&
        typeof card.ref === 'string' &&
        includesVerse(card.ref, focal),
    )
    .slice(0, 2)
    .flatMap((card) => {
      const notes = Object.fromEntries(
        FIELDS.flatMap((field) => {
          const value = card[field];
          return typeof value === 'string' && value.trim()
            ? [[field, value.trim().slice(0, 1600)]]
            : [];
        }),
      );
      if (!Object.keys(notes).length) return [];
      const citation =
        card.citation && typeof card.citation === 'object'
          ? (card.citation as Record<string, unknown>)
          : {};
      return [
        {
          ref: card.ref,
          citation: typeof citation.excerpt === 'string' ? citation.excerpt.slice(0, 1200) : null,
          ...notes,
        },
      ];
    });
}

export async function readTalmudVerseContext(
  service: TalmudContextFetcher | undefined,
  focal: string,
  sourceRefs: string[],
): Promise<string> {
  if (!service) throw new Error('Talmud context service is unavailable');
  const dafs = new Map<string, { tractate: string; page: string }>();
  for (const ref of sourceRefs) {
    for (const daf of citedDafs(ref)) dafs.set(`${daf.tractate} ${daf.page}`, daf);
  }
  const rows = await Promise.all(
    [...dafs].slice(0, 6).map(async ([daf, address]) => {
      const url = new URL(
        `https://talmud.dev/api/pesukim/${encodeURIComponent(address.tractate)}/${address.page}`,
      );
      url.searchParams.set('lang', 'en');
      const response = await service.fetch(url, { signal: AbortSignal.timeout(20000) });
      if (response.status === 404) return { daf, status: 'no saved context', cards: [] };
      if (!response.ok) throw new Error(`Talmud context request failed (${response.status})`);
      const cards = matchingCards(await response.json(), focal);
      return {
        daf,
        url: url.toString(),
        status: cards.length ? 'saved context' : 'no saved context for this verse',
        cards,
      };
    }),
  );
  return JSON.stringify(rows);
}
