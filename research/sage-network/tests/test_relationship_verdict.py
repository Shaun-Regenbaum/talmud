"""Verdicts on existing claims: real source jobs, hand answers, fault cases and the frozen queue interface.

The fixture holds 16 real passages from the live revision with one claim each. Its answers are
one reader's hand verdicts (manual controls, not gold), so these tests check the request, the
validator, what may be passed on and the scorer. They do not measure a model's accuracy. Answers
changed inside a test are made up to exercise one rule; they are not readings of the text.
"""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from relationship_verdict import freeze as F, request as R, score as S, validate as V

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/relationship-verdict-real.json').read_text())
CASES = {c['controlId']: c for c in FIXTURE['cases']}


def case(control):
    c = CASES[control]
    return copy.deepcopy(c['job']), copy.deepcopy(c['answer'])


def compiled(control, change=None):
    job, answer = case(control)
    if change:
        answer['verdicts'][0].update(change)
    return V.check(job, answer)['claims'][0]


class Jobs(unittest.TestCase):
    def test_every_real_job_passes_its_own_checks(self):
        for c in FIXTURE['cases']:
            V.check_job(c['job'])

    def test_a_changed_source_text_is_refused(self):
        job, _ = case('mc-03')
        job['sources'][1]['text'] += ' '
        with self.assertRaises(V.Invalid):
            V.check_job(job)

    def bad_spans(self, control, mutate, person=False):
        job, _ = case(control)
        target = next(p for p in job['people'] if p['spans']) if person else job['claims'][0]
        mutate(target)
        with self.assertRaises(V.Invalid):
            V.check_job(job)

    def test_positions_must_be_exactly_every_occurrence(self):
        for person in (False, True):
            self.bad_spans('mc-03', lambda t: t['spans'].append(list(t['spans'][0])), person)       # repeated
            self.bad_spans('mc-03', lambda t: t['spans'].clear(), person)                            # none listed
            self.bad_spans('mc-03', lambda t: t['spans'][0].__setitem__(0, t['spans'][0][0] + 1), person)
            self.bad_spans('mc-03', lambda t: t['spans'][0].__setitem__(0, -1), person)             # negative
            self.bad_spans('mc-03', lambda t: t['spans'][0].__setitem__(1, 10 ** 6), person)        # past the end
            self.bad_spans('mc-03', lambda t: t['spans'][0].__setitem__(0, 1.0), person)            # not an integer

    def test_a_quote_that_occurs_twice_needs_both_positions_in_order(self):
        job, _ = case('mc-02')
        claim = job['claims'][0]
        text = next(s['text'] for s in job['sources'] if s['source_id'] == claim['source_id'])
        self.assertEqual(claim['spans'], V.occurrences(text, claim['quote']))
        reordered = copy.deepcopy(job)
        reordered['claims'][0]['spans'] = list(reversed(claim['spans'])) if len(claim['spans']) > 1 else claim['spans'] * 2
        with self.assertRaises(V.Invalid):
            V.check_job(reordered)

    def test_an_unplaced_mention_has_no_source_and_no_positions(self):
        job, _ = case('mc-03')
        person = job['people'][0]
        person['source_id'] = None
        with self.assertRaises(V.Invalid):
            V.check_job(job)
        person['spans'] = []
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
        people = json.loads(R.build_request(CASES['mc-04']['job'])['messages'][1]['content'])['job']['people']
        self.assertNotIn('hypothetical', json.dumps(people))


class HandAnswers(unittest.TestCase):
    def test_all_hand_answers_validate_without_flags(self):
        for control, c in CASES.items():
            out = V.check(c['job'], c['answer'])
            self.assertTrue(all(x['proposal_only'] for x in out['claims']))
            self.assertEqual(out['claims'][0]['audit_flags'], [], control)

    def test_a_correct_father_link_is_passed_on(self):
        x = compiled('mc-14')
        self.assertTrue(x['original']['endorsed'])
        self.assertIsNone(x['general_connection'])
        self.assertEqual(x['corrections'], [])

    def test_son_of_david_keeps_the_family_tie_but_not_the_child_link(self):
        x = compiled('mc-15')
        claim = CASES['mc-15']['job']['claims'][0]
        self.assertFalse(x['original']['endorsed'])
        self.assertEqual(x['general_connection'], {'people': x['pair']['people'], 'kind': 'family', 'directed': False})
        self.assertEqual(x['corrections'], [{'type': 'family_degree', 'relation': 'descendant_of', 'from': claim['from'],
                                             'to': claim['to'], 'degree': 'descent', 'status': 'proposal',
                                             'accepted': False, 'publishable': False}])

    def test_an_explicit_dispute_is_kept_as_an_intellectual_tie(self):
        x = compiled('mc-12')
        self.assertEqual((x['pair']['connection'], x['pair']['kind']), ('retained', 'intellectual_disagreement'))
        self.assertTrue(x['original']['endorsed'])

    def test_engagement_is_kept_when_the_objection_is_denied(self):
        x = compiled('mc-07')
        self.assertFalse(x['original']['endorsed'])
        self.assertEqual(x['general_connection']['kind'], 'response_to_teaching')
        self.assertEqual(x['corrections'][0]['type'], 'connection_kind')

    def test_unsupported_and_imagined_ties_pass_nothing_on(self):
        for control in ('mc-04', 'mc-08'):
            x = compiled(control)
            self.assertEqual(x['pair']['connection'], 'not_retained', control)
            self.assertFalse(x['original']['endorsed'], control)
            self.assertIsNone(x['general_connection'], control)
            self.assertEqual(x['corrections'], [], control)

    def test_a_tentative_patronymic_keeps_only_the_general_tie(self):
        x = compiled('mc-01')
        self.assertFalse(x['original']['endorsed'])
        self.assertEqual(x['general_connection']['kind'], 'family')

    def test_responses_and_transmissions_stay_distinct(self):
        self.assertEqual(compiled('mc-11')['pair']['kind'], 'response_to_teaching')
        self.assertEqual(compiled('mc-16')['pair']['kind'], 'response_to_teaching')
        self.assertEqual(compiled('mc-10')['pair']['kind'], 'teaching_transmission')
        self.assertTrue(compiled('mc-13')['original']['endorsed'])


class Contradictions(unittest.TestCase):
    """Made-up answers on real claims. A contradiction withholds the detailed claim but keeps the pair."""

    def withheld(self, control, change, flag):
        x = compiled(control, change)
        self.assertFalse(x['original']['endorsed'], change)
        self.assertIn(flag, x['original']['blocked_by'])
        self.assertIn(flag, x['audit_flags'])
        self.assertEqual(x['corrections'], [])
        return x

    def test_a_parent_claim_without_a_degree_is_not_passed_on(self):
        x = self.withheld('mc-14', {'family_degree': 'not_applicable'}, 'parent_claim_without_family_degree')
        self.assertEqual(x['general_connection']['kind'], 'family')

    def test_a_degree_on_a_non_family_claim_is_not_passed_on(self):
        self.withheld('mc-13', {'family_degree': 'as_written'}, 'family_degree_on_other_claim')

    def test_kind_contradictions_are_not_passed_on(self):
        self.withheld('mc-14', {'supported_kind': 'direct_interaction', 'verdict': 'ok'}, 'family_claim_supported_as_other_kind')
        self.withheld('mc-13', {'supported_kind': 'teaching_transmission', 'verdict': 'teach'}, 'speech_claim_supported_as_other_kind')
        self.withheld('mc-10', {'supported_kind': 'family', 'verdict': 'fam'}, 'other_claim_supported_as_family')

    def test_a_supported_claim_with_a_reversed_direction_is_not_passed_on(self):
        x = self.withheld('mc-14', {'direction': 'reversed'}, 'supported_claim_with_reversed_direction')
        self.assertEqual(x['pair']['connection'], 'retained')

    def test_an_old_code_that_drops_the_tie_withholds_it(self):
        self.withheld('mc-13', {'verdict': 'bad'}, 'legacy_verdict_disagrees_with_pair')


class Corrections(unittest.TestCase):
    """Made-up answers on real claims: corrections stay between the same two people, as one coherent proposal."""

    def test_a_reversed_direction_is_only_a_proposal(self):
        claim = CASES['mc-14']['job']['claims'][0]
        x = compiled('mc-14', {'claim_as_written': 'contradicted', 'direction': 'reversed'})
        self.assertFalse(x['original']['endorsed'])
        self.assertEqual(x['general_connection']['directed'], False)
        self.assertEqual(x['corrections'], [{'type': 'reverse_direction', 'relation': claim['kind'], 'from': claim['to'],
                                             'to': claim['from'], 'status': 'proposal', 'accepted': False, 'publishable': False}])

    def test_reversed_descent_is_one_proposal_with_both_changes(self):
        claim = CASES['mc-15']['job']['claims'][0]
        x = compiled('mc-15', {'direction': 'reversed'})
        self.assertEqual(x['corrections'], [{'type': 'reversed_descent', 'relation': 'descendant_of', 'from': claim['to'],
                                             'to': claim['from'], 'degree': 'descent', 'status': 'proposal',
                                             'accepted': False, 'publishable': False}])

    def test_an_undetermined_direction_gives_no_proposal(self):
        x = compiled('mc-14', {'claim_as_written': 'uncertain', 'direction': 'undetermined'})
        self.assertFalse(x['original']['endorsed'])
        self.assertEqual(x['corrections'], [])


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


class Scorer(unittest.TestCase):
    def setUp(self):
        self.jobs = {c['job']['job_id']: c['job'] for c in FIXTURE['cases']}
        self.reference = {c['answer']['verdicts'][0]['claim_id']: c['answer']['verdicts'][0] for c in FIXTURE['cases']}
        self.results = {c['job']['job_id']: {'jobId': c['job']['job_id'], 'status': 'complete', 'answer': c['answer'],
                                             'compiled': V.check(c['job'], c['answer'])} for c in FIXTURE['cases']}

    def test_the_hand_answers_agree_with_themselves(self):
        report = S.score(self.jobs, self.results, self.reference, 'self-check')
        self.assertFalse(report['referenceIsGold'])
        self.assertEqual(report['compared'], 16)
        self.assertEqual(report['mismatches'], [])
        self.assertTrue(all(v == {'matches': 16, 'compared': 16} for v in report['exactMatches'].values()))

    def test_mismatches_flags_and_failures_are_kept_in_full(self):
        # A made-up wrong answer and a made-up failed request, to show what the report keeps.
        answer = copy.deepcopy(self.results['mc-13']['answer'])
        answer['verdicts'][0].update(supported_kind='teaching_transmission', verdict='teach', reason='A made-up answer.')
        self.results['mc-13'] = {'jobId': 'mc-13', 'status': 'complete', 'answer': answer}
        self.results['mc-14'] = {'jobId': 'mc-14', 'status': 'failed', 'errorKind': 'validation', 'error': 'claim_ids: made up'}
        report = S.score(self.jobs, self.results, self.reference, 'fault-check')
        self.assertEqual(report['compared'], 15)
        self.assertEqual(report['rawFailures'], [{'claimId': CASES['mc-14']['answer']['verdicts'][0]['claim_id'],
                                                  'jobId': 'mc-14', 'failure': 'failed', 'errorKind': 'validation',
                                                  'error': 'claim_ids: made up'}])
        fields = sorted(m['field'] for m in report['mismatches'])
        self.assertEqual(fields, ['original_endorsed', 'supported_kind', 'verdict'])
        self.assertEqual(report['mismatches'][0]['answerReason'], 'A made-up answer.')
        self.assertEqual(report['auditFlags'][0]['flags'], ['speech_claim_supported_as_other_kind'])


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
            self.assertEqual(manifest['sourceManifestSha256'], F.file_hash(tmp / 'a/source-manifest.json'))
            self.assertEqual(manifest['sourceVerificationSha256'], F.file_hash(tmp / 'a/source-verification.json'))
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
