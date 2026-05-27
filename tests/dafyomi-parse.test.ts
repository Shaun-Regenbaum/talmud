import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDafyomiContent } from '../src/lib/sefref/dafyomi/parse/index';
import { assembleDaf } from '../src/lib/sefref/dafyomi/assemble';
import {
  getDafyomiMasechet, dafToNNN, buildDafyomiUrl, getContentTypeSpec, DAFYOMI_CONTENT_TYPES,
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
    const arkuvah = body.glossary[0];
    expect(arkuvah.title?.he).toBe('ארכובה');
    expect(arkuvah.title?.en).toBe('ARKUVAH');
    expect(arkuvah.body.en).toContain('knee-joint');
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
