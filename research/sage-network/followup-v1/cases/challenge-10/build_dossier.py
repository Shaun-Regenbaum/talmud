"""Build dossier.json for challenge-10 and check every text quote against the saved source bytes."""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
log = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if "saved_file" in e}


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def fetched(sid, fname, edition, kind="text"):
    path = "sources/" + fname
    e = log[path]
    assert e["sha256"] == sha(path), path
    return {"source_id": sid, "url": e["url"], "edition": edition, "fetched_at": e["fetched_at"],
            "saved_file": path, "sha256": e["sha256"], "kind": kind}


def frozen(sid, input_path, saved_file, edition):
    return {"source_id": sid, "input_path": input_path, "edition": edition, "fetched_at": None,
            "saved_file": saved_file, "sha256": sha(saved_file), "kind": "text"}


SOURCES = [
    frozen("pilot_input", "research/sage-network/pilot/inputs/challenge-10.json",
           "../../../pilot/inputs/challenge-10.json",
           "Pilot source job: Wikisource Talmud Bavli, Menachot 29b:3-5"),
    frozen("pilot_output", "research/sage-network/pilot/outputs/challenge-10.json",
           "../../../pilot/outputs/challenge-10.json", "First saved reading (passage-pilot-v1)"),
    frozen("prev_review", "research/sage-network/followup-v1/cases/challenge-10/previous-review.json",
           "previous-review.json", "Earlier independent review"),
    fetched("men29b", "men29b_v3.json",
            "Sefaria v3 Menachot 29b, all versions: Wikisource Talmud Bavli; William Davidson Aramaic and "
            "vocalized Aramaic; William Davidson English (Koren Noé); Sefaria Community Translation"),
    fetched("men29a", "men29a_v3.json", "Sefaria v3 Menachot 29a, all versions (context before the story)"),
    fetched("links", "men29b3-5_links.json", "Sefaria links index for Menachot 29b:3-5"),
    fetched("related", "men29b3_related.json", "Sefaria related-content index for Menachot 29b:3 (not quoted)"),
    fetched("rashi", "rashi_men29b3-5.json", "Rashi on Menachot 29b:3-5, Vilna edition, with Sefaria Community Translation"),
    fetched("steinsaltz", "steinsaltz_men29b3-5.json",
            "Steinsaltz Hebrew commentary on Menachot 29b:3-5 (William Davidson Edition - Hebrew; same editorial project as the William Davidson English)"),
    fetched("maharsha", "chidushei_agadot_men29b.json", "Maharsha, Chidushei Agadot on Menachot 29b, Vilna edition, with Sefaria Community Translation"),
    fetched("ben_yehoyada", "ben_yehoyada_men29b.json", "Ben Yehoyada on Menachot 29b (Senlake 2019, based on Jerusalem 1897)"),
    fetched("petach_einayim", "petach_einayim_men29b.json", "Petach Einayim on Menachot 29b, Jerusalem 1959"),
    fetched("marit_haayin", "marit_haayin_men29b.json", "Marit HaAyin on Menachot 29b, Jerusalem 1960"),
    fetched("shabbat89a", "shabbat89a_v3.json", "Sefaria v3 Shabbat 89a, all versions"),
    fetched("sanhedrin111a", "sanhedrin111a_v3.json", "Sefaria v3 Sanhedrin 111a, all versions"),
    fetched("berakhot61b", "berakhot61b_v3.json", "Sefaria v3 Berakhot 61b, all versions"),
    fetched("sefer_tagin", "sefer_tagin_intro1.json", "Otzar Midrashim (New York 1915), Sefer Tagin, Introduction 1"),
    fetched("seder_hadorot", "seder_hadorot_2917_11.json", "Seder HaDorot, Tanaim and Amoraim 2917:11 (Warsaw 1878-1882)"),
    fetched("ein_yaakov_daat", "ein_yaakov_menakhot.json", "Ein Yaakov, Menakhot, vocalized Hebrew (Sefaria version titled Daat, Hebrew title אגדות חז\"ל - דעת)"),
    fetched("ein_yaakov_glick", "ein_yaakov_glick_menachot.json", "En Jacob, S. H. Glick edition, 1916, Menachot: Hebrew text and English translation (two versions in one file)"),
    fetched("mss_index", "men29b_manuscripts.json", "Sefaria manuscripts index for Menachot 29b"),
    fetched("munich95_833", "munich95_pg0833.jpg", "Munich Cod. hebr. 95 (1342), page image 0833 (Menachot 27-29), via Sefaria manuscripts", "image"),
    fetched("munich95_834", "munich95_pg0834.jpg", "Munich Cod. hebr. 95 (1342), page image 0834 (Menachot 29b-32a), via Sefaria manuscripts", "image"),
    fetched("bomberg", "bomberg_men29b.jpg", "Bomberg Venice print (1523), Menachot 29b page image, via Sefaria manuscripts", "image"),
    fetched("wikipedia", "wikipedia_moses_sees_akiva_raw.txt",
            "English Wikipedia, 'Moses sees Rabbi Akiva (Menachot 29b)', raw wikitext (tertiary; used only as a pointer to scholarship)"),
    fetched("steinsaltz_org", "steinsaltz_org_menahot29.html",
            "steinsaltz.org daf page for Menahot 29 (static HTML held no article text; not used as evidence)"),
]
for crop, parent, note in [("munich95_pg0834_crop_story.jpg", "munich95_834", "rows 90-340 px, columns 110-1530 px"),
                           ("bomberg_men29b_crop_story.jpg", "bomberg", "rows 600-750 px, columns 300-680 px")]:
    SOURCES.append({"source_id": parent + "_crop", "derived_from": parent,
                    "edition": "Researcher crop of the saved page image (" + note + ") made with macOS sips; no other change",
                    "fetched_at": None, "saved_file": "sources/" + crop, "sha256": sha("sources/" + crop), "kind": "image"})

SRC = {s["source_id"]: s for s in SOURCES}


def strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, list):
        for x in o:
            yield from strings(x)
    elif isinstance(o, dict):
        for x in o.values():
            yield from strings(x)


_cache = {}


def blob(sid):
    if sid not in _cache:
        p = SRC[sid]["saved_file"]
        raw = open(p, "rb").read().decode("utf-8")
        _cache[sid] = [raw] if not p.endswith(".json") else list(strings(json.loads(raw)))
    return _cache[sid]


def exact(sid, bare):
    """Return the exact (possibly vocalized) substring of a saved source whose vowel-stripped form equals `bare`."""
    for s in blob(sid):
        keep = [i for i, c in enumerate(s) if not ("\u0591" <= c <= "\u05C7" and c not in "\u05BE\u05C0\u05C3\u05C6")]
        stripped = "".join(s[i] for i in keep)
        k = stripped.find(bare)
        if k >= 0:
            return s[keep[k]:keep[k + len(bare) - 1] + 1]
    raise SystemExit("exact() found nothing for " + sid + ": " + bare)


def ev(sid, quote, translation=None, where=None):
    e = {"source_id": sid, "exact_quote": quote}
    if where:
        e["location"] = where
    if translation:
        e["translation_by_researcher"] = translation
    return e


def vis(sid, reading, translation=None, where=None):
    e = {"source_id": sid, "evidence_type": "researcher_visual_reading_of_page_image", "exact_quote": reading,
         "note": "Visual reading of a page image; not machine-checked; letters may be misread."}
    if where:
        e["location"] = where
    if translation:
        e["translation_by_researcher"] = translation
    return e


exec(open("dossier_body.py", encoding="utf-8").read())

bad = []
for f in FINDINGS:
    for e in f["evidence"]:
        if e.get("evidence_type") == "researcher_visual_reading_of_page_image":
            assert SRC[e["source_id"]]["kind"] == "image"
            continue
        assert SRC[e["source_id"]]["kind"] == "text", e
        n = sum(s.count(e["exact_quote"]) for s in blob(e["source_id"]))
        if n == 0:
            bad.append((f["finding_id"], e["source_id"], e["exact_quote"][:80]))
if bad:
    for b in bad:
        print("QUOTE NOT FOUND", b)
    sys.exit(1)

for s in SOURCES:
    s.pop("kind")
dossier = {"job_id": "challenge-10", "focal_ref": "Menachot 29b:3", "status": STATUS, "question": QUESTION,
           "scope_checked": SCOPE, "sources": SOURCES, "findings": FINDINGS,
           "alternative_readings": ALTERNATIVES, "unresolved": UNRESOLVED,
           "proposed_corrections": CORRECTIONS, "ontology_lessons": LESSONS}
tmp = "dossier.json.tmp"
json.dump(dossier, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
os.replace(tmp, "dossier.json")
print("ok", len(FINDINGS), "findings,", sum(len(f["evidence"]) for f in FINDINGS), "evidence items")
