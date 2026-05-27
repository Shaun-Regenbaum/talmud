/**
 * @fileoverview Map Sefaria commentary links into workbench ContextItems.
 *
 * Each link already carries 0-based segment indices (sentenceIndexStart/End),
 * so commentaries arrive pre-anchored at segment / segment-range granularity —
 * no matcher needed. The body text isn't fetched here (links only); the item
 * links out to Sefaria for the full text.
 */

import type { SefariaLink } from '../sefref/sefaria/links.ts';
import type { ContextItem, AnchorState } from './types.ts';
import { highlightSegsFor } from './types.ts';

const TYPE_LABEL: Record<SefariaLink['commentaryType'], string> = {
  rashi: 'Rashi', tosafot: 'Tosafot', traditional: 'Commentary', tanakh: 'Tanakh', halakhah: 'Halakhah',
};

export function fromSefariaCommentary(links: SefariaLink[]): ContextItem[] {
  return links.map((link, i) => {
    const start = link.sentenceIndexStart;
    const end = link.sentenceIndexEnd;
    const anchor: AnchorState = end != null && end > start
      ? { kind: 'segment-range', startSegIdx: start, endSegIdx: end }
      : { kind: 'segment', segIdx: start };
    return {
      source: 'sefaria-commentary',
      sourceLabel: TYPE_LABEL[link.commentaryType] ?? 'Commentary',
      kind: link.commentaryType,
      key: `sefaria:${i}:${link.ref}`,
      title: { en: link.title.en, he: link.title.he },
      body: undefined,
      url: `https://www.sefaria.org/${encodeURIComponent(link.ref.replace(/ /g, '_'))}`,
      anchor,
      anchorMatched: true,
      highlightSegs: highlightSegsFor(anchor),
    } satisfies ContextItem;
  });
}
