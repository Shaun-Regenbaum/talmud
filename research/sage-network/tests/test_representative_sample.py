"""Real frozen150 sources; inherited harness only echoes source hashes, never history."""
import copy
import gzip
import json
from pathlib import Path
import unittest
import test_reviewed_trial_transition as previous
q, t = previous.q, previous.t
FIXTURE=json.loads(gzip.decompress((Path(__file__).parent/'fixtures/representative-sample-real150.json.gz').read_bytes()))

class SampleTests(previous.ReviewedTrialTests):
    def prepare_sample(self):
        self.prepare_reviewed()
        config=self.next_config
        if 'requestTimeoutSeconds' in self.prior:
            config['requestTimeoutSeconds']=self.prior['requestTimeoutSeconds']
        else:
            config.pop('requestTimeoutSeconds',None)
        self.selection=copy.deepcopy(FIXTURE['selection'])
        shard=self.next_input/'shards/sample.jsonl'
        shard.write_text(''.join(q.canonical(j)+'\n' for j in FIXTURE['jobs']))
        manifest=q.load(self.next_input/'queue-manifest.json')
        manifest.update(jobs=150,shards=[dict(file=shard.name,jobs=150,sha256=q.file_hash(shard))])
        q.atomic(self.next_input/'queue-manifest.json',manifest)
        config['inputManifestHash']=q.digest(manifest)
        config['approvedConcurrency']=4
        config['sampleBudget']=dict(version=t.SAMPLE_VERSION,incrementalCapUsd=6.47,
            priorScope=self.plan['priorScope'],closedExperiment=config.pop('comparisonTrial'),selectionHash=q.digest(self.selection))
        config['budgetUsd']=float(previous.Decimal('6.47')+previous.Decimal(str(config['carriedUnknownReservedUsd'])))
        self.plan.update(version=t.SAMPLE_VERSION,experiment=config['sampleBudget'],
            frozen={k:config.get(k) for k in t.FIELDS},jobs={j['job_id']:q.digest(j) for j in FIXTURE['jobs']})
        adapter=q.recipe_adapter(self.next_input/'recipe')
        self.plan['requestHashes']={j['job_id']:q.digest(q.payload_for(j,adapter,config)) for j in FIXTURE['jobs']}
        q.atomic(self.next_input/'sample-selection.json',self.selection)
        self.save_sample()

    def save_sample(self):
        self.next_config['reviewedTrial']=dict(version=t.SAMPLE_VERSION,planHash=q.digest(self.plan))
        q.atomic(self.next_input/'reviewed-plan.json',self.plan);self.save_config()

    def test_sample_allowance_and_replay(self):
        self.prepare_sample();receipt=self.move_reviewed()
        self.assertEqual(receipt,self.move_reviewed())
        self.assertEqual(receipt['sampleBudget']['incrementalCapUsd'],6.47)
        self.assertEqual(receipt['comparisonTrial'],self.next_config['sampleBudget']['closedExperiment'])
        self.assertEqual(self.run_probe()['counts']['complete'],150)

    def test_sample_cap_cannot_expand(self):
        self.prepare_sample();self.next_config['sampleBudget']['incrementalCapUsd']=7
        self.save_sample()
        with self.assertRaisesRegex(ValueError,'sample allowance'):self.move_reviewed()

    def test_sample_closed_costs_cannot_drop(self):
        self.prepare_sample();self.next_config['sampleBudget']['closedExperiment']['priorExperimentCostUsd']=0
        self.save_sample()
        with self.assertRaisesRegex(ValueError,'closed experiment'):self.move_reviewed()

    def test_sample_carry_cannot_drop(self):
        self.prepare_sample();self.next_config['carriedUnknownReservedUsd']=0;self.next_config['budgetUsd']=6.47;self.save_sample()
        with self.assertRaises(ValueError):self.move_reviewed()

    def test_sample_changed_model_refused_even_with_new_plan(self):
        self.prepare_sample();self.next_config['parameters']['model']='different'
        self.plan['frozen']['parameters']=self.next_config['parameters']
        adapter=q.recipe_adapter(self.next_input/'recipe')
        self.plan['requestHashes']={j['job_id']:q.digest(q.payload_for(j,adapter,self.next_config)) for j in FIXTURE['jobs']}
        self.save_sample()
        with self.assertRaisesRegex(ValueError,'reading settings'):self.move_reviewed()

    def test_sample_selection_role_counts(self):
        self.prepare_sample();self.selection['selection'][0]['sampleRole']='stress'
        self.next_config['sampleBudget']['selectionHash']=q.digest(self.selection)
        q.atomic(self.next_input/'sample-selection.json',self.selection);self.save_sample()
        with self.assertRaisesRegex(ValueError,'sample selection'):self.move_reviewed()

    def test_sample_direct_config_limits(self):
        self.prepare_sample();self.next_config['approvedConcurrency']=5
        with self.assertRaises(ValueError):q.config_check(self.next_config,q.load(self.next_input/'queue-manifest.json'),self.next_input/'recipe',5)
        self.next_config['approvedConcurrency']=4;self.next_config.pop('reviewedTrial')
        with self.assertRaises(ValueError):q.config_check(self.next_config,q.load(self.next_input/'queue-manifest.json'),self.next_input/'recipe',4)

    def test_sample_crash_after_archive(self):
        self.prepare_sample()
        def fail():raise RuntimeError('deliberate commit fault')
        with self.assertRaisesRegex(RuntimeError,'deliberate'):self.move_reviewed(commit=fail)
        receipt=self.move_reviewed();self.assertEqual(receipt,self.move_reviewed())

    def test_sample_archive_corruption(self):
        self.prepare_sample();self.move_reviewed()
        path=self.full_runs/'budget-history'/(q.digest(self.prior)+'-'+q.digest(self.next_config)+'.json')
        receipt=q.load(path);receipt['sampleBudget']['incrementalCapUsd']=99;q.atomic(path,receipt)
        with self.assertRaisesRegex(ValueError,'archive differs'):self.move_reviewed()

if __name__=='__main__':unittest.main()
