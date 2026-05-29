/**
 * assembleSugyot (src/lib/typing/assemble.ts): combine per-daf sections +
 * per-daf flow + cross-daf bridges into cross-page sugya units.
 */
import { describe, it, expect } from 'vitest';
import { assembleSugyot, sugyaContaining, type DafForAssembly } from '../../src/lib/typing/assemble';
import { coordForSeg } from '../../src/lib/context/coord';

const d125: DafForAssembly = {
  ref: { tractate: 'Shabbat', page: '125b' },
  sections: [{ startSegIdx: 0, endSegIdx: 3 }, { startSegIdx: 4, endSegIdx: 7 }],
  flow: [{ from: 0, to: 1, kind: 'continues' }], // section 0 -> section 1 within the daf
};
const d126: DafForAssembly = {
  ref: { tractate: 'Shabbat', page: '126a' },
  sections: [{ startSegIdx: 0, endSegIdx: 2 }],
  flow: [],
};

describe('assembleSugyot', () => {
  it('a continuing bridge merges both dapim into ONE cross-page sugya', () => {
    const units = assembleSugyot([d125, d126], [{ continues: true }]);
    expect(units).toHaveLength(1);
    expect(units[0].crossesDaf).toBe(true);
    expect(units[0].dapim.map((d) => d.page)).toEqual(['125b', '126a']);
    expect(units[0].span).toHaveLength(3);
  });

  it('a non-continuing bridge keeps the dapim as separate sugyot', () => {
    const units = assembleSugyot([d125, d126], [{ continues: false }]);
    // 125b's two sections are linked by flow -> one sugya; 126a's lone section -> another.
    expect(units).toHaveLength(2);
    expect(units.some((u) => u.crossesDaf)).toBe(false);
  });

  it('ignores flow edges that reference an out-of-range section index', () => {
    const bad: DafForAssembly = { ref: { tractate: 'Shabbat', page: '125b' }, sections: [{ startSegIdx: 0, endSegIdx: 3 }], flow: [{ from: 0, to: 9, kind: 'continues' }] };
    const units = assembleSugyot([bad], []);
    expect(units).toHaveLength(1); // the single section, edge dropped
  });

  it('sugyaContaining finds the unit holding a coordinate', () => {
    const units = assembleSugyot([d125, d126], [{ continues: true }]);
    const u = sugyaContaining(units, coordForSeg({ tractate: 'Shabbat', page: '126a' }, 0));
    expect(u).not.toBeNull();
    expect(u!.dapim.map((d) => d.page)).toEqual(['125b', '126a']);
    expect(sugyaContaining(units, coordForSeg({ tractate: 'Shabbat', page: '200a' }, 0))).toBeNull();
  });
});
