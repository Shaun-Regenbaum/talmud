/**
 * linkSelect (@corpus/core/context/linkSelect) — the per-anchor selector +
 * family classifier that turns every view into a projection of the one link
 * graph. Locks the load-bearing matching semantics (the DAF_SEG widening, which
 * silently under-selects whole-daf links if wrong) and the via-aware family
 * mapping (relation alone is lossy for continues/parallels/cites).
 */

import { coordForSeg, dafCoord } from '@corpus/core/context/coord';
import {
  family,
  linksAt,
  linksFromSection,
  type SourcedLink,
} from '@corpus/core/context/linkSelect';
import { describe, expect, it } from 'vitest';

const daf = { tractate: 'Berakhot', page: '2a' };
const next = { tractate: 'Berakhot', page: '2b' };

/** A representative slice of a daf's link graph. */
const flow: SourcedLink = {
  source: coordForSeg(daf, 2),
  relation: 'resolves',
  targets: [coordForSeg(daf, 5)],
  via: 'flow',
};
const continuity: SourcedLink = {
  source: dafCoord(daf),
  relation: 'continues',
  targets: [dafCoord(next)],
  via: 'bridge',
};
const cite: SourcedLink = {
  source: coordForSeg(daf, 3),
  relation: 'cites',
  targets: [dafCoord({ tractate: 'Pesachim', page: '50a' })],
  via: 'context',
};
const parallel: SourcedLink = {
  source: coordForSeg(daf, 3),
  relation: 'parallels',
  targets: [{ tractate: 'Shabbat', page: '31a', seg: 3 }],
  via: 'mesorah',
};
const pesuk: SourcedLink = {
  source: coordForSeg(daf, 3),
  relation: 'cites',
  targets: [{ spine: 'tanach', tractate: 'Genesis', page: '19', seg: 5 }],
  via: 'pesuk',
};
const edges = [flow, continuity, cite, parallel, pesuk];

describe('linksAt — direction', () => {
  it('out: links SOURCED at the coord (exact seg)', () => {
    const got = linksAt(edges, coordForSeg(daf, 2), { dafLevel: false });
    expect(got).toEqual([flow]);
  });

  it('out @ seg3 (exact) returns the three section-3-sourced links', () => {
    const got = linksAt(edges, coordForSeg(daf, 3), { dafLevel: false });
    expect(got).toEqual([cite, parallel, pesuk]);
  });

  it('in: links TARGETING the coord', () => {
    // The whole-daf cite target (Pesachim 50a) is found by querying that daf.
    const got = linksAt(edges, dafCoord({ tractate: 'Pesachim', page: '50a' }), {
      direction: 'in',
    });
    expect(got).toEqual([cite]);
    // An exact off-daf target seg (the parallel's Shabbat 31a:3).
    const got2 = linksAt(edges, { tractate: 'Shabbat', page: '31a', seg: 3 }, { direction: 'in' });
    expect(got2).toEqual([parallel]);
  });

  it('both: source OR target side', () => {
    const got = linksAt(edges, coordForSeg(daf, 5), { direction: 'both', dafLevel: false });
    expect(got).toEqual([flow]); // flow targets seg5
  });
});

describe('linksAt — DAF_SEG widening (dafLevel)', () => {
  it('default dafLevel:true — a per-section query finds the whole-daf continuity source', () => {
    const got = linksAt(edges, coordForSeg(daf, 2), { direction: 'out' });
    expect(got).toContain(flow); // exact seg-2 source
    expect(got).toContain(continuity); // daf-level source, widened in
  });

  it('dafLevel:false — the same query does NOT pull the whole-daf link', () => {
    const got = linksAt(edges, coordForSeg(daf, 2), { direction: 'out', dafLevel: false });
    expect(got).toEqual([flow]);
  });

  it('a placed cite is NOT selected by an off-daf out-query', () => {
    const got = linksAt(edges, coordForSeg({ tractate: 'Pesachim', page: '50a' }, 0), {
      direction: 'out',
    });
    expect(got).toEqual([]); // nothing is SOURCED on Pesachim 50a
  });

  it('keeps spine in the comparison — a tanach target is not matched by a bavli query', () => {
    const got = linksAt(edges, { tractate: 'Genesis', page: '19', seg: 5 }, { direction: 'in' });
    expect(got).toEqual([]); // the pesuk target carries spine:'tanach'; a spine-less query misses it
    const got2 = linksAt(
      edges,
      { spine: 'tanach', tractate: 'Genesis', page: '19', seg: 5 },
      {
        direction: 'in',
      },
    );
    expect(got2).toEqual([pesuk]);
  });
});

describe('linksAt — via / relation filters', () => {
  it('via filter', () => {
    expect(linksAt(edges, coordForSeg(daf, 3), { via: 'mesorah', dafLevel: false })).toEqual([
      parallel,
    ]);
  });

  it('relation filter selects both cites (context + pesuk)', () => {
    expect(linksAt(edges, coordForSeg(daf, 3), { relation: 'cites', dafLevel: false })).toEqual([
      cite,
      pesuk,
    ]);
  });

  it('list filters', () => {
    const got = linksAt(edges, coordForSeg(daf, 3), {
      relation: ['parallels', 'cites'],
      via: ['mesorah', 'pesuk'],
      dafLevel: false,
    });
    expect(got).toEqual([parallel, pesuk]);
  });
});

describe('linksFromSection', () => {
  it('is linksAt with out + dafLevel from the section start seg', () => {
    expect(linksFromSection(edges, daf, 3)).toEqual(
      linksAt(edges, coordForSeg(daf, 3), { direction: 'out', dafLevel: true }),
    );
  });
});

describe('family — via-aware classification', () => {
  it('continues splits on via', () => {
    expect(family({ relation: 'continues', via: 'bridge' })).toBe('continuity');
    expect(family({ relation: 'continues', via: 'flow' })).toBe('flow');
  });

  it('parallels splits cross-text vs in-daf flow', () => {
    expect(family({ relation: 'parallels', via: 'mesorah' })).toBe('parallel');
    expect(family({ relation: 'parallels', via: 'yerushalmi' })).toBe('parallel');
    expect(family({ relation: 'parallels', via: 'flow' })).toBe('flow');
  });

  it('cites splits scripture vs daf cite', () => {
    expect(family({ relation: 'cites', via: 'pesuk' })).toBe('scripture');
    expect(family({ relation: 'cites', via: 'context' })).toBe('citation');
  });

  it('codifies + glosses + plain flow relations', () => {
    expect(family({ relation: 'codifies', via: 'halacha' })).toBe('codification');
    expect(family({ relation: 'glosses', via: 'commentary' })).toBe('gloss');
    expect(family({ relation: 'resolves', via: 'flow' })).toBe('flow');
    expect(family({ relation: 'depends-on' })).toBe('flow');
  });
});
