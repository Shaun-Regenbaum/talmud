"""Real captured readings; explicit fault mutations are never publication approvals."""
import copy
import gzip
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from checked_source.validate import VERSION, check, digest, original, sha
from ownership.tile_ownership import OwnershipIndex

FIXTURE = json.loads(gzip.decompress((Path(__file__).parent / 'fixtures/checked-source/actual-four.json.gz').read_bytes()))


def evidence(source, quote):
    start = source['text'].index(quote)
    return dict(sourceId=source['source_id'], edition=source['edition'],
                segmentId=source['provenance']['segment_id'], sourceSha256=source['sha256'],
                start=start, end=start + len(quote), quote=quote)


def make_bundle(jid='v18-bavli-q33735'):
    bundle = copy.deepcopy(FIXTURE['cases'][jid])
    bundle['config'] = copy.deepcopy(FIXTURE['config'])
    sources, answer, derived, binding, _ = original(bundle)
    review = {'testOnly': True, 'jobHash': binding['jobHash'], 'note': 'Fixture decisions for validator tests; not publication authority.'}
    review = json.dumps(review, ensure_ascii=False) + '\n'
    rh = sha(review.encode())
    decisions = []
    mapping = {a['path']: a for a in json.loads(bundle['rawResultText'])['compiled']['compile']['map']}
    for kind, field in [('person', 'people'), ('connection', 'relationships')]:
        for item in answer[field]:
            orig_id = item['id']
            after = None
            if kind == 'person':
                old = next(p for p in derived['people'] if p['id'] == orig_id)
                after = {k: old[k] for k in ('id', 'label', 'kind', 'form', 'setting', 'reason')}
                mentions = []
                for i, m in enumerate(old['mentions']):
                    a = mapping[f'people/{orig_id}/mentions/{i}'];s = sources[m['source_id']]
                    exact = evidence(s, m['quote']);exact.update(start=a['start'], end=a['end'])
                    role = 'printed_name' if old['form'] in ('named', 'embedded_parent') else 'referential_evidence'
                    mentions.append(dict(role=role, span=exact))
                after['mentions'] = mentions
                ev = [mentions[0]['span']]
            else:
                old = next(p for p in derived['relationships'] if p['id'] == orig_id)
                ev = [evidence(sources[old['evidence'][0]['source_id']], old['evidence'][0]['quote'])]
            decisions.append(dict(id=f'{kind}:{orig_id}', kind=kind, originalId=orig_id,
                                  action='replace' if after else 'hold', beforeHash=digest(item), after=after,
                                  reason='Explicit test disposition', evidence=ev, reviewHashes=[rh]))
    bundle.update(plan=dict(version=VERSION, binding=binding,
                            ownershipHash=FIXTURE['ownership']['manifest']['manifestSha256'], decisions=decisions,
                            coverage=[dict(sourceId=sid, status='partial', holes=['Unreviewed test items remain']) for sid in sources]),
                  approval={}, reviews=[review])
    return approve(bundle)


def approve(bundle):
    bundle['approval'] = dict(planHash=digest(bundle['plan']), decisions=[digest(d) for d in bundle['plan']['decisions']],
                              reviewHashes=[sha(r.encode()) for r in bundle['reviews']])
    return bundle


def run(bundle):
    return check(bundle, expected_plan_hash=digest(bundle['plan']), expected_approval_hash=digest(bundle['approval']),
                 ownership_index=OwnershipIndex(FIXTURE['ownership'], FIXTURE['ownership']['manifest']['manifestSha256']))


def retain_pair(bundle, rid, participants, broad, subject=None, object_=None, predicate=None):
    d = next(d for d in bundle['plan']['decisions'] if d['id'] == 'connection:' + rid)
    d['action'] = 'replace'
    d['after'] = dict(id=rid, participants=participants, broadType=broad,
                      direction=dict(status='supported' if subject else 'held', subject=subject, object=object_),
                      predicate=dict(status='supported' if predicate else 'held', value=predicate),
                      outcome=dict(status='held', value=None), evidence=d['evidence'], reason=d['reason'])
    return approve(bundle)


class CheckedSourceTests(unittest.TestCase):
    def test_correct_direction_preserves_pair(self):
        b = retain_pair(make_bundle(), 'r4', ['p5', 'p7'], 'direct_interaction', 'p7', 'p5', 'speaks_to')
        result = run(b)
        self.assertEqual(result['connections'][0]['direction']['subject'], 'p7')
        self.assertFalse(result['wholeReadingFullyChecked'])
        self.assertEqual(json.loads(b['rawResultText'])['answer']['relationships'][3]['subject'], 'p5')
        self.assertEqual(result['status'], 'needs_review')
        self.assertFalse(result['connections'][0]['establishesMeeting'])

    def test_intellectual_contrast_needs_no_direction(self):
        b = retain_pair(make_bundle('v18-bavli-t01082'), 'r2', ['p2', 'p3'], 'intellectual_connection')
        c = run(b)['connections'][0]
        self.assertIsNone(c['direction']['subject'])
        self.assertFalse(c['establishesMeeting'])
        self.assertIsNone(c['predicate']['value'])

    def test_unnamed_references_survive_without_name_highlights(self):
        b = retain_pair(make_bundle('v18-bavli-t69061'), 'r4', ['p5', 'p2'], 'direct_interaction', 'p5', 'p2', 'speaks_to')
        out = run(b)
        matron = next(p for p in out['people'] if p['id'] == 'p5')
        self.assertTrue(any(m['quote'] == 'אמרה' for m in matron['mentions']))
        self.assertFalse(any(m['namePlacementEligible'] for m in matron['mentions']))
        self.assertEqual(len(out['connections']), 1)

    def test_stale_before_hash_rejected(self):
        b = make_bundle();b['plan']['decisions'][0]['beforeHash'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Stale'): run(approve(b))

    def test_changed_receipt_rejected(self):
        b = make_bundle();b['reviews'][0] += ' '
        with self.assertRaisesRegex(ValueError, 'Review receipt'): run(b)

    def test_missing_disposition_rejected(self):
        b = make_bundle();b['plan']['decisions'].pop()
        with self.assertRaisesRegex(ValueError, 'missing dispositions'): run(approve(b))

    def test_wrong_edition_rejected(self):
        b = make_bundle();b['plan']['decisions'][0]['after']['mentions'][0]['span']['edition'] = 'wrong'
        with self.assertRaisesRegex(ValueError, 'Source identity'): run(approve(b))

    def test_unknown_fields_rejected(self):
        b = make_bundle();b['plan']['decisions'][0]['after']['generation'] = 'amora1'
        with self.assertRaisesRegex(ValueError, 'Unexpected fields'): run(approve(b))

    def test_rejected_endpoint_rejected(self):
        b = retain_pair(make_bundle(), 'r4', ['p5', 'p7'], 'direct_interaction', 'p7', 'p5', 'speaks_to')
        d = next(d for d in b['plan']['decisions'] if d['id'] == 'person:p5');d.update(action='reject', after=None)
        with self.assertRaisesRegex(ValueError, 'Invalid retained pair'): run(approve(b))

    def test_partial_word_rejected(self):
        b = make_bundle();s = b['plan']['decisions'][0]['after']['mentions'][0]['span'];s['start'] += 1;s['quote'] = s['quote'][1:]
        with self.assertRaisesRegex(ValueError, 'Partial word'): run(approve(b))

    def test_held_direction_cannot_keep_directed_predicate(self):
        b = retain_pair(make_bundle('v18-bavli-t01082'), 'r2', ['p2', 'p3'], 'intellectual_connection', predicate='opposes')
        with self.assertRaisesRegex(ValueError, 'Specific predicate'): run(b)

    def test_original_result_hash_rejected(self):
        b = make_bundle();raw=json.loads(b['rawResultText']);raw['status']='failed';b['rawResultText']=json.dumps(raw)
        with self.assertRaisesRegex(ValueError, 'Result checksum'): run(b)

    def test_missing_coverage_rejected(self):
        b=make_bundle();b['plan']['coverage'].pop()
        with self.assertRaisesRegex(ValueError, 'Missing supplied'): run(approve(b))

    def test_failed_raw_stays_failed_when_source_person_added(self):
        b = copy.deepcopy(FIXTURE['cases']['v18-bavli-q22960'])
        b['config'] = copy.deepcopy(FIXTURE['config'])
        sources, answer, derived, binding, error = original(b)
        self.assertIsNone(derived)
        self.assertIn('schema', error)
        review = {'testOnly': True, 'sourceReview': 'Explicit fixture addition, not publication approval'}
        review = json.dumps(review) + '\n'
        rh = sha(review.encode())
        e = evidence(b['job']['sources'][0], 'רבי יעקב')
        decisions = []
        for kind, field in [('person', 'people'), ('connection', 'relationships')]:
            for item in answer[field]:
                decisions.append(dict(id=kind + ':' + item['id'], kind=kind, originalId=item['id'], action='hold',
                                      beforeHash=digest(item), after=None, reason='Unreviewed failed-answer item',
                                      evidence=[e], reviewHashes=[rh]))
        decisions.append(dict(id='add-jacob', kind='person', originalId=None, action='add', beforeHash=None,
                              after=dict(id='add:jacob', label='רבי יעקב', kind='person', form='named', setting='reported',
                                         mentions=[dict(role='printed_name', span=e)], reason='Explicit source name'),
                              reason='Independent source addition', evidence=[e], reviewHashes=[rh]))
        b.update(plan=dict(version=VERSION, binding=binding,
                           ownershipHash=FIXTURE['ownership']['manifest']['manifestSha256'], decisions=decisions,
                           coverage=[dict(sourceId=sid, status='partial', holes=['Other items held']) for sid in sources]),
                 reviews=[review], approval={})
        out = run(approve(b))
        self.assertEqual(out['originalStatus'], 'failed')
        self.assertFalse(out['wholeReadingFullyChecked'])
        self.assertEqual([p['id'] for p in out['people']], ['add:jacob'])
        self.assertEqual(out['connections'], [])

    def test_retain_operation_is_not_a_silent_replacement(self):
        b=make_bundle();b['plan']['decisions'][0]['action']='retain'
        with self.assertRaisesRegex(ValueError, 'Unknown operation'): run(approve(b))

    def test_duplicate_json_keys_rejected(self):
        b=make_bundle();b['reviews'][0]='{"a":1,"a":2}'
        old=b['plan']['decisions'][0]['reviewHashes'][0]
        new=sha(b['reviews'][0].encode())
        for d in b['plan']['decisions']: d['reviewHashes']=[new]
        with self.assertRaisesRegex(ValueError, 'Duplicate JSON key'): run(approve(b))

    def test_competing_name_placement_rejected(self):
        b=make_bundle();a=b['plan']['decisions'][0]['after'];other=b['plan']['decisions'][1]['after']
        other['mentions']=copy.deepcopy(a['mentions'])
        with self.assertRaisesRegex(ValueError, 'Competing printed-name'): run(approve(b))

    def test_independent_plan_pin(self):
        b=make_bundle()
        with self.assertRaisesRegex(ValueError, 'Unapproved plan'):
            check(b, expected_plan_hash='0'*64, expected_approval_hash=digest(b['approval']), ownership_index=None)


if __name__ == '__main__':
    unittest.main()
