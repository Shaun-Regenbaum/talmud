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
import { SefariaClient, flattenPieces } from '@corpus/core/sefaria/client';
import { isBook } from '../lib/books.ts';

interface Env {
  ASSETS: Fetcher;
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
 *  Hebrew string for daf-renderer's flowing columns. */
function joinHe(v: unknown): string {
  return flattenPieces(v).join(' ').trim();
}

// Mikraot Gedolot: the pasuk text framed by Rashi (inner) + Targum Onkelos
// (outer), fed to daf-renderer on the client. Hebrew only.
app.get('/api/mikraot/:book/:chapter', async (c) => {
  const book = c.req.param('book');
  const chapter = c.req.param('chapter');
  if (!isBook(book)) return c.json({ error: `Unknown book: ${book}` }, 400);
  if (!/^\d+$/.test(chapter)) return c.json({ error: `Bad chapter: ${chapter}` }, 400);

  const main = `${book} ${chapter}`;
  const [pasuk, rashi, targum] = await Promise.all([
    sefaria.getText(main).catch(() => null),
    sefaria.getText(`Rashi on ${main}`).catch(() => null),
    sefaria.getText(`Onkelos ${main}`).catch(() => null),
  ]);
  if (!pasuk || pasuk.error) {
    return c.json({ error: pasuk?.error ?? 'Sefaria fetch failed' }, 502);
  }

  return c.json({
    book,
    chapter: Number(chapter),
    ref: pasuk.ref ?? main,
    heRef: pasuk.heRef ?? '',
    main: joinHe(pasuk.he),
    rashi: rashi && !rashi.error ? joinHe(rashi.he) : '',
    targum: targum && !targum.error ? joinHe(targum.he) : '',
    next: pasuk.next ?? null,
    prev: pasuk.prev ?? null,
  });
});

// Everything else: serve the built SPA (static assets + index.html fallback).
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
