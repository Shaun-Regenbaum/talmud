/**
 * Studio schema — the canonical shape of a Mark Definition, an Enrichment
 * Definition, and the run-time outputs they produce. This file is the
 * single source of truth; the registry and the daf-viewer renderers consume
 * these types.
 *
 * Conceptual model:
 *
 *   Mark        = annotation layer on a daf, defined by (anchor, render,
 *                 extractor, dependencies). The first pass — finds where to
 *                 attach instances. dependencies declare what input the
 *                 extractor needs (gemara, commentaries, other marks).
 *   Enrichment  = operation on a mark's instances. Carries `scope` and
 *                 `dependencies`:
 *                   scope='global' → same regardless of daf (cached by
 *                       mark instance only — bio, philosophy, classification).
 *                   scope='local'  → per-daf (cached by instance + daf —
 *                       synthesis, daf-specific commentary).
 *                 dependencies tell the runner what to feed the prompt:
 *                   'gemara' / 'commentaries'   — context slices
 *                   { enrichment: id }          — output of another enrichment
 *                   { mark: id }                — instances of another mark on the same daf
 *                 Cache keys are auto-derived from (id, cache_version, scope,
 *                 dependencies) — never hand-constructed at call sites.
 *
 * Architecture decisions:
 *   - Phrase-anchor output carries BOTH excerpt and segIdx+tokenStart+tokenEnd;
 *     the renderer prefers indices and falls back to excerpt match.
 *   - Cache key for run output includes def_hash (sha256 over the extractor
 *     spec); editing a prompt auto-invalidates cache. See src/worker/cache-keys.ts.
 *   - Toggles persist globally (localStorage); promoted marks default-listed,
 *     drafts visible only when devMode is on.
 *   - Promote = flip `status: 'draft' → 'promoted'`. No codegen.
 *   - Failure on Home (devMode=false) = silent hide.
 *     Failure in dev mode (devMode=true) = greyed toggle; click opens the
 *     inspect drawer with the error.
 *   - The inspect surface is a left-side drawer alongside the daf viewer.
 */

import type { LLMModelId } from './llm';

// ===========================================================================
// Anchor — where in the daf this mark's instances live.
// ===========================================================================

export type AnchorKind =
  | 'segment'        // single Sefaria segment (used for per-segment classifications: era, language, speech-act)
  | 'segment-range'  // span of consecutive segments (argument, halacha topic, aggadata story)
  | 'phrase'         // word(s) within a segment (rabbi name, place name, plant)
  | 'multi-anchor'   // paired non-adjacent spans (echo, inclusio, dispute pair)
  | 'cross-daf'      // anchor here, target on another daf (parallel sugya, citation)
  | 'external'       // anchor here, target off-daf (image, audio, wiki)
  | 'whole-daf';     // no specific anchor; whole-daf concept (theme, difficulty, prerequisites)

/** Output shape: a single-segment instance. */
export interface SegmentAnchor {
  segIdx: number;
}

/** Output shape: a multi-segment span. */
export interface SegmentRangeAnchor {
  startSegIdx: number;
  endSegIdx: number;
}

/** Output shape: a word/phrase. The renderer prefers segIdx+tokenStart+tokenEnd
 *  when present and falls back to first-occurrence match of the normalized
 *  Hebrew excerpt. The LLM is encouraged to emit both. */
export interface PhraseAnchor {
  excerpt: string;
  segIdx?: number;
  tokenStart?: number;
  tokenEnd?: number;
}

/** Output shape: paired non-adjacent spans (e.g. inclusio A...A). */
export interface MultiAnchor {
  anchors: PhraseAnchor[];
  /** Optional human label for the kind of relation: 'echo', 'inclusio', etc. */
  relation?: string;
}

/** Output shape: anchor on this daf points to another daf. */
export interface CrossDafAnchor {
  source: PhraseAnchor | SegmentRangeAnchor;
  target: { tractate: string; page: string; segIdx?: number };
}

/** Output shape: anchor on this daf points to an external resource. */
export interface ExternalAnchor {
  source: PhraseAnchor;
  url: string;
  /** 'image' | 'audio' | 'video' | 'article' | other. Used by renderer. */
  resource_kind?: string;
}

/** Output shape: whole-daf concept. */
export interface WholeDafAnchor {
  /** Empty by design — fields hold the actual data. */
  _: 'whole-daf';
}

export type AnchorOutput =
  | SegmentAnchor
  | SegmentRangeAnchor
  | PhraseAnchor
  | MultiAnchor
  | CrossDafAnchor
  | ExternalAnchor
  | WholeDafAnchor;

// ===========================================================================
// Render — how a mark's instances display on the daf.
// ===========================================================================

export type RenderKind =
  | 'inline'           // decoration on the phrase/segment text itself
  | 'gutter+sidebar'   // icon in margin + content in sidebar (current section pattern)
  | 'row-tag'          // small label aligned to a segment row
  | 'meta-component'   // named TS component triggered by click (rabbi-tree, geography-strip)
  | 'overlay'          // re-renders the daf rendering (interlinear translation, vocalization)
  | 'visualization'    // chart/map/network as the primary content
  | 'connection'       // line/arrow between two anchors (multi-anchor only)
  | 'chip';            // top-of-page badge (whole-daf only)

export type InlineStyle = 'underline' | 'highlight' | 'border' | 'badge';

export interface InlineRenderConfig {
  kind: 'inline';
  style: InlineStyle;
  /** CSS color (e.g. '#0066CC' or 'var(--mark-rabbi)'). */
  color: string;
  /** When true, hovering shows a tooltip; click triggers any meta-component. */
  hoverable?: boolean;
}

export interface GutterSidebarRenderConfig {
  kind: 'gutter+sidebar';
  /** Single-character icon (emoji or symbol). */
  icon: string;
  /** Sidebar header text. */
  sidebar_title: string;
  /** When true, multiple instances aggregate into one sidebar; else one per instance. */
  aggregate?: boolean;
}

export interface RowTagRenderConfig {
  kind: 'row-tag';
  /** Short text rendered in the margin (e.g. 'tannaitic', 'aramaic'). */
  tag_text: string;
  color: string;
  /** 'left' | 'right' (in the daf's reading direction). */
  position?: 'left' | 'right';
}

/** Names of registered meta components — these must exist in the client.
 *  Adding a new value here requires a corresponding TS component to be
 *  registered in src/client/meta-components/index.ts (TBD). */
export type MetaComponentName =
  | 'rabbi-tree'
  | 'geography-strip'
  | 'generation-timeline'
  | 'mesorah-variants';

export interface MetaComponentRenderConfig {
  kind: 'meta-component';
  /** Phrase mark first paints inline (under-decoration); click opens this. */
  inline_style?: InlineStyle;
  inline_color?: string;
  component: MetaComponentName;
}

export interface OverlayRenderConfig {
  kind: 'overlay';
  /** 'replace': overlay replaces daf rendering. 'augment-above'/'augment-below':
   *  inserts adjacent. */
  mode: 'replace' | 'augment-above' | 'augment-below';
}

export interface VisualizationRenderConfig {
  kind: 'visualization';
  viz: 'frequency' | 'map' | 'network' | 'timeline';
  /** Where to render: 'header' / 'footer' / 'side' */
  position?: 'header' | 'footer' | 'side';
}

export interface ConnectionRenderConfig {
  kind: 'connection';
  style: 'solid' | 'dashed';
  color: string;
}

export interface ChipRenderConfig {
  kind: 'chip';
  color: string;
  position?: 'header' | 'footer';
}

export type RenderConfig =
  | InlineRenderConfig
  | GutterSidebarRenderConfig
  | RowTagRenderConfig
  | MetaComponentRenderConfig
  | OverlayRenderConfig
  | VisualizationRenderConfig
  | ConnectionRenderConfig
  | ChipRenderConfig;

/** Anchor × Render compatibility — enforced by validateMark. Adding a row to
 *  this matrix opens a new combination; the corresponding renderer must
 *  handle it. */
export const COMPATIBLE: Readonly<Record<AnchorKind, RenderKind[]>> = {
  'segment':       ['row-tag', 'inline'],
  'segment-range': ['gutter+sidebar', 'inline'],
  'phrase':        ['inline', 'meta-component'],
  'multi-anchor':  ['connection', 'gutter+sidebar'],
  'cross-daf':     ['inline', 'meta-component'],
  'external':      ['inline', 'meta-component'],
  'whole-daf':     ['chip', 'visualization'],
};

// ===========================================================================
// Extractor — how a mark's instances are computed.
// ===========================================================================

export interface LLMExtractor {
  kind: 'llm';
  /** Optional override; falls back to settings.defaultModel. */
  model?: LLMModelId;
  /** Per-extractor fallback chain. Tried in order if `model` returns a
   *  retryable failure (1031, 3046, 5xx, 429, network). Independent from the
   *  global settings.fallbackChain (which only kicks in when `model` itself
   *  is unset). */
  fallback?: LLMModelId[];
  system_prompt: string;
  /** Supports {{tractate}} {{page}} {{hebrew}} {{english}}
   *  {{segments_he}} {{segments_en}} {{mark_input}} {{depends.<id>}}.
   *  Missing placeholders render as empty strings. */
  user_prompt_template: string;
  /** Hebrew-output counterparts, selected when a run is requested with
   *  lang='he'. When absent, the runner falls back to the English prompt.
   *  Only prose-emitting ENRICHMENTS carry these — mark extractors produce
   *  language-neutral structured data and stay single-prompt. The JSON
   *  contract (keys, enum values) MUST be identical to the English prompt;
   *  the prompt-parity test in tests/prompt-parity.test.ts enforces this. */
  system_prompt_he?: string;
  user_prompt_template_he?: string;
  /** Optional JSON schema for response_format. Strongly recommended for
   *  structured anchor extraction. */
  output_schema?: unknown;
  /** Workers AI Kimi only: disable thinking-mode. */
  thinking_off?: boolean;
  /** When set, fan the extractor out over the instances of this dependency
   *  mark: instead of one LLM call per daf, run one call per parent instance
   *  (with `anchors.<fan_out_over>` narrowed to that single instance) and
   *  concatenate the resulting `instances` arrays into one merged result.
   *  Bounds per-call output so the heaviest dapim don't exceed the provider's
   *  streaming window. The mark MUST declare `{ mark: <fan_out_over> }` in its
   *  dependencies. */
  fan_out_over?: string;
}

export interface SefariaExtractor {
  kind: 'sefaria';
  /** Sefaria API endpoint relative to https://www.sefaria.org/api/, e.g.
   *  'links/Berakhot.5a' or 'topics/{slug}'. */
  endpoint: string;
  /** Named transform fn from src/lib/sefaria-transforms (TBD). */
  transform_fn?: string;
}

/** Transitional extractor that proxies a legacy worker endpoint. Used while
 *  porting marks from the legacy two-stage pipeline; the eventual goal is
 *  to lift the legacy prompt + schema into a proper LLMExtractor. */
export interface LegacyEndpointExtractor {
  kind: 'legacy-endpoint';
  /** URL pattern relative to the worker root, e.g.
   *  '/api/analyze/{tractate}/{page}'. {{tractate}} and {{page}} placeholders
   *  are substituted at fetch time. Method is always GET. */
  endpoint: string;
  /** JSON path into the response payload to pull instances from, e.g.
   *  'sections' or 'topics'. The handler maps the array to the standard
   *  { instances: [{ ..., fields: <legacy item> }] } shape. Each item
   *  with startSegIdx/endSegIdx is preserved as anchor data. */
  instances_path: string;
  /** Optional: the field on each item that holds the segment-range start.
   *  Defaults to 'startSegIdx'. */
  start_seg_field?: string;
  /** Optional end-of-range field. Defaults to 'endSegIdx'. */
  end_seg_field?: string;
}

export interface ComputedExtractor {
  kind: 'computed';
  /** Named function from a registry of deterministic computations
   *  (src/lib/computed-extractors, TBD). e.g. 'rabbi-frequency-across-shas',
   *  'segment-language-detect', 'phrase-uniqueness'. */
  fn: string;
  /** Optional config passed to the function. */
  config?: Record<string, unknown>;
}

export interface ManualExtractor {
  kind: 'manual';
  /** Operator-curated instances stored alongside the definition. */
  seed_instances?: MarkInstance[];
}

export type Extractor = LLMExtractor | SefariaExtractor | ComputedExtractor | ManualExtractor | LegacyEndpointExtractor;

// ===========================================================================
// Dependency types — declared inputs for marks (anchors) and enrichments.
//
// A dependency entry tells the runner what the extractor needs in its prompt
// vars. The runner walks the array in order, fetches each, and exposes them
// as template placeholders before invoking the LLM:
//
//   'gemara'             → {{gemara}} / {{gemara_he}} / {{gemara_en}} /
//                          {{segments_he}} / {{segments_en}}
//   'commentaries'       → {{commentaries}}
//   'context'            → {{context}}  (aggregated external context for the
//                          daf: dafyomi.co.il Points/Halacha/Charts + Sefaria,
//                          grouped plain text via collectContext)
//   { enrichment: id }   → {{depends.<id>}}    (recursively resolved)
//   { mark: id }         → {{anchors.<id>}}    (mark extractor for same daf)
//
// Marks may depend on input slices and other marks (secondary anchors),
// but not on enrichments. Enrichments may depend on anything.
// ===========================================================================

export type MarkDependency = 'gemara' | 'commentaries' | { mark: string };

export type EnrichmentDependency =
  | 'gemara'
  | 'commentaries'
  | 'mishna'
  | 'context'
  | { enrichment: string }
  | { mark: string };

// ===========================================================================
// Mark Definition — the registry entry.
// ===========================================================================

export type MarkStatus = 'draft' | 'promoted';

export interface MarkDefinition {
  /** Slug, e.g. 'rabbi', 'argument', 'plant'. Lowercase, alphanumeric + .-_, ≤64 chars. */
  id: string;
  label: string;
  description?: string;
  /** Optional grouping for the toggle list ('canon', 'experimental', 'spatial', etc.). */
  category?: string;

  anchor: AnchorKind;
  render: RenderConfig;
  extractor: Extractor;
  /** Declared inputs to the extractor. Defaults to ['gemara'] when absent —
   *  current behavior of buildDafContext. Future secondary anchors declare
   *  other marks (e.g. an Israel/Bavel map = [{mark:'rabbi'},{mark:'place'}]). */
  dependencies?: MarkDependency[];
  /** UI-only nesting hint. When set, the dev panel groups this mark as a
   *  child of `parent_mark` in the toggle list. Architecturally the mark is
   *  still independent (own anchor, own cache, own extractor) — this just
   *  collapses the visual hierarchy. Example: argument-move sets
   *  parent_mark='argument'. */
  parent_mark?: string;

  status: MarkStatus;
  /** Derived from sha256(extractor + render). Bumped automatically on save.
   *  Cache key for instances includes this — editing the prompt auto-busts. */
  def_hash: string;
  cache_version: string;
  source: 'kv' | 'code';
  updated_at: string;
}

// ===========================================================================
// Enrichment Definition — operation on a mark's instances.
// ===========================================================================

export type EnrichmentMode =
  | 'augment-content'   // adds text/data per instance (rabbi.bio)
  | 'refine-anchors'    // produces a refined set of instances (e.g. better rabbi-detector)
  | 'aggregate';        // produces daf-level synthesis from all instances

/** Cacheability axis. Drives auto cache-key derivation in cache-keys.ts:
 *    global → enrich:{id}:{cache_version}:{instance_id}              (no daf)
 *    local  → enrich:{id}:{cache_version}:{instance_id}:{tractate}:{page}
 *  Pick 'global' when the output is the same regardless of which daf you ran
 *  it from (a rabbi's biography). Pick 'local' when the output is computed
 *  in light of this daf (synthesis). Aggregate enrichments are usually local. */
export type EnrichmentScope = 'global' | 'local';

export interface EnrichmentDefinition {
  id: string;
  label: string;
  description?: string;
  category?: string;

  /** ID of the mark whose instances feed in. */
  target_mark: string;
  mode: EnrichmentMode;
  scope: EnrichmentScope;
  /** Declared inputs to the extractor. The runner walks this array; entries
   *  expand into template vars per the type docs above. Other enrichments
   *  here are run first (recursively); other marks are extracted on the same
   *  daf. Empty array means the enrichment only sees `mark_input`. */
  dependencies?: EnrichmentDependency[];

  extractor: Extractor;

  status: MarkStatus;
  def_hash: string;
  cache_version: string;
  source: 'kv' | 'code';
  updated_at: string;
}

// ===========================================================================
// Run-time output shapes.
// ===========================================================================

/** Stable per-instance ID — used as the enrichment cache key. Pattern:
 *    {mark_id}:{anchor-fingerprint}
 *  e.g. 'rabbi:s3-t1-t2', 'argument:r3-7', 'place:s5-koach-yerushalayim'. */
export type InstanceId = string;

export interface MarkInstance {
  id: InstanceId;
  anchor: AnchorOutput;
  /** Mark-specific structured data (matches the extractor's output_schema). */
  fields: Record<string, unknown>;
  /** Enrichment outputs keyed by enrichment id. Populated lazily by the
   *  pipeline when an enrichment toggle is on. */
  enrichments?: Record<string, unknown>;
}

export interface RunDiagnostics {
  model: LLMModelId;
  transport: 'workers-ai' | 'openrouter-gateway';
  attempts: number;
  elapsed_ms: number;
  prompt_chars: number;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  } | null;
  /** Rendered prompts after template substitution. */
  resolved: { system_prompt: string; user_prompt: string };
  /** Raw model output (pre-parse). Useful when parsed=null. */
  raw_content: string;
  reasoning?: string;
}

export interface MarkRunOutput {
  mark_id: string;
  daf: { tractate: string; page: string };
  def_hash: string;
  computed_at: string;
  instances: MarkInstance[];
  diagnostics?: RunDiagnostics;
  /** Set when extraction failed. instances will be empty. */
  error?: string;
}

// ===========================================================================
// Validation — runtime + compile-time guards.
// ===========================================================================

export const ID_RE = /^[a-z][a-z0-9._-]{0,63}$/i;

export function isValidId(s: unknown): s is string {
  return typeof s === 'string' && ID_RE.test(s);
}

export function isCompatible(anchor: AnchorKind, render: RenderKind): boolean {
  return COMPATIBLE[anchor]?.includes(render) ?? false;
}

// ===========================================================================
// AUTHORING CHECKLIST — what to ask the user when they propose a new mark.
// ===========================================================================
/*
When the user says, in chat, "let's add a marker for X", walk this checklist
in order. Each step has a default I should propose; the user only has to
correct the ones I got wrong.

  1. id           — slug. Default: kebab-case from the user's name.
                    e.g. "plants" → 'plant'; "Rabbi cohorts" → 'rabbi-cohort'.

  2. label        — display name. Default: title-case of the user's phrase.

  3. description  — one line. Default: blank, ask if it's not obvious.

  4. category     — grouping. Default: 'experimental' for new drafts.

  5. anchor       — pick from { segment, segment-range, phrase, multi-anchor,
                    cross-daf, external, whole-daf }. Infer from the
                    user's wording:
                      "highlight every X word"     → phrase
                      "show stories about X"        → segment-range
                      "tag each segment by Y"       → segment
                      "connect this phrase to that" → multi-anchor
                      "link to Wikipedia / image"   → external
                      "summarize the daf"           → whole-daf

  6. render       — pick from { inline, gutter+sidebar, row-tag,
                    meta-component, overlay, visualization, connection, chip }.
                    Confirm against COMPATIBLE matrix. Defaults by anchor:
                      phrase        → inline
                      segment-range → gutter+sidebar
                      segment       → row-tag
                      multi-anchor  → connection
                      cross-daf     → inline
                      external      → inline
                      whole-daf     → chip

  7. render config — fields depend on render kind:
                      inline:           { style, color, hoverable }
                      gutter+sidebar:   { icon, sidebar_title, aggregate }
                      row-tag:          { tag_text, color, position }
                      meta-component:   { component, inline_style?, inline_color? }
                      overlay:          { mode }
                      visualization:    { viz, position }
                      connection:       { style, color }
                      chip:             { color, position }

  8. extractor.kind — usually 'llm'. Use 'sefaria' if the data already exists
                      in Sefaria (e.g. links, topics). 'computed' for stats.
                      'manual' for curated constants.

  9. system_prompt — I draft this from the concept. User edits if wrong.

  10. user_prompt_template — start from a known-good template per anchor:
                              phrase / segment / segment-range:
                                  "Tractate: {{tractate}}, page {{page}}.\n\n"
                                  "Hebrew (numbered segments):\n{{segments_he}}\n\n"
                                  "English (same numbering):\n{{segments_en}}\n\n"
                                  "<concept-specific instruction>"

  11. output_schema — generate a strict JSON schema matching the anchor:
                      phrase:        { instances: [{ excerpt, segIdx, tokenStart, tokenEnd, fields:{...} }] }
                      segment:       { instances: [{ segIdx, fields:{...} }] }
                      segment-range: { instances: [{ startSegIdx, endSegIdx, fields:{...} }] }
                      etc.

  12. model        — usually undefined (use settings default).

  13. enrichments  — optional. If user mentions "and show their bio when
                      clicked", that's a separate EnrichmentDefinition with
                      target_mark = this mark's id.

  14. status       — always 'draft' on creation. Promote later via UI.

After fill-in, the worker computes def_hash from sha256(JSON.stringify(extractor) + JSON.stringify(render)). Save via PUT /api/studio/marks/{id}.
*/
