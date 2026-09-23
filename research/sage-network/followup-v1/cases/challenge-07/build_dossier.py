"""Build dossier.json for challenge-07 from saved sources. Hashes are computed from saved bytes."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG = {e["saved_file"]: e for e in json.loads((ROOT / "sources/fetch_log.json").read_text()) if e.get("saved_file")}

SOURCES = [
    ("S0", "research/sage-network/pilot/inputs/challenge-07.json", "Pilot input: Wikisource Talmud Bavli, Sanhedrin 36a:5-7 (read-only)", "../../../pilot/inputs/challenge-07.json"),
    ("S0b", "research/sage-network/pilot/outputs/challenge-07.json", "Pilot first reading (read-only)", "../../../pilot/outputs/challenge-07.json"),
    ("S0c", "research/sage-network/followup-v1/cases/challenge-07/previous-review.json", "Earlier independent review (copied unchanged)", "previous-review.json"),
    ("S1", None, "Sefaria: Wikisource Talmud Bavli, Sanhedrin 36a", "sources/sanhedrin_36a_wikisource.json"),
    ("S2", None, "Sefaria: William Davidson Edition - Aramaic, Sanhedrin 36a", "sources/sanhedrin_36a_davidson_aramaic.json"),
    ("S3", None, "Sefaria: William Davidson Edition - English (Koren/Steinsaltz), Sanhedrin 36a", "sources/sanhedrin_36a_davidson_english.json"),
    ("S4", None, "Sefaria links API, Sanhedrin 36a:6", "sources/links_sanhedrin_36a6.json"),
    ("S4b", None, "Sefaria links API, Sanhedrin 36a:5", "sources/links_sanhedrin_36a5.json"),
    ("S4c", None, "Sefaria links API, Sanhedrin 36a:7", "sources/links_sanhedrin_36a7.json"),
    ("S5", None, "Rashi on Sanhedrin 36a:5, Vilna Edition", "sources/rashi_sanhedrin_36a5.json"),
    ("S6", None, "Rashi on Sanhedrin 36a:6, Vilna Edition", "sources/rashi_sanhedrin_36a6.json"),
    ("S7", None, "Rashi on Sanhedrin 36a:7, Vilna Edition", "sources/rashi_sanhedrin_36a7.json"),
    ("S8", None, "Steinsaltz on Sanhedrin 36a:5, William Davidson Edition - Hebrew", "sources/steinsaltz_sanhedrin_36a5.json"),
    ("S9", None, "Steinsaltz on Sanhedrin 36a:6, William Davidson Edition - Hebrew", "sources/steinsaltz_sanhedrin_36a6.json"),
    ("S10", None, "Steinsaltz on Sanhedrin 36a:7, William Davidson Edition - Hebrew", "sources/steinsaltz_sanhedrin_36a7.json"),
    ("S11", None, "Yad Ramah on Sanhedrin 36a, Warsaw 1895", "sources/yad_ramah_sanhedrin_36a.json"),
    ("S12", None, "Rabbeinu Chananel on Sanhedrin 36a, Vilna Edition", "sources/rabbeinu_chananel_sanhedrin_36a.json"),
    ("S13", None, "Sefaria: Wikisource Talmud Bavli, Gittin 58b", "sources/gittin_58b_wikisource.json"),
    ("S14", None, "Sefaria: William Davidson Edition - English, Gittin 58b", "sources/gittin_58b_davidson_english.json"),
    ("S15", None, "Sefaria: Wikisource Talmud Bavli, Gittin 59a", "sources/gittin_59a_wikisource.json"),
    ("S16", None, "Sefaria: William Davidson Edition - English, Gittin 59a", "sources/gittin_59a_davidson_english.json"),
    ("S16b", None, "Sefaria: William Davidson Edition - Aramaic, Gittin 59a", "sources/gittin_59a_davidson_aramaic.json"),
    ("S17", None, "Rashi on Gittin 59a, Vilna Edition", "sources/rashi_gittin_59a.json"),
    ("S18", None, "Tosafot on Gittin 59a, Vilna Edition", "sources/tosafot_gittin_59a.json"),
    ("S19", None, "Chidushei Chatam Sofer on Gittin 59a, 1864-1908", "sources/chatam_sofer_gittin_59a.json"),
    ("S20", None, "Petach Einayim on Gittin 59a, Jerusalem 1959", "sources/petach_einayim_gittin_59a.json"),
    ("S21", None, "Arukh LaNer on Sanhedrin 36a", "sources/arukh_laner_sanhedrin_36a.json"),
    ("S22", None, "Seder HaDorot, Tanaim and Amoraim 1042, Warsaw 1878-1882", "sources/seder_hadorot_1042.json"),
    ("S23", None, "Seder HaDorot, Tanaim and Amoraim 1062, Warsaw 1878-1882", "sources/seder_hadorot_1062.json"),
    ("S24", None, "Seder HaDorot, Tanaim and Amoraim 3190, Warsaw 1878-1882", "sources/seder_hadorot_3190.json"),
    ("S25", None, "Jastrow Dictionary (London, Luzac, 1903) via Sefaria words API, entry וָולִיס", "sources/jastrow_lookup_volis.json"),
    ("S26", None, "Sefaria: Wikisource Talmud Bavli, Avodah Zarah 52b", "sources/avodah_zarah_52b_wikisource.json"),
    ("S27", None, "Sefaria: William Davidson Edition - English, Avodah Zarah 52b", "sources/avodah_zarah_52b_davidson_english.json"),
    ("S28", None, "Jerusalem Talmud Kilayim 9:1, edition by Heinrich W. Guggenheimer (Hebrew)", "sources/yerushalmi_kilayim_9_1.json"),
    ("S29", None, "Jerusalem Talmud Kilayim 9:1, translation and commentary by Heinrich W. Guggenheimer", "sources/yerushalmi_kilayim_9_1_english.json"),
    ("S30", None, "Mishnah Sanhedrin 4:2, Torat Emet 357", "sources/mishnah_sanhedrin_4_2.json"),
    ("S31", None, "Steinsaltz on Gittin 59a, William Davidson Edition - Hebrew", "sources/steinsaltz_gittin_59a.json"),
    ("S32", None, "Meiri on Sanhedrin 36a", "sources/meiri_sanhedrin_36a.json"),
]


def ev(sid, quote, translation=None, **extra):
    item = {"source_id": sid, "exact_quote": quote}
    if translation:
        item["translation_by_this_dossier"] = translation
    item.update(extra)
    return item


FINDINGS = [
    {
        "finding_id": "F1",
        "claim": "The focal line gives one explanation under two alternative speaker names: Rabba son of Rava, 'and some say' Rabbi Hillel son of Rabbi Volas. The explanation is that the vote in Rabbi's house was different, because all their votes began from the side. The same wording, with the same pair of names, appears in the William Davidson Aramaic and in the Gittin 59a parallel (which spells the name הילל).",
        "kind": "textual",
        "evidence": [
            ev("S1", "אמר רבה בריה דרבא ואיתימא רבי הלל בריה דרבי וולס שאני מניינא דבי רבי דכולהו מנינייהו מן הצד הוו מתחלי",
               "Rabba son of Rava said, and some say Rabbi Hillel son of Rabbi Volas: the vote of Rabbi's house is different, for all their votes would begin from the side."),
            ev("S2", "אמר רבה בריה דרבא ואיתימא רבי הלל בריה דרבי וולס שאני מניינא דבי רבי דכולהו מנינייהו מן הצד הוו מתחלי"),
            ev("S15", "אמר רבה בריה דרבא ואיתימא ר' הילל בריה דר' וולס שאני מנינא דבי רבי דכולהו מנינייהו מן הצד הוו מתחילין"),
            ev("S3", "<b>Rabba, son of Rava, says, and some say</b> that it was <b>Rabbi Hillel, son of Rabbi Valles,</b> who says:"),
        ],
        "reasoning": "ואיתימא introduces a second attribution of the same words. The text reports two candidate speakers; it does not say both spoke, nor which is right. The Gittin 59a sugya is a parallel copy of the same unit, so its agreement is not an independent witness to who spoke.",
        "confidence": "high",
        "graph_effect": "Keep c3/c4 as two branches of one attribution group. The speaker in each branch is the son, not the father. Do not treat the Gittin parallel as a second observation of the attribution.",
    },
    {
        "finding_id": "F2",
        "claim": "Both speaker names carry a patronymic, so the passage supports two parent placeholders: Rava (father of Rabba) and Rabbi Volas (father of Rabbi Hillel). Neither father speaks or acts here. Steinsaltz glosses בריה as 'his son' in both names; Jastrow calls Volas 'an Amora, father of R. Hillel'.",
        "kind": "textual",
        "evidence": [
            ev("S1", "רבה בריה דרבא", "Rabba son of Rava"),
            ev("S1", "רבי הלל בריה דרבי וולס", "Rabbi Hillel son of Rabbi Volas"),
            ev("S9", "<b>אמר רבה בריה</b> <small>[בנו]</small> של <b>רבא:"),
            ev("S25", "an Amora, father of R. Hillel"),
        ],
        "reasoning": "A patronymic is explicit kinship evidence under the project rule. Whether the Rava named here is the well-known Amora Rava is a separate identity question. Seder HaDorot treats him that way when it discusses Rabba son of Rava (S24), but that is a later biographer's identification. Nothing in this passage checks it.",
        "confidence": "high",
        "graph_effect": "Keep c7 (rabba child_of rava) and c8 (hillel child_of voles), each tied to its own name branch. Keep the parent placeholders local. Do not merge 'rava' with a global Rava entity on name alone.",
    },
    {
        "finding_id": "F3",
        "claim": "The father's name is spelled in several ways. Wikisource and the William Davidson Aramaic read וולס. Jastrow reports ולס in the Munich manuscript for Sanhedrin 36a and וילס in the Kohut edition of the Arukh, and gives Yerushalmi forms אלס and חליס. Rashi on Sanhedrin 36a:7 has a bare heading 'בריה דרבי וולס' with no comment. Seder HaDorot and the Chatam Sofer read this as a spelling note: the name is וולס, not the gentile name ולוס/לוס of Gittin 11b.",
        "kind": "textual",
        "evidence": [
            ev("S25", '(Ms. M. <span dir="rtl">ולס</span>, Ar. ed. Koh. <span dir="rtl">וילס</span>)'),
            ev("S7", "בריה דרבי וולס:"),
            ev("S23", "כוונת רש\"י דהגירסא וולס ולא ולוס שהוא שם נכרי",
               "Rashi's intent: the reading is Volas and not Valos, which is a gentile name."),
            ev("S19", "ציין רש\"י וולס ולא פי' כלום ובסנהדרין כתב כך שמו",
               "Rashi marked 'Volas' and explained nothing; and in Sanhedrin he wrote 'so is his name'."),
        ],
        "reasoning": "The manuscript readings are known here only through Jastrow's report; no manuscript image was checked. The Chatam Sofer reports a Rashi on Sanhedrin that says 'כך שמו'. The Vilna Rashi saved here has only the heading, so the wording in his copy may differ from this edition. These are spelling forms of one name in this passage, not evidence of different people.",
        "confidence": "medium",
        "graph_effect": "Record name-form variants (וולס / ולס / וילס) as attributes of the local 'voles' mention, typed as a reported manuscript reading, not a variant this dossier checked. Do not create extra persons. Yerushalmi forms (אלס, חליס) belong to identity research, not to this passage.",
    },
    {
        "finding_id": "F4",
        "claim": "In Sanhedrin the text does not say which vote Rav means. The Gittin 58b-59a parallel puts the same report of Rav directly after 'Rabbi convened a court and they voted' on the sicarii land rule. Rashi on Sanhedrin 36a:5 and on Gittin 59a names that vote as the one Rav meant.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "אמר רב אנא הואי במניינא דבי רבי ומינאי דידי הוו מתחלי ברישא",
               "Rav said: I was in the vote of Rabbi's house, and they would begin with me first."),
            ev("S13", "רבי הושיב ב\"ד ונמנו שאם שהתה בפני סיקריקון שנים עשר חודש כל הקודם ליקח זכה",
               "Rabbi convened a court and they voted: if [the field] remained before the sicarius twelve months, whoever buys first acquires."),
            ev("S15", "אנא הואי במניינא דבי רבי ומינאי דידי מנו ברישא",
               "I was in the vote of Rabbi's house, and they counted me first."),
            ev("S5", "במניינא דסיקריקון אמרה רב בפ' הניזקין (גיטין דף נח:)",
               "Rav said it about the sicarius vote, in chapter HaNizakin (Gittin 58b)."),
            ev("S17", "באותו מנין שתקנו שכל הקודם ליקח זכה",
               "In that vote where they enacted that whoever buys first acquires."),
        ],
        "reasoning": "The Sanhedrin wording alone reports one vote or a habit ('הוו מתחלי', they would begin). The link to the sicarii ordinance rests on the Gittin placement and on Rashi. The two wordings also differ slightly: 'הוו מתחלי ברישא' in Sanhedrin, 'מנו ברישא' in Gittin.",
        "confidence": "medium",
        "graph_effect": "The 'voting' event (c1) may carry a candidate link to the Gittin 58b:15 court vote. Its basis is 'parallel sugya plus commentary', not 'explicit in Sanhedrin'. Rav's first-person participation stays explicit.",
    },
    {
        "finding_id": "F5",
        "claim": "The Aramaic says only that they began with Rav, and the objection assumes he was not 'the greatest'. Saying that Rav was the youngest or most junior comes from commentary and editors, and they disagree. Rashi on Gittin gives two views: that Rav was middling, and 'I heard' that he was the smallest. Steinsaltz and the William Davidson English (in plain, editorial words) call him the youngest or junior. Yad Ramah says only that greater men than Rav were present.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "והא אנן מתחילין מן הגדול תנן", "But we learned: they begin from the greatest!"),
            ev("S17", "והוא היה בינוני לא מן הגדולים ולא מן הקטנים ואני שמעתי שקטן שבהם היה",
               "and he was middling, neither of the greatest nor of the smallest; and I have heard that he was the smallest of them."),
            ev("S8", "ורב הצעיר שבהם היה", "and Rav was the youngest of them."),
            ev("S3", "and Rav was one of the junior judges of that court"),
            ev("S16", "although I was the youngest member of the court"),
            ev("S11", "כלומר אעפ\"י שהיו שם גדולים ממני", "that is, although there were greater ones than me there."),
        ],
        "reasoning": "In the William Davidson English these phrases are plain text, so they are the editors' explanation, not the Talmud's words. The Gittin phrase 'although I was the youngest' puts the claim in Rav's mouth, but it too is plain text. Rashi keeps both possibilities open.",
        "confidence": "high",
        "graph_effect": "Do not add a text-basis claim that Rav was the youngest or most junior judge. At most, add 'Rav was not the greatest in the court' as an implication of the objection. Store the rank views as commentary, credited to Rashi (two views), Steinsaltz, the William Davidson editors and Yad Ramah.",
    },
    {
        "finding_id": "F6",
        "claim": "The text gives no reason why Rabbi's court began from the side, and the commentaries disagree about it. Rashi on Sanhedrin and Yad Ramah say it was Rabbi's great humility. Rashi on Gittin says it was because 'do not answer against the great one' applies to all cases. Tosafot on Gittin reject that reading and say humility. Steinsaltz and the William Davidson English say Rabbi was so esteemed that no one would dare contradict him. Petach Einayim notes that Rashi's two places contradict each other. Arukh LaNer ties Rashi's two reasons to the two views of Rav's rank.",
        "kind": "interpretation",
        "evidence": [
            ev("S6", "מן הצד הוו מתחלי - מפני ענוה יתירה שהיתה בו:", "'They would begin from the side': because of the extra humility that was in him."),
            ev("S11", "מתוך ענותנותו לא היה רוצה להתחיל הימנו אלא מן הקטן שבהן", "out of his humility he did not want [them] to begin with him, but with the smallest of them."),
            ev("S17", "משום לא תענה על ריב וכתיב חסר בלא יו\"ד ודרשינן לא תענה על רב לא תחלוק על מופלא שבבית דין",
               "because of 'do not answer in a dispute (riv)', written defectively without yod, and we expound: do not answer against the great one (rav), do not disagree with the most distinguished of the court."),
            ev("S18", "פי' בקונט' דמוקי לה לא תענה על ריב בכל דבר ואין נראה", "Rashi explained that he applies 'do not answer in a dispute' to every matter; this does not seem right."),
            ev("S18", "אלא משום ענוה שלא להראות עצמו גדול היה עושה", "rather, he did so out of humility, so as not to show himself great."),
            ev("S3", "This was because Rabbi Yehuda HaNasi was held in such high esteem that once he expressed his opinion, no one would be so brazen as to contradict him."),
            ev("S9", "משום שהיה רבי גדול מאוד בחכמה ובגדולה ולא היו מעיזים להמרות את פיו", "because Rabbi was very great in wisdom and greatness, and they would not dare to defy his word."),
            ev("S20", "ק\"ק דהו\"ל להקשות על רש\"י דידיה אדידיה דרש\"י עצמו פירש בסנהדרין דף ל\"ו משום ענוה",
               "It is a little difficult: they should have challenged Rashi from his own words, since Rashi himself explained in Sanhedrin 36 [that it was] because of humility."),
            ev("S21", "ולענ\"ד י\"ל הא דרש\"י פי' ב' פירושים דזה תליא בהשני פירושים שהביא רש\"י שם בגיטין אי רב מן הבינונים היה או הקטן שבכולם",
               "In my humble opinion, Rashi gave two explanations because it depends on the two views Rashi brought in Gittin: whether Rav was among the middling ones or the smallest of all."),
        ],
        "reasoning": "The Talmud states the practice ('all their votes began from the side') but not its motive. Humility is a trait of Rabbi; esteem is about how others reacted to him; the verse reading is a legal rule. These are three different graph claims, each from a named commentator.",
        "confidence": "high",
        "graph_effect": "c3/c4 should carry the practice only. Any motive (Rabbi's humility; others' deference; the verse) goes in as a commentary claim with its author, kept as disagreeing alternatives. None is a text-basis trait of Rabbi.",
    },
    {
        "finding_id": "F7",
        "claim": "The statement in 36a:7 praises Rabbi (and Moses): from Moses until Rabbi, no one else combined Torah and greatness. It does not say that Moses and Rabbi lacked the combination. The Gemara's objections list figures who might have combined both, and Rashi and Yad Ramah say that Moses and Rabbi each did.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "ואמר רבה בריה דרבא ואיתימא רבי הלל בריה דר' וולס מימות משה ועד רבי לא מצינו תורה וגדולה במקום אחד",
               "And Rabba son of Rava said, and some say Rabbi Hillel son of Rabbi Volas: from the days of Moses until Rabbi we did not find Torah and greatness in one place."),
            ev("S1", "ולא הא הוה יהושע הוה אלעזר", "Is that so? There was Joshua! — There was Elazar."),
            ev("S7", "כגון משה שהיה גדול על כל ישראל במלכות ובתורה וכן רבי בנשיאות ובתורה",
               "such as Moses, who was great over all Israel in rule and in Torah, and likewise Rabbi in the patriarchate and in Torah."),
            ev("S11", "וכן רבינו הקדוש היה גדול ולא היה בדורו כמוהו לא בחכמה ולא בנשיאות",
               "and likewise our holy Rabbi was great, and there was none like him in his generation, neither in wisdom nor in the patriarchate."),
        ],
        "reasoning": "The first reading's label 'From Moses to Rabbi, learning and greatness were not found together' could be read as denying the combination to Moses and Rabbi. The objections only make sense if the claim is about the period between them. It is a comparison that makes Moses and Rabbi the end points. It is not an interaction.",
        "confidence": "high",
        "graph_effect": "Relabel the 'combined' statement: 'Between Moses and Rabbi no one combined Torah and greatness (praise of Rabbi)'. Add 'about' roles for Moses and Rabbi. No meeting, no teaching, and no time overlap between them.",
    },
    {
        "finding_id": "F8",
        "claim": "The first reading anchored Rabbi only in 36a:5. Rabbi is named again in 36a:6 ('דבי רבי') and 36a:7 ('ועד רבי'). Both refer to the same Rabbi whose court Rav describes. The identification with Rabbi Yehuda HaNasi appears only in the William Davidson English's plain (editorial) words and in Steinsaltz.",
        "kind": "textual",
        "evidence": [
            ev("S1", "שאני מניינא דבי רבי", "the vote of Rabbi's house is different"),
            ev("S1", "מימות משה ועד רבי", "from the days of Moses until Rabbi"),
            ev("S3", "<b>in the school of Rabbi</b> Yehuda HaNasi <b>is different,"),
            ev("S8", "<b>רבי</b> יהודה הנשיא"),
        ],
        "reasoning": "Taken with 'Rabbi convened a court' in the Gittin parallel, these mentions support Rabbi as head of the court (בי רבי). 'Yehuda HaNasi' is not in the Aramaic. The same editorial work supplies both the English and the Steinsaltz Hebrew, so they do not count as two independent witnesses.",
        "confidence": "high",
        "graph_effect": "Add mentions of רבי in s2 and s3 linked to local entity 'rabbi'. Keep 'Rabbi = Yehuda HaNasi' as an identity proposal with an editorial basis. It is conventional and probable, but historical identity is decided separately.",
    },
    {
        "finding_id": "F9",
        "claim": "The objection is the anonymous Gemara voice ('והא אנן ... תנן', but we learned). It quotes the Mishnah rule that monetary and purity cases begin from the greatest. The Gittin parallel quotes the rule in full, including that capital cases begin from the side.",
        "kind": "textual",
        "evidence": [
            ev("S1", "והא אנן מתחילין מן הגדול תנן"),
            ev("S15", "והאנן תנן דיני ממונות והטהרות והטומאות מתחילין מן הגדול ודיני נפשות מתחילין מן הצד",
               "But we learned: monetary cases, and purities and impurities, begin from the greatest; and capital cases begin from the side."),
            ev("S30", "דִּינֵי הַטֻּמְאוֹת וְהַטָּהֳרוֹת מַתְחִילִין מִן הַגָּדוֹל, דִּינֵי נְפָשׁוֹת מַתְחִילִין מִן הַצָּד"),
        ],
        "reasoning": "'תנן' marks a quotation of Mishnah. That is a source-citation claim. The first reading recorded the objection but not which source it cites.",
        "confidence": "high",
        "graph_effect": "Add a source-attribution claim: the anonymous objection cites Mishnah Sanhedrin 4:1-2 (Bavli 32a). No named Tanna is involved.",
    },
    {
        "finding_id": "F10",
        "claim": "In both 36a:6-7 and the Gittin parallel, the second teaching repeats the same pair of alternative names, joined by 'ואמר' (and said). The texts never say whether choosing Rabba for one teaching means choosing Rabba for the other. Rabbeinu Chananel and Yad Ramah paraphrase the sugya without naming the speaker; Rabbeinu Chananel writes 'והן אמרו' (and they said).",
        "kind": "uncertainty",
        "evidence": [
            ev("S1", "ואמר רבה בריה דרבא ואיתימא רבי הלל בריה דר' וולס"),
            ev("S15", "ואמר רבה בריה דרבא ואיתימא רבי הילל בריה דרבי וולס"),
            ev("S12", "ואסיקנא כל מנייניה דבי רבי מן הצד הוו מתחלי והן אמרו מימות משה ועד רבי לא מצינו תורה וגדולה במקום אחד",
               "and we concluded: all the votes of Rabbi's house began from the side; and they said: from the days of Moses until Rabbi we did not find Torah and greatness in one place."),
        ],
        "reasoning": "'ואמר' with the identical pair suggests one transmitted unit carried with one attribution doubt. That is a reasonable reading, not a textual statement. A commentator's paraphrase that leaves out the names is not a textual variant against them.",
        "confidence": "medium",
        "graph_effect": "Link groups legal_speaker and praise_speaker as a repeated, probably correlated alternation, as the earlier review warned. Count them as one attribution doubt, not four independent speaker-teaching combinations. Do not use the commentators' omission of names as evidence.",
    },
    {
        "finding_id": "F11",
        "claim": "The wider sugya, just after the focal lines, names many more people. In Sanhedrin 36a:8-13: Joshua, Elazar, Pinchas, the Elders, Saul, Samuel, David, Ira the Yairite, Solomon, Shimi ben Gera, Hezekiah, Shebna, Ezra, and Nehemiah son of Hacaliah. Then a named amora says 'I too say: from Rabbi until Rav Ashi…' and mentions Huna bar Natan. Sanhedrin names that amora as Rav Adda bar Ahava; the Gittin parallel names him as Rav Acha son of Rava.",
        "kind": "textual",
        "evidence": [
            ev("S1", "אמר רב אדא בר אהבה אף אני אומר מימות רבי עד רב אשי לא מצינו תורה וגדולה במקום אחד",
               "Rav Adda bar Ahava said: I too say, from the days of Rabbi until Rav Ashi we did not find Torah and greatness in one place."),
            ev("S15", "אמר רב אחא בריה דרבא אף אני אומר מימות רבי ועד רב אשי לא מצינו תורה וגדולה במקום אחד",
               "Rav Acha son of Rava said: I too say, from the days of Rabbi until Rav Ashi..."),
            ev("S1", "הונא בר נתן מיכף הוה כייף ליה לרב אשי", "Huna bar Natan was subordinate to Rav Ashi."),
            ev("S15", "הא הוה אלעזר הוה פנחס והא הוה פנחס הוו זקנים"),
            ev("S1", "הוה אלעזר והא הוה פנחס הוו זקנים"),
            ev("S12", "ואסיק' אף אני אומר מימות רבי ועד רב אשי", "and it concluded: I too say, from Rabbi until Rav Ashi"),
        ],
        "reasoning": "These are outside the supplied excerpt (36a:5-7), but they belong to the same unit that the focal speaker's statement opens. The two parallels name different speakers for 'אף אני אומר'. That is a cross-parallel attribution difference to keep open, not a merge of Rav Adda bar Ahava and Rav Acha son of Rava. The Gittin text also has an Elazar-to-Pinchas step that Sanhedrin 36a:8 lacks. Rabbeinu Chananel paraphrases without a name. Rav Acha son of Rava also carries a patronymic (Rava), which gives one more local parent placeholder there; it is not assumed to be the Rava of 36a:6.",
        "confidence": "high",
        "graph_effect": "A later job should extend coverage to 36a:8-13. Record the 'אף אני אומר' attribution as a parallel-witness difference: Sanhedrin says Rav Adda bar Ahava, Gittin says Rav Acha son of Rava. Record Huna bar Natan's subordination to Rav Ashi as a stated social relation. Biblical figures are 'about' mentions in a comparison, not participants.",
    },
    {
        "finding_id": "F12",
        "claim": "Nothing in the passage says either explainer was present at Rabbi's court. Evidence elsewhere about 'R. Hillel son of R. Volas' does not settle who he was. In Avodah Zarah 52b he speaks alone, answering a question about something Rabbi taught his son R. Shimon. Yerushalmi Kilayim 9:1 has 'רבי הלל בירבי וולס' whose garment went to 'רבי', printed in parentheses. Guggenheimer glosses that Rebbi as 'probably Rebbi (Jehudah Nesia)', not Yehuda HaNasi. Seder HaDorot gathers several name forms into one entry.",
        "kind": "uncertainty",
        "evidence": [
            ev("S26", "א\"ר הילל בריה דרבי וולס לא נצרכה שיש לו בה שותפות"),
            ev("S28", "רִבִּי הִלֵּל בֵּירִבִּי וַולֶס הָיָה לוֹ בֶגֶד בִּשְׁלֹשִׁים רִיבּוֹא דֵינָר (וִיהֲבֵיהּ לְרִבִּי)",
               "Rebbi Hillel son of Rebbi Volas had a garment worth thirty myriad denars (and gave it to Rebbi)."),
            ev("S29", "Probably Rebbi (Jehudah Nesia) suspected the garment to contain the very expensive Egyptian byssus"),
            ev("S22", "ר' הלל בריה דר' וולס"),
        ],
        "reasoning": "A shared name does not establish identity. The explainers comment on Rav's report after the fact. Since the report is not theirs, it does not show that they attended or lived at the same time as Rabbi or Rav. The Yerushalmi's 'Rebbi' may be a later patriarch, according to Guggenheimer's note. If Rava is the well-known Amora, the two alternatives would be of very different periods, but the passage does not require resolving that.",
        "confidence": "medium",
        "graph_effect": "No presence, meeting or contemporaneity edges for Rabba son of Rava or R. Hillel son of R. Volas with Rabbi or Rav. Leave historical_compatibility of the attribution group as unknown. Any identity pack for R. Hillel b. R. Volas must weigh the Yerushalmi forms and Guggenheimer's 'Jehudah Nesia' gloss separately.",
    },
]

ALTERNATIVES = [
    {"id": "A1", "question": "Who gave the side-first explanation (36a:6)?", "options": ["Rabba son of Rava (main text)", "Rabbi Hillel son of Rabbi Volas (ואיתימא)"], "status": "open; the text keeps both", "evidence_findings": ["F1"]},
    {"id": "A2", "question": "Are the attributions in 36a:6 and 36a:7 chosen together?", "options": ["Correlated: one doubt about one transmitted unit (suggested by ואמר + identical pair)", "Independent per teaching"], "status": "open; correlated reading preferred as a modelling default, not asserted by the text", "evidence_findings": ["F10"]},
    {"id": "A3", "question": "Why did Rabbi's court begin from the side?", "options": ["Rabbi's humility (Rashi on Sanhedrin; Yad Ramah; Tosafot on Gittin)", "The verse 'do not answer against the great one' applies to all cases (Rashi on Gittin)", "Rabbi so esteemed that no one would contradict him (Steinsaltz; William Davidson English editorial)"], "status": "commentary disagreement; the Talmud gives no reason", "evidence_findings": ["F6"]},
    {"id": "A4", "question": "What was Rav's rank in the court?", "options": ["Middling (Rashi on Gittin, first view)", "Smallest/youngest (Rashi on Gittin, 'I heard'; Steinsaltz; William Davidson editorial)", "Only: not the greatest (implication of the objection)"], "status": "open; only 'not the greatest' follows from the text", "evidence_findings": ["F5"]},
    {"id": "A5", "question": "Which vote did Rav mean?", "options": ["The sicarii ordinance vote (Gittin placement; Rashi)", "Rabbi's court voting in general ('הוו מתחלי', habitual)"], "status": "open for Sanhedrin; the Gittin context supports the first", "evidence_findings": ["F4"]},
    {"id": "A6", "question": "Who said 'I too say: from Rabbi until Rav Ashi' (wider context)?", "options": ["Rav Adda bar Ahava (Sanhedrin 36a:13)", "Rav Acha son of Rava (Gittin 59a:9)"], "status": "parallel-witness difference; keep both", "evidence_findings": ["F11"]},
]

UNRESOLVED = [
    "Manuscript readings of the speaker names were not checked directly. The Munich ולס and Arukh וילס are known here only through Jastrow. Dikdukei Soferim and manuscript images were not consulted.",
    "Whether the Rava in 'Rabba son of Rava' is the well-known Amora Rava. Seder HaDorot assumes a link; this dossier does not test it.",
    "Whether R. Hillel b. R. Volas of Bavli Sanhedrin/Gittin/Avodah Zarah is the Yerushalmi's רבי הלל בירבי וולס / בר אלס / בר חליס. That needs a separate identity pack.",
    "The meaning of the parentheses around '(ויהביה לרבי)' in the Guggenheimer Hebrew. Guggenheimer's note 23 was not present in the saved text version.",
    "Tosafot on Sanhedrin 36a and other Rishonim (e.g. Ramah is covered; Ran, Rif and Rosh on Gittin not checked) were not examined for this line. The Sefaria links for 36a:5-7 list no Tosafot, but that does not show that none exists.",
    "Whether Rav's report ('הוו מתחלי', they would begin) describes one vote or repeated practice. The Sanhedrin wording allows either.",
]

CORRECTIONS = [
    {"existing_claim_id": "combined (entity) / c5 / c6", "change": "Relabel the statement as 'Between Moses and Rabbi no one else combined Torah and greatness (praise of Rabbi)', and add Moses and Rabbi as 'about' roles.", "why": "The Gemara's objections and Rashi/Yad Ramah show that the claim is about the gap between Moses and Rabbi, both of whom did combine the two. The current label can be read as denying it to them (F7)."},
    {"existing_claim_id": "mentions (rabbi)", "change": "Add mentions of רבי in s2 ('דבי רבי') and s3 ('ועד רבי') linked to entity 'rabbi'.", "why": "The first reading anchored Rabbi only in s1 (F8)."},
    {"existing_claim_id": "reading_groups legal_speaker, praise_speaker", "change": "Mark the two groups as a repeated, probably correlated alternation, so that downstream counting does not treat them as four independent combinations.", "why": "Both parallels repeat the identical pair after ואמר (F10). This agrees with the earlier review's minor finding."},
    {"existing_claim_id": "c3, c4", "change": "Keep the practice only. Add any motive as a separate commentary claim with its author (Rashi on Sanhedrin / Yad Ramah / Tosafot on Gittin: humility; Rashi on Gittin: the verse; Steinsaltz and the William Davidson editors: deference to Rabbi's esteem).", "why": "The text states no reason, and the commentators disagree, including Rashi with himself (F6)."},
    {"existing_claim_id": "c1 / voting (event)", "change": "Add a candidate link to the Gittin 58b:15 sicarii court vote with basis 'parallel sugya + Rashi', not explicit.", "why": "F4."},
    {"existing_claim_id": "c2 / questioner", "change": "Add a source-citation claim: the anonymous objection cites the Mishnah (Sanhedrin 4:1-2 / Bavli 32a).", "why": "'תנן' marks a Mishnah quotation (F9)."},
    {"existing_claim_id": None, "change": "Do not add 'Rav was the youngest judge' as a text claim. If recorded, store it as a disagreeing commentary view.", "why": "It appears only in commentary and editorial plain text, and Rashi records a 'middling' view (F5)."},
    {"existing_claim_id": "voles (entity)", "change": "Attach the name-form variants וולס / ולס (Munich manuscript, reported by Jastrow) / וילס (Arukh ed. Kohut, reported by Jastrow) as a reported-variant attribute.", "why": "F3."},
    {"existing_claim_id": "episode.coverage", "change": "Note that the unit continues to 36a:13 with more persons and a cross-parallel attribution difference (Rav Adda bar Ahava vs Rav Acha son of Rava).", "why": "F11. The supplied excerpt ends inside the unit that the focal speaker opens."},
]

LESSONS = [
    "A parallel sugya in another tractate is a second copy of the text, not an independent witness to what happened. Where the parallels differ (Rav Adda bar Ahava vs Rav Acha son of Rava), record a parallel-witness attribution difference.",
    "A commentator can disagree with himself across locations (Rashi on Sanhedrin vs Rashi on Gittin). Commentary claims need the author and the exact location, not only the author.",
    "A motive for a practice (humility, deference, a scriptural rule) is a separate claim with its own author. It must not be folded into the textual claim of the practice.",
    "A repeated ואיתימא pair joined by ואמר needs a 'linked alternation' construct. Otherwise branch enumeration multiplies one doubt into independent combinations.",
    "A comparison of the form 'from X until Y none...' creates 'about' relations and end-point roles, not interaction or contemporaneity.",
    "Editorial glosses (William Davidson plain text, Steinsaltz) that add rank ('youngest'), identity ('Yehuda HaNasi') or motive must be typed as editorial commentary. They come from one editorial project, so they are one witness, not two.",
    "When a commentary paraphrase leaves out a speaker's name (Rabbeinu Chananel's 'והן אמרו'), that is not a textual variant.",
    "Spelling variants of a parent's name belong on the name-mention as reported readings. They do not create new persons.",
]


def main():
    sources = []
    for sid, path, edition, saved in SOURCES:
        data = (ROOT / saved).read_bytes()
        entry = {"source_id": sid, "edition": edition, "saved_file": saved,
                 "sha256": hashlib.sha256(data).hexdigest()}
        log = LOG.get(saved)
        if log:
            entry["url"] = log["url"]
            entry["fetched_at"] = log["fetched_at"]
        else:
            entry["input_path"] = path
            entry["fetched_at"] = None
        sources.append(entry)
    dossier = {
        "job_id": "challenge-07",
        "focal_ref": "Sanhedrin 36a:6",
        "status": "researched",
        "question": "In Sanhedrin 36a:6, who gives the explanation that Rabbi's court voted from the side, what kinship do the names carry, and what do the wider sugya, the Gittin 58b-59a parallel and the commentaries add or dispute about Rav's vote, the practice's reason and the follow-on praise of Rabbi?",
        "scope_note": "Checked: Sanhedrin 36a in Wikisource, William Davidson Aramaic and English; Gittin 58b-59a (Wikisource, William Davidson Aramaic and English); Mishnah Sanhedrin 4:2; Rashi (Sanhedrin 36a:5-7, Gittin 58b-59a), Tosafot on Gittin 59a, Steinsaltz (Sanhedrin 36a, Gittin 59a), Yad Ramah, Rabbeinu Chananel, Meiri, Chokhmat Shlomo, Arukh LaNer, Chatam Sofer, Petach Einayim, Rashash on Gittin 59a; Seder HaDorot entries 1042, 1062, 3190; Jastrow; Avodah Zarah 52b; Yerushalmi Kilayim 9:1 (Guggenheimer). Not checked: manuscript images, Dikdukei Soferim, Tosafot or Ran on Sanhedrin 36a, Rif and Rosh. Conclusions are limited to these sources.",
        "sources": sources,
        "findings": FINDINGS,
        "alternative_readings": ALTERNATIVES,
        "unresolved": UNRESOLVED,
        "proposed_corrections": CORRECTIONS,
        "ontology_lessons": LESSONS,
    }
    part = ROOT / "dossier.json.part"
    part.write_text(json.dumps(dossier, ensure_ascii=False, indent=1) + "\n")
    part.replace(ROOT / "dossier.json")


if __name__ == "__main__":
    main()
