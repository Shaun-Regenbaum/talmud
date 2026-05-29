/**
 * @fileoverview Parser for Revach l'Daf pages (revdaf.php?tid=&id=).
 *
 * Unlike the eight folder-based content types, a Revach page has no `#content`
 * container: it is two table cells, "SUMMARY" (brief numbered highlights) and
 * "A BIT MORE" (the matching numbered elaborations). Both lists are numbered
 * 1..N and pair up by number, so we emit one entry per number with the SUMMARY
 * line as the entry title and the "A BIT MORE" text as the body.
 *
 * The page predates `id=`/class conventions, so we locate each cell by its
 * centered heading and split its markup on `<br>` (items are separated by
 * `<br>&nbsp;<br>`). Numbers embedded in prose ("Pesachim (50a)") never start a
 * `<br>`-delimited line, so they don't false-trigger a new item.
 */

import { parseHtml, collapse, HTMLElement } from './common.ts';
import type { DafyomiEntry } from '../schema.ts';

export interface ParsedRevach {
  entries: DafyomiEntry[];
}

/** Find the table cell (`<td>`) whose centered heading matches `heading`. */
function cellForHeading(root: HTMLElement, heading: string): HTMLElement | null {
  for (const c of root.querySelectorAll('center')) {
    if (collapse(c.text).toUpperCase() !== heading) continue;
    let el: HTMLElement | null = c;
    while (el && el.tagName !== 'TD') el = el.parentNode as HTMLElement | null;
    if (el) return el;
  }
  return null;
}

/** Numbered items of one cell, keyed by their printed number. */
function itemsOf(cell: HTMLElement | null, heading: string): Map<number, string> {
  const out = new Map<number, string>();
  if (!cell) return out;
  // Drop everything up to and including the heading's first occurrence (the
  // centered title), then split the remaining markup on <br>. Each non-empty
  // piece is one list line.
  const idx = cell.innerHTML.search(new RegExp(heading, 'i'));
  const afterHeading = idx >= 0 ? cell.innerHTML.slice(idx + heading.length) : cell.innerHTML;
  const pieces = afterHeading.split(/<br\s*\/?>/i);
  let current = 0;
  for (const piece of pieces) {
    const txt = collapse(parseHtml(piece).text);
    if (!txt) continue;
    const m = txt.match(/^(\d+)[.)]\s*([\s\S]*)$/);
    if (m) {
      current = parseInt(m[1], 10);
      out.set(current, m[2].trim());
    } else if (current) {
      // Continuation line of the current item (rare).
      out.set(current, `${out.get(current) ?? ''} ${txt}`.trim());
    }
  }
  return out;
}

export function parseRevach(html: string): ParsedRevach {
  const root = parseHtml(html);
  const summary = itemsOf(cellForHeading(root, 'SUMMARY'), 'SUMMARY');
  const more = itemsOf(cellForHeading(root, 'A BIT MORE'), 'A BIT MORE');

  const nums = [...new Set([...summary.keys(), ...more.keys()])].sort((a, b) => a - b);
  const entries: DafyomiEntry[] = [];
  for (const n of nums) {
    const head = summary.get(n);
    const detail = more.get(n);
    entries.push({
      marker: `${n}.`,
      level: 0,
      ...(head ? { title: { en: head } } : {}),
      body: detail ? { en: detail } : {},
    });
  }
  return { entries };
}
