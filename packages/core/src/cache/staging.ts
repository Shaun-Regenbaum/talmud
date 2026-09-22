/** Staging reads saved production content through a private read-only service.
 * All edits and deletion markers live in staging's own namespace. */
type StoredMetadata = { deleted?: boolean; original?: unknown };
type ReadOptions = { type?: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number };
type Cursor = { phase: 'local' | 'source'; cursor?: string; prefix: string };

export interface StagingEnv {
  APP_ENV?: string;
  BUILD_SHA?: string;
  STAGING_SOURCE?: Fetcher;
  CACHE?: KVNamespace;
  BILLING_APP?: string;
}

export function stagingCache(local: KVNamespace, source: Fetcher, corpus: string): KVNamespace {
  async function read(key: string, options?: ReadOptions | ReadOptions['type']) {
    const type = typeof options === 'string' ? options : (options?.type ?? 'text');
    const saved = await local.getWithMetadata<StoredMetadata>(key, 'stream');
    let value = saved.value;
    let metadata = saved.metadata?.original ?? null;
    if (saved.metadata?.deleted) {
      await value?.cancel();
      return { value: null, metadata: null, cacheStatus: null };
    }
    if (value === null) {
      const response = await source.fetch(
        `https://saved/${corpus}/value?key=${encodeURIComponent(key)}`,
      );
      if (response.status === 404) return { value: null, metadata: null, cacheStatus: null };
      if (!response.ok) throw new Error(`Saved content unavailable (${response.status})`);
      metadata = JSON.parse(decodeURIComponent(response.headers.get('x-kv-metadata') ?? 'null'));
      value = response.body;
    }
    const response = new Response(value);
    const result =
      type === 'stream'
        ? value
        : type === 'json'
          ? await response.json()
          : type === 'arrayBuffer'
            ? await response.arrayBuffer()
            : await response.text();
    return { value: result, metadata, cacheStatus: null };
  }
  const cache = {
    async get(key: string | string[], options?: ReadOptions) {
      if (Array.isArray(key))
        return new Map(
          await Promise.all(key.map(async (k) => [k, (await read(k, options)).value] as const)),
        );
      return (await read(key, options)).value;
    },
    async getWithMetadata(key: string | string[], options?: ReadOptions) {
      if (Array.isArray(key))
        return new Map(
          await Promise.all(key.map(async (k) => [k, await read(k, options)] as const)),
        );
      return read(key, options);
    },
    put(
      key: string,
      value: string | ArrayBuffer | ReadableStream,
      options?: KVNamespacePutOptions,
    ) {
      return local.put(key, value, {
        ...options,
        metadata: { original: options?.metadata ?? null },
      });
    },
    delete(key: string) {
      return local.put(key, '', { metadata: { deleted: true } });
    },
    async list(options: KVNamespaceListOptions = {}): Promise<KVNamespaceListResult<unknown>> {
      const prefix = options.prefix ?? '';
      const state: Cursor = options.cursor
        ? JSON.parse(decodeURIComponent(options.cursor))
        : { phase: 'local', prefix };
      if (state.prefix !== prefix || !['local', 'source'].includes(state.phase))
        throw new Error('Invalid staging cursor');
      const limit = Math.min(100, options.limit ?? 100);
      if (state.phase === 'local') {
        const page = await local.list<StoredMetadata>({ prefix, limit, cursor: state.cursor });
        const next: Cursor = page.list_complete
          ? { phase: 'source', prefix }
          : { ...state, cursor: page.cursor };
        if (page.list_complete && page.keys.length === 0) {
          return cache.list({ ...options, cursor: encodeURIComponent(JSON.stringify(next)) });
        }
        return {
          keys: page.keys
            .filter((k) => !k.metadata?.deleted)
            .map((k) => ({ ...k, metadata: k.metadata?.original })),
          list_complete: false,
          cursor: encodeURIComponent(JSON.stringify(next)),
          cacheStatus: null,
        };
      }
      const params = new URLSearchParams({ prefix, limit: String(limit) });
      if (state.cursor) params.set('cursor', state.cursor);
      const response = await source.fetch(`https://saved/${corpus}/keys?${params}`);
      if (!response.ok) throw new Error(`Saved content listing unavailable (${response.status})`);
      const page = await response.json<KVNamespaceListResult<unknown>>();
      const keys = [];
      for (const key of page.keys) {
        const override = await local.get(key.name, 'stream');
        if (override === null) keys.push(key);
        else await override.cancel();
      }
      return {
        ...page,
        keys,
        cursor: page.list_complete
          ? undefined
          : encodeURIComponent(JSON.stringify({ ...state, cursor: page.cursor })),
      };
    },
  } as KVNamespace;
  return cache;
}

export function withStaging<T extends StagingEnv>(env: T): T {
  if (env.APP_ENV !== 'staging') return env;
  if (!env.CACHE || !env.STAGING_SOURCE || !env.BILLING_APP)
    throw new Error('Staging storage is not configured');
  return { ...env, CACHE: stagingCache(env.CACHE, env.STAGING_SOURCE, env.BILLING_APP) };
}

export function releaseResponse(request: Request, env: StagingEnv): Response | undefined {
  if (new URL(request.url).pathname !== '/api/release') return;
  return Response.json(
    { environment: env.APP_ENV ?? 'production', sha: env.BUILD_SHA ?? null },
    { headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
  );
}

/** Gallery examples read the same staging APIs as the reader. */
export function stagingGalleryRequest(request: Request, env: StagingEnv): Request {
  const url = new URL(request.url);
  if (
    env.APP_ENV === 'staging' &&
    request.method === 'GET' &&
    url.pathname.startsWith('/gallery-api/api/')
  ) {
    url.pathname = url.pathname.slice('/gallery-api'.length);
    return new Request(url, request);
  }
  return request;
}
