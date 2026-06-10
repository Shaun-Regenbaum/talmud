/**
 * @fileoverview Shared parsing helpers for dafyomi.co.il pages.
 *
 * The pages are real (if dated) HTML with a stable class vocabulary, NOT
 * free text — so we parse the DOM with node-html-parser and key on classes
 * (`subject`, `reg`/`reg1`/`reg2`, `indent1..3`, `nm`, `cl`, `defheb`,
 * `bbbline`) rather than regex-scanning prose. Every per-type parser shares
 * the primitives here.
 */

import { HTMLElement, type Node, parse } from 'node-html-parser';
import { resolveDafRef } from '../masechtos.ts';
import type { DafyomiRef, DafyomiText } from '../schema.ts';

export { HTMLElement };

export function parseHtml(html: string): HTMLElement {
  return parse(html, { comment: false });
}

/** The page's main content container. */
export function contentRoot(html: string): HTMLElement | null {
  return parseHtml(html).querySelector('#content');
}

/** The page <title>, e.g. "INSIGHTS TO THE DAF - CHULIN 76". */
export function titleLine(html: string): string | undefined {
  const t = parseHtml(html).querySelector('title')?.text;
  return t ? collapse(t) : undefined;
}

export function isEl(n: Node): n is HTMLElement {
  return n instanceof HTMLElement && !!(n as HTMLElement).tagName;
}

/** Element children only (no text nodes), in document order. */
export function elementChildren(el: HTMLElement): HTMLElement[] {
  return el.childNodes.filter(isEl);
}

export function collapse(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/** Element text with whitespace collapsed. */
export function text(el: HTMLElement): string {
  return collapse(el.text);
}

/** The list marker for an entry element, e.g. "1)", "(a)", "i.", "[1]". */
export function markerOf(el: HTMLElement): string | undefined {
  const nm = el.querySelector('.nm');
  if (!nm) return undefined;
  const m = collapse(nm.text);
  return m || undefined;
}

/** An inline label preceding the body, e.g. "QUESTION:", "(Mishnah):",
 *  "Answer #1:". Sourced from a `.cl` span or a leading bare `<span>X:</span>`. */
export function labelOf(el: HTMLElement): string | undefined {
  const cl = el.querySelector('.cl');
  if (cl) {
    const t = collapse(cl.text);
    if (t) return t;
  }
  // Leading bare-span label (insights uses <span>QUESTION:</span>).
  const firstSpan = el.querySelector('span:not(.nm):not(.ln):not(.hack)');
  if (firstSpan) {
    const t = collapse(firstSpan.text);
    if (t && /:$/.test(t) && t.length < 40) return t;
  }
  return undefined;
}

/** Body text of an entry element with the marker and label stripped. */
export function bodyText(el: HTMLElement, marker?: string, label?: string): string {
  let t = text(el);
  if (marker && t.startsWith(marker)) t = t.slice(marker.length).trim();
  if (label && t.startsWith(label)) t = t.slice(label.length).trim();
  return t;
}

/** Map a class attribute to a nesting level. Covers both class vocabularies
 *  (insights `reg`/`reg1`/`reg2`, halacha/points/review `indent1..3`). Returns
 *  0 for top-level body, N for nested, or null for non-content elements. */
export function levelOfClass(classAttr: string): number | null {
  const cls = ` ${classAttr} `;
  if (/\bsubject\b/.test(classAttr)) return 0;
  if (/\b(reg3|indent3)\b/.test(classAttr)) return 3;
  if (/\b(reg2|indent2)\b/.test(classAttr)) return 2;
  if (/\b(reg1|indent1|inyan1)\b/.test(classAttr)) return 1;
  if (/\b(reg|reghal|regoneword|reg0|indent0|def|deftext)\b/.test(classAttr)) return 0;
  void cls;
  return null;
}

/** True when an element is the "76b----76b" amud separator. */
export function isAmudBreak(el: HTMLElement): boolean {
  if (el.classList.contains('bbbline')) return true;
  return /\b\d+b-{3,}\d+b\b/.test(el.text);
}

const NIQQUD_RE = /[֑-ׇ]/g;
/** Mirror of normalizeHeForResolve in the worker: strip niqqud, bracketed
 *  asides, punctuation; collapse whitespace. Used to fuzzy-match Hebrew. */
export function normalizeHe(s: string): string {
  return s
    .replace(NIQQUD_RE, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lift inline source citations from an entry element: bold source names plus
 *  parenthetical references. Best-effort; `raw` is always verbatim. */
export function extractRefs(el: HTMLElement): DafyomiRef[] {
  const refs: DafyomiRef[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const r = collapse(raw);
    if (!r || seen.has(r.toLowerCase())) return;
    seen.add(r.toLowerCase());
    refs.push({ raw: r, kind: classifyRef(r) });
  };
  for (const b of el.querySelectorAll('b')) push(b.text);
  const t = text(el);
  const paren = t.match(/\(([^()]{2,80})\)/g) ?? [];
  for (const p of paren) {
    const inner = p.slice(1, -1);
    if (
      /\b(DH|Rashi|Tosfos|Tosafos|Rambam|Rosh|Rif|Ramban|Shulchan|YD|OC|EH|CM|\d+[ab])\b/i.test(
        inner,
      )
    ) {
      push(inner);
    }
  }
  return refs;
}

// A capitalised name (1–3 words, allowing a leading qualifier like "Maseches")
// directly followed by a daf, the daf optionally parenthesised: "Pesachim (50a)",
// "Bava Kama 50a", "Maseches Pesachim 50a".
const DAF_REF_RE = /\b([A-Z][a-zA-Z']+(?:\s+[A-Z][a-zA-Z']+){0,2})\s*\(?(\d{1,3}[ab])\)?/g;

/** Find resolvable cross-references ("Pesachim 50a") in English prose and return
 *  them as DafyomiRefs with `tractate`/`page` filled. CONSERVATIVE: only emits a
 *  ref when the name resolves to a KNOWN tractate AND the daf is in range, so
 *  "Rebbi Eliezer 2a" or "Pesachim 999a" are ignored. Deduped by (tractate, page). */
export function findDafRefs(prose: string): DafyomiRef[] {
  const out: DafyomiRef[] = [];
  const seen = new Set<string>();
  for (const m of prose.matchAll(DAF_REF_RE)) {
    const resolved = resolveDafRef(m[1], m[2]);
    if (!resolved) continue;
    const key = `${resolved.tractate}:${resolved.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ raw: collapse(`${m[1]} ${resolved.page}`), kind: 'gemara', ...resolved });
  }
  return out;
}

function classifyRef(raw: string): DafyomiRef['kind'] {
  const s = raw.toLowerCase();
  if (/\brashi\b/.test(s)) return 'rashi';
  if (/\btosf?os|tosafos\b/.test(s)) return 'tosfos';
  if (/\brambam\b/.test(s)) return 'rambam';
  if (/\bshulchan|\byd \d|\boc \d/.test(s)) return 'shulchanAruch';
  if (/\bmishnah\b/.test(s)) return 'mishnah';
  if (/\bberaisa|gemara\b/.test(s)) return 'gemara';
  if (/\b(rosh|rif|ramban|ritva|rashba|ran|meiri|riva)\b/.test(s)) return 'rishon';
  if (/\b\d+[ab]\b/.test(s)) return 'gemara';
  return 'other';
}

export function he(s: string | undefined): DafyomiText | undefined {
  const v = s ? collapse(s) : '';
  return v ? { he: v } : undefined;
}

export function txt(en?: string, heText?: string): DafyomiText {
  const out: DafyomiText = {};
  if (en && collapse(en)) out.en = collapse(en);
  if (heText && collapse(heText)) out.he = collapse(heText);
  return out;
}
