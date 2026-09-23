import { INK } from '@corpus/ui/palette';
import { describe, expect, it } from 'vitest';
import {
  type CodificationData,
  codeMapFromCodification,
  gutterEdgePath,
  relationStyle,
  SIDE_COLOR,
} from '../src/client/flow/codeMapLayout';

const ruling = (ref: string) => ({ ref, ruling: `ruling for ${ref}` });
const baseCod = (over: Partial<CodificationData> = {}): CodificationData => ({
  mishnehTorah: null,
  tur: null,
  shulchanAruch: null,
  rema: null,
  prose: 'p',
  ...over,
});

describe('relationStyle', () => {
  it('only disagrees is dashed; colours match the Voices/Flow palette', () => {
    expect(relationStyle('disagrees')).toEqual({ color: INK.brick, dash: '5 3' });
    expect(relationStyle('agrees')).toEqual({ color: INK.moss, dash: undefined });
    expect(relationStyle('cites')).toEqual({ color: INK.slate, dash: undefined });
    expect(relationStyle('transmits')).toEqual({ color: '#cfc9bb', dash: undefined });
  });
});

describe('SIDE_COLOR', () => {
  it('maps sides to the shared palette', () => {
    expect(SIDE_COLOR.a).toBe(INK.blue);
    expect(SIDE_COLOR.b).toBe(INK.brick);
    expect(SIDE_COLOR.source).toBe('#3f6212');
    expect(SIDE_COLOR.neutral).toBe(INK.slate);
  });
});

describe('gutterEdgePath', () => {
  it.each([
    [30, 110],
    [110, 30],
    [50, 54],
  ])('keeps full bends for %i → %i', (from, to) => {
    const path = gutterEdgePath(from, to, 300, 340);
    const radii = [...path.matchAll(/A (\d+) (\d+)/g)];
    expect(radii.length).toBeGreaterThanOrEqual(2);
    expect(radii.every((r) => Number(r[1]) >= 12 && Number(r[2]) >= 12)).toBe(true);
    expect(path.startsWith(`M 300 ${from}`)).toBe(true);
    expect(path.endsWith(`L 302 ${to}`)).toBe(true);
  });

  it('moves a cramped lane out to leave room before the arrowhead', () => {
    const path = gutterEdgePath(30, 110, 300, 304);
    const coords = path.match(/ ([-\d.]+) 110 L 302 110$/)!;
    expect(Number(coords[1]) - 302).toBeGreaterThanOrEqual(16);
  });
});

describe('codeMapFromCodification', () => {
  it('builds the gemara→Rambam→Tur→SA spine with cites then transmits, all neutral when undisputed', () => {
    const { nodes, edges } = codeMapFromCodification(
      baseCod({
        mishnehTorah: ruling('Krias Shema 1:9'),
        tur: ruling('OC 235'),
        shulchanAruch: ruling('OC 235:3'),
      }),
      'Berakhot 2a',
    );
    expect(nodes.map((n) => n.id)).toEqual(['gemara', 'mishnehTorah', 'tur', 'shulchanAruch']);
    expect(nodes[0]).toMatchObject({
      label: 'Gemara',
      ref: 'Berakhot 2a',
      side: 'source',
      era: 'source',
    });
    expect(nodes.find((n) => n.id === 'shulchanAruch')).toMatchObject({
      label: 'Shulchan Aruch',
      side: 'neutral',
    });
    expect(edges).toEqual([
      { from: 'gemara', to: 'mishnehTorah', kind: 'cites' },
      { from: 'mishnehTorah', to: 'tur', kind: 'transmits' },
      { from: 'tur', to: 'shulchanAruch', kind: 'transmits' },
    ]);
  });

  it('folds a present Rema into a side-B node with a disagrees edge; SA becomes Mechaber/side-A', () => {
    const { nodes, edges } = codeMapFromCodification(
      baseCod({
        mishnehTorah: ruling('Berakhot 8:1'),
        tur: ruling('OC 202'),
        shulchanAruch: ruling('OC 202:1'),
        rema: ruling('OC 202:1'),
      }),
      'Berakhot 35a',
    );
    expect(nodes.find((n) => n.id === 'shulchanAruch')).toMatchObject({
      label: 'Mechaber',
      side: 'a',
    });
    expect(nodes.find((n) => n.id === 'rema')).toMatchObject({
      label: 'Rema',
      side: 'b',
      ref: 'OC 202:1',
    });
    expect(edges).toContainEqual({ from: 'shulchanAruch', to: 'rema', kind: 'disagrees' });
  });

  it('skips absent codifiers; the first present one is cited from the gemara', () => {
    const { nodes, edges } = codeMapFromCodification(
      baseCod({ shulchanAruch: ruling('YD 87:1') }),
      'Chullin 113b',
    );
    expect(nodes.map((n) => n.id)).toEqual(['gemara', 'shulchanAruch']);
    expect(edges).toEqual([{ from: 'gemara', to: 'shulchanAruch', kind: 'cites' }]);
  });

  it('does not fold in a Rema that has no Shulchan Aruch to gloss (no orphan disagree edge)', () => {
    const { nodes, edges } = codeMapFromCodification(
      baseCod({
        mishnehTorah: ruling('Hil. X 1:1'),
        rema: ruling('OC 99:1'),
      }),
      'Gittin 2a',
    );
    expect(nodes.map((n) => n.id)).toEqual(['gemara', 'mishnehTorah']); // no rema node
    expect(edges.some((e) => e.to === 'rema')).toBe(false);
  });

  it('ignores a ruling with a blank ref', () => {
    const { nodes } = codeMapFromCodification(
      baseCod({ mishnehTorah: { ref: '  ', ruling: 'x' } }),
      'Shabbat 2a',
    );
    expect(nodes.map((n) => n.id)).toEqual(['gemara']);
  });
});
