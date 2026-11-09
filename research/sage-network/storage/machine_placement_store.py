"""Store which sage each name in a machine reading was placed on, with the reasons and the other sages that were possible.

A reading lists people by the name the text uses ("Rav Yosef", "Elazar" inside "Rav Yitzchak ben Elazar"). A name run then judged,
for each such name, which sage on our list it is. This module keeps the outcome next to the reading it belongs to.

Each name ends in one of four states:
  placed       a sage was chosen. `agreement` says how many independent models chose it.
  which_one    two models chose different sages. Both are kept as options, each with its reason.
  not_on_list  the models agree the person is not a sage we hold.
  unplaced     not settled. A father named only inside a son's name stays here unless two models agree on a sage.

Nothing here says a placement is certain. Rows are `needs_review`, like every other machine row.

The release is pinned like the others. A `machine-placement-release-selection-v1` file names the artifact by its SHA-256 and its
counts, and its own hash is given separately by the caller. The artifact is the exact placements (`machine-placements-v1`), kept in R2
at `source-readings/machine-placements-v1/artifacts/<sha256>.json`.

Rows (new kinds, the existing store format):
  machine_placement_release  one per release: counts, artifact, selection pin and the hash of the list of its placement rows
  machine_name_placement     one per name: its state, the chosen sage or the options, the reasons and who agreed
"""
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import checked_source_store as checked  # noqa: E402

KINDS = {'machine_placement_release', 'machine_name_placement'}
SELECTION_VERSION = 'machine-placement-release-selection-v1'
ARTIFACT_VERSION = 'machine-placements-v1'
ARTIFACT_PREFIX = 'source-readings/machine-placements-v1/artifacts/'
PASSAGE_PREFIX = 'mp1-'
HEX = re.compile(r'[0-9a-f]{64}')
STATUSES = ('placed', 'which_one', 'not_on_list', 'unplaced')
AGREEMENT = ('two_models', 'one_model', 'none')


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def canonical_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def make_artifact(items):
    """The artifact file's exact text. Each item is one passage: its job, its reading's passage ID and its names."""
    return canonical_text(dict(version=ARTIFACT_VERSION, items=sorted(items, key=lambda i: i['job_id'])))


def parse_artifact(text):
    artifact = checked.strict_json(text)
    require(isinstance(artifact, dict) and set(artifact) == {'version', 'items'} and artifact['version'] == ARTIFACT_VERSION,
            'Unknown placement artifact')
    require(canonical_text(artifact) == text, 'Placement artifact is not canonical')
    jobs = [i['job_id'] for i in artifact['items']]
    require(jobs == sorted(set(jobs)), 'Placement items are repeated or out of order')
    return artifact


def check_name(name):
    """The rules one name must follow. Raises when a name says more than its evidence supports."""
    require(name['status'] in STATUSES and name['agreement'] in AGREEMENT, 'Unknown placement state')
    candidates = set(name['candidates'])
    answers = name['answers']
    require(all(a['sage'] in candidates or a['sage'] in ('unsure', 'not_listed') for a in answers), 'An answer names a sage that was not offered')
    require(all(o['sage'] in candidates for o in name['others']), 'An option names a sage that was not offered')
    if name['status'] == 'placed':
        require(name['sage'] in candidates, 'A placed name needs a sage that was offered')
        agreeing = [a for a in answers if a['sage'] == name['sage']]
        require(len(agreeing) >= (2 if name['agreement'] == 'two_models' else 1), 'The agreement is not backed by the answers')
        require(name['agreement'] != 'none', 'A placed name needs at least one model behind it')
    else:
        require(name['sage'] is None, 'Only a placed name carries a sage')
    if name['status'] == 'which_one':
        require(len({a['sage'] for a in answers if a['sage'] in candidates}) >= 2, 'A which-one name needs two different sages')
    require(isinstance(name['reason'], str), 'A placement needs its reason (it may be empty only for not_on_list)')


def selected_cases(selection_text, selection_pin):
    require(isinstance(selection_text, str) and sha(selection_text) == selection_pin, 'Placement release selection is not the one that was pinned')
    selection = checked.strict_json(selection_text)
    require(selection.get('version') == SELECTION_VERSION and selection.get('productionApproved') is False, 'Unknown placement release selection')
    require(HEX.fullmatch(selection.get('artifactSha256', '')), 'Selection needs the artifact hash')
    require(all(type(selection.get(k)) is int and selection[k] >= 0 for k in ('passages', 'names')), 'Selection needs its counts')
    require(isinstance(selection.get('byStatus'), dict) and set(selection['byStatus']) <= set(STATUSES), 'Selection needs its counts by state')
    return selection


def artifact_ref(text):
    raw = text.encode()
    digest = hashlib.sha256(raw).hexdigest()
    return dict(bucket=checked.ARTIFACT_BUCKET, key=ARTIFACT_PREFIX + digest + '.json', sha256=digest, bytes=len(raw), mediaType='application/json')


def records(artifact_text, selection, selection_pin, lookup):
    """Every row of one release. `lookup(record_id)` returns the stored row (a dict with `data`) or None."""
    require(sha(artifact_text) == selection['artifactSha256'], 'Placement artifact differs from the selection')
    artifact = parse_artifact(artifact_text)
    rid = PASSAGE_PREFIX + selection['artifactSha256']
    out, by_status, names = [], {}, 0
    for item in artifact['items']:
        passage = item['reading_passage_id']
        reading = lookup('checked_reading:' + passage)
        require(reading is not None and reading['data'].get('origin') == 'machine_unreviewed' and reading['data']['jobId'] == item['job_id'],
                'A placement names a reading that is not a stored machine reading')
        require(sorted(n['person'] for n in item['names']) == [n['person'] for n in sorted(item['names'], key=lambda n: n['person'])]
                and len({n['person'] for n in item['names']}) == len(item['names']), 'A person is placed twice in one passage')
        for name in sorted(item['names'], key=lambda n: n['person']):
            check_name(name)
            person = lookup(f"checked_person:{passage}/{name['person']}")
            require(person is not None and person['data']['label'] == name['label'], 'A placement names a person that is not stored')
            names += 1
            by_status[name['status']] = by_status.get(name['status'], 0) + 1
            out.append(dict(
                record_id=f"machine_name_placement:{rid}/{passage}/{name['person']}", kind='machine_name_placement', passage_id=rid,
                ref=reading['ref'], subject_id=name['sage'], object_id=None, authority='screening', decision='needs_review',
                data=dict(format=checked.FORMAT, releaseId=rid, readingPassageId=passage, jobId=item['job_id'], person=name['person'],
                          label=name['label'], form=name['form'], status=name['status'], sage=name['sage'], reason=name['reason'],
                          others=name['others'], answers=name['answers'], agreement=name['agreement'], historicalIdentityAccepted=False,
                          confirmedFacts=False)))
    ids = sorted(r['record_id'] for r in out)
    require(len(ids) == len(set(ids)), 'Duplicate placement')
    require((len(artifact['items']), names, dict(sorted(by_status.items()))) == (selection['passages'], selection['names'], dict(sorted(selection['byStatus'].items()))),
            'Placement counts differ from the selection')
    envelope = dict(
        record_id='machine_placement_release:' + rid, kind='machine_placement_release', passage_id=rid, ref=None, subject_id=None,
        object_id=None, authority='screening', decision='needs_review',
        data=dict(format=checked.FORMAT, version=ARTIFACT_VERSION, releaseId=rid, selectionSha256=selection_pin, artifact=artifact_ref(artifact_text),
                  passages=len(artifact['items']), names=names, byStatus=dict(sorted(by_status.items())), placementRecords=len(ids),
                  placementRecordsSha256=sha(canonical_text(ids)), historicalIdentityAccepted=False, confirmedFacts=False))
    return [envelope] + out


def changes_for(block, selection_text, selection_pin, artifact_text, parent_revision, existing):
    """`existing`: record ID -> row of the parent revision (the machine readings the names belong to)."""
    require(checked.FORMAT in block.get('recordFormats', []), 'This store does not hold checked readings yet')
    selection = selected_cases(selection_text, selection_pin)
    rows = records(artifact_text, selection, selection_pin, existing.get)
    changed = []
    for row in rows:
        old = existing.get(row['record_id'])
        if old is not None:
            require(old == row, 'Existing placement record differs: ' + row['record_id'])
        else:
            changed.append(row)
    return dict(parentRevision=parent_revision, description=f"Add the sages that names in machine readings were placed on to the {block['name']} store",
                sourceReadingStore=block, machinePlacementSelection=selection_text, machinePlacementArtifact=artifact_text, records=changed)
