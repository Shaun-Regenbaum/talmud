"""Checks against three real source readings and deliberately corrupted copies."""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from compact_source_v2.contract import RELATIONS, SCHEMA, VERSION
from compact_source_v2.request import build_request
from compact_source_v2.validate import Invalid, check, check_saved, digest, sha

# Reuse real captured passages and readings. Only the v2 representation changes.
FIXTURE = json.loads((ROOT / 'tests/fixtures/compact-source-real.json').read_text())
for case in FIXTURE['cases']:
    case['reading']['schema_version'] = VERSION
    for relationship in case['reading']['relationships']:
        relationship.pop('category')
        relationship.pop('direction')


class CompactSourceV2Tests(unittest.TestCase):
    def setUp(self):
        self.cases = copy.deepcopy(FIXTURE['cases'])
        self.job, self.answer = copy.deepcopy(self.cases[0]['job']), copy.deepcopy(self.cases[0]['reading'])

    def rejects(self, code, answer=None, job=None):
        with self.assertRaises(Invalid) as raised:
            check(job or self.job, answer or self.answer)
        self.assertEqual(raised.exception.code, code)

    def test_three_real_readings_preserve_named_people_and_local_family_direction(self):
        for case, named in zip(self.cases, [5, 2, 3]):
            compiled = check(case['job'], case['reading'])
            self.assertEqual(sum(p['form'] in ('named', 'embedded_parent') for p in compiled['record']['people']), named)
            self.assertTrue(compiled['proposal_only'])
            self.assertFalse(compiled['historical_identity_resolved'])
            self.assertFalse(compiled['confirmed_connections'])
        family = self.answer['relationships'][0]
        self.assertEqual((family['relation'], family['subject'], family['object']), ('child_of', 'p1', 'p2'))
        self.assertEqual(self.answer['people'][1]['form'], 'embedded_parent')

    def test_complete_constraints_are_in_actual_request(self):
        request = build_request(self.job)
        body = json.loads(request['messages'][0]['content'])
        self.assertEqual(body['schema'], SCHEMA)
        self.assertEqual(body['job'], self.job)
        self.assertEqual(body['relations'], {k: dict(category=v[0], direction=v[1]) for k, v in RELATIONS.items()})
        self.assertIn('Shmuel asking Rav', body['instructions'])
        self.assertEqual(request['request_sha256'], digest(body))
        self.assertEqual(request['recipe_version'], VERSION)

    def test_no_link_is_required_for_every_person(self):
        job, answer = self.cases[1]['job'], self.cases[1]['reading']
        check(job, answer)
        linked = {r[k] for r in answer['relationships'] for k in ('subject', 'object')}
        self.assertNotIn('p3', linked)
        self.assertNotIn('p4', linked)
        self.assertEqual([p['label'] for p in answer['people'][2:4]], ['רבי אבהו', 'רבא'])

    def test_actual_readings_recompile_to_same_relationships_as_v1(self):
        captured = json.loads((ROOT / 'tests/fixtures/compact-source-real.json').read_text())
        for original, case in zip(captured['cases'], self.cases):
            compiled = check(case['job'], case['reading'])
            expected = copy.deepcopy(original['reading'])
            expected['schema_version'] = VERSION
            self.assertEqual(compiled['record'], expected)

    def test_compilation_derives_fields_without_changing_original(self):
        original = copy.deepcopy(self.answer)
        compiled = check(self.job, self.answer)
        self.assertEqual(self.answer, original)
        self.assertEqual(compiled['answer'], original)
        self.assertEqual(compiled['answer_sha256'], digest(original))
        for raw, derived in zip(original['relationships'], compiled['record']['relationships']):
            category, direction = RELATIONS[raw['relation']]
            self.assertEqual(derived, dict(raw, category=category, direction=direction))
        altered = copy.deepcopy(compiled)
        altered['record']['relationships'][0]['direction'] = 'symmetric'
        with self.assertRaisesRegex(Invalid, 'saved_binding'):
            check_saved(self.job, altered)

    def test_v1_output_and_derived_fields_are_not_model_input(self):
        self.answer['schema_version'] = 'compact-source-v1'
        self.rejects('schema')
        self.answer['schema_version'] = VERSION
        for field, value in [('category', 'debate'), ('direction', 'directed')]:
            answer = copy.deepcopy(self.answer)
            answer['relationships'][1][field] = value
            self.rejects('schema', answer=answer)

    def test_guide_explains_action_polarity_in_actual_request(self):
        guide = json.loads(build_request(self.job)['messages'][0]['content'])['instructions']
        self.assertIn('relation opposes and polarity positive', guide)
        self.assertIn('Do not return category or direction fields', guide)
        relation = next(r for r in self.answer['relationships'] if r['relation'] == 'responds_to_teaching')
        relation['relation'] = 'opposes'
        relation['polarity'] = 'positive'
        compiled = check(self.job, self.answer)
        self.assertEqual(compiled['record']['relationships'][1]['polarity'], 'positive')

    def test_source_and_job_bindings(self):
        changed = copy.deepcopy(self.job)
        changed['sources'][0]['text'] += ' '
        self.rejects('source_hash', job=changed)
        changed = copy.deepcopy(self.job)
        changed['sources'][1]['source_id'] = changed['sources'][0]['source_id']
        self.rejects('source_id', job=changed)
        self.answer['job_id'] += '-other'
        self.rejects('job_id')

    def test_exact_anchor_and_occurrence(self):
        self.answer['people'][0]['mentions'][0]['quote'] += ' אינו במקור'
        self.rejects('anchor_quote')
        self.answer = copy.deepcopy(self.cases[0]['reading'])
        self.answer['people'][0]['mentions'][0]['occurrence'] = 99
        self.rejects('anchor_quote')
        self.answer = copy.deepcopy(self.cases[0]['reading'])
        self.answer['people'][0]['mentions'][0]['source_id'] = 'unknown'
        self.rejects('anchor_source')

    def test_duplicate_and_unknown_references(self):
        self.answer['people'].append(copy.deepcopy(self.answer['people'][0]))
        self.rejects('duplicate_id')
        self.answer = copy.deepcopy(self.cases[0]['reading'])
        self.answer['relationships'][0]['object'] = 'p999'
        self.rejects('person_reference')
        self.answer = copy.deepcopy(self.cases[0]['reading'])
        self.answer['people'][0]['mentions'].append(copy.deepcopy(self.answer['people'][0]['mentions'][0]))
        self.rejects('duplicate_evidence')

    def test_family_direction_type_and_self_relation(self):
        self.answer['relationships'][0]['direction'] = 'symmetric'
        self.rejects('schema')
        self.answer = copy.deepcopy(self.cases[0]['reading'])
        self.answer['relationships'][0]['object'] = 'p1'
        self.rejects('self_family')
        self.answer = copy.deepcopy(self.cases[0]['reading'])
        self.answer['people'][1].update(kind='group', form='unnamed')
        self.rejects('family_kind')

    def test_duplicate_relationship_not_hidden_by_new_id_or_reason(self):
        duplicate = copy.deepcopy(self.answer['relationships'][0])
        duplicate.update(id='r99', reason='Another explanation of the same supplied patronymic.')
        self.answer['relationships'].append(duplicate)
        self.rejects('duplicate_relationship')

    def test_unknown_endpoint_needs_no_invented_person(self):
        answer = copy.deepcopy(self.cases[1]['reading'])
        answer['relationships'][0].update(object=None, modality='uncertain',
            reason='The question is recorded but the addressee cannot be identified from this excerpt.')
        check(self.cases[1]['job'], answer)
        self.assertEqual(len(answer['people']), len(self.cases[1]['reading']['people']))
        answer['relationships'][0]['modality'] = 'asserted'
        self.rejects('unresolved_modality', answer=answer, job=self.cases[1]['job'])

    def test_paired_endpoint_alternatives_keep_the_known_speaker(self):
        answer = copy.deepcopy(self.cases[1]['reading'])
        rel = answer['relationships'][0]
        rel.update(object=None, modality='uncertain', alternatives=[dict(subject='p1', object='p2', reason='The replying turn is a possible addressee.')])
        check(self.cases[1]['job'], answer)
        rel['alternatives'][0]['subject'] = 'p3'
        self.rejects('alternative_fixed_endpoint', answer=answer, job=self.cases[1]['job'])

    def test_hypothetical_content_does_not_make_debaters_hypothetical(self):
        job, answer = self.cases[2]['job'], self.cases[2]['reading']
        check(job, answer)
        self.assertTrue(all(r['scene_status'] == 'actual_report' for r in answer['relationships']))
        self.assertTrue(all(r['modality'] == 'asserted' for r in answer['relationships']))
        answer['relationships'][0]['object'] = 'p4'
        self.rejects('hypothetical_endpoint', answer=answer, job=job)

    def test_context_and_missing_reason(self):
        self.answer['episode']['coverage'] = 'complete_for_supplied_text'
        self.rejects('context_status')
        self.answer = copy.deepcopy(self.cases[0]['reading'])
        self.answer['people'][0]['reason'] = ' '
        self.rejects('blank_text')
        self.answer = copy.deepcopy(self.cases[0]['reading'])
        del self.answer['relationships'][0]['reason']
        self.rejects('schema')

    def test_no_global_identity_or_dates_can_ride_along(self):
        self.answer['people'][0]['registry_id'] = 'rami-bar-chama'
        self.rejects('schema')
        self.answer = copy.deepcopy(self.cases[0]['reading'])
        self.answer['people'][0]['generation'] = 3
        self.rejects('schema')

    def test_mentions_cannot_take_letters_from_inside_a_hebrew_word(self):
        # Both fragments occur literally in the real source, inside אמר / רמי.
        for fragment in ('מר', 'מי'):
            answer = copy.deepcopy(self.cases[0]['reading'])
            answer['people'][0]['mentions'] = [dict(source_id='s2', quote=fragment, occurrence=1)]
            self.rejects('mention_boundary', answer=answer)
        # The source prints דר"ע; keeping its prefix passes, dropping it fails.
        answer = copy.deepcopy(self.cases[0]['reading'])
        self.assertEqual(answer['people'][3]['mentions'][0]['quote'], 'דר"ע')
        check(self.job, answer)
        answer['people'][3]['mentions'][0]['quote'] = 'ר"ע'
        self.rejects('mention_boundary', answer=answer)

    def test_same_name_occurrence_needs_explicit_identity_alternatives(self):
        duplicate = copy.deepcopy(self.answer['people'][0])
        duplicate['id'] = 'p99'
        self.answer['people'].append(duplicate)
        self.rejects('duplicate_name_identity')
        duplicate['alternatives'] = [dict(person_id='p1', reason='These are explicitly competing local identities for the same name.')]
        check(self.job, self.answer)

    def test_response_relation_requires_response_modality(self):
        self.answer['relationships'][1]['modality'] = 'asserted'
        self.rejects('response_modality')

    def test_saved_result_requires_exact_current_job_recipe_and_offsets(self):
        compiled = check(self.job, self.answer)
        self.assertEqual(check_saved(self.job, compiled), compiled)
        for field in ('job_sha256', 'answer_sha256'):
            bad = copy.deepcopy(compiled)
            bad[field] = '0' * 64
            with self.assertRaisesRegex(Invalid, 'saved_binding'):
                check_saved(self.job, bad)
        bad = copy.deepcopy(compiled)
        bad['recipe']['sha256'] = '0' * 64
        with self.assertRaisesRegex(Invalid, 'saved_binding'):
            check_saved(self.job, bad)
        bad = copy.deepcopy(compiled)
        bad['resolved_anchors'][0]['start'] += 1
        with self.assertRaisesRegex(Invalid, 'saved_binding'):
            check_saved(self.job, bad)
        changed = copy.deepcopy(self.job)
        changed['sources'][0]['text'] += ' '
        changed['sources'][0]['sha256'] = sha(changed['sources'][0]['text'])
        with self.assertRaisesRegex(Invalid, 'saved_binding'):
            check_saved(changed, compiled)


if __name__ == '__main__':
    unittest.main()
