import { describe, it, expect } from 'vitest';
import { producerNodesFrom, validateProducerGraph } from '@corpus/core/registry/depGraph';
import { CODE_MARKS, CODE_ENRICHMENTS } from '../src/worker/code-marks';

// Source inputs are the non-producer leaves a dependency may point at.
// 'halacha-refs' feeds grounded codifier refs into halacha.codification;
// 'yerushalmi-text' feeds the real parallel Jerusalem Talmud text into the
// yerushalmi mark (named distinctly from the `yerushalmi` mark id so it reads
// as a slice input, not a `{ mark: 'yerushalmi' }` producer reference).
const SOURCES = new Set(['gemara', 'commentaries', 'context', 'context-light', 'mishna', 'halacha-refs', 'yerushalmi-text', 'incoming']);

describe('validateProducerGraph — unit', () => {
  it('flags a dependency on a nonexistent producer/source as dangling', () => {
    const nodes = producerNodesFrom([
      { id: 'a', dependencies: ['gemara', { enrichment: 'a.typo' }] },
    ]);
    expect(validateProducerGraph(nodes, SOURCES)).toEqual([
      { kind: 'dangling-dependency', id: 'a', detail: 'a.typo' },
    ]);
  });

  it('passes a clean graph (producers + known sources only)', () => {
    const nodes = producerNodesFrom([
      { id: 'a', dependencies: ['gemara'] },
      { id: 'b', dependencies: [{ enrichment: 'a' }, 'commentaries'] },
    ]);
    expect(validateProducerGraph(nodes, SOURCES)).toEqual([]);
  });

  it('detects a dependency cycle', () => {
    const nodes = producerNodesFrom([
      { id: 'a', dependencies: [{ enrichment: 'b' }] },
      { id: 'b', dependencies: [{ enrichment: 'a' }] },
    ]);
    const issues = validateProducerGraph(nodes, SOURCES);
    expect(issues.some((i) => i.kind === 'cycle')).toBe(true);
  });
});

describe('the LIVE registry has a healthy producer graph', () => {
  // CI guard: a typo'd dependency id, a renamed producer a dependent didn't
  // follow, or an accidental cycle fails here before it ships. If a NEW source
  // input is added, add it to SOURCES above (a deliberate acknowledgement).
  it('no dangling dependencies and no cycles across CODE_MARKS + CODE_ENRICHMENTS', () => {
    const nodes = producerNodesFrom([...CODE_MARKS, ...CODE_ENRICHMENTS]);
    const issues = validateProducerGraph(nodes, SOURCES);
    expect(issues).toEqual([]);
  });
});
