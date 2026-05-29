/**
 * Standardized post-LLM check layer. Replaces the two hardcoded
 * `if (def.id === …)` chains in the worker's runMarkOnce / runEnrichmentOnce
 * (one for anchor-resolution transforms, one for the Hebrew linters) with a
 * single registry of named checks that a definition opts into via `checks: []`.
 *
 * Two phases:
 *   - transform: mutates/returns `parsed` (placement, anchor resolution).
 *   - validate:  inspects `parsed`, returns issues. `hard` issues gate the
 *                cache write (via the existing bounded-retry); `soft` issues
 *                are attached as a quality signal but never block.
 *
 * runChecks runs all transforms (in the order listed) then all validators.
 * DOM-free / env-free so it lives in src/lib and is unit-testable.
 */

import { lintSynthesis } from '../synthesisLint';
import { lintHalachaParsed } from '../halachaLint';
import { reanchorArgument, reanchorArgumentMove, reanchorPesukim, reanchorAggadata, reanchorRabbiEvidence, reanchorNarrative } from '../place/reanchor';
import { normalizeHebrew, buildVerbatimGrid, findExcerpt } from '../place/verbatim';
import { deriveVoiceEdges } from '../typing/voices';

export type Severity = 'hard' | 'soft';

export interface CheckIssue {
  /** Stable kind, e.g. 'missing-hebrew-excerpt' | 'calque' | 'bare-transliteration'. */
  kind: string;
  severity: Severity;
  /** Optional position/diagnostic carriers (the existing lint issue shapes fit). */
  match?: string;
  index?: number;
  detail?: string;
}

export interface CheckCtx {
  tractate: string;
  page: string;
  /** Segment grid for placement/anchor transforms (the gemara slice). */
  segmentsHe: string[];
  /** The daf's Rashi/Tosafot/rishonim Hebrew text (HTML-stripped, one entry per
   *  commentator) — for commentary-verbatim. Absent unless a check needs it. */
  commentaryHe?: string[];
  defId: string;
  lang?: 'en' | 'he';
}

export type CheckResult = { parsed: unknown } | { issues: CheckIssue[] };

export interface PostCheck {
  id: string;
  phase: 'transform' | 'validate';
  run(parsed: unknown, ctx: CheckCtx): CheckResult | Promise<CheckResult>;
}

// ---- transform checks: anchor resolution via the unified placer ----

const transform = (id: string, fn: (p: unknown, segs: string[]) => unknown): PostCheck => ({
  id,
  phase: 'transform',
  run: (parsed, ctx) => ({ parsed: fn(parsed, ctx.segmentsHe) }),
});

// ---- validate checks: wrap the existing deterministic linters ----

/** Pull the synthesis prose out of a parsed enrichment payload, tolerating the
 *  older 4-field shape (mirrors the extraction in runEnrichmentOnce). */
function synthesisText(parsed: unknown): string {
  const p = (parsed ?? {}) as Partial<Record<'synthesis' | 'tanach_context' | 'why_here' | 'mechanism' | 'landing', string>>;
  return p.synthesis
    ?? [p.tanach_context, p.why_here, p.mechanism, p.landing]
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .join('\n\n');
}

const hebrewExcerpt: PostCheck = {
  id: 'hebrew-excerpt',
  phase: 'validate',
  run: (parsed) => ({
    issues: lintSynthesis(synthesisText(parsed)).map((i) => ({
      kind: i.kind,
      severity: 'hard' as const,
      match: i.match,
      index: i.index,
      detail: `${i.book} ${i.chapter}:${i.verse}`,
    })),
  }),
};

const hebrewGloss: PostCheck = {
  id: 'hebrew-gloss',
  phase: 'validate',
  run: (parsed) => ({
    issues: lintHalachaParsed(parsed).map((i) => ({
      kind: i.kind,
      severity: 'hard' as const,
      match: i.match,
      index: i.index,
      detail: 'hebrew' in i ? i.hebrew : undefined,
    })),
  }),
};

// ---- A3 validate checks: anchor/graph/partition integrity, shipped `soft` ----
// These observe-only checks never gate the cache; they surface quality signals
// (hallucinated anchors, malformed voice graphs, dirty partitions) so a check
// can be promoted to `hard` per-mark once its false-positive rate is known.

interface RangeInstance { startSegIdx?: unknown; endSegIdx?: unknown; fields?: { excerpt?: unknown; [k: string]: unknown }; [k: string]: unknown }

function instancesOf(parsed: unknown): RangeInstance[] {
  const arr = (parsed as { instances?: unknown })?.instances;
  return Array.isArray(arr) ? (arr as RangeInstance[]) : [];
}

/** anchor-verbatim — the instance's `excerpt` can actually be located in the
 *  segment it was anchored to, USING THE SAME MATCHER THAT PLACED IT. The
 *  re-anchorers (reanchorArgumentMove / -Pesukim / -Aggadata) call findExcerpt,
 *  which anchors on the longest matching prefix of the excerpt (full → 4 → 3 →
 *  2 words) — so a lightly-paraphrased tail, or a quote that spills into the
 *  next segment, still legitimately anchors on its opening words. Re-running
 *  findExcerpt against the single anchored segment reproduces that decision:
 *  a hit means the placer had a real reason to land here; a miss means the
 *  excerpt reached this segment only via the fallback bump (prevMatchSeg+1 /
 *  section start), i.e. it is genuinely mis-anchored (or hallucinated).
 *
 *  This deliberately mirrors the placer instead of demanding a full contiguous
 *  substring: the old `segNorm.includes(fullExcerpt)` test flagged every
 *  prefix-anchored placement as `excerpt-not-in-segment`, which on real dapim
 *  was ~40% false positives (correct anchors whose phrase merely isn't
 *  contiguous). Skips instances with no excerpt or a <2-word excerpt (findExcerpt
 *  itself rejects <2-word needles as too ambiguous). */
/** Marks where anchor-verbatim is promoted to `hard` (gates the cache write).
 *  Chosen from real-traffic observation: pesukim + aggadata anchor reliably
 *  (zero flags sampled across 23 dapim post the placer-mirroring refinement), so
 *  a flag there is a genuine hallucination worth blocking. argument /
 *  argument-move still flag occasionally (boundary-spanning excerpts), so they
 *  stay `soft` (observe-only) pending more data. */
const ANCHOR_VERBATIM_HARD_MARKS: ReadonlySet<string> = new Set(['pesukim', 'aggadata']);

const anchorVerbatim: PostCheck = {
  id: 'anchor-verbatim',
  phase: 'validate',
  run: (parsed, ctx) => {
    const issues: CheckIssue[] = [];
    const severity: Severity = ANCHOR_VERBATIM_HARD_MARKS.has(ctx.defId) ? 'hard' : 'soft';
    const segs = ctx.segmentsHe;
    const grid = buildVerbatimGrid(segs);
    for (const inst of instancesOf(parsed)) {
      const excerpt = inst.fields?.excerpt;
      if (typeof excerpt !== 'string' || !excerpt) continue;
      if (normalizeHebrew(excerpt).split(' ').filter(Boolean).length < 2) continue;
      const seg = inst.startSegIdx;
      if (typeof seg !== 'number' || seg < 0 || seg >= segs.length) {
        issues.push({ kind: 'anchor-out-of-range', severity, match: excerpt, index: typeof seg === 'number' ? seg : -1 });
        continue;
      }
      // Confine the search to the single anchored segment: a hit there is the
      // same prefix the placer would have matched to land on this segment.
      if (!findExcerpt(grid, excerpt, seg, seg)) {
        issues.push({ kind: 'excerpt-not-in-segment', severity, match: excerpt, index: seg });
      }
    }
    return { issues };
  },
};

/** partition-clean — the instance ranges don't contradict themselves: no
 *  inverted range (end < start), no exact duplicate (same range + excerpt),
 *  and — for the section-level `argument` mark, whose instances must tile the
 *  daf — no overlapping section ranges. Move-level overlaps are legitimate
 *  (several moves can share one segment), so overlap is only checked for
 *  `argument`. Catches the duplicated-move / overshooting-section bugs. */
const partitionClean: PostCheck = {
  id: 'partition-clean',
  phase: 'validate',
  run: (parsed, ctx) => {
    const issues: CheckIssue[] = [];
    const insts = instancesOf(parsed);
    const seen = new Set<string>();
    for (const inst of insts) {
      const s = inst.startSegIdx, e = inst.endSegIdx;
      if (typeof s === 'number' && typeof e === 'number' && e < s) {
        issues.push({ kind: 'inverted-range', severity: 'soft', index: s, detail: `${s}-${e}` });
      }
      const ex = typeof inst.fields?.excerpt === 'string' ? normalizeHebrew(inst.fields.excerpt) : '';
      const key = `${s}|${e}|${ex}`;
      if (seen.has(key)) issues.push({ kind: 'duplicate-instance', severity: 'soft', match: ex || undefined, index: typeof s === 'number' ? s : -1 });
      else seen.add(key);
    }
    if (ctx.defId === 'argument') {
      const ranges = insts
        .filter((i) => typeof i.startSegIdx === 'number' && typeof i.endSegIdx === 'number')
        .map((i) => ({ s: i.startSegIdx as number, e: i.endSegIdx as number }))
        .sort((a, b) => a.s - b.s);
      for (let i = 1; i < ranges.length; i++) {
        if (ranges[i].s <= ranges[i - 1].e) {
          issues.push({ kind: 'section-overlap', severity: 'soft', index: ranges[i].s, detail: `${ranges[i - 1].s}-${ranges[i - 1].e} ∩ ${ranges[i].s}-${ranges[i].e}` });
        }
      }
    }
    return { issues };
  },
};

/** edge-integrity — the voices graph emitted by argument.voices is well-formed:
 *  every edge's from/to names a declared voice, no self-loops, and no single
 *  voice pair carries both an `opposes` and a `supports` edge (a contradiction
 *  the model occasionally emits when it double-labels a resolution). */
const edgeIntegrity: PostCheck = {
  id: 'edge-integrity',
  phase: 'validate',
  run: (parsed) => {
    const issues: CheckIssue[] = [];
    const p = (parsed ?? {}) as { voices?: unknown; edges?: unknown };
    const names = new Set(
      (Array.isArray(p.voices) ? p.voices : [])
        .map((v) => (v as { name?: unknown })?.name)
        .filter((n): n is string => typeof n === 'string'),
    );
    const edges = Array.isArray(p.edges) ? p.edges : [];
    const pairKinds = new Map<string, Set<string>>();
    for (const e of edges) {
      const edge = (e ?? {}) as { from?: unknown; to?: unknown; kind?: unknown };
      const from = typeof edge.from === 'string' ? edge.from : '';
      const to = typeof edge.to === 'string' ? edge.to : '';
      const kind = typeof edge.kind === 'string' ? edge.kind : '';
      if (!names.has(from)) issues.push({ kind: 'edge-unknown-voice', severity: 'soft', match: from, detail: `from -> ${to}` });
      if (!names.has(to)) issues.push({ kind: 'edge-unknown-voice', severity: 'soft', match: to, detail: `${from} -> to` });
      if (from && to && from === to) issues.push({ kind: 'edge-self-loop', severity: 'soft', match: from });
      if (from && to && (kind === 'opposes' || kind === 'supports')) {
        const pk = [from, to].sort().join(' ↔ ');
        const set = pairKinds.get(pk) ?? new Set<string>();
        set.add(kind);
        pairKinds.set(pk, set);
      }
    }
    for (const [pair, kinds] of pairKinds) {
      if (kinds.has('opposes') && kinds.has('supports')) {
        issues.push({ kind: 'edge-contradiction', severity: 'soft', match: pair });
      }
    }
    return { issues };
  },
};

/** Maximal runs of Hebrew/Aramaic script (≥ minWords words) embedded in prose —
 *  i.e. quoted source text, not the single-word Hebrew TERMS the gloss style
 *  sprinkles in. English/digits break a run, so each run is one contiguous
 *  Hebrew citation. */
function hebrewRuns(text: string, minWords: number): string[] {
  if (!text) return [];
  const out: string[] = [];
  // Hebrew block (letters + nikud/punct) with internal spaces; bounded by non-Hebrew.
  const re = /[֑-״](?:[֑-״'"׳״־\-\s]*[֑-״])?/g;
  for (const m of text.matchAll(re)) {
    const run = m[0].trim();
    if (run.split(/\s+/).filter(Boolean).length >= minWords) out.push(run);
  }
  return out;
}

/** commentary-verbatim — a cited Rashi/Tosafot quote must actually appear in the
 *  daf's real commentary text (quote-or-omit; catches invented citations). For
 *  each ≥3-word Hebrew run in the rashi/tosafot/other prose fields, verify it is
 *  present (via the verbatim matcher) in ctx.commentaryHe. Skips when no
 *  commentary is loaded (can't judge → no false positives). Soft (observe). */
const commentaryVerbatim: PostCheck = {
  id: 'commentary-verbatim',
  phase: 'validate',
  run: (parsed, ctx) => {
    const issues: CheckIssue[] = [];
    const com = ctx.commentaryHe ?? [];
    if (com.length === 0) return { issues };
    const grid = buildVerbatimGrid(com);
    const p = (parsed ?? {}) as Record<string, unknown>;
    for (const field of ['rashi', 'tosafot', 'other']) {
      const prose = typeof p[field] === 'string' ? (p[field] as string) : '';
      for (const run of hebrewRuns(prose, 3)) {
        if (normalizeHebrew(run).split(' ').filter(Boolean).length < 2) continue;
        if (!findExcerpt(grid, run, 0, com.length - 1)) {
          issues.push({ kind: 'invented-commentary-quote', severity: 'soft', match: run, detail: field });
        }
      }
    }
    return { issues };
  },
};

export const CHECKS: Record<string, PostCheck> = {
  'reanchor-argument': transform('reanchor-argument', reanchorArgument),
  'reanchor-argument-move': transform('reanchor-argument-move', reanchorArgumentMove),
  'reanchor-pesukim': transform('reanchor-pesukim', reanchorPesukim),
  'reanchor-aggadata': transform('reanchor-aggadata', reanchorAggadata),
  'reanchor-rabbi-evidence': transform('reanchor-rabbi-evidence', reanchorRabbiEvidence),
  'reanchor-narrative': transform('reanchor-narrative', reanchorNarrative),
  'derive-voice-edges': { id: 'derive-voice-edges', phase: 'transform', run: (parsed) => ({ parsed: deriveVoiceEdges(parsed) }) },
  'hebrew-excerpt': hebrewExcerpt,
  'hebrew-gloss': hebrewGloss,
  'commentary-verbatim': commentaryVerbatim,
  'anchor-verbatim': anchorVerbatim,
  'partition-clean': partitionClean,
  'edge-integrity': edgeIntegrity,
};

/** Run the named checks: transforms first (in listed order), then validators.
 *  Unknown ids are ignored (a definition may reference a check not yet shipped). */
export async function runChecks(
  checkIds: readonly string[],
  parsed: unknown,
  ctx: CheckCtx,
): Promise<{ parsed: unknown; issues: CheckIssue[] }> {
  let current = parsed;
  const issues: CheckIssue[] = [];
  for (const id of checkIds) {
    const c = CHECKS[id];
    if (!c || c.phase !== 'transform') continue;
    const r = await c.run(current, ctx);
    if ('parsed' in r) current = r.parsed;
  }
  for (const id of checkIds) {
    const c = CHECKS[id];
    if (!c || c.phase !== 'validate') continue;
    const r = await c.run(current, ctx);
    if ('issues' in r) issues.push(...r.issues);
  }
  return { parsed: current, issues };
}
