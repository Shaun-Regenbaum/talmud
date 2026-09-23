/**
 * POST /api/bilingual — the Jev half of the bilingual house rule (see
 * src/lib/bilingual.ts: Hebrew first, English in parentheses once). The
 * reader sends the English paragraphs it is about to show; each one with
 * Hebrew parentheses is judged by Jev once, and the result (quotations
 * flipped, plus the name/term pairs Jev pinned down) is cached forever by
 * content hash. The reader applies the pairs with hebrewFirst.
 *
 * GET /api/bilingual/glossary/:tractate/:page builds the page glossary: the
 * names and terms whose Hebrew some paragraph on the page gives, so the
 * reader can put the same Hebrew first in every paragraph on the page. It reads the page's saved prose through /api/daf-view and shares
 * the per-paragraph judgments (and their cache entries) with the POST.
 *
 * Never fails a paragraph: a Jev error (no key, budget pause, timeout) returns the text unchanged and caches nothing, so
 * the next open tries again.
 */

import { runJev } from '@corpus/core/llm/jev';
import type { Hono } from 'hono';
import {
  type BilingualItem,
  buildBilingualQuestions,
  buildGlossary,
  findHebrewParens,
  flipQuotes,
  type GlossaryEntry,
  pairsFromDecisions,
  proseWithHebrew,
  readDecisions,
} from '../lib/bilingual';
import { isValidAmud } from '../lib/sefref/amudim';
import { keyForBilingual, keyForBilingualGlossary } from './cache-keys';
import { readJsonBody } from './http-helpers';
import type { Bindings } from './types';

/** Paragraphs per request, and the longest paragraph judged. */
export const BILINGUAL_MAX_TEXTS = 40;
export const BILINGUAL_MAX_CHARS = 4000;
/** Jev requests in flight per call. At 20, Bekhorot 5a's 200 paragraphs take
 *  about 11 seconds (at 6 they took 20). */
const CONCURRENCY = 20;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** What Jev settles for one paragraph: the text with its quotations flipped
 *  to Hebrew-first, and the name/term pairs it pinned down (which the reader
 *  applies with hebrewFirst, and the page glossary is built from). */
interface Judged {
  text: string;
  pairs: BilingualItem[];
}

/** Judge one paragraph: KV hit, else one Jev request. Null on a Jev failure
 *  (nothing is cached, so the next open tries again). */
async function judge(
  env: Bindings,
  text: string,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<Judged | null> {
  const parens = findHebrewParens(text);
  if (parens.length === 0) return { text, pairs: [] };
  const key = keyForBilingual(await sha256Hex(text));
  const hit = env.CACHE ? await env.CACHE.get<Judged>(key, 'json') : null;
  if (hit && typeof hit.text === 'string' && Array.isArray(hit.pairs)) return hit;
  try {
    const res = await runJev(env, {
      state: { paragraph: text },
      questions: buildBilingualQuestions(text, parens),
      tag: 'bilingual',
      attribution: { kind: 'hebraize' },
    });
    const decisions = readDecisions(text, parens, res.answers);
    const out: Judged = {
      text: flipQuotes(text, parens, decisions),
      pairs: pairsFromDecisions(parens, decisions),
    };
    if (env.CACHE) {
      waitUntil(env.CACHE.put(key, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 }));
    }
    return out;
  } catch (err) {
    console.warn(`[bilingual] jev failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
    return null;
  }
}

/** Run `fn` over `items` with CONCURRENCY in flight, results in input order. */
async function pool<T, R>(items: readonly T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Paragraphs judged per page glossary; a page rarely has more. */
export const GLOSSARY_MAX_PARAGRAPHS = 200;

export function registerBilingualRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.post('/api/bilingual', async (c) => {
    const parsed = await readJsonBody<{ texts?: unknown }>(c, { error: 'bad json' });
    if (!parsed.ok) return parsed.response;
    const texts = parsed.value.texts;
    if (!Array.isArray(texts) || !texts.every((t) => typeof t === 'string')) {
      return c.json({ error: 'texts must be an array of strings' }, 400);
    }
    if (texts.length > BILINGUAL_MAX_TEXTS) {
      return c.json({ error: `at most ${BILINGUAL_MAX_TEXTS} texts` }, 413);
    }
    const waitUntil = (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
    const judged = await pool(texts as string[], async (t) =>
      t.length > BILINGUAL_MAX_CHARS ? null : judge(c.env, t, waitUntil),
    );
    const out = judged.map((j, i) => j?.text ?? (texts as string[])[i]);
    const pairs = judged.map((j) => j?.pairs ?? []);
    return c.json({ texts: out, pairs });
  });

  // GET /api/bilingual/glossary/:tractate/:page — the page glossary: every
  // name/term whose Hebrew some paragraph on the page gives, learned from the
  // page's saved prose (the same pieces /api/daf-view serves). Built on the
  // first request and cached; the per-paragraph judgments are shared with
  // POST /api/bilingual through the same cache entries.
  app.get('/api/bilingual/glossary/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    if (!isValidAmud(tractate, page)) return c.json({ error: 'no such page' }, 404);
    const key = keyForBilingualGlossary(tractate, page);
    const hit = c.env.CACHE ? await c.env.CACHE.get<GlossaryEntry[]>(key, 'json') : null;
    if (Array.isArray(hit)) return c.json({ entries: hit, cached: true });

    const viewRes = await app.request(
      `/api/daf-view/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}`,
      {},
      c.env,
      c.executionCtx,
    );
    if (!viewRes.ok) return c.json({ entries: [], error: `daf-view ${viewRes.status}` });
    const view = (await viewRes.json()) as { pieces?: unknown; complete?: boolean };
    const paragraphs = proseWithHebrew(view.pieces).slice(0, GLOSSARY_MAX_PARAGRAPHS);
    const waitUntil = (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
    const judged = await pool(paragraphs, (t) => judge(c.env, t, waitUntil));
    const entries = buildGlossary(judged.map((j) => j?.pairs ?? []));
    // Cache only a full answer: every paragraph judged, on a finished page.
    // Otherwise the next request builds it again (the per-paragraph work is
    // cached, so a retry only pays for what failed or is new).
    const full = view.complete === true && judged.every((j) => j !== null);
    if (full && c.env.CACHE) {
      waitUntil(
        c.env.CACHE.put(key, JSON.stringify(entries), { expirationTtl: 60 * 60 * 24 * 30 }),
      );
    }
    return c.json({ entries, cached: false, complete: full });
  });
}
