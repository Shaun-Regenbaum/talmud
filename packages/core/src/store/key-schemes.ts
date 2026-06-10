/**
 * KeyScheme — how an ArtifactStore turns (producer, address) into a KV key.
 *
 * Two schemes exist:
 *  - {@link talmudLegacyKeyScheme} DELEGATES to the frozen byte-exact contract
 *    in cache/keys.ts (`keyForMark` / `keyForEnrichment` / `previousVersionKey`)
 *    — it never re-implements the key shape, so the production KV cache can
 *    never cold-miss from a drift here.
 *  - {@link templateKeyScheme} carries per-producer-id literal key templates
 *    (the tanach app's `events:v2:{book}:{chapter}` family), copied EXACTLY
 *    from the app's hand-built keys.
 *
 * Addresses arrive PRE-DERIVED: `instanceId` is already the instanceIdOf()
 * output and `qualifier` already the qualifierHash() output (both async hash
 * derivations), which is what keeps `KeyScheme.key` synchronous — the key
 * functions in cache/keys.ts are themselves sync.
 */

import type { EnrichmentScope } from '../cache/keys.ts';
import { keyForEnrichment, keyForMark, previousVersionKey } from '../cache/keys.ts';

/** The producer fields key derivation needs. */
export interface ProducerKeyInfo {
  id: string;
  cacheVersion: string;
  scope: EnrichmentScope;
  key_shape: 'mark' | 'enrich';
  /** Whether the producer's extractor declares a Hebrew system prompt.
   *  Production rule (cacheKeyForRunBody): a lang='he' MARK request keys onto
   *  the ':he' namespace ONLY when the def has a Hebrew prompt — otherwise it
   *  collapses to the English key (computed marks, he-less marks). Enrichments
   *  always key by the requested lang. Getting this wrong cold-misses or
   *  orphans entries, so derive it via {@link producerKeyInfo} rather than
   *  hand-setting. */
  hasHePrompt?: boolean;
}

/** Derive ProducerKeyInfo from any Producer-shaped object, including the
 *  hasHePrompt flag off the recipe's extractor. Use this instead of passing a
 *  full Producer structurally — a Producer lacks hasHePrompt as an own field,
 *  and defaulting it to false would mis-key Hebrew-prompted marks. */
export function producerKeyInfo(p: {
  id: string;
  cacheVersion: string;
  scope: EnrichmentScope;
  key_shape: 'mark' | 'enrich';
  hasHePrompt?: boolean;
  recipe?: { extractor?: unknown };
}): ProducerKeyInfo {
  const ext = (p.recipe?.extractor ?? {}) as { system_prompt_he?: unknown };
  return {
    id: p.id,
    cacheVersion: p.cacheVersion,
    scope: p.scope,
    key_shape: p.key_shape,
    hasHePrompt:
      p.hasHePrompt ??
      (typeof ext.system_prompt_he === 'string' && ext.system_prompt_he.length > 0),
  };
}

/** Where an artifact sits, key-wise. */
export interface ArtifactAddress {
  /** ALREADY instanceIdOf-derived (e.g. 'abaye', 'f35cd02cd97b'). */
  instanceId?: string;
  /** Spine locator: talmud `{work: tractate, unit: page}`; tanach
   *  `{work: book, unit: chapter}`. `unit` may be omitted where the key
   *  doesn't need it (global enrichments, work-level templates). */
  unit?: { work: string; unit?: string };
  /** ALREADY qualifierHash-derived (e.g. the hashed user question). */
  qualifier?: string;
  lang?: 'en' | 'he';
}

export interface KeyScheme {
  key(p: ProducerKeyInfo, addr: ArtifactAddress): string;
  /** The previous-cache_version key (stale-while-revalidate source), or null
   *  when there is no decrementable previous version. */
  previousKey(key: string, p: ProducerKeyInfo): string | null;
  /** Optional alias keys to try on read when the canonical key misses.
   *  Reads-only — writes always go to the canonical key. */
  legacyKeys?(p: ProducerKeyInfo, addr: ArtifactAddress): string[];
}

/**
 * The talmud (and any registry-keyed) scheme: pure delegation to cache/keys.ts.
 *
 *  - key_shape 'mark'   → keyForMark, requires `unit.work` + `unit.unit`
 *                         (tractate + page).
 *  - key_shape 'enrich' → keyForEnrichment; the daf argument is passed for
 *                         scope='local' (uses tractate+page) and scope='spine'
 *                         (uses the tractate only — keyForEnrichment slugs just
 *                         `daf.tractate`; a missing page is tolerated there
 *                         because the page never reaches the key), and omitted
 *                         for scope='global'. Missing-daf errors surface from
 *                         keyForEnrichment itself, byte-identical to production.
 */
export function talmudLegacyKeyScheme(): KeyScheme {
  return {
    key(p, addr) {
      if (p.key_shape === 'mark') {
        if (!addr.unit?.work || addr.unit.unit === undefined) {
          throw new Error(`mark producer ${p.id} needs unit {work, unit} (tractate, page)`);
        }
        // Production lang rule (cacheKeyForRunBody): ':he' only when the mark
        // declares a Hebrew prompt; otherwise a he request keys onto the
        // English entry. Enrichments below key by the requested lang always.
        const lang = addr.lang === 'he' && p.hasHePrompt ? 'he' : 'en';
        return keyForMark(
          { id: p.id, cache_version: p.cacheVersion },
          addr.unit.work,
          addr.unit.unit,
          lang,
        );
      }
      if (addr.instanceId === undefined) {
        throw new Error(`enrich producer ${p.id} needs an instanceId (instanceIdOf-derived)`);
      }
      // scope='local' keys on tractate+page — a missing page must FAIL, not
      // silently derive a ':berakhot:' key. scope='spine' only reads
      // daf.tractate inside keyForEnrichment, so a page-less unit is fine
      // there ('' never reaches the key bytes).
      if (p.scope === 'local' && (!addr.unit?.work || addr.unit.unit === undefined)) {
        throw new Error(`local enrich producer ${p.id} needs unit {work, unit} (tractate, page)`);
      }
      const daf =
        p.scope === 'global' || !addr.unit
          ? undefined
          : { tractate: addr.unit.work, page: addr.unit.unit ?? '' };
      return keyForEnrichment(
        { id: p.id, cache_version: p.cacheVersion, scope: p.scope },
        addr.instanceId,
        daf,
        addr.qualifier,
        addr.lang ?? 'en',
      );
    },
    previousKey(key, p) {
      return previousVersionKey(key, p.id, p.cacheVersion);
    },
  };
}

/** One literal key template: `key` builds the canonical key from the address
 *  (extra app-specific fields — verse, start/end, norm — ride along on the
 *  open record); `previous` and `legacy` are optional per-template hooks. */
export interface KeyTemplate {
  key(addr: ArtifactAddress & Record<string, unknown>): string;
  previous?(key: string, p: ProducerKeyInfo): string | null;
  /** Alias keys to try on read when the canonical key misses. */
  legacy?(addr: ArtifactAddress & Record<string, unknown>): string[];
}

/**
 * Per-producer-id literal key templates — for apps (tanach) whose cache keys
 * are hand-built strings rather than registry-derived. The templates must be
 * copied byte-exactly from the app's code; this scheme only routes by id.
 */
export function templateKeyScheme(templates: Record<string, KeyTemplate>): KeyScheme {
  const templateOf = (id: string): KeyTemplate => {
    const t = templates[id];
    if (!t) throw new Error(`no key template registered for producer ${id}`);
    return t;
  };
  return {
    key(p, addr) {
      return templateOf(p.id).key(addr as ArtifactAddress & Record<string, unknown>);
    },
    previousKey(key, p) {
      return templateOf(p.id).previous?.(key, p) ?? null;
    },
    legacyKeys(p, addr) {
      return templateOf(p.id).legacy?.(addr as ArtifactAddress & Record<string, unknown>) ?? [];
    },
  };
}
