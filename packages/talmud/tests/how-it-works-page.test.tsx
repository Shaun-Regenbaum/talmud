import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HowItWorksPage } from '../src/client/HowItWorksPage';

// A jsdom mount smoke test: proves the page renders without throwing through
// its real lifecycle (onMount + IntersectionObserver + the registry resource),
// and that the static walkthrough scaffold is present. The interactive graph
// itself is covered by how-it-works-graph.test.ts (the pure model).

describe('HowItWorksPage', () => {
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    // jsdom has no IntersectionObserver; the scroll-spy onMount needs one.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = String(url).includes('enrichments')
          ? {
              enrichments: [
                { id: 'rabbi.bio', mark: 'rabbi', mode: 'augment-content', scope: 'global' },
              ],
            }
          : { marks: [{ id: 'rabbi', label: 'Rabbi', dependencies: ['gemara'] }] };
        return { ok: true, json: async () => body } as Response;
      }),
    );
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.unstubAllGlobals();
  });

  it('mounts and renders the walkthrough scaffold', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    dispose = render(() => <HowItWorksPage />, root);
    const text = root.textContent ?? '';
    expect(text).toContain('How it works');
    expect(text).toContain('Four primitives');
    // a lifecycle step (renders synchronously, independent of the fetch)
    expect(text).toContain('Resolve inputs');
    // the chapter rail is present
    expect(root.querySelector('.hiw-rail')).toBeTruthy();
    root.remove();
  });
});
