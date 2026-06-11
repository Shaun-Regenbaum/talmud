// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import {
  AuthorityBadge,
  ProvenanceSection,
  StalenessDot,
  stalenessTitle,
  type TreeNode,
} from '../../src/client/runTreeShared';

describe('stalenessTitle', () => {
  it('names WHY for each verdict', () => {
    expect(stalenessTitle('fresh')).toContain('recipe unchanged');
    expect(stalenessTitle('stale-recipe')).toContain('recipe changed');
    expect(stalenessTitle('stale-inputs', ['argument.background', 'rabbi'])).toContain(
      'inputs changed: argument.background, rabbi',
    );
    expect(stalenessTitle('unknown')).toContain('recipe stamp');
    expect(stalenessTitle('unknown', null, true)).toContain('marks');
  });
});

describe('StalenessDot', () => {
  it('renders a filled dot with the verdict tooltip', () => {
    const { container } = render(() => (
      <StalenessDot staleness="stale-inputs" inputsChanged={['rabbi']} />
    ));
    const dot = container.querySelector('span')!;
    expect(dot.getAttribute('data-staleness')).toBe('stale-inputs');
    expect(dot.getAttribute('title')).toContain('inputs changed: rabbi');
    expect(dot.style.getPropertyValue('background')).toBeTruthy();
  });

  it('renders unknown as a hollow dot', () => {
    const { container } = render(() => <StalenessDot staleness="unknown" />);
    const dot = container.querySelector('span')!;
    expect(dot.style.getPropertyValue('background')).toBe('transparent');
    // jsdom normalizes the hex to rgb(); assert the hollow border is drawn
    expect(dot.style.getPropertyValue('border')).toContain('1.5px solid');
  });
});

describe('AuthorityBadge', () => {
  it('labels the glyph with the authority', () => {
    const { container } = render(() => <AuthorityBadge authority="human" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toBe('authority: human');
    expect(svg.querySelector('title')?.textContent).toContain('human-authored');
  });
});

describe('ProvenanceSection', () => {
  const node: TreeNode = {
    id: 'argument-overview.synthesis',
    label: 'Synthesis',
    kind: 'llm',
    producer: 'enrichment',
    model: 'openrouter/test/model',
    cached: true,
    cold_ms: 1234,
    cost: 0.001,
    tokens: 150,
    authority: 'ai',
    staleness: 'stale-inputs',
    createdAt: '2026-06-01T00:00:00.000Z',
    recipeHash: 'abcdef123456',
    inputs: [
      { sourceKey: 'argument', status: 'changed' },
      { sourceKey: 'rabbi', status: 'same' },
    ],
    inputsChanged: ['argument'],
  };

  it('shows authority, model, createdAt, recipe hash and highlights changed inputs', () => {
    const { container } = render(() => <ProvenanceSection node={node} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Provenance');
    expect(text).toContain('ai');
    expect(text).toContain('openrouter/test/model');
    expect(text).toContain('2026-06-01T00:00:00.000Z');
    expect(text).toContain('abcdef123456');
    const chips = [...container.querySelectorAll('span[title]')].filter((el) =>
      ['argument', 'rabbi'].includes(el.textContent ?? ''),
    );
    const changed = chips.find((el) => el.textContent === 'argument') as HTMLElement;
    const same = chips.find((el) => el.textContent === 'rabbi') as HTMLElement;
    expect(changed.title).toContain('moved since generation');
    expect(same.title).toContain('unchanged');
    expect(changed.style.getPropertyValue('font-weight')).toBe('600');
  });

  it('renders nothing for a node without provenance fields (older payloads)', () => {
    const bare: TreeNode = {
      id: 'gemara',
      label: 'gemara',
      kind: 'source',
      cached: true,
      cold_ms: null,
      cost: null,
      tokens: null,
    };
    const { container } = render(() => <ProvenanceSection node={bare} />);
    expect(container.textContent).toBe('');
  });
});
