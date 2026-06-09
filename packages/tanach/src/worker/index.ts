/**
 * Tanach worker — Hono on Cloudflare Workers.
 *
 * v1 surface: GET /api/chapter/:book/:chapter returns a chapter's verses
 * (Hebrew + English) plus next/prev chapter refs, fetched live from Sefaria via
 * the shared @corpus/core SefariaClient. Everything else falls through to the
 * built Solid client (the ASSETS binding, SPA fallback). No KV / LLM yet — that
 * arrives with caching + the producers.
 */

import { Hono } from 'hono';
import { SefariaClient, flattenPieces, pickV3Version } from '@corpus/core/sefaria/client';
import type { LLMEnv } from '@corpus/core/llm/llm';
import { isBook } from '../lib/books.ts';
import { COMMENTATORS } from '../lib/commentators.ts';
import { eventSections } from './producers/events.ts';
import { midrashSynthesis } from './producers/midrash.ts';
import { sectionNote } from './producers/note.ts';
import { synthesize } from './producers/synthesis.ts';
import { translateHebrew } from './producers/translate.ts';
import { readUsage, recordUsage } from './usage.ts';

interface Env extends LLMEnv {
  ASSETS: Fetcher;
  CACHE: KVNamespace;
}

const sefaria = new SefariaClient();

/** Strip Sefaria's inline footnote apparatus (the marker + the expanded note
 *  text), which otherwise renders mid-verse. Keeps benign inline tags like the
 *  large/small-letter <big>/<small> markup. */
function stripFootnotes(html: string): string {
  return html
    .replace(/<sup class="footnote-marker">.*?<\/sup>/g, '')
    .replace(/<i class="footnote">.*?<\/i>/g, '')
    .trim();
}

/** Sefaria returns he/text as a per-verse string array for a chapter ref (or a
 *  bare string for a single verse). Normalize to a string[], footnotes stripped. */
function asVerses(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.map((s) => (typeof s === 'string' ? stripFootnotes(s) : ''));
  return typeof v === 'string' ? [stripFootnotes(v)] : [];
}

const app = new Hono<{ Bindings: Env }>();

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
  let data: Awaited<ReturnType<SefariaClient['getText']>>;
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
// each begins. Cached per chapter in KV; computed once via the LLM.
app.get('/api/events/:book/:chapter', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter)) return c.json({ error: `Bad chapter: ${chapter}` }, 400);

  const key = `events:v2:${book}:${chapter}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.json(JSON.parse(cached));

  const ref = `${book} ${chapter}`;
  let text: Awaited<ReturnType<SefariaClient['getText']>>;
  try {
    text = await sefaria.getText(ref);
  } catch (e) {
    return c.json({ error: `Sefaria fetch failed: ${(e as Error).message}` }, 502);
  }
  if (text.error) return c.json({ error: text.error }, 404);

  const he = asVerses(text.he);
  const en = asVerses(text.text);
  const verses = Array.from({ length: Math.max(he.length, en.length) }, (_, i) => ({
    n: i + 1,
    he: he[i] ?? '',
    en: en[i] ?? '',
  }));

  let result: Awaited<ReturnType<typeof eventSections>>;
  try {
    result = await eventSections(c.env, ref, verses);
  } catch (e) {
    return c.json({ error: `Producer failed: ${(e as Error).message}` }, 502);
  }

  const payload = { book, chapter: Number(chapter), ref, sections: result.sections };
  // Persist the result + a usage entry (best-effort; never block the response).
  c.executionCtx.waitUntil(
    Promise.all([
      c.env.CACHE.put(key, JSON.stringify(payload)),
      recordUsage(c.env.CACHE, {
        ts: Date.now(),
        ref,
        producer: 'events',
        model: result.model,
        in: result.inTokens,
        out: result.outTokens,
        cost: result.costUsd,
      }),
    ]).then(() => undefined),
  );
  return c.json(payload);
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

  let cal: { calendar_items?: Array<{ title?: { en?: string }; displayValue?: { en?: string; he?: string }; ref?: string }> };
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
  c.executionCtx.waitUntil(c.env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 6 * 3600 }));
  return c.json(payload);
});

// Section note (second producer, composes on events): a short bilingual p'shat
// note for the verse range [start..end] of a chapter. Triggered when the reader
// clicks a margin anchor. Cached per range.
app.get('/api/note/:book/:chapter/:start', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const start = Number(c.req.param('start'));
  const end = Number(c.req.query('end')) || start;
  const label = c.req.query('label') ?? '';
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !start) return c.json({ error: 'Bad chapter/verse' }, 400);

  const key = `note:v1:${book}:${chapter}:${start}-${end}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.json(JSON.parse(cached));

  let text: Awaited<ReturnType<SefariaClient['getText']>>;
  try {
    text = await sefaria.getText(`${book} ${chapter}`);
  } catch (e) {
    return c.json({ error: `Sefaria fetch failed: ${(e as Error).message}` }, 502);
  }
  if (text.error) return c.json({ error: text.error }, 404);

  const en = asVerses(text.text);
  const last = Math.min(end, en.length);
  const slice: string[] = [];
  for (let n = start; n <= last; n++) {
    slice.push(`${n}. ${(en[n - 1] ?? '').replace(/<[^>]+>/g, '').trim()}`);
  }
  const ref = end > start ? `${book} ${chapter}:${start}-${end}` : `${book} ${chapter}:${start}`;

  let result: Awaited<ReturnType<typeof sectionNote>>;
  try {
    result = await sectionNote(c.env, ref, label, slice.join('\n'));
  } catch (e) {
    return c.json({ error: `Producer failed: ${(e as Error).message}` }, 502);
  }

  const payload = { book, chapter: Number(chapter), start, end, en: result.en, he: result.he };
  c.executionCtx.waitUntil(
    Promise.all([
      c.env.CACHE.put(key, JSON.stringify(payload)),
      recordUsage(c.env.CACHE, {
        ts: Date.now(),
        ref,
        producer: 'note',
        model: result.model,
        in: result.inTokens,
        out: result.outTokens,
        cost: result.costUsd,
      }),
    ]).then(() => undefined),
  );
  return c.json(payload);
});

// Word / phrase translation: the reader selects Hebrew and gets an English
// gloss (in the sense it carries in the given verse context). Cached per
// normalized selection.
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

interface VerseCommentary {
  key: string;
  en: string;
  heName: string;
  he: string[];
  enText: string[];
}

/** Fetch each curated commentator's note on a verse from Sefaria (he+en), drop
 *  the empties. Shared by the commentary drawer and the synthesis producer. */
async function fetchVerseCommentaries(book: string, chapter: string, verse: string): Promise<VerseCommentary[]> {
  const results = await Promise.all(
    COMMENTATORS.map(async (cm) => {
      const ref = `${cm.title} on ${book} ${chapter}:${verse}`;
      try {
        const v3 = await sefaria.getTextV3(ref);
        const he = flattenPieces(pickV3Version(v3.versions, 'he')).filter((s) => s.trim());
        const en = flattenPieces(pickV3Version(v3.versions, 'en')).filter((s) => s.trim());
        if (!he.length && !en.length) return null;
        return { key: cm.key, en: cm.en, heName: cm.he, he, enText: en };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is VerseCommentary => r !== null);
}

// Classic commentary for a single verse: each commentator's note from Sefaria
// (Hebrew + English), the empties skipped. Cached per verse. No AI — raw Rishonim.
app.get('/api/commentary/:book/:chapter/:verse', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const verse = c.req.param('verse');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !/^\d+$/.test(verse)) return c.json({ error: 'Bad chapter/verse' }, 400);

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
// index), so it isn't generated for every pasuk. Cached + usage-tracked.
app.get('/api/synthesis/:book/:chapter/:verse', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const verse = c.req.param('verse');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !/^\d+$/.test(verse)) return c.json({ error: 'Bad chapter/verse' }, 400);

  const key = `synthesis:v1:${book}:${chapter}:${verse}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.json(JSON.parse(cached));

  // Reuse the cached commentary if the drawer already fetched it.
  let commentaries: VerseCommentary[];
  const cc = await c.env.CACHE.get(`commentary:v1:${book}:${chapter}:${verse}`);
  commentaries = cc
    ? (JSON.parse(cc).commentaries as VerseCommentary[])
    : await fetchVerseCommentaries(book, chapter, verse);
  if (commentaries.length < 2) return c.json({ error: 'Not enough commentary to synthesize' }, 404);

  let verseText = '';
  try {
    const t = await sefaria.getText(`${book} ${chapter}:${verse}`);
    verseText = (asVerses(t.text)[0] || asVerses(t.he)[0] || '').replace(/<[^>]+>/g, '').trim();
  } catch {
    /* verse text is optional context */
  }
  const ctext = commentaries
    .map((cm) => `${cm.en}: ${cm.he.join(' ').replace(/<[^>]+>/g, '').slice(0, 600)}`)
    .join('\n\n');

  let result: Awaited<ReturnType<typeof synthesize>>;
  try {
    result = await synthesize(c.env, `${book} ${chapter}:${verse}`, verseText, ctext);
  } catch (e) {
    return c.json({ error: `Producer failed: ${(e as Error).message}` }, 502);
  }

  const payload = { book, chapter: Number(chapter), verse: Number(verse), en: result.en, he: result.he };
  c.executionCtx.waitUntil(
    Promise.all([
      c.env.CACHE.put(key, JSON.stringify(payload)),
      recordUsage(c.env.CACHE, {
        ts: Date.now(),
        ref: `${book} ${chapter}:${verse}`,
        producer: 'synthesis',
        model: result.model,
        in: result.inTokens,
        out: result.outTokens,
        cost: result.costUsd,
      }),
    ]).then(() => undefined),
  );
  return c.json(payload);
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
    gemSeen.forEach((s, v) => gem.set(v, s.size));
    midSeen.forEach((s, v) => mid.set(v, s.size));
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

interface SourcePassage {
  ref: string;
  he: string;
  en: string;
}

/** Distinct citing passages of one Sefaria category for a verse (Talmud /
 *  Midrash), capped, each with a fetched text snippet. `bavliFirst` floats the
 *  Bavli ahead of Yerushalmi / minor tractates. */
async function fetchPassages(
  ref: string,
  category: string,
  cap: number,
  bavliFirst = false,
): Promise<{ count: number; passages: SourcePassage[] }> {
  type Link = { category?: string; ref?: string; sourceRef?: string; index_title?: string };
  const r = await fetch(`https://www.sefaria.org/api/links/${encodeURIComponent(ref)}?with_text=0`);
  const links = (await r.json()) as Link[];
  const seen = new Set<string>();
  const picked: { ref: string; title: string }[] = [];
  for (const l of Array.isArray(links) ? links : []) {
    if (l.category !== category) continue;
    const sref = l.sourceRef || l.ref;
    if (!sref || seen.has(sref)) continue;
    seen.add(sref);
    picked.push({ ref: sref, title: l.index_title ?? '' });
  }
  if (bavliFirst) {
    picked.sort((a, b) => Number(/^(Jerusalem|Tractate)/.test(a.title)) - Number(/^(Jerusalem|Tractate)/.test(b.title)));
  }
  const passages = await Promise.all(
    picked.slice(0, cap).map(async (p) => {
      try {
        const v3 = await sefaria.getTextV3(p.ref);
        const he = flattenPieces(pickV3Version(v3.versions, 'he')).join(' ').replace(/<[^>]+>/g, '').trim().slice(0, 420);
        const en = flattenPieces(pickV3Version(v3.versions, 'en')).join(' ').replace(/<[^>]+>/g, '').trim().slice(0, 420);
        return { ref: p.ref, he, en };
      } catch {
        return { ref: p.ref, he: '', en: '' };
      }
    }),
  );
  return { count: picked.length, passages };
}

// Reverse Gemara lookup: how a verse is used in the Talmud (Sefaria's link
// graph, category "Talmud"). Cached per verse.
app.get('/api/gemara/:book/:chapter/:verse', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const verse = c.req.param('verse');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !/^\d+$/.test(verse)) return c.json({ error: 'Bad chapter/verse' }, 400);

  const key = `gemara:v1:${book}:${chapter}:${verse}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.json(JSON.parse(cached));

  let res: Awaited<ReturnType<typeof fetchPassages>>;
  try {
    res = await fetchPassages(`${book} ${chapter}:${verse}`, 'Talmud', 12, true);
  } catch (e) {
    return c.json({ error: `Links fetch failed: ${(e as Error).message}` }, 502);
  }
  const payload = { book, chapter: Number(chapter), verse: Number(verse), count: res.count, passages: res.passages };
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
  if (!/^\d+$/.test(chapter) || !/^\d+$/.test(verse)) return c.json({ error: 'Bad chapter/verse' }, 400);

  const key = `midrash:v1:${book}:${chapter}:${verse}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.json(JSON.parse(cached));

  let res: Awaited<ReturnType<typeof fetchPassages>>;
  try {
    res = await fetchPassages(`${book} ${chapter}:${verse}`, 'Midrash', 14);
  } catch (e) {
    return c.json({ error: `Links fetch failed: ${(e as Error).message}` }, 502);
  }
  const payload = { book, chapter: Number(chapter), verse: Number(verse), count: res.count, passages: res.passages };
  c.executionCtx.waitUntil(c.env.CACHE.put(key, JSON.stringify(payload)).then(() => undefined));
  return c.json(payload);
});

// Midrash synthesis (AI): distills the verse's midrashim into a thematic
// overview. Requested for verses with substantial midrash. Cached + tracked.
app.get('/api/midrash-synthesis/:book/:chapter/:verse', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  const verse = c.req.param('verse');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter) || !/^\d+$/.test(verse)) return c.json({ error: 'Bad chapter/verse' }, 400);

  const key = `midrash-synth:v1:${book}:${chapter}:${verse}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.json(JSON.parse(cached));

  let passages: SourcePassage[];
  const cm = await c.env.CACHE.get(`midrash:v1:${book}:${chapter}:${verse}`);
  if (cm) {
    passages = JSON.parse(cm).passages as SourcePassage[];
  } else {
    try {
      passages = (await fetchPassages(`${book} ${chapter}:${verse}`, 'Midrash', 14)).passages;
    } catch (e) {
      return c.json({ error: `Links fetch failed: ${(e as Error).message}` }, 502);
    }
  }
  if (passages.length < 2) return c.json({ error: 'Not enough midrash to synthesize' }, 404);

  let verseText = '';
  try {
    const t = await sefaria.getText(`${book} ${chapter}:${verse}`);
    verseText = (asVerses(t.text)[0] || asVerses(t.he)[0] || '').replace(/<[^>]+>/g, '').trim();
  } catch {
    /* optional */
  }
  const mtext = passages.map((p) => p.he || p.en).filter(Boolean).join('\n\n');

  let result: Awaited<ReturnType<typeof midrashSynthesis>>;
  try {
    result = await midrashSynthesis(c.env, `${book} ${chapter}:${verse}`, verseText, mtext);
  } catch (e) {
    return c.json({ error: `Producer failed: ${(e as Error).message}` }, 502);
  }
  const payload = { book, chapter: Number(chapter), verse: Number(verse), en: result.en, he: result.he };
  c.executionCtx.waitUntil(
    Promise.all([
      c.env.CACHE.put(key, JSON.stringify(payload)),
      recordUsage(c.env.CACHE, {
        ts: Date.now(),
        ref: `${book} ${chapter}:${verse}`,
        producer: 'midrash-synthesis',
        model: result.model,
        in: result.inTokens,
        out: result.outTokens,
        cost: result.costUsd,
      }),
    ]).then(() => undefined),
  );
  return c.json(payload);
});

// Self-tracked LLM usage (totals + per-producer + recent calls).
app.get('/api/usage', async (c) => c.json(await readUsage(c.env.CACHE)));

// Everything else: serve the built SPA (static assets + index.html fallback).
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
