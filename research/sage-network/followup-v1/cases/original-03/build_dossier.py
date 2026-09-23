"""Build dossier.json for original-03 (Chullin 94b:13) from saved sources."""
import hashlib, json
from pathlib import Path

HERE = Path(__file__).parent
log = {e["saved_file"]: e for e in json.load(open(HERE / "sources/fetch_log.json")) if "saved_file" in e}


def sha(p):
    return hashlib.sha256((HERE / p).read_bytes()).hexdigest()


def src(sid, fname, edition, note=None):
    path = "sources/" + fname
    e = log[path]
    out = {"source_id": sid, "url_or_path": e["url"], "edition": edition, "fetched_at": e["fetched_at"],
           "saved_file": path, "sha256": sha(path)}
    if note:
        out["note"] = note
    return out


sources = [
    {"source_id": "S0", "url_or_path": "research/sage-network/followup-v1/cases/original-03/input.json",
     "edition": "Assigned input (lake snapshot 2): William Davidson Vocalized Aramaic of Chullin 94b:13 plus two first-pass pair judgements",
     "fetched_at": None, "saved_file": "input.json", "sha256": sha("input.json"),
     "note": "Read only, not modified."},
    src("S1", "sefaria_v3_chullin_94b_all.json",
        "Sefaria v3 Chullin 94b, all versions: William Davidson Vocalized Aramaic, William Davidson Aramaic, Wikisource Talmud Bavli, William Davidson English (and any others returned)"),
    src("S2", "sefaria_v3_chullin_94a_all.json", "Sefaria v3 Chullin 94a, all versions (context: Ulla and Rav Yehuda barrels case)"),
    src("S3", "rashi_chullin_94b_13.json", "Rashi on Chullin 94b:13, Vilna Edition (Sefaria)"),
    src("S4", "rashi_chullin_94b_14.json", "Rashi on Chullin 94b:14, Vilna Edition (Sefaria)"),
    src("S5", "tosafot_chullin_94b_14.json", "Tosafot on Chullin 94b:14, Vilna Edition (Sefaria)"),
    src("S6", "gershom_chullin_94b.json", "Rabbeinu Gershom on Chullin 94b, Vilna Edition (Sefaria)"),
    src("S7", "ritva_chullin_94b.json", "Chiddushei haRitva on Chullin 94b, Lemberg 1861 (Sefaria)"),
    src("S8", "rif_chullin_33b_2.json", "Rif Chullin 33b:2, Vilna Edition (Sefaria)",
        "The story is printed inside parentheses preceded by a footnote marker whose footnote reads ד\"ת מ\"ז; this dossier does not know what the note means."),
    src("S9", "steinsaltz_chullin_94b_13.json", "Steinsaltz on Chullin 94b:13, William Davidson Edition - Hebrew (Sefaria)"),
    src("S10", "steinsaltz_chullin_94b_14.json", "Steinsaltz on Chullin 94b:14, William Davidson Edition - Hebrew (Sefaria)"),
    src("S11", "ben_yehoyada_chullin_94b_1.json", "Ben Yehoyada on Chullin 94b:1, Senlake edition 2019 based on Jerusalem 1897 (Sefaria)"),
    src("S12", "petach_einayim_chullin_94b_1.json", "Petach Einayim on Chullin 94b:1, Jerusalem 1959 (Sefaria)"),
    src("S13", "haggahot_yaavetz_chullin_94b_1.json", "Haggahot Ya'avetz on Chullin 94b:1, Vilna Edition (Sefaria)"),
    src("S14", "seder_hadorot_1097.json", "Seder HaDorot, Tanaim and Amoraim 1097, Warsaw 1878-1882 (Sefaria)"),
    src("S15", "seder_hadorot_2822.json", "Seder HaDorot, Tanaim and Amoraim 2822 (Rav Safra), Warsaw 1878-1882 (Sefaria)"),
    src("S16", "shaarei_torat_bavel_ketubot_17a_1.json", "Sha'arei Torat Bavel on Ketubot 17a:1, Jerusalem 1961 (Sefaria)"),
    src("S17", "prisha_cm_228_7.json", "Prisha, Choshen Mishpat 228:7, Tur Vilna 1923 (Sefaria)"),
    src("S18", "shulchan_arukh_cm_228_6.json", "Shulchan Arukh, Choshen Mishpat 228:6, all versions (Sefaria)"),
    src("S19", "tur_cm_228.json", "Tur, Choshen Mishpat 228, all versions (Sefaria)"),
    src("S20", "mishneh_torah_deot_2_6.json", "Mishneh Torah, Human Dispositions (De'ot) 2:6, all versions (Sefaria)"),
    src("S21", "sefaria_links_chullin_94b_13.json", "Sefaria links API for Chullin 94b:13 (list of connected texts)"),
    src("S22", "sefaria_links_chullin_94b_14.json", "Sefaria links API for Chullin 94b:14 (list of connected texts)"),
]

T = "translation_by_this_dossier"


def ev(sid, q, t=None):
    d = {"source_id": sid, "exact_quote": q}
    if t:
        d[T] = t
    return d


findings = [
    {"finding_id": "F1", "kind": "textual", "confidence": "high",
     "claim": "The story is told by the anonymous Gemara as a precedent ('like this case') for the rule just stated: people who mislead themselves are not being misled. It is a narrated incident, not a sage's own report or memory.",
     "evidence": [
         ev("S1", "והא קמטעי להו אינהו הוא דקמטעו נפשייהו", "But doesn't this mislead them? It is they who mislead themselves."),
         ev("S1", "כי הא דמר זוטרא בריה דרב נחמן הוה קאזיל מסיכרא לבי מחוזא", "Like this: Mar Zutra son of Rav Nachman was going from Sikhra to Bei Mechoza"),
     ],
     "reasoning": "The segment opens with כי הא ד, the usual formula for citing an incident as support. No participant introduces it with 'I saw' or 'he told'. So the whole story sits in the narrator's voice; speech inside it is reported speech.",
     "graph_effect": "Record one episode (a road encounter) with narrator = anonymous Gemara. Speech edges are reported speech inside a narrated story, not attributed teachings."},
    {"finding_id": "F2", "kind": "textual", "confidence": "high",
     "claim": "Sequence of movement: Mar Zutra was travelling from Sikhra towards Bei Mechoza. Rava and Rav Safra were travelling (as one party) towards Sikhra. The two parties met each other on the way. All three named men are physically present at the meeting.",
     "evidence": [
         ev("S1", "הוה קאזיל מסיכרא לבי מחוזא ורבא ורב ספרא הוו קא אתו לסיכרא פגעו אהדדי",
            "[Mar Zutra] was going from Sikhra to Bei Mechoza, and Rava and Rav Safra were coming to Sikhra; they met each other."),
     ],
     "reasoning": "The verb for Rava and Rav Safra is a single plural (הוו קא אתו), so the text itself states that they travel together. The two parties go in opposite directions, and פגעו אהדדי ('they met each other') states the encounter. The ו between the Mar Zutra clause and the Rava clause joins two travel clauses; it does not make Mar Zutra and Rava companions.",
     "graph_effect": "Rava + Rav Safra: co-travel (explicit, story evidence). Mar Zutra with Rava and with Rav Safra: road encounter (explicit meeting). These are story-specific relations, not a generic 'together' edge; in particular Mar Zutra and Rava were NOT travelling together."},
    {"finding_id": "F3", "kind": "textual", "confidence": "high",
     "claim": "The misunderstanding is narrated as Mar Zutra's own thought: he supposed they had come out towards him (to greet him). It is not speech and nobody said it to him.",
     "evidence": [ev("S1", "הוא סבר לאפיה הוא דקאתו", "He thought: it is towards him that they were coming.")],
     "reasoning": "סבר ('he thought, supposed') marks a belief. The text never says Rava or Rav Safra told him they came for him. Rashi, Tosafot and the codes all build on this: he misled himself.",
     "graph_effect": "Do not create an 'honours / goes out to greet' edge from Rava or Rav Safra to Mar Zutra. At most store Mar Zutra's mistaken belief as a belief attached to the episode."},
    {"finding_id": "F4", "kind": "textual", "confidence": "high",
     "claim": "Speech 1: Mar Zutra speaks to both men together (plural addressee), in polite third person: why did the Rabbis trouble themselves to come so far?",
     "evidence": [ev("S1", "אמר להו למה להו לרבנן דטרוח ואתו כולי האי", "He said to them: Why did the Rabbis need to trouble themselves and come all this way?")],
     "reasoning": "אמר להו is plural 'to them'. לרבנן refers to his addressees respectfully in third person.",
     "graph_effect": "Mar Zutra addresses Rava and Rav Safra jointly (one speech act, group addressee). If the graph stores pairwise address, both pairs derive from this single act and must not be counted as two independent observations."},
    {"finding_id": "F5", "kind": "textual", "confidence": "high",
     "claim": "Speech 2: Rav Safra alone answers Mar Zutra. He states a fact (we did not know you were coming) and a counterfactual (had we known, we would have troubled ourselves more). The extra effort is hypothetical: it never happened. Rava says nothing to Mar Zutra in the text.",
     "evidence": [ev("S1", "אמר ליה רב ספרא אנן לא הוה ידעינן דקאתי מר אי הוה ידעינן טפי הוה טרחינן",
                     "Rav Safra said to him: We did not know that the Master was coming; if we had known, we would have troubled ourselves more.")],
     "reasoning": "אמר ליה is singular 'to him', naming Rav Safra as speaker. אי הוה ... הוה is a contrary-to-fact conditional. Rashi explains the unstated purpose: they had gone out on their own business to go elsewhere.",
     "graph_effect": "Rav Safra addresses Mar Zutra (reply, corrects a misunderstanding). The conditional 'would have honoured more' is imagined behaviour and supports no honour or deference edge. No Rava to Mar Zutra speech edge."},
    {"finding_id": "F6", "kind": "textual", "confidence": "high",
     "claim": "Speeches 3-5 (Chullin 94b:14, the next segment of the same story): Rava rebukes Rav Safra for upsetting Mar Zutra. Rav Safra objects that otherwise they would be misleading him. The closing line, 'he is misleading himself', rebuts that objection. The text does not say whether Mar Zutra heard this exchange.",
     "evidence": [
         ev("S1", "אמר ליה רבא מאי טעמא אמרת ליה הכי דאחלישתיה לדעתיה", "Rava said to him: Why did you say that to him? You upset him."),
         ev("S1", "אמר ליה והא קא מטעינן ליה איהו הוא דקא מטעי נפשיה", "He said to him: But [otherwise] we would be misleading him! He is misleading himself."),
     ],
     "reasoning": "The first speaker and addressee are explicit: Rava to Rav Safra. The reply's speaker is unnamed ('he said to him'), but it answers Rava, so it is Rav Safra. Where the speaker changes inside the reply is discussed in F7. Nothing in the text places Mar Zutra inside or outside this conversation.",
     "graph_effect": "Rava addresses (rebukes) Rav Safra; Rav Safra replies to Rava; they disagree on conduct. Store as a conduct exchange inside the episode. Keep it separate from the co-travel edge. Mar Zutra is the topic (spoken about), not an addressee."},
    {"finding_id": "F7", "kind": "interpretation", "confidence": "medium",
     "claim": "Who says the last line, 'he is misleading himself'? The William Davidson Aramaic and Wikisource texts have a single 'he said to him' covering both sentences. The Davidson English and Steinsaltz Hebrew (one editorial project) give the last line to Rava. The Rif's text of the story has a second explicit 'he said to him' before it. Petach Einayim also says Rava concludes and Rav Safra accepted.",
     "evidence": [
         ev("S1", "Rav Safra <b>said to</b> Rava: <b>But</b> if I would not have said so <b>we</b> would have <b>misled him.</b> Rava responded: Mar Zutra <b>misled himself,</b>",
            None),
         ev("S10", "אמר לו רבא לרב ספרא: אין זה נחשב שאנו מטעים אותו, שכן", "Rava said to Rav Safra: this does not count as our misleading him, since... [Steinsaltz Hebrew gloss]"),
         ev("S8", "אמר ליה והא קא מטעינן ליה אמר ליה איהו דקא מטעי אנפשיה", "He said to him: But we would be misleading him! He said to him: He is misleading himself. [Rif]"),
         ev("S12", "ובסוגיין מסיק רבא שלא לומר ואיהו קמטעי נפשיה", "In our passage Rava concludes that one should not say it, and 'he is misleading himself'."),
         ev("S12", "ובסוגיין רב ספרא לא השיב לרבא ונראה שקבל דבריו", "In our passage Rav Safra did not answer Rava; it seems he accepted his words."),
     ],
     "reasoning": "The objection-then-answer shape (והא ... ! איהו הוא ...) and the codes that adopt 'he misled himself' as the rule support giving the answer to Rava. The Rif's added אמר ליה makes the change of speaker explicit, but it is one witness to the text and its parenthetical printing is unexplained (see S8 note). The Davidson English and Steinsaltz Hebrew come from the same editorial work and count as one voice, not two. Rashi (S4) and Rabbeinu Gershom (S6) gloss the phrases without naming speakers.",
     "graph_effect": "Default: Rava has the last word (Rava to Rav Safra: 'he misleads himself'), as a reading branch, not settled text. Alternative branch: one reply by Rav Safra containing both sentences. No commentator I checked reads it that way, and the logic argues against it. The Rif witness supports the default and should be stored as a text variant, not as commentary."},
    {"finding_id": "F8", "kind": "textual", "confidence": "high",
     "claim": "Patronymic: Mar Zutra is called son of Rav Nachman. That is a father-child relationship shown in the name. Rav Nachman does not appear or speak in the story.",
     "evidence": [ev("S1", "מר זוטרא בריה דרב נחמן", "Mar Zutra, son of Rav Nachman"),
                  ev("S8", "מר זוטרא בריה דרב נחמן הוה אזיל", "Mar Zutra son of Rav Nachman was going [Rif]")],
     "reasoning": "בריה ד is a plain 'son of'. The project rule keeps the kin relation and a local parent placeholder even though the parent never acts. Seder HaDorot (S14) files this story under 'מר זוטרא בר רב נחמן' with other passages. That is a later index, and it does not establish which Rav Nachman is meant or that every listed passage is the same man.",
     "graph_effect": "Add local placeholder 'Rav Nachman (father of Mar Zutra, this passage)' and edge child-of: Mar Zutra -> Rav Nachman (literal kinship, from the name). Do not merge the placeholder with any historical Rav Nachman here. Identification is a separate decision."},
    {"finding_id": "F9", "kind": "textual", "confidence": "medium",
     "claim": "Place-name variant: the Rif has Mar Zutra going to 'Bei Chozai' (לבי חוזאי), not 'Bei Mechoza'. It also has Rava and Rav Safra coming FROM Bei Chozai to Sikhra, and it lacks the narrated clause 'he thought they were coming towards him'.",
     "evidence": [ev("S8", "הוה אזיל מסיכרא לבי חוזאי ורבא ורב ספרא הוו אתו מבי חוזאי לסיכרא פגעו אהדדי אמר להן",
                     "was going from Sikhra to Bei Chozai, and Rava and Rav Safra were coming from Bei Chozai to Sikhra; they met each other. He said to them... [Rif]")],
     "reasoning": "This is a variant in a secondary witness quoting the Gemara, not an emendation. It changes the geography but not who meets whom. I did not check manuscripts of the Bavli, so I cannot say which reading the manuscripts support.",
     "graph_effect": "Store the destination as a text variant (Bei Mechoza / Bei Chozai). Do not derive a residence edge (for example 'Rava of Mechoza') from this story. Participants and encounter are unchanged across both versions."},
    {"finding_id": "F10", "kind": "interpretation", "confidence": "high",
     "claim": "Commentators agree that Rava and Rav Safra had not set out for Mar Zutra at all. Rashi: they had gone out on their own business. Ritva: they were going their own way, not towards him. Tosafot: here they did not come for him at all. That is how Tosafot tell this case apart from Ulla and Rav Yehuda's barrels on 94a.",
     "evidence": [
         ev("S3", "ולעשות עסקינו ולילך למקום אחר יצאנו", "We went out to do our business and to go elsewhere. [Rashi, explaining Rav Safra's words]"),
         ev("S7", "דרבא ורב ספרא לדרכן הוי הולכין ולא לקראתו", "Rava and Rav Safra were going on their way, and not towards him. [Ritva]"),
         ev("S5", "אבל הכא לא באו כלל בעבורו", "But here they did not come on his account at all. [Tosafot]"),
         ev("S2", "שאני עולא דחביב ליה לרב יהודה דבלאו הכי נמי פתוחי מפתח ליה", "Ulla is different, since he was dear to Rav Yehuda, who would have opened them for him anyway."),
     ],
     "reasoning": "The Tosafot question: Rav Safra said they would have made more effort had they known, so perhaps there was no real deception, as with Ulla. Tosafot answer that there the act was done for the guest; here nothing was. That answer depends on the meeting being accidental.",
     "graph_effect": "Supports tagging the encounter as accidental or incidental. No planned visit or greeting. The Ulla / Rav Yehuda case belongs to a different episode (94a) and must not be merged into this one."},
    {"finding_id": "F11", "kind": "interpretation", "confidence": "medium",
     "claim": "Commentators differ on why Rav Safra thought silence would mislead, and on what Mar Zutra knew. Ben Yehoyada infers that Rava and Rav Safra turned back and went with Mar Zutra to Mechoza; otherwise silence could not mislead. Rabbeinu Gershom glosses 'he misleads himself' as 'he knows we did not go out to meet him'. Rashi glosses it as 'since we did not tell him we came out to meet you'.",
     "evidence": [
         ev("S11", "ועל כן מוכרח לומר דחזרו עמו למחוזא והביאוהו לביתם", "Therefore one must say they returned with him to Mechoza and brought him to their home. [Ben Yehoyada]"),
         ev("S6", "איהו הוא דקא מטעי נפשיה כלומר שהוא יודע דלא נפקינן לקדמותיה", "He misleads himself: that is, he knows that we did not go out to meet him. [Rabbeinu Gershom]"),
         ev("S4", "אחרי שאנו לא אמרנו לו לקראתך יצאנו", "Since we did not tell him 'we came out towards you'. [Rashi]"),
     ],
     "reasoning": "Ben Yehoyada's accompaniment and hosting is an inference he makes to answer a difficulty. The text does not say it. Gershom's 'he knows' may mean 'he should know'; I cannot settle that from the gloss alone.",
     "graph_effect": "Do NOT add 'accompanies' or 'hosts' edges from Ben Yehoyada's inference. Keep it as a commentary alternative attached to the episode."},
    {"finding_id": "F12", "kind": "interpretation", "confidence": "medium",
     "claim": "A different, later-reported story about Rav Safra is related to this one but is not the same event. In it, Rav Safra goes out to stroll, a pious man thinks he has come to greet him, Rav Safra says he came out only to stroll, and his students question him. Petach Einayim cites it from Reshit Chokhmah and Seder HaDorot also reports it. Seder HaDorot thinks it is aimed at this Gemara but in a different form.",
     "evidence": [
         ev("S12", "דרב ספרא יצא יום אחד לטייל ובא חסיד א\"ל לרב ספרא למה טרח מר א\"ל רב ספרא לא יצאתי אלא לטייל נתבייש אותו חסיד",
            "Rav Safra went out one day to stroll; a pious man came and said to Rav Safra: Why did the Master trouble himself? Rav Safra said: I only came out to stroll. That pious man was ashamed. [Petach Einayim, reporting Reshit Chokhmah]"),
         ev("S12", "וראה השינוי שיש", "And see the difference there is."),
         ev("S15", "ולדעתי כוונתו על גמרא זו אבל הוא בענין אחר", "In my opinion he means this Gemara, but it is in a different form. [Seder HaDorot]"),
     ],
     "reasoning": "The cast differs (an unnamed pious man and students instead of Mar Zutra and Rava). So does the moral (Rav Safra defends his honesty with a verse rather than being corrected). I saw it only through these two later works, not in Reshit Chokhmah itself.",
     "graph_effect": "No edges for Mar Zutra or Rava from this retelling. Do not identify the pious man with Mar Zutra or the students with Rava. If stored at all, it is a separate later-tradition episode about Rav Safra with unnamed participants."},
    {"finding_id": "F13", "kind": "interpretation", "confidence": "high",
     "claim": "The codes adopt the conclusion as an anonymous rule: if someone meets another on the road and the other thinks he came out to honour him, there is no need to tell him. The Prisha names this story as the source.",
     "evidence": [
         ev("S18", "כגון שפגע בחבירו בדרך וסבור זה שיצא לקראתו לכבדו אין צריך להודיעו", "For example, he met his fellow on the road and the other thought he had come out towards him to honour him: he need not inform him. [Shulchan Arukh]"),
         ev("S17", "כגון שפגע בחבירו בדרך כו' שם ע\"ב מביא מעשה דמר זוטרא בריה דר\"נ הוה קאזיל באורחא וזה נלמד ממנו", "'For example he met his fellow on the road...': there (94b) it brings the incident of Mar Zutra son of Rav Nachman going on the road, and this is learned from it. [Prisha]"),
     ],
     "reasoning": "The codified rule matches the closing line of F6/F7. That supports reading it as the Gemara's accepted conclusion, whoever says it. The Mishneh Torah text I fetched (S20) lists other examples of misleading people but not this road case. That is only a finding about that paragraph.",
     "graph_effect": "Reception evidence only; creates no person-to-person edges. It may support the branch in F7 in which Rava's line is the conclusion."},
    {"finding_id": "F14", "kind": "uncertainty", "confidence": "low",
     "claim": "Haggahot Ya'avetz proposes a later emendation of Rav Safra's words: 'לא הוה ידעי דקאתי מרב' should be read. I cannot tell from the gloss alone what exact change from the printed text he intends.",
     "evidence": [ev("S13", "לא הוה ידעי דקאתי מרב", "We did not know that ... was coming [his proposed wording; meaning of מרב unclear to this dossier]")],
     "reasoning": "This is a later proposed emendation, a different kind of evidence from a text variant. It concerns the wording of Rav Safra's reply, not who speaks or who meets.",
     "graph_effect": "None on persons. Store as a proposed emendation on the wording, unresolved."},
    {"finding_id": "F15", "kind": "interpretation", "confidence": "high",
     "claim": "Parts of the English translation are editorial additions, not text. 'out to greet', 'Rava responded' and the unbolded 'Rava ... Rav Safra' addressee names do not appear in the Aramaic. The Davidson English and Steinsaltz Hebrew belong to one editorial project and are not independent witnesses.",
     "evidence": [
         ev("S1", "Mar Zutra <b>thought they were coming</b> out to greet <b>him.</b>", None),
         ev("S9", "הוא,</b> מר זוטרא, <b>סבר</b>", "He, Mar Zutra, thought [Steinsaltz supplies the name]"),
     ],
     "reasoning": "In this edition, bold marks the translated text and plain type marks explanation. Graph extraction from English must not treat the plain additions as source text.",
     "graph_effect": "Anchor speaker and addressee decisions on the Aramaic. Where the Aramaic is implicit ('he said to him'), mark the name as resolved by context or by commentary."},
]

alternative_readings = [
    {"id": "A1", "about": "F7: who speaks 'איהו הוא דקא מטעי נפשיה'",
     "readings": [
         {"reading": "Rava answers Rav Safra's objection; Rava has the last word.",
          "held_by": "William Davidson English and Steinsaltz Hebrew (one editorial project); Petach Einayim; the Rif's text supports it with an explicit second 'אמר ליה'"},
         {"reading": "Rav Safra's single reply contains both sentences.",
          "held_by": "No commentator checked; the single 'אמר ליה' in the Davidson/Wikisource Aramaic merely allows it"}]},
    {"id": "A2", "about": "F9: destination of Mar Zutra",
     "readings": [
         {"reading": "Sikhra to Bei Mechoza", "held_by": "William Davidson Aramaic; Wikisource Talmud Bavli (S1)"},
         {"reading": "Sikhra to Bei Chozai; Rava and Rav Safra from Bei Chozai", "held_by": "Rif (S8)"}]},
    {"id": "A3", "about": "F11: what happened after the meeting",
     "readings": [
         {"reading": "They parted, each party going its own way", "held_by": "Implied by Ritva 'לדרכן הוי הולכין'; nothing explicit"},
         {"reading": "Rava and Rav Safra turned back with Mar Zutra to Mechoza and hosted him", "held_by": "Ben Yehoyada (inference)"}]},
    {"id": "A4", "about": "F11: Mar Zutra's knowledge",
     "readings": [
         {"reading": "He misled himself because nobody told him they came for him", "held_by": "Rashi"},
         {"reading": "He knows (or should know) they did not go out to meet him", "held_by": "Rabbeinu Gershom"},
         {"reading": "He ought to have realised it (איבעי ליה לאסוקי אדעתיה)", "held_by": "Tur / Shulchan Arukh formulation; Petach Einayim attributes this to Tosafot"}]},
]

unresolved = [
    "Bavli manuscript readings for the place name (Bei Mechoza / Bei Chozai) and for the speaker break in 94b:14 were not checked. No manuscript witness was fetched.",
    "The meaning of the Rif footnote 'ד\"ת מ\"ז' and why the story is printed in parentheses there.",
    "Exactly what emendation Haggahot Ya'avetz intends ('מרב').",
    "Whether Mar Zutra heard Rava's exchange with Rav Safra; the text is silent.",
    "The Reshit Chokhmah version (F12) was seen only as quoted by Petach Einayim and Seder HaDorot, not in the original work.",
    "Which Rav Nachman is Mar Zutra's father: a historical identification, not attempted here.",
]

proposed_corrections = [
    {"existing_claim_id": "bavli|Chullin|94b|13|10|58",
     "change": "Kind 'together' -> road encounter (met) plus Mar Zutra addresses Rava as part of a two-person group addressee. The name span should include the title מר ('מר זוטרא בריה דרב נחמן').",
     "why": "The ו in the pattern joins two opposite-direction travel clauses; Mar Zutra and Rava were not travelling together. Their contact is the explicit meeting (פגעו אהדדי) and the one plural speech (אמר להו). Rava never speaks to Mar Zutra in the story."},
    {"existing_claim_id": "bavli|Chullin|94b|13|58|63",
     "change": "Kind 'together' -> co-travel (explicit, single plural verb), stored as story evidence. Add a separate conduct exchange from 94b:14: Rava rebukes Rav Safra, Rav Safra objects, and Rava answers on the default reading (F7).",
     "why": "'Together' is correct here but loses what the story says. The rebuke and reply are a separate relation from travelling together, and the 94b:14 exchange lies just outside the focal segment."},
    {"existing_claim_id": None,
     "change": "Add missing pair Mar Zutra - Rav Safra: road encounter; Mar Zutra addresses both (shared act with the Rava pair); Rav Safra replies to Mar Zutra, correcting his mistaken belief.",
     "why": "Rav Safra is the only person who speaks to Mar Zutra, and the first-pass pairs miss this."},
    {"existing_claim_id": None,
     "change": "Add kin: Mar Zutra child-of local placeholder 'Rav Nachman (this passage)'. Direction: Mar Zutra -> father.",
     "why": "Patronymic בריה דרב נחמן is relationship evidence even though the father is absent from the story (project rule)."},
    {"existing_claim_id": None,
     "change": "Do not add any honour, deference or greeting edge from Rava or Rav Safra to Mar Zutra.",
     "why": "The honour exists only in Mar Zutra's mistaken belief (סבר) and in Rav Safra's counterfactual ('if we had known ...'). Commentators agree they did not come for him."},
]

ontology_lessons = [
    "Separate 'co-travel' (one party moving together) from 'encounter' (two parties meet). A generic 'together' blurs a story in which people moving in opposite directions meet.",
    "Speech modality: store narrated belief (סבר), actual speech (אמר), counterfactual content (אי הוה ... הוה) and inferred-speaker lines as different modalities. A counterfactual about honouring someone is not an honouring event.",
    "A plural address (אמר להו) is one speech act with a group addressee. Pairwise projections of it are not independent observations.",
    "A person spoken ABOUT (Mar Zutra in 94b:14) is a topic, not an addressee.",
    "Implicit speaker changes ('he said to him' covering two turns) should be saved as a reading branch with who-says-what, plus any textual witness (here the Rif) that makes the change explicit.",
    "Commentary inferences about off-text actions (Ben Yehoyada's return to Mechoza) must not become edges.",
    "Later retellings with a different cast (Reshit Chokhmah's pious man) are separate episodes; do not merge participants by role similarity.",
    "Place variants in a story should not feed residence edges without separate evidence.",
]

dossier = {
    "job_id": "original-03",
    "focal_ref": "Chullin 94b:13",
    "status": "researched",
    "question": "Reconstruct the travel story as a sequence of actions, speakers, addressees, misunderstandings and replies. Which participants actually meet? Which speech is imagined, conditional or remembered? Keep story evidence separate from a generic together edge.",
    "scope_note": "Checked: Sefaria texts of Chullin 94a-94b (Davidson vocalized and unvocalized Aramaic, Wikisource, Davidson English), the commentaries Sefaria links to 94b:13-14 that are listed in sources, the Rif, Tur, Shulchan Arukh, Prisha and Mishneh Torah De'ot 2:6. Not checked: Bavli manuscripts, Reshit Chokhmah itself, Sheiltot, Meiri, Rosh. The story continues in 94b:14, which was read as part of the same episode.",
    "episode_sequence": [
        {"step": 1, "type": "action", "actors": ["Mar Zutra"], "text": "travels Sikhra -> Bei Mechoza (Rif: Bei Chozai)", "ref": "94b:13", "modality": "narrated"},
        {"step": 2, "type": "action", "actors": ["Rava", "Rav Safra"], "text": "travel together towards Sikhra (Rif: from Bei Chozai)", "ref": "94b:13", "modality": "narrated"},
        {"step": 3, "type": "encounter", "actors": ["Mar Zutra", "Rava", "Rav Safra"], "text": "they meet each other (פגעו אהדדי)", "ref": "94b:13", "modality": "narrated"},
        {"step": 4, "type": "belief", "actors": ["Mar Zutra"], "text": "thinks they came towards him; mistaken (absent in Rif)", "ref": "94b:13", "modality": "narrated thought"},
        {"step": 5, "type": "speech", "speaker": "Mar Zutra", "addressees": ["Rava", "Rav Safra"], "text": "Why did the Rabbis trouble themselves so much?", "ref": "94b:13", "modality": "reported speech, based on a misunderstanding"},
        {"step": 6, "type": "speech", "speaker": "Rav Safra", "addressees": ["Mar Zutra"], "text": "We did not know; had we known we would have troubled more", "ref": "94b:13", "modality": "reported speech; second clause counterfactual"},
        {"step": 7, "type": "speech", "speaker": "Rava", "addressees": ["Rav Safra"], "topic": ["Mar Zutra"], "text": "Why did you say that? You upset him", "ref": "94b:14", "modality": "reported speech, rebuke"},
        {"step": 8, "type": "speech", "speaker": "Rav Safra (implicit)", "addressees": ["Rava"], "text": "But [otherwise] we would mislead him", "ref": "94b:14", "modality": "reported speech; conditional (if silent)"},
        {"step": 9, "type": "speech", "speaker": "Rava (reading branch; explicit 'אמר ליה' in Rif)", "addressees": ["Rav Safra"], "text": "He is misleading himself", "ref": "94b:14", "modality": "reported speech; conclusion adopted by the codes"},
    ],
    "sources": sources,
    "findings": findings,
    "alternative_readings": alternative_readings,
    "unresolved": unresolved,
    "proposed_corrections": proposed_corrections,
    "ontology_lessons": ontology_lessons,
    "graph_status": "All edges provisional. No historical identity decided.",
}

(HERE / "dossier.json").write_text(json.dumps(dossier, ensure_ascii=False, indent=1) + "\n")
print("wrote dossier.json", len(sources), "sources", len(findings), "findings")
