/**
 * @fileoverview Hebrew charts parser.
 *
 * Hebrew tables comparing halachic scenarios. Layout: a `p.masechtalabel`
 * ("חולין דף עו." + amud span) sets the amud; `p.textline` captions each
 * table; `div.tabletext > table` holds the grid (`td.firstrow` header cells,
 * `td.firstcol`/`td.firstcell` row labels); `p.footnoteline` carries the
 * numbered footnotes. Right-to-left Hebrew throughout.
 */

import type { DafyomiTable, DafyomiText } from '../schema.ts';
import { collapse, elementChildren, type HTMLElement, text } from './common.ts';

export interface SplitTables {
  a: DafyomiTable[];
  b: DafyomiTable[];
}

export function parseHebCharts(content: HTMLElement): SplitTables {
  const a: DafyomiTable[] = [];
  const b: DafyomiTable[] = [];
  let amud: 'a' | 'b' = 'a';
  let pendingCaption: DafyomiText | undefined;
  const notes: { marker: string; text: DafyomiText }[] = [];

  const sink = () => (amud === 'a' ? a : b);

  for (const el of elementChildren(content)) {
    const cls = el.getAttribute('class') ?? '';

    if (/\bmasechtalabel\b/.test(cls)) {
      amud = amudFromLabel(el);
      continue;
    }
    if (/\btextline\b/.test(cls)) {
      pendingCaption = { he: text(el) };
      continue;
    }
    if (/\btabletext\b/.test(cls)) {
      const table = el.querySelector('table');
      if (table) {
        const parsed = parseTable(table);
        if (pendingCaption) parsed.caption = pendingCaption;
        sink().push(parsed);
        pendingCaption = undefined;
      }
      continue;
    }
    if (/\bfootnoteline\b/.test(cls)) {
      const t = text(el);
      const m = t.match(/^\[?(\d+)\]?\s*(.*)$/);
      if (m) notes.push({ marker: `[${m[1]}]`, text: { he: m[2] || t } });
    }
  }

  // Attach all footnotes to the last table of whichever amud they followed.
  if (notes.length) {
    const last = (b.length ? b : a)[(b.length ? b : a).length - 1];
    if (last) last.notes = notes;
  }

  return { a, b };
}

function amudFromLabel(el: HTMLElement): 'a' | 'b' {
  const span = collapse(el.querySelector('span')?.text ?? '');
  // ' א ' = amud a, ' ב ' = amud b; also tolerate the printed "." / ":" mark.
  if (/ב/.test(span) || /:/.test(text(el))) return 'b';
  return 'a';
}

function parseTable(table: HTMLElement): DafyomiTable {
  const rows = table.querySelectorAll('tr');
  const headers: DafyomiText[] = [];
  const body: DafyomiText[][] = [];
  rows.forEach((tr, i) => {
    const cells = tr.querySelectorAll('td').map((td) => ({ he: text(td) }));
    const isHeader = i === 0 || tr.querySelectorAll('td.firstrow').length > 0;
    if (isHeader && headers.length === 0) {
      for (const c of cells) headers.push(c);
    } else {
      body.push(cells);
    }
  });
  return { headers, rows: body };
}
