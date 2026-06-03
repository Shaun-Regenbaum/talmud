/**
 * @fileoverview Per-content-type parse dispatcher.
 *
 * `parseDafyomiContent(type, html)` returns one or two `DafyomiAmudContent`
 * blocks (two when the source splits the daf at a "76b----76b" separator) plus
 * any non-fatal parse warnings. The scraper assembles these into a `DafyomiDaf`.
 */

import { contentRoot, titleLine } from './common.ts';
import { parseIndentedEntries } from './entries.ts';
import { parseTosfos } from './tosfos.ts';
import { parseBackground } from './background.ts';
import { parseReview } from './review.ts';
import { parseHebCharts } from './hebcharts.ts';
import { parseRevach } from './revach.ts';
import { parseYerushalmi } from './yerushalmi.ts';
import type {
  DafyomiContentType, DafyomiAmudContent, DafyomiBody, DafyomiEntry, DafyomiPointsEntry,
} from '../schema.ts';

export interface ParsedContent {
  type: DafyomiContentType;
  titleLine?: string;
  blocks: DafyomiAmudContent[];
  parseWarnings: string[];
}

export function parseDafyomiContent(type: DafyomiContentType, html: string): ParsedContent {
  const warnings: string[] = [];
  const title = titleLine(html);

  // Revach pages have no #content container (they predate it) — parse the
  // SUMMARY / A BIT MORE cells directly, before the #content guard below.
  if (type === 'revach') {
    const { entries } = parseRevach(html);
    if (entries.length === 0) warnings.push('no revach entries parsed');
    return {
      type,
      titleLine: title,
      blocks: entries.length ? [{ type, amud: 'a', wholeDaf: true, titleLine: title, body: { type, entries } }] : [],
      parseWarnings: warnings,
    };
  }

  const content = contentRoot(html);
  if (!content) {
    warnings.push('no #content container found');
    return { type, titleLine: title, blocks: [], parseWarnings: warnings };
  }

  const mk = (amud: 'a' | 'b', body: DafyomiBody, wholeDaf?: boolean): DafyomiAmudContent => ({
    type, amud, wholeDaf, titleLine: title, body,
  });

  let blocks: DafyomiAmudContent[] = [];

  switch (type) {
    case 'insights': {
      const { a } = parseIndentedEntries(content);
      blocks = [mk('a', { type, entries: a }, true)];
      if (a.length === 0) warnings.push('no insight entries parsed');
      break;
    }
    case 'halacha': {
      const { a } = parseIndentedEntries(content);
      const body = toHalacha(a);
      blocks = [mk('a', body, true)];
      if (body.gemara.length + body.rishonim.length + body.poskim.length === 0) {
        warnings.push('no halacha entries parsed');
      }
      break;
    }
    case 'yerushalmi': {
      const entries = parseYerushalmi(content);
      blocks = [mk('a', { type, entries }, true)];
      if (entries.length === 0) warnings.push('no yerushalmi entries parsed');
      break;
    }
    case 'points': {
      const { a, b, split } = parseIndentedEntries(content, { speaker: true });
      blocks = [mk('a', { type, entries: a as DafyomiPointsEntry[] }, !split)];
      if (split && b) blocks.push(mk('b', { type, entries: b as DafyomiPointsEntry[] }));
      if (a.length === 0 && (!b || b.length === 0)) warnings.push('no points entries parsed');
      break;
    }
    case 'tosfos': {
      const { a, b, split } = parseTosfos(content);
      blocks = [mk('a', { type, pieces: a }, !split)];
      if (split && b) blocks.push(mk('b', { type, pieces: b }));
      const total = a.length + (b?.length ?? 0);
      if (total === 0) warnings.push('no tosfos pieces parsed');
      for (const p of [...a, ...(b ?? [])]) if (!p.dhHe) warnings.push('tosfos piece missing DH');
      break;
    }
    case 'background': {
      const { girsa, glossary } = parseBackground(content);
      blocks = [mk('a', { type, girsa, glossary }, true)];
      if (girsa.length + glossary.length === 0) warnings.push('no background entries parsed');
      break;
    }
    case 'review': {
      const entries = parseReview(content);
      blocks = [mk('a', { type, entries }, true)];
      if (entries.length === 0) warnings.push('no review questions parsed');
      break;
    }
    case 'hebcharts': {
      const { a, b } = parseHebCharts(content);
      blocks = [mk('a', { type, tables: a }, b.length === 0)];
      if (b.length) blocks.push(mk('b', { type, tables: b }));
      if (a.length + b.length === 0) warnings.push('no charts parsed');
      break;
    }
  }

  return { type, titleLine: title, blocks, parseWarnings: warnings };
}

/** Map the generic question -> (a)Gemara / (b)Rishonim / (c)Poskim tree into
 *  the halacha body shape. Falls back to bucketing everything under gemara. */
function toHalacha(entries: DafyomiEntry[]): Extract<DafyomiBody, { type: 'halacha' }> {
  const body: Extract<DafyomiBody, { type: 'halacha' }> = {
    type: 'halacha', gemara: [], rishonim: [], poskim: [],
  };
  const q = entries[0];
  if (!q) return body;
  body.question = q.title ?? (q.body.en ? { en: q.body.en } : undefined);
  for (const child of q.children ?? []) {
    const head = (child.body.en || child.title?.en || '').toLowerCase();
    const items = child.children ?? [child];
    if (/poskim/.test(head)) body.poskim.push(...items);
    else if (/rishonim/.test(head)) body.rishonim.push(...items);
    else if (/gemara/.test(head)) body.gemara.push(...items);
    else body.gemara.push(child);
  }
  // If the page wasn't shaped as a single question with a/b/c, keep everything.
  if (body.gemara.length + body.rishonim.length + body.poskim.length === 0) {
    body.gemara = entries;
  }
  return body;
}
