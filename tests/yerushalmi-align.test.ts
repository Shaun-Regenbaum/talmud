import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDafyomiContent } from '../src/lib/sefref/dafyomi/parse/index';
import {
  flattenYerushalmiOutline, alignOutlineToSegments, yerushalmiRefToSefaria,
  yerushalmiFloorGroups, MIN_FLOOR_RUN,
  type YerushalmiOutlinePoint,
} from '../src/lib/yerushalmiAlign';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/dafyomi/${name}`, import.meta.url), 'utf-8');

describe('yerushalmiRefToSefaria', () => {
  it('builds a same-tractate Sefaria ref from perek:halachah', () => {
    expect(yerushalmiRefToSefaria({ raw: 'Yerushalmi Perek 1 Halachah 1 Daf 1a', kind: 'yerushalmi', detail: '1:1' }, 'Berakhot'))
      .toBe('Jerusalem Talmud Berakhot 1:1');
  });
  it('maps a cross-tractate ref to its Sefaria spelling', () => {
    expect(yerushalmiRefToSefaria({ raw: 'Yerushalmi Terumos ...', kind: 'yerushalmi', tractate: 'Terumos', detail: '4:1' }, 'Chullin'))
      .toBe('Jerusalem Talmud Terumot 4:1');
  });
  it('returns undefined without a perek:halachah', () => {
    expect(yerushalmiRefToSefaria({ raw: 'x', kind: 'yerushalmi', detail: 'Halachah 7' }, 'Bava Metzia')).toBeUndefined();
  });
});

describe('flatten + align Yerushalmi outline to Bavli segments', () => {
  const body = parseDafyomiContent('yerushalmi', fixture('berachos-yerushalmi-002.htm')).blocks[0].body;
  if (body.type !== 'yerushalmi') throw new Error('wrong body type');
  const points = flattenYerushalmiOutline(body.entries, 'Berakhot');

  it('flattens to leaf points carrying topic + Sefaria ref', () => {
    expect(points.length).toBeGreaterThan(5);
    expect(points.every((p) => p.he.length > 0)).toBe(true);
    expect(points[0].yerushalmiRef).toBe('Jerusalem Talmud Berakhot 1:1');
    expect(points[0].topic).toBe("THE TIME FOR KERI'AS SHMA AT NIGHT");
  });

  it('anchors a point whose Yerushalmi text is verbatim-shared with a Bavli segment', () => {
    // seg 0 = the mishnah (shared), seg 1 = a divergent gemara line.
    const segs = [
      'מאימתי קורין את שמע בערבין משעה שהכהנים נכנסין לאכול בתרומתן עד סוף האשמורה הראשונה',
      'תנא היכא קאי דקתני מאימתי וכו׳ והיכא קתני דאיירי בקריאת שמע',
    ];
    const copy: YerushalmiOutlinePoint[] = points.map((p) => ({ ...p }));
    alignOutlineToSegments(copy, segs);
    const mishnahPoint = copy.find((p) => /מאימתי קורין/.test(p.he));
    expect(mishnahPoint?.segIdx).toBe(0);
    expect((mishnahPoint?.score ?? 0)).toBeGreaterThanOrEqual(3);
    expect(mishnahPoint?.excerpt).toContain('מאימתי');
  });

  it('leaves a point with no shared verbatim phrase unanchored (precision over recall)', () => {
    const segs = ['טקסט בבלי שאין לו שום קשר מילולי לטקסט הירושלמי הזה כלל ועיקר'];
    const copy: YerushalmiOutlinePoint[] = points.map((p) => ({ ...p }));
    alignOutlineToSegments(copy, segs);
    expect(copy.every((p) => p.segIdx === undefined)).toBe(true);
  });
});

describe('yerushalmiFloorGroups — guaranteed anchors from strong verbatim runs', () => {
  const pt = (segIdx: number, score: number, ref: string, extra: Partial<YerushalmiOutlinePoint> = {}): YerushalmiOutlinePoint =>
    ({ topic: 'T', yerushalmiRef: ref, he: 'x', en: 'x', segIdx, score, excerpt: `seg${segIdx}`, ...extra });

  it('floors a span whose run meets MIN_FLOOR_RUN', () => {
    const groups = yerushalmiFloorGroups([pt(0, MIN_FLOOR_RUN, 'JT A 1:1')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ startSegIdx: 0, endSegIdx: 0, yerushalmiRef: 'JT A 1:1', topScore: MIN_FLOOR_RUN });
  });

  it('drops a weak run below the floor (a stray formulaic match)', () => {
    expect(yerushalmiFloorGroups([pt(5, MIN_FLOOR_RUN - 1, 'JT A 1:1')])).toHaveLength(0);
  });

  it('ignores unplaced points', () => {
    expect(yerushalmiFloorGroups([{ topic: 'T', he: 'x', en: 'x' }])).toHaveLength(0);
  });

  it('merges adjacent same-ref strong points into one span, splits on a gap or a new ref', () => {
    const groups = yerushalmiFloorGroups([
      pt(0, 10, 'JT A 1:1'),
      pt(1, 8, 'JT A 1:1'),   // adjacent, same ref -> merges with seg 0
      pt(6, 9, 'JT A 1:1'),   // gap > FLOOR_MERGE_GAP -> new span
      pt(7, 7, 'JT A 2:1'),   // adjacent but different ref -> new span
    ]);
    expect(groups.map((g) => [g.startSegIdx, g.endSegIdx, g.yerushalmiRef]))
      .toEqual([[0, 1, 'JT A 1:1'], [6, 6, 'JT A 1:1'], [7, 7, 'JT A 2:1']]);
    expect(groups[0].topScore).toBe(10);
    expect(groups[0].points).toHaveLength(2);
  });
});
