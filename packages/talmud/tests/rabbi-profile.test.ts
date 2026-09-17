/**
 * The counted sage profile (src/worker/rabbi-profile.ts): the classification
 * rule against the shipped data, checked on the sages the old LLM prompt used
 * as its own examples.
 */
import { describe, expect, it } from 'vitest';
import {
  BASELINE,
  classificationFromProfile,
  classifyFromProfile,
  MIN_SEGMENTS,
  sageProfile,
} from '../src/worker/rabbi-profile';

describe('rabbi-profile.json', () => {
  it('carries a Bavli baseline that is mostly law', () => {
    expect(BASELINE.halakha).toBeGreaterThan(0.6);
    expect(BASELINE.halakha + BASELINE.aggada + BASELINE.midrash).toBeGreaterThan(0.9);
  });
  it('knows the most-quoted amoraim, including Shmuel and Rav', () => {
    for (const slug of ['rava', 'abaye', 'rabbi-yochanan-b-napacha', 'rav', 'shmuel-(amora)']) {
      const p = sageProfile(slug);
      expect(p, slug).toBeTruthy();
      expect((p as { mentions: number }).mentions).toBeGreaterThan(500);
    }
  });
  it('follows duplicate slugs to the kept node', () => {
    expect(sageProfile('rabbah-bar-nahmani')).toEqual(sageProfile('rabbah-b-nachmani'));
  });
});

describe('classifyFromProfile', () => {
  it("matches the LLM prompt's own examples", () => {
    expect(classifyFromProfile('rabbi-yishmael-b-elisha')?.category).toBe('exegetist');
    expect(classifyFromProfile('rabbi-yehoshua-b-levi')?.category).toBe('aggadist');
    for (const slug of ['abaye', 'rava', 'rav-ashi', 'rabbi-meir', 'rabbi-yehudah-b-ilai']) {
      expect(classifyFromProfile(slug)?.category, slug).toBe('halachist');
    }
  });
  it('is halachist for the corpus-typical amora (Rabbi Yochanan, Rav Huna)', () => {
    expect(classifyFromProfile('rabbi-yochanan-b-napacha')?.category).toBe('halachist');
    expect(classifyFromProfile('rav-huna')?.category).toBe('halachist');
  });
  it('returns null for a sage with too few scored mentions or none at all', async () => {
    expect(classifyFromProfile('not-a-slug')).toBeNull();
    const thin = Object.entries(
      (await import('../src/lib/data/rabbi-profile.json')).sages as Record<
        string,
        { segments: number }
      >,
    ).find(([, p]) => p.segments > 0 && p.segments < MIN_SEGMENTS);
    if (thin) expect(classifyFromProfile(thin[0])).toBeNull();
  });
});

describe('classificationFromProfile', () => {
  it('produces the producer shape with checkable numbers, in both languages', () => {
    const en = classificationFromProfile('rabbi-yishmael-b-elisha', 'en');
    expect(en?.category).toBe('exegetist');
    expect(en?.justification).toMatch(/Across [\d,]+ mentions in the Bavli/);
    expect(en?.justification).toMatch(/\d+% verse reading/);
    expect(en?.justification).toContain('not on his own statements');
    const he = classificationFromProfile('rabbi-yishmael-b-elisha', 'he');
    expect(he?.category).toBe('exegetist');
    expect(he?.justification).toMatch(/אזכורים בבבלי/);
  });
});
