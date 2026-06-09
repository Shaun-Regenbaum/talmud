import { describe, expect, it } from 'vitest';
import { MAX_LINT_ATTEMPTS, noteLintAttempt, readLintFailures } from '../src/worker/lint-failures';

// Minimal in-memory KV stub — get/put/delete are all this module touches.
function fakeKV() {
  const store = new Map<string, string>();
  const kv = {
    store,
    async get(k: string): Promise<string | null> {
      return store.has(k) ? store.get(k)! : null;
    },
    async put(k: string, v: string): Promise<void> {
      store.set(k, v);
    },
    async delete(k: string): Promise<void> {
      store.delete(k);
    },
  };
  return kv as typeof kv & KVNamespace;
}

// waitUntil collector so tests can flush fire-and-forget ring-buffer writes.
function fakeCtx() {
  const tasks: Promise<unknown>[] = [];
  return {
    waitUntil(p: Promise<unknown>) {
      tasks.push(p);
    },
    flush() {
      return Promise.all(tasks);
    },
  };
}

const meta = (
  over: Partial<{
    enrichmentId: string;
    tractate: string;
    page: string;
    lang: 'en' | 'he';
    issues: unknown[];
  }> = {},
) => ({
  enrichmentId: 'halacha.practical',
  tractate: 'Shabbat',
  page: '101b',
  lang: 'en' as const,
  issues: [{ kind: 'bare-transliteration', translit: 'bedieved', hebrew: 'בדיעבד' }],
  ...over,
});

describe('noteLintAttempt — bounded retry then pin', () => {
  it('returns false for the first MAX-1 attempts, true at the cap', async () => {
    const env = { CACHE: fakeKV() };
    const ctx = fakeCtx();
    const key = 'enrich:halacha.practical:4:shabbat:101b';
    const results: boolean[] = [];
    for (let i = 0; i < MAX_LINT_ATTEMPTS; i++) {
      results.push(await noteLintAttempt(env, ctx, key, meta()));
    }
    // [false, false, true] for MAX_LINT_ATTEMPTS === 3
    expect(results.slice(0, MAX_LINT_ATTEMPTS - 1).every((r) => r === false)).toBe(true);
    expect(results[MAX_LINT_ATTEMPTS - 1]).toBe(true);
  });

  it('keeps returning true after the cap (stays pinned)', async () => {
    const env = { CACHE: fakeKV() };
    const ctx = fakeCtx();
    const key = 'k';
    for (let i = 0; i < MAX_LINT_ATTEMPTS; i++) await noteLintAttempt(env, ctx, key, meta());
    expect(await noteLintAttempt(env, ctx, key, meta())).toBe(true);
  });

  it('records the failure exactly once — on the capping attempt, not after', async () => {
    const env = { CACHE: fakeKV() };
    const ctx = fakeCtx();
    const key = 'k';
    // Run one past the cap.
    for (let i = 0; i < MAX_LINT_ATTEMPTS + 1; i++) await noteLintAttempt(env, ctx, key, meta());
    await ctx.flush();
    const { recent, counts } = await readLintFailures(env.CACHE);
    expect(recent).toHaveLength(1);
    expect(counts['halacha.practical']).toBe(1);
  });

  it('summarizes the issues onto the recorded failure', async () => {
    const env = { CACHE: fakeKV() };
    const ctx = fakeCtx();
    for (let i = 0; i < MAX_LINT_ATTEMPTS; i++) {
      await noteLintAttempt(
        env,
        ctx,
        'k',
        meta({
          issues: [
            { kind: 'bare-transliteration', translit: 'bedieved', hebrew: 'בדיעבד' },
            { kind: 'calque', match: 'house of justice', hebrew: 'בית דין' },
          ],
        }),
      );
    }
    await ctx.flush();
    const { recent } = await readLintFailures(env.CACHE);
    expect(recent[0].issues).toContain('bare-transliteration: bedieved');
    expect(recent[0].issues).toContain('calque: house of justice');
    expect(recent[0].attempts).toBe(MAX_LINT_ATTEMPTS);
    expect(recent[0].enrichmentId).toBe('halacha.practical');
  });

  it('tracks distinct cache keys independently', async () => {
    const env = { CACHE: fakeKV() };
    const ctx = fakeCtx();
    // Key A reaches the cap; key B has only one failure.
    for (let i = 0; i < MAX_LINT_ATTEMPTS; i++) await noteLintAttempt(env, ctx, 'A', meta());
    expect(await noteLintAttempt(env, ctx, 'B', meta())).toBe(false);
  });

  it('accumulates per-enrichment counts across different cards', async () => {
    const env = { CACHE: fakeKV() };
    const ctx = fakeCtx();
    for (let i = 0; i < MAX_LINT_ATTEMPTS; i++) await noteLintAttempt(env, ctx, 'cardA', meta());
    for (let i = 0; i < MAX_LINT_ATTEMPTS; i++)
      await noteLintAttempt(
        env,
        ctx,
        'cardB',
        meta({
          enrichmentId: 'pesukim.synthesis',
          issues: [{ kind: 'missing-hebrew-excerpt', book: 'Tehillim', chapter: 119, verse: 62 }],
        }),
      );
    await ctx.flush();
    const { counts, recent } = await readLintFailures(env.CACHE);
    expect(counts['halacha.practical']).toBe(1);
    expect(counts['pesukim.synthesis']).toBe(1);
    expect(recent).toHaveLength(2);
  });
});

describe('readLintFailures — empty when nothing recorded', () => {
  it('returns empty recent + counts', async () => {
    const env = { CACHE: fakeKV() };
    expect(await readLintFailures(env.CACHE)).toEqual({ recent: [], counts: {} });
  });
  it('returns empty when no cache binding', async () => {
    expect(await readLintFailures(undefined)).toEqual({ recent: [], counts: {} });
  });
});
