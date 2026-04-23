/**
 * Lightweight miss-logger for cases we don't catch — unknown rabbi
 * locations, excerpts that fail to match in the tokenized Hebrew, etc.
 * Records are appended to localStorage under `daf-misses` (FIFO capped at
 * 500 entries) and also surfaced to the devtools console with a stable
 * `[daf-miss:<category>]` prefix for live visibility.
 *
 * At the browser console, call `dafMisses()` to inspect, or
 * `dafMisses({ category: 'geography' })` to filter, or
 * `dafMisses.clear()` to wipe.
 */

interface MissRecord {
  ts: number;              // unix ms
  tractate?: string;
  page?: string;
  category: string;        // 'geography' | 'anchor' | 'opinion' | ...
  details: Record<string, unknown>;
}

const STORAGE_KEY = 'daf-misses';
const MAX_ENTRIES = 500;

function load(): MissRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(records: MissRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* localStorage full or disabled — silent drop is fine */
  }
}

// De-dupe identical records within a single session so a misbehaving loop
// doesn't fill up localStorage with the same message.
const seenThisSession = new Set<string>();

async function postToWorker(rec: MissRecord): Promise<void> {
  if (typeof fetch === 'undefined') return;
  try {
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: rec.category,
        ts: rec.ts,
        tractate: rec.tractate,
        page: rec.page,
        details: rec.details,
        url: typeof location !== 'undefined' ? location.href : undefined,
      }),
      keepalive: true,
    });
  } catch {
    /* network failure is fine — we still have the local entry */
  }
}

export function logMiss(
  category: string,
  details: Record<string, unknown>,
  context?: { tractate?: string; page?: string },
): void {
  const sig = `${category}|${JSON.stringify(details)}|${context?.tractate ?? ''}|${context?.page ?? ''}`;
  if (seenThisSession.has(sig)) return;
  seenThisSession.add(sig);

  const rec: MissRecord = {
    ts: Date.now(),
    tractate: context?.tractate,
    page: context?.page,
    category,
    details,
  };

  // eslint-disable-next-line no-console
  console.warn(`[daf-miss:${category}]`, { ...rec, ts: new Date(rec.ts).toISOString() });

  const all = load();
  all.push(rec);
  while (all.length > MAX_ENTRIES) all.shift();
  save(all);

  // Fire-and-forget to the worker so prod errors surface in KV / logs.
  void postToWorker(rec);
}

/**
 * Install global error listeners. Uncaught errors and unhandled promise
 * rejections get logged via logMiss so we can correlate "something broke"
 * reports with specific stack traces from prod.
 */
export function installGlobalErrorLogger(): void {
  if (typeof window === 'undefined') return;
  const seen = new Set<string>();
  const capture = (category: string, details: Record<string, unknown>) => {
    // Dedup identical errors per session to avoid log flooding.
    const k = `${category}|${JSON.stringify(details).slice(0, 200)}`;
    if (seen.has(k)) return;
    seen.add(k);
    logMiss(category, details);
  };
  window.addEventListener('error', (ev) => {
    capture('uncaught-error', {
      message: ev.message,
      source: ev.filename,
      line: ev.lineno,
      col: ev.colno,
      stack: ev.error instanceof Error ? ev.error.stack?.slice(0, 800) : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    capture('unhandled-rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack?.slice(0, 800) : undefined,
    });
  });
}

export function readMisses(filter?: { category?: string; tractate?: string }): MissRecord[] {
  let all = load();
  if (filter?.category) all = all.filter((r) => r.category === filter.category);
  if (filter?.tractate) all = all.filter((r) => r.tractate === filter.tractate);
  return all;
}

export function clearMisses(): void {
  save([]);
  seenThisSession.clear();
}

// Expose on window for interactive inspection from devtools.
if (typeof window !== 'undefined') {
  interface MissWindow {
    dafMisses?: {
      (filter?: { category?: string; tractate?: string }): MissRecord[];
      clear: () => void;
    };
  }
  const fn: MissWindow['dafMisses'] = Object.assign(
    (filter?: { category?: string; tractate?: string }) => readMisses(filter),
    { clear: clearMisses },
  );
  (window as unknown as MissWindow).dafMisses = fn;
}
