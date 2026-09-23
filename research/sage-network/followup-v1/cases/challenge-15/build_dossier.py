"""Build dossier.json for challenge-15 and check every text quote against the saved source bytes."""
import datetime, hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
log = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if "saved_file" in e}
VISUAL = "researcher_visual_reading_of_page_image"


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


def derived(sid, fname, parent, how):
    path = "sources/" + fname
    return {"source_id": sid, "url": log["sources/" + parent]["url"], "edition": how, "fetched_at": None,
            "derived_from": "sources/" + parent, "saved_file": path, "sha256": sha(path), "kind": "image"}


SEARCH_FILE = "sources/search_bruriah_midrash.json"
SOURCES = [
    frozen("pilot_input", "research/sage-network/pilot/inputs/challenge-15.json",
           "../../../pilot/inputs/challenge-15.json",
           "Pilot source job: William Davidson Edition - Vocalized Aramaic (unvocalized form), Berakhot 10a:2-4"),
    frozen("pilot_output", "research/sage-network/pilot/outputs/challenge-15.json",
           "../../../pilot/outputs/challenge-15.json", "First saved reading (passage-pilot-v1)"),
    frozen("prev_review", "research/sage-network/followup-v1/cases/challenge-15/previous-review.json",
           "previous-review.json", "Earlier independent review"),
    fetched("ber10a", "ber10a_v3.json",
            "Sefaria v3 Berakhot 10a: William Davidson Edition - Vocalized Aramaic; William Davidson Edition - "
            "English (Koren Noé); Wikisource Talmud Bavli"),
    fetched("ber10a_cohen", "ber10a2-7_cohen_goldschmidt.json",
            "Sefaria v3 Berakhot 10a:2-7: Tractate Berakot by A. Cohen (Cambridge 1921) English; William Davidson "
            "Edition - Aramaic. (The German Goldschmidt version requested in the same call was not returned.)"),
    fetched("goldschmidt_fail", "ber10a2-4_goldschmidt.json",
            "Sefaria v3 request for the Goldschmidt German translation of Berakhot 10a:2-4; the response is a "
            "'version not found' warning, so this translation was NOT checked"),
    fetched("ber9b", "ber9b_v3.json",
            "Sefaria v3 Berakhot 9b: William Davidson Vocalized Aramaic and English (context before the story)"),
    fetched("links", "ber10a2-4_links.json", "Sefaria links index for Berakhot 10a:2-4"),
    fetched("related", "ber10a2_related.json", "Sefaria related-content index for Berakhot 10a:2 (not quoted)"),
    fetched("versions", "ber_versions.json", "Sefaria list of Berakhot text versions (not quoted)"),
    fetched("rashi", "rashi_ber10a2-3.json", "Rashi on Berakhot 10a:2-3, Vilna edition"),
    fetched("steinsaltz", "steinsaltz_ber10a2-4.json",
            "Steinsaltz Hebrew commentary on Berakhot 10a:2-4 (William Davidson Edition - Hebrew; same editorial "
            "project as the William Davidson English, so not an independent witness)"),
    fetched("tosafot_harosh", "tosafot_harosh_ber10a2-4.json", "Tosafot HaRosh on Berakhot 10a:2-4, Warsaw 1863"),
    fetched("chokhmat_shlomo", "chokhmat_shlomo_ber10a3.json", "Chokhmat Shlomo on Berakhot 10a (on Rashi), Vilna edition"),
    fetched("yaavetz", "yaavetz_ber10a1.json", "Haggahot Ya'avetz on Berakhot 10a, Sefaria text"),
    fetched("ben_yehoyada", "ben_yehoyada_ber10a2.json",
            "Ben Yehoyada on Berakhot 10a:2 (Senlake edition 2019 based on Jerusalem 1897)"),
    fetched("tzelach", "tzelach_ber10a2.json", "Tziyyun LeNefesh Chayyah (Tzelach) on Berakhot 10a:2, Prague 1791"),
    fetched("maharsha", "maharsha_agadot_ber10a.json", "Maharsha, Chidushei Agadot on Berakhot 10a, Vilna edition"),
    fetched("cohen_fn", "cohen_footnotes_ber10a1-3.json",
            "A. Cohen, footnotes to his English translation of Berakhot (Cambridge 1921), 10a notes 1-3"),
    fetched("meiri", "meiri_ber10a1.json", "Meiri on Berakhot 10a, Wikisource text"),
    fetched("gilyon", "gilyon_hashas_ber10a1.json", "Gilyon HaShas on Berakhot 10a, Vilna edition (not quoted)"),
    fetched("chullin59b", "chullin59b10.json",
            "Sefaria v3 Chullin 59b:10 (a Mesorat HaShas link for the phrase pattern; not quoted)"),
    fetched("psalms", "psalms104_35.json",
            "Sefaria v3 Psalms 104:35: Miqra according to the Masorah; JPS Tanakh Gender-Sensitive Edition"),
    fetched("rashi_ps", "rashi_psalms104_35.json", "Rashi on Psalms 104:35, Sefaria vocalized edition"),
    fetched("torah_temimah", "torah_temimah_ps104_35.json",
            "Torah Temimah on Psalms 104:35 (quotes Berakhot 9b and 10a; not quoted here)"),
    fetched("midrash_tehillim", "midrash_tehillim_104_22.json",
            "Midrash Tehillim 104:22: Hebrew version titled OYW (source mobile.tora.ws, public domain) and "
            "Sefaria Community Translation (CC0)"),
    fetched("mt_links", "midrash_tehillim_104_22_links.json", "Sefaria links index for Midrash Tehillim 104:22 (not quoted)"),
    fetched("ey_daat", "ein_yaakov_daat_ber_1_63.json",
            "Ein Yaakov, Berakhot 1:63, Sefaria version titled Daat (NLI 001911837)"),
    fetched("ey_glick", "ey_glick_ber_1_45-50.json",
            "Ein Yaakov (Glick Edition), Berakhot 1:45-50, Hebrew text of En Jacob, S. H. Glick 1916"),
    fetched("ey_glick_probe", "ey_glick_probe.json",
            "Ein Yaakov (Glick Edition), Berakhot 1:52, fetched while locating the story (not quoted)"),
    fetched("az18a", "az18a_v3.json",
            "Sefaria v3 Avodah Zarah 18a: William Davidson Vocalized Aramaic and English; Wikisource Talmud Bavli"),
    fetched("sefer_chasidim_76", "sefer_chasidim_76.json", "Sefer Chasidim 76, Zhitomir 1857 (not quoted)"),
    fetched("perush_kadmon", "perush_kadmon_sch76.json", "Perush Kadmon on Sefer Chasidim 76:1, Jozefow 1870"),
    fetched("sefer_chasidim_225", "sefer_chasidim_225.json", "Sefer Chasidim 225, Zhitomir 1857 (not quoted)"),
    fetched("mss_index", "ber10a_manuscripts.json", "Sefaria manuscripts index for Berakhot 10a"),
    fetched("munich95_282", "munich95_pg0282.jpg",
            "Munich Cod. hebr. 95 (1342), page image 0282 (Berakhot 8b-10a), via Sefaria manuscripts", "image"),
    derived("munich95_282_story", "munich95_pg0282_crop_story.jpg", "munich95_pg0282.jpg",
            "Crop of Munich 95 page 0282 showing the story lines (made locally, no resampling)"),
    derived("munich95_282_right", "munich95_pg0282_crop_story_right_x2.jpg", "munich95_pg0282.jpg",
            "Enlarged crop, right half of the story lines, Munich 95 page 0282 (made locally)"),
    derived("munich95_282_left", "munich95_pg0282_crop_story_left_x2.jpg", "munich95_pg0282.jpg",
            "Enlarged crop, left half of the story lines, Munich 95 page 0282 (made locally)"),
    derived("munich95_282_margin", "munich95_pg0282_crop_margin.jpg", "munich95_pg0282.jpg",
            "Enlarged crop of the outer-margin note beside the story, Munich 95 page 0282 (made locally)"),
    derived("munich95_282_interlinear", "munich95_pg0282_crop_interlinear.jpg", "munich95_pg0282.jpg",
            "Enlarged crop of the interlinear writing above the prayer clause, Munich 95 page 0282 (made locally)"),
    fetched("munich95_283", "munich95_pg0283.jpg",
            "Munich Cod. hebr. 95, page image 0283 (Berakhot 10a-12a); used only to confirm the story is on 0282", "image"),
    fetched("vilna_img", "vilna_ber10a.jpg", "Romm Vilna print, Berakhot 10a page image (saved, not read)", "image"),
    fetched("bomberg_img", "bomberg_ber9b-10a.jpg", "Bomberg Venice print 1523, Berakhot 9b-10a page image (saved, not read)", "image"),
    {"source_id": "sefaria_search", "url": "https://www.sefaria.org/api/search-wrapper (POST: query ברוריה, "
     "field naive_lemmatizer, filter path Midrash, size 60)", "edition": "Sefaria search response (10 hits); used "
     "only to locate the Midrash Tehillim parallel and the Ein Yaakov copies", "fetched_at":
     datetime.datetime.fromtimestamp(os.path.getmtime(SEARCH_FILE), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
     "saved_file": SEARCH_FILE, "sha256": sha(SEARCH_FILE), "kind": "text"},
    fetched("wikipedia", "wikipedia_bruriah_raw.txt",
            "English Wikipedia 'Bruriah', raw wikitext (tertiary; used only as a pointer, not as evidence for the text)"),
    fetched("goodblatt_landing", "goodblatt_jjs1975_landing.html",
            "Publisher landing page for D. Goodblatt, 'The Beruriah Traditions', Journal of Jewish Studies 26 (1975). "
            "The article text was NOT read; the saved page gave no readable abstract"),
]
SRC = {s["source_id"]: s for s in SOURCES}


def strings(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from strings(v)
    elif isinstance(x, list):
        for v in x:
            yield from strings(v)


def haystack(sid):
    path = SRC[sid]["saved_file"]
    raw = open(path, "rb").read().decode("utf-8")
    if path.endswith(".json"):
        return list(strings(json.loads(raw)))
    return [raw]


def ev(sid, quote, location, translation=None, **extra):
    e = {"source_id": sid, "exact_quote": quote, "location": location}
    if translation:
        e["translation_by_researcher"] = translation
    e.update(extra)
    return e


def vis(sid, quote, location, translation, note):
    return {"source_id": sid, "evidence_type": VISUAL, "exact_quote": quote,
            "note": "Visual reading of a page image; not machine-checked; letters may be misread. " + note,
            "location": location, "translation_by_researcher": translation}


from dossier_body import FINDINGS, ALTERNATIVES, UNRESOLVED, CORRECTIONS, LESSONS, QUESTION, SCOPE  # noqa: E402

problems = []
for f in FINDINGS:
    for e in f["evidence"]:
        assert e["source_id"] in SRC, e["source_id"]
        if e.get("evidence_type") == VISUAL:
            continue
        if not any(e["exact_quote"] in s for s in haystack(e["source_id"])):
            problems.append((f["finding_id"], e["source_id"], e["exact_quote"]))
if problems:
    for p in problems:
        print("QUOTE NOT FOUND", p)
    raise SystemExit(1)

dossier = {
    "job_id": "challenge-15",
    "focal_ref": "Berakhot 10a:2",
    "status": "researched",
    "question": QUESTION,
    "scope_checked": SCOPE,
    "sources": SOURCES,
    "findings": FINDINGS,
    "alternative_readings": ALTERNATIVES,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
}
tmp = "dossier.json.tmp"
json.dump(dossier, open(tmp, "w"), ensure_ascii=False, indent=2)
os.replace(tmp, "dossier.json")
print("ok", len(FINDINGS), "findings,", sum(len(f["evidence"]) for f in FINDINGS), "evidence items")
