/**
 * The two halacha reads for a daf: GET /api/derivation/:tractate/:page (which
 * gemara sources a codified ruling derives from) and
 * GET /api/halacha-text/:tractate/:page (the codifier texts themselves, in
 * lineage order). Both are deterministic reads over already-cached bundles.
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import type { Hono } from 'hono';
import { buildCodificationChain, buildDerivation } from '../../lib/halacha/codifiers';
import { stripHtmlServer } from '../html-text';
import { getCodeSourcesCached, getHalachaRefsCached } from '../source-cache';
import type { Bindings } from '../types';

export function registerHalachaRoutes(app: Hono<{ Bindings: Bindings }>): void {
  // Halacha "where it comes from": the gemara sources a codified ruling derives
  // from. Deterministic — reverse Sefaria /api/related on the code ref, classified
  // + deduped by buildDerivation, with the current daf marked. Read-only, no LLM.
  // Accepts one or more `ref` query params (the codifier refs the card already
  // holds), merges their sources.
  app.get('/api/derivation/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    // Cap the ref count: `ref` is an unbounded query param, and a cache MISS turns
    // each into a Sefaria subrequest — an unbounded `Promise.all` over them is a
    // subrequest-exhaustion / DoS vector on this public GET. A daf's halacha card
    // sends only its handful of codifier refs, so 50 is far above real use.
    const refs = (c.req.queries('ref') ?? []).slice(0, 50);
    if (refs.length === 0) return c.json({ sources: [] });
    const linkLists = await Promise.all(refs.map((r) => getCodeSourcesCached(c.env.CACHE, r)));
    const sources = buildDerivation(linkLists.flat(), { tractate, page });
    return c.json({ sources });
  });

  // Halacha SOURCE TEXTS: the actual codifier text behind the codification card,
  // grouped into the deterministic codifier lineage (Rambam → Tur → Shulchan Aruch
  // + secondary glosses). The full Hebrew/English is ALREADY cached in the
  // halacha-refs bundle (it grounds the codification enrichment) — this only
  // surfaces it for the reader. Read-only, no LLM. HTML stripped for display; the
  // cached bundle (and the grounding prompt) keep the raw markup.
  app.get('/api/halacha-text/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
    const bundle = await getHalachaRefsCached(c.env.CACHE, tractate, page).catch(() => undefined);
    const nodes = buildCodificationChain(bundle, { includeSecondary: true }).map((n) => ({
      id: n.id,
      label: n.label,
      short: n.short,
      tier: n.tier,
      einMishpat: n.einMishpat,
      refs: n.refs.map((r) => ({
        ref: r.ref,
        hebrew: stripHtmlServer(r.hebrew ?? ''),
        english: stripHtmlServer(r.english ?? ''),
        einMishpat: !!r.einMishpat,
      })),
    }));
    return c.json({ tractate, page, nodes });
  });
}
