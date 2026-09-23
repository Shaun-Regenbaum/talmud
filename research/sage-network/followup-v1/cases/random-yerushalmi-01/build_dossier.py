"""Build dossier.json for random-yerushalmi-01 and verify every evidence quote
is an exact substring of a string inside the saved source file."""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
INPUT = "/Users/shaunie/Documents/Code/talmud/.claude/worktrees/sage-reader-recovery/research/sage-network/pilot/inputs/random-yerushalmi-01.json"
LOG = json.load(open(os.path.join(HERE, "sources/fetch_log.json")))
BY_FILE = {e["saved_file"]: e for e in LOG if e.get("status") == "ok"}

GUG_EN = "The Jerusalem Talmud, translation and commentary by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015"
GUG_HE = "The Jerusalem Talmud, edition by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015"
PIOTRKOW = "Piotrków, 1898-1900 (as digitized on Sefaria)"

SRC = [
    ("IN", INPUT, "Pilot input package (segments s1-s5, Venice Edition text as captured 2026-09-20)", None),
    ("JT12", "sources/jt_taanit_1_2_v3.json", f"{GUG_HE}; {GUG_EN} (text only, notes stripped)", None),
    ("JT12_GUG_EN", "sources/jt_taanit_1_2_guggenheimer_en_with_notes.json", GUG_EN + " (with footnotes)", None),
    ("JT12_VEN", "sources/jt_taanit_1_2_venice_he.json", "Venice Edition (Sefaria)", None),
    ("JT12_MM", "sources/jt_taanit_1_2_mechon_mamre_he.json", "Mechon-Mamre (Sefaria)", None),
    ("JT12_SCHWAB", "sources/jt_taanit_1_2_schwab_fr_v1.json", "Le Talmud de Jérusalem, traduit par Moise Schwab, 1878-1890 [fr] (Sefaria)", None),
    ("JT13", "sources/jt_taanit_1_3_v3.json", f"{GUG_HE}; {GUG_EN} (text only)", None),
    ("JT11", "sources/jt_taanit_1_1_v3.json", f"{GUG_HE}; {GUG_EN} (text only)", None),
    ("MISHNAH", "sources/mishnah_taanit_1.json", "Mishnah Taanit 1, Torat Emet 357 (Sefaria default Hebrew)", None),
    ("PM124", "sources/penei_moshe_jt_taanit_1_2_4.json", "Penei Moshe, " + PIOTRKOW, None),
    ("KH124", "sources/korban_haedah_jt_taanit_1_2_4.json", "Korban HaEdah, " + PIOTRKOW, None),
    ("MHP124", "sources/mareh_hapanim_jt_taanit_1_2_4.json", "Mareh HaPanim, " + PIOTRKOW, None),
    ("STEY124", "sources/shaarei_torat_ey_jt_taanit_1_2_4.json", "Sha'arei Torat Eretz Yisrael, Jerusalem 1940 (Sefaria)", None),
    ("OLY124", "sources/ohr_layesharim_jt_taanit_1_2_4.json", "Ohr LaYesharim, Machon HaYerushalmi, R. Yehoshua Buch, 2004 (Sefaria)", None),
    ("PM125", "sources/penei_moshe_jt_taanit_1_2_5.json", "Penei Moshe, " + PIOTRKOW, None),
    ("KH125", "sources/korban_haedah_jt_taanit_1_2_5.json", "Korban HaEdah, " + PIOTRKOW, None),
    ("PM131", "sources/penei_moshe_jt_taanit_1_3_1.json", "Penei Moshe, " + PIOTRKOW, None),
    ("KH131", "sources/korban_haedah_jt_taanit_1_3_1.json", "Korban HaEdah, " + PIOTRKOW, None),
    ("LINKS124", "sources/links_jt_taanit_1_2_4.json", "Sefaria links index for Jerusalem Talmud Taanit 1:2:4", None),
    ("LINKS125", "sources/links_jt_taanit_1_2_5.json", "Sefaria links index for Jerusalem Talmud Taanit 1:2:5", None),
    ("LINKS131", "sources/links_jt_taanit_1_3_1.json", "Sefaria links index for Jerusalem Talmud Taanit 1:3:1", None),
    ("B3A", "sources/bavli_taanit_3a.json", "Bavli Taanit 3a, William Davidson Edition - Vocalized Aramaic", None),
    ("B3A_EN", "sources/bavli_taanit_3a_davidson_en.json", "Bavli Taanit 3a, William Davidson Edition - English", None),
    ("B4B", "sources/bavli_taanit_4b.json", "Bavli Taanit 4b, William Davidson Edition - Vocalized Aramaic", None),
    ("B4B_EN", "sources/bavli_taanit_4b_davidson_en.json", "Bavli Taanit 4b, William Davidson Edition - English", None),
    ("MEG3_HE", "sources/jt_megillah_3_he_guggenheimer.json", GUG_HE, None),
    ("MEG3_EN", "sources/jt_megillah_3_en_guggenheimer.json", GUG_EN, None),
    ("SHAB12_EN", "sources/jt_shabbat_1_2_guggenheimer_en.json", GUG_EN, None),
    ("SHAB12_VEN", "sources/jt_shabbat_1_2_venice_he.json", "Venice Edition (Sefaria)", None),
    ("SANH101", "sources/jt_sanhedrin_10_1_he.json", GUG_HE + " and other Hebrew versions returned", None),
    ("SHEK626", "sources/jt_shekalim_6_2_6.json", GUG_HE, None),
    ("SHEK729", "sources/jt_shekalim_7_2_9.json", GUG_HE, None),
    ("TK", "sources/tosefta_kifshutah_terumot_5_10_18.json", "Tosefta Kifshutah (S. Lieberman) on Terumot 5:10:18, Sefaria", None),
    ("SZ79", "sources/sifrei_zuta_midrashah_shel_lod_79.json", "Sifrei Zuta; Midrashah shel Lod (S. Lieberman) 79, Sefaria", None),
    ("MEY_TAAN", "sources/mishnat_ey_taanit_1_2_5.json", "Mishnat Eretz Yisrael on Mishnah Taanit 1:2:5, Sefaria", None),
    ("MEY_BER", "sources/mishnat_ey_berakhot_5_2_4.json", "Mishnat Eretz Yisrael on Mishnah Berakhot 5:2:4, Sefaria", None),
    ("JAS_HAVIV", "sources/lexicon_haviv.json", "Sefaria lexicon lookup חביב (Jastrow; Klein)", None),
    ("JAS_TSYT", "sources/lexicon_tsyt.json", "Sefaria lexicon lookup צית (Jastrow; Klein)", None),
    ("DICT_TSAYET", "sources/dictionary_of_talmud_tsayet.json", "A Dictionary of the Talmud, entry צַיֵּת, Sefaria", None),
    ("JAS_BULI", "sources/jastrow_buli_1.json", "Jastrow, *בּוּלִי I, Sefaria", None),
    ("JAS_NEHAR", "sources/jastrow_nehar_1.json", "Jastrow, נְהַר I, Sefaria", None),
]


def strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, list):
        for x in o:
            yield from strings(x)
    elif isinstance(o, dict):
        for x in o.values():
            yield from strings(x)


def load_strings(path):
    full = path if os.path.isabs(path) else os.path.join(HERE, path)
    return list(strings(json.load(open(full, encoding="utf-8"))))


def sha(path):
    full = path if os.path.isabs(path) else os.path.join(HERE, path)
    return hashlib.sha256(open(full, "rb").read()).hexdigest()


sources = []
for sid, path, edition, _ in SRC:
    e = BY_FILE.get(path)
    sources.append({
        "source_id": sid,
        "url": e["url"] if e else None,
        "input_path": path if os.path.isabs(path) else None,
        "edition": edition,
        "fetched_at": e["fetched_at"] if e else None,
        "saved_file": path,
        "sha256": sha(path),
    })

d = json.load(open(os.path.join(HERE, "dossier_body.json"), encoding="utf-8"))
d["sources"] = sources
d["fetch_failures_and_empty_responses"] = [
    {"url": e["url"], "error": e.get("error")} for e in LOG if e.get("status") != "ok"
] + [
    {"url": e["url"], "note": "HTTP 200 but no text returned for this section in the requested version; not used as evidence and not taken as proof that no such translation exists"}
    for e in LOG if e.get("status") == "ok" and e["saved_file"] in (
        "sources/jt_taanit_1_2_community_en.json",
        "sources/jt_taanit_1_2_community_en_v1.json",
        "sources/jt_taanit_1_2_schwab_fr.json",
    )
]

cache = {s[0]: load_strings(s[1]) for s in SRC}
bad = []


def check(ev, where):
    sid, q = ev["source_id"], ev["exact_quote"]
    if sid not in cache:
        bad.append((where, sid, "unknown source"))
    elif not any(q in s for s in cache[sid]):
        bad.append((where, sid, q))


for f in d["findings"]:
    for ev in f["evidence"]:
        check(ev, f["finding_id"])
for a in d["alternative_readings"]:
    for ev in a.get("evidence", []):
        check(ev, a["id"])
for c in d["proposed_corrections"]:
    for ev in c.get("evidence", []):
        check(ev, c["correction_id"])

if bad:
    for b in bad:
        print("QUOTE NOT FOUND:", b)
    sys.exit(1)

order = ["job_id", "focal_ref", "status", "question", "scope_checked", "sources",
         "fetch_failures_and_empty_responses", "findings", "alternative_readings",
         "unresolved", "proposed_corrections", "ontology_lessons"]
out = {k: d[k] for k in order if k in d}
json.dump(out, open(os.path.join(HERE, "dossier.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok: dossier.json written;", len(d["findings"]), "findings, all quotes verified")
