/**
 * Estimate what it costs to warm the WHOLE shas — at full depth, every producer
 * on every amud — from the data the usage dashboard already has on hand.
 *
 * Why this exists: the old "projection" on the usage page divided the recent
 * priced spend by the single most-covered mark's daf count. That conflated a
 * rolling window's cost with cumulative coverage and, once any one mark passed
 * 100%, reported ~$0 remaining — which is wrong, because coverage is wildly
 * uneven (the core marks are ~100% but the long tail of essay-style enrichments
 * is <2%). This computes the cost PER PRODUCER against its own fire-rate, then
 * sums, so the lightly-warmed tail is counted honestly.
 *
 * The hard part is that one cumulative cache count conflates two things — how
 * often a producer fires per amud (its multiplicity) and how many amudim it has
 * been warmed on. We separate them with a `frontier`: the most-covered mark's
 * count is a proxy for "amudim that have been through the pipeline at all"
 * (every amud that's warmed fires the core marks). Then:
 *
 *   - A mark caches once per amud, so its multiplicity is 1 and warmedAmudim =
 *     min(count, frontier).
 *   - An enrichment with count <= frontier is treated as once-per-amud
 *     (warmedAmudim = count, multiplicity 1). It may genuinely fan out, but with
 *     count below the frontier we can't tell multiplicity from under-warming, so
 *     we take the conservative reading.
 *   - An enrichment with count > frontier is PROVABLY a fan-out (more cache
 *     entries than there are warmed amudim). Its distinct warmed amudim is then
 *     its target_mark's coverage (the mark it fires off of), clamped to the
 *     frontier; multiplicity = count / warmedAmudim. We use target_mark only
 *     here, where count>frontier already proves fan-out — using it
 *     unconditionally would blow up enrichments whose nominal target mark is
 *     barely warmed (e.g. argument-overview.flow vs the sparse argument-overview
 *     mark). If target_mark coverage is missing, we fall back to the frontier.
 *
 * Method (per producer):
 *   frontier         = min(amudim, max mark coverageCount)  // amudim warmed at all
 *   unitUsd          = costUsd / pricedCalls   // avg $/priced call (window-independent)
 *   warmedAmudim     = distinct amudim warmed (see rules above)
 *   instancesPerAmud = coverageCount / warmedAmudim         // >= 1
 *   fullShasUsd      = unitUsd * instancesPerAmud * amudim
 *   incurredUsd      = unitUsd * coverageCount              // est. cost to reach current coverage
 *   remainingUsd     = max(0, fullShasUsd - incurredUsd)
 *       Positive whenever warmedAmudim < amudim, so the lightly-warmed long tail
 *       — and a partly-warmed fan-out — still owe a pass.
 *       Residual caveat: a fan-out enrichment with count <= frontier reads as
 *       once-per-amud, so its remaining is a lower bound until it crosses the
 *       frontier. Conservative, and acceptable for an estimate.
 *
 * Workers-AI gross-up: the in-app price table covers OpenRouter models but
 * leaves Workers-AI (`@cf/*`) at $0, so per-producer unitUsd misses that spend.
 * The AI Gateway analytics DOES bill it. We scale the priced total by
 * (gatewayTotal / gatewayPriced) so the headline isn't blind to the ~Workers-AI
 * share. This is a blended adjustment (assumes Workers-AI spend is spread across
 * producers in rough proportion to priced spend), not a per-producer figure —
 * the per-producer rows stay in priced/OpenRouter terms.
 *
 * Everything here is a labelled ESTIMATE: unit cost drifts as prompts/models
 * change, low-sample producers have noisy unit costs, and the fire-rate is
 * inferred. It is for budgeting intuition, not invoicing — the AI Gateway total
 * remains authoritative for money actually spent.
 */

/** A cost bucket as the usage rollup emits it (UsageBucket subset). */
export interface CostBucketLike {
  costUsd: number;
  pricedCalls: number;
}

/** A cache-coverage row (CacheStats mark/enrichment row subset). */
export interface CoverageRowLike {
  id: string;
  count: number;
  /** Enrichment only: the mark it fires off of (used as the warmed-amud
   *  denominator for proven fan-outs). Ignored for marks. */
  target_mark?: string;
}

/** An AI Gateway per-model row (subset) for the Workers-AI gross-up. */
export interface GatewayModelLike {
  provider?: string;
  costUsd: number;
}

export interface ShasCostInput {
  /** Total amudim in shas (the warming unit). */
  amudim: number;
  byMark: Record<string, CostBucketLike>;
  byEnrichment: Record<string, CostBucketLike>;
  marks: CoverageRowLike[];
  enrichments: CoverageRowLike[];
  /** AI Gateway byModel rows; omit to skip the Workers-AI gross-up (ratio 1). */
  gatewayByModel?: GatewayModelLike[];
}

export interface ProducerCost {
  id: string;
  kind: 'mark' | 'enrichment';
  /** Average USD per priced call. */
  unitUsd: number;
  /** Inferred fire-rate per amud (>= 1). */
  instancesPerAmud: number;
  /** Current cached entries (English, current cache version). */
  coverageCount: number;
  /** Cost to run this producer across ALL of shas, priced terms. */
  fullShasUsd: number;
  /** Est. cost already spent to reach current coverage, priced terms. */
  incurredUsd: number;
  /** Est. cost still to pay to finish shas, priced terms. */
  remainingUsd: number;
}

export interface ShasCostTotals {
  fullShasUsd: number;
  incurredUsd: number;
  remainingUsd: number;
}

export interface ShasCostEstimate {
  available: boolean;
  amudim: number;
  /** Multiplier (>= 1) applied to priced totals to account for Workers-AI. */
  workersAiGrossUp: number;
  /** Priced (OpenRouter) totals — the per-producer rows sum to these. */
  priced: ShasCostTotals;
  /** Priced totals grossed up for Workers-AI, plus the headline $/amud. */
  grossed: ShasCostTotals & { perAmudUsd: number };
  /** Producers with a known unit cost, sorted by fullShasUsd desc. */
  byProducer: ProducerCost[];
}

/** Gross-up multiplier from gateway model rows: total / (total - workers-ai). */
export function workersAiGrossUp(byModel: GatewayModelLike[] | undefined): number {
  if (!byModel || byModel.length === 0) return 1;
  let total = 0;
  let priced = 0;
  for (const m of byModel) {
    const c = m.costUsd || 0;
    total += c;
    if (m.provider !== 'workers-ai') priced += c;
  }
  if (priced <= 0 || total <= priced) return 1;
  return total / priced;
}

export function estimateShasCost(input: ShasCostInput): ShasCostEstimate {
  const amudim = input.amudim;
  // Coverage kept per-kind so a mark and an enrichment that happen to share an
  // id never overwrite each other.
  const markCov = new Map<string, number>();
  for (const m of input.marks) markCov.set(m.id, m.count);
  const enrichCov = new Map<string, CoverageRowLike>();
  for (const e of input.enrichments) enrichCov.set(e.id, e);

  // Amudim that have been warmed at all: the most-covered mark is the best
  // proxy (every warmed amud fires the core marks). Clamp to amudim and >= 1.
  const maxMarkCoverage = input.marks.reduce((mx, m) => Math.max(mx, m.count), 0);
  const frontier = Math.max(1, Math.min(amudim || 1, maxMarkCoverage || amudim || 1));

  // Distinct amudim a producer has been warmed on (see the module doc).
  const warmedAmudimFor = (
    kind: 'mark' | 'enrichment',
    count: number,
    row?: CoverageRowLike,
  ): number => {
    if (count <= 0) return 0;
    if (kind === 'mark' || count <= frontier) return Math.min(count, frontier); // once-per-amud reading
    // count > frontier => provably a fan-out. Use its target_mark coverage as
    // the distinct-amud denominator, clamped to the frontier; fall back to the
    // frontier when that coverage is unknown.
    const tm = row?.target_mark ? markCov.get(row.target_mark) : undefined;
    const denom = tm && tm > 0 ? Math.min(tm, frontier) : frontier;
    return Math.max(1, denom);
  };

  const rows: ProducerCost[] = [];
  const build = (
    map: Record<string, CostBucketLike>,
    kind: 'mark' | 'enrichment',
    cov: (id: string) => CoverageRowLike | undefined,
  ): void => {
    for (const [id, b] of Object.entries(map)) {
      if (!b || b.pricedCalls <= 0) continue; // no priced calls -> no unit cost
      const unitUsd = b.costUsd / b.pricedCalls;
      if (!(unitUsd > 0)) continue; // unpriced (e.g. Workers-AI) -> handled by gross-up
      const row = cov(id);
      const count = row?.count ?? 0;
      const warmedAmudim = warmedAmudimFor(kind, count, row);
      const instancesPerAmud = count > 0 && warmedAmudim > 0 ? count / warmedAmudim : 1;
      const fullShasUsd = unitUsd * instancesPerAmud * amudim;
      const incurredUsd = unitUsd * count;
      const remainingUsd = Math.max(0, fullShasUsd - incurredUsd);
      rows.push({
        id,
        kind,
        unitUsd,
        instancesPerAmud,
        coverageCount: count,
        fullShasUsd,
        incurredUsd,
        remainingUsd,
      });
    }
  };
  build(input.byMark, 'mark', (id) => {
    const c = markCov.get(id);
    return c === undefined ? undefined : { id, count: c };
  });
  build(input.byEnrichment, 'enrichment', (id) => enrichCov.get(id));
  rows.sort((a, b) => b.fullShasUsd - a.fullShasUsd);

  const priced: ShasCostTotals = rows.reduce(
    (acc, r) => {
      acc.fullShasUsd += r.fullShasUsd;
      acc.incurredUsd += r.incurredUsd;
      acc.remainingUsd += r.remainingUsd;
      return acc;
    },
    { fullShasUsd: 0, incurredUsd: 0, remainingUsd: 0 },
  );

  const gross = workersAiGrossUp(input.gatewayByModel);
  const grossed = {
    fullShasUsd: priced.fullShasUsd * gross,
    incurredUsd: priced.incurredUsd * gross,
    remainingUsd: priced.remainingUsd * gross,
    perAmudUsd: amudim > 0 ? (priced.fullShasUsd * gross) / amudim : 0,
  };

  return {
    available: rows.length > 0 && amudim > 0,
    amudim,
    workersAiGrossUp: gross,
    priced,
    grossed,
    byProducer: rows,
  };
}
