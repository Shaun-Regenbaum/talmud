import json, os
# Findings for challenge-03 (Bava Batra 152b:7). Written as Python so Hebrew quotation marks need no JSON escaping.
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def ev(sid, q): return {"source_id": sid, "exact_quote": q}

F = []
def f(fid, claim, kind, evidence, reasoning, confidence, graph_effect, translation=None):
    d = {"finding_id": fid, "claim": claim, "kind": kind, "evidence": evidence, "reasoning": reasoning,
         "confidence": confidence, "graph_effect": graph_effect}
    if translation: d["translation (this dossier)"] = translation
    F.append(d)

f("F1", "Both 'concessions' in 152b:7 are the anonymous Gemara's hypothetical reasoning ('one might say'), and the closing צריכא rejects them. Neither Rav nor Shmuel is reported as conceding anything.",
  "textual",
  [ev("S1", "צריכא דאי איתמר בהא בהא קאמר רב משום דקנו מיניה אבל בהא דלא קנו מיניה אימא מודה ליה לשמואל"),
   ev("S1", "אבל בהך אימא מודה ליה לרב צריכא"),
   ev("S1", "one might <b>say</b> that <b>he concedes to Shmuel."),
   ev("S11", "על כן <b>צריכא</b> <small>[צריך]</small> שייאמרו שתי המחלוקות.")],
  "אימא ('say', i.e. one might suppose) marks a supposition by the Gemara's own voice. The sentence explains why both disputes had to be recorded; the conclusion is that each concession would have been a mistaken inference. The Davidson English and the Steinsaltz Hebrew are one editorial work, so they count as one reading here.",
  "high",
  "Keep c6 and c7 as hypothetical and rejected. Their voice is the anonymous Gemara, not a report of what Rav or Shmuel said. No actual agreement or retraction edge between Rav and Shmuel.",
  "It is necessary: had it been stated in that case, [one would say] Rav says so there because they performed an act of acquisition with him, but in this case where they did not, say he concedes to Shmuel ... but in that one, say he concedes to Rav. It is necessary.")

f("F2", "In the first half of the צריכא, the first בהא is the earlier case (a gift with an act of acquisition, 152a). 'בהא דלא קנו מיניה' is the present case (wrote and conferred, no act of acquisition). Every commentary and translation checked here that addresses the point reads it this way (Rashbam, Tosafot, Rabbeinu Gershom, Soncino, Davidson/Steinsaltz). One printed note to Rabbeinu Gershom proposes an emendation that makes this explicit.",
  "interpretation",
  [ev("S7", "אבל בהך - בתרייתא דלא קנו מיניה"),
   ev("S10", "בההיא דלעיל קאמר רב ארכבוה אתרי ריכשי. משום דקנו מיניה וכתבו לו קנין אבל בהא דכתב וזיכה לו דלא קנו מיניה"),
   ev("S10", "נראה דצ\"ל דאי איתמר בהא. בההוא דלעיל בהא קאמר רב וכו'."),
   ev("S34", "Since there was no symbolic acquisition."),
   ev("S34", "Where symbolic acquisition did take place.")],
  "The printed text uses בהא for both cases in the first half. Only the clauses משום דקנו מיניה and דלא קנו מיניה tell them apart. Rashbam's lemma reads בהך where the Wikisource text has בהא דלא קנו מיניה. That is a small lemma difference, recorded as a text-witness detail only. The Gershom footnote is a later proposed emendation ('נראה דצ\"ל', 'it seems one should read'), not a manuscript reading.",
  "high",
  "c6 content = the present zikkui case (the pilot's secondwins); c7 content = the earlier 152a case (the pilot's prior). Both assignments match the pilot. The emendation should be stored as a proposed emendation, separate from source variants.")

f("F3", "The earlier dispute that 152b:6-7 refers to (152a:1-3) does not set Rav's plain ruling against an opposite plain ruling by Shmuel. In the Wikisource/Davidson text, Rav's side is reported by 'בי רב' in Rav's name, and Shmuel's side is doubt: 'I do not know what I should rule'. Witnesses differ on the chain: Rif and the Shita Mekubetzet lemma quote Rav directly, and Rashbam's lemma has 'בי רב אמרי' without 'in Rav's name'.",
  "textual",
  [ev("S2", "איתמר מתנת שכיב מרע שכתוב בה קנין בי רב משמיה דרב אמרי ארכביה אתרי ריכשי ושמואל אמר לא ידענא מאי אדון בה"),
   ev("S2", "In <b>the study hall of Rav they say in the name of Rav:</b>"),
   ev("S16", "רב אומר ארכבה אתרי ריכשי"),
   ev("S30", "איתמר מתנת שכיב מרע שכתוב בה קנין רב אמר ארכבה אתרי רכשי שמואל אמר לא ידענא מה אידון בה"),
   ev("S8", "מתנת שכיב מרע שכתוב בה קנין בי רב אמרי ארכביה כו'"),
   ev("S7", "והא איפליגו בה חדא זימנא - לעיל במתנת שכיב מרע שכתוב בה קנין דרב אמר ארכבה אתרי ריכשי")],
  "When 152b:6-7 says simply 'Rav' about the earlier case, it compresses a report that the Wikisource text gives through the school of Rav. The Rif and the Shita Mekubetzet are later works quoting the Gemara. Their wording is a different evidence type (a citation or lemma witness) from the Wikisource/Vilna printed text. Shmuel's stance there is uncertainty ('לא ידענא מאי אדון בה'), which his dispute with Rav in 152b:5 does not reproduce.",
  "high",
  "The pilot's prior statement should carry its transmission: בי רב → in the name of Rav (Wikisource), with separate variant branches (Rav directly; בי רב without 'in Rav's name'). Record Shmuel's view in the prior case as doubt, not as 'second acquires'. This recovers the earlier rule the pilot marked as missing.",
  "It was said: a dying man's gift in which an act of acquisition is written. The school of Rav say in Rav's name: he mounted him on two steeds. And Shmuel said: I do not know how to rule on it.")

f("F4", "Tosafot hold that the Shmuel half of the צריכא is not really needed, because Shmuel's two rulings do not run parallel and the objection targets Rav only. Rashba repeats the difficulty, calls Tosafot's answer strained, and leaves it open ('ועדיין צריכא עיון').",
  "interpretation",
  [ev("S9", "ומיהו משמואל לא קשיא מידי"),
   ev("S9", "למילתא דשמואל אין צריך כאן שום צריכותא"),
   ev("S19", "ובתוספות דוחקין דאדרב בלחוד קא מקשה"),
   ev("S19", "אבל קושטא דמלתא לשמואל הפוכין הן בדיניהן. ועדיין צריכא עיון.")],
  "The Gemara's balanced form (Rav half, Shmuel half) does not prove that Shmuel's positions in the two cases are parallel. Two major commentators question that half, and one leaves the question unresolved.",
  "medium",
  "Do not derive any Shmuel-Rav similarity or consistency edge from the Shmuel half of 152b:7. Save it as a rhetorical hypothetical whose necessity is disputed (Tosafot; Rashba unresolved).",
  "Tosafot: 'But from Shmuel there is no difficulty at all' / 'for Shmuel's matter no necessity-argument is needed here'. Rashba: 'but in truth, for Shmuel his rulings are reversed; and it still needs study'.")

f("F5", "The meaning of זיכה ('conferred') in the Rav-Shmuel case is disputed, and the commentators name different people for the explanations. Rashbam: he handed over the deed. Rabbeinu Yitzhak bar Meir (in Tosafot) objects. Tosafot: he conferred the property through another person, recorded in the deed. Ramban credits 'the Sages of Spain' with 'go, take hold of the property and acquire', while Rashba credits the same explanation to 'the Geonim'. Raavad (via Shita Mekubetzet): conferring the property itself. Rabbeinu Gershom: 'go and take possession before me'.",
  "interpretation",
  [ev("S7", "כתב וזיכה לזה - כתב כל נכסיו לראובן ומסר לו את השטר לראיית זכותו"),
   ev("S9", "פירש רבינו שמואל זיכה שמסר לו את השטר וקשה לרבינו יצחק בר מאיר"),
   ev("S9", "אלא זיכה היינו שזיכה בו את הנכסים וכתב לו בשטר שזיכה לו ע\"י אחר"),
   ev("S18", "ורבני ספרד ז\"ל פירשו בדאמר ליה לך חזק בנכסים וקני"),
   ev("S19", "והגאונים ז\"ל פרשו בדאמר ליה לך חזק בנכסים וקני"),
   ev("S29", "פירוש זיכה הנכסים כמי זכו בשדה זו לפלוני"),
   ev("S10", "כתב וזיכה לזה. שא\"ל לך וזכה בה לפני"),
   ev("S34", "wrote [a deed of the gift] and handed"),
   ev("S1", "conferred possession</b> of the same property")],
  "The legal mechanism does not change who holds which ruling. It does change what the pilot's statement labels say. The Soncino rendering 'handed' follows the Rashbam line; the Davidson 'conferred possession' leaves the mechanism general.",
  "high",
  "Keep firstwins/secondwins labelled as 'wrote and conferred (זיכה)' with the mechanism open. When commentators are cited as sources of a reading, keep Ramban's attribution ('Sages of Spain') and Rashba's ('Geonim') separate. Do not merge them.")

f("F6", "In 152b:5 the reasons ('it is like a healthy person's gift' / 'like a dying man's gift') come in the Gemara's restatement of the two rulings. The Davidson edition and Steinsaltz present them as the Gemara's explanation. The text does not show whether Rav and Shmuel themselves stated these reasons.",
  "uncertainty",
  [ev("S1", "רב אמר ראשון קנה הרי היא כמתנת בריא ושמואל אמר שני קנה הרי היא כמתנת שכיב מרע"),
   ev("S1", "The Gemara explains: <b>Rav says</b>"),
   ev("S11", "ומסבירים את טעמיהם")],
  "The rulings ('first acquires' / 'second acquires') are attributed outright in 152b:4. Segment 5 repeats each ruling with a reason attached. That is a common way the Gemara explains a view, and it is ambiguous between quoting and explaining. The two editorial notes come from one editorial work.",
  "medium",
  "Split c3/c4 into (a) the ruling, attributed to Rav or Shmuel (explicit), and (b) the reason, attributed in the Gemara's explanation (voice uncertain).")

f("F7", "Rav Dimi explicitly said 'a later testament cancels an earlier testament' when he came. The text does not say where he came from or went to. It is the anonymous Gemara that identifies the 'wrote to this one and wrote to that one' case with his teaching. The same statement by Rav Dimi appears at Bava Batra 135b in another context. The Jerusalem Talmud has the same wording as a baraita in the name of Rabban Shimon ben Gamliel.",
  "textual",
  [ev("S1", "פשיטא כתב לזה וכתב לזה היינו דכי אתא רב דימי אמר דייתיקי מבטלת דייתיקי"),
   ev("S1", "<b>As when Rav Dimi came</b> from Eretz Yisrael to Babylonia"),
   ev("S11", "<b>רב דימי</b> מארץ ישראל לבבל"),
   ev("S34", "R. Dimi enunciated when he came"),
   ev("S32", "מאי תיבדק כי אתא רב דימי אמר דייתיקי מבטלת דייתיקי"),
   ev("S33", "תני רבן שמעון בן גמלי' אומר דייתיקי מבטלת דייתיקי")],
  "'From Eretz Yisrael to Babylonia' is an editorial supplement in the Davidson/Steinsaltz work. Soncino says only 'when he came'. At 135b the statement answers 'what is תיבדק' in Rabbi Yohanan's ruling. That context might suggest Rav Dimi was reporting a Palestinian tradition, but neither 135b nor 152b says he received it from anyone. The Jerusalem Talmud baraita comes from another corpus. It is a parallel attribution, not a variant of this Bavli sentence, and it does not show that Rav Dimi was quoting Rabban Shimon ben Gamliel.",
  "high",
  "Keep c1 (Rav Dimi says the dictum) and c2 (the arrival) as explicit, with no origin or destination. Add a separate claim that the anonymous Gemara applies the dictum to the 'wrote to this one, wrote to that one' case. Add no transmission edge from Rabbi Yohanan or Rabban Shimon ben Gamliel to Rav Dimi.",
  "It is obvious: wrote to this one and wrote to that one - that is [the case of] what Rav Dimi said when he came: a testament cancels a testament.")

f("F8", "Rav Yirmeya bar Abba is the named reporter ('אמר') of the Pumbedita version. The pilot uses him only as a claim 'voice' and records no speech or transmission claim with him as subject. Witnesses give his name differently: 'רב ירמיה בר אבא' (Wikisource), 'ר' ירמי' בר אבא' (Tosafot Rid lemma), 'א\"ר ירמיה בר אבא' (Rif), and 'רב ירמיה' without patronymic (Rosh as quoted in Shita Mekubetzet). On the next page (153a:8), Rav Nahman sends a case to 'ר' ירמיה בר אבא' in Shum Tamya.",
  "textual",
  [ev("S1", "בפומבדיתא מתנו הכי אמר רב ירמיה בר אבא שלחו ליה מבי רב לשמואל"),
   ev("S14", "אמר ר' ירמי' בר אבא שלחו מבי רב לשמואל"),
   ev("S16", "א\"ר ירמיה בר אבא שלחו ליה מבי רב לשמואל"),
   ev("S29", "מדאמר רב ירמיה בסמוך שלחו מבי רב לשמואל"),
   ev("S3", "שדריה לקמיה דר' ירמיה בר אבא לשום טמיא"),
   ev("S3", "אמר הכא אתרא דשמואל היכי נעביד כוותיה דרב")],
  "The reporter is explicit. 'בר אבא' gives a father named Abba, so the pilot's child_of claim (c8) and the parent placeholder stay, under the project rule. The man at 153a:8 has the same name and is placed in the same sugya. Rav Nahman sends him a case so that a ruling following Rav can be given there, which fits someone tied to Rav's rulings. But a shared name does not establish identity, and 153a:8 does not state any teacher-student link.",
  "high",
  "Add a claim: Rav Yirmeya bar Abba says / reports the correspondence (speech/transmission family, branch pumb_report). Keep c8 child_of Abba, with Abba as a local placeholder. Add the 153a:8 person as a coreference candidate only, not a merge. Record the title and patronymic variants as name-form evidence.",
  "In Pumbedita they taught it thus: Rav Yirmeya bar Abba said: they sent to Shmuel from the house of Rav ...")

f("F9", "'Rav Yirmeya bar Abba said: they sent to Shmuel from the house of Rav, let our teacher teach us' is a recurring formula. The same opening appears at Gittin 66b, Gittin 89b and Shevuot 46a. At Sanhedrin 24b the same Sura/Pumbedita layout gives a different reporter (Rav Hanina bar Shelemya) and the same answer formula 'אין לאחר קניין כלום'.",
  "textual",
  [ev("S21", "אמר רב ירמיה בר אבא שלחו ליה מבי רב לשמואל ילמדנו רבינו יצא עליה קול מראשון"),
   ev("S21", "א\"ר ירמיה בר אבא שלחו ליה מבי רב לשמואל ילמדנו רבינו אמר לשנים כתבו ותנו גט לאשתי"),
   ev("S21", "א\"ר ירמיה בר אבא שלחו ליה מבי רב לשמואל ילמדנו רבינו אומן אומר"),
   ev("S24", "בסורא מתני הכי בפומבדיתא מתני הכי א\"ר חנינא בר שלמיה שלחו ליה מבי רב לשמואל ילמדנו רבינו לפני גמר דין וקנו מידו מאי שלח להו אין לאחר קניין כלום")],
  "The Gittin and Shevuot hits come from the Sefaria search-index snapshot (S21). Their full pages were not fetched for this case. The Sanhedrin page was fetched (S24). A repeated formula is a literary pattern of transmission. It is not evidence that these questions formed one historical exchange, and the same answer wording in two tractates does not make two passages one event.",
  "high",
  "Do not merge the Bava Batra and Sanhedrin correspondences, or their reporters, into one event. Rav Yirmeya bar Abba's link to this sending formula recurs across tractates, which is useful for later identity work only as a pattern. It is not an identity or relationship proof.")

f("F10", "'מבי רב' is a group whose name contains Rav ('the house of Rav'). Translators render it 'the academy' (Soncino), 'the study hall of Rav' (Davidson), or 'Rav's study house' (Steinsaltz). Davidson and Steinsaltz add 'after the death of Rav', and Soncino adds a bracketed alternative 'after Rab's death in 247'. The Hebrew text says nothing about Rav's death, and none of the traditional commentaries checked here says so at this place.",
  "interpretation",
  [ev("S1", "שלחו ליה מבי רב לשמואל ילמדנו רבינו"),
   ev("S1", "After the death of Rav, the following question <b>was sent from the study hall of Rav to Shmuel:"),
   ev("S11", "לאחר מותו של רב"),
   ev("S34", "was sent from the academy"),
   ev("S34", "[Or, 'from the school of Rab', after Rab's death in 247.]")],
  "The 'after Rav's death' reading, and its date, are historical inference from translators and editors. Davidson and Steinsaltz are one editorial work. Soncino marks the idea as an alternative in brackets. The commentaries checked on this line were Rashbam, Tosafot, Rabbeinu Gershom, Yad Ramah, Ri Migash, Tosafot Rid, Ramban, Rashba and Shita Mekubetzet. None states it here. That finding covers only those files. 'רבינו' ('our teacher') is how the senders address Shmuel. On its own it does not establish a student relationship.",
  "high",
  "Add the group→Rav link as a name-embedded affiliation (literal 'house of Rav'; academy vs household vs disciples left open). Add no student_of edge from the senders to Shmuel or Rav, no time scope 'after Rav's death', and no date.")

f("F11", "Tosafot report Rabbeinu Tam's view, which Rashi shares, that 'אמרי בי רב' means Rav Huna unless Rav Hamnuna is evident. This concerns the phrase 'בי רב ... אמרי' (as at 152a:1). It is not about the senders 'שלחו ליה מבי רב' at 152b:8.",
  "interpretation",
  [ev("S9", "ועוד דאמרי בי רב הכא ואמרי בי רב היינו רב הונא כמו שמפרש ר\"ת"),
   ev("S9", "וגם רש\"י סובר כן דהיינו רב הונא היכא דלא מוכח שהוא רב המנונא")],
  "This is an interpretive convention reported by one school of commentators, used here in an argument about the halakhah. It is not an explicit statement in the Gemara.",
  "medium",
  "Record it as a commentary-sourced identity candidate (בי רב at 152a:1 → Rav Huna), kept separate from text evidence and not applied to the 152b:8 senders.")

f("F12", "How far back does 'בסורא מתנו הכי' ('in Sura they taught thus') reach? Rashbam reports that some explain it as reaching the first dispute (152a). He rejects that view and says, with Rabbeinu Chananel, that it refers to the immediately preceding Rav-Shmuel dispute about 'wrote and conferred'. Tosafot Rid reads the Sura and Pumbedita versions as disagreeing. Rabbeinu Gershom glosses only 'as said above'.",
  "interpretation",
  [ev("S7", "בסורא מתנו הכי - אית דמפרשי אדלעיל קאי אפלוגתא קמייתא דמתנת שכיב מרע שכתוב בה קנין"),
   ev("S7", "אלא אהך דסליק מיניה קאי דפליגי רב ושמואל בכתב וזיכה לזה וכתב וזיכה לזה וכן פר\"ח"),
   ev("S14", "משמע דפליגי סוריא ופומבדיתא"),
   ev("S10", "בסורא מתנו הכי כדאמר לעיל"),
   ev("S34", "At Sura they taught as above")],
  "The pilot rightly left the backward reach uncertain. The commentaries give it two named options: 'some explain' (152a) versus Rashbam and Rabbeinu Chananel (152b:4-7). Rav Dimi's line is not in dispute either way.",
  "high",
  "The sura_report branch covers at least the 'wrote and conferred' dispute and its צריכא (152b:4 second half through 152b:7). Keep an alternative in which it also covers the 152a dispute. Rav Dimi stays shared.")

f("F13", "The witnesses word the Pumbedita question differently. Wikisource: a dying man wrote all his property to others and they performed an act of acquisition with him. Rif: he wrote and conferred, and they performed an act of acquisition, with a footnote giving the Gemara's other wording. Tosafot Rid: 'some books' read 'and conferred on the first and they performed an act of acquisition'. Rashbam's paraphrase, following Rabbeinu Chananel, is 'wrote and conferred on the first'. Rabbeinu Gershom: an act of acquisition without writing, then given to another. The answer also varies: 'אין אחר קנין' (Wikisource) versus 'אין לאחר קנין' (Rif, Rambam).",
  "textual",
  [ev("S1", "ילמדנו רבינו שכיב מרע שכתב כל נכסיו לאחרים וקנו מידו מהו שלח להו אין אחר קנין כלום"),
   ev("S16", "וזיכה וקנו מידו מהו שלח להו אין לאחר קנין כלום"),
   ev("S16", "בגמ' איתא ש\"מ שכתב כל נכסיו לאחרים וקנו מידו מהו כו' (ג\"א)"),
   ev("S14", "יש ספרים שכתב בהן וזיכה לראשון וקנו מידו דאיכא תרתי זיכוי וקנין"),
   ev("S7", "בפומבדיתא מתנו שלחו מבי רב לשמואל ילמדנו רבינו כתב וזיכה לראשון וקנו מידו מאי"),
   ev("S10", "קנו מידו בלא כתיבה וחזר ונתנו לאחר מהו"),
   ev("S17", "אֲבָל שְׁכִיב מֵרַע שֶׁכָּתַב וְזִכָּה וְקָנוּ מִיָּדוֹ אֵין לְאַחַר קִנְיָן כְּלוּם"),
   ev("S34", "[but was not entered in the deed]")],
  "These are different evidence types. The Wikisource line is a printed text. The Rif line is a medieval digest's text with a later printed note. 'יש ספרים' in Tosafot Rid reports manuscripts he saw. Rashbam and Rabbeinu Gershom paraphrase. Rambam codifies. Soncino's bracket follows Rabbeinu Gershom. None of these changes who asks or answers. They change what Shmuel is said to rule on in the Pumbedita branch.",
  "high",
  "The pilot's question statement should record the Wikisource wording as the text and link the other wordings as variant or interpretive branches of the question's content. The sender (בי רב), addressee (Shmuel) and reporter (Rav Yirmeya bar Abba) stay the same across them.")

f("F14", "Under the readings checked, Shmuel's Pumbedita answer means the gift cannot be withdrawn once the act of acquisition is done: the first recipient keeps it. That outcome matches Rav's 'first acquires' in the Sura version, but it may concern a different set of facts (with an act of acquisition, or with conferring plus acquisition).",
  "interpretation",
  [ev("S10", "וראשון קנה שני לא קנה"),
   ev("S34", "the first donee acquires the legal ownership of the gift"),
   ev("S7", "קנה ואין יכול לחזור במתנתו וכ\"ש להקנותו לאחר"),
   ev("S9", "שלח ליה אין אחר הקנין כלום ואין יכול לחזור בו"),
   ev("S1", "רב אמר ראשון קנה")],
  "A shared outcome is not stated agreement. The text never says Shmuel agreed with Rav or changed his mind. It gives two school versions.",
  "medium",
  "Keep Shmuel's Sura-branch view (second acquires) and his Pumbedita-branch answer (nothing after acquisition) as separately branched claims. Add no 'Shmuel agrees with Rav' or 'Shmuel retracted' edge.")

f("F15", "The Pumbedita report continues onto 153a:1. Unnamed people 'understood from it' that the rule applies only to giving to another. Rav Hisda said to them that when Rav Huna came from Kufri he explained it applies both to oneself and to others. The pilot job ends at 152b:8, so it lacks these people. Davidson identifies the unnamed group as 'Rav's disciples', which the Hebrew does not say. A later quotation (Bach) reads 'מבי כופר' for 'מכופרי'.",
  "textual",
  [ev("S3", "סבור מיניה הני מילי לאחר אבל לעצמו לא אמר להו רב חסדא כי אתא רב הונא מכופרי פירשה בין לעצמו בין לאחרים"),
   ev("S3", "Rav’s disciples <b>understood from this</b>"),
   ev("S31", "סבור מיניה הני מילי - דאין לאחר קנין כלום"),
   ev("S13", "אמר להו רב חסדא כי אתא רב הונא פירש' בין לעצמו בין לאחר"),
   ev("S21", "כי אתא רב הונא מבי כופר")],
  "Rashbam's lemma ties 'סבור מיניה' to Shmuel's answer 'אין לאחר קנין כלום', which exists only in the Pumbedita version. So this continuation depends on the Pumbedita branch. That dependency is an interpretation, but a well-grounded one. The subject of סבור מיניה is unnamed. Treating it as the בי רב senders is an editorial inference.",
  "medium",
  "Add, scoped to pumb_report: Rav Hisda speaks to an unnamed group (explicit). Rav Hisda reports that Rav Huna, arriving from Kufri, explained Shmuel's ruling (explicit report). Record the unnamed group as an unresolved coreference candidate with בי רב, not a merge.",
  "They understood from it: this applies [only] to another, but not to himself. Rav Hisda said to them: when Rav Huna came from Kufri he explained it: both to himself and to others.")

f("F16", "The Gemara itself links the disputants of 152a and 152b ('they already disagreed about this once'). That is textual support for treating 'Rav' and 'Shmuel' as the same local persons across this sugya. The earlier contradiction at 152a:4 also names Rav's other statement through a sending chain: Ravin, in the name of Rabbi Abbahu, reports that Rabbi Elazar sent a ruling 'in the name of our teacher'. The Gemara counts that ruling as Rav's ('דרב אדרב').",
  "textual",
  [ev("S1", "והא אפליגו בה חדא זימנא במתנת שכיב מרע שכתוב בה קנין"),
   ev("S2", "ורמי דרב אדרב ודשמואל אדשמואל דשלח רבין משמיה דרבי אבהו הוו ידעי ששלח ר' אלעזר לגולה משום רבינו"),
   ev("S2", "<b>in the name of our teacher,</b> Rav")],
  "The link inside the sugya is the Gemara's own claim. It supports local coreference only, not a historical biography. The 152a:4 chain lies outside the pilot window. The identification of 'רבינו' as Rav rests on the Gemara's framing ('דרב אדרב') and on the Davidson gloss.",
  "high",
  "Local coreference of Rav and Shmuel between 152a and 152b is supported by the text. Chains from wider context (Ravin ← Rabbi Abbahu ← Rabbi Elazar ← 'our teacher' = Rav) belong to 152a's job, marked as context and not added to this passage's claims.")

f("F17", "Context persons just before the pilot window, 152b:1-3 (with 152a:7): Rav Nahman bar Yitzhak questions Rava. Rava answers ('where he enhances his power'). Rav Hisda defines the formula. Rav Yehuda reports Shmuel's ruling. The one who gestured ('ואחוי ליה בידיה') is unnamed in 152b:1. The Davidson edition supplies Rav Nahman.",
  "textual",
  [ev("S1", "כי קם אמר רב נחמן בר יצחק לרבא מאי אחוי לך אמר ליה במיפה את כחו"),
   ev("S1", "היכי דמי מיפה את כחו אמר רב חסדא וקנינא מיניה מוסיף על מתנתא דא"),
   ev("S2", "יתיב רב נחמן בר יצחק אחוריה דרבא ויתיב רבא קמיה דרב נחמן קא בעי מיניה"),
   ev("S2", "והא אמר רב יהודה אמר שמואל שכיב מרע שכתב כל נכסיו לאחרים אף על פי שקנו מידו עמד חוזר")],
  "These people lie outside the pilot's five segments. Recording them here keeps the next reader from treating their absence from the window as absence from the passage. Identifying the gesturer comes from 152a:7 ('רבא קמיה דרב נחמן'), which is local coreference.",
  "high",
  "No change to this job's claims. Flag these people for the neighbouring job (152a:7-152b:3), so that they are not lost.")

alternatives = [
    {"id": "A1", "question": "How far back does 'בסורא מתנו הכי' reach?",
     "readings": [
         {"reading": "Only the immediately preceding Rav-Shmuel dispute about 'wrote and conferred' (and its צריכא)", "held_by": "Rashbam; Rabbeinu Chananel as cited by Rashbam"},
         {"reading": "Back to the first dispute (gift with an act of acquisition, 152a)", "held_by": "'some explain' (אית דמפרשי), as reported and rejected by Rashbam"}],
     "evidence": [ev("S7", "אית דמפרשי אדלעיל קאי"), ev("S7", "וכן פר\"ח")], "status": "open; Rashbam's reading is better supported in the works checked"},
    {"id": "A2", "question": "Do the Sura and Pumbedita versions disagree, or can both be used?",
     "readings": [
         {"reading": "They disagree (two versions of the same material)", "held_by": "Tosafot Rid"},
         {"reading": "Both rulings are used side by side: zikkui alone follows Shmuel (last acquires), zikkui plus act of acquisition cannot be withdrawn", "held_by": "Rif and Rambam (as codified; this is how the dossier reads their codification, not their stated view on the Sura/Pumbedita question)"},
         {"reading": "The question from בי רב presupposes Shmuel's known ruling that the second acquires, and asks about adding an act of acquisition", "held_by": "Yad Ramah (as this dossier reads him)"}],
     "evidence": [ev("S14", "משמע דפליגי סוריא ופומבדיתא"), ev("S16", "והלכתא כשמואל בסורא מתנו הכי"), ev("S12", "שמעינן ליה לשמואל דקאמר שני קני, ועלה הוא דשלחו ליה מבי רב לשמואל")],
     "status": "open; historical_compatibility unknown"},
    {"id": "A3", "question": "What case is the Pumbedita question about?",
     "readings": [
         {"reading": "All property written to others, with an act of acquisition", "held_by": "Wikisource/Vilna printed text"},
         {"reading": "Wrote and conferred, with an act of acquisition", "held_by": "Rif text; Tosafot Rid's 'some books'; Rashbam's paraphrase; Rambam"},
         {"reading": "Act of acquisition without writing, then given to another", "held_by": "Rabbeinu Gershom; Soncino note following him"}],
     "evidence": [ev("S14", "יש ספרים שכתב בהן וזיכה לראשון וקנו מידו"), ev("S10", "קנו מידו בלא כתיבה וחזר ונתנו לאחר מהו")], "status": "open"},
    {"id": "A4", "question": "What does זיכה mean?",
     "readings": [
         {"reading": "Handed over the deed", "held_by": "Rashbam; Soncino translation"},
         {"reading": "Conferred the property through another, written into the deed", "held_by": "Tosafot (after Rabbeinu Yitzhak bar Meir's objection)"},
         {"reading": "'Go, take hold of the property and acquire'", "held_by": "'Sages of Spain' per Ramban; 'Geonim' per Rashba"},
         {"reading": "Conferred the property (זכו בשדה זו לפלוני)", "held_by": "Raavad, via Shita Mekubetzet"},
         {"reading": "'Go and take possession before me'", "held_by": "Rabbeinu Gershom"}],
     "evidence": [ev("S18", "ורבני ספרד ז\"ל פירשו"), ev("S19", "והגאונים ז\"ל פרשו")], "status": "open; does not affect who holds which view"},
    {"id": "A5", "question": "Who is the unnamed subject of 'סבור מיניה' (153a:1)?",
     "readings": [
         {"reading": "Unnamed", "held_by": "Hebrew text"},
         {"reading": "Rav's disciples", "held_by": "William Davidson English (editorial)"}],
     "evidence": [ev("S3", "Rav’s disciples <b>understood from this</b>")], "status": "open"},
    {"id": "A6", "question": "Who is the transmitter of Rav's view in the earlier (152a) dispute?",
     "readings": [
         {"reading": "בי רב in the name of Rav", "held_by": "Wikisource / Davidson text"},
         {"reading": "Rav directly", "held_by": "Rif; Shita Mekubetzet lemma"},
         {"reading": "בי רב (no 'in Rav's name' in the lemma)", "held_by": "Rashbam lemma"}],
     "evidence": [ev("S16", "רב אומר ארכבה אתרי ריכשי"), ev("S8", "בי רב אמרי ארכביה")], "status": "open; variant witnesses, no manuscripts checked"},
]

unresolved = [
    "No manuscripts were checked (for example Hamburg, Florence, Vatican, Escorial). The variant evidence here rests on printed texts and on commentators' lemmas, citations and 'some books' reports.",
    "The Chiddushei Ritva request for 152b returned HTTP 404 from Sefaria under the title tried. This says nothing about whether the Ritva comments here.",
    "Whether 'בי רב' at 152b:8 means Rav's academy, household or disciples, and whether Rav was alive at the time of sending, is not decided by the text or by the traditional commentaries checked.",
    "Whether the Rav Yirmeya bar Abba of 152b:8 is the person at 153a:8 (Shum Tamya) and in the other 'שלחו ליה מבי רב לשמואל' reports. There is name and formula evidence only.",
    "Whether Rav Dimi's dictum was his own teaching or one he carried from others (compare the Jerusalem Talmud baraita of Rabban Shimon ben Gamliel, and the Rabbi Yohanan context at 135b).",
    "Whether the reasons in 152b:5 are Rav's and Shmuel's words or the Gemara's explanation.",
    "Whether the Sura and Pumbedita versions are incompatible or can both stand (A2).",
    "Soncino's date 'after Rab's death in 247' was not checked and should not enter the graph from this passage.",
    "The Gittin 66b, Gittin 89b and Shevuot 46a parallels were read only as search-index snippets (S21), not as full fetched pages.",
]

corrections = [
    {"existing_claim_id": "c6", "change": "Set voice to the anonymous Gemara (hypothetical reasoning). Predicate 'concedes_to' (hypothetical) fits better than 'rules_like'. Keep modality hypothetical and discourse_status rejected. Content = the present zikkui case.", "why": "F1, F2"},
    {"existing_claim_id": "c7", "change": "Same voice change as c6. Link the 'prior' content to 152a:1-3, where Shmuel's recorded stance is doubt ('לא ידענא מאי אדון בה'). Add a note that Tosafot deny this half is needed and Rashba leaves it unresolved.", "why": "F1, F3, F4"},
    {"existing_claim_id": "c5", "change": "Mark it as a derived display of the one Rav-Shmuel dispute in c3/c4, not an independent observation. Store the dispute once as a symmetric relation.", "why": "The inverse display of a relation is not a second observation (project rule)."},
    {"existing_claim_id": "c3, c4", "change": "Split the ruling (explicit attribution) from the reason 'הרי היא כמתנת בריא / שכיב מרע' (the Gemara's explanation; voice uncertain). Leave the mechanism of זיכה open in the statement labels.", "why": "F5, F6"},
    {"existing_claim_id": "new", "change": "Add a speech/transmission claim: Rav Yirmeya bar Abba says (reports) the correspondence from בי רב to Shmuel (branch pumb_report). Record the name-form variants (רב / ר' / no patronymic).", "why": "F8: the reporter is explicit but the pilot only used him as a voice."},
    {"existing_claim_id": "new", "change": "Add a name-embedded affiliation, group 'בי רב' → Rav (literal 'house of Rav'). Add no student_of edge and no 'after Rav's death' time scope.", "why": "F10; the relation embedded in a name is evidence (project rule), but the translators' death note is historical inference."},
    {"existing_claim_id": "prior (entity)", "change": "Add the transmission chain of the earlier dispute: בי רב in the name of Rav (Wikisource), with variant branches (Rav directly: Rif / Shita lemma; בי רב without 'in the name of Rav': Rashbam lemma).", "why": "F3, A6"},
    {"existing_claim_id": "c1 / new", "change": "Keep c1. Add a separate claim that the anonymous Gemara identifies the 'wrote to this one and wrote to that one' case with Rav Dimi's dictum. Remove any implied origin/destination from c2 (none is in the text).", "why": "F7"},
    {"existing_claim_id": "reading_groups.schools", "change": "sura_report covers at least 152b:4 (second half) to 152b:7, with alternative A1 extending it to 152a. pumb_report should extend to 153a:1 (Rav Hisda, Rav Huna, unnamed group), which interprets Shmuel's Pumbedita answer. historical_compatibility stays unknown (A2).", "why": "F12, F15, A2"},
    {"existing_claim_id": "question (entity)", "change": "Keep the Wikisource wording. Attach variant/interpretive branches for the question's content (A3) and the answer's 'אחר' / 'לאחר' wording.", "why": "F13"},
    {"existing_claim_id": "sura, pumb (entities)", "change": "Label them as places where versions were taught (loci of transmission). Do not locate Rav, Shmuel, Rav Yirmeya bar Abba or בי רב in Sura or Pumbedita on this evidence.", "why": "The text says only where each version was taught."},
    {"existing_claim_id": "new (wider context)", "change": "Add Rav Hisda, Rav Huna (from Kufri) and the unnamed group of 153a:1 in the continuation, scoped to pumb_report. Flag the 152b:1-3 people (Rav Nahman, Rava, Rav Nahman bar Yitzhak, Rav Hisda, Rav Yehuda) for the neighbouring job.", "why": "F15, F17"},
    {"existing_claim_id": "episode.needed_context", "change": "The earlier rule is recovered (152a:1-3). Coverage for this question can move from needs_context to researched.", "why": "F3"},
    {"existing_claim_id": "previous review", "change": "The review passed every check. It should have flagged the missing speech claim for Rav Yirmeya bar Abba, the Gemara voice of the צריכא hypotheticals, the בי רב→Rav affiliation, the transmission chain in the prior dispute, and the continuation at 153a:1.", "why": "F1, F3, F8, F10, F15"},
]

lessons = [
    "'בסורא מתנו הכי / בפומבדיתא מתנו הכי' introduces school-version alternatives. The places are where a version was taught, not where the people in it lived.",
    "Formulas recur ('אמר רב ירמיה בר אבא שלחו ליה מבי רב לשמואל ילמדנו רבינו', 'אין לאחר קנין כלום'). The same formula in different tractates is a literary pattern, not one event and not evidence for identity.",
    "The hypotheticals in a צריכא ('אימא מודה ליה') are the anonymous Gemara's rejected suppositions. They need a voice field distinct from the named sages and must never become agreement edges.",
    "A group label that embeds a person ('בי רב') carries a name-based affiliation. Student relations and timing (such as 'after Rav's death') are not derivable from the label.",
    "When a later line refers back to an earlier dispute with a bare name ('Rav'), keep the earlier transmission chain ('בי רב משמיה דרב') on the referenced statement.",
    "Keep evidence types distinct: printed text; a commentator's lemma or citation; 'some books' reports; later 'צ\"ל' emendation proposals; translators' glosses. The Davidson English and Steinsaltz Hebrew are one editorial work.",
    "A reporter named with 'אמר' needs his own speech/transmission claim. Using him only as the 'voice' of the reported claims loses the speech turn.",
    "Balanced rhetorical structure (a Rav half and a Shmuel half) is not evidence that both sages' positions are parallel. Commentators can dispute one half.",
]

out = {"status": "researched",
       "question": "In Bava Batra 152b:7 (with 152b:4-8 and 152a-153a context), which people, speech turns, concessions and school versions are explicit, which rest on interpretation, and what did the first reading and the earlier review miss?",
       "scope_note": "Checked: Sefaria texts of Bava Batra 152a, 152b, 153a and 135b (Wikisource, William Davidson), Sanhedrin 24b, Jerusalem Talmud Bava Batra 8:7; the commentaries and codes listed in sources; the Soncino English at halakhah.com; Sefaria phrase searches. No manuscripts. Conclusions are scoped to these files.",
       "findings": F, "alternative_readings": alternatives, "unresolved": unresolved,
       "proposed_corrections": corrections, "ontology_lessons": lessons}
json.dump(out, open("findings.json", "w"), ensure_ascii=False, indent=1)
print("wrote findings.json", len(F))
