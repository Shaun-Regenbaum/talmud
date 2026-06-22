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
    const NoopObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    // jsdom lacks both; the scroll-spy and the graph's fit-to-width need them.
    vi.stubGlobal('IntersectionObserver', NoopObserver);
    vi.stubGlobal('ResizeObserver', NoopObserver);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        let body: unknown = {};
        if (u.includes('/api/enrichments')) {
          body = {
            enrichments: [
              { id: 'rabbi.bio', mark: 'rabbi', mode: 'augment-content', scope: 'global' },
            ],
          };
        } else if (u.includes('/api/marks')) {
          body = { marks: [{ id: 'rabbi', label: 'Rabbi', dependencies: ['gemara'] }] };
        } else if (u.includes('/api/daf-view')) {
          body = {
            pieces: {
              argument: {
                parsed: {
                  instances: [
                    { startSegIdx: 0, endSegIdx: 4, fields: { title: 'Opening Mishnah' } },
                  ],
                },
              },
            },
          };
        }
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
    // chapter rail labels (render synchronously)
    expect(text).toContain('The model, shown');
    expect(text).toContain('The build graph');
    expect(text).toContain('Every enrichment');
    expect(text).toContain('Caching & freshness');
    expect(root.querySelector('.hiw-rail')).toBeTruthy();
    root.remove();
  });

  it('renders the worked-example section cards once the daf-view resolves', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    dispose = render(() => <HowItWorksPage />, root);
    // let the registry + daf-view resources resolve and Solid flush
    await new Promise((r) => setTimeout(r, 30));
    expect(root.textContent ?? '').toContain('Opening Mishnah');
    root.remove();
  });
});
