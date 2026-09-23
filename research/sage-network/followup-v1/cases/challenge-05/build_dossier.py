import json, hashlib, os, subprocess
# Build dossier.json from saved sources; every exact_quote is checked against the saved file's text.
CASE = os.path.dirname(os.path.abspath(__file__))
os.chdir(CASE)
log = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if "saved_file" in e}

def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()

def src(sid, saved, edition, url=None, note=None, fetched_at=None):
    e = log.get(saved if saved.startswith("sources/") else "sources/" + saved)
    return {"source_id": sid,
            "url_or_path": url or (e["url"] if e else None),
            "edition": edition,
            "fetched_at": fetched_at if fetched_at is not None else (e["fetched_at"] if e else None),
            "saved_file": saved,
            "sha256": sha(saved),
            **({"note": note} if note else {})}

S = "https://www.sefaria.org/api/v3/texts/"
sources = [
    src("S0", "../../../pilot/inputs/challenge-05.json", "Pilot input: Wikisource Talmud Bavli, Menachot 62a:11-13 (read-only)",
        url="research/sage-network/pilot/inputs/challenge-05.json", fetched_at="2026-09-20T08:24:03Z",
        note="fetched_at is the input's captured_at; file read, not modified"),
    src("S0b", "../../../pilot/outputs/challenge-05.json", "Pilot first reading (read-only)",
        url="research/sage-network/pilot/outputs/challenge-05.json", fetched_at=None),
    src("S0c", "previous-review.json", "Earlier independent review (read-only)",
        url="research/sage-network/followup-v1/cases/challenge-05/previous-review.json", fetched_at=None),
    src("S1", "sources/sefaria_v3_menachot_62a_all.json", "Sefaria v3 Menachot 62a, all versions: William Davidson vocalized and unvocalized Aramaic, Wikisource Talmud Bavli, William Davidson English (HTML kept)"),
    src("S2", "sources/steinsaltz_menachot_62a_11-13.json", "Steinsaltz on Menachot 62a:11-13, William Davidson Edition - Hebrew"),
    src("S3", "sources/rashi_menachot_62a_11.json", "Rashi on Menachot 62a:11, Vilna Edition"),
    src("S4", "sources/rashi_menachot_62a_13.json", "Rashi on Menachot 62a:13, Vilna Edition"),
    src("S5", "sources/rabbeinu_gershom_menachot_62a.json", "Rabbeinu Gershom on Menachot 62a, Vilna Edition"),
    src("S6", "sources/gilyon_hashas_menachot_62a.json", "Gilyon HaShas on Menachot 62a, Vilna Edition"),
    src("S7", "sources/tosafot_menachot_78b.json", "Tosafot on Menachot 78b, Vilna Edition"),
    src("S8", "sources/sefaria_v3_sotah_37a_all.json", "Sefaria v3 Sotah 37a, all versions (parallel use of the same baraita)"),
    src("S9", "sources/sefaria_v3_menachot_98a_all.json", "Sefaria v3 Menachot 98a, all versions (parallel with the same Hisda/Hamnuna answer)"),
    src("S10", "sources/sefaria_v3_shabbat_97a_17.json", "Sefaria v3 Shabbat 97a:17, Wikisource Talmud Bavli and William Davidson English"),
    src("S11", "sources/sifra_emor_ch13.json", "Sifra, Emor, Chapter 13, Venice 1545 (Sefaria)"),
    src("S12", "sources/raavad_sifra_emor_13_8.json", "Ra'avad on Sifra, Emor 13:8, Wien 1862 (Sefaria)"),
    src("S13", "sources/malbim_leviticus_emor_173.json", "Malbim on Leviticus, Emor 173 (Wikisource via Sefaria)"),
    src("S14", "sources/yalkut_shimoni_torah_644.json", "Yalkut Shimoni on Torah 644, Torat Emet (Sefaria)"),
    src("S15", "sources/torah_temimah_lev_23_20.json", "Torah Temimah on Leviticus 23:20, Vilna 1904 (Sefaria)"),
    src("S16", "sources/mt_temidin_8_11.json", "Mishneh Torah, Daily Offerings 8:11, Torat Emet Hebrew and Touger English (Sefaria)"),
    src("S17", "sources/soncino_halakhah_com_menachoth.pdf", "Soncino English translation of Menachoth, halakhah.com PDF",
        note="Quotes checked against sources/soncino_halakhah_com_menachoth.pdftotext_layout.txt (pdftotext -layout of the saved PDF)"),
    src("S18", "sources/tosafot_sotah_37a.json", "Tosafot on Sotah 37a, Vilna Edition"),
    src("S19", "sources/search_hisda_hamnuna_reversal.json", "Sefaria search-wrapper, exact phrase 'רב חסדא לרב המנונא ואמרי לה', size 100",
        note="POST body saved in fetch_log.json; exact-phrase search, so spelling variants are not covered"),
    src("S20", "sources/search_hanina_ben_hakhinai.json", "Sefaria search-wrapper, exact phrase 'חנינא בן חכינאי'"),
    src("S21", "sources/search_hanina_ben_akhinai.json", "Sefaria search-wrapper, exact phrase 'חנינא בן עכינאי'"),
    src("S22", "sources/search_between_thighs.json", "Sefaria search-wrapper, exact phrase 'בין ירכותיהן של כבשים'"),
    src("S23", "sources/sefaria_links_menachot_62a_12.json", "Sefaria links for Menachot 62a:12"),
    src("S24", "sources/sefaria_links_menachot_62a_11.json", "Sefaria links for Menachot 62a:11"),
    src("S25", "sources/sefaria_links_menachot_62a_13.json", "Sefaria links for Menachot 62a:13"),
    src("S26", "sources/tosafot_menachot_62a.json", "Tosafot on Menachot 62a, Vilna Edition (checked; nothing on the focal line)"),
    src("S27", "sources/shaarei_torat_bavel_menachot_98a.json", "Sha'arei Torat Bavel on Menachot 98a (Sefaria)"),
    src("S28", "sources/rashi_menachot_98a_19.json", "Rashi on Menachot 98a:19, Vilna Edition"),
    src("S29", "sources/sefaria_links_menachot_98a_19.json", "Sefaria links for Menachot 98a:19"),
    src("S30", "sources/sefaria_v3_menachot_78b_all.json", "Sefaria v3 Menachot 78b, all versions (context for Tosafot 78b)"),
    src("S31", "sources/rashi_menachot_98a.json", "Rashi on Menachot 98a, Vilna Edition (checked)"),
    src("S32", "sources/tosafot_menachot_98a.json", "Tosafot on Menachot 98a, Vilna Edition (checked)"),
]
path = {s["source_id"]: s["saved_file"] for s in sources}

def text_of(sid):
    p = path[sid]
    if p.endswith(".pdf"):
        return open("sources/soncino_halakhah_com_menachoth.pdftotext_layout.txt", encoding="utf-8").read()
    raw = open(p, encoding="utf-8").read()
    out = [raw]
    def walk(x):
        if isinstance(x, str): out.append(x)
        elif isinstance(x, list): [walk(y) for y in x]
        elif isinstance(x, dict): [walk(y) for y in x.values()]
    walk(json.loads(raw))
    return "\n".join(out)

import unicodedata
def unpointed_find(t, q):
    # Match ignoring combining marks (niqqud order differs by encoder); return the exact source substring.
    keep = [i for i, c in enumerate(t) if unicodedata.category(c) != "Mn"]
    bare = "".join(t[i] for i in keep)
    qb = "".join(c for c in q if unicodedata.category(c) != "Mn")
    k = bare.find(qb)
    if k < 0:
        return None
    start, end = keep[k], keep[k + len(qb) - 1] + 1
    while end < len(t) and unicodedata.category(t[end]) == "Mn":
        end += 1
    return t[start:end]

cache = {}
def ev(sid, q, **kw):
    t = cache.setdefault(sid, text_of(sid))
    if q not in t:
        exact = unpointed_find(t, q)
        assert exact, (sid, q)
        q = exact
    assert q in t
    return {"source_id": sid, "exact_quote": q, **kw}

WS12 = 'והא בעינן על א"ל רב חסדא לרב המנונא ואמרי לה רב המנונא לרב חסדא רבי לטעמיה דאמר על בסמוך'

findings = [
 {"finding_id": "F1", "kind": "textual",
  "claim": "The answer to the objection is reported in two directions: Rav Hisda to Rav Hamnuna, and 'some say' Rav Hamnuna to Rav Hisda. Only the direction differs; the content of the answer is the same in both.",
  "evidence": [ev("S1", WS12, note="Wikisource Talmud Bavli, 62a:12"),
               ev("S1", "In response, <b>Rav Ḥisda says to Rav Hamnuna, and some say</b> that <b>Rav Hamnuna</b> says <b>to Rav Ḥisda:</b>", note="William Davidson English 62a:12; bold = Aramaic, plain = editor"),
               ev("S17", "R. Hisda said to R. Hamnuna (others say, R. Hamnuna said to R. Hisda), Rabbi", note="Soncino 62a")],
  "reasoning": "Translation (mine): 'Rav Hisda said to Rav Hamnuna, and some say Rav Hamnuna to Rav Hisda: Rabbi follows his own reasoning, for he said al means next to.' Every Hebrew/Aramaic witness checked in the Bavli and both English translations keep both directions. The Davidson and Soncino English are separate translations, but both translate the same printed Bavli text, so they confirm the reading of that text, not an independent tradition.",
  "confidence": "high",
  "graph_effect": "Keep one reading group with two branches (speaker and addressee swap). Both branches share one fact: the report pairs these two sages in one said-to exchange about Rabbi's view. That pairing can be one branch-invariant, undirected co-mention edge. Directed 'speaks to' and 'explains' edges stay branch-scoped. Neither branch is evidence that the two historically met."},
 {"finding_id": "F2", "kind": "textual",
  "claim": "The same reversible attribution formula recurs: again on this page at 62a:19 (on the dispute between Rabbi and the Sages about waving after slaughter), at Menachot 98a:19 (word for word the same answer and baraita, on a different law), and at Shabbat 97a:17. The exact-phrase search returned these four Bavli segments.",
  "evidence": [ev("S1", "במאי קא מיפלגי אמר ליה רב חסדא לרב המנונא ואמרי לה רב המנונא לרב חסדא", note="Wikisource 62a:19"),
               ev("S9", "אמר ליה רב חסדא לרב המנונא ואמרי לה רב המנונא לרב חסדא רבי לטעמיה דאמר על בסמוך דתניא רבי אומר", note="Wikisource 98a:19"),
               ev("S9", "רבי אומר רואין את העליונה כאילו אינה והא בעינן (ויקרא כד, ז) ונתת על", note="Wikisource 98a:18, the different ruling that the same answer defends there"),
               ev("S10", "אמר ליה רב חסדא לרב המנונא ואמרי לה רב המנונא לרב חסדא מנא הא מילתא", note="Wikisource Shabbat 97a:17"),
               ev("S19", "Shabbat 97a:17"), ev("S19", "Menachot 98a:19"), ev("S19", "Menachot 62a:19"), ev("S19", "Menachot 62a:12")],
  "reasoning": "The four Bavli segments (Menachot 62a:12, 62a:19, 98a:19; Shabbat 97a:17) are the Bavli hits in the saved search. The other hits are Steinsaltz, Tosafot and modern commentary. The search is exact-phrase only, so it does not prove there are no other occurrences with different spelling. 62a:12 and 98a:19 share the answer and the baraita word for word, in support of two different rulings of Rabbi. That suggests one transmitted answer used in two places (a historical-literary inference, not stated by the text).",
  "confidence": "high",
  "graph_effect": "Link 62a:12 and 98a:19 as parallel passages carrying one answer. Do not count them as two independent observations of a Hisda-Hamnuna exchange. 62a:19 and Shabbat 97a:17 have different content and can count as separate attestations of the pair, but they carry the same unresolved direction."},
 {"finding_id": "F3", "kind": "uncertainty",
  "claim": "It is not fixed whether the baraita citation that follows (דתניא 'as it is taught') belongs to the speech of Rav Hisda/Rav Hamnuna or is the anonymous Talmud's supporting citation.",
  "evidence": [ev("S1", "דתניא (ויקרא כד, ז) ונתת על המערכת לבונה זכה רבי אומר על בסמוך", note="Wikisource 62a:13"),
               ev("S1", "This is <b>as it is taught</b> in a <i>baraita</i>:", note="Davidson English 62a:13: a new sentence and a separate segment; 'This is' is plain editor's text"),
               ev("S17", "follows his general view that ‘al means ‘near to’; as it was taught:", note="Soncino continues the same sentence with a semicolon; no quotation marks close the speech"),
               ev("S2", "<b>דתניא</b> <small>[ש</small>כן <small>שנויה</small> ברייתא<small>]</small>", note="Steinsaltz: 'for a baraita teaches', no speaker named"),
               ev("S8", "כדתניא (ויקרא כד, ז) ונתת על המערכת לבונה זכה רבי אומר על בסמוך", note="Sotah 37a:10: the same baraita cited with no amora present"),
               ev("S9", "This is <b>as it is taught</b> in a <i>baraita</i> that <b>Rabbi</b> Yehuda HaNasi <b>says:</b>", note="Davidson English 98a:19")],
  "reasoning": "The Aramaic has no marker that closes the amora's words. The Davidson English separates the citation into a new sentence. Soncino runs it on. Steinsaltz, Rashi and Rabbeinu Gershom explain the proof but do not say who cites it. In Sotah 37a the same baraita is used by the anonymous voice with no amora, so the citation can function without an amoraic speaker. That shows it is possible, not that it happens here. None of the commentaries checked addresses the boundary.",
  "confidence": "high",
  "graph_effect": "Add a reading group 'citation_boundary' with branches 'amora_cites' (the citation belongs to whichever speaker the direction group chose) and 'anonymous_cites' (editorial voice). Claim c7 should not be voiced 'narrator' without that note. Rabbi's own baraita teaching (c6) is shared across both branches."},
 {"finding_id": "F4", "kind": "textual",
  "claim": "The objection 'But we require al' is anonymous. The text does not say that the addressee (Hamnuna or Hisda) raised it.",
  "evidence": [ev("S1", "The Gemara raises an objection to the opinion of Rabbi Yehuda HaNasi: <b>But we require</b>", note="Davidson English; the attribution to 'the Gemara' is plain editor's text"),
               ev("S2", "ומקשים על שיטת רבי: <b>והא בעינן</b>", note="Steinsaltz: 'they object to Rabbi's view', impersonal"),
               ev("S14", "וְהָא בָּעִינַן \"עַל\", רַבִּי לְטַעְמֵהּ, דְּאָמַר \"עַל\" בְּסָמוּךְ, דְּתַנְיָא", note="Yalkut: question and answer both anonymous")],
  "reasoning": "Translation (mine): 'But we require al!' The question comes before 'X said to Y' with no speaker. Reading it as the addressee's question is possible under the 'said to' formula but is not stated. Compare Shabbat 97a:17, where the pair's exchange itself contains the question.",
  "confidence": "high",
  "graph_effect": "Keep the questioner as an anonymous editorial voice, not a person or a group of people. Do not add 'asks' edges from Hamnuna or Hisda."},
 {"finding_id": "F5", "kind": "textual",
  "claim": "Rabbi appears three times in the focal unit (the waving baraita, the answer, and the frankincense baraita). The Talmud itself links the second to the first two with 'Rabbi follows his own reasoning'. No Hebrew/Aramaic witness checked expands the name. 'Yehuda HaNasi' appears only in the editor's plain text of the Davidson English and in Steinsaltz's modern framing.",
  "evidence": [ev("S1", "רבי לטעמיה דאמר על בסמוך", note="Wikisource 62a:12"),
               ev("S1", "רבי אומר על בסמוך אתה אומר על בסמוך", note="Wikisource 62a:13"),
               ev("S1", "Rabbi</b> Yehuda HaNasi <b>says,</b> in objection to this opinion:", note="Davidson English 62a:11; 'Yehuda HaNasi' is not bold")],
  "reasoning": "'לטעמיה' (to his own reasoning) is an explicit claim by the Talmud that the Rabbi of the waving baraita and the Rabbi of the frankincense baraita hold one consistent view. That makes the local coreference textual. Identifying this Rabbi as Rabbi Yehuda HaNasi is a separate identification, by convention and by editors. The first reading anchors a mention for רבי only in s1, although its claims c6 and c8-c11 depend on the occurrences in s2 and s3.",
  "confidence": "high",
  "graph_effect": "Add mentions for רבי in s2 and s3, both linked to the local entity 'rabbi' with basis 'explicit (לטעמיה)'. Keep the historical identification as a separate, provisional step. The consistency claim says nothing about when or where Rabbi taught each view."},
 {"finding_id": "F6", "kind": "interpretation",
  "claim": "Rabbi's 'one does not do so' rejects Hanina ben Hakhinai's method of putting the bread between the thighs. It is a disagreement between views inside a baraita, not a conversation between the two.",
  "evidence": [ev("S1", "אמר רבי לפני מלך בשר ודם אין עושין כן", note="Wikisource 62a:11; 'said Rabbi', not 'said to him'"),
               ev("S3", "אין עושין כן - לתת לחם בין ירכים:", note="Rashi"),
               ev("S5", "אמר ר' לפני מלך ב\"ו אין עושין דבר מגונה כזה", note="Rabbeinu Gershom"),
               ev("S17", "(15) It is most undignified to present the bread in this manner.", note="Soncino footnote")],
  "reasoning": "Translation (mine) of Rashi: 'one does not do so: place bread between thighs'. The text uses 'אמר רבי' with no addressee. The target is fixed by context and by the commentaries, which is why this is an interpretation, though a secure one.",
  "confidence": "high",
  "graph_effect": "Keep c3 as Rabbi objecting to the statement 'between'. Do not add a person-to-person speech edge from Rabbi to Hanina, and do not infer that they met."},
 {"finding_id": "F7", "kind": "interpretation",
  "claim": "Rabbi's side-by-side ruling offers a different arrangement from every earlier view in the same baraita (the anonymous first view, bread on top; Rabbi Yosi ben HaMeshullam, lambs on top; Hanina, between the thighs). The supplied input began at Hanina's view and left out those earlier participants, and Rav Papa's interjection.",
  "evidence": [ev("S1", "מה מצינו בכל מקום לחם למעלה אף כאן לחם למעלה היכא אמר רב פפא במילואים", note="Wikisource 62a:9"),
               ev("S1", "רבי יוסי בן המשולם אומר כבשים למעלה", note="Wikisource 62a:10"),
               ev("S13", "ודעת התנא קמא שנלמד מתנופת המלואים", note="Malbim"),
               ev("S13", "ודעת ר' שפירש \"על\" בסמוך", note="Malbim"),
               ev("S7", "עד כאן לא פליגי רבי ורבנן בסוף כל המנחות [באות מצה] (לעיל מנחות דף סב.) אלא אי בעינן על בסמוך או על ממש", note="Tosafot Menachot 78b")],
  "reasoning": "Translations (mine): Malbim, 'the first tanna's view, learned from the waving at the inauguration ... Rabbi's view, who explained al as next to'. Tosafot, 'Rabbi and the Rabbis disagree only on whether we require al as next to or as literally on'. Malbim sets out four views. Tosafot presents the dispute as Rabbi against 'the Rabbis' (unnamed). Neither says which named tanna the Rabbis are. Rav Papa's 'where? at the inauguration' is an amoraic comment inside the cited baraita. The Davidson English says 'The Gemara interrupts its citation'.",
  "confidence": "medium",
  "graph_effect": "The focal unit's needed_context should include 62a:7-10. Rabbi's view can carry 'differs in view from' edges to the anonymous first view, to Yosi ben HaMeshullam and to Hanina. The Hanina edge is explicit (F6). The others rest on interpretation, from juxtaposition and commentary. Tosafot's 'Rabbanan' should stay an unnamed collective and should not be resolved to specific sages."},
 {"finding_id": "F8", "kind": "textual",
  "claim": "Hanina's name has three forms in the witnesses checked: 'חנינא בן חכינאי' (Bavli editions), 'חנינא בן עכינאי' (Sifra Venice 1545, also in Malbim) and 'חנניה בן חכינאי' (Yalkut Shimoni, Torat Emet). All three give the same teaching in the same baraita.",
  "evidence": [ev("S1", "חנינא בן חכינאי אומר מניח שתי הלחם בין ירכותיהן של כבשים ומניף", note="Wikisource 62a:11"),
               ev("S11", "חנינא בן עכינאי אומר מניח שתי הלחם בן ירכותיהם של כבשים ומניף", note="Sifra Emor 13:8, Venice 1545"),
               ev("S13", "ודעת חנינא בן עכינאי שיניח הלחם בין ירכות הכבשים", note="Malbim"),
               ev("S14", "חֲנַנְיָה בֶּן חֲכִינַאי אוֹמֵר", note="Yalkut Shimoni 644")],
  "reasoning": "These are source variants of one name in parallel versions of one teaching. They are not separate persons. Each form includes the patronymic 'בן'. So the father relation holds in every witness, though the father's name is spelled חכינאי or עכינאי. Whether 'ben X' is a literal father's name or a family or place name is not decided by this passage. The ordinary reading is a patronymic.",
  "confidence": "high",
  "graph_effect": "Keep the child_of edge (c1) and the parent placeholder. Record the placeholder's name as a variant set {חכינאי, עכינאי} with witness labels. Record Hanina's own name variants {חנינא, חנניה}. Do not create extra nodes. Do not merge with a same-named sage elsewhere on the strength of the name alone."},
 {"finding_id": "F9", "kind": "textual",
  "claim": "Not every witness to this sugya carries the Hisda/Hamnuna attribution. In the Yalkut Shimoni the answer is anonymous (and so is the parallel at 62a:19). The Sifra, a tannaitic work, has the baraita without any later answer. The Yalkut and the Sifra also word Rabbi's rhetorical line differently.",
  "evidence": [ev("S14", "וְהָא בָּעִינַן \"עַל\", רַבִּי לְטַעְמֵהּ, דְּאָמַר \"עַל\" בְּסָמוּךְ", note="Yalkut: no Hisda/Hamnuna"),
               ev("S14", "הַקָּדוֹשׁ בָּרוּךְ הוּא עַל אַחַת כַּמָּה וְכַמָּה", note="Yalkut: 'how much more so', in place of the Bavli's rhetorical 'one does so?'"),
               ev("S11", "אמר רבי, לפני מלך בשר ודם אין עושים כן, לפני מלך מלכי המלכים עושין כן?!", note="Sifra: no 'the Holy One, blessed be He'"),
               ev("S1", "לִפְנֵי מֶלֶךְ מַלְכֵי הַמְּלָכִים הַקָּדוֹשׁ בָּרוּךְ הוּא עוֹשִׂין כֵּן?!", note="Davidson vocalized, punctuated as a rhetorical question")],
  "reasoning": "The Yalkut is an anthology that often shortens what it quotes. Its silence is evidence about the anthology's text, not a Bavli manuscript variant, and it does not show that the attribution is late. No Bavli manuscripts were checked. Every wording supports reading Rabbi's line as a rhetorical argument from the lesser case to the greater (the first reading's note on c3 is right).",
  "confidence": "medium",
  "graph_effect": "Store the Yalkut's anonymous answer as evidence of type 'anthology witness'. Do not treat it as a reading branch that removes Hisda and Hamnuna. Keep the Hisda/Hamnuna attribution as the Bavli editions' reading."},
 {"finding_id": "F10", "kind": "interpretation",
  "claim": "Commentators connect Rabbi's 'al means next to' to other sages. Ra'avad explains the Sifra's Rabbi by the Bavli's reasoning. Tosafot on Sotah links it to Abba Shaul's view on the frankincense and infers that Rabbi Meir and Rabbi Yehuda read al literally there. These links belong to the commentaries, not to Menachot 62a.",
  "evidence": [ev("S12", "מניחן זה בצד זה ומניף פי' קסבר ר' על בסמוך", note="Ra'avad on Sifra"),
               ev("S18", "אבא שאול אומר שם היו נותנין בזיכי לבונה של לחם הפנים", note="Tosafot Sotah 37a, quoting the Mishnah"),
               ev("S18", "ונראה אפי' רבי מאיר ור' יהודה דפליגי התם אאבא שאול ואמרי על ממש", note="Tosafot's own inference ('it appears')"),
               ev("S15", "דס\"ל על פירושו בסמוך וכמו ועליו מטה מנשה", note="Torah Temimah footnote")],
  "reasoning": "Translation (mine) of Tosafot: 'it appears that even Rabbi Meir and Rabbi Yehuda, who disagree there with Abba Shaul, say al means literally'. This is a commentator's inference about another mishnah.",
  "confidence": "medium",
  "graph_effect": "Do not add edges from 62a to Abba Shaul, Rabbi Meir or Rabbi Yehuda. At most, store a commentary-layer 'aligned view' note with Tosafot as its voice."},
 {"finding_id": "F11", "kind": "interpretation",
  "claim": "The 'king of flesh and blood' is a hypothetical comparison figure and the Holy One is the referent of the comparison. Neither is a participant. The 'officiant' is the unnamed subject of 'he places'. The word 'priest' is only in the editor's plain text and the commentaries.",
  "evidence": [ev("S1", "there is a different answer: The priest <b>places the two loaves between the thighs of</b>", note="Davidson English: 'The priest' is plain text"),
               ev("S16", "וּמַנִּיחָן בְּצַד שְׁתֵּי הַלֶּחֶם", note="Rambam's ruling follows 'side by side'")],
  "reasoning": "The first reading types the king as a person and the questioner as a group. For a graph of people and relationships, these are a hypothetical figure, a generic role, and the editorial voice.",
  "confidence": "high",
  "graph_effect": "Retype 'king' as a hypothetical figure and 'officiant' as a generic role. Keep 'god' as a divine referent (or unknown, if the contract has no such kind). Retype 'questioner' as the editorial voice. None of them should enter the people network."},
]

alternative_readings = [
 {"id": "AR1", "about": "Direction of the answer (F1)", "readings": ["Rav Hisda speaks to Rav Hamnuna", "Rav Hamnuna speaks to Rav Hisda"],
  "status": "both kept by the text; neither preferred in any source checked"},
 {"id": "AR2", "about": "Owner of the baraita citation (F3)", "readings": ["The amoraic speaker (of either direction) cites the baraita", "The anonymous Talmud adds the citation"],
  "status": "open. Sotah 37a shows the anonymous use is possible. No commentary checked decides it."},
 {"id": "AR3", "about": "Who raised 'But we require al' (F4)", "readings": ["Anonymous editorial objection (the text's surface; the Davidson English and Steinsaltz)", "The addressee of the answer raised it (possible under the 'said to' formula, not stated)"],
  "status": "the first is the text's surface. The second is weak and should not produce an edge."},
 {"id": "AR4", "about": "Scope of Rabbi's alternative (F7)", "readings": ["A rejection of Hanina's method only", "A fourth view against all earlier views (Malbim), or Rabbi against 'the Rabbis' on al (Tosafot 78b)"],
  "status": "The Hanina target is explicit. The wider scope is interpretation."},
]

unresolved = [
 "Direction of the Hisda/Hamnuna exchange: both are recorded; nothing checked chooses between them.",
 "Whether the baraita citation (62a:13) is spoken by the amora or added by the anonymous Talmud.",
 "Bavli manuscript readings of 62a:12 (for example, whether any manuscript names only one direction or leaves out the pair) were not checked. The Hachi Garsinan images and Dikdukei Soferim were not consulted.",
 "The father's name form (חכינאי or עכינאי) and the son's (חנינא or חנניה) differ across witnesses. No reading is established as original.",
 "The historical identities of Rabbi, Rav Hisda, Rav Hamnuna (there are several sages with this name) and Hanina ben Hakhinai are not settled by this passage.",
 "The Tosefta was not searched with different wording. The exact-phrase searches found this baraita only in the Bavli, the Sifra and the Yalkut. That is a limit of the search, not proof that no other parallel exists.",
]

proposed_corrections = [
 {"claim_id": "c7", "change": "Voice should be open between the amoraic speaker and the anonymous Talmud: add reading group 'citation_boundary' (F3). Basis stays 'interpretation' for 'supports'.", "why": "The Aramaic has no closing marker, and the translations divide the text differently."},
 {"claim_id": "c8/c10 (and c9/c11)", "change": "Keep them branch-scoped. Add one branch-invariant, undirected co-mention of hisda and hamnuna in a said-to report. Note that the answer responds to an anonymous objection (F4). Record the parallel at Menachot 98a:19 as the same answer, not new evidence (F2).", "why": "The two branches share the pairing. Parallel wording must not inflate evidence counts."},
 {"claim_id": "entity rabbi / mentions", "change": "Add mentions for רבי in s2 ('רבי לטעמיה') and s3 ('רבי אומר'), and a coreference with basis 'explicit, Talmud's לטעמיה' (F5).", "why": "Claims c6 and c8-c11 depend on these occurrences, but the first reading has no mention anchored to them."},
 {"claim_id": "entity hakhinai / hanina", "change": "Add name-variant sets with witness labels: parent {חכינאי (Bavli), עכינאי (Sifra Venice)}; son {חנינא (Bavli, Sifra), חנניה (Yalkut)}. Keep c1 (F8).", "why": "These are source variants of one local person, not separate persons."},
 {"claim_id": "entities king, officiant, questioner", "change": "Retype as hypothetical figure, generic role and editorial voice (F11).", "why": "They are not participants in a people network."},
 {"claim_id": "episode.needed_context", "change": "Set to 62a:7-10 (baraita opening, anonymous first view, Rav Papa, Rabbi Yosi ben HaMeshullam). Add a parallel note for Menachot 98a:18-19 and Sotah 37a:9-10 (F2, F7).", "why": "Rabbi's alternative answers the whole baraita, and the answer recurs elsewhere."},
 {"claim_id": "previous review", "change": "Agree with its 'uncertain' on the citation boundary. It missed the recurring formula (F2), the missing Rabbi mentions (F5), the name variants (F8), the anonymous Yalkut witness (F9), the missing context (F7) and the typing of non-persons (F11).", "why": "Its passes were right for what it checked, but it looked only at the supplied three segments."},
]

ontology_lessons = [
 "A reversible attribution ('X said to Y, and some say Y said to X') is one reading group with two branches. The pairing of X and Y holds in both branches and can be stored once, undirected. Speaker, addressee and content ownership are branch-scoped.",
 "The same reversal formula, repeated word for word in a parallel passage (62a:12 and 98a:19), is one transmitted unit. Link the parallels and count them once.",
 "Quotation boundaries ('דתניא' after an amoraic answer) need their own reading group. They are neither the narrator's voice by default nor the speaker's.",
 "'לטעמיה' (to his own reasoning) is an explicit textual coreference between two sources for one named figure. It is not evidence of one occasion or of a historical identity.",
 "Name-form variants across witnesses (חכינאי/עכינאי, חנינא/חנניה) attach to one local person as labelled variants. A patronymic keeps its parent placeholder whatever the spelling.",
 "Anthology witnesses (Yalkut) that drop an attribution are a separate evidence type from manuscripts and must not delete a speaker.",
 "Parable figures (king of flesh and blood), generic ritual roles (the one who waves) and the editorial voice are not people-network nodes.",
]

dossier = {
 "job_id": "challenge-05",
 "focal_ref": "Menachot 62a:12",
 "status": "researched",
 "question": "In Menachot 62a:12, who answers the objection to Rabbi's side-by-side waving, and in which direction? Who owns the baraita citation that follows? Which people and relations in 62a:11-13 are explicit, which rest on interpretation, and which alternatives must stay open?",
 "scope_note": "Checked: Sefaria texts of Menachot 62a (Wikisource, William Davidson Aramaic both forms, William Davidson English); Rashi, Rabbeinu Gershom, Tosafot, Gilyon HaShas and Steinsaltz on 62a; Tosafot on 78b; parallels at Menachot 98a (with Rashi, Tosafot, Sha'arei Torat Bavel), Sotah 37a (with Tosafot) and Shabbat 97a:17; Sifra Emor 13:8 with Ra'avad; Malbim; Yalkut Shimoni 644; Torah Temimah; Mishneh Torah Daily Offerings 8:11; the Soncino translation (halakhah.com PDF); Sefaria exact-phrase searches. Not checked: Bavli manuscripts, Hachi Garsinan, Dikdukei Soferim, Tosefta with different wording, or other editions of the Sifra. Conclusions are limited to these sources.",
 "sources": sources,
 "findings": findings,
 "alternative_readings": alternative_readings,
 "unresolved": unresolved,
 "proposed_corrections": proposed_corrections,
 "ontology_lessons": ontology_lessons,
 "translation_note": "Translations marked 'mine' are the researcher's own brief renderings. In Davidson English quotes, <b> marks words that translate the Aramaic; plain words are the editor's.",
}
json.dump(dossier, open("dossier.json", "w"), ensure_ascii=False, indent=1)
print("ok", len(findings), "findings", sum(len(f["evidence"]) for f in findings), "evidence items")
