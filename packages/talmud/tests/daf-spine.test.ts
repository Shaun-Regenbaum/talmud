import { describe, it, expect } from 'vitest';
import { dafSpine } from '../src/lib/context/spine';
import { dafCoord } from '@corpus/core/context/coord';

const DAF = { tractate: 'Berakhot', page: '2b' };

describe('dafSpine — the tractate-spine neighborhood of a daf', () => {
  it('carries the adjacent windows + boundary verdicts through', () => {
    const s = dafSpine(DAF, { prev: '2a', next: '3a', fromPrev: true, toNext: false });
    expect(s).toEqual({
      tractate: 'Berakhot', page: '2b', prev: '2a', next: '3a',
      fromPrev: true, toNext: false, link: null,
    });
  });

  it('expresses forward continuity as a continues Link to the next page', () => {
    const s = dafSpine(DAF, { prev: '2a', next: '3a', fromPrev: false, toNext: true });
    expect(s.link).toEqual({ relation: 'continues', targets: [dafCoord({ tractate: 'Berakhot', page: '3a' })] });
  });

  it('has no link at a tractate edge even if toNext is set (no next page)', () => {
    const s = dafSpine({ tractate: 'Berakhot', page: '64a' }, { prev: '63b', next: null, fromPrev: true, toNext: true });
    expect(s.next).toBeNull();
    expect(s.link).toBeNull();
  });

  it('is fully isolated (fromPrev and toNext are independent)', () => {
    const s = dafSpine(DAF, { prev: '2a', next: '3a', fromPrev: true, toNext: true });
    expect(s.fromPrev).toBe(true);
    expect(s.toNext).toBe(true);
    expect(s.link).not.toBeNull();
  });
});
