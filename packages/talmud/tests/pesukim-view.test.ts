import { describe, expect, it } from 'vitest';
import {
  assemblePesukimVerse,
  instanceVerseRef,
  PESUKIM_VIEW_ENRICHMENTS,
  pesukimColdProducers,
  tanachChapterUrl,
} from '../src/worker/pesukim-view';

const inst = {
  startSegIdx: 4,
  endSegIdx: 5,
  fields: {
    verseRef: 'Proverbs 3:12',
    citationStyle: 'explicit',
    excerpt: 'כי את אשר יאהב',
    endExcerpt: 'יוכיח',
    summary: 'Brought to show that suffering can be a sign of love.',
  },
};
const verse = {
  ref: 'Proverbs 3:12',
  heRef: 'משלי ג׳:י״ב',
  he: 'כִּי אֶת אֲשֶׁר יֶאֱהַב ה׳ יוֹכִיחַ',
  en: 'For whom the LORD loves, He rebukes',
  prevRef: 'Proverbs 3:11',
  nextRef: 'Proverbs 3:13',
  book: 'Proverbs',
};

describe('tanachChapterUrl', () => {
  it('links a "Book C:V" ref to its chapter on tanach.dev', () => {
    expect(tanachChapterUrl('Proverbs 3:12')).toBe('https://tanach.dev/?book=Proverbs&chapter=3');
  });
  it('handles multi-word books and verse ranges', () => {
    expect(tanachChapterUrl('I Samuel 17:4-7')).toBe(
      'https://tanach.dev/?book=I+Samuel&chapter=17',
    );
  });
  it('returns null for something that is not a ref', () => {
    expect(tanachChapterUrl('the verse about love')).toBeNull();
  });
});

describe('assemblePesukimVerse', () => {
  it('joins the citation, the verse text, and every card section', () => {
    const v = assemblePesukimVerse(
      inst,
      {
        'pesukim.synthesis': { synthesis: 'S' },
        'pesukim.tanach-context': { context: 'C' },
        'pesukim.why-here': { why_here: 'W' },
        'pesukim.mechanism': { mechanism: 'M' },
        'pesukim.landing': { landing: 'L' },
      },
      verse,
    );
    expect(v.ref).toBe('Proverbs 3:12');
    expect(v.hebrew).toBe(verse.he);
    expect(v.english).toBe(verse.en);
    expect(v.heRef).toBe(verse.heRef);
    expect(v.tanachUrl).toBe('https://tanach.dev/?book=Proverbs&chapter=3');
    expect(v.citation).toEqual({
      style: 'explicit',
      excerpt: 'כי את אשר יאהב',
      endExcerpt: 'יוכיח',
      summary: 'Brought to show that suffering can be a sign of love.',
      startSegIdx: 4,
      endSegIdx: 5,
    });
    expect(v.synthesis).toBe('S');
    expect(v.tanachContext).toBe('C');
    expect(v.whyHere).toBe('W');
    expect(v.mechanism).toBe('M');
    expect(v.landing).toBe('L');
    expect(v.missing).toEqual([]);
  });

  it('says which sections are missing instead of pretending (null, listed in missing)', () => {
    const v = assemblePesukimVerse(
      inst,
      { 'pesukim.synthesis': { synthesis: 'S' }, 'pesukim.why-here': null },
      null,
    );
    expect(v.synthesis).toBe('S');
    expect(v.whyHere).toBeNull();
    expect(v.hebrew).toBeNull();
    expect(v.missing).toEqual([
      'pesukim.tanach-context',
      'pesukim.why-here',
      'pesukim.mechanism',
      'pesukim.landing',
    ]);
  });

  it('treats an empty prose field as missing text but a present enrichment', () => {
    const v = assemblePesukimVerse(inst, { 'pesukim.mechanism': { mechanism: '   ' } }, null);
    expect(v.mechanism).toBeNull();
    expect(v.missing).not.toContain('pesukim.mechanism');
  });

  it('reads the verse ref off the instance fields', () => {
    expect(instanceVerseRef(inst)).toBe('Proverbs 3:12');
    expect(instanceVerseRef({ fields: {} })).toBeNull();
  });
});

describe('pesukimColdProducers', () => {
  const all = PESUKIM_VIEW_ENRICHMENTS.map((e) => e.id);
  it('everything is cold when the mark itself is not cached', () => {
    expect(pesukimColdProducers(false, [])).toEqual(['pesukim', ...all]);
  });
  it('a cached mark with no verses is complete (the daf quotes nothing)', () => {
    expect(pesukimColdProducers(true, [])).toEqual([]);
  });
  it('lists an enrichment once when any verse is missing it', () => {
    const a = assemblePesukimVerse(inst, { 'pesukim.synthesis': { synthesis: 'S' } }, null);
    const b = assemblePesukimVerse(inst, {}, null);
    expect(pesukimColdProducers(true, [a, b])).toEqual(all);
    const whole = assemblePesukimVerse(
      inst,
      Object.fromEntries(PESUKIM_VIEW_ENRICHMENTS.map((e) => [e.id, { [e.field]: 'x' }])),
      null,
    );
    expect(pesukimColdProducers(true, [whole])).toEqual([]);
  });
});
