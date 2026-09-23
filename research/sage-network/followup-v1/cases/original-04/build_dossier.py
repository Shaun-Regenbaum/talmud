"""Build dossier.json for original-04 and check every exact_quote against saved bytes."""
import hashlib, json, re, sys, unicodedata
from pathlib import Path

HERE = Path(__file__).parent
LOG = {e["file"]: e for e in json.loads((HERE / "sources" / "fetch-log.json").read_text())}


def strings(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, list):
        for y in x:
            yield from strings(y)
    elif isinstance(x, dict):
        for y in x.values():
            yield from strings(y)


def text_of(rel):
    raw = (HERE / rel).read_bytes()
    try:
        data = json.loads(raw)
        parts = list(strings(data))
    except ValueError:
        parts = [raw.decode()]
    return "\n".join(re.sub(r"<[^>]+>", "", p) for p in parts)


def src(sid, file, edition, note=None, url=None):
    rel = file if file.startswith("..") or file == "input.json" else "sources/" + file
    entry = LOG.get(file)
    d = {
        "source_id": sid,
        "url_or_input_path": url or (entry["url"] if entry else None),
        "edition": edition,
        "fetched_at": entry["fetched_at"] if entry else None,
        "saved_file": rel,
        "sha256": hashlib.sha256((HERE / rel).read_bytes()).hexdigest(),
    }
    if entry and "post_body" in entry:
        d["post_body"] = entry["post_body"]
    if note:
        d["note"] = note
    return d


SOURCES = [
    src("S0", "input.json", "Case input: lake snapshot 2 segment, William Davidson vocalized Aramaic plus earlier pair judgments (read only, unchanged)",
        "Not fetched; read from disk.", url="research/sage-network/followup-v1/cases/original-04/input.json"),
    src("S1", "pesachim-103a-v3.json", "Sefaria v3 API, Pesachim 103a, William Davidson Edition - Vocalized Aramaic and William Davidson Edition - English (Koren/Steinsaltz)"),
    src("S2", "pesachim-103a-wikisource.json", "Sefaria v3 API, Pesachim 103a, Wikisource Talmud Bavli (unvocalized, Vilna-based)"),
    src("S3", "pesachim-103a-goldschmidt-de.json", "Sefaria v3 API, Pesachim 103a, Lazarus Goldschmidt German translation (1929)"),
    src("S4", "rashbam-pesachim-103a.json", "Sefaria v3 API, Rashbam on Pesachim 103a, Vilna Edition"),
    src("S5", "tosafot-pesachim-103a.json", "Sefaria v3 API, Tosafot on Pesachim 103a, Vilna Edition"),
    src("S6", "rif-pesachim-20b-21a.json", "Sefaria v3 API, Rif Pesachim 20b:5-21a:1, Vilna Edition"),
    src("S7", "rosh-pesachim-10.json", "Sefaria v3 API, Rosh on Pesachim chapter 10, Vilna Edition"),
    src("S8", "halakhot-gedolot-2-6.json", "Sefaria v3 API, Halakhot Gedolot 2:6, Warsaw 1874"),
    src("S9", "berakhot-52b-v3.json", "Sefaria v3 API, Berakhot 52b, William Davidson vocalized Aramaic and English"),
    src("S10", "berakhot-52b-wikisource.json", "Sefaria v3 API, Berakhot 52b, Wikisource Talmud Bavli"),
    src("S11", "berakhot-52b-links-24.json", "Sefaria links API with text for Berakhot 52b:24 (includes Mishnah Berakhot 8:5 and Rif Berakhot 39a:4 texts)"),
    src("S12", "pesachim-103a-5-links.json", "Sefaria links API with text for Pesachim 103a:5"),
    src("S13", "seder-hadorot-995.json", "Sefaria v3 API, Seder HaDorot, Tanaim and Amoraim 995, Warsaw 1878-1882"),
    src("S14", "mt-shabbat-29.json", "Sefaria v3 API, Mishneh Torah, Sabbath 29, Torat Emet 363"),
    src("S15", "tur-oc-296.json", "Sefaria v3 API, Tur, Orach Chaim 296, Vilna 1923"),
    src("S16", "sa-oc-296.json", "Sefaria v3 API, Shulchan Arukh, Orach Chayim 296:1, Lemberg 1893"),
    src("S17", "search-huna-bar-yehuda-ikla.json", "Sefaria search-wrapper, exact phrase 'הונא בר יהודה איקלע', size 40",
        "Search index result; relevance-ranked sample of 32 hits, not an exhaustive concordance."),
    src("S18", "search-huna-berabbi-yehuda.json", "Sefaria search-wrapper, exact phrase 'רב הונא ברבי יהודה', size 40"),
    src("S19", "pesachim-103a-versions.json", "Sefaria versions list for Pesachim"),
    src("S20", "rif-pesachim-20b-5-links.json", "Sefaria links API with text for Rif Pesachim 20b:5 (includes Hagahot Chavot Yair on Pesachim 20b:1)"),
]
FAILED_OR_UNQUOTED = [
    {"saved_file": "sources/pesachim-103a-goldschmidt.json", "note": "Failed request (wrong language key); Sefaria returned a warning, no text. Retried successfully as S3."},
    {"saved_file": "sources/rashi-berakhot-52b.json", "note": "Fetched; no gloss on the Rav Huna bar Yehuda line was found in the returned text. Not evidence that no gloss exists elsewhere."},
    {"saved_file": "sources/tosafot-berakhot-52b.json", "note": "Fetched; no gloss on this line found in the returned text."},
    {"saved_file": "sources/rosh-berakhot-8-2.json", "note": "Fetched; discusses the one-cup case of the mishnah, not the visit."},
]


def ev(sid, q, tr=None, note=None):
    e = {"source_id": sid, "exact_quote": q}
    if tr:
        e["translation_by_this_dossier"] = "Translation by this dossier: " + tr
    if note:
        e["note"] = note
    return e


FINDINGS = [
    {
        "finding_id": "F1",
        "claim": "The focal segment names two people: Rav Huna bar Yehuda (the visitor) and Rava (the host). The patronymic implies a third, Yehuda, Rav Huna's father, who does not act. Unnamed plural agents bring the light and spices.",
        "kind": "textual",
        "evidence": [
            ev("S1", "רַב הוּנָא בַּר יְהוּדָה אִיקְּלַע לְבֵי רָבָא, אַיְיתוֹ לְקַמַּיְיהוּ מָאוֹר וּבְשָׂמִים.",
               "'Rav Huna bar Yehuda happened to come to the house of Rava; they brought before them light and spices.'"),
            ev("S0", "רב הונא בר יהודה איקלע לבי רבא, אייתו לקמייהו מאור ובשמים."),
            ev("S2", "רב הונא בר יהודה איקלע לבי רבא אייתו לקמייהו מאור ובשמים", note="Same wording in the unvocalized Wikisource text (shares Vilna base; not an independent witness)."),
        ],
        "reasoning": "'איקלע לבי X' is a visit formula: the subject arrives at X's household. 'אייתו' is a third-person plural verb with no named subject, so the bringers are unnamed members of the household (servants or family); they are agents but not named persons. 'לקמייהו' (before them, plural) places both men at the table. 'bar Yehuda' is a patronymic, which by project rule supports a father placeholder.",
        "confidence": "high",
        "graph_effect": "Local persons: P1 Rav Huna bar Yehuda; P2 Rava; P3 Yehuda (father of P1, name-embedded, silent); G1 unnamed household bringers (group, no identity). Edge P3 -father_of-> P1 (source: patronymic; literal kinship is the plain reading, with the variant note in F7).",
    },
    {
        "finding_id": "F2",
        "claim": "Action, target, addressee and cited authority are distinct. Action: Rava recites blessings. Objects: spices first, then light (things, not people). Addressee of the challenge: Rava. Speaker of the challenge: Rav Huna bar Yehuda, who is not named at the verb.",
        "kind": "textual",
        "evidence": [
            ev("S1", "בָּרֵיךְ רָבָא אַבְּשָׂמִים בְּרֵישָׁא וַהֲדַר אַמָּאוֹר. אֲמַר לֵיהּ: וְהָא בֵּין בֵּית שַׁמַּאי וּבֵין בֵּית הִילֵּל — מָאוֹר בְּרֵישָׁא וַהֲדַר אַבְּשָׂמִים.",
               "'Rava blessed over the spices first and then over the light. He said to him: But [according to] both Beit Shammai and Beit Hillel, light is first and then spices!'"),
            ev("S1", "עָנֵי רָבָא בָּתְרֵיהּ וְאָמַר", "'Rava answered after him and said.'"),
            ev("S4", "א\"ל - רב הונא לרבא לאחר שגמר הבדלה",
               "Rashbam: '\"He said to him\" - Rav Huna to Rava, after he had finished havdala.'"),
            ev("S7", "אמר ליה רב הונא והא בין ב\"ש וב\"ה מאור ואחר כך בשמים",
               "Rosh's quotation of the passage: 'Rav Huna said to him: But between Beit Shammai and Beit Hillel, light and afterwards spices.'"),
        ],
        "reasoning": "'אמר ליה' has no named subject. The later segment names Rava as the one who answers ('עני רבא בתריה'), so the challenger must be the other man present, Rav Huna. Rashbam states this explicitly, and the Rosh's quotation inserts 'רב הונא' as subject. These are commentary and codifier readings, not a different Talmud text. The spices and light are objects of the blessing, so the 'target' of the action is not a person.",
        "confidence": "high",
        "graph_effect": "Edge P1 -addresses/challenges-> P2 (direction P1 to P2), resolved from context; mark speaker as 'inferred from later segment, confirmed by Rashbam'. Edge P2 -responds_to-> P1 from 103a:7. The response is part of the same exchange, not a second independent observation of the same relation. No person edge from the blessing itself.",
    },
    {
        "finding_id": "F3",
        "claim": "In the Pesachim version the anonymous Gemara, not Rav Huna, supplies the source for his objection (the mishnah of Beit Shammai and Beit Hillel). In the Berakhot 52b parallel Rav Huna himself cites the source. The cited authority differs by version in who does the citing.",
        "kind": "textual",
        "evidence": [
            ev("S1", "וּמַאי הִיא? דִּתְנַן, בֵּית שַׁמַּאי אוֹמְרִים: נֵר וּמָזוֹן, בְּשָׂמִים וְהַבְדָּלָה. וּבֵית הִילֵּל אוֹמְרִים: נֵר וּבְשָׂמִים, וּמָזוֹן וְהַבְדָּלָה.",
               "'And what is it? As we learned [in a mishnah]: Beit Shammai say: candle and food, spices and havdala. And Beit Hillel say: candle and spices, food and havdala.'"),
            ev("S9", "אֲמַר לֵיהּ: מִכְּדִי בֵּית שַׁמַּאי וּבֵית הִלֵּל אַמָּאוֹר לָא פְּלִיגִי, דְּתַנְיָא בֵּית שַׁמַּאי אוֹמְרִים: נֵר וּמָזוֹן, בְּשָׂמִים וְהַבְדָּלָה.",
               "Berakhot 52b: 'He said to him: Since Beit Shammai and Beit Hillel do not disagree about the light, as it is taught: Beit Shammai say: candle and food, spices and havdala.'"),
            ev("S11", "בֵּית שַׁמַּאי אוֹמְרִים, נֵר וּמָזוֹן וּבְשָׂמִים וְהַבְדָּלָה. וּבֵית הִלֵּל אוֹמְרִים, נֵר וּבְשָׂמִים וּמָזוֹן וְהַבְדָּלָה.", note="Mishnah Berakhot 8:5, the cited source."),
        ],
        "reasoning": "'ומאי היא' is the stam editor's question interrupting the story, so in Pesachim the explicit citation belongs to the editor's voice glossing Rav Huna's claim. In Berakhot the citation continues Rav Huna's own sentence. The Berakhot WD text has 'דתניא' (a baraita formula) while the source is a mishnah; Rif Berakhot (S11) reads 'דתנן'.",
        "confidence": "medium",
        "graph_effect": "Record Beit Shammai and Beit Hillel as cited groups (schools), not persons. Attach the citation to P1 only for the Berakhot version; for Pesachim attach it to the anonymous editorial voice with P1's claim as the target. No person-to-person edge between P1 and the schools.",
    },
    {
        "finding_id": "F4",
        "claim": "Rava's reply cites two tannaim: he assigns the mishnah's version to Rabbi Meir and quotes Rabbi Yehuda's contrary version, in which Beit Hillel put spices before light. A statement of Rabbi Yohanan follows: people follow Beit Hillel as Rabbi Yehuda reports them.",
        "kind": "textual",
        "evidence": [
            ev("S1", "זוֹ דִּבְרֵי רַבִּי מֵאִיר, אֲבָל רַבִּי יְהוּדָה אוֹמֵר: לֹא נֶחְלְקוּ בֵּית שַׁמַּאי וּבֵית הִילֵּל עַל הַמָּזוֹן שֶׁהוּא בַּתְּחִלָּה וְעַל הַבְדָּלָה שֶׁהִיא בַּסּוֹף,",
               "'This is the statement of Rabbi Meir; but Rabbi Yehuda says: Beit Shammai and Beit Hillel did not disagree about food, that it is first, and about havdala, that it is last.'"),
            ev("S1", "וּבֵית הִילֵּל אוֹמְרִים: בְּשָׂמִים וְאַחַר כָּךְ מָאוֹר. וְאָמַר רַבִּי יוֹחָנָן: נָהֲגוּ הָעָם כְּבֵית הִילֵּל וְאַלִּיבָּא דְּרַבִּי יְהוּדָה.",
               "'And Beit Hillel say: spices and afterwards light. And Rabbi Yohanan said: The people are accustomed [to follow] Beit Hillel according to Rabbi Yehuda.'"),
            ev("S4", "זו דברי ר\"מ - דהכי הוו תני לפלוגתייהו דב\"ש וב\"ה דסתם מתני' ר\"מ",
               "Rashbam: 'This is the statement of R. Meir - for so he would teach their dispute; an anonymous mishnah is R. Meir.'"),
        ],
        "reasoning": "Rabbi Meir and Rabbi Yehuda are cited authorities for rival versions of a school dispute. They are not present. Whether 'ואמר רבי יוחנן' is still Rava speaking or the editor adding a ruling is not marked in the text. In Berakhot 52b the WD edition sets it as a separate segment (52b:26). Goldschmidt renders it 'Hierzu sagte R. Joḥanan' ('On this R. Yohanan said'), also without placing it in Rava's mouth. Rabbi Yehuda the tanna here shares a name with Yehuda, father of Rav Huna. A shared name is not an identity.",
        "confidence": "high",
        "graph_effect": "Edges P2 -cites-> R. Meir (attribution of a version) and P2 -cites-> R. Yehuda (tanna). R. Yohanan: cited authority for the custom, with the citer left uncertain (P2 or the editor). No contact edge between P2 and R. Yohanan. Keep R. Yehuda (tanna) separate from P3 Yehuda.",
    },
    {
        "finding_id": "F5",
        "claim": "The later segments do not change who the participants are. 103a:7 names Rava as the answerer, which fixes the addressee of the challenge. 103a:9 starts a separate visit by a different man, Rav Ya'akov bar Abba, to Rava's house. It must not be merged with Rav Huna bar Yehuda's visit.",
        "kind": "textual",
        "evidence": [
            ev("S1", "עָנֵי רָבָא בָּתְרֵיהּ וְאָמַר: זוֹ דִּבְרֵי רַבִּי מֵאִיר"),
            ev("S1", "רַב יַעֲקֹב בַּר אַבָּא אִיקְּלַע לְבֵי רָבָא, חַזְיֵהּ דְּבָרֵיךְ ״בּוֹרֵא פְּרִי הַגֶּפֶן״ אַכָּסָא קַמָּא",
               "'Rav Ya'akov bar Abba happened to come to Rava's house; he saw that he blessed \"who creates the fruit of the vine\" over the first cup.'"),
            ev("S4", "רבי יעקב בר אבא איקלע לבי רבא - שבת הוא",
               "Rashbam: 'R. Ya'akov bar Abba happened to Rava's house - it was Shabbat.'",
               note="Rashbam's lemma reads 'רבי' where the WD Gemara reads 'רב'; a title variant in the next episode, noted only."),
        ],
        "reasoning": "The same visit formula recurs with a different visitor and a different practice (wine blessings), and Rashbam dates it to Shabbat itself, while he places the Rav Huna visit on an ordinary Saturday night. Nothing in 103a:6-8 introduces a new speaker who could be the challenger. Scope: checked 103a:1-10 in the WD edition and Rashbam/Tosafot on 103a.",
        "confidence": "high",
        "graph_effect": "No identity change. Keep the Rav Ya'akov bar Abba visit (103a:9) as a separate event with its own local persons. Do not carry the 'challenger' role across episodes.",
    },
    {
        "finding_id": "F6",
        "claim": "Commentary adds a setting the Aramaic does not state. Rashbam puts the visit on an ordinary Saturday night, says the challenge came after havdala was finished, and says Rava's order matches his own community's custom. The WD English 'After Shabbat' and 'Rava acted as dictated by this custom' are translator glosses.",
        "kind": "interpretation",
        "evidence": [
            ev("S4", "רב הונא בר יהודה איקלע לבי רבא - במוצאי שבת של חול",
               "Rashbam: 'on an ordinary (weekday) Saturday night' (i.e., not a festival following Shabbat)."),
            ev("S4", "בריך אבשמים ברישא - כמנהג שלנו", "Rashbam: 'blessed over spices first - as our custom is.'"),
            ev("S1", "After Shabbat, <b>they brought before them a light and spices.", note="WD English: 'After Shabbat' is unbolded, i.e., the translator's addition."),
            ev("S1", "Rava acted as dictated by this custom.", note="WD English, unbolded gloss at the end of 103a:8."),
        ],
        "reasoning": "The sugya before (103a:1-4) concerns a festival that follows Shabbat. Rashbam separates this story from that case. The bold/unbold convention in the WD English marks literal translation versus added explanation. The glosses are reasonable, but they are interpretation, not text.",
        "confidence": "high",
        "graph_effect": "Event attributes (Saturday night, after havdala) are commentary-sourced and should be tagged as such. They do not change persons or edges.",
    },
    {
        "finding_id": "F7",
        "claim": "The name has a textual variant. Rif on Pesachim reads 'רב הונא ברבי יהודה'. The Talmud editions checked, the Rif on Berakhot, the Rosh on Pesachim and Halakhot Gedolot read 'בר יהודה'. The variant bears on whether the father is a titled Rav/Rabbi Yehuda. It does not remove the father relation.",
        "kind": "uncertainty",
        "evidence": [
            ev("S6", "רב הונא ברבי יהודה ", "Rif Pesachim: 'Rav Huna berabbi Yehuda'", note="In the saved text a Hagahot Chavot Yair marker (label א) stands between this and the next words 'איקלע לבי רבא'; quoted as two pieces."),
            ev("S6", "איקלע לבי רבא", "'happened to Rava's house'"),
            ev("S20", "עיין ברי\"ף בברכות פ' אלו דברים", "Hagahot Chavot Yair on Rif Pesachim 20b:1: 'See the Rif in Berakhot, chapter Elu Devarim' (a cross-reference to the parallel, which reads 'בר יהודה'). It does not comment on the name."),
            ev("S11", "רב הונא בר יהודה איקלע לבי רבא חזייה דבריך אבשמים והדר אמאור", note="Rif Berakhot 39a:4, same event, reads 'בר'."),
            ev("S7", "רב הונא בר יהודה איקלע לבי רבא אייתי לקמיה מאור ובשמים", note="Rosh on Pesachim 10:9."),
            ev("S8", "דרב הונא בר יהודה איקלע לבי רבא אייתי לקמייהו מאור ובשמים", note="Halakhot Gedolot 2:6."),
            ev("S13", "איקלע לבי רבא ברכות (נ\"ב ב') פסחים (ק\"ג א')", note="Seder HaDorot lists both visits under Rav Huna bar Yehuda."),
            ev("S13", "גם צ\"ע שהיה בימי רב יהודה ורבא אם לא שנים היו",
               "Seder HaDorot: 'also needs study, that he lived in the days of Rav Yehuda and of Rava, unless there were two.'"),
        ],
        "reasoning": "'ברבי' can mean 'son of Rabbi/Rav' or be a scribal expansion of an abbreviated 'ב\"ר'. The Rosh elsewhere writes 'רב הונא ב\"ר יהודה' (S7, 10:8), which shows how the abbreviation can arise. The Rif Pesachim reading is one printed witness against several; manuscripts were not checked. Seder HaDorot's doubt about one or two men of this name is a later historical question, not a text variant.",
        "confidence": "medium",
        "graph_effect": "Keep P1 with name forms ['רב הונא בר יהודה' (majority of checked witnesses), 'רב הונא ברבי יהודה' (Rif Pesachim)]. Keep P3 as the father, marked 'title of father uncertain by variant'. Do not merge P1 with 'Rav Huna son of Rav Yehuda' or with any other Rav Huna globally without an identity pack.",
    },
    {
        "finding_id": "F8",
        "claim": "Some witnesses say the items were brought 'before him' (singular, Rava) rather than 'before them'. The Rif and Rosh also add 'פתח רבא' ('Rava began'). Rava's presence is certain either way. Rav Huna's presence at the table rests on the visit plus his speaking, not only on 'before them'.",
        "kind": "textual",
        "evidence": [
            ev("S6", "אייתו לקמיה מאור ובשמים פתח רבא בריך אבשמים ברישא", "Rif: 'they brought before him light and spices; Rava began, blessed over spices first.'"),
            ev("S7", "אייתי לקמיה מאור ובשמים פתח רבא בריך", note="Rosh, singular 'לקמיה'."),
            ev("S8", "אייתי לקמייהו מאור ובשמים שקל רבא בריך על בשמים ברישא", note="Halakhot Gedolot, plural 'לקמייהו', with 'שקל רבא' ('Rava took')."),
        ],
        "reasoning": "A co-presence edge between P1 and P2 should cite the visit formula and the direct speech, which appear in all versions checked, not the plural pronoun alone.",
        "confidence": "high",
        "graph_effect": "P1-P2 co-present (symmetric, saved once), evidence = 'איקלע לבי' + 'אמר ליה'. Tag 'לקמייהו' as version-dependent.",
    },
    {
        "finding_id": "F9",
        "claim": "Halakhic context: the practice Rava followed, spices before light, is the rule adopted by Halakhot Gedolot (which cites this story), the Rambam, the Tur and the Shulchan Arukh. The codes also put wine first. That part does not come from this passage.",
        "kind": "interpretation",
        "evidence": [
            ev("S8", "וכד איכא בשמים ומאור בהבדלה מברך על הבשמים ברישא והדר על מאור (פסחים קג.)",
               "Halakhot Gedolot: 'And when there are spices and light at havdala, one blesses over the spices first and then over the light (Pesachim 103a).'"),
            ev("S14", "סֵדֶר הַבְדָּלָה בְּמוֹצָאֵי שַׁבָּת. מְבָרֵךְ עַל הַיַּיִן וְאַחַר כָּךְ עַל הַבְּשָׂמִים וְאַחַר כָּךְ עַל הַנֵּר.",
               "Rambam, Shabbat 29:24: 'The order of havdala on Saturday night: bless over wine, then spices, then the candle.'"),
            ev("S15", "סדר הבדלה ", "Tur OC 296: 'Order of havdala:'", note="A commentator marker (Darkhei Moshe) stands between the two pieces in the saved text."),
            ev("S15", "יין בשמים נר הבדלה", "'wine, spices, candle, havdala.'"),
            ev("S16", "הבדלה יין בשמים נר הבדלה וסימנך יבנ\"ה", "Shulchan Arukh OC 296:1: '[The order of] havdala: wine, spices, candle, havdala; and your mnemonic is YaBNeH.'", note="The preceding word 'סדר' is separated from this piece by a Ba'er Hetev marker in the saved text."),
            ev("S5", "ואמר רבי יוחנן נהגו העם כבית הלל - והשתא חולק רבי יוחנן אסתם משנה",
               "Tosafot: 'And R. Yohanan said the people follow Beit Hillel - so now R. Yohanan disagrees with an anonymous mishnah.'"),
        ],
        "reasoning": "The halakhic outcome confirms Rava's practice, not Rav Huna's objection. Tosafot notes the tension with the anonymous mishnah and distinguishes this 'נהגו' from a weaker 'נהגו' (Taanit 26b). This is legal reception, not evidence about the people.",
        "confidence": "high",
        "graph_effect": "None for persons. Optional: link the event to a halakha node (spices before light at havdala) as its later reception.",
    },
    {
        "finding_id": "F10",
        "claim": "The same visit is told in Berakhot 52b with different wording ('he saw Rava blessing', 'since ... do not disagree about light', 'דתניא'). Rashbam says the reading 'ולא פליגי' does not belong in Pesachim, which suggests some texts carried Berakhot-like wording into Pesachim. The two tellings are one event, not two independent observations.",
        "kind": "textual",
        "evidence": [
            ev("S9", "רַב הוּנָא בַּר יְהוּדָה אִיקְּלַע לְבֵי רָבָא. חַזְיֵיהּ לְרָבָא דְּבָרֵיךְ אַבְּשָׂמִים בְּרֵישָׁא.",
               "Berakhot 52b: 'Rav Huna bar Yehuda happened to Rava's house. He saw Rava blessing over spices first.'"),
            ev("S10", "רב הונא בר יהודה איקלע לבי רבא חזייה לרבא דבריך אבשמים ברישא"),
            ev("S4", "והא בין ב\"ש כו' ולא פליגי לא גרסינן", "Rashbam: '\"But between Beit Shammai...\" - we do not read \"and they do not disagree\".'"),
        ],
        "reasoning": "Parallel tellings share the event and participants. In Berakhot 'חזייה לרבא' makes Rav Huna an observer of Rava, which is a stronger explicit co-presence than Pesachim. Counting both toward edge strength would double-count one story.",
        "confidence": "high",
        "graph_effect": "Merge Pesachim 103a:5-8 and Berakhot 52b:24-26 as one event with two textual attestations (parallel_of). Edge weights count the event once.",
    },
]

ALTERNATIVES = [
    {"id": "A1", "topic": "Who says 'ואמר רבי יוחנן'", "readings": [
        "Rava continues his reply and adds R. Yohanan's report of custom (continuous speech in 103a:8 WD).",
        "The editor adds R. Yohanan's statement after Rava's reply (Berakhot 52b WD sets it as a separate segment; Goldschmidt: 'Hierzu sagte R. Joḥanan')."],
     "evidence": ["S1 103a:8", "S9 52b:26", "S3 segment 8"], "status": "unresolved"},
    {"id": "A2", "topic": "Meaning of 'עני רבא בתריה'", "readings": [
        "WD English: 'Rava answered after him' (a response to Rav Huna).",
        "Goldschmidt: 'Da fuhr Raba fort' ('Then Rava continued')."],
     "evidence": ["S1", "S3"], "status": "Both keep Rava as speaker; only the discourse relation (reply vs continuation) differs."},
    {"id": "A3", "topic": "Name of the visitor", "readings": [
        "רב הונא בר יהודה (WD, Wikisource, Rif Berakhot, Rosh, Halakhot Gedolot).",
        "רב הונא ברבי יהודה (Rif Pesachim), possibly 'son of Rabbi/Rav Yehuda' or an expanded abbreviation."],
     "evidence": ["S6", "S11", "S7", "S8"], "status": "Source variant, not an emendation. Manuscripts not checked."},
    {"id": "A4", "topic": "Plural or singular 'before them/him'", "readings": [
        "לקמייהו (WD, Wikisource, Halakhot Gedolot)", "לקמיה (Rif, Rosh)"],
     "evidence": ["S1", "S6", "S7", "S8"], "status": "Does not affect participants."},
]

UNRESOLVED = [
    "Manuscript readings (e.g., Munich, Vatican, JTS) for Pesachim 103a and Berakhot 52b were not checked; no claim is made about whether any manuscript reads Rabbah for Rava or a different name for the visitor.",
    "Whether Rav Huna bar Yehuda here is the same man as 'Rav Huna son of Rav Yehuda' elsewhere, or one of two men of this name (Seder HaDorot's doubt). This is a historical identity question left for an identity pack.",
    "Whether R. Yohanan's statement belongs to Rava's reply or to the editor (A1).",
    "Only a relevance-ranked search sample (S17, 32 hits) was used to find other Rav Huna bar Yehuda visits (Shabbat 24a, Bava Kamma 117a). It is not a full concordance.",
]

CORRECTIONS = [
    {"existing_claim": "bavli|Pesachim|103a|5|0|27 (reader kind 'addresses', direction AB; first_pass 'before' 0.65)",
     "change": "Replace first-pass 'before' with a visit/co-presence relation (P1 visits P2's house; symmetric co-presence saved once). Keep 'addresses' P1 -> P2, but source it to 'אמר ליה' with the speaker resolved from 103a:7 and Rashbam, not to the visit pattern '[A] איקלע לבי [B]'. Add P2 -responds_to-> P1 (103a:7).",
     "why": "'איקלע לבי' is a visit formula, not 'sitting before' a master. 'לקמייהו' refers to objects placed before both men and is singular in some witnesses. The addressing is a separate act in the next clause."},
    {"existing_claim": "bavli|Pesachim|103a|5|27|62 (rule 'same-man' רבא/רבא; first_pass 'before' 0.64)",
     "change": "Keep 'same-man' (coreference of 'לבי רבא' and 'בריך רבא' to local P2). Drop the first-pass 'before'.",
     "why": "Both mentions are the host. The pattern spans the bringing of objects, and no second person is involved."},
    {"existing_claim": "(missing)",
     "change": "Add P3 Yehuda (father of Rav Huna) as a name-embedded placeholder with a father_of edge; add cited authorities R. Meir and R. Yehuda (cited by Rava), R. Yohanan (citer uncertain); Beit Shammai and Beit Hillel as groups.",
     "why": "Project rule: patronymics are kinship evidence. Cited authorities are distinct from addressee and actor."},
]

LESSONS = [
    "The visit formula 'X איקלע לבי Y' should map to visits/co-present, not to 'before' (student sits before master).",
    "An unnamed 'אמר ליה' speaker is resolved from the next named turn ('עני רבא בתריה'). Save the resolution as inferred and cite the commentary that confirms it.",
    "Separate the actor (Rava blesses), the object (spices, light: not persons), the addressee (Rava), the speaker (Rav Huna) and the cited authorities (schools, R. Meir, R. Yehuda, R. Yohanan).",
    "Editorial interjections ('ומאי היא? דתנן') can take over a citation from a character. Who cites a source can differ between parallel tellings.",
    "Parallel tellings (Pesachim 103a / Berakhot 52b) are one event and should not double edge weight.",
    "A tanna named Yehuda in the same passage as a patronymic 'bar Yehuda' is a name collision, not an identity.",
    "Translator glosses (unbolded WD English) are interpretation and must not be stored as text facts.",
]

dossier = {
    "job_id": "original-04",
    "focal_ref": "Pesachim 103a:5",
    "status": "researched",
    "question": "Reconstruct the visit, blessings, challenge to practice and cited rulings. Separate action target, addressee and cited authority. Research halachic context and whether any later verse changes the participant identity.",
    "scope_note": "Checked Pesachim 103a:1-10 (WD vocalized, WD English, Wikisource, Goldschmidt German), Rashbam and Tosafot on 103a, Rif and Rosh on the passage, Halakhot Gedolot 2:6, the Berakhot 52b parallel (WD, Wikisource, Rif Berakhot via links), Mishnah Berakhot 8:5, Seder HaDorot 995, Rambam Shabbat 29, Tur and Shulchan Arukh OC 296. No manuscripts. WD English and WD Aramaic are one editorial project; Wikisource shares the Vilna base.",
    "sources": SOURCES,
    "fetched_but_not_quoted": FAILED_OR_UNQUOTED,
    "local_persons": [
        {"id": "P1", "name": "רב הונא בר יהודה", "variants": ["רב הונא ברבי יהודה (Rif Pesachim)"], "role": "visitor; speaker of the challenge (inferred)"},
        {"id": "P2", "name": "רבא", "role": "host; performs blessings; addressee; replies and cites"},
        {"id": "P3", "name": "יהודה (father of P1)", "role": "name-embedded parent; silent", "note": "Title uncertain by variant (F7)."},
        {"id": "G1", "name": "unnamed household bringers (אייתו)", "role": "agents who bring light and spices", "type": "group"},
    ],
    "cited_authorities": [
        {"name": "בית שמאי", "type": "school", "cited_by": "anonymous editor (Pesachim) / P1 (Berakhot)"},
        {"name": "בית הלל", "type": "school", "cited_by": "anonymous editor (Pesachim) / P1 (Berakhot)"},
        {"name": "רבי מאיר", "type": "tanna", "cited_by": "P2"},
        {"name": "רבי יהודה", "type": "tanna", "cited_by": "P2", "note": "Not P3."},
        {"name": "רבי יוחנן", "type": "amora", "cited_by": "P2 or editor (unresolved)"},
    ],
    "proposed_local_edges": [
        {"a": "P1", "b": "P2", "kind": "visits", "direction": "AB", "evidence": "F1"},
        {"a": "P1", "b": "P2", "kind": "together", "direction": "", "evidence": "F1, F8"},
        {"a": "P1", "b": "P2", "kind": "addresses (challenges practice)", "direction": "AB", "evidence": "F2", "note": "speaker inferred"},
        {"a": "P2", "b": "P1", "kind": "responds_to", "direction": "AB", "evidence": "F2, F5"},
        {"a": "P3", "b": "P1", "kind": "father_of", "direction": "AB", "evidence": "F1, F7", "note": "name-embedded"},
        {"a": "P2", "b": "רבי מאיר", "kind": "cites", "direction": "AB", "evidence": "F4"},
        {"a": "P2", "b": "רבי יהודה (tanna)", "kind": "cites", "direction": "AB", "evidence": "F4"},
    ],
    "findings": FINDINGS,
    "alternative_readings": ALTERNATIVES,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
    "graph_status": "All edges provisional; local persons only; no historical identity asserted.",
}

def resolve(q, hay):
    """Return the exact source substring equal to q under NFC, keeping source code-point order."""
    target = unicodedata.normalize("NFC", q)
    if target not in unicodedata.normalize("NFC", hay):
        return None
    first = q[0]
    for i, c in enumerate(hay):
        if c != first:
            continue
        for j in range(i + len(target), min(len(hay), i + 2 * len(q) + 8) + 1):
            if unicodedata.normalize("NFC", hay[i:j]) == target:
                # extend over trailing combining marks so no mark is split off
                while j < len(hay) and unicodedata.combining(hay[j]):
                    j += 1
                if unicodedata.normalize("NFC", hay[i:j]) == target:
                    return hay[i:j]
    return None


# Verify quotes against saved bytes. Sefaria's vocalized text is not NFC-normalized, so a
# quote typed in normalized form is replaced by the exact source substring it matches.
paths = {s["source_id"]: s["saved_file"] for s in SOURCES}
cache, bad = {}, []
for f in FINDINGS:
    for e in f["evidence"]:
        p = paths[e["source_id"]]
        if p not in cache:
            cache[p] = text_of(p)
        hay = cache[p]
        q = e["exact_quote"]
        if q in hay or q in (HERE / p).read_text():
            continue
        exact = resolve(q, hay)
        if exact is None:
            bad.append((f["finding_id"], e["source_id"], q[:60]))
        else:
            e["exact_quote"] = exact
if bad:
    for b in bad:
        print("QUOTE NOT FOUND:", b)
    sys.exit(1)
(HERE / "dossier.json").write_text(json.dumps(dossier, ensure_ascii=False, indent=1))
print("ok", len(FINDINGS), "findings,", sum(len(f["evidence"]) for f in FINDINGS), "quotes verified")
