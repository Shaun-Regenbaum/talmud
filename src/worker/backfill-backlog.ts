/**
 * One-time-ish backfill for the observed-* backlogs (unknown-registry.ts).
 *
 * Those backlogs (observed-concept / observed-place / unknown-rabbi) only
 * record on a FRESH generation (cache miss), so they under-represent the corpus
 * that was generated before recording existed / while it was cached. This walks
 * the ALREADY-cached mark/enrichment results and feeds each observed entity into
 * the same backlog, so the Usage page reflects everything that exists, not just
 * what regenerated since.
 *
 * Mechanism: gated by the KV key `backfill-backlog:state` (absent => disabled).
 * When set, the scheduled handler runs a tick INSTEAD of the warm cron (so the
 * backfill gets the full per-invocation subrequest budget). Each tick processes
 * a bounded number of KV list pages for the current source, reading + recording
 * whole pages (KV list cursors advance per page, not per key, so we never stop
 * mid-page — that would re-read and inflate counts on resume). State carries the
 * source + the KV list cursor; when a source's list completes we advance to the
 * next; when all are done the state key is deleted (recording stops).
 *
 * Counts are best-effort (see bump() in unknown-registry): re-running an already
 * live-recorded daf bumps its count again, but `dafs` dedupes so the visible
 * sample stays correct. Enable once, let it converge, leave it deleted.
 */
import { TRACTATE_IDS } from '../lib/sefref/hebrewbooks/client';
import { iterAmudim } from '../lib/sefref/amudim';
import { slugDaf } from './cache-keys';
import { CODE_MARKS, CODE_ENRICHMENTS } from './code-marks';
import { putObservedConceptsBatch, putObservedPlacesBatch, putUnknownRabbisBatch } from './unknown-registry';

export const BACKFILL_STATE_KEY = 'backfill-backlog:state';

export const BACKFILL_SOURCES = ['concepts', 'places', 'rabbis'] as const;
export type BackfillSource = (typeof BACKFILL_SOURCES)[number];

// Prefix of the cached results each source reads. concepts = the
// daf-background.concepts enrichment; places/rabbis = the marks. The CURRENT
// cache_version is pinned into the prefix (derived from the live def, so a
// future bump follows automatically) — superseded-version keys linger in KV
// until TTL, and reading them would seed the backlog with terms/entities the
// current recipe no longer produces. The `:he:` namespace still passes the
// prefix (langSeg follows the version) and is filtered in dafFromCacheKey.
function markVersion(id: string): string { return CODE_MARKS.find((m) => m.id === id)?.cache_version ?? ''; }
function enrichVersion(id: string): string { return CODE_ENRICHMENTS.find((e) => e.id === id)?.cache_version ?? ''; }
function sourcePrefix(source: BackfillSource): string {
  if (source === 'concepts') return `enrich:daf-background.concepts:${enrichVersion('daf-background.concepts')}:`;
  const id = source === 'places' ? 'places' : 'rabbi';
  return `mark:${id}:${markVersion(id)}:`;
}

// One KV list page per tick (== this many value reads), checkpointed right
// after — so a tick that fails replays only the current page, not several. With
// batched writes (one read-modify-write per DISTINCT entity, not per sighting)
// the worst-case subrequest cost is ~400 reads + a few hundred writes, well
// under the 1000/invocation cap given the real distributions (a few hundred
// distinct places; rabbi unknowns are rare; concepts tiny).
const LIST_LIMIT = 400;

export interface BackfillState { source: BackfillSource; cursor?: string }

interface BackfillEnv { CACHE?: KVNamespace }
type EnrichRabbiFn = (name: string, nameHe: string, generation: string) => { slug: string | null };

let SLUG_TO_DAF: Map<string, { tractate: string; page: string }> | null = null;
/** Inverse of slugDaf over all of Shas: the key suffix -> display daf. Built
 *  once (lazily) so backfilled `dafs` labels match the live-recorded form
 *  (`${tractate} ${page}`) instead of the lowercased slug. */
function slugToDaf(): Map<string, { tractate: string; page: string }> {
  if (SLUG_TO_DAF) return SLUG_TO_DAF;
  const m = new Map<string, { tractate: string; page: string }>();
  for (const tractate of Object.keys(TRACTATE_IDS)) {
    for (const page of iterAmudim(tractate)) m.set(slugDaf(tractate, page), { tractate, page });
  }
  SLUG_TO_DAF = m;
  return m;
}

/** Recover the display daf from a local cache key. The key ends with
 *  slugDaf = `${tractateSlug}:${pageSlug}` (its last two ':'-segments). Hebrew
 *  results (`:he:` namespace) are skipped — EN is the canonical sighting, and
 *  counting both langs would double every daf. Returns null for keys that don't
 *  map to a known daf (defensive). Pure + exported for tests. */
export function dafFromCacheKey(key: string): { tractate: string; page: string } | null {
  if (key.includes(':he:')) return null;
  const parts = key.split(':');
  if (parts.length < 2) return null;
  const slug = `${parts[parts.length - 2]}:${parts[parts.length - 1]}`;
  return slugToDaf().get(slug) ?? null;
}

function parsedOf(raw: string): unknown {
  try { return (JSON.parse(raw) as { parsed?: unknown }).parsed ?? null; } catch { return null; }
}

interface PageItems {
  concepts: Array<{ term?: string; termHe?: string; gloss?: string; category?: string; tractate: string; page: string }>;
  places: Array<{ name?: string; nameHe?: string; kind?: string; region?: string; tractate: string; page: string }>;
  rabbis: Array<{ name?: string; nameHe?: string; generation?: string; tractate: string; page: string }>;
}

function collectConcepts(out: PageItems, parsed: unknown, daf: { tractate: string; page: string }): void {
  const groups = (parsed as { groups?: Array<{ category?: string; terms?: Array<{ term?: string; termHe?: string; gloss?: string }> }> } | null)?.groups;
  if (!Array.isArray(groups)) return;
  for (const g of groups) {
    if (!Array.isArray(g?.terms)) continue;
    for (const t of g.terms) {
      if (!t || (!t.term && !t.termHe)) continue;
      out.concepts.push({ term: t.term, termHe: t.termHe, gloss: t.gloss, category: g.category, tractate: daf.tractate, page: daf.page });
    }
  }
}

function collectPlaces(out: PageItems, parsed: unknown, daf: { tractate: string; page: string }): void {
  const instances = (parsed as { instances?: Array<{ fields?: { name?: string; nameHe?: string; kind?: string; region?: string } }> } | null)?.instances;
  if (!Array.isArray(instances)) return;
  for (const inst of instances) {
    const f = inst?.fields;
    if (!f || (!f.name && !f.nameHe)) continue;
    out.places.push({ name: f.name, nameHe: f.nameHe, kind: f.kind, region: f.region, tractate: daf.tractate, page: daf.page });
  }
}

function collectRabbis(out: PageItems, parsed: unknown, daf: { tractate: string; page: string }, enrichRabbi: EnrichRabbiFn): void {
  const instances = (parsed as { instances?: Array<{ fields?: { name?: string; nameHe?: string; generation?: string } }> } | null)?.instances;
  if (!Array.isArray(instances)) return;
  for (const inst of instances) {
    const f = inst?.fields;
    if (!f || (!f.name && !f.nameHe)) continue;
    // The backlog tracks rabbis NOT in the bundled dataset (slug=null) — the
    // same condition recordUnknownRabbi uses on the live rabbi.identity path.
    // enrichRabbi is an in-memory lookup (no subrequest).
    if (enrichRabbi(f.name ?? '', f.nameHe ?? '', f.generation ?? 'unknown').slug) continue;
    out.rabbis.push({ name: f.name, nameHe: f.nameHe, generation: f.generation, tractate: daf.tractate, page: daf.page });
  }
}

/** Run one backfill tick. No-op (returns null, so the caller runs the warm cron
 *  instead) when disabled. Otherwise: read ONE KV list page of the current
 *  source, collect every observed entity, BATCH-write them (one read-modify-
 *  write per distinct entity — bounds subrequests + avoids intra-page count
 *  inflation), then checkpoint the cursor. Checkpointing after the single page
 *  means a failed tick replays at most that one page. When a source's list is
 *  exhausted, advance to the next; when all are done, delete the state key. */
export async function runBacklogBackfill(env: BackfillEnv, enrichRabbi: EnrichRabbiFn): Promise<{ source: BackfillSource; processed: number; done: boolean } | null> {
  const cache = env.CACHE;
  if (!cache) return null;
  const raw = await cache.get(BACKFILL_STATE_KEY);
  if (!raw) return null;

  let state: BackfillState;
  try { state = JSON.parse(raw) as BackfillState; } catch { await cache.delete(BACKFILL_STATE_KEY); return null; }
  if (!BACKFILL_SOURCES.includes(state.source)) { await cache.delete(BACKFILL_STATE_KEY); return null; }

  const res = await cache.list({ prefix: sourcePrefix(state.source), cursor: state.cursor, limit: LIST_LIMIT });
  const items: PageItems = { concepts: [], places: [], rabbis: [] };
  let processed = 0;
  for (const k of res.keys) {
    const daf = dafFromCacheKey(k.name);
    if (!daf) continue;
    const rawVal = await cache.get(k.name);
    if (!rawVal) continue;
    const parsed = parsedOf(rawVal);
    if (!parsed) continue;
    processed++;
    if (state.source === 'concepts') collectConcepts(items, parsed, daf);
    else if (state.source === 'places') collectPlaces(items, parsed, daf);
    else collectRabbis(items, parsed, daf, enrichRabbi);
  }

  // One batched write per source — dedupes the page's sightings by entity so the
  // subrequest cost scales with distinct entities, not raw sightings.
  if (state.source === 'concepts') await putObservedConceptsBatch(cache, items.concepts);
  else if (state.source === 'places') await putObservedPlacesBatch(cache, items.places);
  else await putUnknownRabbisBatch(cache, items.rabbis);

  const cursor = res.list_complete ? undefined : res.cursor;
  if (cursor) {
    await cache.put(BACKFILL_STATE_KEY, JSON.stringify({ source: state.source, cursor } satisfies BackfillState));
    return { source: state.source, processed, done: false };
  }
  // Source complete — advance to the next, or finish (delete => warm resumes).
  const next = BACKFILL_SOURCES[BACKFILL_SOURCES.indexOf(state.source) + 1];
  if (next) await cache.put(BACKFILL_STATE_KEY, JSON.stringify({ source: next } satisfies BackfillState));
  else await cache.delete(BACKFILL_STATE_KEY);
  return { source: state.source, processed, done: !next };
}
