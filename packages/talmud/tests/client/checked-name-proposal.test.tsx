import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { PersonReadingBasis } from '../../src/client/PersonReadingBasis';
import { checkedPerson, decodeCheckedPassage } from '../../src/lib/sage-graph/checked-readings';
import { checkedNameProposal } from '../../src/lib/sage-graph/name-candidates';
import type { StoredRow } from '../../src/lib/sage-graph/source-reading-store';
import suggestions from '../fixtures/checked-name-candidates.json';
import additional from '../fixtures/checked-source-additional.json';
import fixture from '../fixtures/checked-source-store.json';

// Exact stored checked rows from the approved release, and real name_candidates records made for them.
const rows = [...fixture.rows, ...additional.rows] as StoredRow[];

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
  const person = checkedPerson('graph', passage, localId)!;
  person.initialReading!.proposals = [
    (await checkedNameProposal(record, passage, localId, 'bavli'))!,
  ];
  return person.initialReading!;
}

describe('checked person card basis', () => {
  it('shows an exact full name as a possible identity with a link', async () => {
    const reading = await card('רמי בר חמא');
    const view = render(() => <PersonReadingBasis reading={reading} />);
    expect(view.container.textContent).toContain('Possible identity: Rav Rami bar Hama');
    expect(view.container.querySelector('a[href="#sages/rav-rami-bar-hama"]')).toBeTruthy();
    expect(view.container.textContent).not.toContain('Reviewed identity');
  });
  it('lists a few registry entries for a short name and counts the rest', async () => {
    const reading = await card('רבי יוסי');
    const view = render(() => <PersonReadingBasis reading={reading} />);
    const text = view.container.textContent!;
    expect(text).toContain('Registry entries with this name (none is chosen):');
    expect(text).toContain('and 8 more');
    expect(view.container.querySelectorAll('a[href^="#sages/"]')).toHaveLength(12);
    expect(text).not.toContain('Possible identity');
  });
});
