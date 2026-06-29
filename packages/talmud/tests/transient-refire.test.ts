// The transient re-fire gate (Part 2 of the geography-loading fix): a computed
// mark (geography) reads its dependency marks' caches server-side. On a cold
// daf every enabled mark fires concurrently, so geography can read empty caches
// and the worker returns the model tagged `transient` (served, not pinned). The
// client must RE-FIRE that mark once its dependency marks (rabbi, places-if-on)
// have reached a settled, non-transient `ok` — otherwise the empty model is
// stuck on screen until a manual reload. shouldRefireTransientMark is the pure
// decision behind that effect.

import { describe, expect, it } from 'vitest';
import type { RunResult } from '../src/client/enrichmentQueue';
import {
  type RunState,
  shouldRefireTransientMark,
  TRANSIENT_REFIRE_CAP,
} from '../src/client/MarksRegistryPanel';

const STAMP = 'Berakhot/2a/en';

const result = (over: Partial<RunResult> = {}): RunResult =>
  ({
    content: '{}',
    parsed: { instances: [] },
    parse_error: null,
    model: 'computed:geography-model',
    transport: 'computed',
    attempts: 1,
    usage: null,
    elapsed_ms: 1,
    resolved: { system_prompt: '', user_prompt: '' },
    total_ms: 1,
    ...over,
  }) as RunResult;

const ok = (transient: boolean, stamp = STAMP): RunState => ({
  kind: 'ok',
  stamp,
  at: 0,
  result: result({ transient }),
});

const call = (over: Partial<Parameters<typeof shouldRefireTransientMark>[0]>) =>
  shouldRefireTransientMark({
    markId: 'geography',
    stamp: STAMP,
    runs: {},
    enabled: new Set(['geography', 'rabbi', 'places']),
    depMarkIds: ['rabbi', 'places'],
    refireCount: 0,
    ...over,
  });

describe('shouldRefireTransientMark', () => {
  it('does NOT re-fire while a dependency mark is still loading', () => {
    // The race the bug describes: geography settled transient, rabbi mid-run.
    const runs: Record<string, RunState> = {
      geography: ok(true),
      rabbi: { kind: 'loading', stamp: STAMP },
      places: ok(false),
    };
    expect(call({ runs })).toBe(false);
  });

  it('does NOT re-fire while a dependency mark is itself still transient', () => {
    const runs: Record<string, RunState> = {
      geography: ok(true),
      rabbi: ok(true), // not settled yet
      places: ok(false),
    };
    expect(call({ runs })).toBe(false);
  });

  it('RE-FIRES once every dependency mark reaches a settled non-transient ok', () => {
    const runs: Record<string, RunState> = {
      geography: ok(true),
      rabbi: ok(false),
      places: ok(false),
    };
    expect(call({ runs })).toBe(true);
  });

  it('does not re-fire a NON-transient result (already final / warm daf)', () => {
    const runs: Record<string, RunState> = {
      geography: ok(false), // genuinely-empty daf is non-transient → final
      rabbi: ok(false),
      places: ok(false),
    };
    expect(call({ runs })).toBe(false);
  });

  it('a disabled dependency mark does not block the re-fire', () => {
    // places turned off: it sits idle/absent forever — must not gate geography.
    const runs: Record<string, RunState> = {
      geography: ok(true),
      rabbi: ok(false),
    };
    expect(call({ runs, enabled: new Set(['geography', 'rabbi']) })).toBe(true);
  });

  it('an idle (not-yet-started) dependency does not block', () => {
    const runs: Record<string, RunState> = {
      geography: ok(true),
      rabbi: ok(false),
      places: { kind: 'idle' },
    };
    expect(call({ runs })).toBe(true);
  });

  it('stops re-firing at the per-(mark, stamp) cap (loop guard)', () => {
    const runs: Record<string, RunState> = {
      geography: ok(true),
      rabbi: ok(false),
      places: ok(false),
    };
    expect(call({ runs, refireCount: TRANSIENT_REFIRE_CAP - 1 })).toBe(true);
    expect(call({ runs, refireCount: TRANSIENT_REFIRE_CAP })).toBe(false);
  });

  it('ignores a transient result stamped for a DIFFERENT daf', () => {
    const runs: Record<string, RunState> = {
      geography: ok(true, 'Shabbat/2a/en'), // stale daf
      rabbi: ok(false),
      places: ok(false),
    };
    expect(call({ runs })).toBe(false);
  });
});
