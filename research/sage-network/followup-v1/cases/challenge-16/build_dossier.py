import hashlib, json, unicodedata
from pathlib import Path

# Build dossier.json from the saved sources. Hashes are computed from the exact saved bytes.
ROOT = Path(__file__).parent
LOG = {e["saved_file"]: e for e in json.load(open(ROOT / "sources/fetch_log.json")) if e.get("saved_file")}

SOURCES = [
    ("S0", "research/sage-network/pilot/inputs/challenge-16.json", "Pilot input job: Berakhot 10a:21-25, William Davidson Edition - Vocalized Aramaic (read-only)", "../../../pilot/inputs/challenge-16.json", "2026-09-22T10:13:07Z", "fetched_at is the input's retrieved_at_utc; file read, not modified"),
    ("S0b", "research/sage-network/pilot/outputs/challenge-16.json", "Pilot first reading (read-only)", "../../../pilot/outputs/challenge-16.json", None, "The earlier reading under review"),
    ("S0c", "research/sage-network/followup-v1/cases/challenge-16/previous-review.json", "Earlier independent review (read-only)", "previous-review.json", None, "The earlier review under challenge"),
    ("S1", None, "Sefaria API v3, Berakhot 10a: William Davidson Edition - Vocalized Aramaic and William Davidson Edition - English (whole amud)", "sources/sefaria_v3_berakhot_10a_wd.json", None, "English keeps its HTML; bold = translation of the Aramaic, plain = editor's explanation"),
    ("S2", None, "Sefaria API v3, Steinsaltz on Berakhot 10a (William Davidson Edition - Hebrew)", "sources/steinsaltz_berakhot_10a.json", None, "Same editorial project as the William Davidson English; not an independent witness"),
    ("S3", None, "Sefaria API v3, Rashi on Berakhot 10a (Vilna Edition)", "sources/rashi_berakhot_10a.json", None, None),
    ("S4", None, "Sefaria API v3, Chidushei Agadot (Maharsha) on Berakhot 10a (Vilna Edition)", "sources/chidushei_agadot_berakhot_10a.json", None, None),
    ("S5", None, "Sefaria API v3, Berakhot 10a:21-25, Wikisource Talmud Bavli (Hebrew)", "sources/sefaria_berakhot_10a_21-25_wikisource.json", None, None),
    ("S6", None, "Sefaria API v3, Berakhot 10a:21-25, Tractate Berakot by A. Cohen, Cambridge University Press, 1921", "sources/sefaria_berakhot_10a_21-25_cohen1921.json", None, None),
    ("S7", None, "Sefaria API v3, Abraham Cohen Footnotes to the English Translation of Masechet Berakhot 10a (Cohen 1921)", "sources/cohen_footnotes_berakhot_10a_v2.json", None, None),
    ("S8", None, "Soncino English Talmud, Berakoth 10 (as posted at halakhah.com)", "sources/soncino_halakhah_com_berakoth_10.html", None, "Hebrew words in the footnotes are replaced by [H] on this site"),
    ("S9", None, "Sefaria API v3, Seder HaDorot, Tanaim and Amoraim 2859 (Warsaw, 1878-1882): entry מר עוקבא", "sources/seder_hadorot_2859.json", None, None),
    ("S10", None, "Sefaria API v3, Seder HaDorot, Tanaim and Amoraim 3299 (Warsaw, 1878-1882): entry רב שימי בר עוקבא", "sources/seder_hadorot_3299.json", None, None),
    ("S11", None, "Sefaria API v3, Midrash Tehillim 103", "sources/midrash_tehillim_103.json", None, None),
    ("S12", None, "Sefaria API v3, Devarim Rabbah 2:37 (Midrash Rabbah -- TE)", "sources/devarim_rabbah_2_37.json", None, None),
    ("S13", None, "Sefaria API v3, Vayikra Rabbah 4:8 (Midrash Rabbah -- TE)", "sources/vayikra_rabbah_4_8.json", None, "Only this segment was saved; its preceding segment was not checked"),
    ("S14", None, "Sefaria API v3, Mevo HaTalmud (Chajes) 32", "sources/mevo_hatalmud_chajes_32.json", None, None),
    ("S15", None, "Hebrew Wikisource, ביאור:בבלי ברכות דף י (explained Gemara with variant notes), raw wikitext", "sources/wikisource_biur_berakhot_10_raw.txt", None, "Variant notes are the site's report; the manuscripts were not viewed here"),
    ("S16", None, "Hebrew Wikisource, תבנית:דקס (template documentation), raw wikitext", "sources/wikisource_template_dks_raw.txt", None, "States where the variant notes come from"),
    ("S17", None, "Hebrew Wikisource, ברכות י א (tagged Talmud text), raw wikitext", "sources/wikisource_berakhot_10a_raw.txt", None, None),
    ("S18", None, "Sefaria API, links for Berakhot 10a:21", "sources/sefaria_links_berakhot_10a_21.json", None, "Index of linked commentaries; used to choose what to read"),
    ("S19", None, "Sefaria API v3, Berakhot 10a:21-25, William Davidson Edition - Aramaic (unvocalized)", "sources/sefaria_berakhot_10a_21-25_wd_aramaic.json", None, None),
    ("S20", None, "Sefaria API v3, Pesikta Rabbati 10:1", "sources/pesikta_rabbati_10_1.json", None, "Fetched because Sefaria links it to 10a:24-25; the parallel was not located in this saved text and nothing is claimed from it"),
    ("S21", None, "Sefaria API, links for Berakhot 10a:24", "sources/sefaria_links_berakhot_10a_24.json", None, "Index of linked texts"),
    ("S22", None, "Sefaria API, links for Berakhot 10a:25", "sources/sefaria_links_berakhot_10a_25.json", None, "Index of linked texts"),
]


def sources():
    out = []
    for sid, path, edition, saved, fetched, note in SOURCES:
        data = (ROOT / saved).read_bytes()
        rec = {"source_id": sid}
        if path:
            rec["url_or_path"] = path
        else:
            rec["url_or_path"] = LOG[saved]["url"]
            fetched = LOG[saved]["fetched_at"]
        rec.update({"edition": edition, "fetched_at": fetched, "saved_file": saved,
                    "sha256": hashlib.sha256(data).hexdigest()})
        if note:
            rec["note"] = note
        out.append(rec)
    return out


def leaves(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for child in value:
            yield from leaves(child)
    elif isinstance(value, dict):
        for child in value.values():
            yield from leaves(child)


def exact_form(sid, quote):
    # Sefaria stores Hebrew marks in a non-canonical order; return the stored bytes' own spelling of the quote.
    saved = next(s[3] for s in SOURCES if s[0] == sid)
    data = (ROOT / saved).read_text()
    try:
        texts = list(leaves(json.loads(data)))
    except ValueError:
        texts = [data]
    if any(quote in t for t in texts):
        return quote
    want = unicodedata.normalize("NFC", quote)
    for t in texts:
        norm = unicodedata.normalize("NFC", t)
        i = norm.find(want)
        if i >= 0 and len(norm) == len(t) and unicodedata.normalize("NFC", t[i:i + len(quote)]) == want:
            return t[i:i + len(quote)]
    return quote


def E(sid, quote, tr=None, **extra):
    item = {"source_id": sid, "exact_quote": exact_form(sid, quote)}
    if tr:
        item["translation_by_this_dossier"] = tr
    item.update(extra)
    return item


from body import body_with
body = body_with(E)
dossier = {"job_id": "challenge-16", "focal_ref": "Berakhot 10a:21", **body, "sources": sources()}
order = ["job_id", "focal_ref", "status", "question", "scope_note", "sources", "findings",
         "alternative_readings", "unresolved", "proposed_corrections", "ontology_lessons", "graph_status"]
dossier = {k: dossier[k] for k in order if k in dossier}
(ROOT / "dossier.json").write_text(json.dumps(dossier, ensure_ascii=False, indent=1) + "\n")
print("wrote dossier.json", len(dossier["sources"]), "sources", len(dossier["findings"]), "findings")
