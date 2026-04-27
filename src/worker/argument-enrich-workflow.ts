/**
 * Cloudflare Workflow: batch-enrich argument analyses across a tractate.
 *
 * Each step processes ONE daf: hits POST /api/enrich/:t/:p?strategy=... for
 * each requested strategy. The endpoint requires a cached argument skeleton
 * (analyze-skel:v2:*); the workflow auto-discovers the daf list by listing
 * KV keys with that prefix. Steps are durable — partial runs resume from
 * the last completed daf. AI calls route through the AI Gateway, so re-runs
 * benefit from prompt caching.
 *
 * Trigger: POST /api/admin/enrich-argument-batch/{tractate}
 *          body: { dafim?, strategies?, refresh? }
 * Status:  GET  /api/admin/enrich-argument-batch/status/{instanceId}
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';

export type ArgumentStrategy =
  | 'baseline' | 'per-section' | 'hybrid' | 'rich-rabbi'
  | 'references' | 'parallels' | 'difficulty';

export interface ArgumentEnrichParams {
  tractate: string;
  dafim?: string[];
  strategies?: ArgumentStrategy[];
  refresh?: boolean;
  baseUrl?: string;
}

interface Env {
  CACHE?: KVNamespace;
}

const ALL_STRATEGIES: readonly ArgumentStrategy[] = [
  'baseline', 'per-section', 'hybrid', 'rich-rabbi',
  'references', 'parallels', 'difficulty',
];
const DEFAULT_BASE_URL = 'https://talmud.shaunregenbaum.com';

export class ArgumentEnrichWorkflow extends WorkflowEntrypoint<Env, ArgumentEnrichParams> {
  override async run(event: WorkflowEvent<ArgumentEnrichParams>, step: WorkflowStep) {
    const {
      tractate,
      dafim: dafimParam,
      strategies: stratParam,
      refresh = false,
      baseUrl = DEFAULT_BASE_URL,
    } = event.payload;
    const strategies = stratParam && stratParam.length ? stratParam : [...ALL_STRATEGIES];

    const dafim = await step.do('list-dafim', { retries: { limit: 3, delay: '10 seconds' } }, async () => {
      if (dafimParam && dafimParam.length > 0) return dafimParam;
      if (!this.env.CACHE) throw new Error('KV binding unavailable');
      const prefix = `analyze-skel:v2:${tractate}:`;
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
      out.sort((a, b) => amudKey(a) - amudKey(b));
      return out;
    });

    const counts = { ok: 0, cached: 0, failed: 0 };

    for (const daf of dafim) {
      await step.do(
        `enrich-${tractate}-${daf}`,
        { retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
        async () => {
          for (const strategy of strategies) {
            const url = `${baseUrl}/api/enrich/${encodeURIComponent(tractate)}/${encodeURIComponent(daf)}?strategy=${strategy}${refresh ? '&refresh=1' : ''}`;
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
        },
      ).catch((err) => {
        counts.failed++;
        // eslint-disable-next-line no-console
        console.warn(`[argument-enrich-workflow] ${tractate}/${daf} failed:`, String(err).slice(0, 300));
      });
    }

    return { tractate, dafim_processed: dafim.length, strategies, counts };
  }
}

function amudKey(amud: string): number {
  const m = amud.match(/^(\d+)([ab])$/);
  if (!m) return 99999;
  const n = parseInt(m[1], 10);
  return n * 2 + (m[2] === 'a' ? -1 : 0);
}
