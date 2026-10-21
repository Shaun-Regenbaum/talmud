"""source-reading-store-v2 on captured real bundles: lossless round trip, kept reader fields, refusals."""
import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import source_readings as importer  # noqa: E402
import source_coverage  # noqa: E402
import source_reading_store as store  # noqa: E402
from test_source_coverage import subset_ownership  # noqa: E402
from test_source_readings import row  # noqa: E402

CAPTURE = json.loads((Path(__file__).parent / 'fixtures/source-reading-real-v8.json').read_text())
BUNDLES = [CAPTURE['bundles'][i] for i in (0, 2)]


def v1_rows(bundles, with_coverage=True):
    spec = subset_ownership(bundles)
    index = source_coverage.pinned_index(spec)
    out = []
    for bundle in bundles:
        items = importer.records(bundle)
        if with_coverage:
            items += source_coverage.records(bundle['job'], items[0]['passage_id'], index)
        out += items
    return out


def artifacts(bundles):
    return {importer.records(b)[0]['passage_id']: b for b in bundles}


class SourceReadingStoreTests(unittest.TestCase):
    def test_round_trip_is_byte_identical_with_and_without_coverage(self):
        for with_coverage in (False, True):
            old = v1_rows(BUNDLES, with_coverage)
            before = copy.deepcopy(old)
            compact = store.compact(old)
            self.assertEqual(old, before)
            self.assertEqual([row(r) for r in store.expand(compact, artifacts(BUNDLES))], [row(r) for r in old])

    def test_compact_rows_are_smaller_and_keep_the_index_columns(self):
        old = v1_rows(BUNDLES)
        compact = store.compact(old)
        runs = [r for r in compact if r['kind'] == 'source_reading_run']
        self.assertEqual(len(runs), 1)
        rest = [r for r in compact if r['kind'] != 'source_reading_run']
        self.assertEqual([r['record_id'] for r in rest], [r['record_id'] for r in old])
        for a, b in zip(rest, old):
            self.assertEqual({k: v for k, v in a.items() if k != 'data'}, {k: v for k, v in b.items() if k != 'data'})
        size = lambda rows: sum(len(row(r)[-1].encode()) for r in rows)
        self.assertLess(size(compact), size(old) * 0.5)

    def test_reader_fields_stay_in_d1(self):
        compact = store.compact(v1_rows(BUNDLES))
        passage = next(r['data'] for r in compact if r['kind'] == 'passage')
        bundle = BUNDLES[0]
        self.assertEqual([s['text'] for s in passage['segments']], [s['text'] for s in bundle['job']['sources']])
        for s in passage['segments']:
            self.assertEqual(set(s), {'source_id', 'ref', 'edition', 'sha256', 'text', 'provenance'})
            self.assertIn('segment_id', s['provenance'])
            self.assertNotIn('source_url', s['provenance'])
        person = next(r['data'] for r in compact if r['kind'] == 'person')
        self.assertTrue({'label', 'kind', 'form', 'setting', 'reason', 'alternatives', 'mentions'} <= set(person))
        source_id, start, end, occurrence, quote = person['mentions'][0]
        text = next(s['text'] for s in passage['segments'] if s['source_id'] == source_id)
        self.assertEqual(text[start:end], quote)
        claim = next(r['data'] for r in compact if r['kind'] == 'claim')
        self.assertTrue({'subject', 'object', 'relation', 'modality', 'scene_status', 'polarity', 'verb', 'reason', 'alternatives',
                         'category', 'direction'} <= set(claim['relation']))
        self.assertTrue(claim['evidence'])
        reading = next(r['data'] for r in compact if r['kind'] == 'source_reading')
        self.assertTrue(reading['provenance']['artifactKey'].startswith('source-readings/v1/artifacts/'))
        self.assertNotIn('manifest', reading['provenance']['inputProof'])

    def test_expand_refuses_an_r2_bundle_that_is_not_the_named_artifact(self):
        compact = store.compact(v1_rows(BUNDLES))
        pid = next(iter(artifacts(BUNDLES)))
        # dropped provenance, kept text, and anything else in the bundle: each changes its hash
        for edit in (lambda s: s['provenance'].__setitem__('source_url', s['provenance']['source_url'] + '?x'),
                     lambda s: s['provenance'].__setitem__('license', 'changed'),
                     lambda s: s.__setitem__('text', s['text'] + ' ')):
            edited = copy.deepcopy(artifacts(BUNDLES))
            edit(edited[pid]['job']['sources'][0])
            with self.assertRaisesRegex(ValueError, 'R2 artifact differs from its source_reading envelope'):
                store.expand(compact, edited)
        edited = copy.deepcopy(artifacts(BUNDLES))
        edited[pid]['result']['costUsd'] = 0
        with self.assertRaisesRegex(ValueError, 'R2 artifact differs'):
            store.expand(compact, edited)
        # the envelope itself must name the bundle exactly: hash, length, key and bucket
        for field, value in (('artifactBytes', 1), ('artifactKey', 'source-readings/v1/artifacts/other.json'),
                             ('artifactBucket', 'public'), ('artifactSha256', '0' * 64)):
            bad = copy.deepcopy(compact)
            next(r for r in bad if r['kind'] == 'source_reading' and r['passage_id'] == pid)['data']['provenance'][field] = value
            with self.assertRaisesRegex(ValueError, 'R2 artifact differs'):
                store.expand(bad, artifacts(BUNDLES))
        # exactly one envelope per passage
        for change in ('drop', 'twin'):
            bad = copy.deepcopy(compact)
            envelope = next(r for r in bad if r['kind'] == 'source_reading' and r['passage_id'] == pid)
            if change == 'drop':
                bad.remove(envelope)
            else:
                bad.append(dict(envelope, record_id=envelope['record_id'] + '-twin'))
            with self.assertRaisesRegex(ValueError, 'exactly one source_reading envelope'):
                store.expand(bad, artifacts(BUNDLES))

    def test_expand_refuses_mismatched_manifests_and_rows(self):
        compact = store.compact(v1_rows(BUNDLES))
        bad = copy.deepcopy(compact)
        next(r for r in bad if r['kind'] == 'source_reading_run')['data']['manifest']['jobs'] += 1
        with self.assertRaisesRegex(ValueError, 'Run manifest differs'):
            store.expand(bad, artifacts(BUNDLES))
        with self.assertRaisesRegex(ValueError, 'Not source-reading-store-v2'):
            store.expand(v1_rows(BUNDLES), artifacts(BUNDLES))
        odd = copy.deepcopy(v1_rows(BUNDLES))
        odd[0]['kind'] = 'name_reading'
        with self.assertRaisesRegex(ValueError, 'Unknown source reading kind'):
            store.compact(odd)

    def test_v1_importer_is_unchanged(self):
        # the v1 rows that existing readers and the legacy graph use do not depend on this module
        self.assertEqual(importer.VERSION, 'source-reading-import-v1')
        self.assertEqual(importer.changes_for(BUNDLES, 'parent', CAPTURE['inputArtifacts'])['records'], v1_rows(BUNDLES, False))


if __name__ == '__main__':
    unittest.main()
