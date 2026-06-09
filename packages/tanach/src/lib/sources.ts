/** Shared verse-source model (used by the scroll reader and Mikraot Gedolot). */

export type SourceKind = 'rishonim' | 'gemara' | 'midrash';

export interface SourceVerse {
  verse: number;
  rishonim: number;
  rich: boolean;
  gemara: number;
  midrash: number;
}

/** A verse gets a gemara icon at >=2 Talmud citations, a midrash icon at >=5
 *  (a verse can have dozens; the icon flags the synthesis-worthy ones). */
export const GEMARA_MIN = 2;
export const MIDRASH_MIN = 5;

/** Which gutter icons a verse gets, in display order (rishonim, gemara, midrash). */
export function verseKinds(v: SourceVerse): SourceKind[] {
  const k: SourceKind[] = [];
  if (v.rich) k.push('rishonim');
  if (v.gemara >= GEMARA_MIN) k.push('gemara');
  if (v.midrash >= MIDRASH_MIN) k.push('midrash');
  return k;
}

export const KIND_GLYPH: Record<SourceKind, string> = { rishonim: 'ר', gemara: 'ג', midrash: 'מ' };
