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

/** Reads `#source-person/<id>?revision=..` back. Pins count only when all three are present. */
export function parseSourcePersonHash(hash: string): { id: string; pins?: ReadingPins } {
  const raw = hash.replace(/^#?source-person\//, '');
  const [encoded, query = ''] = raw.split('?', 2);
  let id = '';
  try {
    id = decodeURIComponent(encoded);
  } catch {
    return { id: '' };
  }
  const params = new URLSearchParams(query);
  const revision = params.get('revision');
  const bavliRevision = params.get('bavliRevision');
  const otherRevision = params.get('otherRevision');
  return revision && bavliRevision && otherRevision
    ? { id, pins: { revision, bavliRevision, otherRevision } }
    : { id };
}
