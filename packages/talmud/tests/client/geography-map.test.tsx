// @vitest-environment jsdom
//
// Smoke render of the rebuilt GeographyMap: real projected shapes from
// geoShapes.ts, model assembled by buildGeoModel. Asserts the structural
// pieces (two region SVGs, land + river paths, generation-colored rabbi
// dots, mention-sized city dots, migration rows) and the click wiring.

import { fireEvent, render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GeographyMap } from '../../src/client/GeographyMap';
import type { GenerationId } from '../../src/client/generations';
import { buildGeoModel } from '../../src/client/geographyData';
import { BAVEL_SHAPE, ISRAEL_SHAPE } from '../../src/client/geoShapes';
import { setLang } from '../../src/client/i18n';

beforeEach(() => setLang('en'));
afterEach(() => setLang('en'));

const model = buildGeoModel(
  [
    { name: 'Rav Huna', slug: 'rav-huna', identity: { places: ['Sura'], region: 'bavel' } },
    {
      name: 'Rabbi Zeira',
      identity: { places: ['Tiberias'], region: 'israel', moved: 'bavel->israel' },
    },
    { name: 'Mar Zutra', identity: { region: 'bavel' } }, // city unknown
  ],
  [{ name: 'Sura' }, { name: 'Sura' }],
);

const generationByName = new Map<string, GenerationId>([
  ['Rav Huna', 'amora-bavel-2'],
  ['Rabbi Zeira', 'amora-ey-3'],
]);

describe('GeographyMap (rebuilt)', () => {
  it('renders both region cards with land + river paths and all dots', () => {
    const { container, getByText } = render(() => (
      <GeographyMap
        model={model}
        activeLocation={null}
        onHighlightLocation={() => {}}
        generationByName={generationByName}
      />
    ));
    getByText('Eretz Yisrael');
    getByText('Bavel');
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
    const paths = Array.from(container.querySelectorAll('path')).map(
      (p) => p.getAttribute('d') ?? '',
    );
    for (const d of [...ISRAEL_SHAPE.landPaths, ...ISRAEL_SHAPE.riverPaths]) {
      expect(paths).toContain(d);
    }
    for (const d of [...BAVEL_SHAPE.landPaths, ...BAVEL_SHAPE.riverPaths]) {
      expect(paths).toContain(d);
    }
    // Dots: 2 city dots (Sura, Tiberias) + 3 rabbi dots (Huna, Zeira, Zutra).
    const titles = Array.from(container.querySelectorAll('circle > title')).map(
      (t) => t.textContent ?? '',
    );
    expect(titles.some((s) => s.includes('Sura') && s.includes('mentioned in daf'))).toBe(true);
    expect(titles.some((s) => s.startsWith('Rav Huna'))).toBe(true);
    expect(titles.some((s) => s.startsWith('Rabbi Zeira'))).toBe(true);
    expect(titles.some((s) => s.startsWith('Mar Zutra') && s.includes('city unknown'))).toBe(true);
    // Migration row for the registry-flagged mover.
    getByText('Migration');
    getByText('Rabbi Zeira');
  });

  it('wires rabbi-dot clicks to onHighlightSingleRabbi with name + slug', () => {
    let clicked: { name: string; slug?: string } | null = null;
    const { container } = render(() => (
      <GeographyMap
        model={model}
        activeLocation={null}
        onHighlightLocation={() => {}}
        onHighlightSingleRabbi={(name, slug) => {
          clicked = { name, slug };
        }}
        generationByName={generationByName}
      />
    ));
    const hunaDot = Array.from(container.querySelectorAll('circle')).find((c) =>
      c.querySelector('title')?.textContent?.startsWith('Rav Huna'),
    );
    expect(hunaDot).toBeTruthy();
    fireEvent.click(hunaDot as Element);
    // The slug rides along so the handler can open the RIGHT same-name
    // homonym (pushRabbi prefers a slug match).
    expect(clicked).toEqual({ name: 'Rav Huna', slug: 'rav-huna' });

    // A slugless rabbi (Mar Zutra, region-only) clicks through with
    // slug undefined.
    const zutraDot = Array.from(container.querySelectorAll('circle')).find((c) =>
      c.querySelector('title')?.textContent?.startsWith('Mar Zutra'),
    );
    expect(zutraDot).toBeTruthy();
    fireEvent.click(zutraDot as Element);
    expect(clicked).toEqual({ name: 'Mar Zutra', slug: undefined });
  });

  it('wires mentioned-city dots to onHighlightPlace with the RAW mark name', () => {
    let place: string | null = 'unset';
    const { container } = render(() => (
      <GeographyMap
        model={model}
        activeLocation={null}
        onHighlightLocation={() => {}}
        onHighlightPlace={(name) => {
          place = name;
        }}
        generationByName={generationByName}
      />
    ));
    const suraDot = Array.from(container.querySelectorAll('circle')).find((c) =>
      c.querySelector('title')?.textContent?.includes('mentioned in daf'),
    );
    expect(suraDot).toBeTruthy();
    fireEvent.click(suraDot as Element);
    expect(place).toBe('Sura');
  });
});
