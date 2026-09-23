"""Build dossier.json for challenge-02 (Bava Batra 24a:14).

Every exact_quote is checked against the decoded text of its saved source file.
Run from the case directory: python3 build_dossier.py
"""
import hashlib, json, os, sys

CASE = os.path.dirname(os.path.abspath(__file__))
os.chdir(CASE)
LOG = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if e.get("saved_file")}
SV = "https://www.sefaria.org/api/v3/texts/"
VV = "?version=hebrew%7Call&version=english%7Call"


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def fetched(sid, path, edition, note=None):
    e = LOG["sources/" + path]
    d = {"source_id": sid, "url": e["url"], "edition": edition, "fetched_at": e["fetched_at"],
         "saved_file": "sources/" + path, "sha256": sha("sources/" + path)}
    if note:
        d["note"] = note
    return d


def frozen(sid, repo_path, rel, edition):
    return {"source_id": sid, "input_path": repo_path, "edition": edition, "fetched_at": None,
            "saved_file": rel, "sha256": sha(rel)}


SOURCES = [
    frozen("pilot_input", "research/sage-network/pilot/inputs/challenge-02.json",
           "../../../pilot/inputs/challenge-02.json", "Pilot source job (Wikisource Talmud Bavli segments 24a:14, 24b:1)"),
    frozen("pilot_output", "research/sage-network/pilot/outputs/challenge-02.json",
           "../../../pilot/outputs/challenge-02.json", "First saved reading (passage-pilot-v1)"),
    frozen("prev_review", "research/sage-network/followup-v1/cases/challenge-02/previous-review.json",
           "previous-review.json", "Earlier independent review"),
    fetched("bb23b", "bb23b_v3.json", "Sefaria v3 Bava Batra 23b, all versions (Wikisource Talmud Bavli; William Davidson Aramaic, vocalized and English)"),
    fetched("bb24a", "bb24a_v3.json", "Sefaria v3 Bava Batra 24a, all versions (Wikisource Talmud Bavli; William Davidson Aramaic, vocalized and English)"),
    fetched("bb24b", "bb24b_v3.json", "Sefaria v3 Bava Batra 24b, all versions (Wikisource Talmud Bavli; William Davidson Aramaic, vocalized and English)"),
    fetched("links_24a14", "bb24a14_related.json", "Sefaria related-links API for Bava Batra 24a:14"),
    fetched("links_24b1", "bb24b1_related.json", "Sefaria related-links API for Bava Batra 24b:1"),
    fetched("rashi_24a", "rashi_24a14.json", "Rashi on Bava Batra 24a:14, Vilna Edition (Sefaria)"),
    fetched("rashi_24b", "rashi_24b1.json", "Rashi on Bava Batra 24b:1, Vilna Edition (Sefaria)"),
    fetched("tosafot", "tosafot_24a14.json", "Tosafot on Bava Batra 24a:14, Vilna Edition, with English translation by Rabbi Ephraim Piekarski (Sefaria)"),
    fetched("rosh_22", "rosh_2_22.json", "Rosh on Bava Batra 2:22, Vilna Edition (Sefaria)"),
    fetched("rosh_23", "rosh_2_23.json", "Rosh on Bava Batra 2:23, Vilna Edition (Sefaria)"),
    fetched("rashba", "rashba_24a5.json", "Rashba on Bava Batra (Sefaria segment 24a:5), Gerlitz edition, Oraita"),
    fetched("steinsaltz_24a", "steinsaltz_24a14.json", "Steinsaltz on Bava Batra 24a:14, William Davidson Edition - Hebrew (Sefaria)"),
    fetched("steinsaltz_24b", "steinsaltz_24b1.json", "Steinsaltz on Bava Batra 24b:1, William Davidson Edition - Hebrew (Sefaria)"),
    fetched("gershom_24a", "gershom_24a13-17.json", "Rabbeinu Gershom on Bava Batra 24a:13-17, Vilna Edition (Sefaria)"),
    fetched("gershom_24b", "gershom_24b1-2.json", "Rabbeinu Gershom on Bava Batra 24b:1-2, Vilna Edition (Sefaria)"),
    fetched("meiri", "meiri_24a7.json", "Meiri on Bava Batra (Sefaria segment 24a:7), Meiri on Shas"),
    fetched("rashash", "rashash_24b1.json", "Rashash on Bava Batra 24b:1, Vilna Edition (Sefaria)"),
    fetched("maharsha", "maharsha_24a2.json", "Chidushei Halachot (Maharsha) on Bava Batra 24a:2, Vilna Edition (Sefaria)"),
    fetched("rambam", "mt_ff_12_29.json", "Mishneh Torah, Forbidden Foods 12:29 (Torat Emet; Wikisource; Touger English) (Sefaria)"),
    fetched("kesef", "kesef_12_29.json", "Kessef Mishneh on Mishneh Torah, Forbidden Foods 12:29:1, Torat Emet (Sefaria)"),
    fetched("sa", "sa_yd_129_19.json", "Shulchan Arukh, Yoreh De'ah 129:19 (several Hebrew editions, French translation) (Sefaria)"),
    fetched("sotah46b", "sotah46b_v3.json", "Sefaria v3 Sotah 46b, all versions"),
    fetched("arukh", "arukh_kof382.json", "Sefer HeArukh, Letter Kof 382, Lublin 1883 (Sefaria)"),
    fetched("jastrow_kofa", "jastrow_kofa2.json", "Jastrow, Dictionary, entry קוֹפָא II, London 1903 (Sefaria)"),
    fetched("jastrow_avr", "jastrow_avravrei.json", "Jastrow, Dictionary, entry אַבְרַוְורֵי, London 1903 (Sefaria)"),
    fetched("dict_kufa", "dict_talmud_kufa.json", "A Dictionary of the Talmud, entry קוּפָא, London 1927 (Sefaria)"),
    fetched("soncino", "soncino_bb24_halakhah_com.html", "Soncino English translation of Bava Batra 24 as posted on halakhah.com (HTML)"),
    fetched("munich95", "munich95_pg0638.jpg", "Munich Cod. hebr. 95 (1342), page image 0638, via Sefaria manuscripts (listed for Bava Batra 22a-25a)",
            note="Image only. Any reading from it below is a tentative visual reading by this researcher, not a transcription from a published edition."),
]
FAILED_REQUESTS = [
    {"url": "https://www.sefaria.org/api/v3/texts/Jastrow,_קוֹפָא_II.1 (unencoded)", "result": "local encoding error before the request was sent; refetched successfully as jastrow_kofa2.json"},
    {"url": "https://www.sefaria.org/api/search-wrapper/es8?q=שפוכאי&size=20",
     "saved_file": "sources/search_shefukhai.json",
     "result": "server returned {\"error\": \"Unsupported HTTP method.\"}; no search results obtained. This is not evidence that no parallel exists."},
]


def text_of(sid):
    s = next(x for x in SOURCES if x["source_id"] == sid)
    b = open(s["saved_file"], "rb").read()
    if s["saved_file"].endswith(".json"):
        out = []

        def walk(x):
            if isinstance(x, str):
                out.append(x)
            elif isinstance(x, list):
                for y in x:
                    walk(y)
            elif isinstance(x, dict):
                for y in x.values():
                    walk(y)
        walk(json.loads(b))
        return "\n\u0000\n".join(out)
    return b.decode("utf-8", "replace")


def seg(sid, version, n):
    """Return the exact string of segment n (1-based) of a version in a v3 texts file."""
    d = json.load(open(next(x for x in SOURCES if x["source_id"] == sid)["saved_file"]))
    v = next(v for v in d["versions"] if v["versionTitle"] == version)
    return v["text"][n - 1]


def E(sid, quote, where=None, translation=None):
    d = {"source_id": sid, "exact_quote": quote}
    if where:
        d["location"] = where
    if translation:
        d["translation_mine"] = translation
    return d


WS = "Wikisource Talmud Bavli"
FINDINGS = [
    {
        "finding_id": "F01",
        "claim": "Rava is the only person named as acting in 24a:14. The text narrates that he permitted the wine skins; it does not quote his words or give his reason.",
        "kind": "textual",
        "evidence": [E("bb24a", "הנהו זיקי דחמרא דאשתכחן בי קופאי שרנהו רבא", "Bava Batra 24a:14, Wikisource",
                       "My translation: those skins of wine that were found at/among 'bei kofa'ei' - Rava permitted them.")],
        "reasoning": "שרנהו רבא is a third-person report of a decision in a case. No אמר or quoted statement follows. Everything after לימא is the anonymous discussion.",
        "confidence": "high",
        "graph_effect": "Keep Rava as a local person with a case-ruling claim (voice: narrator). Better predicate: rules_on or permits (case decision), not holds_view with an attached rationale.",
    },
    {
        "finding_id": "F02",
        "claim": "Both the question and the answer are unattributed. The majority-of-pourers reason is the anonymous discussion's explanation of Rava's ruling. The text does not say that Rava gave this reason.",
        "kind": "textual",
        "evidence": [
            E("bb24a", "לימא לא סבר לה לדרבי חנינא שאני התם דרובא", "Bava Batra 24a:14, Wikisource",
              "My translation: shall we say he does not hold Rabbi Hanina's [rule]? It is different there, for the majority..."),
            E("bb24b", "דשפוכאי ישראל נינהו", "Bava Batra 24b:1, Wikisource", "My translation: ...of the pourers are Jews."),
            E("rosh_23", "שרא ליה רבא אע\"ג דרובא דעלמא עובדי כוכבים נינהו רובא  דשפוכאי ישראל נינהו", "Rosh on Bava Batra 2:23",
              "My translation: Rava permitted it, although most of the world are gentiles, [since] most pourers are Jews."),
        ],
        "reasoning": "The question-and-answer form (לימא ... שאני התם) is the Talmud's anonymous editorial voice. The Rosh drops the question and presents the majority reason as the ground of Rava's ruling. That is a later presentation, not a quotation of Rava. The graph should keep 'the anonymous discussion explains Rava's ruling by X' separate from 'Rava held X'.",
        "confidence": "high",
        "graph_effect": "Earlier claim c4 should have voice anonymous_discussion (not narrator) and discourse_status: answer to the question in c3. Any link 'Rava holds majority-of-pourers reasoning' must be marked interpretation, sourced to the anonymous answer or to the Rosh.",
    },
    {
        "finding_id": "F03",
        "claim": "The answer crosses the page break. 'Majority' (רובא) ends 24a:14 and 'of the pourers are Jews' begins 24b:1. The earlier evidence for 'most local wine pourers are Israelites' quotes only the 24b words, which do not contain the word for majority.",
        "kind": "textual",
        "evidence": [E("bb24a", "שאני התם דרובא", "Bava Batra 24a:14 end, Wikisource"),
                     E("bb24b", "דשפוכאי ישראל נינהו", "Bava Batra 24b:1 start, Wikisource")],
        "reasoning": "Read alone, the 24b words say 'the pourers are Jews'. Only with 24a's רובא do they say that most of them are Jews. The distinction matters because the whole argument depends on majority.",
        "confidence": "high",
        "graph_effect": "The evidence for the 'majority' statement and for claim c4 should cite both pieces: 24a:14 'שאני התם דרובא' plus 24b:1 'דשפוכאי ישראל נינהו'.",
    },
    {
        "finding_id": "F04",
        "claim": "Rabbi Hanina's rule, which the first reading called 'not stated in this excerpt', appears at the start of the same discussion (23b). Where majority and proximity conflict, one follows the majority.",
        "kind": "textual",
        "evidence": [E("bb23b", "אמר רבי חנינא רוב וקרוב הולכין אחר הרוב", "Bava Batra 23b:2, Wikisource",
                       "My translation: Rabbi Hanina said: majority and proximity - one follows the majority.")],
        "reasoning": "24a:10, 24a:12 and 24a:14 all say 'דרבי חנינא', referring back to this statement. Rashi on 24a:14 also glosses the question as 'to follow the majority'.",
        "confidence": "high",
        "graph_effect": "Fill hanina_rule with this content and evidence from 23b:2. Change coverage from needs_context to resolved for this point. Rabbi Hanina is a speaker at 23b:2; at 24a:14 he is only cited.",
    },
    {
        "finding_id": "F05",
        "claim": "In the same discussion, a person named Rava had already derived the majority-over-proximity rule (24a:5). He then withdrew an earlier objection of his that seemed to point the other way (24a:3, 24a:8). Tosafot and Rashba use this to read the 24a:14 question as a contradiction inside Rava's own position, not a neutral question.",
        "kind": "interpretation",
        "evidence": [
            E("bb24a", "ואמר רבא ש\"מ מדרבי חייא תלת שמע מינה רוב וקרוב הלך אחר הרוב", "Bava Batra 24a:5, Wikisource",
              "My translation: And Rava said: learn three things from Rabbi Hiyya's [baraita]; learn from it that with majority and proximity one follows the majority."),
            E("bb24a", "והא רבא הוא דקאמר רוב ומצוי ליכא למ\"ד הדר ביה רבא מההיא", "Bava Batra 24a:8, Wikisource",
              "My translation: But it was Rava who said 'majority plus frequent [presence] - nobody disputes'? Rava retracted that one."),
            E("tosafot", "לימא רבא לית ליה דר' חנינא. פי' והא רבא אית ליה לעיל דר' חנינא", "Tosafot on 24a:14, Vilna",
              "My translation: 'Shall we say Rava does not hold Rabbi Hanina's [rule]' - meaning: but Rava holds Rabbi Hanina's [rule] above."),
            E("rashba", "ולאו דחויי קא מדחי ליה, דודאי רבא כרבי חנינא סבירא ליה", "Rashba on Bava Batra (segment 24a:5)",
              "My translation: and it is not a mere deflection, for Rava certainly holds like Rabbi Hanina."),
        ],
        "reasoning": "The textual facts are Rava's statement at 24a:5 and the retraction note at 24a:8. Linking them to 24a:14 depends on reading the three Ravas in one discussion as the same literary character. That is the natural reading within the discussion, but it is an editorial co-reference, not a historical identification. The weight of the question (a contradiction versus a neutral question) is Tosafot's and Rashba's interpretation. The Piekarski English note on Tosafot also refers readers to Ritva, which I did not fetch.",
        "confidence": "medium",
        "graph_effect": "Add a separate claim: Rava (24a:5) holds majority over proximity, with evidence from 24a:5 and voice Rava (quoted). Add a local coreference candidate: rava@24a:5 = rava@24a:14, basis same-discussion literary continuity. Keep it provisional and separate from any global identity. Do NOT turn c3 into a disagreement.",
    },
    {
        "finding_id": "F06",
        "claim": "The two לימא questions next to each other mirror each other, and both are rejected. At 24a:12 the question is whether Ravina agrees with Rabbi Hanina; at 24a:14 it is whether Rava disagrees. Neither case settles either person's position on the rule.",
        "kind": "textual",
        "evidence": [
            E("bb24a", "ההוא חצבא דחמרא דאישתכח בפרדיסא דערלה שריא רבינא לימא משום דסבר לה דרבי חנינא", "Bava Batra 24a:12, Wikisource"),
            E("bb24a", "שאני התם דאי מיגניב מינה אצנועי בגויה לא מצנעי", "Bava Batra 24a:13, Wikisource"),
        ],
        "reasoning": "In both cases שאני התם supplies a case-specific reason, so the ruling is neutral about Rabbi Hanina's rule. This is a check against adding either 'Ravina agrees with Hanina' or 'Rava opposes Hanina' as asserted.",
        "confidence": "high",
        "graph_effect": "Earlier c3 (rava opposes hanina_rule, question/rejected) is correct and must not be promoted. If Ravina's case is graphed, its 'agrees' claim must likewise be question/rejected.",
    },
    {
        "finding_id": "F07",
        "claim": "Commentators disagree on בי קופאי. It may be a common noun for the vines (the wine was hidden among vines, per Rashi, belonging to a Jew). Or it may be a place name (the Arukh as reported by Tosafot, and Rambam as read by Kessef Mishneh). The Arukh itself gives both.",
        "kind": "interpretation",
        "evidence": [
            E("rashi_24a", "בי קופאי - טמונים בין גפנים שבכרם והיא של ישראל:", "Rashi on 24a:14",
              "My translation: hidden among vines in a vineyard, and it [the vineyard] is a Jew's."),
            E("gershom_24a", "בי קופאי. בין הגפנים:", "Rabbeinu Gershom on 24a:14", "My translation: among the vines."),
            E("tosafot", "פי' בערוך מקום כדאמרי' (סוטה דף מו:) רב מרדכי אלויה לרב שימי בר אשי לבי קופאי", "Tosafot on 24a:14",
              "My translation: the Arukh explained [it as] a place, as we say (Sotah 46b): Rav Mordechai escorted Rav Shimi bar Ashi to Bei Kofa'ei."),
            E("arukh", "רב מרדכי אלוייה ל רב שימי בר אשי מהגרוניא עד בי קיפאי פירוש מקום", "Sefer HeArukh, Kof 382"),
            E("arukh", "וי\"מ דאשתכח בי קפאי בין הגפנים", "Sefer HeArukh, Kof 382", "My translation: and some explain: found among the vines."),
            E("kesef", "ונראה שרבינו מפרש בי קופאי שם מקום וכ\"כ התוס' בשם הערוך", "Kessef Mishneh on Forbidden Foods 12:29",
              "My translation: it seems our master [Rambam] explains Bei Kofa'ei as a place name, as Tosafot wrote in the name of the Arukh."),
            E("jastrow_kofa", "between the trunks of vines", "Jastrow, קוֹפָא II"),
            E("dict_kufa", "זיקי חמרא דאשתכחו בי קופאי", "A Dictionary of the Talmud, קוּפָא sense 2 (גפן / vine)"),
            E("soncino", "A number of flasks of wine were found between trunks of vines", "Soncino, Bava Batra 24a"),
            E("soncino", "Kufai', a village 4 parasangs west of Bagdad; v. Obermeyer; p. 267.]", "Soncino footnote (bracketed editorial note)"),
        ],
        "reasoning": "Rashi's reading makes the case a 'proximity' case: a Jew's vineyard is nearby, set against a gentile majority. Tosafot then has to explain how a bare place name could give proof-bearing proximity ('ובכהאי גוונא היה דהוה קורבא דמוכח'). Maharsha says that under Rashi, finding the wine among vines is itself proof-bearing proximity. The William Davidson English and Steinsaltz follow Rashi ('of a Jew', 'במקום של ישראל'). Those two are one editorial project and should not be counted as two witnesses. Soncino's footnote also records the place-name alternative with a historical-geography identification from Obermeyer, which I have not checked.",
        "confidence": "high",
        "graph_effect": "Earlier entity 'site' (kind place) should become an ambiguous locator with two branches: (a) common noun 'among the vines' (Rashi, Gershom, Arukh second view, Jastrow, Dictionary of the Talmud, Soncino main text); (b) toponym 'Bei Kofa'ei/Kifa'ei' (Arukh first view via Tosafot; Rambam per Kessef Mishneh; Soncino footnote). No gazetteer identification should be accepted from this passage.",
    },
    {
        "finding_id": "F08",
        "claim": "The focal words do not mention gentiles. The contrast with a gentile majority (of the world, of the city, or of other vineyards) is supplied by commentators and translators, each in a different form.",
        "kind": "interpretation",
        "evidence": [
            E("rashi_24a", "לילך אחר הרוב אלא אחר הקרוב וכאן ישראל מצויים יותר מנכרים ולא אזלינן בתר רובא דעלמא", "Rashi on 24a:14",
              "My translation: [does not hold] to follow the majority but rather proximity; and here Jews are more frequent than gentiles, and we do not follow the majority of the world."),
            E("gershom_24a", "דאע\"ג דרוב שאר גפנים דנכרים נינהו אזיל בתר קרוב", "Rabbeinu Gershom on 24a:14",
              "My translation: even though most other vines belong to gentiles, he follows the near one."),
            E("rosh_23", "אע\"ג דרובא דעלמא עובדי כוכבים נינהו", "Rosh 2:23", "My translation: although most of the world are gentiles."),
            E("kesef", "דכיון דאמרינן לימא לא סבר לדרבי חנינא אלמא רוב העיר עכו\"ם הוו", "Kessef Mishneh",
              "My translation: since we say 'shall we say he does not hold Rabbi Hanina', evidently the majority of the city were gentiles."),
            E("bb24a", "and was unconcerned that they might be wine owned by a gentile", "William Davidson English 24a:14 (added, not in the Aramaic)"),
        ],
        "reasoning": "The gentile majority is inferred from the question: a ruling could only seem to reject Rabbi Hanina if the majority pointed to prohibited wine. Commentators place that majority differently: the world (Rosh, Rashi's רובא דעלמא), other vines (Gershom) or the city (Kessef Mishneh). The inference is strong, but it is still an inference.",
        "confidence": "medium",
        "graph_effect": "If a 'gentiles' group node is added, it must be basis interpretation, sourced to commentary, with branches for its scope (world / city / other vineyards). It is not a textual mention in 24a:14 or 24b:1.",
    },
    {
        "finding_id": "F09",
        "claim": "The שפוכאי group is explicit, but commentators and codes describe it differently: people who pour wine from barrels into skins to sell to travelers (Rashi); local people who tread and pour wine (Gershom); donkey-drivers who carry wine (Meiri); wine sellers (Rambam).",
        "kind": "interpretation",
        "evidence": [
            E("rashi_24b", "שופכי יין מן החבית לנודות למכור לעוברי דרכים במדינה זאת", "Rashi on 24b:1",
              "My translation: those who pour wine from the barrel into skins to sell to travelers in this province."),
            E("gershom_24a", "רובן של אותה העיר שדורכין ושופכין יין ישראל נינהו", "Rabbeinu Gershom on 24a:14",
              "My translation: most of those of that town who tread and pour wine are Jews."),
            E("meiri", "אם היו רוב חמרים העומדים לשפות יין להוליכו ממקום למקום ישראלים מותר", "Meiri",
              "My translation: if most of the donkey-drivers who stand ready to pour wine and carry it from place to place are Jews, it is permitted."),
            E("rambam", "מקום שהיו רוב מוכרי היין בו ישראלים", "Mishneh Torah, Forbidden Foods 12:29", "My translation: a place where most of the wine sellers are Jews."),
            E("sa", "אם רוב שופכי יין ישראל מותרים אם הם נודות גדולים", "Shulchan Arukh YD 129:19"),
        ],
        "reasoning": "The earlier label 'Local wine pourers' takes 'local' from Rashi's במדינה זאת and Gershom's אותה העיר. The Talmud's words only say שפוכאי.",
        "confidence": "high",
        "graph_effect": "Group label should be 'wine pourers (שפוכאי); most are said to be Jews'. Keep the occupation gloss as commentary, with alternatives. Keep 'local' as Rashi/Gershom interpretation.",
    },
    {
        "finding_id": "F10",
        "claim": "The container rules are unattributed qualifications of the answer, not explanations of Rava's ruling. Rabbeinu Gershom preserves two opposed readings of the mixed large-and-small case. His first says the small skins are forbidden; his alternative says they are permitted and calls it primary. Rashi and the Shulchan Arukh permit.",
        "kind": "interpretation",
        "evidence": [
            E("bb24b", "וה\"מ ברברבי אבל זוטרי אימור מעוברי דרכים נפול", "Bava Batra 24b:1, Wikisource",
              "My translation: and this applies to large ones; but small ones - say they fell from travelers."),
            E("bb24b", "ואי איכא רברבי בהדייהו אימור באברורי הוה מנחי", "Bava Batra 24b:1, Wikisource",
              "My translation: and if there are large ones with them, say they were placed as balance [on the load]."),
            E("gershom_24b", "ואי איכא רברבי ואשכח זוטרי בהדייהו אסירי", "Rabbeinu Gershom on 24b:1-2, first explanation"),
            E("gershom_24b", "ל\"מ. ואי איכא רברבי בינייהו. אפי' דזוטרי מותרין", "Rabbeinu Gershom, alternative explanation"),
            E("gershom_24b", "והכי עיקר", "Rabbeinu Gershom, closing"),
            E("rashi_24b", "אף הקטנים מותרין", "Rashi on 24b:1"),
            E("sa", "ואם היו גדולים וקטנים מותרים כולם", "Shulchan Arukh YD 129:19"),
        ],
        "reasoning": "וה\"מ ('and this applies only...') limits the scope of the answer. The earlier predicate 'explains permit' fits it poorly. Gershom's first explanation reads 'balance' as the travelers' own packing (so everything came from travelers). His alternative reads it as the Jewish pourers' packing. Both concern the same words, so this is a disagreement of interpretation, not a variant text.",
        "confidence": "high",
        "graph_effect": "Change c5 from 'explains permit' to 'qualifies (limits scope of) the majority answer', voice anonymous_discussion. If the mixed-case outcome is graphed, add two interpretation branches, with Gershom's own preference noted. The balancing packer (travelers or pourers) is an unresolved role, not a new person.",
    },
    {
        "finding_id": "F11",
        "claim": "Even the earlier 'passersby' node is ethnically unmarked in the text. That travelers were mostly gentiles is stated by later readers, not by the Talmud's words.",
        "kind": "interpretation",
        "evidence": [
            E("bb24b", "אימור מעוברי דרכים נפול", "Bava Batra 24b:1, Wikisource"),
            E("sa", "שאנו תולים בהם שרובם עובדי כוכבים", "Shulchan Arukh YD 129:19", "My translation: for we attribute them to [travelers], most of whom are gentiles."),
            E("steinsaltz_24b", "שרובם גויים", "Steinsaltz on 24b:1"),
            E("soncino", "that passers-by [non-Jews] let them drop.", "Soncino 24b (bracketed supplement)"),
        ],
        "reasoning": "Soncino marks 'non-Jews' with brackets as a supplement. The argument implies it, since small skins from travelers are forbidden. It is still not a textual attribute.",
        "confidence": "high",
        "graph_effect": "Keep 'travelers' as a textual group. Any 'mostly gentile' attribute is interpretation (Shulchan Arukh, Steinsaltz, Soncino).",
    },
    {
        "finding_id": "F12",
        "claim": "Witnesses differ in wording, but none changes who acts or speaks. Tosafot's lemma names Rava ('לימא רבא לית ליה'); the printed text has 'לימא לא סבר לה'. The Arukh reads 'קיפאי'. Jastrow reports Ms. F 'קַפָּאֵי' and Ms. M 'באברוו׳ הוו מנחי'. The Rosh reads 'שרא ליה רבא'.",
        "kind": "textual",
        "evidence": [
            E("tosafot", "לימא רבא לית ליה דר' חנינא", "Tosafot lemma (commentary citation of the text)"),
            E("bb24a", "לימא לא סבר לה לדרבי חנינא", "Wikisource printed text"),
            E("arukh", "הנהו זיקי דחמרא דאשתכח בי קיפאי", "Sefer HeArukh citation"),
            E("jastrow_kofa", "Ms. F.", "Jastrow reports a Florence manuscript reading for בי ק׳ at B. Bath. 24a"),
            E("jastrow_avr", "Ms. M.", "Jastrow reports a Munich manuscript reading אימור באברוו׳ הוו מנחי for B. Bath. 24b"),
            E("rosh_23", "הנהו זיקי דחמרא דאשתכח בי קופאי שרא ליה רבא", "Rosh 2:23 citation"),
        ],
        "reasoning": "These are different evidence types: commentary lemmas and citations, and manuscript readings reported second-hand in a dictionary. I did not verify the manuscript readings directly, apart from the tentative image check in F13. They are recorded as reported, not as an established text.",
        "confidence": "medium",
        "graph_effect": "No person, relation or speech-turn change. Record the variants as evidence of the wording of the locator and ballast phrase. Tosafot's lemma is commentary evidence that its readers took Rava as the implied subject of לימא; that was already the natural reading.",
    },
    {
        "finding_id": "F13",
        "claim": "The Munich 95 image (page 0638) was saved. In my tentative visual reading, the line has the same case with the actor's name written like רבא and the same answer structure. I cannot confirm individual letters with confidence.",
        "kind": "uncertainty",
        "evidence": [{"source_id": "munich95", "exact_quote": None,
                      "visual_reading_tentative": "…זיקי דחמרא דאשתכחו בי קופאי שרינהו רבא לימא דלא סבר לה לר' חנינא שאני התם דרוב[א] … ישר' נינהו והנ\"מ …",
                      "location": "right column, roughly lines at y 1480-1530 px of the 2000x2457 image"}],
        "reasoning": "The small cursive hand and the image resolution limit my reading. It must not be used to settle רבא against רבה, or whether דשפוכאי is present, without a proper transcription (for example a published variant apparatus).",
        "confidence": "low",
        "graph_effect": "None. Flag for checking against a published variant apparatus if the name form ever matters.",
    },
    {
        "finding_id": "F14",
        "claim": "The Sotah 46b escort story cited by Tosafot and the Arukh introduces other named people: Rav Mordechai and Rav Shimi bar Ashi. They belong to that other passage, and the printed Sotah text differs in both the escorted person and the place.",
        "kind": "textual",
        "evidence": [
            E("tosafot", "רב מרדכי אלויה לרב שימי בר אשי לבי קופאי", "Tosafot's citation"),
            E("sotah46b", "רב מרדכי אלויה לרב אשי מהגרוניא ועד בי כיפי ואמרי לה עד בי דורא", "Sotah 46b:18, Wikisource",
              "My translation: Rav Mordechai escorted Rav Ashi from Hagronya to Bei Kifei, and some say to Bei Dura."),
        ],
        "reasoning": "The commentary citation has רב שימי בר אשי and לבי קופאי. The printed Sotah text has רב אשי and בי כיפי / בי דורא. The Arukh cites it as 'ברכות לב' with ס\"א עד בי כיפי. This is a variant of a different passage, used only to argue that קופאי can be a toponym. The name רב שימי בר אשי contains a patronymic ('son of Ashi') that would need a parent placeholder if that passage were graphed. It says nothing about identity with Rav Ashi.",
        "confidence": "high",
        "graph_effect": "Do not add Rav Mordechai, Rav Shimi bar Ashi or Rav Ashi to the Bava Batra 24a:14 graph. If Sotah 46b is graphed, record the Tosafot/Arukh citation as a variant witness for the name of the escorted person.",
    },
    {
        "finding_id": "F15",
        "claim": "What Rava permitted is itself interpreted: drinking, or only benefit. Rambam codifies benefit ('מותרין בהנייה'). Kessef Mishneh first considers that only the vessels were permitted, rejects this, and concludes that Rambam allowed benefit from the wine and vessels, because the city's majority was gentile.",
        "kind": "interpretation",
        "evidence": [
            E("rambam", "הרי אלו מותרין בהנייה", "Mishneh Torah, Forbidden Foods 12:29 (Wikisource)"),
            E("kesef", "לפיכך צ\"ל דשרנהו רבא וכן מותרים שכתב רבינו איין נמי קאי", "Kessef Mishneh"),
            E("soncino", "and Raba permitted the wine to be drunk.", "Soncino 24a"),
        ],
        "reasoning": "The Talmud says only שרנהו ('permitted them'). Soncino's 'to be drunk' is a translation choice. Rambam's scope is narrower.",
        "confidence": "medium",
        "graph_effect": "Label the permission statement 'Rava permitted the found wine skins', with the scope (drinking or benefit) as an open interpretation branch.",
    },
    {
        "finding_id": "F16",
        "claim": "No person or family relation is missing from the focal segments. The only named people are Rava (acting) and Rabbi Hanina (cited). Speech turns: the narrated case and ruling; the anonymous question; the anonymous answer crossing into 24b:1; the anonymous 'this applies only' qualification; the anonymous mixed-case extension. Unnamed roles that are implied but not people: the finders, the unknown owners, and (under Rashi) a Jewish vineyard owner.",
        "kind": "textual",
        "evidence": [
            E("bb24a", "הנהו זיקי דחמרא דאשתכחן בי קופאי שרנהו רבא לימא לא סבר לה לדרבי חנינא שאני התם דרובא", "Bava Batra 24a:14, Wikisource (whole segment)"),
            E("bb24b", "דשפוכאי ישראל נינהו וה\"מ ברברבי אבל זוטרי אימור מעוברי דרכים נפול ואי איכא רברבי בהדייהו אימור באברורי הוה מנחי:", "Bava Batra 24b:1, Wikisource (whole segment)"),
            E("gershom_24a", "שרינהו רבא. משום דהנהו גפנים דישראל נינהו:", "Rabbeinu Gershom on 24a:14", "My translation: Rava permitted them, because those vines are a Jew's."),
        ],
        "reasoning": "There are two named persons, and neither name contains a patronymic, so no parent placeholder is required. Wider context names Rabbi Zeira, Rav Ukva bar Hama, Rabbi Yirmeya (23b), Abaye, Rabbi Hiyya, Rav, Shmuel, Ravina (24a) and Ulla (24b). 'Rav Ukva bar Hama' contains a patronymic that needs a parent placeholder in the 23b graph. These are outside the focal unit, and their absence here says nothing about the wider text.",
        "confidence": "high",
        "graph_effect": "No new person nodes for 24a:14-24b:1. Optionally add an unnamed 'vineyard owner (Jewish)' role under the Rashi/Gershom branch only, basis interpretation. Mark the finder and owner roles as unspecified.",
    },
    {
        "finding_id": "F17",
        "claim": "The earlier independent review passed every check. It did not notice: the missing 'majority' word in the c4 evidence; the unattributed voice of the answer; that the 'needs context' gap is filled at 23b:2; Rava's own earlier majority ruling (24a:5) and the Tosafot and Rashba reading; the vines-or-place ambiguity; and that the gentile contrast is supplied by commentary.",
        "kind": "interpretation",
        "evidence": [E("prev_review", "The provisional disagreement stays provisional, and the answer crosses the page boundary.", "previous-review.json summary")],
        "reasoning": "The review's passes are correct on the points it checked. c3 is properly question/rejected, and 24b:1 was read. It did not test the points listed.",
        "confidence": "high",
        "graph_effect": "See proposed_corrections.",
    },
]

ALTERNATIVES = [
    {"topic": "בי קופאי", "readings": [
        {"reading": "common noun: among the vines (a Jew's vineyard)", "held_by": ["Rashi", "Rabbeinu Gershom", "Arukh (second view, וי\"מ)", "Jastrow", "A Dictionary of the Talmud", "Soncino main text", "William Davidson English / Steinsaltz (one editorial project)"]},
        {"reading": "place name Bei Kofa'ei / Bei Kifa'ei", "held_by": ["Arukh (first view; cited by Tosafot)", "Rambam as read by Kessef Mishneh", "Soncino bracketed footnote citing Obermeyer"]}],
     "status": "open; both must stay"},
    {"topic": "force of the לימא question", "readings": [
        {"reading": "ordinary exploratory question about Rava's view, like the other לימא questions on the page", "held_by": ["implicit in the parallel structure with 24a:10, 24a:12"]},
        {"reading": "a contradiction, since Rava already held Rabbi Hanina's rule at 24a:5", "held_by": ["Tosafot", "Rashba ('ולאו דחויי קא מדחי ליה')"]}],
     "status": "open; interpretation"},
    {"topic": "scope of the gentile majority implied by the question", "readings": [
        {"reading": "majority of the world", "held_by": ["Rashi", "Rosh"]},
        {"reading": "majority of other vineyards", "held_by": ["Rabbeinu Gershom"]},
        {"reading": "majority of the city", "held_by": ["Kessef Mishneh"]}],
     "status": "open; none is textual"},
    {"topic": "identity of שפוכאי", "readings": [
        {"reading": "people pouring from barrels into skins to sell to travelers", "held_by": ["Rashi"]},
        {"reading": "townspeople who tread and pour wine", "held_by": ["Rabbeinu Gershom"]},
        {"reading": "donkey-drivers who pour and carry wine", "held_by": ["Meiri"]},
        {"reading": "wine sellers", "held_by": ["Rambam"]}],
     "status": "open"},
    {"topic": "mixed large-and-small skins", "readings": [
        {"reading": "all permitted (the small ones balance the pourers' load)", "held_by": ["Rashi", "Rabbeinu Gershom (alternative, marked primary)", "Meiri", "Shulchan Arukh"]},
        {"reading": "small ones forbidden (travelers pack a small skin between two large ones)", "held_by": ["Rabbeinu Gershom (first explanation)"]}],
     "status": "open as interpretation; not a text variant"},
    {"topic": "scope of Rava's permission", "readings": [
        {"reading": "drinking", "held_by": ["Soncino translation"]},
        {"reading": "benefit (Rambam's formulation, as read by Kessef Mishneh)", "held_by": ["Rambam", "Kessef Mishneh"]}],
     "status": "open"},
]

UNRESOLVED = [
    "Whether the name at 24a:14 is רבא in every manuscript. My Munich 95 image reading is tentative. No published variant apparatus was consulted.",
    "Ritva's view, which the Tosafot English note mentions, was not fetched.",
    "The parallel discussion in Avodah Zarah (last chapter; referenced by Rosh 2:22 as 'ע\"ז דף ע.' and by Meiri) was not fetched. The Sefaria search request failed, so I cannot say whether other parallels to this case exist.",
    "The historical-geography identification in Soncino's footnote (Obermeyer p. 267) was not checked. It remains a later editorial proposal.",
    "Whether the three Ravas of 24a:3, 24a:5-8 and 24a:14 are one literary character is the natural reading within the discussion. It is still a local coreference decision, and historical identity is a separate question.",
]

CORRECTIONS = [
    {"claim_id": "episode.coverage / hanina_rule", "change": "Resolve needed_context: Rabbi Hanina's rule is at 23b:2 'אמר רבי חנינא רוב וקרוב הולכין אחר הרוב'. Relabel hanina_rule 'majority prevails over proximity' with that evidence.", "why": "F04"},
    {"claim_id": "c1", "change": "Predicate: a case ruling (permits / rules_on), not holds_view. Add open scope (drinking or benefit).", "why": "F01, F15: the text narrates an act, gives no reason and does not specify scope."},
    {"claim_id": "c3", "change": "Keep as question/rejected. Add a note that Tosafot and Rashba read the question as a contradiction with Rava's own 24a:5 statement. Do not promote it to disagreement.", "why": "F05, F06"},
    {"claim_id": "c4", "change": "Voice: anonymous discussion (answer to c3), not narrator. Evidence: add 24a:14 'שאני התם דרובא' to 24b:1 'דשפוכאי ישראל נינהו'. Basis: explicit as the anonymous answer. That Rava himself reasoned this way is interpretation (Rosh).", "why": "F02, F03"},
    {"claim_id": "c5", "change": "Predicate: qualifies/limits the majority answer, not explains permit. Voice anonymous discussion. Record Gershom's two readings of the mixed case as interpretation branches.", "why": "F10"},
    {"claim_id": "entity site (m6)", "change": "Make it an ambiguous locator with branches common-noun (vines) and toponym. Do not accept a place identification.", "why": "F07"},
    {"claim_id": "entity winepourers (m4)", "change": "Label 'wine pourers (שפוכאי); most are Jews per the answer'. 'Local' and the occupation glosses are commentary alternatives.", "why": "F03, F09"},
    {"claim_id": "entity travelers (m5)", "change": "Keep. No 'gentile' attribute unless marked interpretation (Shulchan Arukh, Steinsaltz, Soncino bracket).", "why": "F11"},
    {"claim_id": None, "change": "Add a context claim: Rava (24a:5) derives 'רוב וקרוב הלך אחר הרוב' from Rabbi Hiyya's baraita. Add a provisional local coreference between that Rava and the Rava of 24a:14 (same discussion).", "why": "F05"},
    {"claim_id": None, "change": "Optional interpretation-only nodes: gentile majority group (scope branches) and a Jewish vineyard owner role (Rashi/Gershom). Neither is a textual mention.", "why": "F07, F08, F16"},
]

LESSONS = [
    "An anonymous answer that explains a named sage's ruling should be stored as the anonymous discussion explaining the ruling. It should not be stored as the sage's own view. Later codifiers such as the Rosh may fold the reason into the ruling; that is a separate, later presentation.",
    "When a statement crosses a page or segment boundary, its evidence needs every piece. Here the word carrying the argument (רובא) sits on the earlier side of the break.",
    "'Rejected לימא' claims come in mirrored pairs on this page (Ravina agrees? / Rava disagrees?). The contract should treat both as question/rejected, with no residual stance.",
    "Implied contrast groups (here gentiles) are commentary inferences with competing scopes. They need a basis field and branches, not a textual mention.",
    "A word that may be a toponym or a common noun (בי קופאי) needs a locator entity with branches. It should not be a place node.",
    "Commentary lemmas and citations (Tosafot, Arukh, Rosh), dictionary-reported manuscript readings (Jastrow) and one's own image reading are three distinct evidence types. Do not merge them into a 'variant' flag.",
    "Names in a commentary's cross-reference (Rav Mordechai, Rav Shimi bar Ashi) belong to the cited passage. They must not leak into the focal graph.",
    "The William Davidson English and Steinsaltz Hebrew are one editorial project. Their agreement is not two witnesses.",
]

missing = []
for f in FINDINGS:
    for ev in f["evidence"]:
        q = ev.get("exact_quote")
        if q is None:
            continue
        if q not in text_of(ev["source_id"]):
            missing.append((f["finding_id"], ev["source_id"], q))
if missing:
    for m in missing:
        print("QUOTE NOT FOUND:", m)
    sys.exit(1)

dossier = {
    "job_id": "challenge-02",
    "focal_ref": "Bava Batra 24a:14",
    "status": "researched",
    "question": "Who acts, speaks and is cited in Bava Batra 24a:14 (with its continuation at 24b:1)? Which graph claims are explicit, which rest on interpretation, and which alternatives must stay open, when checked against the wider discussion (23b-24b), translations, commentaries and codes?",
    "scope_checked": "Bava Batra 23b, 24a, 24b (Sefaria: Wikisource and William Davidson texts, William Davidson English); Rashi, Tosafot, Rashba, Rosh 2:22-23, Rabbeinu Gershom, Meiri, Maharsha, Rashash, Steinsaltz; Rambam Forbidden Foods 12:29 with Kessef Mishneh; Shulchan Arukh YD 129:19; Arukh, Jastrow, Dictionary of the Talmud; Soncino (halakhah.com); Sotah 46b; one Munich 95 page image.",
    "sources": SOURCES,
    "failed_requests": FAILED_REQUESTS,
    "findings": FINDINGS,
    "alternative_readings": ALTERNATIVES,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
    "notes": [
        "All translations marked translation_mine are mine and brief.",
        "Text evidence, commentary interpretation and historical inference are kept in separate findings. No historical identity or date is asserted.",
    ],
}
json.dump(dossier, open("dossier.json", "w"), ensure_ascii=False, indent=1)
print("wrote dossier.json with", len(FINDINGS), "findings,", len(SOURCES), "sources")
