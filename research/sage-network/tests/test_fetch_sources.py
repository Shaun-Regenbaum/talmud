"""The fetcher on real Sefaria replies (tests/fixtures/sefaria, fetched 2026-10-20).

Sifrei Zuta and Mekhilta DeRabbi Shimon begin with empty chapter slots, like a
Bavli tractate. The old rule took that for Talmud pages, and Sefaria answered
every "page" with the whole book, so one text was captured under many labels.
"""
import importlib.util, json, os, sys, unittest, urllib.parse

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'pipeline'))
spec = importlib.util.spec_from_file_location('fetch', os.path.join(HERE, '..', 'pipeline', '01_fetch.py'))
fetch = importlib.util.module_from_spec(spec); spec.loader.exec_module(fetch)
FIX = os.path.join(HERE, 'fixtures', 'sefaria')
SZ, MK = 'Sifrei Zuta', 'Mekhilta DeRabbi Shimon Ben Yochai'


def load(name):
    with open(os.path.join(FIX, name)) as f:
        return json.load(f)


def server(files):
    """A stand-in for Sefaria that answers from saved replies; anything else is a 404 (None)."""
    def get(path):
        name = files.get(urllib.parse.unquote(path))
        return load(name) if name else None
    return get


SEFARIA = server({
    f'v2/raw/index/{SZ}': 'index-sifrei-zuta.json', f'shape/{SZ}': 'shape-sifrei-zuta.json',
    f'v2/raw/index/{MK}': 'index-mekhilta-drs.json', f'shape/{MK}': 'shape-mekhilta-drs.json',
    f'shape/{MK}, Additions': 'shape-mekhilta-drs-additions.json',
    'v2/raw/index/Berakhot': 'index-berakhot.json', 'shape/Berakhot': 'shape-berakhot.json',
    'v2/raw/index/Jerusalem Talmud Berakhot': 'index-jt-berakhot.json',
    'shape/Jerusalem Talmud Berakhot': 'shape-jt-berakhot.json',
})


def non_empty_numbers(chapters):
    return [str(i + 1) for i, c in enumerate(chapters) if c]


class UnitsComeFromTheIndexAddressTypes(unittest.TestCase):
    def test_sifrei_zuta_is_numbered_chapters_not_pages(self):
        units = fetch.chapter_refs(SZ, SEFARIA)
        expected = non_empty_numbers(load('shape-sifrei-zuta.json')[0]['chapters'])
        self.assertEqual([u for u, _ in units], expected)
        self.assertEqual(units[0], ('5', 'Sifrei Zuta 5'))
        self.assertEqual(len(units), 17)

    def test_mekhilta_main_part_and_its_additions(self):
        units = fetch.chapter_refs(MK, SEFARIA)
        shape = load('shape-mekhilta-drs.json')
        main = non_empty_numbers(shape['chapters'] if isinstance(shape, dict) else shape[0]['chapters'])
        adds = [f'mekhilta-derabbi-shimon-ben-yochai-additions-{n}'
                for n in non_empty_numbers(load('shape-mekhilta-drs-additions.json')[0]['chapters'])]
        self.assertEqual([u for u, _ in units], main + adds)
        self.assertEqual(len(main), 18)
        self.assertIn(('mekhilta-derabbi-shimon-ben-yochai-additions-3', f'{MK}, Additions 3'), units)

    def test_bavli_pages(self):
        units = fetch.chapter_refs('Berakhot', SEFARIA)
        chapters = load('shape-berakhot.json')[0]['chapters']
        self.assertEqual(units[0], ('2a', 'Berakhot 2a'))
        self.assertEqual(len(units), sum(1 for c in chapters if c))
        self.assertTrue(all(u[-1] in 'ab' for u, _ in units))

    def test_yerushalmi_chapters(self):
        units = fetch.chapter_refs('Jerusalem Talmud Berakhot', SEFARIA)
        self.assertEqual([u for u, _ in units], [str(n) for n in range(1, 10)])
        self.assertEqual(units[0][1], 'Jerusalem Talmud Berakhot 1')

    def test_index_address_types(self):
        self.assertEqual(fetch.index_address_types(load('index-berakhot.json'), 'Berakhot'), {'Berakhot': ['Talmud', 'Integer']})
        types = fetch.index_address_types(load('index-mekhilta-drs.json'), MK)
        self.assertEqual(sorted(types), [MK, f'{MK}, Additions'])
        self.assertEqual(types[MK][0], 'Perek')


class NothingIsGuessed(unittest.TestCase):
    def test_a_page_like_shape_without_an_index_is_refused(self):
        no_index = server({f'shape/{SZ}': 'shape-sifrei-zuta.json'})
        with self.assertRaises(fetch.MissingIndex):
            fetch.chapter_refs(SZ, no_index)

    def test_the_old_slot_rule_alone_would_have_called_these_pages(self):
        for name in ('shape-sifrei-zuta.json', 'shape-mekhilta-drs.json', 'shape-mekhilta-drs-additions.json'):
            node = load(name)
            node = node[0] if isinstance(node, list) else node
            with self.assertRaises(fetch.AmbiguousShape):
                fetch._is_talmud_daf(node)

    def test_a_named_part_whose_shape_is_withheld_is_not_dropped(self):
        # The real Mekhilta index lists Additions; without its shape all 7 Additions chapters would vanish.
        files = {f'v2/raw/index/{MK}': 'index-mekhilta-drs.json', f'shape/{MK}': 'shape-mekhilta-drs.json'}
        with self.assertRaises(fetch.MissingPartShape):
            fetch.chapter_refs(MK, server(files))

    def test_a_named_part_whose_shape_is_unusable_is_not_dropped(self):
        # A real Sefaria error reply ({"error": ...}, from text-replies.json) standing where the part's shape should be.
        error_reply = next(r['reply'] for r in load('text-replies.json')['replies'] if r['reply'].get('error'))
        base = server({f'v2/raw/index/{MK}': 'index-mekhilta-drs.json', f'shape/{MK}': 'shape-mekhilta-drs.json'})

        def get(path):
            return {'error': error_reply['error']} if urllib.parse.unquote(path) == f'shape/{MK}, Additions' else base(path)
        with self.assertRaises(fetch.MissingPartShape):
            fetch.chapter_refs(MK, get)

    def test_a_missing_index_fails_even_when_the_shape_cannot_be_pages(self):
        # Without the index, named parts such as the Mekhilta's Additions could not be found.
        no_index = server({'shape/Jerusalem Talmud Berakhot': 'shape-jt-berakhot.json'})
        with self.assertRaises(fetch.MissingIndex):
            fetch.chapter_refs('Jerusalem Talmud Berakhot', no_index)
        with self.assertRaises(fetch.MissingIndex):
            fetch.chapter_refs(MK, server({f'shape/{MK}': 'shape-mekhilta-drs.json', f'shape/{MK}, Additions': 'shape-mekhilta-drs-additions.json'}))

    def test_an_unusable_index_fails(self):
        error_reply = next(r['reply'] for r in load('text-replies.json')['replies'] if r['reply'].get('error'))
        base = server({f'shape/{MK}': 'shape-mekhilta-drs.json'})

        def get(path):
            return {'error': error_reply['error']} if urllib.parse.unquote(path) == f'v2/raw/index/{MK}' else base(path)
        with self.assertRaises(fetch.MissingIndex):
            fetch.chapter_refs(MK, get)

    def test_a_named_exception_lets_a_work_through_without_an_index_and_is_recorded(self):
        no_index = server({'shape/Jerusalem Talmud Berakhot': 'shape-jt-berakhot.json'})
        saved = dict(fetch.NO_INDEX_EXCEPTIONS), list(fetch.index_exceptions)
        fetch.NO_INDEX_EXCEPTIONS['Jerusalem Talmud Berakhot'] = 'exception under test'
        fetch.index_exceptions.clear()
        try:
            self.assertEqual(len(fetch.chapter_refs('Jerusalem Talmud Berakhot', no_index)), 9)
            self.assertEqual(fetch.index_exceptions, [{'work': 'Jerusalem Talmud Berakhot', 'reason': 'exception under test'}])
        finally:
            fetch.NO_INDEX_EXCEPTIONS.clear(); fetch.NO_INDEX_EXCEPTIONS.update(saved[0])
            fetch.index_exceptions[:] = saved[1]

    def test_no_work_is_excepted_by_default(self):
        self.assertEqual(fetch.NO_INDEX_EXCEPTIONS, {})


class ARepliedReferenceMustBeTheOneAskedFor(unittest.TestCase):
    replies = {r['requestedRef']: r for r in load('text-replies.json')['replies']}

    def check(self, ref, edition=None):
        r = self.replies[ref]
        return fetch.response_problem(r['reply'], ref, edition or r['requestedEdition'] or r['reply']['versions'][0]['versionTitle'])

    def test_a_whole_book_answer_is_refused(self):
        self.assertIn("Sefaria answered 'Sifrei Zuta'", self.check('Sifrei Zuta 3a'))
        self.assertIn(f"Sefaria answered '{MK}'", self.check(f'{MK} 10b'))
        self.assertEqual(self.replies['Sifrei Zuta 3a']['segmentsInReply'], 726)

    def test_real_chapters_pages_and_parts_are_kept(self):
        for ref in ('Sifrei Zuta 5', f'{MK} 12', 'Berakhot 2a', 'Jerusalem Talmud Berakhot 1', f'{MK}, Additions 3'):
            self.assertIsNone(self.check(ref), ref)

    def test_another_edition_is_refused(self):
        self.assertIn('asked for edition', self.check('Sifrei Zuta 5', edition='Some other edition'))

    def test_an_empty_answer_is_refused(self):
        self.assertIsNotNone(self.check(f'{MK}, Additions 1', edition='x'))


class AUnitWithoutTextIsRecordedNeverSkipped(unittest.TestCase):
    """fetch_work on real replies: one with text, one with none, and the whole-book answer."""
    ED = 'Mechilta de-Rabbi Simon b. Jochai, Dr. D. Hoffman, Frankfurt 1905'
    replies = {r['requestedRef']: r['reply'] for r in load('text-replies.json')['replies']}

    def run_work(self, units, answers):
        import tempfile
        saved = (fetch.get, fetch.hebrew_editions, fetch.chapter_refs, fetch.RAW, list(fetch.absences))
        tmp = tempfile.mkdtemp()
        fetch.get = lambda path: answers.get(urllib.parse.unquote(path.split('/', 2)[2].split('?')[0]), None)
        fetch.hebrew_editions = lambda title: [self.ED]
        fetch.chapter_refs = lambda title: units
        fetch.RAW = tmp
        fetch.absences.clear()
        try:
            fetch.fetch_work('midrash-halakhah', MK)
            return tmp, list(fetch.absences)
        finally:
            fetch.get, fetch.hebrew_editions, fetch.chapter_refs, fetch.RAW = saved[:4]
            fetch.absences[:] = saved[4]

    def test_text_is_saved_and_an_empty_unit_is_listed(self):
        full = load('text-mk-additions-3-full.json')
        tmp, absent = self.run_work(
            [('mekhilta-derabbi-shimon-ben-yochai-additions-1', f'{MK}, Additions 1'), ('mekhilta-derabbi-shimon-ben-yochai-additions-3', f'{MK}, Additions 3')],
            {f'{MK}, Additions 1': self.replies[f'{MK}, Additions 1'], f'{MK}, Additions 3': full})
        saved = [os.path.join(d, f) for d, _, fs in os.walk(tmp) for f in fs]
        self.assertEqual(len(saved), 1)
        with open(saved[0]) as f:
            rec = json.load(f)
        self.assertEqual(rec['ref'], f'{MK}, Additions 3')
        self.assertEqual(rec['nSegments'], len(full['versions'][0]['text']))
        self.assertEqual([a['ref'] for a in absent], [f'{MK}, Additions 1'])
        self.assertIn('We have no text', absent[0]['reason'])

    def test_no_reply_stops_the_work(self):
        with self.assertRaises(fetch.ResponseMismatch):
            self.run_work([('3', f'{MK} 3')], {})

    def test_a_whole_book_answer_stops_the_work(self):
        with self.assertRaises(fetch.ResponseMismatch):
            self.run_work([('10b', f'{MK} 10b')], {f'{MK} 10b': self.replies[f'{MK} 10b']})

    def test_exit_status(self):
        self.assertEqual(fetch.exit_status([], []), 0)
        self.assertEqual(fetch.exit_status([], [{'unit': '1'}]), 2)
        self.assertEqual(fetch.exit_status([{'work': 'x'}], [{'unit': '1'}]), 1)


class MissingDataIsAFailureNotAnEmptyWork(unittest.TestCase):
    """Withhold one real reply at a time; the work must fail, never pass as captured with nothing."""
    FULL = {f'v2/raw/index/{MK}': 'index-mekhilta-drs.json', f'shape/{MK}': 'shape-mekhilta-drs.json',
            f'shape/{MK}, Additions': 'shape-mekhilta-drs-additions.json', f'texts/versions/{MK}': 'versions-mekhilta-drs.json'}

    def with_sefaria(self, files, fn, override=None):
        saved = fetch.get
        base = server(files)
        fetch.get = (lambda path: override(path) if override and override(path) is not None else base(path))
        try:
            return fn()
        finally:
            fetch.get = saved

    def without(self, key):
        return {k: v for k, v in self.FULL.items() if k != key}

    def test_the_real_replies_give_units_and_an_edition(self):
        job, units, editions, err = self.with_sefaria(self.FULL, lambda: fetch.probe_work(('midrash-halakhah', MK)))
        self.assertEqual((units, editions, err), (25, 1, None))
        self.assertEqual(fetch.check_status([(job, units, editions, err)])[1], 0)

    def test_a_withheld_main_shape_fails(self):
        with self.assertRaises(fetch.MissingShape):
            self.with_sefaria(self.without(f'shape/{MK}'), lambda: fetch.chapter_refs(MK))

    def test_an_unusable_main_shape_fails(self):
        error_reply = next(r['reply'] for r in load('text-replies.json')['replies'] if r['reply'].get('error'))
        with self.assertRaises(fetch.MissingShape):
            self.with_sefaria(self.FULL, lambda: fetch.chapter_refs(MK),
                              override=lambda path: {'error': error_reply['error']} if urllib.parse.unquote(path) == f'shape/{MK}' else None)

    def test_withheld_editions_fail_the_work(self):
        with self.assertRaises(fetch.NoEditions):
            self.with_sefaria(self.without(f'texts/versions/{MK}'), lambda: fetch.fetch_work('midrash-halakhah', MK))

    def test_a_work_with_no_units_fails(self):
        # chapter_refs is stubbed to return nothing; the editions reply is real.
        saved = fetch.chapter_refs
        fetch.chapter_refs = lambda title: []
        try:
            with self.assertRaises(fetch.NoUnits):
                self.with_sefaria(self.FULL, lambda: fetch.fetch_work('midrash-halakhah', MK))
        finally:
            fetch.chapter_refs = saved

    def test_check_exits_nonzero_for_a_bad_row(self):
        for key in (f'shape/{MK}', f'texts/versions/{MK}', f'shape/{MK}, Additions', f'v2/raw/index/{MK}'):
            row = self.with_sefaria(self.without(key), lambda: fetch.probe_work(('midrash-halakhah', MK)))
            bad, status = fetch.check_status([row])
            self.assertEqual((len(bad), status), (1, 1), key)


class GapsFoundInTheFinalReview(unittest.TestCase):
    """A broken nested part, records lost on a rerun, and a requested work that matches nothing."""
    SIFRA = staticmethod(server({'v2/raw/index/Sifra': 'index-sifra.json', 'shape/Sifra': 'shape-sifra.json'}))

    def test_the_real_sifra_shape_gives_its_named_blocks(self):
        parts = load('shape-sifra.json')[0]['chapters']
        units = fetch.chapter_refs('Sifra', self.SIFRA)
        self.assertEqual(len(units), sum(1 for p in parts if p['chapters']))
        self.assertIn(('sifra-baraita-derabbi-yishmael', 'Sifra, Baraita DeRabbi Yishmael'), units)

    def test_a_nested_part_without_a_chapter_list_fails(self):
        shape = load('shape-sifra.json')
        shape[0]['chapters'][5]['chapters'] = None          # one real part, its chapter list withheld
        files = {'v2/raw/index/Sifra': load('index-sifra.json'), 'shape/Sifra': shape}
        with self.assertRaises(fetch.MissingPartShape):
            fetch.chapter_refs('Sifra', lambda path: files.get(urllib.parse.unquote(path)))

    def absence_from_a_real_run(self):
        run = AUnitWithoutTextIsRecordedNeverSkipped('test_text_is_saved_and_an_empty_unit_is_listed')
        _, absent = run.run_work([('mekhilta-derabbi-shimon-ben-yochai-additions-1', f'{MK}, Additions 1')],
                                 {f'{MK}, Additions 1': run.replies[f'{MK}, Additions 1']})
        return absent

    def test_a_rerun_of_another_work_keeps_earlier_gap_records(self):
        import tempfile
        absent = self.absence_from_a_real_run()
        self.assertEqual(len(absent), 1)
        data = tempfile.mkdtemp()
        saved = fetch.RAW
        fetch.RAW = os.path.join(data, 'raw')
        try:
            fetch.record_run(data, {MK}, [], absent, [])
            _, kept, _ = fetch.record_run(data, {'Sifrei Zuta'}, [], [], [])
            self.assertEqual(kept, absent)                         # another work's run keeps it
            self.assertEqual(fetch.exit_status([], kept), 2)
            _, redone, _ = fetch.record_run(data, {MK}, [], [], [])
            self.assertEqual(redone, [])                           # re-running the same work replaces it
        finally:
            fetch.RAW = saved

    def test_an_unreadable_record_file_is_not_ignored(self):
        import tempfile
        data = tempfile.mkdtemp()
        with open(os.path.join(data, 'fetch-absences.json'), 'w') as f:
            f.write('{"not": "a list"}')
        with self.assertRaises(ValueError):
            fetch.record_run(data, {MK}, [], [], [])

    def test_a_requested_work_that_matches_nothing_is_reported(self):
        yer = next(path for label, path, _, _ in fetch.corpora.CORPORA if label == 'yerushalmi')
        discover = lambda path: ['Jerusalem Talmud Berakhot'] if path == yer else []
        jobs, unmatched, _ = fetch.plan_jobs('yerushalmi', ['Berakhot'], 0, discover)
        self.assertEqual((jobs, unmatched), ([], ['Berakhot']))
        jobs, unmatched, _ = fetch.plan_jobs('yerushalmi', ['Jerusalem Talmud Berakhot'], 0, discover)
        self.assertEqual((jobs, unmatched), ([('yerushalmi', 'Jerusalem Talmud Berakhot')], []))

    def test_checking_nothing_is_not_a_pass(self):
        self.assertEqual(fetch.check_status([])[1], 1)


if __name__ == '__main__':
    unittest.main()
