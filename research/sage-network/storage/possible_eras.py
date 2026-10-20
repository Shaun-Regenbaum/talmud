"""Show a conditional registry generation without accepting an era or using it as dating evidence."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path

VERSION = 'possible-era-v1'
POLICY_SHA256 = '73dedaade975d72fcb015d735435d9b73131e9bd6ab022fb1ccd919e43f0ef01'
HOLDS_SHA256 = 'c4c5a91522695dc5d6fc489e62458128195bb2d364d253d9f7c47c31f8beca18'
ALIAS_SHA256 = '6eb992d650ce40a8848e34032170b971de0d8fbd6e729d2272f4409fea803e64'
SCOPE_KINDS = {'source_identity', 'identity_assessment', 'identity_proposal', 'name_reading', 'era_review', 'era_assessment', 'identity_assignment', 'accepted_identity'}
GLOBAL_KINDS = {'identity_group', 'identity_review', 'identity_finding'}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def binding(row):
    return dict(recordId=row[0], payloadSha256=row[-2], authority=row[6], decision=row[7])


@lru_cache(maxsize=4096)
def parsed(text):
    return json.loads(text)


def direct(row, person_key):
    d = parsed(row[-1])
    return (d.get('personKey') == person_key or d.get('case', {}).get('personKey') == person_key or
            d.get('identityDecision', {}).get('personKey') == person_key or person_key in d.get('personKeys', []) or
            any(isinstance(d.get(side), dict) and d[side].get('personKey') == person_key for side in ('a', 'b')))


def scoped_rows(rows, person_key, candidate):
    pid, local = person_key.split('/')
    alias_path = Path(__file__).resolve().parents[3] / 'packages/talmud/src/lib/data/rabbi-duplicates.json'
    candidate_ids = {candidate, parsed(alias_path.read_text())['duplicates'].get(candidate, candidate)}
    assignments = [r for r in rows.values() if r[1] == 'identity_assignment' and direct(r, person_key)]
    groups = {g for r in assignments for g in parsed(r[-1]).get('groupIds', [])}
    out = []
    for r in rows.values():
        d = parsed(r[-1])
        keep = r[1] in SCOPE_KINDS and direct(r, person_key)
        if r[1] in GLOBAL_KINDS:
            ids = [d.get('groupId'), *d.get('groupIds', [])]
            if r[1] == 'identity_group':
                ids.append(d.get('id'))
            qualified = {g if '/' in g else d.get('dossierId', '') + '/' + g for g in ids if g}
            keep = bool(groups & qualified) or (r[1] == 'identity_review' and d.get('registrySlug') in candidate_ids)
        if r[1] == 'withheld' and r[2] == pid:
            keep = True
        if r[6] == 'user_correction':
            keep = keep or direct(r, person_key) or r[4] in {person_key, 'local:' + person_key} or r[5] in {person_key, 'local:' + person_key}
            for cid in d.get('claimIds', []) if d.get('passageId') == pid else []:
                cid = cid.removeprefix('claim:')
                claim = rows.get('claim:' + (cid if '/' in cid else pid + '/' + cid))
                if claim:
                    c = parsed(claim[-1]).get('claim', {})
                    keep = keep or local in [c.get(k) for k in ('speaker', 'addressee', 'a', 'b')]
        if keep:
            out.append(r)
    return out


def scope(rows, person_key, candidate):
    return sorted((binding(r) for r in scoped_rows(rows, person_key, candidate)), key=lambda b: b['recordId'])


def legacy_hold(rows, person_key, candidate):
    for r in scoped_rows(rows, person_key, candidate):
        d = parsed(r[-1])
        if r[1] in {'withheld', 'accepted_identity'} or (r[1] == 'identity_assignment' and d.get('status') != 'supported') or (r[1] == 'identity_review' and d.get('status') != 'supported_proposal'):
            return True
    return False


def checked_rows(rows, dependencies):
    for b in dependencies:
        row = rows.get(b['recordId'])
        if not row or binding(row) != b or hashlib.sha256(row[-1].encode()).hexdigest() != b['payloadSha256']:
            return False
    return True


def selected_identity(row):
    data = json.loads(row[-1])
    if row[1] == 'source_identity' and row[6] in {'source_review', 'user_correction'} and row[7] == data.get('status') == 'accepted_registry_identity' and data.get('historicalIdentityResolved') is True:
        return 'A', data.get('personId'), data.get('reason'), data.get('evidence')
    if row[6:8] != ('screening', 'needs_review') and list(row[6:8]) != ['screening', 'needs_review']:
        return None
    if row[1] == 'identity_proposal' and data.get('accepted') is False and data.get('status') == 'complete':
        answer = data.get('answer') or {}
        if answer.get('status') == 'matched':
            return 'B', answer.get('personId'), answer.get('reason'), answer.get('evidence')
    if row[1] == 'name_reading':
        reading = data.get('reading') or {}
        if reading.get('identityStatus') == 'registry_candidate' and reading.get('entityKind') in {'sage', 'biblical_person', 'other_human'}:
            return 'B', reading.get('proposedRegistryId'), reading.get('reason'), reading.get('evidence')
    return None


def record(entry, rows, current_scope=None):
    key = entry['personKey']
    if not checked_rows(rows, entry['dependencies']) or (scope(rows, key, entry['originalCandidateId']) if current_scope is None else current_scope) != entry['scope']:
        return None
    selected = selected_identity(rows[entry['identity']['recordId']])
    if not selected or selected[:2] != (entry['tier'], entry['originalCandidateId']):
        return None
    tier, candidate, reason, evidence = selected
    if not isinstance(reason, str) or not reason.strip() or not isinstance(evidence, list) or not evidence:
        return None
    pid = key.split('/')[0]
    passage = json.loads(rows['passage:' + pid][-1])
    for e in evidence:
        loc, quote = e.get('location'), e.get('quote')
        fields = ('before', 'after') if loc == 'context' else (loc,)
        if not quote or not any(quote in passage['source'].get(f, '') for f in fields):
            return None
    registry = json.loads(rows[entry['registry']['recordId']][-1])
    if registry.get('generation') != entry['generation'] or not registry.get('generation') or registry['generation'] == 'unknown':
        return None
    data = dict(version=VERSION, personKey=key, tier=tier, originalCandidateId=candidate,
                canonicalCandidateId=entry['canonicalCandidateId'], generation=entry['generation'],
                identity=entry['identity'], reason=dict(**entry['identity'], text=reason, evidence=evidence),
                registry=dict(**entry['registry'], name=registry['canonical'], nameHe=registry['canonicalHe']),
                dependencies=entry['dependencies'], scope=entry['scope'], policySha256=POLICY_SHA256,
                holdsSha256=HOLDS_SHA256, aliasMapSha256=ALIAS_SHA256,
                acceptedEra=False, independentlyConfirmed=False, usableForDatingOthers=False,
                meaning='approximate_activity_generation_not_lifespan')
    return dict(record_id='possible_era:v1/' + key, kind='possible_era', passage_id=pid,
                ref=passage['ref'], subject_id='local:' + key, object_id=None,
                authority='screening', decision='needs_review', data=data)


def context_index(rows):
    by_passage = {}
    global_rows = {}
    by_person = {}
    for r in rows.values():
        if r[1] in GLOBAL_KINDS or r[6] == 'user_correction':
            global_rows[r[0]] = r
        d = parsed(r[-1])
        keys = {d.get('personKey'), d.get('case', {}).get('personKey'), d.get('identityDecision', {}).get('personKey'), *d.get('personKeys', [])}
        for side in ('a', 'b'):
            if isinstance(d.get(side), dict):
                keys.add(d[side].get('personKey'))
        for key in keys - {None}:
            by_person.setdefault(key, {})[r[0]] = r
        if r[2]:
            by_passage.setdefault(r[2], {})[r[0]] = r
    return by_passage, global_rows, by_person


def context_for(index, key):
    by_passage, global_rows, by_person = index
    return {**global_rows, **by_passage.get(key.split('/')[0], {}), **by_person.get(key, {})}


def build(rows, policy, parent_revision):
    if digest(policy) != POLICY_SHA256 or policy.get('holdsSha256') != HOLDS_SHA256 or policy.get('aliasMapSha256') != ALIAS_SHA256:
        raise ValueError('Possible era policy is not the reviewed frozen policy')
    aliases = Path(__file__).resolve().parents[3] / 'packages/talmud/src/lib/data/rabbi-duplicates.json'
    if hashlib.sha256(aliases.read_bytes()).hexdigest() != ALIAS_SHA256:
        raise ValueError('Possible era alias map changed; re-review required')
    index = context_index(rows)
    additions = []
    for entry in policy['entries']:
        context = context_for(index, entry['personKey'])
        item = record(entry, rows, scope(context, entry['personKey'], entry['originalCandidateId']))
        if item:
            old = rows.get(item['record_id'])
            if old:
                if json.loads(old[-1]) != item['data'] or old[6:8] != ('screening', 'needs_review'):
                    raise ValueError('Possible eras are append-only; use a new reviewed version')
            else:
                additions.append(item)
    return dict(parentRevision=parent_revision, description='Add conditional generation hints from the reviewed identity policy',
                possibleEraPolicy=policy, records=additions)


def validate_changes(changes, rows):
    if changes != build(rows, changes['possibleEraPolicy'], changes['parentRevision']):
        raise ValueError('Possible era records differ from exact parent reconstruction')
