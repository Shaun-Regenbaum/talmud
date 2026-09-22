import { describe, expect, it } from 'vitest';
import {
  citedDafs,
  includesVerse,
  linkedTalmudRefs,
  matchingCards,
  readTalmudVerseContext,
} from '../src/worker/talmud-verse-context';
import saved from './fixtures/berakhot-2a-pesukim.json';

describe('matching saved Talmud verse context', () => {
  it('accepts only the focal verse or an explicit containing range', () => {
    expect(includesVerse('Genesis 1:5', 'Genesis 1:5')).toBe(true);
    expect(includesVerse('Genesis 1:1-5', 'Genesis 1:5')).toBe(true);
    expect(includesVerse('Genesis 1:31-2:3', 'Genesis 2:2')).toBe(true);
    expect(includesVerse('Genesis 1:5', 'Genesis 1:22')).toBe(false);
    expect(includesVerse('Genesis 1', 'Genesis 1:5')).toBe(false);
    expect(includesVerse('Exodus 1:5', 'Genesis 1:5')).toBe(false);
    expect(includesVerse('Genesis 1:31-2:3', 'Genesis 2:4')).toBe(false);
  });
  it('finds a Bavli daf without treating a Yerushalmi reference as Bavli', () => {
    expect(citedDafs('Berakhot 2a:1')).toEqual([{ tractate: 'Berakhot', page: '2a' }]);
    expect(citedDafs('Berakhot 2a:1-2b:3')).toEqual([
      { tractate: 'Berakhot', page: '2a' },
      { tractate: 'Berakhot', page: '2b' },
    ]);
    expect(citedDafs('Jerusalem Talmud Berakhot 2:1:1')).toEqual([]);
    expect(citedDafs('Tractate Soferim 17:7')).toEqual([]);
  });
  it('takes the five saved notes for Genesis 1:5, excluding other verses on the same daf', () => {
    const cards = matchingCards(saved.data, 'Genesis 1:5');
    expect(cards).toHaveLength(1);
    const original = saved.data.verses.find((v) => v.ref === 'Genesis 1:5')!;
    for (const field of [
      'tanachContext',
      'whyHere',
      'mechanism',
      'landing',
      'synthesis',
    ] as const) {
      expect(cards[0][field]).toBe(original[field]?.trim().slice(0, 1600));
    }
    expect(matchingCards(saved.data, 'Genesis 1:22')).toEqual([]);
  });
  it('reads each daf once, never requests generation, and keeps its source address', async () => {
    const requests: string[] = [];
    const result = JSON.parse(
      await readTalmudVerseContext(
        {
          fetch: async (input) => {
            requests.push(String(input));
            return Response.json(saved.data);
          },
        },
        'Genesis 1:5',
        ['Berakhot 2a:1', 'Berakhot 2a:2'],
      ),
    );
    expect(requests).toEqual([saved.source]);
    expect(result[0].daf).toBe('Berakhot 2a');
    expect(result[0].cards[0].ref).toBe('Genesis 1:5');
  });
  it('rejects a failed or invalid link lookup instead of calling it empty', async () => {
    await expect(
      linkedTalmudRefs('Genesis 1:5', async () => new Response(null, { status: 429 })),
    ).rejects.toThrow('429');
    await expect(linkedTalmudRefs('Genesis 1:5', async () => Response.json(null))).rejects.toThrow(
      'Invalid',
    );
  });
  it('does not turn a service failure into an empty saved explanation', async () => {
    await expect(
      readTalmudVerseContext(
        { fetch: async () => new Response(null, { status: 503 }) },
        'Genesis 1:5',
        ['Berakhot 2a:1'],
      ),
    ).rejects.toThrow('503');
  });
});
