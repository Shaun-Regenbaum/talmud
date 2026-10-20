"""Ownership metadata built from real captures; corruptions are rejection tests."""
import copy
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
import source_readings as importer
import source_coverage
from ownership.tile_ownership import OwnershipIndex, POLICY, VERSION, digest, source_unit
from test_source_readings import row
import test_tile_ownership


def subset_ownership(bundles):
    # This declares ownership only for the captured test subset, not the full corpus.
    rows = []
    for bundle in bundles:
        job = bundle['job']
        for s in job['sources']:
            unit, start, end, segment_hash = source_unit(s)
            rows.append(dict(unitId=unit, segmentId=s['provenance']['segment_id'], edition=s['edition'],
                ref=s['ref'], sourceSha256=s['sha256'], segmentSha256=segment_hash, rawStart=start, rawEnd=end,
                owner=dict(jobId=job['job_id'], jobSha256=digest(job), sourceId=s['source_id'],
                           originalRole='focal' if s['provenance']['focal'] else 'context'), alternatives=[]))
    header = dict(version=VERSION, policy=POLICY, rowsSha256=digest(rows), fixtureSubset=True)
    header['manifestSha256'] = digest(header)
    return dict(manifest=dict(manifest=header, ownership=rows), expectedManifestSha256=header['manifestSha256'])


class SourceCoverageTests(unittest.TestCase):
    def setUp(self):
        capture = json.loads((Path(__file__).parent / 'fixtures/source-reading-real-v8.json').read_text())
        self.bundles = [capture['bundles'][i] for i in (0, 2)]
        self.inputs = capture['inputArtifacts']
        self.spec = subset_ownership(self.bundles)

    def changes(self, existing=None):
        return importer.changes_for(self.bundles, 'parent', self.inputs, existing, self.spec)

    def test_context_index_keeps_existing_readings_identical(self):
        old = importer.changes_for(self.bundles, 'parent', self.inputs)['records']
        changes = self.changes()
        self.assertEqual([r for r in changes['records'] if r['kind'] in importer.BASE_KINDS], old)
        units = [r for r in changes['records'] if r['kind'] == 'source_reading_unit']
        self.assertEqual(len(units), 10)
        self.assertEqual(sum(r['data']['originalRole'] == 'context' for r in units), 8)
        self.assertTrue(all(r['authority'] == 'screening' and r['decision'] == 'needs_review' for r in units))
        importer.validate_changes(changes, {})

    def test_add_index_to_existing_reading_and_repeat_is_noop(self):
        old = importer.changes_for(self.bundles, 'parent', self.inputs)['records']
        existing = {r['record_id']: r for r in old}
        addition = self.changes(existing)
        self.assertEqual({r['kind'] for r in addition['records']}, source_coverage.KINDS)
        importer.validate_changes(addition, {k: row(v) for k, v in existing.items()})
        existing.update({r['record_id']: r for r in addition['records']})
        self.assertEqual(self.changes(existing)['records'], [])
        key = next(k for k in existing if k.startswith('source_reading_unit:'))
        existing[key]['authority'] = 'user_correction'
        with self.assertRaisesRegex(ValueError, 'Existing source record differs'):
            self.changes(existing)

    def test_wrong_pin_changed_job_and_placement_are_rejected(self):
        self.spec['expectedManifestSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Unapproved ownership'):
            self.changes()
        self.spec = subset_ownership(self.bundles)
        index = source_coverage.pinned_index(self.spec)
        job = copy.deepcopy(self.bundles[0]['job']); job['job_id'] += '-different'
        with self.assertRaisesRegex(ValueError, 'Job not bound'):
            source_coverage.records(job, 'reading', index)
        changes = self.changes()
        unit = next(r for r in changes['records'] if r['kind'] == 'source_reading_unit')
        unit['ref'] = 'changed'
        with self.assertRaisesRegex(ValueError, 'strict reconstruction'):
            importer.validate_changes(changes, {})

    def test_actual_overlapping_tiles_publish_each_unit_once(self):
        helper = test_tile_ownership.TileOwnershipTests(); helper.setUp(); self.addCleanup(helper.doCleanups)
        root, fixture, expected = helper.capture('bavli')
        from ownership.tile_ownership import build
        mapping = build(root, expected)
        index = OwnershipIndex(mapping, mapping['manifest']['manifestSha256'])
        units = [r for j in fixture['jobs'] for r in source_coverage.records(j, j['job_id'], index)
                 if r['kind'] == 'source_reading_unit']
        self.assertEqual(len(units), mapping['manifest']['units'])
        self.assertEqual(len({r['record_id'] for r in units}), len(units))

    def test_real_pieces_keep_absolute_offsets_and_distinct_units(self):
        helper = test_tile_ownership.TileOwnershipTests(); helper.setUp(); self.addCleanup(helper.doCleanups)
        root, fixture, expected = helper.capture('other')
        from ownership.tile_ownership import build
        mapping = build(root, expected); index = OwnershipIndex(mapping, mapping['manifest']['manifestSha256'])
        units = [r for j in fixture['jobs'] for r in source_coverage.records(j, j['job_id'], index)
                 if r['kind'] == 'source_reading_unit']
        self.assertTrue(any(r['data']['rawStart'] > 0 for r in units))
        self.assertEqual(len(units), len({r['record_id'] for r in units}))
        source = next(s for j in fixture['jobs'] for s in j['sources'] if s['provenance'].get('piece', {}).get('raw_start', 0) > 0)
        _, start, _, parent_hash = source_unit(source)
        expected_key = 'occ-' + digest([source['edition'], source['provenance']['segment_id'], parent_hash, start, start + 1])
        self.assertEqual(importer.occurrence_key(source, 0, 1), expected_key)

    def test_owned_import_roundtrip(self):
        import test_extend_d1
        helper = test_extend_d1.ReviewImportTest(); helper.setUp(); self.addCleanup(helper.doCleanups)
        helper.shared = True
        helper.changes = importer.changes_for(self.bundles, helper.manifest['revision'], self.inputs, ownership=self.spec)
        self.assertEqual(helper.run_import()['changedRecords'], 34)

    def test_later_reading_keeps_same_source_key_without_replacing_prior_index(self):
        # Two real captured readings have distinct reading IDs. Reuse the same
        # actual job to test index identity independently of interpretation.
        index = source_coverage.pinned_index(self.spec)
        ids = [importer.records(b)[0]['passage_id'] for b in self.bundles]
        first = source_coverage.records(self.bundles[0]['job'], ids[0], index)
        later = source_coverage.records(self.bundles[0]['job'], ids[1], index)
        first_units = [r for r in first if r['kind'] == 'source_reading_unit']
        later_units = [r for r in later if r['kind'] == 'source_reading_unit']
        self.assertFalse({r['record_id'] for r in first} & {r['record_id'] for r in later})
        self.assertEqual([r['data']['unitKey'] for r in first_units], [r['data']['unitKey'] for r in later_units])

    def test_two_valid_answers_for_one_job_append_and_deduplicate_occurrences(self):
        # An explicitly altered test answer checks immutable revisions; this is
        # not represented as a second captured provider reading.
        later = copy.deepcopy(self.bundles[0])
        answer = copy.deepcopy(later['result']['answer'])
        answer['people'][0]['reason'] += ' Retained as an initial proposal.'
        later['result']['response']['choices'][0]['message']['content'] = json.dumps(answer, ensure_ascii=False)
        later['result']['answer'] = answer
        later['result']['compiled'] = importer.check(later['job'], answer)
        later['result']['resultHash'] = digest({k: v for k, v in later['result'].items() if k != 'resultHash'})
        existing_changes = self.changes()
        existing = {r['record_id']: r for r in existing_changes['records']}
        proof_hash = later['inputProof']['sha256']
        addition = importer.changes_for([later], 'parent', {proof_hash: self.inputs[proof_hash]}, existing, self.spec)
        importer.validate_changes(addition, {k: row(v) for k, v in existing.items()})
        new_units = [r for r in addition['records'] if r['kind'] == 'source_reading_unit']
        self.assertEqual(len(new_units), 5)
        self.assertFalse(set(existing) & {r['record_id'] for r in addition['records']})
        before = importer.analysis_projection(existing_changes['records'])
        after = importer.analysis_projection(existing_changes['records'] + addition['records'])
        self.assertEqual(set(before['publishedOccurrences']), set(after['publishedOccurrences']))

    def test_api_fixture_matches_strict_reconstruction(self):
        fixture = Path(__file__).resolve().parents[3] / 'packages/talmud/tests/fixtures/source-reading-coverage.json'
        expected = [r for r in self.changes()['records'] if r['kind'] in source_coverage.KINDS]
        self.assertEqual(json.loads(fixture.read_text())['records'], expected)
