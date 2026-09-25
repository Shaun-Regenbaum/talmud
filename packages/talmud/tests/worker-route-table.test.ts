import { describe, expect, it } from 'vitest';
import { app } from '../src/worker/index';

// Hono matches in REGISTRATION ORDER: the first route whose pattern matches a
// request wins, and `app.use` middleware runs in the order it was added. So the
// list below — every entry of `app.routes`, method + path, in order — is part of
// the worker's behaviour, not an implementation detail.
//
// It exists so that moving routes out of index.ts into src/worker/routes/*
// cannot silently reorder, drop, or duplicate one. Moving a handler to another
// file must leave this list byte-identical.
//
// If you ADD or REMOVE a route on purpose, update this list in the same commit
// and say so in the pull request. If a diff shows up here that you did not mean
// to make, the move changed behaviour — fix the move, not the list.
const EXPECTED_ROUTES = [
  'GET /api/billing',
  'ALL /*',
  'ALL /api/*',
  'GET /api/health',
  'GET /',
  'ALL /mcp',
  'GET /api/admin/ai-gateway-test',
  'GET /api/admin/llm-settings',
  'GET /api/marks',
  'GET /api/marks/:id',
  'PUT /api/marks/:id',
  'DELETE /api/marks/:id',
  'GET /api/marks/:tractate/:page',
  'GET /api/checks/:tractate/:page',
  'GET /api/type-profiles/:tractate/:page',
  'GET /api/sage-index/:tractate/:page',
  'GET /api/bridge/:tractate/:page',
  'GET /api/spine/:tractate/:page',
  'GET /api/derivation/:tractate/:page',
  'GET /api/halacha-text/:tractate/:page',
  'GET /api/links/:tractate/:page',
  'GET /api/dependents/:id',
  'GET /api/spine-coverage/:tractate',
  'GET /api/spine-view/:tractate',
  'GET /api/statement-spine/:tractate/:page',
  'GET /api/derived-flow/:tractate/:page',
  'GET /api/run-tree/:tractate/:page/:id',
  'GET /api/daf-view/:tractate/:page',
  'GET /api/daf-runs/:tractate/:page',
  'GET /api/entity/rabbi/:slug',
  'GET /api/entity/place/:name',
  'GET /api/stale/:id/:tractate/:page',
  'POST /api/admin/workflow-warm/:tractate/:page',
  'POST /api/daf-generate/:tractate/:page',
  'POST /api/admin/rewarm/:id/:tractate/:page',
  'GET /api/enrichments',
  'GET /api/enrichments/:id',
  'PUT /api/enrichments/:id',
  'DELETE /api/enrichments/:id',
  'POST /api/run',
  'POST /api/run-sources',
  'POST /api/warm-daf',
  'GET /api/run-status/:runId',
  'GET /api/admin/recent-errors',
  'GET /api/rabbi-observations/:slug',
  'GET /api/admin/llm-cost',
  'GET /api/admin/budget',
  'POST /api/admin/budget/reset',
  'GET /api/admin/hb-probe',
  'GET /api/admin/revach-check/:tractate/:page',
  'GET /api/admin/warm-status',
  'POST /api/admin/strip-ttl',
  'GET /api/admin/cache-stats',
  'POST /api/admin/cache-gc',
  'POST /api/log',
  'GET /api/log/recent',
  'GET /api/qa/registry',
  'POST /api/qa/ask',
  'POST /api/qa/click',
  'POST /api/report',
  'GET /api/usage',
  'GET /api/usage/cost',
  'GET /api/shas-cost',
  'GET /api/usage/telemetry',
  'GET /api/usage/activity',
  'GET /api/usage/backlog',
  'GET /api/usage/health',
  'GET /api/usage/surfaces',
  'GET /api/worker-health',
  'POST /api/admin/report-dismiss',
  'GET /api/usage/daf/:tractate/:page',
  'GET /api/commentaries/:tractate/:page',
  'POST /api/commentary-translate',
  'GET /api/rabbi/:slug',
  'GET /api/references/:tractate/:page',
  'GET /api/dafyomi/:tractate/:page',
  'GET /api/context/:tractate/:page',
  'POST /api/context/match',
  'GET /api/daf/:tractate/:page',
  'POST /api/translate',
  'GET /api/admin/rabbi-slugs',
  'GET /api/sages-index',
  'GET /api/admin/enrich-rabbi/:slug',
  'GET /api/admin/rabbi-relationships/:slug',
  'GET /api/admin/rabbi-family/:slug',
  'GET /api/admin/rabbi-orientation/:slug',
  'GET /api/admin/rabbi-enrich-unified/:slug',
  'GET /api/admin/rabbi-wikidata/:slug',
  'GET /api/admin/rabbi-wiki-bio/:slug',
  'POST /api/admin/rabbi-compile/graph',
  'POST /api/admin/rabbi-compile/cohort',
  'POST /api/admin/rabbi-compile/places-index',
  'POST /api/admin/rabbi-compile/academy-roster',
  'GET /api/admin/rabbi-graph',
  'GET /api/admin/rabbi-cohort',
  'GET /api/rabbi-network',
  'GET /api/rabbi-network/:slug',
  'GET /api/admin/voice-graph/status',
  'POST /api/admin/voice-graph/step',
  'POST /api/admin/voice-graph/rebuild',
  'GET /api/admin/rabbi-places-index',
  'GET /api/admin/rabbi-academy-roster',
  'GET /api/admin/rabbi-cache-stats',
  'GET /api/region/:tractate/:page',
  'GET /api/mesorah/:tractate/:page',
  'POST /api/admin/translate-bio',
  'GET /api/yerushalmi/:tractate/:page',
  'GET /api/pasuk',
  'GET /api/pesukim/:tractate/:page',
  'POST /api/hebraize',
  'POST /api/bilingual',
  'GET /api/bilingual/glossary/:tractate/:page',
  'GET /api/admin/rabbi-enriched/:slug',
] as const;

describe('worker route table', () => {
  it('registers exactly the expected routes, in the expected order', () => {
    const actual = app.routes.map((r) => `${r.method} ${r.path}`);
    expect(actual).toEqual([...EXPECTED_ROUTES]);
  });

  it('has no accidental duplicate method+path pair', () => {
    const seen = new Map<string, number>();
    for (const r of app.routes) {
      const key = `${r.method} ${r.path}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect([...seen].filter(([, n]) => n > 1)).toEqual([]);
  });
});
