"""Replay a frozen reading and apply explicitly approved item decisions.

This adapter never converts a failed queue result into a successful reading.
The caller pins the plan and approval manifest independently; self-approval is
not authority. Output is local screening data, not accepted historical facts.
"""
import copy
import json
import unicodedata

from compact_source_v4 import validate as v4
from compact_source_v4.body import assemble_request, digest, sha
from ownership.tile_ownership import source_unit

VERSION = 'checked-source-reading-v1'


def require(value, message):
    if not value:
        raise ValueError(message)


def keys(value, expected):
    require(isinstance(value, dict) and set(value) == set(expected.split()), 'Unexpected fields: ' + expected)


def text(value):
    require(isinstance(value, str) and value.strip(), 'Empty text')


def unique(values, field):
    result = {v[field]: v for v in values}
    require(len(result) == len(values), 'Duplicate ' + field)
    return result


def span(value, sources, role=None):
    keys(value, 'sourceId edition segmentId sourceSha256 start end quote')
    require(value['sourceId'] in sources, 'Unknown source')
    source = sources[value['sourceId']]
    require((value['edition'], value['segmentId'], value['sourceSha256']) ==
            (source['edition'], source['provenance']['segment_id'], source['sha256']), 'Source identity differs')
    start, end = value['start'], value['end']
    require(type(start) is int and type(end) is int and 0 <= start < end <= len(source['text']), 'Invalid offsets')
    require(source['text'][start:end] == value['quote'], 'Source slice differs')
    if role in ('printed_name', 'actor_description'):
        require(not v4.V2.hebrew_word_character(source['text'], start - 1) and
                not v4.V2.hebrew_word_character(source['text'], end) and
                not unicodedata.combining(value['quote'][0]), 'Partial word anchor')
    _, offset, _, segment_hash = source_unit(source)
    return {**value, 'offsetUnit': 'Unicode code points', 'segmentStart': offset + start,
            'segmentEnd': offset + end, 'segmentSha256': segment_hash}


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError('Nonfinite JSON number')))


def original(bundle):
    """Rebuild the request and successful compiler record, preserving failures."""
    job, config = bundle['job'], bundle['config']
    sources = v4.check_job(job)
    request = assemble_request(job)
    route = config['route']
    payload = dict(config['parameters'], messages=request['messages'],
                   provider={'only': [route['provider']], 'allow_fallbacks': False,
                             'require_parameters': True, 'max_price': {
                                 'prompt': route['inputPrice'] * 1e6,
                                 'completion': route['outputPrice'] * 1e6}})
    result = strict_json(bundle['rawResultText'])
    checksum = result.get('resultHash')
    require(checksum == digest({k: v for k, v in result.items() if k != 'resultHash'}), 'Result checksum differs')
    require(result['jobId'] == job['job_id'] and result['jobHash'] == digest(job), 'Result job differs')
    require(result['manifestHash'] == digest(config), 'Result configuration differs')
    attempt = bundle['attempt']
    require((attempt['jobId'], attempt['jobHash'], attempt['manifestHash'], attempt['requestHash']) ==
            (job['job_id'], digest(job), digest(config), digest(payload)), 'Attempt/request differs')
    answer, compiled, error = None, None, None
    try:
        choice = result['response']['choices'][0]
        if choice['finish_reason'] == 'stop':
            answer = strict_json(choice['message']['content'])
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        pass
    if answer is not None:
        try:
            compiled = v4.check(job, answer, request)
        except v4.Invalid as exc:
            error = str(exc)
    if result['status'] in ('complete', 'needs_context'):
        require(compiled is not None and result.get('answer') == answer and result.get('compiled') == compiled,
                'Successful reading does not replay')
        expected_status = 'complete' if answer['episode']['coverage'] == 'complete_for_supplied_text' else 'needs_context'
        require(result['status'] == expected_status, 'Coverage status differs')
    else:
        require(result['status'] == 'failed', 'Unsupported original status')
        require(compiled is None, 'Failed reading unexpectedly validates')
    derived = compiled['compile']['derived_v2_answer'] if compiled else None
    binding = dict(jobHash=digest(job), configHash=digest(config), requestHash=digest(payload),
                   compilerRequestHash=request['request_sha256'], recipeHash=request['recipe']['sha256'],
                   rawFileSha256=sha(bundle['rawResultText'].encode()), rawResultHash=checksum,
                   originalAnswerHash=digest(answer) if answer is not None else None,
                   derivedAnswerHash=digest(derived) if derived else None,
                   sourceBindings=request['units'], originalStatus=result['status'])
    return sources, answer, derived, binding, error


def person(value, sources):
    keys(value, 'id label kind form setting mentions reason')
    for key in ('id', 'label', 'reason'):
        text(value[key])
    require(value['kind'] in ('person', 'group', 'deity', 'angel', 'supernatural'), 'Invalid person kind')
    require(value['form'] in ('named', 'embedded_parent', 'unnamed', 'generic'), 'Invalid person form')
    require(value['setting'] in ('reported', 'hypothetical', 'uncertain'), 'Invalid person setting')
    require(value['form'] != 'embedded_parent' or value['kind'] == 'person', 'Invalid parent kind')
    require(isinstance(value['mentions'], list) and value['mentions'], 'Missing mentions')
    mentions = []
    for mention in value['mentions']:
        keys(mention, 'role span')
        role = mention['role']
        require(role in ('printed_name', 'actor_description', 'referential_evidence'), 'Invalid mention role')
        require(role != 'printed_name' or value['form'] in ('named', 'embedded_parent'), 'Unnamed actor is not printed name')
        mentions.append(dict(role=role, **span(mention['span'], sources, role), namePlacementEligible=role == 'printed_name'))
    require(len({digest(m) for m in mentions}) == len(mentions), 'Duplicate mention')
    return {**value, 'mentions': mentions, 'historicalIdentityResolved': False, 'status': 'needs_review'}


def connection(value, sources, people):
    keys(value, 'id participants broadType direction predicate outcome evidence reason')
    text(value['id']); text(value['reason'])
    pair = value['participants']
    require(isinstance(pair, list) and len(pair) == 2 and len(set(pair)) == 2 and all(p in people for p in pair), 'Invalid retained pair')
    require(value['broadType'] in ('direct_interaction', 'intellectual_connection', 'family', 'transmission'), 'Invalid broad type')
    require(all(people[p]['setting'] == 'reported' for p in pair), 'Hypothetical or uncertain pair cannot be reported connection')
    if value['broadType'] == 'family':
        require(all(people[p]['kind'] == 'person' for p in pair), 'Family endpoints must be people')
    direction = value['direction']
    keys(direction, 'status subject object')
    require(direction['status'] in ('supported', 'held', 'symmetric'), 'Invalid direction status')
    if direction['status'] == 'supported':
        require(set((direction['subject'], direction['object'])) == set(pair), 'Direction endpoints differ')
    else:
        require(direction['subject'] is None and direction['object'] is None, 'Held/symmetric direction cannot have endpoints')
    for name in ('predicate', 'outcome'):
        detail = value[name]; keys(detail, 'status value')
        require(detail['status'] in ('supported', 'held'), 'Invalid detail status')
        require(detail['value'] is None if detail['status'] == 'held' else isinstance(detail['value'], str) and bool(detail['value'].strip()), 'Invalid held detail')
    predicate = value['predicate']['value']
    if predicate is not None:
        require(predicate in v4.V2.RELATIONS, 'Unknown relation')
        category, directed = v4.V2.RELATIONS[predicate]
        broad = value['broadType']
        require((category == 'family') == (broad == 'family'), 'Family category differs')
        require(broad != 'intellectual_connection' or category in ('debate', 'teaching'), 'Intellectual predicate differs')
        require(predicate != 'reports_in_name_of' or broad == 'transmission', 'Transmission is not a meeting')
        require(predicate != 'responds_to_teaching' or broad == 'intellectual_connection', 'Teaching response is not a meeting')
        require(direction['status'] == ('symmetric' if directed == 'symmetric' else 'supported'), 'Specific predicate needs supported direction')
    require(value['evidence'], 'Missing connection evidence')
    evidence = [span(e, sources) for e in value['evidence']]
    return {**value, 'evidence': evidence, 'establishesMeeting': False,
            'historicalIdentityResolved': False, 'status': 'needs_review', 'era': None}


def check(bundle, *, expected_plan_hash, expected_approval_hash, ownership_index):
    """Return selected local items; the caller still owns publication/human precedence."""
    keys(bundle, 'job config attempt rawResultText plan approval reviews')
    plan, approval = bundle['plan'], bundle['approval']
    require(digest(plan) == expected_plan_hash, 'Unapproved plan')
    require(digest(approval) == expected_approval_hash, 'Unapproved approval manifest')
    keys(approval, 'planHash decisions reviewHashes')
    require(approval['planHash'] == expected_plan_hash, 'Approval plan differs')
    require(isinstance(bundle['reviews'], list) and all(isinstance(r, str) for r in bundle['reviews']), 'Reviews require exact raw JSON text')
    review_hashes = [sha(r.encode()) for r in bundle['reviews']]
    require(len(set(review_hashes)) == len(review_hashes), 'Duplicate review receipt')
    require(set(review_hashes) == set(approval['reviewHashes']), 'Review receipt changed')
    for raw_review in bundle['reviews']:
        require(isinstance(strict_json(raw_review), dict), 'Review receipt must be an object')
    keys(plan, 'version binding ownershipHash decisions coverage')
    require(plan['version'] == VERSION, 'Unsupported plan')
    sources, answer, derived, binding, compile_error = original(bundle)
    require(plan['binding'] == binding, 'Original chain differs')
    owned = ownership_index.sources_for(bundle['job'])
    require(all(o['ownershipManifestSha256'] == plan['ownershipHash'] for o in owned), 'Ownership pin differs')
    decisions = unique(plan['decisions'], 'id')
    require(set(approval['decisions']) == {digest(d) for d in decisions.values()}, 'Item approval differs')
    originals = {}
    if isinstance(answer, dict):
        for kind, field in (('person', 'people'), ('connection', 'relationships')):
            for item in answer.get(field, []):
                require(isinstance(item, dict) and isinstance(item.get('id'), str), 'Malformed original item identifiers are unsupported by this adapter')
                key = (kind, item['id']); require(key not in originals, 'Duplicate original ID')
                originals[key] = item
    seen, kept, connections = set(), {}, []
    for decision in decisions.values():
        keys(decision, 'id kind originalId action beforeHash after reason evidence reviewHashes')
        text(decision['id']); text(decision['reason'])
        require(decision['kind'] in ('person', 'connection'), 'Unknown item kind')
        require(decision['action'] in ('replace', 'hold', 'reject', 'add'), 'Unknown operation')
        require(decision['reviewHashes'] and set(decision['reviewHashes']) <= set(approval['reviewHashes']), 'Missing approved review')
        require(decision['evidence'], 'Missing decision evidence')
        for evidence in decision['evidence']:
            span(evidence, sources)
        old = decision['originalId']; key = (decision['kind'], old)
        if decision['action'] == 'add':
            require(old is None and decision['beforeHash'] is None, 'Addition impersonates original item')
        else:
            require(key in originals and key not in seen and decision['beforeHash'] == digest(originals[key]), 'Stale/duplicate target')
            seen.add(key)
        if decision['action'] in ('hold', 'reject'):
            require(decision['after'] is None, 'Held item has published value'); continue
        after = decision['after']; require(isinstance(after, dict), 'Missing checked value')
        require(after['id'] == old if old else after['id'].startswith('add:'), 'Checked item identity differs')
        if decision['kind'] == 'person':
            require(after['id'] not in kept, 'Duplicate retained person')
            kept[after['id']] = person(after, sources)
        else:
            connections.append(after)
    require(seen == set(originals), 'Original items missing dispositions')
    printed_spans = {}
    for pid, checked_person in kept.items():
        for mention in checked_person['mentions']:
            if mention['role'] != 'printed_name':
                continue
            location = (mention['sourceId'], mention['start'], mention['end'])
            require(location not in printed_spans or printed_spans[location] == pid,
                    'Competing printed-name identities require a held placement')
            printed_spans[location] = pid
    checked_connections = [connection(c, sources, kept) for c in connections]
    unique(checked_connections, 'id')
    coverage = unique(plan['coverage'], 'sourceId')
    require(set(coverage) == set(sources), 'Missing supplied-source coverage')
    for row in coverage.values():
        keys(row, 'sourceId status holes')
        require(row['status'] in ('reviewed', 'partial', 'unreviewed') and isinstance(row['holes'], list), 'Invalid coverage')
        require(row['status'] != 'reviewed' or not row['holes'], 'Reviewed source has holes')
        for hole in row['holes']:
            text(hole)
    result = dict(version=VERSION, binding=binding, originalCompileError=compile_error,
                  planHash=expected_plan_hash, approvalHash=expected_approval_hash, ownership=owned,
                  decisions=copy.deepcopy(plan['decisions']), reviewHashes=list(approval['reviewHashes']),
                  people=list(kept.values()), connections=checked_connections, sourceCoverage=list(coverage.values()),
                  wholeReadingFullyChecked=binding['originalStatus'] != 'failed' and
                  not any(d['action'] == 'hold' for d in decisions.values()) and
                  all(r['status'] == 'reviewed' and not r['holes'] for r in coverage.values()),
                  originalStatus=binding['originalStatus'], status='needs_review', confirmedFacts=False)
    result['artifactHash'] = digest(result)
    return copy.deepcopy(result)
