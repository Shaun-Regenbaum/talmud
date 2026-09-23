# Build dossier.json for original-02 from saved sources; verify every exact_quote
# is a verbatim substring of the text stored in its saved file.
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
LOG = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if "saved_file" in e}
REPO_CASE = "research/sage-network/followup-v1/cases/original-02/"


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def src(sid, fname, edition, version_title=None, note=None):
    path = "sources/" + fname
    e = LOG[path]
    d = {"source_id": sid, "url": e["url"], "edition": edition, "fetched_at": e["fetched_at"],
         "saved_file": path, "sha256": sha(path)}
    if version_title:
        d["version_title"] = version_title
    if note:
        d["note"] = note
    return d


SOURCES = [
    {"source_id": "S0", "input_path": REPO_CASE + "input.json", "url": None,
     "edition": "Frozen job input (lake snapshot 2); quotes William Davidson Edition Hebrew for Ketubot 62b:6",
     "saved_file": "input.json", "sha256": sha("input.json"), "note": "read only, unchanged"},
    src("S1", "sefaria_v3_ketubot_62b_all.json", "Bavli Ketubot 62b, William Davidson Edition - Aramaic (unvocalized)",
        "William Davidson Edition - Aramaic"),
    src("S1W", "sefaria_v3_ketubot_62b_all.json", "Bavli Ketubot 62b, Wikisource Talmud Bavli", "Wikisource Talmud Bavli",
        "same saved file as S1; a different Hebrew edition inside it"),
    src("S1E", "sefaria_v3_ketubot_62b_all.json", "Bavli Ketubot 62b, William Davidson Edition - English (Koren/Steinsaltz)",
        "William Davidson Edition - English", "same saved file as S1; built on the same editorial work as S7"),
    src("S1D", "sefaria_v3_ketubot_62b_all.json", "Bavli Ketubot 62b, Daf Shevui English (Conservative Yeshiva)", "Daf Shevui",
        "same saved file as S1"),
    src("S2", "sefaria_v3_ketubot_62a_all.json", "Bavli Ketubot 62a, all Sefaria versions", note="context fetched; not quoted"),
    src("S3", "sefaria_v3_ketubot_63a_all.json", "Bavli Ketubot 63a, all Sefaria versions", note="context fetched; not quoted"),
    src("S4", "sefaria_links_ketubot_62b_6.json", "Sefaria links index for Ketubot 62b:6"),
    src("S5", "rashi_ketubot_62b.json", "Rashi on Ketubot 62b, Vilna Edition"),
    src("S6", "tosafot_ketubot_62b.json", "Tosafot on Ketubot 62b, Vilna Edition",
        note="Sefaria's Vilna text has Tosafot comments on segments 2, 14 and 15 of 62b and none keyed to 62b:6"),
    src("S7", "steinsaltz_ketubot_62b_6.json", "Steinsaltz on Ketubot 62b:6, William Davidson Edition - Hebrew"),
    src("S8", "maharam_schiff_ketubot_62b.json", "Maharam Schiff on Ketubot 62b, Vilna Edition"),
    src("S9", "maharsha_agadot_ketubot_62b.json", "Maharsha, Chidushei Agadot on Ketubot 62b, Vilna Edition"),
    src("S10", "seder_hadorot_1659.json", "Seder HaDorot, Tanaim and Amoraim 1659, Warsaw 1878-1882",
        note="later chronicle; compiles Bavli and Yerushalmi passages"),
    src("S11", "sirilio_yerushalmi_bikkurim_3_3_13.json", "Sirilio on Jerusalem Talmud Bikkurim 3:3:13, Jerusalem 1934-1967"),
    src("S12", "yerushalmi_bikkurim_3_3.json", "Jerusalem Talmud Bikkurim 3:3, Venice Edition", "Venice Edition",
        "file also holds Guggenheimer Hebrew, Mechon-Mamre and Guggenheimer English"),
    src("S12G", "yerushalmi_bikkurim_3_3.json", "Jerusalem Talmud Bikkurim 3:3, Guggenheimer vocalized Hebrew (De Gruyter 1999-2015)",
        "The Jerusalem Talmud, edition by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015", "same saved file as S12"),
    src("S12M", "yerushalmi_bikkurim_3_3.json", "Jerusalem Talmud Bikkurim 3:3, Mechon-Mamre Hebrew", "Mechon-Mamre",
        "same saved file as S12"),
    src("S12E", "yerushalmi_bikkurim_3_3.json", "Jerusalem Talmud Bikkurim 3:3, Guggenheimer English translation and notes",
        "The Jerusalem Talmud, translation and commentary by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015",
        "same saved file as S12"),
    src("S13", "sefaria_v3_sanhedrin_38a_davidson.json", "Bavli Sanhedrin 38a, William Davidson Edition Aramaic and English"),
    src("S14", "sefaria_links_yerushalmi_bikkurim_3_3_13.json", "Sefaria links index for Jerusalem Talmud Bikkurim 3:3:13"),
    src("S15", "penei_moshe_yerushalmi_bikkurim_3_3_13.json", "Penei Moshe on Jerusalem Talmud Bikkurim 3:3:13, Piotrkow 1898-1900"),
]
SRC = {s["source_id"]: s for s in SOURCES}


def texts_of(sid):
    s = SRC[sid]
    raw = open(s["saved_file"], "rb").read().decode("utf-8")
    data = json.loads(raw)
    out = []

    def walk(x):
        if isinstance(x, str):
            out.append(x)
        elif isinstance(x, list):
            for y in x:
                walk(y)
        elif isinstance(x, dict):
            for y in x.values():
                walk(y)

    if "version_title" in s:
        for v in data["versions"]:
            if v["versionTitle"] == s["version_title"]:
                walk(v["text"])
    else:
        walk(data)
    return out


def ev(sid, quote, translation=None, note=None):
    d = {"source_id": sid, "exact_quote": quote}
    if translation:
        d["translation_by_this_dossier"] = translation
    if note:
        d["note"] = note
    return d


exec(open("findings.py", encoding="utf-8").read())  # defines FINDINGS, ALTERNATIVES, UNRESOLVED, CORRECTIONS, LESSONS, EXTRA

bad = []
for f in FINDINGS:
    for e in f["evidence"]:
        if not any(e["exact_quote"] in t for t in texts_of(e["source_id"])):
            bad.append((f["finding_id"], e["source_id"], e["exact_quote"][:60]))
for a in ALTERNATIVES:
    for e in a.get("evidence", []):
        if not any(e["exact_quote"] in t for t in texts_of(e["source_id"])):
            bad.append((a["alt_id"], e["source_id"], e["exact_quote"][:60]))
if bad:
    for b in bad:
        print("QUOTE NOT FOUND", b)
    sys.exit(1)

dossier = {
    "job_id": "original-02",
    "focal_ref": "Ketubot 62b:6",
    "status": "researched",
    "question": json.load(open("input.json")).get("question") or
    "Recover family relations, unnamed women, academic journeys, narrated chronology and the distinction between marriage mentioned by the passage and marriage inferred from other sources. Locate pronouns carefully.",
    **EXTRA,
    "sources": SOURCES,
    "findings": FINDINGS,
    "alternative_readings": ALTERNATIVES,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
}
tmp = "dossier.json.tmp"
json.dump(dossier, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
os.replace(tmp, "dossier.json")
print("wrote dossier.json:", len(FINDINGS), "findings,", len(ALTERNATIVES), "alternatives,", len(SOURCES), "sources")
