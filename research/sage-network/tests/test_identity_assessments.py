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
from extend_d1 import canonical_registry_slug, digest, prepare, validate_registry_person, validate_generation_evidence
from identity_proposals import record
from prepare_d1 import encode

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/identity-proposal.json').read_text())


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
        rows = []
        for item in self.records:
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
            (self.root / 'parent.sql').write_text('\n'.join(db.iterdump()))
        (self.root / 'manifest.json').write_text(json.dumps(parent))
        changes = dict(parentRevision=parent['revision'], description='Review saved pilot identity',
                       records=[assessment or self.assessment, *extra])
        (self.root / 'changes.json').write_text(json.dumps(changes))
        return prepare(self.root/'parent.sql', self.root/'manifest.json', self.root/'changes.json',
                       self.root/'output', shared=True)

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
