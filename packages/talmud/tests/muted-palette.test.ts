import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INK, RETIRED_BRIGHT } from '@corpus/ui/palette';
import { colorForKind, type ReaderIconKind } from '@corpus/ui/ReaderIcon';
import { describe, expect, it } from 'vitest';
import { ACCENTS } from '../src/client/sidebar/primitives';

const root = resolve(__dirname, '../../..');

/** Everything a reader sees beside the text. Admin tools, the usage charts and
 *  the reader's own highlight colors are left out on purpose. */
const READER_FILES = [
  'packages/talmud/src/client/ArgumentSidebar.tsx',
  'packages/talmud/src/client/ArgumentFlowGraph.tsx',
  'packages/talmud/src/client/ArgumentNarrative.tsx',
  'packages/talmud/src/client/rabbiLinks.tsx',
  'packages/talmud/src/client/LinkRef.tsx',
  'packages/talmud/src/client/flow/codeMapLayout.ts',
  'packages/talmud/src/client/SpineFlowGraph.tsx',
  'packages/talmud/src/client/RabbiGeographyCard.tsx',
  'packages/talmud/src/client/CommentaryPicker.tsx',
  'packages/talmud/src/client/ChartTableView.tsx',
  'packages/talmud/src/client/sidebar/primitives.tsx',
  'packages/talmud/src/client/geoMapBase.tsx',
  'packages/talmud/src/client/RabbiTrajectoryMap.tsx',
  'packages/talmud/src/client/SageNetworkSection.tsx',
  'packages/talmud/src/client/SagesPage.tsx',
  'packages/talmud/src/client/HowItWorksPage.tsx',
  'packages/talmud/src/client/HowItWorksGraph.tsx',
  'packages/talmud/src/client/WorkedExample.tsx',
  'packages/talmud/src/client/BugReport.tsx',
  'packages/talmud/src/client/RunTreeDock.tsx',
  'packages/talmud/src/client/styles.css',
  'packages/talmud/src/lib/daf-render/styles.css',
  'packages/tanach/src/lib/daf-render/styles.css',
  'packages/tanach/src/client/styles.css',
  'packages/ui/src/graph.css',
  'packages/ui/src/components.css',
  'packages/ui/src/loadprogress.css',
  'packages/ui/src/marginpod.css',
  'packages/ui/src/readingmap.css',
  'packages/ui/src/RunTree.tsx',
  'packages/ui/src/RunTreeCanvas.tsx',
  'packages/ui/src/RunTreeDag.tsx',
  'packages/ui/src/RunWaterfall.tsx',
];

/** The see-through versions of the retired colors, as rgba() prefixes. */
const RETIRED_TINTS = [
  '124,58,237',
  '30,64,175',
  '29,78,216',
  '59,130,246',
  '37,99,235',
  '15,118,110',
  '14,116,144',
  '217,119,6',
];

describe('muted inks', () => {
  it.each(READER_FILES)('%s uses no retired bright color', (file) => {
    const text = readFileSync(resolve(root, file), 'utf8').toLowerCase();
    const found = RETIRED_BRIGHT.filter((hex) => text.includes(hex));
    const compact = text.replace(/\s+/g, '');
    const tints = RETIRED_TINTS.filter((rgb) => compact.includes(`rgba(${rgb},`));
    expect([...found, ...tints]).toEqual([]);
  });

  it('gives stylesheets the same inks as the code', () => {
    const tokens = readFileSync(resolve(root, 'packages/ui/src/tokens.css'), 'utf8');
    const css = (name: string) => tokens.match(new RegExp(`--ink-${name}:\\s*(#[0-9a-f]{6})`))?.[1];
    expect(css('blue')).toBe(INK.blue);
    expect(css('plum')).toBe(INK.plum);
    expect(css('teal')).toBe(INK.teal);
    expect(css('cyan')).toBe(INK.cyan);
    expect(css('ochre')).toBe(INK.ochre);
    expect(css('moss')).toBe(INK.moss);
    expect(css('brick')).toBe(INK.brick);
    expect(css('slate')).toBe(INK.slate);
  });

  it('colors each icon and its card title with the same ink', () => {
    const inks = new Set<string>([...Object.values(INK), 'var(--accent)']);
    // The kinds that are BOTH a margin icon and a sidebar card. `as const` keeps
    // the literals so ACCENTS can be indexed; ReaderIconKind is still checked.
    const kinds = [
      'halacha',
      'aggadata',
      'yerushalmi',
      'pesuk',
      'rishonim',
      'chart',
    ] as const satisfies readonly ReaderIconKind[];
    for (const kind of kinds) {
      expect(inks.has(colorForKind(kind))).toBe(true);
      expect(ACCENTS[kind]).toBe(colorForKind(kind));
    }
  });
});
