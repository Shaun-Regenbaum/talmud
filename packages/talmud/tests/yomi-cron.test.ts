import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobMessage } from '../src/worker/types';
import type { DafWarmParams } from '../src/worker/workflow-warm';
import { runYomiWarmCron } from '../src/worker/yomi-cron';

// Sefaria's calendar shape for "tomorrow is Berakhot 12".
const CALENDAR_RESPONSE = {
  calendar_items: [
    { title: { en: 'Daf Yomi' }, category: 'Talmud', displayValue: { en: 'Berakhot 12' } },
  ],
};

function collectJobs() {
  const sent: JobMessage[] = [];
  const queue = {
    send: async (job: JobMessage) => {
      sent.push(job);
    },
  } as unknown as Queue<JobMessage>;
  return { sent, queue };
}

function collectWorkflows() {
  const created: DafWarmParams[] = [];
  let n = 0;
  const wf = {
    create: async ({ params }: { params: DafWarmParams }) => {
      created.push(params);
      return { id: `wf-${n++}` };
    },
  } as unknown as Workflow<DafWarmParams>;
  return { created, wf };
}

describe('runYomiWarmCron', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(CALENDAR_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // The primary path: a bound Workflow warms each daf via memory-safe per-step
  // invocations instead of a queue fan-out of mark + deep-warm jobs.
  describe('with the DafWarmWorkflow bound (primary path)', () => {
    it('triggers ONE Workflow per (amud, language) and NO mark/deep-warm queue jobs', async () => {
      const { sent, queue } = collectJobs();
      const { created, wf } = collectWorkflows();
      await runYomiWarmCron({ ENRICHMENT_QUEUE: queue, DAF_WARM_WORKFLOW: wf });

      // 2 amudim x 2 languages = 4 Workflow instances.
      expect(created.length).toBe(4);
      expect(created.map((p) => `${p.page}:${p.lang}`).sort()).toEqual([
        '12a:en',
        '12a:he',
        '12b:en',
        '12b:he',
      ]);
      // The heavy generation no longer goes through the queue.
      expect(sent.filter((j) => j.mark_id).length).toBe(0);
      expect(sent.filter((j) => j.warm_deep).length).toBe(0);
    });

    it('STILL enqueues rabbi.observations (daf-level reverse-index the Workflow does not warm)', async () => {
      const { sent, queue } = collectJobs();
      const { wf } = collectWorkflows();
      await runYomiWarmCron({ ENRICHMENT_QUEUE: queue, DAF_WARM_WORKFLOW: wf });

      const obs = sent.filter((j) => j.enrichment_id === 'rabbi.observations');
      expect(obs.map((j) => j.page).sort()).toEqual(['12a', '12b']);
      expect(obs.every((j) => (j.mark_input as { id?: string })?.id === 'daf')).toBe(true);
    });
  });

  it('deep-warms the prose surface in BOTH languages (en + he parity)', async () => {
    const { sent, queue } = collectJobs();
    await runYomiWarmCron({ ENRICHMENT_QUEUE: queue });

    const deep = sent.filter((j) => j.warm_deep);
    // Two amudim (a + b) x two languages = four deep-warm jobs.
    expect(deep.length).toBe(4);

    const he = deep.filter((j) => j.lang === 'he');
    const en = deep.filter((j) => j.lang !== 'he');
    // Hebrew parity: every amud gets a Hebrew deep-warm, not just English.
    expect(he.map((j) => j.page).sort()).toEqual(['12a', '12b']);
    expect(en.map((j) => j.page).sort()).toEqual(['12a', '12b']);

    // Distinct runIds so the queue never dedupes the he pass against the en one.
    expect(new Set(deep.map((j) => j.runId)).size).toBe(4);
  });

  it('warms the prose-bearing structural marks in Hebrew but not the language-neutral rabbi mark', async () => {
    const { sent, queue } = collectJobs();
    await runYomiWarmCron({ ENRICHMENT_QUEUE: queue });

    const heMarks = new Set(sent.filter((j) => j.mark_id && j.lang === 'he').map((j) => j.mark_id));
    // rabbi has no _he prompt -> language-neutral structure -> warming it under
    // :he would just duplicate the en cache, so it is deliberately skipped.
    expect(heMarks.has('rabbi')).toBe(false);
    for (const m of ['argument', 'halacha', 'aggadata', 'yerushalmi', 'pesukim']) {
      expect(heMarks.has(m)).toBe(true);
    }
  });
});
