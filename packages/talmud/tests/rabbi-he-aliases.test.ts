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

describe('second round of Hebrew spelling aliases', () => {
  const CASES: ReadonlyArray<[label: string, slug: string, text: string]> = [
    // Bava Batra 136b. The later Rav Oshaya, spelled with heh.
    ['Rav Oshaya', 'rabbi-oshaya-2', 'אמר ליה כבר תרגמה רב הושעיא בבבל אחריך שאני'],
    // The elder Rabbi Oshaya, a different man, same round.
    ['Rabbi Oshaya', 'rabbi-oshaya', 'רבי הושעיא הוה יתיב קמיה דרבי חייא'],
    // Sotah 5a: he gives the teaching in the name of Rav Assi and Rav Ami.
    ['Rav Avira', 'rabbi-avira', 'דרש רב עוירא זמנין אמר לה משמיה דרב אמי'],
    // Arakhin 6a: he transmits Rabbi Yochanan.
    ['Rabbi Ila', 'rabbi-ila', 'אמר רבי אילא אמר רבי יוחנן לא קשיא הא בתחילה'],
    // The Yerushalmi spelling of Rabbi Zeira.
    ['Rabbi Zeira', 'rav-zera', 'אמר רבי זעירא תלמידי דרבי ינאי'],
    ['Rav Helbo', 'rabbi-helbo', 'רב חלבו חלש נפק קלא ואמרו ליה'],
  ];

  for (const [label, slug, text] of CASES) {
    it(`reads ${label} as ${slug}`, () => {
      expect(scan(text)).toContain(places[slug].canonical);
    });
  }

  it('does NOT read "Rabbi Zeira bar ..." as Rabbi Zeira himself', () => {
    expect(scan('אמר רבי זעירא בר חמא הכי')).not.toContain(places['rav-zera'].canonical);
  });

  it('does NOT read "Rav Oshaya son of ..." as Rav Oshaya himself', () => {
    expect(scan('אמר רב הושעיא בריה דרב אידי מילתא')).not.toContain(
      places['rabbi-oshaya-2'].canonical,
    );
  });

  // The registry gives BOTH Oshayas the English name "Rabbi Oshaya", so the
  // English name cannot tell them apart and neither can a reader. What the
  // scan must get right is which Hebrew form it matched, which is what the
  // client anchors and what downstream grounding disambiguates from.
  it('keeps the two Oshayas apart by the Hebrew form it matched', () => {
    expect(augmentWithKnownRabbis([], 'כבר תרגמה רב הושעיא בבבל').map((r) => r.nameHe)).toContain(
      'רב הושעיא',
    );
    expect(augmentWithKnownRabbis([], 'רבי הושעיא הוה יתיב').map((r) => r.nameHe)).toContain(
      'רבי הושעיא',
    );
    // Neither sentence picks up the other man's Hebrew form.
    expect(
      augmentWithKnownRabbis([], 'כבר תרגמה רב הושעיא בבבל').map((r) => r.nameHe),
    ).not.toContain('רבי הושעיא');
    expect(augmentWithKnownRabbis([], 'רבי הושעיא הוה יתיב').map((r) => r.nameHe)).not.toContain(
      'רב הושעיא',
    );
  });

  it('has Rav Mordechai, who speaks to Rav Ashi', () => {
    // Bava Kamma 62a.
    const entry = places['rav-mordechai'];
    expect(entry).toBeDefined();
    expect(entry.generation).toBe('amora-bavel-6');
    expect(scan('אמר ליה רב מרדכי לרב אשי אתון בדרבא מתניתו לה')).toContain(entry.canonical);
  });
});
