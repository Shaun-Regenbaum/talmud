import { describe, expect, it } from 'vitest';
import { versesForPrompt } from '../src/worker/producers/events';

describe('versesForPrompt', () => {
  it('numbers verses and strips Sefaria HTML markup', () => {
    const out = versesForPrompt([
      { n: 1, en: 'In the <b>beginning</b>', he: 'בראשית' },
      { n: 2, en: '  And the earth <i class="x">was</i> unformed ', he: 'והארץ' },
    ]);
    expect(out).toBe('1. In the beginning\n2. And the earth was unformed');
  });

  it('tolerates missing English (number still emitted)', () => {
    expect(versesForPrompt([{ n: 3, en: '', he: 'ויאמר' }])).toBe('3. ');
  });
});
