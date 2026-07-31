/**
 * Tanach warm-cron — keeps THIS WEEK'S parsha fully warm so a reader opening
 * the weekly portion never waits on a cold LLM, neither on the chapter pills
 * (Overview / Geography / Tidbit) + section anchors NOR on a verse's commentary
 * / midrash synthesis.
 *
 * Each tick resolves the current parsha (Sefaria's calendar), expands it to its
 * chapter range, and warms a small BATCH of the not-yet-done work, tracked by a
 * completed-set cursor:
 *
 *   1. chapter-level pills + section anchors (overview, geography, tidbit, events)
 *   2. the per-chapter sources index (srcidx — no LLM; also gates step 3)
 *   3. per-VERSE deep content, gated by the index: commentary `synthesis` where
 *      there are commentators, `midrash-synthesis` where there is midrash.
 *
 * Cheap by design: the producers are cache-respecting, so a warmed entry never
 * re-pays; the cursor records what's done (reset when the parsha changes). The
 * whole double-parsha is a one-time ~$0.10-0.20 (deepseek-flash), then idle.
 * Bump CURSOR_KEY to force a re-warm (e.g. a producer version bump).
 */

import type { WeeklyParsha } from '../lib/parsha.ts';
import { currentParsha } from './parsha-calendar.ts';
import {
  runTanachEnrichment,
  runTanachEvents,
  type TanachEnv,
  type TanachRunCtx,
} from './run-ports.ts';
import { computeSourcesIndex, readSourcesIndex } from './sources-index.ts';

// v5: warm the whole-parsha overview before the chapter-level reader pieces.
const CURSOR_KEY = 'tanach-warm-cursor:v5';
/** Chapter-level enrichments that power the reader's pills + section labels. */
const CHAPTER_PRODUCERS = ['overview', 'geography', 'tidbit', 'events'] as const;
/** Entries warmed per tick — small so one invocation stays well within the
 *  scheduled CPU/subrequest budget even when every entry is cold. */
const BATCH = 8;

type WarmEntry =
  | { kind: 'parsha'; producer: 'parsha-overview' }
  | { kind: 'chapter'; producer: (typeof CHAPTER_PRODUCERS)[number]; chapter: number }
  | { kind: 'srcindex'; chapter: number }
  | { kind: 'verse'; producer: 'synthesis' | 'midrash-synthesis'; chapter: number; verse: number };

/** Stable id for the completed-set cursor. */
function entryId(e: WarmEntry): string {
  if (e.kind === 'parsha') return `p:${e.producer}`;
  if (e.kind === 'chapter') return `c:${e.chapter}:${e.producer}`;
  if (e.kind === 'srcindex') return `i:${e.chapter}`;
  return `v:${e.chapter}:${e.producer}:${e.verse}`;
}

interface WarmCursor {
  /** The parsha ref this cursor is for; a change wipes the done-set. */
  ref: string;
  /** Entry ids already warmed (cache-respecting, so this only grows). */
  done: string[];
}

async function readCursor(cache: KVNamespace): Promise<WarmCursor> {
  const raw = await cache.get(CURSOR_KEY);
  if (!raw) return { ref: '', done: [] };
  try {
    return JSON.parse(raw) as WarmCursor;
  } catch {
    return { ref: '', done: [] };
  }
}

/** The ordered work-list. Pills + section anchors first (the visible surface),
 *  then the sources indexes, then the per-verse deep content gated by whichever
 *  indexes are already cached (an uncached chapter contributes a `srcindex`
 *  entry instead; its verses join the list once that index warms). */
async function buildWorkList(cache: KVNamespace, parsha: WeeklyParsha): Promise<WarmEntry[]> {
  const pills: WarmEntry[] = [{ kind: 'parsha', producer: 'parsha-overview' }];
  const indexes: WarmEntry[] = [];
  const verses: WarmEntry[] = [];
  for (let ch = parsha.startChapter; ch <= parsha.endChapter; ch++) {
    for (const producer of CHAPTER_PRODUCERS)
      pills.push({ kind: 'chapter', producer, chapter: ch });
    const idx = await readSourcesIndex(cache, parsha.book, String(ch));
    if (!idx) {
      indexes.push({ kind: 'srcindex', chapter: ch });
      continue;
    }
    for (const v of idx.verses) {
      if (v.rishonim > 0)
        verses.push({ kind: 'verse', producer: 'synthesis', chapter: ch, verse: v.verse });
      if (v.midrash > 0)
        verses.push({ kind: 'verse', producer: 'midrash-synthesis', chapter: ch, verse: v.verse });
    }
  }
  return [...pills, ...indexes, ...verses];
}

async function warmEntry(
  env: TanachEnv,
  ctx: ExecutionContext,
  parsha: WeeklyParsha,
  e: WarmEntry,
): Promise<void> {
  try {
    if (e.kind === 'parsha') {
      const rc: TanachRunCtx = { env, ctx, ref: parsha.ref };
      await runTanachEnrichment(rc, e.producer, parsha.book, parsha.ref, {
        id: parsha.ref,
        parshaName: parsha.name,
        parshaRef: parsha.ref,
      });
      return;
    }
    if (e.kind === 'srcindex') {
      await computeSourcesIndex(env.CACHE, parsha.book, String(e.chapter));
      return;
    }
    if (e.kind === 'chapter') {
      const rc: TanachRunCtx = { env, ctx, ref: `${parsha.book} ${e.chapter}` };
      if (e.producer === 'events') await runTanachEvents(rc, parsha.book, String(e.chapter));
      else
        await runTanachEnrichment(rc, e.producer, parsha.book, String(e.chapter), { id: 'perek' });
      return;
    }
    const rc: TanachRunCtx = { env, ctx, ref: `${parsha.book} ${e.chapter}:${e.verse}` };
    await runTanachEnrichment(rc, e.producer, parsha.book, String(e.chapter), {
      id: String(e.verse),
      verse: String(e.verse),
    });
  } catch (err) {
    console.error(`[tanach-warm] ${entryId(e)} failed:`, err);
  }
}

export async function runTanachWarm(env: TanachEnv, ctx: ExecutionContext): Promise<void> {
  if (!env.CACHE) return;
  const parsha = await currentParsha(env.CACHE, false).catch(() => null);
  if (!parsha) return;

  const entries = await buildWorkList(env.CACHE, parsha);
  let cursor = await readCursor(env.CACHE);
  if (cursor.ref !== parsha.ref) cursor = { ref: parsha.ref, done: [] };
  const done = new Set(cursor.done);

  let warmed = 0;
  for (const e of entries) {
    if (warmed >= BATCH) break;
    const id = entryId(e);
    if (done.has(id)) continue;
    await warmEntry(env, ctx, parsha, e);
    done.add(id);
    warmed++;
  }

  await env.CACHE.put(
    CURSOR_KEY,
    JSON.stringify({ ref: parsha.ref, done: [...done] } satisfies WarmCursor),
  );
  console.log(`[tanach-warm] ${parsha.ref}: warmed ${warmed}, done ${done.size}/${entries.length}`);
}
