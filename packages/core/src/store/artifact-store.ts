/**
 * ArtifactStore — the one KV surface for producer outputs. Wraps a minimal
 * structural KV (a Cloudflare KVNamespace satisfies it) with:
 *
 *  - key derivation via a pluggable {@link KeyScheme} (talmud delegates to the
 *    frozen cache/keys.ts contract; tanach uses literal templates);
 *  - the legacy read/write envelope semantics (plain JSON, null on parse
 *    error, NO TTL ever — mirrors the worker's readCachedResult /
 *    writeCachedResult exactly);
 *  - the HUMAN-EDIT GUARD: a human-authored entry is never silently
 *    overwritten by rule/AI output;
 *  - stale-while-revalidate reads across a cache_version bump (getSWR);
 *  - generalized staleness (recipe hash + input content hashes).
 */

import { recipeHash } from '../cache/keys.ts';
import type { Recipe } from '../model/producer.ts';
import type { InputRef } from '../model/provenance.ts';
import type { StoredArtifact } from './envelope.ts';
import type { ArtifactAddress, KeyScheme, ProducerKeyInfo } from './key-schemes.ts';
import { producerKeyInfo } from './key-schemes.ts';

/** Minimal structural KV — the subset of KVNamespace the store uses, kept as
 *  its own interface so core's public surface doesn't depend on workers-types
 *  (a real KVNamespace is assignment-compatible). */
export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type PutResult = { ok: true } | { ok: false; reason: 'human-locked' };

export type Staleness = 'fresh' | 'stale-recipe' | 'stale-inputs' | 'unknown';

/** Accepts bare ProducerKeyInfo or any Producer-shaped object (with a recipe).
 *  Routes through producerKeyInfo so hasHePrompt is DERIVED from the recipe's
 *  extractor when not explicitly set — a full Producer passed structurally
 *  would otherwise default to "no Hebrew prompt" and mis-key he-prompted
 *  marks. */
type ProducerLike = ProducerKeyInfo & { recipe?: { extractor?: unknown } };
function keyInfoOf(p: ProducerLike): ProducerKeyInfo {
  return producerKeyInfo(p);
}

export class ArtifactStore {
  constructor(
    private readonly kv: KVStore,
    private readonly scheme: KeyScheme,
  ) {}

  /** The canonical KV key for (producer, address). Accepts a full Producer
   *  (hasHePrompt derives from its recipe) or the bare key info. */
  keyFor(p: ProducerLike, addr: ArtifactAddress): string {
    return this.scheme.key(keyInfoOf(p), addr);
  }

  /** Read one entry. Mirrors the worker's readCachedResult byte-for-byte:
   *  null on miss, null on unparseable JSON (a corrupted entry reads as a
   *  miss and regenerates rather than throwing). */
  async get(key: string): Promise<StoredArtifact | null> {
    const raw = await this.kv.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredArtifact;
    } catch {
      return null;
    }
  }

  /** Read by (producer, address): the canonical key first, then any
   *  scheme-declared legacy alias keys. The returned `key` is ALWAYS the
   *  canonical one — writes never target an alias, so a hit served from an
   *  alias migrates to the canonical key on its next write. */
  async getWithAliases(
    p: ProducerLike,
    addr: ArtifactAddress,
  ): Promise<{ key: string; value: StoredArtifact | null }> {
    const info = keyInfoOf(p);
    const key = this.scheme.key(info, addr);
    const hit = await this.get(key);
    if (hit) return { key, value: hit };
    for (const alias of this.scheme.legacyKeys?.(info, addr) ?? []) {
      const aliasHit = await this.get(alias);
      if (aliasHit) return { key, value: aliasHit };
    }
    return { key, value: null };
  }

  /** Stale-while-revalidate read: the canonical key first; on miss, the
   *  previous-cache_version key. `stale: true` means the value was served
   *  from the previous version — the CALLER decides whether to enqueue a
   *  refresh (this store never marks `refreshing` or enqueues anything).
   *
   *  `canonicalKey` is ALWAYS the current-version key (what a refresh job
   *  targets, what write-through writes); `servedKey` is where the value
   *  actually came from. The optional `accept` predicate guards BOTH reads —
   *  a value failing it is treated as a miss (production's section_range
   *  guard: a cached section enrichment whose range no longer matches the
   *  requested instance must not be served, fresh OR stale). */
  async getSWR(
    p: ProducerLike,
    addr: ArtifactAddress,
    opts?: { accept?: (value: StoredArtifact) => boolean },
  ): Promise<{
    canonicalKey: string;
    servedKey: string;
    value: StoredArtifact | null;
    stale: boolean;
  }> {
    const info = keyInfoOf(p);
    const canonicalKey = this.scheme.key(info, addr);
    const accept = opts?.accept ?? (() => true);
    const hit = await this.get(canonicalKey);
    if (hit && accept(hit)) {
      return { canonicalKey, servedKey: canonicalKey, value: hit, stale: false };
    }
    const prevKey = this.scheme.previousKey(canonicalKey, info);
    if (prevKey) {
      const prev = await this.get(prevKey);
      if (prev && accept(prev)) {
        return { canonicalKey, servedKey: prevKey, value: prev, stale: true };
      }
    }
    return { canonicalKey, servedKey: canonicalKey, value: null, stale: false };
  }

  /**
   * Write one entry — plain JSON, NO TTL ever (outputs are deterministic per
   * key; expiry would silently rot warmed pages — see writeCachedResult).
   *
   * HUMAN-EDIT GUARD: if the existing entry is human-authored
   * (provenance.authority === 'human') and the incoming value is not, the
   * write is refused ({ok:false, reason:'human-locked'}). Human-over-human
   * always writes. `force` cannot launder a non-human value over a human one —
   * it is reserved for future, stricter lock modes and only ever applies when
   * the incoming authority IS 'human'.
   *
   * Known race (accepted): the guard is read-check-write, not atomic. Two
   * concurrent writers can interleave between the read and the put; KV offers
   * no CAS, and the guard's job is preventing the SYSTEMATIC clobber (a
   * re-warm overwriting an edit), not winning a same-millisecond race.
   */
  async put(key: string, value: StoredArtifact, _opts?: { force?: boolean }): Promise<PutResult> {
    const existing = await this.get(key);
    const existingHuman = existing?.provenance?.authority === 'human';
    const incomingHuman = value.provenance?.authority === 'human';
    if (existingHuman && !incomingHuman) return { ok: false, reason: 'human-locked' };
    await this.kv.put(key, JSON.stringify(value));
    return { ok: true };
  }

  async evict(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  /**
   * Generalized staleness for a stored entry against the producer's CURRENT
   * recipe (and optionally its current inputs). The recipe leg mirrors the
   * /api/stale tri-state exactly (fresh / stale / unknown), extended with a
   * second input-hash leg:
   *
   *  - no stored recipe hash (pre-stamp entry)        → 'unknown'
   *  - stored hash ≠ current recipe hash              → 'stale-recipe'
   *  - currentInputs given + stored provenance inputs: any pair (matched by
   *    artifactId, else sourceKey) whose contentHashes both exist and differ  → 'stale-inputs'
   *  - otherwise                                       → 'fresh'
   */
  async staleness(
    stored: StoredArtifact,
    p: { recipe: Recipe } | { recipeHash: string },
    currentInputs?: InputRef[],
  ): Promise<Staleness> {
    const storedHash = stored.recipe_hash ?? stored.provenance?.recipeHash;
    if (!storedHash) return 'unknown';
    const currentHash = 'recipeHash' in p ? p.recipeHash : await recipeHash(p.recipe);
    if (storedHash !== currentHash) return 'stale-recipe';
    const storedInputs = stored.provenance?.inputs;
    if (currentInputs && storedInputs) {
      for (const cur of currentInputs) {
        if (cur.contentHash === undefined) continue;
        const match = storedInputs.find((s) =>
          cur.artifactId !== undefined
            ? s.artifactId === cur.artifactId
            : cur.sourceKey !== undefined && s.sourceKey === cur.sourceKey,
        );
        if (match?.contentHash !== undefined && match.contentHash !== cur.contentHash) {
          return 'stale-inputs';
        }
      }
    }
    return 'fresh';
  }
}
