// Small HTTP-handler helpers shared across the worker's route bodies.
//
// These exist to kill copy-paste, not to build an abstraction layer. Two
// patterns recurred verbatim across ~18 handlers in index.ts:
//   1. parse the JSON body, return 400 on failure
//   2. resolve a `:slug` param to a rabbi entry, return 404 when unknown
// Both are now single-sourced here so the error shape is consistent and a new
// handler can't accidentally diverge.
//
// NOTE on caching: the get-or-compute cache pattern is deliberately NOT here.
// It already lives in source-cache.ts (getMishnaBundleCached etc.); the few
// remaining inline CACHE.get/put sites in index.ts are bespoke (append-to-array
// recent-errors, section-range-guarded hot path) and don't share one shape.

import type { Context } from 'hono';

/** Result of reading a JSON body: either the parsed value or a ready-to-return
 *  error Response. Callers do `if (!r.ok) return r.response;` then use r.value. */
export type JsonBodyResult<T> = { ok: true; value: T } | { ok: false; response: Response };

/**
 * Parse the request JSON body. On parse failure, returns a 400 Response built
 * from `errorBody` (default `{ error: 'invalid JSON' }`) so each call site can
 * preserve its exact error contract while dropping the try/catch boilerplate.
 */
export async function readJsonBody<T = unknown>(
  c: Context,
  errorBody: Record<string, unknown> = { error: 'invalid JSON' },
): Promise<JsonBodyResult<T>> {
  try {
    return { ok: true, value: (await c.req.json()) as T };
  } catch {
    return { ok: false, response: c.json(errorBody, 400) };
  }
}

/** Result of resolving a rabbi `:slug`: the slug + entry, or a 404 Response. */
export type RabbiEntryResult<E> =
  | { ok: true; slug: string; entry: E }
  | { ok: false; response: Response };

/**
 * Resolve the route's `:slug` param against a rabbi map, returning a 404
 * Response (`{ error: 'unknown slug: <slug>' }`) when the slug is absent.
 */
export function getRabbiEntryOr404<E>(
  c: Context,
  rabbis: Record<string, E>,
): RabbiEntryResult<E> {
  const slug = c.req.param('slug') ?? '';
  const entry = rabbis[slug];
  if (!entry) return { ok: false, response: c.json({ error: `unknown slug: ${slug}` }, 404) };
  return { ok: true, slug, entry };
}
