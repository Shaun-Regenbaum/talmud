import { describe, expect, it } from 'vitest';
import { resolveSidebarHint, type SidebarHint } from '../src/client/sidebar/primitives';

// The render-hint vocabulary: a hint + an instance's fields resolve to concrete
// display props. Locks the mapping the generic sidebar depends on as more marks
// move from bespoke *Body components onto hints.
describe('resolveSidebarHint', () => {
  const PLACE: SidebarHint = {
    kind: 'place',
    markId: 'places',
    titleField: 'name',
    titleHeField: 'nameHe',
    instanceKeyField: 'name',
  };

  // biome-ignore lint/suspicious/noTemplateCurlyInString: the test name documents the literal key format
  it('maps title/titleHe/markId and builds instanceKey as `${markId}:${keyVal}`', () => {
    expect(resolveSidebarHint(PLACE, { name: 'Tiberias', nameHe: 'טבריה' })).toEqual({
      accent: '#222', // ACCENTS.place
      title: 'Tiberias',
      titleHe: 'טבריה',
      markId: 'places',
      instanceKey: 'places:Tiberias',
    });
  });

  it('omits titleHe when the field is absent/empty (no empty Hebrew heading)', () => {
    expect(resolveSidebarHint(PLACE, { name: 'Yavneh' }).titleHe).toBeUndefined();
    expect(resolveSidebarHint(PLACE, { name: 'Yavneh', nameHe: '' }).titleHe).toBeUndefined();
  });

  it('defaults the instanceKey field to titleField when not specified', () => {
    const hint: SidebarHint = { kind: 'rabbi', markId: 'rabbi', titleField: 'name' };
    expect(resolveSidebarHint(hint, { name: 'Abaye' }).instanceKey).toBe('rabbi:Abaye');
  });

  it('coerces non-string fields to empty strings (resilient to malformed instances)', () => {
    expect(resolveSidebarHint(PLACE, { name: 42 as unknown as string }).title).toBe('');
  });
});
