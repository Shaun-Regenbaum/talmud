/**
 * sectionExits — bucket a daf's links onto its argument SECTIONS for rendering
 * as per-node EXIT MARKERS on the argument map. This is the section-grained
 * projection of the link graph the reader needs: "what connections leave THIS
 * section, and what kind are they?".
 *
 * The section is a DISPLAY cluster, not the link's identity — each link keeps
 * its real source coord (a specific segment = a statement location); this just
 * groups by which section's range that segment falls in. So when finer
 * (statement-grained) anchors land, the same links simply re-bucket. Only marker
 * families are kept: 'flow' is drawn as an in-graph arrow, 'continuity' is a
 * daf-level caption, and 'gloss' keeps its bespoke commentary-highlight path —
 * none of those are exit markers.
 *
 * Pure: classifies via the shared `family()` so the reader and (eventually) the
 * #spine view agree on one selector.
 */

import type { AnchorCoord } from '@corpus/core/context/coord';
import { family, type LinkFamily } from '@corpus/core/context/linkSelect';
import type { DafLink } from './dafLinks.ts';

/** A connection leaving a section, ready to render as an exit-marker chip: the
 *  target coord (for LinkRef), its display family (colour/grouping), and the
 *  relation / via / note for tooltips. */
export interface SectionExit {
  family: LinkFamily;
  relation: string;
  via: string;
  target: AnchorCoord;
  note?: string;
}

/** The families that render as per-section exit markers. */
const MARKER_FAMILIES: ReadonlySet<LinkFamily> = new Set<LinkFamily>([
  'parallel', // mesorat ha-shas, Yerushalmi
  'citation', // a cite to another daf (Revach)
  'scripture', // a pasuk
  'codification', // a halachic code
]);

/**
 * Bucket marker-family links onto sections: a link hangs off the section whose
 * start segment is the greatest not exceeding the link's source segment (robust
 * to section-array order; the same rule the #spine view uses). Each target
 * becomes its own chip. Returns one array per `sectionStarts` entry, aligned by
 * index; daf-level-sourced links (an unplaced cite) fall to the first section.
 */
export function sectionExits(
  sectionStarts: readonly number[],
  links: readonly DafLink[],
): SectionExit[][] {
  const out: SectionExit[][] = sectionStarts.map(() => []);
  if (out.length === 0) return out;
  for (const l of links) {
    const fam = family(l);
    if (!MARKER_FAMILIES.has(fam)) continue;
    let idx = 0;
    let best = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < sectionStarts.length; i++) {
      if (sectionStarts[i] <= l.source.seg && sectionStarts[i] >= best) {
        best = sectionStarts[i];
        idx = i;
      }
    }
    for (const target of l.targets) {
      out[idx].push({ family: fam, relation: l.relation, via: l.via, target, note: l.note });
    }
  }
  return out;
}
