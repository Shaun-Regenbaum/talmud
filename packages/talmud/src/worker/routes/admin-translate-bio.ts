/**
 * The admin endpoint that turns a Hebrew Wikipedia lead paragraph into an
 * English bio: POST /api/admin/translate-bio.
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import { runLLM } from '@corpus/core/llm/llm';
import type { Hono } from 'hono';
import { readJsonBody } from '../http-helpers';
import { extractJsonPayload } from '../llm-helpers';
import { TRANSLATE_BIO_JSON_SCHEMA } from '../output-schemas';
import type { Bindings } from '../types';

// --- Admin: Hebrew-Wikipedia bio → English summary ----------------------
// Companion to scripts/scrape-wikipedia-rabbis.mjs. Given a Hebrew lead-
// paragraph extract from he.wikipedia and a Hebrew name, produces:
//   - canonicalEn: the rabbi's standard English name (for slug generation),
//   - bioEn:       an ≤800-char English summary matching the voice of the
//                  existing Sefaria-derived bios,
//   - aliases:     other English forms worth matching against model output.
//
// The script calls this once per page; Kimi K2.6 is the bottleneck.

const TRANSLATE_BIO_SYSTEM_PROMPT = `You are a scholar of Talmudic history and a careful translator. You will receive a short Hebrew biographical passage about one rabbi (a Tanna or Amora) copied from Hebrew Wikipedia, along with the rabbi's Hebrew name.

Produce STRICT JSON (no prose, no markdown):

{
  "canonicalEn": "The rabbi's standard English name, e.g. 'Rabbi Alexandri', 'Rav Nachman bar Yitzchak'. Use the 'Rabbi X' form for Eretz-Yisrael Amoraim and Tannaim, 'Rav X' for Babylonian Amoraim. Prefer Sefaria-style spellings (e.g. 'b.' for Hebrew 'בן', not 'ben'). Do not invent suffixes.",
  "bioEn":       "A concise English summary of the Hebrew passage, ≤800 characters, written in the third person, plain prose (no headings, no bullet points). Mirror the style of traditional Sefaria bios: start with the rabbi's name/title, then note generation/teachers/region, then any distinctive feature (e.g. 'known as an aggadist', 'famous teaching', major students). Stay faithful to the source; do not add facts the passage does not support.",
  "aliases":     ["Up to 5 alternate English spellings of the name (e.g. 'R. Alexandri', 'Rabbi Alexandrai'). Do NOT include the canonicalEn value itself. Empty array is fine if there are no obvious variants."]
}

Rules:
- If the Hebrew passage is NOT about a rabbi (list page, disambiguation, place, concept), respond with canonicalEn = "" and bioEn = "". The caller will skip non-rabbi pages.
- bioEn must be ≤800 characters. Aim for 300–500. Trim ruthlessly if the source is long.
- Use ASCII-only in canonicalEn and aliases (no Hebrew letters, no diacritics).`;

interface TranslatedBio {
  canonicalEn: string;
  bioEn: string;
  aliases: string[];
}

function validateTranslatedBio(x: unknown): x is TranslatedBio {
  if (!x || typeof x !== 'object') return false;
  const t = x as TranslatedBio;
  if (typeof t.canonicalEn !== 'string') return false;
  if (typeof t.bioEn !== 'string') return false;
  if (!Array.isArray(t.aliases)) return false;
  if (t.aliases.some((a) => typeof a !== 'string')) return false;
  return true;
}

export function registerAdminTranslateBioRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.post('/api/admin/translate-bio', async (c) => {
    if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
    const parsed = await readJsonBody<{ hebrewBio?: string; nameHe?: string; nameEn?: string }>(c, {
      error: 'invalid JSON body',
    });
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const hebrewBio = (body.hebrewBio ?? '').trim();
    const nameHe = (body.nameHe ?? '').trim();
    if (!hebrewBio) return c.json({ error: 'hebrewBio is required' }, 400);
    if (!nameHe) return c.json({ error: 'nameHe is required' }, 400);

    const userContent = [
      `Hebrew name: ${nameHe}`,
      body.nameEn ? `Existing English name (hint only): ${body.nameEn}` : null,
      '',
      'Hebrew passage:',
      hebrewBio.slice(0, 6000),
    ]
      .filter(Boolean)
      .join('\n');

    const t0 = Date.now();
    try {
      const r = await runLLM(c.env, {
        model: '@cf/moonshotai/kimi-k2.5',
        messages: [
          { role: 'system', content: TRANSLATE_BIO_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 16000,
        temperature: 0.1,
        thinking: false,
        response_format: { type: 'json_schema', json_schema: TRANSLATE_BIO_JSON_SCHEMA },
        tag: 'translate-bio',
        attribution: { kind: 'rabbi', producerId: 'translate-bio' },
      });
      const payload = r.content.trim() || extractJsonPayload({ response: r.content });
      if (!payload) return c.json({ error: 'empty payload' }, 502);
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch (err) {
        return c.json(
          { error: `non-JSON: ${String(err).slice(0, 200)}`, raw: payload.slice(0, 500) },
          502,
        );
      }
      if (!validateTranslatedBio(parsed))
        return c.json({ error: 'schema mismatch', got: parsed }, 502);
      return c.json({ ...parsed, _ms: Date.now() - t0 });
    } catch (err) {
      return c.json({ error: String(err).slice(0, 300) }, 502);
    }
  });
}
