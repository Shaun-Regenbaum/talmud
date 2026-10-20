"""Check a verdict answer against its job, and compile what may be passed on.

Hard checks (raise Invalid): the job's own bindings, the answer's shape, the exact set of
claim ids and the fixed vocabularies. Everything about meaning is an audit flag for source
review, never a rejection. The compiled result keeps a real pair connection even when the
detailed claim is wrong, but it never endorses the original claim, its direction or its
family degree unless the answer supports all three. Every compiled item is a proposal.
"""
import hashlib
import json
import re
from pathlib import Path

try:
    from .contract import (ASPECT, CLAIM_AS_WRITTEN, DETAIL_STATUS, DIRECTION, FAMILY_DEGREE, LEGACY_VERDICT,
                           MAX_CLAIMS, MAX_DETAILS, NOTE_MAX, PAIR_KINDS, REASON_MAX, SOURCE_IDS, SUPPORTED_KIND,
                           VERSION)
except ImportError:
    from contract import (ASPECT, CLAIM_AS_WRITTEN, DETAIL_STATUS, DIRECTION, FAMILY_DEGREE, LEGACY_VERDICT,
                          MAX_CLAIMS, MAX_DETAILS, NOTE_MAX, PAIR_KINDS, REASON_MAX, SOURCE_IDS, SUPPORTED_KIND,
                          VERSION)

VERDICT_KEYS = {'claim_id', 'claim_as_written', 'supported_kind', 'direction', 'family_degree', 'verdict', 'reason',
                'uncertain_detail'}
# Parent and child kinds, where an immediate degree can be wrong.
DEGREE_KINDS = re.compile(r'^(child_of|parent_of|other:.*(descend|ancest|grand).*)$')
HEBREW_RUN = re.compile(r'[א-ת][א-ת֑-ׇ"\'׳״]*(?:\s+[א-ת][א-ת֑-ׇ"\'׳״]*)+')
OUTSIDE_FACTS = re.compile(r'\b(generations?|tannaim|tanna|amoraim|amora|century|centuries|BCE|CE|registry)\b', re.IGNORECASE)


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


def recipe_binding():
    root = Path(__file__).parent
    files = {name: sha((root / name).read_bytes()) for name in ('contract.py', 'validate.py', 'request.py', 'reader.md')}
    return {'version': VERSION, 'files': files, 'sha256': digest(files)}


def check_spans(spans, text, quote, code, ident, allow_empty):
    require(isinstance(spans, list) and (spans or allow_empty), code, ident)
    for span in spans:
        require(isinstance(span, list) and len(span) == 2 and all(type(i) is int for i in span) and
                text[span[0]:span[1]] == quote, code, ident)


def check_job(job):
    """The job must carry exact text, exact mentions and exact claim quotes."""
    require(isinstance(job, dict) and job.get('contract') == VERSION, 'job', 'contract version')
    require(isinstance(job.get('job_id'), str) and re.fullmatch('[A-Za-z0-9_-]+', job['job_id']), 'job', 'job_id')
    sources = {}
    for source in job.get('sources') or []:
        sid, text = source.get('source_id'), source.get('text')
        require(sid in SOURCE_IDS and sid not in sources, 'source_id', str(sid))
        require(isinstance(text, str) and sha(text) == source.get('sha256'), 'source_hash', sid)
        sources[sid] = text
    require('passage' in sources and sources['passage'].strip(), 'source', 'passage text required')
    people = {}
    for person in job.get('people') or []:
        pid, mention = person.get('id'), person.get('mention')
        require(isinstance(pid, str) and pid and pid not in people, 'person', 'missing or duplicate id')
        require(isinstance(mention, str) and mention, 'person', pid)
        # A mention whose place cannot be fixed exactly keeps no positions rather than a guessed one.
        check_spans(person.get('spans'), sources.get(person.get('source_id'), ''), mention, 'mention_span', pid,
                    allow_empty=True)
        people[pid] = person
    claims = job.get('claims') or []
    require(1 <= len(claims) <= MAX_CLAIMS, 'claims', 'between 1 and 12 claims per job')
    seen = set()
    for claim in claims:
        cid = claim.get('claim_id')
        require(isinstance(cid, str) and cid not in seen, 'claim_id', str(cid))
        seen.add(cid)
        require(claim.get('field') in ('speech', 'relations') and isinstance(claim.get('kind'), str), 'claim', cid)
        require(claim.get('from') in people and claim.get('to') in people and claim['from'] != claim['to'], 'claim_ends', cid)
        quote = claim.get('quote')
        require(isinstance(quote, str) and quote, 'claim_quote', cid)
        # Every place the quote occurs is listed, so no single occurrence is chosen for the reader.
        text = sources.get(claim.get('source_id'), '')
        check_spans(claim.get('spans'), text, quote, 'claim_quote', cid, allow_empty=False)
        require(len(claim['spans']) == text.count(quote), 'claim_quote', cid)
    return sources, people, {c['claim_id']: c for c in claims}


def check(job, answer):
    """Validate one answer and return the compiled proposal envelope."""
    sources, people, claims = check_job(job)
    require(isinstance(answer, dict) and set(answer) == {'job_id', 'verdicts'}, 'schema', 'answer keys')
    require(answer['job_id'] == job['job_id'], 'job_id', 'answer belongs to another job')
    verdicts = answer['verdicts']
    require(isinstance(verdicts, list), 'schema', 'verdicts must be a list')
    given = [v.get('claim_id') if isinstance(v, dict) else None for v in verdicts]
    require(len(given) == len(set(given)) and set(given) == set(claims), 'claim_ids',
            f'expected exactly {sorted(claims)}, got {given}')
    for v in verdicts:
        cid = v['claim_id']
        require(set(v) == VERDICT_KEYS, 'schema', f'{cid} keys')
        for key, allowed in (('claim_as_written', CLAIM_AS_WRITTEN), ('supported_kind', SUPPORTED_KIND),
                             ('direction', DIRECTION), ('family_degree', FAMILY_DEGREE), ('verdict', LEGACY_VERDICT)):
            require(v[key] in allowed, 'enum', f'{cid} {key}')
        require(isinstance(v['reason'], str) and v['reason'].strip() and len(v['reason']) <= REASON_MAX, 'reason', cid)
        details = v['uncertain_detail']
        require(isinstance(details, list) and len(details) <= MAX_DETAILS, 'schema', f'{cid} uncertain_detail')
        for d in details:
            require(isinstance(d, dict) and set(d) == {'aspect', 'status', 'note'} and d['aspect'] in ASPECT and
                    d['status'] in DETAIL_STATUS and isinstance(d['note'], str) and len(d['note']) <= NOTE_MAX,
                    'schema', f'{cid} detail')
    text = ' '.join(re.sub(r'\s+', ' ', t) for t in sources.values())
    compiled = [compile_claim(claims[v['claim_id']], v, text) for v in sorted(verdicts, key=lambda v: v['claim_id'])]
    return {'recipe': recipe_binding(), 'job_id': job['job_id'], 'job_sha256': digest(job), 'answer_sha256': digest(answer),
            'claims': compiled}


def audit_flags(claim, v, text):
    """Points for a person to check against the source. None of them rejects the answer."""
    flags = []
    kind, cw, direction, degree = v['supported_kind'], v['claim_as_written'], v['direction'], v['family_degree']
    # A claim about views (a dispute the editor reports) can hold as written with no tie between the people.
    if cw == 'supported' and (direction in ('reversed', 'undetermined') or degree in ('descent', 'unspecified') or
                              kind in ('unclear', 'hypothetical')):
        flags.append('supported_claim_with_conflicting_fields')
    if cw == 'supported' and any(d['status'] == 'contradicted' for d in v['uncertain_detail']):
        flags.append('supported_claim_with_contradicted_detail')
    if DEGREE_KINDS.match(claim['kind']) and degree == 'not_applicable':
        flags.append('parent_claim_without_family_degree')
    if not DEGREE_KINDS.match(claim['kind']) and degree in ('descent', 'unspecified'):
        flags.append('family_degree_on_other_claim')
    legacy = v['verdict']
    # Earlier readers used teach for 'does not show they met', so teach may sit with no tie.
    if (legacy == 'bad' and kind in PAIR_KINDS) or (legacy in ('ok', 'fam', 'narr') and kind not in PAIR_KINDS):
        flags.append('legacy_verdict_disagrees_with_pair')
    if (legacy == 'hyp') != (kind == 'hypothetical') or (legacy == 'fam' and kind != 'family') or \
            (legacy == 'narr' and kind != 'narrative'):
        flags.append('legacy_verdict_disagrees_with_kind')
    prose = ' '.join([v['reason']] + [d['note'] for d in v['uncertain_detail']])
    for run in HEBREW_RUN.findall(prose):
        if re.sub(r'\s+', ' ', run) not in text:
            flags.append('quotation_not_in_source')
            break
    if OUTSIDE_FACTS.search(prose):
        flags.append('mentions_outside_era_or_identity')
    return flags


def compile_claim(claim, v, text):
    kind = v['supported_kind']
    pair = 'retained' if kind in PAIR_KINDS else 'uncertain' if kind == 'unclear' else 'not_retained'
    blocked = []
    if v['claim_as_written'] != 'supported':
        blocked.append('claim_' + v['claim_as_written'])
    if v['direction'] not in ('as_written', 'symmetric'):
        blocked.append('direction_' + v['direction'])
    if v['family_degree'] not in ('as_written', 'not_applicable'):
        blocked.append('family_degree_' + v['family_degree'])
    if kind not in PAIR_KINDS:
        blocked.append('kind_' + kind)
    if any(d['status'] == 'contradicted' for d in v['uncertain_detail']):
        blocked.append('detail_contradicted')
    endorsed = not blocked
    corrections = []
    if pair == 'retained':
        # Typed corrections stay between the same two people and are never accepted facts.
        if v['direction'] == 'reversed':
            corrections.append({'type': 'reverse_direction', 'kind': claim['kind'], 'from': claim['to'],
                                'to': claim['from']})
        if v['family_degree'] == 'descent':
            corrections.append({'type': 'family_degree', 'degree': 'descent', 'kind': claim['kind'],
                                'from': claim['from'], 'to': claim['to']})
        if v['claim_as_written'] == 'contradicted' and not corrections:
            corrections.append({'type': 'connection_kind', 'supported_kind': kind, 'from': claim['from'],
                                'to': claim['to']})
    for c in corrections:
        c.update(status='proposal', accepted=False)
    return {
        'claim_id': claim['claim_id'],
        'pair': {'people': sorted([claim['from'], claim['to']]), 'connection': pair, 'kind': kind},
        'original': {'kind': claim['kind'], 'from': claim['from'], 'to': claim['to'], 'endorsed': endorsed,
                     'blocked_by': blocked},
        # When the original is not endorsed, only an undirected connection of the supported kind survives.
        'general_connection': None if endorsed or pair != 'retained' else {'people': sorted([claim['from'], claim['to']]),
                                                                            'kind': kind, 'directed': False},
        'corrections': corrections,
        'verdict': v['verdict'], 'reason': v['reason'], 'uncertain_detail': v['uncertain_detail'],
        'audit_flags': audit_flags(claim, v, text),
        'proposal_only': True,
    }


def status(answer):
    return 'complete'
