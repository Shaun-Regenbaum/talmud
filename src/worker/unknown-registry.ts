/**
 * "Needs global enrichment" backlog. As users explore the app, the rabbi mark
 * surfaces people who aren't in the bundled rabbi-places.json (enrichRabbi
 * returns slug=null), and the places mark surfaces locations that have no
 * global gazetteer at all. We record each distinct sighting here so we can see
 * — and grow — the list of entities still missing base global context.
 *
 * One KV entry per entity (`unknown-rabbi:v1:<norm>` / `observed-place:v1:<norm>`)
 * with a sighting count + the dafim it appeared on. Distinct keys mean writes
 * don't contend on a single hot array; each is read-modify-write only on the
 * (rare) cache-miss compute that first sees the entity on a given daf.
 */

const RABBI_PREFIX = 'unknown-rabbi:v1:';
const PLACE_PREFIX = 'observed-place:v1:';
const TTL_S = 60 * 60 * 24 * 365; // a year; the backlog is long-lived
const MAX_DAFS = 25;              // cap the per-entity daf list

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')                 // Hebrew niqqud / cantillation
    .replace(/["'.,:;!?()[\]{}־–—]/g, '') // punctuation incl. maqaf/dashes + colon
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export interface UnknownRabbi {
  name: string;
  nameHe: string;
  generation?: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
  dafs: string[];
}

export interface ObservedPlace {
  name: string;
  nameHe: string;
  kind?: string;
  region?: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
  dafs: string[];
}

async function bump<T extends { firstSeen: number; lastSeen: number; count: number; dafs: string[] }>(
  cache: KVNamespace,
  key: string,
  seed: () => T,
  daf: string,
): Promise<void> {
  try {
    const now = Date.now();
    const existing = await cache.get(key);
    const rec: T = existing ? (JSON.parse(existing) as T) : seed();
    rec.lastSeen = now;
    rec.count = (rec.count ?? 0) + 1;
    if (daf && !rec.dafs.includes(daf) && rec.dafs.length < MAX_DAFS) rec.dafs.push(daf);
    await cache.put(key, JSON.stringify(rec), { expirationTtl: TTL_S });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[unknown-registry] KV write failed:', String(err));
  }
}

export function recordUnknownRabbi(
  env: { CACHE?: KVNamespace },
  ctx: { waitUntil(p: Promise<unknown>): void },
  r: { name?: string; nameHe?: string; generation?: string; tractate: string; page: string },
): void {
  if (!env.CACHE) return;
  const keyPart = norm(r.name || '') || norm(r.nameHe || '');
  if (!keyPart) return;
  const daf = `${r.tractate} ${r.page}`.trim();
  const now = Date.now();
  ctx.waitUntil(
    bump<UnknownRabbi>(
      env.CACHE,
      RABBI_PREFIX + keyPart,
      () => ({ name: r.name ?? '', nameHe: r.nameHe ?? '', generation: r.generation, firstSeen: now, lastSeen: now, count: 0, dafs: [] }),
      daf,
    ),
  );
}

export function recordObservedPlace(
  env: { CACHE?: KVNamespace },
  ctx: { waitUntil(p: Promise<unknown>): void },
  p: { name?: string; nameHe?: string; kind?: string; region?: string; tractate: string; page: string },
): void {
  if (!env.CACHE) return;
  const keyPart = norm(p.name || '') || norm(p.nameHe || '');
  if (!keyPart) return;
  const daf = `${p.tractate} ${p.page}`.trim();
  const now = Date.now();
  ctx.waitUntil(
    bump<ObservedPlace>(
      env.CACHE,
      PLACE_PREFIX + keyPart,
      () => ({ name: p.name ?? '', nameHe: p.nameHe ?? '', kind: p.kind, region: p.region, firstSeen: now, lastSeen: now, count: 0, dafs: [] }),
      daf,
    ),
  );
}

export interface UnknownSummary<T> {
  total: number;        // distinct entities tracked
  sightings: number;    // sum of counts
  sample: T[];          // top entities by sighting count
}

async function listPrefix<T extends { count: number }>(cache: KVNamespace, prefix: string, sample: number): Promise<UnknownSummary<T>> {
  const names: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const res = (await cache.list({ prefix, cursor, limit: 1000 })) as {
      keys: Array<{ name: string }>; list_complete: boolean; cursor?: string;
    };
    for (const k of res.keys) names.push(k.name);
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }
  const recs = await Promise.all(names.map((n) => cache.get(n)));
  const parsed: T[] = [];
  let sightings = 0;
  for (const raw of recs) {
    if (!raw) continue;
    try {
      const r = JSON.parse(raw) as T;
      parsed.push(r);
      sightings += r.count ?? 0;
    } catch { /* skip corrupt */ }
  }
  parsed.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  return { total: parsed.length, sightings, sample: parsed.slice(0, sample) };
}

export function listUnknownRabbis(cache: KVNamespace, sample = 50): Promise<UnknownSummary<UnknownRabbi>> {
  return listPrefix<UnknownRabbi>(cache, RABBI_PREFIX, sample);
}

export function listObservedPlaces(cache: KVNamespace, sample = 50): Promise<UnknownSummary<ObservedPlace>> {
  return listPrefix<ObservedPlace>(cache, PLACE_PREFIX, sample);
}
