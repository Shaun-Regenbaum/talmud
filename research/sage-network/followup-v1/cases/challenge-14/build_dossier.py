"""Build dossier.json for challenge-14 and check every exact_quote against the saved file."""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = {}
for line in open(os.path.join(HERE, "sources/fetch-log.jsonl")):
    d = json.loads(line)
    LOG[d["saved_file"]] = d


def sha(path):
    return hashlib.sha256(open(os.path.join(HERE, path), "rb").read()).hexdigest()


def src(source_id, saved_file, edition, url=None, input_path=None, note=None):
    s = {"source_id": source_id}
    if url is None and saved_file in LOG:
        url = LOG[saved_file]["url"]
    if url:
        s["url"] = url
    if input_path:
        s["input_path"] = input_path
    s["edition"] = edition
    if saved_file in LOG:
        s["fetched_at"] = LOG[saved_file]["fetched_at"]
    s["saved_file"] = saved_file
    s["sha256"] = sha(saved_file)
    if note:
        s["note"] = note
    return s


SOURCES = [
    src("P_IN", "../../../pilot/inputs/challenge-14.json",
        "Frozen pilot job: William Davidson Edition - Vocalized Aramaic, vowel marks removed (segments s1-s4 = Berakhot 5b:17-20)",
        input_path="research/sage-network/pilot/inputs/challenge-14.json"),
    src("P_OUT", "../../../pilot/outputs/challenge-14.json", "First saved reading (pilot output)",
        input_path="research/sage-network/pilot/outputs/challenge-14.json"),
    src("P_COMP", "../../../pilot/compiled/challenge-14.json", "Compiled first reading with resolved character spans",
        input_path="research/sage-network/pilot/compiled/challenge-14.json"),
    src("P_REV", "previous-review.json", "Earlier independent review",
        input_path="research/sage-network/followup-v1/cases/challenge-14/previous-review.json"),
    src("DAV", "sources/sefaria-v3-berakhot-5b-13-24-davidson.json",
        "Sefaria: William Davidson Edition - Vocalized Aramaic + William Davidson Edition - English (Koren/Steinsaltz), Berakhot 5b:13-24"),
    src("DAV_AR", "sources/sefaria-v3-berakhot-5b-17-20-William_Davidson_Edition___Aramaic_.json",
        "Sefaria: William Davidson Edition - Aramaic (unvocalized), Berakhot 5b:17-20"),
    src("WS_BAVLI", "sources/sefaria-v3-berakhot-5b-17-20-Wikisource_Talmud_Bavli_.json",
        "Sefaria: Wikisource Talmud Bavli, Berakhot 5b:17-20"),
    src("COHEN", "sources/sefaria-v3-berakhot-5b-17-20-Tractate_Berakot_by_A__Cohen__Cambridge_.json",
        "Sefaria: Tractate Berakot by A. Cohen, Cambridge University Press, 1921 (English)"),
    src("COHEN_FN", "sources/sefaria-Abraham_Cohen_Footnotes_to_the_English_Translation_of_Masechet_Berakhot.5b.14-17.json",
        "Sefaria: Abraham Cohen footnotes to his 1921 translation, Berakhot 5b notes 14-17"),
    src("RELATED", "sources/sefaria-related-berakhot-5b-17-20.json", "Sefaria related-links index for Berakhot 5b:17-20"),
    src("RASHI", "sources/sefaria-Rashi_on_Berakhot.5b.17-20.json", "Rashi on Berakhot, Vilna Edition (Sefaria)"),
    src("TOS", "sources/sefaria-Tosafot_on_Berakhot.5b.17.json", "Tosafot on Berakhot, Vilna Edition (Sefaria)"),
    src("TOS_ROSH", "sources/sefaria-Tosafot_HaRosh_on_Berakhot.5b.6.json", "Tosafot HaRosh on Berakhot, Warsaw 1863 (Sefaria)"),
    src("STEIN", "sources/sefaria-Steinsaltz_on_Berakhot.5b.17-20.json",
        "Steinsaltz on Berakhot, William Davidson Edition - Hebrew (Sefaria); same editorial family as DAV English"),
    src("MAHARSHA", "sources/sefaria-Chidushei_Agadot_on_Berakhot.5b.12-13.json", "Chidushei Agadot (Maharsha), Vilna Edition (Sefaria)"),
    src("PETACH", "sources/sefaria-Petach_Einayim_on_Berakhot.5b.3-5.json", "Petach Einayim, Jerusalem 1959 (Sefaria)"),
    src("MEIRI", "sources/sefaria-Meiri_on_Berakhot.5b.1.json", "Meiri on Berakhot, Wikisource text (Sefaria)"),
    src("BEN_Y", "sources/sefaria-Ben_Yehoyada_on_Berakhot.5b.6-9.json", "Ben Yehoyada, Senlake edition 2019 based on Jerusalem 1897 (Sefaria)"),
    src("BENAYAHU", "sources/sefaria-Benayahu_on_Berakhot.5b.2.json", "Benayahu, Senlake edition 2019 based on Jerusalem 1905 (Sefaria)"),
    src("CHOKHMAT", "sources/sefaria-Chokhmat_Shlomo_on_Berakhot.5b.4.json", "Chokhmat Shlomo, Vilna Edition (Sefaria)"),
    src("SHD_958_7", "sources/sefaria-Seder_HaDorot__Tanaim_and_Amoraim.958.7.json", "Seder HaDorot, Tanaim and Amoraim, Warsaw 1878-1882 (Sefaria), entry 958:7 (Rav Huna)"),
    src("SHD_1695_1", "sources/sefaria-Seder_HaDorot__Tanaim_and_Amoraim.1695.1.json", "Seder HaDorot, Tanaim and Amoraim, Warsaw 1878-1882 (Sefaria), entry 1695:1"),
    src("SHD_2801_1", "sources/sefaria-Seder_HaDorot__Tanaim_and_Amoraim.2801.1.json", "Seder HaDorot, Tanaim and Amoraim, Warsaw 1878-1882 (Sefaria), entry 2801:1"),
    src("SHD_2031_1", "sources/sefaria-Seder_HaDorot__Tanaim_and_Amoraim.2031.1.json", "Seder HaDorot, Tanaim and Amoraim, Warsaw 1878-1882 (Sefaria), entry 2031:1"),
    src("YOMA19B", "sources/sefaria-Yoma.19b.16-davidson.json", "Sefaria: Yoma 19b:16, William Davidson Edition - Aramaic + English"),
    src("BER29B", "sources/sefaria-Berakhot.29b.16-davidson.json", "Sefaria: Berakhot 29b:16, William Davidson Edition - Aramaic + English"),
    src("SAN97B", "sources/sefaria-Sanhedrin.97b.2-davidson.json", "Sefaria: Sanhedrin 97b:2, William Davidson Edition - Aramaic + English"),
    src("SHAB112A", "sources/sefaria-Shabbat.112a.6-davidson.json", "Sefaria: Shabbat 112a:6, William Davidson Edition - Aramaic + English"),
    src("PES73B", "sources/sefaria-Pesachim.73b.11-davidson.json", "Sefaria: Pesachim 73b:11, William Davidson Edition - Aramaic + English"),
    src("CHUL74B", "sources/sefaria-Chullin.74b.9-davidson.json", "Sefaria: Chullin 74b:9, William Davidson Edition - Aramaic + English"),
    src("ARAKH33B", "sources/sefaria-Arakhin.33b.24-davidson.json", "Sefaria: Arakhin 33b:24, William Davidson Edition - Aramaic + English"),
    src("BER5A_89", "sources/sefaria-Berakhot.5a.8-9-davidson.json", "Sefaria: Berakhot 5a:8-9, William Davidson Edition - Aramaic + English"),
    src("BER5A_1012", "sources/sefaria-Berakhot.5a.10-12-davidson.json", "Sefaria: Berakhot 5a:10-12, William Davidson Edition - Aramaic + English"),
    src("TAANIT20B", "sources/sefaria-Taanit.20b-davidson.json", "Sefaria: Taanit 20b, William Davidson Edition - Aramaic + English"),
    src("EY_DAAT", "sources/sefaria-Ein_Yaakov__Berakhot.1.28.json", "Ein Yaakov, Daat edition (Sefaria), Berakhot 1:28"),
    src("EY_GLICK", "sources/sefaria-Ein_Yaakov__Glick_Edition___Berakhot.1.19.json", "Ein Yaakov (Glick Edition): En Jacob, translated by S. H. Glick, 1916 (Sefaria), Berakhot 1:19"),
    src("WS_BIUR", "sources/wikisource-biur-bavli-berakhot-daf-5-raw.txt",
        "Hebrew Wikisource, ביאור:בבלי ברכות דף ה (community annotated Gemara), raw wikitext; variant notes use template דקס",
        note="Secondary, community-edited report of manuscript variants; the sigla (מ', פ', א') are not expanded on the page as saved."),
    src("WS_DKS_TPL", "sources/wikisource-template-dks-raw.txt", "Hebrew Wikisource, תבנית:דקס (template documentation), raw wikitext"),
    src("SEARCH_ACHUHA", "sources/sefaria-search-achuha-derav-sala.json", "Sefaria search-wrapper POST, exact phrase 'אחוה דרב סלא' (first 60 hits)"),
    src("SEARCH_SALA", "sources/sefaria-search-sala-chasida.json", "Sefaria search-wrapper POST, exact phrase 'סלא חסידא' (first 60 hits)"),
]
SRC = {s["source_id"]: s for s in SOURCES}


def ev(source_id, quote, **extra):
    e = {"source_id": source_id, "exact_quote": quote}
    e.update(extra)
    return e


FINDINGS = json.load(open(os.path.join(HERE, "findings.json")))


def strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, list):
        for x in o:
            yield from strings(x)
    elif isinstance(o, dict):
        for x in o.values():
            yield from strings(x)


def check():
    bad = []
    cache = {}
    for f in FINDINGS["findings"]:
        for e in f["evidence"]:
            s = SRC[e["source_id"]]
            p = os.path.join(HERE, s["saved_file"])
            if p not in cache:
                raw = open(p, "rb").read().decode("utf-8")
                texts = [raw]
                if p.endswith(".json"):
                    texts += list(strings(json.loads(raw)))
                cache[p] = texts
            if not any(e["exact_quote"] in t for t in cache[p]):
                bad.append((f["finding_id"], e["source_id"], e["exact_quote"][:60]))
    return bad


bad = check()
if bad:
    for b in bad:
        print("QUOTE NOT FOUND:", b)
    sys.exit(1)

used = {e["source_id"] for f in FINDINGS["findings"] for e in f["evidence"]}
dossier = {
    "job_id": "challenge-14",
    "focal_ref": "Berakhot 5b:17",
    "status": FINDINGS["status"],
    "question": FINDINGS["question"],
    "scope_checked": FINDINGS["scope_checked"],
    "sources": SOURCES,
    "findings": FINDINGS["findings"],
    "alternative_readings": FINDINGS["alternative_readings"],
    "unresolved": FINDINGS["unresolved"],
    "proposed_corrections": FINDINGS["proposed_corrections"],
    "ontology_lessons": FINDINGS["ontology_lessons"],
}
json.dump(dossier, open(os.path.join(HERE, "dossier.json"), "w"), ensure_ascii=False, indent=2)
print("ok: findings", len(FINDINGS["findings"]), "sources", len(SOURCES), "sources cited", len(used))
