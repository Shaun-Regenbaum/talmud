"""The second typing pass must not throw away an answer it has already paid for."""
import importlib.util, os, sys, unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'pipeline'))
spec = importlib.util.spec_from_file_location('type_hard', os.path.join(HERE, '..', 'pipeline', '13_type_hard.py'))
type_hard = importlib.util.module_from_spec(spec); spec.loader.exec_module(type_hard)


class AnswersSurviveAStrayQuoteMark(unittest.TestCase):
    def test_well_formed_json_is_read_whole(self):
        out = type_hard.read_items('{"items":[{"id":"p0","kind":"sage","sure":true,"reading":"רבי שמעון"}]}')
        self.assertEqual(out['items'][0]['reading'], 'רבי שמעון')

    def test_an_unescaped_quote_mark_loses_only_the_reading(self):
        broken = '{"items":[{"id":"p0","kind":"sage","sure":true,"reading":"ר"ש"},{"id":"p1","kind":"word","sure":false,"reading":null}]}'
        out = type_hard.read_items(broken)
        self.assertEqual([(r['id'], r['kind'], r['sure']) for r in out['items']],
                         [('p0', 'sage', True), ('p1', 'word', False)])


if __name__ == '__main__':
    unittest.main()
