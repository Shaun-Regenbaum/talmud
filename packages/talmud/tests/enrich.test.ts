import { describe, expect, it } from 'vitest';
import type { GenerationId } from '../src/client/generations';
import {
  augmentWithKnownRabbis,
  enrichAll,
  enrichRabbi,
  postProcessRabbi,
  rabbiMarkInputFields,
  sanitizeNameHe,
} from '../src/worker/index';

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
      { name: 'Rabbi Eliezer', nameHe: "ר' אליעזר", generation: 'tanna-2' },
      { name: 'Rabbi Eliezer b. Hyrcanus', nameHe: 'רבי אליעזר', generation: 'unknown' },
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
      { name: 'Rabbi Elazar b. Pedat', nameHe: 'רבי אלעזר', generation: 'amora-ey-2' },
    ];
    const out = enrichAll(input);
    expect(out.length).toBe(2);
    const slugs = out.map((r) => r.slug).sort();
    expect(slugs).toEqual(['rabbi-elazar-b-pedat', 'rabbi-eliezer-b-hyrcanus']);
  });

  it('does NOT cross-merge Rava and Rabbah b. Nachmani (α vs ה)', () => {
    const input: InputRabbi[] = [
      { name: 'Rava', nameHe: 'רבא', generation: 'amora-bavel-4' },
      { name: 'Rabbah [b. Nachmani]', nameHe: 'רבה', generation: 'amora-bavel-3' },
    ];
    const out = enrichAll(input);
    expect(out.length).toBe(2);
    const slugs = out.map((r) => r.slug).sort();
    expect(slugs).toEqual(['rabbah-b-nachmani', 'rava']);
  });

  it('preserves unslugged entries (no dataset match) as-is', () => {
    const input: InputRabbi[] = [
      { name: 'Hillel', nameHe: 'הלל', generation: 'zugim' },
      { name: 'Someone Unknown', nameHe: 'פלוני', generation: 'unknown' },
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
      {
        name: 'Rabbi Alexandri',
        nameHe: "ר' אלכסנדרי בתר צלותיה",
        generation: 'amora-ey-2' as GenerationId,
      },
    ];
    const out = augmentWithKnownRabbis(input, "ר' אלכסנדרי בתר צלותיה קאמר הכי");
    const model = out.find((r) => r.name === 'Rabbi Alexandri');
    expect(model?.nameHe).toBe("ר' אלכסנדרי");
  });

  it('augmentWithKnownRabbis dedupes a rabbi the model named twice', () => {
    const input = [
      { name: 'Rabbi Yochanan', nameHe: 'רבי יוחנן', generation: 'amora-ey-2' as GenerationId },
      { name: 'Rabbi Yochanan', nameHe: 'רבי יוחנן', generation: 'amora-ey-2' as GenerationId },
    ];
    const out = augmentWithKnownRabbis(input, 'רבי יוחנן אמר');
    expect(out.filter((r) => r.nameHe === 'רבי יוחנן')).toHaveLength(1);
  });
});

describe('augmentWithKnownRabbis — short-form recall (title + first given name)', () => {
  it('a daf carrying ONLY the short form of a uniquely-short-named rabbi augments it', () => {
    // "רבן יוחנן" is the title+given-name short of exactly one registry entry
    // (רבן יוחנן בן זכאי) and is no rabbi's full canonical form.
    const out = augmentWithKnownRabbis([], 'אמר רבן יוחנן משום רבי שמעון בן יהוצדק');
    const hit = out.find((r) => r.nameHe === 'רבן יוחנן');
    expect(hit).toBeDefined();
    expect(hit?.name).toBe('Rabban Yochanan ben Zakkai'); // unique → the entry itself
    expect(hit?.generation).toBe('unknown'); // grounding/fill decides the era
  });

  it('a short form shared by MANY registry entries still augments, candidate-open', () => {
    // "רבי אלעזר" is the short form of ~15 registry rabbis and no one's full
    // canonical form. The mention is real (the name IS in the text); identity
    // stays open for grounding.
    const out = augmentWithKnownRabbis([], 'אמר רבי אלעזר מאי דכתיב');
    const hit = out.find((r) => r.nameHe === 'רבי אלעזר');
    expect(hit).toBeDefined();
    expect(hit?.name).toBe('Rabbi Elazar'); // honest short English name
    expect(hit?.generation).toBe('unknown');
  });

  it('does NOT add a short-form mention when the daf carries the full form (covered)', () => {
    // Full pass adds רבן יוחנן בן זכאי; the short form then only matches
    // inside that longer name — no second instance.
    const out = augmentWithKnownRabbis([], 'אמר רבן יוחנן בן זכאי לתלמידיו');
    expect(out.filter((r) => r.nameHe === 'רבן יוחנן בן זכאי')).toHaveLength(1);
    expect(out.find((r) => r.nameHe === 'רבן יוחנן')).toBeUndefined();
  });

  it('DOES add a standalone short form alongside the full form (occurrence-aware coverage)', () => {
    // One occurrence of the short form sits inside the full name, but the
    // SECOND is standalone — the coverage check must count occurrences, not
    // blanket-skip the short form once any longer name starts with it.
    const out = augmentWithKnownRabbis(
      [],
      'אמר רבן יוחנן בן זכאי לתלמידיו ושוב אמר רבן יוחנן דבר אחר',
    );
    expect(out.filter((r) => r.nameHe === 'רבן יוחנן בן זכאי')).toHaveLength(1);
    expect(out.filter((r) => r.nameHe === 'רבן יוחנן')).toHaveLength(1);
  });

  it('covers MULTIPLE full-form occurrences before adding a standalone short form', () => {
    // Two full-form occurrences, zero standalone shorts → still no short add.
    const out = augmentWithKnownRabbis(
      [],
      'אמר רבן יוחנן בן זכאי לתלמידיו וחזר רבן יוחנן בן זכאי ואמר',
    );
    expect(out.find((r) => r.nameHe === 'רבן יוחנן')).toBeUndefined();
  });

  it('does NOT add a short form the model already covered', () => {
    const input = [
      { name: 'Rabbi Elazar', nameHe: 'רבי אלעזר', generation: 'amora-ey-2' as GenerationId },
    ];
    const out = augmentWithKnownRabbis(input, 'אמר רבי אלעזר מאי דכתיב');
    expect(out.filter((r) => r.nameHe === 'רבי אלעזר')).toHaveLength(1);
    expect(out[0].generation).toBe('amora-ey-2'); // the model instance, untouched
  });

  it('full-form behavior unchanged: a full canonical match still augments as before', () => {
    const out = augmentWithKnownRabbis([], 'דרש רבי שמעון בר יוחאי בהר');
    const hit = out.find((r) => r.nameHe === 'רבי שמעון בר יוחאי');
    expect(hit).toBeDefined();
    expect(hit?.generation).toBe('unknown');
  });
});

describe('postProcessRabbi — augmented short-form instances are anchorable', () => {
  it('stamps the matched Hebrew span as BOTH excerpt and nameHe', () => {
    const parsed = { instances: [] };
    const out = postProcessRabbi(parsed, 'אמר רבן יוחנן משום רבי שמעון בן יהוצדק') as {
      instances: Array<{ excerpt?: string; fields: Record<string, unknown> }>;
    };
    const inst = out.instances.find((i) => i.fields.nameHe === 'רבן יוחנן');
    expect(inst).toBeDefined();
    // The client's verbatim matcher anchors on the excerpt; it must be the
    // exact matched span from the daf, not the registry's full canonical.
    expect(inst?.excerpt).toBe('רבן יוחנן');
  });
});

describe('rabbiMarkInputFields — both mark_input shapes, grounding stamps included', () => {
  it('reads the sidebar FLAT shape', () => {
    const f = rabbiMarkInputFields({
      name: 'Rav Kahana',
      nameHe: 'רב כהנא',
      generation: 'amora-bavel-2',
      slug: 'rav-kahana-of-pum-nahara',
      genSource: 'relational',
      homonyms: 3,
    });
    expect(f).toEqual({
      name: 'Rav Kahana',
      nameHe: 'רב כהנא',
      generation: 'amora-bavel-2',
      slug: 'rav-kahana-of-pum-nahara',
      genSource: 'relational',
      homonyms: 3,
    });
  });

  it('reads the warm-queue MARK-INSTANCE shape ({excerpt, fields})', () => {
    const f = rabbiMarkInputFields({
      excerpt: 'רב כהנא',
      fields: { name: 'Rav Kahana', generation: 'unknown', genSource: 'ambiguous', homonyms: 3 },
    });
    expect(f.name).toBe('Rav Kahana');
    expect(f.nameHe).toBe('רב כהנא'); // excerpt fallback
    expect(f.generation).toBe('unknown');
    expect(f.slug).toBeNull();
    expect(f.genSource).toBe('ambiguous');
    expect(f.homonyms).toBe(3);
  });

  it('defaults stamps to null and an invalid generation to unknown', () => {
    const f = rabbiMarkInputFields({ name: 'Rava', nameHe: 'רבא', generation: 'bogus' });
    expect(f.generation).toBe('unknown');
    expect(f.slug).toBeNull();
    expect(f.genSource).toBeNull();
    expect(f.homonyms).toBeNull();
  });

  it('tolerates null / non-object input', () => {
    expect(rabbiMarkInputFields(null).name).toBe('');
    expect(rabbiMarkInputFields(undefined).nameHe).toBe('');
  });
});
