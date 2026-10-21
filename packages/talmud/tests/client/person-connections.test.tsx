import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergePersonConnections, PersonConnections } from '../../src/client/PersonConnections';
import { generationRange } from '../../src/client/PersonEra';
import type { SageInteractions } from '../../src/client/sageInteractions';
import { parseSourcePersonHash } from '../../src/lib/sage-graph/reading-pins';
import fixture from '../fixtures/person-connections.json';
import teaching from '../fixtures/reviewed-teaching-connection.json';

describe('person connection summary from saved public records', () => {
  it('counts one passage even when it contains both a family link and an encounter', () => {
    const result = mergePersonConnections('rav-pappa', fixture.graph, null);
    const huna = result.partners.find((p) => p.slug === 'local:b042-p3/B');
    expect(huna?.total).toBe(1);
    expect(huna?.kinds).toEqual({ direct: 1, kin: 1 });
    expect(huna?.out).toEqual({});
  });
  it('preserves the older counts without counting checked evidence again', () => {
    const summary = fixture.summary as SageInteractions;
    const result = mergePersonConnections('rav-pappa', fixture.graph, summary);
    for (const partner of summary.partners) expect(result.partners).toContainEqual(partner);
    expect(result.partners.filter((p) => p.slug?.startsWith('local:'))).toHaveLength(3);
    expect(mergePersonConnections('rav-pappa', fixture.graph, result)).toEqual(result);
  });
  it('only includes connections involving the requested person', () => {
    const result = mergePersonConnections('local:b042-p3/B', fixture.graph, null);
    expect(result.partners.map((p) => p.slug)).toEqual(['rav-pappa']);
  });
  it('shows a reviewed attribution as passing on a teaching in the right direction', () => {
    const connection = teaching.graph.connections[0];
    const speaker = mergePersonConnections(connection.a, teaching.graph, null).partners[0];
    expect(speaker.kinds).toEqual({ cites: 1 });
    expect(speaker.out).toEqual({ cites: 1 });
    expect(speaker.in).toEqual({ cites: 0 });
    expect(speaker.refs).toEqual({ cites: [connection.ref] });
    const teacher = mergePersonConnections(connection.b, teaching.graph, null).partners[0];
    expect(teacher.kinds).toEqual({ cites: 1 });
    expect(teacher.in).toEqual({ cites: 1 });
    expect(teacher.out).toEqual({ cites: 0 });
  });
  it('keeps an empty result empty', () => {
    expect(mergePersonConnections('rav-pappa', null, null).partners).toEqual([]);
  });
});
describe('generation dates', () => {
  it('handles a range crossing BCE and CE', () =>
    expect(generationRange('c. 170 BCE – 10 CE')).toEqual([-170, 10]));
  it('does not invent an end date for an open era', () =>
    expect(generationRange('c. 1500 CE –')).toBeNull());
});

describe('links from a person card to the people it connects', () => {
  const revision = fixture.graph.revision;
  // The saved graph, with its local nodes marked as having a source profile so their card links show.
  const withProfiles = {
    ...fixture.graph,
    nodes: fixture.graph.nodes.map((n) =>
      n.id.startsWith('local:') ? { ...n, hasSourceProfile: true } : n,
    ),
  };
  const open = async (pins?: {
    revision: string;
    bavliRevision: string;
    otherRevision: string;
  }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).startsWith('/api/sage-graph/checked')
          ? new Response(JSON.stringify(withProfiles))
          : new Response('{}', { status: 404 }),
      ),
    );
    const { container } = render(() => <PersonConnections id="rav-pappa" pins={pins} />);
    await waitFor(() => expect(container.querySelector('button[aria-expanded]')).toBeTruthy());
    for (const row of container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'))
      fireEvent.click(row);
    return [...container.querySelectorAll<HTMLAnchorElement>('a[href^="#source-person/"]')];
  };
  afterEach(() => vi.unstubAllGlobals());

  it('pass on the revisions the card was read with', async () => {
    const pins = {
      revision,
      bavliRevision: 'source-readings-bavli-00000000000000000001',
      otherRevision: 'none',
    };
    const links = await open(pins);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links)
      expect(parseSourcePersonHash(link.getAttribute('href')!).pins).toEqual(pins);
  });

  it('read the graph revision they came from, and no store, when the card had no pins', async () => {
    const links = await open();
    expect(links.length).toBeGreaterThan(0);
    for (const link of links)
      expect(parseSourcePersonHash(link.getAttribute('href')!).pins).toEqual({
        revision,
        bavliRevision: 'none',
        otherRevision: 'none',
      });
  });
});
