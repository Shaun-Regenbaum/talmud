import { afterEach, describe, expect, it } from 'vitest';
import {
  surfacesOf,
  termGloss,
  termLabel,
  tokenizeConceptMentions,
} from '../src/client/conceptLinks';
import { setLang } from '../src/client/i18n';
import { globalTerms, type Term } from '../src/lib/terms/registry';

// The concept-tooltip layer wraps mentions of the daf's glossary terms in prose
// so a reader sees the gloss inline. A term is matched by EVERY surface it can
// appear as — its English label AND its Hebrew script — so a Hebrew technical
// term links to its gloss just as an English one does. tokenizeConceptMentions
// is the pure splitter; these guard matching + the Hebrew-surface behavior.

const mk = (t: Partial<Term> & Pick<Term, 'hebrew' | 'gloss'>): Term => ({
  display: 'hebrew-first-gloss',
  scope: 'daf',
  ...t,
});

const TERMS: Term[] = [
  mk({ en: 'Kohen', hebrew: 'כהן', gloss: 'A descendant of Aharon who serves in the Temple.' }),
  mk({
    en: 'Oral Law',
    hebrew: 'תורה שבעל פה',
    gloss: 'The transmitted interpretation of the Written Torah.',
  }),
  mk({ en: 'law', hebrew: 'דין', gloss: 'A legal ruling.' }),
];

describe('tokenizeConceptMentions — English surfaces', () => {
  it('wraps a known term and carries its gloss; surrounding text stays plain', () => {
    const parts = tokenizeConceptMentions('Only a Kohen may eat terumah.', TERMS);
    expect(parts).toEqual([
      { kind: 'text', value: 'Only a ' },
      { kind: 'concept', value: 'Kohen', term: TERMS[0] },
      { kind: 'text', value: ' may eat terumah.' },
    ]);
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
    expect(parts.every((p) => p.kind === 'text')).toBe(true);
  });

  it('handles transliteration diacritics with Unicode word boundaries', () => {
    const terms = [mk({ en: 'ḥerem', hebrew: 'חרם', gloss: 'A ban / excommunication.' })];
    const hit = tokenizeConceptMentions('They declared ḥerem on him.', terms);
    expect(hit[1]).toMatchObject({ kind: 'concept', value: 'ḥerem' });
    const miss = tokenizeConceptMentions('the ḥeremite stayed', terms);
    expect(miss.every((p) => p.kind === 'text')).toBe(true);
  });

  it('returns a single text part when nothing matches, and [] for empty input', () => {
    expect(tokenizeConceptMentions('nothing here', TERMS)).toEqual([
      { kind: 'text', value: 'nothing here' },
    ]);
    expect(tokenizeConceptMentions('', TERMS)).toEqual([]);
  });

  it('skips <2-char labels and dedupes repeated surfaces (first claimant wins)', () => {
    const noisy = [
      mk({ en: 'a', hebrew: '', gloss: 'x' }), // both surfaces too short -> no surface
      mk({ en: 'Get', hebrew: 'גט', gloss: 'A bill of divorce.' }),
      mk({ en: 'Get', hebrew: 'גט', gloss: 'duplicate' }),
    ];
    const parts = tokenizeConceptMentions('She received a Get today.', noisy);
    const concepts = parts.filter((p) => p.kind === 'concept');
    expect(concepts).toHaveLength(1);
    expect(concepts[0].term?.gloss).toBe('A bill of divorce.');
  });
});

// The feature this PR adds: a Hebrew technical term in prose is hoverable too.
describe('tokenizeConceptMentions — Hebrew surfaces', () => {
  it('matches the Hebrew script form and links it to the same gloss', () => {
    const parts = tokenizeConceptMentions('נחלקו אם כהן רשאי לאכול.', TERMS);
    const concepts = parts.filter((p) => p.kind === 'concept');
    expect(concepts).toHaveLength(1);
    expect(concepts[0]).toMatchObject({ value: 'כהן', term: TERMS[0] });
  });

  it('tags BOTH the English and the parenthetical Hebrew (Form B prose)', () => {
    // The old behavior left the parenthetical Hebrew as plain text; now it
    // links too, so either script a reader hovers reaches the gloss.
    const parts = tokenizeConceptMentions('a Kohen (כהן) may not', TERMS);
    const concepts = parts.filter((p) => p.kind === 'concept');
    expect(concepts.map((c) => c.value)).toEqual(['Kohen', 'כהן']);
  });

  it('does not fire on a Hebrew term carrying a prefix letter (precision over recall)', () => {
    // כהן inside הכהן ("the kohen") is preceded by a Hebrew letter, so the
    // word-boundary lookbehind correctly declines — we accept the miss.
    const parts = tokenizeConceptMentions('הכהן עבד במקדש.', TERMS);
    expect(parts.every((p) => p.kind === 'text')).toBe(true);
  });
});

// Globals are now in the pool on every daf, matched by their Hebrew surface.
describe('global terms in the matcher pool', () => {
  const g = globalTerms();
  const byHe = (he: string): Term => g.find((t) => t.hebrew === he)!;

  it('matches a canonical Hebrew term (הלכה) in prose', () => {
    const parts = tokenizeConceptMentions('כאן יש הלכה ברורה.', g);
    const concepts = parts.filter((p) => p.kind === 'concept');
    expect(concepts.some((c) => c.value === 'הלכה')).toBe(true);
  });

  it("matches a display:'english' global by its English label (court -> בית דין)", () => {
    const parts = tokenizeConceptMentions('The court ruled today.', g);
    const hit = parts.find((p) => p.kind === 'concept');
    expect(hit?.value).toBe('court');
    expect(hit?.term?.hebrew).toBe('בית דין');
  });

  it('never matches a romanization as an English word (rov / get stay plain)', () => {
    // 'rov' and 'get' are common English words; only their Hebrew is a surface.
    expect(tokenizeConceptMentions('a rov of the cases', g).every((p) => p.kind === 'text')).toBe(
      true,
    );
    expect(tokenizeConceptMentions('please get the book', g).every((p) => p.kind === 'text')).toBe(
      true,
    );
  });

  it('surfacesOf: Hebrew always, English label only when present; never the romanization', () => {
    expect(surfacesOf(byHe('הלכה'))).toEqual(['הלכה']); // hebrew display, no en
    expect(surfacesOf(byHe('בית דין'))).toEqual(['בית דין', 'court']); // english display
  });

  it('termLabel: English reading, else romanization, else Hebrew', () => {
    expect(termLabel(byHe('בית דין'))).toBe('court'); // en
    expect(termLabel(byHe('הלכה'))).toBe('halacha'); // translit
    expect(termLabel(mk({ hebrew: 'פלוני', gloss: 'g' }))).toBe('פלוני'); // bare
  });
});

// termGloss is the tooltip/meaning surface in the active language: the authored
// Hebrew gloss in Hebrew mode, the English gloss otherwise. A per-daf concept
// (no glossHe) keeps its single gloss in both modes.
describe('termGloss — language-aware meaning', () => {
  const g = globalTerms();
  const byHe = (he: string): Term => g.find((t) => t.hebrew === he)!;
  afterEach(() => setLang('en'));

  it('returns the English gloss in English mode', () => {
    setLang('en');
    expect(termGloss(byHe('טריפה'))).toBe('ritually unfit');
  });

  it('returns the authored Hebrew gloss in Hebrew mode', () => {
    setLang('he');
    expect(termGloss(byHe('טריפה'))).toBe('בהמה פסולה לאכילה מחמת מום');
  });

  it('falls back to the single gloss for a per-daf concept lacking glossHe', () => {
    setLang('he');
    expect(termGloss(mk({ hebrew: 'פלוני', gloss: 'a placeholder' }))).toBe('a placeholder');
  });
});
