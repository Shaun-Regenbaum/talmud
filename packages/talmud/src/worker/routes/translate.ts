/**
 * The word-level translation endpoint: POST /api/translate, plus the Sefaria
 * English context, lexicon and alignment helpers only it uses.
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import { type LLMModelId, runLLM } from '@corpus/core/llm/llm';
import type { Hono } from 'hono';
import { keyForTranslate } from '../cache-keys';
import { stripHtmlServer } from '../html-text';
import {
  getSefariaPageCached,
  getSefariaSegmentsCached,
  type SefariaSegments,
} from '../source-cache';
import { classifyError, recordTelemetry } from '../telemetry';
import type { Bindings } from '../types';
import { lookupGloss } from '../word-glosses';

/**
 * Fetch and KV-cache the Sefaria English translation for a daf. Used as
 * context for word-level translations.
 */
async function getSefariaEnglishContext(
  tractate: string,
  page: string,
  cache: KVNamespace | undefined,
): Promise<string> {
  const cacheKey = `sefaria-en:${tractate}:${page}`;
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached !== null) return cached;
  }
  const data = await getSefariaPageCached(cache, tractate, page);
  if (!data) return '';
  const text = [data.mainText.english, data.rashi?.english ?? '', data.tosafot?.english ?? '']
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 4000);
  if (cache) {
    await cache.put(cacheKey, text, { expirationTtl: 60 * 60 * 24 * 30 });
  }
  return text;
}

interface TranslateBody {
  word: string;
  tractate: string;
  page: string;
  /** ~30 words of Hebrew/Aramaic immediately before the click, from the rendered daf. */
  hebrewBefore?: string;
  /** ~30 words of Hebrew/Aramaic immediately after the click, from the rendered daf. */
  hebrewAfter?: string;
  /** Client-resolved Sefaria segment index (from `data-seg` on the clicked
   *  .daf-word span). When supplied, the server skips its own fuzzy alignment
   *  and fetches the aligned Hebrew+English pair directly. */
  segIdx?: number;
  /** Target language for the gloss — follows the reader's UI language. 'en'
   *  (default) translates into English; 'he' translates the Aramaic/Hebrew of
   *  the daf into modern Hebrew. */
  lang?: 'en' | 'he';
}

// Aggressive Hebrew normalizer for substring alignment — strips nikkud,
// cantillation, geresh/gershayim, all punctuation, and collapses whitespace.
function normalizeHeForMatch(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ') // strip HTML tags
    .replace(/[֑-ׇ]/g, '') // nikkud + cantillation
    .replace(/[^֐-׿\s]/g, ' ') // keep only Hebrew letters + whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Given the user's Hebrew snippet (the word plus its immediate surroundings),
 * return the index of the Sefaria segment whose Hebrew contains it, or -1.
 * Matches progressively shorter prefixes of the snippet until something hits.
 */
function findAlignedSegment(snippet: string, segments: SefariaSegments): number {
  const needle = normalizeHeForMatch(snippet);
  if (!needle || segments.he.length === 0) return -1;
  const normSegs = segments.he.map(normalizeHeForMatch);
  // Try increasingly loose matches: first the full snippet, then trimmed
  // halves, down to a 3-word minimum. Whichever hits first wins.
  const words = needle.split(' ').filter(Boolean);
  for (let take = words.length; take >= 3; take--) {
    for (let start = 0; start + take <= words.length; start++) {
      const probe = words.slice(start, start + take).join(' ');
      for (let i = 0; i < normSegs.length; i++) {
        if (normSegs[i].includes(probe)) return i;
      }
    }
  }
  return -1;
}

// djb2 short hash for cache key suffix — stable, tiny, fine for context hashing.
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Fetch Sefaria's Lexicon entries for a Hebrew/Aramaic word (BDB, Jastrow,
 * Klein, etc.). Returns a single plain-text summary suitable to inline into
 * an LLM prompt. Cached per-word for a year.
 */
async function getSefariaLexicon(word: string, cache: KVNamespace | undefined): Promise<string> {
  const w = word.trim();
  if (!w) return '';
  const key = `lexicon:${w}`;
  if (cache) {
    const hit = await cache.get(key);
    if (hit !== null) return hit;
  }
  try {
    const url = `https://www.sefaria.org/api/words/${encodeURIComponent(w)}?lookup_ref=&never_split=1&always_split=0`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      if (cache) await cache.put(key, '', { expirationTtl: 60 * 60 * 24 * 7 });
      return '';
    }
    const entries = (await res.json()) as Array<{
      headword?: string;
      parent_lexicon?: string;
      content?: { senses?: Array<{ definition?: string }>; morphology?: string };
      morphology?: string;
    }>;
    const summaries: string[] = [];
    for (const e of entries.slice(0, 4)) {
      const dict = e.parent_lexicon ?? 'lexicon';
      const head = e.headword ?? w;
      const senses = (e.content?.senses ?? []).map((s) => s.definition ?? '').filter(Boolean);
      const clean = senses
        .map((s) => stripHtmlServer(s))
        .filter(Boolean)
        .slice(0, 2)
        .join(' | ');
      if (clean) summaries.push(`[${dict}] ${head}: ${clean}`);
    }
    const out = summaries.join('\n').slice(0, 900);
    if (cache) await cache.put(key, out, { expirationTtl: 60 * 60 * 24 * 365 });
    return out;
  } catch {
    return '';
  }
}

// Talmudic-idiom guidance shared by the word and phrase system prompts.
// Calls out the common cases where the plain Hebrew meaning mis-translates the
// Talmudic usage (e.g. רישא = "first clause", not "head").
const TRANSLATE_IDIOM_GUIDANCE =
  'CRITICAL: translate for Talmudic usage, not literal Hebrew. Many words have a specialized legal/discursive sense:\n' +
  '  - רישא → "first clause" (of the Mishnah/statement), not "head"\n' +
  '  - סיפא → "last clause"\n' +
  '  - קמא → "the first (authority/view)"; בתרא → "the later (authority/view)"\n' +
  '  - בשלמא → "granted" (rhetorical concession)\n' +
  '  - מיגו → "since-they-could-have" (legal argumentation principle)\n' +
  '  - תיובתא → "refutation"\n' +
  '  - קל וחומר → "a fortiori" (not "light and heavy")\n' +
  '  - גזירה שווה → "analogical derivation"\n' +
  '  - גברא / חפצא → "person" / "object" in technical legal sense\n' +
  '  - דתנן / דתניא / דתני → "as the Mishnah/Baraita teaches"\n' +
  'When the literal Hebrew and the Talmudic usage differ, pick the Talmudic usage unless the surrounding passage clearly demands the literal meaning. Use the aligned Hebrew+English segment from Sefaria as your primary anchor for the local argument.\n' +
  '\n' +
  'PRIORITY: if the aligned Sefaria English segment contains a clear English gloss for this exact word, return that exact gloss verbatim. The aligned segment is the authoritative anchor for the local sense.\n' +
  '\n' +
  'MORPHOLOGY: preserve number and tense.\n' +
  '  - Hebrew plural suffixes -ות / -ים translate as English plurals (שעות = "hours" not "watch"; ימים = "days"; בתים = "houses").\n' +
  '  - Aramaic plural suffixes -ין / -י / -ן translate as plurals.\n' +
  '  - Conjugated verbs keep their tense/person (אמר = "said"; אמרי = "they say"; יאמר = "he will say").\n' +
  '  - Construct forms (smichut) translate as "X of Y" or as a compound.';

export function registerTranslateRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.post('/api/translate', async (c) => {
    let body: TranslateBody;
    try {
      body = await c.req.json<TranslateBody>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const word = (body.word ?? '').trim();
    const tractate = (body.tractate ?? '').trim();
    const page = (body.page ?? '').trim();
    const hebrewBefore = (body.hebrewBefore ?? '').trim();
    const hebrewAfter = (body.hebrewAfter ?? '').trim();
    const targetLang: 'en' | 'he' = body.lang === 'he' ? 'he' : 'en';
    if (!word || !tractate || !page) {
      return c.json({ error: 'Missing word/tractate/page' }, 400);
    }

    const cache = c.env.CACHE;
    // Context-aware cache key: identical word in two different passages now gets
    // two different cached answers (previously they collided).
    const ctxHash =
      hebrewBefore || hebrewAfter ? `:${shortHash(`${hebrewBefore}${hebrewAfter}`)}` : '';
    // v3: DeepSeek V4 Flash primary + hardcoded dict short-circuit +
    // morphology-aware prompt. Bumped from v2 to invalidate stale Gemma-era
    // translations (Gemma 4 26B was returning e.g. שעות → "watches").
    const cacheKey = keyForTranslate(tractate, page, word, ctxHash, targetLang);
    const t0 = Date.now();
    if (cache) {
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        recordTelemetry(c, {
          endpoint: 'translate',
          tractate,
          page,
          cache_hit: true,
          ms: Date.now() - t0,
          ok: true,
        });
        return c.json({ translation: cached, cached: true });
      }
    }

    // Hardcoded dict for high-frequency Talmudic words whose gloss is
    // context-free (Aramaic discourse markers, Mishnaic structural terms,
    // common Hebrew nouns small models botch the plural of). Skips the LLM
    // entirely and caches the result alongside LLM-produced ones.
    // The hardcoded dict glosses are English; only short-circuit for English
    // targets. Hebrew targets always go through the model (no Hebrew dict).
    const dictGloss = targetLang === 'en' ? lookupGloss(word) : undefined;
    if (dictGloss) {
      if (cache) {
        await cache.put(cacheKey, dictGloss, { expirationTtl: 60 * 60 * 24 * 30 });
      }
      recordTelemetry(c, {
        endpoint: 'translate',
        tractate,
        page,
        cache_hit: false,
        model: 'dict',
        ms: Date.now() - t0,
        ok: true,
      });
      return c.json({ translation: dictGloss, cached: false, _model: 'dict' });
    }

    if (!c.env.AI) {
      return c.json({ error: 'AI binding not available' }, 503);
    }

    // Resolve the Sefaria-aligned segment. Prefer the `segIdx` the client
    // resolved from `data-seg` on the clicked .daf-word — that uses the same
    // alignment pass the /align page shows, with abbreviation expansion etc.
    // Fall back to server-side substring matching on (hebrewBefore+word+hebrewAfter)
    // if the client didn't provide an index.
    const segments = await getSefariaSegmentsCached(cache, tractate, page);
    let alignedSegIdx = -1;
    if (segments) {
      if (typeof body.segIdx === 'number' && body.segIdx >= 0 && body.segIdx < segments.he.length) {
        alignedSegIdx = body.segIdx;
      } else if (hebrewBefore || hebrewAfter) {
        alignedSegIdx = findAlignedSegment(`${hebrewBefore} ${word} ${hebrewAfter}`, segments);
      }
    }
    const alignedHe = alignedSegIdx >= 0 ? segments!.he[alignedSegIdx] : '';
    const alignedEn = alignedSegIdx >= 0 ? segments!.en[alignedSegIdx] : '';

    // Fallback English blob ONLY when the client didn't send surrounding context
    // (preserves back-compat with any old client that hasn't redeployed yet).
    let fallbackEnglish = '';
    if (!hebrewBefore && !hebrewAfter && alignedSegIdx < 0) {
      try {
        fallbackEnglish = await getSefariaEnglishContext(tractate, page, cache);
      } catch (err) {
        console.warn('[translate] fallback Sefaria context fetch failed:', err);
      }
    }

    // Sefaria Lexicon — authoritative BDB/Jastrow definitions for the word.
    // Cached per-word for a year (lexicons change rarely).
    const lexiconContext = await getSefariaLexicon(word, cache).catch((err) => {
      console.warn('[translate] lexicon fetch failed:', err);
      return '';
    });

    const wordCount = word.split(/\s+/).filter(Boolean).length;
    const isPhrase = wordCount > 1;
    const enSystem = isPhrase
      ? 'You translate short Hebrew/Aramaic phrases from the Talmud into English. Return ONLY the English translation — one concise sentence at most, faithful to the context. No quotation marks, no explanation, no prefix, no reasoning.\n\n'
      : 'You translate single Hebrew or Aramaic words from the Talmud into English. Return ONLY the English translation — a single word or short phrase, no quotation marks, no explanation, no punctuation. If the word is a proper name (a Rabbi or place), return the conventional English rendering.\n\n';
    const heSystem = isPhrase
      ? 'You translate short Talmudic Aramaic/Hebrew phrases into clear modern Hebrew (עברית מודרנית) so an Israeli reader can understand them. Return ONLY the Hebrew translation — one concise sentence at most, faithful to the context. No quotation marks, no explanation, no prefix, no reasoning.\n\n'
      : 'You translate single Talmudic Aramaic or Hebrew words into clear modern Hebrew (עברית מודרנית) so an Israeli reader can understand them. Return ONLY the Hebrew translation — a single word or short phrase, no quotation marks, no explanation, no punctuation. If the word is a proper name (a Rabbi or place), return its conventional Hebrew form.\n\n';
    const system = (targetLang === 'he' ? heSystem : enSystem) + TRANSLATE_IDIOM_GUIDANCE;

    // DeepSeek V4 Flash primary (frontier-adjacent Hebrew morphology at
    // $0.14/$0.28 per 1M; reasoning auto-disabled in llm.ts for low latency).
    // Kimi K2.5 thinking fallback when DeepSeek returns empty or errors.
    const translateModels: Array<{ id: LLMModelId; label: string; kimi?: boolean }> = [
      { id: 'openrouter/deepseek/deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { id: '@cf/moonshotai/kimi-k2.5', label: 'kimi-k2.5', kimi: true },
    ];

    const attempts: string[] = [];
    for (const m of translateModels) {
      try {
        const userParts: string[] = [];

        // 1. Sefaria-aligned segment (primary context — Hebrew + English side by side).
        if (alignedHe && alignedEn) {
          userParts.push(
            `Aligned Sefaria segment (the block of the daf this ${isPhrase ? 'phrase' : 'word'} sits in):\nHebrew/Aramaic: ${alignedHe}\nEnglish:        ${alignedEn}`,
          );
        } else if (fallbackEnglish) {
          userParts.push(
            `Passage context (English translation of the surrounding daf):\n${fallbackEnglish}`,
          );
        }

        // 2. Surrounding rendered-daf text — ±N words around the user's selection.
        //    Anchors the request to a specific position on the page.
        if (hebrewBefore || hebrewAfter) {
          userParts.push(
            `On-page surrounding text (from the rendered daf, immediately around the selection):\n…${hebrewBefore} «${word}» ${hebrewAfter}…`,
          );
        }

        // 3. Lexicon (authoritative dictionary entries).
        if (lexiconContext) {
          userParts.push(
            `Lexicon definitions (from Sefaria's BDB/Jastrow/Klein):\n${lexiconContext}`,
          );
        }

        // 4. The target.
        userParts.push(`${isPhrase ? 'Phrase' : 'Word'} to translate: ${word}`);

        const r = await runLLM(c.env, {
          model: m.id,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userParts.join('\n\n') },
          ],
          max_tokens: m.kimi ? 400 : isPhrase ? 120 : 30,
          temperature: 0.1,
          thinking: false,
          tag: 'translate',
          attribution: { kind: 'translate', tractate, page },
        });
        const translation = r.content.trim().replace(/^["']|["']$/g, '');
        if (!translation) {
          attempts.push(`${m.label}: empty response`);
          continue;
        }

        if (cache) {
          await cache.put(cacheKey, translation, { expirationTtl: 60 * 60 * 24 * 30 });
        }
        recordTelemetry(c, {
          endpoint: 'translate',
          tractate,
          page,
          cache_hit: false,
          model: m.label,
          ms: Date.now() - t0,
          ok: true,
        });
        return c.json({ translation, cached: false, _model: m.label });
      } catch (err) {
        attempts.push(`${m.label}: ${String(err).slice(0, 200)}`);
        console.warn(`[translate] ${m.label} failed:`, err);
      }
    }

    recordTelemetry(c, {
      endpoint: 'translate',
      tractate,
      page,
      cache_hit: false,
      ms: Date.now() - t0,
      ok: false,
      error_kind: classifyError(attempts.join(' ')),
    });
    return c.json({ error: 'All translation models failed', attempts }, 502);
  });
}
