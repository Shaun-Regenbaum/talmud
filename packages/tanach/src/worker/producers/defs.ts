/**
 * The tanach producers, expressed as core Producer objects (the four-primitive
 * model: Spine / Anchor / Artifact / Producer) — the corpus-agnosticism proof
 * that a queue-less, registry-less app's producers fit the SAME shape the
 * talmud registry projects into.
 *
 * Five producers:
 *   events            — mark; discovers verse anchors on the tanach spine
 *   note              — enrichment; inherits its anchor from an events section
 *   synthesis         — enrichment; per-verse (commentary overview)
 *   midrash-synthesis — enrichment; per-verse (midrash overview; key prefix
 *                       midrash-synth:v1 — the id routes, the template owns
 *                       the bytes)
 *   translate         — enrichment; global (selection-keyed) — DECLARED here
 *                       but NOT run through runProducer/ArtifactStore: its
 *                       cache is a raw string with a 30-day TTL (see
 *                       producers/translate.ts for the rationale)
 *
 * key_shape note: these producers are TEMPLATE-keyed, not mark:/enrich:-keyed.
 * templateKeyScheme routes purely by producer id and ignores key_shape, so the
 * values here ('mark' for events, 'enrich' for the rest) are NOMINAL — the
 * literal templates in run-ports.ts own the key bytes, copied byte-exactly
 * from the legacy hand-built keys (locked by tests/producer-keys.test.ts and
 * core's key-schemes tests).
 */

import type { Producer } from '@corpus/core/model/producer';
import type { EnrichmentRunDef, MarkRunDef } from '@corpus/core/run/run-producer';
import { EVENTS_SCHEMA, EVENTS_SYSTEM, EVENTS_USER_TEMPLATE } from './events.ts';
import {
  MIDRASH_SYNTH_SCHEMA,
  MIDRASH_SYNTH_SYSTEM,
  MIDRASH_SYNTH_USER_TEMPLATE,
} from './midrash.ts';
import { NOTE_SCHEMA, NOTE_SYSTEM, NOTE_USER_TEMPLATE } from './note.ts';
import { OVERVIEW_SCHEMA, OVERVIEW_SYSTEM, OVERVIEW_USER_TEMPLATE } from './overview.ts';
import { SYNTHESIS_SCHEMA, SYNTHESIS_SYSTEM, SYNTHESIS_USER_TEMPLATE } from './synthesis.ts';
import { TRANSLATE_SCHEMA, TRANSLATE_SYSTEM, TRANSLATE_USER_TEMPLATE } from './translate.ts';

export type TanachProducerId =
  | 'events'
  | 'note'
  | 'overview'
  | 'synthesis'
  | 'midrash-synthesis'
  | 'translate';

/** The recipe extractor every tanach producer carries: an LLM call with fixed
 *  prompts + a strict JSON schema + the exact call knobs the legacy producer
 *  functions passed to runLLM (max_tokens / temperature / tag preserved
 *  byte-for-byte so generation behavior is unchanged). */
export interface TanachLLMExtractor {
  kind: 'llm';
  system_prompt: string;
  user_prompt_template: string;
  output_schema: unknown;
  max_tokens: number;
  temperature: number;
  tag: string;
}

const eventsExtractor: TanachLLMExtractor = {
  kind: 'llm',
  system_prompt: EVENTS_SYSTEM,
  user_prompt_template: EVENTS_USER_TEMPLATE,
  output_schema: EVENTS_SCHEMA,
  max_tokens: 900,
  temperature: 0.2,
  tag: 'tanach:events',
};

const noteExtractor: TanachLLMExtractor = {
  kind: 'llm',
  system_prompt: NOTE_SYSTEM,
  user_prompt_template: NOTE_USER_TEMPLATE,
  output_schema: NOTE_SCHEMA,
  max_tokens: 700,
  temperature: 0.3,
  tag: 'tanach:note',
};

const overviewExtractor: TanachLLMExtractor = {
  kind: 'llm',
  system_prompt: OVERVIEW_SYSTEM,
  user_prompt_template: OVERVIEW_USER_TEMPLATE,
  output_schema: OVERVIEW_SCHEMA,
  // Headroom for a BILINGUAL title + summary: the note producer's 700 is for a
  // single-language note, but EN + HE together (Hebrew is token-dense) on a
  // long chapter overran it and truncated the JSON mid-string -> parse failure
  // -> empty card. 1400 comfortably fits both halves.
  max_tokens: 1400,
  temperature: 0.3,
  tag: 'tanach:overview',
};

const synthesisExtractor: TanachLLMExtractor = {
  kind: 'llm',
  system_prompt: SYNTHESIS_SYSTEM,
  user_prompt_template: SYNTHESIS_USER_TEMPLATE,
  output_schema: SYNTHESIS_SCHEMA,
  max_tokens: 800,
  temperature: 0.3,
  tag: 'tanach:synthesis',
};

const midrashSynthExtractor: TanachLLMExtractor = {
  kind: 'llm',
  system_prompt: MIDRASH_SYNTH_SYSTEM,
  user_prompt_template: MIDRASH_SYNTH_USER_TEMPLATE,
  output_schema: MIDRASH_SYNTH_SCHEMA,
  max_tokens: 800,
  temperature: 0.35,
  tag: 'tanach:midrash-synthesis',
};

const translateExtractor: TanachLLMExtractor = {
  kind: 'llm',
  system_prompt: TRANSLATE_SYSTEM,
  user_prompt_template: TRANSLATE_USER_TEMPLATE,
  output_schema: TRANSLATE_SCHEMA,
  max_tokens: 120,
  temperature: 0.2,
  tag: 'tanach:translate',
};

export const TANACH_PRODUCERS: Record<TanachProducerId, Producer> = {
  events: {
    id: 'events',
    label: 'Narrative events',
    description: "A chapter's natural narrative units, each labelled and pinned to its first verse",
    kind: 'mark-instance',
    inputs: [{ source: 'chapter-verses' }],
    recipe: { extractor: eventsExtractor },
    // discovers: the extractor finds WHERE the units begin (verse anchors on
    // the tanach spine; 'segment' = verse, the spine's finest level).
    anchoring: { behavior: 'discovers', precision: 'segment', spine: 'tanach' },
    cardinality: 'many',
    scope: 'local',
    key_shape: 'mark', // nominal — templateKeyScheme owns the bytes (events:v2:{book}:{chapter})
    cacheVersion: '2',
    source: 'code',
  },
  note: {
    id: 'note',
    label: 'Section note',
    description: "A short bilingual p'shat note for one events section (a verse range)",
    kind: 'enrichment',
    inputs: [{ source: 'section-verses' }],
    recipe: { extractor: noteExtractor },
    // inherits: the note sits where its events section sits.
    anchoring: { behavior: 'inherits', precision: 'segment', spine: 'tanach', target: 'events' },
    cardinality: 'per-input',
    scope: 'local',
    key_shape: 'enrich', // nominal — template owns note:v1:{book}:{chapter}:{start}-{end}
    cacheVersion: '1',
    source: 'code',
  },
  overview: {
    id: 'overview',
    label: 'Perek overview',
    description: 'A short bilingual orienting overview of a whole chapter (title + summary)',
    kind: 'enrichment',
    inputs: [{ source: 'chapter-verses' }],
    recipe: { extractor: overviewExtractor },
    // inherits: the overview sits at the chapter the reader is on. Chapter-
    // scoped — one per chapter, no per-instance variation (the key template
    // ignores the instance; see run-ports.ts overview:v1:{book}:{chapter}).
    // 'unit' = the whole-chapter level (the analogue of a daf's whole-page).
    anchoring: { behavior: 'inherits', precision: 'unit', spine: 'tanach' },
    cardinality: 'one',
    scope: 'local',
    key_shape: 'enrich', // nominal — template owns overview:v1:{book}:{chapter}
    cacheVersion: '1',
    source: 'code',
  },
  synthesis: {
    id: 'synthesis',
    label: 'Commentary synthesis',
    description: 'A balanced overview of how the classic commentators read one verse',
    kind: 'enrichment',
    inputs: [{ source: 'verse-text' }, { source: 'commentaries' }],
    recipe: { extractor: synthesisExtractor },
    // inherits: per-verse — the verse IS the input instance (no parent mark;
    // the tanach spine addresses verses directly).
    anchoring: { behavior: 'inherits', precision: 'segment', spine: 'tanach' },
    cardinality: 'per-input',
    scope: 'local',
    key_shape: 'enrich', // nominal — template owns synthesis:v1:{book}:{chapter}:{verse}
    cacheVersion: '1',
    source: 'code',
  },
  'midrash-synthesis': {
    id: 'midrash-synthesis',
    label: 'Midrash synthesis',
    description: 'A thematic overview of the midrashim on one verse',
    kind: 'enrichment',
    inputs: [{ source: 'verse-text' }, { source: 'midrash-passages' }],
    recipe: { extractor: midrashSynthExtractor },
    anchoring: { behavior: 'inherits', precision: 'segment', spine: 'tanach' },
    cardinality: 'per-input',
    scope: 'local',
    key_shape: 'enrich', // nominal — template owns midrash-synth:v1:{book}:{chapter}:{verse}
    cacheVersion: '1',
    source: 'code',
  },
  translate: {
    id: 'translate',
    label: 'Selection translation',
    description: 'An in-context English gloss for a selected Hebrew word or phrase',
    kind: 'enrichment',
    inputs: [{ source: 'selection' }],
    recipe: { extractor: translateExtractor },
    // The gloss isn't pinned to a spine position — it's keyed by the
    // normalized selection text, shared across every place it appears.
    anchoring: { behavior: 'inherits' },
    cardinality: 'per-input',
    scope: 'global',
    key_shape: 'enrich', // nominal — and NOT template-keyed at all: the live
    // cache is translate:v1:{norm}, a raw string with a 30-day TTL, kept on
    // bespoke plumbing (see producers/translate.ts).
    cacheVersion: '1',
    source: 'code',
  },
};

// ---------------------------------------------------------------------------
// Run-def projections — the minimal structural views runProducer consumes
// (MarkRunDef / EnrichmentRunDef), extended with the tanach call knobs the
// LLM ports read. Projected from the Producer objects above so the registry
// shape stays the single source of truth.
// ---------------------------------------------------------------------------

export interface TanachMarkDef extends MarkRunDef {
  extractor: TanachLLMExtractor;
}

export interface TanachEnrichmentDef extends EnrichmentRunDef {
  output_schema: unknown;
  max_tokens: number;
  temperature: number;
  tag: string;
}

function sourceDeps(p: Producer): string[] {
  return p.inputs.flatMap((i) => ('source' in i ? [i.source] : []));
}

export function markRunDefOf(id: 'events'): TanachMarkDef {
  const p = TANACH_PRODUCERS[id];
  return {
    id: p.id,
    cache_version: p.cacheVersion,
    dependencies: sourceDeps(p),
    extractor: p.recipe.extractor as TanachLLMExtractor,
  };
}

export function enrichRunDefOf(
  id: 'note' | 'overview' | 'synthesis' | 'midrash-synthesis',
): TanachEnrichmentDef {
  const p = TANACH_PRODUCERS[id];
  const ext = p.recipe.extractor as TanachLLMExtractor;
  return {
    id: p.id,
    cache_version: p.cacheVersion,
    // EnrichmentRunDef requires the feeding mark's id. note genuinely targets
    // the events mark; the per-verse producers have no parent mark (the spine
    // addresses verses directly), so 'verse' is a nominal stand-in — nothing
    // resolves it (no {mark:...} deps, and sectionRange is null for tanach).
    mark: p.anchoring.target ?? 'verse',
    dependencies: sourceDeps(p),
    system_prompt: ext.system_prompt,
    user_prompt_template: ext.user_prompt_template,
    output_schema: ext.output_schema,
    max_tokens: ext.max_tokens,
    temperature: ext.temperature,
    tag: ext.tag,
  };
}
