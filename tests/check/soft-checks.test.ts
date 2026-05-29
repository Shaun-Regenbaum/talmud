/**
 * A3 — the soft, observe-only validators in the check registry:
 *   anchor-verbatim  — resolved excerpt is literally present in its segment
 *   partition-clean  — no inverted ranges / duplicates / section overlaps
 *   edge-integrity   — argument.voices graph is well-formed
 * All emit `severity: 'soft'` so they never gate the cache; these tests pin the
 * detection logic and the soft severity.
 */
import { describe, it, expect } from 'vitest';
import { runChecks, type CheckCtx, type CheckIssue } from '../../src/lib/check/postcheck';

const ctx = (over: Partial<CheckCtx> = {}): CheckCtx => ({ tractate: 'Gittin', page: '67b', segmentsHe: [], defId: 'x', ...over });
const kinds = (issues: CheckIssue[]) => issues.map((i) => i.kind).sort();
const allSoft = (issues: CheckIssue[]) => issues.every((i) => i.severity === 'soft');

describe('anchor-verbatim', () => {
  const segs = ['בני אדם שׁוטה', 'תנו רבנן המביא גט', 'אמר רבא הלכה כרבי'];

  it('passes when each excerpt is present in its claimed segment', async () => {
    const parsed = { instances: [{ startSegIdx: 1, fields: { excerpt: 'תנו רבנן' } }, { startSegIdx: 2, fields: { excerpt: 'אמר רבא' } }] };
    const { issues } = await runChecks(['anchor-verbatim'], parsed, ctx({ segmentsHe: segs, defId: 'argument' }));
    expect(issues).toEqual([]);
  });

  it('flags an excerpt that is not in its segment (hallucination/prefix fallback)', async () => {
    const parsed = { instances: [{ startSegIdx: 1, fields: { excerpt: 'מילים שלא קיימות' } }] };
    const { issues } = await runChecks(['anchor-verbatim'], parsed, ctx({ segmentsHe: segs, defId: 'argument' }));
    expect(kinds(issues)).toEqual(['excerpt-not-in-segment']);
    expect(allSoft(issues)).toBe(true);
    expect(issues[0].index).toBe(1);
  });

  it('flags an out-of-range anchor', async () => {
    const parsed = { instances: [{ startSegIdx: 99, fields: { excerpt: 'תנו רבנן' } }] };
    const { issues } = await runChecks(['anchor-verbatim'], parsed, ctx({ segmentsHe: segs, defId: 'argument' }));
    expect(kinds(issues)).toEqual(['anchor-out-of-range']);
  });

  it('skips excerpts shorter than 2 words and missing excerpts', async () => {
    const parsed = { instances: [{ startSegIdx: 0, fields: { excerpt: 'שׁוטה' } }, { startSegIdx: 0, fields: {} }] };
    const { issues } = await runChecks(['anchor-verbatim'], parsed, ctx({ segmentsHe: segs, defId: 'argument' }));
    expect(issues).toEqual([]);
  });

  it('ignores nikud/punctuation differences (normalized match)', async () => {
    const parsed = { instances: [{ startSegIdx: 1, fields: { excerpt: 'תְּנוּ, רַבָּנַן' } }] };
    const { issues } = await runChecks(['anchor-verbatim'], parsed, ctx({ segmentsHe: segs, defId: 'argument' }));
    expect(issues).toEqual([]);
  });
});

describe('partition-clean', () => {
  it('flags an inverted range', async () => {
    const parsed = { instances: [{ startSegIdx: 5, endSegIdx: 2, fields: { excerpt: 'aaa bbb' } }] };
    const { issues } = await runChecks(['partition-clean'], parsed, ctx({ defId: 'argument-move' }));
    expect(kinds(issues)).toContain('inverted-range');
    expect(allSoft(issues)).toBe(true);
  });

  it('flags an exact duplicate instance', async () => {
    const dup = { startSegIdx: 3, endSegIdx: 4, fields: { excerpt: 'אמר רבא הלכה' } };
    const { issues } = await runChecks(['partition-clean'], { instances: [dup, { ...dup }] }, ctx({ defId: 'argument-move' }));
    expect(kinds(issues)).toEqual(['duplicate-instance']);
  });

  it('flags overlapping section ranges only for the argument mark', async () => {
    const overlapping = { instances: [{ startSegIdx: 0, endSegIdx: 3, fields: {} }, { startSegIdx: 2, endSegIdx: 5, fields: {} }] };
    const asArgument = await runChecks(['partition-clean'], overlapping, ctx({ defId: 'argument' }));
    expect(kinds(asArgument.issues)).toEqual(['section-overlap']);
    // Same shape under argument-move: overlaps are legitimate (moves share segments).
    const asMove = await runChecks(['partition-clean'], overlapping, ctx({ defId: 'argument-move' }));
    expect(asMove.issues).toEqual([]);
  });

  it('passes a clean partition', async () => {
    const parsed = { instances: [{ startSegIdx: 0, endSegIdx: 2, fields: { excerpt: 'a a' } }, { startSegIdx: 3, endSegIdx: 5, fields: { excerpt: 'b b' } }] };
    const { issues } = await runChecks(['partition-clean'], parsed, ctx({ defId: 'argument' }));
    expect(issues).toEqual([]);
  });
});

describe('edge-integrity', () => {
  const voices = [{ name: 'Rava' }, { name: 'Abaye' }, { name: 'Sages' }];

  it('passes a well-formed graph', async () => {
    const parsed = { voices, edges: [{ from: 'Rava', to: 'Abaye', kind: 'opposes' }, { from: 'Sages', to: 'Rava', kind: 'supports' }] };
    const { issues } = await runChecks(['edge-integrity'], parsed, ctx({ defId: 'argument.voices' }));
    expect(issues).toEqual([]);
  });

  it('flags an edge referencing an unknown voice', async () => {
    const parsed = { voices, edges: [{ from: 'Rava', to: 'Rav Ashi', kind: 'opposes' }] };
    const { issues } = await runChecks(['edge-integrity'], parsed, ctx({ defId: 'argument.voices' }));
    expect(kinds(issues)).toEqual(['edge-unknown-voice']);
    expect(allSoft(issues)).toBe(true);
  });

  it('flags a self-loop', async () => {
    const parsed = { voices, edges: [{ from: 'Rava', to: 'Rava', kind: 'responds-to' }] };
    const { issues } = await runChecks(['edge-integrity'], parsed, ctx({ defId: 'argument.voices' }));
    expect(kinds(issues)).toEqual(['edge-self-loop']);
  });

  it('flags a contradictory opposes+supports on the same pair (either direction)', async () => {
    const parsed = { voices, edges: [{ from: 'Rava', to: 'Abaye', kind: 'opposes' }, { from: 'Abaye', to: 'Rava', kind: 'supports' }] };
    const { issues } = await runChecks(['edge-integrity'], parsed, ctx({ defId: 'argument.voices' }));
    expect(kinds(issues)).toContain('edge-contradiction');
  });

  it('tolerates an empty / missing graph', async () => {
    const { issues } = await runChecks(['edge-integrity'], { voices, edges: [] }, ctx({ defId: 'argument.voices' }));
    expect(issues).toEqual([]);
    const { issues: i2 } = await runChecks(['edge-integrity'], {}, ctx({ defId: 'argument.voices' }));
    expect(i2).toEqual([]);
  });
});
