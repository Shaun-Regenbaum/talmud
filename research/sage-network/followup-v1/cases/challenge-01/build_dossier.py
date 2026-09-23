import json, hashlib, os, re, sys
# Build dossier.json for challenge-01 and verify every exact_quote against the saved bytes.
os.chdir(os.path.dirname(os.path.abspath(__file__)))
log = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if "saved_file" in e}

def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()

SRC = [
 ("S0", "research/sage-network/pilot/inputs/challenge-01.json", "Pilot input: Wikisource Talmud Bavli, Sanhedrin 101a:5-6 (read-only)", "../../../pilot/inputs/challenge-01.json", "2026-09-20T08:23:09Z", "fetched_at is the input's captured_at; file read, not modified"),
 ("S0b", "research/sage-network/pilot/outputs/challenge-01.json", "Pilot first reading (read-only)", "../../../pilot/outputs/challenge-01.json", None, "The earlier reading under review"),
 ("S0c", "research/sage-network/followup-v1/cases/challenge-01/previous-review.json", "Earlier independent review (read-only)", "previous-review.json", None, "The earlier review under challenge"),
 ("S1", None, "Sefaria v3 Sanhedrin 101a, all versions: William Davidson (Koren) vocalized and unvocalized Aramaic, Wikisource Talmud Bavli, William Davidson English", "sources/sefaria_v3_sanhedrin_101a_all.json", None, None),
 ("S2", None, "Rashi on Sanhedrin 101a:5, Vilna edition (Sefaria)", "sources/rashi_sanhedrin_101a_5.json", None, None),
 ("S3", None, "Rashi on Sanhedrin 101a:6, Vilna edition (Sefaria)", "sources/rashi_sanhedrin_101a_6.json", None, None),
 ("S4", None, "Steinsaltz on Sanhedrin 101a:6, William Davidson Edition - Hebrew (Sefaria)", "sources/steinsaltz_sanhedrin_101a_6.json", None, "Same editorial project as the William Davidson English; not an independent witness"),
 ("S5", None, "Rashash on Sanhedrin 101a, Vilna edition (Sefaria)", "sources/rashash_sanhedrin_101a.json", None, None),
 ("S6", None, "Yad Ramah on Sanhedrin 101a, Warsaw 1895 (Sefaria)", "sources/yad_ramah_sanhedrin_101a.json", None, None),
 ("S7", None, "Rif Sanhedrin 20a, Vilna edition (Sefaria)", "sources/rif_sanhedrin_20a.json", None, None),
 ("S8", None, "Hagahot HaBach on Rif Sanhedrin 20a, Vilna edition (Sefaria)", "sources/hagahot_habach_rif_sanhedrin_20a.json", None, None),
 ("S9", None, "Rosh on Sanhedrin 7:8, Vilna edition (Sefaria)", "sources/rosh_sanhedrin_7_8.json", None, None),
 ("S10", None, "Teshuvot HaRadbaz vol. 3 no. 848, Warsaw 1882 (Sefaria)", "sources/radbaz_3_848.json", None, "Quotes the Rosh"),
 ("S11", None, "Beit Yosef, Yoreh De'ah 179, Tur Vilna 1923 (Sefaria)", "sources/beit_yosef_yd_179.json", None, "Quotes a Ramban responsum"),
 ("S12", None, "Bach, Yoreh De'ah 179, Tur Vilna 1923 (Sefaria)", "sources/bach_yd_179.json", None, None),
 ("S13", None, "Sefer Mitzvot Gadol, Negative Commandments 55, Munkatch 1901 (Sefaria)", "sources/smag_lav_55.json", None, "Main text plus a bracketed gloss"),
 ("S14", None, "Be'er Sheva on Sanhedrin 101a, Warsaw 1890 (Sefaria)", "sources/beer_sheva_sanhedrin_101a.json", None, None),
 ("S15", None, "Tosefta Shabbat (Lieberman) ch. 7, codex Vienna, JTS 2001 (Sefaria)", "sources/tosefta_shabbat_lieberman_7.json", None, None),
 ("S16", None, "Tosefta Shabbat ch. 8, Vilna-type printed text (Sefaria)", "sources/tosefta_shabbat_vilna_8.json", None, None),
 ("S17", None, "Seder HaDorot, Tanaim and Amoraim 2164, Warsaw 1878-1882 (Sefaria)", "sources/seder_hadorot_2164.json", None, "A later biographical compilation; its grouping of passages by name is a historical hypothesis"),
 ("S18", None, "Soncino English translation, Sanhedrin 101, as posted on halakhah.com", "sources/soncino_halakhah_com_sanhedrin_101.html", None, "HTML; quotes are exact substrings of the saved bytes"),
 ("S19", None, "Sefaria v3 Yevamot 49b, all versions", "sources/sefaria_v3_yevamot_49b_all.json", None, "The Isaiah cedar story that Rashash compares"),
 ("S20", None, "Meiri on Sanhedrin 101a (Sefaria)", "sources/meiri_sanhedrin_101a.json", None, "Checked; no reading of the story or of Rav Huna's line was found in the saved text"),
 ("S21", None, "Tosefta Kifshutah on Shabbat 7:22, JTS 2001 (Sefaria)", "sources/tosefta_kifshutah_shabbat_7_22.json", None, None),
 ("S24", None, "Lieberman variant apparatus on Tosefta Shabbat 7:22 (Sefaria, 'Variants on Shabbat 7:22')", "sources/tosefta_lieberman_variants_shabbat_7_22.json", None, None),
 ("S22", None, "Sefaria links for Sanhedrin 101a:6", "sources/sefaria_links_sanhedrin_101a_6.json", None, "Link list used to choose commentaries"),
 ("S23", None, "Sefaria links for Sanhedrin 101a:5", "sources/sefaria_links_sanhedrin_101a_5.json", None, "Link list used to choose commentaries"),
]

def text_of(path):
    raw = open(path, "rb").read().decode("utf-8")
    if not path.endswith(".json"):
        return [raw]
    d = json.loads(raw)
    out = []
    def walk(x):
        if isinstance(x, str): out.append(x)
        elif isinstance(x, list):
            for y in x: walk(y)
        elif isinstance(x, dict):
            for y in x.values(): walk(y)
    walk(d)
    return out

sources = []
for sid, url, ed, f, fa, note in SRC:
    e = log.get(f)
    s = {"source_id": sid, "url_or_path": url or (e and e["url"]), "edition": ed,
         "fetched_at": fa if fa else (e["fetched_at"] if e else None), "saved_file": f, "sha256": sha(f)}
    if note: s["note"] = note
    sources.append(s)
path_of = {s["source_id"]: s["saved_file"] for s in sources}

d = json.load(open("dossier_body.json"))
bad = 0
for fnd in d["findings"]:
    for ev in fnd["evidence"]:
        texts = text_of(path_of[ev["source_id"]])
        if not any(ev["exact_quote"] in t for t in texts):
            bad += 1; print("QUOTE NOT FOUND", fnd["finding_id"], ev["source_id"], ev["exact_quote"][:60])
out = {"job_id": "challenge-01", "focal_ref": "Sanhedrin 101a:6"}
out.update({k: d[k] for k in ("status", "question", "scope_note")})
out["sources"] = sources
for k in ("findings", "alternative_readings", "unresolved", "proposed_corrections", "ontology_lessons", "graph_status"):
    out[k] = d[k]
json.dump(out, open("dossier.json", "w"), ensure_ascii=False, indent=1)
print("findings", len(d["findings"]), "bad quotes", bad)
sys.exit(1 if bad else 0)
