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
