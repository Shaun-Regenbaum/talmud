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
import { reanchorArgument, reanchorArgumentMove, reanchorPesukim, reanchorAggadata } from '../place/reanchor';

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

export const CHECKS: Record<string, PostCheck> = {
  'reanchor-argument': transform('reanchor-argument', reanchorArgument),
  'reanchor-argument-move': transform('reanchor-argument-move', reanchorArgumentMove),
  'reanchor-pesukim': transform('reanchor-pesukim', reanchorPesukim),
  'reanchor-aggadata': transform('reanchor-aggadata', reanchorAggadata),
  'hebrew-excerpt': hebrewExcerpt,
  'hebrew-gloss': hebrewGloss,
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
