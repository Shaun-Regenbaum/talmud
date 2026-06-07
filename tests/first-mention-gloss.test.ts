import { describe, it, expect } from 'vitest';
import {
  firstMentionGloss,
  buildConceptMatcher,
  glossKey,
} from '../src/client/conceptLinks';
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

  it('matches a looser repeat via containment against the registry gloss', () => {
    // First inline gloss is the fuller form; the repeat is a shorter restatement.
    const t = mk({ en: 'Kohen', hebrew: 'כהן', gloss: 'priest' });
    const out = gloss('A Kohen (a Temple priest) serves; the Kohen (priest) eats.', [t]);
    expect(out).toBe('A Kohen (a Temple priest) serves; the Kohen eats.');
  });

  it('tidies the seam — no space left before punctuation', () => {
    const out = gloss('A Kohen (a Temple priest) serves; the Kohen (a Temple priest), too.');
    expect(out).toBe('A Kohen (a Temple priest) serves; the Kohen, too.');
  });

  it('is idempotent', () => {
    const once = gloss('A Kohen (a Temple priest); the Kohen (a Temple priest); a Kohen (a Temple priest).');
    expect(gloss(once)).toBe(once);
    expect(once).toBe('A Kohen (a Temple priest); the Kohen; a Kohen.');
  });

  it('returns input unchanged with no matcher or no terms', () => {
    expect(firstMentionGloss('A Kohen (a Temple priest) again Kohen (a Temple priest).', null))
      .toBe('A Kohen (a Temple priest) again Kohen (a Temple priest).');
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
