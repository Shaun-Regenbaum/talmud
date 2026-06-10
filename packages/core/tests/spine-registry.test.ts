import { describe, expect, it } from 'vitest';
import {
  createSpineRegistry,
  isOrderedSpine,
  type RefPart,
  type SpineDef,
} from '../src/model/spine.ts';

const bavli: SpineDef = {
  id: 'bavli',
  kind: 'text',
  label: 'Talmud Bavli',
  levels: ['tractate', 'page', 'seg'],
};

const tanach: SpineDef = {
  id: 'tanach',
  kind: 'text',
  levels: ['book', 'chapter', 'verse'],
  normalizePath: (path: RefPart[]) =>
    path.map((part) => (typeof part === 'string' ? part.toLowerCase() : part)),
};

const rabbiEntity: SpineDef = {
  id: 'entity:rabbi',
  kind: 'entity',
  levels: ['id'],
};

describe('createSpineRegistry', () => {
  it('registers and lists spines', () => {
    const reg = createSpineRegistry([bavli, tanach, rabbiEntity]);
    expect(reg.get('bavli')).toBe(bavli);
    expect(reg.get('nope')).toBeUndefined();
    expect(reg.list().map((d) => d.id)).toEqual(['bavli', 'tanach', 'entity:rabbi']);
  });

  it('throws on duplicate ids', () => {
    expect(() => createSpineRegistry([bavli, { ...tanach, id: 'bavli' }])).toThrow(
      /duplicate spine id: bavli/,
    );
  });

  it('ref validates depth: 1..levels.length', () => {
    const reg = createSpineRegistry([bavli]);
    expect(reg.ref('bavli', ['Berakhot'])).toEqual(['Berakhot']);
    expect(reg.ref('bavli', ['Berakhot', '2a'])).toEqual(['Berakhot', '2a']);
    expect(reg.ref('bavli', ['Berakhot', '2a', 3])).toEqual(['Berakhot', '2a', 3]);
    expect(() => reg.ref('bavli', [])).toThrow(/depth/);
    expect(() => reg.ref('bavli', ['Berakhot', '2a', 3, 9])).toThrow(/depth/);
  });

  it('ref throws on an unknown spine', () => {
    const reg = createSpineRegistry([bavli]);
    expect(() => reg.ref('tanach', ['Genesis'])).toThrow(/unknown spine: tanach/);
  });

  it('ref applies the normalizePath hook', () => {
    const reg = createSpineRegistry([tanach]);
    expect(reg.ref('tanach', ['Genesis', 1, 1])).toEqual(['genesis', 1, 1]);
  });

  it('entity spines: single-level refs, unordered by default', () => {
    const reg = createSpineRegistry([rabbiEntity]);
    expect(reg.ref('entity:rabbi', ['abaye'])).toEqual(['abaye']);
    expect(() => reg.ref('entity:rabbi', ['abaye', 'extra'])).toThrow(/depth/);
    expect(isOrderedSpine(rabbiEntity)).toBe(false);
    expect(isOrderedSpine(bavli)).toBe(true);
    expect(isOrderedSpine({ ...rabbiEntity, ordered: true })).toBe(true);
  });
});
