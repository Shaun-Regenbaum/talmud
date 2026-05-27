import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { DafyomiDaf } from '../src/lib/sefref/dafyomi/schema';
import { fromDafyomi } from '../src/lib/context/fromDafyomi';
import { fromSefariaCommentary } from '../src/lib/context/fromSefariaCommentary';
import { matchTosfos } from '../src/lib/context/anchor/tosfos';
import type { SefariaLink } from '../src/lib/sefref/sefaria/links';

const corpus = (): DafyomiDaf =>
  JSON.parse(readFileSync(new URL('../static/dafyomi/Chullin/76.json', import.meta.url), 'utf-8'));

describe('fromDafyomi', () => {
  const items = fromDafyomi(corpus());
  it('produces items for every present content type', () => {
    const sources = new Set(items.map((i) => i.source));
    for (const t of ['insights', 'background', 'halacha', 'tosfos', 'review', 'points', 'hebcharts', 'yerushalmi']) {
      expect(sources.has(`dafyomi:${t}`)).toBe(true);
    }
  });
  it('tosfos items start amud-anchored and carry the DH normalized key', () => {
    const tos = items.filter((i) => i.kind === 'tosfos-piece');
    expect(tos.length).toBeGreaterThan(1);
    expect(tos[0].anchor.kind).toBe('amud');
    expect(tos[0].anchorMatched).toBe(false);
    expect(tos.some((t) => t.match?.dhNormalized === 'אלא')).toBe(true);
  });
  it('glossary items expose the Hebrew term for phrase anchoring', () => {
    const gloss = items.filter((i) => i.kind === 'glossary');
    expect(gloss.some((g) => g.match?.termHe === 'ארכובה')).toBe(true);
  });
});

describe('matchTosfos', () => {
  it('promotes DH-matched Tosfos pieces to segment anchors via pieceKeys', () => {
    const items = fromDafyomi(corpus()).filter((i) => i.kind === 'tosfos-piece');
    // Synthetic Sefaria tosafot pieces whose openings match the corpus DHs.
    const tosafot = {
      pieces: ['אלא תימה דלמא סובר', 'הכא נמי דאמרינן'],
      pieceKeys: ['3:1', '7:2'],
    };
    const promoted = matchTosfos(items, tosafot);
    expect(promoted).toBe(2);
    const ela = items.find((i) => i.match?.dhNormalized === 'אלא')!;
    expect(ela.anchor).toEqual({ kind: 'segment', segIdx: 2 }); // "3:1" -> seg 2
    expect(ela.anchorMatched).toBe(true);
    expect(ela.highlightSegs).toEqual([2]);
  });
  it('leaves items untouched when no tosafot pieces are available', () => {
    const items = fromDafyomi(corpus()).filter((i) => i.kind === 'tosfos-piece');
    expect(matchTosfos(items, undefined)).toBe(0);
    expect(items.every((i) => i.anchor.kind === 'amud')).toBe(true);
  });
});

describe('fromSefariaCommentary', () => {
  it('maps links to segment / segment-range anchors (already matched)', () => {
    const links: SefariaLink[] = [
      { daf: '76a', sentenceIndexStart: 4, ref: 'Rashi on Chullin 76a:5:1', category: 'Commentary', title: { en: 'Rashi', he: 'רש"י' }, commentaryType: 'rashi' },
      { daf: '76a', sentenceIndexStart: 2, sentenceIndexEnd: 4, ref: 'Tosafot on Chullin 76a:3:1', category: 'Commentary', title: { en: 'Tosafot', he: 'תוספות' }, commentaryType: 'tosafot' },
    ];
    const items = fromSefariaCommentary(links);
    expect(items[0].anchor).toEqual({ kind: 'segment', segIdx: 4 });
    expect(items[0].highlightSegs).toEqual([4]);
    expect(items[1].anchor).toEqual({ kind: 'segment-range', startSegIdx: 2, endSegIdx: 4 });
    expect(items[1].highlightSegs).toEqual([2, 3, 4]);
    expect(items.every((i) => i.anchorMatched)).toBe(true);
  });
});
