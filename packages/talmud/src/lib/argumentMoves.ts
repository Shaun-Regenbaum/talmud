// Pure helpers shared by the worker (argument / argument-move post-processing
// and argument.synthesis scoping) and the client (ArgumentSidebar move
// selection). No env / DOM / framework imports so both bundles — and vitest —
// can use the exact same implementation.
//
// Background: the `argument` extractor (V4 Flash) is non-deterministic about
// how it splits a sugya into sections, and occasionally emits its partition
// more than once in a single `instances` array (e.g. lists segs 1–3 as one
// section AND again as 1, 2, 3). Left alone, the `argument-move` fan-out then
// runs each duplicated section and concatenates the results, so the sidebar
// ends up rendering two partitions' worth of moves for the same daf — each
// firing its own synthesis, which is what made Shabbat 126a spin on "Listening
// to…" indefinitely. These helpers are the defense-in-depth that keeps a
// doubled partition from ever reaching the UI.

export interface SectionRange {
  startSegIdx: number;
  endSegIdx: number;
}

export interface MoveLike {
  startSegIdx: number;
  endSegIdx: number;
  fields: {
    id?: string;
    sectionStartSegIdx?: number;
    sectionEndSegIdx?: number;
    moveOrder?: number;
    [k: string]: unknown;
  };
}

/**
 * Collapse a possibly-doubled / overlapping list of argument SECTIONS into a
 * single clean partition, then re-tile it so sections abut with no gaps.
 *
 * Sections are sorted (start asc, then end asc) and kept greedily: a section
 * survives only if it begins past the span already covered by the last kept
 * section. The end-ascending tiebreak means that when a coarse split and a fine
 * split start at the same segment, the finer split wins — we'd rather show more
 * granular sections than fewer. Surviving sections then have their start pushed
 * to `prev.end + 1` to close any gap a dropped section left behind, and the
 * final ranges are clamped to `lastSeg`.
 *
 * Mutates the surviving instances' start/end in place (the caller has already
 * anchored them) and returns the filtered, ordered list.
 */
export function partitionSections<T extends SectionRange>(instances: T[], lastSeg: number): T[] {
  const sorted = [...instances].sort(
    (a, b) => a.startSegIdx - b.startSegIdx || a.endSegIdx - b.endSegIdx,
  );
  const kept: T[] = [];
  for (const s of sorted) {
    const last = kept[kept.length - 1];
    // Drop any section starting within the span the last kept section already
    // covers — that's an exact duplicate or an overlap from a second partition.
    if (last && s.startSegIdx <= last.endSegIdx) continue;
    kept.push(s);
  }
  // Re-tile: each section starts right after the previous one ends, closing
  // gaps left by dropped sections.
  for (let i = 1; i < kept.length; i++) {
    const prev = kept[i - 1];
    const cur = kept[i];
    if (cur.startSegIdx !== prev.endSegIdx + 1) {
      cur.startSegIdx = prev.endSegIdx + 1;
      if (cur.endSegIdx < cur.startSegIdx) cur.endSegIdx = cur.startSegIdx;
    }
  }
  for (const s of kept) {
    if (s.startSegIdx > lastSeg) s.startSegIdx = lastSeg;
    if (s.endSegIdx > lastSeg) s.endSegIdx = lastSeg;
  }
  return kept;
}

/**
 * Dedupe fan-out parent instances by their (startSegIdx, endSegIdx) range, so a
 * parent mark that accidentally emits the same section twice doesn't make the
 * fan-out run — and concatenate — that section's children twice. Instances
 * without a numeric range are never dropped (we can't key them, and collapsing
 * them would be worse than a stray duplicate).
 */
export function dedupeByRange<T extends Partial<SectionRange>>(instances: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of instances) {
    if (typeof s.startSegIdx !== 'number' || typeof s.endSegIdx !== 'number') {
      out.push(s);
      continue;
    }
    const key = `${s.startSegIdx}-${s.endSegIdx}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Drop entries that share a key, keeping the first occurrence. A conservative
 * defense for instance lists that aren't partitions (pesukim, aggadata,
 * halacha): a doubled LLM output would otherwise render the same citation /
 * story / topic twice. The caller picks a key that includes BOTH the content
 * and the location, so two legitimately-distinct entries (e.g. the same verse
 * cited at two spots on the daf) are never collapsed.
 */
export function dedupeBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Pick the moves that belong to one argument section, robust to a stale or
 * doubled `argument-move` cache that holds two partitions' worth of moves for
 * the same daf.
 *
 *  1. Dedupe by move id (collapses the same move emitted twice — e.g. two
 *     `4-4_0`s from two fan-out passes).
 *  2. Prefer moves whose parent section matches THIS section exactly
 *     (sectionStartSegIdx/sectionEndSegIdx). This is what separates a `1-3`
 *     section's moves from a `1-1`/`2-2`/`3-3` split's moves when both are in
 *     the cache.
 *  3. Only when no move carries an exact match (older payloads without
 *     section refs, or partition drift) fall back to segment-range containment.
 *
 * Result is ordered by moveOrder.
 */
export function selectSectionMoves<T extends MoveLike>(
  moves: T[],
  section: { startSegIdx?: number; endSegIdx?: number },
): T[] {
  const sStart = section.startSegIdx;
  const sEnd = section.endSegIdx;

  const seen = new Set<string>();
  const unique: T[] = [];
  for (const m of moves) {
    const id = m.fields?.id;
    if (typeof id === 'string' && id.length > 0) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    unique.push(m);
  }

  const exact = unique.filter(
    (m) => m.fields?.sectionStartSegIdx === sStart && m.fields?.sectionEndSegIdx === sEnd,
  );
  const chosen =
    exact.length > 0
      ? exact
      : unique.filter(
          (m) =>
            typeof sStart === 'number' &&
            typeof sEnd === 'number' &&
            m.startSegIdx >= sStart &&
            m.endSegIdx <= sEnd,
        );

  return chosen.slice().sort((a, b) => (a.fields?.moveOrder ?? 0) - (b.fields?.moveOrder ?? 0));
}
