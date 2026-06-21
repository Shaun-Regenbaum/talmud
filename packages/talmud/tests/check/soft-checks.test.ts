/**
 * A3 — the anchor/graph/partition validators in the check registry:
 *   anchor-verbatim  — resolved excerpt is literally present in its segment
 *   partition-clean  — no inverted ranges / duplicates / section overlaps
 *   edge-integrity   — argument.voices graph is well-formed
 * Severity is per ISSUE KIND (see KIND_SEVERITY / severityOf): the structural
 * impossibilities (anchor-out-of-range, inverted-range, duplicate-instance) are
 * `hard` (gate the cache); the approximate/noisy kinds (excerpt-not-in-segment,
 * section-overlap, edge-*) stay `soft`. These tests pin both the detection logic
 * and each kind's severity.
 */
import { describe, expect, it } from 'vitest';
import { type CheckIssue, type PassCtx, runPasses } from '../../src/lib/check/passes';

const ctx = (over: Partial<PassCtx> = {}): PassCtx => ({
  tractate: 'Gittin',
  page: '67b',
  segmentsHe: [],
  defId: 'x',
  ...over,
});
const kinds = (issues: CheckIssue[]) => issues.map((i) => i.kind).sort();
const allSoft = (issues: CheckIssue[]) => issues.every((i) => i.severity === 'soft');

describe('anchor-verbatim', () => {
  const segs = ['בני אדם שׁוטה', 'תנו רבנן המביא גט', 'אמר רבא הלכה כרבי'];

  it('passes when each excerpt is present in its claimed segment', async () => {
    const parsed = {
      instances: [
        { startSegIdx: 1, fields: { excerpt: 'תנו רבנן' } },
        { startSegIdx: 2, fields: { excerpt: 'אמר רבא' } },
      ],
    };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument' }),
    );
    expect(issues).toEqual([]);
  });

  it('flags an excerpt that is not in its segment (hallucination/prefix fallback)', async () => {
    const parsed = { instances: [{ startSegIdx: 1, fields: { excerpt: 'מילים שלא קיימות' } }] };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument' }),
    );
    expect(kinds(issues)).toEqual(['excerpt-not-in-segment']);
    expect(allSoft(issues)).toBe(true);
    expect(issues[0].index).toBe(1);
  });

  it('flags an out-of-range anchor as hard (an index past the daf is never a false positive)', async () => {
    const parsed = { instances: [{ startSegIdx: 99, fields: { excerpt: 'תנו רבנן' } }] };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument' }),
    );
    expect(kinds(issues)).toEqual(['anchor-out-of-range']);
    expect(issues[0].severity).toBe('hard');
  });

  it('skips excerpts shorter than 2 words and missing excerpts', async () => {
    const parsed = {
      instances: [
        { startSegIdx: 0, fields: { excerpt: 'שׁוטה' } },
        { startSegIdx: 0, fields: {} },
      ],
    };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument' }),
    );
    expect(issues).toEqual([]);
  });

  it('ignores nikud/punctuation differences (normalized match)', async () => {
    const parsed = { instances: [{ startSegIdx: 1, fields: { excerpt: 'תְּנוּ, רַבָּנַן' } }] };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument' }),
    );
    expect(issues).toEqual([]);
  });

  // The check must mirror the placer (findExcerpt), which anchors on the
  // longest matching PREFIX of the excerpt (full -> 4 -> 3 -> 2 words). A
  // lightly-paraphrased tail or a quote spilling past the segment still
  // anchors correctly on its opening words, so it must NOT be flagged — that
  // was ~40% of the old check's flags on real dapim (false positives).
  it('does NOT flag when the excerpt opening (>=2-word prefix) is present but the full phrase is not contiguous', async () => {
    // seg1 is "תנו רבנן המביא גט"; the excerpt opens on it but its tail
    // ("בידו פסול") spills past the segment / is paraphrased.
    const parsed = {
      instances: [{ startSegIdx: 1, fields: { excerpt: 'תנו רבנן המביא גט בידו פסול' } }],
    };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument-move' }),
    );
    expect(issues).toEqual([]);
  });

  it('still flags when not even a 2-word opening prefix is present (fallback-bumped / hallucinated)', async () => {
    // Opening words absent from seg2 -> the placer could only have reached
    // seg2 via the fallback bump. This is the real Pesachim-60b pile-up shape:
    // moves clamped onto the section start whose text lives further down.
    const parsed = { instances: [{ startSegIdx: 2, fields: { excerpt: 'תנו רבנן המביא גט' } }] };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument-move' }),
    );
    expect(kinds(issues)).toEqual(['excerpt-not-in-segment']);
    expect(issues[0].index).toBe(2);
    expect(allSoft(issues)).toBe(true);
  });

  it('does not leak a prefix match from a neighbouring segment (search confined to the anchored segment)', async () => {
    // "אמר רבא" lives in seg2, NOT seg1. Anchoring it to seg1 must still flag,
    // even though a different segment contains the prefix.
    const parsed = { instances: [{ startSegIdx: 1, fields: { excerpt: 'אמר רבא הלכה' } }] };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument-move' }),
    );
    expect(kinds(issues)).toEqual(['excerpt-not-in-segment']);
    expect(issues[0].index).toBe(1);
  });

  // Fuzzy fallback: an excerpt genuinely present but with a malé/ḥaser spelling
  // variant or a reworded opening (which breaks every exact prefix) must not be
  // flagged — the words are there.
  it('does NOT flag a malé/ḥaser spelling variant present in the segment (fuzzy fallback)', async () => {
    // seg0 has the full spelling "העולם"; the excerpt drops the vav ("העלם").
    const fuzzy = ['כל העולם כולו'];
    const parsed = { instances: [{ startSegIdx: 0, fields: { excerpt: 'כל העלם' } }] };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: fuzzy, defId: 'argument-move' }),
    );
    expect(issues).toEqual([]);
  });

  it('does NOT flag a reworded opening when the rest of the words are present (fuzzy fallback)', async () => {
    // seg2 is "אמר רבא הלכה כרבי"; excerpt opens "ואמר" (extra vav) so no exact
    // prefix matches, but 3/3 words are present within one edit.
    const parsed = { instances: [{ startSegIdx: 2, fields: { excerpt: 'ואמר רבא הלכה' } }] };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument-move' }),
    );
    expect(issues).toEqual([]);
  });

  it('still flags when only a single common word overlaps (fuzzy fallback does not over-suppress)', async () => {
    // seg2 "אמר רבא הלכה כרבי": the excerpt shares only "אמר"; 1/3 < floor.
    const parsed = { instances: [{ startSegIdx: 2, fields: { excerpt: 'אמר אביי בגמרא' } }] };
    const { issues } = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument-move' }),
    );
    expect(kinds(issues)).toEqual(['excerpt-not-in-segment']);
  });

  it('does NOT apply the fuzzy fallback on the hard pesukim/aggadata path (exact-only, still gates)', async () => {
    // 'ואמר רבא הלכה' would fuzzily match seg2 (and is suppressed on the soft
    // path above) — but on pesukim the kind is HARD, so it stays exact and a
    // non-verbatim excerpt must still flag to gate the cache.
    const parsed = { instances: [{ startSegIdx: 2, fields: { excerpt: 'ואמר רבא הלכה' } }] };
    const pesukim = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'pesukim' }),
    );
    expect(kinds(pesukim.issues)).toEqual(['excerpt-not-in-segment']);
    expect(pesukim.issues[0].severity).toBe('hard');
    // Same excerpt on the soft argument-move path is suppressed by the fallback.
    const move = await runPasses(
      ['anchor-verbatim'],
      parsed,
      ctx({ segmentsHe: segs, defId: 'argument-move' }),
    );
    expect(move.issues).toEqual([]);
  });
});

describe('partition-clean', () => {
  it('flags an inverted range as hard (end < start is structurally impossible)', async () => {
    const parsed = {
      instances: [{ startSegIdx: 5, endSegIdx: 2, fields: { excerpt: 'aaa bbb' } }],
    };
    const { issues } = await runPasses(
      ['partition-clean'],
      parsed,
      ctx({ defId: 'argument-move' }),
    );
    expect(kinds(issues)).toContain('inverted-range');
    expect(issues.find((i) => i.kind === 'inverted-range')?.severity).toBe('hard');
  });

  it('flags an exact duplicate instance as hard (identical id + range + anchors is never legitimate)', async () => {
    const dup = {
      startSegIdx: 3,
      endSegIdx: 4,
      fields: { id: '3-4_0', excerpt: 'אמר רבא הלכה', endExcerpt: 'כרבי יהודה' },
    };
    const { issues } = await runPasses(
      ['partition-clean'],
      { instances: [dup, { ...dup, fields: { ...dup.fields } }] },
      ctx({ defId: 'argument-move' }),
    );
    expect(kinds(issues)).toEqual(['duplicate-instance']);
    expect(issues[0].severity).toBe('hard');
  });

  it('does NOT flag two distinct moves that share a segment range and a formulaic opener', async () => {
    // Two real תא שמע moves in one segment: same range + opening excerpt, but
    // different id / end anchor. Must not be hard-blocked as a duplicate.
    const a = {
      startSegIdx: 6,
      endSegIdx: 6,
      fields: { id: '6-6_0', excerpt: 'תא שמע', endExcerpt: 'פטור' },
    };
    const b = {
      startSegIdx: 6,
      endSegIdx: 6,
      fields: { id: '6-6_1', excerpt: 'תא שמע', endExcerpt: 'חייב' },
    };
    const { issues } = await runPasses(
      ['partition-clean'],
      { instances: [a, b] },
      ctx({ defId: 'argument-move' }),
    );
    expect(issues).toEqual([]);
  });

  it('dedupe-instances drops an exact duplicate at the source, so partition-clean stays clean', async () => {
    const dup = {
      startSegIdx: 3,
      endSegIdx: 4,
      fields: { id: '3-4_0', excerpt: 'אמר רבא הלכה', endExcerpt: 'כרבי יהודה' },
    };
    const { parsed, issues } = await runPasses(
      ['dedupe-instances', 'partition-clean'],
      { instances: [dup, { ...dup, fields: { ...dup.fields } }] },
      ctx({ defId: 'argument-move' }),
    );
    expect((parsed as { instances: unknown[] }).instances).toHaveLength(1);
    expect(issues).toEqual([]); // the duplicate was removed before the check ran
  });

  it('dedupe-instances keeps two distinct moves that share a range + opener', async () => {
    const a = {
      startSegIdx: 6,
      endSegIdx: 6,
      fields: { id: '6-6_0', excerpt: 'תא שמע', endExcerpt: 'פטור' },
    };
    const b = {
      startSegIdx: 6,
      endSegIdx: 6,
      fields: { id: '6-6_1', excerpt: 'תא שמע', endExcerpt: 'חייב' },
    };
    const { parsed, issues } = await runPasses(
      ['dedupe-instances', 'partition-clean'],
      { instances: [a, b] },
      ctx({ defId: 'argument-move' }),
    );
    expect((parsed as { instances: unknown[] }).instances).toHaveLength(2); // both survive
    expect(issues).toEqual([]);
  });

  it('flags overlapping section ranges only for the argument mark, and only soft (a shared boundary can be legitimate)', async () => {
    const overlapping = {
      instances: [
        { startSegIdx: 0, endSegIdx: 3, fields: {} },
        { startSegIdx: 2, endSegIdx: 5, fields: {} },
      ],
    };
    const asArgument = await runPasses(
      ['partition-clean'],
      overlapping,
      ctx({ defId: 'argument' }),
    );
    expect(kinds(asArgument.issues)).toEqual(['section-overlap']);
    expect(allSoft(asArgument.issues)).toBe(true);
    // Same shape under argument-move: overlaps are legitimate (moves share segments).
    const asMove = await runPasses(
      ['partition-clean'],
      overlapping,
      ctx({ defId: 'argument-move' }),
    );
    expect(asMove.issues).toEqual([]);
  });

  it('passes a clean partition', async () => {
    const parsed = {
      instances: [
        { startSegIdx: 0, endSegIdx: 2, fields: { excerpt: 'a a' } },
        { startSegIdx: 3, endSegIdx: 5, fields: { excerpt: 'b b' } },
      ],
    };
    const { issues } = await runPasses(['partition-clean'], parsed, ctx({ defId: 'argument' }));
    expect(issues).toEqual([]);
  });
});

describe('edge-integrity', () => {
  const voices = [{ name: 'Rava' }, { name: 'Abaye' }, { name: 'Sages' }];

  it('passes a well-formed graph', async () => {
    const parsed = {
      voices,
      edges: [
        { from: 'Rava', to: 'Abaye', kind: 'opposes' },
        { from: 'Sages', to: 'Rava', kind: 'supports' },
      ],
    };
    const { issues } = await runPasses(
      ['edge-integrity'],
      parsed,
      ctx({ defId: 'argument.voices' }),
    );
    expect(issues).toEqual([]);
  });

  it('flags an edge referencing an unknown voice', async () => {
    const parsed = { voices, edges: [{ from: 'Rava', to: 'Rav Ashi', kind: 'opposes' }] };
    const { issues } = await runPasses(
      ['edge-integrity'],
      parsed,
      ctx({ defId: 'argument.voices' }),
    );
    expect(kinds(issues)).toEqual(['edge-unknown-voice']);
    expect(allSoft(issues)).toBe(true);
  });

  it('flags a self-loop', async () => {
    const parsed = { voices, edges: [{ from: 'Rava', to: 'Rava', kind: 'responds-to' }] };
    const { issues } = await runPasses(
      ['edge-integrity'],
      parsed,
      ctx({ defId: 'argument.voices' }),
    );
    expect(kinds(issues)).toEqual(['edge-self-loop']);
  });

  it('flags a contradictory opposes+supports on the same pair (either direction)', async () => {
    const parsed = {
      voices,
      edges: [
        { from: 'Rava', to: 'Abaye', kind: 'opposes' },
        { from: 'Abaye', to: 'Rava', kind: 'supports' },
      ],
    };
    const { issues } = await runPasses(
      ['edge-integrity'],
      parsed,
      ctx({ defId: 'argument.voices' }),
    );
    expect(kinds(issues)).toContain('edge-contradiction');
  });

  it('tolerates an empty / missing graph', async () => {
    const { issues } = await runPasses(
      ['edge-integrity'],
      { voices, edges: [] },
      ctx({ defId: 'argument.voices' }),
    );
    expect(issues).toEqual([]);
    const { issues: i2 } = await runPasses(
      ['edge-integrity'],
      {},
      ctx({ defId: 'argument.voices' }),
    );
    expect(i2).toEqual([]);
  });
});
