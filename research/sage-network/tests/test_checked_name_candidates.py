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


def checked_store(bundles=None, split=False):
    """The store owner's checked-store test, run up to its read-back in a temporary folder that is removed afterwards.
    With split, each reading comes in its own test-only selection, released one after the other, as the owner's own
    two-selection test does. Returns the read-back file's bytes, the selections' bytes and the artifacts by hash."""
    case = store_tests.CheckedStoreTests('test_rows_keep_every_checked_field_and_list_each_other')
    case.setUp()
    try:
        bundles = case.bundles if bundles is None else bundles
        current, label, inputs, texts = case.upgraded(), 'upgraded', [], {}
        for i, group in enumerate([[b] for b in bundles] if split else [bundles]):
            selection, approvals, group_texts = store_tests.release_inputs(group)
            inputs.append(dict(selection=selection, pin=checked.sha(selection), approvals=approvals))
            texts.update(group_texts)
            existing = {r[0]: stores.item(r) for r in case.db.execute(
                f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?', (current['revision'],))}
            changes = case.changes(current['sourceReadingStore'], current['revision'], existing, selection, approvals, group_texts)
            current = case.release(case.extend(changes, label, f'batch-{i}', checked_selections=[checked.sha(selection)]), f'batch-{i}')
            label = f'batch-{i}'
        artifacts = case.root / 'artifacts'
        artifacts.mkdir()
        for body in texts.values():
            (artifacts / (checked.sha(body) + '.json')).write_text(body)
        args = (case.root / f'{label}.sql', case.root / f'{label}.json', artifacts, [store_tests.OWNERSHIP], inputs)
        f = stores.readback(*args, checked_rows=True)
        plain = stores.readback(*args)
    finally:
        case.doCleanups()
    return dict(file=raw_tests.file_bytes(f), plain=raw_tests.file_bytes(plain), selections=[x['selection'].encode() for x in inputs],
                artifacts={checked.sha(body): body.encode() for body in texts.values()})


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


def pins_for(manifest, store, version=imp.PINS_V2, selections=None):
    """Root's pins for one read-back file, as root would write them for a release; here the test writes them.
    selections: the selection files the pin lists, if not the store's own."""
    f = json.loads(store['file'])
    pin = dict(sha256=nc.sha256_bytes(store['file']), store=f['store'], database=f['readBack']['database'], revision=f['revision'],
               recordSetSha256=f['recordSetSha256'], parentRevision=f['parentRevision'], exportSha256=f['readBack']['exportSha256'],
               ownershipManifestSha256=OWNERSHIP[f['store']], revisionState='verified',
               producer=dict(commit='this test', codeSha256=nc.sha256_file(stores.__file__)))
    if version == imp.PINS_V2:
        pin['checkedSelectionSha256s'] = sorted({nc.sha256_bytes(x) for x in (store['selections'] if selections is None else selections)})
    return dict(version=version, graph=dict(revision=manifest['revision'], recordSetSha256=manifest['recordSetSha256']), readbacks=[pin])


def build_on(rows, store, manifest=None, pins=None, **given):
    manifest = manifest or dict(revision='test-parent-of-real-rows', recordCount=len(rows),
                                recordSetSha256=nc.sha(imp.d1_encode([list(r[:-1]) for r in sorted(rows)])))
    inputs = dict(dict(checked_selections=store['selections'], artifacts=store['artifacts']), **given)
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
                                    raw_tests.DUPLICATES, OWNERSHIP, checked_selections=store['selections'], artifacts=store['artifacts'])

    def test_a_plain_read_back_keeps_its_format_and_is_refused(self):
        plain, f = json.loads(STORE['plain']), json.loads(STORE['file'])
        self.assertEqual({pid: set(p) for pid, p in plain['checkedPassages'].items()}, {pid: {'artifactSha256', 'jobId', 'stored'} for pid in f['checkedPassages']})
        self.assertEqual(plain['checkedPassages'], {pid: {k: v for k, v in p.items() if k != 'rows'} for pid, p in f['checkedPassages'].items()})
        self.assertEqual({k: v for k, v in plain['readBack'].items() if k != 'checkedPassagesSha256'},
                         {k: v for k, v in f['readBack'].items() if k != 'checkedPassagesSha256'})
        with self.assertRaisesRegex(ValueError, 'needs its stored rows'):
            self.build(dict(STORE, file=STORE['plain']))

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
            cited = dict(person='checked_person:' + d['personKey'], reading='checked_reading:' + d['passageId'],
                         ownership='checked_ownership:' + d['passageId'], coverage='checked_coverage:' + d['passageId'])
            self.assertEqual(set(d['bindings']), {'format', 'artifact', *cited})
            for name, record_id in cited.items():
                self.assertEqual(d['bindings'][name], dict(recordId=record_id, v1PayloadSha256=None, store='bavli', revision=f['revision'],
                                                           payloadSha256=stored[record_id]['payloadSha256'], payloadFormat=imp.CHECKED_FORMAT))
            self.assertEqual(d['bindings']['artifact']['sha256'], p['artifactSha256'])
            # primary means the focal source, as for raw readings; a case with no focal mention is context only.
            segments = {x['source_id']: x for x in next(r['data'] for r in p['rows'] if r['kind'] == 'checked_reading')['segments']}
            self.assertEqual([m['primary'] for m in d['mentions']], [segments[m['sourceId']]['provenance'].get('focal') is True for m in d['mentions']])
            self.assertEqual(d['contextOnly'], not any(m['primary'] for m in d['mentions']))
            self.assertEqual(d['checkedDecision'], {k: person['decision'][k] for k in ('id', 'action', 'beforeHash', 'reviewHashes')})
            self.assertEqual([m['quote'] for m in d['mentions']], [m['quote'] for m in person['mentions'] if m['role'] == 'printed_name'])
            self.assertEqual({c['status'] for c in d['coverage']}, {'partial'})  # the test plan marks every source partial
        producer = changes['nameCandidateInputs']
        self.assertEqual(producer['checkedRulesSha256'], nc.checked_rules_sha())
        self.assertEqual(producer['sources'][0]['checkedSelectionSha256s'], [nc.sha256_bytes(STORE['selections'][0])])

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
        _, cases, _ = imp.readback_passages([store['file']], pins_for(manifest, store), OWNERSHIP, store['selections'], store['artifacts'])
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

    def test_the_selections_and_artifacts_come_from_the_caller_and_match_roots_pins(self):
        rows, manifest = parent()
        mine = STORE['selections']
        # Test only: another selection, holding only the first reading.
        other = store_tests.release_inputs([make_bundle(store_tests.JOBS[0])])[0].encode()
        refused = [
            (dict(pins=pins_for(manifest, STORE, imp.PINS), checked_selections=[]), 'need a version-2 pin'),
            (dict(pins=pins_for(manifest, STORE, imp.PINS)), 'A checked selection is given that no pin lists'),
            (dict(checked_selections=[]), 'A pinned checked selection is not given'),
            (dict(checked_selections=[mine[0] + b' ']), 'A pinned checked selection is not given'),
            (dict(checked_selections=mine + mine), 'A checked selection is given twice'),
            (dict(checked_selections=mine + [other]), 'A checked selection is given that no pin lists'),
            # The pin lists a selection, but not the one these readings name.
            (dict(pins=pins_for(manifest, STORE, selections=[other]), checked_selections=[other]), 'names a selection its pin does not list'),
            # The pin lists one selection more than the file holds.
            (dict(pins=pins_for(manifest, STORE, selections=mine + [other]), checked_selections=mine + [other]),
             'lists a checked selection this read-back does not hold'),
        ]
        for given, message in refused:
            with self.subTest(message), self.assertRaisesRegex(ValueError, message):
                self.build(**given)
        first = sorted(STORE['artifacts'])[0]
        for artifacts in ({k: v for k, v in STORE['artifacts'].items() if k != first}, dict(STORE['artifacts'], **{first: STORE['artifacts'][first] + b' '})):
            with self.assertRaisesRegex(ValueError, 'approved artifact is missing or differs'):
                self.build(artifacts=artifacts)

    def test_a_store_with_two_selections(self):
        two = checked_store(split=True)
        self.assertEqual(len(set(two['selections'])), 2)
        changes = self.build(two)
        self.check(changes, two)
        answer = lambda c: sorted((r['subject_id'], r['data']['status'], r['data']['suggestion']) for r in c['records'])
        self.assertEqual(answer(changes), answer(self.build()))
        self.assertEqual(changes['nameCandidateInputs']['sources'][0]['checkedSelectionSha256s'], sorted(nc.sha256_bytes(x) for x in two['selections']))
        rows, manifest = parent()
        for given, message in [
            (dict(checked_selections=two['selections'][:1]), 'A pinned checked selection is not given'),
            (dict(pins=pins_for(manifest, two, selections=two['selections'][:1]), checked_selections=two['selections'][:1]),
             'names a selection its pin does not list'),
        ]:
            with self.subTest(message), self.assertRaisesRegex(ValueError, message):
                self.build(two, **given)
        # Test only: one reading's envelope re-pointed at the other pinned selection, its hashes made to fit. Its case
        # is looked up only in the selection it names, where its job is absent.
        f = json.loads(two['file'])
        names = {pid: next(r for r in p['rows'] if r['kind'] == 'checked_reading') for pid, p in f['checkedPassages'].items()}
        pid, row = sorted(names.items())[0]
        other = next(r['data']['selectionSha256'] for k, r in names.items() if k != pid)

        def misbound(f):
            row = next(r for r in f['checkedPassages'][pid]['rows'] if r['kind'] == 'checked_reading')
            row['data']['selectionSha256'] = other
            restore_hash(f, pid, row)
        with self.assertRaisesRegex(ValueError, 'absent from the selection it names'):
            self.build(refit(two, misbound))

    def test_edited_rows_are_refused_or_cite_their_edited_hash(self):
        # An edit that leaves a stored hash stale is refused. An edit that also refits the stored hash can pass only in a
        # file root pinned, and its records then cite the edited hash, which the store's own row does not have, so the
        # card shows none of them.
        f = json.loads(STORE['file'])
        pid, _ = person_row(f, 'Rabbi Abba bar Memel')

        def label(f):
            person_row(f, 'Rabbi Abba bar Memel')[1]['data']['label'] = 'Rabbi Abba'

        def plan(f):
            reading = next(r for r in f['checkedPassages'][pid]['rows'] if r['kind'] == 'checked_reading')
            reading['data']['planHash'] = '1' * 64
            restore_hash(f, pid, reading)

        def rename(f):
            # The passage under another name: its rows and envelope still name the real one.
            other = 'cs1-' + '1' * 64
            f['checkedPassages'][other] = f['checkedPassages'].pop(pid)
            for r in f['checkedPassages'][other]['rows']:
                r['passage_id'] = other

        def ownership(f, manifest=None, job=None):
            row = next(r for r in f['checkedPassages'][pid]['rows'] if r['kind'] == 'checked_ownership')
            for unit in row['data']['ownedUnits']:
                unit.update({k: v for k, v in (('ownershipManifestSha256', manifest), ('jobSha256', job)) if v})
            restore_hash(f, pid, row)

        def same_result(f):
            first, second = sorted(f['checkedPassages'])
            rows = [next(r for r in f['checkedPassages'][k]['rows'] if r['kind'] == 'checked_reading') for k in (first, second)]
            rows[1]['data']['supersedes'] = rows[0]['data']['supersedes']
            restore_hash(f, second, rows[1])

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
            (lambda f: rename(f), 'named for another reading'),
            (lambda f: ownership(f, manifest='0' * 64), 'Checked ownership is for another reading or manifest'),
            (lambda f: ownership(f, job='0' * 64), 'Checked ownership is for another reading or manifest'),
            (lambda f: same_result(f), 'Two checked readings of one raw result'),
            (lambda f: f['checkedPassages'][pid]['stored'].append(f['checkedPassages'][pid]['stored'][0]), 'Stored rows repeat'),
        ]
        for edit, message in edits:
            with self.subTest(message), self.assertRaisesRegex(ValueError, message):
                self.build(refit(STORE, edit))
        with self.assertRaisesRegex(ValueError, 'Checked passages differ from the read-back receipt'):
            f = json.loads(STORE['file'])
            label(f)
            self.build(dict(STORE, file=raw_tests.file_bytes(f)))
        real = {s['recordId']: s['payloadSha256'] for p in f['checkedPassages'].values() for s in p['stored']}

        def fewer_owned(f):
            # Owned units dropped except those holding R. Abba bar Memel's name, the manifest and job left as they were,
            # and the stored hash refit.
            keep = {m['segmentId'] for m in person_row(f, 'Rabbi Abba bar Memel')[1]['data']['mentions']}
            row = next(r for r in f['checkedPassages'][pid]['rows'] if r['kind'] == 'checked_ownership')
            row['data']['ownedUnits'] = [u for u in row['data']['ownedUnits'] if u['segmentId'] in keep]
            restore_hash(f, pid, row)

        def printed(f):
            # A referential mention turned into a printed name, with the stored hash refit.
            for p in f['checkedPassages'].values():
                for r in p['rows']:
                    if r['kind'] == 'checked_person' and r['data']['form'] == 'unnamed':
                        r['data'].update(form='named')
                        r['data']['mentions'][0]['role'] = 'printed_name'
                        restore_hash(f, r['passage_id'], r)
                        return
        for edit, cited in ((fewer_owned, 'ownership'), (printed, 'person')):
            with self.subTest(cited):
                changes = self.build(refit(STORE, edit))
                stale = [r for r in changes['records'] if r['data']['bindings'][cited]['payloadSha256'] != real[r['data']['bindings'][cited]['recordId']]]
                self.assertTrue(stale, 'the edit shows in the cited hash')

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
        # Test only: store raw readings of the same raw result and job, given beside the real checked readings through a
        # stand-in for the read-back step. All of them are left out and listed as superseded; nothing is built from them.
        rows, manifest = parent()
        held, cases, sources = imp.readback_passages([STORE['file']], pins_for(manifest, STORE), OWNERSHIP, STORE['selections'], STORE['artifacts'])
        job = envelope['binding']['jobHash']
        store_raw = lambda result=raw_result, job=job: dict(
            store='bavli', revision=f['revision'], stored={}, v1Sha256={},
            v1=[dict(kind='source_reading', data=dict(provenance=dict(resultSha256=result, jobSha256=job))), dict(kind='person', data=dict(id='p1'))])
        readings = lambda raw, graph=rows: self.with_store_raw(raw, cases, sources, graph, manifest)
        raw, kept, superseded = readings({'sr1-store-copy': store_raw(), 'sr1-store-copy-2': store_raw()})
        self.assertEqual((raw, sorted(kept)), ({}, sorted(cases)))
        self.assertEqual(superseded, [dict(passageId=k, reason='A checked reading of the same raw result supersedes this raw reading', checkedPassageId=pid)
                                      for k in ('sr1-store-copy', 'sr1-store-copy-2')])
        # Beside a graph copy of the same result, a store copy does not hide the graph copy: refused.
        with self.assertRaisesRegex(ValueError, 'The graph holds the raw reading'):
            readings({'sr1-store-copy': store_raw()}, parent([graph_copy])[0])
        with self.assertRaisesRegex(ValueError, 'is of another job'):
            readings({'sr1-store-copy': store_raw(job='0' * 64)})
        # The real human correction connection:b042-p0/review/answer, re-pointed by its subject column at the raw
        # person: replacing that reading would hide the correction, so it is refused.
        real = next(tuple(r) for r in raw_tests.PARENT_ROWS if r[0] == 'connection:b042-p0/review/answer')
        decided = [r for r in rows if r[0] != real[0]] + [(*real[:4], 'local:sr1-store-copy/p1', *real[5:])]
        with self.assertRaisesRegex(ValueError, 'decision covers a person of the raw reading'):
            readings({'sr1-store-copy': store_raw()}, sorted(decided))

    def with_store_raw(self, raw, cases, sources, rows, manifest):
        with mock.patch.object(imp, 'readback_passages', return_value=(raw, cases, sources)):
            out, kept, _, superseded = imp.readings(rows, [STORE['file']], pins_for(manifest, STORE), OWNERSHIP)
        return out, kept, superseded

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
        inputs = lambda store: dict(name_candidate_selections=store['selections'], name_candidate_artifacts=store['artifacts'])
        # The hook reads the reviewed ownership manifests; for this test store, its own manifest stands in.
        with mock.patch.dict(imp.REVIEWED_OWNERSHIP, OWNERSHIP):
            with self.assertRaisesRegex(ValueError, 'A pinned checked selection is not given'):
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
