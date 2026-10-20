"""Actual captured tile subsets, with intentionally corrupted copies for rejection tests."""
import copy
import gzip
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ownership.tile_ownership import OwnershipIndex, build, digest, owned_sources, sha

FIXTURE = json.loads(gzip.decompress((Path(__file__).parent / 'fixtures/tile-ownership-real.json.gz').read_bytes()))


class TileOwnershipTests(unittest.TestCase):
    def capture(self, name):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        root = Path(temporary.name); (root / 'shards').mkdir()
        fixture = copy.deepcopy(FIXTURE[name])
        # The surrounding manifests describe this exact real-data subset, not the complete corpus.
        text = ''.join(json.dumps(j, ensure_ascii=False) + '\n' for j in fixture['jobs'])
        (root / 'shards/shard-000.jsonl').write_text(text)
        manifest = dict(version='full-bavli-tiles v1' if name == 'bavli' else 'full-other-texts-tiles v3', jobs=len(fixture['jobs']), shards={'shard-000.jsonl': dict(jobs=len(fixture['jobs']), sha256=sha(text.encode()))})
        (root / 'manifest.json').write_text(json.dumps(manifest))
        for filename, key in [('tiles.jsonl', 'tiles'), ('segment-coverage.jsonl', 'coverage'), ('pieces.jsonl', 'pieces')]:
            if fixture[key]:
                (root / filename).write_text(''.join(json.dumps(x, ensure_ascii=False) + '\n' for x in fixture[key]))
        (root / 'verification.json').write_text(json.dumps({'fixtureSubset': True}))
        self.checksums(root)
        return root, fixture, sha((root / 'manifest.json').read_bytes())

    def checksums(self, root):
        (root / 'SHA256SUMS').write_text(''.join(sha(p.read_bytes()) + '  ./' + p.name + '\n' for p in root.iterdir() if p.is_file() and p.name != 'SHA256SUMS'))

    def test_actual_overlaps_have_one_owner_without_changing_focal(self):
        root, fixture, expected = self.capture('bavli'); frozen = copy.deepcopy(fixture['jobs'])
        bundle = build(root, expected)
        self.assertGreater(bundle['manifest']['overlappingUnits'], 0)
        counts = {}
        for job in fixture['jobs']:
            for source in owned_sources(job, bundle, bundle['manifest']['manifestSha256']):
                if source['owned']:
                    counts[source['segmentId']] = counts.get(source['segmentId'], 0) + 1
        self.assertEqual(set(counts.values()), {1})
        self.assertEqual(len(counts), bundle['manifest']['segments'])
        self.assertEqual(frozen, fixture['jobs'])

    def test_actual_pieces_keep_original_offsets_and_hashes(self):
        root, fixture, expected = self.capture('other'); bundle = build(root, expected)
        self.assertGreater(bundle['manifest']['units'], bundle['manifest']['segments'])
        mapped = [s for j in fixture['jobs'] for s in owned_sources(j, bundle, bundle['manifest']['manifestSha256']) if s['owned']]
        self.assertTrue(any(s['rawStart'] > 0 for s in mapped))
        self.assertEqual(len(mapped), bundle['manifest']['units'])

    def test_source_corruption_rejected(self):
        root, _, expected = self.capture('bavli')
        p = root / 'shards/shard-000.jsonl'; p.write_text(p.read_text() + '\n')
        with self.assertRaisesRegex(ValueError, 'Shard checksum'): build(root, expected)

    def test_missing_coverage_rejected_even_with_new_metadata_checksum(self):
        root, _, expected = self.capture('bavli')
        p = root / 'segment-coverage.jsonl'; p.write_text('\n'.join(p.read_text().splitlines()[1:]) + '\n'); self.checksums(root)
        with self.assertRaisesRegex(ValueError, 'Source absent'): build(root, expected)

    def test_piece_gap_rejected(self):
        root, _, expected = self.capture('other'); p = root / 'pieces.jsonl'
        rows = list(map(json.loads, p.read_text().splitlines())); rows[0]['pieces'][0]['rawEnd'] -= 1
        p.write_text(''.join(json.dumps(x) + '\n' for x in rows)); self.checksums(root)
        with self.assertRaisesRegex(ValueError, 'Piece absent'): build(root, expected)

    def test_adapter_rejects_changed_job_or_ownership(self):
        root, fixture, expected = self.capture('bavli'); bundle = build(root, expected)
        changed = copy.deepcopy(fixture['jobs'][0]); changed['job_id'] += '-wrong'
        with self.assertRaisesRegex(ValueError, 'Job not bound'): owned_sources(changed, bundle, bundle['manifest']['manifestSha256'])
        corrupt = copy.deepcopy(bundle); corrupt['ownership'][0]['owner']['jobId'] += '-wrong'
        with self.assertRaisesRegex(ValueError, 'Ownership rows changed'): owned_sources(fixture['jobs'][0], corrupt, bundle['manifest']['manifestSha256'])

    def test_unapproved_self_consistent_mapping_rejected(self):
        root, fixture, expected = self.capture('bavli'); bundle = build(root, expected)
        with self.assertRaisesRegex(ValueError, 'Unapproved ownership'):
            OwnershipIndex(bundle, '0' * 64)
        index = OwnershipIndex(bundle, bundle['manifest']['manifestSha256'])
        before = index.sources_for(fixture['jobs'][0])
        bundle['ownership'].clear()
        self.assertEqual(before, index.sources_for(fixture['jobs'][0]))

    def test_wrong_expected_frozen_manifest_rejected(self):
        root, _, _ = self.capture('bavli')
        with self.assertRaisesRegex(ValueError, 'Frozen manifest differs'): build(root, '0' * 64)


if __name__ == '__main__':
    unittest.main()
