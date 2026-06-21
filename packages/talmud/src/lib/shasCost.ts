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
 * been warmed on. The clean separator is the producer's OWN distinct-daf
 * coverage (`coverageDapim`, supplied by cache-stats): warmedAmudim =
 * coverageDapim, so multiplicity = count / coverageDapim exactly, with no
 * dependence on any other producer. When that is present we use it directly.
 *
 * When it is absent we fall back to a `frontier` proxy: the most-covered mark's
 * count stands in for "amudim that have been through the pipeline at all" (every
 * warmed amud fires the core marks). This proxy is fragile — it divides one
 * producer's count by ANOTHER producer's coverage, so a version-skew between an
 * enrichment and its target mark distorts the rate (the rabbi.*.evidence
 * pathology: the rabbi mark re-warmed a small subset after a version bump, so
 * dividing the broadly-warmed evidence count by the mark's small coverage read
 * ~3x too high). Hence coverageDapim is strongly preferred. Fallback rules:
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
 *   frontier         = min(amudim, max mark coverageCount)  // fallback only
 *   unitUsd          = costUsd / pricedCalls   // avg $/priced call (window-independent)
 *   warmedAmudim     = coverageDapim, else the frontier proxy (see rules above)
 *   instancesPerAmud = coverageCount / warmedAmudim         // >= 1
 *   fullShasUsd      = unitUsd * instancesPerAmud * amudim
 *   incurredUsd      = unitUsd * coverageCount              // est. cost to reach current coverage
 *   remainingUsd     = max(0, fullShasUsd - incurredUsd)
 *       Positive whenever warmedAmudim < amudim, so the lightly-warmed long tail
 *       — and a partly-warmed fan-out — still owe a pass.
 *       Residual caveat: in the fallback path a fan-out enrichment with count <=
 *       frontier reads as once-per-amud, so its remaining is a lower bound until
 *       it crosses the frontier. Conservative, and acceptable for an estimate.
 *
 * Demand-driven exclusion: `.qa` answerers are keyed per user question, not per
 * amud — there is no shas to warm — so they are NOT projected (fullShas =
 * incurred, remaining = 0). Their real incurred spend still appears.
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
   *  denominator for proven fan-outs ONLY when `coverageDapim` is absent).
   *  Ignored for marks. */
  target_mark?: string;
  /** Distinct dapim this producer is actually cached on, at the current cache
   *  version (English). When present this is the EXACT warmed-amud denominator —
   *  it makes `count / warmedAmudim` the true avg instances-per-warmed-daf,
   *  independent of the target mark's (possibly version-skewed) coverage. The
   *  target-mark proxy below is only a fallback for when this is unknown. */
  coverageDapim?: number;
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
  /** Demand-driven producer (a `.qa` answerer keyed per user question): there is
   *  no shas to warm, so it is NOT projected forward — fullShasUsd === incurredUsd
   *  and remainingUsd === 0. Its `instancesPerAmud` is informational only. */
  demandDriven: boolean;
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
    // EXACT denominator when cache-stats supplies the producer's own distinct-daf
    // coverage: instancesPerAmud = count / coverageDapim is the true avg
    // instances-per-warmed-daf. This is independent of the target mark, so it
    // does not distort when the mark and enrichment are at different warming
    // frontiers (e.g. the rabbi mark bumped a cache version and re-warmed only a
    // subset while rabbi.relationships.evidence stayed broadly warmed — the proxy
    // below then divided by the smaller mark coverage and overstated the rate).
    const cd = row?.coverageDapim;
    if (typeof cd === 'number' && cd > 0) return Math.min(cd, amudim || cd);
    // Fallback (no per-producer daf coverage): the original frontier heuristic.
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
      const incurredUsd = unitUsd * count;
      // `.qa` answerers are keyed per user QUESTION, not per amud — there is no
      // shas to warm, so projecting a per-amud fire-rate across all of shas is
      // meaningless (it invented a large phantom "remaining"). Count their real
      // incurred spend, but do not project: fullShas = incurred, remaining = 0.
      const demandDriven = kind === 'enrichment' && id.endsWith('.qa');
      const fullShasUsd = demandDriven ? incurredUsd : unitUsd * instancesPerAmud * amudim;
      const remainingUsd = demandDriven ? 0 : Math.max(0, fullShasUsd - incurredUsd);
      rows.push({
        id,
        kind,
        unitUsd,
        instancesPerAmud,
        coverageCount: count,
        fullShasUsd,
        incurredUsd,
        remainingUsd,
        demandDriven,
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
