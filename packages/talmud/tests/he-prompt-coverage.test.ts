import { describe, expect, it } from 'vitest';
import { CODE_ENRICHMENTS } from '../src/worker/code-marks';

// Hebrew-mode enrichment regression guard.
//
// In he mode the worker selects `system_prompt_he` and falls back to the English
// prompt when one is absent (src/worker/index.ts ~1890). The fallback is silent:
// an enrichment without a Hebrew prompt produces ENGLISH prose under the `:he`
// cache key, which is exactly the "English text in Hebrew mode" bug. This test
// locks the set of user-facing prose enrichments that MUST stay bilingual, so a
// new one (or a refactor that drops a `systemPromptHe`) fails loudly here.
const MUST_BE_BILINGUAL = [
  // whole-daf
  'argument-overview.synthesis',
  'daf-background.concepts',
  'daf-background.synthesis',
  // per-section / story
  'argument.synthesis',
  'argument.background',
  'argument.voices',
  'argument.narrative',
  // per-move
  'argument-move.synthesis',
  // leaf-driven panels
  'halacha.synthesis',
  'pesukim.synthesis',
  'aggadata.synthesis',
];

const byId = new Map(CODE_ENRICHMENTS.map((e) => [e.id, e]));
type HePrompts = { system_prompt_he?: string; user_prompt_template_he?: string };
const hePrompts = (id: string): HePrompts | undefined =>
  byId.get(id)?.extractor as HePrompts | undefined;

describe('Hebrew prompt coverage — prose enrichments never silently fall back to English', () => {
  for (const id of MUST_BE_BILINGUAL) {
    it(`${id} has a Hebrew system prompt + user template`, () => {
      expect(byId.get(id), `enrichment ${id} not found`).toBeDefined();
      const ext = hePrompts(id)!;
      expect(
        (ext.system_prompt_he ?? '').trim().length,
        `${id} missing system_prompt_he`,
      ).toBeGreaterThan(0);
      expect(
        (ext.user_prompt_template_he ?? '').trim().length,
        `${id} missing user_prompt_template_he`,
      ).toBeGreaterThan(0);
    });
  }

  it('every Hebrew prompt is actually Hebrew (contains Hebrew letters, not a copied English string)', () => {
    const hebrew = /[֐-׿]/;
    for (const id of MUST_BE_BILINGUAL) {
      expect(
        hebrew.test(hePrompts(id)?.system_prompt_he ?? ''),
        `${id} system_prompt_he has no Hebrew letters`,
      ).toBe(true);
    }
  });
});
