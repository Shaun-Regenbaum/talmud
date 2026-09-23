"""Build dossier.json for challenge-09 from the saved source files.

Every evidence quote is checked against the saved bytes. A quote matches either
the raw decoded text or the same text with HTML tags removed; the second case is
recorded as quote_normalization="html_tags_removed". The build fails on any miss.
"""

import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEFARIA = "https://www.sefaria.org/api/v3/texts/"
ALL = "?version=hebrew%7Call&version=english%7Call"

LOG = {e["saved_file"]: e for e in json.loads((HERE / "sources/fetch_log.json").read_text()) if "saved_file" in e}


def src(source_id, saved, url, edition, fetched_at=None, note=None):
    path = (HERE / saved).resolve()
    rec = {
        "source_id": source_id,
        "url_or_path": url,
        "edition": edition,
        "fetched_at": fetched_at or LOG.get(saved, {}).get("fetched_at"),
        "saved_file": saved,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
    if note:
        rec["note"] = note
    return rec, path


def v3(ref):
    from urllib.parse import quote

    return SEFARIA + quote(ref) + ALL


SOURCES = [
    src("S0", "../../../pilot/inputs/challenge-09.json", "research/sage-network/pilot/inputs/challenge-09.json",
        "Pilot input: Wikisource Talmud Bavli, Sanhedrin 59b:10-12 (read-only)", "2026-09-20T08:22:47Z",
        "fetched_at is the input's captured_at; file read, not modified"),
    src("S0b", "../../../pilot/outputs/challenge-09.json", "research/sage-network/pilot/outputs/challenge-09.json",
        "Pilot first reading (read-only)", None, "The earlier reading under review"),
    src("S1", "sources/sefaria_v3_sanhedrin_59b_all.json", v3("Sanhedrin 59b"),
        "Sefaria v3: Wikisource Talmud Bavli; William Davidson Edition (Vocalized Aramaic, Aramaic, English)",
        "2026-09-22T19:26:46Z",
        "Wikisource segments 10-12 reproduce the pilot input hashes exactly"),
    src("S2", "sources/sefaria_v3_sanhedrin_59a_all.json", v3("Sanhedrin 59a"),
        "Sefaria v3: Wikisource Talmud Bavli; William Davidson Edition"),
    src("S3", "sources/sefaria_links_sanhedrin_59b_12.json",
        "https://www.sefaria.org/api/links/Sanhedrin%2059b:12?with_text=0", "Sefaria links API",
        "2026-09-22T19:27:17Z"),
    src("S4", "sources/rashi_sanhedrin_59b.json", v3("Rashi on Sanhedrin 59b"), "Rashi, Vilna Edition (Sefaria)"),
    src("S5", "sources/steinsaltz_sanhedrin_59b_12.json", v3("Steinsaltz on Sanhedrin 59b:12"),
        "Steinsaltz, William Davidson Edition - Hebrew (Sefaria)"),
    src("S6", "sources/tosafot_sanhedrin_59b.json", v3("Tosafot on Sanhedrin 59b"), "Tosafot, Vilna Edition (Sefaria)",
        note="Saved version has comments only on 59b:3-4; nothing on 59b:12 in this saved text"),
    src("S7", "sources/maharsha_halachot_sanhedrin_59b_4.json", v3("Chidushei Halachot on Sanhedrin 59b:4"),
        "Maharsha, Chidushei Halachot, Vilna Edition (Sefaria)"),
    src("S8", "sources/arukh_laner_sanhedrin_59b_7.json", v3("Arukh LaNer on Sanhedrin 59b:7"),
        "Arukh LaNer, Warsaw 1873 (Sefaria)"),
    src("S9", "sources/reshimot_shiurim_sanhedrin_59b_10-14.json", v3("Reshimot Shiurim on Sanhedrin 59b:10-14"),
        "Reshimot Shiurim, New York 2022 (Sefaria)",
        note="Quotes the Ran on Sanhedrin; the Ran was not fetched directly"),
    src("S10", "sources/reshimot_shiurim_sanhedrin_59b_12.json", v3("Reshimot Shiurim on Sanhedrin 59b:12"),
        "Reshimot Shiurim, New York 2022 (Sefaria)"),
    src("S11", "sources/torah_temimah_gen_17_14_6.json", v3("Torah Temimah on Torah, Genesis 17:14:6"),
        "Torah Temimah, Vilna 1904 (Sefaria)"),
    src("S12", "sources/torah_temimah_gen_21_12_3.json", v3("Torah Temimah on Torah, Genesis 21:12:3"),
        "Torah Temimah, Vilna 1904 (Sefaria)"),
    src("S13", "sources/arukh_gimel_36.json", v3("Sefer HeArukh, Letter Gimel 36"),
        "Sefer HeArukh, Lublin 1883 (Sefaria)"),
    src("S14", "sources/ritva_avodah_zarah_27a_3.json", v3("Ritva on Avodah Zarah 27a:3"),
        "Ritva, Salonika 1758 (Sefaria)"),
    src("S15", "sources/rashash_yevamot_72a_3.json", v3("Rashash on Yevamot 72a:3"), "Rashash, Vilna Edition (Sefaria)"),
    src("S16", "sources/intro_amoraic_lit_part3_79.json",
        v3("Introductions to Amoraic Literature, Part III (Introduction to Talmud Yerushalmi), They said in the west (Amrei BeMaarava) etc 79"),
        "J. N. Epstein, Introductions to Amoraic Literature, Jerusalem 1962 (Sefaria)"),
    src("S17", "sources/intro_amoraic_lit_part3_80.json",
        v3("Introductions to Amoraic Literature, Part III (Introduction to Talmud Yerushalmi), They said in the west (Amrei BeMaarava) etc 80"),
        "J. N. Epstein, Introductions to Amoraic Literature, Jerusalem 1962 (Sefaria)"),
    src("S18a", "sources/intro_amoraic_lit_part3_77.json",
        v3("Introductions to Amoraic Literature, Part III (Introduction to Talmud Yerushalmi), They said in the west (Amrei BeMaarava) etc 77"),
        "J. N. Epstein, Introductions to Amoraic Literature, Jerusalem 1962 (Sefaria)", note="Context only"),
    src("S18b", "sources/intro_amoraic_lit_part3_78.json",
        v3("Introductions to Amoraic Literature, Part III (Introduction to Talmud Yerushalmi), They said in the west (Amrei BeMaarava) etc 78"),
        "J. N. Epstein, Introductions to Amoraic Literature, Jerusalem 1962 (Sefaria)", note="Context only"),
    src("S18c", "sources/intro_amoraic_lit_part3_81.json",
        v3("Introductions to Amoraic Literature, Part III (Introduction to Talmud Yerushalmi), They said in the west (Amrei BeMaarava) etc 81"),
        "J. N. Epstein, Introductions to Amoraic Literature, Jerusalem 1962 (Sefaria)", note="Context only"),
    src("S19", "sources/rambam_melachim_10_8.json", v3("Mishneh Torah, Kings and Wars 10:8"),
        "Mishneh Torah (Torat Emet; Wikisource) with English translations (Sefaria)"),
    src("S20", "sources/kessef_mishneh_melachim_10_7.json",
        v3("Kessef Mishneh on Mishneh Torah, Kings and Wars 10:7"), "Kessef Mishneh, Torat Emet 363 (Sefaria)"),
    src("S21", "sources/yad_ramah_sanhedrin_59b.json", v3("Yad Ramah on Sanhedrin 59b"),
        "Yad Ramah on Sanhedrin, Warsaw 1895 (Sefaria)"),
    src("S22", "sources/meiri_sanhedrin_59b.json", v3("Meiri on Sanhedrin 59b"), "Meiri on Shas (Sefaria)"),
    src("S23", "sources/minchat_chinukh_2_3_8.json", v3("Minchat Chinukh 2:3:8"), "Minchat Chinukh, Piotrkow 1902 (Sefaria)"),
    src("S24", "sources/sefaria_v3_yevamot_45b_all.json", v3("Yevamot 45b"),
        "Sefaria v3: Wikisource Talmud Bavli; William Davidson Edition"),
    src("S25", "sources/sefaria_v3_shabbat_68a_all.json", v3("Shabbat 68a"),
        "Sefaria v3: Wikisource Talmud Bavli; William Davidson Edition",
        note="Checked because Epstein lists it; the saved text names only R. Yosi bar Avin, with no alternative"),
    src("S26", "sources/soncino_halakhah_com_sanhedrin_59.html", "https://halakhah.com/sanhedrin/sanhedrin_59.html",
        "Soncino English translation as hosted at halakhah.com (translator not named on the saved page)",
        "2026-09-22T19:31:33Z"),
    src("S27", "sources/search_veitima_yosi_bar_zevida.json", "https://www.sefaria.org/api/search/text/_search",
        "Sefaria search, exact phrase 'ואיתימא רבי יוסי בר זבידא' (POST, size 100)"),
    src("S28", "sources/search_veitima_yosi_bar_hanina_full.json", "https://www.sefaria.org/api/search/text/_search",
        "Sefaria search, exact phrase 'ואיתימא רבי יוסי בר חנינא' (POST, size 100)"),
    src("S29", "sources/search_veitima_r_yosi_bar_hanina_abbr.json", "https://www.sefaria.org/api/search/text/_search",
        "Sefaria search, exact phrase \"ואיתימא ר' יוסי בר חנינא\" (POST, size 100)"),
    src("S30", "sources/search_yosi_bar_avin_veitima.json", "https://www.sefaria.org/api/search/text/_search",
        "Sefaria search, exact phrase 'יוסי בר אבין ואיתימא' (POST, size 100)"),
    src("S31", "sources/search_lerabot_bnei_keturah.json", "https://www.sefaria.org/api/search/text/_search",
        "Sefaria search, exact phrase 'לרבות בני קטורה' (POST, size 100)"),
]
PATHS = {rec["source_id"]: path for rec, path in SOURCES}
SOURCES = [rec for rec, _ in SOURCES]


def strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for x in obj:
            yield from strings(x)
    elif isinstance(obj, dict):
        for x in obj.values():
            yield from strings(x)


def texts(source_id):
    raw = PATHS[source_id].read_text(encoding="utf-8")
    if PATHS[source_id].suffix == ".json":
        return list(strings(json.loads(raw)))
    return [raw]


TAG = re.compile(r"<[^>]+>")


def ev(source_id, quote, translation=None):
    items = texts(source_id)
    rec = {"source_id": source_id, "exact_quote": quote}
    if any(quote in s for s in items):
        pass
    elif any(quote in TAG.sub("", s) for s in items):
        rec["quote_normalization"] = "html_tags_removed"
    else:
        raise SystemExit(f"quote not found in {source_id}: {quote}")
    if translation:
        rec["translation_by_this_dossier"] = translation
    return rec


_VOC = next(v["text"][11] for v in json.loads(PATHS["S1"].read_text())["versions"]
            if v["versionTitle"] == "William Davidson Edition - Vocalized Aramaic")
# Sliced from the saved string so combining-mark order is byte-exact.
VOC_OBJECTOR = _VOC[: _VOC.index(":")]
VOC_CITATION = _VOC[_VOC.index("? ") + 2 : _VOC.index(": ״")]

FOCAL = "מתקיף לה רב אושעיא אלא מעתה בני קטורה לא לחייבו האמר ר' יוסי בר אבין ואיתימא ר' יוסי בר חנינא (בראשית יז, יד) את בריתי הפר לרבות בני קטורה"

FINDINGS = [
    {
        "finding_id": "F1",
        "claim": "The subject is circumcision. The wider passage (59a-59b) asks why circumcision is not one of the Noahide commandments. One answer says circumcision was commanded only to Abraham and his offspring. The Ishmael, Esau and Keturah exchanges test that answer.",
        "kind": "textual",
        "evidence": [
            ev("S1", "אי בעית אימא מילה מעיקר' לאברהם הוא דקא מזהר ליה רחמנא ואתה את בריתי תשמור אתה וזרעך אחריך לדורותם אתה וזרעך אין איניש אחרינא לא",
               "If you wish, say: circumcision was from the outset commanded by the Merciful One to Abraham, 'and you shall keep My covenant, you and your offspring after you' - you and your offspring, yes; another person, no."),
            ev("S1", "והרי מילה שנאמרה לבני נח דכתיב (בראשית יז, ט) ואתה את בריתי תשמור ונשנית בסיני (ויקרא יב, ג) וביום השמיני ימול לישראל נאמרה ולא לבני נח",
               "But what of circumcision, which was said to the descendants of Noah ... and repeated at Sinai ... it was said to Israel and not to the descendants of Noah."),
        ],
        "reasoning": "This settles the first reading's needed_context: the obligation is circumcision. Rav Oshaya's 'אלא מעתה' ('if so, then') builds on the offspring answer at 59b:9-11.",
        "confidence": "high",
        "graph_effect": "Close the episode's needed_context. Abraham is named at 59b:9, which was outside the first reading's window, so add him as a biblical figure in the wider passage.",
    },
    {
        "finding_id": "F2",
        "claim": "The printed text reads 'האמר' before the two attributed teachers. The form is a rhetorical question ('but did he not say?'). Grammatically, it can close Rav Oshaya's objection or open an anonymous reply. The Hebrew itself does not mark the change of speaker.",
        "kind": "uncertainty",
        "evidence": [
            ev("S1", FOCAL,
               "Rav Oshaya objected: If so, the sons of Keturah should not be obligated? Did not R. Yosi bar Avin, and some say R. Yosi bar Hanina, say: 'he has broken My covenant' - to include the sons of Keturah."),
            ev("S1", VOC_CITATION),
        ],
        "reasoning": "In Talmudic Aramaic, 'הא אמר' / 'והאמר' often introduces a counter-citation inside a question. That supports reading the citation as the end of the objection: 'your rule exempts them, but a known teaching includes them'. It can also be heard as 'but surely X said'. That is a reply: the sons of Keturah are covered by a separate inclusion, so the offspring rule still stands. The general usage point is this dossier's reasoning, not something a fetched source says.",
        "confidence": "medium",
        "graph_effect": "Do not fix the citation's voice to Rav Oshaya. Add a reading group, 'citation_frame', with two branches: 'objection_continuation' (Rav Oshaya or the objection cites the teaching) and 'anonymous_reply' (the anonymous Talmud answers with the teaching).",
    },
    {
        "finding_id": "F3",
        "claim": "Three published translations or explanations read the citation as the reply, not as part of Rav Oshaya's objection: the William Davidson English, the Steinsaltz Hebrew and the Soncino English.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "Rav Oshaya objects to this: If that is so, the descendants of Keturah, Abraham’s second wife, should not be obligated to observe circumcision. The Gemara answers: Rabbi Yosei bar Avin says, and some say that it is Rabbi Yosei bar Ḥanina who says"),
            ev("S5", "ומשיבים: האמר [הרי אמר] ר' יוסי בר אבין, ואיתימא [ויש אומרים] שהיה זה ר' יוסי בר חנינא:",
               "And they reply: 'behold, R. Yosi bar Avin said, and some say it was R. Yosi bar Hanina'"),
            ev("S26", "R. Oshaia objected: If so, the children of Keturah should have been exempt!"),
            ev("S26", "Did not R. Jose b. Abin, or as others say, R. Jose b. Hanina, state:"),
            ev("S26", "This is the reply. The verse teaches the inclusion of the immediate sons of Keturah, but not of their descendants."),
        ],
        "reasoning": "All three end Rav Oshaya's words at 'לא לחייבו' and give the citation to the anonymous discussion: 'The Gemara answers', 'ומשיבים' and 'This is the reply'. These are modern editorial judgements. They are not manuscript evidence, and they may depend on one another.",
        "confidence": "high",
        "graph_effect": "Make 'anonymous_reply' the preferred branch of 'citation_frame', with provenance: the three translations. Keep 'objection_continuation' open (see F4, F5).",
    },
    {
        "finding_id": "F4",
        "claim": "Older authors do not settle who says the citation. The Minchat Chinukh summarises the whole line, including 'האמר', as the Talmud's own question and does not name Rav Oshaya. The Yad Ramah wonders what Rav Hoshaya based his objection on. He says that if the basis were the verse 'את בריתי הפר', there would be no objection.",
        "kind": "interpretation",
        "evidence": [
            ev("S23", "דמקשה הש\"ס אלא מעתה בני קטורה לא לחייבי האמר ריב\"א ואיתימא ריב\"ח את בריתי הפר לרבות בני קטורה",
               "that the Talmud asks: if so, the sons of Keturah should not be obligated - but did not R. Y. b. A., and some say R. Y. b. H., say ..."),
            ev("S21", "ולא ידענא מהיכא פשיטא ליה לרב הושעיא דבני קטורה חייבין דקא מקשי ליה אלא מעתה בני קטורה לא ליחייבו דמשמע דפשיטא לן דחייבין ואי משום דמשמע ליה את בריתי הפר לרבות בני קטורה א\"כ מאי קושיא דקא מקשי",
               "I do not know from where it is obvious to Rav Hoshaya that the sons of Keturah are obligated, that he objects 'if so, the sons of Keturah should not be obligated', which implies it is obvious to us that they are obligated; and if it is because he understands 'he has broken My covenant' as including the sons of Keturah, then what objection is he raising?"),
        ],
        "reasoning": "The Minchat Chinukh's summary joins the citation to the question (the 'objection_continuation' branch), but gives it to the Talmud, not to a named sage. The Yad Ramah does not treat the verse as Rav Hoshaya's stated ground. He raises it as a possible ground and rejects it because it makes the objection empty. That fits the view that Rav Hoshaya's own words end at 'לא ליחייבו'. From the saved text alone, it cannot be known whether the Yad Ramah's copy contained the R. Yosi clause.",
        "confidence": "medium",
        "graph_effect": "Record that commentators disagree about how the citation relates to the objection. Even under 'objection_continuation', the speaker may be the anonymous Talmud expanding the objection, not Rav Oshaya himself.",
    },
    {
        "finding_id": "F5",
        "claim": "Sefer HeArukh quotes this line with two differences from the printed text. It has 'אמר' ('said'), not 'האמר', and its alternative teacher is 'בר זבידא' (bar Zevida), not 'ר' יוסי בר חנינא'.",
        "kind": "textual",
        "evidence": [
            ev("S13", "כדגרסינן (סנהדרין נט) אלא מעתה בני קטורה לא ליחייבו אמר רבי יוסי בר אבין ואיתימא בר זבידא את בריתי הפר לרבות בני קטורה",
               "as we read (Sanhedrin 59): 'If so, the sons of Keturah should not be obligated. Said R. Yosi bar Avin, and some say bar Zevida: he has broken My covenant - to include the sons of Keturah.'"),
        ],
        "reasoning": "'כדגרסינן' ('as we read') presents this as the Arukh's text of Sanhedrin 59. A plain 'אמר' reads more easily as a reply or a separate statement than as a rhetorical counter-question. The saved file is the Lublin 1883 printing. Whether this was the medieval author's reading or came in during transmission of the Arukh is not checked here.",
        "confidence": "high",
        "graph_effect": "Treat the name of the second teacher as a textual variant: 'yosi_bar_hanina' in the printed Bavli, 'yosi_bar_zevida' in the Arukh. This variant sits inside the 'ואיתימא' alternative, so it is nested. Keep the two printed teachers as alternative attributions, and flag the second with the variant.",
    },
    {
        "finding_id": "F6",
        "claim": "J. N. Epstein says the Bavli regularly writes 'ר' יוסי בר אבין ואיתימא ר' יוסי בר זבידא'. He lists Sanhedrin 59b among places that should be corrected to that form ('וכצ\"ל', 'and so one should read').",
        "kind": "interpretation",
        "evidence": [
            ev("S16", "ונחלף להם לבבלים ר' יוסי בר זבידא (= ר' יוסי סתם בירוש') בר' יוסי בר אבין, כרגיל בבבלי בכ\"מ",
               "The Babylonians confused R. Yosi bar Zevida (= plain R. Yosi in the Yerushalmi) with R. Yosi bar Avin, as is usual in the Bavli in many places"),
            ev("S16", "ר' יוסי בר אבין ואיתימא ר' יוסי בר זבידא"),
            ev("S16", "ברכות יג א, שבת סח א, יבמות מה ב, כתובות מד ב, הוריות ד ע\"א וחולין נה א, וכצ\"ל בסוכה לז ב וסנהד' נט ב.",
               "Berakhot 13a, Shabbat 68a, Yevamot 45b, Ketubot 44b, Horayot 4a and Chullin 55a; and so one should read in Sukkah 37b and Sanhedrin 59b."),
            ev("S17", "בכ\"י פ' ורי\"ף: בר חנינא, וזו טעות.",
               "[about the Taanit case] in manuscript P and the Rif: bar Hanina, and this is an error."),
        ],
        "reasoning": "This is a scholar's emendation. The note does not say which manuscripts support it at Sanhedrin 59b, but it agrees with the Arukh (F5). Epstein's note on Taanit shows he regards 'bar Hanina' in this slot as a known scribal error elsewhere. Epstein's historical claim, that the Babylonians confused the two names, is his interpretation and is kept separate from the textual finding.",
        "confidence": "medium",
        "graph_effect": "Lower confidence in the printed 'ר' יוסי בר חנינא' as the second attribution. Do not delete it: the instruction is to keep both printed teachers as alternatives. Add 'yosi_bar_zevida' as a proposed variant, backed by the Arukh and Epstein.",
    },
    {
        "finding_id": "F7",
        "claim": "In the Sefaria search results checked here, R. Yosi bar Avin is paired with R. Yosi bar Zevida in several Bavli passages. The pairing 'R. Yosi bar Avin, and some say R. Yosi bar Hanina' appears only at Sanhedrin 59b:12. In Yevamot 45b, the Talmud itself reports that a story told of R. Yosi bar Avin was really about R. Yosi b. R. Zevida.",
        "kind": "textual",
        "evidence": [
            ev("S27", "מֵתִיב רַבִּי יוֹסֵי בַּר אָבִין, וְאִיתֵּימָא רַבִּי יוֹסֵי בַּר זְבִידָא"),
            ev("S27", "אמר ר' יוסי בר אבין ואיתימא רבי יוסי בר זבידא משל דסומכוס"),
            ev("S30", "א\"ר יוסי בר אבין ואיתימא ר' יוסי בר זבילא זאת אומרת"),
            ev("S29", "מתקיף לה רב אושעיא אלא מעתה בני קטורה לא לחייבו האמר ר' יוסי בר אבין ואיתימא ר' יוסי בר חנינא"),
            ev("S24", "איקלע ר' יוסי בר אבין לאתרין והוה עובדא בפנויה ואכשר באשת איש ופסיל א\"ר ששת לדידי אמר לי רב גזא לא ר' יוסי בר אבין הוה אלא רבי יוסי ברבי זבידא הוה",
               "R. Yosi bar Avin came to our place and there was a case ... Rav Sheshet said: to me Rav Geza said, it was not R. Yosi bar Avin but R. Yosi b. R. Zevida."),
        ],
        "reasoning": "The search results show Avin/Zevida pairs at Berakhot 13a, Ketubot 44b, Chullin 55a, Horayot 4a and Sukkah 37b. At Sukkah 37b the Wikisource text reads 'זבילא' and the Davidson text reads 'זבידא'. Both searches for 'ואיתימא ... יוסי בר חנינא' returned no other Bavli passage paired with bar Avin. This is limited to what Sefaria's search returned for the exact phrases. Spelling variants could be missed. Yevamot 45b is a story about one event, and the same two names are confused in it. That is transmission evidence only and does not make them one person.",
        "confidence": "medium",
        "graph_effect": "This supports F5 and F6. Record a corpus-level finding that bar Avin and bar Zevida often alternate. Do not merge R. Yosi bar Avin, R. Yosi bar Zevida and R. Yosi bar Hanina; different names are not evidence of one person or of two.",
    },
    {
        "finding_id": "F8",
        "claim": "The wider sugya is built on a principle of R. Yosi b. R. Hanina, stated at 59a. That name is written 'ר' יוסי בר' חנינא' at 59a and 'ר' יוסי בר חנינא' in the focal line.",
        "kind": "textual",
        "evidence": [
            ev("S2", "כדר' יוסי בר' חנינא דא\"ר יוסי בר' חנינא כל מצוה שנאמרה לבני נח ונשנית בסיני לזה ולזה נאמרה",
               "In accordance with R. Yosi b. R. Hanina, for R. Yosi b. R. Hanina said: every commandment stated to the descendants of Noah and repeated at Sinai was stated to both."),
        ],
        "reasoning": "This dossier's own hypothesis, not stated by any fetched source: the nearby name may have influenced a scribe to write 'בר חנינא' at 59b:12 where the Arukh has 'בר זבידא'. It is weak and unproven. Separately, the shared name 'Yosi' plus 'Hanina' does not show that the 59a sage and the second teacher at 59b:12 are the same person.",
        "confidence": "low",
        "graph_effect": "Add the two only as a coreference candidate for review, not a merge. Also record R. Yosi b. R. Hanina as the author of the principle discussed at 59a, which is outside the focal line.",
    },
    {
        "finding_id": "F9",
        "claim": "The Yad Ramah names the objector 'רב הושעיא' (Rav Hoshaya). The printed text has 'רב אושעיא'. The Soncino English has 'R. Oshaia'.",
        "kind": "textual",
        "evidence": [
            ev("S21", "מתקיף לה רב הושעיא אלא מעתה דלא פקדיה רחמנא אלא איצחק בני קטורה הילודים לאברהם לא ליחייבו",
               "Rav Hoshaya objected: if so, since the Merciful One commanded only regarding Isaac, the sons of Keturah born to Abraham should not be obligated."),
            ev("S1", VOC_OBJECTOR),
        ],
        "reasoning": "Aleph/he spelling variation is common in this name. It is a spelling variant of the same mention, not evidence of a different person. The Yad Ramah also says the objection targets the 'only Isaac' rule.",
        "confidence": "high",
        "graph_effect": "Add 'רב הושעיא' as a variant spelling on the Oshaya mention. Make no global identity claim.",
    },
    {
        "finding_id": "F10",
        "claim": "Commentators disagree about who 'בני קטורה' ('sons of Keturah') are. Rashi, Ritva, the Soncino note, and most commentators as reported by the Meiri say the six sons themselves, not their descendants. Rambam, as read by the Kessef Mishneh, the Maharsha and the Ran (quoted in Reshimot Shiurim), includes their descendants.",
        "kind": "interpretation",
        "evidence": [
            ev("S4", "לרבות בני קטורה - אותם ששה לבדם ולא זרעם אבל אברהם נצטוה לכל הנולדים לו:",
               "To include the sons of Keturah: those six alone and not their offspring; but Abraham was commanded regarding all born to him."),
            ev("S4", "בני קטורה - אותן ששה שנולדו לאברהם הן עצמן לא לחייבו ונימא השתא דלא מל אברהם כל בניו שהיו לו בחייו:",
               "The sons of Keturah: those six born to Abraham, they themselves should not be obligated, and shall we now say Abraham did not circumcise all the sons he had in his lifetime?"),
            ev("S14", "ויש לומר דההיא על בני קטורה לבדם ומדין יליד בית אבל זרעם אינם בני מילה",
               "One may say that it refers to the sons of Keturah alone, by the law of one born in the household, but their offspring are not subject to circumcision."),
            ev("S22", "ומ\"מ רוב מפרשים פירשו לרבות בני קטורה הם עצמם ולא זרעם",
               "In any case, most commentators explained 'to include the sons of Keturah' as themselves and not their offspring."),
            ev("S19", "אמרו חכמים שבני קטורה שהם זרעו של אברהם שבא אחר ישמעאל ויצחק חייבין במילה",
               "The Sages said that the sons of Keturah, who are the offspring of Abraham that came after Ishmael and Isaac, are obligated in circumcision."),
            ev("S20", "האמר ר' יוסי בר אבין ואי תימא ר\"י בר חנינא את בריתי הפר לרבות בני קטורה ומפרש דהיינו בני קטורה וזרעם",
               "... and he [Rambam] explains that this means the sons of Keturah and their offspring."),
            ev("S7", "ופי' אלא מעתה בני קטורה כו' לרבות בני קטורה כו' על זרעם של בני קטורה",
               "and he [Rambam] explained 'if so, the sons of Keturah' ... 'to include the sons of Keturah' as referring to the offspring of the sons of Keturah"),
            ev("S9", "רש\"י ז\"ל מפרש אותן בנים שילדה קטורה לאברהם בלבד שהיה אברהם חייב בהן. ולא מחוור",
               "[Ran, as quoted:] Rashi explains: only those sons whom Keturah bore to Abraham, for whom Abraham was obligated. And this is not clear."),
            ev("S11", "ובעיקר מחלוקת רש\"י ורמב\"ם אם בני קטורה נצטוו גם לדורות או לא",
               "On the basic dispute between Rashi and Rambam whether the sons of Keturah were commanded for later generations too, or not."),
        ],
        "reasoning": "The Talmud text only says 'בני קטורה'. Whether that means six sons or a lineage is a commentary dispute. The father-son link between Abraham and Keturah's sons comes from Rashi ('שנולדו לאברהם') and the Rambam ('זרעו של אברהם'), with Genesis 25 in the background. The focal line does not state it. The Ran's words are known here only as quoted in Reshimot Shiurim.",
        "confidence": "high",
        "graph_effect": "Give the 'k_desc' group a scope reading group: 'six_sons' (Rashi, Ritva, Soncino note, most commentators per the Meiri) versus 'lineage' (Rambam per the Kessef Mishneh and the Maharsha; the Ran as quoted). A father-child edge from Abraham to Keturah's sons is commentary or biblical background with that provenance, not a claim of the focal line.",
    },
    {
        "finding_id": "F11",
        "claim": "The Maharsha, explaining Rambam's view, grounds the objection in what can be observed: many nations descended from Keturah practise circumcision, which shows they were obligated. On that account, the objection does not rest on R. Yosi's teaching.",
        "kind": "interpretation",
        "evidence": [
            ev("S7", "ופריך הכי בפשיטות דלא ליחייבו לפי מה שאנו רואים דהרבה אומות מבני קטורה שקבלו עליהם מצות מילה דמוכח דנתחייבו",
               "and he asks this simply, 'they should not be obligated?', according to what we see, that many nations from the sons of Keturah took upon themselves circumcision, which shows that they were obligated"),
            ev("S8", "לפי מה שכ' הר\"ן דודאי דאבני קטורה ל\"ק דהא הוצרך אברהם למול אותם משום יליד בית ולכן לא פריך רק אזרע דב\"ק",
               "according to what the Ran wrote, about the sons of Keturah themselves there is no difficulty, since Abraham had to circumcise them as household-born; therefore he asks only about the offspring of the sons of Keturah"),
        ],
        "reasoning": "If the ground is observation, the citation of R. Yosi does the answering, which fits the 'anonymous_reply' branch. This is the Maharsha's reconstruction of the argument, not something the text says.",
        "confidence": "medium",
        "graph_effect": "This supports the 'anonymous_reply' branch as a commentary reading. Save it as interpretation with the Maharsha's name on it.",
    },
    {
        "finding_id": "F12",
        "claim": "No reading checked makes Rav Oshaya hear, meet or study with either R. Yosi, and there is no chain of transmission. The two R. Yosis are alternative answers to one question, 'who said this teaching?'. They are not two people who both said it, and they are not linked to each other.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "האמר ר' יוסי בר אבין ואיתימא ר' יוסי בר חנינא"),
            ev("S5", "ואיתימא [ויש אומרים] שהיה זה ר' יוסי בר חנינא:",
               "and some say it was R. Yosi bar Hanina"),
        ],
        "reasoning": "Under 'anonymous_reply', the Talmud's editors set a teaching against Rav Oshaya's challenge. The link is between statements, and neither person speaks to the other. Under 'objection_continuation', the objection cites a known teaching. That is a literary citation, which may be the editors' elaboration, not evidence that Rav Oshaya heard it from either sage. 'ואיתימא' signals uncertainty about whose teaching it is.",
        "confidence": "high",
        "graph_effect": "Create no edges between Oshaya and Yosi bar Avin or Yosi bar Hanina, such as heard_from, met or student_of, and no edge between the two Yosis. At most, record a statement-level 'answered_by' or 'cites' relation, with the speaker left branch-dependent.",
    },
    {
        "finding_id": "F13",
        "claim": "The Davidson English adds family information that the Aramaic does not contain: 'Abraham’s second wife' for Keturah and 'Isaac’s son' for Esau.",
        "kind": "textual",
        "evidence": [
            ev("S1", "the descendants of Keturah, Abraham’s second wife, should not be obligated"),
            ev("S1", "the descendants of Esau, Isaac’s son, should be obligated"),
            ev("S1", "בני עשו לחייבו ביצחק ולא כל יצחק"),
        ],
        "reasoning": "In that edition, bold marks the literal translation and plain text marks the translator's explanation. These phrases are unbolded glosses. The Talmud does imply that Esau's line belongs to 'Isaac', because 'ביצחק ולא כל יצחק' ('in Isaac, but not all of Isaac') is the reason given for excluding Esau's descendants.",
        "confidence": "high",
        "graph_effect": "Family edges such as Keturah wife_of Abraham should carry provenance 'translator gloss / biblical background', not 'Talmud text'. An Esau-Isaac descent link is at most implied by the argument.",
    },
    {
        "finding_id": "F14",
        "claim": "The Meiri gives the teaching with no name at all ('והוא שאמרו', 'and this is what they said'), and the Arukh drops the title and first name of the second teacher ('ואיתימא בר זבידא'). Later authors cite this line in different ways.",
        "kind": "textual",
        "evidence": [
            ev("S22", "אבל בני קטורה שנולדו אחרי יצחק וישמעאל חייבים והוא שאמרו את בריתי הפר לרבות בני קטורה",
               "but the sons of Keturah, born after Isaac and Ishmael, are obligated, and this is what they said: 'he has broken My covenant' to include the sons of Keturah"),
            ev("S13", "ואיתימא בר זבידא"),
        ],
        "reasoning": "When a later author paraphrases a line and leaves out a name, that is not evidence that the name was absent from the author's Talmud text.",
        "confidence": "high",
        "graph_effect": "Do not treat the Meiri's missing names as a textual variant.",
    },
]

ALTERNATIVES = [
    {
        "id": "citation_frame",
        "question": "Who says the 'האמר ...' citation?",
        "branches": [
            {"id": "anonymous_reply", "reading": "Rav Oshaya's words end at 'לא לחייבו'. The anonymous Talmud replies with the teaching: the sons of Keturah are covered by a separate inclusion, so the offspring rule stands.",
             "held_by": ["William Davidson English (S1)", "Steinsaltz Hebrew (S5)", "Soncino English note 17 (S26)", "compatible with the Maharsha on Rambam's view (S7)", "fits the Arukh's plain 'אמר' (S13)"]},
            {"id": "objection_continuation", "reading": "The citation completes the objection: 'your rule exempts them, but a known teaching includes them'. Its speaker is Rav Oshaya or the anonymous Talmud expanding his objection.",
             "held_by": ["the printed 'האמר' rhetorical form (S1)", "Minchat Chinukh's summary, which gives the question to the Talmud, not to Rav Oshaya by name (S23)"]},
        ],
        "notes": "The Yad Ramah (S21) considers the verse as Rav Hoshaya's possible basis and rejects it. The saved sources do not show which branch is original.",
    },
    {
        "id": "attribution",
        "question": "Whose teaching is 'את בריתי הפר לרבות בני קטורה'?",
        "branches": [
            {"id": "yosi_bar_avin", "reading": "R. Yosi bar Avin, in every text checked (S1, S13, S20, S23, S26)"},
            {"id": "second_teacher", "reading": "the 'ואיתימא' alternative, whose own name varies",
             "nested_variants": [
                 {"id": "yosi_bar_hanina", "reading": "ר' יוסי בר חנינא", "held_by": ["Wikisource and Davidson printed text (S1)", "Kessef Mishneh (S20)", "Minchat Chinukh (S23)", "Soncino (S26)"]},
                 {"id": "yosi_bar_zevida", "reading": "בר זבידא", "held_by": ["Sefer HeArukh, Lublin 1883 (S13)", "Epstein's emendation (S16)"]},
             ]},
        ],
    },
    {
        "id": "keturah_scope",
        "question": "Who does 'בני קטורה' cover?",
        "branches": [
            {"id": "six_sons", "held_by": ["Rashi (S4)", "Ritva (S14)", "Soncino note 17 (S26)", "most commentators per the Meiri (S22)"]},
            {"id": "lineage", "held_by": ["Rambam (S19) as read by the Kessef Mishneh (S20) and the Maharsha (S7)", "the Ran as quoted in Reshimot Shiurim (S9)"]},
        ],
    },
]

UNRESOLVED = [
    "No manuscript of Sanhedrin 59b was consulted. The Munich, Florence, Karlsruhe and Yemenite witnesses and Dikdukei Soferim were not accessed, so neither the 'האמר'/'אמר' question nor the 'בר חנינא'/'בר זבידא' question is settled by manuscript evidence.",
    "The Ran on Sanhedrin was not fetched directly. His words are known only as quoted in Reshimot Shiurim (S9).",
    "The Arukh was read in its Lublin 1883 printing. Its critical edition was not checked.",
    "Epstein lists Shabbat 68a among places with the Avin/Zevida formula, but the saved Shabbat 68a texts (S25) name only R. Yosi bar Avin. His reference may point to another witness or another line. This was not resolved.",
    "It is not known whether the Yad Ramah's text contained the R. Yosi clause.",
    "Sefaria's links (S3) point to commentaries not fetched here: Peri Tzadik, the commentary on the Sefer Hamitzvot of Rasag and Keli Chemdah. Their readings of the citation were not checked.",
]

CORRECTIONS = [
    {"existing_claim_id": "c5", "change": "Change voice from 'oshaya' to depend on the branch ('citation_frame'). Under 'anonymous_reply' the citation is the narrator's reply. Remove or make conditional the note 'Quoted inside the reported objection.'", "why": "F2, F3, F4: three published translations read it as a reply, and the Hebrew does not mark the change of speaker."},
    {"existing_claim_id": "c7", "change": "Same voice change as c5. Also flag that the subject's name has a nested variant: 'yosi_hanina' in print versus 'bar Zevida' in the Arukh and in Epstein's emendation.", "why": "F2-F7"},
    {"existing_claim_id": "c3", "change": "Make the role 'counterevidence: include' conditional on 'objection_continuation'. Under 'anonymous_reply', add a separate relation: the anonymous discussion answers Oshaya's objection with 'include'.", "why": "F2, F3"},
    {"existing_claim_id": "c6", "change": "Make this conditional on the printed reading 'ר' יוסי בר חנינא'. It lapses under the 'bar Zevida' variant.", "why": "F5, F6"},
    {"existing_claim_id": "c4/c6 and entities avin, hanina", "change": "Save 'Avin' and 'Hanina' as parts of the patronymic name, not as standalone person nodes. child_of stays a name-internal claim, with no historical weight.", "why": "The patronymic names a father who plays no part in the passage, so a separate person node adds nothing the passage supports."},
    {"existing_claim_id": "reading_groups.attribution", "change": "Keep both branches and add the nested textual variant for the second teacher. Correct its scope, which currently reads 'Attribution of the teaching quoted in Oshaya’s objection', to 'the teaching cited in reply to, or within, Oshaya’s objection'.", "why": "F5, F6, F2"},
    {"existing_claim_id": "entity oshaya", "change": "Add the variant spelling 'רב הושעיא' (Yad Ramah).", "why": "F9"},
    {"existing_claim_id": "entity k_desc", "change": "Add a scope reading group: 'six_sons' versus 'lineage'.", "why": "F10"},
    {"existing_claim_id": "episode.needed_context", "change": "Resolve: the obligation is circumcision (59b:9). Add Abraham from the wider passage.", "why": "F1"},
]

LESSONS = [
    "A quoted teaching introduced by 'האמר' / 'והאמר' needs a speaker branch. The same words can end an objection or begin an anonymous reply. A reader should not give it the objector's voice without evidence.",
    "An 'ואיתימא' alternative can itself carry a textual variant. Here the second teacher is bar Hanina in print and bar Zevida in the Arukh. The contract needs nested variants inside a branch; the pilot README already flags nested dependencies.",
    "Recurring name-pair formulas across the corpus ('X ואיתימא Y') are useful evidence for textual criticism. A one-off pairing is a signal to check manuscripts and medieval quotations before building any edge on it.",
    "Unbolded glosses in a translation (such as 'Abraham’s second wife') are not the text. Family edges need provenance: Talmud text, commentary, translator or biblical background.",
    "Group membership ('בני קטורה') can be disputed by commentators. Model its scope as a reading group with named holders.",
    "A patronymic parent should not become a person node by default.",
    "When a later author paraphrases without a name (the Meiri's 'שאמרו'), that is not evidence the name was absent from the text they read.",
]

dossier = {
    "job_id": "challenge-09",
    "focal_ref": "Sanhedrin 59b:12",
    "status": "researched",
    "question": "Is the citation beginning 'האמר' part of Rav Oshaya's objection or an anonymous reply? What does the wider passage (Sanhedrin 59a-59b) support about people and relations, keeping R. Yosi bar Avin and R. Yosi bar Hanina as alternative attributions?",
    "scope_note": "Checked: the Sefaria texts of Sanhedrin 59a-59b (Wikisource and William Davidson editions), the commentaries and later works listed in sources, the Soncino English at halakhah.com, and Sefaria exact-phrase searches. No manuscripts. Translations labelled 'translation_by_this_dossier' are this dossier's brief renderings.",
    "sources": SOURCES,
    "findings": FINDINGS,
    "alternative_readings": ALTERNATIVES,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
    "graph_status": "All graph effects are provisional proposals. No historical identity, date or meeting is asserted.",
}

(HERE / "dossier.json").write_text(json.dumps(dossier, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("ok", len(SOURCES), "sources", len(FINDINGS), "findings")
