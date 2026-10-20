"""Bridge fault tests use the actual frozen 210-source sample, with transport-only echoes."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import unittest
from decimal import Decimal

from test_coverage_queue import QueueHarness, Wire
import queue_core as q
from quality_bridge import bridge

CAPTURED_BYTES = gzip.decompress((Path(__file__).parent/'fixtures/quality-210-source-jobs.jsonl.gz').read_bytes())
assert hashlib.sha256(CAPTURED_BYTES).hexdigest() == '823e4fb01d29f858e635130229860eae01c506ec5b2dd2e3e822c0b83d192b88'
CAPTURED = [json.loads(line) for line in CAPTURED_BYTES.splitlines()]


class QualityBridgeTests(QueueHarness):
    def prepare(self, unknown=False):
        self.jobs = copy.deepcopy(CAPTURED[:3])
        self.shard.write_text(''.join(q.canonical(j)+'\n' for j in self.jobs))
        self.manifest['jobs'] = self.manifest['shards'][0]['jobs'] = 3
        self.manifest['shards'][0]['sha256'] = q.file_hash(self.shard)
        q.atomic(self.inputs/'queue-manifest.json', self.manifest)
        self.config.update(executionMode='probe', approvedConcurrency=3, budgetUsd=.1,
                           inputManifestHash=q.digest(self.manifest))
        self.run_queue()
        self.probe_inputs, self.full_inputs, self.full_runs = [self.root/p for p in ('probe-inputs','full-inputs','full-runs')]
        old = self.probe_inputs/self.config['runId']; old.parent.mkdir()
        shutil.copytree(self.inputs, old); shutil.copytree(self.recipe, old/'recipe')
        q.atomic(old/'config.json', self.config)
        held = Decimal(0)
        if unknown:
            for j in self.jobs:
                path = self.output/self.config['runId']/'results'/(j['job_id']+'.json')
                data = q.load(path); data['costUsd'] = None; data.pop('resultHash'); data['resultHash'] = q.digest(data)
                q.atomic(path, data)
                held += Decimal(str(q.load(self.output/self.config['runId']/'attempts'/(j['job_id']+'.json'))['reservedUsd']))
        following = copy.deepcopy(self.config)
        following.update(runId='reviewed-quality-210', executionMode='full', qualityTrial='source-readings-210-v1',
                         approvedConcurrency=16, budgetUsd=5, carriedUnknownReservedUsd=float(held),
                         qualityBridgeHash=q.file_hash(Path(q.__file__).with_name('quality_bridge.py')),
                         priorRun=dict(runId=self.config['runId'],configHash=q.digest(self.config),
                                       reportedCostUsd=0 if unknown else .000003,unknownReservedUsd=float(held)))
        new = self.full_inputs/following['runId']; new.parent.mkdir()
        shutil.copytree(old, new)
        (new/'shards'/self.shard.name).write_text(''.join(q.canonical(j)+'\n' for j in CAPTURED))
        manifest = copy.deepcopy(self.manifest); manifest['jobs'] = manifest['shards'][0]['jobs'] = 210
        manifest['shards'][0]['sha256'] = q.file_hash(new/'shards'/self.shard.name)
        following['inputManifestHash'] = q.digest(manifest)
        q.atomic(new/'queue-manifest.json',manifest); q.atomic(new/'config.json',following)
        self.following, self.new = following, new
        return following

    def bridge(self, commit_probe=lambda: None, commit_full=lambda: None):
        return bridge(self.probe_inputs,self.output,self.full_inputs,self.full_runs,
                      self.config['runId'],self.following['runId'],q.digest(self.config),q.digest(self.following),
                      commit_probe,commit_full)

    def run_full(self, wire=None):
        return q.run(self.following,self.new,self.new/'recipe',self.full_runs,lambda:None,
                     concurrency=16,request=wire or self.wire)

    def test_carries_unknown_and_retires_old_scope_before_new_dispatch(self):
        self.prepare(unknown=True); receipt=self.bridge()
        self.assertGreater(receipt['carriedUnknownReservedUsd'],0)
        self.assertEqual(self.bridge(),receipt)
        with self.assertRaisesRegex(ValueError,'another frozen run'):
            self.run_queue()
        result=self.run_full()
        self.assertEqual(result['counts']['complete'],210)
        self.assertEqual(result['carriedUnknownReservedUsd'],receipt['carriedUnknownReservedUsd'])
        self.assertEqual(len(self.wire.calls),213)
        self.run_full(); self.assertEqual(len(self.wire.calls),213)

    def test_crash_after_archive_does_not_activate_target_and_can_resume(self):
        self.prepare(unknown=True)
        with self.assertRaisesRegex(RuntimeError,'commit failure'):
            self.bridge(commit_full=lambda: (_ for _ in ()).throw(RuntimeError('commit failure')))
        with self.assertRaisesRegex(ValueError,'another frozen run'):
            self.run_full()
        self.assertEqual(len(self.wire.calls),3)
        self.bridge(); self.assertTrue((self.full_runs/'budget-scope.json').exists())

    def test_crash_after_source_retirement_leaves_both_runners_blocked(self):
        self.prepare(unknown=True)
        with self.assertRaisesRegex(RuntimeError,'commit failure'):
            self.bridge(commit_probe=lambda: (_ for _ in ()).throw(RuntimeError('commit failure')))
        for run in (self.run_queue,self.run_full):
            with self.assertRaisesRegex(ValueError,'another frozen run'): run()
        self.bridge(); self.assertTrue((self.full_runs/'budget-scope.json').exists())

    def test_cannot_drop_old_unknown_reservations(self):
        self.prepare(unknown=True); self.following['carriedUnknownReservedUsd']=0
        q.atomic(self.new/'config.json',self.following)
        with self.assertRaisesRegex(ValueError,'preserve exact prior costs'): self.bridge()
        self.assertFalse((self.full_runs/'budget-scope.json').exists())

    def test_validation_failures_are_saved_through_all_210(self):
        self.prepare(); self.bridge(); wire=Wire(malformed=True)
        report=self.run_full(wire)
        self.assertEqual(report['counts']['failed'],210)
        self.assertEqual(len(wire.calls),210)
        self.assertEqual(report['acceptedFacts'],0)
        self.assertFalse(report['allStructurallyRead'])
        self.assertEqual(len(list((self.full_runs/self.following['runId']/'results').glob('*.json'))),210)

    def test_provider_failure_stop_is_unchanged(self):
        self.prepare(); self.bridge(); wire=Wire(fail=True)
        report=self.run_full(wire)
        self.assertEqual(report['stopReason'],'provider_failure_burst')
        self.assertLess(len(wire.calls),210)

    def test_trial_caps_are_enforced(self):
        self.prepare()
        for field,value in [('budgetUsd',5.01),('approvedConcurrency',64),('executionMode','probe')]:
            bad=copy.deepcopy(self.following);bad[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                q.config_check(bad,q.load(self.new/'queue-manifest.json'),self.new/'recipe',16)
        manifest=q.load(self.new/'queue-manifest.json');manifest['jobs']=211
        bad=copy.deepcopy(self.following);bad['inputManifestHash']=q.digest(manifest)
        with self.assertRaisesRegex(ValueError,'quality trial'):
            q.config_check(bad,manifest,self.new/'recipe',16)


if __name__=='__main__':
    unittest.main()
