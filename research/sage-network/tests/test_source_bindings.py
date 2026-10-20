"""Exact source joins using captured tile sources; mutations are rejection tests."""
import json
import sys
from pathlib import Path
from test_tile_ownership import TileOwnershipTests
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'storage'))
import source_bindings
from ownership.tile_ownership import build,sha

class SourceBindingTests(TileOwnershipTests):
    def setup_rows(self):
        root,fixture,pin=self.capture('bavli');bundle=build(root,pin)
        source=fixture['jobs'][0]['sources'][0]
        # Only the graph envelope is constructed; source address and text are captured.
        raw=json.dumps(dict(ref=source['ref'],source=dict(passage=source['text'])),ensure_ascii=False)
        row=('passage:'+source['source_id'],'passage',source['source_id'],source['ref'],None,None,'screening','needs_review',sha(raw.encode()),raw)
        return row,[dict(manifest=bundle,expectedManifestSha256=bundle['manifest']['manifestSha256'])]
    def test_exact_join_preserves_parent(self):
        row,spec=self.setup_rows();result=source_bindings.records([row],spec)
        self.assertEqual(len(result),1);self.assertEqual(result[0]['data']['passagePayloadSha256'],row[-2])
        self.assertFalse(result[0]['data']['confirmedFacts'])
    def test_wrong_ref_and_changed_source_do_not_join(self):
        row,spec=self.setup_rows();bad=list(row);bad[3]+=':1';self.assertEqual(source_bindings.records([bad],spec),[])
        bad=list(row);d=json.loads(bad[-1]);d['source']['passage']+=' ';bad[-1]=json.dumps(d);self.assertEqual(source_bindings.records([bad],spec),[])
    def test_unpinned_manifest_rejected(self):
        row,spec=self.setup_rows();spec[0]['expectedManifestSha256']='0'*64
        with self.assertRaisesRegex(ValueError,'Unapproved'):source_bindings.records([row],spec)
    def test_payload_mutation_rejected(self):
        row,spec=self.setup_rows();changes=dict(parentRevision='captured',description=source_bindings.DESCRIPTION,sourceBindingManifests=spec,records=source_bindings.records([row],spec))
        source_bindings.validate_changes(changes,{row[0]:row})
        changes['records'][0]['data']['edition']+=' changed'
        with self.assertRaisesRegex(ValueError,'differ'):source_bindings.validate_changes(changes,{row[0]:row})
