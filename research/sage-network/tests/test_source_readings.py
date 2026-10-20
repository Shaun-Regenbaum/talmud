"""Use captured v8 outputs; negative cases deliberately corrupt those captures."""
import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
import source_readings as importer

FIXTURE = Path(__file__).parent / 'fixtures/source-reading-real-v8.json'


def row(item):
    raw = json.dumps(item['data'], ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return (item['record_id'], item['kind'], item['passage_id'], item['ref'], item['subject_id'],
            item['object_id'], item['authority'], item['decision'], importer.sha(raw), raw)


class SourceReadingTests(unittest.TestCase):
    def setUp(self):
        self.capture = json.loads(FIXTURE.read_text())
        self.good = [self.capture['bundles'][i] for i in (0, 2)]
        self.inputs = self.capture['inputArtifacts']

    def changes(self):
        return importer.changes_for(self.good, 'review-parent', self.inputs)

    def test_real_counts_and_no_acceptance(self):
        changes = self.changes()
        self.assertEqual(len(changes['records']), 22)
        self.assertEqual({r['authority'] for r in changes['records']}, {'screening'})
        self.assertEqual({r['decision'] for r in changes['records']}, {'needs_review'})
        self.assertEqual({r['kind'] for r in changes['records']}, importer.BASE_KINDS)
        readings = [r['data'] for r in changes['records'] if r['kind'] == 'source_reading']
        self.assertEqual(sum(len(r['primaryOccurrenceKeys']) for r in readings), 3)
        # Evidence counts use exact spans, not the number of relationship rows.
        self.assertEqual(sum(len(r['primaryEvidenceKeys']) for r in readings), 3)
        importer.validate_changes(changes, {})

    def test_invalid_whole_job_rejected(self):
        with self.assertRaises(ValueError):
            importer.records(self.capture['bundles'][1])

    def test_amendment_replayed(self):
        self.good[1]['amendment']['receipt']['changes'][0]['reason'] += ' changed'
        with self.assertRaisesRegex(ValueError, 'Amendment'):
            self.changes()

    def test_response_cannot_be_substituted(self):
        self.good[0]['result']['response']['choices'][0]['message']['content'] = '{}'
        with self.assertRaisesRegex(ValueError, 'queue result'):
            self.changes()

    def test_changed_job_even_with_self_consistent_result_is_not_in_shard(self):
        b = self.good[0]
        b['job']['job_id'] += '-changed'
        b['result']['jobHash'] = importer.digest(b['job'])
        with self.assertRaisesRegex(ValueError, 'frozen shard'):
            self.changes()

    def test_shard_corruption_rejected(self):
        key = next(iter(self.inputs))
        self.inputs[key] += '\n'
        with self.assertRaisesRegex(ValueError, 'frozen shard'):
            self.changes()

    def test_record_mutation_and_extra_promotion_rejected(self):
        for field, value in [('authority', 'source_review'), ('kind', 'connection')]:
            changes = self.changes()
            changes['records'][1][field] = value
            with self.assertRaisesRegex(ValueError, 'strict reconstruction'):
                importer.validate_changes(changes, {})
        changes = self.changes()
        changes['records'][1]['data']['reading']['reason'] = 'changed'
        with self.assertRaises(ValueError):
            importer.validate_changes(changes, {})

    def test_duplicate_and_missing_records_rejected(self):
        for mode in ('duplicate', 'missing'):
            changes = self.changes()
            if mode == 'duplicate':
                changes['records'].append(copy.deepcopy(changes['records'][0]))
            else:
                changes['records'].pop()
            with self.assertRaises(ValueError):
                importer.validate_changes(changes, {})

    def test_repeat_is_noop_and_existing_records_cannot_change(self):
        changes = self.changes()
        existing = {r['record_id']: r for r in changes['records']}
        replay = importer.changes_for(self.good, 'review-parent', self.inputs, existing)
        self.assertEqual(replay['records'], [])
        importer.validate_changes(replay, {k: row(v) for k, v in existing.items()})
        existing[next(iter(existing))]['authority'] = 'user_correction'
        with self.assertRaisesRegex(ValueError, 'Existing source record differs'):
            importer.changes_for(self.good, 'review-parent', self.inputs, existing)

    def test_occurrence_key_does_not_depend_on_window_or_person_group(self):
        # Reuse the captured source occurrence in another window/group, without
        # inventing source text or pretending this altered answer was a model run.
        source = self.good[0]['job']['sources'][2]
        anchor = next(a for a in self.good[0]['result']['compiled']['resolved_anchors']
                      if a['source_id'] == source['source_id'] and a['path'].startswith('people/'))
        other_window_source = copy.deepcopy(source)
        other_window_source['source_id'] = 'other-window-context'
        other_window_source['provenance']['focal'] = False
        regrouped = dict(anchor, path='people/p999/mentions/0')
        self.assertEqual(importer.occurrence_key(source, anchor['start'], anchor['end']),
                         importer.occurrence_key(other_window_source, regrouped['start'], regrouped['end']))
        other_window_source['edition'] += ' changed'
        self.assertNotEqual(importer.occurrence_key(source, anchor['start'], anchor['end']),
                            importer.occurrence_key(other_window_source, anchor['start'], anchor['end']))

    def test_partial_resume_still_checks_complete_bundle(self):
        changes = self.changes()
        first = changes['records'][0]
        replay = importer.changes_for(self.good, 'review-parent', self.inputs, {first['record_id']: first})
        self.assertEqual(len(replay['records']), 21)
        importer.validate_changes(replay, {first['record_id']: row(first)})

    def test_projection_unions_primary_occurrences_across_readings(self):
        items = self.changes()['records']
        one = importer.analysis_projection(items)
        # The same captured rows reappear in another input page/window.
        twice = importer.analysis_projection(items + copy.deepcopy(items))
        self.assertEqual(one['primaryOccurrences'], twice['primaryOccurrences'])
        self.assertEqual(one['primaryEvidence'], twice['primaryEvidence'])
        self.assertEqual(len(one['primaryOccurrences']), 3)
        self.assertFalse(one['confirmedConnections'])

    def test_context_people_are_not_placed_on_focal_page(self):
        items = importer.records(self.good[0])
        projection = importer.analysis_projection(items)
        people = [r for r in items if r['kind'] == 'person']
        contextual = [r for r in people if not any(m['primary'] for m in r['data']['mentions'])]
        self.assertTrue(contextual)
        placed = {p for a in projection['primaryOccurrences'].values() for p in a['personProposals']}
        self.assertTrue(all(r['record_id'] not in placed for r in contextual))
        self.assertTrue(all(m['ref'] != r['ref'] for r in contextual for m in r['data']['mentions']))
        for r in items:
            if r['kind'] == 'claim':
                for key in ('subject_id', 'object_id'):
                    self.assertTrue(r[key] is None or r[key].startswith(r['passage_id'] + '/'))

    def test_shared_revision_roundtrip_preserves_real_parent_records(self):
        import test_extend_d1
        helper = test_extend_d1.ReviewImportTest()
        helper.setUp()
        self.addCleanup(helper.doCleanups)
        helper.shared = True
        helper.changes = importer.changes_for(self.good, helper.manifest['revision'], self.inputs)
        result = helper.run_import()
        self.assertEqual(result['changedRecords'], 22)

    def test_frozen_recipe_hash_cannot_change(self):
        b = self.good[0]
        b['config']['recipeFiles']['compact_source/contract.py'] = '0' * 64
        b['result']['manifestHash'] = importer.digest(b['config'])
        b['result']['resultHash'] = importer.digest({k: v for k, v in b['result'].items() if k != 'resultHash'})
        with self.assertRaisesRegex(ValueError, 'frozen recipe'):
            self.changes()


if __name__ == '__main__':
    unittest.main()
