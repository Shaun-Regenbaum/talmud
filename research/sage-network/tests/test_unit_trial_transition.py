"""Actual captured controls with an explicitly transport-only recipe binding change."""
import copy
from decimal import Decimal
from pathlib import Path
import shutil
from test_provider_recovery import ProviderRecoveryTests
from test_quality_bridge import CAPTURED
import queue_core as q
from unit_trial_transition import transition, VERSION, CONTROLS


class UnitTrialTests(ProviderRecoveryTests):
    def next_arm(self, arm):
        following=super().next_arm(arm)
        # The actual trial's original thirty include061; reuse real captured source bytes.
        selected=CAPTURED[:29]+[next(j for j in CAPTURED if j['job_id']=='v18-bavli-061')]
        shard=self.next_input/'shards'/self.shard.name;shard.write_text(''.join(q.canonical(j)+'\n' for j in selected))
        manifest=q.load(self.next_input/'queue-manifest.json');manifest['shards'][0]['sha256']=q.file_hash(shard)
        following['inputManifestHash']=q.digest(manifest);q.atomic(self.next_input/'queue-manifest.json',manifest);self.save_config()
        return following

    def prepare_units(self):
        self.stopped_probe();self.recover();self.run_probe()
        self.prior,self.previous_input=self.next_config,self.next_input
        following=copy.deepcopy(self.prior);following.pop('providerRecovery')
        result=q.load(self.full_runs/self.prior['runId']/'results'/next((self.full_runs/self.prior['runId']/'results').glob('*.json')).name)
        following.update(runId='numbered-three',unitTrialTransitionHash=q.file_hash(Path(q.__file__).with_name('unit_trial_transition.py')),
            priorRun=dict(runId=self.prior['runId'],configHash=q.digest(self.prior),reportedCostUsd=result['costUsd'],unknownReservedUsd=0.))
        following['comparisonTrial']['priorExperimentCostUsd']=float(Decimal(str(self.prior['comparisonTrial']['priorExperimentCostUsd']))+Decimal(str(result['costUsd'])))
        following['budgetUsd']=float(Decimal('.75')-Decimal(str(following['comparisonTrial']['priorExperimentCostUsd']))+Decimal(str(following['comparisonTrial']['baselineUnknownReservedUsd'])))
        selected=[j for j in self.origin_jobs if j['job_id'] in CONTROLS];assert len(selected)==3
        new=self.full_inputs/following['runId'];shutil.copytree(self.previous_input,new)
        shard=new/'shards'/self.shard.name;shard.write_text(''.join(q.canonical(j)+'\n' for j in selected))
        manifest=q.load(new/'queue-manifest.json');manifest['jobs']=manifest['shards'][0]['jobs']=3;manifest['shards'][0]['sha256']=q.file_hash(shard)
        following['inputManifestHash']=q.digest(manifest)
        adapter=new/'recipe/queue_adapter.py';adapter.write_text(adapter.read_text()+'\n# Explicit transport-only binding change, not a historical reading recipe.\n')
        following['recipeFiles']=q.recipe_files(new/'recipe')
        following['sourceUnitTrial']=dict(version=VERSION,experimentId='numbered-source-controls',originRun=self.prior['providerRecovery']['originRun'],originConfigHash=self.prior['providerRecovery']['originConfigHash'],sourceJobsHash=q.digest({j['job_id']:q.digest(j) for j in selected}),previousRecipeHash=q.digest(self.prior['recipeFiles']),newRecipeHash=q.digest(following['recipeFiles']))
        self.next_config,self.next_input=following,new;q.atomic(new/'queue-manifest.json',manifest);self.save_config()

    def move_units(self,commit=lambda:None):
        return transition(self.full_inputs,self.full_runs,self.prior['runId'],self.next_config['runId'],q.digest(self.prior),q.digest(self.next_config),commit)

    def test_three_controls_retain_all_old_spending(self):
        self.prepare_units();receipt=self.move_units()
        self.assertEqual(receipt['carriedUnknownReservedUsd'],self.prior['carriedUnknownReservedUsd'])
        self.assertGreater(receipt['comparisonTrial']['priorExperimentCostUsd'],self.prior['comparisonTrial']['priorExperimentCostUsd'])
        self.assertEqual(self.run_probe()['counts']['complete'],3)
        self.assertEqual(self.move_units(),receipt)

    def test_source_unit_route_change_rejected(self):
        self.prepare_units();self.next_config['route']['provider']='unreviewed';self.save_config()
        with self.assertRaisesRegex(ValueError,'provider or model'):self.move_units()

    def test_source_unit_budget_reset_rejected(self):
        self.prepare_units();self.next_config['comparisonTrial']['priorExperimentCostUsd']=0
        self.next_config['budgetUsd']=float(Decimal('.75')+Decimal(str(self.next_config['comparisonTrial']['baselineUnknownReservedUsd'])));self.save_config()
        with self.assertRaisesRegex(ValueError,'shared experiment'):self.move_units()

    def test_source_unit_unknown_hold_drop_rejected(self):
        self.prepare_units();self.next_config['carriedUnknownReservedUsd']=0;self.save_config()
        with self.assertRaisesRegex(ValueError,'charges or holds'):self.move_units()

    def test_source_unit_archive_failure_is_replayable(self):
        self.prepare_units()
        with self.assertRaisesRegex(RuntimeError,'commit'):
            self.move_units(lambda:(_ for _ in ()).throw(RuntimeError('commit')))
        receipt=self.move_units();self.assertEqual(self.move_units(),receipt)

    def test_source_unit_scope_commit_failure_is_replayable(self):
        self.prepare_units();commits=[]
        def commit():
            commits.append(True)
            if len(commits)==2:raise RuntimeError('scope commit')
        with self.assertRaisesRegex(RuntimeError,'scope commit'):self.move_units(commit)
        receipt=self.move_units();self.assertEqual(self.move_units(),receipt)

    def test_source_unit_control_bytes_cannot_change(self):
        import json
        self.prepare_units();shard=self.next_input/'shards'/self.shard.name
        selected=[json.loads(line) for line in shard.read_text().splitlines()];selected[0]['focal_ref']+=' corrupted'
        shard.write_text(''.join(q.canonical(j)+'\n' for j in selected));manifest=q.load(self.next_input/'queue-manifest.json');manifest['shards'][0]['sha256']=q.file_hash(shard)
        self.next_config['inputManifestHash']=q.digest(manifest);self.next_config['sourceUnitTrial']['sourceJobsHash']=q.digest({j['job_id']:q.digest(j) for j in selected});q.atomic(self.next_input/'queue-manifest.json',manifest);self.save_config()
        with self.assertRaisesRegex(ValueError,'exact original controls'):self.move_units()

    def test_source_unit_refuses_unsettled_probe_cost(self):
        self.prepare_units();path=next((self.full_runs/self.prior['runId']/'results').glob('*.json'))
        result=q.load(path);result['costUsd']=None;result.pop('resultHash');result['resultHash']=q.digest(result);q.atomic(path,result)
        with self.assertRaisesRegex(ValueError,'known charge'):self.move_units()

    def test_source_unit_dropped_known_charge_rejected(self):
        self.prepare_units();self.next_config['priorRun']['reportedCostUsd']=0;self.save_config()
        with self.assertRaisesRegex(ValueError,'charges or holds'):self.move_units()

    def test_source_unit_model_parameter_change_rejected(self):
        self.prepare_units();self.next_config['parameters']['max_tokens']+=1;self.save_config()
        with self.assertRaisesRegex(ValueError,'provider or model'):self.move_units()

    def test_source_unit_deadline_change_rejected(self):
        self.prepare_units();self.next_config['requestTimeoutSeconds']=181;self.save_config()
        with self.assertRaisesRegex(ValueError,'provider or model'):self.move_units()

    def test_source_unit_same_recipe_rejected(self):
        self.prepare_units();shutil.rmtree(self.next_input/'recipe');shutil.copytree(self.previous_input/'recipe',self.next_input/'recipe')
        self.next_config['recipeFiles']=copy.deepcopy(self.prior['recipeFiles'])
        self.next_config['sourceUnitTrial']['newRecipeHash']=q.digest(self.next_config['recipeFiles']);self.save_config()
        with self.assertRaisesRegex(ValueError,'changed recipe'):self.move_units()

    def corrupt_controls(self, mode):
        import json
        shard=self.next_input/'shards'/self.shard.name
        rows=[json.loads(line) for line in shard.read_text().splitlines()]
        rows[0]=copy.deepcopy(rows[1] if mode=='duplicate' else next(j for j in CAPTURED if j['job_id']=='v18-bavli-001'))
        shard.write_text(''.join(q.canonical(j)+'\n' for j in rows));manifest=q.load(self.next_input/'queue-manifest.json');manifest['shards'][0]['sha256']=q.file_hash(shard)
        self.next_config['inputManifestHash']=q.digest(manifest);self.next_config['sourceUnitTrial']['sourceJobsHash']=q.digest({j['job_id']:q.digest(j) for j in rows})
        q.atomic(self.next_input/'queue-manifest.json',manifest);self.save_config()

    def test_direct_config_check_refuses_wrong_controls(self):
        self.prepare_units();self.corrupt_controls('wrong')
        with self.assertRaisesRegex(ValueError,'exactly controls'):
            q.config_check(self.next_config,q.load(self.next_input/'queue-manifest.json'),self.next_input/'recipe',1)

    def test_direct_config_check_refuses_duplicate_controls(self):
        self.prepare_units();self.corrupt_controls('duplicate')
        with self.assertRaises(ValueError):
            q.config_check(self.next_config,q.load(self.next_input/'queue-manifest.json'),self.next_input/'recipe',1)

    def test_source_unit_refuses_missing_result(self):
        self.prepare_units();next((self.full_runs/self.prior['runId']/'results').glob('*.json')).unlink()
        with self.assertRaisesRegex(ValueError,'interrupted'):self.move_units()

    def test_source_unit_replay_archive_mismatch_rejected(self):
        self.prepare_units();self.move_units()
        path=self.full_runs/'budget-history'/(q.digest(self.prior)+'-'+q.digest(self.next_config)+'.json')
        receipt=q.load(path);receipt['reason']='corrupted archive';q.atomic(path,receipt)
        with self.assertRaisesRegex(ValueError,'archive differs'):self.move_units()

    def test_source_unit_config_hash_mismatch_rejected(self):
        self.prepare_units()
        with self.assertRaisesRegex(ValueError,'config differs'):
            transition(self.full_inputs,self.full_runs,self.prior['runId'],self.next_config['runId'],'0'*64,q.digest(self.next_config),lambda:None)

    def test_recipe_adapters_are_distinct_namespaces(self):
        self.prepare_units()
        self.assertNotEqual(q.recipe_adapter(self.previous_input/'recipe').__name__,q.recipe_adapter(self.next_input/'recipe').__name__)
