"""Build dossier.json for challenge-13 (Berakhot 5b:10).

Every text quote is checked as an exact substring of the decoded string values of
its saved source file. Image evidence is marked as a visual reading and is not
checked. Hashes are computed from the exact saved bytes.
"""
import hashlib, json, os, sys

CASE = os.path.dirname(os.path.abspath(__file__))
os.chdir(CASE)
LOG = {os.path.basename(x["saved_file"]): x for x in json.load(open("sources/fetch_log.json")) if "saved_file" in x}

def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()

def strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for x in obj:
            yield from strings(x)
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from strings(v)

SEF = "https://www.sefaria.org/api/v3/texts/"
SRC = [
    # id, file (relative to case dir), url or input path, edition
    ("S0", "../../../pilot/inputs/challenge-13.json", "research/sage-network/pilot/inputs/challenge-13.json",
     "Pilot input job: Berakhot 5b:10, William Davidson Edition - Vocalized Aramaic, vowel marks removed (read-only)"),
    ("S0b", "../../../pilot/outputs/challenge-13.json", "research/sage-network/pilot/outputs/challenge-13.json",
     "Pilot first reading under review (read-only)"),
    ("S0c", "previous-review.json", "research/sage-network/followup-v1/cases/challenge-13/previous-review.json",
     "Earlier independent review (read-only)"),
    ("S1", "sources/berakhot_5b_wde.json", None,
     "Sefaria: William Davidson Edition - Vocalized Aramaic + William Davidson Edition - English (Koren), Berakhot 5b, all segments"),
    ("S2", "sources/berakhot_5b_wikisource.json", None, "Sefaria: Wikisource Talmud Bavli (Vilna-based), Berakhot 5b"),
    ("S3", "sources/steinsaltz_5b.json", None,
     "Sefaria: Steinsaltz on Berakhot 5b (William Davidson Edition - Hebrew); same editorial project as S1 English"),
    ("S4", "sources/berakhot_5b_cohen1921.json", None, "Sefaria: Tractate Berakot by A. Cohen, Cambridge University Press, 1921 (English)"),
    ("S5", "sources/cohen_footnotes_5b.json", None, "Sefaria: Abraham Cohen footnotes to Berakhot 5b (1921)"),
    ("S6", "sources/ein_yaakov_glick_berakhot_1.json", None, "Sefaria: Ein Yaakov (Glick Edition), Berakhot 1, Hebrew text (En Jacob, S.H. Glick, 1916)"),
    ("S7", "sources/ein_yaakov_glick_berakhot_1_19_en.json", None, "Sefaria: Ein Yaakov (Glick Edition), Berakhot 1:19, Glick English translation (1916)"),
    ("S8", "sources/munich95_pg0279.jpg", None, "Munich, Bayerische Staatsbibliothek, Cod. hebr. 95 (1342), page 0279, image served by Sefaria manuscripts"),
    ("S8a", "sources/munich95_pg0279_crop_w3b.jpg", "derived from sources/munich95_pg0279.jpg (crop x1270-1830, y1965-2007, enlarged)",
     "Crop of S8: line with the Rabbi Yohanan / Rabbi Hanina exchange"),
    ("S8b", "sources/munich95_pg0279_crop_z2b.jpg", "derived from sources/munich95_pg0279.jpg (crop x780-1300, y1988-2048, enlarged)",
     "Crop of S8: end of the Rabbi Hanina story and the question; end of the embedded Hiyya story"),
    ("S8c", "sources/munich95_pg0279_crop_z1b.jpg", "derived from sources/munich95_pg0279.jpg (crop x300-820, y1988-2048, enlarged)",
     "Crop of S8: continuation of the question and the prisoner answer"),
    ("S8d", "sources/munich95_pg0279_crop_w1b.jpg", "derived from sources/munich95_pg0279.jpg (crop x1270-1830, y2003-2045, enlarged)",
     "Crop of S8: start of the embedded Hiyya story line"),
    ("S8e", "sources/munich95_pg0279_crop_w2b.jpg", "derived from sources/munich95_pg0279.jpg (crop x760-1320, y2003-2045, enlarged)",
     "Crop of S8: end of the embedded Hiyya story line"),
    ("S9", "sources/maharsha_agadot_5b.json", None, "Sefaria: Chidushei Agadot (Maharsha) on Berakhot 5b, Vilna edition"),
    ("S10", "sources/rashi_on_berakhot_5b.json", None, "Sefaria: Rashi on Berakhot 5b, Vilna edition"),
    ("S11", "sources/tosafot_on_berakhot_5b.json", None, "Sefaria: Tosafot on Berakhot 5b, Vilna edition"),
    ("S12", "sources/shir_hashirim_rabbah_2_16.json", None, "Sefaria: Shir HaShirim Rabbah 2:16 (Midrash Rabbah -- TE, Hebrew; The Sefaria Midrash Rabbah 2022, English)"),
    ("S13", "sources/etz_yosef_ssr_2_16_2.json", None, "Sefaria: Etz Yosef on Shir HaShirim Rabbah 2:16:2 (Warsaw 1867)"),
    ("S14", "sources/seder_hadorot_1231.json", None, "Sefaria: Seder HaDorot, Tanaim and Amoraim 1231 (Warsaw 1878-1882)"),
    ("S15", "sources/ben_yehoyada_5b.json", None, "Sefaria: Ben Yehoyada on Berakhot 5b (Senlake 2019, based on Jerusalem 1897)"),
    ("S16", "sources/related_ben_yehoyada_5b.json", None, "Sefaria related-links API for Ben Yehoyada on Berakhot 5b"),
    ("S17", "sources/marit_haayin_5b.json", None, "Sefaria: Marit HaAyin on Berakhot 5b (Jerusalem 1960)"),
    ("S18", "sources/related_5b10.json", None, "Sefaria related-links API for Berakhot 5b:10 (commentary links and manuscript list)"),
    ("S19", "sources/rif_berakhot_1b.json", None, "Sefaria: Rif Berakhot 1b, Vilna edition (linked by Sefaria to Berakhot 5b:10-11)"),
    ("S20", "sources/haamek_sheilah_14_9.json", None, "Sefaria: Haamek Sheilah on Sheiltot 14:9 (Vilna 1861)"),
    ("S21", "sources/vilna_berakhot_5b.jpg", None, "Romm Vilna page image, Berakhot 5b, served by Sefaria manuscripts (saved; not visually read for this dossier)"),
    ("S22", "sources/munich95_pg0280.jpg", None, "Munich Cod. hebr. 95 page 0280 (saved; the focal lines are on page 0279)"),
    ("S23", "sources/berakhot_5b_goldschmidt.json", None, "Sefaria request for the Goldschmidt German (1929) of Berakhot 5b; the response held no text versions"),
    ("S24", "sources/berakhot_versions.json", None, "Sefaria list of available Berakhot versions"),
    ("S25", "sources/rashi_5b.json", None, "Sefaria legacy-API response for Rashi on Berakhot 5b:1 (empty; superseded by S10)"),
]

sources = []
texts = {}
for sid, f, url, ed in SRC:
    base = os.path.basename(f)
    entry = LOG.get(base)
    rec = {"source_id": sid, "edition": ed, "saved_file": f, "sha256": sha(f)}
    if entry and f.startswith("sources/"):
        rec["url"] = entry["url"]
        rec["fetched_at"] = entry["fetched_at"]
        assert entry["sha256"] == rec["sha256"], (f, "hash changed since fetch")
    else:
        rec["input_path"] = url
        rec["fetched_at"] = None
    sources.append(rec)
    if f.endswith(".json"):
        texts[sid] = list(strings(json.load(open(f))))

exec(open("findings_data.py", encoding="utf-8").read())  # defines FINDINGS, ALTS, UNRESOLVED, CORRECTIONS, LESSONS

bad = []
for fnd in FINDINGS:
    for ev in fnd["evidence"]:
        if ev.get("evidence_type") == "researcher_visual_reading_of_page_image":
            continue
        q = ev["exact_quote"]
        if not any(q in s for s in texts[ev["source_id"]]):
            bad.append((fnd["finding_id"], ev["source_id"], q[:60]))
if bad:
    for b in bad:
        print("QUOTE NOT FOUND", b)
    sys.exit(1)

dossier = {
    "job_id": "challenge-13",
    "focal_ref": "Berakhot 5b:10",
    "status": "researched",
    "question": ("Who are the people in Berakhot 5b:10, what relations and speech turns does the text itself state, "
                 "and does the wider sugya, the textual witnesses, the translations or the commentaries change any saved claim "
                 "in the first reading or its review?"),
    "scope_note": ("Checked: Berakhot 5b:8-16 in the William Davidson Aramaic and English, Wikisource, Steinsaltz and Cohen 1921; "
                   "Rashi, Tosafot, Maharsha, Marit HaAyin and Ben Yehoyada on 5b; Ein Yaakov (Glick) Hebrew and English; "
                   "one manuscript image (Munich 95), read visually only; the Shir HaShirim Rabbah 2:16 parallel and Etz Yosef; "
                   "and the Seder HaDorot entry. Not checked: other manuscripts (e.g. Florence, Paris, Oxford), Dikdukei Soferim, "
                   "Yerushalmi parallels and the Goldschmidt German. The Goldschmidt request returned no text for this page, which "
                   "is not evidence that the translation lacks the passage."),
    "sources": sources,
    "findings": FINDINGS,
    "alternative_readings": ALTS,
    "unresolved": UNRESOLVED,
    "proposed_corrections": CORRECTIONS,
    "ontology_lessons": LESSONS,
    "graph_status": "All graph proposals are provisional. No historical identity, date or teacher relation is accepted from this passage.",
}
json.dump(dossier, open("dossier.json", "w"), ensure_ascii=False, indent=1)
print("ok", len(FINDINGS), "findings,", sum(len(f["evidence"]) for f in FINDINGS), "evidence items")
