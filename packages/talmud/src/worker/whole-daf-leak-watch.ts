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
 * enrichment's current-version keys and alert (once per day per severity —
 * a live-leak alert may escalate past an earlier same-day residue email)
 * if ANY key carries a non-canonical instance id.
 * A leaked key can only exist if some path ran without the collapse — catching
 * it within minutes of the first leaked write instead of at the next invoice.
 *
 * Age matters: three times now (07-16: 41 keys, 08-05: 1 key) the alert fired
 * on RESIDUE — pre-fix leaked keys that survived a cleanup sweep — and, with
 * enrichment entries never expiring, one immortal straggler emails daily
 * forever. So offenders are aged via their envelope's provenance.createdAt:
 * ones older than RESIDUE_MIN_AGE_DAYS are auto-evicted (a non-canonical key
 * is unreachable by construction — every read path derives the canonical
 * instance id — so deleting it only silences the alert), while young ones are
 * the live-leak signal and are kept in place as evidence, re-alerting daily.
 *
 * Cost: one bounded KV list per producer per tick (~6 lists / 5 min), zero
 * reads of values — except when offenders exist: then one bounded read (and
 * possibly delete) per offender. Pure classification helpers exported for
 * tests.
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

/** A leaked key at least this old is residue (a pre-fix straggler a cleanup
 *  missed), not a live leak, and is safe to auto-evict. A LIVE leak announces
 *  itself with keys written today; a week of margin keeps a slow-drip leak
 *  alerting rather than being quietly swallowed. */
export const RESIDUE_MIN_AGE_DAYS = 7;

export interface OffenderVerdict {
  key: string;
  /** gone: vanished between list and read (already deleted). human: authored
   *  artifact, never touched. residue: old (or pre-provenance) — auto-evict.
   *  fresh: young — the live-leak signal, kept in place. error: the value
   *  read THREW (caller-constructed, not from classifyOffender) — unknown age,
   *  so never evicted and never counted as healed; the listing proved the key
   *  exists, so it must still alert rather than pass as gone. */
  verdict: 'gone' | 'human' | 'residue' | 'fresh' | 'error';
  createdAt: string | null;
  ageDays: number | null;
  evicted?: boolean;
}

/** Age one offender via its envelope's provenance. Pure: the raw KV value (or
 *  null) comes in, the verdict comes out; the caller does the I/O. A value
 *  with no parseable createdAt predates provenance stamping (#361) and is
 *  ancient by definition → residue. */
export function classifyOffender(key: string, raw: string | null, nowMs: number): OffenderVerdict {
  if (raw === null) return { key, verdict: 'gone', createdAt: null, ageDays: null };
  let createdAt: string | null = null;
  let authority: string | null = null;
  try {
    const v = JSON.parse(raw) as { provenance?: { createdAt?: string; authority?: string } };
    createdAt = v?.provenance?.createdAt ?? null;
    authority = v?.provenance?.authority ?? null;
  } catch {
    // unparseable value: pre-envelope garbage, ages as "no createdAt"
  }
  const ts = createdAt === null ? Number.NaN : Date.parse(createdAt);
  const ageDays = Number.isNaN(ts) ? null : (nowMs - ts) / 86_400_000;
  if (authority === 'human') return { key, verdict: 'human', createdAt, ageDays };
  const residue = ageDays === null || ageDays > RESIDUE_MIN_AGE_DAYS;
  return { key, verdict: residue ? 'residue' : 'fresh', createdAt, ageDays };
}

const LIST_PAGE_LIMIT = 1000;
const MAX_PAGES_PER_TARGET = 3;
/** Bound on per-offender reads/deletes per tick; anything beyond waits for the
 *  next tick (evictions shrink the list, so the window slides forward). */
const MAX_INSPECT_PER_TICK = 50;

function offenderLine(c: OffenderVerdict): string {
  const age =
    c.ageDays === null
      ? 'age unknown (pre-provenance)'
      : `written ${c.createdAt} (${Math.floor(c.ageDays)}d ago)`;
  const tag =
    c.verdict === 'fresh'
      ? 'FRESH — live leak?'
      : c.verdict === 'human'
        ? 'human-authored, kept'
        : c.verdict === 'error'
          ? 'value read FAILED — not aged, retries next tick'
          : c.evicted
            ? 'residue, auto-evicted'
            : 'residue, evict FAILED';
  return `  ${c.key} — ${age} [${tag}]`;
}

/**
 * Audit every whole-daf enrichment's key family; age + auto-evict residue;
 * email once per day if any non-canonical key existed. Best-effort and
 * self-contained: failures are logged, never thrown into the cron.
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

    // Eviction runs every tick (not just on alert days) so residue drains even
    // after the day's email has gone out.
    const offenders: OffenderVerdict[] = [];
    for (const key of found.slice(0, MAX_INSPECT_PER_TICK)) {
      let c: OffenderVerdict;
      try {
        c = classifyOffender(key, await cache.get(key), nowMs);
      } catch {
        // The listing proved this key exists, so a failed value read must NOT
        // pass as gone-and-silent — surface it un-aged and un-evicted.
        c = { key, verdict: 'error', createdAt: null, ageDays: null };
      }
      if (c.verdict === 'gone') continue;
      if (c.verdict === 'residue') {
        try {
          await cache.delete(key);
          c.evicted = true;
        } catch {}
      }
      offenders.push(c);
    }
    const uninspected = Math.max(0, found.length - MAX_INSPECT_PER_TICK);
    if (offenders.length === 0 && uninspected === 0) return; // all already gone

    const fresh = offenders.filter((c) => c.verdict === 'fresh');
    const evictFailed = offenders.filter((c) => c.verdict === 'residue' && !c.evicted).length;
    const humans = offenders.filter((c) => c.verdict === 'human').length;
    const errors = offenders.filter((c) => c.verdict === 'error').length;
    // Only claim self-healed when every offender was actually seen, aged as
    // residue, AND evicted; anything unknown or still standing (fresh keys,
    // uninspected overflow, read errors, failed evicts, human keys) keeps the
    // loud subject.
    const selfHealed =
      uninspected === 0 && offenders.every((c) => c.verdict === 'residue' && c.evicted);
    const severity = selfHealed ? 'residue' : 'leak';
    console.error(
      '[leak-watch] non-canonical whole-daf keys:',
      found.length,
      `fresh=${fresh.length} severity=${severity}`,
      found.slice(0, 5),
    );
    const dayBucket = Math.floor(nowMs / 86_400_000);
    const dedupeKey = `health-alert:wholedaf-leak:${dayBucket}`;
    // Once per day per severity tier: a residue email must not suppress a
    // live-leak alert that starts later the same day, so leak escalates over
    // residue. (Any other stored value — e.g. legacy '1' — counts as leak.)
    // Fail OPEN on this read: a transient KV flake must degrade toward a
    // possible duplicate email, never toward silence. Concurrent-invocation
    // races on the read-send-write sequence are accepted — one fast
    // invocation per 5-min cron tick, and KV has no CAS to close them anyway.
    let alreadySent: string | null = null;
    try {
      alreadySent = await cache.get(dedupeKey);
    } catch {}
    if (alreadySent && !(alreadySent === 'residue' && severity === 'leak')) return;
    if (env.EMAIL) {
      const notHealedParts = [
        evictFailed > 0 && `${evictFailed} evict(s) failed (retry next tick)`,
        errors > 0 && `${errors} value read(s) failed (reclassified next tick)`,
        humans > 0 &&
          `${humans} human-authored key(s) kept — needs manual review, no human write path ` +
            `should produce a non-canonical whole-daf key`,
        uninspected > 0 && `${uninspected} past this tick's inspection cap (processed next ticks)`,
      ].filter(Boolean);
      const verdictLine =
        fresh.length > 0
          ? `${fresh.length} key(s) are FRESH (younger than ${RESIDUE_MIN_AGE_DAYS}d) — a code ` +
            `path is LEAKING NOW. Check isWholeDafEnrichment call sites (it must read BOTH def ` +
            `shapes: target_mark and mark) and any new run path that derives a cache key from ` +
            `raw mark_input. Diagnostic: one identical leaked iid across dafim = a constant ` +
            `(null/undefined) input; many distinct iids = per-caller fan-out. Fresh keys are ` +
            `kept in place as evidence; residue was auto-evicted.`
          : selfHealed
            ? `All were RESIDUE (older than ${RESIDUE_MIN_AGE_DAYS}d — pre-fix stragglers a ` +
              `cleanup missed) and were auto-evicted. Leaked keys are unreachable (all read ` +
              `paths use the canonical instance id), so no action is needed and this alert ` +
              `self-silences.`
            : `No FRESH keys, but not fully healed: ${notHealedParts.join('; ')}. If FRESH ` +
              `keys appear tomorrow, treat it as a live leak.`;
      await env.EMAIL.send({
        from: 'health@shaunregenbaum.com',
        to: 'shaunregenbaum@gmail.com',
        subject: selfHealed
          ? `[talmud] whole-daf cache-key residue: ${found.length} key(s) auto-evicted`
          : `[talmud] whole-daf cache-key LEAK: ${found.length} non-canonical key(s), ${fresh.length} fresh`,
        text:
          `${found.length} whole-daf enrichment cache key(s) exist under a NON-canonical ` +
          `instance id — the #426/#534 leak class: a whole-daf piece cached per calling ` +
          `section/rabbi instead of the {fields:{}} collapse.\n\n${verdictLine}\n\n` +
          `Offenders:\n${offenders.slice(0, 8).map(offenderLine).join('\n')}\n` +
          `${offenders.length > 8 ? `  …plus ${offenders.length - 8} more inspected\n` : ''}` +
          `${uninspected > 0 ? `  …plus ${uninspected} not yet inspected (next ticks)\n` : ''}\n` +
          `Spend: https://talmud.shaunregenbaum.com/usage\n`,
      });
    }
    await cache.put(dedupeKey, severity, { expirationTtl: 86_400 });
  } catch (err) {
    console.error('[leak-watch] failed:', err);
  }
}
