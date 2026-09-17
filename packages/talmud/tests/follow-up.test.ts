import { describe, expect, it } from 'vitest';
import {
  DAF_GEN_ETA_MINUTES,
  DAF_GEN_RETRY_AFTER_S,
  dafGenerationFollowUp,
  dafViewProgress,
  dafViewUrl,
  PUBLIC_ORIGIN,
  pendingRunFollowUp,
  RUN_RETRY_AFTER_S,
  readerUrl,
  runStatusUrl,
} from '../src/worker/follow-up';

// The point of these envelopes: a machine caller (the MCP bridge, a script) can
// be HONEST about a cold daf — say it is generating, where to look, when to
// retry — instead of reading `complete: false` as a broken page.

describe('follow-up URLs', () => {
  it('builds the re-check URL on the public origin, not the in-process host', () => {
    expect(dafViewUrl('Sotah', '4a', 'en')).toBe(`${PUBLIC_ORIGIN}/api/daf-view/Sotah/4a`);
    expect(PUBLIC_ORIGIN).toBe('https://talmud.dev');
  });
  it('keeps the language on the URLs (EN and HE generate distinct pieces)', () => {
    expect(dafViewUrl('Sotah', '4a', 'he')).toBe(
      'https://talmud.dev/api/daf-view/Sotah/4a?lang=he',
    );
    expect(readerUrl('Sotah', '4a', 'he')).toBe('https://talmud.dev/Sotah/4a?lang=he');
    expect(readerUrl('Sotah', '4a', 'en')).toBe('https://talmud.dev/Sotah/4a');
  });
  it('escapes path pieces', () => {
    expect(dafViewUrl('Bava Kamma', '2a', 'en')).toContain('/Bava%20Kamma/2a');
  });
  it('carries the cacheKey fallback on the run-status URL only when there is one', () => {
    expect(runStatusUrl('r1', 'enrich:v2:x y')).toBe(
      'https://talmud.dev/api/run-status/r1?k=enrich%3Av2%3Ax%20y',
    );
    expect(runStatusUrl('r1', null)).toBe('https://talmud.dev/api/run-status/r1');
  });
});

describe('dafViewProgress', () => {
  const base = { tractate: 'Sotah', page: '4a', lang: 'en' as const, aiDown: false };

  it('a complete view carries the URLs and nothing to wait for', () => {
    const p = dafViewProgress({ ...base, complete: true, generating: false });
    expect(p.status).toBe('complete');
    expect(p.generating).toBe(false);
    expect(p.hint).toBeUndefined();
    expect(p.retryAfterSeconds).toBeUndefined();
    expect(p.checkUrl).toBe('https://talmud.dev/api/daf-view/Sotah/4a');
    expect(p.readerUrl).toBe('https://talmud.dev/Sotah/4a');
  });

  it('a partial view that is generating says so, with a retry cadence and an ETA', () => {
    const p = dafViewProgress({ ...base, complete: false, generating: true });
    expect(p.status).toBe('partial');
    expect(p.generating).toBe(true);
    expect(p.retryAfterSeconds).toBe(DAF_GEN_RETRY_AFTER_S);
    expect(p.etaMinutes).toBe(DAF_GEN_ETA_MINUTES);
    expect(p.hint).toMatch(/being generated now/);
    expect(p.hint).toMatch(/do not busy-poll/i);
  });

  it('a partial view that is NOT generating tells the caller how to start it', () => {
    const p = dafViewProgress({ ...base, complete: false, generating: false });
    expect(p.generating).toBe(false);
    expect(p.hint).toMatch(/generate=1/);
    expect(p.hint).toMatch(/daf-generate/);
  });

  it('when AI is paused it says the pieces will not fill in (no false "on its way")', () => {
    const p = dafViewProgress({ ...base, complete: false, generating: false, aiDown: true });
    expect(p.hint).toMatch(/paused/);
    expect(p.hint).not.toMatch(/on its way/);
  });
});

describe('generation + run follow-ups', () => {
  it('daf-generate follow-up points at the daf-view URL to re-read', () => {
    const f = dafGenerationFollowUp('Sotah', '4a', 'he');
    expect(f.checkUrl).toBe('https://talmud.dev/api/daf-view/Sotah/4a?lang=he');
    expect(f.readerUrl).toBe('https://talmud.dev/Sotah/4a?lang=he');
    expect(f.retryAfterSeconds).toBe(DAF_GEN_RETRY_AFTER_S);
    expect(f.etaMinutes).toBe(DAF_GEN_ETA_MINUTES);
  });
  it('pending-run follow-up points at run-status with the cacheKey fallback', () => {
    const f = pendingRunFollowUp('abc', 'k1');
    expect(f.checkUrl).toBe('https://talmud.dev/api/run-status/abc?k=k1');
    expect(f.retryAfterSeconds).toBe(RUN_RETRY_AFTER_S);
    expect(f.etaSeconds).toBeGreaterThan(0);
    expect(f.hint).toMatch(/cached once it lands/);
  });
});
