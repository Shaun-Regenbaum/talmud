"""Checked readings in a source-reading store, on the adapter's real captured readings.

The bundles are the adapter tests' real readings with their test-only decisions. The selection and root
approval files here are built for these tests only. They are labelled so, and authorize nothing.
"""
import copy
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import checked_source_store as checked  # noqa: E402
import source_reading_stores as stores  # noqa: E402
from extend_d1 import prepare  # noqa: E402
from test_checked_source import FIXTURE, approve, make_bundle, run  # noqa: E402
from test_source_reading_stores import LEGACY, database  # noqa: E402

OWNERSHIP = dict(manifest=FIXTURE['ownership'], expectedManifestSha256=FIXTURE['ownership']['manifest']['manifestSha256'])
JOBS = ('v18-bavli-q33735', 'v18-bavli-t01082')


def text(value):
    return json.dumps(value, ensure_ascii=False, indent=1) + '\n'


def release_inputs(bundles):
    """A test-only selection: the first job approved by a batch approval, the second by a singleton one."""
    cases, approvals = [], {}
    batch = []
    for i, bundle in enumerate(bundles):
        artifact = run(bundle)
        pins = dict(jobId=bundle['job']['job_id'], planHash=checked.sha(json.dumps(bundle['plan'], ensure_ascii=False, sort_keys=True, separators=(',', ':'))),
                    approvalHash=checked.sha(json.dumps(bundle['approval'], ensure_ascii=False, sort_keys=True, separators=(',', ':'))),
                    artifactHash=artifact['artifactHash'])
        if i == 0:
            batch.append(pins)
        else:
            single = text(dict(decision=checked.SINGLE_APPROVAL, planHash=pins['planHash'], approvalHash=pins['approvalHash'],
                               artifactHash=pins['artifactHash'], historicalIdentitiesAccepted=False,
                               note='Test only; authorizes nothing.'))
            approvals[checked.sha(single)] = single
            pins['approval'] = checked.sha(single)
        cases.append(dict(pins, people=len(artifact['people']), connections=len(artifact['connections']),
                          bundleFileSha256=checked.sha(text(bundle))))
    batch_text = text(dict(version=checked.BATCH_APPROVAL, approvedCases=batch, remoteActivationApproved=False,
                           note='Test only; authorizes nothing.'))
    approvals[checked.sha(batch_text)] = batch_text
    for case in cases:
        case['rootApprovalFileSha256'] = case.pop('approval', checked.sha(batch_text))
    selection = text(dict(version=checked.SELECTION_VERSION, productionApproved=False, readings=len(cases),
                          people=sum(c['people'] for c in cases), connections=sum(c['connections'] for c in cases),
                          cases=cases, note='Test only; authorizes nothing.'))
    return selection, approvals, {b['job']['job_id']: text(b) for b in bundles}


class CheckedStoreTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        old = stores.STORES['bavli']['ownershipManifestSha256']
        stores.STORES['bavli']['ownershipManifestSha256'] = OWNERSHIP['expectedManifestSha256']
        self.addCleanup(stores.STORES['bavli'].__setitem__, 'ownershipManifestSha256', old)
        self.bundles = [make_bundle(job) for job in JOBS]
        self.selection, self.approvals, self.texts = release_inputs(self.bundles)
        self.pin = checked.sha(self.selection)
        self.db = database(str(self.root / 'store.sqlite'))
        self.addCleanup(self.db.close)
        self.genesis = self.release(stores.genesis('bavli'), 'genesis')

    def release(self, outputs, name):
        self.db.executescript(outputs['import.sql'])
        self.db.executescript(outputs['activate.sql'])
        self.db.commit()
        (self.root / f'{name}.sql').write_text('\n'.join(self.db.iterdump()))
        (self.root / f'{name}.json').write_text(outputs['manifest.json'])
        return json.loads(outputs['manifest.json'])

    def extend(self, changes, parent, out, **kw):
        path = self.root / f'{out}.json.in'
        path.write_text(json.dumps(changes, ensure_ascii=False))
        prepare(self.root / f'{parent}.sql', self.root / f'{parent}.json', path, self.root / out, shared=True, **kw)
        return {n: (self.root / out / n).read_text() for n in ('import.sql', 'manifest.json', 'activate.sql')}

    def changes(self, block, parent, existing=None, selection=None, approvals=None, texts=None):
        selection = selection or self.selection
        return checked.changes_for(block, selection, checked.sha(selection), approvals or self.approvals, texts or self.texts,
                                   OWNERSHIP, parent, LEGACY, existing)

    def upgraded(self):
        upgrade = stores.upgrade_changes(self.genesis['sourceReadingStore'], self.genesis['revision'])
        return self.release(self.extend(upgrade, 'genesis', 'up'), 'upgraded')

    def test_rows_keep_every_checked_field_and_list_each_other(self):
        rows = checked.rows_for('bavli', checked.selected_cases(self.selection, self.pin, self.approvals)[1], self.texts,
                                stores.pinned_index(OWNERSHIP), self.pin)
        for job, bundle in zip(JOBS, self.bundles):
            artifact = run(bundle)
            pid = 'cs1-' + artifact['artifactHash']
            mine = [r for r in rows if r['passage_id'] == pid]
            envelope = next(r['data'] for r in mine if r['kind'] == 'checked_reading')
            self.assertEqual(envelope['contains'], {k: sorted(r['record_id'] for r in mine if r['kind'] == k)
                                                    for k in sorted(checked.KINDS - {'checked_reading'})})
            self.assertEqual(envelope['binding'], artifact['binding'])
            self.assertEqual(envelope['supersedes']['rawResultHash'], artifact['binding']['rawResultHash'])
            self.assertEqual([s['sha256'] for s in envelope['segments']], [s['sha256'] for s in bundle['job']['sources']])
            people = {r['data']['id']: r['data'] for r in mine if r['kind'] == 'checked_person'}
            for person in artifact['people']:
                self.assertEqual({k: v for k, v in people[person['id']].items() if k not in ('format', 'readingId', 'decision')}, person)
            self.assertEqual([r['data']['sources'] for r in mine if r['kind'] == 'checked_ownership'], [artifact['ownership']])
            self.assertTrue(all((r['authority'], r['decision']) == ('screening', 'needs_review') for r in mine))
        self.assertEqual(stores.STORE_KINDS, stores.KINDS | checked.KINDS)

    def test_pins_come_only_from_roots_selection(self):
        cases = lambda selection, pin=None, approvals=None: checked.selected_cases(selection, pin or checked.sha(selection), approvals or self.approvals)
        with self.assertRaisesRegex(ValueError, 'not the one root pinned'):
            checked.selected_cases(self.selection, '0' * 64, self.approvals)
        edited = {h: t.replace('Test only', 'Test  only') for h, t in self.approvals.items()}
        with self.assertRaisesRegex(ValueError, 'differs from its hash'):
            cases(self.selection, approvals=edited)
        # A selection whose case names hashes its approval file does not approve.
        selection = json.loads(self.selection)
        selection['cases'][1]['planHash'] = '1' * 64
        with self.assertRaisesRegex(ValueError, 'does not approve this exact case'):
            cases(text(selection))
        selection = json.loads(self.selection)
        selection['cases'][0]['artifactHash'] = '2' * 64
        with self.assertRaisesRegex(ValueError, 'does not approve this exact case'):
            cases(text(selection))
        selection = json.loads(self.selection)
        selection['cases'].append(selection['cases'][0])
        with self.assertRaisesRegex(ValueError, 'selected twice'):
            cases(text(selection))
        # A bundle cannot approve itself: a changed plan needs a new selection.
        bundle = copy.deepcopy(self.bundles[0])
        bundle['plan']['decisions'][0]['reason'] += ' again'
        texts = dict(self.texts, **{JOBS[0]: text(approve(bundle))})
        with self.assertRaisesRegex(ValueError, 'Bundle file differs from the selection'):
            self.changes(stores.store_block('bavli', 2), 'x', texts=texts)

    def test_store_release_needs_the_upgrade_and_the_callers_selection_pin(self):
        with self.assertRaisesRegex(ValueError, 'does not hold checked readings yet'):
            self.changes(self.genesis['sourceReadingStore'], self.genesis['revision'])
        upgraded = self.upgraded()
        self.assertEqual(upgraded['sourceReadingStore'], stores.store_block('bavli', 2))
        with self.assertRaisesRegex(ValueError, 'Only a contract 1 store'):
            stores.upgrade_changes(upgraded['sourceReadingStore'], upgraded['revision'])
        changes = self.changes(upgraded['sourceReadingStore'], upgraded['revision'])
        with self.assertRaisesRegex(ValueError, 'not pinned by the caller'):
            self.extend(changes, 'upgraded', 'refused')
        first = self.release(self.extend(changes, 'upgraded', 'first', checked_selections=[self.pin]), 'first')
        artifacts = self.root / 'artifacts'
        artifacts.mkdir()
        for job, body in self.texts.items():
            (artifacts / (checked.sha(body) + '.json')).write_text(body)
        inputs = dict(selection=self.selection, pin=self.pin, approvals=self.approvals)
        with self.assertRaisesRegex(ValueError, 'pinned selection'):
            stores.verify_store(self.root / 'first.sql', self.root / 'first.json', artifacts, [OWNERSHIP])
        receipt = stores.verify_store(self.root / 'first.sql', self.root / 'first.json', artifacts, [OWNERSHIP], checked=inputs)
        self.assertEqual((receipt['checkedPassages'], receipt['passagesChecked']), (2, 2))
        file = stores.readback(self.root / 'first.sql', self.root / 'first.json', artifacts, [OWNERSHIP], inputs)
        self.assertEqual((len(file['passages']), len(file['checkedPassages'])), (0, 2))
        self.assertEqual(file['readBack']['checkedPassagesSha256'], stores.digest(stores.encode(file['checkedPassages'])))
        # The downloaded file must be the bundle's exact bytes.
        name = checked.sha(self.texts[JOBS[0]]) + '.json'
        (artifacts / name).write_text(self.texts[JOBS[0]] + ' ')
        with self.assertRaisesRegex(ValueError, 'Downloaded R2 file differs'):
            stores.verify_store(self.root / 'first.sql', self.root / 'first.json', artifacts, [OWNERSHIP], checked=inputs)
        # A second checked version of the same raw result is refused.
        rows = self.db.execute(f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?', (first['revision'],))
        existing = {r[0]: stores.item(r) for r in rows}
        bundle = copy.deepcopy(self.bundles[0])
        held = next(d for d in bundle['plan']['decisions'] if d['kind'] == 'connection' and d['action'] == 'hold')
        held['reason'] += ' (reviewed again)'
        selection, approvals, texts = release_inputs([approve(bundle)])
        with self.assertRaisesRegex(ValueError, 'already stored'):
            self.changes(first['sourceReadingStore'], first['revision'], existing, selection, approvals, texts)

    def test_prepare_refuses_a_raw_result_the_legacy_graph_already_read(self):
        upgraded = self.upgraded()
        # prepare-checked reads the files the selection names, so write them out.
        files = self.root / 'files'
        files.mkdir()
        selection = json.loads(self.selection)
        for case in selection['cases']:
            (files / (case['jobId'] + '.json')).write_text(self.texts[case['jobId']])
            (files / (case['rootApprovalFileSha256'] + '.json')).write_text(self.approvals[case['rootApprovalFileSha256']])
            case.update(bundlePath=str(files / (case['jobId'] + '.json')),
                        rootApprovalPath=str(files / (case['rootApprovalFileSha256'] + '.json')))
        (files / 'selection.json').write_text(text(selection))
        pin = checked.sha(text(selection))
        legacy = database(str(self.root / 'legacy.sqlite'))
        self.addCleanup(legacy.close)
        raw = json.loads(self.bundles[0]['rawResultText'])['resultHash']
        legacy.execute("INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,'{}','loading')", (LEGACY,))
        legacy.execute('INSERT INTO sage_graph_records(revision_id,record_id,kind,passage_id,ref,subject_id,object_id,authority,'
                       'decision,payload_sha256,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                       (LEGACY, 'source_reading:sr1-graph-copy', 'source_reading', 'sr1-graph-copy', None, None, None,
                        'screening', 'needs_review', '0' * 64, json.dumps(dict(provenance=dict(resultSha256=raw)))))
        legacy.execute("UPDATE sage_graph_revisions SET state='verified'")
        legacy.commit()
        args = lambda out: ('bavli', files / 'selection.json', pin, self.root / 'store.sqlite', upgraded['revision'],
                            OWNERSHIP, self.root / 'legacy.sqlite', LEGACY, self.root / out)
        with self.assertRaisesRegex(ValueError, 'already has a reading of this raw result'):
            stores.prepare_checked(*args('refused'))
        clean = database(str(self.root / 'clean.sqlite'))
        self.addCleanup(clean.close)
        clean.execute("INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,'{}','verified')", (LEGACY,))
        clean.commit()
        result = stores.prepare_checked(*args('prepared')[:6], self.root / 'clean.sqlite', LEGACY, self.root / 'prepared')
        self.assertEqual((result['readings'], result['rawResultsInLegacyGraph']), (2, 0))

    def test_an_edited_upgrade_or_store_block_is_refused(self):
        upgrade = stores.upgrade_changes(self.genesis['sourceReadingStore'], self.genesis['revision'])
        upgrade['sourceReadingStoreUpgrade']['toBlock']['corpora'] = ['bavli', 'mishnah']
        with self.assertRaisesRegex(ValueError, 'upgrade differs'):
            self.extend(upgrade, 'genesis', 'bad')
        upgraded = self.upgraded()
        changes = self.changes(upgraded['sourceReadingStore'], upgraded['revision'])
        changes['records'][0]['data']['wholeReadingFullyChecked'] = True
        with self.assertRaisesRegex(ValueError, 'Checked store records differ'):
            self.extend(changes, 'upgraded', 'edited', checked_selections=[self.pin])


if __name__ == '__main__':
    unittest.main()
