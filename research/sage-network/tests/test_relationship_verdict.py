"""Verdicts on existing claims: real source jobs, hand answers and the frozen queue interface.

The fixture holds 16 real passages from the live revision with one claim each. Its answers are
one reader's hand verdicts (manual controls, not gold), so these tests check the request, the
validator and what may be passed on. They do not measure a model's accuracy.
"""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from relationship_verdict import freeze as F, request as R, validate as V

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/relationship-verdict-real.json').read_text())
CASES = {c['controlId']: c for c in FIXTURE['cases']}


def case(control):
    c = CASES[control]
    return copy.deepcopy(c['job']), copy.deepcopy(c['answer'])


def compiled(control, answer=None):
    job, hand = case(control)
    return V.check(job, answer or hand)['claims'][0]


class Jobs(unittest.TestCase):
    def test_every_real_job_passes_its_own_checks(self):
        for c in FIXTURE['cases']:
            V.check_job(c['job'])

    def test_a_changed_source_text_is_refused(self):
        job, _ = case('mc-03')
        job['sources'][1]['text'] += ' '
        with self.assertRaises(V.Invalid):
            V.check_job(job)

    def test_every_position_of_a_quote_must_be_listed(self):
        job, _ = case('mc-03')
        job['claims'][0]['spans'] = job['claims'][0]['spans'] + job['claims'][0]['spans']
        with self.assertRaises(V.Invalid):
            V.check_job(job)
        job, _ = case('mc-03')
        job['claims'][0]['spans'][0][0] += 1
        with self.assertRaises(V.Invalid):
            V.check_job(job)


class Request(unittest.TestCase):
    def test_model_sees_text_mentions_and_claims_only(self):
        for c in FIXTURE['cases']:
            req = R.build_request(c['job'])
            self.assertEqual([m['role'] for m in req['messages']], ['system', 'user'])
            body = json.loads(req['messages'][1]['content'])
            self.assertEqual(set(body['job']), set(R.MODEL_VIEW))
            self.assertNotIn('binding', req['messages'][1]['content'])
            for person in body['job']['people']:
                self.assertEqual(set(person), {'id', 'mention', 'source_id', 'spans'})
            self.assertEqual(req, R.build_request(c['job']))

    def test_original_labels_stay_out_of_the_request(self):
        # mc-04's passage has a person labelled 'The hypothetical slaughterer' by the extraction; only the mention words are sent.
        req = R.build_request(CASES['mc-04']['job'])['messages'][1]['content']
        self.assertNotIn('hypothetical', json.loads(req)['job']['people'].__repr__())


class HandAnswers(unittest.TestCase):
    def test_all_hand_answers_validate(self):
        for c in FIXTURE['cases']:
            out = V.check(c['job'], c['answer'])
            self.assertEqual(out['job_id'], c['job']['job_id'])
            self.assertTrue(all(x['proposal_only'] for x in out['claims']))

    def test_a_correct_father_link_is_passed_on(self):
        x = compiled('mc-14')
        self.assertTrue(x['original']['endorsed'])
        self.assertIsNone(x['general_connection'])
        self.assertEqual(x['corrections'], [])

    def test_son_of_david_keeps_the_family_tie_but_not_the_child_link(self):
        x = compiled('mc-15')
        self.assertFalse(x['original']['endorsed'])
        self.assertIn('family_degree_descent', x['original']['blocked_by'])
        self.assertEqual(x['general_connection'], {'people': x['pair']['people'], 'kind': 'family', 'directed': False})
        self.assertEqual([(c['type'], c['degree'], c['status'], c['accepted']) for c in x['corrections']],
                         [('family_degree', 'descent', 'proposal', False)])

    def test_a_real_debate_with_the_wrong_kind_keeps_only_the_pair(self):
        x = compiled('mc-07')
        self.assertFalse(x['original']['endorsed'])
        self.assertEqual(x['pair']['connection'], 'retained')
        self.assertEqual(x['general_connection']['kind'], 'direct_interaction')
        self.assertEqual(x['corrections'][0]['type'], 'connection_kind')

    def test_unsupported_and_imagined_ties_pass_nothing_on(self):
        for control in ('mc-04', 'mc-08', 'mc-12'):
            x = compiled(control)
            self.assertEqual(x['pair']['connection'], 'not_retained', control)
            self.assertFalse(x['original']['endorsed'], control)
            self.assertIsNone(x['general_connection'], control)
            self.assertEqual(x['corrections'], [], control)

    def test_an_uncertain_claim_keeps_only_the_general_tie(self):
        x = compiled('mc-01')
        self.assertFalse(x['original']['endorsed'])
        self.assertEqual(x['general_connection']['kind'], 'family')

    def test_responses_and_transmissions_stay_distinct(self):
        self.assertEqual(compiled('mc-11')['pair']['kind'], 'response_to_teaching')
        self.assertEqual(compiled('mc-16')['pair']['kind'], 'response_to_teaching')
        self.assertEqual(compiled('mc-10')['pair']['kind'], 'teaching_transmission')
        self.assertTrue(compiled('mc-13')['original']['endorsed'])

    def test_hand_answers_raise_no_review_flags(self):
        for control in CASES:
            self.assertEqual(compiled(control)['audit_flags'], [], control)


class ReversedDirection(unittest.TestCase):
    # No live parent link was found written the wrong way round, so this answer is made up to test the rule.
    # It is not a reading of the text: the real link in mc-14 is correct as written.
    def test_a_reversed_direction_is_only_a_proposal_between_the_same_people(self):
        job, hand = case('mc-14')
        hand['verdicts'][0].update(claim_as_written='contradicted', direction='reversed')
        x = compiled('mc-14', hand)
        claim = job['claims'][0]
        self.assertFalse(x['original']['endorsed'])
        self.assertEqual(x['general_connection']['directed'], False)
        self.assertEqual([(c['type'], c['from'], c['to'], c['accepted']) for c in x['corrections']],
                         [('reverse_direction', claim['to'], claim['from'], False)])


class Rejections(unittest.TestCase):
    def broken(self, change):
        job, answer = case('mc-03')
        change(answer)
        with self.assertRaises(V.Invalid):
            V.check(job, answer)

    def test_schema_and_id_errors_are_refused(self):
        self.broken(lambda a: a['verdicts'].clear())
        self.broken(lambda a: a['verdicts'].append(copy.deepcopy(a['verdicts'][0])))
        self.broken(lambda a: a['verdicts'][0].update(claim_id='b000-p0/s0'))
        self.broken(lambda a: a.update(job_id='mc-04'))
        self.broken(lambda a: a.update(extra=1))
        self.broken(lambda a: a['verdicts'][0].update(supported_kind='meeting'))
        self.broken(lambda a: a['verdicts'][0].update(new_person='p9'))
        self.broken(lambda a: a['verdicts'][0].update(reason=' '))
        self.broken(lambda a: a['verdicts'][0]['uncertain_detail'].append({'aspect': 'era', 'status': 'unclear', 'note': ''}))


class Prose(unittest.TestCase):
    def flags(self, reason):
        job, answer = case('mc-03')
        answer['verdicts'][0]['reason'] = reason
        return V.check(job, answer)['claims'][0]['audit_flags']

    def test_numbers_hyphens_and_long_quotes_are_not_rejected(self):
        self.assertEqual(self.flags('Two well-known sages; 3 lines; the question is put face-to-face.'), [])
        self.assertEqual(self.flags('He asks: ר\' אבון בעא קומי רבי מנא עבדי שניות מהו'), [])

    def test_a_quote_missing_from_the_source_is_flagged_for_review(self):
        self.assertEqual(self.flags('He says אמר רבי יוחנן לריש לקיש here.'), ['quotation_not_in_source'])

    def test_outside_eras_are_flagged_for_review(self):
        self.assertEqual(self.flags('Both are third generation amoraim.'), ['mentions_outside_era_or_identity'])


class Freeze(unittest.TestCase):
    def test_frozen_directory_is_replayable_and_loads_like_the_queue(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            jobs = tmp / 'jobs.jsonl'
            jobs.write_text(''.join(json.dumps(c['job'], ensure_ascii=False) + '\n' for c in FIXTURE['cases']))
            first, second = F.freeze(jobs, tmp / 'a'), F.freeze(jobs, tmp / 'b')
            self.assertEqual(first, second)
            files = lambda d: {str(p.relative_to(d)): p.read_bytes() for p in sorted(d.rglob('*')) if p.is_file()}
            self.assertEqual(files(tmp / 'a'), files(tmp / 'b'))
            with self.assertRaises(ValueError):
                F.freeze(jobs, tmp / 'a')
            manifest = json.loads((tmp / 'a/queue-manifest.json').read_text())
            shard = tmp / 'a/shards' / manifest['shards'][0]['file']
            self.assertEqual(manifest['shards'][0]['sha256'], F.file_hash(shard))
            # Load the adapter the way coverage/queue_core.recipe_adapter does.
            recipe = tmp / 'a/recipe'
            spec = importlib.util.spec_from_file_location('relationship_verdict_recipe_test', recipe / 'queue_adapter.py',
                                                          submodule_search_locations=[str(recipe)])
            adapter = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = adapter
            spec.loader.exec_module(adapter)
            for line, c in zip(shard.read_text().splitlines(), FIXTURE['cases']):
                job = json.loads(line)
                self.assertEqual(adapter.messages(job), R.build_request(c['job'])['messages'])
                self.assertEqual(adapter.validate(job, c['answer']), V.check(c['job'], c['answer']))
                self.assertEqual(adapter.status(c['answer']), 'complete')


if __name__ == '__main__':
    unittest.main()
