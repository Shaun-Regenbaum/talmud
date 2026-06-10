/**
 * Compat bridges — bidirectional projections between the legacy vocabularies
 * (AnchorCoord / ContextItem / SegMatch / the studio AnchorOutput shapes /
 * MarkDefinition + EnrichmentDefinition) and the four-primitive model
 * (Spine / Anchor / Artifact / Producer).
 *
 * The legacy STUDIO shapes are copied here structurally (field-for-field from
 * packages/talmud/src/worker/studio-schema.ts) because core must not import
 * from the apps; the app's real defs satisfy these structural types and the
 * talmud-side projection test feeds the live registry through.
 *
 * Losslessness contract: every legacy field with no first-class Producer home
 * rides VERBATIM in `Producer.legacy`, and the inverse projections rebuild the
 * original def from it — `markFromProducer(producerFromMark(def))` and
 * `enrichmentFromProducer(producerFromEnrichment(def))` deep-equal the input
 * for every entry in the real registry.
 */

import type { AnchorCoord, AnchorSpan, DafRef } from '../context/coord.ts';
import { normalizeSpan } from '../context/coord.ts';
import type { SegMatch } from '../context/match.ts';
import type { ContextItem } from '../context/types.ts';
import type { RawDependency } from '../registry/depGraph.ts';
import type { Anchor, AnchorPoint, AnchorPrecision } from './anchor.ts';
import type { Artifact } from './artifact.ts';
import type { RefinementBody } from './placement.ts';
import type { Producer, ProducerInput } from './producer.ts';

/** The Gemara spine id in the talmud binding. A spine-less AnchorCoord (the
 *  pre-commentary default) addresses it. */
export const BAVLI_SPINE = 'bavli';

// ===========================================================================
// 1. Coord bridges
// ===========================================================================

/** The spine id an AnchorCoord addresses: its own `spine` (a commentary work
 *  like 'Rashi'), else the Gemara spine. */
export function spineIdOfCoord(c: AnchorCoord): string {
  return c.spine ?? BAVLI_SPINE;
}

/** AnchorCoord → Anchor. A real segment becomes a segment-precision point
 *  [tractate, page, seg]; the DAF_SEG sentinel becomes the truncated unit path
 *  [tractate, page] (the new model's whole-daf encoding). */
export function anchorFromCoord(c: AnchorCoord): Anchor {
  const spine = spineIdOfCoord(c);
  return c.seg >= 0
    ? { spine, span: [{ path: [c.tractate, c.page, c.seg] }], precision: 'segment' }
    : { spine, span: [{ path: [c.tractate, c.page] }], precision: 'unit' };
}

/** Anchor → AnchorCoord, for single-point spans whose path is a daf address
 *  ([tractate, page] or [tractate, page, seg]). Null when not representable
 *  (multi-point spans, ranges, token windows below coord granularity, external
 *  spines). The exact inverse of {@link anchorFromCoord}. */
export function coordFromAnchor(a: Anchor): AnchorCoord | null {
  if (a.span.length !== 1) return null;
  const el = a.span[0];
  if ('start' in el) return null;
  const { path } = el;
  const [tractate, page, seg] = path;
  if (typeof tractate !== 'string' || typeof page !== 'string') return null;
  const spinePart = a.spine === BAVLI_SPINE ? {} : { spine: a.spine };
  if (path.length === 2) return { tractate, page, seg: -1, ...spinePart };
  if (path.length === 3 && typeof seg === 'number') return { tractate, page, seg, ...spinePart };
  return null;
}

/** AnchorSpan → one Anchor (normalized + deduped via normalizeSpan). Precision
 *  is 'unit' when any coordinate is daf-level (DAF_SEG), else 'segment'. Spans
 *  are single-spine in practice; the first coordinate's spine wins. */
export function anchorFromSpan(span: AnchorSpan): Anchor {
  const coords = normalizeSpan(span);
  const spine = coords.length ? spineIdOfCoord(coords[0]) : BAVLI_SPINE;
  const anyDafLevel = coords.some((c) => c.seg < 0);
  return {
    spine,
    span: coords.map((c) =>
      c.seg >= 0 ? { path: [c.tractate, c.page, c.seg] } : { path: [c.tractate, c.page] },
    ),
    precision: anyDafLevel ? 'unit' : 'segment',
  };
}

// ===========================================================================
// 2. ContextItem bridge
// ===========================================================================

function viaConfidence(it: { via?: string; confidence?: number }): Partial<Anchor> {
  return {
    ...(it.via !== undefined ? { via: it.via } : {}),
    ...(it.confidence !== undefined ? { confidence: it.confidence } : {}),
  };
}

/**
 * A ContextItem's in-daf placement as an Anchor:
 *  - segs        → one segment-precision point per seg;
 *  - amud only   → the truncated daf path at 'division' precision. LOSSY on
 *                  purpose: WHICH amud is not encoded in the path (the daf is
 *                  the page unit); the letter stays recoverable from item.amud.
 *  - neither     → the whole daf at 'unit' precision when something placed the
 *                  item there (`via` is set — e.g. the AI placer's deliberate
 *                  whole-daf verdict); null when the item is simply unplaced.
 * via/confidence carry onto the anchor. The cross-daf `coord` is a SECOND
 * anchor — see {@link anchorsFromContextItem}.
 */
export function anchorFromContextItem(it: ContextItem, daf: DafRef): Anchor | null {
  if (it.segs.length > 0) {
    return {
      spine: BAVLI_SPINE,
      span: it.segs.map((seg) => ({ path: [daf.tractate, daf.page, seg] })),
      precision: 'segment',
      ...viaConfidence(it),
    };
  }
  if (it.amud) {
    return {
      spine: BAVLI_SPINE,
      span: [{ path: [daf.tractate, daf.page] }],
      precision: 'division',
      ...viaConfidence(it),
    };
  }
  if (it.via !== undefined) {
    return {
      spine: BAVLI_SPINE,
      span: [{ path: [daf.tractate, daf.page] }],
      precision: 'unit',
      ...viaConfidence(it),
    };
  }
  return null;
}

/** All anchors a ContextItem carries: the in-daf placement anchor (when any)
 *  plus the cross-daf `coord` as its own anchor (when present). */
export function anchorsFromContextItem(it: ContextItem, daf: DafRef): Anchor[] {
  const out: Anchor[] = [];
  const placement = anchorFromContextItem(it, daf);
  if (placement) out.push(placement);
  if (it.coord) out.push({ ...anchorFromCoord(it.coord), ...viaConfidence(it) });
  return out;
}

// ===========================================================================
// 3. SegMatch bridge
// ===========================================================================

/**
 * A matcher's SegMatch as an anchor-refinement artifact targeting
 * `targetArtifactId`. Placement precedence mirrors applyMatches: a deliberate
 * wholeDaf verdict wins (unit), then segs (segment points), then a coord-only
 * match (the cross-daf home). Throws on an unplaced match (segs empty, no
 * wholeDaf, no coord — applyMatches treats those as no-ops; there is no
 * refinement to express). `createdAt` is left '' — timestamps are the caller's
 * job.
 */
export function refinementFromSegMatch(
  m: SegMatch,
  daf: DafRef,
  targetArtifactId: string,
): Artifact<RefinementBody> {
  let anchor: Anchor;
  if (m.wholeDaf) {
    anchor = { spine: BAVLI_SPINE, span: [{ path: [daf.tractate, daf.page] }], precision: 'unit' };
  } else if (m.segs.length > 0) {
    const segs = Array.from(new Set(m.segs)).sort((a, b) => a - b);
    anchor = {
      spine: BAVLI_SPINE,
      span: segs.map((seg) => ({ path: [daf.tractate, daf.page, seg] })),
      precision: 'segment',
    };
  } else if (m.coord) {
    anchor = anchorFromCoord(m.coord);
  } else {
    throw new Error(`SegMatch for ${m.key} carries no placement (a no-op, not a refinement)`);
  }
  anchor = {
    ...anchor,
    via: m.via,
    ...(m.confidence !== undefined ? { confidence: m.confidence } : {}),
  };
  return {
    id: `refinement:${m.via}:${m.key}`,
    kind: 'anchor-refinement',
    anchors: [anchor],
    body: { targetArtifactId, anchor },
    provenance: {
      authority: m.via === 'ai' ? 'ai' : 'rule',
      producerId: `matcher:${m.via}`,
      inputs: [],
      createdAt: '',
    },
  };
}

// ===========================================================================
// 4. AnchorOutput bridge — the 7 studio anchor shapes, lifted structurally.
// ===========================================================================

export interface LegacySegmentAnchor {
  segIdx: number;
}
export interface LegacySegmentRangeAnchor {
  startSegIdx: number;
  endSegIdx: number;
}
export interface LegacyPhraseAnchor {
  excerpt: string;
  segIdx?: number;
  tokenStart?: number;
  tokenEnd?: number;
}
export interface LegacyMultiAnchor {
  anchors: LegacyPhraseAnchor[];
  relation?: string;
}
export interface LegacyCrossDafAnchor {
  source: LegacyPhraseAnchor | LegacySegmentRangeAnchor;
  target: { tractate: string; page: string; segIdx?: number };
}
export interface LegacyExternalAnchor {
  source: LegacyPhraseAnchor;
  url: string;
  resource_kind?: string;
}
export interface LegacyWholeDafAnchor {
  _: 'whole-daf';
}
export type LegacyAnchorOutput =
  | LegacySegmentAnchor
  | LegacySegmentRangeAnchor
  | LegacyPhraseAnchor
  | LegacyMultiAnchor
  | LegacyCrossDafAnchor
  | LegacyExternalAnchor
  | LegacyWholeDafAnchor;

function phrasePoint(a: LegacyPhraseAnchor, daf: DafRef): AnchorPoint {
  const tokens =
    a.tokenStart !== undefined && a.tokenEnd !== undefined
      ? ([a.tokenStart, a.tokenEnd] as [number, number])
      : undefined;
  return a.segIdx !== undefined
    ? {
        path: [daf.tractate, daf.page, a.segIdx],
        ...(tokens ? { tokens } : {}),
        excerpt: a.excerpt,
      }
    : { path: [daf.tractate, daf.page], excerpt: a.excerpt };
}

function anchorFromPhrase(a: LegacyPhraseAnchor, daf: DafRef, spine: string): Anchor {
  // Precision claims only what the anchor actually locates: a token window
  // when both token bounds exist, the segment when only segIdx does (most
  // runtime phrase instances — token positions resolve client-side), and the
  // whole daf when the phrase floated free of any segment.
  const hasTokens = a.tokenStart !== undefined && a.tokenEnd !== undefined;
  return {
    spine,
    span: [phrasePoint(a, daf)],
    precision: a.segIdx === undefined ? 'unit' : hasTokens ? 'token' : 'segment',
  };
}

function anchorFromRange(a: LegacySegmentRangeAnchor, daf: DafRef, spine: string): Anchor {
  return {
    spine,
    span: [
      {
        start: { path: [daf.tractate, daf.page, a.startSegIdx] },
        end: { path: [daf.tractate, daf.page, a.endSegIdx] },
      },
    ],
    precision: 'segment',
  };
}

function wholeDafAnchor(daf: DafRef, spine: string): Anchor {
  return { spine, span: [{ path: [daf.tractate, daf.page] }], precision: 'unit' };
}

/** Every studio AnchorOutput variant as Anchor[]. Cross-daf and external
 *  outputs produce TWO anchors (the source here + the target there / the
 *  external resource); multi-anchor produces one per sub-anchor. */
export function anchorsFromAnchorOutput(
  out: LegacyAnchorOutput,
  daf: DafRef,
  spine: string = BAVLI_SPINE,
): Anchor[] {
  if ('_' in out) return [wholeDafAnchor(daf, spine)];
  if ('url' in out) {
    return [
      anchorFromPhrase(out.source, daf, spine),
      {
        spine: `external:${out.resource_kind ?? 'url'}`,
        span: [{ path: [out.url] }],
        precision: 'external',
      },
    ];
  }
  if ('target' in out) {
    const source =
      'excerpt' in out.source
        ? anchorFromPhrase(out.source, daf, spine)
        : anchorFromRange(out.source, daf, spine);
    const t = out.target;
    const target: Anchor =
      t.segIdx !== undefined
        ? { spine, span: [{ path: [t.tractate, t.page, t.segIdx] }], precision: 'segment' }
        : { spine, span: [{ path: [t.tractate, t.page] }], precision: 'unit' };
    return [source, target];
  }
  if ('anchors' in out) return out.anchors.map((a) => anchorFromPhrase(a, daf, spine));
  if ('excerpt' in out) return [anchorFromPhrase(out, daf, spine)];
  if ('startSegIdx' in out) return [anchorFromRange(out, daf, spine)];
  return [{ spine, span: [{ path: [daf.tractate, daf.page, out.segIdx] }], precision: 'segment' }];
}

// ===========================================================================
// 5. Producer projections — MarkDefinition / EnrichmentDefinition ↔ Producer.
// ===========================================================================

export type LegacyAnchorKind =
  | 'segment'
  | 'segment-range'
  | 'phrase'
  | 'multi-anchor'
  | 'cross-daf'
  | 'external'
  | 'whole-daf';

export type LegacyMarkDependency = string | { mark: string };
export type LegacyEnrichmentDependency =
  | string
  | { enrichment: string; fanOut?: boolean }
  | { mark: string };

/** Structural copy of studio-schema's MarkDefinition. The app's real defs are
 *  assignment-compatible (their narrower unions widen into these fields). */
export interface LegacyMarkDef {
  id: string;
  label: string;
  description?: string;
  category?: string;
  anchor: LegacyAnchorKind;
  render: unknown;
  recipe?: unknown;
  extractor: unknown;
  dependencies?: LegacyMarkDependency[];
  passes?: string[];
  parent_mark?: string;
  experimental?: boolean;
  status: 'draft' | 'promoted';
  def_hash: string;
  cache_version: string;
  source: 'kv' | 'code';
  updated_at: string;
}

/** Structural copy of studio-schema's EnrichmentDefinition. */
export interface LegacyEnrichmentDef {
  id: string;
  label: string;
  description?: string;
  category?: string;
  target_mark: string;
  mode: 'augment-content' | 'refine-anchors' | 'aggregate';
  scope: 'global' | 'local' | 'spine';
  dependencies?: LegacyEnrichmentDependency[];
  passes?: string[];
  extractor: unknown;
  status: 'draft' | 'promoted';
  def_hash: string;
  cache_version: string;
  source: 'kv' | 'code';
  updated_at: string;
}

/** The anchor PRECISION a legacy anchor kind discovers. Verbatim kind is kept
 *  in `legacy.anchorKind` so nothing is lost (e.g. cross-daf vs segment). */
export function mapAnchorKindToPrecision(kind: LegacyAnchorKind): AnchorPrecision {
  switch (kind) {
    case 'phrase':
      return 'token';
    case 'whole-daf':
      return 'unit';
    default:
      // segment, segment-range, multi-anchor, cross-daf, external all discover
      // segment-level source anchors.
      return 'segment';
  }
}

/** Legacy dependency vocabulary → ProducerInput. The mark-vs-enrichment flavor
 *  of `{ producer }` references is NOT encoded here — it round-trips through
 *  the verbatim `legacy.dependencies` bag instead. */
function inputsFromDependencies(
  deps: ReadonlyArray<LegacyMarkDependency | LegacyEnrichmentDependency> | undefined,
): ProducerInput[] {
  return (deps ?? []).map((d) => {
    if (typeof d === 'string') return { source: d };
    if ('enrichment' in d) {
      return d.fanOut !== undefined
        ? { producer: d.enrichment, fanOut: d.fanOut }
        : { producer: d.enrichment };
    }
    return { producer: d.mark };
  });
}

/** Own-key-conditional spread: carries `key: undefined` as an own key when the
 *  source object had one, and omits it entirely when it didn't — so strict
 *  (own-key) round-trips hold for explicit-undefined optionals. */
function ownKey<T extends object, K extends keyof T>(obj: T, key: K): Partial<Pick<T, K>> {
  return key in obj ? ({ [key]: obj[key] } as Partial<Pick<T, K>>) : {};
}

/** Fields producerFromMark maps first-class or into named legacy slots. Any
 *  OTHER own field on a def (future shapes, KV-authored extras) is preserved
 *  verbatim in legacy.rest instead of being silently dropped. */
const MARK_KNOWN_FIELDS = new Set([
  'id',
  'label',
  'description',
  'category',
  'anchor',
  'render',
  'recipe',
  'extractor',
  'dependencies',
  'passes',
  'parent_mark',
  'experimental',
  'status',
  'def_hash',
  'cache_version',
  'source',
  'updated_at',
]);

function restOf(def: object, known: ReadonlySet<string>): Record<string, unknown> | undefined {
  const rest: Record<string, unknown> = {};
  let any = false;
  for (const k of Object.keys(def)) {
    if (!known.has(k)) {
      rest[k] = (def as Record<string, unknown>)[k];
      any = true;
    }
  }
  return any ? rest : undefined;
}

export function producerFromMark(def: LegacyMarkDef): Producer {
  const rest = restOf(def, MARK_KNOWN_FIELDS);
  return {
    id: def.id,
    label: def.label,
    ...ownKey(def, 'description'),
    ...ownKey(def, 'category'),
    kind: 'mark-instance',
    inputs: inputsFromDependencies(def.dependencies),
    recipe: { extractor: def.extractor, render: def.render },
    anchoring: { behavior: 'discovers', precision: mapAnchorKindToPrecision(def.anchor) },
    cardinality: 'many',
    scope: 'local',
    key_shape: 'mark',
    cacheVersion: def.cache_version,
    ...ownKey(def, 'passes'),
    status: def.status,
    ...ownKey(def, 'experimental'),
    source: def.source,
    updatedAt: def.updated_at,
    legacy: {
      anchorKind: def.anchor,
      def_hash: def.def_hash,
      ...('recipe' in def ? { sidebarRecipe: def.recipe } : {}),
      ...('parent_mark' in def ? { parent_mark: def.parent_mark } : {}),
      ...('dependencies' in def ? { dependencies: def.dependencies } : {}),
      ...(rest !== undefined ? { rest } : {}),
    },
  };
}

export function markFromProducer(p: Producer): LegacyMarkDef {
  const legacy = p.legacy ?? {};
  return {
    ...((legacy.rest as Record<string, unknown> | undefined) ?? {}),
    id: p.id,
    label: p.label,
    ...ownKey(p, 'description'),
    ...ownKey(p, 'category'),
    anchor: legacy.anchorKind as LegacyAnchorKind,
    render: p.recipe.render,
    ...('sidebarRecipe' in legacy ? { recipe: legacy.sidebarRecipe } : {}),
    extractor: p.recipe.extractor,
    ...('dependencies' in legacy
      ? { dependencies: legacy.dependencies as LegacyMarkDependency[] }
      : {}),
    ...ownKey(p, 'passes'),
    ...('parent_mark' in legacy ? { parent_mark: legacy.parent_mark as string } : {}),
    ...ownKey(p, 'experimental'),
    status: p.status ?? 'promoted',
    def_hash: legacy.def_hash as string,
    cache_version: p.cacheVersion,
    source: p.source ?? 'code',
    updated_at: p.updatedAt ?? '',
  } as LegacyMarkDef;
}

const MODE_TO_BEHAVIOR = {
  'augment-content': 'inherits',
  'refine-anchors': 'discovers',
  aggregate: 'aggregates',
} as const;

/** Fields producerFromEnrichment maps first-class or into named legacy slots;
 *  everything else rides verbatim in legacy.rest. */
const ENRICHMENT_KNOWN_FIELDS = new Set([
  'id',
  'label',
  'description',
  'category',
  'target_mark',
  'mode',
  'scope',
  'dependencies',
  'passes',
  'extractor',
  'status',
  'def_hash',
  'cache_version',
  'source',
  'updated_at',
]);

export function producerFromEnrichment(def: LegacyEnrichmentDef): Producer {
  const fanOut = (def.dependencies ?? []).some(
    (d) => typeof d === 'object' && 'fanOut' in d && d.fanOut === true,
  );
  const rest = restOf(def, ENRICHMENT_KNOWN_FIELDS);
  return {
    id: def.id,
    label: def.label,
    ...ownKey(def, 'description'),
    ...ownKey(def, 'category'),
    kind: def.mode === 'refine-anchors' ? 'anchor-refinement' : 'enrichment',
    inputs: inputsFromDependencies(def.dependencies),
    recipe: { extractor: def.extractor },
    anchoring: { behavior: MODE_TO_BEHAVIOR[def.mode], target: def.target_mark },
    cardinality: fanOut ? 'per-input' : 'one',
    scope: def.scope,
    key_shape: 'enrich',
    cacheVersion: def.cache_version,
    ...ownKey(def, 'passes'),
    status: def.status,
    source: def.source,
    updatedAt: def.updated_at,
    legacy: {
      def_hash: def.def_hash,
      ...('dependencies' in def ? { dependencies: def.dependencies } : {}),
      ...(rest !== undefined ? { rest } : {}),
    },
  };
}

export function enrichmentFromProducer(p: Producer): LegacyEnrichmentDef {
  const legacy = p.legacy ?? {};
  const mode =
    p.kind === 'anchor-refinement'
      ? 'refine-anchors'
      : p.anchoring.behavior === 'aggregates'
        ? 'aggregate'
        : 'augment-content';
  return {
    ...((legacy.rest as Record<string, unknown> | undefined) ?? {}),
    id: p.id,
    label: p.label,
    ...ownKey(p, 'description'),
    ...ownKey(p, 'category'),
    target_mark: p.anchoring.target ?? '',
    mode,
    scope: p.scope,
    ...('dependencies' in legacy
      ? { dependencies: legacy.dependencies as LegacyEnrichmentDependency[] }
      : {}),
    ...ownKey(p, 'passes'),
    extractor: p.recipe.extractor,
    status: p.status ?? 'promoted',
    def_hash: legacy.def_hash as string,
    cache_version: p.cacheVersion,
    source: p.source ?? 'code',
    updated_at: p.updatedAt ?? '',
  } as LegacyEnrichmentDef;
}

/** Back to the legacy 'gemara' | { mark } | { enrichment } dependency
 *  vocabulary — byte-identical to the original def's `dependencies` (it rides
 *  verbatim in the legacy bag), so registry/depGraph's producerNodesFrom is fed
 *  exactly what it gets today. Producers born WITHOUT a legacy bag get a
 *  best-effort reconstruction from `inputs` (mark producers reference marks;
 *  enrich producers reference enrichments; spine inputs read as source leaves). */
export function rawDependenciesOf(p: Producer): RawDependency[] {
  const legacy = p.legacy?.dependencies;
  if (Array.isArray(legacy)) return legacy as RawDependency[];
  return p.inputs.map((input): RawDependency => {
    if ('source' in input) return input.source;
    if ('producer' in input) {
      if (p.key_shape === 'mark') return { mark: input.producer };
      return input.fanOut !== undefined
        ? { enrichment: input.producer, fanOut: input.fanOut }
        : { enrichment: input.producer };
    }
    return input.spine;
  });
}
