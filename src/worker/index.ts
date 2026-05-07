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
import { runLLM, type LLMModelId } from './llm';
import { readSettings, writeSettings, isLLMModelId, MODEL_PRESETS } from './settings';
import {
  readMark, listMarks, writeMark, deleteMark, validateMark,
  readEnrichment, listEnrichments, writeEnrichment, deleteEnrichment, validateEnrichment,
  type MarkDefinition as KvMarkDefinition,
  type EnrichmentDefinition,
} from './studio-registry';
import { CODE_MARKS, CODE_ENRICHMENTS, findCodeMark, findCodeEnrichment } from './code-marks';
import type {
  MarkDefinition as SchemaMarkDefinition,
  EnrichmentDefinition as SchemaEnrichmentDefinition,
  EnrichmentDependency,
  MarkDependency,
} from './studio-schema';
import {
  keyForMark,
  keyForEnrichment,
  keyForGemara,
  keyForCommentaries,
  instanceIdOf,
} from './cache-keys';

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
  OPENROUTER_GATEWAY_PROVIDER?: string;
  DEFAULT_LLM_MODEL?: string;
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

// Minimal support utilities used by the kept routes (daf-context, region,
// mesorah, era-* and the offline rabbi data-build pipeline). The legacy
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
 * LLM settings — read/write the default model + fallback chain that runLLM
 * resolves at call time. Backed by KV under `llm-settings:v1` (see
 * src/worker/settings.ts). The model dropdown in the client is built from
 * MODEL_PRESETS, exposed here so the page can render without bundling them.
 */
app.get('/api/admin/llm-settings', async (c) => {
  const settings = await readSettings(c.env);
  return c.json({ settings, presets: MODEL_PRESETS });
});

app.post('/api/admin/llm-settings', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'invalid JSON body' }, 400); }
  const b = body as { defaultModel?: unknown; fallbackChain?: unknown; perStepOverrides?: unknown };
  if (!isLLMModelId(b.defaultModel)) {
    return c.json({ error: 'defaultModel must be "@cf/..." or "openrouter/..."' }, 400);
  }
  if (!Array.isArray(b.fallbackChain) || !b.fallbackChain.every(isLLMModelId)) {
    return c.json({ error: 'fallbackChain must be an array of model ids' }, 400);
  }
  const overrides = b.perStepOverrides;
  if (overrides !== undefined && (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides))) {
    return c.json({ error: 'perStepOverrides must be an object' }, 400);
  }
  if (overrides && !Object.values(overrides).every(isLLMModelId)) {
    return c.json({ error: 'perStepOverrides values must be model ids' }, 400);
  }
  if (!c.env.CACHE) return c.json({ error: 'CACHE binding not available' }, 503);
  const saved = await writeSettings(c.env, {
    defaultModel: b.defaultModel as LLMModelId,
    fallbackChain: b.fallbackChain as LLMModelId[],
    perStepOverrides: overrides as Record<string, LLMModelId> | undefined,
  });
  return c.json({ settings: saved });
});

/**
 * Studio: KV-backed mark + enrichment registries. Definitions live under
 *   mark-defs:v1:{id}        — what to extract from a daf
 *   enrichment-defs:v1:{id}  — what to derive from a mark
 *
 * Ad-hoc runs (no save) hit /api/studio/run with an inline definition. Saved
 * runs reference an id and get cached. The same registry powers Home (all
 * registered enrichments shown as toggles, off by default) and Studio
 * (per-enrichment editor + preview).
 */
app.get('/api/studio/marks', async (c) => {
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
app.get('/api/studio/marks/:id', async (c) => {
  const id = c.req.param('id');
  const kv = await readMark(c.env, id);
  if (kv) return c.json({ mark: kv });
  const code = findCodeMark(id);
  if (code) return c.json({ mark: code });
  return c.json({ error: 'not found' }, 404);
});
app.put('/api/studio/marks/:id', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
  const v = validateMark({ ...(body as object), id: c.req.param('id') });
  if (!v.ok) return c.json({ error: v.error }, 400);
  const saved = await writeMark(c.env, v.spec);
  return c.json({ mark: saved });
});
app.delete('/api/studio/marks/:id', async (c) => {
  await deleteMark(c.env, c.req.param('id'));
  return c.json({ ok: true });
});

app.get('/api/studio/enrichments', async (c) => {
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
      cache_version: e.cache_version,
      source: 'code',
      updated_at: e.updated_at,
    }));
  return c.json({ enrichments: [...codeFlat, ...kv] });
});
app.get('/api/studio/enrichments/:id', async (c) => {
  const id = c.req.param('id');
  const kv = await readEnrichment(c.env, id);
  if (kv) return c.json({ enrichment: kv });
  const code = findCodeEnrichment(id);
  if (code) return c.json({ enrichment: code });
  return c.json({ error: 'not found' }, 404);
});
app.put('/api/studio/enrichments/:id', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
  const v = validateEnrichment({ ...(body as object), id: c.req.param('id') });
  if (!v.ok) return c.json({ error: v.error }, 400);
  const saved = await writeEnrichment(c.env, v.spec);
  return c.json({ enrichment: saved });
});
app.delete('/api/studio/enrichments/:id', async (c) => {
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
  const bundle = await getRishonimCached(cache, tractate, page);
  const slice: CommentariesSlice = { tractate, page, by_commentator: bundle ?? {} };
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

function commentariesSliceToString(s: CommentariesSlice): string {
  const names = Object.keys(s.by_commentator).sort();
  return names.map((n) => {
    const row = s.by_commentator[n];
    return `[${n}]\n${row.hebrew}\n${row.english}`.trim();
  }).join('\n\n---\n\n');
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
  if (code.extractor.kind !== 'llm') return null;
  return {
    id: code.id,
    label: code.label,
    description: code.description,
    mark: code.target_mark,
    scope: code.scope,
    dependencies: code.dependencies,
    system_prompt: code.extractor.system_prompt,
    user_prompt_template: code.extractor.user_prompt_template,
    model: code.extractor.model,
    output_schema: code.extractor.output_schema,
    thinking_off: code.extractor.thinking_off,
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
  for (const dep of dependencies) {
    if (dep === 'gemara') {
      const slice = await getGemaraSlice(rc.env, tractate, page, bypassCache);
      Object.assign(out.vars, gemaraSliceToVars(slice));
      continue;
    }
    if (dep === 'commentaries') {
      const slice = await getCommentariesSlice(rc.env, tractate, page, bypassCache);
      out.vars.commentaries = commentariesSliceToString(slice);
      continue;
    }
    if (typeof dep === 'object' && dep !== null) {
      if ('enrichment' in dep) {
        const depId = dep.enrichment;
        if (parentChain.has(depId)) {
          out.depends[depId] = { error: `cycle detected (${[...parentChain].join(' → ')} → ${depId})` };
          continue;
        }
        const depDef = await loadEnrichmentDef(rc.env, depId);
        if (!depDef) {
          out.depends[depId] = { error: 'not found' };
          continue;
        }
        try {
          const result = await runEnrichmentOnce(rc, depDef, tractate, page, markInput, bypassCache, undefined, parentChain);
          out.depends[depId] = result.parsed ?? result.content;
        } catch (err) {
          out.depends[depId] = { error: String((err as Error)?.message ?? err) };
        }
        continue;
      }
      if ('mark' in dep) {
        const markId = dep.mark;
        const markDef = await loadMarkDef(rc.env, markId);
        if (!markDef) {
          out.anchors[markId] = { error: 'not found' };
          continue;
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
        continue;
      }
    }
  }
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
}

interface RunResultEnrichment extends RunResult {
  deps_resolved?: Record<string, unknown>;
  anchors_resolved?: Record<string, unknown>;
}

async function readCachedResult(env: Bindings, key: string): Promise<RunResult | null> {
  if (!env.CACHE) return null;
  const raw = await env.CACHE.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as RunResult; } catch { return null; }
}

async function writeCachedResult(env: Bindings, key: string, result: RunResult): Promise<void> {
  if (!env.CACHE) return;
  // 90 day TTL — outputs are deterministic per (def_hash, cache_version, daf
  // or instance), so they're stable until the operator bumps cache_version.
  await env.CACHE.put(key, JSON.stringify(result), { expirationTtl: 90 * 24 * 3600 });
}

async function runMarkOnce(
  rc: RunCtx,
  def: SchemaMarkDefinition,
  tractate: string,
  page: string,
  bypassCache: boolean,
): Promise<RunResult> {
  if (def.extractor.kind !== 'llm') {
    throw new Error(`mark ${def.id} extractor.kind=${def.extractor.kind} not supported`);
  }
  const ext = def.extractor;
  const cacheKey = keyForMark(def, tractate, page);
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
  const systemPrompt = renderTemplate(ext.system_prompt, vars);
  const userPrompt = renderTemplate(ext.user_prompt_template, vars);

  const result = await runLLM(rc.env, {
    ...(ext.model ? { model: ext.model } : {}),
    ...(ext.fallback && ext.fallback.length > 0 ? { fallback: ext.fallback } : {}),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 16000,
    temperature: 0.2,
    response_format: ext.output_schema
      ? { type: 'json_schema', json_schema: ext.output_schema }
      : undefined,
    thinking: ext.thinking_off ? false : undefined,
    bypass_cache: bypassCache,
  });

  let parsed: unknown = null;
  let parse_error: string | null = null;
  if (ext.output_schema) {
    try { parsed = JSON.parse(result.content); }
    catch (err) { parse_error = String(err).slice(0, 200); }
  }
  // Per-mark post-processing. Some extractors (notably argument-move) can't
  // reliably emit segment indices for sub-ranges, so we re-derive them from
  // the verbatim Hebrew excerpt the LLM IS good at copying.
  if (parsed && def.id === 'argument-move') {
    parsed = await postProcessArgumentMove(parsed, rc.env, tractate, page);
  }
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
  };
  if (!parse_error) await writeCachedResult(rc.env, cacheKey, out);
  return out;
}

/**
 * Post-process argument-move mark output: V4-Flash reliably copies the
 * verbatim Hebrew excerpt for each move but its startSegIdx/endSegIdx are
 * frequently the WHOLE section (every move = same range, "lazy partition"
 * issue). Re-derive ranges by locating each excerpt in the gemara's
 * numbered segments and computing the next-move boundary.
 *
 * Algorithm:
 *   1. For each move, normalize the excerpt and search the segments_he
 *      array for the segment whose normalized text contains it. That seg
 *      becomes the move's startSegIdx.
 *   2. The endSegIdx is the segment right before the next move's startSegIdx
 *      (within the same parent section), or the section's endSegIdx for the
 *      last move in a section.
 *   3. If an excerpt can't be located, leave the LLM-emitted range alone
 *      (don't make things worse).
 *
 * LIMITATION (TODO: sub-segment anchoring):
 *   When Sefaria packages a section as a SINGLE segment — most commonly the
 *   opening Mishnah of a tractate, where the whole Mishnah is one block at
 *   segments_he[0] — every move inside that section resolves to the same
 *   startSegIdx. Clicking different moves all highlight the same span on
 *   the daf even though the LLM correctly identified them as distinct.
 *
 *   Fix path (separate piece of work; see legacy halacha highlight in
 *   DafViewer.tsx for the existing word-token precedent):
 *     1. Extend mark instance fields to optionally carry { tokenStart,
 *        tokenEnd } — word indices within the segment.
 *     2. Have this post-processor also walk the .daf-word stream of the
 *        matched segment to compute the excerpt's word range, not just
 *        its segment.
 *     3. Update the move-highlight painter in DafViewer.applyHighlights
 *        to paint over [seg.tokenStart .. seg.tokenEnd] when those fields
 *        are present, falling back to whole-segment when absent.
 *   Most non-Mishnah sections are split into multiple segments per move so
 *   this only bites bundled-Mishnah-style blocks.
 */
async function postProcessArgumentMove(
  parsed: unknown,
  env: Bindings,
  tractate: string,
  page: string,
): Promise<unknown> {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const obj = parsed as { instances?: unknown };
  if (!Array.isArray(obj.instances)) return parsed;

  const slice = await getGemaraSlice(env, tractate, page, false);
  const segs = slice.segments_he;
  if (segs.length === 0) return parsed;

  const normalize = (s: string) =>
    s.replace(/[֑-ׇ]/g, '')   // strip nikud + cantillation
      .replace(/[׳״"'.,:;!?\-–—()[\]{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const segNorms = segs.map(normalize);

  type Move = { startSegIdx: number; endSegIdx: number; fields: { sectionStartSegIdx: number; sectionEndSegIdx: number; moveOrder: number; excerpt: string; [k: string]: unknown } };
  const instances = obj.instances as Move[];

  // Pass 1: locate each move's startSegIdx by excerpt search. Search after
  // the previous move's match within the same section so partition ordering
  // is preserved when multiple moves share verbatim phrasing.
  let lastSection = -1;
  let searchFrom = 0;
  for (const inst of instances) {
    if (!inst || typeof inst !== 'object') continue;
    const f = inst.fields ?? {};
    const sStart = typeof f.sectionStartSegIdx === 'number' ? f.sectionStartSegIdx : 0;
    if (sStart !== lastSection) { lastSection = sStart; searchFrom = sStart; }
    const ex = typeof f.excerpt === 'string' ? normalize(f.excerpt) : '';
    if (!ex) continue;
    let found = -1;
    for (let i = searchFrom; i < segNorms.length; i++) {
      if (segNorms[i].includes(ex)) { found = i; break; }
    }
    if (found < 0) {
      // Fallback: search from section start without the searchFrom cursor
      // (prev move's match might have been at the wrong position).
      for (let i = sStart; i <= (typeof f.sectionEndSegIdx === 'number' ? f.sectionEndSegIdx : segNorms.length - 1); i++) {
        if (segNorms[i].includes(ex)) { found = i; break; }
      }
    }
    if (found >= 0) {
      inst.startSegIdx = found;
      searchFrom = found + 1;
    }
  }

  // Pass 2: derive endSegIdx from the next move's startSegIdx within the
  // same section, or the section's endSegIdx for the last move.
  for (let i = 0; i < instances.length; i++) {
    const cur = instances[i];
    if (!cur) continue;
    const sEnd = typeof cur.fields?.sectionEndSegIdx === 'number' ? cur.fields.sectionEndSegIdx : cur.startSegIdx;
    const next = instances[i + 1];
    const nextInSameSection = next && next.fields?.sectionStartSegIdx === cur.fields?.sectionStartSegIdx;
    cur.endSegIdx = nextInSameSection ? Math.max(cur.startSegIdx, next.startSegIdx - 1) : sEnd;
    if (cur.endSegIdx < cur.startSegIdx) cur.endSegIdx = cur.startSegIdx;
  }

  return obj;
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
): Promise<RunResultEnrichment> {
  const instance_id = await instanceIdOf(markInput);
  const cacheKey = modelOverride
    // Per-call model overrides skip the canonical cache to avoid polluting
    // the default-traffic key. Re-running with the same override hits the
    // gateway prompt cache but not KV — consistent with bypass behavior.
    ? null
    : keyForEnrichment(def, instance_id, def.scope === 'local' ? { tractate, page } : undefined);
  if (cacheKey && !bypassCache) {
    const hit = await readCachedResult(rc.env, cacheKey);
    if (hit) return { ...hit, cache_hit: true };
  }

  const nextChain = new Set(parentChain);
  nextChain.add(def.id);
  const inputs = await resolveDependencies(rc, def.dependencies, tractate, page, markInput, bypassCache, nextChain);

  const vars: Record<string, unknown> = {
    ...inputs.vars,
    mark_input: markInput,
    depends: inputs.depends,
    anchors: inputs.anchors,
  };
  const systemPrompt = renderTemplate(def.system_prompt, vars);
  const userPrompt = renderTemplate(def.user_prompt_template, vars);

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
    bypass_cache: bypassCache,
  });

  let parsed: unknown = null;
  let parse_error: string | null = null;
  if (def.output_schema) {
    try { parsed = JSON.parse(result.content); }
    catch (err) { parse_error = String(err).slice(0, 200); }
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
    deps_resolved: Object.keys(inputs.depends).length > 0 ? inputs.depends : undefined,
    anchors_resolved: Object.keys(inputs.anchors).length > 0 ? inputs.anchors : undefined,
  };
  if (cacheKey && !parse_error) await writeCachedResult(rc.env, cacheKey, out);
  return out;
}

/**
 * POST /api/studio/run — execute a mark or enrichment, return its raw output
 * + telemetry. Cache-aware: results are read/written via cache-keys.ts.
 *
 * Body:
 *   { mark_id?, enrichment_id?, ad_hoc?,
 *     tractate, page,
 *     model_override?, mark_input?, bypass_cache? }
 *
 * Exactly one of mark_id / enrichment_id / ad_hoc is required.
 */
app.post('/api/studio/run', async (c) => {
  let body: {
    mark_id?: string;
    enrichment_id?: string;
    ad_hoc?: unknown;
    tractate?: string;
    page?: string;
    model_override?: string;
    mark_input?: unknown;
    bypass_cache?: boolean;
  };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
  const { tractate, page, model_override, mark_input } = body;
  if (!tractate || !page) return c.json({ error: 'tractate and page required' }, 400);
  if (model_override && !isLLMModelId(model_override)) {
    return c.json({ error: 'model_override must start with @cf/ or openrouter/' }, 400);
  }
  const bypass = body.bypass_cache === true;
  const rc: RunCtx = { env: c.env, url: c.req.url, ctx: c.executionCtx };
  const t0 = Date.now();

  if (body.mark_id) {
    const def = await loadMarkDef(c.env, body.mark_id);
    if (!def) return c.json({ error: `mark ${body.mark_id} not found` }, 404);
    try {
      const result = await runMarkOnce(rc, def, tractate, page, bypass);
      recordTelemetry(c, {
        endpoint: 'studio-mark', tractate, page, mark_id: body.mark_id,
        cache_hit: result.cache_hit, model: result.model,
        ms: Date.now() - t0, ok: true,
      });
      return c.json({
        kind: 'mark',
        ...result,
        definition: def,
        total_ms: Date.now() - t0,
      });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      recordTelemetry(c, {
        endpoint: 'studio-mark', tractate, page, mark_id: body.mark_id,
        cache_hit: false, ms: Date.now() - t0, ok: false, error_kind: classifyError(msg),
      });
      return c.json({
        error: msg,
        definition: def,
        total_ms: Date.now() - t0,
      }, 502);
    }
  }

  let def: EnrichmentDefinition | null = null;
  if (body.enrichment_id) {
    def = await loadEnrichmentDef(c.env, body.enrichment_id);
    if (!def) return c.json({ error: `enrichment ${body.enrichment_id} not found` }, 404);
  } else if (body.ad_hoc) {
    const v = validateEnrichment({ ...(body.ad_hoc as object), id: 'ad-hoc' });
    if (!v.ok) return c.json({ error: `ad_hoc invalid: ${v.error}` }, 400);
    def = { ...v.spec, source: 'kv', updated_at: new Date().toISOString() };
  } else {
    return c.json({ error: 'mark_id, enrichment_id, or ad_hoc required' }, 400);
  }

  try {
    const result = await runEnrichmentOnce(
      rc, def, tractate, page, mark_input, bypass,
      model_override as LLMModelId | undefined,
    );
    recordTelemetry(c, {
      endpoint: 'studio-enrichment', tractate, page, enrichment_id: def.id,
      cache_hit: result.cache_hit, model: result.model,
      ms: Date.now() - t0, ok: true,
    });
    return c.json({
      kind: 'enrichment',
      ...result,
      definition: def,
      total_ms: Date.now() - t0,
    });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    recordTelemetry(c, {
      endpoint: 'studio-enrichment', tractate, page, enrichment_id: def.id,
      cache_hit: false, ms: Date.now() - t0, ok: false, error_kind: classifyError(msg),
    });
    return c.json({
      error: msg,
      definition: def,
      total_ms: Date.now() - t0,
    }, 502);
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
//
// Endpoint vocabulary (open enum — string-typed):
//   'translate'           legacy /api/translate
//   'daf-context'         legacy /api/daf-context skeleton stage
//   'daf-context-stage2'  legacy /api/daf-context bio-enrichment stage
//   'studio-mark'         /api/studio/run for a mark (see mark_id field)
//   'studio-enrichment'   /api/studio/run for an enrichment (see enrichment_id)
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

  return c.json({
    telemetry: { perEndpoint, perMark, perEnrichment, recentErrors, totalCount: telemetry.length },
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
  const translateModels: Array<{ id: LLMModelId; label: string; kimi?: boolean }> = [
    { id: '@cf/google/gemma-4-26b-a4b-it', label: 'gemma-4-26b' },
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
  env: Bindings,
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
    const r = await runLLM(env, {
      model: modelId as LLMModelId,
      messages: [
        { role: 'system', content: GENERATIONS_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: opts.maxTokens,
      temperature: 0.1,
      thinking: opts.enableThinking,
      response_format: { type: 'json_schema', json_schema: GENERATIONS_JSON_SCHEMA },
    });
    const payload = r.content.trim() || extractJsonPayload({ response: r.content });
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
  env: Bindings,
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
      env, modelId,
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
    c.env, '@cf/google/gemma-4-26b-a4b-it', hebrewText, englishContext, tractate, page,
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
  if (cache) {
    const hebSnap = hebrewText;
    const engSnap = englishContext;
    const env = c.env;
    const ctx = c.executionCtx;
    c.executionCtx.waitUntil((async () => {
      const s2t0 = Date.now();
      try {
        const r = await runGenerationsModelStreaming(
          env, '@cf/moonshotai/kimi-k2.5', hebSnap, engSnap, tractate, page,
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
  const cacheKey = `rabbi-enriched:v1:${slug}`;
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
  const modelId: LLMModelId = '@cf/google/gemma-4-26b-a4b-it';
  try {
    const r = await runLLM(c.env, {
      model: modelId,
      messages: [
        { role: 'system', content: ERA_LLM_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 4000,
      temperature: 0.1,
      thinking: false,
      response_format: { type: 'json_schema', json_schema: ERA_LLM_JSON_SCHEMA },
    });
    const payload = r.content.trim() || extractJsonPayload({ response: r.content });
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
  env: Bindings,
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
  const r = await runLLM(env, {
    model: '@cf/google/gemma-4-26b-a4b-it',
    messages: [
      { role: 'system', content: ERA_LLM_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    max_tokens: 4000,
    temperature: 0.1,
    thinking: false,
    response_format: { type: 'json_schema', json_schema: ERA_LLM_JSON_SCHEMA },
  });
  const payload = r.content.trim() || extractJsonPayload({ response: r.content });
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
    const proxyReq = new Request(new URL(`/api/daf-context/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}`, c.req.url).toString(), { method: 'GET' });
    const resp = await app.fetch(proxyReq, c.env, c.executionCtx);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const ctx = await resp.json() as { rabbis?: Array<{ slug?: string | null }> };
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
      c.env,
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
    const r = await runLLM(c.env, {
      model: '@cf/google/gemma-4-26b-a4b-it',
      messages: [
        { role: 'system', content: HEBRAIZE_LLM_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      max_tokens: Math.min(4096, Math.ceil(text.length * 1.5) + 256),
      temperature: 0,
      thinking: false,
    });
    const out = r.content.trim();
    if (!out) return c.json({ error: 'empty response', text }, 502);
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
  const hit = await c.env.CACHE.get(`rabbi-bio:v1:${tractate}:${page}:${slug}`);
  if (!hit) return c.json({ error: 'not synthesized' }, 404);
  return c.json(JSON.parse(hit));
});

// ============================================================================
// Admin endpoints for the per-entity-type enrichment Workflows.
// One create + one status endpoint per workflow. Identical shape; the only
// thing that varies is which binding gets invoked.
// ============================================================================

const YOMI_WARM_CRON = '0 3 * * *';

export default {
  fetch: (req: Request, env: Bindings, ctx: ExecutionContext) => app.fetch(req, wrapEnv(env), ctx),
  scheduled: (controller: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    const wrapped = wrapEnv(env);
    if (controller.cron === YOMI_WARM_CRON) {
      ctx.waitUntil(runYomiWarmCron(wrapped));
    } else {
      ctx.waitUntil(runWarmCron(wrapped));
    }
  },
} satisfies ExportedHandler<Bindings>;
