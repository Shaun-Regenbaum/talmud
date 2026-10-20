"""Compact source-reading storage, format source-reading-store-v2. The v1 importer is unchanged.

`compact` takes the exact rows that `source_readings.records` (and `source_coverage.records`) build
and drops only what can be rebuilt exactly:
  - copies of other rows of the same passage (the passage's people and claims lists, a claim's
    participants, the coverage record's owned units)
  - fields derived from kept ones (anchor paths, occurrence keys, quote and quote location, the
    `named` form, constant flags, the source text split, the occurrence key lists)
  - the queue manifest, which every job of a run repeats; it is kept once, in a
    `source_reading_run` row
  - source segment provenance that no reader uses (raw file, URL, licence, capture time ...); it is
    in the private R2 artifact, which holds the whole bundle losslessly

Kept in D1 for the reader: source texts and their hashes, segment IDs and pieces, every quote with
its offsets and occurrence, people with labels, kind, form, setting, reasons and alternatives, the
full typed relationships, the episode, ownership units, and the R2 artifact pointer and hashes.

`expand(rows, artifacts)` rebuilds the exact v1 rows. `artifacts` maps a passage ID to its bundle
from R2. Before any field of a bundle is read, its canonical bytes must match the SHA-256, length,
key, bucket and media type that the passage's one source_reading envelope names. Then only the
dropped segment provenance is read from it, and the kept fields must agree with it.
"""
import copy
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import source_readings as v1  # noqa: E402
from compact_source_v2.contract import RELATIONS  # noqa: E402

FORMAT = 'source-reading-store-v2'
OFFSET_UNIT = 'Unicode code points'
ANCHOR = ('source_id', 'start', 'end', 'occurrence', 'quote')  # the order of a compact anchor array
NAMED = {'named': 'name', 'embedded_parent': 'father_of_named', 'unnamed': 'unnamed', 'generic': 'unnamed'}
REVIEW_REASONS = ['Initial source reading; not independently confirmed.']
KEPT_PROVENANCE = ('segment_id', 'focal', 'piece')
ARTIFACT_BUCKET = 'talmud-source-evidence'
ARTIFACT_PREFIX = 'source-readings/v1/artifacts/'


def require(value, message):
    if not value:
        raise ValueError(message)


def _anchor(a):
    require(a['offset_unit'] == OFFSET_UNIT, 'Unexpected offset unit')
    return [a[k] for k in ANCHOR]


def _segment(s):
    out = {k: s[k] for k in ('source_id', 'ref', 'edition', 'sha256', 'text')}
    out['provenance'] = {k: s['provenance'][k] for k in KEPT_PROVENANCE if k in s['provenance']}
    return out


def _row(item, data):
    return dict(item, data=dict(data, format=FORMAT))


def compact(rows):
    """v1 rows (one or more passages) -> compact rows, plus one run row per distinct queue manifest."""
    out, runs = [], {}
    for item in rows:
        kind, d = item['kind'], item['data']
        if kind == 'passage':
            focal = next(i for i, s in enumerate(d['sourceSegments']) if s['provenance'].get('focal') is True)
            out.append(_row(item, dict(id=d['id'], ref=d['ref'], sourceReadingId=d['sourceReadingId'], focal=focal,
                                       segments=[_segment(s) for s in d['sourceSegments']],
                                       people=[p['id'] for p in d['people']], claims=[c['id'] for c in d['claims']])))
        elif kind == 'person':
            r = d['reading']
            out.append(_row(item, dict(id=d['id'], label=d['label'], kind=r['kind'], form=r['form'], setting=r['setting'],
                                       reason=r['reason'], alternatives=r['alternatives'], mentions=[_anchor(m) for m in d['mentions']])))
        elif kind == 'claim':
            rel = {k: v for k, v in d['claim']['reading'].items() if k != 'evidence'}
            out.append(_row(item, dict(relation=rel, evidence=[_anchor(e) for e in d['evidence']])))
        elif kind == 'source_reading':
            prov = copy.deepcopy(d['provenance'])
            manifest = prov['inputProof'].pop('manifest')
            prov['inputProof']['manifestSha256'] = v1.digest(manifest)
            runs.setdefault(prov['inputProof']['manifestSha256'], manifest)
            out.append(_row(item, {k: (prov if k == 'provenance' else copy.deepcopy(v)) for k, v in d.items()
                                   if k not in ('occurrenceKeys', 'primaryOccurrenceKeys', 'primaryEvidenceKeys')}))
        elif kind == 'source_reading_coverage':
            out.append(_row(item, {k: copy.deepcopy(v) for k, v in d.items() if k != 'ownedUnits'}))
        elif kind == 'source_reading_unit':
            out.append(_row(item, d))
        else:
            raise ValueError('Unknown source reading kind: ' + kind)
    for key, manifest in sorted(runs.items()):
        out.append(dict(record_id='source_reading_run:' + key, kind='source_reading_run', passage_id=None, ref=None,
                        subject_id=None, object_id=None, authority='screening', decision='needs_review',
                        data=dict(format=FORMAT, manifestSha256=key, manifest=manifest)))
    return out


def _source(seg, full):
    require({k: seg[k] for k in ('source_id', 'ref', 'edition', 'sha256', 'text')} == {k: full[k] for k in ('source_id', 'ref', 'edition', 'sha256', 'text')}
            and seg['provenance'] == {k: full['provenance'][k] for k in KEPT_PROVENANCE if k in full['provenance']},
            'Stored segment differs from the R2 artifact')
    return full


def expand(rows, artifacts):
    """Compact rows -> the exact v1 rows, in the same order. `artifacts`: passage ID -> bundle."""
    require(all(r['data'].get('format') == FORMAT for r in rows), 'Not ' + FORMAT + ' rows')
    runs = {r['data']['manifestSha256']: r['data']['manifest'] for r in rows if r['kind'] == 'source_reading_run'}
    for key, manifest in runs.items():
        require(v1.digest(manifest) == key, 'Run manifest differs from its hash')
    by_passage = {}
    for r in rows:
        if r['kind'] != 'source_reading_run':
            by_passage.setdefault(r['passage_id'], []).append(r)
    built = {}
    for pid, group in by_passage.items():
        built.update(_expand_passage(pid, group, artifacts[pid], runs))
    return [built[r['record_id']] for r in rows if r['kind'] != 'source_reading_run']


def verify_artifact(envelope, bundle):
    """The R2 bundle must be exactly the artifact its source_reading envelope names: the same
    canonical bytes (SHA-256 and length), key, bucket and media type. Checked before any field of
    the bundle is read."""
    raw = json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
    got = hashlib.sha256(raw).hexdigest()
    prov = envelope['provenance']
    require(prov['artifactSha256'] == got and prov['artifactBytes'] == len(raw)
            and prov['artifactKey'] == ARTIFACT_PREFIX + got + '.json' and prov['artifactBucket'] == ARTIFACT_BUCKET
            and prov['artifactMediaType'] == 'application/json',
            'R2 artifact differs from its source_reading envelope')


def _expand_passage(pid, group, bundle, runs):
    get = lambda kind: [r for r in group if r['kind'] == kind]
    readings = get('source_reading')
    require(len(readings) == 1, 'A passage needs exactly one source_reading envelope')
    verify_artifact(readings[0]['data'], bundle)
    passage = get('passage')
    require(len(passage) == 1, 'A passage needs exactly one passage row')
    prow, p = passage[0], passage[0]['data']
    sources = [_source(seg, full) for seg, full in zip(p['segments'], bundle['job']['sources'], strict=True)]
    by_id = {s['source_id']: (i, s) for i, s in enumerate(sources)}
    location = lambda i: 'before' if i < p['focal'] else 'passage' if i == p['focal'] else 'after'

    def anchor(a, path):
        a = dict(zip(ANCHOR, a))
        i, s = by_id[a['source_id']]
        return dict(path=path, source_id=a['source_id'], quote=a['quote'], occurrence=a['occurrence'], source_sha256=s['sha256'],
                    start=a['start'], end=a['end'], offset_unit=OFFSET_UNIT, occurrenceKey=v1.occurrence_key(s, a['start'], a['end']),
                    ref=s['ref'], edition=s['edition'], segmentId=s['provenance']['segment_id'], location=location(i), primary=i == p['focal'])

    sid = p['sourceReadingId']
    out, people = {}, {}
    for r in get('person'):
        d = r['data']
        mentions = [anchor(a, f"people/{d['id']}/mentions/{k}") for k, a in enumerate(d['mentions'])]
        first = next((m for m in mentions if m['primary']), mentions[0])
        reading = dict(id=d['id'], kind=d['kind'], label=d['label'], form=d['form'], setting=d['setting'],
                       mentions=[dict(source_id=m['source_id'], quote=m['quote'], occurrence=m['occurrence']) for m in mentions],
                       reason=d['reason'], alternatives=copy.deepcopy(d['alternatives']))
        person = dict(id=d['id'], label=d['label'], named=NAMED[d['form']], quote=first['quote'], quoteLocation=first['location'],
                      mentions=mentions, reading=reading, sourceReadingId=sid, historicalIdentityResolved=False,
                      identityStatus='local', accepted=False)
        people[d['id']] = person
        out[r['record_id']] = dict({k: v for k, v in r.items() if k != 'data'}, data=person)
    ordered = [people[i] for i in p['people']]
    claims = {}
    for r in get('claim'):
        rel = r['data']['relation']
        evidence = [anchor(a, f"relationships/{rel['id']}/evidence/{k}") for k, a in enumerate(r['data']['evidence'])]
        first = next((e for e in evidence if e['primary']), evidence[0])
        reading = dict(copy.deepcopy(rel), evidence=[dict(source_id=e['source_id'], quote=e['quote'], occurrence=e['occurrence']) for e in evidence])
        require((reading['category'], reading['direction']) == RELATIONS[reading['relation']], 'Relation category or direction differs')
        claim = dict(id=rel['id'], field='relations', relation='other:' + rel['relation'], a=rel['subject'], b=rel['object'],
                     quote=first['quote'], quoteLocation=first['location'], note=rel['reason'], basis='source_reading', reading=reading)
        participants = [dict(id=x['id'], localId=pid + '/' + x['id'], label=x['label'], named=x['named'], quote=x['quote'],
                             quoteLocation=x['quoteLocation'], historicalId=None)
                        for x in ordered if x['id'] in (rel['subject'], rel['object'])]
        claims[rel['id']] = claim
        out[r['record_id']] = dict({k: v for k, v in r.items() if k != 'data'}, data=dict(
            id=pid + '/' + rel['id'], passageId=pid, ref=prow['ref'], claim=claim, participants=participants, evidence=evidence,
            classification=dict(decision='needs_review', flags=[], groups=[], id=rel['id'], mode='source_reading'),
            graphReady=False, historicalIdentityStatus='unresolved', accepted=False, sourceReadingId=sid, reviewReasons=list(REVIEW_REASONS)))
    texts = [s['text'] for s in sources]
    f = p['focal']
    out[prow['record_id']] = dict({k: v for k, v in prow.items() if k != 'data'}, data=dict(
        id=p['id'], ref=p['ref'], source={'before': '\n'.join(texts[:f]), 'passage': texts[f], 'after': '\n'.join(texts[f + 1:])},
        people=ordered, claims=[claims[i] for i in p['claims']], sourceReadingId=sid, sourceSegments=copy.deepcopy(sources)))
    person_keys = [m for x in people.values() for m in x['mentions']]
    evidence_keys = [e for r in out.values() if r['kind'] == 'claim' for e in r['data']['evidence']]
    for r in get('source_reading'):
        d = copy.deepcopy({k: v for k, v in r['data'].items() if k != 'format'})
        proof = d['provenance']['inputProof']
        proof['manifest'] = copy.deepcopy(runs[proof.pop('manifestSha256')])
        d['occurrenceKeys'] = sorted({a['occurrenceKey'] for a in person_keys})
        d['primaryOccurrenceKeys'] = sorted({a['occurrenceKey'] for a in person_keys if a['primary']})
        d['primaryEvidenceKeys'] = sorted({a['occurrenceKey'] for a in evidence_keys if a['primary']})
        out[r['record_id']] = dict({k: v for k, v in r.items() if k != 'data'}, data=d)
    units = {r['data']['sourceId']: r for r in get('source_reading_unit')}
    for r in units.values():
        out[r['record_id']] = dict({k: v for k, v in r.items() if k != 'data'}, data={k: v for k, v in r['data'].items() if k != 'format'})
    for r in get('source_reading_coverage'):
        d = {k: copy.deepcopy(v) for k, v in r['data'].items() if k != 'format'}
        d['ownedUnits'] = [out[units[a['sourceId']]['record_id']]['data'] for a in d['sources'] if a['owned']]
        out[r['record_id']] = dict({k: v for k, v in r.items() if k != 'data'}, data=d)
    return out


def reader_view(rows):
    """What the app decodes from D1 alone (packages/talmud/src/lib/sage-graph/source-reading-store.ts):
    the v1 rows, except that each source segment keeps only the fields `compact` keeps, and the
    source_reading envelope keeps the queue manifest's hash (inputProof.manifestSha256) in place of
    the manifest. Both stay in the private R2 artifact."""
    out = []
    for item in rows:
        d = item['data']
        if item['kind'] == 'passage':
            d = dict(d, sourceSegments=[_segment(s) for s in d['sourceSegments']])
        elif item['kind'] == 'source_reading':
            proof = {k: v for k, v in d['provenance']['inputProof'].items() if k != 'manifest'}
            proof['manifestSha256'] = v1.digest(d['provenance']['inputProof']['manifest'])
            d = dict(d, provenance=dict(d['provenance'], inputProof=proof))
        out.append(dict(item, data=d))
    return out


def records(bundle, ownership_index=None):
    """The v1 importer's rows for one bundle, compacted. The run row is included."""
    items = v1.records(bundle)
    if ownership_index is not None:
        items += v1.coverage_records(bundle['job'], items[0]['passage_id'], ownership_index)
    return compact(items)
