import { describe, expect, it } from 'vitest';
import RABBI_PLACES from '../src/lib/data/rabbi-places.json';
import { augmentWithKnownRabbis } from '../src/worker/index';

const places = (
  RABBI_PLACES as {
    rabbis: Record<string, { canonical: string; generation: string; region: string | null }>;
  }
).rabbis;

/** Names found by scanning `text`, with nothing supplied by a model. */
function scan(text: string): string[] {
  return augmentWithKnownRabbis([], text).map((r) => r.name);
}

describe('Hebrew spelling aliases for sages already in the registry', () => {
  it('reads the Bavli spelling of Rav Mattenah (aleph, not heh)', () => {
    // Rosh Hashanah 34a. The registry stores "רב מתנה"; the Bavli writes "רב מתנא".
    expect(scan('אלא מאי דרשי בהו והעברת כדרב מתנא דאמר רב מתנא')).toContain(
      places['rav-matenah'].canonical,
    );
  });

  it('reads Rav Shemen bar Abba as Rabbi Shimon bar Abba', () => {
    // Moed Katan 18a: he reports standing before Rabbi Yochanan in the study hall.
    expect(scan('אמר רב שמן בר אבא הוה קאימנא קמיה דרבי יוחנן בי מדרשא')).toContain(
      places['rabbi-shimon-bar-abba'].canonical,
    );
  });

  it('reads a bare Rav Ami as Rabbi Ami', () => {
    // Berakhot 33a.
    expect(scan('אמר רב אמי גדולה דעה שנתנה בתחלת ברכה של חול')).toContain(
      places['rabbi-ami'].canonical,
    );
  });

  it('does NOT read Rav Ami bar Shmuel as Rabbi Ami', () => {
    // Niddah 25b names a different man; pinning him to Rabbi Ami would be wrong.
    expect(scan('אמר רב אמי בר שמואל לדידי מפרשא לי מיניה דמר שמואל')).not.toContain(
      places['rabbi-ami'].canonical,
    );
  });

  it('does NOT read "son of Rav Ami" as Rabbi Ami speaking', () => {
    // Berakhot 60a. The patronymic names a father, not the speaker.
    expect(scan('והאמר רב יצחק בריה דרב אמי איש מזריע תחלה יולדת נקבה')).not.toContain(
      places['rabbi-ami'].canonical,
    );
  });

  it('still finds Rabbi Ami on a page that has both a bare and a compound mention', () => {
    expect(scan('אמר רב אמי בר שמואל לדידי מפרשא לי ותו אמר רב אמי גדולה דעה')).toContain(
      places['rabbi-ami'].canonical,
    );
  });
});

describe('sages added to the registry', () => {
  const CASES: ReadonlyArray<[slug: string, generation: string, region: string, text: string]> = [
    // Moed Katan 11b.
    [
      'rav-shisha-b-rav-idi',
      'amora-bavel-5',
      'bavel',
      'אמר רב שישא בריה דרב אידי זאת אומרת דברים המותרין במועד',
    ],
    // Berakhot 43b.
    [
      'rav-zutra-b-tuvya',
      'amora-bavel-2',
      'bavel',
      'ואמר רב זוטרא בר טוביה אמר רב מנין שמברכין על הריח',
    ],
    // Niddah 43b.
    ['rabbi-simai', 'tanna-6', 'israel', 'דתניא רבי סימאי אומר מנה הכתוב שתים וקראו טמא'],
  ];

  for (const [slug, generation, region, text] of CASES) {
    it(`${slug} is in the registry and found in the text that names him`, () => {
      const entry = places[slug];
      expect(entry, `${slug} missing from rabbi-places.json`).toBeDefined();
      expect(entry.generation).toBe(generation);
      expect(entry.region).toBe(region);
      expect(scan(text)).toContain(entry.canonical);
    });
  }
});
