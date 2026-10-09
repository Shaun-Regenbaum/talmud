"""Reuse the captured-source import checks, then test sharing and immutability."""
import json
import sqlite3
import unittest

import test_extend_d1 as original
from extend_d1 import prepare
from shared_records import version_hash
from verify_d1 import verify


class SharedReviewImportTest(original.ReviewImportTest):
    shared = True

    def loaded(self):
        self.run_import()
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.executescript(self.export.read_text())
        db.executescript((self.root / 'out/import.sql').read_text())
        db.executescript((self.root / 'out/activate.sql').read_text())
        db.execute('PRAGMA foreign_keys=ON')
        return db, json.loads((self.root / 'out/manifest.json').read_text())

    def test_next_revision_reuses_versions_and_preserves_both_sources(self):
        db, manifest = self.loaded()
        count = db.execute('SELECT count(*) FROM sage_graph_record_versions').fetchone()[0]
        before = db.execute('SELECT * FROM sage_graph_all_records ORDER BY revision_id,record_id').fetchall()
        export = self.root / 'shared.sql'
        export.write_text('\n'.join(db.iterdump()))
        verify(export, self.root / 'out/manifest.json')
        changes = self.root / 'next.json'
        changes.write_text(json.dumps({'parentRevision': manifest['revision'],
                                       'description': 'Preserve the same reviewed records', 'records': []}))
        out = self.root / 'next'
        result = prepare(export, self.root / 'out/manifest.json', changes, out, shared=True)
        db.executescript((out / 'import.sql').read_text())
        self.assertEqual(count, db.execute('SELECT count(*) FROM sage_graph_record_versions').fetchone()[0])
        self.assertEqual(before, db.execute('SELECT * FROM sage_graph_all_records WHERE revision_id!=? ORDER BY revision_id,record_id',
                                           (result['revision'],)).fetchall())
        current = db.execute('SELECT record_id,payload_json FROM sage_graph_all_records WHERE revision_id=? ORDER BY record_id',
                             (result['revision'],)).fetchall()
        previous = db.execute('SELECT record_id,payload_json FROM sage_graph_all_records WHERE revision_id=? ORDER BY record_id',
                              (manifest['revision'],)).fetchall()
        self.assertEqual(previous, current)
        self.assertEqual([], db.execute('PRAGMA foreign_key_check').fetchall())

    def test_verified_records_and_memberships_cannot_change(self):
        db, manifest = self.loaded()
        revision = manifest['revision']
        member = db.execute('SELECT record_id,version_id FROM sage_graph_revision_members WHERE revision_id=? LIMIT 1', (revision,)).fetchone()
        for sql, args in [
            ('UPDATE sage_graph_record_versions SET authority=? WHERE id=?', ('corrupt-test-copy', member[1])),
            ('DELETE FROM sage_graph_record_versions WHERE id=?', (member[1],)),
            ('DELETE FROM sage_graph_revision_members WHERE revision_id=?', (revision,)),
            ('UPDATE sage_graph_revision_members SET version_id=version_id WHERE revision_id=?', (revision,)),
            ('INSERT OR REPLACE INTO sage_graph_revision_members VALUES(?,?,?)', (revision, *member)),
            ('INSERT OR REPLACE INTO sage_graph_record_versions SELECT * FROM sage_graph_record_versions WHERE id=?', (member[1],)),
        ]:
            with self.subTest(sql=sql), self.assertRaises(sqlite3.IntegrityError):
                db.execute(sql, args)

    def test_loading_membership_cannot_use_another_records_version(self):
        db, manifest = self.loaded()
        rows = db.execute('SELECT record_id,version_id FROM sage_graph_revision_members WHERE revision_id=? LIMIT 2', (manifest['revision'],)).fetchall()
        db.execute("INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES('next',?, 'loading')",
                   ('{"storageFormat":"shared-v1"}',))
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'differs'):
            db.execute("INSERT INTO sage_graph_revision_members VALUES('next',?,?)", (rows[0][0], rows[1][1]))
        db.execute("INSERT INTO sage_graph_revision_members VALUES('next',?,?)", rows[0])
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE sage_graph_revisions SET manifest_json='{}' WHERE id='next'")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute('UPDATE sage_graph_revision_members SET revision_id=? WHERE revision_id=?',
                       (manifest['revision'], 'next'))

    def test_replace_cannot_unpublish_a_revision_and_unlock_its_records(self):
        db, manifest = self.loaded()
        for revision in [manifest['revision'], self.manifest['revision']]:
            with self.subTest(revision=revision), self.assertRaisesRegex(sqlite3.IntegrityError, 'cannot be replaced'):
                db.execute("INSERT OR REPLACE INTO sage_graph_revisions(id,manifest_json,state) VALUES(?,?,'loading')",
                           (revision, '{}'))
            self.assertEqual(('verified',), db.execute('SELECT state FROM sage_graph_revisions WHERE id=?', (revision,)).fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute('DELETE FROM sage_graph_revision_members WHERE revision_id=?', (manifest['revision'],))

    def test_version_hash_includes_attribution_fields(self):
        row = original.FIXTURE['records'][0]
        changed = list(row)
        changed[6] = 'corrupt-test-authority'
        self.assertNotEqual(version_hash(row), version_hash(changed))

    def test_export_verifier_rejects_a_corrupt_version_hash(self):
        db, _ = self.loaded()
        db.execute('DROP TRIGGER sage_graph_version_no_update')
        db.execute("UPDATE sage_graph_record_versions SET version_sha256='corrupt-test-hash' WHERE id=(SELECT min(id) FROM sage_graph_record_versions)")
        corrupt = self.root / 'corrupt.sql'
        corrupt.write_text('\n'.join(db.iterdump()))
        with self.assertRaisesRegex(ValueError, 'version or membership differs'):
            verify(corrupt, self.root / 'out/manifest.json')


if __name__ == '__main__':
    unittest.main()
