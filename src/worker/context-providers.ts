/**
 * @fileoverview The unified context aggregator: one place that assembles ALL
 * external context for a daf into the shared ContextItem pool.
 *
 * Each "provider" wraps an existing cached source fetcher and maps its bundle
 * into anchored ContextItems:
 *   - dafyomi.co.il study content (8 types)        -> fromDafyomi
 *   - Sefaria Rashi / Tosafot piece TEXT           -> fromCommentaryPieces (segment)
 *   - Sefaria Rishonim (Rashba/Ritva/…)            -> fromRishonim (whole-daf)
 *   - Shulchan Aruch / halachic refs               -> fromHalachaRefs (whole-daf)
 *   - anchored Mishnayot                           -> fromMishna (segment-range)
 *   - Sefaria topic tags                           -> fromTopics (whole-daf)
 *
 * The Tosfos-DH matcher promotes dafyomi Tosfos items to segments using the
 * Sefaria tosafot pieceKeys. The result is the single pool the alignment
 * workbench renders AND that enrichments can draw from (via
 * `contextForAnchor` / `formatContextForPrompt` in src/lib/context/select).
 */

import {
  getDafyomiContentCached,
  getSefariaPageCached,
  getSefariaSegmentsCached,
  getRishonimCached,
  getHalachaRefsCached,
  getMishnaBundleCached,
  getDafTopicsCached,
} from './source-cache';
import { fromDafyomi } from '../lib/context/fromDafyomi';
import {
  fromCommentaryPieces, fromRishonim, fromHalachaRefs, fromMishna, fromTopics,
} from '../lib/context/fromSefaria';
import { matchTosfos } from '../lib/context/anchor/tosfos';
import { matchBackgroundTerms } from '../lib/context/anchor/bg-term';
import { matchRevach, type SectionForMatch } from '../lib/context/anchor/revach';
import { applyMatches } from '../lib/context/match';
import type { ContextItem } from '../lib/context/types';

export interface ContextEnv {
  CACHE?: KVNamespace;
  ASSETS: Fetcher;
  /** Set to "0" to disable on-demand live dafyomi.co.il fetching. */
  DAFYOMI_LIVE?: string;
}

/**
 * Build the full anchored context pool for a daf. Every source is fetched
 * through its existing KV-cached wrapper, so this is cheap once warm and
 * resilient — a source that fails contributes nothing rather than throwing.
 */
export interface CollectContextOpts {
  /** Incoming request origin, for the dev-mode ASSETS fallback. */
  assetOrigin?: string;
  /** This amud's argument sections (English title/summary + seg range). When
   *  provided, Revach entries are conservatively placed onto the section each
   *  describes; omit to skip Revach placement (e.g. the workbench). */
  sections?: SectionForMatch[];
}

export async function collectContext(
  env: ContextEnv,
  tractate: string,
  page: string,
  opts: CollectContextOpts = {},
): Promise<ContextItem[]> {
  const cache = env.CACHE;
  const allowLive = env.DAFYOMI_LIVE !== '0';
  const [dafyomi, sefariaPage, segments, rishonim, halacha, mishna, topics] = await Promise.all([
    getDafyomiContentCached(cache, env.ASSETS, tractate, page, { assetOrigin: opts.assetOrigin, allowLive }).catch(() => null),
    getSefariaPageCached(cache, tractate, page).catch(() => null),
    getSefariaSegmentsCached(cache, tractate, page).catch(() => null),
    getRishonimCached(cache, tractate, page).catch(() => []),
    getHalachaRefsCached(cache, tractate, page).catch(() => ({})),
    getMishnaBundleCached(cache, tractate, page).catch(() => []),
    getDafTopicsCached(cache, tractate, page).catch(() => []),
  ]);

  const items: ContextItem[] = [];
  if (mishna) items.push(...fromMishna(mishna));
  if (sefariaPage) {
    items.push(...fromCommentaryPieces('rashi', sefariaPage.rashi));
    items.push(...fromCommentaryPieces('tosafot', sefariaPage.tosafot));
  }
  if (rishonim) items.push(...fromRishonim(rishonim));
  if (halacha) items.push(...fromHalachaRefs(halacha));
  if (topics) items.push(...fromTopics(topics));
  if (dafyomi) {
    const dy = fromDafyomi(dafyomi);
    // Promote dafyomi Tosfos pieces to segments via Sefaria's tosafot pieceKeys.
    matchTosfos(dy, sefariaPage?.tosafot);
    // Place Background glossary/girsa terms onto the segment(s) that quote them.
    matchBackgroundTerms(dy, segments?.he);
    // Place whole-daf Revach summaries onto the argument section each describes
    // (conservative; unmatched entries are left whole-daf). LLM-free.
    if (opts.sections?.length) applyMatches(dy, matchRevach(dy, opts.sections));
    items.push(...dy);
  }
  return items;
}
