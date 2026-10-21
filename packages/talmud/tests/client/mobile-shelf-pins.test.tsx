import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileShelf } from '../../src/client/MobileShelf';
import { PagePins } from '../../src/client/pagePins';
import type { ReadingPins } from '../../src/lib/sage-graph/reading-pins';
// Real stronger8 v4 reading of job v18-bavli-005 (Eruvin 29a:15); see fixture.hebrew.
import fixture from '../fixtures/source-reading-stores.json';

const pins: ReadingPins = {
  revision: 'sage-graph-00000000000000000000',
  bavliRevision: 'source-readings-bavli-00000000000000000001',
  otherRevision: 'none',
};
const passage = (
  fixture.hebrew as Record<'v4', { stored: { kind: string; ref: string; passage_id: string }[] }>
).v4.stored.find((r) => r.kind === 'passage' && r.ref === 'Eruvin 29a:15')!;
const id = `reading:${passage.passage_id}/p3`;

afterEach(() => vi.unstubAllGlobals());

describe('a person card in the phone shelf', () => {
  it('reads nothing until the page has its revisions, then exactly those', async () => {
    const fetch = vi.fn(async (_url: string) => new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    const [page, setPage] = createSignal<{ pins?: ReadingPins; loading: boolean }>({
      loading: true,
    });
    const noop = () => undefined;
    render(() => (
      <PagePins.Provider
        value={{
          required: true,
          pins: () => page().pins,
          loading: () => page().loading,
          retry: noop,
        }}
      >
        <MobileShelf
          sidebar={{ kind: 'source-person', id }}
          onCloseExpansion={noop}
          tractate="Eruvin"
          page="29a"
          activeRabbi={null}
          onHighlightRabbi={noop}
          onPushRabbi={noop}
          previousLabel={null}
          onBack={noop}
          dafRabbis={[]}
          dafRabbiNames={[]}
          glossaryTerms={[]}
          onOpenRabbiSlug={noop}
          generationByName={new Map()}
        />
      </PagePins.Provider>
    ));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetch).not.toHaveBeenCalled();
    setPage({ loading: false, pins });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const url = new URL(String(fetch.mock.calls[0][0]), 'https://talmud.dev');
    expect(Object.fromEntries(url.searchParams)).toEqual({ id, ...pins });
  });

  it('is given the page revisions by the daf viewer, on phones as on desktop', () => {
    const viewer = readFileSync(join(__dirname, '../../src/client/DafViewer.tsx'), 'utf8');
    expect(viewer).toMatch(/<PagePins\.Provider value=\{pageRevisions\}>\s*<MobileShelf\b/);
    expect(viewer).toMatch(/<PagePins\.Provider value=\{pageRevisions\}>\s*<ArgumentSidebar\b/);
  });
});
