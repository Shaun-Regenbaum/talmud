import { describe, it, expect } from 'vitest';
import { CODE_MARKS } from '../src/worker/code-marks';
import {
  AGGADATA_RECIPE, PASUK_RECIPE, HALACHA_RECIPE, RISHONIM_RECIPE, RABBI_RECIPE,
  ARGUMENT_RECIPE, ARGUMENT_OVERVIEW_RECIPE, TIDBIT_RECIPE, BIYUN_RECIPE, DAF_BACKGROUND_RECIPE,
  type SidebarRecipe,
} from '@corpus/core/sidebar/recipe';
import { t, setLang } from '../src/client/i18n';

const RECIPES: SidebarRecipe[] = [
  AGGADATA_RECIPE, PASUK_RECIPE, HALACHA_RECIPE, RISHONIM_RECIPE, RABBI_RECIPE,
  ARGUMENT_RECIPE, ARGUMENT_OVERVIEW_RECIPE, TIDBIT_RECIPE, BIYUN_RECIPE, DAF_BACKGROUND_RECIPE,
];

describe('sidebar recipes carried on mark definitions', () => {
  it('each recipe is attached to its mark (by markId), and recipe.kind/markId line up', () => {
    for (const recipe of RECIPES) {
      const mark = CODE_MARKS.find((m) => m.id === recipe.markId);
      expect(mark, `no mark for recipe.markId=${recipe.markId}`).toBeDefined();
      expect(mark!.recipe, `mark ${recipe.markId} missing recipe`).toBe(recipe);
    }
  });

  it('every explainer labelKey is a real catalog key (resolves, not a passthrough)', () => {
    setLang('en');
    for (const recipe of RECIPES) {
      for (const s of recipe.sections) {
        if (s.type !== 'explainer') continue;
        // t() returns the key itself for unknown keys; a real key resolves to
        // something different. Guards against a typo'd labelKey now that the
        // shared type widened CatalogKey to string.
        expect(t(s.labelKey as never), `labelKey '${s.labelKey}' doesn't resolve`).not.toBe(s.labelKey);
      }
    }
  });

  it('every special block declares a kebab name and every recipe has a synthesis when it has inspectable sections', () => {
    for (const recipe of RECIPES) {
      const specials = recipe.sections.filter((s) => s.type === 'special');
      for (const s of specials) expect((s as { block: string }).block).toMatch(/^[a-z][a-z-]*$/);
      const hasInspectable = recipe.sections.some((s) => s.type === 'explainer' || s.type === 'special');
      if (hasInspectable) expect(recipe.sections.some((s) => s.type === 'synthesis')).toBe(true);
    }
  });
});
