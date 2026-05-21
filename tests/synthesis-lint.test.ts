import { describe, it, expect } from 'vitest';
import { lintSynthesis } from '../src/lib/synthesisLint';

// ---------------------------------------------------------------------------
// Should FLAG — the LLM cited a pasuk with English translation but no Hebrew
// verbatim text. Both the user's reported failure cases live here, plus
// quote-glyph and book-name variants.
// ---------------------------------------------------------------------------

describe('lintSynthesis — flags missing Hebrew excerpts', () => {
  it('flags the original reported case (verse ref → quoted English follows)', () => {
    const text = "Tehillim 119:62 states, 'At midnight I will rise to give thanks to You,' describing David's practice";
    const issues = lintSynthesis(text);
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatchObject({
      kind: 'missing-hebrew-excerpt',
      book: 'Tehillim',
      chapter: 119,
      verse: 62,
    });
  });

  it('flags the second reported case (verse ref → English in parens)', () => {
    const text = "juxtaposes this pasuk with Tehillim 119:148 ('My eyes preceded the watches') to resolve";
    const issues = lintSynthesis(text);
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatchObject({ book: 'Tehillim', chapter: 119, verse: 148 });
  });

  it('flags a Chumash citation with smart quotes', () => {
    const text = "Moshe declared “Hear O Israel” in Devarim 6:4 to the assembly";
    const issues = lintSynthesis(text);
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatchObject({ book: 'Devarim', chapter: 6, verse: 4 });
  });

  it('flags multiple bad citations in one paragraph', () => {
    const text = `Tehillim 119:62 states, 'At midnight I will rise to give thanks to You,' describing David. The gemara juxtaposes this with Tehillim 119:148 ('My eyes preceded the watches') to resolve the dispute.`;
    const issues = lintSynthesis(text);
    expect(issues.length).toBe(2);
    expect(issues.map(i => i.verse).sort((a, b) => a - b)).toEqual([62, 148]);
  });

  it('flags a Nevi\'im citation', () => {
    const text = "the prophet declares 'Comfort, comfort my people' in Yeshayahu 40:1";
    const issues = lintSynthesis(text);
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatchObject({ book: 'Yeshayahu', chapter: 40, verse: 1 });
  });
});

// ---------------------------------------------------------------------------
// Should NOT FLAG — citation has its Hebrew verbatim text, OR it's a bare
// reference (no quoted excerpt at all). These guard against false positives.
// ---------------------------------------------------------------------------

describe('lintSynthesis — allows clean citations', () => {
  const CLEAN: string[] = [
    // Hebrew excerpt in quotes BEFORE the ref — the canonical correct form.
    "'בחצות לילה אקום להודות לך' (Tehillim 119:62) — at midnight I rise",
    // Hebrew unquoted before the ref.
    "the pasuk בחצות לילה אקום (Tehillim 119:62) describes",
    // Hebrew with an English gloss following — also fine.
    "'קדמו עיני אשמרות' (Tehillim 119:148) — my eyes preceded the watches",
    // Bare reference, no quoted excerpt anywhere nearby. Just a citation.
    "the discussion of Tehillim 119:62 follows after the night-watches dispute",
    "Tehillim 119 has 176 verses, the longest perek in Tanach",
    // English quote that is NOT a pasuk excerpt (a rabbi's saying, generic prose).
    "Rabbi Yehoshua taught 'be diligent in study' across many sugyot in Tehillim",
    // Hebrew verse ref form (no English book name) — not matched by the regex,
    // and Hebrew is everywhere anyway.
    "'בחצות לילה אקום' (תהילים קי״ט:ס״ב) describes David's practice",
    // Empty / no citation.
    "",
    "a synthesis paragraph with no pesukim referenced at all",
  ];
  for (const text of CLEAN) {
    it(`leaves "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}" alone`, () => {
      expect(lintSynthesis(text)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Edge cases — book-name resolution + position accuracy.
// ---------------------------------------------------------------------------

describe('lintSynthesis — book-name disambiguation + position', () => {
  it('matches longer book names over their prefixes (Shmuel Aleph beats Shmuel)', () => {
    const text = "David's lament 'How are the mighty fallen' in Shmuel Bet 1:19 echoes";
    const issues = lintSynthesis(text);
    expect(issues.length).toBe(1);
    expect(issues[0].book).toBe('Shmuel Bet');
    expect(issues[0].chapter).toBe(1);
    expect(issues[0].verse).toBe(19);
  });

  it('reports the verse=0 sentinel when only a chapter is cited', () => {
    const text = "the long acrostic of Tehillim 119 begins 'Happy are those whose way is blameless'";
    const issues = lintSynthesis(text);
    expect(issues.length).toBe(1);
    expect(issues[0].verse).toBe(0);
    expect(issues[0].chapter).toBe(119);
  });

  it('reports the byte offset of each match for highlighting', () => {
    const text = "the gemara cites 'At midnight I will rise' (Tehillim 119:62) here";
    const issues = lintSynthesis(text);
    expect(issues.length).toBe(1);
    expect(text.slice(issues[0].index, issues[0].index + issues[0].match.length)).toBe('Tehillim 119:62');
  });

  it('does not match a partial-word collision (Tehillim inside a longer string)', () => {
    const text = "the Tehillimkop scrollwork — 'a decorative motif' — appears in 4:5 of the manuscript";
    expect(lintSynthesis(text)).toEqual([]);
  });
});
