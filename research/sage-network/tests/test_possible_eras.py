import copy
import json
import sys
import sqlite3
import re
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
import possible_eras as eras

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/possible-era.json').read_text())


class PossibleEraTests(unittest.TestCase):
    def setUp(self):
        self.rows = {r[0]: tuple(r) for r in FIXTURE['rows']}
        self.accepted, self.candidate = FIXTURE['entries'][:2]

    def test_real_accepted_and_candidate_remain_unconfirmed(self):
        for entry in FIXTURE['entries']:
            item = eras.record(entry, self.rows)
            self.assertEqual(item['data']['tier'], entry['tier'])
            self.assertFalse(item['data']['acceptedEra'])
            self.assertFalse(item['data']['usableForDatingOthers'])
            self.assertNotIn('start', item['data'])
            self.assertNotIn('era', item['data'])
            self.assertEqual(item['authority'], 'screening')

    def test_changed_registry_and_source_are_stale(self):
        for key in [self.candidate['registry']['recordId'], 'passage:b000-p0']:
            rows = self.rows.copy()
            row = list(rows[key]);row[-1] += ' ';rows[key] = tuple(row)
            self.assertIsNone(eras.record(self.candidate, rows))

    def test_new_exact_person_review_suppresses_earlier_candidate(self):
        rows = self.rows.copy()
        # Deliberate metadata fault from the real held Ravina assessment.
        old = next(r for r in rows.values() if r[1] == 'identity_assessment' and json.loads(r[-1]).get('personKey') == 'b000-p0/A')
        changed = list(old);data = json.loads(changed[-1]);data['personKey'] = self.candidate['personKey'];changed[0] += '-fault';changed[-1] = json.dumps(data);rows[changed[0]] = tuple(changed)
        self.assertIsNone(eras.record(self.candidate, rows))

    def test_row_authority_change_suppresses(self):
        rows = self.rows.copy();key = self.candidate['identity']['recordId'];row = list(rows[key]);row[6] = 'user_correction';rows[key] = tuple(row)
        self.assertIsNone(eras.record(self.candidate, rows))

    def test_new_legacy_identity_paths_invalidate_scope(self):
        for original in FIXTURE['legacyControls']:
            row = list(original)
            data = json.loads(row[-1])
            # Metadata-only fault on a captured record, targeting the candidate.
            if row[1] in {'identity_review', 'identity_finding'}:
                data['registrySlug'] = self.candidate['originalCandidateId']
                if row[1] == 'identity_finding':
                    continue  # findings bind through exact assignment/group IDs, never a guessed name
            elif row[1] == 'withheld':
                row[2] = self.candidate['personKey'].split('/')[0]
            else:
                data['personKey'] = self.candidate['personKey']
            row[-1] = json.dumps(data)
            rows = self.rows.copy(); rows[row[0]] = tuple(row)
            self.assertIsNone(eras.record(self.candidate, rows), row[1])

    def test_real_linked_group_change_is_stale(self):
        entry = FIXTURE['entries'][2]
        key = next(b['recordId'] for b in entry['scope'] if b['recordId'].startswith('identity_group:'))
        rows = self.rows.copy(); row = list(rows[key]); row[-1] += ' '; rows[key] = tuple(row)
        self.assertIsNone(eras.record(entry, rows))

    def test_actual_uncertain_assignment_is_a_hold(self):
        held = FIXTURE['heldControl']
        rows = {r[0]: tuple(r) for r in held['rows']}
        self.assertTrue(eras.legacy_hold(rows, held['personKey'], held['candidate']))

    def test_builder_indexes_null_passage_human_subject(self):
        row = list(next(r for r in FIXTURE['legacyControls'] if r[1] == 'exclusion'))
        row[2] = None; row[4] = 'local:' + self.candidate['personKey']
        rows = self.rows.copy(); rows[row[0]] = tuple(row)
        context = eras.context_for(eras.context_index(rows), self.candidate['personKey'])
        self.assertNotEqual(eras.scope(context, self.candidate['personKey'], self.candidate['originalCandidateId']), self.candidate['scope'])

    def test_actual_runtime_sql_fetches_all_null_passage_key_paths(self):
        module = Path(__file__).resolve().parents[3] / 'packages/talmud/src/lib/sage-graph/possible-era.ts'
        sql = re.search(r'export const POSSIBLE_ERA_SCOPE_SQL =\s*`([^`]+)`', module.read_text()).group(1)
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE sage_graph_all_records(revision_id TEXT,record_id TEXT,kind TEXT,passage_id TEXT,ref TEXT,subject_id TEXT,object_id TEXT,authority TEXT,decision TEXT,payload_sha256 TEXT,payload_json TEXT)')
            for field in ('case', 'identityDecision', 'personKeys'):
                original = next(r for r in FIXTURE['legacyControls'] if r[1] == 'accepted_identity')
                row = list(original); row[0] += '-' + field; row[2] = None
                d = json.loads(row[-1]); d.pop('personKey', None); d.pop('identityDecision', None)
                d[field] = [self.candidate['personKey']] if field == 'personKeys' else {'personKey': self.candidate['personKey']}
                row[-1] = json.dumps(d)
                db.execute('INSERT INTO sage_graph_all_records VALUES (?,?,?,?,?,?,?,?,?,?,?)', ['actual-fixture', *row])
            key = self.candidate['personKey']
            found = db.execute(sql, ['actual-fixture', key.split('/')[0], *([key] * 6)]).fetchall()
            self.assertEqual(len(found), 3)

    def test_forged_or_partial_policy_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'reviewed frozen policy'):
            eras.build(self.rows, {'entries': FIXTURE['entries']}, 'test')

    def test_held_identity_not_in_approved_fixture(self):
        self.assertNotIn('b000-p0/A', [e['personKey'] for e in FIXTURE['entries']])
        held = next(r for r in self.rows.values() if r[1] == 'identity_assessment' and json.loads(r[-1]).get('personKey') == 'b000-p0/A')
        self.assertIsNone(eras.selected_identity(held))


if __name__ == '__main__':
    unittest.main()
