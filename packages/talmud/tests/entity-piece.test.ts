import { describe, expect, it } from 'vitest';
import rabbiPlaces from '../src/lib/data/rabbi-places.json';
import type { EntityPiece } from '../src/lib/registry/entity';
import worker from '../src/worker/index';
import type { Bindings } from '../src/worker/types';

// Guards the assumption GET /api/entity/rabbi/:slug relies on: rabbis is
// slug-keyed, each entry carries a canonical name (used to read the per-name
// global enrichment cache keys).
describe('entity piece — rabbi slug resolution', () => {
  const data = rabbiPlaces as unknown as {
    rabbis: Record<string, { canonical: string; canonicalHe?: string | null }>;
  };

  it('rabbis is a non-empty slug → entry map with canonical names', () => {
    const slugs = Object.keys(data.rabbis);
    expect(slugs.length).toBeGreaterThan(100);
    for (const slug of slugs.slice(0, 50)) {
      expect(typeof data.rabbis[slug].canonical).toBe('string');
      expect(data.rabbis[slug].canonical.length).toBeGreaterThan(0);
    }
  });

  it('a known slug resolves to its canonical name (the endpoint key path)', () => {
    const entry = data.rabbis['rabbi-yochanan-b-napacha'];
    expect(entry).toBeDefined();
    expect(entry.canonical).toContain('Yochanan');
    // The EntityPiece the endpoint would build for it.
    const piece: EntityPiece = {
      type: 'rabbi',
      id: 'rabbi-yochanan-b-napacha',
      name: entry.canonical,
      nameHe: entry.canonicalHe ?? undefined,
      pieces: { identity: null, connections: null, geography: null },
    };
    expect(piece.type).toBe('rabbi');
    expect(piece.id).toBe('rabbi-yochanan-b-napacha');
    expect(Object.keys(piece.pieces)).toEqual(['identity', 'connections', 'geography']);
  });
});

// Drives the REAL worker fetch handler with a recording KV stub and an assets stub: the ?facets= query must limit both
// the response pieces AND the reads. The old guessed teacher/student tree (rabbi.relationships) is never read any
// more; connections come from the static sage-interactions file, or say "in-progress".
describe('GET /api/entity/rabbi/:slug — ?facets=', () => {
  const SLUG = 'rabbi-yochanan-b-napacha';

  function makeEnv(): { env: Bindings; gets: string[]; assetPaths: string[] } {
    const gets: string[] = [];
    const assetPaths: string[] = [];
    // No interactions file for this sage: the assets host answers with the app page, as it does for a missing path.
    const assets = {
      fetch: async (req: Request) => {
        assetPaths.push(new URL(req.url).pathname);
        return new Response('<!doctype html><html></html>', { status: 200 });
      },
    };
    const kv = {
      get: async (k: string) => {
        gets.push(k);
        return null;
      },
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true, cursor: '' }),
      getWithMetadata: async () => ({ value: null, metadata: null }),
    };
    return {
      env: { CACHE: kv as unknown as KVNamespace, ASSETS: assets } as unknown as Bindings,
      gets,
      assetPaths,
    };
  }

  function makeCtx(): ExecutionContext {
    return {
      waitUntil: (_p: Promise<unknown>) => {},
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;
  }

  async function getEntity(
    env: Bindings,
    query: string,
  ): Promise<{ status: number; pieces: Record<string, unknown> }> {
    const res = await worker.fetch(
      new Request(`https://test.local/api/entity/rabbi/${SLUG}${query}`),
      env,
      makeCtx(),
    );
    const json = (await res.json()) as { pieces?: Record<string, unknown> };
    return { status: res.status, pieces: json.pieces ?? {} };
  }

  it('no facets param gives identity, connections and geography, and never reads the guessed tree', async () => {
    const { env, gets, assetPaths } = makeEnv();
    const { status, pieces } = await getEntity(env, '');
    expect(status).toBe(200);
    expect(Object.keys(pieces)).toEqual(['identity', 'connections', 'geography']);
    expect(pieces.identity).toBeTruthy();
    expect(pieces.connections).toMatchObject({ status: 'in-progress', slug: SLUG });
    expect(assetPaths).toEqual([`/sage-interactions/${SLUG}.json`]);
    expect(gets.some((k) => k.includes('rabbi.relationships'))).toBe(false);
    expect(gets.some((k) => k.includes('rabbi.geography'))).toBe(true);
  });

  it('the old facet name "relationships" still asks for connections', async () => {
    const { env } = makeEnv();
    const { pieces } = await getEntity(env, '?facets=relationships');
    expect(Object.keys(pieces)).toEqual(['connections']);
  });

  it('facets=identity,geography skips the connections read entirely', async () => {
    const { env, gets, assetPaths } = makeEnv();
    const { status, pieces } = await getEntity(env, '?facets=identity,geography');
    expect(status).toBe(200);
    expect(Object.keys(pieces)).toEqual(['identity', 'geography']);
    expect(pieces.identity).toBeTruthy(); // deterministic registry identity
    expect(assetPaths).toEqual([]);
    expect(gets.some((k) => k.includes('rabbi.relationships'))).toBe(false);
    expect(gets.some((k) => k.includes('rabbi.geography'))).toBe(true);
  });

  it('unknown facet names are ignored; valid ones still apply', async () => {
    const { env, gets } = makeEnv();
    const { status, pieces } = await getEntity(env, '?facets=identity,bogus');
    expect(status).toBe(200);
    expect(Object.keys(pieces)).toEqual(['identity']);
    expect(gets.some((k) => k.includes('rabbi.relationships'))).toBe(false);
    expect(gets.some((k) => k.includes('rabbi.geography'))).toBe(false);
  });

  it('a facets list with NOTHING valid falls back to the full default', async () => {
    const { env } = makeEnv();
    const { status, pieces } = await getEntity(env, '?facets=bogus,nonsense');
    expect(status).toBe(200);
    expect(Object.keys(pieces)).toEqual(['identity', 'connections', 'geography']);
  });
});
