import { describe, expect, it } from 'vitest';
import { passageSearchName } from '../src/client/passageSearchName';

describe('passageSearchName', () => {
  it('takes the first Hebrew name, so the short form listed first wins', () => {
    expect(passageSearchName(['רבי עקיבא', 'רבי עקיבא בן יוסף'])).toBe('רבי עקיבא');
  });
  it('skips English names and slugs, which cannot match a Hebrew passage', () => {
    expect(passageSearchName(['Rabbi Akiva', null, undefined, 'rabbi-akiva', 'רבא'])).toBe('רבא');
  });
  it('gives nothing when there is no Hebrew name at all', () => {
    expect(passageSearchName(['Shmuel', 'shmuel', '  ', null])).toBeNull();
  });
  it('trims the name', () => {
    expect(passageSearchName(['  אביי '])).toBe('אביי');
  });
});
