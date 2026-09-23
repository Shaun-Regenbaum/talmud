import json, hashlib, os, html, re, sys
# Build dossier.json for challenge-03 from saved sources; every exact_quote is checked
# against the saved file (JSON text fields, or raw HTML for the Soncino page).
os.chdir(os.path.dirname(os.path.abspath(__file__)))
log = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if "saved_file" in e}
failed = [e for e in json.load(open("sources/fetch_log.json")) if "error" in e]

SRC = [
    ("S0", "research/sage-network/pilot/inputs/challenge-03.json", "Pilot input: Wikisource Talmud Bavli, Bava Batra 152b:4-8 (read-only)", "../../../pilot/inputs/challenge-03.json", "2026-09-20T08:23:16Z", "fetched_at is the input's captured_at; file read, not modified"),
    ("S0b", "research/sage-network/pilot/outputs/challenge-03.json", "Pilot first reading (read-only)", "../../../pilot/outputs/challenge-03.json", None, "The earlier reading under review"),
    ("S0c", "research/sage-network/followup-v1/cases/challenge-03/previous-review.json", "Earlier independent review (read-only)", "previous-review.json", None, "Checked, not assumed correct"),
    ("S1", None, "Sefaria v3 Bava Batra 152b: Wikisource Talmud Bavli; William Davidson Edition (Vocalized Aramaic, Aramaic, English)", "sources/sefaria_v3_bb_152b_all.json", None, "Wikisource segments 4-8 equal the pilot input text"),
    ("S2", None, "Sefaria v3 Bava Batra 152a: Wikisource; William Davidson Edition", "sources/sefaria_v3_bb_152a_all.json", None, "The earlier dispute referred to in 152b:6-7"),
    ("S3", None, "Sefaria v3 Bava Batra 153a: Wikisource; William Davidson Edition", "sources/sefaria_v3_bb_153a_all.json", None, "Continuation of the Pumbedita report"),
    ("S4", None, "Sefaria links API, Bava Batra 152b:7", "sources/sefaria_links_bb_152b_7.json", None, None),
    ("S5", None, "Sefaria links API, Bava Batra 152b:8", "sources/sefaria_links_bb_152b_8.json", None, None),
    ("S6", None, "Sefaria links API, Bava Batra 152b:6", "sources/sefaria_links_bb_152b_6.json", None, None),
    ("S7", None, "Rashbam on Bava Batra 152b, Vilna Edition (Sefaria)", "sources/rashbam_bb_152b.json", None, None),
    ("S8", None, "Rashbam on Bava Batra 152a, Vilna Edition (Sefaria)", "sources/rashbam_bb_152a.json", None, None),
    ("S9", None, "Tosafot on Bava Batra 152b, Vilna Edition (Sefaria)", "sources/tosafot_bb_152b.json", None, None),
    ("S10", None, "Rabbeinu Gershom on Bava Batra 152b, Vilna Edition (Sefaria), with bracketed editorial footnotes", "sources/rabbeinu_gershom_bb_152b.json", None, None),
    ("S11", None, "Steinsaltz on Bava Batra 152b, William Davidson Edition - Hebrew (Sefaria)", "sources/steinsaltz_bb_152b.json", None, "Same editorial work as the William Davidson English; not an independent witness to it"),
    ("S12", None, "Yad Ramah on Bava Batra 152b (Sefaria)", "sources/yad_ramah_bb_152b.json", None, None),
    ("S13", None, "Ri Migash on Bava Batra 152b, Warsaw 1884 (Sefaria)", "sources/ri_migash_bb_152b.json", None, None),
    ("S14", None, "Tosafot Rid on Bava Batra 152b (Sefaria)", "sources/tosafot_rid_bb_152b.json", None, None),
    ("S15", None, "Chokhmat Shlomo on Bava Batra 152b, Vilna Edition (Sefaria)", "sources/chokhmat_shlomo_bb_152b.json", None, None),
    ("S16", None, "Rif Bava Batra 71b, Vilna Edition (Sefaria)", "sources/rif_bb_71b.json", None, None),
    ("S17", None, "Mishneh Torah, Ownerless Property and Gifts 9, Torat Emet (Sefaria)", "sources/mt_zekhiya_9.json", None, None),
    ("S18", None, "Chiddushei HaRamban on Bava Batra 152b, Jerusalem 1928-29 (Sefaria)", "sources/ramban_bb_152b.json", None, None),
    ("S19", None, "Rashba on Bava Batra 152b, Gerlitz edition (Sefaria)", "sources/rashba_bb_152b.json", None, None),
    ("S20", None, "Sefaria exact-phrase search: דייתיקי מבטלת דייתיקי", "sources/search_dayetiki_mevatelet.json", None, "Search index snapshot; hits are pointers, the texts themselves were fetched where used"),
    ("S21", None, "Sefaria exact-phrase search: שלחו ליה מבי רב לשמואל", "sources/search_shalchu_mibei_rav_lishmuel.json", None, None),
    ("S22", None, "Sefaria exact-phrase search: ירמיה בר אבא", "sources/search_yirmiya_bar_abba.json", None, "First 100 hits only of a larger total"),
    ("S23", None, "Sefaria exact-phrase search: מבי רב לשמואל", "sources/search_mibei_rav_lishmuel.json", None, None),
    ("S24", None, "Sefaria v3 Sanhedrin 24b: Wikisource; William Davidson Edition", "sources/sefaria_v3_sanhedrin_24b_all.json", None, "Parallel Sura/Pumbedita formula"),
    ("S25", None, "Rashi on Sanhedrin 24b, Vilna Edition (Sefaria)", "sources/rashi_sanhedrin_24b.json", None, None),
    ("S26", None, "Rashi on Gittin 66b (Sefaria)", "sources/rashi_gittin_66b.json", None, "Fetched to look for a gloss on מבי רב; none found in this file"),
    ("S27", None, "Rashi on Shevuot 46a (Sefaria)", "sources/rashi_shevuot_46a.json", None, "Fetched to look for a gloss on מבי רב; none found in this file"),
    ("S28", None, "Rashi on Gittin 89b (Sefaria)", "sources/rashi_gittin_89b.json", None, "Fetched to look for a gloss on מבי רב; none found in this file"),
    ("S29", None, "Shita Mekubetzet on Bava Batra 152b, Vilna Ed. (Sefaria)", "sources/shita_mekubetzet_bb_152b.json", None, "Compilation quoting earlier authorities (Rosh, Raavad, others)"),
    ("S30", None, "Shita Mekubetzet on Bava Batra 152a (Sefaria)", "sources/shita_mekubetzet_bb_152a.json", None, None),
    ("S31", None, "Rashbam on Bava Batra 153a, Vilna Edition (Sefaria)", "sources/rashbam_bb_153a.json", None, None),
    ("S32", None, "Sefaria v3 Bava Batra 135b: Wikisource; William Davidson Edition", "sources/sefaria_v3_bb_135b_all.json", None, "Other Rav Dimi occurrence of the same dictum"),
    ("S33", None, "Sefaria v3 Jerusalem Talmud Bava Batra 8:7 (Guggenheimer; Mechon-Mamre; Venice)", "sources/sefaria_v3_yerushalmi_bb_8_7.json", None, "Different corpus; parallel wording, not a variant of the Bavli sentence"),
    ("S34", None, "Soncino English translation (I. W. Slotki), Bava Bathra 152, as posted at halakhah.com", "sources/soncino_halakhah_com_bava_batra_152.html", None, "Published translation with footnotes; separate from the Davidson/Steinsaltz editorial work"),
]

def texts_of(path):
    b = open(path, "rb").read()
    if path.endswith(".html"):
        s = b.decode("utf-8", "replace")
        return [s, html.unescape(s)]
    d = json.loads(b)
    out = []
    def walk(x):
        if isinstance(x, str): out.append(x)
        elif isinstance(x, list): [walk(y) for y in x]
        elif isinstance(x, dict): [walk(y) for y in x.values()]
    walk(d)
    return out

sources, TXT = [], {}
for sid, path, ed, f, fa, note in SRC:
    b = open(f, "rb").read()
    e = log.get(f, {})
    rec = {"source_id": sid, "url_or_path": path or e.get("url"), "edition": ed, "fetched_at": fa or e.get("fetched_at"),
           "saved_file": f, "sha256": hashlib.sha256(b).hexdigest()}
    if note: rec["note"] = note
    sources.append(rec); TXT[sid] = texts_of(f)

findings = json.load(open("findings.json"))
bad = []
def check(ev, where):
    for x in ev:
        q = x["exact_quote"]
        if not any(q in t for t in TXT[x["source_id"]]): bad.append((where, x["source_id"], q))
for fi in findings["findings"]: check(fi["evidence"], fi["finding_id"])
for a in findings["alternative_readings"]: check(a.get("evidence", []), a["id"])
if bad:
    for b_ in bad: print("QUOTE NOT FOUND", b_)
    sys.exit(1)

dossier = {
    "job_id": "challenge-03",
    "focal_ref": "Bava Batra 152b:7",
    "status": findings["status"],
    "question": findings["question"],
    "scope_note": findings["scope_note"],
    "quote_rule": "Each exact_quote is a contiguous substring of one text field in the saved JSON (or of the saved HTML for S34). Translations marked 'translation (this dossier)' are brief renderings by this dossier.",
    "sources": sources,
    "failed_requests": [{"url": e["url"], "fetched_at": e["fetched_at"], "error": e["error"], "meaning": "Request failed; this is not evidence that the work does not exist or does not comment here."} for e in failed],
    **{k: findings[k] for k in ["findings", "alternative_readings", "unresolved", "proposed_corrections", "ontology_lessons"]},
}
json.dump(dossier, open("dossier.json", "w"), ensure_ascii=False, indent=1)
print("ok", len(sources), "sources", len(findings["findings"]), "findings")
