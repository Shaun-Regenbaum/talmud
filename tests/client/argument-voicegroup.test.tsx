// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Section } from '../../src/client/shapes';
import { ArgumentBody, VoiceGroupBody } from '../../src/client/ArgumentSidebar';
import { setLang } from '../../src/client/i18n';

beforeEach(() => {
  setLang('en');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response));
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLang('en');
});

const section: Section = {
  title: 'Dispute over the requirement of an action',
  summary: 'Whether a maaseh is needed.',
  excerpt: 'בְּמַאי קָמִיפַּלְגִי',
  startSegIdx: 4,
  endSegIdx: 6,
  rabbis: [],
} as unknown as Section;

const noop = () => {};

describe('ArgumentBody', () => {
  it('renders the accent title and the Hebrew section excerpt', () => {
    const { container } = render(() => (
      <ArgumentBody
        section={section}
        tractate="Shabbat"
        page="125b"
        activeRabbi={null}
        onHighlightRabbi={noop}
        onPushRabbi={noop}
        dafRabbis={[]}
        onHighlightRange={noop}
        generationByName={new Map()}
      />
    ));
    expect(container.querySelector('h3')!.textContent).toBe('Dispute over the requirement of an action');
    const excerpt = container.querySelector('p[dir="rtl"]')!;
    expect(excerpt.getAttribute('lang')).toBe('he');
    expect(excerpt.textContent).toContain('בְּמַאי קָמִיפַּלְגִי');
  });
});

describe('VoiceGroupBody', () => {
  it('renders the collective name, Hebrew twin, and bio', () => {
    const { container } = render(() => (
      <VoiceGroupBody group={{ name: 'The Stam', nameHe: 'הסתם', bio: 'The anonymous voice of the Gemara.' }} />
    ));
    expect(container.querySelector('h3')!.textContent).toBe('The Stam');
    expect(container.querySelector('p[dir="rtl"]')!.textContent).toContain('הסתם');
    expect(container.textContent).toContain('The anonymous voice of the Gemara.');
  });
});
