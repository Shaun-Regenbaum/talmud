import { describe, it, expect } from 'vitest';
import { instanceIdOf, keyForEnrichment } from '../src/worker/cache-keys';
import { findCodeEnrichment } from '../src/worker/code-marks';

// Regression: Hebrew section titles slug to just "_", so keying section
// enrichments by slugId(title) collided EVERY Hebrew section on a daf onto one
// cache key — all Hebrew argument cards rendered the same section. instanceIdOf
// must fall back to a structural (range-aware) hash when a label degenerates.

const section = (startSegIdx: number, endSegIdx: number, title: string, excerpt = '') =>
  ({ startSegIdx, endSegIdx, fields: { title, excerpt } });

describe('instanceIdOf — Hebrew title collision', () => {
  it('English section titles still key by their slug', async () => {
    expect(await instanceIdOf(section(6, 8, 'The stones story'))).toBe('the_stones_story');
  });

  it('does NOT collapse a Hebrew section title to "_"', async () => {
    const id = await instanceIdOf(section(6, 8, 'מעשה רבי ונדבך האבנים'));
    expect(id).not.toBe('_');
    expect(/[a-z0-9]/.test(id)).toBe(true); // a real hash, not a degenerate slug
  });

  it('gives DISTINCT ids to two different Hebrew sections on the same daf', async () => {
    const a = await instanceIdOf(section(5, 5, 'מחלוקת רבא ורב יוסף'));
    const b = await instanceIdOf(section(6, 8, 'מעשה רבי ונדבך האבנים'));
    expect(a).not.toBe(b);
  });

  it('distinguishes the same Hebrew title at different ranges (drift safety)', async () => {
    const atFive = await instanceIdOf(section(5, 5, 'מעשה רבי ונדבך האבנים'));
    const atSix = await instanceIdOf(section(6, 8, 'מעשה רבי ונדבך האבנים'));
    expect(atFive).not.toBe(atSix);
  });

  it('keeps rabbi cross-surface keying by English name', async () => {
    const flat = await instanceIdOf({ name: 'Rabbi Yochanan', nameHe: 'רבי יוחנן' });
    const anchor = await instanceIdOf({ excerpt: 'רבי יוחנן', fields: { name: 'Rabbi Yochanan', nameHe: 'רבי יוחנן' } });
    expect(flat).toBe('rabbi_yochanan');
    expect(anchor).toBe('rabbi_yochanan');
  });

  it('prefers an explicit id/fields.id over a hash', async () => {
    expect(await instanceIdOf({ fields: { id: '6-8_0' } })).toBe('6-8_0');
  });
});

// Regression: a rishonim instance carries no id/title/excerpt, so its id used to
// hash to just {segIdx} — the synthesis cache key was blind to the comments. One
// bad generation then stuck permanently (saw Berakhot 2a:1 render a Pesachim
// chametz synthesis from a poisoned entry the correct source couldn't evict).
// The id must now move with the comment content so a corrected source regenerates.
describe('instanceIdOf — rishonim comment content sensitivity', () => {
  const rishonim = (segIdx: number, comments: Array<{ work: string; sourceRef: string; textHe: string; textEn: string }>) =>
    ({ segIdx, fields: { works: [...new Set(comments.map((c) => c.work))], commentCount: comments.length, comments } });

  it('gives DISTINCT ids to the same segment with different comments', async () => {
    const shema = rishonim(0, [{ work: 'Rashi', sourceRef: 'Rashi on Berakhot 2a:1:1', textHe: 'מאימתי קורין את שמע', textEn: 'From what time' }]);
    const chametz = rishonim(0, [{ work: 'Rashi', sourceRef: 'Rashi on Pesachim 2a:1:1', textHe: 'אור לארבעה עשר בודקין את החמץ', textEn: 'On the eve of the 14th' }]);
    expect(await instanceIdOf(shema)).not.toBe(await instanceIdOf(chametz));
  });

  it('is stable for identical comment content', async () => {
    const a = rishonim(0, [{ work: 'Rashi', sourceRef: 'Rashi on Berakhot 2a:1:1', textHe: 'מאימתי', textEn: 'From when' }]);
    const b = rishonim(0, [{ work: 'Rashi', sourceRef: 'Rashi on Berakhot 2a:1:1', textHe: 'מאימתי', textEn: 'From when' }]);
    expect(await instanceIdOf(a)).toBe(await instanceIdOf(b));
  });

  // The tightest form of the incident: works/commentCount/segIdx all coincide and
  // ONLY the comment text differs. The synthesis is a function of that text, so the
  // id must still diverge — otherwise the wrong synthesis cache-hits.
  it('diverges when only the comment text differs (same works/count/seg)', async () => {
    const one = rishonim(0, [{ work: 'Rashi', sourceRef: 'Rashi on Berakhot 2a:1:1', textHe: 'גרסה ראשונה', textEn: 'First reading' }]);
    const two = rishonim(0, [{ work: 'Rashi', sourceRef: 'Rashi on Berakhot 2a:1:1', textHe: 'גרסה שנייה', textEn: 'Second reading' }]);
    expect(await instanceIdOf(one)).not.toBe(await instanceIdOf(two));
  });

  // Guard the actual failure surface: instanceIdOf must NOT collapse to the bare
  // {segIdx} hash that made the synthesis key content-blind in the first place.
  it('does not collapse to the content-blind {segIdx} hash', async () => {
    const withComments = rishonim(0, [{ work: 'Rashi', sourceRef: 'Rashi on Berakhot 2a:1:1', textHe: 'טקסט', textEn: 'text' }]);
    const segIdxOnly = await instanceIdOf({ segIdx: 0 });
    expect(await instanceIdOf(withComments)).not.toBe(segIdxOnly);
  });
});

// The bug bit at the CACHE KEY, not just the instance id: the rishonim.synthesis
// key collapsed to (segIdx, daf, cache_version) and served a poisoned entry the
// correct source could never evict. Lock the end-to-end key (instanceIdOf →
// keyForEnrichment) so two segments-worth of different comments on the SAME daf
// can never share a synthesis cache slot again. Assert relationships, not exact
// strings, so a future cache_version bump doesn't break the test.
describe('rishonim.synthesis cache key — content sensitivity end-to-end', () => {
  const def = findCodeEnrichment('rishonim.synthesis');
  const daf = { tractate: 'Berakhot', page: '2a' };
  const rishonim = (segIdx: number, textHe: string, textEn: string) =>
    ({ segIdx, fields: { works: ['Rashi'], commentCount: 1, comments: [{ work: 'Rashi', workHe: 'רש"י', sourceRef: 'Rashi on Berakhot 2a:1:1', textHe, textEn }] } });

  it('registers as a local-scope enrichment (daf belongs in the key)', () => {
    expect(def).not.toBeNull();
    // A 'global' scope would drop the daf from the key — a different cross-daf
    // collision bug. Pin the scope the key shape depends on.
    expect((def as { scope: string }).scope).toBe('local');
  });

  it('different comment content on the same daf+segment yields different keys', async () => {
    const a = rishonim(0, 'מאימתי קורין את שמע', 'From what time');
    const b = rishonim(0, 'אור לארבעה עשר בודקין את החמץ', 'On the eve of the 14th');
    const ka = keyForEnrichment(def!, await instanceIdOf(a), daf);
    const kb = keyForEnrichment(def!, await instanceIdOf(b), daf);
    expect(ka).not.toBe(kb);
  });

  it('identical comment content yields a stable, reachable key', async () => {
    const a = rishonim(0, 'מאימתי קורין את שמע', 'From what time');
    const b = rishonim(0, 'מאימתי קורין את שמע', 'From what time');
    const ka = keyForEnrichment(def!, await instanceIdOf(a), daf);
    const kb = keyForEnrichment(def!, await instanceIdOf(b), daf);
    expect(ka).toBe(kb);
  });
});
