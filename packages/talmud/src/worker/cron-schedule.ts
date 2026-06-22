/**
 * Cron phase scheduling.
 *
 * The 5-minute warm cron used to run THREE heavy phases in one invocation —
 * connect-sweep, the warm cron (observations + dafyomi + source warming), and
 * the spine-view snapshot (which holds a growing per-tractate accumulator and
 * builds a window of dapim concurrently). Stacked in one 128 MB isolate, that
 * cumulative footprint was the suspected source of the sporadic `exceededMemory`
 * cron OOMs.
 *
 * Fix: run ONE heavy phase per tick, rotating. Each phase is cursor-resumable,
 * so running it every 3rd tick (~15 min) just paces the background warming —
 * nothing is skipped — while a single invocation only ever holds one phase's
 * memory. Pure + tested so the rotation can't silently regress.
 */

export type CronHeavyPhase = 'connect' | 'warm' | 'spine';

const ROTATION: readonly CronHeavyPhase[] = ['connect', 'warm', 'spine'];
const TICK_MS = 300_000; // the */5 cron interval

/** Which heavy phase this 5-min tick should run. Derived from the scheduled
 *  time so it's deterministic across the fleet (no shared counter needed). */
export function cronHeavyPhase(scheduledTimeMs: number): CronHeavyPhase {
  const tick = Math.floor(scheduledTimeMs / TICK_MS);
  return ROTATION[((tick % ROTATION.length) + ROTATION.length) % ROTATION.length];
}
