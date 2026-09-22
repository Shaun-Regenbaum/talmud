// @vitest-environment jsdom
// HTML labels keep the badge in the card's flex layout in either language.
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ArgumentFlowGraph from '../../src/client/ArgumentFlowGraph';
import { setLang } from '../../src/client/i18n';

beforeEach(() => setLang('en'));
afterEach(() => setLang('en'));

describe('ArgumentFlowGraph — Hebrew section titles align off the badge', () => {
  const title = 'קושיית הגמרא';
  const props = {
    nodes: [{ index: 0, title }],
    connections: [],
    activeIndex: null,
    onSelect: () => {},
  };

  it('keeps the Hebrew label and badge in separate elements with automatic direction', () => {
    setLang('he');
    const { container } = render(() => <ArgumentFlowGraph {...props} />);
    const card = container.querySelector('[data-graph-node="section:0"]')!;
    expect(card.getAttribute('dir')).toBe('auto');
    expect(card.querySelector('.ui-graph-label')?.textContent).toBe(title);
    expect(card.querySelector('.ui-graph-badge')?.textContent).toBe('1');
  });

  it('uses the same separate label and badge in English', () => {
    const { container } = render(() => (
      <ArgumentFlowGraph {...props} nodes={[{ index: 0, title: 'The Gemara asks' }]} />
    ));
    const card = container.querySelector('[data-graph-node="section:0"]')!;
    expect(card.getAttribute('dir')).toBe('auto');
    expect(card.querySelector('.ui-graph-label')?.textContent).toBe('The Gemara asks');
    expect(card.querySelector('.ui-graph-badge')?.textContent).toBe('1');
  });
});
