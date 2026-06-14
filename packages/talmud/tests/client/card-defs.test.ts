import { describe, expect, it } from 'vitest';
import { CARD_DEFS } from '../../src/client/ArgumentSidebar';

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
