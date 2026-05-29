import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDafyomiContent } from '../src/lib/sefref/dafyomi/parse/index';
import { assembleDaf } from '../src/lib/sefref/dafyomi/assemble';
import {
  getDafyomiMasechet, dafToNNN, buildDafyomiUrl, buildRevachUrl, getContentTypeSpec, DAFYOMI_CONTENT_TYPES,
} from '../src/lib/sefref/dafyomi/masechtos';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/dafyomi/${name}`, import.meta.url), 'utf-8');

describe('masechtos mapping', () => {
  it('resolves Chullin with verified coordinates + derived lastDaf', () => {
    const m = getDafyomiMasechet('Chullin');
    expect(m).toMatchObject({ dir: 'chulin', prefix: 'ch', gid: 33, lastDaf: 142, verified: true });
  });

  it('is case-insensitive and returns null for unmapped tractates', () => {
    expect(getDafyomiMasechet('chullin')?.dir).toBe('chulin');
    expect(getDafyomiMasechet('Nonsense')).toBeNull();
  });

  it('zero-pads daf numbers to 3 digits and rejects out-of-range', () => {
    expect(dafToNNN(2)).toBe('002');
    expect(dafToNNN(76)).toBe('076');
    expect(dafToNNN(142)).toBe('142');
    expect(() => dafToNNN(0)).toThrow();
    expect(() => dafToNNN(1000)).toThrow();
  });

  it('builds the live URL with no daf-number offset', () => {
    const m = getDafyomiMasechet('Chullin')!;
    expect(buildDafyomiUrl(m, getContentTypeSpec('insights'), 76))
      .toBe('https://www.dafyomi.co.il/chulin/insites/ch-dt-076.htm');
    expect(buildDafyomiUrl(m, getContentTypeSpec('review'), 76))
      .toBe('https://www.dafyomi.co.il/chulin/review/ch-rg-076.htm?q=1');
    expect(buildDafyomiUrl(m, getContentTypeSpec('yerushalmi'), 76))
      .toBe('https://www.dafyomi.co.il/chulin/yerushalmi/ch-yr-076.htm');
  });

  it('covers exactly the eight v1 content types', () => {
    expect(DAFYOMI_CONTENT_TYPES.map((s) => s.type).sort()).toEqual(
      ['background', 'halacha', 'hebcharts', 'insights', 'points', 'review', 'tosfos', 'yerushalmi'],
    );
  });
});

describe('insights parser', () => {
  const r = parseDafyomiContent('insights', fixture('chulin-insites-076.htm'));
  it('reads the title line and whole-daf entries', () => {
    expect(r.titleLine).toBe('INSIGHTS TO THE DAF - CHULIN 76');
    expect(r.parseWarnings).toEqual([]);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].wholeDaf).toBe(true);
  });
  it('parses numbered subjects with nested (a)/(b) sub-entries and bodies', () => {
    const body = r.blocks[0].body;
    if (body.type !== 'insights') throw new Error('wrong body type');
    expect(body.entries.length).toBeGreaterThanOrEqual(3);
    const first = body.entries[0];
    expect(first.marker).toBe('1)');
    expect(first.title?.en).toContain('TZOMES');
    expect((first.children?.length ?? 0)).toBeGreaterThanOrEqual(2);
    expect(first.children?.[0].body.en?.length ?? 0).toBeGreaterThan(20);
  });
});

describe('tosfos parser', () => {
  const r = parseDafyomiContent('tosfos', fixture('chulin-tosfos-076.htm'));
  it('splits by amud and parses pieces with DH anchor keys', () => {
    expect(r.titleLine).toContain('TOSFOS');
    expect(r.blocks.length).toBe(2); // 76a + 76b
    const all = r.blocks.flatMap((b) => (b.body.type === 'tosfos' ? b.body.pieces : []));
    expect(all.length).toBeGreaterThan(1);
    for (const p of all) {
      expect(p.dhHe.length).toBeGreaterThan(0);
      expect(p.dhNormalized.length).toBeGreaterThan(0);
    }
    const first = all[0];
    expect(first.dhHe).toBe('אלא');
    expect(first.dhTranslit).toBe('ELA');
    expect(first.body.en).toContain('SUMMARY:');
  });
});

describe('background parser', () => {
  const r = parseDafyomiContent('background', fixture('chulin-backgrnd-076.htm'));
  it('separates girsa from glossary and exposes Hebrew terms for anchoring', () => {
    const body = r.blocks[0].body;
    if (body.type !== 'background') throw new Error('wrong body type');
    expect(body.glossary.length).toBeGreaterThan(10);
    expect(body.girsa.length).toBeGreaterThan(0); // this page HAS a girsa section
    const arkuvah = body.glossary[0];
    expect(arkuvah.title?.he).toBe('ארכובה');
    expect(arkuvah.title?.en).toBe('ARKUVAH');
    expect(arkuvah.body.en).toContain('knee-joint');
  });

  it('parses the glossary on a page with NO girsa section (no girsasep separator)', () => {
    // Regression: the parser used to stay stuck in "girsa" mode without a
    // girsasep separator and swallow every glossary entry (Sanhedrin 37a).
    const sr = parseDafyomiContent('background', fixture('sanhedrin-backgrnd-037.htm'));
    const body = sr.blocks[0].body;
    if (body.type !== 'background') throw new Error('wrong body type');
    expect(body.girsa.length).toBe(0);
    expect(body.glossary.length).toBeGreaterThan(40); // ~62 terms
    expect(body.glossary[0].title?.he).toBe('ושלש שורות');
    expect(body.glossary[0].title?.en).toBe('SHALOSH SHUROS');
    expect(sr.parseWarnings).toEqual([]);
  });
});

describe('points parser', () => {
  const r = parseDafyomiContent('points', fixture('chulin-points-076.htm'));
  it('splits by amud, captures speaker tags and interleaved Hebrew', () => {
    expect(r.blocks.length).toBe(2);
    const a = r.blocks[0].body;
    if (a.type !== 'points') throw new Error('wrong body type');
    expect(a.entries[0].title?.en).toContain('CUTTING THE LEGS');
    const sub = a.entries[0].children?.[0];
    expect(sub?.speaker?.roleEn).toBe('Mishnah');
    expect(sub?.body.he?.length ?? 0).toBeGreaterThan(0); // ptshebtext attached
  });
});

describe('revach parser', () => {
  const r = parseDafyomiContent('revach', fixture('chulin-revach-110.htm'));
  it('reads the title and one whole-daf block (no #content container)', () => {
    expect(r.titleLine).toBe("REVACH L'DAF - CHULIN 110");
    expect(r.parseWarnings).toEqual([]);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].wholeDaf).toBe(true);
  });
  it('pairs each SUMMARY highlight (title) with its A BIT MORE elaboration (body)', () => {
    const body = r.blocks[0].body;
    if (body.type !== 'revach') throw new Error('wrong body type');
    expect(body.entries).toHaveLength(5);
    const first = body.entries[0];
    expect(first.marker).toBe('1.');
    expect(first.title?.en).toBe('The Gemara explains that Rav did not really maintain that it is forbidden to eat udders.');
    expect(first.body.en).toContain('Tatalfush');
    // numbers embedded in prose ("Pesachim (50a)") must NOT start a new item
    expect(body.entries[2].body.en).toContain('Pesachim (50a)');
  });
});

describe('buildRevachUrl', () => {
  it('builds the memdb URL for a masechet with a known tid (no zero-padding)', () => {
    const m = getDafyomiMasechet('Chullin')!;
    expect(buildRevachUrl(m, 110)).toBe('https://www.dafyomi.co.il/memdb/revdaf.php?tid=31&id=110');
  });
  it('uses the right tid where Revach tid diverges from gid', () => {
    // gid skips 28/29 (Eduyos/Avos), so from Horayot on, tid < gid.
    expect(buildRevachUrl(getDafyomiMasechet('Berakhot')!, 2)).toBe('https://www.dafyomi.co.il/memdb/revdaf.php?tid=1&id=2');
    expect(buildRevachUrl(getDafyomiMasechet('Horayot')!, 2)).toBe('https://www.dafyomi.co.il/memdb/revdaf.php?tid=28&id=2');
    expect(buildRevachUrl(getDafyomiMasechet('Niddah')!, 2)).toBe('https://www.dafyomi.co.il/memdb/revdaf.php?tid=40&id=2');
  });
  it('returns null when the masechet has no known Revach tid', () => {
    // No SEED row omits tid anymore, so synthesize one to cover the guard.
    const m = { ...getDafyomiMasechet('Chullin')!, tid: undefined };
    expect(buildRevachUrl(m, 2)).toBeNull();
  });
  it('maps a Revach tid for every tractate in the table', () => {
    for (const t of TRACTATES_WITH_REVACH) {
      expect(getDafyomiMasechet(t)?.tid, t).toBeTypeOf('number');
    }
  });
});

/** Every app tractate that should now resolve a Revach tid. */
const TRACTATES_WITH_REVACH = [
  'Berakhot', 'Shabbat', 'Eruvin', 'Pesachim', 'Shekalim', 'Yoma', 'Sukkah', 'Beitzah',
  'Rosh Hashanah', 'Taanit', 'Megillah', 'Moed Katan', 'Chagigah', 'Yevamot', 'Ketubot',
  'Nedarim', 'Nazir', 'Sotah', 'Gittin', 'Kiddushin', 'Bava Kamma', 'Bava Metzia', 'Bava Batra',
  'Sanhedrin', 'Makkot', 'Shevuot', 'Avodah Zarah', 'Horayot', 'Zevachim', 'Menachot',
  'Chullin', 'Bekhorot', 'Arakhin', 'Temurah', 'Keritot', 'Meilah', 'Niddah',
];

describe('assembleDaf', () => {
  it('files blocks per amud, records source URLs, and lists absent types', () => {
    const m = getDafyomiMasechet('Chullin')!;
    const { daf, warnings } = assembleDaf('Chullin', 76, [
      { type: 'insights', url: buildDafyomiUrl(m, getContentTypeSpec('insights'), 76), html: fixture('chulin-insites-076.htm') },
      { type: 'tosfos', url: buildDafyomiUrl(m, getContentTypeSpec('tosfos'), 76), html: fixture('chulin-tosfos-076.htm') },
      { type: 'halacha', url: buildDafyomiUrl(m, getContentTypeSpec('halacha'), 76), html: null },
    ], '2026-01-01T00:00:00.000Z');

    expect(daf.schemaVersion).toBe(1);
    expect(daf.tractate).toBe('Chullin');
    expect(daf.absent).toEqual(['halacha']);
    expect(daf.source.urls.insights).toContain('ch-dt-076');
    expect(daf.source.urls.halacha).toBeUndefined();
    expect(daf.amudim.a?.insights).toBeDefined();
    expect(daf.amudim.a?.tosfos).toBeDefined();
    expect(daf.amudim.b?.tosfos).toBeDefined(); // tosfos split across amudim
    expect(warnings).toEqual([]);
  });
});
