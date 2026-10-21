import { render, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourcePerson } from '../../src/client/SourcePerson';
import { checkedPerson, decodeCheckedPassage } from '../../src/lib/sage-graph/checked-readings';
import { checkedNameSuggestion } from '../../src/lib/sage-graph/name-candidates';
import type { StoredRow } from '../../src/lib/sage-graph/source-reading-store';
import suggestions from '../fixtures/checked-name-candidates.json';
import additional from '../fixtures/checked-source-additional.json';
import fixture from '../fixtures/checked-source-store.json';

// Exact stored checked rows from the approved release, and real name_candidates records made for them.
const rows = [...fixture.rows, ...additional.rows] as StoredRow[];
const pins = {
  revision: 'sage-graph-00000000000000000000',
  bavliRevision: fixture.stores.bavli.revision,
  otherRevision: fixture.stores.other.revision,
};

/** The checked card the server sends for one person, with the graph's suggestion added as the server adds it. */
async function card(label: string) {
  const record = (suggestions.rows as StoredRow[]).find(
    (r) => JSON.parse(r.payload_json).readingLabel === label,
  )!;
  const [passageId, localId] = record.subject_id!.split('/');
  const passage = await decodeCheckedPassage(
    passageId,
    rows.filter((r) => r.passage_id === passageId),
  );
  const person = checkedPerson(pins.revision, passage, localId)!;
  person.initialReading!.nameSuggestion = await checkedNameSuggestion(
    record,
    passage,
    localId,
    'bavli',
    [],
  );
  return { ...person, sourceRevisions: { bavli: pins.bavliRevision, other: pins.otherRevision } };
}

async function shown(label: string) {
  const data = await card(label);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(data))),
  );
  const view = render(() => <SourcePerson id={data.id} pins={pins} />);
  await waitFor(() => expect(view.container.querySelector('.person-name-suggestion')).toBeTruthy());
  const section = view.container.querySelector('.person-name-suggestion')!;
  // Registry evidence stays available inside the reading details, below era and biography.
  expect(section.closest('details')?.open).toBe(false);
  return { section, card: view.container };
}

afterEach(() => vi.unstubAllGlobals());

describe('a checked person card with a registry lookup', () => {
  it('shows one exact full name as a possible identity that is not confirmed', async () => {
    const { section, card } = await shown('רמי בר חמא');
    expect(section.textContent).toContain('Possible identity, not confirmed: Rav Rami bar Hama');
    expect(section.querySelector('a[href="#sages/rav-rami-bar-hama"]')).toBeTruthy();
    expect(card.textContent).not.toContain('Reviewed identity');
  });
  it('lists a few registry entries for a short name, chooses none, and counts the rest', async () => {
    const { section } = await shown('רבי יוסי');
    expect(section.textContent).toContain('Not identified yet.');
    expect(section.textContent).toContain('None is chosen, and the person may not be among them:');
    expect(section.textContent).toContain('and 8 more');
    expect(section.querySelectorAll('a[href^="#sages/"]')).toHaveLength(12);
    expect(section.textContent).not.toContain('Possible identity');
  });
  it('gives only the reason for a father inside a patronymic', async () => {
    const { section } = await shown('חמא');
    expect(section.textContent).toContain('Not identified yet.');
    expect(section.textContent).toContain('Named only as a father inside a patronymic');
    expect(section.querySelectorAll('a')).toHaveLength(0);
  });
});
