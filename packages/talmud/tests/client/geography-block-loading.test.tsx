// @vitest-environment jsdom
//
// The geography sidebar block's fallback branch: while a dependency mark (the
// rabbi mark) is still resolving, an empty/null model is NOT yet trustworthy —
// the block must show the LOADING line, not the terminal "no rabbis" copy
// (which would pin a false-empty until reload). Once loading settles and the
// model is still empty, the terminal copy shows. A non-empty model always
// renders the map regardless of loading.

import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GEOGRAPHY_BLOCKS, type GeographyExtras } from '../../src/client/ArgumentSidebar';
import { setLang, t } from '../../src/client/i18n';
import { buildGeoModel } from '../../src/lib/geographyModel';

beforeEach(() => setLang('en'));
afterEach(() => setLang('en'));

const Block = GEOGRAPHY_BLOCKS['geography-map'];

const baseExtras = (over: Partial<GeographyExtras>): GeographyExtras => ({
  model: null,
  loading: false,
  activeLocation: null,
  activePlace: null,
  generationByName: null,
  onHighlightLocation: () => {},
  onHighlightSingleRabbi: () => {},
  onHoverRabbi: () => {},
  onHighlightPlace: () => {},
  ...over,
});

const blockProps = (extras: GeographyExtras) => ({
  deps: {},
  anchors: {},
  synthesisResolved: false,
  instance: { fields: {} },
  tractate: 'Berakhot',
  page: '2a',
  instanceKey: 'Berakhot/2a',
  extras: extras as unknown as Record<string, unknown>,
});

describe('GeographyMapBlock — loading vs empty fallback', () => {
  it('shows the LOADING line (not the terminal empty copy) while a dep is resolving', () => {
    // model null + loading true = a dependency mark (rabbi) is still resolving.
    const { container } = render(() =>
      Block(blockProps(baseExtras({ model: null, loading: true }))),
    );
    const text = container.textContent ?? '';
    expect(text).toContain(t('geography.loading'));
    expect(text).not.toContain(t('geography.empty'));
  });

  it('shows the terminal EMPTY copy once loading settles with no placeable rabbis', () => {
    // An assembled-but-empty model (deps settled, genuinely rabbi-less daf).
    const empty = buildGeoModel([], []);
    expect(empty.empty).toBe(true);
    const { container } = render(() =>
      Block(blockProps(baseExtras({ model: empty, loading: false }))),
    );
    const text = container.textContent ?? '';
    expect(text).toContain(t('geography.empty'));
    expect(text).not.toContain(t('geography.loading'));
  });

  it('renders the map (two region SVGs) when the model is non-empty, even mid-load', () => {
    const model = buildGeoModel(
      [{ name: 'Rav Huna', slug: 'rav-huna', identity: { places: ['Sura'], region: 'bavel' } }],
      [{ name: 'Sura' }],
    );
    expect(model.empty).toBe(false);
    // loading still true — a non-empty model must NOT be hidden behind the
    // loading line; partial-but-present beats a spinner.
    const { container } = render(() => Block(blockProps(baseExtras({ model, loading: true }))));
    expect(container.querySelectorAll('svg').length).toBe(2);
    const text = container.textContent ?? '';
    expect(text).not.toContain(t('geography.loading'));
    expect(text).not.toContain(t('geography.empty'));
  });
});
