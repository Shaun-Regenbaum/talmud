"""Build dossier.json for job original-01 from the saved files in sources/.

Every evidence quote is checked against the saved bytes (HTML tags removed)
before the dossier is written. A quote that is not found stops the build.
"""

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "sources"
# File mtimes are local wall-clock (UTC+3 on the fetch machine); the first
# fetch was logged by `date -u` as 2026-09-22T20:22:12Z at mtime 23:22:12.
LOCAL_OFFSET = timedelta(hours=3)

V3 = "https://www.sefaria.org/api/v3/texts/"
SOURCES = [
    ("S01", "sefaria_v3_gittin_50a_he.json", V3 + "Gittin.50a?version=hebrew&return_format=text_only",
     "William Davidson Edition - Vocalized Aramaic (Sefaria), Gittin 50a"),
    ("S02", "sefaria_v3_gittin_50a_en.json", V3 + "Gittin.50a?version=english&return_format=text_only",
     "William Davidson Edition - English (Koren Noé / Steinsaltz), Gittin 50a"),
    ("S03", "sefaria_v3_gittin_49b_he.json", V3 + "Gittin.49b?version=hebrew&return_format=text_only",
     "William Davidson Edition - Vocalized Aramaic (Sefaria), Gittin 49b"),
    ("S04", "sefaria_v3_gittin_49b_en.json", V3 + "Gittin.49b?version=english&return_format=text_only",
     "William Davidson Edition - English, Gittin 49b"),
    ("S05", "wikisource_gittin_50a.json", V3 + "Gittin.50a?version=hebrew%7CWikisource%20Talmud%20Bavli&return_format=text_only",
     "Wikisource Talmud Bavli (Sefaria), Gittin 50a"),
    ("S06", "sefaria_links_gittin_50a_5.json", "https://www.sefaria.org/api/links/Gittin.50a.5?with_text=0",
     "Sefaria links index for Gittin 50a:5"),
    ("S07", "rashi_gittin_50a_5.json", V3 + "Rashi_on_Gittin.50a.5?version=hebrew&return_format=text_only",
     "Rashi on Gittin 50a:5, Vilna Edition"),
    ("S08", "steinsaltz_gittin_50a_5.json", V3 + "Steinsaltz_on_Gittin.50a.5?return_format=text_only",
     "Steinsaltz on Gittin 50a:5, William Davidson Edition - Hebrew"),
    ("S09", "seder_hadorot_1097.json", V3 + "Seder_HaDorot%2C_Tanaim_and_Amoraim.1097?return_format=text_only",
     "Seder HaDorot, Tanaim and Amoraim 1097, Warsaw 1878-1882"),
    ("S10", "rif_gittin_24b.json", V3 + "Rif_Gittin.24b?return_format=text_only", "Rif Gittin 24b, Vilna Edition"),
    ("S11", "halakhot_gedolot_43_3.json", V3 + "Halakhot_Gedolot.43.3?return_format=text_only",
     "Halakhot Gedolot 43:3, Warsaw 1874"),
    ("S12", "rosh_bk_1_3.json", V3 + "Rosh_on_Bava_Kamma.1.3?return_format=text_only", "Rosh on Bava Kamma 1:3, Vilna Edition"),
    ("S13", "maggid_mishneh_creditor_15_7.json",
     V3 + "Maggid_Mishneh_on_Mishneh_Torah%2C_Creditor_and_Debtor.15.7?return_format=text_only",
     "Maggid Mishneh on Mishneh Torah, Creditor and Debtor 15:7, ToratEmet"),
    ("S14", "meiri_gittin_50a.json", V3 + "Meiri_on_Gittin.50a?return_format=text_only", "Meiri on Gittin 50a, Meiri on Shas"),
    ("S15", "ramban_gittin_50a.json", V3 + "Chiddushei_Ramban_on_Gittin.50a?return_format=text_only",
     "Chiddushei HaRamban on Gittin 50a, Jerusalem 1928-29"),
    ("S16", "tosafot_rid_gittin_50a.json", V3 + "Tosafot_Rid_on_Gittin.50a?return_format=text_only",
     "Tosafot Rid on Gittin 50a, Vilna Edition"),
    ("S17", "rashba_gittin_50a.json", V3 + "Rashba_on_Gittin.50a?return_format=text_only",
     "Rashba on Gittin 50a, Gerlitz edition (Oraita)"),
    ("S18", "yam_shel_shelomoh_gittin_5_2.json", V3 + "Yam_shel_Shelomoh_on_Gittin.5.2?return_format=text_only",
     "Yam shel Shelomoh on Gittin 5:2, Shtettin 1861"),
    ("S19", "ritva_ketubot_86a_7.json", V3 + "Ritva_on_Ketubot.86a.7?return_format=text_only", "Ritva on Ketubot 86a:7"),
    ("S20", "rashba_kiddushin_13b_6.json", V3 + "Rashba_on_Kiddushin.13b.6?return_format=text_only",
     "Rashba on Kiddushin 13b:6, Gerlitz edition (Oraita)"),
    ("S21", "search_מר_זוטרא_בריה_דרב_נחמן.json", "https://www.sefaria.org/api/search-wrapper (POST exact 'מר זוטרא בריה דרב נחמן', size 100)",
     "Sefaria search index, exact phrase"),
    ("S22", "search_מר_זוטרא_בר_רב_נחמן.json", "https://www.sefaria.org/api/search-wrapper (POST exact 'מר זוטרא בר רב נחמן', size 100)",
     "Sefaria search index, exact phrase"),
    ("S23", "bavli_Sotah.10a_he.json", V3 + "Sotah.10a?version=hebrew%7CWilliam%20Davidson%20Edition%20-%20Aramaic&return_format=text_only",
     "William Davidson Edition - Aramaic, Sotah 10a"),
    ("S24", "bavli_Sanhedrin.48b_he.json", V3 + "Sanhedrin.48b?version=hebrew%7CWilliam%20Davidson%20Edition%20-%20Aramaic&return_format=text_only",
     "William Davidson Edition - Aramaic, Sanhedrin 48b"),
    ("S25", "bavli_Bava_Batra.151b_he.json", V3 + "Bava_Batra.151b?version=hebrew%7CWilliam%20Davidson%20Edition%20-%20Aramaic&return_format=text_only",
     "William Davidson Edition - Aramaic, Bava Batra 151b"),
    ("S26", "bavli_Sanhedrin.5a_he.json", V3 + "Sanhedrin.5a?version=hebrew%7CWilliam%20Davidson%20Edition%20-%20Aramaic&return_format=text_only",
     "William Davidson Edition - Aramaic, Sanhedrin 5a"),
    ("S27", "bavli_Chullin.94b_he.json", V3 + "Chullin.94b?version=hebrew%7CWilliam%20Davidson%20Edition%20-%20Aramaic&return_format=text_only",
     "William Davidson Edition - Aramaic, Chullin 94b"),
    ("S28", "bavli_Bekhorot.54b_he.json", V3 + "Bekhorot.54b?version=hebrew%7CWilliam%20Davidson%20Edition%20-%20Aramaic&return_format=text_only",
     "William Davidson Edition - Aramaic, Bekhorot 54b"),
    ("S29", "bavli_Moed_Katan.12a_he.json", V3 + "Moed_Katan.12a?version=hebrew%7CWilliam%20Davidson%20Edition%20-%20Aramaic&return_format=text_only",
     "William Davidson Edition - Aramaic, Moed Katan 12a"),
    ("S30", "rashi_sanhedrin_48b.json", V3 + "Rashi_on_Sanhedrin.48b?return_format=text_only", "Rashi on Sanhedrin 48b, Vilna Edition"),
    ("S31", "rashi_sotah_10a.json", V3 + "Rashi_on_Sotah.10a?return_format=text_only", "Rashi on Sotah 10a, Vilna Edition"),
    ("S32", "rashi_sanhedrin_5a.json", V3 + "Rashi_on_Sanhedrin.5a?return_format=text_only", "Rashi on Sanhedrin 5a, Vilna Edition"),
    ("S33", "topic_mar-zutra-b-rav-nachman.json", "https://www.sefaria.org/api/topics/mar-zutra-b-rav-nachman?with_links=1&annotate_links=1",
     "Sefaria topic graph record"),
    ("S34", "topic_rav-nachman-b-yaakov.json", "https://www.sefaria.org/api/topics/rav-nachman-b-yaakov?with_links=1&annotate_links=1",
     "Sefaria topic graph record"),
    ("S35", "topic_mar-zutra.json", "https://www.sefaria.org/api/topics/mar-zutra?with_links=1&annotate_links=1",
     "Sefaria topic graph record"),
    ("S36", "topic_rav-nachman.json", "https://www.sefaria.org/api/topics/rav-nachman?with_links=1&annotate_links=1",
     "Sefaria topic graph record (empty)"),
    ("S37", "topic_mar-zutra-b-nachman.json", "https://www.sefaria.org/api/topics/mar-zutra-b-nachman?with_links=1&annotate_links=1",
     "Sefaria topic probe, empty response"),
    ("S38", "topic_mar-zutra-b-rav-nahman.json", "https://www.sefaria.org/api/topics/mar-zutra-b-rav-nahman?with_links=1&annotate_links=1",
     "Sefaria topic probe, empty response"),
    ("S39", "hewiki_rav_nachman_bar_yaakov.json",
     "https://he.wikipedia.org/w/api.php?action=query&prop=extracts|revisions&rvprop=ids|timestamp&explaintext=1&format=json&redirects=1&titles=רב_נחמן_בר_יעקב",
     "Hebrew Wikipedia, article 'רב נחמן' (redirect target), revision 42186432 of 2025-11-16"),
    ("S40", "hewiki_mar_zutra_brei_derav_nachman_missing.json",
     "https://he.wikipedia.org/w/api.php?action=query&prop=extracts|revisions&rvprop=ids|timestamp&explaintext=1&format=json&redirects=1&titles=מר_זוטרא_בריה_דרב_נחמן",
     "Hebrew Wikipedia, title probe (page missing)"),
]


def text_of(path):
    raw = path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return raw
    parts = []

    def walk(x):
        if isinstance(x, str):
            parts.append(x)
        elif isinstance(x, list):
            for y in x:
                walk(y)
        elif isinstance(x, dict):
            for y in x.values():
                walk(y)

    walk(data)
    return re.sub(r"<[^>]+>", "", "\n".join(parts))


sources = []
texts = {}
for sid, fn, url, edition in SOURCES:
    p = SRC / fn
    b = p.read_bytes()
    local = datetime.fromtimestamp(p.stat().st_mtime)
    fetched = (local - LOCAL_OFFSET).replace(tzinfo=timezone.utc)
    sources.append({
        "source_id": sid,
        "url": url,
        "edition": edition,
        "fetched_at": fetched.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "saved_file": f"sources/{fn}",
        "sha256": hashlib.sha256(b).hexdigest(),
    })
    texts[sid] = text_of(p)

sources.append({
    "source_id": "S00",
    "url": "input.json (local path)",
    "edition": "Job input and earlier crosscheck, lake snapshot 2 (unchanged)",
    "fetched_at": None,
    "saved_file": "input.json",
    "sha256": hashlib.sha256((HERE / "input.json").read_bytes()).hexdigest(),
})
texts["S00"] = text_of(HERE / "input.json")


NIQQUD = re.compile(r"[\u0591-\u05C7]")


def voc(sid, plain):
    """Return the exact vocalized substring of a source whose niqqud-stripped form is `plain`."""
    t = texts[sid]
    idx = [i for i, c in enumerate(t) if not NIQQUD.match(c)]
    bare = "".join(t[i] for i in idx)
    k = bare.find(plain)
    if k < 0:
        raise SystemExit(f"plain quote not found in {sid}: {plain[:60]}")
    start = idx[k]
    end = idx[k + len(plain) - 1] + 1
    while end < len(t) and NIQQUD.match(t[end]):
        end += 1
    return t[start:end]


def ev(sid, quote, translation=None, note=None):
    if quote not in texts[sid]:
        raise SystemExit(f"quote not found in {sid}: {quote[:60]}")
    e = {"source_id": sid, "exact_quote": quote}
    if translation:
        e["translation_by_researcher"] = translation
    if note:
        e["note"] = note
    return e


FOCAL_VOC = voc("S01", "אמר מר זוטרא בריה דרב נחמן, משמיה דרב נחמן")
FOCAL_WS = "אמר מר זוטרא בריה דרב נחמן משמיה דרב נחמן שט\"ח היוצא על היתומין"

findings = [
    {
        "finding_id": "F01",
        "claim": "The focal sentence carries two separate textual relations: Mar Zutra is named as son (בריה) of a Rav Nachman, and Mar Zutra reports a ruling in the name of (משמיה) a Rav Nachman. The text writes the name Rav Nachman twice, once in each role.",
        "kind": "textual",
        "evidence": [
            ev("S01", FOCAL_VOC, "Researcher translation: 'Mar Zutra, son of Rav Nachman, said in the name of Rav Nachman'"),
            ev("S05", FOCAL_WS, "Researcher translation: same words, unvocalized, with the abbreviation שט\"ח (promissory note)"),
        ],
        "reasoning": "בריה is Aramaic 'his son', so the construct בריה דרב נחמן means 'son of Rav Nachman'. Nothing here means son-in-law; the Aramaic for that would be חתניה. משמיה ד- means 'in the name of'. These are two grammatically independent phrases. One says who Mar Zutra's father is; the other says whose ruling he is reporting.",
        "confidence": "high",
        "graph_effect": "Keep two edges from the same local Mar Zutra mention: child_of -> RN_patronymic (literal kinship, from the name) and reports_in_name_of -> RN_quoted (the transmission). Keep a local person placeholder for the father even though, as father, he does not speak here.",
    },
    {
        "finding_id": "F02",
        "claim": "The two witnesses checked, the William Davidson Aramaic and the Wikisource Bavli text, both read בריה דרב נחמן ... משמיה דרב נחמן. Both are hosted on the same site, and this is not a manuscript collation.",
        "kind": "textual",
        "evidence": [
            ev("S01", FOCAL_VOC),
            ev("S05", FOCAL_WS),
        ],
        "reasoning": "These are digital texts on one platform. The Wikisource text follows the printed Vilna tradition. Their agreement confirms the printed reading, but it is not independent manuscript evidence.",
        "confidence": "high",
        "graph_effect": "Text reading = clear. There is no textual variant to model at this segment within what was checked.",
    },
    {
        "finding_id": "F03",
        "claim": "Medieval and later works quote the sentence with small differences in form. Rif, Halakhot Gedolot, Rosh, Rashba and Meiri keep 'בריה דרב נחמן / דר\"נ, משמיה דרב נחמן'. Tosafot Rid writes 'בר רב נחמן'. Yam shel Shelomoh's quotation leaves out 'משמיה דרב נחמן'.",
        "kind": "textual",
        "evidence": [
            ev("S10", "אמר מר זוטרא בריה דר\"נ משמיה דרב נחמן"),
            ev("S11", "אמר מר זוטרא בריה דרב נחמן משמיה דרב נחמן"),
            ev("S12", "דאמר מר זוטרא בריה דרב נחמן משמיה דר\"נ"),
            ev("S16", "אמר מר זוטרא בר רב נחמן משמיה דרב נחמן", "Researcher translation: 'Mar Zutra bar Rav Nachman said in the name of Rav Nachman'"),
            ev("S18", "אמר מר זוטרא בריה דרב נחמן שטר חוב היוצא על היתומים", "Researcher translation: 'Mar Zutra son of Rav Nachman said: a promissory note ...' (no 'in the name of')"),
        ],
        "reasoning": "These are later quotations, not Talmud manuscripts. 'בר' and 'בריה ד-' are equivalent ways of writing a patronymic, so the son-of relation is unchanged. Yam shel Shelomoh's shorter quotation probably abbreviates, because the same passage then says 'רב נחמן ומר זוטרא בריה' (F07). It should not be read as a variant that removes Rav Nachman as the source.",
        "confidence": "medium",
        "graph_effect": "Save these as citation-form evidence, separate from source variants. Nothing changes in the graph. Do not create a variant branch that drops the reports_in_name_of edge.",
    },
    {
        "finding_id": "F04",
        "claim": "Within Gittin 49b-50a, the bare 'Mar Zutra' whose view is refuted at 50a:4 is the Mar Zutra son of Rav Nachman who speaks at 49b:9. He is the same local person as the focal speaker.",
        "kind": "textual",
        "evidence": [
            ev("S03", voc("S03", "אמר מר זוטרא בריה דרב נחמן: לא אמרן אלא מיתמי"), "Researcher translation: 'Mar Zutra son of Rav Nachman said: we said this only [when she collects] from orphans'"),
            ev("S01", voc("S01", "תיובתא דמר זוטרא תיובתא"), "Researcher translation: 'The refutation of Mar Zutra is a refutation'"),
            ev("S02", "Apropos a statement attributed to Mar Zutra, son of Rav Naḥman, the Gemara cites another halakha in his name on a similar topic", note="Editorial bridging sentence in the English; it is not in the Aramaic"),
            ev("S08", "כיון שהובאו דברי מר זוטרא בנו של רב נחמן, מביאים בשמו הלכה אחרת בנושא דומה", "Researcher translation: 'Since the words of Mar Zutra son of Rav Nachman were brought, another halakha in his name on a similar subject is brought'"),
        ],
        "reasoning": "The argument from 49b:9 to 50a:4 is one continuous discussion of Mar Zutra's distinction between collecting from orphans and collecting from the husband. The bare name at 50a:4 points back to the fully named speaker at 49b:9, and 50a:5 names him again in full. The English and the Steinsaltz Hebrew make the 'apropos' link explicit. Both come from the same editorial work, so they count as one interpretive witness, not two.",
        "confidence": "high",
        "graph_effect": "Merge the local Mar Zutra mentions at 49b:9, 49b:12, 49b:14-15, 50a:4 and 50a:5 into one local person. Do not link this bare 'Mar Zutra' to the later Mar Zutra who studied with Rav Pappa (Sefaria topic 'mar-zutra'), which is a separate person record (S35).",
    },
    {
        "finding_id": "F05",
        "claim": "The text does not say that the father in the patronymic and the Rav Nachman quoted are the same man. The reading that they are is plausible, and one commentator states it (F07), but the sentence itself does not establish it.",
        "kind": "uncertainty",
        "evidence": [
            ev("S01", FOCAL_VOC),
            ev("S00", "No biographical or parallel-passage identity study of the two Rav Nachman mentions was performed."),
        ],
        "reasoning": "A shared name is not identity. Rav Nachman bar Yitzchak is also often called just 'Rav Nachman'. Still, when a son reports in the name of someone with his father's name, the Talmud's name conventions favour reading them as one person. Otherwise the sentence would usually add a distinguishing patronymic, such as 'Rav Nachman bar Yitzchak'. This is an inference from how the texts write names, not a statement in the text.",
        "confidence": "medium",
        "graph_effect": "Keep RN_patronymic and RN_quoted as separate local mentions, linked by a same-person candidate edge with status 'plausible, commentary-supported, not explicit'. Do not assert that they are two different men either.",
    },
    {
        "finding_id": "F06",
        "claim": "Elsewhere in the Bavli, a Mar Zutra brei deRav Nachman speaks directly to a Rav Nachman (Sotah 10a and Sanhedrin 48b). The same chain 'Mar Zutra brei deRav Nachman ... in the name of Rav Nachman' recurs at Bava Batra 151b, where it is reported before Rava.",
        "kind": "textual",
        "evidence": [
            ev("S23", "אמר ליה מר זוטרא בריה דרב נחמן לרב נחמן היכי דמי פדגרא אמר ליה כמחט בבשר החי", "Researcher translation: 'Mar Zutra son of Rav Nachman said to Rav Nachman: what is gout like? He said to him: like a needle in living flesh'"),
            ev("S24", "אמר ליה מר זוטרא בריה דרב נחמן לרב נחמן היכי דמי אמר ליה כמחט בבשר החי"),
            ev("S30", "מנא ידע - רב נחמן:", "Researcher translation: Rashi: 'How did he know — [i.e.] Rav Nachman'"),
            ev("S25", "אמרוה רבנן קמיה דרבא משמיה דמר זוטרא בריה דרב נחמן דאמר משמיה דרב נחמן", "Researcher translation: 'The Rabbis said it before Rava in the name of Mar Zutra son of Rav Nachman, who said it in the name of Rav Nachman'"),
        ],
        "reasoning": "Matching this parallel to the focal man relies on the same full name form, so the identification is itself a name-based step. The parallels show that the tradition repeatedly pairs a Mar Zutra brei deRav Nachman with an unqualified Rav Nachman, once in a direct question-and-answer. They also place his transmissions in front of Rava. None of these passages says 'his father', and the Sotah and Sanhedrin passages give reasons unrelated to kinship for how Rav Nachman knew the answer.",
        "confidence": "medium",
        "graph_effect": "These are supporting evidence for the F05 same-person candidate, recorded as cross-passage evidence in their own cases. At Gittin 50a:5 they must not be counted as local observations. Sotah 10a and Sanhedrin 48b are parallel versions of one exchange, so together they are one observation, not two.",
    },
    {
        "finding_id": "F07",
        "claim": "Yam shel Shelomoh reads the quoted Rav Nachman as Mar Zutra's own father. It lists 'Rav Nachman and Mar Zutra his son' as holding one position.",
        "kind": "interpretation",
        "evidence": [
            ev("S18", "וכיון דרב נחמן ומר זוטרא בריה ואביי קיימי בחדא שיטתא ה\"ל רבא יחיד לגבייהו", "Researcher translation: 'Since Rav Nachman and Mar Zutra his son and Abaye stand in one position, Rava is a lone view against them'"),
        ],
        "reasoning": "'מר זוטרא בריה' (his son) ties the Rav Nachman named as the ruling's author to Mar Zutra's father. This is a 16th-century interpretation. It is rewording the Rif/Rosh reasoning, which names only 'Abaye and Rav Nachman' (S10, S12), not reporting a new source.",
        "confidence": "medium",
        "graph_effect": "Attach as commentary support for the same-person candidate between RN_patronymic and RN_quoted, with the commentator named. It does not prove the identity.",
    },
    {
        "finding_id": "F08",
        "claim": "Ramban identifies the Rav Nachman whose ruling this is as Rava's teacher. Under the usual convention that points to Rav Nachman bar Yaakov. Rif, Rosh, Rashba and Meiri all treat the ruling as Rav Nachman's position, transmitted by Mar Zutra.",
        "kind": "interpretation",
        "evidence": [
            ev("S15", "והא ודאי כר' נחמן קי\"ל, דרביה דרבא הוא", "Researcher translation: 'And this we certainly hold like Rav Nachman, for he is Rava's teacher'"),
            ev("S17", "וקיימא לן כמר זוטרא דאמרה משמיה דרב נחמן", "Researcher translation: 'And we hold like Mar Zutra, who said it in the name of Rav Nachman'"),
            ev("S14", "והרי שמועה זו מר זוטרא בריה דרב נחמן אמרה ובשם רב נחמן", "Researcher translation: 'This report, Mar Zutra son of Rav Nachman said it, and in the name of Rav Nachman'"),
            ev("S10", "כיון דאביי ורב נחמן קיימי בחדא שיטתא"),
        ],
        "reasoning": "Ramban identifies the quoted Rav Nachman through his teaching relationship to Rava. Ramban does not spell out 'bar Yaakov'; that step comes from wider biography (S34 lists Rava as a student of Rav Nachman [b. Ya'akov]). Rashba and Meiri separate the transmitter (Mar Zutra) from the author (Rav Nachman), which supports modelling reports_in_name_of rather than Mar Zutra's own view.",
        "confidence": "medium",
        "graph_effect": "RN_quoted: candidate global identity = Rav Nachman bar Yaakov, marked commentary-supported (Ramban) plus external biography. Any Rav Nachman -> Rava teacher edge belongs to other passages, not to this one.",
    },
    {
        "finding_id": "F09",
        "claim": "The claim that this Mar Zutra's father is Rav Nachman bar Yaakov comes only from external reference works. Hebrew Wikipedia lists a Mar Zutra among Rav Nachman bar Yaakov's sons. Seder HaDorot gathers every 'Mar Zutra bar Rav Nachman' passage under one entry but does not name the father's patronymic. The Sefaria topic graph keeps a separate record for Mar Zutra b. Rav Nachman with no parent link.",
        "kind": "interpretation",
        "evidence": [
            ev("S39", "בניו של רב נחמן - הון, מר זוטרא, רבה, מר הונא בר רב נחמן, רב אחא, ורבין - היו תלמידי חכמים.", "Researcher translation: 'The sons of Rav Nachman: Hon, Mar Zutra, Rabbah, Mar Huna bar Rav Nachman, Rav Acha and Ravin were Torah scholars'"),
            ev("S09", "מר זוטרא בר רב נחמן ברכות (מ\"ג ב') שבת (פ\"ח ב', צ\"ו א') ביצה (ל\"ד ב') ב\"מ (ד' ב') זבחים (ט' א'), משמי' דרב נחמן גיטין (נ' א') ב\"ב (קנ\"א ב')", "Researcher translation: 'Mar Zutra bar Rav Nachman: Berakhot 43b, Shabbat 88b, 96a, Beitzah 34b, Bava Metzia 4b, Zevachim 9a; in the name of Rav Nachman: Gittin 50a, Bava Batra 151b'"),
            ev("S33", "Mar Zutra b. Rav Nachman"),
        ],
        "reasoning": "The Wikipedia sentence gives no source at that point, and the article is about Rav Nachman bar Yaakov. Seder HaDorot groups passages by name form, which is exactly the kind of joining that must be checked, not taken on trust. The Sefaria record S33 carries only an 'is-a' link, and the Rav Nachman b. Ya'akov record S34 lists no children. That is absence from one database, not evidence against the identification.",
        "confidence": "low",
        "graph_effect": "RN_patronymic: candidate global identity = Rav Nachman bar Yaakov, marked external_biography and provisional. Do not write a global parent_of edge from this passage alone.",
    },
    {
        "finding_id": "F10",
        "claim": "The Mar Zutra brei deRav Nachman passages elsewhere place him among Rav Yosef, Rava, Rav Safra and Rav Huna bar Chinena. That fits a son of Rav Nachman bar Yaakov, but only once the sages' dates, taken from outside the text, are added.",
        "kind": "uncertainty",
        "evidence": [
            ev("S26", "דמר זוטרא בריה דרב נחמן דן דינא וטעה אתא לקמיה דרב יוסף", "Researcher translation: 'Mar Zutra son of Rav Nachman judged a case and erred; he came before Rav Yosef'"),
            ev("S27", "כי הא דמר זוטרא בריה דרב נחמן הוה קאזיל מסיכרא לבי מחוזא ורבא ורב ספרא הוו קא אתו לסיכרא", "Researcher translation: 'As when Mar Zutra son of Rav Nachman was going from Sikhra to Mechoza, and Rava and Rav Safra were coming to Sikhra'"),
            ev("S28", "אמר ליה מר זוטרא בריה דרב נחמן לרבא"),
            ev("S29", "מר זוטרא בריה דרב נחמן בנו ליה אפדנא מקבלי קיבולת חוץ לתחום איקלע רב ספרא ורב הונא בר חיננא"),
        ],
        "reasoning": "This is a chronological consistency check, not proof. It requires (a) identifying each of these name-form passages with the focal man and (b) external generation dates for Rav Yosef, Rava and Rav Safra. It rules out nothing for Rav Nachman bar Yitzchak by itself. The research did not establish that his sons could not have met these sages.",
        "confidence": "low",
        "graph_effect": "Use it only as a supporting note on the external-biography identity candidate. It adds no edge at Gittin 50a:5.",
    },
    {
        "finding_id": "F11",
        "claim": "'In the name of' (משמיה) does not by itself show that Mar Zutra heard Rav Nachman directly, or that Rav Nachman was his teacher.",
        "kind": "interpretation",
        "evidence": [
            ev("S01", voc("S01", "משמיה דרב נחמן")),
            ev("S00", "Reporting in someone’s name does not itself establish direct hearing, a meeting, or a teacher relationship."),
        ],
        "reasoning": "A report in someone's name can pass through other people. If the quoted teacher is the father (F05-F07), direct hearing becomes likely, and Sotah 10a shows a direct exchange (F06). Even so, both steps are inferences.",
        "confidence": "high",
        "graph_effect": "Do not add a teacher_of or met edge from this segment. Direct contact = not stated locally.",
    },
    {
        "finding_id": "F12",
        "claim": "The ruling Mar Zutra transmits is argued over in the next lines. Abaye supports it with תדע ('know that'), and Rava objects to Abaye. Medieval codifiers rule in favour of Rav Nachman/Abaye against Rava.",
        "kind": "textual",
        "evidence": [
            ev("S01", voc("S01", "אמר אביי: תדע")),
            ev("S01", voc("S01", "אמר ליה רבא: הכי השתא?!")),
            ev("S13", "ופסק הרב כרב נחמן דאמר שטר חוב היוצא על היתומים"),
        ],
        "reasoning": "This is context for how the teaching is used. Abaye argues for the ruling; the text does not say Abaye addresses Mar Zutra or Rav Nachman. Rava speaks to Abaye (אמר ליה).",
        "confidence": "high",
        "graph_effect": "Out of scope for the focal pair. The possible local edges are Abaye supports the ruling (teaching-level) and Rava addresses and disputes Abaye. Neither is a relation between Abaye and Mar Zutra.",
    },
]

dossier = {
    "job_id": "original-01",
    "focal_ref": "Gittin 50a:5",
    "status": "researched",
    "question": "Separate the patronymic son-of relationship from quoting Rav Nachman. Investigate whether the father and quoted teacher are the same Rav Nachman, which Mar Zutra this could be, and exactly which conclusions require external biography. בריה means son; do not turn it into son-in-law.",
    "scope_checked": [
        "Gittin 49b and 50a full amudim (William Davidson Aramaic and English; Wikisource for 50a)",
        "Commentaries and codes on Sefaria linked to Gittin 50a:5: Rashi, Steinsaltz, Rif, Halakhot Gedolot, Rosh (Bava Kamma 1:3), Maggid Mishneh, Meiri, Ramban, Tosafot Rid, Rashba, Yam shel Shelomoh; Ritva Ketubot 86a:7 and Rashba Kiddushin 13b:6 were fetched and do not name the transmitter",
        "Seder HaDorot entry 1097",
        "Sefaria exact-phrase search for the two name forms, and Bavli parallels: Sotah 10a, Sanhedrin 48b, Bava Batra 151b, Sanhedrin 5a, Chullin 94b, Bekhorot 54b, Moed Katan 12a",
        "Sefaria topic records; Hebrew Wikipedia article on Rav Nachman bar Yaakov",
        "NOT checked: manuscripts or Talmud variant apparatus for Gittin 50a; Hyman, Toldot Tannaim ve-Amoraim; Albeck, Mavo la-Talmudim; Tosafot/Rashi discussion of which Rav Nachman 'stam' denotes; Epstein name lists beyond search snippets",
    ],
    "sources": sorted(sources, key=lambda s: s["source_id"]),
    "local_people": [
        {"local_id": "P1", "surface": "מר זוטרא בריה דרב נחמן", "role": "speaker/transmitter at 50a:5; same local person as Mar Zutra at 49b:9 and 50a:4 (F04)"},
        {"local_id": "P2", "surface": "רב נחמן (in בריה דרב נחמן)", "role": "father named in the patronymic; does not speak in this role; keep as placeholder"},
        {"local_id": "P3", "surface": "רב נחמן (after משמיה)", "role": "author of the reported ruling"},
    ],
    "proposed_edges": [
        {"subject": "P1", "relation": "child_of", "object": "P2", "basis": "בריה דרב נחמן", "status": "explicit_in_text", "kinship": "literal son (בריה); not son-in-law"},
        {"subject": "P1", "relation": "reports_in_name_of", "object": "P3", "basis": "משמיה דרב נחמן", "status": "explicit_in_text", "content": "a promissory note presented against orphans collects only from inferior land even if it stipulates superior land"},
        {"subject": "P2", "relation": "same_person_candidate", "object": "P3", "status": "plausible_not_explicit", "support": ["F05 naming convention", "F06 cross-passage parallels", "F07 Yam shel Shelomoh"], "symmetric": True},
    ],
    "findings": findings,
    "alternative_readings": [
        {
            "id": "A1",
            "reading": "Same man: the quoted Rav Nachman is Mar Zutra's father. The son transmits his father's ruling.",
            "who_holds_it": "Yam shel Shelomoh (S18), implicitly; consistent with the Sotah 10a / Sanhedrin 48b direct exchange and the Bava Batra 151b chain",
            "requires": "local coreference inference; no external biography needed for the local merge itself",
        },
        {
            "id": "A2",
            "reading": "Two different men named Rav Nachman: the father is one Rav Nachman, and the quoted teacher is another (for example, the father is Rav Nachman bar Yitzchak and the quoted one Rav Nachman bar Yaakov, or the reverse).",
            "who_holds_it": "No source checked states this. It remains logically open because the text does not say 'his father'.",
            "requires": "external biography to support or rule out",
        },
        {
            "id": "A3",
            "reading": "Global identity of the father = Rav Nachman bar Yaakov",
            "who_holds_it": "Hebrew Wikipedia list of his sons (S39); fits Ramban's 'Rava's teacher' for the quoted Rav Nachman (S15) if A1 holds",
            "requires": "external biography",
        },
    ],
    "unresolved": [
        "Whether any manuscript of Gittin 50a:5 lacks משמיה דרב נחמן or reads a different patronymic. No variant apparatus was checked.",
        "Which Tosafot passage reports the view, attributed to Rashi, that an unqualified 'Rav Nachman' is Rav Nachman bar Yitzchak. The Hebrew Wikipedia sentence (S39) gives no primary citation, and it was not checked.",
        "Whether older reference works (Hyman, Albeck, the Geonic chronicles) name this Mar Zutra's father explicitly. Not checked.",
        "Whether every 'Mar Zutra brei deRav Nachman' passage (S21 hits) is one man. Seder HaDorot assumes so; this study did not test it.",
        "Whether Rav Huna brei deRav Nachman (Bekhorot 54b) is Mar Zutra's brother. The text does not say so, and no sibling edge should be inferred.",
    ],
    "proposed_corrections": [
        {
            "existing_claim_id": "input pair bavli|Gittin|50a|5|4|34 (kind 'cites', a='מר זוטרא בריה דרב נחמן', b='רב נחמן')",
            "change": "Replace the single pair label with two edges from separate mentions: child_of P1->P2 (literal kinship from the patronymic) and reports_in_name_of P1->P3. Add a same-person candidate P2~P3 marked plausible_not_explicit.",
            "why": "The first-pass reader split its answer between 'cites' (0.88) and 'kin' (0.11), which shows the one label is forcing a choice between two relations that the text states together.",
        },
        {
            "existing_claim_id": "earlier_crosscheck (gittin) uncertainty.historical_identity = not_resolved",
            "change": "Keep not_resolved, and add the specific support: Yam shel Shelomoh equates the quoted Rav Nachman with the father; Ramban calls the quoted Rav Nachman Rava's teacher; Hebrew Wikipedia lists a Mar Zutra among Rav Nachman bar Yaakov's sons. Mark all three as interpretation/external evidence, not text.",
            "why": "The earlier review said no identity study had been done. This adds evidence without making the identity settled.",
        },
        {
            "existing_claim_id": None,
            "change": "Do not resolve the bare 'מר זוטרא' at Gittin 50a:4 to the global Mar Zutra (student of Rav Pappa). Resolve it to the local Mar Zutra brei deRav Nachman of 49b:9.",
            "why": "A registry lookup on the bare name would pick the more famous later sage. The local argument shows it is the same speaker (F04).",
        },
    ],
    "ontology_lessons": [
        "One sentence can carry a relation built into a name (child_of) and a speech relation (reports_in_name_of) that point to two mentions with the same name. The schema needs separate mention ids, not one name-pair label.",
        "Same-name coreference inside one sentence is its own decision (same_person_candidate), separate from both the kinship edge and global identity.",
        "Later works quoting the Talmud (Rif, Yam shel Shelomoh, Tosafot Rid) should be saved as citation-form evidence, not treated as Talmud textual variants. A shortened quotation is not a witness that a clause is missing.",
        "Parallel versions of one story (Sotah 10a and Sanhedrin 48b) count as one cross-passage observation.",
        "A bare name resolved from earlier in the discussion (50a:4 'מר זוטרא') should take the local full name, not the registry's most frequent holder of that name.",
    ],
}

(HERE / "dossier.json").write_text(json.dumps(dossier, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote dossier.json with", len(findings), "findings and", len(sources), "sources")
