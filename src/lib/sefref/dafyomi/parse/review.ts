/**
 * @fileoverview Review-questions parser.
 *
 * Questions live in `div.question` blocks (a `div.qlabel` "1)" plus nested
 * `div.indent1..2` sub-questions); answers mirror them in `div.answer` blocks
 * (`div.alabel` + same indent structure). We parse each block with the shared
 * indented-entry parser and merge the answer prose into the matching question
 * node by marker, so each item reads "Q … / ANSWER: …".
 */

import { elementChildren, collapse, type HTMLElement } from './common.ts';
import { parseIndentedEntries } from './entries.ts';
import type { DafyomiEntry } from '../schema.ts';

export function parseReview(content: HTMLElement): DafyomiEntry[] {
  const questions = new Map<string, DafyomiEntry[]>();
  const answers = new Map<string, DafyomiEntry[]>();
  const order: string[] = [];

  for (const el of elementChildren(content)) {
    const cls = el.getAttribute('class') ?? '';
    if (/\bquestion\b/.test(cls)) {
      const num = numOf(el, '.qlabel');
      if (!num) continue;
      questions.set(num, parseIndentedEntries(el).a);
      if (!order.includes(num)) order.push(num);
    } else if (/\banswer\b/.test(cls)) {
      const num = numOf(el, '.alabel');
      if (!num) continue;
      answers.set(num, parseIndentedEntries(el).a);
    }
  }

  const out: DafyomiEntry[] = [];
  for (const num of order) {
    const qItems = questions.get(num) ?? [];
    const aItems = answers.get(num);
    if (aItems) mergeAnswers(qItems, aItems);
    out.push({ marker: `${num})`, level: 0, body: {}, children: qItems });
  }
  return out;
}

function numOf(el: HTMLElement, sel: string): string | null {
  const t = collapse(el.querySelector(sel)?.text ?? '');
  const m = t.match(/(\d+)/);
  return m ? m[1] : null;
}

function normMarker(m?: string): string {
  return (m ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function mergeAnswers(qNodes: DafyomiEntry[], aNodes: DafyomiEntry[]): void {
  const aByMarker = new Map<string, DafyomiEntry>();
  for (const a of aNodes) aByMarker.set(normMarker(a.marker), a);
  for (const q of qNodes) {
    const a = aByMarker.get(normMarker(q.marker));
    if (!a) continue;
    if (a.body.en) q.body.en = q.body.en ? `${q.body.en}\nANSWER: ${a.body.en}` : `ANSWER: ${a.body.en}`;
    if (q.children?.length && a.children?.length) mergeAnswers(q.children, a.children);
    else if (a.children?.length) q.children = a.children;
  }
}
