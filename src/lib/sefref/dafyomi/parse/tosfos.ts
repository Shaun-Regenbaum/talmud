/**
 * @fileoverview Tosfos point-by-point parser.
 *
 * Each Tosfos piece is: `div.subject` ("1) TOSFOS DH ELA"), `div.subjectheb`
 * ('תוספות ד"ה אלא' — the DH opening words), an optional `div.summary`, then
 * alternating `div.indent1heb` (Hebrew) / `div.indent1` (English, with a
 * `span.cl` "Question:" / "Answer #1:" label). The DH Hebrew words are the
 * anchor key for matching to Sefaria's tosafot pieces.
 */

import {
  elementChildren, isAmudBreak, text, collapse, normalizeHe,
  extractRefs, type HTMLElement,
} from './common.ts';
import type { DafyomiTosfosPiece, DafyomiRef } from '../schema.ts';

export interface SplitTosfos {
  a: DafyomiTosfosPiece[];
  b?: DafyomiTosfosPiece[];
  split: boolean;
}

const DH_HE_RE = /ד["”״']ה\s*(.+)$/;
const DH_EN_RE = /\bDH\s+(.+)$/i;

export function parseTosfos(content: HTMLElement): SplitTosfos {
  const a: DafyomiTosfosPiece[] = [];
  const b: DafyomiTosfosPiece[] = [];
  let amud: 'a' | 'b' = 'a';
  let split = false;
  let cur: DafyomiTosfosPiece | null = null;
  const enParts: string[] = [];
  const heParts: string[] = [];
  const refs: DafyomiRef[] = [];

  const flush = () => {
    if (!cur) return;
    const en = enParts.join('\n').trim();
    const he = heParts.join(' ').trim();
    if (en) cur.body.en = en;
    if (he) cur.body.he = he;
    if (refs.length) cur.refs = dedupeRefs(refs);
    (amud === 'a' ? a : b).push(cur);
    cur = null;
    enParts.length = 0;
    heParts.length = 0;
    refs.length = 0;
  };

  for (const el of elementChildren(content)) {
    if (isAmudBreak(el)) { amud = 'b'; split = true; continue; }
    const cls = el.getAttribute('class') ?? '';

    if (/\bsubject\b/.test(cls) && !/\bsubjectheb\b/.test(cls)) {
      flush();
      const t = text(el).replace(/^\d+\)\s*/, '');
      const translit = DH_EN_RE.exec(t)?.[1]?.trim();
      cur = { dhHe: '', dhNormalized: '', dhTranslit: translit, body: {} };
      continue;
    }
    if (!cur) continue;

    if (/\bsubjectheb\b/.test(cls)) {
      const m = DH_HE_RE.exec(text(el));
      if (m) {
        cur.dhHe = collapse(m[1]);
        cur.dhNormalized = normalizeHe(m[1]);
      }
      continue;
    }
    if (/\bsummary\b/.test(cls)) {
      const s = text(el).replace(/^\(?\s*SUMMARY:\s*/i, '').replace(/\)$/, '').trim();
      if (s) enParts.push(`SUMMARY: ${s}`);
      continue;
    }
    if (/\bindent\d+heb\b/.test(cls) || /heb\b/.test(cls)) {
      const t = text(el);
      if (t) heParts.push(t);
      continue;
    }
    if (/\bindent\d+\b/.test(cls)) {
      const t = text(el).replace(/^\([a-z]\)\s*/i, '');
      if (t) enParts.push(t);
      for (const r of extractRefs(el)) refs.push(r);
      continue;
    }
  }
  flush();

  return split ? { a, b, split } : { a, split };
}

function dedupeRefs(refs: DafyomiRef[]): DafyomiRef[] {
  const seen = new Set<string>();
  const out: DafyomiRef[] = [];
  for (const r of refs) {
    const k = r.raw.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
