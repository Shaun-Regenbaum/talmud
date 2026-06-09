import { describe, expect, it } from 'vitest';
import {
  curatedParallelsForDaf,
  curatedYerushalmiDataset,
  parseBavliRef,
} from '../src/lib/yerushalmiParallels';

describe('curated Bavli<->Yerushalmi parallels', () => {
  it('parses single-daf and multi-daf Bavli refs (incl. space-name tractates)', () => {
    expect(parseBavliRef('Bava Metzia 59a:12-59b:7')).toEqual({
      tractate: 'Bava Metzia',
      start: '59a',
      end: '59b',
    });
    expect(parseBavliRef('Rosh Hashanah 29b:10')).toEqual({
      tractate: 'Rosh Hashanah',
      start: '29b',
      end: '29b',
    });
    expect(parseBavliRef('Moed Katan 20a:10-11')).toEqual({
      tractate: 'Moed Katan',
      start: '20a',
      end: '20a',
    });
    expect(parseBavliRef('Sukkah 30a:3')).toEqual({ tractate: 'Sukkah', start: '30a', end: '30a' });
  });

  it('matches a daf inside a multi-daf range (Achnai spans 59a-59b)', () => {
    expect(curatedParallelsForDaf('Bava Metzia', '59a').map((p) => p.sheetId)).toEqual([364518]);
    expect(curatedParallelsForDaf('Bava Metzia', '59b').map((p) => p.sheetId)).toEqual([364518]);
    // just outside the range
    expect(curatedParallelsForDaf('Bava Metzia', '58b')).toEqual([]);
    expect(curatedParallelsForDaf('Bava Metzia', '60a')).toEqual([]);
  });

  it('matches single-daf parallels and rejects the wrong amud/tractate', () => {
    expect(curatedParallelsForDaf('Rosh Hashanah', '29b').map((p) => p.yerushalmi)).toEqual([
      'Jerusalem Talmud Rosh Hashanah 4:1:2',
    ]);
    expect(curatedParallelsForDaf('Rosh Hashanah', '29a')).toEqual([]);
    expect(curatedParallelsForDaf('Sukkah', '30a').map((p) => p.sheetId)).toEqual([366375]);
    // right daf, wrong tractate
    expect(curatedParallelsForDaf('Berakhot', '30a')).toEqual([]);
  });

  it('every dataset entry has a Yerushalmi target and a parseable Bavli ref', () => {
    const ds = curatedYerushalmiDataset();
    expect(ds.parallels.length).toBe(ds.count);
    for (const p of ds.parallels) {
      expect(p.yerushalmi.startsWith('Jerusalem Talmud')).toBe(true);
      expect(parseBavliRef(p.bavli)).not.toBeNull();
    }
  });
});
