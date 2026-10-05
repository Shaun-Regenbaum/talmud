/**
 * Read-time repair of STORED argument sections, and of the moves that point at
 * them. Pure: no env, no KV, no model calls.
 *
 * Why this exists: section ranges are fixed once, when a daf is generated, so
 * dafs generated before the range fixes (#714) keep a start that was pulled back
 * over the section before it, or an end taken at the first copy of a repeated
 * closing line. Re-running the (deterministic) re-anchorer over the stored
 * output heals them without paying for any model call.
 *
 * One guard keeps it safe:
 *   NO WORSE. A repair is applied only if the new partition is clean and no
 *   section moves AWAY from a segment that contains its own opening words.
 *
 * Cost: the repair itself never calls a model. A per-instance note is cached
 * under the section's identity. For a Latin-letter title that is the title slug,
 * so a corrected range keeps the same key and the note is dropped and rebuilt
 * on open (settleRepairedSections). For a Hebrew-only title the identity is a
 * hash that includes the range, so a corrected range is a new key: the old note
 * is orphaned and a new one is generated when the daf is opened. Either way the
 * spend happens only for dafs people open, and only for the changed sections.
 */

import { slugId } from '@corpus/core/cache/keys';
import { reanchorArgument } from './reanchor';
import { buildVerbatimGrid, findExcerpt } from './verbatim';

export interface RangeChange {
  from: [number, number];
  to: [number, number];
}

interface Inst {
  startSegIdx: number;
  endSegIdx: number;
  fields?: Record<string, unknown>;
  [k: string]: unknown;
}

/** True when the section's cache identity is a title/name slug (range-independent).
 *  Mirrors the label scan in core `instanceIdOf`; tests/section-repair.test.ts
 *  checks the two agree. */
export function hasRangeFreeIdentity(inst: Inst): boolean {
  const f = inst.fields;
  const labels: unknown[] = [
    inst.id,
    inst.name,
    inst.topic,
    inst.title,
    inst.verseRef,
    f?.id,
    f?.name,
    f?.topic,
    f?.title,
    f?.verseRef,
  ];
  for (const label of labels) {
    if (typeof label !== 'string' || !label) continue;
    if (/[a-z0-9]/.test(slugId(label))) return true;
  }
  return false;
}

const isInst = (x: unknown): x is Inst =>
  !!x &&
  typeof x === 'object' &&
  typeof (x as Inst).startSegIdx === 'number' &&
  typeof (x as Inst).endSegIdx === 'number';

/** A clean tiling: in order, each section starts right after the one before. */
function isCleanTiling(list: Inst[], segCount: number): boolean {
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.startSegIdx < 0 || s.endSegIdx < s.startSegIdx || s.endSegIdx >= segCount) return false;
    if (i > 0 && s.startSegIdx !== list[i - 1].endSegIdx + 1) return false;
  }
  return true;
}

export interface SectionRepair {
  parsed: unknown;
  changes: RangeChange[];
  /** Positions (in the stored `instances` array) of the sections whose range changed. */
  changedIndexes: number[];
}

/** Re-run the re-anchorer over stored argument output. Returns the SAME `parsed`
 *  object and no changes when nothing should change (so callers can skip work). */
export function repairArgumentSections(parsed: unknown, segmentsHe: string[]): SectionRepair {
  const unchanged: SectionRepair = { parsed, changes: [], changedIndexes: [] };
  const obj = parsed as { instances?: unknown } | null;
  if (!obj || !Array.isArray(obj.instances) || segmentsHe.length === 0) return unchanged;
  const before = obj.instances;
  if (before.length === 0 || !before.every(isInst)) return unchanged;

  const after = (
    reanchorArgument(structuredClone({ ...obj, instances: before }), segmentsHe) as {
      instances?: unknown;
    }
  ).instances;
  // The re-anchorer may drop a doubled section. Then old and new don't line up
  // one-to-one, so there is nothing safe to map the moves onto.
  if (!Array.isArray(after) || after.length !== before.length || !after.every(isInst)) {
    return unchanged;
  }
  if (!isCleanTiling(after, segmentsHe.length)) return unchanged;

  const grid = buildVerbatimGrid(segmentsHe);
  const startHasExcerpt = (s: Inst, seg: number): boolean => {
    const ex = s.fields?.excerpt;
    return typeof ex === 'string' && !!findExcerpt(grid, ex, seg, seg);
  };

  const changes: RangeChange[] = [];
  const changedIndexes: number[] = [];
  for (let i = 0; i < before.length; i++) {
    const a = before[i];
    const b = after[i];
    if (a.startSegIdx === b.startSegIdx && a.endSegIdx === b.endSegIdx) continue;
    // Never move a start off a segment that holds its opening words.
    if (startHasExcerpt(a, a.startSegIdx) && !startHasExcerpt(b, b.startSegIdx)) return unchanged;
    changes.push({ from: [a.startSegIdx, a.endSegIdx], to: [b.startSegIdx, b.endSegIdx] });
    changedIndexes.push(i);
  }
  if (changes.length === 0) return unchanged;

  const fixed = before.map((a, i) => ({
    ...a,
    startSegIdx: after[i].startSegIdx,
    endSegIdx: after[i].endSegIdx,
  }));
  return { parsed: { ...obj, instances: fixed }, changes, changedIndexes };
}

/** Point stored moves at their section's corrected range. Move ids are left
 *  alone on purpose: a move's cache identity is its id, so rewriting ids would
 *  turn every note built on it into a cache miss. */
export function remapMoveSections(parsed: unknown, changes: RangeChange[]): unknown {
  const obj = parsed as { instances?: unknown } | null;
  if (changes.length === 0 || !obj || !Array.isArray(obj.instances)) return parsed;
  const byFrom = new Map(changes.map((c) => [`${c.from[0]}-${c.from[1]}`, c.to]));
  let touched = false;
  const instances = obj.instances.map((m) => {
    const f = (m as Inst | null)?.fields;
    if (!f || typeof f.sectionStartSegIdx !== 'number' || typeof f.sectionEndSegIdx !== 'number') {
      return m;
    }
    const to = byFrom.get(`${f.sectionStartSegIdx}-${f.sectionEndSegIdx}`);
    if (!to) return m;
    touched = true;
    return { ...(m as Inst), fields: { ...f, sectionStartSegIdx: to[0], sectionEndSegIdx: to[1] } };
  });
  return touched ? { ...obj, instances } : parsed;
}

const rangeKey = (a: number, b: number) => `${a}-${b}`;

/** Which of a parent mark's sections to fan a rebuild over: keep only the
 *  instances whose range is in `only` (`start-end` strings). `undefined` keeps
 *  all of them. */
export function pickFanOutInstances<T>(instances: T[], only: ReadonlySet<string> | undefined): T[] {
  if (!only) return instances;
  return instances.filter((i) => {
    const s = (i as { startSegIdx?: unknown }).startSegIdx;
    const e = (i as { endSegIdx?: unknown }).endSegIdx;
    return typeof s === 'number' && typeof e === 'number' && only.has(rangeKey(s, e));
  });
}

/** Splice freshly generated moves for some sections into the stored move list.
 *  Moves of any section named in `changes` (by its old OR new range) are
 *  replaced by `fresh`; every other stored move is kept as it was. The result is
 *  ordered by section, then by each move's own position, like a full generation. */
export function mergeRebuiltMoves(
  stored: unknown,
  fresh: unknown,
  changes: RangeChange[],
): unknown {
  const s = stored as { instances?: unknown } | null;
  const f = fresh as { instances?: unknown } | null;
  if (!s || !Array.isArray(s.instances) || !f || !Array.isArray(f.instances)) return stored;
  const replaced = new Set<string>();
  for (const c of changes) {
    replaced.add(rangeKey(c.from[0], c.from[1]));
    replaced.add(rangeKey(c.to[0], c.to[1]));
  }
  const sectionOf = (m: unknown): string => {
    const fl = (m as Inst | null)?.fields;
    return typeof fl?.sectionStartSegIdx === 'number' && typeof fl?.sectionEndSegIdx === 'number'
      ? rangeKey(fl.sectionStartSegIdx, fl.sectionEndSegIdx)
      : '';
  };
  const kept = s.instances.filter((m) => !replaced.has(sectionOf(m)));
  const order = (m: unknown): [number, number] => {
    const fl = (m as Inst | null)?.fields;
    return [
      typeof fl?.sectionStartSegIdx === 'number' ? fl.sectionStartSegIdx : 0,
      typeof fl?.moveOrder === 'number' ? fl.moveOrder : 0,
    ];
  };
  const merged = [...kept, ...f.instances].sort((a, b) => {
    const [as, ao] = order(a);
    const [bs, bo] = order(b);
    return as - bs || ao - bo;
  });
  return { ...s, instances: merged };
}
