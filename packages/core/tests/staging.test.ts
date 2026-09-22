import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { releaseResponse, stagingCache, withStaging } from '../src/cache/staging';
import sourceWorker from '../src/cache/staging-source';
import { checkBudget } from '../src/llm/budget';
import captured from './fixtures/billing-response.json';

const mf = new Miniflare({
  modules: true,
  compatibilityDate: '2025-04-01',
  script: 'export default { fetch() { return new Response(null, {status: 204}); } }',
  kvNamespaces: ['SOURCE', 'STAGING'],
});
let source: KVNamespace;
let local: KVNamespace;
let cache: KVNamespace;
let binding: Fetcher;
const content = JSON.stringify(captured);
beforeAll(async () => {
  source = (await mf.getKVNamespace('SOURCE')) as unknown as KVNamespace;
  local = (await mf.getKVNamespace('STAGING')) as unknown as KVNamespace;
  binding = {
    fetch: (input: RequestInfo | URL) =>
      sourceWorker.fetch(new Request(input), { TALMUD: source, TANACH: source }),
  } as Fetcher;
  cache = stagingCache(local, binding, 'talmud');
  await source.put('captured', content, { metadata: { source: 'billing-response.json' } });
});
afterAll(() => mf.dispose());

describe('staging content isolation', () => {
  it('reads real saved content, metadata, binary and streams through the private service', async () => {
    expect(await cache.get('captured', 'json')).toEqual(captured);
    expect(await cache.getWithMetadata('captured')).toMatchObject({
      value: content,
      metadata: { source: 'billing-response.json' },
    });
    expect(
      new TextDecoder().decode((await cache.get('captured', 'arrayBuffer')) ?? undefined),
    ).toBe(content);
    expect(await new Response(await cache.get('captured', 'stream')).text()).toBe(content);
    expect(await cache.get('missing')).toBeNull();
    expect((await cache.get(['captured'], 'json')).get('captured')).toEqual(captured);
  });
  it('keeps edits and deletion markers entirely in staging', async () => {
    await cache.put('captured', JSON.stringify(captured.response), {
      metadata: { source: 'billing-response.json#response' },
    });
    expect(await cache.get('captured', 'json')).toEqual(captured.response);
    expect((await cache.getWithMetadata('captured')).metadata).toEqual({
      source: 'billing-response.json#response',
    });
    await cache.delete('captured');
    expect(await cache.get('captured')).toBeNull();
    expect(await source.get('captured')).toBe(content);
    await cache.put('captured', content);
  });
  it('paginates source and local keys without duplicates or deleted keys', async () => {
    await source.put('list:source', content);
    await source.put('list:both', content);
    await source.put('list:deleted', content);
    await cache.put('list:both', content);
    await cache.put('list:local', content);
    await cache.delete('list:deleted');
    const names: string[] = [];
    let cursor: string | undefined;
    for (let pages = 0; pages < 20; pages++) {
      const page = await cache.list({ prefix: 'list:', limit: 1, cursor });
      names.push(...page.keys.map((k) => k.name));
      if (page.list_complete) break;
      cursor = page.cursor;
      if (pages === 19) throw new Error('Pagination did not finish');
    }
    expect(names.sort()).toEqual(['list:both', 'list:local', 'list:source']);
    expect(await source.get('list:deleted')).toBe(content);
  });
  it('rejects writes at the source service', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await sourceWorker.fetch(
        new Request('https://saved/talmud/value?key=captured', { method }),
        { TALMUD: source, TANACH: source },
      );
      expect(response.status).toBe(405);
    }
    expect(await source.get('captured')).toBe(content);
  });
  it('leaves production unchanged and fails closed when staging is misconfigured', () => {
    const env = { CACHE: source };
    expect(withStaging(env)).toBe(env);
    expect(() => withStaging({ APP_ENV: 'staging', CACHE: local })).toThrow('not configured');
  });
  it('disables generation before any cache read or billing reservation', async () => {
    expect(await checkBudget({ GENERATION_DISABLED: '1' }, { custom: false })).toEqual({
      ok: false,
      scope: 'all',
      reason: 'staging-read-only',
    });
    expect(await checkBudget({ GENERATION_DISABLED: '1' }, { custom: true })).toMatchObject({
      ok: false,
    });
  });
  it('identifies the deployed commit without caching the answer', async () => {
    const response = releaseResponse(new Request('https://staging.talmud.dev/api/release'), {
      APP_ENV: 'staging',
      BUILD_SHA: '88ae84a',
    });
    expect(await response?.json()).toEqual({ environment: 'staging', sha: '88ae84a' });
    expect(response?.headers.get('cache-control')).toBe('no-store');
  });
});
