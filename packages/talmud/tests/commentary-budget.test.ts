import { describe, expect, it } from 'vitest';
import { type CommentariesSlice, commentariesSliceToString } from '../src/worker/run-sources';

// A dense daf's full rishonim can exceed the model's 1M-token context limit and
// hard-fail the enrichment (a 400 → no synthesis at all). commentariesSliceToString
// caps the text fed into the prompt. These pin that: ordinary text is untouched,
// pathological text is bounded, and the omission is announced (never silent).
const slice = (by: Record<string, { hebrew: string; english: string }>): CommentariesSlice => ({
  tractate: 'Bava Metzia',
  page: '2a',
  by_commentator: Object.fromEntries(Object.entries(by).map(([n, v]) => [n, { ...v, ref: n }])),
});

describe('commentariesSliceToString — context budget', () => {
  it('leaves ordinary commentary untouched', () => {
    const out = commentariesSliceToString(
      slice({ Rashi: { hebrew: 'רש"י', english: 'Rashi says' } }),
    );
    expect(out).toBe('[Rashi]\nרש"י\nRashi says');
    expect(out).not.toContain('trimmed');
  });

  it('caps a single huge commentator and marks the trim', () => {
    const out = commentariesSliceToString(
      slice({ Tosafot: { hebrew: 'ת'.repeat(50_000), english: 'a'.repeat(50_000) } }),
    );
    expect(out).toContain('[trimmed]');
    // Bounded well under the raw 100k: per-work caps are 12k HE + 16k EN.
    expect(out.length).toBeLessThan(40_000);
  });

  it('drops the long tail past the total budget and announces how many', () => {
    // 60 commentators × ~12k chars each would be ~720k — over the 360k budget.
    const many: Record<string, { hebrew: string; english: string }> = {};
    for (let i = 0; i < 60; i++) {
      many[`Work${String(i).padStart(2, '0')}`] = {
        hebrew: 'ת'.repeat(11_000),
        english: 'a'.repeat(11_000),
      };
    }
    const out = commentariesSliceToString(slice(many));
    expect(out).toMatch(/\d+ further commentaries omitted to fit the context budget/);
  });

  it('returns empty string when there is no commentary', () => {
    expect(commentariesSliceToString(slice({}))).toBe('');
  });
});
