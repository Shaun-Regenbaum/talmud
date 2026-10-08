"""Use saved passages to guard against false identities and false meetings."""
import copy
import json
import sys
import sqlite3
import tempfile
from contextlib import closing
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'identity'))
from network_scan import PILOT, channel, head, scan, quote_matches, read_database, encode, sha

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/namesake-network.json').read_text())


class NetworkScanTest(unittest.TestCase):
    def setUp(self):
        self.rows = copy.deepcopy(FIXTURE['records'])

    def result(self):
        return scan(self.rows, FIXTURE['registry'], PILOT)

    def mentions(self):
        return {m['personKey']:m for f in self.result()['families'] for m in f['mentions']}

    def test_database_rejects_corruption_at_each_boundary(self):
        rows=sorted(self.rows)
        revision='fixture-saved-records'
        manifest=dict(recordCount=len(rows),recordSetSha256=sha(encode([r[:-1] for r in rows])))
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'input.sqlite'
            with closing(sqlite3.connect(path)) as db, db:
                db.execute('CREATE TABLE sage_graph_revisions (id TEXT, manifest_json TEXT, state TEXT)')
                db.execute('CREATE TABLE sage_graph_records (revision_id TEXT, record_id TEXT, kind TEXT, passage_id TEXT, ref TEXT, subject_id TEXT, object_id TEXT, authority TEXT, decision TEXT, payload_sha256 TEXT, payload_json TEXT)')
                db.execute('INSERT INTO sage_graph_revisions VALUES (?,?,?)',(revision,encode(manifest),'verified'))
                db.executemany('INSERT INTO sage_graph_records VALUES (?,?,?,?,?,?,?,?,?,?,?)',[(revision,*r) for r in rows])
            expected=dict(manifest,revision=revision)
            self.assertEqual(len(read_database(path,expected)),len(rows))
            with closing(sqlite3.connect(path)) as db, db:
                db.execute("UPDATE sage_graph_revisions SET state='pending'")
            with self.assertRaisesRegex(ValueError,'not the verified manifest'):
                read_database(path,expected)
            with closing(sqlite3.connect(path)) as db, db:
                db.execute("UPDATE sage_graph_revisions SET state='verified'")
                db.execute("UPDATE sage_graph_records SET payload_json='corrupt' WHERE record_id=?",(rows[0][0],))
            with self.assertRaisesRegex(ValueError,'payload hash differs'):
                read_database(path,expected)
            with closing(sqlite3.connect(path)) as db, db:
                db.execute('DELETE FROM sage_graph_records WHERE record_id=?',(rows[0][0],))
            with self.assertRaisesRegex(ValueError,'record set differs'):
                read_database(path,expected)

    def test_patronymic_is_not_focal_first_name(self):
        self.assertEqual(head('רב הונא בר נתן'), 'הונא')
        self.assertEqual(head('רבה בר רב הונא'), 'רבה')
        self.assertEqual(head("ר' יוסה"), 'יוסי')
        self.assertEqual(head('רבי יסא'), 'יסא')

    def test_restored_full_name_outranks_short_extraction(self):
        m=self.mentions()['b493-p6/D']
        self.assertTrue(m['reviewedLocal'])
        self.assertIn('אחוה',m['label'])
        self.assertTrue(m['fullDescriptor'])
        self.assertIsNone(m['acceptedSlug'])

    def test_huna_namesakes_stay_separate(self):
        mentions=self.mentions()
        people=[m for m in mentions.values() if m['passageId']=='b059-p9']
        self.assertGreaterEqual(len({m['nodeId'] for m in people}),2)
        self.assertEqual(mentions['b059-p9/B']['acceptedSlug'], 'rav-huna-b-hinena')
        self.assertIsNone(mentions['b059-p9/A']['acceptedSlug'])
        self.assertFalse(mentions['b059-p9/A']['fullDescriptor'])

    def test_checked_intellectual_exchange_does_not_become_a_meeting(self):
        mentions=self.mentions()
        people=[m for m in mentions.values() if m['passageId']=='b574-p4']
        evidence=[e for m in people for e in m['evidence'] if e['recordId']=='connection:source-review/b574-p4']
        self.assertTrue(evidence)
        self.assertTrue(all(e['channel']=='intellectual' for e in evidence))
        for m in people:
            reviewed={e['partnerKey'] for e in m['evidence'] if e['recordId'].startswith('connection:')}
            self.assertFalse(any(e['channel']=='classified_direct' and e['partnerKey'] in reviewed for e in m['evidence']))

    def test_reviewed_aliases_share_checked_evidence(self):
        mentions=self.mentions()
        for key in ['b567-p7/D', 'b567-p7/E']:
            edges=mentions[key]['evidence']
            self.assertTrue(any(e['channel']=='checked_direct' for e in edges))
            self.assertFalse(any(e['recordId']=='claim:b567-p7/s4' and e['channel']=='classified_direct' for e in edges))

    def test_previous_identity_and_era_reviews_are_retained(self):
        mentions=self.mentions()
        huna=mentions['b115-p9/A']['existingAssessments']
        self.assertTrue(any(x['assessment'].get('relation')=='possible_same_person' for x in huna))
        yosei=mentions['b018-p4/E']['existingAssessments']
        self.assertTrue(any('rabbi-yosei-bar-zevida' in x['assessment'].get('candidateSlugs',[]) for x in yosei))
        self.assertIsNone(mentions['b018-p4/E']['acceptedSlug'])

    def test_export_preserves_classification_warnings(self):
        result=scan(self.rows, FIXTURE['registry'])
        edges=[e for f in result['families'] for m in f['mentions'] for e in m['evidence']
               if e['recordId']=='claim:b028-p1/s1']
        original=json.loads(next(r[-1] for r in self.rows if r[0]=='claim:b028-p1/s1'))
        self.assertTrue(edges)
        self.assertTrue(all(e['classification']==original['classification'] and
                            e['endpointNotes']==original.get('participants',[]) for e in edges))

    def test_context_quotes_search_saved_neighbors(self):
        passages=[json.loads(r[-1]) for r in self.rows if r[1]=='passage']
        source=next(p['source'] for p in passages if p['source'].get('before') and p['source'].get('after'))
        self.assertTrue(quote_matches(source,'context',source['before']))
        self.assertTrue(quote_matches(source,'context',source['after']))
        self.assertFalse(quote_matches(source,'context',source['before']+source['after']))
        self.assertFalse(quote_matches(source,'context',''))

    def test_quote_corruption_is_reported_and_excluded(self):
        row=next(r for r in self.rows if r[1]=='claim' and json.loads(r[-1])['passageId']=='b493-p6')
        claim=json.loads(row[-1]);claim['claim']['quote']='Deliberately corrupted evidence';row[-1]=json.dumps(claim)
        result=self.result()
        self.assertIn({'recordId':row[0],'reason':'quote_not_in_saved_source'},result['errors'])
        self.assertFalse(any(e['recordId']==row[0] for f in result['families'] for m in f['mentions'] for e in m['evidence']))

    def test_all_claims_accounted_for_and_no_identities_accepted(self):
        result=self.result();coverage=result['coverage']
        self.assertEqual(sum(coverage['claimDispositions'].values()),coverage['inputClaims'])
        self.assertTrue(all(f['accepted'] is False for f in result['families']))
        self.assertEqual(result,self.result())

    def test_hypothetical_or_indirect_is_never_direct(self):
        claims=[json.loads(r[-1]) for r in self.rows if r[1]=='claim']
        indirect=[c for c in claims if 'indirect' in c['classification'].get('flags',[])]
        hypothetical=[c for c in claims if c['classification']['mode']=='hypothetical']
        self.assertTrue(indirect and hypothetical)
        self.assertTrue(all(channel(c)!='classified_direct' for c in indirect+hypothetical))

if __name__=='__main__':unittest.main()
