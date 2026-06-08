import { describe, it, expect } from 'vitest';
import { HALACHA_SYNTHESIS_SYSTEM_PROMPT } from '../src/worker/code-marks';

/**
 * Regression guards for the halacha synthesis prompt.
 *
 * The synthesis paragraph is what the user reads first on the halacha card.
 * Past output read like an academic survey ("the amoraic dictum of …", every
 * Hebrew term re-glossed every time) and led with the gemara source instead
 * of the modern-day halacha. The prompt was rewritten to frame the paragraph
 * as a contemporary halacha exploration. These tests lock that framing in so
 * a silent revert is caught.
 */
describe('HALACHA_SYNTHESIS_SYSTEM_PROMPT', () => {
  const p = HALACHA_SYNTHESIS_SYSTEM_PROMPT;

  it('frames the paragraph as modern-day halacha, not historical survey', () => {
    expect(p).toMatch(/modern-day halacha|contemporary/i);
  });

  it('forces sentence (a) to be an orientation, not a restatement of the Practical card', () => {
    // Past regression: (a) duplicated the Practical card's lechatchila/bedieved.
    // The synthesis paragraph's job is the narrative thread the cards cannot
    // give; mechanics live in the dedicated card.
    expect(p).toMatch(/ONE short orienting sentence/);
    expect(p).toMatch(/NOT a restatement of the Practical card/);
    expect(p).toMatch(/narrative thread/i);
  });

  it('bans academic Talmud-scholar register', () => {
    expect(p).toMatch(/amoraic ruling/);
    expect(p).toMatch(/amoraic dictum/);
    expect(p).toMatch(/the amora rules/);
    expect(p).toMatch(/the sugya records|the gemara records that/);
  });

  it('locks the section ordering: practical → codes → disputes → gemara source', () => {
    // Match the (a)/(b)/(c)/(d) markers in the JSON-schema description so we
    // don't accidentally pick up the same phrases in the intro sentence.
    const a = p.indexOf('(a) ONE short orienting sentence');
    const b = p.indexOf('(b) where it sits in the codes');
    const c = p.indexOf('(c) live disputes');
    const d = p.indexOf('(d) gemara source');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
  });

  it('marks the gemara source as optional / often dropped', () => {
    expect(p).toMatch(/include ONLY when it clarifies WHY/);
    expect(p).toMatch(/Drop \(c\) and\/or \(d\)/);
  });

  it('instructs first-occurrence-only Hebrew glossing inside the synthesis paragraph', () => {
    expect(p).toMatch(/FIRST occurrence/);
    expect(p).toMatch(/SUBSEQUENT occurrence/);
    expect(p).toMatch(/bare Hebrew script with NO gloss/);
    expect(p).toMatch(/Do NOT re-translate the same term twice/);
  });

  it('allows 3-5 sentences with a hard ceiling at 5', () => {
    expect(p).toMatch(/3-5 sentences/);
    expect(p).toMatch(/Hard ceiling/);
  });

  it('still inherits the base HEBREW_GLOSS_STYLE block', () => {
    expect(p).toMatch(/STYLE — Hebrew \+ English mixing/);
    expect(p).toMatch(/FORM A/);
    expect(p).toMatch(/FORM B/);
  });
});
