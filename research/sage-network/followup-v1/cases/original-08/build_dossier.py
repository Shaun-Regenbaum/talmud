"""Build dossier.json for original-08 and check every quote against saved source bytes.

Quotes are matched against the decoded text fields of the saved JSON with HTML
tags removed. A quote that is not found stops the build.
"""
import hashlib, html, json, re, unicodedata
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "sources"
LOG = {x["file"]: x for x in json.loads((SRC / "fetch-log.json").read_text())}


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def strip(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s))


def texts_of(obj):
    out = []
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, list):
        for x in obj:
            out += texts_of(x)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            out += texts_of(v)
    return out


def corpus(path):
    data = json.loads(Path(path).read_text())
    return "\n".join(strip(t) for t in texts_of(data))


def src(sid, file, edition, url=None, note=None):
    p = SRC / file if file in LOG else HERE / file
    rec = {"source_id": sid,
           "url_or_path": url or LOG[file]["url"],
           "edition": edition,
           "fetched_at": LOG.get(file, {}).get("fetched_at"),
           "saved_file": ("sources/" + file) if file in LOG else file,
           "sha256": sha(p)}
    if file in LOG:
        assert LOG[file]["sha256"] == rec["sha256"], file
    if note:
        rec["note"] = note
    return rec, p


GUG_HE = "The Jerusalem Talmud, edition by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015"
GUG_EN = "The Jerusalem Talmud, translation and commentary by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015"
SOURCES = [
    src("S0", "input.json", "Case input (read-only; lake snapshot 2 source text plus earlier cross-check)",
        url="research/sage-network/followup-v1/cases/original-08/input.json",
        note="Not fetched; read from the case directory. Not modified."),
    src("S1", "yb-1-5-14-v3.json", f"Sefaria v3 text_only: Hebrew = {GUG_HE}; English = {GUG_EN}"),
    src("S2", "yb-1-5-14-v3-english-html.json", f"Sefaria v3 English with embedded footnotes 253-262: {GUG_EN}"),
    src("S3", "yb-1-5-14-v1-commentary.json", f"Sefaria v1 texts API, same Guggenheimer Hebrew and English (same editorial work as S1/S2, not an independent witness)"),
    src("S4", "yb-1-5-14-links.json", "Sefaria links index for Jerusalem Talmud Berakhot 1:5:14 (list of linked commentaries and parallels)"),
    src("S5", "ohr-layesharim-1-5-14.json", "Ohr LaYesharim on Jerusalem Talmud Berakhot 1:5:14, Machon HaYerushalmi, Rabbi Yehoshua Buch, 2015 (Sefaria)"),
    src("S6", "penei-moshe-1-5-14.json", "Penei Moshe on Jerusalem Talmud Berakhot 1:5:14, Piotrkow 1898-1900 (Sefaria)"),
    src("S7", "mareh-hapanim-1-5-14.json", "Mareh HaPanim on Jerusalem Talmud Berakhot 1:5:14, Piotrkow 1898-1900 (Sefaria)"),
    src("S8", "sirilio-1-5-14.json", "Sirilio on Jerusalem Talmud Berakhot 1:5:14, Jerusalem 1934-1967 (Sefaria)"),
    src("S9", "haggahot-rado-1-5-14.json", "Haggahot RaDO on Jerusalem Talmud Berakhot 1:5:14, Piotrkow 1898-1900 (Sefaria)"),
    src("S10", "bavli-sotah-40a.json", "Bavli Sotah 40a:11-12, William Davidson Edition (Hebrew/Aramaic and English) (Sefaria)"),
    src("S11", "yb-1-5-13.json", f"Context: Jerusalem Talmud Berakhot 1:5:13, {GUG_HE} / {GUG_EN}"),
    src("S12", "yb-1-5-15.json", f"Context: Jerusalem Talmud Berakhot 1:5:15, {GUG_HE} / {GUG_EN}"),
    src("S13", "search-yirmeya-yohanan.json", "Sefaria search index, exact phrase 'יוחנן בשם רבי ירמיה' (result list only)"),
    src("S14", "search-hiyya-simai.json", "Sefaria search index, exact phrase 'חייא בשם רבי סימאי' (result list only)"),
    src("S15", "search-meisha-grandson.json", "Sefaria search index, exact phrase 'מיישא בר בריה' (result list only)"),
    src("S16", "search-miasha-mishnah.json", "Sefaria search index, exact phrase 'מקובלני מרבי מיאשא' (result list only)"),
    src("S17", "search-yirmeya-hanina.json", "Sefaria search index, exact phrase 'ירמיה בשם רבי חנינא' (result list only)"),
    src("S18", "search-meisha-hiyya.json", "Sefaria search index, exact phrase 'מיישא בשם רבי חייא' (result list only)"),
]
CORPUS = {s["source_id"]: corpus(p) for s, p in SOURCES}
SOURCES = [s for s, _ in SOURCES]


MARKS = re.compile(r"[\u0591-\u05C7]")


def resolve(sid, quote):
    """Return the exact source substring whose consonants match the quote."""
    text = CORPUS[sid]
    for form in (quote, unicodedata.normalize("NFD", quote), unicodedata.normalize("NFC", quote)):
        if form in text:
            return form
    idx = [i for i, ch in enumerate(text) if not MARKS.match(ch)]
    bare = "".join(text[i] for i in idx)
    q = MARKS.sub("", quote)
    at = bare.find(q)
    assert at >= 0, (sid, quote)
    start, end = idx[at], idx[at + len(q) - 1] + 1
    while end < len(text) and MARKS.match(text[end]):
        end += 1
    return text[start:end]


def ev(sid, quote, tr=None):
    quote = resolve(sid, quote)
    e = {"source_id": sid, "exact_quote": quote}
    if tr:
        e["translation_by_this_dossier"] = tr
    return e


CHAIN_HE = "רִבִּי חֶלְבּוֹ רִבִּי שִׁמְעוֹן בְּשֵׁם רִבִּי יוֹחָנָן בְּשֵׁם רִבִּי יִרְמְיָה רִבִּי חֲנִינָא בְשֵׁם רִבִּי מְיָישָׁא רִבִּי חִיָּיא בְשֵׁם רִבִּי סִימַאי"
CHAIN_EN = "Rebbi Ḥelbo, Rebbi Simeon said in the name of Rebbi Yoḥanan, in the name of Rebbi Jeremiah, Rebbi Ḥanina in the name of Rebbi Miasha, Rebbi Ḥiyya in the name of Rebbi Simai"

FINDINGS = [
    {
        "finding_id": "F1",
        "claim": "In the Hebrew as printed, the list names eight people in a row. The linking word בשם ('in the name of') appears four times: Shimon-Yohanan, Yohanan-Yirmeya, Hanina-Miasha and Hiyya-Simai. Three joins have no linking word at all: Helbo-Shimon, Yirmeya-Hanina and Miasha-Hiyya. No 'and', no new 'said', and no other marker shows where one chain ends and the next begins.",
        "kind": "textual",
        "evidence": [ev("S1", CHAIN_HE, "Translation by this dossier, word for word: 'Rabbi Helbo, Rabbi Shimon, in the name of Rabbi Yohanan, in the name of Rabbi Yirmeya, Rabbi Hanina, in the name of Rabbi Miasha, Rabbi Hiyya, in the name of Rabbi Simai.'")],
        "reasoning": "Counted directly in the saved Guggenheimer Hebrew. Every chain boundary here is an editorial decision about bare juxtapositions. The printed text does not settle any of them.",
        "confidence": "high",
        "graph_effect": "Only the four בשם joins are text-explicit 'cites' edges, and even two of those are disputed by commentary (see F4, F5). The three bare joins are 'juxtaposed' edges. Any 'cites' reading of them belongs to a named interpretive branch.",
    },
    {
        "finding_id": "F2",
        "claim": "The framing sentence says that Rabbi Yose (spelled יֹסֵא) 'had not heard' the teaching. Penei Moshe reads these words as the Talmud's own surprised remark about Yose, not as Yose's speech. The chain list is therefore quoted by the narrator. It is not an exchange between Yose and Helbo.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "אָמַר לוֹן מַהוּ דֵין לְחִישָׁה וְלֹא שְׁמִיעַ דָּמַר", "Translation by this dossier: 'He said to them: What is this whispering? And had he not heard what [X] said...'"),
            ev("S6", "ומתמה הש\"ס ומה היא השאלה מהו דין לחישה וכי לא שמיע ליה מה דאמר ר' חלבו וכו' שנוהגין לומר כנוסחאות הללו", "Translation by this dossier: 'The Talmud expresses surprise: what is the question \"what is this whispering\"? Had he not heard what R. Helbo etc. said, that one customarily says these formulas?'"),
            ev("S5", "ומעירים: ולא שמיע דמר – ולא שמע (רבי יסא שלא ידע מה הציבור אומרים בזמן ששליח הציבור אומר את ברכת ההודייה) שאמר", "Translation by this dossier: 'And they remark: had he not heard what was said - he did not hear (R. Yisa, who did not know what the congregation says while the prayer leader says the thanksgiving blessing) what was said by...'"),
        ],
        "reasoning": "The text marks this negatively: Yose did NOT hear the chain's teaching. Both commentaries give the words to the editorial voice.",
        "confidence": "high",
        "graph_effect": "No speech, contact or teaching edge between Yose/Yisa and any chain member. Yose's own actions (came up, saw them bowing and whispering, asked) are a scene with the anonymous congregation.",
    },
    {
        "finding_id": "F3",
        "claim": "Guggenheimer's English keeps the Hebrew order and punctuates the list into these groups: 'Rebbi Ḥelbo, Rebbi Simeon said in the name of Rebbi Yoḥanan, in the name of Rebbi Jeremiah', then 'Rebbi Ḥanina in the name of Rebbi Miasha', then 'Rebbi Ḥiyya in the name of Rebbi Simai'. On this reading Yohanan transmits in Jeremiah's name. Miasha and Hiyya are not linked. The English does not say whether Helbo reports from Simeon or the two report together.",
        "kind": "interpretation",
        "evidence": [ev("S1", CHAIN_EN)],
        "reasoning": "The English groups the pairs by commas and 'in the name of', and it adds nothing to the three bare joins. The comma after Ḥelbo has two possible meanings, and the translation does not choose between them.",
        "confidence": "medium",
        "graph_effect": "Guggenheimer branch: cites(Shimon to Yohanan), cites(Yohanan to Jeremiah), cites(Hanina to Miasha), cites(Hiyya to Simai). Helbo-Shimon is left open between 'Helbo in Shimon's name' and 'co-reporters'. Miasha-Hiyya: no edge.",
    },
    {
        "finding_id": "F4",
        "claim": "Guggenheimer identifies this Jeremiah as an early figure: 'A Tanna of the last generation, student of R. Yehudah ben Batyra' (footnote 256). He identifies Miasha as 'One of the first Tannaïm with the title of “Rebbi”, from the last times of the Second Temple' (footnote 257). Under these identities, the two בשם joins that point to them (Yohanan to Jeremiah, Hanina to Miasha) cite earlier authorities, which is chronologically possible. His footnote 261 also calls the preceding texts 'quoted in historical order'.",
        "kind": "interpretation",
        "evidence": [
            ev("S2", "A Tanna of the last generation, student of R. Yehudah ben Batyra."),
            ev("S2", "One of the first Tannaïm with the title of “Rebbi”, from the last times of the Second Temple."),
            ev("S2", "While the previous texts were quoted in historical order, the text of Bar Qappara should have been the first."),
        ],
        "reasoning": "These are identity claims in a modern commentary. The fetched notes cite no source for either claim. This dossier did not find or check a text that makes a Tanna Jeremiah the student of Yehudah ben Batyra. A Tanna named R. Miasha does appear in a chain of received tradition (Nahum the scribe 'received from R. Miasha'), quoted in Bavli Nazir 56b. That shows only that the name existed in the Tannaitic period, not that this man is the one meant here.",
        "confidence": "medium",
        "graph_effect": "Attach 'Tanna Jeremiah' and 'early Tanna Miasha' only as identity proposals on the Guggenheimer branch. Do not merge them with any global node.",
    },
    {
        "finding_id": "F5",
        "claim": "Ohr LaYesharim divides the list differently, into three chains. (1) Helbo in the name of Shimon (bar Ba/Abba), in the name of Yohanan. (2) 'And likewise Rabbi Yirmeya [said in the name of] Rabbi Hanina.' (3) 'And likewise Rabbi Meisha in the name of Rabbi Hiyya [bar Ba], who said it in the name of Rabbi Simai.' It puts the printed בשם after Yohanan in parentheses, which reads as marking it for removal. It supplies unbolded 'בשם' between Helbo and Shimon and between Meisha and Hiyya. It identifies Yirmeya and Meisha as Palestinian Amoraim of the third and fourth generations. On those identities, 'Yohanan in the name of Yirmeya' would run backwards in time. That fits its decision to start a new chain at Yirmeya.",
        "kind": "interpretation",
        "evidence": [
            ev("S5", "אמר רבי חלבו (אמורא בדור השלישי) בשם רבי שמעון (בר ווא, רבי שמעון (שמן) בר אבא, אמורא בדור השלישי) שאמר בשם רבי יוחנן (גדול אמוראי ארץ ישראל בדור השני); (בשם) וכן אמר רבי ירמיה (מגדולי אמוראי ארץ ישראל בדור השלישי והרביעי)", "Translation by this dossier: 'which R. Helbo (third-generation Amora) said in the name of R. Shimon (bar Va, R. Shimon (Shaman) bar Abba, third generation), who said it in the name of R. Yohanan (greatest of the Land of Israel Amoraim, second generation); (in the name of) and likewise R. Yirmeya (of the great Land of Israel Amoraim, third and fourth generation) said'"),
            ev("S5", "וכן אמר (במסירה שלפנינו נוסף כאן על ידי מגיה 'בשם', כמו שהוא בכתב יד רומי. ורז\"פ מחק מילה זו) רבי מיישא (אמורא ארץ ישראלי בדור השלישי והרביעי) בשם רבי חייא (בר בא, אמורא ארץ ישראלי בדור השלישי) שאמר בשם רבי סימאי (בדור המעבר שבין התנאים לאמוראים)", "Translation by this dossier: 'and likewise said (in our transmitted text a corrector added here \"in the name of\", as it is in the Rome manuscript; and RZ\"P deleted this word) R. Meisha (Land of Israel Amora, third and fourth generation) in the name of R. Hiyya (bar Ba, third generation), who said it in the name of R. Simai (in the transition generation between Tannaim and Amoraim)'"),
        ],
        "reasoning": "Typography: in the saved commentary, words of the Talmud text are bold and explanation is plain. The 'בשם' between Helbo and Shimon, and the one between Meisha and Hiyya, are plain, so they are the commentator's additions. The bold parenthesised '(בשם)' after Yohanan appears to be a word the commentator reads as extra. That reading of the typography is this dossier's inference; the printed conventions of the edition were not checked. The commentator's segmentation and its dating of these men depend on each other. Neither is independent support for the other.",
        "confidence": "medium",
        "graph_effect": "Ohr LaYesharim branch: cites(Helbo to Shimon), cites(Shimon to Yohanan), cites(Yirmeya to Hanina), cites(Meisha to Hiyya), cites(Hiyya to Simai). No Yohanan-Yirmeya edge and no Hanina-Meisha edge on this branch.",
    },
    {
        "finding_id": "F6",
        "claim": "Ohr LaYesharim reports three kinds of evidence about the two contested בשם words. Each is a different type of evidence. (a) A manuscript variant: the Rome manuscript has בשם before Meisha. (b) A correction inside the base manuscript: a later hand ('מגיה') added that בשם 'in our transmitted text'. (c) A later proposed emendation: the editor abbreviated רז\"פ deleted that word, and added בשם between Yirmeya and Hanina. So the בשם before Miasha in the printed Hebrew is not original to the first scribe of the base text, according to this commentary.",
        "kind": "textual",
        "evidence": [
            ev("S5", "(רז\"פ הוסיף כאן 'בשם')", "Translation by this dossier: '(RZ\"P added here \"in the name of\")' - placed between R. Yirmeya and R. Hanina."),
            ev("S5", "(במסירה שלפנינו נוסף כאן על ידי מגיה 'בשם', כמו שהוא בכתב יד רומי. ורז\"פ מחק מילה זו)", "Translation by this dossier: '(In our transmitted text a corrector added \"in the name of\" here, as in the Rome manuscript; and RZ\"P deleted this word)' - placed before R. Meisha."),
        ],
        "reasoning": "All three are reported by the commentary. No manuscript image was examined. The fetched commentary does not expand the abbreviation רז\"פ, and this dossier does not identify the person.",
        "confidence": "medium",
        "graph_effect": "Mark the Hanina-to-Miasha 'cites' edge as resting on a corrector's word also found in the Rome MS, and contested by a later emendation. Mark Yirmeya-to-Hanina 'cites' as resting on a later emendation only. Store these as separate evidence types: ms_variant, ms_correction, later_emendation.",
    },
    {
        "finding_id": "F7",
        "claim": "The 'Tanna versus later Amora' question cannot be settled from what was checked. Both names occur outside this passage for men of different periods. A 'Meisha, son of the son (grandson) of Rabbi Yehoshua ben Levi' appears elsewhere in the Yerushalmi and Bavli. A Tannaitic 'Rabbi Miasha' appears in Nahum the scribe's chain of received tradition. A Rabbi Yirmeya teaches in Aramaic in the very next segment (1:5:15). None of these occurrences is shown to be the man named in this list.",
        "kind": "uncertainty",
        "evidence": [
            ev("S15", "מַיישָׁא בַּר בְּרֵיהּ דְּרִבִּי יְהוֹשֻׁעַ בֶּן לֵוִי אָמַר", "Translation by this dossier: 'Meisha, grandson of R. Yehoshua ben Levi, said' (Jerusalem Talmud Berakhot 8:2:10, as returned by the search)"),
            ev("S16", "אמר נחום הלבלר כך מקובלני מרבי מיאשא שקיבל מאבא שקבל מן הזוגות", "Translation by this dossier: 'Nahum the scribe said: thus I received from R. Miasha, who received from Abba, who received from the Pairs' (Bavli Nazir 56b:12, as returned by the search)"),
            ev("S12", "אָמַר רִבִּי יִרְמְיָה וּבִלְחוּד דְּלֹא יַעֲבִיד כְּהָדֵין חַרְדּוֹנָה", "Translation by this dossier: 'Rabbi Yirmeya said: only that one should not act like this lizard'"),
        ],
        "reasoning": "A shared name is not an identity. These hits only show why both identity proposals can be made. The spellings also differ (מְיָישָׁא in the focal text, מַיישָׁא/מִיָישָׁא for the grandson, מְיָאשָׁא/מיאשא for the Tanna). This dossier did not treat spelling as deciding the question.",
        "confidence": "high",
        "graph_effect": "Keep local nodes 'Yirmeya (this list)' and 'Miasha/Meisha (this list)'. Attach two identity proposals, each tied to its segmentation branch. Chronology checks must name the identity branch they assume.",
    },
    {
        "finding_id": "F8",
        "claim": "The alternative attribution 'and some say it: the colleagues, in the name of Rabbi Simai' replaces the reporter, not the authority. The plain reading puts 'the colleagues' in place of Rabbi Hiyya, and Rabbi Simai stays the named source. 'The colleagues' (חבריא) is a collective, which Guggenheimer glosses as 'The collective of scholars in the Yeshivah'. Ohr LaYesharim says this is an alternative tradition about who passed the words on, and notes that the Rome manuscript reads לה ('it') for ליה.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "וְאִית דְּאָמְרִין לֵיהּ חֲבֵרַיָּא בְשֵׁם רִבִּי סִימַאי", "Translation by this dossier: 'And some say it: the colleagues, in the name of R. Simai.'"),
            ev("S5", "ויש שאומרים אותה (יש שמציעים מסורת חלופית בנוגע לזהות מוסר הדברים)", "Translation by this dossier: 'And some say it (some present an alternative tradition about the identity of the one who transmitted the words)'"),
            ev("S2", "The collective of scholars in the Yeshivah."),
        ],
        "reasoning": "The phrase comes right after 'Hiyya in the name of Simai', which makes Hiyya the one replaced. The text does not say whether the alternative also covers the earlier chains. A textual alternative gives the teaching to X or Y. It does not show that only one of them historically transmitted it.",
        "confidence": "medium",
        "graph_effect": "Add alternative(Hiyya, colleagues) as reporters of one teaching in Simai's name, and add cites(colleagues to Simai) on that branch. The existing Simai/Simai 'same-man' row is locally true, but it does not capture what the text does.",
    },
    {
        "finding_id": "F9",
        "claim": "The Bavli has a parallel list at Sotah 40a. There Rabbi Simai gives a short formula, and 'the Nehardeans say in the name of Rabbi Simai' another. This is the same pattern as the Yerushalmi's 'the colleagues in the name of Rabbi Simai'. The Bavli list ends with Rav Papa saying to recite them all. Ohr LaYesharim quotes that closing line as 'אמר רב ששת' (Rav Sheshet), but the fetched Bavli text reads 'אָמַר רַב פָּפָּא', as does Guggenheimer's footnote 262.",
        "kind": "textual",
        "evidence": [
            ev("S10", "נְהַרְדָּעֵי אָמְרִי מִשְּׁמֵיהּ דְּרַבִּי סִימַאי", "Translation by this dossier: 'The Nehardeans say in the name of R. Simai'"),
            ev("S10", "אָמַר רַב פָּפָּא: הִילְכָּךְ נֵימְרִינְהוּ לְכוּלְּהוּ."),
            ev("S5", "אמר רב ששת: הילכך נימרינהו לכולהו"),
            ev("S2", "Statement of Rav Papa in Babli Soṭa 40a."),
        ],
        "reasoning": "A parallel is a separate text. It does not show that 'the colleagues' were the Nehardeans. The name difference in the commentary's quotation may be a slip or a variant. It was not checked against Bavli manuscripts.",
        "confidence": "medium",
        "graph_effect": "Link as a parallel passage only. Do not merge 'colleagues' with 'Nehardeans'. No Yudan-Rav Papa relation: Guggenheimer's 'good precedent' remark is his historical inference.",
    },
    {
        "finding_id": "F10",
        "claim": "Rabbi Zeira's 'only at modim' limits Rabbi Halafta ben Shaul's teaching; it does not contradict it. Penei Moshe calls it an explanation ('as R. Zeira explains, the duty is at modim only'). Ohr LaYesharim calls it narrowing the scope. Penei Moshe also joins the two Zeira sentences as one man's rule and one man's personal stricter practice.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "רִבִּי זְעִירָא אָמַר וּבִלְבַד בְּמוֹדִים", "Translation by this dossier: 'Rabbi Zeira said: but only at modim.'"),
            ev("S6", "וכדמפרש ר' זעירא שהחובה במודי' בלבד הוא", "Translation by this dossier: 'and as R. Zeira explains, the obligation is only at modim'"),
            ev("S5", "ומצמצמים את תחולת הקביעה", "Translation by this dossier: 'and they narrow the application of the rule'"),
            ev("S6", "דאע\"ג דר' זעירא אמר דאין החיוב כ\"א במודים בלבד ולא בסוף הברכה מכל מקום היה מחמיר על עצמו", "Translation by this dossier: 'although R. Zeira said the obligation is only at modim and not at the end of the blessing, nevertheless he was strict with himself'"),
        ],
        "reasoning": "The word ובלבד ('provided that / only') marks a limit. The input reader label 'explains' fits better than the first-pass 'disputes'.",
        "confidence": "high",
        "graph_effect": "Zeira explains/qualifies Halafta ben Shaul (direction: Zeira acts on Halafta's teaching). The local same-man link between the two Zeira mentions is supported by Penei Moshe.",
    },
    {
        "finding_id": "F11",
        "claim": "The verb of Zeira's practice differs by witness. The printed text and the Rome manuscript (per Ohr LaYesharim) read סבר ('was attentive to'). Ohr LaYesharim says the scribe of the base text wrote סמוך before a corrector changed it. Mareh HaPanim and Sirilio use סמך. Either way this is Zeira's own practice with the prayer leader. It is not a relation with another named person.",
        "kind": "textual",
        "evidence": [
            ev("S1", "רִבִּי זְעִירָא סָבַר לִקְרוֹבָה כְּדֵי לְשׁוּחַ עִמּוֹ תְּחִילָּה וְסוֹף", "Translation by this dossier: 'Rabbi Zeira was attentive to the prayer leader, so as to bow with him at the beginning and the end.'"),
            ev("S5", "(כך כתב הסופר במסירה שלפנינו, ומגיה מחק והגיה 'סבר', כמו שהוא בכתב יד רומי, וכך נראה שצריך לגרוס)"),
            ev("S7", "וגריס שם סמך לקרובה"),
            ev("S8", "סמך לקרובה כדי לשוח עמו וכו'."),
        ],
        "reasoning": "This does not change who appears. It shows how witnesses differ even inside a short sentence.",
        "confidence": "medium",
        "graph_effect": "Action on Zeira (practice). No person-person edge.",
    },
    {
        "finding_id": "F12",
        "claim": "The observer is written יֹסֵא in the fetched vocalised text, יסא in the input's plain text, and ייסא in Haggahot RaDO, and Guggenheimer translates 'Rebbi Yose'. Ohr LaYesharim identifies him as Rabbi Asi. Guggenheimer (footnote 255) reads 'came up here' as moving from Babylonia to the Land of Israel.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "רִבִּי יֹסֵא כַּד סַלִּיק לְהָכָא חַמְתֵּין גְּחָנִין וּמְלַחֲשִׁין", "Translation by this dossier: 'Rabbi Yose/Yisa, when he came up here, saw them bending and whispering.'"),
            ev("S5", "רבי יסא (רבי אסי, אמורא ארץ ישראלי בדור השלישי)"),
            ev("S9", "דקא מתמה ושאל מה מלחשין"),
            ev("S2", "“Coming up” means making aliyah from Babylonia to Israel."),
        ],
        "reasoning": "The spellings differ, and the commentary's identification of him with Asi is an identity proposal. The Rabbi Yose who is a common name in the English translation should not be merged with him by label.",
        "confidence": "medium",
        "graph_effect": "One local person with surface forms יֹסֵא/יסא/ייסא and the identity proposal 'R. Asi (Ohr LaYesharim)'. Add a scene: he saw the congregation and asked them a question (addresses: anonymous congregation). He is not linked to the chain members (F2).",
    },
    {
        "finding_id": "F13",
        "claim": "Four names in the passage carry a family link: Halafta 'ben Shaul', Abba 'bar Zavda', Samuel 'bar [Inia]', and 'Bar Qappara'. Each patronymic points to a parent who never speaks. For Samuel, the father's name differs by witness. Guggenheimer prints [אִינְיָא] from the Rome manuscript, and his footnote lists Mina (Venice print), Ina, Idi, Bina, Yonah, Yanna and Yannai elsewhere. Ohr LaYesharim's lemma is מינא, and it reports 'בר אינה' in Maimonides' Hilkhot HaYerushalmi. For Bar Qappara, Guggenheimer's footnote 261 gives a full name and says he was born after his father's death. That is the commentator's historical inference.",
        "kind": "textual",
        "evidence": [
            ev("S1", "רִבִּי שְׁמוּאֵל בַּר [אִינְיָא] בְשֵׁם רִבִּי אָחָא"),
            ev("S2", "the form given here is from the Rome manuscript. In the Venice print it appears as Mina, at other places in the Yerushalmi it appears as Ina, ldi, Bina, Yonah, Yanna, Yannai."),
            ev("S5", "רבי שמואל בר מינא (בכתב יד רומי: 'בר איניא', ובהלכות הירושלמי לרמב\"ם: 'בר אינה'."),
            ev("S1", "תָּנָא רִבִּי חֲלַפְתָּא בֶּן שָׁאוּל"),
            ev("S1", "רִבִּי בָּא בַּר זַבְדָּא בְשֵׁם רַב"),
            ev("S2", "His full name was R. Eleazar, son of R. Eleazar the Qappar."),
        ],
        "reasoning": "Project rule: a relationship embedded in a name is evidence. Keep a local parent placeholder even though the parent plays no role. For Samuel's father, keep all the name variants and pick none. For 'Bar Qappara', whether this is literal kinship or a fixed name is genuinely unclear from this passage.",
        "confidence": "high",
        "graph_effect": "kin(child to parent placeholder) for Halafta to Shaul, Abba to Zavda, and Samuel to [Inia/Mina/...]. For Bar Qappara, add kin-or-name (unclear) to a 'Qappara' placeholder. The Eleazar identification is attached as an identity proposal only.",
    },
    {
        "finding_id": "F14",
        "claim": "Guggenheimer's footnotes add teacher/training claims that the passage itself does not make. Samuel bar Inia is 'A student of Rebbi Aḥa' (footnote 260). Abba bar Zavda 'received his training in the Babylonian academy of Rav' (footnote 259). The text says only 'in the name of' in both cases.",
        "kind": "interpretation",
        "evidence": [
            ev("S2", "A student of Rebbi Aḥa, Israeli Amora of the fourth generation."),
            ev("S2", "An Israeli Amora who received his training in the Babylonian academy of Rav."),
        ],
        "reasoning": "'In the name of' is a transmission claim. Teacher-student is a stronger biographical claim that comes from outside this passage.",
        "confidence": "high",
        "graph_effect": "Text-level edges: cites(Samuel to Aha), cites(Abba bar Zavda to Rav). Teacher edges only as commentary-sourced proposals.",
    },
    {
        "finding_id": "F15",
        "claim": "Rabbi Yudan's closing remark, 'the rabbis used to say all of them, and some say one or the other', is read in different ways. Penei Moshe glosses the second clause as 'either this formula or that, and they do not say all of them'. Haggahot RaDO reads Yudan's words as explaining what puzzled Rabbi Yisa: which of the formulas they were saying. Ohr LaYesharim reports that Maimonides' Hilkhot HaYerushalmi adds 'and some say: they combine all of them'.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "אָמַר רִבִּי יוּדָן נְהִגִּין רַבָּנִין אָמְרִין כּוּלְּהוֹן. וְאִית דְּאָמְרִין אוֹ הֲדָא אוֹ הֲדָא.", "Translation by this dossier: 'Rabbi Yudan said: the rabbis are accustomed to say all of them. And some say: either this one or that one.'"),
            ev("S6", "או נוסח הזה או הזה ולא אמרין כולהון"),
            ev("S9", "נ\"ל דר' יהודא בא לתרוצי התמיה של ר' ייסא", "Translation by this dossier: 'It seems to me that R. Yehuda comes to resolve the puzzlement of R. Yisa'"),
            ev("S5", "בהלכות הירושלמי לרמב\"ם נוסף כאן '(ו)אית דאמרי[ן]: כללין כולהון'"),
        ],
        "reasoning": "Haggahot RaDO calls the speaker ר' יהודא/יהודה, not Yudan. That is a spelling in the commentary. The link to Yisa is RaDO's interpretation, not something the text says.",
        "confidence": "medium",
        "graph_effect": "Optional commentary-branch edge: Yudan's remark answers Yisa's question (RaDO). No Yudan-chain edges.",
    },
    {
        "finding_id": "F16",
        "claim": "Exact-phrase searches of the public Sefaria index for 'יוחנן בשם רבי ירמיה' and 'חייא בשם רבי סימאי' returned only this passage. 'ירמיה בשם רבי חנינא' returned only one unrelated medieval hit. 'מיישא בשם רבי חייא' returned only Ohr LaYesharim's own gloss here. So no parallel chain was found that would settle either segmentation.",
        "kind": "uncertainty",
        "evidence": [
            ev("S13", "Jerusalem Talmud Berakhot 1:5:14"),
            ev("S14", "Jerusalem Talmud Berakhot 1:5:14"),
            ev("S18", "Ohr LaYesharim on Jerusalem Talmud Berakhot 1:5:14"),
            ev("S17", "Sefer HaTashbetz, Part III 71:3"),
        ],
        "reasoning": "Exact-phrase search misses abbreviations (ר'), spelling variants and texts outside the index. Finding nothing is scoped to these four searches. It does not show that no parallel exists.",
        "confidence": "low",
        "graph_effect": "None. Records the limit of the check.",
    },
]

ALTERNATIVES = [
    {"reading_id": "A-GUG", "who": "Guggenheimer translation and footnotes (S2)",
     "segmentation": ["Helbo, Shimon (grouping unclear) in the name of Yohanan in the name of Jeremiah", "Hanina in the name of Miasha", "Hiyya in the name of Simai; alternative: colleagues in the name of Simai"],
     "identities": {"Jeremiah": "late Tanna, student of Yehudah ben Batyra (fn 256)", "Miasha": "early Tanna, late Second Temple (fn 257)"},
     "basis": "translation punctuation plus footnotes; follows every printed בשם"},
    {"reading_id": "A-OL", "who": "Ohr LaYesharim (S5)",
     "segmentation": ["Helbo in the name of Shimon (bar Ba) in the name of Yohanan", "Yirmeya [in the name of] Hanina (bar Hama) - the connective per RZ\"P", "Meisha in the name of Hiyya (bar Ba) in the name of Simai; alternative: colleagues in the name of Simai"],
     "identities": {"Yirmeya": "Palestinian Amora, 3rd-4th generation", "Meisha": "Palestinian Amora, 3rd-4th generation", "Shimon": "Shimon bar Ba / bar Abba", "Hiyya": "Hiyya bar Ba", "Hanina": "bar Hama", "Yisa": "R. Asi"},
     "basis": "commentary with editorial operations: brackets בשם after Yohanan; follows RZ\"P in deleting the corrector's בשם before Meisha and adding one before Hanina; supplies בשם at Helbo-Shimon and Meisha-Hiyya"},
    {"reading_id": "A-TEXT", "who": "Printed Hebrew without added words (S1)",
     "segmentation": "Four explicit בשם joins; three bare juxtapositions left open",
     "identities": "none asserted",
     "basis": "the words alone"},
    {"reading_id": "A-TRADITIONS", "who": "Other commentaries fetched (Penei Moshe, Mareh HaPanim, Sirilio, Haggahot RaDO)",
     "segmentation": "Not addressed. Penei Moshe abbreviates 'ר' חלבו וכו''. The others do not comment on the chain.",
     "identities": "none for the chain",
     "basis": "absence of comment in these fetched segments only; not evidence for either reading"},
]

UNRESOLVED = [
    "Which Yirmeya and which Miasha/Meisha are meant. Two identity proposals exist (F4, F5), each coupled to its own segmentation. Nothing checked here decides between them.",
    "Whether Helbo reports in Shimon's name or the two are co-reporters. Ohr LaYesharim supplies בשם, and Guggenheimer's comma does not choose.",
    "Whether the alternative 'the colleagues in the name of R. Simai' replaces only Hiyya or bears on the whole list.",
    "The identity of the editor abbreviated רז\"פ, whom Ohr LaYesharim cites. The fetched text does not expand it.",
    "No manuscript images or apparatus were consulted. The Rome MS readings, the corrector ('מגיה') and the scribe's own readings are all reported by Ohr LaYesharim.",
    "What supports Guggenheimer's footnote 256 (Tanna Jeremiah, student of Yehudah ben Batyra). No source is cited in the fetched note, and none was found here.",
    "Whether Ohr LaYesharim's 'אמר רב ששת' in its quotation of Sotah 40a is a variant or a slip. The fetched Bavli has Rav Papa.",
]

CORRECTIONS = [
    {"existing_claim_id": "yerushalmi|Jerusalem Talmud Berakhot|1|5:14|4|47", "change": "Keep the reader label 'explains' with direction Zeira acting on Halafta ben Shaul. Reject the first-pass 'disputes'.", "why": "F10: ובלבד limits the rule. Penei Moshe says 'כדמפרש' (explains), and Ohr LaYesharim 'narrows the application'."},
    {"existing_claim_id": "yerushalmi|Jerusalem Talmud Berakhot|1|5:14|195|204", "change": "Keep 'juxtaposed' as the text-level edge. Add a conditional 'cites (Helbo in the name of Shimon)' on the Ohr LaYesharim branch.", "why": "F1, F5: no connective in the text. The commentator supplies one."},
    {"existing_claim_id": "yerushalmi|Jerusalem Talmud Berakhot|1|5:14|212|225", "change": "Keep 'cites (Yohanan in the name of Yirmeya)' as the printed-text edge, but mark it contested. Ohr LaYesharim brackets this בשם and starts a new chain. Attach both identity proposals for Yirmeya, and remove any unqualified 'chronologically backwards' judgement.", "why": "F4, F5, F7: the chronology depends on which Yirmeya is meant."},
    {"existing_claim_id": "yerushalmi|Jerusalem Talmud Berakhot|1|5:14|225|234", "change": "Keep 'juxtaposed'. Add a conditional 'cites (Yirmeya in the name of Hanina)' tagged as a later emendation (RZ\"P via Ohr LaYesharim).", "why": "F6."},
    {"existing_claim_id": "yerushalmi|Jerusalem Talmud Berakhot|1|5:14|234|248", "change": "Keep 'cites (Hanina in the name of Miasha)' on the printed-text and Guggenheimer branches. Record that, per Ohr LaYesharim, the בשם is a corrector's addition matching the Rome MS and is deleted by RZ\"P. On the Ohr LaYesharim branch there is no edge.", "why": "F6."},
    {"existing_claim_id": "yerushalmi|Jerusalem Talmud Berakhot|1|5:14|248|257", "change": "Downgrade from 'cites' (cheap, 0.93) to 'juxtaposed'. Add a conditional 'cites (Meisha in the name of Hiyya)' on the Ohr LaYesharim branch only.", "why": "F1: no בשם at this join in the printed text. The connective is the commentator's (plain type). Guggenheimer does not link these two."},
    {"existing_claim_id": "yerushalmi|Jerusalem Talmud Berakhot|1|5:14|269|305", "change": "Keep the Simai/Simai same-man row, but add alternative(Hiyya, colleagues) as reporters of the teaching in Simai's name, with the colleagues as a collective node.", "why": "F8: the variant is about who transmitted it, not about Simai."},
    {"existing_claim_id": "yerushalmi|Jerusalem Talmud Berakhot|1|5:14|588|610", "change": "Extend mention A to the full name 'רבי שמואל בר [איניא]' (variant מינא). Add kin(Samuel to father placeholder with the name variants). Keep 'cites (Samuel to Aha)'. Guggenheimer's 'student of Aha' is a footnote proposal only.", "why": "F13, F14: the pair pattern '[A] בר מינא בשם [B]' shows that the patronymic was cut out of the mention."},
    {"existing_claim_id": None, "change": "Add missing local persons and relations: Yose/Yisa (observer; addresses the congregation; no link to the chain), the colleagues (collective), and parent placeholders for Shaul, Zavda and Samuel's father, plus Bar Qappara's name-or-kin link. Add Yudan's closing remark as a statement (with RaDO's optional link to Yisa).", "why": "F2, F8, F12, F13, F15."},
    {"existing_claim_id": "earlier_crosscheck (input.json)", "change": "Minor. The earlier review says Guggenheimer 'continues with Jeremiah' after Yohanan. More exactly, his English makes Yohanan transmit in Jeremiah's name ('in the name of Rebbi Yoḥanan, in the name of Rebbi Jeremiah'). The earlier review also counts the בשם before Meisha as 'in the transmitted text'. Ohr LaYesharim says a corrector added it, and the first scribe did not have it.", "why": "F3, F6."},
]

LESSONS = [
    "Packed attribution lists need a text-level edge for each join: an explicit בשם, or a bare juxtaposition. Commentator chains go on top as named branches. Never collapse to one chain without naming its source.",
    "Segmentation and identity can depend on each other. A commentator who dates Yirmeya late will break the chain at Yirmeya. Chronology checks must state which identity branch they assume.",
    "Keep four evidence types apart for a single connective word: the printed edition, a manuscript variant (Rome MS), an in-manuscript corrector, and a later scholarly emendation (RZ\"P).",
    "An alternative that swaps the reporter ('some say: the colleagues in the name of X') is an alternative-reporter relation. It is not a same-man link between the two mentions of X.",
    "A narrator's 'had he not heard what A said' is an explicit NON-contact between the observer and A.",
    "Patronymics with unstable father names (Inia/Mina/Ina/...) need a parent placeholder carrying all the variants, not a chosen name.",
    "Footnote teacher claims ('student of Aha') are commentary-sourced proposals and must not upgrade a text-level 'in the name of' edge.",
]

dossier = {
    "job_id": "original-08",
    "focal_ref": "Jerusalem Talmud Berakhot 1:5:14",
    "status": "researched",
    "question": "Investigate the packed teaching chains, using Guggenheimer translation and footnote 256 plus Ohr LaYesharim and other available commentaries. Identify where chain boundaries are explicit and where the commentators differ. Earlier Tanna Yirmeya versus later Amora changes chronology; do not settle identity without support. Explain the Hebrew carefully in plain English.",
    "scope_note": "Checked: the focal segment in Guggenheimer's Hebrew and English (with footnotes 253-262), the neighbouring segments 1:5:13 and 1:5:15, the Sefaria links list, Ohr LaYesharim, Penei Moshe, Mareh HaPanim, Sirilio, Haggahot RaDO, Bavli Sotah 40a:11-12, and six exact-phrase index searches. Not checked: manuscripts, other Yerushalmi editions, biographical reference works. Quotes are matched against the saved JSON text fields with HTML tags removed. All translations marked 'by this dossier' are this dossier's own.",
    "sources": SOURCES,
    "findings": FINDINGS,
    "alternative_readings": ALTERNATIVES,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
    "graph_status": "All proposals are provisional. No historical identity or global merge is proposed.",
}
(HERE / "dossier.json").write_text(json.dumps(dossier, ensure_ascii=False, indent=1) + "\n")
print("ok", len(FINDINGS), "findings,", sum(len(f["evidence"]) for f in FINDINGS), "quotes verified")
