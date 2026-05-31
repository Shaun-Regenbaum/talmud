import { describe, it, expect } from 'vitest';
import { orderBackgroundGroups, BACKGROUND_CATEGORY_ORDER, type BackgroundGroup } from '../src/client/backgroundGroups';
import { CODE_MARKS, CODE_ENRICHMENTS } from '../src/worker/code-marks';
import { DAF_BACKGROUND_CONCEPTS_OUTPUT_SCHEMA } from '../src/worker/output-schemas';

const term = (t: string, gloss = 'a gloss') => ({ term: t, termHe: '', gloss });

describe('orderBackgroundGroups — normalize the daf-background.concepts output', () => {
  it('orders groups into the canonical category order regardless of input order', () => {
    const input: BackgroundGroup[] = [
      { category: 'assumed-prior', terms: [term('prior')] },
      { category: 'realia', terms: [term('maneh')] },
      { category: 'legal-concepts', terms: [term('shemira')] },
    ];
    expect(orderBackgroundGroups(input).map((g) => g.category))
      .toEqual(['legal-concepts', 'realia', 'assumed-prior']);
  });

  it('drops groups with no usable terms (empty array stays out)', () => {
    const input: BackgroundGroup[] = [
      { category: 'legal-concepts', terms: [] },
      { category: 'realia', terms: [term('maneh')] },
    ];
    expect(orderBackgroundGroups(input).map((g) => g.category)).toEqual(['realia']);
  });

  it('drops terms missing a label or a gloss', () => {
    const input: BackgroundGroup[] = [
      { category: 'realia', terms: [term('maneh'), { term: '', termHe: '', gloss: 'x' }, { term: 'ox', termHe: '', gloss: '' }] },
    ];
    const out = orderBackgroundGroups(input);
    expect(out).toHaveLength(1);
    expect(out[0].terms.map((t) => t.term)).toEqual(['maneh']);
  });

  it('ignores unknown categories the LLM might invent', () => {
    const input = [
      { category: 'mysticism', terms: [term('sefirot')] },
      { category: 'persons', terms: [term('Rava')] },
    ] as unknown as BackgroundGroup[];
    expect(orderBackgroundGroups(input).map((g) => g.category)).toEqual(['persons']);
  });

  it('merges duplicate emissions of the same category', () => {
    const input: BackgroundGroup[] = [
      { category: 'legal-concepts', terms: [term('a')] },
      { category: 'legal-concepts', terms: [term('b')] },
    ];
    const out = orderBackgroundGroups(input);
    expect(out).toHaveLength(1);
    expect(out[0].terms.map((t) => t.term)).toEqual(['a', 'b']);
  });

  it('empty / undefined / non-array in -> empty out', () => {
    expect(orderBackgroundGroups([])).toEqual([]);
    expect(orderBackgroundGroups(undefined)).toEqual([]);
    expect(orderBackgroundGroups('nope' as unknown as BackgroundGroup[])).toEqual([]);
  });
});

describe('daf-background registry wiring', () => {
  const mark = CODE_MARKS.find((m) => m.id === 'daf-background');
  const concepts = CODE_ENRICHMENTS.find((e) => e.id === 'daf-background.concepts');
  const synthesis = CODE_ENRICHMENTS.find((e) => e.id === 'daf-background.synthesis');

  const depKey = (d: unknown): string =>
    typeof d === 'string' ? d
      : d && typeof d === 'object' && 'enrichment' in d ? `e:${(d as { enrichment: string }).enrichment}`
      : d && typeof d === 'object' && 'mark' in d ? `m:${(d as { mark: string }).mark}`
      : '?';

  it('the mark exists, is reader-visible (not experimental), and renders as a chip', () => {
    expect(mark).toBeTruthy();
    expect(mark!.experimental).toBeFalsy();
    expect((mark!.render as { kind?: string }).kind).toBe('chip');
    expect(mark!.anchor).toBe('whole-daf');
  });

  it('concepts is an augment-content leaf grounded on gemara + context + argument sections', () => {
    expect(concepts).toBeTruthy();
    expect(concepts!.mode).toBe('augment-content');
    expect(concepts!.target_mark).toBe('daf-background');
    const deps = (concepts!.dependencies ?? []).map(depKey);
    expect(deps).toContain('gemara');
    expect(deps).toContain('context');
    expect(deps).toContain('m:argument');
  });

  it('synthesis is an aggregate that depends on the concepts leaf', () => {
    expect(synthesis).toBeTruthy();
    expect(synthesis!.mode).toBe('aggregate');
    const deps = (synthesis!.dependencies ?? []).map(depKey);
    expect(deps).toContain('e:daf-background.concepts');
  });
});

describe('DAF_BACKGROUND_CONCEPTS_OUTPUT_SCHEMA contract', () => {
  it('is a strict response format with the expected name', () => {
    expect(DAF_BACKGROUND_CONCEPTS_OUTPUT_SCHEMA.name).toBe('daf_background_concepts');
    expect(DAF_BACKGROUND_CONCEPTS_OUTPUT_SCHEMA.strict).toBe(true);
  });

  it('locks the four categories and the term fields', () => {
    const json = JSON.stringify(DAF_BACKGROUND_CONCEPTS_OUTPUT_SCHEMA.schema);
    for (const cat of BACKGROUND_CATEGORY_ORDER) expect(json).toContain(cat);
    for (const key of ['groups', 'terms', 'term', 'termHe', 'gloss']) expect(json).toContain(key);
  });
});
