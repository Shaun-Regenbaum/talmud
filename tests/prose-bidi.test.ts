import { describe, it, expect } from 'vitest';
import { stripEchoParens } from '../src/client/hebraize';

describe('stripEchoParens — drop redundant all-Hebrew gloss parentheticals', () => {
  it('drops an all-Hebrew paren right after a Hebrew term (the broken case)', () => {
    // term followed by a malformed/duplicated all-Hebrew "gloss"
    expect(stripEchoParens('a knife of מלא צואר וחוץ לצואר (מלא צואר וחוץ לצואר וחוץ לצואר) suffices'))
      .toBe('a knife of מלא צואר וחוץ לצואר suffices');
  });
  it('still collapses an exact echo', () => {
    expect(stripEchoParens('the מעשה (מעשה) here')).toBe('the מעשה here');
  });
  it('KEEPS a real English gloss', () => {
    expect(stripEchoParens('valid שחיטה (ritual slaughter) requires')).toBe('valid שחיטה (ritual slaughter) requires');
  });
  it('keeps an all-Hebrew paren that is NOT after a Hebrew term', () => {
    expect(stripEchoParens('the verse (בראשית) opens')).toBe('the verse (בראשית) opens');
  });
  it('KEEPS a genuine Hebrew clarification that adds new words (not an echo)', () => {
    // The paren shares no words with the term, so it is a real clarification,
    // not a redundant restatement — must survive.
    expect(stripEchoParens('cited by רבי עקיבא (תנא) here')).toBe('cited by רבי עקיבא (תנא) here');
  });
  it('keeps a Hebrew paren with a digit/other script (only Hebrew bodies match)', () => {
    expect(stripEchoParens('the daf דף (דף 2) here')).toBe('the daf דף (דף 2) here');
  });
});
