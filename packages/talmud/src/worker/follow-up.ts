/**
 * Follow-up envelopes for machine callers (the MCP bridge, direct API users).
 *
 * A cold daf used to answer with a bare `complete: false` — indistinguishable,
 * to a model or a script, from a broken page. These helpers add what a caller
 * needs to be HONEST with its user instead of guessing or busy-polling:
 * whether generation is running, where to re-read (`checkUrl` — the same URL,
 * which fills in as pieces land), where a human can watch it happen
 * (`readerUrl`), how often to retry, and how long it usually takes. Every field
 * is additive; the reader ignores them.
 */

/** The public origin every follow-up URL is built on. The bridge calls the
 *  worker in-process (no real host), so URLs are built from this constant, not
 *  from the request. */
export const PUBLIC_ORIGIN = 'https://talmud.dev';

/** A partial daf-view is worth re-reading about this often (pieces land
 *  progressively through the Workflow's tiers). */
export const DAF_GEN_RETRY_AFTER_S = 60;
/** Typical wall-clock for a whole cold daf at full depth. */
export const DAF_GEN_ETA_MINUTES = 8;
/** Poll cadence for one queued /api/run job. */
export const RUN_RETRY_AFTER_S = 15;
/** Typical wall-clock for one cold piece (p95 is ~2 min; say the median). */
export const RUN_ETA_SECONDS = 60;

function langQuery(lang: 'en' | 'he'): string {
  return lang === 'he' ? '?lang=he' : '';
}

/** The one-shot read for a daf — also the URL to re-check while it generates. */
export function dafViewUrl(tractate: string, page: string, lang: 'en' | 'he'): string {
  return `${PUBLIC_ORIGIN}/api/daf-view/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}${langQuery(lang)}`;
}

/** The human page for the daf. It renders whatever exists and fills in live. */
export function readerUrl(tractate: string, page: string, lang: 'en' | 'he'): string {
  return `${PUBLIC_ORIGIN}/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}${langQuery(lang)}`;
}

/** Where to poll one queued run (the `k` fallback lets it recover a result whose
 *  job record never landed). */
export function runStatusUrl(runId: string, cacheKey?: string | null): string {
  const base = `${PUBLIC_ORIGIN}/api/run-status/${encodeURIComponent(runId)}`;
  return cacheKey ? `${base}?k=${encodeURIComponent(cacheKey)}` : base;
}

export interface DafViewProgress {
  status: 'complete' | 'partial';
  /** A generation Workflow is in flight for this daf+lang right now. */
  generating: boolean;
  checkUrl: string;
  readerUrl: string;
  retryAfterSeconds?: number;
  etaMinutes?: number;
  /** One plain sentence telling the caller what to do next. */
  hint?: string;
}

/** Progress + next-step guidance for a daf-view response. Pure. */
export function dafViewProgress(o: {
  complete: boolean;
  generating: boolean;
  /** AI generation is paused (credits / budget / provider) — nothing will fill in. */
  aiDown: boolean;
  tractate: string;
  page: string;
  lang: 'en' | 'he';
}): DafViewProgress {
  const urls = {
    checkUrl: dafViewUrl(o.tractate, o.page, o.lang),
    readerUrl: readerUrl(o.tractate, o.page, o.lang),
  };
  if (o.complete) return { status: 'complete', generating: false, ...urls };
  let hint: string;
  if (o.aiDown) {
    hint =
      'AI generation is paused right now (see reason), so the missing pieces will not fill in until it resumes. Cached pieces still serve; say so plainly.';
  } else if (o.generating) {
    hint = `This daf is being generated now; pieces land progressively over ~${DAF_GEN_ETA_MINUTES} minutes. Return what is here, tell the user the rest is on its way, and re-read checkUrl on their next request (do not busy-poll a whole daf inside one call).`;
  } else {
    hint =
      'Missing pieces are not being generated. Re-read with ?generate=1 (or POST /api/daf-generate) to start generation, then check back later.';
  }
  return {
    status: 'partial',
    generating: o.generating,
    ...urls,
    retryAfterSeconds: DAF_GEN_RETRY_AFTER_S,
    etaMinutes: DAF_GEN_ETA_MINUTES,
    hint,
  };
}

/** Fields appended to a successful daf-generate envelope. */
export function dafGenerationFollowUp(tractate: string, page: string, lang: 'en' | 'he') {
  return {
    checkUrl: dafViewUrl(tractate, page, lang),
    readerUrl: readerUrl(tractate, page, lang),
    retryAfterSeconds: DAF_GEN_RETRY_AFTER_S,
    etaMinutes: DAF_GEN_ETA_MINUTES,
  };
}

/** Fields appended to a 202 pending /api/run envelope. */
export function pendingRunFollowUp(runId: string, cacheKey?: string | null) {
  return {
    checkUrl: runStatusUrl(runId, cacheKey),
    retryAfterSeconds: RUN_RETRY_AFTER_S,
    etaSeconds: RUN_ETA_SECONDS,
    hint: `Queued. Poll checkUrl every ${RUN_RETRY_AFTER_S} s; one cold piece usually takes ~${RUN_ETA_SECONDS} s, sometimes 2 min. If you run out of time, return checkUrl and say the piece is still generating — the result is cached once it lands, so the next call is instant.`,
  };
}
