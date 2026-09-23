import json, hashlib, os, sys
# Build dossier.json from saved sources; every evidence quote is checked against the saved file's decoded strings.
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
PILOT = "../../../pilot"
log = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if "saved_file" in e}

def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()

SRC = []
def add(sid, path, url, edition, note=None, fetched=True):
    e = {"source_id": sid, "url_or_path": url, "edition": edition,
         "fetched_at": log[path]["fetched_at"] if fetched else None,
         "saved_file": path, "sha256": sha(path)}
    if note: e["note"] = note
    SRC.append(e)

V = "?version=hebrew%7Call&version=english%7Call"
T = "https://www.sefaria.org/api/v3/texts/"
add("S0", f"{PILOT}/inputs/random-bavli-05.json", "research/sage-network/pilot/inputs/random-bavli-05.json",
    "Pilot input: William Davidson Edition Aramaic, Sanhedrin 107b:18-108a:3 (read-only)", "Read, not modified; captured_at 2026-09-20T08:24:27Z", fetched=False)
add("S0b", f"{PILOT}/outputs/random-bavli-05.json", "research/sage-network/pilot/outputs/random-bavli-05.json",
    "Earlier pilot reading under review (read-only)", fetched=False)
add("S0c", "previous-review.json", "research/sage-network/followup-v1/cases/random-bavli-05/previous-review.json",
    "Earlier independent review (read-only)", fetched=False)
add("S1", "sources/sefaria_v3_sanhedrin_107b_all.json", T + "Sanhedrin%20107b" + V,
    "Sefaria v3, all versions: William Davidson Edition (Vocalized Aramaic, Aramaic, English); Wikisource Talmud Bavli",
    "Davidson Aramaic 107b:18-19 reproduce the pilot input text")
add("S2", "sources/sefaria_v3_sanhedrin_108a_all.json", T + "Sanhedrin%20108a" + V,
    "Sefaria v3, all versions: William Davidson Edition (Vocalized Aramaic, Aramaic, English); Wikisource Talmud Bavli")
add("S3", "sources/sefaria_v3_sanhedrin_108b_all.json", T + "Sanhedrin%20108b" + V,
    "Sefaria v3, all versions: William Davidson Edition; Wikisource Talmud Bavli")
add("S4", "sources/sefaria_v3_sanhedrin_109a_all.json", T + "Sanhedrin%20109a" + V,
    "Sefaria v3, all versions: William Davidson Edition; Wikisource Talmud Bavli", "Used to fix where the flood discussion ends")
add("S5", "sources/sefaria_v3_sanhedrin_109b_all.json", T + "Sanhedrin%20109b" + V,
    "Sefaria v3, all versions: William Davidson Edition; Wikisource Talmud Bavli", "Searched only")
add("S6", "sources/sefaria_links_sanhedrin_108a_1.json", "https://www.sefaria.org/api/links/Sanhedrin%20108a:1?with_text=0",
    "Sefaria links API (18 links)")
add("S7", "sources/sefaria_v3_mishnah_sanhedrin_10_3_all.json", T + "Mishnah%20Sanhedrin%2010:3" + V,
    "Sefaria v3, Mishnah Sanhedrin 10:3 all versions: Torat Emet 357; Mishnah ed. Romm Vilna 1913; Mishnah based on the Kaufmann manuscript ed. Dan Be'eri; English: William Davidson, Kulp (Mishnah Yomit), Sefaria Community Translation, Silverstein (Bartenura)")
add("S8", "sources/sefaria_v3_tosefta_sanhedrin_13_all.json", T + "Tosefta%20Sanhedrin%2013" + V,
    "Sefaria v3, Tosefta Sanhedrin 13: Machon Mamre Hebrew (the English version in this file is a machine translation and is not used as evidence)")
add("S9", "sources/rashi_sanhedrin_107b.json", T + "Rashi%20on%20Sanhedrin%20107b" + V, "Rashi, Vilna Edition")
add("S10", "sources/rashi_sanhedrin_108a.json", T + "Rashi%20on%20Sanhedrin%20108a" + V, "Rashi, Vilna Edition")
add("S11", "sources/rashi_sanhedrin_108b.json", T + "Rashi%20on%20Sanhedrin%20108b" + V, "Rashi, Vilna Edition")
add("S12", "sources/steinsaltz_sanhedrin_107b.json", T + "Steinsaltz%20on%20Sanhedrin%20107b" + V, "Steinsaltz, William Davidson Edition - Hebrew")
add("S13", "sources/steinsaltz_sanhedrin_108a.json", T + "Steinsaltz%20on%20Sanhedrin%20108a" + V, "Steinsaltz, William Davidson Edition - Hebrew")
add("S14", "sources/rashash_sanhedrin_108a.json", T + "Rashash%20on%20Sanhedrin%20108a" + V, "Rashash, Vilna Edition")
add("S15", "sources/bartenura_mishnah_sanhedrin_10_3.json", T + "Bartenura%20on%20Mishnah%20Sanhedrin%2010:3" + V, "Bartenura (Torat-Emet; On Your Way; Alpert English)")
add("S16", "sources/rambam_commentary_mishnah_sanhedrin_10_3.json", T + "Rambam%20on%20Mishnah%20Sanhedrin%2010:3" + V, "Rambam Commentary on the Mishnah, Vilna edition")
add("S17", "sources/tosafot_yom_tov_sanhedrin_10_3.json", T + "Tosafot%20Yom%20Tov%20on%20Mishnah%20Sanhedrin%2010:3" + V, "Tosafot Yom Tov, Mishnah ed. Romm Vilna 1913")
add("S18", "sources/yerushalmi_sanhedrin_10_3.json", T + "Jerusalem%20Talmud%20Sanhedrin%2010:3" + V,
    "Sefaria v3, Jerusalem Talmud Sanhedrin 10:3: Guggenheimer Hebrew and English; Mechon-Mamre; Venice Edition")
add("S19", "sources/yerushalmi_sanhedrin_10_4.json", T + "Jerusalem%20Talmud%20Sanhedrin%2010:4" + V, "Sefaria v3 (fetched; not analysed)")
add("S20", "sources/yad_ramah_sanhedrin_108a.json", T + "Yad%20Ramah%20on%20Sanhedrin%20108a" + V, "Yad Ramah, Warsaw 1895 ed.")
add("S21", "sources/yad_ramah_sanhedrin_108b.json", T + "Yad%20Ramah%20on%20Sanhedrin%20108b" + V, "Yad Ramah, Warsaw 1895 ed.")
add("S22", "sources/bereshit_rabbah_41_7.json", T + "Bereshit%20Rabbah%2041:7" + V, "Bereshit Rabbah 41:7 (linked from 108a:1 via Maharzu; fetched, no relevant wording found by search)")
add("S23", "sources/bereshit_rabbah_26_6.json", T + "Bereshit%20Rabbah%2026:6" + V, "Bereshit Rabbah 26:6 (Genesis 6:3 interpretations; fetched, used only for scope)")
add("S24", "sources/avot_derabbi_natan_36.json", T + "Avot%20DeRabbi%20Natan%2036" + V,
    "Avot deRabbi Natan 36: Vilna 1883 ed.; Schechter Recension A 1887; English: Cohen (Soncino 1965), Kasher (2019)")
PATH = {s["source_id"]: s["saved_file"] for s in SRC}

def strings(o):
    if isinstance(o, str): yield o
    elif isinstance(o, list):
        for x in o: yield from strings(x)
    elif isinstance(o, dict):
        for x in o.values(): yield from strings(x)

CACHE = {}
import unicodedata
def nfc(s): return unicodedata.normalize("NFC", s)

def check(sid, q):
    # Return the exact source substring for q (identical bytes, or identical after NFC mark-order normalization); None if absent
    if sid not in CACHE:
        p = PATH[sid]
        CACHE[sid] = list(strings(json.load(open(p))))
    for s in CACHE[sid]:
        if q in s: return q
    nq = nfc(q)
    for s in CACHE[sid]:
        if nq not in nfc(s): continue
        for i in range(len(s)):
            for j in range(i + len(q) - 3, min(len(s), i + len(q) + 4) + 1):
                if nfc(s[i:j]) == nq: return s[i:j]
    return None

def ev(sid, quote, version=None, translation=None):
    e = {"source_id": sid, "exact_quote": quote}
    if version: e["version"] = version
    if translation: e["translation_by_this_dossier"] = translation
    return e

DA = "William Davidson Edition - Aramaic"
DE = "William Davidson Edition - English (translation and bracketed glosses of the Koren/Steinsaltz editorial team)"

findings = [
 {"finding_id": "F1", "kind": "textual",
  "claim": "Sanhedrin 108a:1 continues Rabbi Nehemya's statement from 107b:19. He reads Psalms 1:5 clause by clause: 'the wicked' (רשעים) is the Flood generation and 'sinners' (חטאים) are the people of Sodom. The two group names are repeated in 108a:1 itself.",
  "evidence": [ev("S2", "על כן לא יקומו רשעים במשפט זה דור המבול וחטאים בעדת צדיקים אלו אנשי סדום", DA,
                  "Translation by this dossier: 'Therefore the wicked shall not stand in judgment': this is the Flood generation; 'nor sinners in the congregation of the righteous': these are the people of Sodom."),
               ev("S1", "רבי נחמיה אומר אלו ואלו אין עומדין בדין שנאמר על כן לא יקמו", DA)],
  "reasoning": "The Davidson segment break falls in the middle of the verse. 108a:1 is the rest of the same Mishnah sentence. So the mapping of verse terms to groups belongs to Rabbi Nehemya's exposition, not to a new speaker.",
  "confidence": "high",
  "graph_effect": "Add mention records for דור המבול and אנשי סדום in 108a:1, linked to the existing flood and sodom entities (this answers the earlier review's 'miss'). Model רשעים and חטאים as verse terms that Rabbi Nehemya maps onto those groups (an interprets-as edge attributed to him). They are not separate groups."},
 {"finding_id": "F2", "kind": "textual",
  "claim": "The reply comes from an unnamed plural voice ('they said') and is addressed to one person ('to him'). The Hebrew/Aramaic text names no respondent. Several translations and commentaries identify them as 'the Sages'. That is their gloss.",
  "evidence": [ev("S2", "אמרו לו אינם עומדין בעדת צדיקים אבל עומדין בעדת רשעים", DA,
                  "Translation by this dossier: They said to him: they do not stand in the congregation of the righteous, but they do stand in the congregation of the wicked."),
               ev("S2", "The Sages <b>said to</b> Rabbi Neḥemya", DE),
               ev("S13", "<b>אמרו לו</b> חכמים", "Steinsaltz Hebrew"),
               ev("S7", "They [the Sages] said to him", "Mishnah Yomit by Dr. Joshua Kulp"),
               ev("S7", "[The Sages] said to him", "Sefaria Community Translation"),
               ev("S14", "לכאורה שפיר קאמרי רבנן", "Rashash")],
  "reasoning": "The singular 'לו' can only point back to Rabbi Nehemya, the last named speaker. 'The Sages' appears only in brackets or in commentary. The Davidson English and Steinsaltz Hebrew come from the same editorial work, so they count as one gloss, not two witnesses.",
  "confidence": "high",
  "graph_effect": "Keep a single unnamed collective 'respondents' placeholder, speaking to Rabbi Nehemya (addressee role). Put the label 'the Sages' in an interpretation field, citing the glossing sources. Do not merge the respondents with the anonymous voice of the Mishnah, or with any named sage."},
 {"finding_id": "F3", "kind": "interpretation",
  "claim": "The reply most plausibly concerns only the people of Sodom, not the Flood generation. The commentaries I checked (Rashi, Tosafot Yom Tov) say Rabbi Nehemya disagrees with the anonymous Mishnah on one point only. The reply picks up the second clause of the verse ('in the congregation of the righteous'), which is the clause he applied to Sodom.",
  "evidence": [ev("S9", "אלו ואלו - אנשי דור המבול ואנשי סדום ובחדא פליג ר' נחמיה", "Rashi, Vilna",
                  "Translation by this dossier: 'These and those': the people of the Flood generation and the people of Sodom; and on one of them Rabbi Nehemya disagrees."),
               ev("S17", "ובחדא פליג ר' נחמיה. רש\"י. כלומר דבדור המבול לית פלוגתא", "Tosafot Yom Tov",
                  "Translation by this dossier: '...and on one Rabbi Nehemya disagrees' (Rashi). That is, about the Flood generation there is no dispute."),
               ev("S1", "דור המבול אין להם חלק לעולם הבא ואין עומדין בדין", DA),
               ev("S1", "אנשי סדום אין להם חלק לעולם הבא שנאמר ואנשי סדם רעים וחטאים לה׳ מאד רעים בעולם הזה וחטאים לעולם הבא אבל עומדין בדין", DA),
               ev("S10", "אבל עומדים הם כו' - שחיין ונדונים", "Rashi, Vilna",
                  "Translation by this dossier: 'But they do stand...': that they live and are judged.")],
  "reasoning": "Textual basis: the anonymous Mishnah already says the Flood generation does not stand in judgment. Rabbi Nehemya's 'these and those' therefore adds something new only for Sodom. The reply's wording echoes the Sodom clause of the verse. Commentary basis: Rashi and Tosafot Yom Tov say this outright. The reply's own pronoun 'אינם' does not name its subject, so the Sodom-only scope is an inference supported by commentary, not something the words state.",
  "confidence": "medium",
  "graph_effect": "Earlier claims c6 and c7 point at the whole of Rabbi Nehemya's view ('nehemya_fate'). Narrow them to the Sodom part. Split nehemya_fate into (a) the Flood generation does not stand in judgment, which agrees with the anonymous Mishnah and is not contested, and (b) Sodom does not stand in judgment, which the reply contests. Mark the scope basis as 'interpretation (Rashi, Tosafot Yom Tov)'."},
 {"finding_id": "F4", "kind": "interpretation",
  "claim": "On Sodom, what the reply says matches the anonymous Mishnah's own ruling ('but they stand in judgment'). Tosafot Yom Tov explains that the Mishnah states that ruling for Sodom because of Rabbi Nehemya's dissent. He adds that it also holds implicitly for the dispersion generation.",
  "evidence": [ev("S17", "אבל עומדין בדין</b>. משום דלית לי' שום מעוטא כדמשכחת בדור המבול מלא ידון ודור הפלגה נמי עומדין בדין הן. ולא הוצרך למתני בהו. ונקט לה הכא משום רבי נחמיה", "Tosafot Yom Tov",
                  "Translation by this dossier: 'But they stand in judgment': because there is no exclusion, as there is for the Flood generation from 'shall not abide'; the dispersion generation also stands in judgment, but it did not need to be taught for them; it is stated here because of Rabbi Nehemya."),
               ev("S13", "אבל עומדין בעדת רשעים</b> ונידונים כראוי להם", "Steinsaltz Hebrew")],
  "reasoning": "This concerns views only. Both the anonymous Mishnah and the respondents hold that Sodom is judged. That does not show they are the same voice. The dispersion point is Tosafot Yom Tov's inference, not something the text states.",
  "confidence": "medium",
  "graph_effect": "Add a view-level edge: the respondents' reply agrees with the anonymous Mishnah's Sodom clause. Do not add an identity edge. Record the dispersion-generation claim as Tosafot Yom Tov's interpretation only."},
 {"finding_id": "F5", "kind": "textual",
  "claim": "Source variant. The Mishnah text edited from the Kaufmann manuscript, and the Mishnah as printed in the Yerushalmi (Venice edition and Guggenheimer), list only the Flood generation and Sodom before Rabbi Nehemya. They have no dispersion clause. The printed Bavli, the Vilna Mishnah, Torat Emet and the Mechon-Mamre Yerushalmi include it. In the Kaufmann text Rabbi Nehemya says only 'do not stand', without 'in judgment', and the reply's word order differs.",
  "evidence": [ev("S7", "אַנְשֵׁי סְדוֹם, אֵין לָהֶם חֵלֶק לָעוֹלָם הַבָּא, \nאֲבָל עוֹמְדִין בַּדִּין.", "Mishnah based on the Kaufmann manuscript, ed. Dan Be'eri"),
               ev("S7", "אֵלּוּ וָאֵלּוּ אֵינָן עוֹמְדִין, שֶׁנֶּאֱמַר", "Mishnah based on the Kaufmann manuscript, ed. Dan Be'eri"),
               ev("S7", "בַּעֲדַת צַדִּיקִים אֵינָן עוֹמְדִין, \nעוֹמְדִין הֵן בַּעֲדַת רְשָׁעִים.", "Mishnah based on the Kaufmann manuscript, ed. Dan Be'eri"),
               ev("S18", "דור המבול אין להן חלק לעולם הבא ואין עומדין בדין שנאמר לא ידון רוחי באדם לעולם אנשי סדום אין להן חלק לעולם הבא אבל עומדין בדין", "Yerushalmi, Venice Edition"),
               ev("S18", "אמרו לו בעדת צדיקים אינן עומדין אבל עומדין הן בעדת רשעים", "Yerushalmi, Mechon-Mamre"),
               ev("S1", "דור הפלגה אין להם חלק לעולם הבא שנאמר ויפץ ה׳ אתם משם על פני כל הארץ", DA)],
  "reasoning": "These are witness differences between editions, not later emendations. In the shorter text, 'these and those' follows exactly two groups, so it cannot refer to anything else. The printed Bavli has three groups, which is why Rashi needs to specify the Flood generation and Sodom. Rashi's lemma 'אבל עומדים הם' (S10) also has the 'הם/הן' form found in the Kaufmann and Yerushalmi texts. I did not check any Bavli manuscripts.",
  "confidence": "high",
  "graph_effect": "Keep claim c2 (dispersion generation). Mark it as coming from the printed Bavli/Vilna text family, with a 'text_variant: absent in Kaufmann-based Mishnah and Yerushalmi Venice' note. Store this as a source variant, which is a different evidence type from an emendation."},
 {"finding_id": "F6", "kind": "uncertainty",
  "claim": "The translations disagree on who 'both' refers to. Silverstein's Bartenura translation glosses it as the Tower of Babel generation and Sodom. His own next line, and the Davidson English, Kulp and Rashi, identify the Flood generation and Sodom.",
  "evidence": [ev("S7", "Nechemiah says: Both (the generation of the Tower of Babel and the generation of Sodom) do not arise for judgment", "The Mishna with Obadiah Bartenura by Rabbi Shraga Silverstein"),
               ev("S7", "\"Therefore, the wicked shall not arise in judgment\" — the generation of the flood", "The Mishna with Obadiah Bartenura by Rabbi Shraga Silverstein"),
               ev("S7", "Neither [the generation of the flood nor the men of Sodom] will stand at judgment", "Mishnah Yomit by Dr. Joshua Kulp")],
  "reasoning": "The Hebrew exposition maps the verse onto the Flood generation, not onto the dispersion. The Silverstein parenthesis contradicts the text it translates, so it should not be used as evidence for a dispersion-generation reading.",
  "confidence": "high",
  "graph_effect": "Do not attach Rabbi Nehemya's view to the dispersion generation. Record the Silverstein gloss as a translator's reading that conflicts with the source."},
 {"finding_id": "F7", "kind": "textual",
  "claim": "Parallel attribution in Avot deRabbi Natan A 36. The same reply wording is Rabbi Yehoshua's view, and it concerns Sodom alone. Rabbi Eliezer holds that Sodom neither lives nor is judged. Rabbi Nehemya goes further: they do not come even to the congregation of the wicked. He cites Psalms 104:35, not Psalms 1:5. The translators disagree over the abbreviation ר״א.",
  "evidence": [ev("S24", "דברי רבי אליעזר. רבי יהושע אומר באין הן לדין שנאמר על כן לא יקומו רשעים במשפט וחטאים בעדת צדיקים (תהלים א' ה') בעדת צדיקים אינן עומדין אבל עומדין הן בעדת רשעים. רבי נחמיה אומר אפילו בעדת רשעים אינן באים שנאמר יתמו חטאים מן הארץ ורשעים עוד אינם", "Schechter edition, Recension A, 1887",
                  "Translation by this dossier: ...the words of Rabbi Eliezer. Rabbi Yehoshua says: they do come to judgment, as it says 'Therefore the wicked shall not stand...': in the congregation of the righteous they do not stand, but they stand in the congregation of the wicked. Rabbi Nehemya says: even in the congregation of the wicked they do not come, as it says 'Let sinners cease from the earth and the wicked be no more'."),
               ev("S24", "מאד שהיו מתכוונין לעבירות <i data-commentator=\"Gra's Nuschah\" data-order=\"2\"></i>דברי ר״א רבי יהושע אומר", "Vilna 1883 ed."),
               ev("S24", "This is the view of R. Eliezer; but R. Joshua said: They will be brought to judgment", "Cohen, Soncino 1965"),
               ev("S24", "These are the words of Rabbi Akiva.<br>But Rabbi Yehoshua said: They will be given a trial!", "Kasher 2019")],
  "reasoning": "This is a parallel in a different work, not a variant reading of the Bavli Mishnah. It shows that the formula 'not in the congregation of the righteous, but in the congregation of the wicked' circulated as a named view about Sodom. That supports the Sodom scope of F3. It does not show who spoke the Mishnah's 'they said'. Schechter spells out 'רבי אליעזר'. Vilna has the ambiguous 'ר״א'. Kasher renders it 'Rabbi Akiva' and Cohen renders it 'R. Eliezer'.",
  "confidence": "high",
  "graph_effect": "Record 'alternative attribution in a parallel work: Rabbi Yehoshua (Avot deRabbi Natan A 36)' on the reply's content. Do not identify the Bavli respondents as Rabbi Yehoshua. Keep Rabbi Nehemya's view in Avot deRabbi Natan as a separate claim with its own verse. Whether this Rabbi Nehemya is the Mishnah's Rabbi Nehemya is not settled by the shared name. For the ר״א abbreviation, keep two branches (Rabbi Eliezer or Rabbi Akiva) and note which source reads which."},
 {"finding_id": "F8", "kind": "textual",
  "claim": "The Gemara's flood discussion (108a:5 to 108b:21, then a digression, with the dispersion generation starting at 109a:4) does not return to Rabbi Nehemya's dispute or to the reply. It opens a different dispute: Rabbi Akiva against Rabbi Yehuda ben Beteira, followed by Rabbi Menachem son of Rabbi Yosef. Yad Ramah reads Rabbi Menachem as saying the Flood generation do live and are judged.",
  "evidence": [ev("S2", "גמ׳ תנו רבנן דור המבול אין להם חלק לעולם הבא שנאמר ׳וימח את כל היקום אשר על פני האדמה׳ ׳וימח את כל היקום׳ בעולם הזה ׳וימחו מן הארץ׳ לעולם הבא דברי רבי עקיבא רבי יהודה בן בתירא אומר לא חיין ולא נדונין", DA),
               ev("S2", "רבי מנחם ברבי יוסף אומר אפילו בשעה שהקדוש ברוך הוא מחזיר נשמות לפגרים מתים נשמתן קשה להם בגיהנם", DA),
               ev("S20", "ר' מנחם בר' יוסי אומר חיין הן ונידונין אלא שמדתן קשה משאר רשעים", "Yad Ramah",
                  "Translation by this dossier: Rabbi Menachem son of Rabbi Yosei says: they live and are judged, but their measure is harsher than other wicked people's."),
               ev("S4", "דור הפלגה אין להם חלק לעולם הבא וכו׳ מאי עבוד", DA)],
  "reasoning": "I searched the Davidson Aramaic for 107b through 109b for נחמיה, עדת צדיקים, עומדין and אנשי סדום. The only hits were in the Mishnah, plus the Sodom baraita at 109a:8. This result applies only to those pages and those search terms. The Gemara's dispute about the Flood generation is a separate set of attributed views. It should not be read as continuing the reply.",
  "confidence": "medium",
  "graph_effect": "Do not link the respondents to Rabbi Yehuda ben Beteira or to Rabbi Menachem. Add separate view claims: Rabbi Akiva (no share, based on Genesis 7:23), Rabbi Yehuda ben Beteira (the Flood generation neither live nor are judged), and Rabbi Menachem (the Davidson English reading and the Yad Ramah reading as two interpretations)."},
 {"finding_id": "F9", "kind": "textual",
  "claim": "The Tosefta (Machon Mamre text as saved) has the list of groups with no share in the world to come, Rabbi Yehuda ben Beteira, and Rabbi Menachem son of Rabbi Yosi. In this text I did not find Rabbi Nehemya's Psalms 1:5 dispute or the 'they said to him' reply. It says Sodom 'do not live in the world to come'.",
  "evidence": [ev("S8", "אנשי סדום אין להם חלק לעולם הבא ואינן חיין לעוה\"ב", "Tosefta Sanhedrin - Machon Mamre"),
               ev("S8", "ר' מנחם ברבי יוסי אומר לא ידון אמר המקום איני דנן בשעה שאני משלם שכר לצדיקים", "Tosefta Sanhedrin - Machon Mamre")],
  "reasoning": "This result covers one Tosefta edition only. Neither the Zuckermandel nor the Lieberman edition was checked. The English in this file is a machine translation and is not used.",
  "confidence": "medium",
  "graph_effect": "None for the reply. The patronymic for Rabbi Menachem's father varies: Yosef in the Davidson Bavli, Yosi in the Tosefta and Yad Ramah (see F12)."},
 {"finding_id": "F10", "kind": "textual",
  "claim": "The Yerushalmi halakha on this Mishnah cites 'Rabbi Nehemya' on Genesis 6:3 (the Flood generation), then Rabbi Yehuda, Rabbi Shimon and 'others'. That is a separate teaching, not the reply.",
  "evidence": [ev("S18", "תני רבי נחמיה אומר ממשמע שנאמר לא ידון רוחי באדם לעולם רבי יהודה אומר", "Yerushalmi, Venice Edition"),
               ev("S18", "It was stated: Rebbi Neḥemiah says, one understands it from what was said", "Guggenheimer English")],
  "reasoning": "It shares the name and appears on the same Mishnah. That makes it plausible that the same named authority is meant, but it is not established.",
  "confidence": "medium",
  "graph_effect": "Add a separate attributed-teaching claim under the 'Rabbi Nehemya' name label, with identity to the Mishnah's Rabbi Nehemya left provisional."},
 {"finding_id": "F11", "kind": "textual",
  "claim": "Groups in the Mishnah unit (107b:18 to 108a:4 in the Davidson layout): Flood generation, dispersion generation (text-family dependent, see F5), people of Sodom, the spies, the wilderness generation, and the assembly of Korah. 108a:4 lies just beyond the input window. The verse also supplies categories (the wicked, sinners, the congregation of the righteous, the congregation of the wicked). These are categories, not historical groups. Rashash reports that the Vilna Gaon placed Korah before the wilderness generation. That is a reported emendation.",
  "evidence": [ev("S2", "עדת קרח אינה עתידה לעלות שנאמר ותכס עליהם הארץ בעולם הזה ויאבדו מתוך הקהל לעולם הבא דברי רבי עקיבא רבי אליעזר אומר", DA),
               ev("S14", "הגר\"א ז\"ל גורס עדת קרח קודם דור המדבר", "Rashash"),
               ev("S2", "מרגלים אין להם חלק לעולם הבא", DA),
               ev("S2", "דור המדבר אין להם חלק לעולם הבא ואין עומדין בדין", DA)],
  "reasoning": "The inventory is built from the text itself. The order change is a later scholar's proposed reading, not a manuscript witness in what I checked.",
  "confidence": "high",
  "graph_effect": "If the window is widened, add the assembly of Korah as a group. Rabbi Akiva and Rabbi Eliezer disagree about it, and that dispute is structured like the wilderness-generation one. Store 'righteous' and 'wicked' as verse or future-judgment categories, not historical groups. Store the Vilna Gaon's order change as an emendation."},
 {"finding_id": "F12", "kind": "textual",
  "claim": "Later interpreters in the flood discussion (108a:5 to 108b:21) include several patronymic names and two chains of transmission. Named: Rabbi Akiva; Rabbi Yehuda ben Beteira; Rabbi Menachem son of Rabbi Yosef (Yosi in Yad Ramah and the Tosefta); Rabbi Yosei (Yad Ramah: 'Rabbi Yosi ben Dormaskit'); Rabbi Yochanan; Rabbi Abba bar Kahana; Rabbi Elazar; the school of Rabbi Yishmael; Rav Dimi and an unnamed 'some say'; Reish Lakish; Rabbi Chanina and Rabbi Oshaya (each supplies a parable for one side); Rabbi Yehoshua ben Korcha; Rabbi Yosei of Caesarea; Rava; Rav Chisda; Rav; Rabbi Shmuel bar Nachmani quoting Rabbi Yonatan; Rabbi Abbahu; Rav Adda quoting the school of Rabbi Sheila; Rabbi Yirmeya; Rav Chana bar Bizna; Rav Chana bar Leva'ei.",
  "evidence": [ev("S2", "אמר רבי אבא בר כהנא וכולם חזרו חוץ מתושלמי", DA),
               ev("S2", "אמר רבי יוחנן בדורותיו ולא בדורות אחרים וריש לקיש אמר בדורותיו כל שכן בדורות אחרים", DA),
               ev("S2", "אמר רבי חנינא משל דרבי יוחנן", DA),
               ev("S2", "אמר רבי אושעיא משל דריש לקיש", DA),
               ev("S2", "תנא משום רבי יהושע בן קרחה משל לאדם שעשה חופה לבנו", DA),
               ev("S3", "אמר רבי שמואל בר נחמני אמר רבי יונתן מאותם שלא נעבדה בהם עבירה", DA),
               ev("S3", "אמר רב אדא אמרי דבי רבי שילא זו מבליגה", DA),
               ev("S3", "אמר רב חנא בר ביזנא אמר ליה אליעזר לשם רבא", DA),
               ev("S3", "אמר רב חנה בר לואי אמר שם רבא לאליעזר", DA),
               ev("S3", "למשפחתיהם יצאו מן התבה אמר רבי יוחנן למשפחותם ולא הם", DA),
               ev("S21", "א\"ר ירמיה בן אלעזר למשפחותם ולא הם", "Yad Ramah"),
               ev("S20", "ר' יוסי בן דור מסקית אמר לא נתגאו אלא בשביל גלגל העין", "Yad Ramah"),
               ev("S2", "רבי מנחם ברבי יוסף אומר", DA),
               ev("S2", "ר' מנחם בר יוסף אומר", "Wikisource Talmud Bavli")],
  "reasoning": "These are names attached to sayings. Parent placeholders are required for Kahana, Korcha, Beteira, Nachmani, Bizna, Leva'ei, and Menachem's father (Yosef or Yosi). For 'ben Beteira', 'ben Korcha' and 'ben Dormaskit' it is unclear whether the name is literal kinship or a name form, so mark those as unclear. The Yad Ramah variants ('למשפחותם ולא הם' given to Rabbi Yirmeya ben Elazar rather than Rabbi Yochanan, and the fuller name for Rabbi Yosei) are attribution alternatives, not proof of who spoke. Chanina and Oshaya supplying parables for Yochanan's and Reish Lakish's views are 'illustrates view of' edges, not teacher-student edges.",
  "confidence": "high",
  "graph_effect": "Add transmission edges: Shmuel bar Nachmani quotes Yonatan; Adda quotes the school of Sheila; Chana bar Bizna and Chana bar Leva'ei report the Shem and Eliezer dialogues. Add dispute edges: Yochanan vs Reish Lakish; Akiva vs Yehuda ben Beteira; Rav Chisda vs Rabbi Abbahu; Rav Dimi vs 'some say'. Add 'illustrates' edges: Chanina for Yochanan, Oshaya for Reish Lakish. Keep the patronymic parent placeholders. Keep attribution branches where Yad Ramah differs."},
 {"finding_id": "F13", "kind": "textual",
  "claim": "Reported scenes in the flood discussion are narrated inside a rabbi's interpretation. The characters who speak in them are God, the Flood generation as a collective, Noah, a raven, a dove, personified robbery, Shem and Eliezer. Noah's rebuke scene belongs to Rabbi Yosei of Caesarea (108a:22 to 108b:1) and to Rava (108b:2-3). Methuselah's seven days of mourning belong to Rav. The raven's argument with Noah belongs to Reish Lakish. The dove's plea belongs to Rabbi Elazar. The baraita says the dog, the raven and Ham were punished. The Shem and Eliezer dialogues belong to Rav Chana bar Bizna and Rav Chana bar Leva'ei.",
  "evidence": [ev("S2", "והיא גרמה שאמרו לאל ׳סור ממנו ודעת דרכיך לא חפצנו", DA),
               ev("S2", "אמר הקדוש ברוך הוא ׳בטובה שהשפעתי להן בה מכעיסין אותי ובה אני דן אותם׳", DA),
               ev("S2", "דרש רבי יוסי דמן קסרי מאי דכתיב קל הוא על פני מים תקלל חלקתם בארץ מלמד שהיה נח הצדיק מוכיח בהם", DA),
               ev("S2", "אמרו לו ומי מעכב אמר להם פרידה אחת יש לי להוציא מכם", DA),
               ev("S3", "דרש רבא מאי דכתיב לפיד בוז לעשתות שאנן נכון למועדי רגל מלמד שהיה נח הצדיק מוכיח אותם", DA),
               ev("S3", "אמר רב אלו ימי אבילות של מתושלח", DA),
               ev("S3", "וישלח את הערב אמר ריש לקיש תשובה ניצחת השיבו עורב לנח", DA),
               ev("S3", "תנו רבנן שלשה שמשו בתיבה וכולם לקו כלב ועורב וחם", DA),
               ev("S3", "אמר רבי אלעזר אמרה יונה לפני הקדוש ברוך הוא", DA),
               ev("S2", "אמר רבי אלעזר מלמד שזקף עצמו כמקל ועמד לפני הקדוש ברוך הוא", DA)],
  "reasoning": "These events are reported through a named interpreter's reading of a verse. They are not the Talmud's own testimony about history. Robbery, the raven and the dove are personifications or animals. The father and son in Rabbi Yehoshua ben Korcha's parable (108a:20) are parable figures. None of these are persons.",
  "confidence": "high",
  "graph_effect": "Model each scene as a 'reported_scene' attributed to its interpreter, with the characters' speech nested inside it. Do not add first-hand interactions between biblical figures as independent observations. Personifications, animals and parable figures get non-person entity kinds."},
 {"finding_id": "F14", "kind": "uncertainty",
  "claim": "The speaker in the rebuke scene at 108a:22-23 varies by witness, and so does the meaning of 'one dove/offspring' (פרידה). The Davidson text says Noah rebuked them. Rashi and the Davidson English take the 'פרידה' to be Methuselah. Yad Ramah reads that Methuselah was the one rebuking, and takes the 'פרידה' to be Noah, who was to come from their seed. He rejects both other readings and mentions manuscripts that have Noah.",
  "evidence": [ev("S10", "[פרידה] אחת יש לי להוציא מכם - מתושלח הצדיק ימות קודם ולא יהיה נדון עמכם", "Rashi, Vilna"),
               ev("S2", "Noah <b>said to them: I have one pigeon,</b> Methuselah, who will die at his appointed time", DE),
               ev("S20", "שהיה מתושלח הצדיק מוכיח אותם אמרו לו ומי מעכב את המבול עכשיו שלא יבוא אמר להן פרידה טובה יש לו להוציא מכם נח הצדיק עתיד להוציא מזרעכם", "Yad Ramah",
                  "Translation by this dossier: ...that Methuselah the righteous would rebuke them. They said to him: who is holding back the flood now? He said to them: He has one good offspring to bring out from you; Noah the righteous is destined to come from your seed."),
               ev("S20", "ואי נמי תימא דבנח קאי כדאיכא במקצת נוסחי דלא דייקי", "Yad Ramah")],
  "reasoning": "The Davidson English identifies Methuselah in an unbolded gloss, following Rashi. That makes it the same interpretation as Rashi, not independent support. Yad Ramah's reading is both a text variant (who rebukes) and an interpretation (who the 'פרידה' is).",
  "confidence": "high",
  "graph_effect": "Record the rebuker as branched: Noah (Davidson/Vilna text) or Methuselah (Yad Ramah's text). Record the 'פרידה' as branched: Methuselah (Rashi, Davidson English) or Noah (Yad Ramah). Add no Methuselah–Noah kinship edge. This passage does not state one."},
 {"finding_id": "F15", "kind": "textual",
  "claim": "Kinship inside the story. In the dialogue reported by Rav Chana bar Bizna, Shem calls Noah 'אבא' ('my father'). The Talmud text does not call Eliezer Abraham's servant. Rashi (a bracketed gloss), the Davidson English and Yad Ramah do. The Hebrew here also never calls Ham Noah's son; the Davidson English and a parenthetical in Rashi do.",
  "evidence": [ev("S3", "האי זקיתא לא הוה ידע אבא מה אכלה", DA,
                  "Translation by this dossier: That chameleon, Father did not know what it eats."),
               ev("S3", "אורשינה אשכחיניה אבא דגני בספנא דתיבותא", DA),
               ev("S11", "לשם רבא - גדול בנו של נח", "Rashi, Vilna"),
               ev("S21", "אמר ליה אליעזר לשם רבא בריה דנח", "Yad Ramah"),
               ev("S11", "א\"ל אליעזר - [עבד אברהם]", "Rashi, Vilna"),
               ev("S3", "Rav Ḥana bar Bizna says: Eliezer,</b> servant of Abraham, <b>said to Shem the Great,</b> son of Noah", DE),
               ev("S3", "אמר ליה אייתי הקדוש ברוך הוא לאברהם ואותביה מימיניה והוה שדינן עפרא", DA),
               ev("S11", "(בני נח - שם וחם ויפת)", "Rashi, Vilna")],
  "reasoning": "In context, 'אבא' in Shem's mouth is kinship stated in the text. It is reported speech inside a later rabbi's narration. The Eliezer identification rests on context (he speaks of fighting alongside Abraham) and on commentary glosses. Ham's filiation is a gloss here, even though Genesis states it.",
  "confidence": "medium",
  "graph_effect": "Add 'Shem child of Noah' as literal kinship with the basis 'reported speech in a rabbinic narrative'. Record 'Eliezer, servant of Abraham' as an identification by commentary and translation plus context, not a textual label. Record 'Ham son of Noah' as a gloss for this passage. None of these are historical claims."}
]

for f in findings:
    for e in f["evidence"]:
        exact = check(e["source_id"], e["exact_quote"])
        if exact is None:
            print("QUOTE NOT FOUND:", f["finding_id"], e["source_id"], e["exact_quote"][:80]); sys.exit(1)
        e["exact_quote"] = exact

dossier = {
 "job_id": "random-bavli-05",
 "focal_ref": "Sanhedrin 108a:1",
 "status": "researched",
 "question": "Collect group references and investigate the scope of the reply in the wider flood-generation discussion. Separate biblical speakers, later interpreters, groups, and reported scenes.",
 "scope_note": "Checked: Sefaria texts of Sanhedrin 107b-109b (Davidson and Wikisource), Mishnah Sanhedrin 10:3 (Torat Emet, Vilna, Kaufmann-based ed. Be'eri, four English translations), Tosefta Sanhedrin 13 (Machon Mamre only), Yerushalmi Sanhedrin 10:3 (Venice, Mechon-Mamre, Guggenheimer), Avot deRabbi Natan 36 (Vilna, Schechter, Cohen, Kasher), Rashi on 107b-108b, Steinsaltz, Rashash, Yad Ramah on 108a-108b, Bartenura, the Rambam's Mishnah commentary and Tosafot Yom Tov. No Bavli manuscripts. The search for later mentions of the reply covered only the Davidson Aramaic of 107b-109b. Translations marked 'translation_by_this_dossier' are this dossier's brief renderings.",
 "sources": SRC,
 "inventory": {
  "groups_in_mishnah_unit": [
   {"label": "Flood generation", "quote": "דור המבול", "refs": ["107b:18", "108a:1"], "source_id": "S1/S2"},
   {"label": "Dispersion generation", "quote": "דור הפלגה", "refs": ["107b:18"], "note": "absent in Kaufmann-based Mishnah and Yerushalmi Venice (F5)"},
   {"label": "People of Sodom", "quote": "אנשי סדום", "refs": ["107b:18", "108a:1"]},
   {"label": "The spies", "quote": "מרגלים", "refs": ["108a:2"]},
   {"label": "Wilderness generation", "quote": "דור המדבר", "refs": ["108a:3"]},
   {"label": "Assembly of Korah", "quote": "עדת קרח", "refs": ["108a:4"], "note": "outside the input window"}],
  "verse_categories_not_groups": ["רשעים", "חטאים", "עדת צדיקים", "עדת רשעים"],
  "unnamed_voices": [
   {"label": "Anonymous Mishnah voice (first statements)", "note": "'מתני׳' is an editorial section marker, not a speaker mention"},
   {"label": "Respondents to Rabbi Nehemya", "quote": "אמרו לו", "note": "glossed as 'the Sages' (F2); a parallel work gives the wording to Rabbi Yehoshua (F7)"}],
  "groups_in_flood_gemara": ["דור המבול (108a:5-108b:3, repeatedly)", "people as a whole vs animals ('אם אדם חטא בהמה מה חטאה', 108a:19)", "fish not destroyed ('ולא דגים שבים', 108a:21)", "Noah's household from the verse ('אתה ובניך ואשתך ונשי בניך', 108b:14)", "'מלכי מזרח ומערב' (108b:21)", "schools: דבי רבי ישמעאל, דבי רבי שילא", "the unnamed 'some say': איכא דאמרי"],
  "biblical_or_narrated_speakers": ["God (108a:8, 108a:15-16, 108a:20 in parable application, 108b:9)", "Flood generation collective (108a:8, 108a:23, 108b:1-2)", "Noah (108a:22-23, 108b:2-3, 108b:13, 108b:20)", "raven (108b:12)", "dove (108b:17)", "personified robbery (108a:13)", "Shem (108b:19-21)", "Eliezer (108b:19-21)", "Methuselah (named 108b:5; speaker at 108a:22 only in Yad Ramah's reading)"],
  "non_speaking_figures": ["Ham (108b:15)", "Abraham (108b:21)", "dog, chameleon, lion, phoenix (אורשינא), tushlami bird"],
  "later_interpreters": "see F12"
 },
 "findings": findings,
 "alternative_readings": [
  {"id": "AR1", "reading": "The reply covers both the Flood generation and Sodom.", "who": "Not proposed by any source checked. The plural 'אינם' leaves it grammatically open.", "status": "weak: it would contradict the anonymous Mishnah's Flood-generation clause, and Rashi and Tosafot Yom Tov limit the dispute to one group (F3)."},
  {"id": "AR2", "reading": "The reply is aimed only at Sodom and answers Rabbi Nehemya's reading of the second clause of the verse.", "who": "Rashi and Tosafot Yom Tov (interpretation); the Avot deRabbi Natan parallel treats the same formula as being about Sodom only.", "status": "preferred (medium confidence)."},
  {"id": "AR3", "reading": "Rabbi Nehemya applies 'shall not stand in judgment' to Sodom as well, by the rule 'what is said of one applies to its fellow' (rule 19 of the 32 rules of Rabbi Eliezer son of Rabbi Yose HaGelili). The respondents read the verse's clauses separately.", "who": "Rashash", "evidence": {"source_id": "S14", "exact_quote": "ונ\"ל דר\"נ מפרש לקרא ע\"פ מדה י\"ט מל\"ב מדות דר\"א בנו של ריה\"ג מדבר שנאמר בזה והוא הדין לחבירו"}},
  {"id": "AR4", "reading": "Respondents = 'the Sages' vs. unnamed; in Avot deRabbi Natan A 36 the wording belongs to Rabbi Yehoshua.", "who": "Davidson English, Steinsaltz, Kulp, Community translation, Rashash ('the Sages'); Avot deRabbi Natan (Rabbi Yehoshua)."},
  {"id": "AR5", "reading": "Rabbi Menachem: the Flood generation's souls torment them even at the resurrection (Davidson English), or 'they live and are judged, but their measure is harsher' (Yad Ramah).", "who": "Davidson English vs. Yad Ramah"},
  {"id": "AR6", "reading": "Rebuker at 108a:22: Noah (Davidson/Vilna) or Methuselah (Yad Ramah). 'פרידה': Methuselah (Rashi, Davidson English) or Noah (Yad Ramah).", "who": "See F14"}
 ],
 "unresolved": [
  "No Bavli manuscript was checked for the wording of 108a:1 ('אמרו לו' and the order of the reply's words).",
  "Only the Machon Mamre text of the Tosefta was checked. The Zuckermandel and Lieberman editions were not.",
  "Guggenheimer's footnotes on Mishnah manuscripts in the Yerushalmi (for example n. 311) were not analysed.",
  "Yerushalmi Sanhedrin 10:4 and Bereshit Rabbah 41:7 and 26:6 were fetched and searched, not read in full. The Bereshit Rabbah items linked from 108a:1 (via Maharzu) were not traced to specific wording.",
  "Whether the Rabbi Nehemya of the Mishnah, of Avot deRabbi Natan 36 and of the Yerushalmi baraita are the same person is not established by the shared name.",
  "Whether 'ben Beteira', 'ben Korcha' and 'ben Dormaskit' are literal patronymics or name forms is not decided here."
 ],
 "proposed_corrections": [
  {"existing_claim_id": "mentions (review 'miss', c5)", "change": "Add mentions for 'דור המבול' and 'אנשי סדום' in s3 (108a:1), linked to the flood and sodom entities. Add 'רשעים' and 'חטאים' as verse-term mentions that Rabbi Nehemya maps onto those groups.", "why": "F1"},
  {"existing_claim_id": "c6", "change": "Narrow the object from the whole of nehemya_fate to its Sodom part. Keep addressee = Rabbi Nehemya. Set the scope basis to 'interpretation (Rashi 107b, Tosafot Yom Tov)'.", "why": "F3"},
  {"existing_claim_id": "c7", "change": "Make 'opposes' target only 'Sodom does not stand in judgment'. Do not oppose the Flood-generation part, which the anonymous Mishnah shares.", "why": "F3, F4"},
  {"existing_claim_id": "nehemya_fate (entity)", "change": "Split into a Flood-generation sub-view (agrees with c1) and a Sodom sub-view (contested).", "why": "F3"},
  {"existing_claim_id": "respondents (entity)", "change": "Keep as an unnamed collective. Put 'the Sages' in an interpretation note with its sources. Add an alternative-attribution note: Rabbi Yehoshua in Avot deRabbi Natan A 36 (parallel work). This is not an identity.", "why": "F2, F7"},
  {"existing_claim_id": "new", "change": "Add 'respondents' reply agrees with c3 (the anonymous Sodom clause)' at view level.", "why": "F4"},
  {"existing_claim_id": "c2", "change": "Add a text-variant note: the dispersion clause is absent from the Kaufmann-based Mishnah and from the Yerushalmi Venice Mishnah.", "why": "F5"},
  {"existing_claim_id": "anonymous_teaching / m10", "change": "Do not anchor a speaker mention on 'מתני׳', which is an editorial marker. Use the kind 'anonymous_voice' rather than 'group'.", "why": "Ontology: section markers are not persons or groups."},
  {"existing_claim_id": "righteous, wicked (entities)", "change": "Change the kind to a verse or future-judgment category, not a historical group.", "why": "F11"},
  {"existing_claim_id": "episode.notes", "change": "The note says 'the anonymous reply follows Rabbi Nehemya across a segment boundary'. More precisely, Rabbi Nehemya's exposition itself runs across the boundary, and the reply follows it within 108a:1.", "why": "F1"}
 ],
 "ontology_lessons": [
  "When an unnamed reply answers a view about several targets, scope the 'opposes' edge to the sub-claim it answers. Record whether that scope is explicit or rests on commentary.",
  "Editorial markers (מתני׳, גמ׳) mark sections. They are not speakers and should not anchor mentions of persons or groups.",
  "Verse terms mapped by exegesis (רשעים → Flood generation) are interprets-as edges attributed to the interpreter, not new groups.",
  "A parallel in another work that gives the same formula to a named sage is an alternative attribution. It is not an identity for the unnamed voice, and it does not prove who said it.",
  "Scenes with biblical characters speaking are narrated inside a named rabbi's exegesis. Nest them as reported scenes under that rabbi instead of treating them as direct observations.",
  "Personifications (robbery), animals (raven, dove) and parable figures are not persons.",
  "Kinship stated in a character's speech ('אבא') is textual evidence within the story. Translation glosses ('son of Noah') from the same editorial work as another gloss are one source, not corroboration.",
  "When witnesses disagree on a patronymic (יוסף/יוסי), keep one parent placeholder with variant labels, or two branches. Do not drop the parent.",
  "Source variants (the Kaufmann text lacks the dispersion clause) and later proposed reorderings (the Vilna Gaon, reported by Rashash) are different evidence types."
 ]
}
json.dump(dossier, open("dossier.json", "w"), ensure_ascii=False, indent=1)
print("ok", len(findings), "findings;", len(SRC), "sources")
