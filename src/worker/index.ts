import { Hono } from 'hono';
import {
  sefariaAPI,
  adjacentAmud,
  type TalmudPageData,
  type RishonimBundle,
  type HalachicRefBundle,
  type HebrewBooksDaf,
} from '../lib/sefref';
import {
  getHebrewBooksDafCached,
  getSefariaPageCached,
  getRishonimCached,
  getHalachaRefsCached,
} from './source-cache';
import { runWarmCron, readWarmCursor, warmProgressProcessed, getWarmTotal, type EmailBinding } from './warm-cron';
import {
  computeCacheStats,
  readCachedCacheStats,
  writeCachedCacheStats,
  isFresh,
} from './cache-stats';
import { runYomiWarmCron } from './yomi-cron';
import { GENERATION_IDS, GENERATION_BY_ID, GENERATIONS_PROMPT_REFERENCE, type GenerationId } from '../client/generations';
import rabbiPlacesData from '../lib/data/rabbi-places.json';

type Movement = 'bavel->israel' | 'israel->bavel' | 'both' | null;
interface RabbiPlacesEntry {
  canonical: string;
  canonicalHe?: string | null;
  aliases: string[];
  places: string[];
  region: 'israel' | 'bavel' | null;
  numSources?: number | null;
  generation?: string | null;
  moved?: Movement;
  bio?: string | null;
  image?: string | null;
  wiki?: string | null;
}
interface RabbiPlacesFile {
  generatedAt: string;
  source: string;
  cityRegions: Record<string, 'israel' | 'bavel'>;
  rabbis: Record<string, RabbiPlacesEntry>;
  aliasIndex: Record<string, string>;
}
const RABBI_PLACES = rabbiPlacesData as unknown as RabbiPlacesFile;

interface Bindings {
  ASSETS: Fetcher;
  AI?: Ai;
  CACHE?: KVNamespace;
  EMAIL?: EmailBinding;
}

function stripHtmlServer(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/admin/warm-status', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  const cursor = await readWarmCursor(cache);
  const total = getWarmTotal();
  const processed = warmProgressProcessed(cursor);
  return c.json({
    done: cursor.done === true,
    tractateIdx: cursor.tractateIdx,
    amudIdx: cursor.amudIdx,
    processed,
    total,
    percent: total === 0 ? 0 : Math.round((processed / total) * 1000) / 10,
  });
});

app.get('/api/admin/cache-stats', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  const cached = await readCachedCacheStats(cache);
  if (cached && isFresh(cached)) return c.json(cached);
  const stats = await computeCacheStats(cache);
  await writeCachedCacheStats(cache, stats);
  return c.json(stats);
});

/**
 * Client-side error / miss logger. The browser POSTs a small JSON payload
 * here and we (a) log to console so it surfaces via CF Workers Observability
 * and `wrangler tail`, and (b) keep a rolling ring buffer in KV so we can
 * grep for recurring errors from prod without always tailing. Deliberately
 * unauthenticated + cheap to call.
 */
app.post('/api/log', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'bad-json' }, 400);
  }
  const rec = {
    ts: new Date().toISOString(),
    ua: c.req.header('user-agent') ?? null,
    cf: (c.req.raw as unknown as { cf?: { country?: string } }).cf ?? null,
    ...(body as Record<string, unknown>),
  };
  // Observability / wrangler tail pick this up.
  // eslint-disable-next-line no-console
  console.warn('[client-log]', JSON.stringify(rec));

  const cache = c.env.CACHE;
  if (cache) {
    try {
      const key = 'client-logs:recent';
      const existing = await cache.get(key);
      const arr = existing ? (JSON.parse(existing) as unknown[]) : [];
      arr.push(rec);
      while (arr.length > 500) arr.shift();
      await cache.put(key, JSON.stringify(arr), { expirationTtl: 60 * 60 * 24 * 30 });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[client-log] KV write failed:', String(err));
    }
  }
  return c.json({ ok: true });
});

app.get('/api/log/recent', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache' }, 503);
  const raw = await cache.get('client-logs:recent');
  return c.json({ logs: raw ? (JSON.parse(raw) as unknown[]) : [] });
});

// --- Telemetry + /usage dashboard ---------------------------------------
type TelemetryEndpoint =
  | 'daf-context'
  | 'daf-context-stage2'
  | 'translate'
  | 'analyze'
  | 'halacha'
  | 'aggadata';

// String-typed so composed labels like `stage-a-<classifyError>` work without
// requiring a combinatorial explosion of literal types. Classifier values are
// still the core vocabulary; two-stage handlers prefix with `stage-a-` /
// `stage-b-` to distinguish which pipeline step errored.
type TelemetryErrorKind = string;

interface TelemetryRecord {
  ts: number;
  endpoint: TelemetryEndpoint;
  tractate?: string;
  page?: string;
  cache_hit: boolean;
  model?: string;
  ms: number;
  ok: boolean;
  error_kind?: TelemetryErrorKind;
}

function classifyError(detail: string): TelemetryErrorKind {
  if (/empty payload/i.test(detail)) return 'empty-payload';
  if (/non-json|SyntaxError/i.test(detail)) return 'non-json';
  if (/schema mismatch/i.test(detail)) return 'schema-mismatch';
  if (/1031|UpstreamError/i.test(detail)) return 'upstream-1031';
  if (/^HTTP \d|status \d/i.test(detail)) return 'http';
  return 'other';
}

// Fire-and-forget telemetry recorder: does NOT block the response. Caller
// should pass c.executionCtx so the write finishes after the client is served.
function recordTelemetry(
  ctx: { env: Bindings; executionCtx: ExecutionContext },
  rec: Omit<TelemetryRecord, 'ts'>,
): void {
  const full: TelemetryRecord = { ts: Date.now(), ...rec };
  ctx.executionCtx.waitUntil(logTelemetry(ctx.env.CACHE, full));
}

async function logTelemetry(cache: KVNamespace | undefined, rec: TelemetryRecord): Promise<void> {
  if (!cache) return;
  try {
    const key = 'telemetry:v1:recent';
    const existing = await cache.get(key);
    const arr = existing ? (JSON.parse(existing) as TelemetryRecord[]) : [];
    arr.push(rec);
    while (arr.length > 500) arr.shift();
    await cache.put(key, JSON.stringify(arr), { expirationTtl: 60 * 60 * 24 * 30 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[telemetry] KV write failed:', String(err));
  }
}

interface BugReport {
  ts: number;
  tractate: string;
  page: string;
  description: string;
  ua: string | null;
  country: string | null;
}

app.post('/api/report', async (c) => {
  let body: { tractate?: string; page?: string; description?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ ok: false, error: 'bad-json' }, 400);
  }
  const tractate = (body.tractate ?? '').slice(0, 60).trim();
  const page = (body.page ?? '').slice(0, 20).trim();
  const description = (body.description ?? '').slice(0, 4000).trim();
  if (!description) return c.json({ ok: false, error: 'empty description' }, 400);

  const cf = (c.req.raw as unknown as { cf?: { country?: string } }).cf;
  const rec: BugReport = {
    ts: Date.now(),
    tractate,
    page,
    description,
    ua: c.req.header('user-agent') ?? null,
    country: cf?.country ?? null,
  };
  const cache = c.env.CACHE;
  if (cache) {
    try {
      const key = 'reports:v1:recent';
      const existing = await cache.get(key);
      const arr = existing ? (JSON.parse(existing) as BugReport[]) : [];
      arr.push(rec);
      while (arr.length > 200) arr.shift();
      await cache.put(key, JSON.stringify(arr), { expirationTtl: 60 * 60 * 24 * 365 });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[report] KV write failed:', String(err));
    }
  }
  // eslint-disable-next-line no-console
  console.warn('[bug-report]', JSON.stringify(rec));
  return c.json({ ok: true });
});

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

app.get('/api/usage', async (c) => {
  const cache = c.env.CACHE;
  const telRaw = cache ? await cache.get('telemetry:v1:recent') : null;
  const repRaw = cache ? await cache.get('reports:v1:recent') : null;
  const telemetry = telRaw ? (JSON.parse(telRaw) as TelemetryRecord[]) : [];
  const reports = repRaw ? (JSON.parse(repRaw) as BugReport[]) : [];

  interface Rollup {
    count: number;
    cacheHits: number;
    cacheHitRate: number;
    p50Ms: number;
    p95Ms: number;
    errorCount: number;
    errorsByKind: Record<string, number>;
  }
  const perEndpoint: Record<string, Rollup> = {};
  const endpoints: TelemetryEndpoint[] = ['daf-context', 'daf-context-stage2', 'translate', 'analyze', 'halacha', 'aggadata'];
  for (const ep of endpoints) {
    const rows = telemetry.filter((r) => r.endpoint === ep);
    const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
    const hits = rows.filter((r) => r.cache_hit).length;
    const errors = rows.filter((r) => !r.ok);
    const errorsByKind: Record<string, number> = {};
    for (const e of errors) errorsByKind[e.error_kind ?? 'other'] = (errorsByKind[e.error_kind ?? 'other'] ?? 0) + 1;
    perEndpoint[ep] = {
      count: rows.length,
      cacheHits: hits,
      cacheHitRate: rows.length ? hits / rows.length : 0,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      errorCount: errors.length,
      errorsByKind,
    };
  }

  const recentErrors = telemetry
    .filter((r) => !r.ok)
    .slice(-30)
    .reverse()
    .map((r) => ({
      ts: r.ts, endpoint: r.endpoint, tractate: r.tractate,
      page: r.page, error_kind: r.error_kind, model: r.model,
    }));

  return c.json({
    telemetry: { perEndpoint, recentErrors, totalCount: telemetry.length },
    reports: [...reports].reverse(),
  });
});

// --- Commentaries list --------------------------------------------------
// Per-daf list of Rishonim / Acharonim commentaries (beyond the Rashi and
// Tosafot rendered inline on the daf). Each comment carries its anchor
// Sefaria segment index so the client can highlight the exact span the
// commentary is anchored to, using the data-seg alignment we injected.

interface CommentaryComment {
  anchorRef: string;                // e.g. "Berakhot 5a:3" or "Berakhot 5a:3:1-4"
  anchorSegIdx: number;             // zero-based index into Sefaria segments
  sourceRef: string;                // commentary's own ref, e.g. "Ramban on Berakhot 5a:3:1"
  textHe: string;
  textEn: string;
}

interface CommentaryWork {
  title: string;
  titleHe: string;
  count: number;
  comments: CommentaryComment[];
}

/** Parse the first segment number out of a Sefaria ref like "Berakhot 5a:3"
 *  or "Berakhot 5a:3:1-4". Returns zero-based index, or -1 if unparseable. */
function parseAnchorSegment(anchorRef: string): number {
  const m = anchorRef.match(/:(\d+)/);
  if (!m) return -1;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n - 1 : -1;
}

// (Rashi / Tosafot are rendered inline on the daf, but we STILL surface them
// in the picker — selecting them highlights the main-text segments they
// anchor to, and clicking a segment also highlights the gloss in the inner
// or outer column. So no work titles are filtered here.)

app.get('/api/commentaries/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  const cacheKey = `commentaries:v1:${tractate}:${page}`;

  if (cache && c.req.query('refresh') !== '1') {
    const hit = await cache.get(cacheKey);
    if (hit !== null) return c.json({ ...(JSON.parse(hit) as object), _cached: true });
  }

  const ref = `${tractate} ${page}`;
  const url = `https://www.sefaria.org/api/links/${encodeURIComponent(ref)}?with_text=1`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return c.json({ error: `Sefaria ${res.status}` }, 502);
    const raw = (await res.json()) as Array<{
      ref?: string;
      sourceRef?: string;
      anchorRef?: string;
      category?: string;
      collectiveTitle?: { en?: string; he?: string };
      index_title?: string;
      he?: string | string[];
      text?: string | string[];
    }>;

    const joinText = (x: string | string[] | undefined): string => {
      if (!x) return '';
      if (Array.isArray(x)) return x.map((t) => String(t ?? '')).join(' ').trim();
      return String(x).trim();
    };

    const byWork = new Map<string, CommentaryWork>();
    for (const l of raw) {
      if (l.category !== 'Commentary') continue;
      const title = l.collectiveTitle?.en ?? l.index_title ?? 'Unknown';
      const titleHe = l.collectiveTitle?.he ?? '';
      const anchorRef = l.anchorRef ?? '';
      const anchorSegIdx = parseAnchorSegment(anchorRef);
      if (anchorSegIdx < 0) continue;
      const comment: CommentaryComment = {
        anchorRef,
        anchorSegIdx,
        sourceRef: l.sourceRef ?? l.ref ?? '',
        textHe: joinText(l.he),
        textEn: joinText(l.text),
      };
      let work = byWork.get(title);
      if (!work) {
        work = { title, titleHe, count: 0, comments: [] };
        byWork.set(title, work);
      }
      work.comments.push(comment);
      work.count++;
    }

    // Sort works by count desc so popular ones (Meiri, Ramban, Rashba...)
    // land first in the UI picker.
    const works = Array.from(byWork.values()).sort((a, b) => b.count - a.count);

    const payload = { works, tractate, page, fetchedAt: new Date().toISOString() };
    if (cache) {
      await cache.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 * 60 * 24 * 30 });
    }
    return c.json({ ...payload, _cached: false });
  } catch (err) {
    return c.json({ error: String(err) }, 502);
  }
});

// --- Commentary translation ----------------------------------------------
// On-demand English translation of a single commentary comment (used when
// Sefaria has no `text` for it, which is common for Rishonim). Kimi K2.5 is
// the primary translator (no thinking, fast); Gemma-4 26B is the fallback.
// Results are cached forever per Sefaria sourceRef.

interface CommentaryTranslateBody {
  sourceRef: string;
  textHe: string;
  tractate?: string;
  page?: string;
  anchorSegIdx?: number;
}

const COMMENTARY_TX_SYSTEM =
  'You are a scholarly translator of rabbinic commentary on the Talmud. Translate the given Hebrew/Aramaic commentary text into clear, accurate English. ' +
  'Output ONLY the translation — no preamble, no explanation, no quotation marks around the whole thing. ' +
  'Match the register of standard academic Talmud editions (Soncino / Koren-Steinsaltz). Preserve technical terminology where standard ("Mishnah", "Gemara", "Tanna"). ' +
  'The commentary glosses a specific passage of the daf — use the provided source segment to anchor pronouns and references, but translate the commentary (not the source).';

app.post('/api/commentary-translate', async (c) => {
  let body: CommentaryTranslateBody;
  try { body = await c.req.json<CommentaryTranslateBody>(); }
  catch { return c.json({ error: 'Invalid JSON body' }, 400); }

  const sourceRef = (body.sourceRef ?? '').trim();
  const textHe = (body.textHe ?? '').trim();
  if (!sourceRef || !textHe) return c.json({ error: 'Missing sourceRef or textHe' }, 400);

  const cache = c.env.CACHE;
  const cacheKey = `commentary-tx:v1:${sourceRef}`;
  const t0 = Date.now();
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      return c.json({ translation: cached, cached: true });
    }
  }
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

  // Pull the matching daf segment as bilingual anchor context.
  let segHe = '';
  let segEn = '';
  if (body.tractate && body.page && typeof body.anchorSegIdx === 'number') {
    const segments = await getSefariaSegmentsCached(cache, body.tractate, body.page);
    if (segments && body.anchorSegIdx >= 0 && body.anchorSegIdx < segments.he.length) {
      segHe = segments.he[body.anchorSegIdx] ?? '';
      segEn = segments.en[body.anchorSegIdx] ?? '';
    }
  }

  // Strip HTML from the commentary text (Sefaria sometimes embeds <b>/<i>).
  const cleanHe = textHe.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const userParts: string[] = [];
  if (segHe) {
    userParts.push(
      `Daf segment this commentary anchors to:\nHebrew/Aramaic: ${segHe}` +
      (segEn ? `\nEnglish: ${segEn}` : ''),
    );
  }
  userParts.push(`Commentary source: ${sourceRef}`);
  userParts.push(`Commentary text (translate this):\n${cleanHe}`);

  const models: Array<{ id: string; label: string; gemma?: boolean; kimi?: boolean }> = [
    { id: '@cf/moonshotai/kimi-k2.5',        label: 'kimi-k2.5',   kimi: true },
    { id: '@cf/google/gemma-4-26b-a4b-it',   label: 'gemma-4-26b', gemma: true },
  ];

  const attempts: string[] = [];
  for (const m of models) {
    try {
      const params: Record<string, unknown> = {
        messages: [
          { role: 'system', content: COMMENTARY_TX_SYSTEM },
          { role: 'user', content: userParts.join('\n\n') },
        ],
        max_tokens: 800,
        temperature: 0.2,
      };
      if (m.gemma) params.chat_template_kwargs = { enable_thinking: false };
      if (m.kimi) params.chat_template_kwargs = { enable_thinking: false };
      const resp = await c.env.AI.run(m.id as never, params as never);
      const r = resp as { response?: string; output?: string; result?: { response?: string }; choices?: Array<{ message?: { content?: string } }> };
      const translation = (
        r.response ?? r.output ?? r.result?.response ?? r.choices?.[0]?.message?.content ?? ''
      ).trim().replace(/^["\']|["\']$/g, '');
      if (!translation) { attempts.push(`${m.label}: empty`); continue; }
      if (cache) {
        await cache.put(cacheKey, translation, { expirationTtl: 60 * 60 * 24 * 365 });
      }
      recordTelemetry(c, { endpoint: 'translate', tractate: body.tractate, page: body.page, cache_hit: false, model: m.label, ms: Date.now() - t0, ok: true });
      return c.json({ translation, cached: false, _model: m.label });
    } catch (err) {
      attempts.push(`${m.label}: ${String(err).slice(0, 200)}`);
    }
  }
  recordTelemetry(c, { endpoint: 'translate', tractate: body.tractate, page: body.page, cache_hit: false, ms: Date.now() - t0, ok: false, error_kind: classifyError(attempts.join(' ')) });
  return c.json({ error: 'All translation models failed', attempts }, 502);
});

/**
 * Reverse references — every source in the Sefaria corpus that links to a
 * given daf. Thin wrapper over Sefaria's /api/links/<ref> with KV caching
 * and a filtered/slimmed projection. Intended for future UI that shows
 * "who cites this daf" (e.g. Rishonim, Shulchan Aruch).
 */
/**
 * Given a comma-separated list of rabbi names (or a POST body array),
 * look each up in the precomputed Sefaria-derived rabbi-places dataset
 * and return the places + region + bio snippet for each matched rabbi.
 *
 * Accepts either:
 *   GET  /api/rabbi-places?names=Rabbi%20Akiva,Rav%20Huna
 *   POST /api/rabbi-places   { "names": ["Rabbi Akiva", "Rav Huna"] }
 */
interface RabbiResolution { slug: string; entry: RabbiPlacesEntry }

// Precomputed: normalized canonicalHe → slug. Used to resolve from the
// Hebrew form in the daf text, which is more reliable than the model's
// English rendering (Gemma occasionally emits "Rabbah" for Hebrew רבא = Rava).
// Normalize a Hebrew name for resolver indexing/lookup: strip nikkud +
// cantillation, drop parenthetical disambiguators (`רב (שם אמורא)` →
// `רב`), strip punctuation, collapse whitespace.
function normalizeHeForResolve(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/\([^)]*\)/g, ' ')     // remove parenthetical groups entirely
    .replace(/\[[^\]]*\]/g, ' ')    // same for square-bracket groups
    .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const BY_CANONICAL_HE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [slug, r] of Object.entries(RABBI_PLACES.rabbis)) {
    if (!r.canonicalHe) continue;
    const key = normalizeHeForResolve(r.canonicalHe);
    if (key && !out[key]) out[key] = slug;
  }
  return out;
})();

export function resolveRabbiByHe(rawHe: string): RabbiResolution | null {
  if (!rawHe) return null;
  const key = normalizeHeForResolve(rawHe);
  if (!key) return null;
  const slug = BY_CANONICAL_HE[key];
  if (slug) {
    const entry = RABBI_PLACES.rabbis[slug];
    if (entry) return { slug, entry };
  }
  return null;
}

export function resolveRabbiByName(raw: string): RabbiResolution | null {
  const key = raw.toLowerCase().trim();
  if (!key) return null;
  const direct = RABBI_PLACES.aliasIndex[key];
  if (direct) {
    const entry = RABBI_PLACES.rabbis[direct];
    if (entry) return { slug: direct, entry };
  }
  // Patronymic fallback ("Rabbi Eliezer b. Yose" → "Rabbi Eliezer"). Risky
  // for names like "Rabbah b. Rav Huna" that reduce to bare "Rabbah" (which
  // the aliasIndex points at a DIFFERENT rabbi). Gate on: the stripped form
  // must not start with a bare single-word title whose aliasIndex target
  // canonical differs meaningfully from the input. In practice we accept the
  // fallback ONLY when the stripped key has > 1 token after the title (e.g.
  // "Rabbi Eliezer" — two tokens — is OK; bare "Rabbah" is not).
  const stripped = key
    .replace(/\s+\b(b\.|ben|bar)\s+.+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped !== key) {
    const tokens = stripped.split(' ');
    const isBareTitle = tokens.length < 2;
    if (!isBareTitle) {
      const s = RABBI_PLACES.aliasIndex[stripped];
      if (s) {
        const entry = RABBI_PLACES.rabbis[s];
        if (entry) return { slug: s, entry };
      }
    }
  }
  return null;
}

/**
 * Resolve a rabbi mention to a dataset entry. Hebrew form (if provided) is
 * authoritative — it comes verbatim from the daf text. English is consulted
 * only when Hebrew gives no match.
 */
export function resolveRabbi(name: string, nameHe?: string | null): RabbiResolution | null {
  if (nameHe) {
    const he = resolveRabbiByHe(nameHe);
    if (he) return he;
  }
  return resolveRabbiByName(name);
}

// Back-compat shim: many call sites take just the canonical English name.
function resolveRabbiName(raw: string): RabbiPlacesEntry | null {
  return resolveRabbiByName(raw)?.entry ?? null;
}

// Bio-sidebar nav: given a Sefaria topic slug (as linked from the bio text),
// return the same IdentifiedRabbi shape the dafContext uses, so the sidebar
// can swap to the target rabbi's bio without a second enrichment hop. 404 if
// the slug isn't in our rabbi dataset (biblical figures, holidays, etc.).
app.get('/api/rabbi/:slug', (c) => {
  const slug = c.req.param('slug');
  const entry = RABBI_PLACES.rabbis[slug];
  if (!entry) return c.json({ error: `unknown slug: ${slug}` }, 404);
  const rawGen = entry.generation ?? 'unknown';
  const generation: GenerationId =
    (GENERATION_IDS as string[]).includes(rawGen) ? (rawGen as GenerationId) : 'unknown';
  const rabbi: IdentifiedRabbi = {
    slug,
    name: entry.canonical,
    nameHe: entry.canonicalHe ?? '',
    generation,
    region: entry.region ?? deriveRegionFromGeneration(generation),
    places: entry.places ?? [],
    moved: entry.moved ?? null,
    bio: entry.bio ?? null,
    image: entry.image ?? null,
    wiki: entry.wiki ?? null,
  };
  return c.json({ rabbi });
});

app.get('/api/references/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  const cacheKey = `refs:v1:${tractate}:${page}`;

  if (cache && c.req.query('refresh') !== '1') {
    const hit = await cache.get(cacheKey);
    if (hit !== null) return c.json({ ...(JSON.parse(hit) as object), _cached: true });
  }

  const ref = `${tractate} ${page}`;
  const url = `https://www.sefaria.org/api/links/${encodeURIComponent(ref)}?with_text=0`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return c.json({ error: `Sefaria ${res.status}` }, 502);
    const raw = (await res.json()) as Array<{
      ref?: string;
      sourceRef?: string;
      anchorRef?: string;
      category?: string;
      collectiveTitle?: { en?: string; he?: string };
      index_title?: string;
      type?: string;
    }>;

    // Group by source work (index_title), track how many refs each has.
    const byWork = new Map<
      string,
      { title: string; category: string; refs: string[] }
    >();
    for (const l of raw) {
      const title = l.collectiveTitle?.en ?? l.index_title ?? 'Unknown';
      const category = l.category ?? 'Other';
      const srcRef = l.sourceRef ?? l.ref ?? '';
      if (!byWork.has(title)) byWork.set(title, { title, category, refs: [] });
      const bucket = byWork.get(title)!;
      if (srcRef && !bucket.refs.includes(srcRef)) bucket.refs.push(srcRef);
    }

    const works = Array.from(byWork.values())
      .map((w) => ({ ...w, count: w.refs.length }))
      .sort((a, b) => b.count - a.count);

    const payload = {
      daf: ref,
      totalLinks: raw.length,
      works,
      fetchedAt: new Date().toISOString(),
    };

    if (cache) {
      await cache.put(cacheKey, JSON.stringify(payload), {
        expirationTtl: 60 * 60 * 24 * 30,
      });
    }
    return c.json(payload);
  } catch (err) {
    return c.json({ error: String(err) }, 502);
  }
});

app.get('/api/daf/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const source = c.req.query('source');
  const cache = c.env.CACHE;

  if (source !== 'sefaria') {
    const [hb, segments] = await Promise.all([
      getHebrewBooksDafCached(cache, tractate, page),
      getSefariaSegmentsCached(cache, tractate, page),
    ]);
    if (hb) {
      const data: TalmudPageData = {
        mainText: { hebrew: hb.main, english: '' },
        rashi: hb.rashi ? { hebrew: hb.rashi, english: '' } : undefined,
        tosafot: hb.tosafot ? { hebrew: hb.tosafot, english: '' } : undefined,
      };
      return c.json({
        ...data,
        _source: 'hebrewbooks',
        mainSegmentsHe: segments?.he ?? [],
        mainSegmentsEn: segments?.en ?? [],
      });
    }
    if (source === 'hebrewbooks') {
      return c.json({ error: 'HebrewBooks fetch failed' }, 502);
    }
  }

  const [data, segments] = await Promise.all([
    getSefariaPageCached(cache, tractate, page),
    getSefariaSegmentsCached(cache, tractate, page),
  ]);
  if (!data) return c.json({ error: 'Sefaria fetch failed' }, 502);
  return c.json({
    ...data,
    _source: 'sefaria',
    mainSegmentsHe: segments?.he ?? [],
    mainSegmentsEn: segments?.en ?? [],
  });
});

/**
 * Fetch and KV-cache the Sefaria English translation for a daf. Used as
 * context for word-level translations.
 */
async function getSefariaEnglishContext(
  tractate: string,
  page: string,
  cache: KVNamespace | undefined,
): Promise<string> {
  const cacheKey = `sefaria-en:${tractate}:${page}`;
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached !== null) return cached;
  }
  const data = await getSefariaPageCached(cache, tractate, page);
  if (!data) return '';
  const text = [
    data.mainText.english,
    data.rashi?.english ?? '',
    data.tosafot?.english ?? '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 4000);
  if (cache) {
    await cache.put(cacheKey, text, { expirationTtl: 60 * 60 * 24 * 30 });
  }
  return text;
}

interface TranslateBody {
  word: string;
  tractate: string;
  page: string;
  /** ~30 words of Hebrew/Aramaic immediately before the click, from the rendered daf. */
  hebrewBefore?: string;
  /** ~30 words of Hebrew/Aramaic immediately after the click, from the rendered daf. */
  hebrewAfter?: string;
  /** Client-resolved Sefaria segment index (from `data-seg` on the clicked
   *  .daf-word span). When supplied, the server skips its own fuzzy alignment
   *  and fetches the aligned Hebrew+English pair directly. */
  segIdx?: number;
}

/**
 * Sefaria v3 parallel Hebrew + English segments for a daf. Each array index
 * is one logical block (usually one Mishnah or Gemara clause). Used to pull
 * the specific English segment that aligns with the user's click context,
 * rather than dumping the full daf's English as blanket context.
 */
interface SefariaSegments {
  he: string[];
  en: string[];
}

async function getSefariaSegmentsCached(
  cache: KVNamespace | undefined,
  tractate: string,
  page: string,
): Promise<SefariaSegments | null> {
  const cacheKey = `sefaria-seg:v1:${tractate}:${page}`;
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      try { return JSON.parse(cached) as SefariaSegments; } catch { /* fall through */ }
    }
  }
  try {
    const ref = `${tractate}.${page}`;
    const url = `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew&version=english`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const j = (await res.json()) as { versions?: Array<{ actualLanguage?: string; language?: string; text?: unknown }> };
    const vs = j.versions ?? [];
    const pick = (lang: string): string[] => {
      const v = vs.find((x) => (x.actualLanguage ?? x.language) === lang);
      if (!v || !Array.isArray(v.text)) return [];
      return (v.text as unknown[]).map((t) => (typeof t === 'string' ? t : String(t ?? '')));
    };
    const out: SefariaSegments = { he: pick('he'), en: pick('en') };
    // Align lengths (Sefaria sometimes has mismatched segment counts).
    const n = Math.min(out.he.length, out.en.length);
    out.he = out.he.slice(0, n);
    out.en = out.en.slice(0, n);
    if (cache && n > 0) {
      await cache.put(cacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 30 });
    }
    return n > 0 ? out : null;
  } catch {
    return null;
  }
}

// Aggressive Hebrew normalizer for substring alignment — strips nikkud,
// cantillation, geresh/gershayim, all punctuation, and collapses whitespace.
function normalizeHeForMatch(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')                 // strip HTML tags
    .replace(/[֑-ׇ]/g, '')          // nikkud + cantillation
    .replace(/[^֐-׿\s]/g, ' ')      // keep only Hebrew letters + whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Given the user's Hebrew snippet (the word plus its immediate surroundings),
 * return the index of the Sefaria segment whose Hebrew contains it, or -1.
 * Matches progressively shorter prefixes of the snippet until something hits.
 */
function findAlignedSegment(snippet: string, segments: SefariaSegments): number {
  const needle = normalizeHeForMatch(snippet);
  if (!needle || segments.he.length === 0) return -1;
  const normSegs = segments.he.map(normalizeHeForMatch);
  // Try increasingly loose matches: first the full snippet, then trimmed
  // halves, down to a 3-word minimum. Whichever hits first wins.
  const words = needle.split(' ').filter(Boolean);
  for (let take = words.length; take >= 3; take--) {
    for (let start = 0; start + take <= words.length; start++) {
      const probe = words.slice(start, start + take).join(' ');
      for (let i = 0; i < normSegs.length; i++) {
        if (normSegs[i].includes(probe)) return i;
      }
    }
  }
  return -1;
}

// djb2 short hash for cache key suffix — stable, tiny, fine for context hashing.
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Fetch Sefaria's Lexicon entries for a Hebrew/Aramaic word (BDB, Jastrow,
 * Klein, etc.). Returns a single plain-text summary suitable to inline into
 * an LLM prompt. Cached per-word for a year.
 */
async function getSefariaLexicon(word: string, cache: KVNamespace | undefined): Promise<string> {
  const w = word.trim();
  if (!w) return '';
  const key = `lexicon:${w}`;
  if (cache) {
    const hit = await cache.get(key);
    if (hit !== null) return hit;
  }
  try {
    const url = `https://www.sefaria.org/api/words/${encodeURIComponent(w)}?lookup_ref=&never_split=1&always_split=0`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      if (cache) await cache.put(key, '', { expirationTtl: 60 * 60 * 24 * 7 });
      return '';
    }
    const entries = (await res.json()) as Array<{
      headword?: string;
      parent_lexicon?: string;
      content?: { senses?: Array<{ definition?: string }>; morphology?: string };
      morphology?: string;
    }>;
    const summaries: string[] = [];
    for (const e of entries.slice(0, 4)) {
      const dict = e.parent_lexicon ?? 'lexicon';
      const head = e.headword ?? w;
      const senses = (e.content?.senses ?? []).map((s) => s.definition ?? '').filter(Boolean);
      const clean = senses.map((s) => stripHtmlServer(s)).filter(Boolean).slice(0, 2).join(' | ');
      if (clean) summaries.push(`[${dict}] ${head}: ${clean}`);
    }
    const out = summaries.join('\n').slice(0, 900);
    if (cache) await cache.put(key, out, { expirationTtl: 60 * 60 * 24 * 365 });
    return out;
  } catch {
    return '';
  }
}

// Talmudic-idiom guidance shared by the word and phrase system prompts.
// Calls out the common cases where the plain Hebrew meaning mis-translates the
// Talmudic usage (e.g. רישא = "first clause", not "head").
const TRANSLATE_IDIOM_GUIDANCE =
  'CRITICAL: translate for Talmudic usage, not literal Hebrew. Many words have a specialized legal/discursive sense:\n' +
  '  - רישא → "first clause" (of the Mishnah/statement), not "head"\n' +
  '  - סיפא → "last clause"\n' +
  '  - קמא → "the first (authority/view)"; בתרא → "the later (authority/view)"\n' +
  '  - בשלמא → "granted" (rhetorical concession)\n' +
  '  - מיגו → "since-they-could-have" (legal argumentation principle)\n' +
  '  - תיובתא → "refutation"\n' +
  '  - קל וחומר → "a fortiori" (not "light and heavy")\n' +
  '  - גזירה שווה → "analogical derivation"\n' +
  '  - גברא / חפצא → "person" / "object" in technical legal sense\n' +
  '  - דתנן / דתניא / דתני → "as the Mishnah/Baraita teaches"\n' +
  'When the literal Hebrew and the Talmudic usage differ, pick the Talmudic usage unless the surrounding passage clearly demands the literal meaning. Use the aligned Hebrew+English segment from Sefaria as your primary anchor for the local argument.';

app.post('/api/translate', async (c) => {
  let body: TranslateBody;
  try {
    body = await c.req.json<TranslateBody>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const word = (body.word ?? '').trim();
  const tractate = (body.tractate ?? '').trim();
  const page = (body.page ?? '').trim();
  const hebrewBefore = (body.hebrewBefore ?? '').trim();
  const hebrewAfter = (body.hebrewAfter ?? '').trim();
  if (!word || !tractate || !page) {
    return c.json({ error: 'Missing word/tractate/page' }, 400);
  }

  const cache = c.env.CACHE;
  // Context-aware cache key: identical word in two different passages now gets
  // two different cached answers (previously they collided).
  const ctxHash = (hebrewBefore || hebrewAfter)
    ? `:${shortHash(hebrewBefore + '' + hebrewAfter)}`
    : '';
  const cacheKey = `translate:v2:${tractate}:${page}:${word}${ctxHash}`;
  const t0 = Date.now();
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      recordTelemetry(c, { endpoint: 'translate', tractate, page, cache_hit: true, ms: Date.now() - t0, ok: true });
      return c.json({ translation: cached, cached: true });
    }
  }

  if (!c.env.AI) {
    return c.json({ error: 'AI binding not available' }, 503);
  }

  // Resolve the Sefaria-aligned segment. Prefer the `segIdx` the client
  // resolved from `data-seg` on the clicked .daf-word — that uses the same
  // alignment pass the /align page shows, with abbreviation expansion etc.
  // Fall back to server-side substring matching on (hebrewBefore+word+hebrewAfter)
  // if the client didn't provide an index.
  const segments = await getSefariaSegmentsCached(cache, tractate, page);
  let alignedSegIdx = -1;
  if (segments) {
    if (typeof body.segIdx === 'number' && body.segIdx >= 0 && body.segIdx < segments.he.length) {
      alignedSegIdx = body.segIdx;
    } else if (hebrewBefore || hebrewAfter) {
      alignedSegIdx = findAlignedSegment(`${hebrewBefore} ${word} ${hebrewAfter}`, segments);
    }
  }
  const alignedHe = alignedSegIdx >= 0 ? segments!.he[alignedSegIdx] : '';
  const alignedEn = alignedSegIdx >= 0 ? segments!.en[alignedSegIdx] : '';

  // Fallback English blob ONLY when the client didn't send surrounding context
  // (preserves back-compat with any old client that hasn't redeployed yet).
  let fallbackEnglish = '';
  if (!hebrewBefore && !hebrewAfter && alignedSegIdx < 0) {
    try {
      fallbackEnglish = await getSefariaEnglishContext(tractate, page, cache);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[translate] fallback Sefaria context fetch failed:', err);
    }
  }

  // Sefaria Lexicon — authoritative BDB/Jastrow definitions for the word.
  // Cached per-word for a year (lexicons change rarely).
  const lexiconContext = await getSefariaLexicon(word, cache).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[translate] lexicon fetch failed:', err);
    return '';
  });

  const wordCount = word.split(/\s+/).filter(Boolean).length;
  const isPhrase = wordCount > 1;
  const system = (isPhrase
    ? 'You translate short Hebrew/Aramaic phrases from the Talmud into English. Return ONLY the English translation — one concise sentence at most, faithful to the context. No quotation marks, no explanation, no prefix, no reasoning.\n\n'
    : 'You translate single Hebrew or Aramaic words from the Talmud into English. Return ONLY the English translation — a single word or short phrase, no quotation marks, no explanation, no punctuation. If the word is a proper name (a Rabbi or place), return the conventional English rendering.\n\n'
  ) + TRANSLATE_IDIOM_GUIDANCE;

  // Gemma-4 no-thinking primary; Kimi K2.6 thinking as upgrade fallback when
  // Gemma returns empty or errors. No Llama anywhere in this repo.
  const translateModels: Array<{ id: string; label: string; gemma?: boolean; kimi?: boolean }> = [
    { id: '@cf/google/gemma-4-26b-a4b-it', label: 'gemma-4-26b',       gemma: true },
    { id: '@cf/moonshotai/kimi-k2.6',      label: 'kimi-k2.6-thinking', kimi: true },
  ];

  const attempts: string[] = [];
  for (const m of translateModels) {
    try {
      const userParts: string[] = [];

      // 1. Sefaria-aligned segment (primary context — Hebrew + English side by side).
      if (alignedHe && alignedEn) {
        userParts.push(
          `Aligned Sefaria segment (the block of the daf this ${isPhrase ? 'phrase' : 'word'} sits in):\nHebrew/Aramaic: ${alignedHe}\nEnglish:        ${alignedEn}`,
        );
      } else if (fallbackEnglish) {
        userParts.push(`Passage context (English translation of the surrounding daf):\n${fallbackEnglish}`);
      }

      // 2. Surrounding rendered-daf text — ±N words around the user's selection.
      //    Anchors the request to a specific position on the page.
      if (hebrewBefore || hebrewAfter) {
        userParts.push(
          `On-page surrounding text (from the rendered daf, immediately around the selection):\n…${hebrewBefore} «${word}» ${hebrewAfter}…`,
        );
      }

      // 3. Lexicon (authoritative dictionary entries).
      if (lexiconContext) {
        userParts.push(`Lexicon definitions (from Sefaria's BDB/Jastrow/Klein):\n${lexiconContext}`);
      }

      // 4. The target.
      userParts.push(`${isPhrase ? 'Phrase' : 'Word'} to translate: ${word}`);

      const params: Record<string, unknown> = {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userParts.join('\n\n') },
        ],
        max_tokens: m.kimi ? 400 : isPhrase ? 120 : 30,
        temperature: 0.1,
      };
      if (m.gemma) params.chat_template_kwargs = { enable_thinking: false };
      if (m.kimi) params.chat_template_kwargs = { enable_thinking: true };
      const resp = await c.env.AI.run(m.id as never, params as never);

      const r = resp as { response?: string; output?: string; result?: { response?: string }; choices?: Array<{ message?: { content?: string } }> };
      const translation = (
        r.response ??
        r.output ??
        r.result?.response ??
        r.choices?.[0]?.message?.content ??
        ''
      ).trim().replace(/^["']|["']$/g, '');
      if (!translation) {
        attempts.push(`${m.label}: empty response`);
        continue;
      }

      if (cache) {
        await cache.put(cacheKey, translation, { expirationTtl: 60 * 60 * 24 * 30 });
      }
      recordTelemetry(c, { endpoint: 'translate', tractate, page, cache_hit: false, model: m.label, ms: Date.now() - t0, ok: true });
      return c.json({ translation, cached: false, _model: m.label });
    } catch (err) {
      attempts.push(`${m.label}: ${String(err).slice(0, 200)}`);
      // eslint-disable-next-line no-console
      console.warn(`[translate] ${m.label} failed:`, err);
    }
  }

  recordTelemetry(c, { endpoint: 'translate', tractate, page, cache_hit: false, ms: Date.now() - t0, ok: false, error_kind: classifyError(attempts.join(' ')) });
  return c.json({ error: 'All translation models failed', attempts }, 502);
});

/**
 * Structured Talmudic analysis of a daf — a two-stage Kimi K2.6 pipeline:
 *
 *   Stage A (SKELETON_SYSTEM_PROMPT): focal Hebrew + English only. Produces
 *     the argument skeleton — sections with titles, summaries, Hebrew
 *     excerpts, and the list of rabbi/voice names per section. Narrow
 *     scope keeps Kimi's reasoning bounded even at model-max tokens.
 *
 *   Stage B (ENRICHMENT_SYSTEM_PROMPT): Stage A output + neighbor amudim +
 *     Rashi/Tosafot + Rishonim + halachic codifications. Fills in the
 *     per-rabbi nameHe / period / location / role / opinionStart. Since
 *     the structure is already determined, Kimi's reasoning collapses to
 *     field-filling rather than rediscovering the argument.
 *
 * Both stages stream to bypass the Workers AI Gateway's ~3-4 min non-stream
 * timeout, and both use the model's maximum output budget.
 */

interface DafSkeleton {
  summary: string;
  sections: Array<{
    title: string;
    summary: string;
    excerpt: string;
    rabbiNames: string[];
  }>;
}

const SKELETON_SYSTEM_PROMPT = `You are a scholar of Talmud. Given a single focal amud's Hebrew/Aramaic text and its English translation, identify the argument structure. Output STRICT JSON only (no markdown, no prose):

{
  "summary": "1-2 sentence overview of what this daf argues",
  "sections": [
    {
      "title": "Short descriptive title (e.g. 'Opening Mishnah', 'Gemara's first question')",
      "summary": "2-3 sentence description of what this section argues",
      "excerpt": "3-5 Hebrew/Aramaic words copied verbatim from the focal Hebrew — opens this section",
      "rabbiNames": ["list of every voice in this section, in order"]
    }
  ]
}

Break the focal amud into 3-8 sections by argument structure, not by paragraph.

GRANULARITY: rabbiNames must enumerate EVERY distinct voice, not just named rabbi statements. Include:
- Named rabbis: "Rabbi Eliezer", "Rav Huna", etc.
- Collective voices: "Sages", "Tanna Kamma"
- Every Stam/Gemara move: "Gemara's question", "First answer", "Second answer", "Alternative answer", "Objection", "Rejoinder", "Prooftext"
- When the Gemara offers multiple answers to the same question, each answer is its own entry.

"excerpt" MUST be Hebrew/Aramaic copied exactly from the source — never translate.`;

const ENRICHMENT_SYSTEM_PROMPT = `You are a scholar of Talmud. You will receive:
1. A skeleton analysis of a focal amud (sections + rabbi names, already identified).
2. Enriching context: focal Rashi + focal Tosafot, neighboring amudim (Hebrew), Rishonim commentary (Rashba, Ritva, Ramban, Meiri, Rosh, Maharsha, Chidushei Aggadot), and halachic codifications (Rambam MT, Shulchan Aruch, Tur) — all clearly wrapped in XML tags.

For each rabbi/voice in the skeleton, fill in:
- nameHe: Hebrew name or label as it would appear in the daf
- period: Era + approximate dates (e.g. 'Tanna, c. 90-120 CE', 'Amora, 3rd century CE', 'Stam Gemara, redacted c. 500 CE')
- location: City and region (e.g. 'Lod, Judea', 'Sura, Babylonia', 'Bavel')
- role: What this voice argues or does in THIS section (one sentence)
- opinionStart: First 2-4 Hebrew/Aramaic words of this voice's statement, copied verbatim from the focal amud's Hebrew

**Use the Rishonim commentary and Rashi/Tosafot to sharpen nameHe, role, and to disambiguate ambiguous abbreviations (ר"מ / ר"י / ר"א / ר"ש — see the neighboring words like דברי / אומר / וחכמים).** Use halachic codifications to understand which position was accepted.

You may MINORLY revise the skeleton (add a missed voice in a section, adjust a section summary) but do NOT restructure sections or change excerpts. Keep the skeleton's title and excerpt as-is; keep its overall section count the same unless a Rishon reveals a missed dispute.

opinionStart MUST come from the focal amud's Hebrew, NOT from Rishonim / Rashi / Tosafot / neighbors.

Output STRICT JSON (no markdown, no prose wrapping) conforming to:

{
  "summary": "1-2 sentence overview of what this daf is about",
  "sections": [
    {
      "title": "Short descriptive title like 'Opening Mishnah' or 'Gemara's first question'",
      "summary": "2-3 sentence description of what this section argues",
      "excerpt": "First 3-5 HEBREW/ARAMAIC words of this section — copy verbatim from the Hebrew source, never translate.",
      "rabbis": [
        {
          "name": "Rabbi's name in conventional English",
          "nameHe": "Hebrew name as written",
          "period": "Era + approximate dates, e.g. 'Tanna, c. 90-120 CE' or 'Amora, 3rd century CE'",
          "location": "City and region, e.g. 'Lod, Judea' or 'Sura, Babylonia'",
          "role": "What this Rabbi argues in THIS section",
          "opinionStart": "First 2-4 HEBREW/ARAMAIC words of THIS rabbi's specific statement in the daf, copied verbatim. Used to anchor the rabbi's opinion range in the text."
        }
      ]
    }
  ]
}

Rules:
- Output valid JSON only — no markdown code fences, no commentary.
- Break the daf into 3-8 sections by argument structure, not by paragraph.
- "excerpt" and "opinionStart" MUST be Hebrew/Aramaic copied exactly from the Hebrew source — never translate, never paraphrase.

GRANULARITY (critical — previous outputs have been too coarse):
- Within each section, enumerate EVERY distinct stance/move, not just named rabbi statements. Target 3-8 entries per section on anything but the briefest sections.
- Each of the following counts as its own entry in the rabbis array and deserves its own opinionStart:
  * Every named rabbi statement (Rav Huna says..., אמר רב הונא...).
  * Every collective/anonymous stance (Sages = חכמים, Tanna Kamma = תנא קמא, the Baraita, a cited Mishnah).
  * Every move by the Stam/Gemara itself: the Gemara's QUESTION ("the Gemara asks"), each distinct ANSWER or resolution it proposes (first answer / second answer / final answer), each OBJECTION it raises, each PROOFTEXT it cites.
  * When the Gemara offers two or more answers to the same question, EACH answer is its own entry — do NOT collapse them into one.
- For unnamed Gemara voices, use labels like:
  * name: "Gemara's question", nameHe: "שאלת הגמרא" (or the Hebrew interrogative phrase that opens the question, e.g. "מאי טעמא", "היכא קאי")
  * name: "First answer" / "Second answer" / "Alternative answer", nameHe: the Hebrew introducer (e.g. "איבעית אימא", "אלא", "כדכתיב")
  * name: "Objection" / "Rejoinder", nameHe: "ולא והא" / "מיתיבי" / etc.
  For collective named voices, use the conventional label: "Sages", "Tanna Kamma", etc.
- period/location/role fields for anonymous voices: period="Stam Gemara, redacted c. 500 CE", location="Bavel" or "Bavel/Eretz Yisrael" as appropriate, role=what this move does in the argument (one sentence).
- opinionStart examples:
  * "ר' אליעזר אומר..." → "ר' אליעזר אומר"
  * "וחכמים אומרים..." → "וחכמים אומרים"
  * "אמר רבא..." → "אמר רבא"
  * The Gemara's opening question "תנא היכא קאי..." → "תנא היכא קאי" (that IS the question's opener)
  * First answer beginning "יליף מברייתו של עולם" → "יליף מברייתו של עולם"
  * Alternative answer beginning "ואיבעית אימא" → "ואיבעית אימא"
- Every rabbi/voice you list MUST have an opinionStart unless the text does not distinctly anchor their position.`;

/** Biblical reference found in a section's Hebrew text. */
interface BiblicalRef {
  ref: string;          // English Sefaria-style, e.g. "Proverbs 2:2"
  hebrewRef?: string;   // Hebrew citation, e.g. "משלי ב:ב"
  hebrewQuote?: string; // The actual Hebrew quote as it appears in the daf
}

/** Difficulty rating (educational complexity). */
interface DifficultyRating {
  score: 1 | 2 | 3 | 4 | 5;
  reason: string;
}

interface DafAnalysis {
  summary: string;
  /** Overall daf difficulty (1-5). Populated by the `difficulty` strategy. */
  difficulty?: DifficultyRating;
  sections: Array<{
    title: string;
    summary: string;
    excerpt?: string;
    /** Biblical verses/references quoted in this section. Populated by the `references` strategy. */
    references?: BiblicalRef[];
    /** Parallel sugyot in other tractates. Populated by the `parallels` strategy. */
    parallels?: string[];
    /** Per-section difficulty (1-5). Populated by the `difficulty` strategy. */
    difficulty?: DifficultyRating;
    rabbis: Array<{
      name: string;
      nameHe: string;
      period: string;
      location: string;
      role: string;
      opinionStart?: string;
      /** Last 2-4 Hebrew words of this voice's statement in the focal amud. Enables full-span highlighting. */
      opinionEnd?: string;
      /** Other names / variants for this rabbi (from rabbi-places.json). */
      aliases?: string[];
      /** Generation ID (e.g. 'tanna-4'). From rabbi-places.json. */
      generation?: string;
      /** Names of other rabbis in THIS section whose position this rabbi agrees with. */
      agreesWith?: string[];
      /** Names of other rabbis in THIS section whose position this rabbi disagrees with. */
      disagreesWith?: string[];
    }>;
  }>;
}

/** Per-block character caps for the analyze prompt.
 *  Not bounded by Kimi K2.6's 262k ctx but by the Workers AI Gateway's ~3-4
 *  min response timeout — larger prompts make K2.6 think longer and the
 *  gateway kills the call (AiError 3046) if reasoning + JSON generation
 *  stretches past ~3 min wall clock. These caps target ~40-60k input tokens
 *  so we reliably finish under the timeout while still giving the model
 *  focal Rashi/Tosafot, neighbor Hebrew context, and core Rishonim. */
const ANALYZE_CAPS = {
  focalHebrew: 12000,
  focalEnglish: 10000,
  focalRashi: 8000,
  focalTosafot: 8000,
  neighborHebrew: 6000,     // trimmed from 8000 — only need reference anchors
  neighborEnglish: 0,       // dropped — Hebrew is enough for cross-amud refs
  neighborRashi: 0,         // dropped — focal's Rashi covers cross-amud
  neighborTosafot: 0,       // dropped
  rishonimPerCommentator: 2500,  // halved from 4000 per commentator
  halachaPerRef: 1500,      // trimmed from 2000
  halachaRefsPerBook: 2,    // trimmed from 3 — keep only most-relevant refs
} as const;

function slice(s: string | undefined | null, cap: number): string {
  if (!s) return '';
  const cleaned = stripHtmlServer(s);
  return cleaned.length > cap ? cleaned.slice(0, cap) : cleaned;
}

function amudBlock(
  label: 'previous_amud' | 'focal_amud' | 'next_amud',
  daf: string,
  hebrew: string,
  english: string,
  rashi: string,
  tosafot: string,
  caps: { heCap: number; enCap: number; rashiCap: number; tosafotCap: number }
): string {
  const sections: string[] = [];
  sections.push(`<hebrew>${slice(hebrew, caps.heCap) || '(not available)'}</hebrew>`);
  sections.push(`<english>${slice(english, caps.enCap) || '(not available)'}</english>`);
  const rashiSliced = slice(rashi, caps.rashiCap);
  if (rashiSliced) sections.push(`<rashi>${rashiSliced}</rashi>`);
  const tosafotSliced = slice(tosafot, caps.tosafotCap);
  if (tosafotSliced) sections.push(`<tosafot>${tosafotSliced}</tosafot>`);
  return `<${label} daf="${daf}">\n${sections.join('\n')}\n</${label}>`;
}

function rishonimBlock(bundle: RishonimBundle): string {
  const entries = Object.entries(bundle);
  if (entries.length === 0) return '';
  const parts = entries.map(([label, snip]) => {
    const he = slice(snip.hebrew, ANALYZE_CAPS.rishonimPerCommentator);
    const en = slice(snip.english, ANALYZE_CAPS.rishonimPerCommentator);
    const body = [
      he && `<hebrew>${he}</hebrew>`,
      en && `<english>${en}</english>`,
    ].filter(Boolean).join('\n');
    return `<commentator name="${label}" ref="${snip.ref}">\n${body}\n</commentator>`;
  });
  return `<rishonim_commentary>\n${parts.join('\n')}\n</rishonim_commentary>`;
}

function halachaBlock(bundle: HalachicRefBundle): string {
  const books = Object.entries(bundle);
  if (books.length === 0) return '';
  const parts = books.map(([book, snips]) => {
    const refBlocks = snips.slice(0, ANALYZE_CAPS.halachaRefsPerBook).map(s => {
      const he = slice(s.hebrew, ANALYZE_CAPS.halachaPerRef);
      const en = slice(s.english, ANALYZE_CAPS.halachaPerRef);
      const body = [
        he && `<hebrew>${he}</hebrew>`,
        en && `<english>${en}</english>`,
      ].filter(Boolean).join('\n');
      return `<ref id="${s.ref}">\n${body}\n</ref>`;
    });
    return `<codification book="${book}">\n${refBlocks.join('\n')}\n</codification>`;
  });
  return `<halachic_codification>\n${parts.join('\n')}\n</halachic_codification>`;
}

/** Normalize Hebrew text for verbatim-presence comparison: strip niqqud
 *  (vowel points), cantillation, punctuation, and collapse whitespace. */
function normalizeHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')       // niqqud + cantillation
    .replace(/[׳״"'.,:;!?\-–—()[\]{}]/g, '') // punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

const HEBREW_CHAR_RE = /[֐-׿]/;

interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function validateAnalysis(analysis: DafAnalysis, focalHebrewRaw: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const focalNorm = normalizeHebrew(focalHebrewRaw);

  if (!analysis.summary || typeof analysis.summary !== 'string' || analysis.summary.length < 20) {
    errors.push('summary missing or too short');
  }
  if (!Array.isArray(analysis.sections)) {
    errors.push('sections is not an array');
    return { ok: false, errors, warnings };
  }
  if (analysis.sections.length < 2 || analysis.sections.length > 15) {
    errors.push(`section count out of range (${analysis.sections.length}, expected 2-15)`);
  }

  analysis.sections.forEach((sec, i) => {
    const loc = `section[${i}]`;
    if (!sec.title) errors.push(`${loc}: missing title`);
    if (!sec.summary) errors.push(`${loc}: missing summary`);
    if (!Array.isArray(sec.rabbis) || sec.rabbis.length === 0) {
      errors.push(`${loc}: missing or empty rabbis array`);
      return;
    }
    if (sec.excerpt) {
      if (!HEBREW_CHAR_RE.test(sec.excerpt)) {
        errors.push(`${loc}: excerpt has no Hebrew chars`);
      } else if (!focalNorm.includes(normalizeHebrew(sec.excerpt))) {
        // Downgraded to warning: Stage A's skeleton excerpt override covers
        // most cases, but when Stage B adds sections beyond the skeleton
        // (or section alignment shifts) the excerpt may be Stage B's own
        // paraphrase. UI can fall back to title-only anchoring when excerpt
        // doesn't resolve — not worth hard-failing the whole daf.
        warnings.push(`${loc}: excerpt "${sec.excerpt.slice(0, 30)}" not found in focal amud`);
      }
    }
    const seenNames = new Set<string>();
    sec.rabbis.forEach((r, j) => {
      const rloc = `${loc}.rabbis[${j}]`;
      if (!r.name) errors.push(`${rloc}: missing name`);
      if (!r.nameHe) errors.push(`${rloc}: missing nameHe`);
      else if (!HEBREW_CHAR_RE.test(r.nameHe)) errors.push(`${rloc}: nameHe has no Hebrew chars`);
      if (!r.period) errors.push(`${rloc}: missing period`);
      if (!r.location) errors.push(`${rloc}: missing location`);
      if (!r.role || r.role.length < 10) warnings.push(`${rloc}: role too short`);
      if (r.opinionStart) {
        if (!HEBREW_CHAR_RE.test(r.opinionStart)) {
          errors.push(`${rloc}: opinionStart has no Hebrew chars`);
        } else if (!focalNorm.includes(normalizeHebrew(r.opinionStart))) {
          // Downgraded to warning: Kimi K2.5 sometimes paraphrases opinion
          // openers (e.g. "ר\"ש" instead of expanded "רבי שמעון"). The UI
          // falls back to section-level anchoring when opinionStart doesn't
          // resolve, so this is graceful degradation — not a hard failure.
          warnings.push(`${rloc}: opinionStart "${r.opinionStart.slice(0, 30)}" not found in focal amud`);
        }
      }
      const key = `${r.name}|${r.nameHe}`;
      if (seenNames.has(key)) warnings.push(`${rloc}: duplicate rabbi "${r.name}" in section`);
      seenNames.add(key);
    });
  });

  return { ok: errors.length === 0, errors, warnings };
}

function extractJsonPayload(resp: unknown): string {
  const r = resp as {
    response?: unknown;
    output?: unknown;
    result?: { response?: unknown };
    choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }>;
  };
  // gpt-oss (harmony format) returns final answer in `content`, chain-of-
  // thought in `reasoning_content`. When it hits its token budget mid-thought,
  // `content` is null — fall back to the last JSON-looking block inside the
  // reasoning so we still get a usable payload.
  const msg = r.choices?.[0]?.message;
  const primary =
    r.response ??
    r.output ??
    r.result?.response ??
    msg?.content ??
    '';
  let candidate: unknown = primary;
  if ((primary === null || primary === undefined || primary === '') && msg?.reasoning_content) {
    const rc = String(msg.reasoning_content);
    const m = rc.match(/\{[\s\S]*"rabbis"[\s\S]*\}/);
    if (m) candidate = m[0];
  }
  // With response_format: { type: "json_object" } some CF AI models return
  // an already-parsed object here instead of a string — re-stringify in
  // that case so downstream JSON.parse can handle it uniformly.
  let raw: string;
  if (typeof candidate === 'string') {
    raw = candidate;
  } else if (candidate && typeof candidate === 'object') {
    try { raw = JSON.stringify(candidate); } catch { raw = ''; }
  } else {
    raw = '';
  }
  raw = raw.trim();
  // Kimi sometimes wraps JSON in ```json ... ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return raw;
}

/**
 * Run Kimi K2.6 (or any OpenAI-compatible Workers AI chat model) via SSE
 * streaming. The Workers AI Gateway enforces an aggressive ~3-4 min hard
 * timeout on non-streaming responses, which Kimi's thinking mode routinely
 * breaches for complex multi-amud prompts (AiError 3046). Streaming keeps
 * the connection alive per-chunk, so total wall-clock can extend to the
 * Worker's normal subrequest budget.
 *
 * Accumulates `delta.content` and `delta.reasoning_content` separately so
 * the caller can fall back to reasoning-embedded JSON if the model ran out
 * of token budget mid-thought and content came back empty.
 */
interface StreamedResult {
  content: string;
  reasoning_content: string;
  finish_reason: string | null;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
  prompt_chars: number;
  elapsed_ms: number;
}

async function runKimiStreaming(
  ai: Ai,
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  opts: {
    chatTemplateKwargs?: Record<string, unknown>;
    reasoningEffort?: 'low' | 'medium' | 'high';
  } = {},
): Promise<StreamedResult> {
  const promptChars = messages.reduce((s, m) => s + m.content.length, 0);
  const t0 = Date.now();
  const body: Record<string, unknown> = {
    messages,
    max_tokens: maxTokens,
    stream_options: { include_usage: true },
    temperature: 0.2,
    response_format: { type: 'json_object' },
    stream: true,
  };
  if (opts.chatTemplateKwargs) body.chat_template_kwargs = opts.chatTemplateKwargs;
  if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;
  const stream = (await ai.run(modelId as never, body as never)) as unknown as ReadableStream<Uint8Array>;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';
  let finish: string | null = null;
  let usage: StreamedResult['usage'] = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string; reasoning_content?: string };
                finish_reason?: string | null;
              }>;
              response?: string;
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            };
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) content += delta.content;
            if (delta?.reasoning_content) reasoning += delta.reasoning_content;
            const f = parsed.choices?.[0]?.finish_reason;
            if (f) finish = f;
            if (parsed.usage) usage = parsed.usage;
            // Some CF AI models emit `response` at top level instead of
            // choices[].delta — accumulate that too for robustness.
            if (typeof parsed.response === 'string') content += parsed.response;
          } catch {
            // Not valid JSON — skip (keepalive / comments)
          }
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }

  return {
    content,
    reasoning_content: reasoning,
    finish_reason: finish,
    usage,
    prompt_chars: promptChars,
    elapsed_ms: Date.now() - t0,
  };
}

app.get('/api/analyze/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  // v5: Kimi K2.6 with thinking, fed prev+focal+next amudim plus Rishonim
  // and halachic codifications. Hard-fail if Kimi fails (no fallback chain).
  const cacheKey = `analyze:v5:${tractate}:${page}`;
  const t0 = Date.now();

  const bypass = c.req.query('refresh') === '1';
  const cachedOnly = c.req.query('cached_only') === '1';
  // skeleton_only=1: run Stage A, cache the skeleton, return it and skip
  // Stage B entirely. Used by the full-Shas first-pass batch script — lets
  // us generate skeletons across all tractates cheaply before iterating on
  // enrichment strategies.
  const skeletonOnly = c.req.query('skeleton_only') === '1';
  if (cache && !bypass && !skeletonOnly) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: true, ms: Date.now() - t0, ok: true });
      return c.json({ ...JSON.parse(cached) as DafAnalysis, _cached: true });
    }
  }

  if (cachedOnly) {
    return c.json({ cached: false }, 404);
  }

  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

  const prevDaf = adjacentAmud(tractate, page, -1);
  const nextDaf = adjacentAmud(tractate, page, 1);

  const [hbFocal, sefFocal, hbPrev, sefPrev, hbNext, sefNext, rishonim, halacha] =
    await Promise.all([
      getHebrewBooksDafCached(cache, tractate, page),
      getSefariaPageCached(cache, tractate, page),
      prevDaf ? getHebrewBooksDafCached(cache, tractate, prevDaf) : Promise.resolve(null),
      prevDaf ? getSefariaPageCached(cache, tractate, prevDaf) : Promise.resolve(null),
      nextDaf ? getHebrewBooksDafCached(cache, tractate, nextDaf) : Promise.resolve(null),
      nextDaf ? getSefariaPageCached(cache, tractate, nextDaf) : Promise.resolve(null),
      getRishonimCached(cache, tractate, page),
      getHalachaRefsCached(cache, tractate, page),
    ]);

  const focalHebrewRaw = hbFocal?.main ?? sefFocal?.mainText.hebrew ?? '';
  const focalEnglishRaw = sefFocal?.mainText.english ?? '';
  if (!focalHebrewRaw && !focalEnglishRaw) {
    return c.json({ error: 'No source text available for analysis' }, 502);
  }
  const focalHebrewNormalized = slice(focalHebrewRaw, ANALYZE_CAPS.focalHebrew);

  const rishonimXml = rishonimBlock(rishonim);
  const halachaXml = halachaBlock(halacha);

  // Doubled from 65k so Kimi K2.6 has headroom for both reasoning AND JSON.
  // Earlier empirical observation: K2.6 with thinking burns whatever budget
  // it's given. If we still hit empty content at 131k, thinking is truly
  // unbounded on rich prompts and we need a different model for Stage B.
  const model = { id: '@cf/moonshotai/kimi-k2.6', maxTokens: 131072, label: 'kimi-k2.6-thinking' };
  const skeletonCacheKey = `analyze-skel:v1:${tractate}:${page}`;

  // Diagnostics returned in the response envelope so we can see exactly
  // where Kimi's tokens are going without tail-following logs.
  interface StageDiag {
    prompt_chars: number;
    content_chars: number;
    reasoning_chars: number;
    elapsed_ms: number;
    finish_reason: string | null;
    usage: StreamedResult['usage'];
  }
  let stageADiag: StageDiag | 'cached' | null = null;
  let stageBDiag: StageDiag | null = null;

  // ---------- STAGE A: SKELETON (focal only) ----------
  // Cached separately so a later enrichment retry can skip the skeleton call.
  let skeleton: DafSkeleton | null = null;
  if (cache && !bypass) {
    const hit = await cache.get(skeletonCacheKey);
    if (hit) {
      try { skeleton = JSON.parse(hit) as DafSkeleton; stageADiag = 'cached'; } catch { skeleton = null; }
    }
  }

  if (!skeleton) {
    const focalOnlyBlock = amudBlock(
      'focal_amud', page,
      focalHebrewRaw, focalEnglishRaw,
      '', '',
      { heCap: ANALYZE_CAPS.focalHebrew, enCap: ANALYZE_CAPS.focalEnglish, rashiCap: 0, tosafotCap: 0 },
    );
    const skeletonUser = [
      `Tractate: ${tractate}`,
      `Focal page: ${page}`,
      '',
      focalOnlyBlock,
      '',
      'Identify the argument structure. Return ONLY the skeleton JSON.',
    ].join('\n\n');

    try {
      // Stage A: K2.6 thinking with reasoning_effort:"low" — the skeleton
      // task (structure + rabbi names) doesn't need deep reasoning, and
      // without the knob K2.6 will sometimes reason 45k+ tokens (200s+).
      // Low effort holds Stage A at ~90-140s reliably, keeping the full
      // two-stage pipeline under the Worker's 5-min wall clock.
      const stageA = await runKimiStreaming(
        c.env.AI, model.id,
        [
          { role: 'system', content: SKELETON_SYSTEM_PROMPT },
          { role: 'user', content: skeletonUser },
        ],
        model.maxTokens,
        { reasoningEffort: 'low' },
      );
      stageADiag = {
        prompt_chars: stageA.prompt_chars,
        content_chars: stageA.content.length,
        reasoning_chars: stageA.reasoning_content.length,
        elapsed_ms: stageA.elapsed_ms,
        finish_reason: stageA.finish_reason,
        usage: stageA.usage,
      };
      // eslint-disable-next-line no-console
      console.log(`[analyze:stage-a] ${tractate}/${page}`, JSON.stringify(stageADiag));
      let skelPayload = stageA.content.trim();
      if (!skelPayload && stageA.reasoning_content) {
        const m = stageA.reasoning_content.match(/\{[\s\S]*"rabbiNames"[\s\S]*\}/);
        if (m) skelPayload = m[0];
      }
      const fenced = skelPayload.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) skelPayload = fenced[1].trim();
      if (!skelPayload) {
        recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: false, model: model.label, ms: Date.now() - t0, ok: false, error_kind: 'stage-a-empty' });
        return c.json({ error: 'Stage A (skeleton) returned empty payload', stage: 'skeleton', model: model.label, _stageA: stageADiag }, 502);
      }
      try {
        skeleton = JSON.parse(skelPayload) as DafSkeleton;
      } catch (parseErr) {
        recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: false, model: model.label, ms: Date.now() - t0, ok: false, error_kind: 'stage-a-non-json' });
        return c.json({ error: 'Stage A (skeleton) returned non-JSON', stage: 'skeleton', detail: String(parseErr).slice(0, 200), _stageA: stageADiag }, 502);
      }
      if (!skeleton.summary || !Array.isArray(skeleton.sections) || skeleton.sections.length < 1) {
        recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: false, model: model.label, ms: Date.now() - t0, ok: false, error_kind: 'stage-a-shape' });
        return c.json({ error: 'Stage A skeleton missing required fields', stage: 'skeleton', _stageA: stageADiag }, 502);
      }
      if (cache) {
        await cache.put(skeletonCacheKey, JSON.stringify(skeleton), { expirationTtl: 60 * 60 * 24 * 30 });
      }
    } catch (err) {
      const msg = String(err);
      // eslint-disable-next-line no-console
      console.warn(`[analyze:skeleton] ${model.label} failed:`, msg);
      recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: false, model: model.label, ms: Date.now() - t0, ok: false, error_kind: 'stage-a-' + classifyError(msg) });
      return c.json({ error: 'Stage A (skeleton) call failed', stage: 'skeleton', detail: msg.slice(0, 500), _stageA: stageADiag }, 502);
    }
  }

  // Early-return for skeleton-only mode (used by the full-Shas first-pass
  // script). Stage A is always cheap and reliable; Stage B is the expensive,
  // flaky step we want to iterate on separately.
  if (skeletonOnly) {
    recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: stageADiag === 'cached', model: model.label, ms: Date.now() - t0, ok: true });
    return c.json({
      ...skeleton,
      _stageAModel: model.label,
      _cached: stageADiag === 'cached',
      _stageA: stageADiag,
      _skeletonOnly: true,
    });
  }

  // ---------- STAGE B: ENRICHMENT (skeleton + full context) ----------
  const enrichmentBlocks: string[] = [];
  enrichmentBlocks.push(`<skeleton>\n${JSON.stringify(skeleton, null, 2)}\n</skeleton>`);
  enrichmentBlocks.push(amudBlock(
    'focal_amud', page,
    focalHebrewRaw, focalEnglishRaw,
    sefFocal?.rashi?.hebrew ?? '',
    sefFocal?.tosafot?.hebrew ?? '',
    { heCap: ANALYZE_CAPS.focalHebrew, enCap: ANALYZE_CAPS.focalEnglish,
      rashiCap: ANALYZE_CAPS.focalRashi, tosafotCap: ANALYZE_CAPS.focalTosafot },
  ));
  if (prevDaf && (hbPrev || sefPrev)) {
    enrichmentBlocks.push(amudBlock(
      'previous_amud', prevDaf,
      hbPrev?.main ?? sefPrev?.mainText.hebrew ?? '',
      sefPrev?.mainText.english ?? '',
      '', '',
      { heCap: ANALYZE_CAPS.neighborHebrew, enCap: ANALYZE_CAPS.neighborEnglish, rashiCap: 0, tosafotCap: 0 },
    ));
  }
  if (nextDaf && (hbNext || sefNext)) {
    enrichmentBlocks.push(amudBlock(
      'next_amud', nextDaf,
      hbNext?.main ?? sefNext?.mainText.hebrew ?? '',
      sefNext?.mainText.english ?? '',
      '', '',
      { heCap: ANALYZE_CAPS.neighborHebrew, enCap: ANALYZE_CAPS.neighborEnglish, rashiCap: 0, tosafotCap: 0 },
    ));
  }
  if (rishonimXml) enrichmentBlocks.push(rishonimXml);
  if (halachaXml) enrichmentBlocks.push(halachaXml);

  const enrichmentUser = [
    `Tractate: ${tractate}`,
    `Focal page: ${page}`,
    '',
    ...enrichmentBlocks,
    '',
    'Fill in the details for each rabbi/voice in the skeleton. Return the full enriched JSON.',
  ].join('\n\n');

  try {
    // Stage B: Kimi K2.5 with thinking OFF.
    // K2.6 reliably exceeds the Cloudflare Worker 5-min wall-clock on
    // enrichment prompts even with reasoning_effort:"low" + trimmed prompt
    // (confirmed 2026-04-23: Stage B hit exactly 300s with content
    // truncated by the wall clock). K2.5 with enable_thinking:false is a
    // deterministic field-filler benchmarked at <60s. Structural reasoning
    // already happened in Stage A — Stage B is just filling nameHe/period/
    // location/role/opinionStart, reasoning not required.
    const stageBModel = {
      id: '@cf/moonshotai/kimi-k2.5',
      maxTokens: 16000,
      label: 'kimi-k2.5-no-thinking',
    };
    const stageB = await runKimiStreaming(
      c.env.AI, stageBModel.id,
      [
        { role: 'system', content: ENRICHMENT_SYSTEM_PROMPT },
        { role: 'user', content: enrichmentUser },
      ],
      stageBModel.maxTokens,
      { chatTemplateKwargs: { enable_thinking: false } },
    );
    stageBDiag = {
      prompt_chars: stageB.prompt_chars,
      content_chars: stageB.content.length,
      reasoning_chars: stageB.reasoning_content.length,
      elapsed_ms: stageB.elapsed_ms,
      finish_reason: stageB.finish_reason,
      usage: stageB.usage,
    };
    // eslint-disable-next-line no-console
    console.log(`[analyze:stage-b] ${tractate}/${page}`, JSON.stringify(stageBDiag));
    let payload = stageB.content.trim();
    if (!payload && stageB.reasoning_content) {
      const m = stageB.reasoning_content.match(/\{[\s\S]*"rabbis"[\s\S]*\}/);
      if (m) payload = m[0];
    }
    const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) payload = fenced[1].trim();

    if (!payload) {
      recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: false, model: model.label, ms: Date.now() - t0, ok: false, error_kind: 'stage-b-empty' });
      return c.json({
        error: 'Stage B (enrichment) returned empty payload',
        stage: 'enrichment', model: model.label,
        _stageA: stageADiag, _stageB: stageBDiag,
      }, 502);
    }

    let analysis: DafAnalysis;
    try {
      analysis = JSON.parse(payload) as DafAnalysis;
    } catch (parseErr) {
      recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: false, model: model.label, ms: Date.now() - t0, ok: false, error_kind: 'stage-b-non-json' });
      return c.json({
        error: 'Stage B (enrichment) returned non-JSON',
        stage: 'enrichment',
        detail: String(parseErr).slice(0, 200),
        _stageA: stageADiag, _stageB: stageBDiag,
      }, 502);
    }

    // Force Stage B's excerpts to match the skeleton's. Stage A (Kimi K2.6
    // thinking) produces verbatim-verified Hebrew excerpts; Stage B (Kimi
    // K2.5 no-thinking) has been observed to paraphrase them, which breaks
    // the UI's text-anchor lookup. Overwrite to guarantee fidelity.
    if (skeleton && Array.isArray(skeleton.sections) && Array.isArray(analysis.sections)) {
      for (let i = 0; i < analysis.sections.length && i < skeleton.sections.length; i++) {
        const skelExcerpt = skeleton.sections[i]?.excerpt;
        if (skelExcerpt) analysis.sections[i].excerpt = skelExcerpt;
      }
    }

    const validation = validateAnalysis(analysis, focalHebrewNormalized);
    if (!validation.ok) {
      recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: false, model: model.label, ms: Date.now() - t0, ok: false, error_kind: 'stage-b-schema' });
      return c.json({
        error: 'Enrichment output failed validation',
        stage: 'enrichment',
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        _stageA: stageADiag, _stageB: stageBDiag,
      }, 502);
    }

    const envelope = {
      ...analysis,
      _stageAModel: model.label,
      _stageBModel: stageBModel.label,
      _cached: false,
      _prevDaf: prevDaf,
      _nextDaf: nextDaf,
      _rishonim: Object.keys(rishonim),
      _halacha: Object.keys(halacha),
      _validationWarnings: validation.warnings,
      _pipeline: 'skeleton(k2.6)+enrichment(k2.5-no-thinking)',
      _stageA: stageADiag,
      _stageB: stageBDiag,
    };

    if (cache) {
      const { _cached: _ignored, ...toCache } = envelope;
      await cache.put(cacheKey, JSON.stringify(toCache), {
        expirationTtl: 60 * 60 * 24 * 365,
      });
    }

    recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: false, model: model.label, ms: Date.now() - t0, ok: true });
    return c.json(envelope);
  } catch (err) {
    const msg = String(err);
    // eslint-disable-next-line no-console
    console.warn(`[analyze:enrichment] ${model.label} failed:`, msg);
    recordTelemetry(c, { endpoint: 'analyze', tractate, page, cache_hit: false, model: model.label, ms: Date.now() - t0, ok: false, error_kind: 'stage-b-' + classifyError(msg) });
    return c.json({ error: 'Stage B (enrichment) call failed', stage: 'enrichment', detail: msg.slice(0, 500), _stageA: stageADiag, _stageB: stageBDiag }, 502);
  }
});

// ============================================================================
// ENRICHMENT STRATEGIES — experimental /api/enrich endpoint
// ============================================================================
// Pluggable Stage-B variants for the `#enrichment` comparison UI. Each
// strategy takes the cached skeleton + cached sources and produces a full
// DafAnalysis — they differ in how they shape the LLM calls (monolithic vs
// per-section vs rule-LLM-hybrid). Results are NOT written to the
// analyze:v5:* cache; they're transient and rendered side-by-side so we can
// pick a winner before committing to one for the full Shas enrichment pass.

interface EnrichmentSources {
  hbFocal: HebrewBooksDaf | null;
  sefFocal: TalmudPageData | null;
  hbPrev: HebrewBooksDaf | null;
  sefPrev: TalmudPageData | null;
  hbNext: HebrewBooksDaf | null;
  sefNext: TalmudPageData | null;
  rishonim: RishonimBundle;
  halacha: HalachicRefBundle;
  prevDaf: string | null;
  nextDaf: string | null;
}

interface StrategyCallDiag {
  prompt_chars: number;
  content_chars: number;
  reasoning_chars: number;
  elapsed_ms: number;
  finish_reason: string | null;
  usage: StreamedResult['usage'];
}

interface EnrichmentResult {
  analysis: DafAnalysis;
  warnings: string[];
  elapsed_ms: number;
  calls: StrategyCallDiag[];
  strategy_metadata: Record<string, unknown>;
}

/**
 * Look up a rabbi by name against rabbi-places.json (alias-indexed).
 * Returns any deterministic fields we can fill without an LLM:
 * nameHe (from canonicalHe), period (from generation + era), location
 * (from places[0] + region). Returns null if no match.
 */
interface RabbiLookupHit {
  nameHe?: string;
  period?: string;
  location?: string;
  aliases?: string[];
  generation?: string;
}
function lookupRabbi(name: string): RabbiLookupHit | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  const rabbiId = (RABBI_PLACES.aliasIndex as Record<string, string>)[key];
  if (!rabbiId) return null;
  const r = RABBI_PLACES.rabbis[rabbiId];
  if (!r) return null;

  const out: RabbiLookupHit = {};
  if (r.canonicalHe) out.nameHe = r.canonicalHe;

  const genInfo = r.generation ? GENERATION_BY_ID[r.generation as GenerationId] : null;
  if (genInfo) {
    out.period = genInfo.era ? `${genInfo.label}, ${genInfo.era}` : genInfo.label;
  }
  if (r.generation) out.generation = r.generation;

  const firstPlace = Array.isArray(r.places) && r.places.length > 0 ? r.places[0] : null;
  const regionName = r.region === 'israel' ? 'Eretz Yisrael' : r.region === 'bavel' ? 'Bavel' : null;
  if (firstPlace && regionName) out.location = `${firstPlace}, ${regionName}`;
  else if (firstPlace) out.location = firstPlace;
  else if (regionName) out.location = regionName;

  // Strip the canonical name itself from aliases — keep only variants.
  if (Array.isArray(r.aliases) && r.aliases.length > 0) {
    const canonical = (r.canonical || '').trim().toLowerCase();
    const variants = r.aliases.filter(a => a && a.trim().toLowerCase() !== canonical);
    if (variants.length > 0) out.aliases = variants.slice(0, 8);
  }

  return Object.keys(out).length > 0 ? out : null;
}

// --- baseline strategy -------------------------------------------------------
// Monolithic K2.5 no-thinking call with full context. Verbatim match to the
// current /api/analyze Stage B logic so we have a reference point for diffs.

async function runBaselineEnrichment(
  ai: Ai, tractate: string, page: string,
  skeleton: DafSkeleton, sources: EnrichmentSources,
): Promise<EnrichmentResult> {
  const t0 = Date.now();
  const focalHebrewRaw = sources.hbFocal?.main ?? sources.sefFocal?.mainText.hebrew ?? '';
  const focalEnglishRaw = sources.sefFocal?.mainText.english ?? '';

  const blocks: string[] = [];
  blocks.push(`<skeleton>\n${JSON.stringify(skeleton, null, 2)}\n</skeleton>`);
  blocks.push(amudBlock(
    'focal_amud', page,
    focalHebrewRaw, focalEnglishRaw,
    sources.sefFocal?.rashi?.hebrew ?? '',
    sources.sefFocal?.tosafot?.hebrew ?? '',
    { heCap: ANALYZE_CAPS.focalHebrew, enCap: ANALYZE_CAPS.focalEnglish,
      rashiCap: ANALYZE_CAPS.focalRashi, tosafotCap: ANALYZE_CAPS.focalTosafot },
  ));
  if (sources.prevDaf && (sources.hbPrev || sources.sefPrev)) {
    blocks.push(amudBlock(
      'previous_amud', sources.prevDaf,
      sources.hbPrev?.main ?? sources.sefPrev?.mainText.hebrew ?? '',
      sources.sefPrev?.mainText.english ?? '',
      '', '',
      { heCap: ANALYZE_CAPS.neighborHebrew, enCap: ANALYZE_CAPS.neighborEnglish, rashiCap: 0, tosafotCap: 0 },
    ));
  }
  if (sources.nextDaf && (sources.hbNext || sources.sefNext)) {
    blocks.push(amudBlock(
      'next_amud', sources.nextDaf,
      sources.hbNext?.main ?? sources.sefNext?.mainText.hebrew ?? '',
      sources.sefNext?.mainText.english ?? '',
      '', '',
      { heCap: ANALYZE_CAPS.neighborHebrew, enCap: ANALYZE_CAPS.neighborEnglish, rashiCap: 0, tosafotCap: 0 },
    ));
  }
  const rXml = rishonimBlock(sources.rishonim);
  if (rXml) blocks.push(rXml);
  const hXml = halachaBlock(sources.halacha);
  if (hXml) blocks.push(hXml);

  const userContent = [
    `Tractate: ${tractate}`,
    `Focal page: ${page}`,
    '',
    ...blocks,
    '',
    'Fill in the details for each rabbi/voice in the skeleton. Return the full enriched JSON.',
  ].join('\n\n');

  const streamed = await runKimiStreaming(
    ai, '@cf/moonshotai/kimi-k2.5',
    [
      { role: 'system', content: ENRICHMENT_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    16000,
    { chatTemplateKwargs: { enable_thinking: false } },
  );

  const analysis = parseEnrichedAnalysis(streamed, skeleton);
  const focalNorm = normalizeHebrew(slice(focalHebrewRaw, ANALYZE_CAPS.focalHebrew));
  const validation = validateAnalysis(analysis, focalNorm);

  return {
    analysis,
    warnings: [...validation.warnings, ...validation.errors.map(e => `(was error) ${e}`)],
    elapsed_ms: Date.now() - t0,
    calls: [callDiag(streamed)],
    strategy_metadata: { model: 'kimi-k2.5-no-thinking', shape: 'monolithic' },
  };
}

// --- per-section strategy ---------------------------------------------------
// One K2.5 call per section (concurrent, capped at 3). Each call gets only
// that section's skeleton subset + focal Hebrew/Rashi/Tosafot. Smaller prompt
// per call => smaller reasoning surface, faster, fewer validation issues.

const PER_SECTION_SYSTEM_PROMPT = `You are a scholar of Talmud. You will receive a SINGLE argument section's skeleton (title, summary, excerpt, list of rabbi names) plus the focal amud's Hebrew/Aramaic text, Rashi, and Tosafot.

For each rabbi/voice in this section, fill in:
- nameHe: Hebrew name or label as it appears in the text
- period: Era + dates (e.g. 'Tanna, c. 90-120 CE', 'Stam Gemara, redacted c. 500 CE')
- location: City + region (e.g. 'Lod, Eretz Yisrael', 'Sura, Bavel')
- role: What this voice argues in this section (one sentence)
- opinionStart: First 2-4 Hebrew/Aramaic words of this voice's statement in the focal amud, copied verbatim

Use Rashi/Tosafot to disambiguate abbreviations (ר"מ, ר"י etc.) — never guess blindly.

opinionStart MUST be copied verbatim from the focal amud's Hebrew.

Output STRICT JSON only (no markdown):
{"rabbis": [{"name": string, "nameHe": string, "period": string, "location": string, "role": string, "opinionStart": string}]}`;

async function runPerSectionEnrichment(
  ai: Ai, tractate: string, page: string,
  skeleton: DafSkeleton, sources: EnrichmentSources,
): Promise<EnrichmentResult> {
  const t0 = Date.now();
  const focalHebrewRaw = sources.hbFocal?.main ?? sources.sefFocal?.mainText.hebrew ?? '';
  const focalEnglishRaw = sources.sefFocal?.mainText.english ?? '';
  const focalBlock = amudBlock(
    'focal_amud', page,
    focalHebrewRaw, focalEnglishRaw,
    sources.sefFocal?.rashi?.hebrew ?? '',
    sources.sefFocal?.tosafot?.hebrew ?? '',
    { heCap: ANALYZE_CAPS.focalHebrew, enCap: ANALYZE_CAPS.focalEnglish,
      rashiCap: ANALYZE_CAPS.focalRashi, tosafotCap: ANALYZE_CAPS.focalTosafot },
  );

  const allCalls: StrategyCallDiag[] = [];

  async function enrichSection(sec: DafSkeleton['sections'][number]): Promise<DafAnalysis['sections'][number]> {
    const skelSubset = { title: sec.title, summary: sec.summary, excerpt: sec.excerpt, rabbiNames: sec.rabbiNames };
    const user = [
      `Tractate: ${tractate}`,
      `Focal page: ${page}`,
      '',
      `<section_skeleton>\n${JSON.stringify(skelSubset, null, 2)}\n</section_skeleton>`,
      '',
      focalBlock,
      '',
      'Fill in details for each rabbi listed. Return JSON per schema.',
    ].join('\n\n');

    const s = await runKimiStreaming(
      ai, '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: PER_SECTION_SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      8000,
      { chatTemplateKwargs: { enable_thinking: false } },
    );
    allCalls.push(callDiag(s));

    // Parse {rabbis: [...]} output
    let payload = s.content.trim();
    const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) payload = fenced[1].trim();
    let rabbis: DafAnalysis['sections'][number]['rabbis'] = [];
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed?.rabbis)) rabbis = parsed.rabbis;
    } catch { /* leave empty on parse fail */ }

    return { title: sec.title, summary: sec.summary, excerpt: sec.excerpt, rabbis };
  }

  // Concurrency 3: fire in windows
  const enrichedSections: DafAnalysis['sections'] = [];
  const LIMIT = 3;
  for (let i = 0; i < skeleton.sections.length; i += LIMIT) {
    const window = skeleton.sections.slice(i, i + LIMIT);
    const results = await Promise.all(window.map(enrichSection));
    enrichedSections.push(...results);
  }

  const analysis: DafAnalysis = { summary: skeleton.summary, sections: enrichedSections };
  const focalNorm = normalizeHebrew(slice(focalHebrewRaw, ANALYZE_CAPS.focalHebrew));
  const validation = validateAnalysis(analysis, focalNorm);

  return {
    analysis,
    warnings: [...validation.warnings, ...validation.errors.map(e => `(was error) ${e}`)],
    elapsed_ms: Date.now() - t0,
    calls: allCalls,
    strategy_metadata: { model: 'kimi-k2.5-no-thinking', shape: 'per-section', sections: skeleton.sections.length, concurrency: LIMIT },
  };
}

// --- hybrid strategy --------------------------------------------------------
// For each rabbi, try rabbi-places.json lookup (period, location, nameHe
// deterministic). Then one K2.5 call to fill just role + opinionStart for
// every rabbi — the only fields that are genuinely focal-specific.

const HYBRID_SYSTEM_PROMPT = `You are a scholar of Talmud. You will receive a skeleton with rabbis already partially enriched from a reference database (nameHe/period/location pre-filled when known). Your job is to fill in ONLY two fields per rabbi:
- role: what this rabbi/voice argues or does in this specific section (one clear sentence)
- opinionStart: the first 2-4 Hebrew/Aramaic words of this rabbi's statement, copied verbatim from the focal amud's Hebrew

Do NOT change nameHe/period/location values that are already filled. Leave them verbatim.
For rabbis with missing nameHe/period/location, do your best to fill those too using Rashi/Tosafot context.

opinionStart MUST be copied verbatim from the focal amud's Hebrew. Use Rashi/Tosafot for disambiguation (ר"מ vs ר"י etc.).

Output STRICT JSON matching the full DafAnalysis schema (summary + sections + rabbis with all fields).`;

async function runHybridEnrichment(
  ai: Ai, tractate: string, page: string,
  skeleton: DafSkeleton, sources: EnrichmentSources,
): Promise<EnrichmentResult> {
  const t0 = Date.now();
  const focalHebrewRaw = sources.hbFocal?.main ?? sources.sefFocal?.mainText.hebrew ?? '';
  const focalEnglishRaw = sources.sefFocal?.mainText.english ?? '';

  // Build partial enrichment by looking up each rabbi in rabbi-places.json.
  // Deterministic fields (generation, aliases) go on the output directly —
  // LLM never sees or modifies them. Period/location/nameHe are seeded for
  // the LLM prompt but it may refine them for rabbis with no lookup hit.
  let lookupHits = 0;
  const partialSections = skeleton.sections.map((sec) => ({
    title: sec.title,
    summary: sec.summary,
    excerpt: sec.excerpt,
    rabbis: sec.rabbiNames.map((name) => {
      const hit = lookupRabbi(name);
      if (hit) lookupHits++;
      return {
        name,
        nameHe: hit?.nameHe ?? '',
        period: hit?.period ?? '',
        location: hit?.location ?? '',
        role: '',
        opinionStart: '',
        ...(hit?.generation ? { generation: hit.generation } : {}),
        ...(hit?.aliases ? { aliases: hit.aliases } : {}),
      };
    }),
  }));
  const partial = { summary: skeleton.summary, sections: partialSections };

  const focalBlock = amudBlock(
    'focal_amud', page,
    focalHebrewRaw, focalEnglishRaw,
    sources.sefFocal?.rashi?.hebrew ?? '',
    sources.sefFocal?.tosafot?.hebrew ?? '',
    { heCap: ANALYZE_CAPS.focalHebrew, enCap: ANALYZE_CAPS.focalEnglish,
      rashiCap: ANALYZE_CAPS.focalRashi, tosafotCap: ANALYZE_CAPS.focalTosafot },
  );

  const user = [
    `Tractate: ${tractate}`,
    `Focal page: ${page}`,
    '',
    `<partial_analysis>\n${JSON.stringify(partial, null, 2)}\n</partial_analysis>`,
    '',
    focalBlock,
    '',
    'Fill in role + opinionStart for every rabbi. Leave pre-filled nameHe/period/location as-is.',
  ].join('\n\n');

  const s = await runKimiStreaming(
    ai, '@cf/moonshotai/kimi-k2.5',
    [
      { role: 'system', content: HYBRID_SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    12000,
    { chatTemplateKwargs: { enable_thinking: false } },
  );

  const analysis = parseEnrichedAnalysis(s, skeleton);

  // Merge deterministic lookup fields (generation, aliases) back onto each
  // rabbi — LLM may have dropped them since its prompt didn't mention them.
  // Matched by (name, nameHe) key; unmatched rabbis keep whatever the LLM
  // produced. Also re-assert period/location/nameHe from the lookup for
  // rabbis where we had a hit (in case LLM paraphrased them).
  if (Array.isArray(analysis.sections)) {
    for (const sec of analysis.sections) {
      if (!Array.isArray(sec.rabbis)) continue;
      for (const r of sec.rabbis) {
        const hit = lookupRabbi(r.name);
        if (!hit) continue;
        if (hit.nameHe) r.nameHe = hit.nameHe;
        if (hit.period) r.period = hit.period;
        if (hit.location) r.location = hit.location;
        if (hit.generation) r.generation = hit.generation;
        if (hit.aliases && hit.aliases.length > 0) r.aliases = hit.aliases;
      }
    }
  }

  const focalNorm = normalizeHebrew(slice(focalHebrewRaw, ANALYZE_CAPS.focalHebrew));
  const validation = validateAnalysis(analysis, focalNorm);

  const totalRabbis = partialSections.reduce((sum, s) => sum + s.rabbis.length, 0);

  return {
    analysis,
    warnings: [...validation.warnings, ...validation.errors.map(e => `(was error) ${e}`)],
    elapsed_ms: Date.now() - t0,
    calls: [callDiag(s)],
    strategy_metadata: {
      model: 'kimi-k2.5-no-thinking',
      shape: 'rule+llm',
      total_rabbis: totalRabbis,
      lookup_hits: lookupHits,
      lookup_rate: totalRabbis > 0 ? Math.round((lookupHits / totalRabbis) * 100) / 100 : 0,
    },
  };
}

// --- helpers shared by strategies -------------------------------------------

function callDiag(s: StreamedResult): StrategyCallDiag {
  return {
    prompt_chars: s.prompt_chars,
    content_chars: s.content.length,
    reasoning_chars: s.reasoning_content.length,
    elapsed_ms: s.elapsed_ms,
    finish_reason: s.finish_reason,
    usage: s.usage,
  };
}

function parseEnrichedAnalysis(s: StreamedResult, skeleton: DafSkeleton): DafAnalysis {
  let payload = s.content.trim();
  if (!payload && s.reasoning_content) {
    const m = s.reasoning_content.match(/\{[\s\S]*"rabbis"[\s\S]*\}/);
    if (m) payload = m[0];
  }
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) payload = fenced[1].trim();

  let analysis: DafAnalysis;
  try {
    analysis = JSON.parse(payload) as DafAnalysis;
  } catch {
    // Synthesize an empty-shell if parse fails — validator will flag it.
    analysis = { summary: skeleton.summary, sections: [] };
  }

  // Force skeleton excerpts (K2.5 sometimes paraphrases).
  if (Array.isArray(analysis.sections) && Array.isArray(skeleton.sections)) {
    for (let i = 0; i < analysis.sections.length && i < skeleton.sections.length; i++) {
      const skelExcerpt = skeleton.sections[i]?.excerpt;
      if (skelExcerpt) analysis.sections[i].excerpt = skelExcerpt;
    }
  }

  return analysis;
}

// --- rich-rabbi strategy ----------------------------------------------------
// Hybrid lookup + one LLM call that produces the *full* rabbi object:
//   role, opinionStart, opinionEnd, agreesWith, disagreesWith
// Everything else (nameHe, period, location, generation, aliases) comes from
// the rabbi-places.json lookup deterministically. Builds the cross-rabbi
// dispute graph in a single shot per daf.

const RICH_RABBI_SYSTEM_PROMPT = `You are a scholar of Talmud. You will receive a partial analysis where each rabbi's nameHe/period/location/generation/aliases are already filled from a reference database. Fill in the remaining fields for EVERY rabbi:

- role: one sentence describing what this rabbi argues or does in THIS section
- opinionStart: first 2-4 Hebrew/Aramaic words of this rabbi's statement in the focal amud, copied verbatim
- opinionEnd: last 2-4 Hebrew/Aramaic words of this rabbi's statement in the focal amud, copied verbatim (the words where their opinion ends — paired with opinionStart to enable span highlighting)
- agreesWith: array of other rabbi names in the SAME section whose position this rabbi agrees with. Use the exact "name" values as they appear in the input. Empty array if none.
- disagreesWith: array of other rabbi names in the SAME section whose position this rabbi disagrees with. Empty array if none.

Rules:
- opinionStart and opinionEnd MUST be copied verbatim from the focal amud's Hebrew text — do not translate or paraphrase.
- Use Rashi/Tosafot to disambiguate abbreviations (ר"מ / ר"י / ר"א / ר"ש).
- For anonymous voices (Gemara's question, First answer, Objection), opinionStart/opinionEnd should be the Hebrew markers that open and close that move (e.g. "מאי טעמא ... דאמר קרא").
- Preserve nameHe/period/location/generation/aliases as provided — do not modify.

Output STRICT JSON matching the full DafAnalysis schema (summary + sections + rabbis with all fields including agreesWith and disagreesWith arrays).`;

async function runRichRabbiEnrichment(
  ai: Ai, tractate: string, page: string,
  skeleton: DafSkeleton, sources: EnrichmentSources,
): Promise<EnrichmentResult> {
  const t0 = Date.now();
  const focalHebrewRaw = sources.hbFocal?.main ?? sources.sefFocal?.mainText.hebrew ?? '';
  const focalEnglishRaw = sources.sefFocal?.mainText.english ?? '';

  // Prefill everything deterministic from rabbi-places.json so the LLM only
  // has to produce role/opinionStart/opinionEnd/agreesWith/disagreesWith.
  let lookupHits = 0;
  const partial = {
    summary: skeleton.summary,
    sections: skeleton.sections.map((sec) => ({
      title: sec.title,
      summary: sec.summary,
      excerpt: sec.excerpt,
      rabbis: sec.rabbiNames.map((name) => {
        const hit = lookupRabbi(name);
        if (hit) lookupHits++;
        const r: Record<string, unknown> = {
          name,
          nameHe: hit?.nameHe ?? '',
          period: hit?.period ?? '',
          location: hit?.location ?? '',
          role: '',
          opinionStart: '',
          opinionEnd: '',
          agreesWith: [],
          disagreesWith: [],
        };
        if (hit?.generation) r.generation = hit.generation;
        if (hit?.aliases) r.aliases = hit.aliases;
        return r;
      }),
    })),
  };

  const focalBlock = amudBlock(
    'focal_amud', page,
    focalHebrewRaw, focalEnglishRaw,
    sources.sefFocal?.rashi?.hebrew ?? '',
    sources.sefFocal?.tosafot?.hebrew ?? '',
    { heCap: ANALYZE_CAPS.focalHebrew, enCap: ANALYZE_CAPS.focalEnglish,
      rashiCap: ANALYZE_CAPS.focalRashi, tosafotCap: ANALYZE_CAPS.focalTosafot },
  );

  const user = [
    `Tractate: ${tractate}`,
    `Focal page: ${page}`,
    '',
    `<partial_analysis>\n${JSON.stringify(partial, null, 2)}\n</partial_analysis>`,
    '',
    focalBlock,
    '',
    'Fill in role + opinionStart + opinionEnd + agreesWith + disagreesWith for every rabbi. Leave pre-filled fields as-is. Return the complete enriched JSON.',
  ].join('\n\n');

  const s = await runKimiStreaming(
    ai, '@cf/moonshotai/kimi-k2.5',
    [
      { role: 'system', content: RICH_RABBI_SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    16000,
    { chatTemplateKwargs: { enable_thinking: false } },
  );

  const analysis = parseEnrichedAnalysis(s, skeleton);

  // Re-assert deterministic fields in case the LLM dropped them.
  if (Array.isArray(analysis.sections)) {
    for (const sec of analysis.sections) {
      if (!Array.isArray(sec.rabbis)) continue;
      for (const r of sec.rabbis) {
        const hit = lookupRabbi(r.name);
        if (!hit) continue;
        if (hit.nameHe) r.nameHe = hit.nameHe;
        if (hit.period) r.period = hit.period;
        if (hit.location) r.location = hit.location;
        if (hit.generation) r.generation = hit.generation;
        if (hit.aliases && hit.aliases.length > 0) r.aliases = hit.aliases;
      }
    }
  }

  const focalNorm = normalizeHebrew(slice(focalHebrewRaw, ANALYZE_CAPS.focalHebrew));
  const validation = validateAnalysis(analysis, focalNorm);
  const totalRabbis = partial.sections.reduce((sum, s) => sum + s.rabbis.length, 0);

  return {
    analysis,
    warnings: [...validation.warnings, ...validation.errors.map(e => `(was error) ${e}`)],
    elapsed_ms: Date.now() - t0,
    calls: [callDiag(s)],
    strategy_metadata: {
      model: 'kimi-k2.5-no-thinking',
      shape: 'rule+llm',
      total_rabbis: totalRabbis,
      lookup_hits: lookupHits,
      lookup_rate: totalRabbis > 0 ? Math.round((lookupHits / totalRabbis) * 100) / 100 : 0,
      new_fields: ['opinionEnd', 'agreesWith', 'disagreesWith', 'generation', 'aliases'],
    },
  };
}

// --- references strategy ----------------------------------------------------
// Identifies biblical verses (Tanakh) quoted or referenced in each section of
// the focal amud. Returns a list per section with both English (Sefaria-style)
// and Hebrew citation formats plus the actual Hebrew quote as it appears in
// the daf.

const REFERENCES_SYSTEM_PROMPT = `You are a Talmud scholar identifying biblical references. You will receive a skeleton analysis with section titles/excerpts plus the focal amud's Hebrew and English text.

For each section, identify every biblical verse (Tanakh — Torah, Neviim, Ketuvim) that is QUOTED or CLEARLY REFERENCED in that section's Hebrew text. Do NOT include allusions or thematic parallels — only explicit citations.

For each reference output:
- ref: English Sefaria-style citation (e.g. "Proverbs 2:2", "Deuteronomy 6:4", "Genesis 1:1")
- hebrewRef: Hebrew citation in standard form (e.g. "משלי ב:ב", "דברים ו:ד")
- hebrewQuote: The actual Hebrew words of the verse as they appear in the daf (truncated to 8 words max if the full verse is longer). Copy verbatim.

Output STRICT JSON:
{"sections": [{"title": "...", "references": [{"ref": "...", "hebrewRef": "...", "hebrewQuote": "..."}]}]}

Use the section titles from the skeleton to key your output. Sections with no biblical citations should have an empty references array.`;

async function runReferencesEnrichment(
  ai: Ai, tractate: string, page: string,
  skeleton: DafSkeleton, sources: EnrichmentSources,
): Promise<EnrichmentResult> {
  const t0 = Date.now();
  const focalHebrewRaw = sources.hbFocal?.main ?? sources.sefFocal?.mainText.hebrew ?? '';
  const focalEnglishRaw = sources.sefFocal?.mainText.english ?? '';
  const focalBlock = amudBlock(
    'focal_amud', page,
    focalHebrewRaw, focalEnglishRaw,
    sources.sefFocal?.rashi?.hebrew ?? '',
    sources.sefFocal?.tosafot?.hebrew ?? '',
    { heCap: ANALYZE_CAPS.focalHebrew, enCap: ANALYZE_CAPS.focalEnglish,
      rashiCap: ANALYZE_CAPS.focalRashi, tosafotCap: ANALYZE_CAPS.focalTosafot },
  );

  const skelSummary = {
    summary: skeleton.summary,
    sections: skeleton.sections.map((sec) => ({ title: sec.title, excerpt: sec.excerpt })),
  };

  const user = [
    `Tractate: ${tractate}`,
    `Focal page: ${page}`,
    '',
    `<skeleton>\n${JSON.stringify(skelSummary, null, 2)}\n</skeleton>`,
    '',
    focalBlock,
    '',
    'Identify biblical references quoted in each section. Return JSON per schema.',
  ].join('\n\n');

  const s = await runKimiStreaming(
    ai, '@cf/moonshotai/kimi-k2.5',
    [
      { role: 'system', content: REFERENCES_SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    8000,
    { chatTemplateKwargs: { enable_thinking: false } },
  );

  // Parse and merge into a DafAnalysis shape keyed by section title.
  let payload = s.content.trim();
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) payload = fenced[1].trim();
  let refsByTitle: Record<string, BiblicalRef[]> = {};
  try {
    const parsed = JSON.parse(payload) as { sections?: Array<{ title: string; references?: BiblicalRef[] }> };
    if (Array.isArray(parsed.sections)) {
      for (const sec of parsed.sections) {
        if (sec.title && Array.isArray(sec.references)) {
          refsByTitle[sec.title.toLowerCase()] = sec.references;
        }
      }
    }
  } catch { /* leave empty */ }

  const analysis: DafAnalysis = {
    summary: skeleton.summary,
    sections: skeleton.sections.map((sec) => ({
      title: sec.title,
      summary: sec.summary,
      excerpt: sec.excerpt,
      rabbis: [],
      references: refsByTitle[sec.title.toLowerCase()] ?? [],
    })),
  };

  const totalRefs = Object.values(refsByTitle).reduce((sum, arr) => sum + arr.length, 0);

  return {
    analysis,
    warnings: [],
    elapsed_ms: Date.now() - t0,
    calls: [callDiag(s)],
    strategy_metadata: {
      model: 'kimi-k2.5-no-thinking',
      shape: 'section-refs',
      total_references: totalRefs,
      sections_with_refs: Object.values(refsByTitle).filter(arr => arr.length > 0).length,
    },
  };
}

// --- parallels strategy -----------------------------------------------------
// For each section, identify parallel sugyot (discussions of the same dispute
// or topic) in other masechtot. Uses Rishonim commentary as primary signal
// since they cross-reference extensively.

const PARALLELS_SYSTEM_PROMPT = `You are a Talmud scholar identifying parallel sugyot. You will receive a skeleton analysis plus the focal amud's Hebrew/English/Rashi/Tosafot AND the bundled Rishonim commentary (Rashba, Ritva, Ramban, Meiri, Rosh, etc.). Rishonim frequently cite parallel discussions ("ועיין בפרק..." / "אמרינן במסכת..." etc.).

For each section in the skeleton, identify any parallel sugyot — other places in Shas where the same dispute, topic, or legal question is discussed substantively. Do NOT include mere mentions; only include if there's a real parallel discussion.

Output parallel sugya references in standard tractate+daf format (e.g. "Shabbat 31a", "Sanhedrin 74b", "Zevachim 2a"). Use Sefaria-style tractate names.

Output STRICT JSON:
{"sections": [{"title": "...", "parallels": ["Shabbat 31a", ...]}]}

Sections with no parallels should have an empty parallels array. Prefer to cite 1-4 strong parallels per section over 10 weak ones.`;

async function runParallelsEnrichment(
  ai: Ai, tractate: string, page: string,
  skeleton: DafSkeleton, sources: EnrichmentSources,
): Promise<EnrichmentResult> {
  const t0 = Date.now();
  const focalHebrewRaw = sources.hbFocal?.main ?? sources.sefFocal?.mainText.hebrew ?? '';
  const focalEnglishRaw = sources.sefFocal?.mainText.english ?? '';
  const focalBlock = amudBlock(
    'focal_amud', page,
    focalHebrewRaw, focalEnglishRaw,
    sources.sefFocal?.rashi?.hebrew ?? '',
    sources.sefFocal?.tosafot?.hebrew ?? '',
    { heCap: ANALYZE_CAPS.focalHebrew, enCap: ANALYZE_CAPS.focalEnglish,
      rashiCap: ANALYZE_CAPS.focalRashi, tosafotCap: ANALYZE_CAPS.focalTosafot },
  );
  const rishonimXml = rishonimBlock(sources.rishonim);

  const skelSummary = {
    summary: skeleton.summary,
    sections: skeleton.sections.map((sec) => ({ title: sec.title, summary: sec.summary })),
  };

  const blocks: string[] = [
    `<skeleton>\n${JSON.stringify(skelSummary, null, 2)}\n</skeleton>`,
    focalBlock,
  ];
  if (rishonimXml) blocks.push(rishonimXml);

  const user = [
    `Tractate: ${tractate}`,
    `Focal page: ${page}`,
    '',
    ...blocks,
    '',
    'Identify parallel sugyot per section. Use Rishonim commentary as primary signal.',
  ].join('\n\n');

  const s = await runKimiStreaming(
    ai, '@cf/moonshotai/kimi-k2.5',
    [
      { role: 'system', content: PARALLELS_SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    8000,
    { chatTemplateKwargs: { enable_thinking: false } },
  );

  let payload = s.content.trim();
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) payload = fenced[1].trim();
  let parallelsByTitle: Record<string, string[]> = {};
  try {
    const parsed = JSON.parse(payload) as { sections?: Array<{ title: string; parallels?: string[] }> };
    if (Array.isArray(parsed.sections)) {
      for (const sec of parsed.sections) {
        if (sec.title && Array.isArray(sec.parallels)) {
          parallelsByTitle[sec.title.toLowerCase()] = sec.parallels;
        }
      }
    }
  } catch { /* leave empty */ }

  const analysis: DafAnalysis = {
    summary: skeleton.summary,
    sections: skeleton.sections.map((sec) => ({
      title: sec.title,
      summary: sec.summary,
      excerpt: sec.excerpt,
      rabbis: [],
      parallels: parallelsByTitle[sec.title.toLowerCase()] ?? [],
    })),
  };

  const totalParallels = Object.values(parallelsByTitle).reduce((sum, arr) => sum + arr.length, 0);

  return {
    analysis,
    warnings: [],
    elapsed_ms: Date.now() - t0,
    calls: [callDiag(s)],
    strategy_metadata: {
      model: 'kimi-k2.5-no-thinking',
      shape: 'section-parallels',
      total_parallels: totalParallels,
      sections_with_parallels: Object.values(parallelsByTitle).filter(arr => arr.length > 0).length,
      rishonim_used: Object.keys(sources.rishonim),
    },
  };
}

// --- difficulty strategy ---------------------------------------------------
// Rates each section 1-5 and the daf overall, with a one-sentence rationale
// per rating. 1 = accessible to a beginner (clear Mishnah, no outside refs);
// 5 = expert-level (dense Aramaic, cross-tractate prerequisite knowledge).

const DIFFICULTY_SYSTEM_PROMPT = `You are a Talmud teacher rating educational difficulty. You will receive a skeleton analysis + focal amud.

Rate each section and the overall daf on a 1-5 scale:
- 1: Accessible to a beginner. Clear Mishnah or simple narrative, no outside prerequisites, Aramaic minimal.
- 2: Suitable for a student with basic familiarity. Short sugya, one clear dispute, minimal cross-references.
- 3: Intermediate. Multi-party dispute, some Aramaic technical terms, 1-2 outside references.
- 4: Advanced. Dense argument structure, heavy reliance on unstated assumptions, multiple cross-tractate citations.
- 5: Expert. Highly technical, requires deep prior knowledge of multiple masechtot or Rishonim to parse.

For each section and the overall daf, provide:
- score: 1-5
- reason: ONE sentence explaining the rating (what makes it hard or easy for a learner)

Output STRICT JSON:
{"difficulty": {"score": N, "reason": "..."}, "sections": [{"title": "...", "difficulty": {"score": N, "reason": "..."}}]}`;

async function runDifficultyEnrichment(
  ai: Ai, tractate: string, page: string,
  skeleton: DafSkeleton, sources: EnrichmentSources,
): Promise<EnrichmentResult> {
  const t0 = Date.now();
  const focalHebrewRaw = sources.hbFocal?.main ?? sources.sefFocal?.mainText.hebrew ?? '';
  const focalEnglishRaw = sources.sefFocal?.mainText.english ?? '';
  const focalBlock = amudBlock(
    'focal_amud', page,
    focalHebrewRaw, focalEnglishRaw,
    sources.sefFocal?.rashi?.hebrew ?? '',
    sources.sefFocal?.tosafot?.hebrew ?? '',
    { heCap: ANALYZE_CAPS.focalHebrew, enCap: ANALYZE_CAPS.focalEnglish,
      rashiCap: ANALYZE_CAPS.focalRashi, tosafotCap: ANALYZE_CAPS.focalTosafot },
  );

  const skelSummary = {
    summary: skeleton.summary,
    sections: skeleton.sections.map((sec) => ({ title: sec.title, summary: sec.summary })),
  };

  const user = [
    `Tractate: ${tractate}`,
    `Focal page: ${page}`,
    '',
    `<skeleton>\n${JSON.stringify(skelSummary, null, 2)}\n</skeleton>`,
    '',
    focalBlock,
    '',
    'Rate difficulty per section and overall daf. Return JSON per schema.',
  ].join('\n\n');

  const s = await runKimiStreaming(
    ai, '@cf/moonshotai/kimi-k2.5',
    [
      { role: 'system', content: DIFFICULTY_SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    6000,
    { chatTemplateKwargs: { enable_thinking: false } },
  );

  let payload = s.content.trim();
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) payload = fenced[1].trim();
  let overallDifficulty: DifficultyRating | undefined;
  let difficultyByTitle: Record<string, DifficultyRating> = {};
  try {
    const parsed = JSON.parse(payload) as {
      difficulty?: DifficultyRating;
      sections?: Array<{ title: string; difficulty?: DifficultyRating }>;
    };
    if (parsed.difficulty && typeof parsed.difficulty.score === 'number') {
      overallDifficulty = parsed.difficulty;
    }
    if (Array.isArray(parsed.sections)) {
      for (const sec of parsed.sections) {
        if (sec.title && sec.difficulty) {
          difficultyByTitle[sec.title.toLowerCase()] = sec.difficulty;
        }
      }
    }
  } catch { /* leave empty */ }

  const analysis: DafAnalysis = {
    summary: skeleton.summary,
    difficulty: overallDifficulty,
    sections: skeleton.sections.map((sec) => ({
      title: sec.title,
      summary: sec.summary,
      excerpt: sec.excerpt,
      rabbis: [],
      difficulty: difficultyByTitle[sec.title.toLowerCase()],
    })),
  };

  return {
    analysis,
    warnings: [],
    elapsed_ms: Date.now() - t0,
    calls: [callDiag(s)],
    strategy_metadata: {
      model: 'kimi-k2.5-no-thinking',
      shape: 'section-difficulty',
      overall_score: overallDifficulty?.score ?? null,
      avg_section_score: (() => {
        const scores = Object.values(difficultyByTitle).map(d => d.score);
        return scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
      })(),
    },
  };
}

// --- strategy dispatcher + endpoint -----------------------------------------

type EnrichmentStrategyName =
  | 'baseline'
  | 'per-section'
  | 'hybrid'
  | 'rich-rabbi'
  | 'references'
  | 'parallels'
  | 'difficulty';

const STRATEGY_NAMES: EnrichmentStrategyName[] = [
  'baseline', 'per-section', 'hybrid', 'rich-rabbi', 'references', 'parallels', 'difficulty',
];

async function runEnrichmentStrategy(
  strategy: EnrichmentStrategyName,
  ai: Ai, tractate: string, page: string,
  skeleton: DafSkeleton, sources: EnrichmentSources,
): Promise<EnrichmentResult> {
  switch (strategy) {
    case 'baseline':    return runBaselineEnrichment(ai, tractate, page, skeleton, sources);
    case 'per-section': return runPerSectionEnrichment(ai, tractate, page, skeleton, sources);
    case 'hybrid':      return runHybridEnrichment(ai, tractate, page, skeleton, sources);
    case 'rich-rabbi':  return runRichRabbiEnrichment(ai, tractate, page, skeleton, sources);
    case 'references':  return runReferencesEnrichment(ai, tractate, page, skeleton, sources);
    case 'parallels':   return runParallelsEnrichment(ai, tractate, page, skeleton, sources);
    case 'difficulty':  return runDifficultyEnrichment(ai, tractate, page, skeleton, sources);
    default:            throw new Error(`unknown strategy: ${strategy}`);
  }
}

app.post('/api/enrich/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const strategy = (c.req.query('strategy') || 'baseline') as EnrichmentStrategyName;
  if (!STRATEGY_NAMES.includes(strategy)) {
    return c.json({ error: `unknown strategy '${strategy}'; valid: ${STRATEGY_NAMES.join('|')}` }, 400);
  }
  const cache = c.env.CACHE;
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

  // Require cached skeleton — user must skeleton_only=1 first via /api/analyze.
  const skelRaw = cache ? await cache.get(`analyze-skel:v1:${tractate}:${page}`) : null;
  if (!skelRaw) return c.json({ error: 'No cached skeleton; run /api/analyze/.../?skeleton_only=1 first' }, 404);
  let skeleton: DafSkeleton;
  try { skeleton = JSON.parse(skelRaw) as DafSkeleton; }
  catch { return c.json({ error: 'Cached skeleton is not valid JSON' }, 502); }

  const prevDaf = adjacentAmud(tractate, page, -1);
  const nextDaf = adjacentAmud(tractate, page, 1);
  const [hbFocal, sefFocal, hbPrev, sefPrev, hbNext, sefNext, rishonim, halacha] = await Promise.all([
    getHebrewBooksDafCached(cache, tractate, page),
    getSefariaPageCached(cache, tractate, page),
    prevDaf ? getHebrewBooksDafCached(cache, tractate, prevDaf) : Promise.resolve(null),
    prevDaf ? getSefariaPageCached(cache, tractate, prevDaf) : Promise.resolve(null),
    nextDaf ? getHebrewBooksDafCached(cache, tractate, nextDaf) : Promise.resolve(null),
    nextDaf ? getSefariaPageCached(cache, tractate, nextDaf) : Promise.resolve(null),
    getRishonimCached(cache, tractate, page),
    getHalachaRefsCached(cache, tractate, page),
  ]);

  const sources: EnrichmentSources = {
    hbFocal, sefFocal, hbPrev, sefPrev, hbNext, sefNext,
    rishonim, halacha, prevDaf, nextDaf,
  };

  try {
    const result = await runEnrichmentStrategy(strategy, c.env.AI, tractate, page, skeleton, sources);
    return c.json({
      ...result.analysis,
      _strategy: strategy,
      _elapsed_ms: result.elapsed_ms,
      _calls: result.calls,
      _warnings: result.warnings,
      _metadata: result.strategy_metadata,
      _skeletonSummary: skeleton.summary,
    });
  } catch (err) {
    const msg = String(err);
    // eslint-disable-next-line no-console
    console.warn(`[enrich:${strategy}] ${tractate}/${page} failed:`, msg);
    return c.json({ error: `Strategy '${strategy}' call failed`, detail: msg.slice(0, 500) }, 502);
  }
});

app.get('/api/enrich/ground-truth/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'cache unavailable' }, 503);
  const cached = await cache.get(`analyze:v5:${tractate}:${page}`);
  if (!cached) return c.json({ error: 'no ground truth cached for this daf' }, 404);
  try {
    const parsed = JSON.parse(cached) as DafAnalysis;
    return c.json(parsed);
  } catch {
    return c.json({ error: 'cached ground truth is not valid JSON' }, 502);
  }
});

/**
 * Practical halacha analysis: given a daf, identify the main halachic
 * issues and cite the relevant rulings in Mishneh Torah, Shulchan Aruch,
 * and Rema (only if Rema comments). Kimi K2.6 with thinking, hard-fail.
 */
const HALACHA_SYSTEM_PROMPT = `You are a scholar of Jewish law (halacha). Given a daf of Talmud and its English translation, identify the main PRACTICAL halachic issues discussed, and for each one cite the relevant rulings in three codifications:

1. Mishneh Torah (Rambam, 12th c.) — organized by Hilchot {topic}, chapter:halacha (e.g. "Hilchot Kriat Shema 1:9")
2. Shulchan Aruch (R' Yosef Karo, 16th c.) — organized into four sections: Orach Chaim, Yoreh Deah, Even HaEzer, Choshen Mishpat; cited as "{Section} {siman}:{seif}" (e.g. "Orach Chaim 235:1")
3. Rema (R' Moshe Isserlis, 16th c.) — Ashkenazi glosses on Shulchan Aruch. Include ONLY if Rema disagrees with or adds to the base ruling. Otherwise omit.

Output STRICT JSON only (no markdown, no prose):

{
  "topics": [
    {
      "topic": "Short English description of the halachic issue",
      "topicHe": "Hebrew term for the topic, if standard (e.g. 'זמן קריאת שמע של ערבית')",
      "excerpt": "2-4 Hebrew/Aramaic words from the DAF that introduce or anchor this halachic discussion. Copy verbatim — do NOT translate.",
      "rulings": {
        "mishnehTorah": { "ref": "Hilchot Kriat Shema 1:9", "summary": "1-2 sentence English summary of the ruling" },
        "shulchanAruch": { "ref": "Orach Chaim 235:1", "summary": "1-2 sentence English summary" },
        "rema": { "ref": "Orach Chaim 235:1", "summary": "How Rema's ruling differs or adds — only include if Rema comments here" }
      }
    }
  ]
}

Rules:
- "excerpt" MUST be Hebrew/Aramaic words copied verbatim from the daf — this is how we anchor the halacha to a specific position in the text. Pick the phrase where the underlying Gemara statement first appears.
- Cite specific chapter:seif references — never "in Mishneh Torah" without numbers.
- Summaries in English, 1-2 sentences, plain language.

EXHAUSTIVENESS (critical — previous outputs have been under-inclusive):
- Identify EVERY practical halachic topic the daf touches on, not just the headline. A single daf commonly contains 4-10 distinct halachic topics; output them all. Do NOT cap yourself at "2-3 main ones".
- Include a topic whenever the Gemara's discussion has ANY practical downstream ruling — even a subsidiary detail of a bigger topic. Example: a daf on Shema may have separate topics for "zman kriat Shema of evening", "zman kriat Shema of morning", "reclining vs. standing during Shema", "interrupting Shema", "the blessings before/after Shema", each with their own ref.
- The only things to skip: pure aggada, pure exegesis of verses without practical application, or a rabbi's biography.
- Any of mishnehTorah / shulchanAruch / rema may be omitted if that codifier does not address the topic. But a topic needs at least ONE ref (Mishneh Torah or Shulchan Aruch) to be included.
- When multiple chapters/seifim are relevant to one topic, pick the single most on-point reference. Do NOT split one topic into multiple entries by codification — one topic = one entry with up to three rulings.
- Include Rema wherever the Ashkenazi practice diverges from Shulchan Aruch on this issue, even if minor.`;

interface HalachaRuling {
  ref: string;
  summary: string;
}
interface HalachaTopic {
  topic: string;
  topicHe?: string;
  excerpt?: string;
  rulings: {
    mishnehTorah?: HalachaRuling;
    shulchanAruch?: HalachaRuling;
    rema?: HalachaRuling;
  };
}
interface HalachaResult {
  topics: HalachaTopic[];
}

function validateHalacha(x: unknown): x is HalachaResult {
  if (!x || typeof x !== 'object') return false;
  const h = x as HalachaResult;
  if (!Array.isArray(h.topics)) return false;
  for (const t of h.topics) {
    if (typeof t.topic !== 'string') return false;
    if (t.topicHe !== undefined && typeof t.topicHe !== 'string') return false;
    if (t.excerpt !== undefined && typeof t.excerpt !== 'string') return false;
    if (!t.rulings || typeof t.rulings !== 'object') return false;
    const checks: Array<HalachaRuling | undefined> = [t.rulings.mishnehTorah, t.rulings.shulchanAruch, t.rulings.rema];
    for (const r of checks) {
      if (r === undefined) continue;
      if (typeof r.ref !== 'string' || typeof r.summary !== 'string') return false;
    }
  }
  return true;
}

app.get('/api/halacha/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  // v4 cache: Opus 4.6 primary for much better enumeration of subsidiary
  // halachic topics beyond the headline rulings.
  const cacheKey = `halacha:v5:${tractate}:${page}`;
  const t0 = Date.now();

  const bypass = c.req.query('refresh') === '1';
  const cachedOnly = c.req.query('cached_only') === '1';

  if (cache && !bypass) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      recordTelemetry(c, { endpoint: 'halacha', tractate, page, cache_hit: true, ms: Date.now() - t0, ok: true });
      return c.json({ ...JSON.parse(cached) as HalachaResult, _cached: true });
    }
  }
  if (cachedOnly) {
    return c.json({ cached: false }, 404);
  }
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

  let hebrewText = '';
  let englishContext = '';
  try {
    const [hb, english] = await Promise.all([
      getHebrewBooksDafCached(cache, tractate, page),
      getSefariaEnglishContext(tractate, page, cache).catch(() => ''),
    ]);
    if (hb) hebrewText = stripHtmlServer(hb.main);
    englishContext = english;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[halacha] source fetch partial failure:', err);
  }
  if (!hebrewText && !englishContext) {
    return c.json({ error: 'No source text available for this daf' }, 502);
  }

  const userContent = [
    `Tractate: ${tractate}`,
    `Page: ${page}`,
    '',
    'Hebrew/Aramaic source:',
    hebrewText.slice(0, 5000) || '(unavailable)',
    '',
    'English translation:',
    englishContext.slice(0, 4000) || '(unavailable)',
    '',
    'Output valid JSON only matching the schema.',
  ].join('\n');

  // Kimi K2.6 only, thinking on. Hard-fail rather than fall back.
  const models: Array<{ id: string; label: string; maxTokens: number }> = [
    { id: '@cf/moonshotai/kimi-k2.6', label: 'kimi-k2.6-thinking', maxTokens: 32000 },
  ];

  const attempts: string[] = [];
  for (const m of models) {
    try {
      const streamed = await runKimiStreaming(
        c.env.AI,
        m.id,
        [
          { role: 'system', content: HALACHA_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        m.maxTokens,
      );
      let payload = streamed.content.trim();
      if (!payload && streamed.reasoning_content) {
        const mm = streamed.reasoning_content.match(/\{[\s\S]*"topics"[\s\S]*\}/);
        if (mm) payload = mm[0];
      }
      const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) payload = fenced[1].trim();
      if (!payload) {
        attempts.push(`${m.label}: empty payload`);
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        const repaired = payload
          .replace(/,(\s*[}\]])/g, '$1')
          .replace(/\r/g, '')
          .replace(/"((?:[^"\\]|\\.)*?)"/g, (_m, inner: string) => `"${inner.replace(/\n/g, ' ')}"`);
        try {
          parsed = JSON.parse(repaired);
        } catch (parseErr) {
          attempts.push(`${m.label}: non-JSON (${String(parseErr).slice(0, 100)})`);
          continue;
        }
      }
      if (!validateHalacha(parsed)) {
        attempts.push(`${m.label}: schema mismatch`);
        continue;
      }
      const result = parsed as HalachaResult;
      if (cache) {
        await cache.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 365 });
      }
      recordTelemetry(c, { endpoint: 'halacha', tractate, page, cache_hit: false, model: m.label, ms: Date.now() - t0, ok: true });
      return c.json({ ...result, _cached: false, _model: m.label });
    } catch (err) {
      attempts.push(`${m.label}: ${String(err).slice(0, 200)}`);
    }
  }

  recordTelemetry(c, { endpoint: 'halacha', tractate, page, cache_hit: false, ms: Date.now() - t0, ok: false, error_kind: classifyError(attempts.join(' ')) });
  return c.json({ error: 'Halacha classification failed', attempts }, 502);
});

const AGGADATA_SYSTEM_PROMPT = `You are a Talmud scholar. Given a daf of Talmud and its English translation, identify every AGGADIC unit on the page — narrative stories, biographical anecdotes about named sages, parables (mashalim), dream reports, miracle reports, ethical maxims embedded in narrative, and homiletical expansions on a biblical verse. Ignore purely halachic/legal sugyot and pure legal exegesis.

Output STRICT JSON only (no markdown, no prose):

{
  "stories": [
    {
      "title": "Short, evocative English title (4-7 words). E.g. 'The Oven of Akhnai', 'Rabban Gamliel and the Heavenly Voice'",
      "titleHe": "Hebrew title using the traditional name if one exists (e.g. 'תנור של עכנאי'), otherwise a concise Hebrew summary phrase",
      "summary": "1-2 sentence English summary of what happens / what the story is about",
      "excerpt": "3-6 consecutive Hebrew/Aramaic words copied VERBATIM from the opening of the story in the daf — used to anchor the highlight. Pick the phrase where the narrative first begins, not a rabbi name or a generic opener.",
      "theme": "One-word English tag: miracle | dispute | parable | biography | dream | ethics | exegesis | folklore | prayer"
    }
  ]
}

Rules:
- "excerpt" MUST be Hebrew/Aramaic words copied verbatim from the daf text supplied below. Do not translate. Do not paraphrase. Do not include vowel points if the source lacks them.
- If the daf contains no aggada (purely halachic page), return {"stories": []}.
- Do not split one story into multiple entries. A sustained narrative with dialogue and multiple events is ONE story.
- Do not include dry legal statements attributed to a named sage — that's halacha, not aggada. Include only when there is a narrative, parable, or non-legal teaching.
- Titles should be memorable, not generic ("Story 1"). Use the traditional Hebrew name where one exists.
- Order stories in the order they appear on the daf.`;

interface AggadataStory {
  title: string;
  titleHe?: string;
  summary: string;
  excerpt: string;
  theme?: string;
}
interface AggadataResult {
  stories: AggadataStory[];
}

function validateAggadata(x: unknown): x is AggadataResult {
  if (!x || typeof x !== 'object') return false;
  const a = x as AggadataResult;
  if (!Array.isArray(a.stories)) return false;
  for (const s of a.stories) {
    if (typeof s.title !== 'string') return false;
    if (s.titleHe !== undefined && typeof s.titleHe !== 'string') return false;
    if (typeof s.summary !== 'string') return false;
    if (typeof s.excerpt !== 'string') return false;
    if (s.theme !== undefined && typeof s.theme !== 'string') return false;
  }
  return true;
}

app.get('/api/aggadata/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  const cacheKey = `aggadata:v1:${tractate}:${page}`;
  const t0 = Date.now();

  const bypass = c.req.query('refresh') === '1';
  const cachedOnly = c.req.query('cached_only') === '1';

  if (cache && !bypass) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      recordTelemetry(c, { endpoint: 'aggadata', tractate, page, cache_hit: true, ms: Date.now() - t0, ok: true });
      return c.json({ ...JSON.parse(cached) as AggadataResult, _cached: true });
    }
  }
  if (cachedOnly) {
    return c.json({ cached: false }, 404);
  }
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

  let hebrewText = '';
  let englishContext = '';
  try {
    const [hb, english] = await Promise.all([
      getHebrewBooksDafCached(cache, tractate, page),
      getSefariaEnglishContext(tractate, page, cache).catch(() => ''),
    ]);
    if (hb) hebrewText = stripHtmlServer(hb.main);
    englishContext = english;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[aggadata] source fetch partial failure:', err);
  }
  if (!hebrewText && !englishContext) {
    return c.json({ error: 'No source text available for this daf' }, 502);
  }

  const userContent = [
    `Tractate: ${tractate}`,
    `Page: ${page}`,
    '',
    'Hebrew/Aramaic source:',
    hebrewText.slice(0, 5000) || '(unavailable)',
    '',
    'English translation:',
    englishContext.slice(0, 4000) || '(unavailable)',
    '',
    'Output valid JSON only matching the schema.',
  ].join('\n');

  const models: Array<{ id: string; label: string; maxTokens: number }> = [
    { id: '@cf/moonshotai/kimi-k2.6', label: 'kimi-k2.6-thinking', maxTokens: 32000 },
  ];

  const attempts: string[] = [];
  for (const m of models) {
    try {
      const streamed = await runKimiStreaming(
        c.env.AI,
        m.id,
        [
          { role: 'system', content: AGGADATA_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        m.maxTokens,
      );
      let payload = streamed.content.trim();
      if (!payload && streamed.reasoning_content) {
        const mm = streamed.reasoning_content.match(/\{[\s\S]*"stories"[\s\S]*\}/);
        if (mm) payload = mm[0];
      }
      const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) payload = fenced[1].trim();
      if (!payload) {
        attempts.push(`${m.label}: empty payload`);
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        const repaired = payload
          .replace(/,(\s*[}\]])/g, '$1')
          .replace(/\r/g, '')
          .replace(/"((?:[^"\\]|\\.)*?)"/g, (_m, inner: string) => `"${inner.replace(/\n/g, ' ')}"`);
        try {
          parsed = JSON.parse(repaired);
        } catch (parseErr) {
          attempts.push(`${m.label}: non-JSON (${String(parseErr).slice(0, 100)})`);
          continue;
        }
      }
      if (!validateAggadata(parsed)) {
        attempts.push(`${m.label}: schema mismatch`);
        continue;
      }
      const result = parsed as AggadataResult;
      if (cache) {
        await cache.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 365 });
      }
      recordTelemetry(c, { endpoint: 'aggadata', tractate, page, cache_hit: false, model: m.label, ms: Date.now() - t0, ok: true });
      return c.json({ ...result, _cached: false, _model: m.label });
    } catch (err) {
      attempts.push(`${m.label}: ${String(err).slice(0, 200)}`);
    }
  }

  recordTelemetry(c, { endpoint: 'aggadata', tractate, page, cache_hit: false, ms: Date.now() - t0, ok: false, error_kind: classifyError(attempts.join(' ')) });
  return c.json({ error: 'Aggadata detection failed', attempts }, 502);
});

/**
 * Per-rabbi generation classification for a daf. Used by the client to
 * underline each rabbi name in the Hebrew text with a color indicating
 * era + generation. Two-stage: Gemma-4 no-thinking first pass, Kimi K2.6
 * with thinking background upgrade. Cached forever per daf.
 */
const GENERATIONS_SYSTEM_PROMPT = `You are a scholar of Talmudic history. Given a daf (page) of Talmud, identify every distinct rabbi named in it and assign each one a generation ID.

${GENERATIONS_PROMPT_REFERENCE}

Output STRICT JSON only (no markdown, no prose):

{
  "rabbis": [
    {
      "name": "Rabbi's conventional English name (e.g. 'Rabbi Eliezer')",
      "nameHe": "EXACT Hebrew name as it appears in the source text (e.g. 'ר\\' אליעזר' or 'רבי אליעזר'). Preserve abbreviation style.",
      "generation": "one of the IDs above (zugim, tanna-1...tanna-6, amora-ey-1...amora-ey-5, amora-bavel-1...amora-bavel-8, savora, unknown)"
    }
  ]
}

Rules:
- nameHe MUST be copied verbatim from the Hebrew source — preserve exactly how the rabbi is named there (abbreviations matter: "ר' יוחנן" vs "רבי יוחנן").
- If the same rabbi appears under multiple Hebrew forms in the text, list each distinct form as a separate entry with the same English name and generation.
- If a rabbi moved (e.g. Rabbi Zeira from Bavel to Eretz Yisrael), use the generation of their PRIMARY teaching location. For Rabbi Zeira specifically, use amora-ey-3.
- If the text has anonymous attributions like "Tanna" (תנא) or "the Sages" (חכמים) — DO NOT include them.
- No duplicates (same exact nameHe).`;

interface GenerationsResult {
  rabbis: Array<{
    name: string;
    nameHe: string;
    generation: GenerationId;
  }>;
}

const GENERATION_ID_SET = new Set<string>(GENERATION_IDS);

export function validateGenerations(x: unknown): x is GenerationsResult {
  if (!x || typeof x !== 'object') return false;
  const g = x as GenerationsResult;
  if (!Array.isArray(g.rabbis)) return false;
  for (const r of g.rabbis) {
    if (typeof r.name !== 'string') return false;
    if (typeof r.nameHe !== 'string') return false;
    if (typeof r.generation !== 'string' || !GENERATION_ID_SET.has(r.generation)) return false;
  }
  return true;
}

// Strip Hebrew nikkud + cantillation + common punctuation for fuzzy matching.
function normalizeHe(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Expand common rabbinic abbreviations so substring scans match the canonical
// form. Run BEFORE normalizeHe. Two categories:
//
// Unambiguous (any position):
//   א"ר / א״ר   → רבי           (title part of "Rabbi X said")
//   ר'  / ר׳    → רבי           (geresh shorthand for "Rabbi")
//   אר"י        → אמר רבי יוחנן
//   אר"ל        → אמר ריש לקיש
//   אר"ז        → אמר רבי זירא
//   ריב"ל       → רבי יהושע בן לוי
//   רשב"י       → רבי שמעון בר יוחאי
//
// Context-dependent (expand only in Rabbi-Meir-dominant phrases):
//   ר"מ         → רבי מאיר   only when preceded by דברי/לדברי/כדברי/אמר/ואמר
//                            or followed by וחכמים/אומר
//
// Ambiguous forms (ר"י / ר"א / ר"ש) are NOT expanded anywhere — too many
// rabbis map to them.
export function expandAbbreviations(s: string): string {
  // Use explicit whitespace/edge lookarounds — JS `\b` does not treat Hebrew
  // letters as word characters, so it misbehaves around Hebrew text.
  const edge = (lhs: RegExp) =>
    new RegExp(`(^|\\s)${lhs.source}(?=\\s|$)`, 'g');
  return s
    // Contextual Rabbi Meir first — must run before the generic ר' rewrite so
    // that phrases like "דברי ר' מ" stay untouched if they somehow appear.
    .replace(/(^|\s)(דברי|לדברי|כדברי|אמר|ואמר)\s+ר["״]מ(?=\s|$)/g, '$1$2 רבי מאיר')
    .replace(/(^|\s)ר["״]מ\s+(וחכמים|אומר)(?=\s|$)/g, '$1רבי מאיר $2')
    // Unambiguous collapsed-abbreviation forms.
    .replace(edge(/אר["״]י/),  (_m, p) => `${p}אמר רבי יוחנן`)
    .replace(edge(/אר["״]ל/),  (_m, p) => `${p}אמר ריש לקיש`)
    .replace(edge(/אר["״]ז/),  (_m, p) => `${p}אמר רבי זירא`)
    .replace(edge(/ריב["״]ל/), (_m, p) => `${p}רבי יהושע בן לוי`)
    .replace(edge(/רשב["״]י/), (_m, p) => `${p}רבי שמעון בר יוחאי`)
    // Generic title expansions.
    .replace(/א["״]ר(?=\s)/g, 'רבי')
    .replace(/(^|\s)ר['׳](?=\s)/g, '$1רבי');
}

// Precompute: canonicalHe → { name, slug } for every rabbi in the Sefaria-
// derived dataset. Used to catch rabbis the model missed via substring match.
// The dataset leaks biblical figures and concept nouns (משה, רות, אור, תורה...),
// so filter to names that either start with a rabbinic title or are explicit
// standalone Amoraic names. Anything else risks false-positive underlines.
const RABBI_HE_TITLE_RE = /^(רבי|רב|ר'|מר|רבן|רבה|רבא|רבינא)\s/;
const RABBI_HE_STANDALONE = new Set([
  'רבא', 'רבינא', 'אבא', 'רבה', 'רב', 'מר',
  'שמואל', 'הלל', 'שמאי', 'עולא', 'זעירי',
  'אביי', 'רבינא השני',
]);

interface KnownRabbi { slug: string; name: string; nameHe: string; nameHeNorm: string }
const KNOWN_RABBIS_HE: KnownRabbi[] = (() => {
  const out: KnownRabbi[] = [];
  for (const [slug, r] of Object.entries(RABBI_PLACES.rabbis)) {
    const he = r.canonicalHe;
    if (!he) continue;
    const norm = normalizeHe(he);
    if (!norm || norm.length < 2 || norm.includes('(')) continue;
    if (!RABBI_HE_TITLE_RE.test(norm) && !RABBI_HE_STANDALONE.has(norm)) continue;
    out.push({ slug, name: r.canonical, nameHe: he, nameHeNorm: norm });
  }
  // Longer names first so "רבי יוחנן בן זכאי" matches before "רבי יוחנן" claims it.
  out.sort((a, b) => b.nameHeNorm.length - a.nameHeNorm.length);
  return out;
})();

function canonicalizeName(raw: string): string {
  const hit = resolveRabbiName(raw);
  return hit?.canonical ?? raw;
}

// Hebrew word-boundary test — match only when surrounded by whitespace or at
// a string edge, so "רבא" doesn't match inside "דרבא" (prefix דְ־).
function hasHebrewWordBoundaryMatch(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return false;
    const beforeOk = idx === 0 || /\s/.test(haystack[idx - 1]);
    const afterIdx = idx + needle.length;
    const afterOk = afterIdx === haystack.length || /\s/.test(haystack[afterIdx]);
    if (beforeOk && afterOk) return true;
    from = idx + 1;
  }
}

// Aramaic/Hebrew tokens that sometimes trail a rabbi's name when the model
// over-copies context (e.g. "ר' אלכסנדרי בתר צלותיה" = "Rabbi Alexandri
// AFTER HIS PRAYER"). None of these words are ever part of a rabbi name, so
// truncating at the first occurrence leaves only the name itself.
const NAMEHE_STOP_TOKENS: ReadonlySet<string> = new Set([
  // Attribution verbs
  'אמר', 'אמרה', 'אמרו', 'אומר', 'אומרת', 'אומרים', 'מתני', 'דרש', 'דריש',
  // Stative / motion / perception
  'קאי', 'קם', 'יתיב', 'הוה', 'הווה',
  'פתח', 'חזא', 'אזל', 'אתא', 'שמע', 'אשכח', 'אקלע', 'מטא',
  'בעי', 'בעא', 'סבר',
  // Pronouns / prepositions that never belong in a name
  'בתר', 'קמיה', 'עליה', 'עלה', 'להו',
]);

// Truncate nameHe at the first clear stop-token so downstream matching (and
// the client's per-word underline) doesn't paint extra trailing words.
export function sanitizeNameHe(nameHe: string): string {
  if (!nameHe) return nameHe;
  const tokens = nameHe.split(/\s+/).filter(Boolean);
  const keep: string[] = [];
  for (const tok of tokens) {
    const norm = tok.replace(/[֑-ׇ]/g, '').replace(/[.,:;?!"'״׳()[\]{}]/g, '');
    if (NAMEHE_STOP_TOKENS.has(norm)) break;
    keep.push(tok);
  }
  return keep.join(' ').trim();
}

// Scan the daf's Hebrew text for canonical rabbi forms and return any that
// don't already appear in the model's output. Generation is left 'unknown'
// for now — they still get a grey underline and show up in the timeline.
export function augmentWithKnownRabbis(
  modelRabbis: GenerationsResult['rabbis'],
  hebrewText: string,
): GenerationsResult['rabbis'] {
  const sanitized = modelRabbis
    .map((r) => ({ ...r, nameHe: sanitizeNameHe(r.nameHe) }))
    .filter((r) => r.nameHe.length > 0);
  const textNorm = normalizeHe(expandAbbreviations(hebrewText));
  const seenHe = new Set(sanitized.map((r) => normalizeHe(r.nameHe)));
  const added: GenerationsResult['rabbis'] = [];
  for (const k of KNOWN_RABBIS_HE) {
    if (seenHe.has(k.nameHeNorm)) continue;
    if (!hasHebrewWordBoundaryMatch(textNorm, k.nameHeNorm)) continue;
    added.push({ name: k.name, nameHe: k.nameHe, generation: 'unknown' });
    seenHe.add(k.nameHeNorm);
  }
  return [...sanitized, ...added];
}

// JSON schema used to constrain the generations model output. Forces the
// model to emit a rabbis array with the exact shape we expect — supported
// by Kimi K2.6 via response_format.type = "json_schema".
const GENERATIONS_JSON_SCHEMA = {
  name: 'rabbi_generations',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['rabbis'],
    properties: {
      rabbis: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'nameHe', 'generation'],
          properties: {
            name: { type: 'string' },
            nameHe: { type: 'string' },
            generation: { type: 'string', enum: GENERATION_IDS },
          },
        },
      },
    },
  },
};

async function runGenerationsModel(
  ai: Ai,
  modelId: string,
  hebrewText: string,
  englishContext: string,
  tractate: string,
  page: string,
  opts: { maxTokens: number; enableThinking: boolean },
): Promise<GenerationsResult | { error: string }> {
  // Kimi K2.6 has a 256k context window; the Hebrew daf is at most a few
  // thousand tokens so we barely need to slice. Keep a generous cap as a
  // safety net against upstream pages that somehow balloon.
  const userContent = [
    `Tractate: ${tractate}`,
    `Page: ${page}`,
    '',
    'Hebrew/Aramaic source (copy nameHe VERBATIM from here):',
    hebrewText.slice(0, 40000),
    '',
    'English translation (for rabbi identification):',
    englishContext.slice(0, 12000) || '(unavailable)',
  ].join('\n');
  try {
    const resp = await ai.run(modelId as never, {
      messages: [
        { role: 'system', content: GENERATIONS_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: opts.maxTokens,
      temperature: 0.1,
      chat_template_kwargs: { enable_thinking: opts.enableThinking },
      response_format: { type: 'json_schema', json_schema: GENERATIONS_JSON_SCHEMA },
    } as never);
    const payload = extractJsonPayload(resp);
    if (!payload) return { error: `${modelId}: empty payload` };
    let parsed: unknown;
    try { parsed = JSON.parse(payload); }
    catch {
      const repaired = payload
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/\r/g, '')
        .replace(/"((?:[^"\\]|\\.)*?)"/g, (_m, inner: string) => `"${inner.replace(/\n/g, ' ')}"`);
      try { parsed = JSON.parse(repaired); }
      catch (err) { return { error: `${modelId}: non-JSON (${String(err).slice(0, 100)})` }; }
    }
    if (!validateGenerations(parsed)) return { error: `${modelId}: schema mismatch` };
    return parsed as GenerationsResult;
  } catch (err) {
    return { error: `${modelId}: ${String(err).slice(0, 200)}` };
  }
}

// Streaming variant for Kimi K2.6 thinking — Workers AI Gateway hard-times-out
// non-streaming thinking calls (AiError 3046), so Stage 2 of /api/daf-context
// goes through SSE like /api/analyze does. Returns the same shape as
// runGenerationsModel plus diagnostic fields so silent timeouts surface in logs.
interface GenerationsStreamDiag {
  prompt_chars: number;
  content_chars: number;
  reasoning_chars: number;
  elapsed_ms: number;
  finish_reason: string | null;
  usage: StreamedResult['usage'];
}
async function runGenerationsModelStreaming(
  ai: Ai,
  modelId: string,
  hebrewText: string,
  englishContext: string,
  tractate: string,
  page: string,
  opts: { maxTokens: number; enableThinking: boolean },
): Promise<(GenerationsResult & { _diag: GenerationsStreamDiag }) | { error: string; _diag: GenerationsStreamDiag | null }> {
  const userContent = [
    `Tractate: ${tractate}`,
    `Page: ${page}`,
    '',
    'Hebrew/Aramaic source (copy nameHe VERBATIM from here):',
    hebrewText.slice(0, 40000),
    '',
    'English translation (for rabbi identification):',
    englishContext.slice(0, 12000) || '(unavailable)',
  ].join('\n');
  let streamed: StreamedResult;
  try {
    streamed = await runKimiStreaming(
      ai, modelId,
      [
        { role: 'system', content: GENERATIONS_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      opts.maxTokens,
      { chatTemplateKwargs: { enable_thinking: opts.enableThinking } },
    );
  } catch (err) {
    return { error: `${modelId}: ${String(err).slice(0, 200)}`, _diag: null };
  }
  const diag: GenerationsStreamDiag = {
    prompt_chars: streamed.prompt_chars,
    content_chars: streamed.content.length,
    reasoning_chars: streamed.reasoning_content.length,
    elapsed_ms: streamed.elapsed_ms,
    finish_reason: streamed.finish_reason,
    usage: streamed.usage,
  };
  let payload = streamed.content.trim();
  if (!payload && streamed.reasoning_content) {
    const m = streamed.reasoning_content.match(/\{[\s\S]*"rabbis"[\s\S]*\}/);
    if (m) payload = m[0];
  }
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) payload = fenced[1].trim();
  if (!payload) return { error: `${modelId}: empty payload`, _diag: diag };
  let parsed: unknown;
  try { parsed = JSON.parse(payload); }
  catch {
    const repaired = payload
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/\r/g, '')
      .replace(/"((?:[^"\\]|\\.)*?)"/g, (_m, inner: string) => `"${inner.replace(/\n/g, ' ')}"`);
    try { parsed = JSON.parse(repaired); }
    catch (err) { return { error: `${modelId}: non-JSON (${String(err).slice(0, 100)})`, _diag: diag }; }
  }
  if (!validateGenerations(parsed)) return { error: `${modelId}: schema mismatch`, _diag: diag };
  return { ...(parsed as GenerationsResult), _diag: diag };
}

// --- Shared enrichment --------------------------------------------------
// An IdentifiedRabbi is the unit of state shared across the three features
// that care about rabbis in a daf: underlines, timeline, geography map, and
// the bio sidebar. Produced by joining the AI model's output with the
// precomputed Sefaria-derived rabbi-places dataset.
interface IdentifiedRabbi {
  slug: string | null;
  name: string;
  nameHe: string;
  generation: GenerationId;
  region: 'israel' | 'bavel' | null;
  places: string[];
  moved: Movement;
  bio: string | null;
  image: string | null;
  wiki: string | null;
}

export function deriveRegionFromGeneration(g: GenerationId): 'israel' | 'bavel' | null {
  if (g.startsWith('amora-ey') || g.startsWith('tanna') || g === 'zugim') return 'israel';
  if (g.startsWith('amora-bavel') || g === 'savora') return 'bavel';
  return null;
}

export function enrichRabbi(name: string, nameHe: string, generation: GenerationId): IdentifiedRabbi {
  const hit = resolveRabbi(name, nameHe);
  const entry = hit?.entry ?? null;
  return {
    slug: hit?.slug ?? null,
    name: entry?.canonical ?? name,
    nameHe,
    generation,
    region: entry?.region ?? deriveRegionFromGeneration(generation),
    places: entry?.places ?? [],
    moved: entry?.moved ?? null,
    bio: entry?.bio ?? null,
    image: entry?.image ?? null,
    wiki: entry?.wiki ?? null,
  };
}

// Prefer non-'unknown' generations, and the LONGEST nameHe (so `רבי אליעזר`
// wins over `ר' אליעזר` when both resolve to the same slug). Entries that
// don't resolve to a slug are kept as-is (no cross-collapse risk).
function mergeDuplicate(a: IdentifiedRabbi, b: IdentifiedRabbi): IdentifiedRabbi {
  const knownGen = (g: GenerationId) => g !== 'unknown';
  const pickGen = knownGen(a.generation) ? a.generation
                : knownGen(b.generation) ? b.generation
                : a.generation;
  const pickNameHe = a.nameHe.length >= b.nameHe.length ? a.nameHe : b.nameHe;
  return { ...a, generation: pickGen, nameHe: pickNameHe };
}

export function enrichAll(rabbis: GenerationsResult['rabbis']): IdentifiedRabbi[] {
  const enriched = rabbis.map((r) => enrichRabbi(r.name, r.nameHe, r.generation));
  const bySlug = new Map<string, IdentifiedRabbi>();
  const unslugged: IdentifiedRabbi[] = [];
  for (const r of enriched) {
    if (!r.slug) { unslugged.push(r); continue; }
    const prior = bySlug.get(r.slug);
    bySlug.set(r.slug, prior ? mergeDuplicate(prior, r) : r);
  }
  return [...bySlug.values(), ...unslugged];
}

interface DafContext {
  rabbis: IdentifiedRabbi[];
}

// Unified daf context — the single source of truth for underlines, timeline,
// geography map, and rabbi bio sidebar. Stage 1 is Gemma-4 26B (no thinking,
// ~15s); Stage 2 is Kimi K2.6 with thinking (background, ~1–3 min).
app.get('/api/daf-context/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  const baseKey = `daf-context:v5:${tractate}:${page}`;
  const stage2Key = `${baseKey}:stage2`;

  const bypass = c.req.query('refresh') === '1';
  const cachedOnly = c.req.query('cached_only') === '1';
  const wantStage2 = c.req.query('stage') === '2';
  const t0 = Date.now();

  if (cache && !bypass) {
    if (wantStage2) {
      const cached = await cache.get(stage2Key);
      if (cached) {
        recordTelemetry(c, { endpoint: 'daf-context', tractate, page, cache_hit: true, model: 'kimi-k2.6', ms: Date.now() - t0, ok: true });
        return c.json({ ...JSON.parse(cached) as DafContext, _cached: true, _stage: 2 });
      }
      return c.body(null, 204);
    }
    const upgraded = await cache.get(stage2Key);
    if (upgraded) {
      recordTelemetry(c, { endpoint: 'daf-context', tractate, page, cache_hit: true, model: 'kimi-k2.6', ms: Date.now() - t0, ok: true });
      return c.json({ ...JSON.parse(upgraded) as DafContext, _cached: true, _stage: 2 });
    }
    const cached = await cache.get(baseKey);
    if (cached) {
      recordTelemetry(c, { endpoint: 'daf-context', tractate, page, cache_hit: true, model: 'gemma-4-26b', ms: Date.now() - t0, ok: true });
      return c.json({ ...JSON.parse(cached) as DafContext, _cached: true, _stage: 1 });
    }
  }
  if (cachedOnly) return c.json({ cached: false }, 404);
  if (wantStage2) return c.body(null, 204);
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

  let hebrewText = '';
  let englishContext = '';
  try {
    const [hb, english] = await Promise.all([
      getHebrewBooksDafCached(cache, tractate, page),
      getSefariaEnglishContext(tractate, page, cache).catch(() => ''),
    ]);
    if (hb) hebrewText = stripHtmlServer(hb.main);
    englishContext = english;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[daf-context] source fetch partial failure:', err);
  }
  if (!hebrewText) {
    recordTelemetry(c, { endpoint: 'daf-context', tractate, page, cache_hit: false, ms: Date.now() - t0, ok: false, error_kind: 'other' });
    return c.json({ error: 'No Hebrew source available' }, 502);
  }

  // Stage 1: Gemma-4, no thinking
  const s1 = await runGenerationsModel(
    c.env.AI, '@cf/google/gemma-4-26b-a4b-it', hebrewText, englishContext, tractate, page,
    { maxTokens: 6000, enableThinking: false },
  );
  if ('error' in s1) {
    recordTelemetry(c, { endpoint: 'daf-context', tractate, page, cache_hit: false, model: 'gemma-4-26b', ms: Date.now() - t0, ok: false, error_kind: classifyError(s1.error) });
    return c.json({ error: 'Stage-1 classification failed', attempts: [s1.error] }, 502);
  }
  const augmented = augmentWithKnownRabbis(s1.rabbis, hebrewText);
  const stage1Ctx: DafContext = { rabbis: enrichAll(augmented) };
  if (cache) await cache.put(baseKey, JSON.stringify(stage1Ctx), { expirationTtl: 60 * 60 * 24 * 365 });
  recordTelemetry(c, { endpoint: 'daf-context', tractate, page, cache_hit: false, model: 'gemma-4-26b', ms: Date.now() - t0, ok: true });

  // Stage 2: Kimi K2.6, thinking enabled, in background.
  const ai = c.env.AI;
  if (cache) {
    const hebSnap = hebrewText;
    const engSnap = englishContext;
    const env = c.env;
    const ctx = c.executionCtx;
    c.executionCtx.waitUntil((async () => {
      const s2t0 = Date.now();
      try {
        const r = await runGenerationsModelStreaming(
          ai, '@cf/moonshotai/kimi-k2.6', hebSnap, engSnap, tractate, page,
          { maxTokens: 16000, enableThinking: true },
        );
        if ('error' in r) {
          console.warn(`[daf-context:stage2] ${tractate}/${page} failed:`, r.error, r._diag ? JSON.stringify(r._diag) : '');
          recordTelemetry({ env, executionCtx: ctx }, { endpoint: 'daf-context-stage2', tractate, page, cache_hit: false, model: 'kimi-k2.6', ms: Date.now() - s2t0, ok: false, error_kind: classifyError(r.error) });
          return;
        }
        console.log(`[daf-context:stage2] ${tractate}/${page} ok rabbis=${r.rabbis.length}`, JSON.stringify(r._diag));
        const upgraded: DafContext = { rabbis: enrichAll(augmentWithKnownRabbis(r.rabbis, hebSnap)) };
        await cache.put(stage2Key, JSON.stringify(upgraded), { expirationTtl: 60 * 60 * 24 * 365 });
        recordTelemetry({ env, executionCtx: ctx }, { endpoint: 'daf-context-stage2', tractate, page, cache_hit: false, model: 'kimi-k2.6', ms: Date.now() - s2t0, ok: true });
      } catch (err) {
        console.warn(`[daf-context:stage2] ${tractate}/${page} threw:`, err);
        recordTelemetry({ env, executionCtx: ctx }, { endpoint: 'daf-context-stage2', tractate, page, cache_hit: false, model: 'kimi-k2.6', ms: Date.now() - s2t0, ok: false, error_kind: 'other' });
      }
    })());
  }

  return c.json({ ...stage1Ctx, _cached: false, _stage: 1 });
});

// --- Admin: per-rabbi enrichment ----------------------------------------
// One-shot Kimi K2.6 thinking call per rabbi to fill in the structured
// fields that are sparse in rabbi-places.json (generation, region, places,
// moved). The runner script (scripts/enrich-rabbis.mjs) fans out 128 calls
// in parallel and merges results back into the JSON.

const ENRICH_SYSTEM_PROMPT = `You are a scholar of Talmudic history. You will receive ONE rabbi's canonical name, Hebrew name, and an English bio. Extract four structured fields from the bio (using your broader knowledge of that rabbi where the bio is silent, but never inventing facts the bio contradicts).

Output STRICT JSON (no prose, no markdown):

{
  "generation": "one of the generation IDs listed below, or 'unknown' if the rabbi is too obscure to place",
  "region": "'israel' | 'bavel' | null — the rabbi's primary teaching location. null only for pre-Talmudic or non-geographic figures.",
  "places": ["array of specific cities associated with the rabbi (e.g. 'Tiberias', 'Sura', 'Yavneh'). Prefer canonical English spellings. Empty array if none can be identified."],
  "moved": "'bavel->israel' | 'israel->bavel' | 'both' | null — use a direction ONLY when the bio or common knowledge clearly indicates migration between Bavel and Eretz Yisrael. Default to null."
}

${GENERATIONS_PROMPT_REFERENCE}

Rules:
- Base 'region' on the PRIMARY teaching location, not birthplace. R. Zeira was born in Bavel but taught in Eretz Yisrael → region: 'israel', moved: 'bavel->israel'.
- 'places' should be specific cities, not regions. Don't put 'Eretz Yisrael' or 'Bavel' in places.
- If the bio mentions they moved, set 'moved' accordingly.
- If the rabbi lived in both regions as a full career (e.g. the Tannaim who fled to Usha), use 'both'.
- Use 'unknown' for generation only when you truly cannot place them. Most named rabbis in the dataset ARE placeable.`;

interface EnrichedRabbi {
  generation: string;
  region: 'israel' | 'bavel' | null;
  places: string[];
  moved: Movement;
}

function validateEnriched(x: unknown): x is EnrichedRabbi {
  if (!x || typeof x !== 'object') return false;
  const e = x as EnrichedRabbi;
  if (typeof e.generation !== 'string') return false;
  if (!GENERATION_ID_SET.has(e.generation)) return false;
  if (e.region !== null && e.region !== 'israel' && e.region !== 'bavel') return false;
  if (!Array.isArray(e.places)) return false;
  if (e.places.some((p) => typeof p !== 'string')) return false;
  const validMoved: Array<Movement> = [null, 'bavel->israel', 'israel->bavel', 'both'];
  if (!validMoved.includes(e.moved ?? null)) return false;
  return true;
}

const ENRICH_JSON_SCHEMA = {
  name: 'rabbi_enrichment',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['generation', 'region', 'places', 'moved'],
    properties: {
      generation: { type: 'string', enum: GENERATION_IDS },
      region: { type: ['string', 'null'], enum: ['israel', 'bavel', null] },
      places: { type: 'array', items: { type: 'string' } },
      moved: { type: ['string', 'null'], enum: [null, 'bavel->israel', 'israel->bavel', 'both'] },
    },
  },
};

// Sage filter: only entries whose canonicalHe starts with a rabbinic title
// (or is a standalone sage name) are worth enriching. Biblical figures and
// concept nouns don't participate in rabbi identification at runtime.
function isRabbinicEntry(r: RabbiPlacesEntry): boolean {
  const he = (r.canonicalHe ?? '')
    .replace(/[֑-ׇ.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!he) return false;
  return RABBI_HE_TITLE_RE.test(he + ' ') || RABBI_HE_STANDALONE.has(he);
}

app.get('/api/admin/rabbi-slugs', (c) => {
  const slugs = Object.entries(RABBI_PLACES.rabbis)
    .filter(([, r]) => isRabbinicEntry(r))
    .map(([slug]) => slug);
  return c.json({ slugs, count: slugs.length });
});

app.get('/api/admin/enrich-rabbi/:slug', async (c) => {
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  const slug = c.req.param('slug');
  const entry = RABBI_PLACES.rabbis[slug];
  if (!entry) return c.json({ error: `unknown slug: ${slug}` }, 404);
  if (!entry.bio) return c.json({ error: `no bio available for ${slug}` }, 422);

  const userContent = [
    `Canonical name: ${entry.canonical}`,
    `Hebrew name:   ${entry.canonicalHe ?? '(none)'}`,
    `Aliases:       ${(entry.aliases ?? []).slice(0, 8).join(', ')}`,
    '',
    `Bio:`,
    entry.bio,
  ].join('\n');

  const t0 = Date.now();
  try {
    const resp = await c.env.AI.run('@cf/moonshotai/kimi-k2.6' as never, {
      messages: [
        { role: 'system', content: ENRICH_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 65536,
      temperature: 0.1,
      chat_template_kwargs: { enable_thinking: true },
      response_format: { type: 'json_schema', json_schema: ENRICH_JSON_SCHEMA },
    } as never);
    const payload = extractJsonPayload(resp);
    if (!payload) return c.json({ error: 'empty payload', slug }, 502);
    let parsed: unknown;
    try { parsed = JSON.parse(payload); }
    catch (err) { return c.json({ error: `non-JSON: ${String(err).slice(0, 200)}`, slug, raw: payload.slice(0, 500) }, 502); }
    if (!validateEnriched(parsed)) {
      return c.json({ error: 'schema mismatch', slug, got: parsed }, 502);
    }
    return c.json({
      slug,
      canonical: entry.canonical,
      ...parsed,
      _ms: Date.now() - t0,
    });
  } catch (err) {
    return c.json({ error: String(err).slice(0, 300), slug }, 502);
  }
});

// --- Admin: per-rabbi relationship extraction ---------------------------
// Extracts teachers / students / colleagues from each rabbi's bio via
// Kimi K2.6 thinking. Names returned by the model are resolved server-side
// through the shared alias index so downstream consumers get validated
// slugs (or null for unresolvable mentions). Output drives
// scripts/build-rabbi-hierarchy.mjs → src/lib/data/rabbi-hierarchy.json,
// which the client renders as the rabbi-tree strip.

const RELATIONSHIPS_SYSTEM_PROMPT = `You are a scholar of Talmudic history. You will receive ONE rabbi's canonical name, Hebrew name, generation, and an English bio. Identify the rabbi's direct relationships with OTHER named rabbis:

- teachers:   rabbis the subject studied under / received tradition from.
- students:   rabbis who studied under the subject.
- colleagues: contemporaries the subject is attested to have debated, worked alongside, or issued rulings with (not passing mentions).

Output STRICT JSON (no prose, no markdown):

{
  "teachers":   ["Array of the subject's teachers, using the conventional English name form (e.g. 'Rabbi Yehudah haNasi', 'Rav Huna'). Omit if unknown."],
  "students":   ["Array of the subject's students."],
  "colleagues": ["Array of the subject's contemporaries / debate partners."]
}

Rules:
- Include a rabbi only when the relationship is stated or strongly implied by the bio, OR is well-established common knowledge consistent with the bio. Do NOT invent relationships.
- Use ASCII-only canonical English names; prefer Sefaria-style spellings ('b.' not 'ben', 'Rav' for Babylonian Amoraim, 'Rabbi' for Eretz-Yisrael Amoraim / Tannaim).
- A single rabbi should appear in at most ONE array (most important relationship). If genuinely both teacher and colleague, pick teacher.
- Do NOT include the subject themselves.
- Do NOT include anonymous groups ('the Sages', 'the rabbis of Pumbedita').
- If a category is empty, return an empty array. Do not omit the field.
- Cap each array at 12 entries — pick the most important.`;

interface RelationshipsResult {
  teachers: string[];
  students: string[];
  colleagues: string[];
}

function validateRelationships(x: unknown): x is RelationshipsResult {
  if (!x || typeof x !== 'object') return false;
  const r = x as RelationshipsResult;
  for (const k of ['teachers', 'students', 'colleagues'] as const) {
    if (!Array.isArray(r[k])) return false;
    if (r[k].some((s) => typeof s !== 'string')) return false;
  }
  return true;
}

interface ResolvedRef { name: string; slug: string | null }

function resolveRefs(names: string[], selfSlug: string): ResolvedRef[] {
  const out: ResolvedRef[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = (raw ?? '').trim();
    if (!name) continue;
    const hit = resolveRabbiByName(name);
    const slug = hit?.slug ?? null;
    if (slug === selfSlug) continue; // guard against self-reference
    const key = slug ?? `raw:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, slug });
  }
  return out;
}

app.get('/api/admin/rabbi-relationships/:slug', async (c) => {
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  const slug = c.req.param('slug');
  const entry = RABBI_PLACES.rabbis[slug];
  if (!entry) return c.json({ error: `unknown slug: ${slug}` }, 404);
  if (!entry.bio) return c.json({ error: `no bio available for ${slug}` }, 422);

  const userContent = [
    `Canonical name: ${entry.canonical}`,
    `Hebrew name:   ${entry.canonicalHe ?? '(none)'}`,
    `Generation:    ${entry.generation ?? 'unknown'}`,
    `Region:        ${entry.region ?? 'unknown'}`,
    `Aliases:       ${(entry.aliases ?? []).slice(0, 8).join(', ')}`,
    '',
    `Bio:`,
    entry.bio,
  ].join('\n');

  const t0 = Date.now();
  let streamed: StreamedResult;
  try {
    streamed = await runKimiStreaming(
      c.env.AI,
      '@cf/moonshotai/kimi-k2.6',
      [
        { role: 'system', content: RELATIONSHIPS_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      65536,
      { chatTemplateKwargs: { enable_thinking: true } },
    );
  } catch (err) {
    return c.json({ error: String(err).slice(0, 300), slug }, 502);
  }
  // Salvage JSON out of reasoning block if the model forgot to emit it as
  // content (Kimi occasionally wraps the final answer in reasoning mid-burst).
  let payload = streamed.content.trim();
  if (!payload && streamed.reasoning_content) {
    const m = streamed.reasoning_content.match(/\{[\s\S]*"teachers"[\s\S]*\}/);
    if (m) payload = m[0];
  }
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) payload = fenced[1].trim();
  if (!payload) return c.json({ error: 'empty payload', slug, _ms: streamed.elapsed_ms }, 502);
  let parsed: unknown;
  try { parsed = JSON.parse(payload); }
  catch (err) {
    const repaired = payload.replace(/,(\s*[}\]])/g, '$1').replace(/\r/g, '');
    try { parsed = JSON.parse(repaired); }
    catch { return c.json({ error: `non-JSON: ${String(err).slice(0, 200)}`, slug, raw: payload.slice(0, 500) }, 502); }
  }
  if (!validateRelationships(parsed)) {
    return c.json({ error: 'schema mismatch', slug, got: parsed }, 502);
  }
  const teachers = resolveRefs(parsed.teachers, slug);
  const students = resolveRefs(parsed.students, slug);
  const colleagues = resolveRefs(parsed.colleagues, slug);
  return c.json({
    slug,
    canonical: entry.canonical,
    teachers,
    students,
    colleagues,
    _ms: Date.now() - t0,
  });
});

// --- Admin: Hebrew-Wikipedia bio → English summary ----------------------
// Companion to scripts/scrape-wikipedia-rabbis.mjs. Given a Hebrew lead-
// paragraph extract from he.wikipedia and a Hebrew name, produces:
//   - canonicalEn: the rabbi's standard English name (for slug generation),
//   - bioEn:       an ≤800-char English summary matching the voice of the
//                  existing Sefaria-derived bios,
//   - aliases:     other English forms worth matching against model output.
//
// The script calls this once per page; Kimi K2.6 is the bottleneck.

const TRANSLATE_BIO_SYSTEM_PROMPT = `You are a scholar of Talmudic history and a careful translator. You will receive a short Hebrew biographical passage about one rabbi (a Tanna or Amora) copied from Hebrew Wikipedia, along with the rabbi's Hebrew name.

Produce STRICT JSON (no prose, no markdown):

{
  "canonicalEn": "The rabbi's standard English name, e.g. 'Rabbi Alexandri', 'Rav Nachman bar Yitzchak'. Use the 'Rabbi X' form for Eretz-Yisrael Amoraim and Tannaim, 'Rav X' for Babylonian Amoraim. Prefer Sefaria-style spellings (e.g. 'b.' for Hebrew 'בן', not 'ben'). Do not invent suffixes.",
  "bioEn":       "A concise English summary of the Hebrew passage, ≤800 characters, written in the third person, plain prose (no headings, no bullet points). Mirror the style of traditional Sefaria bios: start with the rabbi's name/title, then note generation/teachers/region, then any distinctive feature (e.g. 'known as an aggadist', 'famous teaching', major students). Stay faithful to the source; do not add facts the passage does not support.",
  "aliases":     ["Up to 5 alternate English spellings of the name (e.g. 'R. Alexandri', 'Rabbi Alexandrai'). Do NOT include the canonicalEn value itself. Empty array is fine if there are no obvious variants."]
}

Rules:
- If the Hebrew passage is NOT about a rabbi (list page, disambiguation, place, concept), respond with canonicalEn = "" and bioEn = "". The caller will skip non-rabbi pages.
- bioEn must be ≤800 characters. Aim for 300–500. Trim ruthlessly if the source is long.
- Use ASCII-only in canonicalEn and aliases (no Hebrew letters, no diacritics).`;

interface TranslatedBio {
  canonicalEn: string;
  bioEn: string;
  aliases: string[];
}

function validateTranslatedBio(x: unknown): x is TranslatedBio {
  if (!x || typeof x !== 'object') return false;
  const t = x as TranslatedBio;
  if (typeof t.canonicalEn !== 'string') return false;
  if (typeof t.bioEn !== 'string') return false;
  if (!Array.isArray(t.aliases)) return false;
  if (t.aliases.some((a) => typeof a !== 'string')) return false;
  return true;
}

const TRANSLATE_BIO_JSON_SCHEMA = {
  name: 'wiki_bio_translation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['canonicalEn', 'bioEn', 'aliases'],
    properties: {
      canonicalEn: { type: 'string' },
      bioEn: { type: 'string' },
      aliases: { type: 'array', items: { type: 'string' } },
    },
  },
};

app.post('/api/admin/translate-bio', async (c) => {
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  let body: { hebrewBio?: string; nameHe?: string; nameEn?: string };
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'invalid JSON body' }, 400); }
  const hebrewBio = (body.hebrewBio ?? '').trim();
  const nameHe = (body.nameHe ?? '').trim();
  if (!hebrewBio) return c.json({ error: 'hebrewBio is required' }, 400);
  if (!nameHe) return c.json({ error: 'nameHe is required' }, 400);

  const userContent = [
    `Hebrew name: ${nameHe}`,
    body.nameEn ? `Existing English name (hint only): ${body.nameEn}` : null,
    '',
    'Hebrew passage:',
    hebrewBio.slice(0, 6000),
  ].filter(Boolean).join('\n');

  const t0 = Date.now();
  try {
    const resp = await c.env.AI.run('@cf/moonshotai/kimi-k2.6' as never, {
      messages: [
        { role: 'system', content: TRANSLATE_BIO_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 16000,
      temperature: 0.1,
      chat_template_kwargs: { enable_thinking: true },
      response_format: { type: 'json_schema', json_schema: TRANSLATE_BIO_JSON_SCHEMA },
    } as never);
    const payload = extractJsonPayload(resp);
    if (!payload) return c.json({ error: 'empty payload' }, 502);
    let parsed: unknown;
    try { parsed = JSON.parse(payload); }
    catch (err) { return c.json({ error: `non-JSON: ${String(err).slice(0, 200)}`, raw: payload.slice(0, 500) }, 502); }
    if (!validateTranslatedBio(parsed)) return c.json({ error: 'schema mismatch', got: parsed }, 502);
    return c.json({ ...parsed, _ms: Date.now() - t0 });
  } catch (err) {
    return c.json({ error: String(err).slice(0, 300) }, 502);
  }
});

const YOMI_WARM_CRON = '0 3 * * *';

export default {
  fetch: (req: Request, env: Bindings, ctx: ExecutionContext) => app.fetch(req, env, ctx),
  scheduled: (controller: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    if (controller.cron === YOMI_WARM_CRON) {
      ctx.waitUntil(runYomiWarmCron());
    } else {
      ctx.waitUntil(runWarmCron(env));
    }
  },
} satisfies ExportedHandler<Bindings>;
