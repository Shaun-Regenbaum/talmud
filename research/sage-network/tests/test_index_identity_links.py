"""Actual Yitzhak capture; corruptions below are test-only changes to those captured records."""
import copy
import hashlib
import json
import sys
import unittest
import sqlite3
import tempfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'storage'), str(ROOT)]
import index_identity_links as links

FIXTURE = Path(__file__).parent / 'fixtures/index-identity-link-yitzhak.json'


class IndexIdentityTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads(FIXTURE.read_text())
        self.a = self.fixture['artifact']
        self.rows = {r[0]: tuple(r) for r in self.fixture['graphRows']}
        self.raw = json.dumps(self.a, ensure_ascii=False).encode()
        self.pin = links.sha(self.raw)

    def run_build(self, a=None, rows=None):
        raw = json.dumps(a, ensure_ascii=False).encode() if a else self.raw
        return links.build(raw, links.sha(raw), rows or self.rows, 'captured-parent-test-only')

    def test_actual_two_occurrences_preserve_alternatives_and_no_acceptance(self):
        before = copy.deepcopy(self.rows)
        result = self.run_build()
        d = result['records'][0]['data']
        self.assertEqual(len(d['sourceEvidence']), 2)
        self.assertFalse(d['accepted'])
        self.assertEqual(d['candidate'], 'rabbi-yitzhak-nappaha')
        self.assertEqual(len(d['checkedDependencies']), 4)
        self.assertEqual(self.rows, before)
        links.validate_changes(result, self.raw, self.pin, self.rows)

    def test_external_pin_cannot_be_self_replaced(self):
        with self.assertRaisesRegex(ValueError, 'external pin'):
            links.build(self.raw + b' ', self.pin, self.rows, 'test')

    def test_whole_segment_mismatch_not_same_ordinal(self):
        self.a['oldText']['he'][1] += ' אחר'
        with self.assertRaisesRegex(ValueError, 'Whole segment'):
            self.run_build(self.a)

    def test_index_position_not_name_alone(self):
        self.a['index']['amudim']['28a'][0][1] = 13
        with self.assertRaisesRegex(ValueError, 'Index occurrence'):
            self.run_build(self.a)

    def test_disagreeing_second_occurrence_refused(self):
        self.a['oldResult']['answers']['m2_who']['choice'] = 'rabbi-yitzhak'
        with self.assertRaisesRegex(ValueError, 'disagree'):
            self.run_build(self.a)

    def test_prior_mention_bytes_must_bind_result(self):
        self.a['oldResult']['mentionsHash'] = '0' * 16
        with self.assertRaisesRegex(ValueError, 'Prior answer'):
            self.run_build(self.a)

    def test_checked_payload_cannot_be_rehashed_away(self):
        p = self.a['checkedPassage']
        row = next(r for r in p['rows'] if r['kind'] == 'checked_person' and r['record_id'].endswith('/p1'))
        row['data']['mentions'][0]['start'] = 0
        h = links.inputs.d1_hash(row['data'])
        next(r for r in p['stored'] if r['recordId'] == row['record_id'])['payloadSha256'] = h
        with self.assertRaisesRegex(ValueError, 'Candidate source binding'):
            self.run_build(self.a)

    def test_registry_change_suppresses(self):
        key = 'registry_person:rabbi-yitzhak-nappaha'
        r = list(self.rows[key]); d = json.loads(r[-1]);d['generation'] = 'unknown'
        r[-1] = links.inputs.d1_encode(d);r[-2] = links.sha(r[-1].encode());self.rows[key] = tuple(r)
        with self.assertRaisesRegex(ValueError, 'Registry candidate'):
            self.run_build()

    def test_human_precedence_on_actual_candidate_row(self):
        key = 'name_candidates:v1/' + self.a['personKey']
        r = list(self.rows[key]);r[6] = 'user_correction';self.rows[key] = tuple(r)
        with self.assertRaisesRegex(ValueError, 'takes priority'):
            self.run_build()

    def test_mixed_or_mutated_output_refused(self):
        c = self.run_build();c['records'][0]['data']['accepted'] = True
        with self.assertRaisesRegex(ValueError, 'reconstruction'):
            links.validate_changes(c,self.raw,self.pin,self.rows)


    def test_release_hook_requires_external_pin_and_preserves_parent(self):
        from extend_d1 import prepare
        from prepare_d1 import encode
        migrations = ROOT.parents[1] / 'packages/talmud/migrations-sage-graph'
        rows = sorted(self.rows.values())
        revision = 'captured-parent-test-only'
        # The tiny parent uses actual saved rows; its container is test-only.
        manifest = dict(revision=revision, recordCount=len(rows),
                        recordSetSha256=links.sha(encode([r[:-1] for r in rows]).encode()),
                        countsByKind=dict(Counter(r[1] for r in rows)))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            db = sqlite3.connect(':memory:')
            for migration in sorted(migrations.glob('*.sql')):
                db.executescript(migration.read_text())
            db.execute('INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,?,?)',
                       (revision, encode({k:v for k,v in manifest.items() if k != 'revision'}), 'loading'))
            db.executemany('INSERT INTO sage_graph_records VALUES (' + ','.join('?'*11) + ')', [(revision,*r) for r in rows])
            db.execute("UPDATE sage_graph_revisions SET state='verified'")
            export=root/'parent.sql';export.write_text('\n'.join(db.iterdump()));db.close()
            mf=root/'manifest.json';mf.write_text(json.dumps(manifest))
            cf=root/'changes.json';cf.write_text(json.dumps(self.run_build(),ensure_ascii=False))
            with self.assertRaisesRegex(ValueError,'independent evidence pins'):
                prepare(export,mf,cf,root/'refused',shared=True)
            result=prepare(export,mf,cf,root/'prepared',shared=True,index_identity_input=(self.raw,self.pin))
            self.assertEqual(result['changedRecords'],1)
            self.assertEqual(result['recordCount'],len(rows)+1)

    def test_normalization_keeps_raw_spans(self):
        p = links.tokens('דא"ר יצחק', True)
        self.assertEqual([x['token'] for x in p], ['דאמר','רבי','יצחק'])
        self.assertEqual(p[0]['quote'], 'דא"ר')
        self.assertEqual(p[0]['start'], p[1]['start'])


if __name__ == '__main__':
    unittest.main()
