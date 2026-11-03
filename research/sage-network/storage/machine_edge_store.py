"""Store the edges of machine readings that a second model checked and tied to known sages.

A machine reading lists people and edges between them (machine_source_store.py). Its names are only words in
one passage. This module adds the next step. For each edge whose two ends name a sage on our list, a model of
the other family reads the passage and the candidate sages' profiles and answers: does the text say this edge,
is the direction right, and which sage is each end? An edge is kept when all three come out clear:

  supported = yes, direction = ok or na, and both ends are a chosen candidate (never none or unsure).

Everything else stays in the artifact and is not stored as an edge. The rows say who read and who checked
(model family only), and bind to the exact machine reading edge they judge: the passage ID and edge ID must
exist in the parent revision, with the same relation and the same two labels.

The release is pinned like the others. A `machine-edge-release-selection-v1` file names the artifact by its
SHA-256 and its counts, and its own hash is given separately by the caller. The artifact is the exact check
answers (`machine-edge-checks-v1`), kept in R2 at `source-readings/machine-edges-v1/artifacts/<sha256>.json`.

Rows (new kinds, the existing store format):
  machine_edge_release   one per release: counts, artifact, selection pin and the hash of the list of its edge rows
  machine_verified_edge  one per kept edge: the two sages, the relation, the passage and who judged it
"""
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import checked_source_store as checked  # noqa: E402

KINDS = {'machine_edge_release', 'machine_verified_edge'}
SELECTION_VERSION = 'machine-edge-release-selection-v1'
ARTIFACT_VERSION = 'machine-edge-checks-v1'
ARTIFACT_PREFIX = 'source-readings/machine-edges-v1/artifacts/'
PASSAGE_PREFIX = 'mv1-'
HEX = re.compile(r'[0-9a-f]{64}')
SUPPORTED = ('yes', 'no', 'unsure')
# The labels a checker may give an edge. "interacts_with" is for two actors who deal with each other
# when no other label fits. A strict check keeps the reader's own label; a wider check may give a better one.
RELATIONS = ('asks', 'answers', 'opposes', 'supports', 'responds_to_teaching', 'reports_in_name_of', 'speaks_to',
             'acts_on', 'teaches', 'student_of', 'child_of', 'child_in_law_of', 'spouse_of', 'sibling_of', 'interacts_with')
DIRECTION = ('ok', 'swapped', 'na')


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def canonical_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def make_artifact(items):
    """The artifact file's exact text. Each item is one passage's check: its reading's passage ID, the model
    families, the candidate sages offered for each end of each edge, and the checker's answer."""
    return canonical_text(dict(version=ARTIFACT_VERSION, items=sorted(items, key=lambda i: i['job_id'])))


def parse_artifact(text):
    artifact = checked.strict_json(text)
    require(isinstance(artifact, dict) and set(artifact) == {'version', 'items'} and artifact['version'] == ARTIFACT_VERSION,
            'Unknown edge check artifact')
    require(canonical_text(artifact) == text, 'Edge check artifact is not canonical')
    jobs = [i['job_id'] for i in artifact['items']]
    require(jobs == sorted(set(jobs)), 'Edge check items are repeated or out of order')
    return artifact


def kept(verdict, candidates):
    """True when the check is clear on all three points."""
    require(verdict['supported'] in SUPPORTED and verdict['direction'] in DIRECTION, 'Unknown edge verdict')
    require(verdict.get('relation', RELATIONS[0]) in RELATIONS, 'Unknown relation in an edge verdict')
    for end in ('subject', 'object'):
        chosen = verdict[end + '_sage']
        require(chosen in candidates[end] or chosen in ('none', 'unsure'), 'A sage was chosen that was not offered')
    return (verdict['supported'] == 'yes' and verdict['direction'] in ('ok', 'na')
            and verdict['subject_sage'] in candidates['subject'] and verdict['object_sage'] in candidates['object']
            and verdict['subject_sage'] != verdict['object_sage'])


def selected_cases(selection_text, selection_pin):
    require(isinstance(selection_text, str) and sha(selection_text) == selection_pin,
            'Edge release selection is not the one that was pinned')
    selection = checked.strict_json(selection_text)
    require(selection.get('version') == SELECTION_VERSION and selection.get('productionApproved') is False,
            'Unknown edge release selection')
    require(HEX.fullmatch(selection.get('artifactSha256', '')), 'Selection needs the artifact hash')
    require(all(type(selection.get(k)) is int and selection[k] >= 0 for k in ('passages', 'edgesChecked', 'edgesKept')),
            'Selection needs its counts')
    return selection


def artifact_ref(text):
    raw = text.encode()
    digest = hashlib.sha256(raw).hexdigest()
    return dict(bucket=checked.ARTIFACT_BUCKET, key=ARTIFACT_PREFIX + digest + '.json', sha256=digest, bytes=len(raw),
                mediaType='application/json')


def records(artifact_text, selection, selection_pin, lookup):
    """Every row of one release. `lookup(record_id)` returns the stored row (a dict with `data`) or None."""
    require(sha(artifact_text) == selection['artifactSha256'], 'Edge check artifact differs from the selection')
    artifact = parse_artifact(artifact_text)
    rid = PASSAGE_PREFIX + selection['artifactSha256']
    out, checked_n, by_verdict = [], 0, {}
    for item in artifact['items']:
        passage = item['reading_passage_id']
        reading = lookup('checked_reading:' + passage)
        require(reading is not None and reading['data'].get('origin') == 'machine_unreviewed'
                and reading['data']['jobId'] == item['job_id'], 'A checked edge names a reading that is not a stored machine reading')
        require(item['checker_family'] != item['reader_family'] and item['reader_family'] == reading['data']['reader'],
                'An edge must be checked by the other model family than its reader')
        require(sorted(v['id'] for v in item['verdicts']) == sorted(item['candidates']) and len({v['id'] for v in item['verdicts']}) == len(item['verdicts']),
                'Verdicts differ from the edges offered')
        for verdict in sorted(item['verdicts'], key=lambda v: v['id']):
            candidates = item['candidates'][verdict['id']]
            connection = lookup(f"checked_connection:{passage}/{verdict['id']}")
            require(connection is not None and connection['data']['decision']['action'] == 'accept_unreviewed',
                    'A checked edge names a connection that is not stored')
            checked_n += 1
            key = (verdict['supported'], verdict['direction'])
            by_verdict[':'.join(key)] = by_verdict.get(':'.join(key), 0) + 1
            if not kept(verdict, candidates):
                continue
            data = connection['data']
            a, b = (data['direction']['subject'], data['direction']['object']) if data['direction']['status'] == 'supported' else data['participants']
            ends = {}
            for end, local in (('subject', a), ('object', b)):
                person = lookup(f'checked_person:{passage}/{local}')
                require(person is not None, 'A checked edge names a person that is not stored')
                ends[end] = dict(local=local, label=person['data']['label'], sage=verdict[end + '_sage'])
            out.append(dict(
                record_id=f"machine_verified_edge:{rid}/{passage}/{verdict['id']}", kind='machine_verified_edge', passage_id=rid,
                ref=reading['ref'], subject_id=ends['subject']['sage'], object_id=ends['object']['sage'],
                authority='screening', decision='needs_review',
                data=dict(format=checked.FORMAT, releaseId=rid, readingPassageId=passage, edgeId=verdict['id'], jobId=item['job_id'],
                          relation=verdict.get('relation') or data['predicate']['value'],
                          **(dict(readerRelation=data['predicate']['value']) if verdict.get('relation') else {}),
                          broadType=data['broadType'], symmetric=data['direction']['status'] != 'supported',
                          subject=ends['subject'], object=ends['object'], readerFamily=item['reader_family'],
                          checkerFamily=item['checker_family'], note=verdict.get('note', ''), historicalIdentityAccepted=False,
                          confirmedFacts=False)))
    ids = sorted(r['record_id'] for r in out)
    require(len(ids) == len(set(ids)), 'Duplicate verified edge')
    require((len(artifact['items']), checked_n, len(out)) == (selection['passages'], selection['edgesChecked'], selection['edgesKept']),
            'Edge check counts differ from the selection')
    envelope = dict(
        record_id='machine_edge_release:' + rid, kind='machine_edge_release', passage_id=rid, ref=None, subject_id=None,
        object_id=None, authority='screening', decision='needs_review',
        data=dict(format=checked.FORMAT, version=ARTIFACT_VERSION, releaseId=rid, selectionSha256=selection_pin,
                  artifact=artifact_ref(artifact_text), passages=len(artifact['items']), edgesChecked=checked_n, edgesKept=len(out),
                  verdicts=dict(sorted(by_verdict.items())), edgeRecords=len(ids), edgeRecordsSha256=sha(canonical_text(ids)),
                  historicalIdentityAccepted=False,
                  confirmedFacts=False))
    return [envelope] + out


def changes_for(block, selection_text, selection_pin, artifact_text, parent_revision, existing):
    """`existing`: record ID -> row of the parent revision (the machine readings the edges refer to)."""
    require(checked.FORMAT in block.get('recordFormats', []), 'This store does not hold checked readings yet')
    selection = selected_cases(selection_text, selection_pin)
    rows = records(artifact_text, selection, selection_pin, existing.get)
    changed = []
    for row in rows:
        old = existing.get(row['record_id'])
        if old is not None:
            require(old == row, 'Existing edge record differs: ' + row['record_id'])
        else:
            changed.append(row)
    return dict(parentRevision=parent_revision, description=f"Add machine reading edges that a second model checked to the {block['name']} store",
                sourceReadingStore=block, machineEdgeSelection=selection_text, machineEdgeArtifact=artifact_text, records=changed)
