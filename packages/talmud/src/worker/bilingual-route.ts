/**
 * POST /api/bilingual — the Jev half of the bilingual house rule (see
 * src/lib/bilingual.ts): a name or term keeps its Hebrew once, on its first
 * mention in the paragraph. The reader sends the English paragraphs it is
 * about to show; each one with Hebrew parentheses is judged by Jev once and
 * the cleaned text is cached forever by content hash, so a page is cleaned
 * the first time anyone opens it and served from KV after that.
 *
 * Never fails a paragraph: a Jev error (no key, budget pause, staging's
 * read-only guard, timeout) returns the text unchanged and caches nothing, so
 * the next open tries again.
 */

import { runJev } from '@corpus/core/llm/jev';
import type { Hono } from 'hono';
import {
  applyBilingual,
  buildBilingualQuestions,
  findHebrewParens,
  readDecisions,
} from '../lib/bilingual';
import { keyForBilingual } from './cache-keys';
import { readJsonBody } from './http-helpers';
import type { Bindings } from './types';

/** Paragraphs per request, and the longest paragraph judged. */
export const BILINGUAL_MAX_TEXTS = 40;
export const BILINGUAL_MAX_CHARS = 4000;
/** Jev requests in flight per call. */
const CONCURRENCY = 6;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Clean one paragraph: KV hit, else one Jev request, else the text as-is. */
async function cleanOne(
  env: Bindings,
  text: string,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<string> {
  const parens = findHebrewParens(text);
  if (parens.length === 0) return text;
  const key = keyForBilingual(await sha256Hex(text));
  const hit = env.CACHE ? await env.CACHE.get(key) : null;
  if (hit !== null) return hit;
  try {
    const res = await runJev(env, {
      state: { paragraph: text },
      questions: buildBilingualQuestions(text, parens),
      tag: 'bilingual',
      attribution: { kind: 'hebraize' },
    });
    const out = applyBilingual(text, parens, readDecisions(text, parens, res.answers));
    if (env.CACHE) waitUntil(env.CACHE.put(key, out, { expirationTtl: 60 * 60 * 24 * 365 }));
    return out;
  } catch (err) {
    console.warn(`[bilingual] jev failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
    return text;
  }
}

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
    const out: string[] = [...(texts as string[])];
    const todo = out.map((_t, i) => i).filter((i) => out[i].length <= BILINGUAL_MAX_CHARS);
    const waitUntil = (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
    let next = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < todo.length) {
          const i = todo[next++];
          out[i] = await cleanOne(c.env, out[i], waitUntil);
        }
      }),
    );
    return c.json({ texts: out });
  });
}
