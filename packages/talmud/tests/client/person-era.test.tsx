// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { PersonEra } from '../../src/client/PersonEra';
import saved from '../fixtures/reviewed-kahana-era.json';

const era = saved.sourceProfile.era;

describe('reviewed era display', () => {
  it('keeps the saved source range ahead of an inherited generation', () => {
    // Deliberately add a conflicting generation to the saved Kahana era.
    const { container } = render(() => <PersonEra generation="amora-bavel-6" reviewed={era} />);
    expect(container.querySelector('.person-era-heading span')).toBeNull();
    expect(container.querySelector('.person-era-caption')?.textContent).toBe(era.label);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(era.source.url);
    const bar = container.querySelector('.person-era-range') as HTMLElement;
    expect(Number.parseFloat(bar.style.left)).toBeCloseTo(100 / 3);
    expect(Number.parseFloat(bar.style.width)).toBeCloseTo(100 / 3);
  });

  it('keeps generation dates when no reviewed range is available', () => {
    const { container } = render(() => <PersonEra generation="amora-bavel-6" />);
    expect(container.querySelector('.person-era-heading span')?.textContent).toBeTruthy();
  });
});
