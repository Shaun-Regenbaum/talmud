import { describe, expect, it } from 'vitest';
import { keyForRabbiVoiceGraph, slugDaf } from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';
import type { VoiceGraphBlob } from '../src/worker/voice-graph';
import { runVoiceGraphBackfill, VOICE_GRAPH_STATE_KEY } from '../src/worker/warm-cron';

const VOICES_VER = CODE_ENRICHMENTS.find((e) => e.id === 'argument.voices')?.cache_version ?? '';
const RABBI_VER = CODE_MARKS.find((m) => m.id === 'rabbi')?.cache_version ?? '';

/** Minimal in-memory KV with its OWN page size — the walker follows
 *  list_complete/cursor, so a tiny fake page size exercises multi-tick
 *  cursor resume without needing hundreds of keys. */
function fakeKV(pageSize: number) {
  const store = new Map<string, string>();
  const kv = {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async list(opts: { prefix?: string; cursor?: string; limit?: number }) {
      const all = [...store.keys()].filter((k) => !opts.prefix || k.startsWith(opts.prefix)).sort();
      const start = opts.cursor ? Number(opts.cursor) : 0;
      const page = all.slice(start, start + pageSize);
      const complete = start + pageSize >= all.length;
      return {
        keys: page.map((name) => ({ name })),
        list_complete: complete,
        ...(complete ? {} : { cursor: String(start + pageSize) }),
      };
    },
  };
  return { kv: kv as unknown as KVNamespace, store };
}

function voicesKey(section: string, tractate: string, page: string): string {
  return `enrich:argument.voices:${VOICES_VER}:${section}:${slugDaf(tractate, page)}`;
}

function seed(store: Map<string, string>, tractate: string, page: string, section: string) {
  store.set(
    voicesKey(section, tractate, page),
    JSON.stringify({
      parsed: {
        voices: [
          { name: 'Rava', nameHe: 'רבא', role: 'originator', side: 'A', stance: '' },
          { name: 'Abaye', nameHe: 'אביי', role: 'objector', side: 'B', stance: '' },
        ],
        edges: [{ from: 'Abaye', to: 'Rava', kind: 'opposes' }],
      },
    }),
  );
  store.set(
    `mark:rabbi:${RABBI_VER}:${slugDaf(tractate, page)}`,
    JSON.stringify({
      parsed: {
        instances: [
          { fields: { name: 'Rava', nameHe: 'רבא', generation: 'amora-bavel-4' } },
          { fields: { name: 'Abaye', nameHe: 'אביי', generation: 'amora-bavel-4' } },
        ],
      },
    }),
  );
}

describe('runVoiceGraphBackfill', () => {
  it('is a no-op unless gated on (or forced)', async () => {
    const { kv, store } = fakeKV(10);
    seed(store, 'Berakhot', '2a', 'sec1');
    expect(await runVoiceGraphBackfill({ CACHE: kv })).toBeNull();
    expect(store.has(keyForRabbiVoiceGraph())).toBe(false);
  });

  it('walks the prefix across ticks, skips :he:, finalizes and latches', async () => {
    const { kv, store } = fakeKV(2); // tiny pages => several ticks
    seed(store, 'Berakhot', '2a', 'sec1');
    seed(store, 'Berakhot', '2a', 'sec2');
    seed(store, 'Shabbat', '21b', 'sec1');
    // Hebrew twin must be skipped, not double-counted.
    store.set(
      `enrich:argument.voices:${VOICES_VER}:he:sec1:${slugDaf('Berakhot', '2a')}`,
      store.get(voicesKey('sec1', 'Berakhot', '2a')) ?? '',
    );

    const env = { CACHE: kv, VOICE_GRAPH_WARM_SHAS: '1' };
    let done = false;
    for (let i = 0; i < 10 && !done; i++) {
      const r = await runVoiceGraphBackfill(env);
      expect(r).not.toBeNull();
      done = r?.done ?? false;
    }
    expect(done).toBe(true);

    const blob = JSON.parse(store.get(keyForRabbiVoiceGraph()) ?? 'null') as VoiceGraphBlob;
    expect(blob).not.toBeNull();
    expect(blob.dapim).toBe(2);
    expect(blob.sections).toBe(3); // 3 EN sections; the :he: twin skipped
    const edge = Object.values(blob.edges).find((e) => e.kind === 'opposes');
    expect(edge?.weight).toBe(3);
    expect(edge?.dafs.sort()).toEqual(['Berakhot 2a', 'Shabbat 21b']);
    expect(blob.nodes.rava?.sections).toBe(3);
    // state latched done, staging dropped from it
    const st = JSON.parse(store.get(VOICE_GRAPH_STATE_KEY) ?? '{}') as {
      done?: boolean;
      staging?: unknown;
    };
    expect(st.done).toBe(true);
    expect(st.staging).toBeUndefined();

    // Latched: another tick is a no-op that reports done.
    const again = await runVoiceGraphBackfill(env);
    expect(again).toEqual({ done: true, scanned: expect.any(Number) });
  });

  it('resets the walk when input producer versions change', async () => {
    const { kv, store } = fakeKV(10);
    seed(store, 'Berakhot', '2a', 'sec1');
    // A stale in-flight state written by an older producer version.
    store.set(
      VOICE_GRAPH_STATE_KEY,
      JSON.stringify({
        inputs: { voices: 'OLD', rabbi: 'OLD' },
        staging: { version: 1, startedAt: 1, scannedKeys: 999 },
        cursor: '1',
      }),
    );
    const r = await runVoiceGraphBackfill({ CACHE: kv, VOICE_GRAPH_WARM_SHAS: '1' });
    // Fresh walk: the poisoned staging was discarded, the single page completed.
    expect(r?.done).toBe(true);
    const blob = JSON.parse(store.get(keyForRabbiVoiceGraph()) ?? 'null') as VoiceGraphBlob;
    expect(blob.scannedKeys).toBe(1);
  });

  it('force runs even when ungated (the admin /step path)', async () => {
    const { kv, store } = fakeKV(10);
    seed(store, 'Berakhot', '2a', 'sec1');
    const r = await runVoiceGraphBackfill({ CACHE: kv }, { force: true });
    expect(r?.done).toBe(true);
    expect(store.has(keyForRabbiVoiceGraph())).toBe(true);
  });
});
