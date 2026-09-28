import importlib.util, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
spec = importlib.util.spec_from_file_location('appi', os.path.join(os.path.dirname(__file__), '..', 'pipeline', '31_app_interactions.py'))
appi = importlib.util.module_from_spec(spec); spec.loader.exec_module(appi)

IDS = {f'm{i:02d}': {'name': 'רבא'} for i in range(20)}


def answer(*groups, unsure=0):
    k = iter(IDS)
    return {'people': [{'id': f'P{j}', 'passages': [next(k) for _ in range(n)]} for j, n in enumerate(groups)],
            'unsure': [next(k) for _ in range(unsure)]}


class WhoCountsAsOneMan(unittest.TestCase):
    def test_one_group_holding_almost_everything(self):
        self.assertTrue(appi.one_man(answer(18, 1), IDS)['רבא'])

    def test_a_second_real_group_means_more_than_one_man(self):
        self.assertFalse(appi.one_man(answer(14, 4), IDS)['רבא'])

    def test_many_one_passage_men_still_break_the_85_percent_line(self):
        self.assertFalse(appi.one_man(answer(15, 1, 1, 1, 1), IDS)['רבא'])

    def test_unsure_passages_do_not_count_against_him(self):
        self.assertTrue(appi.one_man(answer(17, unsure=3), IDS)['רבא'])


if __name__ == '__main__':
    unittest.main()
