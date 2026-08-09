import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampAmud, isValidAmud, TRACTATE_END_AMUD } from '../src/lib/sefref/amudim';
import { TRACTATE_OPTIONS } from '../src/lib/sefref/tractates';
import { fetchCommentaryWorks } from '../src/worker/commentary';
import type { Bindings } from '../src/worker/types';

// Pages past a tractate's end used to reach the generation pipeline (the
// reader's "next" walked off Megillah 32a onto 32b, /api/daf-generate spawned
// a Workflow for it, every Sefaria-backed producer got a permanent ref error,
// and each queue retry logged another hard failure while the LLM steps billed
// for a page that doesn't exist). These pin the gates that stop that.

describe('isValidAmud', () => {
  it('accepts real pages, including tractate ends', () => {
    expect(isValidAmud('Megillah', '2a')).toBe(true);
    expect(isValidAmud('Megillah', '32a')).toBe(true);
    expect(isValidAmud('Avodah Zarah', '76b')).toBe(true);
    expect(isValidAmud('Shekalim', '22b')).toBe(true);
    expect(isValidAmud('Berakhot', '64a')).toBe(true);
  });

  it('rejects pages past the end — amud-granular, not just the daf number', () => {
    // Megillah ends at 32a: the daf number is in range but 32b does not exist.
    expect(isValidAmud('Megillah', '32b')).toBe(false);
    expect(isValidAmud('Avodah Zarah', '98a')).toBe(false);
    expect(isValidAmud('Berakhot', '64b')).toBe(false);
    expect(isValidAmud('Shekalim', '23a')).toBe(false);
  });

  it('rejects pages before 2a, malformed pages, and unknown tractates', () => {
    expect(isValidAmud('Megillah', '1a')).toBe(false);
    expect(isValidAmud('Megillah', '1b')).toBe(false);
    expect(isValidAmud('Megillah', '0a')).toBe(false);
    expect(isValidAmud('Megillah', '2c')).toBe(false);
    expect(isValidAmud('Megillah', 'abc')).toBe(false);
    expect(isValidAmud('Megillah', '')).toBe(false);
    expect(isValidAmud('Bava Nonexistent', '2a')).toBe(false);
  });

  it('covers every tractate the reader offers', () => {
    for (const opt of TRACTATE_OPTIONS) {
      expect(TRACTATE_END_AMUD[opt.value.toLowerCase()], opt.value).toBeTruthy();
      expect(isValidAmud(opt.value, '2a'), opt.value).toBe(true);
    }
  });
});

describe('clampAmud', () => {
  it('folds past-the-end pages onto the end amud', () => {
    expect(clampAmud('Megillah', '32b')).toBe('32a');
    expect(clampAmud('Megillah', '99a')).toBe('32a');
    expect(clampAmud('Avodah Zarah', '98a')).toBe('76b');
  });

  it('leaves in-range pages unchanged', () => {
    expect(clampAmud('Megillah', '2a')).toBe('2a');
    expect(clampAmud('Megillah', '32a')).toBe('32a');
    expect(clampAmud('Shekalim', '22b')).toBe('22b');
  });

  it('passes through malformed pages and unknown tractates unchanged', () => {
    expect(clampAmud('Megillah', 'abc')).toBe('abc');
    expect(clampAmud('Bava Nonexistent', '99a')).toBe('99a');
  });
});

// Sefaria answers an unresolvable ref with a 200 whose body is an error
// OBJECT (e.g. {"error": "Megillah ends at Daf 32a."}) — deterministic for
// that ref. fetchCommentaryWorks must flag that shape permanent so the
// rishonim mark completes empty instead of hard-failing every queue retry
// (Shekalim: Sefaria has no Bavli text under that title at all, so the daf is
// valid in-app but this fetch permanently errors).
describe('fetchCommentaryWorks — Sefaria error-object classification', () => {
  const env = {} as Bindings;
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = (body: string, init?: ResponseInit) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, init)),
    );

  it('marks a 200 {"error": ...} object permanent', async () => {
    stubFetch(JSON.stringify({ error: 'Could not find title in reference: Shekalim 2a' }));
    const r = await fetchCommentaryWorks(env, 'Shekalim', '2a');
    expect(r).toMatchObject({ permanent: true });
    expect('error' in r && r.error).toContain('Could not find title');
  });

  it('keeps other non-array JSON transient (no permanent flag)', async () => {
    stubFetch(JSON.stringify({ unexpected: 'shape' }));
    const r = await fetchCommentaryWorks(env, 'Berakhot', '2a');
    expect('error' in r && r.error).toContain('non-array');
    expect((r as { permanent?: boolean }).permanent).toBeUndefined();
  });

  it('keeps HTTP failures and non-JSON transient', async () => {
    stubFetch('gateway timeout', { status: 503 });
    const r1 = await fetchCommentaryWorks(env, 'Berakhot', '2a');
    expect((r1 as { permanent?: boolean }).permanent).toBeUndefined();
    stubFetch('<html>rate limited</html>');
    const r2 = await fetchCommentaryWorks(env, 'Berakhot', '2a');
    expect((r2 as { permanent?: boolean }).permanent).toBeUndefined();
  });
});
