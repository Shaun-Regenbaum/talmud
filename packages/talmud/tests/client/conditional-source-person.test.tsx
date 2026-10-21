import { render, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '../../src/client/i18n';
import { SourcePerson } from '../../src/client/SourcePerson';
import { checkedPerson, decodeCheckedPassage } from '../../src/lib/sage-graph/checked-readings';
import { checkedNameSuggestion } from '../../src/lib/sage-graph/name-candidates';
import {
  canonicalJson,
  type StoredRow,
  sha256,
} from '../../src/lib/sage-graph/source-reading-store';
import { RABBI_PLACES } from '../../src/worker/rabbi-places';
import additional from '../fixtures/checked-source-additional.json';
import fixture from '../fixtures/checked-source-store.json';
import suggestions from '../fixtures/conditional-profile-candidates.json';

// The actual checked Rami bar Hama card and stored registry biography. Fetch is a
// transport stub; no people, source quotations or biographical text are invented.
async function card(label = 'רמי בר חמא') {
  const row = (suggestions.rows as StoredRow[]).find(
    (r) => JSON.parse(r.payload_json).readingLabel === label,
  )!;
  const [pid, id] = row.subject_id!.split('/');
  const passage = await decodeCheckedPassage(
    pid,
    ([...fixture.rows, ...additional.rows] as StoredRow[]).filter((r) => r.passage_id === pid),
  );
  const person = checkedPerson('graph', passage, id)!;
  const proposal = (await checkedNameSuggestion(row, passage, id, 'bavli', []))!;
  person.initialReading!.nameSuggestion = proposal;
  const slug = proposal.candidate!.id;
  const entry = RABBI_PLACES.rabbis[slug];
  person.conditionalProfile = {
    status: 'available',
    candidateId: slug,
    name: entry.canonical,
    nameHe: entry.canonicalHe!,
    accepted: false,
    historicalIdentityResolved: false,
    generation: entry.generation ?? null,
    bio: entry.bio ?? null,
    places: entry.places,
    sources: [],
    proposal: {
      recordId: row.record_id,
      payloadSha256: row.payload_sha256,
      personKey: row.subject_id!,
      revision: 'graph',
    },
    registry: {
      recordId: `registry_person:${slug}`,
      payloadSha256: await sha256(canonicalJson(entry)),
      source: 'graph',
    },
  };
  return person;
}
afterEach(() => {
  vi.unstubAllGlobals();
  setLang('en');
});
describe('saved information for a possible identity', () => {
  it('uses the existing map for real saved places without a travel route', async () => {
    const person = await card('רב חייא בר אשי');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(person))),
    );
    const view = render(() => <SourcePerson id={person.id} />);
    await waitFor(() =>
      expect(view.container.querySelector('.person-places')?.textContent).toContain('Sura'),
    );
    expect(view.container.querySelector('.person-places')?.textContent).toContain(
      'No travel order is known',
    );
    expect(view.container.querySelector('.person-places svg')).toBeTruthy();
  });

  it('shows the real biography and uncertain era without changing local links', async () => {
    const person = await card();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(person))),
    );
    const view = render(() => <SourcePerson id={person.id} />);
    await waitFor(() =>
      expect(view.container.textContent).toContain(RABBI_PLACES.rabbis['rav-rami-bar-hama'].bio),
    );
    expect(view.container.textContent).toContain('These details apply if the match is correct');
    expect(view.container.querySelector('.person-era-range.uncertain')).toBeTruthy();
    expect(view.container.querySelector('.person-biography')?.textContent).not.toContain(
      'No biography is currently available',
    );
    expect(view.container.querySelector('.person-places')?.textContent).toContain(
      'No places are currently available',
    );
    expect(view.container.textContent).toContain(person.quote);
    expect(view.container.querySelector('.person-connections')).toBeTruthy();
  });
  it('keeps the profile conditional in Hebrew and clears it on navigation', async () => {
    const person = await card();
    const empty = { ...person, id: `${person.id}-without-profile`, conditionalProfile: undefined };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(JSON.stringify(url.includes('without-profile') ? empty : person)),
      ),
    );
    setLang('he');
    const [id, change] = createSignal(person.id);
    const view = render(() => <SourcePerson id={id()} />);
    await waitFor(() =>
      expect(view.container.textContent).toContain('פרטים אלה נכונים אם הזיהוי נכון'),
    );
    change(empty.id);
    await waitFor(() => expect(view.container.textContent).toContain('אין כרגע ביוגרפיה זמינה'));
    expect(view.container.textContent).not.toContain(
      person.conditionalProfile!.status === 'available' ? person.conditionalProfile!.bio! : '',
    );
  });
  it('shows a profile lookup error separately from a missing biography', async () => {
    const person = await card();
    person.conditionalProfile = { status: 'unavailable' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(person))),
    );
    const view = render(() => <SourcePerson id={person.id} />);
    await waitFor(() =>
      expect(view.container.textContent).toContain('Could not load the saved profile'),
    );
    expect(view.container.querySelector('button')).toBeTruthy();
  });
});
