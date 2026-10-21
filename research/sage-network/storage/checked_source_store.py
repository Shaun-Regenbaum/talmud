"""Store root-approved checked source readings (checked-source-reading-v1) in a source-reading store.

Each checked artifact is replayed by the reviewed adapter, `checked_source.validate.check`, and turned into
rows of format checked-source-store-v1. Nothing here decides what is checked; it stores exactly what root
selected and approved:

  - Root's release selection (first-checked-release-selection-v1) is pinned by the SHA-256 of its exact
    bytes, which the caller passes separately. It names every case: job, plan, approval and artifact
    hashes, the bundle file's hash, and the hash of the root approval file that approves it.
  - Each root approval file must have that exact hash and must itself approve the case: a singleton
    approval with the same three hashes, or a batch approval listing the job once with the same hashes.
  - The plan and approval hashes given to `check` come only from there. They are never read from the
    bundle's own `plan` or `approval`, which would let a bundle approve itself.
  - The rebuilt artifact must have root's exact artifact hash and counts.
  - At most one checked version of a raw queue result is stored. A second one for the same raw result is
    refused; replacing a version will need an explicit supersession, which this first format does not
    offer yet.
  - Every local field the adapter returns is kept: people with typed mentions, connections with pair
    support separate from held direction and details, explicit holds and rejections, coverage holes,
    and the raw-to-derived binding chain. Rows are screening proposals with local IDs; no historical
    identity is accepted. Ownership units come from the pinned ownership manifest, and the legacy graph
    still wins for its own records.
  - The source segments a reader needs are stored with the reading, each with the exact text hash the
    job bound.

The private R2 object is the checked bundle file itself, its exact bytes, under the content-addressed key
of the hash root's selection pins for it. It carries the original result's exact bytes (`rawResultText`),
so the raw v4 answer and the derived v2 answer stay byte for byte as saved; the binding pins their hashes.
The v1 artifacts are untouched.
"""
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from checked_source.validate import VERSION as CHECKED_VERSION, check, strict_json  # noqa: E402
from source_coverage import pinned_index, records as coverage_records  # noqa: E402

FORMAT = 'checked-source-store-v1'
KINDS = {'checked_reading', 'checked_person', 'checked_connection', 'checked_decision', 'checked_coverage',
         'checked_unit', 'checked_ownership'}
# source_reading_stores.STORE_KINDS lists these too; a test keeps the two equal.
SELECTION_VERSION = 'first-checked-release-selection-v1'
SINGLE_APPROVAL = 'approve_exact_checked_artifact_for_store_preparation'
BATCH_APPROVAL = 'root-checked-batch-preparation-approval-v1'
ARTIFACT_BUCKET = 'talmud-source-evidence'
ARTIFACT_PREFIX = 'source-readings/checked-v1/artifacts/'
KEPT_PROVENANCE = ('segment_id', 'focal', 'piece')
HEX = re.compile(r'[0-9a-f]{64}')


def require(value, message):
    if not value:
        raise ValueError(message)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def selected_cases(selection_text, selection_pin, approval_texts):
    """Root's selection, by job ID, after every case is matched to the root approval that approves it.
    `selection_pin` is given by the caller; `approval_texts` maps a file hash to that file's exact text."""
    require(isinstance(selection_text, str) and sha(selection_text) == selection_pin,
            'Checked release selection is not the one root pinned')
    selection = strict_json(selection_text)
    require(selection.get('version') == SELECTION_VERSION and selection.get('productionApproved') is False,
            'Unknown checked release selection')
    cases = selection['cases']
    jobs = [c['jobId'] for c in cases]
    require(len(jobs) == len(set(jobs)), 'A job is selected twice')
    require((selection['readings'], selection['people'], selection['connections']) ==
            (len(cases), sum(c['people'] for c in cases), sum(c['connections'] for c in cases)),
            'Selection totals differ from its cases')
    approvals = {}
    for file_hash, text in approval_texts.items():
        require(sha(text) == file_hash, 'Root approval file differs from its hash')
        approvals[file_hash] = strict_json(text)
    out = {}
    for case in cases:
        for key in ('planHash', 'approvalHash', 'artifactHash', 'bundleFileSha256', 'rootApprovalFileSha256'):
            require(isinstance(case.get(key), str) and HEX.fullmatch(case[key]), 'Selected case needs ' + key)
        approval = approvals.get(case['rootApprovalFileSha256'])
        require(approval is not None, 'Missing root approval for ' + case['jobId'])
        pins = (case['planHash'], case['approvalHash'], case['artifactHash'])
        if approval.get('version') == BATCH_APPROVAL:
            listed = [c for c in approval['approvedCases'] if c['jobId'] == case['jobId']]
            require(len(listed) == 1 and (listed[0]['planHash'], listed[0]['approvalHash'], listed[0]['artifactHash']) == pins,
                    'Root batch approval does not approve this exact case: ' + case['jobId'])
        else:
            require(approval.get('decision') == SINGLE_APPROVAL and
                    (approval['planHash'], approval['approvalHash'], approval['artifactHash']) == pins,
                    'Root approval does not approve this exact case: ' + case['jobId'])
            require(approval.get('historicalIdentitiesAccepted') is False, 'A checked artifact cannot accept identities')
        out[case['jobId']] = case
    return selection, out


def selection_index(inputs):
    """Resolve selections only from caller-pinned inputs, never from stored envelope hashes.
    A single input remains supported for existing callers; each additional selection is explicit."""
    if inputs is None:
        return {}
    if isinstance(inputs, dict):
        inputs = [inputs]
    require(isinstance(inputs, (list, tuple)), 'Checked selections must be explicit pinned inputs')
    out = {}
    for item in inputs:
        require(isinstance(item, dict) and set(item) == {'selection', 'pin', 'approvals'},
                'Each checked selection needs its text, external pin and approvals')
        require(item['pin'] not in out, 'A checked selection is supplied twice')
        _, cases = selected_cases(item['selection'], item['pin'], item['approvals'])
        out[item['pin']] = cases
    return out


def checked(bundle_text, case, index):
    """Replay one bundle with root's pins only, and require root's exact artifact."""
    require(sha(bundle_text) == case['bundleFileSha256'], 'Bundle file differs from the selection')
    bundle = strict_json(bundle_text)
    require(bundle['job']['job_id'] == case['jobId'], 'Bundle belongs to another job')
    from source_reading_stores import store_for
    store = store_for(bundle['job'])
    result = check(bundle, expected_plan_hash=case['planHash'], expected_approval_hash=case['approvalHash'],
                   ownership_index=index)
    require(result['version'] == CHECKED_VERSION, 'Unexpected checked artifact version')
    require(result['artifactHash'] == case['artifactHash'], 'Checked artifact differs from the approved one')
    result['store'] = store
    require((len(result['people']), len(result['connections'])) == (case['people'], case['connections']),
            'Checked artifact counts differ from the selection')
    return bundle, result


def artifact(bundle_text):
    """The bundle file's exact bytes, under the hash root's selection pins for it."""
    raw = bundle_text.encode()
    digest = hashlib.sha256(raw).hexdigest()
    return dict(bucket=ARTIFACT_BUCKET, key=ARTIFACT_PREFIX + digest + '.json', sha256=digest, bytes=len(raw),
                mediaType='application/json')


def segment(source):
    out = {k: source[k] for k in ('source_id', 'ref', 'edition', 'sha256', 'text')}
    out['provenance'] = {k: source['provenance'][k] for k in KEPT_PROVENANCE if k in source['provenance']}
    require(hashlib.sha256(out['text'].encode()).hexdigest() == out['sha256'], 'Source text differs from its bound hash')
    return out


def records(bundle_text, case, index, selection_pin):
    """The rows for one selected checked artifact."""
    bundle, result = checked(bundle_text, case, index)
    store = result.pop('store')
    job = bundle['job']
    pid = 'cs1-' + result['artifactHash']
    decisions = {(d['kind'], d['after']['id'] if d['after'] else d['originalId']): d for d in result['decisions']}
    out = []

    def add(kind, ident, data, subject=None, object_=None):
        out.append(dict(record_id=kind + ':' + ident, kind=kind, passage_id=pid, ref=job['focal_ref'], subject_id=subject,
                        object_id=object_, authority='screening', decision='needs_review',
                        data=dict(copy.deepcopy(data), format=FORMAT)))

    binding = result['binding']
    focal = [i for i, s in enumerate(job['sources']) if s['provenance'].get('focal') is True]
    require(len(focal) == 1, 'A checked reading needs one focal source')
    add('checked_reading', pid, dict(
        version=CHECKED_VERSION, readingId=pid, jobId=job['job_id'], artifactHash=result['artifactHash'],
        planHash=result['planHash'], approvalHash=result['approvalHash'], selectionSha256=selection_pin,
        rootApprovalFileSha256=case['rootApprovalFileSha256'], bundleFileSha256=case['bundleFileSha256'],
        reviewHashes=result['reviewHashes'], binding=binding, originalStatus=result['originalStatus'],
        originalCompileError=result['originalCompileError'],
        wholeReadingFullyChecked=result['wholeReadingFullyChecked'],
        # Shown in place of the raw reading of exactly this queue result, never of any other reading.
        supersedes=dict(rawResultHash=binding['rawResultHash'], rawFileSha256=binding['rawFileSha256']),
        segments=[segment(s) for s in job['sources']], focal=focal[0],
        artifact=artifact(bundle_text), historicalIdentityAccepted=False, confirmedFacts=False))
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
        if decision['action'] in ('hold', 'reject'):
            # Held and rejected items stay on record as explicit omissions.
            add('checked_decision', pid + '/' + decision['id'], dict(decision, readingId=pid))
    add('checked_coverage', pid, dict(readingId=pid, sourceCoverage=result['sourceCoverage'],
                                      wholeReadingFullyChecked=result['wholeReadingFullyChecked']))
    # Publication ownership from the pinned manifest, exactly as for compact readings.
    for row in coverage_records(job, pid, index):
        kind = 'checked_unit' if row['kind'] == 'source_reading_unit' else 'checked_ownership'
        out.append(dict(row, record_id=kind + row['record_id'][len(row['kind']):], kind=kind,
                        data=dict(row['data'], format=FORMAT)))
    # The envelope lists every other row of the reading, so a reader can tell when one is missing.
    out[0]['data']['contains'] = {kind: sorted(r['record_id'] for r in out if r['kind'] == kind)
                                  for kind in sorted(KINDS - {'checked_reading'})}
    ownership = next(r['data'] for r in out if r['kind'] == 'checked_ownership')
    require(ownership['sources'] == result['ownership'], 'Checked ownership differs from the adapter')
    return store, out


def rows_for(store, cases, bundle_texts, index, selection_pin):
    """This store's share of a selection. Every selected bundle is given and hash-checked; rows are built
    only for the readings whose corpus routes to this store."""
    from source_reading_stores import store_for
    require(set(bundle_texts) == set(cases), 'Bundles differ from the selected cases')
    rows, mine = [], 0
    for job in sorted(cases):
        require(sha(bundle_texts[job]) == cases[job]['bundleFileSha256'], 'Bundle file differs from the selection')
        if store_for(strict_json(bundle_texts[job])['job']) != store:
            continue  # the other store's share of the selection
        name, items = records(bundle_texts[job], cases[job], index, selection_pin)
        require(name == store, 'Checked reading belongs to another store: ' + job)
        rows += items
        mine += 1
    require(mine, 'No selected reading belongs to this store')
    return rows


def changes_for(block, selection_text, selection_pin, approval_texts, bundle_texts, ownership,
                parent_revision, legacy_revision, existing=None):
    """One batch of root-selected checked readings. `bundle_texts` maps a job ID to its bundle file's text.
    `existing`: record ID -> row already in the parent revision of the same store."""
    require(FORMAT in block.get('recordFormats', []), 'This store does not hold checked readings yet')
    require(isinstance(legacy_revision, str) and legacy_revision.startswith('sage-graph-'),
            'Name the verified legacy graph revision these readings were checked against')
    _, cases = selected_cases(selection_text, selection_pin, approval_texts)
    rows = rows_for(block['name'], cases, bundle_texts, pinned_index(ownership), selection_pin)
    ids = [r['record_id'] for r in rows]
    require(len(ids) == len(set(ids)), 'Duplicate checked record')
    existing = existing or {}
    # At most one checked version of a raw queue result.
    held = {r['data']['supersedes']['rawResultHash']: r['record_id'] for r in existing.values() if r['kind'] == 'checked_reading'}
    raws = [r['data']['supersedes']['rawResultHash'] for r in rows if r['kind'] == 'checked_reading']
    require(len(raws) == len(set(raws)), 'Two checked versions of one raw result')
    changed = []
    for row in rows:
        if row['kind'] == 'checked_reading':
            other = held.get(row['data']['supersedes']['rawResultHash'])
            require(other in (None, row['record_id']), 'A checked version of this raw result is already stored: ' + str(other))
        old = existing.get(row['record_id'])
        if old is not None:
            require(old == row, 'Existing checked record differs: ' + row['record_id'])
        else:
            changed.append(row)
    return dict(parentRevision=parent_revision, description=f"Add root-selected checked source readings to the {block['name']} store",
                sourceReadingStore=block, checkedSelection=selection_text, checkedRootApprovals=copy.deepcopy(approval_texts),
                checkedBundles=copy.deepcopy(bundle_texts), sourceReadingOwnership=copy.deepcopy(ownership),
                legacyGraphRevision=legacy_revision, records=changed)
