/**
 * Tanach worker — Hono on Cloudflare Workers.
 *
 * GET /api/chapter/:book/:chapter returns a chapter's verses (Hebrew +
 * English) plus next/prev chapter refs, fetched live from Sefaria via the
 * shared @corpus/core SefariaClient. The producer routes (events / note /
 * synthesis / midrash-synthesis) run through the SAME corpus-agnostic
 * runProducer the talmud worker runs — synchronously, no queue — with their
 * app-specific wiring (key templates, source resolvers, LLM knobs, usage
 * ledger) in run-ports.ts. translate stays on bespoke plumbing (raw-string +
 * TTL cache; see producers/translate.ts). Everything else falls through to
 * the built Solid client (the ASSETS binding, SPA fallback).
 */

import { flattenPieces, pickV3Version } from '@corpus/core/sefaria/client';
import type { StoredArtifact } from '@corpus/core/store/envelope';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { isBook } from '../lib/books.ts';
import { COMMENTATORS } from '../lib/commentators.ts';
import type { EventSection } from './producers/events.ts';
import { translateHebrew } from './producers/translate.ts';
import type { TanachEnv, TanachRunCtx } from './run-ports.ts';
import { runTanachEnrichment, runTanachEvents, TanachSourceError } from './run-ports.ts';
import { asVerses, fetchPassages, fetchVerseCommentaries, sefaria } from './sefaria-sources.ts';
import { readUsage, recordUsage } from './usage.ts';

interface Env extends TanachEnv {
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

/** Map a producer-run failure to the legacy route responses: a source error
 *  keeps its specific status + body (404 ref-not-found / not-enough-material,
 *  502 upstream fetch failures with their original messages); anything else is
 *  the legacy `Producer failed: …` 502. */
function runErrorResponse(c: Context<{ Bindings: Env }>, e: unknown) {
  if (e instanceof TanachSourceError) return c.json({ error: e.message }, e.status);
  return c.json({ error: `Producer failed: ${(e as Error).message}` }, 502);
}

app.get('/api/chapter/:book/:chapter', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  if (!isBook(book)) {
    return c.json({ error: `Unknown book: ${book}` }, 400);
  }
  if (!/^\d+$/.test(chapter)) {
    return c.json({ error: `Chapter must be a number, got: ${chapter}` }, 400);
  }

  const ref = `${book} ${chapter}`;
  let data: Awaited<ReturnType<typeof sefaria.getText>>;
  try {
    data = await sefaria.getText(ref);
  } catch (e) {
    return c.json({ error: `Sefaria fetch failed: ${(e as Error).message}` }, 502);
  }
  if (data.error) {
    return c.json({ error: data.error }, 404);
  }

  const he = asVerses(data.he);
  const en = asVerses(data.text);
  const count = Math.max(he.length, en.length);
  const verses = Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    he: he[i] ?? '',
    en: en[i] ?? '',
  }));

  return c.json({
    book,
    chapter: Number(chapter),
    ref: data.ref ?? ref,
    heRef: data.heRef ?? '',
    verses,
    next: data.next ?? null,
    prev: data.prev ?? null,
  });
});

/** Join a Sefaria he/text payload (nested per-verse arrays) into one continuous
 *  Hebrew string for daf-renderer's flowing columns. Parsha markers (petucha/
 *  setuma spans + braces) are dropped — daf-renderer flows continuously, so a
 *  literal "{ס}" would otherwise render mid-text. */
function joinHe(v: unknown): string {
  return flattenPieces(v)
    .join(' ')
    .replace(/<span class="mam-spi-[^"]*">\{[^}]*\}<\/span>/g, '')
    .replace(/\{[פסש]\}/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Mikraot Gedolot: the pasuk text framed by Rashi (inner) + Targum Onkelos
// (outer), fed to daf-renderer on the client. Hebrew only.
app.get('/api/mikraot/:book/:chapter', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter)) return c.json({ error: `Bad chapter: ${chapter}` }, 400);

  const ref = `${book} ${chapter}`;
  const [pasuk, rashi, targum] = await Promise.all([
    sefaria.getText(ref).catch(() => null),
    sefaria.getText(`Rashi on ${ref}`).catch(() => null),
    sefaria.getText(`Onkelos ${ref}`).catch(() => null),
  ]);
  if (!pasuk || pasuk.error) {
    return c.json({ error: pasuk?.error ?? 'Sefaria fetch failed' }, 502);
  }

  // Per-verse alignment: Sefaria returns he[] indexed by verse for all three
  // (Rashi he[i] is the array of comments on verse i+1; Onkelos he[i] is the
  // verse's Targum). Aligning by index lets the client number verses and
  // cross-highlight the pasuk <-> its Rashi/Onkelos.
  const pasukHe = Array.isArray(pasuk.he) ? pasuk.he : [pasuk.he];
  const rashiHe = rashi && !rashi.error && Array.isArray(rashi.he) ? rashi.he : [];
  const targumHe = targum && !targum.error && Array.isArray(targum.he) ? targum.he : [];
  const verses = pasukHe.map((p, i) => ({
    n: i + 1,
    pasuk: joinHe(p),
    rashi: joinHe(rashiHe[i]),
    targum: joinHe(targumHe[i]),
  }));

  return c.json({
    book,
    chapter: Number(chapter),
    ref: pasuk.ref ?? ref,
    heRef: pasuk.heRef ?? '',
    verses,
    next: pasuk.next ?? null,
    prev: pasuk.prev ?? null,
  });
});

// Events anchor (first producer): short margin labels for a chapter's natural
// narrative units ("Day One", "The Burning Bush"), pinned to the verse where
// each begins. Runs through the core runProducer (cache key events:v2:* via
// the template scheme — pre-migration raw-payload entries keep serving through
// the legacy read adapter; fresh runs cache a StoredArtifact envelope with
// provenance). Usage is attributed inside the run ports.
app.get('/api/events/:book/:chapter', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter)) return c.json({ error: `Bad chapter: ${chapter}` }, 400);

  const ref = `${book} ${chapter}`;
  const rc: TanachRunCtx = { env: c.env, ctx: c.executionCtx, ref };
  let artifact: StoredArtifact;
  try {
    artifact = await runTanachEvents(rc, book, chapter);
  } catch (e) {
    return runErrorResponse(c, e);
  }
  // Project the envelope back to the legacy response JSON. `parsed` is the
  // normalized {sections} on fresh/envelope entries and the full legacy
  // payload (which carries the same `sections`) on pre-migration entries.
  const parsed = artifact.parsed as { sections?: EventSection[] } | null;
  return c.json({ book, chapter: Number(chapter), ref, sections: parsed?.sections ?? [] });
});

// This week's Torah portion (parashat hashavua), from Sefaria's calendar.
// Returns the parsha name + the book/chapter it starts at, so the reader can
// jump straight there. Cached ~6h (it only changes on Shabbat).
app.get('/api/parsha', async (c) => {
  // The weekly reading desyncs between Israel and the Diaspora for a few weeks a
  // year (when a yom tov falls on Shabbat outside Israel). Sefaria's calendar
  // takes diaspora=1 (default) / diaspora=0 (Israel).
  const israel = c.req.query('loc') === 'israel';
  const cacheKey = `parsha:current:${israel ? 'il' : 'gola'}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) return c.json(JSON.parse(cached));

  let cal: {
    calendar_items?: Array<{
      title?: { en?: string };
      displayValue?: { en?: string; he?: string };
      ref?: string;
    }>;
  };
  try {
    const r = await fetch(`https://www.sefaria.org/api/calendars?diaspora=${israel ? 0 : 1}`);
    cal = (await r.json()) as typeof cal;
  } catch (e) {
    return c.json({ error: `Calendar fetch failed: ${(e as Error).message}` }, 502);
  }
  const parsha = (cal.calendar_items ?? []).find((it) => it?.title?.en === 'Parashat Hashavua');
  const m = parsha?.ref?.match(/^(.+?)\s+(\d+):/);
  if (!parsha || !m || !isBook(m[1])) {
    return c.json({ error: `No addressable parsha (ref: ${parsha?.ref ?? 'none'})` }, 502);
  }
  const payload = {
    name: parsha.displayValue?.en ?? parsha.title?.en ?? 'Parsha',
    heName: parsha.displayValue?.he ?? '',
    ref: parsha.ref,
    book: m[1],
    chapter: Number(m[2]),
  };
  c.executionCtx.waitUntil(
    c.env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 6 * 3600 }),
  );
  return c.json(payload);
});

// Section note (second producer, composes on events): a short bilingual p'shat
// note for the verse range [start..end] of a chapter. Triggered when the reader
// clicks a margin anchor. Runs through the core runProducer; the markInput's
// `id` (`${start}-${end}`) is the legacy key component, so note:v1:* keys stay
// byte-identical and pre-migration entries keep serving.
app.get('/api/note/:book/:chapter/:start', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const start = Number(c.req.param('start'));
  const end = Number(c.req.query('end')) || start;
  const label = c.req.query('label') ?? '';
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !start) return c.json({ error: 'Bad chapter/verse' }, 400);

  const ref = end > start ? `${book} ${chapter}:${start}-${end}` : `${book} ${chapter}:${start}`;
  const rc: TanachRunCtx = { env: c.env, ctx: c.executionCtx, ref };
  let artifact: StoredArtifact;
  try {
    artifact = await runTanachEnrichment(rc, 'note', book, chapter, {
      id: `${start}-${end}`,
      start,
      end,
      label,
    });
  } catch (e) {
    return runErrorResponse(c, e);
  }
  const p = artifact.parsed as { en?: string; he?: string } | null;
  return c.json({
    book,
    chapter: Number(chapter),
    start,
    end,
    en: String(p?.en ?? '').trim(),
    he: String(p?.he ?? '').trim(),
  });
});

// Word / phrase translation: the reader selects Hebrew and gets an English
// gloss (in the sense it carries in the given verse context). Cached per
// normalized selection.
//
// DELIBERATELY NOT on runProducer/ArtifactStore (the one producer route kept
// on bespoke plumbing): the cache stores a RAW STRING with a 30-day TTL —
// the value isn't a StoredArtifact envelope and the TTL contradicts the
// store's no-TTL contract. Migrating only the orchestration would change
// either the stored bytes or the expiry semantics for zero benefit. The
// producer is still declared in producers/defs.ts (registry completeness);
// see producers/translate.ts for the full rationale.
app.get('/api/translate', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const ctx = (c.req.query('ctx') ?? '').trim().slice(0, 400);
  if (!q) return c.json({ error: 'Missing q' }, 400);
  if (q.length > 120) return c.json({ error: 'Selection too long' }, 400);

  // Cache key ignores niqqud/cantillation so vocalized + bare forms share a hit.
  const norm = q.replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim();
  const key = `translate:v1:${norm}`;
  const cached = await c.env.CACHE.get(key);
  if (cached !== null) return c.json({ q, translation: cached, cached: true });

  let result: Awaited<ReturnType<typeof translateHebrew>>;
  try {
    result = await translateHebrew(c.env, q, ctx);
  } catch (e) {
    return c.json({ error: `Translate failed: ${(e as Error).message}` }, 502);
  }
  if (!result.translation) return c.json({ error: 'No translation' }, 502);

  c.executionCtx.waitUntil(
    Promise.all([
      c.env.CACHE.put(key, result.translation, { expirationTtl: 60 * 60 * 24 * 30 }),
      recordUsage(c.env.CACHE, {
        ts: Date.now(),
        ref: norm.slice(0, 40),
        producer: 'translate',
        model: result.model,
        in: result.inTokens,
        out: result.outTokens,
        cost: result.costUsd,
      }),
    ]).then(() => undefined),
  );
  return c.json({ q, translation: result.translation });
});

// Classic commentary for a single verse: each commentator's note from Sefaria
// (Hebrew + English), the empties skipped. Cached per verse. No AI — raw Rishonim.
app.get('/api/commentary/:book/:chapter/:verse', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const verse = c.req.param('verse');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !/^\d+$/.test(verse))
    return c.json({ error: 'Bad chapter/verse' }, 400);

  const key = `commentary:v1:${book}:${chapter}:${verse}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.json(JSON.parse(cached));

  const commentaries = await fetchVerseCommentaries(book, chapter, verse);
  const payload = { book, chapter: Number(chapter), verse: Number(verse), commentaries };
  c.executionCtx.waitUntil(c.env.CACHE.put(key, JSON.stringify(payload)).then(() => undefined));
  return c.json(payload);
});

// Commentary synthesis (AI): a short balanced overview of how the Rishonim read
// the verse. The reader only requests it on "rich" verses (per the source
// index), so it isn't generated for every pasuk. Runs through the core
// runProducer; the 'commentaries' source resolver reuses the drawer's
// commentary:v1 cache and raises the legacy 404 when fewer than two comment.
app.get('/api/synthesis/:book/:chapter/:verse', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const verse = c.req.param('verse');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !/^\d+$/.test(verse))
    return c.json({ error: 'Bad chapter/verse' }, 400);

  const rc: TanachRunCtx = { env: c.env, ctx: c.executionCtx, ref: `${book} ${chapter}:${verse}` };
  let artifact: StoredArtifact;
  try {
    // RAW verse string throughout (legacy parity): '007' must reach the source
    // ref, the prompt, and the output key identically.
    artifact = await runTanachEnrichment(rc, 'synthesis', book, chapter, {
      id: verse,
      verse,
    });
  } catch (e) {
    return runErrorResponse(c, e);
  }
  const p = artifact.parsed as { en?: string; he?: string } | null;
  return c.json({
    book,
    chapter: Number(chapter),
    verse: Number(verse),
    en: String(p?.en ?? '').trim(),
    he: String(p?.he ?? '').trim(),
  });
});

// Per-chapter rishonim index: how many of the curated commentators comment on
// each verse. ~8 light per-chapter fetches (matches what the drawer shows). The
// reader uses this to show the commentary icon only where many comment.
app.get('/api/sources-index/:book/:chapter', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter)) return c.json({ error: 'Bad chapter' }, 400);

  const key = `srcidx:v4:${book}:${chapter}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.json(JSON.parse(cached));

  // Per verse: how many commentators, and the total weight (chars of Hebrew
  // commentary) — volume is a better "richness" signal than count, since in the
  // Torah almost every verse has several commentators.
  const acc = new Map<number, { n: number; w: number }>();
  await Promise.all(
    COMMENTATORS.map(async (cm) => {
      try {
        const v3 = await sefaria.getTextV3(`${cm.title} on ${book} ${chapter}`);
        const heArr = (() => {
          const he = pickV3Version(v3.versions, 'he');
          return Array.isArray(he) ? (he as unknown[]) : [];
        })();
        for (let i = 0; i < heArr.length; i++) {
          const segs = flattenPieces(heArr[i]).map((x) => x.replace(/<[^>]+>/g, '').trim());
          const chars = segs.join('').length;
          if (!chars) continue;
          const e = acc.get(i + 1) ?? { n: 0, w: 0 };
          e.n += 1;
          e.w += chars;
          acc.set(i + 1, e);
        }
      } catch {
        /* commentator absent on this book */
      }
    }),
  );
  // Talmud + Midrash citation counts per verse, from one chapter-wide links
  // fetch (Sefaria's link graph). Heavy for the busiest chapters (~6MB) —
  // best-effort: on failure the icons just don't show, the drawers still work.
  const gem = new Map<number, number>();
  const mid = new Map<number, number>();
  try {
    const r = await fetch(
      `https://www.sefaria.org/api/links/${encodeURIComponent(`${book} ${chapter}`)}?with_text=0`,
    );
    type Link = { category?: string; anchorVerse?: number; sourceRef?: string; ref?: string };
    const links = (await r.json()) as Link[];
    const gemSeen = new Map<number, Set<string>>();
    const midSeen = new Map<number, Set<string>>();
    for (const l of Array.isArray(links) ? links : []) {
      const v = l.anchorVerse;
      if (!v) continue;
      const ref = l.sourceRef || l.ref;
      if (!ref) continue;
      if (l.category === 'Talmud') {
        const s = gemSeen.get(v) ?? new Set<string>();
        s.add(ref);
        gemSeen.set(v, s);
      } else if (l.category === 'Midrash') {
        const s = midSeen.get(v) ?? new Set<string>();
        s.add(ref);
        midSeen.set(v, s);
      }
    }
    gemSeen.forEach((s, v) => {
      gem.set(v, s.size);
    });
    midSeen.forEach((s, v) => {
      mid.set(v, s.size);
    });
  } catch {
    /* links too heavy / unavailable — skip gemara+midrash counts */
  }

  const entries = [...acc.entries()].sort((a, b) => a[0] - b[0]);
  // "rich" = many commentators AND in the top fraction of this chapter by volume.
  const weights = entries.map(([, e]) => e.w).sort((a, b) => a - b);
  const cutoff = weights.length ? weights[Math.floor(weights.length * 0.6)] : 0;
  // union of verses that have any source so gemara/midrash-only verses still appear
  const allVerses = new Set<number>([...acc.keys(), ...gem.keys(), ...mid.keys()]);
  const verses = [...allVerses]
    .sort((a, b) => a - b)
    .map((verse) => {
      const e = acc.get(verse) ?? { n: 0, w: 0 };
      return {
        verse,
        rishonim: e.n,
        rich: e.n >= 3 && e.w >= cutoff,
        gemara: gem.get(verse) ?? 0,
        midrash: mid.get(verse) ?? 0,
      };
    });
  const payload = { book, chapter: Number(chapter), verses };
  c.executionCtx.waitUntil(c.env.CACHE.put(key, JSON.stringify(payload)).then(() => undefined));
  return c.json(payload);
});

// Reverse Gemara lookup: how a verse is used in the Talmud (Sefaria's link
// graph, category "Talmud"). Cached per verse.
app.get('/api/gemara/:book/:chapter/:verse', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const verse = c.req.param('verse');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !/^\d+$/.test(verse))
    return c.json({ error: 'Bad chapter/verse' }, 400);

  const key = `gemara:v1:${book}:${chapter}:${verse}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.json(JSON.parse(cached));

  let res: Awaited<ReturnType<typeof fetchPassages>>;
  try {
    res = await fetchPassages(`${book} ${chapter}:${verse}`, 'Talmud', 12, true);
  } catch (e) {
    return c.json({ error: `Links fetch failed: ${(e as Error).message}` }, 502);
  }
  const payload = {
    book,
    chapter: Number(chapter),
    verse: Number(verse),
    count: res.count,
    passages: res.passages,
  };
  c.executionCtx.waitUntil(c.env.CACHE.put(key, JSON.stringify(payload)).then(() => undefined));
  return c.json(payload);
});

// Midrash on a verse (Sefaria's link graph, category "Midrash"). Capped list of
// sources; the synthesis (next endpoint) distills the volume. Cached per verse.
app.get('/api/midrash/:book/:chapter/:verse', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const verse = c.req.param('verse');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !/^\d+$/.test(verse))
    return c.json({ error: 'Bad chapter/verse' }, 400);

  const key = `midrash:v1:${book}:${chapter}:${verse}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.json(JSON.parse(cached));

  let res: Awaited<ReturnType<typeof fetchPassages>>;
  try {
    res = await fetchPassages(`${book} ${chapter}:${verse}`, 'Midrash', 14);
  } catch (e) {
    return c.json({ error: `Links fetch failed: ${(e as Error).message}` }, 502);
  }
  const payload = {
    book,
    chapter: Number(chapter),
    verse: Number(verse),
    count: res.count,
    passages: res.passages,
  };
  c.executionCtx.waitUntil(c.env.CACHE.put(key, JSON.stringify(payload)).then(() => undefined));
  return c.json(payload);
});

// Midrash synthesis (AI): distills the verse's midrashim into a thematic
// overview. Requested for verses with substantial midrash. Runs through the
// core runProducer (producer id 'midrash-synthesis'; the key template owns the
// legacy midrash-synth:v1:* bytes). The 'midrash-passages' source resolver
// reuses the midrash:v1 SOURCE cache (which stays on direct KV above) and
// raises the legacy 404/502s.
app.get('/api/midrash-synthesis/:book/:chapter/:verse', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const verse = c.req.param('verse');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !/^\d+$/.test(verse))
    return c.json({ error: 'Bad chapter/verse' }, 400);

  const rc: TanachRunCtx = { env: c.env, ctx: c.executionCtx, ref: `${book} ${chapter}:${verse}` };
  let artifact: StoredArtifact;
  try {
    artifact = await runTanachEnrichment(rc, 'midrash-synthesis', book, chapter, {
      id: verse,
      verse,
    });
  } catch (e) {
    return runErrorResponse(c, e);
  }
  const p = artifact.parsed as { en?: string; he?: string } | null;
  return c.json({
    book,
    chapter: Number(chapter),
    verse: Number(verse),
    en: String(p?.en ?? '').trim(),
    he: String(p?.he ?? '').trim(),
  });
});

// Self-tracked LLM usage (totals + per-producer + recent calls).
app.get('/api/usage', async (c) => c.json(await readUsage(c.env.CACHE)));

// Everything else: serve the built SPA (static assets + index.html fallback).
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
