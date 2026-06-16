/**
 * sectionExits — bucketing a daf's links onto its sections as exit markers.
 * Locks the family gate (flow/continuity/gloss are NOT markers) and the
 * "greatest start ≤ source seg" range assignment.
 */

import { coordForSeg, dafCoord } from '@corpus/core/context/coord';
import { describe, expect, it } from 'vitest';
import type { DafLink } from '../src/lib/context/dafLinks';
import { sectionExits } from '../src/lib/context/sectionExits';

const DAF = { tractate: 'Berakhot', page: '2a' };

const flow: DafLink = {
  via: 'flow',
  source: coordForSeg(DAF, 2),
  relation: 'resolves',
  targets: [coordForSeg(DAF, 5)],
};
const continuity: DafLink = {
  via: 'bridge',
  source: dafCoord(DAF),
  relation: 'continues',
  targets: [dafCoord({ tractate: 'Berakhot', page: '2b' })],
};
const cite: DafLink = {
  via: 'context',
  source: coordForSeg(DAF, 2),
  relation: 'cites',
  targets: [dafCoord({ tractate: 'Pesachim', page: '50a' })],
  note: "Revach l'Daf",
};
const scripture: DafLink = {
  via: 'pesuk',
  source: coordForSeg(DAF, 4),
  relation: 'cites',
  targets: [{ spine: 'tanach', tractate: 'Genesis', page: '19', seg: 5 }],
  note: 'Genesis 19:5',
};
const codification: DafLink = {
  via: 'halacha',
  source: coordForSeg(DAF, 4),
  relation: 'codifies',
  targets: [{ spine: 'mishneh-torah', tractate: 'Reading the Shema', page: '1', seg: 1 }],
};
const parallel: DafLink = {
  via: 'mesorah',
  source: coordForSeg(DAF, 6),
  relation: 'parallels',
  targets: [{ tractate: 'Shabbat', page: '31a', seg: 3 }],
};

describe('sectionExits', () => {
  it('buckets marker families by section range, dropping flow + continuity', () => {
    const out = sectionExits(
      [0, 5, 9],
      [flow, continuity, cite, scripture, codification, parallel],
    );
    // section 0 [0,5): cite(2), scripture(4), codification(4)
    expect(out[0].map((e) => e.family)).toEqual(['citation', 'scripture', 'codification']);
    // section 1 [5,9): parallel(6)
    expect(out[1].map((e) => e.family)).toEqual(['parallel']);
    // section 2 [9,..): nothing
    expect(out[2]).toEqual([]);
  });

  it('carries the full chip payload', () => {
    const out = sectionExits([0, 5, 9], [scripture]);
    expect(out[0][0]).toEqual({
      family: 'scripture',
      relation: 'cites',
      via: 'pesuk',
      target: { spine: 'tanach', tractate: 'Genesis', page: '19', seg: 5 },
      note: 'Genesis 19:5',
    });
  });

  it('emits one chip per target', () => {
    const multi: DafLink = {
      via: 'context',
      source: coordForSeg(DAF, 1),
      relation: 'cites',
      targets: [
        dafCoord({ tractate: 'Pesachim', page: '50a' }),
        dafCoord({ tractate: 'Gittin', page: '6a' }),
      ],
    };
    const out = sectionExits([0], [multi]);
    expect(out[0]).toHaveLength(2);
  });

  it('falls a daf-level-sourced link to the first section', () => {
    const unplaced: DafLink = { ...cite, source: dafCoord(DAF) };
    const out = sectionExits([0, 5], [unplaced]);
    expect(out[0]).toHaveLength(1);
    expect(out[1]).toEqual([]);
  });

  it('is empty when there are no sections', () => {
    expect(sectionExits([], [scripture])).toEqual([]);
  });
});
