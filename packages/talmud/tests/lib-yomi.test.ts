import { describe, expect, it } from 'vitest';
import { parseYomiDisplay } from '../src/lib/yomi';

describe('parseYomiDisplay', () => {
  it('reads tractate and opens on the a side', () => {
    expect(parseYomiDisplay('Berakhot 2')).toEqual({ tractate: 'Berakhot', page: '2a' });
  });
  it('keeps multi-word tractate names', () => {
    expect(parseYomiDisplay('Bava Kamma 17')).toEqual({ tractate: 'Bava Kamma', page: '17a' });
  });
  it('returns null when it does not parse', () => {
    expect(parseYomiDisplay(undefined)).toBeNull();
    expect(parseYomiDisplay('Daf')).toBeNull();
  });
});
