/**
 * @fileoverview Map a DafyomiDaf into workbench ContextItems.
 *
 * One item per card-sized unit (a Tosfos piece, glossary term, Points entry,
 * insight, chart, …). dafyomi items arrive unplaced (`segs: []`) with a coarse
 * `amud` when known; matchers place them onto segments later (Tosfos-DH
 * deterministically, AI for the rest).
 */

import type {
  DafyomiDaf, DafyomiContentType, DafyomiEntry, DafyomiAmudContent,
} from '../sefref/dafyomi/schema.ts';
import type { ContextItem } from '@corpus/core/context/types';
import { dafCoord, type AnchorCoord } from '@corpus/core/context/coord';
import { sourceLabel } from './sources.ts';

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
  const base = (kind: string, key: string): ContextItem => ({
    source: `dafyomi:${type}`, sourceLabel: sourceLabel(`dafyomi:${type}`), kind, key, url,
    segs: [], ...(block.wholeDaf ? {} : { amud }),
  });

  const b = block.body;
  switch (b.type) {
    case 'tosfos':
      b.pieces.forEach((p, i) => out.push({
        ...base('tosfos-piece', `${type}:${amud}:${i}`),
        title: { he: p.dhHe, en: p.dhTranslit },
        body: p.body,
        dhNormalized: p.dhNormalized,
      }));
      break;
    case 'background':
      b.girsa.forEach((e, i) => out.push({ ...base('girsa', `${type}:girsa:${i}`), ...entryCard(e) }));
      b.glossary.forEach((e, i) => out.push({ ...base('glossary', `${type}:gloss:${i}`), ...entryCard(e) }));
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
    case 'insights':
    case 'review':
    case 'points':
    case 'yerushalmi':
    case 'revach':
      b.entries.forEach((e, i) => out.push({ ...base(b.type, `${type}:${amud}:${i}`), ...entryCard(e), ...entryRefs(e) }));
      break;
    case 'hebcharts':
      b.tables.forEach((t, i) => {
        const headers = t.headers.map((h) => h.he ?? '');
        const rows = t.rows.map((r) => r.map((c) => c.he ?? ''));
        out.push({
          ...base('chart', `${type}:${amud}:${i}`),
          title: t.caption,
          // body keeps the flattened text (AI-match input + plain fallback);
          // `table` keeps the structure so the card renders a real table.
          body: { he: tableToText(headers, rows) },
          table: {
            headers,
            rows,
            notes: t.notes?.map((n) => ({ marker: n.marker, text: n.text.he ?? '' })),
          },
        });
      });
      break;
  }
}

/** A dafyomi entry's resolved cross-references ("Pesachim 50a") as citation
 *  coordinates. Daf-level (DAF_SEG, no specific segment) — these are things the
 *  note CITES, not where it sits. Only Revach populates `refs` today. */
function entryRefs(e: DafyomiEntry): { refs?: AnchorCoord[] } {
  const refs = (e.refs ?? [])
    .filter((r): r is typeof r & { tractate: string; page: string } => !!r.tractate && !!r.page)
    .map((r) => dafCoord({ tractate: r.tractate, page: r.page }));
  return refs.length ? { refs } : {};
}

function entryCard(e: DafyomiEntry): { title?: ContextItem['title']; body?: ContextItem['body'] } {
  const title = e.title?.en || e.title?.he ? e.title : (e.label ? { en: e.label } : undefined);
  return { title, body: { en: collectEn(e), he: collectHe(e) } };
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
