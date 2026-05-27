import { describe, it, expect } from 'vitest';
import { sanitizeHebraizeOutput } from '../src/worker/index';

// ---------------------------------------------------------------------------
// sanitizeHebraizeOutput — the deterministic guard applied to the /api/hebraize
// LLM output before it is cached or returned. The endpoint's job is to convert
// parenthesized transliterations to Hebrew while LEAVING English glosses alone.
// When the model ignores that rule and re-translates a Form B gloss, the result
// is a visible `X (X)` echo. The guard collapses those so no model slip (or
// stale cache entry) can leak an echo to the daf.
//
// Regression for Shabbat 125b aggadata, where the old Gemma model turned
//   המעשה (the story) involves רבי יהודה הנשיא (Rabbi Yehuda HaNasi)...
// into a string full of echoes. The exact bad output is captured below.
// ---------------------------------------------------------------------------

describe('sanitizeHebraizeOutput — collapses model-emitted echoes', () => {
  it('cleans the full Shabbat 125b background echo cascade', () => {
    const badModelOutput =
      'המעשה (the story) involves רבי יהודה הנשיא (רבי יהודה הנשיא), the redactor of ' +
      'the משנה (משנה) and the patriarch (נשיא) of the Jewish community in ארץ ישראל ' +
      '(ארץ ישראל).';
    const expected =
      'המעשה (the story) involves רבי יהודה הנשיא, the redactor of the משנה and the ' +
      'patriarch (נשיא) of the Jewish community in ארץ ישראל.';
    expect(sanitizeHebraizeOutput(badModelOutput)).toBe(expected);
  });

  it('cleans the synthesis-slice echo (מעשה (מעשה))', () => {
    const badModelOutput =
      'requires a concrete מעשה (מעשה) or mere mental calculation';
    expect(sanitizeHebraizeOutput(badModelOutput)).toBe(
      'requires a concrete מעשה or mere mental calculation',
    );
  });

  it('leaves a clean (correct) hebraization untouched', () => {
    // What a well-behaved model returns: real transliterations converted,
    // English glosses left in place. No echoes, so nothing to strip.
    const goodModelOutput =
      'designation (ייעוד) requires a concrete מעשה (a physical act), not mere מחשבה (thought)';
    expect(sanitizeHebraizeOutput(goodModelOutput)).toBe(goodModelOutput);
  });

  it('preserves a legitimate cross-script Form B gloss', () => {
    // Rabbi Akiva (רבי עקיבא): different scripts, not an echo — must survive.
    const text = 'a ruling of Rabbi Akiva (רבי עקיבא) on the matter';
    expect(sanitizeHebraizeOutput(text)).toBe(text);
  });
});
