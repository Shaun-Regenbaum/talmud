"""Bind older passages to an independently pinned source edition without changing them."""
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ownership.tile_ownership import OwnershipIndex, digest

VERSION = 'legacy-source-binding-v1'
KIND = 'source_binding'
DESCRIPTION = 'Bind saved passages to exact source editions without changing people, readings or relationships.'


def records(rows, manifests):
    sources = {}
    for spec in manifests:
        if set(spec) != {'manifest', 'expectedManifestSha256'}:
            raise ValueError('Explicit source manifest pin required')
        bundle, pin = spec['manifest'], spec['expectedManifestSha256']
        OwnershipIndex(bundle, pin)
        for unit in bundle['ownership']:
            key = (unit['ref'], unit['segmentSha256'])
            identity = (unit['edition'], unit['segmentId'])
            sources.setdefault(key, {}).setdefault(identity, set()).add(pin)
    out = []
    for row in rows:
        if row[1] != 'passage':
            continue
        data = json.loads(row[-1]); text = data.get('source', {}).get('passage')
        if not isinstance(text, str) or not text or data.get('sourceSegments'):
            continue
        sha = hashlib.sha256(text.encode()).hexdigest()
        matches = sources.get((row[3], sha), {})
        if len(matches) != 1:
            continue
        (edition, segment), pins = next(iter(matches.items()))
        if not edition or not segment:
            continue
        binding = dict(version=VERSION, passageId=row[2], ref=row[3], passagePayloadSha256=row[-2],
                       edition=edition, segmentId=segment, sourceSha256=sha,
                       ownershipManifestSha256=sorted(pins), offsetUnit='Unicode code points',
                       confirmedFacts=False)
        out.append(dict(record_id=KIND+':'+row[2]+'/'+digest(binding), kind=KIND,
                        passage_id=row[2], ref=row[3], subject_id=None, object_id=None,
                        authority='screening', decision='needs_review', data=binding))
    return sorted(out, key=lambda r:r['record_id'])


def validate_changes(changes, rows):
    if set(changes) != {'parentRevision', 'description', 'sourceBindingManifests', 'records'}:
        raise ValueError('Source binding imports cannot change other records')
    if changes['description'] != DESCRIPTION:
        raise ValueError('Unexpected source binding description')
    expected = records(rows.values(), changes['sourceBindingManifests'])
    # Existing immutable bindings may be omitted, but never replaced or altered.
    expected = [r for r in expected if r['record_id'] not in rows]
    if changes['records'] != expected:
        raise ValueError('Source bindings differ from exact parent/source joins')


if __name__ == '__main__':
    import argparse
    import sqlite3
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database'); parser.add_argument('revision'); parser.add_argument('output')
    parser.add_argument('--ownership', nargs=2, action='append', required=True,
                        metavar=('MANIFEST_JSON', 'REVIEWED_MANIFEST_SHA256'))
    args = parser.parse_args()
    connection = sqlite3.connect(Path(args.database).resolve().as_uri() + '?mode=ro', uri=True)
    try:
        if connection.execute('SELECT state FROM sage_graph_revisions WHERE id=?', (args.revision,)).fetchone() != ('verified',):
            raise ValueError('Source revision is not verified')
        rows = list(connection.execute('SELECT record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json FROM sage_graph_all_records WHERE revision_id=?', (args.revision,)))
        specs = [dict(manifest=json.loads(Path(path).read_text()), expectedManifestSha256=pin) for path, pin in args.ownership]
        current = {r[0]:r for r in rows}
        result = dict(parentRevision=args.revision, description=DESCRIPTION, sourceBindingManifests=specs,
                      records=[r for r in records(rows, specs) if r['record_id'] not in current])
        validate_changes(result, current)
        Path(args.output).write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
        print(json.dumps(dict(records=len(result['records']), parentRevision=args.revision,
                              bytes=Path(args.output).stat().st_size,
                              sha256=hashlib.sha256(Path(args.output).read_bytes()).hexdigest())))
    finally:
        connection.close()
