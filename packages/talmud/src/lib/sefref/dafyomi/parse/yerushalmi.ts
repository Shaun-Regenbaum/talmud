/**
 * @fileoverview Yerushalmi "Point by Point Outline" parser.
 *
 * dafyomi.co.il publishes, per Bavli daf, a "Yerushalmi to Match <daf>" page —
 * the parallel Yerushalmi material with an English point-by-point outline
 * alongside the Hebrew Yerushalmi text, and an explicit Yerushalmi ref per
 * point (often cross-tractate, e.g. Bavli Chullin -> Yerushalmi Terumos).
 *
 * The DOM is the shared indented-entry idiom (`div.subject` + `div.indent1..3`
 * with `span.nm` / `span.cl`), but with two twists the generic parser mishandles:
 *   1. the Hebrew is interleaved as `div.indent1heb` / `indent2heb` / `indent3heb`
 *      (NOT `ptshebtext`), and `levelOfClass('indent1heb')` returns null (word
 *      boundary), so the generic parser DROPS it; and
 *   2. each subject carries the parallel Yerushalmi ref in a `span.source`.
 * This dedicated parser pairs the He/En and captures the ref into `entry.refs`.
 */

import type { DafyomiEntry, DafyomiRef } from '../schema.ts';
import {
  bodyText,
  collapse,
  elementChildren,
  type HTMLElement,
  isAmudBreak,
  labelOf,
  levelOfClass,
  markerOf,
  text,
  txt,
} from './common.ts';

// Hebrew source divs on the yerushalmi page (interleaved before each English
// entry). `ptshebtext`/`subjectheb` are kept for parity with the generic idiom.
const HEB_CLASS = /\b(indent[123]heb|subjectheb|ptshebtext)\b/;

/** Strip leading Vilna / Oz-VeHadar daf markers like
 *  "[דף א עמוד א] [דף א עמוד א (עוז והדר)]" off a Hebrew line. */
function stripDafMarkers(he: string): string {
  return he.replace(/^(?:\s*\[[^\]]*\]\s*)+/, '').trim();
}

/**
 * Parse a subject's "(Yerushalmi [Tractate] [Perek N] [Halachah M] Daf Xa)"
 * source span into a structured ref. `detail` carries "perek:halachah" (when
 * both are present) so a consumer can build a Sefaria
 * "Jerusalem Talmud <tractate> <perek>:<halachah>" ref; `page` is the Vilna daf.
 * `tractate` is set only when the source names a DIFFERENT Yerushalmi tractate
 * (the cross-tractate case); otherwise it's the daf's own masechet.
 */
export function parseYerushalmiRef(src: string): DafyomiRef | null {
  const m = src.match(
    /Yerushalmi\s+(?:([A-Z][A-Za-z']+)\s+)?(?:Perek\s+(\d+)\s+)?(?:Halachah\s+(\d+)\s+)?Daf\s+(\d+[ab])/,
  );
  if (!m) return null;
  const [, tractate, perek, halachah, daf] = m;
  const ref: DafyomiRef = { raw: collapse(m[0]), kind: 'yerushalmi', page: daf };
  if (tractate) ref.tractate = tractate;
  if (perek && halachah) ref.detail = `${perek}:${halachah}`;
  else if (halachah) ref.detail = `Halachah ${halachah}`;
  return ref;
}

/**
 * Parse a "Yerushalmi to Match" page's `#content` into entries. Each `subject`
 * is a top-level point (with the parallel Yerushalmi ref in `refs`); the
 * lettered `indentN` entries nest beneath it, each carrying paired English
 * (`body.en`) + Hebrew (`body.he`) text. Whole-daf (amud breaks ignored).
 */
export function parseYerushalmi(content: HTMLElement): DafyomiEntry[] {
  const top: DafyomiEntry[] = [];
  let curTop: DafyomiEntry | null = null;
  const stack: DafyomiEntry[] = [];
  let pendingHe: string | null = null;

  const deepest = (): DafyomiEntry | null => stack[stack.length - 1] ?? curTop;

  for (const el of elementChildren(content)) {
    if (isAmudBreak(el)) continue; // yerushalmi pages are a single whole-daf unit
    const cls = el.getAttribute('class') ?? '';
    if (/\bmaseches(heb)?line\b/.test(cls)) continue; // masechet-name header

    if (HEB_CLASS.test(cls)) {
      const t = stripDafMarkers(text(el));
      if (t) pendingHe = pendingHe ? `${pendingHe} ${t}` : t;
      continue;
    }

    const level = levelOfClass(cls);
    if (level == null) continue;
    const isHeading = /\bsubject\b/.test(cls);
    const marker = markerOf(el);
    const label = labelOf(el);

    if (isHeading) {
      const srcEl = el.querySelector('.source');
      const ref = srcEl ? parseYerushalmiRef(text(srcEl)) : null;
      let title = bodyText(el, marker);
      if (srcEl)
        title = title
          .replace(text(srcEl), '')
          .replace(/\s*\(\s*\)\s*$/, '')
          .trim();
      curTop = {
        marker,
        level: 0,
        title: txt(title, pendingHe ?? undefined),
        body: {},
        children: [],
      };
      if (ref) curTop.refs = [ref];
      pendingHe = null;
      top.push(curTop);
      stack.length = 0;
      stack[0] = curTop;
      continue;
    }

    if (!marker) {
      // Continuation paragraph: fold into the deepest open entry.
      const tgt = deepest();
      const body = bodyText(el, undefined, label);
      if (tgt) {
        if (body) tgt.body.en = tgt.body.en ? `${tgt.body.en}\n${body}` : body;
        if (pendingHe) tgt.body.he = tgt.body.he ? `${tgt.body.he} ${pendingHe}` : pendingHe;
      } else if (body || pendingHe) {
        curTop = { level: 0, label, body: txt(body, pendingHe ?? undefined), children: [] };
        top.push(curTop);
        stack.length = 0;
        stack[0] = curTop;
      }
      pendingHe = null;
      continue;
    }

    const entry: DafyomiEntry = {
      marker,
      level,
      label,
      body: txt(bodyText(el, marker, label), pendingHe ?? undefined),
    };
    pendingHe = null;

    if (level === 0) {
      curTop = entry;
      curTop.children = [];
      top.push(curTop);
      stack.length = 0;
      stack[0] = curTop;
      continue;
    }

    const parent = stack[level - 1] ?? curTop;
    if (parent) {
      parent.children = parent.children ?? [];
      parent.children.push(entry);
    } else {
      top.push(entry);
    }
    stack[level] = entry;
    stack.length = level + 1;
  }

  return top;
}
