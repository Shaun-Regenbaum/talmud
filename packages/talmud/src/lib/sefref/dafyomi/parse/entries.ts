/**
 * @fileoverview Generic indented-entry tree parser.
 *
 * insights, halacha, review, points and yerushalmi all share the same DOM
 * idiom: a `div.subject` heading starts a top entry, and `div.indent1..3` /
 * `div.reg1..2` elements (each with a `span.nm` marker and optional `span.cl`
 * label) nest beneath it. Hebrew source text is interleaved as
 * `div.ptshebtext` / `div.subjectheb` and attaches to the entry it precedes.
 * A `div.bbbline` ("76b----76b") splits the daf into amudim.
 */

import type { DafyomiEntry, DafyomiPointsEntry } from '../schema.ts';
import {
  bodyText,
  elementChildren,
  extractRefs,
  type HTMLElement,
  isAmudBreak,
  labelOf,
  levelOfClass,
  markerOf,
  text,
  txt,
} from './common.ts';

export interface SplitEntries {
  a: DafyomiEntry[];
  b?: DafyomiEntry[];
  /** True if a "76b----76b" separator was seen (content spans both amudim). */
  split: boolean;
}

export interface EntryParseOpts {
  /** Parse `span.cl` labels into a points-style speaker tag. */
  speaker?: boolean;
}

function parseSpeaker(label: string): DafyomiPointsEntry['speaker'] {
  const inner = label
    .replace(/^\(/, '')
    .replace(/\)?:?\s*$/, '')
    .trim();
  const dash = inner.split(/\s+-\s+/);
  if (dash.length >= 2) {
    return { roleEn: dash[0].trim(), rabbiEn: dash.slice(1).join(' - ').trim(), raw: label };
  }
  return { roleEn: inner, raw: label };
}

export function parseIndentedEntries(
  content: HTMLElement,
  opts: EntryParseOpts = {},
): SplitEntries {
  const topA: DafyomiEntry[] = [];
  const topB: DafyomiEntry[] = [];
  let amud: 'a' | 'b' = 'a';
  let split = false;
  let curTop: DafyomiEntry | null = null;
  const stack: DafyomiEntry[] = [];
  let pendingHe: string | null = null;

  const pushTop = (e: DafyomiEntry) => {
    (amud === 'a' ? topA : topB).push(e);
  };
  const deepest = (): DafyomiEntry | null => stack[stack.length - 1] ?? curTop;

  for (const el of elementChildren(content)) {
    if (isAmudBreak(el)) {
      amud = 'b';
      split = true;
      continue;
    }

    const cls = el.getAttribute('class') ?? '';
    if (el.classList.contains('ptshebtext') || el.classList.contains('subjectheb')) {
      const t = text(el);
      if (t) pendingHe = pendingHe ? `${pendingHe} ${t}` : t;
      continue;
    }

    const level = levelOfClass(cls);
    if (level == null) continue;
    const isHeading = /\bsubject\b/.test(cls);
    const marker = markerOf(el);
    const label = labelOf(el);

    if (isHeading) {
      curTop = {
        marker,
        level: 0,
        title: txt(bodyText(el, marker), pendingHe ?? undefined),
        body: {},
        children: [],
      };
      pendingHe = null;
      pushTop(curTop);
      stack.length = 0;
      stack[0] = curTop;
      continue;
    }

    if (!marker) {
      // Continuation paragraph: fold into the deepest open entry.
      const tgt = deepest();
      const body = bodyText(el, undefined, label);
      const refs = extractRefs(el);
      if (tgt) {
        if (body) tgt.body.en = tgt.body.en ? `${tgt.body.en}\n${body}` : body;
        if (pendingHe) tgt.body.he = tgt.body.he ? `${tgt.body.he} ${pendingHe}` : pendingHe;
        if (refs.length) tgt.refs = [...(tgt.refs ?? []), ...refs];
      } else if (body || pendingHe) {
        curTop = { level: 0, label, body: txt(body, pendingHe ?? undefined), children: [] };
        if (refs.length) curTop.refs = refs;
        pushTop(curTop);
        stack.length = 0;
        stack[0] = curTop;
      }
      pendingHe = null;
      continue;
    }

    // Marked entry.
    const entry: DafyomiEntry = {
      marker,
      level,
      label,
      body: txt(bodyText(el, marker, label), pendingHe ?? undefined),
    };
    const refs = extractRefs(el);
    if (refs.length) entry.refs = refs;
    if (opts.speaker && label) (entry as DafyomiPointsEntry).speaker = parseSpeaker(label);
    pendingHe = null;

    if (level === 0) {
      // Standalone top-level marked entry (e.g. a glossary def).
      curTop = entry;
      curTop.children = curTop.children ?? [];
      pushTop(curTop);
      stack.length = 0;
      stack[0] = curTop;
      continue;
    }

    const parent = stack[level - 1] ?? curTop;
    if (parent) {
      parent.children = parent.children ?? [];
      parent.children.push(entry);
    } else {
      // No parent yet: promote to top.
      pushTop(entry);
    }
    stack[level] = entry;
    stack.length = level + 1;
  }

  return split ? { a: topA, b: topB, split } : { a: topA, split };
}
