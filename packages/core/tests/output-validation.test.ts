import { describe, expect, it } from 'vitest';
import {
  jsonSchemaOf,
  lenientSchema,
  outputMatches,
  outputMatchesShallow,
  repairSuffix,
  validateOutput,
} from '../src/run/output-validation';

// The shapes below are what zod's toJSONSchema emits for the app's producers
// (see packages/talmud/tests/fixtures/output-schemas): strict objects with
// additionalProperties:false and a required list.
const WHY_HERE = {
  name: 'pesukim_why_here',
  strict: true,
  schema: {
    type: 'object',
    properties: { why_here: { type: 'string' } },
    required: ['why_here'],
    additionalProperties: false,
  },
};
const INSTANCES = {
  name: 'pesukim_refs',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      instances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            startSegIdx: { type: 'integer', minimum: 0 },
            endSegIdx: { type: 'integer', minimum: 0 },
            fields: {
              type: 'object',
              properties: {
                verseRef: { type: 'string' },
                citationStyle: { type: 'string', enum: ['explicit', 'allusion', 'paraphrase'] },
              },
              required: ['verseRef', 'citationStyle'],
              additionalProperties: false,
            },
          },
          required: ['startSegIdx', 'endSegIdx', 'fields'],
          additionalProperties: false,
        },
      },
    },
    required: ['instances'],
    additionalProperties: false,
  },
};

describe('jsonSchemaOf', () => {
  it('unwraps a responseFormat envelope and accepts a raw schema', () => {
    expect(jsonSchemaOf(WHY_HERE)).toBe(WHY_HERE.schema);
    expect(jsonSchemaOf(WHY_HERE.schema)).toBe(WHY_HERE.schema);
  });
  it('is null for defs without a schema', () => {
    expect(jsonSchemaOf(undefined)).toBeNull();
    expect(jsonSchemaOf({ name: 'x' })).toBeNull();
    expect(jsonSchemaOf('string')).toBeNull();
  });
});

describe('lenientSchema', () => {
  it('drops extras/size rules everywhere but keeps structure', () => {
    const l = lenientSchema(INSTANCES.schema) as Record<string, unknown>;
    expect(JSON.stringify(l)).not.toContain('additionalProperties');
    expect(JSON.stringify(l)).not.toContain('minimum');
    expect(JSON.stringify(l)).toContain('"required":["instances"]');
    expect(JSON.stringify(l)).toContain('"enum":["explicit","allusion","paraphrase"]');
  });
  it('never mistakes a property NAME for a keyword', () => {
    const s = {
      type: 'object',
      properties: { pattern: { type: 'string' }, format: { type: 'string' } },
      required: ['pattern'],
    };
    const l = lenientSchema(s) as { properties: Record<string, unknown> };
    expect(Object.keys(l.properties)).toEqual(['pattern', 'format']);
  });
});

describe('validateOutput', () => {
  it('accepts the shape the app renders, extra keys included', () => {
    expect(validateOutput(WHY_HERE, { why_here: 'The gemara needs …' })).toEqual({ ok: true });
    expect(validateOutput(WHY_HERE, { why_here: 'x', tractate: 'Chullin' })).toEqual({ ok: true });
  });
  it('rejects the echoed-input shape seen on Chullin 140a', () => {
    const r = validateOutput(WHY_HERE, { focalPasuk: 'שַׁלֵּחַ', dafContext: { segments: [] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^schema mismatch/);
  });
  it('rejects a renamed key and a mistyped value', () => {
    expect(validateOutput(WHY_HERE, { wholeDafOverview: { title: 'x' } }).ok).toBe(false);
    expect(validateOutput(WHY_HERE, { why_here: 42 }).ok).toBe(false);
  });
  it('checks nested instance shapes and enums, ignoring minimums', () => {
    const good = {
      instances: [
        {
          startSegIdx: 0,
          endSegIdx: 2,
          fields: { verseRef: 'Genesis 1:5', citationStyle: 'explicit', extra: 1 },
        },
      ],
    };
    expect(validateOutput(INSTANCES, good).ok).toBe(true);
    const badEnum = {
      instances: [
        {
          startSegIdx: 0,
          endSegIdx: 2,
          fields: { verseRef: 'Genesis 1:5', citationStyle: 'quote' },
        },
      ],
    };
    const r = validateOutput(INSTANCES, badEnum);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/citationStyle/);
    expect(validateOutput(INSTANCES, { instances: 'none' }).ok).toBe(false);
  });
  it('passes when the def has no schema, fails on null output', () => {
    expect(validateOutput(undefined, { anything: 1 })).toEqual({ ok: true });
    expect(validateOutput(WHY_HERE, null).ok).toBe(false);
  });
  it('outputMatches is the boolean view', () => {
    expect(outputMatches(WHY_HERE, { why_here: 'x' })).toBe(true);
    expect(outputMatches(WHY_HERE, {})).toBe(false);
  });
});

describe('read-time check (outputMatchesShallow)', () => {
  it('still catches the junk seen in prod: none of the required keys present', () => {
    expect(outputMatchesShallow(WHY_HERE, { focalPasuk: 'x', dafContext: {} })).toBe(false);
    expect(
      outputMatchesShallow(WHY_HERE, { tractate: 'Chullin', daf: '140a', wholeDafOverview: {} }),
    ).toBe(false);
    expect(outputMatchesShallow(WHY_HERE, { scope_and_scale: 'x', primary_focus: 'y' })).toBe(
      false,
    );
    expect(outputMatchesShallow(WHY_HERE, 'a string')).toBe(false);
    expect(outputMatchesShallow(WHY_HERE, ['x'])).toBe(false);
  });
  it('rejects a required key with the wrong top-level type', () => {
    expect(outputMatchesShallow(INSTANCES, { instances: 'none' })).toBe(false);
    expect(outputMatchesShallow(WHY_HERE, { why_here: { text: 'x' } })).toBe(false);
  });
  it('accepts a minimal or post-processed entry that is recognizably the output', () => {
    expect(outputMatchesShallow(INSTANCES, { instances: [] })).toBe(true);
    const postProcessed = {
      instances: [{ excerpt: 'x', fields: { verseRef: 'Genesis 1:5', tokenStart: 1 } }],
    };
    expect(outputMatchesShallow(INSTANCES, postProcessed)).toBe(true);
    expect(outputMatches(INSTANCES, postProcessed)).toBe(false); // the strict view would not
    // A fixture with only SOME required keys is not junk.
    const twoRequired = {
      schema: {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
        required: ['a', 'b'],
      },
    };
    expect(outputMatchesShallow(twoRequired, { a: 'x' })).toBe(true);
  });
  it('leaves the legacy prose-fallback shapes alone (parsed null or {}; content carries the text)', () => {
    expect(outputMatchesShallow(WHY_HERE, null)).toBe(true);
    expect(outputMatchesShallow(WHY_HERE, undefined)).toBe(true);
    expect(outputMatchesShallow(WHY_HERE, {})).toBe(true);
  });
  it('passes defs without a schema or without required keys', () => {
    expect(outputMatchesShallow(undefined, { anything: 1 })).toBe(true);
    expect(outputMatchesShallow({ schema: { type: 'object' } }, { anything: 1 })).toBe(true);
  });
});

describe('repairSuffix', () => {
  it('names the failure and forbids restating the input', () => {
    const s = repairSuffix('schema mismatch: required property why_here');
    expect(s).toContain('why_here');
    expect(s).toMatch(/do not repeat or restate the input/);
    expect(s).not.toContain('{{');
  });
});
