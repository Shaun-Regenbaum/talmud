"""Check assessment imports using the saved pilot passage and deliberate corruptions."""
import copy
import json
import sqlite3
import sys
import tempfile
import unittest
from collections import Counter
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
from extend_d1 import canonical_registry_slug, digest, prepare, review_receipt_sha256, validate_registry_person, validate_generation_evidence
from identity_proposals import record
from prepare_d1 import encode

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/identity-proposal.json').read_text())
UNRESOLVED = json.loads((Path(__file__).parent / 'fixtures/identity-unresolved-proposal.json').read_text())


def import_records(root, records, change_records, **change_fields):
    rows = []
    for item in records:
        payload = encode(item['data'])
        rows.append((item['record_id'], item['kind'], item.get('passage_id'), item.get('ref'),
                     item.get('subject_id'), item.get('object_id'), item['authority'],
                     item.get('decision'), digest(payload), payload))
    rows.sort()
    parent = dict(revision='saved-pilot-assessment-source', recordCount=len(rows),
                  countsByKind=dict(sorted(Counter(r[1] for r in rows).items())),
                  recordSetSha256=digest(encode([r[:-1] for r in rows])))
    repo = Path(__file__).resolve().parents[3]
    with closing(sqlite3.connect(':memory:')) as db:
        for migration in sorted((repo / 'packages/talmud/migrations-sage-graph').glob('*.sql')):
            db.executescript(migration.read_text())
        db.execute('INSERT INTO sage_graph_revisions VALUES (?,?,?,CURRENT_TIMESTAMP)',
                   (parent['revision'], encode({k:v for k,v in parent.items() if k != 'revision'}), 'loading'))
        db.executemany('INSERT INTO sage_graph_records VALUES (' + ','.join('?'*11) + ')',
                       [(parent['revision'], *r) for r in rows])
        db.execute("UPDATE sage_graph_revisions SET state='verified'")
        (root / 'parent.sql').write_text('\n'.join(db.iterdump()))
    (root / 'manifest.json').write_text(json.dumps(parent))
    changes = dict(dict(parentRevision=parent['revision'], description='Review saved pilot identity', records=list(change_records)), **change_fields)
    (root / 'changes.json').write_text(json.dumps(changes))
    return prepare(root/'parent.sql', root/'manifest.json', root/'changes.json', root/'output', shared=True)


class IdentityAssessmentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        case = FIXTURE['case']
        self.pk = case['personKey']
        self.pid = self.pk.split('/')[0]
        self.target = FIXTURE['result']['answer']['personId']
        proposal = record('pilot-review', case, FIXTURE['result'])
        passage = dict(id=self.pid, ref=case['ref'], source=case['source'], people=[case['person']])
        registry = next(c for c in case['candidates'] if c.get('id') == self.target)
        self.records = [dict(record_id='registry_person:' + self.target, kind='registry_person',
                             subject_id=self.target, authority='classification', data=registry), dict(record_id='passage:' + self.pid, kind='passage', passage_id=self.pid,
                             ref=case['ref'], authority='source', data=passage), proposal]
        self.assessment = dict(record_id='identity_assessment:' + case['id'], kind='identity_assessment',
            passage_id=self.pid, ref=case['ref'], subject_id='local:' + self.pk, object_id=None,
            authority='source_review', decision='reviewed', data=dict(
                proposalId=proposal['record_id'], proposalPayloadSha256=digest(encode(proposal['data'])),
                personKey=self.pk, proposedPersonId=self.target, outcome='held', acceptedPersonId=None,
                reason=FIXTURE['result']['answer']['reason'], evidence=FIXTURE['result']['answer']['evidence'],
                sources=['https://www.sefaria.org/Jerusalem_Talmud_Terumot.2.1.19'], generationDecision='held'))

    def run_import(self, assessment=None, extra=()):
        return import_records(self.root, self.records, [assessment or self.assessment, *extra])

    def test_held_assessment_keeps_proposal(self):
        self.assertEqual(self.run_import()['changedRecords'], 1)

    def test_reject_broken_binding_indexes_and_evidence(self):
        mutations = [
            lambda a: a['data'].update(proposalPayloadSha256='0'*64),
            lambda a: a['data'].update(proposalId='passage:' + self.pid),
            lambda a: a.update(record_id='identity_assessment:wrong-case'),
            lambda a: a.update(passage_id='wrong-passage'),
            lambda a: a.update(ref='wrong-ref'),
            lambda a: a.update(subject_id=self.target),
            lambda a: a.update(object_id=self.target),
            lambda a: a.update(decision='supported'),
            lambda a: a.update(authority='screening'),
            lambda a: a['data'].update(personKey='wrong-person'),
            lambda a: a['data'].update(proposedPersonId='wrong-person'),
            lambda a: a['data'].update(acceptedPersonId=self.target),
            lambda a: a['data'].update(reason=' '),
            lambda a: a['data'].update(evidence=[]),
            lambda a: a['data']['evidence'][0].update(quote='corrupted source quote'),
            lambda a: a['data'].update(generationDecision='accepted'),
        ]
        for mutate in mutations:
            changed = copy.deepcopy(self.assessment)
            mutate(changed)
            with self.subTest(change=changed), self.assertRaises(ValueError):
                self.run_import(changed)
        for url in ('http://www.sefaria.org/', 'https://bad host/', 'https://www.sefaria.org:bad/',
                    'https://name:password@www.sefaria.org/', 'https://www.sefaria.org/\n'):
            changed = copy.deepcopy(self.assessment)
            changed['data']['sources'] = [url]
            with self.subTest(url=url), self.assertRaises(ValueError):
                self.run_import(changed)

    def accepted_records(self):
        # Exercise the proposed match's graph representation; these records are
        # test-only and do not assert that this saved proposal has been reviewed.
        a = copy.deepcopy(self.assessment)
        a['object_id'] = self.target
        a['data'].update(outcome='accepted', acceptedPersonId=self.target)
        identity = dict(record_id='source_identity:' + self.pk, kind='source_identity',
            passage_id=self.pid, ref=a['ref'], subject_id=self.target, authority='source_review',
            decision='accepted_registry_identity', data=dict(personKey=self.pk, personId=self.target,
                status='accepted_registry_identity', historicalIdentityResolved=True))
        node = dict(record_id='graph_node:' + self.target, kind='graph_node', subject_id=self.target,
            authority='source_review', decision='supported', data=dict(id=self.target, personKeys=[self.pk], identityResolved=True))
        return a, identity, node

    def test_acceptance_requires_matching_final_graph(self):
        a, identity, node = self.accepted_records()
        with self.assertRaises(ValueError):
            self.run_import(a)
        self.assertEqual(self.run_import(a, [identity, node])['changedRecords'], 3)

    def test_reject_unrelated_accepted_identity(self):
        a, identity, node = self.accepted_records()
        a['data']['acceptedPersonId'] = 'wrong-person'
        a['object_id'] = 'wrong-person'
        with self.assertRaisesRegex(ValueError, 'match its proposal'):
            self.run_import(a, [identity, node])

    def test_reject_unresolved_identity_or_missing_membership(self):
        for field, value in [('status', 'unresolved'), ('historicalIdentityResolved', False),
                             ('personId', 'wrong-person'), ('personKey', 'wrong-person')]:
            a, identity, node = self.accepted_records()
            identity['data'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.run_import(a, [identity, node])
        a, identity, node = self.accepted_records()
        node['data']['personKeys'] = []
        with self.assertRaises(ValueError):
            self.run_import(a, [identity, node])

    def test_source_identity_must_match_reader_contract(self):
        for field, value in [('authority', 'classification'), ('decision', 'supported'),
                             ('subject_id', 'wrong-person'), ('object_id', self.target),
                             ('passage_id', 'wrong-passage'), ('ref', 'wrong-ref')]:
            a, identity, node = self.accepted_records()
            identity[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.run_import(a, [identity, node])
        a, identity, node = self.accepted_records()
        node['data']['identityResolved'] = False
        with self.assertRaisesRegex(ValueError, 'resolved registry node'):
            self.run_import(a, [identity, node])
        node['data']['identityResolved'] = True
        self.records = [r for r in self.records if r['kind'] != 'registry_person']
        with self.assertRaisesRegex(ValueError, 'resolved registry node'):
            self.run_import(a, [identity, node])

    def test_actual_registry_duplicate_mapping(self):
        self.assertEqual(canonical_registry_slug('rabbi-shimon-b-lakish-2'), 'rabbi-shimon-b-lakish')
        self.assertEqual(canonical_registry_slug(self.target), self.target)

    def test_cannot_replace_human_assessment(self):
        correction = copy.deepcopy(self.assessment)
        correction['authority'] = 'user_correction'
        self.records.append(correction)
        with self.assertRaisesRegex(ValueError, 'human correction'):
            self.run_import()


class UnresolvedProposalTests(unittest.TestCase):
    """A saved proposal that named nobody, accepted by two reviews bound to this case.

    The records are a real captured case (Bava Batra 123a:11) copied verbatim; the
    tests check the import rules only and do not approve the identity."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.records = [{k: v for k, v in r.items() if k != 'payloadSha256'} for r in UNRESOLVED['records']]
        self.proposal = self.records[0]
        self.passage = self.records[1]
        self.pk = self.proposal['data']['case']['personKey']
        self.pid = self.pk.split('/')[0]
        self.person = 'rabbi-shmuel-b-nahmani'

    def records_for(self, person=None, reviews=None, **data):
        person = person or self.person
        assessment = dict(record_id='identity_assessment:' + self.proposal['data']['case']['id'], kind='identity_assessment',
            passage_id=self.pid, ref=self.proposal['ref'], subject_id='local:' + self.pk, object_id=person,
            authority='source_review', decision='reviewed', data=dict(
                proposalId=self.proposal['record_id'], proposalPayloadSha256=digest(encode(self.proposal['data'])),
                personKey=self.pk, proposedPersonId=None, reviewerChosenPersonId=person, outcome='accepted', acceptedPersonId=person,
                reason=UNRESOLVED['firstReaderReason'], evidence=copy.deepcopy(UNRESOLVED['evidence']),
                sources=['https://www.sefaria.org/Bava%20Batra%20123a'], generationDecision='held',
                acceptedOverUnresolvedProposal=dict(reason='The saved proposal stopped on two registry records for one man; the duplicate map names the canonical one.',
                                                    reviews=copy.deepcopy(UNRESOLVED['reviews']) if reviews is None else reviews)))
        assessment['data'].update(data)
        identity = dict(record_id='source_identity:' + self.pk, kind='source_identity', passage_id=self.pid, ref=self.proposal['ref'],
            subject_id=person, authority='source_review', decision='accepted_registry_identity',
            data=dict(personKey=self.pk, personId=person, status='accepted_registry_identity', historicalIdentityResolved=True))
        node = dict(record_id='graph_node:' + person, kind='graph_node', subject_id=person, authority='source_review',
            decision='supported', data=dict(id=person, personKeys=[self.pk], identityResolved=True))
        return [assessment, identity, node]

    def run_import(self, changes):
        return import_records(self.root, self.records, changes)

    @staticmethod
    def resign(review):
        review['receiptSha256'] = review_receipt_sha256(review)
        return review

    def test_fixture_is_the_saved_unresolved_proposal(self):
        answer = self.proposal['data']['answer']
        self.assertIsNone(answer['personId'])
        self.assertEqual(answer['status'], 'unresolved')
        for record in UNRESOLVED['records']:
            self.assertEqual(digest(encode(record['data'])), record['payloadSha256'])

    def test_bound_reviews_accept_the_reviewer_choice(self):
        result = self.run_import(self.records_for())
        self.assertEqual(result['changedRecords'], 3)

    def test_unverified_reference_blocks_confirmed_facts(self):
        # Test-only marker. This passage's real reference is not in doubt; the row stands in
        # for a reading that carries a source reference warning, which is what the guard reads.
        self.records.append(dict(record_id='name_reading:test-only/case-0', kind='name_reading', passage_id=self.pid, ref=self.proposal['ref'],
                                 authority='screening', decision='needs_review', data=dict(sourceQuality=dict(sourceReferenceVerified=False))))
        with self.assertRaisesRegex(ValueError, 'Passage reference is unverified'):
            self.run_import(self.records_for())
        self.records[-1]['data']['sourceQuality']['sourceReferenceVerified'] = True
        self.assertEqual(self.run_import(self.records_for())['changedRecords'], 3)

    def test_proposal_null_is_kept(self):
        with self.assertRaisesRegex(ValueError, 'indexes differ from proposal'):
            self.run_import(self.records_for(proposedPersonId=self.person))
        with self.assertRaisesRegex(ValueError, 'explicit and separate'):
            self.run_import(self.records_for(reviewerChosenPersonId=None))

    def test_duplicate_registry_slug_is_refused(self):
        duplicate = 'rabbi-shmuel-bar-nachmani'
        self.assertEqual(canonical_registry_slug(duplicate), self.person)
        reviews = [self.resign(dict(r, acceptedPersonId=duplicate)) for r in copy.deepcopy(UNRESOLVED['reviews'])]
        with self.assertRaisesRegex(ValueError, 'canonical registry person'):
            self.run_import(self.records_for(person=duplicate, reviews=reviews))

    def test_reviews_cannot_move_to_another_case(self):
        for field, value in [('caseId', 'case-another'), ('personKey', self.pid + '/Z'), ('proposalPayloadSha256', '0' * 64),
                             ('sourceSha256', '0' * 64), ('decision', 'hold'), ('acceptedPersonId', 'rav-ashi')]:
            reviews = copy.deepcopy(UNRESOLVED['reviews'])
            self.resign(reviews[0].__setitem__(field, value) or reviews[0])
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'not bound to this case'):
                self.run_import(self.records_for(reviews=reviews))

    def test_receipt_hash_and_file_hash_are_checked(self):
        reviews = copy.deepcopy(UNRESOLVED['reviews'])
        reviews[1]['reviewer'] = 'someone-else'
        with self.assertRaisesRegex(ValueError, 'not bound to this case'):
            self.run_import(self.records_for(reviews=reviews))
        reviews = copy.deepcopy(UNRESOLVED['reviews'])
        self.resign(reviews[1].__setitem__('fileSha256', 'not-a-hash') or reviews[1])
        with self.assertRaisesRegex(ValueError, 'not bound to this case'):
            self.run_import(self.records_for(reviews=reviews))

    def test_two_different_reviews_are_required(self):
        reviews = copy.deepcopy(UNRESOLVED['reviews'])
        with self.assertRaisesRegex(ValueError, 'at least two reviews'):
            self.run_import(self.records_for(reviews=reviews[:1]))
        with self.assertRaisesRegex(ValueError, 'different reviewers'):
            self.run_import(self.records_for(reviews=[reviews[0], copy.deepcopy(reviews[0])]))
        same_reviewer = self.resign(dict(reviews[1], reviewer=reviews[0]['reviewer']))
        with self.assertRaisesRegex(ValueError, 'different reviewers'):
            self.run_import(self.records_for(reviews=[reviews[0], same_reviewer]))

    def test_reason_and_target_evidence_are_required(self):
        changes = self.records_for()
        changes[0]['data']['acceptedOverUnresolvedProposal']['reason'] = ' '
        with self.assertRaisesRegex(ValueError, 'needs a reason'):
            self.run_import(changes)
        text = self.passage['data']['source']['passage']
        target = next(p for p in self.passage['data']['people'] if p['id'] == self.pk.split('/')[1])['quote']
        other = text[:text.index(target)].strip()[-40:]
        self.assertTrue(other and target not in other)
        with self.assertRaisesRegex(ValueError, 'quote the target occurrence'):
            self.run_import(self.records_for(evidence=[dict(location='passage', quote=other)]))


class ReviewedEraTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads((Path(__file__).parent / 'fixtures/reviewed-era-evidence.json').read_text())

    def validate(self, record):
        row = (record['record_id'], record['kind'], record.get('passage_id'), record.get('ref'),
               record['subject_id'], record.get('object_id'), record['authority'], record['decision'])
        validate_registry_person(record['record_id'], row, record['data'])

    def test_saved_reviewed_era(self):
        self.validate(self.fixture['registry'])

    def test_reject_invalid_bounds_labels_and_sources(self):
        for field, value in [('start', True), ('end', 200), ('start', 200.5),
                             ('label', ' '), ('labelHe', ''), ('source', None)]:
            record = copy.deepcopy(self.fixture['registry'])
            record['data']['era'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.validate(record)
        for field, value in [('title', ' '), ('url', 'http://www.jewishencyclopedia.com/'),
                             ('url', 'https://bad host/'), ('url', 'https://www.jewishencyclopedia.com:bad/')]:
            record = copy.deepcopy(self.fixture['registry'])
            record['data']['era']['source'][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.validate(record)

    def test_saved_generation_evidence_and_corruptions(self):
        evidence = self.fixture['generationEvidence']
        registry = dict(generation=evidence['supportedGeneration'])
        validate_generation_evidence(evidence, evidence['personId'], registry)
        for field, value in [('personId', 'wrong-person'), ('supportedGeneration', 'wrong-generation'),
                             ('decision', ''), ('source', None)]:
            corrupt = copy.deepcopy(evidence)
            corrupt[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_generation_evidence(corrupt, evidence['personId'], registry)
        for field, value in [('url', 'http://daat.ac.il/'), ('exactExcerpt', ' '), ('summary', '')]:
            corrupt = copy.deepcopy(evidence)
            corrupt['source'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_generation_evidence(corrupt, evidence['personId'], registry)


if __name__ == '__main__':
    unittest.main()
