import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStoryPeople } from '../src/client/storyReadings';
import captured from './fixtures/story-people.json';

afterEach(() => vi.unstubAllGlobals());

describe('reviewed people on source pages', () => {
  it('keeps the registry suffix that distinguishes Yehuda Nesia I', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(captured.qualified))),
    );
    expect((await loadStoryPeople('b530-p2'))['b530-p2/E']).toBe('rabbi-yehudah-nesia-(i)');
  });
  it('keeps father and son separate and pins pagination to one saved revision', async () => {
    const fetcher = vi.fn();
    for (const page of captured.pages)
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify(page)));
    vi.stubGlobal('fetch', fetcher);
    const people = await loadStoryPeople('b000-p8');
    expect(people['b000-p8/A']).toBe('rav-yehudah-b-yechezkel');
    expect(people['b000-p8/B']).toBe('rav-yitzchak-b-yehuda');
    expect(fetcher).toHaveBeenCalledTimes(captured.pages.length);
    const second = new URL(fetcher.mock.calls[1][0], 'https://talmud.dev');
    expect(second.searchParams.get('revision')).toBe(captured.pages[0].revision);
    expect(second.searchParams.get('after')).toBe(captured.pages[0].nextCursor);
  });

  it('does not return partial links when a later page fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(captured.pages[0])))
        .mockResolvedValueOnce(new Response('', { status: 503 })),
    );
    await expect(loadStoryPeople('b000-p8')).rejects.toThrow('unavailable');
  });

  it('withholds links if the saved review authority is missing', async () => {
    // Deliberately remove review provenance from a captured record.
    const page = structuredClone(captured.qualified);
    for (const record of page.records) record.authority = '';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(page))));
    expect(await loadStoryPeople('b530-p2')).toEqual({});
  });

  it('rejects records from another passage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(captured.pages[0]))),
    );
    await expect(loadStoryPeople('b059-p1')).rejects.toThrow('Wrong passage');
  });

  it('rejects a repeated cursor instead of looping forever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => captured.pages[0] }),
    );
    await expect(loadStoryPeople('b000-p8')).rejects.toThrow('Incomplete');
  });
});
