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
    { type: 'special', block: 'aggadata-parallels' },
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
});
