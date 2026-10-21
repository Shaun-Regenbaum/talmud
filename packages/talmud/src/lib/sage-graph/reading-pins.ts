/**
 * The exact graph and source-store revisions a page read. Every card and link opened from that page
 * sends them back, so it reads the same data even after a new release. `none` means the page read no
 * revision of that store; the server then skips the store instead of reading its newest revision.
 */
export interface ReadingPins {
  revision: string;
  bavliRevision: string;
  otherRevision: string;
}
export const NO_STORE_REVISION = 'none';

export function readingPins(
  revision: string | undefined,
  sourceRevisions: Record<'bavli' | 'other', string | null> | undefined,
): ReadingPins | undefined {
  if (!revision || !sourceRevisions) return undefined;
  return {
    revision,
    bavliRevision: sourceRevisions.bavli ?? NO_STORE_REVISION,
    otherRevision: sourceRevisions.other ?? NO_STORE_REVISION,
  };
}

export function pinQuery(pins: ReadingPins | undefined): string {
  if (!pins) return '';
  return new URLSearchParams({
    revision: pins.revision,
    bavliRevision: pins.bavliRevision,
    otherRevision: pins.otherRevision,
  }).toString();
}

export function sourcePersonHash(id: string, pins?: ReadingPins): string {
  const query = pinQuery(pins);
  return `#source-person/${encodeURIComponent(id)}${query ? `?${query}` : ''}`;
}

/**
 * Reads `#source-person/<id>?revision=..` back. A link with no pins is unpinned. A link with some pins
 * but not all three, or an empty one, or a bad ID is malformed: the card shows an error and reads
 * nothing, rather than read the newest revisions in place of the ones it was given.
 */
export function parseSourcePersonHash(hash: string): {
  id: string;
  pins?: ReadingPins;
  malformed?: true;
} {
  const raw = hash.replace(/^#?source-person\//, '');
  const at = raw.indexOf('?');
  const [encoded, query] = at < 0 ? [raw, undefined] : [raw.slice(0, at), raw.slice(at + 1)];
  let id = '';
  try {
    id = decodeURIComponent(encoded);
  } catch {
    return { id: '', malformed: true };
  }
  if (query === undefined) return { id };
  const params = new URLSearchParams(query);
  const names = ['revision', 'bavliRevision', 'otherRevision'] as const;
  const [revision, bavliRevision, otherRevision] = names.map((name) => params.get(name));
  if (
    !id ||
    !revision ||
    !bavliRevision ||
    !otherRevision ||
    [...params.keys()].some((key) => !(names as readonly string[]).includes(key)) ||
    names.some((name) => params.getAll(name).length !== 1)
  )
    return { id, malformed: true };
  return { id, pins: { revision, bavliRevision, otherRevision } };
}
