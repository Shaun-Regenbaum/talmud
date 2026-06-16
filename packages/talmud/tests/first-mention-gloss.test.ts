import { describe, expect, it } from 'vitest';
import {
  buildConceptMatcher,
  firstMentionGloss,
  glossKey,
  tokenizeWithMatcher,
} from '../src/client/conceptLinks';
import { hebraize, stripEchoParens } from '../src/client/hebraize';
import { globalTerms, type Term } from '../src/lib/terms/registry';

// A glossary term is glossed inline on its FIRST mention in a prose unit and
// runs bare after — the tooltip carries the gloss for later mentions, so the
// repeated parenthetical is clutter. firstMentionGloss strips every-but-first
// inline gloss, but only when the parenthetical restates the SAME gloss.

const mk = (t: Partial<Term> & Pick<Term, 'hebrew' | 'gloss'>): Term => ({
  display: 'hebrew-first-gloss',
  scope: 'daf',
  ...t,
});

const KOHEN = mk({ en: 'Kohen', hebrew: 'כהן', gloss: 'a Temple priest' });
const gloss = (text: string, terms: Term[] = [KOHEN]): string =>
  firstMentionGloss(text, buildConceptMatcher(terms));

describe('glossKey', () => {
  it('normalizes case, articles, trailing punctuation, whitespace', () => {
    expect(glossKey('The Binding Law.')).toBe('binding law');
    expect(glossKey('  "after the fact"  ')).toBe('after the fact');
    expect(glossKey('a Temple priest')).toBe('temple priest');
  });
});

describe('firstMentionGloss', () => {
  it('keeps the first inline gloss and strips a later repeat', () => {
    const out = gloss('A Kohen (a Temple priest) serves; later the Kohen (a Temple priest) eats.');
    expect(out).toBe('A Kohen (a Temple priest) serves; later the Kohen eats.');
  });

  it('keeps a meaningful (non-gloss) parenthetical on a repeat', () => {
    const out = gloss('A Kohen (a Temple priest) serves; the Kohen (according to Rashi) may.');
    expect(out).toBe('A Kohen (a Temple priest) serves; the Kohen (according to Rashi) may.');
  });

  it('promotes the first GLOSS even when the first MENTION was bare', () => {
    // No gloss on mention 1 -> the gloss on mention 2 is the first one, kept.
    const out = gloss('The Kohen serves; a Kohen (a Temple priest) eats.');
    expect(out).toBe('The Kohen serves; a Kohen (a Temple priest) eats.');
  });

  it('treats the Hebrew and English forms as the same term', () => {
    const out = gloss('A Kohen (a Temple priest) serves; כהן (a Temple priest) again.');
    expect(out).toBe('A Kohen (a Temple priest) serves; כהן again.');
  });

  it('strips a shorter restatement contained in the registry gloss', () => {
    // Registry gloss is the fuller form; a later inline gloss is a shorter
    // restatement contained in it -> recognized and stripped.
    const out = gloss('A Kohen (a Temple priest) serves; the Kohen (priest) eats.');
    expect(out).toBe('A Kohen (a Temple priest) serves; the Kohen eats.');
  });

  // ── Regressions from the codex review of the first cut ──────────────────────
  it('keeps a repeated QUALIFIER that is not the gloss (not "(according to Rashi)")', () => {
    const g = buildConceptMatcher(globalTerms());
    const input =
      'הלכה (according to Rashi) is strict; later הלכה (according to Rashi) is lenient.';
    expect(firstMentionGloss(input, g)).toBe(input);
  });

  it('keeps a qualifier that merely CONTAINS the gloss text', () => {
    const g = buildConceptMatcher(globalTerms());
    const input =
      'הלכה (binding law) applies; later הלכה (not binding law in this case) is only custom.';
    expect(firstMentionGloss(input, g)).toBe(input);
  });

  it('strips a repeated gloss that itself carries nested parens (סימן)', () => {
    const out = firstMentionGloss(
      'סימן (a shechita organ (trachea / esophagus)) is cut; another סימן (a shechita organ (trachea / esophagus)) is checked.',
      buildConceptMatcher(globalTerms()),
    );
    expect(out).toBe(
      'סימן (a shechita organ (trachea / esophagus)) is cut; another סימן is checked.',
    );
  });

  it('is idempotent even with adjacent duplicate gloss parens', () => {
    const g = buildConceptMatcher(globalTerms());
    const once = firstMentionGloss(
      'הלכה (binding law); later הלכה (binding law) (binding law).',
      g,
    );
    expect(once).toBe('הלכה (binding law); later הלכה.');
    expect(firstMentionGloss(once, g)).toBe(once);
  });

  it('does not touch text further along the fragment when stripping (no global tidy)', () => {
    // The double space inside the later quote must survive the strip.
    const out = gloss(
      'A Kohen (a Temple priest) serves; later Kohen (a Temple priest) quotes "A  B".',
    );
    expect(out).toBe('A Kohen (a Temple priest) serves; later Kohen quotes "A  B".');
  });

  it('is linear on an unterminated parenthetical (no catastrophic backtracking)', () => {
    const input = `A Kohen (${'a'.repeat(5000)}`; // no closing paren
    const start = Date.now();
    expect(gloss(input)).toBe(input); // nothing to strip; returns promptly
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('tidies the seam — no space left before punctuation', () => {
    const out = gloss('A Kohen (a Temple priest) serves; the Kohen (a Temple priest), too.');
    expect(out).toBe('A Kohen (a Temple priest) serves; the Kohen, too.');
  });

  it('is idempotent', () => {
    const once = gloss(
      'A Kohen (a Temple priest); the Kohen (a Temple priest); a Kohen (a Temple priest).',
    );
    expect(gloss(once)).toBe(once);
    expect(once).toBe('A Kohen (a Temple priest); the Kohen; a Kohen.');
  });

  it('returns input unchanged with no matcher or no terms', () => {
    expect(
      firstMentionGloss('A Kohen (a Temple priest) again Kohen (a Temple priest).', null),
    ).toBe('A Kohen (a Temple priest) again Kohen (a Temple priest).');
    expect(gloss('Plain text, nothing to do.')).toBe('Plain text, nothing to do.');
  });

  it('works on real globals — repeated הלכה gloss collapses to first mention', () => {
    const out = firstMentionGloss(
      'A הלכה (binding law) here; another הלכה (binding law) there.',
      buildConceptMatcher(globalTerms()),
    );
    expect(out).toBe('A הלכה (binding law) here; another הלכה there.');
  });
});

// ---------------------------------------------------------------------------
// ConceptText render path — the contiguous prose must have its Hebrew echoes
// collapsed BEFORE tokenization. Reproduces the reported "double Hebrew" bug:
// "a טרפה (טריפה)". The parenthetical טריפה matches the registry surface for
// treif, so tokenizeWithMatcher would pull it out as its own concept mention —
// meaning the "term (term)" pair never reaches the per-fragment echo strip in
// Hebraized. ConceptText therefore runs stripEchoParens on the whole string
// first. This mirrors ConceptText's parts() memo exactly.
// ---------------------------------------------------------------------------

function renderLikeConceptText(text: string): string {
  const matcher = buildConceptMatcher(globalTerms());
  const cleaned = stripEchoParens(firstMentionGloss(text, matcher));
  // Text parts go through Hebraized (hebraize); concept parts render raw.
  return tokenizeWithMatcher(cleaned, matcher)
    .map((p) => (p.kind === 'text' ? hebraize(p.value) : p.value))
    .join('');
}

describe('ConceptText render path — collapses double-Hebrew across the tokenize boundary', () => {
  it('collapses male/chaser echo whose paren matches a registry surface', () => {
    // טרפה (defective) inline, טריפה (full) in the paren — the reported leak.
    expect(renderLikeConceptText('renders the animal a טרפה (טריפה).')).toBe(
      'renders the animal a טרפה.',
    );
  });

  it('collapses an identical Hebrew echo where both sides match a surface', () => {
    // Both spell טריפה fully; both tokenize as concepts, so only a whole-string
    // pass can collapse them.
    expect(renderLikeConceptText('a טריפה (טריפה).')).toBe('a טריפה.');
  });

  it('keeps a genuine Hebrew clarification that adds new words', () => {
    expect(renderLikeConceptText('the מלא צואר (מלא צואר וחוץ לצואר) case')).toBe(
      'the מלא צואר (מלא צואר וחוץ לצואר) case',
    );
  });

  it('keeps a Form B English→Hebrew gloss', () => {
    expect(renderLikeConceptText('the court (בית דין) ruled.')).toBe('the court (בית דין) ruled.');
  });
});
