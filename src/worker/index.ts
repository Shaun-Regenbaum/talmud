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
  getSaCommentaryCached,
  getDafTopicsCached,
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
import { classifyDaf } from '../lib/era/heuristic';
import { extractTalmudContent } from '../lib/sefref/alignment';
import type { SegmentEra, DafEraContext, EraSignalSource } from '../lib/era/types';
import {
  type EntityType,
  type Entity,
  type EnrichedEntity,
  STRATEGIES,
  DEFAULT_STRATEGY,
  CACHE_TTL_S,
  isEntityType,
  isValidStrategy,
  identifyCacheKey,
  enrichCacheKey,
  makeRabbiId,
  makeIndexId,
  makeEraId,
  makeMesorahId,
  parseEntityId,
} from './entity-types';
import {
  RABBI_ENRICH_SYSTEM_PROMPT,
  buildRabbiEnrichUserMessage,
  type LocalRabbiInput,
  type SefariaInput,
} from '../lib/rabbi/prompt';
import {
  SCHEMA_VERSION as RABBI_SCHEMA_VERSION,
  validateLLMRabbiOutput,
  type EnrichedRabbi as EnrichedRabbiRecord,
  type LLMRabbiOutput,
} from '../lib/rabbi/types';
import { wrapEnv, gatewayStatus, gatewayActive } from './ai-gateway';

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
  bioSource?: 'sefaria' | 'wikipedia' | null;
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
  HALACHA_ENRICH?: Workflow;
  ARGUMENT_ENRICH?: Workflow;
  AGGADATA_ENRICH?: Workflow;
  PESUKIM_ENRICH?: Workflow;
  // AI Gateway routing (see src/worker/ai-gateway.ts).
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_DISABLE?: string;
}

function stripHtmlServer(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Used by /api/pasuk: Sefaria's Tanakh text comes with HTML entities (thinsp,
// nbsp), masoretic paragraph markers ({פ}, {ס}, {ש}), and occasional <br>
// tags inside the Hebrew. We decode the entities, drop the editorial marks,
// and collapse whitespace so the sidebar renders clean nikud-bearing text.
function cleanVerseText(s: string): string {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&thinsp;/gi, ' ')
    .replace(/&ensp;/gi, ' ')
    .replace(/&emsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\{[פסש]\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/health', (c) => c.json({ ok: true }));

// AI Gateway smoke test. Reports gateway config + routes a tiny Kimi prompt
// through whichever path is active (gateway when configured, else binding).
// Append ?run=1 to actually invoke; bare GET just shows status. env.AI here
// is already the proxied version when the gateway is active, so this hits
// the same code path as every other AI call in the worker.
app.get('/api/admin/ai-gateway-test', async (c) => {
  const status = gatewayStatus(c.env);
  if (c.req.query('run') !== '1') return c.json({ status, hint: 'append ?run=1 to invoke' });
  if (!c.env.AI) return c.json({ status, error: 'AI binding not available' }, 503);
  const model = c.req.query('model') || '@cf/moonshotai/kimi-k2.5';
  const nonce = c.req.query('nonce') || '';
  const t0 = Date.now();
  try {
    const result = (await c.env.AI.run(model as never, {
      messages: [
        { role: 'system', content: 'Reply with the single word OK and nothing else.' },
        { role: 'user', content: `Ping${nonce ? ' ' + nonce : ''}.` },
      ],
      max_tokens: 16,
      temperature: 0,
    } as never)) as { response?: string };
    return c.json({
      status,
      route: gatewayActive(c.env) ? 'gateway' : 'binding',
      ms: Date.now() - t0,
      reply: result?.response ?? result,
    });
  } catch (err) {
    return c.json(
      {
        status,
        route: gatewayActive(c.env) ? 'gateway' : 'binding',
        ms: Date.now() - t0,
        error: String((err as Error)?.message ?? err),
      },
      500,
    );
  }
});

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
  | 'aggadata'
  | 'pesukim';

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
  const endpoints: TelemetryEndpoint[] = ['daf-context', 'daf-context-stage2', 'translate', 'analyze', 'halacha', 'aggadata', 'pesukim'];
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
    { id: '@cf/moonshotai/kimi-k2.5',      label: 'kimi-k2.5', kimi: true },
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
      if (m.kimi) params.chat_template_kwargs = { enable_thinking: false };
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
    startSegIdx?: number;
    endSegIdx?: number;
    rabbiNames: string[];
  }>;
}

// Style rule appended to every English-summary-producing prompt. The client
// runs hebraize() over rendered text — bare transliterations stay as ASCII,
// but parenthesized transliterations get auto-swapped for Hebrew script. So
// we want the LLM to use a uniform `english (transliteration)` pattern, not
// bare transliterations or English-only without the Hebrew anchor.
const HEBRAIZE_RULE = `

STYLE — Hebrew/Aramaic technical terms:
When you mention a Hebrew or Aramaic technical term in English text, ALWAYS write it as: english phrase (transliteration). The transliteration in parentheses is auto-converted to Hebrew script in the UI. Examples:
  - "the rabbinic fence (geder)"
  - "the dawn deadline (amud ha-shachar)"
  - "the first watch (ha-ashmurah ha-rishonah)"
  - "an act (ma'aseh)"
  - "the dispute hinges on designation (yi'ud)"
Use Sefaria-style transliteration: write "ch" not "ḥ", "h" not "ḥ", "kh" not "ḵ", "tz" not "ṣ", and a plain ASCII apostrophe (') instead of "ʿ" or "ʾ". Avoid combining diacritic marks entirely.
Do NOT emit BARE transliterations (without parens, without an English gloss before them) — every transliterated term must be preceded by the English phrase that explains it. Quoted/citational Hebrew text taken verbatim from the daf MAY appear in Hebrew script directly.`;

const SKELETON_SYSTEM_PROMPT = `You are a scholar of Talmud. Given a single focal amud's Hebrew/Aramaic source split into NUMBERED segments and its English translation (same numbering), identify the argument structure. Each section MUST report the segment range it spans. Output STRICT JSON only (no markdown, no prose):

{
  "summary": "1-2 sentence overview of what this daf argues",
  "sections": [
    {
      "title": "Short descriptive title (e.g. 'Opening Mishnah', 'Gemara's first question')",
      "summary": "2-3 sentence description of what this section argues",
      "excerpt": "3-5 Hebrew/Aramaic words copied verbatim from the focal Hebrew — opens this section",
      "startSegIdx": 0-based segment index where this section BEGINS (matches a [N] marker in the source),
      "endSegIdx": 0-based segment index where this section ENDS (inclusive). For a one-segment section, startSegIdx === endSegIdx.,
      "rabbiNames": ["list of every voice in this section, in order"]
    }
  ]
}

Break the focal amud into 3-8 sections by argument structure, not by paragraph. Sections should partition the daf — start of section i+1 should be endSegIdx of section i + 1, with no gaps and no overlaps.

GRANULARITY: rabbiNames must enumerate EVERY distinct voice, not just named rabbi statements. Include:
- Named rabbis: "Rabbi Eliezer", "Rav Huna", etc.
- Collective voices: "Sages", "Tanna Kamma"
- Every Stam/Gemara move: "Gemara's question", "First answer", "Second answer", "Alternative answer", "Objection", "Rejoinder", "Prooftext"
- When the Gemara offers multiple answers to the same question, each answer is its own entry.

"excerpt" MUST be Hebrew/Aramaic copied exactly from the source — never translate.
"startSegIdx"/"endSegIdx" MUST be valid indices from the numbered source — the bracketed [N] markers ARE those indices.

Rashi and Tosafot may be provided as context, wrapped in <rashi>/<tosafot> tags. Use them ONLY to disambiguate sugya boundaries, rabbinic abbreviations, and which voices are arguing with which. Sections, excerpts, and segment indices MUST come from the focal Hebrew text — never invent a section that exists only in commentary.${HEBRAIZE_RULE}`;

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
- Every rabbi/voice you list MUST have an opinionStart unless the text does not distinctly anchor their position.${HEBRAIZE_RULE}`;

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

/** Tighter caps for first-pass detection (halacha + argument skeleton). Detection
 *  runs on shorter focal text and must stay fast; we give the model enough
 *  Rashi/Tosafot to disambiguate sugyot without ballooning latency. */
const DETECT_CAPS = {
  rashi: 4000,
  tosafot: 4000,
  halachaPerRef: 1000,
  halachaRefsPerBook: 2,
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

function halachaBlock(
  bundle: HalachicRefBundle,
  caps: { perRef: number; refsPerBook: number } = {
    perRef: ANALYZE_CAPS.halachaPerRef,
    refsPerBook: ANALYZE_CAPS.halachaRefsPerBook,
  },
): string {
  const books = Object.entries(bundle);
  if (books.length === 0) return '';
  const parts = books.map(([book, snips]) => {
    const refBlocks = snips.slice(0, caps.refsPerBook).map(s => {
      const he = slice(s.hebrew, caps.perRef);
      const en = slice(s.english, caps.perRef);
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
  const cacheKey = `analyze:v6:${tractate}:${page}`;
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
  const model = { id: '@cf/moonshotai/kimi-k2.5', maxTokens: 131072, label: 'kimi-k2.5' };
  const skeletonCacheKey = `analyze-skel:v2:${tractate}:${page}`;

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
    // v2 skeleton: feed Sefaria-segmented [N]-numbered text so the model can
    // emit explicit startSegIdx/endSegIdx per section. Stage B is unchanged
    // and still receives the rich amudBlock context.
    const sefSegs = await getSefariaSegmentsCached(cache, tractate, page);
    const segsHe = (sefSegs?.he ?? []).map(stripHtmlServer);
    const segsEn = (sefSegs?.en ?? []).map(stripHtmlServer);
    const numberedHe = segsHe.map((s: string, i: number) => `[${i}] ${s}`).join('\n').slice(0, ANALYZE_CAPS.focalHebrew);
    const numberedEn = segsEn.map((s: string, i: number) => `[${i}] ${s}`).join('\n').slice(0, ANALYZE_CAPS.focalEnglish);
    const rashiSliced = slice(sefFocal?.rashi?.hebrew ?? '', DETECT_CAPS.rashi);
    const tosafotSliced = slice(sefFocal?.tosafot?.hebrew ?? '', DETECT_CAPS.tosafot);
    const skeletonUserParts: string[] = [
      `Tractate: ${tractate}`,
      `Focal page: ${page}`,
      `Total segments: ${segsHe.length}`,
      '',
      'Hebrew/Aramaic source — each line begins with [N], the 0-based segment index. USE these indices for startSegIdx / endSegIdx:',
      numberedHe || '(unavailable)',
      '',
      'English translation (same numbering):',
      numberedEn || '(unavailable)',
    ];
    if (rashiSliced) {
      skeletonUserParts.push('', 'Rashi on the focal amud (context only — sections must come from the focal Hebrew, not Rashi):', `<rashi>${rashiSliced}</rashi>`);
    }
    if (tosafotSliced) {
      skeletonUserParts.push('', 'Tosafot on the focal amud (context only — sections must come from the focal Hebrew, not Tosafot):', `<tosafot>${tosafotSliced}</tosafot>`);
    }
    skeletonUserParts.push('', 'Identify the argument structure. Return ONLY the skeleton JSON. Every section MUST include startSegIdx and endSegIdx pointing at valid [N] indices above.');
    const skeletonUser = skeletonUserParts.join('\n\n');

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
      _pipeline: 'skeleton(k2.5)+enrichment(k2.5-no-thinking)',
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
  | 'difficulty'
  | 'commentaries'
  | 'bigger-picture'
  | 'background'
  | 'synthesize';

const STRATEGY_NAMES: EnrichmentStrategyName[] = [
  'baseline', 'per-section', 'hybrid', 'rich-rabbi', 'references', 'parallels', 'difficulty',
  'commentaries', 'bigger-picture', 'background', 'synthesize',
];

/** Strategies that don't have a daf-level analyzer; we fan out to
 *  enrichArgumentSection per skeleton section instead. */
const PER_SECTION_ARGUMENT_STRATEGIES: ReadonlySet<EnrichmentStrategyName> = new Set([
  'commentaries', 'bigger-picture', 'background', 'synthesize',
]);

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

  // Daf-level enrichment cache. Each strategy is a separate key so they
  // can be invalidated independently. Used by EnrichmentPage's preload.
  // Synthesize takes an additional `?include=` param (sorted, comma-joined
  // strategy names) so different toggle combinations cache independently.
  const includeRaw = c.req.query('include') ?? '';
  const includeNorm = includeRaw
    ? includeRaw.split(',').map((s) => s.trim()).filter(Boolean).sort().join(',')
    : '';
  const enrichCacheKey = strategy === 'synthesize' && includeNorm
    ? `enrich-arg:v1:synthesize:i=${includeNorm}:${tractate}:${page}`
    : `enrich-arg:v1:${strategy}:${tractate}:${page}`;
  const refresh = c.req.query('refresh') === '1';
  if (cache && !refresh) {
    const hit = await cache.get(enrichCacheKey);
    if (hit) return c.json({ ...JSON.parse(hit), _cached: true });
  }

  // Require cached skeleton — user must skeleton_only=1 first via /api/analyze.
  const skelRaw = cache ? await cache.get(`analyze-skel:v2:${tractate}:${page}`) : null;
  if (!skelRaw) return c.json({ error: 'No cached skeleton; run /api/analyze/.../?skeleton_only=1 first' }, 404);
  let skeleton: DafSkeleton;
  try { skeleton = JSON.parse(skelRaw) as DafSkeleton; }
  catch { return c.json({ error: 'Cached skeleton is not valid JSON' }, 502); }

  // Per-section strategies — fan out to enrichArgumentSection over every
  // skeleton section, then return a section-keyed analysis matching the daf-
  // level shape so the client merger can fold it into the unified view.
  if (PER_SECTION_ARGUMENT_STRATEGIES.has(strategy)) {
    const t0 = Date.now();
    const includeOverride = strategy === 'synthesize' && includeNorm
      ? includeNorm.split(',')
      : undefined;
    const results = await Promise.all(
      skeleton.sections.map(async (_, idx) => {
        try {
          const data = await enrichArgumentSection(c, tractate, page, idx, strategy, includeOverride);
          return { idx, data, error: null as string | null };
        } catch (err) {
          return { idx, data: null as unknown, error: String(err).slice(0, 200) };
        }
      }),
    );
    const sections = skeleton.sections.map((sec, idx) => {
      const r = results[idx];
      const out: Record<string, unknown> = { ...sec };
      if (strategy === 'synthesize')      out.synthesize    = r.data;
      else if (strategy === 'commentaries')   out.commentaries  = r.data;
      else if (strategy === 'bigger-picture') out.biggerPicture = r.data;
      else if (strategy === 'background')     out.background    = r.data;
      return out;
    });
    const warnings = results.filter((r) => r.error).map((r) => `section ${r.idx}: ${r.error}`);
    const out = {
      summary: skeleton.summary,
      sections,
      _strategy: strategy,
      _elapsed_ms: Date.now() - t0,
      _calls: results.length,
      _warnings: warnings,
      _skeletonSummary: skeleton.summary,
    };
    // Await cache write — synthesize calls fired immediately after this need
    // to read the data, and waitUntil is fire-and-forget which races them.
    if (cache) {
      await cache.put(enrichCacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
    }
    return c.json(out);
  }

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
    const out = {
      ...result.analysis,
      _strategy: strategy,
      _elapsed_ms: result.elapsed_ms,
      _calls: result.calls,
      _warnings: result.warnings,
      _metadata: result.strategy_metadata,
      _skeletonSummary: skeleton.summary,
    };
    if (cache) {
      // Await cache write — downstream synthesize calls depend on it.
      await cache.put(enrichCacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
    }
    return c.json(out);
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
  const cached = await cache.get(`analyze:v6:${tractate}:${page}`);
  if (!cached) return c.json({ error: 'no ground truth cached for this daf' }, 404);
  try {
    const parsed = JSON.parse(cached) as DafAnalysis;
    return c.json(parsed);
  } catch {
    return c.json({ error: 'cached ground truth is not valid JSON' }, 502);
  }
});

// ============================================================================
// HALACHA + AGGADATA ENRICHMENTS — used by /#enrichment page
// ============================================================================

interface ModernAuthority {
  source: string;   // Display label, e.g. "Mishna Berurah 235:1" or "Peninei Halakhah, Prayer 16:10"
  ref?: string;     // Optional Sefaria ref
  summary: string;  // 1-2 sentence summary of this authority's position
}

interface HistoricalContext {
  era: string;
  context: string;
}

const HALACHA_MODERN_AUTHORITIES_PROMPT = `You are a scholar of Jewish law (halacha). You will receive:
- Existing halachic topics for this daf (with Mishneh Torah / Shulchan Aruch / Rema refs already filled in by a previous pass)
- The focal daf's Hebrew + English
- A halachic_codification bundle from Sefaria, in XML tags. This contains ACTUAL TEXT of halachic works that Sefaria has linked to this daf — typically includes Peninei Halakhah, Tur, Sefer HaChinukh, Halakhot Gedolot, Ohr Zarua, Sefer Yereim, Sefer Mitzvot Gadol, etc. Each <ref id="..."> is the canonical Sefaria reference.

**HARD RULE — use ONLY sources whose text appears in the halachic_codification bundle.** Do not cite Mishnah Berurah, Aruch HaShulchan, Igrot Moshe, Yabia Omer, or any other authority unless its text is actually in the bundle below. If the bundle doesn't include it, omit it. Made-up refs are worse than no refs.

For each topic:
- Match it to relevant passages in the halachic_codification bundle
- For each matching source, distill what that authority says about THIS topic into ONE sentence IN ENGLISH (don't echo Hebrew back — summarize)
- Skip topics that have no matches in the bundle

For each authority entry output:
- source: display label using the book's name + its ref (e.g. "Peninei Halakhah, Prayer 2:11", "Tur, Orach Chayim 58")
- ref: the exact Sefaria ref as it appears in the <ref id="..."> attribute in the bundle
- summary: ONE sentence explaining what the authority rules on this topic, in your own English words. Focus on what's NEW or DIFFERENT from the Shulchan Aruch already listed.

Output STRICT JSON only:
{"topics": [{"topic": "topic name from input", "modernAuthorities": [{"source": "...", "ref": "...", "summary": "..."}]}]}

Match topics by the "topic" field (case-insensitive). Topics with no matches in the bundle should have an empty modernAuthorities array.`;

interface RishonNote {
  rishon: string;   // Display name: Rashba / Ritva / Ramban / Meiri / Rosh / Maharsha / Chidushei Aggadot
  note: string;     // One sentence distilling this Rishon's position on THIS topic
  ref?: string;     // Optional Sefaria ref to the Rishon's commentary
}

const HALACHA_RISHONIM_CONDENSED_PROMPT = `You are a scholar of Talmud and halacha. You will receive:
- A list of halachic topics identified on this daf (topic, excerpt, existing Rambam / Shulchan Aruch / Rema rulings)
- The bundled Rishonim commentary on this daf (Rashba, Ritva, Ramban, Meiri, Rosh, Maharsha, Chidushei Aggadot) — provided verbatim in the input

For each topic, identify which of the available Rishonim addressed that specific halachic issue substantively, and distill each to a ONE-sentence summary of their position. Be specific: capture what each Rishon actually argues (a hiddush, a distinction, a chiluk, a different reading of the Gemara). Do NOT write generic "so-and-so discusses this topic" — write the actual claim.

Skip Rishonim who didn't discuss a given topic. Don't invent commentary that isn't in the bundled text. If a Rishon mentions the topic only in passing without a distinct position, also skip.

NOTE: this prompt continues below with the output schema and has a sibling SA-COMMENTARY prompt declared separately.

Output STRICT JSON only:
{"topics": [{"topic": "topic name from input", "rishonimNotes": [{"rishon": "Rashba", "note": "One-sentence summary.", "ref": "Chiddushei HaRashba on Berakhot 5a"}]}]}

Use the exact Rishon display names: Rashba, Ritva, Ramban, Meiri, Rosh, Maharsha, Chidushei Aggadot. Topics with no Rishonim commentary should have an empty rishonimNotes array. Match topics by the "topic" field from input (case-insensitive).`;

// ---- SA-commentary walk strategy -------------------------------------------
// For each halacha topic that has a Shulchan Aruch ref, walk the commentary
// chain on that SA ref (Mishnah Berurah, Biur Halakhah, Magen Avraham, Taz,
// Shach, Arukh HaShulchan, Kaf HaChaim, etc.) and pass the actual Sefaria
// text to Kimi K2.5 to distill per-topic per-commentator.

interface SaCommentaryNote {
  commentator: string;  // e.g. "Mishnah Berurah", "Magen Avraham", "Kaf HaChaim"
  note: string;         // One-sentence English distillation of this commentator's position on THIS topic
  ref?: string;         // Sefaria ref
}

const HALACHA_SA_COMMENTARY_PROMPT = `You are a scholar of Jewish law (halacha). You will receive:
- Halachic topics for this daf (with Mishneh Torah / Shulchan Aruch / Rema refs already filled in)
- The focal daf's Hebrew + English
- For EACH topic that had a Shulchan Aruch ref, a <sa_commentary_for_topic topic="..." sa_ref="..."> block containing ACTUAL TEXT from Sefaria of the post-medieval commentators on that SA ref: Mishnah Berurah, Biur Halakhah, Sha'ar HaTziyun, Beit Yosef, Magen Avraham, Turei Zahav (Taz), Siftei Kohen (Shach), Ba'er Heitev, Arukh HaShulchan, Kaf HaChaim, Chayei Adam, Chochmat Adam, Kitzur Shulchan Arukh, Pri Megadim, etc.

**HARD RULE — only cite commentators whose text appears in the corresponding <sa_commentary_for_topic> block for that topic.** Do not cross-assign between topics. Do not invent refs.

For each topic, for each commentator whose text is provided:
- Distill their position on THIS topic into ONE sentence IN ENGLISH
- Focus on what the commentator ADDS beyond the plain Shulchan Aruch — a chiddush, chiluk, practical nuance, or ruling on an ambiguity
- If a commentator's text just echoes the SA with no new insight, skip them

Output STRICT JSON only:
{"topics": [{"topic": "topic name from input", "saCommentaryNotes": [{"commentator": "Mishnah Berurah", "note": "...", "ref": "Mishnah Berurah 235:1"}]}]}

Use the exact commentator display name. Topics with no SA commentary should have an empty array. Match topics case-insensitively.`;

/** Assemble the per-topic SA-commentary XML blocks by walking each topic's
 *  Shulchan Aruch ref via Sefaria. Cached per SA ref (not per daf) so
 *  commentary fetched for one daf is reused on every daf that references
 *  the same siman. */
async function buildSaCommentaryBlocks(
  cache: KVNamespace | undefined,
  topics: HalachaTopic[],
): Promise<{ xmlBlocks: string[]; totalBundles: number; commentators: Set<string> }> {
  const xmlBlocks: string[] = [];
  const commentators = new Set<string>();
  let totalBundles = 0;
  for (const t of topics) {
    const saRef = t.rulings.shulchanAruch?.ref;
    if (!saRef) continue;
    const bundle = await getSaCommentaryCached(cache, saRef);
    if (Object.keys(bundle).length === 0) continue;
    totalBundles++;
    const parts: string[] = [];
    for (const [book, snip] of Object.entries(bundle)) {
      commentators.add(book);
      const en = slice(snip.english, 5000);
      const he = slice(snip.hebrew, 5000);
      const body = [
        en && `<english>${en}</english>`,
        he && `<hebrew>${he}</hebrew>`,
      ].filter(Boolean).join('\n');
      parts.push(`<commentator name="${book}" ref="${snip.ref}">\n${body}\n</commentator>`);
    }
    const safeTopic = t.topic.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    xmlBlocks.push(`<sa_commentary_for_topic topic="${safeTopic}" sa_ref="${saRef}">\n${parts.join('\n')}\n</sa_commentary_for_topic>`);
  }
  return { xmlBlocks, totalBundles, commentators };
}

const HALACHA_SYNTHESIZE_PROMPT = `You write the GIST of one halachic topic — the one-glance synthesis the reader sees on the topic card. Rewrite the topic gist using the rulings (Rambam MT, Shulchan Aruch, Rema), Rishonim, SA-commentary, and modern authorities as authoritative context: each one tightens the picture of how the halacha actually flows. Do NOT recap each enrichment — fold them into one tight paragraph.

**HARD CAPS:**
- 2-3 sentences. Maximum 480 characters total.
- Lead with the practical halachic upshot in modern terms.
- Then ONE sentence that captures the dispute axis (where Rishonim or commentators disagree, if applicable).
- No commentator name-drops by themselves — name a commentator only when the dispute hinges on them.

Output STRICT JSON only:

{ "topics": [{ "topic": "<exact topic name>", "synthesis": { "explanation": "the gist", "groundedIn": ["rulings","rishonim","sa-commentary","modern-authorities"] } }] }

groundedIn lists ONLY slices actually supplied. Match topics by name (case-insensitive).`;

app.post('/api/enrich-halacha/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const strategy = c.req.query('strategy') || 'modern-authorities';
  if (strategy !== 'modern-authorities' && strategy !== 'rishonim-condensed' && strategy !== 'sa-commentary-walk' && strategy !== 'synthesize') {
    return c.json({ error: `unknown strategy '${strategy}'; valid: modern-authorities|rishonim-condensed|sa-commentary-walk|synthesize` }, 400);
  }
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  const cache = c.env.CACHE;
  // Synthesize takes `?include=` so different toggle combos cache separately.
  const includeRaw = c.req.query('include') ?? '';
  const includeNorm = includeRaw
    ? includeRaw.split(',').map((s) => s.trim()).filter(Boolean).sort().join(',')
    : '';
  const enrichCacheKey = strategy === 'synthesize' && includeNorm
    ? `enrich-halacha:v1:synthesize:i=${includeNorm}:${tractate}:${page}`
    : `enrich-halacha:v1:${strategy}:${tractate}:${page}`;
  const bypassCache = c.req.query('refresh') === '1';

  // Read-through cache: return prior result if we have one.
  if (cache && !bypassCache) {
    const cached = await cache.get(enrichCacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return c.json({ ...parsed, _cached: true });
      } catch { /* corrupted, fall through to regen */ }
    }
  }

  const halRaw = cache ? await cache.get(`halacha:v6:${tractate}:${page}`) : null;
  if (!halRaw) return c.json({ error: 'No cached /api/halacha output; run /api/halacha first.' }, 404);
  let halacha: HalachaResult;
  try { halacha = JSON.parse(halRaw) as HalachaResult; }
  catch { return c.json({ error: 'Cached halacha is not valid JSON' }, 502); }

  // Synthesize branch: fold the existing structured enrichments back into a
  // per-topic synthesis paragraph. Reads other strategies' caches as input,
  // filtered by `?include=` if supplied.
  if (strategy === 'synthesize') {
    const t0 = Date.now();
    const includeSet = new Set(includeNorm ? includeNorm.split(',') : []);
    const want = (s: string) => includeSet.size === 0 || includeSet.has(s);
    const readEnrich = async (s: string): Promise<HalachaResult | null> => {
      if (!cache) return null;
      const hit = await cache.get(`enrich-halacha:v1:${s}:${tractate}:${page}`);
      if (!hit) return null;
      try { return JSON.parse(hit) as HalachaResult; } catch { return null; }
    };
    const [modernRes, rishonimRes, saRes] = await Promise.all([
      want('modern-authorities')  ? readEnrich('modern-authorities')  : Promise.resolve(null),
      want('rishonim-condensed')  ? readEnrich('rishonim-condensed')  : Promise.resolve(null),
      want('sa-commentary-walk')  ? readEnrich('sa-commentary-walk')  : Promise.resolve(null),
    ]);
    // Build the input — for each topic, list whatever's been enriched.
    const topicBlocks = halacha.topics.map((t) => {
      const slices: Record<string, unknown> = { topic: t.topic, rulings: t.rulings };
      const m = modernRes?.topics.find((x) => x.topic.toLowerCase() === t.topic.toLowerCase());
      const r = rishonimRes?.topics.find((x) => x.topic.toLowerCase() === t.topic.toLowerCase());
      const s = saRes?.topics.find((x) => x.topic.toLowerCase() === t.topic.toLowerCase());
      if (m?.modernAuthorities)  slices.modernAuthorities  = m.modernAuthorities;
      if (r?.rishonimNotes)      slices.rishonimNotes      = r.rishonimNotes;
      if (s?.saCommentaryNotes)  slices.saCommentaryNotes  = s.saCommentaryNotes;
      return slices;
    });
    const userContent = [
      `Tractate: ${tractate}`,
      `Focal page: ${page}`,
      '',
      `<topics_with_enrichments>\n${JSON.stringify(topicBlocks, null, 2)}\n</topics_with_enrichments>`,
      '',
      'Synthesize each topic.',
    ].join('\n');
    let parsed: { topics?: Array<{ topic: string; synthesis?: { explanation: string; groundedIn?: string[] } }> } = {};
    try {
      const s = await runKimiStreaming(
        c.env.AI, '@cf/moonshotai/kimi-k2.5',
        [
          { role: 'system', content: HALACHA_SYNTHESIZE_PROMPT },
          { role: 'user', content: userContent },
        ],
        8000,
        { chatTemplateKwargs: { enable_thinking: false } },
      );
      let payload = s.content.trim();
      const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) payload = fenced[1].trim();
      parsed = JSON.parse(payload);
    } catch (err) {
      return c.json({ error: `synthesize: ${String(err).slice(0, 200)}` }, 502);
    }
    const bySynth = new Map<string, { explanation: string; groundedIn?: string[] }>();
    for (const t of parsed.topics ?? []) {
      if (t.synthesis?.explanation) bySynth.set(t.topic.toLowerCase(), t.synthesis);
    }
    const enrichedTopics = halacha.topics.map((t) => ({
      ...t,
      synthesis: bySynth.get(t.topic.toLowerCase()),
    }));
    const out = {
      topics: enrichedTopics,
      _strategy: 'synthesize',
      _elapsed_ms: Date.now() - t0,
    };
    if (cache) await cache.put(enrichCacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
    return c.json(out);
  }

  // Both strategies benefit from real Sefaria sources:
  //   - modern-authorities: needs halacha refs bundle (Peninei Halakhah, Tur,
  //     Sefer HaChinukh, Ohr Zarua, etc. — the actual text Sefaria has linked
  //     to this daf).
  //   - rishonim-condensed: needs the Rishonim bundle (Rashba, Ritva, Ramban,
  //     Meiri, Rosh, Maharsha, Chidushei Aggadot).
  const needsRishonim = strategy === 'rishonim-condensed';
  const needsHalachaRefs = strategy === 'modern-authorities';
  const needsSaCommentary = strategy === 'sa-commentary-walk';
  const [hbFocal, sefFocal, rishonim, halachaRefs, saCommentary] = await Promise.all([
    getHebrewBooksDafCached(cache, tractate, page),
    getSefariaPageCached(cache, tractate, page),
    needsRishonim ? getRishonimCached(cache, tractate, page) : Promise.resolve({} as RishonimBundle),
    needsHalachaRefs ? getHalachaRefsCached(cache, tractate, page) : Promise.resolve({} as HalachicRefBundle),
    needsSaCommentary ? buildSaCommentaryBlocks(cache, halacha.topics) : Promise.resolve({ xmlBlocks: [] as string[], totalBundles: 0, commentators: new Set<string>() }),
  ]);
  const focalHebrew = slice(hbFocal?.main ?? sefFocal?.mainText.hebrew ?? '', ANALYZE_CAPS.focalHebrew);
  const focalEnglish = slice(sefFocal?.mainText.english ?? '', ANALYZE_CAPS.focalEnglish);

  const rishonimXml = needsRishonim ? rishonimBlock(rishonim) : '';
  const halachaXml = needsHalachaRefs ? halachaBlock(halachaRefs) : '';

  if (needsRishonim && !rishonimXml) {
    return c.json({
      topics: halacha.topics.map(t => ({ ...t, rishonimNotes: [] })),
      _strategy: strategy,
      _elapsed_ms: 0,
      _metadata: { note: 'no Rishonim available for this daf on Sefaria' },
    });
  }
  if (needsHalachaRefs && !halachaXml) {
    return c.json({
      topics: halacha.topics.map(t => ({ ...t, modernAuthorities: [] })),
      _strategy: strategy,
      _elapsed_ms: 0,
      _metadata: { note: 'no post-medieval halachic sources linked to this daf on Sefaria' },
    });
  }
  if (needsSaCommentary && saCommentary.xmlBlocks.length === 0) {
    return c.json({
      topics: halacha.topics.map(t => ({ ...t, saCommentaryNotes: [] })),
      _strategy: strategy,
      _elapsed_ms: 0,
      _metadata: { note: 'no SA-commentary found for any topic on this daf' },
    });
  }

  const systemPrompt = strategy === 'modern-authorities'
    ? HALACHA_MODERN_AUTHORITIES_PROMPT
    : strategy === 'rishonim-condensed'
      ? HALACHA_RISHONIM_CONDENSED_PROMPT
      : HALACHA_SA_COMMENTARY_PROMPT;

  const blocks: string[] = [
    `<existing_halacha>\n${JSON.stringify(halacha, null, 2)}\n</existing_halacha>`,
    `<focal_hebrew>${focalHebrew}</focal_hebrew>`,
    `<focal_english>${focalEnglish}</focal_english>`,
  ];
  if (rishonimXml) blocks.push(rishonimXml);
  if (halachaXml) blocks.push(halachaXml);
  if (needsSaCommentary) blocks.push(...saCommentary.xmlBlocks);

  const closer =
    strategy === 'modern-authorities' ? 'Add 2-5 post-medieval authorities per topic. Return JSON per schema.'
      : strategy === 'rishonim-condensed' ? 'Distill each Rishon to one sentence per topic. Return JSON per schema.'
      : 'Distill each Acharon (SA-commentator) to one sentence per topic. Return JSON per schema.';

  const userContent = [
    `Tractate: ${tractate}`,
    `Focal page: ${page}`,
    '',
    ...blocks,
    '',
    closer,
  ].join('\n\n');

  const t0 = Date.now();
  try {
    const s = await runKimiStreaming(
      c.env.AI, '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      16000,
      { chatTemplateKwargs: { enable_thinking: false } },
    );
    let payload = s.content.trim();
    const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) payload = fenced[1].trim();

    if (strategy === 'modern-authorities') {
      let authoritiesByTopic: Record<string, ModernAuthority[]> = {};
      try {
        const parsed = JSON.parse(payload) as { topics?: Array<{ topic: string; modernAuthorities?: ModernAuthority[] }> };
        if (Array.isArray(parsed.topics)) {
          for (const t of parsed.topics) {
            if (t.topic && Array.isArray(t.modernAuthorities)) {
              authoritiesByTopic[t.topic.toLowerCase()] = t.modernAuthorities;
            }
          }
        }
      } catch {
        return c.json({ error: 'Halacha enrichment returned non-JSON', detail: payload.slice(0, 300) }, 502);
      }

      const enrichedTopics = halacha.topics.map(t => ({
        ...t,
        modernAuthorities: authoritiesByTopic[t.topic.toLowerCase()] ?? [],
      }));
      const totalAuth = Object.values(authoritiesByTopic).reduce((sum, arr) => sum + arr.length, 0);

      const _out_1 = {
        topics: enrichedTopics,
        _strategy: strategy,
        _elapsed_ms: Date.now() - t0,
        _metadata: {
          model: 'kimi-k2.5-no-thinking',
          total_topics: halacha.topics.length,
          topics_with_authorities: Object.values(authoritiesByTopic).filter(arr => arr.length > 0).length,
          total_authorities: totalAuth,
        },
      };
      if (cache) await cache.put(enrichCacheKey, JSON.stringify(_out_1), { expirationTtl: 60 * 60 * 24 * 365 });
      return c.json(_out_1);
    }

    if (strategy === 'rishonim-condensed') {
      let notesByTopic: Record<string, RishonNote[]> = {};
      try {
        const parsed = JSON.parse(payload) as { topics?: Array<{ topic: string; rishonimNotes?: RishonNote[] }> };
        if (Array.isArray(parsed.topics)) {
          for (const t of parsed.topics) {
            if (t.topic && Array.isArray(t.rishonimNotes)) {
              notesByTopic[t.topic.toLowerCase()] = t.rishonimNotes;
            }
          }
        }
      } catch {
        return c.json({ error: 'Halacha enrichment returned non-JSON', detail: payload.slice(0, 300) }, 502);
      }
      const enrichedTopics = halacha.topics.map(t => ({
        ...t,
        rishonimNotes: notesByTopic[t.topic.toLowerCase()] ?? [],
      }));
      const totalNotes = Object.values(notesByTopic).reduce((sum, arr) => sum + arr.length, 0);
      const _out_2 = {
        topics: enrichedTopics,
        _strategy: strategy,
        _elapsed_ms: Date.now() - t0,
        _metadata: {
          model: 'kimi-k2.5-no-thinking',
          total_topics: halacha.topics.length,
          topics_with_notes: Object.values(notesByTopic).filter(arr => arr.length > 0).length,
          total_notes: totalNotes,
          rishonim_available: Object.keys(rishonim),
        },
      };
      if (cache) await cache.put(enrichCacheKey, JSON.stringify(_out_2), { expirationTtl: 60 * 60 * 24 * 365 });
      return c.json(_out_2);
    }

    // strategy === 'sa-commentary-walk'
    let saNotesByTopic: Record<string, SaCommentaryNote[]> = {};
    try {
      const parsed = JSON.parse(payload) as { topics?: Array<{ topic: string; saCommentaryNotes?: SaCommentaryNote[] }> };
      if (Array.isArray(parsed.topics)) {
        for (const t of parsed.topics) {
          if (t.topic && Array.isArray(t.saCommentaryNotes)) {
            saNotesByTopic[t.topic.toLowerCase()] = t.saCommentaryNotes;
          }
        }
      }
    } catch {
      return c.json({ error: 'Halacha enrichment returned non-JSON', detail: payload.slice(0, 300) }, 502);
    }
    const enrichedTopicsSa = halacha.topics.map(t => ({
      ...t,
      saCommentaryNotes: saNotesByTopic[t.topic.toLowerCase()] ?? [],
    }));
    const totalSaNotes = Object.values(saNotesByTopic).reduce((sum, arr) => sum + arr.length, 0);
    const _out_3 = {
      topics: enrichedTopicsSa,
      _strategy: strategy,
      _elapsed_ms: Date.now() - t0,
      _metadata: {
        model: 'kimi-k2.5-no-thinking',
        total_topics: halacha.topics.length,
        topics_with_notes: Object.values(saNotesByTopic).filter(arr => arr.length > 0).length,
        total_notes: totalSaNotes,
        topics_with_sa_commentary: saCommentary.totalBundles,
        commentators_seen: Array.from(saCommentary.commentators),
      },
    };
    if (cache) await cache.put(enrichCacheKey, JSON.stringify(_out_3), { expirationTtl: 60 * 60 * 24 * 365 });
    return c.json(_out_3);
  } catch (err) {
    return c.json({ error: 'Halacha enrichment call failed', detail: String(err).slice(0, 500) }, 502);
  }
});

/**
 * Sefaria topics API — cross-Shas sources per topic tagged on this daf.
 *
 * No LLM involved here, pure retrieval: /api/ref-topic-links/{ref} gives
 * us Sefaria's editorial topic tags for the daf, ranked by tfidf. For each
 * topic we pull its top N cross-Shas sources. Returned flat so the frontend
 * can map them to halacha topics at display time.
 */
app.get('/api/topics/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  try {
    const topics = await getDafTopicsCached(cache, tractate, page);
    return c.json({
      topics,
      _metadata: {
        total_topics: topics.length,
        total_sources: topics.reduce((s, t) => s + t.sources.length, 0),
      },
    });
  } catch (err) {
    return c.json({ error: 'topics fetch failed', detail: String(err).slice(0, 400) }, 502);
  }
});

const AGGADATA_PARALLELS_PROMPT = `You are a scholar identifying parallel aggadic narratives. You will receive:
- Existing aggadic stories for this daf (title, summary, excerpt, theme)
- The focal daf's Hebrew + English

For each story, identify 1-4 parallel aggadic discussions in other masechtot of Shas, Midrash Rabbah, Tanchuma, or Yalkut Shimoni. A "parallel" must tell a substantively related narrative — do not include mere thematic similarity.

Cite parallels in canonical Sefaria-compatible format:
- Shas: "Yoma 35b", "Gittin 56a"
- Midrash: "Bereishit Rabbah 1:1", "Vayikra Rabbah 22:8"
- Tanchuma: "Midrash Tanchuma, Lech Lecha 1"
- Yalkut: "Yalkut Shimoni on Torah 24"

Output STRICT JSON:
{"stories": [{"title": "title from input", "parallels": ["Yoma 35b", ...]}]}

Stories with no genuine parallels should have an empty array. Match by title (case-insensitive).`;

const AGGADATA_HISTORICAL_PROMPT = `You are a historian providing context for aggadic narratives. You will receive:
- Existing aggadic stories for this daf
- The focal daf's Hebrew + English

For each story, if there is genuine historical context that illuminates the narrative (era, political situation, cultural background), provide a brief framing. Skip (empty object) for stories that are purely parable/moral/mystical with no historical anchor.

Output STRICT JSON:
{"stories": [{"title": "title from input", "historicalContext": {"era": "Roman-occupied Judea, 1st c. CE", "context": "Short 1-2 sentence historical framing"} }]}

Only include historicalContext when it would materially help a modern reader. Return an empty object (no historicalContext key) for stories where history doesn't apply. Match by title (case-insensitive).`;

const AGGADATA_SYNTHESIZE_PROMPT = `You write the GIST of one aggadic story — the one-glance synthesis on the story card. Rewrite the story summary using the parallels and historical_context as authoritative context: each one tightens the picture of what's actually being told and why. Do NOT recap each enrichment — fold them into one tight paragraph.

**HARD CAPS:**
- 2-3 sentences. Maximum 480 characters total.
- Lead with what the story IS (event, encounter, parable) and what its theological/character pivot is.
- Then ONE sentence weaving in either the historical situation or the parallel that sharpens the reading.
- No "this story teaches us…" framing — the lesson should be implicit.

Output STRICT JSON only:

{ "stories": [{ "title": "<exact title>", "synthesis": { "explanation": "the gist", "groundedIn": ["parallels","historical-context"] } }] }

groundedIn lists ONLY slices actually supplied. Match stories by title (case-insensitive).`;

app.post('/api/enrich-aggadata/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const strategy = c.req.query('strategy') || 'parallels';
  if (strategy !== 'parallels' && strategy !== 'historical-context' && strategy !== 'synthesize') {
    return c.json({ error: `unknown strategy '${strategy}'; valid: parallels|historical-context|synthesize` }, 400);
  }
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  const cache = c.env.CACHE;
  const bypass = c.req.query('refresh') === '1';
  const cachedOnly = c.req.query('cached_only') === '1';
  const includeRawAgg = c.req.query('include') ?? '';
  const includeNormAgg = includeRawAgg
    ? includeRawAgg.split(',').map((s) => s.trim()).filter(Boolean).sort().join(',')
    : '';
  const enrichCacheKey = strategy === 'synthesize' && includeNormAgg
    ? `aggadata-enrich:v1:synthesize:i=${includeNormAgg}:${tractate}:${page}`
    : `aggadata-enrich:v1:${strategy}:${tractate}:${page}`;

  if (cache && !bypass) {
    const cachedEnrich = await cache.get(enrichCacheKey);
    if (cachedEnrich) {
      return c.json({ ...JSON.parse(cachedEnrich) as { stories: AggadataStory[] }, _strategy: strategy, _cached: true });
    }
  }
  if (cachedOnly) {
    return c.json({ cached: false }, 404);
  }

  const aggRaw = cache ? await cache.get(`aggadata:v5:${tractate}:${page}`) : null;
  if (!aggRaw) return c.json({ error: 'No cached /api/aggadata output; run /api/aggadata first.' }, 404);
  let aggadata: AggadataResult;
  try { aggadata = JSON.parse(aggRaw) as AggadataResult; }
  catch { return c.json({ error: 'Cached aggadata is not valid JSON' }, 502); }

  if (aggadata.stories.length === 0) {
    return c.json({ stories: [], _strategy: strategy, _metadata: { note: 'no stories on this daf' } });
  }

  // Synthesize branch: rewrite each story's gist using parallels + historical-context.
  if (strategy === 'synthesize') {
    const t0 = Date.now();
    const includeSet = new Set(includeNormAgg ? includeNormAgg.split(',') : []);
    const want = (s: string) => includeSet.size === 0 || includeSet.has(s);
    const readEnrich = async (s: string): Promise<{ stories?: AggadataStory[] } | null> => {
      if (!cache) return null;
      const hit = await cache.get(`aggadata-enrich:v1:${s}:${tractate}:${page}`);
      if (!hit) return null;
      try { return JSON.parse(hit); } catch { return null; }
    };
    const [parRes, histRes] = await Promise.all([
      want('parallels')          ? readEnrich('parallels')          : Promise.resolve(null),
      want('historical-context') ? readEnrich('historical-context') : Promise.resolve(null),
    ]);
    const storyBlocks = aggadata.stories.map((st) => {
      const slices: Record<string, unknown> = { title: st.title, summary: st.summary, theme: st.theme };
      const p = parRes?.stories?.find((x) => x.title.toLowerCase() === st.title.toLowerCase());
      const h = histRes?.stories?.find((x) => x.title.toLowerCase() === st.title.toLowerCase());
      if (p?.parallels)         slices.parallels         = p.parallels;
      if (h?.historicalContext) slices.historicalContext = h.historicalContext;
      return slices;
    });
    const userContent = [
      `Tractate: ${tractate}`,
      `Focal page: ${page}`,
      '',
      `<stories_with_enrichments>\n${JSON.stringify(storyBlocks, null, 2)}\n</stories_with_enrichments>`,
      '',
      'Synthesize each story.',
    ].join('\n');
    let parsed: { stories?: Array<{ title: string; synthesis?: { explanation: string; groundedIn?: string[] } }> } = {};
    try {
      const s = await runKimiStreaming(
        c.env.AI, '@cf/moonshotai/kimi-k2.5',
        [
          { role: 'system', content: AGGADATA_SYNTHESIZE_PROMPT },
          { role: 'user', content: userContent },
        ],
        6000,
        { chatTemplateKwargs: { enable_thinking: false } },
      );
      let payload = s.content.trim();
      const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) payload = fenced[1].trim();
      parsed = JSON.parse(payload);
    } catch (err) {
      return c.json({ error: `synthesize: ${String(err).slice(0, 200)}` }, 502);
    }
    const bySynth = new Map<string, { explanation: string; groundedIn?: string[] }>();
    for (const s of parsed.stories ?? []) {
      if (s.synthesis?.explanation) bySynth.set(s.title.toLowerCase(), s.synthesis);
    }
    const enrichedStories = aggadata.stories.map((s) => ({
      ...s,
      synthesis: bySynth.get(s.title.toLowerCase()),
    }));
    const out = {
      stories: enrichedStories,
      _strategy: 'synthesize',
      _elapsed_ms: Date.now() - t0,
    };
    if (cache) await cache.put(enrichCacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
    return c.json(out);
  }

  const [hbFocal, sefFocal] = await Promise.all([
    getHebrewBooksDafCached(cache, tractate, page),
    getSefariaPageCached(cache, tractate, page),
  ]);
  const focalHebrew = slice(hbFocal?.main ?? sefFocal?.mainText.hebrew ?? '', ANALYZE_CAPS.focalHebrew);
  const focalEnglish = slice(sefFocal?.mainText.english ?? '', ANALYZE_CAPS.focalEnglish);

  const systemPrompt =
    strategy === 'parallels' ? AGGADATA_PARALLELS_PROMPT
    : AGGADATA_HISTORICAL_PROMPT;
  const userContent = [
    `Tractate: ${tractate}`,
    `Focal page: ${page}`,
    '',
    `<existing_aggadata>\n${JSON.stringify(aggadata, null, 2)}\n</existing_aggadata>`,
    '',
    `<focal_hebrew>${focalHebrew}</focal_hebrew>`,
    `<focal_english>${focalEnglish}</focal_english>`,
  ].join('\n\n');

  const t0 = Date.now();
  try {
    const s = await runKimiStreaming(
      c.env.AI, '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      8000,
      { chatTemplateKwargs: { enable_thinking: false } },
    );
    let payload = s.content.trim();
    const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) payload = fenced[1].trim();

    let parallelsByTitle: Record<string, string[]> = {};
    let historicalByTitle: Record<string, HistoricalContext> = {};
    try {
      const parsed = JSON.parse(payload) as { stories?: Array<{ title: string; parallels?: string[]; historicalContext?: HistoricalContext }> };
      if (Array.isArray(parsed.stories)) {
        for (const st of parsed.stories) {
          const key = (st.title || '').toLowerCase();
          if (Array.isArray(st.parallels)) parallelsByTitle[key] = st.parallels;
          if (st.historicalContext && st.historicalContext.context) historicalByTitle[key] = st.historicalContext;
        }
      }
    } catch {
      return c.json({ error: 'Aggadata enrichment returned non-JSON', detail: payload.slice(0, 300) }, 502);
    }

    const enrichedStories = aggadata.stories.map(st => {
      const key = st.title.toLowerCase();
      const out: AggadataStory & { parallels?: string[]; historicalContext?: HistoricalContext } = { ...st };
      if (strategy === 'parallels' && parallelsByTitle[key]) out.parallels = parallelsByTitle[key];
      if (strategy === 'historical-context' && historicalByTitle[key]) out.historicalContext = historicalByTitle[key];
      return out;
    });

    const totalP = Object.values(parallelsByTitle).reduce((sum, arr) => sum + arr.length, 0);

    if (cache) {
      await cache.put(enrichCacheKey, JSON.stringify({ stories: enrichedStories }), { expirationTtl: 60 * 60 * 24 * 365 });
    }

    return c.json({
      stories: enrichedStories,
      _strategy: strategy,
      _cached: false,
      _elapsed_ms: Date.now() - t0,
      _metadata: {
        model: 'kimi-k2.5-no-thinking',
        total_stories: aggadata.stories.length,
        ...(strategy === 'parallels'
          ? { total_parallels: totalP, stories_with_parallels: Object.values(parallelsByTitle).filter(a => a.length > 0).length }
          : { stories_with_history: Object.keys(historicalByTitle).length }),
      },
    });
  } catch (err) {
    return c.json({ error: 'Aggadata enrichment call failed', detail: String(err).slice(0, 500) }, 502);
  }
});

/**
 * Practical halacha analysis: given a daf, identify the main halachic
 * issues and cite the relevant rulings in Mishneh Torah, Shulchan Aruch,
 * and Rema (only if Rema comments). Kimi K2.6 with thinking, hard-fail.
 */
const HALACHA_SYSTEM_PROMPT = `You are a scholar of Jewish law (halacha). Given a daf of Talmud (with its source segments NUMBERED) and its English translation (same numbering), identify the main PRACTICAL halachic issues discussed. For each topic, you MUST report the segment range it spans plus the relevant rulings in three codifications:

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
      "startSegIdx": 0-based segment index from the Hebrew source above where this halachic discussion BEGINS,
      "endSegIdx": 0-based segment index where it ENDS (inclusive). For a single-segment discussion, startSegIdx === endSegIdx.,
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
- "startSegIdx" and "endSegIdx" MUST be valid indices from the numbered Hebrew source above. The bracketed [N] markers ARE those indices. Pick the FIRST segment whose content opens this halachic discussion as startSegIdx; pick the LAST segment whose content still belongs to it as endSegIdx. Topics may overlap each other — pick honest boundaries, not disjoint partitions.
- Cite specific chapter:seif references — never "in Mishneh Torah" without numbers.
- Summaries in English, 1-2 sentences, plain language.

EXHAUSTIVENESS (critical — previous outputs have been under-inclusive):
- Identify EVERY practical halachic topic the daf touches on, not just the headline. A single daf commonly contains 4-10 distinct halachic topics; output them all. Do NOT cap yourself at "2-3 main ones".
- Include a topic whenever the Gemara's discussion has ANY practical downstream ruling — even a subsidiary detail of a bigger topic. Example: a daf on Shema may have separate topics for "zman kriat Shema of evening", "zman kriat Shema of morning", "reclining vs. standing during Shema", "interrupting Shema", "the blessings before/after Shema", each with their own ref.
- The only things to skip: pure aggada, pure exegesis of verses without practical application, a rabbi's biography, OR korbanot / Temple-service laws (avodah, sacrifices, priestly eating of holy things, korban-tumah/taharah). Korbanot are not practical halacha today — exclude them even when the daf goes deep into the topic. A timing rule "until midnight" mentioned in the context of eating sacrifices that one day belongs to korbanot, not practical halacha.
- Any of mishnehTorah / shulchanAruch / rema may be omitted if that codifier does not address the topic. But a topic needs at least ONE ref (Mishneh Torah or Shulchan Aruch) to be included.
- When multiple chapters/seifim are relevant to one topic, pick the single most on-point reference. Do NOT split one topic into multiple entries by codification — one topic = one entry with up to three rulings.
- Include Rema wherever the Ashkenazi practice diverges from Shulchan Aruch on this issue, even if minor.

CONTEXT (optional): Rashi, Tosafot, and halachic codifications (Tur, Shulchan Aruch, Peninei Halakhah, etc.) may be provided in <rashi>, <tosafot>, and <halachic_refs> blocks. Use them ONLY to (a) clarify which halachic question the focal Gemara is actually deciding, (b) sharpen ref citations, and (c) confirm the Rema diverges. The list of topics MUST come from the focal Hebrew text — every topic's startSegIdx/endSegIdx must point at segments in the numbered source above. Do not introduce a topic that exists only in commentary.${HEBRAIZE_RULE}`;

interface HalachaRuling {
  ref: string;
  summary: string;
}
interface HalachaTopic {
  topic: string;
  topicHe?: string;
  excerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  rulings: {
    mishnehTorah?: HalachaRuling;
    shulchanAruch?: HalachaRuling;
    rema?: HalachaRuling;
  };
  modernAuthorities?: ModernAuthority[];
  rishonimNotes?: RishonNote[];
  saCommentaryNotes?: SaCommentaryNote[];
  synthesis?: { explanation: string; groundedIn?: string[] };
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
    if (t.startSegIdx !== undefined && typeof t.startSegIdx !== 'number') return false;
    if (t.endSegIdx !== undefined && typeof t.endSegIdx !== 'number') return false;
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
  // v6: prompt now feeds Sefaria-segmented [N]-numbered text and topics carry
  // startSegIdx/endSegIdx anchors. Old v5 entries lack the segment indices.
  const cacheKey = `halacha:v6:${tractate}:${page}`;
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

  let segsHe: string[] = [];
  let segsEn: string[] = [];
  try {
    const sef = await getSefariaSegmentsCached(cache, tractate, page);
    segsHe = (sef?.he ?? []).map(stripHtmlServer);
    segsEn = (sef?.en ?? []).map(stripHtmlServer);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[halacha] sefaria fetch failure:', err);
  }
  if (segsHe.length === 0 && segsEn.length === 0) {
    return c.json({ error: 'No Sefaria-segmented source text available for this daf' }, 502);
  }

  // Detection context: Rashi + Tosafot disambiguate which halacha is being
  // decided; halachic refs (Tur, SA, Peninei) sharpen the codification cites.
  // All capped tighter than enrichment to keep first pass fast.
  const [sefBundle, halachaRefs] = await Promise.all([
    getSefariaPageCached(cache, tractate, page).catch(() => null),
    getHalachaRefsCached(cache, tractate, page).catch(() => ({} as HalachicRefBundle)),
  ]);
  const rashiSliced = slice(sefBundle?.rashi?.hebrew ?? '', DETECT_CAPS.rashi);
  const tosafotSliced = slice(sefBundle?.tosafot?.hebrew ?? '', DETECT_CAPS.tosafot);
  const halachaXml = halachaBlock(halachaRefs, {
    perRef: DETECT_CAPS.halachaPerRef,
    refsPerBook: DETECT_CAPS.halachaRefsPerBook,
  });

  const numberedHe = segsHe.map((s, i) => `[${i}] ${s}`).join('\n').slice(0, 6500);
  const numberedEn = segsEn.map((s, i) => `[${i}] ${s}`).join('\n').slice(0, 5500);

  const userParts: string[] = [
    `Tractate: ${tractate}`,
    `Page: ${page}`,
    `Total segments: ${segsHe.length}`,
    '',
    'Hebrew/Aramaic source — each line begins with [N], a 0-based segment index. USE these indices for startSegIdx / endSegIdx:',
    numberedHe || '(unavailable)',
    '',
    'English translation (same numbering):',
    numberedEn || '(unavailable)',
  ];
  if (rashiSliced) {
    userParts.push('', 'Rashi on the focal amud (context — topics still must come from the focal Hebrew):', `<rashi>${rashiSliced}</rashi>`);
  }
  if (tosafotSliced) {
    userParts.push('', 'Tosafot on the focal amud (context — topics still must come from the focal Hebrew):', `<tosafot>${tosafotSliced}</tosafot>`);
  }
  if (halachaXml) {
    userParts.push('', 'Halachic codifications already linked to this daf (context for ref citations — do not invent topics from these):', halachaXml);
  }
  userParts.push('', 'Output valid JSON only matching the schema. Every topic MUST include startSegIdx and endSegIdx pointing at valid [N] indices above.');
  const userContent = userParts.join('\n');

  // Kimi K2.6 only, thinking on. Hard-fail rather than fall back.
  const models: Array<{ id: string; label: string; maxTokens: number }> = [
    { id: '@cf/moonshotai/kimi-k2.5', label: 'kimi-k2.5', maxTokens: 32000 },
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

const AGGADATA_SYSTEM_PROMPT = `You are a Talmud scholar. Given a daf of Talmud and its English translation, identify every AGGADIC unit on the page — narrative stories, biographical anecdotes about named sages, parables (mashalim), dream reports, miracle reports, and ethical maxims embedded in narrative. Ignore purely halachic/legal sugyot and pure legal exegesis.

Verse-driven units are handled by a separate /api/pesukim system: do NOT emit a story whose center of gravity is a homiletical reading of a biblical verse. If a unit's point is "this verse really means…" (derash, gezera shava, al tikri, gematria, notarikon, etc.), skip it — even if it is wrapped in narrative voice. Aggadata covers stories where the narrative, character, vision, or teaching is the unit itself, not the re-reading of a verse.

Output STRICT JSON only (no markdown, no prose):

{
  "stories": [
    {
      "title": "Short, evocative English title (4-7 words). E.g. 'The Oven of Akhnai', 'Rabban Gamliel and the Heavenly Voice'",
      "titleHe": "Hebrew title using the traditional name if one exists (e.g. 'תנור של עכנאי'), otherwise a concise Hebrew summary phrase",
      "summary": "1-2 sentence English summary of what happens / what the story is about",
      "excerpt": "3-6 consecutive Hebrew/Aramaic words copied VERBATIM from the OPENING of the story in the daf. Anchors the start of the highlight. Pick the phrase where the narrative first begins, not a rabbi name or a generic opener.",
      "endExcerpt": "3-6 consecutive Hebrew/Aramaic words copied VERBATIM from the CLOSING of the story — the last line of this aggadic unit, immediately before the daf moves to the next topic. Anchors the end of the highlight. MUST appear AFTER excerpt in the daf. If the story is one short sentence, endExcerpt may be its final 3-6 words (which may overlap the tail of excerpt).",
      "startSegIdx": 0-based segment index from the numbered Hebrew source where this story BEGINS (matches the [N] markers in the source),
      "endSegIdx": 0-based segment index where the story ENDS (inclusive). For a one-segment story, startSegIdx === endSegIdx.,
      "theme": "One transliterated Hebrew tag (see Theme tags below) — exactly one of: mashal | ma'aseh | chazon | tefillah | ma'amar"
    }
  ]
}

Theme tags (classify by the English gloss, emit the transliterated token exactly — lowercase, with apostrophe where shown):
- "mashal"    — a parable / explicit analogy, typically framed "to what is this similar? to a king who…". The point of the unit is the metaphor itself.
- "ma'aseh"   — a narrative anecdote. Covers biographical stories about named sages, historical reports, halakhic anecdotes, and miracles-that-happen-inside-a-story (e.g. "R' X went to Y and the river split"). Default choice for any sustained narrative with setting, characters, and events.
- "chazon"    — a vision or revelatory encounter. Dreams, bat kol, apparitions of Elijah or angels, heikhalot / merkavah descriptions, gan eden / gehinnom, messianic / eschatological teachings, ma'aseh bereshit. Use when the CONTENT of the unit is the mystical/visionary experience, even if framed as "R' X was walking and…".
- "tefillah"  — a prayer or liturgical text embedded as aggadah. E.g. "R' Elazar would say when he finished praying…". The unit is itself a script to recite, not a narrative about prayer.
- "ma'amar"   — an aphoristic teaching or wisdom saying with no narrative frame and no verse-exegesis as its point. Pirkei-Avot-style statements. "Who is wise? He who learns from every person."

Pick exactly one theme — the one that best describes what the unit IS, not what it passingly contains. A ma'aseh about Elijah teaching halakhot to a rabbi who heard a bat kol in a ruin is a chazon (the content is the vision/revelation), not a ma'aseh, because removing the mystical encounter would gut the unit.

Rules:
- "excerpt" and "endExcerpt" MUST be Hebrew/Aramaic words copied verbatim from the daf text supplied below. Do not translate. Do not paraphrase. Do not include vowel points if the source lacks them.
- "endExcerpt" must occur AFTER "excerpt" in the linear daf text, so the pair bounds the entire story.
- "startSegIdx" and "endSegIdx" MUST be valid indices from the numbered Hebrew source — the bracketed [N] markers ARE those indices. The pair MUST satisfy startSegIdx <= endSegIdx and bound the entire story.
- If the daf contains no aggada (purely halachic page), return {"stories": []}.
- Do not split one story into multiple entries. A sustained narrative with dialogue and multiple events is ONE story.
- Do not include dry legal statements attributed to a named sage — that's halacha, not aggada. Include only when there is a narrative, parable, or non-legal teaching.
- Titles should be memorable, not generic ("Story 1"). Use the traditional Hebrew name where one exists.
- Order stories in the order they appear on the daf.${HEBRAIZE_RULE}`;

interface AggadataStory {
  title: string;
  titleHe?: string;
  summary: string;
  excerpt: string;
  endExcerpt: string;
  startSegIdx?: number;
  endSegIdx?: number;
  theme?: string;
  parallels?: string[];
  historicalContext?: { era: string; context: string };
  synthesis?: { explanation: string; groundedIn?: string[] };
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
    if (typeof s.endExcerpt !== 'string') return false;
    if (s.startSegIdx !== undefined && typeof s.startSegIdx !== 'number') return false;
    if (s.endSegIdx !== undefined && typeof s.endSegIdx !== 'number') return false;
    if (s.theme !== undefined && typeof s.theme !== 'string') return false;
  }
  return true;
}

app.get('/api/aggadata/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  // v5: prompt now feeds Sefaria-segmented [N]-numbered text and stories carry
  // startSegIdx/endSegIdx anchors. Old v4 entries lack the segment indices.
  const cacheKey = `aggadata:v5:${tractate}:${page}`;
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

  let segsHe: string[] = [];
  let segsEn: string[] = [];
  try {
    const sef = await getSefariaSegmentsCached(cache, tractate, page);
    segsHe = (sef?.he ?? []).map(stripHtmlServer);
    segsEn = (sef?.en ?? []).map(stripHtmlServer);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[aggadata] sefaria fetch failure:', err);
  }
  if (segsHe.length === 0 && segsEn.length === 0) {
    return c.json({ error: 'No Sefaria-segmented source text available for this daf' }, 502);
  }

  const numberedHe = segsHe.map((s, i) => `[${i}] ${s}`).join('\n').slice(0, 6500);
  const numberedEn = segsEn.map((s, i) => `[${i}] ${s}`).join('\n').slice(0, 5500);

  const userContent = [
    `Tractate: ${tractate}`,
    `Page: ${page}`,
    `Total segments: ${segsHe.length}`,
    '',
    'Hebrew/Aramaic source — each line begins with [N], a 0-based segment index. USE these indices for startSegIdx / endSegIdx:',
    numberedHe || '(unavailable)',
    '',
    'English translation (same numbering):',
    numberedEn || '(unavailable)',
    '',
    'Output valid JSON only matching the schema. Every story MUST include startSegIdx and endSegIdx pointing at valid [N] indices above.',
  ].join('\n');

  const models: Array<{ id: string; label: string; maxTokens: number }> = [
    { id: '@cf/moonshotai/kimi-k2.5', label: 'kimi-k2.5', maxTokens: 32000 },
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

// ============================================================================
// PESUKIM — Tanach citations & allusions on a daf, plus per-strategy
// enrichments (tanach-context, peshat, gemara-usage, exegesis).
// ============================================================================

const PESUKIM_SYSTEM_PROMPT = `You are a scholar of Tanach and Talmud. Given a daf of Talmud (Hebrew/Aramaic source NUMBERED with [N] segment indices, plus English translation with the same numbering), identify every reference to a Tanach verse on the page — explicit citations, allusions, and paraphrases.

Output STRICT JSON only (no markdown, no prose):

{
  "pesukim": [
    {
      "verseRef": "Canonical Sefaria-style reference: 'Genesis 1:1', 'Psalms 1:1', 'Isaiah 6:3', 'Proverbs 3:18'. Books in English. If only a chapter or partial ref is recoverable, use that (e.g. 'Psalms 23').",
      "verseHe": "Hebrew text of the verse AS QUOTED on the daf — verbatim from the source, not the canonical Tanach version. Omit if the daf only alludes without quoting words.",
      "citationMarker": "The Hebrew/Aramaic citation marker that introduces the verse, copied verbatim — e.g. 'שֶׁנֶּאֱמַר', 'דִּכְתִיב', 'אָמַר הַכָּתוּב', 'וְכֵן הוּא אוֹמֵר', 'דִּכְתִיב בֵּיהּ', 'יָכוֹל'. Omit if there is no marker (allusion / paraphrase).",
      "citationStyle": "explicit | allusion | paraphrase",
      "excerpt": "3-6 consecutive Hebrew/Aramaic words copied VERBATIM from the daf at the START of the citation (typically the citation marker plus the opening words of the verse). Anchors the highlight.",
      "endExcerpt": "3-6 consecutive Hebrew/Aramaic words copied VERBATIM from the daf at the END of this citation (the closing words of the quoted verse, or the last words of the allusion). Must appear AT or AFTER excerpt in linear order.",
      "startSegIdx": 0-based segment index from the numbered source where this citation begins,
      "endSegIdx": 0-based segment index where it ends (inclusive). For a single-segment citation, startSegIdx === endSegIdx,
      "summary": "One short sentence describing how the daf is invoking this verse in context (e.g. 'Cited as the source for the obligation to recite Shema twice daily', 'Adduced as proof that the Patriarchs kept the entire Torah', 'Alluded to in setting up the question about Sinai')."
    }
  ]
}

Citation styles:
- "explicit"   — daf quotes the verse with a citation marker (שנאמר, דכתיב, אמר הכתוב, וכן הוא אומר, etc.). Default for any verse introduced by such a marker.
- "allusion"   — daf reuses verse-distinctive language without a marker, evoking a verse the reader is expected to recognize (e.g. an unmarked echo of a famous phrase).
- "paraphrase" — daf restates the content of a verse in its own words to make a point that depends on the underlying verse, without quoting it verbatim.

Rules:
- excerpt and endExcerpt MUST be Hebrew/Aramaic words copied verbatim from the supplied numbered source. Do not translate.
- startSegIdx / endSegIdx MUST be valid indices from the [N] markers in the source.
- The same verse cited in two different places on the daf is TWO entries — one per citation.
- If the same verse is cited twice in immediate succession as part of one continuous discussion, treat it as ONE entry covering the full range.
- For verses identified only by a partial phrase (e.g. "and it is written 'and you shall love'…"), give the best matching canonical ref you can determine; if the verse is genuinely ambiguous, set verseRef to the chapter (e.g. "Deuteronomy 6") and note the ambiguity in summary.
- If the daf contains no Tanach citations or allusions, return {"pesukim": []}.
- Order pesukim in the order they appear on the daf.

Be inclusive: explicit proof-texts, asmakhta-style citations, derashot, allusions in stories ("for the LORD God planted a garden…"), and paraphrases that the daf's argument depends on are ALL pesukim.${HEBRAIZE_RULE}`;

interface Pasuk {
  verseRef: string;
  verseHe?: string;
  citationMarker?: string;
  citationStyle?: 'explicit' | 'allusion' | 'paraphrase';
  excerpt: string;
  endExcerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  summary: string;
}

interface PesukimResult {
  pesukim: Pasuk[];
}

function validatePesukim(x: unknown): x is PesukimResult {
  if (!x || typeof x !== 'object') return false;
  const p = x as PesukimResult;
  if (!Array.isArray(p.pesukim)) return false;
  for (const v of p.pesukim) {
    if (typeof v.verseRef !== 'string') return false;
    if (typeof v.excerpt !== 'string') return false;
    if (typeof v.summary !== 'string') return false;
    if (v.verseHe !== undefined && typeof v.verseHe !== 'string') return false;
    if (v.citationMarker !== undefined && typeof v.citationMarker !== 'string') return false;
    if (v.citationStyle !== undefined && typeof v.citationStyle !== 'string') return false;
    if (v.endExcerpt !== undefined && typeof v.endExcerpt !== 'string') return false;
    if (v.startSegIdx !== undefined && typeof v.startSegIdx !== 'number') return false;
    if (v.endSegIdx !== undefined && typeof v.endSegIdx !== 'number') return false;
  }
  return true;
}

interface PesukimStoryShape {
  verseRef: string;
  verseHe?: string;
  citationMarker?: string;
  citationStyle?: string;
  excerpt?: string;
  endExcerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  summary?: string;
  tanachContext?: unknown;
  peshat?: unknown;
  gemaraUsage?: unknown;
  exegesis?: unknown;
  synthesize?: unknown;
}

app.get('/api/pesukim/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  const cacheKey = `pesukim:v1:${tractate}:${page}`;
  const t0 = Date.now();

  const bypass = c.req.query('refresh') === '1';
  const cachedOnly = c.req.query('cached_only') === '1';

  if (cache && !bypass) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      recordTelemetry(c, { endpoint: 'pesukim', tractate, page, cache_hit: true, ms: Date.now() - t0, ok: true });
      return c.json({ ...JSON.parse(cached) as PesukimResult, _cached: true });
    }
  }
  if (cachedOnly) {
    return c.json({ cached: false }, 404);
  }
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

  let segsHe: string[] = [];
  let segsEn: string[] = [];
  try {
    const sef = await getSefariaSegmentsCached(cache, tractate, page);
    segsHe = (sef?.he ?? []).map(stripHtmlServer);
    segsEn = (sef?.en ?? []).map(stripHtmlServer);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[pesukim] sefaria fetch failure:', err);
  }
  if (segsHe.length === 0 && segsEn.length === 0) {
    return c.json({ error: 'No Sefaria-segmented source text available for this daf' }, 502);
  }

  const numberedHe = segsHe.map((s, i) => `[${i}] ${s}`).join('\n').slice(0, 6500);
  const numberedEn = segsEn.map((s, i) => `[${i}] ${s}`).join('\n').slice(0, 5500);

  const userContent = [
    `Tractate: ${tractate}`,
    `Page: ${page}`,
    `Total segments: ${segsHe.length}`,
    '',
    'Hebrew/Aramaic source — each line begins with [N], a 0-based segment index. USE these indices for startSegIdx / endSegIdx:',
    numberedHe || '(unavailable)',
    '',
    'English translation (same numbering):',
    numberedEn || '(unavailable)',
    '',
    'Output valid JSON only matching the schema. Every pasuk MUST include startSegIdx and endSegIdx pointing at valid [N] indices above.',
  ].join('\n');

  // Two attempts per model: first with default settings (lets the model
  // think when it wants), second with `enable_thinking: false` so a token
  // budget that ran out in reasoning falls back to direct content output.
  const models: Array<{ id: string; label: string; maxTokens: number; thinking: boolean }> = [
    { id: '@cf/moonshotai/kimi-k2.5', label: 'kimi-k2.5', maxTokens: 32000, thinking: true },
    { id: '@cf/moonshotai/kimi-k2.5', label: 'kimi-k2.5/no-think', maxTokens: 32000, thinking: false },
  ];

  const attempts: string[] = [];
  for (const m of models) {
    try {
      const streamed = await runKimiStreaming(
        c.env.AI,
        m.id,
        [
          { role: 'system', content: PESUKIM_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        m.maxTokens,
        m.thinking ? undefined : { chatTemplateKwargs: { enable_thinking: false } },
      );
      let payload = streamed.content.trim();
      // Fallback 1: explicit pesukim-keyed JSON in reasoning.
      if (!payload && streamed.reasoning_content) {
        const mm = streamed.reasoning_content.match(/\{[\s\S]*"pesukim"[\s\S]*\}/);
        if (mm) payload = mm[0];
      }
      // Fallback 2: any well-balanced JSON object in reasoning that has a
      // pesukim-like array. Catches cases where the model emits plain JSON
      // without the wrapping `{ "pesukim": ... }` literal in reasoning.
      if (!payload && streamed.reasoning_content) {
        const mm = streamed.reasoning_content.match(/\{[\s\S]*"verseRef"[\s\S]*\}/);
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
      if (!validatePesukim(parsed)) {
        attempts.push(`${m.label}: schema mismatch`);
        continue;
      }
      const result = parsed as PesukimResult;
      if (cache) {
        await cache.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 365 });
      }
      recordTelemetry(c, { endpoint: 'pesukim', tractate, page, cache_hit: false, model: m.label, ms: Date.now() - t0, ok: true });
      return c.json({ ...result, _cached: false, _model: m.label });
    } catch (err) {
      attempts.push(`${m.label}: ${String(err).slice(0, 200)}`);
    }
  }

  recordTelemetry(c, { endpoint: 'pesukim', tractate, page, cache_hit: false, ms: Date.now() - t0, ok: false, error_kind: classifyError(attempts.join(' ')) });
  return c.json({ error: 'Pesukim detection failed', attempts }, 502);
});

/* ---- Pesukim enrichment strategies --------------------------------------
 * Per-page (one LLM call across all pesukim) so the strategy result can be
 * cached by `pesukim-enrich:v1:{strategy}:{tractate}:{page}` and the
 * canonical /api/enrich/pesukim/... wrapper slices out the per-pasuk piece.
 */

interface TanachContext {
  surroundingHe?: string;
  surroundingEn?: string;
  contextSummary?: string;
  bookContext?: string;
}

interface PeshatReading {
  peshat: string;
  commentators?: Array<{ name: string; note: string }>;
}

interface GemaraUsage {
  extractedClaim: string;
  role: 'proof' | 'asmakhta' | 'objection' | 'support' | 'narrative' | 'other';
  explanation: string;
}

interface ExegesisMove {
  name: string;
  locusOnVerse?: string;
  explanation: string;
}

interface ExegesisReading {
  moves: ExegesisMove[];
}

const PESUKIM_TANACH_CONTEXT_PROMPT = `You are a scholar of Tanach. You will receive ONE Tanach citation from a Talmud daf (verseRef, verseHe as quoted, summary of how the daf uses it) plus a <tanach_context> block containing that verse and 1-2 surrounding verses on each side (Hebrew + English) fetched from Sefaria.

Write a concise tanach-context entry:
- contextSummary: 1-2 sentences situating this verse in its immediate Tanach context — what is the section about, what are the surrounding verses doing, what is the narrative or topical flow.
- bookContext: 1 sentence on what this verse contributes to its book / parsha / chapter at a higher level (e.g. "part of the Decalogue", "in the Joseph narrative", "amid the laws of vows in Numbers 30").

Output STRICT JSON only:
{"contextSummary": "...", "bookContext": "..."}

If no surrounding context was provided (Sefaria fetch failed), return {"contextSummary": "", "bookContext": ""}.`;

const PESUKIM_PESHAT_PROMPT = `You are a peshat-focused commentator on Tanach. You will receive ONE Tanach citation from a Talmud daf (verseRef, verseHe as quoted on the daf, summary of how the daf uses it) plus a <peshat_commentary> block bundling Sefaria's text of Rashi, Ibn Ezra, Ramban, and/or Radak on that verse (whichever are available).

Write a peshat reading for THIS verse:
- peshat: 1-2 sentences distilling the plain-sense meaning of the verse in its biblical context, drawing on the supplied commentators where they speak to the simple meaning. Never copy the daf's homiletical reading — peshat ONLY.
- commentators: an array of {name, note} entries naming each peshat-relevant commentator and a one-sentence summary of their plain-sense reading. Skip commentators not in the input. Skip commentators who only offer derash-style readings.

Output STRICT JSON only:
{"peshat": "...", "commentators": [{"name": "Rashi", "note": "..."}, {"name": "Ibn Ezra", "note": "..."}]}

If no peshat commentary was supplied, return {"peshat": "no peshat commentary available", "commentators": []}.`;

const PESUKIM_GEMARA_USAGE_PROMPT = `You are a scholar of Talmud. You will receive ONE Tanach citation from a daf (verseRef, verseHe as quoted, citation marker, segment range, summary) plus a slice of the daf's Hebrew + English around the citation.

Identify what the gemara is doing with this verse in its argumentative or narrative context. Output STRICT JSON only:

{
  "extractedClaim": "1-sentence statement of the halacha, principle, narrative point, or aggadic reading the gemara is deriving from or grounding in this verse",
  "role": "proof | asmakhta | objection | support | narrative | other",
  "explanation": "2-3 sentences explaining the move: which words of the verse are doing the work, what the gemara reads INTO them, and how this fits the local sugya"
}

Role guide:
- "proof"      — verse is the primary scriptural ground for a halachic ruling or doctrine (drisha, gemara treats it as binding derivation).
- "asmakhta"   — verse is cited as a mnemonic / supportive hook but the underlying claim is rabbinic, not really biblical.
- "objection"  — verse is brought as a difficulty against another position (kushya).
- "support"    — verse strengthens or illustrates a point already established otherwise.
- "narrative"  — verse appears within a story, dream, or aggadic frame, not as a derivation.
- "other"      — anything else; explain in the explanation field.

If the gemara's use of this verse is unclear, give your best inference and acknowledge the uncertainty in explanation.`;

const PESUKIM_EXEGESIS_PROMPT = `You are a scholar of midrash and rabbinic hermeneutics. You will receive ONE Tanach citation from a daf (verseRef, verseHe as quoted, citation marker, segment range, summary) plus a slice of the daf's Hebrew + English around the citation.

Identify the hermeneutic method(s) the gemara is applying to extract meaning from this verse. The citation may use ONE move, MULTIPLE moves layered together, or NONE (when the verse is cited as a flat proof-text without any non-trivial reading).

Output STRICT JSON only:

{
  "moves": [
    {
      "name": "derash | gezera-shava | al-tikri | notarikon | gematria | asmakhta | kal-vachomer | binyan-av | heqesh | kelal-uphrat | peshat-vs-derash | semukhin | yitur | meshalashim | other",
      "locusOnVerse": "The specific Hebrew word, phrase, or feature in the verse that the move pivots on (e.g. the doubled word in gezera-shava, the redundant letter in yitur, the specific phrase being re-vocalized in al-tikri)",
      "explanation": "2-3 sentences explaining how this hermeneutic move operates on this verse to yield the gemara's reading. Be specific: name the linguistic / structural feature and the new meaning it produces."
    }
  ]
}

Move names (use these exact tokens):
- "derash"          — general homiletical / non-peshat reading not fitting a more specific category.
- "gezera-shava"    — verbal analogy: two verses share a word/phrase, so a halacha from one transfers to the other.
- "al-tikri"        — "do not read X but rather Y" — re-vocalization or re-pointing of consonants.
- "notarikon"       — a word treated as an acronym or split into shorter components.
- "gematria"        — the numerical value of letters yields a meaning.
- "asmakhta"        — the verse is treated as a mnemonic anchor for a rabbinic ruling.
- "kal-vachomer"    — a fortiori inference grounded in this verse.
- "binyan-av"       — paradigm case generalized from this verse to a class.
- "heqesh"          — analogy between two laws joined in the same verse / passage.
- "kelal-uphrat"    — generalization-and-specification rule applied to the verse's structure.
- "peshat-vs-derash"— the move explicitly contrasts the plain sense with the homiletical one.
- "semukhin"        — semantic inference from juxtaposition of adjacent verses or passages.
- "yitur"           — a redundant word or letter is treated as carrying additional meaning.
- "meshalashim"     — a tripled phrase or threefold repetition is read as a marker.
- "other"           — any other named move (e.g. "tartei mashma", "kri u'khtiv"); name it in the move's name field.

If this citation is a flat proof-text with no non-trivial hermeneutic move, return {"moves": []}.`;

const PESUKIM_SYNTHESIZE_PROMPT = `You write the GIST of one Tanach citation on a Talmud daf — the 2-3 sentence explanation a reader sees when they tap the pasuk's icon. The deep work (full Tanach context, peshat, gemara-usage role, hermeneutic move inventory) is done by other strategies; do NOT duplicate them.

You will receive ONE pasuk's metadata (verseRef, verseHe as cited, citationMarker, citationStyle, summary, segment range) plus optional cached enrichments (tanachContext, peshat, gemaraUsage, exegesis) and a slice of the daf's Hebrew/English around the citation.

**HARD CAPS:**
- 2-3 sentences. No more.
- Maximum 350 characters total.
- No "as discussed below" or "see also" framing.
- No section/citation index numbers.
- Write in plain English the way a teacher would explain in passing.

What the gist must convey, in this priority order:
1. What the verse says, in one short clause (peshat-flavored, not derash).
2. What the daf is doing with it — the claim/principle/narrative point this citation grounds.
3. If a non-trivial hermeneutic move is at work (gezera-shava, al-tikri, gematria, asmakhta, etc.), name it briefly.

Output STRICT JSON only:

{ "explanation": "2-3 sentence gist here", "groundedIn": ["tanach-context","peshat","gemara-usage","exegesis","daf-text"] }

groundedIn lists ONLY slices that were actually supplied below and that you drew on. Do not list a slice you didn't see in the input.`;

interface PesukimSynthesizeReading {
  explanation: string;
  groundedIn?: string[];
}

/** Fetch a verse's surrounding text from Sefaria, with a small KV cache so
 *  the same verse cited on multiple dapim doesn't re-hit Sefaria. */
async function getTanachVerseCached(
  cache: KVNamespace | undefined,
  ref: string,
  contextRange: number,
): Promise<{ surroundingHe: string; surroundingEn: string; ref: string } | null> {
  const safeRef = ref.replace(/[^A-Za-z0-9 .:-]/g, '_');
  const key = `tanach:v1:${safeRef}:c${contextRange}`;
  if (cache) {
    const hit = await cache.get(key);
    if (hit) {
      try { return JSON.parse(hit) as { surroundingHe: string; surroundingEn: string; ref: string }; }
      catch { /* fall through */ }
    }
  }
  try {
    const res = await sefariaAPI.getText(ref, { context: contextRange });
    const he = Array.isArray(res.he) ? res.he.join(' ') : (res.he ?? '');
    const en = Array.isArray(res.text) ? res.text.join(' ') : (res.text ?? '');
    const out = {
      surroundingHe: stripHtmlServer(he).slice(0, 2000),
      surroundingEn: stripHtmlServer(en).slice(0, 2000),
      ref: res.ref ?? ref,
    };
    if (cache) {
      await cache.put(key, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
    }
    return out;
  } catch {
    return null;
  }
}

/** Fetch peshat-oriented commentators (Rashi, Ibn Ezra, Ramban, Radak) on a
 *  Tanach verse. Cached per ref+commentator. Missing commentators are simply
 *  omitted. */
async function getPeshatCommentariesCached(
  cache: KVNamespace | undefined,
  ref: string,
): Promise<Array<{ name: string; he: string; en: string; ref: string }>> {
  const COMMENTATORS = ['Rashi', 'Ibn Ezra', 'Ramban', 'Radak'];
  const out: Array<{ name: string; he: string; en: string; ref: string }> = [];
  for (const name of COMMENTATORS) {
    const commentaryRef = `${name} on ${ref}`;
    const safeRef = commentaryRef.replace(/[^A-Za-z0-9 .:-]/g, '_');
    const key = `tanach-comm:v1:${safeRef}`;
    let entry: { name: string; he: string; en: string; ref: string } | null = null;
    if (cache) {
      const hit = await cache.get(key);
      if (hit) {
        try { entry = JSON.parse(hit) as { name: string; he: string; en: string; ref: string }; }
        catch { /* fall through */ }
      }
    }
    if (!entry) {
      try {
        const res = await sefariaAPI.getText(commentaryRef);
        const he = Array.isArray(res.he) ? res.he.join(' ') : (res.he ?? '');
        const en = Array.isArray(res.text) ? res.text.join(' ') : (res.text ?? '');
        if (he || en) {
          entry = {
            name,
            he: stripHtmlServer(he).slice(0, 3000),
            en: stripHtmlServer(en).slice(0, 3000),
            ref: res.ref ?? commentaryRef,
          };
          if (cache) {
            await cache.put(key, JSON.stringify(entry), { expirationTtl: 60 * 60 * 24 * 365 });
          }
        }
      } catch { /* commentator unavailable for this ref */ }
    }
    if (entry && (entry.he || entry.en)) out.push(entry);
  }
  return out;
}

app.post('/api/enrich-pesukim/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const strategy = c.req.query('strategy') || 'synthesize';
  if (
    strategy !== 'tanach-context' &&
    strategy !== 'peshat' &&
    strategy !== 'gemara-usage' &&
    strategy !== 'exegesis' &&
    strategy !== 'synthesize'
  ) {
    return c.json({ error: `unknown strategy '${strategy}'; valid: tanach-context|peshat|gemara-usage|exegesis|synthesize` }, 400);
  }
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  const cache = c.env.CACHE;
  const bypass = c.req.query('refresh') === '1';
  const cachedOnly = c.req.query('cached_only') === '1';
  const includeRawPes = c.req.query('include') ?? '';
  const includeNormPes = includeRawPes
    ? includeRawPes.split(',').map((s) => s.trim()).filter(Boolean).sort().join(',')
    : '';
  const enrichCacheKey = strategy === 'synthesize' && includeNormPes
    ? `pesukim-enrich:v1:synthesize:i=${includeNormPes}:${tractate}:${page}`
    : `pesukim-enrich:v1:${strategy}:${tractate}:${page}`;

  if (cache && !bypass) {
    const cachedEnrich = await cache.get(enrichCacheKey);
    if (cachedEnrich) {
      return c.json({ ...JSON.parse(cachedEnrich) as { pesukim: PesukimStoryShape[] }, _strategy: strategy, _cached: true });
    }
  }
  if (cachedOnly) {
    return c.json({ cached: false }, 404);
  }

  const pesRaw = cache ? await cache.get(`pesukim:v1:${tractate}:${page}`) : null;
  if (!pesRaw) return c.json({ error: 'No cached /api/pesukim output; run /api/pesukim first.' }, 404);
  let pesukimData: PesukimResult;
  try { pesukimData = JSON.parse(pesRaw) as PesukimResult; }
  catch { return c.json({ error: 'Cached pesukim is not valid JSON' }, 502); }

  if (pesukimData.pesukim.length === 0) {
    return c.json({ pesukim: [], _strategy: strategy, _metadata: { note: 'no pesukim on this daf' } });
  }

  // Synthesize takes a different shape from the other four strategies: it runs
  // one LLM call per pasuk in parallel, each focused on one citation, drawing
  // on whichever deep strategies happen to be cached. The result is the
  // 2-3 sentence headline shown next to the pesuk's gutter icon.
  if (strategy === 'synthesize') {
    let segsHe: string[] = [];
    let segsEn: string[] = [];
    try {
      const sef = await getSefariaSegmentsCached(cache, tractate, page);
      segsHe = (sef?.he ?? []).map(stripHtmlServer);
      segsEn = (sef?.en ?? []).map(stripHtmlServer);
    } catch { /* tolerated */ }

    // Pull whatever deep strategies are already cached for this page so the
    // synthesize prompt can fold them in. Missing strategies are fine —
    // synthesize works with just the daf text and pasuk metadata. The
    // `?include=` query filters which strategies actually feed the prompt.
    const includeSetPes = new Set(includeNormPes ? includeNormPes.split(',') : []);
    const wantPes = (s: string) => includeSetPes.size === 0 || includeSetPes.has(s);
    const deepStrategies: Array<'tanach-context' | 'peshat' | 'gemara-usage' | 'exegesis'> = ['tanach-context', 'peshat', 'gemara-usage', 'exegesis'];
    const deepCachedByStrategy: Record<string, Record<string, unknown>> = {};
    for (const ds of deepStrategies) {
      if (!wantPes(ds)) continue;
      const key = `pesukim-enrich:v1:${ds}:${tractate}:${page}`;
      const hit = cache ? await cache.get(key) : null;
      if (!hit) continue;
      try {
        const parsed = JSON.parse(hit) as { pesukim?: PesukimStoryShape[] };
        const byRef: Record<string, unknown> = {};
        for (const p of parsed.pesukim ?? []) {
          const lc = (p.verseRef || '').toLowerCase();
          if (ds === 'tanach-context' && p.tanachContext !== undefined) byRef[lc] = p.tanachContext;
          else if (ds === 'peshat' && p.peshat !== undefined) byRef[lc] = p.peshat;
          else if (ds === 'gemara-usage' && p.gemaraUsage !== undefined) byRef[lc] = p.gemaraUsage;
          else if (ds === 'exegesis' && p.exegesis !== undefined) byRef[lc] = p.exegesis;
        }
        deepCachedByStrategy[ds] = byRef;
      } catch { /* corrupted slice, skip */ }
    }

    function dafSliceFor(p: Pasuk): { he: string; en: string } {
      const start = Math.max(0, (p.startSegIdx ?? 0) - 1);
      const end = Math.min(segsHe.length, (p.endSegIdx ?? p.startSegIdx ?? 0) + 2);
      const heSlice = segsHe.slice(start, end).map((s, i) => `[${start + i}] ${s}`).join('\n').slice(0, 1800);
      const enSlice = segsEn.slice(start, end).map((s, i) => `[${start + i}] ${s}`).join('\n').slice(0, 1500);
      return { he: heSlice, en: enSlice };
    }

    const t0 = Date.now();
    const concurrency = 4;
    const synthesizeByRef: Record<string, PesukimSynthesizeReading> = {};
    let cursor = 0;
    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= pesukimData.pesukim.length) return;
        const p = pesukimData.pesukim[idx];
        const lc = (p.verseRef || '').toLowerCase();
        const slices: string[] = [];
        for (const ds of deepStrategies) {
          const data = deepCachedByStrategy[ds]?.[lc];
          if (data !== undefined) slices.push(`<${ds}>\n${JSON.stringify(data, null, 2)}\n</${ds}>`);
        }
        const dafSlice = dafSliceFor(p);
        const userContent = [
          `Tractate: ${tractate}`,
          `Page: ${page}`,
          '',
          `<pasuk>\n${JSON.stringify(p, null, 2)}\n</pasuk>`,
          '',
          slices.length === 0
            ? '(No deep strategies cached for this pasuk yet — write the gist from the daf slice + pasuk metadata alone.)'
            : `Cached deep strategies for this pasuk:\n\n${slices.join('\n\n')}`,
          '',
          dafSlice.he ? `<focal_hebrew>\n${dafSlice.he}\n</focal_hebrew>` : '',
          dafSlice.en ? `<focal_english>\n${dafSlice.en}\n</focal_english>` : '',
        ].join('\n');
        try {
          const s = await runKimiStreaming(
            c.env.AI as Ai, '@cf/moonshotai/kimi-k2.5',
            [
              { role: 'system', content: PESUKIM_SYNTHESIZE_PROMPT },
              { role: 'user', content: userContent },
            ],
            2000,
            { chatTemplateKwargs: { enable_thinking: false } },
          );
          let payload = s.content.trim();
          const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenced) payload = fenced[1].trim();
          const parsed = JSON.parse(payload) as PesukimSynthesizeReading;
          if (parsed && typeof parsed.explanation === 'string' && parsed.explanation.length > 0) {
            // Distinguish two pesukim sharing a verseRef on the same page by
            // appending the segment range — same convention enrichEntity uses.
            const refKey = p.startSegIdx != null ? `${lc}#${p.startSegIdx}` : lc;
            synthesizeByRef[refKey] = parsed;
          }
        } catch {
          // Tolerate per-pasuk failures — surface what we have.
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const enrichedPesukim = pesukimData.pesukim.map(p => {
      const lc = (p.verseRef || '').toLowerCase();
      const refKey = p.startSegIdx != null ? `${lc}#${p.startSegIdx}` : lc;
      const out: PesukimStoryShape = { ...p };
      const hit = synthesizeByRef[refKey] ?? synthesizeByRef[lc];
      if (hit) out.synthesize = hit;
      return out;
    });

    if (cache) {
      await cache.put(enrichCacheKey, JSON.stringify({ pesukim: enrichedPesukim }), { expirationTtl: 60 * 60 * 24 * 365 });
    }

    return c.json({
      pesukim: enrichedPesukim,
      _strategy: strategy,
      _cached: false,
      _elapsed_ms: Date.now() - t0,
      _metadata: {
        model: 'kimi-k2.5-no-thinking',
        total_pesukim: pesukimData.pesukim.length,
        synthesized: Object.keys(synthesizeByRef).length,
        deep_strategies_present: Object.keys(deepCachedByStrategy),
      },
    });
  }

  // Per-pasuk parallel calls. Each LLM call is bounded to ONE citation's
  // context — its verse text + that verse's specific commentary or daf
  // slice. Avoids the upstream 1031 errors we hit when batching all pesukim
  // on a verse-heavy daf into one giant prompt.
  let segsHe: string[] = [];
  let segsEn: string[] = [];
  if (strategy === 'gemara-usage' || strategy === 'exegesis') {
    try {
      const sef = await getSefariaSegmentsCached(cache, tractate, page);
      segsHe = (sef?.he ?? []).map(stripHtmlServer);
      segsEn = (sef?.en ?? []).map(stripHtmlServer);
    } catch { /* tolerated */ }
  }

  function dafSliceFor(p: Pasuk): { he: string; en: string } {
    const start = Math.max(0, (p.startSegIdx ?? 0) - 1);
    const end = Math.min(segsHe.length, (p.endSegIdx ?? p.startSegIdx ?? 0) + 2);
    const heSlice = segsHe.slice(start, end).map((s, i) => `[${start + i}] ${s}`).join('\n').slice(0, 1800);
    const enSlice = segsEn.slice(start, end).map((s, i) => `[${start + i}] ${s}`).join('\n').slice(0, 1500);
    return { he: heSlice, en: enSlice };
  }

  const systemPrompt =
    strategy === 'tanach-context' ? PESUKIM_TANACH_CONTEXT_PROMPT
    : strategy === 'peshat' ? PESUKIM_PESHAT_PROMPT
    : strategy === 'gemara-usage' ? PESUKIM_GEMARA_USAGE_PROMPT
    : PESUKIM_EXEGESIS_PROMPT;

  /** Build the per-pasuk user prompt for the current strategy. Each prompt
   *  carries only this verse's context — small, focused, and well below any
   *  upstream limits. */
  async function userContentFor(p: Pasuk): Promise<string> {
    const lines = [
      `Tractate: ${tractate}`,
      `Focal page: ${page}`,
      '',
      `<pasuk>\n${JSON.stringify(p, null, 2)}\n</pasuk>`,
    ];
    if (strategy === 'tanach-context') {
      const ctx = await getTanachVerseCached(cache, p.verseRef, 2);
      if (ctx) {
        const safeRef = p.verseRef.replace(/"/g, '&quot;');
        lines.push(
          '',
          `<tanach_context ref="${safeRef}">\n<hebrew>${ctx.surroundingHe}</hebrew>\n<english>${ctx.surroundingEn}</english>\n</tanach_context>`,
        );
      }
    } else if (strategy === 'peshat') {
      const comms = await getPeshatCommentariesCached(cache, p.verseRef);
      if (comms.length > 0) {
        const safeRef = p.verseRef.replace(/"/g, '&quot;');
        // Cap each commentator at 1500/1500 chars per call so a verse with all
        // four commentators stays well under any per-call limit.
        const inner = comms.map(c =>
          `<commentator name="${c.name}" ref="${c.ref}">\n<hebrew>${c.he.slice(0, 1500)}</hebrew>\n<english>${c.en.slice(0, 1500)}</english>\n</commentator>`
        ).join('\n');
        lines.push('', `<peshat_commentary ref="${safeRef}">\n${inner}\n</peshat_commentary>`);
      }
    } else {
      const slice = dafSliceFor(p);
      if (slice.he) lines.push('', `<focal_hebrew>\n${slice.he}\n</focal_hebrew>`);
      if (slice.en) lines.push(`<focal_english>\n${slice.en}\n</focal_english>`);
    }
    return lines.join('\n');
  }

  const t0 = Date.now();
  const concurrency = 4;
  // Per-strategy result buckets keyed by `${lcRef}#${segIdx}` so two
  // citations of the same verse on one page each get their own slice.
  const tanachByKey: Record<string, TanachContext> = {};
  const peshatByKey: Record<string, PeshatReading> = {};
  const gemaraByKey: Record<string, GemaraUsage> = {};
  const exegesisByKey: Record<string, ExegesisReading> = {};
  const failures: string[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= pesukimData.pesukim.length) return;
      const p = pesukimData.pesukim[idx];
      const lc = (p.verseRef || '').toLowerCase();
      const refKey = p.startSegIdx != null ? `${lc}#${p.startSegIdx}` : lc;
      try {
        const userContent = await userContentFor(p);
        const s = await runKimiStreaming(
          c.env.AI as Ai, '@cf/moonshotai/kimi-k2.5',
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          2000,
          { chatTemplateKwargs: { enable_thinking: false } },
        );
        let payload = s.content.trim();
        const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenced) payload = fenced[1].trim();
        const parsed = JSON.parse(payload);
        if (strategy === 'tanach-context') {
          const t = parsed as TanachContext;
          if (t && (t.contextSummary || t.bookContext)) tanachByKey[refKey] = t;
        } else if (strategy === 'peshat') {
          const t = parsed as PeshatReading;
          if (t && typeof t.peshat === 'string') peshatByKey[refKey] = t;
        } else if (strategy === 'gemara-usage') {
          const t = parsed as GemaraUsage;
          if (t && t.extractedClaim) gemaraByKey[refKey] = t;
        } else if (strategy === 'exegesis') {
          const t = parsed as ExegesisReading;
          if (t && Array.isArray(t.moves)) exegesisByKey[refKey] = t;
        }
      } catch (err) {
        failures.push(`${p.verseRef}: ${String(err).slice(0, 100)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const enrichedPesukim = pesukimData.pesukim.map(p => {
    const lc = (p.verseRef || '').toLowerCase();
    const refKey = p.startSegIdx != null ? `${lc}#${p.startSegIdx}` : lc;
    const out: PesukimStoryShape = { ...p };
    if (strategy === 'tanach-context' && tanachByKey[refKey]) out.tanachContext = tanachByKey[refKey];
    if (strategy === 'peshat' && peshatByKey[refKey]) out.peshat = peshatByKey[refKey];
    if (strategy === 'gemara-usage' && gemaraByKey[refKey]) out.gemaraUsage = gemaraByKey[refKey];
    if (strategy === 'exegesis' && exegesisByKey[refKey]) out.exegesis = exegesisByKey[refKey];
    return out;
  });

  if (cache) {
    await cache.put(enrichCacheKey, JSON.stringify({ pesukim: enrichedPesukim }), { expirationTtl: 60 * 60 * 24 * 365 });
  }

  const populated =
    strategy === 'tanach-context' ? Object.keys(tanachByKey).length
    : strategy === 'peshat' ? Object.keys(peshatByKey).length
    : strategy === 'gemara-usage' ? Object.keys(gemaraByKey).length
    : Object.keys(exegesisByKey).length;

  return c.json({
    pesukim: enrichedPesukim,
    _strategy: strategy,
    _cached: false,
    _elapsed_ms: Date.now() - t0,
    _metadata: {
      model: 'kimi-k2.5-no-thinking',
      total_pesukim: pesukimData.pesukim.length,
      populated_refs: populated,
      failures: failures.length > 0 ? failures.slice(0, 5) : undefined,
    },
  });
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
        recordTelemetry(c, { endpoint: 'daf-context', tractate, page, cache_hit: true, model: 'kimi-k2.5', ms: Date.now() - t0, ok: true });
        return c.json({ ...JSON.parse(cached) as DafContext, _cached: true, _stage: 2 });
      }
      return c.body(null, 204);
    }
    const upgraded = await cache.get(stage2Key);
    if (upgraded) {
      recordTelemetry(c, { endpoint: 'daf-context', tractate, page, cache_hit: true, model: 'kimi-k2.5', ms: Date.now() - t0, ok: true });
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
          ai, '@cf/moonshotai/kimi-k2.5', hebSnap, engSnap, tractate, page,
          { maxTokens: 16000, enableThinking: true },
        );
        if ('error' in r) {
          console.warn(`[daf-context:stage2] ${tractate}/${page} failed:`, r.error, r._diag ? JSON.stringify(r._diag) : '');
          recordTelemetry({ env, executionCtx: ctx }, { endpoint: 'daf-context-stage2', tractate, page, cache_hit: false, model: 'kimi-k2.5', ms: Date.now() - s2t0, ok: false, error_kind: classifyError(r.error) });
          return;
        }
        console.log(`[daf-context:stage2] ${tractate}/${page} ok rabbis=${r.rabbis.length}`, JSON.stringify(r._diag));
        const upgraded: DafContext = { rabbis: enrichAll(augmentWithKnownRabbis(r.rabbis, hebSnap)) };
        await cache.put(stage2Key, JSON.stringify(upgraded), { expirationTtl: 60 * 60 * 24 * 365 });
        recordTelemetry({ env, executionCtx: ctx }, { endpoint: 'daf-context-stage2', tractate, page, cache_hit: false, model: 'kimi-k2.5', ms: Date.now() - s2t0, ok: true });
      } catch (err) {
        console.warn(`[daf-context:stage2] ${tractate}/${page} threw:`, err);
        recordTelemetry({ env, executionCtx: ctx }, { endpoint: 'daf-context-stage2', tractate, page, cache_hit: false, model: 'kimi-k2.5', ms: Date.now() - s2t0, ok: false, error_kind: 'other' });
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

// Slim search index for the #sages browser. Returns one row per rabbinic
// entry with the fields needed for client-side fuzzy search + filter chips.
// Reads straight from the bundled rabbi-places.json — no cache lookup.
app.get('/api/sages-index', (c) => {
  const rows = Object.entries(RABBI_PLACES.rabbis)
    .filter(([, r]) => isRabbinicEntry(r))
    .map(([slug, r]) => ({
      slug,
      canonical: r.canonical,
      canonicalHe: r.canonicalHe ?? null,
      aliases: r.aliases ?? [],
      generation: r.generation ?? null,
      region: r.region ?? null,
    }));
  return c.json({ rows, count: rows.length });
});

app.get('/api/admin/enrich-rabbi/:slug', async (c) => {
  const slug = c.req.param('slug');
  const entry = RABBI_PLACES.rabbis[slug];
  if (!entry) return c.json({ error: `unknown slug: ${slug}` }, 404);
  if (!entry.bio) return c.json({ error: `no bio available for ${slug}` }, 422);

  // Cache per-slug — this Kimi-thinking call is ~30-60s and the upstream
  // gateway returns transient 502s. Once any daf surfaces a rabbi, every
  // other daf that references them reuses the same enrichment.
  const cache = c.env.CACHE;
  const cacheKey = `rabbi-bio:v1:${slug}`;
  const bypass = c.req.query('refresh') === '1';
  if (cache && !bypass) {
    const hit = await cache.get(cacheKey);
    if (hit) {
      try { return c.json({ ...JSON.parse(hit), _cached: true }); }
      catch { /* fall through */ }
    }
  }

  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

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
    const resp = await c.env.AI.run('@cf/moonshotai/kimi-k2.5' as never, {
      messages: [
        { role: 'system', content: ENRICH_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 65536,
      temperature: 0.1,
      chat_template_kwargs: { enable_thinking: false },
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
    const result = {
      slug,
      canonical: entry.canonical,
      ...parsed,
      _ms: Date.now() - t0,
    };
    if (cache) {
      c.executionCtx.waitUntil(cache.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 365 }));
    }
    return c.json(result);
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
    // Kimi K2.5 without thinking — matches the reliable /api/enrich path.
    // Relationship extraction is a bounded structured task, no reasoning
    // required; thinking mode was hanging the remote AI gateway.
    streamed = await runKimiStreaming(
      c.env.AI,
      '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: RELATIONSHIPS_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      8192,
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

// --- Admin: per-rabbi familial relation extraction ----------------------
// Companion to rabbi-relationships but for kinship (father / mother /
// spouse / children / siblings / uncles / nephews / cousins /
// grandparents / grandchildren / in-laws). Kept separate because the
// prompt and dataset shape are distinct: blood ties don't belong in
// the teacher/student/contemporary graph, and we often have a father
// who was *also* a teacher — they should surface in both places.

const FAMILY_RELATION_TYPES = [
  'father','mother','spouse','son','daughter','brother','sister',
  'uncle','aunt','nephew','niece',
  'grandfather','grandmother','grandson','granddaughter',
  'father-in-law','mother-in-law','son-in-law','daughter-in-law','brother-in-law','sister-in-law',
  'cousin','other',
] as const;
type FamilyRelation = typeof FAMILY_RELATION_TYPES[number];
const FAMILY_RELATION_SET = new Set<string>(FAMILY_RELATION_TYPES);

const FAMILY_SYSTEM_PROMPT = `You are a scholar of Talmudic history. You will receive ONE rabbi's canonical name, Hebrew name, generation, and an English bio. Extract the rabbi's FAMILIAL relationships — blood ties, marriage, and in-laws — with OTHER named people (rabbis, biblical figures, or otherwise).

Output STRICT JSON (no prose, no markdown):

{
  "family": [
    { "name": "<conventional English name of the relative>", "relation": "<one of the relation types listed below>" }
  ]
}

Relation types (use these exact strings):
father, mother, spouse, son, daughter, brother, sister,
uncle, aunt, nephew, niece,
grandfather, grandmother, grandson, granddaughter,
father-in-law, mother-in-law, son-in-law, daughter-in-law, brother-in-law, sister-in-law,
cousin, other

Rules:
- Include a relative ONLY when the bio or well-established tradition clearly supports it. Do NOT invent relations.
- 'spouse' applies to any wife (the rabbinic literature is pre-modern; there's no distinction field). If the rabbi had multiple wives, list each separately.
- 'son' / 'daughter' must be named. Unnamed children are not listed.
- If the rabbi's father was ALSO his teacher, still list him here as 'father' — the teacher/student graph is separate and both can be true.
- If the rabbi is a nephew / uncle of someone, emit the relation FROM the subject's perspective (e.g. 'Rabbah' listed as 'uncle' means Rabbah is the subject's uncle).
- Use 'other' only when the relation is familial but doesn't fit the enumerated types (step-relatives, adoptive, etc.).
- Names in English, ASCII, Sefaria-style spellings ('b.' for 'ben'). The subject must NOT appear in its own family list.
- Cap at 20 entries total. Empty array is fine if no family is attested.`;

interface FamilyEntry { name: string; relation: FamilyRelation }
interface FamilyResult { family: FamilyEntry[] }

function validateFamily(x: unknown): x is FamilyResult {
  if (!x || typeof x !== 'object') return false;
  const f = x as FamilyResult;
  if (!Array.isArray(f.family)) return false;
  for (const e of f.family) {
    if (!e || typeof e !== 'object') return false;
    if (typeof e.name !== 'string') return false;
    if (typeof e.relation !== 'string' || !FAMILY_RELATION_SET.has(e.relation)) return false;
  }
  return true;
}

app.get('/api/admin/rabbi-family/:slug', async (c) => {
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
      '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: FAMILY_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      8192,
    );
  } catch (err) {
    return c.json({ error: String(err).slice(0, 300), slug }, 502);
  }
  let payload = streamed.content.trim();
  if (!payload && streamed.reasoning_content) {
    const m = streamed.reasoning_content.match(/\{[\s\S]*"family"[\s\S]*\}/);
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
  if (!validateFamily(parsed)) {
    return c.json({ error: 'schema mismatch', slug, got: parsed }, 502);
  }
  // Resolve each name against the alias index. Non-rabbis (biblical
  // figures, unnamed historical people) won't resolve and return slug:null.
  const resolved: Array<FamilyEntry & { slug: string | null }> = parsed.family.map((e) => {
    const hit = resolveRabbiByName(e.name);
    return { name: e.name, relation: e.relation, slug: hit?.slug ?? null };
  });
  return c.json({
    slug,
    canonical: entry.canonical,
    family: resolved,
    _ms: Date.now() - t0,
  });
});

// --- Admin: orientation + domain + academy classification --------------
// One call per rabbi. Three axes:
//   orientation: mystical / practical / mixed / unknown
//   domain:      halakhist / aggadist / both / unknown
//   academies:   from a fixed vocabulary (Sura, Pumbedita, Nehardea,
//                Mehoza, Tiberias, Tzippori, Caesarea, Yavneh, Usha,
//                Bnei Brak, Lod, Jerusalem, other), cap 4.

const ACADEMY_VOCAB = [
  'Sura','Pumbedita','Nehardea','Mehoza','Tiberias','Tzippori','Caesarea',
  'Yavneh','Usha','Bnei Brak','Lod','Jerusalem','other',
] as const;

const ORIENTATION_SYSTEM_PROMPT = `You are a scholar of Talmudic history. Given a rabbi's canonical name, Hebrew name, generation, region, and English bio, classify THREE things about them.

Output STRICT JSON (no prose, no markdown):

{
  "orientation": "mystical | practical | mixed | unknown",
  "domain":      "halakhist | aggadist | both | unknown",
  "academies":   ["Sura", "Pumbedita", ...]
}

Definitions:
- orientation:
  - 'mystical':  known for merkavah mysticism, sod / esoteric teachings, aggadic visions, heavy engagement with hidden dimensions (e.g. R' Akiva's pardes, Shimon bar Yochai, R' Yehoshua b. Levi).
  - 'practical': known primarily for halakhic rulings, legal reasoning, communal leadership (e.g. R' Yehuda haNasi, Rava, R' Yose).
  - 'mixed':     genuinely strong on BOTH axes (e.g. R' Yochanan b. Nappacha).
  - 'unknown':   can't determine from bio + knowledge.

- domain:
  - 'halakhist': preserved teachings are predominantly halakhic (legal / ritual).
  - 'aggadist':  preserved teachings are predominantly aggadic (narrative, homiletic, ethical).
  - 'both':      equally known for both.
  - 'unknown'.

- academies: the Babylonian or Eretz-Yisrael academies / cities of teaching the rabbi is attested at, using EXACTLY these strings:
  Sura, Pumbedita, Nehardea, Mehoza, Tiberias, Tzippori, Caesarea, Yavneh, Usha, Bnei Brak, Lod, Jerusalem, other
  Cap at 4. Empty array if no academy / teaching-city is attested. Use 'other' only for a named academy not in this list (rare).

Rules:
- Base classifications on the bio AND well-established tradition. Don't guess.
- A rabbi 'mystical' in orientation can still be 'halakhist' in domain — the axes are distinct.
- Keep academies to places where the rabbi TAUGHT or HEADED an academy, not every city they visited.`;

interface OrientationResult {
  orientation: 'mystical' | 'practical' | 'mixed' | 'unknown';
  domain: 'halakhist' | 'aggadist' | 'both' | 'unknown';
  academies: string[];
}

const ORIENTATION_ENUM = new Set(['mystical', 'practical', 'mixed', 'unknown']);
const DOMAIN_ENUM = new Set(['halakhist', 'aggadist', 'both', 'unknown']);
const ACADEMY_ENUM = new Set<string>(ACADEMY_VOCAB);

function validateOrientation(x: unknown): x is OrientationResult {
  if (!x || typeof x !== 'object') return false;
  const o = x as OrientationResult;
  if (!ORIENTATION_ENUM.has(o.orientation)) return false;
  if (!DOMAIN_ENUM.has(o.domain)) return false;
  if (!Array.isArray(o.academies)) return false;
  if (o.academies.some((a) => typeof a !== 'string' || !ACADEMY_ENUM.has(a))) return false;
  return true;
}

app.get('/api/admin/rabbi-orientation/:slug', async (c) => {
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
    `Places:        ${(entry.places ?? []).join(', ')}`,
    '',
    `Bio:`,
    entry.bio,
  ].join('\n');

  const t0 = Date.now();
  let streamed: StreamedResult;
  try {
    streamed = await runKimiStreaming(
      c.env.AI,
      '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: ORIENTATION_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      4096,
    );
  } catch (err) {
    return c.json({ error: String(err).slice(0, 300), slug }, 502);
  }
  let payload = streamed.content.trim();
  if (!payload && streamed.reasoning_content) {
    const m = streamed.reasoning_content.match(/\{[\s\S]*"orientation"[\s\S]*\}/);
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
  if (!validateOrientation(parsed)) {
    return c.json({ error: 'schema mismatch', slug, got: parsed }, 502);
  }
  return c.json({
    slug,
    canonical: entry.canonical,
    ...parsed,
    _ms: Date.now() - t0,
  });
});

// --- Admin: unified rabbi enrichment ------------------------------------
// Single LLM call per sage. Pulls local data + Sefaria topic graph (cached
// in KV), feeds both to Kimi K2.5, returns one EnrichedRabbi record. Replaces
// the per-dimension scripts (orientation, family, hierarchy). Used by the
// EnrichRabbi workflow.

const SEFARIA_TOPIC_TTL_S = 60 * 60 * 24 * 30; // 30d
const SEFARIA_TOPIC_VERSION = 1;

interface SefariaRawTopic {
  primaryTitle?: { en?: string; he?: string };
  slug?: string;
  titles?: Array<{ text?: string; lang?: string }>;
  subclass?: string;
  properties?: {
    generation?: { value?: string } | string;
    enWikiLink?: { value?: string } | string;
    heWikiLink?: { value?: string } | string;
    jeLink?: { value?: string } | string;
    wikidataLink?: { value?: string } | string;
  };
  description?: { en?: string; he?: string };
  numSources?: number;
  image?: { image_uri?: string; image_caption?: { en?: string } };
  links?: Record<string, {
    title?: unknown;
    links?: Array<{
      topic?: string;
      order?: { tfidf?: number; linksInCommon?: number };
      isInverse?: boolean;
      dataSource?: string;
    }>;
  }>;
}

async function fetchSefariaTopicCached(
  slug: string,
  cache: KVNamespace | undefined,
): Promise<SefariaRawTopic | null> {
  const key = `sefaria:topic:v${SEFARIA_TOPIC_VERSION}:${slug}`;
  if (cache) {
    const hit = await cache.get(key, 'json') as SefariaRawTopic | null;
    if (hit) return hit;
  }
  const url = `https://www.sefaria.org/api/topics/${encodeURIComponent(slug)}?with_links=1&with_refs=0`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`sefaria topic ${slug}: HTTP ${res.status}`);
  const data = await res.json() as SefariaRawTopic;
  if (cache) {
    await cache.put(key, JSON.stringify(data), { expirationTtl: SEFARIA_TOPIC_TTL_S });
  }
  return data;
}

function unwrapPropertyValue(p: unknown): string | undefined {
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object' && 'value' in p) {
    const v = (p as { value?: unknown }).value;
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

function mapSefariaToInput(raw: SefariaRawTopic | null): SefariaInput | null {
  if (!raw) return null;
  const titles = (raw.titles ?? [])
    .filter((t): t is { text: string; lang: string } => typeof t.text === 'string' && (t.lang === 'en' || t.lang === 'he'))
    .map((t) => ({ text: t.text, lang: t.lang as 'en' | 'he' }));

  const refs: SefariaInput['refs'] = {};
  const enWiki = unwrapPropertyValue(raw.properties?.enWikiLink);
  const heWiki = unwrapPropertyValue(raw.properties?.heWikiLink);
  const je = unwrapPropertyValue(raw.properties?.jeLink);
  const wikidata = unwrapPropertyValue(raw.properties?.wikidataLink);
  if (enWiki) refs.enWiki = enWiki;
  if (heWiki) refs.heWiki = heWiki;
  if (je) refs.je = je;
  if (wikidata) refs.wikidata = wikidata;

  const image = raw.image?.image_uri
    ? { url: raw.image.image_uri, caption: raw.image.image_caption?.en ?? null }
    : null;

  const bucket = (predicate: string) =>
    (raw.links?.[predicate]?.links ?? [])
      .filter((l): l is { topic: string; order?: { tfidf?: number } } => typeof l.topic === 'string')
      .map((l) => ({ topic: l.topic, weight: l.order?.tfidf ?? null }));

  const familyPredicates: Array<[string, string]> = [
    ['child-of', 'child'],
    ['parent-of', 'parent'],
    ['sibling-of', 'sibling'],
    ['spouse-of', 'spouse'],
    ['child-in-law-of', 'child-in-law'],
    ['parent-in-law-of', 'parent-in-law'],
    ['ancestor-of', 'ancestor'],
    ['descendant-of', 'descendant'],
    ['grandchild-of', 'grandchild'],
    ['grandparent-of', 'grandparent'],
    ['cousin-of', 'cousin'],
  ];
  const family = familyPredicates.flatMap(([pred, rel]) =>
    bucket(pred).map((e) => ({ ...e, relation: rel })),
  );

  return {
    subclass: raw.subclass ?? null,
    generation: unwrapPropertyValue(raw.properties?.generation) ?? null,
    numSources: typeof raw.numSources === 'number' ? raw.numSources : null,
    titles,
    description: {
      en: raw.description?.en ?? '',
      he: raw.description?.he ?? '',
    },
    refs,
    image,
    edges: {
      learnedFrom: bucket('learned-from'),
      taught: bucket('taught'),
      family,
      opposed: bucket('opposed'),
      correspondedWith: bucket('corresponded-with'),
      memberOf: bucket('member-of'),
      participatesIn: bucket('participates-in'),
      relatedTo: bucket('related-to'),
    },
  };
}

function buildLocalRabbiInput(slug: string, entry: RabbiPlacesEntry): LocalRabbiInput {
  return {
    slug,
    canonical: entry.canonical,
    canonicalHe: entry.canonicalHe ?? null,
    aliases: entry.aliases ?? [],
    region: entry.region ?? null,
    generation: entry.generation ?? null,
    places: entry.places ?? [],
    bio: entry.bio ?? null,
    bioSource: (entry.bioSource as 'sefaria' | 'wikipedia' | undefined) ?? null,
    wiki: entry.wiki ?? null,
  };
}

/**
 * Walk every edge bucket and null out any slug that isn't in the canonical
 * rabbi list. Trust Sefaria-sourced slugs unconditionally (they came from
 * the same Sefaria `?type=person` dump). Catches LLM-fabricated slugs like
 * `rabbah-tosfaah` (real slug: `rav-rabbah-tosfaah`).
 */
function cleanFabricatedSlugs(out: LLMRabbiOutput, known: ReadonlySet<string>): void {
  const buckets: Array<Array<{ slug: string | null; source: 'sefaria' | 'llm' }>> = [
    out.teachers,
    out.students,
    out.family,
    out.opposed,
    out.influences,
  ];
  for (const bucket of buckets) {
    for (const e of bucket) {
      if (e.source === 'sefaria') continue;
      if (e.slug && !known.has(e.slug)) e.slug = null;
    }
  }
}

/**
 * Returns the slug of the highest-weight resolvable edge in a bucket, or
 * null if the bucket is empty / has no slugged entries / all weights null.
 * Compared on the LLM-emitted scale (Sefaria tfidf and LLM 0–1 mixed),
 * which is fine because raw tfidf for the top sage is always >>1.
 */
function topSlugByWeight(
  edges: ReadonlyArray<{ slug: string | null; weight: number | null }>,
): string | null {
  let best: { slug: string; weight: number } | null = null;
  for (const e of edges) {
    if (!e.slug) continue;
    const w = typeof e.weight === 'number' ? e.weight : -Infinity;
    if (!best || w > best.weight) best = { slug: e.slug, weight: w };
  }
  return best?.slug ?? null;
}

/**
 * Sefaria edges arrive with raw tfidf weights (0 to ~70). LLM-added edges
 * use a 0–1 confidence scale. Normalize each Sefaria bucket per-sage so the
 * top edge is 1.0 and the rest scale linearly. Preserves ranking; makes the
 * scale comparable to LLM-added edges.
 */
function normalizeEdgeWeights(out: LLMRabbiOutput): void {
  const buckets: Array<{ slug: string | null; name: string; weight: number | null; source: 'sefaria' | 'llm' }[]> = [
    out.teachers,
    out.students,
    out.family,
    out.opposed,
    out.influences,
  ];
  for (const bucket of buckets) {
    let max = 0;
    for (const e of bucket) {
      if (e.source === 'sefaria' && typeof e.weight === 'number' && e.weight > max) max = e.weight;
    }
    if (max <= 1) continue; // already 0–1 or empty
    for (const e of bucket) {
      if (e.source === 'sefaria' && typeof e.weight === 'number') {
        e.weight = Math.round((e.weight / max) * 1000) / 1000;
      }
    }
  }
}

export async function enrichRabbiUnified(
  slug: string,
  entry: RabbiPlacesEntry,
  ai: Ai,
  cache: KVNamespace | undefined,
): Promise<{ ok: true; record: EnrichedRabbiRecord; ms: number; promptChars: number; usage: StreamedResult['usage'] }
        | { ok: false; error: string; raw?: string; ms: number }> {
  const t0 = Date.now();
  const local = buildLocalRabbiInput(slug, entry);
  let sefariaRaw: SefariaRawTopic | null = null;
  try {
    sefariaRaw = await fetchSefariaTopicCached(slug, cache);
  } catch (err) {
    return { ok: false, error: `sefaria fetch: ${String(err).slice(0, 200)}`, ms: Date.now() - t0 };
  }
  const sefaria = mapSefariaToInput(sefariaRaw);
  const userContent = buildRabbiEnrichUserMessage({ local, sefaria });

  let streamed: StreamedResult;
  try {
    streamed = await runKimiStreaming(
      ai,
      '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: RABBI_ENRICH_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      12288,
      { chatTemplateKwargs: { enable_thinking: false } },
    );
  } catch (err) {
    return { ok: false, error: `llm: ${String(err).slice(0, 200)}`, ms: Date.now() - t0 };
  }

  let payload = streamed.content.trim();
  if (!payload && streamed.reasoning_content) {
    const m = streamed.reasoning_content.match(/\{[\s\S]*"slug"[\s\S]*\}/);
    if (m) payload = m[0];
  }
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) payload = fenced[1].trim();
  if (!payload) return { ok: false, error: 'empty payload', ms: Date.now() - t0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    const repaired = payload.replace(/,(\s*[}\]])/g, '$1').replace(/\r/g, '');
    try {
      parsed = JSON.parse(repaired);
    } catch {
      return {
        ok: false,
        error: `non-JSON: ${String(err).slice(0, 200)}`,
        raw: payload.slice(0, 800),
        ms: Date.now() - t0,
      };
    }
  }

  const failure = validateLLMRabbiOutput(parsed);
  if (failure) {
    return {
      ok: false,
      error: `schema: ${failure.path}: ${failure.message}`,
      raw: payload.slice(0, 800),
      ms: Date.now() - t0,
    };
  }

  const llmOut = parsed as LLMRabbiOutput;

  // Defensive cleaning — null any LLM-fabricated slugs that don't exist in
  // the canonical rabbi list. Sefaria slugs are trusted (they came from
  // the same `?type=person` dump that built RABBI_PLACES).
  const knownSlugs = new Set(Object.keys(RABBI_PLACES.rabbis));
  cleanFabricatedSlugs(llmOut, knownSlugs);

  // Deterministic overrides — these fields are mechanical, not synthesis.
  // Compute primaryTeacher/Student from edge weights BEFORE normalization
  // so we compare on the raw scale the LLM emitted (Sefaria tfidf >> 1).
  llmOut.primaryTeacher = topSlugByWeight(llmOut.teachers);
  llmOut.primaryStudent = topSlugByWeight(llmOut.students);
  if (sefariaRaw && typeof sefariaRaw.numSources === 'number') {
    llmOut.prominence = sefariaRaw.numSources;
  } else if (typeof llmOut.prominence === 'number' && llmOut.prominence <= 1) {
    // LLM emitted a 0–1 score with no Sefaria evidence — discard.
    llmOut.prominence = null;
  }

  normalizeEdgeWeights(llmOut);

  const sources: Array<'sefaria' | 'wikipedia' | 'llm'> = ['llm'];
  if (sefariaRaw) sources.unshift('sefaria');
  if (entry.bioSource === 'wikipedia') sources.push('wikipedia');

  const record: EnrichedRabbiRecord = {
    ...llmOut,
    schemaVersion: RABBI_SCHEMA_VERSION,
    enrichedAt: new Date().toISOString(),
    sources,
  };

  return {
    ok: true,
    record,
    ms: Date.now() - t0,
    promptChars: streamed.prompt_chars,
    usage: streamed.usage,
  };
}

app.get('/api/admin/rabbi-enrich-unified/:slug', async (c) => {
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  const slug = c.req.param('slug');
  const entry = RABBI_PLACES.rabbis[slug];
  if (!entry) return c.json({ error: `unknown slug: ${slug}` }, 404);

  const refresh = c.req.query('refresh') === '1';
  const cache = c.env.CACHE;
  const cacheKey = `rabbi-enriched:v1:${slug}`;
  if (cache && !refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) {
      return c.json({ slug, record: JSON.parse(hit), _cached: true });
    }
  }

  const result = await enrichRabbiUnified(slug, entry, c.env.AI, cache);
  if (!result.ok) {
    return c.json({ error: result.error, slug, raw: result.raw, _ms: result.ms }, 502);
  }
  if (cache) {
    await cache.put(cacheKey, JSON.stringify(result.record), {
      expirationTtl: 60 * 60 * 24 * 365,
    });
  }
  return c.json({
    slug,
    record: result.record,
    _ms: result.ms,
    _promptChars: result.promptChars,
    _usage: result.usage,
  });
});

// --- Per-sage no-AI enrichment stages -----------------------------------
// These read external APIs (Wikidata, MediaWiki) using URLs/QIDs already
// captured in rabbi-enriched:v1:{slug}.refs. Stage outputs are cached at
// their own keys so partial coverage is observable in the EnrichmentPage
// Rabbis tab. AI-free; cheap to re-run.

const RABBI_STAGE_TTL_S = 60 * 60 * 24 * 365;

interface WikidataStageRecord {
  qid: string;
  fatherQid: string | null;
  motherQid: string | null;
  spouseQids: string[];
  childQids: string[];
  studentQids: string[];
  teacherQids: string[];
  birthYear: number | null;
  deathYear: number | null;
  fetchedAt: string;
}

interface WikiBioStageRecord {
  enWiki: { url: string; title: string; extract: string } | null;
  heWiki: { url: string; title: string; extract: string } | null;
  fetchedAt: string;
}

async function readEnriched(
  cache: KVNamespace,
  slug: string,
): Promise<EnrichedRabbiRecord | null> {
  const hit = await cache.get(`rabbi-enriched:v1:${slug}`);
  if (!hit) return null;
  try {
    return JSON.parse(hit) as EnrichedRabbiRecord;
  } catch {
    return null;
  }
}

function parseWikidataYear(time: string | undefined): number | null {
  if (!time) return null;
  const m = time.match(/^([+-])(\d{4,})/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * parseInt(m[2], 10);
}

async function fetchWikidataEntity(qid: string): Promise<WikidataStageRecord | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json() as {
    entities?: Record<string, {
      claims?: Record<string, Array<{
        mainsnak?: { datavalue?: { value?: { id?: string; time?: string } } };
      }>>;
    }>;
  };
  const entity = data.entities?.[qid];
  if (!entity || !entity.claims) return null;

  const idsFor = (prop: string): string[] =>
    (entity.claims?.[prop] ?? [])
      .map((c) => c.mainsnak?.datavalue?.value?.id)
      .filter((v): v is string => typeof v === 'string');

  const firstId = (prop: string): string | null => idsFor(prop)[0] ?? null;

  const yearFor = (prop: string): number | null => {
    const claim = entity.claims?.[prop]?.[0];
    return parseWikidataYear(claim?.mainsnak?.datavalue?.value?.time);
  };

  return {
    qid,
    fatherQid: firstId('P22'),
    motherQid: firstId('P25'),
    spouseQids: idsFor('P26'),
    childQids: idsFor('P40'),
    studentQids: idsFor('P802'),
    teacherQids: idsFor('P1066'),
    birthYear: yearFor('P569'),
    deathYear: yearFor('P570'),
    fetchedAt: new Date().toISOString(),
  };
}

app.get('/api/admin/rabbi-wikidata/:slug', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);
  const slug = c.req.param('slug');
  if (!RABBI_PLACES.rabbis[slug]) return c.json({ error: `unknown slug: ${slug}` }, 404);

  const refresh = c.req.query('refresh') === '1';
  const cacheKey = `rabbi-wikidata:v1:${slug}`;
  if (!refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) return c.json({ slug, record: JSON.parse(hit), _cached: true });
  }

  const enriched = await readEnriched(cache, slug);
  if (!enriched) return c.json({ error: 'run unified stage first', slug }, 412);
  const wd = enriched.refs.wikidata;
  if (!wd) return c.json({ error: 'no wikidata QID on enriched record', slug }, 422);

  const m = wd.match(/Q\d+/);
  if (!m) return c.json({ error: `unparseable wikidata ref: ${wd}`, slug }, 422);
  const qid = m[0];

  const t0 = Date.now();
  let record: WikidataStageRecord | null;
  try {
    record = await fetchWikidataEntity(qid);
  } catch (err) {
    return c.json({ error: `wikidata fetch: ${String(err).slice(0, 200)}`, slug }, 502);
  }
  if (!record) return c.json({ error: 'wikidata entity not found', slug, qid }, 404);

  await cache.put(cacheKey, JSON.stringify(record), { expirationTtl: RABBI_STAGE_TTL_S });
  return c.json({ slug, record, _ms: Date.now() - t0 });
});

async function fetchWikipediaExtract(
  url: string,
  lang: 'en' | 'he',
): Promise<{ url: string; title: string; extract: string } | null> {
  // Pull the page title from /wiki/<title> URL fragment.
  const m = url.match(/\/wiki\/([^?#]+)/);
  if (!m) return null;
  const title = decodeURIComponent(m[1]);
  const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&exintro=0&redirects=1&titles=${encodeURIComponent(title)}&origin=*`;
  const res = await fetch(apiUrl, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json() as {
    query?: { pages?: Record<string, { title?: string; extract?: string; missing?: '' }> };
  };
  const pages = data.query?.pages ?? {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined || !page.extract) return null;
  return { url, title: page.title ?? title, extract: page.extract };
}

app.get('/api/admin/rabbi-wiki-bio/:slug', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);
  const slug = c.req.param('slug');
  if (!RABBI_PLACES.rabbis[slug]) return c.json({ error: `unknown slug: ${slug}` }, 404);

  const refresh = c.req.query('refresh') === '1';
  const cacheKey = `rabbi-wiki-bio:v1:${slug}`;
  if (!refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) return c.json({ slug, record: JSON.parse(hit), _cached: true });
  }

  const enriched = await readEnriched(cache, slug);
  if (!enriched) return c.json({ error: 'run unified stage first', slug }, 412);
  const enWiki = enriched.refs.enWiki ?? null;
  const heWiki = enriched.refs.heWiki ?? null;
  if (!enWiki && !heWiki) return c.json({ error: 'no wiki refs on enriched record', slug }, 422);

  const t0 = Date.now();
  const [en, he] = await Promise.all([
    enWiki ? fetchWikipediaExtract(enWiki, 'en').catch(() => null) : Promise.resolve(null),
    heWiki ? fetchWikipediaExtract(heWiki, 'he').catch(() => null) : Promise.resolve(null),
  ]);
  const record: WikiBioStageRecord = {
    enWiki: en,
    heWiki: he,
    fetchedAt: new Date().toISOString(),
  };
  await cache.put(cacheKey, JSON.stringify(record), { expirationTtl: RABBI_STAGE_TTL_S });
  return c.json({ slug, record, _ms: Date.now() - t0 });
});

// --- Global compile endpoints --------------------------------------------
// These scan every rabbi-enriched:v1:* and emit one aggregate blob each.
// No AI; cheap (KV-only). Run after a per-sage refresh batch is done.

interface RabbiGraphNode {
  slug: string;
  canonical: string;
  canonicalHe: string;
  generation: string | null;
  region: string | null;
  academy: string | null;
  primaryTeacher: string | null;
  primaryStudent: string | null;
  teachers: Array<{ slug: string | null; name: string; weight: number | null; source: string }>;
  students: Array<{ slug: string | null; name: string; weight: number | null; source: string }>;
  family: Array<{ slug: string | null; name: string; relation: string; weight: number | null; source: string }>;
  opposed: Array<{ slug: string | null; name: string; weight: number | null; source: string }>;
}

interface RabbiGraphBlob {
  generatedAt: string;
  count: number;
  nodes: Record<string, RabbiGraphNode>;
}

async function listEnrichedSlugs(cache: KVNamespace): Promise<string[]> {
  const prefix = 'rabbi-enriched:v1:';
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await cache.list({ prefix, cursor, limit: 1000 });
    for (const k of page.keys) out.push(k.name.slice(prefix.length));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

async function readAllEnriched(cache: KVNamespace): Promise<EnrichedRabbiRecord[]> {
  const slugs = await listEnrichedSlugs(cache);
  const out: EnrichedRabbiRecord[] = [];
  // Sequential — KV `get` is fast and 1.3K calls finish in well under a request budget.
  for (const slug of slugs) {
    const rec = await readEnriched(cache, slug);
    if (rec) out.push(rec);
  }
  return out;
}

const FAMILY_INVERSE: Record<string, string> = {
  father: 'son',
  mother: 'son',
  son: 'father',
  daughter: 'father',
  spouse: 'spouse',
  brother: 'brother',
  sister: 'sister',
  uncle: 'nephew',
  aunt: 'nephew',
  nephew: 'uncle',
  niece: 'aunt',
  grandfather: 'grandson',
  grandmother: 'grandson',
  grandson: 'grandfather',
  granddaughter: 'grandfather',
  'father-in-law': 'son-in-law',
  'mother-in-law': 'son-in-law',
  'son-in-law': 'father-in-law',
  'daughter-in-law': 'father-in-law',
  'brother-in-law': 'brother-in-law',
  'sister-in-law': 'sister-in-law',
  cousin: 'cousin',
  ancestor: 'descendant',
  descendant: 'ancestor',
  other: 'other',
};

app.post('/api/admin/rabbi-compile/graph', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

  const t0 = Date.now();
  const all = await readAllEnriched(cache);

  // Seed nodes from each enriched record's local view.
  const nodes: Record<string, RabbiGraphNode> = {};
  for (const r of all) {
    nodes[r.slug] = {
      slug: r.slug,
      canonical: r.canonical.en,
      canonicalHe: r.canonical.he,
      generation: r.generation,
      region: r.region,
      academy: r.academy,
      primaryTeacher: r.primaryTeacher,
      primaryStudent: r.primaryStudent,
      teachers: r.teachers.map((e) => ({ slug: e.slug, name: e.name, weight: e.weight, source: e.source })),
      students: r.students.map((e) => ({ slug: e.slug, name: e.name, weight: e.weight, source: e.source })),
      family: r.family.map((e) => ({ slug: e.slug, name: e.name, relation: e.relation, weight: e.weight, source: e.source })),
      opposed: r.opposed.map((e) => ({ slug: e.slug, name: e.name, weight: e.weight, source: e.source })),
    };
  }

  // Bidirectional reciprocity. If A.teachers includes B, ensure B.students
  // includes A. Same for student↔teacher and family inversions. Skip when
  // an inverted edge is already present (dedupe by slug); otherwise add it.
  const ensureEdge = (
    bucket: Array<{ slug: string | null; name: string; weight: number | null; source: string }>,
    edge: { slug: string; name: string; weight: number | null; source: string },
  ) => {
    if (bucket.some((e) => e.slug === edge.slug)) return;
    bucket.push(edge);
  };

  for (const node of Object.values(nodes)) {
    for (const t of node.teachers) {
      if (!t.slug) continue;
      const other = nodes[t.slug];
      if (!other) continue;
      ensureEdge(other.students, { slug: node.slug, name: node.canonical, weight: t.weight, source: t.source });
    }
    for (const s of node.students) {
      if (!s.slug) continue;
      const other = nodes[s.slug];
      if (!other) continue;
      ensureEdge(other.teachers, { slug: node.slug, name: node.canonical, weight: s.weight, source: s.source });
    }
    for (const f of node.family) {
      if (!f.slug) continue;
      const other = nodes[f.slug];
      if (!other) continue;
      const inv = FAMILY_INVERSE[f.relation] ?? 'other';
      if (other.family.some((e) => e.slug === node.slug && e.relation === inv)) continue;
      other.family.push({ slug: node.slug, name: node.canonical, relation: inv, weight: f.weight, source: f.source });
    }
    for (const o of node.opposed) {
      if (!o.slug) continue;
      const other = nodes[o.slug];
      if (!other) continue;
      ensureEdge(other.opposed, { slug: node.slug, name: node.canonical, weight: o.weight, source: o.source });
    }
  }

  const blob: RabbiGraphBlob = {
    generatedAt: new Date().toISOString(),
    count: Object.keys(nodes).length,
    nodes,
  };
  await cache.put('rabbi-graph:v1', JSON.stringify(blob), { expirationTtl: RABBI_STAGE_TTL_S });
  return c.json({ ok: true, count: blob.count, _ms: Date.now() - t0 });
});

interface RabbiCohortBlob {
  generatedAt: string;
  // generation code → list of slugs in that generation
  byGeneration: Record<string, string[]>;
  // slug → contemporary slugs (same generation)
  bySage: Record<string, string[]>;
}

app.post('/api/admin/rabbi-compile/cohort', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

  const t0 = Date.now();
  const all = await readAllEnriched(cache);
  const byGeneration: Record<string, string[]> = {};
  for (const r of all) {
    if (!r.generation) continue;
    (byGeneration[r.generation] ??= []).push(r.slug);
  }
  const bySage: Record<string, string[]> = {};
  for (const [, slugs] of Object.entries(byGeneration)) {
    for (const slug of slugs) {
      bySage[slug] = slugs.filter((s) => s !== slug);
    }
  }
  const blob: RabbiCohortBlob = {
    generatedAt: new Date().toISOString(),
    byGeneration,
    bySage,
  };
  await cache.put('rabbi-cohort:v1', JSON.stringify(blob), { expirationTtl: RABBI_STAGE_TTL_S });
  return c.json({ ok: true, generations: Object.keys(byGeneration).length, sages: Object.keys(bySage).length, _ms: Date.now() - t0 });
});

interface RabbiPlacesIndexBlob {
  generatedAt: string;
  // place name → slugs known to have lived/taught there
  byPlace: Record<string, string[]>;
}

app.post('/api/admin/rabbi-compile/places-index', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

  const t0 = Date.now();
  const all = await readAllEnriched(cache);
  const byPlace: Record<string, string[]> = {};
  for (const r of all) {
    for (const place of r.places ?? []) {
      const key = place.trim();
      if (!key) continue;
      (byPlace[key] ??= []).push(r.slug);
    }
  }
  const blob: RabbiPlacesIndexBlob = {
    generatedAt: new Date().toISOString(),
    byPlace,
  };
  await cache.put('rabbi-places-index:v1', JSON.stringify(blob), { expirationTtl: RABBI_STAGE_TTL_S });
  return c.json({ ok: true, places: Object.keys(byPlace).length, _ms: Date.now() - t0 });
});

interface RabbiAcademyRosterBlob {
  generatedAt: string;
  // academy enum → slugs
  byAcademy: Record<string, string[]>;
}

app.post('/api/admin/rabbi-compile/academy-roster', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

  const t0 = Date.now();
  const all = await readAllEnriched(cache);
  const byAcademy: Record<string, string[]> = {};
  for (const r of all) {
    if (!r.academy) continue;
    (byAcademy[r.academy] ??= []).push(r.slug);
  }
  const blob: RabbiAcademyRosterBlob = {
    generatedAt: new Date().toISOString(),
    byAcademy,
  };
  await cache.put('rabbi-academy-roster:v1', JSON.stringify(blob), { expirationTtl: RABBI_STAGE_TTL_S });
  return c.json({ ok: true, academies: Object.keys(byAcademy).length, _ms: Date.now() - t0 });
});

// Read endpoints for the compiled blobs (consumed by the EnrichmentPage and
// later by daf views).
app.get('/api/admin/rabbi-graph', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const hit = await c.env.CACHE.get('rabbi-graph:v1');
  if (!hit) return c.json({ error: 'not compiled' }, 404);
  return c.json(JSON.parse(hit));
});

app.get('/api/admin/rabbi-cohort', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const hit = await c.env.CACHE.get('rabbi-cohort:v1');
  if (!hit) return c.json({ error: 'not compiled' }, 404);
  return c.json(JSON.parse(hit));
});

app.get('/api/admin/rabbi-places-index', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const hit = await c.env.CACHE.get('rabbi-places-index:v1');
  if (!hit) return c.json({ error: 'not compiled' }, 404);
  return c.json(JSON.parse(hit));
});

app.get('/api/admin/rabbi-academy-roster', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const hit = await c.env.CACHE.get('rabbi-academy-roster:v1');
  if (!hit) return c.json({ error: 'not compiled' }, 404);
  return c.json(JSON.parse(hit));
});

// Read-only daf-level enrichment cache snapshot. Returns whichever
// per-strategy daf-level results are already cached for every entity type
// EnrichmentPage cares about. No AI; KV-only. Drives Phase B preload —
// cached strategies render immediately on Load without forcing the user to
// click each button.
app.get('/api/enrich-cached-daf/:tractate/:page', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');

  const readJson = async <T>(key: string): Promise<T | null> => {
    const hit = await cache.get(key);
    if (!hit) return null;
    try { return JSON.parse(hit) as T; } catch { return null; }
  };

  const argumentStrategies = STRATEGY_NAMES;
  const halachaStrategies = STRATEGIES.halacha;
  const aggadataStrategies = STRATEGIES.aggadata;
  const pesukimStrategies = STRATEGIES.pesukim;
  const regionStrategies = STRATEGIES.region;
  const mesorahStrategies = STRATEGIES.mesorah;

  const [argumentEntries, halacha, aggadata, pesukim, regionEntries, mesorahEntries] = await Promise.all([
    Promise.all(argumentStrategies.map(async (s) => [s, await readJson<unknown>(`enrich-arg:v1:${s}:${tractate}:${page}`)] as const)),
    readJson<unknown>(`halacha:v1:${tractate}:${page}`),
    readJson<unknown>(`aggadata:v5:${tractate}:${page}`),
    readJson<unknown>(`pesukim:v1:${tractate}:${page}`),
    Promise.all(regionStrategies.map(async (s) => [s, await readJson<unknown>(`enrich-region:v1:${s}:${tractate}:${page}`)] as const)),
    Promise.all(mesorahStrategies.map(async (s) => [s, await readJson<unknown>(`enrich-mesorah:v1:${s}:${tractate}:${page}`)] as const)),
  ]);

  // For halacha/aggadata/pesukim, the daf-level enrichment cache (e.g.
  // enrich-halacha:v1:{strategy}:{t}:{p}) holds the *enriched topics list*.
  // We return both the stage-1 and the per-strategy enriched merges so the
  // client can populate either path.
  const halachaPerStrategy: Record<string, unknown> = {};
  for (const s of halachaStrategies) {
    halachaPerStrategy[s] = await readJson<unknown>(`enrich-halacha:v1:${s}:${tractate}:${page}`);
  }
  const aggadataPerStrategy: Record<string, unknown> = {};
  for (const s of aggadataStrategies) {
    aggadataPerStrategy[s] = await readJson<unknown>(`aggadata-enrich:v1:${s}:${tractate}:${page}`);
  }
  const pesukimPerStrategy: Record<string, unknown> = {};
  for (const s of pesukimStrategies) {
    pesukimPerStrategy[s] = await readJson<unknown>(`pesukim-enrich:v1:${s}:${tractate}:${page}`);
  }

  return c.json({
    tractate,
    page,
    argument:  Object.fromEntries(argumentEntries),
    halacha:   { stage1: halacha, perStrategy: halachaPerStrategy },
    aggadata:  { stage1: aggadata, perStrategy: aggadataPerStrategy },
    pesukim:   { stage1: pesukim, perStrategy: pesukimPerStrategy },
    region:    Object.fromEntries(regionEntries),
    mesorah:   Object.fromEntries(mesorahEntries),
  });
});

// Coverage report — counts each rabbi-* prefix and surfaces compile timestamps.
// Drives the Rabbis tab coverage strip in EnrichmentPage. Cheap KV listings.
app.get('/api/admin/rabbi-cache-stats', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

  const countPrefix = async (prefix: string): Promise<number> => {
    let n = 0;
    let cursor: string | undefined;
    do {
      const page = await cache.list({ prefix, cursor, limit: 1000 });
      n += page.keys.length;
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return n;
  };

  const readGeneratedAt = async (key: string): Promise<string | null> => {
    const hit = await cache.get(key);
    if (!hit) return null;
    try {
      const obj = JSON.parse(hit) as { generatedAt?: unknown };
      return typeof obj.generatedAt === 'string' ? obj.generatedAt : null;
    } catch {
      return null;
    }
  };

  const totalSlugs = Object.entries(RABBI_PLACES.rabbis).filter(([, r]) => isRabbinicEntry(r)).length;

  const [unified, wikidata, wikiBio, influences, appearances, keyDafim,
         graphAt, cohortAt, placesAt, academyAt] = await Promise.all([
    countPrefix('rabbi-enriched:v1:'),
    countPrefix('rabbi-wikidata:v1:'),
    countPrefix('rabbi-wiki-bio:v1:'),
    countPrefix('rabbi-influences:v1:'),
    countPrefix('rabbi-appearances:v1:'),
    countPrefix('rabbi-key-dafim:v1:'),
    readGeneratedAt('rabbi-graph:v1'),
    readGeneratedAt('rabbi-cohort:v1'),
    readGeneratedAt('rabbi-places-index:v1'),
    readGeneratedAt('rabbi-academy-roster:v1'),
  ]);

  return c.json({
    totalSlugs,
    perSage: { unified, wikidata, wikiBio, influences, appearances, keyDafim },
    globals: {
      graph: graphAt,
      cohort: cohortAt,
      placesIndex: placesAt,
      academyRoster: academyAt,
    },
  });
});

// --- Daf-scoped: Region (Israel/Bavel) + Migration ----------------------
// First-pass endpoint reads the cached argument skeleton's rabbiNames per
// section, resolves to slugs, joins to rabbi-enriched:v1:{slug}'s region/
// places fields, returns distribution + migration indicators. Pure KV
// joins, no AI. Cached at region:v1:{tractate}:{page}.

interface RegionSagePerSection {
  slug: string | null;
  name: string;
  region: 'israel' | 'bavel' | 'mixed' | null;
  places: string[];
  migrated: boolean;
}

interface RegionFirstPass {
  generatedAt: string;
  totalNamed: number;
  resolved: number;
  distribution: { israel: number; bavel: number; mixed: number; unknown: number };
  migrated: Array<{ slug: string; name: string; places: string[] }>;
  sections: Array<{
    title: string;
    sages: RegionSagePerSection[];
  }>;
  // Sages on the daf with no rabbi-enriched record yet (workflow gap).
  unenriched: string[];
}

app.get('/api/region/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

  const refresh = c.req.query('refresh') === '1';
  const cacheKey = `region:v1:${tractate}:${page}`;
  if (!refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) return c.json({ ...JSON.parse(hit), _cached: true });
  }

  // Pull skeleton (Stage A) — required input.
  const skelRaw = await cache.get(`analyze-skel:v2:${tractate}:${page}`);
  if (!skelRaw) {
    return c.json({
      error: 'No cached skeleton; run /api/analyze/.../?skeleton_only=1 first',
    }, 412);
  }
  const skeleton = JSON.parse(skelRaw) as DafSkeleton;

  const t0 = Date.now();
  const distribution = { israel: 0, bavel: 0, mixed: 0, unknown: 0 };
  const migrated: RegionFirstPass['migrated'] = [];
  const unenriched = new Set<string>();
  const sections: RegionFirstPass['sections'] = [];
  let totalNamed = 0;
  let resolved = 0;
  // Dedupe distribution counts across sections — count each sage once per daf.
  const seenSlugs = new Set<string>();

  for (const sec of skeleton.sections) {
    const sages: RegionSagePerSection[] = [];
    for (const name of sec.rabbiNames) {
      totalNamed++;
      const res = resolveRabbiByName(name);
      if (!res) {
        sages.push({ slug: null, name, region: null, places: [], migrated: false });
        continue;
      }
      resolved++;
      const enriched = await readEnriched(cache, res.slug);
      if (!enriched) {
        unenriched.add(res.slug);
        sages.push({ slug: res.slug, name, region: null, places: [], migrated: false });
        continue;
      }
      const region = (enriched.region as RegionSagePerSection['region']) ?? null;
      const places = enriched.places ?? [];
      const migratedSage = inferMigration(places);
      sages.push({ slug: res.slug, name, region, places, migrated: migratedSage });

      if (!seenSlugs.has(res.slug)) {
        seenSlugs.add(res.slug);
        if (region === 'israel') distribution.israel++;
        else if (region === 'bavel') distribution.bavel++;
        else if (region === 'mixed') distribution.mixed++;
        else distribution.unknown++;
        if (migratedSage) {
          migrated.push({ slug: res.slug, name: enriched.canonical.en, places });
        }
      }
    }
    sections.push({ title: sec.title, sages });
  }

  const out: RegionFirstPass = {
    generatedAt: new Date().toISOString(),
    totalNamed,
    resolved,
    distribution,
    migrated,
    sections,
    unenriched: [...unenriched],
  };
  await cache.put(cacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
  return c.json({ ...out, _ms: Date.now() - t0 });
});

// Heuristic — a sage with places spanning both regions is a likely migrant.
// Knowingly conservative: places like "Tiberias" + "Sura" are clear yes; a
// single ambiguous place like "Eretz Yisrael" doesn't trigger.
const ISRAEL_PLACES = new Set([
  'Tiberias', 'Sepphoris', 'Tzipori', 'Caesarea', 'Yavneh', 'Usha', 'Lod', 'Bnei Brak',
  'Jerusalem', 'Eretz Yisrael', 'Galilee', 'Judea',
]);
const BAVEL_PLACES = new Set([
  'Sura', 'Pumbedita', 'Nehardea', 'Mehoza', 'Naresh', 'Mata Mehasya', 'Babylonia',
  'Pum Nahara',
]);

function inferMigration(places: string[]): boolean {
  let inIsrael = false;
  let inBavel = false;
  for (const p of places) {
    if (ISRAEL_PLACES.has(p)) inIsrael = true;
    if (BAVEL_PLACES.has(p)) inBavel = true;
  }
  return inIsrael && inBavel;
}

// --- Daf-scoped: Mesorah / chain-of-tradition ---------------------------
// First-pass walks rabbi-graph:v1's primaryTeacher up to depth N for every
// sage on the daf. Cached at mesorah:v1:{tractate}:{page}.

interface MesorahChainStep { slug: string; canonical: string; canonicalHe: string; generation: string | null }
interface MesorahFirstPass {
  generatedAt: string;
  depth: number;
  totalNamed: number;
  resolved: number;
  // sage slug → chain back from sage (excluding sage) up to depth steps
  chains: Record<string, MesorahChainStep[]>;
  unenriched: string[];
  graphMissing: boolean;
}

const DEFAULT_MESORAH_DEPTH = 4;

app.get('/api/mesorah/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

  const refresh = c.req.query('refresh') === '1';
  const depthQ = parseInt(c.req.query('depth') ?? '', 10);
  const depth = Number.isFinite(depthQ) && depthQ > 0 && depthQ <= 10 ? depthQ : DEFAULT_MESORAH_DEPTH;

  const cacheKey = `mesorah:v1:${tractate}:${page}`;
  if (!refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) return c.json({ ...JSON.parse(hit), _cached: true });
  }

  const skelRaw = await cache.get(`analyze-skel:v2:${tractate}:${page}`);
  if (!skelRaw) {
    return c.json({
      error: 'No cached skeleton; run /api/analyze/.../?skeleton_only=1 first',
    }, 412);
  }
  const skeleton = JSON.parse(skelRaw) as DafSkeleton;

  const graphRaw = await cache.get('rabbi-graph:v1');
  let graph: RabbiGraphBlob | null = null;
  if (graphRaw) {
    try { graph = JSON.parse(graphRaw) as RabbiGraphBlob; } catch { graph = null; }
  }

  const t0 = Date.now();
  const namedSlugs = new Set<string>();
  const unenriched = new Set<string>();
  let totalNamed = 0;
  let resolved = 0;
  for (const sec of skeleton.sections) {
    for (const name of sec.rabbiNames) {
      totalNamed++;
      const res = resolveRabbiByName(name);
      if (!res) continue;
      resolved++;
      namedSlugs.add(res.slug);
    }
  }

  const chains: MesorahFirstPass['chains'] = {};
  if (graph) {
    for (const slug of namedSlugs) {
      const node = graph.nodes[slug];
      if (!node) {
        unenriched.add(slug);
        continue;
      }
      const chain: MesorahChainStep[] = [];
      let cursor: string | null = node.primaryTeacher;
      const seen = new Set<string>([slug]);
      for (let i = 0; i < depth && cursor; i++) {
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const upstream = graph.nodes[cursor];
        if (!upstream) break;
        chain.push({
          slug: upstream.slug,
          canonical: upstream.canonical,
          canonicalHe: upstream.canonicalHe,
          generation: upstream.generation,
        });
        cursor = upstream.primaryTeacher;
      }
      chains[slug] = chain;
    }
  } else {
    for (const slug of namedSlugs) unenriched.add(slug);
  }

  const out: MesorahFirstPass = {
    generatedAt: new Date().toISOString(),
    depth,
    totalNamed,
    resolved,
    chains,
    unenriched: [...unenriched],
    graphMissing: !graph,
  };
  await cache.put(cacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
  return c.json({ ...out, _ms: Date.now() - t0 });
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
    const resp = await c.env.AI.run('@cf/moonshotai/kimi-k2.5' as never, {
      messages: [
        { role: 'system', content: TRANSLATE_BIO_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 16000,
      temperature: 0.1,
      chat_template_kwargs: { enable_thinking: false },
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

// ---------------------------------------------------------------------------
// Era stratification (experiment): per-segment era classification via Kimi K2.6.
// Counterpart to the heuristic in src/lib/era/heuristic.ts. Used by the
// #experiment client page to compare LLM picks against heuristic picks before
// the feature graduates to the main daf view. Cache key is bumped (era-llm:v1)
// independently from daf-context so the experiment endpoint can iterate freely.
// ---------------------------------------------------------------------------

const ERA_LLM_JSON_SCHEMA = {
  name: 'era_picks',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['picks'],
    properties: {
      picks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['idx', 'era', 'why'],
          properties: {
            idx: { type: 'integer' },
            era: { type: 'string', enum: GENERATION_IDS },
            why: { type: 'string' },
          },
        },
      },
    },
  },
};

const ERA_LLM_SYSTEM_PROMPT = `You are a Talmud philologist. For each numbered segment, output the most-likely historical period (a generation ID) when that segment's content was authored or transmitted.

Use these signals (in order):
1. Named speaker/attribution — if a known sage is the speaker, the era is that sage's generation. This includes: stories ABOUT a named sage (the events depicted are that sage's era, even when narrated in stam Aramaic).
2. Structural markers — מתני׳/מתניתין → tanna-5; דתניא/תנו רבנן/תניא → tanna-4 (anonymous baraita); דתנן → tanna-5 (cited mishna). BEWARE: bare תנא or דתני followed by interrogatives (היכא, קאי, פתח, אקרא, דקתני) is STAM REFERRING TO THE MISHNA'S TANNA, not a baraita citation — classify as amora-bavel-8.
3. Language register — Mishnaic Hebrew → tannaitic; Babylonian Aramaic dialectical voice (איתמר, מאי טעמא, איבעיא להו, מתקיף, פשיטא, קמ"ל) → late amora-bavel/Stam (amora-bavel-8); Galilean Aramaic → amora-ey-*.
4. Anonymous redactional voice (Stam) → amora-bavel-8.
5. Quoted scripture is not the segment's own voice — judge by the surrounding voice.

ZUGIM: stories or sayings about Hillel, Shammai, Beit Hillel/Shammai, the five pairs (Yose ben Yoezer/Yose ben Yochanan, Yehoshua ben Perachya/Nittai of Arbel, etc.) → 'zugim', NOT tanna-1. The Zugim era ended c. 10 CE, before Tanna-1.

CRITICAL — anti-confabulation rule: your "why" string MUST quote the literal Hebrew/Aramaic token from the segment that justified your pick. Do NOT invent markers. If the segment does not contain מתני, תניא, דתניא, etc., DO NOT claim it does. If the only signal is register/style, say so honestly: "stam dialectical voice" or "Mishnaic Hebrew register". A wrong-but-honest "why" is more useful than a confident-but-fabricated one.

CRITICAL — DON'T over-classify as Stam. Mishnaic Hebrew is unmistakable: dense participles (אומר/אומרים), particles like שֶׁ-, no Aramaic dialectical markers (no איתמר, מאי, פשיטא, קמ"ל), and named tannaim using the formula "X אומר" or "דברי X". Such segments are tanna-* (the speaker's tanna era if named, otherwise tanna-5 for the Mishna's stratum). They are NEVER amora-bavel-8.

Respect the heuristic guess provided in parentheses unless you have a CONCRETE reason to disagree (a named speaker the heuristic missed, a clear marker, an unmistakable register signal). When the heuristic says "tanna-5" because the segment looks like Mishna, and the segment contains no Aramaic dialectical tokens, defer to the heuristic.

When in doubt, COMMIT to a single best guess. Do not output 'unknown' unless the segment is purely a verse citation with no framing.

${GENERATIONS_PROMPT_REFERENCE}

Return JSON: { "picks": [ { "idx": <int>, "era": <generation_id>, "why": "<short reason>" }, ... ] }
- Output one pick per input segment. Do not add or omit indices.
- "why" is one short clause (≤ 12 words), and must reference an actual token from the segment OR an honest register description. Examples:
  - "speaker: רב הונא" (quoted name appears in the segment)
  - "marker: 'תנו רבנן' (baraita)"
  - "stam: 'מאי טעמא' formula"
  - "Mishnaic Hebrew register"`;

interface EraLlmSegmentInput {
  idx: number;
  text: string;            // plain Hebrew (no HTML), the segment itself
  before?: string;         // ±1 segment of context for the model, optional
  after?: string;
  heuristicGuess?: string; // GenerationId from the client's heuristic, advisory only
}

interface EraLlmPick {
  idx: number;
  era: string;
  why: string;
}

interface EraLlmResponse {
  picks: EraLlmPick[];
  _model?: string;
  _cached?: boolean;
  _ms?: number;
}

function isEraLlmResponse(x: unknown): x is { picks: EraLlmPick[] } {
  if (!x || typeof x !== 'object' || !('picks' in x)) return false;
  const picks = (x as { picks: unknown }).picks;
  if (!Array.isArray(picks)) return false;
  for (const p of picks) {
    if (!p || typeof p !== 'object') return false;
    const pp = p as Record<string, unknown>;
    if (typeof pp.idx !== 'number' || typeof pp.era !== 'string' || typeof pp.why !== 'string') return false;
  }
  return true;
}

app.post('/api/era-llm/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  const t0 = Date.now();

  let body: { segments?: EraLlmSegmentInput[] };
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad JSON body' }, 400); }
  const segments = Array.isArray(body.segments) ? body.segments : [];
  if (segments.length === 0) return c.json({ picks: [] });
  if (segments.length > 60) return c.json({ error: 'too many segments (max 60)' }, 400);

  // Cache key: tractate+page+stable hash of input idx list. Same low-confidence
  // subset across visits → one Kimi call per daf.
  const idxSig = segments.map((s) => s.idx).join(',');
  const cacheKey = `era-llm:v1:${tractate}:${page}:${idxSig}`;
  const bypass = c.req.query('refresh') === '1';

  if (cache && !bypass) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { picks: EraLlmPick[] };
      return c.json({ picks: parsed.picks, _cached: true, _ms: Date.now() - t0 } satisfies EraLlmResponse);
    }
  }
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

  // Build the user prompt: numbered segments with optional before/after context
  // and the client's heuristic guess as advisory information.
  const lines: string[] = [
    `Tractate: ${tractate}, page ${page}.`,
    `Classify each of the following ${segments.length} segments by historical period.`,
    '',
  ];
  for (const s of segments) {
    lines.push(`--- segment #${s.idx} ---`);
    if (s.before) lines.push(`(prev) ${s.before}`);
    lines.push(`TARGET: ${s.text}`);
    if (s.after) lines.push(`(next) ${s.after}`);
    if (s.heuristicGuess) lines.push(`(heuristic guess: ${s.heuristicGuess})`);
    lines.push('');
  }
  const userContent = lines.join('\n').slice(0, 40000);

  // Gemma-4-26b is the same model the existing /api/daf-context uses for its
  // stage-1 classification — fast, no thinking mode, plays well with json_schema
  // response_format. Kimi K2.6 non-streaming hits the Workers AI Gateway timeout
  // on this prompt shape; switching to streaming would work but is overkill for
  // a per-segment classifier.
  const modelId = '@cf/google/gemma-4-26b-a4b-it';
  try {
    const resp = await c.env.AI.run(modelId as never, {
      messages: [
        { role: 'system', content: ERA_LLM_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: 4000,
      temperature: 0.1,
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: 'json_schema', json_schema: ERA_LLM_JSON_SCHEMA },
    } as never);
    const payload = extractJsonPayload(resp);
    if (!payload) return c.json({ error: 'empty payload' }, 502);
    let parsed: unknown;
    try { parsed = JSON.parse(payload); }
    catch (err) { return c.json({ error: `non-JSON: ${String(err).slice(0, 200)}`, raw: payload.slice(0, 500) }, 502); }
    if (!isEraLlmResponse(parsed)) return c.json({ error: 'schema mismatch', got: parsed }, 502);

    // Filter to known generation IDs AND only indices that were actually
    // sent — gemma-4-26b sometimes hallucinates picks for adjacent
    // segment indices that the client didn't ask about. Accepting those
    // would overwrite high-confidence heuristic picks (e.g. a heuristic
    // speaker attribution) with garbage.
    const validIds = new Set<string>(GENERATION_IDS);
    const sentIdxs = new Set(segments.map((s) => s.idx));
    const cleaned: EraLlmPick[] = parsed.picks
      .filter((p) => validIds.has(p.era) && sentIdxs.has(p.idx))
      .map((p) => ({ idx: p.idx, era: p.era, why: p.why.slice(0, 200) }));

    if (cache) {
      await cache.put(cacheKey, JSON.stringify({ picks: cleaned }), { expirationTtl: 60 * 60 * 24 * 365 });
    }
    return c.json({ picks: cleaned, _model: modelId, _ms: Date.now() - t0 } satisfies EraLlmResponse);
  } catch (err) {
    return c.json({ error: String(err).slice(0, 300) }, 502);
  }
});

// ---------------------------------------------------------------------------
// Era stratification — unified two-stage endpoint for the main daf view.
// Stage 1: heuristic classifier over Sefaria segments, returned + cached.
// Stage 2: LLM refinement of low-confidence segments, runs in waitUntil and
// silently upgrades the cache. Mirrors /api/daf-context's polling pattern.
// ---------------------------------------------------------------------------

interface EraContextPayload extends DafEraContext {
  _stage?: 1 | 2;
  _cached?: boolean;
}

/** Run the LLM stage in-process; returns era picks for the candidate segments. */
async function runEraLlmModel(
  ai: Ai,
  tractate: string,
  page: string,
  segments: EraLlmSegmentInput[],
): Promise<EraLlmPick[]> {
  if (segments.length === 0) return [];
  const lines: string[] = [
    `Tractate: ${tractate}, page ${page}.`,
    `Classify each of the following ${segments.length} segments by historical period.`,
    '',
  ];
  for (const s of segments) {
    lines.push(`--- segment #${s.idx} ---`);
    if (s.before) lines.push(`(prev) ${s.before}`);
    lines.push(`TARGET: ${s.text}`);
    if (s.after) lines.push(`(next) ${s.after}`);
    if (s.heuristicGuess) lines.push(`(heuristic guess: ${s.heuristicGuess})`);
    lines.push('');
  }
  const userContent = lines.join('\n').slice(0, 40000);
  const resp = await ai.run('@cf/google/gemma-4-26b-a4b-it' as never, {
    messages: [
      { role: 'system', content: ERA_LLM_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    max_completion_tokens: 4000,
    temperature: 0.1,
    chat_template_kwargs: { enable_thinking: false },
    response_format: { type: 'json_schema', json_schema: ERA_LLM_JSON_SCHEMA },
  } as never);
  const payload = extractJsonPayload(resp);
  if (!payload) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(payload); }
  catch { return []; }
  if (!isEraLlmResponse(parsed)) return [];
  const validIds = new Set<string>(GENERATION_IDS);
  const sentIdxs = new Set(segments.map((s) => s.idx));
  return parsed.picks
    .filter((p) => validIds.has(p.era) && sentIdxs.has(p.idx))
    .map((p) => ({ idx: p.idx, era: p.era, why: p.why.slice(0, 200) }));
}

/** Decide which heuristic-source segments are worth sending to the LLM. */
const ERA_LLM_RABBI_HINT = /(?:^|\s)(רבי |רב |רבן |רבה |רבא |רבינא |מר |שמואל|הלל|שמאי|אביי|עולא|זעירי)/;
function pickEraLlmCandidates(
  segments: SegmentEra[],
  plain: string[],
): SegmentEra[] {
  const out: SegmentEra[] = [];
  for (const s of segments) {
    const src: EraSignalSource = s.source;
    if (src === 'register' || src === 'stam-default') { out.push(s); continue; }
    if (src === 'marker' && ERA_LLM_RABBI_HINT.test(plain[s.segIdx] ?? '')) { out.push(s); continue; }
  }
  // Cap at 60 to match runEraLlmModel's prompt budget.
  return out.slice(0, 60);
}

function mergeLlmIntoHeuristic(heuristic: SegmentEra[], picks: EraLlmPick[]): SegmentEra[] {
  if (picks.length === 0) return heuristic;
  const byIdx = new Map<number, EraLlmPick>();
  for (const p of picks) byIdx.set(p.idx, p);
  return heuristic.map((s) => {
    const pick = byIdx.get(s.segIdx);
    if (!pick) return s;
    return {
      ...s,
      era: pick.era as GenerationId,
      source: 'llm' as const,
      why: `LLM: ${pick.why}`,
    };
  });
}

function buildContextFromSegments(segs: SegmentEra[]): DafEraContext {
  const generationsPresent = Array.from(new Set(segs.map((s) => s.era)));
  return { segments: segs, generationsPresent, computedAt: Date.now() };
}

app.get('/api/era-context/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cache = c.env.CACHE;
  const baseKey = `era-context:v1:${tractate}:${page}`;
  const stage2Key = `${baseKey}:stage2`;
  const bypass = c.req.query('refresh') === '1';
  const cachedOnly = c.req.query('cached_only') === '1';
  const wantStage2 = c.req.query('stage') === '2';

  if (cache && !bypass) {
    if (wantStage2) {
      const cached = await cache.get(stage2Key);
      if (cached) return c.json({ ...JSON.parse(cached) as DafEraContext, _stage: 2, _cached: true } satisfies EraContextPayload);
      return c.body(null, 204);
    }
    const upgraded = await cache.get(stage2Key);
    if (upgraded) return c.json({ ...JSON.parse(upgraded) as DafEraContext, _stage: 2, _cached: true } satisfies EraContextPayload);
    const s1 = await cache.get(baseKey);
    if (s1) return c.json({ ...JSON.parse(s1) as DafEraContext, _stage: 1, _cached: true } satisfies EraContextPayload);
  }
  if (cachedOnly) return c.json({ cached: false }, 404);
  if (wantStage2) return c.body(null, 204);

  // Stage 1: heuristic over Sefaria segments. No LLM needed for this leg.
  const segments = await getSefariaSegmentsCached(cache, tractate, page);
  const segsHe = segments?.he ?? [];
  if (segsHe.length === 0) return c.json({ error: 'no Sefaria segments available' }, 502);

  const stage1Ctx = classifyDaf(segsHe);
  if (cache) await cache.put(baseKey, JSON.stringify(stage1Ctx), { expirationTtl: 60 * 60 * 24 * 365 });

  // Stage-2 LLM refinement intentionally disabled — heuristic is enough for
  // now. Previously-warmed Stage-2 cache (if any) is still served above.
  return c.json({ ...stage1Ctx, _stage: 1 } satisfies EraContextPayload);
});

// ----------------------------------------------------------------------------
// Era → "Argument network" enrichment.
//
// Given a daf, the cached argument skeleton (rabbis named per section), and
// daf-context (resolved slugs), produce the daf-wide list of pairs
// (rabbiA, rabbiB, kind: 'argues' | 'supports') with a focal segment range
// and short evidence excerpt. The Era tab consumes this and a daf overlay
// renders green/red lines between rabbi anchors.
//
// Hard requires the skeleton (412 if missing). Cached as
// era-arg-net:v1:{tractate}:{page} for 30 days; refresh=1 bypasses.
// ----------------------------------------------------------------------------

const ERA_ARG_NET_SYSTEM_PROMPT = `You are a Talmud scholar. You will receive:
1. A daf's argument skeleton (sections + named voices), already identified.
2. A list of resolved rabbi slugs present on the daf — the canonical IDs you must use.

Identify every PAIR of named rabbis on this daf where one explicitly:
- ARGUES with the other (disputes, rejects, raises a kashya, offers a counter-position).
- SUPPORTS the other (cites approvingly, brings a prooftext for, restates with assent).

Output STRICT JSON only:

{
  "pairs": [
    {
      "a": "slug-of-first-rabbi",
      "b": "slug-of-second-rabbi",
      "kind": "argues" | "supports",
      "section": "Title of the skeleton section where this happens",
      "startSegIdx": 0-based segment index where the interaction begins,
      "endSegIdx": 0-based segment index where it ends (inclusive),
      "evidence": "1-sentence English explanation of HOW a argues with / supports b in that section"
    }
  ]
}

Rules:
- Both "a" and "b" MUST be slugs from the provided slug list. Do not invent slugs. If a voice (Sages, Tanna Kamma, Stam) has no slug, skip it.
- Only emit a pair when the daf text *explicitly* shows the relationship. Do not infer cross-daf disagreements.
- When two rabbis appear in the same section but neither explicitly engages the other, do NOT emit a pair.
- Skip self-pairs.
- If nothing on the daf is a clean argues/supports interaction, emit "pairs": [].`;

interface EraArgPair {
  a: string;
  b: string;
  kind: 'argues' | 'supports';
  section?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  evidence?: string;
}
interface EraArgNetResult { pairs: EraArgPair[]; generatedAt: string }

function validateEraArgNet(x: unknown): x is { pairs: EraArgPair[] } {
  if (!x || typeof x !== 'object') return false;
  const p = (x as { pairs?: unknown }).pairs;
  if (!Array.isArray(p)) return false;
  for (const item of p) {
    if (!item || typeof item !== 'object') return false;
    const pair = item as EraArgPair;
    if (typeof pair.a !== 'string' || typeof pair.b !== 'string') return false;
    if (pair.kind !== 'argues' && pair.kind !== 'supports') return false;
  }
  return true;
}

app.post('/api/enrich-era-arguments/:tractate/:page', async (c) => {
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const refresh = c.req.query('refresh') === '1';
  const cachedOnly = c.req.query('cached_only') === '1';
  const cacheKey = `era-arg-net:v1:${tractate}:${page}`;

  if (!refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) return c.json({ ...JSON.parse(hit) as EraArgNetResult, _cached: true });
  }
  if (cachedOnly) return c.json({ cached: false }, 404);

  const skelRaw = await cache.get(`analyze-skel:v2:${tractate}:${page}`);
  if (!skelRaw) {
    return c.json({ error: 'skeleton unavailable; run /api/analyze?skeleton_only=1 first' }, 412);
  }
  const skeleton = JSON.parse(skelRaw) as DafSkeleton;

  // Pull resolved rabbi slugs from daf-context.
  let slugs: string[] = [];
  try {
    const ctx = await selfFetchJson(c, `/api/daf-context/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}`) as { rabbis?: Array<{ slug?: string | null }> };
    slugs = (ctx.rabbis ?? []).map((r) => r.slug).filter((s): s is string => !!s);
  } catch (err) {
    return c.json({ error: `daf-context: ${String(err).slice(0, 200)}` }, 502);
  }
  if (slugs.length < 2) {
    const empty: EraArgNetResult = { pairs: [], generatedAt: new Date().toISOString() };
    await cache.put(cacheKey, JSON.stringify(empty), { expirationTtl: 60 * 60 * 24 * 30 });
    return c.json({ ...empty, _cached: false, _note: 'fewer than 2 resolved slugs on this daf' });
  }

  const lines: string[] = [];
  lines.push(`Tractate: ${tractate} ${page}`);
  lines.push('');
  lines.push('Resolved rabbi slugs on this daf (use these EXACT strings as "a" and "b"):');
  for (const s of slugs) lines.push(`  - ${s}`);
  lines.push('');
  lines.push('Skeleton sections:');
  for (const sec of skeleton.sections) {
    lines.push(`§ ${sec.title}  [segs ${sec.startSegIdx}–${sec.endSegIdx}]`);
    if (sec.summary) lines.push(`  summary: ${sec.summary}`);
    if (sec.excerpt) lines.push(`  excerpt: ${sec.excerpt.slice(0, 600)}`);
    lines.push(`  voices: ${sec.rabbiNames.join(', ') || '(none)'}`);
    lines.push('');
  }

  const t0 = Date.now();
  let streamed: StreamedResult;
  try {
    streamed = await runKimiStreaming(
      c.env.AI,
      '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: ERA_ARG_NET_SYSTEM_PROMPT },
        { role: 'user', content: lines.join('\n') },
      ],
      4096,
      { chatTemplateKwargs: { enable_thinking: false } },
    );
  } catch (err) {
    return c.json({ error: `llm: ${String(err).slice(0, 200)}` }, 502);
  }

  let payload = streamed.content.trim();
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) payload = fenced[1].trim();
  if (!payload) return c.json({ error: 'empty payload' }, 502);

  let parsed: unknown;
  try { parsed = JSON.parse(payload); }
  catch (err) {
    const repaired = payload.replace(/,(\s*[}\]])/g, '$1');
    try { parsed = JSON.parse(repaired); }
    catch { return c.json({ error: `non-JSON: ${String(err).slice(0, 200)}`, raw: payload.slice(0, 500) }, 502); }
  }
  if (!validateEraArgNet(parsed)) {
    return c.json({ error: 'shape mismatch', raw: payload.slice(0, 500) }, 502);
  }

  // Filter pairs to ones where both endpoints are in the resolved slug list,
  // and drop self-pairs. The model is told this rule but we enforce it.
  const slugSet = new Set(slugs);
  const cleaned: EraArgPair[] = [];
  for (const p of parsed.pairs) {
    if (p.a === p.b) continue;
    if (!slugSet.has(p.a) || !slugSet.has(p.b)) continue;
    cleaned.push(p);
  }

  const out: EraArgNetResult = { pairs: cleaned, generatedAt: new Date().toISOString() };
  await cache.put(cacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 30 });
  return c.json({ ...out, _cached: false, _ms: Date.now() - t0 });
});

app.get('/api/enrich-era-arguments/:tractate/:page', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cacheKey = `era-arg-net:v1:${tractate}:${page}`;
  const hit = await cache.get(cacheKey);
  if (!hit) return c.json({ cached: false }, 404);
  return c.json({ ...JSON.parse(hit) as EraArgNetResult, _cached: true });
});

// ============================================================================
// Canonical entity contract — /api/identify/{type} and /api/enrich/{type}.
//
// Stage 1 (identify) extracts what's in a daf for a given entity type;
// Stage 2 (enrich) attaches strategy-keyed metadata per entity. Both stages
// are KV read-through cached at identify:v1:* and enrich:v1:*. The handlers
// here are thin adapters: they self-fetch the existing legacy endpoints (no
// behavior change to the underlying AI calls) and reshape the response into
// the canonical Entity / EnrichedEntity form.
//
// Adding a new entity type requires: extend ENTITY_TYPES + STRATEGIES in
// entity-types.ts, then add a case to identify_T and enrich_T below.
// ============================================================================

function rangeAnchor(start: number | undefined, end: number | undefined, quote: string | undefined): {
  segmentIdx?: number;
  segmentRange?: [number, number];
  quote?: string;
} {
  const out: { segmentIdx?: number; segmentRange?: [number, number]; quote?: string } = {};
  if (typeof start === 'number' && Number.isFinite(start)) {
    out.segmentIdx = start;
    const e = typeof end === 'number' && Number.isFinite(end) ? end : start;
    out.segmentRange = [start, Math.max(start, e)];
  }
  if (quote) out.quote = quote;
  return out;
}

/* ---- Argument enrichment strategies -------------------------------------
 * Five per-section strategies, each returning ONLY its slice (no
 * re-serialized section). Caching is handled by the outer enrichEntity
 * wrapper at enrich:v2:argument:{t}:{p}:argument:{idx}:{strategy}.
 *
 * Each helper uses Kimi K2.5 no-thinking (~30-90s, reliable JSON).
 * Section-relevant Hebrew is sliced from the cached Sefaria segments by
 * the section's startSegIdx/endSegIdx.
 */

/**
 * Shared instruction injected into every argument-strategy prompt that emits
 * English prose. Encourages preserving Talmudic technical vocabulary as
 * transliterated Hebrew/Aramaic in parentheses on first mention so the
 * reader builds the conventional learning vocabulary alongside the gloss.
 */
const HEBRAIZED_TERMS_RULE = `**Preserve Talmudic technical vocabulary.** When you introduce a halachic / aggadic / sugya-structural concept, give the conventional transliterated Hebrew/Aramaic term in parentheses on first mention, e.g. "designation (yiʿud)", "preparation for Shabbat (hakhanah)", "moveable (muktzeh)", "the dragged-bolt case (neger hanegrar)", "parable (mashal)", "argument move (kushya)", "answer (terutz)", "scriptural derivation (derashah)", "atonement (kaparah)". Use Sefaria-style transliteration (apostrophes for ayin/aleph where standard, doubled letters where the dagesh is doubled). Do NOT pure-English-translate technical terms — keep the Hebrew side-by-side.`;

const ARG_SYNTHESIZE_PROMPT = `You write the GIST of one argument section — the one-glance summary the reader sees at the top of a card. The deep work (per-rabbi breakdown, bigger-picture, background, commentaries) is rendered separately on the card; do NOT duplicate them.

You will receive the section's Hebrew/Aramaic text plus optional cached enrichments — rabbis, references, parallels, commentaries, bigger_picture, background, difficulty — and tails of neighboring amudim. **REWRITE** the section gist using whatever enrichments are provided as authoritative context: each one tightens the picture of what's actually happening in the sugya. Do NOT recap each enrichment — fold them into one tight gist.

**HARD CAPS:**
- 1-2 sentences. No more.
- Maximum 280 characters total.
- No "Continuing from…" or "This sets up…" framing — that's the bigger-picture section's job.
- No commentator name-drops (Rashi, Tosafot, Rosh, Rashba) — that's the commentaries section's job.
- No per-rabbi biographical context — that's the opinions section's job.

Just the gist: what is this section actually saying / arguing? You may cite ONE verse ref inline if it's the section's anchor.

${HEBRAIZED_TERMS_RULE}

Output STRICT JSON only:

{ "explanation": "1-2 sentence gist here", "groundedIn": ["rabbis","references","parallels","commentaries","bigger-picture","background","difficulty","prev-daf","next-daf"] }

groundedIn lists ONLY slices that were actually supplied below and that you drew on. Do not list a slice you didn't see in the input.`;

const ARG_RABBIS_PROMPT = `You are a scholar of Talmud. You will receive ONE argument section of a daf — its Hebrew/Aramaic text and the list of voices (rabbiNames) the structural pass identified. For each voice, fill in the metadata. Output STRICT JSON only:

{
  "rabbis": [
    {
      "name": "Conventional English name (e.g. 'Rabbi Yochanan', 'Rav Huna') OR Stam-style label (e.g. 'Gemara's question', 'First answer')",
      "nameHe": "Hebrew name as it appears in this section, OR the Hebrew interrogative/introducer phrase for an anonymous voice",
      "period": "Era + approximate dates (e.g. 'Tanna, c. 90-120 CE', 'Amora, 4th century CE', 'Stam Gemara, redacted c. 500 CE')",
      "location": "City and region (e.g. 'Pumbedita, Babylonia', 'Tzippori, Galilee', 'Bavel')",
      "role": "What this voice argues or does in THIS section, in one sentence",
      "opinionStart": "First 2-4 Hebrew/Aramaic words of THIS voice's specific statement, copied verbatim from the section's Hebrew. Used to anchor the rabbi to text."
    }
  ]
}

Cover EVERY voice in rabbiNames. opinionStart MUST be Hebrew copied verbatim from the section's Hebrew above — never translate.

If cached cross-enrichments are supplied (a <references>, <parallels>, or <commentaries> block below), USE them to color each voice's "role": name the verse a voice cites, mention the parallel sugya their position echoes, note the difficulty a commentator (e.g. Tosafot, Rashba) raises on them. Do not invent facts — only draw on what's in the supplied blocks.

${HEBRAIZED_TERMS_RULE} (applies to the "role" field.)`;

const ARG_REFERENCES_PROMPT = `You are a scholar of Tanakh and Talmud. Find every BIBLICAL verse cited or alluded to in the supplied section of Hebrew/Aramaic text. Output STRICT JSON only:

{
  "references": [
    {
      "ref": "English citation in Sefaria style (e.g. 'Psalms 31:6', 'Deuteronomy 6:4')",
      "hebrewRef": "Hebrew citation (e.g. 'תהילים לא:ו', 'דברים ו:ד')",
      "hebrewQuote": "Verbatim Hebrew snippet from the section as it cites the verse (the words that appear in the daf, not the verse itself if it differs)"
    }
  ]
}

Include only ACTUAL biblical citations — verses quoted, paraphrased, or invoked as proofs. Do not include rabbinic statements that merely sound biblical. If no verses are cited, return {"references": []}.`;

const ARG_PARALLELS_PROMPT = `You are a scholar of Talmud. You will receive ONE argument section plus selected Rishonim commentary (Rashba, Ritva, Ramban, Meiri, Rosh, Maharsha) on this daf. Identify cross-Shas PARALLEL SUGYOT — other places in the Talmud (Bavli or Yerushalmi) where the same dispute, Tannaitic source, or argumentative move appears. Output STRICT JSON only:

{
  "parallels": [
    {
      "ref": "Sefaria-style ref (e.g. 'Megillah 3a', 'Shabbat 31a', 'Jerusalem Talmud Berakhot 5b')",
      "source": "How you know — 'Rashba cites it', 'Talmudic cross-reference in section', 'Meiri compares', or 'general scholarly knowledge'",
      "note": "1 sentence on how the parallel relates"
    }
  ]
}

Prefer parallels grounded in the supplied Rishonim. Limit to the 5 most relevant. If none, return {"parallels": []}.

${HEBRAIZED_TERMS_RULE} (applies to the "note" field.)`;

const ARG_BIGGER_PICTURE_PROMPT = `You are a scholar of Talmud. You will receive ONE argument section plus the FULL OUTLINE of all sections on this amud (titles + summaries + segment ranges) AND the tail of the previous amud and head of the next. Write a paragraph (HARD CAP: 2-3 sentences, no more) that explains how THIS section fits into the BIGGER PICTURE — the larger sugya / argumentative arc the daf is developing. Connect it to neighboring sections by name where useful, name the larger question being grappled with, and indicate whether this section is the opening move, a digression, a counter-argument, a pivot, or a resolution. Pack dense — every sentence should add new information.

${HEBRAIZED_TERMS_RULE}

Output STRICT JSON only:

{ "biggerPicture": "your paragraph here" }`;

const ARG_BACKGROUND_PROMPT = `You are a Talmud teacher writing BACKGROUND CONTEXT for a learner who just opened this section. The gist of what the section says, the per-rabbi breakdown, and the structural arc within the daf are ALREADY covered by other sections of the card — DO NOT duplicate them.

Your job is to answer two questions a curious non-specialist would ask:
  1. WHY does this matter? — the religious, historical, or conceptual stakes of the practice / dispute / story this section deals with. Why does it matter in Jewish life and thought, beyond this page?
  2. WHY is the Talmud talking about THIS HERE? — the genre conventions, redactor's craft, or canonical placement that explains why THIS sugya appears at THIS spot in the masechet. (E.g. "Berakhot opens with evening Shema because the Mishnah follows the order of the verse 'when you lie down' and the cosmic day starts at nightfall.")

Aim for 3-5 sentences. Plain English first; technical terms parenthesized as needed. Speak to the learner as if explaining over a coffee, not lecturing — orient them, then trust them.

Avoid:
- Restating what the section says (other sections handle that)
- Per-rabbi name-drops or commentator quotes (other sections)
- Multi-clause chains of derivation (the bigger-picture section handles that)
- Generic platitudes ("This is an important sugya in Jewish law.") — every sentence must carry concrete background information.

${HEBRAIZED_TERMS_RULE}

Output STRICT JSON only:

{ "background": "your 3-5 sentence paragraph" }`;

const ARG_COMMENTARIES_PROMPT = `You are a scholar of Talmud. You will receive ONE argument section plus Rashi, Tosafot, and other Rishonim commentary on this daf. List the QUESTIONS or DIFFICULTIES that the commentators raise on THIS section's text — what bothers them, what they ask, what apparent contradiction they grapple with. Output STRICT JSON only:

{
  "commentaries": [
    {
      "commentator": "Rashi | Tosafot | Rashba | Ritva | Ramban | Meiri | Rosh | Maharsha | Chidushei Aggadot | other",
      "question": "The actual question or difficulty raised, in plain English (1-2 sentences)",
      "ref": "Optional: page/dibbur ref if obvious (e.g. 'd.h. אם תלמיד חכם')"
    }
  ]
}

Include only questions actually raised in the supplied commentary, not your own observations. If a commentator makes a quiet gloss with no question, skip them. If no questions, return {"commentaries": []}.

${HEBRAIZED_TERMS_RULE} (applies to the "question" field.)`;

/** Read cached enrichment slices for an argument section. Each slice is null
 *  if not yet enriched. Used by both the rabbis and synthesize strategies so
 *  each voice's `role` (and the synthesized gist) can be grounded in the
 *  verses, parallels, and commentator questions already in cache. */
async function getCachedArgumentSlices(
  c: { env: Bindings },
  tractate: string,
  page: string,
  sectionIdx: number,
  slices: readonly string[],
): Promise<Record<string, unknown>> {
  const cache = c.env.CACHE;
  if (!cache) return {};
  const out: Record<string, unknown> = {};
  await Promise.all(slices.map(async (s) => {
    const key = enrichCacheKey('argument', tractate, page, makeIndexId('argument', sectionIdx), s);
    const hit = await cache.get(key);
    if (!hit) { out[s] = null; return; }
    try {
      const parsed = JSON.parse(hit) as { enrichments?: Record<string, unknown> };
      out[s] = parsed.enrichments?.[s] ?? null;
    } catch { out[s] = null; }
  }));
  return out;
}

async function getArgumentSectionContext(
  c: { req: { url: string }; env: Bindings; executionCtx: ExecutionContext },
  tractate: string,
  page: string,
  sectionIdx: number,
): Promise<{ section: ArgumentSectionShape; sectionHe: string; sectionEn: string }> {
  const skel = await selfFetchJson(c, `/api/analyze/${tractate}/${page}?skeleton_only=1`) as { sections?: ArgumentSectionShape[] };
  const section = (skel.sections ?? [])[sectionIdx];
  if (!section) throw new Error(`section ${sectionIdx} not found`);
  const sefSegs = await getSefariaSegmentsCached(c.env.CACHE, tractate, page);
  const segsHe = (sefSegs?.he ?? []).map(stripHtmlServer);
  const segsEn = (sefSegs?.en ?? []).map(stripHtmlServer);
  const start = section.startSegIdx ?? 0;
  const end = section.endSegIdx ?? Math.max(start, segsHe.length - 1);
  const sectionHe = segsHe.slice(start, end + 1).map((s, i) => `[${start + i}] ${s}`).join('\n');
  const sectionEn = segsEn.slice(start, end + 1).map((s, i) => `[${start + i}] ${s}`).join('\n');
  return { section, sectionHe, sectionEn };
}

async function runArgumentStrategyKimi(
  ai: Ai,
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
): Promise<unknown> {
  const streamed = await runKimiStreaming(
    ai, '@cf/moonshotai/kimi-k2.5',
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    maxTokens,
    { chatTemplateKwargs: { enable_thinking: false } },
  );
  let payload = streamed.content.trim();
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) payload = fenced[1].trim();
  if (!payload) throw new Error('empty payload');
  return JSON.parse(payload);
}

async function enrichArgumentSection(
  c: { req: { url: string }; env: Bindings; executionCtx: ExecutionContext },
  tractate: string,
  page: string,
  sectionIdx: number,
  strategy: string,
  /** When `strategy === 'synthesize'`, restricts which source strategies feed
   *  into the prompt. Empty array or undefined = all available. */
  includeOverride?: ReadonlyArray<string>,
): Promise<unknown> {
  if (!c.env.AI) throw new Error('AI binding not available');
  const ctx = await getArgumentSectionContext(c, tractate, page, sectionIdx);
  const header = [
    `Tractate: ${tractate}`,
    `Page: ${page}`,
    `Section title: ${ctx.section.title}`,
    `Section summary: ${ctx.section.summary ?? '(none)'}`,
    `Segment range: [${ctx.section.startSegIdx ?? '?'}-${ctx.section.endSegIdx ?? '?'}]`,
    '',
  ].join('\n');

  switch (strategy) {
    case 'synthesize': {
      // Read all available enrichments for this section from KV plus a small
      // tail of the previous amud and head of the next so the synthesized
      // paragraph can situate the section in the larger argumentative arc.
      // Falls back to the daf-level enrich-arg:v1 cache when the per-section
      // v3 cache is empty (the path /enrichment writes to).
      const cache = c.env.CACHE;
      const fetchSlice = async (s: string): Promise<unknown> => {
        if (!cache) return null;
        // 1) per-section v3 cache (entity-contract path)
        const v3Key = enrichCacheKey('argument', tractate, page, makeIndexId('argument', sectionIdx), s);
        const v3Hit = await cache.get(v3Key);
        if (v3Hit) {
          try {
            const parsed = JSON.parse(v3Hit) as { enrichments?: Record<string, unknown> };
            const data = parsed.enrichments?.[s];
            if (data != null) return data;
          } catch { /* fall through */ }
        }
        // 2) daf-level enrich-arg:v1 cache (EnrichmentPage path) — slice to this
        // section. Note 'rabbis' is the prompt tag but the daf-level cache key
        // for the running strategy is 'rich-rabbi'.
        const dafKeyName = s === 'rabbis' ? 'rich-rabbi' : s;
        const dafHit = await cache.get(`enrich-arg:v1:${dafKeyName}:${tractate}:${page}`);
        if (!dafHit) return null;
        try {
          const parsed = JSON.parse(dafHit) as { sections?: Array<Record<string, unknown>> };
          const sec = parsed.sections?.[sectionIdx];
          if (!sec) return null;
          if (s === 'rabbis')         return sec.rabbis ?? null;
          if (s === 'rich-rabbi')     return sec.rabbis ?? null;
          if (s === 'references')     return sec.references ?? null;
          if (s === 'parallels')      return sec.parallels ?? null;
          if (s === 'commentaries')   return sec.commentaries ?? null;
          if (s === 'bigger-picture') return sec.biggerPicture ?? null;
          if (s === 'background')     return sec.background ?? null;
          if (s === 'difficulty')     return sec.difficulty ?? null;
          return sec[s] ?? null;
        } catch { return null; }
      };
      const prevDaf = adjacentAmud(tractate, page, -1);
      const nextDaf = adjacentAmud(tractate, page, +1);
      const fetchTailHead = async (daf: string | null, mode: 'tail' | 'head'): Promise<string> => {
        if (!daf) return '';
        try {
          const segs = await getSefariaSegmentsCached(cache, tractate, daf);
          const he = (segs?.he ?? []).map(stripHtmlServer);
          if (he.length === 0) return '';
          const slice = mode === 'tail' ? he.slice(Math.max(0, he.length - 4)) : he.slice(0, 4);
          return slice.map((s, i) => `[${(mode === 'tail' ? he.length - slice.length + i : i)}] ${s}`).join('\n');
        } catch { return ''; }
      };
      // If includeOverride supplied, only fetch those slices. Map common
      // aliases: rabbis ↔ rich-rabbi (the daf-level cache key is rich-rabbi
      // but the prompt tag is `rabbis`).
      const want = (k: string): boolean => {
        if (!includeOverride || includeOverride.length === 0) return true;
        if (k === 'rabbis') return includeOverride.includes('rabbis') || includeOverride.includes('rich-rabbi');
        return includeOverride.includes(k);
      };
      const [rabbisData, refsData, parData, commData, bigData, bgData, diffData, prevTail, nextHead] = await Promise.all([
        want('rabbis')         ? fetchSlice('rabbis')         : Promise.resolve(null),
        want('references')     ? fetchSlice('references')     : Promise.resolve(null),
        want('parallels')      ? fetchSlice('parallels')      : Promise.resolve(null),
        want('commentaries')   ? fetchSlice('commentaries')   : Promise.resolve(null),
        want('bigger-picture') ? fetchSlice('bigger-picture') : Promise.resolve(null),
        want('background')     ? fetchSlice('background')     : Promise.resolve(null),
        want('difficulty')     ? fetchSlice('difficulty')     : Promise.resolve(null),
        fetchTailHead(prevDaf, 'tail'),
        fetchTailHead(nextDaf, 'head'),
      ]);
      const enrichmentBlocks: string[] = [];
      if (rabbisData) enrichmentBlocks.push(`<rabbis>\n${JSON.stringify(rabbisData, null, 2)}\n</rabbis>`);
      if (refsData) enrichmentBlocks.push(`<references>\n${JSON.stringify(refsData, null, 2)}\n</references>`);
      if (parData) enrichmentBlocks.push(`<parallels>\n${JSON.stringify(parData, null, 2)}\n</parallels>`);
      if (commData) enrichmentBlocks.push(`<commentaries>\n${JSON.stringify(commData, null, 2)}\n</commentaries>`);
      if (bigData) enrichmentBlocks.push(`<bigger_picture>\n${JSON.stringify(bigData, null, 2)}\n</bigger_picture>`);
      if (bgData) enrichmentBlocks.push(`<background>\n${JSON.stringify(bgData, null, 2)}\n</background>`);
      if (diffData) enrichmentBlocks.push(`<difficulty>\n${JSON.stringify(diffData, null, 2)}\n</difficulty>`);
      const userContent = header + [
        'Hebrew/Aramaic text of this section (segments numbered):',
        ctx.sectionHe || '(unavailable)',
        '',
        'English translation:',
        ctx.sectionEn || '(unavailable)',
        '',
        prevTail ? `<previous_daf_tail page="${prevDaf}">\n${prevTail}\n</previous_daf_tail>` : `(no previous-daf context for ${page})`,
        '',
        nextHead ? `<next_daf_head page="${nextDaf}">\n${nextHead}\n</next_daf_head>` : `(no next-daf context for ${page})`,
        '',
        enrichmentBlocks.length === 0
          ? '(No structured enrichments cached yet — write a basic paragraph from the section text + neighbor context + structural summary alone.)'
          : `Available structured enrichments:\n\n${enrichmentBlocks.join('\n\n')}`,
      ].join('\n');
      return runArgumentStrategyKimi(c.env.AI, ARG_SYNTHESIZE_PROMPT, userContent, 6000);
    }
    case 'rabbis': {
      // Pull whatever's cached so each voice's `role` can name the verse it
      // cites, the parallel sugya it echoes, and the commentator difficulty
      // it raises. Empty if user hasn't run those enrichments yet.
      const slices = await getCachedArgumentSlices(c, tractate, page, sectionIdx, ['references', 'parallels', 'commentaries']);
      const ctxBlocks: string[] = [];
      if (slices.references) ctxBlocks.push(`<references>\n${JSON.stringify(slices.references, null, 2)}\n</references>`);
      if (slices.parallels) ctxBlocks.push(`<parallels>\n${JSON.stringify(slices.parallels, null, 2)}\n</parallels>`);
      if (slices.commentaries) ctxBlocks.push(`<commentaries>\n${JSON.stringify(slices.commentaries, null, 2)}\n</commentaries>`);
      const userContent = header + [
        `Voices identified (rabbiNames): ${(ctx.section.rabbiNames ?? []).join(', ') || '(none)'}`,
        '',
        'Hebrew/Aramaic text of this section:',
        ctx.sectionHe || '(unavailable)',
        '',
        ctxBlocks.length === 0
          ? '(No cached cross-enrichments yet — fill role from section text alone.)'
          : `Cached cross-enrichments — use these to color each voice's "role" with the verse they cite, the parallel sugya they echo, or the commentator difficulty raised on them:\n\n${ctxBlocks.join('\n\n')}`,
      ].join('\n');
      return runArgumentStrategyKimi(c.env.AI, ARG_RABBIS_PROMPT, userContent, 8000);
    }
    case 'references': {
      const userContent = header + [
        'Hebrew/Aramaic text of this section:',
        ctx.sectionHe || '(unavailable)',
      ].join('\n');
      return runArgumentStrategyKimi(c.env.AI, ARG_REFERENCES_PROMPT, userContent, 4000);
    }
    case 'parallels': {
      const rishonim = await getRishonimCached(c.env.CACHE, tractate, page).catch(() => null);
      const rishonimXml = rishonim ? rishonimBlock(rishonim).slice(0, 12000) : '';
      const userContent = header + [
        'Hebrew/Aramaic text of this section:',
        ctx.sectionHe || '(unavailable)',
        '',
        'Rishonim on this daf (focus on what they cross-reference):',
        rishonimXml || '(unavailable)',
      ].join('\n');
      return runArgumentStrategyKimi(c.env.AI, ARG_PARALLELS_PROMPT, userContent, 6000);
    }
    case 'bigger-picture': {
      const skel = await selfFetchJson(c, `/api/analyze/${tractate}/${page}?skeleton_only=1`) as { sections?: ArgumentSectionShape[]; summary?: string };
      const sections = skel.sections ?? [];
      const outlineLines = sections.map((s, i) => {
        const range = (s.startSegIdx != null && s.endSegIdx != null) ? `[${s.startSegIdx}-${s.endSegIdx}]` : '';
        const marker = i === sectionIdx ? ' ← THIS SECTION' : '';
        return `  ${i}. "${s.title}" ${range} — ${s.summary ?? ''}${marker}`;
      }).join('\n');
      const prevDaf = adjacentAmud(tractate, page, -1);
      const nextDaf = adjacentAmud(tractate, page, +1);
      const fetchTailHead = async (daf: string | null, mode: 'tail' | 'head'): Promise<string> => {
        if (!daf) return '';
        try {
          const segs = await getSefariaSegmentsCached(c.env.CACHE, tractate, daf);
          const he = (segs?.he ?? []).map(stripHtmlServer);
          if (he.length === 0) return '';
          const slice = mode === 'tail' ? he.slice(Math.max(0, he.length - 4)) : he.slice(0, 4);
          return slice.join(' ').slice(0, 800);
        } catch { return ''; }
      };
      const [prevTail, nextHead] = await Promise.all([
        fetchTailHead(prevDaf, 'tail'),
        fetchTailHead(nextDaf, 'head'),
      ]);
      const userContent = header + [
        `Daf overall summary: ${skel.summary ?? '(none)'}`,
        '',
        'Full outline of this amud:',
        outlineLines || '(none)',
        '',
        'Hebrew/Aramaic text of THIS section (the focal one):',
        ctx.sectionHe || '(unavailable)',
        '',
        prevTail ? `Tail of previous amud (${prevDaf}): ${prevTail}` : `(no previous amud)`,
        nextHead ? `Head of next amud (${nextDaf}): ${nextHead}` : `(no next amud)`,
        '',
        'Write the bigger-picture paragraph for THIS section.',
      ].join('\n');
      return runArgumentStrategyKimi(c.env.AI, ARG_BIGGER_PICTURE_PROMPT, userContent, 4000);
    }
    case 'background': {
      // Background uses the same outline + focal text as bigger-picture but
      // answers "why does this matter / why is the Talmud talking about this
      // here?" for a curious learner instead of mapping the structural arc.
      const skel = await selfFetchJson(c, `/api/analyze/${tractate}/${page}?skeleton_only=1`) as { sections?: ArgumentSectionShape[]; summary?: string };
      const sections = skel.sections ?? [];
      const outlineLines = sections.map((s, i) => {
        const range = (s.startSegIdx != null && s.endSegIdx != null) ? `[${s.startSegIdx}-${s.endSegIdx}]` : '';
        const marker = i === sectionIdx ? ' ← THIS SECTION' : '';
        return `  ${i}. "${s.title}" ${range} — ${s.summary ?? ''}${marker}`;
      }).join('\n');
      const userContent = header + [
        `Tractate: ${tractate}, daf ${page}`,
        `Daf overall summary: ${skel.summary ?? '(none)'}`,
        '',
        'Outline of this amud (for orientation only — do NOT recap):',
        outlineLines || '(none)',
        '',
        'Hebrew/Aramaic text of THIS section (the focal one):',
        ctx.sectionHe || '(unavailable)',
        '',
        'Write the background paragraph for THIS section: WHY does its subject matter, and WHY is the Talmud engaging with it HERE?',
      ].join('\n');
      return runArgumentStrategyKimi(c.env.AI, ARG_BACKGROUND_PROMPT, userContent, 4000);
    }
    case 'commentaries': {
      const [rishonim, sefPage] = await Promise.all([
        getRishonimCached(c.env.CACHE, tractate, page).catch(() => null),
        getSefariaPageCached(c.env.CACHE, tractate, page).catch(() => null),
      ]);
      const rashi = sefPage?.rashi ? `<rashi>${(sefPage.rashi.hebrew ?? '').slice(0, 6000)}</rashi>` : '';
      const tosafot = sefPage?.tosafot ? `<tosafot>${(sefPage.tosafot.hebrew ?? '').slice(0, 6000)}</tosafot>` : '';
      const rishonimXml = rishonim ? rishonimBlock(rishonim).slice(0, 10000) : '';
      const userContent = header + [
        'Hebrew/Aramaic text of this section:',
        ctx.sectionHe || '(unavailable)',
        '',
        'Rashi (whole-amud):',
        rashi || '(unavailable)',
        '',
        'Tosafot (whole-amud):',
        tosafot || '(unavailable)',
        '',
        'Rishonim (whole-amud):',
        rishonimXml || '(unavailable)',
        '',
        'List only questions/difficulties raised in the commentary above that pertain to THIS section.',
      ].join('\n');
      return runArgumentStrategyKimi(c.env.AI, ARG_COMMENTARIES_PROMPT, userContent, 8000);
    }
    default:
      throw new Error(`unknown argument strategy: ${strategy}`);
  }
}

async function selfFetchJson(
  c: { req: { url: string }; env: Bindings; executionCtx: ExecutionContext },
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const url = new URL(path, c.req.url).toString();
  const res = await app.fetch(new Request(url, init), c.env, c.executionCtx);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`self-fetch ${init?.method ?? 'GET'} ${path} → ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

interface HalachaTopicShape {
  topic: string;
  topicHe?: string;
  excerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  rulings?: unknown;
  modernAuthorities?: unknown;
  rishonimNotes?: unknown;
  saCommentaryNotes?: unknown;
}
interface AggadataStoryShape {
  title: string;
  titleHe?: string;
  summary?: string;
  excerpt?: string;
  endExcerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  theme?: string;
  parallels?: unknown;
  historicalContext?: unknown;
}
interface ArgumentSectionShape {
  title: string;
  summary?: string;
  excerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  rabbiNames?: string[];
  rabbis?: unknown[];
  references?: unknown[];
  parallels?: unknown[];
  difficulty?: unknown;
}
interface DafContextRabbiShape {
  slug: string | null;
  name: string;
  nameHe?: string;
  generation?: unknown;
  region?: unknown;
  places?: unknown;
  moved?: unknown;
  bio?: string | null;
  image?: string | null;
  wiki?: string | null;
}
interface EraSegmentShape {
  segIdx: number;
  era: unknown;
  source?: unknown;
  why?: string;
  speakers?: unknown;
}

async function identifyEntities(
  c: Parameters<typeof selfFetchJson>[0] & { req: { query(k: string): string | undefined } },
  type: EntityType,
  tractate: string,
  page: string,
  refresh: boolean,
): Promise<Entity[]> {
  const cache = c.env.CACHE;
  const cacheKey = identifyCacheKey(type, tractate, page);
  if (cache && !refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) {
      try {
        const parsed = JSON.parse(hit) as { items: Entity[] };
        if (parsed && Array.isArray(parsed.items)) return parsed.items;
      } catch { /* corrupted, fall through */ }
    }
  }

  const refreshSuffix = refresh ? '?refresh=1' : '';
  let items: Entity[] = [];

  switch (type) {
    case 'rabbi': {
      const data = await selfFetchJson(c, `/api/daf-context/${tractate}/${page}${refreshSuffix}`) as { rabbis?: DafContextRabbiShape[] };
      const rabbis = data.rabbis ?? [];
      items = rabbis.map((r, i) => ({
        id: makeRabbiId(r.slug, i),
        type: 'rabbi',
        anchor: { quote: r.nameHe ?? r.name },
        label: r.name,
        fields: {
          slug: r.slug,
          name: r.name,
          nameHe: r.nameHe,
          generation: r.generation,
          region: r.region,
          places: r.places,
          moved: r.moved,
          bio: r.bio,
          image: r.image,
          wiki: r.wiki,
        },
      }));
      break;
    }
    case 'argument': {
      const data = await selfFetchJson(c, `/api/analyze/${tractate}/${page}?skeleton_only=1${refresh ? '&refresh=1' : ''}`) as { sections?: ArgumentSectionShape[]; summary?: string };
      const sections = data.sections ?? [];
      items = sections.map((s, i) => ({
        id: makeIndexId('argument', i),
        type: 'argument',
        anchor: rangeAnchor(s.startSegIdx, s.endSegIdx, s.excerpt),
        label: s.title,
        fields: {
          title: s.title,
          summary: s.summary,
          excerpt: s.excerpt,
          startSegIdx: s.startSegIdx,
          endSegIdx: s.endSegIdx,
          rabbiNames: s.rabbiNames ?? [],
        },
      }));
      break;
    }
    case 'halacha': {
      const data = await selfFetchJson(c, `/api/halacha/${tractate}/${page}${refreshSuffix}`) as { topics?: HalachaTopicShape[] };
      const topics = data.topics ?? [];
      items = topics.map((t, i) => ({
        id: makeIndexId('halacha', i),
        type: 'halacha',
        anchor: rangeAnchor(t.startSegIdx, t.endSegIdx, t.excerpt),
        label: t.topic,
        fields: {
          topic: t.topic,
          topicHe: t.topicHe,
          excerpt: t.excerpt,
          startSegIdx: t.startSegIdx,
          endSegIdx: t.endSegIdx,
          rulings: t.rulings,
        },
      }));
      break;
    }
    case 'aggadata': {
      const data = await selfFetchJson(c, `/api/aggadata/${tractate}/${page}${refreshSuffix}`) as { stories?: AggadataStoryShape[] };
      const stories = data.stories ?? [];
      items = stories.map((s, i) => ({
        id: makeIndexId('aggadata', i),
        type: 'aggadata',
        anchor: rangeAnchor(s.startSegIdx, s.endSegIdx, s.excerpt),
        label: s.title,
        fields: {
          title: s.title,
          titleHe: s.titleHe,
          summary: s.summary,
          excerpt: s.excerpt,
          endExcerpt: s.endExcerpt,
          startSegIdx: s.startSegIdx,
          endSegIdx: s.endSegIdx,
          theme: s.theme,
        },
      }));
      break;
    }
    case 'pesukim': {
      const data = await selfFetchJson(c, `/api/pesukim/${tractate}/${page}${refreshSuffix}`) as { pesukim?: PesukimStoryShape[] };
      const pesukim = data.pesukim ?? [];
      items = pesukim.map((p, i) => ({
        id: makeIndexId('pesukim', i),
        type: 'pesukim',
        anchor: rangeAnchor(p.startSegIdx, p.endSegIdx, p.excerpt),
        label: p.verseRef,
        fields: {
          verseRef: p.verseRef,
          verseHe: p.verseHe,
          citationMarker: p.citationMarker,
          citationStyle: p.citationStyle,
          excerpt: p.excerpt,
          endExcerpt: p.endExcerpt,
          startSegIdx: p.startSegIdx,
          endSegIdx: p.endSegIdx,
          summary: p.summary,
        },
      }));
      break;
    }
    case 'era': {
      const data = await selfFetchJson(c, `/api/era-context/${tractate}/${page}${refreshSuffix}`) as { segments?: EraSegmentShape[] };
      const segments = data.segments ?? [];
      // Group contiguous segments with the same era classification into a
      // single entity, so the anchor reflects "from where to where this era
      // applies" rather than one entity per Sefaria segment.
      items = [];
      let cursor = 0;
      while (cursor < segments.length) {
        const start = segments[cursor];
        let end = cursor;
        while (end + 1 < segments.length && segments[end + 1].era === start.era) end++;
        const lastSeg = segments[end];
        items.push({
          id: makeEraId(start.segIdx),
          type: 'era',
          anchor: { segmentIdx: start.segIdx, segmentRange: [start.segIdx, lastSeg.segIdx] },
          label: `segments ${start.segIdx}–${lastSeg.segIdx}`,
          fields: {
            startSegIdx: start.segIdx,
            endSegIdx: lastSeg.segIdx,
            era: start.era,
            source: start.source,
            why: start.why,
            speakers: start.speakers,
          },
        });
        cursor = end + 1;
      }
      break;
    }
    case 'region': {
      // First-pass joins skeleton.rabbiNames per section against rabbi-enriched
      // for region/places. One entity per section so each card can carry its
      // own enrichments and anchor to its section's segment range.
      const data = await selfFetchJson(c, `/api/region/${tractate}/${page}${refreshSuffix}`) as RegionFirstPass & { error?: string };
      if (data.error) break;
      // Need section-level segment ranges from the skeleton.
      const skel = await selfFetchJson(c, `/api/analyze/${tractate}/${page}?skeleton_only=1`) as { sections?: ArgumentSectionShape[] };
      const skelSections = skel.sections ?? [];
      items = data.sections.map((sec, i) => {
        const skelSec = skelSections[i];
        // Per-section distribution count
        const dist = { israel: 0, bavel: 0, mixed: 0, unknown: 0 };
        const sageSlugs: string[] = [];
        for (const s of sec.sages) {
          if (s.slug) sageSlugs.push(s.slug);
          if (s.region === 'israel') dist.israel++;
          else if (s.region === 'bavel') dist.bavel++;
          else if (s.region === 'mixed') dist.mixed++;
          else dist.unknown++;
        }
        const migratedHere = sec.sages.filter((s) => s.migrated).map((s) => ({ slug: s.slug, name: s.name, places: s.places }));
        return {
          id: makeIndexId('region', i),
          type: 'region',
          anchor: skelSec ? rangeAnchor(skelSec.startSegIdx, skelSec.endSegIdx, skelSec.excerpt) : { quote: sec.title },
          label: sec.title,
          fields: {
            title: sec.title,
            distribution: dist,
            sages: sec.sages,
            migrated: migratedHere,
            sageSlugs,
          },
        };
      });
      break;
    }
    case 'mesorah': {
      // First-pass walks rabbi-graph primaryTeacher chains for sages on the
      // daf. One entity per resolved sage so each chain can carry its own
      // enrichments. Anchor is the first segment that mentions this sage.
      const data = await selfFetchJson(c, `/api/mesorah/${tractate}/${page}${refreshSuffix}`) as MesorahFirstPass & { error?: string };
      if (data.error) break;
      // Need skeleton to find the first segment for each sage's anchor.
      const skel = await selfFetchJson(c, `/api/analyze/${tractate}/${page}?skeleton_only=1`) as { sections?: ArgumentSectionShape[] };
      const skelSections = skel.sections ?? [];
      const firstSegBySlug: Record<string, { segmentIdx?: number; segmentRange?: [number, number]; quote?: string }> = {};
      for (const sec of skelSections) {
        for (const name of sec.rabbiNames ?? []) {
          const res = resolveRabbiByName(name);
          if (!res) continue;
          if (firstSegBySlug[res.slug]) continue;
          firstSegBySlug[res.slug] = rangeAnchor(sec.startSegIdx, sec.endSegIdx, sec.excerpt);
        }
      }
      items = Object.entries(data.chains).map(([slug, chain]) => ({
        id: makeMesorahId(slug),
        type: 'mesorah',
        anchor: firstSegBySlug[slug] ?? { quote: slug },
        label: chain.length > 0 ? `${slug} ← ${chain[0].canonical}${chain.length > 1 ? '…' : ''}` : `${slug} (no chain)`,
        fields: {
          slug,
          chain,
          depth: data.depth,
        },
      }));
      break;
    }
  }

  if (cache) {
    c.executionCtx.waitUntil(cache.put(cacheKey, JSON.stringify({ items }), { expirationTtl: CACHE_TTL_S }));
  }
  return items;
}

async function enrichEntity(
  c: Parameters<typeof selfFetchJson>[0] & { req: { query(k: string): string | undefined } },
  type: EntityType,
  tractate: string,
  page: string,
  entityId: string,
  strategy: string,
  refresh: boolean,
): Promise<EnrichedEntity> {
  const cache = c.env.CACHE;
  const cacheKey = enrichCacheKey(type, tractate, page, entityId, strategy);
  if (cache && !refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) {
      try {
        const parsed = JSON.parse(hit) as EnrichedEntity;
        if (parsed && parsed.id) return parsed;
      } catch { /* corrupted */ }
    }
  }

  const baseItems = await identifyEntities(c, type, tractate, page, false);
  const baseEntity = baseItems.find((e) => e.id === entityId);
  if (!baseEntity) throw new Error(`entity not found: ${entityId} in ${type}/${tractate}/${page}`);
  const parsed = parseEntityId(entityId);
  if (!parsed) throw new Error(`malformed entity id: ${entityId}`);

  const enriched: EnrichedEntity = {
    ...baseEntity,
    enrichments: { ...(baseEntity as Partial<EnrichedEntity>).enrichments },
  };
  const refreshSuffix = refresh ? '&refresh=1' : '';

  switch (type) {
    case 'rabbi': {
      if (!parsed.slug) throw new Error('rabbi enrich requires a slug-based id');
      const data = await selfFetchJson(c, `/api/admin/enrich-rabbi/${encodeURIComponent(parsed.slug)}${refresh ? '?refresh=1' : ''}`);
      enriched.enrichments[strategy] = data;
      break;
    }
    case 'argument': {
      if (parsed.index == null) throw new Error('argument enrich requires a section index');
      enriched.enrichments[strategy] = await enrichArgumentSection(c, tractate, page, parsed.index, strategy);
      break;
    }
    case 'halacha': {
      const data = await selfFetchJson(c, `/api/enrich-halacha/${tractate}/${page}?strategy=${encodeURIComponent(strategy)}${refreshSuffix}`, { method: 'POST' }) as { topics?: HalachaTopicShape[] };
      const topics = data.topics ?? [];
      const t = topics[parsed.index ?? -1];
      if (t) {
        const slice: Record<string, unknown> = {};
        if (strategy === 'modern-authorities' && t.modernAuthorities !== undefined) slice.modernAuthorities = t.modernAuthorities;
        if (strategy === 'rishonim-condensed' && t.rishonimNotes !== undefined) slice.rishonimNotes = t.rishonimNotes;
        if (strategy === 'sa-commentary-walk' && t.saCommentaryNotes !== undefined) slice.saCommentaryNotes = t.saCommentaryNotes;
        enriched.enrichments[strategy] = slice;
      } else {
        enriched.enrichments[strategy] = null;
      }
      break;
    }
    case 'aggadata': {
      const data = await selfFetchJson(c, `/api/enrich-aggadata/${tractate}/${page}?strategy=${encodeURIComponent(strategy)}${refreshSuffix}`, { method: 'POST' }) as { stories?: AggadataStoryShape[] };
      const stories = data.stories ?? [];
      const s = stories[parsed.index ?? -1];
      if (s) {
        const slice: Record<string, unknown> = {};
        if (strategy === 'parallels' && s.parallels !== undefined) slice.parallels = s.parallels;
        if (strategy === 'historical-context' && s.historicalContext !== undefined) slice.historicalContext = s.historicalContext;
        enriched.enrichments[strategy] = slice;
      } else {
        enriched.enrichments[strategy] = null;
      }
      break;
    }
    case 'pesukim': {
      const data = await selfFetchJson(c, `/api/enrich-pesukim/${tractate}/${page}?strategy=${encodeURIComponent(strategy)}${refreshSuffix}`, { method: 'POST' }) as { pesukim?: PesukimStoryShape[] };
      const pesukim = data.pesukim ?? [];
      const p = pesukim[parsed.index ?? -1];
      if (p) {
        const slice: Record<string, unknown> = {};
        if (strategy === 'tanach-context' && p.tanachContext !== undefined) slice.tanachContext = p.tanachContext;
        if (strategy === 'peshat' && p.peshat !== undefined) slice.peshat = p.peshat;
        if (strategy === 'gemara-usage' && p.gemaraUsage !== undefined) slice.gemaraUsage = p.gemaraUsage;
        if (strategy === 'exegesis' && p.exegesis !== undefined) slice.exegesis = p.exegesis;
        if (strategy === 'synthesize' && p.synthesize !== undefined) slice.synthesize = p.synthesize;
        enriched.enrichments[strategy] = slice;
      } else {
        enriched.enrichments[strategy] = null;
      }
      break;
    }
    case 'era': {
      // Era enrichment uses /api/era-context?stage=2, which batches the LLM
      // refinement over all low-confidence segments and caches the result.
      // First call kicks off background work and returns 204; we GET twice
      // (kick + read) so a single click usually populates after one round-trip.
      const url = `/api/era-context/${tractate}/${page}?stage=2${refresh ? '&refresh=1' : ''}`;
      const kickRes = await app.fetch(new Request(new URL(url, c.req.url).toString()), c.env, c.executionCtx);
      let segments: EraSegmentShape[] | undefined;
      if (kickRes.ok && kickRes.status !== 204) {
        const data = await kickRes.json() as { segments?: EraSegmentShape[] };
        segments = data.segments;
      }
      const seg = (segments ?? []).find((s) => s.segIdx === parsed.segIdx);
      if (seg) {
        enriched.enrichments[strategy] = { era: seg.era, source: seg.source, why: seg.why, speakers: seg.speakers };
      } else {
        enriched.enrichments[strategy] = { status: 'pending', note: 'stage 2 LLM refinement queued; retry shortly' };
      }
      break;
    }
    case 'region':
    case 'mesorah':
      // No LLM strategies remain for these types — only first-pass data
      // surfaces them. enrichEntity treats them as no-ops.
      enriched.enrichments[strategy] = null;
      break;
  }

  if (cache) {
    c.executionCtx.waitUntil(cache.put(cacheKey, JSON.stringify(enriched), { expirationTtl: CACHE_TTL_S }));
  }
  return enriched;
}

app.get('/api/identify/:type/:tractate/:page', async (c) => {
  const type = c.req.param('type');
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  if (!isEntityType(type)) return c.json({ error: `unknown entity type: ${type}` }, 400);
  const refresh = c.req.query('refresh') === '1';
  try {
    const items = await identifyEntities(c, type, tractate, page, refresh);
    const cached = !refresh && c.env.CACHE ? await c.env.CACHE.get(identifyCacheKey(type, tractate, page)) : null;
    return c.json({ items, _type: type, _cached: !!cached });
  } catch (err) {
    return c.json({ error: String(err).slice(0, 500) }, 500);
  }
});

// Bulk cache lookup for the experiment page: returns every (entityId, strategy)
// pair that already has a cached enrichment for this daf+type, so the UI can
// render cached results immediately on load without firing one probe per
// (entity, strategy). Pure KV reads; no AI calls.
//
// Two sources are merged:
//   1. Per-entity v3 cache (`enrich:v3:{type}:{t}:{p}:{entityId}:{strategy}`)
//      — what enrichEntity writes. Covers argument + rabbi cleanly.
//   2. Legacy per-tractate-page caches for halacha / aggadata / pesukim
//      (`enrich-halacha:v1:`, `aggadata-enrich:v1:`, `pesukim-enrich:v1:`)
//      — what the corresponding enrich workflows write. We split each topic /
//      story / pasuk into a per-entity row matching the slicing logic in
//      enrichEntity, so the UI sees the same per-strategy data shape.
app.get('/api/enrich-cached/:type/:tractate/:page', async (c) => {
  const type = c.req.param('type');
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  if (!isEntityType(type)) return c.json({ error: `unknown entity type: ${type}` }, 400);
  const cache = c.env.CACHE;
  if (!cache) return c.json({ items: [] });

  const out: Array<{ entityId: string; strategy: string; data: unknown }> = [];

  // Source 1: per-entity v3 cache. entityId may contain colons (e.g. rabbi:slug),
  // so split on the LAST colon — strategy names never contain colons.
  const v3Prefix = `enrich:v3:${type}:${tractate}:${page}:`;
  let cursor: string | undefined;
  do {
    const list = await cache.list({ prefix: v3Prefix, cursor, limit: 1000 });
    for (const k of list.keys) {
      const tail = k.name.slice(v3Prefix.length);
      const idx = tail.lastIndexOf(':');
      if (idx < 0) continue;
      const entityId = tail.slice(0, idx);
      const strategy = tail.slice(idx + 1);
      const raw = await cache.get(k.name);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { enrichments?: Record<string, unknown> };
        const data = parsed?.enrichments?.[strategy] ?? parsed;
        out.push({ entityId, strategy, data });
      } catch { /* skip corrupted */ }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  // Source 2: legacy per-tractate-page caches that the workflows write.
  // For each strategy known for this type, fetch the page-level enrichment
  // and split it into per-entity rows. Skips strategies already present in
  // the v3 source (per-entity cache wins).
  const haveV3 = new Set(out.map((it) => `${it.entityId}::${it.strategy}`));
  const pushEntity = (entityId: string, strategy: string, data: unknown) => {
    const key = `${entityId}::${strategy}`;
    if (haveV3.has(key)) return;
    out.push({ entityId, strategy, data });
  };

  if (type === 'halacha') {
    for (const strategy of STRATEGIES.halacha) {
      const raw = await cache.get(`enrich-halacha:v1:${strategy}:${tractate}:${page}`);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { topics?: Array<Record<string, unknown>> };
        (parsed.topics ?? []).forEach((t, i) => {
          const slice: Record<string, unknown> = {};
          if (strategy === 'modern-authorities' && t.modernAuthorities !== undefined) slice.modernAuthorities = t.modernAuthorities;
          if (strategy === 'rishonim-condensed' && t.rishonimNotes !== undefined) slice.rishonimNotes = t.rishonimNotes;
          if (strategy === 'sa-commentary-walk' && t.saCommentaryNotes !== undefined) slice.saCommentaryNotes = t.saCommentaryNotes;
          pushEntity(`halacha:${i}`, strategy, slice);
        });
      } catch { /* skip */ }
    }
  } else if (type === 'aggadata') {
    for (const strategy of STRATEGIES.aggadata) {
      const raw = await cache.get(`aggadata-enrich:v1:${strategy}:${tractate}:${page}`);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { stories?: Array<Record<string, unknown>> };
        (parsed.stories ?? []).forEach((s, i) => {
          const slice: Record<string, unknown> = {};
          if (strategy === 'parallels' && s.parallels !== undefined) slice.parallels = s.parallels;
          if (strategy === 'historical-context' && s.historicalContext !== undefined) slice.historicalContext = s.historicalContext;
          pushEntity(`aggadata:${i}`, strategy, slice);
        });
      } catch { /* skip */ }
    }
  } else if (type === 'pesukim') {
    for (const strategy of STRATEGIES.pesukim) {
      const raw = await cache.get(`pesukim-enrich:v1:${strategy}:${tractate}:${page}`);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { pesukim?: Array<Record<string, unknown>> };
        (parsed.pesukim ?? []).forEach((p, i) => {
          const slice: Record<string, unknown> = {};
          if (strategy === 'tanach-context' && p.tanachContext !== undefined) slice.tanachContext = p.tanachContext;
          if (strategy === 'peshat' && p.peshat !== undefined) slice.peshat = p.peshat;
          if (strategy === 'gemara-usage' && p.gemaraUsage !== undefined) slice.gemaraUsage = p.gemaraUsage;
          if (strategy === 'exegesis' && p.exegesis !== undefined) slice.exegesis = p.exegesis;
          if (strategy === 'synthesize' && p.synthesize !== undefined) slice.synthesize = p.synthesize;
          pushEntity(`pesukim:${i}`, strategy, slice);
        });
      } catch { /* skip */ }
    }
  }

  return c.json({ items: out, count: out.length });
});

app.post('/api/enrich/:type/:tractate/:page/:entityId', async (c) => {
  const type = c.req.param('type');
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const entityId = c.req.param('entityId');
  if (!isEntityType(type)) return c.json({ error: `unknown entity type: ${type}` }, 400);
  const strategy = c.req.query('strategy') ?? DEFAULT_STRATEGY[type];
  if (!isValidStrategy(type, strategy)) return c.json({ error: `unknown strategy '${strategy}' for ${type}; valid: ${STRATEGIES[type].join(', ')}` }, 400);
  const refresh = c.req.query('refresh') === '1';
  try {
    const enriched = await enrichEntity(c, type, tractate, page, entityId, strategy, refresh);
    return c.json(enriched);
  } catch (err) {
    return c.json({ error: String(err).slice(0, 500) }, 500);
  }
});

app.post('/api/enrich/:type/:tractate/:page', async (c, next) => {
  const type = c.req.param('type');
  // If `:type` looks like a tractate name (legacy /api/enrich/:t/:p shape used
  // by argument enrichment), let the request fall through to the next handler.
  if (!isEntityType(type)) return next();
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const strategy = c.req.query('strategy') ?? DEFAULT_STRATEGY[type as EntityType];
  if (!isValidStrategy(type as EntityType, strategy)) return c.json({ error: `unknown strategy '${strategy}' for ${type}; valid: ${STRATEGIES[type as EntityType].join(', ')}` }, 400);
  const refresh = c.req.query('refresh') === '1';
  try {
    const items = await identifyEntities(c, type as EntityType, tractate, page, false);
    const concurrency = 3;
    const out: EnrichedEntity[] = new Array(items.length);
    let cursor = 0;
    async function worker() {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          out[i] = await enrichEntity(c, type as EntityType, tractate, page, items[i].id, strategy, refresh);
        } catch (err) {
          out[i] = { ...items[i], enrichments: { [strategy]: { error: String(err).slice(0, 200) } } };
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return c.json({ items: out, _type: type, _strategy: strategy });
  } catch (err) {
    return c.json({ error: String(err).slice(0, 500) }, 500);
  }
});

// ============================================================================
// Admin endpoints for the halacha enrichment Workflow.
// ============================================================================

app.post('/api/admin/enrich-halacha-batch/:tractate', async (c) => {
  const tractate = c.req.param('tractate');
  if (!c.env.HALACHA_ENRICH) return c.json({ error: 'HALACHA_ENRICH workflow binding unavailable' }, 503);
  const body = await c.req.json().catch(() => ({})) as {
    dafim?: string[];
    strategies?: Array<'modern-authorities' | 'rishonim-condensed' | 'sa-commentary-walk'>;
    refresh?: boolean;
  };
  const instance = await c.env.HALACHA_ENRICH.create({
    params: {
      tractate,
      dafim: body.dafim,
      strategies: body.strategies,
      refresh: body.refresh ?? false,
      baseUrl: new URL(c.req.url).origin,
    },
  });
  return c.json({ instanceId: instance.id, status: 'started', tractate });
});

app.get('/api/admin/enrich-halacha-batch/status/:instanceId', async (c) => {
  const instanceId = c.req.param('instanceId');
  if (!c.env.HALACHA_ENRICH) return c.json({ error: 'HALACHA_ENRICH workflow binding unavailable' }, 503);
  const instance = await c.env.HALACHA_ENRICH.get(instanceId);
  const status = await instance.status();
  return c.json({ instanceId, ...status });
});

// Fetch a single Tanakh pasuk's full Hebrew + English text plus refs to
// the immediately surrounding verses. Used by the sidebar Pasuk panel to
// show the full quoted verse and let the reader step ± through Tanakh.
// Sefaria's /api/texts response carries `next` / `prev` strings — we trust
// those over manually parsing chapter:verse so book boundaries stay correct.
app.get('/api/pasuk', async (c) => {
  const ref = c.req.query('ref') ?? '';
  if (!ref || ref.length > 100) return c.json({ error: 'missing or invalid ref' }, 400);
  const cache = c.env.CACHE;
  const safe = ref.replace(/[^A-Za-z0-9 .:-]/g, '_');
  const key = `pasuk:v4:${safe}`;
  if (cache) {
    const hit = await cache.get(key);
    if (hit) return c.json({ ...JSON.parse(hit), _cached: true });
  }
  try {
    const res = await sefariaAPI.getText(ref, { context: 0 });
    const heRaw = Array.isArray(res.he) ? res.he.join(' ') : (res.he ?? '');
    const enRaw = Array.isArray(res.text) ? res.text.join(' ') : (res.text ?? '');
    const he = cleanVerseText(heRaw);
    const en = cleanVerseText(enRaw);
    // Sefaria's response.prev/next is chapter-level for many books. We want
    // verse-level stepping for the sidebar, so parse the canonical ref into
    // (book, chapter, verse) and step verse by ±1. Chapter boundaries fall
    // through to a 404 on the next click; the UI hides the disabled arrow.
    const canonical = res.ref ?? ref;
    const m = canonical.match(/^(.+?)\s+(\d+):(\d+)$/);
    let prevRef: string | null = null;
    let nextRef: string | null = null;
    if (m) {
      const [, book, chap, verseStr] = m;
      const verse = parseInt(verseStr, 10);
      if (verse > 1) prevRef = `${book} ${chap}:${verse - 1}`;
      nextRef = `${book} ${chap}:${verse + 1}`;
    }
    const out = {
      ref: canonical,
      heRef: res.heRef ?? null,
      he,
      en,
      prevRef,
      nextRef,
      book: res.book ?? null,
    };
    if (cache && out.he) {
      await cache.put(key, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
    }
    return c.json(out);
  } catch (err) {
    return c.json({ error: String(err).slice(0, 200), ref }, 502);
  }
});

// LLM-driven hebraize pass: takes English text with parenthesized
// transliterations of Hebrew/Aramaic terms and returns the same text with
// each parenthetical converted to Hebrew script. Catches the long tail the
// static dict in src/client/hebraize.ts can't cover (composite phrases,
// slash-separated alternatives, unusual academic spellings). Gemma is
// cheap and fast (~2s, ~$0.0002 per call). KV-cached by SHA-256 of input
// + the gateway's prompt cache double-buffers — repeat calls are free.
const HEBRAIZE_LLM_SYSTEM_PROMPT = `You are a hebraizer. You receive English (with embedded transliterations of Hebrew or Aramaic terms inside parentheses) and return the SAME English text with EACH parenthesized transliteration replaced by the Hebrew script equivalent.

Rules:
- ONLY change content inside parentheses. Leave everything else untouched, character for character.
- Inside parens: if the content is a transliteration of a Hebrew/Aramaic term (academic or Sefaria-style), output the Hebrew. Examples:
  - (kapara) → (כפרה)
  - (ve-lo zu bilvad) → (ולא זו בלבד)
  - (geder/gezeirah) → (גדר/גזירה)
  - (ha-ashmurah ha-rishonah) → (האשמורה הראשונה)
  - (haqtarat ḥalavim ve-evarim) → (הקטרת חלבים ואיברים)
  - (ve-lo zu bilvad... ella kol mah she-amru Ḥakhamim) → (ולא זו בלבד... אלא כל מה שאמרו חכמים)
- If the parens already contain Hebrew, leave them as-is.
- If the parens contain a non-transliteration (e.g. an English aside, a year, a verse reference like "Deut 6:7", an English gloss), leave them as-is.
- Output ONLY the transformed text. No prose, no explanation, no markdown fences. Preserve all whitespace, punctuation, line breaks exactly.`;

app.post('/api/hebraize', async (c) => {
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  let body: { text?: string };
  try { body = await c.req.json() as { text?: string }; }
  catch { return c.json({ error: 'bad json' }, 400); }
  const text = body.text ?? '';
  if (!text) return c.json({ hebraized: '', _empty: true });
  if (text.length > 8000) return c.json({ error: 'text too long (max 8000 chars)' }, 413);
  if (!/\([^)]+\)/.test(text)) return c.json({ hebraized: text, _noop: true });

  const cache = c.env.CACHE;
  // Hash the input so cache key is short + content-addressed. Workers have
  // SubtleCrypto available; sha-256 over UTF-8 bytes.
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = `hebraize:v1:${hash}`;
  if (cache) {
    const hit = await cache.get(key);
    if (hit) return c.json({ hebraized: hit, _cached: true });
  }

  try {
    const resp = (await c.env.AI.run('@cf/google/gemma-4-26b-a4b-it' as never, {
      messages: [
        { role: 'system', content: HEBRAIZE_LLM_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      max_tokens: Math.min(4096, Math.ceil(text.length * 1.5) + 256),
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
    } as never)) as {
      response?: string;
      choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
    };
    const choice = resp.choices?.[0]?.message;
    const out = (resp.response ?? choice?.content ?? choice?.reasoning ?? '').trim();
    if (!out) return c.json({ error: 'empty response', text, raw: resp }, 502);
    if (cache) {
      c.executionCtx.waitUntil(cache.put(key, out, { expirationTtl: 60 * 60 * 24 * 365 }));
    }
    return c.json({ hebraized: out });
  } catch (err) {
    return c.json({ error: String(err).slice(0, 300) }, 502);
  }
});

app.get('/api/admin/rabbi-enriched/:slug', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const slug = c.req.param('slug');
  const hit = await c.env.CACHE.get(`rabbi-enriched:v1:${slug}`);
  if (!hit) return c.json({ error: 'not enriched', slug }, 404);
  return c.json({ slug, record: JSON.parse(hit) });
});

// --- Per-daf rabbi bio synthesize -------------------------------------
// Rewrites a sage's bio paragraph specifically for the daf they appear on.
// Reads ALL available rabbi enrichments (unified bio, wikidata, wiki-bio,
// graph edges) plus this sage's role on this daf (skeleton.rabbiNames + the
// rich-rabbi enrichment if cached) and produces a contextual bio. The
// "displayed bio" on the daf is the synthesized paragraph; the underlying
// enrichments are shown as raw content below. Auto-fired by the client when
// any rabbi-* enrichment changes.

const RABBI_BIO_DAF_PROMPT = `You write the GIST of one sage's biography AS IT BEARS ON THE SPECIFIC DAF THE READER IS ON. Rewrite the standard bio using whatever rabbi enrichments are provided (standard bio, Wikidata facts, Wikipedia bio, graph edges showing teachers/students/family/opposed, regional/migration signal, mesorah chain) plus the sage's role on THIS daf as authoritative context.

The reader has just opened this sugya and wants to know: who is this sage, and what should I notice about them as I read THIS section?

**HARD CAPS:**
- 2-4 sentences. Maximum 600 characters total.
- First sentence: who they are (era, region, signature). Cite their generation/region/academy if clear.
- Second sentence: how they connect to the named voices on THIS daf (teacher / student / disputant of <other voice on the daf>) — only when the graph or mesorah supports it.
- Third sentence (optional): a notable biographical fact relevant to the type of sugya this is (halachic, aggadic, etc.) — pulled from the standard bio, Wikipedia, or migration signal.
- Do NOT recap their full life. The full bio + Wikipedia extract are shown raw below the synthesis.

Output STRICT JSON only:

{ "explanation": "the per-daf bio paragraph", "groundedIn": ["unified","wikidata","wiki-bio","rabbi-graph","daf-role","region","mesorah"] }

groundedIn lists ONLY slices actually supplied. Do not include slices that were not in the input.`;

app.post('/api/enrich-rabbi-bio/:tractate/:page/:slug', async (c) => {
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const slug = c.req.param('slug');
  const refresh = c.req.query('refresh') === '1';
  const includeRawBio = c.req.query('include') ?? '';
  const includeNormBio = includeRawBio
    ? includeRawBio.split(',').map((s) => s.trim()).filter(Boolean).sort().join(',')
    : '';
  const cacheKey = includeNormBio
    ? `rabbi-bio:v1:i=${includeNormBio}:${tractate}:${page}:${slug}`
    : `rabbi-bio:v1:${tractate}:${page}:${slug}`;
  const includeSetBio = new Set(includeNormBio ? includeNormBio.split(',') : []);
  const wantBio = (s: string) => includeSetBio.size === 0 || includeSetBio.has(s);

  if (!refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) return c.json({ ...JSON.parse(hit), _cached: true });
  }

  // Inputs. region needs unified (for places) and the daf's region first-pass.
  // mesorah needs the rabbi-graph (for primaryTeacher walk) and the daf's
  // mesorah first-pass (for chain context).
  const needsUnifiedForRegion = wantBio('region');
  const needsGraphForMesorah = wantBio('mesorah');
  const [unifiedRaw, wikidataRaw, wikiBioRaw, graphRaw, skelRaw, regionDafRaw, mesorahDafRaw] = await Promise.all([
    (wantBio('unified') || needsUnifiedForRegion) ? cache.get(`rabbi-enriched:v1:${slug}`) : Promise.resolve(null),
    wantBio('wikidata')     ? cache.get(`rabbi-wikidata:v1:${slug}`)         : Promise.resolve(null),
    wantBio('wiki-bio')     ? cache.get(`rabbi-wiki-bio:v1:${slug}`)         : Promise.resolve(null),
    (wantBio('rabbi-graph') || needsGraphForMesorah) ? cache.get('rabbi-graph:v1') : Promise.resolve(null),
    wantBio('daf-role')     ? cache.get(`analyze-skel:v2:${tractate}:${page}`) : Promise.resolve(null),
    wantBio('region')       ? cache.get(`region:v1:${tractate}:${page}`)    : Promise.resolve(null),
    wantBio('mesorah')      ? cache.get(`mesorah:v1:${tractate}:${page}`)   : Promise.resolve(null),
  ]);

  const tryParse = <T>(raw: string | null): T | null => {
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  };
  const unified = tryParse<EnrichedRabbiRecord>(unifiedRaw);
  const wikidata = tryParse<Record<string, unknown>>(wikidataRaw);
  const wikiBio = tryParse<Record<string, unknown>>(wikiBioRaw);
  const graph = tryParse<{ nodes: Record<string, { primaryTeacher?: string | null; canonical?: string }> }>(graphRaw);
  const skel = tryParse<DafSkeleton>(skelRaw);
  const regionDaf = tryParse<{ sections?: Array<{ title: string; sages?: Array<{ slug: string | null; region?: string | null; places?: string[]; migrated?: boolean }> }>; migrated?: Array<{ slug: string }> }>(regionDafRaw);
  const mesorahDaf = tryParse<{ chains?: Record<string, Array<{ canonical: string; generation: string | null }>> }>(mesorahDafRaw);

  // Find this sage's role on the daf — which sections name them, and the
  // names of the OTHER voices in those sections (so the LLM can mention
  // dispute partners specific to this daf).
  let dafRole: { sectionsNamingSage: string[]; coNames: string[] } | null = null;
  if (skel && unified) {
    const aliasSet = new Set<string>();
    aliasSet.add(unified.canonical.en.toLowerCase());
    aliasSet.add(unified.canonical.he);
    for (const a of unified.aliases ?? []) aliasSet.add(a.toLowerCase());
    const sectionsNaming: string[] = [];
    const coNames = new Set<string>();
    for (const sec of skel.sections) {
      const matchesHere = sec.rabbiNames.some((n) => aliasSet.has(n.toLowerCase()));
      if (!matchesHere) continue;
      sectionsNaming.push(sec.title);
      for (const n of sec.rabbiNames) {
        if (!aliasSet.has(n.toLowerCase())) coNames.add(n);
      }
    }
    dafRole = { sectionsNamingSage: sectionsNaming, coNames: [...coNames] };
  }

  const myGraphNode = graph?.nodes?.[slug] ?? null;

  // Region slice — pull this sage's region/places + migration status from
  // unified + the daf's region first-pass (which has co-sage context).
  let regionSlice: Record<string, unknown> | null = null;
  if (wantBio('region')) {
    const regionEntries: Record<string, unknown> = {};
    if (unified?.region) regionEntries.region = unified.region;
    if (unified?.places) regionEntries.places = unified.places;
    if (regionDaf) {
      // Sections that name this sage + their regional dynamic.
      const sections = regionDaf.sections ?? [];
      const dafSections = sections
        .filter((sec) => (sec.sages ?? []).some((s) => s.slug === slug))
        .map((sec) => ({
          title: sec.title,
          coRegions: (sec.sages ?? []).filter((s) => s.slug !== slug).map((s) => s.region).filter(Boolean),
        }));
      if (dafSections.length > 0) regionEntries.dafSectionsRegions = dafSections;
      const migrated = (regionDaf.migrated ?? []).find((m) => m.slug === slug);
      if (migrated) regionEntries.migrated = true;
    }
    if (Object.keys(regionEntries).length > 0) regionSlice = regionEntries;
  }

  // Mesorah slice — walk primaryTeacher up from rabbi-graph to construct
  // this sage's chain. Append the daf's mesorah first-pass chain when present
  // (might already include this sage with extra metadata like generation).
  let mesorahSlice: Record<string, unknown> | null = null;
  if (wantBio('mesorah')) {
    const entries: Record<string, unknown> = {};
    if (graph?.nodes?.[slug]) {
      const chain: Array<{ slug: string; canonical?: string }> = [];
      const seen = new Set<string>([slug]);
      let cursor: string | null | undefined = graph.nodes[slug].primaryTeacher;
      let depth = 0;
      while (cursor && !seen.has(cursor) && depth < 6) {
        seen.add(cursor);
        const node = graph.nodes[cursor];
        if (!node) break;
        chain.push({ slug: cursor, canonical: node.canonical });
        cursor = node.primaryTeacher;
        depth++;
      }
      if (chain.length > 0) entries.chain = chain;
    }
    if (mesorahDaf?.chains?.[slug]) {
      entries.dafChain = mesorahDaf.chains[slug];
    }
    if (Object.keys(entries).length > 0) mesorahSlice = entries;
  }

  const inputBlocks: string[] = [];
  if (unified && wantBio('unified')) inputBlocks.push(`<unified>\n${JSON.stringify({
    canonical: unified.canonical, aliases: unified.aliases, generation: unified.generation,
    region: unified.region, academy: unified.academy, places: unified.places,
    bio: unified.bio.en, orientation: unified.orientation, characteristics: unified.characteristics,
    primaryTeacher: unified.primaryTeacher, primaryStudent: unified.primaryStudent,
  }, null, 2)}\n</unified>`);
  if (wikidata) inputBlocks.push(`<wikidata>\n${JSON.stringify(wikidata, null, 2)}\n</wikidata>`);
  if (wikiBio) inputBlocks.push(`<wiki_bio>\n${JSON.stringify(wikiBio, null, 2)}\n</wiki_bio>`);
  if (myGraphNode && wantBio('rabbi-graph')) inputBlocks.push(`<rabbi_graph>\n${JSON.stringify(myGraphNode, null, 2)}\n</rabbi_graph>`);
  if (dafRole) inputBlocks.push(`<daf_role>\n${JSON.stringify(dafRole, null, 2)}\n</daf_role>`);
  if (regionSlice) inputBlocks.push(`<region>\n${JSON.stringify(regionSlice, null, 2)}\n</region>`);
  if (mesorahSlice) inputBlocks.push(`<mesorah>\n${JSON.stringify(mesorahSlice, null, 2)}\n</mesorah>`);

  if (inputBlocks.length === 0) {
    return c.json({ error: 'no rabbi enrichments cached for this slug yet — run unified first' }, 412);
  }

  const userContent = [
    `Tractate: ${tractate}`,
    `Page: ${page}`,
    `Sage slug: ${slug}`,
    `Sage canonical: ${unified?.canonical.en ?? '(unknown)'}`,
    '',
    inputBlocks.join('\n\n'),
    '',
    'Synthesize the per-daf bio.',
  ].join('\n');

  const t0 = Date.now();
  let parsed: { explanation?: string; groundedIn?: string[] } = {};
  try {
    const s = await runKimiStreaming(
      c.env.AI, '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: RABBI_BIO_DAF_PROMPT },
        { role: 'user', content: userContent },
      ],
      4000,
      { chatTemplateKwargs: { enable_thinking: false } },
    );
    let payload = s.content.trim();
    const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) payload = fenced[1].trim();
    parsed = JSON.parse(payload);
  } catch (err) {
    return c.json({ error: `bio synthesize: ${String(err).slice(0, 200)}` }, 502);
  }

  const out = {
    tractate, page, slug,
    explanation: parsed.explanation ?? '',
    groundedIn: parsed.groundedIn ?? [],
    generatedAt: new Date().toISOString(),
    _ms: Date.now() - t0,
  };
  await cache.put(cacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
  return c.json(out);
});

app.get('/api/enrich-rabbi-bio/:tractate/:page/:slug', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const { tractate, page, slug } = c.req.param();
  const hit = await c.env.CACHE.get(`rabbi-bio:v1:${tractate}:${page}:${slug}`);
  if (!hit) return c.json({ error: 'not synthesized' }, 404);
  return c.json(JSON.parse(hit));
});

// ============================================================================
// Admin endpoints for the per-entity-type enrichment Workflows.
// One create + one status endpoint per workflow. Identical shape; the only
// thing that varies is which binding gets invoked.
// ============================================================================

app.post('/api/admin/enrich-argument-batch/:tractate', async (c) => {
  if (!c.env.ARGUMENT_ENRICH) return c.json({ error: 'ARGUMENT_ENRICH workflow binding unavailable' }, 503);
  const tractate = c.req.param('tractate');
  const body = await c.req.json().catch(() => ({})) as {
    dafim?: string[]; strategies?: string[]; refresh?: boolean;
  };
  const instance = await c.env.ARGUMENT_ENRICH.create({
    params: {
      tractate,
      dafim: body.dafim,
      strategies: body.strategies,
      refresh: body.refresh ?? false,
      baseUrl: new URL(c.req.url).origin,
    },
  });
  return c.json({ instanceId: instance.id, status: 'started', tractate });
});

app.get('/api/admin/enrich-argument-batch/status/:instanceId', async (c) => {
  if (!c.env.ARGUMENT_ENRICH) return c.json({ error: 'ARGUMENT_ENRICH workflow binding unavailable' }, 503);
  const instance = await c.env.ARGUMENT_ENRICH.get(c.req.param('instanceId'));
  return c.json({ instanceId: c.req.param('instanceId'), ...(await instance.status()) });
});

app.post('/api/admin/enrich-aggadata-batch/:tractate', async (c) => {
  if (!c.env.AGGADATA_ENRICH) return c.json({ error: 'AGGADATA_ENRICH workflow binding unavailable' }, 503);
  const tractate = c.req.param('tractate');
  const body = await c.req.json().catch(() => ({})) as {
    dafim?: string[]; strategies?: string[]; refresh?: boolean;
  };
  const instance = await c.env.AGGADATA_ENRICH.create({
    params: {
      tractate,
      dafim: body.dafim,
      strategies: body.strategies,
      refresh: body.refresh ?? false,
      baseUrl: new URL(c.req.url).origin,
    },
  });
  return c.json({ instanceId: instance.id, status: 'started', tractate });
});

app.get('/api/admin/enrich-aggadata-batch/status/:instanceId', async (c) => {
  if (!c.env.AGGADATA_ENRICH) return c.json({ error: 'AGGADATA_ENRICH workflow binding unavailable' }, 503);
  const instance = await c.env.AGGADATA_ENRICH.get(c.req.param('instanceId'));
  return c.json({ instanceId: c.req.param('instanceId'), ...(await instance.status()) });
});

app.post('/api/admin/enrich-pesukim-batch/:tractate', async (c) => {
  if (!c.env.PESUKIM_ENRICH) return c.json({ error: 'PESUKIM_ENRICH workflow binding unavailable' }, 503);
  const tractate = c.req.param('tractate');
  const body = await c.req.json().catch(() => ({})) as {
    dafim?: string[]; strategies?: string[]; refresh?: boolean;
  };
  const instance = await c.env.PESUKIM_ENRICH.create({
    params: {
      tractate,
      dafim: body.dafim,
      strategies: body.strategies,
      refresh: body.refresh ?? false,
      baseUrl: new URL(c.req.url).origin,
    },
  });
  return c.json({ instanceId: instance.id, status: 'started', tractate });
});

app.get('/api/admin/enrich-pesukim-batch/status/:instanceId', async (c) => {
  if (!c.env.PESUKIM_ENRICH) return c.json({ error: 'PESUKIM_ENRICH workflow binding unavailable' }, 503);
  const instance = await c.env.PESUKIM_ENRICH.get(c.req.param('instanceId'));
  return c.json({ instanceId: c.req.param('instanceId'), ...(await instance.status()) });
});

const YOMI_WARM_CRON = '0 3 * * *';

export default {
  fetch: (req: Request, env: Bindings, ctx: ExecutionContext) => app.fetch(req, wrapEnv(env), ctx),
  scheduled: (controller: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    const wrapped = wrapEnv(env);
    if (controller.cron === YOMI_WARM_CRON) {
      ctx.waitUntil(runYomiWarmCron());
    } else {
      ctx.waitUntil(runWarmCron(wrapped));
    }
  },
} satisfies ExportedHandler<Bindings>;

// Export the Workflow classes so the Workers runtime can instantiate them
// for the [[workflows]] bindings declared in wrangler.toml.
export { HalachaEnrichWorkflow } from './halacha-enrich-workflow';
export { ArgumentEnrichWorkflow } from './argument-enrich-workflow';
export { AggadataEnrichWorkflow } from './aggadata-enrich-workflow';
export { PesukimEnrichWorkflow } from './pesukim-enrich-workflow';
