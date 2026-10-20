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
# Every family kind, including those with no degree (siblings, spouses, in-laws).
FAMILY_KINDS = re.compile(r'^(child_of|parent_of|sibling_of|spouse_of|other:.*(descend|ancest|grand|_in_law|brother|sister|'
                          r'wife|husband|spouse|son_of|daughter_of|father_of|mother_of|uncle|aunt|nephew|niece|cousin|famil).*)$')
# What a speech claim can be when it holds as written.
SPEECH_KINDS = {'asked': ('direct_interaction', 'narrative'), 'answered': ('direct_interaction', 'narrative'),
                'said': ('direct_interaction', 'narrative'), 'taught': ('direct_interaction', 'narrative'),
                'objected': ('direct_interaction', 'narrative'), 'narration': ('direct_interaction', 'narrative'),
                'quoted_teaching': ('direct_interaction', 'teaching_transmission', 'narrative')}
DESCENT_RELATION = {'child_of': 'descendant_of', 'parent_of': 'ancestor_of'}
# Kinds with no direction. Every other kind is read from one person to the other, so 'symmetric' contradicts it.
SYMMETRIC_KINDS = re.compile(r'^(sibling_of|spouse_of|other:.*(disagree|dispute|companion|fellow|walks_with|together|sibling|'
                             r'brother|sister|spouse|married|colleague|views_align|opinion_aligned|compared_with).*)$')
TRANSMISSION_KINDS = re.compile(r'^other:.*(name_of|transmit|quotes|reports_teaching|reports_interpretation|reports_view|'
                                r'reports_opinion|teaching_attributed|attributes_teaching|cites).*$')
RESPONSE_KINDS = re.compile(r'^other:.*(explain|interpret|objects_to|challeng).*$')


def expected_kinds(claim):
    """The supported kinds that agree with the claim's own kind, or None when its kind does not say."""
    kind = claim['kind']
    if claim['field'] == 'speech':
        return SPEECH_KINDS.get(kind)
    if FAMILY_KINDS.match(kind):
        return ('family',)
    if TRANSMISSION_KINDS.match(kind):
        return ('teaching_transmission',)
    if RESPONSE_KINDS.match(kind):
        return ('response_to_teaching',)
    if SYMMETRIC_KINDS.match(kind) and re.search('disagree|dispute', kind):
        return ('intellectual_disagreement',)
    return None
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


def occurrences(text, quote):
    """Every literal occurrence, overlapping ones included, in order."""
    return [[i, i + len(quote)] for i in range(len(text) - len(quote) + 1) if text.startswith(quote, i)]


def check_spans(spans, text, quote, code, ident):
    # The listed positions must be exactly all occurrences: in bounds, increasing, none repeated, none missing.
    require(isinstance(spans, list) and all(isinstance(s, list) and len(s) == 2 and all(type(i) is int for i in s)
                                            for s in spans), code, ident)
    require(all(0 <= s < e <= len(text) and text[s:e] == quote for s, e in spans), code, ident)
    require(all(a[0] < b[0] for a, b in zip(spans, spans[1:])), code, ident)
    require(spans == occurrences(text, quote), code, ident)


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
        # A mention whose place cannot be fixed exactly has no source and no positions, never a guessed one.
        if person.get('source_id') is None:
            require(person.get('spans') == [], 'mention_span', pid)
        else:
            require(person['source_id'] in sources, 'mention_span', pid)
            check_spans(person.get('spans'), sources[person['source_id']], mention, 'mention_span', pid)
            require(person['spans'], 'mention_span', pid)
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
        require(claim.get('source_id') in sources, 'claim_quote', cid)
        check_spans(claim.get('spans'), sources[claim['source_id']], quote, 'claim_quote', cid)
        require(claim['spans'], 'claim_quote', cid)
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


def field_conflicts(claim, v):
    """Contradictions inside one answer. Each one withholds the detailed claim; none rejects the answer."""
    kind, cw, direction, degree, legacy = (v['supported_kind'], v['claim_as_written'], v['direction'], v['family_degree'],
                                           v['verdict'])
    out = []
    if cw == 'supported':
        if direction in ('reversed', 'undetermined'):
            out.append('supported_claim_with_' + direction + '_direction')
        if degree in ('descent', 'unspecified'):
            out.append('supported_claim_with_' + degree + '_degree')
        if kind in ('unclear', 'hypothetical'):
            out.append('supported_claim_with_' + kind + '_kind')
        if any(d['status'] == 'contradicted' for d in v['uncertain_detail']):
            out.append('supported_claim_with_contradicted_detail')
        if FAMILY_KINDS.match(claim['kind']) and kind != 'family':
            out.append('family_claim_supported_as_other_kind')
        if not FAMILY_KINDS.match(claim['kind']) and kind == 'family':
            out.append('other_claim_supported_as_family')
        if claim['field'] == 'speech' and kind not in SPEECH_KINDS.get(claim['kind'], (kind,)):
            out.append('speech_claim_supported_as_other_kind')
    # A parent link, a transmission or a question has a direction; calling it symmetric loses which way it runs.
    if direction == 'symmetric' and not SYMMETRIC_KINDS.match(claim['kind']):
        out.append('symmetric_direction_on_directed_claim')
    if DEGREE_KINDS.match(claim['kind']) and degree == 'not_applicable':
        out.append('parent_claim_without_family_degree')
    if not DEGREE_KINDS.match(claim['kind']) and degree != 'not_applicable':
        out.append('family_degree_on_other_claim')
    # Earlier readers used teach for 'does not show they met', so teach may sit with no tie.
    if (legacy == 'bad' and kind in PAIR_KINDS) or (legacy in ('ok', 'fam', 'narr') and kind not in PAIR_KINDS):
        out.append('legacy_verdict_disagrees_with_pair')
    if (legacy == 'hyp') != (kind == 'hypothetical') or (legacy == 'fam' and kind != 'family') or \
            (legacy == 'narr' and kind != 'narrative'):
        out.append('legacy_verdict_disagrees_with_kind')
    return out


def prose_flags(v, text):
    """Points in the reason for a person to check against the source. They neither reject nor withhold."""
    flags = []
    prose = ' '.join([v['reason']] + [d['note'] for d in v['uncertain_detail']])
    for run in HEBREW_RUN.findall(prose):
        if re.sub(r'\s+', ' ', run) not in text:
            flags.append('quotation_not_in_source')
            break
    if OUTSIDE_FACTS.search(prose):
        flags.append('mentions_outside_era_or_identity')
    return flags


def correction(claim, v):
    """At most one typed correction, between the same two people. It is a proposal and is never published as a fact.

    Returns (corrections, flags). A reversal or descent is proposed only when the supported kind still agrees with
    the claim's own kind; if the kind changes too, or the claim's kind does not say, no detailed correction is made.
    """
    reversed_ = v['direction'] == 'reversed'
    descent = v['family_degree'] == 'descent' and DEGREE_KINDS.match(claim['kind']) is not None
    if (reversed_ or descent) and (v['supported_kind'] not in (expected_kinds(claim) or ()) or
                                   (descent and v['supported_kind'] != 'family')):
        return [], ['mixed_aspects_need_review']
    if reversed_ or descent:
        # Direction and degree are applied together, so a proposal never keeps one of them wrong.
        out = {'type': 'reversed_descent' if reversed_ and descent else 'reverse_direction' if reversed_ else 'family_degree',
               'relation': DESCENT_RELATION.get(claim['kind'], claim['kind']) if descent else claim['kind'],
               'from': claim['to'] if reversed_ else claim['from'], 'to': claim['from'] if reversed_ else claim['to']}
        if descent:
            out['degree'] = 'descent'
    elif v['claim_as_written'] == 'contradicted':
        out = {'type': 'connection_kind', 'supported_kind': v['supported_kind'], 'people': sorted([claim['from'], claim['to']])}
    else:
        return [], []
    out.update(status='proposal', accepted=False, publishable=False)
    return [out], []


def compile_claim(claim, v, text):
    kind = v['supported_kind']
    pair = 'retained' if kind in PAIR_KINDS else 'uncertain' if kind == 'unclear' else 'not_retained'
    conflicts = field_conflicts(claim, v)
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
    blocked += conflicts
    endorsed = not blocked
    # An answer that contradicts itself gets no correction: a person must read it first.
    corrections, mixed = correction(claim, v) if pair == 'retained' and not conflicts else ([], [])
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
        'audit_flags': conflicts + mixed + prose_flags(v, text),
        'proposal_only': True,
    }


def status(answer):
    return 'complete'
