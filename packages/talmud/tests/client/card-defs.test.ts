import { describe, expect, it } from 'vitest';
import {
  CARD_DEFS,
  rabbiDisplayInstance,
  rabbiSynthInstance,
} from '../../src/client/ArgumentSidebar';

describe('CARD_DEFS registry', () => {
  it('every entry self-describes: recipe.kind === key, blocks registered for every special section', () => {
    for (const [kind, def] of Object.entries(CARD_DEFS)) {
      if (!def) continue;
      expect(def.recipe.kind).toBe(kind);
      const specialBlocks = def.recipe.sections.flatMap((s) =>
        s.type === 'special' ? [s.block] : [],
      );
      for (const b of specialBlocks) {
        expect(def.blocks[b], `${kind} declares special '${b}' but it isn't in blocks`).toBeTypeOf(
          'function',
        );
      }
    }
  });

  it('covers exactly the recipe-driven kinds', () => {
    expect(Object.keys(CARD_DEFS).sort()).toEqual(
      [
        'aggadata',
        'argument',
        'argument-overview',
        'biyun',
        'chart',
        'daf-background',
        'geography',
        'halacha',
        'pesuk',
        'rabbi',
        'rishonim',
        'tidbit',
        'yerushalmi',
      ].sort(),
    );
  });
});

import type { IdentifiedRabbi } from '../../src/client/dafContext';
import captured from '../fixtures/reviewed-yirmeyah.json';

describe('reviewed person sidebar', () => {
  const rabbi: IdentifiedRabbi = {
    slug: captured.slug,
    name: captured.entry.canonical,
    nameHe: captured.entry.canonicalHe,
    generation: 'unknown',
    identityStatus: 'reviewed_person',
    era: captured.entry.era,
    region: captured.entry.region as IdentifiedRabbi['region'],
    places: [],
    moved: null,
    bio: captured.entry.bio,
    image: null,
    wiki: null,
  };
  it('carries saved identity and biography without changing synthesis inputs', () => {
    expect(rabbiDisplayInstance(rabbi).fields).toMatchObject({
      identityStatus: 'reviewed_person',
      era: captured.entry.era,
      bio: captured.entry.bio,
      slug: captured.slug,
    });
    expect(rabbiSynthInstance(rabbi)).not.toHaveProperty('identityStatus');
    expect(rabbiSynthInstance(rabbi)).not.toHaveProperty('bio');
  });
  it('uses the saved biography only for reviewed cards, keeping the producer recipe intact', () => {
    const def = CARD_DEFS.rabbi!;
    const recipe = def.recipeFor!({ kind: 'rabbi', rabbi });
    expect(recipe.sections.some((s) => s.type === 'synthesis')).toBe(true);
    expect(
      recipe.sections.some((s) => s.type === 'special' && s.block === 'rabbi-reviewed-biography'),
    ).toBe(true);
    expect(def.recipe.sections.some((s) => s.type === 'synthesis')).toBe(true);
    expect(def.recipeFor!({ kind: 'rabbi', rabbi: { ...rabbi, identityStatus: undefined } })).toBe(
      def.recipe,
    );
  });
});

it('uses exact registry cards even when their identity has no review stamp', () => {
  const recipe = CARD_DEFS.rabbi!.recipeFor!({
    kind: 'rabbi',
    rabbi: { registryIdentity: true } as IdentifiedRabbi,
  });
  expect(recipe.sections.some((s) => s.type === 'synthesis')).toBe(true);
});
