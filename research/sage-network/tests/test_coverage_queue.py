"""Fault-test dispatch with real source jobs and explicit transport-only echoes."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'coverage'))
import queue_core as q

FIXTURE = json.loads((Path(__file__).parent/'fixtures/coverage-queue-jobs.json').read_text())
# This adapter only checks transport integrity of actual source text. It does not
# emit people, interpretations or connections, and is never used by the live queue.
ADAPTER = '''import hashlib
import json

def messages(job):
    return [{'role':'user','content':json.dumps(job, ensure_ascii=False, sort_keys=True)}]

def validate(job, answer):
    expected = {'sourceHashes':[s['sha256'] for s in job['sources']]}
    if answer != expected:
        raise ValueError('Transport echo differs from source')
    return expected

def status(answer):
    return 'complete'
'''


class Wire:
    def __init__(self, cost=0.000001, fail=False, malformed=False):
        self.cost, self.fail, self.malformed = cost, fail, malformed
        self.calls = []
        self.remaining = 50.0
        self.lock = threading.Lock()
        self.on_call = None

    def __call__(self, url, key=None, body=None):
        if url.endswith('/key'):
            return {'data': dict(limit=100.0, limit_remaining=self.remaining, usage=50.0, limit_reset=None)}
        if url.endswith('/endpoints'):
            return {'data': {'endpoints': [dict(tag='test-transport', status=0,
                pricing=dict(prompt=0.000001, completion=0.000001),
                supported_parameters=['max_tokens', 'reasoning', 'response_format', 'temperature'],
                max_completion_tokens=32768)]}}
        job = json.loads(body['messages'][0]['content'])
        if self.on_call:
            self.on_call(job)
        with self.lock:
            self.calls.append(job['job_id'])
        if self.fail:
            raise TimeoutError('deliberate transport failure')
        if self.malformed:
            return []
        answer = {'sourceHashes':[s['sha256'] for s in job['sources']]}
        return dict(usage=dict(cost=self.cost), choices=[dict(finish_reason='stop', message=dict(content=json.dumps(answer)))])


class QueueHarness(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.inputs, self.recipe, self.output = [self.root/p for p in ('input', 'recipe', 'output')]
        (self.inputs/'shards').mkdir(parents=True)
        self.recipe.mkdir()
        (self.recipe/'queue_adapter.py').write_text(ADAPTER)
        self.jobs = copy.deepcopy(FIXTURE['jobs'])
        for name in ('source-manifest.json', 'source-verification.json'):
            q.atomic(self.inputs/name, dict(jobs=len(self.jobs)))
        self.shard = self.inputs/'shards/shard-000.jsonl'
        self.shard.write_text(''.join(q.canonical(j)+'\n' for j in self.jobs))
        self.manifest = dict(jobs=len(self.jobs), shards=[dict(file=self.shard.name, jobs=len(self.jobs), sha256=q.file_hash(self.shard))],
            sourceManifestSha256=q.file_hash(self.inputs/'source-manifest.json'),
            sourceVerificationSha256=q.file_hash(self.inputs/'source-verification.json'))
        q.atomic(self.inputs/'queue-manifest.json', self.manifest)
        self.config = dict(runId='transport-test', budgetUsd=1.0, approvedConcurrency=16,
            inputManifestHash=q.digest(self.manifest), recipeFiles=q.recipe_files(self.recipe),
            runnerHash=q.file_hash(Path(q.__file__)),
            providerErrorsHash=q.file_hash(Path(q.__file__).with_name('provider_errors.py')), keyFingerprint=hashlib.sha256(b'test-only').hexdigest(),
            route=dict(provider='test-transport', inputPrice=0.000001, outputPrice=0.000001),
            parameters=dict(model='test-transport', max_tokens=1024, reasoning={'effort':'none'},
                            response_format={'type':'json_object'}, temperature=0))
        self.wire = Wire()
        self.env = patch.dict(os.environ, {'REVIEW_API_KEY':'test-only'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.commits = []

    def commit(self):
        self.commits.append({p.stem for p in (self.output/self.config['runId']/'attempts').glob('*.json')})

    def run_queue(self, concurrency=2, wire=None):
        return q.run(self.config, self.inputs, self.recipe, self.output, self.commit,
                     concurrency=concurrency, request=wire or self.wire)


class QueueTests(QueueHarness):
    def test_attempts_are_committed_before_dispatch_and_resume_spends_nothing(self):
        self.wire.on_call = lambda job: self.assertIn(job['job_id'], set().union(*self.commits))
        report = self.run_queue()
        self.assertEqual(report['counts']['complete'], 8)
        self.assertEqual(report['acceptedFacts'], 0)
        self.assertTrue(report['allStructurallyRead'])
        self.assertEqual(len(self.wire.calls), 8)
        self.run_queue()
        self.assertEqual(len(self.wire.calls), 8)

    def test_interrupted_attempt_is_held_not_retried(self):
        adapter = q.recipe_adapter(self.recipe)
        job = self.jobs[0]
        payload = q.payload_for(job, adapter, self.config)
        reserve = q.reservation(payload, self.config)
        attempt = dict(jobId=job['job_id'], jobHash=q.digest(job), manifestHash=q.digest(self.config),
            requestHash=q.digest(payload), reservedUsd=reserve, startedAt=q.utc())
        q.atomic(self.output/self.config['runId']/'attempts'/(job['job_id']+'.json'), attempt)
        report = self.run_queue()
        self.assertNotIn(job['job_id'], self.wire.calls)
        self.assertEqual(report['counts']['interrupted'], 1)
        self.assertEqual(report['unknownReservedUsd'], reserve)
        again = self.run_queue()
        self.assertEqual(again['unknownReservedUsd'], reserve)
        self.assertEqual(len(self.wire.calls), 7)

    def test_corrupt_saved_answer_does_not_silently_skip(self):
        self.run_queue()
        path = self.output/self.config['runId']/'results'/(self.jobs[0]['job_id']+'.json')
        result = q.load(path)
        result['compiled'] = {}
        result.pop('resultHash')
        result['resultHash'] = q.digest(result)
        q.atomic(path, result)
        with self.assertRaisesRegex(ValueError, 'Saved validation differs'):
            self.run_queue()
        self.assertEqual(len(self.wire.calls), 8)

    def test_bad_late_source_stops_before_any_paid_call(self):
        self.jobs[-1]['sources'][0]['text'] += 'corruption'
        self.shard.write_text(''.join(q.canonical(j)+'\n' for j in self.jobs))
        self.manifest['shards'][0]['sha256'] = q.file_hash(self.shard)
        q.atomic(self.inputs/'queue-manifest.json', self.manifest)
        self.config['inputManifestHash'] = q.digest(self.manifest)
        with self.assertRaisesRegex(ValueError, 'Source hash differs'):
            self.run_queue()
        self.assertEqual(self.wire.calls, [])

    def test_provider_failure_burst_stops_entire_queue_and_resume(self):
        self.wire.fail = True
        report = self.run_queue(concurrency=1)
        self.assertEqual(report['stopReason'], 'provider_failure_burst')
        self.assertEqual(len(self.wire.calls), 4)
        self.assertGreater(report['unknownReservedUsd'], 0)
        with self.assertRaisesRegex(RuntimeError, 'failure burst'):
            self.run_queue()
        self.assertEqual(len(self.wire.calls), 4)

    def test_malformed_provider_response_is_saved_per_item(self):
        self.wire.malformed = True
        report = self.run_queue()
        self.assertEqual(report['counts']['failed'], 8)
        self.assertEqual(report['stopReason'], 'validation_failure_burst')

    def test_run_budget_cannot_reset_with_resume_or_run_rename(self):
        adapter = q.recipe_adapter(self.recipe)
        reserve = q.reservation(q.payload_for(self.jobs[0], adapter, self.config), self.config)
        self.config['budgetUsd'] = reserve * 1.1
        self.wire.cost = reserve / 2
        report = self.run_queue(concurrency=1)
        self.assertEqual(len(self.wire.calls), 1)
        self.assertEqual(report['stopReason'], 'budget_limit')
        self.run_queue(concurrency=1)
        self.assertEqual(len(self.wire.calls), 1)
        self.config['runId'] = 'renamed-queue'
        with self.assertRaisesRegex(ValueError, 'budget belongs to another'):
            self.run_queue()

    def test_unknown_usage_holds_full_reservation(self):
        self.wire.cost = None
        report = self.run_queue()
        self.assertEqual(report['reportedCostUsd'], 0)
        self.assertGreater(report['unknownReservedUsd'], 0)
        again = self.run_queue()
        self.assertEqual(again['unknownReservedUsd'], report['unknownReservedUsd'])

    def test_concurrency_approval_and_frozen_recipe_are_enforced(self):
        with self.assertRaisesRegex(ValueError, 'Concurrency not approved'):
            self.run_queue(concurrency=64)
        self.config['approvedConcurrency'] = 64
        with self.assertRaisesRegex(ValueError, 'quality approval'):
            self.run_queue(concurrency=64)
        self.config['approvedConcurrency'] = 16
        (self.recipe/'queue_adapter.py').write_text(ADAPTER+'\n')
        with self.assertRaisesRegex(ValueError, 'recipe files differ'):
            self.run_queue()
        self.assertEqual(self.wire.calls, [])

    def test_code_budget_and_provider_prices_cannot_drift(self):
        original = copy.deepcopy(self.config)
        self.config['runnerHash'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'queue code differs'):
            self.run_queue()
        self.config = copy.deepcopy(original)
        self.config['budgetUsd'] = 50.01
        with self.assertRaisesRegex(ValueError, 'within 50 USD'):
            self.run_queue()
        self.config = copy.deepcopy(original)
        self.config['route']['inputPrice'] *= 2
        with self.assertRaisesRegex(RuntimeError, 'pricing or capabilities changed'):
            self.run_queue()
        self.assertEqual(self.wire.calls, [])

    def test_freezer_rejects_changed_shard_against_original_capture_receipt(self):
        from freeze_queue import freeze
        q.atomic(self.inputs/'manifest.json', dict(jobs=len(self.jobs), shards={
            self.shard.name: dict(jobs=len(self.jobs), sha256=q.file_hash(self.shard))}))
        q.atomic(self.inputs/'verification.json', dict(jobs=len(self.jobs), failures={},
            segmentsCovered=40, universe=40))
        # Even structurally valid source jobs cannot replace the captured bytes.
        self.shard.write_text(self.shard.read_text() + ' ')
        with self.assertRaisesRegex(ValueError, 'Captured manifest shard hash/count differs'):
            freeze(self.inputs, self.recipe, self.root/'frozen', self.config)

    def test_missing_balance_stops_without_paid_dispatch(self):
        self.wire.remaining = None
        with self.assertRaisesRegex(RuntimeError, 'readable balance'):
            self.run_queue()
        self.assertEqual(self.wire.calls, [])

    def test_reported_overcharge_stops_and_cannot_resume(self):
        self.wire.cost = 0.5
        report = self.run_queue(concurrency=1)
        self.assertEqual(report['stopReason'], 'reported_cost_exceeds_reservation')
        self.assertEqual(len(self.wire.calls), 1)
        with self.assertRaisesRegex(RuntimeError, 'Past reported cost exceeds'):
            self.run_queue()


class ProbeTransitionTests(QueueHarness):
    def prepare_transition(self):
        import shutil
        self.jobs = self.jobs[:3]
        self.shard.write_text(''.join(q.canonical(j)+'\n' for j in self.jobs))
        self.manifest['jobs'] = self.manifest['shards'][0]['jobs'] = 3
        self.manifest['shards'][0]['sha256'] = q.file_hash(self.shard)
        q.atomic(self.inputs/'queue-manifest.json', self.manifest)
        self.config.update(executionMode='probe', approvedConcurrency=3, budgetUsd=.1,
                           inputManifestHash=q.digest(self.manifest))
        self.run_queue()
        all_inputs = self.root/'uploaded'
        old_input = all_inputs/self.config['runId']
        old_input.parent.mkdir()
        shutil.copytree(self.inputs, old_input)
        shutil.copytree(self.recipe, old_input/'recipe')
        q.atomic(old_input/'config.json', self.config)
        following = copy.deepcopy(self.config)
        following['runId'] = 'reviewed-low-reasoning'
        following['parameters']['reasoning'] = {'effort':'low'}
        following['priorRun'] = dict(runId=self.config['runId'], configHash=q.digest(self.config),
                                     reportedCostUsd=.000003, unknownReservedUsd=0)
        next_input = all_inputs/following['runId']
        shutil.copytree(old_input, next_input)
        q.atomic(next_input/'config.json', following)
        return all_inputs, following

    def test_transition_honors_one_slot_approval(self):
        from queue_transition import transition
        inputs, following = self.prepare_transition()
        following['approvedConcurrency'] = 1
        q.atomic(inputs/following['runId']/'config.json', following)
        receipt = transition(inputs, self.output, self.config['runId'], following['runId'],
                             q.digest(self.config), q.digest(following), self.commit)
        self.assertEqual(receipt['nextScope']['configHash'], q.digest(following))

    def test_explicit_transition_preserves_cost_and_is_idempotent(self):
        from queue_transition import transition
        inputs, following = self.prepare_transition()
        args = (inputs, self.output, self.config['runId'], following['runId'],
                q.digest(self.config), q.digest(following), self.commit)
        receipt = transition(*args)
        self.assertEqual(receipt['priorCost']['reportedCostUsd'], .000003)
        self.assertEqual(q.load(self.output/'budget-scope.json'), receipt['nextScope'])
        self.assertEqual(transition(*args), receipt)
        self.assertEqual(len(self.wire.calls), 3)

    def test_transition_rejects_wrong_hash_or_unaccounted_cost(self):
        from queue_transition import transition
        inputs, following = self.prepare_transition()
        with self.assertRaisesRegex(ValueError, 'config hash differs'):
            transition(inputs, self.output, self.config['runId'], following['runId'],
                       '0'*64, q.digest(following), self.commit)
        following['priorRun']['reportedCostUsd'] = 0
        q.atomic(inputs/following['runId']/'config.json', following)
        with self.assertRaisesRegex(ValueError, 'exact prior cost'):
            transition(inputs, self.output, self.config['runId'], following['runId'],
                       q.digest(self.config), q.digest(following), self.commit)
        self.assertEqual(q.load(self.output/'budget-scope.json')['runId'], self.config['runId'])

    def test_explicit_hash_review_allows_new_model_route_and_parameters(self):
        from queue_transition import transition
        inputs, following = self.prepare_transition()
        following['parameters'].update(model='different-transport', max_tokens=8192,
                                        reasoning={'effort':'none'})
        following['route'].update(provider='different-transport-route', outputPrice=.000002)
        q.atomic(inputs/following['runId']/'config.json', following)
        receipt = transition(inputs, self.output, self.config['runId'], following['runId'],
                             q.digest(self.config), q.digest(following), self.commit)
        self.assertEqual(receipt['nextScope']['configHash'], q.digest(following))
        self.assertEqual(receipt['priorCost']['reportedCostUsd'], .000003)
        self.assertEqual(len(self.wire.calls), 3)

    def test_model_comparison_still_rejects_other_key_or_excess_budget(self):
        from queue_transition import transition
        inputs, following = self.prepare_transition()
        for field, value, error in [('keyFingerprint', '0'*64, 'keyFingerprint'),
                                     ('budgetUsd', .11, 'bounded probe'),
                                     ('inputManifestHash', '0'*64, 'inputManifestHash')]:
            corrupt = copy.deepcopy(following)
            corrupt[field] = value
            q.atomic(inputs/following['runId']/'config.json', corrupt)
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, error):
                transition(inputs, self.output, self.config['runId'], following['runId'],
                           q.digest(self.config), q.digest(corrupt), self.commit)
        self.assertEqual(q.load(self.output/'budget-scope.json')['runId'], self.config['runId'])

    def test_reviewed_recipe_change_keeps_prior_validator_isolated(self):
        from queue_transition import transition
        inputs, following = self.prepare_transition()
        recipe = inputs/following['runId']/'recipe'
        # A deliberately incompatible transport validator must not be used to
        # validate the old run's source-hash echoes.
        (recipe/'queue_adapter.py').write_text(ADAPTER.replace(
            "expected = {'sourceHashes':[s['sha256'] for s in job['sources']]}",
            "expected = {'differentTransportFormat': True}"))
        following['recipeFiles'] = q.recipe_files(recipe)
        q.atomic(inputs/following['runId']/'config.json', following)
        old_adapter = q.recipe_adapter(inputs/self.config['runId']/'recipe')
        new_adapter = q.recipe_adapter(recipe)
        self.assertNotEqual(old_adapter.__name__, new_adapter.__name__)
        receipt = transition(inputs, self.output, self.config['runId'], following['runId'],
                             q.digest(self.config), q.digest(following), self.commit)
        self.assertEqual(receipt['priorCost']['reportedCostUsd'], .000003)
        self.assertEqual(len(self.wire.calls), 3)

    def test_unreviewed_recipe_edit_does_not_switch_budget(self):
        from queue_transition import transition
        inputs, following = self.prepare_transition()
        (inputs/following['runId']/'recipe/queue_adapter.py').write_text(ADAPTER+'\n')
        with self.assertRaisesRegex(ValueError, 'recipe'):
            transition(inputs, self.output, self.config['runId'], following['runId'],
                       q.digest(self.config), q.digest(following), self.commit)
        self.assertEqual(q.load(self.output/'budget-scope.json')['runId'], self.config['runId'])

    def test_unknown_cost_carries_and_reduces_next_budget(self):
        from queue_transition import transition
        inputs, following = self.prepare_transition()
        prior_dir = self.output/self.config['runId']
        held = 0
        for job in self.jobs:
            path = prior_dir/'results'/(job['job_id']+'.json')
            result = q.load(path)
            result['costUsd'] = None
            result.pop('resultHash')
            result['resultHash'] = q.digest(result)
            q.atomic(path, result)
            held += q.load(prior_dir/'attempts'/(job['job_id']+'.json'))['reservedUsd']
        from decimal import Decimal
        held = float(sum(Decimal(str(q.load(prior_dir/'attempts'/(j['job_id']+'.json'))['reservedUsd'])) for j in self.jobs))
        following['priorRun'].update(reportedCostUsd=0, unknownReservedUsd=held)
        following['carriedUnknownReservedUsd'] = held
        following['budgetUsd'] = held + .0000001
        q.atomic(inputs/following['runId']/'config.json', following)
        receipt = transition(inputs, self.output, self.config['runId'], following['runId'],
                             q.digest(self.config), q.digest(following), self.commit)
        self.assertEqual(receipt['carriedUnknownReservedUsd'], held)
        progress = q.run(following, inputs/following['runId'], inputs/following['runId']/'recipe',
                         self.output, self.commit, concurrency=3, request=self.wire)
        self.assertEqual(progress['stopReason'], 'budget_limit')
        self.assertEqual(progress['carriedUnknownReservedUsd'], held)
        self.assertEqual(len(self.wire.calls), 3)

    def test_carry_without_archive_cannot_dispatch(self):
        self.config['carriedUnknownReservedUsd'] = .01
        with self.assertRaises((FileNotFoundError, ValueError)):
            self.run_queue()
        self.assertEqual(self.wire.calls, [])

    def test_transition_rejects_unknown_charge(self):
        from queue_transition import transition
        inputs, following = self.prepare_transition()
        path=self.output/self.config['runId']/'results'/(self.jobs[0]['job_id']+'.json')
        result=q.load(path)
        result['costUsd']=None
        result.pop('resultHash')
        result['resultHash']=q.digest(result)
        q.atomic(path,result)
        with self.assertRaisesRegex(ValueError, 'exact prior cost'):
            transition(inputs, self.output, self.config['runId'], following['runId'],
                       q.digest(self.config), q.digest(following), self.commit)


if __name__ == '__main__':
    unittest.main()
