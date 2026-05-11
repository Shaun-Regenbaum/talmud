/**
 * Cache key derivation — single source of truth for every KV cache read/write
 * in the registry-driven pipeline. No hand-built keys anywhere else in the
 * worker; if you find yourself templating a string with `:` separators, use
 * one of these helpers instead.
 *
 * Shape:
 *
 *   mark:{id}:{cache_version}:{tractate}:{page}
 *   enrich:{id}:{cache_version}:{instance_id}                    (scope=global)
 *   enrich:{id}:{cache_version}:{instance_id}:{tractate}:{page}  (scope=local)
 *   ctx:gemara:v1:{tractate}:{page}
 *   ctx:commentaries:v1:{tractate}:{page}
 *
 * `instance_id` derivation lives here too (instanceIdOf) so callers don't
 * invent their own scheme. Mark instances that carry a stable own id (rabbi
 * name, place slug) use it; instances without an id fall back to a 12-char
 * hash of stable anchor fields. Either way the same input always yields the
 * same key, so cache hits flow through transparently.
 *
 * If a definition's prompt or schema changes, bump its `cache_version` — the
 * key changes, old entries become unreachable.
 */

import type { MarkDefinition as SchemaMarkDefinition, EnrichmentDefinition as SchemaEnrichmentDefinition } from './studio-schema';
import type { MarkDefinition as KvMarkDefinition, EnrichmentDefinition as KvEnrichmentDefinition } from './studio-registry';

export type AnyMarkDefinition = SchemaMarkDefinition | KvMarkDefinition;
export type AnyEnrichmentDefinition = SchemaEnrichmentDefinition | KvEnrichmentDefinition;

const TRACTATE_PAGE_RE = /[^a-zA-Z0-9.-]/g;
function slugDaf(tractate: string, page: string): string {
  return `${tractate.toLowerCase().replace(TRACTATE_PAGE_RE, '_')}:${page.toLowerCase().replace(TRACTATE_PAGE_RE, '_')}`;
}

/** sha256(input) → first 12 hex chars. Used for hash-based instance ids. */
async function shortHash(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 6; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/**
 * Derive a stable per-instance id from a mark instance. Preference order:
 *   1. mark_input.fields.id (if the extractor emits one)
 *   2. mark_input.id        (legacy shape some marks still use)
 *   3. mark_input.fields.name (rabbi anchors carry this)
 *   4. sha256 of stable anchor fields, first 12 hex chars
 *
 * The instance_id is what makes scope='global' enrichments cache-shared
 * across dafim — for rabbi.bio on "Abaye", the same key `enrich:rabbi.bio:1:Abaye`
 * is hit regardless of which daf triggered the click.
 */
export async function instanceIdOf(markInput: unknown): Promise<string> {
  if (markInput && typeof markInput === 'object') {
    const o = markInput as Record<string, unknown>;
    if (typeof o.id === 'string' && o.id) return slugId(o.id);
    const fields = o.fields as Record<string, unknown> | undefined;
    if (fields) {
      if (typeof fields.id === 'string' && fields.id) return slugId(fields.id);
      if (typeof fields.name === 'string' && fields.name) return slugId(fields.name);
      if (typeof fields.topic === 'string' && fields.topic) return slugId(fields.topic);
      if (typeof fields.title === 'string' && fields.title) return slugId(fields.title);
      if (typeof fields.verseRef === 'string' && fields.verseRef) return slugId(fields.verseRef);
    }
    // Anchor-shape fallback: hash the stable structural fields.
    const stable = pickStable(o);
    if (Object.keys(stable).length > 0) {
      return await shortHash(JSON.stringify(stable));
    }
  }
  return await shortHash(JSON.stringify(markInput ?? null));
}

function slugId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 80);
}

function pickStable(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ['startSegIdx', 'endSegIdx', 'segIdx', 'tokenStart', 'tokenEnd', 'excerpt']) {
    if (k in o) out[k] = o[k];
  }
  if (o.fields && typeof o.fields === 'object') {
    const f = o.fields as Record<string, unknown>;
    for (const k of ['excerpt', 'title', 'topic', 'theme', 'verseRef']) {
      if (typeof f[k] === 'string') out[`fields.${k}`] = f[k];
    }
  }
  return out;
}

export function keyForGemara(tractate: string, page: string): string {
  return `ctx:gemara:v1:${slugDaf(tractate, page)}`;
}
export function keyForCommentaries(tractate: string, page: string): string {
  return `ctx:commentaries:v1:${slugDaf(tractate, page)}`;
}

export function keyForMark(def: AnyMarkDefinition, tractate: string, page: string): string {
  return `mark:${def.id}:${def.cache_version}:${slugDaf(tractate, page)}`;
}

export function keyForEnrichment(
  def: AnyEnrichmentDefinition,
  instance_id: string,
  daf?: { tractate: string; page: string },
): string {
  const scope = enrichmentScope(def);
  const head = `enrich:${def.id}:${def.cache_version}:${instance_id}`;
  if (scope === 'local') {
    if (!daf) throw new Error(`enrichment ${def.id} is scope=local but no daf was supplied to keyForEnrichment`);
    return `${head}:${slugDaf(daf.tractate, daf.page)}`;
  }
  return head;
}

/** Both schema-shape and KV-shape definitions carry `scope`. */
function enrichmentScope(def: AnyEnrichmentDefinition): 'global' | 'local' {
  return (def as { scope: 'global' | 'local' }).scope;
}
