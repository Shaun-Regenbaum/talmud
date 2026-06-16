/**
 * dafLinks — assemble EVERY link on a daf into one list, all expressed through
 * the shared Link vocabulary (src/lib/context/link.ts). The three edge kinds the
 * system produces converge here:
 *   - 'continues' — the tractate-continuity bridge (this daf → the next)
 *   - 'cites'     — a study-aid/context note's external references
 *   - the flow relations (resolves / depends-on / parallels / …) — the
 *                   argument-overview flow graph between this daf's sections
 *
 * Pure: the worker gathers the inputs (bridge verdict, context pool, cached flow
 * edges, section ranges) and calls this. The first real CONSUMER of the link
 * layer — `GET /api/links/:tractate/:page` returns `dafLinks(...)`.
 */

import { type AnchorCoord, coordForSeg, type DafRef, dafCoord } from '@corpus/core/context/coord';
import {
  type CommentaryWorkLike,
  citationLink,
  continuationLink,
  type FlowEdge,
  flowLinks,
  glossLinks,
  type LinkRelation,
} from '@corpus/core/context/link';
import type { ContextItem } from '@corpus/core/context/types';
import type { TalmudParallel, YerushalmiBundle } from '../sefref/sefaria/client.ts';
import { parseCodifierRef, parseVerseRef } from './externalRefs.ts';
import { talmudParallelsToLinks, yerushalmiToLinks } from './parallels.ts';

/** A link on a daf: where it lives (`source`), the `relation`, and what it
 *  points at (`targets`). `via` records which producer it came from, for
 *  display + debugging. ('mesorah' = the Mesorat HaShas parallel-sugya
 *  apparatus — unrelated to the rabbi-transmission `mesorah:` cache namespace;
 *  'yerushalmi' = the cross-corpus Bavli↔Yerushalmi parallel.) */
export interface DafLink {
  via:
    | 'bridge'
    | 'context'
    | 'flow'
    | 'commentary'
    | 'cross-flow'
    | 'mesorah'
    | 'yerushalmi'
    | 'pesuk'
    | 'halacha';
  source: AnchorCoord;
  relation: LinkRelation;
  targets: AnchorCoord[];
  note?: string;
}

/** A scriptural citation on the daf — the verse ref + the segment it sits at.
 *  The structural slice `dafLinks` needs from a `pesukim` mark instance. */
export interface PesukLike {
  verseRef: string;
  startSegIdx?: number;
}

/** A grounded codifier ref on the daf — the Sefaria ref + the segment it
 *  codifies. The structural slice from a `HalachicSnippet`. */
export interface HalachaRefLike {
  ref: string;
  segStart?: number;
}

export interface DafLinkInputs {
  /** The next daf this sugya continues into, or null. From the cross-daf bridge. */
  continuesTo: DafRef | null;
  /** Context items (study-aids) on this daf — each item's `refs` becomes a
   *  'cites' link sourced at where the item sits. */
  items: ContextItem[];
  /** The argument-overview flow graph edges (section index → section index). */
  flowEdges: readonly FlowEdge[];
  /** startSegIdx of each argument section, in flow-index order, so a flow edge's
   *  section index resolves to a coordinate. */
  sectionStartSegs: readonly number[];
  /** Commentary works on this daf — each becomes a 'glosses' link from its own
   *  spine to the daf segments it glosses. Optional/absent contributes nothing. */
  commentaryWorks?: readonly CommentaryWorkLike[];
  /** Talmud↔Talmud parallels (Mesorat HaShas) from Sefaria's apparatus — each
   *  becomes a 'parallels' link from its anchored segment on this daf to a
   *  passage elsewhere in Shas. Optional/absent contributes nothing. */
  talmudParallels?: readonly TalmudParallel[];
  /** Jerusalem Talmud parallels (the `yerushalmi` mark's shared-mishnah bundle)
   *  — each becomes a cross-corpus 'parallels' link to the parallel halacha.
   *  Optional/absent contributes nothing. */
  yerushalmi?: YerushalmiBundle;
  /** Scriptural citations on this daf (the `pesukim` mark) — each verse becomes
   *  a 'cites' link INTO the Tanach spine, sourced at the daf segment that cites
   *  it. Optional/absent contributes nothing. */
  pesukim?: readonly PesukLike[];
  /** Grounded halachic-code refs (Sefaria's codifier apparatus) — each becomes a
   *  'codifies' link INTO the code spine, sourced at the daf segment it
   *  codifies. Optional/absent contributes nothing. */
  halacha?: readonly HalachaRefLike[];
}

export function dafLinks(daf: DafRef, input: DafLinkInputs): DafLink[] {
  const out: DafLink[] = [];

  // 1) Tractate-continuity: the cross-daf bridge.
  const cont = continuationLink(input.continuesTo);
  if (cont)
    out.push({
      via: 'bridge',
      source: dafCoord(daf),
      relation: cont.relation,
      targets: cont.targets,
    });

  // 2) Citations: each context item's external refs, sourced where the item sits
  //    (its first placed segment, else whole-daf).
  for (const it of input.items) {
    const cite = citationLink(it.refs);
    if (!cite) continue;
    const source = it.segs.length ? coordForSeg(daf, it.segs[0]) : dafCoord(daf);
    out.push({
      via: 'context',
      source,
      relation: cite.relation,
      targets: cite.targets,
      note: it.sourceLabel,
    });
  }

  // 3) Argument flow: section→section edges, resolved to coordinates.
  const coordOf = (i: number): AnchorCoord | null =>
    i >= 0 && i < input.sectionStartSegs.length
      ? coordForSeg(daf, input.sectionStartSegs[i])
      : null;
  for (const fl of flowLinks(input.flowEdges, coordOf)) {
    out.push({
      via: 'flow',
      source: fl.source,
      relation: fl.link.relation,
      targets: fl.link.targets,
    });
  }

  // 4) Commentary spines: each work glosses the daf segments it sits over.
  for (const gl of glossLinks(daf, input.commentaryWorks ?? [])) {
    out.push({
      via: 'commentary',
      source: gl.source,
      relation: gl.link.relation,
      targets: gl.link.targets,
      note: gl.source.spine,
    });
  }

  // 5) Talmud parallels: Mesorat HaShas cross-references to parallel sugyot
  //    elsewhere in Shas (deterministic, from Sefaria's apparatus).
  out.push(...talmudParallelsToLinks(daf, input.talmudParallels ?? []));

  // 6) Yerushalmi parallels: the cross-corpus Bavli↔Yerushalmi parallel sugya,
  //    via the shared mishnah (deterministic, from the `yerushalmi` mark).
  out.push(...yerushalmiToLinks(daf, input.yerushalmi ?? []));

  // 7) Pesukim: each verse the gemara cites becomes a 'cites' link INTO the
  //    Tanach spine, sourced at the daf segment that cites it.
  for (const p of input.pesukim ?? []) {
    const target = parseVerseRef(p.verseRef);
    if (!target) continue;
    out.push({
      via: 'pesuk',
      source: typeof p.startSegIdx === 'number' ? coordForSeg(daf, p.startSegIdx) : dafCoord(daf),
      relation: 'cites',
      targets: [target],
      note: p.verseRef,
    });
  }

  // 8) Halacha: each grounded codifier ref becomes a 'codifies' link INTO the
  //    codifier's code spine, sourced at the daf segment it codifies. A
  //    non-codifier ref (the noisy tail of Sefaria's "Halakhah" category) parses
  //    to null and is skipped — precision over recall.
  for (const h of input.halacha ?? []) {
    const target = parseCodifierRef(h.ref);
    if (!target) continue;
    out.push({
      via: 'halacha',
      source: typeof h.segStart === 'number' ? coordForSeg(daf, h.segStart) : dafCoord(daf),
      relation: 'codifies',
      targets: [target],
      note: h.ref,
    });
  }

  return out;
}
