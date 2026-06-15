import { slugTractate } from '@corpus/core/cache/keys';
import { continuationLink, type FlowEdge } from '@corpus/core/context/link';
import { coordLabel } from '@corpus/core/context/types';
import { gatewayActive, gatewayStatus, wrapEnv } from '@corpus/core/llm/ai-gateway';
import {
  type BudgetScope,
  budgetStatus,
  checkBudget,
  clearPauses,
  isBudgetPaused,
} from '@corpus/core/llm/budget';
import {
  type CostAttribution,
  type LLMModelId,
  type LLMResult,
  type LLMUsage,
  runLLM,
} from '@corpus/core/llm/llm';
import { costSplitUsd, normalizeUsage, costUsd as priceCostUsd } from '@corpus/core/llm/pricing';
import {
  DEFAULT_FALLBACK_CHAIN,
  DEFAULT_MODEL,
  isLLMModelId,
  MODEL_PRESETS,
} from '@corpus/core/llm/settings';
import { rawDependenciesOf } from '@corpus/core/model/compat';
import type { Authority } from '@corpus/core/model/provenance';
import {
  forwardSubgraph,
  producerNodesFrom,
  reverseDependencyIndex,
  transitiveDependents,
} from '@corpus/core/registry/depGraph';
import {
  type ResolvedInputs,
  type ResolveInputsPorts,
  resolveInputs,
} from '@corpus/core/run/producer-run';
import {
  provenanceInputRefs,
  type RunProducerPorts,
  runProducer,
} from '@corpus/core/run/run-producer';
import { ArtifactStore, type KVStore, type Staleness } from '@corpus/core/store/artifact-store';
import { authorityOf, type StoredArtifact } from '@corpus/core/store/envelope';
import { producerKeyInfo, talmudLegacyKeyScheme } from '@corpus/core/store/key-schemes';
import { Hono } from 'hono';
import {
  GENERATION_IDS,
  GENERATIONS_PROMPT_REFERENCE,
  type GenerationId,
} from '../client/generations';
import { stripEchoParens } from '../client/hebraize';
import { dedupeBy, dedupeByRange, type MoveLike, selectSectionMoves } from '../lib/argumentMoves';
import { runPasses } from '../lib/check/passes';
import type { MatchInput } from '../lib/context/anchor/ai-prompt';
import { type DafLink, dafLinks } from '../lib/context/dafLinks';
import { talmudParallelsToLinks, yerushalmiToLinks } from '../lib/context/parallels';
import { dafSpine } from '../lib/context/spine';
import { spineLinks } from '../lib/context/spineLinks';
import { buildGeoModel, type GeoEnrichment, type RabbiGeoSource } from '../lib/geographyModel';
import { buildDerivation } from '../lib/halacha/codifiers';
import {
  buildRabbiEnrichUserMessage,
  type LocalRabbiInput,
  RABBI_ENRICH_SYSTEM_PROMPT,
  type SefariaInput,
} from '../lib/rabbi/prompt';
import {
  type EnrichedRabbi as EnrichedRabbiRecord,
  type LLMRabbiOutput,
  SCHEMA_VERSION as RABBI_SCHEMA_VERSION,
  validateLLMRabbiOutput,
} from '../lib/rabbi/types';
import type { EntityPiece } from '../lib/registry/entity';
import { adjacentAmud, sefariaAPI, type TalmudPageData, TRACTATE_OPTIONS } from '../lib/sefref';
import { iterAmudim, TRACTATE_END_AMUD } from '../lib/sefref/amudim';
import { getDafyomiMasechet } from '../lib/sefref/dafyomi/masechtos';
import { fetchHebrewBooksDaf } from '../lib/sefref/hebrewbooks/client';
import {
  type BridgeSection,
  buildBridgePrompt,
  type DafBridge,
  edgeOfTractateBridge,
  hadranBridge,
  llmBridge,
} from '../lib/typing/bridge';
import {
  buildCrossFlowPrompt,
  type CrossFlow,
  type CrossFlowEdge,
  type CrossFlowSection,
  crossFlowToLinks,
  parseCrossFlowEdges,
} from '../lib/typing/crossFlow';
import { findHadranSegments, findMarkers } from '../lib/typing/markers';
import {
  composeTypeProfile,
  type LayerId,
  type LayerInstance,
  sectionHasNamedSpeaker,
  type TypeProfile,
  type UnitRange,
} from '../lib/typing/profile';
import {
  alignOutlineToSegments,
  flattenYerushalmiOutline,
  type YerushalmiFloorGroup,
} from '../lib/yerushalmiAlign';
import { type CuratedYerushalmiParallel, curatedParallelsForDaf } from '../lib/yerushalmiParallels';
import { fetchGatewayCost } from './aigw-analytics';
import { runBacklogBackfill } from './backfill-backlog';
import { gcStaleCache } from './cache-gc';
import {
  instanceIdOf,
  keyForAnalyzeSkeleton,
  keyForBridge,
  keyForCommentaries,
  keyForCrossFlow,
  keyForCtxMatch,
  keyForDafIndexDone,
  keyForEnrichment,
  keyForGemara,
  keyForHebraize,
  keyForMark,
  keyForMesorah,
  keyForPasuk,
  keyForRabbiAcademyRoster,
  keyForRabbiBioBySlug,
  keyForRabbiBioOnDaf,
  keyForRabbiCohort,
  keyForRabbiEnriched,
  keyForRabbiGraph,
  keyForRabbiObs,
  keyForRabbiObsDirty,
  keyForRabbiPlacesIndex,
  keyForRabbiWikiBio,
  keyForRabbiWikidata,
  keyForReferences,
  keyForRegion,
  keyForSpineLinks,
  keyForTranslate,
  prefixForDafIndex,
  prefixForRabbiObs,
  qualifierHash,
  recipeHash,
} from './cache-keys';
import {
  cacheGcTargets,
  computeCacheStats,
  isFresh,
  readCachedCacheStats,
  writeCachedCacheStats,
} from './cache-stats';
import { fetchZoneActivity } from './cf-zone-analytics';
import { CODE_ENRICHMENTS, CODE_MARKS, findCodeEnrichment, findCodeMark } from './code-marks';
import { fetchCommentaryWorks, registerCommentaryRoutes } from './commentary';
import { aiMatchToSegments } from './context-match';
import { collectContext, type SourceTiming } from './context-providers';
import { dafCostReport } from './daf-cost';
import { recordEnrichmentDafIndex, recordMarkDafIndex } from './daf-index';
import { getRabbiEntryOr404, readJsonBody } from './http-helpers';
import {
  aggregateProbes,
  type DafIndexEntryMeta,
  type DafRunRow,
  dafRunsFromIndex,
  type InspectEntry,
  inspectorCostOf,
  type ProbeAggregate,
  type ProducerSpec,
  probeInstances,
  tokensOfEntry,
} from './inspect';
import {
  type AnchorGroup,
  type AnchorPiece,
  type AnchorRef,
  anchorRefOf,
  groupByAnchor,
  WHOLE_DAF_ANCHOR,
} from './inspect-anchors';
import { noteLintAttempt, readLintFailures } from './lint-failures';
import { ALIGN_MARKS } from './mark-categories';
import {
  ARGUMENT_BRIDGE_OUTPUT_SCHEMA,
  ARGUMENT_CROSS_FLOW_OUTPUT_SCHEMA,
  ENRICH_JSON_SCHEMA,
  TRANSLATE_BIO_JSON_SCHEMA,
} from './output-schemas';
import {
  adaptCodeEnrichment,
  listProducers,
  loadEnrichmentDef,
  loadMarkDef,
} from './producer-registry';
import {
  groundRabbiInstances,
  groundRabbiNames,
  lookupRelationships,
  lookupRelationshipsBySlug,
  type RelationshipsData,
} from './rabbi-graph';
import {
  buildObservationSlices,
  normalizeForMatch,
  type ObservationSlice,
  type RangeItem,
  type ResolvedPlace,
  type ResolvedRabbi,
  resolveSegIdxs,
} from './rabbi-observations';
import {
  type Movement,
  RABBI_PLACES,
  type RabbiPlacesEntry,
  resolveRabbi,
  resolveRabbiByName,
} from './rabbi-places';
import { placeRevachWithAi } from './revach-ai-place';
import { buildSourceResolvers, type CommentariesSlice, type GemaraSlice } from './run-sources';
import {
  type CacheTrack,
  getCodeSourcesCached,
  getDafyomiContentCached,
  getHebrewBooksDafCached,
  getMishnaBundleCached,
  getRishonimCached,
  getSefariaPageCached,
  getSefariaSegmentsCached,
  getTalmudParallelsCached,
  getYerushalmiCached,
  readCachedTalmudParallels,
  readCachedYerushalmi,
  type SefariaSegments,
} from './source-cache';
import { computeCoverage, isKnownTractate } from './spine-coverage';
import {
  deleteEnrichment,
  deleteMark,
  type EnrichmentDefinition,
  listEnrichments,
  listMarks,
  readEnrichment,
  readMark,
  validateEnrichment,
  validateMark,
  writeEnrichment,
  writeMark,
} from './studio-registry';
import type {
  EnrichmentDependency,
  LLMExtractor,
  MarkDependency,
  EnrichmentDefinition as SchemaEnrichmentDefinition,
  MarkDefinition as SchemaMarkDefinition,
} from './studio-schema';
import { classifyError, recordTelemetry, runTelemetryRec, type TelemetryRecord } from './telemetry';
import type { Bindings, JobMessage } from './types';
import {
  listObservedConcepts,
  listObservedPlaces,
  listUnknownRabbis,
  recordObservedConcept,
  recordObservedPlace,
  recordUnknownRabbi,
} from './unknown-registry';
import { readUsageSummary, recordUsage } from './usage-rollup';
import {
  getWarmTotal,
  readSefariaWarmCursor,
  readWarmCursor,
  runWarmCron,
  sefariaWarmProgressProcessed,
  warmProgressProcessed,
} from './warm-cron';
import { lookupGloss } from './word-glosses';
import { runYomiWarmCron } from './yomi-cron';

// `Bindings` and `JobMessage` now live in ./types (a neutral module so route
// slices / telemetry / crons can import them without cycling through this entry
// file). Both are imported at the top of this file.

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
function isTrustedRequest(c: {
  req: { header: (k: string) => string | undefined };
  env: Bindings;
}): boolean {
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
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
      } catch {
        /* fall through to live fetch */
      }
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
      const cached = {
        ref: canonical,
        heRef: res.heRef ?? null,
        he,
        en,
        prevRef,
        nextRef,
        book: res.book ?? null,
      };
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
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  } | null;
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

interface KimiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function runKimiStreaming(
  env: Bindings,
  modelId: string,
  messages: KimiMessage[],
  maxTokens: number,
  opts?: {
    temperature?: number;
    chatTemplateKwargs?: { enable_thinking?: boolean };
    responseFormat?: unknown;
    tag?: string;
    attribution?: CostAttribution;
  },
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
    response_format: opts?.responseFormat as
      | { type: 'json_schema'; json_schema: unknown }
      | undefined,
    stream: true,
    tag: opts?.tag,
    attribution: opts?.attribution,
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
          {
            method,
            headers,
            body: body == null || method === 'GET' ? undefined : JSON.stringify(body),
          },
          c.env,
        );
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
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
        { role: 'user', content: `Ping${nonce ? ` ${nonce}` : ''}.` },
      ],
      max_tokens: 16,
      temperature: 0,
      tag: 'gateway-test',
      attribution: { kind: 'other', producerId: 'gateway-test' },
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
      source: isLLMModelId(fromEnv)
        ? 'env (wrangler.toml DEFAULT_LLM_MODEL)'
        : 'code (settings.ts)',
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
  const merged = [...CODE_MARKS.filter((m) => !kvIds.has(m.id)), ...kv];
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
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const v = validateMark({ ...(body as object), id: c.req.param('id') });
  if (!v.ok) return c.json({ error: v.error }, 400);
  const saved = await writeMark(c.env, v.spec);
  return c.json({ mark: saved });
});
app.delete('/api/marks/:id', async (c) => {
  await deleteMark(c.env, c.req.param('id'));
  return c.json({ ok: true });
});

// Read-only "marks anchored on this daf" for the alignment workbench. For each
// gutter mark kind it returns the ALREADY-CACHED instances (segment anchors) +
// the run metadata (cache_hit / elapsed_ms / cost / recipe_hash) straight off
// the cached RunResult. NO generation, NO cache write, NO LLM spend — an
// uncached mark just reports `cached:false`. Two path params, so it never
// collides with the single-param `/api/marks/:id` definition route above.
// Segment-anchored gutter marks (instances carry startSegIdx/endSegIdx).
function instanceLabel(fields: Record<string, unknown> | undefined): string {
  const f = fields ?? {};
  for (const k of ['title', 'topic', 'theme', 'caption', 'verseRef', 'summary']) {
    const v = f[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
app.get('/api/marks/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const lang: 'en' | 'he' = c.req.query('lang') === 'he' ? 'he' : 'en';
  const marks = [] as unknown[];
  const metaOf = (hit: RunResult | null) =>
    hit
      ? {
          cache_hit: hit.cache_hit,
          elapsed_ms: hit.elapsed_ms,
          model: hit.model,
          recipe_hash: hit.recipe_hash ?? null,
          cost: hit.cost ?? null,
        }
      : null;
  // One loop over the DERIVED alignment-mark list (ALIGN_MARKS, from CODE_MARKS
  // by anchor) — segment, name, AND whole-daf computed marks. Deriving it means
  // a newly added mark can't be silently dropped from the workbench/MCP
  // (geography once was); the coverage test pins it.
  for (const am of ALIGN_MARKS) {
    const def = findCodeMark(am.id);
    if (!def) continue;
    const hit = await readCachedResult(c.env, keyForMark(def, tractate, page, lang));
    const parsed = hit?.parsed as { instances?: unknown } | null;
    const base = {
      id: am.id,
      kind: am.kind,
      label: def.label ?? am.id,
      cached: !!hit,
      meta: metaOf(hit),
    };
    if (am.anchorBy === 'segment') {
      const raw = Array.isArray(parsed?.instances) ? (parsed!.instances as RawInstance[]) : [];
      const instances = raw
        .filter((i) => typeof i.startSegIdx === 'number' && typeof i.endSegIdx === 'number')
        .map((i) => ({
          startSegIdx: i.startSegIdx as number,
          endSegIdx: i.endSegIdx as number,
          label: instanceLabel(i.fields),
        }));
      marks.push({ ...base, anchorBy: 'segment', instances });
    } else if (am.anchorBy === 'name') {
      const raw = Array.isArray(parsed?.instances)
        ? (parsed!.instances as { excerpt?: unknown; fields?: Record<string, unknown> }[])
        : [];
      const instances = raw
        .map((i) => ({
          name: str(i.fields?.name),
          nameHe: str(i.fields?.nameHe),
          generation: str(i.fields?.generation),
          excerpt: str(i.excerpt),
        }))
        .filter((x) => x.nameHe || x.name);
      marks.push({ ...base, anchorBy: 'name', instances });
    } else {
      // whole-daf: a computed daf-level mark (geography, daf-background, tidbit,
      // biyun, argument-overview). No span/name instances — the workbench
      // anchors it to the whole spine.
      marks.push({ ...base, anchorBy: 'whole-daf', instances: [] });
    }
  }
  return c.json({ tractate, page, lang, marks });
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
    if (!hit || hit.parsed == null) {
      results.push({ mark_id: def.id, cached: false, issues: [] });
      continue;
    }
    // Clone so the idempotent transform re-runs don't mutate the cached object.
    const { issues } = await runPasses(def.passes ?? [], structuredClone(hit.parsed), {
      tractate,
      page,
      segmentsHe: slice.segments_he,
      defId: def.id,
      lang,
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
async function readMarkInstances(
  env: Bindings,
  markId: string,
  tractate: string,
  page: string,
): Promise<RawInstance[]> {
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
    const id =
      (typeof f.title === 'string' && f.title) ||
      (typeof f.topic === 'string' && f.topic) ||
      (typeof f.theme === 'string' && f.theme) ||
      (typeof f.excerpt === 'string' && f.excerpt) ||
      String(idx);
    out.push({ layer, instanceId: id, startSegIdx: i.startSegIdx, endSegIdx: i.endSegIdx });
  });
  return out;
}
async function buildDafTypeProfiles(
  env: Bindings,
  tractate: string,
  page: string,
): Promise<(TypeProfile & { title?: string })[]> {
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
  for (const m of mishnaBundle)
    for (let s = m.anchorStartSeg; s <= m.anchorEndSeg; s++) mishnaSegs.add(s);
  const voicesDef = findCodeEnrichment('argument.voices');
  const profiles: (TypeProfile & { title?: string })[] = [];
  for (const sec of sections) {
    if (typeof sec.startSegIdx !== 'number' || typeof sec.endSegIdx !== 'number') continue;
    const unit: UnitRange = {
      tractate,
      page,
      startSegIdx: sec.startSegIdx,
      endSegIdx: sec.endSegIdx,
    };
    let voices: { edges?: { kind?: string }[] } | null = null;
    if (voicesDef) {
      const iid = await instanceIdOf(sec);
      const vhit = await readCachedResult(
        env,
        keyForEnrichment(voicesDef, iid, { tractate, page }),
      );
      voices = (vhit?.parsed as { edges?: { kind?: string }[] }) ?? null;
    }
    // When the move mark isn't cached yet (`moves` empty), we can't tell named
    // from anonymous — pass `undefined` so composeTypeProfile stays permissive
    // (unknown → not suppressed) rather than mislabel a cold daf's real dispute
    // as anonymous. Only with moves actually loaded does an empty section mean
    // "no named speaker".
    const hasNamedSpeaker =
      moves.length > 0 ? sectionHasNamedSpeaker(moves, sec.startSegIdx, sec.endSegIdx) : undefined;
    profiles.push({
      ...composeTypeProfile(unit, overlays, { voices, mishnaSegs, hasNamedSpeaker }),
      title: typeof sec.fields?.title === 'string' ? sec.fields.title : undefined,
    });
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
  if (cache) {
    const c = await cache.get(key);
    if (c) {
      try {
        return JSON.parse(c) as DafBridge;
      } catch {
        /* recompute */
      }
    }
  }

  // Deterministic: a Hadran in the daf's final segment(s) closes the perek.
  const slice = await getGemaraSlice(env, tractate, page, false);
  const hadran = findHadranSegments(slice.segments_he);
  const endsWithHadran =
    hadran.length > 0 && hadran[hadran.length - 1] >= slice.segments_he.length - 2;
  let bridge = hadranBridge(from, to, endsWithHadran);

  if (!bridge) {
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const numSeg = (i: RawInstance) => (typeof i.startSegIdx === 'number' ? i.startSegIdx : -1);
    const prev = (await readMarkInstances(env, 'argument', tractate, page)).filter(
      (i) => numSeg(i) >= 0,
    );
    const next = (await readMarkInstances(env, 'argument', tractate, nextPage)).filter(
      (i) => numSeg(i) >= 0,
    );
    const prevLast = prev.length ? prev.reduce((a, b) => (numSeg(b) > numSeg(a) ? b : a)) : null;
    const nextFirst = next.length ? next.reduce((a, b) => (numSeg(b) < numSeg(a) ? b : a)) : null;
    if (!prevLast || !nextFirst) {
      bridge = {
        from,
        to,
        continues: false,
        kind: 'new-topic',
        via: 'no-data',
        note: 'argument sections not warmed for both dapim',
      };
    } else {
      const prevSec: BridgeSection = {
        title: str(prevLast.fields?.title),
        summary: str(prevLast.fields?.summary),
        excerpt: str(prevLast.fields?.endExcerpt) || str(prevLast.fields?.excerpt),
      };
      const nextSec: BridgeSection = {
        title: str(nextFirst.fields?.title),
        summary: str(nextFirst.fields?.summary),
        excerpt: str(nextFirst.fields?.excerpt),
      };
      try {
        const res = await runLLM(env, {
          model: 'openrouter/deepseek/deepseek-v4-flash' as LLMModelId,
          messages: [
            {
              role: 'system',
              content:
                'You are a Talmud scholar judging whether a sugya continues across a daf boundary.',
            },
            { role: 'user', content: buildBridgePrompt(prevSec, nextSec) },
          ],
          max_tokens: 1500,
          temperature: 0.2,
          response_format: { type: 'json_schema', json_schema: ARGUMENT_BRIDGE_OUTPUT_SCHEMA },
          thinking: false,
          tag: 'argument-overview.bridge',
          attribution: { kind: 'bridge', producerId: 'argument-overview.bridge', tractate, page },
        });
        let verdict: { continues?: unknown; note?: unknown } = {};
        try {
          verdict = JSON.parse(res.content);
        } catch {
          /* fall through */
        }
        bridge = llmBridge(from, to, verdict);
      } catch {
        bridge = {
          from,
          to,
          continues: false,
          kind: 'new-topic',
          via: 'no-data',
          note: 'bridge LLM unavailable',
        };
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
async function readFlowConnections(
  env: Bindings,
  tractate: string,
  page: string,
): Promise<FlowEdge[]> {
  try {
    const def = await loadEnrichmentDef(env, 'argument-overview.flow');
    if (!def) return [];
    const iid = await instanceIdOf({ fields: {} });
    const hit = await readCachedResult(env, keyForEnrichment(def, iid, { tractate, page }));
    const conns = (hit?.parsed as { connections?: unknown } | null)?.connections;
    if (!Array.isArray(conns)) return [];
    return (conns as Array<Record<string, unknown>>)
      .filter(
        (c) => typeof c.from === 'number' && typeof c.to === 'number' && typeof c.kind === 'string',
      )
      .map((c) => ({ from: c.from as number, to: c.to as number, kind: c.kind as string }));
  } catch {
    return [];
  }
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
  const sectionInstances = await readMarkInstances(c.env, 'argument', tractate, page).catch(
    () => [],
  );
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
  // Talmud↔Talmud parallels (Mesorat HaShas): deterministic, from Sefaria's
  // apparatus. Fetch-on-miss + cache, like the other source bundles above.
  const talmudParallels = await getTalmudParallelsCached(c.env.CACHE, tractate, page).catch(
    () => [],
  );
  // Jerusalem Talmud parallels (cross-corpus): the `yerushalmi` mark's
  // shared-mishnah bundle, projected into 'parallels' links. Fetch-on-miss.
  const yerushalmi = await getYerushalmiCached(c.env.CACHE, tractate, page).catch(() => []);

  const links = dafLinks(daf, {
    continuesTo: bridge?.continues ? bridge.to : null,
    items,
    flowEdges,
    sectionStartSegs,
    commentaryWorks,
    talmudParallels,
    yerushalmi,
  });
  return c.json({ tractate, page, count: links.length, links });
});

/** Producer nodes over the LIVE registry (KV-over-code via listProducers), so
 *  cascades and dependents reflect Studio-defined or KV-overridden producers,
 *  not just the code defs. Falls back to the code registry on a KV failure. */
async function liveProducerNodes(env: Bindings) {
  try {
    const producers = await listProducers(env);
    return producerNodesFrom(
      producers.map((p) => ({ id: p.id, dependencies: rawDependenciesOf(p) })),
    );
  } catch (err) {
    console.error('[dep-graph] live registry read failed; using code defs:', err);
    return producerNodesFrom([...CODE_MARKS, ...CODE_ENRICHMENTS]);
  }
}

// Reverse-dependency index over the producer graph: "if `id` (a producer or a
// source input like 'gemara') changes, what must re-warm?" Computes the cascade
// that is otherwise reasoned about by hand when bumping a cache_version — e.g.
// bumping argument.background returns argument.synthesis (which depends on it)
// and everything downstream. Read-only over the LIVE registry (KV wins).
app.get('/api/dependents/:id', async (c) => {
  const id = c.req.param('id');
  const nodes = await liveProducerNodes(c.env);
  const rev = reverseDependencyIndex(nodes);
  const direct = [...(rev.get(id) ?? [])].sort();
  const transitive = [...transitiveDependents(rev, id)].sort();
  return c.json({ id, direct, transitive, count: transitive.length });
});

// Spine coverage — "which pieces of a whole tractate have been computed yet?"
// A read-only exploration map over the global spine: enumerates every daf of the
// tractate and, by listing KV keys, reports which producers already have a cached
// piece for each. Computes nothing, mutates nothing. Powers the #spine page.
app.get('/api/spine-coverage/:tractate', async (c) => {
  const tractate = c.req.param('tractate');
  if (!isKnownTractate(tractate)) {
    return c.json({ error: `unknown tractate: ${tractate}` }, 404);
  }
  if (!c.env.CACHE) {
    return c.json({ error: 'no CACHE binding in this environment' }, 503);
  }
  const report = await computeCoverage(c.env.CACHE, tractate);
  return c.json(report);
});

// Read-only continuity verdict for a daf, or null if not yet computed. Unlike
// computeDafBridge (which falls through to an LLM call on a cold cache), this
// NEVER triggers compute — the spine aggregator reads across a whole tractate
// and must not fan out 100+ LLM calls / spend. A cold bridge just leaves a gap
// in the backbone, which fills in as bridges get warmed.
async function readCachedBridge(
  env: Bindings,
  tractate: string,
  page: string,
): Promise<DafBridge | null> {
  if (!env.CACHE) return null;
  const c = await env.CACHE.get(keyForBridge(tractate, page));
  if (!c) return null;
  try {
    return JSON.parse(c) as DafBridge;
  } catch {
    return null;
  }
}

// Read-only cross-daf flow for a daf (the section-level edges into the next
// daf), or null if not yet computed. Like readCachedBridge: never triggers the
// LLM — the tractate sweep only reads what has already been computed.
async function readCachedCrossFlow(
  env: Bindings,
  tractate: string,
  page: string,
): Promise<CrossFlow | null> {
  if (!env.CACHE) return null;
  const c = await env.CACHE.get(keyForCrossFlow(tractate, page));
  if (!c) return null;
  try {
    return JSON.parse(c) as CrossFlow;
  } catch {
    return null;
  }
}

// Argument sections of a daf in reading order, with the parallel startSegIdx
// list (so a section index resolves to a coordinate). Read-only.
async function readSortedSections(
  env: Bindings,
  tractate: string,
  page: string,
): Promise<{ startSegs: number[]; sections: CrossFlowSection[] }> {
  const insts = await readMarkInstances(env, 'argument', tractate, page).catch(() => []);
  const rows = insts
    .filter((i) => typeof i.startSegIdx === 'number')
    .map((i) => ({
      start: i.startSegIdx as number,
      title: typeof i.fields?.title === 'string' ? i.fields.title : undefined,
      summary: typeof i.fields?.summary === 'string' ? i.fields.summary : undefined,
    }))
    .sort((a, b) => a.start - b.start);
  return {
    startSegs: rows.map((r) => r.start),
    sections: rows.map((r) => ({ title: r.title, summary: r.summary })),
  };
}

// Each argument section's rabbis, in reading order — sourced from the per-section
// argument.voices enrichment (the only piece that ties a rabbi to a SECTION),
// then RESOLVED registry-first with relational homonym disambiguation
// (resolveRabbiSlug). A voice is kept ONLY if it resolves to a real rabbi: this
// drops anonymous/collective labels ("Stam", "Western sages", "First answer")
// AND ambiguous homonyms we can't pin from the daf's cast (e.g. which Rav
// Kahana), and unifies spelling variants onto one canonical slug so tracing is
// exact. The chip shows the registry's canonical name. Read-only; cold → [].
interface SectionRabbi {
  slug: string;
  name: string;
}
async function readSectionRabbis(
  env: Bindings,
  tractate: string,
  page: string,
): Promise<{ start: number; title: string; rabbis: SectionRabbi[] }[]> {
  const insts = await readMarkInstances(env, 'argument', tractate, page).catch(() => []);
  const voicesDef = findCodeEnrichment('argument.voices');
  // The daf's full rabbi cast (from the rabbi mark): names supply the relational
  // CONTEXT for homonym disambiguation (the Rav Kahana next to Rav resolves to
  // the Kahana whose registry edges include Rav), and each carries a generation
  // hint used only as a last-resort tiebreaker.
  const coRabbis: string[] = [];
  const genHint = new Map<string, { nameHe?: string; generation?: string }>();
  for (const ri of await readMarkInstances(env, 'rabbi', tractate, page).catch(() => [])) {
    const f = ri.fields ?? {};
    const nm = typeof f.name === 'string' ? f.name.trim() : '';
    if (!nm) continue;
    if (!coRabbis.includes(nm)) coRabbis.push(nm);
    const key = nm.toLowerCase();
    if (!genHint.has(key))
      genHint.set(key, {
        nameHe: typeof f.nameHe === 'string' ? f.nameHe : undefined,
        generation: typeof f.generation === 'string' ? f.generation : undefined,
      });
  }
  const rows: { start: number; title: string; rabbis: SectionRabbi[] }[] = [];
  for (const inst of insts) {
    if (typeof inst.startSegIdx !== 'number') continue;
    const rabbis: SectionRabbi[] = [];
    if (voicesDef) {
      const iid = await instanceIdOf(inst);
      const vhit = await readCachedResult(
        env,
        keyForEnrichment(voicesDef, iid, { tractate, page }),
      );
      const voices = (vhit?.parsed as { voices?: { name?: unknown; nameHe?: unknown }[] } | null)
        ?.voices;
      if (Array.isArray(voices)) {
        // Same registry-first + relational resolver as the direct rabbi mark,
        // with the daf's cast as relational context (groundRabbiNames). A voice
        // is kept only if it resolves; the chip shows the canonical name.
        const items = voices
          .map((v) => ({
            name: typeof v.name === 'string' ? v.name.trim() : '',
            he: typeof v.nameHe === 'string' ? v.nameHe : undefined,
          }))
          .filter((v) => v.name)
          .map((v) => ({
            name: v.name,
            nameHe: v.he ?? genHint.get(v.name.toLowerCase())?.nameHe,
            generation: genHint.get(v.name.toLowerCase())?.generation,
          }));
        const seen = new Set<string>();
        for (const g of groundRabbiNames(items, coRabbis)) {
          if (!g.slug || seen.has(g.slug)) continue; // drop unresolved/ambiguous + dupes
          seen.add(g.slug);
          rabbis.push({ slug: g.slug, name: g.canonical ?? g.name });
        }
      }
    }
    rows.push({
      start: inst.startSegIdx as number,
      title: typeof inst.fields?.title === 'string' ? inst.fields.title : '',
      rabbis,
    });
  }
  return rows.sort((a, b) => a.start - b.start);
}

// One daf's READ-ONLY parts for the spine sweep: the within-daf links (flow +
// continuity bridge), its section startSegs (so cross-flow edges from the
// PREVIOUS daf can resolve into it), and its cached cross-daf edges into the
// next daf. No compute — same dafLinks() the per-daf /api/links uses, minus the
// live context pool + commentary (not cached per daf; deferred).
interface DafParts {
  withinLinks: DafLink[];
  startSegs: number[];
  crossEdges: CrossFlowEdge[];
}
async function readDafParts(env: Bindings, tractate: string, page: string): Promise<DafParts> {
  const { startSegs } = await readSortedSections(env, tractate, page);
  const flowEdges = await readFlowConnections(env, tractate, page);
  const bridge = await readCachedBridge(env, tractate, page);
  const cross = await readCachedCrossFlow(env, tractate, page);
  const talmudParallels = (await readCachedTalmudParallels(env.CACHE, tractate, page)) ?? [];
  const yerushalmi = await readCachedYerushalmi(env.CACHE, tractate, page);
  const withinLinks = dafLinks(
    { tractate, page },
    {
      continuesTo: bridge?.continues ? bridge.to : null,
      items: [],
      flowEdges,
      sectionStartSegs: startSegs,
      commentaryWorks: [],
      talmudParallels,
      yerushalmi,
    },
  );
  return { withinLinks, startSegs, crossEdges: cross?.edges ?? [] };
}

// Cross-daf argument flow producer: the section-level, relation-typed successor
// to the boolean bridge (Stage 1 of the global spine). Bespoke (two-daf input
// doesn't fit the single-daf dependency model — same reason computeDafBridge is
// bespoke); should converge with the bridge into a cross-daf-aware registry
// producer later. Budget-gated at the runLLM chokepoint; precision over recall.
async function computeCrossFlow(env: Bindings, tractate: string, page: string): Promise<CrossFlow> {
  const from = { tractate, page };
  const nextPage = adjacentAmud(tractate, page, 1);
  if (!nextPage) return { from, to: null, edges: [], via: 'edge-of-tractate' };
  const to = { tractate, page: nextPage };
  const key = keyForCrossFlow(tractate, page);
  if (env.CACHE) {
    const c = await env.CACHE.get(key);
    if (c) {
      try {
        return JSON.parse(c) as CrossFlow;
      } catch {
        /* recompute */
      }
    }
  }

  const a = await readSortedSections(env, tractate, page);
  const b = await readSortedSections(env, tractate, nextPage);
  if (a.sections.length === 0 || b.sections.length === 0) {
    return { from, to, edges: [], via: 'no-data' }; // don't pin — retry once both dapim are warmed
  }

  let via: CrossFlow['via'] = 'llm';
  let edges: CrossFlowEdge[] = [];
  try {
    const res = await runLLM(env, {
      model: 'openrouter/deepseek/deepseek-v4-flash' as LLMModelId,
      messages: [
        {
          role: 'system',
          content:
            'You are a Talmud scholar mapping how the argument of one daf connects to the next. Precision over recall: most section pairs have no edge.',
        },
        { role: 'user', content: buildCrossFlowPrompt(from, to, a.sections, b.sections) },
      ],
      max_tokens: 1500,
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: ARGUMENT_CROSS_FLOW_OUTPUT_SCHEMA },
      thinking: false,
      tag: 'argument-overview.cross-flow',
      attribution: {
        kind: 'cross-flow',
        producerId: 'argument-overview.cross-flow',
        tractate,
        page,
      },
    });
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(res.content);
    } catch {
      /* leave empty */
    }
    edges = parseCrossFlowEdges(parsed, a.sections.length, b.sections.length);
  } catch {
    via = 'no-data';
  }
  const result: CrossFlow = { from, to, edges, via };
  if (env.CACHE && via !== 'no-data') await env.CACHE.put(key, JSON.stringify(result));
  return result;
}

// Connect ONE daf boundary (page -> next daf): compute + pin BOTH the
// daf-continuity bridge and the section-level cross-flow. Both compute fns are
// cache-respecting and never pin a no-data verdict, so this is idempotent and
// self-healing — a boundary whose two dapim aren't both warm yet stays unpinned
// and retries on a later call. The single shared step behind the read-triggered
// deep warm (deepWarmDaf) and the cron connect sweep (runConnectSweep), so the
// cross-daf layer fills in the same way the within-daf flow already does.
// Budget-gated at the runLLM chokepoint; best-effort (a failure connects
// nothing rather than throwing).
async function connectBoundary(
  env: Bindings,
  tractate: string,
  page: string,
): Promise<{ bridge: boolean; cross: boolean }> {
  let bridge = false;
  let cross = false;
  try {
    const b = await computeDafBridge(env, tractate, page);
    bridge = b.via !== 'no-data';
  } catch {
    /* best-effort */
  }
  try {
    const cf = await computeCrossFlow(env, tractate, page);
    cross = cf.via === 'llm'; // 'llm' = computed/cached; 'no-data'/'edge-of-tractate' = not linked
  } catch {
    /* best-effort */
  }
  return { bridge, cross };
}

// Completeness backstop for the cross-daf layer: walk every daf boundary across
// Shas and CONNECT (bridge + cross-flow) any where both dapim are already warm
// but the link is still cold. Connect-ONLY — it never warms the underlying
// argument marks (that happens on read / deep-warm); it just links what is
// already linkable, so a tick is mostly cheap KV existence checks plus a couple
// of flash LLM calls per genuinely-new boundary. Cursor-driven and PERPETUAL: a
// full pass wraps back to the start rather than latching done, so boundaries
// whose dapim warm up *after* a pass (or that failed on a budget cap / transient
// error) are picked up on the next lap. Once everything is connected, each tick
// is pure cheap skips. Best-effort per boundary.
const CONNECT_CURSOR_KEY = 'connect-cursor:v1';
const CONNECT_BATCH = 16; // boundaries examined per tick (most are cheap skips)
interface ConnectCursor {
  tractateIdx: number;
  amudIdx: number;
  connected: number;
}
async function runConnectSweep(env: Bindings): Promise<void> {
  const cache = env.CACHE;
  if (!cache) return;
  const tractates = Object.keys(TRACTATE_END_AMUD);
  if (tractates.length === 0) return;
  let cur: ConnectCursor = { tractateIdx: 0, amudIdx: 0, connected: 0 };
  const raw = await cache.get(CONNECT_CURSOR_KEY);
  if (raw) {
    try {
      cur = JSON.parse(raw) as ConnectCursor;
    } catch {
      /* reset */
    }
  }
  let { tractateIdx, amudIdx, connected } = cur;
  if (tractateIdx >= tractates.length) tractateIdx = 0; // tractate list shrank
  let examined = 0;
  while (examined < CONNECT_BATCH) {
    if (tractateIdx >= tractates.length) {
      // End of Shas — wrap to the start so newly-connectable boundaries get
      // picked up on the next lap (skips are cheap once already connected).
      tractateIdx = 0;
      amudIdx = 0;
    }
    const tractate = tractates[tractateIdx];
    const pages = [...iterAmudim(tractate)];
    if (amudIdx >= pages.length) {
      tractateIdx++;
      amudIdx = 0;
      continue;
    }
    const page = pages[amudIdx];
    amudIdx++;
    examined++;
    const next = adjacentAmud(tractate, page, 1);
    if (!next) continue; // last daf of the tractate — no boundary
    // Fully connected? Skip only when BOTH the cross-flow AND the bridge are
    // cached — `/api/cross-flow` can write the cross key without the bridge, so
    // a cross-only check would skip a boundary whose continuity is still cold.
    const [haveCross, haveBridge] = await Promise.all([
      cache.get(keyForCrossFlow(tractate, page)),
      cache.get(keyForBridge(tractate, page)),
    ]);
    if (haveCross && haveBridge) continue;
    // Only connect when BOTH sides already have argument sections cached; else
    // the compute would no-data (not pin) — skip rather than waste the call.
    const a = await readSortedSections(env, tractate, page);
    if (a.sections.length === 0) continue;
    const b = await readSortedSections(env, tractate, next);
    if (b.sections.length === 0) continue;
    // connectBoundary computes both; the already-cached side is a cheap hit.
    const r = await connectBoundary(env, tractate, page).catch(() => ({
      bridge: false,
      cross: false,
    }));
    if (r.cross) connected++;
  }
  await cache.put(CONNECT_CURSOR_KEY, JSON.stringify({ tractateIdx, amudIdx, connected }));
  console.log(
    `[connect-sweep] examined=${examined} connected=${connected} cursor=${tractateIdx}:${amudIdx}`,
  );
}

// The STITCHED flow view: per-daf argument flow graphs (the same nodes +
// connections the daf reader's ArgumentFlowGraph renders) plus each daf's
// cross-daf edges into the next, for the whole tractate. Read-only over cached
// pieces — nothing is computed. The client stacks these into one continuous
// argument map down the tractate. (Hidden #spine page only.)
/** A cross-text "exit" on a section: a parallel link whose target is off the
 *  visible tractate (another tractate, or the Yerushalmi) and so can't be drawn
 *  as an in-graph arrow — the spine flow graph renders these as click-to-expand
 *  markers beside the section box. `corpus` distinguishes the badge. */
interface SpineExit {
  ref: string;
  relation: string;
  corpus: 'yeru' | 'bavli' | 'here';
  tractate: string;
  page: string;
}
/** Group a daf's cached parallels (Mesorat HaShas + Yerushalmi) into per-section
 *  exit marks, keyed to the argument section their source segment sits in. Pure
 *  over already-read bundles — no network. */
function sectionExitMarks(
  tractate: string,
  page: string,
  sectionStarts: readonly number[],
  tp: Awaited<ReturnType<typeof readCachedTalmudParallels>>,
  yeru: Awaited<ReturnType<typeof readCachedYerushalmi>>,
): SpineExit[][] {
  const daf = { tractate, page };
  const links = [...talmudParallelsToLinks(daf, tp ?? []), ...yerushalmiToLinks(daf, yeru)];
  const out: SpineExit[][] = sectionStarts.map(() => []);
  if (out.length === 0) return out;
  for (const l of links) {
    const t = l.targets[0];
    if (!t) continue;
    // the section whose start is the greatest not exceeding the source segment
    // (robust to section array order).
    let idx = 0;
    let best = -1;
    for (let i = 0; i < sectionStarts.length; i++) {
      if (sectionStarts[i] <= l.source.seg && sectionStarts[i] >= best) {
        best = sectionStarts[i];
        idx = i;
      }
    }
    out[idx].push({
      ref: coordLabel(t),
      relation: l.relation,
      corpus: l.via === 'yerushalmi' ? 'yeru' : t.tractate === tractate ? 'here' : 'bavli',
      tractate: t.tractate,
      page: t.page,
    });
  }
  return out;
}

/** Resolve a tractate slug ('berakhot', 'bava_kamma') to its Sefaria-canonical
 *  name ('Berakhot', 'Bava Kamma') — the case the parallel/yerushalmi bundles are
 *  keyed under. Falls back to the input when unknown. */
function canonicalTractateName(slug: string): string {
  const s = slugTractate(slug);
  return TRACTATE_OPTIONS.find((o) => slugTractate(o.value) === s)?.value ?? slug;
}

app.get('/api/spine-view/:tractate', async (c) => {
  const tractate = c.req.param('tractate');
  if (!isKnownTractate(tractate)) return c.json({ error: `unknown tractate: ${tractate}` }, 404);
  if (!c.env.CACHE) return c.json({ error: 'no CACHE binding in this environment' }, 503);
  // The route param is a lowercase slug; the parallel / yerushalmi bundles are
  // keyed by the Sefaria-canonical tractate name the reader/API wrote them under
  // (raw case, unlike the slugDaf-folded mark/flow/bridge keys), so resolve it or
  // the read-only bundle reads cold-miss everything.
  const canonical = canonicalTractateName(tractate);
  const pages = [...iterAmudim(tractate)];
  const raw = await mapPool(pages, 24, async (page) => {
    const secs = await readSectionRabbis(c.env, tractate, page);
    const flow = await readFlowConnections(c.env, tractate, page);
    const cross = await readCachedCrossFlow(c.env, tractate, page);
    const bridge = await readCachedBridge(c.env, tractate, page);
    // Cross-text parallels (off-tractate / Yerushalmi), read-only, grouped to the
    // section they leave from — rendered as exit markers in the flow graph.
    const tp = await readCachedTalmudParallels(c.env.CACHE, canonical, page);
    const yeru = await readCachedYerushalmi(c.env.CACHE, canonical, page);
    const exits = sectionExitMarks(
      canonical,
      page,
      secs.map((s) => s.start),
      tp,
      yeru,
    );
    return {
      page,
      sections: secs.map((s, i) => ({
        index: i,
        title: s.title || `Section ${i + 1}`,
        rabbis: s.rabbis,
        exits: exits[i] ?? [],
      })),
      flow,
      cross: cross?.edges ?? [],
      // Has this daf's cross-daf link been computed yet? A cached cross-flow
      // (even with zero edges = genuinely no link) means computed; null means
      // still cold (not yet warmed). Lets the client distinguish "no link" from
      // "not connected yet" and surface the gaps.
      crossComputed: cross != null,
      // Same distinction for cross-text parallels: the bundle is cached (an array,
      // even empty = checked-and-none) vs never computed (null). false → the spine
      // shows a "parallels not computed yet" marker instead of silently nothing.
      parallelsComputed: tp != null,
      // deterministic daf-continuity: does the sugya carry into the next daf?
      continues: bridge?.continues === true,
    };
  });
  // nextPage = the adjacent amud (iterAmudim order), so cross-daf + continuity
  // edges have a target daf to point at.
  const dapim = raw.map((d, i) => ({ ...d, nextPage: pages[i + 1] ?? null }));
  // Only dapim that actually have sections (a flow graph needs nodes).
  return c.json({ tractate, dapim: dapim.filter((d) => d.sections.length > 0) });
});

// On-demand compute (or cache hit) of one daf's cross-daf flow, returned both as
// the raw verdict and projected to coordinate-resolved links. Mirrors /api/bridge.
app.get('/api/cross-flow/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const cf = await computeCrossFlow(c.env, tractate, page);
  const a = await readSortedSections(c.env, tractate, page);
  const b = cf.to
    ? await readSortedSections(c.env, cf.to.tractate, cf.to.page)
    : { startSegs: [], sections: [] };
  const links = cf.to ? crossFlowToLinks(cf.from, cf.to, cf.edges, a.startSegs, b.startSegs) : [];
  return c.json({ ...cf, links });
});

// Bounded-concurrency map: run `fn` over `items` with at most `limit` in flight.
async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// The whole-tractate link graph — every daf's links (continuity + argument flow)
// lifted onto one global spine via spineLinks(). Read-only over cached pieces:
// it reflects exactly what has been computed so far and grows as more dapim warm
// (rebuilt idempotently, never read-modify-write). Materialized on the tractate
// shelf (spine-links:v1:{tractate}) as a snapshot; the response is the source of
// truth. `?cached=1` returns the last materialized snapshot if any.
app.get('/api/spine-links/:tractate', async (c) => {
  const tractate = c.req.param('tractate');
  if (!isKnownTractate(tractate)) return c.json({ error: `unknown tractate: ${tractate}` }, 404);
  if (!c.env.CACHE) return c.json({ error: 'no CACHE binding in this environment' }, 503);

  const shelfKey = keyForSpineLinks(tractate);
  if (c.req.query('cached') === '1') {
    const snap = await c.env.CACHE.get(shelfKey);
    if (snap) return c.json({ ...JSON.parse(snap), fromShelf: true });
  }

  const pages = [...iterAmudim(tractate)];
  const partsList = await mapPool(pages, 24, (page) => readDafParts(c.env, tractate, page));
  // Assemble: within-daf links + cross-daf edges (resolved into the NEXT daf's
  // sections, which is the adjacent page in iterAmudim order).
  const perDaf: DafLink[][] = partsList.map((parts, i) => {
    const links = [...parts.withinLinks];
    const next = partsList[i + 1];
    if (next && parts.crossEdges.length) {
      links.push(
        ...crossFlowToLinks(
          { tractate, page: pages[i] },
          { tractate, page: pages[i + 1] },
          parts.crossEdges,
          parts.startSegs,
          next.startSegs,
        ),
      );
    }
    return links;
  });
  const dapimWithLinks = perDaf.filter((l) => l.length > 0).length;
  const graph = spineLinks(tractate, perDaf);
  const result = { ...graph, coverage: { dapimWithLinks, dapimTotal: pages.length } };
  try {
    await c.env.CACHE.put(shelfKey, JSON.stringify(result));
  } catch {
    /* best-effort materialize */
  }
  return c.json(result);
});

// Source-input dependency keys (resolved in resolveDep, not producers) — used to
// classify a dependency id as a SOURCE leaf (fetched/assembled, no LLM) vs a
// producer (mark/enrichment). Mirrors validateEnrichmentDependencies' allowlist.
const SOURCE_DEP_KEYS = new Set([
  'gemara',
  'commentaries',
  'mishna',
  'context',
  'context-light',
  'halacha-refs',
  'yerushalmi-text',
  'incoming',
]);

// GET /api/run-tree/:tractate/:page/:id — the build PROVENANCE of one piece on
// one daf, read-only. Walks the producer's forward dependency DAG (the same
// `dependencies` the resolver follows) and, for each node, reads its ALREADY
// CACHED RunResult to report how it was made: source vs LLM, model, cold
// generation time, cost, tokens, and whether it's cached now. Shared nodes (e.g.
// `gemara`, depended on across the chain) appear once with fan-in edges, and
// their cost counts a single time in the totals. NO LLM, NO writes — a node with
// nothing cached reports cached:false and null telemetry. The reader-facing
// prompt + full generation per node stay lazy (the dev inspector fetches them
// per-node via /api/run + /api/run-sources on expand), so this response is small.
// Scope: whole-daf instances ({fields:{}}); section/global-instance trees are a
// later extension. Public + read-only, like /api/dependents and /api/stale.
app.get('/api/run-tree/:tractate/:page/:id', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const id = c.req.param('id');
  const lang: 'en' | 'he' = c.req.query('lang') === 'he' ? 'he' : 'en';
  // Optional instance (mark_input JSON) for a per-instance ROOT — e.g. one
  // section's synthesis. Applied to the root only; whole-daf deps keep {fields:{}}.
  let rootInstance: unknown = { fields: {} };
  const instanceRaw = c.req.query('instance');
  if (instanceRaw) {
    try {
      rootInstance = JSON.parse(instanceRaw);
    } catch {
      /* keep default */
    }
  }

  const defs = [...CODE_MARKS, ...CODE_ENRICHMENTS];
  const byId = new Map(defs.map((d) => [d.id, d]));
  if (!byId.has(id)) return c.json({ error: 'unknown producer (mark/enrichment id)' }, 404);
  const markIds = new Set(CODE_MARKS.map((m) => m.id));

  const { nodes: nodeIds, edges } = forwardSubgraph(producerNodesFrom(defs), id);

  // Per-input freshness verdict for the inspector: 'same' (recomputed content
  // hash matches the one stamped at generation), 'changed', or 'unknown' (the
  // dep isn't cached / has no stamped hash / can't be recomputed cheaply).
  interface TreeNodeInput {
    sourceKey: string;
    status: 'same' | 'changed' | 'unknown';
  }
  interface TreeNode {
    id: string;
    label: string;
    kind: 'source' | 'llm' | 'computed';
    producer?: 'mark' | 'enrichment';
    model?: string;
    cached: boolean;
    cold_ms: number | null;
    cost: number | null;
    tokens: number | null;
    // Per-instance producers (one cached entry per pasuk / halacha / rabbi /
    // move) report the fraction warmed; absent on whole-daf / single-entry nodes.
    instances?: { total: number; cached: number };
    // --- additive provenance/staleness fields (absent on source leaves; null
    // when nothing is cached). Older clients ignore them. ---
    authority?: Authority | null;
    staleness?: Staleness | null;
    createdAt?: string | null;
    recipeHash?: string | null;
    inputs?: TreeNodeInput[];
    inputsChanged?: string[];
  }
  const out: Record<string, TreeNode> = {};
  let totalColdMs = 0,
    totalCost = 0,
    llmCount = 0,
    sourceCount = 0,
    cachedCount = 0;

  // The cached entries + per-producer current recipe hashes collected during
  // the walk, so the second (inputs) pass below recomputes dependency content
  // hashes from entries ALREADY read — zero extra KV reads, no generation.
  const store = artifactStore(c.env);
  const entryOf = new Map<string, RunResult>();
  const currentRecipeOf = new Map<string, string>();
  const depsOf = new Map<string, ReadonlyArray<unknown>>();
  const rootCustomInstance = JSON.stringify(rootInstance) !== JSON.stringify({ fields: {} });
  // Whole-daf marks key their enrichments under the single {fields:{}} instance;
  // every other mark is per-instance, so its enrichments live under one key per
  // instance. Read each target mark's instance list at most once per request.
  const markAnchorById = new Map(CODE_MARKS.map((m) => [m.id, (m as { anchor?: string }).anchor]));
  const instCache = new Map<string, Promise<RawInstance[]>>();
  const instancesForMark = (mid: string): Promise<RawInstance[]> => {
    let p = instCache.get(mid);
    if (!p) {
      p = readMarkInstances(c.env, mid, tractate, page);
      instCache.set(mid, p);
    }
    return p;
  };

  for (const nid of nodeIds) {
    const def = byId.get(nid);
    if (!def) {
      // a dependency id with no producer def: a source-input leaf (gemara /
      // context / …). SOURCE_DEP_KEYS confirms it's a known input vs a dangling
      // ref (validateProducerGraph guards against the latter in CI).
      out[nid] = {
        id: nid,
        label: nid,
        kind: 'source',
        cached: SOURCE_DEP_KEYS.has(nid),
        cold_ms: null,
        cost: null,
        tokens: null,
      };
      sourceCount++;
      continue;
    }
    const isMark = markIds.has(nid);
    const ext = (def as { extractor?: { kind?: string; model?: string } }).extractor;
    const isLLM = ext?.kind === 'llm';
    // Same key derivation (and the same KV def reads) cacheKeyForRunBody
    // performs — inlined so the loaded def also yields the CURRENT recipe hash
    // (enrichments stamp recipe_hash at generation; marks never have).
    let res: RunResult | null = null;
    // Per-instance enrichments (target mark is NOT whole-daf) cache one entry per
    // instance, keyed by the mark_input's identity via instanceIdOf — NOT under
    // {fields:{}}. Probing {fields:{}} (the old code) always missed them; enumerate
    // the target mark's real instances and aggregate. The exception is THIS node
    // being the root with a caller-pinned instance — then it's the one we want.
    let aggregate: ProbeAggregate | null = null;
    if (isMark) {
      const ldef = await loadMarkDef(c.env, nid);
      if (ldef) {
        const key = store.keyFor(markKeyInfo(ldef), { unit: { work: tractate, unit: page }, lang });
        res = await readCachedResult(c.env, key);
        depsOf.set(nid, ldef.dependencies ?? []);
      }
    } else {
      const ldef = await loadEnrichmentDef(c.env, nid);
      if (ldef) {
        currentRecipeOf.set(nid, await recipeHash(enrichmentRecipe(ldef)));
        depsOf.set(nid, ldef.dependencies ?? []);
        const targetMark = (def as { target_mark?: string }).target_mark;
        const perInstance = !!targetMark && markAnchorById.get(targetMark) !== 'whole-daf';
        const pinnedRoot = nid === id && rootCustomInstance;
        const keyForIid = (iid: string): string =>
          store.keyFor(enrichKeyInfo(ldef), {
            instanceId: iid,
            unit: { work: tractate, unit: page },
            lang,
          });
        if (perInstance && !pinnedRoot && targetMark) {
          const insts = await instancesForMark(targetMark);
          const probed = await Promise.all(
            insts.map(async (inst) => readCachedResult(c.env, keyForIid(await instanceIdOf(inst)))),
          );
          aggregate = aggregateProbes(
            probed.map((r) => ({
              cached: !!r,
              cost: inspectorCostOf(r as InspectEntry | null),
              cold_ms: typeof r?.elapsed_ms === 'number' ? r.elapsed_ms : null,
              tokens: tokensOfEntry(r),
            })),
          );
          // A real instance entry stands in for the provenance/staleness pass.
          res = probed.find((r) => r) ?? null;
        } else {
          const iid = await instanceIdOf(pinnedRoot ? rootInstance : { fields: {} });
          res = await readCachedResult(c.env, keyForIid(iid));
        }
      }
    }
    if (res) entryOf.set(nid, res);
    const coldMs = aggregate
      ? aggregate.cold_ms
      : typeof res?.elapsed_ms === 'number'
        ? res.elapsed_ms
        : null;
    const cost = aggregate ? aggregate.cost : inspectorCostOf(res as InspectEntry | null);
    const tokens = aggregate ? aggregate.tokens : tokensOfEntry(res);
    const cached = aggregate ? aggregate.cached : !!res;
    const anyCached = aggregate ? aggregate.instances.cached > 0 : !!res;
    if (cached) cachedCount++;
    if (isLLM && anyCached) {
      totalColdMs += coldMs ?? 0;
      totalCost += cost ?? 0;
      llmCount++;
    } else if (!isLLM) sourceCount++;
    out[nid] = {
      id: nid,
      label: (def as { label?: string }).label ?? nid,
      kind: isLLM ? 'llm' : 'computed',
      producer: isMark ? 'mark' : 'enrichment',
      model: isLLM ? ext?.model : undefined,
      cached,
      cold_ms: coldMs,
      cost,
      tokens,
      ...(aggregate ? { instances: aggregate.instances } : {}),
    };
  }

  // Second pass: provenance + staleness per producer node, computed ONLY from
  // the entries read above (cache reads only; no LLM, no extra KV).
  for (const nid of nodeIds) {
    const node = out[nid];
    if (!node || node.kind === 'source') continue;
    const res = entryOf.get(nid);
    if (!res) {
      node.authority = null;
      node.staleness = null;
      node.createdAt = null;
      node.recipeHash = null;
      continue;
    }
    const stored = res as unknown as StoredArtifact;
    node.authority = authorityOf(stored);
    node.createdAt = stored.provenance?.createdAt || null;
    const storedHash = res.recipe_hash ?? stored.provenance?.recipeHash ?? null;
    node.recipeHash = storedHash;
    // Recompute each stamped input's CURRENT content hash from the dep's
    // already-read cached entry, the same way provenanceInputRefs hashed the
    // resolved value at generation (enrichment dep → parsed ?? content; mark
    // dep → parsed.instances ?? content). 'unknown' when the dep isn't cached,
    // is a fanOut aggregate (its generation value spanned per-instance runs we
    // didn't read), or — for a custom-instance root — an enrichment dep that
    // inherited that instance (whose whole-daf entry isn't what fed the run).
    const stampedInputs = stored.provenance?.inputs;
    if (stampedInputs?.length) {
      const fanOutIds = new Set(
        (depsOf.get(nid) ?? [])
          .map((d) =>
            d && typeof d === 'object' && (d as { fanOut?: boolean }).fanOut
              ? (d as { enrichment?: string }).enrichment
              : undefined,
          )
          .filter((x): x is string => typeof x === 'string'),
      );
      const inputs: TreeNodeInput[] = [];
      for (const ref of stampedInputs) {
        const k = ref.sourceKey;
        if (!k) continue;
        let status: TreeNodeInput['status'] = 'unknown';
        const depRes = entryOf.get(k);
        const depIsMark = markIds.has(k);
        const comparable =
          !!ref.contentHash &&
          !!depRes &&
          !fanOutIds.has(k) &&
          (depIsMark || nid !== id || !rootCustomInstance);
        if (comparable && depRes) {
          const value = depIsMark
            ? ((depRes.parsed as { instances?: unknown } | null)?.instances ?? depRes.content)
            : (depRes.parsed ?? depRes.content);
          const [cur] = await provenanceInputRefs({ depends: { [k]: value }, anchors: {} });
          status = cur?.contentHash === ref.contentHash ? 'same' : 'changed';
        }
        inputs.push({ sourceKey: k, status });
      }
      node.inputs = inputs;
      node.inputsChanged = inputs.filter((i) => i.status === 'changed').map((i) => i.sourceKey);
    }
    // Verdict mirrors ArtifactStore.staleness: the recipe leg first (no stamp
    // → 'unknown'; marks never stamp one), then the input-hash leg.
    const current = currentRecipeOf.get(nid) ?? null;
    node.staleness = !storedHash
      ? 'unknown'
      : current && storedHash !== current
        ? 'stale-recipe'
        : node.inputsChanged?.length
          ? 'stale-inputs'
          : current
            ? 'fresh'
            : 'unknown';
  }

  // A per-instance root opened WITHOUT a pinned instance shows an aggregate; hand
  // back the instance list so the dock can offer a picker (each chip re-opens the
  // piece with ?instance= to inspect that one's content/provenance). Empty for
  // whole-daf roots and when an instance was already pinned.
  const rootTarget = (byId.get(id) as { target_mark?: string } | undefined)?.target_mark;
  const rootInstances =
    !markIds.has(id) &&
    rootTarget &&
    markAnchorById.get(rootTarget) !== 'whole-daf' &&
    !rootCustomInstance
      ? (await instancesForMark(rootTarget)).map((inst) => ({
          label: instanceLabel(inst.fields),
          instance: inst,
        }))
      : [];

  return c.json({
    root: id,
    tractate,
    page,
    lang,
    nodes: out,
    edges,
    rootInstances,
    totals: {
      count: nodeIds.length,
      llm: llmCount,
      source: sourceCount,
      cached: cachedCount,
      cold_ms: totalColdMs,
      cost: Number(totalCost.toFixed(6)),
    },
  });
});

// GET /api/daf-runs/:tractate/:page — the WATERFALL feed: every top-level piece
// run on this daf (all marks + the whole-daf enrichments) with its cached
// telemetry, read-only. The dev pipeline dock shows these as a network-style
// waterfall; clicking one drills into its dependency DAG via /api/run-tree.
// Whole-daf enrichments only (scope=local, not the per-section `argument`
// enrichments and not the global rabbi/place facets) so each row is one run.
// GET /api/daf-index/:tractate/:page — read the daf-index (the `dafidx:v1`
// reverse index written at each fresh mark/enrichment write). ONE cache.list()
// over the daf PREFIX returns every cached piece for the daf with its telemetry
// in KV metadata — no per-entry reads, no key re-derivation. Read-only. The
// inspector + load bar move onto this in a follow-up (with a fallback to the
// enumerate-and-probe /api/daf-runs for dapim warmed before the index existed);
// surfaced now to verify the index populates.
app.get('/api/daf-index/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const entries = await listDafIndexRaw(c.env, tractate, page);
  return c.json({ tractate, page, count: entries.length, entries });
});

/** Backfill the daf-index for pieces warmed BEFORE the index existed (PR1 only
 *  indexes fresh writes; the warm cron doesn't re-write already-cached content).
 *  Mirrors /api/daf-runs' enumeration exactly — marks + local enrichments
 *  (per-instance via the target mark's instances), skipping per-section
 *  `argument` — and writes one index entry per CACHED piece, byte-identical to
 *  the key a fresh write would. Best-effort, off the request path; returns the
 *  count written. Idempotent (a re-run just rewrites the same keys), but callers
 *  guard on "already indexed" so it runs at most once per daf. */
async function backfillDafIndex(
  env: Bindings,
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): Promise<number> {
  if (!env.CACHE) return 0;
  const cache = env.CACHE;
  let n = 0;
  const bump = () => {
    n++;
  };
  // Marks — one cached entry per daf (he-collapse: a mark with no `_he` prompt
  // shares the 'en' key, so probe the lang the run would actually have written).
  await Promise.all(
    CODE_MARKS.map(async (def) => {
      const ext = def.extractor as { system_prompt_he?: string } | undefined;
      const markLang = lang === 'he' && ext?.system_prompt_he ? 'he' : 'en';
      const res = await readCachedResult(env, keyForMark(def, tractate, page, markLang));
      if (res) {
        await recordMarkDafIndex(cache, def.id, tractate, page, markLang, res);
        bump();
      }
    }),
  );
  const markAnchorById = new Map(CODE_MARKS.map((m) => [m.id, (m as { anchor?: string }).anchor]));
  // Index ALL local enrichments — including the per-section `argument` facets,
  // which were held out of the flat `runs`/load-bar path but are a first-class
  // anchor in the by-anchor view. Their leaves key by slug(title), which matches
  // the argument mark instance (pinned by tests/inspect-anchors).
  const localEnrichments = CODE_ENRICHMENTS.filter((e) => e.scope === 'local');
  const wholeDafIid = await instanceIdOf({ fields: {} });
  await Promise.all(
    localEnrichments.map(async (def) => {
      const targetMark = (def as { target_mark?: string }).target_mark;
      if (targetMark && markAnchorById.get(targetMark) !== 'whole-daf') {
        const insts = await readMarkInstances(env, targetMark, tractate, page);
        await Promise.all(
          insts.map(async (inst) => {
            const res = await readCachedResult(
              env,
              keyForEnrichment(def, await instanceIdOf(inst), { tractate, page }, undefined, lang),
            );
            if (res) {
              await recordEnrichmentDafIndex(cache, def.id, tractate, page, inst, lang, res);
              bump();
            }
          }),
        );
      } else {
        const res = await readCachedResult(
          env,
          keyForEnrichment(def, wholeDafIid, { tractate, page }, undefined, lang),
        );
        if (res) {
          await recordEnrichmentDafIndex(cache, def.id, tractate, page, { fields: {} }, lang, res);
          bump();
        }
      }
    }),
  );
  // Written LAST: the completion sentinel marks this (daf, lang) fully indexed, so
  // /api/daf-runs may now trust the index (serve from one list() instead of
  // probing). Until it exists, daf-runs stays on the probe path.
  await cache.put(keyForDafIndexDone(tractate, page, lang), '1');
  return n;
}

/** List the raw daf-index entries (every lang) for a daf — paginated. Shared by
 *  GET /api/daf-index and the index-backed daf-runs fast path. */
async function listDafIndexRaw(
  env: Bindings,
  tractate: string,
  page: string,
): Promise<Array<{ key: string; meta: unknown }>> {
  if (!env.CACHE) return [];
  const prefix = prefixForDafIndex(tractate, page);
  const out: Array<{ key: string; meta: unknown }> = [];
  let cursor: string | undefined;
  do {
    const res = await env.CACHE.list({ prefix, cursor, limit: 1000 });
    for (const k of res.keys) out.push({ key: k.name, meta: k.metadata ?? null });
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return out;
}

/** The registry producer specs the index-backed daf-runs needs but the index
 *  doesn't carry: static registry info + per-instance totals (from the target
 *  mark) + the CURRENT recipe hash (whole-daf enrichments, for the staleness
 *  verdict). Mirrors /api/daf-runs' producer enumeration exactly. */
async function buildProducerSpecs(
  env: Bindings,
  tractate: string,
  page: string,
): Promise<ProducerSpec[]> {
  const markAnchorById = new Map(CODE_MARKS.map((m) => [m.id, (m as { anchor?: string }).anchor]));
  const localEnrichments = CODE_ENRICHMENTS.filter(
    (e) => e.scope === 'local' && e.target_mark !== 'argument',
  );
  const perInstanceTargets = new Set(
    localEnrichments
      .map((e) => e.target_mark)
      .filter((m): m is string => !!m && markAnchorById.get(m) !== 'whole-daf'),
  );
  const totalByMark = new Map<string, number>();
  await Promise.all(
    [...perInstanceTargets].map(async (mid) => {
      totalByMark.set(mid, (await readMarkInstances(env, mid, tractate, page)).length);
    }),
  );
  const specOf = (
    def: { id: string; label: string; extractor?: unknown; experimental?: boolean },
    producer: 'mark' | 'enrichment',
    perInstance: boolean,
    extra: Partial<ProducerSpec>,
  ): ProducerSpec => {
    const ext = def.extractor as { kind?: string; model?: string } | undefined;
    const isLLM = ext?.kind === 'llm';
    return {
      id: def.id,
      label: def.label,
      kind: isLLM ? 'llm' : 'computed',
      producer,
      model: isLLM ? ext?.model : undefined,
      experimental: !!def.experimental,
      perInstance,
      ...extra,
    };
  };
  const specs: ProducerSpec[] = CODE_MARKS.map((def) => specOf(def, 'mark', false, {}));
  for (const def of localEnrichments) {
    const targetMark = (def as { target_mark?: string }).target_mark;
    const perInstance = !!targetMark && markAnchorById.get(targetMark) !== 'whole-daf';
    const flat = perInstance ? null : adaptCodeEnrichment(def as SchemaEnrichmentDefinition);
    const currentRecipe = flat ? await recipeHash(enrichmentRecipe(flat)) : undefined;
    specs.push(
      specOf(def, 'enrichment', perInstance, {
        instancesTotal: perInstance && targetMark ? totalByMark.get(targetMark) : undefined,
        currentRecipe,
      }),
    );
  }
  return specs;
}

/** Build the daf-runs rows from the daf-index (the fast path): one `list()` +
 *  the per-instance mark reads, NO per-instance probes. */
async function dafRunsFromIndexRows(
  env: Bindings,
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): Promise<DafRunRow[]> {
  const [raw, specs] = await Promise.all([
    listDafIndexRaw(env, tractate, page),
    buildProducerSpecs(env, tractate, page),
  ]);
  const metas = raw
    .map((e) => e.meta as DafIndexEntryMeta & { l?: string })
    .filter((m): m is DafIndexEntryMeta & { l?: string } => !!m && m.l === lang);
  return dafRunsFromIndex(metas, specs);
}

/** Build the BY-ANCHOR groups for the fast (index) path: join the per-instance
 *  index entries to the mark instances (the anchors), enumerating EVERY expected
 *  piece per anchor (cached from the index, else a miss) so a group shows the
 *  full set. Whole-daf marks + whole-daf enrichments lead in a `__whole_daf__`
 *  group. Includes the per-section `argument` facets (a first-class anchor here,
 *  even though they stay out of the flat `runs`/load-bar path). */
async function dafGroupsFromIndex(
  env: Bindings,
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): Promise<{ groups: AnchorGroup[]; marks: Record<string, AnchorPiece> }> {
  const raw = await listDafIndexRaw(env, tractate, page);
  const metas = raw
    .map((e) => e.meta as DafIndexEntryMeta & { l?: string })
    .filter((m): m is DafIndexEntryMeta & { l?: string } => !!m && m.l === lang);

  const markAnchorById = new Map(CODE_MARKS.map((m) => [m.id, (m as { anchor?: string }).anchor]));
  interface Desc {
    id: string;
    label: string;
    kind: 'llm' | 'computed';
    model?: string;
    producer: 'mark' | 'enrichment';
  }
  const descOf = (
    def: { id: string; label: string; extractor?: unknown },
    producer: 'mark' | 'enrichment',
  ): Desc => {
    const ext = def.extractor as { kind?: string; model?: string } | undefined;
    const isLLM = ext?.kind === 'llm';
    return {
      id: def.id,
      label: def.label,
      kind: isLLM ? 'llm' : 'computed',
      model: isLLM ? ext?.model : undefined,
      producer,
    };
  };
  // Per-instance enrichments grouped by target mark; everything else is whole-daf.
  // Only WHOLE-DAF marks (Overview/Background/Tidbit/Bi'yun) are daf-level notes;
  // per-instance marks (pesukim/argument/rabbi/…) are EXTRACTORS — not daf-level
  // pieces — so they go in `marks` (the per-type header), NOT this group.
  const byTarget = new Map<string, Desc[]>();
  const wholeDafProducers: Desc[] = CODE_MARKS.filter(
    (m) => (m as { anchor?: string }).anchor === 'whole-daf',
  ).map((d) => descOf(d, 'mark'));
  for (const def of CODE_ENRICHMENTS.filter((e) => e.scope === 'local')) {
    const targetMark = (def as { target_mark?: string }).target_mark;
    if (targetMark && markAnchorById.get(targetMark) !== 'whole-daf') {
      const arr = byTarget.get(targetMark) ?? [];
      arr.push(descOf(def, 'enrichment'));
      byTarget.set(targetMark, arr);
    } else {
      wholeDafProducers.push(descOf(def, 'enrichment'));
    }
  }
  // Anchors for each per-instance target mark (instanceIdOf = the join key).
  const anchorsByMark = new Map<string, AnchorRef[]>();
  await Promise.all(
    [...byTarget.keys()].map(async (mid) => {
      const insts = await readMarkInstances(env, mid, tractate, page);
      anchorsByMark.set(mid, await Promise.all(insts.map((inst) => anchorRefOf(mid, inst))));
    }),
  );
  // Index lookups: per-instance entries by (producer:instance); mark entries (no
  // instance id) by producer; whole-daf enrichment entries by the {fields:{}} id.
  const metaByPK = new Map<string, DafIndexEntryMeta>();
  const markMetaByP = new Map<string, DafIndexEntryMeta>();
  for (const m of metas) {
    if (m.i) metaByPK.set(`${m.p}:${m.i}`, m);
    else markMetaByP.set(m.p, m);
  }
  const wholeIid = await instanceIdOf({ fields: {} });
  const pieceOf = (d: Desc, meta: DafIndexEntryMeta | undefined): AnchorPiece => ({
    producerId: d.id,
    label: d.label,
    kind: d.kind,
    model: d.model,
    cached: !!meta,
    cost: meta?.c ?? null,
    cold_ms: meta?.ms ?? null,
    tokens: meta?.t ?? null,
  });

  // The per-instance marks themselves (the extractors) — one row each, keyed by
  // mark id (= the anchor type), for the place-type cluster header's telemetry.
  const marks: Record<string, AnchorPiece> = {};
  for (const m of CODE_MARKS) {
    if ((m as { anchor?: string }).anchor === 'whole-daf') continue;
    marks[m.id] = pieceOf(descOf(m, 'mark'), markMetaByP.get(m.id));
  }

  const placed: Array<{ piece: AnchorPiece; anchor: AnchorRef | null }> = [];
  for (const [mid, anchors] of anchorsByMark) {
    const producers = byTarget.get(mid) ?? [];
    for (const anchor of anchors) {
      for (const d of producers) {
        placed.push({ piece: pieceOf(d, metaByPK.get(`${d.id}:${anchor.instanceId}`)), anchor });
      }
    }
  }
  for (const d of wholeDafProducers) {
    const meta =
      d.producer === 'mark' ? markMetaByP.get(d.id) : metaByPK.get(`${d.id}:${wholeIid}`);
    placed.push({ piece: pieceOf(d, meta), anchor: null });
  }

  const { groups, wholeDaf } = groupByAnchor(placed);
  return {
    groups: [
      {
        anchor: {
          markId: WHOLE_DAF_ANCHOR,
          instanceId: '',
          label: 'Whole daf',
          segRange: null,
          instanceJson: { fields: {} },
        },
        pieces: wholeDaf,
      },
      ...groups,
    ],
    marks,
  };
}

app.get('/api/daf-runs/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const lang: 'en' | 'he' = c.req.query('lang') === 'he' ? 'he' : 'en';

  // FAST PATH: when a full backfill has marked this (daf, lang) complete (the
  // sentinel), serve from the daf-index — ONE list() + the per-instance mark
  // reads, skipping the ~200 per-instance KV probes the slow path does. The rows
  // are byte-identical to the probe path (pinned by tests/inspect-from-index).
  // No sentinel → fall through to the enumerate-and-probe path below (which
  // backfills + writes the sentinel, so the next view takes this branch).
  if (c.env.CACHE && (await c.env.CACHE.get(keyForDafIndexDone(tractate, page, lang)))) {
    try {
      const [runs, grouped] = await Promise.all([
        dafRunsFromIndexRows(c.env, tractate, page, lang),
        dafGroupsFromIndex(c.env, tractate, page, lang),
      ]);
      runs.sort((a, b) => (b.cold_ms ?? -1) - (a.cold_ms ?? -1));
      // `groups` (additive) is the by-anchor view, `marks` the per-type extractor
      // rows (for the place-type cluster headers); `runs` stays flat for the load
      // bar + old clients. The slow path below emits no groups → client falls
      // back to grouping `runs` flatly until the daf backfills.
      return c.json({
        tractate,
        page,
        lang,
        runs,
        groups: grouped.groups,
        marks: grouped.marks,
        source: 'index',
      });
    } catch {
      /* fall through to the probe path on any index-read error */
    }
  }

  // Every LOCAL enrichment (the global rabbi/place facets are entity pieces shown
  // elsewhere) EXCEPT the per-section `argument` facets. Those carry a dual
  // display/synth mark_input (argumentDisplayInstance drops the seg indices
  // argumentSynthInstance keys on), so their instance id needs separate
  // verification before we enumerate them here — every other per-instance mark
  // (pesukim, aggadata, halacha, argument-move, rabbi, places) round-trips
  // cleanly (the reader reshape preserves the fields instanceIdOf hashes).
  const localEnrichments = CODE_ENRICHMENTS.filter(
    (e) => e.scope === 'local' && e.target_mark !== 'argument',
  );
  // The whole-daf instance id is the same for every whole-daf enrichment
  // ({fields:{}}), so hash it ONCE rather than per producer.
  const iid = await instanceIdOf({ fields: {} });
  // Per-instance enrichments (target mark is NOT whole-daf) are keyed one entry
  // per instance — enumerate the target mark's instances and aggregate, instead
  // of probing {fields:{}} (which never matched and reported a false miss). Read
  // each target mark's instance list once.
  const markAnchorById = new Map(CODE_MARKS.map((m) => [m.id, (m as { anchor?: string }).anchor]));
  const perInstanceTargets = new Set(
    localEnrichments
      .map((e) => e.target_mark)
      .filter((m): m is string => !!m && markAnchorById.get(m) !== 'whole-daf'),
  );
  const instancesByMark = new Map<string, RawInstance[]>();
  await Promise.all(
    [...perInstanceTargets].map(async (mid) => {
      instancesByMark.set(mid, await readMarkInstances(c.env, mid, tractate, page));
    }),
  );
  const producers = [
    ...CODE_MARKS.map((def) => ({ def, isMark: true as const })),
    ...localEnrichments.map((def) => ({ def, isMark: false as const })),
  ];
  // KV-overridden defs (Studio-authored, KV wins over code) change BOTH the
  // cache key (cache_version) and the current recipe — read the indexes once
  // and prefer the KV def per id, so the row reads the LIVE key and the
  // staleness verdict compares against the LIVE recipe. (KV-ONLY producers
  // still don't appear in this waterfall — it enumerates the code registry;
  // acceptable known limit, the prod KV registry is empty today.)
  const [kvEnrichList, kvMarkList] = await Promise.all([
    listEnrichments(c.env).catch(() => []),
    listMarks(c.env).catch(() => []),
  ]);
  const kvEnrichById = new Map(kvEnrichList.map((e) => [e.id, e]));
  const kvMarkById = new Map(kvMarkList.map((m) => [m.id, m]));

  // Read all producers' cached results in PARALLEL — ~46 KV gets at once instead
  // of serially (the serial loop made the waterfall take seconds on first open).
  const runs = await Promise.all(
    producers.map(async ({ def, isMark }) => {
      const kvEnrich = isMark ? undefined : kvEnrichById.get(def.id);
      const kvMark = isMark ? kvMarkById.get(def.id) : undefined;
      const ext = (kvEnrich ??
        kvMark ??
        (def.extractor as
          | { kind?: string; model?: string; system_prompt_he?: string }
          | undefined)) as { kind?: string; model?: string; system_prompt_he?: string } | undefined;
      const isLLM = kvEnrich || kvMark ? true : ext?.kind === 'llm';
      // Per-instance enrichment: aggregate across the target mark's instances
      // (each its own cached entry). One row that reads "3/3 cached · $0.004"
      // instead of a single {fields:{}} probe that always missed. Provenance dots
      // (authority/staleness) are per-entry and so left null on the aggregate.
      const targetMark = isMark ? undefined : (def as { target_mark?: string }).target_mark;
      if (!isMark && targetMark && markAnchorById.get(targetMark) !== 'whole-daf') {
        const edef = kvEnrich ?? def;
        const agg = await probeInstances(
          async (k) => (await readCachedResult(c.env, k)) as InspectEntry | null,
          (iidLocal) => keyForEnrichment(edef, iidLocal, { tractate, page }, undefined, lang),
          instancesByMark.get(targetMark) ?? [],
        );
        return {
          id: def.id,
          label: def.label,
          kind: isLLM ? 'llm' : 'computed',
          producer: 'enrichment' as const,
          model: isLLM ? ext?.model : undefined,
          cached: agg.cached,
          cold_ms: agg.cold_ms,
          cost: agg.cost,
          tokens: agg.tokens,
          instances: agg.instances,
          experimental: !!(def as { experimental?: boolean }).experimental,
          authority: null,
          staleness: null,
        };
      }
      const key = isMark
        ? keyForMark(
            kvMark ?? def,
            tractate,
            page,
            lang === 'he' && ext?.system_prompt_he ? 'he' : 'en',
          )
        : keyForEnrichment(kvEnrich ?? def, iid, { tractate, page }, undefined, lang);
      const res = await readCachedResult(c.env, key);
      // Additive provenance fields for the waterfall dots — cheap (no extra KV
      // reads; recipe-leg verdict only, the inputs leg needs the DAG's dep
      // reads and stays on /api/run-tree). Marks never stamp a recipe_hash, so
      // a cached mark is 'unknown'; an uncached row is null.
      const stored = res as StoredArtifact | null;
      const storedHash = res?.recipe_hash ?? stored?.provenance?.recipeHash ?? null;
      let staleness: Staleness | null = null;
      if (res) {
        if (!storedHash) staleness = 'unknown';
        else {
          // Current recipe from the LIVE def: the KV override when one exists
          // (already flat — same shape /api/stale hashes), else the code def
          // flattened. Hashing the code recipe for a KV-overridden producer
          // would report a false 'stale-recipe' against the wrong recipe.
          const flat = isMark
            ? null
            : (kvEnrich ?? adaptCodeEnrichment(def as SchemaEnrichmentDefinition));
          const current = flat ? await recipeHash(enrichmentRecipe(flat)) : null;
          staleness = !current ? 'unknown' : storedHash === current ? 'fresh' : 'stale-recipe';
        }
      }
      return {
        id: def.id,
        label: def.label,
        kind: isLLM ? 'llm' : 'computed',
        producer: isMark ? 'mark' : 'enrichment',
        model: isLLM ? ext?.model : undefined,
        cached: !!res,
        cold_ms: typeof res?.elapsed_ms === 'number' ? res.elapsed_ms : null,
        cost: inspectorCostOf(res as InspectEntry | null),
        tokens: tokensOfEntry(res),
        instances: undefined as { total: number; cached: number } | undefined,
        experimental: !!(def as { experimental?: boolean }).experimental,
        authority: stored ? authorityOf(stored) : null,
        staleness,
      };
    }),
  );
  // We only reach this (probe) path when the daf has NO completion sentinel, so
  // (re)backfill it off the request path (waitUntil — the response never waits):
  // this writes any missing index entries + the sentinel, flipping the NEXT view
  // to the fast index path. Covers both never-indexed dapim AND ones PR2
  // backfilled before sentinels existed (entries but no sentinel). Idempotent; a
  // concurrent second view may double-run it harmlessly.
  if (c.env.CACHE) {
    c.executionCtx.waitUntil(backfillDafIndex(c.env, tractate, page, lang).catch(() => {}));
  }
  runs.sort((a, b) => (b.cold_ms ?? -1) - (a.cold_ms ?? -1));
  return c.json({ tractate, page, lang, runs, source: 'probe' });
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
async function readGlobalPiece(
  env: Bindings,
  enrichmentId: string,
  markInput: unknown,
): Promise<unknown> {
  const def = await loadEnrichmentDef(env, enrichmentId);
  if (!def) return null;
  const instanceId = await instanceIdOf(markInput);
  const hit = await readCachedResult(env, keyForEnrichment(def, instanceId));
  return hit?.parsed ?? null;
}

// Like readGlobalPiece, but probes several candidate markInputs (one def
// load, parallel key reads) and returns the FIRST hit in candidate order.
// Needed because global rabbi pieces are keyed by whatever display name the
// warming surface used (instanceIdOf slug-ifies the name) — usually the
// canonical, but a daf's mark can carry a registry alias, and an entry
// warmed under "Rebbi Meir" must still be found when asked for via the slug.
async function readGlobalPieceFirst(
  env: Bindings,
  enrichmentId: string,
  markInputs: unknown[],
): Promise<unknown> {
  const def = await loadEnrichmentDef(env, enrichmentId);
  if (!def) return null;
  const hits = await Promise.all(
    markInputs.map(async (markInput) => {
      const instanceId = await instanceIdOf(markInput);
      const hit = await readCachedResult(env, keyForEnrichment(def, instanceId));
      return hit?.parsed ?? null;
    }),
  );
  return hits.find((h) => h != null) ?? null;
}

const RABBI_ENTITY_FACETS = ['identity', 'relationships', 'geography'] as const;
type RabbiEntityFacet = (typeof RABBI_ENTITY_FACETS)[number];

app.get('/api/entity/rabbi/:slug', async (c) => {
  const slug = c.req.param('slug');
  const entry = RABBI_PLACES.rabbis[slug];
  if (!entry) return c.json({ error: 'not found' }, 404);
  // Facet selection (additive): ?facets=identity,geography limits which
  // pieces are assembled — the daf map only consumes identity+geography, and
  // probing relationships costs up to 8 extra KV reads (alias candidates)
  // per request for data the caller throws away. Unknown facet names are
  // ignored; no param (or nothing valid left) keeps the full default, so
  // existing consumers are unchanged.
  const requested = new Set(
    (c.req.query('facets') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((f): f is RabbiEntityFacet => (RABBI_ENTITY_FACETS as readonly string[]).includes(f)),
  );
  const want = (f: RabbiEntityFacet) => requested.size === 0 || requested.has(f);
  const name = entry.canonical;
  const nameHe = entry.canonicalHe ?? '';
  // Probe canonical first, then registry aliases (bounded — a handful of KV
  // reads per enrichment), so entries warmed under a daf's alias spelling
  // still surface here.
  const candidates = [name, ...(entry.aliases ?? []).filter((a) => a !== name)]
    .slice(0, 8)
    .map((n) => ({ name: n, nameHe }));
  const pieces: Record<string, unknown> = {};
  // identity is the deterministic rabbi-places lookup (always available); the
  // others are the same global enrichments the card reads — keyed by the rabbi
  // instance the card passes (flat {name,...}), so instanceIdOf matches.
  if (want('identity'))
    pieces.identity = enrichRabbi(
      name,
      nameHe,
      (entry.generation as GenerationId | undefined) ?? 'unknown',
    );
  const [relationships, geography] = await Promise.all([
    want('relationships')
      ? readGlobalPieceFirst(c.env, 'rabbi.relationships', candidates)
      : Promise.resolve(undefined),
    want('geography')
      ? readGlobalPieceFirst(c.env, 'rabbi.geography', candidates)
      : Promise.resolve(undefined),
  ]);
  if (want('relationships')) pieces.relationships = relationships;
  if (want('geography')) pieces.geography = geography;
  const piece: EntityPiece = {
    type: 'rabbi',
    id: slug,
    name,
    nameHe: nameHe || undefined,
    pieces,
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
  if (!profile && !significance && !figures)
    return c.json({ error: 'not found (no cached pieces)' }, 404);
  const piece: EntityPiece = {
    type: 'place',
    id: name,
    name,
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
  const store = artifactStore(c.env);
  const key = store.keyFor(enrichKeyInfo(def), {
    instanceId: iid,
    unit: { work: tractate, unit: page },
    lang,
  });
  const hit = (await store.get(key)) as RunResultEnrichment | null;
  const cached = hit?.recipe_hash ?? null;
  // The recipe compare goes through store.staleness ('stale-recipe' → this
  // endpoint's 'stale'); 'miss' (nothing cached) and 'unknown' (pre-stamp
  // entry — keyed off the TOP-LEVEL recipe_hash, exactly as before) stay
  // handler-side so the JSON shape and tri-state are byte-identical.
  const status = !hit
    ? 'miss'
    : !cached
      ? 'unknown'
      : (await store.staleness(hit as StoredArtifact, { recipeHash: current })) === 'fresh'
        ? 'fresh'
        : 'stale';
  return c.json({
    id,
    tractate,
    page,
    lang,
    status,
    cached_recipe: cached,
    current_recipe: current,
  });
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
  if (!c.env.ENRICHMENT_QUEUE)
    return c.json({ error: 'ENRICHMENT_QUEUE binding not available' }, 503);
  const gate = await checkBudget(c.env, { custom: false });
  if (!gate.ok) {
    return c.json(
      {
        status: 'error',
        error: pauseErrorMessage(gate.scope),
        paused: true,
        scope: gate.scope,
        retryAfter: pauseRetryAfterSec(gate.until),
      },
      429,
    );
  }
  const id = c.req.param('id');
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const lang: 'en' | 'he' = c.req.query('lang') === 'he' ? 'he' : 'en';
  const rev = reverseDependencyIndex(await liveProducerNodes(c.env));
  const cascade = [id, ...transitiveDependents(rev, id)];
  const runId = `rewarm:${id}:${tractate}:${page}:${lang}:${Math.floor(Date.now() / 1000)}`
    .replace(/[^a-zA-Z0-9._:-]+/g, '_')
    .slice(0, 200);
  await c.env.ENRICHMENT_QUEUE.send({
    runId,
    warm_deep: true,
    rewarm_only: cascade,
    tractate,
    page,
    ...(lang === 'he' ? { lang } : {}),
  });
  return c.json({ status: 'pending', runId, id, tractate, page, lang, cascade });
});

app.get('/api/enrichments', async (c) => {
  // Merge KV + code-defined. KV wins on collision. Code-defined entries are
  // normalized to the KV-flat shape (extractor flattened, `mark` instead of
  // `target_mark`) so the client gets one consistent shape.
  const kv = await listEnrichments(c.env);
  const kvIds = new Set(kv.map((e) => e.id));
  const codeFlat: Array<EnrichmentDefinition & { mode?: string }> = CODE_ENRICHMENTS.filter(
    (e) => !kvIds.has(e.id),
  )
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
      user_prompt_template: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>)
        .user_prompt_template,
      model: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).model,
      output_schema: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).output_schema,
      thinking_off: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).thinking_off,
      reasoning_effort: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>)
        .reasoning_effort,
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
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
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

// GemaraSlice / CommentariesSlice shapes live in run-sources.ts (the source
// resolvers consume them); the cached fetchers stay here (they serve routes +
// other run paths too).
const SLICE_TTL_S = 30 * 24 * 3600;

async function getGemaraSlice(
  env: Bindings,
  tractate: string,
  page: string,
  bypass: boolean,
): Promise<GemaraSlice> {
  const cache = env.CACHE;
  const key = keyForGemara(tractate, page);
  if (cache && !bypass) {
    const cached = await cache.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as GemaraSlice;
      } catch {
        /* fall through */
      }
    }
  }
  const [hb, sef, segs] = await Promise.all([
    getHebrewBooksDafCached(cache, tractate, page),
    getSefariaPageCached(cache, tractate, page),
    getSefariaSegmentsCached(cache, tractate, page),
  ]);
  const slice: GemaraSlice = {
    tractate,
    page,
    hebrew: hb?.main ?? sef?.mainText.hebrew ?? '',
    english: sef?.mainText.english ?? '',
    segments_he: (segs?.he ?? []).map(stripHtmlServer),
    segments_en: (segs?.en ?? []).map(stripHtmlServer),
  };
  if (cache) await cache.put(key, JSON.stringify(slice), { expirationTtl: SLICE_TTL_S });
  return slice;
}

async function getCommentariesSlice(
  env: Bindings,
  tractate: string,
  page: string,
  bypass: boolean,
): Promise<CommentariesSlice> {
  const cache = env.CACHE;
  const key = keyForCommentaries(tractate, page);
  if (cache && !bypass) {
    const cached = await cache.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as CommentariesSlice;
      } catch {
        /* fall through */
      }
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
/** Strip Sefaria footnote markup + tags so a Yerushalmi passage reads clean. */
function cleanYerushalmiText(s: string): string {
  return stripHtmlServer(
    s.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, '').replace(/<i class="footnote">[\s\S]*?<\/i>/g, ''),
  ).trim();
}

/** A curated Bavli<->Yerushalmi parallel for a daf, with the Yerushalmi text
 *  fetched + its editorial title/summary. The grounding-confidence tier above
 *  the mishnah-mapping (a human curated this exact cross-reference). */
interface CuratedYerushalmiPassage {
  ref: string;
  title: string;
  summary: string;
  url: string;
  bavliAnchor: string;
  hebrew: string;
  english: string;
}

/** Fetch the Yerushalmi text for curated parallels on a daf (few per daf, often
 *  0-1). Each failure contributes nothing. */
async function fetchCuratedYerushalmi(
  parallels: CuratedYerushalmiParallel[],
): Promise<CuratedYerushalmiPassage[]> {
  const flat = (x: unknown): string =>
    Array.isArray(x) ? x.map(flat).join(' ') : typeof x === 'string' ? x : '';
  const out: CuratedYerushalmiPassage[] = [];
  await Promise.all(
    parallels.map(async (p) => {
      try {
        const res = await sefariaAPI.getText(p.yerushalmi, { context: 0 });
        out.push({
          ref: p.yerushalmi,
          title: p.title,
          summary: p.summary,
          url: p.url,
          bavliAnchor: p.bavli,
          hebrew: cleanYerushalmiText(flat(res.he)),
          english: cleanYerushalmiText(flat(res.text)),
        });
      } catch {
        /* skip on fetch failure */
      }
    }),
  );
  return out;
}

function formatYerushalmiForPrompt(
  bundle: Awaited<ReturnType<typeof getYerushalmiCached>>,
  curated: CuratedYerushalmiPassage[],
  outline: Awaited<ReturnType<typeof buildYerushalmiOutline>>,
  floor: YerushalmiFloorGroup[],
): string {
  // Curated parallels first — a human confirmed this exact cross-reference, so
  // it's the highest-confidence grounding (and often cross-tractate, which the
  // mishnah-mapping can't find).
  const curatedBlocks = curated.map((c) => {
    const he = truncateForPrompt(c.hebrew, 1600);
    const en = truncateForPrompt(c.english, 2000);
    return `[${c.ref}] CONFIRMED curated parallel — "${c.title}" (anchors Bavli ${c.bavliAnchor}). Editorial note: ${c.summary}\nHE: ${he}\nEN: ${en}`.trim();
  });
  const mishnahBlocks = bundle.map((y) => {
    const he = truncateForPrompt(stripHtmlServer(y.hebrew), 1400);
    const en = truncateForPrompt(stripHtmlServer(y.english), 1800);
    const range =
      y.anchorStartSeg === y.anchorEndSeg
        ? `Bavli segment ${y.anchorStartSeg}`
        : `Bavli segments ${y.anchorStartSeg}-${y.anchorEndSeg}`;
    return `[${y.ref}] (parallels ${range}, via ${y.mishnahRef})\nHE: ${he}\nEN: ${en}`.trim();
  });
  // The ALIGNED dafyomi outline — the richest grounding for stating DIFFERENCES:
  // a clean English point-by-point summary of exactly what the Yerushalmi says,
  // EACH POINT TAGGED with the Bavli segment [N] it parallels (or [diverges] when
  // the Yerushalmi goes its own way). This lets the producer contrast the two
  // part-by-part instead of in the aggregate.
  const outlineLines: string[] = [];
  let lastTopic: string | null = null;
  for (const p of outline) {
    if (!p.en) continue;
    if (p.topic && p.topic !== lastTopic) {
      lastTopic = p.topic;
      outlineLines.push(`• ${p.topic}${p.yerushalmiRef ? ` (${p.yerushalmiRef})` : ''}`);
    }
    const where = p.segIdx != null ? `[Bavli seg ${p.segIdx}]` : `[diverges]`;
    const he = truncateForPrompt(p.he, 240);
    outlineLines.push(
      `    ${where} ${p.label ?? ''} ${truncateForPrompt(p.en, 320)}${he ? `  | HE: ${he}` : ''}`
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }

  if (curatedBlocks.length === 0 && mishnahBlocks.length === 0 && outlineLines.length === 0) {
    return '(no Yerushalmi parallel found for this daf)';
  }
  const out: string[] = [];
  // REQUIRED ANCHORS first — the spans where a long phrase is PROVABLY shared
  // between the two Talmuds (a shared mishnah/baraita). The model must emit one
  // instance per anchor; the prompt rules below make this mandatory. This is what
  // fixes the under-firing: WHERE is decided deterministically, the model only
  // writes the differences.
  if (floor.length) {
    const reqLines = floor.map((g) => {
      const span =
        g.startSegIdx === g.endSegIdx
          ? `Bavli segment ${g.startSegIdx}`
          : `Bavli segments ${g.startSegIdx}-${g.endSegIdx}`;
      const ref = g.yerushalmiRef ? ` parallels ${g.yerushalmiRef}` : '';
      const phrase = g.excerpt ? ` — shared verbatim phrase: "${g.excerpt}"` : '';
      return `- ${span}${ref}${phrase}`;
    });
    out.push(
      'REQUIRED ANCHORS (each is a Bavli span that shares a long verbatim phrase with the Yerushalmi — a shared mishnah/baraita, proven by alignment). You MUST return one instance for EACH, using its segment range, and write its `differences` (if the two are essentially identical there, say so plainly):\n' +
        reqLines.join('\n'),
    );
  }
  if (outlineLines.length) {
    out.push(
      'ALIGNED YERUSHALMI OUTLINE (dafyomi.co.il "Yerushalmi to Match"; each point is tagged with the Bavli segment [N] it parallels verbatim, or [diverges] where the Yerushalmi differs — USE THIS to state specific, part-by-part differences):\n' +
        outlineLines.join('\n'),
    );
  }
  const blocks = [...curatedBlocks, ...mishnahBlocks];
  if (blocks.length)
    out.push(`Full parallel Yerushalmi passage(s):\n${blocks.join('\n\n---\n\n')}`);
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
      return v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2);
    }
    if (key.startsWith('anchors.')) {
      const id = key.slice('anchors.'.length);
      const a = (vars.anchors ?? {}) as Record<string, unknown>;
      const v = a[id];
      return v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2);
    }
    const v = vars[key];
    if (v === undefined || v === null) return '';
    return typeof v === 'string' ? v : JSON.stringify(v);
  });
}

// ===========================================================================
// Definition lookup — KV first, then code-defined fallback; both shapes
// adapted to what the runner expects. The single resolution implementation
// lives in producer-registry.ts (resolve → Producer → project back); the
// `loadMarkDef` / `loadEnrichmentDef` imported at the top of this file are
// thin, behavior-identical projections over it.
// ===========================================================================

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

// The walk itself (ResolvedInputs assembly, cycle detection, fanOut, the
// sourcesOnly transitive closure) is corpus-agnostic and lives in
// @corpus/core/run/producer-run; the source-text resolvers ('gemara',
// 'commentaries', 'context', …) live in ./run-sources. This file wires the
// two together: the resolvers wrap helpers that stay index-private (they also
// serve routes / other run paths), and the recursion ports point back at
// runEnrichmentOnce / runMarkOnce below.
const RUN_SOURCE_RESOLVERS = buildSourceResolvers({
  getGemaraSlice,
  getCommentariesSlice,
  readMarkInstances,
  computeDafBridge,
  fetchCuratedYerushalmi,
  buildYerushalmiOutline,
  formatYerushalmiForPrompt,
});

const RESOLVE_PORTS: ResolveInputsPorts<RunCtx, EnrichmentDefinition, SchemaMarkDefinition> = {
  sources: RUN_SOURCE_RESOLVERS,
  defaultSource: 'gemara',
  loadEnrichmentDef: (rc, id) => loadEnrichmentDef(rc.env, id),
  loadMarkDef: (rc, id) => loadMarkDef(rc.env, id),
  runEnrichment: (rc, def, tractate, page, markInput, bypassCache, parentChain) =>
    runEnrichmentOnce(rc, def, tractate, page, markInput, bypassCache, undefined, parentChain),
  runMark: (rc, def, tractate, page, bypassCache) =>
    runMarkOnce(rc, def, tractate, page, bypassCache),
};

export async function resolveDependencies(
  rc: RunCtx,
  dependencies: ReadonlyArray<EnrichmentDependency> | ReadonlyArray<MarkDependency> | undefined,
  tractate: string,
  page: string,
  markInput: unknown,
  bypassCache: boolean,
  parentChain: ReadonlySet<string>,
  /** When true, resolve ONLY the deterministic source TEXTS (gemara /
   *  commentaries / mishna / halacha-refs / yerushalmi-text / context — all
   *  cached KV reads, no LLM). Instead of RUNNING the `{enrichment}` / `{mark}`
   *  deps (which would generate), it recurses into them to gather their
   *  transitive source closure — so an aggregate surfaces every text feeding its
   *  whole tree. Used by the read-only /api/run-sources inspector endpoint, so
   *  opening the dev inspector never re-runs a model. */
  sourcesOnly = false,
): Promise<ResolvedInputs> {
  return resolveInputs(
    RESOLVE_PORTS,
    rc,
    dependencies,
    tractate,
    page,
    markInput,
    bypassCache,
    parentChain,
    sourcesOnly,
  );
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
  // What this entry cost to GENERATE, stamped at write time. The cache is
  // permanent, so this makes it the durable per-daf / per-version cost record:
  // "what did the current version of daf X cost" = sum over its entries' cost;
  // "earlier versions" = sum over the superseded-version keys. Absent on
  // computed (no-LLM) marks and on entries written before this field existed.
  cost?: CostStamp;
}

/** Generation cost stamped onto a cache entry — the permanent per-entry ledger. */
interface CostStamp {
  /** OpenRouter billed USD (net of prompt-cache); null on Workers AI / unpriced. */
  billedUsd: number | null;
  /** List-price estimate total; null when the model has no known rate. */
  estimatedUsd: number | null;
  /** Estimate split so input-vs-output dollars are answerable per entry. */
  costInUsd: number | null;
  costOutUsd: number | null;
  tokensIn: number;
  tokensOut: number;
  lang: 'en' | 'he';
  cacheVersion: string;
  computedAt: number;
}

/** Build the per-entry cost stamp from a completed LLM result. Reuses the same
 *  pricing helpers as the budget guard and daily rollup so every cost figure in
 *  the system is computed one way. */
function costStampOf(
  model: string | undefined,
  usage: LLMUsage | null | undefined,
  lang: 'en' | 'he',
  cacheVersion: string,
): CostStamp {
  const { input, output } = normalizeUsage(usage as Parameters<typeof normalizeUsage>[0]);
  const { costInUsd, costOutUsd } = costSplitUsd(
    model,
    usage as Parameters<typeof costSplitUsd>[1],
  );
  const billed = usage && typeof usage.cost === 'number' ? usage.cost : null;
  return {
    billedUsd: billed,
    estimatedUsd: priceCostUsd(model, usage as Parameters<typeof priceCostUsd>[1]),
    costInUsd,
    costOutUsd,
    tokensIn: input,
    tokensOut: output,
    lang,
    cacheVersion,
    computedAt: Date.now(),
  };
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

// ===========================================================================
// ArtifactStore — the ONE storage chokepoint for producer outputs (the
// `mark:` / `enrich:` keys). Key derivation delegates to the frozen
// cache-keys contract via talmudLegacyKeyScheme (byte parity locked by
// store-key-parity.test.ts); reads keep readCachedResult's exact semantics
// (null on miss, null on corrupt JSON); writes enforce the HUMAN-EDIT GUARD
// (ArtifactStore.put — a human-authored entry is never overwritten by
// rule/AI output). Source-cache keys (ctx:*, sefaria-bundle:*, …) and the
// `job:{runId}` polling records are NOT artifacts and stay on direct KV.
// ===========================================================================

const ARTIFACT_SCHEME = talmudLegacyKeyScheme();
/** Key-derivation-only backing when CACHE is absent: every read misses and
 *  writes/evictions are no-ops — the same observable behavior the direct-KV
 *  sites had behind their `if (!env.CACHE)` guards. */
const NOOP_KV: KVStore = {
  get: async () => null,
  put: async () => {},
  delete: async () => {},
};
function artifactStore(env: Bindings): ArtifactStore {
  return new ArtifactStore(env.CACHE ?? NOOP_KV, ARTIFACT_SCHEME);
}

/** ProducerKeyInfo for a loaded mark def. The store derives hasHePrompt from
 *  the extractor's system_prompt_he, which is what applies the production
 *  he-collapse rule (a lang='he' request keys onto ':he' only when the mark
 *  has a Hebrew prompt; otherwise it collapses to the English key). */
function markKeyInfo(def: SchemaMarkDefinition) {
  return {
    id: def.id,
    cacheVersion: def.cache_version,
    scope: 'local' as const,
    key_shape: 'mark' as const,
    recipe: { extractor: def.extractor },
  };
}

/** ProducerKeyInfo for a loaded enrichment def. The scheme applies the daf to
 *  the key per def.scope (local uses tractate+page, global omits it) exactly
 *  as the legacy keyForEnrichment call sites did. */
function enrichKeyInfo(def: EnrichmentDefinition) {
  return {
    id: def.id,
    cacheVersion: def.cache_version,
    scope: def.scope,
    key_shape: 'enrich' as const,
  };
}

async function readCachedResult(env: Bindings, key: string): Promise<RunResult | null> {
  if (!env.CACHE) return null;
  return (await artifactStore(env).get(key)) as RunResult | null;
}

async function writeCachedResult(env: Bindings, key: string, result: RunResult): Promise<void> {
  if (!env.CACHE) return;
  // No TTL — outputs are deterministic per (def_hash, cache_version, daf
  // or instance). The canonical way to force a recache is to bump
  // cache_version on the definition (old key becomes unreachable) or
  // call /api/run with bypass_cache=true. A TTL on top of that
  // just makes warmed pages silently rot — measured pain: full-shas
  // warming costs ~$1000 and ~17 days; we don't want it expiring on us.
  //
  // HUMAN-EDIT GUARD (live at this chokepoint): store.put refuses to
  // overwrite a human-authored entry (provenance.authority === 'human') with
  // rule/AI output. The refusal is deliberately SILENT — the fresh result is
  // still returned/served to the caller, it just isn't persisted over the
  // human edit (the never-clobber rule applied at write time).
  await artifactStore(env).put(key, result as unknown as StoredArtifact);
}

/** Computed-mark function signature. Receives env + (tractate, page) and
 *  returns the parsed mark output. Used for marks whose data comes from a
 *  deterministic source (e.g. Sefaria) rather than an LLM. */
type ComputedMarkFn = (
  env: Bindings,
  tractate: string,
  page: string,
  // `transient: true` means "serve-but-don't-write": the result was assembled
  // from whatever upstream is cached, but a declared dependency mark's cache
  // entry was ABSENT (not yet computed), so this result is not-ready and must
  // not be pinned to the EN key. The computedMark hook propagates it onto the
  // envelope so run-producer skips the write. (Mirrors enrichmentPreResolve's
  // transient contract.)
) => Promise<{ instances: unknown[]; transient?: boolean }>;

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
    const bySeg = new Map<
      number,
      Array<{ work: string; workHe: string; textHe: string; textEn: string; sourceRef: string }>
    >();
    for (const work of result.works) {
      if (!isRishonTitle(work.title)) continue;
      for (const c of work.comments) {
        const list = bySeg.get(c.anchorSegIdx) ?? [];
        list.push({
          work: work.title,
          workHe: work.titleHe,
          textHe: c.textHe,
          textEn: c.textEn,
          sourceRef: c.sourceRef,
        });
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
  // Whole-daf geography map — assembles the DafGeoModel SERVER-SIDE from cached
  // inputs only (NO LLM, NO generation; only KV reads), so it can never spin.
  // The single anchorless instance's `fields.model` is the DafGeoModel the
  // sidebar's geography-map block renders.
  'geography-model': (env, tractate, page) => computeGeographyModel(env, tractate, page),
};

/**
 * The `geography` computed mark's body — exported for direct unit testing
 * (seed KV with the rabbi + places marks + rabbi.geography → assert the model).
 * Reads ONLY cached inputs; never an LLM run, so it can't spin.
 */
export async function computeGeographyModel(
  env: Bindings,
  tractate: string,
  page: string,
): Promise<{ instances: Array<{ fields: { model: unknown } }>; transient?: boolean }> {
  // NOT-READY GUARD (cold daf, mark race). The geography mark DECLARES
  // dependencies on the `rabbi` + `places` marks, but the client enables all
  // marks concurrently on a cold daf — if geography wins the race, those marks
  // haven't been computed yet and readMarkInstances returns [] for the same
  // reason a genuinely rabbi-less daf returns []. Telling those apart needs the
  // raw cache ENTRY: present (even with empty instances) = computed = genuine;
  // ABSENT = not computed yet = not-ready. A not-ready model must NOT be cached
  // (this is a no-LLM computed mark — once an empty model is pinned to the EN
  // key it never recomputes until a cache_version bump). We mark the result
  // `transient` so it renders this view but isn't pinned; the next request
  // recomputes until rabbi+places are warm, then it caches normally.
  // Readiness gates on the RABBI mark ONLY — it is the load-bearing input
  // (rabbis place the dots). The `places` mark is OPTIONAL (it only adds
  // city-mention dots); gating on it too meant a daf where `places` is
  // disabled/never-enqueued stayed transient forever, re-firing on every open
  // and never settling (the places cache is permanently absent). So: rabbi
  // absent = not-ready (transient, recompute next request); places absent =
  // just no mentions, settle on the rabbi data.
  const rabbiDef = findCodeMark('rabbi');
  const rabbiEntry = rabbiDef
    ? await readCachedResult(env, keyForMark(rabbiDef, tractate, page, 'en'))
    : null;
  const notReady = rabbiEntry === null;

  // 1. The daf's rabbis (the `rabbi` mark) — name / nameHe / slug / generation.
  const rabbiInsts = await readMarkInstances(env, 'rabbi', tractate, page);
  // 2. On-daf place mentions (the `places` mark).
  const placeInsts = await readMarkInstances(env, 'places', tractate, page);
  const placeMentions = placeInsts.map((i) => ({
    name: typeof i.fields?.name === 'string' ? i.fields.name : undefined,
    nameHe: typeof i.fields?.nameHe === 'string' ? i.fields.nameHe : undefined,
  }));

  // 3. Per slugged rabbi: read the CACHED rabbi.geography GLOBAL enrichment
  //    (alias-probed, never an LLM run). Registry identity (places / region /
  //    moved) comes from enrichRabbi — the same deterministic rabbi-places
  //    join the entity endpoint and the per-rabbi card use.
  const sources: RabbiGeoSource[] = await Promise.all(
    rabbiInsts.map(async (i): Promise<RabbiGeoSource> => {
      const name = typeof i.fields?.name === 'string' ? i.fields.name : '';
      const nameHe = typeof i.fields?.nameHe === 'string' ? i.fields.nameHe : '';
      const slug = typeof i.fields?.slug === 'string' ? i.fields.slug : null;
      const generation =
        typeof i.fields?.generation === 'string'
          ? (i.fields.generation as GenerationId)
          : 'unknown';
      // Derive registry identity the SAME way the rabbi.identity short-circuit
      // does: a grounded slug → direct dataset join (enrichRabbiBySlug, NO name
      // re-resolution — re-resolving a grounded "Rav Kahana" by name is
      // first-wins and homonym-blind, landing on the wrong same-name bearer).
      // Only fall back to the name-keyed enrichRabbi for ungrounded instances
      // (older cached mark runs with no slug stamp).
      const ident =
        (slug ? enrichRabbiBySlug(slug, name, nameHe, generation) : null) ??
        enrichRabbi(name, nameHe, generation);
      // Alias-probe the global rabbi.geography by the display name(s) the
      // warming surface may have used (same approach as the entity endpoint's
      // readGlobalPieceFirst — an entry warmed under a registry alias still
      // surfaces). nameHe rides along so a he-keyed entry matches too.
      //
      // KNOWN FRESHNESS GAP (deferred — see the geography mark def in
      // code-marks.ts): this rabbi.geography GLOBAL enrichment is a real input
      // but CANNOT be declared as a mark dependency (MarkDependency forbids
      // mark→enrichment deps). So if a rabbi's rabbi.geography warms/changes
      // after this model is cached, the staleness cascade won't notice — the
      // recompute trigger is a cache_version bump or a rabbi/places dep change.
      const candidates = [{ name, nameHe }];
      if (ident.name && ident.name !== name) candidates.push({ name: ident.name, nameHe });
      const geo = (await readGlobalPieceFirst(
        env,
        'rabbi.geography',
        candidates,
      )) as GeoEnrichment | null;
      return {
        name: name || ident.name,
        slug,
        identity: { places: ident.places, region: ident.region ?? null, moved: ident.moved },
        geography: geo,
        // The resolved generation (ident.generation fills an 'unknown' instance
        // generation from the registry when it can) — the region fallback of
        // last resort, so an ungrounded amora/tanna still buckets into a region.
        generation: ident.generation,
      };
    }),
  );

  const model = buildGeoModel(sources, placeMentions);
  return { instances: [{ fields: { model } }], ...(notReady ? { transient: true } : {}) };
}

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

  const renderAndCall = async (
    anchorsOverride: Record<string, unknown>,
    maxTokens: number,
    segRange?: { start: number; end: number },
  ) => {
    const callVars: Record<string, unknown> = { ...baseVars, anchors: anchorsOverride };
    // Fan-out scoping: when this call covers a single section, send only that
    // section's Hebrew segments instead of the whole amud. Pre-number the lines
    // with their GLOBAL segment index (the exact [N] labels renderTemplate emits
    // for the full array) so excerpt anchoring and the section-range move ids
    // stay valid; passing a string makes renderTemplate skip its array path and
    // emit it verbatim. Cuts (sections-1)x the amud's Hebrew per daf — the
    // section text is the only large payload that was duplicated across calls.
    if (segRange && Array.isArray(baseVars.segments_he)) {
      const full = baseVars.segments_he as string[];
      const sliced = full.map((s, i) => `[${i}] ${s}`).slice(segRange.start, segRange.end + 1);
      // Only narrow when the range actually selects segments. An out-of-range
      // section (data drift between the parent mark and the slice) falls back
      // to the full amud rather than sending an empty source.
      if (sliced.length > 0) callVars.segments_he = sliced.join('\n');
    }
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
      wave.map((inst) => {
        // Type-check BEFORE any coercion: Number(null) / Number('') === 0, which
        // would turn a malformed section into a bogus 0-0 range and silently
        // send only segment 0. A non-number index falls back to full-daf text.
        const rawStart = (inst as { startSegIdx?: unknown }).startSegIdx;
        const rawEnd = (inst as { endSegIdx?: unknown }).endSegIdx;
        const segRange =
          typeof rawStart === 'number' &&
          Number.isInteger(rawStart) &&
          typeof rawEnd === 'number' &&
          Number.isInteger(rawEnd) &&
          rawStart >= 0 &&
          rawEnd >= rawStart
            ? { start: rawStart, end: rawEnd }
            : undefined;
        return renderAndCall({ ...anchors, [fanOutMarkId]: [inst] }, 8000, segRange);
      }),
    );
    for (const { r, systemPrompt, userPrompt } of settled) {
      if (!sysSample) {
        sysSample = systemPrompt;
        userSample = userPrompt;
      }
      // A section whose JSON won't parse is a hard failure — throw so the daf
      // isn't cached with a section's moves silently missing.
      let p: { instances?: unknown[] };
      try {
        p = JSON.parse(r.content) as { instances?: unknown[] };
      } catch (err) {
        throw new Error(
          `fan-out ${fanOutMarkId}: section JSON parse failed: ${String(err).slice(0, 120)}`,
        );
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
        // Sum the billed cost too, so the synthesized result (and the cache
        // entry's cost stamp built from it) reflects what the fanned-out
        // subcalls actually cost — not null, which would force a list-price
        // fallback and drop the prompt-cache discount. (Budget + per-call ledger
        // already saw each subcall's cost inside runLLM; this is for the stamp.)
        // NOTE: the synthesized `model` is the LAST subcall's, so the stamp's
        // list-price *estimate* assumes one model. That estimate is only a
        // fallback used when billed cost is absent — and the only fanned-out
        // models (OpenRouter deepseek) DO report billed cost (summed here, and
        // preferred over the estimate), while Workers AI models have no list
        // price at all. So a mixed-model fan-out never produces a wrong dollar
        // figure in practice; billed wins.
        if (typeof r.usage.cost === 'number') usage.cost = (usage.cost ?? 0) + r.usage.cost;
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
export function postProcessRabbi(parsed: unknown, hebrewText: string): unknown {
  const p = parsed as {
    instances?: Array<{ fields?: { name?: string; nameHe?: string; generation?: string } }>;
  } | null;
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
      // Keep the model's (or the augment's 'unknown') generation here. The
      // registry fill for still-unknown generations happens AFTER grounding
      // (fillUngroundedGenerations) — a name-keyed first-wins registry guess
      // must not masquerade as the LLM's local generation read inside the
      // homonym era-consistency veto.
      fields: {
        name: r.name,
        nameHe: r.nameHe,
        generation: r.generation,
      },
    })),
  };
}

// After grounding: fill an 'unknown' generation from the rabbi-places registry
// ONLY for instances the hierarchy registry has no opinion on (genSource
// 'none') — so a model-missed later authority (Rashi, a named Gaon, …) still
// lands on the right tier instead of neutral gray. Grounded instances already
// carry the authoritative registry era, and 'ambiguous' homonyms stay honestly
// 'unknown' (a name-keyed first-wins fill is precisely the homonym guess
// grounding just refused to make).
export function fillUngroundedGenerations(parsed: unknown): unknown {
  const p = parsed as {
    instances?: Array<{
      fields?: { name?: string; nameHe?: string; generation?: string; genSource?: string };
    }>;
  } | null;
  if (!p || !Array.isArray(p.instances)) return parsed;
  for (const inst of p.instances) {
    const f = inst.fields;
    if (f?.genSource !== 'none' || f.generation !== 'unknown') continue;
    f.generation = resolveGeneration(String(f.name ?? ''), String(f.nameHe ?? ''), 'unknown');
  }
  return parsed;
}

// ===========================================================================
// runMarkOnce / runEnrichmentOnce — thin shims over the ONE corpus-agnostic
// runProducer orchestration (@corpus/core/run/run-producer). Everything
// app-specific enters through RUN_PORTS: key derivation (the same
// keyForMark / keyForEnrichment as always), cache I/O (readCachedResult /
// writeCachedResult, which route through the ArtifactStore — so every
// run-path write passes the human-edit guard), the LLM call + option
// construction (incl. the argument-move fan-out), the check layer, and the
// id-keyed short-circuits (rabbi graph/identity/observations, the pesukim
// Hebrew prefetch, argument move-scoping, rabbi/places mark post-processing)
// — all CUT from the two legacy bodies, not copied. Core owns the
// orchestration (cache read/hit, dependency walk, he-prompt fallback, parse,
// hard-issue gating with bounded lint retries, the per-kind envelope shape)
// and ADDITIVELY stamps the `provenance` build manifest on every fresh write.
// ===========================================================================

const RUN_PORTS: RunProducerPorts<RunCtx, EnrichmentDefinition, SchemaMarkDefinition> = {
  cacheRead: (rc, key) => readCachedResult(rc.env, key),
  cacheWrite: (rc, key, value) => writeCachedResult(rc.env, key, value as RunResult),
  // Both key ports derive through the SAME scheme as cacheKeyForRunBody, so
  // the 202 cacheKey, the queued job, and the write-through can never disagree
  // (a spine-scoped def would otherwise throw here while deriving a valid
  // tractate-only key there). runProducer passes the RESOLVED mark lang, so
  // the scheme's he-collapse is idempotent on this path.
  markKey: (def, tractate, page, lang) =>
    ARTIFACT_SCHEME.key(producerKeyInfo(markKeyInfo(def)), {
      unit: { work: tractate, unit: page },
      lang,
    }),
  enrichmentKey: (def, instanceId, tractate, page, qualifier, lang) =>
    ARTIFACT_SCHEME.key(producerKeyInfo(enrichKeyInfo(def)), {
      instanceId,
      unit: { work: tractate, unit: page },
      qualifier,
      lang,
    }),
  enrichmentRecipeHash: (def) => recipeHash(enrichmentRecipe(def)),
  sectionRange: (def, markInput) => sectionRangeOf(def, markInput),
  resolveInputs: (rc, dependencies, tractate, page, markInput, bypassCache, parentChain) =>
    resolveInputs(
      RESOLVE_PORTS,
      rc,
      dependencies,
      tractate,
      page,
      markInput,
      bypassCache,
      parentChain,
    ),
  renderTemplate: (tpl, vars) => renderTemplate(tpl, vars),
  markLLM: async (rc, a) => {
    const ext = a.def.extractor as LLMExtractor;
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
      bypass_cache: a.bypassCache,
      // Cost-ledger attribution; the fan-out path spreads llmOptsBase, so this
      // tags every argument-move sub-call too.
      tag: `mark:${a.def.id}`,
      attribution: {
        kind: 'mark' as const,
        producerId: a.def.id,
        tractate: a.tractate,
        page: a.page,
        lang: a.useHe ? ('he' as const) : ('en' as const),
        cache_version: a.def.cache_version,
      },
    };
    if (ext.fan_out_over) {
      const fanned = await runExtractorFannedOut(
        rc,
        { ...ext, system_prompt: a.sysTpl, user_prompt_template: a.usrTpl },
        a.vars,
        ext.fan_out_over,
        llmOptsBase,
      );
      return {
        result: fanned.result,
        systemPrompt: fanned.systemPromptSample,
        userPrompt: fanned.userPromptSample,
      };
    }
    const systemPrompt = renderTemplate(a.sysTpl, a.vars);
    const userPrompt = renderTemplate(a.usrTpl, a.vars);
    const result = await runLLM(rc.env, {
      ...llmOptsBase,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 16000,
    });
    return { result, systemPrompt, userPrompt };
  },
  enrichmentLLM: async (rc, a) => {
    const def = a.def;
    const model = (a.modelOverride as LLMModelId | undefined) ?? def.model;
    return runLLM(rc.env, {
      ...(model ? { model } : {}),
      messages: [
        { role: 'system', content: a.systemPrompt },
        { role: 'user', content: a.userPrompt },
      ],
      max_tokens: 16000,
      temperature: 0.2,
      response_format: def.output_schema
        ? { type: 'json_schema', json_schema: def.output_schema }
        : undefined,
      thinking: def.thinking_off ? false : undefined,
      reasoning_effort: def.reasoning_effort,
      bypass_cache: a.bypassCache,
      tag: `enrich:${def.id}`,
      attribution: {
        kind: def.id.endsWith('.qa') ? ('qa' as const) : ('enrichment' as const),
        producerId: def.id,
        tractate: a.tractate,
        page: a.page,
        lang: a.useHe ? ('he' as const) : ('en' as const),
        cache_version: def.cache_version,
      },
      // Custom Q&A enrichments (<mark>.qa) count against the hourly custom-question
      // budget; everything else only against the daily total. See ./budget.
      cost_class: def.id.endsWith('.qa') ? 'custom-question' : undefined,
    });
  },
  // Post-generation processing via the standardized check layer
  // (src/lib/check/passes.ts). A definition opts in via `passes: []` in
  // code-marks.ts. The transforms need the segment grid, so fetch the gemara
  // slice once when any check runs. Marks additionally hand through the
  // deterministic yerushalmi floor anchors the resolver stashed; enrichments
  // fetch the daf's real Rashi/Tosafot text when a check wants to verify
  // cited quotes against it.
  runChecks: async (rc, a) => {
    const slice = await getGemaraSlice(rc.env, a.tractate, a.page, false);
    if (a.kind === 'mark') {
      return runPasses(a.def.passes ?? [], a.parsed, {
        tractate: a.tractate,
        page: a.page,
        segmentsHe: slice.segments_he,
        defId: a.def.id,
        lang: rc.lang,
        // The yerushalmi-floor transform needs the deterministic floor anchors the
        // resolver stashed; harmless (and absent) for every other mark.
        yerushalmiFloor: a.inputs.vars.__yerushalmiFloor as YerushalmiFloorGroup[] | undefined,
      });
    }
    // commentary-verbatim needs the daf's real Rashi/Tosafot text to verify
    // cited quotes against — fetch it only when a check actually wants it.
    let commentaryHe: string[] | undefined;
    if (a.def.passes?.includes('commentary-verbatim')) {
      const com = await getCommentariesSlice(rc.env, a.tractate, a.page, false);
      commentaryHe = Object.values(com.by_commentator)
        .map((c) => stripHtmlServer(c.hebrew))
        .filter(Boolean);
    }
    return runPasses(a.def.passes ?? [], a.parsed, {
      tractate: a.tractate,
      page: a.page,
      segmentsHe: slice.segments_he,
      commentaryHe,
      defId: a.def.id,
      lang: rc.lang,
    });
  },
  lintGate: (rc, cacheKey, info) =>
    noteLintAttempt(rc.env, rc.ctx, cacheKey, {
      enrichmentId: info.producerId,
      tractate: info.tractate,
      page: info.page,
      lang: info.lang,
      issues: info.issues,
    }),
  costStamp: (model, usage, lang, cacheVersion) =>
    costStampOf(model, usage as LLMUsage | null | undefined, lang, cacheVersion),
  recordUsage: (rc, args) =>
    captureLlmUsage(rc, {
      kind: args.kind,
      id: args.id,
      result: args.result as {
        model?: string;
        usage?: LLMUsage | null;
        parse_error?: string | null;
      },
    }),
  hooks: {
    // Computed extractors — deterministic, no LLM. Same cache shape as LLM
    // results so the rest of the pipeline (caching, dependency resolution,
    // dev panel run-state) is uniform.
    computedMark: async (rc, def, tractate, page) => {
      const extractor = def.extractor;
      if (extractor.kind !== 'computed') {
        throw new Error(
          `mark ${def.id}: computedMark hook called for extractor.kind=${extractor.kind}`,
        );
      }
      const fn = COMPUTED_FNS[extractor.fn];
      if (!fn) throw new Error(`mark ${def.id}: no computed fn '${extractor.fn}' registered`);
      const t0 = Date.now();
      const raw = await fn(rc.env, tractate, page);
      // Split the serve-but-don't-write flag off the parsed body — it rides the
      // envelope (so run-producer skips the cache write), not the stored value.
      const { transient, ...parsed } = raw;
      const elapsed_ms = Date.now() - t0;
      const content = JSON.stringify(parsed);
      return {
        content,
        parsed,
        parse_error: null,
        model: `computed:${extractor.fn}`,
        transport: 'computed',
        attempts: 1,
        usage: null,
        elapsed_ms,
        prompt_chars: 0,
        resolved: {
          system_prompt: `(computed fn: ${extractor.fn})`,
          user_prompt: `(no LLM call — deterministic extraction from upstream data source)`,
        },
        cache_hit: false,
        ...(transient ? { transient: true } : {}),
      };
    },
    // Special cases that don't fit the segments-only transform signature yet:
    //   - rabbi:  needs the daf Hebrew text, not the segment grid (A1b will port it).
    //   - places: a side effect (backlog logging), not a parsed-output transform.
    markPostParse: async (rc, a) => {
      let parsed = a.parsed;
      if (parsed && a.def.id === 'rabbi') {
        parsed = postProcessRabbi(parsed, stripHtmlServer(String(a.vars.hebrew ?? '')));
        // Ground each rabbi's generation through the registry (relational homonym
        // disambiguation off the daf's cast): authoritative era when identified,
        // neutral 'unknown' for a homonym we can't pin — so the reader's era color
        // is grounded, not a freeform per-daf guess. Then fill the generations
        // grounding had no opinion on (genSource 'none') from rabbi-places.
        parsed = groundRabbiInstances(parsed);
        parsed = fillUngroundedGenerations(parsed);
      } else if (parsed && a.def.id === 'places') {
        // Places have no global gazetteer — log every observed location to the
        // "needs global enrichment" backlog so we can see what to add over time.
        recordObservedPlacesFromMark(rc, parsed, a.tractate, a.page);
      }
      return parsed;
    },
    enrichmentPreResolve: async (rc, a) => {
      const { def, markInput, tractate, page } = a;
      // Graph short-circuit for rabbi.relationships. Sefaria's rabbi graph
      // (src/lib/data/rabbi-hierarchy.json) is the source of truth for who
      // a rabbi's teachers/students/colleagues were — much more reliable than
      // an LLM call, deterministic, free, and instant. We only fall through to
      // the LLM when the graph misses (rabbi not found OR node has no edges).
      if (def.id === 'rabbi.relationships') {
        const inst = rabbiMarkInputFields(markInput);
        const envelope = (data: unknown, slug: string, transient?: boolean) => ({
          content: JSON.stringify(data),
          parsed: data,
          parse_error: null,
          model: `graph:${slug}`,
          transport: 'graph',
          attempts: 0,
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          elapsed_ms: 0,
          prompt_chars: 0,
          resolved: {
            system_prompt: `(graph lookup: ${slug})`,
            user_prompt: `(graph lookup for rabbi: ${inst.name || inst.nameHe})`,
          },
          cache_hit: false,
          recipe_hash: a.recipeHash,
          ...(transient ? { transient: true } : {}),
        });
        // Grounded instance → resolve the graph node by SLUG directly. A name
        // re-resolution here is first-wins and homonym-blind — it re-pinned
        // grounded "Rav Kahana" mentions to whatever bearer the index lists
        // first, contradicting the mark's own verdict.
        if (inst.slug) {
          const hit = lookupRelationshipsBySlug(inst.slug, inst.name || undefined);
          if (hit) return envelope(hit.data, hit.slug);
          // Pinned but edge-less node — fall through to the LLM path (the
          // prompt's mark_input now carries the slug as a disambiguator).
          return null;
        }
        // Grounding says AMBIGUOUS homonym: several registry rabbis share the
        // name and the daf evidence can't pin one. Do NOT first-win a graph
        // node and do NOT let the LLM guess — serve an honest empty payload.
        // `transient`: rabbi.relationships is scope-global keyed by the NAME
        // slug, which a later-resolved same-name instance shares; the degraded
        // payload must not occupy that key.
        if (inst.genSource === 'ambiguous') {
          const data: RelationshipsData = {
            teachers: [],
            students: [],
            debatePartners: [],
            family: [],
            prose:
              'Several rabbis in the sources share this name, and this mention ' +
              'could not be pinned to one of them — so no relationship map is shown.',
          };
          return envelope(data, 'ambiguous', true);
        }
        if (inst.name) {
          const hit = lookupRelationships(
            inst.name,
            inst.nameHe || undefined,
            // 'unknown' must not scope findSlug's generation-prefix step.
            inst.generation !== 'unknown' ? inst.generation : undefined,
          );
          if (hit) return envelope(hit.data, hit.slug);
          // Miss — fall through to the LLM path with the disambiguation prompt.
        }
        return null;
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
        //
        // KNOWN DEFERRED ISSUE (homonym cache collision): rabbi.identity is
        // scope-global keyed by instance id = the NAME slug, so every
        // same-name instance — ambiguous or resolved, and two DIFFERENTLY
        // resolved homonyms — shares one cache key. We don't change keys
        // (a key change cold-misses all of Shas). Mitigations here: (1) the
        // ambiguous path serves a degraded payload marked `transient`, which
        // runProducer serves WITHOUT writing, so it can't poison the shared
        // key; (2) the slug path joins the dataset directly (no name
        // first-wins). Residual: resolved homonyms sharing one name share one
        // cached identity entry (first writer wins on later cache hits), and
        // an ambiguous instance whose name already has a cached resolved
        // entry is served that entry by the cache-hit path upstream of this
        // hook. A real fix needs the slug in the cache key — deferred.
        const inst = rabbiMarkInputFields(markInput);
        // Grounded slug → direct dataset join, never a name re-resolution.
        let ident = inst.slug
          ? enrichRabbiBySlug(inst.slug, inst.name, inst.nameHe, inst.generation)
          : null;
        let transient = false;
        if (!ident && !inst.slug && inst.genSource === 'ambiguous') {
          // Grounding says: several registry rabbis share this name and the
          // daf evidence can't pin one. Serve an honest name-only identity —
          // a name join here would re-pin the first-listed bearer (the
          // "Rav Kahana → rav-kahana-(ii), amora-ey-1" defect).
          ident = {
            slug: null,
            name: inst.name || inst.nameHe,
            nameHe: inst.nameHe,
            generation: inst.generation,
            region: null,
            places: [],
            moved: null,
            bio: null,
            image: null,
            wiki: null,
            genSource: 'ambiguous',
            ...(inst.homonyms && inst.homonyms > 1 ? { homonyms: inst.homonyms } : {}),
          };
          transient = true;
        }
        if (!ident) {
          // Ungrounded instance (older cached mark runs) — the legacy
          // name-keyed join.
          ident = enrichRabbi(inst.name, inst.nameHe, inst.generation);
          // Rabbi not in the bundled dataset → add to the "needs global
          // enrichment" backlog so we can track who to add a base bio for as
          // usage grows. (Ambiguous homonyms are NOT recorded — they're in
          // the registry several times over, not missing from it.)
          if (!ident.slug && (inst.name || inst.nameHe)) {
            recordUnknownRabbi(rc.env, rc.ctx, {
              name: inst.name || undefined,
              nameHe: inst.nameHe || undefined,
              generation: inst.generation,
              tractate,
              page,
            });
          }
        }
        return {
          content: JSON.stringify(ident),
          parsed: ident,
          parse_error: null,
          model: ident.slug
            ? `lookup:${ident.slug}`
            : transient
              ? 'lookup:ambiguous'
              : 'lookup:miss',
          transport: 'lookup',
          attempts: 0,
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          elapsed_ms: 0,
          prompt_chars: 0,
          resolved: {
            system_prompt: '(deterministic lookup: rabbi-places.json)',
            user_prompt: `(identity lookup for rabbi: ${inst.name || inst.nameHe || '(unnamed)'})`,
          },
          cache_hit: false,
          recipe_hash: a.recipeHash,
          ...(transient ? { transient: true } : {}),
        };
      }
      return null;
    },
    enrichmentPostResolve: async (rc, a) => {
      const { def, inputs, markInput, tractate, page } = a;
      // Deterministic accumulation step — runs LAST (its mark deps are resolved
      // above) and writes per-rabbi observation slices to KV as a side effect.
      // No LLM. See runRabbiObservations + src/worker/rabbi-observations.ts.
      if (def.id === 'rabbi.observations') {
        return { shortCircuit: await runRabbiObservations(rc, def, tractate, page, inputs) };
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
          const pesukimAnchors = inputs.anchors.pesukim as
            | { fields?: { verseRef?: string } }[]
            | undefined;
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
        if (
          mi &&
          typeof mi.startSegIdx === 'number' &&
          typeof mi.endSegIdx === 'number' &&
          Array.isArray(all)
        ) {
          inputs.anchors['argument-move'] = selectSectionMoves(all as MoveLike[], {
            startSegIdx: mi.startSegIdx,
            endSegIdx: mi.endSegIdx,
          });
        }
      }
      return { vars: { pasuk_he: pasukHe, cross_refs_he: crossRefsHe } };
    },
    // daf-background.concepts has no global glossary — log every term it emits to
    // the observed-concept backlog so the canonical glossary can be grown from
    // real usage later (same collect-now pattern as observed-place).
    enrichmentPostParse: (rc, a) => {
      if (a.parsed && !a.parse_error && a.def.id === 'daf-background.concepts') {
        recordObservedConceptsFromEnrichment(rc, a.parsed, a.tractate, a.page);
      }
    },
  },
};

/** Fire a best-effort daf-index write off the request critical path. Errors are
 *  swallowed (the index is additive — a miss just falls back to enumerate-probe);
 *  `waitUntil` lets it finish after the response without adding run latency. */
function fireDafIndex(rc: RunCtx, p: Promise<void>): void {
  const done = p.catch(() => {});
  if (rc.ctx?.waitUntil) rc.ctx.waitUntil(done);
  else void done;
}

async function runMarkOnce(
  rc: RunCtx,
  def: SchemaMarkDefinition,
  tractate: string,
  page: string,
  bypassCache: boolean,
): Promise<RunResult> {
  const res = (await runProducer(RUN_PORTS, rc, 'mark', def, tractate, page, undefined, {
    bypassCache,
    lang: rc.lang,
  })) as RunResult;
  // Stamp the daf-index on a FRESH write only (a cache hit is already indexed).
  if (!res.cache_hit && rc.env.CACHE) {
    fireDafIndex(rc, recordMarkDafIndex(rc.env.CACHE, def.id, tractate, page, rc.lang, res));
  }
  return res;
}

/** The segment range a section-level argument enrichment is being computed for,
 *  as a `${startSegIdx}-${endSegIdx}` stamp — or null when the enrichment isn't
 *  section-anchored (so no range guard applies). Used to reject a cache hit
 *  whose title-derived key resolved to a stale, differently-ranged entry. */
function sectionRangeOf(def: EnrichmentDefinition | null, markInput: unknown): string | null {
  if (def?.mark !== 'argument') return null;
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
  const res = (await runProducer(RUN_PORTS, rc, 'enrich', def, tractate, page, markInput, {
    bypassCache,
    lang: rc.lang,
    modelOverride,
    parentChain,
    userQuestion,
  })) as RunResultEnrichment;
  // Daf-index on a fresh write of a daf-scoped (local) enrichment. Skip global/
  // spine (daf-agnostic) and qualified .qa runs (lazy, not in the eager set).
  if (!res.cache_hit && rc.env.CACHE && def.scope === 'local' && !userQuestion) {
    fireDafIndex(
      rc,
      recordEnrichmentDafIndex(rc.env.CACHE, def.id, tractate, page, markInput, rc.lang, res),
    );
  }
  return res;
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
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .slice(0, 80);
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
  const moves = dedupeBy(rangeItemsOf(inputs.anchors['argument-move']), (m) =>
    String((m.fields as { id?: unknown })?.id ?? `${m.startSegIdx}-${m.endSegIdx}`),
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
    // Slug precedence: (1) the grounding stamp on the mark instance (the
    // mark's own homonym verdict — never re-resolve a pinned instance by
    // name); (2) SKIP an instance grounding marked AMBIGUOUS — accumulating
    // its observations would require exactly the name-keyed first-wins pin
    // grounding refused to make, attributing this daf's material to the
    // wrong same-name rabbi in the reverse index; (3) the legacy name join
    // for ungrounded (older-cache) instances.
    const stampedSlug = typeof fields.slug === 'string' && fields.slug ? fields.slug : null;
    let slug: string;
    if (stampedSlug) {
      slug = stampedSlug;
    } else if (fields.genSource === 'ambiguous') {
      continue;
    } else {
      const ident = enrichRabbi(name, nameHe, generation);
      slug = ident.slug ?? obsSlugId(name || nameHe);
    }
    if (!slug) continue;
    const segIdxs = resolveSegIdxs(String(inst.excerpt ?? nameHe), normSegs);

    let location: { place: string } | null = null;
    if (locDef) {
      try {
        const iid = await instanceIdOf(inst);
        const hit = await readCachedResult(
          rc.env,
          keyForEnrichment(locDef, iid, { tractate, page }),
        );
        const place = (hit?.parsed as { place?: string } | null)?.place;
        if (typeof place === 'string' && place.trim()) location = { place: place.trim() };
      } catch {
        /* best-effort; high tier is optional */
      }
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
    tractate,
    page,
    defHash: def.cache_version,
    computedAt,
    rabbis: resolvedRabbis,
    places: resolvedPlaces,
    moves,
    aggadata,
    pesukim,
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

  const summary = {
    tractate,
    page,
    rabbis: slices.length,
    observations: totalObs,
    byType,
    computedAt,
  };
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
export async function cacheKeyForRunBody(
  env: Bindings,
  body: JobMessage,
): Promise<{
  key: string | null;
  defKind: 'mark' | 'enrichment' | null;
}> {
  if (body.mark_id) {
    const def = await loadMarkDef(env, body.mark_id);
    if (!def) return { key: null, defKind: null };
    // The store mirrors runMarkOnce: it only namespaces :he when the mark has
    // a Hebrew prompt (hasHePrompt derived from the def's extractor), so the
    // producer's cache-check and the consumer's write-through agree on the
    // key (otherwise a HE request would hit the EN-cached mark).
    return {
      key: artifactStore(env).keyFor(markKeyInfo(def), {
        unit: { work: body.tractate, unit: body.page },
        lang: body.lang === 'he' ? 'he' : 'en',
      }),
      defKind: 'mark',
    };
  }
  if (body.enrichment_id) {
    const def = await loadEnrichmentDef(env, body.enrichment_id);
    if (!def) return { key: null, defKind: null };
    const instance_id = await instanceIdOf(body.mark_input);
    const qHash = body.user_question ? await qualifierHash(body.user_question) : undefined;
    return {
      key: artifactStore(env).keyFor(enrichKeyInfo(def), {
        instanceId: instance_id,
        unit: { work: body.tractate, unit: body.page },
        qualifier: qHash,
        lang: body.lang ?? 'en',
      }),
      defKind: 'enrichment',
    };
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
    body.tractate,
    body.page,
    await instanceIdOf(body.mark_input),
    body.user_question ? `q_${await qualifierHash(body.user_question)}` : 'noq',
    body.lang === 'he' ? 'he' : 'en',
    body.bypass_cache ? 'fresh' : 'cached',
    String(Math.floor(Date.now() / 1000)),
  ];
  return parts
    .join(':')
    .replace(/[^a-zA-Z0-9._:-]+/g, '_')
    .slice(0, 200);
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

async function recordRecentJobError(env: Bindings, rec: Omit<RecentJobError, 'ts'>): Promise<void> {
  const cache = env.CACHE;
  if (!cache) return;
  try {
    const existing = await cache.get(RECENT_ERRORS_KEY);
    const arr = existing ? (JSON.parse(existing) as RecentJobError[]) : [];
    arr.push({ ts: Date.now(), ...rec });
    while (arr.length > RECENT_ERRORS_CAP) arr.shift();
    await cache.put(RECENT_ERRORS_KEY, JSON.stringify(arr), { expirationTtl: RECENT_ERRORS_TTL });
  } catch (err) {
    console.warn('[recent-errors] KV write failed:', String(err));
  }
}

/**
 * Experimental cards (biyun, chart) must never lazy-warm. A cold-miss /api/run
 * for an experimental, LLM-backed producer is skipped unless the caller
 * explicitly opts in to a warm — so a reader, or a dev merely viewing the card,
 * never triggers its paid Pro-tier generation. Free (computed) producers — the
 * biyun whole-daf chip instance, deterministic enrichments — are never gated;
 * only paid LLM warms are. The experimental cards are code-defined, so the code
 * registry is the source of truth for the flag.
 */
export function isExperimentalLlmWarm(job: { mark_id?: string; enrichment_id?: string }): boolean {
  if (job.mark_id) {
    const m = findCodeMark(job.mark_id);
    return !!m && m.experimental === true && m.extractor.kind === 'llm';
  }
  if (job.enrichment_id) {
    const e = findCodeEnrichment(job.enrichment_id);
    if (e?.extractor.kind !== 'llm' || !e.target_mark) return false;
    const m = findCodeMark(e.target_mark);
    return !!m && m.experimental === true;
  }
  return false;
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
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
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
    if (body.model_override !== undefined)
      return c.json({ error: 'model_override requires studio auth' }, 403);
  }

  if (body.model_override && !isLLMModelId(body.model_override)) {
    return c.json({ error: 'model_override must start with @cf/ or openrouter/' }, 400);
  }
  if (!body.mark_id && !body.enrichment_id && !body.ad_hoc) {
    return c.json({ error: 'mark_id, enrichment_id, or ad_hoc required' }, 400);
  }
  const job: JobMessage = {
    runId: '', // assigned below
    mark_id: body.mark_id,
    enrichment_id: body.enrichment_id,
    ad_hoc: trusted ? body.ad_hoc : undefined,
    tractate: body.tractate,
    page: body.page,
    model_override: trusted ? body.model_override : undefined,
    mark_input: body.mark_input,
    // Public callers can't force a fresh paid run; downgrade to cache-respecting.
    bypass_cache: trusted ? body.bypass_cache === true : false,
    user_question:
      typeof body.user_question === 'string' && body.user_question.trim().length > 0
        ? body.user_question
        : undefined,
    lang: body.lang === 'he' ? 'he' : undefined,
  };

  // Hot path: canonical cache hit short-circuits the queue entirely. The
  // store read maps a corrupt entry to a miss (same as the old inline parse),
  // so a corrupt cache falls through to enqueue exactly as before.
  if (!job.bypass_cache) {
    const { key } = await cacheKeyForRunBody(c.env, job);
    if (key && c.env.CACHE) {
      const result = (await artifactStore(c.env).get(key)) as RunResultEnrichment | null;
      if (result) {
        try {
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
        } catch {
          /* def load failed; fall through to enqueue */
        }
      }
    }
  }

  // Experimental cards (biyun, chart) never lazy-warm: only an explicit, trusted
  // warm enqueues their paid Pro-tier LLM job. A reader — or a dev merely
  // viewing the card — gets cache-only. Cache hits above still serve, so already-
  // warmed experimental content keeps rendering; this gates only the WARM.
  // Explicit warm = a trusted bypass_cache (e.g. the studio re-run) or a trusted
  // warm_experimental flag.
  const rawWarmExperimental = (raw as { warm_experimental?: unknown }).warm_experimental === true;
  const explicitWarm = job.bypass_cache || (trusted && rawWarmExperimental);
  const skipExperimentalWarm = !explicitWarm && isExperimentalLlmWarm(job);

  // Stale-while-revalidate: on a version-bump miss, serve the PREVIOUS version's
  // cached value (tagged refreshing) while the new one recomputes in the
  // background — so bumping a cache_version never makes readers wait. (No
  // human-edit path writes the enrichment cache today; when one exists it must
  // be CAS-guarded so this never overwrites an edit.)
  if (!job.bypass_cache && job.enrichment_id && c.env.CACHE && c.env.ENRICHMENT_QUEUE) {
    const def = await loadEnrichmentDef(c.env, job.enrichment_id);
    if (def) {
      // Mirror the hot path's section-range guard via the store's accept
      // predicate: don't serve a stale result stamped for a different section
      // than the one requested (and a corrupt prev value reads as a miss, so
      // it falls through to a normal enqueue exactly as before).
      const sectionRange = sectionRangeOf(def, job.mark_input);
      const swr = await artifactStore(c.env).getSWR(
        enrichKeyInfo(def),
        {
          instanceId: await instanceIdOf(job.mark_input),
          unit: { work: job.tractate, unit: job.page },
          qualifier: job.user_question ? await qualifierHash(job.user_question) : undefined,
          lang: job.lang ?? 'en',
        },
        {
          accept: (v) => !sectionRange || (v as RunResultEnrichment).section_range === sectionRange,
        },
      );
      // Serve only a PREVIOUS-version hit here (the canonical key was already
      // checked — and missed or range-failed — on the hot path above). The
      // recompute job + the 202 fallthrough keep targeting the CANONICAL key.
      if (swr.stale && swr.value) {
        const result = swr.value as RunResultEnrichment;
        // Enqueue the recompute only when budget allows (else just serve
        // stale; the warm path will fill the new version when budget frees)
        // and only when not gated as an experimental warm. `refreshing`
        // reflects whether a recompute was ACTUALLY queued — otherwise the
        // client polls a run that will never start and keeps the updating
        // marker up (experimental cards stay stale until explicitly warmed;
        // budget-paused stays stale until budget frees).
        const customRun = !!(job.enrichment_id.endsWith('.qa') && job.user_question);
        let refreshing = false;
        if (!skipExperimentalWarm && (await checkBudget(c.env, { custom: customRun })).ok) {
          job.runId = await makeRunId(job);
          await c.env.ENRICHMENT_QUEUE.send(job);
          refreshing = true;
        }
        recordTelemetry(c, runTelemetryRec(job, { ...result, cache_hit: true }, 0));
        return c.json({
          status: 'ok',
          result: { ...result, cache_hit: true, total_ms: 0, stale: true, refreshing },
        });
      }
    }
  }

  // Cold miss on an experimental card without an explicit warm: do NOT enqueue
  // the paid job. Return a clear, non-pending signal so the client shows
  // "not generated" rather than polling a run that will never start.
  if (skipExperimentalWarm) {
    return c.json({ status: 'skipped', reason: 'experimental', experimental: true, warmed: false });
  }

  if (!c.env.ENRICHMENT_QUEUE) {
    return c.json({ error: 'ENRICHMENT_QUEUE binding not available' }, 503);
  }
  // Budget gate before enqueueing real LLM work. Cache hits already returned
  // above (free, ungated). The queue consumer re-checks at the runLLM
  // chokepoint, but failing here gives the client an immediate paused signal.
  const customRun = !!(job.enrichment_id?.endsWith('.qa') && job.user_question);
  const gate = await checkBudget(c.env, { custom: customRun });
  if (!gate.ok) {
    return c.json(
      {
        status: 'error',
        error: pauseErrorMessage(gate.scope),
        paused: true,
        scope: gate.scope,
        retryAfter: pauseRetryAfterSec(gate.until),
      },
      429,
    );
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
 * POST /api/run-sources — read-only companion to /api/run for the dev inspector.
 * Given a mark/enrichment + daf (+ optional mark_input), resolves ONLY the
 * source TEXTS that producer feeds into its prompt (gemara / commentaries /
 * mishna / halacha-refs / yerushalmi-text / aggregated context) and returns them
 * as `{ sources: { <name>: { chars, content } } }`.
 *
 * Deliberately a separate endpoint, NOT a field on the cached RunResult: the
 * source texts are large (KB-scale each) and would bloat every reader's card
 * fetch + KV entry for a dev-only view. Here they're computed on demand from the
 * source slices: NO LLM (the `{enrichment}`/`{mark}` deps are skipped and the
 * Revach AI matcher runs cache-only) and NO enrichment-result is written. It
 * does the same deterministic source reads a normal page read does — so a cold
 * daf populates the shared source-slice cache (gemara/commentary/etc.) on a
 * miss, exactly as the already-public /api/run would; this is a strict subset of
 * that endpoint's surface (no model, no studio knobs), so it needs no extra auth.
 */
app.post('/api/run-sources', async (c) => {
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  const body = raw as {
    mark_id?: string;
    enrichment_id?: string;
    tractate?: string;
    page?: string;
    mark_input?: unknown;
    lang?: string;
  };
  if (!body.tractate || !body.page) return c.json({ error: 'tractate and page required' }, 400);
  if (!body.mark_id && !body.enrichment_id)
    return c.json({ error: 'mark_id or enrichment_id required' }, 400);

  const def = body.enrichment_id
    ? await loadEnrichmentDef(c.env, body.enrichment_id)
    : await loadMarkDef(c.env, body.mark_id!);
  if (!def) {
    const what = body.enrichment_id ? `enrichment ${body.enrichment_id}` : `mark ${body.mark_id}`;
    return c.json({ error: `${what} not found` }, 404);
  }

  const rc: RunCtx = {
    env: c.env,
    url: c.req.url,
    ctx: c.executionCtx,
    lang: body.lang === 'he' ? 'he' : 'en',
  };
  const inputs = await resolveDependencies(
    rc,
    def.dependencies,
    body.tractate,
    body.page,
    body.mark_input,
    false,
    new Set(),
    true,
  );
  return c.json({ sources: inputs.sources });
});

/**
 * POST /api/warm-daf — comprehensively pre-warm one daf (marks + every
 * per-instance enrichment up to suggested-questions). Enqueues a single
 * `warm_deep` job; the consumer runs the marks and fans out the enrichment
 * warm jobs (cache-respecting). The client fires this for the adjacent dapim
 * on idle so forward/back navigation lands on a fully-cached page.
 */
app.post('/api/warm-daf', async (c) => {
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  const body = raw as { tractate?: string; page?: string; lang?: string };
  if (!body.tractate || !body.page) return c.json({ error: 'tractate and page required' }, 400);
  if (!c.env.ENRICHMENT_QUEUE)
    return c.json({ error: 'ENRICHMENT_QUEUE binding not available' }, 503);
  // Don't fan out a deep-warm storm once the daily budget is paused.
  const gate = await checkBudget(c.env, { custom: false });
  if (!gate.ok) {
    return c.json(
      {
        status: 'error',
        error: pauseErrorMessage(gate.scope),
        paused: true,
        scope: gate.scope,
        retryAfter: pauseRetryAfterSec(gate.until),
      },
      429,
    );
  }
  const lang: 'en' | 'he' = body.lang === 'he' ? 'he' : 'en';
  const runId = `warm-deep:${body.tractate}:${body.page}:${lang}:${Math.floor(Date.now() / 1000)}`
    .replace(/[^a-zA-Z0-9._:-]+/g, '_')
    .slice(0, 200);
  await c.env.ENRICHMENT_QUEUE.send({
    runId,
    warm_deep: true,
    tractate: body.tractate,
    page: body.page,
    ...(lang === 'he' ? { lang } : {}),
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
    // store.get maps a corrupt canonical entry to a miss — same fall-through
    // to pending the old inline parse had.
    const result = (await artifactStore(c.env).get(cacheKey)) as RunResult | null;
    if (result) {
      return c.json({ status: 'ok', result: { ...result, cache_hit: true, total_ms: 0 } });
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
    try {
      arr = JSON.parse(raw) as RecentJobError[];
    } catch {
      return c.json({ error: 'corrupt buffer' }, 500);
    }
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

  const typeFilterEarly = c.req.query('type') ?? '';
  const minEarly = Math.max(1, parseInt(c.req.query('min') ?? '1', 10) || 1);
  // `summary=1` omits the (potentially huge — tens of thousands for Rav) flat
  // observations list, returning only dafCount + byType + aggregated. The
  // accumulation card uses this; full reads stay available without the flag.
  const summary = c.req.query('summary') === '1';
  // Aggregating a prolific rabbi means a KV.list + a get per daf slice (~1600
  // for Rav) — too slow to run on every card open. Cache the computed view
  // with a short TTL; the accumulation is a lifetime signal, so minutes-stale
  // is fine, and the backfill keeps writing slices underneath regardless. Only
  // `summary` bodies are cached (the full body's flat list can be many MB and
  // risk the KV value limit); `type` only narrows that flat list, so it drops
  // out of the summary key.
  const aggKey = `rabbi-obs-agg:v1:${slug}:${summary ? 'all' : typeFilterEarly || 'all'}:${minEarly}:${summary ? 's' : 'f'}`;
  if (summary) {
    const cachedAgg = await cache.get(aggKey);
    if (cachedAgg) return c.json(JSON.parse(cachedAgg));
  }

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
    try {
      slices.push(JSON.parse(raw) as ObservationSlice);
    } catch {
      /* skip corrupt slice */
    }
  }

  const typeFilter = typeFilterEarly || undefined;
  const minDafs = minEarly;
  const RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

  const byType: Record<string, number> = {};
  // Frequency across dafs, keyed by observation hash (same place/move/verse on
  // N dafs => dafs:N) — the signal a future "notable places" ranking needs.
  const freq = new Map<
    string,
    { type: string; payload: unknown; dafs: number; confidence: string }
  >();
  const observations: Array<Record<string, unknown>> = [];
  for (const s of slices) {
    for (const o of s.observations) {
      byType[o.type] = (byType[o.type] ?? 0) + 1;
      const prev = freq.get(o.hash);
      if (prev) {
        prev.dafs += 1;
        if ((RANK[o.confidence] ?? 0) > (RANK[prev.confidence] ?? 0))
          prev.confidence = o.confidence;
      } else {
        freq.set(o.hash, { type: o.type, payload: o.payload, dafs: 1, confidence: o.confidence });
      }
      if (!summary && (!typeFilter || o.type === typeFilter)) {
        observations.push({ ...o, tractate: s.tractate, page: s.page });
      }
    }
  }
  const aggregated = [...freq.values()]
    .filter((e) => e.dafs >= minDafs)
    .sort((a, b) => b.dafs - a.dafs || (RANK[b.confidence] ?? 0) - (RANK[a.confidence] ?? 0));

  const body = {
    slug,
    name: slices[0]?.name ?? slug,
    nameHe: slices[0]?.nameHe ?? '',
    dafCount: slices.length,
    byType,
    aggregated,
    observations,
  };
  // 10-minute TTL: fast on repeat opens; the lifetime view tolerates staleness.
  // summary only (bounded size); best-effort so a failed/oversized put never
  // turns a good read into a 500.
  if (summary) {
    await cache.put(aggKey, JSON.stringify(body), { expirationTtl: 600 }).catch(() => {});
  }
  return c.json(body);
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
  ts: number;
  model: string;
  transport: string;
  tag: string;
  attempts: number;
  ms: number;
  cost: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  // Attribution (additive; null on entries written before it existed).
  cost_in_est?: number | null;
  cost_out_est?: number | null;
  kind?: string | null;
  producer_id?: string | null;
  tractate?: string | null;
  page?: string | null;
  lang?: string | null;
  cache_version?: string | null;
  cost_class?: string | null;
}
app.get('/api/admin/llm-cost', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  const prefix = 'llmcost:v1:';

  if (c.req.query('clear') === '1') {
    if (!isTrustedRequest(c))
      return c.json({ error: 'clearing the cost ledger requires studio auth' }, 403);
    let cursor: string | undefined;
    let deleted = 0;
    do {
      const res = await cache.list({ prefix, cursor, limit: 1000 });
      for (const k of res.keys) {
        await cache.delete(k.name);
        deleted++;
      }
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
  let totalCostInEst = 0;
  let totalCostOutEst = 0;
  let calls = 0;
  let callsWithCost = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = 0;
  const byModel: Record<
    string,
    { calls: number; cost: number; promptTokens: number; completionTokens: number }
  > = {};
  const byTag: Record<string, { calls: number; cost: number }> = {};
  const byKind: Record<string, { calls: number; cost: number }> = {};
  // Per-daf recent spend (7-day ledger window). The permanent per-daf record is
  // the cache-entry cost stamp; this is the live drill-down for what just ran.
  const byDaf: Record<
    string,
    { calls: number; cost: number; costInEst: number; costOutEst: number }
  > = {};

  for (const key of keys) {
    const raw = await cache.get(key);
    if (!raw) continue;
    let r: LlmCostRec;
    try {
      r = JSON.parse(raw) as LlmCostRec;
    } catch {
      continue;
    }
    if (since && r.ts < since) continue;
    calls++;
    if (typeof r.cost === 'number') {
      totalCost += r.cost;
      callsWithCost++;
    }
    if (typeof r.cost_in_est === 'number') totalCostInEst += r.cost_in_est;
    if (typeof r.cost_out_est === 'number') totalCostOutEst += r.cost_out_est;
    if (typeof r.prompt_tokens === 'number') promptTokens += r.prompt_tokens;
    if (typeof r.completion_tokens === 'number') completionTokens += r.completion_tokens;
    if (r.ts < minTs) minTs = r.ts;
    if (r.ts > maxTs) maxTs = r.ts;
    const m = byModel[r.model] ?? { calls: 0, cost: 0, promptTokens: 0, completionTokens: 0 };
    byModel[r.model] = m;
    m.calls++;
    m.cost += r.cost ?? 0;
    m.promptTokens += r.prompt_tokens ?? 0;
    m.completionTokens += r.completion_tokens ?? 0;
    const t = byTag[r.tag] ?? { calls: 0, cost: 0 };
    byTag[r.tag] = t;
    t.calls++;
    t.cost += r.cost ?? 0;
    const kindKey = r.kind ?? 'untagged';
    const k = byKind[kindKey] ?? { calls: 0, cost: 0 };
    byKind[kindKey] = k;
    k.calls++;
    k.cost += r.cost ?? 0;
    if (r.tractate && r.page) {
      const dafKey = `${r.tractate}:${r.page}`;
      const d = byDaf[dafKey] ?? {
        calls: 0,
        cost: 0,
        costInEst: 0,
        costOutEst: 0,
      };
      byDaf[dafKey] = d;
      d.calls++;
      d.cost += r.cost ?? 0;
      d.costInEst += r.cost_in_est ?? 0;
      d.costOutEst += r.cost_out_est ?? 0;
    }
  }

  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  for (const m of Object.values(byModel)) m.cost = round(m.cost);
  for (const t of Object.values(byTag)) t.cost = round(t.cost);
  for (const k of Object.values(byKind)) k.cost = round(k.cost);
  for (const d of Object.values(byDaf)) {
    d.cost = round(d.cost);
    d.costInEst = round(d.costInEst);
    d.costOutEst = round(d.costOutEst);
  }

  return c.json({
    totalCostUsd: round(totalCost),
    // List-price input/output split (est) — OpenRouter bills one number, so the
    // in/out ratio is estimated; totalCostUsd stays billed-authoritative.
    estInputCostUsd: round(totalCostInEst),
    estOutputCostUsd: round(totalCostOutEst),
    calls,
    callsWithCost,
    promptTokens,
    completionTokens,
    window: { from: calls ? minTs : null, to: calls ? maxTs : null },
    byModel,
    byTag,
    byKind,
    byDaf,
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
  const pages = (c.req.query('pages') ?? '2a,5a,10a,15b,20a')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const concurrent = c.req.query('concurrent') === '1';

  const probeOne = async (page: string) => {
    const t0 = Date.now();
    try {
      const d = await fetchHebrewBooksDaf(tractate, page);
      return {
        page,
        ok: true,
        ms: Date.now() - t0,
        mainLen: d.main.length,
        rashiLen: d.rashi.length,
        tosafotLen: d.tosafot.length,
      };
    } catch (e) {
      return {
        page,
        ok: false,
        ms: Date.now() - t0,
        error: String((e as Error)?.message ?? e).slice(0, 300),
      };
    }
  };

  const results = concurrent
    ? await Promise.all(pages.map(probeOne))
    : await (async () => {
        const out = [];
        for (const p of pages) out.push(await probeOne(p));
        return out;
      })();

  const ok = results.filter((r) => r.ok).length;
  return c.json({
    tractate,
    mode: concurrent ? 'concurrent' : 'sequential',
    attempted: results.length,
    ok,
    failed: results.length - ok,
    results,
  });
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
  const revach = items
    .filter((it) => it.source === 'dafyomi:revach')
    .map((it) => ({
      entry: (it.title?.en ?? it.body?.en ?? '').slice(0, 80),
      placed: it.segs.length ? `${it.segs[0]}-${it.segs[it.segs.length - 1]}` : null,
      section: it.segs.length ? sectionTitleForSeg(it.segs[0]) : null,
      via: it.via ?? null,
      confidence: it.confidence ?? null,
      refs: (it.refs ?? []).map((r) => `${r.tractate} ${r.page}`),
    }));
  return c.json({
    tractate,
    page,
    sections: sections.length,
    revachEntries: revach.length,
    placed: revach.filter((r) => r.placed).length,
    items: revach,
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
    await Promise.all(
      slice.map(async (k) => {
        try {
          const v = await cache.get(k.name);
          if (v === null) return; // gone between list and get
          await cache.put(k.name, v); // no expirationTtl → infinite
          rewritten++;
        } catch (err) {
          errors.push(`${k.name}: ${String((err as Error)?.message ?? err).slice(0, 80)}`);
        }
      }),
    );
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
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const fresh = await computeCacheStats(cache);
            await writeCachedCacheStats(cache, fresh);
          } catch (err) {
            console.warn('[cache-stats] background refresh failed:', err);
          }
        })(),
      );
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
  if (apply && !isTrustedRequest(c))
    return c.json({ error: 'deletion requires studio auth (?apply=1)' }, 403);
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
  const parsed = await readJsonBody(c, { ok: false, error: 'bad-json' });
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const rec = {
    ts: new Date().toISOString(),
    ua: c.req.header('user-agent') ?? null,
    cf: (c.req.raw as unknown as { cf?: { country?: string } }).cf ?? null,
    ...(body as Record<string, unknown>),
  };
  // Observability / wrangler tail pick this up.
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
  const safe = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_')
      .slice(0, 80);
  return `qa-registry:${safe(mark)}:v1:${safe(instanceId)}:${safe(tractate)}:${safe(page)}`;
}

async function readQaRegistry(
  env: Bindings,
  mark: string,
  tractate: string,
  page: string,
  instanceId: string,
): Promise<QaRegistry> {
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

async function writeQaRegistry(
  env: Bindings,
  mark: string,
  tractate: string,
  page: string,
  instanceId: string,
  reg: QaRegistry,
): Promise<void> {
  if (!env.CACHE) return;
  await env.CACHE.put(qaRegistryKey(mark, tractate, page, instanceId), JSON.stringify(reg));
}

// Pull (mark, instanceId) out of a request. Accepts both legacy
// `move_id`/(no mark, defaults to argument-move) and the generalized
// `instance_id`+`mark` forms.
function resolveQaScope(input: {
  mark?: string;
  move_id?: string;
  instance_id?: string;
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
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown'
  );
}

async function tickRateLimit(
  env: Bindings,
  scope: string,
  who: string,
): Promise<{ ok: boolean; remaining: number }> {
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
    } catch {
      /* ignore corrupt */
    }
  }
  count += 1;
  await env.CACHE.put(key, JSON.stringify({ count, windowStart }), {
    expirationTtl: QA_ASK_RATE_LIMIT_WINDOW_SEC,
  });
  return {
    ok: count <= QA_ASK_RATE_LIMIT_MAX,
    remaining: Math.max(0, QA_ASK_RATE_LIMIT_MAX - count),
  };
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
    return c.json(
      {
        error:
          'mark must be one of argument-move|pesukim|aggadata and instance_id (or move_id) is required',
      },
      400,
    );
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
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const b = body as Partial<{
    tractate: string;
    page: string;
    mark: string;
    move_id: string;
    instance_id: string;
    question: string;
    mark_input: unknown;
    lang: 'en' | 'he';
  }>;
  if (!b.tractate || !b.page || !b.question) {
    return c.json({ error: 'tractate, page, question required' }, 400);
  }
  const scope = resolveQaScope({ mark: b.mark, move_id: b.move_id, instance_id: b.instance_id });
  if (!scope) {
    return c.json(
      {
        error:
          'mark must be one of argument-move|pesukim|aggadata and instance_id (or move_id) is required',
      },
      400,
    );
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
    return c.json(
      {
        error: pauseErrorMessage(gate.scope),
        paused: true,
        scope: gate.scope,
        retryAfter: pauseRetryAfterSec(gate.until),
      },
      429,
    );
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
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const b = body as Partial<{
    tractate: string;
    page: string;
    mark: string;
    move_id: string;
    instance_id: string;
    qHash: string;
  }>;
  if (!b.tractate || !b.page || !b.qHash) {
    return c.json({ error: 'tractate, page, qHash required' }, 400);
  }
  const scope = resolveQaScope({ mark: b.mark, move_id: b.move_id, instance_id: b.instance_id });
  if (!scope) {
    return c.json(
      {
        error:
          'mark must be one of argument-move|pesukim|aggadata and instance_id (or move_id) is required',
      },
      400,
    );
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
// Telemetry types + recorders (TelemetryRecord, classifyError, recordTelemetry,
// runTelemetryRec) now live in ./telemetry; imported at the top of this file.

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
  args: {
    kind: 'mark' | 'enrichment';
    id: string;
    result: { model?: string; usage?: LLMUsage | null; parse_error?: string | null };
  },
): void {
  const { input, output } = normalizeUsage(
    args.result.usage as Parameters<typeof normalizeUsage>[0],
  );
  const cost = priceCostUsd(
    args.result.model,
    args.result.usage as Parameters<typeof priceCostUsd>[1],
  );
  const { costInUsd, costOutUsd } = costSplitUsd(
    args.result.model,
    args.result.usage as Parameters<typeof costSplitUsd>[1],
  );
  recordUsage(rc.env, rc.ctx, {
    ok: !args.result.parse_error,
    cacheHit: false,
    model: args.result.model ?? null,
    tokensIn: input,
    tokensOut: output,
    costUsd: cost,
    costInUsd,
    costOutUsd,
    markId: args.kind === 'mark' ? args.id : undefined,
    enrichmentId: args.kind === 'enrichment' ? args.id : undefined,
  });
}

/** Record every place instance the `places` mark emitted into the observed-place
 *  backlog (there is no global places gazetteer, so all of them are candidates
 *  for global enrichment). */
function recordObservedPlacesFromMark(
  rc: RunCtx,
  parsed: unknown,
  tractate: string,
  page: string,
): void {
  const p = parsed as {
    instances?: Array<{
      fields?: { name?: string; nameHe?: string; kind?: string; region?: string };
    }>;
  } | null;
  if (!p || !Array.isArray(p.instances)) return;
  for (const inst of p.instances) {
    const f = inst?.fields;
    if (!f || (!f.name && !f.nameHe)) continue;
    recordObservedPlace(rc.env, rc.ctx, {
      name: f.name,
      nameHe: f.nameHe,
      kind: f.kind,
      region: f.region,
      tractate,
      page,
    });
  }
}

/** Record every term the `daf-background.concepts` enrichment emitted into the
 *  observed-concept backlog. There is no global glossary yet, so all of them are
 *  candidates for a future canonical concept registry. */
function recordObservedConceptsFromEnrichment(
  rc: RunCtx,
  parsed: unknown,
  tractate: string,
  page: string,
): void {
  const p = parsed as {
    groups?: Array<{
      category?: string;
      terms?: Array<{ term?: string; termHe?: string; gloss?: string }>;
    }>;
  } | null;
  if (!p || !Array.isArray(p.groups)) return;
  for (const g of p.groups) {
    if (!Array.isArray(g?.terms)) continue;
    for (const t of g.terms) {
      if (!t || (!t.term && !t.termHe)) continue;
      recordObservedConcept(rc.env, rc.ctx, {
        term: t.term,
        termHe: t.termHe,
        gloss: t.gloss,
        category: g.category,
        tractate,
        page,
      });
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
  const parsed = await readJsonBody<{ tractate?: string; page?: string; description?: string }>(c, {
    ok: false,
    error: 'bad-json',
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
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
      console.warn('[report] KV write failed:', String(err));
    }
  }
  console.warn('[bug-report]', JSON.stringify(rec));
  return c.json({ ok: true });
});

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// ===========================================================================
// Usage dashboard — section builders + endpoints
//
// The dashboard is built from independent sections (cost / activity / telemetry
// / backlog / health). Each has a pure builder below, so the full `/api/usage`
// payload and the per-section endpoints (`/api/usage/<section>`) share one
// implementation. Splitting them lets the client load and render each card on
// its own — a slow section (or the slow cache-stats scan) no longer blocks the
// headline cost numbers. Every endpoint is stale-while-revalidate cached.
// ===========================================================================

type UsageCtx = { env: Bindings; executionCtx: ExecutionContext };

// External analytics, sub-cached 5 min so the dashboard refresh doesn't hammer
// the CF analytics API.
async function loadAigwCached(
  c: UsageCtx,
  cache?: KVNamespace,
): Promise<Awaited<ReturnType<typeof fetchGatewayCost>>> {
  if (!cache) return fetchGatewayCost(c.env);
  const raw = await cache.get('aigw-cost:v1');
  if (raw) {
    try {
      return JSON.parse(raw) as Awaited<ReturnType<typeof fetchGatewayCost>>;
    } catch {
      /* recompute */
    }
  }
  const fresh = await fetchGatewayCost(c.env);
  c.executionCtx.waitUntil(
    cache.put('aigw-cost:v1', JSON.stringify(fresh), { expirationTtl: 300 }),
  );
  return fresh;
}
async function loadActivityCached(
  c: UsageCtx,
  cache?: KVNamespace,
): Promise<Awaited<ReturnType<typeof fetchZoneActivity>>> {
  if (!cache) return fetchZoneActivity(c.env);
  const raw = await cache.get('zone-activity:v1');
  if (raw) {
    try {
      return JSON.parse(raw) as Awaited<ReturnType<typeof fetchZoneActivity>>;
    } catch {
      /* recompute */
    }
  }
  const fresh = await fetchZoneActivity(c.env);
  c.executionCtx.waitUntil(
    cache.put('zone-activity:v1', JSON.stringify(fresh), { expirationTtl: 300 }),
  );
  return fresh;
}

interface TelemetryRollup {
  count: number;
  cacheHits: number;
  cacheHitRate: number;
  p50Ms: number;
  p95Ms: number;
  errorCount: number;
  errorsByKind: Record<string, number>;
}
function rollupTelemetry(rows: TelemetryRecord[]): TelemetryRollup {
  const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
  const hits = rows.filter((r) => r.cache_hit).length;
  const errors = rows.filter((r) => !r.ok);
  const errorsByKind: Record<string, number> = {};
  for (const e of errors)
    errorsByKind[e.error_kind ?? 'other'] = (errorsByKind[e.error_kind ?? 'other'] ?? 0) + 1;
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

async function buildTelemetrySection(cache?: KVNamespace) {
  const telRaw = cache ? await cache.get('telemetry:v1:recent') : null;
  const telemetry = telRaw ? (JSON.parse(telRaw) as TelemetryRecord[]) : [];
  // Group dynamically over whatever endpoint/mark/enrichment values appear, so
  // the dashboard stays correct without code changes as new producers record.
  const group = (
    key: (r: TelemetryRecord) => string | undefined,
  ): Record<string, TelemetryRollup> => {
    const buckets = new Map<string, TelemetryRecord[]>();
    for (const r of telemetry) {
      const k = key(r);
      if (k == null) continue;
      const arr = buckets.get(k) ?? [];
      arr.push(r);
      buckets.set(k, arr);
    }
    const out: Record<string, TelemetryRollup> = {};
    for (const [k, rows] of buckets) out[k] = rollupTelemetry(rows);
    return out;
  };
  const recentErrors = telemetry
    .filter((r) => !r.ok)
    .slice(-30)
    .reverse()
    .map((r) => ({
      ts: r.ts,
      endpoint: r.endpoint,
      tractate: r.tractate,
      page: r.page,
      error_kind: r.error_kind,
      model: r.model,
      mark_id: r.mark_id,
      enrichment_id: r.enrichment_id,
    }));
  return {
    perEndpoint: group((r) => r.endpoint),
    perMark: group((r) => r.mark_id),
    perEnrichment: group((r) => r.enrichment_id),
    recentErrors,
    totalCount: telemetry.length,
  };
}

async function buildCostSection(c: UsageCtx, cache?: KVNamespace) {
  const [selfTracked, aiGateway, telRaw] = await Promise.all([
    cache ? readUsageSummary(cache) : null,
    loadAigwCached(c, cache),
    cache ? cache.get('telemetry:v1:recent') : null,
  ]);
  // Cost avoided by serving cache hits, over the recent telemetry window. Each
  // hit's telemetry record recomputes what the call WOULD have cost from the
  // stamped usage, so this is "money the cache saved us" without re-charging.
  const telemetry = telRaw ? (JSON.parse(telRaw) as TelemetryRecord[]) : [];
  let avoidedUsd = 0;
  let avoidedCalls = 0;
  for (const r of telemetry) {
    if (r.cache_hit && typeof r.cost_usd === 'number') {
      avoidedUsd += r.cost_usd;
      avoidedCalls += 1;
    }
  }
  return {
    selfTracked,
    aiGateway,
    costAvoided: { recentUsd: Math.round(avoidedUsd * 1e6) / 1e6, recentCalls: avoidedCalls },
  };
}

async function buildActivitySection(c: UsageCtx, cache?: KVNamespace) {
  return loadActivityCached(c, cache);
}

const REPORTS_DISMISSED_KEY = 'reports:v1:dismissed';

async function buildBacklogSection(cache?: KVNamespace) {
  const empty = { total: 0, sightings: 0, sample: [] as never[] };
  // Each registry scan is independently guarded: one failing list (subrequest
  // budget, KV hiccup) degrades its own card to empty instead of 500ing the
  // whole backlog endpoint.
  const guarded = <T>(p: Promise<T>): Promise<T | typeof empty> =>
    p.catch((err) => {
      console.error('[usage/backlog] registry scan failed:', err);
      return empty;
    });
  const [rabbis, places, concepts, repRaw, disRaw] = await Promise.all([
    cache ? guarded(listUnknownRabbis(cache)) : empty,
    cache ? guarded(listObservedPlaces(cache)) : empty,
    cache ? guarded(listObservedConcepts(cache)) : empty,
    cache ? cache.get('reports:v1:recent') : null,
    cache ? cache.get(REPORTS_DISMISSED_KEY) : null,
  ]);
  // Bug reports, split into active vs. checked-off ("done"). The dismissed set
  // is a list of report timestamps (a report's `ts` is its id).
  let allReports: BugReport[] = [];
  if (repRaw) {
    try {
      allReports = [...(JSON.parse(repRaw) as BugReport[])].reverse();
    } catch {
      allReports = [];
    }
  }
  let dismissed: number[] = [];
  if (disRaw) {
    try {
      dismissed = JSON.parse(disRaw) as number[];
    } catch {
      dismissed = [];
    }
  }
  const dset = new Set(dismissed);
  const reports = {
    active: allReports.filter((r) => !dset.has(r.ts)),
    done: allReports.filter((r) => dset.has(r.ts)),
  };
  return { rabbis, places, concepts, reports };
}

async function buildHealthSection(cache?: KVNamespace) {
  const [jeRaw, lintFailures] = await Promise.all([
    cache ? cache.get(RECENT_ERRORS_KEY) : null,
    readLintFailures(cache),
  ]);
  let jobErrors: RecentJobError[] = [];
  if (jeRaw) {
    try {
      jobErrors = (JSON.parse(jeRaw) as RecentJobError[]).slice(-30).reverse();
    } catch {
      jobErrors = [];
    }
  }
  return { jobErrors, lintFailures };
}

/**
 * Generic stale-while-revalidate dispatcher for a usage section. Serves the
 * cached value instantly; once past `freshMs` it refreshes in the background
 * (a best-effort lock collapses concurrent rebuilds). A true cold miss builds
 * synchronously. `build` returns the section data; this stamps `generatedAt`.
 */
async function serveUsageSection<T>(
  c: { env: Bindings; executionCtx: ExecutionContext; json: (v: unknown) => Response },
  cache: KVNamespace | undefined,
  key: string,
  freshMs: number,
  build: () => Promise<T>,
): Promise<Response> {
  if (cache) {
    const cachedRaw = await cache.get(key);
    if (cachedRaw) {
      let parsed: (Record<string, unknown> & { generatedAt?: string }) | null = null;
      try {
        parsed = JSON.parse(cachedRaw);
      } catch {
        parsed = null;
      }
      if (parsed) {
        const age = Date.now() - Date.parse(parsed.generatedAt ?? '');
        const fresh = Number.isFinite(age) && age >= 0 && age < freshMs;
        if (!fresh) {
          const lockKey = `${key}:refreshing`;
          const refreshing = await cache.get(lockKey);
          if (!refreshing) {
            c.executionCtx.waitUntil(
              (async () => {
                try {
                  await cache.put(lockKey, '1', { expirationTtl: 60 });
                  const next = { ...(await build()), generatedAt: new Date().toISOString() };
                  await cache.put(key, JSON.stringify(next), { expirationTtl: 600 });
                } catch (err) {
                  console.warn(`[usage] ${key} background refresh failed:`, err);
                } finally {
                  await cache.delete(lockKey).catch(() => {});
                }
              })(),
            );
          }
        }
        return c.json(parsed);
      }
    }
  }
  const data = { ...(await build()), generatedAt: new Date().toISOString() };
  if (cache) c.executionCtx.waitUntil(cache.put(key, JSON.stringify(data), { expirationTtl: 600 }));
  return c.json(data);
}

// Full payload — back-compatible shape. Composed from the same builders; keeps
// its own SWR so existing clients keep working unchanged.
app.get('/api/usage', async (c) => {
  const cache = c.env.CACHE;
  const build = async () => {
    const [telemetry, cost, activity, backlog, health] = await Promise.all([
      buildTelemetrySection(cache),
      buildCostSection(c, cache),
      buildActivitySection(c, cache),
      buildBacklogSection(cache),
      buildHealthSection(cache),
    ]);
    return {
      telemetry,
      cost,
      activity,
      unknowns: backlog,
      jobErrors: health.jobErrors,
      lintFailures: health.lintFailures,
      reports: backlog.reports.active, // back-compat: the legacy combined payload
    };
  };
  return serveUsageSection(c, cache, 'usage-payload:v1', 30_000, build);
});

// Per-section endpoints — the client loads these independently so each card
// renders as soon as its own data arrives.
app.get('/api/usage/cost', (c) =>
  serveUsageSection(c, c.env.CACHE, 'usage-cost:v1', 30_000, () =>
    buildCostSection(c, c.env.CACHE),
  ),
);
app.get('/api/usage/telemetry', (c) =>
  serveUsageSection(c, c.env.CACHE, 'usage-telemetry:v1', 30_000, () =>
    buildTelemetrySection(c.env.CACHE),
  ),
);
app.get('/api/usage/activity', (c) =>
  serveUsageSection(c, c.env.CACHE, 'usage-activity:v1', 60_000, () =>
    buildActivitySection(c, c.env.CACHE),
  ),
);
app.get('/api/usage/backlog', (c) =>
  serveUsageSection(c, c.env.CACHE, 'usage-backlog:v1', 60_000, () =>
    buildBacklogSection(c.env.CACHE),
  ),
);
app.get('/api/usage/health', (c) =>
  serveUsageSection(c, c.env.CACHE, 'usage-health:v1', 30_000, () =>
    buildHealthSection(c.env.CACHE),
  ),
);

// Check off / restore a bug report (by its timestamp id). Toggles membership in
// the dismissed set; the backlog payload splits reports into active vs. done
// from it. Open + reversible — it's dev triage, not destructive.
app.post('/api/admin/report-dismiss', async (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  let body: { ts?: number; done?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad JSON body' }, 400);
  }
  if (typeof body.ts !== 'number') return c.json({ error: 'ts (number) required' }, 400);
  const raw = await cache.get(REPORTS_DISMISSED_KEY);
  let dismissed: number[] = [];
  if (raw) {
    try {
      dismissed = JSON.parse(raw) as number[];
    } catch {
      dismissed = [];
    }
  }
  const set = new Set(dismissed);
  if (body.done === false) set.delete(body.ts);
  else set.add(body.ts);
  // Match the reports ring buffer's own 365-day TTL so a done report can't
  // resurface as active when the dismissed entry expires first.
  await cache.put(REPORTS_DISMISSED_KEY, JSON.stringify([...set]), {
    expirationTtl: 60 * 60 * 24 * 365,
  });
  // Invalidate the cached backlog payload AND the legacy combined /api/usage
  // payload (which also carries reports) so the next load reflects the change.
  // The client also updates optimistically.
  c.executionCtx.waitUntil(
    Promise.all([
      cache.delete('usage-backlog:v1').catch(() => {}),
      cache.delete('usage-payload:v1').catch(() => {}),
    ]),
  );
  return c.json({ ok: true });
});

// Per-daf cost drill-down — "trace this daf". Reads the permanent per-entry
// cost stamps for one daf across each mark's cached versions (bounded reads):
// current-version cost vs superseded-version cost. Recent enrichment + source-
// alignment spend for the daf lives in the per-call ledger (GET
// /api/admin/llm-cost -> byDaf), which the UI overlays.
app.get('/api/usage/daf/:tractate/:page', (c) => {
  const cache = c.env.CACHE;
  if (!cache) return c.json({ error: 'no cache binding' }, 503);
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  return serveUsageSection(c, cache, `usage-daf:v1:${tractate}:${page}`, 60_000, async () => {
    const stats = (await readCachedCacheStats(cache)) ?? (await computeCacheStats(cache));
    return dafCostReport(cache, stats.marks, tractate, page);
  });
});

// --- Commentaries -------------------------------------------------------
// The commentary list + on-demand translation routes (and fetchCommentaryWorks,
// re-exported above for the other in-file callers) now live in ./commentary.
registerCommentaryRoutes(app);

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

// Bio-sidebar nav: given a Sefaria topic slug (as linked from the bio text),
// return the same IdentifiedRabbi shape the dafContext uses, so the sidebar
// can swap to the target rabbi's bio without a second enrichment hop. 404 if
// the slug isn't in our rabbi dataset (biblical figures, holidays, etc.).
app.get('/api/rabbi/:slug', (c) => {
  const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
  if (!rr.ok) return rr.response;
  const { slug, entry } = rr;
  const rawGen = entry.generation ?? 'unknown';
  const generation: GenerationId = (GENERATION_IDS as string[]).includes(rawGen)
    ? (rawGen as GenerationId)
    : 'unknown';
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
    const byWork = new Map<string, { title: string; category: string; refs: string[] }>();
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
    const timing: SourceTiming[] = [];
    const items = await collectContext(c.env, tractate, page, {
      assetOrigin: new URL(c.req.url).origin,
      timing,
    });
    return c.json({ tractate, page, items, timing, fetchedAt: new Date().toISOString() });
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
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

app.post('/api/context/match', async (c) => {
  const parsed = await readJsonBody<{ tractate?: string; page?: string; items?: MatchInput[] }>(c, {
    error: 'bad JSON body',
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const t = body.tractate;
  const p = body.page;
  const items = Array.isArray(body.items)
    ? body.items.filter((i) => i && typeof i.key === 'string')
    : [];
  if (!t || !p || items.length === 0)
    return c.json({ error: 'tractate, page, and items[] required' }, 400);
  const cache = c.env.CACHE;
  // The AI placement for a fixed (daf, item-set) is stable, and auto-grounding
  // re-requests it on every visit — so cache it forever (bump the version to
  // invalidate). v1 -> v2: the matcher now chunks large item sets; v1 entries
  // were matched in one oversized batch that silently left everything unplaced.
  const cacheKey = keyForCtxMatch(t, p, hashMatchKeys(items.map((i) => i.key)));
  if (cache) {
    const hit = await cache.get(cacheKey);
    if (hit !== null) {
      try {
        return c.json({ matches: JSON.parse(hit), cached: true });
      } catch {
        /* fall through */
      }
    }
  }
  try {
    const segments = await getSefariaSegmentsCached(cache, t, p);
    if (!segments) return c.json({ matches: [], warning: 'no segments for daf' });
    const matches = await aiMatchToSegments(c.env, segments.he, segments.en, items, {
      tractate: t,
      page: p,
    });
    if (cache) {
      try {
        await cache.put(cacheKey, JSON.stringify(matches));
      } catch {
        /* ignore */
      }
    }
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
    if (states.length === 0) {
      c.header('x-cache', 'miss');
      return;
    }
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
        rashi: hb.rashi
          ? {
              hebrew: hb.rashi,
              english: '',
              pieces: sefariaBundle?.rashi?.pieces,
              pieceKeys: sefariaBundle?.rashi?.pieceKeys,
            }
          : undefined,
        tosafot: hb.tosafot
          ? {
              hebrew: hb.tosafot,
              english: '',
              pieces: sefariaBundle?.tosafot?.pieces,
              pieceKeys: sefariaBundle?.tosafot?.pieceKeys,
            }
          : undefined,
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
  const text = [data.mainText.english, data.rashi?.english ?? '', data.tosafot?.english ?? '']
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
  /** Target language for the gloss — follows the reader's UI language. 'en'
   *  (default) translates into English; 'he' translates the Aramaic/Hebrew of
   *  the daf into modern Hebrew. */
  lang?: 'en' | 'he';
}

// Aggressive Hebrew normalizer for substring alignment — strips nikkud,
// cantillation, geresh/gershayim, all punctuation, and collapses whitespace.
function normalizeHeForMatch(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ') // strip HTML tags
    .replace(/[֑-ׇ]/g, '') // nikkud + cantillation
    .replace(/[^֐-׿\s]/g, ' ') // keep only Hebrew letters + whitespace
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
      const clean = senses
        .map((s) => stripHtmlServer(s))
        .filter(Boolean)
        .slice(0, 2)
        .join(' | ');
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
  const targetLang: 'en' | 'he' = body.lang === 'he' ? 'he' : 'en';
  if (!word || !tractate || !page) {
    return c.json({ error: 'Missing word/tractate/page' }, 400);
  }

  const cache = c.env.CACHE;
  // Context-aware cache key: identical word in two different passages now gets
  // two different cached answers (previously they collided).
  const ctxHash =
    hebrewBefore || hebrewAfter ? `:${shortHash(`${hebrewBefore}${hebrewAfter}`)}` : '';
  // v3: DeepSeek V4 Flash primary + hardcoded dict short-circuit +
  // morphology-aware prompt. Bumped from v2 to invalidate stale Gemma-era
  // translations (Gemma 4 26B was returning e.g. שעות → "watches").
  const cacheKey = keyForTranslate(tractate, page, word, ctxHash, targetLang);
  const t0 = Date.now();
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      recordTelemetry(c, {
        endpoint: 'translate',
        tractate,
        page,
        cache_hit: true,
        ms: Date.now() - t0,
        ok: true,
      });
      return c.json({ translation: cached, cached: true });
    }
  }

  // Hardcoded dict for high-frequency Talmudic words whose gloss is
  // context-free (Aramaic discourse markers, Mishnaic structural terms,
  // common Hebrew nouns small models botch the plural of). Skips the LLM
  // entirely and caches the result alongside LLM-produced ones.
  // The hardcoded dict glosses are English; only short-circuit for English
  // targets. Hebrew targets always go through the model (no Hebrew dict).
  const dictGloss = targetLang === 'en' ? lookupGloss(word) : undefined;
  if (dictGloss) {
    if (cache) {
      await cache.put(cacheKey, dictGloss, { expirationTtl: 60 * 60 * 24 * 30 });
    }
    recordTelemetry(c, {
      endpoint: 'translate',
      tractate,
      page,
      cache_hit: false,
      model: 'dict',
      ms: Date.now() - t0,
      ok: true,
    });
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
      console.warn('[translate] fallback Sefaria context fetch failed:', err);
    }
  }

  // Sefaria Lexicon — authoritative BDB/Jastrow definitions for the word.
  // Cached per-word for a year (lexicons change rarely).
  const lexiconContext = await getSefariaLexicon(word, cache).catch((err) => {
    console.warn('[translate] lexicon fetch failed:', err);
    return '';
  });

  const wordCount = word.split(/\s+/).filter(Boolean).length;
  const isPhrase = wordCount > 1;
  const enSystem = isPhrase
    ? 'You translate short Hebrew/Aramaic phrases from the Talmud into English. Return ONLY the English translation — one concise sentence at most, faithful to the context. No quotation marks, no explanation, no prefix, no reasoning.\n\n'
    : 'You translate single Hebrew or Aramaic words from the Talmud into English. Return ONLY the English translation — a single word or short phrase, no quotation marks, no explanation, no punctuation. If the word is a proper name (a Rabbi or place), return the conventional English rendering.\n\n';
  const heSystem = isPhrase
    ? 'You translate short Talmudic Aramaic/Hebrew phrases into clear modern Hebrew (עברית מודרנית) so an Israeli reader can understand them. Return ONLY the Hebrew translation — one concise sentence at most, faithful to the context. No quotation marks, no explanation, no prefix, no reasoning.\n\n'
    : 'You translate single Talmudic Aramaic or Hebrew words into clear modern Hebrew (עברית מודרנית) so an Israeli reader can understand them. Return ONLY the Hebrew translation — a single word or short phrase, no quotation marks, no explanation, no punctuation. If the word is a proper name (a Rabbi or place), return its conventional Hebrew form.\n\n';
  const system = (targetLang === 'he' ? heSystem : enSystem) + TRANSLATE_IDIOM_GUIDANCE;

  // DeepSeek V4 Flash primary (frontier-adjacent Hebrew morphology at
  // $0.14/$0.28 per 1M; reasoning auto-disabled in llm.ts for low latency).
  // Kimi K2.5 thinking fallback when DeepSeek returns empty or errors.
  const translateModels: Array<{ id: LLMModelId; label: string; kimi?: boolean }> = [
    { id: 'openrouter/deepseek/deepseek-v4-flash', label: 'deepseek-v4-flash' },
    { id: '@cf/moonshotai/kimi-k2.5', label: 'kimi-k2.5', kimi: true },
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
        userParts.push(
          `Passage context (English translation of the surrounding daf):\n${fallbackEnglish}`,
        );
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
        userParts.push(
          `Lexicon definitions (from Sefaria's BDB/Jastrow/Klein):\n${lexiconContext}`,
        );
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
        tag: 'translate',
        attribution: { kind: 'translate', tractate, page },
      });
      const translation = r.content.trim().replace(/^["']|["']$/g, '');
      if (!translation) {
        attempts.push(`${m.label}: empty response`);
        continue;
      }

      if (cache) {
        await cache.put(cacheKey, translation, { expirationTtl: 60 * 60 * 24 * 30 });
      }
      recordTelemetry(c, {
        endpoint: 'translate',
        tractate,
        page,
        cache_hit: false,
        model: m.label,
        ms: Date.now() - t0,
        ok: true,
      });
      return c.json({ translation, cached: false, _model: m.label });
    } catch (err) {
      attempts.push(`${m.label}: ${String(err).slice(0, 200)}`);
      console.warn(`[translate] ${m.label} failed:`, err);
    }
  }

  recordTelemetry(c, {
    endpoint: 'translate',
    tractate,
    page,
    cache_hit: false,
    ms: Date.now() - t0,
    ok: false,
    error_kind: classifyError(attempts.join(' ')),
  });
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
  const edge = (lhs: RegExp) => new RegExp(`(^|\\s)${lhs.source}(?=\\s|$)`, 'g');
  return (
    s
      // Contextual Rabbi Meir first — must run before the generic ר' rewrite so
      // that phrases like "דברי ר' מ" stay untouched if they somehow appear.
      .replace(/(^|\s)(דברי|לדברי|כדברי|אמר|ואמר)\s+ר["״]מ(?=\s|$)/g, '$1$2 רבי מאיר')
      .replace(/(^|\s)ר["״]מ\s+(וחכמים|אומר)(?=\s|$)/g, '$1רבי מאיר $2')
      // Unambiguous collapsed-abbreviation forms.
      .replace(edge(/אר["״]י/), (_m, p) => `${p}אמר רבי יוחנן`)
      .replace(edge(/אר["״]ל/), (_m, p) => `${p}אמר ריש לקיש`)
      .replace(edge(/אר["״]ז/), (_m, p) => `${p}אמר רבי זירא`)
      .replace(edge(/ריב["״]ל/), (_m, p) => `${p}רבי יהושע בן לוי`)
      .replace(edge(/רשב["״]י/), (_m, p) => `${p}רבי שמעון בר יוחאי`)
      // Generic title expansions.
      .replace(/א["״]ר(?=\s)/g, 'רבי')
      .replace(/(^|\s)ר['׳](?=\s)/g, '$1רבי')
  );
}

// Precompute: canonicalHe → { name, slug } for every rabbi in the Sefaria-
// derived dataset. Used to catch rabbis the model missed via substring match.
// The dataset leaks biblical figures and concept nouns (משה, רות, אור, תורה...),
// so filter to names that either start with a rabbinic title or are explicit
// standalone Amoraic names. Anything else risks false-positive underlines.
const RABBI_HE_TITLE_RE = /^(רבי|רב|ר'|מר|רבן|רבה|רבא|רבינא)\s/;
const RABBI_HE_STANDALONE = new Set([
  'רבא',
  'רבינא',
  'אבא',
  'רבה',
  'רב',
  'מר',
  'שמואל',
  'הלל',
  'שמאי',
  'עולא',
  'זעירי',
  'אביי',
  'רבינא השני',
]);

interface KnownRabbi {
  slug: string;
  name: string;
  nameHe: string;
  nameHeNorm: string;
}
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

// Short-form index: TITLE + FIRST GIVEN NAME of multi-part canonical names
// ("רבי תנחום" from "רבי תנחום בר חנילאי"), built ONCE. The full-form-only scan
// missed every daf that cites a rabbi by his everyday short name. Guards:
//   - skip entries whose raw canonicalHe carries a parenthetical disambiguator
//     ("רב (שם אמורא)", "רבי מנא (1)") — their stripped token soup yields junk
//     shorts that falsely claim uniqueness;
//   - skip when the would-be short form IS some rabbi's full canonical form
//     ("רבי תנחום" is also Rabbi Tanhum's complete name) — the full-form scan
//     above already owns that string;
//   - skip patronymic second tokens (a "רבי בר..." shape has no given name).
// A short form mapping to ONE entry identifies that rabbi; mapping to several
// is still a real mention (the name IS in the text) that grounding gets to
// disambiguate from candidates.
const HE_PATRONYMIC_TOKENS: ReadonlySet<string> = new Set(['בר', 'בן', 'בריה', 'ברבי']);
const KNOWN_RABBIS_HE_SHORT: Map<string, KnownRabbi[]> = (() => {
  const fullForms = new Set(KNOWN_RABBIS_HE.map((k) => k.nameHeNorm));
  const m = new Map<string, KnownRabbi[]>();
  for (const k of KNOWN_RABBIS_HE) {
    if (k.nameHe.includes('(')) continue;
    const tokens = k.nameHeNorm.split(' ');
    if (tokens.length < 3) continue;
    if (!RABBI_HE_TITLE_RE.test(k.nameHeNorm)) continue;
    if (HE_PATRONYMIC_TOKENS.has(tokens[1])) continue;
    const short = `${tokens[0]} ${tokens[1]}`;
    if (fullForms.has(short)) continue;
    const list = m.get(short);
    if (list) list.push(k);
    else m.set(short, [k]);
  }
  return m;
})();

/** English TITLE + FIRST GIVEN NAME ("Rabbi Tanchum" from "Rabbi Tanchum bar
 *  Chanilai") — the honest display name for a short-form mention that maps to
 *  several registry entries. */
function shortEnglishName(name: string): string {
  const tokens = name.trim().split(/\s+/);
  return tokens.length >= 2 ? `${tokens[0]} ${tokens[1]}` : name;
}

// Hebrew word-boundary test — match only when surrounded by whitespace or at
// a string edge, so "רבא" doesn't match inside "דרבא" (prefix דְ־).
function hasHebrewWordBoundaryMatch(haystack: string, needle: string): boolean {
  return countHebrewWordBoundaryMatches(haystack, needle, 1) > 0;
}

// Count word-boundary occurrences (same boundary rule as above). `cap` bounds
// the scan for callers that only need existence or a small comparison —
// counting stops once the cap is reached.
function countHebrewWordBoundaryMatches(
  haystack: string,
  needle: string,
  cap = Number.POSITIVE_INFINITY,
): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (count < cap) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    const beforeOk = idx === 0 || /\s/.test(haystack[idx - 1]);
    const afterIdx = idx + needle.length;
    const afterOk = afterIdx === haystack.length || /\s/.test(haystack[afterIdx]);
    if (beforeOk && afterOk) count++;
    from = idx + 1;
  }
  return count;
}

// Aramaic/Hebrew tokens that sometimes trail a rabbi's name when the model
// over-copies context (e.g. "ר' אלכסנדרי בתר צלותיה" = "Rabbi Alexandri
// AFTER HIS PRAYER"). None of these words are ever part of a rabbi name, so
// truncating at the first occurrence leaves only the name itself.
const NAMEHE_STOP_TOKENS: ReadonlySet<string> = new Set([
  // Attribution verbs
  'אמר',
  'אמרה',
  'אמרו',
  'אומר',
  'אומרת',
  'אומרים',
  'מתני',
  'דרש',
  'דריש',
  // Stative / motion / perception
  'קאי',
  'קם',
  'יתיב',
  'הוה',
  'הווה',
  'פתח',
  'חזא',
  'אזל',
  'אתא',
  'שמע',
  'אשכח',
  'אקלע',
  'מטא',
  'בעי',
  'בעא',
  'סבר',
  // Pronouns / prepositions that never belong in a name
  'בתר',
  'קמיה',
  'עליה',
  'עלה',
  'להו',
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
  // Second pass: SHORT forms (title + first given name). Runs after the
  // full-form pass so a daf that carries the full name never double-adds.
  // The nameHe we stamp is the matched short span exactly as it appears in
  // the (normalized) daf text — the client's verbatim matcher anchors it, so
  // the mention gets an underline/gutter presence instead of being invisible.
  for (const [short, entries] of KNOWN_RABBIS_HE_SHORT) {
    if (seenHe.has(short)) continue;
    const shortCount = countHebrewWordBoundaryMatches(textNorm, short);
    if (shortCount === 0) continue;
    // Skip the occurrences that are just the inside of a longer already-seen
    // name (the daf says "רבי תנחום בר חנילאי", which the full pass already
    // added) — OCCURRENCE-AWARE: each occurrence of a covering longer form
    // accounts for exactly one short-form occurrence (the longer form's own
    // word-boundary match contains one). Only skip the short form entirely
    // when EVERY short occurrence is accounted for; a daf that carries
    // "רבן יוחנן בן זכאי" AND a later standalone "רבן יוחנן" still gets the
    // standalone mention.
    let coveredCount = 0;
    for (const s of seenHe) {
      if (!s.startsWith(`${short} `)) continue;
      coveredCount += countHebrewWordBoundaryMatches(textNorm, s, shortCount - coveredCount);
      if (coveredCount >= shortCount) break;
    }
    if (coveredCount >= shortCount) continue;
    const unique = entries.length === 1 ? entries[0] : null;
    added.push({
      // Unique mapping → the registry entry's canonical name (this IS that
      // rabbi); several bearers → the honest short English name, generation
      // 'unknown', and grounding disambiguates from the candidate set.
      name: unique ? unique.name : shortEnglishName(entries[0].name),
      nameHe: short,
      generation: 'unknown',
    });
    seenHe.add(short);
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
  /** Grounding provenance (mirrors the client type): stamped on the degraded
   *  identity payload served for an unpinnable homonym so the reader can say
   *  WHY there is no registry join. Absent on legacy/slug-resolved payloads. */
  genSource?: string;
  /** Registry candidate count for the name when >1 (homonym). */
  homonyms?: number;
}

/**
 * enrichRabbi for an instance grounding ALREADY pinned to a registry slug —
 * a direct dataset join, no name re-resolution (the name path is first-wins
 * and homonym-blind, so re-resolving a grounded "Rav Kahana" by name can land
 * on a different same-name bearer). Null when the slug isn't in the dataset
 * (shouldn't happen — grounding slugs come from the same Sefaria slug space).
 */
function enrichRabbiBySlug(
  slug: string,
  name: string,
  nameHe: string,
  generation: GenerationId,
): IdentifiedRabbi | null {
  const entry = RABBI_PLACES.rabbis[slug];
  if (!entry) return null;
  const finalGen: GenerationId =
    generation !== 'unknown'
      ? generation
      : typeof entry.generation === 'string' && GENERATION_ID_SET.has(entry.generation)
        ? (entry.generation as GenerationId)
        : 'unknown';
  return {
    slug,
    name: entry.canonical || name,
    nameHe,
    generation: finalGen,
    region: entry.region ?? deriveRegionFromGeneration(finalGen),
    places: entry.places ?? [],
    moved: entry.moved ?? null,
    bio: entry.bio ?? null,
    image: entry.image ?? null,
    wiki: entry.wiki ?? null,
  };
}

/**
 * Read a rabbi enrichment's mark_input in BOTH shapes it arrives in — the
 * sidebar's flat `{name, nameHe, generation, ...}` and the warm queue's
 * mark-instance `{excerpt, fields: {name, ...}}` — including the grounding
 * stamps (slug / genSource / homonyms) groundRabbiInstances wrote onto the
 * rabbi mark. The stamps are how the deterministic short-circuits below honor
 * the mark's homonym verdict instead of re-resolving by name (first-wins).
 */
export function rabbiMarkInputFields(markInput: unknown): {
  name: string;
  nameHe: string;
  generation: GenerationId;
  slug: string | null;
  genSource: string | null;
  homonyms: number | null;
} {
  const o = (markInput && typeof markInput === 'object' ? markInput : {}) as Record<
    string,
    unknown
  >;
  const f = (o.fields && typeof o.fields === 'object' ? o.fields : o) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const gen = str(f.generation);
  return {
    name: str(f.name),
    nameHe: str(f.nameHe) || str(o.excerpt),
    generation: GENERATION_ID_SET.has(gen) ? (gen as GenerationId) : 'unknown',
    slug: str(f.slug) || null,
    genSource: str(f.genSource) || null,
    homonyms: typeof f.homonyms === 'number' ? f.homonyms : null,
  };
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
export function resolveGeneration(
  name: string,
  nameHe: string,
  generation: GenerationId,
): GenerationId {
  if (generation !== 'unknown') return generation;
  const entry = resolveRabbi(name, nameHe)?.entry ?? null;
  if (entry && typeof entry.generation === 'string' && GENERATION_ID_SET.has(entry.generation)) {
    return entry.generation as GenerationId;
  }
  return 'unknown';
}

export function enrichRabbi(
  name: string,
  nameHe: string,
  generation: GenerationId,
): IdentifiedRabbi {
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
  const pickGen = knownGen(a.generation)
    ? a.generation
    : knownGen(b.generation)
      ? b.generation
      : a.generation;
  const pickNameHe = a.nameHe.length >= b.nameHe.length ? a.nameHe : b.nameHe;
  return { ...a, generation: pickGen, nameHe: pickNameHe };
}

export function enrichAll(rabbis: GenerationsResult['rabbis']): IdentifiedRabbi[] {
  const enriched = rabbis.map((r) => enrichRabbi(r.name, r.nameHe, r.generation));
  const bySlug = new Map<string, IdentifiedRabbi>();
  const unslugged: IdentifiedRabbi[] = [];
  for (const r of enriched) {
    if (!r.slug) {
      unslugged.push(r);
      continue;
    }
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
  return RABBI_HE_TITLE_RE.test(`${he} `) || RABBI_HE_STANDALONE.has(he);
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
  const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
  if (!rr.ok) return rr.response;
  const { slug, entry } = rr;
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
      try {
        return c.json({ ...JSON.parse(hit), _cached: true });
      } catch {
        /* fall through */
      }
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
      tag: 'rabbi-enrich',
      attribution: { kind: 'rabbi', producerId: 'rabbi-enrich' },
    });
    const payload = r.content.trim() || extractJsonPayload({ response: r.content });
    if (!payload) return c.json({ error: 'empty payload', slug }, 502);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      return c.json(
        { error: `non-JSON: ${String(err).slice(0, 200)}`, slug, raw: payload.slice(0, 500) },
        502,
      );
    }
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
      c.executionCtx.waitUntil(
        cache.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 365 }),
      );
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

interface ResolvedRef {
  name: string;
  slug: string | null;
}

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
  const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
  if (!rr.ok) return rr.response;
  const { slug, entry } = rr;
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
      {
        tag: 'rabbi-relationships',
        attribution: { kind: 'rabbi', producerId: 'rabbi-relationships' },
      },
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
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    const repaired = payload.replace(/,(\s*[}\]])/g, '$1').replace(/\r/g, '');
    try {
      parsed = JSON.parse(repaired);
    } catch {
      return c.json(
        { error: `non-JSON: ${String(err).slice(0, 200)}`, slug, raw: payload.slice(0, 500) },
        502,
      );
    }
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
  'father',
  'mother',
  'spouse',
  'son',
  'daughter',
  'brother',
  'sister',
  'uncle',
  'aunt',
  'nephew',
  'niece',
  'grandfather',
  'grandmother',
  'grandson',
  'granddaughter',
  'father-in-law',
  'mother-in-law',
  'son-in-law',
  'daughter-in-law',
  'brother-in-law',
  'sister-in-law',
  'cousin',
  'other',
] as const;
type FamilyRelation = (typeof FAMILY_RELATION_TYPES)[number];
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

interface FamilyEntry {
  name: string;
  relation: FamilyRelation;
}
interface FamilyResult {
  family: FamilyEntry[];
}

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
  const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
  if (!rr.ok) return rr.response;
  const { slug, entry } = rr;
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
      { tag: 'rabbi-family', attribution: { kind: 'rabbi', producerId: 'rabbi-family' } },
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
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    const repaired = payload.replace(/,(\s*[}\]])/g, '$1').replace(/\r/g, '');
    try {
      parsed = JSON.parse(repaired);
    } catch {
      return c.json(
        { error: `non-JSON: ${String(err).slice(0, 200)}`, slug, raw: payload.slice(0, 500) },
        502,
      );
    }
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
  'Sura',
  'Pumbedita',
  'Nehardea',
  'Mehoza',
  'Tiberias',
  'Tzippori',
  'Caesarea',
  'Yavneh',
  'Usha',
  'Bnei Brak',
  'Lod',
  'Jerusalem',
  'other',
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
  const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
  if (!rr.ok) return rr.response;
  const { slug, entry } = rr;
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
      { tag: 'rabbi-orientation', attribution: { kind: 'rabbi', producerId: 'rabbi-orientation' } },
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
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    const repaired = payload.replace(/,(\s*[}\]])/g, '$1').replace(/\r/g, '');
    try {
      parsed = JSON.parse(repaired);
    } catch {
      return c.json(
        { error: `non-JSON: ${String(err).slice(0, 200)}`, slug, raw: payload.slice(0, 500) },
        502,
      );
    }
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
  links?: Record<
    string,
    {
      title?: unknown;
      links?: Array<{
        topic?: string;
        order?: { tfidf?: number; linksInCommon?: number };
        isInverse?: boolean;
        dataSource?: string;
      }>;
    }
  >;
}

async function fetchSefariaTopicCached(
  slug: string,
  cache: KVNamespace | undefined,
): Promise<SefariaRawTopic | null> {
  const key = `sefaria:topic:v${SEFARIA_TOPIC_VERSION}:${slug}`;
  if (cache) {
    const hit = (await cache.get(key, 'json')) as SefariaRawTopic | null;
    if (hit) return hit;
  }
  const url = `https://www.sefaria.org/api/topics/${encodeURIComponent(slug)}?with_links=1&with_refs=0`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`sefaria topic ${slug}: HTTP ${res.status}`);
  const data = (await res.json()) as SefariaRawTopic;
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
    .filter(
      (t): t is { text: string; lang: string } =>
        typeof t.text === 'string' && (t.lang === 'en' || t.lang === 'he'),
    )
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
      .filter(
        (l): l is { topic: string; order?: { tfidf?: number } } => typeof l.topic === 'string',
      )
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
  const buckets: Array<
    { slug: string | null; name: string; weight: number | null; source: 'sefaria' | 'llm' }[]
  > = [out.teachers, out.students, out.family, out.opposed, out.influences];
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
): Promise<
  | {
      ok: true;
      record: EnrichedRabbiRecord;
      ms: number;
      promptChars: number;
      usage: StreamedResult['usage'];
    }
  | { ok: false; error: string; raw?: string; ms: number }
> {
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
      {
        chatTemplateKwargs: { enable_thinking: false },
        tag: 'rabbi-enrich-sefaria',
        attribution: { kind: 'rabbi', producerId: 'rabbi-enrich-sefaria' },
      },
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
  const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
  if (!rr.ok) return rr.response;
  const { slug, entry } = rr;

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

async function readEnriched(cache: KVNamespace, slug: string): Promise<EnrichedRabbiRecord | null> {
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
  const data = (await res.json()) as {
    entities?: Record<
      string,
      {
        claims?: Record<
          string,
          Array<{
            mainsnak?: { datavalue?: { value?: { id?: string; time?: string } } };
          }>
        >;
      }
    >;
  };
  const entity = data.entities?.[qid];
  if (!entity?.claims) return null;

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
  const data = (await res.json()) as {
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
  family: Array<{
    slug: string | null;
    name: string;
    relation: string;
    weight: number | null;
    source: string;
  }>;
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
      teachers: r.teachers.map((e) => ({
        slug: e.slug,
        name: e.name,
        weight: e.weight,
        source: e.source,
      })),
      students: r.students.map((e) => ({
        slug: e.slug,
        name: e.name,
        weight: e.weight,
        source: e.source,
      })),
      family: r.family.map((e) => ({
        slug: e.slug,
        name: e.name,
        relation: e.relation,
        weight: e.weight,
        source: e.source,
      })),
      opposed: r.opposed.map((e) => ({
        slug: e.slug,
        name: e.name,
        weight: e.weight,
        source: e.source,
      })),
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
      ensureEdge(other.students, {
        slug: node.slug,
        name: node.canonical,
        weight: t.weight,
        source: t.source,
      });
    }
    for (const s of node.students) {
      if (!s.slug) continue;
      const other = nodes[s.slug];
      if (!other) continue;
      ensureEdge(other.teachers, {
        slug: node.slug,
        name: node.canonical,
        weight: s.weight,
        source: s.source,
      });
    }
    for (const f of node.family) {
      if (!f.slug) continue;
      const other = nodes[f.slug];
      if (!other) continue;
      const inv = FAMILY_INVERSE[f.relation] ?? 'other';
      if (other.family.some((e) => e.slug === node.slug && e.relation === inv)) continue;
      other.family.push({
        slug: node.slug,
        name: node.canonical,
        relation: inv,
        weight: f.weight,
        source: f.source,
      });
    }
    for (const o of node.opposed) {
      if (!o.slug) continue;
      const other = nodes[o.slug];
      if (!other) continue;
      ensureEdge(other.opposed, {
        slug: node.slug,
        name: node.canonical,
        weight: o.weight,
        source: o.source,
      });
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
    const slugs = byGeneration[r.generation] ?? [];
    byGeneration[r.generation] = slugs;
    slugs.push(r.slug);
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
  return c.json({
    ok: true,
    generations: Object.keys(byGeneration).length,
    sages: Object.keys(bySage).length,
    _ms: Date.now() - t0,
  });
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
      const slugs = byPlace[key] ?? [];
      byPlace[key] = slugs;
      slugs.push(r.slug);
    }
  }
  const blob: RabbiPlacesIndexBlob = {
    generatedAt: new Date().toISOString(),
    byPlace,
  };
  await cache.put(keyForRabbiPlacesIndex(), JSON.stringify(blob), {
    expirationTtl: RABBI_STAGE_TTL_S,
  });
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
    const slugs = byAcademy[r.academy] ?? [];
    byAcademy[r.academy] = slugs;
    slugs.push(r.slug);
  }
  const blob: RabbiAcademyRosterBlob = {
    generatedAt: new Date().toISOString(),
    byAcademy,
  };
  await cache.put(keyForRabbiAcademyRoster(), JSON.stringify(blob), {
    expirationTtl: RABBI_STAGE_TTL_S,
  });
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

  const totalSlugs = Object.entries(RABBI_PLACES.rabbis).filter(([, r]) =>
    isRabbinicEntry(r),
  ).length;

  const [
    unified,
    wikidata,
    wikiBio,
    influences,
    appearances,
    keyDafim,
    graphAt,
    cohortAt,
    placesAt,
    academyAt,
  ] = await Promise.all([
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
    return c.json(
      {
        error: 'No cached skeleton; run /api/analyze/.../?skeleton_only=1 first',
      },
      412,
    );
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
  'Tiberias',
  'Sepphoris',
  'Tzipori',
  'Caesarea',
  'Yavneh',
  'Usha',
  'Lod',
  'Bnei Brak',
  'Jerusalem',
  'Eretz Yisrael',
  'Galilee',
  'Judea',
]);
const BAVEL_PLACES = new Set([
  'Sura',
  'Pumbedita',
  'Nehardea',
  'Mehoza',
  'Naresh',
  'Mata Mehasya',
  'Babylonia',
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

interface MesorahChainStep {
  slug: string;
  canonical: string;
  canonicalHe: string;
  generation: string | null;
}
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
  const depth =
    Number.isFinite(depthQ) && depthQ > 0 && depthQ <= 10 ? depthQ : DEFAULT_MESORAH_DEPTH;

  const cacheKey = keyForMesorah(tractate, page);
  if (!refresh) {
    const hit = await cache.get(cacheKey);
    if (hit) return c.json({ ...JSON.parse(hit), _cached: true });
  }

  const skelRaw = await cache.get(keyForAnalyzeSkeleton(tractate, page));
  if (!skelRaw) {
    return c.json(
      {
        error: 'No cached skeleton; run /api/analyze/.../?skeleton_only=1 first',
      },
      412,
    );
  }
  const skeleton = JSON.parse(skelRaw) as DafSkeleton;

  const graphRaw = await cache.get(keyForRabbiGraph());
  let graph: RabbiGraphBlob | null = null;
  if (graphRaw) {
    try {
      graph = JSON.parse(graphRaw) as RabbiGraphBlob;
    } catch {
      graph = null;
    }
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
  const parsed = await readJsonBody<{ hebrewBio?: string; nameHe?: string; nameEn?: string }>(c, {
    error: 'invalid JSON body',
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
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
  ]
    .filter(Boolean)
    .join('\n');

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
      tag: 'translate-bio',
      attribution: { kind: 'rabbi', producerId: 'translate-bio' },
    });
    const payload = r.content.trim() || extractJsonPayload({ response: r.content });
    if (!payload) return c.json({ error: 'empty payload' }, 502);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      return c.json(
        { error: `non-JSON: ${String(err).slice(0, 200)}`, raw: payload.slice(0, 500) },
        502,
      );
    }
    if (!validateTranslatedBio(parsed))
      return c.json({ error: 'schema mismatch', got: parsed }, 502);
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
/** The dafyomi "Yerushalmi to Match" outline for a daf, aligned to the Bavli
 *  segments: each point tagged with the Bavli `segIdx` it parallels (the shared
 *  Mishnah / baraita layer; divergent gemara points stay unanchored). Empty
 *  until the daf's dafyomi content has been (re)warmed with the yerushalmi
 *  parser (GET /api/dafyomi/:t/:p?refresh=1). */
async function buildYerushalmiOutline(env: Bindings, tractate: string, page: string) {
  const [daf, slice] = await Promise.all([
    getDafyomiContentCached(env.CACHE, env.ASSETS, tractate, page, {}).catch(() => null),
    getGemaraSlice(env, tractate, page, false),
  ]);
  const block = daf?.amudim?.a?.yerushalmi?.body ?? daf?.amudim?.b?.yerushalmi?.body;
  if (block?.type !== 'yerushalmi') return [];
  const points = flattenYerushalmiOutline(block.entries, tractate);
  return alignOutlineToSegments(points, slice.segments_he);
}

app.get('/api/yerushalmi/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const [bundle, curated, outline] = await Promise.all([
    getYerushalmiCached(c.env.CACHE, tractate, page),
    fetchCuratedYerushalmi(curatedParallelsForDaf(tractate, page)),
    buildYerushalmiOutline(c.env, tractate, page),
  ]);
  return c.json({
    parallels: bundle.map((y) => ({
      ref: y.ref,
      heRef: y.heRef,
      hebrew: cleanYerushalmiText(y.hebrew),
      english: cleanYerushalmiText(y.english),
    })),
    // Curated Bavli<->Yerushalmi parallels whose Bavli ref covers this daf —
    // hand-made cross-references (Sefaria "Shared Stories"), with the real
    // Yerushalmi text + an editorial summary. Often cross-tractate.
    curated,
    // dafyomi.co.il "Yerushalmi to Match" outline — the digestible parallel,
    // each point aligned to the Bavli segment it parallels.
    outline,
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

export function splitOuterWhitespace(text: string): {
  leading: string;
  core: string;
  trailing: string;
} {
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
  const parsed = await readJsonBody<{ text?: string }>(c, { error: 'bad json' });
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
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
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
      tag: 'hebraize',
      attribution: { kind: 'hebraize' },
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
    ? includeRawBio
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .sort()
        .join(',')
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
  const [unifiedRaw, wikidataRaw, wikiBioRaw, graphRaw, skelRaw, regionDafRaw, mesorahDafRaw] =
    await Promise.all([
      wantBio('unified') || needsUnifiedForRegion
        ? cache.get(keyForRabbiEnriched(slug))
        : Promise.resolve(null),
      wantBio('wikidata') ? cache.get(keyForRabbiWikidata(slug)) : Promise.resolve(null),
      wantBio('wiki-bio') ? cache.get(keyForRabbiWikiBio(slug)) : Promise.resolve(null),
      wantBio('rabbi-graph') || needsGraphForMesorah
        ? cache.get(keyForRabbiGraph())
        : Promise.resolve(null),
      wantBio('daf-role')
        ? cache.get(keyForAnalyzeSkeleton(tractate, page))
        : Promise.resolve(null),
      wantBio('region') ? cache.get(keyForRegion(tractate, page)) : Promise.resolve(null),
      wantBio('mesorah') ? cache.get(keyForMesorah(tractate, page)) : Promise.resolve(null),
    ]);

  const tryParse = <T>(raw: string | null): T | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };
  const unified = tryParse<EnrichedRabbiRecord>(unifiedRaw);
  const wikidata = tryParse<Record<string, unknown>>(wikidataRaw);
  const wikiBio = tryParse<Record<string, unknown>>(wikiBioRaw);
  const graph = tryParse<{
    nodes: Record<string, { primaryTeacher?: string | null; canonical?: string }>;
  }>(graphRaw);
  const skel = tryParse<DafSkeleton>(skelRaw);
  const regionDaf = tryParse<{
    sections?: Array<{
      title: string;
      sages?: Array<{
        slug: string | null;
        region?: string | null;
        places?: string[];
        migrated?: boolean;
      }>;
    }>;
    migrated?: Array<{ slug: string }>;
  }>(regionDafRaw);
  const mesorahDaf = tryParse<{
    chains?: Record<string, Array<{ canonical: string; generation: string | null }>>;
  }>(mesorahDafRaw);

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
          coRegions: (sec.sages ?? [])
            .filter((s) => s.slug !== slug)
            .map((s) => s.region)
            .filter(Boolean),
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
  if (unified && wantBio('unified'))
    inputBlocks.push(
      `<unified>\n${JSON.stringify(
        {
          canonical: unified.canonical,
          aliases: unified.aliases,
          generation: unified.generation,
          region: unified.region,
          academy: unified.academy,
          places: unified.places,
          bio: unified.bio.en,
          orientation: unified.orientation,
          characteristics: unified.characteristics,
          primaryTeacher: unified.primaryTeacher,
          primaryStudent: unified.primaryStudent,
        },
        null,
        2,
      )}\n</unified>`,
    );
  if (wikidata) inputBlocks.push(`<wikidata>\n${JSON.stringify(wikidata, null, 2)}\n</wikidata>`);
  if (wikiBio) inputBlocks.push(`<wiki_bio>\n${JSON.stringify(wikiBio, null, 2)}\n</wiki_bio>`);
  if (myGraphNode && wantBio('rabbi-graph'))
    inputBlocks.push(`<rabbi_graph>\n${JSON.stringify(myGraphNode, null, 2)}\n</rabbi_graph>`);
  if (dafRole) inputBlocks.push(`<daf_role>\n${JSON.stringify(dafRole, null, 2)}\n</daf_role>`);
  if (regionSlice) inputBlocks.push(`<region>\n${JSON.stringify(regionSlice, null, 2)}\n</region>`);
  if (mesorahSlice)
    inputBlocks.push(`<mesorah>\n${JSON.stringify(mesorahSlice, null, 2)}\n</mesorah>`);

  if (inputBlocks.length === 0) {
    return c.json(
      { error: 'no rabbi enrichments cached for this slug yet — run unified first' },
      412,
    );
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
      c.env,
      '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: RABBI_BIO_DAF_PROMPT },
        { role: 'user', content: userContent },
      ],
      4000,
      {
        chatTemplateKwargs: { enable_thinking: false },
        tag: 'rabbi-bio-daf',
        attribution: { kind: 'rabbi', producerId: 'rabbi-bio-daf', tractate, page },
      },
    );
    let payload = s.content.trim();
    const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) payload = fenced[1].trim();
    parsed = JSON.parse(payload);
  } catch (err) {
    return c.json({ error: `bio synthesize: ${String(err).slice(0, 200)}` }, 502);
  }

  const out = {
    tractate,
    page,
    slug,
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
async function evictCascadeEntries(
  env: Bindings,
  ids: readonly string[],
  tractate: string,
  page: string,
): Promise<number> {
  if (!env.CACHE) return 0;
  const store = artifactStore(env);
  const unit = { work: tractate, unit: page };
  let evicted = 0;
  const wholeIid = await instanceIdOf({ fields: {} });
  for (const id of ids) {
    const def = await loadEnrichmentDef(env, id);
    if (!def) continue;
    // Whole-daf instance ({fields:{}}) — id is lang-safe, so evict both langs.
    for (const lang of ['en', 'he'] as const) {
      const key = store.keyFor(enrichKeyInfo(def), { instanceId: wholeIid, unit, lang });
      if (key) {
        await store.evict(key);
        evicted++;
      }
    }
    // Per-section/entity instances — EN only (the HE id derives from the Hebrew
    // title we can't enumerate here; see the doc above).
    for (const inst of await readMarkInstances(env, def.mark, tractate, page).catch(() => [])) {
      const key = store.keyFor(enrichKeyInfo(def), {
        instanceId: await instanceIdOf(inst),
        unit,
        lang: 'en',
      });
      if (key) {
        await store.evict(key);
        evicted++;
      }
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
): Promise<{ marks: number; enqueued: number; skipped: number; bridges: number; cross: number }> {
  const queue = rc.env.ENRICHMENT_QUEUE;
  const cache = rc.env.CACHE;
  if (!queue) return { marks: 0, enqueued: 0, skipped: 0, bridges: 0, cross: 0 };
  // Keys derive through the store (one derivation chokepoint); the probes
  // below stay raw `cache.get` EXISTENCE checks on purpose — store.get would
  // treat a corrupt entry as a miss and re-enqueue it, where today's probe
  // counts it as cached. Skip-if-cached semantics are unchanged.
  const store = artifactStore(rc.env);
  const unit = { work: tractate, unit: page };
  let marks = 0,
    enqueued = 0,
    skipped = 0;
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
    } catch {
      continue;
    }

    for (const inst of instances) {
      for (const enrichmentId of enrichmentIds) {
        if (!wanted(enrichmentId)) continue;
        const def = await loadEnrichmentDef(rc.env, enrichmentId);
        if (!def) continue;
        const iid = await instanceIdOf(inst);
        const key = store.keyFor(enrichKeyInfo(def), { instanceId: iid, unit, lang });
        if (key && cache && (await cache.get(key))) {
          skipped++;
          continue;
        }
        const runId =
          `warm:${enrichmentId}:${tractate}:${page}:${iid}:${lang}:${Math.floor(Date.now() / 1000)}`
            .replace(/[^a-zA-Z0-9._:-]+/g, '_')
            .slice(0, 200);
        try {
          await queue.send({
            runId,
            enrichment_id: enrichmentId,
            tractate,
            page,
            mark_input: inst,
            ...(lang === 'he' ? { lang } : {}),
          });
          enqueued++;
        } catch {
          /* best-effort warm */
        }
      }
    }
  }

  // Section typing: pre-warm the narrative story view, but ONLY for sections
  // that actually type as narrative (aggadata-primary). The marks are now run +
  // cached above, so the profile composition is a cache-only read. Without this,
  // a reader is the first to trigger argument.narrative on a story section (cold
  // generation); with it, the story view is usually a cache hit.
  try {
    const narrativeDef = wanted('argument.narrative')
      ? await loadEnrichmentDef(rc.env, 'argument.narrative')
      : null;
    if (narrativeDef) {
      const profiles = await buildDafTypeProfiles(rc.env, tractate, page);
      const sections = await readMarkInstances(rc.env, 'argument', tractate, page);
      for (const prof of profiles) {
        if (prof.primary !== 'aggadata') continue;
        const sec = sections.find(
          (s) => s.startSegIdx === prof.unit.startSegIdx && s.endSegIdx === prof.unit.endSegIdx,
        );
        if (!sec) continue;
        const iid = await instanceIdOf(sec);
        const key = store.keyFor(enrichKeyInfo(narrativeDef), { instanceId: iid, unit, lang });
        if (key && cache && (await cache.get(key))) {
          skipped++;
          continue;
        }
        const runId =
          `warm:argument.narrative:${tractate}:${page}:${iid}:${lang}:${Math.floor(Date.now() / 1000)}`
            .replace(/[^a-zA-Z0-9._:-]+/g, '_')
            .slice(0, 200);
        try {
          await queue.send({
            runId,
            enrichment_id: 'argument.narrative',
            tractate,
            page,
            mark_input: sec,
            ...(lang === 'he' ? { lang } : {}),
          });
          enqueued++;
        } catch {
          /* best-effort warm */
        }
      }
    }
  } catch {
    /* profile composition is best-effort; never block the deep-warm */
  }

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
  for (const eid of [
    'argument-overview.flow',
    'argument-overview.synthesis',
    'tidbit.essay',
    'biyun.essay',
  ]) {
    if (!wanted(eid)) continue;
    try {
      const def = await loadEnrichmentDef(rc.env, eid);
      if (!def) continue;
      const iid = await instanceIdOf({ fields: {} });
      const key = store.keyFor(enrichKeyInfo(def), { instanceId: iid, unit, lang });
      if (key && cache && (await cache.get(key))) {
        skipped++;
        continue;
      }
      const runId = `warm:${eid}:${tractate}:${page}:${lang}:${Math.floor(Date.now() / 1000)}`
        .replace(/[^a-zA-Z0-9._:-]+/g, '_')
        .slice(0, 200);
      await queue.send({
        runId,
        enrichment_id: eid,
        tractate,
        page,
        mark_input: { fields: {} },
        ...(lang === 'he' ? { lang } : {}),
      });
      enqueued++;
    } catch {
      /* best-effort warm */
    }
  }

  // Cross-daf links (the reader Overview's sugya map + the spine stitched view):
  // connect this daf's forward boundary and the previous daf's boundary into
  // this one — computing + pinning BOTH the continuity bridge and the
  // section-level cross-flow. Both dapim's argument sections are warm (run above
  // / globally), so the verdicts resolve and cache instead of leaving the first
  // reader to pay the cold LLM calls. Best-effort — a failure never fails the
  // warm.
  let bridges = 0;
  let cross = 0;
  try {
    const fwd = await connectBoundary(rc.env, tractate, page);
    if (fwd.bridge) bridges++;
    if (fwd.cross) cross++;
    const prev = adjacentAmud(tractate, page, -1);
    if (prev) {
      const back = await connectBoundary(rc.env, tractate, prev);
      if (back.bridge) bridges++;
      if (back.cross) cross++;
    }
  } catch {
    /* cross-daf links are best-effort */
  }

  return { marks, enqueued, skipped, bridges, cross };
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
async function processEnrichmentJob(
  env: Bindings,
  job: JobMessage,
  ctx: ExecutionContext,
): Promise<void> {
  console.log(
    '[queue] picked up job',
    job.runId,
    '·',
    job.mark_id ?? job.enrichment_id ?? 'adhoc',
    job.tractate,
    job.page,
  );
  const wrapped = wrapEnv(env);
  const cache = wrapped.CACHE;
  if (!cache) {
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
      if (only && job.rewarm_only)
        await evictCascadeEntries(rc.env, job.rewarm_only, job.tractate, job.page);
      const stats = await deepWarmDaf(rc, job.tractate, job.page, rc.lang, only);
      await writeResult({
        status: 'ok',
        result: { kind: 'warm', ...stats, total_ms: Date.now() - t0 },
      });
      console.log(
        `[queue] deep-warm ${job.tractate}/${job.page} lang=${rc.lang} marks=${stats.marks} enqueued=${stats.enqueued} skipped=${stats.skipped} bridges=${stats.bridges} cross=${stats.cross}`,
      );
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
      recordTelemetry(
        { env: wrapped, executionCtx: ctx },
        runTelemetryRec(job, result, Date.now() - t0),
      );
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
      rc,
      def,
      job.tractate,
      job.page,
      job.mark_input,
      job.bypass_cache === true,
      job.model_override as LLMModelId | undefined,
      undefined,
      job.user_question,
    );
    await writeResult({
      status: 'ok',
      result: { kind: 'enrichment', ...result, definition: def, total_ms: Date.now() - t0 },
    });
    recordTelemetry(
      { env: wrapped, executionCtx: ctx },
      runTelemetryRec(job, result, Date.now() - t0),
    );
  } catch (err) {
    const totalMs = Date.now() - t0;
    // A budget pause is an expected back-pressure outcome, not a failure: write
    // it as a paused result the client poller can surface, and DON'T record it
    // in the recent-errors buffer (it would drown out real failures).
    const paused = isBudgetPaused(err);
    if (paused) {
      const scope = (err as { scope?: BudgetScope }).scope;
      await writeResult({
        status: 'error',
        error: pauseErrorMessage(scope),
        paused: true,
        scope,
        total_ms: totalMs,
      });
      return;
    }
    const errorMsg = String((err as Error)?.message ?? err);
    console.error(
      '[queue] job failed',
      job.runId,
      '·',
      job.mark_id ?? job.enrichment_id ?? 'adhoc',
      job.tractate,
      job.page,
      '·',
      errorMsg.slice(0, 500),
    );
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
        runBacklogBackfill(wrapped, (n, nHe, g) => enrichRabbi(n, nHe, g as GenerationId)).then(
          async (r) => {
            if (r) return; // backfill ran this tick — give it the full budget
            // Connect-only cross-daf sweep first (bounded + cheap, so it always
            // makes a little progress), then the source warm cron uses the rest.
            await runConnectSweep(wrapped).catch(() => {});
            await runWarmCron(wrapped);
          },
        ),
      );
    }
  },
  // Queue consumer — wrangler.toml binds queue=enrichment-jobs to this
  // export. Each message is one /api/run job. max_concurrency=2 caps
  // simultaneous LLM workloads; max_batch_size=1 means one job per
  // invocation (no batching), which keeps memory bounded per worker.
  queue: async (
    batch: MessageBatch<JobMessage>,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> => {
    console.log('[queue] batch arrived:', batch.messages.length, 'message(s)');
    for (const msg of batch.messages) {
      try {
        await processEnrichmentJob(env, msg.body, ctx);
        msg.ack();
      } catch (err) {
        // Network / KV blip — let the runtime retry once (max_retries=1).
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
