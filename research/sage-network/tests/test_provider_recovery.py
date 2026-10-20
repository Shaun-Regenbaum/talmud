"""Real captured jobs with explicitly simulated transport failures; no new source claims."""
import copy
import shutil
from decimal import Decimal
from pathlib import Path
from test_matched_transition import MatchedTransitionTests
import queue_core as q
from provider_recovery import transition, VERSION
from provider_errors import ProviderError


class ProviderRecoveryTests(MatchedTransitionTests):
    def stopped_low(self):
        self.start(); self.move(); self.read_arm()
        self.prior, self.previous_input = self.next_config, self.next_input
        self.next_arm('low'); self.move()
        # Only transport is simulated. It returns a sanitized actual HTTP failure shape.
        wire = self.wire
        def failed(url, key=None, body=None):
            if body is not None:
                raise ProviderError(dict(httpStatus=429, curlCode=0, providerErrorCode='429', message='Provider returned error'))
            return wire(url, key, body)
        q.run(self.next_config,self.next_input,self.next_input/'recipe',self.full_runs,lambda:None,concurrency=3,request=failed)
        self.prior, self.previous_input = self.next_config, self.next_input
        self.prepare_recovery('probe')

    def prepare_recovery(self, stage):
        prior = self.prior; old = self.previous_input
        manifest = q.load(old/'queue-manifest.json')
        old_jobs = list(q.jobs(old, manifest))
        known = Decimal(0); unknown = Decimal(0)
        for job in old_jobs:
            path = self.full_runs/prior['runId']/'results'/(job['job_id']+'.json')
            if path.exists():
                result=q.load(path)
                if result['costUsd'] is None:
                    unknown += Decimal(str(q.load(self.full_runs/prior['runId']/'attempts'/(job['job_id']+'.json'))['reservedUsd']))
                else: known += Decimal(str(result['costUsd']))
        following=copy.deepcopy(prior)
        following.update(runId='recovery-'+stage, approvedConcurrency=1,
            providerRecoveryHash=q.file_hash(Path(q.__file__).with_name('provider_recovery.py')),
            carriedUnknownReservedUsd=float(Decimal(str(q.verified_carry(prior,self.full_runs)))+unknown),
            priorRun=dict(runId=prior['runId'],configHash=q.digest(prior),reportedCostUsd=float(known),unknownReservedUsd=float(unknown)))
        following['comparisonTrial']['priorExperimentCostUsd']=float(Decimal(str(prior['comparisonTrial']['priorExperimentCostUsd']))+known)
        following['budgetUsd']=float(Decimal('.75')-Decimal(str(following['comparisonTrial']['priorExperimentCostUsd']))+Decimal(str(following['comparisonTrial']['baselineUnknownReservedUsd'])))
        if stage=='probe':
            following['route']['provider']='open-inference/fp4'
            self.origin_jobs=old_jobs
            selected=old_jobs[:1]
            following['providerRecovery']=dict(version=VERSION,stage=stage,originRun=prior['runId'],originConfigHash=q.digest(prior),eligibleJobsHash=q.digest({j['job_id']:q.digest(j) for j in old_jobs}))
        else:
            selected=[j for j in self.origin_jobs if j['job_id'] not in {v['job_id'] for v in old_jobs}]
            following['providerRecovery']['stage']=stage
        new=self.full_inputs/following['runId'];shutil.copytree(old,new)
        shard=new/'shards'/self.shard.name;shard.write_text(''.join(q.canonical(j)+'\n' for j in selected))
        manifest['jobs']=manifest['shards'][0]['jobs']=len(selected);manifest['shards'][0]['sha256']=q.file_hash(shard)
        following['inputManifestHash']=q.digest(manifest)
        q.atomic(new/'queue-manifest.json',manifest);q.atomic(new/'config.json',following)
        self.next_config,self.next_input=following,new

    def recover(self,commit=lambda:None):
        return transition(self.full_inputs,self.full_runs,self.prior['runId'],self.next_config['runId'],q.digest(self.prior),q.digest(self.next_config),commit)

    def save_config(self): q.atomic(self.next_input/'config.json',self.next_config)

    def run_probe(self):
        wire=self.wire
        def route_wire(url,key=None,body=None):
            result=wire(url,key,body)
            if url.endswith('/endpoints'):
                result['data']['endpoints'][0]['tag']='open-inference/fp4'
            return result
        return q.run(self.next_config,self.next_input,self.next_input/'recipe',self.full_runs,lambda:None,concurrency=1,request=route_wire)

    def test_probe_and_remainder_preserve_all_costs(self):
        self.stopped_low();receipt=self.recover()
        self.assertGreater(receipt['carriedUnknownReservedUsd'],self.next_config['comparisonTrial']['baselineUnknownReservedUsd'])
        self.assertEqual(len(receipt['evidence']),30)
        self.assertTrue(any(e['status']=='never_started' for e in receipt['evidence']))
        self.assertEqual(self.run_probe()['counts']['complete'],1)
        before=self.next_config['comparisonTrial']['priorExperimentCostUsd']
        self.prior,self.previous_input=self.next_config,self.next_input
        self.prepare_recovery('remainder');self.recover()
        self.assertGreater(self.next_config['comparisonTrial']['priorExperimentCostUsd'],before)
        self.assertEqual(self.run_probe()['counts']['complete'],29)

    def test_probe_cannot_drop_unknown_holds(self):
        self.stopped_low();self.next_config['carriedUnknownReservedUsd']=0;self.save_config()
        with self.assertRaisesRegex(ValueError,'unknown holds'):self.recover()

    def test_recovery_archive_crash_is_idempotent(self):
        self.stopped_low()
        with self.assertRaisesRegex(RuntimeError,'commit'):
            self.recover(lambda:(_ for _ in ()).throw(RuntimeError('commit')))
        receipt=self.recover();self.assertEqual(self.recover(),receipt)

    def test_probe_requires_exact_saved_failure(self):
        self.stopped_low();paths=list((self.full_runs/self.prior['runId']/'results').glob('*.json'))
        result=q.load(paths[0]);result['providerDiagnostic']['httpStatus']=500;result.pop('resultHash');result['resultHash']=q.digest(result);q.atomic(paths[0],result)
        with self.assertRaisesRegex(ValueError,'HTTP 429'):self.recover()

    def test_recovery_rejects_missing_result(self):
        self.stopped_low();next((self.full_runs/self.prior['runId']/'results').glob('*.json')).unlink()
        with self.assertRaisesRegex(ValueError,'interrupted'):self.recover()

    def test_recovery_rejects_changed_recipe(self):
        self.stopped_low();(self.next_input/'recipe/changed.txt').write_text('corruption test')
        self.next_config['recipeFiles']=q.recipe_files(self.next_input/'recipe');self.save_config()
        with self.assertRaisesRegex(ValueError,'recipe'):self.recover()

    def test_recovery_rejects_changed_parameters(self):
        self.stopped_low();self.next_config['parameters']['max_tokens']+=1;self.save_config()
        with self.assertRaisesRegex(ValueError,'parameters'):self.recover()

    def test_remainder_requires_successful_probe(self):
        self.stopped_low();self.recover();self.run_probe()
        path=next((self.full_runs/self.next_config['runId']/'results').glob('*.json'))
        result=q.load(path);result['costUsd']=None;result.pop('resultHash');result['resultHash']=q.digest(result);q.atomic(path,result)
        self.prior,self.previous_input=self.next_config,self.next_input;self.prepare_recovery('remainder')
        with self.assertRaisesRegex(ValueError,'known charge'):self.recover()

    def test_scope_commit_failure_replays_without_reset(self):
        self.stopped_low();commits=[]
        def commit():
            commits.append(True)
            if len(commits)==2:raise RuntimeError('scope commit')
        with self.assertRaisesRegex(RuntimeError,'scope commit'):self.recover(commit)
        receipt=self.recover();self.assertEqual(self.recover(),receipt)

    def test_recovery_rejects_missing_attempt(self):
        self.stopped_low();next((self.full_runs/self.prior['runId']/'attempts').glob('*.json')).unlink()
        with self.assertRaisesRegex(ValueError,'without attempt'):self.recover()

    def test_recovery_rejects_changed_source(self):
        import json
        self.stopped_low();shard=self.next_input/'shards'/self.shard.name
        job=json.loads(shard.read_text());job['focal_ref']+=' corrupt'
        shard.write_text(q.canonical(job)+'\n');manifest=q.load(self.next_input/'queue-manifest.json')
        manifest['shards'][0]['sha256']=q.file_hash(shard);self.next_config['inputManifestHash']=q.digest(manifest)
        q.atomic(self.next_input/'queue-manifest.json',manifest);self.save_config()
        with self.assertRaisesRegex(ValueError,'captured source'):self.recover()

    def test_recovery_cannot_reset_shared_cap(self):
        self.stopped_low();self.next_config['comparisonTrial']['priorExperimentCostUsd']=0
        self.next_config['budgetUsd']=float(Decimal('.75')+Decimal(str(self.next_config['comparisonTrial']['baselineUnknownReservedUsd'])))
        self.save_config()
        with self.assertRaisesRegex(ValueError,'shared experiment'):self.recover()

    def test_remainder_cannot_include_successful_probe(self):
        self.stopped_low();self.recover();self.run_probe()
        self.prior,self.previous_input=self.next_config,self.next_input;self.prepare_recovery('remainder')
        shard=self.next_input/'shards'/self.shard.name
        shard.write_text(''.join(q.canonical(j)+'\n' for j in self.origin_jobs[:29]))
        manifest=q.load(self.next_input/'queue-manifest.json');manifest['shards'][0]['sha256']=q.file_hash(shard)
        self.next_config['inputManifestHash']=q.digest(manifest);q.atomic(self.next_input/'queue-manifest.json',manifest);self.save_config()
        with self.assertRaisesRegex(ValueError,'exclude the successful'):self.recover()
