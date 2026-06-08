// Commentary works for a daf (Sefaria links, grouped by work) + on-demand
// translation of a single comment. Extracted from index.ts as the first
// route-slice: registerCommentaryRoutes(app) wires the two endpoints, and
// fetchCommentaryWorks is re-exported for the other in-file callers.

import { Hono } from 'hono';
import type { Bindings } from './types';
import { runLLM, type LLMModelId } from '@corpus/core/llm/llm';
import { getSefariaSegmentsCached } from './source-cache';
import { keyForCommentaryWorks, keyForCommentaryText } from './cache-keys';
import { recordTelemetry, classifyError } from './telemetry';

interface CommentaryComment {
  anchorRef: string;                // e.g. "Berakhot 5a:3" or "Berakhot 5a:3:1-4"
  anchorSegIdx: number;             // zero-based index into Sefaria segments
  sourceRef: string;                // commentary's own ref, e.g. "Ramban on Berakhot 5a:3:1"
  textHe: string;
  textEn: string;
}

interface CommentaryWork {
  title: string;
  titleHe: string;
  count: number;
  comments: CommentaryComment[];
}

/** Parse the first segment number out of a Sefaria ref like "Berakhot 5a:3"
 *  or "Berakhot 5a:3:1-4". Returns zero-based index, or -1 if unparseable. */
function parseAnchorSegment(anchorRef: string): number {
  const m = anchorRef.match(/:(\d+)/);
  if (!m) return -1;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n - 1 : -1;
}

// (Rashi / Tosafot are rendered inline on the daf, but we STILL surface them
// in the picker — selecting them highlights the main-text segments they
// anchor to, and clicking a segment also highlights the gloss in the inner
// or outer column. So no work titles are filtered here.)

/** Shared fetch — returns the grouped commentary works for a daf. Cached.
 *  Used by both /api/commentaries (legacy endpoint) and the `commentary`
 *  mark/enrichment path. */
export async function fetchCommentaryWorks(
  env: Bindings,
  tractate: string,
  page: string,
  bypassCache = false,
): Promise<{ works: CommentaryWork[]; tractate: string; page: string; fetchedAt: string } | { error: string }> {
  const cache = env.CACHE;
  const cacheKey = keyForCommentaryWorks(tractate, page);
  if (cache && !bypassCache) {
    const hit = await cache.get(cacheKey);
    if (hit !== null) {
      try { return JSON.parse(hit) as { works: CommentaryWork[]; tractate: string; page: string; fetchedAt: string }; }
      catch { /* fall through to refetch */ }
    }
  }
  const ref = `${tractate} ${page}`;
  const url = `https://www.sefaria.org/api/links/${encodeURIComponent(ref)}?with_text=1`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    return { error: String(err) };
  }
  if (!res.ok) return { error: `Sefaria ${res.status}` };

  const raw = (await res.json()) as Array<{
    ref?: string;
    sourceRef?: string;
    anchorRef?: string;
    category?: string;
    collectiveTitle?: { en?: string; he?: string };
    index_title?: string;
    he?: string | string[];
    text?: string | string[];
  }>;

  const joinText = (x: string | string[] | undefined): string => {
    if (!x) return '';
    if (Array.isArray(x)) return x.map((t) => String(t ?? '')).join(' ').trim();
    return String(x).trim();
  };

  const byWork = new Map<string, CommentaryWork>();
  for (const l of raw) {
    if (l.category !== 'Commentary') continue;
    const title = l.collectiveTitle?.en ?? l.index_title ?? 'Unknown';
    const titleHe = l.collectiveTitle?.he ?? '';
    const anchorRef = l.anchorRef ?? '';
    const anchorSegIdx = parseAnchorSegment(anchorRef);
    if (anchorSegIdx < 0) continue;
    const comment: CommentaryComment = {
      anchorRef,
      anchorSegIdx,
      sourceRef: l.sourceRef ?? l.ref ?? '',
      textHe: joinText(l.he),
      textEn: joinText(l.text),
    };
    let work = byWork.get(title);
    if (!work) {
      work = { title, titleHe, count: 0, comments: [] };
      byWork.set(title, work);
    }
    work.comments.push(comment);
    work.count++;
  }
  // Sort works by count desc so popular ones (Meiri, Ramban, Rashba…) lead.
  const works = Array.from(byWork.values()).sort((a, b) => b.count - a.count);

  const payload = { works, tractate, page, fetchedAt: new Date().toISOString() };
  if (cache) {
    await cache.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 * 60 * 24 * 30 });
  }
  return payload;
}

// --- Commentary translation ----------------------------------------------
// On-demand English translation of a single commentary comment (used when
// Sefaria has no `text` for it, which is common for Rishonim). Kimi K2.5 is
// the primary translator (no thinking, fast); Gemma-4 26B is the fallback.
// Results are cached forever per Sefaria sourceRef.

interface CommentaryTranslateBody {
  sourceRef: string;
  textHe: string;
  tractate?: string;
  page?: string;
  anchorSegIdx?: number;
}

const COMMENTARY_TX_SYSTEM =
  'You are a scholarly translator of rabbinic commentary on the Talmud. Translate the given Hebrew/Aramaic commentary text into clear, accurate English. ' +
  'Output ONLY the translation — no preamble, no explanation, no quotation marks around the whole thing. ' +
  'Match the register of standard academic Talmud editions (Soncino / Koren-Steinsaltz). Preserve technical terminology where standard ("Mishnah", "Gemara", "Tanna"). ' +
  'The commentary glosses a specific passage of the daf — use the provided source segment to anchor pronouns and references, but translate the commentary (not the source).';

/** Register the commentary routes on the worker app. */
export function registerCommentaryRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.get('/api/commentaries/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    const bypassCache = c.req.query('refresh') === '1';
    const result = await fetchCommentaryWorks(c.env, tractate, page, bypassCache);
    if ('error' in result) return c.json(result, 502);
    return c.json({ ...result, _cached: !bypassCache });
  });

  app.post('/api/commentary-translate', async (c) => {
    let body: CommentaryTranslateBody;
    try { body = await c.req.json<CommentaryTranslateBody>(); }
    catch { return c.json({ error: 'Invalid JSON body' }, 400); }

    const sourceRef = (body.sourceRef ?? '').trim();
    const textHe = (body.textHe ?? '').trim();
    if (!sourceRef || !textHe) return c.json({ error: 'Missing sourceRef or textHe' }, 400);

    const cache = c.env.CACHE;
    const cacheKey = keyForCommentaryText(sourceRef);
    const t0 = Date.now();
    if (cache) {
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        return c.json({ translation: cached, cached: true });
      }
    }
    if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

    // Pull the matching daf segment as bilingual anchor context.
    let segHe = '';
    let segEn = '';
    if (body.tractate && body.page && typeof body.anchorSegIdx === 'number') {
      const segments = await getSefariaSegmentsCached(cache, body.tractate, body.page);
      if (segments && body.anchorSegIdx >= 0 && body.anchorSegIdx < segments.he.length) {
        segHe = segments.he[body.anchorSegIdx] ?? '';
        segEn = segments.en[body.anchorSegIdx] ?? '';
      }
    }

    // Strip HTML from the commentary text (Sefaria sometimes embeds <b>/<i>).
    const cleanHe = textHe.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const userParts: string[] = [];
    if (segHe) {
      userParts.push(
        `Daf segment this commentary anchors to:\nHebrew/Aramaic: ${segHe}` +
        (segEn ? `\nEnglish: ${segEn}` : ''),
      );
    }
    userParts.push(`Commentary source: ${sourceRef}`);
    userParts.push(`Commentary text (translate this):\n${cleanHe}`);

    const models: Array<{ id: LLMModelId; label: string }> = [
      { id: '@cf/moonshotai/kimi-k2.5',        label: 'kimi-k2.5'   },
      { id: '@cf/google/gemma-4-26b-a4b-it',   label: 'gemma-4-26b' },
    ];

    const attempts: string[] = [];
    for (const m of models) {
      try {
        const r = await runLLM(c.env, {
          model: m.id,
          messages: [
            { role: 'system', content: COMMENTARY_TX_SYSTEM },
            { role: 'user', content: userParts.join('\n\n') },
          ],
          max_tokens: 800,
          temperature: 0.2,
          thinking: false,
          tag: 'commentary-translate',
          attribution: { kind: 'translate', ...(body.tractate && body.page ? { tractate: body.tractate, page: body.page } : {}) },
        });
        const translation = r.content.trim().replace(/^["\']|["\']$/g, '');
        if (!translation) { attempts.push(`${m.label}: empty`); continue; }
        if (cache) {
          await cache.put(cacheKey, translation, { expirationTtl: 60 * 60 * 24 * 365 });
        }
        recordTelemetry(c, { endpoint: 'translate', tractate: body.tractate, page: body.page, cache_hit: false, model: m.label, ms: Date.now() - t0, ok: true });
        return c.json({ translation, cached: false, _model: m.label });
      } catch (err) {
        attempts.push(`${m.label}: ${String(err).slice(0, 200)}`);
      }
    }
    recordTelemetry(c, { endpoint: 'translate', tractate: body.tractate, page: body.page, cache_hit: false, ms: Date.now() - t0, ok: false, error_kind: classifyError(attempts.join(' ')) });
    return c.json({ error: 'All translation models failed', attempts }, 502);
  });
}
