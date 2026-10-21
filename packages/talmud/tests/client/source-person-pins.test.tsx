import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourcePerson } from '../../src/client/SourcePerson';
import {
  initialPerson,
  type ReadingClaim,
  type ReadingPerson,
} from '../../src/lib/sage-graph/initial-readings';
import { parseSourcePersonHash } from '../../src/lib/sage-graph/reading-pins';
import {
  applyReadingCoverage,
  type ReadingCoverage,
} from '../../src/lib/sage-graph/source-reading-coverage';
import { decodeStoredPassage, type StoredRow } from '../../src/lib/sage-graph/source-reading-store';
// Real stronger8 v4 readings of job v18-bavli-005 (Eruvin 29a:15); see fixture.hebrew.
import fixture from '../fixtures/source-reading-stores.json';

const pins = {
  revision: 'sage-graph-00000000000000000000',
  bavliRevision: 'source-readings-bavli-00000000000000000001',
  otherRevision: 'none',
};

/** The card the server sends for רבה, built from the real stored rows by the same decoder. */
async function rabbahCard() {
  const rows = (fixture.hebrew as Record<'v4', { stored: StoredRow[] }>).v4.stored;
  const passage = rows.find((r) => r.kind === 'passage' && r.ref === 'Eruvin 29a:15')!;
  const decoded = await decodeStoredPassage(
    passage.passage_id!,
    rows.filter((r) => r.passage_id === passage.passage_id),
  );
  const data = (kind: string) =>
    decoded.filter((r) => r.kind === kind).map((r) => JSON.parse(r.payload_json));
  // As the server does: owned sources publish their mentions and evidence.
  const { people, claims } = applyReadingCoverage(
    passage.passage_id!,
    data('source_reading')[0].provenance.jobSha256,
    data('passage')[0].sourceSegments,
    data('source_reading_coverage')[0] as ReadingCoverage,
    data('person') as ReadingPerson[],
    data('claim') as ReadingClaim[],
  );
  const id = people.find((p) => p.label === 'רבה')!.id;
  const card = initialPerson(pins.revision, passage.passage_id!, id, people, claims, []);
  return { ...card!, sourceRevisions: { bavli: pins.bavliRevision, other: null } };
}

afterEach(() => vi.unstubAllGlobals());

describe('a person card opened from a page', () => {
  it('asks for the page revisions and passes them to every person link', async () => {
    const card = await rabbahCard();
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(card)));
    vi.stubGlobal('fetch', fetch);
    const { container } = render(() => <SourcePerson id={card.id} pins={pins} />);
    await waitFor(() => expect(container.querySelector('h2')?.textContent).toBe('רבה'));
    const url = new URL(String(fetch.mock.calls[0][0]), 'https://talmud.dev');
    expect(Object.fromEntries(url.searchParams)).toEqual({ id: card.id, ...pins });
    // One partner, רב יוסף, counted once; opening the row shows the link to its card.
    const row = container.querySelector<HTMLButtonElement>(
      '.person-connections button[aria-expanded]',
    )!;
    expect(row.textContent).toContain('רב יוסף');
    fireEvent.click(row);
    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="#source-person/"]')];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links)
      expect(parseSourcePersonHash(link.getAttribute('href')!).pins).toEqual(pins);
  });

  it('shows an error for a missing revision and never asks again without it', async () => {
    const card = await rabbahCard();
    const fetch = vi.fn(
      async (_url: string) =>
        new Response('{"error":"No verified source reading revision was found"}', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetch);
    const { container } = render(() => <SourcePerson id={card.id} pins={pins} />);
    await waitFor(() =>
      expect(container.querySelector('.source-person')?.textContent).toBeTruthy(),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(String(fetch.mock.calls[0][0])).toContain(`bavliRevision=${pins.bavliRevision}`);
  });
});
