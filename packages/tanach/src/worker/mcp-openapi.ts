/**
 * Curated OpenAPI 3.1 description of the Tanach app's HTTP API, consumed by the
 * code-mode MCP server (the shared @corpus/core/mcp/code-mode, mounted at /mcp
 * in index.ts). The MCP `search` tool queries this spec to discover routes; the
 * `execute` tool calls them through the host-side request bridge.
 *
 * Keep descriptions tight: every byte is read by the model. tests/mcp-spec.test.ts
 * fails when a public /api route is added here or to index.ts without the other.
 */

import { DEFAULT_EXECUTE_TIMEOUT_MS } from '@corpus/core/mcp/code-mode';

const book = {
  name: 'book',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description:
    'Sefaria English book name, e.g. "Genesis", "Deuteronomy", "I Samuel", "Isaiah", "Psalms", "Proverbs", "Song of Songs".',
} as const;

const chapter = {
  name: 'chapter',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Chapter (perek) number, 1-based.',
} as const;

const verse = {
  name: 'verse',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Verse (pasuk) number within the chapter, 1-based.',
} as const;

const loc = {
  name: 'loc',
  in: 'query',
  required: false,
  schema: { type: 'string', enum: ['israel'] },
  description: 'Use the Israel reading calendar (default: diaspora).',
} as const;

const section = {
  name: 'section',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Index into the `flow` array returned by /api/parsha-study (0-based).',
} as const;

const AI = ' Generated on first call (AI) and cached; a cold call blocks until ready.';
const SEFARIA = ' Raw Sefaria text, cached; no AI.';

const timeoutS = Math.round(DEFAULT_EXECUTE_TIMEOUT_MS / 1000);

export const TANACH_OPENAPI: Record<string, unknown> = {
  openapi: '3.1.0',
  info: {
    title: 'Tanach Study App API',
    version: '1.0.0',
    description: [
      'Read the data behind tanach.dev — a Tanach reader with AI study aids.',
      '',
      'WHAT IS HERE: chapter text (Hebrew + English) from Sefaria; per-chapter AI',
      'pieces (overview, events = where each narrative unit begins, geography,',
      'tidbit); per-verse sources from Sefaria (Rishonim commentary, midrash, how',
      "the Gemara uses the verse) and AI syntheses of them; a p'shat note for any",
      "verse range; word/phrase translation; this week's parsha with a study map.",
      'Books use Sefaria English names ("Genesis", "I Samuel", "Song of Songs").',
      '',
      'A GOOD DEFAULT for "tell me about Book C:V": GET /api/chapter/{book}/{c}',
      '(the verse text), /api/overview/{book}/{c} (what the chapter is about),',
      '/api/synthesis/{book}/{c}/{v} (how the Rishonim read the verse; 404 when',
      'fewer than two comment) and /api/gemara/{book}/{c}/{v} (where the Talmud',
      'quotes it). /api/commentary gives the Rishonim verbatim.',
      '',
      'COLD PIECES — routes generate INLINE: an AI piece nobody has asked for yet',
      'is generated on the first call and cached after; that call blocks until it',
      `is ready (usually 5-40 s). The sandbox stops your code after ${timeoutS} s. If a`,
      'call runs out of time, tell the user the piece is still being generated',
      'and call again — the work keeps running on the server, so the retry',
      'returns the cached result at once. Sefaria text is fast. Do not fan out',
      'dozens of cold AI calls in one execute; a few at a time.',
      '',
      'TALMUD: the daf-level study tools (argument maps, halacha, the pesukim a',
      'daf quotes, explained) live on the sibling talmud.dev MCP.',
      '',
      'ACCESS: open and read-only.',
    ].join('\n'),
  },
  servers: [
    { url: 'https://tanach.dev', description: 'Production' },
    {
      url: 'https://tanach.shaunregenbaum.com',
      description:
        'Legacy hostname; still served (no redirect on /api or /mcp) for existing clients.',
    },
  ],
  paths: {
    '/api/chapter/{book}/{chapter}': {
      get: {
        summary: 'A chapter: every verse in Hebrew + English, with next/prev chapter refs.',
        description:
          'Returns { book, chapter, ref, heRef, verses: [{ n, he, en }], next, prev }. Verse text keeps ' +
          "Sefaria's inline HTML (<span>/<br>/<small> for poetry lines, maqaf, divine names) — strip tags " +
          'before quoting.' +
          SEFARIA,
        parameters: [book, chapter],
        responses: {
          '200': { description: '{ book, chapter, ref, heRef, verses[], next, prev }' },
        },
      },
    },
    '/api/mikraot/{book}/{chapter}': {
      get: {
        summary:
          'Mikraot Gedolot layout: each verse framed by Rashi and Targum Onkelos (Hebrew only).',
        description: 'Returns { book, chapter, ref, heRef, verses[], next, prev }.' + SEFARIA,
        parameters: [book, chapter],
        responses: { '200': { description: '{ book, chapter, verses[] }' } },
      },
    },
    '/api/events/{book}/{chapter}': {
      get: {
        summary: 'Where each narrative unit of the chapter begins (short bilingual labels).',
        description: 'Returns { book, chapter, ref, sections: [{ verse, en, he }] }.' + AI,
        parameters: [book, chapter],
        responses: { '200': { description: '{ sections: [{ verse, en, he }] }' } },
      },
    },
    '/api/overview/{book}/{chapter}': {
      get: {
        summary:
          'Perek overview: a title + a few sentences on what the chapter is about (EN + HE).',
        description: 'Returns { book, chapter, titleEn, titleHe, en, he }.' + AI,
        parameters: [book, chapter],
        responses: { '200': { description: '{ titleEn, titleHe, en, he }' } },
      },
    },
    '/api/geography/{book}/{chapter}': {
      get: {
        summary: 'Places the chapter names or is set in, with coordinates.',
        description:
          'Returns { book, chapter, places[] } — the AI names the places; coordinates come from a ' +
          'deterministic gazetteer (a place we cannot locate is omitted).' +
          AI,
        parameters: [book, chapter],
        responses: { '200': { description: '{ places[] }' } },
      },
    },
    '/api/tidbit/{book}/{chapter}': {
      get: {
        summary: 'One "did you notice…" reading of the chapter (against-the-grain, EN + HE).',
        description:
          'Returns { book, chapter, flavor, titleEn, titleHe, en, he, textConfidence, readingConfidence }.' +
          AI,
        parameters: [book, chapter],
        responses: { '200': { description: '{ flavor, titleEn, titleHe, en, he, … }' } },
      },
    },
    '/api/parsha': {
      get: {
        summary: "This week's Torah portion: name + where it starts + its aliyot.",
        description:
          "From Sefaria's calendar, cached ~6h. Returns the WeeklyParsha { name, heName, ref, book, startChapter, aliyot }.",
        parameters: [loc],
        responses: { '200': { description: 'WeeklyParsha' } },
      },
    },
    '/api/parsha-study': {
      get: {
        summary: "This week's parsha as a study map: overview + the flow of anchored sections.",
        description:
          'Returns { name, heName, ref, book, startChapter, titleEn, titleHe, overviewEn, overviewHe, ' +
          'flow: [sections with kind + verse range], map, aliyot }. Use an index into `flow` with ' +
          '/api/parsha-section and /api/parsha-thread.' +
          AI,
        parameters: [loc],
        responses: { '200': { description: '{ …, flow[], map, aliyot }' } },
      },
    },
    '/api/parsha-section/{section}': {
      get: {
        summary: 'Close reading of one parsha flow section (bilingual, with hover terms).',
        description:
          'Returns { parsha, parshaRef, section, titleEn, titleHe, en, he, terms[] }. `section` indexes /api/parsha-study `flow`.' +
          AI,
        parameters: [section],
        responses: { '200': { description: '{ titleEn, titleHe, en, he, terms[] }' } },
      },
    },
    '/api/parsha-thread/{section}': {
      get: {
        summary: 'One parsha flow section as a grounded insight + source packet + dvar Torah.',
        description:
          'Returns { parsha, parshaRef, section, …, sources: [{ ref, labelEn, labelHe, contributionEn, contributionHe }] }.' +
          AI,
        parameters: [section],
        responses: { '200': { description: '{ …, sources[] }' } },
      },
    },
    '/api/note/{book}/{chapter}/{start}': {
      get: {
        summary: "A short p'shat note (EN + HE) for a verse range of the chapter.",
        description: 'Returns { book, chapter, start, end, en, he }.' + AI,
        parameters: [
          book,
          chapter,
          {
            name: 'start',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'First verse of the range (1-based).',
          },
          {
            name: 'end',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Last verse of the range (default: start).',
          },
          {
            name: 'label',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Optional label for the range (from /api/events).',
          },
        ],
        responses: { '200': { description: '{ start, end, en, he }' } },
      },
    },
    '/api/translate': {
      get: {
        summary: 'Translate a Hebrew word or short phrase (≤120 chars), optionally in context.',
        description: 'Returns { q, translation, cached? }. Nikud-insensitive cache.' + AI,
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'The Hebrew word/phrase.',
          },
          {
            name: 'ctx',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Surrounding text (≤400 chars) to disambiguate.',
          },
        ],
        responses: { '200': { description: '{ q, translation }' } },
      },
    },
    '/api/commentary/{book}/{chapter}/{verse}': {
      get: {
        summary: 'The Rishonim on one verse, verbatim (Hebrew + English), from Sefaria.',
        description:
          "Returns { book, chapter, verse, commentaries[] } — each commentator's note; empties skipped." +
          SEFARIA,
        parameters: [book, chapter, verse],
        responses: { '200': { description: '{ commentaries[] }' } },
      },
    },
    '/api/synthesis/{book}/{chapter}/{verse}': {
      get: {
        summary: 'How the Rishonim read the verse: a short balanced overview (EN + HE).',
        description:
          'Returns { book, chapter, verse, en, he }. 404 when fewer than two commentators comment.' +
          AI,
        parameters: [book, chapter, verse],
        responses: {
          '200': { description: '{ en, he }' },
          '404': { description: 'Not enough commentary on this verse.' },
        },
      },
    },
    '/api/sources-index/{book}/{chapter}': {
      get: {
        summary:
          'Per-verse count of how many curated commentators comment (which verses are "rich").',
        parameters: [book, chapter],
        responses: { '200': { description: 'per-verse commentator counts' } },
      },
    },
    '/api/gemara/{book}/{chapter}/{verse}': {
      get: {
        summary:
          "Where the Talmud quotes this verse: the Gemara passages, from Sefaria's link graph.",
        description: 'Returns { book, chapter, verse, count, passages[] }.' + SEFARIA,
        parameters: [book, chapter, verse],
        responses: { '200': { description: '{ count, passages[] }' } },
      },
    },
    '/api/midrash/{book}/{chapter}/{verse}': {
      get: {
        summary: "Midrash on this verse (capped list of passages), from Sefaria's link graph.",
        description: 'Returns { book, chapter, verse, count, passages[] }.' + SEFARIA,
        parameters: [book, chapter, verse],
        responses: { '200': { description: '{ count, passages[] }' } },
      },
    },
    '/api/midrash-synthesis/{book}/{chapter}/{verse}': {
      get: {
        summary: "The verse's midrashim distilled into a thematic overview (EN + HE).",
        description: 'Returns { book, chapter, verse, en, he }.' + AI,
        parameters: [book, chapter, verse],
        responses: { '200': { description: '{ en, he }' } },
      },
    },
    '/api/source-question/{kind}/{book}/{chapter}/{verse}': {
      get: {
        summary:
          'Why the Talmud or Midrash uses this verse, grounded in the linked source texts (EN + HE).',
        description:
          'Returns { book, chapter, verse, en, he }. Uses separate per-verse caches; existing thematic summaries are unchanged.' +
          AI,
        parameters: [
          {
            name: 'kind',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['gemara', 'midrash'] },
          },
          book,
          chapter,
          verse,
        ],
        responses: {
          '200': { description: '{ en, he }' },
          '404': { description: 'No source text available' },
        },
      },
    },
    '/api/usage': {
      get: {
        summary: 'Self-tracked LLM usage: totals, per-producer, recent calls.',
        responses: { '200': { description: 'usage ledger' } },
      },
    },
    '/api/chapter-runs/{book}/{chapter}': {
      get: {
        summary: 'Inspector: which pieces are cached for a chapter, with cost/time each.',
        parameters: [book, chapter],
        responses: { '200': { description: '{ book, chapter, runs[], totals }' } },
      },
    },
    '/api/run-tree/{book}/{chapter}/{id}': {
      get: {
        summary: 'Build provenance of one piece as its dependency DAG (same shape as talmud.dev).',
        parameters: [
          book,
          chapter,
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Producer id (e.g. "overview", "synthesis").',
          },
          {
            name: 'inst',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Instance tail (verse / range) for a per-instance piece.',
          },
          {
            name: 'lang',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['en', 'he'] },
          },
        ],
        responses: {
          '200': { description: 'run tree' },
          '404': { description: 'Unknown producer.' },
        },
      },
    },
  },
};
