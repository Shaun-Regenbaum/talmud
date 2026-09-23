import hashlib, html, json, os, re, sys

# Build dossier.json for random-yerushalmi-06. Every evidence quote is checked
# against the exact saved bytes (raw string or tag-stripped string).
HERE = os.path.dirname(os.path.abspath(__file__))
PILOT = os.path.normpath(os.path.join(HERE, "../../../pilot"))
log = json.load(open(os.path.join(HERE, "sources/fetch_log.json")))
by_file = {e["saved_file"]: e for e in log if "saved_file" in e}


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def fetched(sid, fname, edition, note=""):
    e = by_file["sources/" + fname]
    assert sha(os.path.join(HERE, e["saved_file"])) == e["sha256"], fname
    return {"source_id": sid, "url_or_path": e["url"], "edition": edition,
            "fetched_at": e["fetched_at"], "saved_file": e["saved_file"],
            "sha256": e["sha256"], "note": note}


SOURCES = [
    {"source_id": "S0", "url_or_path": "research/sage-network/pilot/inputs/random-yerushalmi-06.json",
     "edition": "Pilot input: Venice Edition segments 9:6:2-9:8:2 (read-only)",
     "fetched_at": "2026-09-20T08:27:08Z", "saved_file": "../../../pilot/inputs/random-yerushalmi-06.json",
     "sha256": sha(os.path.join(PILOT, "inputs/random-yerushalmi-06.json")),
     "note": "fetched_at is the input's captured_at; file read, not modified"},
    {"source_id": "S0b", "url_or_path": "research/sage-network/pilot/outputs/random-yerushalmi-06.json",
     "edition": "Pilot first reading (read-only)", "fetched_at": None,
     "saved_file": "../../../pilot/outputs/random-yerushalmi-06.json",
     "sha256": sha(os.path.join(PILOT, "outputs/random-yerushalmi-06.json")),
     "note": "The earlier reading under review"},
    {"source_id": "S0c", "url_or_path": "research/sage-network/followup-v1/cases/random-yerushalmi-06/previous-review.json",
     "edition": "Earlier independent review (read-only)", "fetched_at": None,
     "saved_file": "previous-review.json", "sha256": sha(os.path.join(HERE, "previous-review.json")),
     "note": "Copied unchanged before this round"},
    fetched("S1", "yer_bk_9_7.json",
            "Sefaria v3 Jerusalem Talmud Bava Kamma 9:7, all versions: Venice Edition; Mechon-Mamre; Guggenheimer Hebrew (vocalized) and Guggenheimer English translation with notes",
            "Focal halakhah plus its mishnah. Guggenheimer Hebrew and English are one editorial work, not two witnesses."),
    fetched("S2", "yer_bk_9_6.json", "Sefaria v3 Jerusalem Talmud Bava Kamma 9:6, all versions", "Preceding context"),
    fetched("S3", "yer_bk_9_8.json", "Sefaria v3 Jerusalem Talmud Bava Kamma 9:8, all versions", "Following context"),
    fetched("S4", "links_yer_bk_9_7_2.json", "Sefaria links API for 9:7:2", "Used to find commentaries and parallels"),
    fetched("S5", "links_yer_bk_9_7_1.json", "Sefaria links API for 9:7:1", "Used to find commentaries and parallels"),
    fetched("S6", "penei_moshe_9_7.json", "Penei Moshe on Yerushalmi Bava Kamma 9:7 (Piotrkow 1898-1900 via Sefaria)"),
    fetched("S7", "mareh_hapanim_9_7.json", "Mareh HaPanim on Yerushalmi Bava Kamma 9:7 (Piotrkow 1898-1900 via Sefaria)"),
    fetched("S8", "shaarei_torat_ey_9_7.json", "Sha'arei Torat Eretz Yisrael on Yerushalmi Bava Kamma 9:7 (Jerusalem 1940 via Sefaria)"),
    fetched("S9", "noam_yerushalmi_9_7.json", "Noam Yerushalmi on Bava Kamma 9:7 (Vilna 1869 via Sefaria)"),
    fetched("S10", "tosefta_bk_lieberman_11_1.json", "Tosefta Bava Kamma 11:1, Lieberman edition (codex Vienna, JTS 2001 via Sefaria)",
            "Variant markers are present but the apparatus text was not in the saved response"),
    fetched("S11", "bavli_bb_51b.json", "Bavli Bava Batra 51b, all versions (Wikisource; William Davidson Aramaic and English)"),
    fetched("S12", "bavli_bb_52a.json", "Bavli Bava Batra 52a, all versions (Wikisource; William Davidson Aramaic and English)",
            "Parallel story. Wikisource and William Davidson Aramaic are both printed-edition texts, not independent manuscripts."),
    fetched("S13", "bavli_bb_175a.json", "Bavli Bava Batra 175a, all versions"),
    fetched("S14", "mishnah_bk_9_7-10.json",
            "Mishnah Bava Kamma 9:7-10, all versions (Torat Emet; Vilna 1913; Kaufmann-based; William Davidson English; Kulp; Sefaria Community; Bartenura English)",
            "Separate Mishnah transmission of the same mishnayot quoted in the Yerushalmi"),
    fetched("S15", "yer_bk_10_1.json", "Sefaria v3 Jerusalem Talmud Bava Kamma 10:1, all versions",
            "Checked only because Guggenheimer cites it for the identity of the husband"),
    fetched("S16", "yer_bk_10_9.json", "Sefaria v3 Jerusalem Talmud Bava Kamma 10:9, all versions",
            "The same baraita opening recurs here"),
    fetched("S17", "mt_borrowing_deposit_7_10.json", "Mishneh Torah, Borrowing and Deposit 7:10 (Sefaria)"),
    fetched("S18", "mt_marriage_22_32.json", "Mishneh Torah, Marriage 22:32 (Sefaria)"),
    fetched("S19", "sa_eh_86_1.json", "Shulchan Arukh, Even HaEzer 86:1 (Sefaria)"),
    fetched("S20", "jastrow_kidusha_1.json", "Jastrow Dictionary, entry קִידּוּשָׁא (London 1903 via Sefaria)"),
    fetched("S21", "rashbam_bb_52a.json", "Rashbam on Bava Batra 52a (Vilna Edition via Sefaria)"),
    fetched("S22", "rashbam_bb_51b.json", "Rashbam on Bava Batra 51b (Vilna Edition via Sefaria)", "Saved; not quoted"),
]
SRC_FILE = {s["source_id"]: os.path.normpath(os.path.join(HERE, s["saved_file"])) for s in SOURCES}


def strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for x in obj:
            yield from strings(x)
    elif isinstance(obj, dict):
        for x in obj.values():
            yield from strings(x)


def strip(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s))


_cache = {}


def haystack(sid):
    if sid not in _cache:
        d = json.load(open(SRC_FILE[sid]))
        _cache[sid] = [x for s in strings(d) for x in (s, strip(s))]
    return _cache[sid]


def ev(sid, quote, etype, translation=None, where=None):
    assert any(quote in h for h in haystack(sid)), f"QUOTE NOT FOUND in {sid}: {quote}"
    e = {"source_id": sid, "exact_quote": quote, "evidence_type": etype}
    if where:
        e["where"] = where
    if translation:
        e["translation_by_this_dossier"] = translation
    return e


exec(open(os.path.join(HERE, "findings.py")).read())

dossier = {
    "job_id": "random-yerushalmi-06",
    "focal_ref": "Jerusalem Talmud Bava Kamma 9:7:2",
    "status": "researched",
    "question": QUESTION,
    "scope_note": SCOPE,
    "evidence_type_key": {
        "base_text": "Venice Edition of the Yerushalmi as saved in the pilot input or refetched",
        "text_variant": "Another edition's wording of the same passage (Mechon-Mamre; Guggenheimer Hebrew)",
        "parallel": "A version of the teaching or story in another work (Tosefta, Bavli, Mishnah)",
        "translation": "A published translation; translator notes are marked translator_note",
        "translator_note": "An explanatory or historical note by a translator",
        "commentary": "A traditional commentary's interpretation",
        "proposed_emendation": "A commentator's or translator's proposal to change the wording",
        "later_code": "A later legal code's ruling",
        "lexicon": "A dictionary entry",
        "earlier_reading": "The pilot's first reading or its review",
    },
    "sources": SOURCES,
    "findings": FINDINGS,
    "alternative_readings": ALTERNATIVES,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
    "graph_status": "All graph proposals are provisional. No historical identity merge or date is proposed as accepted.",
}
out = os.path.join(HERE, "dossier.json")
tmp = out + ".tmp"
json.dump(dossier, open(tmp, "w"), ensure_ascii=False, indent=1)
os.replace(tmp, out)
print("ok", len(FINDINGS), "findings,", sum(len(f["evidence"]) for f in FINDINGS), "quotes verified")
