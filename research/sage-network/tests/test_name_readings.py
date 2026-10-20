"""Import rules for first readings of source people (name_reading records).

The fixture holds two real frozen readings and the live records they point at,
copied verbatim. The tests check the import rules only; the readings are proposals.
"""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from extend_d1 import digest
from prepare_d1 import encode
from test_identity_assessments import import_records

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/name-readings.json').read_text())
RUN = 'missing-names-v18'


REGISTRY = {r['record_id'].split(':', 1)[1]: r['payloadSha256'] for r in FIXTURE['records'] if r['kind'] == 'registry_person'}
CASE_FILE_SHA = {c['case']['caseId']: c['sha256'] for c in FIXTURE['cases']}


def named_people(case):
    reading = case['reading']
    named = {s for s in [reading.get('proposedRegistryId')] + [a.get('registryId') for a in reading.get('alternatives') or []] if s}
    named |= {e['registryId'] for e in list(reading.get('registryEvidence') or []) + [a['registryEvidence'] for a in reading.get('alternatives') or [] if a.get('registryEvidence')]}
    return named


def reading_record(case, registry=None):
    data = dict(copy.deepcopy(case), runId=RUN, chunk='chunk-003', caseFileSha256=CASE_FILE_SHA[case['caseId']], caseSha256=digest(encode(case)))
    data['registryRecords'] = registry if registry is not None else {s: REGISTRY.get(s, '0' * 64) for s in sorted(named_people(case))}
    return dict(record_id=f"name_reading:{RUN}/{case['caseId']}", kind='name_reading', passage_id=case['passageId'], ref=case['ref'],
                subject_id='local:' + case['personKey'], object_id=None, authority='screening', decision='needs_review', data=data)


class ReadingFixture(unittest.TestCase):
    """Shared setup; holds no tests itself."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.records = [{k: v for k, v in r.items() if k != 'payloadSha256'} for r in FIXTURE['records']]
        self.local, self.candidate, self.corrected = (copy.deepcopy(c['case']) for c in FIXTURE['cases'])

    def run_import(self, changes):
        return import_records(self.root, self.records, changes)

    def rejects(self, message, changes):
        with self.assertRaisesRegex(ValueError, message):
            self.run_import(changes)


class NameReadingTests(ReadingFixture):
    def test_fixture_is_verbatim(self):
        for record in FIXTURE['records']:
            self.assertEqual(digest(encode(record['data'])), record['payloadSha256'])
        self.assertEqual(self.local['reading']['identityStatus'], 'local')
        self.assertEqual(self.candidate['reading']['identityStatus'], 'registry_candidate')

    def test_both_readings_import_as_proposals(self):
        self.assertEqual(self.run_import([reading_record(self.local), reading_record(self.candidate)])['changedRecords'], 2)

    def test_original_fields_are_bound_to_the_saved_case(self):
        record = reading_record(self.local)
        record['data']['relationships']['claims'][0]['readerVerdict'] = 'bad'
        self.rejects('differs from the saved case', [record])
        record = reading_record(self.local)
        record['data']['reading']['reason'] = 'A different reason written after saving.'
        self.rejects('differs from the saved case', [record])

    def test_readings_cannot_alter_graph_facts(self):
        identity = dict(record_id='source_identity:' + self.local['personKey'], kind='source_identity', passage_id=self.local['passageId'],
                        ref=self.local['ref'], subject_id='rabbi-ilfa', authority='source_review', decision='accepted_registry_identity',
                        data=dict(personKey=self.local['personKey'], personId='rabbi-ilfa'))
        self.rejects('cannot alter graph facts', [reading_record(self.local), identity])

    def test_reading_is_a_new_screening_record(self):
        for field, value in [('authority', 'source_review'), ('decision', 'supported')]:
            record = reading_record(self.local)
            record[field] = value
            with self.subTest(field=field):
                self.rejects('Screens must be new', [record])
        self.records.append(reading_record(self.local))
        self.rejects('Screens must be new', [dict(reading_record(self.local), replacesSha256=digest(encode(reading_record(self.local)['data'])))])

    def test_reading_stays_an_unresolved_initial_proposal(self):
        for path, value in [(('reading', 'historicalIdentityResolved'), True), (('reading', 'isInitialProposal'), False),
                            (('reading', 'status'), 'not_reviewed'), (('proposalOnly',), False)]:
            case = copy.deepcopy(self.local)
            target = case
            for step in path[:-1]:
                target = target[step]
            target[path[-1]] = value
            with self.subTest(path=path):
                self.rejects('unresolved initial proposal', [reading_record(case)])

    def test_registry_rules(self):
        case = copy.deepcopy(self.local)
        case['reading']['proposedRegistryId'] = 'rabbi-ilfa'
        self.rejects('Only a registry candidate', [reading_record(case)])
        case = copy.deepcopy(self.candidate)
        case['reading']['proposedRegistryId'] = None
        self.rejects('Only a registry candidate', [reading_record(case)])
        for slug in ('no-such-person', 'rabbi-shmuel-bar-nachmani'):
            case = copy.deepcopy(self.candidate)
            case['reading']['proposedRegistryId'] = slug
            with self.subTest(slug=slug):
                self.rejects('unknown, duplicate or unbound registry person', [reading_record(case)])
        case = copy.deepcopy(self.local)
        case['reading']['alternatives'][0]['registryId'] = 'no-such-person'
        self.rejects('unknown, duplicate or unbound registry person', [reading_record(case)])

    def test_reading_is_bound_to_the_current_source(self):
        for path in (('source', 'livePassagePayloadSha256'), ('source', 'sourceSha256'), ('original', 'livePersonPayloadSha256')):
            case = copy.deepcopy(self.local)
            case[path[0]][path[1]] = '0' * 64
            with self.subTest(path=path):
                self.rejects('not bound to the current source', [reading_record(case)])
        record = reading_record(self.local)
        record['ref'] = 'Jerusalem Talmud Eruvin 10:10:4'
        self.rejects('not bound to the current source', [record])

    def test_reading_indexes_follow_its_person(self):
        for field, value in [('subject_id', 'rabbi-ilfa'), ('object_id', 'rabbi-ilfa'), ('passage_id', 'b001-p4')]:
            record = reading_record(self.local)
            record[field] = value
            with self.subTest(field=field):
                self.rejects('indexes differ from its person|Passage reference differs|Missing passage', [record])
        record = reading_record(self.local)
        record['record_id'] = f'name_reading:{RUN}/case-0000'
        self.rejects('key differs from its case', [record])

    def test_evidence_and_claims_are_exact(self):
        case = copy.deepcopy(self.local)
        case['reading']['evidence'][0]['quote'] += ' נוסף'
        self.rejects('quote is not in its source', [reading_record(case)])
        case = copy.deepcopy(self.local)
        case['reading']['evidence'] = []
        self.rejects('needs evidence', [reading_record(case)])
        for mutate in (lambda c: c['liveClaimRecord'].__setitem__('payloadSha256', '0' * 64), lambda c: c.__setitem__('proposalOnly', False),
                       lambda c: c.__setitem__('quote', c['quote'] + ' נוסף'), lambda c: c['liveClaimRecord'].__setitem__('recordId', 'claim:b001-p3/r9')):
            case = copy.deepcopy(self.local)
            mutate(case['relationships']['claims'][0])
            self.rejects('misstates a claim', [reading_record(case)])
        case = copy.deepcopy(self.local)
        case['reading']['existingReviewedRecords'] = [dict(recordId='graph_node:local:' + case['personKey'], kind='graph_node', decision='supported')]
        self.rejects('misstates an existing reviewed record', [reading_record(case)])


class ReviewBlockerTests(ReadingFixture):
    """Each reproduction from the code review of this importer must now fail."""

    def claim(self, case):
        return case['relationships']['claims'][0]

    def test_copied_claim_fields_are_bound_to_the_live_claim(self):
        for mutate in (lambda c: c.__setitem__('to', c['from']), lambda c: c.__setitem__('kind', 'spouse_of'),
                       lambda c: c['classification'].__setitem__('decision', 'rejected'), lambda c: c.__setitem__('quote', ''),
                       lambda c: c['participants'][0].__setitem__('label', 'שם אחר'), lambda c: c['liveClaimRecord'].__setitem__('decision', 'rejected')):
            case = copy.deepcopy(self.candidate)
            mutate(self.claim(case))
            self.rejects('misstates a claim', [reading_record(case)])

    def test_registry_name_and_evidence_are_bound(self):
        case = copy.deepcopy(self.candidate)
        case['reading']['proposedRegistryName'] = dict(case['reading']['proposedRegistryName'], canonical='Someone Else')
        self.rejects('misstates a registry name', [reading_record(case)])
        case = copy.deepcopy(self.candidate)
        case['reading']['registryEvidence'] = [dict(registryId=case['reading']['proposedRegistryId'], field='bio', quote='a sentence the registry never says')]
        self.rejects('not in the registry record', [reading_record(case)])
        case = copy.deepcopy(self.local)
        stale = {s: '0' * 64 for s in named_people(case)}
        self.rejects('unbound registry person', [reading_record(case, stale)])
        self.rejects('Registry bindings differ', [reading_record(case, dict(REGISTRY))])

    def test_reasons_are_required(self):
        for mutate, message in ((lambda c: c['reading'].pop('reason'), 'needs a reason'), (lambda c: c['reading'].__setitem__('reason', ' '), 'needs a reason'),
                                (lambda c: c['reading']['alternatives'][0].__setitem__('why', ''), 'alternative needs a reason'),
                                (lambda c: c['relationships']['claims'][0].__setitem__('readerVerdictMeaning', ''), 'needs its reason')):
            case = copy.deepcopy(self.local)
            mutate(case)
            self.rejects(message, [reading_record(case)])


class CorrectionTests(ReadingFixture):
    """The Yoma 8:1:9 case as the reader fixed it: the reversed seeing claim is kept but not
    carried, and the seen event sits beside it with the witnesses left unnamed."""

    def mutated(self, change):
        case = copy.deepcopy(self.corrected)
        change(case, case['relationships']['claims'][0])
        return [reading_record(case)]

    def test_corrected_case_imports(self):
        claim = self.corrected['relationships']['claims'][0]
        self.assertEqual((claim['readerVerdict'], claim['carried'], claim['correctedEvent']['observer']['localId']), ('bad', False, None))
        self.assertEqual(self.run_import([reading_record(self.corrected)])['changedRecords'], 1)

    def test_correction_names_the_file_it_replaced(self):
        own = CASE_FILE_SHA[self.corrected['caseId']]
        for change in (lambda case, claim: case.pop('correction'), lambda case, claim: case['correction'].update(supersedesCaseFileSha256=own),
                       lambda case, claim: case['correction'].update(supersedesCaseFileSha256='b9ba3e4e5e21')):
            self.rejects('not bound to the file it replaced', self.mutated(change))

    def test_corrected_claim_matches_its_correction(self):
        self.rejects('does not match its correction', self.mutated(lambda case, claim: claim.update(correctedBy='another-review')))
        self.rejects('does not match its correction', self.mutated(lambda case, claim: claim.update(carried=True)))

    def test_corrected_event_stays_a_sourced_proposal(self):
        for change in (lambda e: e.update(quote=e['quote'] + ' נוסף'), lambda e: e.update(proposalOnly=False),
                       lambda e: e.update(derivedFromClaimId='b407-p8/r6'), lambda e: e['observer'].update(named='name'),
                       lambda e: e['seen'].update(localId='b407-p8/ZZ'), lambda e: e['seen'].update(localId=None)):
            self.rejects('not a sourced proposal', self.mutated(lambda case, claim: change(claim['correctedEvent'])))


if __name__ == '__main__':
    unittest.main()
