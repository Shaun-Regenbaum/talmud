"""Check bindings and structure; exact quotes do not certify an interpretation."""
import copy
import hashlib
import json
import unicodedata
from pathlib import Path

from jsonschema import Draft202012Validator

try:
    from .contract import RELATIONS, SCHEMA, VERSION
except ImportError:
    from contract import RELATIONS, SCHEMA, VERSION


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def sha(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def digest(value):
    return sha(canonical(value))


class Invalid(ValueError):
    def __init__(self, code, detail):
        self.code = code
        super().__init__(f'{code}: {detail}')


def require(condition, code, detail):
    if not condition:
        raise Invalid(code, detail)


def check_job(job):
    require(isinstance(job, dict) and isinstance(job.get('job_id'), str) and job['job_id'].strip(), 'job', 'job_id required')
    require(isinstance(job.get('focal_ref'), str) and job['focal_ref'].strip(), 'job', 'focal_ref required')
    require(isinstance(job.get('sources'), list) and job['sources'], 'job', 'sources required')
    sources = {}
    for source in job['sources']:
        require(isinstance(source, dict), 'source', 'source must be an object')
        sid, text = source.get('source_id'), source.get('text')
        require(isinstance(sid, str) and sid.strip() and sid not in sources, 'source_id', 'missing or duplicate source ID')
        require(isinstance(text, str) and text.strip(), 'source', sid)
        require(isinstance(source.get('ref'), str) and source['ref'].strip(), 'source', 'source ref required')
        require(sha(text) == source.get('sha256'), 'source_hash', sid)
        sources[sid] = source
    require(job['focal_ref'] in {s['ref'] for s in sources.values()}, 'focal_ref', 'focal source missing')
    return sources


def recipe_binding():
    root = Path(__file__).parent
    files = {name: sha((root / name).read_bytes()) for name in ('contract.py', 'validate.py', 'request.py', 'reader.md')}
    return {'version': VERSION, 'files': files, 'sha256': digest(files)}


def hebrew_word_character(text, index):
    if not 0 <= index < len(text):
        return False
    char = text[index]
    if '\u05d0' <= char <= '\u05ea' or (unicodedata.combining(char) and 'HEBREW' in unicodedata.name(char, '')):
        return True
    # Quote marks join Hebrew abbreviation letters, but opening/closing
    # quotation punctuation is not itself part of a Hebrew word.
    return char in "\"'׳״" and 0 < index < len(text) - 1 and all(
        '\u05d0' <= text[i] <= '\u05ea' for i in (index - 1, index + 1))


def check(job, answer):
    sources = check_job(job)
    errors = list(Draft202012Validator(SCHEMA).iter_errors(answer))
    require(not errors, 'schema', '; '.join(f'{list(e.path)} {e.message}' for e in errors[:3]))
    require(answer['job_id'] == job['job_id'], 'job_id', 'answer belongs to another job')
    anchors = []

    def text_required(value, path):
        require(value.strip(), 'blank_text', path)

    def anchor(a, path):
        require(a['source_id'] in sources, 'anchor_source', path)
        source = sources[a['source_id']]
        text_required(a['quote'], path)
        starts, pos = [], 0
        while True:
            pos = source['text'].find(a['quote'], pos)
            if pos < 0:
                break
            starts.append(pos)
            pos += 1
        require(a['occurrence'] <= len(starts), 'anchor_quote', path)
        start = starts[a['occurrence'] - 1]
        anchors.append({'path': path, **a, 'source_sha256': source['sha256'],
                        'start': start, 'end': start + len(a['quote']), 'offset_unit': 'Unicode code points'})
        if path.startswith('people/'):
            end = start + len(a['quote'])
            require(not hebrew_word_character(source['text'], start - 1) and
                    not hebrew_word_character(source['text'], end) and
                    not unicodedata.combining(a['quote'][0]), 'mention_boundary', path)

    def evidence(values, path):
        require(len({canonical(v) for v in values}) == len(values), 'duplicate_evidence', path)
        for i, a in enumerate(values):
            anchor(a, f'{path}/{i}')

    people, ids = {}, set()
    for person in answer['people']:
        pid = person['id']
        require(pid not in ids, 'duplicate_id', pid)
        ids.add(pid)
        people[pid] = person
        text_required(person['label'], pid)
        text_required(person['reason'], pid)
        evidence(person['mentions'], f'people/{pid}/mentions')
        require(person['form'] != 'embedded_parent' or person['kind'] == 'person', 'parent_kind', pid)

    def endpoint(pid, path):
        if pid is None:
            return
        require(pid in people, 'person_reference', path)
        require(people[pid]['kind'] != 'not_a_person', 'endpoint_kind', path)

    for person in people.values():
        seen = set()
        for alt in person['alternatives']:
            endpoint(alt['person_id'], person['id'])
            require(alt['person_id'] != person['id'], 'self_alternative', person['id'])
            require(alt['person_id'] not in seen, 'duplicate_alternative', person['id'])
            seen.add(alt['person_id'])
            text_required(alt['reason'], person['id'])

    named_spans = {}
    for a in anchors:
        pid = a['path'].split('/')[1]
        if people[pid]['form'] not in ('named', 'embedded_parent'):
            continue
        span = (a['source_id'], a['start'], a['end'])
        for other in named_spans.get(span, []):
            linked = any(x['person_id'] == other for x in people[pid]['alternatives']) or any(
                x['person_id'] == pid for x in people[other]['alternatives'])
            require(linked, 'duplicate_name_identity', f'{pid}/{other}')
        named_spans.setdefault(span, []).append(pid)

    signatures = set()
    for rel in answer['relationships']:
        rid = rel['id']
        require(rid not in ids, 'duplicate_id', rid)
        ids.add(rid)
        for key in ('verb', 'reason'):
            text_required(rel[key], rid)
        expected = RELATIONS[rel['relation']]
        require((rel['category'], rel['direction']) == expected, 'relation_contract', rid)
        evidence(rel['evidence'], f'relationships/{rid}/evidence')
        endpoint(rel['subject'], rid)
        endpoint(rel['object'], rid)
        pairs = [(rel['subject'], rel['object'])]
        require(not rel['alternatives'] or None in pairs[0], 'settled_alternatives', rid)
        require(None not in pairs[0] or rel['modality'] in ('uncertain', 'response_to_teaching'), 'unresolved_modality', rid)
        alt_seen = set()
        for alt in rel['alternatives']:
            pair = (alt['subject'], alt['object'])
            for key in ('subject', 'object'):
                endpoint(alt[key], rid)
                require(rel[key] is None or alt[key] == rel[key], 'alternative_fixed_endpoint', rid)
            require(pair not in alt_seen and pair != pairs[0], 'duplicate_alternative', rid)
            alt_seen.add(pair)
            text_required(alt['reason'], rid)
            pairs.append(pair)
        for subject, object_ in pairs:
            if rel['category'] == 'family':
                require(subject is None or object_ is None or subject != object_, 'self_family', rid)
                require(all(p is None or people[p]['kind'] == 'person' for p in (subject, object_)), 'family_kind', rid)
            if any(p is not None and people[p]['setting'] == 'hypothetical' for p in (subject, object_)):
                require(rel['modality'] in ('hypothetical', 'uncertain') and rel['scene_status'] != 'actual_report', 'hypothetical_endpoint', rid)
        require(rel['scene_status'] != 'hypothetical' or rel['modality'] in ('hypothetical', 'uncertain'), 'scene_modality', rid)
        require(rel['modality'] != 'hypothetical' or rel['scene_status'] != 'actual_report', 'scene_modality', rid)
        require(rel['relation'] != 'responds_to_teaching' or rel['modality'] == 'response_to_teaching', 'response_modality', rid)
        require(rel['modality'] != 'response_to_teaching' or rel['category'] in ('debate', 'teaching'), 'response_category', rid)
        pair = [rel['subject'], rel['object']]
        if rel['direction'] == 'symmetric':
            pair.sort(key=lambda p: p or '')
        signature = canonical([rel['relation'], pair, rel['modality'], rel['scene_status'], rel['polarity'],
                               sorted(canonical(a) for a in rel['evidence']), sorted(alt_seen, key=canonical)])
        require(signature not in signatures, 'duplicate_relationship', rid)
        signatures.add(signature)

    episode = answer['episode']
    require(bool(episode['needed_context']) == (episode['coverage'] == 'needs_context'), 'context_status', 'coverage and needed_context differ')
    for note in episode['needed_context'] + episode['notes']:
        text_required(note, 'episode')
    require(bool(answer['people']) and bool(answer['relationships']) or bool(episode['notes']), 'empty_reading', 'explain empty people or relationships')
    return {'record': copy.deepcopy(answer), 'job_sha256': digest(job),
            'source_sha256': {sid: source['sha256'] for sid, source in sources.items()},
            'recipe': recipe_binding(), 'answer_sha256': digest(answer),
            'resolved_anchors': anchors, 'proposal_only': True,
            'historical_identity_resolved': False, 'confirmed_connections': False}


def check_saved(job, compiled):
    """A resume must reproduce the complete envelope, not merely find a file."""
    require(isinstance(compiled, dict) and 'record' in compiled, 'saved_record', 'compiled record missing')
    expected = check(job, compiled['record'])
    require(compiled == expected, 'saved_binding', 'job, sources, recipe, answer or anchors changed')
    return expected
