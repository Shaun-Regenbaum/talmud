/**
 * App language state — a single module-level signal so any of the hash-routed
 * pages can read/set it without a shared context provider. Two things hang off
 * it:
 *
 *   1. Enrichment generation language. Every /api/studio/run (and /api/qa/ask)
 *      caller threads lang() into the request body; the worker selects the
 *      Hebrew prompt variant and a `:he`-namespaced cache key (see
 *      src/worker/cache-keys.ts + code-marks.ts *_HE prompts).
 *   2. UI chrome direction + (eventually) the t() string catalog. On 'he' the
 *      document goes dir=rtl; the Vilna daf is already internally RTL so only
 *      the surrounding chrome flips.
 *
 * Switching language clears the client-side enrichment result cache (via the
 * existing `marks-runs-invalidate` event) so cards re-fetch under the new
 * lang's cache key instead of showing the previous language's text.
 */
import { createSignal } from 'solid-js';

export type Lang = 'en' | 'he';

const STORAGE_KEY = 'talmud:lang';

function initialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'he' ? 'he' : 'en';
}

const [lang, setLangSignal] = createSignal<Lang>(initialLang());

export { lang };

/** Reflect the active language onto <html lang dir>. he → rtl. */
function applyToDocument(l: Lang): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = l;
  root.dir = l === 'he' ? 'rtl' : 'ltr';
}

// Apply once at module load so the very first paint has the right dir.
applyToDocument(lang());

export function setLang(next: Lang): void {
  if (next === lang()) return;
  setLangSignal(next);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  applyToDocument(next);
  // Drop cached enrichment runs so cards re-fetch under the new lang's cache
  // key. clearRunResultCache() listens for this event (see enrichmentQueue.ts).
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('marks-runs-invalidate'));
    window.dispatchEvent(new CustomEvent('lang-changed', { detail: next }));
  }
}

export function toggleLang(): void {
  setLang(lang() === 'en' ? 'he' : 'en');
}
