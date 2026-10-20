"""compact-source-v4 word units on real captured sources.

Structural only. A right word number does not prove the right person or relationship; that still
needs the interpretation checks. compact_source_v4 is a design-stage module: nothing selects it.
"""
import gzip
import hashlib
import json
import sys
import unicodedata
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from compact_source_v2 import validate as v2  # noqa: E402
from compact_source_v4 import units as U  # noqa: E402

FIX = Path(__file__).parent / 'fixtures'
SHARD = gzip.decompress((FIX / 'quality-210-source-jobs.jsonl.gz').read_bytes())
JOBS = {j['job_id']: j for j in map(json.loads, SHARD.decode().splitlines())}
PAIRED = json.loads(gzip.decompress((FIX / 'paired-source-v3-real.json.gz').read_bytes()))
# three real probe answers that contain known quote errors (prefixes left out, a quote inside א"ר)
PROBE = json.loads((FIX / 'anchor-prefix-v2-real.json').read_text())['cases']
SOURCES = [(j, s) for j in JOBS.values() for s in j['sources']]

# the earlier recipes must not change while v4 is designed
FROZEN = {
    'compact_source_v2/__init__.py': '3c01e45a575583b17742ac9e90635b65f38a8be162b4101ae5cc6a5aba9437fd',
    'compact_source_v2/contract.py': 'd3d96709edda2fb6857d20db5c405ade1ed9063dcb932e7cad5a617c9a71b7e8',
    'compact_source_v2/request.py': '7ff43f0d8a3b92e12f63ae0b88e0ca62a94191954620d0003860521241dbea0d',
    'compact_source_v2/validate.py': '4b87940382083c6e77c1cf34543f84a26ee5f81b1e764f00ba15438a7bd5c2d0',
    'compact_source_v2/reader.md': '465d78d6666c318a5f4aa8a3030cf52154cdb4757242a83e06181bcf5b650e50',
    'compact_source_v3/contract.py': 'd3d96709edda2fb6857d20db5c405ade1ed9063dcb932e7cad5a617c9a71b7e8',
    'compact_source_v3/request.py': '7ff43f0d8a3b92e12f63ae0b88e0ca62a94191954620d0003860521241dbea0d',
    'compact_source_v3/validate.py': '4b87940382083c6e77c1cf34543f84a26ee5f81b1e764f00ba15438a7bd5c2d0',
    'compact_source_v3/reader.md': '3a03c7b73dafdf654f791e81c83614efd4911831d0de85241d5d22489c269717',
    'compact_source_v3/prepare_pair.py': 'eaa3b13b8ec263919655e4889740ec1020b2a61d9129455c06e069c523f37ba8',
}
SHARD_SHA256 = '823e4fb01d29f858e635130229860eae01c506ec5b2dd2e3e822c0b83d192b88'
# unit tables of all 1,046 real sources; a change here needs a new TOKENIZER version
TABLES_SHA256 = '29c613360e45bf58998867d17c11c535d0d82be64e215caacda7a07a9f9d5379'


def source(job_id, source_id):
    return next(s for s in JOBS[job_id]['sources'] if s['source_id'] == source_id)


def word_texts(job_id, source_id):
    return [w['text'] for w in U.words(source(job_id, source_id)['text'])]


def word_range(job_id, source_id, first_word, last_word):
    """Shown unit numbers are word numbers: the n-th through m-th words."""
    return {'source_id': source_id, 'first': first_word, 'last': last_word}


def test_answer(job, people_mentions, evidence):
    return {'schema_version': 'compact-source-v2', 'job_id': job['job_id'],
            'episode': {'coverage': 'complete_for_supplied_text', 'needed_context': [], 'notes': ['structural test only']},
            'people': [{'id': 'p1', 'kind': 'person', 'label': 'test', 'form': 'named', 'setting': 'reported',
                        'mentions': people_mentions, 'reason': 'structural test', 'alternatives': []}],
            'relationships': [{'id': 'r1', 'subject': 'p1', 'object': None, 'alternatives': [], 'relation': 'acts_on',
                               'verb': 'test', 'modality': 'uncertain', 'scene_status': 'actual_report', 'polarity': 'uncertain',
                               'reason': 'structural test', 'evidence': evidence}] if evidence else []}


class CompactSourceV4UnitTests(unittest.TestCase):
    def test_earlier_recipes_are_unchanged(self):
        for name, expected in FROZEN.items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), expected, name)

    def test_fixture_is_the_frozen_210_trial_shard(self):
        self.assertEqual(hashlib.sha256(SHARD).hexdigest(), SHARD_SHA256)
        self.assertEqual(len(JOBS), 210)
        for job, s in SOURCES:
            self.assertEqual(v2.sha(s['text']), s['sha256'], (job['job_id'], s['source_id']))

    def test_units_join_back_to_every_real_source_exactly(self):
        for job, s in SOURCES:
            text, at = s['text'], 0
            us = U.units(text)
            self.assertEqual(''.join(u['text'] for u in us), text)
            self.assertEqual([u['id'] for u in us], list(range(1, len(us) + 1)))
            for u in us:
                self.assertEqual((u['start'], u['text']), (at, text[u['start']:u['end']]), (job['job_id'], s['source_id']))
                at = u['end']
                if u['kind'] == 'space':
                    self.assertTrue(u['text'].isspace())
                elif u['kind'] == 'word':
                    self.assertIn(unicodedata.category(u['text'][0])[0], 'LN')
                else:
                    self.assertFalse(any(c.isspace() or unicodedata.category(c)[0] in 'LN' for c in u['text']), u['text'])
            self.assertEqual(at, len(text))
            listed = U.unit_list(s)
            self.assertEqual(''.join(x[1] for x in listed), text)
            numbers = [x[0] for x in listed]
            self.assertEqual(numbers[numbers[0] == 0:], list(range(1, len(U.words(text)) + 1)))
            self.assertEqual(json.loads(json.dumps(listed, ensure_ascii=False)), listed)
            for u in U.shown_units(text):
                if u['n']:
                    self.assertEqual(text[u['word_start']:u['word_end']], U.words(text)[u['n'] - 1]['text'])

    def test_every_word_passes_the_v2_whole_word_rule(self):
        for job, s in SOURCES:
            text = s['text']
            for w in U.words(text):
                self.assertFalse(v2.hebrew_word_character(text, w['start'] - 1), (job['job_id'], s['source_id'], w))
                self.assertFalse(v2.hebrew_word_character(text, w['end']), (job['job_id'], s['source_id'], w))
                self.assertFalse(unicodedata.combining(text[w['start']]))

    def test_every_word_and_short_range_compiles_through_the_strict_v2_checks(self):
        checked = Counter()
        for job in JOBS.values():
            mentions, evidence, want = [], [], {}
            for s in job['sources']:
                ws = U.words(s['text'])
                for w in ws:
                    mentions.append({'source_id': s['source_id'], 'first': w['n'], 'last': w['n']})
                for length in (2, 3):
                    for k in range(len(ws) - length + 1):
                        evidence.append({'source_id': s['source_id'], 'first': ws[k]['n'], 'last': ws[k + length - 1]['n']})
            answer = test_answer(job, mentions, evidence)
            compiled_answer, envelope = U.compile_answer(job, answer)
            for a in envelope['anchors']:
                want[a['path']] = (a['start'], a['end'])
            record = v2.check(job, compiled_answer)
            for r in record['resolved_anchors']:
                self.assertEqual((r['start'], r['end']), want[r['path']], (job['job_id'], r['path']))
                checked['people' if r['path'].startswith('people/') else 'evidence'] += 1
        self.assertEqual(checked['people'], 23645)
        self.assertGreater(checked['evidence'], 40000)

    def test_known_traps_in_real_sources(self):
        # Bekhorot 29b: the sage רבא first appears inside תרבא ("fat")
        ws = word_texts('v18-bavli-t17155', 's5')
        self.assertEqual((ws[0], ws[5]), ('תרבא', 'רבא'))
        self.assertEqual(U.compile_anchor(source('v18-bavli-t17155', 's5'), word_range('v18-bavli-t17155', 's5', 6, 6))['occurrence'], 2)
        # Eruvin 29a: the DeepInfra low run quoted the second word רב as occurrence 2, which is inside
        # מערבין; by literal count that word is occurrence 4. Its unit number compiles to 4.
        s = source('v18-bavli-005', 's1')
        ws = word_texts('v18-bavli-005', 's1')
        self.assertEqual([n for n, w in enumerate(ws, 1) if w == 'רב'], [8, 20])
        self.assertEqual(ws[8], 'מערבין')
        self.assertEqual(U.compile_anchor(s, word_range('v18-bavli-005', 's1', 20, 20))['occurrence'], 4)
        self.assertEqual(s['text'].find('רב', s['text'].find('רב') + 1), s['text'].find('מערבין') + 2)
        # Bava Metzia 61b: no word starts after the quote mark of א"ר
        ws = word_texts('v18-bavli-051', 's3')
        self.assertEqual(ws[:2], ['א"ר', 'אבהו'])
        self.assertNotIn('ר', [w[:1] for w in ws[1:2]])
        # Avodah Zarah 53b: Rav's own word, not רב inside רבי, and not רב בית נמרוד
        s = source('v18-bavli-036', 's3')
        ws = word_texts('v18-bavli-036', 's3')
        self.assertEqual((ws[0], ws[2], ws[7], ws[8]), ('גמ׳', 'רבי', 'רב', 'בית'))
        rav = U.compile_anchor(s, word_range('v18-bavli-036', 's3', 8, 8))
        self.assertEqual((rav['quote'], rav['occurrence']), ('רב', 2))
        # Avodah Zarah 17a: brackets are marks, not parts of words
        kinds = [(u['kind'], u['text']) for u in U.units(source('v18-bavli-136', 's2')['text'])]
        self.assertIn(('mark', '['), kinds)
        self.assertEqual(kinds[kinds.index(('mark', '[')) + 1], ('word', 'ר"ח'))
        self.assertIn(('mark', ']'), kinds)
        # Chullin 129b: parentheses around a transmitter and a verse reference
        us = [u for u in U.units(source('v18-bavli-011', 's4')['text']) if u['kind'] != 'space']
        self.assertEqual([(u['kind'], u['text']) for u in us[:5]], [('mark', '('), ('word', 'אמר'), ('word', "ר'"), ('word', 'אסי'), ('mark', ')')])
        # Rosh Hashanah 28b, vowelled: marks stay inside their words and nothing is normalized
        s = source('v18-bavli-031', 's3')
        for w in U.words(s['text']):
            self.assertFalse(w['end'] < len(s['text']) and unicodedata.combining(s['text'][w['end']]))
        self.assertEqual(''.join(x[1] for x in U.unit_list(s)), s['text'])
        # attached prefixes and abbreviations are whole words
        all_words = {j: [w['text'] for s in JOBS[j]['sources'] for w in U.words(s['text'])] for j in JOBS}
        self.assertIn('דאביי', all_words['v18-bavli-009'])
        self.assertIn("ר''ע", all_words['v18-bavli-c48368'])
        self.assertIn('אר"ש', all_words['v18-bavli-041'])

    def test_vowelled_quotes_keep_the_source_order_of_marks(self):
        # the trial model's quote here had the same letters and marks in another order; a word
        # number cannot do that, because the quote is a slice of the source
        s = source('v18-bavli-031', 's3')
        typed = 'כְּשֶׁלֹּא נָתַתָּ'
        self.assertNotIn(typed, s['text'])
        self.assertIn(unicodedata.normalize('NFC', typed), unicodedata.normalize('NFC', s['text']))
        ws = U.words(s['text'])
        five_six = U.compile_anchor(s, word_range('v18-bavli-031', 's3', 5, 6))
        self.assertEqual(five_six['quote'], s['text'][ws[4]['start']:ws[5]['end']])
        self.assertEqual(unicodedata.normalize('NFC', five_six['quote']), unicodedata.normalize('NFC', typed))

    def test_existing_v2_answers_as_word_ranges(self):
        tally = Counter()
        for case in PAIRED['cases']:
            job, answer = case['job'], case['baselineAnswer']
            sources = {s['source_id']: s for s in job['sources']}
            if not isinstance(answer, dict):
                tally['no answer'] += 1
                continue
            for p in answer.get('people') or []:
                for m in p.get('mentions') or []:
                    if not isinstance(m, dict) or m.get('source_id') not in sources:
                        tally['malformed'] += 1
                        continue
                    rng, why = U.to_units(sources[m['source_id']], m['quote'], m['occurrence'])
                    if rng and not why:
                        back = U.compile_anchor(sources[m['source_id']], rng)
                        self.assertEqual((back['quote'], back['occurrence']), (m['quote'], m['occurrence']))
                        tally['people: whole words, compiles back exactly'] += 1
                    elif why == 'part of a word':
                        back = U.compile_anchor(sources[m['source_id']], {k: rng[k] for k in ('source_id', 'first', 'last')})
                        self.assertIn(m['quote'], back['quote'])
                        t = sources[m['source_id']]['text']
                        self.assertFalse(v2.hebrew_word_character(t, back['start'] - 1) or v2.hebrew_word_character(t, back['end']))
                        tally['people: part of a word, whole-word range found'] += 1
                    else:
                        tally[f'people: {why}'] += 1
            for r in answer.get('relationships') or []:
                for e in r.get('evidence') or []:
                    if isinstance(e, dict) and e.get('source_id') in sources:
                        rng, why = U.to_units(sources[e['source_id']], e['quote'], e['occurrence'])
                        tally['evidence: whole words' if rng and not why else f'evidence: {why}'] += 1
        # pinned from the 30 saved trial answers; a change means the units or the fixture moved
        self.assertEqual(dict(tally), EXPECTED_ANSWER_TALLY, dict(tally))

    def test_fathers_that_share_one_word_with_the_son(self):
        inside = []
        for case in PAIRED['cases']:
            job, answer = case['job'], case['baselineAnswer']
            if not isinstance(answer, dict):
                continue
            sources = {s['source_id']: s for s in job['sources']}
            for p in answer.get('people') or []:
                if p.get('form') != 'embedded_parent':
                    continue
                for m in p.get('mentions') or []:
                    s = sources.get(m.get('source_id'))
                    if not s:
                        continue
                    rng, why = U.to_units(s, m['quote'], m['occurrence'])
                    if why == 'part of a word' and rng['first'] == rng['last']:
                        inside.append((job['job_id'], m['quote'], U.words(s['text'])[rng['first'] - 1]['text']))
        self.assertEqual(inside, EXPECTED_FATHERS_INSIDE_ONE_WORD)

    def test_failed_probe_quotes_have_a_whole_word_range(self):
        tally, cases = Counter(), []
        for case in PROBE:
            job, answer = case['job'], case['reading']
            sources = {s['source_id']: s for s in job['sources']}
            for p in answer['people']:
                for m in p['mentions']:
                    s = sources[m['source_id']]
                    rng, why = U.to_units(s, m['quote'], m['occurrence'])
                    if not why:
                        tally['whole words already'] += 1
                        continue
                    if why == 'quote not at that occurrence':
                        # a retyped quote that is not in the text at all; v4 has no typed quote to get wrong
                        tally['typed quote not in the text'] += 1
                        cases.append((job['job_id'], m['quote'], None))
                        continue
                    self.assertEqual(why, 'part of a word', m)
                    back = U.compile_anchor(s, {k: rng[k] for k in ('source_id', 'first', 'last')})
                    self.assertIn(m['quote'], back['quote'])
                    self.assertFalse(v2.hebrew_word_character(s['text'], back['start'] - 1) or v2.hebrew_word_character(s['text'], back['end']))
                    tally['part of a word'] += 1
                    cases.append((job['job_id'], m['quote'], back['quote']))
        self.assertEqual((dict(tally), cases), (EXPECTED_PROBE_TALLY, EXPECTED_PROBE_PARTS), (dict(tally), cases))

    def test_bad_anchors_are_rejected(self):
        job = JOBS['v18-bavli-001']
        s = job['sources'][0]
        n = len(U.words(s['text']))
        for anchor, code in [({'source_id': 's9', 'first': 1, 'last': 1}, 'unit_source'),
                             ({'source_id': 's1', 'first': 2, 'last': 1}, 'unit_range'),
                             ({'source_id': 's1', 'first': 0, 'last': 1}, 'unit_range'),
                             ({'source_id': 's1', 'first': 1, 'last': n + 1}, 'unit_range'),
                             ({'source_id': 's1', 'first': 1.0, 'last': 1}, 'unit_range'),
                             ({'source_id': 's1', 'first': '1', 'last': 1}, 'unit_range'),
                             ({'source_id': 's1', 'first': True, 'last': 1}, 'unit_range'),
                             ({'source_id': 's1', 'first': 1, 'last': 1, 'quote': 'x'}, 'unit_anchor')]:
            with self.assertRaises(U.UnitError) as e:
                U.compile_answer(job, test_answer(job, [anchor], []))
            self.assertEqual(e.exception.code, code, anchor)
        bindings = {x['source_id']: U.binding(x) for x in job['sources']}
        bindings['s1'] = dict(bindings['s1'], table_sha256='0' * 64)
        with self.assertRaises(U.UnitError) as e:
            U.compile_answer(job, test_answer(job, [{'source_id': 's1', 'first': 1, 'last': 1}], []), bindings)
        self.assertEqual(e.exception.code, 'unit_binding')

    def test_missing_anchors_and_bad_jobs_are_refused_not_defaulted(self):
        job = JOBS['v18-bavli-001']
        good = test_answer(job, [{'source_id': 's1', 'first': 1, 'last': 1}], [{'source_id': 's1', 'first': 1, 'last': 1}])
        U.compile_answer(job, good)
        cases = []
        a = json.loads(json.dumps(good)); del a['people'][0]['mentions']; cases.append((job, a, 'raw_schema'))
        a = json.loads(json.dumps(good)); a['people'][0]['mentions'] = []; cases.append((job, a, 'raw_schema'))
        a = json.loads(json.dumps(good)); del a['relationships'][0]['evidence']; cases.append((job, a, 'raw_schema'))
        a = json.loads(json.dumps(good)); a['relationships'][0]['evidence'] = []; cases.append((job, a, 'raw_schema'))
        a = json.loads(json.dumps(good)); del a['relationships']; cases.append((job, a, 'raw_schema'))
        twin = json.loads(json.dumps(job)); twin['sources'][1]['source_id'] = 's1'; cases.append((twin, good, 'source_id_duplicate'))
        edited = json.loads(json.dumps(job)); edited['sources'][0]['text'] += ' '; cases.append((edited, good, 'source_hash'))
        for j, a, code in cases:
            with self.assertRaises(U.UnitError) as e:
                U.compile_answer(j, a)
            self.assertEqual(e.exception.code, code)

    def test_word_tables_are_pinned(self):
        self.assertEqual(U.TOKENIZER, 'source-units-v1')
        self.assertEqual(U._digest([U.binding(s) for _, s in SOURCES]), TABLES_SHA256)

    def test_any_character_survives_the_json_unit_list(self):
        # braces occur in one Bavli edition's verse references; nothing in the text is treated as a marker
        text = 'שנאמר {שמות כג } יראה <x> "אמר" \\ back\tslash\nline\u2028end ר\'\' א"ר'
        s = {'source_id': 's1', 'sha256': v2.sha(text), 'text': text}
        listed = U.unit_list(s)
        wire = json.dumps({'source_id': 's1', 'source_sha256': s['sha256'], 'units': listed}, ensure_ascii=False)
        back = json.loads(wire)
        self.assertEqual(''.join(x[1] for x in back['units']), text)
        self.assertEqual(v2.sha(''.join(x[1] for x in back['units'])), back['source_sha256'])


EXPECTED_ANSWER_TALLY = {'people: whole words, compiles back exactly': 143, 'evidence: whole words': 53,
                         'evidence: covers marks only': 1, 'evidence: part of a word': 2, 'no answer': 15}
EXPECTED_PROBE_TALLY = {'whole words already': 12, 'part of a word': 4, 'typed quote not in the text': 1}
EXPECTED_PROBE_PARTS = [('v18-bavli-001', 'ר"ע', 'דר"ע'), ('v18-bavli-001', "ר' יוסי", "דר' יוסי"),
                        ('v18-bavli-001', 'לית ליה היכירא', 'דלית ליה היכירא'), ('v18-bavli-051', "ר' אבהו", None),
                        ('v18-bavli-101', "ר' יהושע", "ור' יהושע")]
EXPECTED_FATHERS_INSIDE_ONE_WORD = []

if __name__ == '__main__':
    unittest.main()
