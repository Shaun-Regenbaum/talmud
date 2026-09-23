import json, hashlib, re, os, sys, unicodedata
# Build dossier.json from the saved sources; every evidence quote is checked against the saved bytes.

LOG = {os.path.basename(e["saved_file"]): e for e in json.load(open("sources/fetch_log.json")) if "saved_file" in e}
PILOT = "../../../pilot"

def src(sid, fname, edition, version=None, url=None, note=None):
    if fname.startswith(PILOT) or fname == "previous-review.json":
        path = fname
        fetched = None
        u = url or path
    else:
        path = "sources/" + fname
        e = LOG[fname]
        fetched = e["fetched_at"]
        u = e["url"] + ((" [POST query: " + e["query"] + "]") if e.get("query") else "")
    b = open(path, "rb").read()
    d = {"source_id": sid, "url_or_path": u, "edition": edition, "fetched_at": fetched,
         "saved_file": path, "sha256": hashlib.sha256(b).hexdigest()}
    if version: d["version_title_in_file"] = version
    if note: d["note"] = note
    return d

GUG_HE = "The Jerusalem Talmud, edition by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015"
GUG_EN = "The Jerusalem Talmud, translation and commentary by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015"
VEN = "Venice Edition"
MM = "Mechon-Mamre"
PIOT = "Piotrków, 1898-1900"

SOURCES = [
    src("IN", PILOT + "/inputs/random-yerushalmi-05.json", "Pilot input (Sefaria, Guggenheimer Hebrew, JT Ketubot 11:7:2-6), read-only"),
    src("OUT", PILOT + "/outputs/random-yerushalmi-05.json", "Earlier pilot reading under review, read-only"),
    src("REV", "previous-review.json", "Earlier independent review of the pilot reading, read-only"),
    src("KET_GUG_HE", "jt_ketubot_11_7_v3_all.json", "JT Ketubot 11:7, Guggenheimer Hebrew text (Sefaria v3)", GUG_HE, note="Segments 2-6 match the pilot input text."),
    src("KET_VEN", "jt_ketubot_11_7_v3_all.json", "JT Ketubot 11:7, Venice printed edition (Sefaria v3)", VEN),
    src("KET_MM", "jt_ketubot_11_7_v3_all.json", "JT Ketubot 11:7, Mechon-Mamre text (Sefaria v3)", MM),
    src("KET_GUG_EN", "jt_ketubot_11_7_v3_all.json", "JT Ketubot 11:7, Guggenheimer English translation with notes (Sefaria v3)", GUG_EN,
        note="Built on the same editorial work as KET_GUG_HE; not an independent witness to it."),
    src("KET116", "jt_ketubot_11_6_v3_all.json", "JT Ketubot 11:6, all Sefaria versions (context)"),
    src("YEV_GUG_HE", "jt_yevamot_9_4_v3_all.json", "JT Yevamot 9:4 (parallel sugya), Guggenheimer Hebrew", GUG_HE),
    src("YEV_VEN", "jt_yevamot_9_4_v3_all.json", "JT Yevamot 9:4, Venice printed edition", VEN),
    src("YEV_MM", "jt_yevamot_9_4_v3_all.json", "JT Yevamot 9:4, Mechon-Mamre", MM),
    src("YEV_GUG_EN", "jt_yevamot_9_4_v3_all.json", "JT Yevamot 9:4, Guggenheimer English with notes", GUG_EN),
    src("GIT_GUG_HE", "jt_gittin_9_9_v3_all.json", "JT Gittin 9:9 (parallel for the Shmuel passage), Guggenheimer Hebrew", GUG_HE),
    src("GIT_VEN", "jt_gittin_9_9_v3_all.json", "JT Gittin 9:9, Venice printed edition", VEN),
    src("GIT_MM", "jt_gittin_9_9_v3_all.json", "JT Gittin 9:9, Mechon-Mamre", MM),
    src("GIT_GUG_EN", "jt_gittin_9_9_v3_all.json", "JT Gittin 9:9, Guggenheimer English", GUG_EN),
    src("SHAB_GUG_HE", "jt_shabbat_9_3_4.json", "JT Shabbat 9:3:4 (same 'כל שעה ... אמר לי' formula), Guggenheimer Hebrew", GUG_HE),
    src("SHAB_VEN", "jt_shabbat_9_3_4.json", "JT Shabbat 9:3:4, Venice printed edition", VEN),
    src("SHAB_GUG_EN", "jt_shabbat_9_3_4.json", "JT Shabbat 9:3:4, Guggenheimer English", GUG_EN),
    src("NAZ3_GUG_HE", "jt_nazir_7_3_v3_all.json", "JT Nazir 7:3 (another Tsaydaniya recitation before R. Yirmeya), Guggenheimer Hebrew", GUG_HE),
    src("NAZ3_GUG_EN", "jt_nazir_7_3_v3_all.json", "JT Nazir 7:3, Guggenheimer English", GUG_EN),
    src("NAZ4_VEN", "jt_nazir_7_4_v3_all.json", "JT Nazir 7:4, Venice printed edition", VEN),
    src("NAZ4_GUG_EN", "jt_nazir_7_4_v3_all.json", "JT Nazir 7:4, Guggenheimer English", GUG_EN),
    src("TER1151", "jt_terumot_11_5_12.json", "JT Terumot 11:5:12, all versions (a search hit checked; not relevant)"),
    src("PM_KET", "penei_moshe_jt_ketubot_11_7.json", "Penei Moshe on JT Ketubot 11:7", PIOT),
    src("KH_KET", "korban_haedah_jt_ketubot_11_7.json", "Korban HaEdah on JT Ketubot 11:7", PIOT),
    src("SK_KET", "sheyarei_korban_jt_ketubot_11_7.json", "Sheyarei Korban on JT Ketubot 11:7", PIOT),
    src("AY_KET", "amudei_yerushalayim_jt_ketubot_11_7.json", "Amudei Yerushalayim on JT Ketubot 11:7", "Jerusalem, 1969-1970"),
    src("PM_YEV", "penei_moshe_jt_yevamot_9_4.json", "Penei Moshe on JT Yevamot 9:4", PIOT),
    src("KH_YEV", "korban_haedah_jt_yevamot_9_4.json", "Korban HaEdah on JT Yevamot 9:4", PIOT),
    src("SK_YEV", "sheyarei_korban_jt_yevamot_9_4.json", "Sheyarei Korban on JT Yevamot 9:4", PIOT),
    src("MHP_YEV", "mareh_hapanim_jt_yevamot_9_4.json", "Mareh HaPanim on JT Yevamot 9:4", PIOT),
    src("NOAM_YEV", "noam_yerushalmi_yevamot_9_4.json", "Noam Yerushalmi on Yevamot 9:4", "Vilna, 1869"),
    src("STEY_YEV", "shaarei_torat_ey_jt_yevamot_9_4.json", "Sha'arei Torat Eretz Yisrael on JT Yevamot 9:4", "Jerusalem, 1940"),
    src("AY_YEV", "amudei_yerushalayim_jt_yevamot_9_4.json", "Amudei Yerushalayim on JT Yevamot 9:4", "Jerusalem, 1969-1970"),
    src("TOS_YEV", "tosefta_yevamot_lieberman_2_4.json", "Tosefta Yevamot 2:4 (Lieberman, codex Vienna)"),
    src("MISH_KET", "mishnah_ketubot_11_6.json", "Mishnah Ketubot 11:6, all Sefaria versions"),
    src("MISH_YEV", "mishnah_yevamot_9_3.json", "Mishnah Yevamot 9:3, all Sefaria versions"),
    src("MISH_KET71", "mishnah_ketubot_7_1.json", "Mishnah Ketubot 7:1, all Sefaria versions"),
    src("MISH_GIT", "mishnah_gittin_9_8.json", "Mishnah Gittin 9:8, all Sefaria versions"),
    src("MEY_KET", "mishnat_ey_ketubot_11_6.json", "Mishnat Eretz Yisrael on Mishnah Ketubot 11:6"),
    src("RAMBAM_TER", "rambam_terumot_7_20.json", "Mishneh Torah, Heave Offerings 7:20 (Hebrew; Touger English)"),
    src("KM_TER", "kessef_mishneh_terumot_7_20.json", "Kessef Mishneh on Heave Offerings 7:20"),
    src("MR_TER", "maaseh_rokeach_terumot_7_20.json", "Maaseh Rokeach on Heave Offerings 7:20 (Friedberg)"),
    src("YE_TER", "yad_eitan_terumot_7_20.json", "Yad Eitan on Heave Offerings 7:20 (Friedberg)"),
    src("BA_TER", "ben_aryeh_terumot_7_20.json", "Ben Aryeh on Heave Offerings 7:20 (Friedberg)"),
    src("RAMBAM_AVEL", "rambam_avel_2_9.json", "Mishneh Torah, Mourning 2:9"),
    src("RAMBAM_GER", "rambam_gerushin_2_20.json", "Mishneh Torah, Divorce 2:20 (fetched; not quoted)"),
    src("TOSAFOT_K70A", "tosafot_ketubot_70a.json", "Tosafot on Ketubot 70a (Vilna)"),
    src("BAVLI_K46A", "bavli_ketubot_46a_13.json", "Bavli Ketubot 46a:13 (Wikisource; William Davidson; Daf Shevui)"),
    src("LEX_TSIDANI", "lexicon_tsidani.json", "Sefaria lexicon lookup for צידני (Jastrow and others)"),
    src("LINKS_KET", "links_jt_ketubot_11_7.json", "Sefaria links API for JT Ketubot 11:7"),
    src("LINKS_YEV", "links_jt_yevamot_9_4.json", "Sefaria links API for JT Yevamot 9:4"),
    src("SRCH_HILA_RABBI", "search_הילא_רבי_אמר_לי.json", "Sefaria exact search 'הילא רבי אמר לי' (2 hits)"),
    src("SRCH_KOL_SHAAH", "search_כל_שעה_הוה.json", "Sefaria exact search 'כל שעה הוה'"),
    src("SRCH_BKOL_SHAAH", "search_בכל_שעה_הוה.json", "Sefaria exact search 'בכל שעה הוה'"),
    src("SRCH_KOL_SHAAH_HAVI", "search_כל_שעה_הוי.json", "Sefaria exact search 'כל שעה הוי'"),
    src("SRCH_YOSI_TSIDONAYA", "search_יוסי_צידונייא.json", "Sefaria exact search 'יוסי צידונייא'"),
    src("SRCH_YOSI_TSAYDNAYA", "search_יוסי_ציידנייא.json", "Sefaria exact search 'יוסי ציידנייא'"),
    src("SRCH_YOSI_TSIDNIA", "search_יוסי_צידניא.json", "Sefaria exact search 'יוסי צידניא'"),
    src("SRCH_TSIDONAYA", "search_צידונייא.json", "Sefaria exact search 'צידונייא'"),
    src("SRCH_TSAYDNAYA", "search_ציידנייא.json", "Sefaria exact search 'ציידנייא'"),
    src("SRCH_YOSEF_TSIDONI", "search_יוסף_צידוני.json", "Sefaria exact search 'יוסף צידוני'"),
    src("SRCH_TSIDONI", "search_צידוני.json", "Sefaria exact search 'צידוני'"),
    src("SRCH_TSIDANI", "search_צידני.json", "Sefaria exact search 'צידני'"),
    src("SRCH_YOSEF_TSIDONIA", "search_יוסף_צידוניא.json", "Sefaria exact search 'יוסף צידוניא' (0 hits)"),
    src("SRCH_YOSEF_TSIDANI", "search_יוסף_צידני.json", "Sefaria exact search 'יוסף צידני' (0 hits)"),
]
SID = {s["source_id"]: s for s in SOURCES}

def texts_of(s):
    """All strings in the saved file (restricted to one version when the source names one), tags stripped."""
    raw = open(s["saved_file"], "rb").read()
    d = json.loads(raw)
    out = []
    def walk(x):
        if isinstance(x, str): out.append(x)
        elif isinstance(x, list):
            for y in x: walk(y)
        elif isinstance(x, dict):
            for y in x.values(): walk(y)
    vt = s.get("version_title_in_file")
    if vt and isinstance(d, dict) and "versions" in d:
        for v in d["versions"]:
            if v.get("versionTitle") == vt: walk(v["text"])
    else:
        walk(d)
    res = []
    for t in out:
        res.append(t)
        res.append(re.sub(r"<[^>]+>", "", t))
        res.append(re.sub(r"<[^>]+>", "", re.sub(r'<i class="footnote">.*?</i>(?=\s|[^<]|$)', "", t)))
    return res

def E(sid, q):
    return {"source_id": sid, "exact_quote": q}

FINDINGS = [
 {"finding_id": "F1", "kind": "textual",
  "claim": "Shmuel's coercion rule is restrictive. He says the court does not coerce a divorce except in cases such as a widow married to a High Priest, or a divorcee or halutzah married to an ordinary priest. The rule does not simply say that coercion applies in those cases.",
  "evidence": [E("KET_GUG_HE", "שְׁמוּאֵל אָמַר. אֵין מְעַשִּׂין אֶלָּא כְגוֹן אַלְמָנָה לְכֹהֵן גָּדוֹל. גְּרוּשָׁה וַחֲלוּצָה לְכֹהֵן הֶדְיוֹט."),
               E("KET_VEN", "שמואל אמר אין מעשין אלא כגון אלמנה לכהן גדול גרושה וחלוצה לכהן הדיוט"),
               E("KET_GUG_EN", "Samuel said, one does not force except for example a widow married to a High Priest"),
               E("KH_KET", "הא דתנן במתני' גט מעושה היינו כגון אלמנה לכה\"ג וכו' וקס\"ד דבא למעט פסולי דרבנן כגון שניות")],
  "reasoning": "אין ... אלא is an exclusive construction ('not ... except'). My translation: 'Shmuel said: one does not coerce [a divorce] except, for example, [for] a widow to a High Priest, a divorcee or halutzah to an ordinary priest.' Korban HaEdah reads the first impression of the rule as excluding rabbinically forbidden unions such as the secondary prohibited marriages (שניות). That exclusion is what the next objection attacks. The pilot label ('Coercion applies to forbidden priestly marriages') keeps the list but drops the word 'only'.",
  "confidence": "high",
  "graph_effect": "Relabel c20 as a restrictive rule: holds_view(shmuel, 'the court coerces a divorce ONLY in cases like widow/High Priest, divorcee or halutzah/ordinary priest'). This is Shmuel's second statement in 11:7:6. Add a separate mention for it; the pilot recorded only the first שְׁמוּאֵל."},
 {"finding_id": "F2", "kind": "textual",
  "claim": "An unnamed voice objects to Shmuel's restriction from a Mishnah about secondary prohibited marriages (שניות). That Mishnah, Yevamot 9:3, rules that the husband is coerced to divorce such a wife.",
  "evidence": [E("KET_GUG_HE", "וְהָא תַנִּינָן. שְׁנִיּוֹת."),
               E("MISH_YEV", "וְהַוָּלָד כָּשֵׁר, וְכוֹפִין אוֹתוֹ לְהוֹצִיא"),
               E("KH_KET", "ביבמות פ\"ט בשנייה שכופין אותו להוציא וקשיא לשמואל"),
               E("PM_YEV", "והא תנינן שניו'. במתני' דכופין להוציא")],
  "reasoning": "My translation: 'But have we not learned: secondary prohibited women?' The quote is a two-word pointer to a Mishnah. Both Penei Moshe and Korban HaEdah identify it as Mishnah Yevamot 9:3, where the secondary prohibitions are rabbinic, not biblical, and the husband is still coerced. If Shmuel's rule excluded rabbinic cases, the Mishnah would contradict it. The objecting voice is the anonymous voice of the Talmud (Korban HaEdah on Yevamot calls the interpretive step סתמא דש\"ס). It is not a named person or a group of people.",
  "confidence": "high",
  "graph_effect": "Add claim: challenges(anonymous talmudic voice, Shmuel's restrictive rule), grounded in Mishnah Yevamot 9:3. m15/'anon' should be typed as the anonymous editorial voice citing a Mishnah (תנינן = 'we learned'), not a group of people."},
 {"finding_id": "F3", "kind": "interpretation",
  "claim": "The reply 'לָא בְגִין דָּא אָמַר שְׁמוּאֵל' defends Shmuel: his rule does include the secondary prohibited marriages. Commentators agree on that outcome but reach it through different readings. Korban HaEdah proposes two different emendations. Penei Moshe keeps the printed words. Guggenheimer's English translates a sense matching one of Korban HaEdah's emendations.",
  "evidence": [E("KET_GUG_HE", "לָא בְגִין דָּא אָמַר שְׁמוּאֵל."),
               E("KH_KET", "ה\"ג בגין דא אמר שמואל כגון. וה\"פ בשביל כך אמר שמואל כגון אלמנה וכו' לרבויי אפי' הנך דאסורין מדרבנן ולא בא אלא למעט נשא אשה ושהה עמה עשר שנים ולא ילדה"),
               E("KH_YEV", "ה\"ג לא כגון אמר שמואל. וה\"פ משני וכי לא אמר שמואל כגון בתמיה ובא לרבות אפילו איסורי דרבנן שכופין"),
               E("PM_YEV", "ומשני לא בגין דא אמר שמואל. לא לאפוקי הא אמר דשניות נמי פסולין מיקרו אלא למעוטי בכל הני דינים דתנן בהו יוציא וקאמר דאין כופין לבד הפסולין"),
               E("KET_GUG_EN", "Did he not say “for example”?"),
               E("YEV_GUG_EN", "He approves of judicial intervention in the case of any sinful marriage, whether by biblical or rabbinic standards.")],
  "reasoning": "My translation of the printed text: 'Not on account of this did Shmuel say [it].' Korban HaEdah on Ketubot emends to 'For this reason Shmuel said \"such as\"', so the word 'such as' extends the list to rabbinic prohibitions; the rule then excludes only the childless-after-ten-years case. Korban HaEdah on Yevamot emends instead to a rhetorical question: 'Did Shmuel not say \"such as\"?' Penei Moshe keeps לא בגין דא: Shmuel did not speak to exclude שניות, which also count as 'disqualified'. He spoke to exclude the Mishnah cases that say only 'he shall divorce'. Guggenheimer's English matches Korban HaEdah's Yevamot emendation, but the Guggenheimer Hebrew text prints בגין. These are commentary emendations, not manuscript variants.",
  "confidence": "medium",
  "graph_effect": "Add claim: defends(anonymous talmudic voice, Shmuel's rule against the שניות objection). Record the mechanism as a reading group: (a) 'such as' includes rabbinic prohibitions (Korban HaEdah, Guggenheimer); (b) the rule targets the 'he shall divorce' cases (Penei Moshe). Both branches rejoin: Shmuel is not refuted."},
 {"finding_id": "F4", "kind": "interpretation",
  "claim": "The second objection cites the Mishnah about a man who vows to deny his wife any benefit. After 30 days he 'shall divorce and pay the ketubah'. The reply is read as rhetorical: we learned that he must divorce, but did we learn that he is coerced? The reply keeps Shmuel's restriction. It is not an open question.",
  "evidence": [E("KET_GUG_HE", "הַמַדִּיר אֶת אִשְׁתּוֹ מִלֵּיהֲנוֹת לוֹ. עַד שְׁלֹשִׁים יוֹם יַעֲמִיד פַּרְנָס. יוֹתֵר מִיכֵּן יוֹצִיא וְיִתֵּן כְּתוּבָּה. שָׁמַעְנוּ שֶׁהוּא מוֹצִיא. שָׁמַעְנוּ שֶׁכּוֹפִין."),
               E("MISH_KET71", "הַמַּדִּיר אֶת אִשְׁתּוֹ מִלֵּהָנוֹת לוֹ, עַד שְׁלֹשִׁים יוֹם, יַעֲמִיד פַּרְנָס. יָתֵר מִכֵּן, יוֹצִיא וְיִתֵּן כְּתֻבָּה."),
               E("KH_KET", "ומשני שמענו שמוציא. שמבקשין ממנו ליתן לה גט וכי שמענו ממתני' שכופין אותו בתמיה וכיון שאין עברה בנישואין אין כופין אותו להוציא"),
               E("PM_YEV", "ומשני שמענו שהוא מוציא אבל שמענו כופין. בתמי' דלא קתני כופין להוציא"),
               E("KET_GUG_EN", "We heard that he shall divorce; did we hear that one forces him?"),
               E("TOSAFOT_K70A", "ופסק ר\"ח משם ש\"מ שאין כופין אלא היכא שמפרש בהדיא כופין"),
               E("TOSAFOT_K70A", "אלא דירושלמי קסבר ששייך כפייה במילי")],
  "reasoning": "My translation: 'We heard that he divorces; did we hear that one coerces?' Korban HaEdah, Penei Moshe and Guggenheimer all read it as a rhetorical question. Tosafot report Rabbenu Hananel ruling from this Yerushalmi that coercion applies only where a source says 'coerce' outright. Tosafot themselves suggest that the Yerushalmi allows coercion by words. The Yerushalmi does not say this; Sheyarei Korban and Amudei Yerushalayim debate it. The Mishnah's 'provider for up to thirty days' and 'divorce and pay the ketubah' are quoted legal content, not people.",
  "confidence": "high",
  "graph_effect": "c21 should not be 'asks'. It is the anonymous voice's answer to a second challenge (challenges from Mishnah Ketubot 7:1; answer supports Shmuel's restriction). The pilot kept the final line but dropped both challenge-answer steps."},
 {"finding_id": "F5", "kind": "textual",
  "claim": "The parallels in JT Yevamot 9:4 and JT Gittin 9:9 contain another Shmuel statement that Ketubot lacks: one coerces only for disqualified unions. Guggenheimer's English of Ketubot includes a rendering of it even though his Ketubot Hebrew does not.",
  "evidence": [E("YEV_GUG_HE", "שְׁמוּאֵל אָמַר. אֵין מְעַשִּׂין אֶלָּא פוֹסְלִין."),
               E("YEV_MM", "שמואל אמר אין מעשין אלא לפסולין."),
               E("GIT_GUG_HE", "שְׁמוּאֵל אָמַר. אֵין מְעַשִּׂין אֶלָּא לִפְסוּלִין."),
               E("KET_GUG_EN", "Samuel said, one does not force, only disqualify."),
               E("STEY_YEV", "צ\"ל: שמואל אמר אין מעשין אלא לפסולות כגון אלמנה לכה\"ג כו' (ומה שבינתיים מיותר וליתא בכתובות פי\"א ה\"ז)."),
               E("TOSAFOT_K70A", "אמר שמואל אין מעשין אלא לפסולות אמר רבי שמואל תנינא המדיר את אשתו מליהנות כו' שמענו שמוציא שמענו שכופין"),
               E("PM_YEV", "שמואל אמר. כמו ואיכא דאמרי דהכי אמר שמואל אין מעשין כו'")],
  "reasoning": "In the Ketubot Hebrew (all three versions checked) the Shmuel sequence goes straight from 'invalid and disqualifies for priesthood' to 'one does not coerce except such as ...'. The Yevamot and Gittin texts differ: Guggenheimer's Hebrew and the Venice edition read פוסלין, while Mechon-Mamre and the Gittin text read לפסולין. Sha'arei Torat Eretz Yisrael emends Yevamot into one sentence and notes that Ketubot lacks the middle words. Penei Moshe treats the repeated 'Shmuel said' as an alternative version of one ruling. Rabbenu Hananel's text, as Tosafot quote it, is a separate citation witness. It reads לפסולות and has a different introduction to the objection (אמר רבי שמואל תנינא).",
  "confidence": "high",
  "graph_effect": "Do not count 'Shmuel said' repetitions across parallels as separate independent teachings. In Ketubot, Shmuel has two statements (disqualifies for priesthood; restrictive coercion). The 'only for disqualified' form belongs to the parallels and to a citation, recorded as a variant."},
 {"finding_id": "F6", "kind": "textual",
  "claim": "In the Ketubot text (Guggenheimer Hebrew and the Venice print), Rabbi Yose speaks of 'Rabbi Hila, my teacher' (רִבִּי הִילָא רִבִּי). He says Hila always told him to include in his baraita that the husband inherits his secondary prohibited wife and becomes impure for her burial.",
  "evidence": [E("KET_GUG_HE", "אָמַר רִבִּי יוֹסֵי. בְּכָל שָׁעָה הַוָה רִבִּי הִילָא רִבִּי אָמַר לִי. תְּנִי מַתְנִיתָךְ. יוֹרְשָׁהּ וּמִיטַמֵּא לָהּ."),
               E("KET_VEN", "אמר רבי יוסי בכל שעה הוה רבי הילא רבי אמר לי תני מתניתא יורשה ומיטמא לה"),
               E("KET_GUG_EN", "Rebbi Yose said: All the time my teacher Rebbi Hila told me, state in your"),
               E("KH_KET", "כלומר תמיד היה מרגלא בפומיה דר' אילא רבו דשנייה יורשה ומטמא לה")],
  "reasoning": "My translation: 'Rabbi Yose said: At all times Rabbi Hila, my master, would say to me: recite in your teaching: he inherits her and becomes impure for her.' The second רבי stands in apposition to the name, inside Yose's first-person report ('said to me'). Guggenheimer translates it 'my teacher'. Korban HaEdah paraphrases it as 'R. Ila his teacher'. The relationship is stated by Yose himself; it is not inferred by a later reader. 'At all times' marks a habitual, repeated instruction, not a single meeting.",
  "confidence": "high",
  "graph_effect": "Keep student_of(yose_11_7_4, hila) with basis = explicit self-description in the Ketubot reading (upgrade from 'interpretation'), and heard_from/addressed_by(hila → yose) as habitual. Add a mention for the second רִבִּי. Qualify both by F7: the teacher word depends on the reading."},
 {"finding_id": "F7", "kind": "textual",
  "claim": "The word 'my teacher' is not in every text. Mechon-Mamre's Ketubot and all three versions of the Yevamot 9:4 parallel read 'Rabbi Hila said to me' without the second רבי. Guggenheimer's English of the Yevamot parallel accordingly has no 'my teacher'.",
  "evidence": [E("KET_MM", "אמר רבי יוסי בכל שעה הוה ר' הילא אמר לי"),
               E("YEV_GUG_HE", "אָמַר רִבִּי יוֹסֵה. כָּל שָׁעָה הַוְיָא רִבִּי הִילָא אָמַר לִי."),
               E("YEV_VEN", "אמר ר' יוסה כל שעה הויא רבי אילה אמר לי"),
               E("YEV_MM", "א\"ר יוסה כל שעה הויא רבי אילה אמר לי"),
               E("YEV_GUG_EN", "Rebbi Yose said: All the time Rebbi Hila told me"),
               E("PM_YEV", "שמעתי מר' אילה שאמר לי בכל שעה"),
               E("NOAM_YEV", "אמר ר' יוסי כל שעה הוי ר' אילא אמר לי")],
  "reasoning": "The Venice print has the teacher word in Ketubot but not in its own Yevamot text. So the teacher label is a Ketubot reading, not a feature of the tradition as a whole. Mechon-Mamre is a later digital text; its omission may reflect harmonization or a different source, and I did not check the manuscript. The direct-speech relation (Hila told Yose, repeatedly) survives in every version. Hila's name is spelled הילא / אילה / אילא across these texts; I treat these as spellings of one local mention in the parallel passage, not as proof of historical identity.",
  "confidence": "high",
  "graph_effect": "The student_of edge carries a textual-variant flag: present in Ketubot (Venice; Guggenheimer Hebrew), absent in Ketubot (Mechon-Mamre) and in Yevamot 9:4 (Guggenheimer, Venice, Mechon-Mamre). Do not treat the Yevamot text as a second independent attestation of 'teacher'. It attests only the heard_from edge."},
 {"finding_id": "F8", "kind": "interpretation",
  "claim": "The Yerushalmi uses the same formula elsewhere with a second רבי meaning 'my teacher'. In JT Shabbat 9:3:4, Rabbi Yose says R. Zeira 'my teacher' always told him 'recite in your Mishnah'. This supports reading the Ketubot word as a title, not a scribal doubling. It does not settle whether the word is original in Ketubot.",
  "evidence": [E("SHAB_VEN", "אמר רבי יוסה כל שעה הוה רבי זעירא רבי אומר לי תני מתניתך"),
               E("SHAB_GUG_HE", "אָמַר רִבִּי יוֹסֵה. כָּל שָׁעָה הֲוָה רִבִּי זְעִירָא רִבִּי אוֹמֵר לִי. תְּנִי מַתְנִיתָךְ."),
               E("SHAB_GUG_EN", "Rebbi Yose said, my teacher Rebbi Zeˋira always was saying to me, state in your Mishnah")],
  "reasoning": "The Shabbat and Ketubot sentences share the structure כל שעה הוה X רבי אמר/אומר לי תני מתניתך. That makes 'my teacher' a known idiom of this formula. A copyist could also have added the word to Ketubot by analogy with such passages. I found no evidence either way, so the original wording stays open.",
  "confidence": "medium",
  "graph_effect": "Supports keeping the student_of edge in the Ketubot reading. Do not import the Shabbat R. Zeira teacher edge into this passage. It is a separate observation, and the Shabbat R. Yose is not shown here to be the same person (see F13)."},
 {"finding_id": "F9", "kind": "textual",
  "claim": "What Hila told Yose to recite, 'he inherits her and becomes impure for her', matches the wording of Tosefta Yevamot 2:4 on the secondary prohibited wives. Korban HaEdah applies the ruling to the secondary prohibited wife. The versions also differ on the object noun: 'your teaching' (מתניתך) against 'the teaching' (מתניתא).",
  "evidence": [E("TOS_YEV", "שניות מדברי סופרים אינן כאשתו לכל דבר"),
               E("TOS_YEV", "יורשה, ומטמא לה"),
               E("KET_VEN", "תני מתניתא יורשה ומיטמא לה"),
               E("KET_GUG_HE", "תְּנִי מַתְנִיתָךְ. יוֹרְשָׁהּ וּמִיטַמֵּא לָהּ."),
               E("MHP_YEV", "וכן מסיים התם יורשה ומטמא לה")],
  "reasoning": "Guggenheimer (Yevamot note 35) and Mareh HaPanim point to the Tosefta. The content is legal: a husband, even a priest, inherits from his secondary prohibited wife and must become impure to bury her. Korban HaEdah explains the ruling by the rule for an unattended dead body: since he inherits, no one else will bury her.",
  "confidence": "high",
  "graph_effect": "Hila's instruction is a teaching given to Yose ('instructs_to_recite'). The generic wife and husband are legal roles, not historical persons. The Tosefta match is a text parallel, not a transmission edge."},
 {"finding_id": "F10", "kind": "interpretation",
  "claim": "The next line, 'and R. Hiyya taught so', can be read two ways: as support for Hila's ruling, or as a rhetorical objection to it. Only Ketubot names R. Hiyya; the Yevamot parallel reads just 'and it was taught so'.",
  "evidence": [E("KET_GUG_HE", "וְתַנִּי רִבִּי חִיָיא כֵן. מְטַמֵּא הוּא אָדָם לְאִשְׁתּוֹ כְשֵׁירָה. וְאִינוֹ מִיטַמֵּא לְאִשְׁתּוֹ פְסוּלָה."),
               E("YEV_GUG_HE", "וְתַנִּי כֵן. מְטַמֵּא הוּא אָדָם בְּאִשְׁתּוֹ הַכְּשֵׁירָה."),
               E("KH_KET", "ובברייתא דר\"ח לא תני כן ל\"א ותניא נמי הכי בשם ר\"ח דתני ואינו מטמא לאשתו הפסולה היינו הפסולה מדאורייתא"),
               E("PM_YEV", "ותני כן כו'. בתמי' דהא מצאתי ברייתא דאין מטמא לפסולה וסתמא קתני דמשמע אפילו לפסולה מד\"ס"),
               E("KH_YEV", "ותני כן. בתמיה וכי תני הכי בברייתא ל\"א בניחותא"),
               E("MHP_YEV", "ואפשר לפרש הכא נמי הא דלקמן בניחותא"),
               E("KET_GUG_EN", "We have also stated so: A man defiles himself for his qualified wife but does not become defiled for his disqualified wife.")],
  "reasoning": "Korban HaEdah on Ketubot gives both readings. First: R. Hiyya's baraita does not teach this. Alternative: it does, because 'disqualified' there means disqualified by Torah law. Penei Moshe (on Yevamot) reads it only as an objection. Korban HaEdah on Yevamot gives both; Mareh HaPanim and Guggenheimer lean to support. Guggenheimer's Ketubot English ('We have also stated so') drops the name that the Guggenheimer Hebrew prints. That wording follows the Yevamot parallel (see F18).",
  "confidence": "medium",
  "graph_effect": "Replace c16 'supports' with a reading group: supports or challenges Hila's instruction. Mark R. Hiyya's role as reciter of a baraita, attested in Ketubot only; the attribution is absent in the Yevamot parallel. Which R. Hiyya is meant is not resolved here."},
 {"finding_id": "F11", "kind": "textual",
  "claim": "Yose 'Tsaydaniya' appears in a fixed formula: he recites (תני) a baraita before R. Yirmeya that contradicts R. Yirmeya. The same formula recurs in JT Nazir 7:3 and 7:4. In Nazir 7:3 the name Yose is missing from the text and is supplied by the editor.",
  "evidence": [E("KET_GUG_HE", "תַּנֵּי רִבִּי יוֹסֵי צַיְדָנִיָיא קוֹמֵי רִבִּי יִרְמְיָה וּפַלִּיג עַל רִבִּי יִרְמְיָה."),
               E("KET_VEN", "תני רבי יוסי צידונייא קומי ר' ירמיה ופליג על ר' ירמיה"),
               E("YEV_VEN", "תני רבי יוסי ציידמיה קומי רבי ירמיה ופליג על רבי ירמיה"),
               E("NAZ4_VEN", "תני רבי יוסי ציידנייה קומי רבי ירמיה ופליג על ר' ירמיה"),
               E("NAZ3_GUG_HE", "תַּנֵּי רִבִּי צַיידָנָיָיה קוֹמֵי רִבִּי יִרְמְיָה וּפְלִיג עַל רִבִּי יִרְמְיָה."),
               E("NAZ3_GUG_EN", "Missing in the text; identified in Halakhah 4 (Note 219)."),
               E("KH_KET", "ברייתא לפני ר' ירמיה והיא קשיא על ר' ירמיה")],
  "reasoning": "My translation: 'R. Yose Tsaydaniya recited before R. Yirmeya, and it disagrees with R. Yirmeya.' Korban HaEdah treats ופליג as the recited baraita contradicting R. Yirmeya, not as Yose's own opposing opinion. The spelling of the epithet varies from text to text: צַיְדָנִיָיא, צידונייא, צַיְידָנִיָיה, ציידמיה, ציידניה, ציידנייה, and צודנייה in Korban HaEdah's Yevamot heading.",
  "confidence": "high",
  "graph_effect": "Keep recites_before(yose_tsaydaniya, yirmeya). Re-type c10: the baraita content contradicts Yirmeya's view; Yose is the reciter. Do not record a personal 'opposes' edge as if Yose argued in his own name."},
 {"finding_id": "F12", "kind": "interpretation",
  "claim": "The epithet need not be a place name. Korban HaEdah offers 'from Sidon', or alternatively 'a craftsman who makes traps'. Guggenheimer translates 'the Sidonian' (Nazir: 'from Sidon').",
  "evidence": [E("KH_KET", "צידונייא. מצידון היה א\"נ אומן לעשות מצודות:"),
               E("KET_GUG_EN", "Rebbi Yose the Sidonian stated before Rebbi Jeremiah"),
               E("LEX_TSIDANI", "<i>hunter;</i> trnsf. <i>flatterer, hypocrite</i>")],
  "reasoning": "Korban HaEdah explicitly leaves two options. The Jastrow entry is for a related form (צֵידָנִי, 'hunter'), not this exact spelling, so it only shows that a non-place sense of the root exists. It is not evidence about this man.",
  "confidence": "medium",
  "graph_effect": "Record the epithet as a descriptor with two readings (origin 'of Sidon' or occupation 'trap-maker'). Any from_place(Sidon) edge is provisional and interpretive."},
 {"finding_id": "F13", "kind": "uncertainty",
  "claim": "Nothing I checked establishes that the unqualified Rabbi Yose of 11:7:4 is Yose Tsaydaniya of 11:7:3. They stay separate local persons, with a coreference candidate.",
  "evidence": [E("KET_GUG_HE", "אָמַר רִבִּי יוֹסֵי. בְּכָל שָׁעָה"),
               E("YEV_GUG_HE", "אָמַר רִבִּי יוֹסֵה. כָּל שָׁעָה"),
               E("SHAB_VEN", "אמר רבי יוסה כל שעה הוה רבי זעירא רבי אומר לי תני מתניתך"),
               E("KET_GUG_EN", "Rebbi Yose said: All the time my teacher Rebbi Hila told me")],
  "reasoning": "For linking them: the two sentences are adjacent, and 'recite in your teaching' suits a professional reciter, which is what Tsaydaniya does in 11:7:3. Against linking: the epithet is dropped; the Yevamot parallel spells the name יוסה, not יוסי; and in JT Shabbat 9:3:4 an unqualified R. Yose(h) receives the identical instruction 'recite in your Mishnah' from R. Zeira, so the phrase does not mark a professional reciter. None of the commentaries I read (Penei Moshe, Korban HaEdah, Sheyarei Korban, Noam Yerushalmi, Mareh HaPanim, Amudei Yerushalayim) and neither of Guggenheimer's translations identifies the two. Guggenheimer names them differently. The different spelling in Yevamot is suggestive, but I did not verify any spelling convention in this edition, so it proves nothing.",
  "confidence": "medium",
  "graph_effect": "Keep two person nodes: yose_tsaydaniya (11:7:3) and yose_11_7_4 (the speaker who calls Hila his teacher). Keep the pilot's coreference candidate as an open candidate, with the evidence above on both sides. Do not attach the student_of(Hila) edge to Tsaydaniya."},
 {"finding_id": "F14", "kind": "interpretation",
  "claim": "Guggenheimer identifies Yose Tsaydaniya historically as a fourth-generation Amora who appears in the Bavli as 'Rav Yosef Ṣidonî'. The Bavli (Ketubot 46a) does name a Rav Yosef Tsidoni who taught in the school of R. Shimon bar Yochai. This cross-corpus identity is one editor's historical proposal.",
  "evidence": [E("YEV_GUG_EN", "An Amora of the fourth generation; he appears in the Babli as Rav Yosef Ṣidonî."),
               E("BAVLI_K46A", "וְכֵן תָּנֵי רַב יוֹסֵף צִידוֹנִי בֵּי רַבִּי שִׁמְעוֹן בֶּן יוֹחַאי")],
  "reasoning": "The names differ (Yose against Yosef) and the Bavli context is different (reciting in R. Shimon bar Yochai's school). What they share is an epithet and the role of reciter. Under the project rule, a shared name or epithet does not establish identity. I record this as an editorial historical identification, not a textual finding.",
  "confidence": "low",
  "graph_effect": "Optional cross-corpus candidate link yose_tsaydaniya ~ rav_yosef_tsidoni (BT Ketubot 46a), source = Guggenheimer note. Provisional; not a merge."},
 {"finding_id": "F15", "kind": "textual",
  "claim": "The person who asks R. Mana is 'R. Reuven' in the Ketubot text (Guggenheimer Hebrew, Venice) but 'R. Abun' in Mechon-Mamre's Ketubot and in all three Yevamot versions. Later citations divide the same way.",
  "evidence": [E("KET_GUG_HE", "רִבִּי רְאוּבֶן בְּעָא קוֹמֵי רִבִּי מָנָא."),
               E("KET_VEN", "ר' ראובן בעא קומי ר' מנא"),
               E("KET_MM", "ר' אבון בעא קומי ר' מנא"),
               E("YEV_GUG_HE", "רִבִּי אָבוּן בְּעָא קוֹמֵי רִבִּי מָנָא."),
               E("YEV_VEN", "רבי אבון בעא קומי רבי מנא"),
               E("NOAM_YEV", "ר' אבין בעי קומי ר' מנא"),
               E("YE_TER", "ר\"א בעי קומי ר' מני"),
               E("MR_TER", "רבי ראובן בעא קומי רבי מנא")],
  "reasoning": "This is a textual alternative for who asked the question. It does not show two askers. Maaseh Rokeach cites Ketubot and reads Reuven. Noam Yerushalmi reads Avin and Yad Eitan abbreviates ר\"א; both are citing the passage, not independent manuscripts.",
  "confidence": "high",
  "graph_effect": "Turn the asker of c17/c18 into a reading group: Reuven (Ketubot: Venice, Guggenheimer) or Abun/Avin (Ketubot: Mechon-Mamre; Yevamot: all). Use one asks-edge with alternative subjects; do not create two asks-edges or merge Reuven with Abun."},
 {"finding_id": "F16", "kind": "interpretation",
  "claim": "Most Yerushalmi commentators read Mana's answer rhetorically: 'Be quiet, it is better for you. She eats, and her slaves would not eat?!' On this reading her slaves may eat terumah.",
  "evidence": [E("KH_KET", "ועבדיה אינן אוכלין. בתמיה הרי אין הפסול בעבדים אלא בה וכיון שהיא אוכלת עבדיה מיבעיא"),
               E("PM_YEV", "שתוק ויפה לך. שתיקותיך דמהיכי תיתי לא יאכלו דהרי היא אוכלת דלאו חללה היא"),
               E("PM_YEV", "ועבדי' אינן אוכלין. בתמי' והא קי\"ל קנין האוכל מאכיל"),
               E("STEY_YEV", "פי' בתמיה (כפירוש ק\"ע ודלא כרמב\"ם פ\"ז ה\"כ מתרומות שפירש בניחותא)."),
               E("NOAM_YEV", "משא\"כ הכא בשניות שהיא אוכלת ע\"כ לא שייך קנס בעבדים")],
  "reasoning": "My translation of the text: 'He said to him: be silent and it is good for you. She eats, and her slaves do not eat?' Korban HaEdah and Penei Moshe mark the last clause בתמיה, a rhetorical question. The logic: the disqualification is in her, not in the slaves; she herself eats, so certainly her slaves do. 'Be silent' dismisses the question as not worth asking. Noam Yerushalmi reaches the same result (no penalty applies to the slaves).",
  "confidence": "medium",
  "graph_effect": "Mana answers the asker (the speech-act edge is secure). Content branch A: the slaves may eat. Mana's 'be silent' is a dismissive answer, not evidence of a teacher, student or hostile relationship."},
 {"finding_id": "F17", "kind": "interpretation",
  "claim": "A competing reading takes Mana's answer as a statement: she eats, but her slaves (the melog slaves she brought into the marriage) do not. This is how Maimonides rules. Commentators tie that ruling to this Yerushalmi, and Guggenheimer's translation follows it.",
  "evidence": [E("RAMBAM_TER", "נָשָׂא שְׁנִיָּה הִיא אוֹכֶלֶת וְעַבְדֵי מְלוֹג שֶׁלָּהּ לֹא יֹאכְלוּ"),
               E("SK_KET", "ול\"נ דרמב\"ם מפרש היא אוכלת ועבדיה אינן אוכלין בניחותא"),
               E("MR_TER", "ומכאן נראה פשוט שהוציאו רבינו"),
               E("YE_TER", "משמע דהיא וכן עבדי צאן ברזל פשיטא דאוכלין רק בעבדי נכסי מלוג ל\"א"),
               E("KM_TER", "איני יודע מניין לנו בנשואה ממש לומר כן"),
               E("YEV_GUG_EN", "Since the husband has no obligation to feed her and her slaves, the acquisition is not complete and the slaves cannot eat from what the Cohen does not have to give them"),
               E("KET_GUG_EN", "She eats but her slaves do not eat.")],
  "reasoning": "Maimonides does not cite the Yerushalmi. Kessef Mishneh did not know the source. Sheyarei Korban, Maaseh Rokeach and Yad Eitan propose this passage as the source, read as a plain statement. Sha'arei Torat Eretz Yisrael says explicitly that the rhetorical reading is 'not like Rambam'. Maaseh Rokeach and Yad Eitan split the slaves into two kinds: the husband-owned (tzon barzel) slaves obviously eat, and only her own melog slaves do not. That split is their reading; Mana's words do not make it. Guggenheimer's translation is declarative, and the accompanying note explains it by Maimonides and Radbaz.",
  "confidence": "medium",
  "graph_effect": "Content branch B: melog slaves may not eat. c18's note ('rhetorical, not a ruling barring the slaves') should become a reading group: A (rhetorical: Korban HaEdah, Penei Moshe, Sha'arei Torat Eretz Yisrael; result also in Noam Yerushalmi) against B (declarative: Maimonides as read by Sheyarei Korban, Maaseh Rokeach and Yad Eitan; Guggenheimer's translation). Neither branch changes the people edges."},
 {"finding_id": "F18", "kind": "textual",
  "claim": "Guggenheimer's English for Ketubot 11:7:3-8 is not an independent translation of the Guggenheimer Ketubot Hebrew. The edition's own note says the passage repeats Yevamot 9:4. In places the English follows Yevamot readings that the Ketubot Hebrew lacks.",
  "evidence": [E("KET_GUG_EN", "From here to the end of the Halakhah, this is Halakhah"),
               E("KET_GUG_EN", "We have also stated so: A man defiles himself"),
               E("KET_GUG_HE", "וְתַנִּי רִבִּי חִיָיא כֵן."),
               E("KET_GUG_EN", "Samuel said, one does not force, only disqualify.")],
  "reasoning": "The English leaves out R. Hiyya's name even though the Ketubot Hebrew prints it, and it includes the Yevamot-only Shmuel line. Yet it keeps 'Rebbi Reuben' and 'my teacher', which match the Ketubot Hebrew. So it is a hybrid. The Ketubot English footnotes 41-42 in 11:7:6 describe heirs deceiving a widow, which does not fit the forced-divorce Mishnah; they appear to be footnotes that were attached in the wrong place.",
  "confidence": "high",
  "graph_effect": "Do not use Guggenheimer's Ketubot English to corroborate or deny a name (Hiyya, Reuven) or a line in the Ketubot Hebrew. For readings, cite the Hebrew versions."},
 {"finding_id": "F19", "kind": "interpretation",
  "claim": "Only the Yevamot parallel contains 'ומר שמואל אכרזון בקרויבון', and commentators disagree on it. Korban HaEdah reads it as Shmuel telling his students to announce in the towns. Penei Moshe reads the last word as a place name.",
  "evidence": [E("YEV_GUG_HE", "וָמַר שְׁמוּאֵל. אַכְרְזוֹן בְּקִרְוֵיכוֹן."),
               E("KH_YEV", "ואמר שמואל לתלמידיו הכריזו בעיירות גט מעושה פסול ופוסל לכהונה"),
               E("PM_YEV", "ואמר שמואל אכרזון בקרויבון. שם מקום")],
  "reasoning": "This line is not in the focal Ketubot passage. The 'students' in Korban HaEdah are a commentary expansion; the text has only a plural imperative.",
  "confidence": "medium",
  "graph_effect": "No edge in the Ketubot graph. If the Yevamot parallel is graphed, an addresses(Shmuel → unnamed audience) edge is text-based. Calling that audience 'his students' comes from Korban HaEdah, not the text."}
]

ALTS = [
 {"id": "A1", "topic": "Second רבי after Hila's name (11:7:4)",
  "readings": [
   {"reading": "'Rabbi Hila, my teacher': the second רבי is a title in Yose's own voice", "held_by": "Ketubot text, Venice and Guggenheimer Hebrew; Guggenheimer's Ketubot English; Korban HaEdah ('רבו'). Same formula elsewhere (JT Shabbat 9:3:4, Guggenheimer 'my teacher')", "support": "strong within Ketubot"},
   {"reading": "No teacher word: 'Rabbi Hila said to me'", "held_by": "Mechon-Mamre Ketubot; Yevamot 9:4 in Guggenheimer Hebrew, Venice and Mechon-Mamre; Penei Moshe and Noam Yerushalmi on Yevamot", "support": "strong in the parallel"}],
  "evidence": [E("KET_VEN", "הוה רבי הילא רבי אמר לי"), E("YEV_VEN", "הויא רבי אילה אמר לי")]},
 {"id": "A2", "topic": "'ותני רבי חייא כן' (11:7:4)",
  "readings": [
   {"reading": "Support: the baraita agrees ('disqualified' means disqualified by Torah law)", "held_by": "Korban HaEdah (alternative reading, both commentaries); Mareh HaPanim; Noam Yerushalmi; Guggenheimer English", "support": "moderate"},
   {"reading": "Rhetorical objection: the baraita says he does not become impure for a disqualified wife", "held_by": "Penei Moshe (Yevamot); Korban HaEdah (first reading)", "support": "moderate"}],
  "evidence": [E("KH_KET", "ובברייתא דר\"ח לא תני כן ל\"א ותניא נמי הכי בשם ר\"ח")]},
 {"id": "A3", "topic": "'לא בגין דא אמר שמואל' (11:7:6)",
  "readings": [
   {"reading": "Emend to 'בגין דא אמר שמואל כגון': 'such as' includes rabbinic prohibitions", "held_by": "Korban HaEdah on Ketubot", "support": "commentary emendation"},
   {"reading": "Emend to 'לא כגון אמר שמואל?': rhetorical question, same result", "held_by": "Korban HaEdah on Yevamot; Guggenheimer's English matches ('Did he not say “for example”?')", "support": "commentary emendation"},
   {"reading": "As printed: Shmuel did not speak to exclude שניות (they are also 'disqualified'), but to exclude the 'he shall divorce' cases", "held_by": "Penei Moshe on Yevamot", "support": "no emendation needed"}],
  "evidence": [E("KET_GUG_HE", "לָא בְגִין דָּא אָמַר שְׁמוּאֵל."), E("GIT_VEN", "והתנינן שניות לא בגין אמר שמואל")]},
 {"id": "A4", "topic": "Mana's answer about slaves (11:7:5)",
  "readings": [
   {"reading": "Rhetorical: she eats, so of course her slaves eat", "held_by": "Korban HaEdah; Penei Moshe; Sha'arei Torat Eretz Yisrael; result also in Noam Yerushalmi", "support": "majority of Yerushalmi commentaries checked"},
   {"reading": "Declarative: she eats, but her (melog) slaves do not", "held_by": "Maimonides, Heave Offerings 7:20, as understood by Sheyarei Korban, Maaseh Rokeach and Yad Eitan; Guggenheimer translation and note", "support": "the codified ruling"}],
  "evidence": [E("STEY_YEV", "פי' בתמיה (כפירוש ק\"ע ודלא כרמב\"ם פ\"ז ה\"כ מתרומות שפירש בניחותא).")]},
 {"id": "A5", "topic": "Asker of R. Mana (11:7:5)",
  "readings": [
   {"reading": "R. Reuven", "held_by": "Ketubot: Venice, Guggenheimer Hebrew and English; Maaseh Rokeach citation", "support": "Ketubot print"},
   {"reading": "R. Abun / Avin", "held_by": "Ketubot: Mechon-Mamre; Yevamot 9:4: all three versions; Noam Yerushalmi; Yad Eitan (ר\"א)", "support": "parallel"}],
  "evidence": [E("KET_MM", "ר' אבון בעא קומי ר' מנא")]},
 {"id": "A6", "topic": "Unqualified R. Yose (11:7:4) and Yose Tsaydaniya (11:7:3)",
  "readings": [
   {"reading": "Distinct persons", "held_by": "Guggenheimer names them differently; no commentary checked links them", "support": "default; not proven"},
   {"reading": "Same person resumed", "held_by": "Possible from adjacency and the 'recite your teaching' instruction (my inference; no source asserts it)", "support": "weak"}],
  "evidence": [E("SHAB_GUG_EN", "Rebbi Yose said, my teacher Rebbi Zeˋira always was saying to me")]},
 {"id": "A7", "topic": "Meaning of the epithet צידונייא / ציידנייה",
  "readings": [
   {"reading": "'from Sidon'", "held_by": "Korban HaEdah (first option); Guggenheimer", "support": "moderate"},
   {"reading": "'trap-maker' (occupation)", "held_by": "Korban HaEdah (second option)", "support": "possible"}],
  "evidence": [E("KH_KET", "מצידון היה א\"נ אומן לעשות מצודות")]}
]

UNRESOLVED = [
 "Whether the teacher word (רבי after הילא) is original in Ketubot or a harmonizing addition. I checked printed and digital texts only, not the Leiden manuscript or Genizah fragments.",
 "Whether the unqualified R. Yose of 11:7:4 is Yose Tsaydaniya, or the R. Yose(h) who reports R. Zeira as 'my teacher' in JT Shabbat 9:3:4. Neither is established here.",
 "Which R. Hiyya is named in the Ketubot reading 'ותני רבי חייא כן'. The name is absent in the Yevamot parallel.",
 "Whether the asker of R. Mana was R. Reuven or R. Abun. This is a textual alternative, not settled.",
 "Whether Guggenheimer's identification of Yose Tsaydaniya with the Bavli's Rav Yosef Tsidoni is right. It is not tested here.",
 "Whether the Hila of 11:7:4 is the same as the 'R. Zeira and R. Hila' of 11:7:8 in the same halakhah. It is plausible from context but not established; I did not examine it.",
 "Not checked: the Leiden manuscript images; Ridbaz on Maimonides (Sefaria returned 404 for 'Radbaz on Mishneh Torah, Heave Offerings 7:20'; this does not mean the commentary does not exist); Chiddushei Ramban on Yevamot 84a (cited by Amudei Yerushalayim); Lieberman's Tosefta Kifshutah on Yevamot 2:4; Rabbenu Hananel directly (known here only through Tosafot)."
]

CORRECTIONS = [
 {"correction_id": "PC1", "existing_claim_id": "c20", "change": "Relabel the coercion statement as restrictive: 'The court does not coerce a divorce except in cases such as widow/High Priest, divorcee or halutzah/ordinary priest.' Anchor it to the second שְׁמוּאֵל (add a mention for that occurrence).", "why": "The text says אין מעשין אלא; the pilot label dropped the exclusive force, which is what the following objection targets (F1).", "evidence": [E("KET_GUG_HE", "שְׁמוּאֵל אָמַר. אֵין מְעַשִּׂין אֶלָּא כְגוֹן")]},
 {"correction_id": "PC2", "existing_claim_id": None, "change": "Add the missing argument steps. (1) The anonymous voice challenges Shmuel from Mishnah Yevamot 9:3 (שניות are coerced). (2) The anonymous voice defends Shmuel: 'such as' covers them, with the reading group of A3. (3) The anonymous voice challenges from Mishnah Ketubot 7:1 (המדיר). (4) The anonymous voice answers that 'he shall divorce' does not imply coercion, which supports Shmuel's restriction.", "why": "The previous review found these steps missing; F2-F4.", "evidence": [E("KET_GUG_HE", "וְהָא תַנִּינָן. שְׁנִיּוֹת. לָא בְגִין דָּא אָמַר שְׁמוּאֵל.")]},
 {"correction_id": "PC3", "existing_claim_id": "c21", "change": "Change predicate from 'asks' to 'answers/defends' (a rhetorical reply supporting Shmuel), not an open question.", "why": "Korban HaEdah, Penei Moshe and Guggenheimer all read שמענו שכופין as a rhetorical question (F4).", "evidence": [E("KH_KET", "וכי שמענו ממתני' שכופין אותו בתמיה")]},
 {"correction_id": "PC4", "existing_claim_id": "m15 / entity anon", "change": "Retype the 'unnamed argumentative voice' as the anonymous talmudic (editorial) voice citing a Mishnah ('תנינן' = 'we learned'), not a group of people. Use it as the subject of the challenge and answer claims in PC2.", "why": "F2. The grammatical first-person plural refers to the learned tradition, not to a set of persons.", "evidence": [E("KET_GUG_HE", "וְהָא תַנִּינָן. הַמַדִּיר")]},
 {"correction_id": "PC5", "existing_claim_id": "c13", "change": "Keep student_of(yose, hila) and mark it basis = explicit first-person title in the Ketubot reading (not a later inference). Add a variant flag: absent in Mechon-Mamre Ketubot and in all Yevamot 9:4 versions. Add a mention for the second רִבִּי. Set c12/c14 time_scope to habitual ('בכל שעה').", "why": "F6-F8. The job asks to keep Yose's explicit 'my teacher'; the variant must travel with it.", "evidence": [E("KET_GUG_HE", "הַוָה רִבִּי הִילָא רִבִּי אָמַר לִי"), E("YEV_GUG_HE", "הַוְיָא רִבִּי הִילָא אָמַר לִי")]},
 {"correction_id": "PC6", "existing_claim_id": "c16 (and c15)", "change": "Replace 'supports' with a reading group (supports | challenges). Note that R. Hiyya's name appears only in Ketubot; the Yevamot parallel reads 'וְתַנִּי כֵן'.", "why": "F10.", "evidence": [E("YEV_GUG_HE", "וְתַנִּי כֵן.")]},
 {"correction_id": "PC7", "existing_claim_id": "c17, c18, entity reuven", "change": "Make the asker a textual alternative: R. Reuven or R. Abun/Avin. Do not merge the two names, and do not create two separate askers.", "why": "F15.", "evidence": [E("YEV_VEN", "רבי אבון בעא קומי רבי מנא")]},
 {"correction_id": "PC8", "existing_claim_id": "c18 / entity slave_answer", "change": "Relabel slave_answer ('Be silent; it is better for you. She eats, and her slaves do not eat') and add reading group A4: rhetorical (the slaves eat) against declarative (melog slaves do not eat), preserving who holds which.", "why": "The pilot entity label ('if she eats, would her slaves not eat?') builds in one reading; Maimonides' tradition and Guggenheimer read it as a statement (F16-F17).", "evidence": [E("SK_KET", "ול\"נ דרמב\"ם מפרש היא אוכלת ועבדיה אינן אוכלין בניחותא")]},
 {"correction_id": "PC9", "existing_claim_id": "c10", "change": "Re-type c10: the recited baraita ('he is entitled to her finds, earnings and vow-annulment') contradicts Yirmeya's view. Yose Tsaydaniya is its reciter (keep c9), not the holder of a personal opposing opinion.", "why": "F11. Korban HaEdah: 'ברייתא ... והיא קשיא על ר' ירמיה'.", "evidence": [E("KH_KET", "ברייתא לפני ר' ירמיה והיא קשיא על ר' ירמיה")]},
 {"correction_id": "PC10", "existing_claim_id": "entity yose_sid, coreference candidate for m34", "change": "Relabel as 'R. Yose Tsaydaniya (epithet: of Sidon or trap-maker)'. Keep separate from the 11:7:4 Yose, and keep the coreference candidate open with the evidence in F13. Add Guggenheimer's cross-corpus candidate (Rav Yosef Tsidoni, BT Ketubot 46a) only as a provisional historical-identity proposal.", "why": "F12-F14.", "evidence": [E("KH_KET", "מצידון היה א\"נ אומן לעשות מצודות")]},
 {"correction_id": "PC11", "existing_claim_id": None, "change": "Minor: add the legal content of the quoted Mishnah Ketubot 7:1 (up to 30 days: appoint a provider; after that: divorce and pay the ketubah). These are generic legal roles, not historical persons.", "why": "The previous review noted it; the content matters for F4's argument.", "evidence": [E("KET_GUG_HE", "עַד שְׁלֹשִׁים יוֹם יַעֲמִיד פַּרְנָס. יוֹתֵר מִיכֵּן יוֹצִיא וְיִתֵּן כְּתוּבָּה.")]}
]

LESSONS = [
 "A title embedded in an address formula ('X רבי אמר לי' = 'my teacher X said to me') is a first-person relationship claim. It should be recorded as explicit, with the variant witnesses that carry or lack the word attached to the edge.",
 "'תני X קומי Y ופליג על Y' records that X recites a baraita before Y and the baraita contradicts Y. Model it as recites_before(X, Y) plus contradicts(baraita, Y's view), not as a personal dispute.",
 "Restrictive rules (אין ... אלא) need a polarity or scope field. Otherwise a label silently turns 'only in these cases' into 'in these cases'.",
 "The anonymous talmudic voice (והא תנינן / ומשני) needs its own node type, distinct from 'group of people'. Its challenge and answer steps should be claims, so that the argument around a named sage's rule is not flattened.",
 "Rhetorical versus declarative readings (בתמיה / בניחותא) can reverse the legal content without changing the speech-act edges. Store them as branches on the content, with who-holds-what.",
 "Commentary emendations (ה\"ג, צ\"ל) are a different evidence type from print or manuscript variants. A translation that silently follows an emendation should be tagged as such.",
 "A parallel sugya (here JT Yevamot 9:4, Gittin 9:9) is a separate textual witness, but its translation by the same editor, reused for the focal passage, is not independent corroboration.",
 "A variant name for the same speaking slot (Reuven / Abun) is one asks-edge with alternative subjects, not two edges.",
 "An editor's cross-corpus identification (Yose Tsaydaniya = Rav Yosef Tsidoni) is a historical-identity proposal and must stay separate from local coreference."
]

def main():
    bad = []
    def exact_span(q, texts):
        # Recover the exact source bytes when a typed quote differs only in combining-mark order.
        nq = unicodedata.normalize("NFD", q)
        for t in texts:
            if nq not in unicodedata.normalize("NFD", t): continue
            for i in range(len(t)):
                if unicodedata.combining(t[i]): continue
                for j in range(i + max(1, len(q) - 6), min(len(t), i + len(q) + 6) + 1):
                    if unicodedata.normalize("NFD", t[i:j]) == nq:
                        while j < len(t) and unicodedata.combining(t[j]): j += 1
                        if unicodedata.normalize("NFD", t[i:j]) == nq: return t[i:j]
        return None
    def check(evs, where):
        for ev in evs:
            s = SID[ev["source_id"]]
            texts = texts_of(s)
            if any(ev["exact_quote"] in t for t in texts): continue
            span = exact_span(ev["exact_quote"], texts)
            if span: ev["exact_quote"] = span
            else: bad.append((where, ev["source_id"], ev["exact_quote"]))
    for f in FINDINGS: check(f["evidence"], f["finding_id"])
    for a in ALTS: check(a["evidence"], a["id"])
    for c in CORRECTIONS: check(c["evidence"], c["correction_id"])
    if bad:
        for b in bad: print("QUOTE NOT FOUND:", b)
        sys.exit(1)
    fails = [e for e in json.load(open("sources/fetch_log.json")) if "error" in e]
    dossier = {
        "job_id": "random-yerushalmi-05",
        "focal_ref": "Jerusalem Talmud Ketubot 11:7:4",
        "status": "researched",
        "question": "Recover restrictive אין מעשין אלא in Shmuel coercion rule and objection about secondary prohibited marriages. Preserve Yose explicitly calling Hila my teacher. Investigate Yose of Sidon versus unqualified Yose without assuming identity. Interpret Mana rhetorical slave answer.",
        "scope_checked": "JT Ketubot 11:7 in three Hebrew versions on Sefaria (Guggenheimer, Venice, Mechon-Mamre) and Guggenheimer's English. The parallels JT Yevamot 9:4 and JT Gittin 9:9 (same versions). JT Shabbat 9:3:4 and JT Nazir 7:3-7:4 for the formulas. Commentaries: Penei Moshe, Korban HaEdah, Sheyarei Korban, Amudei Yerushalayim (Ketubot and Yevamot), Mareh HaPanim, Noam Yerushalmi and Sha'arei Torat Eretz Yisrael (Yevamot). Related sources: Tosefta Yevamot 2:4; Mishnah Yevamot 9:3, Ketubot 7:1, Gittin 9:8, Ketubot 11:6; Maimonides, Heave Offerings 7:20 with Kessef Mishneh, Maaseh Rokeach, Yad Eitan and Ben Aryeh; Maimonides, Mourning 2:9; Tosafot Ketubot 70a; Bavli Ketubot 46a; Sefaria exact-phrase searches. No manuscripts were checked. Translations marked 'My translation' are this dossier's own brief renderings.",
        "sources": SOURCES,
        "fetch_failures_and_empty_responses": [
            {"url": e["url"], "fetched_at": e["fetched_at"], "error": e["error"],
             "note": "A failed request is not evidence that the work does not exist."} for e in fails
        ] + [{"query": "יוסף צדוני", "note": "Exact search returned 0 hits; the empty response file was not kept."},
             {"query": "צידנאה", "note": "Exact search returned 0 hits; the empty response file was not kept."},
             {"note": "Exact-phrase search on Sefaria misses vocalized texts; 'no hit' in a search is not absence from the corpus."}],
        "findings": FINDINGS,
        "alternative_readings": ALTS,
        "unresolved": UNRESOLVED,
        "proposed_corrections": CORRECTIONS,
        "ontology_lessons": LESSONS,
    }
    json.dump(dossier, open("dossier.json", "w"), ensure_ascii=False, indent=1)
    print("ok", len(FINDINGS), "findings,", len(SOURCES), "sources")

main()
