import { describe, expect, it } from 'vitest';
import { consonants, markVerseHtml, rarityLabel, type WordMark } from '../src/lib/wordLens';

describe('word lens', () => {
  it('reduces a pointed word to its letters', () => {
    expect(consonants('וַֽיַּעְקְבֵ֣נִי')).toBe('ויעקבני');
  });

  it('says how rare in plain words', () => {
    expect(rarityLabel(1)).toBe('once');
    expect(rarityLabel(2)).toBe('twice');
    expect(rarityLabel(5)).toBe('5 times');
  });

  it('underlines only the marked word and leaves tags alone', () => {
    const marks: WordMark[] = [['ויעקבני', 1, '6117', 1]];
    const html = 'הֲכִי קָרָא <b>שְׁמוֹ</b> וַֽיַּעְקְבֵ֣נִי זֶה';
    const out = markVerseHtml(html, marks);
    expect(out).toContain('<span class="rw" data-lemma="6117"');
    expect(out).toContain('<b>שְׁמוֹ</b>');
    expect(out.match(/class="rw"/g)?.length).toBe(1);
  });

  it('picks the right copy of a repeated word', () => {
    const marks: WordMark[] = [['אבר', 2, '1', 1]];
    const out = markVerseHtml('אבר אבר אבר', marks);
    expect(out).toBe('אבר <span class="rw" data-lemma="1" data-w="אבר" data-k="2">אבר</span> אבר');
  });

  it('finds a word joined by a maqaf', () => {
    const marks: WordMark[] = [['עקב', 1, '9', 1]];
    expect(markVerseHtml('על־עקב', marks)).toContain('class="rw"');
  });

  it('drops the underline when the word is not in the verse', () => {
    const marks: WordMark[] = [['שלום', 1, '9', 1]];
    expect(markVerseHtml('אבר', marks)).toBe('אבר');
  });
});

describe('word lens notes', () => {
  it('underlines a note word that is not rare and marks it as noted', () => {
    const out = markVerseHtml(
      'אבר בדק',
      [],
      [{ letters: 'בדק', k: 1, kind: 'other', headline: 'h', body: 'b', sources: [] }],
    );
    expect(out).toContain('class="rw rw-n" data-lemma="" data-w="בדק"');
  });
});
