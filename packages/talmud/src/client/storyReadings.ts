export interface StoryIndexRow {
  id: string;
  ref: string;
  corpus: string;
  names: string[];
  mentions: string[];
  counts: { people: number; speech: number; relations: number };
}
export interface StoryIndex {
  summary: {
    packs: number;
    passages: number;
    withheldReadings: number;
    corpora: Record<string, number>;
  };
  passages: StoryIndexRow[];
}
export interface StoryClaim {
  quote: string;
  quoteLocation: 'passage' | 'context';
  note?: string;
  basis?: string;
  speaker_basis?: string;
  addressee_basis?: string;
  speaker?: string;
  addressee?: string;
  kind?: string;
  a?: string;
  b?: string;
  relation?: string;
}
export interface StoryPassage extends StoryIndexRow {
  source: { passage: string; before: string; after: string };
  withheld: boolean;
  reading: null | {
    people: {
      id: string;
      label: string;
      note?: string;
      named: string;
      quote: string;
      quoteLocation: string;
    }[];
    speech: StoryClaim[];
    relations: StoryClaim[];
    story: string;
    unclear: string[];
  };
}
export function storySearchKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0591-\u05c7]/g, '')
    .toLowerCase()
    .trim();
}
export async function loadStories<T>(path: string): Promise<T> {
  const response = await fetch(`/story-readings/${path}.json`);
  if (!response.ok || !response.headers.get('content-type')?.includes('json'))
    throw new Error('Reading unavailable');
  return (await response.json()) as T;
}

/** Use reviewed occurrence identities, never a best guess from the displayed name. */
export async function loadStoryPeople(passageId: string): Promise<Record<string, string>> {
  const people: Record<string, string> = Object.create(null);
  const cursors = new Set<string>();
  let revision = '';
  let after = '';
  do {
    const params = new URLSearchParams({
      kind: 'source_identity',
      passage: passageId,
      limit: '50',
    });
    if (revision) params.set('revision', revision);
    if (after) params.set('after', after);
    const response = await fetch(`/api/sage-graph/records?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Reviewed people unavailable');
    const page = (await response.json()) as {
      revision?: string;
      nextCursor?: string | null;
      records?: {
        kind: string;
        passage_id: string;
        authority: string;
        decision: string;
        data?: {
          status: string;
          historicalIdentityResolved: boolean;
          personKey: string;
          personId: string;
        };
      }[];
    };
    if (
      typeof page?.revision !== 'string' ||
      !page.revision ||
      (revision && page.revision !== revision) ||
      !Array.isArray(page.records) ||
      !(page.nextCursor === null || typeof page.nextCursor === 'string')
    )
      throw new Error('Invalid reviewed people');
    revision = page.revision;
    for (const record of page.records) {
      const person = record.data;
      if (record.kind !== 'source_identity' || record.passage_id !== passageId)
        throw new Error('Wrong passage identity');
      if (
        !['source_review', 'user_correction'].includes(record.authority) ||
        record.decision !== 'accepted_registry_identity' ||
        person?.status !== 'accepted_registry_identity' ||
        person.historicalIdentityResolved !== true
      )
        continue;
      if (
        typeof person.personKey !== 'string' ||
        !person.personKey.startsWith(`${passageId}/`) ||
        typeof person.personId !== 'string' ||
        !/^[a-z0-9()-]+$/.test(person.personId)
      )
        throw new Error('Invalid person identity');
      if (people[person.personKey] && people[person.personKey] !== person.personId)
        throw new Error('Conflicting person identities');
      people[person.personKey] = person.personId;
    }
    after = page.nextCursor ?? '';
    if (after && (cursors.has(after) || cursors.size >= 100))
      throw new Error('Incomplete reviewed people');
    cursors.add(after);
  } while (after);
  return people;
}
