"""The name_candidates importer, on real rows.

The test parent is made only of real rows: 115 registry and decision records copied from live revision 8b0f4c, and
the approved v8 readings 001 and 101 as the reading importer builds them, held by the graph. Its manifest is made for
the test from those rows. Where a test needs a situation the rows do not contain, it says so and changes as little as
it can. The store read-back file was made by the store owner's readback() at commit 1fdf69b, not yet reviewed, from
the same two readings in a test Bavli store; its fixture says how.
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
READBACK = json.loads((FIXTURES / 'name-candidates-store-readback.json').read_text())['readback']
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


class NameCandidateImportTests(unittest.TestCase):
    def build(self, rows, manifest):
        return imp.build(rows, manifest, [], ALIASES, DUPLICATES)

    def check(self, changes, rows, manifest):
        return imp.validate_changes(changes, rows, manifest, [], ALIASES, DUPLICATES)

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
        store = imp.build(rows, manifest, [READBACK], ALIASES, DUPLICATES)
        self.assertEqual(imp.validate_changes(store, rows, manifest, [READBACK], ALIASES, DUPLICATES)['records'], 8)
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
        self.assertEqual(store['nameCandidateInputs']['sources'], [dict(store='bavli', revision=READBACK['revision'], parentRevision=READBACK['parentRevision'],
                                                                        recordSetSha256=READBACK['recordSetSha256'], readBackSha256=READBACK['readBackSha256'])])

    def test_a_readback_file_must_be_whole_and_checked(self):
        rows, manifest = graph_only()
        pid = sorted(READBACK['passages'])[0]
        edits = [
            (lambda f: f.update(complete=False), 'did not check every passage'),
            (lambda f: f['readBack'].update(matchesImporter=False), 'did not check every passage'),
            (lambda f: f['readBack'].update(passagesChecked=1), 'differs from its hash'),
            (lambda f: f.update(revision='source-readings-bavli-' + '0' * 20), 'names another revision'),
            (lambda f: f['passages'][pid]['stored'].pop(), 'Stored and rebuilt rows differ'),
            (lambda f: f['passages'][pid]['v1'][0].update(v1PayloadSha256='0' * 64), 'differs from its v1 hash'),
            (lambda f: f['passages'][pid]['stored'][0].update(payloadFormat=imp.V1_FORMAT), 'not compact store rows'),
            (lambda f: f.update(version='checked-source-reading-v1'), 'Not a source-reading store read-back file'),
        ]
        for edit, message in edits:
            changed = copy.deepcopy(READBACK)
            edit(changed)
            with self.assertRaisesRegex(ValueError, message):
                imp.build(rows, manifest, [changed], ALIASES, DUPLICATES)
        with self.assertRaisesRegex(ValueError, 'in two read-back files'):
            imp.build(rows, manifest, [READBACK, READBACK], ALIASES, DUPLICATES)
        # The graph copy wins, so a reading the graph holds cannot be cited from a store.
        grows, gmanifest = parent()
        with self.assertRaisesRegex(ValueError, 'graph copy wins'):
            imp.build(grows, gmanifest, [READBACK], ALIASES, DUPLICATES)

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


if __name__ == '__main__':
    unittest.main()
