"""Replay a pinned cross-edition occurrence match as a possible identity, never an accepted one."""
import hashlib
import json
import re

import name_candidates_import as inputs
import possible_eras
from identity import name_candidates

VERSION = 'index-identity-link-v1'
RULE = 'hebrew-token-title-expansion-v1'
EXPANSIONS = {'דא"ר': ('דאמר', 'רבי'), 'א"ר': ('אמר', 'רבי'), "ר'": ('רבי',)}
PUNCTUATION = re.compile(r'''[.,:;?!"'״׳()\[\]{}—–-]''')
VOWELS = re.compile('[\u0591-\u05c7]')


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def tokens(text, expand=False):
    """Keep raw token spans: normalization is intentionally not lossless."""
    require(isinstance(text, str) and text, 'Missing source text')
    out = []
    for match in re.finditer(r'\S+', text):
        clean = VOWELS.sub('', match.group())
        words = EXPANSIONS.get(clean) if expand else None
        for word in words or PUNCTUATION.sub(' ', clean).split():
            out.append(dict(token=word, start=match.start(), end=match.end(), quote=match.group()))
    return out


def row_data(row):
    require(sha(row[-1].encode()) == row[-2], 'Payload hash differs')
    return inputs.strict_json(row[-1])


def binding(row):
    row_data(row)
    return possible_eras.binding(row)


def blocked(rows, key, candidate):
    # Existing reviewed decisions retain priority. Do not reinterpret their intent here.
    if name_candidates.Decisions(list(rows.values())).about(key):
        return True
    return bool(possible_eras.scoped_rows(rows, key, candidate))


def build(artifact_bytes, expected_sha256, rows, parent_revision):
    """expected_sha256 is an independent release input, never copied from the artifact."""
    require(sha(artifact_bytes) == expected_sha256, 'Alignment artifact differs from external pin')
    a = inputs.strict_json(artifact_bytes)
    require(a['version'] == 'index-identity-link-artifact-v1', 'Wrong artifact version')
    key, candidate = a['personKey'], a['candidate']
    pid, local = key.split('/')
    require(not blocked(rows, key, candidate), 'Existing identity decision takes priority')
    cr = rows['name_candidates:v1/' + key]
    cd = row_data(cr)
    require(cr[1] == 'name_candidates' and cr[6:8] == ('screening', 'needs_review'), 'Not a screening candidate')
    require(cd['personKey'] == key and cd['accepted'] is False, 'Candidate person differs')
    require(cd['status'] == 'alternatives', 'Candidate is held')
    require(not cd.get('olderDecisions'), 'Older decisions require separate review')
    chosen = [c for c in cd['candidates'] if c['slug'] == candidate]
    require(len(chosen) == 1, 'Candidate absent or duplicated')
    registry = rows['registry_person:' + candidate]
    binding(registry)
    require(chosen[0]['payloadSha256'] == registry[-2], 'Registry candidate changed')
    require(cr[-2] == a['candidatePayloadSha256'], 'Candidate alternatives changed')
    passage = a['checkedPassage']
    stored = {r['recordId']: r for r in passage['stored']}
    require(len(stored) == len(passage['stored']), 'Duplicate stored checked rows')
    rebuilt = {r['record_id']: r for r in passage['rows']}
    require(len(rebuilt) == len(passage['rows']), 'Duplicate rebuilt checked rows')
    person_id, reading_id = 'checked_person:' + key, 'checked_reading:' + pid
    person, reading = rebuilt[person_id]['data'], rebuilt[reading_id]['data']
    require(passage['artifactSha256'] == cd['bindings']['artifact']['sha256'], 'Checked artifact differs')
    require(person['readingId'] == pid and person['form'] == 'named', 'Not a named checked person')
    require(reading['readingId'] == pid and reading['historicalIdentityAccepted'] is False, 'Wrong checked reading')
    dependencies = []
    for role, rid in (('person', person_id), ('reading', reading_id), ('coverage', 'checked_coverage:' + pid), ('ownership', 'checked_ownership:' + pid)):
        require(inputs.d1_hash(rebuilt[rid]['data']) == stored[rid]['payloadSha256'], 'Checked payload differs')
        require(cd['bindings'][role]['recordId'] == rid and cd['bindings'][role]['payloadSha256'] == stored[rid]['payloadSha256'], 'Candidate source binding differs')
        dependencies.append(cd['bindings'][role])
    old = a['oldText']
    require(old['heVersion'] == 'William Davidson Edition - Vocalized Aramaic', 'Unsupported indexed edition')
    require(a['index']['tractate'] == old['tractate'] == a['oldMentions']['tractate'] == a['oldResult']['tractate'], 'Tractate differs')
    require(old['amud'] == a['oldMentions']['amud'] == a['oldResult']['amud'], 'Page differs')
    require(sha(a['oldMentionsBytes'].encode()) == a['oldMentionsSha256'], 'Mention bytes differ')
    require(inputs.strict_json(a['oldMentionsBytes']) == a['oldMentions'], 'Mention document differs')
    require(hashlib.sha1(a['oldMentionsBytes'].encode()).hexdigest()[:16] == a['oldResult']['mentionsHash'], 'Prior answer not bound to mentions')
    proofs = []
    mentions = [m for m in person['mentions'] if m.get('role') == 'printed_name']
    require(mentions, 'No printed name anchors')
    for mention in mentions:
        source = next(s for s in reading['segments'] if s['source_id'] == mention['sourceId'])
        require(source['edition'] == 'Wikisource Talmud Bavli', 'Unsupported checked edition')
        require(sha(source['text'].encode()) == source['sha256'] == mention['sourceSha256'], 'Source hash differs')
        require(source['text'][mention['start']:mention['end']] == mention['quote'], 'Name anchor differs')
        # A reference locates a proposed segment; full text equality decides whether it is usable.
        prefix = old['tractate'] + ' ' + old['amud'] + ':'
        require(source['ref'].startswith(prefix), 'Reference differs')
        seg = int(source['ref'][len(prefix):]) - 1
        require(0 <= seg < len(old['he']), 'Indexed segment missing')
        left, right = tokens(old['he'][seg]), tokens(source['text'], True)
        require([t['token'] for t in left] == [t['token'] for t in right], 'Whole segment alignment differs')
        covered = [i for i,t in enumerate(right) if t['start'] < mention['end'] and t['end'] > mention['start']]
        require(covered and all(t['start'] >= mention['start'] and t['end'] <= mention['end'] for i,t in enumerate(right) if i in covered), 'Anchor splits a raw token')
        matches = []
        for n, previous in enumerate(a['oldMentions']['mentions']):
            if previous['seg'] != seg:
                continue
            start, length = previous['wordIdx'], previous['len']
            indices = set(range(start, start + length))
            # A checked bare name may omit its title, but cannot match a different part of a full name.
            missing = indices - set(covered)
            if not set(covered) <= indices or (missing and (missing != {start} or left[start]['token'] not in ('רבי', 'רב', 'רבן'))):
                continue
            require(' '.join(t['token'] for t in left[start:start+length]) == previous['surface'], 'Old mention differs from captured text')
            ix = [r for r in a['index']['amudim'][old['amud']] if r[0:3] == [seg,start,previous['surface']]]
            require(len(ix) == 1, 'Index occurrence missing or ambiguous')
            ix = ix[0]
            answer = a['oldResult']['answers'].get(f'm{n}_who', {})
            require(ix[3] == answer.get('choice') == candidate and ix[5] == 'j', 'Mapped occurrences disagree')
            require(ix[4] == answer.get('probabilities', {}).get(candidate), 'Saved score differs')
            matches.append(dict(sourceId=source['source_id'], ref=source['ref'], sourceSha256=source['sha256'],
                                checkedAnchor=mention, oldSegmentSha256=sha(old['he'][seg].encode()),
                                indexRow=ix, oldMentionIndex=n, indexedTokens=left, checkedTokens=right))
        require(len(matches) == 1, 'No unique exact occurrence bridge')
        proofs.extend(matches)
    require(len({(p['sourceId'],p['oldMentionIndex']) for p in proofs}) == len(proofs), 'Repeated occurrence')
    data = dict(version=VERSION, personKey=key, candidate=candidate, accepted=False, status='possible',
                normalization=RULE, artifactSha256=expected_sha256, candidateRecord=binding(cr), registry=binding(registry),
                checkedDependencies=dependencies, scope=[], reason='The earlier identity reading matches these exact source occurrences. It remains a possible identity.',
                sourceEvidence=[dict(ref=p['ref'], sourceSha256=p['sourceSha256'], anchor=p['checkedAnchor'],
                                     oldSegmentSha256=p['oldSegmentSha256'], indexRow=p['indexRow']) for p in proofs],
                scoreMeaning='saved_classifier_score_not_measured_probability')
    record = dict(record_id='identity_link_evidence:v1/' + key, kind='identity_link_evidence', passage_id=pid,
                  ref=proofs[0]['ref'], subject_id=key, object_id=candidate, authority='screening', decision='needs_review', data=data)
    return dict(version=VERSION, parentRevision=parent_revision, description='Add source-bound possible identity links', records=[record])


def validate_changes(changes, artifact_bytes, expected_sha256, rows):
    require(changes == build(artifact_bytes, expected_sha256, rows, changes['parentRevision']), 'Identity links differ from exact reconstruction')


def main():
    import argparse
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('prepare', 'release'))
    parser.add_argument('--artifact', type=Path, required=True)
    parser.add_argument('--artifact-sha256', required=True, help='Independently frozen artifact hash')
    parser.add_argument('--graph', type=Path)
    parser.add_argument('--revision')
    parser.add_argument('--export', type=Path)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--changes', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw = args.artifact.read_bytes()
    require(sha(raw) == args.artifact_sha256, 'Alignment artifact differs from external pin')
    if args.command == 'prepare':
        require(args.graph and args.revision, 'Graph and revision required')
        rows, _ = inputs.read_graph(args.graph, args.revision)
        result = build(raw, args.artifact_sha256, {r[0]: r for r in rows}, args.revision)
        require(not args.output.exists(), 'Output already exists')
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    else:
        from extend_d1 import prepare
        require(args.export and args.manifest and args.changes, 'Export, manifest and changes required')
        print(json.dumps(prepare(args.export, args.manifest, args.changes, args.output,
                                 shared=True, index_identity_input=(raw, args.artifact_sha256))))


if __name__ == '__main__':
    main()
