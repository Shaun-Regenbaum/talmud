import { describe, it, expect } from 'vitest';
import { augmentWithKnownRabbis, enrichAll, enrichRabbi, sanitizeNameHe } from '../src/worker/index';
import type { GenerationId } from '../src/client/generations';

// Helper — the enrichAll input shape.
type InputRabbi = { name: string; nameHe: string; generation: GenerationId };

describe('enrichRabbi — Hebrew-first', () => {
  it('uses Hebrew canonicalHe to pick the right slug even when English is wrong', () => {
    // Gemma sometimes emits English "Rabbah [b. Nachmani]" for Hebrew רבא
    // (actually Rava). Hebrew should win.
    const r = enrichRabbi('Rabbah [b. Nachmani]', 'רבא', 'amora-bavel-4');
    expect(r.slug).toBe('rava');
    expect(r.name).toBe('Rava');
  });

  it('pulls moved from the matched dataset entry', () => {
    // Note: region and places are dataset-driven (Kimi-enriched) and may
    // legitimately shift if the dataset is re-enriched. `moved` is the most
    // stable signal for a known mover.
    const r = enrichRabbi('Rabbi Zeira', 'רבי זירא', 'amora-bavel-3');
    expect(r.slug).toBe('rav-zera');
    expect(r.moved).toBe('bavel->israel');
  });

  it('falls back to generation-derived region when the rabbi is unknown', () => {
    const r = enrichRabbi('Some New Rabbi', 'רבי חדש', 'amora-bavel-4');
    expect(r.slug).toBeNull();
    expect(r.region).toBe('bavel');
  });
});

describe('enrichAll — slug-based dedupe', () => {
  it('collapses two mentions of the same rabbi to one entry', () => {
    // Two Hebrew forms of Rabbi Eliezer b. Hyrcanus on the same daf.
    const input: InputRabbi[] = [
      { name: 'Rabbi Eliezer',              nameHe: 'ר\' אליעזר',  generation: 'tanna-2'  },
      { name: 'Rabbi Eliezer b. Hyrcanus',  nameHe: 'רבי אליעזר',  generation: 'unknown'  },
    ];
    const out = enrichAll(input);
    expect(out.length).toBe(1);
    expect(out[0].slug).toBe('rabbi-eliezer-b-hyrcanus');
    // Prefer non-'unknown' generation and the longer nameHe.
    expect(out[0].generation).toBe('tanna-2');
    expect(out[0].nameHe).toBe('רבי אליעזר');
  });

  it('keeps genuinely different rabbis separate (different slugs)', () => {
    const input: InputRabbi[] = [
      { name: 'Rabbi Eliezer b. Hyrcanus', nameHe: 'רבי אליעזר', generation: 'tanna-2' },
      { name: 'Rabbi Elazar b. Pedat',     nameHe: 'רבי אלעזר',  generation: 'amora-ey-2' },
    ];
    const out = enrichAll(input);
    expect(out.length).toBe(2);
    const slugs = out.map((r) => r.slug).sort();
    expect(slugs).toEqual(['rabbi-elazar-b-pedat', 'rabbi-eliezer-b-hyrcanus']);
  });

  it('does NOT cross-merge Rava and Rabbah b. Nachmani (α vs ה)', () => {
    const input: InputRabbi[] = [
      { name: 'Rava',                 nameHe: 'רבא', generation: 'amora-bavel-4' },
      { name: 'Rabbah [b. Nachmani]', nameHe: 'רבה', generation: 'amora-bavel-3' },
    ];
    const out = enrichAll(input);
    expect(out.length).toBe(2);
    const slugs = out.map((r) => r.slug).sort();
    expect(slugs).toEqual(['rabbah-b-nachmani', 'rava']);
  });

  it('preserves unslugged entries (no dataset match) as-is', () => {
    const input: InputRabbi[] = [
      { name: 'Hillel',          nameHe: 'הלל',     generation: 'zugim' },
      { name: 'Someone Unknown', nameHe: 'פלוני',   generation: 'unknown' },
    ];
    const out = enrichAll(input);
    expect(out.length).toBe(2);
    expect(out.find((r) => r.slug === 'hillel')).toBeDefined();
    expect(out.find((r) => r.slug === null)).toBeDefined();
  });
});

describe('sanitizeNameHe — trim trailing context words', () => {
  it('drops Aramaic prepositions like בתר that the model over-copies', () => {
    // Observed: model returned "ר' אלכסנדרי בתר צלותיה" ("Rabbi Alexandri
    // after his prayer"); only the first two tokens are the name.
    expect(sanitizeNameHe("ר' אלכסנדרי בתר צלותיה")).toBe("ר' אלכסנדרי");
  });

  it('drops attribution verbs like אמר', () => {
    expect(sanitizeNameHe('רבי יוחנן אמר')).toBe('רבי יוחנן');
  });

  it('leaves clean names untouched', () => {
    expect(sanitizeNameHe('רבי יהושע בן לוי')).toBe('רבי יהושע בן לוי');
    expect(sanitizeNameHe("ר' אליעזר")).toBe("ר' אליעזר");
  });

  it('augmentWithKnownRabbis uses sanitized nameHe in its output', () => {
    const input = [
      { name: 'Rabbi Alexandri', nameHe: "ר' אלכסנדרי בתר צלותיה", generation: 'amora-ey-2' as GenerationId },
    ];
    const out = augmentWithKnownRabbis(input, "ר' אלכסנדרי בתר צלותיה קאמר הכי");
    const model = out.find((r) => r.name === 'Rabbi Alexandri');
    expect(model?.nameHe).toBe("ר' אלכסנדרי");
  });
});
