import { describe, it, expect } from 'vitest';
import { citationLink, continuationLink, flowLinks, glossLinks, isLinkRelation, linkLabel, type Link } from '../src/lib/context/link.ts';
import { dafCoord, coordForSeg, spineCoord, DAF_SEG } from '../src/lib/context/coord.ts';
import { formatContextForPrompt } from '../src/lib/context/select.ts';
import type { ContextItem } from '../src/lib/context/types.ts';

describe('citationLink — refs become a Link(relation: cites)', () => {
  it('returns null for no refs', () => {
    expect(citationLink(undefined)).toBeNull();
    expect(citationLink([])).toBeNull();
  });
  it('wraps refs as a cites link, targets preserved', () => {
    const refs = [dafCoord({ tractate: 'Pesachim', page: '50a' })];
    expect(citationLink(refs)).toEqual({ relation: 'cites', targets: refs });
  });
});

describe('continuationLink — the tractate-continuity edge', () => {
  it('is null when there is no next daf (edge of tractate / no continuation)', () => {
    expect(continuationLink(null)).toBeNull();
    expect(continuationLink(undefined)).toBeNull();
  });
  it('targets the next daf at whole-daf level (seg = DAF_SEG)', () => {
    const link = continuationLink({ tractate: 'Shabbat', page: '126a' });
    expect(link).toEqual({ relation: 'continues', targets: [{ tractate: 'Shabbat', page: '126a', seg: DAF_SEG }] });
    expect(linkLabel(link)).toBe('Shabbat 126a'); // daf-level coordLabel, no seg suffix
  });
});

describe('isLinkRelation — guards an untyped kind string', () => {
  it('accepts the modelled relations, rejects others', () => {
    for (const k of ['cites', 'continues', 'resolves', 'depends-on', 'parallels', 'contrasts', 'generalizes', 'glosses']) {
      expect(isLinkRelation(k)).toBe(true);
    }
    expect(isLinkRelation('elaborates')).toBe(false);
    expect(isLinkRelation('')).toBe(false);
  });
});

describe('glossLinks — commentary spines as cross-spine Links', () => {
  const DAF = { tractate: 'Berakhot', page: '2a' };

  it('emits one link per work, sourced on its spine, targeting the deduped daf segs it glosses', () => {
    const works = [
      { title: 'Rashi', comments: [{ anchorSegIdx: 1 }, { anchorSegIdx: 0 }, { anchorSegIdx: 1 }] },
      { title: 'Tosafot', comments: [{ anchorSegIdx: 4 }] },
    ];
    expect(glossLinks(DAF, works)).toEqual([
      { source: spineCoord('Rashi', DAF), link: { relation: 'glosses', targets: [coordForSeg(DAF, 0), coordForSeg(DAF, 1)] } },
      { source: spineCoord('Tosafot', DAF), link: { relation: 'glosses', targets: [coordForSeg(DAF, 4)] } },
    ]);
  });

  it('drops works with no resolvable anchor segment', () => {
    const works = [{ title: 'Meiri', comments: [{ anchorSegIdx: -1 }] }];
    expect(glossLinks(DAF, works)).toEqual([]);
  });

  it('a gloss link labels its source with the spine name', () => {
    expect(linkLabel({ relation: 'glosses', targets: [spineCoord('Rashi', DAF, 3)] }))
      .toBe('Rashi · Berakhot 2a:3');
  });
});

describe('flowLinks — the argument flow graph as Links', () => {
  const G = { tractate: 'Gittin', page: '68a' };
  // Section index -> coordinate (here: index maps to a segment for the test).
  const coordOf = (i: number): ReturnType<typeof coordForSeg> | null =>
    i >= 0 && i < 5 ? coordForSeg(G, i) : null;

  it('maps each edge to {source, link} in the shared vocabulary', () => {
    const out = flowLinks([{ from: 0, to: 1, kind: 'continues' }, { from: 1, to: 3, kind: 'resolves' }], coordOf);
    expect(out).toEqual([
      { source: coordForSeg(G, 0), link: { relation: 'continues', targets: [coordForSeg(G, 1)] } },
      { source: coordForSeg(G, 1), link: { relation: 'resolves', targets: [coordForSeg(G, 3)] } },
    ]);
  });

  it('drops unknown kinds, self-loops, and edges whose endpoint has no coord', () => {
    const out = flowLinks(
      [
        { from: 0, to: 1, kind: 'elaborates' }, // unknown relation
        { from: 2, to: 2, kind: 'continues' },  // self-loop
        { from: 0, to: 9, kind: 'depends-on' }, // target out of range -> no coord
        { from: 3, to: 4, kind: 'parallels' },  // valid
      ],
      coordOf,
    );
    expect(out).toEqual([{ source: coordForSeg(G, 3), link: { relation: 'parallels', targets: [coordForSeg(G, 4)] } }]);
  });
});

describe('linkLabel — compact deduped targets, no relation word', () => {
  it('is empty for an empty/absent link', () => {
    expect(linkLabel(null)).toBe('');
    expect(linkLabel({ relation: 'cites', targets: [] })).toBe('');
  });
  it('daf-level and segment-level coords render distinctly', () => {
    const link: Link = {
      relation: 'cites',
      targets: [dafCoord({ tractate: 'Pesachim', page: '50a' }), coordForSeg({ tractate: 'Shabbat', page: '2a' }, 7)],
    };
    expect(linkLabel(link)).toBe('Pesachim 50a, Shabbat 2a:7');
  });
  it('dedupes repeated targets', () => {
    const c = dafCoord({ tractate: 'Pesachim', page: '50a' });
    expect(linkLabel({ relation: 'cites', targets: [c, { ...c }] })).toBe('Pesachim 50a');
  });
});

describe('formatContextForPrompt — citation fragment is byte-stable through the Link path', () => {
  it('renders "(cites Pesachim 50a)" exactly (the prompt the LLM sees)', () => {
    const item: ContextItem = {
      source: 'dafyomi:revach', sourceLabel: "Revach l'Daf", kind: 'revach', key: 'revach:a:1',
      title: { en: 'A contradiction is raised' }, body: { en: 'See the Gemara.' },
      segs: [], refs: [dafCoord({ tractate: 'Pesachim', page: '50a' })],
    };
    expect(formatContextForPrompt([item]))
      .toBe("## Revach l'Daf\n- [whole daf] A contradiction is raised: See the Gemara. (cites Pesachim 50a)");
  });
});
