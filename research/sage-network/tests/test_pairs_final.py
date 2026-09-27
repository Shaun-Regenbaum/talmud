import importlib.util, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
spec = importlib.util.spec_from_file_location('final', os.path.join(os.path.dirname(__file__), '..', 'pipeline', '23_pairs_final.py'))
final = importlib.util.module_from_spec(spec); spec.loader.exec_module(final)


class WhichBatchesPredateTheDirectionRule(unittest.TestCase):
    def test_early_first_queue_batches_do(self):
        self.assertTrue(final.before_direction_rule('005'))

    def test_first_queue_batches_from_19_on_do_not(self):
        self.assertFalse(final.before_direction_rule('019'))
        self.assertFalse(final.before_direction_rule('061'))

    def test_later_queues_never_do(self):
        # 'q2-005' is the fifth batch of the second queue, read with the settled guide
        self.assertFalse(final.before_direction_rule('q2-005'))
        self.assertFalse(final.before_direction_rule('q3-001'))

    def test_a_missing_batch_counts_as_early(self):
        self.assertTrue(final.before_direction_rule(None))


if __name__ == '__main__':
    unittest.main()
