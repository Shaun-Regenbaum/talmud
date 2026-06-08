/**
 * Rabbi observation accumulation — the pure join layer.
 *
 * The app extracts entities PER DAF (forward index: daf -> rabbis, places,
 * stories, opinions, citations). This module builds the INVERSE: per-rabbi
 * "observations" recording, for one daf, everything that daf tells us about
 * each rabbi on it — where they were, what they argued, which stories they
 * appear in, which verses they expound, who they appear alongside.
 *
 * It is deterministic and pure (no I/O): the worker resolves the upstream
 * marks/enrichments and rabbi segment positions, hands them in here, and gets
 * back one ObservationSlice per rabbi to persist (one KV key per rabbi+daf —
 * see runEnrichmentOnce's `rabbi.observations` short-circuit). Nothing here
 * touches the canonical rabbi dataset; this is the COLLECT half. A future
 * synthesis pass consumes the accumulated slices (ranked notable places,
 * opinions/stories/exegesis indexes, supplementary lineage signal).
 *
 * Attribution is by segment containment plus the explicit `rabbiNames` a move
 * already lists, with an honest confidence tier on every observation so a
 * later consumer can weight or filter (e.g. notable places from high+medium
 * only). We record generously; we never silently assert.
 */

export type ObservationType = 'place' | 'opinion' | 'story' | 'exegesis' | 'lineage';
export type Confidence = 'high' | 'medium' | 'low';

export interface Observation {
  type: ObservationType;
  /** A representative anchoring segment on this daf (for traceability). -1 if
   *  the rabbi's position couldn't be resolved (e.g. place same-daf-only). */
  segIdx: number;
  confidence: Confidence;
  /** Which mark/enrichment produced the signal. */
  source: string;
  /** Type-specific data (place name, move summary, story title, verseRef…). */
  payload: Record<string, unknown>;
  /** Stable id of (type + payload identity). Dedups within a slice and lets a
   *  future consumer count occurrences across dafs (frequency = how many daf
   *  slices carry the same hash). Deliberately excludes the daf. */
  hash: string;
}

export interface ObservationSlice {
  slug: string;
  name: string;
  nameHe: string;
  tractate: string;
  page: string;
  computedAt: string;
  defHash: string;
  observations: Observation[];
}

// --- Resolved inputs (the worker does the I/O-ish resolution first) ---------

export interface ResolvedRabbi {
  /** Canonical Sefaria slug, or a slugified-name fallback for rabbis not in
   *  rabbi-places.json (precisely the candidates a future dataset pass wants). */
  slug: string;
  name: string;
  nameHe: string;
  generation?: string;
  /** Every segment on this daf whose Hebrew contains the rabbi's name. A rabbi
   *  can speak/appear in several places, so this is a list, not a single idx. */
  segIdxs: number[];
  /** High-confidence place-for-this-rabbi-on-this-daf, when rabbi.location was
   *  already computed (browse path). null/absent on the cold warm path. */
  location?: { place: string } | null;
}

export interface ResolvedPlace {
  name: string;
  nameHe: string;
  kind?: string;
  region?: string;
  segIdxs: number[];
}

export interface RangeItem {
  startSegIdx: number;
  endSegIdx: number;
  fields: Record<string, unknown>;
}

export interface JoinInput {
  tractate: string;
  page: string;
  defHash: string;
  computedAt: string;
  rabbis: ResolvedRabbi[];
  places: ResolvedPlace[];
  /** argument-move instances (segment-range, fields carry role/voice/rabbiNames/summary). */
  moves: RangeItem[];
  /** aggadata instances (segment-range, fields carry title/theme/summary). */
  aggadata: RangeItem[];
  /** pesukim instances (segment-range, fields carry verseRef/summary). */
  pesukim: RangeItem[];
}

// --- Matching helpers (pure; exported for reuse + unit tests) ---------------

/** Aggressive normalizer for substring matching. Strips Hebrew nikkud +
 *  cantillation and HTML, keeps Hebrew letters and ASCII alphanumerics (so the
 *  same function works on Hebrew daf text and on ASCII test fixtures), lowers
 *  case, and collapses whitespace. */
export function normalizeForMatch(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/[֑-ׇ]/g, '') // nikkud + cantillation
    .replace(/[^א-ת\sa-zA-Z0-9]/g, ' ') // keep Hebrew letters + ASCII alnum
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Indices of every segment whose normalized Hebrew contains `needle`. Caller
 *  pre-normalizes the segment array once for efficiency. */
export function resolveSegIdxs(needle: string, normalizedSegments: string[]): number[] {
  const n = normalizeForMatch(needle);
  if (!n) return [];
  const out: number[] = [];
  for (let i = 0; i < normalizedSegments.length; i++) {
    if (normalizedSegments[i].includes(n)) out.push(i);
  }
  return out;
}

/** Loose English-name match: equal after normalization, or one contains the
 *  other (catches "Eliezer" vs "Rabbi Eliezer"). Both sides come from the same
 *  LLM naming convention, so this is reliable without a fuzzy library. */
function namesMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Stable, dependency-free 32-bit string hash (djb2). Sync so the join stays
 *  pure; collision-resistant enough for within-slice dedup + frequency keys. */
function stableHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function inRange(r: RangeItem, seg: number): boolean {
  return seg >= r.startSegIdx && seg <= r.endSegIdx;
}
function containsAny(r: RangeItem, segIdxs: number[]): boolean {
  return segIdxs.some((s) => inRange(r, s));
}
/** True if some range in `ranges` contains a segment from BOTH rabbis. */
function shareRange(ranges: RangeItem[], a: number[], b: number[]): boolean {
  return ranges.some((r) => containsAny(r, a) && containsAny(r, b));
}

function rabbiNamesOf(fields: Record<string, unknown>): string[] {
  const rn = fields.rabbiNames;
  if (Array.isArray(rn)) return rn.filter((x): x is string => typeof x === 'string');
  return [];
}

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

// --- The join ---------------------------------------------------------------

/**
 * Build one ObservationSlice per rabbi (with a resolvable slug) for a single
 * daf. Observations are deduped within a slice by `hash`, keeping the highest
 * confidence seen for each.
 */
export function buildObservationSlices(input: JoinInput): ObservationSlice[] {
  const { rabbis, places, moves, aggadata, pesukim } = input;
  const storyAndMoveRanges = [...moves, ...aggadata];
  const slices: ObservationSlice[] = [];

  for (const rabbi of rabbis) {
    if (!rabbi.slug) continue;
    const repSeg = rabbi.segIdxs[0] ?? -1;

    // Collect candidates; dedup-by-hash (highest confidence wins) at the end.
    const candidates: Observation[] = [];
    const add = (
      type: ObservationType,
      segIdx: number,
      confidence: Confidence,
      source: string,
      payload: Record<string, unknown>,
      idKey: string,
    ) => {
      candidates.push({ type, segIdx, confidence, source, payload, hash: stableHash(`${type}|${idKey}`) });
    };

    // -- places ----------------------------------------------------------
    // high: explicit rabbi.location inference for this daf.
    if (rabbi.location?.place) {
      add('place', repSeg, 'high', 'rabbi.location', { place: rabbi.location.place }, `place:${normalizeForMatch(rabbi.location.place)}`);
    }
    // medium: a place that shares a move/story range with the rabbi.
    // low: a place anywhere on a daf the rabbi appears on.
    for (const p of places) {
      const shared = shareRange(storyAndMoveRanges, rabbi.segIdxs, p.segIdxs);
      const seg = p.segIdxs[0] ?? repSeg;
      add('place', seg, shared ? 'medium' : 'low', 'places', { name: p.name, nameHe: p.nameHe, kind: p.kind, region: p.region }, `place:${normalizeForMatch(p.name)}`);
    }

    // -- opinions (argument moves) ---------------------------------------
    // high: the move explicitly lists this rabbi among its voices.
    // medium: the rabbi's segment falls inside the move's range.
    for (const m of moves) {
      const named = rabbiNamesOf(m.fields).some((rn) => namesMatch(rn, rabbi.name) || namesMatch(rn, rabbi.nameHe));
      const contained = containsAny(m, rabbi.segIdxs);
      if (!named && !contained) continue;
      add(
        'opinion',
        m.startSegIdx,
        named ? 'high' : 'medium',
        'argument-move',
        { role: m.fields.role, voice: m.fields.voice, summary: m.fields.summary, startSegIdx: m.startSegIdx, endSegIdx: m.endSegIdx },
        `opinion:${m.fields.id ?? `${m.startSegIdx}-${m.endSegIdx}`}`,
      );
    }

    // -- stories (aggadata) ----------------------------------------------
    // medium: the rabbi appears within the story's segment range.
    for (const a of aggadata) {
      if (!containsAny(a, rabbi.segIdxs)) continue;
      add('story', a.startSegIdx, 'medium', 'aggadata', { title: a.fields.title, titleHe: a.fields.titleHe, theme: a.fields.theme, summary: a.fields.summary, startSegIdx: a.startSegIdx, endSegIdx: a.endSegIdx }, `story:${a.startSegIdx}-${a.endSegIdx}`);
    }

    // -- exegesis (pesukim) ----------------------------------------------
    // medium: the rabbi appears within the citation's segment range.
    for (const pk of pesukim) {
      if (!containsAny(pk, rabbi.segIdxs)) continue;
      const ref = typeof pk.fields.verseRef === 'string' ? pk.fields.verseRef : `${pk.startSegIdx}-${pk.endSegIdx}`;
      add('exegesis', pk.startSegIdx, 'medium', 'pesukim', { verseRef: pk.fields.verseRef, summary: pk.fields.summary, startSegIdx: pk.startSegIdx, endSegIdx: pk.endSegIdx }, `exegesis:${ref}`);
    }

    // -- lineage (co-occurrence) -----------------------------------------
    // high: two rabbis named together in the same move's rabbiNames.
    // medium: two rabbis sharing any move/story range.
    // Same-daf-only co-occurrence is intentionally NOT recorded — on a daf
    // with many rabbis it's mostly noise, and it never overrides the curated
    // Sefaria graph. This is a supplementary signal only.
    for (const other of rabbis) {
      if (other.slug === rabbi.slug || !other.slug) continue;
      const coNamed = moves.some((m) => {
        const names = rabbiNamesOf(m.fields);
        return names.some((rn) => namesMatch(rn, rabbi.name) || namesMatch(rn, rabbi.nameHe))
          && names.some((rn) => namesMatch(rn, other.name) || namesMatch(rn, other.nameHe));
      });
      const coRange = shareRange(storyAndMoveRanges, rabbi.segIdxs, other.segIdxs);
      if (!coNamed && !coRange) continue;
      add('lineage', repSeg, coNamed ? 'high' : 'medium', 'co-occurrence', { slug: other.slug, name: other.name }, `lineage:${other.slug}`);
    }

    // Dedup by hash, keeping the highest-confidence instance of each.
    const best = new Map<string, Observation>();
    for (const o of candidates) {
      const prev = best.get(o.hash);
      if (!prev || RANK[o.confidence] > RANK[prev.confidence]) best.set(o.hash, o);
    }

    slices.push({
      slug: rabbi.slug,
      name: rabbi.name,
      nameHe: rabbi.nameHe,
      tractate: input.tractate,
      page: input.page,
      computedAt: input.computedAt,
      defHash: input.defHash,
      observations: [...best.values()],
    });
  }

  return slices;
}
