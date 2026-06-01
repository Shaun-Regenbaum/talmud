// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { RabbiText } from '../../src/client/rabbiLinks';
import type { IdentifiedRabbi } from '../../src/client/dafContext';

const RABBIS: IdentifiedRabbi[] = [
  { name: 'Rabban Gamliel', nameHe: 'רבן גמליאל', mentions: [] } as unknown as IdentifiedRabbi,
];

describe('RabbiText copy-friendliness', () => {
  it('renders a matched rabbi name as an inline copyable element (not a <button>)', () => {
    const { container } = render(() => (
      <RabbiText text="Rabban Gamliel ruled leniently." rabbis={RABBIS} onPushRabbi={() => {}} />
    ));
    // The name must be in the text flow so it survives select+copy of the prose.
    expect(container.textContent).toContain('Rabban Gamliel');
    // It must NOT be a <button> (atomic, dropped on copy).
    expect(container.querySelector('button')).toBeNull();
    const link = container.querySelector('[role="link"]') as HTMLElement;
    expect(link).toBeTruthy();
    expect(link.textContent).toBe('Rabban Gamliel');
  });

  it('still routes on click', () => {
    const onPush = vi.fn();
    const { container } = render(() => (
      <RabbiText text="see Rabban Gamliel here" rabbis={RABBIS} onPushRabbi={onPush} />
    ));
    (container.querySelector('[role="link"]') as HTMLElement).click();
    expect(onPush).toHaveBeenCalledWith('Rabban Gamliel');
  });
});
