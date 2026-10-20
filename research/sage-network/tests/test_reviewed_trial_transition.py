"""Real captured controls with transport-only fixtures; no invented historical answers."""
import copy
import shutil
from decimal import Decimal
from pathlib import Path
from test_unit_trial_transition import UnitTrialTests
import queue_core as q
import reviewed_trial_transition as t


class ReviewedTrialTests(UnitTrialTests):
    def prepare_reviewed(self):
        self.prepare_units();self.move_units();self.run_probe()
        self.prior,self.previous_input=self.next_config,self.next_input
        following=copy.deepcopy(self.prior);following.pop('sourceUnitTrial')
        results=[q.load(p) for p in (self.full_runs/self.prior['runId']/'results').glob('*.json')]
        known=sum((Decimal(str(r['costUsd'])) for r in results),Decimal(0))
        following.update(runId='reviewed-small',requestTimeoutSeconds=600,
            reviewedTrialTransitionHash=q.file_hash(Path(q.__file__).with_name('reviewed_trial_transition.py')),
            priorRun=dict(runId=self.prior['runId'],configHash=q.digest(self.prior),reportedCostUsd=float(known),unknownReservedUsd=0.))
        following['comparisonTrial']['priorExperimentCostUsd']=float(Decimal(str(self.prior['comparisonTrial']['priorExperimentCostUsd']))+known)
        following['budgetUsd']=float(Decimal(str(self.prior['budgetUsd']))-known)
        new=self.full_inputs/following['runId'];shutil.copytree(self.previous_input,new)
        self.next_input,self.next_config=new,following
        self.plan=dict(version=t.VERSION,priorScope=dict(runId=self.prior['runId'],configHash=q.digest(self.prior)),nextRun=following['runId'],
            experiment={k:v for k,v in following['comparisonTrial'].items() if k!='priorExperimentCostUsd'},
            frozen={k:following.get(k) for k in t.FIELDS},jobs={j['job_id']:q.digest(j) for j in q.jobs(new,q.load(new/'queue-manifest.json'))},requestHashes={},reason='Explicit offline transport test of a longer reviewed deadline')
        adapter=q.recipe_adapter(new/'recipe')
        self.plan['requestHashes']={j['job_id']:q.digest(q.payload_for(j,adapter,following)) for j in q.jobs(new,q.load(new/'queue-manifest.json'))}
        self.save_plan()

    def save_plan(self):
        self.next_config['reviewedTrial']=dict(version=t.VERSION,planHash=q.digest(self.plan))
        q.atomic(self.next_input/'reviewed-plan.json',self.plan);self.save_config()

    def move_reviewed(self,commit=lambda:None,plan_hash=None):
        return t.transition(self.full_inputs,self.full_runs,self.prior['runId'],self.next_config['runId'],q.digest(self.prior),q.digest(self.next_config),plan_hash or q.digest(self.plan),commit)

    def test_reviewed_deadline_and_replay(self):
        self.prepare_reviewed();receipt=self.move_reviewed();self.assertEqual(receipt,self.move_reviewed())
        self.assertEqual(self.run_probe()['counts']['complete'],3)

    def test_reviewed_plan_hash_required(self):
        self.prepare_reviewed()
        with self.assertRaisesRegex(ValueError,'plan differs'):self.move_reviewed(plan_hash='0'*64)

    def test_reviewed_plan_does_not_accept_unlisted_jobs(self):
        self.prepare_reviewed();self.plan['jobs'].pop(next(iter(self.plan['jobs'])));self.save_plan()
        with self.assertRaisesRegex(ValueError,'source jobs'):self.move_reviewed()

    def test_reviewed_request_hash_binding(self):
        self.prepare_reviewed();self.plan['requestHashes'][next(iter(self.plan['requestHashes']))]='0'*64;self.save_plan()
        with self.assertRaisesRegex(ValueError,'request payload'):self.move_reviewed()

    def test_reviewed_route_drift(self):
        self.prepare_reviewed();self.next_config['route']=dict(self.next_config['route'],provider='changed');self.save_config()
        with self.assertRaisesRegex(ValueError,'plan differs'):self.move_reviewed()

    def test_reviewed_recipe_drift(self):
        self.prepare_reviewed();p=self.next_input/'recipe/queue_adapter.py';p.write_text(p.read_text()+'\n# Deliberate corruption.\n')
        with self.assertRaises(ValueError):self.move_reviewed()

    def test_reviewed_budget_reset(self):
        self.prepare_reviewed();self.next_config['comparisonTrial']['priorExperimentCostUsd']=0;self.next_config['budgetUsd']=float(Decimal('.75')+Decimal(str(self.next_config['comparisonTrial']['baselineUnknownReservedUsd'])));self.save_config()
        with self.assertRaisesRegex(ValueError,'reset the shared'):self.move_reviewed()

    def test_reviewed_dropped_hold(self):
        self.prepare_reviewed();self.next_config['carriedUnknownReservedUsd']=0;self.save_config()
        with self.assertRaisesRegex(ValueError,'dropped costs'):self.move_reviewed()

    def test_reviewed_missing_result(self):
        self.prepare_reviewed();next((self.full_runs/self.prior['runId']/'results').glob('*.json')).unlink()
        with self.assertRaisesRegex(ValueError,'interrupted'):self.move_reviewed()

    def test_reviewed_active_prior(self):
        self.prepare_reviewed();p=self.full_runs/self.prior['runId']/'progress.json';progress=q.load(p);progress['inFlight']=1;q.atomic(p,progress)
        with self.assertRaisesRegex(ValueError,'terminal'):self.move_reviewed()

    def test_reviewed_archive_crash_replay(self):
        self.prepare_reviewed()
        with self.assertRaisesRegex(RuntimeError,'commit'):self.move_reviewed(lambda:(_ for _ in ()).throw(RuntimeError('commit')))
        receipt=self.move_reviewed();self.assertEqual(receipt,self.move_reviewed())

    def test_reviewed_scope_crash_replay(self):
        self.prepare_reviewed();calls=[]
        def commit():
            calls.append(True)
            if len(calls)==2:raise RuntimeError('scope commit')
        with self.assertRaisesRegex(RuntimeError,'scope commit'):self.move_reviewed(commit)
        self.assertEqual(self.move_reviewed(),self.move_reviewed())

    def test_reviewed_scope_cas(self):
        self.prepare_reviewed()
        def commit():q.atomic(self.full_runs/'budget-scope.json',dict(runId='different',configHash='0'*64))
        with self.assertRaisesRegex(ValueError,'scope changed'):self.move_reviewed(commit)

    def test_reviewed_archive_mismatch(self):
        self.prepare_reviewed();self.move_reviewed();p=self.full_runs/'budget-history'/(q.digest(self.prior)+'-'+q.digest(self.next_config)+'.json');r=q.load(p);r['reason']='altered';q.atomic(p,r)
        with self.assertRaisesRegex(ValueError,'archive differs'):self.move_reviewed()

    def test_reviewed_unknown_charge_is_retained(self):
        self.prepare_reviewed();p=next((self.full_runs/self.prior['runId']/'results').glob('*.json'));r=q.load(p)
        old=Decimal(str(r['costUsd']));r['costUsd']=None;r.pop('resultHash');r['resultHash']=q.digest(r);q.atomic(p,r)
        held=Decimal(str(q.load(self.full_runs/self.prior['runId']/'attempts'/p.name)['reservedUsd']))
        self.next_config['priorRun']['reportedCostUsd']=float(Decimal(str(self.next_config['priorRun']['reportedCostUsd']))-old)
        self.next_config['priorRun']['unknownReservedUsd']=float(held)
        self.next_config['carriedUnknownReservedUsd']=float(Decimal(str(self.prior['carriedUnknownReservedUsd']))+held)
        self.next_config['comparisonTrial']['priorExperimentCostUsd']=float(Decimal(str(self.next_config['comparisonTrial']['priorExperimentCostUsd']))-old)
        self.next_config['budgetUsd']=float(Decimal(str(self.next_config['budgetUsd']))+old);self.save_config()
        self.assertEqual(self.move_reviewed()['carriedUnknownReservedUsd'],self.next_config['carriedUnknownReservedUsd'])

    def test_reviewed_29_exact_jobs_fit_explicit_plan(self):
        self.prepare_reviewed();selected=[j for j in self.origin_jobs if j['job_id']!='v18-bavli-061'];self.assertEqual(len(selected),29)
        shard=self.next_input/'shards'/self.shard.name;shard.write_text(''.join(q.canonical(j)+'\n' for j in selected))
        manifest=q.load(self.next_input/'queue-manifest.json');manifest['jobs']=manifest['shards'][0]['jobs']=29;manifest['shards'][0]['sha256']=q.file_hash(shard)
        self.next_config['inputManifestHash']=q.digest(manifest);q.atomic(self.next_input/'queue-manifest.json',manifest)
        self.next_config['approvedConcurrency']=8;self.plan['frozen']['approvedConcurrency']=8
        self.plan['jobs']={j['job_id']:q.digest(j) for j in selected};adapter=q.recipe_adapter(self.next_input/'recipe')
        self.plan['requestHashes']={j['job_id']:q.digest(q.payload_for(j,adapter,self.next_config)) for j in selected};self.save_plan()
        self.assertEqual(self.move_reviewed()['reviewedPlanHash'],q.digest(self.plan))

    def test_reviewed_previous_ledger_corruption_rejected(self):
        self.prepare_reviewed();path=self.full_runs/'budget-history'/(self.prior['priorRun']['configHash']+'-'+q.digest(self.prior)+'.json')
        receipt=q.load(path);receipt['evidence']=[];receipt.pop('transitionHash');receipt['transitionHash']=q.digest(receipt);q.atomic(path,receipt)
        with self.assertRaisesRegex(ValueError,'history dropped'):self.move_reviewed()

    def test_reviewed_source_bytes_drift(self):
        self.prepare_reviewed();shard=self.next_input/'shards'/self.shard.name
        shard.write_text(shard.read_text().replace('v18-bavli-005','v18-bavli-999'))
        manifest=q.load(self.next_input/'queue-manifest.json');manifest['shards'][0]['sha256']=q.file_hash(shard)
        self.next_config['inputManifestHash']=q.digest(manifest);q.atomic(self.next_input/'queue-manifest.json',manifest);self.save_config()
        with self.assertRaisesRegex(ValueError,'source jobs'):self.move_reviewed()

    def test_reviewed_unfinished_never_started_rejected(self):
        self.prepare_reviewed();p=next((self.full_runs/self.prior['runId']/'results').glob('*.json'));p.unlink();(self.full_runs/self.prior['runId']/'attempts'/p.name).unlink()
        with self.assertRaisesRegex(ValueError,'unfinished jobs'):self.move_reviewed()

    def test_reviewed_deadline_without_plan_rejected(self):
        self.prepare_reviewed();config=copy.deepcopy(self.prior);config['requestTimeoutSeconds']=600
        with self.assertRaisesRegex(ValueError,'timeout'):
            q.config_check(config,q.load(self.previous_input/'queue-manifest.json'),self.previous_input/'recipe',1)

    def test_reviewed_actual_dispatch_payload_must_match_plan(self):
        import inspect
        from unittest.mock import patch
        self.prepare_reviewed();self.move_reviewed();original=q.payload_for
        def changed(job,adapter,config):
            payload=original(job,adapter,config)
            if inspect.currentframe().f_back.f_code.co_name=='run':
                payload=copy.deepcopy(payload);payload['messages'][0]['content']+=' deliberate transport corruption'
            return payload
        with patch.object(q,'payload_for',changed):
            with self.assertRaisesRegex(ValueError,'Dispatch payload differs'):self.run_probe()
        self.assertEqual(list((self.full_runs/self.next_config['runId']/'attempts').glob('*.json')),[])
