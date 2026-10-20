import type { LegacyRow } from './legacy-readings';

/**
 * Decode one passage of a source-reading store (format source-reading-store-v2) into the v1 rows
 * that the readers already use. It reads D1 alone, so two things stay in the private R2 artifact:
 * segment provenance other than segment_id, focal and piece, and the queue manifest, whose hash
 * stays as provenance.inputProof.manifestSha256. Everything else matches the v1 importer byte for
 * byte, so person, claim and ownership rows keep their v1 payload hashes.
 * research/sage-network/storage/source_reading_store.py `reader_view` is the same contract.
 */
export const SOURCE_READING_STORE_FORMAT = 'source-reading-store-v2';
const OFFSET_UNIT = 'Unicode code points';
const KEPT_PROVENANCE = ['segment_id', 'focal', 'piece'];
const NAMED: Record<string, string> = {
  named: 'name',
  embedded_parent: 'father_of_named',
  unnamed: 'unnamed',
  generic: 'unnamed',
};
const REVIEW_REASONS = ['Initial source reading; not independently confirmed.'];
const KINDS = new Set([
  'passage',
  'person',
  'claim',
  'source_reading',
  'source_reading_coverage',
  'source_reading_unit',
]);

export interface StoredRow extends LegacyRow {
  subject_id: string | null;
  object_id: string | null;
}
type Json = Record<string, unknown>;
type CompactAnchor = [string, number, number, number, string];
interface Segment {
  source_id: string;
  ref: string;
  edition: string;
  sha256: string;
  text: string;
  provenance: {
    segment_id: string;
    focal?: boolean;
    piece?: { raw_start: number; segment_text_sha256: string };
  };
}

function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}

/** The same bytes as Python json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Json)[k])}`)
      .join(',')}}`;
  // Python writes 1.0 where JavaScript writes 1, so a float could not round-trip.
  require(typeof value !== 'number' || Number.isInteger(value), 'Stored numbers must be integers');
  require(value !== undefined, 'Stored values cannot be undefined');
  return JSON.stringify(value);
}

export const sha256 = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');

/** source_readings.occurrence_key: the same words of the same segment always get the same key. */
export async function occurrenceKey(source: Segment, start: number, end: number) {
  const piece = source.provenance.piece;
  const rawStart = piece ? piece.raw_start : 0;
  const segmentHash = piece ? piece.segment_text_sha256 : source.sha256;
  return `occ-${await sha256(
    canonicalJson([
      source.edition,
      source.provenance.segment_id,
      segmentHash,
      rawStart + start,
      rawStart + end,
    ]),
  )}`;
}

const without = (data: Json, key: string) =>
  Object.fromEntries(Object.entries(data).filter(([k]) => k !== key));

/** Decode one passage. Refuses changed payloads, other formats and anchors that miss their words. */
export async function decodeStoredPassage(
  passageId: string,
  rows: StoredRow[],
): Promise<StoredRow[]> {
  const parsed: { row: StoredRow; data: Json }[] = [];
  for (const row of rows) {
    require(
      (await sha256(row.payload_json)) === row.payload_sha256,
      'Stored source reading changed',
    );
    require(row.passage_id === passageId && KINDS.has(row.kind), 'Unexpected source store row');
    const data = JSON.parse(row.payload_json) as Json;
    require(data.format === SOURCE_READING_STORE_FORMAT, `Not ${SOURCE_READING_STORE_FORMAT} rows`);
    parsed.push({ row, data: without(data, 'format') });
  }
  const get = (kind: string) => parsed.filter((r) => r.row.kind === kind);
  const passages = get('passage');
  const envelopes = get('source_reading');
  require(passages.length === 1, 'A passage needs exactly one passage row');
  require(envelopes.length === 1, 'A passage needs exactly one source_reading envelope');
  const prow = passages[0].row;
  const p = passages[0].data as {
    id: string;
    ref: string;
    sourceReadingId: string;
    focal: number;
    segments: Segment[];
    people: string[];
    claims: string[];
  };
  require(p.id === passageId && Number.isInteger(p.focal), 'Stored passage differs');
  const sources = p.segments;
  require(
    sources[p.focal]?.provenance.focal === true &&
      sources.every((s) => Object.keys(s.provenance).every((k) => KEPT_PROVENANCE.includes(k))),
    'Stored segments differ',
  );
  const location = (i: number) => (i < p.focal ? 'before' : i === p.focal ? 'passage' : 'after');
  const anchor = async (a: CompactAnchor, path: string) => {
    require(Array.isArray(a) && a.length === 5, 'Stored anchor differs');
    const [sourceId, start, end, occurrence, quote] = a;
    const i = sources.findIndex((s) => s.source_id === sourceId);
    const s = sources[i];
    require(
      s &&
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        0 <= start &&
        start < end &&
        Array.from(s.text).slice(start, end).join('') === quote,
      'Stored anchor does not match its source words',
    );
    return {
      path,
      source_id: sourceId,
      quote,
      occurrence,
      source_sha256: s.sha256,
      start,
      end,
      offset_unit: OFFSET_UNIT,
      occurrenceKey: await occurrenceKey(s, start, end),
      ref: s.ref,
      edition: s.edition,
      segmentId: s.provenance.segment_id,
      location: location(i),
      primary: i === p.focal,
    };
  };
  type Anchor = Awaited<ReturnType<typeof anchor>>;
  const short = (m: Anchor) => ({ source_id: m.source_id, quote: m.quote, occurrence: m.occurrence });
  const first = (list: Anchor[]) => list.find((m) => m.primary) ?? list[0];
  const sid = p.sourceReadingId;
  const out = new Map<string, Json>();
  const people = new Map<string, Json & { id: string; mentions: Anchor[] }>();
  for (const { row, data } of get('person')) {
    const d = data as {
      id: string;
      label: string;
      kind: string;
      form: string;
      setting: string;
      reason: string;
      alternatives: unknown[];
      mentions: CompactAnchor[];
    };
    const mentions = await Promise.all(
      d.mentions.map((a, k) => anchor(a, `people/${d.id}/mentions/${k}`)),
    );
    require(mentions.length && Object.hasOwn(NAMED, d.form), 'Stored person differs');
    const person = {
      id: d.id,
      label: d.label,
      named: NAMED[d.form],
      quote: first(mentions).quote,
      quoteLocation: first(mentions).location,
      mentions,
      reading: {
        id: d.id,
        kind: d.kind,
        label: d.label,
        form: d.form,
        setting: d.setting,
        mentions: mentions.map(short),
        reason: d.reason,
        alternatives: d.alternatives,
      },
      sourceReadingId: sid,
      historicalIdentityResolved: false,
      identityStatus: 'local',
      accepted: false,
    };
    people.set(d.id, person);
    out.set(row.record_id, person);
  }
  const ordered = p.people.map((id) => people.get(id));
  require(
    ordered.every(Boolean) && ordered.length === people.size,
    'Stored people differ from the passage',
  );
  const claims = new Map<string, Json>();
  const evidenceKeys: Anchor[] = [];
  for (const { row, data } of get('claim')) {
    const rel = data.relation as Json & {
      id: string;
      relation: string;
      subject: string | null;
      object: string | null;
      reason: string;
    };
    const evidence = await Promise.all(
      (data.evidence as CompactAnchor[]).map((a, k) =>
        anchor(a, `relationships/${rel.id}/evidence/${k}`),
      ),
    );
    require(evidence.length, 'Stored claim differs');
    evidenceKeys.push(...evidence);
    const claim = {
      id: rel.id,
      field: 'relations',
      relation: `other:${rel.relation}`,
      a: rel.subject,
      b: rel.object,
      quote: first(evidence).quote,
      quoteLocation: first(evidence).location,
      note: rel.reason,
      basis: 'source_reading',
      reading: { ...rel, evidence: evidence.map(short) },
    };
    const participants = ordered
      .filter((x) => x!.id === rel.subject || x!.id === rel.object)
      .map((x) => ({
        id: x!.id,
        localId: `${passageId}/${x!.id}`,
        label: x!.label,
        named: x!.named,
        quote: x!.quote,
        quoteLocation: x!.quoteLocation,
        historicalId: null,
      }));
    claims.set(rel.id, claim);
    out.set(row.record_id, {
      id: `${passageId}/${rel.id}`,
      passageId,
      ref: prow.ref,
      claim,
      participants,
      evidence,
      classification: {
        decision: 'needs_review',
        flags: [],
        groups: [],
        id: rel.id,
        mode: 'source_reading',
      },
      graphReady: false,
      historicalIdentityStatus: 'unresolved',
      accepted: false,
      sourceReadingId: sid,
      reviewReasons: REVIEW_REASONS,
    });
  }
  require(
    p.claims.every((id) => claims.has(id)) && p.claims.length === claims.size,
    'Stored claims differ from the passage',
  );
  const texts = sources.map((s) => s.text);
  out.set(prow.record_id, {
    id: p.id,
    ref: p.ref,
    source: {
      before: texts.slice(0, p.focal).join('\n'),
      passage: texts[p.focal],
      after: texts.slice(p.focal + 1).join('\n'),
    },
    people: ordered,
    claims: p.claims.map((id) => claims.get(id)),
    sourceReadingId: sid,
    sourceSegments: sources,
  });
  const mentions = [...people.values()].flatMap((x) => x.mentions);
  const keys = (list: Anchor[]) => [...new Set(list.map((a) => a.occurrenceKey))].sort();
  out.set(envelopes[0].row.record_id, {
    ...envelopes[0].data,
    occurrenceKeys: keys(mentions),
    primaryOccurrenceKeys: keys(mentions.filter((a) => a.primary)),
    primaryEvidenceKeys: keys(evidenceKeys.filter((a) => a.primary)),
  });
  const units = new Map<string, { row: StoredRow; data: Json }>();
  for (const unit of get('source_reading_unit')) {
    units.set(unit.data.sourceId as string, unit);
    out.set(unit.row.record_id, unit.data);
  }
  for (const { row, data } of get('source_reading_coverage')) {
    const owned = (data.sources as { sourceId: string; owned: boolean }[]).filter((a) => a.owned);
    require(
      owned.every((a) => units.has(a.sourceId)) && owned.length === units.size,
      'Stored ownership differs from its units',
    );
    out.set(row.record_id, { ...data, ownedUnits: owned.map((a) => units.get(a.sourceId)!.data) });
  }
  return Promise.all(
    rows.map(async (row) => {
      const payload = canonicalJson(out.get(row.record_id));
      return { ...row, payload_json: payload, payload_sha256: await sha256(payload) };
    }),
  );
}
