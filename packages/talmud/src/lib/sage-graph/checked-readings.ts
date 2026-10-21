import type { InitialPlacement } from './initial-placement';
import {
  type InitialOccurrence,
  type InitialRelationship,
  initialPerson,
  type ReadingAnchor,
  type ReadingPerson,
  readingPersonId,
} from './initial-readings';
import {
  applyReadingCoverage,
  type OwnedReadingUnit,
  type ReadingCoverage,
} from './source-reading-coverage';
import { canonicalJson, occurrenceKey, type StoredRow, sha256 } from './source-reading-store';
import type { SourcePerson } from './types';

export const CHECKED_FORMAT = 'checked-source-store-v1';
export const CHECKED_KINDS = [
  'checked_reading',
  'checked_person',
  'checked_connection',
  'checked_decision',
  'checked_coverage',
  'checked_unit',
  'checked_ownership',
] as const;
const hex = /^[a-f0-9]{64}$/;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
interface Segment {
  source_id: string;
  ref: string;
  edition: string;
  sha256: string;
  text: string;
  provenance: {
    segment_id: string;
    focal?: boolean;
    piece?: { raw_start: number; raw_end: number; segment_text_sha256: string };
  };
}
interface Span {
  sourceId: string;
  edition: string;
  segmentId: string;
  sourceSha256: string;
  start: number;
  end: number;
  quote: string;
  offsetUnit: string;
  segmentStart: number;
  segmentEnd: number;
  segmentSha256: string;
}
export interface CheckedDirection {
  status: 'supported' | 'held' | 'symmetric';
  subject: string | null;
  object: string | null;
}
export interface CheckedDetail {
  broadType: 'direct_interaction' | 'intellectual_connection' | 'family' | 'transmission';
  direction: CheckedDirection;
  predicate: { status: 'supported' | 'held'; value: string | null };
  outcome: { status: 'supported' | 'held'; value: string | null };
  establishesMeeting: false;
}
interface Person {
  id: string;
  label: string;
  kind: string;
  form: string;
  setting: string;
  reason: string;
  mentions: (Span & {
    role: 'printed_name' | 'actor_description' | 'referential_evidence';
    namePlacementEligible: boolean;
  })[];
}
interface Connection extends CheckedDetail {
  id: string;
  participants: [string, string];
  evidence: Span[];
  reason: string;
}
export interface CheckedCoverage {
  sourceId: string;
  status: string;
  holes: string[];
}
interface Envelope {
  readingId: string;
  artifactHash: string;
  version: string;
  focal: number;
  segments: Segment[];
  contains: Record<string, string[]>;
  historicalIdentityAccepted: false;
  confirmedFacts: false;
  wholeReadingFullyChecked: boolean;
  binding: { jobHash: string; rawResultHash: string; rawFileSha256: string };
  supersedes: { rawResultHash: string; rawFileSha256: string };
}
export interface CheckedPassage {
  id: string;
  envelope: Envelope;
  people: ReadingPerson[];
  allMentions: Map<string, ReadingAnchor[]>;
  connections: { data: Connection; evidence: ReadingAnchor[] }[];
  coverage: CheckedCoverage[];
  units: OwnedReadingUnit[];
  stored: StoredRow[];
}

/** Decode only the explicit checked format. Raw source-reading schemas are unchanged. */
export async function decodeCheckedPassage(id: string, rows: StoredRow[]): Promise<CheckedPassage> {
  require(/^cs1-[a-f0-9]{64}$/.test(id), 'Invalid checked reading ID');
  const parsed: { row: StoredRow; data: ReturnType<typeof JSON.parse> }[] = [];
  for (const row of rows) {
    require(row.passage_id === id &&
      (CHECKED_KINDS as readonly string[]).includes(row.kind) &&
      row.authority === 'screening' &&
      row.decision === 'needs_review', 'Unexpected checked row');
    require((await sha256(row.payload_json)) === row.payload_sha256, 'Changed checked payload');
    const data = JSON.parse(row.payload_json);
    require(canonicalJson(data) === row.payload_json &&
      data.format === CHECKED_FORMAT, 'Invalid checked format');
    parsed.push({ row, data });
  }
  require(new Set(rows.map((r) => r.record_id)).size === rows.length, 'Duplicate checked record');
  const one = (kind: string) => {
    const found = parsed.filter((r) => r.row.kind === kind);
    require(found.length === 1, `Missing or duplicate ${kind}`);
    return found[0];
  };
  const reading = one('checked_reading');
  const envelope = reading.data as Envelope;
  require(reading.row.record_id === `checked_reading:${id}` &&
    envelope.readingId === id &&
    id === `cs1-${envelope.artifactHash}` &&
    envelope.version === 'checked-source-reading-v1' &&
    envelope.historicalIdentityAccepted === false &&
    envelope.confirmedFacts === false, 'Invalid checked envelope');
  require(hex.test(envelope.binding.jobHash) &&
    hex.test(envelope.supersedes.rawResultHash) &&
    hex.test(envelope.supersedes.rawFileSha256) &&
    envelope.supersedes.rawResultHash === envelope.binding.rawResultHash &&
    envelope.supersedes.rawFileSha256 ===
      envelope.binding.rawFileSha256, 'Invalid raw reading binding');
  const sources = envelope.segments;
  require(Array.isArray(sources) &&
    new Set(sources.map((s) => s.source_id)).size === sources.length &&
    Number.isInteger(envelope.focal) &&
    sources[envelope.focal]?.provenance.focal === true &&
    sources.filter((s) => s.provenance.focal).length === 1, 'Invalid checked sources');
  for (const s of sources)
    require((await sha256(s.text)) === s.sha256 && hex.test(s.sha256), 'Changed checked source');
  require(envelope.contains &&
    Object.keys(envelope.contains).sort().join() ===
      CHECKED_KINDS.filter((k) => k !== 'checked_reading')
        .sort()
        .join(), 'Missing checked item lists');
  for (const kind of CHECKED_KINDS.filter((k) => k !== 'checked_reading')) {
    const ids = envelope.contains[kind];
    const actual = rows
      .filter((r) => r.kind === kind)
      .map((r) => r.record_id)
      .sort();
    require(Array.isArray(ids) &&
      new Set(ids).size === ids.length &&
      canonicalJson([...ids].sort()) === canonicalJson(actual), 'Missing or changed checked item');
  }
  const exactIds = (kind: string) => {
    const ids = envelope.contains[kind];
    require(Array.isArray(ids) && new Set(ids).size === ids.length, 'Invalid checked item list');
    const found = parsed.filter((r) => r.row.kind === kind);
    require(found.length === ids.length &&
      found.every(
        (r) =>
          ids.includes(r.row.record_id) &&
          r.data.readingId === id &&
          r.row.record_id === `${kind}:${id}/${r.data.id}`,
      ), 'Missing or changed checked item');
    return found;
  };
  const personRows = exactIds('checked_person');
  const connectionRows = exactIds('checked_connection');
  exactIds('checked_decision');
  const coverageRow = one('checked_coverage');
  require(coverageRow.row.record_id === `checked_coverage:${id}` &&
    coverageRow.data.readingId === id &&
    coverageRow.data.wholeReadingFullyChecked ===
      envelope.wholeReadingFullyChecked, 'Invalid checked coverage');
  const coverage = coverageRow.data.sourceCoverage as CheckedCoverage[];
  require(Array.isArray(coverage) &&
    coverage.length === sources.length &&
    new Set(coverage.map((c) => c.sourceId)).size === sources.length &&
    coverage.every(
      (c) =>
        sources.some((s) => s.source_id === c.sourceId) &&
        ['reviewed', 'partial', 'unreviewed'].includes(c.status) &&
        Array.isArray(c.holes) &&
        c.holes.every((h) => typeof h === 'string'),
    ), 'Missing checked source coverage');
  if (envelope.wholeReadingFullyChecked)
    require(coverage.every((c) => c.status === 'reviewed' && !c.holes.length) &&
      !envelope.contains.checked_decision.length, 'Checked coverage overstates completion');
  const own = one('checked_ownership');
  const ownership = own.data as ReadingCoverage;
  require(own.row.record_id === `checked_ownership:${id}` &&
    ownership.passageId === id &&
    ownership.jobSha256 === envelope.binding.jobHash &&
    ownership.version === 'source-reading-coverage-v1', 'Invalid checked ownership');
  const units = parsed.filter((r) => r.row.kind === 'checked_unit');
  require(units.length === ownership.ownedUnits.length &&
    new Set(units.map((u) => u.data.sourceId)).size === units.length, 'Missing checked units');
  for (const unit of units) {
    const { format: _format, ...value } = unit.data;
    require(unit.row.record_id === `checked_unit:${id}/${unit.data.unitKey}` &&
      ownership.ownedUnits.some(
        (u) => canonicalJson(u) === canonicalJson(value),
      ), 'Changed checked unit');
  }
  const anchor = async (span: Span, role?: ReadingAnchor['role']): Promise<ReadingAnchor> => {
    const at = sources.findIndex((s) => s.source_id === span.sourceId);
    const s = sources[at];
    require(s &&
      s.sha256 === span.sourceSha256 &&
      s.edition === span.edition &&
      s.provenance.segment_id === span.segmentId &&
      Number.isInteger(span.start) &&
      Number.isInteger(span.end) &&
      span.start >= 0 &&
      span.end > span.start &&
      span.end <= Array.from(s.text).length &&
      Array.from(s.text).slice(span.start, span.end).join('') ===
        span.quote, 'Checked anchor misses source');
    require(span.offsetUnit === 'Unicode code points' &&
      span.segmentStart === (s.provenance.piece?.raw_start ?? 0) + span.start &&
      span.segmentEnd === (s.provenance.piece?.raw_start ?? 0) + span.end &&
      span.segmentSha256 ===
        (s.provenance.piece?.segment_text_sha256 ?? s.sha256), 'Checked absolute anchor differs');
    if (role === 'printed_name' || role === 'actor_description') {
      const chars = Array.from(s.text);
      require(!/[\p{L}\p{M}\p{N}]/u.test(chars[span.start - 1] ?? '') &&
        !/[\p{L}\p{M}\p{N}]/u.test(chars[span.end] ?? '') &&
        !/^\p{M}/u.test(span.quote), 'Partial checked word');
    }
    const a: ReadingAnchor = {
      source_id: s.source_id,
      segmentId: span.segmentId,
      occurrenceKey: await occurrenceKey(s, span.start, span.end),
      ref: s.ref,
      edition: s.edition,
      quote: span.quote,
      start: span.start,
      end: span.end,
      source_sha256: s.sha256,
      offset_unit: 'Unicode code points',
      primary: at === envelope.focal,
      location: at < envelope.focal ? 'before' : at === envelope.focal ? 'passage' : 'after',
      role,
    };
    const published = applyReadingCoverage(
      id,
      envelope.binding.jobHash,
      sources,
      ownership,
      [
        {
          id: 'anchor',
          label: '',
          named: '',
          mentions: [a],
          reading: { reason: '', alternatives: [] },
        },
      ],
      [],
    ).people[0].mentions[0];
    require(!ownership.ownedUnits.some((u) => u.sourceId === s.source_id) ||
      published.published === true, 'Owned anchor proof differs');
    return published;
  };
  const people: ReadingPerson[] = [];
  const allMentions = new Map<string, ReadingAnchor[]>();
  for (const { row, data } of personRows) {
    const p = data as Person;
    require(data.historicalIdentityResolved === false &&
      data.status === 'needs_review' &&
      ['person', 'group', 'deity', 'angel', 'supernatural'].includes(p.kind) &&
      ['named', 'embedded_parent', 'unnamed', 'generic'].includes(p.form) &&
      ['reported', 'hypothetical', 'uncertain'].includes(p.setting), 'Invalid local actor');
    require(row.subject_id === `${id}/${p.id}` &&
      row.object_id === null &&
      typeof p.label === 'string' &&
      typeof p.reason === 'string' &&
      Array.isArray(p.mentions) &&
      p.mentions.length > 0, 'Invalid checked person');
    const mentions = [];
    for (const m of p.mentions) {
      require(['printed_name', 'actor_description', 'referential_evidence'].includes(
        m.role,
      ), 'Invalid mention role');
      require(m.namePlacementEligible === (m.role === 'printed_name') &&
        (m.role !== 'printed_name' ||
          ['named', 'embedded_parent'].includes(p.form)), 'Invalid name eligibility');
      mentions.push(await anchor(m, m.role));
    }
    allMentions.set(p.id, mentions);
    people.push({
      placementEligible: p.setting === 'reported' && ['person', 'group'].includes(p.kind),
      id: p.id,
      label: p.label,
      named:
        p.form === 'named' ? 'name' : p.form === 'embedded_parent' ? 'father_of_named' : 'unnamed',
      mentions,
      reading: { reason: p.reason, alternatives: [] },
    });
  }
  const connections = [];
  for (const { row, data } of connectionRows) {
    const c = data as Connection;
    require(data.historicalIdentityResolved === false &&
      data.status === 'needs_review' &&
      data.era === null, 'Checked pair cannot resolve identity or era');
    require(Array.isArray(c.participants) &&
      c.participants.length === 2 &&
      c.participants[0] !== c.participants[1] &&
      c.participants.every((p) => personRows.some((r) => r.data.id === p)) &&
      ['direct_interaction', 'intellectual_connection', 'family', 'transmission'].includes(
        c.broadType,
      ) &&
      c.establishesMeeting === false, 'Invalid checked pair');
    require(c.participants.every((p) =>
      personRows.some((r) => r.data.id === p && r.data.setting === 'reported'),
    ) &&
      (c.broadType !== 'family' ||
        c.participants.every((p) =>
          personRows.some((r) => r.data.id === p && r.data.kind === 'person'),
        )), 'Invalid reported pair');
    require(['held', 'symmetric', 'supported'].includes(
      c.direction.status,
    ), 'Invalid checked direction');
    if (c.direction.status === 'supported')
      require(c.direction.subject !== c.direction.object &&
        c.participants.includes(c.direction.subject!) &&
        c.participants.includes(c.direction.object!), 'Invalid directed pair');
    else
      require(c.direction.subject === null &&
        c.direction.object === null, 'Held direction has endpoints');
    const indexed =
      c.direction.status === 'supported'
        ? [c.direction.subject, c.direction.object]
        : [...c.participants].sort();
    require(row.subject_id === `${id}/${indexed[0]}` &&
      row.object_id === `${id}/${indexed[1]}`, 'Checked pair indexes differ');
    for (const detail of [c.predicate, c.outcome])
      require(detail.status === 'held'
        ? detail.value === null
        : detail.status === 'supported' &&
            typeof detail.value === 'string' &&
            !!detail.value, 'Invalid held detail');
    require(Array.isArray(c.evidence) &&
      c.evidence.length > 0 &&
      typeof c.reason === 'string', 'Missing pair evidence');
    connections.push({ data: c, evidence: await Promise.all(c.evidence.map((e) => anchor(e))) });
  }
  return {
    id,
    envelope,
    people,
    allMentions,
    connections,
    coverage,
    units: ownership.ownedUnits,
    stored: rows,
  };
}

export function checkedPerson(
  revision: string,
  passage: CheckedPassage,
  localId: string,
): SourcePerson | null {
  const card = initialPerson(revision, passage.id, localId, passage.people, [], []);
  if (!card?.initialReading) return null;
  const endpoint = (id: string) => {
    const p = passage.people.find((p) => p.id === id)!;
    return { id: readingPersonId(passage.id, id), name: p.label, nameHe: p.label };
  };
  card.initialReading.checked = {
    artifactHash: passage.envelope.artifactHash,
    wholeReadingFullyChecked: passage.envelope.wholeReadingFullyChecked,
    sourceCoverage: passage.coverage,
    mentions: passage.allMentions.get(localId)!,
  };
  card.nameHe =
    passage.allMentions.get(localId)?.find((m) => m.role === 'printed_name')?.quote ?? card.name;
  card.initialReading.relationships = passage.connections
    .filter((c) => c.data.participants.includes(localId))
    .map(({ data: c, evidence }): InitialRelationship => {
      const partner = endpoint(c.participants.find((p) => p !== localId)!);
      const directed = c.direction.status === 'supported';
      return {
        id: c.id,
        partnerId: partner.id,
        partnerName: partner.name,
        partnerNameHe: partner.nameHe,
        subject: endpoint(directed ? c.direction.subject! : c.participants[0]),
        object: endpoint(directed ? c.direction.object! : c.participants[1]),
        checked: c,
        evidence,
        reading: {
          relation: c.predicate.value ?? c.broadType,
          category: c.broadType,
          direction: directed ? 'a_to_b' : c.direction.status,
          modality: 'asserted',
          scene_status: 'actual_report',
          polarity: 'positive',
          verb: '',
          reason: c.reason,
          alternatives: [],
        },
      };
    });
  return card;
}

/** Exact checked names use the same layout proof and DOM injector as existing initial names. */
export async function checkedPlacement(
  occurrences: InitialOccurrence[],
  passages: CheckedPassage[],
): Promise<InitialPlacement> {
  const sources: InitialPlacement['sources'] = [];
  const placed: InitialPlacement['occurrences'] = [];
  for (const o of occurrences) {
    if (o.people.length !== 1 || o.passageOnly || o.overlapsOtherReading) continue;
    const pid = passages.find((p) => o.people[0].id.startsWith(`reading:${p.id}/`));
    if (!pid) continue;
    const local = o.people[0].id.slice(`reading:${pid.id}/`.length);
    const person = pid.people.find((p) => p.id === local);
    const a = person?.mentions.find(
      (a) => a.occurrenceKey === o.key && a.role === 'printed_name' && a.published,
    );
    if (!a || !['name', 'father_of_named'].includes(person!.named)) continue;
    const s = pid.envelope.segments.find((s) => s.source_id === a.source_id)!;
    if (s.provenance.piece) continue;
    const unit = pid.stored.find(
      (r) => r.kind === 'checked_unit' && JSON.parse(r.payload_json).sourceId === a.source_id,
    );
    if (!unit) continue;
    const key = await sha256(canonicalJson([s.ref, s.edition, s.provenance.segment_id, s.sha256]));
    if (!sources.some((x) => x.key === key))
      sources.push({
        key,
        ref: s.ref,
        edition: s.edition,
        segmentId: s.provenance.segment_id,
        sourceSha256: s.sha256,
        text: s.text,
        bindingSha256: unit.payload_sha256,
      });
    placed.push({
      ...o,
      sourceKey: key,
      readingPersonId: o.people[0].id,
      start: a.start,
      end: a.end,
      offsetUnit: 'Unicode code points',
    });
  }
  return { version: 'initial-name-placement-v1', sources, occurrences: placed };
}

/** A checked version replaces only its exact raw queue result, never a name or page match. */
export function supersededReadings(
  readings: {
    id: string;
    checked: boolean;
    rawResultHash?: string;
    jobHash?: string;
    legacy: boolean;
  }[],
): Set<string> {
  const replacements = new Map<string, { id: string; jobHash?: string }>();
  for (const r of readings) {
    if (!r.checked) continue;
    require(r.rawResultHash && hex.test(r.rawResultHash), 'Missing checked raw hash');
    require(!replacements.has(r.rawResultHash), 'Conflicting checked source readings');
    replacements.set(r.rawResultHash, r);
  }
  const hidden = new Set<string>();
  for (const r of readings) {
    if (!r.legacy || !r.rawResultHash) continue;
    const checked = replacements.get(r.rawResultHash);
    if (checked) hidden.add(checked.id);
  }
  for (const r of readings) {
    if (r.checked || r.legacy || !r.rawResultHash) continue;
    const checked = replacements.get(r.rawResultHash);
    if (!checked || hidden.has(checked.id)) continue;
    require(checked.jobHash && r.jobHash === checked.jobHash, 'Raw replacement source differs');
    hidden.add(r.id);
  }
  return hidden;
}
