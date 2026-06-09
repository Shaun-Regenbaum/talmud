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
  description:
    'Rabbi slug (kebab-case canonical id, e.g. "rabbi-akiva"). Use /api/sages-index to discover slugs.',
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
      '   argument-move, halacha, aggadata, yerushalmi, pesukim, places,',
      '   rishonim, rabbi.observations. List them with GET /api/marks.',
      '3. ENRICHMENTS are LLM passes that run ON a mark instance to produce the',
      '   synthesized cards (e.g. explain an argument-move). List them with',
      '   GET /api/enrichments.',
      '',
      'RUNNING MARKS/ENRICHMENTS (the engine): POST /api/run is the single',
      'entry point. It is ASYNCHRONOUS:',
      '  - On a cache hit it returns 200 { status: "ok", result }.',
      '  - Otherwise it returns 202 { status: "pending", runId, cacheKey }; then',
      '    poll GET /api/run-status/{runId}?k={cacheKey} until you get',
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
        summary: 'Structured dafyomi.co.il (Kollel Iyun HaDaf) study content for the daf.',
        description:
          'Returns a DafyomiDaf: { tractate, daf, source{urls,fetchedAt}, amudim{a,b}, absent[] }. ' +
          'amudim hold per-amud, per-type blocks across nine content types: insights, background, ' +
          "halacha, tosfos, review, points, hebcharts, yerushalmi, and revach (Revach l'Daf — brief " +
          'SUMMARY + "A BIT MORE" highlights). Daf 76 of Chullin is committed; every other daf is ' +
          'fetched live then cached. Pass refresh=1 to bypass the cache and re-fetch.',
        parameters: [tractate, page, refresh],
        responses: { '200': { description: 'DafyomiDaf' } },
      },
    },

    '/api/context/{tractate}/{page}': {
      get: {
        summary:
          'Unified alignment/context pool: every external source normalized to anchored ContextItems.',
        description:
          'Returns { tractate, page, items: ContextItem[], fetchedAt }. items pools ALL external sources for the daf: ' +
          'Sefaria Rashi/Tosafot piece text, Mishnayot, Rishonim, Shulchan Aruch/halacha, topics, AND the nine ' +
          'dafyomi.co.il study types (source="dafyomi:<type>", including "dafyomi:revach" = Revach l\'Daf). ' +
          'This is the same pool the alignment workbench renders. Each ContextItem carries: source, sourceLabel, ' +
          'kind, key, title{he,en}, body{he,en}, url, and its PLACEMENT onto the daf — segs (0-based main-text ' +
          'segment indices; [] = not yet localized / whole-daf), amud (coarse a/b when known), via ' +
          '("pieceKeys"|"mishnah"|"tosfos-dh"|"ai"|…), and confidence (0..1 for AI matches). To judge alignment ' +
          'quality: inspect how many items have non-empty segs vs segs:[] (unplaced), and their via/confidence. ' +
          'Whole-daf items can be anchored by POSTing them to /api/context/match.',
        parameters: [tractate, page],
        responses: { '200': { description: 'Context/alignment pool (ContextItem[])' } },
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
                    items: {
                      type: 'object',
                      properties: { key: { type: 'string' }, type: { type: 'string' } },
                    },
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

    '/api/marks': {
      get: {
        summary: 'List all mark definitions (the structural extractors that produce anchors).',
        responses: { '200': { description: '{ marks: MarkDefinition[] }' } },
      },
    },
    '/api/marks/{id}': {
      get: {
        summary: 'Get one mark definition by id.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Mark id, e.g. "argument-move".',
          },
        ],
        responses: {
          '200': { description: '{ mark: MarkDefinition }' },
          '404': { description: 'unknown mark' },
        },
      },
    },

    '/api/enrichments': {
      get: {
        summary: 'List all enrichment definitions (LLM passes that run on a mark instance).',
        responses: { '200': { description: '{ enrichments: EnrichmentDefinition[] }' } },
      },
    },
    '/api/enrichments/{id}': {
      get: {
        summary: 'Get one enrichment definition by id.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '{ enrichment: EnrichmentDefinition }' },
          '404': { description: 'unknown enrichment' },
        },
      },
    },

    '/api/run': {
      post: {
        summary:
          'Run a mark or enrichment for a daf. Async: cache hit => 200 result; else 202 { runId, cacheKey } to poll.',
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
                  enrichment_id: {
                    type: 'string',
                    description: 'Run an enrichment (usually with mark_input).',
                  },
                  mark_input: {
                    type: 'object',
                    description: 'The mark instance to enrich (from a prior mark run).',
                  },
                  user_question: {
                    type: 'string',
                    description: 'Free-text question for Q&A-style enrichments.',
                  },
                  lang: {
                    type: 'string',
                    enum: ['en', 'he'],
                    description: 'Output language (default en).',
                  },
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
    '/api/run-status/{runId}': {
      get: {
        summary:
          'Poll a queued run. 202 { status: "pending" } while running; 200 { status: "ok", result } when done.',
        parameters: [
          {
            name: 'runId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'runId from POST /api/run.',
          },
          {
            name: 'k',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'cacheKey fallback returned by POST /api/run.',
          },
        ],
        responses: {
          '200': { description: '{ status: "ok", result }' },
          '202': { description: '{ status: "pending" }' },
        },
      },
    },

    '/api/sages-index': {
      get: {
        summary: 'Index of all sages: { sages: [{ slug, name, nameHe, aliases }] }.',
        responses: { '200': { description: 'sages index' } },
      },
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
          {
            name: 'type',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'Filter to one observation type (place, opinion, story, exegesis, lineage).',
          },
          {
            name: 'min',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
            description: 'Minimum daf count to include an aggregated observation.',
          },
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
          {
            name: 'depth',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 10 },
            description: 'Walk depth (default 3).',
          },
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
                  hebrewBefore: {
                    type: 'string',
                    description: 'Preceding context for disambiguation.',
                  },
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
        parameters: [
          {
            name: 'ref',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Sefaria-style ref, e.g. "Genesis 1:1".',
          },
        ],
        responses: { '200': { description: '{ ref, he, en, ... }' } },
      },
    },

    '/api/usage': {
      get: {
        summary:
          'Full usage dashboard payload (telemetry + cost + activity + backlog + health). Section endpoints below load the same data piecemeal.',
        responses: {
          '200': {
            description:
              '{ telemetry, cost, activity, unknowns, jobErrors, lintFailures, reports }',
          },
        },
      },
    },
    '/api/usage/cost': {
      get: {
        summary:
          'Cost section: self-tracked spend (per model/mark/enrichment, input-vs-output split), AI Gateway billed cost, and recent cost-avoided-by-cache.',
        responses: { '200': { description: '{ selfTracked, aiGateway, costAvoided }' } },
      },
    },
    '/api/usage/telemetry': {
      get: {
        summary: 'Latency + cache-hit + error rollups per endpoint / mark / enrichment.',
        responses: {
          '200': { description: '{ perEndpoint, perMark, perEnrichment, recentErrors }' },
        },
      },
    },
    '/api/usage/activity': {
      get: {
        summary: 'Cloudflare zone traffic (requests/visits by day + country).',
        responses: { '200': { description: 'zone activity' } },
      },
    },
    '/api/usage/backlog': {
      get: {
        summary: 'Needs-enrichment backlog: unknown rabbis / observed places / observed concepts.',
        responses: { '200': { description: '{ rabbis, places, concepts }' } },
      },
    },
    '/api/usage/health': {
      get: {
        summary: 'Operational health: queue-job errors, enrichment lint failures, bug reports.',
        responses: { '200': { description: '{ jobErrors, lintFailures, reports }' } },
      },
    },
    '/api/usage/daf/{tractate}/{page}': {
      get: {
        summary:
          "Per-daf cost trace: each mark's current-version vs superseded-version generation cost, from the permanent cache-entry cost stamps.",
        parameters: [
          { name: 'tractate', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'page',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'e.g. "5a".',
          },
        ],
        responses: {
          '200': {
            description:
              '{ tractate, page, marks: [...], totals: { currentUsd, supersededUsd, totalUsd } }',
          },
        },
      },
    },
    '/api/admin/recent-errors': {
      get: {
        summary: 'Recent queue-job failures (marks/enrichments that errored). Read-only, public.',
        parameters: [
          {
            name: 'id',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Filter by mark/enrichment id.',
          },
          { name: 'tractate', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
        ],
        responses: { '200': { description: '{ count, errors: [...] }' } },
      },
    },
    '/api/admin/cache-stats': {
      get: {
        summary: 'KV cache hit/miss rates across buckets.',
        responses: { '200': { description: 'cache stats' } },
      },
    },
    '/api/log/recent': {
      get: {
        summary: 'Recent client-side log records (last ~500).',
        responses: { '200': { description: '{ logs: [...] }' } },
      },
    },
  },
};
