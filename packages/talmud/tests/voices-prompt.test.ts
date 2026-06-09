import { describe, expect, it } from 'vitest';
import {
  ARGUMENT_VOICES_SYSTEM_PROMPT,
  ARGUMENT_VOICES_SYSTEM_PROMPT_HE,
} from '../src/worker/code-marks';

/**
 * Regression guards for the argument.voices prompt (the per-section dispute map).
 *
 * The June 2026 voices audit found four recurring quality issues on real
 * disputes; the prompt (EN + HE) was tightened to fix them. The cache-identity
 * snapshot (tests/code-enrichments-snapshot) only catches a cache_version bump —
 * NOT silent deletion of the guidance text. These tests lock the actual rules so
 * a revert is caught.
 */
describe('ARGUMENT_VOICES_SYSTEM_PROMPT (English)', () => {
  const p = ARGUMENT_VOICES_SYSTEM_PROMPT;

  it('reserves "respondent" for Q&A; co-equal Mishnaic disputants are "objector"', () => {
    // The Berakhot 2a mislabel: Sages / Rabban Gamliel were tagged "respondent".
    expect(p).toMatch(/ROLES/);
    expect(p).toMatch(/OBJECTOR, not a respondent/);
    expect(p).toMatch(/ONLY for genuine Q&A|NEVER for a parallel disputant/);
  });

  it('keeps sides minimal (no A–F over-fragmentation)', () => {
    expect(p).toMatch(/KEEP SIDES MINIMAL/);
    expect(p).toMatch(/not D\/E\/F/);
  });

  it('emits "opposes" only for a real disagreement, not harmonized views', () => {
    // The Berakhot Rabban-Gamliel-vs-Sages spurious edge (midnight is a "fence").
    expect(p).toMatch(/HARMONIZES/);
    expect(p).toMatch(/not opposition when the sugya reconciles them/);
  });

  it('requires a clean speaker label for "name", never a move description', () => {
    expect(p).toMatch(/CLEAN speaker label/);
    expect(p).toMatch(/NEVER a description of the move/);
  });
});

describe('ARGUMENT_VOICES_SYSTEM_PROMPT_HE (Hebrew parity)', () => {
  const p = ARGUMENT_VOICES_SYSTEM_PROMPT_HE;

  it('carries the same four rules (roles / sides / opposition / names)', () => {
    expect(p).toMatch(/objector ולא respondent/); // role reservation
    expect(p).toMatch(/שמור על מספר side מינימלי/); // minimal sides
    expect(p).toMatch(/מחלוקת ממשית/); // opposes = real dispute
    expect(p).toMatch(/תווית דובר נקייה/); // clean speaker label
  });
});
