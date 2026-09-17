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

// rabbi-oshaya / rabbi-oshaya-2 are two different amoraim that look like a
// duplicate pair; they must never be folded.
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
const RABBAH = [
  cand('rabbah-b-nachmani', 'Rabbah [b. Nachmani]', {
    generation: 'amora-bavel-3',
    teachers: ['Rav Huna'],
  }),
  cand('rabbah-bar-nahmani', 'Rabbah bar Nahmani', { generation: 'amora-bavel-3' }),
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

describe('duplicateGroups (explicit registry map only)', () => {
  it('folds the listed Yehoshua b. Chananya duplicate onto the Sefaria node', () => {
    expect(duplicateGroups(YEHOSHUA)).toEqual({
      'rabbi-yehoshua-b-hananyah': ['rabbi-yehoshua-b-hananiah'],
    });
  });
  it('does NOT merge the two Rabbi Oshaya nodes (two different amoraim)', () => {
    expect(duplicateGroups(OSHAYA)).toEqual({});
  });
  it('does not merge Rav Kahana I with Rav Kahana (II)', () => {
    expect(duplicateGroups(KAHANA)).toEqual({});
  });
  it('ignores a duplicate whose canonical node is not among the candidates', () => {
    expect(duplicateGroups([cand('rabbah-bar-nahmani', 'Rabbah bar Nahmani')])).toEqual({});
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
    // Offered both Rabbah nodes, Jev splits its probability (the Shas-wide
    // run did this 397 times); merged onto the Sefaria node it is one pick.
    const d = decideRabbiPin(
      answers({ 'rabbah-b-nachmani': 0.39, 'rabbah-bar-nahmani': 0.33, decline: 0.28 }, 0.62, 0.55),
      RABBAH,
    );
    expect(d.slug).toBe('rabbah-b-nachmani');
    expect(d.confidence).toBe('medium');
    expect(d.probability).toBeCloseTo(0.72, 9);
    expect(d.reason).toContain('duplicate registry node');
  });

  it('leaves the two Rabbi Oshaya nodes as separate candidates', () => {
    const d = decideRabbiPin(
      answers({ 'rabbi-oshaya': 0.39, 'rabbi-oshaya-2': 0.33, decline: 0.28 }, 0.62, 0.55),
      OSHAYA,
    );
    expect(d.slug).toBe('rabbi-oshaya');
    expect(d.confidence).toBe('low'); // 0.39 is a lean, not a pin
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
