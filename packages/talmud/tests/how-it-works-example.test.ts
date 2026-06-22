import { describe, expect, it } from 'vitest';
import { stripHtml } from '../src/client/howItWorks/example';

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<big><strong>מֵאֵימָתַי</strong></big> קוֹרִין')).toBe('מֵאֵימָתַי קוֹרִין');
    expect(stripHtml('The <i>Berakhot</i> tractate')).toBe('The Berakhot tractate');
  });
  it('decodes the common entities and trims', () => {
    expect(stripHtml('a&nbsp;&amp;&nbsp;b   ')).toBe('a & b');
  });
  it('is a no-op on plain text', () => {
    expect(stripHtml('plain text')).toBe('plain text');
  });
});
