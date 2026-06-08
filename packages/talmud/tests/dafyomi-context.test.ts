import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { DafyomiDaf } from '../src/lib/sefref/dafyomi/schema';
import { fromDafyomi } from '../src/lib/context/fromDafyomi';
import { matchTosfos } from '../src/lib/context/anchor/tosfos';

const corpus = (): DafyomiDaf =>
  JSON.parse(readFileSync(new URL('../static/dafyomi/Chullin/76.json', import.meta.url), 'utf-8'));

describe('fromDafyomi', () => {
  const items = fromDafyomi(corpus());
  it('produces items for every present content type', () => {
    const sources = new Set(items.map((i) => i.source));
    for (const t of ['insights', 'background', 'halacha', 'tosfos', 'review', 'points', 'hebcharts', 'yerushalmi', 'revach']) {
      expect(sources.has(`dafyomi:${t}`)).toBe(true);
    }
  });
  it('revach items pair the SUMMARY highlight (title) with the A BIT MORE body', () => {
    const rev = items.filter((i) => i.source === 'dafyomi:revach');
    expect(rev.length).toBeGreaterThan(1);
    expect(rev[0].sourceLabel).toBe("Revach l'Daf");
    expect(rev[0].title?.en?.length ?? 0).toBeGreaterThan(0);
    expect(rev[0].body?.en?.length ?? 0).toBeGreaterThan(0);
    expect(rev[0].segs).toEqual([]); // unplaced until the AI matcher anchors it
  });
  it('tosfos items start unplaced (segs:[]) with an amud + DH key', () => {
    const tos = items.filter((i) => i.kind === 'tosfos-piece');
    expect(tos.length).toBeGreaterThan(1);
    expect(tos[0].segs).toEqual([]);
    expect(tos[0].amud).toBeDefined();
    expect(tos.some((t) => t.dhNormalized === 'אלא')).toBe(true);
  });
  it('glossary items expose the Hebrew term as the title', () => {
    const gloss = items.filter((i) => i.kind === 'glossary');
    expect(gloss.some((g) => g.title?.he === 'ארכובה')).toBe(true);
  });
  it('hebcharts items carry a structured table (headers + rows) plus flattened body', () => {
    const charts = items.filter((i) => i.kind === 'chart');
    expect(charts.length).toBeGreaterThan(0);
    const c = charts[0];
    // the structure the card renders as a real table
    expect(c.table).toBeDefined();
    expect(c.table!.headers.length).toBeGreaterThanOrEqual(2);
    expect(c.table!.rows.length).toBeGreaterThanOrEqual(1);
    // every row is an array of cells; the first cell is the (non-empty) row label
    expect(Array.isArray(c.table!.rows[0])).toBe(true);
    expect(c.table!.rows[0][0].trim().length).toBeGreaterThan(0);
    // the flattened text fallback is kept for AI-match input / plain display
    expect(c.body?.he).toContain(' | ');
  });
});

describe('matchTosfos', () => {
  it('places DH-matched Tosfos items onto segments via pieceKeys', () => {
    const items = fromDafyomi(corpus()).filter((i) => i.kind === 'tosfos-piece');
    const tosafot = { pieces: ['אלא תימה דלמא סובר', 'הכא נמי דאמרינן'], pieceKeys: ['3:1', '7:2'] };
    const placed = matchTosfos(items, tosafot);
    expect(placed).toBe(2);
    const ela = items.find((i) => i.dhNormalized === 'אלא')!;
    expect(ela.segs).toEqual([2]); // "3:1" -> seg 2
    expect(ela.via).toBe('tosfos-dh');
  });
  it('leaves items unplaced when no tosafot pieces are available', () => {
    const items = fromDafyomi(corpus()).filter((i) => i.kind === 'tosfos-piece');
    expect(matchTosfos(items, undefined)).toBe(0);
    expect(items.every((i) => i.segs.length === 0)).toBe(true);
  });
});
