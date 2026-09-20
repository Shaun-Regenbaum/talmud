"""Every bug found by reading output becomes a line here, so it cannot return.

Run:  python3 -m unittest discover -s research/sage-network/tests
"""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
import lexicon as lexmod          # noqa: E402
import names                      # noqa: E402
import textio                     # noqa: E402

GIVEN = {'יוחנן', 'מאיר', 'שמעון', 'הונא', 'יהושע', 'כהנא', 'יצחק', 'אמי', 'אליעזר', 'אלעזר',
         'חנה', 'יהודה', 'ששת', 'שילא', 'נחמן', 'נחמני', 'אידי', 'שישא', 'לוי', 'אשי', 'זוטרא',
         'טוביה', 'גמליאל', 'אבין', 'יוסף', 'פפא', 'חסדא', 'מרדכי', 'אחא', 'יוסי', 'חייא'}
LEX = lexmod.Lexicon(GIVEN, {w: 50 for w in GIVEN} | {'הלכה': 900, 'חנם': 40, 'שכר': 60, 'מאי': 5000})


def found(text):
    return [m.surface for m in names.find(textio.normalise(text), LEX)]


def mentions(text):
    return list(names.find(textio.normalise(text), LEX))


class OrdinaryWordsAreNotSages(unittest.TestCase):
    def test_the_guardians_are_not_rabbis(self):
        # Peeling prefix letters off שומר gave "מר חנם", the strongest
        # "association" in the first graph. Both are legal terms.
        self.assertEqual(found('שומר חנם ישבע נושא שכר ישלם'), [])
        self.assertEqual(found('אלא שומר שכר אמאי משתבע'), [])

    def test_master_what_did_shmuel_say(self):
        # "מר מאי אמר שמואל" was read as a sage called Mar Mai.
        self.assertEqual(found('מר מאי אמר שמואל'), ['שמואל'])

    def test_rav_said_the_law_is(self):
        # bare Rav followed by an ordinary word is Rav, not "Rav Halakha"
        ms = mentions('אמר רב הלכה כרבי מאיר')
        self.assertEqual([m.surface for m in ms], ['רב', 'רבי מאיר'])
        self.assertEqual(ms[0].kind, 'bare')
        self.assertFalse(ms[0].certain)          # רב can also mean "much"


class NamesAreNotTruncatedOrGlued(unittest.TestCase):
    def test_given_names_that_start_with_a_prefix_letter(self):
        # A "repair" once cut any name whose given name starts with a prefix
        # letter, so Rabbi Meir and Rabbi Shimon both became plain "Rabbi".
        self.assertEqual(found('רבי יוחנן משום רבי מאיר'), ['רבי יוחנן', 'רבי מאיר'])
        self.assertEqual(found('רב הונא אמר רבי שמעון'), ['רב הונא', 'רבי שמעון'])
        self.assertEqual(found('רב הונא בר יהודה אמר רב ששת'), ['רב הונא בר יהודה', 'רב ששת'])
        self.assertEqual(found('אמר ליה רב אשי לרב כהנא'), ['רב אשי', 'רב כהנא'])

    def test_rava_following_his_own_view(self):
        # "רבא כשמעתיה" is Rava plus an ordinary word seen once in the corpus
        self.assertEqual(found('רבא כשמעתיה'), ['רבא'])

    def test_a_word_never_seen_as_a_name_is_flagged_not_trusted(self):
        ms = mentions('רבן פלוני אומר')
        self.assertEqual([(m.surface, m.certain, m.alt) for m in ms], [('רבן פלוני', False, None)])

    def test_rav_before_an_unseen_word_falls_back_to_rav_alone(self):
        # "רב חנא" could be a rare sage or Rav plus an ordinary word. It is
        # reported as uncertain, and rejecting it still leaves Rav on the page.
        ms = mentions('רב חנא אמר')
        self.assertEqual([(m.surface, m.certain, m.alt) for m in ms], [('רב חנא', False, 'bare')])


class SonOf(unittest.TestCase):
    def test_a_patronymic_is_part_of_one_name(self):
        ms = mentions('אמר רב שישא בריה דרב אידי זאת אומרת')
        self.assertEqual([m.surface for m in ms], ['רב שישא בריה דרב אידי'])
        self.assertEqual(ms[0].fathers, [('רב', 'אידי')])

    def test_the_father_is_not_reported_as_a_second_speaker(self):
        self.assertEqual(found('והאמר רב יצחק בריה דרב אמי איש מזריע'), ['רב יצחק בריה דרב אמי'])

    def test_son_of_the_son_of(self):
        self.assertEqual(found('אמר רבה בר בר חנה אמר רבי יוחנן'), ['רבה בר בר חנה', 'רבי יוחנן'])

    def test_a_standalone_name_takes_a_father(self):
        self.assertEqual(found('רבה בר נחמני'), ['רבה בר נחמני'])

    def test_editorial_brackets_inside_a_name(self):
        self.assertEqual(found('רבן (שמעון בן) גמליאל אומר'), ['רבן שמעון בן גמליאל'])

    def test_a_father_too_rare_to_judge_is_kept_and_flagged(self):
        ms = mentions('רב אחא בריה דרב עוירא אמר')
        self.assertEqual([(m.surface, m.certain) for m in ms], [('רב אחא בריה דרב עוירא', False)])

    def test_son_of_abba_does_not_swallow_the_next_word(self):
        self.assertEqual(found('רבי יוסי בר אבא אקלעו להתם'), ['רבי יוסי בר אבא'])
        self.assertEqual(found('רבי חייא בר אבא אמר רבי יוחנן'), ['רבי חייא בר אבא', 'רבי יוחנן'])

    def test_names_built_on_son_of(self):
        self.assertEqual(found('אמר בן עזאי'), ['בן עזאי'])


class ShortFormsAreReportedNotOpenedUp(unittest.TestCase):
    def test_said_rabbi_written_short(self):
        # one edition prints אמר רבי יוחנן, the other א"ר יוחנן
        ms = mentions('א"ר יוחנן לא קשיא')
        self.assertEqual([(m.surface, m.title, m.given) for m in ms], [("ר' יוחנן", "ר'", 'יוחנן')])

    def test_the_short_title(self):
        self.assertEqual([(m.title, m.given) for m in mentions("ר' מאיר אומר")], [("ר'", 'מאיר')])

    def test_a_short_form_of_a_name_is_not_expanded(self):
        # ר"י can be Yehuda, Yochanan, Yose, Yishmael or Yitzchak. Choosing is
        # an identification, and that is not this stage's job.
        ms = mentions('ר"י אומר')
        self.assertEqual([(m.surface, m.kind, m.certain) for m in ms], [('ר"י', 'abbrev', False)])
        self.assertEqual([m.kind for m in mentions('אמר ריב"ל')], ['abbrev'])

    def test_a_closing_quote_is_not_a_short_form(self):
        self.assertEqual(found('"רבי מאיר"'), ['רבי מאיר'])


class PrefixLetters(unittest.TestCase):
    def test_prefix_on_a_title_is_peeled_and_the_name_kept_whole(self):
        self.assertEqual(found('כדרבי יוחנן'), ['רבי יוחנן'])
        self.assertEqual(found('מדרב הונא'), ['רב הונא'])

    def test_two_different_men_one_letter_apart_stay_apart(self):
        # Eliezer and Elazar; folding weak letters would merge them
        self.assertEqual(found('רבי אליעזר ורבי אלעזר'), ['רבי אליעזר', 'רבי אלעזר'])


class TheLexiconLearnsFromBehaviour(unittest.TestCase):
    def corpus(self, lines):
        return [(f'page{i}', textio.normalise(t)) for i, t in enumerate(lines)]

    def test_a_frequent_verb_is_not_a_name(self):
        lx = lexmod.build(self.corpus([
            'אמר רב הונא הלכה', 'רב אמר הלכה', 'רב אמר כך', 'והוא אמר לו', 'מי אמר זאת',
            'רב הונא אמר', 'אמר רב הונא בר יהודה', 'כך אמר הכהן', 'אמר ליה', 'רבי אמר']))
        self.assertTrue(lx.is_given('הונא'))
        self.assertFalse(lx.is_given('אמר'))      # after a title often, but mostly elsewhere
        self.assertFalse(lx.is_given('הלכה'))

    def test_a_word_seen_once_is_unknown_not_a_name(self):
        lx = lexmod.build(self.corpus(['רבא כשמעתיה']))
        self.assertFalse(lx.is_given('כשמעתיה'))
        self.assertTrue(lx.is_unknown('כשמעתיה'))

    def test_one_page_repeating_a_phrase_cannot_mint_a_name(self):
        # the blessing "hamotzi" after a bare Rav, several times in one passage
        lx = lexmod.build([('page1', textio.normalise('אמר רב המוצא ואמר רב המוצא ושוב רב המוצא'))])
        self.assertFalse(lx.is_given('המוצא'))

    def test_two_editions_of_one_page_do_not_count_twice(self):
        # the caller must pass one witness per work; with one, a single
        # occurrence stays a single occurrence
        lx = lexmod.build(self.corpus(['רב חסדך אמר']))
        self.assertFalse(lx.is_given('חסדך'))


class MarksSurviveNormalisation(unittest.TestCase):
    def test_gershayim_is_kept(self):
        # deleting it turned א"ר into אר and hid one edition's names entirely
        self.assertIn('א"ר', textio.normalise('א״ר יוחנן'))
        self.assertIn("ר'", textio.normalise('ר׳ מאיר'))

    def test_vowels_and_markup_go(self):
        self.assertEqual(textio.normalise('<b>רַבִּי</b>  מֵאִיר'), 'רבי מאיר')


if __name__ == '__main__':
    unittest.main()
