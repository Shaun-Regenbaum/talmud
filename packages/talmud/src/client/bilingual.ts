/**
 * Reader side of POST /api/bilingual (the Hebrew-once house rule, see
 * src/lib/bilingual.ts). Paragraphs render immediately as generated; the
 * cleaned text swaps in when the server answers. Requests from one render pass
 * are batched into a single POST, and each paragraph is asked for once per
 * page load. English mode only: Hebrew-mode prose has no English to gloss.
 */
import { createEffect, createSignal, onCleanup } from 'solid-js';
import type { GlossaryEntry } from '../lib/bilingual';
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

/** One fetch per page per load: the names and terms whose Hebrew some
 *  paragraph on the page gives (GET /api/bilingual/glossary). Empty on error. */
const glossaries = new Map<string, Promise<GlossaryEntry[]>>();

function fetchGlossary(tractate: string, page: string): Promise<GlossaryEntry[]> {
  const k = `${tractate}:${page}`;
  let p = glossaries.get(k);
  if (!p) {
    p = fetch(`/api/bilingual/glossary/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}`)
      .then(async (r) => {
        const body = r.ok ? ((await r.json()) as { entries?: unknown; complete?: boolean }) : null;
        const entries = Array.isArray(body?.entries) ? (body.entries as GlossaryEntry[]) : [];
        // A partial list (page still generating, or Jev unavailable) is used
        // now but asked for again on the next open.
        if (body?.complete === false) glossaries.delete(k);
        return entries;
      })
      .catch(() => {
        glossaries.delete(k);
        return [];
      });
    glossaries.set(k, p);
  }
  return p;
}

/** Reactive page glossary for the given page; empty until it arrives. */
export function usePageGlossary(
  page: () => { tractate: string; page: string } | null | undefined,
): () => GlossaryEntry[] {
  const [entries, setEntries] = createSignal<{ k: string; e: GlossaryEntry[] } | null>(null);
  createEffect(() => {
    const p = page();
    if (!p || lang() !== 'en') return;
    const k = `${p.tractate}:${p.page}`;
    let live = true;
    void fetchGlossary(p.tractate, p.page).then((e) => {
      if (live) setEntries({ k, e });
    });
    onCleanup(() => {
      live = false;
    });
  });
  return () => {
    const p = page();
    const got = entries();
    return p && got && got.k === `${p.tractate}:${p.page}` ? got.e : [];
  };
}
