"""Findings, alternatives and corrections for challenge-15 (Berakhot 10a:2-4). Quotes are checked by build_dossier.py."""

VISUAL = "researcher_visual_reading_of_page_image"


def ev(sid, quote, location, translation=None, **extra):
    e = {"source_id": sid, "exact_quote": quote, "location": location}
    if translation:
        e["translation_by_researcher"] = translation
    e.update(extra)
    return e


def vis(sid, quote, location, translation, note=""):
    return {"source_id": sid, "evidence_type": VISUAL, "exact_quote": quote,
            "note": ("Visual reading of a page image; not machine-checked; letters may be misread. " + note).strip(),
            "location": location, "translation_by_researcher": translation}


QUESTION = (
    "In Berakhot 10a:2-4 (Rabbi Meir, his wife Berurya and the troublemakers in his neighbourhood), which graph "
    "claims are explicit in the Aramaic, which rest on interpretation (who speaks 10a:3, who prays in 10a:4, whether "
    "the first prayer was completed), and what do parallels, manuscripts, translations and commentaries add or "
    "leave open?"
)

SCOPE = (
    "Checked: Berakhot 9b:26-31 and 10a:1-10 (William Davidson Vocalized Aramaic and English; Wikisource; the "
    "William Davidson Aramaic and A. Cohen's 1921 English for 10a:2-7); Rashi, Steinsaltz, Tosafot HaRosh, "
    "Chokhmat Shlomo, Haggahot Ya'avetz, Ben Yehoyada, Tzelach, Maharsha, Meiri and Cohen's footnotes on 10a; "
    "Psalms 104:35 (Masoretic text, JPS) with Rashi; the Midrash Tehillim 104:22 parallel; two Ein Yaakov texts "
    "(Daat and Glick); Avodah Zarah 18a:14; Munich Cod. hebr. 95 page 0282 (visual reading only). Not checked: "
    "other manuscripts (Florence, Paris, Oxford and the Genizah fragments), the Goldschmidt German (the request "
    "returned no text), the Goodblatt 1975 article (not accessible), and other Berurya passages (Pesachim 62b, "
    "Eruvin 53b-54a, the Tosefta). Conclusions are limited to these sources."
)

FINDINGS = [
    {
        "finding_id": "F1",
        "claim": "The Aramaic itself says Berurya is Rabbi Meir's wife. The word דביתהו ('his wife', literally 'his "
                 "household') is part of the Talmud's text, and the Davidson English prints it in bold. No "
                 "translator added it.",
        "kind": "textual",
        "evidence": [
            ev("pilot_input", "אמרה ליה ברוריא דביתהו", "Berakhot 10a:2, Davidson Aramaic (unvocalized form)",
               "Berurya, his wife, said to him"),
            ev("ber10a", "אמרה לי' ברוריא דביתהו", "Berakhot 10a:2, Wikisource Talmud Bavli"),
            ev("ber10a", "<b>mercy on them, that they should die. Rabbi Meir’s wife, Berurya, said to him: What is your thinking?</b>",
               "Berakhot 10a:2, Davidson English (all bold, so it translates the Aramaic)"),
            ev("ber10a_cohen", "His wife, Beruriah, exclaimed,", "Berakhot 10a:2, Cohen 1921 English"),
            ev("steinsaltz", "<b>ברוריא דביתהו</b> <small>[אשתו]:</small>", "Steinsaltz on 10a:2",
               "Berurya dvit-hu [his wife]"),
        ],
        "reasoning": "The relation noun with a possessive suffix is explicit. 'His' refers to Rabbi Meir, the only man "
                     "named before it and the person she addresses (ליה). The Wikisource text, the Davidson text and "
                     "Cohen's translation agree. Cohen is a translation of the printed text. It shows how that text is "
                     "understood; it is not a separate manuscript witness. Steinsaltz and the Davidson English come "
                     "from the same editorial project.",
        "confidence": "high",
        "graph_effect": "Keep c1 (Berurya spouse_of Meir), saved once as a symmetric relation. The relation word is "
                        "explicit and the possessor comes from local coreference. The pilot's basis 'local_coreference' "
                        "is acceptable. A better form would record both parts: explicit relation noun plus a possessor "
                        "resolved from context.",
    },
    {
        "finding_id": "F2",
        "claim": "The story has no named teller. The citation just before it, 'Rabbi Shmuel bar Naḥmani said that "
                 "Rabbi Yoḥanan said' (9b:31), introduces only the teaching in 10a:1 about psalms that begin and end "
                 "with 'happy'. The story opens a new unit with הנהו ('these certain...'), and the Davidson English "
                 "gives it to 'the Gemara'.",
        "kind": "textual",
        "evidence": [
            ev("ber9b", "דְּאָמַר רַבִּי שְׁמוּאֵל בַּר נַחְמָנִי אָמַר רַבִּי יוֹחָנָן:", "Berakhot 9b:31, Davidson Vocalized Aramaic",
               "As Rabbi Shmuel bar Nahmani said that Rabbi Yochanan said:"),
            ev("ber10a", "כָּל פָּרָשָׁה שֶׁהָיְתָה חֲבִיבָה עַל דָּוִד", "Berakhot 10a:1, Davidson Vocalized Aramaic",
               "Every chapter that was dear to David"),
            ev("pilot_input", "הנהו בריוני דהוו בשבבותיה דרבי מאיר", "Berakhot 10a:2",
               "Those troublemakers who were in Rabbi Meir's neighbourhood"),
            ev("ber10a", "the Gemara relates: <b>There were these hooligans in Rabbi Meir’s neighborhood",
               "Berakhot 10a:2, Davidson English ('the Gemara relates' is plain text, the editor's framing)"),
        ],
        "reasoning": "10a:1 is a complete statement with its two verse proofs. Nothing in 10a:2 continues it or names a "
                     "transmitter. The judgment that the chain stops at 10a:1 is structural. The text simply does not "
                     "give the story a teller. This matters because an extractor that carries the last chain forward "
                     "would wrongly make Rabbi Yoḥanan, or Rabbi Shmuel bar Naḥmani, the source of a story about Rabbi Meir.",
        "confidence": "high",
        "graph_effect": "Keep voice = narrator for c1-c10. Add no reports_in_name_of edge from the story to Rabbi Yoḥanan "
                        "or Rabbi Shmuel bar Naḥmani, and no link between them and Meir or Berurya.",
    },
    {
        "finding_id": "F3",
        "claim": "The story comes right after Rabbi Yehuda son of Rabbi Shimon ben Pazi quotes the same verse, Psalms "
                 "104:35, as David's praise at 'the downfall of the wicked' (9b:29). The Davidson English (in plain "
                 "text), Steinsaltz and the Tzelach connect the story to that teaching. The Tzelach adds that the "
                 "verse's plain sense still concerns the downfall of the wicked. The Talmud does not say that Berurya "
                 "answers him.",
        "kind": "interpretation",
        "evidence": [
            ev("ber9b", "דְּאָמַר רַבִּי יְהוּדָה בְּרֵיהּ דְּרַבִּי שִׁמְעוֹן בֶּן פַּזִּי: מֵאָה וְשָׁלֹשׁ פָּרָשִׁיּוֹת אָמַר דָּוִד",
               "Berakhot 9b:29, Davidson Vocalized Aramaic",
               "As Rabbi Yehuda son of Rabbi Shimon ben Pazi said: David said one hundred and three chapters"),
            ev("ber9b", "וְלֹא אָמַר ״הַלְלוּיָהּ״ עַד שֶׁרָאָה בְּמַפַּלְתָּן שֶׁל רְשָׁעִים, שֶׁנֶּאֱמַר: ״יִתַּמּוּ חַטָּאִים מִן הָאָרֶץ",
               "Berakhot 9b:29, Davidson Vocalized Aramaic",
               "and he did not say Halleluya until he saw the downfall of the wicked, as it says: 'Let chata'im cease from the earth'"),
            ev("ber10a", "With regard to the statement of Rabbi Yehuda, son of Rabbi Shimon ben Pazi, that David did not say <i>Halleluya</i> until he saw the downfall of the wicked, the Gemara relates:",
               "Berakhot 10a:2, Davidson English (plain text = editor's framing, not the Talmud's words)"),
            ev("steinsaltz", "בקשר לדרשה כי לא אמר דוד \"הללויה\" עד שראה במפלתם של רשעים, מסופר:",
               "Steinsaltz on 10a:2", "In connection with the teaching that David did not say Halleluya until he saw "
               "the downfall of the wicked, it is told:"),
            ev("tzelach", "אנו רואים שאין מקרא יוצא מידי פשוטו שהרי ר\"י ברי' דר\"ש ב\"פ לעיל ור' יוחנן לקמן משום רשב\"י בהני חמשה ברכי נפשי מקומי להאי קרא במפלתן של רשעים",
               "Tzelach on 10a:2", "we see that a verse does not depart from its plain sense, for R. Yehuda son of R. "
               "Shimon b. Pazi above, and R. Yochanan below in the name of R. Shimon b. Yochai [on] these five 'Bless "
               "my soul', set this verse on the downfall of the wicked"),
        ],
        "reasoning": "The textual fact is that the two readings of one verse sit next to each other. The link between "
                     "them comes from how the sugya is arranged and from later editors. Nothing in the text says the "
                     "two speakers met, answered each other or lived at the same time. The Tzelach's point is a "
                     "commentator's harmonisation: Berurya's reading and the downfall reading can both stand. "
                     "The patronymic 'son of Rabbi Shimon ben Pazi' belongs to the 9b passage. It supports a "
                     "father link, and a 'son of Pazi' link for the father, in that passage's graph.",
        "confidence": "medium",
        "graph_effect": "Optional statement-to-statement link: Berurya's reading ('reading' in the pilot) is set beside "
                        "Rabbi Yehuda b. R. Shimon b. Pazi's reading of Psalms 104:35. Record it as an editorial "
                        "juxtaposition in the editor's or commentary's voice. Do not add a person-to-person edge "
                        "between Berurya and Rabbi Yehuda. Out of scope here: the 9b graph keeps Rabbi Yehuda's father "
                        "(Rabbi Shimon ben Pazi) and a placeholder for Pazi.",
    },
    {
        "finding_id": "F4",
        "claim": "Berurya very probably speaks all of 10a:3 (the second argument, 'go down to the end of the verse', and "
                 "the call to pray for repentance). No new speaker is named there, but the imperatives are said to "
                 "Meir. Rashi explains שפיל as 'lower yourself', second person. Davidson, Cohen (who keeps it inside "
                 "her quotation) and Steinsaltz all give it to her. This rests on interpretation, not on a speaker "
                 "marker.",
        "kind": "interpretation",
        "evidence": [
            ev("pilot_input", "ועוד, שפיל לסיפיה דקרא ״ורשעים עוד אינם״", "Berakhot 10a:3",
               "And moreover, go down to the end of the verse, 'and the wicked will be no more'"),
            ev("ber10a", "אֶלָּא בְּעִי רַחֲמֵי עִלָּוַיְהוּ דְּלַהְדְּרוּ בִּתְשׁוּבָה", "Berakhot 10a:3, Davidson Vocalized Aramaic "
               "(בְּעִי vocalized as an imperative)", "Rather, pray [you] for mercy on them that they return in repentance"),
            ev("rashi", "שפיל – השפיל עצמך לסוף המקרא", "Rashi on 10a:3", "Shefil: lower yourself to the end of the verse"),
            ev("ber10a_cohen", "Rather shouldest thou pray that they repent and they be no more wicked.\"",
               "Berakhot 10a:3, Cohen 1921 English (closing quotation mark ends Beruriah's speech here)"),
            ev("steinsaltz", "ראה ר' מאיר צדקת דברי ברוריה", "Steinsaltz on 10a:4",
               "Rabbi Meir saw the rightness of Berurya's words"),
        ],
        "reasoning": "ועוד ('and moreover') continues an argument already under way. Berurya is the only speaker then "
                     "talking, and the second-person commands have to be addressed to Meir. The reading is strong but "
                     "structural. Some witnesses show this part of the text was unstable. The Midrash Tehillim parallel "
                     "lacks the second argument altogether (F9). One Ein Yaakov text lacks one clause, and Munich 95 "
                     "appears to have it only in the margin (F10). That does not move the speech to someone else, "
                     "but the attribution comes from continuity, not from an explicit speaker.",
        "confidence": "high",
        "graph_effect": "Keep c6 and c7 with subject Berurya. Label the basis as speech continuation without a new "
                        "speaker marker (an interpretive basis), not bare 'local_coreference'. The earlier review "
                        "passed these claims without noting this.",
    },
    {
        "finding_id": "F5",
        "claim": "10a:4 names no one: 'He prayed for mercy on them, and they repented.' That the one who prays is "
                 "Meir comes from context (a masculine singular verb in a story about him). That Meir accepted "
                 "Berurya's argument appears only in editors' words: Davidson's plain text 'Rabbi Meir saw that "
                 "Berurya was correct' and Steinsaltz. The text does not say his prayer caused their repentance. It "
                 "only tells the two events in order.",
        "kind": "interpretation",
        "evidence": [
            ev("pilot_input", "בעא רחמי עלויהו, והדרו בתשובה.", "Berakhot 10a:4",
               "He prayed for mercy on them, and they returned in repentance."),
            ev("ber10a", "Rabbi Meir saw that Berurya was correct <b>and he prayed for</b>",
               "Berakhot 10a:4, Davidson English (only 'and he prayed for' is bold)"),
            ev("ber10a_cohen", "R. Meir offered prayer on their behalf and they repented.",
               "Berakhot 10a:4, Cohen 1921 English (supplies the name)"),
            ev("steinsaltz", "ראה ר' מאיר צדקת דברי ברוריה ו<b>בעא רחמי עלויהו, והדרו</b>", "Steinsaltz on 10a:4",
               "Rabbi Meir saw the rightness of Berurya's words and [bold:] prayed for mercy on them, and they returned"),
        ],
        "reasoning": "In the Davidson English, bold marks the Talmud's own words and plain text marks editorial "
                     "explanation. 'Rabbi Meir saw that Berurya was correct' is plain. Cohen puts the name in without "
                     "marking it. The action (he prays as she urged) shows he took her advice in practice, but "
                     "'agrees' is a reader's inference. The narrative puts the prayer before the repentance, and a "
                     "causal reading is natural but not stated.",
        "confidence": "high",
        "graph_effect": "Keep c8 (subject Meir, basis local_coreference) and c10 (time order only). If an 'accepts "
                        "view of' or 'persuaded by' edge from Meir to Berurya is added, give it an interpretation "
                        "basis in the editor's voice, never text-stated. Do not add a 'caused' edge from the prayer to "
                        "the repentance as explicit.",
    },
    {
        "finding_id": "F6",
        "claim": "The first prayer is told with a continuous form, הוה קא בעי ('was praying / was seeking'). The "
                 "Davidson English and Cohen translate it as a finished prayer ('prayed'; 'Once R. Meir prayed'). "
                 "Steinsaltz glosses 'was requesting'. Ben Yehoyada reports a question from 'Sefer Chasidim': if Meir "
                 "had already prayed and was not answered, why record it; if he had not yet prayed, why not say 'was "
                 "about to pray'. Ben Yehoyada answers that Meir did pray, but only indirectly: that the men would not "
                 "get what they craved, which would in time cause their deaths.",
        "kind": "uncertainty",
        "evidence": [
            ev("ber10a", "הֲוָה קָא בָּעֵי רַבִּי מֵאִיר רַחֲמֵי עִלָּוַיְהוּ כִּי הֵיכִי דְּלֵימוּתוּ",
               "Berakhot 10a:2, Davidson Vocalized Aramaic",
               "Rabbi Meir was praying [lit. was requesting mercy] concerning them so that they would die"),
            ev("ber10a", "<b>There were these hooligans in Rabbi Meir’s neighborhood who caused him a great deal of anguish. Rabbi Meir prayed for</b>",
               "Berakhot 10a:2, Davidson English"),
            ev("ber10a_cohen", "Once R. Meir prayed that they should die.", "Berakhot 10a:2, Cohen 1921 English"),
            ev("steinsaltz", "<b>הוה קא בעי</b> <small>[היה מבקש]</small>", "Steinsaltz on 10a:2", "was requesting"),
            ev("ben_yehoyada", "קושית הגאון ספר חסידים ז\"ל שהקשה אם כבר ר\"מ בקש כאשר רצה ולא נענה הוה ליה למימר להש\"ס לזכור זה, ואם לא בקש עדיין רק היה רוצה לבקש ולא הניחתו ברוריה, הוה ליה למימר הכי הוה קא בעי למבעי רחמי וכו'?",
               "Ben Yehoyada on 10a:2 (reporting another work)",
               "the question of the Gaon Sefer Chasidim: if R. Meir had already asked as he wished and was not "
               "answered, the Talmud should have said so; and if he had not yet asked but only wanted to, and Berurya "
               "did not let him, it should have said 'he was about to pray'"),
            ev("ben_yehoyada", "רצונו לומר לא בקש שימותו אלא בקש דבר שממנו יהיה סיבה שימותו",
               "Ben Yehoyada on 10a:2 (his own answer)",
               "meaning: he did not ask that they die, but asked for something that would become a cause of their death"),
            ev("midrash_tehillim", "הוה בעי עליה דלימות", "Midrash Tehillim 104:22 (OYW)",
               "he was praying concerning him that he die"),
        ],
        "reasoning": "The form describes an ongoing action. Translations turn it into a completed prayer, and "
                     "commentators ask which it was. The text does not report the prayer being answered, nor the men "
                     "dying. Ben Yehoyada's indirect-prayer reading is a commentator's harmonisation. It is not "
                     "evidence of what Meir literally asked. The source he calls 'Sefer Chasidim' was not found in "
                     "the two Sefer Chasidim sections fetched (76, 225). It is known here only through his report.",
        "confidence": "medium",
        "graph_effect": "Keep c3, with its note that the deaths are only wished for. Add to its modality that the "
                        "aspect is progressive (was praying / was seeking), and add an alternative branch "
                        "'begun or intended, not completed'. The content 'that they die' stays as the text states it. "
                        "Ben Yehoyada's indirect-content reading goes in as a commentary alternative, not a correction.",
    },
    {
        "finding_id": "F7",
        "claim": "Meir never states a reason of his own. The scriptural reason, that he relied on 'let chata'im cease', "
                 "is Berurya's guess, put as a question: 'What is your thinking? Because it is written...?' "
                 "Commentators reconstruct Meir's view differently. Maharsha: he read the word as 'sinners', whose "
                 "death benefits them and the world. Ben Yehoyada, citing Maharsha: Meir held that one should not pray "
                 "for another person's repentance.",
        "kind": "interpretation",
        "evidence": [
            ev("pilot_input", "מאי דעתך — משום דכתיב ״יתמו חטאים״", "Berakhot 10a:2",
               "What is your thinking — because it is written 'let chata'im cease'?"),
            ev("ber10a", "On what basis do you pray for the death of these hooligans? Do you base yourself on the verse, <b>as it is written:",
               "Berakhot 10a:2, Davidson English (the two questions are plain text, the editor's expansion)"),
            ev("maharsha", "ואמרה ליה ברוריה מי כתיב חוטאים דלא משמע אלא שם התואר", "Maharsha, Chidushei Agadot on 10a",
               "and Berurya said to him: is 'chotim' written, which means only the adjective [sinners]?"),
            ev("ben_yehoyada", "ונראה כמו שכתב מהרש\"א דאיהו סובר כיון דהכל בידי שמים חוץ מיראת שמים, אין נכון להתפלל על אחרים שיחזרו בתשובה",
               "Ben Yehoyada on 10a:2",
               "it seems, as Maharsha wrote, that he [Meir] held: since everything is in the hands of Heaven except "
               "the fear of Heaven, it is not right to pray for others that they repent"),
        ],
        "reasoning": "'מאי דעתך' asks about the addressee's reasoning, and 'משום דכתיב' offers a guess. Meir does not "
                     "answer. Giving Meir an asserted view of the verse would turn Berurya's guess into his statement.",
        "confidence": "high",
        "graph_effect": "Do not add 'Meir holds_view: verse means sinners should die' as asserted. If it is recorded, "
                        "make it a view Berurya attributes to Meir as a question (hypothetical, reported by another). "
                        "The Maharsha and Ben Yehoyada reconstructions are commentary alternatives.",
    },
    {
        "finding_id": "F8",
        "claim": "The point about the word is contested, and a label for it should say so. The Masoretic pointing is "
                 "חַטָּאִים, and the JPS renders it 'sinners'. Cohen says Berurya read the word as חֲטָאִים 'sins'. "
                 "Tosafot HaRosh grants that the word as pointed means sinners, but says it may be expounded as sins "
                 "because the verse did not write חוטאים. Rashi: 'read in it chata'im: that the evil inclination will "
                 "end'. Chokhmat Shlomo reports a Rashi text reading חוטאים and calls it a mistake. Rashi on Psalms "
                 "glosses the word חוֹטְאִים ('sinners') and cites Berakhot 10a.",
        "kind": "interpretation",
        "evidence": [
            ev("psalms", "יִתַּ֤מּוּ חַטָּאִ֨ים", "Psalms 104:35, Miqra according to the Masorah"),
            ev("psalms", "May sinners disappear from the earth,", "Psalms 104:35, JPS Gender-Sensitive Edition"),
            ev("cohen_fn", "she pointed חֲטָאִים \"sins.\"", "Cohen footnote 3 on 10a"),
            ev("tosafot_harosh", "ואע\"ג דהיינו נמי חוטאים בוי\"ו דהא לא קרינן חטאים בחט\"ף פתח מ\"מ מדשני קרא בדיבוריה ולא כתב חוטאים בוא\"ו יש לדורשו לשון עונות",
               "Tosafot HaRosh on 10a:2",
               "although this too means chotim with a vav, since we do not read chata'im with a chataf-patach; still, "
               "since the verse changed its wording and did not write chotim with a vav, it may be expounded as 'sins'"),
            ev("rashi", "חטאים כתיב – קרי ביה חטאים שיכלה יצר הרע:", "Rashi on 10a:2 (Vilna)",
               "'Chata'im is written': read in it chata'im [sins], that the evil inclination will end"),
            ev("chokhmat_shlomo", "קרי ביה חוטאים כו' נ\"ב נ\"ל טעות אלא קרי ביה חטאים וכן מצאתי בס\"א",
               "Chokhmat Shlomo on Rashi 10a", "'read in it chotim' etc.: it seems to me a mistake; rather 'read in it "
               "chata'im', and so I found in another book"),
            ev("yaavetz", "חטאים קרינן בפת\"ח וטי\"ת דגושה. והוא תואר ענינו כמו חוטאים.", "Haggahot Ya'avetz on 10a",
               "we read chata'im with a patach and a doubled tet; it is an adjective meaning like chotim"),
            ev("rashi_ps", "<b>יִתַּמּוּ חַטָּאִים.</b> חוֹטְאִים (ברכות י.):", "Rashi on Psalms 104:35",
               "'Let chata'im cease': chotim [sinners] (Berakhot 10a)"),
            ev("maharsha", "ומשמע נמי שם דבר של חטאים רבים", "Maharsha, Chidushei Agadot on 10a",
               "and it also means the noun, many sins"),
        ],
        "reasoning": "These are lexical and interpretive claims about the verse. They affect the label for Berurya's "
                     "statement, not who is in the graph. Cohen, Tosafot HaRosh and Ya'avetz agree that the pointed "
                     "word means 'sinners' and that Berurya reads it another way. Maharsha says the written form can "
                     "carry both senses. Rashi's gloss on Psalms follows the 'sinners' sense while citing this "
                     "passage. Why he did so was not investigated. The saved Wikipedia text also mentions an "
                     "agent-noun reading (see A3). That is tertiary and unattributed.",
        "confidence": "high",
        "graph_effect": "Relabel the pilot statement 'reading' as: Berurya reads חטאים as 'sins' rather than "
                        "'sinners' (a reading against the vowels, according to Cohen, Tosafot HaRosh and Ya'avetz). "
                        "No person or edge changes.",
    },
    {
        "finding_id": "F9",
        "claim": "A parallel in Midrash Tehillim 104:22 tells a shorter version. A single sectarian (מינא) in Meir's "
                 "neighbourhood distresses him, and Meir prays for his death. Berurya, called אתתיה ('his wife'), "
                 "objects that the verse says 'sins', not 'sinners'. There is no second argument, no changed prayer "
                 "and no repentance. On Sefaria this Hebrew comes with a Community Translation that reverses her "
                 "argument.",
        "kind": "textual",
        "evidence": [
            ev("midrash_tehillim", "רבי מאיר הוה ההוא מינא בשיבבותיה דהוה מצער ליה טובא הוה בעי עליה דלימות. אמרה ליה ברוריה אתתיה מאי דעתך משום יתמו חטאים. מי כתיב חוטאים יסופון. חטאים כתיב יתמו חובייא ורשעים עוד אינם.",
               "Midrash Tehillim 104:22, OYW Hebrew",
               "Rabbi Meir: there was a certain min in his neighbourhood who distressed him greatly; he was praying "
               "about him that he die. Berurya his wife said to him: What is your thinking, because of 'let chata'im "
               "cease'? Is it written 'let chotim [sinners] come to an end'? Chata'im is written: let sins [chovaya] "
               "cease, and the wicked will be no more."),
            ev("midrash_tehillim", "But it is also written, 'Let sinners cease.' Sinners are mentioned, but not sins.",
               "Midrash Tehillim 104:22, Sefaria Community Translation (contradicts the Hebrew it translates)"),
            ev("midrash_tehillim", "Rabbi Meir had a certain heretic in his neighborhood who caused him much anguish.",
               "Midrash Tehillim 104:22, Sefaria Community Translation"),
            ev("midrash_tehillim", "רבי יהודה אומר יתמו יעשו תמימים. ורשעים עוד אינם. אינם עוד רשעים.",
               "Midrash Tehillim 104:22, OYW Hebrew (context)",
               "Rabbi Yehuda says: 'yitammu' — they will become perfect; 'and the wicked are no more' — they are no "
               "longer wicked"),
            ev("midrash_tehillim", "אמר רבי שמואל בר אבא מראש הספר ועד כאן מאה ושלשה מזמורין ואין כתיב בהן הללויה",
               "Midrash Tehillim 104:22, OYW Hebrew (context)",
               "Rabbi Shmuel bar Abba said: from the start of the book to here are one hundred and three psalms, and "
               "Halleluya is not written in them"),
        ],
        "reasoning": "This is a separate work with its own passage record. It shares the named pair, the neighbourhood "
                     "and the verse, which makes it a parallel telling. But the antagonist differs: one min against the "
                     "Bavli's plural troublemakers. So does the relation word (אתתיה against דביתהו), and so does "
                     "the ending. Neither text says the two antagonists are the same people. In Midrash Tehillim the "
                     "'103 psalms without Halleluya' teaching is given to Rabbi Shmuel bar Abba. Berakhot 9b gives a "
                     "similar teaching to Rabbi Yehuda son of Rabbi Shimon ben Pazi. That is a difference in "
                     "attribution between works. It does not show that only one of them said it. The Community "
                     "Translation's 'But it is also written, Let sinners cease' reverses the Hebrew. It must not be used "
                     "as evidence for what Berurya argues.",
        "confidence": "high",
        "graph_effect": "Do not import the midrash's min into the Bavli episode, and do not relabel the Bavli's בריוני as "
                        "minim. If the parallel is ingested, it gets its own local Meir, Berurya (spouse via אתתיה) and "
                        "a single min. Joining them to the Bavli persons is a separate identity decision; the shared "
                        "names and the shared husband-wife pair are the evidence for it. Flag the Community Translation "
                        "of Midrash Tehillim 104:22 as unreliable here.",
    },
    {
        "finding_id": "F10",
        "claim": "Witnesses differ in wording. The Daat Ein Yaakov lacks the clause 'since chata'im will cease, [how] "
                 "will the wicked be no more?'. The Glick Ein Yaakov has it. In my visual reading of Munich 95 the same "
                 "clause is written in the outer margin beside the line. The Glick Ein Yaakov also lacks כי היכי in "
                 "the first prayer clause. Both Ein Yaakov texts spell the name ברוריה.",
        "kind": "textual",
        "evidence": [
            ev("pilot_input", "כיון ד״יתמו חטאים״ ״ורשעים עוד אינם״?", "Berakhot 10a:3, Davidson Aramaic",
               "Since 'let sins cease', 'and the wicked will be no more'?"),
            ev("ey_daat", "ועוד שפיל לסיפיה דקרא ורשעים עוד אינם אלא בעי רחמי עלייהו דלהדרי בתשובה",
               "Ein Yaakov (Daat), Berakhot 1:63", "And moreover go down to the end of the verse, 'and the wicked will "
               "be no more'; rather pray for mercy on them that they return in repentance"),
            ev("ey_glick", "ועוד שפיל לסיפיה דקרא ורשעים עוד אינם כיון דיתמו חטאים ורשעים עוד אינם אלא",
               "Ein Yaakov (Glick 1916), Berakhot 1:50"),
            ev("ey_glick", "הוה קא בעי ר״מ רחמי עלייהו דלימותו. אמרה ליה ברוריה דביתהו",
               "Ein Yaakov (Glick 1916), Berakhot 1:50", "R. Meir was praying for them that they die. Berurya his wife "
               "said to him"),
            ev("ey_daat", "הוה קא בעי ר\"מ רחמי עלייהו כי היכי דלימותו אמרה ליה ברוריה דביתהו",
               "Ein Yaakov (Daat), Berakhot 1:63"),
            vis("munich95_282_margin", "כיון דיתמו ח[...] / ורשעים עוד [...]",
                "Munich 95 page 0282, outer margin beside the story's third line",
                "Since 'let [sins] cease' ... / and the wicked [will be no] more",
                "Only the start of each of two short lines is legible to me; I read it as the missing clause supplied "
                "in the margin."),
            vis("munich95_282_right", "ועוד שפיל לסיפיה דקרא ורשעים עוד אינ[ם]",
                "Munich 95 page 0282, story line 3, right side of the main text column",
                "And moreover go down to the end of the verse, 'and the wicked will be no more'"),
        ],
        "reasoning": "These are witness variants, not proposed emendations. They touch the second argument (F4) but "
                     "change no person, speaker or relation. The Munich margin note is my reading of a page image, "
                     "unchecked. I cannot say whether it is by the scribe or a later hand.",
        "confidence": "medium",
        "graph_effect": "No person or edge changes. Attach the variant to c6 as a witness variant: the 'since ... no "
                        "more' clause is absent in Daat Ein Yaakov and marginal in Munich 95 (visual). Keep it "
                        "separate from any emendation.",
    },
    {
        "finding_id": "F11",
        "claim": "In my visual reading, Munich 95 has the name and the relation word, ברוריא דביתהו. The words of the "
                 "first prayer clause are hard to read. A line of small writing above it seems to contain 'on them, "
                 "mercy, so that they die'. The main-line wording there may differ from the printed text, and I "
                 "could not read it securely.",
        "kind": "uncertainty",
        "evidence": [
            vis("munich95_282_left", "אמרה ליה ברוריא דביתהו",
                "Munich 95 page 0282, story line 2, left part of the main text", "Berurya his wife said to him"),
            vis("munich95_282_interlinear", "ע[ל]ייהו רחמ[י] כי היכי דלי[מותו]",
                "Munich 95 page 0282, interlinear writing above story line 2",
                "on them mercy so that they [would die]",
                "Very small writing; letters in brackets are guesses. Whether this is a correction or an addition is "
                "not determined."),
        ],
        "reasoning": "The relation word matters for c1 and appears to be present. The prayer clause matters for c3 "
                     "(F6). A reliable reading needs a transcription service or a specialist, and Hachi Garsinan was "
                     "not accessed.",
        "confidence": "low",
        "graph_effect": "None now. Record it as a place to check before treating the wording of c3 as stable across "
                        "witnesses.",
    },
    {
        "finding_id": "F12",
        "claim": "The troublemakers are an unnamed, uncounted plural group, and the text places them in Meir's "
                 "neighbourhood. What kind of people they were is commentary. Rashi: 'lawless people'. Tosafot "
                 "HaRosh: 'Jewish bandits' who stood outside (in the wilderness) robbing people, deriving בריוני "
                 "from ברא 'outside'. Cohen: 'lawless men', and he doubts Krauss's Greek etymology.",
        "kind": "interpretation",
        "evidence": [
            ev("pilot_input", "הנהו בריוני דהוו בשבבותיה דרבי מאיר והוו קא מצערו ליה טובא.", "Berakhot 10a:2",
               "Those troublemakers who were in Rabbi Meir's neighbourhood were distressing him greatly."),
            ev("rashi", "בריוני – פריצים:", "Rashi on 10a:2", "baryonei: lawless / unruly people"),
            ev("tosafot_harosh", "לסטים ישראל על שהיו עומדין במדבר ללסטם את הבריות קרי להו בריוני לשון ברא תרגום של חוץ",
               "Tosafot HaRosh on 10a:2", "Jewish robbers; because they stood in the wilderness to rob people they "
               "are called baryonei, from bara, the Aramaic for 'outside'"),
            ev("ber10a_cohen", "There were some lawless men living in the neighbourhood of R. Meir",
               "Berakhot 10a:2, Cohen 1921 English"),
            ev("cohen_fn", "Barjoni which Krauss, p. 165, identifies with", "Cohen footnote 1 on 10a"),
            ev("cohen_fn", "But this is doubtful.", "Cohen footnote 1 on 10a"),
        ],
        "reasoning": "The pilot put 'who live near Meir' in the group's label but saved no relation for it. Being near "
                     "Meir is stated outright and is the story's premise. 'Jewish' and 'bandits' come from one "
                     "medieval commentator's etymology. The text does not say it.",
        "confidence": "high",
        "graph_effect": "Add an explicit claim: troublemakers located_in / neighbours_of Meir's neighbourhood. Evidence "
                        "'הנהו בריוני דהוו בשבבותיה דרבי מאיר'; voice narrator; basis explicit. Keep the group unnamed "
                        "and uncounted. Keep Tosafot HaRosh's 'Jewish bandits' as a commentary gloss, not an attribute.",
    },
    {
        "finding_id": "F13",
        "claim": "In the wider Bavli, Avodah Zarah 18a:14 says 'Berurya, wife of Rabbi Meir, was a daughter of Rabbi "
                 "Ḥanina ben Teradyon'. Her words there also mention a sister. Berakhot 10a gives her no father. The "
                 "next segment, 10a:5, brings in a different unnamed man who challenges Berurya: a min in the "
                 "Davidson text, a tzeduki (Sadducee) in Wikisource and in the Daat Ein Yaakov.",
        "kind": "textual",
        "evidence": [
            ev("az18a", "בְּרוּרְיָא דְּבֵיתְהוּ דְּרַבִּי מֵאִיר, בְּרַתֵּיה דְּרַבִּי חֲנִינָא בֶּן תְּרַדְיוֹן הֲוַאי",
               "Avodah Zarah 18a:14, Davidson Vocalized Aramaic",
               "Berurya, the wife of Rabbi Meir, was a daughter of Rabbi Hanina ben Teradyon"),
            ev("az18a", "זִילָא בִּי מִלְּתָא דְּיָתְבָא אֲחָתַאי בְּקוּבָּה שֶׁל זוֹנוֹת",
               "Avodah Zarah 18a:14, Davidson Vocalized Aramaic",
               "It is a disgrace to me that my sister sits in a brothel"),
            ev("ber10a", "אֲמַר לַהּ הַהוּא מִינָא לִבְרוּרְיָא", "Berakhot 10a:5, Davidson Vocalized Aramaic",
               "A certain min said to Berurya"),
            ev("ber10a", "אמר לה ההוא צדוקי לברוריא", "Berakhot 10a:5, Wikisource Talmud Bavli",
               "A certain tzeduki said to Berurya"),
            ev("cohen_fn", "Equivalent of the Latin name, Veluria; Krauss, p. 165.", "Cohen footnote 2 on 10a"),
        ],
        "reasoning": "The Avodah Zarah passage has its own graph: Berurya's father, the patronymic 'ben Teradyon' with "
                     "a placeholder for Teradyon, and an unnamed sister. Joining that Berurya to this one rests on the "
                     "same name and the same husband label. That is strong within the Bavli, but it is still a "
                     "cross-passage join. The 10a:5 challenger is a new, unnamed individual. He is not the troublemaker "
                     "group, and the min/tzeduki difference is a witness variant (often discussed as censorship; that "
                     "was not checked here). Cohen's note on the name is an etymology. It establishes no identity.",
        "confidence": "high",
        "graph_effect": "No change to the challenge-15 passage graph. For the global graph: propose a join between "
                        "Berurya (Berakhot 10a) and Berurya (Avodah Zarah 18a), justified by shared name plus shared "
                        "husband and kept provisional. Berurya's father link is evidenced only by Avodah Zarah 18a. The "
                        "next passage (10a:5-7) needs its own challenger node with a min/tzeduki variant.",
    },
    {
        "finding_id": "F14",
        "claim": "Later works treat Berurya's advice as the accepted rule. Meiri turns it into general guidance for a "
                 "scholar who is harassed, without naming Meir. Perush Kadmon on Sefer Chasidim cites the passage for "
                 "praying that a wrongdoer return to the good.",
        "kind": "interpretation",
        "evidence": [
            ev("meiri", "תלמיד חכם</b> שהיו אי זו מבני אדם מצערים לו אין ראוי לו לקללם אלא יתפלל עליהם שיחזרו בתשובה",
               "Meiri on Berakhot 10a", "A Torah scholar whom some people were distressing should not curse them but "
               "pray for them that they repent"),
            ev("perush_kadmon", "כדאי' בברכות מי כתיב חוטאים חטאים כתיב כו' אלא בעי רחמי עלייהו דליהדרי בתשובה",
               "Perush Kadmon on Sefer Chasidim 76:1", "as it is in Berakhot: is 'chotim' written? 'chata'im' is "
               "written ... rather pray for them that they repent"),
        ],
        "reasoning": "This is later reception. It shows how the story came to be read, as an endorsement of her view. "
                     "It adds nothing to who said what in the passage.",
        "confidence": "high",
        "graph_effect": "None for persons. It can support a note on c7 that later tradition takes her advice as "
                        "normative. That note is reception, not the text.",
    },
    {
        "finding_id": "F15",
        "claim": "The pilot's mention list leaves out several references to the people that carry no pronoun token: "
                 "the second-person suffix in דעתך ('your thinking', Meir); the addressee of the imperatives שפיל and "
                 "בעי in 10a:3 (Meir); the unnamed subject of בעא in 10a:4 (Meir); and the subjects of דלימותו, "
                 "דלהדרו and והדרו (the troublemakers). The saved entity links are correct. Only the mentions are "
                 "missing.",
        "kind": "textual",
        "evidence": [
            ev("pilot_input", "מאי דעתך", "Berakhot 10a:2", "What is your thinking"),
            ev("pilot_input", "אלא בעי רחמי עלויהו דלהדרו בתשובה", "Berakhot 10a:3",
               "Rather pray for mercy on them that they return in repentance"),
            ev("pilot_input", "בעא רחמי עלויהו, והדרו בתשובה.", "Berakhot 10a:4",
               "He prayed for mercy on them, and they returned in repentance."),
            ev("pilot_output", "Troublemakers who live near Meir", "Pilot output, entity 'troublemakers' label "
               "(the only place the neighbourhood relation is saved)"),
        ],
        "reasoning": "I checked the pilot's anchors. m5 (ליה, occurrence 1) is in 'מצערו ליה' and m6 (ליה, occurrence 2) "
                     "is in 'אמרה ליה'; both refer to Meir. m7-m9 (עלויהו in s1, s2, s3) all refer to the troublemakers. "
                     "These are right. The missing items are verb subjects and suffixes that a token-level mention "
                     "list skips. They are the evidence that Meir is the one who prays in 10a:4 and the one Berurya "
                     "addresses in 10a:3.",
        "confidence": "high",
        "graph_effect": "Add mentions: דעתך → Meir (s1). Implicit addressee of שפיל/בעי → Meir (s2). Implicit subject of "
                        "בעא → Meir (s3). Implicit subjects of דלימותו (s1), דלהדרו (s2) and והדרו (s3) → troublemakers. "
                        "These add no new people or edges. They give c7 and c8 their basis.",
    },
]

ALTERNATIVES = [
    {"id": "A1", "about": "c6, c7 (speaker of 10a:3)",
     "reading": "10a:3 could be the Talmud's own added argument rather than Berurya's words. The Midrash Tehillim "
                "version lacks it, and witnesses vary in one of its clauses.",
     "status": "weak; the second-person imperatives to Meir favour Berurya, and every translation checked gives it to her",
     "evidence": ["F4", "F9", "F10"]},
    {"id": "A2", "about": "c3 (first prayer)",
     "reading": "Meir had begun or intended the prayer, not completed it: the question Ben Yehoyada reports from "
                "Sefer Chasidim. Or Meir prayed only indirectly that they not obtain their desires (Ben Yehoyada).",
     "status": "open; commentary alternatives on the progressive form",
     "evidence": ["F6"]},
    {"id": "A3", "about": "statement 'reading'",
     "reading": "חטאים = 'sins', against the vowels (Cohen, Tosafot HaRosh, Ya'avetz). Or the written form carries both "
                "senses (Maharsha). The saved Wikipedia text also mentions, without a named source, a reading that "
                "keeps the vowels and contrasts habitual 'sinners' (an agent noun) with 'those who sin'. That is "
                "tertiary and unverified.",
     "status": "open lexical question; no person effect",
     "evidence": ["F8"]},
    {"id": "A4", "about": "episode (parallel tradition)",
     "reading": "Midrash Tehillim 104:22: one min, not a group; no repentance; the wife called אתתיה.",
     "status": "a separate passage and a separate record; not a variant of the Bavli text",
     "evidence": ["F9"]},
    {"id": "A5", "about": "Meir's own rationale",
     "reading": "Maharsha: Meir read 'sinners', whose death benefits them. Ben Yehoyada citing Maharsha: Meir held one "
                "should not pray for another's repentance.",
     "status": "commentary reconstructions; the text gives Meir no stated view",
     "evidence": ["F7"]},
]

UNRESOLVED = [
    "The Munich 95 wording of the first prayer clause (main line and interlinear) was not securely read. Other "
    "manuscripts were not checked: Florence, Paris, Oxford and the Genizah fragments. Hachi Garsinan was not accessed.",
    "The Goldschmidt German translation was requested but the API returned no text, so it was not checked.",
    "Goodblatt, 'The Beruriah Traditions' (JJS 26, 1975) was not read; the saved landing page gave no text. Whether a "
    "historical Berurya existed, and whether the Tosefta's unnamed daughter of R. Hanina ben Teradyon is the same "
    "figure, was not assessed.",
    "The 'Sefer Chasidim' question that Ben Yehoyada reports was not found in the Sefer Chasidim sections fetched "
    "(76, 225); its source is known here only through Ben Yehoyada. The 'הרי\"ף' whose questions Ben Yehoyada also "
    "cites was not identified or checked.",
    "Wikipedia points to 'the Midrash on Psalms 118' for this story. The parallel found here is Midrash Tehillim "
    "104:22. Chapter 118 was not checked.",
    "The cross-passage join of Berurya here with Berurya in Avodah Zarah 18a, Pesachim 62b, Eruvin 53b-54a and the "
    "Tosefta is proposed, not decided. Only Avodah Zarah 18a was fetched.",
    "Whether the min/tzeduki difference in 10a:5 comes from censorship was not checked.",
]

CORRECTIONS = [
    {"claim_id": "c6", "change": "Keep subject Berurya. Set basis to speech continuation without a speaker marker "
     "(interpretive), not bare local_coreference. Attach the witness variant: the 'since ... no more' clause is absent "
     "in Daat Ein Yaakov and marginal in Munich 95 (visual).", "why": "F4, F10"},
    {"claim_id": "c7", "change": "Keep subject Berurya and addressee Meir. Basis as for c6. Optional reception note "
     "(Meiri, Perush Kadmon) marked as reception.", "why": "F4, F14"},
    {"claim_id": "c3", "change": "Keep. Add progressive aspect (הוה קא בעי: was praying / was seeking) to the modality, "
     "and an alternative branch 'begun or intended, not completed'. Keep the note that no deaths occur.", "why": "F6"},
    {"claim_id": "c8", "change": "Keep. Add the implicit-subject mention of בעא → Meir as its basis. Do not add an "
     "explicit 'Meir accepts Berurya's view' edge; 'saw that Berurya was correct' is Davidson's plain text.",
     "why": "F5, F15"},
    {"claim_id": "c10", "change": "Keep as time order only. Do not upgrade it to an explicit cause.", "why": "F5"},
    {"claim_id": None, "change": "Add an explicit claim: troublemakers located in Meir's neighbourhood "
     "(בשבבותיה דרבי מאיר), voice narrator, basis explicit.", "why": "F12"},
    {"claim_id": None, "change": "Add mentions: דעתך → Meir; the addressee of שפיל/בעי → Meir; the subject of בעא → "
     "Meir; the subjects of דלימותו/דלהדרו/והדרו → troublemakers.", "why": "F15"},
    {"claim_id": None, "change": "Relabel the entity 'reading': Berurya reads חטאים as 'sins' rather than 'sinners' "
     "(against the vowels, according to Cohen, Tosafot HaRosh and Ya'avetz).", "why": "F8"},
    {"claim_id": None, "change": "Episode note: the story has no named teller. It is not part of Rabbi Yoḥanan's "
     "statement in 10a:1. It is set editorially beside R. Yehuda b. R. Shimon b. Pazi's reading of Psalms 104:35 "
     "(9b:29); treat that as a link between statements, not between persons.", "why": "F2, F3"},
    {"claim_id": None, "change": "Earlier review: its passes stand. It should add these findings: speaker "
     "attribution in 10a:3 by continuity; progressive aspect in c3; the missing neighbourhood relation and mentions; "
     "the Midrash Tehillim parallel with a different antagonist.", "why": "F4, F6, F9, F12, F15"},
]

LESSONS = [
    "Speech that continues across segments without a new speaker marker needs its own basis value, such as "
    "speech_continuation. It is neither explicit nor ordinary coreference.",
    "Aramaic progressive forms (הוה קא + participle) need a modality or aspect value (ongoing / attempted) separate "
    "from completed action. Translations routinely flatten it.",
    "A possessive relation noun (דביתהו, אתתיה) is an explicit kinship term with a possessor resolved from context. "
    "Store both parts.",
    "Editorial juxtaposition of two readings of one verse is a link between statements in the editor's voice. It is "
    "not an interaction between the people.",
    "A parallel in another work is its own passage record. When the antagonist differs (a group of troublemakers "
    "against one min), cross-work story identity is a separate decision.",
    "Community translations can reverse the source (Midrash Tehillim 104:22). Check a translation against the Hebrew "
    "before using it as evidence.",
    "A reason one speaker attributes to another as a question ('What is your thinking? Because...?') is not that "
    "person's asserted view.",
    "Plain-text additions in the Davidson English ('Rabbi Meir saw that Berurya was correct', 'the Gemara relates', "
    "the link to R. Yehuda b. R. Shimon b. Pazi) are editorial commentary, not text.",
]
