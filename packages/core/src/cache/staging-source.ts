/** Private service: reads saved content without exposing a write operation. */
export default {
  async fetch(request: Request, env: { TALMUD: KVNamespace; TANACH: KVNamespace }) {
    if (request.method !== 'GET') return new Response('Read only', { status: 405 });
    const url = new URL(request.url);
    const [, corpus, operation] = url.pathname.split('/');
    const cache = corpus === 'talmud' ? env.TALMUD : corpus === 'tanach' ? env.TANACH : null;
    if (!cache) return new Response('Not found', { status: 404 });
    if (operation === 'keys') {
      return Response.json(
        await cache.list({
          prefix: url.searchParams.get('prefix') ?? undefined,
          cursor: url.searchParams.get('cursor') ?? undefined,
          limit: Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 100)),
        }),
      );
    }
    const key = url.searchParams.get('key');
    if (operation !== 'value' || !key) return new Response('Not found', { status: 404 });
    const result = await cache.getWithMetadata(key, 'stream');
    if (result.value === null) return new Response(null, { status: 404 });
    return new Response(result.value, {
      headers: {
        'x-kv-metadata': encodeURIComponent(JSON.stringify(result.metadata)),
        'cache-control': 'no-store',
      },
    });
  },
};
