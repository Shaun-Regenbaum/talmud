// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RABBI_BLOCKS,
  RABBI_RECIPE,
  rabbiDisplayInstance,
  rabbiSynthInstance,
} from '../../src/client/ArgumentSidebar';
import type { IdentifiedRabbi } from '../../src/client/dafContext';
import { setLang } from '../../src/client/i18n';
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

const renderCard = () =>
  render(() => (
    <SidebarCardFromHint
      recipe={RABBI_RECIPE}
      instance={rabbiDisplayInstance(rabbi)}
      synthInstance={rabbiSynthInstance(rabbi)}
      instanceKey={rabbi.name}
      tractate="Shabbat"
      page="125b"
      specialBlocks={RABBI_BLOCKS}
      extras={{ generationByName: new Map() }}
    />
  ));

describe('Rabbi recipe card — name-flip', () => {
  it('English mode: Latin name is the LTR title, Hebrew name is the RTL subtitle', () => {
    const { container } = renderCard();
    const h3 = container.querySelector('h3')!;
    expect(h3.textContent).toBe('Rabbi Yochanan');
    expect(h3.getAttribute('dir')).toBeNull();
    const sub = container.querySelector('p[dir="rtl"]')!;
    expect(sub.textContent).toContain('ר׳ יוחנן');
  });

  it('Hebrew mode: Hebrew name becomes the RTL title, Latin name the LTR subtitle', () => {
    setLang('he');
    const { container } = renderCard();
    const h3 = container.querySelector('h3')!;
    expect(h3.textContent).toBe('ר׳ יוחנן');
    expect(h3.getAttribute('dir')).toBe('rtl');
    // secondary line is now the Latin name, rendered LTR
    const sub = container.querySelector('h3 + p')!;
    expect(sub.getAttribute('dir')).toBeNull();
    expect(sub.textContent).toBe('Rabbi Yochanan');
  });

  it('declares the meta + lineage + geography + observations blocks around the synthesis (flip=rabbi)', () => {
    expect(RABBI_RECIPE.flip).toBe('rabbi');
    const blocks = RABBI_RECIPE.sections.flatMap((s) => (s.type === 'special' ? [s.block] : []));
    expect(blocks).toEqual([
      'rabbi-meta',
      'rabbi-lineage',
      'rabbi-geography',
      'rabbi-observations',
    ]);
    for (const b of blocks) expect(RABBI_BLOCKS[b]).toBeTypeOf('function');
  });
});
