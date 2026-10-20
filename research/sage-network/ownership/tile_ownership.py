"""Bind publication ownership to frozen source tiles without changing their readings."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

VERSION = 'tile-source-ownership-v1'
POLICY = 'Prefer an original focal source, then the first tile in the frozen tile index.'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def digest(value):
    return sha(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode())


def require(value, message):
    if not value:
        raise ValueError(message)


def lines(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def unique(rows, key):
    result = {row[key]: row for row in rows}
    require(len(result) == len(rows), 'Duplicate ' + key)
    return result


def source_unit(source):
    provenance = source['provenance']
    segment = provenance['segment_id']
    piece = provenance.get('piece')
    if piece is None:
        return segment, 0, len(source['text']), source['sha256']
    require(type(piece['index']) is int and 1 <= piece['index'] <= piece['of'], 'Invalid piece index')
    start, end = piece['raw_start'], piece['raw_end']
    require(type(start) is int and type(end) is int and 0 <= start < end, 'Invalid piece offsets')
    require(end - start == len(source['text']), 'Piece length differs')
    return segment + '#p' + str(piece['index']), start, end, piece['segment_text_sha256']


def build(root, expected_manifest_hash):
    root = Path(root)
    require(sha((root / 'manifest.json').read_bytes()) == expected_manifest_hash, 'Frozen manifest differs')
    manifest = json.loads((root / 'manifest.json').read_text())
    require(manifest['version'] in ('full-bavli-tiles v1', 'full-other-texts-tiles v3'), 'Unreviewed tile version')
    sums = {}
    for line in (root / 'SHA256SUMS').read_text().splitlines():
        checksum, name = line.split(maxsplit=1)
        sums[name.removeprefix('./')] = checksum
    bindings = {}
    for name in ['manifest.json', 'tiles.jsonl', 'segment-coverage.jsonl', 'verification.json', 'pieces.jsonl', 'FROZEN.json']:
        p = root / name
        if not p.exists():
            require(name in ('pieces.jsonl', 'FROZEN.json'), 'Missing frozen file ' + name)
            continue
        bindings[name] = sha(p.read_bytes())
        require(sums.get(name) == bindings[name], 'Frozen file checksum differs: ' + name)
    tiles = unique(lines(root / 'tiles.jsonl'), 'jobId')
    order = {job_id: i for i, job_id in enumerate(tiles)}
    coverage = unique(lines(root / 'segment-coverage.jsonl'), 'segmentId')
    pieces = unique(lines(root / 'pieces.jsonl'), 'segmentId') if (root / 'pieces.jsonl').exists() else {}
    candidates, texts, job_hashes = {}, {}, {}
    for relative, spec in manifest['shards'].items():
        path = root / 'shards' / relative
        require(path.resolve().is_relative_to((root / 'shards').resolve()), 'Unsafe shard path')
        require(sha(path.read_bytes()) == spec['sha256'], 'Shard checksum differs')
        jobs = lines(path)
        require(len(jobs) == spec['jobs'], 'Shard count differs')
        for job in jobs:
            jid = job['job_id']
            require(jid in tiles and jid not in job_hashes, 'Missing or duplicated tile job')
            pretty_hash = sha((json.dumps(job, ensure_ascii=False, indent=2) + '\n').encode())
            require(pretty_hash == tiles[jid]['inputSha256'], 'Tile job checksum differs')
            job_hashes[jid] = digest(job)
            observed = []
            for source in job['sources']:
                require(sha(source['text'].encode()) == source['sha256'], 'Source text checksum differs')
                unit, start, end, segment_hash = source_unit(source)
                provenance = source['provenance']; segment = provenance['segment_id']
                require(segment in coverage, 'Source absent from coverage')
                cov = coverage[segment]
                require(cov['textSha256'] == segment_hash and cov['ref'] == source['ref'], 'Coverage source differs')
                role = 'focal' if provenance['focal'] else 'context'
                require(any(x['jobId'] == jid and x['role'] == role and x.get('unit', segment) == unit for x in cov['tileJobs']), 'Source role absent from coverage')
                if 'piece' in provenance:
                    declaration = pieces[segment]
                    require(declaration['segmentTextSha256'] == segment_hash, 'Piece parent checksum differs')
                    require(any(p['pieceId'] == unit and p['rawStart'] == start and p['rawEnd'] == end and p['sha256'] == source['sha256'] for p in declaration['pieces']), 'Piece absent from frozen index')
                identity = dict(unitId=unit, segmentId=segment, edition=source['edition'], ref=source['ref'], sourceSha256=source['sha256'], segmentSha256=segment_hash, rawStart=start, rawEnd=end)
                if unit in texts:
                    require(texts[unit][0] == identity and texts[unit][1] == source['text'], 'Conflicting copies of source unit')
                else:
                    texts[unit] = (identity, source['text'])
                candidates.setdefault(unit, []).append(dict(jobId=jid, jobSha256=job_hashes[jid], sourceId=source['source_id'], originalRole=role, shard=relative, shardSha256=spec['sha256']))
                observed.append(unit)
            indexed = tiles[jid].get('segments') if 'segments' in tiles[jid] else tiles[jid]['units']
            require(observed == indexed, 'Tile source list differs')
    require(set(job_hashes) == set(tiles) and len(tiles) == manifest['jobs'], 'Tile coverage incomplete')
    expected = set()
    for segment, cov in coverage.items():
        if segment in pieces:
            declaration = pieces[segment]; cursor = 0; chunks = []
            for piece in declaration['pieces']:
                unit = piece['pieceId']; expected.add(unit)
                require(piece['rawStart'] == cursor and unit in texts, 'Missing or overlapping source piece')
                chunks.append(texts[unit][1]); cursor = piece['rawEnd']
            require(cursor == declaration['chars'] and sha(''.join(chunks).encode()) == cov['textSha256'], 'Pieces do not reconstruct source segment')
        else:
            expected.add(segment)
    require(set(candidates) == expected, 'Source ownership has gaps or extras')
    rows = []
    for unit in sorted(candidates):
        options = sorted(candidates[unit], key=lambda x: (x['originalRole'] != 'focal', order[x['jobId']]))
        rows.append(dict(**texts[unit][0], owner=options[0], alternatives=options[1:]))
    header = dict(version=VERSION, policy=POLICY, sourceVersion=manifest['version'], frozenFiles=bindings, frozenManifestSha256=expected_manifest_hash, jobs=len(job_hashes), segments=len(coverage), units=len(rows), overlappingUnits=sum(bool(r['alternatives']) for r in rows), rowsSha256=digest(rows), offsetUnit='Unicode code points', confirmedFacts=False)
    header['manifestSha256'] = digest(header)
    return dict(manifest=header, ownership=rows)


class OwnershipIndex:
    """Validate a pinned mapping once, then resolve many frozen jobs cheaply."""

    def __init__(self, bundle, expected_ownership_hash):
        header, rows = bundle['manifest'], bundle['ownership']
        require(header['manifestSha256'] == expected_ownership_hash, 'Unapproved ownership manifest')
        require(header['version'] == VERSION and header['policy'] == POLICY, 'Unknown ownership policy')
        require(header['manifestSha256'] == digest({k: v for k, v in header.items() if k != 'manifestSha256'}), 'Ownership manifest changed')
        require(header['rowsSha256'] == digest(rows), 'Ownership rows changed')
        self._units = unique(copy.deepcopy(rows), 'unitId')
        self._hash = header['manifestSha256']

    def sources_for(self, job):
        result = []
        for source in job['sources']:
            unit, start, end, segment_hash = source_unit(source)
            require(unit in self._units, 'Source has no ownership declaration')
            row = self._units[unit]
            require(row['sourceSha256'] == source['sha256'] == sha(source['text'].encode()), 'Owned source text differs')
            require((row['segmentId'], row['edition'], row['ref'], row['rawStart'], row['rawEnd'], row['segmentSha256']) == (source['provenance']['segment_id'], source['edition'], source['ref'], start, end, segment_hash), 'Owned source identity differs')
            entry = next((x for x in [row['owner'], *row['alternatives']] if x['jobId'] == job['job_id']), None)
            require(entry is not None and entry['jobSha256'] == digest(job) and entry['sourceId'] == source['source_id'], 'Job not bound to ownership')
            result.append(dict(sourceId=source['source_id'], owned=entry == row['owner'], rawStart=start, rawEnd=end, segmentId=row['segmentId'], ownershipManifestSha256=self._hash, sourceSha256=row['sourceSha256']))
        return result


def owned_sources(job, bundle, expected_ownership_hash):
    """Return separate publication provenance; never alter original focal flags."""
    return OwnershipIndex(bundle, expected_ownership_hash).sources_for(job)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source'); parser.add_argument('manifest_hash'); parser.add_argument('output')
    args = parser.parse_args()
    result = build(args.source, args.manifest_hash)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(result['manifest'], indent=2))
