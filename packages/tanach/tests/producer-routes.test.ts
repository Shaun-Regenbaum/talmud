/**
 * The rewired producer routes, end to end through the core runProducer:
 *
 *  1. CACHE COMPATIBILITY — a seeded LEGACY-shape entry (the raw response
 *     payload the old routes stored, NOT a StoredArtifact envelope) keeps
 *     serving through the new route byte-for-byte, with runLLM mocked to
 *     throw and the network stubbed to throw: zero regeneration cost.
 *  2. FRESH RUNS — an empty cache produces the legacy response shape, sends
 *     the legacy prompts byte-for-byte, and writes a StoredArtifact envelope
 *     (with provenance + cost) that then serves subsequent requests.
 *  3. translate stays on its bespoke raw-string+TTL plumbing, untouched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@corpus/core/llm/llm', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@corpus/core/llm/llm')>();
  return {
    ...mod,
    runLLM: vi.fn(async () => {
      throw new Error('runLLM must not be called');
    }),
  };
});

import { runLLM } from '@corpus/core/llm/llm';
import { app } from '../src/worker/index';

const runLLMMock = vi.mocked(runLLM);

function mockKV(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get: async (k: string) => map.get(k) ?? null,
    put: async (k: string, v: string) => {
      map.set(k, v);
    },
    delete: async (k: string) => {
      map.delete(k);
    },
  };
}

function makeExec() {
  const tasks: Promise<unknown>[] = [];
  return {
    tasks,
    waitUntil: (p: Promise<unknown>) => {
      tasks.push(p);
    },
    passThroughOnException: () => {},
  };
}

function envOf(kv: ReturnType<typeof mockKV>) {
  return { CACHE: kv, ASSETS: { fetch: async () => new Response('') } } as never;
}

async function getJson(path: string, kv: ReturnType<typeof mockKV>) {
  const exec = makeExec();
  const res = await app.request(path, {}, envOf(kv), exec as never);
  const body = await res.json();
  await Promise.all(exec.tasks);
  return { status: res.status, body };
}

const llmResult = (content: string) => ({
  content,
  reasoning_content: '',
  finish_reason: 'stop',
  usage: { prompt_tokens: 100, completion_tokens: 20 },
  prompt_chars: 500,
  elapsed_ms: 10,
  model: 'openrouter/deepseek/deepseek-chat-v3-0324' as const,
  transport: 'openrouter-gateway' as const,
  attempts: 1,
});

/** Sefaria /api/texts stub for "Genesis 1" (2 verses). */
const sefariaChapter = () =>
  new Response(
    JSON.stringify({
      ref: 'Genesis 1',
      heRef: '',
      he: ['בְּרֵאשִׁית בָּרָא', 'וְהָאָרֶץ הָיְתָה'],
      text: ['In the beginning God created', 'And the earth was unformed'],
    }),
    { headers: { 'content-type': 'application/json' } },
  );

beforeEach(() => {
  runLLMMock.mockReset();
  runLLMMock.mockImplementation(async () => {
    throw new Error('runLLM must not be called');
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network must not be hit');
    }),
  );
});

describe('legacy-shape cache entries keep serving (no LLM, no network, no rewrite)', () => {
  it('events — raw {book,chapter,ref,sections} payload', async () => {
    const payload = {
      book: 'Genesis',
      chapter: 1,
      ref: 'Genesis 1',
      sections: [{ verse: 1, en: 'Day One', he: 'יום ראשון' }],
    };
    const kv = mockKV({ 'events:v2:Genesis:1': JSON.stringify(payload) });
    const { status, body } = await getJson('/api/events/Genesis/1', kv);
    expect(status).toBe(200);
    expect(body).toEqual(payload);
    expect(runLLMMock).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    // Served, not migrated: the stored bytes are untouched.
    expect(kv.map.get('events:v2:Genesis:1')).toBe(JSON.stringify(payload));
  });

  it('note — raw {book,chapter,start,end,en,he} payload', async () => {
    const payload = { book: 'Genesis', chapter: 1, start: 3, end: 5, en: 'A note.', he: 'הערה.' };
    const kv = mockKV({ 'note:v1:Genesis:1:3-5': JSON.stringify(payload) });
    const { status, body } = await getJson('/api/note/Genesis/1/3?end=5&label=x', kv);
    expect(status).toBe(200);
    expect(body).toEqual(payload);
    expect(runLLMMock).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('synthesis — raw {book,chapter,verse,en,he} payload', async () => {
    const payload = { book: 'Genesis', chapter: 1, verse: 1, en: 'Overview.', he: 'סקירה.' };
    const kv = mockKV({ 'synthesis:v1:Genesis:1:1': JSON.stringify(payload) });
    const { status, body } = await getJson('/api/synthesis/Genesis/1/1', kv);
    expect(status).toBe(200);
    expect(body).toEqual(payload);
    expect(runLLMMock).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('midrash-synthesis — raw payload under the midrash-synth:v1 key', async () => {
    const payload = { book: 'Exodus', chapter: 3, verse: 2, en: 'Themes.', he: 'נושאים.' };
    const kv = mockKV({ 'midrash-synth:v1:Exodus:3:2': JSON.stringify(payload) });
    const { status, body } = await getJson('/api/midrash-synthesis/Exodus/3/2', kv);
    expect(status).toBe(200);
    expect(body).toEqual(payload);
    expect(runLLMMock).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('translate — untouched bespoke plumbing (raw string, cached flag)', async () => {
    const kv = mockKV({ 'translate:v1:שלום': 'peace' });
    const { status, body } = await getJson(`/api/translate?q=${encodeURIComponent('שלום')}`, kv);
    expect(status).toBe(200);
    expect(body).toEqual({ q: 'שלום', translation: 'peace', cached: true });
    expect(runLLMMock).not.toHaveBeenCalled();
  });
});

describe('fresh runs — legacy response shape + legacy prompts + envelope writes', () => {
  it('events: normalizes output, responds in the legacy shape, stores an envelope', async () => {
    const kv = mockKV();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sefariaChapter()),
    );
    runLLMMock.mockImplementation(async () =>
      llmResult(
        JSON.stringify({
          sections: [
            { verse: 1, en: '  Day One  ', he: 'יום ראשון' },
            { verse: 99, en: 'Out of range', he: '' }, // filtered: > maxVerse
          ],
        }),
      ),
    );

    const { status, body } = await getJson('/api/events/Genesis/1', kv);
    expect(status).toBe(200);
    expect(body).toEqual({
      book: 'Genesis',
      chapter: 1,
      ref: 'Genesis 1',
      sections: [{ verse: 1, en: 'Day One', he: 'יום ראשון' }],
    });

    // The prompt the producer sent is byte-equal to the legacy hand-built one.
    const call = runLLMMock.mock.calls[0][1];
    expect(call.messages[1].content).toBe(
      'Chapter: Genesis 1 (2 verses)\n\n1. In the beginning God created\n2. And the earth was unformed',
    );
    expect(call.max_tokens).toBe(900);
    expect(call.temperature).toBe(0.2);
    expect(call.tag).toBe('tanach:events');

    // The cache now holds a StoredArtifact envelope with provenance + cost.
    const stored = JSON.parse(kv.map.get('events:v2:Genesis:1') ?? 'null');
    expect(typeof stored.content).toBe('string');
    expect(stored.model).toBe('openrouter/deepseek/deepseek-chat-v3-0324');
    expect(stored.parsed).toEqual({ sections: [{ verse: 1, en: 'Day One', he: 'יום ראשון' }] });
    expect(stored.provenance.authority).toBe('ai');
    expect(stored.provenance.producerId).toBe('events');
    expect(stored.cost.tokensIn).toBe(100);

    // The usage ledger got the legacy-shaped entry.
    const usage = JSON.parse(kv.map.get('usage:v1') ?? 'null');
    expect(usage.byProducer.events.calls).toBe(1);
    expect(usage.recent[0].ref).toBe('Genesis 1');

    // And the envelope SERVES the next request with the LLM dead again.
    runLLMMock.mockImplementation(async () => {
      throw new Error('runLLM must not be called');
    });
    const again = await getJson('/api/events/Genesis/1', kv);
    expect(again.body).toEqual(body);
  });

  it('note: legacy prompt + response shape, envelope carries recipe_hash', async () => {
    const kv = mockKV();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sefariaChapter()),
    );
    runLLMMock.mockImplementation(async () =>
      llmResult(JSON.stringify({ en: ' A plain note. ', he: ' הערה פשוטה. ' })),
    );

    const { status, body } = await getJson('/api/note/Genesis/1/1?end=2&label=Creation', kv);
    expect(status).toBe(200);
    expect(body).toEqual({
      book: 'Genesis',
      chapter: 1,
      start: 1,
      end: 2,
      en: 'A plain note.',
      he: 'הערה פשוטה.',
    });

    const call = runLLMMock.mock.calls[0][1];
    expect(call.messages[1].content).toBe(
      'Passage: Genesis 1:1-2 — "Creation"\n\n1. In the beginning God created\n2. And the earth was unformed',
    );
    expect(call.tag).toBe('tanach:note');

    const stored = JSON.parse(kv.map.get('note:v1:Genesis:1:1-2') ?? 'null');
    expect(typeof stored.recipe_hash).toBe('string'); // enrichments stamp it
    expect(stored.provenance.producerId).toBe('note');
    expect(stored.parsed).toEqual({ en: ' A plain note. ', he: ' הערה פשוטה. ' });
  });

  it('synthesis: reuses the commentary:v1 cache, 404s below two commentators', async () => {
    const commentaries = (n: number) => ({
      commentaries: Array.from({ length: n }, (_, i) => ({
        key: `c${i}`,
        en: `Commentator ${i}`,
        heName: '',
        he: [`פירוש ${i}`],
        enText: [],
      })),
    });

    // Not enough commentary — the legacy 404, before any LLM call.
    const thin = mockKV({ 'commentary:v1:Genesis:1:1': JSON.stringify(commentaries(1)) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sefariaChapter()),
    );
    const miss = await getJson('/api/synthesis/Genesis/1/1', thin);
    expect(miss.status).toBe(404);
    expect(miss.body).toEqual({ error: 'Not enough commentary to synthesize' });
    expect(runLLMMock).not.toHaveBeenCalled();

    // Two commentators — fresh run, legacy shape, envelope written.
    const kv = mockKV({ 'commentary:v1:Genesis:1:1': JSON.stringify(commentaries(2)) });
    runLLMMock.mockImplementation(async () =>
      llmResult(JSON.stringify({ en: 'They differ.', he: 'הם חלוקים.' })),
    );
    const { status, body } = await getJson('/api/synthesis/Genesis/1/1', kv);
    expect(status).toBe(200);
    expect(body).toEqual({
      book: 'Genesis',
      chapter: 1,
      verse: 1,
      en: 'They differ.',
      he: 'הם חלוקים.',
    });
    const call = runLLMMock.mock.calls[0][1];
    expect(call.messages[1].content).toContain('Commentators:\nCommentator 0: פירוש 0');
    const stored = JSON.parse(kv.map.get('synthesis:v1:Genesis:1:1') ?? 'null');
    expect(stored.provenance.producerId).toBe('synthesis');
  });

  it('midrash-synthesis: reuses the midrash:v1 source cache, writes midrash-synth:v1', async () => {
    const kv = mockKV({
      'midrash:v1:Exodus:3:2': JSON.stringify({
        passages: [
          { ref: 'M1', he: 'מדרש אחד', en: '' },
          { ref: 'M2', he: '', en: 'A second midrash' },
        ],
      }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sefariaChapter()),
    );
    runLLMMock.mockImplementation(async () =>
      llmResult(JSON.stringify({ en: 'The themes.', he: 'הנושאים.' })),
    );
    const { status, body } = await getJson('/api/midrash-synthesis/Exodus/3/2', kv);
    expect(status).toBe(200);
    expect(body).toEqual({
      book: 'Exodus',
      chapter: 3,
      verse: 2,
      en: 'The themes.',
      he: 'הנושאים.',
    });
    const call = runLLMMock.mock.calls[0][1];
    expect(call.messages[1].content).toContain('Midrashim:\nמדרש אחד\n\nA second midrash');
    expect(call.tag).toBe('tanach:midrash-synthesis');
    const stored = JSON.parse(kv.map.get('midrash-synth:v1:Exodus:3:2') ?? 'null');
    expect(stored.provenance.producerId).toBe('midrash-synthesis');
    expect(typeof stored.recipe_hash).toBe('string');
  });

  it('a dead upstream maps to the legacy 502 body', async () => {
    const kv = mockKV();
    // global fetch stub throws (the beforeEach default) → Sefaria fetch fails.
    const { status, body } = await getJson('/api/events/Genesis/1', kv);
    expect(status).toBe(502);
    expect((body as { error: string }).error).toMatch(/^Sefaria fetch failed: /);
  });
});
