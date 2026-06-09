/**
 * One-stop zod → OpenAI/AI-Gateway `response_format.json_schema`.
 *
 * Every code-defined LLM output is a zod schema (see output-schemas.ts);
 * `responseFormat` derives the `{ name, strict, schema }` envelope the model
 * call expects. This makes the zod schema the single source of truth for both
 * the structured-output contract sent to the model and (via z.infer) the
 * parsed-result types.
 */
import { z } from 'zod';

export interface ResponseJsonSchema {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
}

// z.toJSONSchema decorates output with things the model contract doesn't want:
// the $schema dialect URL, and the JS safe-integer sentinels zod attaches to
// `.int()` (minimum -2^53+1 / maximum 2^53-1). Strip them so the emitted schema
// stays as lean as the hand-written literals it replaces.
const SAFE_INT_MAX = 9007199254740991;
const SAFE_INT_MIN = -9007199254740991;

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === '$schema') continue;
    if (k === 'maximum' && v === SAFE_INT_MAX) continue;
    if (k === 'minimum' && v === SAFE_INT_MIN) continue;
    out[k] = strip(v);
  }
  return out;
}

export function responseFormat(name: string, schema: z.ZodType): ResponseJsonSchema {
  return { name, strict: true, schema: strip(z.toJSONSchema(schema)) as Record<string, unknown> };
}

// Canonicalize a JSON-Schema node for SEMANTIC comparison (used by the parity
// test). Erases representation-only differences between the hand-written
// literals and zod's output: array ordering of required/enum/anyOf, the two
// equivalent nullable encodings (`type:[T,'null']` vs `anyOf:[T,{type:'null'}]`),
// and the safe-integer sentinels.
export function canonicalizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(canonicalizeSchema);
  if (!node || typeof node !== 'object') return node;
  const n: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === '$schema') continue;
    if (k === 'maximum' && v === SAFE_INT_MAX) continue;
    if (k === 'minimum' && v === SAFE_INT_MIN) continue;
    n[k] = v;
  }

  // Unify nullable via `type: [T, 'null']` (+ null in enum).
  if (Array.isArray(n.type) && (n.type as unknown[]).includes('null')) {
    const baseTypes = (n.type as string[]).filter((t) => t !== 'null');
    const base: Record<string, unknown> = {
      ...n,
      type: baseTypes.length === 1 ? baseTypes[0] : baseTypes,
    };
    if (Array.isArray(base.enum)) base.enum = (base.enum as unknown[]).filter((v) => v !== null);
    return { __nullable: canonicalizeSchema(base) };
  }
  // Unify nullable via `anyOf: [..., { type: 'null' }]`.
  if (Array.isArray(n.anyOf)) {
    const members = n.anyOf as Array<Record<string, unknown>>;
    if (members.some((m) => m && m.type === 'null')) {
      const others = members.filter((m) => !(m && m.type === 'null'));
      const base = others.length === 1 ? others[0] : { anyOf: others };
      return { __nullable: canonicalizeSchema(base) };
    }
    n.anyOf = members.map(canonicalizeSchema).sort(byJson);
  }

  if (n.properties && typeof n.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n.properties as Record<string, unknown>))
      props[k] = canonicalizeSchema(v);
    n.properties = props;
  }
  if (n.items) n.items = canonicalizeSchema(n.items);
  if (Array.isArray(n.required)) n.required = [...(n.required as string[])].sort();
  if (Array.isArray(n.enum))
    n.enum = [...(n.enum as unknown[])].map((x) => JSON.stringify(x)).sort();
  return n;
}

function byJson(a: unknown, b: unknown): number {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
