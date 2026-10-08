"""Reject altered namesake screens before they reach the graph database."""
import copy
import json
import sqlite3
import sys
import tempfile
import unittest
from collections import Counter
from contextlib import closing, redirect_stdout
from io import StringIO
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'research/sage-network/identity'))
sys.path.insert(0,str(ROOT/'research/sage-network/storage'))
from network_scan import encode, sha
from prepare_scan import build
from extend_d1 import prepare

FIXTURE=json.loads((Path(__file__).parent/'fixtures/namesake-network.json').read_text())


class ScanImportTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        rows=sorted(FIXTURE['records'])
        self.parent=dict(revision='saved-scan-fixture',recordCount=len(rows),
            countsByKind=dict(Counter(r[1] for r in rows)),recordSetSha256=sha(encode([r[:-1] for r in rows])))
        with closing(sqlite3.connect(':memory:')) as db:
            for path in sorted((ROOT/'packages/talmud/migrations-sage-graph').glob('*.sql')):
                db.executescript(path.read_text())
            db.execute('INSERT INTO sage_graph_revisions VALUES (?,?,?,?)',
                (self.parent['revision'],encode({k:v for k,v in self.parent.items() if k!='revision'}),'loading','2026-10-08'))
            db.executemany('INSERT INTO sage_graph_records VALUES (?,?,?,?,?,?,?,?,?,?,?)',[(self.parent['revision'],*r) for r in rows])
            db.execute("UPDATE sage_graph_revisions SET state='verified'")
            (self.root/'parent.sql').write_text('\n'.join(db.iterdump()))
        (self.root/'manifest.json').write_text(encode(self.parent))
        self.changes=build(rows,FIXTURE['registry'],self.parent)

    def run_import(self):
        (self.root/'changes.json').write_text(encode(self.changes))
        with redirect_stdout(StringIO()):
            return prepare(self.root/'parent.sql',self.root/'manifest.json',self.root/'changes.json',self.root/'out')

    def test_saved_records_round_trip(self):
        first=self.run_import()
        self.assertEqual(first,self.run_import())
        self.assertEqual(first['changedRecords'],len(self.changes['records']))

    def test_altered_evidence_identity_counts_and_authority_rejected(self):
        original=copy.deepcopy(self.changes)
        for field,value in [('accepted',True),('sourceRecordSha256','0'*64),('nodeId','wrong-person'),
                            ('quarantinedClaimCount',100),('compareFullNames',[{'name':'corrupted comparison'}])]:
            self.changes=copy.deepcopy(original)
            target=next(r for r in self.changes['records'] if r['kind']=='namesake_scan')
            target['data'][field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'differs from verified parent recomputation'):
                self.run_import()
        self.changes=copy.deepcopy(original)
        self.changes['records'][0]['authority']='source_review'
        with self.assertRaisesRegex(ValueError,'differs from verified parent recomputation'):
            self.run_import()

    def test_empty_scan_cannot_bypass_recomputation(self):
        self.changes['records']=[]
        with self.assertRaisesRegex(ValueError,'differs from verified parent recomputation'):
            self.run_import()

    def test_dropped_record_rejected(self):
        self.changes['records'].pop()
        with self.assertRaisesRegex(ValueError,'differs from verified parent recomputation'):
            self.run_import()

if __name__=='__main__':unittest.main()
