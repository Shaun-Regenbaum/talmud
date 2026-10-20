"""Matched-arm faults use actual captured source jobs and transport-only echoes."""
import copy
import shutil
from pathlib import Path
from decimal import Decimal
from test_quality_bridge import QualityBridgeTests, CAPTURED
import queue_core as q
from matched_transition import transition, VERSION


class MatchedTransitionTests(QualityBridgeTests):
    def start(self):
        self.prepare(unknown=True); self.bridge(); self.run_full()
        self.prior = self.following; self.previous_input = self.new
        return self.next_arm('none')

    def next_arm(self, arm):
        prior = self.prior; old = self.previous_input
        old_manifest = q.load(old/'queue-manifest.json'); known = Decimal(0); unknown = Decimal(0)
        for job in q.jobs(old, old_manifest):
            r = q.load(self.full_runs/prior['runId']/'results'/(job['job_id']+'.json'))
            if r['costUsd'] is None:
                unknown += Decimal(str(q.load(self.full_runs/prior['runId']/'attempts'/(job['job_id']+'.json'))['reservedUsd']))
            else:
                known += Decimal(str(r['costUsd']))
        carry = float(Decimal(str(q.verified_carry(prior, self.full_runs))) + unknown)
        following = copy.deepcopy(prior); following.pop('qualityTrial', None); following.pop('qualityBridgeHash', None)
        following.update(runId='matched-'+arm, approvedConcurrency=3, carriedUnknownReservedUsd=carry,
                         priorRun=dict(runId=prior['runId'], configHash=q.digest(prior), reportedCostUsd=float(known), unknownReservedUsd=float(unknown)),
                         matchedTransitionHash=q.file_hash(Path(q.__file__).with_name('matched_transition.py')))
        if arm == 'none':
            trial = dict(version=VERSION, experimentId='actual-source-comparison', arm=arm, incrementalCapUsd=.75, priorExperimentCostUsd=0,
                         baselineRun=prior['runId'], baselineConfigHash=q.digest(prior), baselineKnownCostUsd=float(known), baselineUnknownReservedUsd=carry)
        else:
            trial = dict(prior['comparisonTrial'], arm=arm, priorExperimentCostUsd=float(known))
        following['comparisonTrial'] = trial
        following['budgetUsd'] = float(Decimal('.75') - Decimal(str(trial['priorExperimentCostUsd'])) + Decimal(str(trial['baselineUnknownReservedUsd'])))
        following['parameters']['reasoning'] = {'effort': arm}
        new = self.full_inputs/following['runId']; shutil.copytree(old, new)
        shard = new/'shards'/self.shard.name; shard.write_text(''.join(q.canonical(j)+'\n' for j in CAPTURED[:30]))
        manifest = copy.deepcopy(old_manifest); manifest['jobs'] = manifest['shards'][0]['jobs'] = 30; manifest['shards'][0]['sha256'] = q.file_hash(shard)
        following['inputManifestHash'] = q.digest(manifest)
        q.atomic(new/'queue-manifest.json', manifest); q.atomic(new/'config.json', following)
        self.next_config, self.next_input = following, new
        return following

    def move(self, commit=lambda: None):
        return transition(self.full_inputs,self.full_runs,self.prior['runId'],self.next_config['runId'],q.digest(self.prior),q.digest(self.next_config),commit)

    def read_arm(self):
        return q.run(self.next_config,self.next_input,self.next_input/'recipe',self.full_runs,lambda:None,concurrency=3,request=self.wire)

    def test_two_arms_share_budget_and_preserve_historical_hold(self):
        self.start(); self.move(); first = self.read_arm()
        self.assertEqual(first['counts']['complete'],30)
        self.assertGreater(first['carriedUnknownReservedUsd'],0)
        self.prior,self.previous_input=self.next_config,self.next_input
        self.next_arm('low'); receipt=self.move(); second=self.read_arm()
        self.assertEqual(second['counts']['complete'],30)
        self.assertGreater(receipt['comparisonTrial']['priorExperimentCostUsd'],0)
        self.assertEqual(len(self.wire.calls),273)
        self.assertEqual(self.move(),receipt)
        self.read_arm(); self.assertEqual(len(self.wire.calls),273)

    def test_cannot_start_before_all_210_results_exist(self):
        self.start(); (self.full_runs/self.prior['runId']/'results'/(CAPTURED[-1]['job_id']+'.json')).unlink()
        with self.assertRaises(ValueError): self.move()

    def test_second_arm_cannot_reset_spending(self):
        self.start(); self.move(); self.read_arm(); self.prior,self.previous_input=self.next_config,self.next_input
        self.next_arm('low'); self.next_config['comparisonTrial']['priorExperimentCostUsd']=0
        self.next_config['budgetUsd']+=.00003
        q.atomic(self.next_input/'config.json',self.next_config)
        with self.assertRaises(ValueError): self.move()

    def test_archive_crash_can_resume_without_requests(self):
        self.start()
        with self.assertRaisesRegex(RuntimeError,'commit failure'):
            self.move(lambda: (_ for _ in ()).throw(RuntimeError('commit failure')))
        with self.assertRaises(ValueError): self.read_arm()
        self.move(); self.assertEqual(self.read_arm()['counts']['complete'],30)

    def test_key_change_rejected(self):
        self.start(); self.next_config['keyFingerprint']='unrelated'
        q.atomic(self.next_input/'config.json',self.next_config)
        with self.assertRaisesRegex(ValueError,'key or route'): self.move()

    def test_scope_commit_failure_is_idempotent(self):
        self.start(); commits = []
        def commit():
            commits.append(True)
            if len(commits) == 2:
                raise RuntimeError('scope commit failure')
        with self.assertRaisesRegex(RuntimeError, 'scope commit failure'): self.move(commit)
        receipt = self.move()
        self.assertEqual(receipt['nextScope']['runId'], self.next_config['runId'])
        self.assertEqual(self.read_arm()['counts']['complete'], 30)

    def test_missing_attempt_rejected(self):
        self.start(); (self.full_runs/self.prior['runId']/'attempts'/(CAPTURED[0]['job_id']+'.json')).unlink()
        with self.assertRaises(ValueError): self.move()

    def test_second_arm_preserves_unknown_first_arm_hold(self):
        self.start(); self.move(); self.read_arm()
        path = self.full_runs/self.next_config['runId']/'results'/(CAPTURED[0]['job_id']+'.json')
        result = q.load(path); result['costUsd'] = None; result.pop('resultHash'); result['resultHash'] = q.digest(result); q.atomic(path,result)
        self.prior,self.previous_input=self.next_config,self.next_input
        self.next_arm('low'); receipt=self.move()
        self.assertGreater(receipt['carriedUnknownReservedUsd'], self.next_config['comparisonTrial']['baselineUnknownReservedUsd'])
        self.assertEqual(self.read_arm()['counts']['complete'],30)

    def test_altered_matched_source_rejected(self):
        self.start(); shard=self.next_input/'shards'/self.shard.name
        import json
        jobs=[json.loads(line) for line in shard.read_text().splitlines()]
        jobs[0]['focal_ref'] += ' changed'
        shard.write_text(''.join(q.canonical(j)+'\n' for j in jobs))
        manifest=q.load(self.next_input/'queue-manifest.json'); manifest['shards'][0]['sha256']=q.file_hash(shard)
        self.next_config['inputManifestHash']=q.digest(manifest)
        q.atomic(self.next_input/'queue-manifest.json',manifest); q.atomic(self.next_input/'config.json',self.next_config)
        with self.assertRaisesRegex(ValueError,'same captured source'):self.move()

    def test_second_arm_recipe_change_rejected(self):
        self.start(); self.move(); self.read_arm(); self.prior,self.previous_input=self.next_config,self.next_input
        self.next_arm('low'); (self.next_input/'recipe/extra.txt').write_text('different recipe binding')
        self.next_config['recipeFiles']=q.recipe_files(self.next_input/'recipe'); q.atomic(self.next_input/'config.json',self.next_config)
        with self.assertRaisesRegex(ValueError,'matched first arm'):self.move()

    def test_comparison_saves_all_validation_failures(self):
        from test_coverage_queue import Wire
        self.start(); self.move(); self.wire=Wire(malformed=True)
        report=self.read_arm()
        self.assertEqual(report['counts']['failed'],30)
        self.assertEqual(len(self.wire.calls),30)
        self.assertEqual(report['acceptedFacts'],0)

    def test_comparison_keeps_provider_burst_stop(self):
        from test_coverage_queue import Wire
        self.start(); self.move(); self.wire=Wire(fail=True)
        report=self.read_arm()
        self.assertEqual(report['stopReason'],'provider_failure_burst')
        self.assertLess(len(self.wire.calls),30)
