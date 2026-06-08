/**
 * Self-tracked LLM usage ledger (KV). Every producer call appends an entry and
 * bumps the running totals, so /api/usage can show spend broken down by
 * producer without depending on the AI Gateway's analytics. One KV key holds a
 * compact summary + the most recent calls.
 */

export interface UsageEntry {
  ts: number;
  ref: string;
  producer: string;
  model: string;
  in: number;
  out: number;
  cost: number | null;
}

export interface UsageSummary {
  calls: number;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  byProducer: Record<string, { calls: number; costUsd: number }>;
  recent: UsageEntry[];
}

const KEY = 'usage:v1';
const RECENT_CAP = 100;

function empty(): UsageSummary {
  return { calls: 0, inTokens: 0, outTokens: 0, costUsd: 0, byProducer: {}, recent: [] };
}

export async function readUsage(cache: KVNamespace): Promise<UsageSummary> {
  const raw = await cache.get(KEY);
  if (raw) {
    try {
      return { ...empty(), ...(JSON.parse(raw) as UsageSummary) };
    } catch {
      /* fall through */
    }
  }
  return empty();
}

export async function recordUsage(cache: KVNamespace, e: UsageEntry): Promise<void> {
  const s = await readUsage(cache);
  s.calls += 1;
  s.inTokens += e.in;
  s.outTokens += e.out;
  s.costUsd += e.cost ?? 0;
  const p = (s.byProducer[e.producer] ??= { calls: 0, costUsd: 0 });
  p.calls += 1;
  p.costUsd += e.cost ?? 0;
  s.recent.unshift(e);
  s.recent = s.recent.slice(0, RECENT_CAP);
  await cache.put(KEY, JSON.stringify(s));
}
