/**
 * @fileoverview Map a DafyomiDaf into workbench ContextItems.
 *
 * One item per "card-sized" unit: a Tosfos piece, a glossary term, a Points
 * top-entry, an insights/halacha/review/yerushalmi top-entry, or a chart.
 * Items start anchored at amud (or whole-daf) level; the matchers in
 * `./anchor/` promote the ones they can.
 */

import type {
  DafyomiDaf, DafyomiContentType, DafyomiEntry, DafyomiAmudContent, DafyomiText,
} from '../sefref/dafyomi/schema.ts';
import type { ContextItem, AnchorState } from './types.ts';
import { highlightSegsFor } from './types.ts';

const SOURCE_LABEL: Record<DafyomiContentType, string> = {
  insights: 'Insights', background: 'Background', halacha: 'Halacha', tosfos: 'Tosfos',
  review: 'Review', points: 'Points', hebcharts: 'Charts', yerushalmi: 'Yerushalmi',
};

export function fromDafyomi(daf: DafyomiDaf): ContextItem[] {
  const items: ContextItem[] = [];
  for (const amud of ['a', 'b'] as const) {
    const byType = daf.amudim[amud];
    if (!byType) continue;
    for (const type of Object.keys(byType) as DafyomiContentType[]) {
      const block = byType[type];
      if (block) collectBlock(daf, amud, block, items);
    }
  }
  return items;
}

function collectBlock(
  daf: DafyomiDaf, amud: 'a' | 'b', block: DafyomiAmudContent, out: ContextItem[],
): void {
  const type = block.type;
  const url = daf.source.urls[type];
  const anchor: AnchorState = block.wholeDaf ? { kind: 'whole-daf' } : { kind: 'amud', amud };
  const base = (kind: string, key: string): Omit<ContextItem, 'title' | 'body'> => ({
    source: `dafyomi:${type}`, sourceLabel: SOURCE_LABEL[type], kind, key,
    url, anchor, anchorMatched: false, highlightSegs: highlightSegsFor(anchor),
  });

  const b = block.body;
  switch (b.type) {
    case 'tosfos':
      b.pieces.forEach((p, i) => out.push({
        ...base('tosfos-piece', `${type}:${amud}:${i}`),
        title: { he: p.dhHe, en: p.dhTranslit },
        body: p.body,
        refs: p.refs,
        match: { dhNormalized: p.dhNormalized },
      }));
      break;
    case 'background':
      b.girsa.forEach((e, i) => out.push({ ...base('girsa', `${type}:girsa:${i}`), ...entryCard(e) }));
      b.glossary.forEach((e, i) => out.push({
        ...base('glossary', `${type}:gloss:${i}`),
        ...entryCard(e),
        match: { termHe: e.title?.he },
      }));
      break;
    case 'halacha': {
      const groups: [string, DafyomiEntry[]][] = [['Gemara', b.gemara], ['Rishonim', b.rishonim], ['Poskim', b.poskim]];
      let i = 0;
      for (const [label, entries] of groups) {
        for (const e of entries) {
          const card = entryCard(e);
          out.push({ ...base('halacha', `${type}:${amud}:${i++}`), title: card.title ?? { en: `${label}: ${b.question?.en ?? ''}` }, body: card.body });
        }
      }
      break;
    }
    case 'points':
      b.entries.forEach((e, i) => out.push({
        ...base('points', `${type}:${amud}:${i}`),
        ...entryCard(e),
        match: { pointsHe: collectHe(e), pointsEn: collectEn(e) },
      }));
      break;
    case 'insights':
    case 'review':
    case 'yerushalmi':
      b.entries.forEach((e, i) => out.push({ ...base(b.type, `${type}:${amud}:${i}`), ...entryCard(e) }));
      break;
    case 'hebcharts':
      b.tables.forEach((t, i) => out.push({
        ...base('chart', `${type}:${amud}:${i}`),
        title: t.caption,
        body: { he: tableToText(t.headers.map((h) => h.he ?? ''), t.rows.map((r) => r.map((c) => c.he ?? ''))) },
      }));
      break;
  }
}

function entryCard(e: DafyomiEntry): { title?: DafyomiText; body?: DafyomiText; refs?: DafyomiEntry['refs'] } {
  const title = e.title?.en || e.title?.he
    ? e.title
    : (e.label ? { en: e.label } : undefined);
  return { title, body: { en: collectEn(e), he: collectHe(e) }, refs: e.refs };
}

function collectEn(e: DafyomiEntry, depth = 0): string {
  const pad = '  '.repeat(depth);
  const head = [e.marker, e.label, e.body.en].filter(Boolean).join(' ');
  const lines = head ? [pad + head] : [];
  for (const c of e.children ?? []) { const s = collectEn(c, depth + 1); if (s) lines.push(s); }
  return lines.join('\n').trim();
}

function collectHe(e: DafyomiEntry): string {
  const parts: string[] = [];
  if (e.body.he) parts.push(e.body.he);
  for (const c of e.children ?? []) { const s = collectHe(c); if (s) parts.push(s); }
  return parts.join(' ').trim();
}

function tableToText(headers: string[], rows: string[][]): string {
  const lines = [headers.join(' | '), ...rows.map((r) => r.join(' | '))];
  return lines.filter((l) => l.replace(/[ |]/g, '')).join('\n');
}
