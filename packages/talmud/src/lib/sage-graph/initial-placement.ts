import type { InitialOccurrence, ReadingAnchor } from './initial-readings';
import type { LegacyRow } from './legacy-readings';

export interface PlacementSource {
  key: string;
  ref: string;
  edition: string;
  segmentId: string;
  sourceSha256: string;
  text: string;
  bindingSha256: string;
}
export interface PlacementOccurrence extends InitialOccurrence {
  sourceKey: string;
  readingPersonId: string;
  start: number;
  end: number;
  offsetUnit: 'Unicode code points';
}
export interface InitialPlacement {
  version: 'initial-name-placement-v1';
  sources: PlacementSource[];
  occurrences: PlacementOccurrence[];
}
const hash = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const word = (s: string) => /[\p{L}\p{M}\p{N}]/u.test(s);
export function nameSpan(text: string, quote: string, label: string) {
  if (!quote || !(quote === label || (/^[ובכלמשדה]/u.test(quote) && quote.slice(1) === label)))
    return null;
  const at = text.indexOf(quote);
  if (at < 0 || text.indexOf(quote, at + 1) >= 0) return null;
  const chars = Array.from(text),
    start = Array.from(text.slice(0, at)).length,
    end = start + Array.from(quote).length;
  if (word(chars[start - 1] ?? '') || word(chars[end] ?? '')) return null;
  return { start, end };
}
interface Person {
  label: string;
  named: string;
  quote: string;
  quoteLocation: string;
  mentions?: ReadingAnchor[];
  reading?: { kind?: string; setting?: string };
}
interface Passage {
  ref: string;
  source: { passage: string };
  sourceSegments?: {
    source_id: string;
    ref: string;
    edition: string;
    sha256: string;
    text: string;
    provenance: { segment_id: string; piece?: unknown };
  }[];
}
interface Binding {
  version: string;
  passageId: string;
  ref: string;
  passagePayloadSha256: string;
  edition: string;
  segmentId: string;
  sourceSha256: string;
  ownershipManifestSha256: string[];
}
/** Only already-visible proposal cards can receive a source-bound word link. */
export async function initialPlacement(
  occurrences: InitialOccurrence[],
  rows: LegacyRow[],
  onSkip?: (reason: string) => void,
): Promise<InitialPlacement> {
  const sources = new Map<string, PlacementSource>(),
    placed: PlacementOccurrence[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.passageOnly) {
      onSkip?.('passage_only');
      continue;
    }
    if (occurrence.people.length !== 1) {
      onSkip?.('competing_people');
      continue;
    }
    if (occurrence.overlapsOtherReading) {
      onSkip?.('overlaps_another_reading');
      continue;
    }
    const id = occurrence.people[0].id;
    if (!/^(proposal|reading):/.test(id)) {
      onSkip?.('unsupported_id');
      continue;
    }
    const key = id.replace(/^(proposal|reading):/, ''),
      pid = key.split('/')[0];
    const personRow = rows.find((r) => r.record_id === `person:${key}`);
    const passageRow = rows.find((r) => r.record_id === `passage:${pid}`);
    if (
      !personRow ||
      !passageRow ||
      (await hash(personRow.payload_json)) !== personRow.payload_sha256 ||
      (await hash(passageRow.payload_json)) !== passageRow.payload_sha256
    ) {
      onSkip?.('source_record_missing_or_changed');
      continue;
    }
    const person = JSON.parse(personRow.payload_json) as Person;
    const passage = JSON.parse(passageRow.payload_json) as Passage;
    if (
      !['name', 'father_of_named'].includes(person.named) ||
      person.reading?.kind === 'not_a_person' ||
      person.reading?.setting === 'hypothetical'
    ) {
      onSkip?.('not_named_reported_person');
      continue;
    }
    let text: string, edition: string, segmentId: string, sourceHash: string, bindingHash: string;
    if (id.startsWith('reading:')) {
      const anchor = person.mentions?.find((m) => m.occurrenceKey === occurrence.key);
      const source = passage.sourceSegments?.find((s) => s.source_id === anchor?.source_id);
      const units = rows
        .filter((r) => r.kind === 'source_reading_unit' && r.passage_id === pid)
        .map((r) => ({ row: r, data: JSON.parse(r.payload_json) }));
      const unit = units.find((u) => u.data.sourceId === anchor?.source_id);
      // Split pieces need a reconstructed whole-segment layout proof before placement.
      if (
        !anchor ||
        !source ||
        source.provenance.piece ||
        !unit ||
        (await hash(unit.row.payload_json)) !== unit.row.payload_sha256 ||
        unit.data.version !== 'source-reading-coverage-v1' ||
        unit.data.passageId !== pid ||
        unit.data.segmentId !== source.provenance.segment_id ||
        unit.data.rawStart !== 0 ||
        unit.data.rawEnd !== Array.from(source.text).length ||
        unit.data.segmentSha256 !== source.sha256 ||
        !/^[a-f0-9]{64}$/.test(unit.data.ownershipManifestSha256) ||
        unit.data.sourceSha256 !== source.sha256 ||
        unit.data.edition !== source.edition ||
        unit.data.ref !== source.ref ||
        anchor.source_sha256 !== source.sha256 ||
        anchor.ref !== source.ref ||
        anchor.edition !== source.edition ||
        anchor.offset_unit !== 'Unicode code points' ||
        source.ref !== occurrence.ref ||
        Array.from(source.text).slice(anchor.start, anchor.end).join('') !== occurrence.quote
      ) {
        onSkip?.('owned_source_proof_missing');
        continue;
      }
      text = source.text;
      edition = source.edition;
      segmentId = source.provenance.segment_id;
      sourceHash = source.sha256;
      bindingHash = unit.row.payload_sha256;
    } else {
      if (
        person.quoteLocation !== 'passage' ||
        person.quote !== occurrence.quote ||
        passage.ref !== occurrence.ref
      ) {
        onSkip?.('legacy_quote_reference_mismatch');
        continue;
      }
      const bindings = rows.filter((r) => r.kind === 'source_binding' && r.passage_id === pid);
      if (
        bindings.length !== 1 ||
        (await hash(bindings[0].payload_json)) !== bindings[0].payload_sha256
      ) {
        onSkip?.('edition_binding_missing_or_changed');
        continue;
      }
      const binding = JSON.parse(bindings[0].payload_json) as Binding;
      if (
        binding.version !== 'legacy-source-binding-v1' ||
        binding.passageId !== pid ||
        binding.ref !== occurrence.ref ||
        binding.passagePayloadSha256 !== passageRow.payload_sha256 ||
        !binding.ownershipManifestSha256.length
      ) {
        onSkip?.('edition_binding_mismatch');
        continue;
      }
      text = passage.source.passage;
      edition = binding.edition;
      segmentId = binding.segmentId;
      sourceHash = binding.sourceSha256;
      bindingHash = bindings[0].payload_sha256;
    }
    if (
      !edition ||
      !segmentId ||
      !/^[a-f0-9]{64}$/.test(bindingHash) ||
      (await hash(text)) !== sourceHash
    ) {
      onSkip?.('source_checksum_mismatch');
      continue;
    }
    const span = nameSpan(text, occurrence.quote, person.label);
    if (!span) {
      onSkip?.('name_span_not_minimal_unique_whole_word');
      continue;
    }
    const sourceKey = await hash(JSON.stringify([occurrence.ref, edition, segmentId, sourceHash]));
    sources.set(sourceKey, {
      key: sourceKey,
      ref: occurrence.ref,
      edition,
      segmentId,
      sourceSha256: sourceHash,
      text,
      bindingSha256: bindingHash,
    });
    let targetId = id;
    if (id.startsWith('proposal:')) {
      const nodeRow = rows.find((r) => r.record_id === `graph_node:local:${key}`);
      if (nodeRow && (await hash(nodeRow.payload_json)) === nodeRow.payload_sha256) {
        const node = JSON.parse(nodeRow.payload_json);
        if (
          node.id === `local:${key}` &&
          node.personKeys?.includes(key) &&
          (!node.sourceProfile || node.sourceProfile.personKey === key)
        )
          targetId = node.id;
      }
    }
    placed.push({
      ...occurrence,
      people: [{ ...occurrence.people[0], id: targetId }],
      readingPersonId: id,
      sourceKey,
      ...span,
      offsetUnit: 'Unicode code points',
    });
  }
  const eligible = placed.filter(
    (p) =>
      !placed.some(
        (q) => q !== p && q.sourceKey === p.sourceKey && q.start < p.end && q.end > p.start,
      ),
  );
  for (const row of placed) if (!eligible.includes(row)) onSkip?.('overlapping_initial_names');
  return {
    version: 'initial-name-placement-v1',
    sources: [...sources.values()].filter((s) => eligible.some((p) => p.sourceKey === s.key)),
    occurrences: eligible,
  };
}
