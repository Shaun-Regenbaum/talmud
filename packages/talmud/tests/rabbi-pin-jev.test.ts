/**
 * rabbi.identity.pin on Jev — the pure pieces (src/worker/rabbi-pin-jev.ts):
 * request shape, registry-duplicate grouping, and the probability → verdict
 * mapping. The live accuracy benchmark is tests/integration/rabbi-pin-bench.
 */
import { describe, expect, it } from 'vitest';
import type { RabbiCandidateSummary } from '../src/worker/rabbi-graph';
import {
  buildRabbiPinJevRequest,
  DECLINE,
  decideRabbiPin,
  duplicateGroups,
  foldRabbiName,
  PIN_HIGH,
  PIN_MEDIUM,
} from '../src/worker/rabbi-pin-jev';

const cand = (
  slug: string,
  canonical: string,
  extra: Partial<RabbiCandidateSummary> = {},
): RabbiCandidateSummary => ({
  slug,
  canonical,
  generation: null,
  region: null,
  teachers: [],
  students: [],
  colleagues: [],
  ...extra,
});

// Real registry duplicates the benchmark tolerates as the same person.
const OSHAYA = [
  cand('rabbi-oshaya', 'Rabbi Oshaya', { generation: 'tanna-6', teachers: ['Rabbi Chiyya'] }),
  cand('rabbi-oshaya-2', 'Rabbi Oshaya', { generation: 'amora-ey-2' }),
];
const YEHOSHUA = [
  cand('rabbi-yehoshua-b-hananyah', 'Rabbi Yehoshua [b. Hananyah]', {
    students: ['Rabbi Akiva', 'Rabbi Yishmael'],
  }),
  cand('rabbi-yehoshua-b-hananiah', 'Rabbi Yehoshua b. Hananiah', { generation: 'tanna-2' }),
  cand('rabbi-yehoshua-b-levi', 'Rabbi Yehoshua b. Levi'),
  cand('rabbi-yehoshua-b-korcha', 'Rabbi Yehoshua b. Korcha'),
];
const KAHANA = [
  cand('rav-kahana', 'Rav Kahana', { teachers: ['Rav'] }),
  cand('rav-kahana-(ii)', 'Rav Kahana (II)', { teachers: ['Rav Yehuda'] }),
];

const answers = (
  probs: Record<string, number>,
  stam = 0.9,
  listed = 0.8,
): Parameters<typeof decideRabbiPin>[0] => {
  const choice = Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];
  return {
    which: { type: 'choice', choice, probabilities: probs, confidence: 0.5 },
    stam_applies: { type: 'noul', noul: stam },
    conventional_bearer_listed: { type: 'noul', noul: listed },
  };
};

describe('foldRabbiName', () => {
  it('equates transliteration and patronymic spelling variants', () => {
    expect(foldRabbiName('Rabbi Yehoshua [b. Hananyah]')).toBe(
      foldRabbiName('Rabbi Yehoshua b. Hananiah'),
    );
    expect(foldRabbiName('Rabbi Shmuel b. Nahmani')).toBe(
      foldRabbiName('Rabbi Shmuel bar Nachmani'),
    );
    expect(foldRabbiName('Rabbi Yishmael b. Elisha')).toBe(
      foldRabbiName('Rabbi Yishmael ben Elisha'),
    );
  });
  it('keeps genuinely different people apart', () => {
    expect(foldRabbiName('Rav Kahana')).not.toBe(foldRabbiName('Rav Kahana (II)'));
    expect(foldRabbiName('Rabbi Yehoshua b. Levi')).not.toBe(
      foldRabbiName('Rabbi Yehoshua b. Korcha'),
    );
  });
});

describe('duplicateGroups', () => {
  it('groups numbered-suffix duplicates under the better-documented node', () => {
    expect(duplicateGroups(OSHAYA)).toEqual({ 'rabbi-oshaya': ['rabbi-oshaya-2'] });
  });
  it('groups folded-name duplicates and leaves distinct bearers alone', () => {
    expect(duplicateGroups(YEHOSHUA)).toEqual({
      'rabbi-yehoshua-b-hananyah': ['rabbi-yehoshua-b-hananiah'],
    });
  });
  it('does not merge Rav Kahana I with Rav Kahana (II)', () => {
    expect(duplicateGroups(KAHANA)).toEqual({});
  });
});

describe('buildRabbiPinJevRequest', () => {
  it('offers every candidate plus decline, and carries the cast + conventions', () => {
    const req = buildRabbiPinJevRequest(
      { name: 'Rabbi Yehoshua', nameHe: 'רבי יהושע', generation: 'tanna-2' },
      YEHOSHUA,
      ['Rabbi Eliezer', 'Rabban Gamliel'],
      'Berakhot',
      '3b',
    );
    expect(Object.keys(req.questions.which.criteria)).toEqual([
      ...YEHOSHUA.map((c) => c.slug),
      DECLINE,
    ]);
    expect(req.questions.which.criteria['rabbi-yehoshua-b-hananyah']).toContain('Rabbi Akiva');
    expect(req.state.other_rabbis_named_on_this_daf).toEqual(['Rabbi Eliezer', 'Rabban Gamliel']);
    expect(req.state.mention).toMatchObject({ bare_name: 'Rabbi Yehoshua', daf: '3b' });
    expect(req.state.conventions.length).toBeGreaterThan(0);
    expect(req.questions.stam_applies.type).toBe('noul');
  });
});

describe('decideRabbiPin', () => {
  it('merges a duplicate-node split into one confident pin', () => {
    // Jev split 0.39 / 0.33 between the two Oshaya nodes (the real benchmark
    // answer); merged that is 0.72 — a medium pin, not a decline.
    const d = decideRabbiPin(
      answers({ 'rabbi-oshaya': 0.39, 'rabbi-oshaya-2': 0.33, decline: 0.28 }, 0.62, 0.55),
      OSHAYA,
    );
    expect(d.slug).toBe('rabbi-oshaya');
    expect(d.confidence).toBe('medium');
    expect(d.probability).toBeCloseTo(0.72, 9);
    expect(d.reason).toContain('duplicate registry node');
  });

  it('pins high when the merged winner clears PIN_HIGH', () => {
    const d = decideRabbiPin(
      answers({
        'rabbi-yehoshua-b-hananyah': 0.6,
        'rabbi-yehoshua-b-hananiah': 0.3,
        'rabbi-yehoshua-b-levi': 0.05,
        'rabbi-yehoshua-b-korcha': 0.03,
        decline: 0.02,
      }),
      YEHOSHUA,
    );
    expect(d.slug).toBe('rabbi-yehoshua-b-hananyah');
    expect(d.confidence).toBe('high');
    expect(d.probability).toBeGreaterThanOrEqual(PIN_HIGH);
  });

  it('declines when decline wins (the conventional bearer is not listed)', () => {
    const d = decideRabbiPin(
      answers({ 'rav-kahana': 0.1, 'rav-kahana-(ii)': 0.08, decline: 0.82 }, 0.96, 0.1),
      KAHANA,
    );
    expect(d.slug).toBeNull();
    expect(d.confidence).toBe('low');
    expect(d.reason).toMatch(/^Declined/);
    expect(d.reason).toContain('not listed');
  });

  it('reports a lean (low) when the winner is under PIN_MEDIUM', () => {
    const d = decideRabbiPin(
      answers({ 'rav-kahana': 0.45, 'rav-kahana-(ii)': 0.4, decline: 0.15 }, 0.2, 0.3),
      KAHANA,
    );
    expect(d.slug).toBe('rav-kahana');
    expect(d.confidence).toBe('low');
    expect(d.probability).toBeLessThan(PIN_MEDIUM);
    expect(d.reason).toMatch(/^Lean only/);
  });

  it('never returns a slug that is not a candidate', () => {
    const d = decideRabbiPin(answers({ ghost: 0.9, decline: 0.1 }), KAHANA);
    expect(d.slug).toBeNull();
  });
});
