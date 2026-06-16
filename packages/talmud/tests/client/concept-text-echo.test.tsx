// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import {
  buildConceptMatcher,
  ConceptLinkProvider,
  ConceptText,
} from '../../src/client/conceptLinks';
import type { IdentifiedRabbi } from '../../src/client/dafContext';
import { RabbiText } from '../../src/client/rabbiLinks';
import { globalTerms } from '../../src/lib/terms/registry';

// Real-component regression guard for the "double Hebrew" leak — a Hebrew term
// followed by a near-duplicate Hebrew parenthetical, e.g. "a טרפה (טריפה)". This
// renders the ACTUAL ConceptText / RabbiText components (not a hand-rolled copy
// of their pipeline), so it fails if the whole-string stripEchoParens call is
// ever removed from ConceptText. The tooltip only mounts on hover/focus, so the
// default textContent is exactly the visible prose.
//
// Why the per-fragment echo strip in Hebraized isn't enough: the parenthetical
// טריפה matches a registry surface, so tokenizeWithMatcher pulls it out as its
// own concept mention — splitting the "term (term)" pair across the tokenize
// boundary before any per-fragment strip can see it.

const matcher = buildConceptMatcher(globalTerms());

const RAV_ACHA: IdentifiedRabbi[] = [
  { name: 'Rav Acha', nameHe: 'רב אחא', mentions: [] } as unknown as IdentifiedRabbi,
];

describe('ConceptText — collapses double-Hebrew gloss in the rendered DOM', () => {
  it('male/chaser echo (defective inline, full in paren) collapses', () => {
    const { container } = render(() => (
      <ConceptText text="renders the animal a טרפה (טריפה)." matcher={matcher} />
    ));
    expect(container.textContent).toBe('renders the animal a טרפה.');
    expect(container.textContent).not.toContain('(טריפה)');
  });

  it('identical echo whose paren matches a registry surface collapses', () => {
    // Both spell טריפה fully; both would tokenize as concept mentions, so only a
    // whole-string pass before tokenization can collapse them.
    const { container } = render(() => <ConceptText text="a טריפה (טריפה)." matcher={matcher} />);
    expect(container.textContent).toBe('a טריפה.');
  });

  it('keeps a genuine Hebrew clarification that adds new words', () => {
    const { container } = render(() => (
      <ConceptText text="the מלא צואר (מלא צואר וחוץ לצואר) case" matcher={matcher} />
    ));
    expect(container.textContent).toBe('the מלא צואר (מלא צואר וחוץ לצואר) case');
  });

  it('keeps a Form B English→Hebrew gloss', () => {
    const { container } = render(() => (
      <ConceptText text="the court (בית דין) ruled." matcher={matcher} />
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
          text="Rav Acha declares the animal a טרפה (טריפה)."
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
});
