/**
 * @fileoverview Assemble per-content-type parse results into one DafyomiDaf.
 *
 * Pulled out of the scraper so it can be unit-tested. Given the fetched HTML
 * (or null for a 404/missing page) of each content type for a daf, it parses
 * each, files the resulting blocks under the right amud, records source URLs
 * for attribution, and lists content types that are genuinely absent. Nothing
 * is fabricated: a page that 404s or parses to zero blocks lands in `absent`.
 */

import { parseDafyomiContent } from './parse/index.ts';
import type { DafyomiAmudContent, DafyomiContentType, DafyomiDaf } from './schema.ts';

export interface FetchedType {
  type: DafyomiContentType;
  url: string;
  /** Page HTML, or null when the page does not exist / failed to fetch. */
  html: string | null;
}

export interface AssembleResult {
  daf: DafyomiDaf;
  /** Flattened (type, warning) pairs for the scraper run summary. */
  warnings: { type: DafyomiContentType; warning: string }[];
}

export function assembleDaf(
  tractate: string,
  daf: number,
  fetched: FetchedType[],
  fetchedAt: string = new Date().toISOString(),
): AssembleResult {
  const amudim: DafyomiDaf['amudim'] = {};
  const urls: DafyomiDaf['source']['urls'] = {};
  const absent: DafyomiContentType[] = [];
  const warnings: AssembleResult['warnings'] = [];

  for (const f of fetched) {
    if (f.html == null) {
      absent.push(f.type);
      continue;
    }
    const parsed = parseDafyomiContent(f.type, f.html);
    for (const w of parsed.parseWarnings) warnings.push({ type: f.type, warning: w });
    if (parsed.blocks.length === 0) {
      absent.push(f.type);
      continue;
    }

    urls[f.type] = f.url;
    for (const blk of parsed.blocks) {
      const stored: DafyomiAmudContent = {
        ...blk,
        parseWarnings: parsed.parseWarnings.length ? parsed.parseWarnings : undefined,
      };
      const bucket = amudim[blk.amud] ?? {};
      amudim[blk.amud] = bucket;
      bucket[f.type] = stored;
    }
  }

  const dafObj: DafyomiDaf = {
    schemaVersion: 1,
    tractate,
    daf,
    source: { site: 'dafyomi.co.il', publisher: 'Kollel Iyun HaDaf', urls, fetchedAt },
    amudim,
    absent,
  };
  return { daf: dafObj, warnings };
}
