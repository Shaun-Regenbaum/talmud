/**
 * @fileoverview The Shas-wide sage identity index: for every page, which
 * registry person each sage mention is, with a probability.
 *
 * Built offline from the Jev pass over all of the Bavli (DSS
 * `talmud/bavli-sage-mentions-jev`; scripts in
 * Sandbox/2026-09-17-jev-shas-rabbis) and shipped as one JSON file per
 * tractate under static/sage-index/. Each row is a mention: segment, word
 * position, the matched Hebrew, the registry slug, the probability, and how it
 * was resolved (u = the only registry candidate, j = the model at p >= 0.6,
 * l = the model under 0.6).
 *
 * Two consumers:
 *   - computeRabbiPin (index.ts) asks the index BEFORE calling a model: when
 *     every mention of a homonym on the page resolved to the same person at a
 *     high probability, that is the pin, for free. Scored against Sefaria's
 *     own person tags the model agreed 97.8% of the time at p >= 0.9, so that
 *     is the floor (INDEX_PIN_MIN_P). A page whose mentions split between two
 *     bearers is left to the live pin, which sees the whole cast.
 *   - GET /api/sage-index/:tractate/:page serves the rows for the reader and
 *     the inspector, at statement grain: the same name CAN resolve to two
 *     people on one page, which the daf-level pin cannot express.
 *
 * Loading is best-effort: no index file, or a build without the assets, means
 * an empty page and the callers fall through to what they did before. The
 * generation worker has no assets binding, so it falls back to fetching the
 * reader's public copy of the file (DEFAULT_PUBLIC_ORIGIN / PUBLIC_ORIGIN).
 */

import { canonicalSlug, slugToName } from './rabbi-graph';

export interface SageIndexRow {
  /** 0-based Sefaria segment on the page. */
  seg: number;
  /** 0-based word position within the normalized segment. */
  wordIdx: number;
  /** The matched Hebrew words as they appear (normalized). */
  surface: string;
  slug: string;
  p: number;
  method: 'u' | 'j' | 'l';
}

type PackedRow = [number, number, string, string, number, string];

export interface SageIndexDoc {
  version: number;
  generatedAt: string;
  source: string;
  model: string;
  promptVersion: string;
  tractate: string;
  amudim: Record<string, PackedRow[]>;
}

/** Probability at/above which an index row may pin a homonym on its own. */
export const INDEX_PIN_MIN_P = 0.9;
/** Share of a page's mentions of the name that must agree on one person. */
export const INDEX_PIN_MIN_SHARE = 0.8;

/** Static path the tractate's index is served at (vite copies static/ into
 *  the assets build, so this is `/sage-index/Bava_Kamma.json`). */
export function sageIndexPath(tractate: string): string {
  return `/sage-index/${encodeURIComponent(tractate.replace(/ /g, '_'))}.json`;
}

/** Where the reader serves its static files. The generation worker
 *  (wrangler.generator.toml) has no assets binding, and the pin runs there
 *  when a run is queued, so it reads the same file over HTTP from the reader.
 *  Override with the PUBLIC_ORIGIN var. */
export const DEFAULT_PUBLIC_ORIGIN = 'https://talmud.dev';

// Per-isolate memo. One tractate file is 30-300 KB and every rabbi card on a
// page asks for the same one, so the first read pays and the rest are free.
const loaded = new Map<string, Promise<SageIndexDoc | null>>();

async function parseDoc(p: Promise<Response>): Promise<SageIndexDoc | null> {
  try {
    const res = await p;
    if (!res.ok) return null;
    const text = await res.text();
    // The ASSETS binding serves index.html (status 200) for a missing path;
    // accept only our JSON.
    if (!text.trimStart().startsWith('{')) return null;
    const doc = JSON.parse(text) as SageIndexDoc;
    return doc && typeof doc === 'object' && doc.amudim ? doc : null;
  } catch {
    return null;
  }
}

async function fetchDoc(
  assets: Fetcher | undefined,
  tractate: string,
  origin: string | null,
): Promise<SageIndexDoc | null> {
  const path = sageIndexPath(tractate);
  let doc = assets
    ? await parseDoc(assets.fetch(new Request(`https://assets.local${path}`)))
    : null;
  if (!doc && origin) doc = await parseDoc(fetch(`${origin}${path}`));
  return doc;
}

/** `origin`: where to fetch the public copy when the assets binding is absent
 *  or serves the SPA page. `undefined` = the default reader origin; `null` =
 *  no network fallback (tests, or a caller that wants the bundle only). */
export async function loadSageIndex(
  assets: Fetcher | undefined,
  tractate: string,
  origin: string | null | undefined = DEFAULT_PUBLIC_ORIGIN,
): Promise<SageIndexDoc | null> {
  const fallback = origin === undefined ? DEFAULT_PUBLIC_ORIGIN : origin;
  if (!assets && !fallback) return null;
  const key = tractate.toLowerCase();
  let p = loaded.get(key);
  if (!p) {
    p = fetchDoc(assets, tractate, fallback);
    loaded.set(key, p);
    // Do not memoize a transient failure.
    p.then((d) => {
      if (!d) loaded.delete(key);
    });
  }
  return p;
}

/** Tests: forget memoized documents. */
export function resetSageIndexCache(): void {
  loaded.clear();
}

export function unpackRows(rows: readonly PackedRow[] | undefined): SageIndexRow[] {
  if (!rows) return [];
  const out: SageIndexRow[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 6) continue;
    const [seg, wordIdx, surface, slug, p, method] = r;
    if (typeof seg !== 'number' || typeof slug !== 'string' || typeof p !== 'number') continue;
    if (method !== 'u' && method !== 'j' && method !== 'l') continue;
    out.push({ seg, wordIdx, surface: String(surface), slug: canonicalSlug(slug), p, method });
  }
  return out;
}

/** All indexed mentions on one page (empty when the index is absent). */
export async function sageIndexForPage(
  assets: Fetcher | undefined,
  tractate: string,
  page: string,
  origin: string | null | undefined = DEFAULT_PUBLIC_ORIGIN,
): Promise<SageIndexRow[]> {
  const doc = await loadSageIndex(assets, tractate, origin);
  return unpackRows(doc?.amudim[page]);
}

export interface IndexVerdict {
  /** The person every high-probability mention agrees on, or null. */
  slug: string | null;
  /** Mentions on the page whose slug is one of the candidates. */
  n: number;
  /** Of those, how many resolved to `slug`. */
  agree: number;
  /** Mean probability of the agreeing mentions. */
  meanP: number;
  reason: string;
}

/**
 * Decide a homonym from the page's index rows. Only rows whose slug is one of
 * the offered candidates count (the page also mentions other people). The
 * top slug must hold INDEX_PIN_MIN_SHARE of those rows and average
 * INDEX_PIN_MIN_P; anything less is "the index does not settle it" and the
 * caller goes on to the live pin. Rows the model resolved under 0.6 (`l`)
 * never contribute to a pin.
 */
export function indexVerdict(
  rows: readonly SageIndexRow[],
  candidates: readonly string[],
): IndexVerdict {
  const cands = new Set(candidates.map(canonicalSlug));
  const hits = rows.filter((r) => cands.has(r.slug));
  if (hits.length === 0)
    return {
      slug: null,
      n: 0,
      agree: 0,
      meanP: 0,
      reason: 'no indexed mention of this name on the page',
    };
  const bySlug = new Map<string, { n: number; sumP: number; strong: number }>();
  for (const r of hits) {
    const e = bySlug.get(r.slug) ?? { n: 0, sumP: 0, strong: 0 };
    e.n++;
    e.sumP += r.p;
    if (r.method !== 'l' && r.p >= INDEX_PIN_MIN_P) e.strong++;
    bySlug.set(r.slug, e);
  }
  const [top, e] = [...bySlug.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  const share = e.n / hits.length;
  const meanP = e.sumP / e.n;
  const base = { n: hits.length, agree: e.n, meanP: Math.round(meanP * 1000) / 1000 };
  if (share < INDEX_PIN_MIN_SHARE) {
    return {
      slug: null,
      ...base,
      reason: `mentions split between ${bySlug.size} bearers (${[...bySlug.entries()].map(([s, v]) => `${slugToName(s)} ${v.n}`).join(', ')})`,
    };
  }
  if (e.strong < e.n || meanP < INDEX_PIN_MIN_P) {
    return {
      slug: null,
      ...base,
      reason: `${e.n} of ${hits.length} mentions read as ${slugToName(top)} but only ${e.strong} at p >= ${INDEX_PIN_MIN_P} (mean ${base.meanP})`,
    };
  }
  return {
    slug: top,
    ...base,
    reason: `${e.n} of ${hits.length} mentions on this page resolve to ${slugToName(top)}, mean p ${base.meanP}`,
  };
}
