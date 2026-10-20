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
        with self.assertRaises(fetch.AmbiguousShape):
            fetch.chapter_refs(SZ, no_index)

    def test_the_old_slot_rule_alone_would_have_called_these_pages(self):
        for name in ('shape-sifrei-zuta.json', 'shape-mekhilta-drs.json', 'shape-mekhilta-drs-additions.json'):
            node = load(name)
            node = node[0] if isinstance(node, list) else node
            with self.assertRaises(fetch.AmbiguousShape):
                fetch._is_talmud_daf(node)

    def test_a_shape_that_cannot_be_pages_needs_no_index(self):
        no_index = server({'shape/Jerusalem Talmud Berakhot': 'shape-jt-berakhot.json'})
        self.assertEqual(len(fetch.chapter_refs('Jerusalem Talmud Berakhot', no_index)), 9)


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


if __name__ == '__main__':
    unittest.main()
