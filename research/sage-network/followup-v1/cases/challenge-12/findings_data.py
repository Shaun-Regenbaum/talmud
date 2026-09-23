# Findings for challenge-12. Loaded by build_dossier.py (ev, vis available).

QUESTION = ("Check the first reading of Sanhedrin 97a:6 (with 97a:7) against wider context, published "
            "translations and relevant commentaries. Focus on the unresolved questions in the saved reading "
            "and independent review. Identify which graph claims are explicit, which depend on interpretation, "
            "and which alternatives must stay open. Recover any missed person, family relation, speech turn "
            "or source attribution.")

SCOPE = ("Checked: Wikisource (Vilna) and Koren vocalized text of 97a:4-9; William Davidson English, Soncino "
         "English, Glick Ein Yaakov (Hebrew and English); Rashi, Chokhmat Shlomo, Maharsha, Ben Yehoyada, "
         "Petach Einayim, Steinsaltz; later quotations in Maharal, Reshit Chokhmah and Sha'arei Kedusha; the "
         "Bava Metzia 49a parallel with Be'er Sheva, Gilyon HaShas and Seder HaDorot; Jastrow; and page images "
         "of the Vilna print, the Bomberg 1523 print and Munich 95. Not checked: other manuscripts (for example "
         "Florence, Karlsruhe, Yad HaRav Herzog), Dikdukei Soferim, and other Ein Yaakov printings.")

FINDINGS = [
    {
        "finding_id": "f01",
        "claim": ("Rava is the outer speaker. In the Vilna-based text a sage speaks to Rava in person ('said to me'), "
                  "and the story is the sage's own first-person report to Rava. Rashi says so directly: 'and he told "
                  "me this: one time I happened to...'."),
        "kind": "textual",
        "evidence": [
            ev("wikisource_he", "אמר רבא מריש הוה אמינא ליכא קושטא בעלמא אמר לי ההוא מרבנן"),
            ev("wikisource_he", "זימנא חדא איקלעי לההוא אתרא וקושטא שמיה"),
            ev("rashi", "לשקר ואישתעי לי הכי זימנא חדא אקלעי לההוא אתרא וקושטא שמיה"),
            ev("steinsaltz_he", "וסיפר לי: <b>זימנא חדא איקלעי לההוא אתרא ו\"קושטא\" שמיה</b>"),
        ],
        "reasoning": ("אמר לי plus the first-person verbs איקלעי, נסיבי, הוו לי make the sage the narrator of the story "
                      "and Rava its hearer. Rashi (researcher translation: 'and he told me this') and Steinsaltz "
                      "('and he told me') confirm it. Only Rava's report records this meeting."),
        "confidence": "high",
        "graph_effect": ("Keep c2/c14: Rava heard this from the sage whose name depends on the branch. This is a speech "
                         "turn Rava reports. Treat story claims in the sage's first person as spoken by that sage and "
                         "passed on by Rava, not as statements by an unknown narrator."),
    },
    {
        "finding_id": "f02",
        "claim": ("Witnesses differ on whether the verb is 'said to me' or 'said to him'. Chokhmat Shlomo saw 'אמר ליה' "
                  "and corrected it to 'אמר לי'. The Bomberg 1523 page looks to me like it reads 'אמר ליה'. Maharal "
                  "quotes the line both ways and builds his allegory on 'אמר ליה'. Munich 95 appears to use the "
                  "abbreviation א\"ל, which can be expanded either way."),
        "kind": "uncertainty",
        "evidence": [
            ev("chokhmat_shlomo", "אמר ליה ההוא כו' צ\"ל אמר לי"),
            ev("maharal", "אמר רבא מריש הו\"א ליכא קושטא בעלמא אמר לי ההוא מרבנן"),
            ev("maharal", "ומה שאמר דאמר ליה ההוא מדרבנן דבר זה נקרא שאמר ליה"),
            vis("bomberg_image", "ליכא קושטא בעלמא אמר ליה ההוא מרבנן ורב",
                "Researcher's visual reading of the Bomberg page image; not machine-checked."),
            vis("munich95_image", "מריש הו\"א ליכא קושטא בעלמ' א\"ל ההו' מרבנן ורב",
                "Researcher's visual reading of a cursive hand; the abbreviation and the letters are uncertain."),
        ],
        "reasoning": ("Chokhmat Shlomo's note (researcher translation: 'said to him ... should read said to me') "
                      "shows that an earlier printed text read 'said to him'. This is a correction, not a manuscript. "
                      "An abbreviated א\"ל would explain how both readings arose. That is my guess and is not attested. "
                      "Under 'said to him' the hearer is most naturally still Rava, but the words no longer mark the "
                      "report as first person."),
        "confidence": "medium",
        "graph_effect": ("Keep c2/c14 as explicit in the Vilna/Wikisource text. Add a textual-variant note that "
                         "'אמר לי' against 'אמר ליה' changes how explicitly the speech is marked as addressed to Rava. "
                         "Do not raise the confidence of a Rava–sage meeting beyond this one reported telling."),
    },
    {
        "finding_id": "f03",
        "claim": ("The sentence about refusing all the world's wealth is Rava's description of the sage. It is a "
                  "hypothetical, not an event, and not the sage speaking. Translations put 'He said to me' / 'and he "
                  "told me' after it."),
        "kind": "textual",
        "evidence": [
            ev("davidson_en", "who was so honest <b>that if they were</b> to <b>give him the entire world, he would not deviate</b> from the truth <b>in his statement. He said to me:"),
            ev("soncino_en", "who, even if he were given all the treasures of the world, would not lie, told me that he once came to a place called Kushta"),
            ev("petach_einayim", "אם אמר למכור דבר זה בסך מה ואח\"ך בא אחר ונותן לו יותר"),
        ],
        "reasoning": ("The third-person ליה / בדבוריה inside Rava's sentence marks it as Rava's words. דאי הוו יהבי is "
                      "counterfactual ('if they were to give'). Commentators such as Iyun Yaakov (quoted by Petach "
                      "Einayim) read it as a trait: he kept his word in sales even when offered more. The imagined "
                      "givers are not real participants."),
        "confidence": "high",
        "graph_effect": ("c3/c15 should not be 'scenes/participates_in' with an 'offerers' group. Recode them as a "
                         "character claim in Rava's voice, marked counterfactual. Drop 'offerers' as a participant group, "
                         "or mark it hypothetical and non-referring."),
    },
    {
        "finding_id": "f04",
        "claim": ("Witnesses disagree on the person of 97a:7. Vilna/Wikisource has third person (סבר, אמר לה). A Vilna "
                  "margin note records 'סברי . אמרי' (I thought, I said). The Koren vocalized text prints סְבַרִי / "
                  "אֲמַרִי לַהּ. Bomberg (as I read it) mixes סבר with אמרי לה and אמרי להו. Munich 95 appears to keep "
                  "first person throughout. Ein Yaakov (Glick Hebrew) mixes the persons, and Maharal quotes it all in "
                  "third person."),
        "kind": "textual",
        "evidence": [
            ev("wikisource_he", "סבר לאו אורח ארעא אמר לה ליתא הכא שכיבו ליה תרתין בנין אתו אינשי דאתרא לקמיה"),
            ev("koren_he", "סְבַרִי: לָאו אוֹרַח אַרְעָא. אֲמַרִי לַהּ: לֵיתַהּ הָכָא. שְׁכִיבוּ לֵיהּ תְּרֵין בְּנֵיה"),
            vis("vilna_image", "י\"ג סברי . אמרי",
                "Researcher's visual reading of the Vilna outer-margin note beside the asterisked words *סבר and *אמר לה."),
            vis("bomberg_image", "אדשא סבר לאו אורח ארעא אמרי לה ליתה הכא שכיבו ליה תרתי' בניה",
                "Researcher's visual reading of the Bomberg page image."),
            vis("bomberg_image", "מאי האי אמרי להו הכי הוה מעשה",
                "Researcher's visual reading of the Bomberg page image."),
            vis("munich95_image", "לאו אורח ארעא אמרי לה ליתה הכא",
                "Researcher's visual reading of Munich 95; the words before לאו look like a first-person 'I thought' (אמינא), but that is uncertain."),
            vis("munich95_image", "אמינא להו הכי הוה מעשה אמרו לי במטות' מינך פוק מאתרין",
                "Researcher's visual reading of Munich 95; low legibility."),
            ev("glick_he", "סבר לאו אורח ארעא אמר לה לימא הכא שכיבי ליה תרתין בנין"),
            ev("maharal", "נסיב אתתא מנהון והוי ליה תרתין בנין יומא חד יתבה דביתהו"),
        ],
        "reasoning": ("Every witness keeps דביתהו ('his wife') and several keep ליה / לקמיה, so no witness is purely "
                      "first person in the forms I could check. Even so, the first-person forms in 97a:7 in Koren, "
                      "Bomberg, Munich and the variant the Vilna margin records show that the story was often passed on "
                      "as the sage's own continuing report. The third person in Vilna therefore need not be a new "
                      "narrator. Mixed person inside a quoted story is common in Talmudic Aramaic. The page-image "
                      "readings are mine and unchecked."),
        "confidence": "medium",
        "graph_effect": ("For c7, c10, c19, c22 and the shared claims c26-c31, replace voice 'unknown' with 'the "
                         "branch-selected teller, as reported by Rava'. Keep an alternative in which the anonymous "
                         "Talmudic narrator retells the story in the third person. The actors do not change under either "
                         "reading: the husband is the sage."),
    },
    {
        "finding_id": "f05",
        "claim": ("The woman who knocks is 'her neighbour' (שיבבתה): a female neighbour of the wife. The first reading "
                  "kept the neighbour as a person but lost the relation to the wife."),
        "kind": "textual",
        "evidence": [
            ev("wikisource_he", "אתאי שיבבתה טרפא אדשא"),
            ev("davidson_en", "Her neighbor came</b> and <b>knocked on the door."),
            ev("steinsaltz_he", "[באה שכנתה</small> ו<small>דפקה בדלת]</small> להכנס"),
            ev("jastrow_shivava", "<i>neighbor</i>"),
        ],
        "reasoning": ("The suffix ־ה on שיבבתה ('her neighbour') refers back to דביתהו. אתאי and טרפא are feminine, and "
                      "the husband answers her with לה. Davidson ('Her neighbor') and Steinsaltz (שכנתה) agree."),
        "confidence": "high",
        "graph_effect": ("Add neighbor_of(neighbor, wife), explicit. Add a speech claim: the husband speaks to the "
                         "neighbour, and his words concern the wife. The neighbour is the addressee and the wife is who "
                         "the words are about."),
    },
    {
        "finding_id": "f06",
        "claim": ("Commentators give different reasons for the knock. Rashi says the neighbour was asking for the wife. "
                  "Steinsaltz says she knocked to come in. Rashi's lemma reads אבבא ('at the gate') where the printed "
                  "text has אדשא ('at the door')."),
        "kind": "interpretation",
        "evidence": [
            ev("rashi", "טרפא אבבא - שהיתה שואלת אותה"),
            ev("steinsaltz_he", "טרפא אדשא</b> <small>[באה שכנתה</small> ו<small>דפקה בדלת]</small> להכנס"),
            ev("glick_en", "a female neighbor came to ask for her"),
        ],
        "reasoning": ("Researcher translation of Rashi: 'she was asking for her'. Glick's English follows Rashi. The "
                      "Aramaic says only that she came and knocked. The purpose comes from the commentators."),
        "confidence": "medium",
        "graph_effect": ("Record the neighbour's purpose as commentary (Rashi: seeking the wife; Steinsaltz: wanting to "
                         "enter), not as text. Do not add a 'neighbour asks for the wife' speech turn as explicit."),
    },
    {
        "finding_id": "f07",
        "claim": ("A missed turn: the husband thinks before he speaks ('he thought / I thought: it is not proper'). This "
                  "private reason explains the false answer 'she is not here'. Commentators differ on what exactly "
                  "was improper."),
        "kind": "textual",
        "evidence": [
            ev("wikisource_he", "סבר לאו אורח ארעא אמר לה ליתא הכא"),
            ev("rashi", "לאו אורח ארעא - לומר היכן היא הואיל וחייפ' רישה"),
            ev("steinsaltz_he", "זה לספר לה שאשתו רוחצת עצמה"),
            ev("davidson_en", "He thought:</b> It is <b>not proper conduct</b> to tell the neighbor that his wife is bathing."),
        ],
        "reasoning": ("סבר is explicit. What the impropriety consists of is commentary. Rashi (researcher translation): "
                      "'to say where she is, since she was washing her head'. Steinsaltz: 'to tell her that his wife is "
                      "washing herself'. Davidson's plain words 'to tell the neighbor that his wife is bathing' are "
                      "editorial."),
        "confidence": "high",
        "graph_effect": ("Add a views/thought claim for the teller: 'not proper conduct', stated, with the content left "
                         "open. c7/c19: the denial ליתא הכא is spoken to the neighbour and is false within the story. It "
                         "is not a statement that the wife was absent."),
    },
    {
        "finding_id": "f08",
        "claim": ("The Aramaic does not state that the lie caused the sons' deaths. It places the deaths right after the "
                  "lie, and the residents' plea 'do not provoke death upon these people' implies the link. The words "
                  "'Since he deviated from the truth' (Davidson plain text), 'וכיון ששינה בדיבורו' (Steinsaltz) and "
                  "'[As a punishment for this]' (Soncino, bracketed) are all editorial."),
        "kind": "interpretation",
        "evidence": [
            ev("davidson_en", "<b>He said to her: She is not here.</b> Since he deviated from the truth <b>his two sons died."),
            ev("steinsaltz_he", "וכיון ששינה בדיבורו <b>שכיבו ליה תרתין בנין</b>"),
            ev("soncino_en", "[As a punishment for this] his two sons died."),
            ev("wikisource_he", "ולא תגרי בהו מותנא בהנך אינשי"),
            ev("chidushei_agadot", "שהשקר מביא מיתה בלא זמן"),
        ],
        "reasoning": ("In Davidson only the bold words translate the Aramaic. The causal clause is plain text. The link "
                      "is strongly implied inside the story: the town where no one dies early, the residents' question "
                      "and plea, and Maharsha's explanation (researcher translation: 'falsehood brings untimely "
                      "death'). The Aramaic still does not state it."),
        "confidence": "high",
        "graph_effect": ("Any 'deaths caused by the lie' edge must be basis=interpretation with the editorial source "
                         "named. It must not be basis=explicit."),
    },
    {
        "finding_id": "f09",
        "claim": ("The sons' parents are both stated. 'I had two sons from her' makes the teller their father and the "
                  "wife their mother. The two sons who die in 97a:7 are naturally the same two, and the Koren text "
                  "says 'his two sons'."),
        "kind": "textual",
        "evidence": [
            ev("wikisource_he", "נסיבי איתתא מינהון והוו לי תרתין בנין מינה"),
            ev("koren_he", "שְׁכִיבוּ לֵיהּ תְּרֵין בְּנֵיה"),
            ev("wikisource_he", "שכיבו ליה תרתין בנין"),
        ],
        "reasoning": ("מינה ('from her') states the mother, and לי ('to me') the father. The first reading marked "
                      "c12/c13/c24/c25 (father) and c26/c27 (mother) as basis 'interpretation' and gave c26/c27 voice "
                      "'unknown'. Both are explicit in the teller's words. The sibling claim c28 is derived from the "
                      "shared parents and is not a separate observation."),
        "confidence": "high",
        "graph_effect": ("Change the basis of c12, c13, c24, c25, c26 and c27 to explicit and their voice to the teller. "
                         "Mark c28 as derived. Link the dying sons (c31) to the same 'sons' group, basis local "
                         "coreference, supported by Koren's בְּנֵיהּ."),
    },
    {
        "finding_id": "f10",
        "claim": ("The wife is 'a woman from among them', one of the townspeople. That puts her in the residents' group, "
                  "which the first reading did not record. The plea 'leave our place' also shows the teller was living "
                  "there."),
        "kind": "textual",
        "evidence": [
            ev("wikisource_he", "נסיבי איתתא מינהון"),
            ev("wikisource_he", "במטותא מינך פוק מאתרין"),
            ev("davidson_en", "I married a woman from</b> among <b>them,"),
        ],
        "reasoning": ("מינהון refers back to the people of the place who do not change their words. 'Leave our place' "
                      "(researcher translation) assumes he lived there. That is a reasonable inference; the text does "
                      "not say where he lived."),
        "confidence": "medium",
        "graph_effect": ("Add member_of(wife, residents), explicit. Add resided_in(teller, town), interpretation. The "
                         "residents' request to leave stays a request. No departure or expulsion is reported."),
    },
    {
        "finding_id": "f11",
        "claim": ("The residents speak three times. They come to him and ask 'What is this?'. He answers only 'this is "
                  "how it happened'; no further words are quoted. Then they plead with him to leave. Witnesses "
                  "differ between the singular abbreviation א\"ל and plural אמרו ליה, and Munich appears to read "
                  "'they said to me'."),
        "kind": "textual",
        "evidence": [
            ev("wikisource_he", "אמרו ליה מאי האי אמר להו הכי הוה מעשה א\"ל במטותא מינך"),
            ev("koren_he", "אֲמַרוּ לֵיהּ: בְּמָטוּתָא מִינָּך"),
            ev("steinsaltz_he", "<b>מעשה</b> ששיניתי בדיבורי מפני הנימוס"),
            ev("soncino_en", "So he related to them what had happened."),
        ],
        "reasoning": ("The content of the answer is not given. Steinsaltz supplies it in the first person (researcher "
                      "translation: 'that I changed my words for the sake of manners'). That is his explanation, not "
                      "the text. The speaker of the plea is the group. א\"ל is an abbreviation that the Koren text "
                      "prints as a plural."),
        "confidence": "high",
        "graph_effect": ("Keep c9/c21, c10/c22 and c11/c23. The content of c10/c22 is 'this is how it happened' with no "
                         "further words; do not add a confession as quoted speech. The speaker of c11/c23 is the "
                         "residents' group, whether the verb is singular or plural."),
    },
    {
        "finding_id": "f12",
        "claim": ("Some later authors retell the story beyond the text. Reshit Chokhmah names the teller as Rav Tavyomi "
                  "and says the townspeople expelled him (וגירשוהו). The Talmud reports only a plea to leave."),
        "kind": "interpretation",
        "evidence": [
            ev("reshit_chokhmah", "רב טביומי שמו, ומפני ששינה בדיבורו בדבר קל כמו שנתבאר שם בגמרא, קבר ב' בניו, וגירשוהו מביניהם"),
            ev("shaarei_kedusha", "על רב טביומי דאילו הוו יהבי ליה כל חללי דעלמא"),
            ev("ben_yehoyada", "ולכן אמר כאן על רב טביומי"),
        ],
        "reasoning": ("Researcher translation of Reshit Chokhmah: 'Rav Tavyomi by name ... buried two sons, and they "
                      "expelled him from among them'. These later works each pick one of the two names and simplify "
                      "the story. They are secondary retellings, not independent witnesses to the story or to the "
                      "name."),
        "confidence": "high",
        "graph_effect": ("Do not add an expulsion or departure event. Do not resolve the name branch from later "
                         "quotations that give only one name."),
    },
    {
        "finding_id": "f13",
        "claim": ("The two names are given as alternatives ('Rav Tavut is his name, and some say Rav Tavyomi is his "
                  "name'). The Vilna, Koren, Munich (as I read it) and Ein Yaakov texts all carry both. Maharal treats "
                  "them as a disagreement between tradents and reads both names symbolically, and also as a possible "
                  "allegory of Moses. That is homiletic, not an identification."),
        "kind": "textual",
        "evidence": [
            ev("wikisource_he", "ורב טבות שמיה ואמרי לה רב טביומי שמיה"),
            ev("glick_he", "ורב טבות שמו ואמרי לה רב טביומי שמיה"),
            vis("munich95_image", "טבות שמי' ואמרי לה רב טביומי שמי'",
                "Researcher's visual reading of Munich 95."),
            ev("maharal", "ואם יש לך להבין מחלוקת זה מר אמר רב טבות שמיה ומר אמר רב טביומי שמיה"),
            ev("maharal", "אמנם נ\"ל כי המאמר הזה נאמר על משרע\"ה"),
            ev("jastrow_tavyomi", "his name was R. Tabuth, some say, R. Tabyomi"),
        ],
        "reasoning": ("ואמרי לה is the standard formula for a reported alternative. Maharal (researcher translation: 'one "
                      "master says his name is Rav Tavut and another says Rav Tavyomi') confirms the tradition-dispute "
                      "reading. His symbolic and Moses readings are later interpretation. The Bomberg spelling of the "
                      "first name was hard for me to read (it could look like טבורת) and I do not count it as a "
                      "variant."),
        "confidence": "high",
        "graph_effect": ("Keep the reading group: two branches, one teller. Neither branch establishes whether Rav Tavut "
                         "and Rav Tavyomi are the same or different people historically."),
    },
    {
        "finding_id": "f14",
        "claim": ("Bava Metzia 49a has a close parallel with a different chain and a different alternative name. Rav "
                  "Pappi says that Ravina told him that 'one of the Sages, Rav Tavut, and some say Rav Shmuel bar "
                  "Zutra', who would not change his word for all the world, told him a different story (about sesame). "
                  "Vilna Sanhedrin cross-references it in the margin."),
        "kind": "textual",
        "evidence": [
            ev("bm49a_wikisource", "אמר רב פפי אמר לי רבינא לדידי אמר לי ההוא מרבנן ורב טבות שמיה ואמרי לה רב שמואל בר זוטרא שמיה דאי הוו יהבי ליה כל חללא דעלמא"),
            ev("bm49a_en", "<b>Rav Pappi said</b> that <b>Ravina said to me: One of the Sages, and Rav Tavot is his name, and some say Rav Shmuel bar Zutra is his name,</b>"),
            vis("vilna_image", "[ב\"מ מט. ע\"ש]",
                "Researcher's visual reading of the Vilna margin reference beside אמר לי *ההוא מרבנן."),
        ],
        "reasoning": ("The same description and the same first name appear with a different hearer (Ravina, not Rava) "
                      "and a different alternative name. This may be a shared literary pattern for 'the truthful sage'. "
                      "A shared name does not show that the two passages are about one person."),
        "confidence": "high",
        "graph_effect": ("Record a coreference candidate between the Sanhedrin Rav Tavut branch and the Bava Metzia Rav "
                         "Tavut. Leave it unmerged. Do not add Ravina or Rav Shmuel bar Zutra to this passage's graph."),
    },
    {
        "finding_id": "f15",
        "claim": ("Be'er Sheva proposes that 'Rav Shmuel bar Zutra' in Bava Metzia is a scribal error and should read "
                  "'Rav Tavyomi' as in Sanhedrin. Gilyon HaShas repeats this. Seder HaDorot adds a chronological "
                  "argument about which Ravina is meant. These are later emendations and inferences, not variants."),
        "kind": "interpretation",
        "evidence": [
            ev("beer_sheva", "נראה לי שיש טעות סופר וצריך להגיה ואמרי לה רב טביומי שמיה דאי כו' דהכי גרסינן בפרק חלק דף צ\"ז ע\"א ושם עיקר מקומו"),
            ev("gilyon_hashas", "כ' הבאר שבע סי' יג דצ\"ל רב טביומי שמיה דהכי אית' בסנהדרין"),
            ev("seder_hadorot", "וצ\"ל דרבינא הנ\"ל הוא הקדמון כי בין שמואל לרבינא האחרון זמן רב ביניהם, או שהאריך רב טבות כ\"כ ימים"),
        ],
        "reasoning": ("Be'er Sheva (researcher translation): 'it seems to me there is a scribal error and one should "
                      "emend ... for so we read in Perek Helek 97a, and that is its main place'. The emendation assumes "
                      "the two passages are one tradition. Seder HaDorot's dating is historical inference from "
                      "biographies. Jastrow also notes a manuscript spelling טאבות for Bava Metzia, which I did not "
                      "verify."),
        "confidence": "high",
        "graph_effect": ("Store Be'er Sheva/Gilyon HaShas as 'proposed emendation' evidence, separate from source "
                         "variants. They do not change the Sanhedrin branches. Any historical merge needs its own "
                         "decision."),
    },
    {
        "finding_id": "f16",
        "claim": ("The story is placed as an illustration of 'truth will be lacking' (Isaiah 59:15) in the baraita about "
                  "the generation of the Messiah. The segment's opening 'Concerning the lack of truth' is Davidson's "
                  "plain text. Rava states his former view. The implied change of mind is never stated."),
        "kind": "interpretation",
        "evidence": [
            ev("davidson_en", "§ Concerning the lack of truth, <b>Rava says: Initially I would say</b>"),
            ev("steinsaltz_he", "כיון שדובר בהעדר האמת, מביאים דברים ש<b>אמר רבא"),
            ev("rashi", "ליכא קושטא בעלמא - אין אדם בעולם שידבר אמת תמיד"),
            ev("wikisource_he", "והאמת נעדרת שנאמר (ישעיהו נט, טו) ותהי האמת נעדרת"),
        ],
        "reasoning": ("The placement is editorial. It links no people in the story to the baraita's speakers "
                      "(R. Yehuda, the house of Rav, the house of R. Sheila). Rashi (researcher translation): 'there is "
                      "no one in the world who always speaks truth'."),
        "confidence": "high",
        "graph_effect": ("Keep c1 limited to the former view. Add no claim that Rava now holds a revised view, and no "
                         "edges from Rava to the baraita's speakers."),
    },
    {
        "finding_id": "f17",
        "claim": ("Translations differ in ways that matter for the graph. Glick has Raba 'met' the rabbi and turns the "
                  "story into third person. Soncino renders it as indirect speech ('told me that he once came'). "
                  "Davidson keeps it as direct first person."),
        "kind": "uncertainty",
        "evidence": [
            ev("glick_en", "However, I consequently met a certain Rabbi named Tabuth, according to others, R. Tibumi"),
            ev("glick_en", "It happened once, that he came to a city named Kushta"),
            ev("soncino_en", "told me that he once came to a place called Kushta,"),
            ev("davidson_en", "He said to me: One time I happened</b> to come"),
        ],
        "reasoning": ("'Met' is Glick's word. The Aramaic has אמר לי. These are free translations, and none is an "
                      "independent witness to the Aramaic."),
        "confidence": "high",
        "graph_effect": ("Do not use translation wording such as 'met' to create a scene or meeting edge beyond the "
                         "reported speech."),
    },
    {
        "finding_id": "f18",
        "claim": ("The place is called Kushta ('Truth'). Maharal notes that no such place is known and reads it "
                  "symbolically. Where it was, or whether it was real, is not established."),
        "kind": "uncertainty",
        "evidence": [
            ev("wikisource_he", "לההוא אתרא וקושטא שמיה"),
            ev("maharal", "גם לא מצאנו המקום הזה"),
            ev("soncino_en", "Lit., 'truth'."),
        ],
        "reasoning": ("Researcher translation of Maharal: 'also we have not found this place'. The name is also the "
                      "theme of the story."),
        "confidence": "medium",
        "graph_effect": ("Keep the town as a local place node labelled Kushta, with no geographic identification and a "
                         "note that it may be literary."),
    },
]

ALTERNATIVES = [
    {"id": "alt_name", "about": "Name of the teller",
     "readings": ["Rav Tavut", "Rav Tavyomi"],
     "who_says_what": "Talmud gives both (ואמרי לה). Maharal: a dispute between tradents, both names meaningful. Reshit Chokhmah, Sha'arei Kedusha and Ben Yehoyada name only Rav Tavyomi (later retellings).",
     "status": "keep both branches"},
    {"id": "alt_addressee_marker", "about": "אמר לי against אמר ליה",
     "readings": ["said to me (Vilna/Wikisource, Koren, Rashi's lemma, Chokhmat Shlomo's correction)",
                  "said to him (earlier print seen by Chokhmat Shlomo; Bomberg as read visually; one Maharal quotation)"],
     "status": "keep as a textual-variant note on c2/c14; the hearer is most plausibly Rava in both"},
    {"id": "alt_narrator_person", "about": "Who narrates 97a:7",
     "readings": ["The teller continues his first-person report (Koren סְבַרִי/אֲמַרִי; Vilna margin variant; Bomberg and Munich as read visually)",
                  "The anonymous Talmudic narrator retells in the third person (Vilna/Wikisource text; Maharal's quotation)"],
     "status": "keep both; the actors are the same under either"},
    {"id": "alt_knock_purpose", "about": "Why the neighbour knocked",
     "readings": ["Rashi: she was asking for the wife", "Steinsaltz: to come in"],
     "status": "commentary only"},
    {"id": "alt_impropriety", "about": "What was 'not proper'",
     "readings": ["Rashi: to say where the wife is while she washes her head",
                  "Steinsaltz / Davidson plain text: to tell the neighbour the wife is bathing"],
     "status": "commentary only"},
    {"id": "alt_bm_parallel", "about": "Relation to Bava Metzia 49a Rav Tavut",
     "readings": ["Separate traditions using the same 'truthful sage' formula",
                  "One tradition. Be'er Sheva emends BM's alternate name to Rav Tavyomi"],
     "status": "unmerged coreference candidate"},
]

UNRESOLVED = [
    "Other manuscripts of Sanhedrin 97a (e.g., Florence, Karlsruhe, Yad HaRav Herzog) and Dikdukei Soferim were not checked. The person of the 97a:7 verbs and אמר לי/ליה need a proper collation.",
    "My readings of Munich 95 and Bomberg are visual and unchecked. The Munich words before לאו אורח ארעא and the number word before בני were especially hard to read.",
    "Whether Rav Tavut of Sanhedrin 97a and Rav Tavut of Bava Metzia 49a are the same figure. Chronology (Rava vs Ravina) is historical inference and was not settled here.",
    "Jastrow reports a manuscript spelling טאבות in Bava Metzia. I did not verify it.",
    "Whether the town is meant as a real place.",
]

CORRECTIONS = [
    {"claim_id": "c3, c15", "change": "Recode from scenes/participates_in (with an 'offerers' role) to a character claim in Rava's voice, marked counterfactual. Drop or mark as non-referring the 'offerers' entity.", "why": "f03"},
    {"claim_id": "c7, c10, c19, c22, c26-c31 (voice)", "change": "Voice becomes the branch-selected teller, as reported by Rava. Keep an alternative for an anonymous narrator retelling.", "why": "f04"},
    {"claim_id": "c12, c13, c24, c25, c26, c27", "change": "Change basis from interpretation to explicit ('הוו לי תרתין בנין מינה'). c26/c27 voice is the teller.", "why": "f09"},
    {"claim_id": "c28", "change": "Mark as derived from the shared parents; not a separate observation.", "why": "f09"},
    {"claim_id": "new", "change": "Add neighbor_of(neighbor, wife), explicit (שיבבתה).", "why": "f05"},
    {"claim_id": "new", "change": "Add a thought claim: the teller thought it was not proper conduct (סבר/סברי לאו אורח ארעא). Its content comes from commentary.", "why": "f07"},
    {"claim_id": "c7, c19", "change": "Add the wife as the person the words are about (ליתא הכא = 'she is not here'); addressee = neighbour.", "why": "f05, f07"},
    {"claim_id": "new", "change": "Add member_of(wife, residents), explicit (איתתא מינהון). Add resided_in(teller, town), interpretation.", "why": "f10"},
    {"claim_id": "new (optional)", "change": "If a causal link is recorded between the lie and the deaths, basis=interpretation, citing that the explicit causal words are editorial (Davidson plain text, Steinsaltz, Soncino brackets).", "why": "f08"},
    {"claim_id": "c2, c14", "change": "Keep. Add a variant note: אמר לי / אמר ליה (Chokhmat Shlomo; Bomberg).", "why": "f02"},
    {"claim_id": "reading_groups", "change": "Add a reading group for the person of 97a:7 (first person against third person).", "why": "f04"},
    {"claim_id": "coreference_candidates", "change": "Add a candidate linking the tavut branch to Rav Tavut in Bava Metzia 49a:16. Leave it unmerged, with Be'er Sheva's emendation stored as emendation evidence.", "why": "f14, f15"},
    {"claim_id": "previous_review additional_findings", "change": "The review calls 'unknown' voice acceptable. The witnesses show that the teller is the more likely voice, so this is a correctable gap, not just a limit of the contract.", "why": "f04"},
]

LESSONS = [
    "A nested first-person report needs a voice value such as 'teller of branch X, reported by Y'. 'unknown' loses evidence the witnesses provide.",
    "When grammatical person shifts inside a story, check the variants before concluding that the narrator changed. Abbreviations such as א\"ל can be expanded as 'said to me' or 'said to him'.",
    "A possessive on a relational noun (שיבבתה, 'her neighbour') is an explicit social relation, just as a patronymic is a family relation.",
    "A counterfactual used as praise ('if they gave him the whole world') is a character claim, not an event with participants.",
    "In the Davidson English, causal glue ('Since he deviated from the truth') is often in plain text. Check bold against plain before setting basis=explicit.",
    "Later retellings (expulsion, choosing one name) and emendations (Be'er Sheva) are separate evidence types from source variants. They do not resolve branches.",
    "A stock description attached to the same name in another tractate is a coreference candidate, not a merge.",
]
