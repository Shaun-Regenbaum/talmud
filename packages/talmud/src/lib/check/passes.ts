/**
 * Standardized post-LLM pass layer. Replaces the two hardcoded
 * `if (def.id === …)` chains in the worker's runMarkOnce / runEnrichmentOnce
 * (one for anchor-resolution transforms, one for the Hebrew linters) with a
 * single registry of named passes that a definition opts into via `passes: []`.
 *
 * A pass is one of two phases — only the validate phase is a "check" (it judges
 * the output); transform passes derive/repair it:
 *   - transform: mutates/returns `parsed` (placement, anchor resolution, the
 *                voice-graph derivation). Not a check — it builds, not judges.
 *   - validate:  inspects `parsed`, returns issues (a check). `hard` issues gate
 *                the cache write (via the existing bounded-retry); `soft` issues
 *                are attached as a quality signal but never block.
 *
 * runPasses runs all transforms (in the order listed) then all validators.
 * DOM-free / env-free so it lives in src/lib and is unit-testable.
 */

import { lintHalachaParsed } from '../halachaLint';
import {
  reanchorAggadata,
  reanchorArgument,
  reanchorArgumentMove,
  reanchorNarrative,
  reanchorPesukim,
  reanchorRabbiEvidence,
} from '../place/reanchor';
import { buildVerbatimGrid, findExcerpt, normalizeHebrew } from '../place/verbatim';
import { lintSynthesis } from '../synthesisLint';
import { deriveVoiceEdges } from '../typing/voices';
import type { YerushalmiFloorGroup } from '../yerushalmiAlign';

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

export interface PassCtx {
  tractate: string;
  page: string;
  /** Segment grid for placement/anchor transforms (the gemara slice). */
  segmentsHe: string[];
  /** The daf's Rashi/Tosafot/rishonim Hebrew text (HTML-stripped, one entry per
   *  commentator) — for commentary-verbatim. Absent unless a check needs it. */
  commentaryHe?: string[];
  /** Deterministic verbatim-aligned Bavli<->Yerushalmi spans (the yerushalmi-floor
   *  transform's input). Present only when running the yerushalmi mark. */
  yerushalmiFloor?: YerushalmiFloorGroup[];
  defId: string;
  lang?: 'en' | 'he';
}

export type PassResult = { parsed: unknown } | { issues: CheckIssue[] };

export interface PostPass {
  id: string;
  phase: 'transform' | 'validate';
  run(parsed: unknown, ctx: PassCtx): PassResult | Promise<PassResult>;
}

// ---- transform passes: anchor resolution via the unified placer ----

const transform = (id: string, fn: (p: unknown, segs: string[]) => unknown): PostPass => ({
  id,
  phase: 'transform',
  run: (parsed, ctx) => ({ parsed: fn(parsed, ctx.segmentsHe) }),
});

// ---- validate checks: wrap the existing deterministic linters ----

/** Pull the synthesis prose out of a parsed enrichment payload, tolerating the
 *  older 4-field shape (mirrors the extraction in runEnrichmentOnce). */
function synthesisText(parsed: unknown): string {
  const p = (parsed ?? {}) as Partial<
    Record<'synthesis' | 'tanach_context' | 'why_here' | 'mechanism' | 'landing', string>
  >;
  return (
    p.synthesis ??
    [p.tanach_context, p.why_here, p.mechanism, p.landing]
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .join('\n\n')
  );
}

const hebrewExcerpt: PostPass = {
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

const hebrewGloss: PostPass = {
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

// ---- A3 validate checks: anchor/graph/partition integrity ------------------
// These surface quality signals (hallucinated anchors, malformed voice graphs,
// dirty partitions). Severity is per ISSUE KIND, not per check: a single check
// emits both hard and soft issues. A kind is `hard` (gates the cache) only when
// a flag there is never a false positive — a structural impossibility — so the
// noisy/approximate kinds stay `soft` (observe-only) until eval-gated promotion.

/** Default cache-gating severity by issue kind. Centralized here (rather than
 *  hardcoded at each raise site) so one check can mix severities and a promotion
 *  is a one-line change. Kinds absent from the table are `soft`.
 *
 *  `hard` kinds are structural invariants that cannot legitimately occur:
 *    - anchor-out-of-range: a segment index past the end of the daf;
 *    - inverted-range:      end < start;
 *    - duplicate-instance:  two instances with the identical range AND excerpt.
 *  The Hebrew linters (hebrew-excerpt / hebrew-gloss) set their own `hard` at the
 *  raise site — they wrap open-ended sub-linters whose kinds aren't enumerable
 *  here. Soft, pending data: section-overlap, excerpt-not-in-segment, edge-*. */
export const KIND_SEVERITY: Record<string, Severity> = {
  'anchor-out-of-range': 'hard',
  'inverted-range': 'hard',
  'duplicate-instance': 'hard',
};

/** Marks where excerpt-not-in-segment is promoted to `hard`. pesukim + aggadata
 *  anchor reliably (zero flags sampled across 23 dapim after the placer-mirroring
 *  refinement), so a flag there is a genuine hallucination worth blocking;
 *  argument / argument-move still flag occasionally (boundary-spanning excerpts),
 *  so they stay `soft`. (PR #2 — fuzzy matcher + ±1 window — removes the residual
 *  false positives and folds this mark-scoping into the table.) */
const ANCHOR_VERBATIM_HARD_MARKS: ReadonlySet<string> = new Set(['pesukim', 'aggadata']);

/** Resolve an issue kind's severity for a given producer. Pure lookup over
 *  KIND_SEVERITY, plus the one mark-conditional case (excerpt-not-in-segment). */
function severityOf(kind: string, defId: string): Severity {
  if (kind === 'excerpt-not-in-segment' && ANCHOR_VERBATIM_HARD_MARKS.has(defId)) return 'hard';
  return KIND_SEVERITY[kind] ?? 'soft';
}

interface RangeInstance {
  startSegIdx?: unknown;
  endSegIdx?: unknown;
  fields?: { excerpt?: unknown; [k: string]: unknown };
  [k: string]: unknown;
}

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
 *  itself rejects <2-word needles as too ambiguous). Severity is per kind:
 *  anchor-out-of-range is always `hard` (an index past the daf is never a false
 *  positive); excerpt-not-in-segment is `hard` only on the pesukim/aggadata
 *  marks (see severityOf).
 *
 *  The exact prefix match still false-positives on two shapes the matcher can't
 *  see: malé/ḥaser spelling variants (normalizeHebrew strips nikud but NOT the
 *  vav/yod matres — מצות vs מצוות) and a lightly-paraphrased OPENING (the tail
 *  is already tolerated by prefixing, but a reworded first word breaks every
 *  prefix). So when the exact match misses, fall back to a fuzzy presence test:
 *  the excerpt is "present" if, at some start offset, ≥FUZZY_PRESENCE_FLOOR of
 *  its content words align POSITIONALLY with consecutive segment words under an
 *  edit-distance-1 token match. Ordered alignment (not bag-of-words) stops a
 *  reordered/scattered set of common words from passing. The fallback relaxes
 *  only SOFT flags — on the hard pesukim/aggadata path it stays exact, so a
 *  genuinely mis-anchored excerpt still gates the cache — and never touches the
 *  placer, so it cannot regress placement or the golden anchors. */

/** Within `max` single-char edits (insert/delete/substitute)? Specialized for
 *  max=1 — the common malé/ḥaser (single vav/yod) distance — with an early exit
 *  rather than a full DP table. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  const la = a.length,
    lb = b.length;
  if (Math.abs(la - lb) > max) return false;
  if (la === lb) {
    let diff = 0;
    for (let i = 0; i < la; i++) if (a[i] !== b[i] && ++diff > max) return false;
    return true;
  }
  // lengths differ by one: is the shorter the longer with a single deletion?
  const [short, long] = la < lb ? [a, b] : [b, a];
  let i = 0,
    j = 0,
    skips = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
    } else if (++skips > max) return false;
    else j++;
  }
  return true;
}

/** Fraction of the excerpt's content words (≥2 chars) that must align under the
 *  positional fuzzy match for the excerpt to count as present. 0.6 keeps 2-word
 *  excerpts strict (both words required) while tolerating ~40% drift on longer
 *  ones. */
export const FUZZY_PRESENCE_FLOOR = 0.6;

/** Ordered, contiguous fuzzy presence: is there a start offset where the
 *  excerpt's content words line up positionally with consecutive segment words
 *  (each within one edit) for at least FUZZY_PRESENCE_FLOOR of them? Positional
 *  alignment — not bag-of-words — so a scattered/reordered handful of common
 *  words can't pass. Only ever used to suppress a SOFT flag (see call site). */
function fuzzyPresent(excerpt: string, segWords: string[]): boolean {
  const exWords = normalizeHebrew(excerpt)
    .split(' ')
    .filter((w) => w.length >= 2);
  if (exWords.length === 0) return false;
  const need = Math.ceil(exWords.length * FUZZY_PRESENCE_FLOOR);
  for (let start = 0; start < segWords.length; start++) {
    let matched = 0;
    // Out-of-range positions (a window running past the segment end) simply stop
    // the loop — they never count as matches, so `matched` is honest. A pass at
    // the tail therefore means the excerpt's OPENING aligns here and the rest
    // spills into the next segment: the same boundary-spill the prefix matcher
    // already tolerates, intentionally kept.
    for (let k = 0; k < exWords.length && start + k < segWords.length; k++) {
      if (withinEdits(exWords[k], segWords[start + k], 1)) matched++;
    }
    if (matched >= need) return true;
  }
  return false;
}

const anchorVerbatim: PostPass = {
  id: 'anchor-verbatim',
  phase: 'validate',
  run: (parsed, ctx) => {
    const issues: CheckIssue[] = [];
    const segs = ctx.segmentsHe;
    const grid = buildVerbatimGrid(segs);
    for (const inst of instancesOf(parsed)) {
      const excerpt = inst.fields?.excerpt;
      if (typeof excerpt !== 'string' || !excerpt) continue;
      if (normalizeHebrew(excerpt).split(' ').filter(Boolean).length < 2) continue;
      const seg = inst.startSegIdx;
      if (typeof seg !== 'number' || seg < 0 || seg >= segs.length) {
        issues.push({
          kind: 'anchor-out-of-range',
          severity: severityOf('anchor-out-of-range', ctx.defId),
          match: excerpt,
          index: typeof seg === 'number' ? seg : -1,
        });
        continue;
      }
      // Confine the search to the single anchored segment: an exact prefix hit
      // there is the same one the placer matched to land here. On a miss, the
      // fuzzy fallback absorbs spelling/opening-paraphrase variants — but only
      // for SOFT flags; the hard pesukim/aggadata path stays exact so a genuine
      // mis-anchor still gates the cache.
      const sev = severityOf('excerpt-not-in-segment', ctx.defId);
      const present =
        !!findExcerpt(grid, excerpt, seg, seg) ||
        (sev === 'soft' && fuzzyPresent(excerpt, grid.segWords[seg]));
      if (!present) {
        issues.push({ kind: 'excerpt-not-in-segment', severity: sev, match: excerpt, index: seg });
      }
    }
    return { issues };
  },
};

/** yerushalmi-floor — GUARANTEE the mark fires on every span that provably shares
 *  a long verbatim phrase with the Yerushalmi (a shared mishnah/baraita), even
 *  when the LLM declined to emit one. For each deterministic floor group not
 *  already covered by an LLM instance (segment-range overlap), append a
 *  fallback instance: the anchor is exact (the verbatim shared phrase), the
 *  `differences` a short, honest note (no point-by-point contrast was generated
 *  for it) tagged `placement: 'aligned'` so the card can label it. The LLM's own
 *  instances — which carry the real, written differences — always win on overlap.
 *  This converts the ~25% LLM firing rate into "fires wherever a verbatim
 *  parallel exists" without inventing analysis or sacrificing precision. */
function num(v: unknown): number {
  return typeof v === 'number' ? v : Number.NaN;
}

function floorFallbackInstance(g: YerushalmiFloorGroup, lang?: 'en' | 'he'): RangeInstance {
  const topic = g.points.find((p) => p.topic)?.topic ?? '';
  const ref = g.yerushalmiRef ?? '';
  const he = lang === 'he';
  const summary = he
    ? `שני התלמודים דנים ב${topic || 'קטע זה'}.`
    : `Both Talmuds treat ${topic || 'this passage'}.`;
  const differences = he
    ? `טקסט־הבסיס כאן (משנה/ברייתא) משותף מילה־במילה עם הירושלמי${ref ? ` (${ref})` : ''}. ניתוח הבדלים מפורט טרם נכתב לקטע זה — ראו בירושלמי.`
    : `This span shares its base text (mishnah/baraita) verbatim with the Yerushalmi${ref ? ` (${ref})` : ''}. A point-by-point contrast hasn't been written for it yet — see the Yerushalmi directly.`;
  return {
    startSegIdx: g.startSegIdx,
    endSegIdx: g.endSegIdx,
    fields: {
      yerushalmiRef: ref,
      yerushalmiRefHe: '',
      summary,
      differences,
      excerpt: g.excerpt ?? '',
      placement: 'aligned',
    },
  };
}

const yerushalmiFloorPass: PostPass = {
  id: 'yerushalmi-floor',
  phase: 'transform',
  run: (parsed, ctx) => {
    const floor = ctx.yerushalmiFloor ?? [];
    if (floor.length === 0) return { parsed };
    const insts = instancesOf(parsed).slice();
    const covers = (g: YerushalmiFloorGroup): boolean =>
      insts.some((i) => {
        const s = num(i.startSegIdx),
          e = num(i.endSegIdx);
        return Number.isFinite(s) && Number.isFinite(e) && s <= g.endSegIdx && e >= g.startSegIdx;
      });
    for (const g of floor) {
      if (!covers(g)) insts.push(floorFallbackInstance(g, ctx.lang));
    }
    insts.sort((a, b) => num(a.startSegIdx) - num(b.startSegIdx));
    return { parsed: { ...((parsed ?? {}) as object), instances: insts } };
  },
};

/** partition-clean — the instance ranges don't contradict themselves: no
 *  inverted range (end < start), no exact duplicate (same range + excerpt),
 *  and — for the section-level `argument` mark, whose instances must tile the
 *  daf — no overlapping section ranges. Move-level overlaps are legitimate
 *  (several moves can share one segment), so overlap is only checked for
 *  `argument`. Catches the duplicated-move / overshooting-section bugs. */
const partitionClean: PostPass = {
  id: 'partition-clean',
  phase: 'validate',
  run: (parsed, ctx) => {
    const issues: CheckIssue[] = [];
    const insts = instancesOf(parsed);
    const seen = new Set<string>();
    for (const inst of insts) {
      const s = inst.startSegIdx,
        e = inst.endSegIdx;
      if (typeof s === 'number' && typeof e === 'number' && e < s) {
        issues.push({
          kind: 'inverted-range',
          severity: severityOf('inverted-range', ctx.defId),
          index: s,
          detail: `${s}-${e}`,
        });
      }
      // True-duplicate identity, not just range+opener: two legitimate moves can
      // share a segment and a formulaic opening (תא שמע / אמר רבא) yet differ in
      // their deterministic id, end anchor, or order. Keying on those avoids
      // hard-blocking a correct output while still catching a genuinely emitted-
      // twice instance (same id ⇒ same move slot).
      const ex =
        typeof inst.fields?.excerpt === 'string' ? normalizeHebrew(inst.fields.excerpt) : '';
      const endEx =
        typeof inst.fields?.endExcerpt === 'string' ? normalizeHebrew(inst.fields.endExcerpt) : '';
      const id = typeof inst.fields?.id === 'string' ? inst.fields.id : '';
      const key = `${id}|${s}|${e}|${ex}|${endEx}`;
      if (seen.has(key))
        issues.push({
          kind: 'duplicate-instance',
          severity: severityOf('duplicate-instance', ctx.defId),
          match: ex || undefined,
          index: typeof s === 'number' ? s : -1,
        });
      else seen.add(key);
    }
    if (ctx.defId === 'argument') {
      const ranges = insts
        .filter((i) => typeof i.startSegIdx === 'number' && typeof i.endSegIdx === 'number')
        .map((i) => ({ s: i.startSegIdx as number, e: i.endSegIdx as number }))
        .sort((a, b) => a.s - b.s);
      for (let i = 1; i < ranges.length; i++) {
        if (ranges[i].s <= ranges[i - 1].e) {
          issues.push({
            kind: 'section-overlap',
            severity: severityOf('section-overlap', ctx.defId),
            index: ranges[i].s,
            detail: `${ranges[i - 1].s}-${ranges[i - 1].e} ∩ ${ranges[i].s}-${ranges[i].e}`,
          });
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
const edgeIntegrity: PostPass = {
  id: 'edge-integrity',
  phase: 'validate',
  run: (parsed, ctx) => {
    const issues: CheckIssue[] = [];
    const sev = (kind: string): Severity => severityOf(kind, ctx.defId);
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
      if (!names.has(from))
        issues.push({
          kind: 'edge-unknown-voice',
          severity: sev('edge-unknown-voice'),
          match: from,
          detail: `from -> ${to}`,
        });
      if (!names.has(to))
        issues.push({
          kind: 'edge-unknown-voice',
          severity: sev('edge-unknown-voice'),
          match: to,
          detail: `${from} -> to`,
        });
      if (from && to && from === to)
        issues.push({ kind: 'edge-self-loop', severity: sev('edge-self-loop'), match: from });
      if (from && to && (kind === 'opposes' || kind === 'supports')) {
        const pk = [from, to].sort().join(' ↔ ');
        const set = pairKinds.get(pk) ?? new Set<string>();
        set.add(kind);
        pairKinds.set(pk, set);
      }
    }
    for (const [pair, kinds] of pairKinds) {
      if (kinds.has('opposes') && kinds.has('supports')) {
        issues.push({
          kind: 'edge-contradiction',
          severity: sev('edge-contradiction'),
          match: pair,
        });
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
const commentaryVerbatim: PostPass = {
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
          issues.push({
            kind: 'invented-commentary-quote',
            severity: 'soft',
            match: run,
            detail: field,
          });
        }
      }
    }
    return { issues };
  },
};

export const PASSES: Record<string, PostPass> = {
  'reanchor-argument': transform('reanchor-argument', reanchorArgument),
  'reanchor-argument-move': transform('reanchor-argument-move', reanchorArgumentMove),
  'reanchor-pesukim': transform('reanchor-pesukim', reanchorPesukim),
  'reanchor-aggadata': transform('reanchor-aggadata', reanchorAggadata),
  'reanchor-rabbi-evidence': transform('reanchor-rabbi-evidence', reanchorRabbiEvidence),
  'reanchor-narrative': transform('reanchor-narrative', reanchorNarrative),
  'derive-voice-edges': {
    id: 'derive-voice-edges',
    phase: 'transform',
    run: (parsed) => ({ parsed: deriveVoiceEdges(parsed) }),
  },
  'yerushalmi-floor': yerushalmiFloorPass,
  'hebrew-excerpt': hebrewExcerpt,
  'hebrew-gloss': hebrewGloss,
  'commentary-verbatim': commentaryVerbatim,
  'anchor-verbatim': anchorVerbatim,
  'partition-clean': partitionClean,
  'edge-integrity': edgeIntegrity,
};

/** Run the named passes: transforms first (in listed order), then validators.
 *  Unknown ids are ignored (a definition may reference a pass not yet shipped). */
export async function runPasses(
  checkIds: readonly string[],
  parsed: unknown,
  ctx: PassCtx,
): Promise<{ parsed: unknown; issues: CheckIssue[] }> {
  let current = parsed;
  const issues: CheckIssue[] = [];
  for (const id of checkIds) {
    const c = PASSES[id];
    if (!c || c.phase !== 'transform') continue;
    const r = await c.run(current, ctx);
    if ('parsed' in r) current = r.parsed;
  }
  for (const id of checkIds) {
    const c = PASSES[id];
    if (!c || c.phase !== 'validate') continue;
    const r = await c.run(current, ctx);
    if ('issues' in r) issues.push(...r.issues);
  }
  return { parsed: current, issues };
}
