import { describe, it, expect } from 'vitest';
import {
  keyForHebrewBooks, keyForSefariaBundle, keyForSefariaSegments, keyForRishonim,
  keyForHalachaRefs, keyForDafTopics, keyForMishnaBundle, keyForSaCommentary,
} from '../src/worker/cache-keys';

// These keys address a TTL-bounded but huge KV namespace already populated across
// much of Shas. The string each helper returns is a HARD CONTRACT: change a
// version digit, the separator, or "normalise" the raw tractate/page (e.g. to a
// slug) and every cached daf cold-misses and re-fetches upstream. This test pins
// the exact bytes so any such change is a deliberate, reviewed edit — not a
// silent regression. (Centralising these also fixed warm-cron.ts, which had
// drifted to probing sefaria-bundle:v2 while the reader moved to v5.)
describe('source-cache keys — byte-exact contract', () => {
  const t = 'Berakhot', p = '2a';
  it('reproduces every key exactly, raw tractate:page (no slug)', () => {
    expect(keyForHebrewBooks(t, p)).toBe('hb:v2:Berakhot:2a');
    expect(keyForSefariaBundle(t, p)).toBe('sefaria-bundle:v5:Berakhot:2a');
    expect(keyForSefariaSegments(t, p)).toBe('sefaria-seg:v1:Berakhot:2a');
    expect(keyForRishonim(t, p)).toBe('rishonim:v4:Berakhot:2a');
    expect(keyForHalachaRefs(t, p)).toBe('halacha-refs:v2:Berakhot:2a');
    expect(keyForDafTopics(t, p)).toBe('daf-topics:v1:Berakhot:2a');
    expect(keyForMishnaBundle(t, p)).toBe('mishna-bundle:v1:Berakhot:2a');
    expect(keyForSaCommentary('Mishnah_Berurah_1:1')).toBe('sa-commentary:v1:Mishnah_Berurah_1:1');
  });
  it('keeps a space/upper-case tractate in the key verbatim (the cold-miss trap)', () => {
    expect(keyForSefariaBundle('Bava Kamma', '2a')).toBe('sefaria-bundle:v5:Bava Kamma:2a');
    expect(keyForRishonim('Bava Kamma', '117b')).toBe('rishonim:v4:Bava Kamma:117b');
  });
});
