/**
 * Producer input resolution — the corpus-agnostic dependency walk that feeds a
 * producer's prompt template (stage 4a of the run-layer extraction).
 *
 * A producer (mark or enrichment) declares what it is built from via
 * `dependencies` — the legacy grammar that `ProducerInput` (model/producer.ts)
 * normalizes for the registry. This module walks that array and assembles the
 * four observable buckets a run consumes:
 *
 *   vars     — template vars merged into the prompt context
 *   depends  — enrichment outputs keyed by dep id ({{depends.<id>}})
 *   anchors  — mark instance lists keyed by dep id ({{anchors.<id>}})
 *   sources  — bounded previews of the raw source TEXTS, for the inspector
 *
 * Everything app-specific enters through `ResolveInputsPorts`: source-text
 * resolvers ('gemara', 'commentaries', …) are injected closures, and the
 * recursive producer runs (`runEnrichment` / `runMark`) are injected callbacks
 * (they become the core runProducer in stage 4b). The walk itself — the
 * Promise.all parallelism, cycle detection, error-value shapes, fanOut, and
 * the sourcesOnly transitive source closure — is corpus-agnostic and lives
 * here. Behavior is locked by the host app's characterization tests
 * (resolve-deps-characterization.test.ts in packages/talmud).
 */

/** Legacy dependency grammar — the wire format of producer `dependencies`.
 *  A string names a source text ('gemara', 'commentaries', 'context', …);
 *  `{ enrichment: id }` / `{ mark: id }` reference other producers. */
export type RunDependency = string | { enrichment: string; fanOut?: boolean } | { mark: string };

export interface ResolvedInputs {
  /** Template vars to merge into the prompt context. */
  vars: Record<string, unknown>;
  /** Enrichment outputs keyed by dep id (returned to the client as deps_resolved). */
  depends: Record<string, unknown>;
  /** Mark instance lists keyed by dep id (returned as anchors_resolved). */
  anchors: Record<string, unknown>;
  /** Raw source TEXTS fed into the prompt, keyed by source name. Surfaced by
   *  the read-only run-sources inspector endpoint so a dev sees not just which
   *  enrichments/marks fed a piece but which TEXTS did — kept OFF the cached
   *  RunResult so it never bloats the reader hot path. `chars` is the full
   *  length; `content` is a bounded preview (the full text already went to the
   *  LLM; only the inspector needs to eyeball it). */
  sources: Record<string, { chars: number; content: string }>;
}

/** Bounded preview cap for a source text returned by the inspector — same
 *  posture as the 2KB resolved-prompt cap, but roomier since a dev may want to
 *  scan the actual text that grounded a generation. Keeps a single inspector
 *  response from shipping the full multi-KB context blob per source. */
export const SOURCE_PREVIEW_CAP = 8000;

/** Record a source text onto `out.sources` (no-op for empty/non-string). */
export function recordSource(out: ResolvedInputs, name: string, content: unknown): void {
  if (typeof content !== 'string' || content.length === 0) return;
  out.sources[name] = {
    chars: content.length,
    content:
      content.length > SOURCE_PREVIEW_CAP
        ? `${content.slice(0, SOURCE_PREVIEW_CAP)}… [+${content.length - SOURCE_PREVIEW_CAP} chars]`
        : content,
  };
}

/** What a string dependency's resolver receives. The resolver writes its
 *  template vars onto `args.out.vars` and records its source preview via
 *  `recordSource` — mirroring the branch it was cut from. */
export interface SourceResolverArgs<Ctx> {
  ctx: Ctx;
  /** The dependency token that invoked this resolver — lets one closure serve
   *  several tokens (e.g. 'context' vs 'context-light'). */
  name: string;
  out: ResolvedInputs;
  tractate: string;
  page: string;
  markInput: unknown;
  bypassCache: boolean;
  sourcesOnly: boolean;
}

/** Resolves one source-text dependency ('gemara', 'commentaries', …). */
export type SourceResolver<Ctx> = (args: SourceResolverArgs<Ctx>) => Promise<void>;

/** The minimal structural view of an enrichment definition the walk needs:
 *  its target mark (for fanOut) and its own dependencies (for the sourcesOnly
 *  transitive closure). The host's richer def type flows through unchanged. */
export interface EnrichmentDefLike {
  /** ID of the mark whose instances feed this enrichment (fanOut target). */
  mark: string;
  dependencies?: ReadonlyArray<RunDependency>;
}

/** The minimal structural view of a mark definition the walk needs. */
export interface MarkDefLike {
  dependencies?: ReadonlyArray<RunDependency>;
}

/** The slice of a producer run's result the walk consumes: `parsed ?? content`
 *  for enrichment deps, `parsed.instances ?? content` for mark deps. */
export interface RunOutputLike {
  content: string;
  parsed: unknown;
}

/** What the host app must provide. Everything app-specific enters here. */
export interface ResolveInputsPorts<
  Ctx,
  EDef extends EnrichmentDefLike = EnrichmentDefLike,
  MDef extends MarkDefLike = MarkDefLike,
> {
  /** Source resolvers by dependency token. Unknown string deps are a no-op
   *  (matching the original fall-through). */
  sources: Record<string, SourceResolver<Ctx>>;
  /** The source applied when a producer declares NO dependencies — the
   *  default-input foot-gun remover ('gemara' for the talmud app). */
  defaultSource: string;
  /** Definition lookups (KV-first with code fallback in the host). A null
   *  return yields the exact `{ error: 'not found' }` dep value. */
  loadEnrichmentDef(ctx: Ctx, id: string): Promise<EDef | null>;
  loadMarkDef(ctx: Ctx, id: string): Promise<MDef | null>;
  /** Run another producer (cache-first). Injected from the app in this stage;
   *  becomes the core runProducer in stage 4b. */
  runEnrichment(
    ctx: Ctx,
    def: EDef,
    tractate: string,
    page: string,
    markInput: unknown,
    bypassCache: boolean,
    parentChain: ReadonlySet<string>,
  ): Promise<RunOutputLike>;
  runMark(
    ctx: Ctx,
    def: MDef,
    tractate: string,
    page: string,
    bypassCache: boolean,
  ): Promise<RunOutputLike>;
}

/**
 * Walk `dependencies` and assemble the producer's resolved inputs.
 *
 * Mirrors the original resolveDependencies control flow exactly: all deps
 * resolve CONCURRENTLY (they're independent — each writes a distinct key in
 * out.vars/depends/anchors — and serial resolution stacked LLM latencies;
 * the host's queue concurrency still caps total simultaneous load), cycle
 * detection happens at the enrichment-dep boundary via `parentChain`, and
 * error values are stored (never thrown) so one bad dep degrades to an
 * `{ error }` template var instead of failing the whole run.
 */
export async function resolveInputs<Ctx, EDef extends EnrichmentDefLike, MDef extends MarkDefLike>(
  ports: ResolveInputsPorts<Ctx, EDef, MDef>,
  ctx: Ctx,
  dependencies: ReadonlyArray<RunDependency> | undefined,
  tractate: string,
  page: string,
  markInput: unknown,
  bypassCache: boolean,
  parentChain: ReadonlySet<string>,
  /** When true, resolve ONLY the deterministic source TEXTS (cached reads, no
   *  LLM). Instead of RUNNING the `{enrichment}` / `{mark}` deps (which would
   *  generate), it recurses into them to gather their transitive source
   *  closure — so an aggregate surfaces every text feeding its whole tree.
   *  Used by the read-only run-sources inspector endpoint, so opening the dev
   *  inspector never re-runs a model. */
  sourcesOnly = false,
): Promise<ResolvedInputs> {
  const out: ResolvedInputs = { vars: {}, depends: {}, anchors: {}, sources: {} };
  const resolveSource = async (name: string): Promise<void> => {
    const resolver = ports.sources[name];
    if (!resolver) return;
    await resolver({ ctx, name, out, tractate, page, markInput, bypassCache, sourcesOnly });
  };
  if (!dependencies || dependencies.length === 0) {
    // Default behavior: when no dependencies declared, hand the default source
    // through (matches pre-refactor buildDafContext behavior). Removes a
    // foot-gun when porting old extractors that omitted the field.
    await resolveSource(ports.defaultSource);
    return out;
  }
  await Promise.all(
    dependencies.map(async (dep) => {
      if (typeof dep === 'string') {
        // Unknown source tokens fall through silently (original behavior).
        await resolveSource(dep);
        return;
      }
      if (typeof dep === 'object' && dep !== null) {
        // Inspector source-only pass: don't RUN enrichment/mark deps (that's
        // generation) — recurse to collect their TRANSITIVE source closure, since
        // an aggregate's source texts are pulled by its children, not by itself
        // (e.g. a synthesis whose deps are all sub-enrichments). sourcesOnly stays
        // true at every level, so no model ever runs; parentChain guards cycles.
        if (sourcesOnly) {
          const childKey =
            'enrichment' in dep ? dep.enrichment : 'mark' in dep ? `mark:${dep.mark}` : null;
          if (!childKey || parentChain.has(childKey)) return;
          const childDef =
            'enrichment' in dep
              ? await ports.loadEnrichmentDef(ctx, dep.enrichment)
              : await ports.loadMarkDef(ctx, (dep as { mark: string }).mark);
          if (!childDef) return;
          const chain = new Set(parentChain);
          chain.add(childKey);
          // Enrichment children inherit the parent's markInput (mirrors the real
          // run); mark children take none (extractors ignore markInput).
          const childInput = 'enrichment' in dep ? markInput : undefined;
          const sub = await resolveInputs(
            ports,
            ctx,
            childDef.dependencies,
            tractate,
            page,
            childInput,
            bypassCache,
            chain,
            true,
          );
          Object.assign(out.sources, sub.sources);
          return;
        }
        if ('enrichment' in dep) {
          const depId = dep.enrichment;
          if (parentChain.has(depId)) {
            out.depends[depId] = {
              error: `cycle detected (${[...parentChain].join(' → ')} → ${depId})`,
            };
            return;
          }
          const depDef = await ports.loadEnrichmentDef(ctx, depId);
          if (!depDef) {
            out.depends[depId] = { error: 'not found' };
            return;
          }
          // fanOut: run this per-instance enrichment for EVERY instance of its
          // target mark and expose the array. Lets a whole-daf consumer (the
          // tidbit) pull in every story's / verse's / topic's analysis. Each
          // instance run resolves its own deps + scopes its context, and is
          // cache-keyed per instance — so on a warmed daf these are all hits.
          if ((dep as { fanOut?: boolean }).fanOut) {
            const markDef = await ports.loadMarkDef(ctx, depDef.mark);
            if (!markDef) {
              out.depends[depId] = { error: `mark ${depDef.mark} not found` };
              return;
            }
            let instances: unknown[] = [];
            try {
              const markRes = await ports.runMark(ctx, markDef, tractate, page, bypassCache);
              const parsed = markRes.parsed as { instances?: unknown[] } | null;
              instances = Array.isArray(parsed?.instances) ? parsed.instances : [];
            } catch (err) {
              out.depends[depId] = { error: String((err as Error)?.message ?? err) };
              return;
            }
            const results = await Promise.all(
              instances.map(async (inst) => {
                try {
                  const r = await ports.runEnrichment(
                    ctx,
                    depDef,
                    tractate,
                    page,
                    inst,
                    bypassCache,
                    parentChain,
                  );
                  return r.parsed ?? r.content;
                } catch {
                  return null;
                }
              }),
            );
            out.depends[depId] = results.filter((x) => x != null);
            return;
          }
          try {
            const result = await ports.runEnrichment(
              ctx,
              depDef,
              tractate,
              page,
              markInput,
              bypassCache,
              parentChain,
            );
            out.depends[depId] = result.parsed ?? result.content;
          } catch (err) {
            out.depends[depId] = { error: String((err as Error)?.message ?? err) };
          }
          return;
        }
        if ('mark' in dep) {
          const markId = dep.mark;
          const markDef = await ports.loadMarkDef(ctx, markId);
          if (!markDef) {
            out.anchors[markId] = { error: 'not found' };
            return;
          }
          try {
            const result = await ports.runMark(ctx, markDef, tractate, page, bypassCache);
            // Surface only the parsed instances list — extractors all emit
            // `{ instances: [...] }`. If the parse failed, expose the raw text.
            const parsed = result.parsed as { instances?: unknown } | null;
            out.anchors[markId] = parsed?.instances ?? result.content;
          } catch (err) {
            out.anchors[markId] = { error: String((err as Error)?.message ?? err) };
          }
          return;
        }
      }
    }),
  );
  return out;
}
