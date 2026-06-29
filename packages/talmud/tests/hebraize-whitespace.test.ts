import { describe, expect, it } from 'vitest';
import { splitOuterWhitespace } from '../src/worker/hebraize-route';

// ---------------------------------------------------------------------------
// splitOuterWhitespace — preserves the leading/trailing whitespace that
// HebraizedWithRabbis depends on. Each slice of text between rabbi-link
// buttons carries a single space that sits adjacent to the button; the
// `/api/hebraize` endpoint must NOT consume it. Regression for the
// "Rabbi Amireciting" / "thatRabbi Ami" rendering bug.
// ---------------------------------------------------------------------------

describe('splitOuterWhitespace', () => {
  it('returns empty parts for an empty string', () => {
    expect(splitOuterWhitespace('')).toEqual({ leading: '', core: '', trailing: '' });
  });

  it('returns the input as leading when text is all whitespace', () => {
    expect(splitOuterWhitespace('   ')).toEqual({ leading: '   ', core: '', trailing: '' });
    expect(splitOuterWhitespace('\n\t ')).toEqual({ leading: '\n\t ', core: '', trailing: '' });
  });

  it('returns empty leading/trailing when text has no outer whitespace', () => {
    expect(splitOuterWhitespace('hello')).toEqual({ leading: '', core: 'hello', trailing: '' });
  });

  it('captures a single leading space', () => {
    expect(splitOuterWhitespace(' reciting')).toEqual({
      leading: ' ',
      core: 'reciting',
      trailing: '',
    });
  });

  it('captures a single trailing space', () => {
    expect(splitOuterWhitespace('explains that ')).toEqual({
      leading: '',
      core: 'explains that',
      trailing: ' ',
    });
  });

  it('captures whitespace on both sides', () => {
    const slice = " reciting Ze'eiri's ruling (the majority of surrounding flesh), and ";
    const { leading, core, trailing } = splitOuterWhitespace(slice);
    expect(leading).toBe(' ');
    expect(trailing).toBe(' ');
    expect(core).toBe("reciting Ze'eiri's ruling (the majority of surrounding flesh), and");
    // Round-trip — reattaching must reproduce the input exactly.
    expect(leading + core + trailing).toBe(slice);
  });

  it('handles multi-character whitespace (tabs, newlines, multiple spaces)', () => {
    const slice = '\n\t  word with inner spaces \t\n';
    const { leading, core, trailing } = splitOuterWhitespace(slice);
    expect(leading).toBe('\n\t  ');
    expect(trailing).toBe(' \t\n');
    expect(core).toBe('word with inner spaces');
    expect(leading + core + trailing).toBe(slice);
  });

  it('does not strip whitespace that sits BETWEEN tokens, only outer', () => {
    // Multiple internal spaces / tabs / newlines stay intact in core.
    const slice = '  a  b\tc\nd  ';
    const { leading, core, trailing } = splitOuterWhitespace(slice);
    expect(leading).toBe('  ');
    expect(trailing).toBe('  ');
    expect(core).toBe('a  b\tc\nd');
  });

  it('round-trips for arbitrary slices — leading + core + trailing === input', () => {
    const slices = [
      'plain',
      ' leading',
      'trailing ',
      ' both sides ',
      '   triple-leading',
      'triple-trailing   ',
      "Rabbi Ami reciting Ze'eiri's ruling",
      ' Rashi (רש״י) explains that ',
      '\n  newline-leading',
      'newline-trailing\n',
      // Real rabbi-text slice with mixed Hebrew + Latin parens.
      ' challenged him: how can one pinch a bird (אשתומם) that is already dead? (the majority of surrounding flesh) ',
    ];
    for (const slice of slices) {
      const { leading, core, trailing } = splitOuterWhitespace(slice);
      expect(leading + core + trailing, `round-trip "${slice}"`).toBe(slice);
    }
  });
});

// ---------------------------------------------------------------------------
// Concrete bug repro: the slice that produced "Rabbi Amireciting" /
// "thatRabbi Ami" in the aggadata interpretation card. Slice runs from after
// the first [Rabbi Ami] link through to just before the second [Rabbi Ami]
// link and carries Latin parens that route it through the LLM. The endpoint
// trimmed the LLM response, eating BOTH the leading and trailing spaces of
// the same slice. splitOuterWhitespace preserves them so the endpoint can
// reattach.
// ---------------------------------------------------------------------------

describe('splitOuterWhitespace — RabbiText slice regression', () => {
  it('keeps the spaces adjacent to rabbi-link buttons', () => {
    const slice =
      " reciting Ze'eiri's ruling that one pinches a bird by cutting the spine and neck without (רוב בשר) (the majority of surrounding flesh), and challenged him: how can one pinch a bird that is already dead? (רש״י) explains that ";
    const { leading, core, trailing } = splitOuterWhitespace(slice);
    expect(leading).toBe(' ');
    expect(trailing).toBe(' ');
    // Reattach must include both spaces so the rendered output reads
    // "Rabbi Ami reciting … explains that Rabbi Ami".
    const simulatedLlmResponse = core; // LLM round-trips the dict-resolved text in this case
    expect(leading + simulatedLlmResponse + trailing).toBe(slice);
  });
});
