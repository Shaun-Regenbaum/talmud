// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_DEFS,
  instanceKeyForContent,
  type SidebarContent,
  VoiceGroupBody,
} from '../../src/client/ArgumentSidebar';
import { setLang } from '../../src/client/i18n';
import type { Section } from '../../src/client/shapes';
import { SidebarCardFromHint } from '../../src/client/sidebar/primitives';

beforeEach(() => {
  setLang('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response),
  );
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

// The argument card now renders through the recipe (CARD_DEFS.argument +
// SidebarCardFromHint), so we drive it the same way the sidebar dispatch does.
describe('argument card (recipe)', () => {
  it('renders the section title heading and the Hebrew excerpt block', () => {
    const content: SidebarContent = { kind: 'argument', section, index: 0 };
    const def = CARD_DEFS.argument!;
    const { container } = render(() => (
      <SidebarCardFromHint
        recipe={def.recipe}
        instance={def.instance(content)}
        synthInstance={def.synthInstance?.(content)}
        instanceKey={instanceKeyForContent(content, 'Shabbat', '125b')!}
        tractate="Shabbat"
        page="125b"
        specialBlocks={def.blocks}
        extras={def.extras?.({
          content,
          generationByName: new Map(),
          onPushRabbi: noop,
          dafSections: [],
          onOpenArgument: undefined,
        })}
      />
    ));
    expect(container.querySelector('h3')!.textContent).toBe(
      'Dispute over the requirement of an action',
    );
    const excerpt = container.querySelector('p[dir="rtl"]')!;
    expect(excerpt.getAttribute('lang')).toBe('he');
    expect(excerpt.textContent).toContain('בְּמַאי קָמִיפַּלְגִי');
  });
});

describe('VoiceGroupBody', () => {
  it('renders the collective name, Hebrew twin, and bio', () => {
    const { container } = render(() => (
      <VoiceGroupBody
        group={{ name: 'The Stam', nameHe: 'הסתם', bio: 'The anonymous voice of the Gemara.' }}
      />
    ));
    expect(container.querySelector('h3')!.textContent).toBe('The Stam');
    expect(container.querySelector('p[dir="rtl"]')!.textContent).toContain('הסתם');
    expect(container.textContent).toContain('The anonymous voice of the Gemara.');
  });
});
