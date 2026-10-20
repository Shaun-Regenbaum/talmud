"""Prepare an immutable graph revision from reviewed changes and a verified export."""
import argparse
import hashlib
import json
import re
import sqlite3
import tempfile
import sys
from collections import Counter
from contextlib import closing
from pathlib import Path
from urllib.parse import urlsplit

from prepare_d1 import encode
from verify_d1 import verify
import shared_records
import identity_proposals

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "identity"))
from prepare_scan import build as build_namesake_changes

ALLOWED_KINDS = {'identity_assessment', 'identity_proposal', 'graph_node', 'registry_person', 'source_identity', 'connection', 'name_occurrence', 'place_review', 'era_review', 'era_assessment', 'namesake_scan', 'namesake_registry', 'name_reading'}
READING_KINDS = {'sage', 'biblical_person', 'other_human', 'deity', 'angel', 'supernatural', 'group', 'not_a_person'}
READING_STATUSES = {'registry_candidate', 'local', 'unresolved', 'nonhuman', 'error'}

COLUMNS = 'record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json'


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def literal(value):
    return 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"


def valid_https_url(raw_url):
    if not isinstance(raw_url, str) or not raw_url.startswith('https://') or any(c.isspace() or ord(c) < 32 for c in raw_url):
        return False
    try:
        url = urlsplit(raw_url)
        port = url.port
        host = url.hostname or ''
    except ValueError:
        return False
    return bool(re.fullmatch(r'(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', host)) and url.username is None and url.password is None and (port is None or 0 <= port <= 65535)


def validate_reviewed_era(era):
    if (not isinstance(era, dict) or type(era.get('start')) is not int or
            type(era.get('end')) is not int or era['end'] <= era['start'] or
            any(not isinstance(era.get(k), str) or not era[k].strip() for k in ('label', 'labelHe'))):
        raise ValueError('Invalid registry era')
    source = era.get('source')
    if (not isinstance(source, dict) or not isinstance(source.get('title'), str) or
            not source['title'].strip() or not valid_https_url(source.get('url'))):
        raise ValueError('Invalid registry era source')


def validate_generation_evidence(evidence, person_id, registry):
    if (not isinstance(evidence, dict) or evidence.get('personId') != person_id or
            evidence.get('supportedGeneration') != registry.get('generation') or
            not isinstance(evidence.get('supportedGeneration'), str) or
            not evidence.get('supportedGeneration') or
            not isinstance(evidence.get('decision'), str) or not evidence['decision'].strip()):
        raise ValueError('Invalid sourced generation evidence')
    source = evidence.get('source')
    if (not isinstance(source, dict) or not valid_https_url(source.get('url')) or
            any(not isinstance(source.get(k), str) or not source[k].strip() for k in ('exactExcerpt', 'summary'))):
        raise ValueError('Invalid sourced generation reference')


def validate_registry_person(key, row, data):
    if 'era' in data:
        validate_reviewed_era(data['era'])
    match = re.fullmatch(r'registry_person:([a-z0-9()-]+)', key)
    if not match or row[4] != match[1] or row[5] is not None or row[7] != 'supported':
        raise ValueError('Invalid reviewed registry indexes: ' + key)
    if data.get('identityStatus') != 'reviewed_person':
        raise ValueError('Registry person needs explicit review status: ' + key)
    for name in ('canonical', 'canonicalHe'):
        if not isinstance(data.get(name), str) or not data[name].strip():
            raise ValueError('Registry person needs names: ' + key)
    for name in ('aliases', 'places'):
        if not isinstance(data.get(name), list) or any(not isinstance(v, str) or not v for v in data[name]):
            raise ValueError('Invalid registry list: ' + key)
    # Read the same vocabulary as the card; do not maintain a second era list.
    definitions = (Path(__file__).resolve().parents[3] / 'packages/talmud/src/client/generations.ts').read_text()
    declaration = definitions.split('export type GenerationId =', 1)[1].split(';', 1)[0]
    generations = set(re.findall(r"'([^']+)'", declaration))
    if 'unknown' not in generations:
        raise ValueError('Could not read the card generation vocabulary')
    if 'generation' not in data or data['generation'] not in generations | {None}:
        raise ValueError('Invalid registry generation: ' + key)
    if 'region' not in data or data['region'] not in ('israel', 'bavel', None):
        raise ValueError('Invalid registry region: ' + key)
    if 'moved' not in data or data['moved'] not in ('bavel->israel', 'israel->bavel', 'both', None):
        raise ValueError('Invalid registry movement: ' + key)
    if 'bio' not in data or (data['bio'] is not None and (not isinstance(data['bio'], str) or not data['bio'])):
        raise ValueError('Invalid registry biography: ' + key)
    sources = data.get('sources')
    if not isinstance(sources, list) or not sources:
        raise ValueError('Registry person needs sources: ' + key)
    for source in sources:
        if not isinstance(source, dict) or not isinstance(source.get('title'), str) or not source['title'].strip() or not isinstance(source.get('url'), str):
            raise ValueError('Invalid registry source: ' + key)
        raw_url = source['url']
        url = urlsplit(raw_url)
        # Source references use public DNS names (ASCII or punycode). urlsplit
        # alone accepts spaces in hosts and nonnumeric/out-of-range ports.
        host = url.hostname or ''
        valid_host = re.fullmatch(r'(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', host)
        try:
            port = url.port
        except ValueError:
            raise ValueError('Invalid registry source URL: ' + key) from None
        if not raw_url.startswith('https://') or not valid_host or url.username is not None or url.password is not None or any(ord(ch) < 32 for ch in raw_url) or (port is not None and not 0 <= port <= 65535):
            raise ValueError('Invalid registry source URL: ' + key)


def canonical_registry_slug(slug):
    duplicates_path = Path(__file__).resolve().parents[3] / 'packages/talmud/src/lib/data/rabbi-duplicates.json'
    duplicates = json.loads(duplicates_path.read_text())['duplicates']
    return duplicates.get(slug, slug)


def review_receipt_sha256(review):
    """Hash of one review receipt without its own hash field."""
    return digest(encode({k: v for k, v in review.items() if k != 'receiptSha256'}))


def validate_unresolved_acceptance(key, data, proposal, proposal_row, accepted, rows):
    # The saved proposal named nobody. Its null stays in proposedPersonId; the
    # reviewers' choice is a separate field, backed by receipts bound to this
    # case and by evidence quoting the target's own words.
    # The receipts prove integrity and binding only: they are unaltered and name
    # this case, proposal and passage. The importer cannot open review files, so
    # it cannot prove a review happened; the release verifier must open each
    # file named by fileSha256 and compare its case, decision and chosen person.
    answer = proposal.get('answer') or {}
    if proposal.get('status') != 'complete' or answer.get('status') != 'unresolved' or answer.get('personId') is not None:
        raise ValueError('Only an unresolved saved proposal can be overridden: ' + key)
    if data.get('proposedPersonId') is not None or data.get('reviewerChosenPersonId') != accepted:
        raise ValueError('Reviewer choice must be explicit and separate from the proposal: ' + key)
    if canonical_registry_slug(accepted) != accepted:
        raise ValueError('Reviewer choice must be a canonical registry person: ' + key)
    case = proposal['case']
    passage = json.loads(rows['passage:' + case['personKey'].split('/')[0]][-1])
    source_sha = digest(json.dumps(passage['source'], ensure_ascii=False, sort_keys=True))
    target = next((p for p in passage['people'] if p['id'] == case['personKey'].split('/')[1]), None)
    if not target or not any(e.get('location') == 'passage' and target['quote'] in e.get('quote', '')
                             for e in data.get('evidence') or []):
        raise ValueError('Evidence must quote the target occurrence: ' + key)
    override = data.get('acceptedOverUnresolvedProposal')
    if not isinstance(override, dict) or not isinstance(override.get('reason'), str) or not override['reason'].strip():
        raise ValueError('Override of an unresolved proposal needs a reason: ' + key)
    reviews = override.get('reviews')
    if not isinstance(reviews, list) or len(reviews) < 2:
        raise ValueError('Override needs at least two reviews: ' + key)
    bound = dict(caseId=case['id'], personKey=case['personKey'], proposalPayloadSha256=proposal_row[-2],
                 sourceSha256=source_sha, decision='accept', acceptedPersonId=accepted)
    for review in reviews:
        if (not isinstance(review, dict) or any(review.get(k) != v for k, v in bound.items()) or
                not isinstance(review.get('reviewer'), str) or not review['reviewer'].strip() or
                not re.fullmatch(r'[0-9a-f]{64}', str(review.get('fileSha256'))) or
                review.get('receiptSha256') != review_receipt_sha256(review)):
            raise ValueError('Review receipt is not bound to this case: ' + key)
    if len({r['reviewer'] for r in reviews}) != len(reviews) or len({r['fileSha256'] for r in reviews}) != len(reviews):
        raise ValueError('Override reviews must come from different reviewers and files: ' + key)


def claim_projection(claim_row):
    """The fields a reading copies from a live claim record, in the reading's own names."""
    live = json.loads(claim_row[-1])
    claim = live['claim']
    speech = claim.get('field') == 'speech'
    a, b = (claim.get('speaker'), claim.get('addressee')) if speech else (claim.get('a'), claim.get('b'))
    people = {p['id']: p for p in live.get('participants') or []}
    return {'field': claim.get('field'), 'kind': claim.get('kind') if speech else claim.get('relation'), 'from': a, 'to': b,
            'quote': claim.get('quote'), 'quoteLocation': claim.get('quoteLocation'), 'classification': live.get('classification'),
            'reviewReasons': live.get('reviewReasons'),
            'participants': [{k: people[i].get(k) for k in ('id', 'label', 'localId', 'named')} for i in (a, b) if i in people]}


def registry_text(record, field):
    value = record.get(field)
    return [value] if isinstance(value, str) else [v for v in value if isinstance(v, str)] if isinstance(value, list) else []


SOURCE_QUALITY_KEYS = {'sourceReferenceVerified', 'status', 'ref', 'reason', 'grounds', 'repeatedText'}


def validate_source_quality(key, row, quality):
    # A warning that the passage reference itself is in doubt. It travels inside
    # the reading so every reader of the record sees it; it never names a
    # replacement reference, because none has been verified.
    if (not isinstance(quality, dict) or not set(quality) <= SOURCE_QUALITY_KEYS or quality.get('sourceReferenceVerified') is not False or
            quality.get('status') != 'source_reference_unverified' or quality.get('ref') != row[3] or
            not isinstance(quality.get('reason'), str) or not quality['reason'].strip() or not isinstance(quality.get('grounds'), list) or
            not quality['grounds'] or any(not isinstance(g, dict) or set(g) != {'file', 'sha256', 'finding'} or not str(g['file']).strip() or
                                          not re.fullmatch(r'[0-9a-f]{64}', str(g['sha256'])) or not str(g['finding']).strip()
                                          for g in quality['grounds'])):
        raise ValueError('Source reference warning is incomplete: ' + key)
    repeated = quality.get('repeatedText')
    if repeated is not None and (not isinstance(repeated, dict) or set(repeated) != {'textSha256', 'copies', 'segmentIds'} or
                                 not re.fullmatch(r'[0-9a-f]{64}', str(repeated['textSha256'])) or type(repeated['copies']) is not int or
                                 repeated['copies'] < 2 or not isinstance(repeated['segmentIds'], list) or len(repeated['segmentIds']) != repeated['copies']):
        raise ValueError('Source reference warning is incomplete: ' + key)


def validate_name_reading(key, row, data, rows, previous=None):
    # A first reading of one source person: a proposal with its reasons and
    # quotes. It never resolves an identity and never becomes a connection.
    match = re.fullmatch(r'name_reading:([a-z0-9][a-z0-9-]*)/(case-[0-9a-f]+)', key)
    person_key = data.get('personKey') or ''
    pid, _, local = person_key.partition('/')
    if not match or match[2] != data.get('caseId'):
        raise ValueError('Reading key differs from its case: ' + key)
    if not local or row[2] != pid or data.get('passageId') != pid or row[4] != 'local:' + person_key or row[5] is not None:
        raise ValueError('Reading indexes differ from its person: ' + key)
    passage_row, person_row = rows.get('passage:' + pid), rows.get('person:' + person_key)
    if not passage_row or not person_row or person_row[1] != 'person':
        raise ValueError('Reading needs its passage and person: ' + key)
    passage = json.loads(passage_row[-1])
    source, original = data.get('source') or {}, data.get('original') or {}
    if (source.get('livePassagePayloadSha256') != passage_row[-2] or row[3] != passage['ref'] or
            source.get('sourceSha256') != digest(encode(passage['source'])) or  # readings hash the compact form
            original.get('livePersonPayloadSha256') != person_row[-2] or
            not any(p['id'] == local for p in passage['people'])):
        raise ValueError('Reading is not bound to the current source: ' + key)
    local_ids = {pid + '/' + p['id'] for p in passage['people']}
    # Everything the reader saved stays byte-for-byte: strip what the builder added and compare.
    if previous is not None:
        # A later version may only add the source reference warning. Everything else,
        # including the saved case, stays exactly as first imported.
        before = json.loads(previous[-1])
        if (previous[1] != 'name_reading' or previous[2:8] != row[2:8] or 'sourceQuality' in before or 'sourceQuality' not in data or
                {k: v for k, v in data.items() if k != 'sourceQuality'} != before):
            raise ValueError('A reading can only gain a source reference warning: ' + key)
    if 'sourceQuality' in data:
        validate_source_quality(key, row, data['sourceQuality'])
    copied = {k: v for k, v in data.items() if k not in ('runId', 'chunk', 'caseFileSha256', 'caseSha256', 'registryRecords', 'sourceQuality')}
    if 'relationships' not in data or digest(encode(copied)) != data.get('caseSha256'):
        raise ValueError('Reading differs from the saved case: ' + key)

    def in_source(quote, location):
        locations = ('before', 'after') if location == 'context' else (location,)  # stored claims use "context" for the line before or after
        return bool(quote) and any(isinstance(passage['source'].get(k), str) and quote in passage['source'][k] for k in locations)

    # Registry people named anywhere in the reading are bound to their current record by hash.
    bound = data.get('registryRecords') or {}

    def registry(slug):
        record_row = rows.get('registry_person:' + slug)
        if not record_row or canonical_registry_slug(slug) != slug or bound.get(slug) != record_row[-2]:
            raise ValueError('Reading names an unknown, duplicate or unbound registry person: ' + key)
        return json.loads(record_row[-1])

    reading, named = data.get('reading') or {}, set()
    if (data.get('proposalOnly') is not True or reading.get('status') != 'read' or reading.get('isInitialProposal') is not True or
            reading.get('historicalIdentityResolved') is not False):
        raise ValueError('A reading must stay an unresolved initial proposal: ' + key)
    if reading.get('entityKind') not in READING_KINDS or reading.get('identityStatus') not in READING_STATUSES:
        raise ValueError('Unknown reading kind or status: ' + key)
    if not isinstance(reading.get('reason'), str) or not reading['reason'].strip():
        raise ValueError('Reading needs a reason: ' + key)
    proposed = reading.get('proposedRegistryId')
    if (proposed is not None) != (reading['identityStatus'] == 'registry_candidate'):
        raise ValueError('Only a registry candidate names a registry person: ' + key)
    if proposed is not None:
        record = registry(proposed); named.add(proposed)
        if reading.get('proposedRegistryName') != {'canonical': record.get('canonical'), 'canonicalHe': record.get('canonicalHe')}:
            raise ValueError('Reading misstates a registry name: ' + key)
    for alternative in reading.get('alternatives') or []:
        if not isinstance(alternative.get('why'), str) or not alternative['why'].strip():
            raise ValueError('Reading alternative needs a reason: ' + key)
        if alternative.get('registryId') is not None:
            record = registry(alternative['registryId']); named.add(alternative['registryId'])
            if 'canonicalHe' in alternative and alternative['canonicalHe'] != record.get('canonicalHe'):
                raise ValueError('Reading misstates a registry name: ' + key)
    for evidence in list(reading.get('registryEvidence') or []) + [a['registryEvidence'] for a in reading.get('alternatives') or [] if a.get('registryEvidence')]:
        record = registry(evidence.get('registryId')); named.add(evidence['registryId'])
        if not evidence.get('quote') or not any(evidence['quote'] in text for text in registry_text(record, evidence.get('field'))):
            raise ValueError('Registry evidence is not in the registry record: ' + key)
    if not isinstance(reading.get('evidence'), list) or not reading['evidence']:
        raise ValueError('Reading needs evidence: ' + key)
    for item in reading['evidence']:
        if not in_source(item.get('quote'), item.get('location')):
            raise ValueError('Reading quote is not in its source: ' + key)
    if set(bound) != named:
        raise ValueError('Registry bindings differ from the people the reading names: ' + key)
    for seen in reading.get('existingReviewedRecords') or []:
        existing = rows.get(seen.get('recordId'))
        if not existing or existing[1] != seen.get('kind') or existing[7] != seen.get('decision'):
            raise ValueError('Reading misstates an existing reviewed record: ' + key)
    claims = (data.get('relationships') or {}).get('claims') or []
    for claim in claims:
        live = claim.get('liveClaimRecord') or {}
        claim_row = rows.get(live.get('recordId'))
        if (not claim_row or claim_row[1] != 'claim' or claim_row[2] != pid or claim_row[-2] != live.get('payloadSha256') or
                live.get('decision') != claim_row[7] or claim.get('proposalOnly') is not True or
                any(claim.get(k) != v for k, v in claim_projection(claim_row).items()) or
                (claim.get('carried') and not in_source(claim.get('quote'), claim.get('quoteLocation')))):
            raise ValueError('Reading misstates a claim: ' + key)
        if not isinstance(claim.get('readerVerdictMeaning'), str) or not claim['readerVerdictMeaning'].strip() or (
                claim.get('readerVerdict') in ('unc', 'bad') and not (claim.get('readerNote') or '').strip()):
            raise ValueError('Claim reading needs its reason: ' + key)
    # A correction is made in the case file itself; the replaced file is kept by the reader.
    # The wrong claim stays as written but is no longer carried, and what the text does say
    # sits beside it as a sourced proposal. Unnamed people stay unnamed.
    correction = data.get('correction')
    corrected = [claim for claim in claims if 'correctedBy' in claim or 'correctedEvent' in claim]
    if (correction is not None or corrected) and (
            not isinstance(correction, dict) or not corrected or not str(correction.get('reviewId') or '').strip() or
            not re.fullmatch(r'[0-9a-f]{64}', str(correction.get('supersedesCaseFileSha256'))) or
            correction['supersedesCaseFileSha256'] == data.get('caseFileSha256')):
        raise ValueError('Correction is not bound to the file it replaced: ' + key)
    for claim in corrected:
        event = claim.get('correctedEvent')
        if claim.get('correctedBy') != correction['reviewId'] or (event is not None and claim.get('carried') is not False):
            raise ValueError('Corrected claim does not match its correction: ' + key)
        if event is None:
            continue
        ends = [event.get('observer') or {}, event.get('seen') or {}]
        if (event.get('derivedFromClaimId') != claim.get('claimId') or event.get('proposalOnly') is not True or
                event.get('isInitialProposal') is not True or not in_source(event.get('quote'), event.get('quoteLocation')) or
                not any(e.get('localId') for e in ends) or any(e.get('localId') and e['localId'] not in local_ids for e in ends) or
                any(not e.get('localId') and e.get('named') != 'unnamed_not_captured' for e in ends)):
            raise ValueError('Corrected event is not a sourced proposal: ' + key)


def validate_identity_assessment(key, row, data, rows, parent_keys, member):
    if 'acceptedPersonId' not in data or 'proposedPersonId' not in data:
        raise ValueError('Assessment needs explicit identity decisions: ' + key)
    proposal_key = data.get('proposalId')
    proposal_row = rows.get(proposal_key)
    if proposal_key not in parent_keys or not proposal_row or proposal_row[1] != 'identity_proposal':
        raise ValueError('Assessment needs an existing proposal: ' + key)
    if data.get('proposalPayloadSha256') != proposal_row[-2]:
        raise ValueError('Assessment proposal hash differs: ' + key)
    proposal = json.loads(proposal_row[-1])
    case = proposal['case']
    person_key = case['personKey']
    proposed = (proposal.get('answer') or {}).get('personId')
    if (key != 'identity_assessment:' + case['id'] or data.get('personKey') != person_key or
            data.get('proposedPersonId') != proposed or row[2:4] != proposal_row[2:4] or
            row[4] != 'local:' + person_key or person_key.split('/')[0] != row[2]):
        raise ValueError('Assessment indexes differ from proposal: ' + key)
    if row[6:8] != ('source_review', 'reviewed'):
        raise ValueError('Assessment must record a source review: ' + key)
    outcome = data.get('outcome')
    accepted = data.get('acceptedPersonId')
    if outcome not in {'accepted', 'held'} or row[5] != accepted:
        raise ValueError('Invalid assessment outcome: ' + key)
    if outcome == 'held':
        if accepted is not None:
            raise ValueError('Held assessment cannot accept an identity: ' + key)
    else:
        if not isinstance(accepted, str) or not accepted:
            raise ValueError('Accepted assessment must match its proposal: ' + key)
        if proposed is None:
            validate_unresolved_acceptance(key, data, proposal, proposal_row, accepted, rows)
        elif accepted != canonical_registry_slug(proposed):
            raise ValueError('Accepted assessment must match its proposal: ' + key)
        identity_row = rows.get('source_identity:' + person_key)
        identity = json.loads(identity_row[-1]) if identity_row else {}
        if (not identity_row or identity_row[1] != 'source_identity' or
                identity_row[2:6] != (row[2], row[3], accepted, None) or
                identity_row[6] not in {'source_review', 'user_correction'} or
                identity_row[7] != 'accepted_registry_identity' or
                identity.get('personKey') != person_key or identity.get('personId') != accepted or
                identity.get('status') != 'accepted_registry_identity' or
                identity.get('historicalIdentityResolved') is not True):
            raise ValueError('Assessment needs an accepted source identity: ' + key)
        member(person_key, accepted)
        node = json.loads(rows['graph_node:' + accepted][-1])
        registry_row = rows.get('registry_person:' + accepted)
        if node.get('identityResolved') is not True or not registry_row or registry_row[1] != 'registry_person':
            raise ValueError('Assessment needs a resolved registry node: ' + key)
    if data.get('generationDecision') not in {'held', 'inherited_registry', 'sourced'}:
        raise ValueError('Invalid assessment generation decision: ' + key)
    if data.get('generationDecision') == 'sourced':
        if outcome != 'accepted':
            raise ValueError('Sourced generation requires an accepted identity: ' + key)
        validate_generation_evidence(data.get('generationEvidence'), accepted, json.loads(registry_row[-1]))
    if not isinstance(data.get('reason'), str) or not data['reason'].strip():
        raise ValueError('Assessment needs a reason: ' + key)
    evidence = data.get('evidence')
    if not isinstance(evidence, list) or not evidence or any(
            not isinstance(e, dict) or not isinstance(e.get('location'), str) or
            not isinstance(e.get('quote'), str) or not e['quote'] for e in evidence):
        raise ValueError('Assessment needs source evidence: ' + key)
    sources = data.get('sources')
    if not isinstance(sources, list) or not sources:
        raise ValueError('Assessment needs source URLs: ' + key)
    for raw_url in sources:
        if not isinstance(raw_url, str):
            raise ValueError('Invalid assessment source URL: ' + key)
        try:
            url = urlsplit(raw_url)
            port = url.port
            host = url.hostname or ''
        except ValueError:
            raise ValueError('Invalid assessment source URL: ' + key) from None
        if (not raw_url.startswith('https://') or
                not re.fullmatch(r'(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', host) or
                url.username is not None or url.password is not None or
                any(ch.isspace() or ord(ch) < 32 for ch in raw_url) or
                (port is not None and not 0 <= port <= 65535)):
            raise ValueError('Invalid assessment source URL: ' + key)


def prepare(export, manifest_path, changes_path, output, *, shared=False):
    parent = json.loads(manifest_path.read_text())
    verify(export, manifest_path)
    changes = json.loads(changes_path.read_text())
    if changes['parentRevision'] != parent['revision']:
        raise ValueError('Changes refer to another parent revision')
    with tempfile.TemporaryDirectory() as temporary, closing(sqlite3.connect(Path(temporary) / 'graph.sqlite')) as db:
        db.execute('PRAGMA journal_mode=OFF')
        db.execute('PRAGMA synchronous=OFF')
        db.executescript(export.read_text())
        if shared:
            shared_records.ensure_schema(db)
        table = shared_records.record_table(db)
        state = db.execute('SELECT state FROM sage_graph_revisions WHERE id=?',
                           (parent['revision'],)).fetchone()
        if state != ('verified',):
            raise ValueError('Parent revision is not verified')
        rows = {r[0]: r for r in db.execute(
            f'SELECT {COLUMNS} FROM {table} WHERE revision_id=?',
            (parent['revision'],))}
        parent_keys = set(rows)
        if 'namesakeRegistry' in changes or 'namesakeRegistrySha256' in changes or any(item['kind'] in {'namesake_scan','namesake_registry'} for item in changes['records']):
            # Recompute every proposed record from the verified parent before import.
            expected = build_namesake_changes(list(rows.values()), changes.get('namesakeRegistry', {}), parent)
            if changes != expected:
                raise ValueError('Namesake scan differs from verified parent recomputation')
        proposals = [item for item in changes['records'] if item['kind'] == 'identity_proposal']
        if proposals:
            if len(proposals) != len(changes['records']):
                raise ValueError('Proposal archives cannot alter graph facts')
            input_manifest = changes.get('proposalInputManifest', {})
            if (input_manifest.get('revision') != parent['revision'] or
                    input_manifest.get('sourceRecordSetSha256') != parent['recordSetSha256']):
                raise ValueError('Proposal source snapshot differs from verified parent')
            if changes.get('proposalInputManifestSha256') != identity_proposals.sha(input_manifest):
                raise ValueError('Proposal manifest hash differs')
            if len(proposals) != input_manifest.get('cases'):
                raise ValueError('Proposal coverage differs from input manifest')
            by_case = {item['data']['case']['id']: item['data']['case'] for item in proposals}
            file_cases = changes.get('proposalInputFileCases', {})
            if set(file_cases) != set(input_manifest.get('inputFiles', {})):
                raise ValueError('Proposal input files differ')
            covered = []
            for name, ids in file_cases.items():
                covered.extend(ids)
                raw = json.dumps([by_case[i] for i in ids], ensure_ascii=False) + '\n'
                if digest(raw) != input_manifest['inputFiles'][name]:
                    raise ValueError('Proposal input file hash differs')
            if len(covered) != len(set(covered)) or set(covered) != set(by_case):
                raise ValueError('Proposal case coverage differs')
            recovery = changes.get('proposalRecoveryReceipt')
            if recovery is None:
                raise ValueError('Proposal archive requires validated recovery receipt')
            if recovery is not None:
                order = changes['proposalRecoveryOrder']
                data_by_id = {item['data']['case']['id']: item['data'] for item in proposals}
                answer_ids, remaining_ids = order['answers'], order['remaining']
                if len(answer_ids + remaining_ids) != len(set(answer_ids + remaining_ids)) or set(answer_ids + remaining_ids) != set(by_case):
                    raise ValueError('Recovery coverage differs')
                answers = []
                for cid in answer_ids:
                    d = data_by_id[cid]
                    if d['status'] != 'complete':
                        raise ValueError('Recovery answer is not complete')
                    answers.append(dict(id=cid, inputHash=d['inputSha256'], answer=d['answer'], resultHash=d['resultSha256'], recipe=d['recipe'], path=d['resultPath']))
                if any(data_by_id[cid]['status'] not in {'missing', 'failed'} for cid in remaining_ids):
                    raise ValueError('Recovery remainder is not held')
                if recovery.get('sourceManifestHash') != identity_proposals.sha(input_manifest) or recovery.get('sourceRevision') != input_manifest['revision']:
                    raise ValueError('Recovery source binding differs')
                if recovery.get('answersHash') != identity_proposals.sha(answers) or recovery.get('remainingHash') != identity_proposals.sha([by_case[cid] for cid in remaining_ids]):
                    raise ValueError('Recovery bundle differs')
                if (recovery.get('total'), recovery.get('complete'), recovery.get('remaining')) != (len(proposals),len(answer_ids),len(remaining_ids)):
                    raise ValueError('Recovery counts differ')
            audit_receipt = changes.get('proposalAuditReceipt')
            audited = [item['data'] for item in proposals if item['data'].get('audit') is not None]
            if audit_receipt is not None:
                if audit_receipt.get('accepted') is not False or set(audit_receipt['disagreementIds']) != {d['case']['id'] for d in audited}:
                    raise ValueError('Audit archive coverage differs')
                expected_annotations = {d['case']['id']: dict(comparison=identity_proposals.sha(d['audit']['comparison']), review=identity_proposals.sha(d['audit']['review'])) for d in audited}
                if audit_receipt.get('annotationHashes') != expected_annotations:
                    raise ValueError('Audit annotations differ from receipt')
                if any(d['audit']['receiptSha256'] != identity_proposals.sha(audit_receipt) for d in audited):
                    raise ValueError('Audit receipt differs')
            elif audited:
                raise ValueError('Missing audit receipt')
            keys = [item['data']['case']['personKey'] for item in proposals]
            if len(set(keys)) != len(keys):
                raise ValueError('Duplicate proposal person')
        readings = [item for item in changes['records'] if item['kind'] == 'name_reading']
        if readings and len(readings) != len(changes['records']):
            raise ValueError('Name readings cannot alter graph facts')
        changed, previous = {}, {}
        for item in changes['records']:
            key = item['record_id']
            if key in changed:
                raise ValueError('Duplicate change: ' + key)
            if item['kind'] not in ALLOWED_KINDS or not key.startswith(item['kind'] + ':'):
                raise ValueError('Unsupported review kind: ' + key)
            old = rows.get(key)
            if old and old[6] == 'user_correction':
                raise ValueError('Cannot replace a human correction: ' + key)
            if old and item.get('replacesSha256') != old[-2]:
                raise ValueError('Replacement must name the previous hash: ' + key)
            if not old and item.get('replacesSha256'):
                raise ValueError('Replacement does not exist: ' + key)
            if item['kind'] in {'era_review', 'namesake_scan', 'namesake_registry', 'identity_proposal', 'name_reading'}:
                # Only a reading may be superseded, and only to add a source reference warning (checked below).
                if (old and item['kind'] != 'name_reading') or item['authority'] != 'screening' or item.get('decision') != 'needs_review':
                    raise ValueError('Screens must be new unaccepted reviews: ' + key)
            elif item['authority'] != 'source_review':
                raise ValueError('New records must be source reviews: ' + key)
            payload = encode(item['data'])
            row = (key, item['kind'], item.get('passage_id'), item.get('ref'),
                   item.get('subject_id'), item.get('object_id'), item['authority'],
                   item.get('decision'), digest(payload), payload)
            changed[key] = row
            if old:
                previous[key] = old
            rows[key] = row
        def payload(key):
            if key not in rows:
                raise ValueError('Missing record: ' + key)
            return json.loads(rows[key][-1])

        def member(person_key, node_id):
            pid, local = person_key.split('/')
            passage = payload('passage:' + pid)
            if not any(p['id'] == local for p in passage['people']):
                raise ValueError('Unknown passage person: ' + person_key)
            node = payload('graph_node:' + node_id)
            if person_key not in node.get('personKeys', []):
                raise ValueError('Person is not a member of node: ' + person_key)
            return passage

        for key, row in changed.items():
            data = json.loads(row[-1])
            if row[1] == 'identity_proposal':
                identity_proposals.validate(data, payload('passage:' + row[2]))
                expected_key = 'identity_proposal:' + data['runId'] + '/' + data['case']['id']
                if row[3] != data['case']['ref']:
                    raise ValueError('Proposal ref index differs: ' + key)
                if key != expected_key or row[4] != 'local:' + data['case']['personKey'] or row[5] is not None:
                    raise ValueError('Proposal indexes differ: ' + key)
            if row[1] == 'identity_assessment':
                validate_identity_assessment(key, row, data, rows, parent_keys, member)
            if row[1] == 'name_reading':
                validate_name_reading(key, row, data, rows, previous.get(key))
            if row[1] == 'registry_person':
                validate_registry_person(key, row, data)
            if data.get('passageId', row[2]) != row[2] or data.get('ref', row[3]) != row[3]:
                raise ValueError('Payload passage index differs: ' + key)
            if row[1] in {'name_occurrence', 'source_identity', 'place_review'}:
                if data['personId'] != row[4]:
                    raise ValueError('Person index differs: ' + key)
            if row[1] in {'name_occurrence', 'source_identity'}:
                if data['personKey'].split('/')[0] != row[2]:
                    raise ValueError('Person passage differs: ' + key)
                member(data['personKey'], data['personId'])
            if row[1] == 'era_review':
                original = payload('claim:' + data['claimId'])
                if data.get('status') != 'needs_review' or data.get('accepted') is not False:
                    raise ValueError('Era screen payload cannot accept a fact: ' + key)
                pair = (data['a']['personKey'], data['b']['personKey'])
                if (row[4], row[5]) != tuple('local:' + person for person in pair):
                    raise ValueError('Era review indexes differ: ' + key)
                expected_pair = tuple(original['passageId'] + '/' + original['claim'][role] for role in ('speaker', 'addressee'))
                if pair != expected_pair:
                    raise ValueError('Era review pair differs from claim: ' + key)
                if data.get('quote') != original['claim']['quote'] or data.get('evidence') != [dict(quote=original['claim']['quote'], location=original['claim']['quoteLocation'])]:
                    raise ValueError('Era review quote differs from claim: ' + key)
                if original['passageId'] != row[2] or not data.get('evidence'):
                    raise ValueError('Era review claim differs: ' + key)
                for person in (data['a'], data['b']):
                    pid, local = person['personKey'].split('/')
                    source = payload('passage:' + pid)
                    if pid != row[2] or not any(p['id'] == local for p in source['people']):
                        raise ValueError('Era review person differs: ' + key)
            if row[1] == 'era_assessment':
                screen_key = 'era_review:' + data['claimId']
                screen = payload(screen_key)
                if key != 'era_assessment:' + data['claimId'] or data.get('screenPayloadSha256') != rows[screen_key][-2]:
                    raise ValueError('Assessment must identify its original screen: ' + key)
                if (row[2], row[3], row[4], row[5]) != rows[screen_key][2:6]:
                    raise ValueError('Assessment indexes differ from screen: ' + key)
                if row[7] != 'reviewed' or data.get('status') != 'reviewed':
                    raise ValueError('Assessment must record a review: ' + key)
                if data.get('acceptedIdentity') is not False or data.get('acceptedEra') is not False:
                    raise ValueError('An assessment cannot accept an identity or era: ' + key)
                if data.get('outcome') not in {'candidate_set_incomplete', 'full_name_restored', 'existing_correction', 'registry_era_conflict', 'unresolved_title'}:
                    raise ValueError('Unknown era assessment outcome: ' + key)
                if not data.get('reason') or not data.get('nextStep') or not data.get('evidence'):
                    raise ValueError('Assessment needs reasoning, next step and evidence: ' + key)
                if data['evidence'] != screen['evidence']:
                    raise ValueError('Assessment evidence differs from screen: ' + key)
                for slug in data.get('candidateSlugs', []):
                    payload('registry_person:' + slug)
            if row[1] == 'graph_node':
                if data['id'] != row[4] or key != 'graph_node:' + data['id']:
                    raise ValueError('Node index differs: ' + key)
                for person_key in data['personKeys']:
                    member(person_key, data['id'])
                profile = data.get('sourceProfile')
                if profile:
                    source = member(profile['personKey'], data['id'])
                    if not profile['quote'] or profile['quote'] not in source['source']['passage']:
                        raise ValueError('Profile quote differs: ' + key)
                    for place in profile.get('places', []):
                        source = payload('passage:' + place['passageId'])
                        if source['ref'] != place['ref'] or not place['quote'] or place['quote'] not in source['source']['passage']:
                            raise ValueError('Place quote differs: ' + key)
                        if not any(p.startswith(place['passageId'] + '/') for p in data['personKeys']):
                            raise ValueError('Place belongs to another passage: ' + key)
                    target = profile.get('resolvedTo')
                    if target:
                        member(profile['personKey'], target)
                        registry = payload('registry_person:' + target)
                        if profile.get('generation') != registry.get('generation'):
                            raise ValueError('Resolved generation differs: ' + key)
                    era = profile.get('era')
                    if era and (type(era.get('start')) is not int or type(era.get('end')) is not int or era['end'] <= era['start'] or not era.get('source', {}).get('url', '').startswith('https://') or not era.get('label') or not era.get('labelHe')):
                        raise ValueError('Invalid sourced era: ' + key)
            if row[2]:
                passage = rows.get('passage:' + row[2])
                if not passage:
                    raise ValueError('Missing passage: ' + key)
                source = json.loads(passage[-1])
                if row[3] != source['ref']:
                    raise ValueError('Passage reference differs: ' + key)
                for evidence in data.get('evidence', []):
                    text = source['source'].get(evidence['location'])
                    if not evidence['quote'] or not text or evidence['quote'] not in text:
                        raise ValueError('Quote does not match: ' + key)
            if row[1] == 'connection':
                if data['type'] not in {'family', 'intellectual', 'encounter', 'action'}:
                    raise ValueError('Unknown connection type: ' + key)
                if (row[4], row[5]) != (data['a'], data['b']):
                    raise ValueError('Connection indexes differ: ' + key)
                if not data.get('evidence'):
                    raise ValueError('Connection needs evidence: ' + key)
                for person in (data['a'], data['b']):
                    if 'graph_node:' + person not in rows:
                        raise ValueError('Connection person is missing: ' + key)
                    node = payload('graph_node:' + person)
                    if not any(p.startswith(row[2] + '/') for p in node.get('personKeys', [])):
                        raise ValueError('Connection person is outside passage: ' + key)
            if row[1] == 'name_occurrence':
                source = json.loads(rows['passage:' + data['passageId']][-1])['source']
                start, end = data['characterStart'], data['characterEnd']
                if type(start) is not int or type(end) is not int or not 0 <= start < end <= len(source['passage']) or not data['quote']:
                    raise ValueError('Invalid name bounds: ' + key)
                if source['passage'][start:end] != data['quote']:
                    raise ValueError('Name span differs: ' + key)
                expected = digest(json.dumps(source, ensure_ascii=False, sort_keys=True))
                if data['sourceSha256'] != expected:
                    raise ValueError('Name source hash differs: ' + key)
        # A passage whose reference is in doubt cannot gain confirmed identities, name links,
        # places or connections until the reference is verified. Existing records stay as they are.
        unverified = {r[2] for r in rows.values() if r[1] == 'name_reading' and
                      (json.loads(r[-1]).get('sourceQuality') or {}).get('sourceReferenceVerified') is False}
        for key, row in changed.items():
            accepts = row[1] == 'identity_assessment' and json.loads(row[-1]).get('acceptedPersonId')
            if row[2] in unverified and (row[1] in {'source_identity', 'name_occurrence', 'connection', 'place_review'} or accepts):
                raise ValueError('Passage reference is unverified, so it cannot gain confirmed facts: ' + key)
        replaced_nodes = {r[4] for k, r in changed.items() if r[1] == 'graph_node'}
        for key, row in rows.items():
            if key in changed or not replaced_nodes.intersection((row[4], row[5])):
                continue
            data = json.loads(row[-1])
            if row[1] in {'name_occurrence', 'source_identity'}:
                member(data['personKey'], data['personId'])
            if row[1] == 'connection':
                for person in (data['a'], data['b']):
                    if not any(p.startswith(row[2] + '/') for p in payload('graph_node:' + person).get('personKeys', [])):
                        raise ValueError('Replacement invalidates existing connection: ' + key)
        ordered = [rows[k] for k in sorted(rows)]
        manifest = dict(schemaVersion=parent.get('schemaVersion', 1),
                        parentRevision=parent['revision'], change=changes['description'],
                        recordCount=len(rows), countsByKind=dict(sorted(Counter(r[1] for r in ordered).items())),
                        recordSetSha256=digest(encode([r[:-1] for r in ordered])),
                        changesSha256=digest(changes_path.read_text()))
        if proposals:
            manifest['proposalArchive'] = {k: changes.get(k) for k in (
                'proposalInputManifest', 'proposalInputManifestSha256',
                'proposalRecoveryReceipt', 'proposalAuditReceipt')}
        if shared:
            manifest['storageFormat'] = shared_records.FORMAT
        revision = 'sage-graph-' + digest(encode(manifest))[:20]
        sql = [f'INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES ({literal(revision)},{literal(encode(manifest))},\'loading\');']
        if shared:
            sql.extend(shared_records.statements(parent, revision, rows, changed, replaced_keys=parent_keys & set(changed)))
        else:
            # Copy bounded ranges; exclude every changed key before inserting replacements.
            keys = sorted(rows)
            for start in range(0, len(keys), 2000):
                chunk = keys[start:start + 2000]
                excluded = [k for k in changed if chunk[0] <= k <= chunk[-1]]
                exclusion = (' AND record_id NOT IN (' + ','.join(map(literal, excluded)) + ')') if excluded else ''
                sql.append(f'INSERT INTO sage_graph_records(revision_id,{COLUMNS}) SELECT {literal(revision)},{COLUMNS} FROM {table} WHERE revision_id={literal(parent["revision"])} AND record_id>={literal(chunk[0])} AND record_id<={literal(chunk[-1])}{exclusion};')
            for key in sorted(changed):
                sql.append(f'INSERT INTO sage_graph_records(revision_id,{COLUMNS}) VALUES (' + ','.join(map(literal, (revision, *changed[key]))) + ');')
        script = '\n'.join(sql) + '\n'
        db.executescript(script)
        actual = list(db.execute(f'SELECT {COLUMNS} FROM {table} WHERE revision_id=? ORDER BY record_id', (revision,)))
        if actual != ordered:
            raise ValueError('SQL round trip differs')
        if shared:
            shared_records.verify_members(db, revision)
        outputs = {
            'import.sql': script,
            'manifest.json': json.dumps(dict(revision=revision, **manifest), indent=2) + '\n',
            'activate.sql': f"UPDATE sage_graph_revisions SET state='verified' WHERE id={literal(revision)} AND state='loading';\n",
        }
        for name, content in outputs.items():
            target = output / name
            if target.exists() and target.read_text() != content:
                raise ValueError('Refusing to replace different output: ' + str(target))
        output.mkdir(parents=True, exist_ok=True)
        for name, content in outputs.items():
            target = output / name
            pending = target.with_suffix(target.suffix + '.part')
            pending.write_text(content)
            pending.replace(target)
        return dict(revision=revision, changedRecords=len(changed), recordCount=len(rows))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['export', 'manifest', 'changes', 'output']:
        parser.add_argument(name, type=Path)
    parser.add_argument('--shared-records', action='store_true', help='Require migration 0003 and reuse immutable record versions')
    args = parser.parse_args()
    print(json.dumps(prepare(args.export, args.manifest, args.changes, args.output, shared=args.shared_records)))
