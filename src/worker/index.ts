import { Hono } from 'hono';
import {
  sefariaAPI,
  adjacentAmud,
  type TalmudPageData,
  type RishonimBundle,
  type HalachicRefBundle,
  type HebrewBooksDaf,
} from '../lib/sefref';
import { getDafyomiMasechet } from '../lib/sefref/dafyomi/masechtos';
import { collectContext } from './context-providers';
import { fromDafyomi } from '../lib/context/fromDafyomi';
import { placeRevachWithAi } from './revach-ai-place';
import { formatContextForPrompt, contextForAnchor, segsFromMarkInput } from '../lib/context/select';
import { continuationLink, type FlowEdge } from '../lib/context/link';
import { formatGroundedRefsForPrompt, buildDerivation } from '../lib/halacha/codifiers';
import { dafSpine } from '../lib/context/spine';
import { dafLinks } from '../lib/context/dafLinks';
import { producerNodesFrom, reverseDependencyIndex, transitiveDependents } from '../lib/registry/depGraph';
import { aiMatchToSegments } from './context-match';
import type { MatchInput } from '../lib/context/anchor/ai-prompt';
import {
  getHebrewBooksDafCached,
  getSefariaPageCached,
  getRishonimCached,
  getHalachaRefsCached,
  getCodeSourcesCached,
  getSaCommentaryCached,
  getDafTopicsCached,
  getMishnaBundleCached,
  getYerushalmiCached,
  getSefariaSegmentsCached,
  getDafyomiContentCached,
  type CacheTrack,
  type SefariaSegments,
} from './source-cache';
import {
  runWarmCron,
  readWarmCursor,
  warmProgressProcessed,
  getWarmTotal,
  readSefariaWarmCursor,
  sefariaWarmProgressProcessed,
  type EmailBinding,
} from './warm-cron';
import { runBacklogBackfill } from './backfill-backlog';
import {
  computeCacheStats,
  readCachedCacheStats,
  writeCachedCacheStats,
  isFresh,
  cacheGcTargets,
} from './cache-stats';
import { gcStaleCache } from './cache-gc';
import { runYomiWarmCron } from './yomi-cron';
import { GENERATION_IDS, GENERATION_BY_ID, GENERATIONS_PROMPT_REFERENCE, type GenerationId } from '../client/generations';
import { stripEchoParens } from '../client/hebraize';
import rabbiPlacesData from '../lib/data/rabbi-places.json';
import type { EntityPiece } from '../lib/registry/entity';
import { extractTalmudContent } from '../lib/sefref/alignment';
import { fetchHebrewBooksDaf } from '../lib/sefref/hebrewbooks/client';
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
import { runLLM, type LLMModelId, type LLMResult, type LLMUsage } from './llm';
import { checkBudget, isBudgetPaused, budgetStatus, clearPauses, type BudgetScope } from './budget';
import { lookupRelationships } from './rabbi-graph';
import { runPasses } from '../lib/check/passes';
import { composeTypeProfile, sectionHasNamedSpeaker, type LayerId, type LayerInstance, type TypeProfile, type UnitRange } from '../lib/typing/profile';
import { findMarkers } from '../lib/typing/markers';
import { noteLintAttempt, readLintFailures, type LintFailuresSummary } from './lint-failures';
import { partitionSections, dedupeByRange, dedupeBy, selectSectionMoves, type MoveLike } from '../lib/argumentMoves';
import { DEFAULT_MODEL, DEFAULT_FALLBACK_CHAIN, isLLMModelId, MODEL_PRESETS } from './settings';
import { costUsd as priceCostUsd, normalizeUsage } from './pricing';
import { recordUsage, readUsageSummary } from './usage-rollup';
import { recordUnknownRabbi, recordObservedPlace, recordObservedConcept, listUnknownRabbis, listObservedPlaces, listObservedConcepts } from './unknown-registry';
import { fetchGatewayCost } from './aigw-analytics';
import { fetchZoneActivity } from './cf-zone-analytics';
import { lookupGloss } from './word-glosses';
import {
  readMark, listMarks, writeMark, deleteMark, validateMark,
  readEnrichment, listEnrichments, writeEnrichment, deleteEnrichment, validateEnrichment,
  type MarkDefinition as KvMarkDefinition,
  type EnrichmentDefinition,
} from './studio-registry';
import { CODE_MARKS, CODE_ENRICHMENTS, findCodeMark, findCodeEnrichment } from './code-marks';
import {
  ENRICH_JSON_SCHEMA,
  TRANSLATE_BIO_JSON_SCHEMA,
  ARGUMENT_BRIDGE_OUTPUT_SCHEMA,
} from './output-schemas';
import { findHadranSegments } from '../lib/typing/markers';
import { hadranBridge, edgeOfTractateBridge, buildBridgePrompt, llmBridge, type DafBridge, type BridgeSection } from '../lib/typing/bridge';
import type {
  MarkDefinition as SchemaMarkDefinition,
  EnrichmentDefinition as SchemaEnrichmentDefinition,
  EnrichmentDependency,
  MarkDependency,
  LLMExtractor,
} from './studio-schema';
import {
  keyForMark,
  keyForEnrichment,
  keyForGemara,
  keyForCommentaries,
  instanceIdOf,
  qualifierHash,
  normalizeQualifier,
  previousVersionKey,
  recipeHash,
  keyForRabbiEnriched,
  keyForRabbiWikidata,
  keyForRabbiWikiBio,
  keyForAnalyzeSkeleton,
  keyForRegion,
  keyForMesorah,
  keyForCommentaryWorks,
  keyForCommentaryText,
  keyForReferences,
  keyForBridge,
  keyForPasuk,
  keyForCtxMatch,
  keyForTranslate,
  keyForHebraize,
  keyForRabbiBioBySlug,
  keyForRabbiBioOnDaf,
  keyForRabbiGraph,
  keyForRabbiCohort,
  keyForRabbiPlacesIndex,
  keyForRabbiAcademyRoster,
  keyForRabbiObs,
  keyForRabbiObsDirty,
  prefixForRabbiObs,
} from './cache-keys';
import {
  buildObservationSlices,
  resolveSegIdxs,
  normalizeForMatch,
  type ResolvedRabbi,
  type ResolvedPlace,
  type RangeItem,
  type ObservationSlice,
} from './rabbi-observations';

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
  // AI Gateway routing (see src/worker/ai-gateway.ts).
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_DISABLE?: string;
  // OpenRouter via AI Gateway Universal Endpoint (see src/worker/llm.ts).
  OPENROUTER_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  // Cloudflare API token (Account Analytics: Read) for the AI Gateway cost
  // query in aigw-analytics.ts. Set via `wrangler secret put CF_ANALYTICS_TOKEN`.
  CF_ANALYTICS_TOKEN?: string;
  OPENROUTER_GATEWAY_PROVIDER?: string;
  DEFAULT_LLM_MODEL?: string;
  // Enrichment job queue — see wrangler.toml + queue handler at the bottom
  // of this file. /api/run enqueues a JobMessage; the queue consumer
  // runs the LLM chain and writes the result to KV under `job:{runId}`.
  ENRICHMENT_QUEUE?: Queue<JobMessage>;
  // When '1', the background Sefaria Shas walk also enqueues rabbi.observations
  // per amud (full reverse-index backfill). OFF by default — see WarmEnv.
  OBSERVATIONS_WARM_SHAS?: string;
  // Dynamic Worker Loader binding (wrangler.toml `worker_loaders`). Spins up the
  // isolated sandbox the code-mode MCP `execute` tool runs in. Optional: when
  // unset, GET/POST /mcp returns 503 and the rest of the worker is unaffected.
  LOADER?: WorkerLoader;
  // Shared secret gating the privileged /api/run knobs (ad_hoc,
  // model_override, bypass_cache) and the admin mutation endpoints. Presented
  // by trusted tools as the `x-studio-secret` header. UNSET => every request is
  // treated as untrusted (fail-safe): the public app still works (it only uses
  // the safe subset), but no one can use the worker as a free LLM proxy.
  // Set via `wrangler secret put STUDIO_SECRET`.
  STUDIO_SECRET?: string;
  // Spend-budget overrides (USD) read by ./budget. Default 300 / 10 when unset.
  DAILY_BUDGET_USD?: string;
  HOURLY_CUSTOM_BUDGET_USD?: string;
}

// Message shape on the enrichment queue. Carries everything the consumer
// needs to recreate the run-handler context: which mark/enrichment to run,
// the daf, optional mark_input + model_override + bypass_cache.
// Exported so yomi-cron.ts can enqueue warm jobs directly (type-only import,
// erased at build — no runtime cycle with this entry module).
export interface JobMessage {
  runId: string;
  mark_id?: string;
  enrichment_id?: string;
  ad_hoc?: unknown;
  tractate: string;
  page: string;
  model_override?: string;
  mark_input?: unknown;
  bypass_cache?: boolean;
  /** Free-text input that becomes part of the enrichment's cache key (via
   *  qualifierHash) and is exposed to its prompt as {{user_question}}. Used
   *  by argument-move.qa today. Empty/undefined means a vanilla run. */
  user_question?: string;
  /** Output language for enrichments. 'he' selects the *_he prompt variant
   *  and a `:he`-namespaced cache key; omitted/'en' is the default English
   *  path. Marks ignore this (language-neutral output). */
  lang?: 'en' | 'he';
  /** Deep-warm job: run this daf's structural marks, then fan out a warm job
   *  for every per-instance enrichment (synthesis + suggested-questions). Used
   *  by /api/warm-daf to comprehensively pre-warm an adjacent daf so navigation
   *  lands on a fully-cached page. Mutually exclusive with mark_id/enrichment_id. */
  warm_deep?: boolean;
  /** With `warm_deep`, restrict the warm to this set of enrichment ids (the
   *  re-warm cascade) and EVICT their cache entries so they regenerate. A recipe
   *  edit leaves the key unchanged, so the cascade must be evicted to actually
   *  regenerate — but only the cascade, so unchanged dependencies still cache-hit
   *  (see deepWarmDaf `evict`). Covers the deep-warm surface (synthesis /
   *  suggested-questions / overview); cascade ids outside it regenerate on their
   *  next on-demand request. */
  rewarm_only?: string[];
}

// ---------------------------------------------------------------------------
// Request trust + spend-pause helpers (see ./budget for the budget guard).
// ---------------------------------------------------------------------------

/** Constant-time-ish string compare (avoids early-exit timing leaks beyond
 *  length). */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True iff the request carries the STUDIO_SECRET (header `x-studio-secret`, or
 * `Authorization: Bearer <secret>`). Returns FALSE whenever the secret is unset
 * — fail-safe, so the privileged /api/run knobs (ad_hoc, model_override,
 * bypass_cache) and the admin mutation endpoints stay locked until the owner
 * provisions the secret. The public daf app never needs these, so locking them
 * by default doesn't degrade it.
 */
function isTrustedRequest(c: { req: { header: (k: string) => string | undefined }; env: Bindings }): boolean {
  const secret = c.env.STUDIO_SECRET;
  if (!secret) return false;
  const presented =
    c.req.header('x-studio-secret') ??
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  return presented.length > 0 && timingSafeEqualStr(presented, secret);
}

/** Seconds until a pause lifts, for a Retry-After-style hint. */
function pauseRetryAfterSec(until?: number): number {
  if (!until) return 3600;
  return Math.max(1, Math.ceil((until - Date.now()) / 1000));
}

/** Human fallback message for a paused response. The client maps the `paused`
 *  flag to its own localized copy; this is for non-UI / API consumers. */
function pauseErrorMessage(scope?: BudgetScope): string {
  return scope === 'custom'
    ? 'Custom-question generation is paused for now (hourly budget reached). Please try again later.'
    : 'AI generation is paused for now (daily budget reached). Please try again tomorrow.';
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

/**
 * Fetch the Hebrew verbatim text of a single pasuk for prompt injection.
 * Shares the `pasuk:v4:` KV cache with the /api/pasuk endpoint so warm-cache
 * fetches are free. Returns '' on any failure — callers treat that as "no
 * Hebrew text available" rather than failing the whole enrichment run.
 *
 * Used by pesukim.* enrichments to inject `{{pasuk_he}}` into the prompt so
 * the LLM has a verbatim source to quote from instead of reconstructing
 * (which it has been doing wrong: English translation in quotes, no Hebrew).
 */
async function fetchPasukHebrewForPrompt(env: Bindings, ref: string): Promise<string> {
  if (!ref) return '';
  const safe = ref.replace(/[^A-Za-z0-9 .:-]/g, '_');
  const key = keyForPasuk(safe);
  const cache = env.CACHE;
  if (cache) {
    const hit = await cache.get(key);
    if (hit) {
      try {
        const parsed = JSON.parse(hit) as { he?: string };
        if (parsed.he) return parsed.he;
      } catch { /* fall through to live fetch */ }
    }
  }
  try {
    const res = await sefariaAPI.getText(ref, { context: 0 });
    const heRaw = Array.isArray(res.he) ? res.he.join(' ') : (res.he ?? '');
    const enRaw = Array.isArray(res.text) ? res.text.join(' ') : (res.text ?? '');
    const he = cleanVerseText(heRaw);
    const en = cleanVerseText(enRaw);
    if (cache && he) {
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
      const cached = { ref: canonical, heRef: res.heRef ?? null, he, en, prevRef, nextRef, book: res.book ?? null };
      await cache.put(key, JSON.stringify(cached), { expirationTtl: 60 * 60 * 24 * 365 });
    }
    return he;
  } catch {
    return '';
  }
}

// Minimal support utilities used by the kept routes (daf-context, region,
// mesorah, and the offline rabbi data-build pipeline). The legacy
// enrichment routes that originally introduced these have been removed.
// These are intentionally compact — they're support glue, not architecture.

interface StreamedResult {
  content: string;
  reasoning_content: string;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number } | null;
  finish_reason: string | null;
  prompt_chars: number;
  content_chars: number;
  reasoning_chars: number;
  elapsed_ms: number;
}

function extractJsonPayload(resp: unknown): string {
  if (typeof resp === 'string') return resp;
  if (!resp || typeof resp !== 'object') return '';
  const r = resp as Record<string, unknown>;
  if (typeof r.response === 'string') return r.response;
  if (typeof r.content === 'string') return r.content;
  if (typeof r.text === 'string') return r.text;
  return '';
}

interface KimiMessage { role: 'system' | 'user' | 'assistant'; content: string }

async function runKimiStreaming(
  env: Bindings,
  modelId: string,
  messages: KimiMessage[],
  maxTokens: number,
  opts?: { temperature?: number; chatTemplateKwargs?: { enable_thinking?: boolean }; responseFormat?: unknown },
): Promise<StreamedResult> {
  const t0 = Date.now();
  const promptChars = messages.reduce((s, m) => s + m.content.length, 0);
  const enableThinking = opts?.chatTemplateKwargs?.enable_thinking;
  const r = await runLLM(env, {
    model: modelId as LLMModelId,
    messages,
    max_tokens: maxTokens,
    temperature: opts?.temperature ?? 0.1,
    thinking: typeof enableThinking === 'boolean' ? enableThinking : undefined,
    response_format: opts?.responseFormat as { type: 'json_schema'; json_schema: unknown } | undefined,
    stream: true,
  });
  return {
    content: r.content,
    reasoning_content: r.reasoning_content ?? '',
    usage: r.usage as StreamedResult['usage'],
    finish_reason: r.finish_reason ?? null,
    prompt_chars: promptChars,
    content_chars: r.content.length,
    reasoning_chars: (r.reasoning_content ?? '').length,
    elapsed_ms: Date.now() - t0,
  };
}

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

interface PesukimStoryShape {
  verseRef?: string;
  citationStyle?: string;
  excerpt?: string;
  summary?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  tanachContext?: unknown;
  peshat?: unknown;
  gemaraUsage?: unknown;
  exegesis?: unknown;
  synthesize?: unknown;
}

function rishonimBlock(bundle: RishonimBundle, perCommentatorCap = 2500): string {
  const entries = Object.entries(bundle);
  if (entries.length === 0) return '';
  const sliceStr = (s: string | undefined | null, cap: number) => {
    if (!s) return '';
    const cleaned = stripHtmlServer(s);
    return cleaned.length > cap ? cleaned.slice(0, cap) : cleaned;
  };
  const parts = entries.map(([label, snip]) => {
    const he = sliceStr(snip.hebrew, perCommentatorCap);
    const en = sliceStr(snip.english, perCommentatorCap);
    const body = [
      he && `<hebrew>${he}</hebrew>`,
      en && `<english>${en}</english>`,
    ].filter(Boolean).join('\n');
    return `<commentator name="${label}" ref="${snip.ref}">\n${body}\n</commentator>`;
  });
  return `<rishonim_commentary>\n${parts.join('\n')}\n</rishonim_commentary>`;
}

const STRATEGY_NAMES = [
  'rabbis', 'references', 'parallels', 'commentaries',
  'bigger-picture', 'background', 'synthesize',
] as const;

const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/health', (c) => c.json({ ok: true }));

/**
 * Code-mode MCP server (Streamable HTTP) at /mcp. Exposes two tools — `search`
 * and `execute` — built from the curated OpenAPI spec (mcp-openapi.ts). The
 * `execute` tool runs LLM-written code in an isolated sandbox (env.LOADER) whose
 * only outside access is the `request` bridge below, which re-enters our own
 * Hono app in-process for any /api/* path. The endpoint is public and gets the
 * untrusted safe subset; a trusted operator can forward an `x-studio-secret`
 * header on their MCP client to unlock the privileged /api/run knobs.
 */
app.all('/mcp', async (c) => {
  if (!c.env.LOADER) {
    return c.json({ error: 'MCP unavailable: worker_loaders LOADER binding not configured' }, 503);
  }
  // Loaded lazily: @cloudflare/codemode imports `cloudflare:workers` (RpcTarget),
  // which only resolves inside workerd. A static import would break the node
  // unit tests that import this module (tests/*.test.ts -> src/worker/index).
  const [{ StreamableHTTPTransport }, { buildCodeModeMcpServer }] = await Promise.all([
    import('@hono/mcp'),
    import('./mcp'),
  ]);
  const studioSecret = c.req.header('x-studio-secret');
  const server = buildCodeModeMcpServer({
    loader: c.env.LOADER,
    request: async ({ method, path, query, body }) => {
      if (typeof path !== 'string' || !path.startsWith('/api/')) {
        return { error: 'request bridge only proxies /api/* paths' };
      }
      const u = new URL(path, 'http://internal');
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined) u.searchParams.set(k, String(v));
        }
      }
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (studioSecret) headers['x-studio-secret'] = studioSecret;
      try {
        const res = await app.request(
          u.pathname + u.search,
          { method, headers, body: body == null || method === 'GET' ? undefined : JSON.stringify(body) },
          c.env,
        );
        const text = await res.text();
        try { return JSON.parse(text); } catch { return text; }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  const res = await transport.handleRequest(c);
  return res ?? c.body(null, 204);
});

// AI Gateway smoke test. Reports gateway config + routes a tiny Kimi prompt
// through whichever path is active (gateway when configured, else binding).
// Append ?run=1 to actually invoke; bare GET just shows status. env.AI here
// is already the proxied version when the gateway is active, so this hits
// the same code path as every other AI call in the worker.
app.get('/api/admin/ai-gateway-test', async (c) => {
  const status = gatewayStatus(c.env);
  if (c.req.query('run') !== '1') return c.json({ status, hint: 'append ?run=1 to invoke' });
  const explicitModel = c.req.query('model');
  const nonce = c.req.query('nonce') || '';
  try {
    const result = await runLLM(c.env, {
      // omit model when no override → runLLM resolves from settings KV.
      ...(explicitModel ? { model: explicitModel as LLMModelId } : {}),
      messages: [
        { role: 'system', content: 'Reply with the single word OK and nothing else.' },
        { role: 'user', content: `Ping${nonce ? ' ' + nonce : ''}.` },
      ],
      max_tokens: 16,
      temperature: 0,
    });
    return c.json({
      status,
      route: gatewayActive(c.env) ? 'gateway' : 'binding',
      transport: result.transport,
      model: result.model,
      attempts: result.attempts,
      ms: result.elapsed_ms,
      usage: result.usage,
      reply: result.content,
    });
  } catch (err) {
    return c.json(
      {
        status,
        route: gatewayActive(c.env) ? 'gateway' : 'binding',
        explicitModel: explicitModel ?? null,
        error: String((err as Error)?.message ?? err),
      },
      500,
    );
  }
});

/**
 * LLM model config — READ-ONLY. There is no runtime settings store anymore;
 * the default model + fallback are code constants (settings.ts) optionally
 * overridden per-deploy by the DEFAULT_LLM_MODEL env var, and each
 * mark/enrichment pins its own model. This endpoint just surfaces the
 * effective config (for display) + the preset catalog (for the probe tool).
 */
app.get('/api/admin/llm-settings', (c) => {
  const fromEnv = c.env.DEFAULT_LLM_MODEL;
  const defaultModel = isLLMModelId(fromEnv) ? fromEnv : DEFAULT_MODEL;
  return c.json({
    settings: {
      defaultModel,
      fallbackChain: DEFAULT_FALLBACK_CHAIN,
      source: isLLMModelId(fromEnv) ? 'env (wrangler.toml DEFAULT_LLM_MODEL)' : 'code (settings.ts)',
      editable: false,
    },
    presets: MODEL_PRESETS,
  });
});

/**
 * Studio: KV-backed mark + enrichment registries. Definitions live under
 *   mark-defs:v1:{id}        — what to extract from a daf
 *   enrichment-defs:v1:{id}  — what to derive from a mark
 *
 * Ad-hoc runs (no save) hit /api/run with an inline definition. Saved
 * runs reference an id and get cached. The same registry powers Home (all
 * registered enrichments shown as toggles, off by default) and Studio
 * (per-enrichment editor + preview).
 */
app.get('/api/marks', async (c) => {
  // Merge KV-stored marks with code-defined seeds. KV wins on id collision
  // (a saved KV definition overrides a built-in with the same id).
  const kv = await listMarks(c.env);
  const kvIds = new Set(kv.map((m) => m.id));
  const merged = [
    ...CODE_MARKS.filter((m) => !kvIds.has(m.id)),
    ...kv,
  ];
  return c.json({ marks: merged });
});
app.get('/api/marks/:id', async (c) => {
  const id = c.req.param('id');
  const kv = await readMark(c.env, id);
  if (kv) return c.json({ mark: kv });
  const code = findCodeMark(id);
  if (code) return c.json({ mark: code });
  return c.json({ error: 'not found' }, 404);
});
app.put('/api/marks/:id', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
  const v = validateMark({ ...(body as object), id: c.req.param('id') });
  if (!v.ok) return c.json({ error: v.error }, 400);
  const saved = await writeMark(c.env, v.spec);
  return c.json({ mark: saved });
});
app.delete('/api/marks/:id', async (c) => {
  await deleteMark(c.env, c.req.param('id'));
  return c.json({ ok: true });
});

// Observation surface for the post-LLM check layer. Re-runs each daf-level
// mark's declared checks against its ALREADY-CACHED (anchored) output — no LLM
// call, no cache write — so the dev panel can show which soft/observe-only
// checks (anchor-verbatim, partition-clean, …) are firing on real content
// before any of them is promoted to a hard, cache-gating check. Marks only:
// they have one cache entry per daf; instance-scoped enrichment checks
// (edge-integrity, rabbi-evidence) aren't enumerable without their instances.
app.get('/api/checks/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const lang: 'en' | 'he' = c.req.query('lang') === 'he' ? 'he' : 'en';
  const marks = CODE_MARKS.filter((m) => (m.passes?.length ?? 0) > 0);
  if (marks.length === 0) return c.json({ tractate, page, results: [], total_issues: 0 });

  const slice = await getGemaraSlice(c.env, tractate, page, false);
  const results: { mark_id: string; cached: boolean; issues: unknown[] }[] = [];
  let total = 0;
  for (const def of marks) {
    const hit = await readCachedResult(c.env, keyForMark(def, tractate, page, lang));
    if (!hit || hit.parsed == null) { results.push({ mark_id: def.id, cached: false, issues: [] }); continue; }
    // Clone so the idempotent transform re-runs don't mutate the cached object.
    const { issues } = await runPasses(def.passes ?? [], structuredClone(hit.parsed), {
      tractate, page, segmentsHe: slice.segments_he, defId: def.id, lang,
    });
    total += issues.length;
    results.push({ mark_id: def.id, cached: true, issues });
  }
  return c.json({ tractate, page, total_issues: total, results });
});

// --- Section typing (P1/P2): deterministic TypeProfile composition ----------
// Read-only over CACHED marks (no LLM, no cache write). For each argument
// section on the daf, intersect the content overlays (halacha/aggadata/pesukim)
// + the dialectical base (argument-move) and emit a TypeProfile: which layers
// claim the section, the dominant `primary` content dimension (pure-dialectic
// when no overlay materially covers it), `register` (mishnah/gemara — the
// textual axis orthogonal to primary, from the cached mishnah-in-talmud ranges),
// and `isDispute` (the section's cached argument.voices graph has an `opposes`
// edge AND the section has a named move-speaker — see `hasNamedSpeaker`, the
// anti-hallucination guard). This is the
// observation/validation surface for
// section typing — it shows, on real content, that e.g. the Ashmedai story is
// narrative-primary (not a voice dispute). Gating + new enrichments build on it.
type RawInstance = { startSegIdx?: unknown; endSegIdx?: unknown; fields?: Record<string, unknown> };
async function readMarkInstances(env: Bindings, markId: string, tractate: string, page: string): Promise<RawInstance[]> {
  const def = findCodeMark(markId);
  if (!def) return [];
  const hit = await readCachedResult(env, keyForMark(def, tractate, page, 'en'));
  const parsed = hit?.parsed as { instances?: unknown } | null;
  return Array.isArray(parsed?.instances) ? (parsed!.instances as RawInstance[]) : [];
}
function toLayerInstances(layer: LayerId, insts: RawInstance[]): LayerInstance[] {
  const out: LayerInstance[] = [];
  insts.forEach((i, idx) => {
    if (typeof i.startSegIdx !== 'number' || typeof i.endSegIdx !== 'number') return;
    const f = i.fields ?? {};
    const id = (typeof f.title === 'string' && f.title) || (typeof f.topic === 'string' && f.topic)
      || (typeof f.theme === 'string' && f.theme) || (typeof f.excerpt === 'string' && f.excerpt) || String(idx);
    out.push({ layer, instanceId: id, startSegIdx: i.startSegIdx, endSegIdx: i.endSegIdx });
  });
  return out;
}
async function buildDafTypeProfiles(env: Bindings, tractate: string, page: string): Promise<(TypeProfile & { title?: string })[]> {
  const sections = await readMarkInstances(env, 'argument', tractate, page);
  const moves = await readMarkInstances(env, 'argument-move', tractate, page);
  const overlays: LayerInstance[] = [
    ...toLayerInstances('aggadata', await readMarkInstances(env, 'aggadata', tractate, page)),
    ...toLayerInstances('halacha', await readMarkInstances(env, 'halacha', tractate, page)),
    ...toLayerInstances('pesukim', await readMarkInstances(env, 'pesukim', tractate, page)),
    ...toLayerInstances('argument-move', moves),
  ];
  // Deterministic register axis: which segments are mishnah-in-talmud (cached
  // Sefaria /api/related anchors). A section whose majority falls here is
  // `register: mishnah`, else `gemara`.
  const mishnaBundle = await getMishnaBundleCached(env.CACHE, tractate, page);
  const mishnaSegs = new Set<number>();
  for (const m of mishnaBundle) for (let s = m.anchorStartSeg; s <= m.anchorEndSeg; s++) mishnaSegs.add(s);
  const voicesDef = findCodeEnrichment('argument.voices');
  const profiles: (TypeProfile & { title?: string })[] = [];
  for (const sec of sections) {
    if (typeof sec.startSegIdx !== 'number' || typeof sec.endSegIdx !== 'number') continue;
    const unit: UnitRange = { tractate, page, startSegIdx: sec.startSegIdx, endSegIdx: sec.endSegIdx };
    let voices: { edges?: { kind?: string }[] } | null = null;
    if (voicesDef) {
      const iid = await instanceIdOf(sec);
      const vhit = await readCachedResult(env, keyForEnrichment(voicesDef, iid, { tractate, page }));
      voices = (vhit?.parsed as { edges?: { kind?: string }[] }) ?? null;
    }
    // When the move mark isn't cached yet (`moves` empty), we can't tell named
    // from anonymous — pass `undefined` so composeTypeProfile stays permissive
    // (unknown → not suppressed) rather than mislabel a cold daf's real dispute
    // as anonymous. Only with moves actually loaded does an empty section mean
    // "no named speaker".
    const hasNamedSpeaker = moves.length > 0 ? sectionHasNamedSpeaker(moves, sec.startSegIdx, sec.endSegIdx) : undefined;
    profiles.push({ ...composeTypeProfile(unit, overlays, { voices, mishnaSegs, hasNamedSpeaker }), title: typeof sec.fields?.title === 'string' ? sec.fields.title : undefined });
  }
  return profiles;
}
app.get('/api/type-profiles/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const profiles = await buildDafTypeProfiles(c.env, tractate, page);
  // Structural markers (Hadran / perek boundaries) — deterministic from the
  // gemara text, so a daf straddling two perakim renders a divider + downstream
  // summaries can split rather than conflate.
  const slice = await getGemaraSlice(c.env, tractate, page, false);
  const markers = findMarkers(slice.segments_he);
  return c.json({ tractate, page, count: profiles.length, profiles, markers });
});

// Cross-daf bridge (sugya map): does this daf's closing discussion continue into
// the next amud? Deterministic Hadran short-circuit (perek boundary → no), else
// a cheap Flash judgement over the two boundary sections. Cached by daf.
async function computeDafBridge(env: Bindings, tractate: string, page: string): Promise<DafBridge> {
  const from = { tractate, page };
  const nextPage = adjacentAmud(tractate, page, 1);
  if (!nextPage) return edgeOfTractateBridge(from);
  const to = { tractate, page: nextPage };
  const cache = env.CACHE;
  const key = keyForBridge(tractate, page);
  if (cache) { const c = await cache.get(key); if (c) { try { return JSON.parse(c) as DafBridge; } catch { /* recompute */ } } }

  // Deterministic: a Hadran in the daf's final segment(s) closes the perek.
  const slice = await getGemaraSlice(env, tractate, page, false);
  const hadran = findHadranSegments(slice.segments_he);
  const endsWithHadran = hadran.length > 0 && hadran[hadran.length - 1] >= slice.segments_he.length - 2;
  let bridge = hadranBridge(from, to, endsWithHadran);

  if (!bridge) {
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const numSeg = (i: RawInstance) => (typeof i.startSegIdx === 'number' ? i.startSegIdx : -1);
    const prev = (await readMarkInstances(env, 'argument', tractate, page)).filter((i) => numSeg(i) >= 0);
    const next = (await readMarkInstances(env, 'argument', tractate, nextPage)).filter((i) => numSeg(i) >= 0);
    const prevLast = prev.length ? prev.reduce((a, b) => (numSeg(b) > numSeg(a) ? b : a)) : null;
    const nextFirst = next.length ? next.reduce((a, b) => (numSeg(b) < numSeg(a) ? b : a)) : null;
    if (!prevLast || !nextFirst) {
      bridge = { from, to, continues: false, kind: 'new-topic', via: 'no-data', note: 'argument sections not warmed for both dapim' };
    } else {
      const prevSec: BridgeSection = { title: str(prevLast.fields?.title), summary: str(prevLast.fields?.summary), excerpt: str(prevLast.fields?.endExcerpt) || str(prevLast.fields?.excerpt) };
      const nextSec: BridgeSection = { title: str(nextFirst.fields?.title), summary: str(nextFirst.fields?.summary), excerpt: str(nextFirst.fields?.excerpt) };
      try {
        const res = await runLLM(env, {
          model: 'openrouter/deepseek/deepseek-v4-flash' as LLMModelId,
          messages: [
            { role: 'system', content: 'You are a Talmud scholar judging whether a sugya continues across a daf boundary.' },
            { role: 'user', content: buildBridgePrompt(prevSec, nextSec) },
          ],
          max_tokens: 1500, temperature: 0.2,
          response_format: { type: 'json_schema', json_schema: ARGUMENT_BRIDGE_OUTPUT_SCHEMA },
          thinking: false, tag: 'argument-overview.bridge',
        });
        let verdict: { continues?: unknown; note?: unknown } = {};
        try { verdict = JSON.parse(res.content); } catch { /* fall through */ }
        bridge = llmBridge(from, to, verdict);
      } catch {
        bridge = { from, to, continues: false, kind: 'new-topic', via: 'no-data', note: 'bridge LLM unavailable' };
      }
    }
  }
  // Don't pin a no-data verdict — it should retry once the dafim are warmed / budget frees.
  if (cache && bridge.via !== 'no-data') await cache.put(key, JSON.stringify(bridge));
  return bridge;
}
app.get('/api/bridge/:tractate/:page', async (c) => {
  const bridge = await computeDafBridge(c.env, c.req.param('tractate'), c.req.param('page'));
  // Surface the continuity as a first-class Link (relation 'continues') when the
  // sugya carries into the next daf — additive, so existing readers of the
  // boolean `continues` are unaffected, and a continuous-spine view can stitch
  // dapim from `link.targets` instead of re-deriving the next daf itself.
  // Computed (not stored on the cached DafBridge), so it needs no cache bump.
  const link = bridge.continues ? continuationLink(bridge.to) : null;
  return c.json({ ...bridge, link });
});

// The tractate-spine neighborhood of a daf (framework step 6): the adjacent
// windows + whether the sugya flows across each boundary, assembled from the
// two cached cross-daf bridges (this→next and prev→this). One read replaces the
// client overview's bespoke pair of /api/bridge fetches; `dafSpine` keeps the
// forward continuity in the shared Link vocabulary. Best-effort per bridge: a
// cold/failed compute reads as "no continuation" rather than failing.
app.get('/api/spine/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const prev = adjacentAmud(tractate, page, -1);
  const next = adjacentAmud(tractate, page, 1);
  // Both bridges in parallel (this→next and prev→this), each best-effort.
  const [thisBridge, prevBridge] = await Promise.all([
    computeDafBridge(c.env, tractate, page).catch(() => null),
    prev ? computeDafBridge(c.env, tractate, prev).catch(() => null) : Promise.resolve(null),
  ]);
  return c.json(
    dafSpine(
      { tractate, page },
      { prev, next, fromPrev: !!prevBridge?.continues, toNext: !!thisBridge?.continues },
    ),
  );
});

// Read the cached argument-overview.flow connections (section-index edges).
// Empty when the daf hasn't been warmed — best-effort, never throws.
async function readFlowConnections(env: Bindings, tractate: string, page: string): Promise<FlowEdge[]> {
  try {
    const def = await loadEnrichmentDef(env, 'argument-overview.flow');
    if (!def) return [];
    const iid = await instanceIdOf({ fields: {} });
    const hit = await readCachedResult(env, keyForEnrichment(def, iid, { tractate, page }));
    const conns = (hit?.parsed as { connections?: unknown } | null)?.connections;
    if (!Array.isArray(conns)) return [];
    return (conns as Array<Record<string, unknown>>)
      .filter((c) => typeof c.from === 'number' && typeof c.to === 'number' && typeof c.kind === 'string')
      .map((c) => ({ from: c.from as number, to: c.to as number, kind: c.kind as string }));
  } catch { return []; }
}

// The unified link layer for a daf: tractate-continuity (bridge), citations
// (context refs), and the argument flow graph, all in one Link vocabulary. The
// first real CONSUMER of src/lib/context/link.ts — assembled by the pure
// `dafLinks`. Best-effort per source: a cold/failed source contributes nothing
// rather than failing the whole response.
// Halacha "where it comes from": the gemara sources a codified ruling derives
// from. Deterministic — reverse Sefaria /api/related on the code ref, classified
// + deduped by buildDerivation, with the current daf marked. Read-only, no LLM.
// Accepts one or more `ref` query params (the codifier refs the card already
// holds), merges their sources.
app.get('/api/derivation/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const refs = c.req.queries('ref') ?? [];
  if (refs.length === 0) return c.json({ sources: [] });
  const linkLists = await Promise.all(refs.map((r) => getCodeSourcesCached(c.env.CACHE, r)));
  const sources = buildDerivation(linkLists.flat(), { tractate, page });
  return c.json({ sources });
});

app.get('/api/links/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const daf = { tractate, page };

  // Argument sections, read once: their ranges place Revach refs (so 'cites'
  // links get a real segment source, not whole-daf), and their startSegIdx (in
  // reading order) resolves a flow edge's section index to a coordinate.
  const sectionInstances = await readMarkInstances(c.env, 'argument', tractate, page).catch(() => []);
  const sections = sectionInstances
    .filter((i) => typeof i.startSegIdx === 'number' && typeof i.endSegIdx === 'number')
    .map((i) => ({
      startSegIdx: i.startSegIdx as number,
      endSegIdx: i.endSegIdx as number,
      title: typeof i.fields?.title === 'string' ? i.fields.title : undefined,
      summary: typeof i.fields?.summary === 'string' ? i.fields.summary : undefined,
    }));
  const sectionStartSegs = sections.map((s) => s.startSegIdx).sort((a, b) => a - b);

  const bridge = await computeDafBridge(c.env, tractate, page).catch(() => null);
  const items = await collectContext(c.env, tractate, page, { sections }).catch(() => []);
  const flowEdges = await readFlowConnections(c.env, tractate, page);
  // Commentary spines: best-effort (cached 30d). A cold/failed fetch contributes
  // nothing rather than failing the response — same contract as the others.
  const commentary = await fetchCommentaryWorks(c.env, tractate, page).catch(() => null);
  const commentaryWorks = commentary && !('error' in commentary) ? commentary.works : [];

  const links = dafLinks(daf, {
    continuesTo: bridge?.continues ? bridge.to : null,
    items,
    flowEdges,
    sectionStartSegs,
    commentaryWorks,
  });
  return c.json({ tractate, page, count: links.length, links });
});

// Reverse-dependency index over the producer graph: "if `id` (a producer or a
// source input like 'gemara') changes, what must re-warm?" Computes the cascade
// that is otherwise reasoned about by hand when bumping a cache_version — e.g.
// bumping argument.background returns argument.synthesis (which depends on it)
// and everything downstream. Read-only over the static registry; no daf, no KV.
app.get('/api/dependents/:id', (c) => {
  const id = c.req.param('id');
  const nodes = producerNodesFrom([...CODE_MARKS, ...CODE_ENRICHMENTS]);
  const rev = reverseDependencyIndex(nodes);
  const direct = [...(rev.get(id) ?? [])].sort();
  const transitive = [...transitiveDependents(rev, id)].sort();
  return c.json({ id, direct, transitive, count: transitive.length });
});

// Entity pieces (step 5): a first-class, addressable view of a "global" entity
// (rabbi / place), assembled READ-ONLY from its already-cached global
// enrichments. The pieces are keyed per-entity (daf-agnostic), so they're
// reachable here without a daf. Never triggers an LLM run — a piece is null
// until something warmed it. See src/lib/registry/entity.ts.
// Reads a cached GLOBAL enrichment by the SAME key the warm path writes:
// loadEnrichmentDef (code-fallback, not KV-only) + instanceIdOf(markInput)
// (which slug-ifies the name, e.g. 'Abaye' → 'abaye') + the daf-less global key.
// Pass the same markInput shape the card/warmer uses so the instance_id matches.
async function readGlobalPiece(env: Bindings, enrichmentId: string, markInput: unknown): Promise<unknown> {
  const def = await loadEnrichmentDef(env, enrichmentId);
  if (!def) return null;
  const instanceId = await instanceIdOf(markInput);
  const hit = await readCachedResult(env, keyForEnrichment(def, instanceId));
  return hit?.parsed ?? null;
}

app.get('/api/entity/rabbi/:slug', async (c) => {
  const slug = c.req.param('slug');
  const entry = RABBI_PLACES.rabbis[slug];
  if (!entry) return c.json({ error: 'not found' }, 404);
  const name = entry.canonical;
  const nameHe = entry.canonicalHe ?? '';
  // identity is the deterministic rabbi-places lookup (always available); the
  // others are the same global enrichments the card reads — keyed by the rabbi
  // instance the card passes (flat {name,...}), so instanceIdOf matches.
  const identity = enrichRabbi(name, nameHe, (entry.generation as GenerationId | undefined) ?? 'unknown');
  const markInput = { name, nameHe };
  const [relationships, geography] = await Promise.all([
    readGlobalPiece(c.env, 'rabbi.relationships', markInput),
    readGlobalPiece(c.env, 'rabbi.geography', markInput),
  ]);
  const piece: EntityPiece = {
    type: 'rabbi', id: slug, name, nameHe: nameHe || undefined,
    pieces: { identity, relationships, geography },
  };
  return c.json(piece);
});

app.get('/api/entity/place/:name', async (c) => {
  const name = c.req.param('name');
  // The place mark instance is {fields:{name,...}} → instanceIdOf slug-ifies it.
  const markInput = { fields: { name } };
  const [profile, significance, figures] = await Promise.all([
    readGlobalPiece(c.env, 'places.profile', markInput),
    readGlobalPiece(c.env, 'places.significance', markInput),
    readGlobalPiece(c.env, 'places.figures', markInput),
  ]);
  if (!profile && !significance && !figures) return c.json({ error: 'not found (no cached pieces)' }, 404);
  const piece: EntityPiece = {
    type: 'place', id: name, name,
    pieces: { profile, significance, figures },
  };
  return c.json(piece);
});

// Content-hash staleness probe: does the cached output of a WHOLE-DAF enrichment
// still match its producer's current recipe? Compares the stored `recipe_hash`
// (stamped at generation) against recipeHash(currentDef). status:
//   fresh   — recipe unchanged since this was generated
//   stale   — the prompt/schema/model changed but cache_version wasn't bumped
//   unknown — cached before recipe_hash existed (re-warm to resolve)
//   miss    — nothing cached for this daf yet
// Read-only; the per-section enrichments need their instance, so this covers the
// whole-daf instance ({fields:{}}) — the overview/synthesis/background-pill cases.
app.get('/api/stale/:id/:tractate/:page', async (c) => {
  const id = c.req.param('id');
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const lang = c.req.query('lang') === 'he' ? 'he' : 'en';
  const def = await loadEnrichmentDef(c.env, id);
  if (!def) return c.json({ error: 'unknown enrichment' }, 404);
  // recipeHash is lang-agnostic (it spans both prompt sets), so comparing an EN
  // and a HE entry against the same current hash is valid; we just need the
  // right per-lang KEY to read the entry.
  const current = await recipeHash(enrichmentRecipe(def));
  const iid = await instanceIdOf({ fields: {} });
  const key = keyForEnrichment(def, iid, def.scope === 'local' ? { tractate, page } : undefined, undefined, lang);
  const hit = (await readCachedResult(c.env, key)) as RunResultEnrichment | null;
  const cached = hit?.recipe_hash ?? null;
  const status = !hit ? 'miss' : !cached ? 'unknown' : cached === current ? 'fresh' : 'stale';
  return c.json({ id, tractate, page, lang, status, cached_recipe: cached, current_recipe: current });
});

// Close the freshness loop: re-warm a changed producer + its full transitive
// dependents (the reverse-dependency cascade) on one daf. Enqueues a single
// warm-deep job restricted to the cascade; the consumer EVICTS the whole
// cascade's entries (evictCascadeEntries — not bypass_cache, so unchanged
// dependencies still cache-hit instead of re-paying) then regenerates the
// deep-warm surface (synthesis / suggested-questions / overview / narrative) via
// deepWarmDaf. Non-surface cascade members are evicted too, so nothing stale is
// served — they regenerate via a surface member's dependency resolution or on
// their next read. Trusted + budget-gated. Intended flow: edit a prompt →
// `/api/stale` shows `stale` → call this → the cascade regenerates.
app.post('/api/admin/rewarm/:id/:tractate/:page', async (c) => {
  if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
  if (!c.env.ENRICHMENT_QUEUE) return c.json({ error: 'ENRICHMENT_QUEUE binding not available' }, 503);
  const gate = await checkBudget(c.env, { custom: false });
  if (!gate.ok) {
    return c.json({
      status: 'error', error: pauseErrorMessage(gate.scope),
      paused: true, scope: gate.scope, retryAfter: pauseRetryAfterSec(gate.until),
    }, 429);
  }
  const id = c.req.param('id');
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const lang: 'en' | 'he' = c.req.query('lang') === 'he' ? 'he' : 'en';
  const rev = reverseDependencyIndex(producerNodesFrom([...CODE_MARKS, ...CODE_ENRICHMENTS]));
  const cascade = [id, ...transitiveDependents(rev, id)];
  const runId = `rewarm:${id}:${tractate}:${page}:${lang}:${Math.floor(Date.now() / 1000)}`
    .replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 200);
  await c.env.ENRICHMENT_QUEUE.send({
    runId, warm_deep: true, rewarm_only: cascade, tractate, page, ...(lang === 'he' ? { lang } : {}),
  });
  return c.json({ status: 'pending', runId, id, tractate, page, lang, cascade });
});

app.get('/api/enrichments', async (c) => {
  // Merge KV + code-defined. KV wins on collision. Code-defined entries are
  // normalized to the KV-flat shape (extractor flattened, `mark` instead of
  // `target_mark`) so the client gets one consistent shape.
  const kv = await listEnrichments(c.env);
  const kvIds = new Set(kv.map((e) => e.id));
  const codeFlat: Array<EnrichmentDefinition & { mode?: string }> = CODE_ENRICHMENTS
    .filter((e) => !kvIds.has(e.id))
    .filter((e) => e.extractor.kind === 'llm')
    .map((e) => ({
      id: e.id,
      label: e.label,
      description: e.description,
      mark: e.target_mark,
      mode: e.mode,
      scope: e.scope,
      dependencies: e.dependencies,
      system_prompt: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).system_prompt,
      user_prompt_template: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).user_prompt_template,
      model: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).model,
      output_schema: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).output_schema,
      thinking_off: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).thinking_off,
      reasoning_effort: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).reasoning_effort,
      cache_version: e.cache_version,
      source: 'code',
      updated_at: e.updated_at,
    }));
  return c.json({ enrichments: [...codeFlat, ...kv] });
});
app.get('/api/enrichments/:id', async (c) => {
  const id = c.req.param('id');
  const kv = await readEnrichment(c.env, id);
  if (kv) return c.json({ enrichment: kv });
  const code = findCodeEnrichment(id);
  if (code) return c.json({ enrichment: code });
  return c.json({ error: 'not found' }, 404);
});
app.put('/api/enrichments/:id', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
  const v = validateEnrichment({ ...(body as object), id: c.req.param('id') });
  if (!v.ok) return c.json({ error: v.error }, 400);
  const saved = await writeEnrichment(c.env, v.spec);
  return c.json({ enrichment: saved });
});
app.delete('/api/enrichments/:id', async (c) => {
  await deleteEnrichment(c.env, c.req.param('id'));
  return c.json({ ok: true });
});

// ===========================================================================
// Source slices — each is a small, independently cached view of the daf.
// Marks/enrichments declare which slices they need via `dependencies`; the
// runner only fetches what's actually referenced. Slice cache keys live in
// cache-keys.ts (no hand-built keys here).
// ===========================================================================

interface GemaraSlice {
  tractate: string;
  page: string;
  hebrew: string;
  english: string;
  segments_he: string[];
  segments_en: string[];
}

const SLICE_TTL_S = 30 * 24 * 3600;

async function getGemaraSlice(env: Bindings, tractate: string, page: string, bypass: boolean): Promise<GemaraSlice> {
  const cache = env.CACHE;
  const key = keyForGemara(tractate, page);
  if (cache && !bypass) {
    const cached = await cache.get(key);
    if (cached) {
      try { return JSON.parse(cached) as GemaraSlice; } catch { /* fall through */ }
    }
  }
  const [hb, sef, segs] = await Promise.all([
    getHebrewBooksDafCached(cache, tractate, page),
    getSefariaPageCached(cache, tractate, page),
    getSefariaSegmentsCached(cache, tractate, page),
  ]);
  const slice: GemaraSlice = {
    tractate, page,
    hebrew: hb?.main ?? sef?.mainText.hebrew ?? '',
    english: sef?.mainText.english ?? '',
    segments_he: (segs?.he ?? []).map(stripHtmlServer),
    segments_en: (segs?.en ?? []).map(stripHtmlServer),
  };
  if (cache) await cache.put(key, JSON.stringify(slice), { expirationTtl: SLICE_TTL_S });
  return slice;
}

interface CommentariesSlice {
  tractate: string;
  page: string;
  /** Map of commentator name → { hebrew, english, ref }. Empty {} if Sefaria
   *  has nothing on this daf. */
  by_commentator: Record<string, { hebrew: string; english: string; ref: string }>;
}

async function getCommentariesSlice(env: Bindings, tractate: string, page: string, bypass: boolean): Promise<CommentariesSlice> {
  const cache = env.CACHE;
  const key = keyForCommentaries(tractate, page);
  if (cache && !bypass) {
    const cached = await cache.get(key);
    if (cached) {
      try { return JSON.parse(cached) as CommentariesSlice; } catch { /* fall through */ }
    }
  }
  // Rishonim now arrive as per-comment, segment-anchored entries; collapse them
  // back into the per-commentator { hebrew, english, ref } map this slice
  // exposes to enrichment prompts (joining a commentator's comments in order).
  const bundle = await getRishonimCached(cache, tractate, page);
  const by_commentator: Record<string, { hebrew: string; english: string; ref: string }> = {};
  for (const c of bundle ?? []) {
    const ex = by_commentator[c.label];
    if (ex) {
      ex.hebrew = `${ex.hebrew} ${c.hebrew}`.trim();
      ex.english = `${ex.english} ${c.english}`.trim();
    } else {
      by_commentator[c.label] = { hebrew: c.hebrew, english: c.english, ref: c.ref };
    }
  }
  const slice: CommentariesSlice = { tractate, page, by_commentator };
  if (cache) await cache.put(key, JSON.stringify(slice), { expirationTtl: SLICE_TTL_S });
  return slice;
}

function gemaraSliceToVars(s: GemaraSlice): Record<string, unknown> {
  return {
    tractate: s.tractate,
    page: s.page,
    hebrew: s.hebrew,
    english: s.english,
    gemara_he: s.hebrew,
    gemara_en: s.english,
    segments_he: s.segments_he,
    segments_en: s.segments_en,
    gemara: `${s.hebrew}\n\n---\n\n${s.english}`,
  };
}

/**
 * Filter the daf's mishna bundle to those relevant for an enrichment with
 * the given markInput. Rule: include any mishna whose anchor START segment
 * is at-or-before the mark's END segment. This covers the "current" mishna
 * being discussed and any earlier-on-daf mishnayot that the argument may
 * still be elaborating on, while excluding mishnayot the gemara hasn't
 * reached yet. If markInput has no endSegIdx (e.g. daf-level aggregate),
 * include everything.
 */
function selectMishnaForMark(
  bundle: Awaited<ReturnType<typeof getMishnaBundleCached>>,
  markInput: unknown,
): typeof bundle {
  if (!bundle.length) return bundle;
  const m = (markInput && typeof markInput === 'object') ? markInput as Record<string, unknown> : null;
  const endSeg = m && typeof m.endSegIdx === 'number' ? m.endSegIdx
    : m && typeof m.startSegIdx === 'number' ? m.startSegIdx
    : null;
  if (endSeg === null) return bundle;
  return bundle.filter(x => x.anchorStartSeg <= endSeg);
}

function mishnaBundleToString(bundle: Awaited<ReturnType<typeof getMishnaBundleCached>>): string {
  if (!bundle.length) return '(no mishnah anchored to this daf)';
  return bundle.map(m => {
    const range = m.anchorStartSeg === m.anchorEndSeg
      ? `segment ${m.anchorStartSeg}`
      : `segments ${m.anchorStartSeg}-${m.anchorEndSeg}`;
    return `[${m.ref}] (anchors gemara ${range})\nHE: ${m.hebrew}\nEN: ${m.english}`.trim();
  }).join('\n\n---\n\n');
}

function commentariesSliceToString(s: CommentariesSlice): string {
  const names = Object.keys(s.by_commentator).sort();
  return names.map((n) => {
    const row = s.by_commentator[n];
    return `[${n}]\n${row.hebrew}\n${row.english}`.trim();
  }).join('\n\n---\n\n');
}

/** Cap a long passage so the prompt stays bounded — a whole Yerushalmi halacha
 *  can run thousands of words; we only need enough to compare against the daf. */
function truncateForPrompt(s: string, max: number): string {
  const clean = s.trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()} …` : clean;
}

/**
 * Format the grounded Yerushalmi context for the {{yerushalmi}} placeholder:
 * the parallel Jerusalem Talmud passage(s) located via the shared mishnah (real
 * Hebrew + English, HTML stripped, length-capped), then the dafyomi.co.il
 * Yerushalmi study notes for the daf when present. Returns a clear "none"
 * sentinel when the daf has no Yerushalmi parallel (most of Kodashim/Taharot),
 * so the producer knows the absence is real rather than a fetch gap.
 */
function formatYerushalmiForPrompt(
  bundle: Awaited<ReturnType<typeof getYerushalmiCached>>,
  notes: ReturnType<typeof fromDafyomi>,
): string {
  const blocks = bundle.map((y) => {
    const he = truncateForPrompt(stripHtmlServer(y.hebrew), 1400);
    const en = truncateForPrompt(stripHtmlServer(y.english), 1800);
    const range = y.anchorStartSeg === y.anchorEndSeg
      ? `Bavli segment ${y.anchorStartSeg}`
      : `Bavli segments ${y.anchorStartSeg}-${y.anchorEndSeg}`;
    return `[${y.ref}] (parallels ${range}, via ${y.mishnahRef})\nHE: ${he}\nEN: ${en}`.trim();
  });
  const noteLines: string[] = [];
  for (const n of notes) {
    const title = n.title?.en || n.title?.he || '';
    const body = stripHtmlServer(n.body?.en || n.body?.he || '');
    const line = truncateForPrompt([title, body].filter(Boolean).join(' — '), 600);
    if (line) noteLines.push(`- ${line}`);
  }
  // Precision over recall: a real Sefaria-fetched parallel passage is the only
  // thing that grounds a citable ref. The dafyomi notes are supplementary color
  // (they carry no Sefaria ref), so they must NOT, on their own, license a
  // parallel claim — without a fetched passage we report "none" even if notes
  // exist, so the producer can't fabricate a ref from a bare note.
  if (blocks.length === 0) {
    return '(no Yerushalmi parallel found for this daf)';
  }
  const out: string[] = [blocks.join('\n\n---\n\n')];
  if (noteLines.length) out.push(`Dafyomi.co.il Yerushalmi notes (supplementary context):\n${noteLines.join('\n')}`);
  return out.join('\n\n===\n\n');
}

/**
 * Substitute {{placeholders}} in a prompt template with values from `vars`.
 * Missing placeholders render as empty strings (per shared template
 * convention; loud failure is annoying when iterating). Supported:
 *   {{tractate}} {{page}} {{hebrew}} {{english}} {{gemara}} {{commentaries}}
 *   {{segments_he}}    — segments numbered [0], [1], ...
 *   {{segments_en}}    — same shape
 *   {{mark_input}}     — JSON-stringified mark input (for enrichments)
 *   {{depends.<id>}}   — JSON-stringified output of a dependency enrichment
 *   {{anchors.<id>}}   — JSON-stringified instance list of a dependency mark
 */
function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    if (key === 'segments_he' && Array.isArray(vars.segments_he)) {
      return (vars.segments_he as string[]).map((s, i) => `[${i}] ${s}`).join('\n');
    }
    if (key === 'segments_en' && Array.isArray(vars.segments_en)) {
      return (vars.segments_en as string[]).map((s, i) => `[${i}] ${s}`).join('\n');
    }
    if (key.startsWith('depends.')) {
      const id = key.slice('depends.'.length);
      const deps = (vars.depends ?? {}) as Record<string, unknown>;
      const v = deps[id];
      return v === undefined ? '' : (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
    }
    if (key.startsWith('anchors.')) {
      const id = key.slice('anchors.'.length);
      const a = (vars.anchors ?? {}) as Record<string, unknown>;
      const v = a[id];
      return v === undefined ? '' : (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
    }
    const v = vars[key];
    if (v === undefined || v === null) return '';
    return typeof v === 'string' ? v : JSON.stringify(v);
  });
}

// ===========================================================================
// Definition lookup — KV first, then code-defined fallback. Both shapes are
// adapted to the KV-flat shape the runner expects.
// ===========================================================================

function adaptCodeEnrichment(code: SchemaEnrichmentDefinition): EnrichmentDefinition | null {
  // 'computed' enrichments carry no prompts — they're intercepted by a
  // `def.id`-keyed short-circuit in runEnrichmentOnce (like rabbi.identity)
  // and never hit the LLM path. Pass them through with empty prompt fields so
  // the runner can still load + cache them; everything the short-circuit needs
  // (scope, dependencies, cache_version) is preserved below.
  if (code.extractor.kind !== 'llm' && code.extractor.kind !== 'computed') return null;
  const llm = code.extractor.kind === 'llm' ? code.extractor : null;
  return {
    id: code.id,
    label: code.label,
    description: code.description,
    mark: code.target_mark,
    scope: code.scope,
    dependencies: code.dependencies,
    passes: code.passes,
    system_prompt: llm?.system_prompt ?? '',
    user_prompt_template: llm?.user_prompt_template ?? '',
    system_prompt_he: llm?.system_prompt_he,
    user_prompt_template_he: llm?.user_prompt_template_he,
    model: llm?.model,
    output_schema: llm?.output_schema,
    thinking_off: llm?.thinking_off,
    reasoning_effort: llm?.reasoning_effort,
    cache_version: code.cache_version,
    source: 'code',
    updated_at: code.updated_at,
  };
}

async function loadEnrichmentDef(env: Bindings, id: string): Promise<EnrichmentDefinition | null> {
  const kv = await readEnrichment(env, id);
  if (kv) return kv;
  const code = findCodeEnrichment(id);
  return code ? adaptCodeEnrichment(code) : null;
}

async function loadMarkDef(env: Bindings, id: string): Promise<SchemaMarkDefinition | null> {
  const kv = await readMark(env, id);
  if (kv) {
    return {
      id: kv.id,
      label: kv.label,
      description: kv.description,
      anchor: 'phrase',
      render: { kind: 'inline', style: 'underline', color: '#0066CC' },
      extractor: {
        kind: 'llm',
        system_prompt: kv.system_prompt ?? '',
        user_prompt_template: kv.user_prompt_template ?? '',
      },
      dependencies: kv.dependencies,
      status: 'draft',
      def_hash: 'kv',
      cache_version: kv.cache_version,
      source: 'kv',
      updated_at: kv.updated_at,
    };
  }
  return findCodeMark(id);
}

// ===========================================================================
// Dependency resolution — walks `dependencies` and feeds the prompt template.
// Mark deps are run via runMarkOnce (cached by daf); enrichment deps via
// runEnrichmentOnce (cached by instance + scope). Source slices come from the
// helpers above.
// ===========================================================================

interface RunCtx {
  env: Bindings;
  url: string;
  ctx: ExecutionContext;
  /** Output language for enrichment prompts + cache keys. Flows from the
   *  JobMessage through the whole dependency tree so a Hebrew bio's upstream
   *  (relationships, geography, …) are generated in Hebrew too. Marks ignore
   *  it. Defaults to 'en' at every construction site. */
  lang: 'en' | 'he';
}

interface ResolvedInputs {
  /** Template vars to merge into the prompt context. */
  vars: Record<string, unknown>;
  /** Enrichment outputs keyed by dep id (returned to the client as deps_resolved). */
  depends: Record<string, unknown>;
  /** Mark instance lists keyed by dep id (returned as anchors_resolved). */
  anchors: Record<string, unknown>;
}

async function resolveDependencies(
  rc: RunCtx,
  dependencies: ReadonlyArray<EnrichmentDependency> | ReadonlyArray<MarkDependency> | undefined,
  tractate: string,
  page: string,
  markInput: unknown,
  bypassCache: boolean,
  parentChain: ReadonlySet<string>,
): Promise<ResolvedInputs> {
  const out: ResolvedInputs = { vars: {}, depends: {}, anchors: {} };
  if (!dependencies || dependencies.length === 0) {
    // Default behavior: when no dependencies declared, hand the gemara slice
    // through (matches pre-refactor buildDafContext behavior). Removes a
    // foot-gun when porting old extractors that omitted the field.
    const slice = await getGemaraSlice(rc.env, tractate, page, bypassCache);
    Object.assign(out.vars, gemaraSliceToVars(slice));
    return out;
  }
  // Resolve all dependencies CONCURRENTLY. They're independent (each writes a
  // distinct key in out.vars/depends/anchors), and a section synthesis can
  // depend on several LLM enrichments (voices, background) plus sub-marks —
  // serial resolution stacked their latencies. Promise.all overlaps them; the
  // queue consumer's max_concurrency still caps total simultaneous LLM load.
  await Promise.all(dependencies.map(async (dep) => {
    if (dep === 'gemara') {
      const slice = await getGemaraSlice(rc.env, tractate, page, bypassCache);
      Object.assign(out.vars, gemaraSliceToVars(slice));
      return;
    }
    if (dep === 'commentaries') {
      const slice = await getCommentariesSlice(rc.env, tractate, page, bypassCache);
      out.vars.commentaries = commentariesSliceToString(slice);
      return;
    }
    if (dep === 'mishna') {
      const bundle = await getMishnaBundleCached(rc.env.CACHE, tractate, page);
      const filtered = selectMishnaForMark(bundle, markInput);
      out.vars.mishna = mishnaBundleToString(filtered);
      return;
    }
    if (dep === 'halacha-refs') {
      // Grounded codifier refs (Mishneh Torah / Tur / Shulchan Aruch) that
      // Sefaria links to this daf, with their real text — so the codification
      // enrichment SELECTS from real refs instead of recalling citations.
      const bundle = await getHalachaRefsCached(rc.env.CACHE, tractate, page);
      out.vars.halacha_refs = formatGroundedRefsForPrompt(bundle);
      return;
    }
    if (dep === 'yerushalmi-text') {
      // The Jerusalem Talmud parallel(s) on the same mishnah (real text, located
      // via fetchYerushalmiForDaf) plus the dafyomi.co.il Yerushalmi study notes
      // — so a producer contrasts Bavli vs Yerushalmi against the source rather
      // than from memory. Each source that fails contributes nothing.
      const [bundle, daf] = await Promise.all([
        getYerushalmiCached(rc.env.CACHE, tractate, page),
        getDafyomiContentCached(rc.env.CACHE, rc.env.ASSETS, tractate, page, {}).catch(() => null),
      ]);
      const notes = daf ? fromDafyomi(daf).filter((i) => i.source === 'dafyomi:yerushalmi') : [];
      out.vars.yerushalmi = formatYerushalmiForPrompt(bundle, notes);
      return;
    }
    if (dep === 'context') {
      // Aggregated external context (dafyomi Points/Halacha/Charts + Sefaria
      // Rishonim/halacha/topics), SCOPED to the instance's segments: a section
      // enrichment gets the context grounded to its own lines; a whole-daf one
      // (no segment location) gets the full pool. Each source that fails
      // contributes nothing rather than throwing.
      // This amud's argument sections let Revach summaries be placed per-section
      // (English↔English alignment, conservative); a cheap cached read.
      const sections = (await readMarkInstances(rc.env, 'argument', tractate, page))
        .filter((i) => typeof i.startSegIdx === 'number' && typeof i.endSegIdx === 'number')
        .map((i) => ({
          startSegIdx: i.startSegIdx as number,
          endSegIdx: i.endSegIdx as number,
          title: typeof i.fields?.title === 'string' ? i.fields.title : undefined,
          summary: typeof i.fields?.summary === 'string' ? i.fields.summary : undefined,
        }));
      const items = await collectContext(rc.env, tractate, page, { sections });
      // Back up the deterministic Revach placer with the cached AI matcher for
      // any entries it left whole-daf (once per daf; LLM-free on cache hit).
      await placeRevachWithAi(rc.env, tractate, page, items);
      const scoped = contextForAnchor(items, segsFromMarkInput(markInput));
      out.vars.context = formatContextForPrompt(scoped);
      return;
    }
    if (typeof dep === 'object' && dep !== null) {
      if ('enrichment' in dep) {
        const depId = dep.enrichment;
        if (parentChain.has(depId)) {
          out.depends[depId] = { error: `cycle detected (${[...parentChain].join(' → ')} → ${depId})` };
          return;
        }
        const depDef = await loadEnrichmentDef(rc.env, depId);
        if (!depDef) {
          out.depends[depId] = { error: 'not found' };
          return;
        }
        try {
          const result = await runEnrichmentOnce(rc, depDef, tractate, page, markInput, bypassCache, undefined, parentChain);
          out.depends[depId] = result.parsed ?? result.content;
        } catch (err) {
          out.depends[depId] = { error: String((err as Error)?.message ?? err) };
        }
        return;
      }
      if ('mark' in dep) {
        const markId = dep.mark;
        const markDef = await loadMarkDef(rc.env, markId);
        if (!markDef) {
          out.anchors[markId] = { error: 'not found' };
          return;
        }
        try {
          const result = await runMarkOnce(rc, markDef, tractate, page, bypassCache);
          // Surface only the parsed instances list — extractors all emit
          // `{ instances: [...] }`. If the parse failed, expose the raw text.
          const parsed = result.parsed as { instances?: unknown } | null;
          out.anchors[markId] = parsed?.instances ?? result.content;
        } catch (err) {
          out.anchors[markId] = { error: String((err as Error)?.message ?? err) };
        }
        return;
      }
    }
  }));
  return out;
}

// ===========================================================================
// Run helpers — one per kind, both KV-cached via cache-keys.ts.
// ===========================================================================

interface RunResult {
  content: string;
  reasoning?: string;
  parsed: unknown;
  parse_error: string | null;
  model: string;
  transport: string;
  attempts: number;
  usage: unknown;
  elapsed_ms: number;
  prompt_chars: number;
  resolved: { system_prompt: string; user_prompt: string };
  cache_hit: boolean;
  // Deterministic post-generation lint issues. Currently populated for
  // pesukim.synthesis (missing-Hebrew-excerpt). Empty array means clean.
  // Holds only the `hard` issues that gate the cache write.
  lint_issues?: unknown[];
  // Full standardized check-layer output (all severities, including `soft`
  // observe-only checks like anchor-verbatim / partition-clean / edge-integrity).
  // Never gates; surfaced for quality observation before a check is promoted.
  check_issues?: unknown[];
  // Content hash of the producer's recipe (extractor [+ render]) at the moment
  // this was generated — see recipeHash() in cache-keys.ts. Lets a reader detect
  // that the cached value predates a prompt/schema edit even when cache_version
  // wasn't bumped (GET /api/stale/...). Absent on entries written before this.
  recipe_hash?: string;
}

interface RunResultEnrichment extends RunResult {
  deps_resolved?: Record<string, unknown>;
  anchors_resolved?: Record<string, unknown>;
  /** Segment range (`${startSegIdx}-${endSegIdx}`) this section enrichment was
   *  computed for. Section enrichments (def.mark==='argument') are cache-keyed
   *  by the section TITLE — a volatile LLM label that can reattach to a
   *  different range on re-extraction — so we stamp the range and refuse a
   *  cache hit whose stamp doesn't match the section being requested. Absent on
   *  non-section enrichments and on entries predating the stamp. */
  section_range?: string;
}

async function readCachedResult(env: Bindings, key: string): Promise<RunResult | null> {
  if (!env.CACHE) return null;
  const raw = await env.CACHE.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as RunResult; } catch { return null; }
}

async function writeCachedResult(env: Bindings, key: string, result: RunResult): Promise<void> {
  if (!env.CACHE) return;
  // No TTL — outputs are deterministic per (def_hash, cache_version, daf
  // or instance). The canonical way to force a recache is to bump
  // cache_version on the definition (old key becomes unreachable) or
  // call /api/run with bypass_cache=true. A TTL on top of that
  // just makes warmed pages silently rot — measured pain: full-shas
  // warming costs ~$1000 and ~17 days; we don't want it expiring on us.
  await env.CACHE.put(key, JSON.stringify(result));
}

/** Computed-mark function signature. Receives env + (tractate, page) and
 *  returns the parsed mark output. Used for marks whose data comes from a
 *  deterministic source (e.g. Sefaria) rather than an LLM. */
type ComputedMarkFn = (env: Bindings, tractate: string, page: string) => Promise<{ instances: unknown[] }>;

/** Rishonim allowlist for the `rishonim` mark. Sefaria's
 *  `category: 'Commentary'` sweeps in acharonim + modern works too — we
 *  filter down to the established rishonim, kept in step with the
 *  alignment-pool list in sefaria/client.ts.
 *
 *  Match is on Sefaria's `collectiveTitle.en`, and these are the RAW Sefaria
 *  forms — which are NOT always the bare name:
 *    - Ramban is "Chiddushei Ramban" (never bare "Ramban").
 *    - Baal HaMaor is "HaMaor" (HaMaor HaGadol/HaKatan both collapse here).
 *    - Maharsha is "Chidushei Halachot" / "Chidushei Agadot".
 *    - The Rosh on Nedarim/Nazir is "Commentary of the Rosh".
 *    - Ra'ah appears as both "Ra'ah" and "Chiddushei HaRa'ah".
 *    - Mordechai is tractate-suffixed ("Mordechai on Bava Batra") so it's
 *      matched by prefix (see RISHONIM_TITLE_PREFIXES), not exact title.
 *  Add titles here as gaps surface. */
const RISHONIM_TITLES = new Set<string>([
  // Rashi + the Tosafot family
  'Rashi',
  'Tosafot',
  'Tosafot Yeshanim',
  'Tosafot Rid',
  'Tosafot HaRosh',
  'Piskei Tosafot', // Tosafot's halachic-ruling digest
  // Geonim / early rishonim
  'Rabbeinu Chananel',
  'Rabbeinu Gershom',
  'Rabbeinu Yonah',
  'Ri Migash',
  // Core rishonim
  'Chiddushei Ramban', // Ramban — Sefaria never keys this bare "Ramban"
  'Rashba',
  'Ritva',
  'Ran',
  'Rosh',
  'Commentary of the Rosh', // the Rosh on Nedarim/Nazir
  'Meiri',
  'Rif',
  'Yad Ramah',
  'Or Zarua',
  'Shita Mekubetzet',
  'HaMaor', // Baal HaMaor
  "Ra'ah",
  "Chiddushei HaRa'ah",
  'Maharam', // Maharam of Rothenburg
  // Maharsha is an acharon, surfaced here by the same deliberate choice that
  // keeps it in the alignment-pool rishonim tier (sefaria/client.ts).
  'Chidushei Halachot', // Maharsha (al ha-Shas)
  'Chidushei Agadot', // Maharsha (al ha-Aggados)
]);

/** Titles Sefaria stores tractate-suffixed (e.g. "Mordechai on Bava Batra"),
 *  matched by prefix rather than exact `collectiveTitle.en`. */
const RISHONIM_TITLE_PREFIXES = ['Mordechai'] as const;

const isRishonTitle = (title: string): boolean =>
  RISHONIM_TITLES.has(title) || RISHONIM_TITLE_PREFIXES.some((p) => title.startsWith(p));

const COMPUTED_FNS: Record<string, ComputedMarkFn> = {
  'rishonim-from-sefaria': async (env, tractate, page) => {
    const result = await fetchCommentaryWorks(env, tractate, page);
    if ('error' in result) throw new Error(result.error);
    // Regroup by segment, filtering to the rishonim allowlist. Each instance
    // = one commented segment with the per-rishon comment payloads attached
    // for downstream synthesis.
    const bySeg = new Map<number, Array<{ work: string; workHe: string; textHe: string; textEn: string; sourceRef: string }>>();
    for (const work of result.works) {
      if (!isRishonTitle(work.title)) continue;
      for (const c of work.comments) {
        const list = bySeg.get(c.anchorSegIdx) ?? [];
        list.push({ work: work.title, workHe: work.titleHe, textHe: c.textHe, textEn: c.textEn, sourceRef: c.sourceRef });
        bySeg.set(c.anchorSegIdx, list);
      }
    }
    const instances = [...bySeg.entries()]
      .sort(([a], [b]) => a - b)
      .map(([segIdx, comments]) => ({
        segIdx,
        fields: {
          works: [...new Set(comments.map((c) => c.work))],
          commentCount: comments.length,
          comments,
        },
      }));
    return { instances };
  },
  // Whole-daf marks (anchor: 'whole-daf') carry no per-segment anchor — they
  // represent one daf-level concept. Emit a single anchorless instance so the
  // chip renders and daf-level enrichments have something to attach to.
  'whole-daf-instance': async () => ({ instances: [{ fields: {} }] }),
};

// Per-section fan-out concurrency. Each section call is small (~3-6 moves);
// 5 in flight balances throughput against producer pressure / provider rate.
const FAN_OUT_CONCURRENCY = 5;

/**
 * Fan an LLM extractor out over the instances of a parent mark: one call per
 * instance (with `anchors.<fanOutMarkId>` narrowed to that single instance),
 * concatenating the per-call `instances` arrays into one merged result. This
 * bounds per-call output so the heaviest dapim don't exceed the provider's
 * streaming window (the failure mode that killed argument-move on 40+-move
 * dapim). Calls run in waves of FAN_OUT_CONCURRENCY.
 *
 * Completeness over partials: if ANY section call fails (after runLLM's own
 * retry + fallback chain), the whole thing throws so runMarkOnce does NOT
 * cache a partial move list — the queue retries the daf instead. Falls back to
 * a single whole-daf call when the parent has 0 or 1 instances.
 */
async function runExtractorFannedOut(
  rc: RunCtx,
  ext: LLMExtractor,
  baseVars: Record<string, unknown>,
  fanOutMarkId: string,
  llmOptsBase: Record<string, unknown>,
): Promise<{ result: LLMResult; systemPromptSample: string; userPromptSample: string }> {
  const anchors = (baseVars.anchors ?? {}) as Record<string, unknown>;
  // Dedupe the parent instances by segment range before fanning: if the parent
  // mark emitted the same section twice (a doubled `argument` partition), we'd
  // otherwise call the LLM for that section twice and concatenate the moves.
  const rawInstances = anchors[fanOutMarkId];
  const instances = Array.isArray(rawInstances)
    ? dedupeByRange(rawInstances as Array<Partial<{ startSegIdx: number; endSegIdx: number }>>)
    : rawInstances;

  const renderAndCall = async (anchorsOverride: Record<string, unknown>, maxTokens: number) => {
    const callVars = { ...baseVars, anchors: anchorsOverride };
    const systemPrompt = renderTemplate(ext.system_prompt, callVars);
    const userPrompt = renderTemplate(ext.user_prompt_template, callVars);
    const r = await runLLM(rc.env, {
      ...llmOptsBase,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
    } as Parameters<typeof runLLM>[1]);
    return { r, systemPrompt, userPrompt };
  };

  // Nothing to split — one call over the whole daf (preserves prior behavior).
  if (!Array.isArray(instances) || instances.length <= 1) {
    const { r, systemPrompt, userPrompt } = await renderAndCall(anchors, 16000);
    return { result: r, systemPromptSample: systemPrompt, userPromptSample: userPrompt };
  }

  const t0 = Date.now();
  const mergedInstances: unknown[] = [];
  const usage: LLMUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let promptChars = 0;
  let attempts = 1;
  let model = '';
  let transport = '';
  let reasoning = '';
  let sysSample = '';
  let userSample = '';

  for (let i = 0; i < instances.length; i += FAN_OUT_CONCURRENCY) {
    const wave = instances.slice(i, i + FAN_OUT_CONCURRENCY);
    const settled = await Promise.all(
      wave.map((inst) => renderAndCall({ ...anchors, [fanOutMarkId]: [inst] }, 8000)),
    );
    for (const { r, systemPrompt, userPrompt } of settled) {
      if (!sysSample) { sysSample = systemPrompt; userSample = userPrompt; }
      // A section whose JSON won't parse is a hard failure — throw so the daf
      // isn't cached with a section's moves silently missing.
      let p: { instances?: unknown[] };
      try {
        p = JSON.parse(r.content) as { instances?: unknown[] };
      } catch (err) {
        throw new Error(`fan-out ${fanOutMarkId}: section JSON parse failed: ${String(err).slice(0, 120)}`);
      }
      if (Array.isArray(p.instances)) mergedInstances.push(...p.instances);
      promptChars += r.prompt_chars;
      attempts = Math.max(attempts, r.attempts);
      model = r.model;
      transport = r.transport;
      if (r.reasoning_content) reasoning = r.reasoning_content;
      if (r.usage) {
        usage.prompt_tokens = (usage.prompt_tokens ?? 0) + (r.usage.prompt_tokens ?? 0);
        usage.completion_tokens = (usage.completion_tokens ?? 0) + (r.usage.completion_tokens ?? 0);
        usage.total_tokens = (usage.total_tokens ?? 0) + (r.usage.total_tokens ?? 0);
      }
    }
  }

  const result: LLMResult = {
    content: JSON.stringify({ instances: mergedInstances }),
    reasoning_content: reasoning,
    finish_reason: 'stop',
    usage,
    prompt_chars: promptChars,
    elapsed_ms: Date.now() - t0,
    model: (model || ext.model || '') as LLMResult['model'],
    transport: (transport || 'openrouter-gateway') as LLMResult['transport'],
    attempts,
  };
  return { result, systemPromptSample: sysSample, userPromptSample: userSample };
}

// Rabbi-mark post-processing: run the deterministic known-rabbi string-match
// safety net (the same augmentWithKnownRabbis the legacy /api/daf-context used)
// so rabbis the LLM missed but that appear verbatim in the daf still get an
// underline + timeline entry. Rebuilds the instance list from the augmented
// rabbis — `excerpt` is non-load-bearing for the rabbi mark (the renderer and
// sidebar key off fields.nameHe), so mirroring it from nameHe is safe.
function postProcessRabbi(parsed: unknown, hebrewText: string): unknown {
  const p = parsed as { instances?: Array<{ fields?: { name?: string; nameHe?: string; generation?: string } }> } | null;
  if (!p || !Array.isArray(p.instances)) return parsed;
  const modelRabbis = p.instances.map((i) => ({
    name: String(i.fields?.name ?? ''),
    nameHe: String(i.fields?.nameHe ?? ''),
    generation: (i.fields?.generation ?? 'unknown') as GenerationId,
  }));
  const augmented = augmentWithKnownRabbis(modelRabbis, hebrewText);
  return {
    ...p,
    instances: augmented.map((r) => ({
      excerpt: r.nameHe,
      // Fill an 'unknown' generation from the registry so a model-missed or
      // model-unsure rabbi (the deterministic safety net adds known rabbis as
      // 'unknown') still underlines on the right tier instead of neutral gray.
      // The model's call wins whenever it assigned a generation.
      fields: { name: r.name, nameHe: r.nameHe, generation: resolveGeneration(r.name, r.nameHe, r.generation) },
    })),
  };
}

async function runMarkOnce(
  rc: RunCtx,
  def: SchemaMarkDefinition,
  tractate: string,
  page: string,
  bypassCache: boolean,
): Promise<RunResult> {
  // Computed extractors — deterministic, no LLM. Same cache shape as LLM
  // results so the rest of the pipeline (caching, dependency resolution,
  // dev panel run-state) is uniform.
  if (def.extractor.kind === 'computed') {
    const fn = COMPUTED_FNS[def.extractor.fn];
    if (!fn) throw new Error(`mark ${def.id}: no computed fn '${def.extractor.fn}' registered`);
    // Computed marks are deterministic + language-neutral, so keep them on the
    // English (suffix-free) key regardless of rc.lang — no point fanning the
    // cache for identical output.
    const cacheKey = keyForMark(def, tractate, page);
    if (!bypassCache) {
      const hit = await readCachedResult(rc.env, cacheKey);
      if (hit) return { ...hit, cache_hit: true };
    }
    const t0 = Date.now();
    const parsed = await fn(rc.env, tractate, page);
    const elapsed_ms = Date.now() - t0;
    const content = JSON.stringify(parsed);
    const out: RunResult = {
      content,
      parsed,
      parse_error: null,
      model: `computed:${def.extractor.fn}`,
      transport: 'computed',
      attempts: 1,
      usage: null,
      elapsed_ms,
      prompt_chars: 0,
      resolved: {
        system_prompt: `(computed fn: ${def.extractor.fn})`,
        user_prompt: `(no LLM call — deterministic extraction from upstream data source)`,
      },
      cache_hit: false,
    };
    await writeCachedResult(rc.env, cacheKey, out);
    return out;
  }

  if (def.extractor.kind !== 'llm') {
    throw new Error(`mark ${def.id} extractor.kind=${def.extractor.kind} not supported`);
  }
  const ext = def.extractor;
  // Only fan the cache out by language when this mark actually has a Hebrew
  // prompt — otherwise the :he run would produce byte-identical English
  // structure and just waste a cache slot + an LLM call. Marks with a `_he`
  // prompt (argument, halacha, aggadata, pesukim, argument-move) emit a
  // Hebrew title/summary, so those get their own :he namespace.
  const useHe = rc.lang === 'he' && !!ext.system_prompt_he;
  const cacheKey = keyForMark(def, tractate, page, useHe ? 'he' : 'en');
  if (!bypassCache) {
    const hit = await readCachedResult(rc.env, cacheKey);
    if (hit) return { ...hit, cache_hit: true };
  }

  const inputs = await resolveDependencies(rc, def.dependencies, tractate, page, undefined, bypassCache, new Set());
  const vars: Record<string, unknown> = {
    ...inputs.vars,
    depends: inputs.depends,
    anchors: inputs.anchors,
  };
  // Shared runLLM options (everything except messages + max_tokens, which the
  // single-call and per-section-call paths set themselves).
  const llmOptsBase = {
    ...(ext.model ? { model: ext.model } : {}),
    ...(ext.fallback && ext.fallback.length > 0 ? { fallback: ext.fallback } : {}),
    temperature: 0.2,
    response_format: ext.output_schema
      ? { type: 'json_schema' as const, json_schema: ext.output_schema }
      : undefined,
    thinking: ext.thinking_off ? false : undefined,
    bypass_cache: bypassCache,
    // Cost-ledger attribution; the fan-out path spreads llmOptsBase, so this
    // tags every argument-move sub-call too.
    tag: `mark:${def.id}`,
  };

  let result: LLMResult;
  let systemPrompt: string;
  let userPrompt: string;
  // Hebrew mode selects the *_he prompt variant when the mark defines one
  // (mirrors runEnrichmentOnce). Falls back to English when absent.
  const sysTpl = useHe && ext.system_prompt_he ? ext.system_prompt_he : ext.system_prompt;
  const usrTpl = useHe && ext.user_prompt_template_he ? ext.user_prompt_template_he : ext.user_prompt_template;
  if (ext.fan_out_over) {
    const fanned = await runExtractorFannedOut(rc, { ...ext, system_prompt: sysTpl, user_prompt_template: usrTpl }, vars, ext.fan_out_over, llmOptsBase);
    result = fanned.result;
    systemPrompt = fanned.systemPromptSample;
    userPrompt = fanned.userPromptSample;
  } else {
    systemPrompt = renderTemplate(sysTpl, vars);
    userPrompt = renderTemplate(usrTpl, vars);
    result = await runLLM(rc.env, {
      ...llmOptsBase,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 16000,
    });
  }

  let parsed: unknown = null;
  let parse_error: string | null = null;
  if (ext.output_schema) {
    try { parsed = JSON.parse(result.content); }
    catch (err) { parse_error = String(err).slice(0, 200); }
  }
  // Per-mark post-processing via the declarative check layer
  // (src/lib/check/passes.ts). Some extractors (notably argument-move) can't
  // reliably emit segment indices for sub-ranges, so the verbatim re-anchorers
  // (reanchor-argument/-move/-pesukim/-aggadata) re-derive them from the Hebrew
  // excerpt the LLM IS good at copying, and compute token (word) offsets within
  // the matched segment so the highlight painter can paint exactly the
  // move/citation, not the whole containing segment. A definition opts in via
  // `passes: []` in code-marks.ts; the transforms need the segment grid, so
  // fetch the gemara slice once when any check runs.
  let markCheckIssues: unknown[] | undefined;
  let markHardIssues: unknown[] | undefined;
  if (parsed && def.passes && def.passes.length > 0) {
    const slice = await getGemaraSlice(rc.env, tractate, page, false);
    const checked = await runPasses(def.passes, parsed, {
      tractate, page, segmentsHe: slice.segments_he, defId: def.id, lang: rc.lang,
    });
    parsed = checked.parsed;
    // Attach all issues for observation; `hard` ones (e.g. anchor-verbatim on
    // pesukim/aggadata, where it's promoted) gate the cache write below.
    if (checked.issues.length > 0) {
      markCheckIssues = checked.issues;
      const hard = checked.issues.filter((i) => i.severity === 'hard');
      if (hard.length > 0) markHardIssues = hard;
    }
  }
  // Special cases that don't fit the segments-only transform signature yet:
  //   - rabbi:  needs the daf Hebrew text, not the segment grid (A1b will port it).
  //   - places: a side effect (backlog logging), not a parsed-output transform.
  if (parsed && def.id === 'rabbi') {
    parsed = postProcessRabbi(parsed, stripHtmlServer(String(vars.hebrew ?? '')));
  } else if (parsed && def.id === 'places') {
    // Places have no global gazetteer — log every observed location to the
    // "needs global enrichment" backlog so we can see what to add over time.
    recordObservedPlacesFromMark(rc, parsed, tractate, page);
  }
  // Attribute this fresh LLM call's tokens + cost to the daily rollup.
  captureLlmUsage(rc, { kind: 'mark', id: def.id, result: { model: result.model, usage: result.usage, parse_error } });
  const out: RunResult = {
    content: result.content,
    reasoning: result.reasoning_content || undefined,
    parsed,
    parse_error,
    model: result.model,
    transport: result.transport,
    attempts: result.attempts,
    usage: result.usage,
    elapsed_ms: result.elapsed_ms,
    prompt_chars: result.prompt_chars,
    // Resolved prompts are dev-only inspection; cap each at 2KB so multi-run
    // responses don't balloon. The full prompt was already sent to the LLM —
    // we don't need to ship it back through workerd just for the dev tray.
    resolved: {
      system_prompt: systemPrompt.length > 2000 ? systemPrompt.slice(0, 2000) + '… [+' + (systemPrompt.length - 2000) + ' chars]' : systemPrompt,
      user_prompt: userPrompt.length > 2000 ? userPrompt.slice(0, 2000) + '… [+' + (userPrompt.length - 2000) + ' chars]' : userPrompt,
    },
    cache_hit: false,
    ...(markCheckIssues ? { check_issues: markCheckIssues } : {}),
    ...(markHardIssues ? { lint_issues: markHardIssues } : {}),
  };
  // Gate on hard check issues, BOUNDED — same posture as runEnrichmentOnce. A
  // clean output (or one with only soft issues) is pinned; a hard-failing one
  // (e.g. a hallucinated pesukim/aggadata anchor) is left uncached so the next
  // request regenerates — until MAX_LINT_ATTEMPTS, then pinned anyway so a
  // persistently-failing card stops re-paying. Capped failures surface on /api/usage.
  if (!parse_error) {
    if (!markHardIssues) {
      await writeCachedResult(rc.env, cacheKey, out);
    } else if (await noteLintAttempt(rc.env, rc.ctx, cacheKey, {
      enrichmentId: def.id, tractate, page, lang: rc.lang, issues: markHardIssues,
    })) {
      await writeCachedResult(rc.env, cacheKey, out);
    }
  }
  return out;
}

/** The segment range a section-level argument enrichment is being computed for,
 *  as a `${startSegIdx}-${endSegIdx}` stamp — or null when the enrichment isn't
 *  section-anchored (so no range guard applies). Used to reject a cache hit
 *  whose title-derived key resolved to a stale, differently-ranged entry. */
function sectionRangeOf(def: EnrichmentDefinition | null, markInput: unknown): string | null {
  if (!def || def.mark !== 'argument') return null;
  const mi = markInput as { startSegIdx?: number; endSegIdx?: number } | null;
  if (mi && typeof mi.startSegIdx === 'number' && typeof mi.endSegIdx === 'number') {
    return `${mi.startSegIdx}-${mi.endSegIdx}`;
  }
  return null;
}

/** Project a (flattened) enrichment definition into the recipe shape recipeHash
 *  expects — the generation inputs that determine output. The runtime def is the
 *  studio-registry shape (no nested `extractor`), so we build it explicitly
 *  rather than hashing a lossy projection. Lang-agnostic: any prompt / schema /
 *  model edit (en OR he) moves the hash, so the same value is computed at the
 *  write site and the /api/stale check site regardless of run language. */
function enrichmentRecipe(def: EnrichmentDefinition): { extractor: unknown } {
  return {
    extractor: {
      system_prompt: def.system_prompt,
      user_prompt_template: def.user_prompt_template,
      system_prompt_he: def.system_prompt_he,
      user_prompt_template_he: def.user_prompt_template_he,
      model: def.model,
      output_schema: def.output_schema,
      // Also output-determining (passed to runLLM): a change to either changes
      // generation even with identical prompts. (`model` unset = the user's
      // default model — a runtime resolution outside the definition, so a change
      // there is not a recipe change and is intentionally out of scope.)
      thinking_off: def.thinking_off,
      reasoning_effort: def.reasoning_effort,
    },
  };
}

async function runEnrichmentOnce(
  rc: RunCtx,
  def: EnrichmentDefinition,
  tractate: string,
  page: string,
  markInput: unknown,
  bypassCache: boolean,
  modelOverride?: LLMModelId,
  parentChain: ReadonlySet<string> = new Set(),
  /** Free-text qualifier (e.g. the user's question for argument-move.qa).
   *  Hashed into the cache key when present, and exposed to the prompt
   *  template as {{user_question}}. */
  userQuestion?: string,
): Promise<RunResultEnrichment> {
  const instance_id = await instanceIdOf(markInput);
  const qHash = userQuestion ? await qualifierHash(userQuestion) : undefined;
  const cacheKey = modelOverride
    // Per-call model overrides skip the canonical cache to avoid polluting
    // the default-traffic key. Re-running with the same override hits the
    // gateway prompt cache but not KV — consistent with bypass behavior.
    ? null
    : keyForEnrichment(def, instance_id, def.scope === 'local' ? { tractate, page } : undefined, qHash, rc.lang);
  // Section enrichments key by title (see instanceIdOf); guard against a
  // drifted title serving another section's cache by validating the stamped
  // range. Null for non-section enrichments (no guard).
  const sectionRange = sectionRangeOf(def, markInput);
  if (cacheKey && !bypassCache) {
    const hit = await readCachedResult(rc.env, cacheKey) as RunResultEnrichment | null;
    // Reject a hit whose stamped range doesn't match the requested section
    // (covers both a drifted title AND legacy entries with no stamp) so it
    // recomputes for the correct range instead of returning stale content.
    if (hit && (!sectionRange || hit.section_range === sectionRange)) {
      return { ...hit, cache_hit: true };
    }
  }

  // Content hash of this producer's recipe, stamped on every fresh write below
  // so staleness can be detected later (GET /api/stale). Computed once here,
  // after the cache-hit early-return so hits don't pay for it. Enrichments have
  // no `render`, so this hashes the extractor (prompt/schema/model).
  const recipe_hash = await recipeHash(enrichmentRecipe(def));

  // Graph short-circuit for rabbi.relationships. Sefaria's rabbi graph
  // (src/lib/data/rabbi-hierarchy.json) is the source of truth for who
  // a rabbi's teachers/students/colleagues were — much more reliable than
  // an LLM call, deterministic, free, and instant. We only fall through to
  // the LLM when the graph misses (rabbi not found OR node has no edges).
  if (def.id === 'rabbi.relationships') {
    const inst = markInput as { name?: string; nameHe?: string; generation?: string } | null;
    if (inst?.name) {
      const hit = lookupRelationships(inst.name, inst.nameHe, inst.generation);
      if (hit) {
        const out: RunResultEnrichment = {
          content: JSON.stringify(hit.data),
          parsed: hit.data,
          parse_error: null,
          model: `graph:${hit.slug}`,
          transport: 'graph',
          attempts: 0,
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          elapsed_ms: 0,
          prompt_chars: 0,
          resolved: {
            system_prompt: `(graph lookup: ${hit.slug})`,
            user_prompt: `(graph lookup for rabbi: ${inst.name})`,
          },
          cache_hit: false,
          recipe_hash,
        };
        if (cacheKey) await writeCachedResult(rc.env, cacheKey, out);
        return out;
      }
      // Miss — fall through to the LLM path with the disambiguation prompt.
    }
  }

  // Deterministic short-circuit for rabbi.identity. The slug / region / places
  // / moved fields come from the precomputed rabbi-places.json join (the same
  // enrichRabbi the legacy /api/daf-context used) — an LLM can't produce a
  // Sefaria slug, so there's no fallback path: enrichRabbi always returns an
  // IdentifiedRabbi (nulled fields for rabbis not in the dataset). This is the
  // single source of canonical identity data the timeline + bio sidebar read.
  if (def.id === 'rabbi.identity') {
    // Always short-circuit — there is no useful LLM fallback (a model can't
    // know a Sefaria slug), and the placeholder prompt must never run.
    const inst = markInput as { name?: string; nameHe?: string; generation?: GenerationId } | null;
    const ident = enrichRabbi(inst?.name ?? '', inst?.nameHe ?? '', inst?.generation ?? 'unknown');
    // Rabbi not in the bundled dataset → add to the "needs global enrichment"
    // backlog so we can track who to add a base bio for as usage grows.
    if (!ident.slug && (inst?.name || inst?.nameHe)) {
      recordUnknownRabbi(rc.env, rc.ctx, { name: inst?.name, nameHe: inst?.nameHe, generation: inst?.generation, tractate, page });
    }
    const out: RunResultEnrichment = {
      content: JSON.stringify(ident),
      parsed: ident,
      parse_error: null,
      model: ident.slug ? `lookup:${ident.slug}` : 'lookup:miss',
      transport: 'lookup',
      attempts: 0,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      elapsed_ms: 0,
      prompt_chars: 0,
      resolved: {
        system_prompt: '(deterministic lookup: rabbi-places.json)',
        user_prompt: `(identity lookup for rabbi: ${inst?.name ?? '(unnamed)'})`,
      },
      cache_hit: false,
      recipe_hash,
    };
    if (cacheKey) await writeCachedResult(rc.env, cacheKey, out);
    return out;
  }

  const nextChain = new Set(parentChain);
  nextChain.add(def.id);
  const inputs = await resolveDependencies(rc, def.dependencies, tractate, page, markInput, bypassCache, nextChain);

  // Deterministic accumulation step — runs LAST (its mark deps are resolved
  // above) and writes per-rabbi observation slices to KV as a side effect.
  // No LLM. See runRabbiObservations + src/worker/rabbi-observations.ts.
  if (def.id === 'rabbi.observations') {
    const out = await runRabbiObservations(rc, def, tractate, page, inputs);
    if (cacheKey) await writeCachedResult(rc.env, cacheKey, out);
    return out;
  }

  // Pre-fetch the focal pasuk's Hebrew verbatim for pesukim.* enrichments so
  // the LLM has a verbatim source to quote from. Without this the model
  // translates the verse to English and quotes that — the regression the
  // synthesisLint catches.
  let pasukHe = '';
  let crossRefsHe = '';
  if (def.id.startsWith('pesukim.')) {
    const mi = markInput as { verseRef?: string; fields?: { verseRef?: string } } | null;
    const focalRef = mi?.verseRef ?? mi?.fields?.verseRef ?? '';
    if (focalRef) pasukHe = await fetchPasukHebrewForPrompt(rc.env, focalRef);
    // For synthesis only: also fetch Hebrew for every OTHER pasuk cited on
    // the daf, so the LLM can quote cross-references (e.g. Tehillim 119:148
    // when the focal is 119:62) without reconstructing from training memory.
    if (def.id === 'pesukim.synthesis') {
      const pesukimAnchors = inputs.anchors.pesukim as { fields?: { verseRef?: string } }[] | undefined;
      if (Array.isArray(pesukimAnchors) && pesukimAnchors.length > 0) {
        const seen = new Set<string>([focalRef]);
        const lines: string[] = [];
        for (const inst of pesukimAnchors) {
          const ref = inst?.fields?.verseRef;
          if (!ref || seen.has(ref)) continue;
          seen.add(ref);
          const he = await fetchPasukHebrewForPrompt(rc.env, ref);
          if (he) lines.push(`- ${ref}: "${he}"`);
        }
        crossRefsHe = lines.join('\n');
      }
    }
  }

  // Scope the moves injected into the section-level argument enrichments
  // (argument.synthesis, argument.voices) to THIS section. The argument-move
  // mark emits every move on the daf; handing the LLM the whole list with only
  // a soft "filter to this section" instruction makes synthesis summarize the
  // entire sugya (worst for a 1-segment opening excerpt) and lets voices pull
  // in rabbis from other sections. selectSectionMoves narrows to the section's
  // moves and dedupes them. Move-level (argument-move.*) enrichments are NOT
  // scoped — they deliberately get the full list to cross-reference other moves.
  if (def.mark === 'argument') {
    const mi = markInput as { startSegIdx?: number; endSegIdx?: number } | null;
    const all = inputs.anchors['argument-move'];
    if (mi && typeof mi.startSegIdx === 'number' && typeof mi.endSegIdx === 'number' && Array.isArray(all)) {
      inputs.anchors['argument-move'] = selectSectionMoves(
        all as MoveLike[],
        { startSegIdx: mi.startSegIdx, endSegIdx: mi.endSegIdx },
      );
    }
  }

  const vars: Record<string, unknown> = {
    ...inputs.vars,
    mark_input: markInput,
    pasuk_he: pasukHe,
    cross_refs_he: crossRefsHe,
    depends: inputs.depends,
    anchors: inputs.anchors,
    // Normalized so prompts see a clean version even when the user submits
    // sloppy whitespace/casing. Empty string when absent so {{user_question}}
    // is safe to interpolate in any prompt.
    user_question: userQuestion ? normalizeQualifier(userQuestion) : '',
  };
  // Select the Hebrew prompt variant when this run is lang='he' AND the def
  // provides one; otherwise fall back to English. Falling back (rather than
  // erroring) means an enrichment without a *_he prompt still works in he
  // mode — it just produces English prose until its Hebrew prompt is authored.
  const useHe = rc.lang === 'he';
  const systemPromptTpl = useHe && def.system_prompt_he ? def.system_prompt_he : def.system_prompt;
  const userPromptTpl = useHe && def.user_prompt_template_he ? def.user_prompt_template_he : def.user_prompt_template;
  const systemPrompt = renderTemplate(systemPromptTpl, vars);
  const userPrompt = renderTemplate(userPromptTpl, vars);

  const model = modelOverride ?? def.model;
  const result = await runLLM(rc.env, {
    ...(model ? { model } : {}),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 16000,
    temperature: 0.2,
    response_format: def.output_schema
      ? { type: 'json_schema', json_schema: def.output_schema }
      : undefined,
    thinking: def.thinking_off ? false : undefined,
    reasoning_effort: def.reasoning_effort,
    bypass_cache: bypassCache,
    tag: `enrich:${def.id}`,
    // Custom Q&A enrichments (<mark>.qa) count against the hourly custom-question
    // budget; everything else only against the daily total. See ./budget.
    cost_class: def.id.endsWith('.qa') ? 'custom-question' : undefined,
  });

  let parsed: unknown = null;
  let parse_error: string | null = null;
  if (def.output_schema) {
    try { parsed = JSON.parse(result.content); }
    catch (err) { parse_error = String(err).slice(0, 200); }
  }
  // Post-generation processing via the standardized check layer
  // (src/lib/check/passes.ts). An enrichment opts in through `passes: []` in
  // code-marks.ts. Transforms run first:
  //   - rabbi.{relationships,geography}.evidence -> 'reanchor-rabbi-evidence'
  //     resolves each evidence excerpt to (startSegIdx, endSegIdx, tokenStart,
  //     tokenEnd) so the sidebar can paint click-to-highlight ranges.
  // Then validators:
  //   - pesukim.synthesis -> 'hebrew-excerpt' (pesukim cited with English-only
  //     quotes and no Hebrew verbatim text);
  //   - halacha.* -> 'hebrew-gloss' (HEBREW_GLOSS_STYLE violations: bare /
  //     parenthesized transliterations, calques, across every prose field + chip);
  //   - argument.voices -> 'edge-integrity' (soft, observe-only).
  // Issues are attached to the result (visible in dev tray / cache) but never
  // reject the run; only `hard` issues gate the cache write below. The transforms
  // need the segment grid, so fetch the gemara slice once when any check runs.
  let lint_issues: unknown[] | undefined;   // hard subset → gating + /api/usage path
  let check_issues: unknown[] | undefined;  // all severities → observation
  let hardIssueCount = 0;
  if (parsed && !parse_error && def.passes && def.passes.length > 0) {
    const slice = await getGemaraSlice(rc.env, tractate, page, false);
    // commentary-verbatim needs the daf's real Rashi/Tosafot text to verify
    // cited quotes against — fetch it only when a check actually wants it.
    let commentaryHe: string[] | undefined;
    if (def.passes.includes('commentary-verbatim')) {
      const com = await getCommentariesSlice(rc.env, tractate, page, false);
      commentaryHe = Object.values(com.by_commentator).map((c) => stripHtmlServer(c.hebrew)).filter(Boolean);
    }
    const checked = await runPasses(def.passes, parsed, {
      tractate, page, segmentsHe: slice.segments_he, commentaryHe, defId: def.id, lang: rc.lang,
    });
    parsed = checked.parsed;
    if (checked.issues.length > 0) {
      check_issues = checked.issues;
      const hard = checked.issues.filter((i) => i.severity === 'hard');
      hardIssueCount = hard.length;
      if (hard.length > 0) lint_issues = hard;
    }
  }
  // daf-background.concepts has no global glossary — log every term it emits to
  // the observed-concept backlog so the canonical glossary can be grown from
  // real usage later (same collect-now pattern as observed-place).
  if (parsed && !parse_error && def.id === 'daf-background.concepts') {
    recordObservedConceptsFromEnrichment(rc, parsed, tractate, page);
  }
  const out: RunResultEnrichment = {
    content: result.content,
    reasoning: result.reasoning_content || undefined,
    parsed,
    parse_error,
    model: result.model,
    transport: result.transport,
    attempts: result.attempts,
    usage: result.usage,
    elapsed_ms: result.elapsed_ms,
    prompt_chars: result.prompt_chars,
    // Resolved prompts are dev-only inspection; cap each at 2KB so multi-run
    // responses don't balloon. The full prompt was already sent to the LLM —
    // we don't need to ship it back through workerd just for the dev tray.
    resolved: {
      system_prompt: systemPrompt.length > 2000 ? systemPrompt.slice(0, 2000) + '… [+' + (systemPrompt.length - 2000) + ' chars]' : systemPrompt,
      user_prompt: userPrompt.length > 2000 ? userPrompt.slice(0, 2000) + '… [+' + (userPrompt.length - 2000) + ' chars]' : userPrompt,
    },
    cache_hit: false,
    recipe_hash,
    deps_resolved: Object.keys(inputs.depends).length > 0 ? inputs.depends : undefined,
    anchors_resolved: Object.keys(inputs.anchors).length > 0 ? inputs.anchors : undefined,
    ...(lint_issues ? { lint_issues } : {}),
    ...(check_issues ? { check_issues } : {}),
    ...(sectionRange ? { section_range: sectionRange } : {}),
  };
  // Gate cache writes on the checks passing — but BOUND the retries. An output
  // with no `hard` issues is pinned immediately. A hard-failing output is left
  // uncached so the next request regenerates (the model is mildly
  // nondeterministic, so a retry may come back clean) — UNTIL it has failed
  // MAX_LINT_ATTEMPTS times, at which point we pin the best-effort output anyway
  // so reads become cache hits and regeneration stops. Without this cap the warm
  // crons re-pay for a persistently-failing card forever. (Soft issues never
  // gate.) Capped failures surface on /api/usage.
  if (cacheKey && !parse_error) {
    if (hardIssueCount === 0) {
      await writeCachedResult(rc.env, cacheKey, out);
    } else if (await noteLintAttempt(rc.env, rc.ctx, cacheKey, {
      enrichmentId: def.id, tractate, page, lang: rc.lang, issues: lint_issues ?? [],
    })) {
      await writeCachedResult(rc.env, cacheKey, out);
    }
  }
  // Attribute this fresh LLM call's tokens + cost to the daily rollup.
  captureLlmUsage(rc, { kind: 'enrichment', id: def.id, result: { model: result.model, usage: result.usage, parse_error } });
  return out;
}

// ===========================================================================
// rabbi.observations — deterministic reverse-index capture.
//
// Joins the daf's already-extracted entity marks (rabbi / places / aggadata /
// argument-move / pesukim) into per-rabbi observation slices and writes one KV
// slice per rabbi+daf. The pure join logic lives in rabbi-observations.ts;
// this wrapper does the I/O: resolve each rabbi/place's segment positions by
// matching their Hebrew against the daf segments, resolve canonical slugs via
// enrichRabbi, opportunistically read cached rabbi.location for the high-
// confidence place tier, then persist. Never calls an LLM, never amplifies
// LLM cost (location is read-from-cache only). This is the COLLECT half.
// ===========================================================================

/** Daf component of a rabbi-obs key — mirrors cache-keys.ts slugDaf so the
 *  inspect endpoint's prefix list is stable. */
export function obsDafSlug(tractate: string, page: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9.-]+/g, '_');
  return `${clean(tractate)}:${clean(page)}`;
}
function obsSlugId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 80);
}

function asInstances(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}
function rangeItemsOf(v: unknown): RangeItem[] {
  return asInstances(v)
    .filter((i) => typeof i.startSegIdx === 'number' && typeof i.endSegIdx === 'number')
    .map((i) => ({
      startSegIdx: i.startSegIdx as number,
      endSegIdx: i.endSegIdx as number,
      fields: (i.fields as Record<string, unknown>) ?? {},
    }));
}

async function runRabbiObservations(
  rc: RunCtx,
  def: EnrichmentDefinition,
  tractate: string,
  page: string,
  inputs: ResolvedInputs,
): Promise<RunResultEnrichment> {
  const t0 = Date.now();
  const computedAt = new Date().toISOString();
  const segmentsHe = (inputs.vars.segments_he as string[] | undefined) ?? [];
  const normSegs = segmentsHe.map(normalizeForMatch);

  const rabbiInsts = asInstances(inputs.anchors.rabbi);
  const placeInsts = asInstances(inputs.anchors.places);
  // Dedupe by move id: a doubled argument-move cache would otherwise
  // double-count every per-move observation in the reverse index.
  const moves = dedupeBy(
    rangeItemsOf(inputs.anchors['argument-move']),
    (m) => String((m.fields as { id?: unknown })?.id ?? `${m.startSegIdx}-${m.endSegIdx}`),
  );
  const aggadata = rangeItemsOf(inputs.anchors.aggadata);
  const pesukim = rangeItemsOf(inputs.anchors.pesukim);

  // rabbi.location is per-rabbi; read it from cache (no LLM trigger) so the
  // high-confidence place tier lights up for browsed dafs (synthesis prefetch
  // already computed it). Absent on a cold warm walk — we just skip the tier.
  const locDef = await loadEnrichmentDef(rc.env, 'rabbi.location');

  const resolvedRabbis: ResolvedRabbi[] = [];
  for (const inst of rabbiInsts) {
    const fields = (inst.fields as Record<string, unknown>) ?? {};
    const name = String(fields.name ?? '');
    const nameHe = String(fields.nameHe ?? inst.excerpt ?? '');
    if (!name && !nameHe) continue;
    const generation = (fields.generation ?? 'unknown') as GenerationId;
    const ident = enrichRabbi(name, nameHe, generation);
    const slug = ident.slug ?? obsSlugId(name || nameHe);
    if (!slug) continue;
    const segIdxs = resolveSegIdxs(String(inst.excerpt ?? nameHe), normSegs);

    let location: { place: string } | null = null;
    if (locDef) {
      try {
        const iid = await instanceIdOf(inst);
        const hit = await readCachedResult(rc.env, keyForEnrichment(locDef, iid, { tractate, page }));
        const place = (hit?.parsed as { place?: string } | null)?.place;
        if (typeof place === 'string' && place.trim()) location = { place: place.trim() };
      } catch { /* best-effort; high tier is optional */ }
    }

    resolvedRabbis.push({ slug, name: name || nameHe, nameHe, generation, segIdxs, location });
  }

  const resolvedPlaces: ResolvedPlace[] = placeInsts
    .map((inst) => {
      const fields = (inst.fields as Record<string, unknown>) ?? {};
      return {
        name: String(fields.name ?? ''),
        nameHe: String(fields.nameHe ?? ''),
        kind: typeof fields.kind === 'string' ? fields.kind : undefined,
        region: typeof fields.region === 'string' ? fields.region : undefined,
        segIdxs: resolveSegIdxs(String(inst.excerpt ?? fields.nameHe ?? ''), normSegs),
      };
    })
    .filter((p) => p.name || p.nameHe);

  const slices = buildObservationSlices({
    tractate, page, defHash: def.cache_version, computedAt,
    rabbis: resolvedRabbis, places: resolvedPlaces, moves, aggadata, pesukim,
  });

  // Persist: one idempotent slice per (rabbi, daf), keyed by canonical slug.
  // Concurrent daf runs never clobber each other (distinct keys); re-running a
  // daf overwrites only its own slices. A per-slug dirty marker is a cheap
  // breadcrumb for a future synthesis pass (no atomic-append needed).
  const dafSlug = obsDafSlug(tractate, page);
  const byType: Record<string, number> = {};
  let totalObs = 0;
  if (rc.env.CACHE) {
    for (const slice of slices) {
      await rc.env.CACHE.put(keyForRabbiObs(slice.slug, dafSlug), JSON.stringify(slice));
      await rc.env.CACHE.put(keyForRabbiObsDirty(slice.slug), computedAt);
      totalObs += slice.observations.length;
      for (const o of slice.observations) byType[o.type] = (byType[o.type] ?? 0) + 1;
    }
  }

  const summary = { tractate, page, rabbis: slices.length, observations: totalObs, byType, computedAt };
  return {
    content: JSON.stringify(summary),
    parsed: summary,
    parse_error: null,
    model: 'computed:rabbi.observations',
    transport: 'computed',
    attempts: 0,
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    elapsed_ms: Date.now() - t0,
    prompt_chars: 0,
    resolved: {
      system_prompt: '(deterministic: rabbi-observations join over daf marks)',
      user_prompt: `(rabbi.observations ${tractate} ${page}: ${slices.length} rabbis, ${totalObs} observations)`,
    },
    cache_hit: false,
  };
}

/**
 * POST /api/run — execute a mark or enrichment, return its raw output
 * + telemetry. Cache-aware: results are read/written via cache-keys.ts.
 *
 * Body:
 *   { mark_id?, enrichment_id?, ad_hoc?,
 *     tractate, page,
 *     model_override?, mark_input?, bypass_cache? }
 *
 * Exactly one of mark_id / enrichment_id / ad_hoc is required.
 */
/**
 * Compute the canonical KV cache key for a run-handler body. Returns null
 * when the body doesn't have enough info to compute one (e.g. ad-hoc with
 * no id). Used both in the producer (cache check before enqueuing) and the
 * consumer (write-through after running).
 */
async function cacheKeyForRunBody(env: Bindings, body: JobMessage): Promise<{
  key: string | null;
  defKind: 'mark' | 'enrichment' | null;
}> {
  if (body.mark_id) {
    const def = await loadMarkDef(env, body.mark_id);
    if (!def) return { key: null, defKind: null };
    // Mirror runMarkOnce: only namespace :he when the mark has a Hebrew prompt,
    // so the producer's cache-check and the consumer's write-through agree on
    // the key (otherwise a HE request would hit the EN-cached mark).
    const ext = def.extractor as { system_prompt_he?: string } | undefined;
    const useHe = body.lang === 'he' && !!ext?.system_prompt_he;
    return { key: keyForMark(def, body.tractate, body.page, useHe ? 'he' : 'en'), defKind: 'mark' };
  }
  if (body.enrichment_id) {
    const def = await loadEnrichmentDef(env, body.enrichment_id);
    if (!def) return { key: null, defKind: null };
    const instance_id = await instanceIdOf(body.mark_input);
    const dafForKey = def.scope === 'local' ? { tractate: body.tractate, page: body.page } : undefined;
    const qHash = body.user_question ? await qualifierHash(body.user_question) : undefined;
    return { key: keyForEnrichment(def, instance_id, dafForKey, qHash, body.lang ?? 'en'), defKind: 'enrichment' };
  }
  // ad_hoc has no canonical key
  return { key: null, defKind: null };
}

/**
 * Deterministic short id for a run request. Combines mark/enrichment id +
 * tractate/page + instance hash + timestamp to make polling-friendly ids.
 * Same params + same minute → same id (within reason), so retries don't
 * stampede the queue.
 */
async function makeRunId(body: JobMessage): Promise<string> {
  const parts = [
    body.mark_id ?? body.enrichment_id ?? 'adhoc',
    body.tractate, body.page,
    await instanceIdOf(body.mark_input),
    body.user_question ? `q_${await qualifierHash(body.user_question)}` : 'noq',
    body.lang === 'he' ? 'he' : 'en',
    body.bypass_cache ? 'fresh' : 'cached',
    String(Math.floor(Date.now() / 1000)),
  ];
  return parts.join(':').replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 200);
}

/**
 * Ring buffer of recent enrichment-queue job failures. Captures the full
 * error message + context that the `job:{runId}` record drops after 1h, so
 * postmortems past the panel's display window are possible without scraping
 * Cloudflare observability. Distinct from `telemetry:v1:recent` (which stores
 * classified error_kind, not the raw message, and is for usage rollups).
 *
 *   recent-errors:v1  →  RecentJobError[] (cap 200, TTL 30d)
 */
interface RecentJobError {
  ts: number;
  runId: string;
  kind: 'mark' | 'enrichment' | 'ad_hoc';
  id?: string;
  tractate: string;
  page: string;
  error: string;
  totalMs: number;
  /** Producer→consumer queue latency in ms, extracted from the unix-seconds
   *  timestamp embedded in runId by makeRunId. */
  queueWaitMs?: number;
}

const RECENT_ERRORS_KEY = 'recent-errors:v1';
const RECENT_ERRORS_CAP = 200;
const RECENT_ERRORS_TTL = 60 * 60 * 24 * 30;

function enqueueTsFromRunId(runId: string): number | undefined {
  const m = runId.match(/:(\d{8,})$/);
  return m ? parseInt(m[1], 10) * 1000 : undefined;
}

async function recordRecentJobError(
  env: Bindings,
  rec: Omit<RecentJobError, 'ts'>,
): Promise<void> {
  const cache = env.CACHE;
  if (!cache) return;
  try {
    const existing = await cache.get(RECENT_ERRORS_KEY);
    const arr = existing ? (JSON.parse(existing) as RecentJobError[]) : [];
    arr.push({ ts: Date.now(), ...rec });
    while (arr.length > RECENT_ERRORS_CAP) arr.shift();
    await cache.put(RECENT_ERRORS_KEY, JSON.stringify(arr), { expirationTtl: RECENT_ERRORS_TTL });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[recent-errors] KV write failed:', String(err));
  }
}

/**
 * POST /api/run — async producer.
 *
 * 1. Validate body.
 * 2. Compute the canonical cache key. If KV has a fresh result and the
 *    request didn't ask for bypass_cache, return 200 with the cached result
 *    immediately (this is the hot path).
 * 3. Otherwise enqueue a JobMessage and return 202 with `{ status: 'pending',
 *    runId, cacheKey }`. The client polls /api/run-status/:runId.
 *
 * The producer invocation is short-lived: it never holds the request open
 * while an LLM call runs. The queue consumer (queue() handler at the bottom
 * of this file) does the heavy work in its own invocation and writes the
 * result to KV under `job:{runId}` AND the canonical cache key.
 */
app.post('/api/run', async (c) => {
  let raw: unknown;
  try { raw = await c.req.json(); }
  catch { return c.json({ error: 'invalid JSON' }, 400); }
  const body = raw as Partial<JobMessage>;
  if (!body.tractate || !body.page) return c.json({ error: 'tractate and page required' }, 400);

  // Hijack lockdown: the privileged knobs let a caller run arbitrary prompts
  // (ad_hoc), pick an expensive model (model_override), or force fresh paid runs
  // (bypass_cache) — i.e. use the worker as a free LLM proxy. Gate them behind
  // STUDIO_SECRET. Public callers get the safe subset only: a registered
  // mark/enrichment on real daf content, cached, default model.
  const trusted = isTrustedRequest(c);
  if (!trusted) {
    if (body.ad_hoc !== undefined) return c.json({ error: 'ad_hoc runs require studio auth' }, 403);
    if (body.model_override !== undefined) return c.json({ error: 'model_override requires studio auth' }, 403);
  }

  if (body.model_override && !isLLMModelId(body.model_override)) {
    return c.json({ error: 'model_override must start with @cf/ or openrouter/' }, 400);
  }
  if (!body.mark_id && !body.enrichment_id && !body.ad_hoc) {
    return c.json({ error: 'mark_id, enrichment_id, or ad_hoc required' }, 400);
  }
  const job: JobMessage = {
    runId: '',  // assigned below
    mark_id: body.mark_id,
    enrichment_id: body.enrichment_id,
    ad_hoc: trusted ? body.ad_hoc : undefined,
    tractate: body.tractate,
    page: body.page,
    model_override: trusted ? body.model_override : undefined,
    mark_input: body.mark_input,
    // Public callers can't force a fresh paid run; downgrade to cache-respecting.
    bypass_cache: trusted ? body.bypass_cache === true : false,
    user_question: typeof body.user_question === 'string' && body.user_question.trim().length > 0
      ? body.user_question : undefined,
    lang: body.lang === 'he' ? 'he' : undefined,
  };

  // Hot path: canonical cache hit short-circuits the queue entirely.
  if (!job.bypass_cache) {
    const { key } = await cacheKeyForRunBody(c.env, job);
    if (key && c.env.CACHE) {
      const cached = await c.env.CACHE.get(key);
      if (cached) {
        try {
          const result = JSON.parse(cached) as RunResultEnrichment;
          // Section-enrichment range guard (mirrors runEnrichmentOnce): the
          // title-keyed section cache can hold another section's result after a
          // re-extraction shifts the title's range. Only serve the hot-path hit
          // when the stamped range matches the requested section; otherwise
          // fall through to enqueue so it recomputes for the correct range.
          const def = job.enrichment_id ? await loadEnrichmentDef(c.env, job.enrichment_id) : null;
          const sectionRange = sectionRangeOf(def, job.mark_input);
          if (!sectionRange || result.section_range === sectionRange) {
            // Record the cache-hit so per-mark / per-enrichment hit-rate is real.
            recordTelemetry(c, runTelemetryRec(job, { ...result, cache_hit: true }, 0));
            // total_ms isn't stored in the cached payload (only added at run
            // exit), so inject it on cache-hits — the panel renders it as the
            // run badge and shows "undefinedms" otherwise.
            return c.json({ status: 'ok', result: { ...result, cache_hit: true, total_ms: 0 } });
          }
        } catch { /* corrupt cache; fall through to enqueue */ }
      }
    }
  }

  // Stale-while-revalidate: on a version-bump miss, serve the PREVIOUS version's
  // cached value (tagged refreshing) while the new one recomputes in the
  // background — so bumping a cache_version never makes readers wait. (No
  // human-edit path writes the enrichment cache today; when one exists it must
  // be CAS-guarded so this never overwrites an edit.)
  if (!job.bypass_cache && job.enrichment_id && c.env.CACHE && c.env.ENRICHMENT_QUEUE) {
    const def = await loadEnrichmentDef(c.env, job.enrichment_id);
    const { key } = await cacheKeyForRunBody(c.env, job);
    const prevKey = previousVersionKey(key, job.enrichment_id, def?.cache_version);
    if (prevKey) {
      const stale = await c.env.CACHE.get(prevKey);
      if (stale) {
        try {
          const result = JSON.parse(stale) as RunResultEnrichment;
          // Mirror the hot path's section-range guard: don't serve a stale
          // result stamped for a different section than the one requested.
          const sectionRange = sectionRangeOf(def, job.mark_input);
          if (!sectionRange || result.section_range === sectionRange) {
            // Enqueue the recompute only when budget allows (else just serve
            // stale; the warm path will fill the new version when budget frees).
            const customRun = !!(job.enrichment_id.endsWith('.qa') && job.user_question);
            if ((await checkBudget(c.env, { custom: customRun })).ok) {
              job.runId = await makeRunId(job);
              await c.env.ENRICHMENT_QUEUE.send(job);
            }
            recordTelemetry(c, runTelemetryRec(job, { ...result, cache_hit: true }, 0));
            return c.json({ status: 'ok', result: { ...result, cache_hit: true, total_ms: 0, stale: true, refreshing: true } });
          }
        } catch { /* corrupt prev value; fall through to a normal enqueue */ }
      }
    }
  }

  if (!c.env.ENRICHMENT_QUEUE) {
    return c.json({ error: 'ENRICHMENT_QUEUE binding not available' }, 503);
  }
  // Budget gate before enqueueing real LLM work. Cache hits already returned
  // above (free, ungated). The queue consumer re-checks at the runLLM
  // chokepoint, but failing here gives the client an immediate paused signal.
  const customRun = !!(job.enrichment_id && job.enrichment_id.endsWith('.qa') && job.user_question);
  const gate = await checkBudget(c.env, { custom: customRun });
  if (!gate.ok) {
    return c.json({
      status: 'error',
      error: pauseErrorMessage(gate.scope),
      paused: true,
      scope: gate.scope,
      retryAfter: pauseRetryAfterSec(gate.until),
    }, 429);
  }
  job.runId = await makeRunId(job);
  // Compute the canonical cache key up-front so the client can use it as a
  // polling fallback. runEnrichmentOnce writes to this key right before the
  // queue handler writes `job:{runId}`; if the consumer is terminated in
  // that gap (CPU limit, restart) the canonical key may have the result
  // while the job key never lands. Returning the cacheKey lets the client
  // recover by checking it directly via run-status.
  const { key: cacheKey } = job.bypass_cache
    ? { key: null as string | null }
    : await cacheKeyForRunBody(c.env, job);
  await c.env.ENRICHMENT_QUEUE.send(job);
  return c.json({ status: 'pending', runId: job.runId, cacheKey: cacheKey ?? undefined }, 202);
});

/**
 * POST /api/warm-daf — comprehensively pre-warm one daf (marks + every
 * per-instance enrichment up to suggested-questions). Enqueues a single
 * `warm_deep` job; the consumer runs the marks and fans out the enrichment
 * warm jobs (cache-respecting). The client fires this for the adjacent dapim
 * on idle so forward/back navigation lands on a fully-cached page.
 */
app.post('/api/warm-daf', async (c) => {
  let raw: unknown;
  try { raw = await c.req.json(); }
  catch { return c.json({ error: 'invalid JSON' }, 400); }
  const body = raw as { tractate?: string; page?: string; lang?: string };
  if (!body.tractate || !body.page) return c.json({ error: 'tractate and page required' }, 400);
  if (!c.env.ENRICHMENT_QUEUE) return c.json({ error: 'ENRICHMENT_QUEUE binding not available' }, 503);
  // Don't fan out a deep-warm storm once the daily budget is paused.
  const gate = await checkBudget(c.env, { custom: false });
  if (!gate.ok) {
    return c.json({
      status: 'error', error: pauseErrorMessage(gate.scope),
      paused: true, scope: gate.scope, retryAfter: pauseRetryAfterSec(gate.until),
    }, 429);
  }
  const lang: 'en' | 'he' = body.lang === 'he' ? 'he' : 'en';
  const runId = `warm-deep:${body.tractate}:${body.page}:${lang}:${Math.floor(Date.now() / 1000)}`
    .replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 200);
  await c.env.ENRICHMENT_QUEUE.send({
    runId, warm_deep: true, tractate: body.tractate, page: body.page, ...(lang === 'he' ? { lang } : {}),
  });
  return c.json({ status: 'pending', runId }, 202);
});

/**
 * GET /api/run-status/:runId — polling endpoint for queued jobs.
 * Reads `job:{runId}` from KV. While the job is still running, returns 202
 * with `{ status: 'pending' }`. When done, returns 200 with the result.
 *
 * Optional `?k=<cacheKey>` query: if `job:{runId}` is missing, falls back
 * to the canonical cache key. Covers the gap where the queue consumer
 * wrote canonical cache but was terminated before writing the job key.
 */
app.get('/api/run-status/:runId', async (c) => {
  const runId = c.req.param('runId');
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE binding not available' }, 503);
  const raw = await cache.get(`job:${runId}`);
  if (raw) {
    try {
      return c.json(JSON.parse(raw));
    } catch {
      return c.json({ status: 'error', error: 'corrupt job record' }, 500);
    }
  }
  const cacheKey = c.req.query('k');
  if (cacheKey) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      try {
        const result = JSON.parse(cached) as RunResult;
        return c.json({ status: 'ok', result: { ...result, cache_hit: true, total_ms: 0 } });
      } catch { /* corrupt canonical entry — fall through to pending */ }
    }
  }
  return c.json({ status: 'pending' }, 202);
});

/**
 * GET /api/admin/recent-errors — read the queue-failure ring buffer. Returns
 * up to RECENT_ERRORS_CAP entries, newest last. Optional `?limit=N` truncates;
 * `?id=places` filters by mark/enrichment id; `?tractate=Pesachim` filters
 * by tractate.
 */
app.get('/api/admin/recent-errors', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'CACHE binding not available' }, 503);
  const raw = await cache.get(RECENT_ERRORS_KEY);
  let arr: RecentJobError[] = [];
  if (raw) {
    try { arr = JSON.parse(raw) as RecentJobError[]; }
    catch { return c.json({ error: 'corrupt buffer' }, 500); }
  }
  const idFilter = c.req.query('id');
  const tractateFilter = c.req.query('tractate');
  let out = arr;
  if (idFilter) out = out.filter((e) => e.id === idFilter);
  if (tractateFilter) out = out.filter((e) => e.tractate === tractateFilter);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '200', 10) || 200, RECENT_ERRORS_CAP);
  if (out.length > limit) out = out.slice(out.length - limit);
  return c.json({ count: out.length, errors: out });
});

/**
 * GET /api/rabbi-observations/:slug — read the accumulated reverse index for
 * one rabbi. Lists every rabbi-obs:v1:{slug}:* daf slice, merges them, and
 * aggregates observation frequency across dafs (the exact read a future
 * synthesis pass will perform). Read-only; nothing here promotes data back.
 *
 *   ?type=place   filter the flat `observations` list to one type
 *   ?min=2        only return aggregated entries seen on >= min dafs
 */
app.get('/api/rabbi-observations/:slug', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  const slug = c.req.param('slug');
  const prefix = prefixForRabbiObs(slug);

  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await cache.list({ prefix, cursor, limit: 1000 });
    for (const k of res.keys) keys.push(k.name);
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor && keys.length < 5000);

  const slices: ObservationSlice[] = [];
  for (const key of keys) {
    const raw = await cache.get(key);
    if (!raw) continue;
    try { slices.push(JSON.parse(raw) as ObservationSlice); } catch { /* skip corrupt slice */ }
  }

  const typeFilter = c.req.query('type');
  const minDafs = Math.max(1, parseInt(c.req.query('min') ?? '1', 10) || 1);
  const RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

  const byType: Record<string, number> = {};
  // Frequency across dafs, keyed by observation hash (same place/move/verse on
  // N dafs => dafs:N) — the signal a future "notable places" ranking needs.
  const freq = new Map<string, { type: string; payload: unknown; dafs: number; confidence: string }>();
  const observations: Array<Record<string, unknown>> = [];
  for (const s of slices) {
    for (const o of s.observations) {
      byType[o.type] = (byType[o.type] ?? 0) + 1;
      const prev = freq.get(o.hash);
      if (prev) {
        prev.dafs += 1;
        if ((RANK[o.confidence] ?? 0) > (RANK[prev.confidence] ?? 0)) prev.confidence = o.confidence;
      } else {
        freq.set(o.hash, { type: o.type, payload: o.payload, dafs: 1, confidence: o.confidence });
      }
      if (!typeFilter || o.type === typeFilter) {
        observations.push({ ...o, tractate: s.tractate, page: s.page });
      }
    }
  }
  const aggregated = [...freq.values()]
    .filter((e) => e.dafs >= minDafs)
    .sort((a, b) => b.dafs - a.dafs || (RANK[b.confidence] ?? 0) - (RANK[a.confidence] ?? 0));

  return c.json({
    slug,
    name: slices[0]?.name ?? slug,
    nameHe: slices[0]?.nameHe ?? '',
    dafCount: slices.length,
    byType,
    aggregated,
    observations,
  });
});

/**
 * GET /api/admin/llm-cost — sum the per-call cost ledger (llmcost:v1:*) that
 * runLLM writes. Unique-key entries, so the totals are exact even under the
 * 50-way concurrent queue. Used to size the rabbi.observations backfill.
 *
 *   ?since=<unix-ms>  only count calls at/after this timestamp
 *   ?clear=1          delete the ledger (reset before a measurement window)
 */
interface LlmCostRec {
  ts: number; model: string; transport: string; tag: string;
  attempts: number; ms: number;
  cost: number | null; prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null;
}
app.get('/api/admin/llm-cost', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  const prefix = 'llmcost:v1:';

  if (c.req.query('clear') === '1') {
    if (!isTrustedRequest(c)) return c.json({ error: 'clearing the cost ledger requires studio auth' }, 403);
    let cursor: string | undefined;
    let deleted = 0;
    do {
      const res = await cache.list({ prefix, cursor, limit: 1000 });
      for (const k of res.keys) { await cache.delete(k.name); deleted++; }
      cursor = res.list_complete ? undefined : res.cursor;
    } while (cursor && deleted < 50000);
    return c.json({ cleared: deleted });
  }

  const since = parseInt(c.req.query('since') ?? '0', 10) || 0;
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await cache.list({ prefix, cursor, limit: 1000 });
    for (const k of res.keys) keys.push(k.name);
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor && keys.length < 10000);

  let totalCost = 0;
  let calls = 0;
  let callsWithCost = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = 0;
  const byModel: Record<string, { calls: number; cost: number; promptTokens: number; completionTokens: number }> = {};
  const byTag: Record<string, { calls: number; cost: number }> = {};

  for (const key of keys) {
    const raw = await cache.get(key);
    if (!raw) continue;
    let r: LlmCostRec;
    try { r = JSON.parse(raw) as LlmCostRec; } catch { continue; }
    if (since && r.ts < since) continue;
    calls++;
    if (typeof r.cost === 'number') { totalCost += r.cost; callsWithCost++; }
    if (typeof r.prompt_tokens === 'number') promptTokens += r.prompt_tokens;
    if (typeof r.completion_tokens === 'number') completionTokens += r.completion_tokens;
    if (r.ts < minTs) minTs = r.ts;
    if (r.ts > maxTs) maxTs = r.ts;
    const m = (byModel[r.model] ??= { calls: 0, cost: 0, promptTokens: 0, completionTokens: 0 });
    m.calls++; m.cost += r.cost ?? 0; m.promptTokens += r.prompt_tokens ?? 0; m.completionTokens += r.completion_tokens ?? 0;
    const t = (byTag[r.tag] ??= { calls: 0, cost: 0 });
    t.calls++; t.cost += r.cost ?? 0;
  }

  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  for (const m of Object.values(byModel)) m.cost = round(m.cost);
  for (const t of Object.values(byTag)) t.cost = round(t.cost);

  return c.json({
    totalCostUsd: round(totalCost),
    calls,
    callsWithCost,
    promptTokens,
    completionTokens,
    window: { from: calls ? minTs : null, to: calls ? maxTs : null },
    byModel,
    byTag,
    truncated: keys.length >= 10000,
  });
});

/**
 * GET /api/admin/budget — spend-budget snapshot: today's total spend, this
 * hour's custom-question spend, the caps, and any active pause latches. Read-
 * only (open). See ./budget.
 */
app.get('/api/admin/budget', async (c) => {
  return c.json(await budgetStatus(c.env));
});

/**
 * POST /api/admin/budget/reset — manually lift the pause latches (trusted only).
 * The bucket counters keep accruing in their window, so if spend is still over
 * the cap the next call re-arms the pause immediately.
 */
app.post('/api/admin/budget/reset', async (c) => {
  if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
  const cleared = await clearPauses(c.env);
  return c.json({ ok: true, ...cleared });
});

/**
 * GET /api/admin/hb-probe — diagnose HebrewBooks fetch failures from the
 * WORKER's egress (Cloudflare network), which is what actually matters (it
 * works fine from a browser/ISP). Fetches a few dafim raw (no cache) and
 * reports status/latency/error per daf.
 *
 *   ?tractate=Berakhot&pages=2a,5a,10a,15b,20a
 *   ?concurrent=1   fire them all at once (replicates the backfill's burst)
 */
app.get('/api/admin/hb-probe', async (c) => {
  const tractate = c.req.query('tractate') ?? 'Berakhot';
  const pages = (c.req.query('pages') ?? '2a,5a,10a,15b,20a').split(',').map((s) => s.trim()).filter(Boolean);
  const concurrent = c.req.query('concurrent') === '1';

  const probeOne = async (page: string) => {
    const t0 = Date.now();
    try {
      const d = await fetchHebrewBooksDaf(tractate, page);
      return { page, ok: true, ms: Date.now() - t0, mainLen: d.main.length, rashiLen: d.rashi.length, tosafotLen: d.tosafot.length };
    } catch (e) {
      return { page, ok: false, ms: Date.now() - t0, error: String((e as Error)?.message ?? e).slice(0, 300) };
    }
  };

  const results = concurrent
    ? await Promise.all(pages.map(probeOne))
    : await (async () => { const out = []; for (const p of pages) out.push(await probeOne(p)); return out; })();

  const ok = results.filter((r) => r.ok).length;
  return c.json({ tractate, mode: concurrent ? 'concurrent' : 'sequential', attempted: results.length, ok, failed: results.length - ok, results });
});

// Spot-check the Revach placer for one daf: how each whole-daf Revach entry got
// placed (or left whole-daf) against this amud's argument sections, with `via`
// (revach-section = deterministic, ai = fallback). Read-only by default
// (LLM-free); pass ?ai=1 to also run the cached AI fallback (one LLM call + KV
// write on a cold daf). Needs the daf's `argument` mark + dafyomi warm.
app.get('/api/admin/revach-check/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const sections = (await readMarkInstances(c.env, 'argument', tractate, page))
    .filter((i) => typeof i.startSegIdx === 'number' && typeof i.endSegIdx === 'number')
    .map((i) => ({
      startSegIdx: i.startSegIdx as number,
      endSegIdx: i.endSegIdx as number,
      title: typeof i.fields?.title === 'string' ? i.fields.title : undefined,
      summary: typeof i.fields?.summary === 'string' ? i.fields.summary : undefined,
    }));
  const items = await collectContext(c.env, tractate, page, { sections });
  // Deterministic by default (LLM-free); pass ?ai=1 to also run the cached AI
  // fallback (may make one LLM call + write KV on a cold daf).
  if (c.req.query('ai') === '1') await placeRevachWithAi(c.env, tractate, page, items);
  const sectionTitleForSeg = (seg: number) =>
    sections.find((s) => seg >= s.startSegIdx && seg <= s.endSegIdx)?.title ?? null;
  const revach = items.filter((it) => it.source === 'dafyomi:revach').map((it) => ({
    entry: (it.title?.en ?? it.body?.en ?? '').slice(0, 80),
    placed: it.segs.length ? `${it.segs[0]}-${it.segs[it.segs.length - 1]}` : null,
    section: it.segs.length ? sectionTitleForSeg(it.segs[0]) : null,
    via: it.via ?? null,
    confidence: it.confidence ?? null,
    refs: (it.refs ?? []).map((r) => `${r.tractate} ${r.page}`),
  }));
  return c.json({
    tractate, page, sections: sections.length, revachEntries: revach.length,
    placed: revach.filter((r) => r.placed).length, items: revach,
  });
});

app.get('/api/admin/warm-status', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  const cursor = await readWarmCursor(cache);
  const sefariaCursor = await readSefariaWarmCursor(cache);
  const total = getWarmTotal();
  const processed = warmProgressProcessed(cursor);
  const sefariaProcessed = sefariaWarmProgressProcessed(sefariaCursor);
  return c.json({
    done: cursor.done === true,
    tractateIdx: cursor.tractateIdx,
    amudIdx: cursor.amudIdx,
    processed,
    total,
    percent: total === 0 ? 0 : Math.round((processed / total) * 1000) / 10,
    sefaria: {
      tractateIdx: sefariaCursor.tractateIdx,
      amudIdx: sefariaCursor.amudIdx,
      processed: sefariaProcessed,
      total,
      percent: total === 0 ? 0 : Math.round((sefariaProcessed / total) * 1000) / 10,
      wraps: sefariaCursor.wraps ?? 0,
    },
  });
});

/**
 * One-shot maintenance endpoint: walks a single page (1000 keys) of the
 * given prefix and rewrites any entry that still has an expiration so it
 * becomes infinite-TTL. Returns the next cursor so the caller can loop
 * via curl until `done: true`.
 *
 * Designed for the post-deploy cleanup after dropping TTL from
 * writeCachedResult — existing mark:/enrich: entries still carry their
 * original 90-day expiration baked in at write time. Doing this from KV
 * bindings (not the dashboard API) is ~10× faster.
 *
 * Usage:
 *   while :; do
 *     out=$(curl -s -X POST "https://talmud.shaunregenbaum.com/api/admin/strip-ttl?prefix=enrich:&cursor=$cur")
 *     cur=$(echo "$out" | jq -r .next_cursor)
 *     echo "$out"
 *     [ "$(echo "$out" | jq -r .done)" = "true" ] && break
 *   done
 */
app.post('/api/admin/strip-ttl', async (c) => {
  if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  const prefix = c.req.query('prefix');
  if (!prefix) return c.json({ error: 'prefix query param required' }, 400);
  const cursor = c.req.query('cursor') || undefined;

  const list = await cache.list({ prefix, limit: 1000, cursor });
  const withTtl = list.keys.filter((k) => typeof k.expiration === 'number' && k.expiration > 0);
  let rewritten = 0;
  const errors: string[] = [];

  // KV writes are at most ~1000/sec per namespace; reading is faster. Run
  // sequentially per key but in parallel across the page in groups of 25
  // so we don't blow CPU budget on a 1000-key page.
  const GROUP = 25;
  for (let i = 0; i < withTtl.length; i += GROUP) {
    const slice = withTtl.slice(i, i + GROUP);
    await Promise.all(slice.map(async (k) => {
      try {
        const v = await cache.get(k.name);
        if (v === null) return;  // gone between list and get
        await cache.put(k.name, v);  // no expirationTtl → infinite
        rewritten++;
      } catch (err) {
        errors.push(`${k.name}: ${String((err as Error)?.message ?? err).slice(0, 80)}`);
      }
    }));
  }

  return c.json({
    prefix,
    seen: list.keys.length,
    alreadyNoTtl: list.keys.length - withTtl.length,
    rewritten,
    errorCount: errors.length,
    errorsSample: errors.slice(0, 3),
    next_cursor: list.list_complete ? null : list.cursor,
    done: list.list_complete,
  });
});

app.get('/api/admin/cache-stats', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  const cached = await readCachedCacheStats(cache);
  // Stale-while-revalidate: computeCacheStats scans dozens of KV prefixes and
  // can take several seconds, so never block a page load on it once we have
  // ANY cached copy. Serve the cached value immediately; if it's past the 60s
  // freshness window, recompute in the background so the next load is fresh.
  // (A cron also refreshes this, so the background recompute is just a backstop
  // for gaps between cron runs.) Only a true cold miss blocks on the scan.
  if (cached) {
    if (!isFresh(cached)) {
      c.executionCtx.waitUntil((async () => {
        try {
          const fresh = await computeCacheStats(cache);
          await writeCachedCacheStats(cache, fresh);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[cache-stats] background refresh failed:', err);
        }
      })());
    }
    return c.json(cached);
  }
  const stats = await computeCacheStats(cache);
  await writeCachedCacheStats(cache, stats);
  return c.json(stats);
});

// GC orphaned cache entries (those left at a superseded cache_version after a
// def bump — unreachable, no-TTL cruft). Dry-run by default; `?apply=1` deletes
// (gated by STUDIO_SECRET, since deletion is destructive). `maxDeletes` caps a
// single pass so a real run is bounded. See src/worker/cache-gc.ts.
app.post('/api/admin/cache-gc', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  const apply = c.req.query('apply') === '1';
  if (apply && !isTrustedRequest(c)) return c.json({ error: 'deletion requires studio auth (?apply=1)' }, 403);
  const maxDeletes = Math.min(Number(c.req.query('maxDeletes')) || 2000, 20000);
  const targets = await cacheGcTargets(cache);
  const summary = await gcStaleCache(cache, targets, { dryRun: !apply, maxDeletes });
  // Only echo prefixes that actually have stale entries — keeps the report short.
  return c.json({ ...summary, results: summary.results.filter((r) => r.stale > 0) });
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

// ---------------------------------------------------------------------------
// Per-move Q&A registry — supports the Explore-deeper panel on argument-move
// cards. We keep ONE small JSON blob per move that lists which questions
// users have asked about it (curated + community). The actual answers live
// in the shared enrichment cache via argument-move.qa, keyed per
// (move, normalized question hash). Decoupling these means: (a) the answer
// cache stays uniformly shaped; (b) the registry stays small enough to read
// + rewrite as a single value on every interaction.
//
// Key shape:
//   qa-registry:{mark}:v1:{instance_id}:{tractate}:{page}
//
// Body shape (JSON):
//   {
//     community: [{ q, qHash, askedAt, clickCount }]
//   }
//
// Curated questions aren't stored here — they live in the
// {mark}.suggested-questions enrichment cache and are fetched by the client
// directly. The registry only tracks user-submitted ones because those are
// the ones the worker would otherwise have no way to enumerate (KV list-by-
// prefix is slow / paginated and we want this on the hot path).
//
// The `mark` partition lets argument-move and pesukim share the same QA
// machinery without colliding on instance ids. The endpoint dispatches the
// `<mark>.qa` enrichment to fill the answer cache.
// ---------------------------------------------------------------------------

// Marks that have a `<mark>.qa` enrichment registered. Keep this small —
// adding a mark here requires the corresponding suggested-questions + qa
// enrichments to exist in code-marks.ts.
const QA_ALLOWED_MARKS = new Set(['argument-move', 'pesukim', 'aggadata']);
const QA_DEFAULT_MARK = 'argument-move';
const QA_COMMUNITY_CAP = 50;
const QA_QUESTION_MAX_CHARS = 280;
// Rate limiting for /api/qa/ask: per-IP rolling window keyed in KV. Cheap
// abuse gate; not perfect (NAT, mobile carriers share IPs) but raises the
// floor for someone trying to burn LLM credits via the open endpoint.
const QA_ASK_RATE_LIMIT_WINDOW_SEC = 60 * 60;
const QA_ASK_RATE_LIMIT_MAX = 8;

interface QaRegistryEntry {
  q: string;
  qHash: string;
  askedAt: number;
  clickCount: number;
}
interface QaRegistry {
  community: QaRegistryEntry[];
}

function qaRegistryKey(mark: string, tractate: string, page: string, instanceId: string): string {
  // Mirror the cache-keys.ts sanitization so registry keys can't carry
  // colons or slashes that would collide across instances.
  const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 80);
  return `qa-registry:${safe(mark)}:v1:${safe(instanceId)}:${safe(tractate)}:${safe(page)}`;
}

async function readQaRegistry(env: Bindings, mark: string, tractate: string, page: string, instanceId: string): Promise<QaRegistry> {
  if (!env.CACHE) return { community: [] };
  try {
    const raw = await env.CACHE.get(qaRegistryKey(mark, tractate, page, instanceId));
    if (!raw) return { community: [] };
    const parsed = JSON.parse(raw) as QaRegistry;
    if (!parsed || !Array.isArray(parsed.community)) return { community: [] };
    return parsed;
  } catch {
    return { community: [] };
  }
}

async function writeQaRegistry(env: Bindings, mark: string, tractate: string, page: string, instanceId: string, reg: QaRegistry): Promise<void> {
  if (!env.CACHE) return;
  await env.CACHE.put(qaRegistryKey(mark, tractate, page, instanceId), JSON.stringify(reg));
}

// Pull (mark, instanceId) out of a request. Accepts both legacy
// `move_id`/(no mark, defaults to argument-move) and the generalized
// `instance_id`+`mark` forms.
function resolveQaScope(input: {
  mark?: string; move_id?: string; instance_id?: string;
}): { mark: string; instanceId: string } | null {
  const mark = input.mark ?? QA_DEFAULT_MARK;
  if (!QA_ALLOWED_MARKS.has(mark)) return null;
  const instanceId = input.instance_id ?? input.move_id;
  if (!instanceId) return null;
  return { mark, instanceId };
}

function clientIp(c: { req: { header: (k: string) => string | undefined; raw: unknown } }): string {
  // CF-Connecting-IP is the standard CF header; fall back through the others
  // for local dev. Keep this as a single concatenated id rather than IP-only
  // so two-cookie / two-mobile scenarios still share a counter.
  return (
    c.req.header('cf-connecting-ip')
    ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('x-real-ip')
    ?? 'unknown'
  );
}

async function tickRateLimit(env: Bindings, scope: string, who: string): Promise<{ ok: boolean; remaining: number }> {
  if (!env.CACHE) return { ok: true, remaining: QA_ASK_RATE_LIMIT_MAX };
  const key = `ratelimit:${scope}:${who}`;
  const raw = await env.CACHE.get(key);
  const now = Math.floor(Date.now() / 1000);
  let count = 0;
  let windowStart = now;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { count: number; windowStart: number };
      if (now - parsed.windowStart < QA_ASK_RATE_LIMIT_WINDOW_SEC) {
        count = parsed.count;
        windowStart = parsed.windowStart;
      }
    } catch { /* ignore corrupt */ }
  }
  count += 1;
  await env.CACHE.put(key, JSON.stringify({ count, windowStart }), {
    expirationTtl: QA_ASK_RATE_LIMIT_WINDOW_SEC,
  });
  return { ok: count <= QA_ASK_RATE_LIMIT_MAX, remaining: Math.max(0, QA_ASK_RATE_LIMIT_MAX - count) };
}

/**
 * GET /api/qa/registry?tractate&page&move_id|instance_id&mark
 *
 * Returns the community-submitted question list for one anchor so the client
 * can render the Questions panel without enumerating KV. Curated questions
 * are fetched separately via /api/run on `<mark>.suggested-questions`.
 *
 * `mark` defaults to 'argument-move' for back-compat with older clients.
 */
app.get('/api/qa/registry', async (c) => {
  const tractate = c.req.query('tractate');
  const page = c.req.query('page');
  if (!tractate || !page) {
    return c.json({ error: 'tractate, page required' }, 400);
  }
  const scope = resolveQaScope({
    mark: c.req.query('mark'),
    move_id: c.req.query('move_id'),
    instance_id: c.req.query('instance_id'),
  });
  if (!scope) {
    return c.json({ error: 'mark must be one of argument-move|pesukim|aggadata and instance_id (or move_id) is required' }, 400);
  }
  const reg = await readQaRegistry(c.env, scope.mark, tractate, page, scope.instanceId);
  return c.json(reg);
});

/**
 * POST /api/qa/ask
 *
 * Body: { tractate, page, mark?, instance_id|move_id, question, mark_input }
 *
 * Normalizes + hashes the question, dedupes against the registry, appends
 * to community if new, and enqueues the `<mark>.qa` enrichment so the
 * answer cache fills in for everyone. The actual answer is fetched
 * separately via /api/run by the client (which polls the queue) —
 * this endpoint only kicks the job and records the question for other users.
 *
 * `mark` defaults to 'argument-move' for back-compat with older clients.
 *
 * Returns: { qHash, alreadyAsked, rateLimited?, remaining }
 */
app.post('/api/qa/ask', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'invalid JSON' }, 400); }
  const b = body as Partial<{
    tractate: string; page: string;
    mark: string; move_id: string; instance_id: string;
    question: string; mark_input: unknown;
    lang: 'en' | 'he';
  }>;
  if (!b.tractate || !b.page || !b.question) {
    return c.json({ error: 'tractate, page, question required' }, 400);
  }
  const scope = resolveQaScope({ mark: b.mark, move_id: b.move_id, instance_id: b.instance_id });
  if (!scope) {
    return c.json({ error: 'mark must be one of argument-move|pesukim|aggadata and instance_id (or move_id) is required' }, 400);
  }
  const trimmed = b.question.trim();
  if (trimmed.length === 0) return c.json({ error: 'question is empty' }, 400);
  if (trimmed.length > QA_QUESTION_MAX_CHARS) {
    return c.json({ error: `question must be ≤${QA_QUESTION_MAX_CHARS} chars` }, 400);
  }

  const qHash = await qualifierHash(trimmed);

  // Existence check before rate-limiting. If the question is already in the
  // registry, we just bump click count and return — no LLM, no rate-limit
  // burn for the user. (They'd hit the cached answer anyway.)
  const reg = await readQaRegistry(c.env, scope.mark, b.tractate, b.page, scope.instanceId);
  const existing = reg.community.find((e) => e.qHash === qHash);
  if (existing) {
    existing.clickCount += 1;
    await writeQaRegistry(c.env, scope.mark, b.tractate, b.page, scope.instanceId, reg);
    return c.json({ qHash, alreadyAsked: true, remaining: -1 });
  }

  // Budget gate: pause new custom questions once the hourly custom budget (or
  // the daily total) is exhausted. Checked before the per-IP rate limit so a
  // paused request doesn't burn the user's quota.
  const gate = await checkBudget(c.env, { custom: true });
  if (!gate.ok) {
    return c.json({
      error: pauseErrorMessage(gate.scope),
      paused: true,
      scope: gate.scope,
      retryAfter: pauseRetryAfterSec(gate.until),
    }, 429);
  }

  // Novel question — gate behind the per-IP rate limit because this will
  // trigger an LLM call.
  const rl = await tickRateLimit(c.env, 'qa-ask', clientIp(c));
  if (!rl.ok) {
    return c.json({ error: 'rate-limited', rateLimited: true, remaining: 0 }, 429);
  }

  reg.community.unshift({
    q: trimmed,
    qHash,
    askedAt: Date.now(),
    clickCount: 1,
  });
  while (reg.community.length > QA_COMMUNITY_CAP) reg.community.pop();
  await writeQaRegistry(c.env, scope.mark, b.tractate, b.page, scope.instanceId, reg);

  // Kick the enrichment job so the answer is ready by the time the client
  // polls for it. The /api/run hot-path lookup will still cache-hit
  // on the second user with the same normalized question.
  if (c.env.ENRICHMENT_QUEUE) {
    const job: JobMessage = {
      runId: '',
      enrichment_id: `${scope.mark}.qa`,
      tractate: b.tractate,
      page: b.page,
      mark_input: b.mark_input,
      user_question: trimmed,
      bypass_cache: false,
      lang: b.lang === 'he' ? 'he' : undefined,
    };
    job.runId = await makeRunId(job);
    try {
      await c.env.ENRICHMENT_QUEUE.send(job);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[qa/ask] queue send failed:', String((err as Error)?.message ?? err));
    }
  }

  return c.json({ qHash, alreadyAsked: false, remaining: rl.remaining });
});

/**
 * POST /api/qa/click
 *
 * Body: { tractate, page, mark?, instance_id|move_id, qHash }
 *
 * Bumps click count for ranking. Best-effort — off-by-one doesn't matter
 * and we don't fail the request on a write race. Used for the "show top
 * 2 questions" ranking on the panel.
 */
app.post('/api/qa/click', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'invalid JSON' }, 400); }
  const b = body as Partial<{
    tractate: string; page: string;
    mark: string; move_id: string; instance_id: string;
    qHash: string;
  }>;
  if (!b.tractate || !b.page || !b.qHash) {
    return c.json({ error: 'tractate, page, qHash required' }, 400);
  }
  const scope = resolveQaScope({ mark: b.mark, move_id: b.move_id, instance_id: b.instance_id });
  if (!scope) {
    return c.json({ error: 'mark must be one of argument-move|pesukim|aggadata and instance_id (or move_id) is required' }, 400);
  }
  const reg = await readQaRegistry(c.env, scope.mark, b.tractate, b.page, scope.instanceId);
  const entry = reg.community.find((e) => e.qHash === b.qHash);
  if (entry) {
    entry.clickCount += 1;
    await writeQaRegistry(c.env, scope.mark, b.tractate, b.page, scope.instanceId, reg);
  }
  return c.json({ ok: true });
});

// --- Telemetry + /usage dashboard ---------------------------------------
//
// Endpoint vocabulary (open enum — string-typed):
//   'translate'           legacy /api/translate
//   'daf-context'         legacy /api/daf-context skeleton stage
//   'daf-context-stage2'  legacy /api/daf-context bio-enrichment stage
//   'studio-mark'         /api/run for a mark (see mark_id field)
//   'studio-enrichment'   /api/run for an enrichment (see enrichment_id)
//
// New entries don't need a code change — /api/usage rolls up dynamically over
// whatever endpoint values it sees in the ring buffer.
type TelemetryEndpoint = string;

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
  /** Set when endpoint === 'studio-mark'. */
  mark_id?: string;
  /** Set when endpoint === 'studio-enrichment'. */
  enrichment_id?: string;
  /** Token usage + estimated USD cost for the (recent-window) cost view.
   *  cost_usd is null when the model has no known list price. */
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number | null;
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

/**
 * Cost attribution for one freshly-computed LLM result. Increments the
 * persistent daily rollup (usage-rollup.ts) so total/per-mark/per-enrichment
 * spend stays lifetime-accurate beyond the 500-entry telemetry window. Called
 * from the two LLM compute paths (runMarkOnce / runEnrichmentOnce); cache hits
 * and deterministic short-circuits don't reach here, so the rollup counts real
 * LLM calls only. Fire-and-forget via rc.ctx.
 */
function captureLlmUsage(
  rc: RunCtx,
  args: { kind: 'mark' | 'enrichment'; id: string; result: { model?: string; usage?: LLMUsage | null; parse_error?: string | null } },
): void {
  const { input, output } = normalizeUsage(args.result.usage as Parameters<typeof normalizeUsage>[0]);
  const cost = priceCostUsd(args.result.model, args.result.usage as Parameters<typeof priceCostUsd>[1]);
  recordUsage(rc.env, rc.ctx, {
    ok: !args.result.parse_error,
    cacheHit: false,
    model: args.result.model ?? null,
    tokensIn: input,
    tokensOut: output,
    costUsd: cost,
    markId: args.kind === 'mark' ? args.id : undefined,
    enrichmentId: args.kind === 'enrichment' ? args.id : undefined,
  });
}

/** Build a studio-run telemetry record (latency + cache-hit + tokens/cost) for
 *  a mark or enrichment run. Used at the queue-job boundary and the producer
 *  cache-hit fast path so per-mark / per-enrichment latency + hit-rate reflect
 *  the real pipeline (translate was previously the only thing recording). */
function runTelemetryRec(
  job: { mark_id?: string; enrichment_id?: string; tractate: string; page: string },
  result: { model?: string; usage?: unknown; parse_error?: string | null; cache_hit?: boolean },
  ms: number,
): Omit<TelemetryRecord, 'ts'> {
  const { input, output } = normalizeUsage(result.usage as Parameters<typeof normalizeUsage>[0]);
  const cost = priceCostUsd(result.model, result.usage as Parameters<typeof priceCostUsd>[1]);
  const isMark = !!job.mark_id;
  return {
    endpoint: isMark ? 'studio-mark' : job.enrichment_id ? 'studio-enrichment' : 'studio-adhoc',
    tractate: job.tractate,
    page: job.page,
    cache_hit: result.cache_hit ?? false,
    model: result.model,
    ms,
    ok: !result.parse_error,
    error_kind: result.parse_error ? classifyError(result.parse_error) : undefined,
    mark_id: job.mark_id,
    enrichment_id: job.enrichment_id,
    tokens_in: input,
    tokens_out: output,
    cost_usd: cost,
  };
}

/** Record every place instance the `places` mark emitted into the observed-place
 *  backlog (there is no global places gazetteer, so all of them are candidates
 *  for global enrichment). */
function recordObservedPlacesFromMark(rc: RunCtx, parsed: unknown, tractate: string, page: string): void {
  const p = parsed as { instances?: Array<{ fields?: { name?: string; nameHe?: string; kind?: string; region?: string } }> } | null;
  if (!p || !Array.isArray(p.instances)) return;
  for (const inst of p.instances) {
    const f = inst?.fields;
    if (!f || (!f.name && !f.nameHe)) continue;
    recordObservedPlace(rc.env, rc.ctx, { name: f.name, nameHe: f.nameHe, kind: f.kind, region: f.region, tractate, page });
  }
}

/** Record every term the `daf-background.concepts` enrichment emitted into the
 *  observed-concept backlog. There is no global glossary yet, so all of them are
 *  candidates for a future canonical concept registry. */
function recordObservedConceptsFromEnrichment(rc: RunCtx, parsed: unknown, tractate: string, page: string): void {
  const p = parsed as { groups?: Array<{ category?: string; terms?: Array<{ term?: string; termHe?: string; gloss?: string }> }> } | null;
  if (!p || !Array.isArray(p.groups)) return;
  for (const g of p.groups) {
    if (!Array.isArray(g?.terms)) continue;
    for (const t of g.terms) {
      if (!t || (!t.term && !t.termHe)) continue;
      recordObservedConcept(rc.env, rc.ctx, { term: t.term, termHe: t.termHe, gloss: t.gloss, category: g.category, tractate, page });
    }
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
  // Assembling this payload reads several full KV prefixes — the usage rollups
  // and the three observed-entity backlogs each fetch EVERY key's value across
  // the warmed Shas — so a cold build runs ~10s. The dashboard polls every 30s
  // and a few seconds of staleness is harmless, so serve a cached payload and
  // refresh it in the background (stale-while-revalidate): every load after the
  // first is instant. A best-effort refresh lock (below) collapses the common
  // case of one viewer polling — or several at once — into a single rebuild per
  // window instead of one rebuild per stale request.
  const PAYLOAD_KEY = 'usage-payload:v1';
  const REFRESH_LOCK_KEY = 'usage-payload:refreshing';
  const PAYLOAD_FRESH_MS = 30_000;

  const computeUsagePayload = async () => {

  // External analytics, cached 5 min so the 30s dashboard refresh doesn't
  // hammer the CF analytics API. Closures so they participate in the single
  // parallel fetch below.
  const loadAigw = async (): Promise<Awaited<ReturnType<typeof fetchGatewayCost>>> => {
    if (!cache) return fetchGatewayCost(c.env);
    const raw = await cache.get('aigw-cost:v1');
    if (raw) { try { return JSON.parse(raw) as Awaited<ReturnType<typeof fetchGatewayCost>>; } catch { /* recompute */ } }
    const fresh = await fetchGatewayCost(c.env);
    c.executionCtx.waitUntil(cache.put('aigw-cost:v1', JSON.stringify(fresh), { expirationTtl: 300 }));
    return fresh;
  };
  const loadActivity = async (): Promise<Awaited<ReturnType<typeof fetchZoneActivity>>> => {
    if (!cache) return fetchZoneActivity(c.env);
    const raw = await cache.get('zone-activity:v1');
    if (raw) { try { return JSON.parse(raw) as Awaited<ReturnType<typeof fetchZoneActivity>>; } catch { /* recompute */ } }
    const fresh = await fetchZoneActivity(c.env);
    c.executionCtx.waitUntil(cache.put('zone-activity:v1', JSON.stringify(fresh), { expirationTtl: 300 }));
    return fresh;
  };

  // Every source below is independent, and several are full KV-prefix scans
  // (telemetry, usage rollups, the three observed-entity backlogs). Fetching
  // them serially made the page wait on the SUM of those scans; fetch them all
  // concurrently so it waits only on the slowest.
  const emptyUnknown = { total: 0, sightings: 0, sample: [] as never[] };
  const [
    telRaw, repRaw, selfTracked, aiGateway, activity,
    unknownRabbis, observedPlaces, observedConcepts, jeRaw, lintFailures,
  ] = await Promise.all([
    cache ? cache.get('telemetry:v1:recent') : null,
    cache ? cache.get('reports:v1:recent') : null,
    cache ? readUsageSummary(cache) : null,
    loadAigw(),
    loadActivity(),
    cache ? listUnknownRabbis(cache) : emptyUnknown,
    cache ? listObservedPlaces(cache) : emptyUnknown,
    cache ? listObservedConcepts(cache) : emptyUnknown,
    cache ? cache.get(RECENT_ERRORS_KEY) : null,
    readLintFailures(cache),
  ]);

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

  function rollup(rows: TelemetryRecord[]): Rollup {
    const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
    const hits = rows.filter((r) => r.cache_hit).length;
    const errors = rows.filter((r) => !r.ok);
    const errorsByKind: Record<string, number> = {};
    for (const e of errors) errorsByKind[e.error_kind ?? 'other'] = (errorsByKind[e.error_kind ?? 'other'] ?? 0) + 1;
    return {
      count: rows.length,
      cacheHits: hits,
      cacheHitRate: rows.length ? hits / rows.length : 0,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      errorCount: errors.length,
      errorsByKind,
    };
  }

  // Group dynamically over whatever endpoint values appear in the ring buffer
  // — keeps the dashboard correct without code changes when new endpoints
  // start recording.
  const byEndpoint = new Map<string, TelemetryRecord[]>();
  for (const r of telemetry) {
    const arr = byEndpoint.get(r.endpoint) ?? [];
    arr.push(r);
    byEndpoint.set(r.endpoint, arr);
  }
  const perEndpoint: Record<string, Rollup> = {};
  for (const [ep, rows] of byEndpoint) perEndpoint[ep] = rollup(rows);

  // Per-mark / per-enrichment splits for the studio-run endpoint. The UI
  // shows these in addition to the high-level studio-mark / studio-enrichment
  // rollup so a slow mark doesn't hide behind the aggregate.
  const byMark = new Map<string, TelemetryRecord[]>();
  const byEnrichment = new Map<string, TelemetryRecord[]>();
  for (const r of telemetry) {
    if (r.mark_id) {
      const arr = byMark.get(r.mark_id) ?? [];
      arr.push(r);
      byMark.set(r.mark_id, arr);
    }
    if (r.enrichment_id) {
      const arr = byEnrichment.get(r.enrichment_id) ?? [];
      arr.push(r);
      byEnrichment.set(r.enrichment_id, arr);
    }
  }
  const perMark: Record<string, Rollup> = {};
  for (const [id, rows] of byMark) perMark[id] = rollup(rows);
  const perEnrichment: Record<string, Rollup> = {};
  for (const [id, rows] of byEnrichment) perEnrichment[id] = rollup(rows);

  const recentErrors = telemetry
    .filter((r) => !r.ok)
    .slice(-30)
    .reverse()
    .map((r) => ({
      ts: r.ts, endpoint: r.endpoint, tractate: r.tractate,
      page: r.page, error_kind: r.error_kind, model: r.model,
      mark_id: r.mark_id, enrichment_id: r.enrichment_id,
    }));

  // --- Hard queue-job failures (separate ring buffer from telemetry) -------
  let jobErrors: RecentJobError[] = [];
  if (jeRaw) { try { jobErrors = (JSON.parse(jeRaw) as RecentJobError[]).slice(-30).reverse(); } catch { jobErrors = []; } }

  return {
    telemetry: { perEndpoint, perMark, perEnrichment, recentErrors, totalCount: telemetry.length },
    cost: { selfTracked, aiGateway },
    activity,
    unknowns: { rabbis: unknownRabbis, places: observedPlaces, concepts: observedConcepts },
    jobErrors,
    lintFailures,
    reports: [...reports].reverse(),
    generatedAt: new Date().toISOString(),
  };
  };

  // --- Stale-while-revalidate dispatch ------------------------------------
  if (cache) {
    const cachedRaw = await cache.get(PAYLOAD_KEY);
    if (cachedRaw) {
      let parsed: (Record<string, unknown> & { generatedAt?: string }) | null = null;
      try { parsed = JSON.parse(cachedRaw); } catch { parsed = null; }
      if (parsed) {
        const age = Date.now() - Date.parse(parsed.generatedAt ?? '');
        const fresh = Number.isFinite(age) && age >= 0 && age < PAYLOAD_FRESH_MS;
        if (!fresh) {
          // Best-effort singleflight: skip the rebuild if another request is
          // already refreshing. The lock self-expires (60s) so a crashed build
          // can't wedge it, and it's cleared on completion. KV is eventually
          // consistent, so this isn't a hard mutex — it just keeps a burst of
          // stale hits from each kicking off their own ~10s rebuild.
          const refreshing = await cache.get(REFRESH_LOCK_KEY);
          if (!refreshing) {
            c.executionCtx.waitUntil((async () => {
              try {
                await cache.put(REFRESH_LOCK_KEY, '1', { expirationTtl: 60 });
                const next = await computeUsagePayload();
                await cache.put(PAYLOAD_KEY, JSON.stringify(next), { expirationTtl: 600 });
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('[usage] background refresh failed:', err);
              } finally {
                await cache.delete(REFRESH_LOCK_KEY).catch(() => {});
              }
            })());
          }
        }
        return c.json(parsed);
      }
    }
  }
  // Cold miss (no cached payload): build synchronously, then cache it.
  const payload = await computeUsagePayload();
  if (cache) c.executionCtx.waitUntil(cache.put(PAYLOAD_KEY, JSON.stringify(payload), { expirationTtl: 600 }));
  return c.json(payload);
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

/** Shared fetch — returns the grouped commentary works for a daf. Cached.
 *  Used by both /api/commentaries (legacy endpoint) and the `commentary`
 *  mark's computed extractor. */
export async function fetchCommentaryWorks(
  env: Bindings,
  tractate: string,
  page: string,
  bypassCache = false,
): Promise<{ works: CommentaryWork[]; tractate: string; page: string; fetchedAt: string } | { error: string }> {
  const cache = env.CACHE;
  const cacheKey = keyForCommentaryWorks(tractate, page);
  if (cache && !bypassCache) {
    const hit = await cache.get(cacheKey);
    if (hit !== null) {
      try { return JSON.parse(hit) as { works: CommentaryWork[]; tractate: string; page: string; fetchedAt: string }; }
      catch { /* fall through to refetch */ }
    }
  }
  const ref = `${tractate} ${page}`;
  const url = `https://www.sefaria.org/api/links/${encodeURIComponent(ref)}?with_text=1`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    return { error: String(err) };
  }
  if (!res.ok) return { error: `Sefaria ${res.status}` };

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
  // Sort works by count desc so popular ones (Meiri, Ramban, Rashba…) lead.
  const works = Array.from(byWork.values()).sort((a, b) => b.count - a.count);

  const payload = { works, tractate, page, fetchedAt: new Date().toISOString() };
  if (cache) {
    await cache.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 * 60 * 24 * 30 });
  }
  return payload;
}

app.get('/api/commentaries/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const bypassCache = c.req.query('refresh') === '1';
  const result = await fetchCommentaryWorks(c.env, tractate, page, bypassCache);
  if ('error' in result) return c.json(result, 502);
  return c.json({ ...result, _cached: !bypassCache });
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
  const cacheKey = keyForCommentaryText(sourceRef);
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

  const models: Array<{ id: LLMModelId; label: string }> = [
    { id: '@cf/moonshotai/kimi-k2.5',        label: 'kimi-k2.5'   },
    { id: '@cf/google/gemma-4-26b-a4b-it',   label: 'gemma-4-26b' },
  ];

  const attempts: string[] = [];
  for (const m of models) {
    try {
      const r = await runLLM(c.env, {
        model: m.id,
        messages: [
          { role: 'system', content: COMMENTARY_TX_SYSTEM },
          { role: 'user', content: userParts.join('\n\n') },
        ],
        max_tokens: 800,
        temperature: 0.2,
        thinking: false,
      });
      const translation = r.content.trim().replace(/^["\']|["\']$/g, '');
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
  const cacheKey = keyForReferences(tractate, page);

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

// Structured dafyomi.co.il study content for a daf (both amudim, all content
// types present). Read-only: served from the committed static corpus via the
// ASSETS binding, memoized in KV. 404s rather than fabricating when a daf
// hasn't been ingested. Consumed by the alignment-page context workbench.
app.get('/api/dafyomi/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  if (!getDafyomiMasechet(tractate)) {
    return c.json({ error: `tractate not ingested: ${tractate}` }, 404);
  }
  const states: Array<'hit' | 'miss'> = [];
  const data = await getDafyomiContentCached(c.env.CACHE, c.env.ASSETS, tractate, page, {
    assetOrigin: new URL(c.req.url).origin,
    refresh: c.req.query('refresh') === '1',
    allowLive: (c.env as { DAFYOMI_LIVE?: string }).DAFYOMI_LIVE !== '0',
    track: { onCache: (s) => states.push(s) },
  });
  if (!data) return c.json({ error: `no dafyomi content for ${tractate} ${page}` }, 404);
  c.header('x-cache', states[0] === 'hit' ? 'hit' : 'miss');
  return c.json(data);
});

// The unified external-context pool for a daf: dafyomi.co.il study content +
// Sefaria commentary text / Mishnayot / Rishonim / halacha refs / topics, all
// normalized to anchored ContextItems. One call powers the alignment workbench
// and is the same pool enrichments draw from (see src/lib/context/select).
app.get('/api/context/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  try {
    const items = await collectContext(c.env, tractate, page, { assetOrigin: new URL(c.req.url).origin });
    return c.json({ tractate, page, items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return c.json({ error: String(err) }, 502);
  }
});

// AI segment-matcher: place a batch of whole-daf context items onto the
// segment(s) they discuss. Returns SegMatches the client applies. On-demand
// (LLM cost); the deterministic matchers in /api/context run for free.
/** Stable 32-bit FNV-1a of a daf's item-key set, for caching AI placements. */
function hashMatchKeys(keys: string[]): string {
  const s = [...keys].sort().join('|');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

app.post('/api/context/match', async (c) => {
  let body: { tractate?: string; page?: string; items?: MatchInput[] };
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad JSON body' }, 400); }
  const t = body.tractate;
  const p = body.page;
  const items = Array.isArray(body.items) ? body.items.filter((i) => i && typeof i.key === 'string') : [];
  if (!t || !p || items.length === 0) return c.json({ error: 'tractate, page, and items[] required' }, 400);
  const cache = c.env.CACHE;
  // The AI placement for a fixed (daf, item-set) is stable, and auto-grounding
  // re-requests it on every visit — so cache it forever (bump the version to
  // invalidate). v1 -> v2: the matcher now chunks large item sets; v1 entries
  // were matched in one oversized batch that silently left everything unplaced.
  const cacheKey = keyForCtxMatch(t, p, hashMatchKeys(items.map((i) => i.key)));
  if (cache) {
    const hit = await cache.get(cacheKey);
    if (hit !== null) {
      try { return c.json({ matches: JSON.parse(hit), cached: true }); } catch { /* fall through */ }
    }
  }
  try {
    const segments = await getSefariaSegmentsCached(cache, t, p);
    if (!segments) return c.json({ matches: [], warning: 'no segments for daf' });
    const matches = await aiMatchToSegments(c.env, segments.he, segments.en, items);
    if (cache) { try { await cache.put(cacheKey, JSON.stringify(matches)); } catch { /* ignore */ } }
    return c.json({ matches });
  } catch (err) {
    return c.json({ error: String(err) }, 502);
  }
});

app.get('/api/daf/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const source = c.req.query('source');
  const cache = c.env.CACHE;

  // Track KV hit/miss state across all slice fetches so we can emit an
  // x-cache: hit|miss|partial header. The renderer-activity panel reads
  // this to label daf-fetch accurately, replacing a brittle client-side
  // timing heuristic that always reported "miss" because edge RTT + 3
  // parallel KV gets routinely exceeded the 50ms threshold even when
  // everything was warm.
  const states: Array<'hit' | 'miss'> = [];
  const track: CacheTrack = { onCache: (s) => states.push(s) };
  const setCacheHeader = () => {
    if (states.length === 0) { c.header('x-cache', 'miss'); return; }
    const hits = states.filter((s) => s === 'hit').length;
    c.header('x-cache', hits === states.length ? 'hit' : hits === 0 ? 'miss' : 'partial');
  };

  if (source !== 'sefaria') {
    // HB is the primary typography source for the printed-Talmud look, but
    // we ALSO fetch Sefaria's bundle in parallel so we can overlay its
    // per-piece arrays (rashi.pieces / tosafot.pieces) onto the response.
    // The daf↔commentary anchor click feature requires Sefaria's piece
    // segmentation to align with its link-anchor refs — without pieces,
    // the inner/outer columns have no .daf-comm-piece markers and the
    // click handler can't find anything to highlight. Sefaria failure is
    // non-fatal; the daf still renders from HB without the anchor
    // feature.
    const [hb, segments, sefariaBundle] = await Promise.all([
      getHebrewBooksDafCached(cache, tractate, page, track),
      getSefariaSegmentsCached(cache, tractate, page, track),
      getSefariaPageCached(cache, tractate, page, track).catch(() => null),
    ]);
    if (hb) {
      const data: TalmudPageData = {
        mainText: { hebrew: hb.main, english: '' },
        rashi: hb.rashi ? {
          hebrew: hb.rashi,
          english: '',
          pieces: sefariaBundle?.rashi?.pieces,
          pieceKeys: sefariaBundle?.rashi?.pieceKeys,
        } : undefined,
        tosafot: hb.tosafot ? {
          hebrew: hb.tosafot,
          english: '',
          pieces: sefariaBundle?.tosafot?.pieces,
          pieceKeys: sefariaBundle?.tosafot?.pieceKeys,
        } : undefined,
      };
      setCacheHeader();
      return c.json({
        ...data,
        _source: 'hebrewbooks',
        mainSegmentsHe: segments?.he ?? [],
        mainSegmentsEn: segments?.en ?? [],
      });
    }
    if (source === 'hebrewbooks') {
      setCacheHeader();
      return c.json({ error: 'HebrewBooks fetch failed' }, 502);
    }
  }

  const [data, segments] = await Promise.all([
    getSefariaPageCached(cache, tractate, page, track),
    getSefariaSegmentsCached(cache, tractate, page, track),
  ]);
  setCacheHeader();
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
  'When the literal Hebrew and the Talmudic usage differ, pick the Talmudic usage unless the surrounding passage clearly demands the literal meaning. Use the aligned Hebrew+English segment from Sefaria as your primary anchor for the local argument.\n' +
  '\n' +
  'PRIORITY: if the aligned Sefaria English segment contains a clear English gloss for this exact word, return that exact gloss verbatim. The aligned segment is the authoritative anchor for the local sense.\n' +
  '\n' +
  'MORPHOLOGY: preserve number and tense.\n' +
  '  - Hebrew plural suffixes -ות / -ים translate as English plurals (שעות = "hours" not "watch"; ימים = "days"; בתים = "houses").\n' +
  '  - Aramaic plural suffixes -ין / -י / -ן translate as plurals.\n' +
  '  - Conjugated verbs keep their tense/person (אמר = "said"; אמרי = "they say"; יאמר = "he will say").\n' +
  '  - Construct forms (smichut) translate as "X of Y" or as a compound.';

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
  // v3: DeepSeek V4 Flash primary + hardcoded dict short-circuit +
  // morphology-aware prompt. Bumped from v2 to invalidate stale Gemma-era
  // translations (Gemma 4 26B was returning e.g. שעות → "watches").
  const cacheKey = keyForTranslate(tractate, page, word, ctxHash);
  const t0 = Date.now();
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      recordTelemetry(c, { endpoint: 'translate', tractate, page, cache_hit: true, ms: Date.now() - t0, ok: true });
      return c.json({ translation: cached, cached: true });
    }
  }

  // Hardcoded dict for high-frequency Talmudic words whose gloss is
  // context-free (Aramaic discourse markers, Mishnaic structural terms,
  // common Hebrew nouns small models botch the plural of). Skips the LLM
  // entirely and caches the result alongside LLM-produced ones.
  const dictGloss = lookupGloss(word);
  if (dictGloss) {
    if (cache) {
      await cache.put(cacheKey, dictGloss, { expirationTtl: 60 * 60 * 24 * 30 });
    }
    recordTelemetry(c, { endpoint: 'translate', tractate, page, cache_hit: false, model: 'dict', ms: Date.now() - t0, ok: true });
    return c.json({ translation: dictGloss, cached: false, _model: 'dict' });
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

  // DeepSeek V4 Flash primary (frontier-adjacent Hebrew morphology at
  // $0.14/$0.28 per 1M; reasoning auto-disabled in llm.ts for low latency).
  // Kimi K2.5 thinking fallback when DeepSeek returns empty or errors.
  const translateModels: Array<{ id: LLMModelId; label: string; kimi?: boolean }> = [
    { id: 'openrouter/deepseek/deepseek-v4-flash', label: 'deepseek-v4-flash' },
    { id: '@cf/moonshotai/kimi-k2.5',              label: 'kimi-k2.5', kimi: true },
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

      const r = await runLLM(c.env, {
        model: m.id,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userParts.join('\n\n') },
        ],
        max_tokens: m.kimi ? 400 : isPhrase ? 120 : 30,
        temperature: 0.1,
        thinking: false,
      });
      const translation = r.content.trim().replace(/^["']|["']$/g, '');
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

interface GenerationsResult {
  rabbis: Array<{
    name: string;
    nameHe: string;
    generation: GenerationId;
  }>;
}

const GENERATION_ID_SET = new Set<string>(GENERATION_IDS);

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
  const sanitized = dedupeBy(
    modelRabbis
      .map((r) => ({ ...r, nameHe: sanitizeNameHe(r.nameHe) }))
      .filter((r) => r.nameHe.length > 0),
    // Drop a rabbi the model named twice (same person, identical Hebrew name)
    // so the rabbi anchors fed to downstream enrichments aren't doubled.
    (r) => normalizeHe(r.nameHe),
  );
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

/**
 * Fill an 'unknown' generation from the resolved registry entry (when it's a
 * valid id). The model's / explicit generation always wins when it's known —
 * it disambiguates homonyms (e.g. "Rabbi Elazar", "Rav Huna") by context, which
 * the name-keyed registry can't. We only reach for the registry when the model
 * abstained, so a recognised later authority (Rashi, a named Gaon, …) lands on
 * the right tier + color instead of rendering as neutral 'unknown'.
 */
export function resolveGeneration(name: string, nameHe: string, generation: GenerationId): GenerationId {
  if (generation !== 'unknown') return generation;
  const entry = resolveRabbi(name, nameHe)?.entry ?? null;
  if (entry && typeof entry.generation === 'string' && GENERATION_ID_SET.has(entry.generation)) {
    return entry.generation as GenerationId;
  }
  return 'unknown';
}

export function enrichRabbi(name: string, nameHe: string, generation: GenerationId): IdentifiedRabbi {
  const hit = resolveRabbi(name, nameHe);
  const entry = hit?.entry ?? null;
  const finalGen = resolveGeneration(name, nameHe, generation);
  return {
    slug: hit?.slug ?? null,
    name: entry?.canonical ?? name,
    nameHe,
    generation: finalGen,
    region: entry?.region ?? deriveRegionFromGeneration(finalGen),
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
  const cacheKey = keyForRabbiBioBySlug(slug);
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
    const r = await runLLM(c.env, {
      model: '@cf/moonshotai/kimi-k2.5',
      messages: [
        { role: 'system', content: ENRICH_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 65536,
      temperature: 0.1,
      thinking: false,
      response_format: { type: 'json_schema', json_schema: ENRICH_JSON_SCHEMA },
    });
    const payload = r.content.trim() || extractJsonPayload({ response: r.content });
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
      c.env,
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
      c.env,
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
      c.env,
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
  env: Bindings,
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
      env,
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
  const cacheKey = keyForRabbiEnriched(slug);
  if (cache && !refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) {
      return c.json({ slug, record: JSON.parse(hit), _cached: true });
    }
  }

  const result = await enrichRabbiUnified(slug, entry, c.env, cache);
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
  const hit = await cache.get(keyForRabbiEnriched(slug));
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
  const cacheKey = keyForRabbiWikidata(slug);
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
  const cacheKey = keyForRabbiWikiBio(slug);
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
  if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
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
  await cache.put(keyForRabbiGraph(), JSON.stringify(blob), { expirationTtl: RABBI_STAGE_TTL_S });
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
  if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
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
  await cache.put(keyForRabbiCohort(), JSON.stringify(blob), { expirationTtl: RABBI_STAGE_TTL_S });
  return c.json({ ok: true, generations: Object.keys(byGeneration).length, sages: Object.keys(bySage).length, _ms: Date.now() - t0 });
});

interface RabbiPlacesIndexBlob {
  generatedAt: string;
  // place name → slugs known to have lived/taught there
  byPlace: Record<string, string[]>;
}

app.post('/api/admin/rabbi-compile/places-index', async (c) => {
  if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
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
  await cache.put(keyForRabbiPlacesIndex(), JSON.stringify(blob), { expirationTtl: RABBI_STAGE_TTL_S });
  return c.json({ ok: true, places: Object.keys(byPlace).length, _ms: Date.now() - t0 });
});

interface RabbiAcademyRosterBlob {
  generatedAt: string;
  // academy enum → slugs
  byAcademy: Record<string, string[]>;
}

app.post('/api/admin/rabbi-compile/academy-roster', async (c) => {
  if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
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
  await cache.put(keyForRabbiAcademyRoster(), JSON.stringify(blob), { expirationTtl: RABBI_STAGE_TTL_S });
  return c.json({ ok: true, academies: Object.keys(byAcademy).length, _ms: Date.now() - t0 });
});

// Read endpoints for the compiled blobs (consumed by the EnrichmentPage and
// later by daf views).
app.get('/api/admin/rabbi-graph', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const hit = await c.env.CACHE.get(keyForRabbiGraph());
  if (!hit) return c.json({ error: 'not compiled' }, 404);
  return c.json(JSON.parse(hit));
});

app.get('/api/admin/rabbi-cohort', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const hit = await c.env.CACHE.get(keyForRabbiCohort());
  if (!hit) return c.json({ error: 'not compiled' }, 404);
  return c.json(JSON.parse(hit));
});

app.get('/api/admin/rabbi-places-index', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const hit = await c.env.CACHE.get(keyForRabbiPlacesIndex());
  if (!hit) return c.json({ error: 'not compiled' }, 404);
  return c.json(JSON.parse(hit));
});

app.get('/api/admin/rabbi-academy-roster', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const hit = await c.env.CACHE.get(keyForRabbiAcademyRoster());
  if (!hit) return c.json({ error: 'not compiled' }, 404);
  return c.json(JSON.parse(hit));
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
    readGeneratedAt(keyForRabbiGraph()),
    readGeneratedAt(keyForRabbiCohort()),
    readGeneratedAt(keyForRabbiPlacesIndex()),
    readGeneratedAt(keyForRabbiAcademyRoster()),
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
  const cacheKey = keyForRegion(tractate, page);
  if (!refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) return c.json({ ...JSON.parse(hit), _cached: true });
  }

  // Pull skeleton (Stage A) — required input.
  const skelRaw = await cache.get(keyForAnalyzeSkeleton(tractate, page));
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

  const cacheKey = keyForMesorah(tractate, page);
  if (!refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) return c.json({ ...JSON.parse(hit), _cached: true });
  }

  const skelRaw = await cache.get(keyForAnalyzeSkeleton(tractate, page));
  if (!skelRaw) {
    return c.json({
      error: 'No cached skeleton; run /api/analyze/.../?skeleton_only=1 first',
    }, 412);
  }
  const skeleton = JSON.parse(skelRaw) as DafSkeleton;

  const graphRaw = await cache.get(keyForRabbiGraph());
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
    const r = await runLLM(c.env, {
      model: '@cf/moonshotai/kimi-k2.5',
      messages: [
        { role: 'system', content: TRANSLATE_BIO_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 16000,
      temperature: 0.1,
      thinking: false,
      response_format: { type: 'json_schema', json_schema: TRANSLATE_BIO_JSON_SCHEMA },
    });
    const payload = r.content.trim() || extractJsonPayload({ response: r.content });
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

// Fetch a single Tanakh pasuk's full Hebrew + English text plus refs to
// the immediately surrounding verses. Used by the sidebar Pasuk panel to
// show the full quoted verse and let the reader step ± through Tanakh.
// Sefaria's /api/texts response carries `next` / `prev` strings — we trust
// those over manually parsing chapter:verse so book boundaries stay correct.
// Read-only view of the Jerusalem Talmud passages parallel to this daf — the
// same cached bundle the `yerushalmi` mark was grounded on (mishnah-mapped, see
// getYerushalmiCached). The reader's Yerushalmi card uses it to show the actual
// parallel text under the differences. He/En are stripped of Sefaria's footnote
// markup so the prose reads clean.
app.get('/api/yerushalmi/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const clean = (s: string): string =>
    stripHtmlServer(
      s.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, '').replace(/<i class="footnote">[\s\S]*?<\/i>/g, ''),
    ).trim();
  const bundle = await getYerushalmiCached(c.env.CACHE, tractate, page);
  return c.json({
    parallels: bundle.map((y) => ({
      ref: y.ref,
      heRef: y.heRef,
      hebrew: clean(y.hebrew),
      english: clean(y.english),
    })),
  });
});

app.get('/api/pasuk', async (c) => {
  const ref = c.req.query('ref') ?? '';
  if (!ref || ref.length > 100) return c.json({ error: 'missing or invalid ref' }, 400);
  const cache = c.env.CACHE;
  const safe = ref.replace(/[^A-Za-z0-9 .:-]/g, '_');
  const key = keyForPasuk(safe);
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

/** Split a string into `{ leading, core, trailing }` whitespace segments.
 *  Callers strip the outer whitespace before hashing / sending to the LLM
 *  (whose response is trimmed) and reattach `leading` + result + `trailing`
 *  on the way out. This matters for the per-slice render path in
 *  HebraizedWithRabbis: each text slice between rabbi-link buttons carries
 *  the single space that sits next to the button, and losing it produces
 *  "Rabbi Amireciting" / "thatRabbi Ami" in rendered prose. */
/** Sanitize the hebraize LLM's output before it is cached or returned. The
 *  model is told to leave English glosses alone and only convert
 *  transliterations, but even a capable model occasionally over-translates a
 *  Form B gloss — turning `מעשה (action)` into `מעשה (מעשה)` or `רבי יהודה
 *  הנשיא (Rabbi Yehuda HaNasi)` into `רבי יהודה הנשיא (רבי יהודה הנשיא)`. Those
 *  show up as visible echoes on the daf. `stripEchoParens` is deterministic
 *  and collapses exactly `X (X)`, so running it here guarantees the model can
 *  never leak an echo regardless of which model is wired in. */
export function sanitizeHebraizeOutput(text: string): string {
  return stripEchoParens(text);
}

export function splitOuterWhitespace(text: string): { leading: string; core: string; trailing: string } {
  if (!text) return { leading: '', core: '', trailing: '' };
  const leading = /^\s*/.exec(text)?.[0] ?? '';
  if (leading.length === text.length) {
    return { leading: text, core: '', trailing: '' };
  }
  const trailing = /\s*$/.exec(text)?.[0] ?? '';
  return {
    leading,
    core: text.slice(leading.length, text.length - trailing.length),
    trailing,
  };
}

app.post('/api/hebraize', async (c) => {
  if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
  let body: { text?: string };
  try { body = await c.req.json() as { text?: string }; }
  catch { return c.json({ error: 'bad json' }, 400); }
  const text = body.text ?? '';
  if (!text) return c.json({ hebraized: '', _empty: true });
  if (text.length > 8000) return c.json({ error: 'text too long (max 8000 chars)' }, 413);

  const { leading, core, trailing } = splitOuterWhitespace(text);
  if (!core) return c.json({ hebraized: text, _empty: true });
  if (!/\([^)]+\)/.test(core)) return c.json({ hebraized: text, _noop: true });

  const cache = c.env.CACHE;
  // Hash the trimmed CORE so slices that differ only in surrounding
  // whitespace share a cache entry. Surrounding whitespace is reattached on
  // every return path below.
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(core));
  const hash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  // v2: bumped when the primary model switched Gemma -> DeepSeek and the
  // echo-strip guard was added. Old v1 entries (which can hold Gemma echoes)
  // are abandoned rather than re-cleaned.
  const key = keyForHebraize(hash);
  if (cache) {
    const hit = await cache.get(key);
    if (hit) return c.json({ hebraized: leading + hit + trailing, _cached: true });
  }

  try {
    const r = await runLLM(c.env, {
      // DeepSeek follows the "only convert transliterations, leave English
      // glosses alone" rule far more reliably than the small Gemma model that
      // used to run here (which over-translated glosses into echoes). Gemma
      // stays as a cheap local fallback if the gateway/OpenRouter is down.
      model: 'openrouter/deepseek/deepseek-v4-flash',
      fallback: ['@cf/google/gemma-4-26b-a4b-it'],
      messages: [
        { role: 'system', content: HEBRAIZE_LLM_SYSTEM_PROMPT },
        { role: 'user', content: core },
      ],
      max_tokens: Math.min(4096, Math.ceil(core.length * 1.5) + 256),
      temperature: 0,
    });
    // Guard the model output: collapse any `X (X)` echo the model emitted so a
    // mistranslated gloss can never reach the cache or the UI (see
    // sanitizeHebraizeOutput).
    const out = sanitizeHebraizeOutput(r.content.trim());
    if (!out) return c.json({ error: 'empty response', text }, 502);
    if (cache) {
      c.executionCtx.waitUntil(cache.put(key, out, { expirationTtl: 60 * 60 * 24 * 365 }));
    }
    return c.json({ hebraized: leading + out + trailing });
  } catch (err) {
    return c.json({ error: String(err).slice(0, 300) }, 502);
  }
});

app.get('/api/admin/rabbi-enriched/:slug', async (c) => {
  if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
  const slug = c.req.param('slug');
  const hit = await c.env.CACHE.get(keyForRabbiEnriched(slug));
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
  const cacheKey = keyForRabbiBioOnDaf(tractate, page, slug, includeNormBio);
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
    (wantBio('unified') || needsUnifiedForRegion) ? cache.get(keyForRabbiEnriched(slug)) : Promise.resolve(null),
    wantBio('wikidata')     ? cache.get(keyForRabbiWikidata(slug))         : Promise.resolve(null),
    wantBio('wiki-bio')     ? cache.get(keyForRabbiWikiBio(slug))         : Promise.resolve(null),
    (wantBio('rabbi-graph') || needsGraphForMesorah) ? cache.get(keyForRabbiGraph()) : Promise.resolve(null),
    wantBio('daf-role')     ? cache.get(keyForAnalyzeSkeleton(tractate, page)) : Promise.resolve(null),
    wantBio('region')       ? cache.get(keyForRegion(tractate, page))    : Promise.resolve(null),
    wantBio('mesorah')      ? cache.get(keyForMesorah(tractate, page))   : Promise.resolve(null),
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
      c.env, '@cf/moonshotai/kimi-k2.5',
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
  const hit = await c.env.CACHE.get(keyForRabbiBioOnDaf(tractate, page, slug));
  if (!hit) return c.json({ error: 'not synthesized' }, 404);
  return c.json(JSON.parse(hit));
});

// ============================================================================
// Admin endpoints for the per-entity-type enrichment Workflows.
// One create + one status endpoint per workflow. Identical shape; the only
// thing that varies is which binding gets invoked.
// ============================================================================

const YOMI_WARM_CRON = '0 3 * * *';

// Mark → per-instance enrichments to warm. Mirrors the client's SECTION_PREFETCH
// (src/client/dafPrefetch.ts) so an adjacent-daf deep-warm lands the exact cache
// keys a reader's cards will later hit. Keep the two in sync.
const DEEP_WARM_PLAN: Record<string, string[]> = {
  argument: ['argument.synthesis'],
  'argument-move': ['argument-move.synthesis', 'argument-move.suggested-questions'],
  pesukim: ['pesukim.synthesis', 'pesukim.suggested-questions'],
  aggadata: ['aggadata.synthesis', 'aggadata.suggested-questions'],
  places: ['places.synthesis'],
  halacha: ['halacha.synthesis'],
  rabbi: ['rabbi.synthesis'],
  rishonim: ['rishonim.synthesis'],
};

/**
 * Evict cached outputs of these enrichments on one daf so the next warm/read
 * regenerates them — the staleness-driven re-warm step. For each enrichment it
 * deletes the whole-daf-instance key (lang-safe — `{fields:{}}` has no
 * lang-varying id) for BOTH languages, plus every per-instance key derived from
 * `def.mark`'s instances. A delete of a non-existent key is a harmless no-op.
 *
 * SCOPE (deliberate, documented): per-instance keys are evicted for EN only,
 * because a section's instance id derives from its `fields.title` and the HE
 * prompt produces a Hebrew title — so the HE per-section key has a different id
 * we can't enumerate from the (EN) `readMarkInstances`. HE per-section entries
 * therefore regenerate on their next read rather than eagerly. Also NOT covered:
 * qualified `.qa` answers (keyed by the user's question — on-demand, not
 * pre-warmed) and KV-defined producers (the cascade is over the code registry).
 * The reader-facing EN cascade — the common edit-a-prompt case — is exact.
 *
 * Run from the queue consumer (not a request); even so, keep cascades bounded —
 * a queue handler is still a Worker invocation with operation limits.
 */
async function evictCascadeEntries(env: Bindings, ids: readonly string[], tractate: string, page: string): Promise<number> {
  const cache = env.CACHE;
  if (!cache) return 0;
  let evicted = 0;
  const wholeIid = await instanceIdOf({ fields: {} });
  for (const id of ids) {
    const def = await loadEnrichmentDef(env, id);
    if (!def) continue;
    const daf = def.scope === 'local' ? { tractate, page } : undefined;
    // Whole-daf instance ({fields:{}}) — id is lang-safe, so evict both langs.
    for (const lang of ['en', 'he'] as const) {
      const key = keyForEnrichment(def, wholeIid, daf, undefined, lang);
      if (key) { await cache.delete(key); evicted++; }
    }
    // Per-section/entity instances — EN only (the HE id derives from the Hebrew
    // title we can't enumerate here; see the doc above).
    for (const inst of await readMarkInstances(env, def.mark, tractate, page).catch(() => [])) {
      const key = keyForEnrichment(def, await instanceIdOf(inst), daf, undefined, 'en');
      if (key) { await cache.delete(key); evicted++; }
    }
  }
  return evicted;
}

/**
 * Comprehensively warm one daf: run its structural marks (cache-respecting,
 * sequentially so we don't spike OpenRouter concurrency from a single job),
 * then fan out a warm job per (instance, enrichment) — skipping any already
 * cached so re-warming a settled daf is just KV reads, not queue churn. Powers
 * /api/warm-daf, which the client fires for the adjacent dapim so navigation
 * lands on a fully-cached page.
 */
async function deepWarmDaf(
  rc: RunCtx,
  tractate: string,
  page: string,
  lang: 'en' | 'he',
  /** When set, only warm enrichments in this set (the re-warm cascade from the
   *  reverse-dependency index). Marks are still run cache-respecting to get
   *  instances, but only when one of their enrichments is wanted. The caller
   *  (`/api/admin/rewarm`) evicts the cascade's entries FIRST, so the normal
   *  cache-skip below finds them missing and regenerates them; unchanged
   *  (non-cascade) dependencies are not evicted and cache-hit. */
  only?: ReadonlySet<string>,
): Promise<{ marks: number; enqueued: number; skipped: number; bridges: number }> {
  const queue = rc.env.ENRICHMENT_QUEUE;
  const cache = rc.env.CACHE;
  if (!queue) return { marks: 0, enqueued: 0, skipped: 0, bridges: 0 };
  let marks = 0, enqueued = 0, skipped = 0;
  const wanted = (eid: string): boolean => !only || only.has(eid);

  for (const [markId, enrichmentIds] of Object.entries(DEEP_WARM_PLAN)) {
    if (!enrichmentIds.some(wanted)) continue; // no cascade enrichment uses this mark
    const markDef = await loadMarkDef(rc.env, markId);
    if (!markDef) continue;
    let instances: unknown[] = [];
    try {
      const res = await runMarkOnce(rc, markDef, tractate, page, false);
      marks++;
      const parsed = res.parsed as { instances?: unknown[] } | null;
      instances = Array.isArray(parsed?.instances) ? parsed.instances : [];
    } catch { continue; }

    for (const inst of instances) {
      for (const enrichmentId of enrichmentIds) {
        if (!wanted(enrichmentId)) continue;
        const def = await loadEnrichmentDef(rc.env, enrichmentId);
        if (!def) continue;
        const iid = await instanceIdOf(inst);
        const key = keyForEnrichment(def, iid, def.scope === 'local' ? { tractate, page } : undefined, undefined, lang);
        if (key && cache && (await cache.get(key))) { skipped++; continue; }
        const runId = `warm:${enrichmentId}:${tractate}:${page}:${iid}:${lang}:${Math.floor(Date.now() / 1000)}`
          .replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 200);
        try {
          await queue.send({ runId, enrichment_id: enrichmentId, tractate, page, mark_input: inst, ...(lang === 'he' ? { lang } : {}) });
          enqueued++;
        } catch { /* best-effort warm */ }
      }
    }
  }

  // Section typing: pre-warm the narrative story view, but ONLY for sections
  // that actually type as narrative (aggadata-primary). The marks are now run +
  // cached above, so the profile composition is a cache-only read. Without this,
  // a reader is the first to trigger argument.narrative on a story section (cold
  // generation); with it, the story view is usually a cache hit.
  try {
    const narrativeDef = wanted('argument.narrative') ? await loadEnrichmentDef(rc.env, 'argument.narrative') : null;
    if (narrativeDef) {
      const profiles = await buildDafTypeProfiles(rc.env, tractate, page);
      const sections = await readMarkInstances(rc.env, 'argument', tractate, page);
      for (const prof of profiles) {
        if (prof.primary !== 'aggadata') continue;
        const sec = sections.find((s) => s.startSegIdx === prof.unit.startSegIdx && s.endSegIdx === prof.unit.endSegIdx);
        if (!sec) continue;
        const iid = await instanceIdOf(sec);
        const key = keyForEnrichment(narrativeDef, iid, { tractate, page }, undefined, lang);
        if (key && cache && (await cache.get(key))) { skipped++; continue; }
        const runId = `warm:argument.narrative:${tractate}:${page}:${iid}:${lang}:${Math.floor(Date.now() / 1000)}`
          .replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 200);
        try {
          await queue.send({ runId, enrichment_id: 'argument.narrative', tractate, page, mark_input: sec, ...(lang === 'he' ? { lang } : {}) });
          enqueued++;
        } catch { /* best-effort warm */ }
      }
    }
  } catch { /* profile composition is best-effort; never block the deep-warm */ }

  // Whole-daf Overview: warm argument-overview.flow (the section-to-section
  // connections) and .synthesis (the daf summary). The flow is what the reader
  // Overview's sugya map stitches into discussions — without it every section
  // shows as its own singleton sugya. The one-time global sweep left gaps and
  // never ran for new daf-yomi dapim, so warm it here. Keyed on the canonical
  // whole-daf instance { fields: {} } to match the client.
  //
  // tidbit.essay is the curated whole-daf "did you notice…" chip. It depends on
  // argument-overview.synthesis (warmed just above) + daf-background.concepts +
  // the source bundle; listed last so its deps are warm/in-flight first (its own
  // dependency resolution still fills any gap and caches it).
  for (const eid of ['argument-overview.flow', 'argument-overview.synthesis', 'tidbit.essay']) {
    if (!wanted(eid)) continue;
    try {
      const def = await loadEnrichmentDef(rc.env, eid);
      if (!def) continue;
      const iid = await instanceIdOf({ fields: {} });
      const key = keyForEnrichment(def, iid, { tractate, page }, undefined, lang);
      if (key && cache && (await cache.get(key))) { skipped++; continue; }
      const runId = `warm:${eid}:${tractate}:${page}:${lang}:${Math.floor(Date.now() / 1000)}`
        .replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 200);
      await queue.send({ runId, enrichment_id: eid, tractate, page, mark_input: { fields: {} }, ...(lang === 'he' ? { lang } : {}) });
      enqueued++;
    } catch { /* best-effort warm */ }
  }

  // Cross-daf bridges (the reader Overview's sugya map): compute + pin this
  // daf's forward bridge and the previous daf's bridge into this one. Both
  // dapim's argument sections are warm (run above / globally), so the bridge
  // verdict resolves and caches instead of leaving the first reader to pay the
  // cold bridge LLM calls. Best-effort — a bridge failure never fails the warm.
  let bridges = 0;
  try {
    const fwd = await computeDafBridge(rc.env, tractate, page);
    if (fwd.via !== 'no-data') bridges++;
    const prev = adjacentAmud(tractate, page, -1);
    if (prev) {
      const back = await computeDafBridge(rc.env, tractate, prev);
      if (back.via !== 'no-data') bridges++;
    }
  } catch { /* bridges are best-effort */ }

  return { marks, enqueued, skipped, bridges };
}

/**
 * Run one queued enrichment job: replay the same logic the synchronous
 * /api/run handler used to do, but write the outcome under
 * `job:{runId}` (for client polling) AND the canonical cache key (so a
 * future direct request hits the cached result without round-tripping the
 * queue).
 *
 * Errors are caught and recorded as `{ status: 'error', error }` rather
 * than rethrown — we don't want the queue to retry indefinitely on a real
 * failure (max_retries=1 in wrangler.toml is the safety net).
 */
async function processEnrichmentJob(env: Bindings, job: JobMessage, ctx: ExecutionContext): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[queue] picked up job', job.runId, '·', job.mark_id ?? job.enrichment_id ?? 'adhoc', job.tractate, job.page);
  const wrapped = wrapEnv(env);
  const cache = wrapped.CACHE;
  if (!cache) {
    // eslint-disable-next-line no-console
    console.error('[queue] CACHE binding missing — cannot write job result');
    return;
  }
  const jobKey = `job:${job.runId}`;
  // Synthesize a RunCtx; the queue consumer doesn't have a real Request, so
  // we use the worker's own origin for any internal self-fetches.
  const rc: RunCtx = {
    env: wrapped,
    url: 'https://localhost/internal',
    ctx,
    lang: job.lang === 'he' ? 'he' : 'en',
  };
  const t0 = Date.now();

  const writeResult = (payload: unknown) =>
    cache.put(jobKey, JSON.stringify(payload), { expirationTtl: 3600 });

  try {
    if (job.warm_deep) {
      const only = job.rewarm_only?.length ? new Set(job.rewarm_only) : undefined;
      // Staleness-driven re-warm: evict the FULL cascade's entries (incl.
      // non-surface members like argument.background) so nothing stale is served,
      // then warm — deepWarmDaf regenerates the deep-warm surface, whose
      // dependency resolution pulls the evicted lower members fresh; the rest
      // regenerate on their next read. Unchanged (non-cascade) deps cache-hit.
      if (only && job.rewarm_only) await evictCascadeEntries(rc.env, job.rewarm_only, job.tractate, job.page);
      const stats = await deepWarmDaf(rc, job.tractate, job.page, rc.lang, only);
      await writeResult({ status: 'ok', result: { kind: 'warm', ...stats, total_ms: Date.now() - t0 } });
      // eslint-disable-next-line no-console
      console.log(`[queue] deep-warm ${job.tractate}/${job.page} lang=${rc.lang} marks=${stats.marks} enqueued=${stats.enqueued} skipped=${stats.skipped} bridges=${stats.bridges}`);
      return;
    }
    if (job.mark_id) {
      const def = await loadMarkDef(wrapped, job.mark_id);
      if (!def) {
        await writeResult({ status: 'error', error: `mark ${job.mark_id} not found` });
        return;
      }
      const result = await runMarkOnce(rc, def, job.tractate, job.page, job.bypass_cache === true);
      await writeResult({
        status: 'ok',
        result: { kind: 'mark', ...result, definition: def, total_ms: Date.now() - t0 },
      });
      recordTelemetry({ env: wrapped, executionCtx: ctx }, runTelemetryRec(job, result, Date.now() - t0));
      return;
    }
    let def: EnrichmentDefinition | null = null;
    if (job.enrichment_id) {
      def = await loadEnrichmentDef(wrapped, job.enrichment_id);
      if (!def) {
        await writeResult({ status: 'error', error: `enrichment ${job.enrichment_id} not found` });
        return;
      }
    } else if (job.ad_hoc) {
      const v = validateEnrichment({ ...(job.ad_hoc as object), id: 'ad-hoc' });
      if (!v.ok) {
        await writeResult({ status: 'error', error: `ad_hoc invalid: ${v.error}` });
        return;
      }
      def = { ...v.spec, source: 'kv', updated_at: new Date().toISOString() };
    } else {
      await writeResult({ status: 'error', error: 'mark_id, enrichment_id, or ad_hoc required' });
      return;
    }
    const result = await runEnrichmentOnce(
      rc, def, job.tractate, job.page, job.mark_input,
      job.bypass_cache === true,
      job.model_override as LLMModelId | undefined,
      undefined,
      job.user_question,
    );
    await writeResult({
      status: 'ok',
      result: { kind: 'enrichment', ...result, definition: def, total_ms: Date.now() - t0 },
    });
    recordTelemetry({ env: wrapped, executionCtx: ctx }, runTelemetryRec(job, result, Date.now() - t0));
  } catch (err) {
    const totalMs = Date.now() - t0;
    // A budget pause is an expected back-pressure outcome, not a failure: write
    // it as a paused result the client poller can surface, and DON'T record it
    // in the recent-errors buffer (it would drown out real failures).
    const paused = isBudgetPaused(err);
    if (paused) {
      const scope = (err as { scope?: BudgetScope }).scope;
      await writeResult({ status: 'error', error: pauseErrorMessage(scope), paused: true, scope, total_ms: totalMs });
      return;
    }
    const errorMsg = String((err as Error)?.message ?? err);
    // eslint-disable-next-line no-console
    console.error('[queue] job failed', job.runId, '·', job.mark_id ?? job.enrichment_id ?? 'adhoc', job.tractate, job.page, '·', errorMsg.slice(0, 500));
    await writeResult({
      status: 'error',
      error: errorMsg,
      total_ms: totalMs,
    });
    const enqueueTs = enqueueTsFromRunId(job.runId);
    await recordRecentJobError(env, {
      runId: job.runId,
      kind: job.mark_id ? 'mark' : job.enrichment_id ? 'enrichment' : 'ad_hoc',
      id: job.mark_id ?? job.enrichment_id,
      tractate: job.tractate,
      page: job.page,
      error: errorMsg.slice(0, 1000),
      totalMs,
      ...(enqueueTs ? { queueWaitMs: t0 - enqueueTs } : {}),
    });
  }
}

export default {
  fetch: (req: Request, env: Bindings, ctx: ExecutionContext) => app.fetch(req, wrapEnv(env), ctx),
  scheduled: (controller: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    const wrapped = wrapEnv(env);
    if (controller.cron === YOMI_WARM_CRON) {
      ctx.waitUntil(runYomiWarmCron(wrapped));
    } else {
      // When a backlog backfill is enabled (KV flag `backfill-backlog:state`),
      // run it INSTEAD of the warm cron this tick so it gets the full
      // per-invocation subrequest budget; warm resumes once the backfill
      // deletes its state key. The check is a single cache.get, so it adds
      // ~nothing when disabled (the common case).
      ctx.waitUntil(
        runBacklogBackfill(wrapped, (n, nHe, g) => enrichRabbi(n, nHe, g as GenerationId))
          .then((r) => (r ? undefined : runWarmCron(wrapped))),
      );
    }
  },
  // Queue consumer — wrangler.toml binds queue=enrichment-jobs to this
  // export. Each message is one /api/run job. max_concurrency=2 caps
  // simultaneous LLM workloads; max_batch_size=1 means one job per
  // invocation (no batching), which keeps memory bounded per worker.
  queue: async (batch: MessageBatch<JobMessage>, env: Bindings, ctx: ExecutionContext): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log('[queue] batch arrived:', batch.messages.length, 'message(s)');
    for (const msg of batch.messages) {
      try {
        await processEnrichmentJob(env, msg.body, ctx);
        msg.ack();
      } catch (err) {
        // Network / KV blip — let the runtime retry once (max_retries=1).
        // eslint-disable-next-line no-console
        console.error('[queue] processEnrichmentJob threw:', err);
        const body = msg.body;
        const errorMsg = String((err as Error)?.message ?? err);
        const enqueueTs = enqueueTsFromRunId(body.runId);
        await recordRecentJobError(env, {
          runId: body.runId,
          kind: body.mark_id ? 'mark' : body.enrichment_id ? 'enrichment' : 'ad_hoc',
          id: body.mark_id ?? body.enrichment_id,
          tractate: body.tractate,
          page: body.page,
          error: `[outer] ${errorMsg}`.slice(0, 1000),
          totalMs: 0,
          ...(enqueueTs ? { queueWaitMs: Date.now() - enqueueTs } : {}),
        });
        msg.retry();
      }
    }
  },
} satisfies ExportedHandler<Bindings, JobMessage>;
