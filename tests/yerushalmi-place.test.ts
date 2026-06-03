import { describe, it, expect } from 'vitest';
import { matchYerushalmiToSegments } from '../src/lib/context/anchor/yerushalmi';
import type { ContextItem } from '../src/lib/context/types';

function yeruItem(he: string): ContextItem {
  return { source: 'dafyomi:yerushalmi', sourceLabel: 'Yerushalmi', kind: 'yerushalmi', key: 'y:0', body: { he }, segs: [] };
}

describe('matchYerushalmiToSegments', () => {
  // seg 0 = the mishnah (shared verbatim with the Yerushalmi); seg 1 = unrelated.
  const segs = [
    'מאימתי קורין את שמע בערבין משעה שהכהנים נכנסין לאכול בתרומתן עד סוף האשמורה הראשונה',
    'תנא היכא קאי דקתני מאימתי וכו׳',
  ];

  it('places a yerushalmi item on the Bavli segment whose Hebrew it shares verbatim', () => {
    const items = [yeruItem('מתני׳ מאימתי קורין את שמע בערבין משעה שהכהנים נכנסין לאכול')];
    const placed = matchYerushalmiToSegments(items, segs);
    expect(placed).toBe(1);
    expect(items[0].segs).toEqual([0]);
    expect(items[0].via).toBe('yerushalmi-phrase');
    expect(items[0].confidence).toBeGreaterThan(0.5);
  });

  it('leaves a divergent item (no shared verbatim phrase) unplaced — precision over recall', () => {
    const items = [yeruItem('כמה כוכבים יצאו ויהא ודאי לילה רבי פינחס בשם רבי אבא בר פפא')];
    const placed = matchYerushalmiToSegments(items, segs);
    expect(placed).toBe(0);
    expect(items[0].segs).toEqual([]);
    expect(items[0].via).toBeUndefined();
  });

  it('ignores non-yerushalmi items and already-placed items', () => {
    const other: ContextItem = { source: 'dafyomi:background', sourceLabel: 'Background', kind: 'glossary', key: 'b:0', body: { he: 'מאימתי קורין את שמע בערבין' }, segs: [] };
    const already = yeruItem('מאימתי קורין את שמע בערבין משעה שהכהנים');
    already.segs = [2];
    expect(matchYerushalmiToSegments([other, already], segs)).toBe(0);
    expect(other.segs).toEqual([]);
    expect(already.segs).toEqual([2]);
  });
});
