import { describe, it, expect } from 'vitest';
import { tokenizeConceptMentions, type ConceptTerm } from '../src/client/conceptLinks';

// The concept-tooltip layer wraps mentions of THIS daf's background terms in
// prose so a reader can see the gloss inline. tokenizeConceptMentions is the
// pure splitter; these guard the matching (whole-word, case-insensitive,
// longest-first) and the parenthetical-Hebrew case the feature targets.

const TERMS: ConceptTerm[] = [
  { term: 'Kohen', termHe: 'כהן', gloss: 'A descendant of Aharon who serves in the Temple.' },
  { term: 'Oral Law', termHe: 'תורה שבעל פה', gloss: 'The transmitted interpretation of the Written Torah.' },
  { term: 'law', termHe: 'דין', gloss: 'A legal ruling.' },
];

describe('tokenizeConceptMentions', () => {
  it('wraps a known term and carries its gloss; surrounding text stays plain', () => {
    const parts = tokenizeConceptMentions('Only a Kohen may eat terumah.', TERMS);
    expect(parts).toEqual([
      { kind: 'text', value: 'Only a ' },
      { kind: 'concept', value: 'Kohen', term: TERMS[0] },
      { kind: 'text', value: ' may eat terumah.' },
    ]);
  });

  it('leaves the parenthetical Hebrew as text (the English label is the match)', () => {
    const parts = tokenizeConceptMentions('a Kohen (כהן) may not', TERMS);
    expect(parts.map((p) => p.kind)).toEqual(['text', 'concept', 'text']);
    expect(parts[1]).toMatchObject({ kind: 'concept', value: 'Kohen' });
    expect(parts[2].value).toBe(' (כהן) may not'); // Hebrew + rest untouched
  });

  it('matches case-insensitively but preserves the matched casing verbatim', () => {
    const parts = tokenizeConceptMentions('The kohen blessed them.', TERMS);
    expect(parts[1]).toMatchObject({ kind: 'concept', value: 'kohen', term: TERMS[0] });
  });

  it('prefers the longest term (multi-word beats the single-word substring)', () => {
    const parts = tokenizeConceptMentions('This is Oral Law, not custom.', TERMS);
    const concepts = parts.filter((p) => p.kind === 'concept');
    expect(concepts).toHaveLength(1);
    expect(concepts[0]).toMatchObject({ value: 'Oral Law', term: TERMS[1] });
  });

  it('matches whole words only — never mid-word', () => {
    const parts = tokenizeConceptMentions('The lawyer outlawed it.', TERMS);
    // "law" must not fire inside "lawyer" / "outlawed"
    expect(parts.every((p) => p.kind === 'text')).toBe(true);
  });

  it('handles transliteration diacritics with Unicode word boundaries', () => {
    const terms: ConceptTerm[] = [{ term: 'ḥerem', termHe: 'חרם', gloss: 'A ban / excommunication.' }];
    // matches as a standalone word...
    const hit = tokenizeConceptMentions('They declared ḥerem on him.', terms);
    expect(hit[1]).toMatchObject({ kind: 'concept', value: 'ḥerem' });
    // ...but not as a substring of a longer diacritic-bearing word
    const miss = tokenizeConceptMentions('the ḥeremite stayed', terms);
    expect(miss.every((p) => p.kind === 'text')).toBe(true);
  });

  it('returns a single text part when nothing matches, and [] for empty input', () => {
    expect(tokenizeConceptMentions('nothing here', TERMS)).toEqual([{ kind: 'text', value: 'nothing here' }]);
    expect(tokenizeConceptMentions('', TERMS)).toEqual([]);
  });

  it('skips 1-char labels (too noisy) and dedupes repeated surfaces', () => {
    const noisy: ConceptTerm[] = [
      { term: 'a', termHe: '', gloss: 'x' },
      { term: 'Get', termHe: 'גט', gloss: 'A bill of divorce.' },
      { term: 'Get', termHe: 'גט', gloss: 'duplicate' },
    ];
    const parts = tokenizeConceptMentions('She received a Get today.', noisy);
    const concepts = parts.filter((p) => p.kind === 'concept');
    expect(concepts).toHaveLength(1);
    expect(concepts[0].term?.gloss).toBe('A bill of divorce.'); // first claimant wins
  });
});
