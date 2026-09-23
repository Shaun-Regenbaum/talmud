"""Build dossier.json for challenge-06 and check every exact_quote against the saved source file."""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
log = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if "saved_file" in e}


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def fetched(source_id, fname, edition):
    p = "sources/" + fname
    e = log[p]
    assert e["sha256"] == sha(p), p
    return {"source_id": source_id, "url": e["url"], "edition": edition,
            "fetched_at": e["fetched_at"], "saved_file": p, "sha256": sha(p)}


def frozen(source_id, repo_path, edition):
    rel = "../../../" + repo_path.split("research/sage-network/")[1]
    if repo_path.endswith("previous-review.json"):
        rel = "previous-review.json"
    return {"source_id": source_id, "input_path": repo_path, "edition": edition,
            "fetched_at": None, "saved_file": rel, "sha256": sha(rel)}


SOURCES = [
    frozen("pilot_input", "research/sage-network/pilot/inputs/challenge-06.json",
           "Pilot source job: Wikisource Talmud Bavli, Menachot 73b:12-16"),
    frozen("pilot_output", "research/sage-network/pilot/outputs/challenge-06.json",
           "First saved reading (passage-pilot-v1)"),
    frozen("previous_review", "research/sage-network/followup-v1/cases/challenge-06/previous-review.json",
           "Earlier independent review of the first reading"),
    fetched("men73b", "menachot_73b_v3.json",
            "Sefaria: William Davidson Edition, vocalized Aramaic (Koren Noé text) and William Davidson English"),
    fetched("men73a", "menachot_73a_v3.json", "Sefaria: William Davidson Edition, Menachot 73a (Hebrew and English)"),
    fetched("shek7", "mishnah_shekalim_7.json",
            "Sefaria: Mishnah Shekalim 7, Torat Emet 357 Hebrew and William Davidson English"),
    fetched("rashi", "rashi_menachot_73b.json", "Sefaria: Rashi on Menachot 73b, Vilna edition"),
    fetched("ktav_yad_rashi", "ktav_yad_rashi_menachot_73b.json",
            "Sefaria: Ktav Yad Rashi on Menachot 73b (Wikisource), the commentary printed in Vilna as a second Rashi"),
    fetched("tosafot", "tosafot_menachot_73b.json", "Sefaria: Tosafot on Menachot 73b, Vilna edition"),
    fetched("gershom", "rabbeinu_gershom_menachot_73b.json",
            "Sefaria: Rabbeinu Gershom on Menachot 73b, Vilna edition, with printed footnotes"),
    fetched("steinsaltz", "steinsaltz_73b16.json", "Sefaria: Steinsaltz Hebrew commentary on Menachot 73b:16 (William Davidson)"),
    fetched("sifra", "sifra_emor_7_2.json",
            "Sefaria: Sifra, Emor, Section 7:2, Venice 1545 Hebrew (from Wikisource) and Shraga Silverstein English"),
    fetched("raavad_sifra", "raavad_sifra_emor_7_2.json", "Sefaria: Ra'avad on Sifra, Emor 7:2, Vienna 1862 edition"),
    fetched("chafetz_sifra", "chafetz_chaim_sifra_emor_7_2.json", "Sefaria: Chafetz Chaim on Sifra, Emor 7:2 (Wikisource)"),
    fetched("tosefta", "tosefta_shekalim_1_7.json",
            "Sefaria: Tosefta Shekalim 1:7, Lieberman edition according to codex Vienna, JTS 2001"),
    fetched("tosefta_var", "tosefta_variants_shekalim_1_7.json",
            "Sefaria: Variants apparatus on Tosefta Shekalim 1:7 (Lieberman, JTS 2001)"),
    fetched("kifshutah", "tosefta_kifshutah_shekalim_1_7.json", "Sefaria: Tosefta Kifshutah on Shekalim 1:7 (Lieberman, JTS 2001)"),
    fetched("tyt", "tosafot_yom_tov_shekalim_7_6.json", "Sefaria: Tosafot Yom Tov on Mishnah Shekalim 7:6, Romm Vilna 1913"),
    fetched("mt", "mt_sacrificial_procedure_3.json",
            "Sefaria: Mishneh Torah, Sacrificial Procedure 3, Torat Emet Hebrew and Touger English"),
    fetched("temurah_2b", "temurah_2b.json", "Sefaria: William Davidson Edition, Temurah 2b (Hebrew and English)"),
    fetched("temurah_3a", "temurah_3a.json", "Sefaria: William Davidson Edition, Temurah 3a (Hebrew and English)"),
    fetched("related16", "related_73b16.json", "Sefaria related-links index for Menachot 73b:16"),
]
_listed = {s["saved_file"] for s in SOURCES}
for _e in json.load(open("sources/fetch_log.json")):
    if "saved_file" in _e and _e["saved_file"] not in _listed:
        _listed.add(_e["saved_file"])
        _id = "ctx_" + os.path.basename(_e["saved_file"]).rsplit(".", 1)[0]
        SOURCES.append(fetched(_id, os.path.basename(_e["saved_file"]),
                               "Sefaria API response saved for context checks; not quoted in findings"))
SRC = {s["source_id"]: s for s in SOURCES}


def strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for x in obj:
            yield from strings(x)
    elif isinstance(obj, dict):
        for x in obj.values():
            yield from strings(x)


_cache = {}


def text_of(source_id):
    if source_id not in _cache:
        _cache[source_id] = list(strings(json.load(open(SRC[source_id]["saved_file"]))))
    return _cache[source_id]


def ev(source_id, quote, location, translation=None, evidence_type=None):
    hits = [s for s in text_of(source_id) if quote in s]
    if not hits:
        sys.exit(f"QUOTE NOT FOUND in {source_id}: {quote}")
    d = {"source_id": source_id, "exact_quote": quote, "location": location}
    if translation:
        d["translation_mine"] = "My translation: " + translation
    if evidence_type:
        d["evidence_type"] = evidence_type
    return d


exec(open("findings_data.py", encoding="utf-8").read())

dossier = {
    "job_id": "challenge-06",
    "focal_ref": "Menachot 73b:16",
    "status": "researched",
    "question": ("In Menachot 73b:16 the Talmud offers two ways to name the tanna of an anonymous baraita "
                 "(Rabbi Yosei HaGelili with 'wine' deleted, or Rabbi Akiva with 'a burnt offering and all its "
                 "accompaniments'). Which person, view and attribution claims are explicit, which depend on "
                 "interpretation, and what did the first reading and its review miss?"),
    "scope_checked": SCOPE,
    "sources": SOURCES,
    "failed_requests": [e for e in json.load(open("sources/fetch_log.json")) if "error" in e],
    "findings": FINDINGS,
    "alternative_readings": ALTERNATIVES,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
}
json.dump(dossier, open("dossier.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("wrote dossier.json:", len(FINDINGS), "findings,", len(SOURCES), "sources")
