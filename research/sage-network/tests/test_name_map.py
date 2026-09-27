import collections, importlib.util, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
spec = importlib.util.spec_from_file_location('namemap', os.path.join(os.path.dirname(__file__), '..', 'pipeline', '24_name_map.py'))
namemap = importlib.util.module_from_spec(spec); spec.loader.exec_module(namemap)

KEY = 'bavli|Berakhot|2a|1|10|40'   # corpus|work|unit|address|start of A|start of B


def resolve(name, side, decision, name_out=None):
    d = {('bavli', 'Berakhot', '2a', '1', 10 if side == 0 else 40): {'decision': decision, 'name': name_out}}
    return namemap.resolve_bare(name, KEY, side, d, collections.Counter())


class WhatALoneTitleBecomes(unittest.TestCase):
    def test_a_name_cut_short_gets_its_full_name(self):
        self.assertEqual(resolve('רבי', 0, 'cut', 'רבי ראובן'), 'רבי ראובן')

    def test_the_title_standing_alone_stays(self):
        self.assertEqual(resolve('רב', 1, 'alone'), 'רב')

    def test_a_lone_short_r_that_is_a_person_is_rebbi(self):
        self.assertEqual(resolve("ר'", 0, 'alone'), 'רבי')

    def test_a_word_or_my_master_is_not_a_person(self):
        self.assertIsNone(resolve('רב', 0, 'word'))
        self.assertIsNone(resolve('רבי', 1, 'master'))

    def test_unsettled_leaves_it_as_it_is(self):
        self.assertEqual(resolve('רבי', 0, 'unsettled'), 'רבי')

    def test_full_names_are_never_touched(self):
        self.assertEqual(resolve('רבי יוחנן', 0, 'word'), 'רבי יוחנן')

    def test_no_decision_file_changes_nothing(self):
        self.assertEqual(namemap.resolve_bare('רב', KEY, 0, {}, collections.Counter()), 'רב')


if __name__ == '__main__':
    unittest.main()
