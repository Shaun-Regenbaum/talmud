import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { kvGetJSON, parseJSON } from '../src/worker/kv-json';

// The contract these lock down is the one every converted read depends on:
// a bad value is a cache MISS (undefined), never a throw, and a good value
// comes back exactly as JSON.parse produced it - the schema is a gate, not a
// rewrite. If the second half ever stopped holding, every converted read would
// quietly start returning zod's output instead of the cached value.

const Row = z.looseObject({ name: z.string(), n: z.number().optional() });

function fakeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

function captureWarnings(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return lines;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseJSON', () => {
  it('returns a good value and says nothing', () => {
    const warnings = captureWarnings();
    expect(parseJSON('{"name":"a","n":2}', Row, 'k:1')).toEqual({ name: 'a', n: 2 });
    expect(warnings).toEqual([]);
  });

  it('returns what JSON.parse produced, not what zod produced', () => {
    // A schema that would rewrite the value if we returned zod's output:
    // `z.object` strips unknown keys and `.default()` invents a field.
    const rewriting = z.object({ name: z.string(), n: z.number().default(99) });
    const parsed = parseJSON('{"name":"a","extra":true}', rewriting, 'k:1');
    expect(parsed).toEqual({ name: 'a', extra: true });
    expect(parsed).not.toHaveProperty('n');
  });

  it('keeps unknown keys, so a value written by newer code still reads', () => {
    expect(parseJSON('{"name":"a","futureField":[1,2]}', Row, 'k:1')).toEqual({
      name: 'a',
      futureField: [1, 2],
    });
  });

  it('treats a value that is not JSON as a miss, and logs the key once', () => {
    const warnings = captureWarnings();
    expect(parseJSON('not json at all', Row, 'k:broken')).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('k:broken');
    expect(warnings[0]).toContain('not JSON');
  });

  it('treats a wrong-shaped value as a miss, and names the field that failed', () => {
    const warnings = captureWarnings();
    expect(parseJSON('{"n":2}', Row, 'k:old-shape')).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('k:old-shape');
    expect(warnings[0]).toContain('name');
  });

  it('treats a value of the wrong type at the root as a miss', () => {
    const warnings = captureWarnings();
    expect(parseJSON('[1,2,3]', Row, 'k:array')).toBeUndefined();
    expect(parseJSON('null', Row, 'k:null')).toBeUndefined();
    expect(parseJSON('"a string"', Row, 'k:string')).toBeUndefined();
    expect(warnings).toHaveLength(3);
  });

  it('treats a missing value as a miss, and says nothing about it', () => {
    const warnings = captureWarnings();
    expect(parseJSON(null, Row, 'k:absent')).toBeUndefined();
    expect(parseJSON(undefined, Row, 'k:absent')).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('treats an empty value as a miss - the same answer KV gives for absent', () => {
    captureWarnings();
    expect(parseJSON('', Row, 'k:empty')).toBeUndefined();
  });

  it('carries the schema type through to the caller', () => {
    const value = parseJSON('{"name":"a"}', Row, 'k:1');
    expect(value?.name).toBe('a');
  });

  it('never throws, whatever the input', () => {
    captureWarnings();
    const inputs = ['', '{', '[', 'undefined', '{"name":', '{"name":"a"}'];
    for (const raw of inputs) expect(() => parseJSON(raw, Row, 'k:x')).not.toThrow();
  });
});

describe('kvGetJSON', () => {
  it('reads and validates a good value', async () => {
    const kv = fakeKV({ 'k:1': '{"name":"a"}' });
    expect(await kvGetJSON(kv, 'k:1', Row)).toEqual({ name: 'a' });
  });

  it('returns undefined for a missing key', async () => {
    expect(await kvGetJSON(fakeKV(), 'k:1', Row)).toBeUndefined();
  });

  it('returns undefined for a garbage value, and names the key', async () => {
    const warnings = captureWarnings();
    const kv = fakeKV({ 'k:1': '{{{' });
    expect(await kvGetJSON(kv, 'k:1', Row)).toBeUndefined();
    expect(warnings[0]).toContain('k:1');
  });

  it('returns undefined for a value of an older shape', async () => {
    captureWarnings();
    const kv = fakeKV({ 'k:1': '{"title":"a"}' });
    expect(await kvGetJSON(kv, 'k:1', Row)).toBeUndefined();
  });

  it('returns undefined when there is no KV binding, without reading', async () => {
    expect(await kvGetJSON(undefined, 'k:1', Row)).toBeUndefined();
  });
});
