import { describe, expect, it } from 'vitest';
import { type CronHeavyPhase, cronHeavyPhase } from '../src/worker/cron-schedule';

// Guards the memory fix: the three heavy cron phases must run on SEPARATE ticks
// (rotating), so one 5-min invocation never stacks all three in a 128 MB isolate.
describe('cronHeavyPhase', () => {
  const TICK = 300_000;

  it('rotates connect -> warm -> spine across consecutive ticks', () => {
    const seq: CronHeavyPhase[] = [0, 1, 2, 3, 4, 5].map((k) => cronHeavyPhase(k * TICK));
    expect(seq).toEqual(['connect', 'warm', 'spine', 'connect', 'warm', 'spine']);
  });

  it('only ever returns one phase (never runs two heavy phases the same tick)', () => {
    for (let k = 0; k < 30; k++) {
      expect(['connect', 'warm', 'spine']).toContain(cronHeavyPhase(k * TICK));
    }
  });

  it('is stable within a tick and changes across the 5-min boundary', () => {
    const t = 1_000_000 * TICK;
    expect(cronHeavyPhase(t)).toBe(cronHeavyPhase(t + TICK - 1)); // same tick
    expect(cronHeavyPhase(t)).not.toBe(cronHeavyPhase(t + TICK)); // next tick rotates
  });

  it('handles t=0 and never throws on the modulo (no negative-index gap)', () => {
    expect(cronHeavyPhase(0)).toBe('connect');
  });
});
