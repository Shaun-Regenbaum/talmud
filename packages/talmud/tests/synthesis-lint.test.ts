import { describe, it, expect } from 'vitest';
import { lintSynthesis, lintCalques } from '../src/lib/synthesisLint';

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

// ---------------------------------------------------------------------------
// Calque detector — flags word-for-word translations of fixed Hebrew/Aramaic
// halachic terms (e.g. "most flesh" for רוב בשר). These read as nonsense to
// learners because the calqued English doesn't carry the technical meaning.
// HEBREW_GLOSS_STYLE forbids them; this test guards against the prompt
// regressing back to them.
// ---------------------------------------------------------------------------

describe('lintCalques — flags known calques', () => {
  it('flags the original Chulin 21a failure: "without most flesh"', () => {
    const text = "The Gemara resolves the objection that Eli's broken neck occurred without most flesh by distinguishing old age (זקנה שאני).";
    const issues = lintCalques(text);
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatchObject({
      kind: 'calque',
      hebrew: 'רוב בשר',
      meaning: 'majority of surrounding flesh (shechita / neveila threshold)',
    });
    expect(issues[0].match.toLowerCase()).toContain('most flesh');
  });

  it('flags the padded variant "severing most of the flesh"', () => {
    const text = "Rashi explains that Eli's advanced age weakened his bones, so the neck snapped without the usual requirement of severing most of the flesh.";
    const issues = lintCalques(text);
    expect(issues.length).toBe(1);
    expect(issues[0].hebrew).toBe('רוב בשר');
  });

  it('flags "majority of the flesh"', () => {
    const text = "The threshold requires breaking the spine plus the majority of the flesh torn with it.";
    const issues = lintCalques(text);
    expect(issues.length).toBe(1);
    expect(issues[0].hebrew).toBe('רוב בשר');
  });

  it('flags "son of his year" / "sons of their year" (calque of בן שנתו)', () => {
    expect(lintCalques('a son of his year is brought as a korban').length).toBe(1);
    expect(lintCalques('sheep that are sons of their year').length).toBe(1);
  });

  it('flags "house of justice" (calque of בית דין)', () => {
    const text = "the house of justice required three judges to convene";
    const issues = lintCalques(text);
    expect(issues.length).toBe(1);
    expect(issues[0].hebrew).toBe('בית דין');
  });

  it('flags both phrasings of the Noahide-laws calque', () => {
    const a = "the seven commandments of the sons of Noah apply to gentiles";
    const b = "Rambam explains the sons of Noah's commandments in Hilchot Melachim";
    expect(lintCalques(a).length).toBe(1);
    expect(lintCalques(a)[0].hebrew).toBe('שבע מצוות בני נח');
    expect(lintCalques(b).length).toBe(1);
    expect(lintCalques(b)[0].hebrew).toBe('שבע מצוות בני נח');
  });

  it('reports the offset of each match', () => {
    const text = "prefix prefix prefix without most flesh suffix suffix";
    const issues = lintCalques(text);
    expect(issues.length).toBe(1);
    const slice = text.slice(issues[0].index, issues[0].index + issues[0].match.length);
    expect(slice.toLowerCase()).toContain('most flesh');
  });

  it('flags multiple distinct calques in one paragraph', () => {
    const text = "the house of justice ruled on whether a son of his year qualifies, citing the seven commandments of the sons of Noah";
    const issues = lintCalques(text);
    // 3 distinct calques: בית דין, בן שנתו, שבע מצוות בני נח.
    const hebrews = issues.map(i => i.hebrew).sort();
    expect(hebrews).toEqual(['בית דין', 'בן שנתו', 'שבע מצוות בני נח']);
  });
});

describe('lintCalques — does NOT flag legitimate prose', () => {
  const CLEAN: string[] = [
    // Hebrew script is the canonical anchor — these are the correct forms.
    "Eli's broken neck occurred without רוב בשר (the majority of surrounding neck-flesh that must tear with the spine)",
    "the קרבן is a בן שנתו (year-old animal)",
    "the בית דין convened three judges",
    "the שבע מצוות בני נח (Noahide laws) apply to all humanity",
    // English using conventional equivalents, not calques.
    "the court convened three judges",
    "the Noahide laws apply to gentiles, not the Sinai covenant",
    "the sacrifice required a year-old animal",
    // Bare "sons of Noah" — legitimate biblical reference to Shem, Cham, Yefet
    // in Bereishit 10. Must NOT be flagged.
    "the genealogy of the sons of Noah is laid out in Bereishit 10",
    "Shem, Cham, and Yefet — the sons of Noah — repopulated the earth after the flood",
    // Plain "flesh" without the calque collocation. Must NOT be flagged.
    "the flesh of the animal must be salted before cooking",
    "Rashi clarifies the laws of forbidden flesh in his commentary",
    // Words that share a stem but aren't the calque.
    "the court ordered a fleshing of the hide before tanning",
    // Empty / no calques.
    "",
    "a synthesis paragraph with no offending phrases at all",
  ];
  for (const text of CLEAN) {
    it(`leaves "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}" alone`, () => {
      expect(lintCalques(text)).toEqual([]);
    });
  }
});
