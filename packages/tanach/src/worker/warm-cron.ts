/**
 * Tanach warm-cron — keeps THIS WEEK'S parsha's chapter-level enrichments warm
 * so the reader opens it instantly (no cold LLM on the Overview / Geography
 * pills or the section anchors).
 *
 * Each tick: resolve the current parsha (Sefaria's calendar), expand it to its
 * chapter range, and warm a small BATCH of {chapter × producer} entries
 * (overview, geography, events), advancing a cursor. Once the whole parsha is
 * warmed the cursor latches and subsequent ticks are no-ops until the parsha
 * changes (the cursor stores the ref and resets when it moves). The producers
 * are cache-respecting (runProducer), so re-touching a warm entry costs nothing
 * — only a genuinely cold chapter pays an LLM call.
 *
 * Gentle by design: ~21 entries per double-parsha, BATCH per tick, so a fresh
 * parsha warms over a handful of ticks and steady state is idle. To force a
 * re-warm (e.g. after a producer version bump), delete the cursor key.
 */

import { isBook } from '../lib/books.ts';
import {
  runTanachEnrichment,
  runTanachEvents,
  type TanachEnv,
  type TanachRunCtx,
} from './run-ports.ts';

const CURSOR_KEY = 'tanach-warm-cursor:v1';
/** Chapter-level enrichments that power the reader's pills + section labels.
 *  Per-verse pieces (note / commentary / midrash / …) stay on-demand. */
const PRODUCERS = ['overview', 'geography', 'events'] as const;
/** Entries warmed per tick — small so one invocation stays well within the
 *  scheduled CPU/subrequest budget even when every entry is cold. */
const BATCH = 4;

interface WarmCursor {
  /** The parsha ref this cursor is walking; a change resets idx to 0. */
  ref: string;
  /** Next index into the (chapter × producer) list; >= length = fully warmed. */
  idx: number;
}

interface ParshaRange {
  book: string;
  startCh: number;
  endCh: number;
  ref: string;
}

/** This week's parsha as a chapter range, from Sefaria's calendar (diaspora).
 *  The ref looks like "Numbers 19:1-25:9" (a double parsha) or "Genesis 1:1-6:8";
 *  we take the book + the start..end chapters. null when unresolvable. */
async function currentParsha(): Promise<ParshaRange | null> {
  let cal: {
    calendar_items?: Array<{ title?: { en?: string }; ref?: string }>;
  };
  try {
    const r = await fetch('https://www.sefaria.org/api/calendars?diaspora=1');
    cal = (await r.json()) as typeof cal;
  } catch {
    return null;
  }
  const p = (cal.calendar_items ?? []).find((it) => it?.title?.en === 'Parashat Hashavua');
  const m = p?.ref?.match(/^(.+?)\s+(\d+):\d+(?:\s*-\s*(\d+):\d+)?/);
  if (!p?.ref || !m || !isBook(m[1])) return null;
  const startCh = Number(m[2]);
  const endCh = m[3] ? Number(m[3]) : startCh;
  if (!Number.isFinite(startCh) || !Number.isFinite(endCh) || endCh < startCh) return null;
  return { book: m[1], startCh, endCh, ref: p.ref };
}

async function readCursor(cache: KVNamespace): Promise<WarmCursor> {
  const raw = await cache.get(CURSOR_KEY);
  if (!raw) return { ref: '', idx: 0 };
  try {
    return JSON.parse(raw) as WarmCursor;
  } catch {
    return { ref: '', idx: 0 };
  }
}

export async function runTanachWarm(env: TanachEnv, ctx: ExecutionContext): Promise<void> {
  if (!env.CACHE) return;
  const parsha = await currentParsha();
  if (!parsha) return;

  // The ordered work-list: every chapter of the parsha × the chapter producers.
  const entries: { chapter: number; producer: (typeof PRODUCERS)[number] }[] = [];
  for (let ch = parsha.startCh; ch <= parsha.endCh; ch++) {
    for (const producer of PRODUCERS) entries.push({ chapter: ch, producer });
  }

  let cursor = await readCursor(env.CACHE);
  if (cursor.ref !== parsha.ref) cursor = { ref: parsha.ref, idx: 0 };
  if (cursor.idx >= entries.length) return; // this parsha is fully warmed

  let idx = cursor.idx;
  let warmed = 0;
  while (warmed < BATCH && idx < entries.length) {
    const { chapter, producer } = entries[idx];
    const chap = String(chapter);
    const rc: TanachRunCtx = { env, ctx, ref: `${parsha.book} ${chapter}` };
    try {
      if (producer === 'events') {
        await runTanachEvents(rc, parsha.book, chap);
      } else {
        await runTanachEnrichment(rc, producer, parsha.book, chap, { id: 'perek' });
      }
    } catch (e) {
      console.error(`[tanach-warm] ${producer} ${parsha.book} ${chapter} failed:`, e);
    }
    idx++;
    warmed++;
  }

  await env.CACHE.put(CURSOR_KEY, JSON.stringify({ ref: parsha.ref, idx } satisfies WarmCursor));
  console.log(`[tanach-warm] ${parsha.ref}: warmed ${warmed}, cursor ${idx}/${entries.length}`);
}
