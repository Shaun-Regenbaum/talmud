import type { Amud } from './types';

/**
 * Extra classes for a side column that holds diagrams and has a halfway-width
 * end spacer below its narrow strip. CSS never lets a float sit above an
 * earlier float, so a diagram could not sit beside the narrow strip while a
 * separate end spacer stood below it. For these columns the two spacers are
 * drawn as one float with an L-shaped wrap outline (see styles.css). Columns
 * without diagrams keep the two plain spacers.
 */
export function mergedClasses(which: 'inner' | 'outer', amud: Amud, merged: boolean): string {
  if (!merged) return '';
  const amudB = amud === 'b';
  const side = which === 'inner' ? (amudB ? 'right' : 'left') : amudB ? 'left' : 'right';
  return ` daf-merged daf-fl-${side}`;
}
