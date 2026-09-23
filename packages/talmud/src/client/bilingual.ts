/**
 * Reader side of POST /api/bilingual (the Hebrew-once house rule, see
 * src/lib/bilingual.ts). Paragraphs render immediately as generated; the
 * cleaned text swaps in when the server answers. Requests from one render pass
 * are batched into a single POST, and each paragraph is asked for once per
 * page load. English mode only: Hebrew-mode prose has no English to gloss.
 */
import { createEffect, createSignal, onCleanup } from 'solid-js';
import { lang } from './i18n';

/** A Hebrew-only parenthesis somewhere in the text — the only thing the
 *  server ever changes, so anything without one skips the round trip. */
const HAS_HE_PAREN = /\([^()A-Za-z0-9]*[\u05D0-\u05EA][^()A-Za-z0-9]*\)/;

const BATCH = 40;
const MAX_CHARS = 4000;
const memo = new Map<string, Promise<string>>();
let queue: { text: string; resolve: (s: string) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

async function post(batch: { text: string; resolve: (s: string) => void }[]): Promise<void> {
  try {
    const res = await fetch('/api/bilingual', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: batch.map((b) => b.text) }),
    });
    const body = res.ok ? ((await res.json()) as { texts?: unknown }) : null;
    const texts = Array.isArray(body?.texts) ? (body.texts as unknown[]) : [];
    batch.forEach((b, i) => {
      const t = texts[i];
      b.resolve(typeof t === 'string' ? t : b.text);
    });
  } catch {
    for (const b of batch) b.resolve(b.text);
  }
}

function flush(): void {
  timer = undefined;
  const all = queue;
  queue = [];
  for (let i = 0; i < all.length; i += BATCH) void post(all.slice(i, i + BATCH));
}

/** The paragraph under the house rule; resolves to the input on any failure. */
export function cleanBilingual(text: string): Promise<string> {
  if (!text || text.length > MAX_CHARS || !HAS_HE_PAREN.test(text)) return Promise.resolve(text);
  const hit = memo.get(text);
  if (hit) return hit;
  const p = new Promise<string>((resolve) => {
    queue.push({ text, resolve });
    if (!timer) timer = setTimeout(flush, 30);
  });
  memo.set(text, p);
  return p;
}

/** Reactive wrapper: the source text until its cleaned version arrives. */
export function useBilingual(text: () => string): () => string {
  const [done, setDone] = createSignal<{ src: string; out: string } | null>(null);
  createEffect(() => {
    const t = text();
    if (lang() !== 'en') return;
    let live = true;
    void cleanBilingual(t).then((out) => {
      if (live) setDone({ src: t, out });
    });
    onCleanup(() => {
      live = false;
    });
  });
  return () => {
    const t = text();
    const d = done();
    return d && d.src === t && lang() === 'en' ? d.out : t;
  };
}
