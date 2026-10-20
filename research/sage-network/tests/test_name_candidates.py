"""First registry candidates from printed names, on the approved v8 readings (001 and 101; 051 is held).

The registry rows are real rows copied from a live revision. Negative cases corrupt those real inputs.
Where a test needs a situation the two readings do not contain, it says so and builds it from their own text.
"""
import copy
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'storage'), str(ROOT / 'identity'), str(ROOT)]
import name_candidates as nc  # noqa: E402
import source_readings  # noqa: E402

FIXTURES = Path(__file__).parent / 'fixtures'
DATA = ROOT.parents[1] / 'packages/talmud/src/lib/data'
READINGS = json.loads((FIXTURES / 'source-reading-real-v8.json').read_text())
REGISTRY = json.loads((FIXTURES / 'name-candidates-registry.json').read_text())
ALIASES = json.loads((DATA / 'rabbi-he-aliases.json').read_text())
DUPLICATES = json.loads((DATA / 'rabbi-duplicates.json').read_text())['duplicates']
PARENT = 'sage-graph-8b0f4c2d379702e96afa'
R001 = 'sr1-ad0865bdfd579608bb25441c125ae17d9a260b9555f181ce925cada5c4ae5ffc'
R101 = 'sr1-8b3d9cdeb11d0f31cf3ee609ad9d6f403bbad4c618862bd33f176c6f0f328dea'


def approved():
    groups = []
    for bundle in READINGS['bundles']:
        try:
            groups.append(source_readings.records(bundle))
        except ValueError:
            continue
    return groups


class NameCandidateTests(unittest.TestCase):
    def setUp(self):
        self.groups = approved()
        self.registry = nc.registry_index([tuple(r) for r in REGISTRY['rows']], ALIASES)

    def build(self, groups=None, **kw):
        cases, skipped = nc.build(self.groups if groups is None else groups, self.registry, DUPLICATES, PARENT, **kw)
        return {c['personKey']: c for c in cases}, skipped

    def test_held_reading_gives_no_people(self):
        self.assertEqual(len(self.groups), 2)
        cases, _ = self.build()
        self.assertEqual({k.split('/')[0] for k in cases}, {R001, R101})

    def test_full_name_is_tentative_and_never_accepted(self):
        case = self.build()[0][R001 + '/p1']
        self.assertEqual((case['status'], case['suggestion']), ('tentative', 'rav-rami-bar-hama'))
        self.assertEqual([c['slug'] for c in case['candidates']], ['rav-rami-bar-hama'])
        self.assertIn('first suggestion only', case['reason'])
        self.assertFalse(case['accepted'] or case['historicalIdentityResolved'] or case['candidateMetadataVerified'])
        # The registry generation stays with the candidate. It is never this person's era.
        self.assertEqual(case['candidates'][0]['generationAsStored'], 'amora-bavel-4')
        self.assertFalse(case['candidates'][0]['metadataVerified'])
        self.assertFalse({'era', 'generation', 'acceptedEra'} & set(case))
        self.assertTrue(case['contextOnly'], 'Rami is printed only in a context segment that another reading owns')

    def test_father_inside_patronymic_stays_local(self):
        case = self.build()[0][R001 + '/p5']
        self.assertEqual(case['status'], 'local_relative')
        self.assertEqual(case['candidates'], [])
        self.assertEqual(case['namedInsidePatronymicOf'], [R001 + '/p1'])

    def test_short_name_with_one_exact_entry_is_only_an_alternative(self):
        cases = self.build()[0]
        rava, meir = cases[R001 + '/p2'], cases[R101 + '/p3']
        self.assertEqual((rava['status'], rava['suggestion']), ('alternatives', None))
        self.assertEqual(rava['candidates'][0]['slug'], 'rava')
        self.assertIn('rava-b-rabbah', [c['slug'] for c in rava['candidates']])
        self.assertEqual((meir['status'], [c['slug'] for c in meir['candidates']]), ('alternatives', ['rabbi-meir']))
        self.assertIn('short name', meir['reason'])

    def test_abbreviation_gives_guesses_not_candidates(self):
        case = self.build()[0][R001 + '/p3']
        mention = case['mentions'][0]
        self.assertEqual((mention['quote'], mention['lookupText']), ('דר"ע', 'ר"ע'))
        reading = dict(abbreviation='ר"ע', readAs='רבי עקיבא', source=nc.MATCHER_LIST, reviewed=False, otherReadingsPossible=True)
        self.assertEqual(mention['forms'], [dict(name='רבי עקיבא', rules=['attached-prefix', 'abbreviation-reading'], readings=[reading])])
        self.assertEqual((case['status'], case['suggestion'], case['candidates']), ('unresolved', None, []))
        self.assertEqual([g['slug'] for g in case['abbreviationGuesses']], ['rabbi-akiva'])
        self.assertEqual(case['abbreviationGuesses'][0]['matchedBy'][0]['readings'], [reading])
        self.assertIn('unreviewed lists', case['reason'])
        self.assertEqual(case['readingLabel'], 'Rabbi Akiva (ר"ע)')

    def test_site_list_reading_is_still_only_a_guess(self):
        # The site's own list reads ר"מ as Rabbi Meir only next to these words; elsewhere it is the matcher's guess.
        site = nc.readings('ר"מ', 'דברי', None)
        self.assertEqual([(r['readAs'], r['source']) for r in site], [('רבי מאיר', nc.SITE_LIST)])
        self.assertEqual([(r['readAs'], r['source']) for r in nc.readings('ר"מ', None, None)], [('רבי מאיר', nc.MATCHER_LIST)])
        inside = nc.forms('דברי ר"מ')['forms'][0]['readings']
        self.assertEqual([r['source'] for r in inside], [nc.SITE_LIST], 'a context word inside the quote counts')
        self.assertTrue(all(r['otherReadingsPossible'] and not r['reviewed'] for r in site + nc.readings('ריב"ל', None, None)))
        self.assertEqual(nc.forms('ר"צ')['forms'], [dict(name='ר"צ', rules=[], readings=[])], 'an unlisted abbreviation is left as printed')

    def test_spelled_out_name_decides_and_its_abbreviation_stays_a_guess(self):
        case = self.build()[0][R101 + '/p1']
        listed = {c['slug'] for c in case['candidates']}
        guesses = {c['slug'] for c in case['abbreviationGuesses']}
        self.assertIn('rabbi-eliezer-b-hyrcanus', listed)
        self.assertTrue(listed and all('eliezer' in s for s in listed))
        self.assertEqual(guesses, {'rabbi-eliezer-b-hyrcanus'}, 'only exact registry names are guessed')
        abbreviated = next(m for m in case['mentions'] if m['nameShape'] == 'abbreviation')
        self.assertEqual([f['name'] for f in abbreviated['forms']], ['רבי אליעזר', 'רבי אלעזר'], 'ר"א can also be Elazar')
        self.assertEqual(case['status'], 'alternatives')

    def test_registry_bare_r_and_duplicates_stay_visible(self):
        case = self.build()[0][R101 + '/p2']
        by_slug = {c['slug']: c for c in case['candidates']}
        self.assertEqual(case['status'], 'alternatives')
        self.assertEqual(by_slug['rabbi-yehoshua-b-hananyah']['registryDuplicate'], {'duplicates': ['rabbi-yehoshua-b-hananiah']})
        self.assertEqual(by_slug['rabbi-yehoshua-b-hananiah']['registryDuplicate'], {'sameAs': 'rabbi-yehoshua-b-hananyah'})

    def test_generic_actors_get_no_match(self):
        _, skipped = self.build()
        self.assertEqual({s['personKey'] for s in skipped}, {R001 + '/p6', R001 + '/p7'})

    def test_relationships_play_no_part(self):
        # Quoted teaching, hypothetical scenes and exchanges must not move a candidate; nor may the build touch them.
        before = copy.deepcopy(self.groups)
        with_claims = self.build()[0]
        self.assertEqual(self.groups, before)
        without = [[r for r in rows if r['kind'] != 'claim'] for rows in self.groups]
        for key, case in self.build(without)[0].items():
            self.assertEqual(nc.encode(case), nc.encode(with_claims[key]))

    def test_record_is_deterministic_and_bound(self):
        cases, _ = self.build()
        again, _ = self.build()
        case = cases[R001 + '/p1']
        record = nc.record(case, nc.rules_sha(), dict(revision=PARENT, recordSetSha256=self.registry['registryRecordSetSha256']))
        self.assertEqual(nc.encode(record), nc.encode(nc.record(again[R001 + '/p1'], nc.rules_sha(), record['data']['registry'])))
        self.assertEqual(record['record_id'], f'name_candidates:v1/{R001}/p1')
        self.assertEqual((record['kind'], record['authority'], record['decision']), ('name_candidates', 'screening', 'needs_review'))
        person = next(r for r in self.groups[0] if r['record_id'] == 'person:' + R001 + '/p1')
        self.assertEqual(case['personPayloadSha256'], nc.digest(person['data']))
        self.assertEqual(case['candidates'][0]['payloadSha256'],
                         next(r[1] for r in REGISTRY['rows'] if r[0] == 'registry_person:rav-rami-bar-hama'))

    def test_changed_inputs_are_refused(self):
        rows = [list(r) for r in REGISTRY['rows']]
        rows[0][2] = rows[0][2].replace('"generation"', '"generationX"')
        with self.assertRaisesRegex(ValueError, 'Registry payload hash differs'):
            nc.registry_index([tuple(r) for r in rows], ALIASES)
        groups = copy.deepcopy(self.groups)
        person = next(r for r in groups[0] if r['record_id'] == 'person:' + R001 + '/p1')
        person['data']['mentions'][0]['start'] += 1
        with self.assertRaisesRegex(ValueError, 'not at its span'):
            self.build(groups)
        groups = copy.deepcopy(self.groups)
        person = next(r for r in groups[0] if r['record_id'] == 'person:' + R001 + '/p1')
        person['data']['mentions'][0]['quote'] = 'רמי בר חמה'
        with self.assertRaisesRegex(ValueError, 'not at its span'):
            self.build(groups)

    def test_human_decision_wins(self):
        cases, skipped = self.build(settled={R001 + '/p1': 'accepted_identity:example'})
        self.assertNotIn(R001 + '/p1', cases)
        self.assertIn('human correction', next(s['reason'] for s in skipped if s['personKey'] == R001 + '/p1'))

    def test_older_reading_of_the_same_words(self):
        # Built for this test from reading 001's own context segment: an older passage holding exactly that
        # segment's text, bound to it, with an older person whose quote is Rami's printed name.
        source = next(s for s in self.groups[0][0]['data']['sourceSegments'] if s['source_id'] == 's2')
        text = source['text']
        old = [('passage:old-p0', 'passage', 'old-p0', json.dumps(dict(source=dict(passage=text)))),
               ('person:old-p0/A', 'person', 'old-p0', json.dumps(dict(id='A', named='name', quote='רמי בר חמא', quoteLocation='passage')))]
        binding = dict(passageId='old-p0', edition=source['edition'], segmentId=source['provenance']['segment_id'], sourceSha256=nc.sha(text))
        self.assertEqual(text.count('רמי בר חמא'), 1)
        cases, skipped = self.build(spans=nc.older_occurrences(old, [binding]))
        self.assertNotIn(R001 + '/p1', cases)
        self.assertEqual(next(s['olderPeople'] for s in skipped if s['personKey'] == R001 + '/p1'), ['old-p0/A'])
        # The father inside the same printed name overlaps it, so it is covered as well.
        self.assertNotIn(R001 + '/p5', cases)
        # A quote printed twice has no single position: the case stays, flagged.
        old[1] = ('person:old-p0/A', 'person', 'old-p0', json.dumps(dict(id='A', named='name', quote='ר', quoteLocation='passage')))
        cases, _ = self.build(spans=nc.older_occurrences(old, [binding]))
        self.assertEqual(cases[R001 + '/p1']['olderReadingMayCover'], ['old-p0/A'])

    def test_repeated_window_keeps_separate_people(self):
        # Built for this test: reading 001's own rows under a second reading ID, standing in for an
        # overlapping window over the same printed words.
        twin = json.loads(json.dumps(self.groups[0]).replace(R001, 'sr1-twin'))
        cases, _ = self.build([self.groups[0], twin])
        self.assertEqual(cases[R001 + '/p1']['sameOccurrenceIn'], ['sr1-twin/p1'])
        self.assertEqual(cases['sr1-twin/p1']['sameOccurrenceIn'], [R001 + '/p1'])
        self.assertEqual({cases[k]['status'] for k in (R001 + '/p1', 'sr1-twin/p1')}, {'tentative'})

    def test_alias_guard_uses_the_next_printed_word(self):
        # Real text of Eruvin 59b:13 (live record passage:b068-p0). The alias רב אמי names Rabbi Ami only when
        # no patronymic follows; here רב אמי בר אדא is someone else.
        text = 'בעי מיניה רב אמי בר אדא הרפנאה מרבה סולם מכאן ופתח מכאן מהו א"ל הכי אמר רב סולם תורת פתח עליו'
        source = dict(text=text, sha256=nc.sha(text), provenance=dict(segment_id='bavli|Eruvin|59b|13|Wikisource Talmud Bavli'))
        mention = dict(quote='רב אמי', start=10, end=16, occurrence=1, occurrenceKey='occ-test', source_id='s1',
                       segmentId=source['provenance']['segment_id'], edition='Wikisource Talmud Bavli', ref='Eruvin 59b:13',
                       source_sha256=source['sha256'], primary=True)
        result = nc.match_mention(mention, source, self.registry)
        self.assertEqual([h['slug'] for h in result['exact']], [])
        self.assertEqual([r['slug'] for r in result['rejected']], ['rabbi-ami'])
        self.assertEqual(result['notes'][0]['rule'], 'continues-with-patronymic')

    def test_one_word_name_retries_once_without_an_attached_letter(self):
        # Real text of Temurah 6a:14 (live record passage:b338-p8): דאביי ורבא, "of Abaye and Rava".
        text = 'אמר ליה רב אחא בריה דרבא לרב אשי והשתא דשנינן כל הני שינויי דאביי ורבא במאי פליגי'
        source = dict(text=text, sha256=nc.sha(text), provenance=dict(segment_id='bavli|Temurah|6a|14|Wikisource Talmud Bavli'))
        mention = dict(quote='ורבא', start=66, end=70, occurrence=1, occurrenceKey='occ-test', source_id='s1',
                       segmentId=source['provenance']['segment_id'], edition='Wikisource Talmud Bavli', ref='Temurah 6a:14',
                       source_sha256=source['sha256'], primary=True)
        result = nc.match_mention(mention, source, self.registry)
        self.assertEqual([f['name'] for f in result['forms']], ['ורבא', 'רבא'])
        self.assertEqual(result['forms'][1]['rules'], ['attached-prefix'])
        self.assertEqual([h['slug'] for h in result['exact']], ['rava'])
        self.assertEqual(result['nameShape'], 'short', 'so it can never become a suggestion')
        mention.update(quote='רבא', start=67)
        self.assertEqual([f['name'] for f in nc.match_mention(mention, source, self.registry)['forms']], ['רבא'], 'no retry when the printed word fits')

    def test_quote_inside_a_longer_word_is_not_a_name(self):
        # Real text of Temurah 6a:14. רבא after an attached ד or ו is a whole word; בא at the end of רבא is not,
        # and neither is the end of השתא inside והשתא. This is the anchor audit's rule.
        text = 'אמר ליה רב אחא בריה דרבא לרב אשי והשתא דשנינן כל הני שינויי דאביי ורבא במאי פליגי'
        at = lambda word, part: (text.index(word) + word.index(part), text.index(word) + word.index(part) + len(part))
        self.assertTrue(nc.on_word_edges(text, *at('דרבא', 'רבא')))
        self.assertTrue(nc.on_word_edges(text, *at('ורבא', 'ורבא')))
        self.assertFalse(nc.on_word_edges(text, *at('ורבא', 'בא')))
        self.assertFalse(nc.on_word_edges(text, *at('והשתא', 'שת')))
        start, end = at('ורבא', 'בא')
        source = dict(text=text, sha256=nc.sha(text), provenance=dict(segment_id='bavli|Temurah|6a|14|Wikisource Talmud Bavli'))
        mention = dict(quote='בא', start=start, end=end, occurrence=1, occurrenceKey='occ-test', source_id='s1',
                       segmentId=source['provenance']['segment_id'], edition='Wikisource Talmud Bavli', ref='Temurah 6a:14',
                       source_sha256=source['sha256'], primary=True)
        result = nc.match_mention(mention, source, self.registry)
        self.assertEqual((result['forms'], result['exact'], result['notes'][0]['rule']), ([], [], 'inside-a-word'))

    def test_registry_rows_that_are_not_sages_are_never_candidates(self):
        ts = (DATA.parent / 'nonSageTopics.ts').read_text()
        listed = set(re.findall(r"'([^']+)'", ts[ts.index('new Set(['):ts.index('])')]))
        self.assertEqual(listed, set(nc.NON_SAGE_SLUGS), 'keep the Python copy equal to the site list')
        self.assertIn("includes('קבלה')", ts)
        self.assertTrue(nc.is_non_sage_topic('mordechai1', 'מרדכי'))
        self.assertTrue(nc.is_non_sage_topic('sefira1', 'סְפִירָה (קבלה)'))
        self.assertFalse(nc.is_non_sage_topic('rava', 'רבא'))

    def test_lookup_rules(self):
        self.assertEqual(nc.forms('מהר"ל')['forms'], [dict(name='מהר"ל', rules=[], readings=[])], 'an abbreviation is never cut down')
        self.assertEqual(nc.forms('ולר"ע')['forms'][0]['name'], 'רבי עקיבא')
        self.assertEqual([f['name'] for f in nc.forms("ור' יהושע")['forms']], ['רבי יהושע'])
        self.assertEqual([f['name'] for f in nc.forms("מדר' סימאי")['forms']], ['רבי סימאי'])
        self.assertEqual(nc.registry_form('רבן שמעון בן גמליאל (2)')[0::2], ('רבן שמעון בן גמליאל', ['2']))
        self.assertEqual(nc.registry_form('ר יוסי בר חנינא')[0], 'רבי יוסי בר חנינא')
        self.assertEqual(nc.shape('רמי בר חמא', False), 'full')
        self.assertEqual(nc.shape('רבי מאיר', False), 'short')
        self.assertEqual(nc.shape('מר עוקבא', False), 'short')

    def test_quote_cut_before_a_patronymic_blocks_the_suggestion(self):
        # Real text of Eruvin 55b:5 (live record passage:b342-p6). רבא בריה דרבה is a full registry name, but the
        # source goes on: רבא בריה דרבה בר רב הונא. Reading 101's Rabbi Meir is moved onto this text for the test.
        text = 'וכמה הוי בין יתר לקשת רבה בר רב הונא אמר אלפים אמה רבא בריה דרבה בר רב הונא אמר אפילו יתר מאלפים אמה'
        groups = copy.deepcopy(self.groups)
        passage = next(r for r in groups[1] if r['kind'] == 'passage')
        person = next(r for r in groups[1] if r['record_id'] == 'person:' + R101 + '/p3')
        m = person['data']['mentions'][0]
        source = next(s for s in passage['data']['sourceSegments'] if s['source_id'] == m['source_id'])
        source.update(text=text, sha256=nc.sha(text))
        m.update(quote='רבא בריה דרבה', start=51, end=64)
        case = self.build(groups)[0][R101 + '/p3']
        self.assertEqual(case['mentions'][0]['exact'][0]['slug'], 'rava-b-rabbah')
        self.assertEqual(case['mentions'][0]['notes'][0]['word'], 'בר')
        self.assertEqual((case['status'], case['suggestion']), ('alternatives', None))
        self.assertIn('may be longer', case['reason'])

    def test_labelled_registry_name_is_never_tentative(self):
        # Built for this test from reading 101's own rows: Rabbi Meir's printed name replaced by a full name
        # whose registry rows carry labels, with the segment text changed to match so the anchor holds.
        groups = copy.deepcopy(self.groups)
        rows = groups[1]
        passage = next(r for r in rows if r['kind'] == 'passage')
        person = next(r for r in rows if r['record_id'] == 'person:' + R101 + '/p3')
        m = person['data']['mentions'][0]
        source = next(s for s in passage['data']['sourceSegments'] if s['source_id'] == m['source_id'])
        name = 'רבן שמעון בן גמליאל'
        source['text'] = source['text'][:m['start']] + name + source['text'][m['end']:]
        m.update(quote=name, end=m['start'] + len(name))
        case = self.build(groups)[0][R101 + '/p3']
        self.assertEqual(case['status'], 'alternatives')
        self.assertIn('label (2)', case['reason'])
        self.assertEqual({c['slug'] for c in case['candidates']}, {'rabban-shimon-b-gamliel-(ii)', 'rabban-shimon-b-gamliel-the-elder'})


if __name__ == '__main__':
    unittest.main()
