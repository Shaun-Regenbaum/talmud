"""compact-source-v4 request, raw schema, compile and record on real captured sources and answers.

Structural only: whole-word anchors and passing v2 checks do not certify the reading. Nothing
selects compact_source_v4; no runner, cache or importer uses it.
"""
import copy
import gzip
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from compact_source_v2 import contract as v2c  # noqa: E402
from compact_source_v2 import validate as v2  # noqa: E402
from compact_source_v4 import contract as v4c  # noqa: E402
from compact_source_v4 import dependency  # noqa: E402
from compact_source_v4 import units as U  # noqa: E402
from compact_source_v4 import validate as v4  # noqa: E402
from compact_source_v4.request import build_request  # noqa: E402

FIX = Path(__file__).parent / 'fixtures'
JOBS = {j['job_id']: j for j in map(json.loads, gzip.decompress((FIX / 'quality-210-source-jobs.jsonl.gz').read_bytes()).decode().splitlines())}
PAIRED = json.loads(gzip.decompress((FIX / 'paired-source-v3-real.json.gz').read_bytes()))['cases']
PROBE = json.loads((FIX / 'anchor-prefix-v2-real.json').read_text())['cases']


def as_v4(job, answer, widen=False):
    """Rewrite a saved v2 answer's anchors as unit ranges. Returns None if any anchor is not whole
    words (or, with widen, not inside whole words)."""
    sources = {s['source_id']: s for s in job['sources']}
    out = copy.deepcopy(answer)
    out['schema_version'] = v4c.VERSION

    def conv(a):
        rng, why = U.to_units(sources[a['source_id']], a['quote'], a['occurrence'])
        if rng is None or (why and not widen):
            raise LookupError(why)
        return {k: rng[k] for k in ('source_id', 'first', 'last')}
    try:
        for p in out['people']:
            p['mentions'] = [conv(m) for m in p['mentions']]
        for r in out['relationships']:
            r['evidence'] = [conv(e) for e in r['evidence']]
    except LookupError:
        return None
    return out


def first_valid():
    for case in PAIRED:
        a = case['baselineAnswer']
        if isinstance(a, dict):
            v4a = as_v4(case['job'], a)
            if v4a:
                return case['job'], v4a
    raise AssertionError('no convertible answer')


class CompactSourceV4Tests(unittest.TestCase):
    def test_contract_is_v2_except_the_anchor_and_version(self):
        def swap(node):
            if node == v4c.ANCHOR:
                return v2c.ANCHOR
            if node == {'const': v4c.VERSION}:
                return {'const': v2c.VERSION}
            if isinstance(node, dict):
                return {k: swap(v) for k, v in node.items()}
            if isinstance(node, list):
                return [swap(v) for v in node]
            return node
        self.assertNotEqual(v4c.SCHEMA, v2c.SCHEMA)
        self.assertEqual(swap(v4c.SCHEMA), v2c.SCHEMA)
        self.assertEqual(v4c.RELATIONS, v2c.RELATIONS)
        self.assertEqual(v4c.ANCHOR['required'], ['source_id', 'first', 'last'])
        self.assertFalse(v4c.ANCHOR['additionalProperties'])

    def test_recipe_binds_every_v4_file_and_the_pinned_v2_files(self):
        r = v4.recipe_binding()
        self.assertEqual(set(r['files']), {'contract.py', 'validate.py', 'request.py', 'reader.md', 'units.py', 'body.py', 'dependency.py'})
        for name, h in r['files'].items():
            self.assertEqual(h, v2.sha((ROOT / 'compact_source_v4' / name).read_bytes()))
        self.assertEqual(r['depends_on'], {f'compact_source_v2/{n}': v2.sha((ROOT / 'compact_source_v2' / n).read_bytes())
                                           for n in ('contract.py', 'validate.py', 'request.py', 'reader.md')})
        self.assertEqual((r['tokenizer'], r['display'], r['v2_namespace']), (U.TOKENIZER, U.DISPLAY, dependency.NAMESPACE))
        self.assertEqual(r['sha256'], v2.digest({k: r[k] for k in ('files', 'depends_on', 'v2_namespace', 'tokenizer', 'display')}))
        self.assertNotEqual(r['sha256'], v2.recipe_binding()['sha256'])

    def test_v2_runs_from_pinned_bytes_under_a_hash_name_not_the_ambient_module(self):
        loaded = dependency.V2
        self.assertEqual(loaded.__name__, dependency.NAMESPACE + '.validate')
        self.assertIsNot(loaded, v2)
        self.assertTrue(loaded.__name__.startswith('_compact_source_v2_'))
        self.assertNotEqual(loaded.__name__, v2.__name__)
        self.assertEqual(Path(loaded.__file__).resolve(), (ROOT / 'compact_source_v2/validate.py').resolve())
        self.assertEqual(loaded.SCHEMA, v2.SCHEMA)
        import shutil
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            copy_root = Path(d) / 'compact_source_v2'
            shutil.copytree(ROOT / 'compact_source_v2', copy_root, ignore=shutil.ignore_patterns('__pycache__'))
            (copy_root / 'validate.py').write_bytes((copy_root / 'validate.py').read_bytes() + b'\n# changed\n')
            with self.assertRaises(dependency.DependencyError):
                dependency.load_v2(copy_root)
            (copy_root / 'validate.py').unlink()
            with self.assertRaises(dependency.DependencyError):
                dependency.load_v2(copy_root)
        self.assertIs(dependency.load_v2(), loaded)

    def test_instructions_change_only_how_words_are_pointed_at(self):
        guide = (ROOT / 'compact_source_v4/reader.md').read_text()
        v3guide = (ROOT / 'compact_source_v3/reader.md').read_text()
        self.assertIn('Never type or copy a quote and never count occurrences', guide)
        self.assertNotIn('occurrence (1-based among literal matches)', guide)
        # every v3 paragraph that is not about quoting is kept word for word
        kept = [p for p in v3guide.split('\n\n') if not any(w in p.lower() for w in ('quote', 'occurrence', 'anchor'))]
        self.assertEqual(len(kept), 11)
        for paragraph in kept:
            self.assertIn(paragraph.strip(), guide)

    def test_requests_for_all_210_real_jobs(self):
        for jid, job in JOBS.items():
            req = build_request(job)
            self.assertEqual(req, build_request(job))
            body = json.loads(req['messages'][0]['content'])
            self.assertEqual(body['schema'], v4c.SCHEMA)
            self.assertEqual(body['instructions'], (ROOT / 'compact_source_v4/reader.md').read_text())
            self.assertEqual(req['job_sha256'], v2.digest(job))
            self.assertEqual(req['recipe'], v4.recipe_binding())
            self.assertEqual(req['units'], v4.source_bindings(job))
            self.assertEqual(req['request_sha256'], v2.digest(body))
            for shown, frozen in zip(body['job']['sources'], job['sources']):
                self.assertNotIn('text', shown)
                self.assertEqual(''.join(u[1] for u in shown['units']), frozen['text'])
                self.assertEqual(shown['sha256'], frozen['sha256'])
                self.assertEqual({k: v for k, v in shown.items() if k != 'units'}, {k: v for k, v in frozen.items() if k != 'text'})

    def test_real_answers_pass_and_match_the_v2_verdict(self):
        passed = skipped = 0
        for case in PAIRED:
            job, original = case['job'], case['baselineAnswer']
            if not isinstance(original, dict):
                continue
            v4a = as_v4(job, original)
            if v4a is None:
                skipped += 1
                continue
            req = build_request(job)
            record = v4.check(job, v4a, req)
            # the derived v2-form answer is the original answer, so v2's verdict is identical
            self.assertEqual(record['compile']['derived_v2_answer'], original)
            self.assertEqual(record['v2_check'], v2.check(job, original))
            # the provenance chain: raw v4 answer -> compile -> derived v2-form answer -> v2 verdict
            self.assertEqual(record['raw'], {'schema_version': 'compact-source-v4', 'answer': v4a, 'answer_sha256': v2.digest(v4a)})
            self.assertEqual(record['compile']['derived_from'], record['raw']['answer_sha256'])
            self.assertEqual(record['compile']['derived_v2_answer_sha256'], v2.digest(record['compile']['derived_v2_answer']))
            self.assertEqual(record['binding']['request_sha256'], req['request_sha256'])
            self.assertEqual(record['record_sha256'], v2.digest({k: v for k, v in record.items() if k != 'record_sha256'}))
            self.assertEqual(len(record['compile']['map']), sum(len(p['mentions']) for p in v4a['people']) + sum(len(r['evidence']) for r in v4a['relationships']))
            self.assertEqual(v4.check_saved(job, req, record), record)
            passed += 1
        # 2 saved answers have evidence that is not whole words, so they cannot be rewritten as units
        self.assertEqual((passed, skipped), (13, 2))

    def test_a_saved_record_that_changed_is_refused(self):
        job, v4a = first_valid()
        req = build_request(job)
        record = v4.check(job, v4a, req)
        for path in (('raw', 'answer_sha256'), ('compile', 'derived_from'), ('v2_check', 'answer_sha256'), ('binding', 'job_sha256')):
            bad = copy.deepcopy(record)
            bad[path[0]][path[1]] = '0' * 64
            with self.assertRaises(v4.Invalid) as e:
                v4.check_saved(job, req, bad)
            self.assertEqual(e.exception.code, 'saved_binding')
        bad = copy.deepcopy(record)
        bad['compile']['derived_v2_answer']['people'][0]['mentions'][0]['occurrence'] += 1
        with self.assertRaises(v4.Invalid) as e:
            v4.check_saved(job, req, bad)
        self.assertEqual(e.exception.code, 'saved_binding')

    def test_raw_schema_refuses_instead_of_defaulting(self):
        job, good = first_valid()
        req = build_request(job)
        v4.check(job, good, req)
        edits = {
            'missing mentions': lambda a: a['people'][0].pop('mentions'),
            'empty mentions': lambda a: a['people'][0].__setitem__('mentions', []),
            'missing evidence': lambda a: a['relationships'][0].pop('evidence'),
            'empty evidence': lambda a: a['relationships'][0].__setitem__('evidence', []),
            'missing relationships': lambda a: a.pop('relationships'),
            'a typed quote': lambda a: a['people'][0]['mentions'][0].__setitem__('quote', 'רב'),
            'a fractional unit': lambda a: a['people'][0]['mentions'][0].__setitem__('first', 1.5),
            'unit 0': lambda a: a['people'][0]['mentions'][0].__setitem__('first', 0),
            'the v2 version': lambda a: a.__setitem__('schema_version', 'compact-source-v2'),
        }
        for name, edit in edits.items():
            bad = copy.deepcopy(good)
            edit(bad)
            with self.assertRaises(v4.Invalid) as e:
                v4.check(job, bad, req)
            self.assertEqual(e.exception.code, 'schema', name)
        bad = copy.deepcopy(good)
        bad['job_id'] = 'v18-bavli-999'
        with self.assertRaises(v4.Invalid) as e:
            v4.check(job, bad, req)
        self.assertEqual(e.exception.code, 'job_id')

    def test_an_edited_request_is_refused_even_with_its_metadata_kept(self):
        job, good = first_valid()
        req = build_request(job)
        v4.check(job, good, req)
        body = json.loads(req['messages'][0]['content'])

        def with_body(edit, rehash):
            b = copy.deepcopy(body)
            edit(b)
            r = copy.deepcopy(req)
            r['messages'] = [{'role': 'user', 'content': v2.canonical(b)}]
            if rehash:
                r['request_sha256'] = v2.digest(b)
            return r
        unit = lambda b: b['job']['sources'][0]['units'][1].__setitem__(1, 'רב ')
        guide = lambda b: b.__setitem__('instructions', b['instructions'] + ' Quote freely.')
        schema = lambda b: b['schema']['properties'].__setitem__('job_id', {'type': 'string'})
        cases = {'a unit edited in the shown job': with_body(unit, False),
                 'a unit edited, and the request hash forged to match': with_body(unit, True),
                 'the instructions edited': with_body(guide, False),
                 'the instructions edited, hash forged': with_body(guide, True),
                 'the schema edited, hash forged': with_body(schema, True),
                 'the response format changed': dict(req, response_format={'type': 'text'}),
                 'the request hash changed alone': dict(req, request_sha256='0' * 64)}
        for name, r in cases.items():
            with self.assertRaises(v4.Invalid) as e:
                v4.check(job, good, r)
            self.assertEqual(e.exception.code, 'request_body', name)
        with self.assertRaises(v4.Invalid) as e:
            v4.check(job, good, dict(req, note='extra'))
        self.assertEqual(e.exception.code, 'request')

    def test_unit_ranges_outside_the_source_are_refused(self):
        job, good = first_valid()
        req = build_request(job)
        anchor = good['people'][0]['mentions'][0]
        n = len(U.words(next(s for s in job['sources'] if s['source_id'] == anchor['source_id'])['text']))
        for change, code in ((dict(last=n + 1), 'unit_range'), (dict(first=anchor['last'] + 1, last=anchor['last']), 'unit_range'),
                             (dict(source_id='s9'), 'unit_source')):
            bad = copy.deepcopy(good)
            bad['people'][0]['mentions'][0].update(change)
            with self.assertRaises(v4.Invalid) as e:
                v4.check(job, bad, req)
            self.assertEqual(e.exception.code, code, change)

    def test_the_request_and_job_must_be_the_ones_the_model_saw(self):
        job, good = first_valid()
        req = build_request(job)
        other = build_request(next(j for jid, j in JOBS.items() if jid != job['job_id']))
        cases = [(job, other, 'request_job'),
                 (job, dict(req, units=[dict(b, table_sha256='0' * 64) for b in req['units']]), 'request_units'),
                 (job, dict(req, recipe=dict(req['recipe'], sha256='0' * 64)), 'request_recipe'),
                 (job, dict(req, recipe_version='compact-source-v3'), 'request_recipe'),
                 (job, None, 'request')]
        edited = copy.deepcopy(job)
        edited['sources'][0]['text'] = edited['sources'][0]['text'].replace(' ', '  ', 1)
        cases.append((edited, req, 'source_hash'))
        twin = copy.deepcopy(job)
        twin['sources'][1]['source_id'] = twin['sources'][0]['source_id']
        cases.append((twin, req, 'source_id'))
        for j, r, code in cases:
            with self.assertRaises(v4.Invalid) as e:
                v4.check(j, good, r)
            self.assertEqual(e.exception.code, code)

    def test_the_v2_rules_still_apply_after_compiling(self):
        job, good = first_valid()
        req = build_request(job)
        named = next(p for p in good['people'] if p['form'] == 'named')
        twin = copy.deepcopy(named)
        twin['id'] = 'p99'
        bad = copy.deepcopy(good)
        bad['people'].append(twin)
        with self.assertRaises(v4.Invalid) as e:
            v4.check(job, bad, req)
        self.assertEqual(e.exception.code, 'v2:duplicate_name_identity')

    def test_probe_answers_with_known_quote_errors(self):
        outcomes = []
        for case in PROBE:
            job, reading = case['job'], case['reading']
            v4a = as_v4(job, reading, widen=True)
            if v4a is None:
                outcomes.append((job['job_id'], 'a typed quote is not in the text'))
                continue
            try:
                v4.check(job, v4a, build_request(job))
                outcomes.append((job['job_id'], 'passes'))
            except v4.Invalid as e:
                outcomes.append((job['job_id'], e.code))
        self.assertEqual(outcomes, EXPECTED_PROBE_OUTCOMES)


# the two answers that failed v2 only for dropped prefixes pass once their words are whole units;
# 051's typed quote ר' אבהו is not in the text at all, so it has no unit range to rewrite
EXPECTED_PROBE_OUTCOMES = [('v18-bavli-001', 'passes'), ('v18-bavli-051', 'a typed quote is not in the text'), ('v18-bavli-101', 'passes')]

if __name__ == '__main__':
    unittest.main()
