"""Store unreviewed machine readings (compact-source-v1) in a source-reading store.

These readings were made by a model and passed the compact checker (`compact_source.validate.check`):
the schema, the exact quotes, word boundaries and the relation contract. Nobody has reviewed them and
no plan or approval stands behind them. They are stored as screening proposals, in the same rows the
app already decodes for checked readings (format checked-source-store-v1), and say so in two places:

  - the envelope has `origin: machine_unreviewed`, `planHash`, `approvalHash` and
    `rootApprovalFileSha256` are null, `reviewHashes` is empty, and every source is `unreviewed`;
  - every person and connection decision is `accept_unreviewed`, never `replace`.

The release is pinned by the SHA-256 of a selection file (machine-release-selection-v1) that the caller
passes separately, as for checked readings. The selection lists every case with its hashes and counts.
It is not an approval of the readings' content; it fixes which readings and which bytes are in the
release. Nothing is decided about who a person historically is.

The private R2 object is the artifact file: the frozen job and the model's exact answer text, under the
hash the selection names. Every stored row is rebuilt from it, so a read-back needs nothing else.

Mapping from a compact answer to the checked shapes:
  - a person keeps its id, label, kind, form, setting and reason. `not_a_person` is held.
    A named or embedded-parent mention is a `printed_name` only where the word boundary also holds for
    any letter or digit (the app's rule); otherwise it is `referential_evidence`. A second person that
    prints the same span is also `referential_evidence`. Other forms use `actor_description`.
  - a relationship becomes a connection only if both ends are retained, reported people, the two ends
    differ, it is asserted (or a response to a teaching), actually reported and positive. Anything else
    is held with its reason and stays on record as a decision.
  - broad type: family relations are `family`, `reports_in_name_of` is `transmission`, the other debate
    and teaching relations are `intellectual_connection`, and `acts_on`/`speaks_to` are `direct_interaction`.
"""
import copy
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import checked_source_store as checked  # noqa: E402
from compact_source.contract import RELATIONS, VERSION as ANSWER_VERSION  # noqa: E402
from compact_source.validate import check as check_answer  # noqa: E402
from ownership.tile_ownership import digest, source_unit  # noqa: E402
from source_coverage import records as coverage_records  # noqa: E402

ORIGIN = 'machine_unreviewed'
SELECTION_VERSION = 'machine-release-selection-v1'
ARTIFACT_VERSION = 'machine-source-artifact-v1'
ARTIFACT_PREFIX = 'source-readings/machine-v1/artifacts/'
ACCEPT = 'accept_unreviewed'
HEX = re.compile(r'[0-9a-f]{64}')


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def canonical_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def make_artifact(job, answer, reader, request_sha256):
    """The artifact file's exact text. `answerText` is the model's answer as saved, canonical JSON."""
    return canonical_text(dict(version=ARTIFACT_VERSION, job=job, answerText=canonical_text(answer),
                               reader=reader, requestSha256=request_sha256))


def _spans(source, quote, occurrence):
    starts, at = [], 0
    while True:
        at = source['text'].find(quote, at)
        if at < 0:
            break
        starts.append(at)
        at += 1
    require(occurrence <= len(starts), 'Quote occurrence is absent from its source')
    start = starts[occurrence - 1]
    return start, start + len(quote)


def _span(anchor, sources):
    source = sources[anchor['source_id']]
    start, end = _spans(source, anchor['quote'], anchor['occurrence'])
    _, offset, _, segment_hash = source_unit(source)
    return dict(sourceId=source['source_id'], edition=source['edition'], segmentId=source['provenance']['segment_id'],
                sourceSha256=source['sha256'], start=start, end=end, quote=anchor['quote'],
                offsetUnit='Unicode code points', segmentStart=offset + start, segmentEnd=offset + end,
                segmentSha256=segment_hash)


def _joins(char):
    """The app's word rule: any letter, mark or number next to a quote makes it part of a longer word."""
    return bool(char) and unicodedata.category(char)[0] in 'LMN'


def _whole_word(source, span):
    text = source['text']
    before = text[span['start'] - 1] if span['start'] > 0 else ''
    after = text[span['end']] if span['end'] < len(text) else ''
    return not _joins(before) and not _joins(after) and unicodedata.category(span['quote'][0])[0] != 'M'


def broad_type(relation):
    category = RELATIONS[relation][0]
    if category == 'family':
        return 'family'
    if relation == 'reports_in_name_of':
        return 'transmission'
    if category in ('debate', 'teaching'):
        return 'intellectual_connection'
    return 'direct_interaction'


def reading(job, answer, ownership_index):
    """The checked-shape result for one machine answer: people, connections, decisions and coverage."""
    check_answer(job, answer)
    sources = {s['source_id']: s for s in job['sources']}
    decisions, people, printed = [], {}, {}
    for person in answer['people']:
        pid = person['id']
        if person['kind'] == 'not_a_person':
            decisions.append(dict(id='hold:person:' + pid, kind='person', originalId=pid, action='hold', after=None,
                                  reason='The reading says this is not a person.'))
            continue
        mentions = []
        for anchor in person['mentions']:
            span = _span(anchor, sources)
            named = person['form'] in ('named', 'embedded_parent')
            role = 'actor_description'
            if named:
                location = (span['sourceId'], span['start'], span['end'])
                if _whole_word(sources[span['sourceId']], span) and printed.get(location, pid) == pid:
                    role = 'printed_name'
                    printed[location] = pid
                else:
                    role = 'referential_evidence'
            elif not _whole_word(sources[span['sourceId']], span):
                role = 'referential_evidence'
            mentions.append(dict(role=role, **span, namePlacementEligible=role == 'printed_name'))
        people[pid] = dict(id=pid, label=person['label'], kind=person['kind'], form=person['form'],
                           setting=person['setting'], mentions=mentions, reason=person['reason'],
                           historicalIdentityResolved=False, status='needs_review')
        decisions.append(dict(id='accept:person:' + pid, kind='person', originalId=pid, action=ACCEPT, after=dict(id=pid),
                              reason='Machine reading, not reviewed.'))
    connections = []
    for rel in answer['relationships']:
        rid = rel['id']
        why = None
        a, b = rel['subject'], rel['object']
        if a is None or b is None:
            why = 'An end of the relationship is unresolved.'
        elif a not in people or b not in people:
            why = 'An end of the relationship is not a retained person.'
        elif a == b:
            why = 'Both ends are the same person.'
        elif people[a]['setting'] != 'reported' or people[b]['setting'] != 'reported':
            why = 'An end is hypothetical or uncertain.'
        elif rel['modality'] not in ('asserted', 'response_to_teaching') or rel['scene_status'] != 'actual_report' \
                or rel['polarity'] != 'positive':
            why = 'The text does not report it as something that happened.'
        elif rel['category'] == 'family' and not (people[a]['kind'] == people[b]['kind'] == 'person'):
            why = 'A family relationship needs two people.'
        if why:
            decisions.append(dict(id='hold:connection:' + rid, kind='connection', originalId=rid, action='hold',
                                  after=None, reason=why))
            continue
        directed = RELATIONS[rel['relation']][1] == 'directed'
        connections.append(dict(
            id=rid, participants=[a, b], broadType=broad_type(rel['relation']),
            direction=dict(status='supported', subject=a, object=b) if directed
            else dict(status='symmetric', subject=None, object=None),
            predicate=dict(status='supported', value=rel['relation']), outcome=dict(status='held', value=None),
            evidence=[_span(e, sources) for e in rel['evidence']], reason=rel['reason'],
            establishesMeeting=False, historicalIdentityResolved=False, status='needs_review', era=None))
        decisions.append(dict(id='accept:connection:' + rid, kind='connection', originalId=rid, action=ACCEPT,
                              after=dict(id=rid), reason='Machine reading, not reviewed.'))
    owned = ownership_index.sources_for(job)
    result = dict(
        version=checked.CHECKED_VERSION, origin=ORIGIN,
        binding=dict(jobHash=digest(job), rawResultHash=digest(answer),
                     rawFileSha256=sha(canonical_text(answer)), originalStatus=ORIGIN),
        originalCompileError=None, planHash=None, approvalHash=None, ownership=owned, decisions=decisions,
        reviewHashes=[], people=list(people.values()), connections=connections,
        sourceCoverage=[dict(sourceId=s['source_id'], status='unreviewed', holes=[]) for s in job['sources']],
        wholeReadingFullyChecked=False, originalStatus=ORIGIN, status='needs_review', confirmedFacts=False,
        episode=copy.deepcopy(answer['episode']))
    result['artifactHash'] = digest(result)
    return result


def parse_artifact(text):
    artifact = checked.strict_json(text)
    require(isinstance(artifact, dict) and set(artifact) == {'version', 'job', 'answerText', 'reader', 'requestSha256'}
            and artifact['version'] == ARTIFACT_VERSION, 'Unknown machine artifact')
    require(isinstance(artifact['reader'], str) and HEX.fullmatch(artifact['requestSha256']), 'Machine artifact fields differ')
    answer = checked.strict_json(artifact['answerText'])
    require(canonical_text(answer) == artifact['answerText'] and answer.get('schema_version') == ANSWER_VERSION,
            'Machine answer is not canonical compact-source-v1')
    return artifact, answer


def selected_cases(selection_text, selection_pin):
    """The release's cases by job ID. `selection_pin` is given by the caller, never read from the files."""
    require(isinstance(selection_text, str) and sha(selection_text) == selection_pin,
            'Machine release selection is not the one that was pinned')
    selection = checked.strict_json(selection_text)
    require(selection.get('version') == SELECTION_VERSION and selection.get('productionApproved') is False,
            'Unknown machine release selection')
    cases = selection['cases']
    jobs = [c['jobId'] for c in cases]
    require(len(jobs) == len(set(jobs)), 'A job is selected twice')
    require((selection['readings'], selection['people'], selection['connections']) ==
            (len(cases), sum(c['people'] for c in cases), sum(c['connections'] for c in cases)),
            'Selection totals differ from its cases')
    for case in cases:
        for key in ('artifactHash', 'bundleFileSha256'):
            require(isinstance(case.get(key), str) and HEX.fullmatch(case[key]), 'Selected case needs ' + key)
    return selection, {c['jobId']: c for c in cases}


def artifact_ref(text):
    raw = text.encode()
    digest_ = hashlib.sha256(raw).hexdigest()
    return dict(bucket=checked.ARTIFACT_BUCKET, key=ARTIFACT_PREFIX + digest_ + '.json', sha256=digest_, bytes=len(raw),
                mediaType='application/json')


def records(artifact_text, case, index, selection_pin):
    """The rows for one selected machine reading, in the checked row shapes."""
    from source_reading_stores import store_for
    require(sha(artifact_text) == case['bundleFileSha256'], 'Artifact file differs from the selection')
    artifact, answer = parse_artifact(artifact_text)
    job = artifact['job']
    require(job['job_id'] == case['jobId'] == answer['job_id'], 'Artifact belongs to another job')
    store = store_for(job)
    result = reading(job, answer, index)
    require(result['artifactHash'] == case['artifactHash'], 'Machine reading differs from the selected one')
    require((len(result['people']), len(result['connections'])) == (case['people'], case['connections']),
            'Machine reading counts differ from the selection')
    pid = 'cs1-' + result['artifactHash']
    decisions = {(d['kind'], d['after']['id'] if d['after'] else d['originalId']): d for d in result['decisions']}
    out = []

    def add(kind, ident, data, subject=None, object_=None):
        out.append(dict(record_id=kind + ':' + ident, kind=kind, passage_id=pid, ref=job['focal_ref'], subject_id=subject,
                        object_id=object_, authority='screening', decision='needs_review',
                        data=dict(copy.deepcopy(data), format=checked.FORMAT)))

    binding = result['binding']
    focal = [i for i, s in enumerate(job['sources']) if s['provenance'].get('focal') is True]
    require(len(focal) == 1, 'A machine reading needs one focal source')
    add('checked_reading', pid, dict(
        version=checked.CHECKED_VERSION, origin=ORIGIN, readingId=pid, jobId=job['job_id'],
        artifactHash=result['artifactHash'], planHash=None, approvalHash=None, selectionSha256=selection_pin,
        rootApprovalFileSha256=None, bundleFileSha256=case['bundleFileSha256'], reviewHashes=[], binding=binding,
        originalStatus=ORIGIN, originalCompileError=None, wholeReadingFullyChecked=False,
        supersedes=dict(rawResultHash=binding['rawResultHash'], rawFileSha256=binding['rawFileSha256']),
        segments=[checked.segment(s) for s in job['sources']], focal=focal[0], artifact=artifact_ref(artifact_text),
        reader=artifact['reader'], requestSha256=artifact['requestSha256'], episode=result['episode'],
        recipe=ANSWER_VERSION, historicalIdentityAccepted=False, confirmedFacts=False))
    for person in result['people']:
        add('checked_person', pid + '/' + person['id'],
            dict(person, readingId=pid, decision=decisions[('person', person['id'])]), subject=pid + '/' + person['id'])
    for connection in result['connections']:
        direction = connection['direction']
        a, b = ((direction['subject'], direction['object']) if direction['status'] == 'supported'
                else sorted(connection['participants']))
        add('checked_connection', pid + '/' + connection['id'],
            dict(connection, readingId=pid, decision=decisions[('connection', connection['id'])]),
            subject=pid + '/' + a, object_=pid + '/' + b)
    for decision in result['decisions']:
        if decision['action'] == 'hold':
            add('checked_decision', pid + '/' + decision['id'], dict(decision, readingId=pid))
    add('checked_coverage', pid, dict(readingId=pid, sourceCoverage=result['sourceCoverage'],
                                      wholeReadingFullyChecked=False))
    for row in coverage_records(job, pid, index):
        kind = 'checked_unit' if row['kind'] == 'source_reading_unit' else 'checked_ownership'
        out.append(dict(row, record_id=kind + row['record_id'][len(row['kind']):], kind=kind,
                        data=dict(row['data'], format=checked.FORMAT)))
    out[0]['data']['contains'] = {kind: sorted(r['record_id'] for r in out if r['kind'] == kind)
                                  for kind in sorted(checked.KINDS - {'checked_reading'})}
    ownership = next(r['data'] for r in out if r['kind'] == 'checked_ownership')
    require(ownership['sources'] == result['ownership'], 'Machine ownership differs from the index')
    return store, out


def rows_for(store, cases, artifact_texts, index, selection_pin):
    """This store's share of a selection. Every selected artifact is given and hash-checked."""
    from source_reading_stores import store_for
    require(set(artifact_texts) == set(cases), 'Artifacts differ from the selected cases')
    rows, mine = [], 0
    for job in sorted(cases):
        text = artifact_texts[job]
        require(sha(text) == cases[job]['bundleFileSha256'], 'Artifact file differs from the selection')
        if store_for(parse_artifact(text)[0]['job']) != store:
            continue
        name, items = records(text, cases[job], index, selection_pin)
        require(name == store, 'Machine reading belongs to another store: ' + job)
        rows += items
        mine += 1
    require(mine, 'No selected reading belongs to this store')
    return rows


def changes_for(block, selection_text, selection_pin, artifact_texts, ownership, parent_revision, legacy_revision,
                existing=None):
    """One batch of selected machine readings. `existing`: record ID -> row already in the parent revision."""
    from source_coverage import pinned_index
    require(checked.FORMAT in block.get('recordFormats', []), 'This store does not hold checked readings yet')
    require(isinstance(legacy_revision, str) and legacy_revision.startswith('sage-graph-'),
            'Name the verified legacy graph revision these readings were made against')
    _, cases = selected_cases(selection_text, selection_pin)
    rows = rows_for(block['name'], cases, artifact_texts, pinned_index(ownership), selection_pin)
    ids = [r['record_id'] for r in rows]
    require(len(ids) == len(set(ids)), 'Duplicate machine record')
    existing = existing or {}
    held = {r['data']['supersedes']['rawResultHash']: r['record_id'] for r in existing.values()
            if r['kind'] == 'checked_reading'}
    raws = [r['data']['supersedes']['rawResultHash'] for r in rows if r['kind'] == 'checked_reading']
    require(len(raws) == len(set(raws)), 'Two machine readings of one answer')
    changed = []
    for row in rows:
        if row['kind'] == 'checked_reading':
            other = held.get(row['data']['supersedes']['rawResultHash'])
            require(other in (None, row['record_id']), 'This answer is already stored: ' + str(other))
        old = existing.get(row['record_id'])
        if old is not None:
            require(old == row, 'Existing record differs: ' + row['record_id'])
        else:
            changed.append(row)
    return dict(parentRevision=parent_revision,
                description=f"Add unreviewed machine source readings to the {block['name']} store",
                sourceReadingStore=block, machineSelection=selection_text, machineArtifacts=copy.deepcopy(artifact_texts),
                sourceReadingOwnership=copy.deepcopy(ownership), legacyGraphRevision=legacy_revision, records=changed)
