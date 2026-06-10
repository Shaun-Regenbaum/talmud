/**
 * Unified producer registry — ONE resolution of "what is producer `id`?" over
 * the two definition stores (runtime-mutable KV defs + code-defined defs in
 * code-marks.ts) and the two definition flavors (marks + enrichments),
 * projected into the four-primitive `Producer` shape from @corpus/core/model.
 *
 * This module is the single source of truth behind the legacy loaders the run
 * path uses (`loadMarkDef` / `loadEnrichmentDef`, formerly private to
 * index.ts): each is now a thin projection over the same resolution —
 * resolve → Producer → project back to the legacy shape. The projections are
 * LOSSLESS (locked by tests/producer-projection.test.ts +
 * tests/producer-registry.test.ts), so behavior — including derived cache
 * keys — is byte-identical to the pre-unification loaders.
 *
 * Resolution order (exactly today's, per flavor): KV wins over code.
 *   mark:    readMark (flat KV def → the rich synthesis below) → findCodeMark
 *   enrich:  readEnrichment (flat KV def, returned verbatim)   → findCodeEnrichment → adaptCodeEnrichment
 *
 * The unified `loadProducer(env, id)` tries KV mark, KV enrichment, code mark,
 * code enrichment. This is safe because mark ids and enrichment ids never
 * collide (enrichment ids are dotted, e.g. 'rabbi.bio'; asserted over the code
 * registry in tests/producer-registry.test.ts). The run path uses the
 * shape-pinned `loadProducerOfShape`, which has no such ambiguity.
 *
 * KV def shapes (see studio-registry.ts):
 *   mark-defs:v2:{id}            — flat MarkDefinition (flat prompts, no
 *                                  anchor/render/extractor nesting)
 *   mark-defs:v2:_index          — JSON string[] of known mark ids
 *   enrichment-defs:v2:{id}      — flat EnrichmentDefinition
 *   enrichment-defs:v2:_index    — JSON string[] of known enrichment ids
 */

import {
  enrichmentFromProducer,
  markFromProducer,
  producerFromEnrichment,
  producerFromMark,
} from '@corpus/core/model/compat';
import type { Producer } from '@corpus/core/model/producer';
import { CODE_ENRICHMENTS, CODE_MARKS, findCodeEnrichment, findCodeMark } from './code-marks';
import {
  type EnrichmentDefinition as KvEnrichmentDefinition,
  type MarkDefinition as KvMarkDefinition,
  listEnrichments,
  listMarks,
  type RegistryEnv,
  readEnrichment,
  readMark,
} from './studio-registry';
import type {
  LLMExtractor,
  EnrichmentDefinition as SchemaEnrichmentDefinition,
  MarkDefinition as SchemaMarkDefinition,
} from './studio-schema';

export type ProducerShape = 'mark' | 'enrich';

// ---------------------------------------------------------------------------
// Own-key helpers (same semantics as @corpus/core/model/compat): a spread that
// carries `key: undefined` as an own key when the source had one and omits it
// entirely when it didn't — so strict (own-key) round-trips hold.
// ---------------------------------------------------------------------------

function ownKey<T extends object, K extends keyof T>(obj: T, key: K): Partial<Pick<T, K>> {
  return key in obj ? ({ [key]: obj[key] } as Partial<Pick<T, K>>) : {};
}

function restExcept(obj: object, known: ReadonlySet<string>): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (!known.has(k)) rest[k] = (obj as Record<string, unknown>)[k];
  }
  return rest;
}

// ---------------------------------------------------------------------------
// Flat KV mark def → rich (studio-schema) def. EXACTLY the synthesis the old
// index.ts loadMarkDef performed: KV marks are prompt experiments authored in
// the dev UI, so they get fixed presentation defaults (phrase anchor, inline
// underline render), draft status, and the 'kv' def_hash sentinel. Flat
// fields with no slot in the synthesis (fields_schema, passes, parent_mark,
// experimental) are dropped — exactly as before.
// ---------------------------------------------------------------------------

export function richMarkFromKvDef(kv: KvMarkDefinition): SchemaMarkDefinition {
  return {
    id: kv.id,
    label: kv.label,
    description: kv.description,
    anchor: 'phrase',
    render: { kind: 'inline', style: 'underline', color: '#0066CC' },
    extractor: {
      kind: 'llm',
      system_prompt: kv.system_prompt ?? '',
      user_prompt_template: kv.user_prompt_template ?? '',
    },
    dependencies: kv.dependencies,
    status: 'draft',
    def_hash: 'kv',
    cache_version: kv.cache_version,
    source: 'kv',
    updated_at: kv.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Flat KV enrichment def ↔ rich (studio-schema) def. The old loadEnrichmentDef
// returned the flat KV def VERBATIM (the runner consumes the flat shape), so
// unlike marks there was no synthesis to copy — this pair exists so the KV def
// can ride through the Producer projection and come back byte-identical:
//   flat ─richEnrichmentFromKvDef→ rich ─producerFromEnrichment→ Producer
//        ─enrichmentFromProducer→ rich ─kvEnrichmentFromRichDef→ flat (verbatim)
// Synthesis constants mirror the mark synthesis (status 'draft', def_hash
// 'kv') plus mode 'augment-content' (KV enrichments are per-instance prompt
// experiments; the old code never assigned them a mode at all — the constant
// only shapes Producer metadata and is stripped again by the inverse, so no
// behavior changes). Unknown KV-authored extra fields ride along verbatim
// (→ Producer.legacy.rest), preserving the old "return kv verbatim" contract;
// the one unrepresentable case is an extra whose name collides with a rich
// field (mode/target_mark/extractor/…) — impossible via the CRUD, which
// validates + strips extras on write.
// ---------------------------------------------------------------------------

const KV_ENRICHMENT_FLAT_FIELDS = new Set([
  'id',
  'label',
  'description',
  'mark',
  'scope',
  'dependencies',
  'passes',
  'system_prompt',
  'user_prompt_template',
  'system_prompt_he',
  'user_prompt_template_he',
  'model',
  'output_schema',
  'thinking_off',
  'reasoning_effort',
  'cache_version',
  'source',
  'updated_at',
]);

const RICH_ENRICHMENT_FIELDS = new Set([
  'id',
  'label',
  'description',
  'category',
  'target_mark',
  'mode',
  'scope',
  'dependencies',
  'passes',
  'extractor',
  'status',
  'def_hash',
  'cache_version',
  'source',
  'updated_at',
]);

export function richEnrichmentFromKvDef(kv: KvEnrichmentDefinition): SchemaEnrichmentDefinition {
  const extractor: LLMExtractor = {
    kind: 'llm',
    system_prompt: kv.system_prompt,
    user_prompt_template: kv.user_prompt_template,
    ...ownKey(kv, 'system_prompt_he'),
    ...ownKey(kv, 'user_prompt_template_he'),
    ...ownKey(kv, 'model'),
    ...ownKey(kv, 'output_schema'),
    ...ownKey(kv, 'thinking_off'),
    ...ownKey(kv, 'reasoning_effort'),
  };
  return {
    ...restExcept(kv, KV_ENRICHMENT_FLAT_FIELDS),
    id: kv.id,
    label: kv.label,
    ...ownKey(kv, 'description'),
    target_mark: kv.mark,
    mode: 'augment-content',
    scope: kv.scope,
    ...ownKey(kv, 'dependencies'),
    ...ownKey(kv, 'passes'),
    extractor,
    status: 'draft',
    def_hash: 'kv',
    cache_version: kv.cache_version,
    source: kv.source,
    updated_at: kv.updated_at,
  } as SchemaEnrichmentDefinition;
}

/** Exact inverse of {@link richEnrichmentFromKvDef}: strips the synthesis
 *  constants (mode/status/def_hash) and unnests the LLM extractor back into
 *  the flat prompt fields. Only ever applied to KV-resolved defs, whose
 *  extractor is always the 'llm' shape the synthesis built. */
export function kvEnrichmentFromRichDef(def: SchemaEnrichmentDefinition): KvEnrichmentDefinition {
  const llm = def.extractor as LLMExtractor;
  return {
    ...restExcept(def, RICH_ENRICHMENT_FIELDS),
    id: def.id,
    label: def.label,
    ...ownKey(def, 'description'),
    mark: def.target_mark,
    scope: def.scope,
    ...ownKey(def, 'dependencies'),
    ...ownKey(def, 'passes'),
    system_prompt: llm.system_prompt,
    user_prompt_template: llm.user_prompt_template,
    ...ownKey(llm, 'system_prompt_he'),
    ...ownKey(llm, 'user_prompt_template_he'),
    ...ownKey(llm, 'model'),
    ...ownKey(llm, 'output_schema'),
    ...ownKey(llm, 'thinking_off'),
    ...ownKey(llm, 'reasoning_effort'),
    cache_version: def.cache_version,
    source: def.source,
    updated_at: def.updated_at,
  } as KvEnrichmentDefinition;
}

// ---------------------------------------------------------------------------
// Code enrichment def → the flat shape the runner expects. Moved VERBATIM from
// index.ts (the old loadEnrichmentDef's code-fallback adaptation).
// ---------------------------------------------------------------------------

export function adaptCodeEnrichment(
  code: SchemaEnrichmentDefinition,
): KvEnrichmentDefinition | null {
  // 'computed' enrichments carry no prompts — they're intercepted by a
  // `def.id`-keyed short-circuit in runEnrichmentOnce (like rabbi.identity)
  // and never hit the LLM path. Pass them through with empty prompt fields so
  // the runner can still load + cache them; everything the short-circuit needs
  // (scope, dependencies, cache_version) is preserved below.
  if (code.extractor.kind !== 'llm' && code.extractor.kind !== 'computed') return null;
  const llm = code.extractor.kind === 'llm' ? code.extractor : null;
  return {
    id: code.id,
    label: code.label,
    description: code.description,
    mark: code.target_mark,
    scope: code.scope,
    dependencies: code.dependencies,
    passes: code.passes,
    system_prompt: llm?.system_prompt ?? '',
    user_prompt_template: llm?.user_prompt_template ?? '',
    system_prompt_he: llm?.system_prompt_he,
    user_prompt_template_he: llm?.user_prompt_template_he,
    model: llm?.model,
    output_schema: llm?.output_schema,
    thinking_off: llm?.thinking_off,
    reasoning_effort: llm?.reasoning_effort,
    cache_version: code.cache_version,
    source: 'code',
    updated_at: code.updated_at,
  };
}

// ---------------------------------------------------------------------------
// The ONE resolution (KV first, then code) — everything below routes through
// these two functions.
// ---------------------------------------------------------------------------

async function resolveMarkRich(env: RegistryEnv, id: string): Promise<SchemaMarkDefinition | null> {
  const kv = await readMark(env, id);
  if (kv) return richMarkFromKvDef(kv);
  return findCodeMark(id);
}

async function resolveEnrichmentRich(
  env: RegistryEnv,
  id: string,
): Promise<
  | { def: SchemaEnrichmentDefinition; from: 'kv'; kv: KvEnrichmentDefinition }
  | { def: SchemaEnrichmentDefinition; from: 'code' }
  | null
> {
  const kv = await readEnrichment(env, id);
  // The verbatim parsed KV object rides along so the legacy loader can return
  // it UNTOUCHED (identity, like the old loadEnrichmentDef) — the rich
  // synthesis is for the Producer projection only.
  if (kv) return { def: richEnrichmentFromKvDef(kv), from: 'kv', kv };
  const code = findCodeEnrichment(id);
  return code ? { def: code, from: 'code' } : null;
}

// ---------------------------------------------------------------------------
// Producer lookups
// ---------------------------------------------------------------------------

/** The shape-pinned lookup the run path uses: the caller knows whether it is
 *  asking for a mark or an enrichment (today's loadMarkDef vs loadEnrichmentDef
 *  split), so there is no cross-flavor ambiguity. KV beats code. */
export async function loadProducerOfShape(
  env: RegistryEnv,
  id: string,
  shape: ProducerShape,
): Promise<Producer | null> {
  if (shape === 'mark') {
    const def = await resolveMarkRich(env, id);
    return def ? producerFromMark(def) : null;
  }
  const r = await resolveEnrichmentRich(env, id);
  return r ? producerFromEnrichment(r.def) : null;
}

/** Convenience unified lookup: KV mark, KV enrichment, code mark, code
 *  enrichment. Equivalent to trying both shapes because mark and enrichment
 *  ids never collide (asserted in tests/producer-registry.test.ts); KV is
 *  still preferred over code across flavors. */
export async function loadProducer(env: RegistryEnv, id: string): Promise<Producer | null> {
  const kvMark = await readMark(env, id);
  if (kvMark) return producerFromMark(richMarkFromKvDef(kvMark));
  const kvEnrich = await readEnrichment(env, id);
  if (kvEnrich) return producerFromEnrichment(richEnrichmentFromKvDef(kvEnrich));
  const codeMark = findCodeMark(id);
  if (codeMark) return producerFromMark(codeMark);
  const codeEnrich = findCodeEnrichment(id);
  return codeEnrich ? producerFromEnrichment(codeEnrich) : null;
}

/** Every known producer, both flavors, both stores, projected. KV wins on an
 *  id collision with code (same precedence as the per-id lookups and the
 *  /api/marks list endpoint). With an empty KV this is exactly
 *  [...CODE_MARKS, ...CODE_ENRICHMENTS] projected, in that order — the
 *  dep-graph parity test relies on it. */
export async function listProducers(env: RegistryEnv): Promise<Producer[]> {
  const [kvMarks, kvEnrichments] = await Promise.all([listMarks(env), listEnrichments(env)]);
  const out: Producer[] = [];
  const seen = new Set<string>();
  for (const kv of kvMarks) {
    if (seen.has(kv.id)) continue;
    seen.add(kv.id);
    out.push(producerFromMark(richMarkFromKvDef(kv)));
  }
  for (const kv of kvEnrichments) {
    if (seen.has(kv.id)) continue;
    seen.add(kv.id);
    out.push(producerFromEnrichment(richEnrichmentFromKvDef(kv)));
  }
  for (const def of CODE_MARKS) {
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    out.push(producerFromMark(def));
  }
  for (const def of CODE_ENRICHMENTS) {
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    out.push(producerFromEnrichment(def));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Legacy loaders — the signatures the run path has always used, now thin
// projections over the unified resolution: resolve → Producer → project back.
// Output is byte-identical to the old index.ts implementations (locked by
// tests/producer-registry.test.ts).
// ---------------------------------------------------------------------------

export async function loadMarkDef(
  env: RegistryEnv,
  id: string,
): Promise<SchemaMarkDefinition | null> {
  const def = await resolveMarkRich(env, id);
  if (!def) return null;
  // Round-trip through the Producer currency — lossless (strict-equal) over
  // the whole registry, so this is the same def the old loader returned.
  return markFromProducer(producerFromMark(def)) as SchemaMarkDefinition;
}

export async function loadEnrichmentDef(
  env: RegistryEnv,
  id: string,
): Promise<KvEnrichmentDefinition | null> {
  const r = await resolveEnrichmentRich(env, id);
  if (!r) return null;
  // KV defs return VERBATIM — identity with the old loader by construction,
  // even for hand-authored entries carrying fields that collide with the rich
  // schema's names (mode/target_mark/extractor/...), which a reconstruction
  // through the synthesis inverse would overwrite or strip.
  if (r.from === 'kv') return r.kv;
  // Code defs flatten exactly as the old loader did — including its null for
  // extractors that are neither 'llm' nor 'computed'.
  const rich = enrichmentFromProducer(
    producerFromEnrichment(r.def),
  ) as unknown as SchemaEnrichmentDefinition;
  return adaptCodeEnrichment(rich);
}
