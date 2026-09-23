# Findings, alternatives, corrections and lessons for challenge-06. Loaded by build_dossier.py, which checks every quote.

SCOPE = [
    "Bavli Menachot 73b:1-20 and 73a:16 (William Davidson vocalized Aramaic and English); pilot Wikisource segments 73b:12-16.",
    "Mishnah Shekalim 7:4-7 (Torat Emet Hebrew, William Davidson English).",
    "Commentaries on Menachot 73b: Rashi, Ktav Yad Rashi, Tosafot, Rabbeinu Gershom, Steinsaltz on 73b:16.",
    "Tannaitic parallels: Sifra Emor 7:2 (Venice 1545) with Ra'avad and Chafetz Chaim; Tosefta Shekalim 1:7 (Lieberman, codex Vienna) with its variant apparatus and Tosefta Kifshutah.",
    "Bavli parallels: Temurah 2b-3a (the same 'ezrach' baraita, and a baraita naming Rabbi Shimon); Menachot 51b (the same Shekalim mishnah); Nazir 62a and Chullin 13b (opening line only, no names).",
    "Tosafot Yom Tov on Mishnah Shekalim 7:6; Mishneh Torah, Sacrificial Procedure 3:2-5.",
    "Not checked: manuscripts of Bavli Menachot, Shita Mekubetzet, Bach, Dikdukei Soferim or any page image. No claim is made about readings in those witnesses.",
]

FINDINGS = [
    {
        "finding_id": "F01",
        "claim": ("The 'wine' that 73b:16 proposes to delete is the word in the earlier baraita at 73b:8, whose inclusive list "
                  "73b:9 closes as 'the statement of Rabbi Yosei HaGelili'. Rashi and Rabbeinu Gershom both say the corrected "
                  "baraita should read 'birds and frankincense' without wine."),
        "kind": "textual",
        "evidence": [
            ev("men73b", "מִנַּיִן לְרַבּוֹת הָעוֹפוֹת, וְהַיַּיִן, וְהַלְּבוֹנָה, וְהָעֵצִים?", "Menachot 73b:8, William Davidson vocalized",
               "From where [do we learn] to include birds, and wine, and frankincense, and wood?"),
            ev("men73b", "פְּרָט לִנְזִירוּת, דִּבְרֵי רַבִּי יוֹסֵי הַגְּלִילִי", "Menachot 73b:9",
               "excluding naziriteship; [these are] the words of Rabbi Yosei HaGelili."),
            ev("pilot_input", "איבעית אימא ר' יוסי הגלילי סמי מההיא יין", "Menachot 73b:16, Wikisource (pilot s5)",
               "If you like, say [it is] Rabbi Yosei HaGelili: delete 'wine' from that one."),
            ev("rashi", "סמי מכאן נסכי יין - ואמר מנין לרבות העופות והלבונה ולא תיתני היין", "Rashi on Menachot 73b:16:1",
               "Delete from here the wine libations, and say 'from where to include birds and frankincense', and do not teach 'wine'."),
            ev("gershom", "סמי מההיא יין. אלא מנין לרבות העופות והלבונה", "Rabbeinu Gershom on Menachot 73b [12]",
               "Delete wine from that one: rather, 'from where to include birds and frankincense'."),
        ],
        "reasoning": ("מההיא ('from that one') needs an antecedent. The only earlier text with wine in a Yosei HaGelili teaching is "
                      "the list at 73b:8, and 73b:15 cites exactly that ('he says even wine'). Two commentaries name the corrected wording. "
                      "The pilot window (73b:12-16) did not include 73b:8-9, so the first reading anchored Yosei's wine view only to the "
                      "Gemara's paraphrase at 73b:15."),
        "confidence": "high",
        "graph_effect": ("Anchor Yosei's inclusive view (entity 'wine', claim c3) to the baraita at 73b:8-9 as the primary evidence; keep "
                         "73b:15 as the Gemara's paraphrase. The target of 'delete' is a clause in a baraita attributed to Yosei, not a statement by Yosei."),
    },
    {
        "finding_id": "F02",
        "claim": ("'Delete wine' is an emendation proposed by the anonymous Talmud voice, offered as only one of two answers. It is a "
                  "later proposed correction of a tannaitic text, not a reported manuscript reading and not a report that Yosei changed his mind."),
        "kind": "interpretation",
        "evidence": [
            ev("men73b", "אִיבָּעֵית אֵימָא: רַבִּי יוֹסֵי הַגְּלִילִי – סְמִי מֵהַהִיא ״יַיִן״", "Menachot 73b:16, vocalized",
               "If you like, say Rabbi Yosei HaGelili: delete 'wine' from that one."),
            ev("men73b", "<b>omit from that</b> <i>baraita</i> that the <i>tanna</i> allows gentiles to bring <b>wine,</b>",
               "Menachot 73b:16, William Davidson English (bold = translation; plain words 'baraita that the tanna allows gentiles to bring' are the editor's explanation)"),
            ev("steinsaltz", "מדברי ר' יוסי את המלה", "Steinsaltz on Menachot 73b:16",
               "from the words of R. Yosei, the word [wine]"),
            ev("steinsaltz", "ואף לדעתו אין הגוי מביא נסכים לעצמם", "Steinsaltz on Menachot 73b:16",
               "and even in his view a gentile does not bring libations by themselves."),
        ],
        "reasoning": ("סמי is an imperative addressed to whoever recites the baraita. It is framed by איבעית אימא, a formula for "
                      "alternative answers. Nothing in the segment says any witness lacked the word. Steinsaltz reads the result as a statement "
                      "about Yosei's opinion ('even in his view'), which is commentary, not the Talmud's words."),
        "confidence": "high",
        "graph_effect": ("Save the deletion as evidence_type 'proposed_emendation' on the transmission of the 73b:8 baraita, inside branch "
                         "yosi_solution. Claim c8 (Yosei holds_view wine, negative) should become a dependent inference from that emendation, "
                         "not a free-standing view claim."),
    },
    {
        "finding_id": "F03",
        "claim": ("The Yosei view that includes wine (c3) is shared by the objection and the Akiva answer, but the Yosei answer withdraws it. "
                  "The first reading saved c3 with an empty branch list, which by the pilot's rules means 'true in every reading'."),
        "kind": "interpretation",
        "evidence": [
            ev("pilot_input", "אי רבי יוסי הגלילי הא אמר אפילו יין נמי", "Menachot 73b:15, Wikisource (pilot s4)",
               "If Rabbi Yosei HaGelili, doesn't he say even wine too?"),
            ev("pilot_output", "Yosi’s earlier view includes wine", "pilot output entity 'wine' (used by c3)"),
            ev("pilot_output", "This follows the proposed deletion; it is not a report that Yosi personally withdrew an opinion.", "pilot output claim c8 note"),
        ],
        "reasoning": ("Under yosi_solution the baraita text that grounds c3 is corrected, so c3 and c8 cannot both hold with no branch. "
                      "c3 holds in the objection (73b:15) and is untouched in akiva_solution, where the anonymous baraita is aligned with Akiva instead."),
        "confidence": "high",
        "graph_effect": "Condition c3 on 'not yosi_solution' (or mark it as the premise of the objection), and keep c8 only inside yosi_solution.",
    },
    {
        "finding_id": "F04",
        "claim": ("The Akiva answer's key phrase has recorded wording variants: 'חבירתה' (its companions) in the Wikisource text and in Rashi's "
                  "comment, a bracketed replacement 'אבזרהא' (its accessories) in the vocalized text on Sefaria, and 'אביזרא' / 'אביזריהו' in the "
                  "lemmas of Ktav Yad Rashi and Rabbeinu Gershom. All the commentaries checked explain it as the libations that come with the burnt offering."),
        "kind": "textual",
        "evidence": [
            ev("pilot_input", "ואיבעית אימא רבי עקיבא עולה וכל חבירתה:", "Menachot 73b:16, Wikisource (pilot s5)",
               "and if you like, say Rabbi Akiva: a burnt offering and all its companions."),
            ev("men73b", "עוֹלָה וְכׇל (חַבְירָתַהּ) [אַבְזָרַהָא]", "Menachot 73b:16, William Davidson vocalized (parentheses and brackets as printed)"),
            ev("rashi", "עולה וכל חבירתה דהיינו נסכים אבל נסכים לחודייהו לא", "Rashi on Menachot 73b:13:3",
               "a burnt offering and all its companions, that is, libations; but libations by themselves, no."),
            ev("ktav_yad_rashi", "וכל אביזרא - כל חברותיה דהיינו נמי נסכים הבאים עמה", "Ktav Yad Rashi on Menachot 73b:13:2",
               "and all accessories: all its companions, which also means libations that come with it."),
            ev("gershom", "וכל אביזריהו. כל מה שצריך לה נודרין דהיינו נסכין", "Rabbeinu Gershom on Menachot 73b [8]",
               "and all its accessories: whatever it needs they [gentiles] may vow, that is, libations."),
        ],
        "reasoning": ("The saved vocalized text marks one word as replaced, but the saved API response does not name who made the replacement. "
                      "The meaning agreed by these commentaries is the same for both words. No person is affected."),
        "confidence": "high",
        "graph_effect": ("Label entity 'associated' as 'libations that accompany a burnt offering (commentary reading); libations by themselves excluded'. "
                         "Save the wording difference as a source variant, not as a separate claim."),
    },
    {
        "finding_id": "F05",
        "claim": ("Tosafot considers and rejects a third way out: reading Yosei's 'wine' as wine that comes with an offering, which would make the "
                  "baraita fit Yosei without deleting anything. Tosafot also reports a reading difference in the parallel at Temurah 3a."),
        "kind": "interpretation",
        "evidence": [
            ev("tosafot", "ולא מצי למימר דיין נמי דאמר רבי יוסי הגלילי בבא עם הזבח", "Tosafot on Menachot 73b:15:1",
               "And one cannot say that the wine Rabbi Yosei HaGelili also mentioned is [wine] that comes with the offering."),
            ev("tosafot", "ועוד מדחשיב ליה בהדי עופות ומנחות דבאין בפני עצמן", "Tosafot on Menachot 73b:15:1",
               "and further, since he counts it together with birds and meal offerings, which come by themselves."),
            ev("tosafot", "מיהו ברוב ספרים לא גרסי' עליהם אבל בספר רבינו גרשם כתוב עליהם", "Tosafot on Menachot 73b:15:1",
               "However, most books do not read 'on them', but in the book of Rabbeinu Gershom 'on them' is written."),
        ],
        "reasoning": ("This is a commentator's argument, not the Talmud's. It supports keeping only two branches for 73b:16 and records "
                      "a considered and rejected alternative. Tosafot's 'birds and meal offerings' does not match the Bavli list at 73b:8, "
                      "which has no meal offerings; the Sifra list does (F07). That suggests Tosafot is not quoting the Bavli list exactly, but this was not checked further."),
        "confidence": "medium",
        "graph_effect": "Record 'Yosei's wine = wine with an offering' as an alternative rejected by Tosafot. Do not add it as a third branch of the Talmud's answer.",
    },
    {
        "finding_id": "F06",
        "claim": ("Other witnesses to the tannaitic dispute swap the two names. In the saved Sifra (Venice 1545) the inclusive list is Rabbi Akiva's "
                  "and Rabbi Yosei HaGelili answers 'only a burnt offering'. Lieberman reports the same swap in the Erfurt and London manuscripts "
                  "of the Tosefta. The Bavli's order matches the Tosefta's Vienna manuscript and first printing. Ra'avad's own Sifra text follows the Menachot order, and he notes that other Sifra versions have the swap."),
        "kind": "textual",
        "evidence": [
            ev("sifra", "פרט לנזירות, דברי ר' עקיבא [גירס' הגמרא ריה\"ג]. אמר לו ר' יוסי הגלילי [גירס' הגמרא ר\"ע] אפילו אתה מרבה כל היום אין כאן אלא עולה בלבד.",
               "Sifra, Emor, Section 7:2, Venice 1545 text as saved (bracketed notes as printed there)",
               "excluding naziriteship, the words of R. Akiva [Gemara's reading: R. Yosei HaGelili]. R. Yosei HaGelili [Gemara's reading: R. Akiva] said to him: even if you include all day, there is only a burnt offering here."),
            ev("sifra", "These are the words of R. Akiva. R. Yossi Haglili said to him", "Sifra Emor 7:2, Shraga Silverstein English (follows the same Sifra text, so it is not independent of it)"),
            ev("kifshutah", "וכ\"ה בד. אבל בכי\"ע ובכי\"ל: דברי ר' עקיבא. א' לו ר' יוסי הגלילי וכו'.", "Tosefta Kifshutah on Shekalim 1:7 [3]",
               "And so in the printed edition. But in the Erfurt and London manuscripts: the words of R. Akiva; R. Yosei HaGelili said to him, etc."),
            ev("kifshutah", "אבל בבבלי מנחות ע\"ג ב' המסורת במחלוקת זו היא כגירסת ד וכי\"ו.", "Tosefta Kifshutah on Shekalim 1:7 [3]",
               "But in Bavli Menachot 73b the tradition in this dispute is like the reading of the printed edition and the Vienna manuscript."),
            ev("tosefta_var", "<b>יוסה הגלילי </b>| <big>ד</big> יוסי הגלילי <big>א</big> <big>ל</big> עקיבא.", "Variants on Tosefta Shekalim 1:7:7 (apparatus sigla as printed)"),
            ev("raavad_sifra", "ואיכא נסחי דכתיב בהו דברי ר' עקיבא אמר לו ר' יוסי הגלילי מיהו האי נסחא דכתיבנא איתא במנחות", "Ra'avad on Sifra, Emor 7:2",
               "And there are versions in which is written 'the words of R. Akiva; R. Yosei HaGelili said to him'; but the version I wrote is found in Menachot."),
            ev("chafetz_sifra", "ובמנחות (מנחות עג, ב) הגירסא להיפך", "Chafetz Chaim on Sifra, Emor 7:2 [10]",
               "and in Menachot 73b the reading is the reverse."),
        ],
        "reasoning": ("These are source variants in parallel tannaitic works, recorded by editors and commentators; they are not proposed emendations. "
                      "The Silverstein English and the Venice Hebrew are one witness, not two. The saved text does not show whether the bracketed "
                      "'Gemara's reading' notes are in the 1545 printing or were added by the online editor. I read the apparatus siglum א as the "
                      "manuscript Kifshutah calls כי\"ע (Erfurt), because both report the same reading; that match is my inference."),
        "confidence": "high",
        "graph_effect": ("Qualify c3 and c4 as 'per the Bavli's baraita (73b:8-9)'. Save a textual_alternative that swaps the positions of the two "
                         "sages, with its witnesses (Sifra Venice; Tosefta Erfurt and London as reported by Lieberman). The whole of 73b:12-16 works "
                         "only with the Bavli's assignment. The swap does not prove which sage held which view historically."),
    },
    {
        "finding_id": "F07",
        "claim": ("The parallels also differ in content. The Tosefta (Vienna) list of offerings accepted from gentiles has no wine; it has meal "
                  "offerings and salt, and its Akiva allows 'a burnt offering and peace offerings only'. The Sifra list includes meal offerings and wine. "
                  "The Bavli list at 73b:8 has wine but no meal offerings, and its Akiva allows 'a burnt offering only'."),
        "kind": "textual",
        "evidence": [
            ev("tosefta", "עופות, ומנחות, ", "Tosefta Shekalim 1:7, Vienna (short piece; variant markers sit between the words)", "birds, and meal offerings,"),
            ev("tosefta", "עצים, ולבונה, ומלח, דברי ", "Tosefta Shekalim 1:7, Vienna (short piece)", "wood, and frankincense, and salt; the words of"),
            ev("tosefta", "עולה ושלמים בלבד.", "Tosefta Shekalim 1:7, Vienna (short piece)", "a burnt offering and peace offerings only."),
            ev("kifshutah", "בתו\"כ אמור ובבבלי מנחות הנ\"ל: אלא עולה בלבד.", "Tosefta Kifshutah on Shekalim 1:7 [4]",
               "In the Sifra (Emor) and in Bavli Menachot cited above: 'only a burnt offering'."),
            ev("sifra", "מנין לרבות את העופות והמנחות והיין והלבונה והעצים?", "Sifra Emor 7:2, Venice 1545",
               "From where to include birds, meal offerings, wine, frankincense and wood?"),
        ],
        "reasoning": ("The saved Tosefta apparatus lists no witness that adds wine; I checked only the entries in that saved apparatus. "
                      "So the item that the Talmud's Yosei answer deletes is missing from one parallel witness and present in another. "
                      "This is parallel-text evidence. It does not show that the Talmud's editors knew such a text, and it does not turn the proposed emendation into a manuscript reading."),
        "confidence": "medium",
        "graph_effect": "Save as parallel-witness evidence attached to the proposed emendation in yosi_solution, as a separate evidence type from the emendation.",
    },
    {
        "finding_id": "F08",
        "claim": ("In the Tosefta and the Sifra the dispute is framed as one sage speaking to the other ('said to him'). The Bavli baraita at 73b:9 "
                  "instead lists the two views side by side. Who addresses whom depends on the witness, and the London Tosefta manuscript seems to lack 'said to him'."),
        "kind": "textual",
        "evidence": [
            ev("kifshutah", "דברי ר' יוסה הגלילי. אמ' לו ר' עקיבא אפי' אתה יושב ודורש כל היום וכו'.", "Tosefta Kifshutah on Shekalim 1:7 [3], lemma of the Vienna text",
               "the words of R. Yosei HaGelili. R. Akiva said to him: even if you sit and expound all day, etc."),
            ev("men73b", "רַבִּי עֲקִיבָא אוֹמֵר: ״אֲשֶׁר יַקְרִיבוּ לַה׳ לְעֹלָה״ – אֵין לִי אֶלָּא עוֹלָה בִּלְבָד.", "Menachot 73b:9",
               "Rabbi Akiva says: 'which they will offer to the Lord as a burnt offering' - I have only a burnt offering alone."),
            ev("tosefta_var", "<b>לו </b>| <big>ל</big> ח'.", "Variants on Tosefta Shekalim 1:7:9", "'to him': London lacks it."),
            ev("tosefta_var", "<b>עקיבא </b>| <big>א</big> יוסי הגלילי <big>ל</big> יוסי הגלילי [או'].", "Variants on Tosefta Shekalim 1:7:10",
               "'Akiva': Erfurt 'Yosei HaGelili'; London 'Yosei HaGelili [says]'."),
        ],
        "reasoning": ("I read ח' as the usual abbreviation for 'missing'. 'Said to him' is a literary framing of a dispute. It does not show that the "
                      "two men met or spoke, and its direction changes with the witness. None of this is in the focal segment."),
        "confidence": "medium",
        "graph_effect": ("If the parallels are added, save an addressed-speech turn between Yosei HaGelili and Akiva with direction branched by witness. "
                         "Do not add any addressed-speech or meeting relation to Menachot 73b:16."),
    },
    {
        "finding_id": "F09",
        "claim": ("In the Mishnah, 'and this is one of them' points back to the rule about a found animal's libations (Shekalim 7:5). The gentile's "
                  "burnt offering is the next of the seven ordinances, not the rule 'this' refers to. Menachot quotes the mishnah without 7:5, which hides this."),
        "kind": "textual",
        "evidence": [
            ev("shek7", "הִתְקִינוּ בֵּית דִּין שֶׁיְּהוּ נְסָכֶיהָ בָּאִין מִשֶּׁל צִבּוּר", "Mishnah Shekalim 7:5, Torat Emet",
               "the court instituted that its libations come from public funds."),
            ev("ktav_yad_rashi", "וזה אחד מהו - לעיל מיניה קא מיירי שהתקינו בהמה הנמצא בעזרה יהיה נסכיה קריבין משל צבור", "Ktav Yad Rashi on Menachot 73b:12:1",
               "'and this is one of them' refers to what is just before it: that they instituted for an animal found in the courtyard that its libations be offered from public funds."),
            ev("tyt", "וזה שאמרנו אחד מהן והדר מפרש לאינך שש נכרי כו'", "Tosafot Yom Tov on Mishnah Shekalim 7:6 [1] (citing Rashi on Menachot 51b)",
               "this that we said is one of them, and then it explains the other six: a gentile, etc."),
            ev("pilot_output", "A gentile’s overseas burnt offering has his supplied libations or public libations if none were sent", "pilot output entity 'decree' (c1 content role)"),
        ],
        "reasoning": "The Mishnah text and two commentaries agree. The William Davidson English says the same in plain (editorial) words.",
        "confidence": "high",
        "graph_effect": ("Keep c1 (court instituted seven ordinances, voice Rabbi Shimon). Give it a separate 'found-animal libations' item as the "
                         "referent of 'this', and make the gentile rule 'another of the seven'. No person changes."),
    },
    {
        "finding_id": "F10",
        "claim": ("The questions 'In accordance with whom…?' and 'Let us say Rabbi Yosei HaGelili' ask whose view a teaching agrees with. The mishnah is "
                  "already said in Rabbi Shimon's name, reporting a court ordinance. Saving it as 'decree attributes_to Yosei/Akiva' (c5, c6, c10) "
                  "confuses agreement with authorship. For the anonymous baraita ('who is the tanna'), naming a tanna is closer to attribution, "
                  "but the two answers leave it open."),
        "kind": "interpretation",
        "evidence": [
            ev("pilot_input", "כמאן אזלא הא דתנן אמר ר\"ש", "Menachot 73b:12, Wikisource (pilot s1)",
               "In accordance with whom is that which we learned: R. Sh[imon] said…"),
            ev("pilot_input", "מאן תנא להא דתנו רבנן", "Menachot 73b:14, Wikisource (pilot s3)",
               "Who is the tanna of this that the Rabbis taught?"),
            ev("rashi", "לימא רבי יוסי היא - דמרבי ביין דהיינו נסכים", "Rashi on Menachot 73b:13:1",
               "Let us say it is Rabbi Yosei: who includes wine, that is, libations."),
            ev("tyt", "כרבי עקיבא דס\"ל דאין מקבלין מהן אלא עולה", "Tosafot Yom Tov on Mishnah Shekalim 7:6 [2]",
               "[The mishnah is] according to Rabbi Akiva, who holds that only a burnt offering is accepted from them."),
        ],
        "reasoning": ("A commentator (Tosafot Yom Tov) aligns the mishnah with Akiva, using the Menachot answer. That alignment is a view on "
                      "agreement, not a claim that Akiva said the mishnah. Rabbi Shimon remains its speaker."),
        "confidence": "high",
        "graph_effect": ("Use a predicate such as accords_with_view_of (teaching -> sage) for c5, c6 and c10, separate from attributes_to. "
                         "For c7 and c9 (anonymous baraita), keep the two branches and mark each as a proposed identification of the anonymous tanna."),
    },
    {
        "finding_id": "F11",
        "claim": ("Another Bavli passage attributes the same rule as the anonymous 'ezrach' baraita (a gentile does not bring libations, but his "
                  "offering needs them) to a named 'Rabbi Shimon', and gives the same 'ezrach' baraita as its source. Menachot 73b:12-16 does not "
                  "consider Rabbi Shimon as the baraita's tanna."),
        "kind": "textual",
        "evidence": [
            ev("temurah_2b", "וְאֵין מְבִיאִין עֲלֵיהֶם נְסָכִים, אֲבָל קׇרְבָּנוֹ טָעוּן נְסָכִים, דִּבְרֵי רַבִּי שִׁמְעוֹן.", "Temurah 2b:9 (baraita cited by Rava), William Davidson vocalized",
               "and one does not bring libations for them, but his offering requires libations: the words of Rabbi Shimon."),
            ev("temurah_3a", "מְנָא הָנֵי מִילֵּי? דְּתָנוּ רַבָּנַן: ״אֶזְרָח״ — אֶזְרָח מֵבִיא נְסָכִים וְאֵין הַגּוֹי מֵבִיא נְסָכִים.", "Temurah 3a:10",
               "From where are these matters? As the Rabbis taught: 'home-born' - a home-born person brings libations, and a gentile does not bring libations."),
            ev("temurah_3a", "וְאֵין מֵבִיא (עֲלֵיהֶן) נְסָכִים", "Temurah 3a:10 (word in parentheses as printed)", "and he does not bring (for them) libations"),
        ],
        "reasoning": ("This is the passage Tosafot cites in F05. Temurah uses the baraita as the source for Rabbi Shimon's rule; it does not say that "
                      "Rabbi Shimon taught it. The 'Rabbi Shimon' of Temurah 2b, the Rabbi Shimon of the Shekalim mishnah, and the Rabbi Shimon of "
                      "Menachot 73b:17 share a name. That does not show they are one person."),
        "confidence": "high",
        "graph_effect": ("Outside the focal segment. If the rule is linked across passages, add a separate, cross-passage 'same ruling also attributed "
                         "to R. Shimon (Temurah 2b)' observation. Keep a local R. Shimon for each passage; historical identity stays open."),
    },
    {
        "finding_id": "F12",
        "claim": ("The wider sugya names more people before the pilot window: Rav Huna (73a:16), Rav Chama bar Gurya, Rava, Rav Sheizevi and Rabbi "
                  "Yochanan (73b:3-5). Rabbi Yochanan is the named amora who first sets 'Rabbi Yosei HaGelili' against 'Rabbi Akiva' on gentile "
                  "offerings. Rav Chama bar Gurya's name contains a patronymic."),
        "kind": "textual",
        "evidence": [
            ev("men73a", "אָמַר רַב הוּנָא:", "Menachot 73a:16", "Rav Huna said:"),
            ev("men73b", "מֵתִיב רַב חָמָא בַּר גּוּרְיָא", "Menachot 73b:3", "Rav Chama bar Gurya raises an objection"),
            ev("men73b", "אָמַר רָבָא: הָכִי קָא אָמַר", "Menachot 73b:4", "Rava said: this is what it says"),
            ev("men73b", "מֵתִיב רַב שֵׁיזְבִי", "Menachot 73b:5", "Rav Sheizevi raises an objection"),
            ev("men73b", "אָמַר רַבִּי יוֹחָנָן: לָא קַשְׁיָא, הָא רַבִּי יוֹסֵי הַגְּלִילִי, הָא רַבִּי עֲקִיבָא.", "Menachot 73b:5",
               "Rabbi Yochanan said: it is not difficult; this is Rabbi Yosei HaGelili, that is Rabbi Akiva."),
        ],
        "reasoning": ("73b:12-16 is spoken by the anonymous Talmud voice. It continues the Yosei and Akiva framework set by Rabbi Yochanan's answer, "
                      "but it does not quote him, so no speech turn in 73b:16 should be credited to him. 'bar Gurya' supports a father named Gurya "
                      "under the project's patronymic rule. Whether 'bar' is literal kinship here is not tested by any source I checked."),
        "confidence": "high",
        "graph_effect": ("Not part of the focal segment's graph. If the job is widened to 73a:16-73b:16, add these local persons, the speech and "
                         "objection turns, and a local parent placeholder 'Gurya' (father_of Rav Chama, basis: patronymic)."),
    },
    {
        "finding_id": "F13",
        "claim": ("The first reading's person list for 73b:12-16 is complete for named people: Rabbi Shimon (the abbreviation ר\"ש is spelled out as Rabbi Shimon in the Mishnah text), Rabbi Yosei HaGelili and Rabbi Akiva. "
                  "No family relation appears in these segments. The 'citizen' entity is a word of the verse, not a person."),
        "kind": "interpretation",
        "evidence": [
            ev("pilot_input", "אזרח אזרח מביא נסכים ואין העובד כוכבים מביא נסכים", "Menachot 73b:14, Wikisource (pilot s3)",
               "'Home-born': a home-born person brings libations, and a gentile does not bring libations."),
            ev("pilot_output", "Generic citizen in the interpretation", "pilot output entity 'citizen'"),
            ev("shek7", "אָמַר רַבִּי שִׁמְעוֹן, שִׁבְעָה דְּבָרִים הִתְקִינוּ בֵּית דִּין", "Mishnah Shekalim 7:6, Torat Emet",
               "Rabbi Shimon said: seven things the court instituted."),
        ],
        "reasoning": ("'אזרח' is first a quoted word of Numbers 15:13 and then a legal category (a native Israelite). 'תנו רבנן' is the usual "
                      "formula for citing a baraita. The segment itself asks who its tanna is, so the 'Rabbis' should not become a group that holds a view "
                      "competing with Yosei and Akiva."),
        "confidence": "medium",
        "graph_effect": ("Change 'citizen' from kind person to a legal-category or description entity. Save 'teachers' (רבנן) as a citation formula "
                         "linked to the anonymous tanna, not as a group with its own view."),
    },
    {
        "finding_id": "F14",
        "claim": ("The earlier review's five passes hold on their own terms. It did not check the deleted text's source (73b:8-9), the name swap in "
                  "the parallels, c3's missing branch condition, the confusion of agreement with authorship, or the referent of 'this is one of them'."),
        "kind": "interpretation",
        "evidence": [
            ev("previous_review", "The Yosi solution requires the anchored deletion of wine and does not call it a personal retraction.", "previous-review.json, checks preserve[1]"),
            ev("previous_review", "No meeting or unconditional agreement between the named people is asserted.", "previous-review.json, checks avoid[1]"),
        ],
        "reasoning": "The review only checked against the supplied segments and its checklist. The gaps above come from wider context and parallel texts.",
        "confidence": "high",
        "graph_effect": "No reversal of the review's passes. Add the corrections listed below.",
    },
]

ALTERNATIVES = [
    {"id": "A1", "reading": "Anonymous baraita (73b:14) = Rabbi Yosei HaGelili, with 'wine' deleted from his baraita (73b:8).",
     "who_says": "The Talmud 73b:16 (first answer); explained by Rashi, Rabbeinu Gershom and Steinsaltz.", "status": "Offered by the Talmud as one of two answers"},
    {"id": "A2", "reading": "Anonymous baraita = Rabbi Akiva, whose 'only a burnt offering' includes its accompanying libations.",
     "who_says": "The Talmud 73b:16 (second answer), repeating 73b:13; Rashi 73b:13:3; Tosafot Yom Tov uses this line for the Shekalim mishnah.", "status": "Offered by the Talmud as one of two answers"},
    {"id": "A3", "reading": "Yosei's 'wine' means wine that comes with an offering, so the baraita fits Yosei with no deletion.",
     "who_says": "Considered and rejected by Tosafot on 73b:15.", "status": "Rejected by a commentary; keep as a rejected alternative only"},
    {"id": "A4", "reading": "The two tannaitic positions belong the other way round (inclusive list = Akiva; 'only a burnt offering' = Yosei HaGelili).",
     "who_says": "Sifra Emor 7:2 (Venice 1545 as saved); Tosefta Erfurt and London manuscripts as reported by Lieberman; Ra'avad reports such Sifra versions, though his own text follows Menachot.",
     "status": "Source variant in parallel works; the Bavli's answers in 73b:12-16 assume the other order"},
    {"id": "A5", "reading": "The 'no separate libations' rule is Rabbi Shimon's.",
     "who_says": "Baraita at Temurah 2b:9, with the 'ezrach' baraita given as its source at Temurah 3a:10.", "status": "Parallel Bavli attribution; not considered in Menachot 73b"},
]

UNRESOLVED = [
    "Whether any manuscript of Bavli Menachot lacks 'wine' at 73b:8, or reads the names differently at 73b:9. Bavli manuscripts, Dikdukei Soferim and page images were not checked.",
    "Who made the (חבירתה) [אבזרהא] replacement in the printed text. The saved sources do not say, and Bach and Shita Mekubetzet were not checked.",
    "Whether the '[גירס' הגמרא ...]' notes in the saved Sifra text belong to the 1545 printing or to the online editor.",
    "Which Rabbi Shimon speaks in the Shekalim mishnah. The name alone does not settle it, and he is not identified with the Rabbi Shimon of Menachot 73b:17 or Temurah 2b.",
    "Whether the two answers in 73b:16 are meant as equally good or as ranked. The text gives no preference, and no commentary checked chooses between them for the baraita.",
]

CORRECTIONS = [
    {"claim_id": "c3", "change": "Anchor to 73b:8-9 (the baraita), with 73b:15 as the Gemara's paraphrase. Add a branch condition: not asserted in yosi_solution. Add the qualifier 'per the Bavli's baraita' (see A4).", "why": "F01, F03, F06"},
    {"claim_id": "c4", "change": "Anchor to 73b:9 'רבי עקיבא אומר … אין לי אלא עולה בלבד'. Note that in akiva_solution this is reinterpreted to include accompanying libations. Add the qualifier 'per the Bavli's baraita' (see A4).", "why": "F06, F04"},
    {"claim_id": "c8", "change": "Save as a transmission claim: the anonymous Talmud proposes deleting 'wine' from the baraita attributed to Yosei (evidence_type proposed_emendation, branch yosi_solution). Keep any 'Yosei does not include wine' view claim only as a dependent inference.", "why": "F02"},
    {"claim_id": "c5, c6, c10", "change": "Change predicate from attributes_to to accords_with_view_of (the Rabbi Shimon mishnah agrees with a sage's view). Rabbi Shimon remains the speaker.", "why": "F10"},
    {"claim_id": "c7, c9", "change": "Keep as two branches, and mark each as a proposed identification of the anonymous tanna, not settled authorship.", "why": "F10"},
    {"claim_id": "c1", "change": "Separate the referent of 'this is one of them' (the found-animal libations, Shekalim 7:5) from the gentile rule, which is another of the seven.", "why": "F09"},
    {"claim_id": "entity citizen", "change": "Change kind from person to a legal category or verse-word description.", "why": "F13"},
    {"claim_id": "entity associated", "change": "Relabel as 'libations that accompany a burnt offering (commentary reading)'. Save חבירתה / אבזרהא as a wording variant.", "why": "F04"},
    {"claim_id": "new (reading_groups)", "change": "Add a textual_alternative group for the swapped attribution in the Sifra and Tosefta (A4), and parallel-witness evidence (the Tosefta list without wine) attached to yosi_solution.", "why": "F06, F07"},
]

LESSONS = [
    "A proposed deletion ('סמי') changes the transmitted text of a teaching. Model it as a transmission event on the source, not as a change in the sage's view.",
    "A claim whose premise is withdrawn in one branch cannot keep an empty branch list. Premises of an objection need their own branch scope.",
    "'Whose view does this follow?' (כמאן, לימא) is agreement between a teaching and a sage. 'Who is the tanna?' (מאן תנא) is closer to attribution. Neither is authorship when the teaching already has a named speaker.",
    "Put parallel-work variants (Sifra, Tosefta manuscripts), a Talmud-internal proposed emendation, and a commentator's rejected reading into three separate evidence types.",
    "An addressed-speech frame ('said to him') can exist in one witness and not another. Its direction can flip too. It is literary evidence of a debate, not of a meeting.",
    "A translation made from the same text (Silverstein on the Venice Sifra) is not independent support for that text's reading.",
]
