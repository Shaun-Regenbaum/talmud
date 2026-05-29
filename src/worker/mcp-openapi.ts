/**
 * Curated OpenAPI 3.1 description of the Talmud app's HTTP API, consumed by the
 * code-mode MCP server (src/worker/mcp.ts). The MCP `search` tool queries this
 * spec to discover endpoints; the `execute` tool calls them through a host-side
 * `request({ method, path, query, body })` bridge.
 *
 * Scope is the routes that go into building a daf page — text, context, the
 * marks/enrichments that produce anchors, plus rabbi data and debug telemetry.
 * The `execute` bridge can reach ANY `/api/*` route even if it isn't documented
 * here; this spec just drives discovery.
 *
 * Keep descriptions tight: every byte is read by the model. When you add or
 * rename an `/api/*` route worth surfacing, add it here too.
 */

const tractate = {
  name: 'tractate',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Tractate name, capitalized (e.g. "Berakhot", "Pesachim").',
} as const;

const page = {
  name: 'page',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Daf + amud, e.g. "2a", "2b", "14a".',
} as const;

const refresh = {
  name: 'refresh',
  in: 'query',
  required: false,
  schema: { type: 'string', enum: ['1'] },
  description: 'Pass "1" to bypass the KV cache and refetch from source.',
} as const;

const slug = {
  name: 'slug',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Rabbi slug (kebab-case canonical id, e.g. "rabbi-akiva"). Use /api/sages-index to discover slugs.',
} as const;

export const TALMUD_OPENAPI: Record<string, unknown> = {
  openapi: '3.1.0',
  info: {
    title: 'Talmud Study App API',
    version: '1.0.0',
    description: [
      'Read + debug the data behind talmud.shaunregenbaum.com.',
      '',
      'HOW A DAF PAGE IS BUILT (so you can reproduce/debug it):',
      '1. GET /api/daf/{tractate}/{page} returns the segmented text:',
      '   mainText {hebrew,english}, rashi, tosafot, and parallel',
      '   mainSegmentsHe[] / mainSegmentsEn[] arrays (segment index = anchor coord).',
      '2. MARKS are structural extractors that run over that text and return',
      '   anchored instances: { instances: [{ excerpt, fields, ... }] }. The',
      '   `excerpt` strings ARE the anchors highlighted on the page. There is no',
      '   separate anchors endpoint. Mark ids include: rabbi, argument,',
      '   argument-move, halacha, aggadata, pesukim, places, rishonim,',
      '   rabbi.observations. List them with GET /api/studio/marks.',
      '3. ENRICHMENTS are LLM passes that run ON a mark instance to produce the',
      '   synthesized cards (e.g. explain an argument-move). List them with',
      '   GET /api/studio/enrichments.',
      '',
      'RUNNING MARKS/ENRICHMENTS (the engine): POST /api/studio/run is the single',
      'entry point. It is ASYNCHRONOUS:',
      '  - On a cache hit it returns 200 { status: "ok", result }.',
      '  - Otherwise it returns 202 { status: "pending", runId, cacheKey }; then',
      '    poll GET /api/studio/run-status/{runId}?k={cacheKey} until you get',
      '    200 { status: "ok", result } (it returns 202 { status: "pending" }',
      '    while the job is still on the queue).',
      'In code mode you can do this whole loop inside one `execute` call: run a',
      'mark, take an instance from result.parsed.instances, then run an enrichment',
      'with enrichment_id + mark_input = that instance, polling each time.',
      '',
      'ACCESS: open and read-focused. You can read page data and run the',
      'registered marks/enrichments shown here. A few advanced run options are',
      'reserved and return an authorization error; stick to the documented fields.',
    ].join('\n'),
  },
  servers: [{ url: 'https://talmud.shaunregenbaum.com', description: 'Production' }],
  paths: {
    '/api/health': {
      get: { summary: 'Liveness check.', responses: { '200': { description: '{ ok: true }' } } },
    },

    '/api/daf/{tractate}/{page}': {
      get: {
        summary: 'Full daf text: Gemara + Rashi + Tosafot, segmented (he/en).',
        description:
          'Returns mainText {hebrew,english}, rashi/tosafot {hebrew,english,pieces?}, ' +
          'parallel mainSegmentsHe[]/mainSegmentsEn[] (index = segment/anchor coord), ' +
          '_source ("hebrewbooks"|"sefaria"), _cache.',
        parameters: [
          tractate,
          page,
          {
            name: 'source',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['sefaria'] },
            description: 'Force Sefaria as the base text instead of the default HebrewBooks.',
          },
        ],
        responses: { '200': { description: 'TalmudPageData' } },
      },
    },

    '/api/dafyomi/{tractate}/{page}': {
      get: {
        summary: 'Dafyomi.co.il study content for the daf (markdown + assets).',
        parameters: [tractate, page, refresh],
        responses: { '200': { description: 'Dafyomi study payload' } },
      },
    },

    '/api/context/{tractate}/{page}': {
      get: {
        summary: 'Unified context pool: Sefaria commentary, mishnah, rishonim, halacha, topics.',
        description: 'Returns { tractate, page, items: ContextItem[], fetchedAt }. Each item has a key, type, and text used as enrichment context.',
        parameters: [tractate, page],
        responses: { '200': { description: 'Context pool' } },
      },
    },

    '/api/context/match': {
      post: {
        summary: 'AI-match context items to the daf segments they belong to.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tractate', 'page', 'items'],
                properties: {
                  tractate: { type: 'string' },
                  page: { type: 'string' },
                  items: {
                    type: 'array',
                    description: 'Context items (from /api/context) to anchor to segments.',
                    items: { type: 'object', properties: { key: { type: 'string' }, type: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
        responses: { '200': { description: '{ matches: SegMatch[], warning? }' } },
      },
    },

    '/api/references/{tractate}/{page}': {
      get: {
        summary: 'Sefaria cross-references (links to/from other texts) grouped by work.',
        parameters: [tractate, page, refresh],
        responses: { '200': { description: '{ byWork: [...] }' } },
      },
    },

    '/api/commentaries/{tractate}/{page}': {
      get: {
        summary: 'List Sefaria commentaries available for the daf.',
        parameters: [tractate, page, refresh],
        responses: { '200': { description: '{ works: [...] }' } },
      },
    },

    '/api/studio/marks': {
      get: {
        summary: 'List all mark definitions (the structural extractors that produce anchors).',
        responses: { '200': { description: '{ marks: MarkDefinition[] }' } },
      },
    },
    '/api/studio/marks/{id}': {
      get: {
        summary: 'Get one mark definition by id.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Mark id, e.g. "argument-move".' }],
        responses: { '200': { description: '{ mark: MarkDefinition }' }, '404': { description: 'unknown mark' } },
      },
    },

    '/api/studio/enrichments': {
      get: {
        summary: 'List all enrichment definitions (LLM passes that run on a mark instance).',
        responses: { '200': { description: '{ enrichments: EnrichmentDefinition[] }' } },
      },
    },
    '/api/studio/enrichments/{id}': {
      get: {
        summary: 'Get one enrichment definition by id.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: '{ enrichment: EnrichmentDefinition }' }, '404': { description: 'unknown enrichment' } },
      },
    },

    '/api/studio/run': {
      post: {
        summary: 'Run a mark or enrichment for a daf. Async: cache hit => 200 result; else 202 { runId, cacheKey } to poll.',
        description:
          'Provide mark_id OR enrichment_id. For an enrichment, pass mark_input = ' +
          'the specific mark instance to run it on. ad_hoc / model_override / ' +
          'bypass_cache are privileged and need the x-studio-secret header.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tractate', 'page'],
                properties: {
                  tractate: { type: 'string' },
                  page: { type: 'string' },
                  mark_id: { type: 'string', description: 'Run a mark, e.g. "argument-move".' },
                  enrichment_id: { type: 'string', description: 'Run an enrichment (usually with mark_input).' },
                  mark_input: { type: 'object', description: 'The mark instance to enrich (from a prior mark run).' },
                  user_question: { type: 'string', description: 'Free-text question for Q&A-style enrichments.' },
                  lang: { type: 'string', enum: ['en', 'he'], description: 'Output language (default en).' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '{ status: "ok", result: RunResult }' },
          '202': { description: '{ status: "pending", runId, cacheKey }' },
        },
      },
    },
    '/api/studio/run-status/{runId}': {
      get: {
        summary: 'Poll a queued run. 202 { status: "pending" } while running; 200 { status: "ok", result } when done.',
        parameters: [
          { name: 'runId', in: 'path', required: true, schema: { type: 'string' }, description: 'runId from POST /api/studio/run.' },
          { name: 'k', in: 'query', required: false, schema: { type: 'string' }, description: 'cacheKey fallback returned by POST /api/studio/run.' },
        ],
        responses: { '200': { description: '{ status: "ok", result }' }, '202': { description: '{ status: "pending" }' } },
      },
    },

    '/api/sages-index': {
      get: { summary: 'Index of all sages: { sages: [{ slug, name, nameHe, aliases }] }.', responses: { '200': { description: 'sages index' } } },
    },
    '/api/rabbi/{slug}': {
      get: {
        summary: 'Static rabbi record: name, generation, region, places, bio.',
        parameters: [slug],
        responses: { '200': { description: '{ rabbi: {...} }' } },
      },
    },
    '/api/rabbi-observations/{slug}': {
      get: {
        summary: 'Reverse index of every daf where this rabbi appears, by observation type.',
        parameters: [
          slug,
          { name: 'type', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter to one observation type (place, opinion, story, exegesis, lineage).' },
          { name: 'min', in: 'query', required: false, schema: { type: 'integer' }, description: 'Minimum daf count to include an aggregated observation.' },
        ],
        responses: { '200': { description: '{ observations, aggregated, byType }' } },
      },
    },

    '/api/mesorah/{tractate}/{page}': {
      get: {
        summary: 'Teacher -> student lineage chains for the sages on this daf.',
        parameters: [
          tractate,
          page,
          refresh,
          { name: 'depth', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 10 }, description: 'Walk depth (default 3).' },
        ],
        responses: { '200': { description: '{ chains: {...} }' } },
      },
    },
    '/api/region/{tractate}/{page}': {
      get: {
        summary: 'Geographic distribution (Israel vs Babylon) of the sages on this daf.',
        parameters: [tractate, page, refresh],
        responses: { '200': { description: '{ distribution, migrated, sections }' } },
      },
    },

    '/api/translate': {
      post: {
        summary: 'Context-aware translation of a Talmudic Hebrew/Aramaic word or phrase.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['word', 'tractate', 'page'],
                properties: {
                  word: { type: 'string' },
                  tractate: { type: 'string' },
                  page: { type: 'string' },
                  hebrewBefore: { type: 'string', description: 'Preceding context for disambiguation.' },
                  hebrewAfter: { type: 'string', description: 'Following context.' },
                  segIdx: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { '200': { description: '{ translation, cached }' } },
      },
    },
    '/api/pasuk': {
      get: {
        summary: 'Fetch a single Tanakh verse (Hebrew + English).',
        parameters: [{ name: 'ref', in: 'query', required: true, schema: { type: 'string' }, description: 'Sefaria-style ref, e.g. "Genesis 1:1".' }],
        responses: { '200': { description: '{ ref, he, en, ... }' } },
      },
    },

    '/api/usage': {
      get: {
        summary: 'Usage + performance rollups per endpoint / mark / enrichment, plus recent errors.',
        responses: { '200': { description: '{ perEndpoint, perMark, perEnrichment, recentErrors }' } },
      },
    },
    '/api/admin/recent-errors': {
      get: {
        summary: 'Recent queue-job failures (marks/enrichments that errored). Read-only, public.',
        parameters: [
          { name: 'id', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by mark/enrichment id.' },
          { name: 'tractate', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
        ],
        responses: { '200': { description: '{ count, errors: [...] }' } },
      },
    },
    '/api/admin/cache-stats': {
      get: { summary: 'KV cache hit/miss rates across buckets.', responses: { '200': { description: 'cache stats' } } },
    },
    '/api/log/recent': {
      get: { summary: 'Recent client-side log records (last ~500).', responses: { '200': { description: '{ logs: [...] }' } } },
    },
  },
};
