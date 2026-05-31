// @vitest-environment jsdom
//
// Regression guard for the Hebrew SVG-diagram glitch: section/voice labels were
// drawn with text-anchor="start" + direction="rtl", which (text-anchor being
// direction-relative) pinned the text's RIGHT edge to the label x. Hebrew then
// flowed leftward over the number/colour badge and clipped at the card edge. The
// fix flips the anchor to "end" in he mode so the LEFT edge is pinned instead.
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ArgumentFlowGraph from '../../src/client/ArgumentFlowGraph';
import ArgumentVoiceMap from '../../src/client/ArgumentVoiceMap';
import { setLang } from '../../src/client/i18n';

beforeEach(() => setLang('en'));
afterEach(() => setLang('en'));

/** The <text> nodes whose content matches a string (ignoring the badge/number). */
function textsWithContent(container: HTMLElement, needle: string): SVGTextElement[] {
  return Array.from(container.querySelectorAll('text')).filter((t) =>
    (t.textContent ?? '').includes(needle),
  ) as unknown as SVGTextElement[];
}

describe('ArgumentFlowGraph — Hebrew section titles align off the badge', () => {
  const title = 'קושיית הגמרא';
  const props = {
    nodes: [{ index: 0, title }],
    connections: [],
    activeIndex: null,
    onSelect: () => {},
  };

  it('he mode: title text-anchor is "end" with direction rtl (left-edge pinned)', () => {
    setLang('he');
    const { container } = render(() => <ArgumentFlowGraph {...props} />);
    const titleTexts = textsWithContent(container, 'קושיית');
    expect(titleTexts.length).toBeGreaterThan(0);
    for (const t of titleTexts) {
      expect(t.getAttribute('text-anchor')).toBe('end');
      expect(t.getAttribute('direction')).toBe('rtl');
    }
  });

  it('en mode: title text-anchor stays "start"', () => {
    setLang('en');
    const { container } = render(() => (
      <ArgumentFlowGraph {...props} nodes={[{ index: 0, title: 'The Gemara asks' }]} />
    ));
    const titleTexts = textsWithContent(container, 'Gemara');
    expect(titleTexts.length).toBeGreaterThan(0);
    for (const t of titleTexts) expect(t.getAttribute('text-anchor')).toBe('start');
  });
});

describe('ArgumentVoiceMap — Hebrew voice names align off the colour badge', () => {
  const data = {
    voices: [{ name: 'Rav Meir', nameHe: 'רב מאיר', role: 'originator', side: 'a', stance: '' }],
    edges: [],
  };

  it('he mode: name text-anchor is "end" with direction rtl', () => {
    setLang('he');
    const { container } = render(() => <ArgumentVoiceMap data={data} />);
    const nameTexts = textsWithContent(container, 'מאיר');
    expect(nameTexts.length).toBeGreaterThan(0);
    for (const t of nameTexts) {
      expect(t.getAttribute('text-anchor')).toBe('end');
      expect(t.getAttribute('direction')).toBe('rtl');
    }
  });

  it('en mode: name text-anchor stays "start"', () => {
    setLang('en');
    const { container } = render(() => <ArgumentVoiceMap data={data} />);
    const nameTexts = textsWithContent(container, 'Meir');
    expect(nameTexts.length).toBeGreaterThan(0);
    for (const t of nameTexts) expect(t.getAttribute('text-anchor')).toBe('start');
  });
});
