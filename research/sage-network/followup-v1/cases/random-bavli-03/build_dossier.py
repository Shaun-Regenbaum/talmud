"""Build dossier.json for random-bavli-03 from saved sources.

Every evidence quote is checked against the saved bytes of its source file.
A quote passes if it is an exact substring of some string in the saved JSON,
or an exact substring after HTML tags are removed (recorded as such).
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PILOT = os.path.normpath(os.path.join(HERE, "../../../pilot"))


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


log = {}
for line in open(os.path.join(HERE, "sources/fetch_log.jsonl"), encoding="utf-8"):
    r = json.loads(line)
    log[os.path.basename(r["saved_file"])] = r  # last fetch of a name wins


def fetched(sid, fname, edition, ref=None):
    r = log[fname]
    p = os.path.join(HERE, "sources", fname)
    assert sha(p) == r["sha256"], fname
    rec = {"source_id": sid, "url": r["url"], "edition": edition,
           "fetched_at": r["fetched_at"], "saved_file": "sources/" + fname,
           "sha256": sha(p)}
    if "post_body" in r:
        rec["request_method"] = "POST"
        rec["post_body"] = r["post_body"]
    if ref:
        rec["ref"] = ref
    return rec


ROOT = os.path.normpath(os.path.join(HERE, "../../.."))  # research/sage-network


def local(sid, path, edition, note):
    rel = "research/sage-network/" + os.path.relpath(path, ROOT)
    return {"source_id": sid, "input_path": rel, "edition": edition,
            "saved_file": rel, "abs_path_for_build": path, "sha256": sha(path), "note": note}


SOURCES = [
    local("INPUT", os.path.join(PILOT, "inputs/random-bavli-03.json"),
          "Pilot input job: Wikisource Talmud Bavli segments Sotah 45a:11-15 as captured 2026-09-20",
          "Segment texts s1-s5 were checked: each equals the Wikisource version saved in WS45A and matches its stated sha256."),
    local("EARLIER", os.path.join(PILOT, "outputs/random-bavli-03.json"),
          "First pilot reading (passage-pilot-v1)", "Claims under review; not evidence about the Talmud."),
    local("PREVREVIEW", os.path.join(HERE, "previous-review.json"),
          "Earlier independent review of the first reading", "Review under follow-up; not evidence about the Talmud."),
    fetched("WS45A", "sotah45a_wikisource_and_davidson_unvoc.json",
            "Sefaria API v3: Sotah 45a, Hebrew 'Wikisource Talmud Bavli' and 'William Davidson Edition - Aramaic' (unvocalized)", "Sotah 45a"),
    fetched("DAV45A", "sotah45a_v3.json",
            "Sefaria API v3: Sotah 45a, 'William Davidson Edition - Vocalized Aramaic' and 'William Davidson Edition - English' (Koren Noé / Steinsaltz)", "Sotah 45a"),
    fetched("WS44B", "sotah44b_wikisource.json",
            "Sefaria API v3: Sotah 44b, 'Wikisource Talmud Bavli'", "Sotah 44b"),
    fetched("DAV44B", "sotah44b_v3.json",
            "Sefaria API v3: Sotah 44b, William Davidson vocalized Aramaic and English", "Sotah 44b"),
    fetched("SOT45B", "sotah45b.json",
            "Sefaria API v3: Sotah 45b, 'Wikisource Talmud Bavli' and William Davidson English", "Sotah 45b"),
    fetched("RASHI", "Rashi_on_Sotah.45a.json", "Sefaria API v3: Rashi on Sotah 45a, Vilna Edition", "Rashi on Sotah 45a"),
    fetched("STEINSALTZ", "Steinsaltz_on_Sotah.45a.json",
            "Sefaria API v3: Steinsaltz on Sotah 45a, William Davidson Edition - Hebrew", "Steinsaltz on Sotah 45a"),
    fetched("MEIRI", "Meiri_on_Sotah.45a.json", "Sefaria API v3: Meiri on Sotah 45a, 'Meiri on Shas'", "Meiri on Sotah 45a"),
    fetched("BEERSHEVA", "Beer_Sheva_on_Sotah.45a.json", "Sefaria API v3: Be'er Sheva on Sotah 45a", "Be'er Sheva on Sotah 45a"),
    fetched("TOSAFOT44B", "tosafot_sotah44b.json", "Sefaria API v3: Tosafot on Sotah 44b, Vilna Edition", "Tosafot on Sotah 44b"),
    fetched("TOSAFOTINDEX", "index_tosafot_sotah.json", "Sefaria API: index record for Tosafot on Sotah"),
    fetched("LINKS", "links_45a11-15.json", "Sefaria API: links for Sotah 45a:11-15 (without text)", "Sotah 45a:11-15"),
    fetched("VERSIONS", "versions_sotah.json", "Sefaria API: list of text versions of Sotah"),
    fetched("OTHERTR", "sotah45a_other_translations.json",
            "Sefaria API v3 request for Goldschmidt German, Sefaria Community Translation and Wikisource English on Sotah 45a; the response holds warnings that none of these exist for 45a", "Sotah 45a"),
    fetched("SIFREI", "sifrei_devarim_283.json",
            "Sefaria API v3: Sifrei Devarim 283, Vocalized Edition (Hebrew) and translation by Marty Jaffee 2015", "Sifrei Devarim 283"),
    fetched("YERPEAH", "yerushalmi_peah_6_3.json",
            "Sefaria API v3: Jerusalem Talmud Peah 6:3, Guggenheimer edition and translation (De Gruyter 1999-2015)", "Jerusalem Talmud Peah 6:3"),
    fetched("MPEAH6", "mishnah_peah_6.json",
            "Sefaria API v3: Mishnah Peah 6, Torat Emet 357 (Hebrew) and Mishnah Yomit by Joshua Kulp (English)", "Mishnah Peah 6"),
    fetched("TYT", "tyt_peah_6_10.json",
            "Sefaria API v3: Tosefot Yom Tov on Mishnah Peah 6:10, Mishnah ed. Romm, Vilna 1913", "Tosefot Yom Tov on Mishnah Peah 6:10"),
    fetched("TTEMIMAH", "torah_temimah_deut_24_19.json",
            "Sefaria API v3: Torah Temimah on Deuteronomy 24:19, Vilna 1904", "Torah Temimah on Deuteronomy 24:19"),
    fetched("YALKUT", "yalkut_937.json", "Sefaria API v3: Yalkut Shimoni on Torah 937, Torat Emet", "Yalkut Shimoni on Torah 937"),
    fetched("SEARCH1", "search_shetzafu_omarin.json", "Sefaria search-wrapper, exact phrase 'שצפו עומרין' (first 50 hits)"),
    fetched("SEARCH2", "search_tzafu_omarav.json", "Sefaria search-wrapper, exact phrase 'צפו עמריו' (first 50 hits)"),
    fetched("SEARCH3", "search_abahu_elazar_bsadcha.json", "Sefaria search-wrapper, exact phrase 'אבהו אמר רבי אלעזר בשדך' (first 50 hits)"),
    fetched("SEARCH4", "search_sedeh_chaveiro_tmp.json", "Sefaria search-wrapper, exact phrase 'שדה חבירו' (first 50 hits of many; broad control search)"),
]
SRC = {s["source_id"]: s for s in SOURCES}


def strings(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, list):
        for y in x:
            yield from strings(y)
    elif isinstance(x, dict):
        for y in x.values():
            yield from strings(y)


_cache = {}


def texts(sid):
    if sid not in _cache:
        p = SRC[sid].get("abs_path_for_build") or os.path.join(HERE, SRC[sid]["saved_file"])
        _cache[sid] = list(strings(json.load(open(p, encoding="utf-8"))))
    return _cache[sid]


def ev(sid, quote, ref=None, translation=None):
    mode = None
    for t in texts(sid):
        if quote in t:
            mode = "exact"
            break
    if mode is None:
        for t in texts(sid):
            if quote in re.sub(r"<[^>]+>", "", t):
                mode = "exact_after_html_tag_removal"
                break
    if mode is None:
        sys.exit(f"QUOTE NOT FOUND in {sid}: {quote}")
    e = {"source_id": sid, "exact_quote": quote, "quote_match": mode}
    if ref:
        e["ref"] = ref
    if translation:
        e["translation_label"] = "our translation"
        e["translation"] = translation
    return e


FINDINGS = [
    {
        "finding_id": "F01",
        "claim": "The five input segments contain 11 explicit name or group mentions. The first reading anchored 8 of them. It missed the second רבי אבהו, the second ר' יהודה and the רבנן in 45a:15. It also counted a phrase from a question (תיפוק ליה) as a group mention.",
        "kind": "textual",
        "evidence": [
            ev("INPUT", "ור' יהודה מיבעי ליה לכדרבי אבהו אמר ר' אלעזר דאמר רבי אבהו אמר ר\"א פרט לשצפו עומרין לתוך שדה חבירו ורבנן מבשדה בשדך ור' יהודה בשדה בשדך לא משמע ליה", "Sotah 45a:15 (s5)",
               "And Rabbi Yehuda needs it for [the teaching] of Rabbi Abahu said Rabbi Elazar, for Rabbi Abahu said R. E.: excluding sheaves that floated into his fellow's field. And the Rabbis: from 'in the field' / 'in your field'. And Rabbi Yehuda: 'in the field' / 'in your field' does not imply [anything] to him."),
            ev("INPUT", "ואלא בשדה למה לי מיבעי ליה לרבות שכחת קמה ורבנן שכחת קמה מנא להו נפקא להו מכי תקצור קצירך בשדך", "Sotah 45a:14 (s4)"),
            ev("INPUT", "אמר רב אפי' תימא רבנן", "Sotah 45a:11 (s1)"),
            ev("INPUT", "לרבי יהודה נמי תיפוק ליה", "Sotah 45a:13 (s3)"),
            ev("EARLIER", "תיפוק ליה"),
        ],
        "reasoning": "Occurrences were counted by exact string search on the input text. Explicit inventory: s1 רב x1, רבנן x1; s3 רבי יהודה x1; s4 רבנן x1; s5 ר' יהודה x2 (character offsets 1 and 117), רבי אבהו x2 (offset 23, inside לכדרבי אבהו, and offset 50), ר' אלעזר x1, ר\"א x1, רבנן x1 (offset 100). The first reading anchored s1 רב, s1 רבנן, s3 רבי יהודה, s4 רבנן (typed 'name'), s5 רבי אבהו occ.1, ר' אלעזר, ר\"א, ר' יהודה occ.1. It missed s5 רבי אבהו occ.2, ר' יהודה occ.2 and רבנן. Its m6 anchors 'תיפוק ליה' as a group. That phrase is the unnamed Talmudic voice asking a question, and its ליה points back to Rabbi Yehuda. Pronoun mentions are listed separately in F02.",
        "confidence": "high",
        "graph_effect": "Add three mention anchors to existing local entities: s5 רבי אבהו occ.2 to abahu, s5 ר' יהודה occ.2 to yehuda, s5 רבנן to rabbis. Retype m9 from name to group. Drop m6 as a group mention. No new person and no new relationship. Repeated mentions do not add edge weight.",
    },
    {
        "finding_id": "F02",
        "claim": "Pronouns (ליה, להו) keep referring to Rabbi Yehuda and the Rabbis between the named mentions. Five of them point to Rabbi Yehuda and two to the Rabbis.",
        "kind": "interpretation",
        "evidence": [
            ev("INPUT", "לרבי יהודה נמי תיפוק ליה משכחה דומיא דקציר", "Sotah 45a:13 (s3)",
               "For Rabbi Yehuda too, let him derive it from 'forgetting is like harvest'."),
            ev("INPUT", "מיבעי ליה לרבות שכחת קמה", "Sotah 45a:14 (s4)",
               "He needs it to include forgotten standing grain."),
            ev("INPUT", "ורבנן שכחת קמה מנא להו נפקא להו", "Sotah 45a:14 (s4)",
               "And the Rabbis, forgotten standing grain, from where do they [have it]? They derive it..."),
            ev("INPUT", "ור' יהודה בשדה בשדך לא משמע ליה", "Sotah 45a:15 (s5)"),
            ev("DAV45A", "The Gemara answers: He requires it in order to include the forgotten stalks of standing grain.", "Sotah 45a:14 English"),
        ],
        "reasoning": "s3 ליה follows לרבי יהודה directly. s4 מיבעי ליה continues the question about Rabbi Yehuda from 45a:13, and the Davidson English reads it that way ('He requires it'). The two להו in s4 follow ורבנן. s5 מיבעי ליה (offset 16) follows ור' יהודה, and s5 לא משמע ליה (offset 144) follows the second ר' יהודה. These are one-line coreferences with no rival antecedent.",
        "confidence": "high",
        "graph_effect": "Record these as pronoun mentions on yehuda (s3 ליה, s4 ליה, s5 ליה x2) and rabbis (s4 להו x2). Also record that s4 מיבעי ליה supplies the subject of the standing-grain derivation (earlier claim c4). They are mentions only and add no edges.",
    },
    {
        "finding_id": "F03",
        "claim": "The explanatory link the first reading lost: the unnamed Talmudic voice says Rabbi Yehuda needs the words 'in your field' (בשדך) for the teaching that Rabbi Abahu transmits from Rabbi Elazar, which excludes sheaves that floated into another's field. This ties an exegesis to a teaching. It is not a personal relationship between Rabbi Yehuda and Rabbi Abahu or Rabbi Elazar.",
        "kind": "textual",
        "evidence": [
            ev("INPUT", "ור' יהודה מיבעי ליה לכדרבי אבהו אמר ר' אלעזר", "Sotah 45a:15 (s5)",
               "And Rabbi Yehuda needs it for [the teaching] of Rabbi Abahu said Rabbi Elazar."),
            ev("DAV45A", "The Gemara asks: And what does Rabbi Yehuda derive from this verse? The Gemara answers: It is necessary for him in order to learn that which Rabbi Abbahu says that Rabbi Elazar says", "Sotah 45a:15 English"),
            ev("RASHI", "שצפו עומרין לתוך שדה חבירו - שנשבה הרוח והרימה את העומרין מן הארץ והציפתן לתוך שדה חבירו ושכחן כסבור שאינן שלו נפקא מבשדך ולא בשדה חבירך דלא הוו שכחה:", "Rashi on Sotah 45a:15:1",
               "'That floated into his fellow's field': the wind lifted the sheaves off the ground and carried them into his fellow's field, and he forgot them thinking they were not his; this is derived from 'in your field' and not in your fellow's field, so they are not forgotten sheaves."),
            ev("TYT", "ור\"י מיבעי ליה למעוטי לשצפו עומרין לתוך שדה חבירו. ורבנן מבשדה בשדך נפקא להו. ור\"י לא משמע ליה.", "Tosefot Yom Tov on Mishnah Peah 6:10:1"),
        ],
        "reasoning": "In 45a:14 the Rabbis derive standing grain from 'כי תקצור קצירך בשדך'. 45a:15 then asks what Rabbi Yehuda does with that verse. The answer, 'he needs it for the teaching of Rabbi Abahu from Rabbi Elazar', is the unnamed voice assigning a use of the verse to Rabbi Yehuda. Rashi takes the source word as בשדך ('your field, not your fellow's'). Rabbi Yehuda is not quoted citing either man. The link is the anonymous voice's reconstruction, which pairs a Tannaitic reading with a teaching carried by later named sages.",
        "confidence": "high",
        "graph_effect": "Add a claim with voice = unnamed Talmudic voice, predicate like assigns_derivation / needs_verse_for, subject yehuda, object the 'floating' teaching, and role source_text = בשדך. Link it to the existing transmission claim (c6) as a teaching-to-teaching dependency. Do not add a person-to-person edge between yehuda and abahu or elazar: there is no teacher, student, contact or transmission edge.",
    },
    {
        "finding_id": "F04",
        "claim": "Transmission: Rabbi Abahu reports the floated-sheaves exclusion in Rabbi Elazar's name. The one chain is named twice in 45a:15 (a back-reference and then the full quotation) and again in 45a:17. These are three mentions of one transmission, not three observations.",
        "kind": "textual",
        "evidence": [
            ev("INPUT", "דאמר רבי אבהו אמר ר\"א פרט לשצפו עומרין לתוך שדה חבירו", "Sotah 45a:15 (s5)",
               "For Rabbi Abahu said R. E.: excluding sheaves that floated into his fellow's field."),
            ev("WS45A", "א\"ל רב כהנא לרב פפי ואמרי לה רב כהנא לרב זביד תפשוט ליה מדרבי אבהו א\"ר אלעזר דאמר פרט לשצפו עומרין לתוך שדה חבירו דחבירו אין לתוך שדהו לא", "Sotah 45a:17 (Wikisource)",
               "Rav Kahana said to Rav Pappi, and some say Rav Kahana to Rav Zevid: resolve it from [the teaching of] Rabbi Abahu said Rabbi Elazar, who said: excluding sheaves that floated into his fellow's field; his fellow's, yes; into his own field, no."),
        ],
        "reasoning": "The formula 'לכדרבי X אמר רבי Y. דאמר רבי X אמר רבי Y: ...' names a teaching and then quotes it. It is one attribution. In 45a:17 Rav Kahana cites the same content with the same chain. That is re-use of the teaching, not a new report.",
        "confidence": "high",
        "graph_effect": "Keep one reports_in_name_of edge, abahu to elazar, with content 'floating'. Attach three mention anchors (45a:15 x2, 45a:17 x1). Earlier c7 (attributes floating to elazar) restates c6 and should be folded into c6 or flagged as its dependent view. It is not a second independent observation. The edge does not assert a meeting.",
    },
    {
        "finding_id": "F05",
        "claim": "The Wikisource text abbreviates the second name as ר\"א. The William Davidson Aramaic spells it רבי אלעזר both times. Reading ר\"א as Rabbi Elazar is supported by the same segment and by that edition. But ר\"א is an ambiguous abbreviation in general.",
        "kind": "textual",
        "evidence": [
            ev("INPUT", "לכדרבי אבהו אמר ר' אלעזר דאמר רבי אבהו אמר ר\"א", "Sotah 45a:15 (s5, Wikisource)"),
            ev("WS45A", "ורבי יהודה מיבעי ליה לכדרבי אבהו אמר רבי אלעזר דאמר רבי אבהו אמר רבי אלעזר פרט לשצפו עומרין", "Sotah 45a:15 (William Davidson Edition - Aramaic)"),
        ],
        "reasoning": "Inside one sentence the back-reference spells ר' אלעזר and the quotation abbreviates it. The Davidson text expands both, and 45a:17 in Wikisource also has א\"ר אלעזר. This is a difference in how two editions spell the name, not a textual variant about who taught it. The expansion is well supported locally. It still rests on the local parallel, because ר\"א alone could stand for another name.",
        "confidence": "high",
        "graph_effect": "Keep m7 on the local entity elazar with basis = in-segment parallel spelling plus a second edition's spelled form. Record the abbreviation as an edition spelling difference, not a variant attribution.",
    },
    {
        "finding_id": "F06",
        "claim": "The same wider passage has a different ר' אלעזר: a Tannaitic disputant in a baraita at 45b:5-6, spelled ר\"א when addressed. That figure plays another role in another textual layer. Do not merge the two by name.",
        "kind": "uncertainty",
        "evidence": [
            ev("SOT45B", "בשדה ולא צף על פני המים ר' אלעזר אומר בכולן אם היה חלל עורפין", "Sotah 45b:5 (Wikisource)"),
            ev("SOT45B", "תניא אמר רבי יוסי בר יהודה אמרו לו לר\"א", "Sotah 45b:6 (Wikisource)"),
        ],
        "reasoning": "At 45a:15 and 45a:17 Rabbi Elazar is the source of a teaching carried by the later sage Rabbi Abahu. At 45b:5-6 a baraita has the Sages argue with 'Rabbi Elazar' about the slain person. The layers differ and the name is shared. The text makes no identity claim either way. Whether either figure is a particular known historical sage is a separate decision this dossier does not make.",
        "confidence": "medium",
        "graph_effect": "Keep separate local placeholders for 'R. Elazar, source of R. Abahu' and 'R. Elazar, baraita disputant at 45b'. Any merge would be a historical-identity decision, not a reading of this passage.",
    },
    {
        "finding_id": "F07",
        "claim": "The one legal disagreement behind the focal line comes from the baraita just before it (45a:10). Rabbi Yehuda excludes a hidden forgotten sheaf, and the Sages (חכמים) include it. The first reading's input began at 45a:11 and never saw this dispute. The Gemara's רבנן in 45a:11-15 refers back to these חכמים.",
        "kind": "textual",
        "evidence": [
            ev("WS45A", "נמצא טמון בגל או תלוי באילן לימא מתניתין ר' יהודה היא ולא רבנן דתניא (דברים כד, יט) ושכחת עומר בשדה פרט לטמון דברי רבי יהודה וחכ\"א בשדה לרבות את הטמון", "Sotah 45a:10 (Wikisource)",
               "'Found hidden in a heap or hanging on a tree': shall we say our mishnah is Rabbi Yehuda and not the Rabbis? For it is taught: 'and you forget a sheaf in the field', excluding the hidden one, the words of Rabbi Yehuda; and the Sages say: 'in the field', to include the hidden one."),
            ev("SIFREI", "בַּשָּׂדֶה, פְּרָט לַטְּמוּנִים, דִּבְרֵי רַבִּי יְהוּדָה. וַחֲכָמִים אוֹמְרִים: בַּשָּׂדֶה לְרַבּוֹת אֶת הַטְּמוּנִים.", "Sifrei Devarim 283"),
            ev("MPEAH6", "וְכָל הַטְּמוּנִים בָּאָרֶץ, כְּגוֹן הַלּוּף וְהַשּׁוּם וְהַבְּצָלִים, רַבִּי יְהוּדָה אוֹמֵר, אֵין לָהֶם שִׁכְחָה. וַחֲכָמִים אוֹמְרִים, יֵשׁ לָהֶם שִׁכְחָה", "Mishnah Peah 6:10",
               "All that are hidden in the ground, such as arum, garlic and onions: Rabbi Yehuda says they are not subject to 'forgotten'; the Sages say they are."),
        ],
        "reasoning": "45a:10 cites the baraita to test whether the anonymous mishnah (44b:11, a corpse hidden in a heap) follows only Rabbi Yehuda. Sifrei Devarim 283 has the same dispute in a plural form (טמונים). Mishnah Peah 6:10 has a related dispute under the same names about produce stored in the ground, which is a different case. These are parallel formulations in other works. They do not show that the dispute was held more than once. 'חכמים' in the baraita and 'רבנן' in the Gemara are two labels for the same anonymous majority, not for individuals.",
        "confidence": "high",
        "graph_effect": "Add (from context 45a:10) a legal disagreement claim between yehuda and the Sages/Rabbis group on 'hidden forgotten sheaf'. Merge the group label חכמים (45a:10) with rabbis as a group coreference. Parallels in Sifrei and Mishnah Peah are separate attestations of an attributed dispute, stored as parallels and not as extra edge weight.",
    },
    {
        "finding_id": "F08",
        "claim": "In the focal line (45a:13) the unnamed voice asks why Rabbi Yehuda does not derive the hidden-sheaf exclusion from 'forgetting is like harvest', and concedes that he does. Rabbi Yehuda's legal ruling is unchanged. What moves is the source the baraita gave for it (בשדה).",
        "kind": "interpretation",
        "evidence": [
            ev("INPUT", "לרבי יהודה נמי תיפוק ליה משכחה דומיא דקציר אין הכי נמי", "Sotah 45a:13 (s3)",
               "For Rabbi Yehuda too, let him derive it from 'forgetting is like harvest'. Yes, indeed so."),
            ev("DAV45A", "The Gemara answers: Yes, it is indeed so, he does not derive that halakha from the phrase “in the field.”", "Sotah 45a:13 English"),
            ev("STEINSALTZ", "ההלכה שאמר שאין הטמון בכלל", "Steinsaltz on Sotah 45a:13"),
            ev("RASHI", "בשדה - ושכחת עומר בשדה לרבי יהודה משמע בשדה על פני השדה ולרבנן משמע בתוך השדה:", "Rashi on Sotah 45a:10:2",
               "'In the field': for Rabbi Yehuda it means on the surface of the field; for the Rabbis, inside the field."),
            ev("TYT", "ור\"י בשדה על פני השדה לרבות שכחת קמה", "Tosefot Yom Tov on Mishnah Peah 6:10:1"),
        ],
        "reasoning": "The baraita (45a:10) has Rabbi Yehuda read בשדה as excluding the hidden sheaf. 45a:13 gets the same exclusion from the harvest comparison Rav used in 45a:12 and answers 'yes indeed'. 45a:14 then moves Rabbi Yehuda's בשדה to standing grain. The Davidson English adds a gloss that he does not derive it from 'in the field'. Steinsaltz keeps the ruling ('the halakha he stated, that the hidden is not included'). Rashi and Tosefot Yom Tov read Rabbi Yehuda's בשדה as 'on the surface of the field', which fits including standing grain. Two layers are kept apart: the baraita attributes a reading to Rabbi Yehuda, and the Gemara reconstructs his sources. The Davidson English and Steinsaltz come from one editorial project and are not independent witnesses.",
        "confidence": "medium",
        "graph_effect": "Replace earlier c3 (anon 'explains' yehuda_derive). New shape: the unnamed voice poses a question and concedes. The content is a Gemara-layer claim: 'Rabbi Yehuda's exclusion of hidden sheaves can rest on the harvest analogy'. Keep it apart from the baraita-layer claim 'Rabbi Yehuda: בשדה excludes hidden'. No person edge.",
    },
    {
        "finding_id": "F09",
        "claim": "Standing grain (45a:14) and floated sheaves (45a:15) are not legal disagreements. The Gemara presents Rabbi Yehuda and the Rabbis as reaching the same rule from different words. Their disagreement there is about which verse teaches it.",
        "kind": "interpretation",
        "evidence": [
            ev("INPUT", "ורבנן שכחת קמה מנא להו נפקא להו מכי תקצור קצירך בשדך", "Sotah 45a:14 (s4)",
               "And the Rabbis, forgotten standing grain, from where do they [have it]? They derive it from 'when you reap your harvest in your field'."),
            ev("INPUT", "ורבנן מבשדה בשדך ור' יהודה בשדה בשדך לא משמע ליה", "Sotah 45a:15 (s5)",
               "And the Rabbis: from 'in the field' / 'in your field'. And Rabbi Yehuda: 'in the field' / 'in your field' does not imply [anything] to him."),
            ev("RASHI", "ורבנן - מיעוטא דשדה חבירו נפקא להו מדהוה ליה למכתב כי תקצור קצירך בשדה ושכחת וכתיב בשדך:", "Rashi on Sotah 45a:15:2",
               "'And the Rabbis': they derive the exclusion of the fellow's field from the fact that it could have written 'when you reap your harvest in the field and forget' and wrote 'in your field'."),
            ev("SIFREI", "בַּשָּׂדֶה, לְרַבּוֹת אֶת הַקָּמָה", "Sifrei Devarim 283"),
        ],
        "reasoning": "'מנא להו' asks for the Rabbis' source for a rule the question takes for granted they hold. 'ורבנן מבשדה בשדך' gives them a source for the floated-sheaves exclusion. 'לא משמע ליה' rejects an inference, not a ruling. So c9 (yehuda opposes distinction) is right only as a disagreement about method. In Sifrei Devarim 283, 'בשדה to include standing grain' is anonymous. It matches the verse the Gemara assigns to Rabbi Yehuda but is not attributed to him.",
        "confidence": "high",
        "graph_effect": "Keep c4 and c5 (both include standing grain), marked 'agreement on outcome, different source'. Relabel c9 from a bare 'opposes' to a disagreement about derivation (whether the בשדה/בשדך contrast teaches anything). Do not add a legal-disagreement edge for standing grain or floated sheaves. The only legal-disagreement edge here is F07's.",
    },
    {
        "finding_id": "F10",
        "claim": "Rav (45a:11) answers an attribution question: must the anonymous mishnah follow Rabbi Yehuda? He says it can follow even the Rabbis, because each verse is read in its own context. Rav explains the Rabbis' position. He does not disagree with Rabbi Yehuda or the Rabbis. 'Here' is the slain person (Deut. 21:1) and 'there' is the forgotten sheaf (Deut. 24:19).",
        "kind": "textual",
        "evidence": [
            ev("INPUT", "אמר רב אפי' תימא רבנן הכא מענייניה דקרא התם מענייניה דקרא", "Sotah 45a:11 (s1)",
               "Rav said: you may even say [it is] the Rabbis; here [it is read] from the context of the verse, there from the context of the verse."),
            ev("WS44B", "נמצא טמון בגל או תלוי באילן או צף על פני המים לא היו עורפין שנאמר באדמה ולא טמון בגל", "Sotah 44b:11 mishnah (Wikisource)",
               "If found hidden in a heap, or hanging on a tree, or floating on the water, they would not break [the heifer's neck], as it says 'in the ground' and not hidden in a heap."),
            ev("RASHI", "התם מענייניה דקרא - צריכין למידרשיה והכא מענייניה דקרא תדרוש ליה גבי חלל כתיב כי ימצא חלל כל היכא דמשתכח ואפי' טמון", "Rashi on Sotah 45a:11:1"),
        ],
        "reasoning": "'אפילו תימא רבנן' answers the Gemara's 'לימא מתניתין ר' יהודה היא ולא רבנן' (45a:10). That question is whose view the anonymous mishnah (44b:11) follows. This is an attribution and harmonisation move. The first reading's needed_context note was right: the antecedents are 44b:11 and 45a:10.",
        "confidence": "high",
        "graph_effect": "Keep c1 but make its target the question 'does the anonymous mishnah 44b:11 follow the Rabbis?', with the Rabbis as the group whose view Rav interprets (predicate interprets_view_of / harmonises). No disagreement edge from Rav to anyone. No personal relation between Rav and Rabbi Yehuda.",
    },
    {
        "finding_id": "F11",
        "claim": "The text does not mark where Rav's statement ends. 45a:12 (the two verses and the harvest comparison) may be Rav's own explanation or the Gemara spelling it out.",
        "kind": "uncertainty",
        "evidence": [
            ev("INPUT", "דכתיב (דברים כא, א) כי ימצא חלל היכא דמשתכח באדמה פרט לטמון והתם מענייניה דקרא", "Sotah 45a:12 (s2)"),
            ev("DAV45A", "In this case, as it is written: “If one be found slain” (Deuteronomy 21:1), the default assumption is that the halakha applies no matter where it is found.", "Sotah 45a:12 English"),
        ],
        "reasoning": "The segment continues with דכתיב and has no new speaker. Rashi's lemma on 45a:11 already explains Rav's words with the Deut. 21:1 argument, which fits reading 45a:12 as the content of Rav's point. That does not show the words are Rav's own. The earlier c2 (rav explains, basis local_coreference) is plausible, but its speaker boundary should be marked as not explicit.",
        "confidence": "medium",
        "graph_effect": "Keep c2 as a branch: branch A has Rav speaking through 45a:12, and branch B has the Gemara elaborating Rav. Either way there is no new person relation.",
    },
    {
        "finding_id": "F12",
        "claim": "Wider text (45a:16-17): Rabbi Yirmeya raises a dilemma. Rav Kahana resolves it with Rabbi Abahu's teaching from Rabbi Elazar, speaking to Rav Pappi or, as 'some say' (ואמרי לה), to Rav Zevid. Rav Kahana is not told to be answering Rabbi Yirmeya, and he is not reported as receiving the teaching from Rabbi Abahu.",
        "kind": "textual",
        "evidence": [
            ev("WS45A", "בעי ר' ירמיה צפו עומרין לתוך שדהו מהו אויר שדה כשדה דמי או לאו כשדה דמי", "Sotah 45a:16 (Wikisource)",
               "Rabbi Yirmeya asked: sheaves floated into his own field, what [is the law]? Is the field's airspace like the field or not?"),
            ev("WS45A", "א\"ל רב כהנא לרב פפי ואמרי לה רב כהנא לרב זביד", "Sotah 45a:17 (Wikisource)"),
            ev("WS45A", "אמר ליה רב כהנא לרב פפי ואמרי לה רב כהנא לרב זביד", "Sotah 45a:17 (William Davidson Edition - Aramaic)"),
        ],
        "reasoning": "The addressee alternative appears in the Talmud's own text in both editions. It is one reported speech event with two candidate addressees, not two events. 'תפשוט ליה מדרבי אבהו' cites a known teaching and does not describe hearing it from Rabbi Abahu.",
        "confidence": "high",
        "graph_effect": "Outside the input segments, but it belongs to the same teaching. Add one addressed_speech claim, rav-kahana to {rav-pappi | rav-zevid} as a single branch group with 'ואמרי לה' as the alternative. Add rav-kahana 'cites/uses teaching' on the abahu-to-elazar teaching (no transmission edge from abahu). Add rabbi-yirmeya 'raises dilemma' about the teaching's scope. No person edge between yirmeya and kahana.",
    },
    {
        "finding_id": "F13",
        "claim": "Another transmission in the wider sugya (45a:20): Rabbi Shimon ben Yehuda speaks in the name of Rabbi Shimon. The Gemara later lines up Rabbi Shimon ben Yehuda with Rabbi Yehuda's view, which is a match of views and not a personal link. The patronymic 'ben Yehuda' implies a father named Yehuda. The text does not say who he is.",
        "kind": "textual",
        "evidence": [
            ev("WS45A", "רבי שמעון בן יהודה אומר משום רבי שמעון שניהם אינן שכחה התחתון מפני שהוא טמון והעליון מפני שהוא צף", "Sotah 45a:20 (Wikisource)"),
            ev("SOT45B", "דרבנן כרבנן ור' שמעון בן יהודה כרבי יהודה", "Sotah 45b:3 (Wikisource)"),
        ],
        "reasoning": "'משום' marks a teaching given in someone's name. The 45b:3 alignment is the Gemara's analysis of whose view the baraita's voices share. Under the project rule a patronymic is evidence of a father relation. The father is a local placeholder and is not identified with the Rabbi Yehuda of 45a:10 on the basis of the name.",
        "confidence": "medium",
        "graph_effect": "Wider context only. reports_in_name_of: shimon-ben-yehuda to rabbi-shimon. child_of: shimon-ben-yehuda to a local placeholder 'Yehuda (father, named in patronymic)', literal kinship by name form with identity unknown. shares_view_with (Gemara analysis): shimon-ben-yehuda with yehuda on hidden sheaves. The father placeholder is not merged with yehuda.",
    },
    {
        "finding_id": "F14",
        "claim": "The parallel story of 'two slain, one on top of the other' names Rav in the Jerusalem Talmud (Peah 6:3) and Abaye in the Bavli (Sotah 45a:23). The translator's note in the Guggenheimer edition points this out. This is a literary difference between two works, not evidence about either man.",
        "kind": "textual",
        "evidence": [
            ev("YERPEAH", "רַב כַּד נְחַת לְתַמָּן אָמַר אֲנָא הוּא בֶּן עַזַּאי דְּהָכָא. אֲתָא חַד סָב שְׁאַל לֵיהּ שְׁנֵי הֲרוּגִים זֶה עַל גַּבֵּי זֶה", "Jerusalem Talmud Peah 6:3:5",
               "Rav, when he went down there, said: I am the Ben Azzai of here. An old man came and asked him: two slain, one on top of the other?"),
            ev("WS45A", "אמר אביי הריני כבן עזאי בשוקי טבריא אמר ליה ההוא מדרבנן לאביי שני חללים זה על גבי זה מהיכן הוא מודד", "Sotah 45a:23 (Wikisource)"),
            ev("YERPEAH", "The story appears in the same context in Babli Sotah 45a, the actor being Abbaie, three generations after Rav", "Guggenheimer note 78 on Jerusalem Talmud Peah 6:3:5"),
        ],
        "reasoning": "Sefaria links Yerushalmi Peah 6:3:5 to Sotah 45a:12. The two works give the same kind of scene to different sages. Following the project rule, we record which work names which sage and do not choose between them. The Rav in the Yerushalmi story is not a second observation of the Rav who speaks at Sotah 45a:11.",
        "confidence": "high",
        "graph_effect": "No change to the focal graph. If the story is ingested, store it as a cross-work parallel whose protagonist differs between works (Yerushalmi: Rav; Bavli: Abaye). Do not merge nodes or add edges on that basis.",
    },
    {
        "finding_id": "F15",
        "claim": "Scope of commentary checked. The Vilna Tosafot record on Sefaria for Sotah 44b says there are no Tosafot for this chapter. Rashi, Steinsaltz, Meiri and Be'er Sheva on 45a were read. Meiri gives a legal summary: floated sheaves are those the wind scattered into a fellow's field, even if they lie on the ground.",
        "kind": "textual",
        "evidence": [
            ev("TOSAFOT44B", "אין תוספות לפרק זה.", "Tosafot on Sotah 44b (Vilna Edition, Sefaria)",
               "There are no Tosafot for this chapter."),
            ev("MEIRI", "צפו עמריו לתוך שדה חברו ר\"ל שפזרה הרוח את עמריו לתוך שדה חברו וכשחזר ואספן לתוך שדהו שכח שם עומר אינו שכחה", "Meiri on Sotah 45a:3"),
        ],
        "reasoning": "The Tosafot statement is scoped to that edition's record on Sefaria. Meiri names no sages in this summary and adds no person relations. Links from Sefaria (LINKS) also list Tzafnat Pa'neach, Meshekh Chokhmah, Minchat Chinukh and others quoting 45a:14-15. These were not read, and nothing is claimed about their content.",
        "confidence": "high",
        "graph_effect": "None. This records coverage only.",
    },
]

ALTERNATIVES = [
    {"id": "A1", "topic": "Speaker of 45a:12",
     "readings": ["Rav's own explanation of 'from the context of the verse' (fits Rashi's lemma on 45a:11)",
                  "The Gemara spelling out Rav's brief statement (no speaker marker either way)"],
     "evidence": [ev("RASHI", "התם מענייניה דקרא - צריכין למידרשיה"), ev("INPUT", "דכתיב (דברים כא, א) כי ימצא חלל")],
     "status": "unresolved; no graph edge depends on it"},
    {"id": "A2", "topic": "How the baraita's 'בשדה פרט לטמון' (Rabbi Yehuda) fits with the Gemara's concession in 45a:13",
     "readings": ["Davidson English: he does not derive the hidden-sheaf exclusion from 'in the field' at all",
                  "Rashi (45a:10) and Tosefot Yom Tov: for Rabbi Yehuda בשדה means 'on the surface of the field', which the Gemara uses for standing grain"],
     "evidence": [ev("DAV45A", "he does not derive that halakha from the phrase “in the field.”"),
                  ev("TYT", "ור\"י בשדה על פני השדה לרבות שכחת קמה")],
     "status": "Kept as two commentary positions. The Davidson English and the Steinsaltz Hebrew come from one editorial project."},
    {"id": "A3", "topic": "Addressee of Rav Kahana at 45a:17",
     "readings": ["Rav Pappi", "Rav Zevid ('ואמרי לה', some say)"],
     "evidence": [ev("WS45A", "א\"ל רב כהנא לרב פפי ואמרי לה רב כהנא לרב זביד")],
     "status": "A textual alternative inside the Talmud. One event with two candidate addressees. It does not show that only one conversation happened, or that both did."},
    {"id": "A4", "topic": "Expansion of ר\"א in 45a:15 (Wikisource)",
     "readings": ["Rabbi Elazar (same-sentence spelling; Davidson Aramaic spells it out; 45a:17 א\"ר אלעזר)",
                  "Any other name abbreviated ר\"א (no witness checked here supports this)"],
     "evidence": [ev("WS45A", "דאמר רבי אבהו אמר רבי אלעזר פרט לשצפו")],
     "status": "Rabbi Elazar is strongly supported locally. This is an edition spelling difference, not an attribution variant."},
]

UNRESOLVED = [
    "No manuscripts or early printed editions of Sotah 45a were checked; only the Wikisource and William Davidson texts on Sefaria were read. Variants in the names (for example Abahu, Elazar, Pappi, Zevid) may exist that were not seen.",
    "Sefaria returned no Goldschmidt German, Community or Wikisource English version for Sotah 45a (warnings saved in OTHERTR). The only English read is the William Davidson Edition. It shares an editorial source with the Steinsaltz Hebrew, so the two are not independent translations.",
    "The Sefaria search listed Yalkut Shimoni on Torah 937:9 for 'שצפו עומרין', but the phrase was not found in the saved text of Yalkut 937. The layout or spelling may differ. It was not pursued.",
    "Later works that quote 45a:14-15 (Tzafnat Pa'neach, Meshekh Chokhmah, Minchat Chinukh, Kessef Mishneh, Hafla'ah ShebaArakhin) were not read.",
    "Historical identities are not decided: Rav, Rabbi Yehuda (the baraita's Tanna), Rabbi Abahu, Rabbi Elazar (45a:15), Rabbi Elazar (45b:5), Rabbi Yirmeya, Rav Kahana, Rav Pappi and Rav Zevid stay local persons. A shared name is not evidence of identity.",
    "Searches with Sefaria's exact-phrase search found the Abahu-to-Elazar floated-sheaves teaching only at Sotah 45a:15 and 45a:17, in the Bavli texts it indexes, and in works quoting them. This depends on the search index and phrasing, and is not proof that no other parallel exists.",
]

CORRECTIONS = [
    {"existing_claim_id": "m4/m8/(new)", "change": "Add mention anchors: s5 'רבי אבהו' occurrence 2 to abahu; s5 'ר' יהודה' occurrence 2 to yehuda; s5 'רבנן' occurrence 1 to rabbis.", "why": "F01. These repeated mentions are in the text and were not inventoried. They add mentions only, no new edges."},
    {"existing_claim_id": "m9", "change": "kind 'name' to 'group'.", "why": "רבנן is a group label, as m2 already treats it."},
    {"existing_claim_id": "m6 / entity anon", "change": "Remove 'תיפוק ליה' as a group mention. Represent the unnamed Talmudic voice as the discourse voice of the question, and record the ליה inside it as a pronoun mention of yehuda.", "why": "F01, F02. The phrase is a question verb plus a pronoun, not a mention of a group."},
    {"existing_claim_id": "(new)", "change": "Add pronoun mentions: s3 ליה, s4 ליה, s5 ליה x2 to yehuda; s4 להו x2 to rabbis.", "why": "F02. They carry the reference that makes c4 and c5 attributable."},
    {"existing_claim_id": "(new, linked to c6)", "change": "Add a claim: the unnamed voice assigns Rabbi Yehuda's use of 'בשדך' to the floated-sheaves teaching (Rabbi Abahu from Rabbi Elazar). It is teaching-to-teaching with no person edge.", "why": "F03. This is the explanatory link the previous review flagged as missing."},
    {"existing_claim_id": "c7", "change": "Fold into c6, or mark it as a restatement of c6. It is not a second attribution.", "why": "F04. One transmission is named several times. Inverse or restated displays are not new observations."},
    {"existing_claim_id": "c6", "change": "Attach all three mention anchors (45a:15 back-reference, 45a:15 quotation, 45a:17 citation by Rav Kahana) as mentions of one edge.", "why": "F04."},
    {"existing_claim_id": "c3", "change": "Retype from 'anon explains yehuda_derive' to 'unnamed voice asks and concedes', with content at the Gemara layer, kept apart from the baraita's attribution of 'בשדה פרט לטמון' to Rabbi Yehuda.", "why": "F08."},
    {"existing_claim_id": "c9", "change": "Relabel 'opposes' as a disagreement about derivation or method (whether the בשדה/בשדך contrast teaches anything). Note that the Gemara has Rabbi Yehuda reach the same rule from בשדך.", "why": "F09. This is not a legal disagreement."},
    {"existing_claim_id": "c4, c5", "change": "Annotate both as 'same outcome, different source'. c4's subject rests on the s4 pronoun (F02).", "why": "F09."},
    {"existing_claim_id": "c1", "change": "Point it at the attribution question 'does the anonymous mishnah (44b:11) follow the Rabbis?' (45a:10). Predicate: harmonises / interprets the Rabbis' view.", "why": "F10."},
    {"existing_claim_id": "c2", "change": "Mark the speaker boundary as not explicit: branch A is Rav, branch B is the Gemara elaborating Rav.", "why": "F11."},
    {"existing_claim_id": "(new, needs input extended to 45a:10)", "change": "Add the legal disagreement between yehuda and the Sages on hidden forgotten sheaves, and merge 'חכמים' (45a:10) into the rabbis group.", "why": "F07. This is the only legal disagreement underlying the focal line."},
    {"existing_claim_id": "episode.coverage", "change": "Keep needs_context. Name the needed segments as Sotah 44b:11 (mishnah) and 45a:10 (question and baraita).", "why": "F07, F10."},
]

LESSONS = [
    "'X מיבעי ליה לכדרבי A אמר רבי B' is the unnamed voice assigning a verse's use to X for a teaching carried by A from B. It links teaching to teaching. It is not transmission, contact or agreement between X and A or B.",
    "Keep three kinds of disagreement apart. (1) A legal disagreement differs on the ruling (hidden sheaf, 45a:10). (2) A disagreement about the source reaches the same ruling from different verses (standing grain, floated sheaves). (3) An attribution question asks whose view an anonymous text follows (mishnah 44b:11, Rav 45a:11). Only (1) should be drawn as a legal-dispute edge.",
    "'לכדרבי A... דאמר רבי A' names one teaching and then quotes it. It is one attribution with two mentions. Later citations such as 'תפשוט ליה מדרבי A' re-use the teaching and add no edge weight.",
    "Pronoun and zero-subject mentions (ליה, להו, מיבעי ליה) carry who holds a claim in Gemara back-and-forth. Inventory them as mentions, so that claims like c4 have an anchored subject.",
    "Group labels in different layers (חכמים in a baraita, רבנן in the Gemara) can point to the same anonymous majority. That is a group coreference, not a set of individuals.",
    "The same name in one sugya can belong to different figures in different layers (the Amoraic source of Rabbi Abahu at 45a:15 against the baraita disputant at 45b:5). Keep separate local placeholders.",
    "An abbreviation (ר\"א) resolved from the same sentence and from a second edition is an edition spelling difference. Store it apart from true attribution variants.",
    "'ואמרי לה' addressee alternatives belong in one branch group on one speech event.",
    "When two works give the same scene different protagonists (Yerushalmi: Rav; Bavli: Abaye), record the literary difference. It is not identity or biography evidence.",
    "A patronymic in the wider text ('Rabbi Shimon ben Yehuda') still yields a local father placeholder. Do not merge it with a same-named sage elsewhere in the sugya.",
]

dossier = {
    "job_id": "random-bavli-03",
    "focal_ref": "Sotah 45a:13",
    "status": "researched",
    "status_note": "Researched from the saved input (45a:11-15) plus the wider text 44b:10-45b:8, Rashi, Steinsaltz, Meiri, Be'er Sheva, and parallels in Sifrei Devarim 283, Mishnah Peah 6:10 and Yerushalmi Peah 6:3. The first reading still needs 44b:11 and 45a:10 added to its input for the legal dispute to be anchored (see corrections).",
    "question": "Collect every repeated mention and the explanatory link lost in the first reading. Separate transmission from disagreement about the legal issue.",
    "scope": "Texts checked: Sefaria Wikisource Talmud Bavli and William Davidson (Aramaic, vocalized, English) for Sotah 44b-45b; the commentaries and parallels listed in sources. No manuscripts.",
    "sources": SOURCES,
    "findings": FINDINGS,
    "alternative_readings": ALTERNATIVES,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
    "provisional_note": "Every graph proposal here is provisional and local to this passage. No historical identity or date is asserted.",
}

for s in SOURCES:
    s.pop("abs_path_for_build", None)
out = os.path.join(HERE, "dossier.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(dossier, f, ensure_ascii=False, indent=2)
n = sum(len(x["evidence"]) for x in FINDINGS) + sum(len(a["evidence"]) for a in ALTERNATIVES)
print("wrote", out, "findings", len(FINDINGS), "evidence quotes verified", n)
