/**
 * The daf's own sources, as the reader and API callers fetch them:
 * GET /api/references/:tractate/:page (who cites this daf),
 * GET /api/dafyomi/:tractate/:page, GET /api/context/:tractate/:page and
 * POST /api/context/match (citation context), and GET /api/daf/:tractate/:page
 * (the Sefaria page itself).
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import type { Hono } from 'hono';
import type { MatchInput } from '../../lib/context/anchor/ai-prompt';
import type { TalmudPageData } from '../../lib/sefref';
import { getDafyomiMasechet } from '../../lib/sefref/dafyomi/masechtos';
import { keyForCtxMatch, keyForReferences } from '../cache-keys';
import { aiMatchToSegments } from '../context-match';
import { collectContext, type SourceTiming } from '../context-providers';
import { readJsonBody } from '../http-helpers';
import {
  type CacheTrack,
  getDafyomiContentCached,
  getHebrewBooksDafCached,
  getSefariaPageCached,
  getSefariaSegmentsCached,
} from '../source-cache';
import type { Bindings } from '../types';

export function registerDafSourcesRoutes(app: Hono<{ Bindings: Bindings }>): void {
  /**
   * Reverse references — every source in the Sefaria corpus that links to a
   * given daf. Thin wrapper over Sefaria's /api/links/<ref> with KV caching
   * and a filtered/slimmed projection. Intended for future UI that shows
   * "who cites this daf" (e.g. Rishonim, Shulchan Aruch).
   */
  app.get('/api/references/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    const cache = c.env.CACHE;
    const cacheKey = keyForReferences(tractate, page);

    if (cache && c.req.query('refresh') !== '1') {
      const hit = await cache.get(cacheKey);
      if (hit !== null) return c.json({ ...(JSON.parse(hit) as object), _cached: true });
    }

    const ref = `${tractate} ${page}`;
    const url = `https://www.sefaria.org/api/links/${encodeURIComponent(ref)}?with_text=0`;
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) return c.json({ error: `Sefaria ${res.status}` }, 502);
      // Guard the shape: Sefaria sometimes returns an error object (not an array)
      // with a 200, which would otherwise crash the iteration below.
      const parsed = (await res.json()) as unknown;
      if (!Array.isArray(parsed)) return c.json({ error: 'Sefaria non-array links' }, 502);
      const raw = parsed as Array<{
        ref?: string;
        sourceRef?: string;
        anchorRef?: string;
        category?: string;
        collectiveTitle?: { en?: string; he?: string };
        index_title?: string;
        type?: string;
      }>;

      // Group by source work (index_title), track how many refs each has.
      const byWork = new Map<string, { title: string; category: string; refs: string[] }>();
      for (const l of raw) {
        const title = l.collectiveTitle?.en ?? l.index_title ?? 'Unknown';
        const category = l.category ?? 'Other';
        const srcRef = l.sourceRef ?? l.ref ?? '';
        if (!byWork.has(title)) byWork.set(title, { title, category, refs: [] });
        const bucket = byWork.get(title)!;
        if (srcRef && !bucket.refs.includes(srcRef)) bucket.refs.push(srcRef);
      }

      const works = Array.from(byWork.values())
        .map((w) => ({ ...w, count: w.refs.length }))
        .sort((a, b) => b.count - a.count);

      const payload = {
        daf: ref,
        totalLinks: raw.length,
        works,
        fetchedAt: new Date().toISOString(),
      };

      if (cache) {
        await cache.put(cacheKey, JSON.stringify(payload), {
          expirationTtl: 60 * 60 * 24 * 30,
        });
      }
      return c.json(payload);
    } catch (err) {
      return c.json({ error: String(err) }, 502);
    }
  });

  // Structured dafyomi.co.il study content for a daf (both amudim, all content
  // types present). Read-only: served from the committed static corpus via the
  // ASSETS binding, memoized in KV. 404s rather than fabricating when a daf
  // hasn't been ingested. Consumed by the alignment-page context workbench.
  app.get('/api/dafyomi/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    if (!getDafyomiMasechet(tractate)) {
      return c.json({ error: `tractate not ingested: ${tractate}` }, 404);
    }
    const states: Array<'hit' | 'miss'> = [];
    const data = await getDafyomiContentCached(c.env.CACHE, c.env.ASSETS, tractate, page, {
      assetOrigin: new URL(c.req.url).origin,
      refresh: c.req.query('refresh') === '1',
      allowLive: (c.env as { DAFYOMI_LIVE?: string }).DAFYOMI_LIVE !== '0',
      track: { onCache: (s) => states.push(s) },
    });
    if (!data) return c.json({ error: `no dafyomi content for ${tractate} ${page}` }, 404);
    c.header('x-cache', states[0] === 'hit' ? 'hit' : 'miss');
    return c.json(data);
  });

  // The unified external-context pool for a daf: dafyomi.co.il study content +
  // Sefaria commentary text / Mishnayot / Rishonim / halacha refs / topics, all
  // normalized to anchored ContextItems. One call powers the alignment workbench
  // and is the same pool enrichments draw from (see src/lib/context/select).
  app.get('/api/context/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    try {
      const timing: SourceTiming[] = [];
      const items = await collectContext(c.env, tractate, page, {
        assetOrigin: new URL(c.req.url).origin,
        timing,
      });
      return c.json({ tractate, page, items, timing, fetchedAt: new Date().toISOString() });
    } catch (err) {
      return c.json({ error: String(err) }, 502);
    }
  });

  // AI segment-matcher: place a batch of whole-daf context items onto the
  // segment(s) they discuss. Returns SegMatches the client applies. On-demand
  // (LLM cost); the deterministic matchers in /api/context run for free.
  /** Stable 32-bit FNV-1a of a daf's item-key set, for caching AI placements. */
  function hashMatchKeys(keys: string[]): string {
    const s = [...keys].sort().join('|');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  app.post('/api/context/match', async (c) => {
    const parsed = await readJsonBody<{ tractate?: string; page?: string; items?: MatchInput[] }>(
      c,
      {
        error: 'bad JSON body',
      },
    );
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const t = body.tractate;
    const p = body.page;
    const items = Array.isArray(body.items)
      ? body.items.filter((i) => i && typeof i.key === 'string')
      : [];
    if (!t || !p || items.length === 0)
      return c.json({ error: 'tractate, page, and items[] required' }, 400);
    const cache = c.env.CACHE;
    // The AI placement for a fixed (daf, item-set) is stable, and auto-grounding
    // re-requests it on every visit — so cache it forever (bump the version to
    // invalidate). v1 -> v2: the matcher now chunks large item sets; v1 entries
    // were matched in one oversized batch that silently left everything unplaced.
    const cacheKey = keyForCtxMatch(t, p, hashMatchKeys(items.map((i) => i.key)));
    if (cache) {
      const hit = await cache.get(cacheKey);
      if (hit !== null) {
        try {
          return c.json({ matches: JSON.parse(hit), cached: true });
        } catch {
          /* fall through */
        }
      }
    }
    try {
      const segments = await getSefariaSegmentsCached(cache, t, p);
      if (!segments) return c.json({ matches: [], warning: 'no segments for daf' });
      const matches = await aiMatchToSegments(c.env, segments.he, segments.en, items, {
        tractate: t,
        page: p,
      });
      if (cache) {
        try {
          await cache.put(cacheKey, JSON.stringify(matches));
        } catch {
          /* ignore */
        }
      }
      return c.json({ matches });
    } catch (err) {
      return c.json({ error: String(err) }, 502);
    }
  });

  app.get('/api/daf/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    const source = c.req.query('source');
    const cache = c.env.CACHE;

    // Track KV hit/miss state across all slice fetches so we can emit an
    // x-cache: hit|miss|partial header. The renderer-activity panel reads
    // this to label daf-fetch accurately, replacing a brittle client-side
    // timing heuristic that always reported "miss" because edge RTT + 3
    // parallel KV gets routinely exceeded the 50ms threshold even when
    // everything was warm.
    const states: Array<'hit' | 'miss'> = [];
    const track: CacheTrack = { onCache: (s) => states.push(s) };
    const setCacheHeader = () => {
      if (states.length === 0) {
        c.header('x-cache', 'miss');
        return;
      }
      const hits = states.filter((s) => s === 'hit').length;
      c.header('x-cache', hits === states.length ? 'hit' : hits === 0 ? 'miss' : 'partial');
    };

    if (source !== 'sefaria') {
      // HB is the primary typography source for the printed-Talmud look, but
      // we ALSO fetch Sefaria's bundle in parallel so we can overlay its
      // per-piece arrays (rashi.pieces / tosafot.pieces) onto the response.
      // The daf↔commentary anchor click feature requires Sefaria's piece
      // segmentation to align with its link-anchor refs — without pieces,
      // the inner/outer columns have no .daf-comm-piece markers and the
      // click handler can't find anything to highlight. Sefaria failure is
      // non-fatal; the daf still renders from HB without the anchor
      // feature.
      const [hb, segments, sefariaBundle] = await Promise.all([
        getHebrewBooksDafCached(cache, tractate, page, track),
        getSefariaSegmentsCached(cache, tractate, page, track),
        getSefariaPageCached(cache, tractate, page, track).catch(() => null),
      ]);
      if (hb) {
        const data: TalmudPageData = {
          mainText: { hebrew: hb.main, english: '' },
          rashi: hb.rashi
            ? {
                hebrew: hb.rashi,
                english: '',
                pieces: sefariaBundle?.rashi?.pieces,
                pieceKeys: sefariaBundle?.rashi?.pieceKeys,
              }
            : undefined,
          tosafot: hb.tosafot
            ? {
                hebrew: hb.tosafot,
                english: '',
                pieces: sefariaBundle?.tosafot?.pieces,
                pieceKeys: sefariaBundle?.tosafot?.pieceKeys,
              }
            : undefined,
        };
        setCacheHeader();
        return c.json({
          ...data,
          _source: 'hebrewbooks',
          mainSegmentsHe: segments?.he ?? [],
          mainSegmentsEn: segments?.en ?? [],
        });
      }
      if (source === 'hebrewbooks') {
        setCacheHeader();
        return c.json({ error: 'HebrewBooks fetch failed' }, 502);
      }
    }

    const [data, segments] = await Promise.all([
      getSefariaPageCached(cache, tractate, page, track),
      getSefariaSegmentsCached(cache, tractate, page, track),
    ]);
    setCacheHeader();
    if (!data) return c.json({ error: 'Sefaria fetch failed' }, 502);
    return c.json({
      ...data,
      _source: 'sefaria',
      mainSegmentsHe: segments?.he ?? [],
      mainSegmentsEn: segments?.en ?? [],
    });
  });
}
