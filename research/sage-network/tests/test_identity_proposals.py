"""Validate saved real pilot evidence and deliberate corruptions of that evidence."""
import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
from identity_proposals import record, validate

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/identity-proposal.json').read_text())


class ProposalTests(unittest.TestCase):
    def setUp(self):
        self.case = copy.deepcopy(FIXTURE['case'])
        self.result = copy.deepcopy(FIXTURE['result'])
        self.passage = dict(id=self.case['personKey'].split('/')[0], ref=self.case['ref'],
                            source=self.case['source'], people=[self.case['person']])

    def test_real_result(self):
        row = record('pilot-review', self.case, self.result)
        validate(row['data'], self.passage)
        self.assertEqual(row['authority'], 'screening')
        self.assertFalse(row['data']['accepted'])

    def test_missing_explicit(self):
        row = record('pilot-review', self.case)
        validate(row['data'], self.passage)
        self.assertEqual(row['data']['status'], 'missing')
        self.assertIsNone(row['data']['answer'])

    def test_corrupt_saved_receipt(self):
        self.result['answer']['reason'] += ' changed'
        with self.assertRaises(ValueError):
            record('pilot-review', self.case, self.result)

    def test_reject_acceptance_and_bad_hash(self):
        for key, value in [('accepted', True), ('inputSha256', '0'*64), ('sourceSha256', '0'*64)]:
            data = record('pilot-review', self.case, self.result)['data']
            data[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate(data, self.passage)

    def test_reject_quote_and_identity_corruption(self):
        for mutate in [lambda a: a.update(personId='nonexistent-record'),
                       lambda a: a['evidence'][0].update(quote='invalid source excerpt'),
                       lambda a: a.update(status='unresolved', personId='not-null')]:
            data = record('pilot-review', self.case, self.result)['data']
            mutate(data['answer'])
            with self.assertRaises(ValueError):
                validate(data, self.passage)

class BuilderTests(unittest.TestCase):
    def test_real_case_coverage_and_corruptions(self):
        import hashlib
        import tempfile
        from prepare_proposals import build
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            inputs = root / 'inputs'
            results = root / 'results'
            inputs.mkdir()
            results.mkdir()
            # Repackage one actual saved case; no invented passage or response.
            case = FIXTURE['case']
            raw = json.dumps([case], ensure_ascii=False) + '\n'
            (inputs / 'inputs-000.json').write_text(raw)
            manifest = {'revision': 'fixture-parent', 'cases': 1, 'inputFiles': {'inputs-000.json': hashlib.sha256(raw.encode()).hexdigest()}}
            (inputs / 'manifest.json').write_text(json.dumps(manifest))
            parent = {'revision': 'fixture-parent', 'recordSetSha256': hashlib.sha256(json.dumps(case['source'], sort_keys=True).encode()).hexdigest()}
            manifest['sourceRecordSetSha256'] = parent['recordSetSha256']
            (inputs / 'manifest.json').write_text(json.dumps(manifest))
            missing = build(inputs, results, parent, 'pilot-review')
            self.assertEqual(missing['records'][0]['data']['status'], 'missing')
            saved = results / (case['id'] + '.json')
            saved.write_text(json.dumps(FIXTURE['result']))
            complete = build(inputs, results, parent, 'pilot-review')
            self.assertEqual(complete['records'][0]['data']['status'], 'complete')
            # Compact the actual receipt exactly as the remote exporter does.
            from identity_proposals import sha
            manifest['revision'] = parent['revision']
            (inputs / 'manifest.json').write_text(json.dumps(manifest))
            result = FIXTURE['result']
            answers = [dict(id=case['id'], inputHash=result['inputHash'], answer=result['answer'],
                            resultHash=result['resultHash'], recipe=result['recipe'], path=saved.name)]
            receipt = dict(total=1, complete=1, remaining=0, answersHash=sha(answers), remainingHash=sha([]),
                           sourceRevision=parent['revision'], sourceManifestHash=sha(manifest), failureReasons={})
            (results/'answers.json').write_text(json.dumps(answers))
            (results/'remaining.json').write_text('[]')
            (results/'reconciliation.json').write_text(json.dumps(receipt))
            compact = build(inputs, results, parent, 'pilot-review')
            self.assertEqual(compact['records'][0]['data']['answer'], result['answer'])
            receipt['answersHash'] = '0'*64
            (results/'reconciliation.json').write_text(json.dumps(receipt))
            with self.assertRaises(ValueError):
                build(inputs, results, parent, 'pilot-review')
            (results/'reconciliation.json').unlink()
            extra = results / 'case-extra.json'
            extra.write_text(saved.read_text())
            with self.assertRaises(ValueError):
                build(inputs, results, parent, 'pilot-review')
            extra.unlink()
            (inputs / 'inputs-000.json').write_text(raw + ' ')
            with self.assertRaises(ValueError):
                build(inputs, results, parent, 'pilot-review')

class ImportTests(unittest.TestCase):
    def test_roundtrip_and_reject_promotions(self):
        import hashlib
        import sqlite3
        import tempfile
        from extend_d1 import prepare
        from prepare_d1 import encode
        from identity_proposals import sha
        root_repo = Path(__file__).resolve().parents[3]
        case = FIXTURE['case']
        passage = dict(id=case['personKey'].split('/')[0], ref=case['ref'],
                       source=case['source'], people=[case['person']])
        payload = encode(passage)
        row = ('passage:' + passage['id'], 'passage', passage['id'], passage['ref'], None, None,
               'source', None, hashlib.sha256(payload.encode()).hexdigest(), payload)
        parent = dict(revision='real-pilot-source-subset', recordCount=1, countsByKind={'passage': 1},
                      recordSetSha256=hashlib.sha256(encode([row[:-1]]).encode()).hexdigest())
        raw = json.dumps([case], ensure_ascii=False) + '\n'
        manifest = {'revision': parent['revision'], 'sourceRecordSetSha256': parent['recordSetSha256'], 'cases': 1, 'inputFiles': {'inputs-000.json': hashlib.sha256(raw.encode()).hexdigest()}}
        changes = dict(parentRevision=parent['revision'], description='Saved pilot review',
                       proposalInputManifest=manifest, proposalInputManifestSha256=sha(manifest),
                       proposalInputFileCases={'inputs-000.json': [case['id']]},
                       records=[record('pilot-review', case, FIXTURE['result'])])
        answer = dict(id=case['id'], inputHash=sha(case), answer=FIXTURE['result']['answer'],
                      resultHash=FIXTURE['result']['resultHash'], recipe=FIXTURE['result']['recipe'], path=None)
        changes['proposalRecoveryOrder'] = dict(answers=[case['id']], remaining=[])
        changes['proposalRecoveryReceipt'] = dict(total=1, complete=1, remaining=0, answersHash=sha([answer]),
                                                  remainingHash=sha([]), sourceRevision=manifest['revision'], sourceManifestHash=sha(manifest))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with sqlite3.connect(':memory:') as db:
                for migration in sorted((root_repo / 'packages/talmud/migrations-sage-graph').glob('*.sql')):
                    db.executescript(migration.read_text())
                db.execute('INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,?,?)',
                           (parent['revision'], encode({k:v for k,v in parent.items() if k!='revision'}), 'loading'))
                db.execute('INSERT INTO sage_graph_records VALUES (' + ','.join('?'*11) + ')', (parent['revision'], *row))
                db.execute("UPDATE sage_graph_revisions SET state='verified'")
                (root/'parent.sql').write_text('\n'.join(db.iterdump()))
            (root/'manifest.json').write_text(json.dumps(parent))
            def run(value, output):
                (root/'changes.json').write_text(json.dumps(value))
                return prepare(root/'parent.sql',root/'manifest.json',root/'changes.json',root/output,shared=True)
            self.assertEqual(run(changes,'good')['changedRecords'], 1)
            for key in ('revision', 'sourceRecordSetSha256'):
                corrupt = copy.deepcopy(changes)
                corrupt['proposalInputManifest'][key] = 'wrong-parent'
                corrupt['proposalInputManifestSha256'] = sha(corrupt['proposalInputManifest'])
                with self.subTest(snapshot=key), self.assertRaises(ValueError):
                    run(corrupt, 'snapshot-' + key)
            for field, value in [('authority','source_review'), ('decision','accepted')]:
                corrupt = copy.deepcopy(changes)
                corrupt['records'][0][field] = value
                with self.subTest(field=field), self.assertRaises(ValueError):
                    run(corrupt,field)
            corrupt = copy.deepcopy(changes)
            corrupt['records'][0]['replacesSha256'] = row[-2]
            with self.assertRaises(ValueError):
                run(corrupt,'replace')

class AuditTests(unittest.TestCase):
    def test_real_annotation_and_quote_corruption(self):
        from identity_proposals import sha
        from proposal_audits import validate_audit
        fixture = json.loads((Path(__file__).parent/'fixtures/identity-audit.json').read_text())
        case, comparison, note = fixture['case'], fixture['comparison'], fixture['review']
        audit = dict(disagreement=True, accepted=False, comparison=comparison, review=note,
                     receiptSha256=sha(fixture), comparisonSha256=sha(comparison), reviewSha256=sha(note))
        data = dict(case=case, answer=comparison['first'], audit=audit)
        passage = dict(ref=case['ref'], source=case['source'])
        def second(d, p):
            for e in d['answer']['evidence']:
                self.assertIn(e['quote'], p['source'][e['location']])
        validate_audit(data, passage, second)
        audit['accepted'] = True
        with self.assertRaises(ValueError):
            validate_audit(data, passage, second)
        audit['accepted'] = False
        note['supportingQuote'] = 'invalid source excerpt'
        audit['reviewSha256'] = sha(note)
        with self.assertRaises(ValueError):
            validate_audit(data, passage, second)
