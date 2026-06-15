// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { LinkRef } from '../../src/client/LinkRef';

describe('LinkRef', () => {
  it('renders a Bavli daf as a clickable reader link, no badge', () => {
    const { container } = render(() => (
      <LinkRef coord={{ tractate: 'Berakhot', page: '13a', seg: -1 }} />
    ));
    const a = container.querySelector('a');
    expect(a).toBeTruthy();
    expect(a?.getAttribute('href')).toBe('?tractate=Berakhot&page=13a');
    expect(a?.textContent).toContain('Berakhot 13a');
    expect(container.textContent).not.toContain('ירושלמי');
  });

  it('renders a Yerushalmi target inert (no link) with a corpus badge', () => {
    const { container } = render(() => (
      <LinkRef coord={{ tractate: 'Jerusalem Talmud Berakhot', page: '1:1', seg: -1 }} />
    ));
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Jerusalem Talmud Berakhot 1:1');
    expect(container.textContent).toContain('ירושלמי');
  });

  it('renders a commentary-spine target inert with a "commentary" badge', () => {
    const { container } = render(() => (
      <LinkRef coord={{ tractate: 'Berakhot', page: '2a', seg: -1, spine: 'Rashi' }} />
    ));
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Rashi · Berakhot 2a');
    expect(container.textContent).toContain('commentary');
  });
});
