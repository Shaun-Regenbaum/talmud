// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentifiedRabbi } from '../../src/client/dafContext';
import { RabbiBody } from '../../src/client/ArgumentSidebar';
import { setLang } from '../../src/client/i18n';

beforeEach(() => {
  setLang('en');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response));
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLang('en');
});

const rabbi: IdentifiedRabbi = {
  slug: 'rabbi-yochanan',
  name: 'Rabbi Yochanan',
  nameHe: 'ר׳ יוחנן',
  generation: 'amora-ey-1',
  region: 'israel',
  places: ['Tiberias'],
  moved: null,
  bio: null,
  image: null,
  wiki: null,
};

const noop = () => {};

describe('RabbiBody name-flip', () => {
  it('English mode: Latin name is the LTR title, Hebrew name is the RTL subtitle', () => {
    const { container } = render(() => (
      <RabbiBody rabbi={rabbi} tractate="Shabbat" page="125b" generationByName={new Map()} onHighlightRange={noop} />
    ));
    const h3 = container.querySelector('h3')!;
    expect(h3.textContent).toBe('Rabbi Yochanan');
    expect(h3.getAttribute('dir')).toBeNull();
    const sub = container.querySelector('p[dir="rtl"]')!;
    expect(sub.textContent).toContain('ר׳ יוחנן');
  });

  it('Hebrew mode: Hebrew name becomes the RTL title, Latin name the LTR subtitle', () => {
    setLang('he');
    const { container } = render(() => (
      <RabbiBody rabbi={rabbi} tractate="Shabbat" page="125b" generationByName={new Map()} onHighlightRange={noop} />
    ));
    const h3 = container.querySelector('h3')!;
    expect(h3.textContent).toBe('ר׳ יוחנן');
    expect(h3.getAttribute('dir')).toBe('rtl');
    // secondary line is now the Latin name, rendered LTR
    const sub = container.querySelector('h3 + p')!;
    expect(sub.getAttribute('dir')).toBeNull();
    expect(sub.textContent).toBe('Rabbi Yochanan');
  });
});
