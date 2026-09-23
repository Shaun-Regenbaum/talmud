"""Build dossier.json for random-yerushalmi-04 and check every quote against the saved bytes."""
import hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", ".."))
LOG = {e["name"]: e for e in json.load(open(os.path.join(HERE, "sources", "fetch_log.json")))}

GUG_HE = "The Jerusalem Talmud, edition by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015"
GUG_EN = "The Jerusalem Talmud, translation and commentary by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015"

# source_id -> (saved file name, edition label)
FETCHED = {
    "VERSIONS": ("jt_peah_versions.json", "Sefaria version list for Jerusalem Talmud Peah"),
    "VEN33": ("jt_peah_3_3_venice_he.json", "Venice Edition (Sefaria), JT Peah 3:3"),
    "VEN34": ("jt_peah_3_4_venice_he.json", "Venice Edition (Sefaria), JT Peah 3:4"),
    "GUGHE33": ("jt_peah_3_3_guggenheimer_he.json", GUG_HE + ", JT Peah 3:3"),
    "GUGHE34": ("jt_peah_3_4_guggenheimer_he.json", GUG_HE + ", JT Peah 3:4"),
    "MM33": ("jt_peah_3_3_mechon_mamre_he.json", "Mechon-Mamre (Sefaria), JT Peah 3:3"),
    "MM34": ("jt_peah_3_4_mechon_mamre_he.json", "Mechon-Mamre (Sefaria), JT Peah 3:4"),
    "GUGEN33": ("jt_peah_3_3_guggenheimer_en.json", GUG_EN + ", JT Peah 3:3, with notes"),
    "GUGEN34": ("jt_peah_3_4_guggenheimer_en.json", GUG_EN + ", JT Peah 3:4, with notes"),
    "FR33": ("jt_peah_3_3_schwab_fr.json", "Le Talmud de Jérusalem, traduit par Moise Schwab, 1878-1890, JT Peah 3:3"),
    "FR34": ("jt_peah_3_4_schwab_fr.json", "Le Talmud de Jérusalem, traduit par Moise Schwab, 1878-1890, JT Peah 3:4"),
    "COM33": ("jt_peah_3_3_community_en.json", "Sefaria Community Translation request, JT Peah 3:3 (returned no text; version locked)"),
    "COM34": ("jt_peah_3_4_community_en.json", "Sefaria Community Translation request, JT Peah 3:4 (returned no text; version locked)"),
    "LINKS33": ("jt_peah_3_3_links.json", "Sefaria links for JT Peah 3:3"),
    "LINKS34": ("jt_peah_3_4_links.json", "Sefaria links for JT Peah 3:4"),
    "PM33": ("comm_penei_moshe_jt_peah_3_3.json", "Penei Moshe on JT Peah 3:3 (Piotrków, 1898-1900)"),
    "PM34": ("comm_penei_moshe_jt_peah_3_4.json", "Penei Moshe on JT Peah 3:4 (Piotrków, 1898-1900)"),
    "SIR33": ("comm_sirilio_jt_peah_3_3.json", "Sirilio on JT Peah 3:3 (Jerusalem, 1934-1967)"),
    "SIR34": ("comm_sirilio_jt_peah_3_4.json", "Sirilio on JT Peah 3:4 (Jerusalem, 1934-1967)"),
    "MHP33": ("comm_mareh_hapanim_jt_peah_3_3.json", "Mareh HaPanim on JT Peah 3:3 (Piotrków, 1898-1900)"),
    "MHP34": ("comm_mareh_hapanim_jt_peah_3_4.json", "Mareh HaPanim on JT Peah 3:4 (Piotrków, 1898-1900)"),
    "TRID33": ("comm_tosafot_harid_jt_peah_3_3.json", "Tosafot HaRid on JT Peah 3:3 (Piotrków, 1898-1900)"),
    "OLY33": ("comm_ohr_layesharim_jt_peah_3_3.json", "Ohr LaYesharim on JT Peah 3:3 (Machon HaYerushalmi, R. Yehoshua Buch, 2021)"),
    "OLY34": ("comm_ohr_layesharim_jt_peah_3_4.json", "Ohr LaYesharim on JT Peah 3:4 (Machon HaYerushalmi, R. Yehoshua Buch, 2021)"),
    "STEY33": ("comm_shaarei_torat_eretz_yisrael_jt_peah_3_3.json", "Sha'arei Torat Eretz Yisrael on JT Peah 3:3 (Jerusalem, 1940)"),
    "STEY_BER8": ("comm_shaarei_torat_eretz_yisrael_jt_berakhot_8.json", "Sha'arei Torat Eretz Yisrael on JT Berakhot 8 (Jerusalem, 1940)"),
    "RIDBAZ33": ("comm_chiddushei_ridbaz_jt_peah_3_3.json", "Chiddushei Ridbaz on JT Peah 3:3 (Piotrków, 1898-1900)"),
    "RIDBAZ34": ("comm_chiddushei_ridbaz_jt_peah_3_4.json", "Chiddushei Ridbaz on JT Peah 3:4 (Piotrków, 1898-1900)"),
    "GRA33": ("comm_beur_hagra_jt_peah_3_3.json", "Beur HaGra on JT Peah 3:3 (Piotrków, 1898-1900)"),
    "GRA34": ("comm_beur_hagra_jt_peah_3_4.json", "Beur HaGra on JT Peah 3:4 (Piotrków, 1898-1900)"),
    "YAFEM34": ("comm_haggahot_yafem_jt_peah_3_4.json", "Haggahot YaFeM on JT Peah 3:4 (Piotrków, 1898-1900)"),
    "MISH": ("mishnah_peah_3_4-5.json", "Mishnah Peah 3:4-5, Torat Emet 357 (Hebrew) and Mishnah Yomit by Dr. Joshua Kulp (English)"),
    "BART": ("bartenura_mishnah_peah_3_4-5.json", "Bartenura on Mishnah Peah 3:4-5 (Torat-Emet)"),
    "RAMBAM_COMM": ("rambam_comm_mishnah_peah_3.json", "Rambam, Commentary on Mishnah Peah 3 (Vilna Edition)"),
    "MT22": ("mt_gifts_poor_2_2.json", "Mishneh Torah, Gifts to the Poor 2:2 (Torat Emet 363; Touger translation)"),
    "MT3": ("mt_gifts_poor_3_10-20.json", "Mishneh Torah, Gifts to the Poor 3:10-20 (Torat Emet 363; Touger translation)"),
    "TOS_MM": ("tosefta_peah_1.json", "Tosefta Peah 1 (Machon Mamre)"),
    "TOSL": ("tosefta_peah_lieberman_1_9-11.json", "Tosefta Peah (Lieberman) 1:9-11, codex Vienna, JTS 2001"),
    "MHT9": ("masoret_hatosefta_peah_1_9.json", "Masoret HaTosefta on Peah 1:9 (JTS 2001)"),
    "MHT11": ("masoret_hatosefta_peah_1_11.json", "Masoret HaTosefta on Peah 1:11 (JTS 2001)"),
    "TK": ("tosefta_kifshutah_peah_1_10-11.json", "Tosefta Kifshutah on Peah 1:10-11 (JTS 2001)"),
    "NED": ("bavli_nedarim_43b-44a.json", "Bavli Nedarim 43b-44a, William Davidson Edition"),
    "VEN31": ("jt_peah_3_1_venice_he.json", "Venice Edition (Sefaria), JT Peah 3:1"),
    "VEN32": ("jt_peah_3_2_venice_he.json", "Venice Edition (Sefaria), JT Peah 3:2"),
    "GUGEN312": ("jt_peah_3_1-2_guggenheimer_en.json", GUG_EN + ", JT Peah 3:1-2"),
    "BER81": ("jt_berakhot_8_1_venice_he.json", "Venice Edition (Sefaria), JT Berakhot 8:1"),
    "BER28V": ("jt_berakhot_2_8_venice_he.json", "Venice Edition (Sefaria), JT Berakhot 2:8"),
    "BER28E": ("jt_berakhot_2_8_guggenheimer_en.json", GUG_EN + ", JT Berakhot 2:8"),
    "JAS1": ("jastrow_purgara.json", "Jastrow Dictionary via Sefaria words API, פּוּרְגָּרָה"),
    "JAS2": ("jastrow_tsumachta.json", "Jastrow Dictionary via Sefaria words API, צוּמַחְתָּה"),
    "SEARCH": ("search_bun_bar_hiyya_yerushalmi.json", "Sefaria search API, exact phrase 'בון בר חייא' in Talmud/Yerushalmi (first 60 hits)"),
}

LOCAL = {
    "IN": ("research/sage-network/pilot/inputs/random-yerushalmi-04.json", "Pilot input package (segments s1-s5, Venice Edition as captured 2026-09-20)"),
    "PREV_OUT": ("research/sage-network/pilot/outputs/random-yerushalmi-04.json", "Earlier pilot reading (passage-pilot-v1)"),
    "PREV_REV": ("research/sage-network/followup-v1/cases/random-yerushalmi-04/previous-review.json", "Earlier independent review, copied unchanged"),
}


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for x in obj:
            yield from strings(x)
    elif isinstance(obj, dict):
        for x in obj.values():
            yield from strings(x)


def searchable(path):
    """Return text variants of a saved file for exact-quote checks."""
    raw = open(path, encoding="utf-8").read()
    data = json.loads(raw)
    out = []
    for s in strings(data):
        out.append(re.sub(r"<[^>]+>", "", s))
        body = re.sub(r'<sup class="footnote-marker">.*?</sup>', "", s)
        body = re.sub(r'<i class="footnote">.*?</i>', "", body)
        out.append(re.sub(r"<[^>]+>", "", body))
    return "\n".join(out)


sources, cache = [], {}
for sid, (rel, ed) in LOCAL.items():
    p = os.path.join(ROOT, rel)
    sources.append({"source_id": sid, "url": None, "input_path": rel + " (relative to the repository root)", "edition": ed,
                    "fetched_at": None, "saved_file": rel, "sha256": sha(p)})
    cache[sid] = p
for sid, (name, ed) in FETCHED.items():
    e = LOG[name]
    p = os.path.join(HERE, "sources", name)
    h = sha(p)
    assert h == e["sha256"], (name, "hash drift")
    src = {"source_id": sid, "url": e["url"], "input_path": None, "edition": ed, "fetched_at": e["fetched_at"],
           "saved_file": "sources/" + name, "sha256": h}
    if "post_body" in e:
        src["request_body"] = e["post_body"]
    sources.append(src)
    cache[sid] = p

failures = [{"url": e["url"], "fetched_at": e["fetched_at"], "result": e["status"],
             "note": "No text obtained from this request. This does not show that the commentary does not exist."}
            for e in LOG.values() if e["status"] != 200]
failures += [
    {"url": LOG["jt_peah_3_3_community_en.json"]["url"], "fetched_at": LOG["jt_peah_3_3_community_en.json"]["fetched_at"],
     "result": "200 with empty versions list (the Community Translation version is listed as locked)",
     "note": "No community English text was read for 3:3."},
    {"url": LOG["jt_peah_3_4_community_en.json"]["url"], "fetched_at": LOG["jt_peah_3_4_community_en.json"]["fetched_at"],
     "result": "200 with empty versions list (the Community Translation version is listed as locked)",
     "note": "No community English text was read for 3:4."},
    {"url": LOG["tosefta_peah_1.json"]["url"], "fetched_at": LOG["tosefta_peah_1.json"]["fetched_at"],
     "result": "200; the baraita wording 'אף על פי שאינן מתקיימות' was not found in the Tosefta Peah 1 text read (Machon Mamre) nor in Lieberman 1:9-11",
     "note": "Only these portions were checked. The baraita may exist elsewhere or in another wording."},
    {"url": LOG["jt_berakhot_8_1_venice_he.json"]["url"], "fetched_at": LOG["jt_berakhot_8_1_venice_he.json"]["fetched_at"],
     "result": "200; saved, but the name 'בון בר חייא' does not occur in it",
     "note": "The emendation argument cited by Sha'arei Torat Eretz Yisrael is in its own note on Berakhot 8 (STEY_BER8) and relies on JT Berakhot 2:8 (BER28V)."},
]

E = lambda sid, q: {"source_id": sid, "exact_quote": q}

findings = [
 {"finding_id": "F1", "kind": "textual",
  "claim": "The Mishnah (3:3:1 in Sefaria's layout; Mishnah Peah 3:4) opens with an UNATTRIBUTED ruling that mother onions are liable for peah. Rabbi Yose disagrees and exempts them. The liable voice is the anonymous first voice of the Mishnah. The text does not call it 'the Sages' here.",
  "evidence": [E("VEN33", "האמהות של בצלים חייבות בפיאה ר' יוסי פוטר"), E("MISH", "הָאִמָּהוֹת שֶׁל בְּצָלִים חַיָּבוֹת בְּפֵאָה, וְרַבִּי יוֹסֵי פּוֹטֵר"),
               E("GUGEN33", "Mother onions are subject to peah, Rebbi Yose frees."), E("PM33", "וטעמ' דת\"ק דמחייב")],
  "reasoning": "My translation: 'Mother onions are liable for peah; Rabbi Yose exempts.' Two rulings with opposite polarity. Penei Moshe names the liable voice ת\"ק (the first, anonymous tanna). The earlier reading kept only Rabbi Yose's exemption.",
  "confidence": "high",
  "graph_effect": "Add a statement 'mother onions are liable' held by an unnamed Mishnah voice, not the group חכמים. Rabbi Yose opposes it and holds 'exempt'. His exemption is a response, not a standalone rule."},
 {"finding_id": "F2", "kind": "textual",
  "claim": "The one-versus-many peah rule for onion beds: Rabbi Yose says peah must be given from each bed separately. The Sages say one peah, taken from one bed, covers all of them.",
  "evidence": [E("VEN33", "מלבנות הבצלי' שבין הירק ר' יוסי אומר פיאה מכל אחד ואחד וחכמים אומרים מאחד על הכל"),
               E("GUGEN33", "Rectangles of onions among vegetables, Rebbi Yose says peah from each single one, but the Sages say from one for everything"),
               E("MT3", "וְכֵן מַלְבְּנוֹת הַבְּצָלִים שֶׁבֵּין הַיָּרָק נוֹתֵן פֵּאָה אַחַת לְכָל הַבְּצָלִים"),
               E("BART", "וְאֵין הֲלָכָה כְּרַבִּי יוֹסֵי")],
  "reasoning": "My translation: 'Onion beds among vegetables: Rabbi Yose says peah from each and every one; the Sages say from one for all.' Condition: onion beds separated by vegetables. Count: Rabbi Yose, one peah per bed; the Sages, one peah in total. Maimonides codifies one peah for all. Bartenura says the law does not follow Rabbi Yose. Those are later rulings, not part of the Talmud text.",
  "confidence": "high",
  "graph_effect": "Replace the vague labels 'separate' and 'together' with rule statements that carry a condition and a count. Rabbi Yose holds 'one peah per bed', the Sages hold 'one peah for all beds', with an opposes edge between them. The later codifications are rulings about the dispute, not new speakers inside the passage."},
 {"finding_id": "F3", "kind": "textual",
  "claim": "The chapter's first halakhah states Rabbi Yose's reason for separate peot. People do not usually plant onions among vegetables, so the vegetables divide the onion beds. The Talmud compares this with the House of Shammai. This reason comes from the wider chapter, not from 3:3:3.",
  "evidence": [E("VEN31", "כמה דר' יוסי אמר אין דרך בני אדם להיות מכניסין בצלי' בין הירק"),
               E("GUGEN312", "Just as Rebbi Yose said that people do not usually introduce onions between vegetables"),
               E("SIR33", "מפ' טעמא בריש פירקין משום דאין דרך בני אדם להכניס בין הירק בצלים ומשום הכי מפסיקי")],
  "reasoning": "My translation of the Venice line: 'just as Rabbi Yose said, people do not usually bring onions among vegetables.' Sirilio and Penei Moshe point readers back to this passage for the reason.",
  "confidence": "high",
  "graph_effect": "Add a 'reason for' link from this statement to Rabbi Yose's separate-peah view. It is evidence from 3:1:4 and should be scoped to that segment. The anonymous Talmud voice reports the reason in Rabbi Yose's name. This is not a new speech act at 3:3."},
 {"finding_id": "F4", "kind": "textual",
  "claim": "Rav and Shmuel each give a word for 'mother onions': Rav says פורגרה and Shmuel says צומחתה. The spelling varies by edition. Commentators disagree on whether the two glosses really conflict.",
  "evidence": [E("VEN33", "רב אמר פורגרה ושמואל אמר צומחתה"), E("MM33", "רב אמר פורגדה ושמואל אמר צומחתה"),
               E("PM33", "והיינו הך ולא פליגי אלא בלישנא בעלמא"),
               E("SIR33", "פודגרא. יש גורסין כן וכן גריס ר\"י מסיפונטי ז\"ל"),
               E("SIR33", "ובהנהו מחייבי רבנן דבמאי דקאמר רב אפילו רבנן מודו"),
               E("JAS1", "a sprouting bulb, seed-onion")],
  "reasoning": "Venice and the Guggenheimer Hebrew read פורגרה. Mechon-Mamre reads פורגדה. Sirilio reports the reading פודגרא from R. Yitzhak of Siponto. Penei Moshe and Ohr LaYesharim say the two names refer to the same thing. Sirilio treats them as different objects and says the Sages agree with Rav's case.",
  "confidence": "medium",
  "graph_effect": "Save two separate 'defines term' statements, one each for Rav and Shmuel. An 'opposes' edge between them is a commentary interpretation (Sirilio), not the text; Penei Moshe denies it. Keep the spelling variants as branches of the term, not as different speakers."},
 {"finding_id": "F5", "kind": "textual",
  "claim": "Rabbi Yaakov bar Bun, in the name of Rabbi Hanina, says Rabbi Yose exempted the mother onions only because they are ownerless (hefker). This explains Rabbi Yose's view and is transmitted by one named person from another.",
  "evidence": [E("VEN33", "רבי יעקב בר בון בשם רבי חנינא לא אמר רבי יוסי אלא משום הבקר"),
               E("GUGEN33", "Rebbi Jacob bar Abun in the name of Rebbi Ḥanina: Rebbi Yose said only because of ownerless property"),
               E("PM33", "לא א\"ר יוסי. לפוטרן אלא משום הפקר דהואיל ועושין כן במיעוט מהבצלים אינו מקפיד עליהן ומפקירן")],
  "reasoning": "My translation: 'Rabbi Yose said [it] only because of ownerlessness.' The transmission formula is בשם. It shows attribution, not that the two met. Beur HaGra reports a reading 'לא אמרו' (they said) instead of 'לא אמר רבי יוסי' (see F13).",
  "confidence": "high",
  "graph_effect": "Keep c9 (Yaakov bar Bun reports in the name of Hanina) and c10 (Hanina explains Rabbi Yose's exemption, with ownerlessness as the content). Do not infer teacher and student from בשם alone."},
 {"finding_id": "F6", "kind": "textual",
  "claim": "Rabbi Bun bar Hiyya asks before Rabbi Mana: 'Is ownerless property liable for peah?' The commentators read this as a rhetorical objection. If the mother onions are ownerless, how could the first tanna make them liable?",
  "evidence": [E("VEN33", "רבי בון בר חייא בעי קומי רבי מנא והבקר חייב בפיאה"),
               E("PM33", "והבקר חייב בפאה. בתמיה ולטעמיה דר' יעקב אליבא דר' יוסי פריך דא\"ה מ\"ט דת\"ק דמחייב וכי הפקר חייב בפאה"),
               E("SIR33", "והפקר חייב בפאה. בתמיה כלומר ומ\"ט דת\"ק"),
               E("OLY33", "הרי הפקר פטור מפאה לדעת הכול")],
  "reasoning": "בעי קומי means 'asked before'. The question's force as a challenge to the ownerlessness explanation (F5) is the reading of Penei Moshe, Sirilio and Ohr LaYesharim. Its target is the explanation. It is not a personal clash with Rabbi Yaakov bar Bun, who is not said to be present.",
  "confidence": "high",
  "graph_effect": "Speech edge: Bun bar Hiyya asks, with Rabbi Mana (as printed) as addressee. Add a discourse function 'challenge' aimed at the F5 statement, marked as commentary interpretation. For the addressee's identity see F11."},
 {"finding_id": "F7", "kind": "textual",
  "claim": "The reply 'He said to them: when he acquired them one at a time' names no speaker. Editions disagree on the addressee: 'to them' (plural) in Venice and the Guggenheimer Hebrew, but singular in Mechon-Mamre. The Rome manuscript is reported to read singular 'to him'.",
  "evidence": [E("VEN33", "אמר להן בזכה בהן אחת אחת"), E("GUGHE33", "אָמַר לָהֶן בְּזָכָה בָהֶן אַחַת אַחַת"),
               E("MM33", "א\"ל בזכה בהן אחת אחת"),
               E("OLY33", "אמר להן (צריך לומר כמו בכתב יד רומי: 'ליה') – אמר לו (רבי מנא לרבי בון בר חייא)"),
               E("GUGEN33", "He said to them: When he reacquired them one by one")],
  "reasoning": "My translation: 'He said to them: [the case is] where he acquired them one by one.' The speaker is most naturally the addressee of the question, Rabbi Mana (as printed). Ohr LaYesharim says so explicitly. The Rome reading reaches us only through Ohr LaYesharim; I did not see the manuscript. Mechon-Mamre's א\"ל abbreviation is singular.",
  "confidence": "medium",
  "graph_effect": "Answer edge: Rabbi Mana (as printed) answers Bun bar Hiyya's question, based on local coreference. Keep the addressee as a branch: an unnamed plural group (Venice, Guggenheimer) or Bun bar Hiyya alone (Mechon-Mamre; Rome MS as reported). Merge the duplicate mentions m14 and m15 into one mention with several candidate referents."},
 {"finding_id": "F8", "kind": "interpretation",
  "claim": "Commentators disagree about the case in 'he acquired them one at a time'. Both the owner who acquires the onions and the process are legal scenario roles, not people in history.",
  "evidence": [E("PM33", "הכא במאי עסקינן בזכה בהן אחת אחת אחר ששתלן וגלי דעתיה דלא הפקירן"),
               E("SIR33", "דחוזר וזוכה בהן אחר התלישה רבנן סברי לא הפקירן מעולם וחייבות ור' יוסי סבר נמלך הוא וכבר נפטרו"),
               E("GUGEN33", "If the owner reasserted his right to these onions after they sprouted new growth they are not abandoned property."),
               E("OLY33", "שלדעת התנא החלוק על רבי יוסי הן חייבות בפאה כיוון שחזר וזכה בהן, ולדעת רבי יוסי הן פטורות מפאה כיוון שלא חזר וזכה בכולן יחד"),
               E("RIDBAZ33", "דזכה מעט מעט דהיא פי' אחת אחת והשאר הוי הפקר עדיין")],
  "reasoning": "Penei Moshe: after planting, he took them one by one, which shows he never abandoned them. Sirilio: he reclaims them after pulling. The Sages hold he never abandoned them; Rabbi Yose holds he changed his mind after they were already exempt. Guggenheimer: he reasserted ownership after regrowth. Ohr LaYesharim: he reclaimed them bit by bit after abandoning them. The Ridbaz, reading the Gra: he took a little and the rest stays ownerless, so he holds only a small amount.",
  "confidence": "medium",
  "graph_effect": "Save the reply content as one statement, with an interpretation branch for each commentator. The 'he' who acquires is a generic owner role. Do not create a person node for him."},
 {"finding_id": "F9", "kind": "textual",
  "claim": "The Talmud then cites a baraita (והתני): 'although they do not endure for him in a large quantity, they endure in a small one.' It concludes that the only reason is bringing the onions in for storage. On the reading most commentators give, this moves the dispute away from ownerlessness to whether a small amount stored counts as storage.",
  "evidence": [E("VEN33", "והתני אף על פי שאינן מתקיימות לו במרובה מתקיימות בממועט הוי לית טעמא דלא משום מכניסו לקייום"),
               E("MM33", "והתני אע\"פ שאין מתקיימות לו במרובה מתקיימות לו במועט הוי לית טעמא דלא משום מכניסו לקיום"),
               E("PM33", "והתני. בברייתא אע\"פ וכו' דברי חכמים הן שהשיבו לר' יוסי"),
               E("PM33", "ואין הטעם משום הפקר"),
               E("GUGEN33", "The difference between Rebbi Yose and the Sages is a difference of opinion on matters of agricultural practice rather than on the theory of abandoned property.")],
  "reasoning": "My translation: 'But it was taught: although they do not keep for him in a large [harvest], they keep in a small one. So the reason is only that he brings it in for storage.' No named tanna speaks the baraita. Penei Moshe says its words are the Sages' reply to Rabbi Yose. Guggenheimer's note 76 says 'the reason' is the Sages' reason. Ohr LaYesharim calls it a challenge that rejects the ownerlessness explanation. Mechon-Mamre adds לו and reads במועט; Beur HaGra reads אלא for דלא (see F13).",
  "confidence": "high",
  "graph_effect": "The unnamed argument voice cites a baraita from an unnamed tanna. The content 'storage of a small quantity makes them liable' is attributed, by commentary, to the Sages or first tanna answering Rabbi Yose. The anonymous Talmud voice concludes that the reason is storage. Retarget c14: the anonymous voice challenges the ownerlessness explanation (F5), not Rabbi Yose himself. See F10 for the dissent."},
 {"finding_id": "F10", "kind": "interpretation",
  "claim": "Commentators disagree on whether the baraita overturns or supports the ownerlessness explanation. Penei Moshe and Ohr LaYesharim read it as overturning. The Ridbaz, reading the Gra's Shenot Eliyahu, calls it 'support' and ties the dispute to Rabbi Yose's view on ownerlessness in Nedarim. Tosafot HaRid rejects another commentator's reading of the Gra.",
  "evidence": [E("RIDBAZ33", "וכתב בשנו\"א ז\"ל והא תניא סיוע הוי דלית טעמא אלא משום מכניסו לקיום"),
               E("RIDBAZ33", "דאזיל לטעמי' במס' נדרים (מ\"ד) דס\"ל דאין הפקר יוצא מת\"י הבעלים אלא בזכי'"),
               E("TRID33", "ודבריו נפלאו האיך מפרש סיוע למי הוי סיוע"),
               E("GRA33", "הכי מקשי רבנן לר' יוסי אלמא דטעמא דפליגי אי הוי לקיום מה שמתקיימין לו במיעוט או לא"),
               E("NED", "Rabbi Yosei, who holds that rendering property ownerless is complete only when one takes possession of that property")],
  "reasoning": "In Beur HaGra the Sages challenge Rabbi Yose (מקשי רבנן לר' יוסי), and the dispute turns on whether storing a little counts as storage. The Ridbaz reads the Gra's Shenot Eliyahu as calling the baraita a 'support'. Tosafot HaRid disputes how Maayanei Yehoshua read the Gra. The Nedarim link is a commentator's cross-reference about a Rabbi Yose in another tractate. Treating him as the same Rabbi Yose is the commentators' assumption, and I have not checked it independently.",
  "confidence": "medium",
  "graph_effect": "Keep the discourse function of והתני as a branch: 'challenge to the ownerlessness explanation' (Penei Moshe, Ohr LaYesharim, Guggenheimer) or 'support' (the Ridbaz reading the Gra). No person edges change. Do not settle it."},
 {"finding_id": "F11", "kind": "uncertainty",
  "claim": "The addressee 'Rabbi Mana' is printed in Venice, Guggenheimer and Mechon-Mamre. Sha'arei Torat Eretz Yisrael proposes emending it to Rabbi Ami. The ground is chronology, not a manuscript: Rabbi Bun bar Hiyya died while Rabbi Zeira was alive, so he could not have asked the younger Rabbi Mana. Ohr LaYesharim keeps 'Mana' and identifies him as an earlier Mana.",
  "evidence": [E("STEY33", "ר' בון בר חייא בעי קומי ר' מנא. — ע' מ\"ש בברכות רפ\"ח (לעיל עמ' 18) שיש להגיה כאן: בעי קומי ר' אמי."),
               E("STEY_BER8", "ועוד בפיאה פ\"ג ה\"ד [י\"ז ע\"ג] ר' בון בר חייא בעי קומי ר' מנא, ולעיל פ\"ב ה\"ח [ה' רע\"ג] מפורש שרבב\"ח נפטר בחיי ר' זעירא ור' זעירא הספידו וא\"א שישאל מר' מנא הצעיר"),
               E("BER28V", "כד דמך רבי בון בר רבי חייא על רבי זעירא ואפטר עילוי"),
               E("OLY33", "שאל לפני רבי מנא (הראשון, אמורא ארץ ישראלי בדור הראשון)"),
               E("SEARCH", "בעא קומי רבי זעירא")],
  "reasoning": "This is a later proposed emendation based on historical inference. It is not a textual witness. The Berakhot eulogy names 'רבי בון בר רבי חייא' (with a second רבי). That it is the same person as our 'רבי בון בר חייא' is the emender's assumption. In the first 60 Yerushalmi search hits, R. Bun bar Hiyya often 'asks before' Rabbi Zeira. Peah 3:3:3 is the only hit where he asks before Rabbi Mana. This is a usage pattern, not proof.",
  "confidence": "medium",
  "graph_effect": "Keep the addressee node as 'Rabbi Mana (as printed at Peah 3:3:3)'. Add an emendation branch 'Rabbi Ami (proposed, Sha'arei Torat Eretz Yisrael)' as a separate evidence type. Do not merge this Mana with the Mana son of R. Yonah or with a 'Mana I' without a separate identity decision."},
 {"finding_id": "F12", "kind": "textual",
  "claim": "Both patronymics give local parent placeholders: Yaakov's father Bun, and Bun's father Hiyya. Neither parent acts in the passage. Nothing in the passage identifies Yaakov's father Bun with Rabbi Bun bar Hiyya. The Guggenheimer translation spells both as 'Abun'.",
  "evidence": [E("VEN33", "רבי יעקב בר בון"), E("VEN33", "רבי בון בר חייא"),
               E("GUGEN33", "Rebbi Jacob bar Abun"), E("GUGEN33", "Rebbi Abun bar Ḥiyya"),
               E("GUGEN33", "A third generation Amora, student of R. Yose ben R. Ḥanina."),
               E("OLY33", "רבי יעקב בר בון (אמורא ארץ ישראלי בדור השלישי) אמר בשם רבי חנינא (בר חמא, אמורא ארץ ישראלי בדור הראשון)")],
  "reasoning": "בר is read literally as 'son of'. I found no sign here that it is a title. The generation labels and identifications (Hanina = bar Hama; Yaakov bar Bun as student of R. Yose b. R. Hanina) are historical inferences by the translator and by Ohr LaYesharim, not claims of this text.",
  "confidence": "high",
  "graph_effect": "Keep c1 and c2 (child of) with local father placeholders. Keep the two Bun nodes separate. Store the commentators' identifications and generations as proposals attributed to them, not accepted."},
 {"finding_id": "F13", "kind": "textual",
  "claim": "Beur HaGra proposes readings for 3:3:3. His first version reads 'they said [it] only because of ownerlessness'. It also emends 'the reason is only' from דלא to אלא.",
  "evidence": [E("GRA33", "כתב יד א ה\"ג לא אמרו אלא משום הפקר"), E("GRA33", "הוי לית טעמא אלא כו' כצ\"ל")],
  "reasoning": "ה\"ג ('thus we read') and כצ\"ל ('so it should read') mark proposed readings, not manuscript citations. With the plural 'they said', the subject is no longer explicitly Rabbi Yose.",
  "confidence": "medium",
  "graph_effect": "Add an emendation branch on c10's evidence. In that branch the statement explains 'their' view, not explicitly Rabbi Yose's. Keep Venice's 'לא אמר רבי יוסי' as the main reading."},
 {"finding_id": "F14", "kind": "textual",
  "claim": "The Mishnah's other one-versus-two rules (Sefaria 3:4:1; Mishnah Peah 3:5): brothers who divided give two peot, and if they became partners again they give one. Two who bought a tree give one peah; if one took the north side and the other the south, each gives his own.",
  "evidence": [E("VEN34", "האחים שחלקו נותנין שתי פיאות חזרו ונשתתפו נותנין פיאה אחת שנים שלקחו את האילן נותנין פיאה אחת לקח זה צפונו וזה דרומו זה נותן פיאה לעצמו וזה נותן פיאה לעצמו"),
               E("GUGEN34", "Brothers who split"), E("GUGEN34", "give two peot. When they later form a cooperative, they give one peah"),
               E("PM34", "לקח זה צפונו וזה דרומו. אע\"ג דאילן אחד הוא כיון שמתחל' לקח כל א' במקום מסוים לעצמו ולא היו שותפין מעולם צריך כל א' ליתן פאה לעצמו"),
               E("MT3", "הָאַחִין שֶׁחָלְקוּ נוֹתְנִין שְׁתֵּי פֵּאוֹת. חָזְרוּ וְנִשְׁתַּתְּפוּ נוֹתְנִין פֵּאָה אַחַת")],
  "reasoning": "Four rules, each with a condition and a count. (1) Divided: two peot. (2) Divided, then joined again: one peah. (3) Tree bought jointly: one peah. (4) Tree split north/south: one each. Guggenheimer notes that the plural 'brothers' means two. Penei Moshe explains that ownership at harvest time decides. No person is named, so these are scenario roles.",
  "confidence": "high",
  "graph_effect": "Add four rule statements with conditions and counts, voiced by the anonymous Mishnah. Replace c15's generic 'division' event. Any brothers, buyers or north/south buyers are scenario roles marked hypothetical. The sibling tie is inside the legal example and is not a family relation between people in history."},
 {"finding_id": "F15", "kind": "textual",
  "claim": "The halakhah's rule on partners (Sefaria 3:4:2). If partners harvested half a field jointly and then divided, 'he does not separate from his own, neither at the start nor at the end'. The second clause covers partners who joined again. In Venice it is NEGATED ('אינו מפריש'). The Guggenheimer Hebrew and Mechon-Mamre read it positively, and the Rome manuscript is reported to lack 'אינו'. Penei Moshe and Mareh HaPanim correct it; Maimonides codifies the positive rule.",
  "evidence": [E("VEN34", "חזרו וחלקו ונשתתפו וקצרו חצי שדה בשותפות וחלקו אינו מפריש שבסוף על חבירו שבסוף אבל לא משלו שבתחילה על חבירו שבתחילה"),
               E("GUGHE34", "וְחָלְקוּ מַפְרִישׁ שֶׁבְּסוֹף עַל חֲבֵירוֹ שֶׁבְּסוֹף. אֲבָל לֹא מִשֶׁלּוֹ שֶׁבִּתְחִילָּה עַל חֲבֵירוֹ שֶׁבִּתְחִילָּה"),
               E("MM34", "חזרו ונשתתפו וקצרו מפריש משלו שבסוף על של חבירו בסוף ולא משלו שבתחילה על של חבירו שבתחילה"),
               E("OLY34", "(אינו) (בכתב יד רומי אין המילים המוסגרות)"),
               E("PM34", "אינו מפריש אלא שבסוף על חבירו שבסוף. כצ\"ל ובספרי הדפוס חסר תי' אלא"),
               E("MHP34", "ויש מגיהין ומוחקין תיבת אינו בגי' דהכא ויותר נוח להוסיף תיבת אלא מלמחוק התיבה ואם דלענין הכוונה דא ודא אחת היא"),
               E("MT3", "כָּל אֶחָד מֵהֶן מַפְרִישׁ מֵחֶלְקוֹ שֶׁבַּקָּמָה עַל חֵלֶק חֲבֵרוֹ שֶׁבַּקָּמָה אֲבָל לֹא עַל הַחֵצִי שֶׁנִּקְצַר")],
  "reasoning": "Literal Venice: 'he does NOT separate from the end-portion for his fellow's end-portion, but not from his start-portion for his fellow's start-portion.' 'But not' after a negative is incoherent, which signals a textual problem. Penei Moshe adds אלא ('only'), and Mareh HaPanim says the result is the same. Guggenheimer Hebrew, Mechon-Mamre and the Rome MS (as reported) read the verb positively. The resulting rule: once they are partners again, one may give from one's own last-harvested portion for the partner's last-harvested portion, but not from a first-harvested portion for the partner's first-harvested portion. The editions and translations are not independent: each works from the Venice print and a few manuscripts.",
  "confidence": "high",
  "graph_effect": "Save the partner rules as rule statements whose polarity differs by branch. Venice literal: negated. Guggenheimer, Mechon-Mamre, Rome as reported, and the commentators' emendation: positive, restricted to the last-harvested portions. Save the emendation and the variant readings as different evidence types. All participants are scenario roles."},
 {"finding_id": "F16", "kind": "interpretation",
  "claim": "Commentators disagree on the scenario in the first partner clause.",
  "evidence": [E("PM34", "ונטל אחד את הקציר ואחד נטל את הקמה"),
               E("MT3", "זֶה שֶׁלָּקַח הַקָּצִיר אֵינוֹ מַפְרִישׁ כְּלוּם. וְזֶה שֶׁלָּקַח הַקָּמָה מַפְרִישׁ עַל הַחֵצִי שֶׁלָּקַח בִּלְבַד"),
               E("GRA34", "פי' דב' בנ\"א הוי כב' שדות לכך אין ליתן מזה על זה ואפי' על מה שקצרו בתחלה"),
               E("OLY34", "כל אחד ואחד אינו מפריש פאה לא משלו שבתחילה על שלו שבסוף ולא משלו שבסוף על שלו שבתחילה"),
               E("GUGEN34", "the entire sentence speaks about a man who took the harvested grain as his part and left the standing grain to his brother")],
  "reasoning": "Maimonides, Penei Moshe, Sirilio and Guggenheimer: one partner took the already-harvested grain and gives nothing; the other took the standing grain and gives peah for it. Beur HaGra: two owners count as two fields, so neither may give for the other's share, even for what was cut jointly. Ohr LaYesharim: each gives separately for the first and second halves.",
  "confidence": "medium",
  "graph_effect": "Save the clause once and keep an interpretation branch per commentator. Guggenheimer calls the second partner 'his brother'. That is the translator linking the halakhah to the Mishnah's brothers, not a stated family relation."},
 {"finding_id": "F17", "kind": "textual",
  "claim": "Wider text (3:4:3, outside the five segments supplied earlier): Rabbi Yohanan and Rabbi Yehoshua ben Levi each state a rule of the form 'separate from the first for the middle and from the middle for the first, but not from the first for the first'. The wording, the scenario, and whether they disagree are all contested.",
  "evidence": [E("VEN34", "אמר רבי יוחנן קצר חצי שדה וקצר חצי חצייה ולא הספיק לקצור את השאר עד שקצ' כולה מפריש מן הראשון על האמצעיין ומן האמצעיין על הראשון ואינו מפריש מן הראשון על הראשון"),
               E("YAFEM34", "ואינו מפריש מן הראשון על הראשון צ\"ל על האחרון"),
               E("OLY34", "קצר (צריך לומר: 'קנה', וכן הגיה ב\"ספר ניר\")"),
               E("GRA34", "כתב יד א ה\"ג א\"ר יוחנן נשתתפו בחצי שדה וקצר חצי חציו"),
               E("MHP34", "וריב\"ל פליג ומוסיף"),
               E("PM34", "וריב\"ל קאמר דאפי' בשהביאה שליש בלבד נמי דינא הכי"),
               E("MT3", "מַפְרִישׁ מִן הָרִאשׁוֹן עַל הָאֶמְצָעִיִּים וּמִן הָאֶמְצָעִיִּים עַל הָרִאשׁוֹן וְעַל הָאַחֲרוֹן")],
  "reasoning": "Haggahot YaFeM emends 'first on first' to 'first on last'. Ohr LaYesharim reports the Rome MS reading 'שקנה' and emends R. Yohanan's 'harvested' to 'bought', which gives a purchase scenario. Beur HaGra reads a partnership scenario. Mareh HaPanim says R. Yehoshua ben Levi 'disagrees and adds'. Penei Moshe presents him as extending the rule to grain one-third ripe. Maimonides reads 'and on the last'.",
  "confidence": "medium",
  "graph_effect": "Add two rule statements, one held by R. Yohanan and one by R. Yehoshua ben Levi. The relation between them is a branch, 'opposes' (Mareh HaPanim) or 'extends' (Penei Moshe), not a settled edge. Neither speaks to the other in the text."},
 {"finding_id": "F18", "kind": "textual",
  "claim": "Venice places the header 'הלכה ה'' in the middle of the partner baraita. Its first clause therefore sits at the end of the previous halakhah in the print. Penei Moshe and Guggenheimer say it belongs to the following halakhah.",
  "evidence": [E("VEN34", "לא בתחילה ולא בסוף הלכה ה' חזרו"),
               E("PM33", "בספרי הדפוס כתוב כאן קצר חצי שדה כו' וטעות הוא ולהלכה דלקמן הוא דשייכא"),
               E("GUGEN34", "In the Venice print, this sentence belongs to the previous Halakhah. It is the consensus of all commentators that it belongs to Halakhah 5.")],
  "reasoning": "This concerns segmentation and does not change any person. It explains why the pilot's segment 3:4:2 looked strange, and why the partner rule should not be read as commentary on the onion dispute.",
  "confidence": "high",
  "graph_effect": "Treat the whole partner baraita as belonging to the Mishnah on brothers and partners. Do not link it to the onion dispute."},
 {"finding_id": "F19", "kind": "interpretation",
  "claim": "Later authorities give three reasons for Rabbi Yose's exemption of mother onions, and they rule against him. (a) Ownerlessness: R. Hanina via R. Yaakov bar Bun, in the Talmud. (b) Storage of the minority: the Talmud's conclusion, per Penei Moshe. (c) Edible only with difficulty: R. Shimshon and Bartenura, per Mareh HaPanim. Maimonides rules the mother onions liable.",
  "evidence": [E("BART", "וּמִתּוֹךְ שֶׁמִּשְׁתָּהִין בָּאָרֶץ לֹא חָזוּ לַאֲכִילָה אֶלָּא עַל יְדֵי הַדְּחַק, וּלְכָךְ פָּטַר רַבִּי יוֹסֵי"),
               E("MHP33", "והר\"ש פי' בענין אחר דפליגי באכילה ע\"י הדחק ואחריו נמשך הר\"ב בפי' המשנה"),
               E("MT22", "וְכֵן הָאֲמָהוֹת שֶׁל בְּצָלִים שֶׁמַּנִּיחִין אוֹתָן בָּאָרֶץ לִקַּח מֵהֶן הַזֶּרַע חַיָּבוֹת בְּפֵאָה"),
               E("RAMBAM_COMM", "ואין הלכה כר' יוסי בשני דברים אלו")],
  "reasoning": "These are later explanations and rulings. Only (a), and the 'storage' conclusion drawn from the baraita, are inside the Talmud passage.",
  "confidence": "high",
  "graph_effect": "Save these as commentary or codification layers linked to Rabbi Yose's view. They add no speakers to 3:3:3."},
]

alternative_readings = [
 {"topic": "Addressee of the reply at 3:3:3", "readings": [
   {"reading": "Plural 'to them' (להן)", "held_by": ["Venice Edition", "Guggenheimer Hebrew and English"], "evidence": [E("VEN33", "אמר להן")]},
   {"reading": "Singular 'to him' (א\"ל / ליה)", "held_by": ["Mechon-Mamre", "Rome MS as reported by Ohr LaYesharim"], "evidence": [E("MM33", "א\"ל בזכה"), E("OLY33", "צריך לומר כמו בכתב יד רומי: 'ליה'")]}]},
 {"topic": "Name of the one asked", "readings": [
   {"reading": "Rabbi Mana (printed)", "held_by": ["Venice", "Guggenheimer", "Mechon-Mamre", "Ohr LaYesharim (as 'Mana I')"], "evidence": [E("VEN33", "בעי קומי רבי מנא")]},
   {"reading": "Rabbi Ami (proposed emendation on chronological grounds)", "held_by": ["Sha'arei Torat Eretz Yisrael"], "evidence": [E("STEY33", "שיש להגיה כאן: בעי קומי ר' אמי")]}]},
 {"topic": "Function of the baraita (והתני)", "readings": [
   {"reading": "It challenges and replaces the ownerlessness explanation with storage", "held_by": ["Penei Moshe", "Ohr LaYesharim", "Guggenheimer"], "evidence": [E("PM33", "ואין הטעם משום הפקר")]},
   {"reading": "It supports the explanation (Shenot Eliyahu as read by the Ridbaz)", "held_by": ["Chiddushei Ridbaz reporting the Gra"], "evidence": [E("RIDBAZ33", "והא תניא סיוע")]}]},
 {"topic": "Polarity of the second partner clause (3:4:2)", "readings": [
   {"reading": "Negated: 'אינו מפריש שבסוף...'", "held_by": ["Venice Edition, literal"], "evidence": [E("VEN34", "אינו מפריש שבסוף על חבירו שבסוף")]},
   {"reading": "Positive: may separate for the last-harvested portions only", "held_by": ["Guggenheimer Hebrew", "Mechon-Mamre", "Rome MS as reported", "Penei Moshe (adds אלא)", "Mareh HaPanim", "Maimonides"], "evidence": [E("MM34", "מפריש משלו שבסוף על של חבירו בסוף")]}]},
 {"topic": "Rav versus Shmuel", "readings": [
   {"reading": "Same object, different names", "held_by": ["Penei Moshe", "Ohr LaYesharim"], "evidence": [E("PM33", "ולא פליגי אלא בלישנא בעלמא")]},
   {"reading": "Different objects: regrowing roots versus leaves", "held_by": ["Sirilio"], "evidence": [E("SIR33", "הן העלין שהן יד הבצלים")]}]},
 {"topic": "Relation of R. Yehoshua ben Levi to R. Yohanan (3:4:3)", "readings": [
   {"reading": "Disagrees and adds", "held_by": ["Mareh HaPanim"], "evidence": [E("MHP34", "וריב\"ל פליג ומוסיף")]},
   {"reading": "Extends the same rule to one-third-ripe grain", "held_by": ["Penei Moshe"], "evidence": [E("PM34", "וריב\"ל קאמר דאפי' בשהביאה שליש בלבד נמי דינא הכי")]}]},
]

unresolved = [
 "Where the baraita 'אף על פי שאינן מתקיימות לו במרובה' comes from: it was not in the Tosefta Peah 1 portions I read. Other Tosefta chapters, the Sifra and manuscripts were not searched.",
 "Whether 'Rabbi Mana' should be emended to 'Rabbi Ami'. This depends on identifying the Bun bar Hiyya here with the 'Bun bar R. Hiyya' eulogized by Rabbi Zeira, a historical identity decision not made here.",
 "Who 'them' (להן) are in the Venice reading. No plural group is named in the segment.",
 "Direct manuscript readings (Leiden, Rome/Vatican) were not consulted. Rome readings are known only as reported by Ohr LaYesharim.",
 "Korban HaEdah and Sheyarei Korban returned 404 on Sefaria for Peah 3:3-3:4. This does not show that no such commentary exists.",
 "The identity of the Mishnah's Rabbi Yose (Ohr LaYesharim: ben Halafta), of Rabbi Hanina (Ohr LaYesharim: bar Hama), and the generation labels are commentators' proposals I did not verify.",
]

proposed_corrections = [
 {"existing_claim_id": "c3", "change": "Add a new statement 'mother onions are liable for peah' held by the anonymous Mishnah voice. Add an opposes edge from Rabbi Yose (exempt) to it.", "why": "The first clause is an explicit positive ruling (F1). The earlier review flagged this as missing."},
 {"existing_claim_id": "c4/c5/c8", "change": "Relabel the statements with conditions and counts: 'onion beds among vegetables: one peah per bed' (Rabbi Yose) versus 'one peah from one bed for all' (Sages). Link the reason statement from 3:1:4 to Rabbi Yose's view.", "why": "The one-versus-many count is the legal content (F2, F3)."},
 {"existing_claim_id": "c6/c7", "change": "Keep them as term definitions. Add term-spelling branches (פורגרה/פורגדה/פודגרא). Do not add an 'opposes' edge unless it is marked as Sirilio's reading.", "why": "F4."},
 {"existing_claim_id": "c10", "change": "Add an emendation branch from Beur HaGra ('לא אמרו', they said).", "why": "F13."},
 {"existing_claim_id": "c11", "change": "Add discourse function 'challenge' aimed at the ownerlessness explanation (commentary-based). Add an addressee emendation branch 'Rabbi Ami (proposed)'.", "why": "F6, F11."},
 {"existing_claim_id": "c12/c13", "change": "Merge m14 and m15 into one mention. Addressee branches: an unnamed plural (Venice, Guggenheimer) or Bun bar Hiyya alone (Mechon-Mamre, Rome as reported). Speaker Rabbi Mana (as printed), by local coreference.", "why": "F7."},
 {"existing_claim_id": "c14", "change": "Retype it: the anonymous argument voice cites a baraita from an unnamed tanna, whose content commentators give to the Sages answering Rabbi Yose. The voice concludes that the reason is storage. Its target is the ownerlessness explanation (c10's content), not Rabbi Yose himself. Add a branch for the reading that it is 'support'.", "why": "F9, F10."},
 {"existing_claim_id": "c15", "change": "Replace the generic 'division' event with four hypothetical rule statements: divided → two peot; joined again → one; tree bought jointly → one; north/south → each his own.", "why": "F14. The earlier review flagged this as missing."},
 {"existing_claim_id": "c16", "change": "Replace the generic 'harvest' event with rule statements for the two partner clauses. Keep the polarity branch (Venice negated versus the positive reading) and the interpretation branches for clause 1.", "why": "F15, F16, F18."},
 {"existing_claim_id": None, "change": "If the case scope is widened to 3:4:3, add rule statements for R. Yohanan and R. Yehoshua ben Levi, with their relation as a branch.", "why": "F17."},
 {"existing_claim_id": "c1/c2", "change": "No change. Keep both father placeholders and keep the two Bun nodes separate. Store the identifications and generations from the translator and Ohr LaYesharim as proposals.", "why": "F12."},
]

ontology_lessons = [
 "Legal rules need a statement type with condition, action and count (for example 'divided brothers → two peot'). Generic 'event' or 'participates_in' records drop the actual rule.",
 "Polarity can flip between editions (אינו מפריש versus מפריש). Polarity must be storable per reading branch, and an emendation must be a different evidence type from a variant reading.",
 "An anonymous first Mishnah voice (תנא קמא) is not the same node as the named group חכמים, even when they end up on the same side.",
 "A question used as a rhetorical objection (בתמיה) needs a discourse function (challenge) and a target statement. The target is often an explanation, not a person.",
 "A name change made on chronological grounds (Mana→Ami) is a proposal that already assumes a historical identity. It should stay a branch until a separate identity decision is made.",
 "Singular or plural addressee variants (להן / ליה) change the speech graph. Addressees need branch support.",
 "Kinship inside a legal example (brothers dividing an inheritance) is scenario-internal and hypothetical. It is not a family relation between historical people.",
 "Commentators' generation labels and identifications (bar Hama, ben Halafta, 'Mana I') are historical inferences and should be stored with who proposed them.",
 "Editions that all derive from the Venice print with limited manuscript input are not independent witnesses. Agreement among Guggenheimer, Mechon-Mamre and the commentators' emendations is agreement among editors.",
]

dossier = {
 "job_id": "random-yerushalmi-04",
 "focal_ref": "Jerusalem Talmud Peah 3:3:3",
 "status": "researched",
 "question": "The actual one-versus-two peah rules were lost. Recover each rule, condition, negation, named opinion, challenge and reply. Distinguish legal scenario roles from historical people.",
 "scope_checked": "JT Peah 3:3 and 3:4 in Venice, Guggenheimer Hebrew and English (with notes), Mechon-Mamre and Schwab French; JT Peah 3:1-3:2 (Venice, Guggenheimer English) for context; Sefaria-linked commentaries on 3:3 and 3:4 (Penei Moshe, Sirilio, Mareh HaPanim, Tosafot HaRid, Ohr LaYesharim, Sha'arei Torat Eretz Yisrael, Chiddushei Ridbaz, Beur HaGra, Haggahot YaFeM); Mishnah Peah 3:4-5 with Bartenura and Rambam's commentary; Mishneh Torah Gifts to the Poor 2:2 and 3:10-20; Tosefta Peah 1 (Machon Mamre) and Lieberman 1:9-11 with apparatus; Bavli Nedarim 43b-44a (English); JT Berakhot 2:8 and 8:1; Jastrow; one Sefaria search for 'בון בר חייא' in the Yerushalmi. No manuscripts were consulted directly.",
 "sources": sources,
 "fetch_failures_and_empty_responses": failures,
 "findings": findings,
 "alternative_readings": alternative_readings,
 "unresolved": unresolved,
 "proposed_corrections": proposed_corrections,
 "ontology_lessons": ontology_lessons,
}

# verify every quote
texts, bad = {}, []
def check(ev, where):
    sid = ev["source_id"]
    if sid not in texts:
        texts[sid] = searchable(cache[sid])
    if ev["exact_quote"] not in texts[sid]:
        bad.append((where, sid, ev["exact_quote"]))
for f in findings:
    for ev in f["evidence"]:
        check(ev, f["finding_id"])
for a in alternative_readings:
    for r in a["readings"]:
        for ev in r["evidence"]:
            check(ev, a["topic"])
if bad:
    for b in bad:
        print("QUOTE NOT FOUND:", b)
    sys.exit(1)
json.dump(dossier, open(os.path.join(HERE, "dossier.json"), "w"), ensure_ascii=False, indent=1)
print("ok", len(findings), "findings,", len(sources), "sources")
