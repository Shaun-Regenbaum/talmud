# Findings for random-yerushalmi-06. Loaded by build_dossier.py, which supplies ev().
QUESTION = ("Separate the stolen-deposit scenario and its payment differences from the first deposit "
            "dialogue. Recover return rules, named household story and pronouns without merging legal "
            "roles and story actors.")

SCOPE = ("Checked: Yerushalmi Bava Kamma 9:6-9:8 (Venice, Mechon-Mamre, Guggenheimer Hebrew and English); "
         "Penei Moshe, Mareh HaPanim, Sha'arei Torat Eretz Yisrael and Noam Yerushalmi on 9:7; Tosefta Bava Kamma "
         "(Lieberman) 11:1; Bavli Bava Batra 51b, 52a (with Rashbam) and 175a; Mishnah Bava Kamma 9:7-10 in several "
         "versions and translations; Yerushalmi Bava Kamma 10:1 and 10:9 for the specific points cited; Mishneh Torah "
         "Borrowing and Deposit 7:10 and Marriage 22:32; Shulchan Arukh Even HaEzer 86:1; Jastrow. Not checked: Korban "
         "HaEdah and Sheyarei Korban on this halakhah (not found among the Sefaria links for 9:7:2), manuscripts of the "
         "Yerushalmi (e.g. Leiden), Lieberman's Tosefta Kifshutah, and the Tosefta variant apparatus. Absence of a "
         "commentary from this list is not evidence that none exists.")

FINDINGS = [
 {
  "finding_id": "F1",
  "claim": "The mishnah at 9:7:1 contains two separate deposit dialogues. They share the same frame (demand, answer, oath, 'amen', witnesses) but differ in the keeper's answer: 'it was lost' in the first and 'it was stolen' in the second. They are two hypothetical cases, not one exchange.",
  "kind": "textual",
  "evidence": [
   ev("S1", "איכן פקדוני אמר לו אבד משביעך אני ואמ' אמן והעדי' מעידין אותו שאכלו משלם את הקרן הודה מעצמו משלם קרן וחומש ואשם", "base_text",
      "Translation by this dossier: 'Where is my deposit?' He said to him, 'It was lost.' 'I make you swear,' and he said 'Amen.' If witnesses testify that he ate it, he pays the principal. If he admitted on his own, he pays principal, a fifth and a guilt offering.", "Venice 9:7:1"),
   ev("S1", "איכן פקדוני אמר לו נגנב משביעך אני ואמר אמן והעדים מעידין אותו שגנבו משלם תשלומי כפל הודה מעצמו משלם קרן וחומש ואשם", "base_text",
      "Translation by this dossier: 'Where is my deposit?' He said to him, 'It was stolen.' 'I make you swear,' and he said 'Amen.' If witnesses testify that he stole it, he pays double. If he admitted on his own, he pays principal, a fifth and a guilt offering.", "Venice 9:7:1"),
   ev("S1", 'י"א איכן פקדוני', "base_text", "Translation by this dossier: '11. Where is my deposit'", "Venice numbers the first dialogue as mishnah 11"),
   ev("S1", 'י"ב איכן פקדוני', "base_text", "Translation by this dossier: '12. Where is my deposit'", "Venice numbers the stolen dialogue separately as mishnah 12"),
   ev("S14", "היכן פקדוני אמר לו נגנב. משביעך אני ואמר אמן. והעדים מעידין אותו שגנבו. משלם תשלומי כפל.", "parallel", None, "Mishnah Vilna 1913, 9:8 in standard Mishnah numbering"),
  ],
  "reasoning": "The Venice text numbers the two dialogues 11 and 12. The standard Mishnah also prints them as separate mishnayot. Only the answer word and the result differ. The earlier reading extracted only the first dialogue.",
  "confidence": "high",
  "graph_effect": "Create two scenario instances (lost-claim case and stolen-claim case). Each has its own local generic depositor and keeper role. Do not merge the two keepers into one person, and do not attach the stolen case's double payment to the first dialogue."
 },
 {
  "finding_id": "F2",
  "claim": "The payments differ by the keeper's answer and by how the lie comes out. Lost claim, then witnesses say he ate it: principal only. Stolen claim, then witnesses say he stole it: double payment. Admission on his own after the oath, in either case: principal, a fifth and a guilt offering.",
  "kind": "textual",
  "evidence": [
   ev("S1", "והעדי' מעידין אותו שאכלו משלם את הקרן", "base_text", "Translation by this dossier: 'and the witnesses testify that he ate it: he pays the principal'", "Venice 9:7:1, first case"),
   ev("S1", "והעדים מעידין אותו שגנבו משלם תשלומי כפל", "base_text", "Translation by this dossier: 'and the witnesses testify that he stole it: he pays double'", "Venice 9:7:1, second case"),
   ev("S1", "הודה מעצמו משלם קרן וחומש ואשם", "base_text", "Translation by this dossier: 'if he admitted on his own, he pays principal, a fifth and a guilt offering'", "Venice 9:7:1, identical in both cases"),
   ev("S1", "For the unpaid trustee who claimed falsely that the deposit was stolen, double restitution is required by ", "translator_note", None, "Guggenheimer note 92"),
   ev("S1", "Nobody pays multiple restitution on his own confession since a confession is not acceptable in a criminal trial.", "translator_note", None, "Guggenheimer note 93"),
  ],
  "reasoning": "The mishnah states these results. The notes give reasons and are interpretation, kept in F3. They do not change the stated outcomes.",
  "confidence": "high",
  "graph_effect": "Add conditional legal-consequence claims on the generic keeper of each scenario: (lost + witnesses -> principal), (stolen + witnesses -> double), (either + self-admission -> principal, fifth, guilt offering). These are rules, not events, and create no person-to-person relation beyond the scenario roles."
 },
 {
  "finding_id": "F3",
  "claim": "Commentary explains the difference. Penei Moshe: double payment applies only when the keeper made a theft claim. Even if witnesses say he stole it after a 'lost' claim, he does not pay double. A self-admission does not bring double payment, because the verse excludes one who convicts himself. The fifth and the guilt offering come only with a self-admission after the oath.",
  "kind": "interpretation",
  "evidence": [
   ev("S6", "ובטוען טענת אבד ליכא כפל", "commentary", "Translation by this dossier: 'and when he claims a claim of loss, there is no double payment'", "Penei Moshe 9:7:1:1"),
   ev("S6", "לא מיבעיא אם מעידין שגנבו אלא אפילו אכלו אינו בעולם פטור מן הכפל הואיל וטען טענת אבד ובטוען טענת גנב כדקתני בסיפא משלם הוא כפל כגנב עצמו", "commentary", None, "Penei Moshe 9:7:1:2"),
   ev("S6", "וחומש ואשם נמי ליכא דאין חומש ואשם אלא בהודה מעצמו אחר שנשבע", "commentary", "Translation by this dossier: 'and there is also no fifth and guilt offering, since these apply only when he admits on his own after he swore'", "Penei Moshe 9:7:1:3"),
   ev("S6", "אבל בהודה מעצמו אינו משלם כפל דכתיב אשר ירשיעון האלהים פרט למרשיע את עצמו", "commentary", "Translation by this dossier: 'but when he admits on his own he does not pay double, as it is written \"whom the judges convict\", excluding one who convicts himself'", "Penei Moshe 9:7:1:4"),
  ],
  "reasoning": "This is commentary, not the Yerushalmi's own discussion. The Yerushalmi halakhah that follows does not discuss these payments (see F5).",
  "confidence": "high",
  "graph_effect": "Attach as rationale on the F2 consequence claims, credited to Penei Moshe. No new people."
 },
 {
  "finding_id": "F4",
  "claim": "Pronouns in both dialogues: 'אמר לו' is the keeper answering the depositor. 'משביעך אני' ('I make you swear') is the depositor. 'ואמר אמן' is the keeper. 'מעידין אותו' and 'שאכלו' or 'שגנבו' refer to the keeper: he himself ate or stole the deposit.",
  "kind": "interpretation",
  "evidence": [
   ev("S1", "אמר לו אבד משביעך אני ואמ' אמן", "base_text", "Translation by this dossier: 'He said to him: lost. I make you swear. And he said: amen.'", "Venice 9:7:1; no speaker labels"),
   ev("S14", "If the owner asked the bailee: Where is my deposit, and the bailee said to him: It was stolen; and the owner said: I administer an oath to you, and the bailee said: Amen", "translation", None, "Mishnah, William Davidson English"),
   ev("S14", "[If a man said], “Where is my deposit?” and the other said, “It is stolen,”", "translation", None, "Mishnah, Kulp English, marks the added speaker in brackets"),
  ],
  "reasoning": "The Hebrew does not name speakers. Speakers change silently. The translations supply owner/bailee labels, and the legal logic requires them: the owner imposes the oath and the keeper accepts it. This is an interpretation with no stated rival.",
  "confidence": "high",
  "graph_effect": "Speech roles per scenario: depositor asks and imposes the oath; keeper answers and swears. The same assignment holds in both scenarios, but in separate instances."
 },
 {
  "finding_id": "F5",
  "claim": "The focal halakhah (9:7:2) opens by quoting only the first dialogue as its heading ('Where is my deposit, and he said to him: lost, etc.'). It then brings a baraita about deposits from women, slaves and minors. In the text checked, it does not discuss the stolen-deposit case or the payment differences. The mishnah on robbing one's father is not discussed either.",
  "kind": "textual",
  "evidence": [
   ev("S1", "הלכה י\"א איכן פקדוני ואמר לו אבד כו' תני אין מקבלין פיקדון מנשים ועבדים וקטנים", "base_text", "Translation by this dossier: 'Halakhah 11. \"Where is my deposit, and he said to him: lost\" etc. It was taught: one does not accept a deposit from women, slaves or minors.'", "Venice 9:7:2"),
   ev("S3", 'הלכה י"ד האומר לבנו קונם', "base_text", "Translation by this dossier: 'Halakhah 14. One who says to his son, konam'", "Venice 9:8:2: the next halakhah heading jumps to mishnah 14"),
   ev("S1", "Since the Yerushalmi does not discuss this Mishnah, we do not know whether the intention is that the robber has to pay to the father’s brothers or other sons ot to his own sons or brothers.", "translator_note", None, "Guggenheimer note 103, on the father mishnah"),
  ],
  "reasoning": "The heading 'כו'' ('etc.') cites the start of the mishnah unit. It is a citation, not a new dialogue or a new speaker. Between halakhah 11 (9:7:2) and halakhah 14 (9:8:2), the Venice text has no halakhah headed by mishnah 12 (stolen) or 13 (father). This is scoped to the segments checked. The baraita may still bear on deposits in general.",
  "confidence": "high",
  "graph_effect": "Do not treat the heading as a third deposit exchange. Do not attach the halakhah's return rules or the household story to the stolen-deposit scenario's roles."
 },
 {
  "finding_id": "F6",
  "claim": "Return rules in the baraita. One should not accept deposits from women, slaves or minors. If one did: from a woman, return it to her, or to her husband if she died. From a slave, return it to him, or to his master if he died. From a minor, return it to him, or to his father if he died, and invest it safely ('סגולה'). All of these are hypothetical roles. The person who accepted the deposit is an unnamed generic bailee.",
  "kind": "textual",
  "evidence": [
   ev("S1", "קיבל מאשה יחזיר לה מתה יחזיר לבעלה מעבד יחזיר לו ואם מת יחזיר לרבו מקטן יחזיר לו מת יחזיר לאביו ועושה בהן סגולה", "base_text",
      "Translation by this dossier: 'If he received from a woman, he returns it to her; if she died, he returns it to her husband. From a slave, he returns it to him, and if he died, to his master. From a minor, he returns it to him; if he died, to his father; and he makes of them a safe investment.'", "Venice 9:7:2"),
   ev("S11", "תנו רבנן אין מקבלין פקדונות לא מן הנשים ולא מן העבדים ולא מן התינוקות", "parallel", None, "Bavli Bava Batra 51b"),
   ev("S16", "תני אין מקבלין פקדונות לא מנשים ולא מעבדים ולא מקטנים קיבל מן האשה יחזיר לה מתה יחזיר לבעלה", "parallel", None, "Venice, Yerushalmi Bava Kamma 10:9: the same baraita opening in the wider tractate"),
   ev("S6", "דחזקה שאינו שלהן", "commentary", "Translation by this dossier: 'because of the presumption that it is not theirs'", "Penei Moshe 9:7:2:2, reason for the rule"),
   ev("S1", "Who is her heir.", "translator_note", None, "Guggenheimer note 96, on the husband"),
  ],
  "reasoning": "The subject of 'קיבל' (he received) and 'יחזיר' (he returns) is not named. It is the one who accepted the deposit. 'לה' refers to the woman, 'לבעלה' to her husband, 'לו' to the slave or minor, 'לרבו' to the slave's master and 'לאביו' to the minor's father. These are legal roles.",
  "confidence": "high",
  "graph_effect": "Add return-obligation claims from the generic bailee to each role, conditioned on alive or dead. Keep spouse_of (generic woman and her husband), child_of (generic minor and his father) and a master relation (generic slave and his master) as hypothetical, scenario-scoped relations. Do not link them to Rabbi Ba bar Hana's household."
 },
 {
  "finding_id": "F7",
  "claim": "The minor clause reads differently in different texts. The Yerushalmi editions checked read 'return to him; if he died, to his father; and make an investment'. The Tosefta reads 'make an investment for him; if he died, return to his father'. The Bavli reads 'make an investment for him; if he died, return to his heirs'. Three readers propose reordering the Yerushalmi to match the Tosefta: Penei Moshe, Sha'arei Torat Eretz Yisrael and Guggenheimer.",
  "kind": "textual",
  "evidence": [
   ev("S1", "מקטן יחזיר לו מת יחזיר לאביו ועושה בהן סגולה", "base_text", None, "Venice 9:7:2"),
   ev("S10", "קבל מן הקטן, עושה לו בהן סגולה, מת, יחזיר לאביו.", "parallel", "Translation by this dossier: 'If he received from the minor, he makes an investment for him with them; if he died, he returns it to his father.'", "Tosefta Bava Kamma (Lieberman) 11:1"),
   ev("S12", "קבל מן הקטן יעשה לו סגולה ואם מת יחזיר ליורשיו", "parallel", "Translation by this dossier: 'If he received from the minor, he makes an investment for him, and if he died, he returns it to his heirs.'", "Bavli Bava Batra 52a"),
   ev("S6", 'מקטן יעשה בהן סגולה מת יחזיר לאביו כצ"ל', "proposed_emendation", "Translation by this dossier: 'From a minor he makes an investment with them; if he died he returns to his father. So it should read.'", "Penei Moshe 9:7:2:4"),
   ev("S8", 'צ"ל: מקטן עושה בהן סגולה מת יחזיר לאביו', "proposed_emendation", None, "Sha'arei Torat Eretz Yisrael 9:7:2:1"),
   ev("S1", "It seems that this sentence should be rearranged as in the Tosephta", "proposed_emendation", None, "Guggenheimer note 97"),
  ],
  "reasoning": "Parallels in other works and later emendations are separate kinds of evidence. The emendations are proposals based on the Tosefta; no Yerushalmi witness checked here has that order. The difference between 'his father' and 'his heirs' is between works. It is not a variant of the Yerushalmi.",
  "confidence": "high",
  "graph_effect": "Keep the Yerushalmi's 'לאביו' role, since all three Yerushalmi editions checked have it. Record the proposed reorder as an emendation affecting the order of obligations, not the people. Do not import the Bavli's 'heirs' role into the Yerushalmi reading."
 },
 {
  "finding_id": "F8",
  "claim": "The dying-instruction clause, 'יעשה פירוש לפירושו', is read by the Yerushalmi commentators checked as 'carry out what they specified'. The Bavli uses the same phrase as the contrasting 'if not' case, meaning disregard the statement. The two works do not share one meaning for the phrase.",
  "kind": "interpretation",
  "evidence": [
   ev("S1", "וכולן שאמרו בשעת מותן יינתנו לפלוני שהן שלו יעשה פירוש לפירושו", "base_text", "Translation by this dossier: 'And all of them who said at the time of their death, \"let them be given to So-and-so, for they are his\": he should act according to his specification.'", "Venice 9:7:2"),
   ev("S6", "כלומר שיעשה הפירוש כמו שפירשו ויקיים צוואה שלהן דחזקה שאינם משקרין בשעת מיתה", "commentary", "Translation by this dossier: 'that is, he should carry out the specification as they specified and fulfill their will, for there is a presumption that they do not lie at the time of death'", "Penei Moshe 9:7:2:5"),
   ev("S8", "וביאור זה שיקיים כמו שאמרו", "commentary", "Translation by this dossier: 'and its meaning is that he fulfills what they said'", "Sha'arei Torat Eretz Yisrael 9:7:2:1"),
   ev("S10", "וכולן אם אמרו בשעת מיתה ינתן לפלני שהן שלו, יעשה מפורש בפירוש.", "parallel", None, "Tosefta (Lieberman) 11:1"),
   ev("S1", "If any of these said at the moment of their death, it should be given to X because it is his property, one should follow his interpretation", "translation", None, "Guggenheimer English 9:7:2"),
   ev("S12", "וכולן שאמרו בשעת מיתתן של פלוני הן יעשה כפירושן ואם לאו יעשה פירוש לפירושן", "parallel", "Translation by this dossier: '... he acts according to their specification; and if not, he makes an interpretation of their specification.'", "Bavli Bava Batra 52a"),
   ev("S21", "ואם לא מהימן לההוא נפקד שהפקדון של אותו פלוני הוא אלא של בעלים שלהם הוא", "commentary", None, "Rashbam on Bava Batra 52a"),
   ev("S7", "ושם גריס וכולן שאמרו וכו' יעשה כפירושן ואם לאו יעשה פירוש לפירושן", "commentary", None, "Mareh HaPanim 9:7:2:1, noting the Bavli wording"),
  ],
  "reasoning": "Penei Moshe and Sha'arei Torat Eretz Yisrael both say to fulfil the instruction. Guggenheimer's 'follow his interpretation' follows Lieberman (note 98, not independently checked here) and does not conflict. The Yerushalmi then introduces the story with 'כהדא' ('like this case'), which Penei Moshe calls support for relying on dying statements. That fits the 'carry out' reading. The Bavli's two-branch wording differs.",
  "confidence": "medium",
  "graph_effect": "The dying depositor (a generic role) directs the bailee to give the item to an unnamed 'פלוני' (So-and-so). Keep 'פלוני' as a hypothetical placeholder, not a person in the story. Do not import the Bavli's 'disregard' branch into the Yerushalmi rule."
 },
 {
  "finding_id": "F9",
  "claim": "Rabbi Zevida, in the name of Rabbi Ba bar Mamal, adds 'only with witnesses'. This is a transmission relation from a later tradent to a named authority. The patronymic gives Rabbi Ba a local parent placeholder, Mamal. The commentators disagree on what the witnesses must see.",
  "kind": "textual",
  "evidence": [
   ev("S1", "רבי זבידא בשם רבי בא בר ממל ובלבד בעדים", "base_text", "Translation by this dossier: 'Rabbi Zevida in the name of Rabbi Ba bar Mamal: provided it is with witnesses.'", "Venice 9:7:2"),
   ev("S1", "ר' זביד' בשם ר' בא בר ממל ובלבד בעדים", "text_variant", None, "Mechon-Mamre, abbreviated 'זביד''"),
   ev("S1", "Rebbi Zebida in the name of Rebbi Abba bar Mamal: Only before witnesses", "translation", None, "Guggenheimer English renders בא as Abba"),
   ev("S6", "שימסור לפלוני שאמרו בפני עדים", "commentary", "Translation by this dossier: 'that he delivers to So-and-so whom they said, before witnesses' (the phrase can also be read: 'whom they named before witnesses')", "Penei Moshe 9:7:2:6"),
   ev("S9", "והוא תמוה דמאי קא משמע לן", "commentary", "Translation by this dossier: 'and it is puzzling: what does it teach us?'", "Noam Yerushalmi, on Penei Moshe's explanation"),
   ev("S9", "הירושלמי לטעמי' דלא אמרינן מיגו בממון", "commentary", "Translation by this dossier: 'the Yerushalmi follows its own view that we do not apply migo in money matters'", "Noam Yerushalmi: witnesses are needed because the bailee alone is not believed"),
   ev("S1", "Dispositions of a last will which do not follow the general rule should be executed only in the presence of witnesses, to protect the trustee against claims of the legal heirs.", "translator_note", None, "Guggenheimer note 99"),
  ],
  "reasoning": "The transmission is explicit. What the witnesses attest is interpretation. Penei Moshe's wording is ambiguous between the delivery and the dying statement. Noam Yerushalmi says the dying statement itself needs witnesses, because the bailee's own word is not accepted. Guggenheimer speaks of executing the disposition before witnesses. Rendering 'בא' as 'Abba' is the translator's choice and is not an identification.",
  "confidence": "high",
  "graph_effect": "Keep transmission: Zevida reports_in_name_of Ba bar Mamal, content 'only with witnesses', scoped to the dying-instruction rule. Keep Ba bar Mamal child_of Mamal from the patronymic, with a local parent placeholder, even though Mamal plays no other role. Record 'זביד'' and 'Abba' as name-form variants only."
 },
 {
  "finding_id": "F10",
  "claim": "The named household story involves three people. Rabbi Ba bar Hana's unnamed wife, while dying, says the item is her daughter's. 'He' says it is only his. The case comes before Rav, who says a person is not given to lying at the time of death. The text does not state the outcome, who brought the case, or that the daughter is Rabbi Ba bar Hana's child.",
  "kind": "textual",
  "evidence": [
   ev("S1", "כהדא איתת דרבי בא בר חנה מי דמכא אמרה אהן קידושא דברתי והוא אמר לית הוא אלא דידי אתא עובדא קומי רב אמר אין אדם מצוי לשקר בשעת מיתה", "base_text",
      "Translation by this dossier: 'As in this: the wife of Rabbi Ba bar Hana, when she was dying, said: \"This קידושא is my daughter's.\" And he said: \"It is nothing but mine.\" The case came before Rav. He said: a person is not given to lying at the time of death.'", "Venice 9:7:2"),
   ev("S6", "והוא אמר. בעלה", "commentary", "Translation by this dossier: '\"and he said\": her husband'", "Penei Moshe 9:7:2:9 identifies the pronoun"),
   ev("S6", "מייתי סייעתא דסומכין על מה שמצויין בשעת מיתה", "commentary", "Translation by this dossier: 'he brings support that one relies on what they instruct at the time of death'", "Penei Moshe 9:7:2:7"),
   ev("S6", "ואפילו בגוונא שלא היתה נאמנת בחייה", "commentary", "Translation by this dossier: 'even in a case where she would not have been believed during her life'", "Penei Moshe 9:7:2:10"),
   ev("S1", "When Rebbi Abba bar Ḥana’s wife was dying, she said, these rings belong to my daughter. But he said no, they are mine.", "translation", None, "Guggenheimer English"),
  ],
  "reasoning": "'איתת דרבי בא בר חנה' ('the wife of Rabbi Ba bar Hana') states the marriage. 'ברתי' ('my daughter') is in the wife's own speech, so the mother-daughter relation carries her voice. Nothing makes the daughter the husband's child. 'והוא אמר' has no named antecedent. The husband is the only male in the story before it, and Penei Moshe says so. The first reading's resolution stands. 'אתא עובדא קומי רב' means the case came before Rav; it does not say the husband or wife visited him. Rav's words are a principle. The ruling for the wife is inferred (Penei Moshe), not stated.",
  "confidence": "high",
  "graph_effect": "Named-story actors: wife_of_Ba_bar_Hana (local, unnamed) spouse_of Ba bar Hana; daughter (local, unnamed) child_of wife, voice=wife; Ba bar Hana child_of Hana (patronymic placeholder, kept); 'והוא' coreferent with Ba bar Hana (commentary-supported); Rav: case came before him, plus a stated view. Keep the story actors separate from the baraita's generic woman, husband and bailee. 'Supports the wife's claim' stays an interpretation."
 },
 {
  "finding_id": "F11",
  "claim": "What the disputed 'קידושא' is remains uncertain, and the sources disagree. Jastrow's main gloss is 'betrothal-gift', though he suggests it is probably to be read 'ring'. Penei Moshe says a nose-ring. Sha'arei Torat Eretz Yisrael says earrings, the same as the Bavli's 'כיפי'. Guggenheimer translates 'rings'. Mechon-Mamre reads 'קירושא'. The earlier reading's 'betrothal property' follows only Jastrow's first gloss.",
  "kind": "uncertainty",
  "evidence": [
   ev("S20", "token of betrothal, betrothal-gift.", "lexicon", None, "Jastrow sense 4, citing this passage"),
   ev("S20", "prob. to be read: קַדִּישָׁא or קָדָשָׁא ring", "lexicon", None, "Jastrow, same entry"),
   ev("S6", "בשעת מיתתה אמרה זה הנזם של בתי הוא נזם זהב תרגומו קרשא דדהבא", "commentary", "Translation by this dossier: 'at the time of her death she said, this nose-ring is my daughter's; \"golden nose-ring\" is rendered in the Targum קרשא דדהבא'", "Penei Moshe 9:7:2:8"),
   ev("S8", "הן עגילי אזן", "commentary", "Translation by this dossier: 'they are earrings'", "Sha'arei Torat Eretz Yisrael 9:7:2:2"),
   ev("S8", "והן הן כיפי דבבלי", "commentary", "Translation by this dossier: 'and they are the כיפי of the Bavli'", "Sha'arei Torat Eretz Yisrael 9:7:2:2"),
   ev("S1", "אהן קירושא דברתי", "text_variant", None, "Mechon-Mamre spelling"),
   ev("S0b", "This is my daughter’s betrothal property", "earlier_reading", None, "Pilot entity daughter_property label"),
  ],
  "reasoning": "If 'betrothal' is taken literally, it can suggest an unstated betrothal event and a groom for the daughter. None of the jewellery readings implies either. The text supports only a claim that some item belongs to the daughter.",
  "confidence": "medium",
  "graph_effect": "Relabel the disputed object neutrally: 'this item (קידושא: jewellery per most sources; betrothal gift per Jastrow's main gloss) is my daughter's'. Do not create a betrothal event or a spouse for the daughter."
 },
 {
  "finding_id": "F12",
  "claim": "The husband's name is spelled differently in the editions checked. Venice and Guggenheimer's Hebrew read 'בר חנה'; Mechon-Mamre reads 'בר חנא'. Guggenheimer's English gives 'Abba bar Ḥana'. These are spelling and rendering variants of one name in one passage.",
  "kind": "textual",
  "evidence": [
   ev("S1", "איתת דרבי בא בר חנה", "base_text", None, "Venice"),
   ev("S1", "איתת דר' בא בר חנא", "text_variant", None, "Mechon-Mamre"),
   ev("S1", "כְּהָדָא אִיתַת דְּרִבִּי בָּא בַּר חָנָה", "text_variant", None, "Guggenheimer Hebrew, vocalized"),
  ],
  "reasoning": "Final ה and final א are often interchanged in Aramaic spelling. The variant does not change the local person. The Venice and Guggenheimer texts are not independent corroboration; the Guggenheimer Hebrew is an edited text.",
  "confidence": "high",
  "graph_effect": "One local person, Ba bar Hana, with name forms בר חנה / בר חנא. The parent placeholder Hana keeps both spellings."
 },
 {
  "finding_id": "F13",
  "claim": "The Bavli (Bava Batra 52a) tells a parallel story that differs in actors and outcome. The husband is Rabbah bar bar Hana. The dying wife says the rings belong to 'Marta and the sons of [the] daughter'. The case comes 'before Rav'. Rav gives a conditional answer (if you trust her, do as she said; if not, disregard it), and there is a second version of his answer. Rashbam explains Marta as a sage, the brother of Rabbi Hiyya.",
  "kind": "textual",
  "evidence": [
   ev("S12", "דביתהו דרבה בר בר חנה כי קא שכבה אמרה הני כיפי דמרתא ובני ברתא אתא לקמיה דרב אמר ליה אי מהימנא לך עשה כפירושה ואי לא עשה פירוש לפירושה", "parallel",
      "Translation by this dossier: 'The wife of Rabbah bar bar Hana, when she was dying, said: \"These rings are Marta's and the daughter's sons'.\" It came before Rav. He said to him: if she is trustworthy to you, do as she specified; if not, make an interpretation of her specification.'", "Bavli Bava Batra 52a, William Davidson Aramaic"),
   ev("S12", "ואיכא דאמרי הכי אמר ליה אי אמידא לך עשה כפירושה ואי לא עשה פירוש לפירושה", "parallel", None, "Bavli Bava Batra 52a, second version"),
   ev("S12", "belong to Marta and the sons of her daughter.", "translation", None, "William Davidson English"),
   ev("S21", "דמרתא - שם חכם אחיו של ר' חייא", "commentary", "Translation by this dossier: 'Marta: the name of a sage, the brother of Rabbi Hiyya'", "Rashbam on Bava Batra 52a"),
   ev("S21", "ובני ברתא - של מרתא ושל בני בתו", "commentary", "Translation by this dossier: 'and the daughter's sons: [they belong to] Marta and to the sons of his (or her) daughter'", "Rashbam; the possessor of 'בתו' is ambiguous"),
   ev("S21", "עשה פירוש לפירושה - עכב לעצמך", "commentary", "Translation by this dossier: 'make an interpretation of her specification: keep it for yourself'", "Rashbam"),
   ev("S7", "ומייתי נמי התם האי עובדא דדביתהו דרבה בר בר חנה", "commentary", None, "Mareh HaPanim links the two stories"),
  ],
  "reasoning": "This is a parallel in another work, not another witness to the Yerushalmi's wording. Its beneficiaries, its husband's name and Rav's answer all differ. The William Davidson English makes the daughter 'her daughter'; Rashbam's 'בתו' may mean Marta's daughter. That changes who the daughter's sons belong to.",
  "confidence": "high",
  "graph_effect": "Record as a separate parallel episode with its own local actors: Rabbah bar bar Hana's wife, Marta, the daughter's sons, Rav. Do not merge the Bavli's Marta or grandsons into the Yerushalmi's daughter. Linking the two husbands is an identity question (F14), not a fact of either text."
 },
 {
  "finding_id": "F14",
  "claim": "Guggenheimer argues that the Bavli's attribution (in his words 'Abba bar bar Ḥana') is correct and that the Yerushalmi's Abba bar Ḥana is the man the Bavli calls Abba bar bar Ḥana. His argument depends on biographical claims. It is the translator's historical inference, not something the text states. The Bavli text saved here reads 'רבה בר בר חנה', not 'Abba'.",
  "kind": "uncertainty",
  "evidence": [
   ev("S1", "There, the husband is Abba bar bar Ḥana. This is the correct attribution since Abba bar Ḥana, the elder R. Ḥiyya’s brother, died before the birth of his son, therefore also before his wife.", "translator_note", None, "Guggenheimer note 100"),
   ev("S1", "This proves that the person called Abba bar Ḥana in the Yerushalmi is called Abba bar bar Ḥana in the Babli.", "translator_note", None, "Guggenheimer note 100"),
   ev("S15", "אמר רבי בא בר חנה לא הוה רבי חייה חביבי פתר לה", "base_text", "Translation by this dossier: 'Rabbi Ba bar Hana said: Rabbi Hiyya, חביבי, explained it only as ...'", "Venice, Yerushalmi Bava Kamma 10:1 (the passage Guggenheimer cites)"),
   ev("S15", "Rebbi Abba bar Ḥanan said, my uncle Rebbi Ḥiyya explained this", "translation", None, "Guggenheimer English at 10:1 (spelled 'Ḥanan' there)"),
   ev("S12", "דביתהו דרבה בר בר חנה", "parallel", None, "Bavli Bava Batra 52a reads Rabbah, not Abba"),
  ],
  "reasoning": "A shared name, or a similar story, does not establish identity. The argument relies on outside claims that were not checked here: when Abba bar Hana died, and his relation to R. Hiyya. It also relies on 'חביבי' meaning 'my uncle' in 10:1, which is Guggenheimer's translation. 'רבה' and 'אבא' may be related name forms, but the saved Bavli text does not say 'Abba'. Guggenheimer is one editorial source, so his Hebrew and English are not two confirmations.",
  "confidence": "medium",
  "graph_effect": "Add only a provisional identity candidate: Yerushalmi 'Ba bar Hana' (this story) ~ Bavli 'Rabbah bar bar Hana' (Bava Batra 52a), proposer Guggenheimer, status unreviewed. Do not merge. The Bavli form 'bar bar Hana' would make Hana a grandfather, not a father, so it cannot be merged with this passage's child_of edge."
 },
 {
  "finding_id": "F15",
  "claim": "Guggenheimer compares Rav's principle ('a person is not given to lying at the time of death') to a statement of Rava in Bava Batra 175a. The wording there is different: Rava resolves that 'a person does not jest at the time of death'. The two are similar legal presumptions from different named speakers, with different verbs.",
  "kind": "interpretation",
  "evidence": [
   ev("S1", "אין אדם מצוי לשקר בשעת מיתה", "base_text", "Translation by this dossier: 'a person is not given to lying at the time of death'", "Venice 9:7:2, Rav"),
   ev("S13", "בתר דבעיא הדר פשטה אין אדם משטה בשעת מיתה", "parallel", "Translation by this dossier: 'after he asked it, he resolved it: a person does not jest at the time of death'", "Bavli Bava Batra 175a, Rava"),
   ev("S1", "A statement of Rava in the ", "translator_note", None, "Guggenheimer note 101"),
  ],
  "reasoning": "'לשקר' (to lie) and 'משטה' (to jest) are different claims about a dying speaker. The attribution differs as well (Rav here, Rava there).",
  "confidence": "high",
  "graph_effect": "Keep Rav's view claim as-is. At most add a 'similar principle' link between two statements. Do not reassign the speaker or treat it as one statement."
 },
 {
  "finding_id": "F16",
  "claim": "Pronouns in the father mishnah. 'ומת' ('and he died') is the father. The payer is the son who robbed and swore falsely. Whose 'sons or brothers' receive the payment is interpreted. Penei Moshe, Mareh HaPanim (following Rashi and Rambam) and Bartenura say the father's sons or brothers. Guggenheimer says the Yerushalmi leaves it undetermined.",
  "kind": "interpretation",
  "evidence": [
   ev("S1", "הגוזל את אביו ונשבע לו ומת הרי זה משלם קרן וחומש לבניו או לאחיו", "base_text", "Translation by this dossier: 'One who robs his father and swore to him, and he died: he pays principal and a fifth to his sons or to his brothers.'", "Venice 9:7:1"),
   ev("S6", "אביו ואחר מיתת האב הודה", "commentary", "Translation by this dossier: '[the one who died is] his father, and after the father's death he admitted'", "Penei Moshe 9:7:1:5"),
   ev("S6", "של אביו או לאחיו של אביו אם אין לו בנים", "commentary", "Translation by this dossier: '[the sons] of his father, or to his father's brothers if he has no sons'", "Penei Moshe 9:7:1:6"),
   ev("S7", 'משמעות לשון המשנה משמע כפי\' רש"י דלבניו אבני הנגזל קאי', "commentary", "Translation by this dossier: 'the plain sense of the mishnah fits Rashi: \"his sons\" refers to the sons of the one robbed'", "Mareh HaPanim 9:7:1:2"),
   ev("S1", "The father.", "translator_note", None, "Guggenheimer note 102, on who died"),
  ],
  "reasoning": "The Hebrew antecedents are ambiguous. The commentators checked agree on the father, and Guggenheimer's note 103 (quoted in F5) records the uncertainty. Everyone involved is a hypothetical legal role.",
  "confidence": "medium",
  "graph_effect": "Keep hypothetical son child_of father. Record the sons and brothers who receive payment as the father's sons (the robber's brothers) and the father's brothers under the commentary branch, with an undetermined branch per Guggenheimer. No named people."
 },
 {
  "finding_id": "F17",
  "claim": "The later codes checked (Rambam, Shulchan Arukh) make the dying-statement rule conditional on the bailee's trust ('if they are trusted by him ... otherwise to their heirs'). This follows the Bavli's two-branch form, not the Yerushalmi's plain instruction. Mareh HaPanim discusses the difference.",
  "kind": "interpretation",
  "evidence": [
   ev("S17", "וכולן שאמרו בשעת מיתתן של פלוני הם אם נאמנין לו יעשה כפירושן ואם לאו יחזיר ליורשיהם", "later_code", None, "Mishneh Torah, Borrowing and Deposit 7:10"),
   ev("S19", "ואם אמרה בשעת מיתתה של פלוני הם אם נאמנת לו יעשה כדבריה ואם לאו יתן ליורשיה", "later_code", None, "Shulchan Arukh, Even HaEzer 86:1"),
  ],
  "reasoning": "This concerns how the rule was received later. It does not change who is in the Yerushalmi passage.",
  "confidence": "high",
  "graph_effect": "None for people. It supports keeping the Yerushalmi and Bavli rule versions as separate statements."
 },
]

ALTERNATIVES = [
 {"id": "vehu_referent", "question": "Who is 'והוא' ('and he') in 'והוא אמר לית הוא אלא דידי'?",
  "branches": [
   {"id": "husband", "reading": "Rabbi Ba bar Hana, the husband, claims the item as his own.", "held_by": ["Penei Moshe 9:7:2:9 (S6)", "Guggenheimer English 'But he said no, they are mine' in context (S1)", "earlier pilot claim c11 (S0b)"]},
   {"id": "other_male_holder", "reading": "Some other male holder, such as a bailee, is speaking.", "held_by": ["No source checked holds this. It is listed only because the Hebrew has no explicit antecedent. It is disfavoured: the only prior male is the husband."]}
  ]},
 {"id": "kidusha_object", "question": "What is the 'קידושא' the wife assigns to her daughter?",
  "branches": [
   {"id": "jewellery", "reading": "A ring, nose-ring or earrings.", "held_by": ["Penei Moshe: nose-ring (S6)", "Sha'arei Torat Eretz Yisrael: earrings (S8)", "Guggenheimer: rings (S1)", "Jastrow's bracketed alternative (S20)"]},
   {"id": "betrothal_gift", "reading": "A betrothal gift or token.", "held_by": ["Jastrow sense 4 (S20)", "earlier pilot label (S0b)"]}
  ]},
 {"id": "witness_scope", "question": "What must happen before witnesses under Rabbi Ba bar Mamal's condition?",
  "branches": [
   {"id": "statement_before_witnesses", "reading": "The dying person's instruction must be made before witnesses.", "held_by": ["Noam Yerushalmi (S9)", "one possible parse of Penei Moshe (S6)"]},
   {"id": "delivery_before_witnesses", "reading": "The bailee must execute or deliver before witnesses.", "held_by": ["Guggenheimer note 99 (S1)", "another possible parse of Penei Moshe (S6)"]}
  ]},
 {"id": "minor_clause_order", "question": "Order of the minor clause in the baraita.",
  "branches": [
   {"id": "as_printed", "reading": "Return to him; if he died, to his father; and make an investment.", "held_by": ["Venice, Mechon-Mamre, Guggenheimer Hebrew (S1)"]},
   {"id": "tosefta_order", "reading": "Make an investment; if he died, return to his father.", "held_by": ["Tosefta (S10)", "proposed by Penei Moshe (S6), Sha'arei Torat Eretz Yisrael (S8) and Guggenheimer note 97 (S1)"]}
  ]},
 {"id": "heirs_of_father", "question": "Whose sons or brothers receive payment in the father mishnah?",
  "branches": [
   {"id": "fathers", "reading": "The robbed father's sons, otherwise his brothers.", "held_by": ["Penei Moshe (S6)", "Mareh HaPanim after Rashi and Rambam (S7)", "Bartenura English (S14)", "William Davidson and Kulp Mishnah translations (S14)"]},
   {"id": "undetermined", "reading": "The Yerushalmi does not settle whose.", "held_by": ["Guggenheimer note 103 (S1)"]}
  ]},
 {"id": "husband_identity", "question": "Is the Yerushalmi's Ba bar Hana the same person as the Bavli's Rabbah bar bar Hana in the parallel story?",
  "branches": [
   {"id": "same_person_proposed", "reading": "The same man; the Bavli form is correct.", "held_by": ["Guggenheimer note 100 (S1)"]},
   {"id": "not_decided", "reading": "The texts attribute a similar story to differently formed names. Identity is not established by this evidence.", "held_by": ["this dossier"]}
  ]},
]

UNRESOLVED = [
 "Is the daughter also Rabbi Ba bar Hana's daughter? The text gives only the mother's relation, in her own voice.",
 "How was the case resolved? Rav's principle implies the wife is believed (Penei Moshe), but no ruling or transfer is stated.",
 "Who brought the case to Rav? 'אתא עובדא' ('the case came') names no one. The Bavli parallel implies the husband came.",
 "Where was the item? The story does not say whether it was deposited with a third party, as in the baraita, or held by the husband. How the story fits the baraita's deposit setting is therefore interpretive.",
 "The Leiden manuscript and other Yerushalmi witnesses were not checked for the name forms or 'קידושא'.",
 "Korban HaEdah and Sheyarei Korban on this halakhah were not obtained. They did not appear in the Sefaria link list for 9:7:2. That does not show they have no comment.",
 "Lieberman's discussion of 'פירוש לפירושו' in Tosefta Kifshutah is cited by Guggenheimer but was not read.",
 "Whether the unqualified 'Rav' here is the Babylonian amora Rav is a historical-identity question. It was not decided here.",
]

CORRECTIONS = [
 {"existing_claim_id": None, "change": "Add a second scenario for the stolen-deposit dialogue in s2 (9:7:1). Give it its own local depositor and keeper roles, a question, the answer 'נגנב' ('stolen'), the oath and amen, witnesses testifying 'שגנבו' ('that he stole it'), and consequence claims: double payment with witnesses; principal, fifth and guilt offering with self-admission.", "why": "F1, F2 and the earlier review's miss (index 3). The stolen case has different testimony and payment and is a separate numbered mishnah."},
 {"existing_claim_id": "c24, c25, c26, c27", "change": "Scope these to scenario 'lost-claim' explicitly. Add consequence claims: principal only with witnesses; principal, fifth and guilt offering with self-admission.", "why": "F2. Prevents the stolen case from inheriting the first dialogue's roles or outcomes."},
 {"existing_claim_id": "c21, c22", "change": "Add return-obligation claims: generic bailee returns to the woman (alive) or her husband (dead); to the slave (alive) or his master (dead); to the minor (alive) or his father (dead), with a safe investment. Add the prohibition on accepting deposits from women, slaves and minors as a stated rule. Add a master relation for generic_slave and master. Mark all as hypothetical.", "why": "F6 and the earlier review's miss (index 4)."},
 {"existing_claim_id": None, "change": "Add a rule claim: dying instruction 'יינתנו לפלוני' ('let them be given to So-and-so') is to be carried out (Yerushalmi reading), with an alternative-readings note that the Bavli's parallel phrase means the opposite branch.", "why": "F8."},
 {"existing_claim_id": "daughter_property (entity label)", "change": "Change 'This is my daughter’s betrothal property' to a neutral label: 'This item (קידושא) is my daughter's'. Record the jewellery and betrothal-gift alternatives.", "why": "F11. Most sources read jewellery; the betrothal gloss risks inventing a betrothal event."},
 {"existing_claim_id": "c15", "change": "Keep basis 'interpretation', but lower reading_confidence to medium. Cite Penei Moshe 9:7:2:7 and 9:7:2:10 as the source of the inference.", "why": "F10. The ruling for the wife is implicit."},
 {"existing_claim_id": "c11", "change": "Keep the coreference of 'והוא' with ba_hana. Add Penei Moshe 9:7:2:9 as supporting commentary evidence.", "why": "F10 and alternative 'vehu_referent'."},
 {"existing_claim_id": "c8", "change": "Mark c8 (witness_rule attributes_to ba_mamal) as a derived view of c7, not a second observation. Or drop it.", "why": "Same words and same relation. An inverse or duplicate display is not independent evidence."},
 {"existing_claim_id": "m7, m8", "change": "Change mention kind from 'name' to 'description' (a kinship description): 'איתת דרבי בא בר חנה' ('the wife of Rabbi Ba bar Hana') and 'ברתי' ('my daughter') are not names.", "why": "F10. Neither person is named."},
 {"existing_claim_id": "ba_hana, hana, zevida (entities)", "change": "Add name-form variants: בר חנא (Mechon-Mamre); ר' זביד' (Mechon-Mamre); English 'Abba' for בא (Guggenheimer). Keep each as the same local person.", "why": "F9 and F12."},
 {"existing_claim_id": None, "change": "Add a provisional identity candidate (not a merge): the local ba_hana in this story and the Bavli Bava Batra 52a 'רבה בר בר חנה'. Proposer: Guggenheimer note 100. Status: unreviewed.", "why": "F13 and F14. Keeps the proposal and its authority visible without merging people."},
 {"existing_claim_id": None, "change": "Add father-mishnah pronoun resolutions: 'ומת' refers to the father; recipients are the father's sons or brothers under the commentary branch.", "why": "F16. The earlier open question about whose sons and brothers is answered by commentary, with Guggenheimer dissenting as undetermined."},
 {"existing_claim_id": "episode.coverage", "change": "Change 'complete_for_supplied_text' to partial, or add the missing claims above.", "why": "The earlier review. The stolen case, return rules and father-mishnah consequences were not extracted."},
]

LESSONS = [
 "Repeated mishnah cases with the same frame ('Where is my deposit? ...') are separate hypothetical scenarios. Roles need a scenario scope so the keeper of case 1 is not the keeper of case 2.",
 "A legal consequence depends on a condition: the claim made (lost or stolen) and how the lie comes out (witnesses or self-admission). The contract needs a conditional-consequence claim, not only person-to-person relations.",
 "A halakhah heading ('איכן פקדוני ... כו'') cites a mishnah unit. It is not a new speech event.",
 "A story introduced by 'כהדא' ('like this case') illustrates a rule. Its named actors do not fill the rule's generic roles (woman, husband, bailee, So-and-so) unless the text maps them.",
 "A parallel story in another Talmud with different names, beneficiaries and ruling is a separate episode. It is not corroboration of each detail and not a basis for merging actors.",
 "An uncertain lexical gloss can create people or events that are not there (for example, a betrothal and a groom). Object labels should stay neutral when glosses disagree.",
 "A patronymic of the form 'bar bar X' encodes a grandparent. Two name forms for one story can yield incompatible kinship edges, which is another reason not to merge on name similarity.",
 "A translator's historical note is an identity or biography proposal from that translator. Store it with its authority, separate from the text's own evidence.",
]
