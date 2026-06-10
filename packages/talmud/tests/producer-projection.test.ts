/**
 * The Producer projections must be LOSSLESS over the real registry: every
 * code-defined mark and enrichment survives the round trip through the
 * four-primitive Producer shape byte-for-byte, and the dependency vocabulary
 * fed to the dep graph is identical either way. This is the gate that lets the
 * new model adopt the existing registry without regenerating anything.
 */

import {
  enrichmentFromProducer,
  markFromProducer,
  producerFromEnrichment,
  producerFromMark,
  rawDependenciesOf,
} from '@corpus/core/model/compat';
import { producerNodesFrom } from '@corpus/core/registry/depGraph';
import { describe, expect, it } from 'vitest';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';

describe('mark round-trip', () => {
  for (const def of CODE_MARKS) {
    it(`markFromProducer(producerFromMark(${def.id})) strict-equals the def`, () => {
      // toStrictEqual: own-key preservation matters — a round-trip that
      // materializes absent optionals as own `undefined` keys (or vice versa)
      // is lossy in a way toEqual cannot see.
      expect(markFromProducer(producerFromMark(def))).toStrictEqual(def);
    });
  }
});

describe('enrichment round-trip', () => {
  for (const def of CODE_ENRICHMENTS) {
    it(`enrichmentFromProducer(producerFromEnrichment(${def.id})) strict-equals the def`, () => {
      expect(enrichmentFromProducer(producerFromEnrichment(def))).toStrictEqual(def);
    });
  }
});

describe('round-trip beyond the current registry (future/KV-authored shapes)', () => {
  const baseMark = CODE_MARKS[0];
  const baseEnrichment = CODE_ENRICHMENTS[0];

  it('UNKNOWN own fields on a mark def survive the round trip via legacy.rest', () => {
    const futureDef = {
      ...baseMark,
      some_future_field: { nested: true },
      model_hint: 'pro',
    } as unknown as typeof baseMark;
    const p = producerFromMark(futureDef);
    expect((p.legacy?.rest as Record<string, unknown>).some_future_field).toEqual({
      nested: true,
    });
    expect(markFromProducer(p)).toStrictEqual(futureDef);
  });

  it('UNKNOWN own fields on an enrichment def survive the round trip via legacy.rest', () => {
    const futureDef = {
      ...baseEnrichment,
      system_prompt: 'a flat KV-style field',
      output_schema: { type: 'object' },
    } as unknown as typeof baseEnrichment;
    expect(enrichmentFromProducer(producerFromEnrichment(futureDef))).toStrictEqual(futureDef);
  });

  it('explicit-undefined optionals round-trip as own keys (and absence as absence)', () => {
    const withOwnUndefined = {
      ...baseMark,
      description: undefined,
    } as unknown as typeof baseMark;
    const back = markFromProducer(producerFromMark(withOwnUndefined));
    expect('description' in back).toBe(true);
    expect(back.description).toBeUndefined();
    expect(back).toStrictEqual(withOwnUndefined);

    const withoutKey = { ...baseMark } as Record<string, unknown>;
    delete withoutKey.description;
    const back2 = markFromProducer(producerFromMark(withoutKey as typeof baseMark));
    expect('description' in back2).toBe(false);
  });
});

describe('dependency vocabulary round-trip', () => {
  it('rawDependenciesOf returns the verbatim dependencies for every def', () => {
    for (const def of CODE_MARKS) {
      expect(rawDependenciesOf(producerFromMark(def))).toEqual(def.dependencies ?? []);
    }
    for (const def of CODE_ENRICHMENTS) {
      expect(rawDependenciesOf(producerFromEnrichment(def))).toEqual(def.dependencies ?? []);
    }
  });

  it('producerNodesFrom over projected defs equals producerNodesFrom over the originals', () => {
    const originals = producerNodesFrom([...CODE_MARKS, ...CODE_ENRICHMENTS]);
    const projected = producerNodesFrom(
      [...CODE_MARKS.map(producerFromMark), ...CODE_ENRICHMENTS.map(producerFromEnrichment)].map(
        (p) => ({ id: p.id, dependencies: rawDependenciesOf(p) }),
      ),
    );
    expect(projected).toEqual(originals);
  });
});

describe('projection semantics spot-checks', () => {
  const markById = new Map(CODE_MARKS.map((d) => [d.id, d]));
  const enrichmentById = new Map(CODE_ENRICHMENTS.map((d) => [d.id, d]));

  it('rabbi mark: discovers, cardinality many, key_shape mark, token precision', () => {
    const def = markById.get('rabbi');
    expect(def).toBeDefined();
    const p = producerFromMark(def!);
    expect(p.kind).toBe('mark-instance');
    expect(p.anchoring.behavior).toBe('discovers');
    expect(p.anchoring.precision).toBe('token'); // phrase anchor
    expect(p.cardinality).toBe('many');
    expect(p.key_shape).toBe('mark');
    expect(p.scope).toBe('local');
    expect(p.legacy?.anchorKind).toBe('phrase');
    expect(p.inputs).toEqual([{ source: 'gemara' }]);
  });

  it('argument.synthesis: an aggregate enrichment projects to behavior aggregates', () => {
    const def = enrichmentById.get('argument.synthesis');
    expect(def).toBeDefined();
    expect(def!.mode).toBe('aggregate');
    const p = producerFromEnrichment(def!);
    expect(p.kind).toBe('enrichment');
    expect(p.anchoring.behavior).toBe('aggregates');
    expect(p.anchoring.target).toBe(def!.target_mark);
    expect(p.key_shape).toBe('enrich');
  });

  it('biyun.essay: fanOut dependencies project to cardinality per-input', () => {
    const def = enrichmentById.get('biyun.essay');
    expect(def).toBeDefined();
    expect(def!.dependencies?.some((d) => typeof d === 'object' && 'fanOut' in d && d.fanOut)).toBe(
      true,
    );
    const p = producerFromEnrichment(def!);
    expect(p.cardinality).toBe('per-input');
    expect(p.inputs.some((i) => 'producer' in i && i.fanOut === true)).toBe(true);
  });

  it('a non-fanOut enrichment projects to cardinality one', () => {
    const def = enrichmentById.get('argument.synthesis');
    expect(producerFromEnrichment(def!).cardinality).toBe('one');
  });

  it('an augment-content enrichment projects to behavior inherits', () => {
    const def = CODE_ENRICHMENTS.find((d) => d.mode === 'augment-content');
    expect(def).toBeDefined();
    expect(producerFromEnrichment(def!).anchoring.behavior).toBe('inherits');
  });
});
