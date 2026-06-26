import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FAN_OUT_CONCURRENCY, STEP_CONCURRENCY } from '../src/worker/index';

// Memory-budget guard — a deploy-time ratchet on the invariants that keep a
// generation OOM from ever returning `error code: 1101` to a reader.
//
// The reader 1101s recurred for months because (a) generation shared the
// reader's Worker script (so a generation OOM killed the reader's isolate) and
// (b) the memory multipliers crept up unnoticed across PRs (the queue's
// max_concurrency went 2 -> 10 -> 50). Both are invisible at code-review time.
// This suite makes them VISIBLE: a PR that re-merges generation onto the reader,
// or re-widens an in-isolate fan-out, fails CI here and forces a conscious edit
// to the ceiling (and a fresh look at the 128 MB budget) rather than a silent
// regression. Pure file/const reads — runs in the normal `pnpm test` gate.

const stripComments = (toml: string): string =>
  toml
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');

const reader = stripComments(readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8'));
const gen = stripComments(
  readFileSync(new URL('../wrangler.generator.toml', import.meta.url), 'utf8'),
);

describe('memory-budget guard: the reader stays read-only', () => {
  it('the reader (talmud) hosts NO queue consumer — generation must never share its isolate pool', () => {
    // If this fails, a PR moved the queue consumer back onto the reader. That is
    // exactly the co-tenancy that caused the OOM 1101s. Keep it on talmud-gen.
    expect(reader).not.toMatch(/\[\[queues\.consumers\]\]/);
  });

  it('the reader binds DafWarmWorkflow cross-script (it does not host the class)', () => {
    expect(reader).toMatch(/script_name\s*=\s*["']talmud-gen["']/);
  });

  it('the reader runs only the */5 health cron (no heavy warm cron)', () => {
    const m = reader.match(/crons\s*=\s*\[([^\]]*)\]/);
    expect(m, 'reader [triggers] crons').toBeTruthy();
    const crons = (m as RegExpMatchArray)[1];
    expect(crons).toContain('*/5 * * * *');
    expect(crons).not.toContain('0 3'); // the 03:00 Daf-Yomi pre-warm lives on talmud-gen
  });

  it('the reader is tagged WORKER_ROLE=reader so scheduled() runs only the health watch', () => {
    expect(reader).toMatch(/WORKER_ROLE\s*=\s*["']reader["']/);
  });
});

describe('memory-budget guard: the generator owns generation, bounded', () => {
  it('talmud-gen hosts the queue consumer with concurrency <= 12 (the 128 MB-isolate budget)', () => {
    expect(gen).toMatch(/\[\[queues\.consumers\]\]/);
    const m = gen.match(/max_concurrency\s*=\s*(\d+)/);
    expect(m, 'generator max_concurrency').toBeTruthy();
    expect(Number((m as RegExpMatchArray)[1])).toBeLessThanOrEqual(12);
  });

  it('talmud-gen hosts the DafWarmWorkflow class locally (no cross-script binding)', () => {
    expect(gen).toMatch(/class_name\s*=\s*["']DafWarmWorkflow["']/);
    expect(gen).not.toMatch(/script_name/); // comments are stripped, so this is the real stanza
  });

  it('talmud-gen is tagged WORKER_ROLE=generator', () => {
    expect(gen).toMatch(/WORKER_ROLE\s*=\s*["']generator["']/);
  });
});

describe('memory-budget guard: in-isolate fan-out widths', () => {
  // These multiply the per-step source footprint into peak isolate memory. They
  // are bounded today; raising either is a conscious 128 MB-budget decision, so
  // it must come with an edit to this ceiling.
  it('STEP_CONCURRENCY (cold-gen tier width) stays <= 6', () => {
    expect(STEP_CONCURRENCY).toBeLessThanOrEqual(6);
  });

  it('FAN_OUT_CONCURRENCY (per-section fan-out width) stays <= 5', () => {
    expect(FAN_OUT_CONCURRENCY).toBeLessThanOrEqual(5);
  });
});
