"""Add explicit publication ownership without rewriting source-reading payloads."""
import copy
from ownership.tile_ownership import OwnershipIndex, digest, source_unit

VERSION = 'source-reading-coverage-v1'
KINDS = {'source_reading_coverage', 'source_reading_unit'}


def records(job, passage_id, index):
    assignments = index.sources_for(job)
    sources = {s['source_id']: s for s in job['sources']}
    out, owned = [], []
    for assignment in assignments:
        if not assignment['owned']:
            continue
        source = sources[assignment['sourceId']]
        unit, start, end, segment_hash = source_unit(source)
        key = digest([source['edition'], source['provenance']['segment_id'], segment_hash, start, end])
        data = dict(version=VERSION, unitKey=key, passageId=passage_id, sourceId=source['source_id'],
                    unitId=unit, ref=source['ref'], edition=source['edition'],
                    segmentId=source['provenance']['segment_id'], sourceSha256=source['sha256'],
                    segmentSha256=segment_hash, rawStart=start, rawEnd=end,
                    offsetUnit='Unicode code points', originalRole='focal' if source['provenance']['focal'] else 'context',
                    ownershipManifestSha256=assignment['ownershipManifestSha256'], jobSha256=digest(job),
                    confirmedFacts=False)
        out.append(dict(record_id='source_reading_unit:' + passage_id + '/' + key, kind='source_reading_unit',
                        passage_id=passage_id, ref=source['ref'], subject_id=None, object_id=None,
                        authority='screening', decision='needs_review', data=data))
        owned.append(data)
    # Even a reading with no owned units must not fall back to focal publication.
    out.append(dict(record_id='source_reading_coverage:' + passage_id, kind='source_reading_coverage',
                    passage_id=passage_id, ref=job['focal_ref'], subject_id=None, object_id=None,
                    authority='screening', decision='needs_review', data=dict(version=VERSION,
                    passageId=passage_id, jobSha256=digest(job), sources=copy.deepcopy(assignments),
                    ownedUnits=owned, confirmedFacts=False)))
    return out


def pinned_index(spec):
    if not isinstance(spec, dict) or set(spec) != {'manifest', 'expectedManifestSha256'}:
        raise ValueError('Explicit reviewed ownership manifest and hash required')
    return OwnershipIndex(spec['manifest'], spec['expectedManifestSha256'])
