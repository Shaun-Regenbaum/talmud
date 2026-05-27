/**
 * @fileoverview Background ("Background to the Daf") parser.
 *
 * Two sections delimited by `p.girsasep` separators:
 *  - GIRSA: textual corrections. Entries are `p.def.girsaloc` (a `span.nm`
 *    "[1]" marker + bold location, with `span.def girsalocheb` Hebrew) followed
 *    by `p.def.girsa` body paragraphs.
 *  - GLOSSARY: `p.def` entries each carrying `span.nm` ("1)"), `span.ln`
 *    ("[line 1]"), `span.defheb` (the Hebrew term — the phrase-anchor key),
 *    `span.deftext` (transliteration), then the definition prose. Sub-points
 *    are `p.def.inyan1` with `span.nm` "(a)".
 */

import {
  elementChildren, text, collapse, extractRefs, txt, type HTMLElement,
} from './common.ts';
import type { DafyomiEntry } from '../schema.ts';

export interface BackgroundResult {
  girsa: DafyomiEntry[];
  glossary: DafyomiEntry[];
  /** Per-amud line counts from the "[76a - 33 lines; 76b - 51 lines]" header. */
  lineCounts?: string;
}

type Section = 'girsa' | 'glossary';

export function parseBackground(content: HTMLElement): BackgroundResult {
  const girsa: DafyomiEntry[] = [];
  const glossary: DafyomiEntry[] = [];
  let lineCounts: string | undefined;
  let section: Section = 'girsa';
  let lastGirsa: DafyomiEntry | null = null;

  for (const el of elementChildren(content)) {
    const cls = el.getAttribute('class') ?? '';

    if (/\blinecount\b/.test(cls)) { lineCounts = text(el).replace(/^\[|\]$/g, ''); continue; }
    if (/\bgirsasep\b/.test(cls)) {
      // Any separator after the first opening one moves us toward glossary.
      if (/GLOSSARY/i.test(text(el)) || (girsa.length > 0 && /\bbase\b/.test(cls))) {
        section = 'glossary';
      }
      continue;
    }
    if (/\bgirsatext\b/.test(cls)) continue; // section preamble

    if (section === 'girsa') {
      if (/\bgirsaloc\b/.test(cls)) {
        const term = collapse((el.querySelector('.girsalocheb') ?? el.querySelector('.defheb'))?.text ?? '');
        const entry: DafyomiEntry = {
          marker: collapse(el.querySelector('.nm')?.text ?? '') || undefined,
          level: 0,
          title: txt(stripMarker(text(el)), term),
          body: {},
          children: [],
        };
        const refs = extractRefs(el);
        if (refs.length) entry.refs = refs;
        girsa.push(entry);
        lastGirsa = entry;
      } else if (/\bgirsa\b/.test(cls)) {
        const body = text(el);
        if (lastGirsa && body) lastGirsa.body.en = lastGirsa.body.en ? `${lastGirsa.body.en}\n${body}` : body;
      }
      continue;
    }

    // glossary
    if (!/\bdef\b/.test(cls)) continue;
    const isSub = /\binyan1\b/.test(cls);
    const nm = collapse(el.querySelector('.nm')?.text ?? '') || undefined;
    const termHe = collapse(el.querySelector('.defheb')?.text ?? '');
    const translit = collapse(el.querySelector('.deftext')?.text ?? '');
    const line = collapse(el.querySelector('.ln')?.text ?? '');
    const body = glossaryBody(el);
    const refs = extractRefs(el);

    if (isSub && glossary.length > 0) {
      const parent = glossary[glossary.length - 1];
      parent.children = parent.children ?? [];
      const sub: DafyomiEntry = { marker: nm, level: 1, body: txt(body) };
      if (refs.length) sub.refs = refs;
      parent.children.push(sub);
      continue;
    }

    const entry: DafyomiEntry = {
      marker: nm,
      level: 0,
      label: line || undefined,
      title: txt(translit, termHe),
      body: txt(body),
      children: [],
    };
    if (refs.length) entry.refs = refs;
    glossary.push(entry);
  }

  return { girsa, glossary, lineCounts };
}

function stripMarker(t: string): string {
  return t.replace(/^\[?\d+\]?\)?\s*/, '').trim();
}

/** Glossary body = the definition prose after the term/translit/line spans. */
function glossaryBody(el: HTMLElement): string {
  const full = text(el);
  const translit = collapse(el.querySelector('.deftext')?.text ?? '');
  if (translit) {
    const idx = full.indexOf(translit);
    if (idx >= 0) return full.slice(idx + translit.length).replace(/^[\s-]+/, '').trim();
  }
  return full;
}
