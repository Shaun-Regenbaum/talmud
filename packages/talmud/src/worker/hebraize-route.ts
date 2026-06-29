/**
 * Hebraize route slice — `registerHebraizeRoutes(app)` wires POST /api/hebraize,
 * the LLM pass that converts parenthesized transliterations in English prose to
 * Hebrew script (the long tail the static dict in src/client/hebraize.ts can't
 * cover). Extracted verbatim from index.ts as the first step of splitting that
 * file; the prompt + the two pure helpers (split/​sanitize) move with it.
 */

import { runLLM } from '@corpus/core/llm/llm';
import type { Hono } from 'hono';
import { stripEchoParens } from '../client/hebraize';
import { keyForHebraize } from './cache-keys';
import { readJsonBody } from './http-helpers';
import type { Bindings } from './types';

// LLM-driven hebraize pass: takes English text with parenthesized
// transliterations of Hebrew/Aramaic terms and returns the same text with
// each parenthetical converted to Hebrew script. Catches the long tail the
// static dict in src/client/hebraize.ts can't cover (composite phrases,
// slash-separated alternatives, unusual academic spellings). Gemma is
// cheap and fast (~2s, ~$0.0002 per call). KV-cached by SHA-256 of input
// + the gateway's prompt cache double-buffers — repeat calls are free.
const HEBRAIZE_LLM_SYSTEM_PROMPT = `You are a hebraizer. You receive English (with embedded transliterations of Hebrew or Aramaic terms inside parentheses) and return the SAME English text with EACH parenthesized transliteration replaced by the Hebrew script equivalent.

Rules:
- ONLY change content inside parentheses. Leave everything else untouched, character for character.
- Inside parens: if the content is a transliteration of a Hebrew/Aramaic term (academic or Sefaria-style), output the Hebrew. Examples:
  - (kapara) → (כפרה)
  - (ve-lo zu bilvad) → (ולא זו בלבד)
  - (geder/gezeirah) → (גדר/גזירה)
  - (ha-ashmurah ha-rishonah) → (האשמורה הראשונה)
  - (haqtarat ḥalavim ve-evarim) → (הקטרת חלבים ואיברים)
  - (ve-lo zu bilvad... ella kol mah she-amru Ḥakhamim) → (ולא זו בלבד... אלא כל מה שאמרו חכמים)
- If the parens already contain Hebrew, leave them as-is.
- If the parens contain a non-transliteration (e.g. an English aside, a year, a verse reference like "Deut 6:7", an English gloss), leave them as-is.
- Output ONLY the transformed text. No prose, no explanation, no markdown fences. Preserve all whitespace, punctuation, line breaks exactly.`;

/** Sanitize the hebraize LLM's output before it is cached or returned. The
 *  model is told to leave English glosses alone and only convert
 *  transliterations, but even a capable model occasionally over-translates a
 *  Form B gloss — turning `מעשה (action)` into `מעשה (מעשה)` or `רבי יהודה
 *  הנשיא (Rabbi Yehuda HaNasi)` into `רבי יהודה הנשיא (רבי יהודה הנשיא)`. Those
 *  show up as visible echoes on the daf. `stripEchoParens` is deterministic
 *  and collapses exactly `X (X)`, so running it here guarantees the model can
 *  never leak an echo regardless of which model is wired in. */
export function sanitizeHebraizeOutput(text: string): string {
  return stripEchoParens(text);
}

/** Split a string into `{ leading, core, trailing }` whitespace segments.
 *  Callers strip the outer whitespace before hashing / sending to the LLM
 *  (whose response is trimmed) and reattach `leading` + result + `trailing`
 *  on the way out. This matters for the per-slice render path in
 *  HebraizedWithRabbis: each text slice between rabbi-link buttons carries
 *  the single space that sits next to the button, and losing it produces
 *  "Rabbi Amireciting" / "thatRabbi Ami" in rendered prose. */
export function splitOuterWhitespace(text: string): {
  leading: string;
  core: string;
  trailing: string;
} {
  if (!text) return { leading: '', core: '', trailing: '' };
  const leading = /^\s*/.exec(text)?.[0] ?? '';
  if (leading.length === text.length) {
    return { leading: text, core: '', trailing: '' };
  }
  const trailing = /\s*$/.exec(text)?.[0] ?? '';
  return {
    leading,
    core: text.slice(leading.length, text.length - trailing.length),
    trailing,
  };
}

export function registerHebraizeRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.post('/api/hebraize', async (c) => {
    if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
    const parsed = await readJsonBody<{ text?: string }>(c, { error: 'bad json' });
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const text = body.text ?? '';
    if (!text) return c.json({ hebraized: '', _empty: true });
    if (text.length > 8000) return c.json({ error: 'text too long (max 8000 chars)' }, 413);

    const { leading, core, trailing } = splitOuterWhitespace(text);
    if (!core) return c.json({ hebraized: text, _empty: true });
    if (!/\([^)]+\)/.test(core)) return c.json({ hebraized: text, _noop: true });

    const cache = c.env.CACHE;
    // Hash the trimmed CORE so slices that differ only in surrounding
    // whitespace share a cache entry. Surrounding whitespace is reattached on
    // every return path below.
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(core));
    const hash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    // v2: bumped when the primary model switched Gemma -> DeepSeek and the
    // echo-strip guard was added. Old v1 entries (which can hold Gemma echoes)
    // are abandoned rather than re-cleaned.
    const key = keyForHebraize(hash);
    if (cache) {
      const hit = await cache.get(key);
      if (hit) return c.json({ hebraized: leading + hit + trailing, _cached: true });
    }

    try {
      const r = await runLLM(c.env, {
        // DeepSeek follows the "only convert transliterations, leave English
        // glosses alone" rule far more reliably than the small Gemma model that
        // used to run here (which over-translated glosses into echoes). Gemma
        // stays as a cheap local fallback if the gateway/OpenRouter is down.
        model: 'openrouter/deepseek/deepseek-v4-flash',
        fallback: ['@cf/google/gemma-4-26b-a4b-it'],
        messages: [
          { role: 'system', content: HEBRAIZE_LLM_SYSTEM_PROMPT },
          { role: 'user', content: core },
        ],
        max_tokens: Math.min(4096, Math.ceil(core.length * 1.5) + 256),
        temperature: 0,
        tag: 'hebraize',
        attribution: { kind: 'hebraize' },
      });
      // Guard the model output: collapse any `X (X)` echo the model emitted so a
      // mistranslated gloss can never reach the cache or the UI (see
      // sanitizeHebraizeOutput).
      const out = sanitizeHebraizeOutput(r.content.trim());
      if (!out) return c.json({ error: 'empty response', text }, 502);
      if (cache) {
        c.executionCtx.waitUntil(cache.put(key, out, { expirationTtl: 60 * 60 * 24 * 365 }));
      }
      return c.json({ hebraized: leading + out + trailing });
    } catch (err) {
      return c.json({ error: String(err).slice(0, 300) }, 502);
    }
  });
}
