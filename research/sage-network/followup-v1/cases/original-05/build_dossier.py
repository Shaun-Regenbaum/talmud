"""Build dossier.json for original-05 (Arakhin 20b:9).

Every exact_quote is checked as a substring of the located text in the saved
source file; a failed check aborts the build. Hashes are computed from the
saved bytes.
"""
import hashlib
import json
import os
import unicodedata

CASE = os.path.dirname(os.path.abspath(__file__))
os.chdir(CASE)
LOG = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if "saved_file" in e}


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


SOURCES = [
    ("S0", None, "research/sage-network/followup-v1/cases/original-05/input.json",
     "Job input with earlier cross-check (read-only, not modified)", "input.json"),
    ("S1", "sources/sefaria_v3_arakhin_20b_all.json", None,
     "Sefaria v3 Arakhin 20b: William Davidson Edition (Vocalized Aramaic, Aramaic, English; CC-BY-NC) and Wikisource Talmud Bavli (CC-BY-SA)", None),
    ("S2", "sources/sefaria_v3_arakhin_21a_all.json", None,
     "Sefaria v3 Arakhin 21a: same four versions as S1", None),
    ("S3", "sources/sefaria_links_arakhin_20b_9.json", None, "Sefaria links API for Arakhin 20b:9", None),
    ("S4", "sources/sefaria_links_arakhin_21a_4.json", None, "Sefaria links API for Arakhin 21a:4", None),
    ("S5", "sources/rashi_arakhin_20b.json", None, "Rashi on Arakhin 20b, Vilna Edition (Sefaria)", None),
    ("S6", "sources/rashi_arakhin_21a.json", None, "Rashi on Arakhin 21a, Vilna Edition (Sefaria)", None),
    ("S7", "sources/tosafot_arakhin_20b.json", None, "Tosafot on Arakhin 20b, Vilna Edition (Sefaria)", None),
    ("S8", "sources/tosafot_arakhin_21a.json", None, "Tosafot on Arakhin 21a, Vilna Edition (Sefaria)", None),
    ("S9", "sources/steinsaltz_arakhin_20b.json", None, "Steinsaltz on Arakhin 20b, William Davidson Edition - Hebrew (Sefaria)", None),
    ("S10", "sources/steinsaltz_arakhin_21a.json", None, "Steinsaltz on Arakhin 21a, William Davidson Edition - Hebrew (Sefaria)", None),
    ("S11", "sources/rashash_arakhin_21a.json", None, "Rashash on Arakhin 21a, Vilna Edition (Sefaria)", None),
    ("S12", "sources/tosefta_bm_lieberman_8_30.json", None, "Tosefta Bava Metzia (Lieberman) 8:30, codex Vienna, JTS 2001 (Sefaria)", None),
    ("S13", "sources/tosefta_bm_8_13.json", None, "Tosefta Bava Metzia 8:13, Machon Mamre (Sefaria)", None),
    ("S14", "sources/index_arakhin.json", None, "Sefaria index record for Arakhin (fetched; not quoted)", None),
    ("S15", "sources/search_amri_la_rami_bar_hama_lerav_hisda.json", None, "Sefaria search-wrapper, exact phrase 'ואמרי לה רמי בר חמא לרב חסדא' (size 100)", None),
    ("S16", "sources/search_rav_mari_bar_hama.json", None, "Sefaria search-wrapper, exact phrase 'רב מרי בר חמא'", None),
    ("S17", "sources/search_rav_pappa_leabaye_veamri_la.json", None, "Sefaria search-wrapper, exact phrase 'אמר ליה רב פפא לאביי ואמרי לה'", None),
    ("S18", "sources/search_krm_adam_makdish.json", None, "Sefaria search-wrapper, exact phrase 'כרבי מאיר דאמר אדם מקדיש דבר שלא בא לעולם'", None),
    ("S19", "sources/sefaria_v3_temurah_33b_6.json", None, "Sefaria v3 Temurah 33b:6, William Davidson Aramaic and English", None),
    ("S20", "sources/sefaria_v3_sotah_3a_15.json", None, "Sefaria v3 Sotah 3a:15, William Davidson Aramaic and English", None),
    ("S21", "sources/search_rami_bar_hama_lerav_hisda.json", None, "Sefaria search-wrapper, exact phrase 'רמי בר חמא לרב חסדא'", None),
    ("S22", "sources/search_mari_bar_hama.json", None, "Sefaria search-wrapper, exact phrase 'מרי בר חמא'", None),
]


def source_records():
    out = []
    for sid, path, input_path, edition, local in SOURCES:
        if path:
            e = LOG[path]
            rec = {"source_id": sid, "url": e["url"], "edition": edition, "fetched_at": e["fetched_at"],
                   "saved_file": path, "sha256": sha(path)}
            if "post_body" in e:
                rec["post_body"] = e["post_body"]
        else:
            rec = {"source_id": sid, "input_path": input_path, "edition": edition, "fetched_at": None,
                   "saved_file": local, "sha256": sha(local)}
        out.append(rec)
    return out


PATHS = {sid: (path or local) for sid, path, _, _, local in SOURCES}


def text_at(sid, version, seg, sub=None):
    d = json.load(open(PATHS[sid]))
    for v in d["versions"]:
        if v["versionTitle"] == version:
            t = v["text"] if isinstance(v["text"], str) else v["text"][seg - 1]
            if sub is not None:
                t = t[sub - 1]
            return t
    raise KeyError((sid, version))


def exact_span(t, q):
    """Return the substring of t equal to q, matching under NFC so that the
    returned quote keeps the source's own mark order byte for byte."""
    if q in t:
        return q
    nq = unicodedata.normalize("NFC", q)
    for i in range(len(t)):
        if t[i] != q[0]:
            continue
        for j in range(i + 1, min(len(t), i + 2 * len(q)) + 1):
            nt = unicodedata.normalize("NFC", t[i:j])
            if nt == nq and (j == len(t) or unicodedata.category(t[j]) != "Mn"):
                return t[i:j]
            if len(nt) > len(nq):
                break
    return None


def ev(sid, version, seg, quote, sub=None, locator=None):
    t = text_at(sid, version, seg, sub)
    quote = exact_span(t, quote)
    assert quote is not None and quote in t, (sid, version, seg)
    loc = locator or (f"{version}, segment {seg}" + (f":{sub}" if sub else ""))
    return {"source_id": sid, "locator": loc, "exact_quote": quote}


def search_hits(sid):
    d = json.load(open(PATHS[sid]))
    return d["hits"]["total"], sorted({h["_source"]["ref"] for h in d["hits"]["hits"]})


VOC = "William Davidson Edition - Vocalized Aramaic"
WS = "Wikisource Talmud Bavli"
ARM = "William Davidson Edition - Aramaic"
EN = "William Davidson Edition - English"
VIL = "Vilna Edition"
STZ = "William Davidson Edition - Hebrew"

F = []

F.append({
    "finding_id": "F1",
    "claim": "In 20b:9 the exchange is given with two alternative speaker pairs: Rav Pappa asks Abaye, or ('and some say') Rami bar Hama asks Rav Hisda. Both askers put the same question.",
    "kind": "textual",
    "evidence": [
        ev("S1", VOC, 9, "אֲמַר לֵיהּ רַב פָּפָּא לְאַבָּיֵי, וְאָמְרִי לַהּ רָמֵי בַּר חָמָא לְרַב חִסְדָּא: כְּמַאן?"),
        ev("S1", WS, 9, "אמר ליה רב פפא לאביי ואמרי לה רמי בר חמא לרב חסדא כמאן"),
        ev("S1", EN, 9, "<b>Rav Pappa said to Abaye, and some say Rami bar Ḥama</b> said <b>to Rav Ḥisda: In accordance with whose</b> opinion is this <i>baraita</i>?"),
    ],
    "translation_by_this_dossier": "'Rav Pappa said to Abaye, and some say it: Rami bar Hama to Rav Hisda: Like whom?'",
    "reasoning": "ואמרי לה swaps the whole pair of names, not one name. The question is one question with two transmitted speaker pairs. It is a textual alternative about who asked whom; it does not show that only one of the two exchanges happened, nor that both did.",
    "confidence": "high",
    "graph_effect": "Record two branch-scoped 'asks' edges: Rav Pappa -> Abaye (branch PAIR-A) and Rami bar Hama -> Rav Hisda (branch PAIR-B). Mark Rav Pappa|Rami bar Hama as alternative askers and Abaye|Rav Hisda as alternative addressees of the same question. These alternative links are role alternatives, not social relations between those people. No Abaye-Rav Hisda or Rav Pappa-Rami bar Hama personal edge.",
})

F.append({
    "finding_id": "F2",
    "claim": "The whole exchange in 20b:9 is itself an alternative ('some say') to the version in 20b:8, where Rav Yehuda reports in Rav's name that the baraita follows Rabbi Meir. So there are nested alternatives: the form of the tradition (report vs exchange), and inside the exchange, which pair spoke.",
    "kind": "textual",
    "evidence": [
        ev("S1", VOC, 8, "אָמַר רַב יְהוּדָה אָמַר רַב: הָא מַנִּי? רַבִּי מֵאִיר הִיא, דְּאָמַר: אָדָם מַקְדִּישׁ דָּבָר שֶׁלֹּא בָּא לָעוֹלָם."),
        ev("S1", VOC, 9, "אִיכָּא דְּאָמְרִי, אֲמַר לֵיהּ רַב פָּפָּא לְאַבָּיֵי"),
        ev("S9", STZ, 9, "<b>איכא דאמרי</b> <small>[יש שאומרים]</small> דבר זה בלשון אחרת"),
        ev("S1", EN, 9, "<b>Some say</b> a slightly different version of this discussion"),
    ],
    "translation_by_this_dossier": "20b:8: 'Rav Yehuda said Rav said: Whose is this? It is Rabbi Meir, who said: a person can consecrate something that has not come into the world.' 20b:9 opens: 'There are those who say: Rav Pappa said to Abaye ...'. Steinsaltz: 'some say this matter in a different formulation'.",
    "reasoning": "The text marker is איכא דאמרי. Steinsaltz and the Davidson English (same editorial family, not independent) both render it as another version of the same discussion. Whether the second version fully replaces the Rav Yehuda-Rav report, or only its form, is not stated in the text; that is interpretation (see alternative_readings AR1).",
    "confidence": "high",
    "graph_effect": "Create branch group FORM with FORM-REPORT (Rav Yehuda citing Rav, 20b:8) and FORM-EXCHANGE (20b:9). Branch group PAIR (PAIR-A, PAIR-B) is nested under FORM-EXCHANGE. The Rav Yehuda -> Rav 'reports in name of' edge belongs to FORM-REPORT; the asks edges belong to FORM-EXCHANGE.",
})

F.append({
    "finding_id": "F3",
    "claim": "The reply 'Rather, like whom?' has no named speaker in the Aramaic. By structure the addressee answers: Abaye in pair A, Rav Hisda in pair B. The Davidson English at 20b:9 inserts 'Abaye' only; the same translation at the repeated passage 21a:4 says 'He said to him', and Steinsaltz at 21a:4 calls the speaker 'the one asked'.",
    "kind": "textual",
    "evidence": [
        ev("S1", VOC, 9, "אֲמַר לֵיהּ: וְאֶלָּא כְּמַאן?"),
        ev("S1", EN, 9, "Abaye <b>said to him: Rather, in accordance with who</b> else’s opinion could this <i>baraita</i> be?"),
        ev("S2", EN, 4, "He said to him: Rather, in accordance with who</b> else’s opinion could this <i>baraita</i> be?"),
        ev("S10", STZ, 4, "אמר ליה</b> <small>[לו]</small> הנשאל: <b>ואלא כמאן</b>"),
        ev("S9", STZ, 9, "אמר ליה</b> <small>[לו]:</small> <b>ואלא כמאן</b>"),
    ],
    "translation_by_this_dossier": "'He said to him: But [if not], like whom?' Steinsaltz 21a:4: 'the one asked said to him'.",
    "reasoning": "The pronoun ליה plus the question-answer frame binds the reply to the addressee of whichever pair is read. The Davidson English choice of 'Abaye' at 20b:9 silently follows pair A only; its own rendering of the identical Aramaic at 21a:4 does not name anyone. Steinsaltz Hebrew and Davidson English come from the same editorial project and are not independent witnesses.",
    "confidence": "high",
    "graph_effect": "Bind the reply role per branch: respondent = Abaye in PAIR-A, Rav Hisda in PAIR-B. Do not attach the reply to Abaye unconditionally. Keep the English 'Abaye' as a translation rendering, not as Hebrew source evidence.",
})

F.append({
    "finding_id": "F4",
    "claim": "The question and reply identify which tannaitic position the anonymous baraita follows: Rabbi Meir's view that one can consecrate what does not yet exist. They do not say that Rav Hisda (or Abaye) personally follows or rules like Rabbi Meir.",
    "kind": "textual",
    "evidence": [
        ev("S1", VOC, 9, "כְּמַאן? כְּרַבִּי מֵאִיר, דְּאָמַר: אָדָם מַקְדִּישׁ דָּבָר שֶׁלֹּא בָּא לָעוֹלָם? אֲמַר לֵיהּ: וְאֶלָּא כְּמַאן?"),
        ev("S9", STZ, 9, "כמאן</b> <small>[כ</small>דעת <small>מי]</small> ברייתא זו"),
        ev("S1", VOC, 8, "וְהָא אֵין אָדָם מַקְדִּישׁ דָּבָר שֶׁלֹּא בָּא לָעוֹלָם?"),
    ],
    "translation_by_this_dossier": "'Like whom [is this baraita]? Like Rabbi Meir, who said: a person can consecrate something that has not come into the world? He said to him: Rather, like whom [else]?' Steinsaltz glosses כמאן as 'according to whose opinion is this baraita'.",
    "reasoning": "The subject of כמאן is the baraita under discussion (the problem raised in 20b:8). The reply is a rhetorical confirmation of the attribution. This is a claim about the source of an anonymous teaching, not a statement of personal allegiance, teacher-student link, or ruling.",
    "confidence": "high",
    "graph_effect": "Replace the input pair 'רב חסדא follows רבי מאיר' with a passage-level claim: (question/reply in PAIR-B, and equally in PAIR-A) attributes the baraita to Rabbi Meir's legal position. Rabbi Meir is the cited authority of a position, not an interlocutor. No Rav Hisda-Rabbi Meir or Abaye-Rabbi Meir person edge.",
})

F.append({
    "finding_id": "F5",
    "claim": "20b:10 says some teach this discussion on a different baraita (renting a house that became afflicted). The repeated block at 21a:4 (Rav Yehuda citing Rav, then the 'some say' exchange) is that same discussion under the other placement. It is an editorial repetition, not independent evidence of a second conversation.",
    "kind": "textual",
    "evidence": [
        ev("S1", VOC, 10, "וְאִיכָּא דְּמַתְנֵי לַהּ אַהָא, הַמַּשְׂכִּיר בַּיִת לַחֲבֵרוֹ וְנִתְנַגֵּעַ"),
        ev("S5", VIL, 10, "ואיכא דמתני לה - להא דרב יהודה ואביי ורמי בר חמא:", sub=1),
        ev("S2", VOC, 3, "דְּאָמַר: ״לִכְשֶׁיָּבֹא שְׂכָרוֹ יִקְדַּשׁ״, וְהָא אֵין אָדָם מַקְדִּישׁ דָּבָר שֶׁלֹּא בָּא לָעוֹלָם!"),
        ev("S2", VOC, 4, "אָמַר רַב יְהוּדָה אָמַר רַב: הָא מַנִּי? רַבִּי מֵאִיר הִיא, דְּאָמַר: אָדָם מַקְדִּישׁ דָּבָר שֶׁלֹּא בָּא לָעוֹלָם. אִיכָּא דְּאָמְרִי: אֲמַר לֵיהּ רַב פָּפָּא לְאַבָּיֵי"),
        ev("S10", STZ, 4, "כמאן</b> <small>[כמי]</small> אתה מפרש דבר זה?"),
    ],
    "translation_by_this_dossier": "20b:10: 'And some teach it on this: one who rents a house to his fellow and it became afflicted ...'. Rashi: 'And some teach it: [this refers] to that of Rav Yehuda and Abaye and Rami bar Hama.'",
    "reasoning": "Rashi's gloss names the unit being moved: Rav Yehuda's report and the Abaye / Rami bar Hama exchange (Rashi uses shorthand names from both pairs). 21a:1-3 then works through the rental baraita until the same 'cannot consecrate what does not exist' problem, and 21a:4 repeats the same two-level tradition. The placement is a third, outer alternative. The repeated names at 21a:4 duplicate the 20b:8-9 mentions.",
    "confidence": "high",
    "graph_effect": "Create outer branch group PLACEMENT: PLACE-BULL (20b:7-9) and PLACE-RENTAL (20b:10, 21a:1-4). Link the 21a:4 mentions to the same tradition object as 20b:8-9. Do not add weight or a second observation for Rav Yehuda-Rav, Rav Pappa-Abaye or Rav Hisda edges from 21a:4.",
})

total_mari, refs_mari = search_hits("S22")
total_rbh, refs_rbh = search_hits("S21")
F.append({
    "finding_id": "F6",
    "claim": "The printed Hebrew at the repetition 21a:4 has 'Rav Mari bar Hama' where 20b:9 has 'Rami bar Hama'. All three fetched Hebrew texts agree within each location. Rashash proposes correcting 21a to 'Rami bar Hama' as above. The printed form and the emendation are different kinds of evidence.",
    "kind": "textual",
    "evidence": [
        ev("S2", VOC, 4, "וְאָמְרִי לַהּ רַב מָרִי בַּר חָמָא לְרַב חִסְדָּא"),
        ev("S2", WS, 4, "ואמרי לה רב מרי בר חמא לרב חסדא"),
        ev("S2", ARM, 4, "ואמרי לה רב מרי בר חמא לרב חסדא"),
        ev("S1", ARM, 9, "ואמרי לה רמי בר חמא לרב חסדא"),
        ev("S2", EN, 4, "<b>Rav Mari bar Ḥama</b> said <b>to Rav Ḥisda"),
        ev("S11", VIL, 1, "<b>גמרא ואמרי לה רמי בר חמא לר\"ח. </b>כצ\"ל כדלעיל:"),
    ],
    "translation_by_this_dossier": "Rashash: 'Gemara: And some say it: Rami bar Hama to R[av] H[isda]. So it should read, as above.'",
    "reasoning": f"The two strings differ by the title רב and by the order of ר/מ in רמי vs מרי. That is an observation about letters, not a claim about how the variant arose. Rashash's note is a later proposed correction, not a manuscript reading. In Sefaria's search index the exact phrase 'מרי בר חמא' returned {total_mari} hits (hits count text versions, not passages), located only at {' and '.join(refs_mari)}; 'רמי בר חמא לרב חסדא' returned {total_rbh} version-hits, including Eruvin 34b:6, Menachot 84a:5, Keritot 4a:30 and Bava Batra 160b:13. That is consistent with Rashash but only covers Sefaria's indexed texts. The printed editions fetched are not manuscripts and their agreement is not independent manuscript support. No manuscript was checked.",
    "confidence": "high",
    "graph_effect": "Keep the 21a:4 mention string 'רב מרי בר חמא' as printed. Add a provisional 'same-name-form-as' proposal to the 20b:9 Rami bar Hama mention, typed as a later emendation (Rashash). Do not silently rewrite or merge. Because 21a:4 is a repetition (F5), no new person or edge is needed in either case; the identity question only decides which string the repeated mention carries.",
})

F.append({
    "finding_id": "F7",
    "claim": "The name Rami bar Hama carries a patronymic: son of a man named Hama. Under the printed 21a:4 reading, Rav Mari bar Hama likewise names a father Hama.",
    "kind": "textual",
    "evidence": [
        ev("S1", VOC, 9, "רָמֵי בַּר חָמָא"),
        ev("S2", VOC, 4, "רַב מָרִי בַּר חָמָא"),
    ],
    "translation_by_this_dossier": "'Rami son of Hama'; 'Rav Mari son of Hama'.",
    "reasoning": "בר + name is the ordinary patronymic form. The father never appears in the passage, but the relation is embedded in the name and stays as evidence. Whether 'Hama' is a literal father or part of a fixed name is not decidable from this passage; literal kinship is the default reading.",
    "confidence": "medium",
    "graph_effect": "Keep a local placeholder person 'Hama (father of Rami bar Hama)' with a name-embedded parent-of edge, branch PAIR-B. If the 21a:4 string is kept distinct, keep a separate local placeholder 'Hama (father of Rav Mari bar Hama)'; if the emendation is adopted, the two placeholders collapse. Neither placeholder is identified with any other Hama.",
})

F.append({
    "finding_id": "F8",
    "claim": "In the first form (20b:8, repeated 21a:4) Rav Yehuda transmits the attribution in Rav's name.",
    "kind": "textual",
    "evidence": [
        ev("S1", VOC, 8, "אָמַר רַב יְהוּדָה אָמַר רַב"),
        ev("S1", EN, 8, "<b>Rav Yehuda says</b> that <b>Rav says:</b>"),
    ],
    "translation_by_this_dossier": "'Rav Yehuda said Rav said'.",
    "reasoning": "Standard chain-of-transmission formula. It is one observation in the FORM-REPORT branch. The 21a:4 repetition is the same tradition (F5).",
    "confidence": "high",
    "graph_effect": "One 'reports in name of' edge Rav Yehuda -> Rav, scoped to FORM-REPORT; 21a:4 linked as a repetition, not a second observation. It does not by itself establish a meeting.",
})

F.append({
    "finding_id": "F9",
    "claim": "Rashi grounds Rabbi Meir's position in a separate baraita about betrothal conditioned on a future conversion.",
    "kind": "interpretation",
    "evidence": [
        ev("S5", VIL, 8, "ר\"מ היא - דתניא הרי את מקודשת לי לאחר שאתגייר לאחר שתתגיירי כו' ר\"מ אומר מקודשת:", sub=1),
    ],
    "translation_by_this_dossier": "'It is R. Meir: as it was taught: You are betrothed to me after I convert, after you convert, etc.; R. Meir says she is betrothed.'",
    "reasoning": "Commentary interpretation: Rashi supplies the source for the attribution. It concerns Rabbi Meir's legal position, not any contact between him and the amoraim.",
    "confidence": "high",
    "graph_effect": "Optional: attach to the Rabbi Meir position node as a commentary pointer. No person-person edge.",
})

F.append({
    "finding_id": "F10",
    "claim": "The opening 'Rav Pappa said to Abaye, and some say X to Y' recurs elsewhere with other alternates (Temurah 33b:6: Rava; Sotah 3a:15: Rav Mesharshiyya to Rava). Here it is a transmission formula. Appearing together in it does not relate the alternate askers to each other.",
    "kind": "interpretation",
    "evidence": [
        ev("S19", ARM, 1, "אמר ליה רב פפא לאביי ואמרי לה רבא"),
        ev("S20", ARM, 1, "אמר ליה רב פפא לאביי ואמרי לה רב משרשיא לרבא"),
    ],
    "translation_by_this_dossier": "'Rav Pappa said to Abaye, and some say: Rava ...'; '... and some say: Rav Mesharshiyya to Rava'.",
    "reasoning": "Checked only these two other hits of the exact phrase in Sefaria's index (S17 lists Arakhin 20b:9, Arakhin 21a:4, Temurah 33b:6, Sotah 3a:15). The pattern shows the formula records rival transmissions of who spoke. It is not evidence that Rav Pappa and Rami bar Hama knew each other, or that Abaye and Rav Hisda were linked.",
    "confidence": "medium",
    "graph_effect": "Do not create juxtaposed/together edges from the ואמרי לה formula. Keep only branch-scoped role alternatives (F1).",
})

F.append({
    "finding_id": "F11",
    "claim": "Nothing in this passage establishes a meeting, teacher-student bond, relative age, or date for any of the people named. The Rav Yehuda-Rav chain and the ask/answer exchanges are reported speech inside alternative versions.",
    "kind": "uncertainty",
    "evidence": [
        ev("S1", VOC, 9, "אִיכָּא דְּאָמְרִי"),
        ev("S1", VOC, 9, "וְאָמְרִי לַהּ"),
    ],
    "translation_by_this_dossier": "'There are those who say'; 'and some say it'.",
    "reasoning": "Both markers present the report as one of several transmitted versions. An 'asks' edge inside a branch records what the text says, not a verified historical encounter. Citation direction and question direction do not settle seniority.",
    "confidence": "high",
    "graph_effect": "Mark all edges from this passage historical_graph_eligible=false until identity and relative-time evidence are reviewed separately.",
})

F.append({
    "finding_id": "F12",
    "claim": "The Tosefta parallel of the rental baraita (linked by Sefaria to 20b:7-10) contains no named sage. The fetched Tosafot on 20b and 21a discuss the legal questions, not the speaker names.",
    "kind": "uncertainty",
    "evidence": [
        {"source_id": "S12", "locator": "The Tosefta according to to codex Vienna, 8:30", "exact_quote": "או' לו הרי שלך לפניך. הקדישו, הדר בו מעלה שכר להקדש."},
        ev("S8", VIL, 2, "הכי גרסינן כיון דמעל נפיק ליה שכר לחולין", sub=2),
    ],
    "translation_by_this_dossier": "Tosefta: 'he says to him: yours is before you. If he consecrated it, the one living in it pays rent to the Temple.' Tosafot: 'thus we read: since he misused it, the rent goes out to non-sacred status'.",
    "reasoning": "Scope statement: only the fetched Rashi, Tosafot, Steinsaltz and Rashash were read. Other commentaries on Arakhin (e.g. Shita Mekubetzet, manuscript collations) were not checked, so absence of a note on the names there is not claimed.",
    "confidence": "high",
    "graph_effect": "None; confirms that the baraita supplies no person nodes.",
})

# check the Tosefta quote that is not addressed through ev()
_t = json.load(open(PATHS["S12"]))["versions"][0]
assert "או' לו הרי שלך לפניך. הקדישו, הדר בו מעלה שכר להקדש." in (_t["text"] if isinstance(_t["text"], str) else json.dumps(_t["text"], ensure_ascii=False)), "S12 quote"
F[-1]["evidence"][0]["locator"] = _t["versionTitle"] + ", Tosefta Bava Metzia 8:30"

ALTS = [
    {"id": "AR1", "about": "F2 scope of the 'some say' (איכא דאמרי)",
     "readings": [
         "Reading 1: the second version replaces the first. The attribution to Rabbi Meir was not a statement of Rav Yehuda in Rav's name but arose as a question in a later exchange.",
         "Reading 2: the second version only reports the discussion in a different form, and says nothing about whether Rav's statement also existed."],
     "who_says": "Steinsaltz: 'דבר זה בלשון אחרת' (this matter in another formulation); Davidson English: 'a slightly different version of this discussion'. Neither decides between readings 1 and 2 explicitly; this split is this dossier's framing.",
     "status": "open"},
    {"id": "AR2", "about": "F3 who answers",
     "readings": ["Addressee answers (Abaye in PAIR-A; Rav Hisda in PAIR-B) — natural grammatical reading.",
                  "Davidson English 20b:9 names Abaye, which is correct only for PAIR-A."],
     "who_says": "Aramaic: unnamed; Davidson English 20b:9: 'Abaye'; Davidson English 21a:4: 'He'; Steinsaltz 21a:4: 'הנשאל'.",
     "status": "branch-bound; not a real disagreement about the Aramaic"},
    {"id": "AR3", "about": "F6 name at 21a:4",
     "readings": ["Printed 'רב מרי בר חמא' kept as a distinct transmitted name form.",
                  "Rashash's correction to 'רמי בר חמא' as in 20b:9."],
     "who_says": "Printed Hebrew (Davidson, Wikisource) vs Rashash (later emendation). No manuscript checked.",
     "status": "open; does not change the person count because 21a:4 is a repetition"},
    {"id": "AR4", "about": "F5 which baraita the discussion belongs to",
     "readings": ["PLACE-BULL: the bull's proceeds baraita (20b:6-9).", "PLACE-RENTAL: the house-rental baraita (20b:10-21a:4)."],
     "who_says": "The Gemara itself (ואיכא דמתני לה אהא); Rashi specifies the moved unit.",
     "status": "both preserved as editorial placements"},
]

UNRESOLVED = [
    "No manuscript or early print was collated for 20b:9 or 21a:4; the Rami / Rav Mari bar Hama variation is known here only from printed texts and Rashash.",
    "Whether 'Rav Mari bar Hama' at 21a:4 is a copying variant or a separate transmitted name is not settled by the sources read.",
    "Historical identity of Rami bar Hama, Rav Hisda, Rav Pappa, Abaye, Rav Yehuda and Rav with persons elsewhere is not decided here; a shared name is not identity.",
    "Whether FORM-EXCHANGE implies the Rav Yehuda-Rav report did not exist (AR1) is open.",
    "Commentaries not fetched (e.g. Shita Mekubetzet, Birkat HaZevach or other Arakhin commentaries if available) were not checked.",
]

CORRECTIONS = [
    {"existing_claim": "input pair bavli|Arakhin|20b|9|19|27 (רב פפא asks אביי, sure)",
     "change": "Keep kind 'asks' but scope it: PLACEMENT any > FORM-EXCHANGE > PAIR-A. Add the reply role for Abaye within PAIR-A. The first-pass 'addresses' was less precise but not wrong.",
     "why": "F1, F2, F3"},
    {"existing_claim": "input pair bavli|Arakhin|20b|9|27|53 (אביי - רב חסדא, none)",
     "change": "Keep 'none' as a person relation. Optionally record a non-social role-alternative link: Abaye and Rav Hisda are alternative addressees of the same question. The first-pass 'addresses' (0.87) was wrong: Abaye does not address Rav Hisda.",
     "why": "F1, F10"},
    {"existing_claim": "input pair bavli|Arakhin|20b|9|53|67 (רב חסדא follows רבי מאיר, AB, sure)",
     "change": "Remove the 'follows' person edge. Replace with a passage-level claim: the question/reply attributes the baraita to Rabbi Meir's position; in PAIR-B Rav Hisda is the addressee who confirms this attribution. First-pass 'addresses' was also wrong.",
     "why": "F4"},
    {"existing_claim": "missing",
     "change": "Add Rami bar Hama asks Rav Hisda (PAIR-B); Rav Yehuda reports in name of Rav (FORM-REPORT, 20b:8); Rami bar Hama child-of local placeholder Hama (name-embedded).",
     "why": "F1, F7, F8"},
    {"existing_claim": "earlier_crosscheck arakhin_question",
     "change": "Agree. Add: the Davidson English is inconsistent between 20b:9 ('Abaye') and 21a:4 ('He said to him'); Rashash emends 21a:4 to Rami bar Hama (a later proposed correction, separate from the printed text); Rashi states the moved unit includes Rav Yehuda's report and the exchange, so 21a:4 is a repetition. Its text_variation_note should cite Rashash.",
     "why": "F3, F5, F6"},
]

LESSONS = [
    "Alternatives nest: placement (which baraita) > form (report vs exchange) > speaker pair. A flat 'alternative' kind loses which branch an edge lives in; branch groups need a parent pointer.",
    "An 'and some teach it on this' (ואיכא דמתני לה אהא) repetition is one tradition with two placements. Mentions in the repeated block link to the same tradition id and add no evidence weight.",
    "An unnamed reply (אמר ליה) binds to the addressee per branch. Translation insertions of a name are renderings, and may pick one branch only.",
    "כמאן (like whom?) asks which authority an anonymous teaching follows. It should map to 'attributes position to', never to 'follows' between the discussants and the cited tanna.",
    "A name-form difference between a passage and its repetition needs three fields: printed reading, later emendation (with who proposes it), and manuscript evidence (here: not checked).",
    "Recurring transmission formulas (אמר ליה רב פפא לאביי ואמרי לה ...) do not create juxtaposition or togetherness edges between the alternate names.",
]

dossier = {
    "job_id": "original-05",
    "focal_ref": "Arakhin 20b:9",
    "status": "researched",
    "question": "Preserve the two versions of the question and their attribution, nested alternatives, and the related repeated passage. Do not attach a quoted opinion to the wrong speaker or count parallel editorial repetitions as independent evidence.",
    "scope_note": "Checked: Sefaria texts of Arakhin 20b and 21a (William Davidson vocalized/unvocalized Aramaic and English; Wikisource), Rashi, Tosafot, Steinsaltz on 20b and 21a, Rashash on 21a, Tosefta Bava Metzia 8:30/8:13, Sefaria links for 20b:9 and 21a:4, and Sefaria exact-phrase searches. No manuscripts. Translations marked translation_by_this_dossier are this dossier's own brief renderings.",
    "structure": {
        "PLACEMENT": {"PLACE-BULL": "Arakhin 20b:6-9", "PLACE-RENTAL": "Arakhin 20b:10, 21a:1-4 (repeats 20b:8-9)"},
        "FORM (inside each placement)": {"FORM-REPORT": "Rav Yehuda said Rav said: it is Rabbi Meir", "FORM-EXCHANGE": "some say: a question and reply"},
        "PAIR (inside FORM-EXCHANGE)": {"PAIR-A": "Rav Pappa asks Abaye; Abaye replies", "PAIR-B": "Rami bar Hama (21a:4 printed: Rav Mari bar Hama) asks Rav Hisda; Rav Hisda replies"},
        "count_check": "Distinct traditions: 1. Placements: 2 (20b:8-9; 21a:4). Speaker pairs in the exchange: 2. Named persons in the tradition: Rav Yehuda, Rav, Rabbi Meir (cited position), Rav Pappa, Abaye, Rami bar Hama, Rav Hisda = 7, plus the name-embedded father Hama. The 21a:4 block adds mentions, not persons, unless Rav Mari bar Hama is kept distinct (AR3).",
    },
    "sources": source_records(),
    "findings": F,
    "alternative_readings": ALTS,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
}

for f in F:
    for e in f["evidence"]:
        assert e and e["exact_quote"], f["finding_id"]

json.dump(dossier, open("dossier.json", "w"), ensure_ascii=False, indent=2)
print("wrote dossier.json:", len(F), "findings,", len(dossier["sources"]), "sources")
