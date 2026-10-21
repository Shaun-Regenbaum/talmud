"""Name suggestions for people in checked readings, on real rows.

The checked store is the store owner's own test store (test_checked_source_store), built from the adapter's two real
captured readings, Sukkah 11a and Arakhin 31b. Their review decisions, approvals and selection are test-only and say so;
they authorize nothing. The read-back is the store owner's readback() of that store. The graph parent is the importer
tests' parent of real rows plus 135 registry rows copied exactly from live revision 8b0f4c; with them these two readings
get the same answers as with all 1,352 registry rows (the fixture says how). Where a test needs a situation the rows do not
contain, it says so and changes as little as it can. In a release root writes the pins; here pins_for plays that part.
"""
import copy
import json
import sqlite3
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'storage'), str(ROOT / 'identity'), str(ROOT), str(Path(__file__).parent)]
import checked_source_store as checked  # noqa: E402
import name_candidates as nc  # noqa: E402
import name_candidates_import as imp  # noqa: E402
import source_reading_stores as stores  # noqa: E402
# Modules, not their classes, so their tests are not collected a second time here.
import test_checked_source_store as store_tests  # noqa: E402
import test_name_candidates_import as raw_tests  # noqa: E402
from extend_d1 import prepare  # noqa: E402
from test_checked_source import approve, make_bundle  # noqa: E402

FIXTURES = Path(__file__).parent / 'fixtures'
OWNERSHIP = dict(imp.REVIEWED_OWNERSHIP, bavli=store_tests.OWNERSHIP['expectedManifestSha256'])  # the test store's own manifest
MIGRATIONS = ROOT.parents[1] / 'packages/talmud/migrations-sage-graph'


def checked_store(bundles=None):
    """The store owner's checked-store test, run up to its read-back in a temporary folder that is removed afterwards.
    Returns the read-back file's bytes, the test selection's bytes and the approved artifacts by hash."""
    case = store_tests.CheckedStoreTests('test_rows_keep_every_checked_field_and_list_each_other')
    case.setUp()
    try:
        if bundles is not None:
            case.bundles = bundles
            case.selection, case.approvals, case.texts = store_tests.release_inputs(bundles)
            case.pin = checked.sha(case.selection)
        upgraded = case.upgraded()
        changes = case.changes(upgraded['sourceReadingStore'], upgraded['revision'])
        case.release(case.extend(changes, 'upgraded', 'first', checked_selections=[case.pin]), 'first')
        artifacts = case.root / 'artifacts'
        artifacts.mkdir()
        for body in case.texts.values():
            (artifacts / (checked.sha(body) + '.json')).write_text(body)
        inputs = dict(selection=case.selection, pin=case.pin, approvals=case.approvals)
        f = stores.readback(case.root / 'first.sql', case.root / 'first.json', artifacts, [store_tests.OWNERSHIP], inputs)
    finally:
        case.doCleanups()
    return dict(file=raw_tests.file_bytes(f), selection=case.selection.encode(),
                artifacts={checked.sha(body): body.encode() for body in case.texts.values()})


def with_roles(roles):
    """The two real readings with some mention roles changed in the review plan and approved again (test only).
    roles: {(person label, mention index): new role}."""
    bundles = []
    for job in store_tests.JOBS:
        bundle = make_bundle(job)
        for d in bundle['plan']['decisions']:
            for (label, i), role in roles.items():
                if d['after'] and d['after']['label'] == label:
                    d['after']['mentions'][i]['role'] = role
        bundles.append(approve(bundle))
    return bundles


def parent(extra=()):
    registry = json.loads((FIXTURES / 'checked-name-candidates-registry.json').read_text())['rows']
    rows = sorted([tuple(r) for r in raw_tests.PARENT_ROWS] + [tuple(r) for r in registry] + list(extra))
    return rows, dict(revision='test-parent-of-real-rows', recordCount=len(rows),
                      recordSetSha256=nc.sha(imp.d1_encode([list(r[:-1]) for r in rows])))


def pins_for(manifest, store, version=imp.PINS_V2):
    """Root's pins for one read-back file, as root would write them for a release; here the test writes them."""
    f = json.loads(store['file'])
    pin = dict(sha256=nc.sha256_bytes(store['file']), store=f['store'], database=f['readBack']['database'], revision=f['revision'],
               recordSetSha256=f['recordSetSha256'], parentRevision=f['parentRevision'], exportSha256=f['readBack']['exportSha256'],
               ownershipManifestSha256=OWNERSHIP[f['store']], revisionState='verified',
               producer=dict(commit='this test', codeSha256=nc.sha256_file(stores.__file__)))
    if version == imp.PINS_V2:
        pin['checkedSelectionSha256'] = nc.sha256_bytes(store['selection'])
    return dict(version=version, graph=dict(revision=manifest['revision'], recordSetSha256=manifest['recordSetSha256']), readbacks=[pin])


def build_on(rows, store, manifest=None, pins=None, **given):
    manifest = manifest or dict(revision='test-parent-of-real-rows', recordCount=len(rows),
                                recordSetSha256=nc.sha(imp.d1_encode([list(r[:-1]) for r in sorted(rows)])))
    inputs = dict(dict(checked_selection=store['selection'], artifacts=store['artifacts']), **given)
    return imp.build(sorted(rows), manifest, [store['file']], pins or pins_for(manifest, store), raw_tests.ALIASES,
                     raw_tests.DUPLICATES, OWNERSHIP, **inputs)


def refit(store, edit):
    """The read-back edited after it was made, with its receipt hashes made to fit again (test only), so that only the
    importer's own row checks stand between the edit and a release."""
    f = json.loads(store['file'])
    edit(f)
    f['readBack']['checkedPassagesSha256'] = imp.d1_hash(f['checkedPassages'])
    f['readBackSha256'] = imp.d1_hash(f['readBack'])
    return dict(store, file=raw_tests.file_bytes(f))


def person_row(f, label):
    return next((pid, r) for pid, p in f['checkedPassages'].items() for r in p['rows']
                if r['kind'] == 'checked_person' and r['data']['label'] == label)


def restore_hash(f, pid, row):
    """Make the stored hash fit an edited row (test only)."""
    next(s for s in f['checkedPassages'][pid]['stored'] if s['recordId'] == row['record_id'])['payloadSha256'] = imp.d1_hash(row['data'])


def setUpModule():
    global STORE
    STORE = checked_store()


class CheckedNameCandidateTests(unittest.TestCase):
    def build(self, store=None, rows=None, **kw):
        rows, manifest = (rows, None) if rows else parent()
        return build_on(rows, store or STORE, manifest, **kw)

    def check(self, changes, store=None):
        rows, manifest = parent()
        store = store or STORE
        return imp.validate_changes(changes, rows, manifest, [store['file']], pins_for(manifest, store), raw_tests.ALIASES,
                                    raw_tests.DUPLICATES, OWNERSHIP, checked_selection=store['selection'], artifacts=store['artifacts'])

    def test_the_read_back_carries_the_stored_rows(self):
        f = json.loads(STORE['file'])
        self.assertEqual(f['readBack']['checkedPassagesSha256'], imp.d1_hash(f['checkedPassages']))
        for pid, p in f['checkedPassages'].items():
            self.assertEqual(set(p), {'artifactSha256', 'jobId', 'stored', 'rows'})
            stored = {s['recordId']: s for s in p['stored']}
            self.assertEqual([r['record_id'] for r in p['rows']],
                             sorted(k for k, s in stored.items() if s['kind'] in stores.CHECKED_ROWS_FOR_CONSUMERS))
            for r in p['rows']:
                self.assertEqual((r['passage_id'], r['kind'], imp.d1_hash(r['data'])), (pid, stored[r['record_id']]['kind'],
                                                                                      stored[r['record_id']]['payloadSha256']))
            self.assertEqual(Counter(r['kind'] for r in p['rows'])['checked_reading'], 1)

    def test_suggestions_for_checked_people(self):
        changes = self.build()
        self.assertEqual(self.check(changes)['records'], 12)
        data = {r['subject_id']: r['data'] for r in changes['records']}
        label = lambda key: data[key]['readingLabel']
        self.assertEqual(sorted((label(k), d['suggestion']) for k, d in data.items() if d['status'] == 'tentative'),
                         [('Rabbi Abba bar Memel', 'rebbi-abba-b-rebbi-mamal'), ('רב חייא בר אשי', 'rav-chiya-b-ashi'),
                          ('רב עמרם חסידא', 'rav-amram-chasida')])
        self.assertEqual(Counter(d['status'] for d in data.values()), Counter(alternatives=7, tentative=3, local_relative=2))
        fathers = {label(k): [label(c) for c in d['namedInsidePatronymicOf']] for k, d in data.items() if d['status'] == 'local_relative'}
        self.assertEqual(fathers, {'אשי': ['רב חייא בר אשי'], 'Memel': ['Rabbi Abba bar Memel']})
        self.assertEqual(sorted(h['reason'] for h in changes['held']),
                         ['group/named is not matched to the registry', 'person/unnamed is not matched to the registry'])
        f = json.loads(STORE['file'])
        for record in changes['records']:
            d = record['data']
            p = f['checkedPassages'][d['passageId']]
            stored = {s['recordId']: s for s in p['stored']}
            person = next(r['data'] for r in p['rows'] if r['record_id'] == 'checked_person:' + d['personKey'])
            self.assertEqual((record['record_id'], record['authority'], record['decision']), ('name_candidates:v1/' + d['personKey'], 'screening', 'needs_review'))
            self.assertEqual((d['basis'], d['accepted'], d['historicalIdentityResolved']), (nc.CHECKED_BASIS, False, False))
            for name, record_id in (('person', 'checked_person:' + d['personKey']), ('reading', 'checked_reading:' + d['passageId'])):
                self.assertEqual(d['bindings'][name], dict(recordId=record_id, v1PayloadSha256=None, store='bavli', revision=f['revision'],
                                                           payloadSha256=stored[record_id]['payloadSha256'], payloadFormat=imp.CHECKED_FORMAT))
            self.assertEqual(d['bindings']['artifact']['sha256'], p['artifactSha256'])
            self.assertEqual(d['checkedDecision'], {k: person['decision'][k] for k in ('id', 'action', 'beforeHash', 'reviewHashes')})
            self.assertEqual([m['quote'] for m in d['mentions']], [m['quote'] for m in person['mentions'] if m['role'] == 'printed_name'])
            self.assertEqual({c['status'] for c in d['coverage']}, {'partial'})  # the test plan marks every source partial
        producer = changes['nameCandidateInputs']
        self.assertEqual(producer['checkedRulesSha256'], nc.checked_rules_sha())
        self.assertEqual(producer['sources'][0]['checkedSelectionSha256'], nc.sha256_bytes(STORE['selection']))

    def test_only_owned_printed_names_are_looked_up(self):
        # Test only: one printed name of R. Abba bar Memel becomes an actor description, and both of R. Yochanan's become
        # referential evidence, in the review plan, which is then approved again.
        store = checked_store(with_roles({('Rabbi Abba bar Memel', 1): 'actor_description', ('Rabbi Yochanan', 0): 'referential_evidence',
                                          ('Rabbi Yochanan', 1): 'referential_evidence'}))
        changes = self.build(store)
        self.check(changes, store)
        data = {d['readingLabel']: d for d in (r['data'] for r in changes['records'])}
        abba = data['Rabbi Abba bar Memel']
        self.assertEqual((abba['status'], len(abba['mentions'])), ('tentative', 1))
        self.assertEqual([(m['role'], m['why']) for m in abba['otherMentions']], [('actor_description', 'Only a printed name is looked up')])
        self.assertNotIn('Rabbi Yochanan', data)
        yochanan = person_row(json.loads(store['file']), 'Rabbi Yochanan')[1]['data']['id']
        self.assertIn(dict(personKey=next(k for k in (h['personKey'] for h in changes['held']) if k.endswith('/' + yochanan)),
                           reason='No owned printed name to look up'), changes['held'])
        # Test only: the reading's owned units narrowed so that R. Abba bar Memel's printed names fall outside them.
        rows, manifest = parent()
        _, cases, _ = imp.readback_passages([store['file']], pins_for(manifest, store), OWNERSHIP, store['selection'], store['artifacts'])
        pid, row = person_row(json.loads(store['file']), 'Rabbi Abba bar Memel')
        reading = copy.deepcopy(cases[pid])
        printed = {m['segmentId'] for m in row['data']['mentions']}
        reading['ownership']['ownedUnits'] = [u for u in reading['ownership']['ownedUnits'] if u['segmentId'] not in printed]
        registry = nc.registry_index([(r[0], r[-2], r[-1]) for r in rows if r[1] == 'registry_person'], imp.strict_json(raw_tests.ALIASES))
        duplicates = imp.strict_json(raw_tests.DUPLICATES)['duplicates']
        out, skipped = nc.build_checked([reading], registry, duplicates, manifest['revision'])
        self.assertNotIn(pid + '/' + row['data']['id'], {c['personKey'] for c in out})
        self.assertIn(dict(personKey=pid + '/' + row['data']['id'], reason='No owned printed name to look up'), skipped)
        # Test only: a checked hold of a person, in case a later reading keeps a row for one.
        reading = copy.deepcopy(cases[pid])
        reading['holds'] = reading['holds'] + [dict(data=dict(kind='person', action='hold', originalId=row['data']['decision']['originalId']))]
        out, skipped = nc.build_checked([reading], registry, duplicates, manifest['revision'])
        self.assertIn(dict(personKey=pid + '/' + row['data']['id'], reason='The checked review held this person'), skipped)

    def test_a_human_decision_holds_the_checked_person(self):
        # For this test, the real human correction connection:b042-p0/review/answer is re-pointed at R. Abba bar Memel by
        # its subject column only. Its payload and hash are unchanged.
        pid, row = person_row(json.loads(STORE['file']), 'Rabbi Abba bar Memel')
        key = pid + '/' + row['data']['id']
        real = next(tuple(r) for r in raw_tests.PARENT_ROWS if r[0] == 'connection:b042-p0/review/answer')
        rows, _ = parent()
        rows = [r for r in rows if r[0] != real[0]] + [(*real[:4], 'local:' + key, *real[5:])]
        changes = self.build(rows=rows)
        self.assertNotIn(key, {r['subject_id'] for r in changes['records']})
        self.assertEqual([b['recordId'] for b in next(h for h in changes['held'] if h['personKey'] == key)['decidedBy']], [real[0]])

    def test_the_selection_and_artifacts_come_from_the_caller_and_match_roots_pins(self):
        rows, manifest = parent()
        with self.assertRaisesRegex(ValueError, 'need a version-2 pin'):
            self.build(pins=pins_for(manifest, STORE, imp.PINS))
        for given in (dict(checked_selection=None), dict(checked_selection=STORE['selection'] + b' ')):
            with self.assertRaisesRegex(ValueError, 'checked selection differs from its pin'):
                self.build(**given)
        # Test only: another selection, pinned as if root had chosen it, that does not hold these readings.
        other = dict(STORE, selection=store_tests.release_inputs([make_bundle(store_tests.JOBS[0])])[0].encode())
        with self.assertRaisesRegex(ValueError, "not in root's pinned selection"):
            self.build(other)
        first = sorted(STORE['artifacts'])[0]
        for artifacts in ({k: v for k, v in STORE['artifacts'].items() if k != first}, dict(STORE['artifacts'], **{first: STORE['artifacts'][first] + b' '})):
            with self.assertRaisesRegex(ValueError, 'approved artifact is missing or differs'):
                self.build(artifacts=artifacts)

    def test_edited_rows_are_refused_even_when_the_receipt_is_refit(self):
        f = json.loads(STORE['file'])
        pid, _ = person_row(f, 'Rabbi Abba bar Memel')

        def label(f):
            person_row(f, 'Rabbi Abba bar Memel')[1]['data']['label'] = 'Rabbi Abba'

        def plan(f):
            reading = next(r for r in f['checkedPassages'][pid]['rows'] if r['kind'] == 'checked_reading')
            reading['data']['planHash'] = '1' * 64
            restore_hash(f, pid, reading)

        def moved(f):
            _, row = person_row(f, 'Rabbi Abba bar Memel')
            row['data']['mentions'][0].update(start=row['data']['mentions'][0]['start'] + 1, end=row['data']['mentions'][0]['end'] + 1)
            restore_hash(f, pid, row)

        edits = [
            (lambda f: f['checkedPassages'][pid].pop('rows'), 'needs its stored rows'),
            (lambda f: f['checkedPassages'][pid]['rows'].pop(), 'differ from the stored rows of those kinds'),
            (label, 'differs from its stored hash'),
            (plan, "differs from root's selection"),
            (moved, 'not at its span'),
        ]
        for edit, message in edits:
            with self.subTest(message), self.assertRaisesRegex(ValueError, message):
                self.build(refit(STORE, edit))
        with self.assertRaisesRegex(ValueError, 'Checked passages differ from the read-back receipt'):
            f = json.loads(STORE['file'])
            label(f)
            self.build(dict(STORE, file=raw_tests.file_bytes(f)))

    def test_a_checked_reading_replaces_the_raw_reading_of_the_same_result(self):
        f = json.loads(STORE['file'])
        pid = sorted(f['checkedPassages'])[0]
        envelope = next(r for r in f['checkedPassages'][pid]['rows'] if r['kind'] == 'checked_reading')['data']
        raw_result = envelope['supersedes']['rawResultHash']
        # Test only: a graph row holding a raw reading of the same raw result. The graph copy would win on the page, so
        # the checked reading could never show: refused.
        payload = imp.d1_encode(dict(provenance=dict(resultSha256=raw_result)))
        graph_copy = ('source_reading:sr1-graph-copy', 'source_reading', 'sr1-graph-copy', None, None, None, 'screening', 'needs_review',
                      nc.sha(payload), payload)
        rows, _ = parent([graph_copy])
        with self.assertRaisesRegex(ValueError, 'The graph holds the raw reading this checked reading supersedes'):
            self.build(rows=rows)
        # Test only: a store raw reading of the same raw result, given beside the real checked readings. It is left
        # out and listed as superseded; nothing is built from it.
        rows, manifest = parent()
        held, cases, sources = imp.readback_passages([STORE['file']], pins_for(manifest, STORE), OWNERSHIP, STORE['selection'], STORE['artifacts'])
        store_raw = dict(store='bavli', revision=f['revision'], stored={}, v1Sha256={},
                         v1=[dict(kind='source_reading', data=dict(provenance=dict(resultSha256=raw_result)))])
        with mock.patch.object(imp, 'readback_passages', return_value=({'sr1-store-copy': store_raw}, cases, sources)):
            raw, kept, _, superseded = imp.readings(rows, [STORE['file']], pins_for(manifest, STORE), OWNERSHIP)
        self.assertEqual((raw, sorted(kept)), ({}, sorted(cases)))
        self.assertEqual(superseded, [dict(passageId='sr1-store-copy', reason='A checked reading of the same raw result supersedes this raw reading',
                                           checkedPassageId=pid)])

    def test_any_edit_to_the_changes_is_refused(self):
        changes = self.build()
        edits = [
            lambda c: c['records'][0]['data'].update(accepted=True),
            lambda c: c['records'][0]['data'].pop('basis'),
            lambda c: next(r for r in c['records'] if r['data']['status'] == 'alternatives')['data'].update(status='tentative'),
            lambda c: c['records'][0]['data']['bindings']['person'].update(payloadSha256='0' * 64),
            lambda c: c['records'][0]['data']['bindings']['artifact'].update(bytes=1),
            lambda c: c['nameCandidateInputs'].update(checkedRulesSha256='0' * 64),
            lambda c: c['held'].pop(),
        ]
        for edit in edits:
            changed = copy.deepcopy(changes)
            edit(changed)
            with self.assertRaisesRegex(ValueError, 'differ from a rebuild'):
                self.check(changed)

    def test_the_release_hook_takes_the_checked_batch_only_with_its_inputs(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        rows, manifest = parent()
        manifest = dict(manifest, countsByKind=dict(sorted(Counter(r[1] for r in rows).items())))
        db = sqlite3.connect(':memory:')
        for migration in sorted(MIGRATIONS.glob('*.sql')):
            db.executescript(migration.read_text())
        db.execute('INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,?,?)',
                   (manifest['revision'], imp.d1_encode({k: v for k, v in manifest.items() if k != 'revision'}), 'loading'))
        db.executemany('INSERT INTO sage_graph_records VALUES (' + ','.join('?' * 11) + ')', [(manifest['revision'], *r) for r in rows])
        db.execute("UPDATE sage_graph_revisions SET state='verified'")
        (root / 'parent.sql').write_text('\n'.join(db.iterdump()))
        db.close()
        (root / 'manifest.json').write_text(json.dumps(manifest))

        def release(store, out, **kw):
            pins = pins_for(manifest, store)
            (root / (out + '.json')).write_text(json.dumps(build_on(rows, store, manifest, pins), ensure_ascii=False))
            return prepare(root / 'parent.sql', root / 'manifest.json', root / (out + '.json'), root / out, shared=True,
                           name_candidate_pins=pins, readbacks=[store['file']], **kw)
        inputs = lambda store: dict(name_candidate_selection=store['selection'], name_candidate_artifacts=store['artifacts'])
        # The hook reads the reviewed ownership manifests; for this test store, its own manifest stands in.
        with mock.patch.dict(imp.REVIEWED_OWNERSHIP, OWNERSHIP):
            with self.assertRaisesRegex(ValueError, 'checked selection differs from its pin'):
                release(STORE, 'no-selection')
            # A bare "רב" fits 140 registry entries, and its record is too large for one database statement, so the
            # whole batch is refused. Six such people in the real 57 hit this too.
            with self.assertRaisesRegex(ValueError, 'exceeds the database statement limit'):
                release(STORE, 'too-large', **inputs(STORE))
            # Test only: Sukkah's bare "רב" has its printed names marked referential in the review plan, approved again.
            store = checked_store(with_roles({('רב', i): 'referential_evidence' for i in range(4)}))
            result = release(store, 'out', **inputs(store))
        self.assertEqual(result['changedRecords'], 11)
        self.assertEqual(json.loads((root / 'out/manifest.json').read_text())['countsByKind']['name_candidates'], 11)

if __name__ == '__main__':
    unittest.main()
