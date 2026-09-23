"""Build dossier.json for random-yerushalmi-03 and verify every quote.

Each evidence quote must occur in the saved source file. For files containing
HTML (Sefaria English with notes), quotes are matched after removing tags.
"""
import hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PILOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', 'pilot'))
INPUT = os.path.join(PILOT, 'inputs', 'random-yerushalmi-03.json')
EARLIER = os.path.join(PILOT, 'outputs', 'random-yerushalmi-03.json')
LOG = json.load(open(os.path.join(HERE, 'sources', 'fetch_log.json')))


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def log_entry(fname):
    hits = [e for e in LOG if e.get('saved_file') == 'sources/' + fname and e['status'] == 'ok']
    return hits[-1]


# source_id -> (saved file, edition, note)
SRC = {
    'SHV_GUG_HE': ('jt_sheviit_10_4_he_guggenheimer.json', 'Jerusalem Talmud Sheviit 10:4 (all segments), Hebrew: The Jerusalem Talmud, edition by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015 (via Sefaria)'),
    'SHV_VEN': ('jt_sheviit_10_4_he_venice.json', 'Jerusalem Talmud Sheviit 10:4, Hebrew: Venice Edition (via Sefaria)'),
    'SHV_MM': ('jt_sheviit_10_4_he_mechon_mamre.json', 'Jerusalem Talmud Sheviit 10:4, Hebrew: Mechon-Mamre (via Sefaria)'),
    'SHV_GUG_EN': ('jt_sheviit_10_4_en_guggenheimer_with_notes.json', 'Jerusalem Talmud Sheviit 10:4, English with footnotes: The Jerusalem Talmud, translation and commentary by Heinrich W. Guggenheimer (via Sefaria). Same editorial work as SHV_GUG_HE.'),
    'SHV_SCHWAB': ('jt_sheviit_10_4_fr_schwab_v1.json', 'Jerusalem Talmud Sheviit 10:4, French: Le Talmud de Jérusalem, traduit par Moise Schwab, 1878-1890 (via Sefaria v1 API)'),
    'PM_SHV': ('penei_moshe_jt_sheviit_10_4.json', 'Penei Moshe on Jerusalem Talmud Sheviit 10:4 (Piotrków, 1898-1900 edition, via Sefaria)'),
    'SIR_SHV': ('sirilio_jt_sheviit_10_4.json', 'Sirilio on Jerusalem Talmud Sheviit 10:4 (Jerusalem, 1934-1967 edition, via Sefaria)'),
    'GRA_SHV': ('beur_hagra_jt_sheviit_10_4.json', 'Beur HaGra on Jerusalem Talmud Sheviit 10:4 (Piotrków, 1898-1900; the text is labelled as two manuscripts, כתב יד א and כתב יד ב, of the commentary; via Sefaria)'),
    'MHP_SHV': ('mareh_hapanim_jt_sheviit_10_4.json', 'Mareh HaPanim on Jerusalem Talmud Sheviit 10:4 (Piotrków, 1898-1900, via Sefaria)'),
    'STEY_SHV': ('shaarei_torat_ey_jt_sheviit_10_4.json', "Sha'arei Torat Eretz Yisrael on Jerusalem Talmud Sheviit 10:4 (Jerusalem, 1940, via Sefaria)"),
    'LINKS_646': ('links_jt_sheviit_10_4_6.json', 'Sefaria link index for Jerusalem Talmud Sheviit 10:4:6'),
    'BM42_GUG': ('jt_bava_metzia_4_2_he_en.json', 'Jerusalem Talmud Bava Metzia 4:2, Guggenheimer Hebrew edition and English translation with notes (via Sefaria)'),
    'BM42_VEN': ('jt_bava_metzia_4_2_venice.json', 'Jerusalem Talmud Bava Metzia 4:2, Venice Edition (via Sefaria)'),
    'MS44_GUG': ('jt_maaser_sheni_4_4_he_en.json', 'Jerusalem Talmud Maaser Sheni 4:4, Guggenheimer Hebrew and English with notes (via Sefaria)'),
    'MS44_VEN': ('jt_maaser_sheni_4_4_venice.json', 'Jerusalem Talmud Maaser Sheni 4:4, Venice Edition (via Sefaria)'),
    'SHEVU47_GUG': ('jt_shevuot_4_7_he_en.json', 'Jerusalem Talmud Shevuot 4:7, Guggenheimer Hebrew and English with notes (via Sefaria)'),
    'SHEVU47_VEN': ('jt_shevuot_4_7_venice.json', 'Jerusalem Talmud Shevuot 4:7, Venice Edition (via Sefaria)'),
    'GIT61_GUG': ('jt_gittin_6_1_he_en.json', 'Jerusalem Talmud Gittin 6:1, Guggenheimer Hebrew and English with notes (via Sefaria)'),
    'GIT61_VEN': ('jt_gittin_6_1_venice.json', 'Jerusalem Talmud Gittin 6:1, Venice Edition (via Sefaria)'),
    'KID21_GUG': ('jt_kiddushin_2_1_he_en.json', 'Jerusalem Talmud Kiddushin 2:1, Guggenheimer Hebrew and English with notes (via Sefaria)'),
    'PM_BM42': ('penei_moshe_jt_bava_metzia_4_2.json', 'Penei Moshe on Jerusalem Talmud Bava Metzia 4:2 (via Sefaria)'),
    'RIDBAZ_BM42': ('ridbaz_jt_bava_metzia_4_2.json', 'Chiddushei Ridbaz on Jerusalem Talmud Bava Metzia 4:2 (via Sefaria)'),
    'MHP_BM42': ('mareh_hapanim_jt_bava_metzia_4_2.json', 'Mareh HaPanim on Jerusalem Talmud Bava Metzia 4:2 (via Sefaria)'),
    'PM_SHEVU47': ('penei_moshe_jt_shevuot_4_7.json', 'Penei Moshe on Jerusalem Talmud Shevuot 4:7 (via Sefaria)'),
    'PM_MS44': ('penei_moshe_jt_maaser_sheni_4_4.json', 'Penei Moshe on Jerusalem Talmud Maaser Sheni 4:4 (via Sefaria)'),
    'PM_GIT61': ('penei_moshe_jt_gittin_6_1.json', 'Penei Moshe on Jerusalem Talmud Gittin 6:1 (via Sefaria)'),
    'BAVLI_BM48B': ('bavli_bava_metzia_48b.json', 'Babylonian Talmud Bava Metzia 48b, William Davidson Edition Aramaic and English (via Sefaria)'),
    'BAVLI_BM49A': ('bavli_bava_metzia_49a.json', 'Babylonian Talmud Bava Metzia 49a, William Davidson Edition Aramaic and English (via Sefaria)'),
    'BAVLI_BB85A': ('bavli_bava_batra_85a.json', 'Babylonian Talmud Bava Batra 85a, William Davidson Edition (via Sefaria)'),
    'TOS_BB52': ('tosefta_bava_batra_5_2.json', 'Tosefta Bava Batra 5:2 (Lieberman numbering), codex Vienna text (via Sefaria)'),
    'TOS_KID18': ('tosefta_kiddushin_1_8.json', 'Tosefta Kiddushin 1:8 (Lieberman), codex Vienna text (via Sefaria)'),
    'TK_BB52': ('tosefta_kifshutah_bava_batra_5_2.json', 'Tosefta Kifshutah on Bava Batra 5:2, Third Augmented Edition, JTS 2001 (via Sefaria)'),
    'TK_KID18': ('tosefta_kifshutah_kiddushin_1_8.json', 'Tosefta Kifshutah on Kiddushin 1:8, JTS 2001 (via Sefaria)'),
}


def flat(obj, out):
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, list):
        for x in obj:
            flat(x, out)
    elif isinstance(obj, dict):
        for x in obj.values():
            flat(x, out)
    return out


TEXT = {}
for sid, (fname, _) in SRC.items():
    raw = json.load(open(os.path.join(HERE, 'sources', fname)))
    parts = flat(raw, [])
    TEXT[sid] = '\n'.join(parts) + '\n' + '\n'.join(re.sub(r'<[^>]+>', '', p) for p in parts)
inp = json.load(open(INPUT))
TEXT['IN'] = '\n'.join(s['text'] for s in inp['sources'])
TEXT['EARLIER'] = open(EARLIER, encoding='utf-8').read()


import unicodedata


def _skeleton(t):
    """Drop Hebrew points/cantillation and HTML-free text; keep an index map."""
    keep, idx = [], []
    for i, ch in enumerate(t):
        if unicodedata.category(ch) == 'Mn':
            continue
        keep.append(ch)
        idx.append(i)
    return ''.join(keep), idx


def exact(sid, q):
    """Return the exact saved substring that matches q, ignoring the order of
    combining marks. The returned text is copied from the saved source."""
    t = TEXT[sid]
    if q in t:
        return q
    sk, idx = _skeleton(t)
    qs, _ = _skeleton(q)
    k = sk.find(qs)
    if k < 0:
        return q  # reported as missing by the checker
    start = idx[k]
    end = idx[k + len(qs) - 1] + 1
    while end < len(t) and unicodedata.category(t[end]) == 'Mn':
        end += 1
    return t[start:end]


def E(sid, q):
    return {'source_id': sid, 'exact_quote': exact(sid, q)}


sources = [
    {'source_id': 'IN', 'url': None, 'input_path': INPUT,
     'edition': 'Pilot input package: Jerusalem Talmud Sheviit 10:4:4-6 (s1-s3), Guggenheimer Hebrew edition as captured 2026-09-20',
     'fetched_at': None, 'saved_file': INPUT, 'sha256': sha(INPUT)},
    {'source_id': 'EARLIER', 'url': None, 'input_path': EARLIER,
     'edition': 'Earlier pilot reading (passage-pilot-v1), claims c1-c24',
     'fetched_at': None, 'saved_file': EARLIER, 'sha256': sha(EARLIER)},
]
for sid, (fname, ed) in SRC.items():
    e = log_entry(fname)
    p = os.path.join(HERE, 'sources', fname)
    assert sha(p) == e['sha256'], fname
    sources.append({'source_id': sid, 'url': e['url'], 'input_path': None, 'edition': ed,
                    'fetched_at': e['fetched_at'], 'saved_file': 'sources/' + fname, 'sha256': e['sha256']})

findings = [
 {
  'finding_id': 'F1',
  'claim': 'Named mentions in the focal segment 10:4:6 are far more numerous than the earlier reading recorded. Rabbi Yaakov bar Zavdi is named twice, so the patronymic "bar Zavdi" also appears twice. Rav is named nine times: twice in each of the two "Rav disagrees" sentences, and once each in the baraita challenge, "what does Rav do with it", the salt case, "Rav\'s view is reversed" and "what Rav practised". Rabbi Abbahu, Rabbi Yohanan and Rabbi Yose are each named once. In 10:4:5, Rabbi Zeira and Rabbi Abbahu are each named twice.',
  'kind': 'textual',
  'evidence': [
   E('IN', 'רִבִּי יַעֲקֹב בַּר זַבְדִּי רִבִּי אַבָּהוּ בְשֵׁם רִבִּי יוֹחָנָן'),
   E('IN', 'קָם רִבִּי יוֹסֵי עִם רִבִּי יַעֲקֹב בַּר זַבְדִּי'),
   E('IN', 'רַב פְּלִיג דְּרַב אָמַר'),
   E('IN', 'מַתְנִיתָא פְלִיגָא עַל רַב'),
   E('IN', 'מַה עֲבַד לָהּ רַב'),
   E('IN', 'אָתָא לְגַבֵּי רַב'),
   E('IN', 'מִחְלְפָא שִׁיטָּתֵיהּ דְּרַב'),
   E('IN', 'וּמַה דְרַב נְהִיג'),
   E('IN', 'רִבִּי זְעִירָא בָּעָא קוֹמֵי רִבִּי אַבָּהוּ'),
  ],
  'reasoning': 'The counts come from a direct string count of the saved input text (see mention_inventory). "רַב פְּלִיג דְּרַב אָמַר" occurs twice verbatim. Each "רב" in it is a name mention. Rav is also referred to by first-person forms in his quoted saying (אֲנָא, בֵיתִי, בִּי), repeated in three quotations, and by "הוּא אמר" twice in the contradiction question.',
  'confidence': 'high',
  'graph_effect': 'Add mention records for every occurrence. Link them to the existing local entities. Do not create new entities. Repeated mentions are not new observations of a relationship.'
 },
 {
  'finding_id': 'F2',
  'claim': 'Rav\'s saying about instructing his household is quoted three times in 10:4:6: twice after "Rav disagrees" and once inside the contradiction question. It is one quoted statement used three times in the argument, not three events.',
  'kind': 'textual',
  'evidence': [
   E('IN', 'כַּד אֲנָא אָמַר לִבְנֵי בֵיתִי לִיתֵּן מַתָּנָה לְבַר נַשׁ לֵינָה חָזַר בִּי'),
   E('IN', 'תַּמָּן הוּא אָמַר כַּד אֲנָא אָמַר לִבְנֵי בֵיתִי לִיתֵּן מִתָּנָה לְבַר נַשׁ לֵינָה חָזַר בִּי'),
   E('PM_SHV', 'רב פליג וכו\'. היינו הא דלעיל דפליג על דרבי יוחנן ומה דהדר מייתי לה משום דבעי עוד למיפרך מהא דלקמן'),
  ],
  'reasoning': 'The wording is identical apart from vocalisation (מַתָּנָה / מִתָּנָה). Penei Moshe says that the second "Rav disagrees" is the same statement, repeated only to raise a further challenge. Own translation of Rav\'s words: "When I tell my household to give a gift to someone, I do not go back on it." Penei Moshe glosses לינה as "לית אנא" ("I do not").',
  'confidence': 'high',
  'graph_effect': 'Keep one Rav statement node (rav_practice) with three citation mentions. Its modality is habitual or conditional ("when I tell..."), not a dated event. The household (בני ביתי) and the generic recipient (בר נש) stay local, unnamed and hypothetical or generic.'
 },
 {
  'finding_id': 'F3',
  'claim': 'In Rav\'s saying, Mechon-Mamre reads "חוזר בי", while the Guggenheimer and Venice texts read "חזר בי". Mechon-Mamre also has "חוזר" in the second quotation, but "חזר" in the third. The meaning is the same ("I do not retract"). The difference is only a variant of the verb form.',
  'kind': 'textual',
  'evidence': [
   E('SHV_MM', 'ליתן מתנה לבר נש לינה חוזר בי'),
   E('SHV_VEN', 'ליתן מתנה לבר נש לינה חזר בי'),
  ],
  'reasoning': 'Direct comparison of the saved texts.',
  'confidence': 'high',
  'graph_effect': 'None beyond recording the variant.'
 },
 {
  'finding_id': 'F4',
  'claim': 'The baraita quoted against Rav gives four separate acquisition conditions for movables, by location. (1) In a public domain, or a courtyard belonging to neither party, movables are acquired by drawing (משיכה). (2) In the buyer\'s domain, the buyer acquires once the other party "accepted" the deal. (3) In the seller\'s domain, the buyer does not acquire until he lifts the goods, or draws them and removes everything from the owner\'s domain. (4) In the domain of a person holding the goods on deposit, the buyer does not acquire until that person transfers title to him, or rents him the goods\' place.',
  'kind': 'textual',
  'evidence': [
   E('IN', 'אֵימָתַי אָמְרוּ הַמְּטַלְטְלִין נִקְנִין בִּמְשִׁיכָה בִּרְשׁוּת הָרַבִּים אוֹ בְחָצֵר שֶׁאֵינָהּ שֶׁל שְׁנֵיהֶן'),
   E('IN', 'בִּרְשוּת הַלּוֹקֵחַ כֵּיוָן שֶׁקִּיבֵּל עָלָיו'),
   E('IN', 'בִּרְשׁוּת הַמּוֹכֵר לֹא קָנָה עַד שֶׁיַּגְבִּיהַּ אוֹ עַד שֶׁיִּמְשׁוֹךְ וְיוֹצִא אֶת כֹּל מֵרְשׁוּת הַבְּעָלִים'),
   E('IN', 'בִּרְשׁוּת זֶה שֶׁהָיוּ מוּפְקָדִין אֶצְלוֹ לֹא קָנָה עַד שֶׁיְּזַכֵּינוּ בָהֶן אוֹ עַד שֶׁיַּשְׂכִּיר לוֹ אֶת מְקוֹמָן'),
   E('SIR_SHV', 'כיון שקבל עליו המוכר. למכור ואמר כל מדה בכך וכך'),
   E('SIR_SHV', 'קנה לוקח. מיד ואע"פ שלא משך דקני ליה רשיתיה'),
   E('SIR_SHV', 'בחצר שאינה של שניהם. וכגון שלא השאיל להן מקום'),
   E('TK_KID18', 'כלומר, כיון שקיבל עליו המוכר למכור, קנה'),
  ],
  'reasoning': 'The four clauses are stated in the text. The subject of "קיבל עליו" (accepted) is not named in the text. Sirilio and Lieberman (Tosefta Kifshutah) both supply "the seller agreed to sell". Sirilio gives the reason: the buyer\'s own domain acquires for him. The "owner" (הבעלים) in clause 3 is the seller. Own translation of clause 4: "in the domain of the one with whom they were deposited, he does not acquire until he [the depositary] grants him title to them, or until he rents him their place".',
  'confidence': 'high',
  'graph_effect': 'Split the earlier general label acquisition_rule into four condition claims. The buyer, seller, owner and depositary are hypothetical legal roles in a baraita, not persons. They get no person nodes and no relationships.'
 },
 {
  'finding_id': 'F5',
  'claim': 'The depositary clause has competing wordings. The Yerushalmi reads that he must "grant him title to them" (שיזכינו / שיזיכנו בהן). The Tosefta, in both Bava Batra 5:2 and Kiddushin 1:8, reads "until he accepts upon himself" (עד שיקבל עליו). Lieberman records this difference. Beur HaGra proposes other wordings for the seller\'s-domain and depositary clauses. Mechon-Mamre lacks "ויוצא" in the seller\'s-domain clause.',
  'kind': 'textual',
  'evidence': [
   E('TOS_BB52', 'ברשות זה המופקד אצלו, עד שיקבל עליו, או עד שישכיר לו את מקומו'),
   E('TOS_KID18', 'ברשות זה המופקדין אצלו, עד שיקבל עליו, או עד שישכור לו את מקומן'),
   E('TK_BB52', 'אבל בירושלמי שצויין לעיל: ברשות זה שהיו מופקדין אצלו לא קנה עד שיזכוהו בהן, או עד שישכיר לו את מקומו'),
   E('SHV_MM', 'לא קנה עד שיגביה או עד שימשוך את הכל מרשות הבעלים'),
   E('GRA_SHV', 'ה"ג עד שימשוך אותה מרשות בעלים'),
   E('GRA_SHV', 'ה"ג ברשות שהיו מופקדים כו\''),
  ],
  'reasoning': 'The Tosefta text and the Yerushalmi quotation of the same baraita are different sources. The GRA\'s "ה\"ג" (so one should read) is a proposed reading. It is a different kind of evidence from a manuscript variant.',
  'confidence': 'high',
  'graph_effect': 'No people are affected. Keep the wording variants on the legal condition claim.'
 },
 {
  'finding_id': 'F6',
  'claim': 'Commentators explain the baraita\'s challenge to Rav in two ways. Penei Moshe argues a fortiori: a buyer does not acquire without lifting or removing the goods, so a gift recipient surely does not acquire by words alone. Why, then, does Rav say he never retracts? Sirilio argues that if Rav held a biblical prohibition on retracting, the baraita could not say "he has not acquired" in the seller\'s domain.',
  'kind': 'interpretation',
  'evidence': [
   E('PM_SHV', 'מכ"ש במקבל מתנה דלא זכה בדיבור לחודיה ואמאי קאמר רב לית אנא חזר בי'),
   E('SIR_SHV', 'ואי איסור תורה מאי לא קנה דקתני גבי רשות מוכר'),
   E('SHV_GUG_EN', 'Why should he not change his mind since there was no acquisition and no money given?'),
  ],
  'reasoning': 'These are commentary explanations of why the baraita "disagrees with Rav". The text itself only says "מַתְנִיתָא פְלִיגָא עַל רַב" ("a baraita disagrees with Rav"). Guggenheimer\'s note follows Penei Moshe\'s line.',
  'confidence': 'medium',
  'graph_effect': 'The challenge comes from a baraita against Rav\'s view. The asker is the anonymous voice of the Talmud. No person-to-person relation.'
 },
 {
  'finding_id': 'F7',
  'claim': 'The answer "what does Rav do with it? Here when he stood him with him, there when he did not" is the anonymous Talmud reconstructing Rav\'s position. It is not something Rav is reported to say. Who "stood" whom is not stated, and commentators differ. Penei Moshe: in the baraita the seller did not have the buyer standing with him where the goods lay, while in Rav\'s case the giver had the recipient with him and showed him the gift. Sirilio: in Rav\'s case the seller stood the buyer with him to see the merchandise. The GRA\'s reading is "in the presence of both". Schwab: the promise was made formally, before the household.',
  'kind': 'interpretation',
  'evidence': [
   E('IN', 'מַה עֲבַד לָהּ רַב כָּאן כְּשֶׁהֶעֱמִידוֹ עִמּוֹ כָּאן כְּשֶׁלֹּא הֶעֱמִידוֹ עִמּוֹ'),
   E('PM_SHV', 'רב מוקי להאי ברייתא בשלא העמיד ללוקח עמו במקום שהמטלטלין מונחין בשעת תנאי המקח'),
   E('PM_SHV', 'והאי דרב גופיה בשהעמיד להמקבל עמו בשעה שאמר ליתן לו והראה לו מה שהוא'),
   E('SIR_SHV', 'ומשני דרב מיירי כשהעמידו עמו. לראות הסחורה אזי איכא איסורא ולא מצי הדר'),
   E('GRA_SHV', 'ה"ג כאן בשהעמידו עמו. פי\' במעמד שניהן'),
   E('SHV_SCHWAB', 'Il dit qu’on ne peut pas y renoncer lorsque la promesse a été faite formellement (par devant les gens de la maison)'),
   E('SHV_GUG_EN', 'In this provisional answer, it is only asserted that the promise of a gift to another person is binding.'),
  ],
  'reasoning': '"מַה עֲבַד לָהּ רַב" ("what does Rav do with it?") asks how Rav would answer. The reply is given in Rav\'s name, but with no speech verb from Rav. Guggenheimer calls it "provisional". The pronoun referents (subject and object of הֶעֱמִידוֹ) are unresolved in the text. Venice reads "כאן בשלא" and Mechon-Mamre "כאן שהעמידו". These are minor wording variants.',
  'confidence': 'medium',
  'graph_effect': 'Record the distinction as a claim the anonymous voice makes on Rav\'s behalf. It needs a voice type such as "reconstructed on behalf of". Do not create a Rav speech act. Leave the parties of הֶעֱמִידוֹ as unresolved roles.'
 },
 {
  'finding_id': 'F8',
  'claim': 'Commentators disagree about the second "Rav disagrees" sentence and what "תֵּדָע לָךְ" ("know that...") proves. Penei Moshe: the statement is repeated in order to raise a further challenge from the salt case. Sirilio: the Talmud is asserting that Rav really does disagree even without "standing with him", because telling his household was enough. Beur HaGra reads the salt case as showing that one must distinguish "stood with him" from "did not", before the final answer drops that distinction. Mareh HaPanim: the final answer could have been given here already, and the "standing" answer only met the baraita.',
  'kind': 'interpretation',
  'evidence': [
   E('PM_SHV', 'תדע לך. מהאי עובדא דלקמיה'),
   E('SIR_SHV', 'רב פליג וכו\'. תלמודא קאמר דקושטא דמילתא דרב פליג ואפילו בלא העמידו דהא כדאמר לבני ביתו סגי'),
   E('GRA_SHV', 'וכא הוא אמר הכין. אלא ע"כ שיש לחלק בין העמידו עמו או לא'),
   E('GRA_SHV', 'ומשני תמן למידת הדין. כלומר אין לחלק בין העמידו עמו או לא אלא מן הדין אינו מחויב ליתן לו אלא כנגד ערבונו או לקבל מי שפרע'),
   E('MHP_SHV', 'הכא הוי מצי לשנויי כדמשני לבסוף'),
  ],
  'reasoning': 'The text does not say how the second "Rav disagrees" and "know that" relate to the answer before them. The readings above are commentary interpretations and are kept separate.',
  'confidence': 'medium',
  'graph_effect': 'Do not treat the second "Rav disagrees" as a new disagreement event. Its argumentative function is an unresolved interpretation.'
 },
 {
  'finding_id': 'F9',
  'claim': 'The salt case has at least two parties. A named-as-anonymous "one person" gave a deposit toward salt. An unmentioned counterparty (the seller) is implied by Rav\'s third-person ruling "either he should give him all his deposit, or he should hand him over to \'He who exacted payment\'". The text does not name who came before Rav. Continuity of subject suggests the depositor, but Penei Moshe describes the seller as the one wanting to retract. Guggenheimer says this version makes Rav the judge.',
  'kind': 'textual',
  'evidence': [
   E('IN', 'חַד בַּר נַשׁ אַפְקִיד עֵירָבוֹן עַל מִילְחָא וְיָקְרָת. אָתָא לְגַבֵּי רַב אָמַר לֵיהּ אוֹ יִתֵּן לוֹ כָּל עֵירָבוֹנוֹ אוֹ יִמְסוֹר לוֹ לְמִי שֶׁפָּרַע'),
   E('PM_SHV', 'שעשה מקח עם א\' על המלח ונתן לו משכון על המקח'),
   E('PM_SHV', 'נתייקר המלח ורצה המוכר לחזור בו ואתא לקמיה דרב'),
   E('SHV_GUG_EN', 'The version of the story here implies that Rav was the judge.'),
   E('SHV_MM', 'אתא לגביה רב'),
  ],
  'reasoning': 'Own translation: "A certain person deposited earnest-money for salt, and it became dear. He came to Rav; he said to him: either he gives him [goods for] all his earnest, or he hands him over to \'He who exacted payment\'." In "יִתֵּן לוֹ" the one who gives must be the party holding the salt, who is never mentioned. Mechon-Mamre reads "אתא לגביה רב", which could be read as "Rav came to him". This is most likely a copying variant of "לגבי רב", but it is recorded rather than decided.',
  'confidence': 'medium',
  'graph_effect': 'Keep salt_client (depositor). Add an implied local placeholder for the salt seller (basis: implied by the ruling). The visitor to Rav stays salt_client, at medium confidence. The case is a legal report told as an incident. It shows a ruling scene, not evidence of any wider relationship with Rav.'
 },
 {
  'finding_id': 'F10',
  'claim': 'The legal condition in Rav\'s salt ruling is the measure of "all his deposit". Commentators read it as goods worth the amount of the deposit, not the whole contract. The alternative is the מי שפרע imprecation, not full delivery. In the JT Bava Metzia 4:2 parallel, the same pair of options ("כדי עירבונו" or מי שפרע) is attributed to Rabbi Hiyya bar Yosef, and Rabbi Yohanan requires "כל מקחו" (the whole purchase). The Bavli attributes the position "commensurate with the deposit" to Rav.',
  'kind': 'textual',
  'evidence': [
   E('PM_SHV', 'כל מה שהוא נגד ערבונו יתן לו כפי שוויו כך וכך מלח'),
   E('SIR_SHV', 'או יתן לו. כל סך ערבונו דכנגדו הוא קונה'),
   E('BM42_VEN', 'רבי חייה בר יוסף אמ\' או יתן לו כדי עירבונו או ימסור אותו למי שפרע ור\' יוחנן אמ\' או יתן לו כל מקחו או ימסור אותו למי שפרע'),
   E('BAVLI_BM48B', 'עֵרָבוֹן, רַב אוֹמֵר: כְּנֶגְדּוֹ הוּא קוֹנֶה, וְרַבִּי יוֹחָנָן אָמַר: כְּנֶגֶד כּוּלּוֹ הוּא קוֹנֶה'),
  ],
  'reasoning': 'The Sheviit text says "כל עירבונו". Penei Moshe and Sirilio both read it as "commensurate with the deposit". The parallels assign similar content to different named sages. This is a difference in attribution between passages. It does not show that the same person said both.',
  'confidence': 'high',
  'graph_effect': 'Attach the condition to the salt_ruling statement. Record the parallels as separate attributions in other passages. Do not merge salt_client with Rabbi Hiyya bar Yosef or with Rav Kahana (see F16).'
 },
 {
  'finding_id': 'F11',
  'claim': 'The anonymous Talmud claims that Rav contradicts himself. "There" (the household saying) he never retracts, and "here" (the salt ruling) he says the seller may, subject to the options above. The resolution uses "there" for the other case: "there it is by the measure of law, and what Rav practised is by the measure of piety". This final qualification is the anonymous Talmud\'s, not Rav\'s.',
  'kind': 'textual',
  'evidence': [
   E('IN', 'מִחְלְפָא שִׁיטָּתֵיהּ דְּרַב. תַּמָּן הוּא אָמַר'),
   E('IN', 'וְכָא הוּא אָמַר הָכֵין. תַּמָּן לְמִידַּת הַדִּין הוּא וּמַה דְרַב נְהִיג לְמִידַּת חֲסִידוּת'),
   E('PM_SHV', 'ומשני. תמן בהאי עובדא למדת הדין הוא דלדינא הורה כן ומה דרב נהיג בעצמו למדת חסידות הוא'),
   E('GRA_SHV', 'ומה דנהג רב. אינו אלא למדת חסידות'),
   E('SHV_GUG_EN', 'There it is for a legal rule; what Rav did himself was a measure of piety.'),
   E('SHV_MM', 'תמן למידת הדין ומה דרב נהג למדת חסידות'),
  ],
  'reasoning': 'In the question, "תמן" (there) is the household saying and "כא" (here) the salt case. Penei Moshe explicitly takes the "תמן" of the answer as the salt case ("בהאי עובדא"), so the referent of "תמן" shifts within the exchange. Guggenheimer\'s note 135 agrees on the outcome: the household saying "at the end ... will be accepted as a moral precept only". Own translation of the answer: "There [the salt ruling] is according to the measure of law; and what Rav used to do is according to the measure of piety."',
  'confidence': 'high',
  'graph_effect': 'Qualify the Rav practice statement as "personal practice beyond the law", as characterised by the anonymous voice. Mark "Rav disagrees with Rabbi Yohanan" (F12) as a proposed disagreement, later narrowed so that it no longer concerns the legal rule. Do not record a settled legal dispute between Rav and Rabbi Yohanan from this passage.'
 },
 {
  'finding_id': 'F12',
  'claim': 'Penei Moshe says "Rav disagrees" means Rav disagrees with Rabbi Yohanan\'s gift rule, which was just transmitted: one who promised a gift may retract. The earlier reading has no claim linking Rav\'s disagreement to Rabbi Yohanan\'s teaching.',
  'kind': 'interpretation',
  'evidence': [
   E('IN', 'רַב פְּלִיג דְּרַב אָמַר'),
   E('PM_SHV', 'רב פליג. אהא דר\' יוחנן'),
   E('SIR_SHV', 'לית אנא חזר בי. דקסבר רב דברים יש בהן משום מחוסרי אמנה ואיסורא דאוריית\' איכא. ובמסקנא לא קיימא הכי אלא למדת חסידות'),
  ],
  'reasoning': 'The text says only "Rav disagrees". The object is inferred from the adjacent teaching, and Penei Moshe makes it explicit. Sirilio adds that the conclusion does not keep this view as law, only as piety.',
  'confidence': 'high',
  'graph_effect': 'Add a views claim: Rav\'s saying is presented as disagreeing with the Yohanan gift rule (discourse_status: proposed; later qualified by F11). This is a disagreement between teachings, not evidence that the two met.'
 },
 {
  'finding_id': 'F13',
  'claim': 'The transmission chain for the gift rule differs between Yerushalmi parallels. In Sheviit 10:4:6 and Bava Metzia 4:2 it reads "R. Yaakov bar Zavdi, R. Abbahu in the name of R. Yohanan". In Maaser Sheni 4:4 and Shevuot 4:7 it is headed by R. Yose: "R. Yose, R. Yaakov bar Zavdi, R. Abbahu in the name of R. Yohanan". Gittin 6:1 (Venice) reads "R. Yose and R. Yaakov bar Zavdi". Schwab translates the juxtaposed names in Sheviit as alternatives joined by "or".',
  'kind': 'textual',
  'evidence': [
   E('SHV_VEN', 'רבי יעקב בר זבדי רבי אבהו בשם רבי יוחנן אמר ליתן מתנה לחבירו'),
   E('BM42_VEN', 'רבי יעקב בר זבדי רבי אבהו בשם רבי יוחנן אמר ליתן מתנה לחבירו'),
   E('MS44_VEN', 'דאמר רבי יוסי ר\' יעקב בר זבדי רבי אבהו בשם רבי יוחנן'),
   E('SHEVU47_VEN', 'ר\' יוסי ר\' יעקב בר זבדי ר\' אבהו בשם רבי יוחנן'),
   E('GIT61_VEN', 'דאמר ר\' יוסה ורבי יעקב בר זבדי רבי אבהו בשם ר\' יוחנן'),
   E('SHV_SCHWAB', 'R. Jacob bar Zabdi ou R. Abahou dit au nom de R. Yohanan'),
   E('SHV_GUG_EN', 'Rebbi Jacob bar Zavdi, Rebbi Abbahu in the name of Rebbi Joḥanan'),
  ],
  'reasoning': 'Only the Abbahu-to-Yohanan link carries an explicit "בשם" (in the name of). The unconnected juxtapositions can be read as a sequence (X from Y), as parallel tradents, or (following Schwab) as alternatives. Guggenheimer keeps a neutral comma. The Gittin "and" is one printed wording. Penei Moshe on Maaser Sheni shortens the chain to "R. Yose in the name of R. Yohanan", which is an interpretive summary, not a text.',
  'confidence': 'high',
  'graph_effect': 'Keep "Abbahu reports in the name of Yohanan" as explicit. Keep the Yaakov bar Zavdi links (c11/c12) as alternative branches, and add a third branch: alternative attribution, following Schwab. Record the R. Yose-headed chain as a reading in other passages (MS 4:4, Shevuot 4:7, Gittin 6:1), not in Sheviit. No teacher-student relation is established.'
 },
 {
  'finding_id': 'F14',
  'claim': 'The dialogue about "a just yes" also differs across parallels. In Sheviit, R. Yose "stood with" R. Yaakov bar Zavdi and objects, and the answer is introduced by a bare "he said". Maaser Sheni introduces the answer with a plural "they said". Gittin (Venice) has "he said to him". Guggenheimer says that in Gittin R. Yaakov bar Zavdi answers R. Yose. In Shevuot, R. Yaakov bar Zavdi is the one who asks, before R. Abbahu. Bava Metzia 4:2 in the Venice print has no question at all. Guggenheimer supplies a question from the Escorial manuscript in which R. Yaakov bar Zavdi asks R. Abbahu.',
  'kind': 'textual',
  'evidence': [
   E('IN', 'קָם רִבִּי יוֹסֵי עִם רִבִּי יַעֲקֹב בַּר זַבְדִּי אָמַר לֵיהּ הָהֵן לָאו צֶדֶק וְהִין צֶדֶק אָמַר בְּשָׁעָה שֶׁאָמַר הִין שֶׁל צֶדֶק הָיָה'),
   E('MS44_VEN', 'קם רבי יוסי עם רבי יעקב בר זבדי אמר ליה והינו הין צדק אמרין בשעה שאמר הין צדק הוה'),
   E('GIT61_VEN', 'קם רבי יוסי עם רבי יעקב בר זבדי אמר ליה והן הוא הין צדק אמר ליה בשעה שאמרו הין צדק היה'),
   E('GIT61_GUG', 'Rebbi Yose stood near Rebbi Jacob bar Zavdi and said to him'),
   E('BM42_GUG', 'In the Giṭṭin text, it is R. Jacob bar Zavdi who gives the answer to R. Yose'),
   E('SHEVU47_VEN', 'רבי יעקב בר זבדי בעא קומי ר\' אבהו ואהן הין לא בצדק הוא והין צדק אמר בשעה שאמ\' הין של צדק הוה'),
   E('BM42_VEN', 'חוזר אמ\' בשעה שאמר צריך לומר בדעת גמורה'),
   E('BM42_GUG', 'Text added from E. Since the answer is given in L, the question must have been in the original text.'),
  ],
  'reasoning': 'The Sheviit answer has no named speaker. The nearest addressee of R. Yose\'s objection is R. Yaakov bar Zavdi, and the Gittin wording "אמר ליה" and Schwab\'s "répondit-il" point the same way. The Maaser Sheni "אמרין" instead makes the answer anonymous and plural. In Shevuot and Bava Metzia (Escorial), the questioner is R. Yaakov bar Zavdi and the implied answerer is R. Abbahu. The same exchange has different directions in different passages. The Guggenheimer Bava Metzia bracket is an editorial insertion from one manuscript (E), so it is a different kind of evidence from a printed reading.',
  'confidence': 'high',
  'graph_effect': 'For Sheviit: Yose objects to Yaakov bar Zavdi (explicit). The answer is by Yaakov bar Zavdi (local coreference, medium), with an alternative branch of an anonymous or plural answer. Do not import "Yaakov bar Zavdi asks Abbahu" into Sheviit. Record it as the Shevuot and Bava Metzia (Escorial) reading.'
 },
 {
  'finding_id': 'F15',
  'claim': 'Two textual interventions on the Sheviit dialogue exist, and they are later proposals, not variants. Sha\'arei Torat Eretz Yisrael emends "אמר ליה ההן" to "והיינו", matching Maaser Sheni. In the Beur HaGra (manuscript A of the commentary), R. Yaakov bar Zavdi himself states the "just hin" teaching, with "יהיה" ("should be") where the text has "היה" ("was").',
  'kind': 'textual',
  'evidence': [
   E('STEY_SHV', 'א"ל ההן לאו צדק והין צדק. — צ"ל: והיינו'),
   E('GRA_SHV', 'כתב יד א ר\' יעקב בר זבדי אמר הין צדק יהיה לך שיהא הן שלך צדק ולאו שלך צדק בשעה שאומר הן של צדק יהיה'),
  ],
  'reasoning': 'צ"ל ("one must read") marks an emendation. The GRA line may be a reconstruction or a paraphrase. It is not labelled "ה\"ג" as other GRA entries are. It is saved as a proposed reading and is not treated as a manuscript witness.',
  'confidence': 'medium',
  'graph_effect': 'Record the GRA reading as a later proposal in which Yaakov bar Zavdi is the speaker of the hin teaching. Do not use it to settle F14.'
 },
 {
  'finding_id': 'F16',
  'claim': 'Other passages tell a similar deposit-and-price-rise case with different named people. Bavli Bava Metzia 48b: buyers gave Rabbi Hiyya bar Yosef money for salt, and he came before Rabbi Yohanan. Bavli Bava Metzia 49a: buyers gave Rav Kahana money for flax, and he came before Rav, who told him to deliver for what he received, since the rest was "words". JT Bava Metzia 4:2: Rabbi Hiyya bar Yosef paid for salt, and a silk case came before Rabbi Hiyya bar Yosef and Rabbi Yohanan.',
  'kind': 'textual',
  'evidence': [
   E('BAVLI_BM48B', 'דְּרַבִּי חִיָּיא בַּר יוֹסֵף יְהַבוּ לֵיהּ זוּזֵי אַמִּלְחָא. לְסוֹף אִיַּיקַּר מִלְחָא. אֲתָא לְקַמֵּיהּ דְּרַבִּי יוֹחָנָן'),
   E('BAVLI_BM49A', 'רַב כָּהֲנָא יְהַבוּ לֵיהּ זוּזֵי אַכִּיתָּנָא, לְסוֹף אִיַּיקַּר כִּיתָּנָא. אֲתָא לְקַמֵּיהּ דְּרַב'),
   E('BM42_VEN', 'רבי חייה בר יוסף יהב דינר למלחא חזר ביה ההוא'),
   E('SHV_GUG_EN', 'In the Babli, Baba Meẓi‘a 48b, the story is told of R. Ḥiyya bar Josef, who appeared before R. Joḥanan.'),
  ],
  'reasoning': 'These are similar cases in different passages, with different named participants and judges. A shared plot does not make the Sheviit "one person" identical to any named figure.',
  'confidence': 'high',
  'graph_effect': 'Keep salt_client as an unnamed local person. Store the parallels as possible story parallels, not as identity links.'
 },
 {
  'finding_id': 'F17',
  'claim': 'The Bava Metzia 4:2 parallel has a different version of Rav\'s practice, with a condition that Sheviit lacks. Rav instructed his attendant (שמשיה): if the recipient is poor, give at once; if rich, consult him again. Guggenheimer notes this contradicts Sheviit. The preceding line ("this applies to a poor ... but with a rich one it becomes a vow") is emended by Mareh HaPanim to reverse "poor" and "rich".',
  'kind': 'textual',
  'evidence': [
   E('BM42_VEN', 'הדא דתימר בעני אבל בעשיר נעשה נדר רב מפקד לשמשיה אימת דנימר לך תתן מתנה לבר נש אין הוה מסכן הב ליה מיד ואין עתיר אימליך בי תניינות'),
   E('BM42_GUG', 'This contradicts the statement in Ševi‘t 10:9 that Rav never changed his mind once he had promised a gift.'),
   E('MHP_BM42', 'ויש לגרוס כאן הדא דתימר בעשיר אבל בעני נעשה נדר'),
   E('PM_BM42', 'רב. היה מצוה למשרתו כשאומר לך תן מתנה לעני תתן לו מיד ולא תשאל אותי עוד לפי שאיני יכול לחזור בו ואם הוא עשיר המלך בי שנית'),
  ],
  'reasoning': 'Own translation of Bava Metzia: "Rav used to command his attendant: whenever I tell you, give a gift to someone, if he is poor, give it to him at once; if he is rich, consult me a second time." The addressee (attendant vs household) and the condition (poor vs rich) differ from Sheviit. Guggenheimer\'s "10:9" is his halakhah numbering, which corresponds to Sefaria\'s Sheviit 10:4 here.',
  'confidence': 'high',
  'graph_effect': 'Record a separate version of Rav\'s practice in another passage, with an attendant addressee and a poor/rich condition. Do not merge the attendant with the Sheviit household. Keep the two versions as conflicting reports of Rav\'s practice.'
 },
 {
  'finding_id': 'F18',
  'claim': 'The Bavli reverses the positions. There Rav holds that words have no aspect of breach of faith, and Rabbi Yohanan holds that they do. In the Yerushalmi it is Rav whose own practice is not to retract. Sirilio explicitly notes the reversal.',
  'kind': 'textual',
  'evidence': [
   E('BAVLI_BM49A', 'דְּבָרִים, רַב אָמַר: אֵין בָּהֶן מִשּׁוּם מְחוּסְּרֵי אֲמָנָה, וְרַבִּי יוֹחָנָן אָמַר: יֵשׁ בָּהֶם מִשּׁוּם מְחוּסְּרֵי אֲמָנָה'),
   E('SIR_SHV', 'ובגמ\' דילן פ\' הזהב איפכא גרסינן דרב סבר דברים אין בהן משום מחוסרי אמנה ור\' יוחנן אמר דברים יש בהן משום מחוסרי אמנה'),
   E('BAVLI_BM49A', 'הָאוֹמֵר לַחֲבֵירוֹ מַתָּנָה אֲנִי נוֹתֵן לָךְ – יָכוֹל לַחֲזוֹר בּוֹ'),
  ],
  'reasoning': 'The two Talmuds attribute the stricter and more lenient positions differently. This is a difference in textual attribution. It does not show what either sage historically held.',
  'confidence': 'high',
  'graph_effect': 'Store the Bavli positions as views attributed in another passage. Do not use them to overwrite the Sheviit reading.'
 },
 {
  'finding_id': 'F19',
  'claim': 'The wider context: the halakhah comments on the Mishnah\'s last clause, "all movables are acquired by drawing, and whoever keeps his word, the Sages are pleased with him". Segment 10:4:6 is the last segment of the tractate: the Venice print closes the chapter and tractate after it.',
  'kind': 'textual',
  'evidence': [
   E('SHV_GUG_HE', 'כָּל הַמִּטַּלְטְלִין נִקְנִין בִּמְשִׁיכָה וְכָל הַמְקַיֵים אֶת דְּבָרָיו רוּחַ חֲכָמִים נוֹחָה הִימֶּינּוּ'),
   E('SHV_VEN', 'הדרן עלך השביעית משמטת וסליקא לה מסכת שביעית'),
  ],
  'reasoning': 'No later Sheviit context exists to check. Context for the people comes from the parallels, not from following segments.',
  'confidence': 'high',
  'graph_effect': 'The episode can be closed at 10:4:6. Context needed beyond the supplied segments is limited to the Mishnah (10:4:1) and the parallels.'
 },
 {
  'finding_id': 'F20',
  'claim': 'In 10:4:5, the ring rule is carried by "R. Zeira, R. Abbahu in the name of R. Yohanan". The Bava Metzia 4:2 parallel attributes a similar ring statement to "R. Yaakov bar Idi, R. Abbahu in the name of R. Yohanan". Schwab again translates the Sheviit names as alternatives ("R. Zeira ou R. Abahou").',
  'kind': 'textual',
  'evidence': [
   E('IN', 'רִבִּי זְעִירָא רִבִּי אַבָּהוּ בְשֵׁם רִבִּי יוֹחָנָן הַנּוֹתֵן עֵירָבוֹן טַבַּעַת'),
   E('BM42_VEN', 'רבי יעקב בר אידי רבי אבהו בשם רבי יוחנן טבעת אין בה משום עירבון'),
   E('SHV_SCHWAB', 'R. Zeira ou R. Abahou dit au nom de R. Yohanan'),
  ],
  'reasoning': 'Only the Abbahu-Yohanan link is shared. The head of the chain differs between passages. This concerns the context segment, not the focal one.',
  'confidence': 'high',
  'graph_effect': 'Keep Zeira\'s links (c5/c6) as branches. Add a Schwab alternative branch. Record the Yaakov bar Idi chain as a reading in another passage.'
 },
 {
  'finding_id': 'F21',
  'claim': 'Two small legal-wording points in 10:4:4 affect the condition in Rabbi Yohanan\'s teaching on verbal dealings. The Venice print reads "ומניין" where Guggenheimer, following manuscripts, reads "זמניין". Sha\'arei Torat Eretz Yisrael and the GRA would drop "אלא" ("only") from "one hands him over only to מי שפרע". Guggenheimer calls "only" a scribal error.',
  'kind': 'textual',
  'evidence': [
   E('SHV_VEN', 'הנושא והנותן בדברים ומניין דאת אמר'),
   E('STEY_SHV', 'צ"ל: אין מוסרין אותו למי שפרע'),
   E('GRA_SHV', 'כתב יד א ה"ג מוסרים אותו למי שפרע'),
   E('SHV_GUG_EN', '“Only” must be a scribal error since the curse by the court is more of a punishment than the displeasure of the Sages.'),
  ],
  'reasoning': 'These are emendations and variants in a context segment. They are recorded because the question asks for missing legal conditions.',
  'confidence': 'medium',
  'graph_effect': 'None for people. Attach the wording variants to verbal_rule.'
 },
 {
  'finding_id': 'F22',
  'claim': 'The translations differ materially on the salt case. Schwab renders "deposited earnest on salt" as "confier du sel en gage" (entrusting salt as a pledge). He renders "hand him over to מי שפרע" as "le livrer à qui l\'a payé" (deliver it to the one who paid), not as the imprecation formula. Guggenheimer translates the formula as "Him who made pay".',
  'kind': 'uncertainty',
  'evidence': [
   E('SHV_SCHWAB', 'il arriva à quelqu’un de confier du sel en gage à son prochain'),
   E('SHV_SCHWAB', 'ou l’on devra remettre à l’acquéreur toute la valeur du gage, ou le livrer à qui l’a payé'),
   E('SHV_GUG_EN', 'or he should be given up to “Him who made pay”'),
  ],
  'reasoning': 'The two translations understand the ruling differently. The commentaries consulted (Penei Moshe, GRA) read מי שפרע as the imprecation formula. This supports Guggenheimer\'s reading here, but the disagreement is kept.',
  'confidence': 'medium',
  'graph_effect': 'None for the people. The ruling\'s content should follow the commentary reading, with Schwab\'s reading recorded as an alternative translation.'
 },
]

alternative_readings = [
 {'id': 'A1', 'topic': 'Relation of Yaakov bar Zavdi and Abbahu in the Sheviit chain',
  'readings': [
   {'reading': 'Sequential: Yaakov bar Zavdi reports from Abbahu, who reports in the name of Yohanan', 'held_by': 'earlier reading branch gift_sequential; the usual Yerushalmi juxtaposition convention (not stated in the text)', 'support': 'possible'},
   {'reading': 'Parallel: both report in the name of Yohanan', 'held_by': 'earlier reading branch gift_parallel', 'support': 'possible'},
   {'reading': 'Alternative attribution: Yaakov bar Zavdi or Abbahu', 'held_by': 'Schwab ("ou")', 'support': 'translation choice'},
   {'reading': 'In other passages a longer chain headed by R. Yose (MS 4:4, Shevuot 4:7), or "R. Yose and R. Yaakov bar Zavdi" (Gittin 6:1 Venice)', 'held_by': 'the printed parallels', 'support': 'readings in other passages, not in Sheviit'}],
  'evidence': [E('IN', 'רִבִּי יַעֲקֹב בַּר זַבְדִּי רִבִּי אַבָּהוּ בְשֵׁם רִבִּי יוֹחָנָן'), E('SHV_SCHWAB', 'R. Jacob bar Zabdi ou R. Abahou dit au nom de R. Yohanan'), E('MS44_VEN', 'דאמר רבי יוסי ר\' יעקב בר זבדי רבי אבהו בשם רבי יוחנן')]},
 {'id': 'A2', 'topic': 'Who answers "at the time he said it, it was a just yes"',
  'readings': [
   {'reading': 'R. Yaakov bar Zavdi answers R. Yose', 'held_by': 'nearest addressee in Sheviit; Gittin "אמר ליה"; Guggenheimer on the Gittin text; Schwab "répondit-il"; Penei Moshe (Gittin, Maaser Sheni) "השיב לו"', 'support': 'strongest for Sheviit'},
   {'reading': 'An anonymous plural answer ("they said")', 'held_by': 'Maaser Sheni 4:4 wording "אמרין"', 'support': 'reading in another passage'},
   {'reading': 'R. Abbahu answers R. Yaakov bar Zavdi (who is the questioner)', 'held_by': 'Shevuot 4:7; Bava Metzia 4:2 with the question added from the Escorial manuscript', 'support': 'another passage with a different direction'}],
  'evidence': [E('IN', 'אָמַר בְּשָׁעָה שֶׁאָמַר הִין שֶׁל צֶדֶק הָיָה'), E('MS44_VEN', 'אמרין בשעה שאמר הין צדק הוה'), E('SHEVU47_VEN', 'רבי יעקב בר זבדי בעא קומי ר\' אבהו')]},
 {'id': 'A3', 'topic': 'Meaning of "כשהעמידו עמו" (when he stood him with him)',
  'readings': [
   {'reading': 'The recipient or buyer was present where the goods were and was shown them', 'held_by': 'Penei Moshe; Sirilio ("to see the merchandise")', 'support': 'commentary'},
   {'reading': 'In the presence of both parties', 'held_by': 'Beur HaGra', 'support': 'commentary'},
   {'reading': 'A formal promise before the household', 'held_by': 'Schwab', 'support': 'translation gloss'},
   {'reading': '"if he was standing with him" (provisional answer, left open)', 'held_by': 'Guggenheimer', 'support': 'translation'}],
  'evidence': [E('PM_SHV', 'והאי דרב גופיה בשהעמיד להמקבל עמו בשעה שאמר ליתן לו והראה לו מה שהוא'), E('GRA_SHV', 'פי\' במעמד שניהן')]},
 {'id': 'A4', 'topic': 'Function of the second "Rav disagrees" and "תדע לך"',
  'readings': [
   {'reading': 'A repeated quotation that sets up a new challenge from the salt case', 'held_by': 'Penei Moshe', 'support': 'commentary'},
   {'reading': 'An assertion that Rav disagrees even without "standing with him"', 'held_by': 'Sirilio', 'support': 'commentary'},
   {'reading': 'The salt case proves one must distinguish stood/not stood, before the final answer removes the distinction', 'held_by': 'Beur HaGra', 'support': 'commentary'},
   {'reading': 'The final law/piety answer could already apply here', 'held_by': 'Mareh HaPanim', 'support': 'commentary'}],
  'evidence': [E('PM_SHV', 'תדע לך. מהאי עובדא דלקמיה'), E('SIR_SHV', 'תלמודא קאמר דקושטא דמילתא דרב פליג ואפילו בלא העמידו')]},
 {'id': 'A5', 'topic': 'Rav\'s practice regarding promised gifts',
  'readings': [
   {'reading': 'Never retracts an instruction to his household to give a gift (piety, per the final answer)', 'held_by': 'Sheviit 10:4:6', 'support': 'this passage'},
   {'reading': 'Immediate gift only to a poor recipient; for a rich one his attendant must consult him again', 'held_by': 'JT Bava Metzia 4:2', 'support': 'another passage; Guggenheimer: contradicts Sheviit'},
   {'reading': 'Rav holds that words carry no breach of faith (the more lenient position)', 'held_by': 'Bavli Bava Metzia 49a', 'support': 'another Talmud; reversed attribution'}],
  'evidence': [E('BM42_VEN', 'רב מפקד לשמשיה'), E('BAVLI_BM49A', 'רַב אָמַר: אֵין בָּהֶן מִשּׁוּם מְחוּסְּרֵי אֲמָנָה')]},
]

unresolved = [
 'Whether the Sheviit juxtaposition "R. Yaakov bar Zavdi, R. Abbahu" is sequential or parallel. The text gives no connector, and the parallels vary.',
 'Whether the Sheviit answer to R. Yose is by R. Yaakov bar Zavdi or anonymous. The Sheviit text has only "אמר". No Sheviit manuscript was checked directly. The manuscript notes consulted are Guggenheimer\'s (Rome, Leiden, Escorial) and the GRA\'s.',
 'Who "stood whom with him" (הֶעֱמִידוֹ עִמּוֹ): giver and recipient, or seller and buyer. The commentators differ.',
 'Who came before Rav in the salt case: the depositor, as subject continuity suggests, or the seller. The Mechon-Mamre wording "אתא לגביה רב" was not traced to a manuscript.',
 'Whether the Beur HaGra line giving R. Yaakov bar Zavdi the "just hin" teaching reflects a manuscript reading or the commentator\'s own reconstruction.',
 'The identity of "R. Yose" here, compared with the "R. Yose" heading the chain in Maaser Sheni and Shevuot, and whether "Rav" is Rav (Abba Arikha). Both are historical identity questions and were not decided.',
 'The commentaries checked were Penei Moshe, Sirilio, Beur HaGra, Mareh HaPanim and Sha\'arei Torat Eretz Yisrael on Sheviit, plus some commentary on the parallels. A Sefaria request for Korban HaEdah on Sheviit 10:4 and on Bava Metzia 4:2 returned 404. That shows only that the request failed, not that no commentary exists. Ridbaz (Chiddushei Ridbaz) was read only on Bava Metzia 4:2. Commentaries listed in the Sefaria link index but not fetched include Mishnat Eretz Yisrael, Noam Yerushalmi, Maharsham and Haamek Sheilah.',
]

proposed_corrections = [
 {'correction_id': 'PC1', 'existing_claim_id': None, 'change': 'Add mention records for all repeated names in 10:4:5-6 (see mention_inventory): Zeira #2 and Abbahu #2 in 10:4:5; Yaakov bar Zavdi #2 and Zavdi #2 in 10:4:6; Rav #2-#9. Also add Rav\'s first-person forms in the three quotations, and "הוּא" (x2) in the contradiction question.', 'why': 'The review found repeated mentions missing. Counts were verified against the saved text.', 'evidence': [E('IN', 'קָם רִבִּי יוֹסֵי עִם רִבִּי יַעֲקֹב בַּר זַבְדִּי'), E('IN', 'רִבִּי זְעִירָא בָּעָא קוֹמֵי רִבִּי אַבָּהוּ')]},
 {'correction_id': 'PC2', 'existing_claim_id': 'c1', 'change': 'Keep child_of(yaakov, zavdi) and the local Zavdi placeholder. Add the second patronymic occurrence as further evidence of the same relation, not as a second observation. Mark the kinship as literal patronymic, with no historical identification.', 'why': 'Project rule: a relationship embedded in a name is evidence, and repetition is not independent.', 'evidence': [E('IN', 'עִם רִבִּי יַעֲקֹב בַּר זַבְדִּי')]},
 {'correction_id': 'PC3', 'existing_claim_id': 'c11/c12', 'change': 'Keep both branches. Add an alternative-attribution branch (Schwab). Note that in the parallels the chain is headed by R. Yose. Leave Abbahu to Yohanan (c10) as explicit.', 'why': 'F13', 'evidence': [E('SHV_SCHWAB', 'R. Jacob bar Zabdi ou R. Abahou dit au nom de R. Yohanan')]},
 {'correction_id': 'PC4', 'existing_claim_id': 'c16', 'change': 'Change the basis of "Yaakov answers Yose" to local coreference at medium confidence. Add an alternative branch in which the answer is anonymous (Maaser Sheni "אמרין"). Record in a note that in Shevuot and Bava Metzia (Escorial) Yaakov bar Zavdi is instead the questioner of Abbahu.', 'why': 'F14: the Sheviit text has an unmarked "אמר", and the parallels differ on the direction of the dialogue.', 'evidence': [E('MS44_VEN', 'אמרין בשעה שאמר הין צדק הוה'), E('SHEVU47_VEN', 'רבי יעקב בר זבדי בעא קומי ר\' אבהו')]},
 {'correction_id': 'PC5', 'existing_claim_id': 'c17/c18', 'change': 'Attach all three quotations to one rav_practice statement. Set its modality to habitual or conditional. Add the final qualification: characterised by the anonymous voice as "measure of piety", not law.', 'why': 'F2 and F11', 'evidence': [E('IN', 'וּמַה דְרַב נְהִיג לְמִידַּת חֲסִידוּת')]},
 {'correction_id': 'PC6', 'existing_claim_id': None, 'change': 'Add a views claim: rav_practice is presented as disagreeing with gift_rule (Yohanan). Its discourse status is proposed, and it is narrowed by the final answer.', 'why': 'F12. The earlier reading had no claim for "רב פליג" against the Yohanan teaching.', 'evidence': [E('PM_SHV', 'רב פליג. אהא דר\' יוחנן')]},
 {'correction_id': 'PC7', 'existing_claim_id': 'c19', 'change': 'Replace the single acquisition_rule with four condition statements: neutral domain = drawing; buyer\'s domain = once the seller agreed; seller\'s domain = lifting or removal; depositary\'s domain = the depositary grants title, or rents the place. Record the Tosefta wording "עד שיקבל עליו" as a parallel variant.', 'why': 'F4 and F5. This fixes the review\'s "miss" on legal conditions.', 'evidence': [E('IN', 'בִּרְשׁוּת זֶה שֶׁהָיוּ מוּפְקָדִין אֶצְלוֹ לֹא קָנָה עַד שֶׁיְּזַכֵּינוּ בָהֶן'), E('TOS_BB52', 'עד שיקבל עליו')]},
 {'correction_id': 'PC8', 'existing_claim_id': 'c20', 'change': 'Recast c20 as a reconciliation that the anonymous voice offers on Rav\'s behalf ("what does Rav do with it"), rather than a Rav utterance. Keep the parties of הֶעֱמִידוֹ unresolved. Mark the answer as provisional: the argument moves on to a different final answer.', 'why': 'F7 and F8', 'evidence': [E('IN', 'מַה עֲבַד לָהּ רַב')]},
 {'correction_id': 'PC9', 'existing_claim_id': 'c21/c22/c23', 'change': 'Add an implied local placeholder for the salt seller, as the party who must "give him" or be handed over to מי שפרע. Attach the condition "all his deposit" (commensurate with the deposit, per Penei Moshe and Sirilio) to salt_ruling. Keep salt_client as the visitor at medium confidence.', 'why': 'F9 and F10', 'evidence': [E('IN', 'אוֹ יִתֵּן לוֹ כָּל עֵירָבוֹנוֹ אוֹ יִמְסוֹר לוֹ לְמִי שֶׁפָּרַע')]},
 {'correction_id': 'PC10', 'existing_claim_id': 'c24', 'change': 'Note that "תַּמָּן" in the answer refers to the salt ruling (law), while in the question it referred to the household saying. The speaker is the anonymous voice.', 'why': 'F11. Penei Moshe makes the referent explicit.', 'evidence': [E('PM_SHV', 'תמן בהאי עובדא למדת הדין הוא')]},
 {'correction_id': 'PC11', 'existing_claim_id': 'c5/c6', 'change': 'Add Schwab\'s alternative-attribution branch for the ring rule. Note the Bava Metzia 4:2 chain via R. Yaakov bar Idi as a reading in another passage.', 'why': 'F20', 'evidence': [E('BM42_VEN', 'רבי יעקב בר אידי רבי אבהו בשם רבי יוחנן טבעת אין בה משום עירבון')]},
]

ontology_lessons = [
 'A dictum quoted several times in one argument (here Rav\'s household saying, three times) needs one statement node with several citation mentions. Each re-quotation is not a new observation.',
 'Answers introduced by "what does X do with it?" (מה עבד לה X) are reconstructions the anonymous voice makes on X\'s behalf. The graph needs a voice type distinct from "X said".',
 'Deictic references (תמן/כא, "there/here") can switch referent between question and answer. Store the resolved referent for each occurrence, not for each word.',
 'Buyer, seller, owner and depositary in a baraita are hypothetical legal roles. They carry conditions, but are not people.',
 'Implied counterparties (the salt seller) need a placeholder with basis "implied by the ruling". Otherwise the ruling has no object.',
 'Parallel passages can reverse the direction of a dialogue (who asks whom) and add a head to a chain. Keep each passage\'s version as its own reading. Import nothing into the focal passage.',
 'Translating juxtaposed names as "or" (Schwab) is an interpretive choice. It creates an alternative-attribution branch, not evidence that two people disagreed.',
 'A final qualification that moves a view from law to piety changes the modality of an earlier disagreement. The claim "X disagrees with Y" should carry a discourse status such as "proposed, later narrowed".',
 'Guggenheimer\'s Hebrew text and English translation are one editorial work, as are his manuscript insertions. They are not independent witnesses. Schwab is a separate translation.',
]

scope_checked = {
 'focal_and_context_segments': 'Jerusalem Talmud Sheviit 10:4:1-6 in the Guggenheimer Hebrew, Venice and Mechon-Mamre editions; Guggenheimer English with notes; Schwab French',
 'commentaries_on_focal': ['Penei Moshe', 'Sirilio', 'Beur HaGra', 'Mareh HaPanim', "Sha'arei Torat Eretz Yisrael"],
 'parallels': ['JT Bava Metzia 4:2 (+ Penei Moshe, Ridbaz, Mareh HaPanim)', 'JT Bava Metzia 4:3', 'JT Maaser Sheni 4:4 (+ Penei Moshe)', 'JT Shevuot 4:7 (+ Penei Moshe)', 'JT Gittin 6:1 (+ Penei Moshe)', 'JT Kiddushin 2:1 (Guggenheimer notes only)', 'Bavli Bava Metzia 48b, 49a', 'Bavli Bava Batra 85a', 'Tosefta Bava Batra 5:2, Kiddushin 1:8 (+ Tosefta Kifshutah)'],
 'not_checked': 'Manuscripts directly; Mishnat Eretz Yisrael, Noam Yerushalmi, codes and responsa listed in the link index; JT Kiddushin 1:4 and Gittin 8:1 baraita parallels',
}

fetch_failures = [
 {'url': e['url'], 'status': e['status'], 'error': e.get('error'), 'fetched_at': e['fetched_at']} for e in LOG if e['status'] != 'ok'
] + [
 {'url': [e for e in LOG if e.get('saved_file') == 'sources/jt_sheviit_10_4_fr_schwab.json'][-1]['url'], 'status': 'empty_versions',
  'error': 'Sefaria v3 returned an empty versions list for the Schwab title; the same text was fetched through the v1 API (SHV_SCHWAB).',
  'saved_file': 'sources/jt_sheviit_10_4_fr_schwab.json'},
]

# mention inventory computed from the saved input text
s = {x['source_id']: x['text'] for x in inp['sources']}
inventory = []
for sid, name in [('s2', 'רִבִּי זְעִירָא'), ('s2', 'רִבִּי אַבָּהוּ'), ('s2', 'רִבִּי יוֹחָנָן'),
                  ('s3', 'רִבִּי יַעֲקֹב בַּר זַבְדִּי'), ('s3', 'זַבְדִּי'), ('s3', 'רִבִּי אַבָּהוּ'), ('s3', 'רִבִּי יוֹחָנָן'),
                  ('s3', 'רִבִּי יוֹסֵי'), ('s3', 'לִבְנֵי בֵיתִי'), ('s3', 'חַד בַּר נַשׁ'), ('s3', 'הוּא אָמַר')]:
    inventory.append({'source_id': sid, 'quote': name, 'occurrences': s[sid].count(name)})
rav = len(re.findall(r'(?<![א-ת֑-ׇ])(?:דְּ|דְ)?רַב(?![א-ת֑-ׇ])', s['s3']))
inventory.append({'source_id': 's3', 'quote': 'רַב (incl. דְּרַב / דְרַב)', 'occurrences': rav})
inventory.append({'source_id': 's3', 'quote': 'כַּד אֲנָא אָמַר לִבְנֵי בֵיתִי (Rav quotation)', 'occurrences': s['s3'].count('כַּד אֲנָא אָמַר לִבְנֵי בֵיתִי')})

dossier = {
 'job_id': 'random-yerushalmi-03',
 'focal_ref': 'Jerusalem Talmud Sheviit 10:4:6',
 'status': 'researched',
 'question': 'Collect repeated mentions and legal conditions missing from the first reading. Investigate disputed transmission chain, dialogue turns and final qualification ascribed to Rav.',
 'scope_checked': scope_checked,
 'quote_matching_note': 'Quotes from sources saved as HTML-bearing JSON (Guggenheimer English, Schwab) match the saved text after removing HTML tags. All other quotes match the saved bytes directly as substrings.',
 'sources': sources,
 'fetch_failures_and_empty_responses': fetch_failures,
 'mention_inventory': inventory,
 'findings': findings,
 'alternative_readings': alternative_readings,
 'unresolved': unresolved,
 'proposed_corrections': proposed_corrections,
 'ontology_lessons': ontology_lessons,
}

# verify quotes
bad = []
def check(ev, where):
    for e in ev:
        if e['exact_quote'] not in TEXT[e['source_id']]:
            bad.append((where, e['source_id'], e['exact_quote']))
for f in findings: check(f['evidence'], f['finding_id'])
for a in alternative_readings: check(a['evidence'], a['id'])
for p in proposed_corrections: check(p['evidence'], p['correction_id'])
if bad:
    for b in bad: print('MISSING', b)
    sys.exit(1)
json.dump(dossier, open(os.path.join(HERE, 'dossier.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', len(findings), 'findings;', len(sources), 'sources')
print(json.dumps(inventory, ensure_ascii=False))
