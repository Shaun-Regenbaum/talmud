import { describe, it, expect, beforeAll } from 'vitest';
import { getJson, getFocalHebrewNormalized, normalizeHebrew, BASE_URL } from './helpers';

/**
 * /api/halacha structural + anchor-point tests.
 *
 * Anchor verification is the most valuable piece here: each topic's `excerpt`
 * is the Hebrew fragment the UI uses to position its ⚖ gutter icon. If the
 * model hallucinates the excerpt, the icon silently disappears.
 *
 * We test against Berakhot 2a — a canonical halachic anchor (Kriat Shema
 * evening timing, Shulchan Aruch OC 235 territory).
 */

interface Ruling { ref: string; summary: string }
interface Topic {
  topic: string;
  topicHe?: string;
  excerpt?: string;
  rulings: { mishnehTorah?: Ruling; shulchanAruch?: Ruling; rema?: Ruling };
}
interface HalachaResult {
  topics: Topic[];
  _model?: string;
  error?: string;
}

describe(`integration: halacha Berakhot 2a (against ${BASE_URL})`, () => {
  let h: HalachaResult;
  let focalHe: string;

  beforeAll(async () => {
    h = await getJson<HalachaResult>('/api/halacha/Berakhot/2a?cached_only=1');
    if ((h as unknown as { cached?: boolean }).cached === false || h.error) {
      h = await getJson<HalachaResult>('/api/halacha/Berakhot/2a');
    }
    focalHe = await getFocalHebrewNormalized('Berakhot', '2a');
  }, 300000);

  it('returns ≥1 topic', () => {
    expect(h.error).toBeUndefined();
    expect(h.topics.length).toBeGreaterThanOrEqual(1);
  });

  it('identifies at least one topic about reciting Shema', () => {
    const match = h.topics.some((t) => {
      const en = t.topic.toLowerCase();
      const he = t.topicHe ?? '';
      return /shema|recit|kriat|k\.?\s*shema/.test(en) || /שמע|קריאת/.test(he);
    });
    expect(match).toBe(true);
  });

  it('at least one topic references Shulchan Aruch OC 235 or Hilchot Kriat Shema', () => {
    // Berakhot 2a is the gemara source for OC 235 (evening Shema) and for
    // Rambam's Hilchot Kriat Shema chapter 1 — a halacha response without
    // either is almost certainly wrong.
    const refs = h.topics.flatMap((t) => [
      t.rulings.mishnehTorah?.ref ?? '',
      t.rulings.shulchanAruch?.ref ?? '',
    ].filter(Boolean));
    const any235 = refs.some((r) => /235|orach\s+chayim|orah\s+hayyim/i.test(r));
    const anyKriat = refs.some((r) => /kri.?at shema|hilchot.*shema|mishneh torah.*shema/i.test(r));
    expect(any235 || anyKriat, `found refs: ${refs.join(' | ')}`).toBe(true);
  });

  it('every topic.excerpt appears verbatim in the focal Hebrew (UI anchor check)', () => {
    const missing: string[] = [];
    for (const t of h.topics) {
      if (!t.excerpt) continue;
      const needle = normalizeHebrew(t.excerpt);
      if (!focalHe.includes(needle)) {
        missing.push(`topic "${t.topic}" excerpt "${t.excerpt.slice(0, 40)}"`);
      }
    }
    expect(missing, `unanchored excerpts (icons will not render): ${missing.join(' | ')}`)
      .toHaveLength(0);
  });

  it('each ruling has both ref and summary populated', () => {
    const broken: string[] = [];
    for (const t of h.topics) {
      for (const [k, r] of Object.entries(t.rulings)) {
        if (!r) continue;
        if (!r.ref || !r.summary) {
          broken.push(`topic "${t.topic}" ruling ${k} missing ${!r.ref ? 'ref' : 'summary'}`);
        }
      }
    }
    expect(broken, `malformed rulings: ${broken.join(' | ')}`).toHaveLength(0);
  });
});
