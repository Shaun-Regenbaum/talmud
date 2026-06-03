/**
 * KV-backed registries for Studio: marks (what to extract from a daf) and
 * enrichments (what to derive from a mark). Both registries share the same
 * shape — each entry is a JSON document keyed by its `id` under a versioned
 * prefix:
 *
 *   mark-defs:v2:{id}        — MarkDefinition
 *   enrichment-defs:v2:{id}  — EnrichmentDefinition
 *
 * KV-defined entries are runtime-mutable (UI writes them) and survive across
 * deploys. Code-defined entries live in src/worker/code-marks.ts; the run
 * handler reads from KV first, then falls back to code. KV wins on collision.
 *
 * Why a single shared module: marks and enrichments differ only in field
 * names; one parameterized reader/writer is half the code and avoids drift.
 *
 * v2 prefix bump: schema gained `scope` (enrichments) and `dependencies`
 * (both). Old v1 entries are unreachable on purpose.
 */

import type { LLMModelId } from './llm';
import type {
  EnrichmentScope,
  MarkDependency,
  EnrichmentDependency,
} from './studio-schema';

const MARK_PREFIX = 'mark-defs:v2:';
const ENRICHMENT_PREFIX = 'enrichment-defs:v2:';
const INDEX_KEY_MARKS = 'mark-defs:v2:_index';
const INDEX_KEY_ENRICHMENTS = 'enrichment-defs:v2:_index';

export type ExtractorKind = 'llm' | 'sefaria' | 'identity';

export interface MarkDefinition {
  id: string;
  label: string;
  description?: string;
  extractor: ExtractorKind;
  /** When extractor === 'llm': the prompt that turns daf text → marks. */
  system_prompt?: string;
  user_prompt_template?: string;
  /** Optional JSON schema for the per-mark fields. */
  fields_schema?: unknown;
  /** Declared inputs (gemara/commentaries/other marks). See studio-schema.ts. */
  dependencies?: MarkDependency[];
  /** Post-LLM passes (transform/validate) this mark opts into. See
   *  MarkDefinition.passes in studio-schema.ts. Not part of the cache key. */
  passes?: string[];
  /** UI-only nesting hint — see MarkDefinition.parent_mark in studio-schema.ts. */
  parent_mark?: string;
  /** Experimental feature flag — dev-only visibility. See studio-schema.ts. */
  experimental?: boolean;
  /** Bump to invalidate cached extractions for this mark. */
  cache_version: string;
  source: 'kv' | 'code';
  updated_at: string;
}

export interface EnrichmentDefinition {
  id: string;
  label: string;
  description?: string;
  /** Which mark this enrichment runs against. 'daf' = the entire daf as a
   *  single implicit mark; matches the 'identity' mark extractor. */
  mark: string;
  /** Cacheability axis: 'global' (same regardless of daf) | 'local' (per-daf). */
  scope: EnrichmentScope;
  /** Declared inputs (gemara/commentaries/other enrichments/other marks).
   *  The runner walks this array and exposes each entry as a template var. */
  dependencies?: EnrichmentDependency[];
  /** Post-LLM validators (e.g. 'hebrew-excerpt', 'hebrew-gloss') this
   *  enrichment opts into. See EnrichmentDefinition.passes in studio-schema.ts.
   *  Feeds the cache-gating; not part of the cache key. */
  passes?: string[];
  system_prompt: string;
  user_prompt_template: string;
  /** Hebrew-output counterparts, selected when a run is requested with
   *  lang='he'. Absent → runner falls back to the English prompt. See
   *  LLMExtractor in studio-schema.ts for the parity contract. */
  system_prompt_he?: string;
  user_prompt_template_he?: string;
  /** Optional override; falls back to settings.defaultModel. */
  model?: LLMModelId;
  /** Optional JSON schema for response_format. */
  output_schema?: unknown;
  /** When true, runLLM is called with thinking disabled (Workers AI Kimi). */
  thinking_off?: boolean;
  /** Opt into a provider reasoning pass (deepseek reasoning is off by default).
   *  Maps to runLLM's reasoning_effort. */
  reasoning_effort?: 'low' | 'medium' | 'high';
  cache_version: string;
  source: 'kv' | 'code';
  updated_at: string;
}

export interface RegistryEnv {
  CACHE?: KVNamespace;
}

// ---------------------------------------------------------------------------
// Generic CRUD over a prefixed KV namespace
// ---------------------------------------------------------------------------

async function readEntry<T>(env: RegistryEnv, prefix: string, id: string): Promise<T | null> {
  if (!env.CACHE) return null;
  const raw = await env.CACHE.get(prefix + id);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

async function writeEntry<T extends { id: string }>(
  env: RegistryEnv,
  prefix: string,
  indexKey: string,
  entry: T,
): Promise<T> {
  if (!env.CACHE) throw new Error('CACHE binding not available');
  await env.CACHE.put(prefix + entry.id, JSON.stringify(entry));
  // Maintain an index of all known IDs so listing doesn't need a full KV scan.
  const ids = await readIndex(env, indexKey);
  if (!ids.includes(entry.id)) {
    ids.push(entry.id);
    await env.CACHE.put(indexKey, JSON.stringify(ids));
  }
  return entry;
}

async function deleteEntry(env: RegistryEnv, prefix: string, indexKey: string, id: string): Promise<void> {
  if (!env.CACHE) throw new Error('CACHE binding not available');
  await env.CACHE.delete(prefix + id);
  const ids = await readIndex(env, indexKey);
  const next = ids.filter((x) => x !== id);
  if (next.length !== ids.length) await env.CACHE.put(indexKey, JSON.stringify(next));
}

async function readIndex(env: RegistryEnv, indexKey: string): Promise<string[]> {
  if (!env.CACHE) return [];
  const raw = await env.CACHE.get(indexKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

async function listEntries<T>(env: RegistryEnv, prefix: string, indexKey: string): Promise<T[]> {
  const ids = await readIndex(env, indexKey);
  if (ids.length === 0) return [];
  const entries = await Promise.all(ids.map((id) => readEntry<T>(env, prefix, id)));
  const out: T[] = [];
  for (const e of entries) if (e !== null) out.push(e as T);
  return out;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

export const readMark = (env: RegistryEnv, id: string) => readEntry<MarkDefinition>(env, MARK_PREFIX, id);
export const listMarks = (env: RegistryEnv) => listEntries<MarkDefinition>(env, MARK_PREFIX, INDEX_KEY_MARKS);
export const deleteMark = (env: RegistryEnv, id: string) => deleteEntry(env, MARK_PREFIX, INDEX_KEY_MARKS, id);

export async function writeMark(
  env: RegistryEnv,
  spec: Omit<MarkDefinition, 'source' | 'updated_at'>,
): Promise<MarkDefinition> {
  const entry: MarkDefinition = { ...spec, source: 'kv', updated_at: new Date().toISOString() };
  return writeEntry(env, MARK_PREFIX, INDEX_KEY_MARKS, entry);
}

// ---------------------------------------------------------------------------
// Enrichments
// ---------------------------------------------------------------------------

export const readEnrichment = (env: RegistryEnv, id: string) => readEntry<EnrichmentDefinition>(env, ENRICHMENT_PREFIX, id);
export const listEnrichments = (env: RegistryEnv) => listEntries<EnrichmentDefinition>(env, ENRICHMENT_PREFIX, INDEX_KEY_ENRICHMENTS);
export const deleteEnrichment = (env: RegistryEnv, id: string) => deleteEntry(env, ENRICHMENT_PREFIX, INDEX_KEY_ENRICHMENTS, id);

export async function writeEnrichment(
  env: RegistryEnv,
  spec: Omit<EnrichmentDefinition, 'source' | 'updated_at'>,
): Promise<EnrichmentDefinition> {
  const entry: EnrichmentDefinition = { ...spec, source: 'kv', updated_at: new Date().toISOString() };
  return writeEntry(env, ENRICHMENT_PREFIX, INDEX_KEY_ENRICHMENTS, entry);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const ID_RE = /^[a-z][a-z0-9._-]*$/i;

export function validateId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && ID_RE.test(id);
}

function validateMarkDependencies(input: unknown): { ok: true; deps: MarkDependency[] | undefined } | { ok: false; error: string } {
  if (input === undefined) return { ok: true, deps: undefined };
  if (!Array.isArray(input)) return { ok: false, error: 'dependencies must be an array' };
  const out: MarkDependency[] = [];
  for (const e of input) {
    if (e === 'gemara' || e === 'commentaries') { out.push(e); continue; }
    if (e && typeof e === 'object' && typeof (e as { mark?: unknown }).mark === 'string') {
      out.push({ mark: (e as { mark: string }).mark }); continue;
    }
    return { ok: false, error: 'each dep must be "gemara" | "commentaries" | { mark: string }' };
  }
  return { ok: true, deps: out };
}

function validateEnrichmentDependencies(input: unknown): { ok: true; deps: EnrichmentDependency[] | undefined } | { ok: false; error: string } {
  if (input === undefined) return { ok: true, deps: undefined };
  if (!Array.isArray(input)) return { ok: false, error: 'dependencies must be an array' };
  const out: EnrichmentDependency[] = [];
  for (const e of input) {
    if (e === 'gemara' || e === 'commentaries' || e === 'mishna' || e === 'context' || e === 'halacha-refs') { out.push(e); continue; }
    if (e && typeof e === 'object') {
      const o = e as { mark?: unknown; enrichment?: unknown };
      if (typeof o.mark === 'string') { out.push({ mark: o.mark }); continue; }
      if (typeof o.enrichment === 'string') { out.push({ enrichment: o.enrichment }); continue; }
    }
    return { ok: false, error: 'each dep must be "gemara" | "commentaries" | "mishna" | "context" | "halacha-refs" | { mark: string } | { enrichment: string }' };
  }
  return { ok: true, deps: out };
}

export function validateMark(input: unknown): { ok: true; spec: Omit<MarkDefinition, 'source' | 'updated_at'> } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'expected object' };
  const m = input as Partial<MarkDefinition>;
  if (!validateId(m.id)) return { ok: false, error: 'id required (a-z, 0-9, ._-, max 64)' };
  if (typeof m.label !== 'string' || m.label.length === 0) return { ok: false, error: 'label required' };
  if (m.extractor !== 'llm' && m.extractor !== 'sefaria' && m.extractor !== 'identity') {
    return { ok: false, error: 'extractor must be llm | sefaria | identity' };
  }
  if (m.extractor === 'llm') {
    if (typeof m.system_prompt !== 'string' || !m.system_prompt) return { ok: false, error: 'llm extractor needs system_prompt' };
    if (typeof m.user_prompt_template !== 'string' || !m.user_prompt_template) return { ok: false, error: 'llm extractor needs user_prompt_template' };
  }
  const dv = validateMarkDependencies(m.dependencies);
  if (!dv.ok) return dv;
  return {
    ok: true,
    spec: {
      id: m.id,
      label: m.label,
      description: typeof m.description === 'string' ? m.description : undefined,
      extractor: m.extractor,
      system_prompt: typeof m.system_prompt === 'string' ? m.system_prompt : undefined,
      user_prompt_template: typeof m.user_prompt_template === 'string' ? m.user_prompt_template : undefined,
      fields_schema: m.fields_schema,
      dependencies: dv.deps,
      experimental: m.experimental === true || undefined,
      cache_version: typeof m.cache_version === 'string' ? m.cache_version : '1',
    },
  };
}

export function validateEnrichment(input: unknown): { ok: true; spec: Omit<EnrichmentDefinition, 'source' | 'updated_at'> } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'expected object' };
  const e = input as Partial<EnrichmentDefinition>;
  if (!validateId(e.id)) return { ok: false, error: 'id required (a-z, 0-9, ._-, max 64)' };
  if (typeof e.label !== 'string' || !e.label) return { ok: false, error: 'label required' };
  if (typeof e.mark !== 'string' || !e.mark) return { ok: false, error: 'mark required' };
  if (e.scope !== 'global' && e.scope !== 'local') return { ok: false, error: 'scope required (global | local)' };
  if (typeof e.system_prompt !== 'string' || !e.system_prompt) return { ok: false, error: 'system_prompt required' };
  if (typeof e.user_prompt_template !== 'string' || !e.user_prompt_template) return { ok: false, error: 'user_prompt_template required' };
  const dv = validateEnrichmentDependencies(e.dependencies);
  if (!dv.ok) return dv;
  const model = e.model;
  if (model !== undefined && typeof model !== 'string') return { ok: false, error: 'model must be a string' };
  if (model && !(model.startsWith('@cf/') || model.startsWith('openrouter/'))) {
    return { ok: false, error: 'model must start with @cf/ or openrouter/' };
  }
  return {
    ok: true,
    spec: {
      id: e.id,
      label: e.label,
      description: typeof e.description === 'string' ? e.description : undefined,
      mark: e.mark,
      scope: e.scope,
      dependencies: dv.deps,
      system_prompt: e.system_prompt,
      user_prompt_template: e.user_prompt_template,
      model: model as LLMModelId | undefined,
      output_schema: e.output_schema,
      thinking_off: typeof e.thinking_off === 'boolean' ? e.thinking_off : undefined,
      cache_version: typeof e.cache_version === 'string' ? e.cache_version : '1',
    },
  };
}
