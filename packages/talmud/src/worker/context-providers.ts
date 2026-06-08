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
import { matchYerushalmiToSegments } from '../lib/context/anchor/yerushalmi';
import { matchRevach, type SectionForMatch } from '../lib/context/anchor/revach';
import { applyMatches } from '@corpus/core/context/match';
import type { ContextItem } from '@corpus/core/context/types';
import type { ContextSource } from '../lib/context/sources';
import type { CacheTrack } from './source-cache';

export interface ContextEnv {
  CACHE?: KVNamespace;
  ASSETS: Fetcher;
  /** Set to "0" to disable on-demand live dafyomi.co.il fetching. */
  DAFYOMI_LIVE?: string;
}

/** Per-fetcher collection timing for the alignment workbench's "collect"
 *  waterfall. `sources` is which `ContextSource`s the fetch produces (empty for
 *  inputs used only by matchers, e.g. the Sefaria segment text). `cache` is
 *  reported only by fetchers that thread a `CacheTrack` (else 'unknown'). */
export interface SourceTiming {
  fetcher: string;
  sources: ContextSource[];
  ms: number;
  cache: 'hit' | 'miss' | 'mixed' | 'unknown';
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
  /** Out-param: when provided, each fetcher's wall-clock + cache state is pushed
   *  here (for the alignment "collect" waterfall). Leaves the return unchanged,
   *  so enrichment callers are unaffected. */
  timing?: SourceTiming[];
}

export async function collectContext(
  env: ContextEnv,
  tractate: string,
  page: string,
  opts: CollectContextOpts = {},
): Promise<ContextItem[]> {
  const cache = env.CACHE;
  const allowLive = env.DAFYOMI_LIVE !== '0';
  const timing = opts.timing;
  // Time each fetch and (where the fetcher threads a CacheTrack) record hit/miss.
  // Failures fall back to `undefined` — every `from*` mapper is undefined-safe.
  const rec = async <T>(fetcher: string, sources: ContextSource[], run: (t: CacheTrack) => Promise<T>): Promise<T | undefined> => {
    const t0 = Date.now();
    const states: ('hit' | 'miss')[] = [];
    let v: T | undefined;
    try { v = await run({ onCache: (s) => states.push(s) }); } catch { v = undefined; }
    timing?.push({
      fetcher, sources, ms: Date.now() - t0,
      cache: states.length === 0 ? 'unknown'
        : states.every((s) => s === 'hit') ? 'hit'
        : states.every((s) => s === 'miss') ? 'miss' : 'mixed',
    });
    return v;
  };
  const [dafyomi, sefariaPage, segments, rishonim, halacha, mishna, topics] = await Promise.all([
    rec('dafyomi', ['dafyomi:insights', 'dafyomi:background', 'dafyomi:halacha', 'dafyomi:tosfos', 'dafyomi:review', 'dafyomi:points', 'dafyomi:hebcharts', 'dafyomi:yerushalmi', 'dafyomi:revach'],
      (track) => getDafyomiContentCached(cache, env.ASSETS, tractate, page, { assetOrigin: opts.assetOrigin, allowLive, track })),
    rec('sefaria-page', ['sefaria-rashi', 'sefaria-tosafot'], (track) => getSefariaPageCached(cache, tractate, page, track)),
    rec('sefaria-segments', [], (track) => getSefariaSegmentsCached(cache, tractate, page, track)),
    rec('rishonim', ['sefaria-rishonim'], (track) => getRishonimCached(cache, tractate, page, track)),
    rec('halacha-refs', ['sefaria-halacha'], (track) => getHalachaRefsCached(cache, tractate, page, track)),
    rec('mishna', ['sefaria-mishnah'], (track) => getMishnaBundleCached(cache, tractate, page, track)),
    rec('topics', ['sefaria-topic'], (track) => getDafTopicsCached(cache, tractate, page, track)),
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
    // Place dafyomi "Yerushalmi to Match" items onto the Bavli segment(s) they
    // share a verbatim phrase with (the shared Mishnah/baraita layer). Divergent
    // Yerushalmi gemara shares no long phrase and stays unplaced (left for AI).
    matchYerushalmiToSegments(dy, segments?.he);
    // Place whole-daf Revach summaries onto the argument section each describes
    // (conservative; unmatched entries are left whole-daf). LLM-free.
    if (opts.sections?.length) applyMatches(dy, matchRevach(dy, opts.sections));
    items.push(...dy);
  }
  return items;
}
