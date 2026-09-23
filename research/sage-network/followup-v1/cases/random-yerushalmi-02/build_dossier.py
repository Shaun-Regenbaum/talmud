"""Build dossier.json for random-yerushalmi-02 from saved sources only.

Every quote is resolved against the saved bytes; the build fails if a quote
is not found. Input-segment quotes also record zero-based, end-exclusive
character offsets and a one-based occurrence number.
"""
import json
import os
import re

from quotes import find_all, load_texts, sha256

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
INPUT = '../../../pilot/inputs/random-yerushalmi-02.json'
FETCH_LOG = {e['source_id']: e for e in json.load(open('sources/_fetch_log.json')) if 'sha256' in e}
GUG = 'The Jerusalem Talmud, edition by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015 (Hebrew text as saved in the pilot input)'

SOURCES = []


def add_input(sid, ref, fname):
    path = 'sources/' + fname
    SOURCES.append({
        'source_id': sid, 'ref': ref,
        'url_or_input_path': 'research/sage-network/pilot/inputs/random-yerushalmi-02.json',
        'edition': GUG, 'fetched_at': None, 'saved_file': path, 'sha256': sha256(path),
        'note': 'Exact text of the pilot input segment, saved as UTF-8 bytes. Its hash equals the input record hash.'})


def add_fetched(sid, log_id, ref, edition, note=''):
    e = FETCH_LOG[log_id]
    assert sha256(e['saved_file']) == e['sha256']
    SOURCES.append({'source_id': sid, 'ref': ref, 'url_or_input_path': e['url'], 'edition': edition,
                    'fetched_at': e['fetched_at'], 'saved_file': e['saved_file'], 'sha256': e['sha256'], 'note': note})


add_input('in_s1', 'Jerusalem Talmud Megillah 1:10:2', 'input_s1_JT_Megillah_1_10_2.txt')
add_input('in_s2', 'Jerusalem Talmud Megillah 1:10:3', 'input_s2_JT_Megillah_1_10_3.txt')
add_input('in_s3', 'Jerusalem Talmud Megillah 1:10:4 (focal)', 'input_s3_JT_Megillah_1_10_4.txt')
add_input('in_s4', 'Jerusalem Talmud Megillah 1:10:5', 'input_s4_JT_Megillah_1_10_5.txt')
add_input('in_s5', 'Jerusalem Talmud Megillah 1:10:6', 'input_s5_JT_Megillah_1_10_6.txt')
add_fetched('jt_meg_1_10', 'sef_text_1_10', 'Jerusalem Talmud Megillah 1:10 (all segments)',
            'Sefaria API v3: Guggenheimer Hebrew and English translation with notes (CC-BY); Mechon-Mamre Hebrew; Venice Edition Hebrew',
            'Includes the Mishnah lemma (segment 1) that the input job did not supply.')
add_fetched('links_1_10_3', 'sef_links_1_10_3', 'Commentary links on Jerusalem Talmud Megillah 1:10:3',
            'Sefaria links API with text: Penei Moshe, Korban HaEdah, Ohr LaYesharim')
add_fetched('links_1_10_4', 'sef_links_1_10_4', 'Commentary links on Jerusalem Talmud Megillah 1:10:4',
            'Sefaria links API with text: Penei Moshe, Korban HaEdah, Ohr LaYesharim, and linked passages')
add_fetched('links_1_10_5', 'sef_links_1_10_5', 'Commentary links on Jerusalem Talmud Megillah 1:10:5',
            'Sefaria links API with text: Penei Moshe, Korban HaEdah, Mareh HaPanim, Ohr LaYesharim, Chiddushei Ridbaz')
add_fetched('links_1_10_6', 'sef_links_1_10_6t', 'Commentary links on Jerusalem Talmud Megillah 1:10:6',
            'Sefaria links API with text: Penei Moshe, Korban HaEdah, Ohr LaYesharim')
add_fetched('jt_yoma_1_1', 'sef_jt_yoma_1_1', 'Jerusalem Talmud Yoma 1:1 (parallel)',
            'Sefaria API v3: Guggenheimer Hebrew/English, Mechon-Mamre, Venice Edition')
add_fetched('jt_horayot_3_2', 'sef_jt_horayot_3_2', 'Jerusalem Talmud Horayot 3:2 (parallel)',
            'Sefaria API v3: Guggenheimer Hebrew/English, Mechon-Mamre, Venice Edition')
add_fetched('tosefta_yoma_1_4', 'sef_tosefta_yoma_lieberman_1_4', 'Tosefta Yoma 1:4 (Lieberman)',
            'Sefaria API v3: The Tosefta according to codex Vienna, JTS (Lieberman)')
add_fetched('tosefta_yoma_3_20', 'sef_tosefta_yoma_3_20', 'Tosefta Yoma 3:20 (Lieberman)',
            'Sefaria API v3: The Tosefta according to codex Vienna, JTS (Lieberman)')
add_fetched('bavli_yoma_12b', 'sef_bavli_yoma_12b', 'Bavli Yoma 12b:11-13a:2',
            'Sefaria API v3: William Davidson Edition (Aramaic, vocalized, English); Wikisource Talmud Bavli')
add_fetched('bavli_yoma_47a', 'sef_bavli_yoma_47a', 'Bavli Yoma 47a',
            'Sefaria API v3: William Davidson Edition; Wikisource Talmud Bavli')
add_fetched('bavli_megillah_9b', 'sef_bavli_megillah_9b', 'Bavli Megillah 9b',
            'Sefaria API v3: William Davidson Edition; Wikisource Talmud Bavli; Daf Shevui')
add_fetched('mishnah_megillah_1_9', 'sef_mishnah_megillah_1_9', 'Mishnah Megillah 1:9',
            'Sefaria API v3: Torat Emet; Vilna; Kaufmann (Be\'eri); William Davidson English; Kulp; Bartenura (Silverstein)')
add_fetched('mishnah_yoma_1_1', 'sef_mishnah_yoma_1_1', 'Mishnah Yoma 1:1',
            'Sefaria API v3: Torat Emet; Vilna; Kaufmann (Be\'eri); several English versions')
add_fetched('mt_klei_4_15', 'sef_mt_kle_hamikdash_4_15', 'Mishneh Torah, Vessels of the Sanctuary 4:15',
            'Sefaria API v3: Torat Emet; Wikisource; Touger English')
add_fetched('mt_yk_1_3', 'sef_mt_yom_hakippurim_1_3', 'Mishneh Torah, Service on the Day of Atonement 1:3',
            'Sefaria API v3: Torat Emet; Wikisource; Touger English')
add_fetched('links_1_10_6_list', 'sef_links_1_10_6', 'Link list (no text) for Jerusalem Talmud Megillah 1:10:6',
            'Sefaria links API without text', 'Used only to see which commentaries and parallels are linked.')

PATH = {s['source_id']: s['saved_file'] for s in SOURCES}
TEXT_CACHE = {}


def texts(sid):
    if sid not in TEXT_CACHE:
        TEXT_CACHE[sid] = load_texts(PATH[sid])
    return TEXT_CACHE[sid]


def ev(sid, wanted, occurrence=None, locator=None, plain=False):
    """Resolve an exact quote from the saved bytes of a source."""
    if sid.startswith('in_'):
        t = texts(sid)[0]
        hits = find_all(t, wanted)
        assert hits, (sid, wanted)
        occ = occurrence or 1
        start, end = hits[occ - 1]
        out = {'source_id': sid, 'exact_quote': t[start:end], 'occurrence': occ,
               'occurrences_in_segment': len(hits), 'start': start, 'end': end}
    else:
        for t in texts(sid):
            hits = find_all(t, wanted)
            if plain:
                hits = [h for h in hits if not re.search('[\u0591-\u05C7]', t[h[0]:h[1]])]
            if hits:
                start, end = hits[0]
                out = {'source_id': sid, 'exact_quote': t[start:end]}
                break
        else:
            raise AssertionError((sid, wanted))
    if locator:
        out['locator'] = locator
    return out


def F(fid, claim, kind, evidence, reasoning, confidence, graph_effect, translation=None):
    f = {'finding_id': fid, 'claim': claim, 'kind': kind, 'evidence': evidence,
         'reasoning': reasoning, 'confidence': confidence, 'graph_effect': graph_effect}
    if translation:
        f['working_translation'] = translation
    return f


PM4, PM5 = 'Penei Moshe on Jerusalem Talmud Megillah 1:10:4', 'Penei Moshe on Jerusalem Talmud Megillah 1:10:5'
KH4, KH5 = 'Korban HaEdah on Jerusalem Talmud Megillah 1:10:4', 'Korban HaEdah on Jerusalem Talmud Megillah 1:10:5'
OLY4, OLY5 = 'Ohr LaYesharim on Jerusalem Talmud Megillah 1:10:4', 'Ohr LaYesharim on Jerusalem Talmud Megillah 1:10:5'
GUG_EN = 'Guggenheimer English translation and notes'

findings = [
    F('f01',
      'In Megillah 1:10:5 the string לְכֹהֵן גָּדוֹל occurs twice. The first occurrence (offsets 99-114) belongs to the rule about the hypothetical second priest: he is fit neither "for high priest" nor "for ordinary priest". It is an eligibility category, not a person. The second occurrence (offsets 304-319), right after שֶׁאִירַע קֶרִי, is the incumbent high priest in the Ben Illem story.',
      'textual',
      [ev('in_s4', 'הַשֵּׁינִי אֵינוֹ כָשֵׁר לֹא לְכֹהֵן גָּדוֹל וְלֹא לְכֹהֵן הֶדְיוֹט'),
       ev('in_s4', 'לְכֹהֵן גָּדוֹל', 1),
       ev('in_s4', 'שֶׁאִירַע קֶרִי לְכֹהֵן גָּדוֹל בְּיוֹם הַכִּיפּוּרִים'),
       ev('in_s4', 'לְכֹהֵן גָּדוֹל', 2)],
      'The first occurrence is governed by אֵינוֹ כָשֵׁר לֹא ... וְלֹא, a paired list of roles for which the second priest is unfit. The parallel לְכֹהֵן הֶדְיוֹט cannot be a person either. Only the second occurrence is the object of אירע ("it happened to"), within the narrated story.',
      'high',
      'Move the first_priest anchor (m9) from s4 occurrence 1 to s4 occurrence 2 (start 304, end 319). Attach no person to occurrence 1. Treat it and לְכֹהֵן הֶדְיוֹט as role categories in an eligibility rule.',
      'Working translation: "the second is fit neither for high priest nor for ordinary priest" ... "that a seminal emission happened to the high priest on the Day of Atonement".'),
    F('f02',
      'The incumbent high priest of the story is referred to twice more. תַּחְתָּיו ("in his stead", offsets 378-388) points to him. In Ben Illem\'s question, the third occurrence of the string כֹהֵן גָּדוֹל (inside מִשֵׁלְּכֹהֵן גָּדוֹל, offsets 525-538) names him as the other possible owner of the offerings.',
      'textual',
      [ev('in_s4', 'וְנִכְנַס בֶּן אִילֵּם וְשִׁימֵּשׁ תַּחְתָּיו בִּכְהוּנָּה גְדוֹלָה'),
       ev('in_s4', 'פָּר וְשָׂעִיר שֶׁל יוֹם מִשֶׁלִּי הֵן קְרֵיבִים אוֹ מִשֵׁלְּכֹהֵן גָּדוֹל'),
       ev('in_s4', 'כֹהֵן גָּדוֹל', 3),
       ev('links_1_10_5', 'משלי – מכספי, הן קריבים או משל כהן גדול – מכספו של הכוהן הגדול שאת מקומו מילאתי', locator=OLY5)],
      'The only antecedent of the suffix in תַּחְתָּיו is the high priest to whom the emission happened. Ben Illem contrasts "mine" with "the high priest\'s", so the second party is the priest he replaced. Ohr LaYesharim glosses it that way ("the high priest whose place I filled"). The label כֹהֵן גָּדוֹל is contested within the story itself: Ben Illem has just served as high priest. The reference is therefore high confidence for תחתיו and medium-high for the speech mention.',
      'high',
      'Add mentions of first_priest at s4 תַּחְתָּיו (378-388) and at s4 כֹהֵן גָּדוֹל occurrence 3 (525-538; speaker Ben Illem). Keep the offering-ownership question as speech content, not as an asserted ownership relation.',
      'Working translation: "are the bull and goat of the day offered from mine, or from the high priest\'s?"'),
    F('f03',
      'The eligibility rules at the head of 1:10:5 concern two generic priests: "this one passed and that one served". The first bears all the priestly commandments. The second is fit neither as high priest nor as ordinary priest. The earlier extraction created entities for these roles, but it gave them no rule claims.',
      'textual',
      [ev('in_s4', 'עָבַר זֶה וְשִׁימֵּשׁ זֶה. הָרִאשׁוֹן כָּל מִצְוַת כְּהוּנָּה עָלָיו.'),
       ev('in_s4', 'הַשֵּׁינִי אֵינוֹ כָשֵׁר לֹא לְכֹהֵן גָּדוֹל וְלֹא לְכֹהֵן הֶדְיוֹט.'),
       ev('links_1_10_5', 'הראשון. לאחר שיעבור פסולו חוזר הוא לעבודתו וכל קדושת כהונה גדולה עליו', locator='Penei Moshe on Jerusalem Talmud Megillah 1:10:5:2'),
       ev('links_1_10_5', 'השני אינו כשר לא לכ"ג. מפני האיבה ואין לו ג"כ דין כהן הדיוט לפי שמעלין בקדש ואין מורידין', locator='Penei Moshe on Jerusalem Talmud Megillah 1:10:5:3'),
       ev('links_1_10_5', 'לא לכה"ג. לשמש בשמנהבגדים', locator='Korban HaEdah on Jerusalem Talmud Megillah 1:10:5:3'),
       ev('links_1_10_5', 'ולא לכהן הדיוט. לשמש בארבעה', locator='Korban HaEdah on Jerusalem Talmud Megillah 1:10:5:4')],
      'The Yerushalmi states the two rules without reasons. Penei Moshe supplies them: enmity bars the second as high priest, and "one raises in holiness and does not lower" bars him as ordinary priest. Korban HaEdah maps the two roles to eight and four garments. These are commentary explanations, kept separate from the text.',
      'high',
      'Add two rule claims. first_legal retains all priestly duties. second_legal is ineligible as high priest and ineligible as ordinary priest. Mark both as generic, hypothetical and legal. The reasons (enmity; no lowering in holiness) are commentary-voiced notes and do not belong to the text\'s own claim.',
      'Working translation: "If this one passed [out of service] and that one served: the first has all the commandment of priesthood on him; the second is fit neither for high priest nor for ordinary priest."'),
    F('f04',
      'Rabbi Yohanan rules that if the second priest nevertheless served, his service is valid. Penei Moshe and Korban HaEdah make the second priest the subject. Korban HaEdah limits validity to service in eight garments. The parallel in Horayot has a reading "invalid" in the saved Venice and Mechon-Mamre texts. Guggenheimer rejects that reading.',
      'textual',
      [ev('in_s4', 'אָמַר רִבִּי יוֹחָנָן. עָבַר וְעָבַד עֲבוֹדָתוֹ כְשֵׁירָה.'),
       ev('links_1_10_5', 'עבר. השני ועבד ואעבודת יה"כ קאי שאינה כשירה אלא בכ"ג', locator='Penei Moshe on Jerusalem Talmud Megillah 1:10:5:4'),
       ev('links_1_10_5', 'עבר ועבד. השני בשמנה בגדים עבודתו כשרה דהא כה"ג הוא אלא דאסרו חכמים משום איבה אבל בארבעה פסולה לכ"ע דה"ל מחוסר בגדים', locator='Korban HaEdah on Jerusalem Talmud Megillah 1:10:5:5'),
       ev('jt_horayot_3_2', 'אמר רבי יוחנן עבר ועבד עבודתו פסולה', locator='Jerusalem Talmud Horayot 3:2, Venice and Mechon-Mamre Hebrew', plain=True),
       ev('jt_horayot_3_2', 'his officiating is (invalid) [valid]', locator='Guggenheimer English, Horayot 3:2, with note 152'),
       ev('bavli_yoma_12b', 'וּמוֹדֶה רַבִּי יוֹסֵי שֶׁאִם עָבַר וְעָבַד — עֲבוֹדָתוֹ כְּשֵׁרָה', locator='Bavli Yoma 13a, via Rabbah bar bar Hana in the name of Rabbi Yohanan')],
      'The Megillah and Yoma Yerushalmi texts read כשירה. The Horayot text as saved reads פסולה. Guggenheimer reports that the Leiden manuscript reads "invalid" and prints "valid" from another witness and the parallels. The Bavli attributes the same concession, through Rabbah bar bar Hana, to Rabbi Yohanan\'s ruling on Rabbi Yose\'s view. That supports the valid reading. It does not prove that the Yerushalmi statements are one utterance.',
      'high',
      'Keep c12 (Yohanan holds that service performed anyway is valid) and give second_legal the subject role. Record the Horayot "invalid" reading as a variant branch, not a separate Yohanan view. The eight-versus-four-garments limit is Korban HaEdah\'s qualification.',
      'Working translation: "Rabbi Yohanan said: if he transgressed and served, his service is valid."'),
    F('f05',
      'The next question, עֲבוֹדָתוֹ מִשֶּׁל מִי ("his service, from whose [property]?"), is answered by citing the Ben Illem story. The commentaries disagree about what the story proves. Penei Moshe says the offerings come from the incumbent\'s property. Ohr LaYesharim says they come from the replacement\'s.',
      'interpretation',
      [ev('in_s4', 'עֲבוֹדָתוֹ מִשֶּׁל מִי. נִישְׁמְעִינָהּ מִן הָדָא.'),
       ev('links_1_10_5', 'אלמא דמשל כ"ג הן קריבין ולא משל זה העובד לפי שעה', locator='Penei Moshe on Jerusalem Talmud Megillah 1:10:5:10'),
       ev('links_1_10_5', 'הפר אינו משל הכוהן הגדול, אלא משל הכוהן הממלא את מקומו', locator=OLY5)],
      'The Yerushalmi does not state the resolution. It lets the king\'s reply and Ben Illem\'s removal speak. Penei Moshe infers ownership by the incumbent, since Ben Illem was told to be content and understood he was removed. Ohr LaYesharim reads the question as rhetorical ("are they not mine?"), with the replacement owning the offerings. Both are commentary inferences.',
      'high',
      'Do not assert any ownership relation between a priest and the offerings. The story supports an "illustrates" link to the question, with two commentary-attributed resolutions saved as alternative readings.',
      'Working translation: "His service - from whose? Let us learn it from this."'),
    F('f06',
      'The Ben Illem story has three participants: Ben Illem of Tzipporin (named), the incumbent high priest (unnamed) and the king (unnamed). The earlier output omitted one narrated step: the king understood what Ben Illem was asking. Ben Illem\'s removal is passive (שֶׁהוּסַּע). The text does not say who removed him.',
      'textual',
      [ev('in_s4', 'מַעֲשֶׂה בְּבֶן אִילֵּם מִצִּיפּוֹרִין'),
       ev('in_s4', 'וְאָמַר לַמֶּלֶךְ כְּשֶׁיָּצָא. אֲדוֹנִי הַמֶּלֶךְ.'),
       ev('in_s4', 'וְיָדַע הַמֶּלֶךְ מַה שָׁאֲלוּ.'),
       ev('in_s4', 'וְיָדַע בֶּן אִילֵּם שֶׁהוּסַּע מִכְּהוּנָּה גְּדוֹלָה.'),
       ev('links_1_10_5', 'וידע המלך מה שאלו. שהבין דעתו שישאר הוא להיות כ"ג', locator='Penei Moshe on Jerusalem Talmud Megillah 1:10:5:9'),
       ev('links_1_10_5', 'שהוסע. שהעבירו מלעבוד עוד בכה"ג אלא שהראשון חוזר לעבודתו', locator='Korban HaEdah on Jerusalem Talmud Megillah 1:10:5:11')],
      'The king is addressed and replies. His understanding of the question is narrated separately. Penei Moshe reads the question as a bid to remain high priest. Ben Illem\'s removal is inferred by Ben Illem from the reply. Assigning the removal to the king is plausible from the story but is not stated.',
      'high',
      'Add an event: the king understands Ben Illem\'s question (commentary note: as a bid to stay in office). Keep "Ben Illem removed from high priesthood" with an unstated agent. A king-removes-Ben-Illem edge, if added, should be marked implicit (basis: inference from the reply).',
      'Working translation: "The king knew what he was asking ... Ben Illem knew that he had been removed from the high priesthood."'),
    F('f07',
      'Commentators disagree about what שֶׁאִירַע קֶרִי means. Guggenheimer and Ohr LaYesharim read it literally as a seminal emission. Korban HaEdah reads it as some other defilement, because the Mishnah in Avot says this never happened to a high priest on Yom Kippur. The Bavli parallel says only פְּסוּל (a disqualification).',
      'interpretation',
      [ev('in_s4', 'שֶׁאִירַע קֶרִי לְכֹהֵן גָּדוֹל'),
       ev('links_1_10_5', 'שאירע קרי. מקרה שנטמא ע"י אחת מטומאות אבל קרי ממש אי אפשר לומר דתנן במס\' אבות שלא אירע קרי לכה"ג ביה"כ מעולם', locator='Korban HaEdah on Jerusalem Talmud Megillah 1:10:5:7'),
       ev('jt_meg_1_10', 'that the High Priest experienced an emission of semen on the Day of Atonement', locator=GUG_EN + ', Megillah 1:10:5'),
       ev('bavli_yoma_12b', 'שֶׁאֵירַע בּוֹ פְּסוּל בְּכֹהֵן גָּדוֹל', locator='Bavli Yoma 12b')],
      'The Yerushalmi word is קרי. Only its sense is disputed, so the graph should keep the event type loose.',
      'high',
      'Label the incumbent\'s event "disqualifying incident (text: קרי)". Keep literal emission and Korban HaEdah\'s general defilement as commentary-attributed alternatives.'),
    F('f08',
      'The story\'s incumbent and Ben Illem correspond to the legal "first" and "second" priests. The Yerushalmi does not state this correspondence. The Tosefta does: it says Ben Illem "was not fit either for high priest or for ordinary priest". Ohr LaYesharim makes the same link.',
      'interpretation',
      [ev('tosefta_yoma_1_4', 'מעשה היה ביוסף בן אילים מציפורי ששימש תחת כהן גדול שעה אחת, ולא היה כשר לא לכהן גדול ולא לכהן הדיוט'),
       ev('links_1_10_5', 'בן אילם הבין שהועבר מתפקיד הכהונה הגדולה', locator=OLY5)],
      'In the Yerushalmi the story is cited for the "from whose?" question, and ends with Ben Illem removed from the high priesthood. It never says he was also barred from ordinary service. That second bar comes from the Tosefta parallel and the commentary.',
      'medium',
      'Optionally add role-instantiation edges: first_priest as first_legal, and ben_illem as second_legal. Mark them interpretation, with evidence from the Tosefta parallel and Ohr LaYesharim. Do not write "Ben Illem barred from ordinary priesthood" as a Yerushalmi claim.'),
    F('f09',
      'The parallels name the replacement differently and give the ruling to a different authority. The Tosefta has "Yosef ben Ilim of Tzippori", with Rabbi Yose telling the story and the king replying. The Bavli has "Yosef ben Elem" (Megillah 9b: "Rabbi Yosef ben Elem"), with the Sages ruling. The Yerushalmi gives no first name and no teller.',
      'textual',
      [ev('tosefta_yoma_1_4', "אמ' ר' יוסה מעשה היה ביוסף בן אילים מציפורי"),
       ev('tosefta_yoma_1_4', 'ידע המלך על מה אמ\' לו'),
       ev('bavli_yoma_12b', 'אָמַר רַבִּי יוֹסֵי: מַעֲשֶׂה בְּיוֹסֵף בֶּן אִלֵּם בְּצִיפּוֹרִי'),
       ev('bavli_yoma_12b', 'וְאָמְרוּ חֲכָמִים: רִאשׁוֹן — חוֹזֵר לַעֲבוֹדָתוֹ'),
       ev('bavli_megillah_9b', 'ואמר רבי יוסי מעשה ברבי יוסף בן אלם מציפורי'),
       ev('jt_meg_1_10', 'where, however, the ruling is not the king’s (necessarily of the Herodian dynasty) but “the rabbis’.”', locator=GUG_EN + ', note 431')],
      'These are parallel tellings of one tradition, and each sits in its own text. The first name Yosef, the teller Rabbi Yose and the Sages as deciders belong to the parallels, not to this Yerushalmi passage. Guggenheimer calls the king "necessarily of the Herodian dynasty". That is his historical inference.',
      'high',
      'Keep ben_illem local to this passage. Record "Yosef ben Ilim/Elem" only as a parallel-tradition name candidate for a separate identity pack, not a merge. Do not add Rabbi Yose or the Sages to this passage\'s graph. Leave the king unnamed, with "Herodian" attributed to Guggenheimer.'),
    F('f10',
      'A commentary gives a historical identification that is not in the text: Josephus named the replaced high priest as Matthias son of Theophilus. Ohr LaYesharim reports this with its own uncertainty, since two high priests bore that name. The Yerushalmi does not name the incumbent.',
      'uncertainty',
      [ev('links_1_10_5', 'והוא מזכיר את שם הכוהן הגדול שאת מקומו מילא יוסף בן אילם: מתתיהו בן תיאופילוס', locator=OLY5),
       ev('links_1_10_5', 'היו שני כוהנים גדולים בשם זה', locator=OLY5)],
      'This is a secondary report of a historian, relayed by a modern commentary. No Josephus text was fetched in this case.',
      'low',
      'Do not name first_priest. At most, keep a historical-identity hypothesis ("Josephus, reported by Ohr LaYesharim"), outside the passage graph.'),
    F('f11',
      'Earlier claim c1 treats Ben Illem as child_of a person named Illem. The text uses בֶּן אִילֵּם only as the man\'s name. No person called Illem acts or is described. The parallels spell the name בן אילים, בן אלם or בן אלם.',
      'uncertainty',
      [ev('in_s4', 'בֶּן אִילֵּם', 1),
       ev('tosefta_yoma_1_4', 'בן אילים'),
       ev('jt_horayot_3_2', 'מעשה בבן אלם', locator='Jerusalem Talmud Horayot 3:2, Mechon-Mamre Hebrew', plain=True)],
      'A "ben X" name may be a patronymic or a family name. Treating it as a filiation edge to a separate person adds a node the passage never uses.',
      'medium',
      'Downgrade c1 from a family relation to a name-structure annotation. Illem\'s entity should not be counted as a participant.'),
    F('f12',
      'Megillah 1:10:4 quotes Mishnah Yoma 1:1 ("one prepares another priest in his place lest a disqualification befall him") and asks whether the two priests are secluded together. Rabbi Haggai answers that the incumbent would kill him. The derivation "אותו" follows: one high priest is anointed, not two. Rabbi Yohanan says "because of enmity".',
      'textual',
      [ev('in_s3', 'מַתְקִינִין לוֹ כֹהֵן אַחֵר תַּחְתָּיו שֶׁמָּא יֶאֱרַע לוֹ פְסוּל.'),
       ev('in_s3', 'מַה. מְיַיחֲדִין לֵיהּ עִימֵּיהּ.'),
       ev('in_s3', 'אָמַר רִבִּי חַגַּי. מֹשֶׁה. דִּינּוּן מְיַיחֲדִין לֵיהּ עִימֵּיהּ דּוּ קְטִיל לֵיהּ.'),
       ev('in_s3', 'אוֹתוֹ. אֶחָד מוֹשְׁחִין וְאֵין מוֹשְׁחִין שְׁנַיִם.'),
       ev('in_s3', 'אָמַר רִבִּי יוֹחָנָן. מִפְּנֵי אֵיבָה.'),
       ev('mishnah_yoma_1_1', 'וּמַתְקִינִין לוֹ כֹהֵן אַחֵר תַּחְתָּיו, שֶׁמָּא יֶאֱרַע בּוֹ פְסוּל')],
      'All actors in 1:10:4 are generic: the incumbent (לוֹ), the backup priest (כֹהֵן אַחֵר) and the unexpressed "they" who prepare, seclude and anoint. The named voices are Rabbi Haggai and Rabbi Yohanan.',
      'high',
      'Keep generic_incumbent and generic_replacement as non-historical role entities. Add rule claims: a backup priest is prepared; one high priest is anointed, not two; Yohanan gives enmity as the reason. Keep Haggai\'s remark as a hypothetical warning.',
      'Working translation: "One prepares for him another priest in his place, lest a disqualification befall him. What - does one seclude him with him? Rabbi Haggai said: Moses! If they seclude him with him, he will kill him. \'Him\': one anoints one and does not anoint two. Rabbi Yohanan said: because of enmity."'),
    F('f13',
      'Interpreters differ on how Rabbi Yohanan\'s "because of enmity" relates to the derivation. Penei Moshe, Korban HaEdah and Ohr LaYesharim read it as the reason for "one, not two". Guggenheimer reads it as a disagreement: the rule is practical, not biblical.',
      'interpretation',
      [ev('links_1_10_4', 'אין מושחין אותו וכדמפרש ר\' יוחנן טעמא מפני האיבה', locator='Penei Moshe on Jerusalem Talmud Megillah 1:10:4:5'),
       ev('links_1_10_4', 'מפני איבה. לכך אין מושחין שנים דחיישינן לשנאה שתהיה ביניהם', locator='Korban HaEdah on Jerusalem Talmud Megillah 1:10:4:4'),
       ev('jt_meg_1_10', 'He disagrees and holds that while the two could not have been anointed on the same day, they could have been anointed on different days. The rule that the back-up Cohen has lower status is practical, not biblical', locator=GUG_EN + ', note 428')],
      'The Hebrew places Yohanan\'s remark straight after the derivation, with no marker of dispute. Both readings are possible.',
      'high',
      'Keep c11 as "explains / gives reason". Add a Guggenheimer-attributed alternative branch in which Yohanan disputes the derivation.'),
    F('f14',
      'Commentators read Rabbi Haggai\'s מֹשֶׁה as an oath, "by Moses" (Penei Moshe, Guggenheimer, Ohr LaYesharim). Moses is not a participant. The Yoma parallel reads משם, which Guggenheimer calls a scribal error. Korban HaEdah reads משם and glosses it as Rabbi Haggai "who was from Babylonia".',
      'interpretation',
      [ev('links_1_10_4', 'משה. שבועה היא וכך היה דרכו של ר\' חגיי', locator='Penei Moshe on Jerusalem Talmud Megillah 1:10:4:3'),
       ev('jt_yoma_1_1', 'א"ר חגיי משם דאין מייחדין ליה עימיה', locator='Jerusalem Talmud Yoma 1:1, Mechon-Mamre Hebrew', plain=True),
       ev('links_1_10_4', 'ה"ג א"ר חגיי משם דאין מייחדין ליה עמו. וכ"ה ביומא וה"פ ר\' חגיי שהיה מבבל אמר', locator='Korban HaEdah on Jerusalem Talmud Megillah 1:10:4:2'),
       ev('jt_horayot_3_2', 'In Yoma “because of”, a scribal error. “By Moses” was a preferred expression of R. Ḥaggai’s.', locator='Guggenheimer English, Horayot 3:2, note 148')],
      'The Megillah and Horayot texts read מֹשֶׁה. Only one commentary, built on a variant, attaches a Babylonian origin to Rabbi Haggai.',
      'high',
      'No Moses node or edge. If Haggai\'s origin is recorded at all, it goes in an identity pack as "Korban HaEdah, on the reading משם". It does not belong in this passage graph.'),
    F('f15',
      'It is unclear who would kill whom in Rabbi Haggai\'s warning. The Aramaic has only pronouns. Penei Moshe and Ohr LaYesharim say the incumbent would kill the backup.',
      'interpretation',
      [ev('in_s3', 'דּוּ קְטִיל לֵיהּ'),
       ev('links_1_10_4', 'אם היו מייחדין לזה עמו בודאי יהרגנו שאינו יכול לסבלו ולראות צרה שלו בצידו', locator='Penei Moshe on Jerusalem Talmud Megillah 1:10:4:4'),
       ev('links_1_10_4', 'יש לחשוש שמא הכוהן הגדול יהרוג את הכוהן האחר', locator=OLY4)],
      'This is a hypothetical danger, not a narrated killing. The direction comes from commentary.',
      'medium',
      'If kept, add a hypothetical-risk claim with modality "counterfactual/warning" and direction per Penei Moshe and Ohr LaYesharim. Never add a kills event.'),
    F('f16',
      'The unstated subject of Rabbi Yohanan\'s 1:10:3 ruling ("if he transgressed and brought his tenth of an ephah, it is valid") is the former high priest (כֹּהֵן שֶׁעָבַר) of the Mishnah lemma. This answers the earlier open question.',
      'textual',
      [ev('jt_meg_1_10', 'אין בין כהן ששימש לכהן שעבר אלא פר יוה"כ ועשירית האיפה', locator='Jerusalem Talmud Megillah 1:10:1, Mechon-Mamre Hebrew', plain=True),
       ev('mishnah_megillah_1_9', 'אֵין בֵּין כֹּהֵן מְשַׁמֵּשׁ לְכֹהֵן שֶׁעָבַר אֶלָּא פַּר יוֹם הַכִּפּוּרִים וַעֲשִׂירִית הָאֵיפָה'),
       ev('links_1_10_3', 'כלומר משיח שעבר דתנן שאין מביא עשירית האיפה', locator='Penei Moshe on Jerusalem Talmud Megillah 1:10:3:1'),
       ev('links_1_10_3', 'עבר. כהן שעבר והביא עשירית האיפה משלו כשר', locator='Korban HaEdah on Jerusalem Talmud Megillah 1:10:3:1'),
       ev('jt_meg_1_10', 'if the ex-High Priest, who, as will be explained later in the Halakhah, should be unfit to serve as High Priest', locator=GUG_EN + ', note 424')],
      'The Mishnah separates the serving priest from the one who "passed" only by the Yom Kippur bull and the tenth of an ephah. Yohanan\'s ruling is about the latter offering. Penei Moshe, Korban HaEdah, Ohr LaYesharim and Guggenheimer all name the former high priest as subject. The Venice Mishnah lemma reads שעבד, which looks like a graphic variant of שעבר; no commentary relies on it.',
      'high',
      'Relabel tenth_priest as "former high priest (כהן שעבר), generic". Link c9 to the Mishnah rule. Change the episode\'s needs_context note to resolved.'),
    F('f17',
      'The full rule set in scope concerns high priests. (a) Mishnah: an anointed priest and a priest invested by garments differ only in the bull for all the commandments. (b) Mishnah: a serving priest and a former priest differ only in the Yom Kippur bull and the tenth of an ephah. (c) Tanna: the anointed priest brings the bull and the garment-invested priest does not; Rabbi Meir disagrees. (d) Rabbi Yohanan: a former priest\'s tenth of an ephah brought anyway is valid. (e)-(h) are in 1:10:4-5: the backup priest, "one, not two", the first and second priest, and "valid if served".',
      'textual',
      [ev('mishnah_megillah_1_9', 'אֵין בֵּין כֹּהֵן מָשׁוּחַ בְּשֶׁמֶן הַמִּשְׁחָה לִמְרֻבֶּה בְגָדִים אֶלָּא פַּר הַבָּא עַל כָּל הַמִּצְוֹת'),
       ev('in_s1', 'כֹּהֵן מָשִׁיחַ מֵבִיא פָּר. אֵין הַמְרוּבֶּה בְגָדִים מֵבִיא פָּר. וּדְלֹא כְרִבִּי מֵאִיר.'),
       ev('in_s2', 'אָמַר רִבִּי יוֹחָנָן עָבַר וְהֵבִיא עֲשִׂירִית הָאֵיפָה שֶׁלּוֹ כָשֵׁר.')],
      'These are the eligibility and offering rules that the saved segments and their lemma state. Rules (e)-(h) are evidenced in findings f03, f04 and f12.',
      'high',
      'Every rule should have a claim with a generic legal-role subject, and no rule should be attached to a story person.'),
    F('f18',
      'The Yerushalmi says "the first" bears all the priestly commandments. The Tosefta (as Rabbi Meir\'s view) and the Bavli (Rabbi Meir) say that "all the commandments of the high priesthood" rest on the SECOND priest. The Mishneh Torah also applies that phrase to the second. The Yoma and Horayot Yerushalmi parallels read קדושת ("sanctity") where Megillah reads מצות.',
      'textual',
      [ev('in_s4', 'הָרִאשׁוֹן כָּל מִצְוַת כְּהוּנָּה עָלָיו'),
       ev('jt_yoma_1_1', 'הראשון כל קדושת כהונה עליו', locator='Jerusalem Talmud Yoma 1:1, Mechon-Mamre Hebrew', plain=True),
       ev('tosefta_yoma_1_4', 'וכהן גדול חוזר לכהונה, וזה ששימש תחתיו כל מצות כהונה גדולה עליו דברי ר\' מאיר'),
       ev('bavli_yoma_12b', 'שֵׁנִי — כׇּל מִצְוֹת כְּהוּנָּה גְּדוֹלָה עָלָיו, דִּבְרֵי רַבִּי מֵאִיר'),
       ev('mt_yk_1_3', 'הֲרֵי הָרִאשׁוֹן חוֹזֵר לַעֲבוֹדָתוֹ וְהַשֵּׁנִי עוֹבֵר וְכָל מִצְוֹת כְּהֻנָּה גְּדוֹלָה עָלָיו')],
      'The graph should follow the Yerushalmi wording for this passage and note the parallel difference. Ohr LaYesharim, citing Tosefta ki-Fshutah, argues that in the Yerushalmi Rabbi Yose adds to Rabbi Meir rather than disputing him. That is commentary.',
      'high',
      'Attach "all priestly commandments on him" to first_legal, as the Yerushalmi says. Do not import Rabbi Meir or Rabbi Yose from the Tosefta or Bavli into this passage. Record the second-priest version as a parallel-text difference.'),
    F('f19',
      'The Kimhit story in 1:10:6 has these participants: Shimon ben Kimhit; a king ("Arab king", subject to variants); his brother Yehuda; their mother, called "their mother" and then named Kimhit; the seven sons, five of them unnamed; the Sages who send to her; and the unmarked "they" who say the flour saying and recite the verse. Kimhit is the only woman participant in the checked segments. "The king\'s daughter" is a figure in the quoted verse, not a person in the scene.',
      'textual',
      [ev('in_s5', 'וְרָאָת אִימָּן שְׁנֵי בָנֶיהָ כֹּהֲנִים גְּדוֹלִים בְּיוֹם אֶחָד.'),
       ev('in_s5', 'שִׁבְעָה בָנִים הָיוּ לְקִמְחִית'),
       ev('in_s5', 'שָׁלְחוּ חֲכָמִים וְאָמְרוּ לָהּ.'),
       ev('in_s5', 'אָמְרָה לָהֶן.'),
       ev('in_s5', 'אָמְרוּן. כָּל קִמְחַיָּא קֶמַח וְקִימְחָא דְקִימְחִית סוֹלֶת. וְקָרְוּן עֲלָהּ'),
       ev('in_s5', 'כָּל כְּבוּדָּה בַת מֶלֶךְ פְּנִימָה')],
      'The name Shimon ben Kimhit, the "seven sons to Kimhit" and the sages\' address to her make "their mother" and Kimhit the same woman. The subject of אָמְרוּן and קָרְוּן is not stated. The Bavli parallel has the Sages answer her ("אמרו לה חכמים"), which supports the sages, but here it is local inference.',
      'high',
      'Keep kimhit with mentions אִימָּן (252-259), לְקִמְחִית (333-343), לָהּ (418-422), אָמְרָה (462-469) and עֲלָהּ (637-643). Give c28\'s speakers a branch: the sages (inferred) or unspecified speakers. Add no person for בַת מֶלֶךְ. Keep the five other sons as a group and do not create individuals for them.'),
    F('f20',
      'The saliva came "from his mouth" (מִפִּיו). The Hebrew does not say whose. Korban HaEdah and Ohr LaYesharim say it was the king\'s.',
      'interpretation',
      [ev('in_s5', 'וְנִתְּזָה צִינּוֹרָה שֶׁלְּרוֹק מִפִּיו עַל בְּגָדָיו'),
       ev('links_1_10_6', 'טיפה מן הרוק של המלך ניתז על בגדיו ורוק עכו"ם מטמא כרוקו של זב', locator='Korban HaEdah on Jerusalem Talmud Megillah 1:10:6:2'),
       ev('links_1_10_6', 'ונתזה צנורה (זרם, קילוח) של רוק מפיו – של המלך, על בגדיו – של הכוהן הגדול', locator='Ohr LaYesharim on Jerusalem Talmud Megillah 1:10:6')],
      'The commentaries agree, and the legal logic (a gentile\'s saliva defiles) needs the king as source. The text\'s pronoun alone is ambiguous.',
      'medium',
      'Resolve the m23 coreference candidate to arab_king on a commentary basis (not explicit). Shimon stays the one whose garments are defiled.'),
    F('f21',
      'The king\'s description and the timing vary by witness. Venice Megillah has "an Arab king, the eve of Yom Kippur at dusk". Guggenheimer\'s Megillah bracket marks the time phrase as an addition. The Yoma parallel reads "the king, the eve of Yom Kippur". Horayot reads "to walk with the king on the eve of Yom Kippur at dusk". Tosefta 3:20 reads "the king, ערבית". The Bavli has an Arab in the market. Guggenheimer\'s notes lean different ways in different tractates. Ohr LaYesharim (following Tosefta ki-Fshutah) prefers "Arab king" on Yom Kippur itself.',
      'uncertainty',
      [ev('in_s5', 'שֶׁיָּצָא לְדַבֵּר עִם מֶלֶךְ עָרְבִי [עֶרֶב יוֹם כִּפּוּרִים עִם חֲשֵׁכָה]'),
       ev('jt_yoma_1_1', 'שיצא לדבר עם המלך ערב יום הכפורים', locator='Jerusalem Talmud Yoma 1:1, Mechon-Mamre Hebrew', plain=True),
       ev('jt_horayot_3_2', 'שיצא לטייל עם המלך ערב יום הכיפורים עם חשיכה', locator='Jerusalem Talmud Horayot 3:2, Mechon-Mamre Hebrew', plain=True),
       ev('tosefta_yoma_3_20', 'שיצא לדבר עם המלך ערבית'),
       ev('jt_yoma_1_1', 'There can be little doubt that the scribe’s text is the correct one; the corrector’s text is an unjustified emendation.', locator='Guggenheimer English, Yoma 1:1, note 128'),
       ev('jt_meg_1_10', 'Probably it should read “with the king at sundown before the Day of Atonement.”', locator=GUG_EN + ', Megillah note 434'),
       ev('links_1_10_6', 'והנכון הוא: \'לדבר עם מלך ערבי / המלך הערבי\', ומעשה שהיה ביום הכיפורים עצמו היה', locator='Ohr LaYesharim on Jerusalem Talmud Megillah 1:10:6')],
      'ערב ("eve") and ערבי ("Arab") are graphically close. The king\'s ethnicity and the time of the incident depend on the reading.',
      'high',
      'Keep one king entity ("the king Shimon went out to speak with"). "Arab" and the timing are reading-branch attributes. Do not identify this king with the king in the Ben Illem story.'),
    F('f22',
      'The Bavli tells the saliva story twice about Yishmael ben Kimhit, with brothers Yeshevav and Yosef. The Tosefta leaves the brother unnamed. The Yerushalmi has Shimon and Yehuda. These are different name traditions, not evidence of identity.',
      'textual',
      [ev('bavli_yoma_47a', 'אמרו עליו על רבי ישמעאל בן קמחית פעם אחת סיפר דברים עם ערבי אחד בשוק ונתזה צינורא מפיו על בגדיו ונכנס ישבב אחיו ושמש תחתיו'),
       ev('bavli_yoma_47a', 'ונכנס יוסף (עם) אחיו ושמש תחתיו'),
       ev('tosefta_yoma_3_20', 'נכנס אחיו ושמש תחתיו בכהונה גדולה')],
      'Different names in parallel tellings of one motif cannot justify a merge.',
      'high',
      'Keep shimon and yehuda local. Do not merge them with Yishmael, Yeshevav or Yosef. Parallel-name links may go only into an identity pack.'),
    F('f23',
      'All seven sons served as high priests. The text does not say on the same day, or how. Ohr LaYesharim explains that each served in turn as a replacement. The Bavli\'s English gloss adds "or as his substitute". These are explanations.',
      'interpretation',
      [ev('in_s5', 'שִׁבְעָה בָנִים הָיוּ לְקִמְחִית וְכוּלְּהֹם שִׁימְּשׁוּ בִכְהוּנָּה גְדוֹלָה.'),
       ev('links_1_10_6', 'שבכל פעם שאירע פסול לשמעון בן קמחית ביום הכיפורים ולא עשה עבודתו, נכנס אחד מאחיו', locator='Ohr LaYesharim on Jerusalem Talmud Megillah 1:10:6')],
      'Only the fact that all seven served is textual.',
      'high',
      'Keep c25 as is. The replacement mechanism is a commentary note only.'),
    F('f24',
      'Rabbi Yohanan is named in three separate segments (1:10:3, 1:10:4, 1:10:5). The earlier output recorded only the first mention. Rabbi Haggai is named once, in 1:10:4.',
      'textual',
      [ev('in_s2', 'רִבִּי יוֹחָנָן', 1), ev('in_s3', 'רִבִּי יוֹחָנָן', 1), ev('in_s4', 'רִבִּי יוֹחָנָן', 1), ev('in_s3', 'רִבִּי חַגַּי', 1)],
      'Joining the three mentions to one local entity is ordinary local coreference within one sugya. It does not establish a historical identity.',
      'high',
      'Add mentions for yohanan at s3 246-261 and s4 145-160. Link c11 and c12 to them.'),
    F('f25',
      'The Mishnah that 1:10:4 quotes (Yoma 1:1) goes on with Rabbi Yehuda\'s view that a second wife is prepared in case the high priest\'s wife dies. That woman and the wife appear in the Mishnah and in the Yoma Yerushalmi discussion. The Megillah passage quotes only the clause about the backup priest.',
      'uncertainty',
      [ev('mishnah_yoma_1_1', 'רַבִּי יְהוּדָה אוֹמֵר, אַף אִשָּׁה אַחֶרֶת מַתְקִינִין לוֹ, שֶׁמָּא תָמוּת אִשְׁתּוֹ'),
       ev('in_s3', 'מַתְקִינִין לוֹ כֹהֵן אַחֵר תַּחְתָּיו')],
      'The unnamed, hypothetical women belong to the wider Mishnah context. They are not in the Megillah text read here.',
      'high',
      'Add no women to the Megillah 1:10:4 graph from this. If the Yoma parallel is ever read, it should carry them as hypothetical legal roles.'),
    F('f26',
      'Maimonides codifies the rules this way. A backup high priest is prepared. After Yom Kippur the first returns; the second passes out of service, bears all the high-priestly commandments, does not serve as high priest, has valid service if he served, and succeeds if the first dies. Two high priests are not appointed together.',
      'interpretation',
      [ev('mt_yk_1_3', 'וְהַשֵּׁנִי עוֹבֵר וְכָל מִצְוֹת כְּהֻנָּה גְּדוֹלָה עָלָיו אֶלָּא שֶׁאֵינוֹ עוֹבֵד כְּכֹהֵן גָּדוֹל וְאִם עָבַד עֲבוֹדָתוֹ כְּשֵׁרָה'),
       ev('mt_klei_4_15', 'וְאֵין מְמַנִּין שְׁנֵי כֹּהֲנִים גְּדוֹלִים כְּאַחַת')],
      'This is a later codifier\'s synthesis and draws on the Bavli as well. It is useful for checking the rule list, but it is not evidence for the Yerushalmi\'s wording.',
      'medium',
      'None for the passage graph. It is a cross-check only.'),
]

dossier = {
    'job_id': 'random-yerushalmi-02',
    'focal_ref': 'Jerusalem Talmud Megillah 1:10:4',
    'status': 'researched',
    'question': 'The first_priest span attached to an earlier hypothetical not-fit-as-high-priest occurrence rather than the incumbent in the story. Determine correct occurrences and preserve all relevant priest eligibility rules, unnamed women and story participants.',
    'scope': 'Read: the five pilot input segments (JT Megillah 1:10:2-1:10:6); the rest of 1:10 on Sefaria, including the Mishnah lemma; Guggenheimer English and notes; Venice and Mechon-Mamre Hebrew; Penei Moshe, Korban HaEdah, Mareh HaPanim, Ohr LaYesharim and Chiddushei Ridbaz as linked on Sefaria for 1:10:3-1:10:6; parallels in JT Yoma 1:1 and JT Horayot 3:2; Tosefta Yoma 1:4 and 3:20; Bavli Yoma 12b-13a, Yoma 47a and Megillah 9b; Mishnah Megillah 1:9 and Yoma 1:1; Mishneh Torah (two linked halakhot). Not read: manuscripts, Sheyarei Korban, Tosafot Yoma 12b (cited by Ridbaz), Josephus, Lieberman\'s Tosefta ki-Fshutah (known only through Ohr LaYesharim and Guggenheimer).',
    'quote_method': 'Quotes are exact slices of the saved bytes. The occurrence number on an input quote counts consonant-skeleton matches in that segment, so a match inside a prefixed or joined word also counts. For the key anchor, s4 לְכֹהֵן גָּדוֹל, exact-string occurrences 1 and 2 (the pilot convention) and skeleton occurrences 1 and 2 fall at the same offsets (99 and 304). The skeleton also matches a third time inside מִשֵׁלְּכֹהֵן. Offsets are the authoritative anchor. For JSON sources, HTML tags were removed from the decoded strings before matching. Hebrew quotes were located by consonant skeleton and then copied from the original string. Input offsets are zero-based and end-exclusive, and index the saved segment text.',
    'sources': SOURCES,
    'findings': findings,
    'alternative_readings': [
        {'topic': 'Who owns the Yom Kippur offerings when the replacement serves', 'readings': [
            {'by': 'Penei Moshe', 'reading': 'The incumbent high priest; the story shows the replacement is only temporary.', 'finding': 'f05'},
            {'by': 'Ohr LaYesharim', 'reading': 'The replacement; Ben Illem\'s question is rhetorical ("are they not mine?").', 'finding': 'f05'}]},
        {'topic': 'Meaning of קרי in the Ben Illem story', 'readings': [
            {'by': 'Guggenheimer; Ohr LaYesharim', 'reading': 'A literal seminal emission.'},
            {'by': 'Korban HaEdah', 'reading': 'Some other defilement, since Avot says a keri never happened to the high priest on Yom Kippur.'},
            {'by': 'Bavli parallel', 'reading': 'Only "a disqualification" (פסול).'}]},
        {'topic': 'Rabbi Yohanan\'s "because of enmity"', 'readings': [
            {'by': 'Penei Moshe; Korban HaEdah; Ohr LaYesharim', 'reading': 'The reason for "one is anointed, not two".'},
            {'by': 'Guggenheimer note 428', 'reading': 'A disagreement: the rule is practical, not biblical; two could be anointed on different days.'}]},
        {'topic': 'Rabbi Haggai\'s מֹשֶׁה', 'readings': [
            {'by': 'Penei Moshe; Guggenheimer; Ohr LaYesharim', 'reading': 'An oath, "by Moses".'},
            {'by': 'Korban HaEdah (on the reading משם)', 'reading': 'Glossed as Rabbi Haggai "who was from Babylonia".'},
            {'by': 'Ohr LaYesharim', 'reading': 'The oath may support or protest the question; the direction is hard to decide.'}]},
        {'topic': 'Rabbi Yohanan on service performed anyway', 'readings': [
            {'by': 'JT Megillah and Yoma; Bavli Yoma 13a', 'reading': 'Valid.'},
            {'by': 'JT Horayot 3:2 as saved (Venice, Mechon-Mamre)', 'reading': 'Invalid (פסולה); Guggenheimer judges this impossible.'}]},
        {'topic': 'Shimon ben Kimhit\'s interlocutor and the time', 'readings': [
            {'by': 'Guggenheimer Megillah main text; Venice Megillah', 'reading': 'An Arab king (Venice adds eve of Yom Kippur at dusk).'},
            {'by': 'JT Yoma; JT Horayot', 'reading': 'The king, on the eve of Yom Kippur (Horayot: at dusk, "to walk").'},
            {'by': 'Ohr LaYesharim after Tosefta ki-Fshutah', 'reading': 'An Arab king, on Yom Kippur itself; the eve phrase is an explanatory addition.'},
            {'by': 'Bavli Yoma 47a', 'reading': 'An Arab (or an officer) in the market; the priest is Yishmael ben Kimhit.'}]},
        {'topic': 'Whose mouth (מִפִּיו)', 'readings': [
            {'by': 'Korban HaEdah; Ohr LaYesharim', 'reading': 'The king\'s.'},
            {'by': 'Text alone', 'reading': 'Unresolved pronoun.'}]},
        {'topic': 'Who speaks אָמְרוּן and קָרְוּן', 'readings': [
            {'by': 'Local inference; Bavli parallel (אמרו לה חכמים)', 'reading': 'The sages.'},
            {'by': 'Text alone', 'reading': 'Unspecified speakers.'}]},
        {'topic': 'Who bears "all the commandments of priesthood"', 'readings': [
            {'by': 'JT Megillah (מצות) / Yoma and Horayot (קדושת)', 'reading': 'The first (returning) priest.'},
            {'by': 'Tosefta (R. Meir); Bavli (R. Meir); Mishneh Torah', 'reading': 'The second (replacement) priest.'}]},
    ],
    'unresolved': [
        'Whether the Yerushalmi thinks Ben Illem was also barred from ordinary priesthood. Only the Tosefta says so explicitly.',
        'Who removed Ben Illem. The verb is passive, and the king is only the likely agent.',
        'The historical identity of the unnamed incumbent. The Josephus identification is known here only through Ohr LaYesharim.',
        'The true reading of the Kimhit story\'s king and timing. Witnesses and Guggenheimer\'s own notes disagree.',
        'Who is the grammatical subject of אָמְרוּן and קָרְוּן.',
        'Manuscript readings were not checked directly. Variant reports come from printed texts and Guggenheimer\'s notes.',
    ],
    'proposed_corrections': [
        {'existing_id': 'm9', 'change': 'Change the anchor from s4 "לְכֹהֵן גָּדוֹל" occurrence 1 (99-114) to occurrence 2 (304-319).', 'why': 'Occurrence 1 is the role category in the second priest\'s ineligibility rule (f01).'},
        {'existing_id': 'first_priest', 'change': 'Update the evidence to occurrence 2. Add mentions for תַּחְתָּיו (378-388) and כֹהֵן גָּדוֹל occurrence 3 (525-538, inside Ben Illem\'s speech). Change the label to "Unnamed incumbent high priest in the Ben Illem story".', 'why': 'f01, f02.'},
        {'existing_id': 'c13', 'change': 'Keep the claim; its evidence quote is already the correct phrase. Its subject anchor is fixed through m9. Loosen the subtype to "disqualifying incident (text: קרי)".', 'why': 'f01, f07.'},
        {'existing_id': 'c14', 'change': 'Keep the claim. The replaced role now points to the correctly anchored first_priest.', 'why': 'f01.'},
        {'existing_id': None, 'change': 'Add rule claims: first_legal bears all priestly commandments; second_legal is ineligible as high priest and as ordinary priest. Both are generic and legal.', 'why': 'f03; flagged as missed in the previous review.'},
        {'existing_id': 'c12', 'change': 'Give the rule the subject second_legal, keeping Yohanan as speaker. Add a variant branch for the Horayot reading "invalid".', 'why': 'f04.'},
        {'existing_id': None, 'change': 'Add the question "his service, from whose?" as a statement. Add an "illustrated_by" link to the Ben Illem story. Save the Penei Moshe and Ohr LaYesharim resolutions as alternatives. Assert no ownership edge.', 'why': 'f05.'},
        {'existing_id': None, 'change': 'Add the event "the king understands what Ben Illem asked" (s4 וְיָדַע הַמֶּלֶךְ מַה שָׁאֲלוּ).', 'why': 'f06.'},
        {'existing_id': 'c1', 'change': 'Downgrade from a family child_of relation to a name-structure note. Do not count the illem entity as a participant.', 'why': 'f11.'},
        {'existing_id': 'tenth_priest', 'change': 'Relabel as "former high priest (כהן שעבר), generic". Link it to the Mishnah lemma rule. Close open question 1.', 'why': 'f16.'},
        {'existing_id': 'c11', 'change': 'Keep "explains". Add a Guggenheimer-attributed alternative in which Yohanan disputes the derivation.', 'why': 'f13.'},
        {'existing_id': 'm23', 'change': 'Resolve the coreference to arab_king, marked commentary-based (Korban HaEdah, Ohr LaYesharim).', 'why': 'f20.'},
        {'existing_id': 'arab_king', 'change': 'Treat "Arab" and the eve-of-Yom-Kippur timing as reading-branch attributes.', 'why': 'f21.'},
        {'existing_id': 'c28', 'change': 'Split the speaker into branches: sages (inferred) or unspecified.', 'why': 'f19.'},
        {'existing_id': 'yohanan', 'change': 'Add mentions at s3 (246-261) and s4 (145-160), and link c11 and c12 to them.', 'why': 'f24.'},
        {'existing_id': 'm7', 'change': 'Add the first name mention inside בְּבֶן אִילֵּם (s4 258-272). m8 (אִילֵּם occurrence 1) is also inside that phrase.', 'why': 'The first mention of Ben Illem sits inside the prefixed form. The current m7 anchors his second mention.'},
        {'existing_id': 'episode.coverage', 'change': 'The needs_context note about s2 can be resolved from the Mishnah lemma (JT Megillah 1:10:1).', 'why': 'f16.'},
    ],
    'ontology_lessons': [
        'A repeated legal term can name a role category ("fit for high priest") in one place and a person ("happened to the high priest") a few words later. An anchor needs an occurrence number checked against its governing verb, not just the string.',
        'Eligibility rules need a claim type whose subject is a generic legal role (first/second priest) and whose object is a role category (high priest, ordinary priest). No person node should be created for the category.',
        'When a story is cited to answer a legal question, link it with "illustrates" or "role-instantiation" edges marked as interpretation. Do not copy the rule\'s predicates onto the story persons.',
        'A "ben X" name is not a filiation edge to a person X unless X appears or acts.',
        'Parallel tellings give different names (Yosef ben Ilim/Elem; Yishmael and Yeshevav/Yosef ben Kimhit). They belong in identity packs as candidates, never as merges inside a passage graph.',
        'Some attributes depend on the reading, such as "Arab" versus "eve", or valid versus invalid. They need branch labels, with the witness or editor that supports each.',
        'Commentary disagreements (Penei Moshe versus Ohr LaYesharim on ownership; Korban HaEdah versus Guggenheimer on קרי) should be stored with the commentator as voice. They should not be collapsed into one gloss.',
        'Figures in quoted verses ("the king\'s daughter") and hypothetical people in a Mishnah that is only partly quoted (Rabbi Yehuda\'s spare wife) are not participants in the quoting passage.',
    ],
}

# Every evidence quote was resolved from saved bytes by ev(); nothing is typed free-hand.
with open('dossier.json', 'w', encoding='utf-8') as fh:
    json.dump(dossier, fh, ensure_ascii=False, indent=1)
    fh.write('\n')
print('findings', len(findings), 'sources', len(SOURCES))
