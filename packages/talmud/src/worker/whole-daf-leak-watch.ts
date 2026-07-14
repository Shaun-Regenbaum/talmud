/**
 * Whole-daf cache-key leak sentinel.
 *
 * A whole-daf enrichment (daf-background.concepts, argument-overview.flow, …)
 * must cache under EXACTLY ONE instance id per daf+lang: instanceIdOf({fields:{}}).
 * Twice now a code path has run these with a caller-derived instance instead —
 * #426 (the dependency walk inheriting the parent's markInput) and #534 (the
 * same collapse silently disabled by the KV-flat def shape) — and each time the
 * result was the identical piece regenerated and re-paid ~20x per daf, visible
 * only as a mysterious spend spike. The failure mode is a SILENT one: nothing
 * errors, the reader renders fine, money burns.
 *
 * So the health cron audits the invariant itself: list each whole-daf
 * enrichment's current-version keys and alert (once per day, same dedupe
 * pattern as the OOM watch) if ANY key carries a non-canonical instance id.
 * A leaked key can only exist if some path ran without the collapse — catching
 * it within minutes of the first leaked write instead of at the next invoice.
 *
 * Cost: one bounded KV list per producer per tick (~6 lists / 5 min), zero
 * reads of values. Pure classification helpers exported for tests.
 */

import { instanceIdOf } from '@corpus/core/cache/keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from './code-marks';
import { wholeDafEnrichmentIds } from './workflow-warm';

interface LeakWatchEnv {
  CACHE?: KVNamespace;
  EMAIL?: {
    send(msg: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
  };
}

/** The whole-daf enrichment ids to audit, with their CURRENT cache_version
 *  (superseded-version keys linger until TTL and are harmless — only the
 *  current version can accumulate new leaked writes). */
export function leakWatchTargets(): { id: string; version: string }[] {
  const marksLite = CODE_MARKS.map((m) => ({
    id: m.id,
    anchor: (m as { anchor?: string }).anchor,
  }));
  const enrichLite = CODE_ENRICHMENTS.map((e) => ({
    id: e.id,
    scope: e.scope,
    target_mark: e.target_mark,
    demand_driven: (e as { demand_driven?: boolean }).demand_driven,
  }));
  const wholeDaf = new Set(wholeDafEnrichmentIds(marksLite, enrichLite));
  return CODE_ENRICHMENTS.filter((e) => wholeDaf.has(e.id)).map((e) => ({
    id: e.id,
    version: String((e as { cache_version?: string | number }).cache_version ?? ''),
  }));
}

/** Classify one producer's listed key names: return the ones whose instance id
 *  is NOT the canonical whole-daf id. Key shape (frozen by cache/keys.ts):
 *  `enrich:{id}:{version}:[he:]{instanceId}:{tractate}:{page}` — the lang
 *  segment follows the version when present. */
export function leakedKeys(names: string[], prefix: string, canonicalIid: string): string[] {
  const out: string[] = [];
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const rest = name.slice(prefix.length).split(':');
    const iid = rest[0] === 'he' ? rest[1] : rest[0];
    if (iid !== canonicalIid) out.push(name);
  }
  return out;
}

const LIST_PAGE_LIMIT = 1000;
const MAX_PAGES_PER_TARGET = 3;

/**
 * Audit every whole-daf enrichment's key family; email once per day if any
 * non-canonical key exists. Best-effort and self-contained: failures are
 * logged, never thrown into the cron.
 */
export async function checkWholeDafLeakAndAlert(env: LeakWatchEnv, nowMs: number): Promise<void> {
  const cache = env.CACHE;
  if (!cache) return;
  try {
    const canonicalIid = await instanceIdOf({ fields: {} });
    const found: string[] = [];
    for (const t of leakWatchTargets()) {
      const prefix = `enrich:${t.id}:${t.version}:`;
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES_PER_TARGET; page++) {
        const res = await cache.list({ prefix, limit: LIST_PAGE_LIMIT, cursor });
        found.push(
          ...leakedKeys(
            res.keys.map((k) => k.name),
            prefix,
            canonicalIid,
          ),
        );
        if (res.list_complete) break;
        cursor = res.cursor;
      }
    }
    if (found.length === 0) return;

    console.error('[leak-watch] non-canonical whole-daf keys:', found.length, found.slice(0, 5));
    const dayBucket = Math.floor(nowMs / 86_400_000);
    const dedupeKey = `health-alert:wholedaf-leak:${dayBucket}`;
    if (await cache.get(dedupeKey)) return; // already alerted today
    if (env.EMAIL) {
      await env.EMAIL.send({
        from: 'health@shaunregenbaum.com',
        to: 'shaunregenbaum@gmail.com',
        subject: `[talmud] whole-daf cache-key LEAK: ${found.length} non-canonical key(s)`,
        text:
          `${found.length} whole-daf enrichment cache key(s) exist under a NON-canonical ` +
          `instance id — some code path is running a whole-daf enrichment with a caller-derived ` +
          `instance instead of the {fields:{}} collapse. This is the #426/#534 leak class: the ` +
          `identical piece regenerates (and bills) once per calling section/rabbi, ~20x per daf.\n\n` +
          `First offenders:\n${found
            .slice(0, 8)
            .map((k) => `  ${k}`)
            .join('\n')}\n\n` +
          `Check isWholeDafEnrichment call sites (it must read BOTH def shapes: target_mark and ` +
          `mark) and any new run path that derives a cache key from raw mark_input.\n` +
          `Spend: https://talmud.shaunregenbaum.com/usage\n`,
      });
    }
    await cache.put(dedupeKey, '1', { expirationTtl: 86_400 });
  } catch (err) {
    console.error('[leak-watch] failed:', err);
  }
}
