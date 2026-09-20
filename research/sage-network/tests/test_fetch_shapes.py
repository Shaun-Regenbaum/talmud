import importlib.util, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
spec = importlib.util.spec_from_file_location('fetch', os.path.join(os.path.dirname(__file__), '..', 'pipeline', '01_fetch.py'))
fetch = importlib.util.module_from_spec(spec); spec.loader.exec_module(fetch)


def walk(node, title='T'):
    out = []
    fetch._walk_shape(node, title, out)
    return out


class EveryShapeSefariaReturns(unittest.TestCase):
    def test_pages_of_the_bavli_skip_the_two_empty_slots(self):
        self.assertEqual(walk({'title': 'Berakhot', 'chapters': [0, 0, 14, 9]}, 'Berakhot'),
                         [('2a', 'Berakhot 2a'), ('2b', 'Berakhot 2b')])

    def test_numbered_chapters(self):
        self.assertEqual(walk({'chapters': [5, 8]}, 'Mishnah Berakhot'),
                         [('1', 'Mishnah Berakhot 1'), ('2', 'Mishnah Berakhot 2')])

    def test_chapters_of_halakhot(self):
        self.assertEqual(walk({'chapters': [[38, 9], [20]]}, 'Jerusalem Talmud Berakhot'),
                         [('1', 'Jerusalem Talmud Berakhot 1'), ('2', 'Jerusalem Talmud Berakhot 2')])

    def test_a_named_part_that_is_one_block(self):
        # Sifra is 278 of these. Reading the number as a list ended a full run.
        node = {'chapters': [{'title': 'Sifra, Baraita DeRabbi Yishmael', 'chapters': 18},
                             {'title': 'Sifra, Tzav, Chapter 1', 'chapters': 0}]}
        self.assertEqual(walk(node, 'Sifra'),
                         [('sifra-baraita-derabbi-yishmael', 'Sifra, Baraita DeRabbi Yishmael')])

    def test_a_named_part_with_numbered_sections_keeps_the_part_in_the_label(self):
        node = {'chapters': [{'title': 'Part A', 'chapters': [3, 4]}, {'title': 'Part B', 'chapters': [2]}]}
        self.assertEqual([u for u, _ in walk(node)], ['part-a-1', 'part-a-2', 'part-b-1'])

    def test_a_shape_with_nothing_in_it(self):
        self.assertEqual(walk({'chapters': None}), [])
        self.assertEqual(walk({}), [])


if __name__ == '__main__':
    unittest.main()
