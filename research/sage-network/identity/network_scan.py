"""Compare written names and partners without accepting historical identities."""
import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

VERSION = 1
PILOT = {'הונא', 'יוסי', 'כהנא', 'יוחנן'}
VARIANTS = {'חונא': 'הונא', 'חונה': 'הונא', 'יוסה': 'יוסי', 'יוסיי': 'יוסי'}
FAMILY_RELATIONS = {'child_of', 'parent_of', 'spouse_of', 'sibling_of',
                    'grandchild_of', 'father_in_law_of', 'son_in_law_of'}


LIMITATIONS = ['Direct labels from classifications are screening evidence, not checked connections.',
            'Shared partner labels may themselves be namesakes. Shared partners do not confirm an identity.',
            'Different circles do not prove different people. Written full names may also name more than one person.',
            'Generation numbers are registry metadata, not independent chronological evidence.',
            'Only existing reviewed place evidence is included; this scan does not infer places.',
            'Coverage is the saved classified passages, not the entire Talmud.']

def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def sha(value):
    return hashlib.sha256(value.encode()).hexdigest()


def normalized(label):
    label = re.sub('[\u0591-\u05c7]', '', label)
    label = re.sub(r"\bר['׳]\s*", 'רבי ', label)
    return ' '.join(re.sub(r'[.,:;!?"״׳()\[\]]', ' ', label).split())


def quote_matches(source, location, quote):
    locations = ('before', 'after') if location == 'context' else (location,)
    return bool(quote) and any(quote in source.get(k, '') for k in locations)


def written_name(label, evidence):
    """Return a name form only when its words occur in the attached evidence."""
    label = re.split(r'\s+[—–]\s+|/|[A-Za-z]', label)[0].strip()
    name = normalized(label)
    return name if name and any(name in normalized(q) for q in evidence) else None


def head(label):
    words = normalized(label).split()
    if len(words) > 1 and words[0] in {'רב', 'רבי', 'רבן', 'ר׳', "ר'"}:
        words = words[1:]
    if not words or words[0] in {'רבי', 'רבן'} or not re.fullmatch('[א-ת]+', words[0]):
        return None
    return VARIANTS.get(words[0], words[0])


def channel(claim):
    c, verdict = claim['claim'], claim['classification']
    flags = set(verdict.get('flags', []))
    if verdict['decision'] != 'supported':
        return verdict['decision']
    if verdict['mode'] in {'hypothetical', 'proposed', 'denied', 'unclear'}:
        return verdict['mode']
    if flags & {'hypothetical', 'generic', 'alternative', 'source_mismatch', 'unsupported'}:
        return 'needs_context'
    if c.get('relation', '').removeprefix('other:') in FAMILY_RELATIONS:
        return 'family'
    if 'indirect' in flags or c.get('kind') == 'quoted_teaching':
        return 'intellectual'
    if c.get('kind') in {'asked', 'answered', 'objected', 'said'} or c.get('relation') == 'in_the_presence_of':
        return 'classified_direct'
    return 'other'


def read_database(path, manifest):
    db = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    try:
        saved = db.execute('SELECT manifest_json,state FROM sage_graph_revisions WHERE id=?',
                           (manifest['revision'],)).fetchone()
        if not saved or saved[1] != 'verified' or json.loads(saved[0]) != {k:v for k,v in manifest.items() if k != 'revision'}:
            raise ValueError('Input revision is not the verified manifest')
        rows = list(db.execute('''SELECT record_id,kind,passage_id,ref,subject_id,object_id,
            authority,decision,payload_sha256,payload_json FROM sage_graph_records
            WHERE revision_id=? ORDER BY record_id''', (manifest['revision'],)))
        if len(rows) != manifest['recordCount'] or sha(encode([r[:-1] for r in rows])) != manifest['recordSetSha256']:
            raise ValueError('Input record set differs from manifest')
        if any(sha(r[-1]) != r[-2] for r in rows):
            raise ValueError('Input payload hash differs')
        return rows
    finally:
        db.close()


def scan(rows, registry, families=None):
    rows = sorted(rows, key=lambda row:row[0])
    records = {r[0]: json.loads(r[-1]) for r in rows}
    hashes = {r[0]: r[-2] for r in rows}
    by_kind = defaultdict(list)
    for r in rows:
        by_kind[r[1]].append(records[r[0]])
    passages = {p['id']:p for p in by_kind['passage']}
    people = {}
    for p in passages.values():
        for person in p['people']:
            key = p['id'] + '/' + person['id']
            people[key] = dict(person, personKey=key, passageId=p['id'], ref=p['ref'],
                               nodeId='local:'+key, acceptedSlug=None, reviewedLocal=False,
                               sourceRecordId='person:'+key, places=[],
                               writtenName=written_name(person['label'], [person.get('quote', '')]))
    # Reviewed labels and passage-local separations outrank initial extraction.
    nodes = {n['id']:n for n in by_kind['graph_node']}
    for item in by_kind['source_identity']:
        key = item['personKey']
        if key not in people or item['personId'] not in nodes:
            raise ValueError('Broken reviewed identity: ' + key)
        node = nodes[item['personId']]
        people[key].update(label=node.get('labelHe') or people[key]['label'],
                           nodeId=node['id'], reviewedLocal=True,
                           sourceRecordId='source_identity:'+key,
                           places=node.get('sourceProfile', {}).get('places', []))
        reviewed_name = written_name(node.get('labelHe', ''), [e['quote'] for e in item['evidence']])
        if reviewed_name:
            people[key]['writtenName'] = reviewed_name
        if item['status'] == 'accepted_registry_identity':
            if item['personId'] not in registry or not item['historicalIdentityResolved']:
                raise ValueError('Invalid accepted registry identity: ' + key)
            people[key]['acceptedSlug'] = item['personId']
    for item in by_kind['accepted_identity']:
        key = item['personKey']
        if key not in people:
            raise ValueError('Accepted identity outside passages: ' + key)
        people[key].update(acceptedSlug=item['personId'], nodeId=item['personId'],
                           sourceRecordId='accepted_identity:'+key)
    excluded = {x['passageId']+'/'+c if '/' not in c else c
                for x in by_kind['exclusion'] for c in x['claimIds']}
    corrected_claims = {c for x in by_kind['connection'] for c in x.get('claimIds', [])}
    claims_by_person = defaultdict(list)
    errors = []
    dispositions = Counter()
    for item in by_kind['claim']:
        if item['id'] in excluded or item['id'] in corrected_claims:
            dispositions['excluded' if item['id'] in excluded else 'superseded_by_review'] += 1
            continue
        c, pid = item['claim'], item['passageId']
        a, b = (c.get('speaker'), c.get('addressee')) if c['field']=='speech' else (c.get('a'), c.get('b'))
        keys = [pid+'/'+str(x) for x in (a,b)]
        p = passages.get(pid)
        if not p or not quote_matches(p['source'], c['quoteLocation'], c.get('quote')):
            errors.append({'recordId':'claim:'+item['id'], 'reason':'quote_not_in_saved_source'})
            dispositions['quarantined'] += 1
            continue
        if any(k not in people for k in keys):
            dispositions['no_identified_pair'] += 1
            continue
        category = channel(item)
        dispositions[category] += 1
        for key, partner in [keys, keys[::-1]]:
            if people[key]['nodeId'] == people[partner]['nodeId']:
                continue
            claims_by_person[key].append(dict(partnerKey=partner, channel=category,
                recordId='claim:'+item['id'], quote=c['quote'], location=c['quoteLocation'],
                direction='outgoing' if key==keys[0] else 'incoming', relation=c.get('relation'),
                speechKind=c.get('kind'), classification=item['classification'],
                endpointNotes=item.get('participants', []), originalClaim=c))
    reviewed_pairs = set()
    for item in by_kind['connection']:
        pid = item['passageId']
        aa = [k for k,p in people.items() if p['passageId']==pid and p['nodeId']==item['a']]
        bb = [k for k,p in people.items() if p['passageId']==pid and p['nodeId']==item['b']]
        if not aa or not bb:
            raise ValueError('Reviewed connection has missing people')
        category = {'encounter':'checked_direct', 'family':'family',
                    'intellectual':'intellectual', 'action':'other'}[item['type']]
        ev = item['evidence'][0]
        if not quote_matches(passages[pid]['source'], ev['location'], ev['quote']):
            raise ValueError('Reviewed connection quote differs')
        for key, partner in [(a,b) for a in aa for b in bb] + [(b,a) for a in aa for b in bb]:
            reviewed_pairs.add((pid, people[key]['nodeId'], people[partner]['nodeId']))
            claims_by_person[key].append(dict(partnerKey=partner, channel=category,
                recordId='connection:'+item['id'], quote=ev['quote'], location=ev['location'],
                direction='outgoing' if key in aa else 'incoming', relation=item.get('relation'),
                speechKind=None))
    for key, edges in claims_by_person.items():
        for edge in edges:
            if edge['recordId'].startswith('claim:') and (people[key]['passageId'],people[key]['nodeId'],people[edge['partnerKey']]['nodeId']) in reviewed_pairs:
                edge['originalChannel'] = edge['channel']
                edge['channel'] = 'reviewed_pair_original'
            partner = people[edge['partnerKey']]
            edge['partnerLabel'] = partner['label']
            edge['partnerAcceptedSlug'] = partner['acceptedSlug']
            edge['recordSha256'] = hashes[edge['recordId']]
    candidates = defaultdict(set)
    for slug, entry in registry.items():
        for label in [entry.get('canonicalHe',''), *entry.get('aliases', [])]:
            if label:
                candidates[normalized(label)].add(slug)
    prior = defaultdict(list)
    for item in by_kind['identity_assignment']:
        prior[item['personKey']].append({k:item[k] for k in ['dossierId','groupIds','status']})
    review_records = defaultdict(list)
    assignments = {key:items for key,items in prior.items()}
    for r in rows:
        if r[1] not in {'era_assessment', 'identity_review'}:
            continue
        item = records[r[0]]
        for key,p in people.items():
            screen = records.get('era_review:' + item.get('claimId', ''), {})
            matches = (r[1]=='era_assessment' and key in {screen.get(role, {}).get('personKey') for role in ('a','b')}) or (
                r[1]=='identity_review' and any(a['dossierId']==item.get('dossierId')
                    and {g.rsplit('/',1)[-1] for g in a['groupIds']} & {g.rsplit('/',1)[-1] for g in item.get('groupIds', [])} for a in assignments.get(key, [])))
            if matches:
                review_records[key].append(dict(recordId=r[0], recordSha256=hashes[r[0]], assessment=item))
    selected = defaultdict(list)
    for key, person in people.items():
        family = head(person['writtenName'] or person['label'])
        if person['named'] != 'name' or not family or (families is not None and family not in families):
            continue
        selected[family].append(key)
    output = []
    for family, keys in sorted(selected.items()):
        mentions = []
        by_passage = defaultdict(list)
        for key in sorted(keys):
            p = people[key]
            by_passage[p['passageId']].append(key)
            edges = claims_by_person[key]
            direct = sorted({people[e['partnerKey']]['writtenName'] for e in edges
                             if e['channel'] in {'checked_direct','classified_direct'}
                             and people[e['partnerKey']]['named']=='name' and people[e['partnerKey']]['writtenName']})
            name = p['writtenName'] or normalized(p['label'])
            titles = 1 if name.split()[0] in {'רב','רבי','רבן'} else 0
            full = bool(p['writtenName']) and len(name.split()) > 1+titles
            mentions.append(dict(personKey=key, nodeId=p['nodeId'], label=p['label'],
                ref=p['ref'], passageId=p['passageId'], nameKey=name, fullDescriptor=full,
                reviewedLocal=p['reviewedLocal'], acceptedSlug=p['acceptedSlug'],
                exactNameCandidates=sorted(candidates[name]), priorReviews=prior[key], existingAssessments=review_records[key],
                directPartnerLabels=direct, evidence=edges, places=p['places'],
                sourceRecordId=p['sourceRecordId'], sourceRecordSha256=hashes[p['sourceRecordId']]))
        buckets = defaultdict(list)
        for m in mentions:
            buckets[m['nameKey']].append(m)
        anchors = {name:sorted({x for m in members for x in m['directPartnerLabels']})
                   for name,members in buckets.items() if members[0]['fullDescriptor']}
        groups = []
        for name,members in sorted(buckets.items()):
            partners = sorted({x for m in members for x in m['directPartnerLabels']})
            # Written-name buckets are comparison aids, never person records.
            groups.append(dict(name=name, personKeys=[m['personKey'] for m in members],
                directPartnerLabels=partners,
                candidateSlugs=sorted({s for m in members for s in m['exactNameCandidates']})))
        for m in mentions:
            bridges = []
            if not m['fullDescriptor']:
                for anchor,partners in anchors.items():
                    shared = sorted(set(m['directPartnerLabels']) & set(partners))
                    if shared:
                        bridges.append(dict(name=anchor, sharedPartnerLabels=shared,
                                            distinctPartnerLabelCount=len(shared)))
            m['compareFullNames'] = sorted(bridges,key=lambda x:(-x['distinctPartnerLabelCount'],x['name']))
            other = [k for k in by_passage[m['passageId']] if people[k]['nodeId']!=m['nodeId']]
            reasons = []
            if other: reasons.append('same_name_family_in_passage')
            if m['fullDescriptor'] and not m['exactNameCandidates']: reasons.append('full_name_missing_exact_registry_match')
            if len(bridges)>1: reasons.append('partners_overlap_multiple_full_names')
            if len(m['exactNameCandidates'])>1: reasons.append('multiple_exact_registry_records')
            if not m['fullDescriptor'] and m['directPartnerLabels'] and not bridges: reasons.append('no_full_name_partner_anchor')
            if not m['directPartnerLabels']: reasons.append('no_direct_partner_evidence')
            m['reviewReasons'] = reasons
            m['otherSameFamilyPeople'] = other
            m['priority'] = 0 if other and not m['reviewedLocal'] else 1 if 'full_name_missing_exact_registry_match' in reasons else 2 if len(bridges)>1 else 3
        mentions.sort(key=lambda m:(m['acceptedSlug'] is not None,m['reviewedLocal'],m['priority'],m['personKey']))
        family_candidates = [dict(slug=slug, name=entry['canonical'], nameHe=entry.get('canonicalHe'),
            generationAsStoredNotVerified=entry.get('generation'), region=entry.get('region'),
            source=entry.get('wiki'), provenance=entry.get('provenance'))
            for slug,entry in sorted(registry.items()) if head(entry.get('canonicalHe',''))==family]
        output.append(dict(family=family, status='needs_review', accepted=False,
            registryCandidates=family_candidates,
            mentionCount=len(mentions), passageCount=len(by_passage),
            distinctPassagePeople=len({(m['passageId'], m['nodeId']) for m in mentions}),
            checkedLocalMentions=sum(m['reviewedLocal'] for m in mentions),
            existingAcceptedMentions=sum(m['acceptedSlug'] is not None for m in mentions),
            previouslyStudiedMentions=sum(bool(m['priorReviews']) for m in mentions),
            writtenNameGroups=groups, mentions=mentions))
    return dict(families=output, errors=errors, coverage=dict(
        inputPassages=len(passages), inputPeople=len(people), inputClaims=len(by_kind['claim']),
        claimDispositions=dict(sorted(dispositions.items())),
        selectedFamilies=len(output), selectedMentions=sum(x['mentionCount'] for x in output),
        selectedPassages=len({m['passageId'] for f in output for m in f['mentions']})))


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('database',type=Path);ap.add_argument('manifest',type=Path)
    ap.add_argument('registry',type=Path);ap.add_argument('output',type=Path)
    ap.add_argument('--all-names',action='store_true')
    args=ap.parse_args()
    manifest=json.loads(args.manifest.read_text())
    rows=read_database(args.database.resolve(),manifest)
    result=scan(rows,json.loads(args.registry.read_text())['rabbis'],None if args.all_names else PILOT)
    result.update(schemaVersion=VERSION, inputRevision=manifest['revision'],
        inputRecordSetSha256=manifest['recordSetSha256'],registrySha256=sha(args.registry.read_text()),
        method='Written full-name groups and exact shared direct-partner labels. No inferred identity, era, meeting from a quotation, or place from a name.',
        limitations=LIMITATIONS)
    if sum(result['coverage']['claimDispositions'].values()) != result['coverage']['inputClaims']:
        raise ValueError('Incomplete claim accounting')
    content=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.output.exists() and args.output.read_text()!=content:
        raise ValueError('Refusing to overwrite a different scan')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    part=args.output.with_suffix(args.output.suffix+'.part');part.write_text(content);part.replace(args.output)
    print(json.dumps(result['coverage'],ensure_ascii=False))

if __name__=='__main__':main()
