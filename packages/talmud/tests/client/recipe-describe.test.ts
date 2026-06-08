import { describe, it, expect } from 'vitest';
import { describeRecipe, type SidebarRecipe } from '../../src/client/sidebar/primitives';

const AGGADATA: SidebarRecipe = {
  kind: 'aggadata',
  markId: 'aggadata',
  titleField: 'title',
  titleHeField: 'titleHe',
  sections: [
    { type: 'tags', fields: ['theme'] },
    { type: 'prose', field: 'summary' },
    { type: 'synthesis' },
    { type: 'explainer', dep: 'aggadata.background', textField: 'background', labelKey: 'aggadata.background' },
    { type: 'special', block: 'aggadata-parallels', deps: ['aggadata.parallels'] },
    { type: 'qa' },
  ],
};

describe('describeRecipe', () => {
  it('projects the header from title fields', () => {
    expect(describeRecipe(AGGADATA).header).toBe('title / titleHe');
    expect(describeRecipe({ ...AGGADATA, titleHeField: undefined }).header).toBe('title');
  });

  it('numbers sections in order and reports each type', () => {
    const { sections } = describeRecipe(AGGADATA);
    expect(sections.map((s) => [s.n, s.type])).toEqual([
      [1, 'tags'], [2, 'prose'], [3, 'synthesis'], [4, 'explainer'], [5, 'special'], [6, 'qa'],
    ]);
  });

  it('reports each section target (field, dep, or block) and null for self-contained', () => {
    const byType = Object.fromEntries(describeRecipe(AGGADATA).sections.map((s) => [s.type, s]));
    expect(byType.tags.target).toBe('theme');
    expect(byType.prose.target).toBe('summary');
    expect(byType.explainer.target).toBe('aggadata.background'); // the leaf id you'd inspect
    expect(byType.special.target).toBe('aggadata-parallels');
    expect(byType.synthesis.target).toBeNull();
    expect(byType.qa.target).toBeNull();
  });

  it('flags ONLY special sections as custom', () => {
    const { sections } = describeRecipe(AGGADATA);
    expect(sections.filter((s) => s.custom).map((s) => s.type)).toEqual(['special']);
  });

  it('joins multiple tag fields', () => {
    const r = describeRecipe({ ...AGGADATA, sections: [{ type: 'tags', fields: ['theme', 'era'] }] });
    expect(r.sections[0].target).toBe('theme, era');
  });

  it('gives each section an inspect target — leaf for explainer/special, null (synthesis+instance) for tags/prose/synthesis, none for qa', () => {
    const byType = Object.fromEntries(describeRecipe(AGGADATA).sections.map((s) => [s.type, s]));
    expect(byType.explainer.inspect).toEqual({ leafId: 'aggadata.background' });
    expect(byType.special.inspect).toEqual({ leafId: 'aggadata.parallels' }); // its first declared dep
    expect(byType.tags.inspect).toEqual({ leafId: null });   // → synthesis+instance (the extraction)
    expect(byType.prose.inspect).toEqual({ leafId: null });
    expect(byType.synthesis.inspect).toEqual({ leafId: null });
    expect(byType.qa.inspect).toBeNull();                    // nothing to inspect
  });

  it('surfaces a special block declared inputs; falls back to the instance view when undeclared', () => {
    const byType = Object.fromEntries(describeRecipe(AGGADATA).sections.map((s) => [s.type, s]));
    expect(byType.special.inputs).toEqual(['aggadata.parallels']);
    const noDeps = describeRecipe({ ...AGGADATA, sections: [{ type: 'special', block: 'x' }] });
    expect(noDeps.sections[0].inputs).toBeUndefined();
    expect(noDeps.sections[0].inspect).toEqual({ leafId: null });
  });
});
