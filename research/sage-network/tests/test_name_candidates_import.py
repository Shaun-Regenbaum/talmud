"""The name_candidates importer, on real rows.

The test parent is made only of real rows: 115 registry and decision records copied from live revision 8b0f4c, and
the approved v8 readings 001 and 101 as the reading importer builds them, held by the graph. Its manifest is made for
the test from those rows. Where a test needs a situation the rows do not contain, it says so and changes as little as
it can. The store read-back file was made by the store owner's readback() at commit 427c06d, not yet reviewed, from
the same two readings in a test Bavli store; its fixture says how. In a release, root writes the pins from the reviewed
files; here pins_for plays that part.
"""
import copy
import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'storage'), str(ROOT / 'identity'), str(ROOT)]
import name_candidates as nc  # noqa: E402
import name_candidates_import as imp  # noqa: E402
import source_readings  # noqa: E402

FIXTURES = Path(__file__).parent / 'fixtures'
PARENT_ROWS = json.loads((FIXTURES / 'name-candidates-import-parent.json').read_text())['rows']
READINGS = json.loads((FIXTURES / 'source-reading-real-v8.json').read_text())
STORE_FIXTURE = json.loads((FIXTURES / 'name-candidates-store-readback.json').read_text())
READBACK = STORE_FIXTURE['readback']
# The store owner's test setup made its own ownership manifest for these two readings; only these tests accept it.
TEST_OWNERSHIP = dict(imp.REVIEWED_OWNERSHIP, bavli='ec3e9c3b191ce5674925fdf263261df647b1eef7e14949554e4776dcaaff12cb')
ALIASES = (imp.DATA / 'rabbi-he-aliases.json').read_bytes()
DUPLICATES = (imp.DATA / 'rabbi-duplicates.json').read_bytes()
R001 = 'sr1-ad0865bdfd579608bb25441c125ae17d9a260b9555f181ce925cada5c4ae5ffc'


def as_row(item):
    payload = imp.d1_encode(item['data'])
    return (item['record_id'], item['kind'], item['passage_id'], item['ref'], item['subject_id'], item['object_id'],
            item['authority'], item['decision'], nc.sha(payload), payload)


def reading_rows():
    rows = []
    for bundle in READINGS['bundles']:
        try:
            rows += [as_row(item) for item in source_readings.records(bundle)]
        except ValueError:
            continue  # 051 is held
    return rows


def parent(extra=()):
    rows = sorted([tuple(r) for r in PARENT_ROWS] + reading_rows() + list(extra))
    manifest = dict(revision='test-parent-of-real-rows', recordCount=len(rows),
                    recordSetSha256=nc.sha(imp.d1_encode([list(r[:-1]) for r in rows])))
    return rows, manifest


def graph_only():
    """The parent without the readings: for readings a store holds."""
    rows = sorted(tuple(r) for r in PARENT_ROWS)
    return rows, dict(revision='test-parent-of-real-rows', recordCount=len(rows), recordSetSha256=nc.sha(imp.d1_encode([list(r[:-1]) for r in rows])))


def file_bytes(readback):
    """A read-back file's exact bytes."""
    return json.dumps(readback, ensure_ascii=False, sort_keys=True, indent=1).encode()


def pins_for(manifest, files=()):
    """The pins root writes for a release: the exact parent, and for each reviewed read-back file its exact bytes, store
    and database, revision, record set, parent, export, ownership manifest, producer code, and that the revision was
    found verified. Here the test plays root."""
    def pin(raw):
        f = json.loads(raw)
        owned = {s['ownershipManifestSha256'] for p in f['passages'].values() for x in p['v1']
                 if x['row']['kind'] == 'source_reading_coverage' for s in x['row']['data']['sources']}
        return dict(sha256=nc.sha256_bytes(raw), store=f['store'], database=f['readBack']['database'], revision=f['revision'],
                    recordSetSha256=f['recordSetSha256'], parentRevision=f['parentRevision'], exportSha256=f['readBack']['exportSha256'],
                    ownershipManifestSha256=next(iter(owned)), revisionState='verified',
                    producer=dict(commit=STORE_FIXTURE['commit'], codeSha256=STORE_FIXTURE['producerCodeSha256']))
    return dict(version=imp.PINS, graph=dict(revision=manifest['revision'], recordSetSha256=manifest['recordSetSha256']),
                readbacks=[pin(raw) for raw in files])


STORE_FILE = file_bytes(READBACK)


class NameCandidateImportTests(unittest.TestCase):
    def build(self, rows, manifest, files=(), pins=None, ownership=TEST_OWNERSHIP):
        return imp.build(rows, manifest, list(files), pins or pins_for(manifest, files), ALIASES, DUPLICATES, ownership)

    def check(self, changes, rows, manifest, files=(), pins=None):
        return imp.validate_changes(changes, rows, manifest, list(files), pins or pins_for(manifest, files), ALIASES, DUPLICATES, TEST_OWNERSHIP)

    def test_prepare_and_check_graph_readings(self):
        rows, manifest = parent()
        changes = self.build(rows, manifest)
        self.assertEqual(self.check(changes, rows, manifest)['records'], 8)
        by_key = {r['subject_id']: r for r in changes['records']}
        rami = by_key[R001 + '/p1']['data']
        self.assertEqual((rami['status'], rami['suggestion']), ('tentative', 'rav-rami-bar-hama'))
        stored = {r[0]: r for r in rows}
        for name in ('person', 'passage', 'sourceReading'):
            b = rami['bindings'][name]
            self.assertEqual((b['store'], b['revision'], b['payloadFormat']), ('graph', manifest['revision'], imp.V1_FORMAT))
            self.assertEqual(b['payloadSha256'], stored[b['recordId']][-2])
            self.assertEqual(b['v1PayloadSha256'], b['payloadSha256'], 'in the graph the stored row is the v1 row')
        producer = changes['nameCandidateInputs']
        self.assertEqual((producer['importer'], producer['graphRecordSetSha256'], producer['sources']), (imp.VERSION, manifest['recordSetSha256'], []))
        self.assertEqual({h['personKey'] for h in changes['held']}, {R001 + '/p6', R001 + '/p7'})

    def test_any_edit_is_refused(self):
        rows, manifest = parent()
        changes = self.build(rows, manifest)
        edits = [
            lambda c: c['records'][0]['data'].update(accepted=True),
            lambda c: c['records'].pop(),
            lambda c: next(r for r in c['records'] if r['subject_id'] == R001 + '/p2')['data'].update(status='tentative', suggestion='rava'),
            lambda c: c['records'][0]['data']['bindings']['person'].update(payloadSha256='0' * 64),
            lambda c: c['nameCandidateInputs'].update(rulesSha256='0' * 64),
            lambda c: c['held'].pop(),
        ]
        for edit in edits:
            changed = copy.deepcopy(changes)
            edit(changed)
            with self.assertRaisesRegex(ValueError, 'differ from a rebuild'):
                self.check(changed, rows, manifest)

    def test_a_human_decision_holds_the_person(self):
        # For this test, the real human correction connection:b042-p0/review/answer is re-pointed at Rami by its
        # subject column only. Its payload and hash are unchanged.
        real = next(tuple(r) for r in PARENT_ROWS if r[0] == 'connection:b042-p0/review/answer')
        moved = (real[0], real[1], real[2], real[3], 'local:' + R001 + '/p1', *real[5:])
        rows, manifest = parent()
        without = self.build(rows, manifest)
        rows2, manifest2 = parent()
        rows2 = sorted([r for r in rows2 if r[0] != real[0]] + [moved])
        manifest2 = dict(manifest2, recordSetSha256=nc.sha(imp.d1_encode([list(r[:-1]) for r in rows2])))
        held = self.build(rows2, manifest2)
        self.assertNotIn(R001 + '/p1', {r['subject_id'] for r in held['records']})
        hold = next(h for h in held['held'] if h['personKey'] == R001 + '/p1')
        self.assertEqual([b['recordId'] for b in hold['decidedBy']], [real[0]])
        # A changes file made before the correction is refused once the correction is in the parent.
        with self.assertRaises(ValueError):
            self.check(dict(without, nameCandidateInputs=held['nameCandidateInputs']), rows2, manifest2)

    def test_an_older_reading_must_cover_every_mention(self):
        # Built for this test: an older passage holding 001's own s2 text, a person quoting Rami's printed name, and a
        # source binding to that segment. Rami is covered at every mention; his father, inside the name, is not.
        source = next(s for s in json.loads(next(r for r in reading_rows() if r[0] == 'passage:' + R001)[-1])['sourceSegments'] if s['source_id'] == 's2')
        text = source['text']
        older = [dict(record_id='passage:old-p0', kind='passage', passage_id='old-p0', ref=source['ref'], subject_id=None, object_id=None,
                      authority='source', decision=None, data=dict(source=dict(passage=text))),
                 dict(record_id='person:old-p0/A', kind='person', passage_id='old-p0', ref=source['ref'], subject_id=None, object_id=None,
                      authority='source', decision=None, data=dict(id='A', named='name', quote='רמי בר חמא', quoteLocation='passage')),
                 dict(record_id='source_binding:old-p0', kind='source_binding', passage_id='old-p0', ref=source['ref'], subject_id=None,
                      object_id=None, authority='screening', decision='needs_review',
                      data=dict(passageId='old-p0', edition=source['edition'], segmentId=source['provenance']['segment_id'], sourceSha256=nc.sha(text)))]
        rows, manifest = parent([as_row(x) for x in older])
        changes = self.build(rows, manifest)
        self.check(changes, rows, manifest)
        keys = {r['subject_id'] for r in changes['records']}
        self.assertNotIn(R001 + '/p1', keys)
        self.assertIn(R001 + '/p5', keys)
        father = next(r for r in changes['records'] if r['subject_id'] == R001 + '/p5')['data']
        self.assertEqual(father['olderReading']['possible'][0]['olderPeople'], ['old-p0/A'])

    def test_the_importer_only_adds(self):
        rows, manifest = parent()
        record = self.build(rows, manifest)['records'][0]
        rows2, manifest2 = parent([as_row(record)])
        with self.assertRaisesRegex(ValueError, 'already holds name_candidates'):
            self.build(rows2, manifest2)

    def test_alias_guard_is_checked_again(self):
        # Real texts: Gittin 69a:9, where רב אמי is Rabbi Ami, and Kiddushin 60a:4, where רב אמי is a father.
        gittin = ('אמר ליה רב אמי לרב אשי והאנן איפכא תנן ניטל הכבד ולא נשתייר הימנה כלום הריאה שניקבה או שחסרה אמר ליה כיון '
                  'דמפומיה קאתי אימר איתמוחי איתמח')
        kiddushin = ('עולא אמר רבי יוחנן אפי' + "'" + ' מאה תופסין בה וכן אמר ר' + "'" + ' אסי אמר רבי יוחנן אפילו מאה תופסין בה אמר ליה רב '
                     'משרשיא בריה דרב אמי לר' + "'" + ' אסי אסברה לך טעמא דרבי יוחנן שוו נפשיה כי שרגא דליבני דכל חד וחד רוחא לחבריה שבק')
        registry = nc.registry_index([(r[0], r[-2], r[-1]) for r in PARENT_ROWS if r[1] == 'registry_person'], json.loads(ALIASES))
        source = dict(text=gittin, sha256=nc.sha(gittin), edition='Wikisource Talmud Bavli', ref='Gittin 69a:9',
                      provenance=dict(segment_id='bavli|Gittin|69a|9|Wikisource Talmud Bavli'))
        anchor = dict(quote='רב אמי', start=8, end=14, occurrence=1, source_id='s1', primary=True, segmentId=source['provenance']['segment_id'],
                      edition=source['edition'], ref=source['ref'], source_sha256=source['sha256'], occurrenceKey=nc.occurrence_key(source, 8, 14))
        mention = nc.match_mention(anchor, source, registry)
        self.assertEqual([h['slug'] for h in mention['exact']], ['rabbi-ami'])
        self.assertTrue(imp.alias_guards_hold(mention, gittin))
        # The same hit placed where the Kiddushin text has בריה ד before it must fail the second check.
        at = kiddushin.index('רב אמי')
        self.assertFalse(imp.alias_guards_hold(dict(mention, start=at), kiddushin))

    def test_store_readings_cite_the_stored_rows(self):
        rows, manifest = graph_only()
        store = self.build(rows, manifest, [STORE_FILE])
        self.assertEqual(self.check(store, rows, manifest, [STORE_FILE])['records'], 8)
        # The same readings in the graph give the same suggestions; only the citations differ.
        grows, gmanifest = parent()
        graph = self.build(grows, gmanifest)
        strip = lambda c: [{k: v for k, v in r['data'].items() if k not in ('bindings', 'producer', 'parentRevision')} for r in c['records']]
        self.assertEqual(strip(store), strip(graph))
        stored = {s['recordId']: s for p in READBACK['passages'].values() for s in p['stored']}
        v1 = {x['row']['record_id']: x['v1PayloadSha256'] for p in READBACK['passages'].values() for x in p['v1']}
        for record in store['records']:
            for name in ('person', 'passage', 'sourceReading'):
                b = record['data']['bindings'][name]
                self.assertEqual((b['store'], b['revision'], b['payloadFormat']), ('bavli', READBACK['revision'], imp.STORE_FORMAT))
                self.assertEqual((b['payloadSha256'], b['v1PayloadSha256']), (stored[b['recordId']]['payloadSha256'], v1[b['recordId']]))
        pin = pins_for(manifest, [STORE_FILE])['readbacks'][0]
        self.assertEqual(store['nameCandidateInputs']['sources'], [dict(
            store='bavli', revision=READBACK['revision'], parentRevision=READBACK['parentRevision'], recordSetSha256=READBACK['recordSetSha256'],
            readBackSha256=READBACK['readBackSha256'], fileSha256=nc.sha256_bytes(STORE_FILE), database='talmud-source-readings-bavli',
            exportSha256=READBACK['readBack']['exportSha256'], ownershipManifestSha256=pin['ownershipManifestSha256'], producer=pin['producer'])])

    def test_a_readback_file_must_be_whole_and_checked(self):
        rows, manifest = graph_only()
        pid = sorted(READBACK['passages'])[0]
        edits = [
            (lambda f: f.update(complete=False), 'did not check every passage'),
            (lambda f: f['readBack'].update(matchesImporter=False), 'did not check every passage'),
            (lambda f: f['readBack'].update(passagesChecked=1), 'differs from its hash'),
            (lambda f: f.update(revision='source-readings-bavli-' + '0' * 20), 'names another revision'),
            (lambda f: f.update(version='checked-source-reading-v1'), 'Not a source-reading store read-back file'),
        ]
        for edit, message in edits:
            # Even a file root pinned as it is must pass these checks.
            changed = copy.deepcopy(READBACK)
            edit(changed)
            with self.assertRaisesRegex(ValueError, message):
                self.build(rows, manifest, [file_bytes(changed)])
        rows_edits = [
            (lambda f: f['passages'][pid]['stored'].pop(), 'Stored and rebuilt rows differ'),
            (lambda f: f['passages'][pid]['v1'][0].update(v1PayloadSha256='0' * 64), 'differs from its v1 hash'),
            (lambda f: f['passages'][pid]['stored'][0].update(payloadFormat=imp.V1_FORMAT), 'not compact store rows'),
        ]
        for edit, message in rows_edits:
            changed = copy.deepcopy(READBACK)
            edit(changed)
            # The receipt's passages hash refuses the edit first.
            with self.assertRaisesRegex(ValueError, 'Passages differ from the read-back receipt'):
                self.build(rows, manifest, [file_bytes(changed)])
            # Behind it, the row checks still refuse a receipt whose hashes were made to fit the edit.
            changed['readBack']['passagesSha256'] = imp.d1_hash(changed['passages'])
            changed['readBackSha256'] = imp.d1_hash(changed['readBack'])
            with self.assertRaisesRegex(ValueError, message):
                self.build(rows, manifest, [file_bytes(changed)])
        # Checked readings are never read as original rows. A file holding any is refused whole; so is an unknown field.
        for edit, message in ((lambda f: f.update(checkedPassages={'cs1-' + '0' * 64: {}}), 'does not read checked readings'),
                              (lambda f: f['readBack'].update(checkedPassages=1), 'does not read checked readings'),
                              (lambda f: f.update(somethingNew=[]), 'fields this version does not know')):
            changed = copy.deepcopy(READBACK)
            edit(changed)
            with self.assertRaisesRegex(ValueError, message):
                self.build(rows, manifest, [file_bytes(changed)])
        # The same file twice. (One reading in two different files needs two real read-backs, which no fixture has.)
        with self.assertRaisesRegex(ValueError, 'given twice'):
            self.build(rows, manifest, [STORE_FILE, STORE_FILE], pins_for(manifest, [STORE_FILE]))
        with self.assertRaisesRegex(ValueError, 'pinned twice'):
            self.build(rows, manifest, [STORE_FILE], pins_for(manifest, [STORE_FILE, STORE_FILE]))
        # The graph copy wins, so a reading the graph holds cannot be cited from a store.
        grows, gmanifest = parent()
        with self.assertRaisesRegex(ValueError, 'graph copy wins'):
            self.build(grows, gmanifest, [STORE_FILE])

    def test_only_the_pinned_bytes_count(self):
        # The read-back receipt does not cover the passages. These edits keep it, and its hash, unchanged.
        rows, manifest = graph_only()
        pins = pins_for(manifest, [STORE_FILE])
        pid = sorted(READBACK['passages'])[0]
        zeroed = copy.deepcopy(READBACK)
        zeroed['passages'][pid]['stored'][0]['payloadSha256'] = '0' * 64
        reworded = copy.deepcopy(READBACK)
        entry = next(x for x in reworded['passages'][pid]['v1'] if x['row']['kind'] == 'person')
        entry['row']['data']['reading']['reason'] = 'Changed for this test.'
        entry['v1PayloadSha256'] = imp.d1_hash(entry['row']['data'])
        for changed in (zeroed, reworded):
            self.assertEqual((changed['readBack'], changed['readBackSha256']), (READBACK['readBack'], READBACK['readBackSha256']))
            with self.assertRaisesRegex(ValueError, 'differ from the release pins'):
                self.build(rows, manifest, [file_bytes(changed)], pins)
        # Even if root pinned the changed bytes, the receipt's own passages hash refuses them.
        for changed in (zeroed, reworded):
            with self.assertRaisesRegex(ValueError, 'Passages differ from the read-back receipt'):
                self.build(rows, manifest, [file_bytes(changed)])
        # A receipt of a revision that is not verified is refused, even with its own hash made to fit.
        unverified = copy.deepcopy(READBACK)
        unverified['readBack']['revisionState'] = 'loading'
        unverified['readBackSha256'] = imp.d1_hash(unverified['readBack'])
        with self.assertRaisesRegex(ValueError, 'not verified'):
            self.build(rows, manifest, [file_bytes(unverified)])
        good = self.build(rows, manifest, [STORE_FILE], pins)
        with self.assertRaisesRegex(ValueError, 'differ from the release pins'):
            self.check(good, rows, manifest, [file_bytes(zeroed)], pins)
        # Every pinned file must be given, and only pinned files.
        with self.assertRaisesRegex(ValueError, 'differ from the release pins'):
            self.build(rows, manifest, [], pins)
        with self.assertRaisesRegex(ValueError, 'differ from the release pins'):
            self.build(rows, manifest, [STORE_FILE], pins_for(manifest))
        # A pin naming another revision, or another graph parent, is refused.
        wrong = copy.deepcopy(pins)
        wrong['readbacks'][0]['revision'] = 'source-readings-bavli-' + '0' * 20
        with self.assertRaisesRegex(ValueError, 'another revision than its pin'):
            self.build(rows, manifest, [STORE_FILE], wrong)
        wrong = copy.deepcopy(pins)
        wrong['graph']['recordSetSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'graph parent differs from the release pins'):
            self.build(rows, manifest, [STORE_FILE], wrong)
        # The physical database, the export, the ownership, the verified state and the producer must all be pinned.
        for field, value, message in (('database', 'talmud-source-readings-other', 'names another database'),
                                      ('exportSha256', '0' * 64, 'another database or export'),
                                      ('ownershipManifestSha256', imp.REVIEWED_OWNERSHIP['bavli'], 'owned under another manifest'),
                                      ('revisionState', 'loading', 'store revision verified'),
                                      ('producer', dict(commit='1fdf69b'), 'producer commit and code hash')):
            wrong = copy.deepcopy(pins)
            wrong['readbacks'][0][field] = value
            with self.assertRaisesRegex(ValueError, message):
                self.build(rows, manifest, [STORE_FILE], wrong, ownership=dict(TEST_OWNERSHIP, bavli=wrong['readbacks'][0]['ownershipManifestSha256']))
        wrong = copy.deepcopy(pins)
        del wrong['readbacks'][0]['exportSha256']
        with self.assertRaisesRegex(ValueError, 'Each read-back pin needs exactly'):
            self.build(rows, manifest, [STORE_FILE], wrong)
        # Outside tests, only the reviewed ownership manifest counts, so this test-made store is refused.
        with self.assertRaisesRegex(ValueError, 'not the reviewed one'):
            imp.build(rows, manifest, [STORE_FILE], pins, ALIASES, DUPLICATES)

    def test_json_is_read_strictly(self):
        rows, manifest = graph_only()
        repeated = STORE_FILE.replace(b'{\n "complete": true,', b'{\n "complete": false,\n "complete": true,', 1)
        self.assertNotEqual(repeated, STORE_FILE)
        with self.assertRaisesRegex(ValueError, 'Repeated JSON key'):
            self.build(rows, manifest, [repeated])
        odd = copy.deepcopy(READBACK)
        odd['readBack']['note'] = float('nan')
        with self.assertRaisesRegex(ValueError, 'Non-finite JSON number'):
            self.build(rows, manifest, [json.dumps(odd, sort_keys=True).encode()])
        pins = imp.d1_encode(pins_for(manifest, [STORE_FILE])).encode()
        self.assertEqual(imp.load_pins(pins)['graph']['revision'], manifest['revision'])
        with self.assertRaisesRegex(ValueError, 'Not a name_candidates release pin file'):
            self.build(rows, manifest, [STORE_FILE], dict(pins_for(manifest, [STORE_FILE]), version='other'))
        for broken, message in ((pins.replace(b'{"graph"', b'{"graph":{},"graph"', 1), 'Repeated JSON key'),
                                (pins.replace(b'"version"', b'"extra":1,"version"', 1), 'Not a name_candidates release pin file')):
            with self.assertRaisesRegex(ValueError, message):
                imp.load_pins(broken)

    def test_a_number_too_large_for_a_float_is_refused(self):
        # 1e999 parses to infinity through parse_float, never reaching parse_constant.
        for huge in (b'1e999', b'-1e999'):
            with self.assertRaisesRegex(ValueError, 'Non-finite JSON number'):
                imp.strict_json(b'{"x": ' + huge + b'}')

    def test_a_readback_file_with_a_huge_number_is_refused(self):
        rows, manifest = graph_only()
        for huge in (b'1e999', b'-1e999'):
            big = STORE_FILE.replace(b'{\n "complete": true,', b'{\n "complete": true,\n "size": ' + huge + b',', 1)
            self.assertNotEqual(big, STORE_FILE)
            with self.assertRaisesRegex(ValueError, 'Non-finite JSON number'):
                self.build(rows, manifest, [big])

    def test_read_graph_checks_the_record_set(self):
        rows, manifest = parent()
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'graph.sqlite'
            with closing(sqlite3.connect(path)) as db, db:
                db.execute('CREATE TABLE sage_graph_revisions (id TEXT, manifest_json TEXT, state TEXT)')
                db.execute('CREATE TABLE sage_graph_records (revision_id TEXT, record_id TEXT, kind TEXT, passage_id TEXT, ref TEXT, subject_id TEXT, '
                           'object_id TEXT, authority TEXT, decision TEXT, payload_sha256 TEXT, payload_json TEXT)')
                db.execute('INSERT INTO sage_graph_revisions VALUES (?,?,?)',
                           (manifest['revision'], json.dumps({k: v for k, v in manifest.items() if k != 'revision'}), 'verified'))
                db.executemany('INSERT INTO sage_graph_records VALUES (?,?,?,?,?,?,?,?,?,?,?)', [(manifest['revision'], *r) for r in rows])
            got, saved = imp.read_graph(path, manifest['revision'])
            self.assertEqual((got, saved), (rows, manifest))
            with closing(sqlite3.connect(path)) as db, db:
                db.execute("UPDATE sage_graph_records SET ref='Ketubot 99a:1' WHERE record_id=?", (rows[0][0],))
            with self.assertRaisesRegex(ValueError, 'record set differs'):
                imp.read_graph(path, manifest['revision'])
            # A payload changed without its hash is caught row by row, before any record set check.
            with closing(sqlite3.connect(path)) as db, db:
                db.execute("UPDATE sage_graph_records SET ref=? WHERE record_id=?", (rows[0][3], rows[0][0]))
                db.execute("UPDATE sage_graph_records SET payload_json=replace(payload_json, 'shmuel', 'shmuel ') WHERE record_id=?", (rows[0][0],))
            with self.assertRaisesRegex(ValueError, 'payload differs from its hash'):
                imp.read_graph(path, manifest['revision'])


if __name__ == '__main__':
    unittest.main()
