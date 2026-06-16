import { describe, expect, it } from 'vitest';
import { isNamedSage, listUnknownRabbis, putUnknownRabbi } from '../src/worker/unknown-registry';

// Regression guard for the unknown-rabbi backlog collecting attributions that
// resolve to slug=null but are NOT a single person to research: anonymous /
// collective opinions (אחרים "Others", חכמים "the Sages", תנא קמא the anonymous
// first opinion), offices (ריש גלותא the Exilarch), schools (דבי רבי ישמעאל),
// and paired speakers ("Abaye and Rava", ...דאמרי תרוייהו). `isNamedSage` is the
// deterministic net, applied at record time and when listing the backlog (so
// collectives already in KV stop showing without a destructive purge). Seeded
// from the 2026-06 Shas backlog research (Sandbox/2026-06-16-backlog-research/).

describe('isNamedSage — rejects collective / anonymous / school / paired attributions', () => {
  const collectives: Array<[string, string]> = [
    ['אחרים', 'Acherim'],
    ['חכמים', 'Chachamim'],
    ['רבנן', 'Rabbanan'],
    ['תנא קמא', 'First Tanna'],
    ['תנו רבנן', 'Tanu Rabbanan'],
    ['יש אומרים', 'Some say'],
    ['ריש גלותא', 'Exilarch'],
    ['בית הלל', 'Beit Hillel'],
    ['בית שמאי', 'Beit Shammai'],
    ['דבי רבי ישמעאל', 'School of Rabbi Yishmael'],
    ['אביי ורבא דאמרי תרוייהו', 'Abaye and Rava'],
  ];

  it.each(collectives)('drops collective %s / %s', (nameHe, name) => {
    expect(isNamedSage(name, nameHe)).toBe(false);
  });
});

describe('isNamedSage — keeps genuine missing sages (no false positives)', () => {
  // Real, genuinely-absent sages surfaced by the research — must NOT be dropped.
  const sages: Array<[string, string]> = [
    ['בן בתירא', 'Ben Beteira'],
    ['רב שישא בריה דרב אידי', 'Rav Shisha son of Rav Idi'],
    ['רב עוירא', 'Rav Avira'],
    ['רב זוטרא בר טוביה', 'Rav Zutra bar Tovia'],
    ['רחבה', 'Rachba'],
    ['רב טביומי', 'Rav Tavyomi'],
    ['אבא חנן', 'Abba Chanan'],
    ['ריש לקיש', 'Reish Lakish'], // starts with ריש but is a person, NOT ריש גלותא
    ['רבי חנינא', 'Rabbi Chanina'],
  ];

  it.each(sages)('keeps sage %s / %s', (nameHe, name) => {
    expect(isNamedSage(name, nameHe)).toBe(true);
  });

  it('drops the bare Exilarch office but keeps a named exilarch', () => {
    expect(isNamedSage('Exilarch', 'ריש גלותא')).toBe(false); // bare office
    expect(isNamedSage('The Exilarch', undefined)).toBe(false);
    expect(isNamedSage('Mar Ukva', 'מר עוקבא')).toBe(true); // a specific exilarch — a person
    expect(isNamedSage('Exilarch Mar Ukva', undefined)).toBe(true); // named, not the bare office
  });
});

function fakeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async list({
      prefix = '',
      limit = 1000,
      cursor,
    }: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    } = {}) {
      const all = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const slice = all.slice(start, start + limit);
      const next = start + limit;
      const complete = next >= all.length;
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: complete,
        cursor: complete ? undefined : String(next),
      };
    },
  } as unknown as KVNamespace;
}

describe('putUnknownRabbi — the filter is enforced at write time', () => {
  it('records a real missing sage but never a collective attribution', async () => {
    const kv = fakeKV();
    await putUnknownRabbi(kv, {
      name: 'Ben Beteira',
      nameHe: 'בן בתירא',
      tractate: 'Pesachim',
      page: '66a',
    });
    await putUnknownRabbi(kv, {
      name: 'Acherim',
      nameHe: 'אחרים',
      tractate: 'Berakhot',
      page: '9a',
    });
    await putUnknownRabbi(kv, {
      name: 'Abaye and Rava',
      nameHe: 'אביי ורבא דאמרי תרוייהו',
      tractate: 'Shabbat',
      page: '67a',
    });

    const { sample } = await listUnknownRabbis(kv);
    const names = sample.map((r) => r.name);
    expect(names).toContain('Ben Beteira');
    expect(names).not.toContain('Acherim');
    expect(names).not.toContain('Abaye and Rava');
  });
});
