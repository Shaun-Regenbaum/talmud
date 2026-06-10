/**
 * runProducer — the ONE corpus-agnostic producer-run orchestration (stage 4b of
 * the run-layer extraction). It reproduces the talmud worker's runMarkOnce +
 * runEnrichmentOnce control flow as a single skeleton whose branches are driven
 * by `kind` ('mark' | 'enrich') plus definition properties; everything
 * app-specific (key derivation, source resolution, the LLM call + telemetry,
 * the check layer, the id-keyed short-circuits) enters through
 * {@link RunProducerPorts}. The host's runMarkOnce / runEnrichmentOnce become
 * thin shims over this function, so the recursion injected into
 * `ResolveInputsPorts.runEnrichment` / `runMark` closes through core.
 *
 * Behavior contract: ZERO observable change vs the two legacy bodies — locked
 * by the host's characterization suite (run-contract, envelope-roundtrip,
 * resolve-deps-characterization, producer-key-golden). The ONE addition is the
 * `provenance` build manifest stamped (additively) on every fresh cache write —
 * see {@link buildRunProvenance}.
 *
 * Divergences between the two legacy bodies, preserved per kind branch:
 *   - cache-key lang: marks namespace `:he` only when the extractor HAS a
 *     Hebrew prompt (identical EN output otherwise — no point fanning the
 *     cache); enrichments always key by request lang.
 *   - section_range guard: enrichments only (marks key per-daf, no volatile
 *     title in the key).
 *   - recipe_hash: enrichments stamp it; marks never have (so far).
 *   - parentChain: a mark RESETS the cycle-detection chain (its deps are a
 *     fresh tree); an enrichment EXTENDS the chain with its own id.
 *   - prompt vars: enrichments add mark_input / user_question / hook vars.
 *   - usage attribution: marks record usage BEFORE building the result
 *     envelope; enrichments after the cache-write gating. (Both fire-and-
 *     forget; order kept to mirror the originals exactly.)
 *   - check gating condition text: mark `if (parsed && passes)`, enrichment
 *     `if (parsed && !parse_error && passes)` — same outcomes (parsed is only
 *     non-null when parse succeeded), both kept verbatim.
 *   - stored-envelope field ORDER differs per kind (mark: cost, check_issues,
 *     lint_issues; enrichment: recipe_hash, cost, deps/anchors_resolved,
 *     lint_issues, check_issues, section_range) — JSON.stringify preserves
 *     insertion order, so this is part of the byte contract.
 */

import { instanceIdOf, normalizeQualifier, qualifierHash } from '../cache/keys.ts';
import type { CostStamp, InputRef, Provenance } from '../model/provenance.ts';
import { authorityForTransport } from '../model/provenance.ts';
import type { StoredArtifact } from '../store/envelope.ts';
import type { ResolvedInputs, RunDependency } from './producer-run.ts';

export type RunLang = 'en' | 'he';

/** The slice of an LLM call result the orchestration consumes — structurally
 *  satisfied by the host's LLMResult. */
export interface LLMResultLike {
  content: string;
  reasoning_content?: string;
  usage: unknown;
  prompt_chars: number;
  elapsed_ms: number;
  model: string;
  transport: string;
  attempts: number;
}

/** Minimal structural view of a mark extractor. The host's richer union
 *  (llm | computed | …) flows through unchanged; core only branches on `kind`
 *  and reads the prompt/schema/fan-out fields for kind='llm'. */
export interface MarkExtractorLike {
  kind: string;
  system_prompt?: string;
  user_prompt_template?: string;
  system_prompt_he?: string;
  user_prompt_template_he?: string;
  output_schema?: unknown;
  fan_out_over?: string;
}

/** Minimal structural view of a mark definition the run needs. */
export interface MarkRunDef {
  id: string;
  cache_version: string;
  dependencies?: ReadonlyArray<RunDependency>;
  passes?: ReadonlyArray<string>;
  extractor: MarkExtractorLike;
}

/** Minimal structural view of a (flattened, studio-registry-shaped) enrichment
 *  definition the run needs. */
export interface EnrichmentRunDef {
  id: string;
  cache_version: string;
  /** ID of the mark whose instances feed this enrichment. */
  mark: string;
  dependencies?: ReadonlyArray<RunDependency>;
  passes?: ReadonlyArray<string>;
  system_prompt: string;
  user_prompt_template: string;
  system_prompt_he?: string;
  user_prompt_template_he?: string;
  output_schema?: unknown;
}

/** A post-generation check issue. Only `severity === 'hard'` is meaningful to
 *  the orchestration (gates the cache write); everything else passes through. */
export interface CheckIssueLike {
  severity?: string;
}

export interface RunProducerOpts {
  bypassCache: boolean;
  /** Output language for prompts + cache keys (the host's rc.lang). */
  lang: RunLang;
  /** Enrichments only: per-call model override — skips the canonical cache
   *  (cacheKey = null) to avoid polluting the default-traffic key. */
  modelOverride?: string;
  /** Enrichments only: cycle-detection ancestry. Marks always reset it. */
  parentChain?: ReadonlySet<string>;
  /** Enrichments only: free-text qualifier (e.g. the user's question for
   *  argument-move.qa). Hashed into the cache key when present, and exposed
   *  to the prompt template as {{user_question}}. */
  userQuestion?: string;
}

/** Everything app-specific the orchestration calls out to. */
export interface RunProducerPorts<
  Ctx,
  EDef extends EnrichmentRunDef = EnrichmentRunDef,
  MDef extends MarkRunDef = MarkRunDef,
> {
  /** KV envelope read/write — the host's readCachedResult / writeCachedResult
   *  byte-for-byte (no TTL; bump cache_version to invalidate). */
  cacheRead(ctx: Ctx, key: string): Promise<StoredArtifact | null>;
  cacheWrite(ctx: Ctx, key: string, value: StoredArtifact): Promise<void>;
  /** Key derivation — MUST be the same keyForMark / keyForEnrichment the app
   *  has always used (a derivation change cold-misses every warmed entry). */
  markKey(def: MDef, tractate: string, page: string, lang: RunLang): string;
  enrichmentKey(
    def: EDef,
    instanceId: string,
    tractate: string,
    page: string,
    qualifier: string | undefined,
    lang: RunLang,
  ): string;
  /** Content hash of the enrichment's recipe (the host projects its flat def
   *  into the recipe shape, then recipeHash()). Stamped on every fresh
   *  enrichment write; marks don't stamp one (legacy behavior, preserved). */
  enrichmentRecipeHash(def: EDef): Promise<string>;
  /** The segment-range stamp guarding title-keyed section enrichments
   *  (null = no guard). App-specific (`def.mark === 'argument'` in talmud). */
  sectionRange(def: EDef, markInput: unknown): string | null;
  /** The dependency walk (resolveInputs wired to the app's source resolvers +
   *  these same producer runs). */
  resolveInputs(
    ctx: Ctx,
    dependencies: ReadonlyArray<RunDependency> | undefined,
    tractate: string,
    page: string,
    markInput: unknown,
    bypassCache: boolean,
    parentChain: ReadonlySet<string>,
  ): Promise<ResolvedInputs>;
  renderTemplate(tpl: string, vars: Record<string, unknown>): string;
  /** The mark LLM call: the host owns option construction (model/fallback/
   *  attribution/tag) AND the fan_out_over branch; core owns when it's called
   *  and with which (he-fallback-selected) templates + vars. */
  markLLM(
    ctx: Ctx,
    args: {
      def: MDef;
      sysTpl: string;
      usrTpl: string;
      vars: Record<string, unknown>;
      useHe: boolean;
      tractate: string;
      page: string;
      bypassCache: boolean;
    },
  ): Promise<{ result: LLMResultLike; systemPrompt: string; userPrompt: string }>;
  /** The enrichment LLM call (host owns options: model override / reasoning /
   *  cost_class / attribution). Prompts are already rendered by core. */
  enrichmentLLM(
    ctx: Ctx,
    args: {
      def: EDef;
      systemPrompt: string;
      userPrompt: string;
      useHe: boolean;
      tractate: string;
      page: string;
      bypassCache: boolean;
      modelOverride?: string;
    },
  ): Promise<LLMResultLike>;
  /** The post-generation check layer (the host fetches whatever context its
   *  passes need — segment grid, commentary text, the yerushalmi floor stashed
   *  in inputs.vars — and runs its pass registry). Core gates on the returned
   *  issues' `severity === 'hard'`. */
  runChecks(
    ctx: Ctx,
    args: {
      kind: 'mark' | 'enrich';
      def: EDef | MDef;
      parsed: unknown;
      tractate: string;
      page: string;
      lang: RunLang;
      inputs: ResolvedInputs;
    },
  ): Promise<{ parsed: unknown; issues: CheckIssueLike[] }>;
  /** Bounded lint retry: returns true when the hard-failing output should be
   *  pinned anyway (MAX_LINT_ATTEMPTS reached) — the host's noteLintAttempt. */
  lintGate(
    ctx: Ctx,
    cacheKey: string,
    info: {
      producerId: string;
      tractate: string;
      page: string;
      lang: RunLang;
      issues: unknown[];
    },
  ): Promise<boolean>;
  /** The per-entry cost stamp (host pricing helpers). */
  costStamp(
    model: string | undefined,
    usage: unknown,
    lang: RunLang,
    cacheVersion: string,
  ): CostStamp;
  /** Daily-rollup usage attribution for a fresh LLM call (fire-and-forget). */
  recordUsage(
    ctx: Ctx,
    args: {
      kind: 'mark' | 'enrichment';
      id: string;
      result: { model?: string; usage?: unknown; parse_error?: string | null };
    },
  ): void;
  /** Id-keyed app short-circuits + adjustments, cut (not copied) from the two
   *  legacy bodies. Each either fully produces the result (skip the LLM) or
   *  adjusts vars / the resolved inputs. */
  hooks: {
    /** The computed-extractor branch (deterministic, no LLM): produce the FULL
     *  result envelope (model `computed:<fn>`, transport 'computed', …). Core
     *  owns its cache read/write (always on the EN key). */
    computedMark(ctx: Ctx, def: MDef, tractate: string, page: string): Promise<StoredArtifact>;
    /** Mark post-parse processing (after the check passes): rabbi registry
     *  grounding, places backlog logging. Returns the (possibly transformed)
     *  parsed value. */
    markPostParse(
      ctx: Ctx,
      args: {
        def: MDef;
        parsed: unknown;
        vars: Record<string, unknown>;
        tractate: string;
        page: string;
      },
    ): Promise<unknown>;
    /** Enrichment pre-resolve short-circuits (rabbi.relationships graph,
     *  rabbi.identity lookup): a non-null return is the finished result —
     *  core writes it (with provenance) and returns. */
    enrichmentPreResolve(
      ctx: Ctx,
      args: {
        def: EDef;
        markInput: unknown;
        tractate: string;
        page: string;
        recipeHash: string;
      },
    ): Promise<StoredArtifact | null>;
    /** Enrichment post-resolve step (deps are resolved, LLM not yet called):
     *  may fully produce (rabbi.observations — `shortCircuit`), and/or return
     *  extra prompt vars (the pesukim Hebrew prefetch), and/or mutate
     *  `inputs` in place (argument move-scoping). */
    enrichmentPostResolve(
      ctx: Ctx,
      args: {
        def: EDef;
        inputs: ResolvedInputs;
        markInput: unknown;
        tractate: string;
        page: string;
      },
    ): Promise<{ shortCircuit?: StoredArtifact; vars?: Record<string, unknown> }>;
    /** Enrichment post-parse side effects (daf-background.concepts backlog). */
    enrichmentPostParse(
      ctx: Ctx,
      args: {
        def: EDef;
        parsed: unknown;
        parse_error: string | null;
        tractate: string;
        page: string;
      },
    ): void;
  };
}

/** Resolved prompts are dev-only inspection; cap each at 2KB so multi-run
 *  responses don't balloon (the full prompt already went to the LLM). */
function capPrompt(s: string): string {
  return s.length > 2000 ? `${s.slice(0, 2000)}… [+${s.length - 2000} chars]` : s;
}

/** JSON of a resolved input value with its TOP-LEVEL object keys sorted.
 *  SHALLOW on purpose: the bucket values are produced deterministically by
 *  their own producers (so nested order is already stable per producer run);
 *  the shallow sort only removes the one source of nondeterminism we introduce
 *  ourselves — object key insertion order under the parallel dependency walk.
 *  Arrays keep their order (it is semantic). */
function shallowStableJson(v: unknown): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = src[k];
    return JSON.stringify(out);
  }
  return JSON.stringify(v);
}

/** One InputRef per resolved dependency: `sourceKey` is the dep id exactly as
 *  it appears in deps_resolved / anchors_resolved (depends first, then
 *  anchors, each id-sorted so the manifest is stable run-to-run), and
 *  `contentHash` fingerprints the resolved VALUE — qualifierHash over its
 *  shallow-stable JSON. (qualifierHash normalizes whitespace/case before
 *  hashing; that's fine for a change-detection fingerprint, which is all this
 *  is — it is NOT a canonical content address.) */
export async function provenanceInputRefs(
  resolved: Pick<ResolvedInputs, 'depends' | 'anchors'> | null,
): Promise<InputRef[]> {
  if (!resolved) return [];
  const refs: InputRef[] = [];
  for (const bucket of [resolved.depends, resolved.anchors]) {
    for (const key of Object.keys(bucket).sort()) {
      refs.push({
        sourceKey: key,
        contentHash: await qualifierHash(shallowStableJson(bucket[key])),
      });
    }
  }
  return refs;
}

/** The build manifest stamped on every FRESH cache write. Strictly additive:
 *  every legacy top-level field (content/model/usage/recipe_hash/cost/…) keeps
 *  being dual-written unchanged; `provenance` is appended after them. The
 *  recipeHash is the SAME recipe_hash already stamped at top level (never a
 *  second hash; absent on marks, which never stamped one). */
export async function buildRunProvenance(
  out: StoredArtifact,
  producerId: string,
  resolved: Pick<ResolvedInputs, 'depends' | 'anchors'> | null,
): Promise<Provenance> {
  return {
    authority: authorityForTransport(out.transport),
    producerId,
    recipeHash: out.recipe_hash,
    inputs: await provenanceInputRefs(resolved),
    model: out.model,
    transport: out.transport,
    usage: out.usage,
    cost: out.cost,
    createdAt: new Date().toISOString(),
  };
}

/** Stamp + write + RETURN the stamped envelope. Provenance follows the same
 *  lifecycle as recipe_hash/cost: stamped into the envelope at generation,
 *  present on the fresh return AND on later cache-hit reads — additive JSON
 *  consumers ignore unless they want it. (Returning the unstamped object would
 *  make fresh responses and cache-hit responses diverge for no reason.) */
async function writeWithProvenance<Ctx>(
  ports: Pick<RunProducerPorts<Ctx>, 'cacheWrite'>,
  ctx: Ctx,
  key: string,
  out: StoredArtifact,
  producerId: string,
  resolved: Pick<ResolvedInputs, 'depends' | 'anchors'> | null,
): Promise<StoredArtifact> {
  const provenance = await buildRunProvenance(out, producerId, resolved);
  // Spread-then-append keeps every legacy field at its original position in
  // the serialized JSON; `provenance` lands last (old readers ignore it).
  const stamped = { ...out, provenance };
  await ports.cacheWrite(ctx, key, stamped);
  return stamped;
}

/**
 * Run one producer (mark or enrichment): cache-first, dependency-fed, LLM- or
 * rule-backed, check-gated, cost-stamped — and, on every fresh write, stamped
 * with its provenance build manifest. `markInput` is the enrichment's target
 * instance (ignored for marks).
 */
export async function runProducer<
  Ctx,
  EDef extends EnrichmentRunDef = EnrichmentRunDef,
  MDef extends MarkRunDef = MarkRunDef,
>(
  ports: RunProducerPorts<Ctx, EDef, MDef>,
  ctx: Ctx,
  kind: 'mark' | 'enrich',
  def: EDef | MDef,
  tractate: string,
  page: string,
  markInput: unknown,
  opts: RunProducerOpts,
): Promise<StoredArtifact> {
  const { bypassCache, lang } = opts;
  const isMark = kind === 'mark';
  const mdef = def as MDef;
  const edef = def as EDef;

  // -------------------------------------------------------------------------
  // Mark: computed extractors — deterministic, no LLM. Same cache shape as LLM
  // results so the rest of the pipeline is uniform. Computed marks are
  // deterministic + language-neutral, so they stay on the English (suffix-free)
  // key regardless of lang.
  // -------------------------------------------------------------------------
  if (isMark && mdef.extractor.kind === 'computed') {
    const cacheKey = ports.markKey(mdef, tractate, page, 'en');
    if (!bypassCache) {
      const hit = await ports.cacheRead(ctx, cacheKey);
      if (hit) return { ...hit, cache_hit: true };
    }
    const out = await ports.hooks.computedMark(ctx, mdef, tractate, page);
    return writeWithProvenance(ports, ctx, cacheKey, out, mdef.id, null);
  }
  if (isMark && mdef.extractor.kind !== 'llm') {
    throw new Error(`mark ${mdef.id} extractor.kind=${mdef.extractor.kind} not supported`);
  }

  // -------------------------------------------------------------------------
  // Cache key + hit check. The two kinds' key/lang policies genuinely differ —
  // see the divergence list in the module doc.
  // -------------------------------------------------------------------------
  let cacheKey: string | null;
  let useHe: boolean;
  let sectionRange: string | null = null;
  let recipe_hash: string | undefined;

  if (isMark) {
    // Only fan the cache out by language when this mark actually has a Hebrew
    // prompt — otherwise the :he run would produce byte-identical English
    // structure and just waste a cache slot + an LLM call.
    useHe = lang === 'he' && !!mdef.extractor.system_prompt_he;
    cacheKey = ports.markKey(mdef, tractate, page, useHe ? 'he' : 'en');
    if (!bypassCache) {
      const hit = await ports.cacheRead(ctx, cacheKey);
      if (hit) return { ...hit, cache_hit: true };
    }
  } else {
    // Select the Hebrew prompt variant when lang='he' AND the def provides
    // one; otherwise fall back to English (an enrichment without a *_he
    // prompt still works in he mode — it just produces English prose).
    useHe = lang === 'he';
    const instance_id = await instanceIdOf(markInput);
    const qHash = opts.userQuestion ? await qualifierHash(opts.userQuestion) : undefined;
    cacheKey = opts.modelOverride
      ? // Per-call model overrides skip the canonical cache to avoid polluting
        // the default-traffic key. Re-running with the same override hits the
        // gateway prompt cache but not KV — consistent with bypass behavior.
        null
      : ports.enrichmentKey(edef, instance_id, tractate, page, qHash, lang);
    // Section enrichments key by title (see instanceIdOf); guard against a
    // drifted title serving another section's cache by validating the stamped
    // range. Null for non-section enrichments (no guard).
    sectionRange = ports.sectionRange(edef, markInput);
    if (cacheKey && !bypassCache) {
      const hit = await ports.cacheRead(ctx, cacheKey);
      // Reject a hit whose stamped range doesn't match the requested section
      // (covers both a drifted title AND legacy entries with no stamp).
      if (hit && (!sectionRange || hit.section_range === sectionRange)) {
        return { ...hit, cache_hit: true };
      }
    }
    // Content hash of this producer's recipe, stamped on every fresh write so
    // staleness can be detected later. Computed once here, after the
    // cache-hit early-return so hits don't pay for it.
    recipe_hash = await ports.enrichmentRecipeHash(edef);

    // Deterministic pre-resolve short-circuits (graph / lookup) — a non-null
    // return is the finished result.
    const pre = await ports.hooks.enrichmentPreResolve(ctx, {
      def: edef,
      markInput,
      tractate,
      page,
      recipeHash: recipe_hash,
    });
    if (pre) {
      if (cacheKey) return writeWithProvenance(ports, ctx, cacheKey, pre, edef.id, null);
      return pre;
    }
  }

  // -------------------------------------------------------------------------
  // Dependency walk. A mark RESETS the cycle chain; an enrichment EXTENDS it.
  // -------------------------------------------------------------------------
  let chain: ReadonlySet<string>;
  if (isMark) {
    chain = new Set();
  } else {
    const next = new Set(opts.parentChain ?? []);
    next.add(edef.id);
    chain = next;
  }
  const inputs = await ports.resolveInputs(
    ctx,
    def.dependencies,
    tractate,
    page,
    isMark ? undefined : markInput,
    bypassCache,
    chain,
  );

  // Enrichment post-resolve step: deterministic full-produce (observations),
  // extra prompt vars (pesukim prefetch), in-place input scoping (argument
  // move-scoping).
  let extraVars: Record<string, unknown> = {};
  if (!isMark) {
    const post = await ports.hooks.enrichmentPostResolve(ctx, {
      def: edef,
      inputs,
      markInput,
      tractate,
      page,
    });
    if (post.shortCircuit) {
      const out = post.shortCircuit;
      if (cacheKey) return writeWithProvenance(ports, ctx, cacheKey, out, edef.id, inputs);
      return out;
    }
    extraVars = post.vars ?? {};
  }

  // -------------------------------------------------------------------------
  // Prompt vars + the LLM call (he-prompt fallback selected here; the host
  // owns option construction and the mark fan-out).
  // -------------------------------------------------------------------------
  const vars: Record<string, unknown> = isMark
    ? {
        ...inputs.vars,
        depends: inputs.depends,
        anchors: inputs.anchors,
      }
    : {
        ...inputs.vars,
        mark_input: markInput,
        ...extraVars,
        depends: inputs.depends,
        anchors: inputs.anchors,
        // Normalized so prompts see a clean version even when the user submits
        // sloppy whitespace/casing. Empty string when absent so
        // {{user_question}} is safe to interpolate in any prompt.
        user_question: opts.userQuestion ? normalizeQualifier(opts.userQuestion) : '',
      };
  let result: LLMResultLike;
  let systemPrompt: string;
  let userPrompt: string;
  if (isMark) {
    const ext = mdef.extractor;
    const sysTpl = (
      useHe && ext.system_prompt_he ? ext.system_prompt_he : ext.system_prompt
    ) as string;
    const usrTpl = (
      useHe && ext.user_prompt_template_he ? ext.user_prompt_template_he : ext.user_prompt_template
    ) as string;
    const r = await ports.markLLM(ctx, {
      def: mdef,
      sysTpl,
      usrTpl,
      vars,
      useHe,
      tractate,
      page,
      bypassCache,
    });
    result = r.result;
    systemPrompt = r.systemPrompt;
    userPrompt = r.userPrompt;
  } else {
    const sysTpl = useHe && edef.system_prompt_he ? edef.system_prompt_he : edef.system_prompt;
    const usrTpl =
      useHe && edef.user_prompt_template_he
        ? edef.user_prompt_template_he
        : edef.user_prompt_template;
    systemPrompt = ports.renderTemplate(sysTpl, vars);
    userPrompt = ports.renderTemplate(usrTpl, vars);
    result = await ports.enrichmentLLM(ctx, {
      def: edef,
      systemPrompt,
      userPrompt,
      useHe,
      tractate,
      page,
      bypassCache,
      modelOverride: opts.modelOverride,
    });
  }

  // -------------------------------------------------------------------------
  // Parse + check layer + post-processing.
  // -------------------------------------------------------------------------
  const outputSchema = isMark ? mdef.extractor.output_schema : edef.output_schema;
  let parsed: unknown = null;
  let parse_error: string | null = null;
  if (outputSchema) {
    try {
      parsed = JSON.parse(result.content);
    } catch (err) {
      parse_error = String(err).slice(0, 200);
    }
  }

  let checkIssues: unknown[] | undefined; // all severities → observation
  let hardIssues: unknown[] | undefined; // hard subset → gating + /api/usage
  // The conditions differ textually between the legacy bodies (mark omitted
  // `!parse_error`); outcomes are identical — parsed is only non-null when the
  // parse succeeded — but both are kept verbatim.
  const wantChecks = isMark
    ? Boolean(parsed && def.passes && def.passes.length > 0)
    : Boolean(parsed && !parse_error && def.passes && def.passes.length > 0);
  if (wantChecks) {
    const checked = await ports.runChecks(ctx, {
      kind,
      def,
      parsed,
      tractate,
      page,
      lang,
      inputs,
    });
    parsed = checked.parsed;
    if (checked.issues.length > 0) {
      checkIssues = checked.issues;
      const hard = checked.issues.filter((i) => i.severity === 'hard');
      if (hard.length > 0) hardIssues = hard;
    }
  }

  if (isMark) {
    // markPostParse sees the same prompt vars the LLM call did
    // (postProcessRabbi reads the daf Hebrew off vars.hebrew).
    parsed = await ports.hooks.markPostParse(ctx, { def: mdef, parsed, vars, tractate, page });
    // Attribute this fresh LLM call's tokens + cost to the daily rollup.
    // (Marks recorded usage BEFORE building the envelope; preserved.)
    ports.recordUsage(ctx, {
      kind: 'mark',
      id: mdef.id,
      result: { model: result.model, usage: result.usage, parse_error },
    });
  } else {
    ports.hooks.enrichmentPostParse(ctx, { def: edef, parsed, parse_error, tractate, page });
  }

  // -------------------------------------------------------------------------
  // Result envelope — field order is per-kind and part of the byte contract.
  // -------------------------------------------------------------------------
  const head = {
    content: result.content,
    reasoning: result.reasoning_content || undefined,
    parsed,
    parse_error,
    model: result.model,
    transport: result.transport,
    attempts: result.attempts,
    usage: result.usage,
    elapsed_ms: result.elapsed_ms,
    prompt_chars: result.prompt_chars,
    resolved: {
      system_prompt: capPrompt(systemPrompt),
      user_prompt: capPrompt(userPrompt),
    },
    cache_hit: false,
  };
  const cost = ports.costStamp(result.model, result.usage, useHe ? 'he' : 'en', def.cache_version);
  const out: StoredArtifact = isMark
    ? {
        ...head,
        cost,
        ...(checkIssues ? { check_issues: checkIssues } : {}),
        ...(hardIssues ? { lint_issues: hardIssues } : {}),
      }
    : {
        ...head,
        recipe_hash,
        cost,
        deps_resolved: Object.keys(inputs.depends).length > 0 ? inputs.depends : undefined,
        anchors_resolved: Object.keys(inputs.anchors).length > 0 ? inputs.anchors : undefined,
        ...(hardIssues ? { lint_issues: hardIssues } : {}),
        ...(checkIssues ? { check_issues: checkIssues } : {}),
        ...(sectionRange ? { section_range: sectionRange } : {}),
      };

  // -------------------------------------------------------------------------
  // Cache write, gated on hard check issues, BOUNDED. A clean output (or one
  // with only soft issues) is pinned; a hard-failing one is left uncached so
  // the next request regenerates — until MAX_LINT_ATTEMPTS (lintGate returns
  // true), then pinned anyway so a persistently-failing card stops re-paying.
  // -------------------------------------------------------------------------
  let final: StoredArtifact = out;
  if (cacheKey && !parse_error) {
    if (!hardIssues) {
      final = await writeWithProvenance(ports, ctx, cacheKey, out, def.id, inputs);
    } else if (
      await ports.lintGate(ctx, cacheKey, {
        producerId: def.id,
        tractate,
        page,
        lang,
        issues: hardIssues,
      })
    ) {
      final = await writeWithProvenance(ports, ctx, cacheKey, out, def.id, inputs);
    }
  }
  if (!isMark) {
    // Attribute this fresh LLM call's tokens + cost to the daily rollup.
    // (Enrichments recorded usage AFTER the write gating; preserved.)
    ports.recordUsage(ctx, {
      kind: 'enrichment',
      id: edef.id,
      result: { model: result.model, usage: result.usage, parse_error },
    });
  }
  return final;
}
