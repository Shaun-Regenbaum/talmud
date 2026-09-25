/**
 * Validated JSON reads for values that come out of KV.
 *
 * Most of the worker used to do `JSON.parse(raw) as Foo` on a KV value and
 * carry on. That trusts two things at once: that the value is JSON at all, and
 * that it still has the shape the code expects. The first was usually wrapped
 * in a try/catch; the second never was. A value written by an older version of
 * the code (or a half-written one, or one from a key whose meaning moved)
 * therefore sailed past the cast and blew up several frames later, inside a
 * handler, as "cannot read properties of undefined" - or, worse, was handed
 * straight back to a caller as a garbage response.
 *
 * `parseJSON` / `kvGetJSON` close that gap. A value that isn't JSON, or that
 * fails its schema, is reported once (with the key, so it can be found and
 * deleted) and then treated as a CACHE MISS - exactly what the surrounding code
 * already does when the key is absent. No new error reaches a caller, so
 * converting a read is behaviour-preserving for every value that was already
 * good, and turns a crash into a recompute for every value that wasn't.
 *
 * Two rules for the schemas passed in here:
 *
 *  1. Be permissive. The job is to catch garbage, not to tighten a contract.
 *     Accept every shape the call site handles today: optional fields stay
 *     optional, unknown keys are allowed (`z.looseObject`), and a field the
 *     code only reads defensively should be `z.unknown()` rather than a precise
 *     type. A schema stricter than the code is a way to throw away good cache
 *     entries, and cache entries here are expensive.
 *
 *  2. No transforms. These helpers return the value `JSON.parse` produced, not
 *     zod's output - the schema is a gate, never a rewrite. That is what makes
 *     a conversion provably non-transforming: a caller either gets the value it
 *     got before, byte for byte, or a miss. So `.default()`, `.transform()`,
 *     `.catch()` and coercion have no effect here and must not be used; and
 *     `z.object()` (which strips unknown keys from zod's output) is harmless,
 *     though `z.looseObject` states the intent better.
 */

import type { z } from 'zod';

/** Cap on how much of a zod message or JSON error lands in the log line. */
const REASON_CAP = 200;

function reasonForBadShape(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'unexpected shape';
  const where = issue.path.length > 0 ? issue.path.join('.') : '(root)';
  return `unexpected shape at ${where}: ${issue.message.slice(0, REASON_CAP)}`;
}

/**
 * Parse a KV value and check it against `schema`.
 *
 * Returns `undefined` for all three of: the key was absent (`raw` is
 * null/undefined), the value wasn't JSON, and the value didn't match. The
 * latter two also log one line naming `key`.
 *
 * The returned value is the one `JSON.parse` produced - see the rules above.
 */
export function parseJSON<S extends z.ZodType>(
  raw: string | null | undefined,
  schema: S,
  key: string,
): z.infer<S> | undefined {
  if (raw === null || raw === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    console.warn(`[kv-json] discarding ${key}: not JSON: ${String(err).slice(0, REASON_CAP)}`);
    return undefined;
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    console.warn(`[kv-json] discarding ${key}: ${reasonForBadShape(result.error)}`);
    return undefined;
  }
  return value as z.infer<S>;
}

/**
 * Read `key` from KV and validate it with `schema`. A missing binding, a
 * missing key, a non-JSON value and a wrong-shaped value all resolve to
 * `undefined` - one "nothing usable here" answer for the caller to treat as a
 * cache miss.
 */
export async function kvGetJSON<S extends z.ZodType>(
  kv: KVNamespace | undefined,
  key: string,
  schema: S,
): Promise<z.infer<S> | undefined> {
  if (!kv) return undefined;
  return parseJSON(await kv.get(key), schema, key);
}
