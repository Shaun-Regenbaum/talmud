import { describe, expect, it } from 'vitest';
import { type AnchorCoord, DAF_SEG, type DafRef } from '../src/context/coord.ts';
import type { SegMatch } from '../src/context/match.ts';
import { placementOf } from '../src/context/placement.ts';
import type { ContextItem } from '../src/context/types.ts';
import {
  anchorFromContextItem,
  anchorFromCoord,
  anchorFromSpan,
  anchorsFromAnchorOutput,
  anchorsFromContextItem,
  coordFromAnchor,
  type LegacyAnchorOutput,
  refinementFromSegMatch,
  spineIdOfCoord,
} from '../src/model/compat.ts';

const daf: DafRef = { tractate: 'Berakhot', page: '2a' };

function item(over: Partial<ContextItem>): ContextItem {
  return {
    source: 'dafyomi-insights',
    sourceLabel: 'Insights',
    kind: 'note',
    key: 'k1',
    segs: [],
    ...over,
  };
}

describe('AnchorCoord <-> Anchor', () => {
  it('segment coord round-trips', () => {
    const c: AnchorCoord = { tractate: 'Gittin', page: '67b', seg: 4 };
    const a = anchorFromCoord(c);
    expect(a).toEqual({
      spine: 'bavli',
      span: [{ path: ['Gittin', '67b', 4] }],
      precision: 'segment',
    });
    expect(coordFromAnchor(a)).toEqual(c);
  });

  it('DAF_SEG coord becomes a truncated unit path and round-trips', () => {
    const c: AnchorCoord = { tractate: 'Pesachim', page: '50a', seg: DAF_SEG };
    const a = anchorFromCoord(c);
    expect(a).toEqual({
      spine: 'bavli',
      span: [{ path: ['Pesachim', '50a'] }],
      precision: 'unit',
    });
    expect(coordFromAnchor(a)).toEqual(c);
  });

  it('commentary-spine coord round-trips with its spine', () => {
    const c: AnchorCoord = { tractate: 'Berakhot', page: '2a', seg: DAF_SEG, spine: 'Rashi' };
    expect(spineIdOfCoord(c)).toBe('Rashi');
    const a = anchorFromCoord(c);
    expect(a.spine).toBe('Rashi');
    expect(a.precision).toBe('unit');
    expect(coordFromAnchor(a)).toEqual(c);
  });

  it('coordFromAnchor is null for non-representable anchors', () => {
    expect(
      coordFromAnchor({
        spine: 'bavli',
        span: [{ path: ['Berakhot', '2a', 1] }, { path: ['Berakhot', '2a', 2] }],
        precision: 'segment',
      }),
    ).toBeNull();
    expect(
      coordFromAnchor({
        spine: 'bavli',
        span: [{ start: { path: ['Berakhot', '2a', 1] }, end: { path: ['Berakhot', '2a', 2] } }],
        precision: 'segment',
      }),
    ).toBeNull();
    expect(
      coordFromAnchor({
        spine: 'external:url',
        span: [{ path: ['https://example.com'] }],
        precision: 'external',
      }),
    ).toBeNull();
  });

  it('anchorFromSpan normalizes and derives precision from DAF_SEG presence', () => {
    const segSpan = anchorFromSpan([
      { tractate: 'Berakhot', page: '2a', seg: 3 },
      { tractate: 'Berakhot', page: '2a', seg: 1 },
      { tractate: 'Berakhot', page: '2a', seg: 3 },
    ]);
    expect(segSpan.precision).toBe('segment');
    expect(segSpan.span).toEqual([
      { path: ['Berakhot', '2a', 1] },
      { path: ['Berakhot', '2a', 3] },
    ]);

    const mixed = anchorFromSpan([
      { tractate: 'Berakhot', page: '2a', seg: 1 },
      { tractate: 'Pesachim', page: '50a', seg: DAF_SEG },
    ]);
    expect(mixed.precision).toBe('unit');
    expect(mixed.span).toContainEqual({ path: ['Pesachim', '50a'] });
  });
});

describe('ContextItem -> Anchor (placementOf parity)', () => {
  it('segment placement: level segment -> precision segment, via/confidence carried', () => {
    const it_ = item({ segs: [2, 5], via: 'tosfos-dh', confidence: 0.9 });
    expect(placementOf(it_, daf)?.level).toBe('segment');
    const a = anchorFromContextItem(it_, daf);
    expect(a).toEqual({
      spine: 'bavli',
      span: [{ path: ['Berakhot', '2a', 2] }, { path: ['Berakhot', '2a', 5] }],
      precision: 'segment',
      via: 'tosfos-dh',
      confidence: 0.9,
    });
  });

  it('amud-only placement: level amud -> precision division (amud letter lossy, recoverable from item.amud)', () => {
    const it_ = item({ amud: 'b', via: 'mishnah' });
    expect(placementOf(it_, daf)?.level).toBe('amud');
    const a = anchorFromContextItem(it_, daf);
    expect(a).toEqual({
      spine: 'bavli',
      span: [{ path: ['Berakhot', '2a'] }],
      precision: 'division',
      via: 'mishnah',
    });
    // The accepted loss: the anchor path does not encode WHICH amud.
    expect(JSON.stringify(a)).not.toContain('"b"');
    expect(it_.amud).toBe('b');
  });

  it('deliberate whole-daf placement: level daf -> precision unit', () => {
    const it_ = item({ via: 'ai', confidence: 0.6 });
    expect(placementOf(it_, daf)?.level).toBe('daf');
    const a = anchorFromContextItem(it_, daf);
    expect(a).toEqual({
      spine: 'bavli',
      span: [{ path: ['Berakhot', '2a'] }],
      precision: 'unit',
      via: 'ai',
      confidence: 0.6,
    });
  });

  it('an unplaced item (no segs, no amud, no via) bridges to null, like placementOf', () => {
    const it_ = item({});
    expect(placementOf(it_, daf)).toBeNull();
    expect(anchorFromContextItem(it_, daf)).toBeNull();
  });

  it('cross-daf: the coord becomes a SECOND anchor whose unit path differs from the daf in view', () => {
    const it_ = item({
      segs: [1],
      via: 'ai',
      coord: { tractate: 'Gittin', page: '68a', seg: 2 },
    });
    expect(placementOf(it_, daf)?.level).toBe('cross-daf');
    const anchors = anchorsFromContextItem(it_, daf);
    expect(anchors).toHaveLength(2);
    expect(anchors[0].span[0]).toEqual({ path: ['Berakhot', '2a', 1] });
    const coordAnchor = anchors[1];
    expect(coordAnchor.precision).toBe('segment');
    const [t, p] = (coordAnchor.span[0] as { path: (string | number)[] }).path;
    expect([t, p]).not.toEqual([daf.tractate, daf.page]);
  });

  it('anchorsFromContextItem with no coord is just the placement anchor', () => {
    const anchors = anchorsFromContextItem(item({ segs: [0], via: 'pieceKeys' }), daf);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].precision).toBe('segment');
  });
});

describe('SegMatch -> refinement artifact', () => {
  it('segs match -> segment anchor with via/confidence', () => {
    const m: SegMatch = { key: 'k1', segs: [4, 2, 4], via: 'ai', confidence: 0.8 };
    const r = refinementFromSegMatch(m, daf, 'art-1');
    expect(r.kind).toBe('anchor-refinement');
    expect(r.body.targetArtifactId).toBe('art-1');
    expect(r.body.anchor).toEqual({
      spine: 'bavli',
      span: [{ path: ['Berakhot', '2a', 2] }, { path: ['Berakhot', '2a', 4] }],
      precision: 'segment',
      via: 'ai',
      confidence: 0.8,
    });
    expect(r.provenance).toEqual({
      authority: 'ai',
      producerId: 'matcher:ai',
      inputs: [],
      createdAt: '',
    });
  });

  it('wholeDaf match -> unit anchor; deterministic via -> rule authority', () => {
    const m: SegMatch = { key: 'k2', segs: [], via: 'tosfos-dh', wholeDaf: true };
    const r = refinementFromSegMatch(m, daf, 'art-2');
    expect(r.body.anchor.precision).toBe('unit');
    expect(r.body.anchor.span).toEqual([{ path: ['Berakhot', '2a'] }]);
    expect(r.provenance.authority).toBe('rule');
    expect(r.provenance.producerId).toBe('matcher:tosfos-dh');
  });

  it('coord-only match -> the cross-daf anchor', () => {
    const m: SegMatch = {
      key: 'k3',
      segs: [],
      via: 'ai',
      coord: { tractate: 'Gittin', page: '67b', seg: 4 },
    };
    const r = refinementFromSegMatch(m, daf, 'art-3');
    expect(r.body.anchor.span).toEqual([{ path: ['Gittin', '67b', 4] }]);
    expect(r.body.anchor.precision).toBe('segment');
    expect(r.body.anchor.via).toBe('ai');
  });

  it('throws on an unplaced (no-op) match', () => {
    const m: SegMatch = { key: 'k4', segs: [], via: 'ai' };
    expect(() => refinementFromSegMatch(m, daf, 'art-4')).toThrow(/no placement/);
  });
});

describe('AnchorOutput -> Anchor[] (all 7 variants)', () => {
  it('segment', () => {
    expect(anchorsFromAnchorOutput({ segIdx: 3 }, daf)).toEqual([
      { spine: 'bavli', span: [{ path: ['Berakhot', '2a', 3] }], precision: 'segment' },
    ]);
  });

  it('segment-range', () => {
    expect(anchorsFromAnchorOutput({ startSegIdx: 2, endSegIdx: 6 }, daf)).toEqual([
      {
        spine: 'bavli',
        span: [{ start: { path: ['Berakhot', '2a', 2] }, end: { path: ['Berakhot', '2a', 6] } }],
        precision: 'segment',
      },
    ]);
  });

  it('phrase with indices -> token precision with tokens + excerpt', () => {
    expect(
      anchorsFromAnchorOutput({ excerpt: 'אביי', segIdx: 1, tokenStart: 4, tokenEnd: 5 }, daf),
    ).toEqual([
      {
        spine: 'bavli',
        span: [{ path: ['Berakhot', '2a', 1], tokens: [4, 5], excerpt: 'אביי' }],
        precision: 'token',
      },
    ]);
  });

  it('phrase without segIdx -> unit precision (the excerpt floats on the daf)', () => {
    expect(anchorsFromAnchorOutput({ excerpt: 'אביי' }, daf)).toEqual([
      {
        spine: 'bavli',
        span: [{ path: ['Berakhot', '2a'], excerpt: 'אביי' }],
        precision: 'unit',
      },
    ]);
  });

  it('phrase with segIdx but NO token bounds -> segment precision (claims only what it locates)', () => {
    // Most runtime phrase instances carry excerpt + segIdx only; token
    // positions resolve client-side. The anchor must not claim 'token'
    // precision it cannot back with a token window.
    expect(anchorsFromAnchorOutput({ excerpt: 'אביי', segIdx: 1 }, daf)).toEqual([
      {
        spine: 'bavli',
        span: [{ path: ['Berakhot', '2a', 1], excerpt: 'אביי' }],
        precision: 'segment',
      },
    ]);
  });

  it('multi-anchor -> one anchor per sub-anchor', () => {
    const anchors = anchorsFromAnchorOutput(
      {
        anchors: [
          { excerpt: 'A', segIdx: 0, tokenStart: 0, tokenEnd: 1 },
          { excerpt: 'A', segIdx: 8, tokenStart: 3, tokenEnd: 4 },
        ],
        relation: 'inclusio',
      },
      daf,
    );
    expect(anchors).toHaveLength(2);
    expect(anchors.every((a) => a.precision === 'token')).toBe(true);
  });

  it('cross-daf -> source anchor + target anchor (segment when segIdx present)', () => {
    const out: LegacyAnchorOutput = {
      source: { startSegIdx: 1, endSegIdx: 2 },
      target: { tractate: 'Pesachim', page: '50a', segIdx: 7 },
    };
    const anchors = anchorsFromAnchorOutput(out, daf);
    expect(anchors).toHaveLength(2);
    expect(anchors[0].precision).toBe('segment');
    expect(anchors[1]).toEqual({
      spine: 'bavli',
      span: [{ path: ['Pesachim', '50a', 7] }],
      precision: 'segment',
    });
  });

  it('cross-daf target without segIdx -> unit target', () => {
    const anchors = anchorsFromAnchorOutput(
      {
        source: { excerpt: 'תניא', segIdx: 0 },
        target: { tractate: 'Pesachim', page: '50a' },
      },
      daf,
    );
    expect(anchors[1]).toEqual({
      spine: 'bavli',
      span: [{ path: ['Pesachim', '50a'] }],
      precision: 'unit',
    });
  });

  it('external -> source anchor + external-spine anchor', () => {
    const anchors = anchorsFromAnchorOutput(
      {
        source: { excerpt: 'חרובא', segIdx: 5 },
        url: 'https://en.wikipedia.org/wiki/Carob',
        resource_kind: 'article',
      },
      daf,
    );
    expect(anchors).toHaveLength(2);
    expect(anchors[1]).toEqual({
      spine: 'external:article',
      span: [{ path: ['https://en.wikipedia.org/wiki/Carob'] }],
      precision: 'external',
    });
  });

  it('external without resource_kind defaults the spine to external:url', () => {
    const anchors = anchorsFromAnchorOutput(
      { source: { excerpt: 'x', segIdx: 0 }, url: 'https://example.com' },
      daf,
    );
    expect(anchors[1].spine).toBe('external:url');
  });

  it('whole-daf -> the truncated unit path', () => {
    expect(anchorsFromAnchorOutput({ _: 'whole-daf' }, daf)).toEqual([
      { spine: 'bavli', span: [{ path: ['Berakhot', '2a'] }], precision: 'unit' },
    ]);
  });

  it('a commentary spine flows through', () => {
    const anchors = anchorsFromAnchorOutput({ segIdx: 2 }, daf, 'rashi');
    expect(anchors[0].spine).toBe('rashi');
  });
});
