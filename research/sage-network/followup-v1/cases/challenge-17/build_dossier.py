"""Assemble dossier.json from the saved sources; hashes are computed from the saved bytes."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).parent
LOG = json.loads((HERE / "sources/fetch_log.json").read_text())


def mtime(path):
    from datetime import datetime, timezone
    ts = (HERE / path).stat().st_mtime
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds") + " (file modification time)"


def sha(path):
    return hashlib.sha256((HERE / path).read_bytes()).hexdigest()


def fetched(sid, name, edition):
    entry = LOG[name]
    return {"source_id": sid, "url": entry["url"], "ref": entry["ref"], "edition": edition,
            "fetched_at": entry["fetched_at"], "saved_file": f"sources/{name}", "sha256": sha(f"sources/{name}")}


def image(sid, name, url, edition):
    fetched_at = mtime(f"sources/{name}")
    return {"source_id": sid, "url": url, "edition": edition, "fetched_at": fetched_at,
            "saved_file": f"sources/{name}", "sha256": sha(f"sources/{name}")}


def crop(sid, name, parent_sid, parent_name, geometry, edition):
    return {"source_id": sid, "input_path": f"sources/{parent_name}", "derived_from": parent_sid,
            "derivation": f"magick crop {geometry} (then enlarged) of the saved page image", "edition": edition,
            "fetched_at": None, "saved_file": f"sources/{name}", "sha256": sha(f"sources/{name}")}


SOURCES = [
    {"source_id": "pilot_input", "input_path": "research/sage-network/pilot/inputs/challenge-17.json",
     "edition": "Pilot source job: William Davidson Edition - Vocalized Aramaic, Ketubot 65a:9-10", "fetched_at": None,
     "saved_file": "../../../pilot/inputs/challenge-17.json", "sha256": sha("../../../pilot/inputs/challenge-17.json")},
    {"source_id": "pilot_output", "input_path": "research/sage-network/pilot/outputs/challenge-17.json",
     "edition": "First saved reading (passage-pilot-v1)", "fetched_at": None,
     "saved_file": "../../../pilot/outputs/challenge-17.json", "sha256": sha("../../../pilot/outputs/challenge-17.json")},
    {"source_id": "prev_review", "input_path": "research/sage-network/followup-v1/cases/challenge-17/previous-review.json",
     "edition": "Earlier independent review of the first reading", "fetched_at": None,
     "saved_file": "previous-review.json", "sha256": sha("previous-review.json")},
    fetched("ket65a", "ketubot_65a_7-12.json",
            "William Davidson Edition - Vocalized Aramaic + William Davidson Edition - English, Ketubot 65a:7-12"),
    fetched("ket65a_ws", "ketubot_65a_9-10_wikisource.json", "Wikisource Talmud Bavli, Ketubot 65a:9-10"),
    fetched("rashi", "rashi_65a_9-10.json", "Rashi on Ketubot 65a:9-10, Vilna Edition"),
    fetched("steinsaltz", "steinsaltz_65a_9-10.json", "Steinsaltz on Ketubot 65a:9-10, William Davidson Edition - Hebrew"),
    fetched("shita", "shita_65a_9-11.json", "Shita Mekubetzet on Ketubot 65a:9-11 (quotes Rashi mahadura kama, Rosh, Ritva)"),
    fetched("tos_rid_ket", "tosafot_rid_ketubot_65a_2.json", "Tosafot Rid on Ketubot 65a:2, Vilna Edition"),
    fetched("yaavetz", "haggahot_yaavetz_65a_2.json", "Haggahot Ya'avetz on Ketubot 65a:2, Vilna Edition"),
    fetched("petach", "petach_einayim_65a_1.json", "Petach Einayim on Ketubot 65a:1, Jerusalem 1959"),
    fetched("ein_yaakov", "ein_yaakov_ketubbot_5_15.json", "Ein Yaakov, Ketubbot 5:15, Daat"),
    fetched("rif", "rif_ketubot_28a_3.json", "Rif Ketubot 28a:3, Vilna Edition"),
    fetched("yev64b", "yevamot_64b_14-16.json",
            "William Davidson Edition - Vocalized Aramaic + English, Yevamot 64b:14-16"),
    fetched("tos_rid_yev", "tosafot_rid_yevamot_64b_4.json", "Tosafot Rid on Yevamot 64b:4, Jerusalem 1931"),
    fetched("yev34b", "yevamot_34b_6-8.json", "William Davidson Edition - Vocalized Aramaic + English, Yevamot 34b:6-8"),
    fetched("bb12b", "bava_batra_12b_5-7.json", "William Davidson Edition - Vocalized Aramaic + English, Bava Batra 12b:5-7"),
    fetched("shab33a", "shabbat_33a_12.json", "William Davidson Edition - Vocalized Aramaic + English, Shabbat 33a:12"),
    fetched("rashi_shab", "rashi_shabbat_33a_12.json", "Rashi on Shabbat 33a:12, Vilna Edition"),
    fetched("pes112b", "pesachim_112b_17.json", "William Davidson Edition - Vocalized Aramaic + English, Pesachim 112b:17"),
    fetched("rashbam", "rashbam_pesachim_112b_17.json", "Rashbam on Pesachim 112b:17, Vilna Edition"),
    fetched("sh_143", "seder_hadorot_143_1.json", "Seder HaDorot, Tanaim and Amoraim 143:1 (Abaye), Warsaw 1878-1882"),
    fetched("sh_3083", "seder_hadorot_3083_6.json", "Seder HaDorot, Tanaim and Amoraim 3083:6 (Rava), Warsaw 1878-1882"),
    fetched("tos_ber", "tosafot_berakhot_62a_9_1.json", "Tosafot on Berakhot 62a:9:1, Vilna Edition"),
    fetched("jastrow", "jastrow_homa_ii.json", "Jastrow, Dictionary, entry חוֹמָא II, London, Luzac, 1903"),
    fetched("kid81a", "kiddushin_81a_10-12.json", "William Davidson Edition, Kiddushin 81a:10-12 (motif parallel only)"),
    fetched("yer", "yerushalmi_ketubot_5_11_3.json", "Jerusalem Talmud Ketubot 5:11:3, Guggenheimer edition (thematic parallel only)"),
    {"source_id": "related_9", "url": "https://www.sefaria.org/api/related/Ketubot.65a.9", "edition": "Sefaria related-links index for Ketubot 65a:9",
     "fetched_at": mtime("sources/related_65a9.json"), "saved_file": "sources/related_65a9.json", "sha256": sha("sources/related_65a9.json")},
    {"source_id": "related_10", "url": "https://www.sefaria.org/api/related/Ketubot.65a.10", "edition": "Sefaria related-links index for Ketubot 65a:10",
     "fetched_at": mtime("sources/related_65a10.json"), "saved_file": "sources/related_65a10.json", "sha256": sha("sources/related_65a10.json")},
    {"source_id": "search_nahmani", "url": "https://www.sefaria.org/api/search-wrapper (POST query בנחמני, naive_lemmatizer, size 40)",
     "edition": "Sefaria search results", "fetched_at": mtime("sources/search_benahmani.json"),
     "saved_file": "sources/search_benahmani.json", "sha256": sha("sources/search_benahmani.json")},
    image("vilna_img", "vilna_ketubot_65a.jpg", "https://manuscripts.sefaria.org/vilna-romm/Ketubot_65a.jpg",
          "Romm Vilna print (1880-86), Ketubot 65a, page image"),
    crop("vilna_start", "vilna_ketubot_65a_crop_start.png", "vilna_img", "vilna_ketubot_65a.jpg", "900x110+560+1085",
         "Crop of Vilna Ketubot 65a: opening lines of the Homa story"),
    crop("vilna_homa", "vilna_ketubot_65a_crop_homa.png", "vilna_img", "vilna_ketubot_65a.jpg", "820x220+640+1120",
         "Crop of Vilna Ketubot 65a: body of the Homa story"),
    crop("vilna_masoret", "vilna_ketubot_65a_crop_masoret.png", "vilna_img", "vilna_ketubot_65a.jpg", "260x110+1300+1060",
         "Crop of Vilna Ketubot 65a: outer-margin note beside the first חומא"),
    crop("vilna_margin", "vilna_ketubot_65a_crop_margin.png", "vilna_img", "vilna_ketubot_65a.jpg", "180x120+1300+1120",
         "Crop of Vilna Ketubot 65a: outer-margin note beside the second חומא"),
    image("munich_img", "munich95_pg0386.jpg",
          "https://manuscripts.sefaria.org/munich-manuscript/munich-manuscript-95Cod.hebr.95pg.0386.jpg",
          "Munich, Cod. hebr. 95 (1342), pg. 0386, page image"),
    crop("munich_a1", "munich95_crop_a1.png", "munich_img", "munich95_pg0386.jpg", "560x60+880+472",
         "Crop of Munich 95 pg. 0386: opening of the Homa story"),
    crop("munich_a2", "munich95_crop_a2.png", "munich_img", "munich95_pg0386.jpg", "560x60+380+505",
         "Crop of Munich 95 pg. 0386: Rava's answer naming Homa"),
]

V = "researcher_visual_reading_of_page_image"

FINDINGS = [
    {
        "finding_id": "F1",
        "claim": "Homa is Abaye's wife, stated twice: once by the narrator and once by Rava. The segment itself does not say that Abaye is dead. That she is his widow comes from the maintenance claim, from editors and commentators, and from Yevamot 64b.",
        "kind": "textual",
        "evidence": [
            {"source_id": "ket65a", "exact_quote": "חוּמָא דְּבֵיתְהוּ דְּאַבָּיֵי אֲתַאי לְקַמֵּיהּ דְּרָבָא",
             "location": "65a:9, narrator", "translation_by_researcher": "Homa, the wife of Abaye, came before Rava"},
            {"source_id": "ket65a", "exact_quote": "אֲמַר לַהּ: חוּמָא דְּבֵיתְהוּ דְּאַבָּיֵי. נָפְקָא אַבָּתְרַהּ",
             "location": "65a:10, Rava's speech", "translation_by_researcher": "He said to her: Homa, the wife of Abaye. She went out after her"},
            {"source_id": "ket65a", "exact_quote": "<b>Abaye’s wife, Ḥoma, came before Rava</b> after Abaye died, as Rava was the local judge.",
             "location": "William Davidson English 65a:9; 'after Abaye died' and 'local judge' are plain (editorial) words"},
            {"source_id": "shita", "exact_quote": "חומה אתאי לקמיה דרבא שהיתה אלמנה ותובעת מזונות",
             "location": "Rashi mahadura kama, as quoted in Shita Mekubetzet",
             "translation_by_researcher": "Homa came before Rava, for she was a widow claiming maintenance"},
            {"source_id": "yev64b", "exact_quote": "וְנַסְבַהּ הוּא וּשְׁכֵיב",
             "location": "Yevamot 64b:16", "translation_by_researcher": "and he [Abaye] married her, and he died"},
        ],
        "reasoning": "The spouse relation rests on the construct דביתהו דאביי, and the narrator and Rava both use it. Rava's repetition is a second statement of the same relation in another voice inside the same story. It is not an independent observation. 'After Abaye died' is plain text in the William Davidson English, so it is the editor's explanation. The widowhood is supported by commentary and by the Yevamot narrator's ושכיב. The Ketubot sentence does not state it.",
        "confidence": "high",
        "graph_effect": "Keep c1 (Homa spouse_of Abaye, explicit, narrator). Add time_scope 'marriage ended by Abaye's death' only as interpretation, citing Rashi mahadura kama and Yevamot 64b. Do not treat the plain-text English as Talmud wording. Record Rava's repetition (c14 content) as a voice of the same relation, not as a second edge.",
    },
    {
        "finding_id": "F2",
        "claim": "Inside the passage, 'Nahmani' is Rava's name for Abaye. Rava answers the widow's wine claim with what he knows about Nahmani. Other passages make the alias explicit in context: in Shabbat 33a Rava says 'I know about Nahmani' right after the report that Abaye fell ill, and in Pesachim 112b a demon tells Abaye that Heaven announced 'beware of Nahmani'.",
        "kind": "textual",
        "evidence": [
            {"source_id": "ket65a", "exact_quote": "יָדַעְנָא בֵּיהּ בְּנַחְמָנִי דְּלָא הֲוָה שָׁתֵי חַמְרָא",
             "location": "65a:9", "translation_by_researcher": "I know of Nahmani that he did not drink wine"},
            {"source_id": "shab33a", "exact_quote": "אַבָּיֵי חָשׁ בֵּיהּ. אֲמַר רָבָא: יָדַעְנָא בֵּיהּ בְּנַחֲמָנִי דְּמַכְפֵּין נַפְשֵׁיהּ",
             "location": "Shabbat 33a:12", "translation_by_researcher": "Abaye suffered from it. Rava said: I know of Nahmani that he starves himself"},
            {"source_id": "pes112b", "exact_quote": "חֲדָא זִמְנָא פְּגַעָה בֵּיהּ בְּאַבָּיֵי, אֲמַרָה לֵיהּ: אִי לָאו דְּמַכְרְזִי עֲלָךְ בְּרָקִיעַ: ״הִזָּהֲרוּ בְּנַחְמָנִי וּבְתוֹרָתוֹ״",
             "location": "Pesachim 112b:17", "translation_by_researcher": "Once she met Abaye and said to him: Were it not announced about you in heaven, 'Beware of Nahmani and his Torah'"},
            {"source_id": "rashbam", "exact_quote": "בנחמני - אביי ולפי שגידלו רבה בר נחמני קרוי כן:",
             "location": "Rashbam on Pesachim 112b:17", "translation_by_researcher": "Nahmani: Abaye; he is called so because Rabbah bar Nahmani raised him"},
            {"source_id": "shita", "exact_quote": "נחמני הוא אביי על שם שרבה בר נחמני גדלו",
             "location": "Rashi mahadura kama, as quoted in Shita Mekubetzet on Ketubot 65a",
             "translation_by_researcher": "Nahmani is Abaye, named for Rabbah bar Nahmani who raised him"},
            {"source_id": "ket65a", "exact_quote": "<b>I know that Naḥmani,</b> i.e., Abaye, <b>did not drink wine.</b>",
             "location": "William Davidson English 65a:9; 'i.e., Abaye' is plain (editorial)"},
        ],
        "reasoning": "In Ketubot 65a the link is contextual. The only husband under discussion is Abaye, and Rava's answer only works if Nahmani is that husband. Shabbat 33a and Pesachim 112b show the same alias used about Abaye where the context names Abaye. These are separate Talmudic passages, not a later editor. Rashbam and Rashi's first edition explain the name. That explanation is commentary, and it differs from other explanations (F3). The alias is a reading-level coreference. It does not make a historical identification.",
        "confidence": "high",
        "graph_effect": "Resolve coreference candidate m22 to 'abaye' (alias 'Nahmani') and retire the separate local entity 'nahmani'. Basis: local context plus the same alias in other Talmudic passages. Mark it as an alias, not a new person, and not a kinship claim.",
    },
    {
        "finding_id": "F3",
        "claim": "Commentators disagree about why Abaye is called Nahmani, and several of their explanations bring in kinship with Rabbah bar Nahmani. None of those kinship claims appears in Ketubot 65a:9-10.",
        "kind": "interpretation",
        "evidence": [
            {"source_id": "sh_143", "exact_quote": "שמו נחמני בשם זקנו אביו של רבה",
             "location": "Seder HaDorot 143:1", "translation_by_researcher": "his name was Nahmani, after his grandfather, the father of Rabbah"},
            {"source_id": "sh_143", "exact_quote": "וכ\"כ הערוך ערך אביי דנחמני שמו שהיה בן אחיו דרבה בר נחמני ותלמידו",
             "location": "Seder HaDorot 143:1 reporting the Arukh", "translation_by_researcher": "and so wrote the Arukh: his name was Nahmani, for he was the nephew of Rabbah bar Nahmani and his student"},
            {"source_id": "sh_143", "exact_quote": "וי\"מ להיפך שמו אביי, ורבה מתוך שגדלו ולמדו תורה קראו נחמני ע\"ש אביו",
             "location": "Seder HaDorot 143:1", "translation_by_researcher": "and some explain the opposite: his name was Abaye, and Rabbah, since he raised and taught him, called him Nahmani after his [Rabbah's] father"},
            {"source_id": "petach", "exact_quote": "אמרו כן על רבה בר נחמני דודו לא על אביי",
             "location": "Petach Einayim on Ketubot 65a", "translation_by_researcher": "they said this about Rabbah bar Nahmani his uncle, not about Abaye"},
            {"source_id": "rashbam", "exact_quote": "ולפי שגידלו רבה בר נחמני קרוי כן",
             "location": "Rashbam on Pesachim 112b:17", "translation_by_researcher": "because Rabbah bar Nahmani raised him he is called so"},
        ],
        "reasoning": "There are three explanations, and the Nahmani relation differs in each. (a) Seder HaDorot: Abaye's own name, after his grandfather. (b) The Arukh as reported there: he was Rabbah bar Nahmani's nephew. (c) Rashbam, Rashi's first edition, and some sources in Seder HaDorot: a name Rabbah gave him because he raised him. Petach Einayim calls Rabbah his uncle. Seder HaDorot also reports that Rashi at the end of Horayot took Nahmani as a disparaging nickname, and that the Be'er Sheva rejected this; that report comes only through Seder HaDorot. The only person-link these explanations share is Abaye to Rabbah bar Nahmani, raised by or uncle. None is in the focal text. The patronymic in 'Rabbah bar Nahmani' supports a local parent placeholder, Nahmani, father of Rabbah. That placeholder belongs to the commentary sources, not to this passage.",
        "confidence": "medium",
        "graph_effect": "Do not add kinship edges from Ketubot 65a:9-10 because of the word Nahmani. If a later stage wants Abaye to Rabbah bar Nahmani (uncle, raised by, or grandson-named-after), it must cite the commentary and Arukh evidence as commentary. Keep the three explanations open as branches. Keep 'Rabbah child_of Nahmani (placeholder)' tied to the name, not to this passage.",
    },
    {
        "finding_id": "F4",
        "claim": "The editions disagree about whom Abaye poured wine for. The Koren/William Davidson text reads 'he would give me to drink' (משקי לי). Wikisource, the Vilna print, Ein Yaakov and Steinsaltz's Hebrew read 'give him to drink' (משקי ליה), which can mean that Homa served Abaye wine. The pouring act is therefore branch-dependent.",
        "kind": "uncertainty",
        "evidence": [
            {"source_id": "ket65a", "exact_quote": "חַיֵּי דְּמָר דַּהֲוָה מַשְׁקֵי לִי בְּשׁוּפְרָזֵי כִּי הַאי",
             "location": "65a:9, Koren vocalized", "translation_by_researcher": "By the Master's life, he used to give me to drink in cups like this"},
            {"source_id": "ket65a_ws", "exact_quote": "אמרה ליה חיי דמר דהוי משקי ליה בשופרזי כי האי",
             "location": "Wikisource 65a:9", "translation_by_researcher": "She said to him: By the Master's life, [I/one] used to give him to drink in cups like this"},
            {"source_id": "ein_yaakov", "exact_quote": "חַיֵּי דְּמַר, דַּהֲוִי מַשְׁקֵי לֵיהּ בְּשׁוּפְרְזֵי כִּי הַאי",
             "location": "Ein Yaakov Ketubbot 5:15"},
            {"source_id": "steinsaltz", "exact_quote": "<b>דהוי משקי ליה בשופרזי כי האי</b> <small>[שהיה משקה אותי בכוסות</small>",
             "location": "Steinsaltz Hebrew: bold lemma reads ליה, but his gloss renders 'gave me to drink'"},
            {"source_id": "tos_rid_ket", "exact_quote": "א\"ל בחיי דמר דהוה משקה לי בשופריזי כי האי",
             "location": "Tosafot Rid on Ketubot 65a", "translation_by_researcher": "she said to him: by the Master's life, he used to give me to drink in cups like this"},
            {"source_id": "vilna_start", "exact_quote": "אמרה ליה חיי דמר דהוי משקי ליה בשופרזי כי האי",
             "evidence_type": V, "location": "Vilna print, Ketubot 65a, third line of the story (researcher's visual reading)"},
            {"source_id": "yaavetz", "exact_quote": "וחומה שאמרה חיי דמר כו' אינה הכחשה כי שמא אחר שנחלש היה שותה. וזה לא ידע.",
             "location": "Haggahot Ya'avetz", "translation_by_researcher": "Homa's saying 'by the Master's life' is not a contradiction, for perhaps after he grew weak he would drink, and he [Rava] did not know this"},
        ],
        "reasoning": "The readings split: לי in Koren/Davidson and in Tosafot Rid (משקה לי); ליה in Wikisource, Vilna (visual), Ein Yaakov and Steinsaltz's lemma. Steinsaltz glosses the ליה text as 'gave me'. This shows the difference can be read away, so it may not change the meaning. Ya'avetz reads her words as a claim that Abaye himself drank, which fits either reading. Every branch keeps the dispute as a contradiction between two speeches, Rava's claim and Homa's oath. The narrator does not settle whether Abaye drank.",
        "confidence": "medium",
        "graph_effect": "Change the 'served' statement label from the single reading 'he gave her large cups of wine' to a branch group. Branch A (לי): Abaye gave Homa wine. Branch B (ליה): Homa, or someone, gave Abaye wine, or it is the same sense read loosely. Both stay Homa's sworn assertion, not narrator fact. Keep Rava's 'abstains' statement as Rava's assertion. The two are a disputed pair. Neither is established.",
    },
    {
        "finding_id": "F5",
        "claim": "The speech tag for Rava's answer to Homa varies in gender: the Koren text has masculine 'said to him' (אמר ליה), the Vilna/Wikisource text abbreviates it (א\"ל), and Ein Yaakov and Tosafot Rid have 'said to her' (אמר לה). None of these changes the speaker or the addressee.",
        "kind": "textual",
        "evidence": [
            {"source_id": "ket65a", "exact_quote": "פְּסוֹק לִי חַמְרָא! אֲמַר לֵיהּ: יָדַעְנָא", "location": "65a:9 Koren"},
            {"source_id": "ket65a_ws", "exact_quote": "פסוק לי חמרא א\"ל ידענא ביה בנחמני", "location": "Wikisource 65a:9"},
            {"source_id": "ein_yaakov", "exact_quote": "אָמַר לָהּ: יָדַעְנָא בֵּיהּ בְּנַחְמָנִי", "location": "Ein Yaakov"},
            {"source_id": "tos_rid_ket", "exact_quote": "פסיקי לי חמרא אמר לה ידענא ביה בנחמני", "location": "Tosafot Rid"},
        ],
        "reasoning": "The only participants are Homa and Rava. The content (Rava's knowledge of Abaye) fixes Rava as the speaker and Homa as the addressee. The masculine ליה in the Koren text is a common Aramaic form or an expanded abbreviation, not a third party. The first reading's note on c7 stands.",
        "confidence": "high",
        "graph_effect": "Keep c7 as Rava answers Homa. Add a variant note (אמר ליה / א\"ל / אמר לה). There is no person effect.",
    },
    {
        "finding_id": "F6",
        "claim": "Seven speech turns are recoverable in 65a:9-10. Six have a speech formula. The second request, 'Apportion wine for me!', has none; the context makes Homa the speaker. There is also one nonverbal act, Homa showing Rava the cup size. The first reading captured all seven.",
        "kind": "textual",
        "evidence": [
            {"source_id": "ket65a", "exact_quote": "אֲמַרָה לֵיהּ: פְּסוֹק לִי מְזוֹנֵי! פְּסַק לַהּ. פְּסוֹק לִי חַמְרָא!",
             "location": "65a:9, turn 1 introduced, turn 2 unintroduced"},
            {"source_id": "ket65a", "exact_quote": "בַּהֲדֵי דְּקָא מַחְוְיָא לֵיהּ אִיגַּלִּי דְּרָעַאּ",
             "location": "65a:9", "translation_by_researcher": "while she was showing him, her arm was uncovered"},
            {"source_id": "ket65a", "exact_quote": "אֲמַרָה לֵיהּ בַּת רַב חִסְדָּא: מַאן הֲוַי הָאִידָּנָא בְּבֵי דִּינָא?",
             "location": "65a:10, turn 5"},
            {"source_id": "ket65a", "exact_quote": "אָמְרָה לַהּ: קְטַלְתְּ לִיךְ תְּלָתָא, וְאָתֵת לְמִיקְטַל אַחֲרִינָא?!",
             "location": "65a:10, turn 7"},
            {"source_id": "pilot_output", "exact_quote": "\"id\": \"c6\"", "location": "first reading: unintroduced wine request"},
        ],
        "reasoning": "Here are the turns, with their tags counted from the Koren text. In 65a:9: (1) Homa to Rava, אמרה ליה; (2) Homa to Rava, no tag; (3) Rava to Homa, אמר ליה; (4) Homa to Rava, אמרה ליה. In 65a:10: (5) Hisda's daughter to Rava, אמרה ליה; (6) Rava to her, אמר לה; (7) Hisda's daughter to Homa, אמרה לה. That makes six tagged turns plus one untagged, seven in all. The first reading's claims c4, c6, c7, c9, c13, c14 and c16 cover them. פסק לה is an act, the award, not speech.",
        "confidence": "high",
        "graph_effect": "No missing speech turn. Keep c6 with basis local_coreference and note 'no speech formula'. Homa's oath uses חיי דמר, addressing Rava as 'Mar'. That is a form of address, not a relation.",
    },
    {
        "finding_id": "F7",
        "claim": "The 'three' whom Hisda's daughter accuses Homa of killing are Homa's three late husbands, according to Rashi, who cites Yevamot 64b. Yevamot 64b names them: Rehava of Pumbedita, Rav Yitzhak son of Rabbah bar bar Hana, and Abaye. The Yevamot narrator says only that each married her and died. 'Killed' is the daughter's hostile word.",
        "kind": "textual",
        "evidence": [
            {"source_id": "rashi", "exact_quote": "קטלת לך תלת - שכבר ניסת לג' ומתו כדאמר ביבמות בפ' הבא על יבמתו (יבמות דף סד:):",
             "location": "Rashi on Ketubot 65a:10", "translation_by_researcher": "'You killed three': for she had already married three and they died, as stated in Yevamot 64b"},
            {"source_id": "yev64b", "exact_quote": "דְּנַסְבַהּ רַחֲבָא דְפוּמְבְּדִיתָא וּשְׁכֵיב, רַב יִצְחָק בְּרֵיהּ דְּרַבָּה בַּר בַּר חָנָה וּשְׁכֵיב, וְנַסְבַהּ הוּא וּשְׁכֵיב",
             "location": "Yevamot 64b:16", "translation_by_researcher": "whom Rehava of Pumbedita married and he died, Rav Yitzhak son of Rabbah bar bar Hana, and he died, and he [Abaye] married her and he died"},
            {"source_id": "shita", "exact_quote": "תלת בעלים היו לה ומתו ואלו הן רחבא דפומבדיתא ורב יצחק בריה דרבא ואביי בתראה",
             "location": "Rashi mahadura kama in Shita Mekubetzet", "translation_by_researcher": "she had three husbands who died, and these are they: Rehava of Pumbedita, Rav Yitzhak son of Rava [sic], and Abaye the last"},
            {"source_id": "ket65a", "exact_quote": "<b>You have</b> already <b>killed three</b> men, as Abaye was your third husband,",
             "location": "William Davidson English 65a:10; 'as Abaye was your third husband' is plain (editorial)"},
            {"source_id": "steinsaltz", "exact_quote": "כי אביי היה בעלה השלישי, אחר שמתו שני בעליה הראשונים",
             "location": "Steinsaltz on 65a:10", "translation_by_researcher": "for Abaye was her third husband, after her first two husbands died"},
        ],
        "reasoning": "The Ketubot passage names no one in the 'three'. The names come from Yevamot 64b through Rashi's cross-reference. The commentators and the Davidson plain text count Abaye among the three. Rashi's first edition, as quoted in the Shita, names the second husband 'Rav Yitzhak son of Rava'. The Yevamot text reads 'son of Rabbah bar bar Hana'. That is a variant or error in the quoted commentary and must be kept as such, not merged. Under the reading that the three are her husbands, the deaths are narrated facts in Yevamot. The killing is the accuser's charge (the woman whose husbands die, the Yevamot topic). The graph must not record Homa as the cause of anyone's death.",
        "confidence": "high",
        "graph_effect": "Keep the 'three' group and the accusation c16 as hostile speech. Add a cross-passage candidate link, the group 'three' = {Rehava of Pumbedita, Rav Yitzhak son of Rabbah bar bar Hana, Abaye}. It rests on Rashi and Yevamot 64b, is marked commentary-supported, and is not stated in Ketubot. Do not add 'killed' edges. Add former-spouse edges only from the Yevamot passage (F8).",
    },
    {
        "finding_id": "F8",
        "claim": "Yevamot 64b gives a genealogy for Homa that is missing from the Ketubot passage: 'Homa, daughter of Isi, son of Rav Yitzhak, son of Rav Yehuda'. Rashi and Jastrow identify the Homa of Ketubot, the wife of Abaye, with this Homa. Both passages call her Abaye's wife. The Ketubot/Koren spelling is חומא; Yevamot and the Vilna marginal note have חומה.",
        "kind": "interpretation",
        "evidence": [
            {"source_id": "yev64b", "exact_quote": "וַאֲזַל נַסְבַהּ לְחוּמָה בְּרַתֵּיה דְּאִיסִי בְּרֵיהּ דְּרַב יִצְחָק בְּרֵיהּ דְּרַב יְהוּדָה",
             "location": "Yevamot 64b:16", "translation_by_researcher": "and [Abaye] went and married Homa, daughter of Isi son of Rav Yitzhak son of Rav Yehuda"},
            {"source_id": "jastrow", "exact_quote": "<i>Ḥoma</i>, wife of Abbayi.",
             "location": "Jastrow, entry חוֹמָא II, citing Keth. 65a and Yeb. 64b together"},
            {"source_id": "vilna_masoret", "exact_quote": "צ\"ל חומה ... וכ\"ה ביבמות סד:", "evidence_type": V,
             "location": "Vilna print outer margin beside the first חומא (researcher's visual reading; the middle word is not read with confidence)"},
            {"source_id": "munich_a1", "exact_quote": "חומה דביתהו דאביי", "evidence_type": V,
             "location": "Munich 95, opening of the story (researcher's tentative visual reading of the spelling)"},
            {"source_id": "tos_rid_yev", "exact_quote": "דהא רבא פסק ממוני לחומה איתתא דאביי כדאמרי בפ' אע\"פ",
             "location": "Tosafot Rid on Yevamot 64b, linking the two passages", "translation_by_researcher": "for Rava awarded maintenance to Homa, Abaye's wife, as stated in chapter Af al pi [Ketubot 65a]"},
        ],
        "reasoning": "The identification of the two Homas is strong in the text: both are 'Homa, Abaye's wife', and the Yevamot story tells of the same serial widowhood that the Ketubot accusation assumes. It is still a cross-passage coreference made by commentators (Rashi, Tosafot Rid) and a lexicographer. The Ketubot text does not make it. The spelling difference is an orthographic variant. The Vilna note proposes reading חומה, an editorial emendation, and it is recorded as a proposal, not a witness reading. The patronymic chain, read literally, gives Homa child_of Isi, Isi child_of Rav Yitzhak, and Rav Yitzhak child_of Rav Yehuda. This Rav Yitzhak and Rav Yehuda are local placeholders. A shared name does not identify them with any other Rav Yitzhak or Rav Yehuda.",
        "confidence": "medium",
        "graph_effect": "Add, from Yevamot 64b and not from Ketubot, these family edges with basis 'patronymic, explicit': Homa child_of Isi; Isi child_of Rav Yitzhak (local); Rav Yitzhak child_of Rav Yehuda (local). Link the Ketubot Homa to the Yevamot Homa as a candidate coreference, supported by commentary, with the same husband named. Add Homa former spouse_of Rehava of Pumbedita and Homa former spouse_of Rav Yitzhak son of Rabbah bar bar Hana, both from Yevamot. Rav Yitzhak child_of Rabbah bar bar Hana is explicit. 'Rabbah bar bar Hana' itself embeds a parent 'bar Hana' (literal kinship versus fixed name is unclear) and a grandfather Hana. Keep those as placeholders flagged 'name/title interpretation'.",
    },
    {
        "finding_id": "F9",
        "claim": "The Ketubot passage never calls Hisda's daughter Rava's wife. Rashi, Steinsaltz and Rashi's first edition all explicitly read the scene as Rava approaching his wife. Other passages (Yevamot 34b, Bava Batra 12b) pair Rava and Hisda's daughter in marriage stories. Their marriage wording is mostly the editor's plain text.",
        "kind": "interpretation",
        "evidence": [
            {"source_id": "ket65a", "exact_quote": "קָם רָבָא, עָל לְבֵיתֵיהּ תַּבְעַהּ לְבַת רַב חִסְדָּא",
             "location": "65a:10", "translation_by_researcher": "Rava rose, went into his house, and sought [intimacy] with Rav Hisda's daughter"},
            {"source_id": "rashi", "exact_quote": "תבעה לבת רב חסדא - תבע את אשתו לתשמיש:",
             "location": "Rashi on 65a:10", "translation_by_researcher": "sought Rav Hisda's daughter: he sought his wife for intercourse"},
            {"source_id": "shita", "exact_quote": "על לביתיה ותבעה לבת רב חסדא אתתיה",
             "location": "Rashi mahadura kama in Shita Mekubetzet", "translation_by_researcher": "went into his house and sought Rav Hisda's daughter, his wife"},
            {"source_id": "steinsaltz", "exact_quote": "<b>תבעה ל</b>אשתו <b>בת רב חסדא</b> לתשמיש",
             "location": "Steinsaltz; 'אשתו' is unbolded, i.e. explanation"},
            {"source_id": "ket65a", "exact_quote": "<b>requested</b> intercourse <b>from</b> his wife, the <b>daughter of Rav Ḥisda.</b>",
             "location": "William Davidson English 65a:10; 'his wife' is plain (editorial)"},
            {"source_id": "yev34b", "exact_quote": "אֲמַר לֵיהּ רָבָא לְבַת רַב חִסְדָּא: קָא מְרַנְּנִי רַבָּנַן אַבָּתְרִיךָ! אֲמַרָה לֵיהּ: אֲנָא דַּעְתַּאי עֲלָךְ הֲוַאי.",
             "location": "Yevamot 34b:7", "translation_by_researcher": "Rava said to Rav Hisda's daughter: The rabbis are murmuring about you! She said to him: My mind was on you"},
            {"source_id": "bb12b", "exact_quote": "אָמַר רָבָא: וַאֲנָא בָּתְרָא.",
             "location": "Bava Batra 12b:6", "translation_by_researcher": "Rava said: And I [will be] last"},
            {"source_id": "bb12b", "exact_quote": "And this is what happened; first she married Rami bar Ḥama, and when he died she married Rava.",
             "location": "William Davidson English Bava Batra 12b:6: entirely plain (editorial) text"},
            {"source_id": "sh_3083", "exact_quote": "נשא בת רב חסדא", "location": "Seder HaDorot on Rava", "translation_by_researcher": "he married Rav Hisda's daughter"},
        ],
        "reasoning": "Inside Ketubot the evidence for marriage is the home setting ('went into his house'), the sexual request, and the daughter's jealous fear that Homa would 'kill another'. That is strong narrative implication without a spouse word. Rashi turns it into an explicit commentary claim. Yevamot 34b and Bava Batra 12b are other stories about 'Rav Hisda's daughter' and Rava. Neither Aramaic text says 'wife', and 'she married Rami bar Hama then Rava' is the editor's plain text. Treating the daughter in Ketubot as the same person as the one in Bava Batra and Yevamot is a separate cross-passage decision. A shared descriptor does not settle it. Commentary and editorial explanation should raise c12 from 'bare interpretation' to 'commentary-explicit'. The text still names no marriage.",
        "confidence": "high",
        "graph_effect": "Keep c12 (Rava spouse_of Rav Hisda's daughter) and add Rashi, Rashi's first edition and Steinsaltz as commentary evidence. Set basis to 'contextual implication plus explicit commentary'. It can be read with high confidence, while staying marked 'not stated in the Talmud text'. This agrees with the earlier review that it is weaker than c1, and adds that its support is broader than the note says. Do not import 'Rami bar Hama former spouse' into this passage. It belongs to Bava Batra 12b's plain text and the commentary.",
    },
    {
        "finding_id": "F10",
        "claim": "The 'another' whom Homa 'came to kill' is not named. Rashi reads it generically: she showed her beauty so that some man would jump at marrying her. Steinsaltz and the Davidson plain text say it is Rava ('my husband Rava').",
        "kind": "interpretation",
        "evidence": [
            {"source_id": "rashi", "exact_quote": "למיקטל אחרינא - שבאת להראות יופיך שיקפוץ איש עליך:",
             "location": "Rashi on 65a:10", "translation_by_researcher": "to kill another: for you came to show your beauty so that a man would jump at you"},
            {"source_id": "shita", "exact_quote": "אתית למקטל אחרינא שנתכוונתה להראות יופייך כדי שתנשאי",
             "location": "Rashi mahadura kama in Shita", "translation_by_researcher": "you came to kill another: you intended to show your beauty so that you would be married"},
            {"source_id": "steinsaltz", "exact_quote": "גם את רבא בעלי?! שהראית לו את יופיך, ויבוא לשאת אותך",
             "location": "Steinsaltz", "translation_by_researcher": "also Rava my husband?! for you showed him your beauty and he will come to marry you"},
            {"source_id": "ket65a", "exact_quote": "<b>and</b> now <b>you come to kill another</b> one, my husband Rava?",
             "location": "William Davidson English; 'my husband Rava' is plain (editorial)"},
        ],
        "reasoning": "Rashi, in both editions, explains the accusation as Homa seeking a new husband. He does not identify the husband. Steinsaltz and the English, which rest on the same editorial work and so are not independent, name Rava. Rava is the man who saw her, and his wife is the speaker, so Rava is the natural target of the jealousy. The rhetorical question still does not state it.",
        "confidence": "medium",
        "graph_effect": "Keep entity 'other' as the unnamed prospective victim or future husband. Keep candidate m24 open, with branches 'Rava' (Steinsaltz and Davidson) and 'any future husband' (Rashi). Add no edge between Homa and Rava beyond the hearing and the gesture.",
    },
    {
        "finding_id": "F11",
        "claim": "Rava's 'I know of Nahmani that he did not drink wine' is Rava's own claim to know Abaye's household habits, and Homa disputes it under oath. Commentators explain the abstinence differently: poverty (the Rosh), self-starvation (a parallel from Shabbat 33a noted by Ya'avetz), or a change late in life (Ya'avetz).",
        "kind": "interpretation",
        "evidence": [
            {"source_id": "shita", "exact_quote": "ידענא ביה בנחמני דלא שתי חמרא שהיה עני כדאמרינן במועד קטן דלא אשתכח בגו ביתיה פיתא דסמידא. הרא\"ש ז\"ל.",
             "location": "Rosh, quoted in Shita Mekubetzet", "translation_by_researcher": "…he did not drink wine, for he was poor, as stated in Moed Katan that no fine bread was found in his house"},
            {"source_id": "petach", "exact_quote": "ובנסחתנו בשילהי מ\"ק אמרו כן על רבה בר נחמני דודו לא על אביי",
             "location": "Petach Einayim", "translation_by_researcher": "and in our text at the end of Moed Katan they said this of Rabbah bar Nahmani his uncle, not of Abaye"},
            {"source_id": "yaavetz", "exact_quote": "נ\"ב כדאמר בפרק במה מדליקין (לג א') ידענא בנחמני דמכפין נפשיה",
             "location": "Haggahot Ya'avetz", "translation_by_researcher": "as stated in Shabbat 33a: I know of Nahmani that he starves himself"},
        ],
        "reasoning": "In the story this is Rava's assertion of acquaintance with Abaye's habits. It is not narrator fact. Petach Einayim says the Rosh's Moed Katan source, in the printed text, is about Rabbah bar Nahmani, not Abaye. This is a disagreement among commentators about which person a proof text concerns. It should not be resolved here. The statement is evidence that Rava claims to know Abaye. It does not describe the kind of relationship (teacher, colleague, kin).",
        "confidence": "medium",
        "graph_effect": "Keep c8 (Rava holds the view 'abstains') as Rava's voice. At most add Rava 'claims knowledge of' Abaye, voice Rava, disputed by Homa. Do not derive a colleague or rival edge from this passage. Economic explanations (poverty) are commentary and have no person effect.",
    },
    {
        "finding_id": "F12",
        "claim": "The place 'all of Mehoza' is read as the city by the Davidson plain text and Steinsaltz. Ya'avetz suggests that here מחוזא may mean 'the whole district', not the city. Commentators also use this passage for chronology: Tosafot infers from it that Rav Hisda's daughter was still alive after Abaye died.",
        "kind": "interpretation",
        "evidence": [
            {"source_id": "ket65a", "exact_quote": "עַד דְּאַפְּקַהּ לַהּ מִכּוּלֵּי מָחוֹזָא", "location": "65a:10",
             "translation_by_researcher": "until she drove her out of all Mehoza"},
            {"source_id": "yaavetz", "exact_quote": "וצ\"ל דהך מחוזא אינו שם עיר (כי ההיא מבסמוך) אלא פירושו מכל אותה מדינה הוציאתה",
             "location": "Haggahot Ya'avetz", "translation_by_researcher": "one must say this Mehoza is not a city name (unlike the one just below), but it means she drove her out of that whole region"},
            {"source_id": "tos_ber", "exact_quote": "וי\"ל מכל מקום לא נפטרה עד אחר אביי:",
             "location": "Tosafot on Berakhot 62a", "translation_by_researcher": "and one can answer: in any case she did not die until after Abaye"},
            {"source_id": "tos_ber", "exact_quote": "וכן בכתובות דקאמר חומה דביתהו דאביי אתיא לקמיה דרבא",
             "location": "Tosafot on Berakhot 62a citing Ketubot 65a"},
        ],
        "reasoning": "The place reading has an alternative in the commentary. Ya'avetz's reason is halakhic: if Homa lived in wine-drinking Mehoza, as 65a:11 says of its residents, she should have received wine anyway. The chronology in Tosafot is a historical inference made by commentators. It builds on the assumption that Homa's hearing followed Abaye's death. It is not text evidence about dates.",
        "confidence": "medium",
        "graph_effect": "Keep the Mehoza place entity, with an alternative 'the district' (Ya'avetz). Put the Tosafot chronology in the historical-inference layer, not in the passage graph. The graph assigns no dates.",
    },
]

ALTERNATIVES = [
    {"id": "A1", "topic": "Who gave wine to whom (משקי לי / משקי ליה)",
     "readings": [
         {"reading": "Abaye gave Homa wine to drink (לי)", "supported_by": ["ket65a (Koren vocalized)", "tos_rid_ket (משקה לי)", "Steinsaltz gloss 'משקה אותי'"]},
         {"reading": "[she/one] gave Abaye wine to drink (ליה), i.e. Abaye himself drank", "supported_by": ["ket65a_ws (Wikisource)", "vilna_start (visual)", "ein_yaakov", "steinsaltz bold lemma"]}],
     "status": "open; affects the direction of one reported act, not who is present"},
    {"id": "A2", "topic": "Why Abaye is called Nahmani",
     "readings": [
         {"reading": "named after his grandfather, Rabbah's father", "supported_by": ["sh_143"]},
         {"reading": "nephew of Rabbah bar Nahmani (Arukh as reported)", "supported_by": ["sh_143"]},
         {"reading": "called so because Rabbah bar Nahmani raised him", "supported_by": ["rashbam", "shita (Rashi mahadura kama)", "sh_143 (some explain)"]}],
     "status": "open; commentary only; no edge from this passage"},
    {"id": "A3", "topic": "Identity of 'another'",
     "readings": [
         {"reading": "Rava", "supported_by": ["steinsaltz", "ket65a English plain text"]},
         {"reading": "any man who would marry her", "supported_by": ["rashi", "shita (Rashi mahadura kama)"]}],
     "status": "open"},
    {"id": "A4", "topic": "Name of Homa's second husband",
     "readings": [
         {"reading": "Rav Yitzhak son of Rabbah bar bar Hana", "supported_by": ["yev64b"]},
         {"reading": "Rav Yitzhak son of Rava", "supported_by": ["shita (Rashi mahadura kama as quoted)"]}],
     "status": "the Talmud text reads the first; the second is a variant or error in a quoted commentary, kept as commentary evidence"},
    {"id": "A5", "topic": "מחוזא",
     "readings": [
         {"reading": "the city Mehoza", "supported_by": ["ket65a English plain text", "steinsaltz"]},
         {"reading": "the whole district", "supported_by": ["yaavetz"]}],
     "status": "open; place only"},
    {"id": "A6", "topic": "Spelling of Homa",
     "readings": [
         {"reading": "חומא", "supported_by": ["ket65a", "ket65a_ws", "ein_yaakov", "vilna_start (visual)"]},
         {"reading": "חומה", "supported_by": ["yev64b", "munich_a1 (visual, tentative)", "shita", "tos_ber"]},
         {"reading": "emend to חומה", "supported_by": ["vilna_masoret (marginal emendation, visual)"]}],
     "status": "orthographic; the emendation is a later proposal, not a witness reading"},
]

UNRESOLVED = [
    "Whether the Ketubot Homa is the Yevamot 64b Homa is supported by commentary and by the shared husband Abaye. The Ketubot text does not state it, so it stays a cross-passage decision.",
    "Whether 'Rav Hisda's daughter' in Ketubot 65a is the same woman as in Yevamot 34b and Bava Batra 12b is not stated in any of these texts. Rav Hisda may have had more than one daughter; this was not checked here.",
    "Whether Abaye drank wine is disputed inside the story (Rava versus Homa's oath) and is not settled by the narrator.",
    "The Munich 95 and Vilna marginal readings are researcher visual readings. The Munich script was read only for the spelling of Homa's name, tentatively, and the rest of its wording was not transcribed.",
    "Rashi at the end of Horayot (the 'disparaging' explanation of Nahmani) and the Arukh were not fetched directly. They are known here only as reported by Seder HaDorot.",
    "The Moed Katan proof text cited by the Rosh was not fetched. Petach Einayim's claim that it concerns Rabbah bar Nahmani is unverified here.",
]

CORRECTIONS = [
    {"claim_id": "coreference m22 / entity nahmani",
     "change": "Resolve Nahmani to Abaye as an alias. Remove 'nahmani' as a separate person entity, or mark it alias_of abaye.",
     "why": "F2: local context plus the same alias used of Abaye in Shabbat 33a:12 and Pesachim 112b:17. Rashbam and Rashi's first edition say so explicitly."},
    {"claim_id": "entity served / claim c9 / coreference m23",
     "change": "Branch the content of Homa's oath: לי (Abaye gave her wine) versus ליה (Abaye was given wine). Keep it as Homa's sworn assertion against Rava's claim.",
     "why": "F4: the editions differ."},
    {"claim_id": "c7",
     "change": "Add a variant note that the speech tag is אמר ליה (Koren), א\"ל (Vilna/Wikisource) or אמר לה (Ein Yaakov, Tosafot Rid). Speaker and addressee are unchanged.",
     "why": "F5"},
    {"claim_id": "c12",
     "change": "Add Rashi ('תבע את אשתו'), Rashi's first edition ('אתתיה') and Steinsaltz as commentary evidence. Record the basis as contextual implication plus explicit commentary, not stated in the text.",
     "why": "F9: the first reading and the review treated it as bare interpretation. It is a stated commentary reading, though the Talmud text has no spouse word."},
    {"claim_id": "entity three / c16",
     "change": "Add candidate members from Yevamot 64b via Rashi: Rehava of Pumbedita, Rav Yitzhak son of Rabbah bar bar Hana, and Abaye. Add no 'killed' edge.",
     "why": "F7"},
    {"claim_id": "new (from Yevamot 64b:16)",
     "change": "Add Homa child_of Isi, Isi child_of Rav Yitzhak (local), Rav Yitzhak child_of Rav Yehuda (local). Add Homa former spouse_of Rehava of Pumbedita and of Rav Yitzhak b. Rabbah bar bar Hana. Add Rav Yitzhak child_of Rabbah bar bar Hana. Add parent placeholders embedded in 'Rabbah bar bar Hana', flagged as a name/title interpretation.",
     "why": "F8. These are cross-passage edges, provenance Yevamot 64b, and are not attributed to Ketubot 65a."},
    {"claim_id": "coreference m24",
     "change": "Keep open, with branches Rava (Steinsaltz and Davidson plain text, not independent) and generic future husband (Rashi).",
     "why": "F10"},
    {"claim_id": "episode.needed_context",
     "change": "Replace 'the three men are unnamed; their deaths ... not independently narrated' with 'unnamed here; named and their deaths narrated in Yevamot 64b:16 (via Rashi)'.",
     "why": "F7. Absence from this segment was not absence from the wider text."},
]

LESSONS = [
    "An alias used by one character (Nahmani) should resolve to the named person when other Talmudic passages use the same alias of that person in context. The explanation of the alias (upbringing, grandfather, nephew) is a separate commentary claim that brings its own kinship edges.",
    "A hostile rhetorical accusation ('you killed three') can point to people narrated elsewhere. Record the group and link candidates across passages, but never turn the accuser's verb into a causal edge.",
    "Editorial plain text in the William Davidson English (after Abaye died, his wife, my husband Rava, Abaye was your third husband) often carries exactly the relation the Aramaic leaves implicit. It must be cited as editorial explanation. Steinsaltz and the Davidson English come from the same editorial project and are not independent.",
    "Edition variants of a pronoun suffix (לי / ליה) can reverse the direction of an act between two people. The contract needs a way to branch the object of a reported act inside a speech.",
    "A marginal 'צ\"ל' in a print is a later emendation proposal and must be stored apart from witness readings, even when it matches a parallel passage.",
    "A spouse relation implied by narrative (home, sexual request, jealousy) and stated by commentary should record both layers: text implication and explicit commentary. It should not be flattened to a bare 'interpretation'.",
]

dossier = {
    "job_id": "challenge-17",
    "focal_ref": "Ketubot 65a:9",
    "status": "researched",
    "question": "Who are the people in Ketubot 65a:9-10 (Homa, Abaye/Nahmani, Rava, Rav Hisda's daughter, Rav Hisda, the 'three' and 'another'), which of their family relations and speech turns does the text state, and which depend on commentary, parallels or editorial explanation?",
    "scope": "Checked Ketubot 65a:7-12 (Koren/Davidson, Wikisource, Ein Yaakov), Rashi, Steinsaltz, Shita Mekubetzet (Rashi mahadura kama, Rosh, Ritva), Tosafot Rid, Haggahot Ya'avetz and Petach Einayim on the passage, Rif, and the parallels Yevamot 64b, Yevamot 34b, Bava Batra 12b, Shabbat 33a, Pesachim 112b (with Rashbam), Tosafot Berakhot 62a, Tosafot Rid Yevamot 64b, Seder HaDorot on Abaye and Rava, and Jastrow. Also the Vilna print and Munich 95 page images, read only for a few words. Other commentaries listed in Sefaria's related index (Ben Yehoyada, Haflaah, responsa) were not read.",
    "sources": SOURCES,
    "findings": FINDINGS,
    "alternative_readings": ALTERNATIVES,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
    "review_assessment": "The earlier review's pass verdicts hold for the in-passage roles. It under-read two points: c12 has explicit commentary support, and the 'three' are named in Yevamot 64b. It did not flag the unresolved Nahmani entity, the לי/ליה variant, or the missing Yevamot genealogy.",
}

(HERE / "dossier.json").write_text(json.dumps(dossier, ensure_ascii=False, indent=1) + "\n")
print("wrote", len(FINDINGS), "findings", len(SOURCES), "sources")


def _exactify():
    """Replace a hand-typed vocalized quote with the identical span from the saved source bytes."""
    import re
    import sys
    sys.path.insert(0, str(HERE.parents[1]))
    import validate
    marks = re.compile(r"[֑-ֽֿ-ׂׄ-ׇׅ]")
    files = {s["source_id"]: HERE / s["saved_file"] for s in SOURCES}
    for finding in FINDINGS:
        for item in finding["evidence"]:
            if item.get("evidence_type") == V:
                continue
            data = files[item["source_id"]].read_bytes()
            if validate.quote_matches(data, item["quote"] if "quote" in item else item["exact_quote"])["mode"] == "exact":
                continue
            needle = marks.sub("", item["exact_quote"])
            for _, text in validate._module.leaves(json.loads(data)):
                kept = [(i, ch) for i, ch in enumerate(text) if not marks.match(ch)]
                flat = "".join(ch for _, ch in kept)
                pos = flat.find(needle)
                if pos >= 0:
                    start, end = kept[pos][0], kept[pos + len(needle) - 1][0] + 1
                    while end < len(text) and marks.match(text[end]):
                        end += 1
                    item["exact_quote"] = text[start:end]
                    break


_exactify()
dossier["findings"] = FINDINGS
(HERE / "dossier.json").write_text(json.dumps(dossier, ensure_ascii=False, indent=1) + "\n")
