/**
 * "Needs global enrichment" backlog. As users explore the app, the rabbi mark
 * surfaces people who aren't in the bundled rabbi-places.json (enrichRabbi
 * returns slug=null), the places mark surfaces locations that have no global
 * gazetteer at all, and the daf-background.concepts enrichment surfaces legal
 * concepts / realia / assumed-prior terms that have no global glossary yet. We
 * record each distinct sighting here so we can see — and grow — the list of
 * entities still missing base global context. This is the collect half of
 * "collect bottom-up across Shas, dedupe + promote to a canonical registry
 * later" (the same principle behind the curated rabbi-places.json).
 *
 * One KV entry per entity (`unknown-rabbi:v1:<norm>` / `observed-place:v1:<norm>`
 * / `observed-concept:v1:<norm>`) with a sighting count + the dafim it appeared
 * on. Distinct keys mean writes don't contend on a single hot array; each is
 * read-modify-write only on the (rare) cache-miss compute that first sees the
 * entity on a given daf.
 */

const RABBI_PREFIX = 'unknown-rabbi:v1:';
const PLACE_PREFIX = 'observed-place:v1:';
const CONCEPT_PREFIX = 'observed-concept:v1:';
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

export interface ObservedConcept {
  term: string;       // English label
  termHe: string;     // Hebrew script (the canonical key — varies less than EN)
  gloss: string;      // representative gloss (first sighting; canonicalised later)
  category?: string;  // 'legal-concepts' | 'realia' | 'assumed-prior'
  firstSeen: number;
  lastSeen: number;
  count: number;
  dafs: string[];
}

// The `places` mark is an LLM extractor that, on rabbi-heavy dafim, over-emits:
// it tags people ("רב אשי", "רבי מאיר", "רב ירמיה מדפתי") and peoples ("ארמאי"
// Aramean, "כותי" Samaritan) as locations. The prompt now warns against this,
// but a flash model still leaks, so we keep a deterministic net here — applied
// both when recording a sighting and when listing the backlog (so junk already
// in KV stops showing without a destructive purge).
const RABBI_TITLE_TOKENS = new Set(['רב', 'רבי', 'רבא', 'רבה', 'מר', 'אבא', 'אביי', 'רבן', 'ריש', "ר'", 'ר׳']);
const RABBI_SOLO_NAMES = new Set(['רבינא', 'אביי', 'רבא', 'רבה', 'רבן']); // single-token names carrying no title
const ETHNONYMS_HE = new Set(['ארמאי', 'ארמית', 'ארמאין', 'כותי', 'כותים', 'נכרי', 'נכרים', 'גוי', 'גויים', 'עכום']);
const PATRONYMIC_RE = /\s(בר|בן|ברה)\s|\sבריה/; // "X bar/ben Y", "X בריה ד..." (son of) — boundary-anchored so it doesn't fire inside טבריה (Tiberias)

function stripNiqqud(s?: string): string {
  return (s || '').replace(/[֑-ׇ]/g, '').trim();
}

function looksLikePerson(name?: string, nameHe?: string): boolean {
  const he = stripNiqqud(nameHe);
  if (he) {
    const tokens = he.split(/\s+/);
    if (RABBI_TITLE_TOKENS.has(tokens[0])) return true;
    if (tokens.length === 1 && RABBI_SOLO_NAMES.has(tokens[0])) return true;
    if (PATRONYMIC_RE.test(` ${he} `)) return true;
  }
  const en = (name || '').trim();
  if (/^(rabbi|rav|rava|ravina|rabbah|rabban|mar|abaye|resh)\b/i.test(en)) return true;
  if (/\b(bar|ben|son of)\b/i.test(en)) return true;
  return false;
}

function isEthnonym(name?: string, nameHe?: string): boolean {
  if (ETHNONYMS_HE.has(stripNiqqud(nameHe))) return true;
  return /^(aramean|aramaean|samaritan|cuthean|gentile|heathen|idolater)/i.test((name || '').trim());
}

/** True when an emitted "place" is a real geographic location — i.e. not a
 *  rabbi/sage misclassified as a city, and not a people/nation. */
export function isRealPlace(name?: string, nameHe?: string): boolean {
  return !looksLikePerson(name, nameHe) && !isEthnonym(name, nameHe);
}

// `count` is a best-effort APPROXIMATION, not an exact tally. This read-modify-
// write isn't atomic, so concurrent compute for the same key (parallel
// enrichment jobs, or the same term emitted twice in one daf's output) can read
// the same prior record and clobber each other's increment. That's an acceptable
// trade for a triage backlog — the signal we need is "which entities recur a lot
// and lack global context", and relative ordering survives the occasional lost
// increment. (`dafs` is similarly best-effort but only ever grows toward MAX_DAFS.)
// If exact counts ever matter, this needs a Durable Object / queue, not KV.
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

// Await-able cores. `record*` wrap these in ctx.waitUntil for the request path
// (fire-and-forget); the cache backfill (backfill-backlog.ts) awaits them
// directly so it can pace itself against the per-invocation subrequest budget.

export async function putUnknownRabbi(
  cache: KVNamespace,
  r: { name?: string; nameHe?: string; generation?: string; tractate: string; page: string },
): Promise<void> {
  const keyPart = norm(r.name || '') || norm(r.nameHe || '');
  if (!keyPart) return;
  const daf = `${r.tractate} ${r.page}`.trim();
  const now = Date.now();
  await bump<UnknownRabbi>(
    cache,
    RABBI_PREFIX + keyPart,
    () => ({ name: r.name ?? '', nameHe: r.nameHe ?? '', generation: r.generation, firstSeen: now, lastSeen: now, count: 0, dafs: [] }),
    daf,
  );
}

export async function putObservedPlace(
  cache: KVNamespace,
  p: { name?: string; nameHe?: string; kind?: string; region?: string; tractate: string; page: string },
): Promise<void> {
  if (!isRealPlace(p.name, p.nameHe)) return; // people / peoples are not gazetteer candidates
  const keyPart = norm(p.name || '') || norm(p.nameHe || '');
  if (!keyPart) return;
  const daf = `${p.tractate} ${p.page}`.trim();
  const now = Date.now();
  await bump<ObservedPlace>(
    cache,
    PLACE_PREFIX + keyPart,
    () => ({ name: p.name ?? '', nameHe: p.nameHe ?? '', kind: p.kind, region: p.region, firstSeen: now, lastSeen: now, count: 0, dafs: [] }),
    daf,
  );
}

export async function putObservedConcept(
  cache: KVNamespace,
  c: { term?: string; termHe?: string; gloss?: string; category?: string; tractate: string; page: string },
): Promise<void> {
  // Key on Hebrew first — Hebrew script is the stabler identity (the English
  // label drifts: "Kohen"/"priest"/"kohanim"); fall back to English only when
  // there's no Hebrew.
  const keyPart = norm(c.termHe || '') || norm(c.term || '');
  if (!keyPart) return;
  const daf = `${c.tractate} ${c.page}`.trim();
  const now = Date.now();
  await bump<ObservedConcept>(
    cache,
    CONCEPT_PREFIX + keyPart,
    () => ({ term: c.term ?? '', termHe: c.termHe ?? '', gloss: c.gloss ?? '', category: c.category, firstSeen: now, lastSeen: now, count: 0, dafs: [] }),
    daf,
  );
}

// Batch merge for the cache backfill: dedupes a page's worth of sightings by KV
// key in memory, then does ONE read-modify-write per distinct entity (count +=
// the number of distinct dafs it was seen on this batch). This bounds the
// per-tick subrequest cost to ~distinct-entities (not total sightings) and is
// inflation-free within a batch — a daf seen twice in the page counts once.
async function bumpBatch<T extends { firstSeen: number; lastSeen: number; count: number; dafs: string[] }>(
  cache: KVNamespace,
  entries: Array<{ key: string; seed: () => T; daf: string }>,
): Promise<void> {
  const byKey = new Map<string, { seed: () => T; dafs: string[] }>();
  for (const e of entries) {
    if (!e.daf) continue;
    const g = byKey.get(e.key);
    if (g) { if (!g.dafs.includes(e.daf)) g.dafs.push(e.daf); }
    else byKey.set(e.key, { seed: e.seed, dafs: [e.daf] });
  }
  const now = Date.now();
  for (const [key, g] of byKey) {
    try {
      const existing = await cache.get(key);
      const rec: T = existing ? (JSON.parse(existing) as T) : g.seed();
      rec.lastSeen = now;
      rec.count = (rec.count ?? 0) + g.dafs.length;
      for (const d of g.dafs) if (!rec.dafs.includes(d) && rec.dafs.length < MAX_DAFS) rec.dafs.push(d);
      await cache.put(key, JSON.stringify(rec), { expirationTtl: TTL_S });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[unknown-registry] batch write failed:', String(err));
    }
  }
}

export function putObservedConceptsBatch(
  cache: KVNamespace,
  items: Array<{ term?: string; termHe?: string; gloss?: string; category?: string; tractate: string; page: string }>,
): Promise<void> {
  const now = Date.now();
  return bumpBatch<ObservedConcept>(cache, items.flatMap((c) => {
    const keyPart = norm(c.termHe || '') || norm(c.term || '');
    if (!keyPart) return [];
    return [{
      key: CONCEPT_PREFIX + keyPart,
      daf: `${c.tractate} ${c.page}`.trim(),
      seed: () => ({ term: c.term ?? '', termHe: c.termHe ?? '', gloss: c.gloss ?? '', category: c.category, firstSeen: now, lastSeen: now, count: 0, dafs: [] }),
    }];
  }));
}

export function putObservedPlacesBatch(
  cache: KVNamespace,
  items: Array<{ name?: string; nameHe?: string; kind?: string; region?: string; tractate: string; page: string }>,
): Promise<void> {
  const now = Date.now();
  return bumpBatch<ObservedPlace>(cache, items.flatMap((p) => {
    if (!isRealPlace(p.name, p.nameHe)) return [];
    const keyPart = norm(p.name || '') || norm(p.nameHe || '');
    if (!keyPart) return [];
    return [{
      key: PLACE_PREFIX + keyPart,
      daf: `${p.tractate} ${p.page}`.trim(),
      seed: () => ({ name: p.name ?? '', nameHe: p.nameHe ?? '', kind: p.kind, region: p.region, firstSeen: now, lastSeen: now, count: 0, dafs: [] }),
    }];
  }));
}

export function putUnknownRabbisBatch(
  cache: KVNamespace,
  items: Array<{ name?: string; nameHe?: string; generation?: string; tractate: string; page: string }>,
): Promise<void> {
  const now = Date.now();
  return bumpBatch<UnknownRabbi>(cache, items.flatMap((r) => {
    const keyPart = norm(r.name || '') || norm(r.nameHe || '');
    if (!keyPart) return [];
    return [{
      key: RABBI_PREFIX + keyPart,
      daf: `${r.tractate} ${r.page}`.trim(),
      seed: () => ({ name: r.name ?? '', nameHe: r.nameHe ?? '', generation: r.generation, firstSeen: now, lastSeen: now, count: 0, dafs: [] }),
    }];
  }));
}

export function recordUnknownRabbi(
  env: { CACHE?: KVNamespace },
  ctx: { waitUntil(p: Promise<unknown>): void },
  r: { name?: string; nameHe?: string; generation?: string; tractate: string; page: string },
): void {
  if (!env.CACHE) return;
  ctx.waitUntil(putUnknownRabbi(env.CACHE, r));
}

export function recordObservedPlace(
  env: { CACHE?: KVNamespace },
  ctx: { waitUntil(p: Promise<unknown>): void },
  p: { name?: string; nameHe?: string; kind?: string; region?: string; tractate: string; page: string },
): void {
  if (!env.CACHE) return;
  ctx.waitUntil(putObservedPlace(env.CACHE, p));
}

export function recordObservedConcept(
  env: { CACHE?: KVNamespace },
  ctx: { waitUntil(p: Promise<unknown>): void },
  c: { term?: string; termHe?: string; gloss?: string; category?: string; tractate: string; page: string },
): void {
  if (!env.CACHE) return;
  ctx.waitUntil(putObservedConcept(env.CACHE, c));
}

export interface UnknownSummary<T> {
  total: number;        // distinct entities tracked
  sightings: number;    // sum of counts
  sample: T[];          // top entities by sighting count
}

async function listPrefix<T extends { count: number }>(
  cache: KVNamespace,
  prefix: string,
  sample: number,
  keep?: (r: T) => boolean,
): Promise<UnknownSummary<T>> {
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
      if (keep && !keep(r)) continue;
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
  // Hide historical junk (rabbis/peoples the old prompt mis-tagged as places)
  // without a destructive purge — the bad KV entries simply age out via TTL.
  return listPrefix<ObservedPlace>(cache, PLACE_PREFIX, sample, (r) => isRealPlace(r.name, r.nameHe));
}

export function listObservedConcepts(cache: KVNamespace, sample = 50): Promise<UnknownSummary<ObservedConcept>> {
  // No noise filter: terms come from the structured daf-background.concepts
  // schema (already curated by the LLM into {term, termHe, gloss}), not a
  // free-text extractor, so there's no people/places leakage to net out.
  return listPrefix<ObservedConcept>(cache, CONCEPT_PREFIX, sample);
}
