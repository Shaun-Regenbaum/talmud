/**
 * Single source of truth for every code-defined LLM structured-output schema.
 *
 * Each output is a zod schema; `responseFormat` (schema-util) derives the
 * `response_format.json_schema` envelope sent to the model, and `z.infer` gives
 * the parsed-result type. Replaces the hand-written JSON-Schema literals that
 * used to live inline in code-marks.ts / index.ts. The generated json_schema is
 * verified semantically equivalent to those originals by
 * tests/output-schema-parity.test.ts (golden fixtures under
 * tests/fixtures/output-schemas).
 */
import { z } from 'zod';
import { GENERATION_IDS } from '../client/generations';
import { responseFormat } from './schema-util';

const GEN = [...GENERATION_IDS] as [string, ...string[]];

// ---- shared building blocks ------------------------------------------------
const seg = () => z.number().int().min(0); // 0-based segment index
const single = (key: string) => z.object({ [key]: z.string() }); // { key: string }
const QA = z.object({ answer: z.string(), confidence: z.enum(['high', 'medium', 'low']) });
const SUGGESTED_QUESTIONS = z.object({
  questions: z.array(z.object({ q: z.string(), why_useful: z.string() })),
});

/** `{ instances: [{ startSegIdx, endSegIdx, fields }] }` + optional top-level extras. */
const segInstances = (fields: z.ZodRawShape, extra: z.ZodRawShape = {}) =>
  z.object({
    ...extra,
    instances: z.array(z.object({ startSegIdx: seg(), endSegIdx: seg(), fields: z.object(fields) })),
  });

/** `{ instances: [{ excerpt, fields }] }` (phrase-anchored marks). */
const markInstances = (fields: z.ZodRawShape) =>
  z.object({ instances: z.array(z.object({ excerpt: z.string(), fields: z.object(fields) })) });

/** A one-prose-field schema with a runtime-derived name — used where a
 *  synthesis enrichment's schema name comes from its id rather than a fixed
 *  export. Same shape as the `*_SYNTHESIS_OUTPUT_SCHEMA` consts. */
export function proseSchema(name: string, field: string) {
  return responseFormat(name, single(field));
}

// ===========================================================================
// Marks
// ===========================================================================
export const RABBI_OUTPUT_SCHEMA = responseFormat('rabbi_marks',
  markInstances({ name: z.string(), nameHe: z.string(), generation: z.enum(GEN) }));

export const PLACES_OUTPUT_SCHEMA = responseFormat('places_marks',
  markInstances({
    name: z.string(),
    nameHe: z.string(),
    kind: z.enum(['city', 'academy', 'land', 'region']),
    region: z.enum(['israel', 'bavel', 'other']),
    knownAs: z.array(z.string()),
  }));

export const HALACHA_OUTPUT_SCHEMA = responseFormat('halacha_topics',
  segInstances({ topic: z.string(), topicHe: z.string(), summary: z.string(), excerpt: z.string() }));

// Chart (experimental): comparison tables for dense multi-opinion regions.
// Cells are Hebrew (like the dafyomi.co.il charts this grounds on); the first
// cell of every row is its row-label. `grounded` = a dafyomi chart anchored it.
export const CHART_OUTPUT_SCHEMA = responseFormat('chart_tables',
  segInstances({
    caption: z.string(),
    captionHe: z.string(),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    notes: z.array(z.object({ marker: z.string(), text: z.string() })),
    excerpt: z.string(),
    grounded: z.boolean(),
    confidence: z.enum(['high', 'medium', 'low']),
  }));

export const AGGADATA_OUTPUT_SCHEMA = responseFormat('aggadata_stories',
  segInstances({
    title: z.string(), titleHe: z.string(), summary: z.string(),
    excerpt: z.string(), endExcerpt: z.string(), theme: z.string(),
  }));

// Bavli sections with a DIRECT Jerusalem Talmud parallel. The mark anchors the
// Bavli span (excerpt) and carries the parallel's ref + the substantive
// differences between the two Talmuds — its whole reason to exist.
export const YERUSHALMI_OUTPUT_SCHEMA = responseFormat('yerushalmi_parallels',
  segInstances({
    yerushalmiRef: z.string(),
    yerushalmiRefHe: z.string(),
    summary: z.string(),
    differences: z.string(),
    excerpt: z.string(),
  }));

export const PESUKIM_OUTPUT_SCHEMA = responseFormat('pesukim_refs',
  segInstances({
    verseRef: z.string(),
    citationStyle: z.enum(['explicit', 'allusion', 'paraphrase']),
    excerpt: z.string(), endExcerpt: z.string(), summary: z.string(),
  }));

export const ARGUMENT_OUTPUT_SCHEMA = responseFormat('argument_sections',
  segInstances({
    title: z.string(), summary: z.string(), excerpt: z.string(),
    endExcerpt: z.string(), rabbiNames: z.array(z.string()),
  }, { summary: z.string() }));

export const ARGUMENT_MOVE_OUTPUT_SCHEMA = responseFormat('argument_moves',
  segInstances({
    id: z.string(),
    sectionStartSegIdx: seg(), sectionEndSegIdx: seg(), moveOrder: seg(),
    role: z.enum(['opening', 'question', 'answer', 'objection', 'rejection', 'supporting-evidence', 'resolution', 'digression', 'shift', 'other']),
    voice: z.string(), rabbiNames: z.array(z.string()),
    excerpt: z.string(), endExcerpt: z.string(), summary: z.string(),
  }));

// ===========================================================================
// Argument enrichments
// ===========================================================================
export const ARGUMENT_VOICES_OUTPUT_SCHEMA = responseFormat('argument_voices', z.object({
  voices: z.array(z.object({
    name: z.string(), nameHe: z.string(),
    role: z.enum(['originator', 'transmitter', 'respondent', 'objector', 'supporter', 'cited-authority', 'questioner']),
    side: z.string(), stance: z.string(), opinionStart: z.string(),
  })),
  edges: z.array(z.object({
    from: z.string(), to: z.string(),
    kind: z.enum(['opposes', 'supports', 'responds-to', 'cites', 'resolves']),
    note: z.string(),
  })),
}));
// Daf-level argument FLOW: how the argument sections relate to each other.
// `from`/`to` are 0-based indices into the daf's ordered argument sections
// (the `argument` mark instances). Drives the whole-daf overview flow graph.
export const ARGUMENT_OVERVIEW_FLOW_OUTPUT_SCHEMA = responseFormat('argument_overview_flow', z.object({
  connections: z.array(z.object({
    from: z.number().int(),
    to: z.number().int(),
    kind: z.enum(['continues', 'resolves', 'depends-on', 'parallels', 'contrasts', 'generalizes', 'cites']),
    note: z.string(),
  })),
}));
// Daf-level BACKGROUND: the terms/concepts a reader needs to understand the daf,
// grouped into themed sections (legal concepts / realia / assumed-prior sugyot).
// Drives the whole-daf Background panel. Grounded on the dafyomi.co.il glossary
// that flows in via {{context}}. (No 'persons' — who-argues-what is the daf's
// argument, owned by the Overview pill, not background.)
export const DAF_BACKGROUND_CONCEPTS_OUTPUT_SCHEMA = responseFormat('daf_background_concepts', z.object({
  groups: z.array(z.object({
    category: z.enum(['legal-concepts', 'realia', 'assumed-prior']),
    terms: z.array(z.object({
      term: z.string(),
      termHe: z.string(),
      gloss: z.string(),
    })),
  })),
}));
// Whole-daf TIDBIT: one curated "did you notice…" essay surfacing the single
// most interesting thing on the daf — an aggadah read against the grain, a legal
// concept with a twist, a sharp machloket, a textual point, or a hidden point
// inside a dry/technical daf. Output is a hook + 3-4 flowing paragraphs (no
// section labels). Two confidences: how well the claims are grounded in the
// daf's TEXT vs. how editorial the READING (interpretive framing) is — a bold
// reading should carry a lower readingConfidence. Drives the whole-daf Tidbit chip.
export const TIDBIT_ESSAY_OUTPUT_SCHEMA = responseFormat('tidbit_essay', z.object({
  flavor: z.enum(['aggadah', 'legal-concept', 'machloket', 'textual', 'hidden-point']),
  hook: z.string(),
  paragraphs: z.array(z.string()),
  sources: z.array(z.object({ ref: z.string(), note: z.string() })),
  textConfidence: z.enum(['high', 'medium', 'low']),
  readingConfidence: z.enum(['high', 'medium', 'low']),
}));
// Whole-daf BI'YUN (עיון): a deep dive into ONE halachic/conceptual problem on
// the daf that the rishonim are actively wrestling with — the difficulty, the
// competing approaches (Rashi / Tosafot / Ramban / Rashba / Ritva …), what's
// really at stake between them. The lomdus counterpart to the tidbit: where the
// tidbit rises ABOVE the mechanics to a human idea, the bi'yun goes INTO them.
// Same hook + paragraphs + confidences shape (renders via the shared essay view).
export const BIYUN_ESSAY_OUTPUT_SCHEMA = responseFormat('biyun_essay', z.object({
  hook: z.string(),
  paragraphs: z.array(z.string()),
  sources: z.array(z.object({ ref: z.string(), note: z.string() })),
  textConfidence: z.enum(['high', 'medium', 'low']),
  readingConfidence: z.enum(['high', 'medium', 'low']),
}));
// Section typing (P2b): a NARRATIVE view for story-primary sections, where the
// dispute-oriented `voices` graph is the wrong model. Actors (characters) +
// ordered beats (what happens, step by step) instead of opposing legal positions.
export const ARGUMENT_NARRATIVE_OUTPUT_SCHEMA = responseFormat('argument_narrative', z.object({
  summary: z.string(),
  actors: z.array(z.object({
    name: z.string(),
    role: z.enum(['protagonist', 'antagonist', 'authority', 'narrator', 'other']),
  })),
  // Each beat carries a NARRATIVE kind (not a dialectical role) and a verbatim
  // Hebrew `excerpt` so the worker can anchor the beat to its segment — making
  // the beats the narrative section's first-class, clickable move layer.
  beats: z.array(z.object({
    n: z.number().int().min(1),
    kind: z.enum(['scene', 'action', 'dialogue', 'turn', 'resolution']),
    actor: z.string(),
    action: z.string(),
    excerpt: z.string(),
  })),
}));
// Cross-daf bridge verdict (sugya map): does the boundary continue into the next daf?
export const ARGUMENT_BRIDGE_OUTPUT_SCHEMA = responseFormat('argument_bridge', z.object({
  continues: z.boolean(),
  note: z.string(),
}));
export const ARGUMENT_BACKGROUND_OUTPUT_SCHEMA = responseFormat('argument_background', single('background'));
export const ARGUMENT_SYNTHESIS_OUTPUT_SCHEMA = responseFormat('argument_synthesis', single('synthesis'));

// ===========================================================================
// Argument-move enrichments
// ===========================================================================
export const ARGUMENT_MOVE_COMMENTARIES_OUTPUT_SCHEMA = responseFormat('argument_move_commentaries',
  z.object({ rashi: z.string(), tosafot: z.string(), other: z.string(), note: z.string() }));
export const ARGUMENT_MOVE_SYNTHESIS_OUTPUT_SCHEMA = responseFormat('argument_move_synthesis', single('synthesis'));
export const ARGUMENT_MOVE_SUGGESTED_QUESTIONS_OUTPUT_SCHEMA = responseFormat('argument_move_suggested_questions', SUGGESTED_QUESTIONS);
export const ARGUMENT_MOVE_QA_OUTPUT_SCHEMA = responseFormat('argument_move_qa', QA);

// ===========================================================================
// Place enrichments
// ===========================================================================
export const PLACE_PROFILE_OUTPUT_SCHEMA = responseFormat('place_profile', single('profile'));
export const PLACE_SIGNIFICANCE_OUTPUT_SCHEMA = responseFormat('place_significance', single('significance'));
export const PLACE_FIGURES_OUTPUT_SCHEMA = responseFormat('place_figures', single('figures'));
export const PLACES_SYNTHESIS_OUTPUT_SCHEMA = responseFormat('places_synthesis', single('synthesis'));

// ===========================================================================
// Rishonim
// ===========================================================================
export const RISHONIM_SYNTHESIS_OUTPUT_SCHEMA = responseFormat('rishonim_synthesis', single('synthesis'));

// ===========================================================================
// Halacha enrichments
// ===========================================================================
const halachaRuling = z.object({ ref: z.string(), ruling: z.string() }).nullable();
export const HALACHA_CODIFICATION_OUTPUT_SCHEMA = responseFormat('halacha_codification', z.object({
  mishnehTorah: halachaRuling, tur: halachaRuling, shulchanAruch: halachaRuling, rema: halachaRuling,
  prose: z.string(),
}));
// A single richer dispute object (replaces the old multi-dispute list). Built
// from the codification trail + the dafyomi poskim context where present
// (Gra / Chazon Ish / Igros Moshe …). `present` is false for the common settled
// case. `positions` carry a side (a/b/neutral) so the render can color them like
// the Voices map; `sephardi`/`ashkenazi` are the practical consequence.
export const HALACHA_DISPUTE_OUTPUT_SCHEMA = responseFormat('halacha_dispute', z.object({
  present: z.boolean(),
  axis: z.enum(['mechaber-rema', 'ashkenaz-sefarad', 'rishonim', 'acharonim', 'poskim', 'none']),
  label: z.string(),
  positions: z.array(z.object({
    voice: z.string(),
    side: z.enum(['a', 'b', 'neutral']),
    stance: z.string(),
    ref: z.string(),
  })),
  sephardi: z.string(),
  ashkenazi: z.string(),
  settled: z.string(),
}));
// Shape-aware practical "what to do": the render is chosen by `shape`.
//   best-fallback → best (לכתחילה) + fallback (בדיעבד) lines (timing/measure rules)
//   statement     → one plain line (a prohibition, action, or requirement)
//   taxonomy      → a case→value map (e.g. food → bracha)
// `note` is an optional single plain-language heads-up (retires the pill lists).
export const HALACHA_PRACTICAL_OUTPUT_SCHEMA = responseFormat('halacha_practical', z.object({
  shape: z.enum(['best-fallback', 'statement', 'taxonomy']),
  best: z.string(),
  fallback: z.string(),
  statement: z.string(),
  rows: z.array(z.object({ when: z.string(), value: z.string() })),
  note: z.string(),
}));
export const HALACHA_SYNTHESIS_OUTPUT_SCHEMA = responseFormat('halacha_synthesis', single('synthesis'));

// ===========================================================================
// Pesukim enrichments
// ===========================================================================
export const PESUKIM_TANACH_CONTEXT_OUTPUT_SCHEMA = responseFormat('pesukim_tanach_context', single('context'));
export const PESUKIM_WHY_HERE_OUTPUT_SCHEMA = responseFormat('pesukim_why_here', single('why_here'));
export const PESUKIM_MECHANISM_OUTPUT_SCHEMA = responseFormat('pesukim_mechanism', single('mechanism'));
export const PESUKIM_LANDING_OUTPUT_SCHEMA = responseFormat('pesukim_landing', single('landing'));
export const PESUKIM_SYNTHESIS_OUTPUT_SCHEMA = responseFormat('pesukim_synthesis', single('synthesis'));
export const PESUKIM_SUGGESTED_QUESTIONS_OUTPUT_SCHEMA = responseFormat('pesukim_suggested_questions', SUGGESTED_QUESTIONS);
export const PESUKIM_QA_OUTPUT_SCHEMA = responseFormat('pesukim_qa', QA);

// ===========================================================================
// Aggadata enrichments
// ===========================================================================
export const AGGADATA_BACKGROUND_OUTPUT_SCHEMA = responseFormat('aggadata_background', single('background'));
export const AGGADATA_INTERPRETATION_OUTPUT_SCHEMA = responseFormat('aggadata_interpretation', single('interpretation'));
export const AGGADATA_PARALLELS_OUTPUT_SCHEMA = responseFormat('aggadata_parallels', z.object({
  parallels: z.array(z.object({
    ref: z.string(),
    kind: z.enum(['same-story', 'same-actors', 'same-motif', 'tanach-source']),
    note: z.string(),
    // Verbatim Hebrew/Aramaic from THIS daf the parallel draws from, so a click
    // can highlight those words in the reader. Empty string when no clean phrase.
    excerpt: z.string(),
  })),
  prose: z.string(),
}));
export const AGGADATA_SYNTHESIS_OUTPUT_SCHEMA = responseFormat('aggadata_synthesis', single('synthesis'));
export const AGGADATA_SUGGESTED_QUESTIONS_OUTPUT_SCHEMA = responseFormat('aggadata_suggested_questions', SUGGESTED_QUESTIONS);
export const AGGADATA_QA_OUTPUT_SCHEMA = responseFormat('aggadata_qa', QA);

// ===========================================================================
// Rabbi enrichments
// ===========================================================================
const region4 = z.enum(['israel', 'bavel', 'other', 'unknown']);
export const RABBI_GEOGRAPHY_OUTPUT_SCHEMA = responseFormat('rabbi_geography', z.object({
  birthplace: z.object({ place: z.string(), region: region4 }),
  primaryStudyPlaces: z.array(z.object({ place: z.string(), academy: z.string(), period: z.string() })),
  notablePlaces: z.array(z.object({ place: z.string(), event: z.string() })),
  movements: z.array(z.object({ from: z.string(), to: z.string(), approximateWhen: z.string(), reason: z.string() })),
  prose: z.string(),
}));
export const RABBI_RELATIONSHIPS_EVIDENCE_OUTPUT_SCHEMA = responseFormat('rabbi_relationships_evidence', z.object({
  evidence: z.array(z.object({
    kind: z.enum(['teacher', 'student', 'partner', 'family']),
    name: z.string(), excerpt: z.string(), note: z.string(),
  })),
}));
export const RABBI_GEOGRAPHY_EVIDENCE_OUTPUT_SCHEMA = responseFormat('rabbi_geography_evidence', z.object({
  evidence: z.array(z.object({
    kind: z.enum(['birthplace', 'study', 'notable', 'movement']),
    place: z.string(), excerpt: z.string(), note: z.string(),
  })),
}));
export const RABBI_LOCATION_OUTPUT_SCHEMA = responseFormat('rabbi_location', z.object({
  place: z.string(), region: region4,
  confidence: z.enum(['high', 'medium', 'low']), justification: z.string(),
}));
export const RABBI_BIO_OUTPUT_SCHEMA = responseFormat('rabbi_bio', single('bio'));
export const RABBI_PHILOSOPHY_OUTPUT_SCHEMA = responseFormat('rabbi_philosophy', single('philosophy'));
export const RABBI_RELATIONSHIPS_OUTPUT_SCHEMA = responseFormat('rabbi_relationships', z.object({
  teachers: z.array(z.object({ name: z.string(), primary: z.boolean(), note: z.string() })),
  students: z.array(z.object({ name: z.string(), primary: z.boolean(), note: z.string() })),
  debatePartners: z.array(z.object({ name: z.string(), note: z.string() })),
  family: z.array(z.object({ name: z.string(), relation: z.string() })),
  prose: z.string(),
}));
export const RABBI_CLASSIFICATION_OUTPUT_SCHEMA = responseFormat('rabbi_classification', z.object({
  category: z.enum(['aggadist', 'halachist', 'exegetist']), justification: z.string(),
}));
export const RABBI_SYNTHESIS_OUTPUT_SCHEMA = responseFormat('rabbi_synthesis', single('synthesis'));

// ===========================================================================
// index.ts: legacy rabbi-places enrichment + wiki bio translation
// ===========================================================================
export const ENRICH_JSON_SCHEMA = responseFormat('rabbi_enrichment', z.object({
  generation: z.enum(GEN),
  region: z.enum(['israel', 'bavel']).nullable(),
  places: z.array(z.string()),
  moved: z.enum(['bavel->israel', 'israel->bavel', 'both']).nullable(),
}));
export const TRANSLATE_BIO_JSON_SCHEMA = responseFormat('wiki_bio_translation', z.object({
  canonicalEn: z.string(), bioEn: z.string(), aliases: z.array(z.string()),
}));
