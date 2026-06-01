import { describe, it, expect } from 'vitest';
import { instanceIdOf } from '../src/worker/cache-keys';

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
});
