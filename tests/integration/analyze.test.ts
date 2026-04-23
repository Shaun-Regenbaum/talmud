import { describe, it, expect, beforeAll } from 'vitest';
import { getJson, getFocalHebrewNormalized, normalizeHebrew, BASE_URL } from './helpers';

/**
 * /api/analyze structural + anchor-point tests.
 *
 * We exercise Berakhot 2a because it's a classic, highly-cached daf with a
 * well-known argument structure (the opening Mishnah on evening Shema + the
 * Gemara's discussion of its phrasing). The tests:
 *
 *   1. assert the shape is sensible (≥3 sections, each with Hebrew excerpt + rabbis)
 *   2. assert the content touches on specific known rabbis/terms
 *   3. CRUCIALLY: verify every `excerpt` and `opinionStart` appears VERBATIM
 *      (normalized) in the focal amud's Hebrew. These are the UI's icon
 *      anchor points — if the model hallucinates one, the icon won't render.
 */

interface Rabbi {
  name: string;
  nameHe: string;
  period?: string;
  location?: string;
  role?: string;
  opinionStart?: string;
}
interface Section {
  title: string;
  summary: string;
  excerpt?: string;
  rabbis: Rabbi[];
}
interface Analysis {
  summary: string;
  sections: Section[];
  _model?: string;
  _validationWarnings?: string[];
  error?: string;
}

describe(`integration: analyze Berakhot 2a (against ${BASE_URL})`, () => {
  let analysis: Analysis;
  let focalHe: string;

  beforeAll(async () => {
    // cached_only=1 avoids paying the Kimi cost if cache is warm — we
    // expect this daf to be pre-cached. Falls through to a live call if not.
    analysis = await getJson<Analysis>('/api/analyze/Berakhot/2a?cached_only=1');
    if ((analysis as unknown as { cached?: boolean }).cached === false || analysis.error) {
      // Cache miss — fall back to a full run.
      analysis = await getJson<Analysis>('/api/analyze/Berakhot/2a');
    }
    focalHe = await getFocalHebrewNormalized('Berakhot', '2a');
  }, 300000);

  it('returns a non-empty summary', () => {
    expect(analysis.error).toBeUndefined();
    expect(analysis.summary.length).toBeGreaterThan(30);
  });

  it('breaks the daf into 3–8 sections', () => {
    expect(analysis.sections.length).toBeGreaterThanOrEqual(3);
    expect(analysis.sections.length).toBeLessThanOrEqual(8);
  });

  it('opens the argument with the evening-Shema dispute', () => {
    const first = analysis.sections[0];
    const titleOrSummary = (first.title + ' ' + first.summary).toLowerCase();
    expect(titleOrSummary).toMatch(/shema|evening|mishnah|recit/);
  });

  it('names the three Mishnah disputants: R. Eliezer, Sages, Rabban Gamliel', () => {
    const allRabbis = analysis.sections.flatMap((s) => s.rabbis.map((r) => r.name.toLowerCase()));
    expect(allRabbis.some((n) => /eliezer/.test(n))).toBe(true);
    expect(allRabbis.some((n) => /sages|chakhamim|חכמים/i.test(n))).toBe(true);
    expect(allRabbis.some((n) => /gamliel|gamaliel/.test(n))).toBe(true);
  });

  it('every section.excerpt appears verbatim in the focal Hebrew', () => {
    const missing: string[] = [];
    for (const s of analysis.sections) {
      if (!s.excerpt) continue;                     // excerpts are optional
      const needle = normalizeHebrew(s.excerpt);
      if (!focalHe.includes(needle)) {
        missing.push(`section "${s.title}" excerpt "${s.excerpt.slice(0, 40)}"`);
      }
    }
    expect(missing, `these excerpts were NOT found in the daf: ${missing.join(' | ')}`)
      .toHaveLength(0);
  });

  it('every rabbi.opinionStart appears verbatim in the focal Hebrew', () => {
    const missing: string[] = [];
    for (const s of analysis.sections) {
      for (const r of s.rabbis) {
        if (!r.opinionStart) continue;              // opinionStart is optional
        const needle = normalizeHebrew(r.opinionStart);
        if (!focalHe.includes(needle)) {
          missing.push(`[${s.title}] ${r.name} opinionStart "${r.opinionStart.slice(0, 40)}"`);
        }
      }
    }
    expect(missing, `these opinionStarts were NOT found in the daf: ${missing.join(' | ')}`)
      .toHaveLength(0);
  });

  it('does not surface anchor-missing validation warnings', () => {
    const warns = analysis._validationWarnings ?? [];
    // Non-anchor warnings are OK (duplicate-section etc); anchor warnings
    // mean the UI will miss an icon.
    const anchorMisses = warns.filter((w) => /not found in focal amud/.test(w));
    expect(anchorMisses, `anchor warnings: ${anchorMisses.join(' | ')}`).toHaveLength(0);
  });
});
