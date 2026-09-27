import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  candidatesForLines,
  classifyParallelLink,
  formatParallelCandidatesForPrompt,
  type ParallelCandidate,
  sameParallelRef,
} from '../src/lib/aggadata/parallels';
import { groundParallels, runPasses } from '../src/lib/check/passes';
import { sefariaAPI } from '../src/lib/sefref/sefaria/client';

const daf = { tractate: 'Berakhot', page: '2a' };

describe('classifyParallelLink', () => {
  it('keeps real parallel sources and labels them', () => {
    expect(
      classifyParallelLink(
        { ref: 'Berakhot 9a:10', category: 'Talmud', type: 'mesorat hashas' },
        daf,
      ),
    ).toBe('mesorat-hashas');
    expect(
      classifyParallelLink({ ref: 'Jerusalem Talmud Berakhot 1:1:6', category: 'Talmud' }, daf),
    ).toBe('yerushalmi');
    expect(classifyParallelLink({ ref: 'Tosefta Berakhot 1:1', category: 'Tosefta' }, daf)).toBe(
      'tosefta',
    );
    expect(classifyParallelLink({ ref: 'Bereshit Rabbah 78:5', category: 'Midrash' }, daf)).toBe(
      'midrash',
    );
    expect(classifyParallelLink({ ref: 'Leviticus 22:7', category: 'Tanakh' }, daf)).toBe('tanakh');
  });

  it('drops what is not a parallel', () => {
    // Ein Yaakov only collects the Bavli's own aggadot.
    expect(
      classifyParallelLink(
        {
          ref: 'Ein Yaakov, Berakhot 1:2',
          category: 'Midrash',
          index_title: 'Ein Yaakov (Glick Edition)',
        },
        daf,
      ),
    ).toBeNull();
    // The Mishnah this daf quotes, and links back to the same daf.
    expect(
      classifyParallelLink(
        { ref: 'Mishnah Berakhot 1:1', category: 'Mishnah', type: 'mishnah in talmud' },
        daf,
      ),
    ).toBeNull();
    expect(classifyParallelLink({ ref: 'Berakhot 2a:7', category: 'Talmud' }, daf)).toBeNull();
    expect(
      classifyParallelLink({ ref: 'Rashi on Berakhot 2a:1:1', category: 'Commentary' }, daf),
    ).toBeNull();
  });
});

const cand = (
  ref: string,
  source: ParallelCandidate['source'],
  line: number,
): ParallelCandidate => ({
  ref,
  source,
  anchors: [{ segStart: line, segEnd: line }],
  hebrew: 'טקסט',
  english: '',
});

describe('candidatesForLines', () => {
  const all = [
    cand('Leviticus 22:7', 'tanakh', 4),
    cand('Berakhot 9a:10', 'mesorat-hashas', 4),
    cand('Shabbat 34b:1', 'bavli', 6),
    cand('Pesachim 2a:1', 'bavli', 12),
  ];

  it('keeps passages on or within two lines of the story, nearest and strongest first', () => {
    expect(candidatesForLines(all, { start: 3, end: 4 }).map((c) => c.ref)).toEqual([
      'Berakhot 9a:10',
      'Leviticus 22:7',
      'Shabbat 34b:1',
    ]);
  });

  it('offers a Tanakh verse only when it is linked from the story itself', () => {
    const refs = candidatesForLines(all, { start: 5, end: 6 }).map((c) => c.ref);
    expect(refs).toContain('Berakhot 9a:10'); // one line away: still offered
    expect(refs).not.toContain('Leviticus 22:7'); // one line away: a verse of the sugya
  });

  it('formats an empty list plainly', () => {
    expect(formatParallelCandidatesForPrompt(candidatesForLines(all, { start: 20, end: 21 }))).toBe(
      '(Sefaria links no parallel passage to these lines of the daf)',
    );
  });
});

describe('groundParallels', () => {
  const cands = [cand('Jerusalem Talmud Berakhot 1:1:6', 'yerushalmi', 4)];

  it('drops a parallel Sefaria does not link to the story, and respells a kept one', () => {
    const out = groundParallels(
      {
        parallels: [
          { ref: 'Tosefta Berakhot 1:3', kind: 'same-story', note: 'recalled' },
          { ref: 'Yerushalmi Berakhot 1:1:6', kind: 'same-story', note: 'linked' },
        ],
        prose: '',
      },
      cands,
    ) as { parallels: Array<{ ref: string }> };
    expect(out.parallels.map((p) => p.ref)).toEqual(['Jerusalem Talmud Berakhot 1:1:6']);
    expect(sameParallelRef('Yerushalmi Berakhot 1:1:6', 'Jerusalem Talmud Berakhot 1:1:6')).toBe(
      true,
    );
  });

  it('runs as a transform only when the candidates are known', async () => {
    const parsed = { parallels: [{ ref: 'Berakhot 27a' }], prose: '' };
    const ctx = { tractate: 'Berakhot', page: '2a', segmentsHe: [], defId: 'aggadata.parallels' };
    expect((await runPasses(['aggadata-ground'], parsed, ctx)).parsed).toEqual(parsed);
    expect(
      (await runPasses(['aggadata-ground'], parsed, { ...ctx, parallelCandidates: cands })).parsed,
    ).toEqual({ parallels: [], prose: '' });
  });
});

describe('fetchParallelCandidates', () => {
  afterEach(() => vi.restoreAllMocks());

  it('groups links by ref, keeps every line, and reads the exact text', async () => {
    const urls: string[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (url.endsWith('/api/related/Berakhot.2a')) {
        return json({
          links: [
            {
              ref: 'Berakhot 9a:10',
              category: 'Talmud',
              type: 'mesorat hashas',
              anchorRef: 'Berakhot 2a:5',
            },
            {
              ref: 'Berakhot 9a:10',
              category: 'Talmud',
              type: 'mesorat hashas',
              anchorRef: 'Berakhot 2a:6',
            },
            {
              ref: 'Ein Yaakov, Berakhot 1:2',
              category: 'Midrash',
              index_title: 'Ein Yaakov',
              anchorRef: 'Berakhot 2a:5',
            },
            { ref: 'Rashi on Berakhot 2a:5:1', category: 'Commentary', anchorRef: 'Berakhot 2a:5' },
          ],
        });
      }
      return json({
        ref: 'Berakhot 9a:10',
        he: '<b>רבן גמליאל</b> אומר',
        text: 'Rabban Gamliel says',
      });
    });
    const out = await sefariaAPI.fetchParallelCandidates('Berakhot', '2a');
    expect(out).toEqual([
      {
        ref: 'Berakhot 9a:10',
        source: 'mesorat-hashas',
        anchors: [
          { segStart: 4, segEnd: 4 },
          { segStart: 5, segEnd: 5 },
        ],
        hebrew: 'רבן גמליאל אומר',
        english: 'Rabban Gamliel says',
      },
    ]);
    expect(urls.filter((u) => u.includes('/api/texts/'))).toHaveLength(1);
    expect(urls.find((u) => u.includes('/api/texts/'))).toContain('context=0');
  });
});
