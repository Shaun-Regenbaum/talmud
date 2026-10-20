import type { ReadingAnchor, ReadingClaim, ReadingPerson } from './initial-readings';

export interface OwnedReadingUnit {
  unitKey: string;
  version: string;
  passageId: string;
  sourceId: string;
  ref: string;
  edition: string;
  segmentId: string;
  sourceSha256: string;
  segmentSha256: string;
  rawStart: number;
  rawEnd: number;
  ownershipManifestSha256: string;
  jobSha256: string;
}
interface ReadingSource {
  source_id: string;
  ref: string;
  edition: string;
  sha256: string;
  text: string;
  provenance: {
    segment_id: string;
    piece?: { raw_start: number; raw_end: number; segment_text_sha256: string };
  };
}
export interface ReadingCoverage {
  version: string;
  passageId: string;
  jobSha256: string;
  ownedUnits: OwnedReadingUnit[];
}

/** Publication ownership is separate from the reader's original focal/context role. */
export function applyReadingCoverage(
  passageId: string,
  jobHash: string,
  sources: ReadingSource[],
  coverage: ReadingCoverage,
  people: ReadingPerson[],
  claims: ReadingClaim[],
) {
  if (
    coverage.version !== 'source-reading-coverage-v1' ||
    coverage.passageId !== passageId ||
    coverage.jobSha256 !== jobHash
  )
    throw Error('Source ownership does not match the reading');
  const publish = (anchor: ReadingAnchor): ReadingAnchor => {
    const source = sources.find((s) => s.source_id === anchor.source_id);
    const unit = coverage.ownedUnits.find((u) => u.sourceId === anchor.source_id);
    const published = !!(
      unit &&
      source &&
      unit.version === coverage.version &&
      unit.passageId === passageId &&
      unit.jobSha256 === jobHash &&
      /^[a-f0-9]{64}$/.test(unit.ownershipManifestSha256) &&
      unit.ref === source.ref &&
      source.ref === anchor.ref &&
      unit.edition === source.edition &&
      source.edition === anchor.edition &&
      unit.segmentId === source.provenance.segment_id &&
      anchor.segmentId === unit.segmentId &&
      unit.sourceSha256 === source.sha256 &&
      source.sha256 === anchor.source_sha256 &&
      Number.isInteger(anchor.start) &&
      Number.isInteger(anchor.end) &&
      anchor.start >= 0 &&
      anchor.end > anchor.start &&
      unit.segmentSha256 === (source.provenance.piece?.segment_text_sha256 ?? source.sha256) &&
      unit.rawStart === (source.provenance.piece?.raw_start ?? 0) &&
      unit.rawEnd === (source.provenance.piece?.raw_end ?? Array.from(source.text).length) &&
      Number.isInteger(unit.rawStart) &&
      unit.rawStart >= 0 &&
      unit.rawEnd - unit.rawStart === Array.from(source.text).length &&
      anchor.end <= Array.from(source.text).length &&
      anchor.offset_unit === 'Unicode code points' &&
      Array.from(source.text).slice(anchor.start, anchor.end).join('') === anchor.quote
    );
    return {
      ...anchor,
      published,
      ...(published && unit
        ? {
            segmentStart: unit.rawStart + anchor.start,
            segmentEnd: unit.rawStart + anchor.end,
            segmentSha256: unit.segmentSha256,
          }
        : {}),
    };
  };
  return {
    people: people.map((p) => ({ ...p, mentions: p.mentions.map(publish) })),
    claims: claims.map((c) => ({ ...c, evidence: c.evidence.map(publish) })),
  };
}
