// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import {
  buildConceptMatcher,
  ConceptLinkProvider,
  ConceptText,
  firstMentionGloss,
} from '../../src/client/conceptLinks';
import type { IdentifiedRabbi } from '../../src/client/dafContext';
import { finishDisplayText } from '../../src/client/displayText';
import { HebraizedWithRabbis, RabbiLinkProvider, RabbiText } from '../../src/client/rabbiLinks';
import { globalTerms } from '../../src/lib/terms/registry';

// Prepare a whole paragraph before the concept and rabbi renderers split it
// into links. The tooltip only mounts on hover/focus, so textContent is the
// visible prose.

const matcher = buildConceptMatcher(globalTerms());
const prepare = (text: string) =>
  finishDisplayText(text, { cleanGlosses: (s) => firstMentionGloss(s, matcher) });

const RAV_ACHA: IdentifiedRabbi[] = [
  { name: 'Rav Acha', nameHe: 'רב אחא', mentions: [] } as unknown as IdentifiedRabbi,
];

describe('ConceptText — collapses double-Hebrew gloss in the rendered DOM', () => {
  it('male/chaser echo (defective inline, full in paren) collapses', () => {
    const { container } = render(() => (
      <ConceptText text={prepare('renders the animal a טרפה (טריפה).')} matcher={matcher} />
    ));
    expect(container.textContent).toBe('renders the animal a טרפה.');
    expect(container.textContent).not.toContain('(טריפה)');
  });

  it('identical echo whose paren matches a registry surface collapses', () => {
    const { container } = render(() => (
      <ConceptText text={prepare('a טריפה (טריפה).')} matcher={matcher} />
    ));
    expect(container.textContent).toBe('a טריפה (treif).');
  });

  it('keeps a genuine Hebrew clarification that adds new words', () => {
    const { container } = render(() => (
      <ConceptText text={prepare('the מלא צואר (מלא צואר וחוץ לצואר) case')} matcher={matcher} />
    ));
    expect(container.textContent).toBe('the מלא צואר (מלא צואר וחוץ לצואר) case');
  });

  it('keeps a Form B English→Hebrew gloss', () => {
    const { container } = render(() => (
      <ConceptText text={prepare('the court (בית דין) ruled.')} matcher={matcher} />
    ));
    expect(container.textContent).toBe('the court (בית דין) ruled.');
  });
});

describe('RabbiText — double-Hebrew collapses in reader prose with rabbi links', () => {
  it('collapses the echo in a non-rabbi fragment (the reported scenario)', () => {
    // Mirrors the screenshot: rabbi-linked prose where a term double-glosses.
    const { container } = render(() => (
      <ConceptLinkProvider value={{ matcher: () => matcher }}>
        <RabbiText
          text={prepare('Rav Acha declares the animal a טרפה (טריפה).')}
          rabbis={RAV_ACHA}
          onPushRabbi={() => {}}
        />
      </ConceptLinkProvider>
    ));
    expect(container.textContent).toBe('Rav Acha declares the animal a טרפה.');
    expect(container.textContent).not.toContain('(טריפה)');
    // The rabbi name still renders as a clickable link.
    expect((container.querySelector('[role="link"]') as HTMLElement)?.textContent).toBe('Rav Acha');
  });

  it('cleans an echo before a linked Hebrew name splits the paragraph', () => {
    const { container } = render(() => (
      <RabbiLinkProvider
        value={{
          rabbis: () => [],
          extraNames: () => ['רש״י'],
          onPushRabbi: () => {},
        }}
      >
        <HebraizedWithRabbis text="רש״י (רש״י) explains the passage." />
      </RabbiLinkProvider>
    ));
    expect(container.textContent).toBe('רש״י (Rashi) explains the passage.');
    expect(container.querySelector('[role="link"]')?.textContent).toBe('רש״י');
  });
});
