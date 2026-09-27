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
import {
  buildCodificationChain,
  buildDerivation,
  cleanCodeText,
  codesForLines,
} from '../../lib/halacha/codifiers';
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

  // Halacha codes: the codifier texts behind a halacha card, from the
  // halacha-refs bundle (already cached — it grounds the codification
  // enrichment). Read-only, no LLM.
  //   nodes — every codifier ref Sefaria links to the daf, in lineage order
  //           (Rambam → Tur → Shulchan Aruch + secondary glosses).
  //   codes — with ?start=&end= (a topic's 0-indexed daf lines): only the
  //           Rambam / Tur / Shulchan Aruch refs linked to those lines, with the
  //           Mechaber's words and the Rema's glosses split apart. This is the
  //           list the halacha card shows.
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
        hebrew: cleanCodeText(r.hebrew),
        english: cleanCodeText(r.english),
        einMishpat: !!r.einMishpat,
      })),
    }));
    const start = Number.parseInt(c.req.query('start') ?? '', 10);
    const endQ = Number.parseInt(c.req.query('end') ?? '', 10);
    if (!Number.isFinite(start) || start < 0) return c.json({ tractate, page, nodes });
    const end = Number.isFinite(endQ) && endQ >= start ? endQ : start;
    const codes = codesForLines(bundle, { start, end });
    return c.json({ tractate, page, nodes, codes });
  });
}
