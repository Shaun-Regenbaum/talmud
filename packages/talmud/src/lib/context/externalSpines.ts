/**
 * externalSpines — the corpus-spine classification shared by the link resolver
 * (linkTarget) and the spine registry (worker/spines.ts), so they agree on what
 * a spine id MEANS.
 *
 * An `AnchorCoord.spine` is overloaded: ABSENT = the Gemara; a work name
 * ('Rashi', 'Tosafot') = a commentary spine OVER the daf; and now a CORPUS spine
 * the daf links INTO — 'tanach' (a pasuk) or a codifier id ('mishneh-torah',
 * 'shulchan-aruch', …) (a halachic code). The first two are handled by
 * linkTarget itself; this module is the single source for the corpus spines.
 *
 * Pure (codifiers.ts is itself pure / client-safe), so it imports cleanly into
 * both the worker and the client bundle.
 */

import { CODIFIERS } from '../halacha/codifiers.ts';

/** The Tanach text spine id (matches the tanach app's spine — see
 *  packages/tanach/src/worker/spines.ts). */
export const TANACH_SPINE = 'tanach';

const CODIFIER_BY_ID = new Map(CODIFIERS.map((c) => [c.id as string, c]));

/** The corpus-spine ids — used by the spine registry to register one SpineDef
 *  per code spine. */
export const CODIFIER_SPINE_IDS: readonly string[] = CODIFIERS.map((c) => c.id);

export type ExternalCorpus = 'tanach' | 'halacha';

/** The external corpus a spine id denotes, or null for the Gemara / a commentary
 *  spine (which linkTarget classifies itself). */
export function corpusOfSpine(spine: string | undefined): ExternalCorpus | null {
  if (!spine) return null;
  if (spine === TANACH_SPINE) return 'tanach';
  if (CODIFIER_BY_ID.has(spine)) return 'halacha';
  return null;
}

/** The short author handle for a codifier spine ('mishneh-torah' → 'Rambam'),
 *  for the marker chip label; undefined when not a codifier spine. */
export function codifierShort(spine: string): string | undefined {
  return CODIFIER_BY_ID.get(spine)?.short;
}
