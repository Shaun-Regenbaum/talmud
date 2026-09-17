/**
 * Does a producer's parsed output have the SHAPE its schema promises?
 *
 * Until now the only check after the model answered was JSON.parse: any JSON
 * object was accepted and cached. On the cheap first-party DeepSeek route the
 * schema is only pasted into the prompt as text (see llm.ts
 * inlineSchemaForFirstParty), so the model can drift to its own key names or
 * echo its input, and the reader then renders a raw field dump — seen live on
 * Chullin 140 (argument-overview.synthesis stored {wholeDafOverview}, every
 * pesukim.why-here stored the prompt's input JSON).
 *
 * This validates the parsed output against the producer's own JSON Schema (the
 * same document sent to the model), LENIENTLY: it checks that the fields the
 * app renders exist with the right types, and ignores extras and size limits
 * (additionalProperties, min/max*, pattern, format). Strictness would reject
 * good answers that carry a harmless extra key; the failure we care about is a
 * missing or mistyped field.
 */

import { Validator } from '@cfworker/json-schema';

/** The JSON Schema inside a `responseFormat` envelope ({ name, strict, schema }),
 *  or a raw schema passed directly. null when the def has no usable schema. */
export function jsonSchemaOf(outputSchema: unknown): Record<string, unknown> | null {
  if (!outputSchema || typeof outputSchema !== 'object') return null;
  const o = outputSchema as Record<string, unknown>;
  if (o.schema && typeof o.schema === 'object') return o.schema as Record<string, unknown>;
  if (typeof o.type === 'string' || o.properties || o.anyOf || o.oneOf) return o;
  return null;
}

const STRIPPED = new Set([
  'additionalProperties',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'uniqueItems',
]);

/** Shape-only copy of a schema: structure and types, no size/extras rules. */
export function lenientSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(lenientSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (STRIPPED.has(k)) continue;
    // `properties` / `patternProperties` map names to schemas: recurse into the
    // values but never treat a property NAME as a keyword to strip.
    if (k === 'properties' && v && typeof v === 'object') {
      const props: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(v as Record<string, unknown>)) {
        props[name] = lenientSchema(sub);
      }
      out[k] = props;
      continue;
    }
    out[k] = lenientSchema(v);
  }
  return out;
}

export type OutputValidation = { ok: true } | { ok: false; error: string };

const validators = new WeakMap<object, Validator>();

function validatorFor(schema: Record<string, unknown>): Validator {
  let v = validators.get(schema);
  if (!v) {
    v = new Validator(
      lenientSchema(schema) as ConstructorParameters<typeof Validator>[0],
      '2020-12',
      true,
    );
    validators.set(schema, v);
  }
  return v;
}

/**
 * Validate `parsed` against the def's output schema. A def without a schema
 * always passes (nothing to check). The error string starts with
 * "schema mismatch" so telemetry's classifyError files it as schema-mismatch.
 */
export function validateOutput(outputSchema: unknown, parsed: unknown): OutputValidation {
  const schema = jsonSchemaOf(outputSchema);
  if (!schema) return { ok: true };
  if (parsed === null || parsed === undefined) {
    return { ok: false, error: 'schema mismatch: no parsed output' };
  }
  let result: { valid: boolean; errors: Array<{ instanceLocation: string; error: string }> };
  try {
    result = validatorFor(schema).validate(parsed);
  } catch {
    // A schema the validator cannot compile must never block a write.
    return { ok: true };
  }
  if (result.valid) return { ok: true };
  // The most specific error is the last one reported (the validator reports
  // the failing leaf, then its ancestors).
  const leaf = result.errors[result.errors.length - 1] ?? result.errors[0];
  const where =
    leaf?.instanceLocation && leaf.instanceLocation !== '#' ? ` at ${leaf.instanceLocation}` : '';
  return { ok: false, error: `schema mismatch${where}: ${leaf?.error ?? 'invalid'}`.slice(0, 200) };
}

/** True when the parsed output matches the def's schema (or the def has none). */
export function outputMatches(outputSchema: unknown, parsed: unknown): boolean {
  return validateOutput(outputSchema, parsed).ok;
}

/**
 * READ-time check on a cached entry: is it RECOGNIZABLY the producer's output?
 *
 * Deliberately weaker than write-time validation. Cached entries are
 * legitimately reshaped after the write-time check (anchor passes, the check
 * layer, legacy envelopes), and a false "junk" verdict here would regenerate
 * good content on every read. The drift we are healing looks different: the
 * model used its OWN keys ({wholeDafOverview}, {scope_and_scale, …}) or echoed
 * its input ({focalPasuk, dafContext}) — such an entry shares NO required
 * top-level key with the schema. So: junk = an object that has none of the
 * schema's required keys, or has one with the wrong top-level type.
 */
export function outputMatchesShallow(outputSchema: unknown, parsed: unknown): boolean {
  const schema = jsonSchemaOf(outputSchema);
  if (!schema) return true;
  // No parsed object at all is a legacy shape the app serves from `content`
  // (prose fallback), not the drift we are after. Only a WRONG object is junk.
  if (parsed === null || parsed === undefined) return true;
  const required = Array.isArray(schema.required) ? (schema.required as unknown[]) : [];
  if (schema.type === 'object' || schema.properties) {
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    if (required.length === 0) return true;
    const obj = parsed as Record<string, unknown>;
    if (Object.keys(obj).length === 0) return true;
    const props = (schema.properties ?? {}) as Record<string, { type?: unknown }>;
    let present = 0;
    for (const key of required) {
      if (typeof key !== 'string' || !(key in obj)) continue;
      present++;
      const want = props[key]?.type;
      if (!typeMatches(want, obj[key])) return false;
    }
    return present > 0;
  }
  if (schema.type === 'array') return Array.isArray(parsed);
  return true;
}

function typeMatches(want: unknown, value: unknown): boolean {
  if (typeof want !== 'string') {
    return Array.isArray(want) ? want.some((w) => typeMatches(w, value)) : true;
  }
  switch (want) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
    case 'integer':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

/**
 * The correction appended to the user prompt for the single repair retry after
 * a schema mismatch. Names the failure and restates the contract; the schema
 * itself is already in the system message.
 */
export function repairSuffix(error: string): string {
  return (
    `\n\n[CORRECTION] Your previous reply did not match the required JSON shape (${error}). ` +
    'Reply again with ONLY a JSON object that matches the schema exactly: the same keys, ' +
    'nothing else — no commentary, no wrapper object, and do not repeat or restate the input.'
  );
}
