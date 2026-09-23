"""Build dossier.json for original-10 (Pesachim 103a:7) from saved sources.

Hashes are computed from the saved bytes; fetch times come from sources/fetch_log.jsonl."""

import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
LOG = {}
for line in (HERE / "sources/fetch_log.jsonl").read_text().splitlines():
    rec = json.loads(line)
    if "saved_file" in rec:
        LOG[rec["saved_file"]] = rec

SOURCES = [
    ("S00", "input.json", "Job input, lake snapshot 2 (unchanged)"),
    ("S01", "sources/pes103a_he.json", "William Davidson Edition - Vocalized Aramaic (Sefaria), Pesachim 103a"),
    ("S02", "sources/pes103a_en.json", "William Davidson Edition - English (Koren / Steinsaltz), Pesachim 103a"),
    ("S03", "sources/pes103a_wikisource.json", "Wikisource Talmud Bavli (Sefaria), Pesachim 103a"),
    ("S04", "sources/pes102b_he.json", "William Davidson Edition - Vocalized Aramaic, Pesachim 102b"),
    ("S05", "sources/pes102b_en.json", "William Davidson Edition - English, Pesachim 102b"),
    ("S06", "sources/links_pes103a_7.json", "Sefaria links index for Pesachim 103a:7"),
    ("S07", "sources/links_pes103a_6.json", "Sefaria links index for Pesachim 103a:6"),
    ("S08", "sources/links_pes103a_8.json", "Sefaria links index for Pesachim 103a:8"),
    ("S09", "sources/rashbam_pes103a.json", "Rashbam on Pesachim 103a, Vilna Edition"),
    ("S10", "sources/rashi_pes103a.json", "Rashi on Pesachim 103a, Vilna Edition"),
    ("S11", "sources/steinsaltz_pes103a.json", "Steinsaltz on Pesachim 103a, William Davidson Edition - Hebrew"),
    ("S12", "sources/tosafot_pes103a.json", "Tosafot on Pesachim 103a, Vilna Edition"),
    ("S13", "sources/ber52b_he.json", "William Davidson Edition - Vocalized Aramaic, Berakhot 52b"),
    ("S14", "sources/ber52b_en.json", "William Davidson Edition - English, Berakhot 52b"),
    ("S15", "sources/ber52b_wikisource.json", "Wikisource Talmud Bavli (Sefaria), Berakhot 52b"),
    ("S16", "sources/rashi_ber52b.json", "Rashi on Berakhot 52b, Vilna Edition"),
    ("S17", "sources/steinsaltz_ber52b.json", "Steinsaltz on Berakhot 52b, William Davidson Edition - Hebrew"),
    ("S18", "sources/tosafot_ber52b.json", "Tosafot on Berakhot 52b, Vilna Edition"),
    ("S19", "sources/mishnah_ber8_5.json", "Mishnah Berakhot 8:5, Torat Emet 357"),
    ("S20", "sources/tosefta_lieberman_ber5_30.json", "Tosefta Berakhot (Lieberman) 5:30, according to codex Vienna, JTS 2001"),
    ("S21", "sources/tosefta_vilna_ber5_31.json", "Tosefta Berakhot 5:31 (Sefaria default text, from mechon-mamre)"),
    ("S22", "sources/tosefta_vilna_ber5_30.json", "Tosefta Berakhot 5:30 (Sefaria default text, from mechon-mamre)"),
    ("S23", "sources/tosefta_vilna_ber5_25.json", "Tosefta Berakhot 5:25 (Sefaria default text, from mechon-mamre)"),
    ("S24", "sources/yerushalmi_ber8_5_2.json", "Jerusalem Talmud Berakhot 8:5:2, Guggenheimer Hebrew edition"),
    ("S25", "sources/yerushalmi_ber8_5_2_en.json", "Jerusalem Talmud Berakhot 8:5:2, Guggenheimer English translation"),
    ("S26", "sources/yerushalmi_ber8_5_2_venice.json", "Jerusalem Talmud Berakhot 8:5:2, Venice Edition (Sefaria)"),
    ("S27", "sources/yerushalmi_ber8_5_2_mechon_mamre.json", "Jerusalem Talmud Berakhot 8:5:2, Mechon-Mamre (Sefaria)"),
    ("S28", "sources/rif_pes21a.json", "Rif Pesachim 21a, Vilna Edition"),
]


def source_records():
    out = []
    for sid, path, edition in SOURCES:
        data = (HERE / path).read_bytes()
        rec = {"source_id": sid, "edition": edition, "saved_file": path,
               "sha256": hashlib.sha256(data).hexdigest()}
        if path == "input.json":
            rec["url"] = "research/sage-network/followup-v1/cases/original-10/input.json"
            rec["input_path"] = rec["url"]
            rec["fetched_at"] = None
        else:
            rec["url"] = LOG[path]["url"]
            rec["fetched_at"] = LOG[path]["fetched_at"]
            if LOG[path]["sha256"] != rec["sha256"]:
                raise SystemExit(f"saved bytes changed since fetch: {path}")
        out.append(rec)
    return out


def ev(sid, quote, translation=None):
    item = {"source_id": sid, "exact_quote": quote}
    if translation:
        item["translation_by_researcher"] = "Researcher translation: " + translation
    return item


FINDINGS = [
    {
        "finding_id": "F01",
        "claim": "The focal segment is the last of four moves in one narrated exchange that starts at 103a:5. First, Rava is shown performing a practice: at Rava's house he blesses the spices before the light, with Rav Huna bar Yehuda present. Second, Rav Huna bar Yehuda challenges him on the spot. Third, a source is supplied: the Mishnah, in which both schools put the candle first. Fourth, at 103a:7, Rava answers.",
        "kind": "textual",
        "evidence": [
            ev("S01", "רַב הוּנָא בַּר יְהוּדָה אִיקְּלַע לְבֵי רָבָא, אַיְיתוֹ לְקַמַּיְיהוּ מָאוֹר וּבְשָׂמִים. בָּרֵיךְ רָבָא אַבְּשָׂמִים בְּרֵישָׁא וַהֲדַר אַמָּאוֹר.",
               "'Rav Huna bar Yehuda happened to come to Rava's house. They brought before them light and spices. Rava blessed over the spices first and then over the light.'"),
            ev("S01", "אֲמַר לֵיהּ: וְהָא בֵּין בֵּית שַׁמַּאי וּבֵין בֵּית הִילֵּל — מָאוֹר בְּרֵישָׁא וַהֲדַר אַבְּשָׂמִים.",
               "'He said to him: But according to both Beit Shammai and Beit Hillel, light comes first and then spices!'"),
            ev("S01", "וּמַאי הִיא? דִּתְנַן, בֵּית שַׁמַּאי אוֹמְרִים: נֵר וּמָזוֹן, בְּשָׂמִים וְהַבְדָּלָה. וּבֵית הִילֵּל אוֹמְרִים: נֵר וּבְשָׂמִים, וּמָזוֹן וְהַבְדָּלָה.",
               "'And what is it? As we learned [in the Mishnah]: Beit Shammai say: candle and food [Grace], spices and havdala. Beit Hillel say: candle and spices, and food and havdala.'"),
            ev("S01", "עָנֵי רָבָא בָּתְרֵיהּ וְאָמַר: זוֹ דִּבְרֵי רַבִּי מֵאִיר",
               "'Rava answered after him and said: This is the statement of Rabbi Meir'"),
        ],
        "reasoning": "The words 'אמר ליה' in 103a:5 have no new subject, so the speaker is still Rav Huna bar Yehuda, the visitor just named, and the addressee is Rava. Rashbam states this outright (F02). 'בתריה' (after him) in 103a:7 points back to that challenger. So 103a:7 is Rava's reply inside a single narrated encounter, not a free-standing statement.",
        "confidence": "high",
        "graph_effect": "Add a narrated encounter between Rava and Rav Huna bar Yehuda: a visit at Rava's house (103a:5). Add challenges: Rav Huna bar Yehuda -> Rava (103a:5). Add responds_to: Rava -> Rav Huna bar Yehuda (103a:7). Within 103a:5-8 this is the only narrated co-presence (103a:9 narrates a separate visit). Treat it as a literary narrative of a meeting, not an independently dated event.",
    },
    {
        "finding_id": "F02",
        "claim": "Commentary (Rashbam) confirms that Rav Huna bar Yehuda is the challenger and Rava the addressee. Rashbam says the challenge came after Rava finished havdala, on the close of an ordinary Shabbat. He also records that he rejects a reading 'ולא פליגי' (and they do not disagree) in the challenge.",
        "kind": "interpretation",
        "evidence": [
            ev("S09", "א\"ל - רב הונא לרבא לאחר שגמר הבדלה והא בין ב\"ש כו' ולא פליגי לא גרסינן:",
               "'He said to him: Rav Huna to Rava, after he finished havdala. \"But both Beit Shammai...\" We do not read \"and they do not disagree\".'"),
            ev("S09", "רב הונא בר יהודה איקלע לבי רבא - במוצאי שבת של חול:",
               "'Rav Huna bar Yehuda happened to come to Rava's house: on the close of a Shabbat followed by a weekday.'"),
        ],
        "reasoning": "This is a commentator's reading. It identifies the speaker and addressee and makes a textual choice. The rejected reading 'ולא פליגי' is a source-variant note: Rashbam knew texts with those words. That wording closely resembles the Berakhot 52b parallel's 'לא פליגי' (F07). That the rejected reading came from the Berakhot parallel is my inference, not something Rashbam says.",
        "confidence": "high",
        "graph_effect": "This supports the direction of F01's challenge and response edges. Store 'ולא פליגי לא גרסינן' as a commentator's source-variant note on 103a:5. It does not change any person relation.",
    },
    {
        "finding_id": "F03",
        "claim": "In 103a:7 Rava names two tannaim, but he meets neither. He labels the Mishnah's version of the Beit Shammai / Beit Hillel dispute as 'the words of Rabbi Meir', and he sets against it a version taught in Rabbi Yehuda's name. Rava attributes one text and quotes another. Neither act describes an encounter.",
        "kind": "textual",
        "evidence": [
            ev("S01", "זוֹ דִּבְרֵי רַבִּי מֵאִיר, אֲבָל רַבִּי יְהוּדָה אוֹמֵר: לֹא נֶחְלְקוּ בֵּית שַׁמַּאי וּבֵית הִילֵּל עַל הַמָּזוֹן שֶׁהוּא בַּתְּחִלָּה וְעַל הַבְדָּלָה שֶׁהִיא בַּסּוֹף,",
               "'This is the statement of Rabbi Meir, but Rabbi Yehuda says: Beit Shammai and Beit Hillel did not disagree over the food [Grace], which is first, or over havdala, which is last'"),
            ev("S03", "עני רבא בתריה ואמר זו דברי ר' מאיר אבל ר' יהודה אומר לא נחלקו בית שמאי ובית הילל על המזון שהוא בתחלה ועל הבדלה שהיא בסוף"),
        ],
        "reasoning": "'זו' (this) refers to the Mishnah just quoted in 103a:6. 'זו דברי רבי מאיר' is therefore an amora assigning an anonymous tannaitic text to a named tanna. 'רבי יהודה אומר' introduces a tannaitic teaching, which the Tosefta preserves under Rabbi Yehuda's name (F06). The William Davidson and Wikisource texts agree word for word, apart from vocalisation and abbreviation. Both are printed-tradition digital texts, not independent manuscripts.",
        "confidence": "high",
        "graph_effect": "Change the Rava -> Rabbi Meir pair from 'explains'/'disputes' to attributes_text_to: Rava says the anonymous Mishnah is Rabbi Meir's version. Add cites_teaching: Rava -> Rabbi Yehuda. Add no meeting, teacher, or contemporaneity edge between Rava and either tanna.",
    },
    {
        "finding_id": "F04",
        "claim": "Commentary (Rashbam) explains Rava's attribution by a general rule: an anonymous Mishnah follows Rabbi Meir. On this reading, the Mishnah is how Rabbi Meir taught the schools' dispute. So Rabbi Meir and Rabbi Yehuda disagree about what the two schools disagreed about. This is a disagreement between two reports of an earlier dispute.",
        "kind": "interpretation",
        "evidence": [
            ev("S09", "זו דברי ר\"מ - דהכי הוו תני לפלוגתייהו דב\"ש וב\"ה דסתם מתני' ר\"מ:",
               "'This is Rabbi Meir's statement: because this is how he taught the dispute of Beit Shammai and Beit Hillel, since an anonymous Mishnah is Rabbi Meir.'"),
            ev("S01", "לֹא נֶחְלְקוּ בֵּית שַׁמַּאי וּבֵית הִילֵּל עַל הַמָּזוֹן שֶׁהוּא בַּתְּחִלָּה",
               "'Beit Shammai and Beit Hillel did not disagree over the food, which is first'"),
        ],
        "reasoning": "Rabbi Yehuda's 'לא נחלקו... על מה נחלקו' (they did not disagree about X; about what did they disagree?) is a form that corrects another report of a dispute. In the Tosefta, Rabbi Yehuda's sentence stands with no Rabbi Meir named (F06). The name Rabbi Meir therefore enters through Rava's attribution. Rashbam explains that attribution with the anonymous-Mishnah rule. The two tannaim are not shown talking to each other.",
        "confidence": "medium",
        "graph_effect": "Keep Rabbi Meir <-> Rabbi Yehuda as disputes, but subtype it as disagrees_on_report_of_earlier_dispute. Record the provenance: Rabbi Meir's side comes from Rava's attribution, which Rashbam explains by the anonymous-Mishnah rule. Do not add a direct-exchange edge between the two tannaim from this passage.",
    },
    {
        "finding_id": "F05",
        "claim": "Rabbi Yehuda does not 'explain' Beit Shammai. He reports the positions of both schools and says where their dispute lies: over light and spices. In this report Beit Shammai put light first and Beit Hillel put spices first. The segment also contains a Beit Shammai vs Beit Hillel dispute, and it appears in both versions (Mishnah and Rabbi Yehuda).",
        "kind": "textual",
        "evidence": [
            ev("S01", "עַל מָה נֶחְלְקוּ? עַל הַמָּאוֹר וְעַל הַבְּשָׂמִים. בֵּית שַׁמַּאי אוֹמְרִים: מָאוֹר וְאַחַר כָּךְ בְּשָׂמִים, וּבֵית הִילֵּל אוֹמְרִים: בְּשָׂמִים וְאַחַר כָּךְ מָאוֹר.",
               "'About what did they disagree? About light and spices. Beit Shammai say: light and afterwards spices; Beit Hillel say: spices and afterwards light.'"),
        ],
        "reasoning": "The input pair's pattern '[A] אומר לא נחלקו [B]' catches only the first-named school. Rabbi Yehuda's statement concerns both schools equally. Beit Shammai and Beit Hillel are collective schools, not individuals. The segment boundary falls mid-sentence: 103a:7 ends with a comma and 103a:8 continues the same statement.",
        "confidence": "high",
        "graph_effect": "Replace 'Rabbi Yehuda explains Beit Shammai' with two edges: reports_position_of Rabbi Yehuda -> Beit Shammai and reports_position_of Rabbi Yehuda -> Beit Hillel. Add disputes Beit Shammai <-> Beit Hillel, stored once, with two version branches (the Mishnah per Rava's attribution to Rabbi Meir, and Rabbi Yehuda). Type both nodes as collective schools. Read 103a:7 together with 103a:8.",
    },
    {
        "finding_id": "F06",
        "claim": "The Tosefta preserves Rabbi Yehuda's teaching on its own, with the same assignment of positions to the schools as the Bavli. Two editions on Sefaria were checked: Lieberman (codex Vienna) and the default text. Neither names Rabbi Meir in this sentence.",
        "kind": "textual",
        "evidence": [
            ev("S20", "אמ' ר' יהודה לא נחלקו בית שמיי ובית הלל על ברכת המזון שהיא בתחלה ועל הבדלה שהיא בסוף, על מה נחלקו על המאור ועל הבשמים, שבית שמיי אומר מאור ואחר כך בשמים, ובית הלל או' בשמים ואחר כך מאור.",
               "'Rabbi Yehuda said: Beit Shammai and Beit Hillel did not disagree over Grace after Meals, which is first, or over havdala, which is last. About what did they disagree? About light and spices: Beit Shammai say light and then spices, Beit Hillel say spices and then light.'"),
            ev("S21", "א\"ר יהודה לא נחלקו ב\"ש וב\"ה על ברהמ\"ז שבתחלה ועל הבדלה שבסוף"),
        ],
        "reasoning": "Both Tosefta texts attribute the teaching to Rabbi Yehuda, which supports the Bavli's 'רבי יהודה אומר'. The Tosefta reads 'ברכת המזון' where the Bavli has 'המזון'. That is a small wording difference, not a change in who holds what. Sefaria's links index ties 103a:7-8 to several Tosefta numbers (5:25, 5:30, 5:31, Lieberman 5:30). The Rabbi Yehuda sentence appears at Lieberman 5:30 and default-text 5:31. Default-text 5:25 and 5:30 deal with other Beit Shammai / Beit Hillel meal disputes.",
        "confidence": "high",
        "graph_effect": "Attach the Tosefta as a tannaitic witness for Rabbi Yehuda's reports_position_of edges (F05). Because the Tosefta names no Rabbi Meir here, the Rabbi Meir side of F04 remains an amoraic attribution.",
    },
    {
        "finding_id": "F07",
        "claim": "The Bavli tells the same exchange at Berakhot 52b in different words. There, Rav Huna bar Yehuda saw Rava bless the spices first, and the Mishnah text sits inside his own challenge, introduced by 'דתניא'. Pesachim has a separate 'ומאי היא? דתנן' step. Berakhot also lacks 'ואמר' after 'עני רבא בתריה'.",
        "kind": "textual",
        "evidence": [
            ev("S13", "רַב הוּנָא בַּר יְהוּדָה אִיקְּלַע לְבֵי רָבָא. חַזְיֵיהּ לְרָבָא דְּבָרֵיךְ אַבְּשָׂמִים בְּרֵישָׁא. אֲמַר לֵיהּ: מִכְּדִי בֵּית שַׁמַּאי וּבֵית הִלֵּל אַמָּאוֹר לָא פְּלִיגִי, דְּתַנְיָא",
               "'Rav Huna bar Yehuda happened to come to Rava's house. He saw Rava blessing over the spices first. He said to him: Now, Beit Shammai and Beit Hillel do not disagree about the light, as it is taught...'"),
            ev("S13", "עָנֵי רָבָא בָּתְרֵיהּ: זוֹ דִּבְרֵי רַבִּי מֵאִיר",
               "'Rava answered after him: This is the statement of Rabbi Meir'"),
            ev("S15", "א\"ל מכדי ב\"ש וב\"ה אמאור לא פליגי דתניא בש\"א נר ומזון בשמים והבדלה"),
            ev("S01", "וּמַאי הִיא? דִּתְנַן,",
               "'And what is it? As we learned [in the Mishnah]'"),
        ],
        "reasoning": "In Berakhot the source citation is grammatically part of Rav Huna bar Yehuda's speech. In Pesachim, 'ומאי היא' can be read either as the anonymous Gemara stepping in to supply the source or as Rav Huna bar Yehuda continuing. The Berakhot wording favours the second, but the parallel does not settle Pesachim's own wording. Berakhot's 'דתניא' usually introduces a baraita, yet the text it introduces matches the Mishnah. The Berakhot English and Steinsaltz both render it as 'in our mishna' (S14, S17), and both come from one editorial project. This is a difference in reported wording of the same exchange. It is not a second encounter.",
        "confidence": "high",
        "graph_effect": "Record the Berakhot 52b text as a parallel version of the same narrated encounter. Do not count it as an independent second meeting between Rava and Rav Huna bar Yehuda. Put the Mishnah citation inside Rav Huna bar Yehuda's speech in the Berakhot branch, and keep the speaker open in the Pesachim branch.",
    },
    {
        "finding_id": "F08",
        "claim": "The Jerusalem Talmud reports Rabbi Yehuda's teaching with the schools reversed: Beit Shammai put spices first and Beit Hillel put light first. It then gives a ruling from Rabbi Ba and Rav Yehuda in the name of Rav: the law follows whoever says spices first. All three Yerushalmi texts checked (Guggenheimer Hebrew, Venice, Mechon-Mamre) have this order.",
        "kind": "textual",
        "evidence": [
            ev("S26", "תני אמר ר' יהודה לא נחלקו בית שמאי ובית הלל על המזון שהוא בתחילה ועל הבדלה שהיא בסוף ועל מה נחלקו על המאור ועל הבשמים שבית שמאי אומרי' בשמי' ומאור ובית הלל אומרי' מאור ובשמים",
               "'It was taught: Rabbi Yehuda said: Beit Shammai and Beit Hillel did not disagree over the food, which is first, or over havdala, which is last. About what did they disagree? About light and spices: Beit Shammai say spices and light, Beit Hillel say light and spices.'"),
            ev("S26", "רבי בא ורב יהודה בשם רב הלכה כדברי מי שאומר בשמים ואחר כך מאור",
               "'Rabbi Ba and Rav Yehuda in the name of Rav: the law follows the words of whoever says spices and afterwards light.'"),
            ev("S24", "שֶׁבֵּית שַׁמַּאי אוֹמְרִים בְּשָׂמִים וּמָאוֹר. וּבֵית הִלֵּל אוֹמְרִים מָאוֹר וּבְשָׂמִים."),
            ev("S27", "שבית שמאי אומרים בשמים ומאור. ובית הלל אומרים מאור ובשמים."),
        ],
        "reasoning": "This is a real alternative report of what Rabbi Yehuda said. The practical order in the ruling (spices before light) matches Rava's practice and the Bavli's 'נהגו העם', but the school it is credited to is reversed. The Yerushalmi does not name the school in its ruling ('whoever says'). Its three texts may share one textual tradition, so they should not count as three independent witnesses. Guggenheimer's English (S25) renders the ruling as 'Rebbi Abba and Rav Yehudah: Practice follows...'. The English does not render 'בשם רב', although his Hebrew edition (S24) has it.",
        "confidence": "high",
        "graph_effect": "Put the content of Rabbi Yehuda's reports_position_of edges on version branches: Bavli and Tosefta say Beit Hillel puts spices first, the Yerushalmi says Beit Shammai does. Do not merge the branches or treat either as the correction of the other. Rabbi Ba, Rav Yehuda and Rav belong to the Yerushalmi passage, not to Pesachim 103a:7. Their chain (Rabbi Ba and Rav Yehuda reporting in the name of Rav) is a separate observation in Yerushalmi Berakhot 8:5.",
    },
    {
        "finding_id": "F09",
        "claim": "The segment right after the focal one adds a report of practice: Rabbi Yochanan says the people follow Beit Hillel according to Rabbi Yehuda's version. The Aramaic does not say that Rava quotes Rabbi Yochanan, and it does not say that Rava acted on this custom. The English sentence 'Rava acted as dictated by this custom' is the translator's addition. It follows Steinsaltz's 'וכך נהג רבא' and has no Aramaic counterpart.",
        "kind": "textual",
        "evidence": [
            ev("S01", "וְאָמַר רַבִּי יוֹחָנָן: נָהֲגוּ הָעָם כְּבֵית הִילֵּל וְאַלִּיבָּא דְּרַבִּי יְהוּדָה.",
               "'And Rabbi Yochanan said: The people have adopted the practice of Beit Hillel, according to Rabbi Yehuda.'"),
            ev("S02", "Rava acted as dictated by this custom."),
            ev("S11", "ואמר ר' יוחנן: נהגו העם כבית הילל ואליבא [ועל פי שיטת] ר' יהודה, וכך נהג רבא."),
        ],
        "reasoning": "'ואמר רבי יוחנן' can be read as part of Rava's reply (Rava citing Rabbi Yochanan) or as the anonymous Gemara adding a supporting statement. The words do not decide between these. The English and Steinsaltz belong to one editorial project, so their shared gloss is one interpretation, not two. Rava's action at 103a:5 does match the practice Rabbi Yochanan reports. Even so, the text does not state that Rava was following him.",
        "confidence": "high",
        "graph_effect": "Add a practice report: Rabbi Yochanan reports that the people follow Beit Hillel per Rabbi Yehuda's version. Add follows_version_of: the people -> Rabbi Yehuda, as reported by Rabbi Yochanan. Keep the edge Rava cites Rabbi Yochanan provisional (speaker ambiguous). Do not add Rava follows Rabbi Yochanan from the English gloss. Do not add a Rava-Rabbi Yochanan meeting.",
    },
    {
        "finding_id": "F10",
        "claim": "Tosafot reads Rabbi Yochanan's statement as disagreeing with the anonymous Mishnah. Tosafot suggests that Rabbi Yochanan had learned the Mishnah as an individual's view, explicitly Rabbi Meir's. It adds that this 'נהגו' is not the weaker 'we do not instruct, but we do not stop them' kind found elsewhere. Rashi on Berakhot 52b confirms the reading 'ואמר רבי יוחנן', which implies he knew another reading.",
        "kind": "interpretation",
        "evidence": [
            ev("S12", "והשתא חולק רבי יוחנן אסתם משנה ואיכא למימר שבלשון יחיד היה שונה אותה והיה שונה בה דברי רבי מאיר בהדיא",
               "'So now Rabbi Yochanan disagrees with an anonymous Mishnah. One can say he learned it as a single view, and learned in it explicitly \"the words of Rabbi Meir\".'"),
            ev("S16", "וא\"ר יוחנן – גרסי':",
               "'\"And Rabbi Yochanan said\": we read [this].'"),
            ev("S18", "נהגו העם כב\"ה אליבא דרבי יהודה - תימא דאנן אפילו לכתחלה נוהגין כן"),
        ],
        "reasoning": "Tosafot's harmonisation assumes that Rabbi Yochanan knew the Mishnah as Rabbi Meir's. That is a later commentator's reconstruction, not something the Talmud says. Rashi's 'גרסי'' marks a textual choice, but he does not state which alternative he rejects. It is not established here whether that alternative dropped the Rabbi Yochanan line or read a different name.",
        "confidence": "medium",
        "graph_effect": "Record Tosafot's view as commentary: Rabbi Yochanan's report presupposes that the Mishnah is Rabbi Meir's individual version. That supports the provenance note in F04, but it adds no Rabbi Yochanan-Rabbi Meir relation. Record Rashi's 'גרסי'' as a commentator's note that a textual variant existed, with the variant itself unknown.",
    },
    {
        "finding_id": "F11",
        "claim": "The challenger's name, Rav Huna bar Yehuda, states a patronymic: he is the son of someone named Yehuda. That father never appears or speaks in this passage.",
        "kind": "textual",
        "evidence": [
            ev("S01", "רַב הוּנָא בַּר יְהוּדָה אִיקְּלַע לְבֵי רָבָא",
               "'Rav Huna bar Yehuda happened to come to Rava's house'"),
        ],
        "reasoning": "'בר' (son of) is a literal kinship marker in the name form. Following the project rule, the kinship stays as evidence and the parent gets a local placeholder. No historical identity for the father, or for which Rav Huna bar Yehuda this is, was researched.",
        "confidence": "high",
        "graph_effect": "Add child_of: Rav Huna bar Yehuda -> local placeholder 'Yehuda (father of Rav Huna bar Yehuda, 103a:5)', marked as literal kinship from the name, with no global identity.",
    },
    {
        "finding_id": "F12",
        "claim": "Context only, a separate episode: in 103a:9-10 a different visitor, Rav Yaakov bar Abba, challenges Rava's practice of blessing twice over wine. This time Rava justifies himself by remembered practice: 'when we were at the Exilarch's house, this is what we did'. He then appeals to the students of Rav, and the text itself calls Rav Beruna and Rav Chananel students of Rav. This is where the passage has a remembered practice in the strict sense. The 103a:5-8 exchange rests instead on a text citation plus a report of popular custom.",
        "kind": "textual",
        "evidence": [
            ev("S01", "אֲמַר לֵיהּ: כִּי הֲוֵינַן בֵּי רֵישׁ גָּלוּתָא הָכִי עָבְדִינַן.",
               "'He said to him: When we were at the house of the Exilarch, that is what we did.'"),
            ev("S01", "אֲנָא עֲבַדִי כְּתַלְמִידֵי דְרַב, דְּרַב בְּרוֹנָא וְרַב חֲנַנְאֵל תַּלְמִידֵי דְרַב הֲווֹ יָתְבִי בִּסְעוֹדְתָּא",
               "'I acted like the students of Rav, for Rav Beruna and Rav Chananel, the students of Rav, were sitting at a meal'"),
        ],
        "reasoning": "This episode is adjacent, not focal. It shows the difference the question asks for. At 103a:9 Rava defends himself by his own remembered past practice. At 103a:7 he defends himself by a tannaitic text. The student-of relation for Rav Beruna and Rav Chananel is stated by the text ('תלמידי דרב'). Their story continues past 103a:10, which was not fully read for this case.",
        "confidence": "medium",
        "graph_effect": "Outside the focal pairs. If this episode is extracted: add a narrated visit and challenge, Rav Yaakov bar Abba -> Rava. Add child_of Rav Yaakov bar Abba -> local placeholder Abba. Add a remembered practice: Rava at the unnamed Exilarch's house. Add student_of: Rav Beruna -> Rav and Rav Chananel -> Rav, stated by the text. Do not link the Exilarch to any named person from this passage.",
    },
]

ALTERNATIVES = [
    {"id": "A1", "reading": "At Pesachim 103a:6, 'ומאי היא? דתנן' is the anonymous Gemara supplying the source of Rav Huna bar Yehuda's claim.",
     "who_holds_it": "Consistent with the Pesachim wording's separate question. Steinsaltz on Pesachim glosses it as 'and what is the law in which this is explained' without naming a speaker (S11).",
     "requires": "reading 'ומאי היא' as an editorial question"},
    {"id": "A2", "reading": "The Mishnah citation is still Rav Huna bar Yehuda's speech.",
     "who_holds_it": "The Berakhot 52b parallel puts 'דתניא' plus the Mishnah text inside his 'אמר ליה' (S13, S15)",
     "requires": "carrying the Berakhot structure over to Pesachim"},
    {"id": "A3", "reading": "'ואמר רבי יוחנן' (103a:8) is part of Rava's reply, so Rava cites Rabbi Yochanan as support.",
     "who_holds_it": "Possible grammatically. Steinsaltz and the English add 'and so Rava acted', which ties Rava to the custom but does not make him the one quoting it (S02, S11)",
     "requires": "extending Rava's speech past the baraita"},
    {"id": "A4", "reading": "'ואמר רבי יוחנן' is an addition by the anonymous Gemara.",
     "who_holds_it": "Possible grammatically. Tosafot discusses Rabbi Yochanan's statement as his own position against the anonymous Mishnah, without saying who inserts it (S12)",
     "requires": "ending Rava's speech with the baraita"},
    {"id": "A5", "reading": "Rabbi Yehuda's version assigns spices-first to Beit Hillel.",
     "who_holds_it": "Bavli Pesachim 103a and Berakhot 52b, Tosefta (Lieberman and default text), Rif (S01, S13, S20, S21, S28)",
     "requires": "nothing beyond these texts"},
    {"id": "A6", "reading": "Rabbi Yehuda's version assigns spices-first to Beit Shammai.",
     "who_holds_it": "Jerusalem Talmud Berakhot 8:5, all three editions checked (S24, S26, S27)",
     "requires": "nothing beyond these texts; which tradition is original was not researched"},
]

UNRESOLVED = [
    "Who speaks 'ומאי היא? דתנן' in Pesachim 103a:6: Rav Huna bar Yehuda or the anonymous Gemara (A1/A2).",
    "Whether 'ואמר רבי יוחנן' in 103a:8 is quoted by Rava or added by the anonymous Gemara (A3/A4).",
    "What reading Rashi on Berakhot 52b rejects with 'וא\"ר יוחנן – גרסי''. Also, which Pesachim texts contained the 'ולא פליגי' that Rashbam rejects. No manuscript apparatus was checked.",
    "Why the Yerushalmi reverses the schools in Rabbi Yehuda's report. Commentaries on the Yerushalmi (for example the Ohr LaYesharim entries linked from 103a:8) were not fetched.",
    "No manuscripts or variant apparatus (for example Dikdukei Soferim) were checked for Pesachim 103a:5-8. It is unknown whether any witness reads 'רבה' or another name for 'רבא' here.",
    "The historical identities of Rava and Rav Huna bar Yehuda, and of the father 'Yehuda', were not researched. The narrated visit is taken only as a text-internal encounter.",
    "The halakhic codes linked from 103a:6-8 were not read: Mishneh Torah, Tur, Shulchan Arukh, Semag, Beit Yosef, Maggid Mishneh, Machzor Vitry. Nor were the responsa and chasidic works linked there, or Petach Einayim.",
]

CORRECTIONS = [
    {"existing_claim_id": "bavli|Pesachim|103a|7|4|27 (Rava -> Rabbi Meir, kind 'explains', direction AB; first pass 'disputes')",
     "change": "Relabel as attributes_text_to: Rava assigns the anonymous Mishnah's version to Rabbi Meir. Keep direction Rava -> Rabbi Meir. Do not use 'disputes'. No encounter.",
     "why": "'זו דברי רבי מאיר' refers to the Mishnah just quoted. Rava is identifying its author, not arguing with Rabbi Meir or explaining his words (F03, F04). The first pass split between 'disputes' and 'explains', which shows that neither label fits."},
    {"existing_claim_id": "bavli|Pesachim|103a|7|27|39 (Rabbi Meir <-> Rabbi Yehuda, kind 'disputes')",
     "change": "Keep 'disputes', stored once, as symmetric. Add subtype disagrees_on_report_of_earlier_dispute. Add provenance: Rabbi Meir's side is Rava's attribution (Rashbam: an anonymous Mishnah is Rabbi Meir's). Rabbi Yehuda's side is attested in the Tosefta without Rabbi Meir being named.",
     "why": "The two tannaim disagree about what Beit Shammai and Beit Hillel disputed, not about the practice directly. They are not shown in an exchange (F04, F06)."},
    {"existing_claim_id": "bavli|Pesachim|103a|7|39|62 (Rabbi Yehuda -> Beit Shammai, kind 'explains', direction AB)",
     "change": "Relabel as reports_position_of, and add the matching Rabbi Yehuda -> Beit Hillel edge. Add Beit Shammai <-> Beit Hillel disputes. Put the content (which school holds spices-first) on version branches: Bavli and Tosefta vs Yerushalmi. Type both schools as collectives.",
     "why": "Rabbi Yehuda reports the dispute of both schools (F05). The Yerushalmi reverses the positions (F08). The name-pair pattern caught only the first school named."},
    {"existing_claim_id": "not in input (missing pairs)",
     "change": "Add Rav Huna bar Yehuda -> Rava challenges (103a:5). Add Rava -> Rav Huna bar Yehuda responds_to (103a:7, 'בתריה'). Add a narrated visit at Rava's house. Add Rava -> Rabbi Yehuda cites_teaching. Add child_of Rav Huna bar Yehuda -> local placeholder Yehuda. Add the Rabbi Yochanan practice report (103a:8), with the speaker left open.",
     "why": "The focal segment's addressee is outside the segment's name pairs, so the challenge/response relation that frames the segment was missed (F01, F09, F11)."},
]

LESSONS = [
    "'זו דברי X' after a quoted anonymous source is an attribution of a text, not a dispute with X or an explanation of X. It needs its own relation kind (attributes_text_to).",
    "'X אומר לא נחלקו A ו-B' reports the dispute of both A and B. A name-pair extractor that pairs X only with the nearest name loses the second school and the A <-> B dispute.",
    "The addressee of a response ('עני X בתריה') is often named only in an earlier segment. Pairs should be read across segment boundaries, because Sefaria segments can break mid-sentence (103a:7 ends with a comma).",
    "Parallel tellings of one encounter (Pesachim 103a / Berakhot 52b) are version branches of one observation, not two meetings.",
    "The same tanna's teaching can come down with reversed content (Bavli and Tosefta vs Yerushalmi). Edge content needs version branches, not a single value.",
    "Translation glosses ('Rava acted as dictated by this custom') can add relations with no counterpart in the source. The English and Steinsaltz belong to one editorial project and are not independent corroboration.",
    "Useful distinctions for practice-related edges: practice performed (Rava's blessing), live challenge (Rav Huna bar Yehuda), text-based response (Rava citing a baraita), reported popular custom (Rabbi Yochanan's 'נהגו העם'), and remembered personal practice ('כי הוינן בי ריש גלותא', 103a:9).",
]


MARKS = re.compile(r"[֑-ֽֿ-ׂׄ-ׇׅ]")


def exact_from_source(path, quote):
    """Return the source's own vocalised substring whose unpointed form equals the unpointed quote."""
    want = MARKS.sub("", quote)

    def strings(x):
        if isinstance(x, str):
            yield x
        elif isinstance(x, list):
            for c in x:
                yield from strings(c)
        elif isinstance(x, dict):
            for c in x.values():
                yield from strings(c)

    for text in strings(json.loads((HERE / path).read_text())):
        if quote in text:
            return quote
        kept = [(i, ch) for i, ch in enumerate(text) if not MARKS.match(ch)]
        bare = "".join(ch for _, ch in kept)
        at = bare.find(want)
        if at >= 0:
            start, end = kept[at][0], kept[at + len(want) - 1][0] + 1
            while end < len(text) and MARKS.match(text[end]):
                end += 1
            return text[start:end]
    raise SystemExit(f"quote not found in {path}: {quote}")


def main():
    paths = {sid: path for sid, path, _ in SOURCES}
    for finding in FINDINGS:
        for item in finding["evidence"]:
            item["exact_quote"] = exact_from_source(paths[item["source_id"]], item["exact_quote"])
    dossier = {
        "job_id": "original-10",
        "focal_ref": "Pesachim 103a:7",
        "status": "researched",
        "question": "Reconstruct the legal exchange and cited authorities across adjacent segments; distinguish a remembered practice, a live challenge, the response and alternative reported wording. Do not infer direct meetings from all citations.",
        "scope_checked": [
            "Pesachim 102b:7-8 and 103a:1-10 (William Davidson Aramaic and English); Wikisource Pesachim 103a",
            "Commentaries on Pesachim 103a on Sefaria: Rashbam, Rashi, Steinsaltz, Tosafot; Rif Pesachim 21a",
            "Parallel Berakhot 52b:22-28 (William Davidson Aramaic and English, Wikisource), with Rashi, Steinsaltz, Tosafot on Berakhot 52b",
            "Mishnah Berakhot 8:5 (Torat Emet); Tosefta Berakhot Lieberman 5:30 and default-text 5:25, 5:30, 5:31",
            "Jerusalem Talmud Berakhot 8:5:2 in Guggenheimer Hebrew and English, Venice, and Mechon-Mamre texts",
            "Sefaria links index for Pesachim 103a:6, 103a:7, 103a:8",
            "NOT checked: manuscripts or variant apparatus; halakhic codes and responsa linked from 103a:6-8; Yerushalmi commentaries; Pesachim 103b continuation of the 103a:10 story",
        ],
        "sources": source_records(),
        "findings": FINDINGS,
        "alternative_readings": ALTERNATIVES,
        "unresolved": UNRESOLVED,
        "proposed_corrections": CORRECTIONS,
        "ontology_lessons": LESSONS,
    }
    out = HERE / "dossier.json"
    part = out.with_suffix(".part")
    part.write_text(json.dumps(dossier, ensure_ascii=False, indent=1) + "\n")
    part.replace(out)
    print("wrote", out)


if __name__ == "__main__":
    main()
