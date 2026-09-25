/**
 * Two daf-scoped reads that join the cached argument skeleton to the rabbi
 * records: GET /api/region/:tractate/:page (Israel/Bavel distribution and
 * migration) and GET /api/mesorah/:tractate/:page (chain of tradition).
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import {
  keyForAnalyzeSkeleton,
  keyForMesorah,
  keyForRabbiGraph,
  keyForRegion,
} from '../cache-keys';
import { kvGetJSONAs } from '../kv-json';
import { rabbiGraphBlobShape } from '../kv-shapes';
import { resolveRabbiByName } from '../rabbi-places';
import type { Bindings } from '../types';
import { type RabbiGraphBlob, readEnriched } from './rabbi-admin';

interface DafSkeleton {
  summary: string;
  sections: Array<{
    title: string;
    summary: string;
    excerpt: string;
    startSegIdx?: number;
    endSegIdx?: number;
    rabbiNames: string[];
  }>;
}

/**
 * Both routes below walk `sections`, so a value without one cannot be joined to
 * anything and is answered the way a skeleton that was never computed is
 * answered - where until now it took the handler down with a 500.
 *
 * A section's own fields are NOT checked, deliberately. Nothing writes
 * `analyze-skel:v2:` any more: the /api/analyze pass that produced these is
 * gone, so every stored skeleton is a model-made artifact that cannot be
 * remade. Discarding a whole daf over one section missing `rabbiNames` would
 * be permanent, so the two loops below default it instead.
 */
const dafSkeletonShape = z.looseObject({ sections: z.array(z.looseObject({})) });

/** The two computed views, served back with a `_cached` flag added. */
const cachedViewShape = z.looseObject({});

// --- Daf-scoped: Region (Israel/Bavel) + Migration ----------------------
// First-pass endpoint reads the cached argument skeleton's rabbiNames per
// section, resolves to slugs, joins to rabbi-enriched:v1:{slug}'s region/
// places fields, returns distribution + migration indicators. Pure KV
// joins, no AI. Cached at region:v1:{tractate}:{page}.

interface RegionSagePerSection {
  slug: string | null;
  name: string;
  region: 'israel' | 'bavel' | 'mixed' | null;
  places: string[];
  migrated: boolean;
}

interface RegionFirstPass {
  generatedAt: string;
  totalNamed: number;
  resolved: number;
  distribution: { israel: number; bavel: number; mixed: number; unknown: number };
  migrated: Array<{ slug: string; name: string; places: string[] }>;
  sections: Array<{
    title: string;
    sages: RegionSagePerSection[];
  }>;
  // Sages on the daf with no rabbi-enriched record yet (workflow gap).
  unenriched: string[];
}

// Heuristic — a sage with places spanning both regions is a likely migrant.
// Knowingly conservative: places like "Tiberias" + "Sura" are clear yes; a
// single ambiguous place like "Eretz Yisrael" doesn't trigger.
const ISRAEL_PLACES = new Set([
  'Tiberias',
  'Sepphoris',
  'Tzipori',
  'Caesarea',
  'Yavneh',
  'Usha',
  'Lod',
  'Bnei Brak',
  'Jerusalem',
  'Eretz Yisrael',
  'Galilee',
  'Judea',
]);
const BAVEL_PLACES = new Set([
  'Sura',
  'Pumbedita',
  'Nehardea',
  'Mehoza',
  'Naresh',
  'Mata Mehasya',
  'Babylonia',
  'Pum Nahara',
]);

function inferMigration(places: string[]): boolean {
  let inIsrael = false;
  let inBavel = false;
  for (const p of places) {
    if (ISRAEL_PLACES.has(p)) inIsrael = true;
    if (BAVEL_PLACES.has(p)) inBavel = true;
  }
  return inIsrael && inBavel;
}

// --- Daf-scoped: Mesorah / chain-of-tradition ---------------------------
// First-pass walks rabbi-graph:v1's primaryTeacher up to depth N for every
// sage on the daf. Cached at mesorah:v1:{tractate}:{page}.

interface MesorahChainStep {
  slug: string;
  canonical: string;
  canonicalHe: string;
  generation: string | null;
}
interface MesorahFirstPass {
  generatedAt: string;
  depth: number;
  totalNamed: number;
  resolved: number;
  // sage slug → chain back from sage (excluding sage) up to depth steps
  chains: Record<string, MesorahChainStep[]>;
  unenriched: string[];
  graphMissing: boolean;
}

const DEFAULT_MESORAH_DEPTH = 4;

export function registerRegionMesorahRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.get('/api/region/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

    const refresh = c.req.query('refresh') === '1';
    const cacheKey = keyForRegion(tractate, page);
    if (!refresh) {
      const hit = await kvGetJSONAs<object>(cache, cacheKey, cachedViewShape);
      if (hit) return c.json({ ...hit, _cached: true });
    }

    // Pull skeleton (Stage A) — required input.
    const skelKey = keyForAnalyzeSkeleton(tractate, page);
    const skeleton = await kvGetJSONAs<DafSkeleton>(cache, skelKey, dafSkeletonShape);
    if (!skeleton) {
      return c.json(
        {
          error: 'No cached skeleton; run /api/analyze/.../?skeleton_only=1 first',
        },
        412,
      );
    }

    const t0 = Date.now();
    const distribution = { israel: 0, bavel: 0, mixed: 0, unknown: 0 };
    const migrated: RegionFirstPass['migrated'] = [];
    const unenriched = new Set<string>();
    const sections: RegionFirstPass['sections'] = [];
    let totalNamed = 0;
    let resolved = 0;
    // Dedupe distribution counts across sections — count each sage once per daf.
    const seenSlugs = new Set<string>();

    for (const sec of skeleton.sections) {
      const sages: RegionSagePerSection[] = [];
      for (const name of sec.rabbiNames ?? []) {
        totalNamed++;
        const res = resolveRabbiByName(name);
        if (!res) {
          sages.push({ slug: null, name, region: null, places: [], migrated: false });
          continue;
        }
        resolved++;
        const enriched = await readEnriched(cache, res.slug);
        if (!enriched) {
          unenriched.add(res.slug);
          sages.push({ slug: res.slug, name, region: null, places: [], migrated: false });
          continue;
        }
        const region = (enriched.region as RegionSagePerSection['region']) ?? null;
        const places = enriched.places ?? [];
        const migratedSage = inferMigration(places);
        sages.push({ slug: res.slug, name, region, places, migrated: migratedSage });

        if (!seenSlugs.has(res.slug)) {
          seenSlugs.add(res.slug);
          if (region === 'israel') distribution.israel++;
          else if (region === 'bavel') distribution.bavel++;
          else if (region === 'mixed') distribution.mixed++;
          else distribution.unknown++;
          if (migratedSage) {
            migrated.push({ slug: res.slug, name: enriched.canonical.en, places });
          }
        }
      }
      sections.push({ title: sec.title, sages });
    }

    const out: RegionFirstPass = {
      generatedAt: new Date().toISOString(),
      totalNamed,
      resolved,
      distribution,
      migrated,
      sections,
      unenriched: [...unenriched],
    };
    await cache.put(cacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
    return c.json({ ...out, _ms: Date.now() - t0 });
  });

  app.get('/api/mesorah/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

    const refresh = c.req.query('refresh') === '1';
    const depthQ = parseInt(c.req.query('depth') ?? '', 10);
    const depth =
      Number.isFinite(depthQ) && depthQ > 0 && depthQ <= 10 ? depthQ : DEFAULT_MESORAH_DEPTH;

    const cacheKey = keyForMesorah(tractate, page);
    if (!refresh) {
      const hit = await kvGetJSONAs<object>(cache, cacheKey, cachedViewShape);
      if (hit) return c.json({ ...hit, _cached: true });
    }

    const skelKey = keyForAnalyzeSkeleton(tractate, page);
    const skeleton = await kvGetJSONAs<DafSkeleton>(cache, skelKey, dafSkeletonShape);
    if (!skeleton) {
      return c.json(
        {
          error: 'No cached skeleton; run /api/analyze/.../?skeleton_only=1 first',
        },
        412,
      );
    }

    const graph =
      (await kvGetJSONAs<RabbiGraphBlob>(cache, keyForRabbiGraph(), rabbiGraphBlobShape)) ?? null;

    const t0 = Date.now();
    const namedSlugs = new Set<string>();
    const unenriched = new Set<string>();
    let totalNamed = 0;
    let resolved = 0;
    for (const sec of skeleton.sections) {
      for (const name of sec.rabbiNames ?? []) {
        totalNamed++;
        const res = resolveRabbiByName(name);
        if (!res) continue;
        resolved++;
        namedSlugs.add(res.slug);
      }
    }

    const chains: MesorahFirstPass['chains'] = {};
    if (graph) {
      for (const slug of namedSlugs) {
        const node = graph.nodes[slug];
        if (!node) {
          unenriched.add(slug);
          continue;
        }
        const chain: MesorahChainStep[] = [];
        let cursor: string | null = node.primaryTeacher;
        const seen = new Set<string>([slug]);
        for (let i = 0; i < depth && cursor; i++) {
          if (seen.has(cursor)) break;
          seen.add(cursor);
          const upstream = graph.nodes[cursor];
          if (!upstream) break;
          chain.push({
            slug: upstream.slug,
            canonical: upstream.canonical,
            canonicalHe: upstream.canonicalHe,
            generation: upstream.generation,
          });
          cursor = upstream.primaryTeacher;
        }
        chains[slug] = chain;
      }
    } else {
      for (const slug of namedSlugs) unenriched.add(slug);
    }

    const out: MesorahFirstPass = {
      generatedAt: new Date().toISOString(),
      depth,
      totalNamed,
      resolved,
      chains,
      unenriched: [...unenriched],
      graphMissing: !graph,
    };
    await cache.put(cacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 365 });
    return c.json({ ...out, _ms: Date.now() - t0 });
  });
}
