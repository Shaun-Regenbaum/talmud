/**
 * Cloudflare Workflow: batch-enrich halacha topics across a tractate.
 *
 * Each step processes ONE daf: calls the three enrichment strategies
 * (modern-authorities, rishonim-condensed, sa-commentary-walk) against the
 * worker's own HTTP endpoint, which writes results into KV. Steps are
 * durable — if the worker restarts or hits a transient upstream error,
 * Cloudflare resumes from the last completed step.
 *
 * Trigger: POST /api/admin/enrich-halacha-batch/{tractate}
 * Status:  GET  /api/admin/enrich-halacha-batch/status/{instanceId}
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';

export interface HalachaEnrichParams {
  tractate: string;
  /** Optional subset — defaults to every daf in the tractate. */
  dafim?: string[];
  /** Which strategies to run. Defaults to all three. */
  strategies?: Array<'modern-authorities' | 'rishonim-condensed' | 'sa-commentary-walk'>;
  /** Force re-run even if enrichment is already cached. */
  refresh?: boolean;
  /** Self-fetch base URL (defaults to production). */
  baseUrl?: string;
}

interface Env {
  CACHE?: KVNamespace;
}

const ALL_STRATEGIES = ['modern-authorities', 'rishonim-condensed', 'sa-commentary-walk'] as const;
const DEFAULT_BASE_URL = 'https://talmud.shaunregenbaum.com';

export class HalachaEnrichWorkflow extends WorkflowEntrypoint<Env, HalachaEnrichParams> {
  override async run(event: WorkflowEvent<HalachaEnrichParams>, step: WorkflowStep) {
    const {
      tractate,
      dafim: dafimParam,
      strategies: stratParam,
      refresh = false,
      baseUrl = DEFAULT_BASE_URL,
    } = event.payload;
    const strategies = stratParam && stratParam.length ? stratParam : [...ALL_STRATEGIES];

    // 1. Determine which dafim to process. If caller provided an explicit
    //    list, use it; otherwise list KV keys to find every daf with a
    //    cached /api/halacha output for this tractate.
    const dafim = await step.do('list-dafim', { retries: { limit: 3, delay: '10 seconds' } }, async () => {
      if (dafimParam && dafimParam.length > 0) return dafimParam;
      if (!this.env.CACHE) throw new Error('KV binding unavailable');
      const prefix = `halacha:v5:${tractate}:`;
      const out: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.env.CACHE.list({ prefix, cursor, limit: 1000 });
        for (const k of page.keys) {
          const daf = k.name.slice(prefix.length);
          if (daf) out.push(daf);
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      // Sort in daf order (2a, 2b, 3a, ..., 64a)
      out.sort((a, b) => amudKey(a) - amudKey(b));
      return out;
    });

    const counts = { ok: 0, cached: 0, failed: 0 };

    // 2. Walk dafim one at a time. Each daf is one step — durable, retryable,
    //    and checkpointed so we can pause/resume.
    for (const daf of dafim) {
      await step.do(
        `enrich-${tractate}-${daf}`,
        { retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
        async () => {
          for (const strategy of strategies) {
            const url = `${baseUrl}/api/enrich-halacha/${encodeURIComponent(tractate)}/${encodeURIComponent(daf)}?strategy=${strategy}${refresh ? '&refresh=1' : ''}`;
            const res = await fetch(url, { method: 'POST' });
            if (!res.ok) {
              const body = await res.text();
              throw new Error(`${strategy} ${daf}: HTTP ${res.status} ${body.slice(0, 200)}`);
            }
            const body = await res.json() as { _cached?: boolean; error?: string };
            if (body.error) throw new Error(`${strategy} ${daf}: ${body.error}`);
            if (body._cached) counts.cached++;
            else counts.ok++;
          }
        }
      ).catch((err) => {
        // A step-level failure after exhausting retries should not abort the
        // whole tractate — record it and keep going. Checkpoint progress.
        counts.failed++;
        // eslint-disable-next-line no-console
        console.warn(`[halacha-enrich-workflow] ${tractate}/${daf} failed:`, String(err).slice(0, 300));
      });
    }

    return {
      tractate,
      dafim_processed: dafim.length,
      strategies,
      counts,
    };
  }
}

// Sortable key for daf strings like "2a", "64b". "Na" = 2N-1, "Nb" = 2N —
// matches Sefaria's 1-indexed amud address system.
function amudKey(amud: string): number {
  const m = amud.match(/^(\d+)([ab])$/);
  if (!m) return 99999;
  const n = parseInt(m[1], 10);
  return n * 2 + (m[2] === 'a' ? -1 : 0);
}
