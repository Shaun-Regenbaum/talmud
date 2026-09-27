import { describe, expect, it } from 'vitest';
import { groundHalacha, runPasses } from '../src/lib/check/passes';
import type { TopicCodifier } from '../src/lib/halacha/codifiers';

// Chullin 74b, "redeeming a firstborn donkey with a ben peku'a": the codes
// Sefaria links to the topic's lines. The Shulchan Aruch seif has no printed
// Rema gloss, yet the model once supplied a Rema ruling for it anyway.
const codes: TopicCodifier[] = [
  {
    id: 'mishneh-torah',
    label: 'Mishneh Torah',
    short: 'Rambam',
    order: 1,
    refs: [
      {
        ref: 'Mishneh Torah, First Fruits and other Gifts to Priests Outside the Sanctuary 12:9',
        match: 'on-lines',
        einMishpat: true,
        hebrew: 'x',
        english: '',
      },
    ],
  },
  {
    id: 'shulchan-aruch',
    label: 'Shulchan Aruch',
    short: 'Mechaber',
    order: 3,
    refs: [
      {
        ref: "Shulchan Arukh, Yoreh De'ah 321:4",
        match: 'on-lines',
        einMishpat: true,
        hebrew: 'x',
        english: '',
      },
      {
        ref: "Shulchan Arukh, Yoreh De'ah 64:2",
        match: 'near',
        einMishpat: true,
        hebrew: 'x',
        english: '',
        rema: ['gloss'],
      },
    ],
  },
];

describe('groundHalacha', () => {
  it('drops unlinked refs, respells linked ones, and keeps a Rema only on a glossed seif', () => {
    const out = groundHalacha(
      {
        mishnehTorah: {
          ref: 'Mishneh Torah, First Fruits and other Gifts to Priests Outside the Sanctuary 12:9',
          ruling: 'a',
        },
        tur: { ref: "Yoreh De'ah 321", ruling: 'not linked' },
        shulchanAruch: { ref: 'Shulchan Aruch, Yoreh Deah 321:4', ruling: 'b' },
        rema: { ref: "Shulchan Arukh, Yoreh De'ah 321:4", ruling: 'invented' },
        prose: 'p',
      },
      codes,
      'halacha.codification',
    ) as Record<string, { ref: string } | null>;
    expect(out.tur).toBeNull();
    expect(out.shulchanAruch?.ref).toBe("Shulchan Arukh, Yoreh De'ah 321:4");
    expect(out.rema).toBeNull();

    const glossed = groundHalacha(
      { rema: { ref: "Yoreh De'ah 64:2", ruling: 'real gloss' } },
      codes,
      'halacha.codification',
    ) as Record<string, { ref: string } | null>;
    expect(glossed.rema?.ref).toBe("Shulchan Arukh, Yoreh De'ah 64:2");
  });

  it('keeps only linked refs in a practical basis', () => {
    const out = groundHalacha(
      {
        basis:
          "Shulchan Arukh, Yoreh De'ah 321:4; Mishneh Torah, Sacrificial Procedure 4:2; Yoreh De'ah 321:4",
      },
      codes,
      'halacha.practical',
    ) as { basis: string };
    expect(out.basis).toBe("Shulchan Arukh, Yoreh De'ah 321:4");
  });

  it('runs as a transform only when the linked codes are known', async () => {
    const parsed = { basis: 'Tur, Orach Chayim 1' };
    const ctx = { tractate: 'Chullin', page: '74b', segmentsHe: [], defId: 'halacha.practical' };
    expect((await runPasses(['halacha-ground'], parsed, ctx)).parsed).toEqual(parsed);
    expect(
      (await runPasses(['halacha-ground'], parsed, { ...ctx, halachaCodes: codes })).parsed,
    ).toEqual({ basis: '' });
  });
});
