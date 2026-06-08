/**
 * dafSpine — the "tractate as one addressable spine" primitive (framework
 * step 6). A page (amud) is a WINDOW onto the continuous Gemara spine; this
 * assembles the local neighborhood of that window: the adjacent pages and
 * whether the sugya flows across each boundary, with the forward continuity
 * expressed as a Link so a continuous-spine view can stitch pages from
 * `link.targets` instead of re-deriving the next daf.
 *
 * Pure: the worker gathers the inputs (page arithmetic + the two cached
 * cross-daf bridge verdicts) and calls this — the same lib/worker split as
 * `dafLinks`. The first CONSUMER is `GET /api/spine/:tractate/:page`, which
 * replaces the client overview's bespoke pair of `/api/bridge` fetches.
 */

import { continuationLink, type Link } from './link.ts';
import type { DafRef } from '@corpus/core/context/coord';

/** The local neighborhood of a daf on its tractate spine. */
export interface DafSpine {
  tractate: string;
  page: string;
  /** The adjacent windows on the spine (null at a tractate edge). */
  prev: string | null;
  next: string | null;
  /** The previous daf's discussion continues INTO this one. */
  fromPrev: boolean;
  /** This daf's discussion continues into the next. */
  toNext: boolean;
  /** The forward continuity edge (this daf → next) as a Link, or null when the
   *  sugya closes here / there is no next daf. */
  link: Link | null;
}

export interface DafSpineInputs {
  /** Adjacent page slugs from the spine's amud arithmetic. */
  prev: string | null;
  next: string | null;
  /** Cross-daf bridge verdicts: does prev→this carry, does this→next carry. */
  fromPrev: boolean;
  toNext: boolean;
}

export function dafSpine(daf: DafRef, input: DafSpineInputs): DafSpine {
  // Forward continuity is a Link only when the sugya actually carries into a
  // real next page. continuationLink keeps the 'continues' edge in the shared
  // vocabulary (same as /api/bridge + /api/links surface it).
  const link =
    input.toNext && input.next ? continuationLink({ tractate: daf.tractate, page: input.next }) : null;
  return {
    tractate: daf.tractate,
    page: daf.page,
    prev: input.prev,
    next: input.next,
    fromPrev: input.fromPrev,
    toNext: input.toNext,
    link,
  };
}
