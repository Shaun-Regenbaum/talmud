/**
 * The tanach spine — the one addressable text space this app's artifacts pin
 * to, expressed through the SAME core SpineRegistry the talmud app uses
 * (@corpus/core/model/spine). Levels are book/chapter/verse (the analogue of
 * bavli's tractate/page/seg); a truncated path names the containing division
 * (['Genesis'] = the book, ['Genesis', 1] = the chapter — what the events
 * producer anchors at chapter depth, and synthesis at verse depth).
 *
 * Path validation grounds against the BOOKS registry (src/lib/books.ts), so a
 * misspelled or non-Sefaria book name fails at ref-construction time instead
 * of producing an unreachable cache key.
 */

import { createSpineRegistry } from '@corpus/core/model/spine';
import { isBook } from '../lib/books.ts';

export const tanachSpines = createSpineRegistry([
  {
    id: 'tanach',
    kind: 'text',
    label: 'Tanach',
    levels: ['book', 'chapter', 'verse'],
    normalizePath: (path) => {
      const book = path[0];
      if (typeof book !== 'string' || !isBook(book)) {
        throw new Error(`unknown Tanach book: ${String(book)}`);
      }
      return path;
    },
  },
]);
