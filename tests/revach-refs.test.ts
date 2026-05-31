import { describe, it, expect } from 'vitest';
import { findDafRefs } from '../src/lib/sefref/dafyomi/parse/common';
import { resolveTractateName, resolveDafRef } from '../src/lib/sefref/dafyomi/masechtos';
import { parseRevach } from '../src/lib/sefref/dafyomi/parse/revach';
import { formatContextForPrompt } from '../src/lib/context/select';
import { dafCoord } from '../src/lib/context/coord';
import { fromDafyomi } from '../src/lib/context/fromDafyomi';
import type { ContextItem } from '../src/lib/context/types';
import type { DafyomiDaf } from '../src/lib/sefref/dafyomi/schema';

describe('resolveTractateName — dafyomi prose spelling → canonical', () => {
  it('maps site/prose spellings (incl. tricky ones)', () => {
    expect(resolveTractateName('Berachos')).toBe('Berakhot');
    expect(resolveTractateName('Pesachim')).toBe('Pesachim');
    expect(resolveTractateName('Chulin')).toBe('Chullin');
    expect(resolveTractateName('Bava Kama')).toBe('Bava Kamma');
    expect(resolveTractateName('Rosh Hashana')).toBe('Rosh Hashanah');
    expect(resolveTractateName('Makkos')).toBe('Makkot');
    expect(resolveTractateName('Kerisos')).toBe('Keritot');
  });
  it('strips qualifiers and retries trailing words', () => {
    expect(resolveTractateName('Maseches Pesachim')).toBe('Pesachim');
    expect(resolveTractateName('Mishnah Bava Kama')).toBe('Bava Kamma');
  });
  it('returns null for non-tractates', () => {
    expect(resolveTractateName('Rebbi Eliezer')).toBeNull();
    expect(resolveTractateName('Shema')).toBeNull();
  });
});

describe('resolveDafRef — name + daf, with bounds', () => {
  it('rejects out-of-range dapim', () => {
    expect(resolveDafRef('Pesachim', '999a')).toBeNull(); // Pesachim ends at 121b
    expect(resolveDafRef('Pesachim', '50a')).toEqual({ tractate: 'Pesachim', page: '50a' });
  });
});

describe('findDafRefs — cross-references in English prose', () => {
  it('captures "Tractate (daf)" and "Tractate daf", and qualified names', () => {
    const refs = findDafRefs('As in Maseches Pesachim (50a), and see Bava Kama 12b for more.');
    expect(refs).toEqual([
      { raw: 'Maseches Pesachim 50a', kind: 'gemara', tractate: 'Pesachim', page: '50a' },
      { raw: 'Bava Kama 12b', kind: 'gemara', tractate: 'Bava Kamma', page: '12b' },
    ]);
  });
  it('ignores non-tractates and impossible dapim', () => {
    expect(findDafRefs('Rebbi Eliezer says one may read until Chatzos.')).toEqual([]);
    expect(findDafRefs('Pesachim 999a is not a real daf.')).toEqual([]);
  });
  it('dedupes repeated refs', () => {
    expect(findDafRefs('Pesachim 50a ... again Pesachim (50a)')).toHaveLength(1);
  });
});

describe('parseRevach — populates entry.refs end-to-end', () => {
  const html = `<table><tr>
    <td><center>SUMMARY</center>1. The Mishnah discusses the time for Shema.<br>&nbsp;<br>2. A contradiction is raised.</td>
    <td><center>A BIT MORE</center>1. Rebbi Eliezer says until Chatzos.<br>&nbsp;<br>2. As the Gemara explains in Pesachim (50a), and compare Bava Kama 12b.</td>
  </tr></table>`;
  it('captures cross-refs in the matching entry, leaves others empty', () => {
    const { entries } = parseRevach(html);
    expect(entries).toHaveLength(2);
    expect(entries[0].refs).toBeUndefined();
    expect(entries[1].refs).toEqual([
      { raw: 'Pesachim 50a', kind: 'gemara', tractate: 'Pesachim', page: '50a' },
      { raw: 'Bava Kama 12b', kind: 'gemara', tractate: 'Bava Kamma', page: '12b' },
    ]);
  });
});

describe('fromDafyomi — carries entry.refs onto ContextItem.refs (daf-level coords)', () => {
  it('maps resolved refs to daf-level coordinates, drops unresolved ones', () => {
    const daf = {
      source: { urls: {} },
      amudim: { a: { revach: {
        type: 'revach', amud: 'a', wholeDaf: true,
        body: { type: 'revach', entries: [
          { marker: '1.', level: 0, title: { en: 'cites' }, body: { en: 'see Pesachim 50a' },
            refs: [
              { raw: 'Pesachim 50a', kind: 'gemara', tractate: 'Pesachim', page: '50a' },
              { raw: 'Rashi DH', kind: 'rashi' }, // no tractate/page → dropped
            ] },
          { marker: '2.', level: 0, title: { en: 'no refs' }, body: { en: 'plain' } },
        ] },
      } } },
    } as unknown as DafyomiDaf;
    const items = fromDafyomi(daf).filter((i) => i.source === 'dafyomi:revach');
    expect(items[0].refs).toEqual([{ tractate: 'Pesachim', page: '50a', seg: -1 }]);
    expect(items[1].refs).toBeUndefined();
  });
});

describe('formatContextForPrompt — renders refs as "cites", placement unchanged', () => {
  it('appends cites for a whole-daf Revach item with daf-level refs', () => {
    const item: ContextItem = {
      source: 'dafyomi:revach', sourceLabel: "Revach l'Daf", kind: 'revach', key: 'revach:a:1',
      title: { en: 'A contradiction is raised' }, body: { en: 'See the Gemara.' },
      segs: [], refs: [dafCoord({ tractate: 'Pesachim', page: '50a' })],
    };
    const out = formatContextForPrompt([item]);
    expect(out).toContain('[whole daf] A contradiction is raised');
    expect(out).toContain('(cites Pesachim 50a)');
  });
});
