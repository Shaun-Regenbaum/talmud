import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
import lexicon as lexmod          # noqa: E402
import relations                  # noqa: E402
import textio                     # noqa: E402

GIVEN = {'נחמן', 'הונא', 'יהודה', 'יוחנן', 'אילא', 'אשי', 'מרדכי', 'מאיר', 'אחא', 'תנחום'}
LEX = lexmod.Lexicon(GIVEN, {w: 50 for w in GIVEN})


def sigs(text):
    return [(a.surface, b.surface, s) for a, b, s in relations.pairs(textio.normalise(text), LEX)]


class TheRelationWordCanComeFirst(unittest.TestCase):
    def test_objected_to(self):
        # Looking only between the names found nothing here: the verb is first
        # and the second name carries the prefix ל
        (a, b, s), = sigs('איתיביה רב נחמן לרב הונא אחד המקדיש')
        self.assertEqual((a, b), ('רב נחמן', 'רב הונא'))
        self.assertEqual(s['before'][-1], 'איתיביה')
        self.assertEqual(s['between'], [])
        self.assertEqual(s['prefix'], 'ל')

    def test_said_to(self):
        (a, b, s), = sigs('אמר ליה רב מרדכי לרב אשי')
        self.assertEqual(s['before'], ['אמר', 'ליה'])
        self.assertEqual(relations.signature(s), 'ליה [A]  ל[B]')
        self.assertEqual(s['prefix'], 'ל')


class TheRelationWordCanSitBetween(unittest.TestCase):
    def test_passes_on_a_teaching(self):
        (a, b, s), = sigs('אמר רב יהודה אמר שמואל')
        self.assertEqual((a, b), ('רב יהודה', 'שמואל'))
        self.assertEqual(s['between'], ['אמר'])

    def test_short_form_of_said_rabbi_still_links_the_pair(self):
        # א"ר carries both the verb and the title in one token
        (a, b, s), = sigs('א"ר אילא א"ר יוחנן לא קשיא')
        self.assertEqual((a, b), ("ר' אילא", "ר' יוחנן"))
        self.assertEqual(s['between'], ['אמר'])          # א"ר folds into אמר

    def test_spellings_of_one_verb_are_one_pattern(self):
        sig = lambda t: relations.signature(sigs(t)[0][2])
        self.assertEqual(sig('דאמר רב יהודה אמר שמואל'), sig('ואמר רב יהודה אמר שמואל'))
        self.assertEqual(sig('והאמר רב יהודה אמר שמואל'), sig('אמר רב יהודה אמר שמואל'))

    def test_the_tail_of_the_previous_name_is_not_a_relation_word(self):
        out = sigs('רבי אחא רבי תנחום בשם רבי יוחנן')
        self.assertEqual(out[1][2]['before'], [])          # not ['אחא']

    def test_ordinary_context_before_the_pair_is_dropped(self):
        (a, b, s), = sigs('והלכתא רב יהודה אמר שמואל')
        self.assertEqual(s['before'], [])

    def test_names_far_apart_are_not_paired(self):
        self.assertEqual(sigs('רבי מאיר אומר כך וכך וכך וכך וכך וכך וכך רבי יהודה אומר'), [])


if __name__ == '__main__':
    unittest.main()
