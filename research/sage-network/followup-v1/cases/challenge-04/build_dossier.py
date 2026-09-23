"""Assemble dossier.json for challenge-04 from saved sources; hashes are computed from the saved bytes."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOG = {Path(e["saved_file"]).name: e for e in json.loads((HERE / "sources/fetch_log.json").read_text()) if "saved_file" in e}


def src(source_id, saved_file, edition, url=None, input_path=None):
    data = (HERE / saved_file).read_bytes()
    entry = {"source_id": source_id}
    if url:
        entry["url"] = url
    if input_path:
        entry["input_path"] = input_path
    fetched = LOG.get(Path(saved_file).name)
    entry.update({"edition": edition,
                  "fetched_at": fetched["fetched_at"] if fetched and saved_file.startswith("sources/") else None,
                  "saved_file": saved_file,
                  "sha256": hashlib.sha256(data).hexdigest()})
    if url is None and fetched and saved_file.startswith("sources/"):
        entry["url"] = fetched["url"]
    return entry


def web(source_id, name, edition):
    return src(source_id, "sources/" + name, edition, url=LOG[name]["url"])


SOURCES = [
    src("pilot_input", "../../../pilot/inputs/challenge-04.json", "Pilot source job (Wikisource Talmud Bavli, Bava Batra 170b:3-5)",
        input_path="research/sage-network/pilot/inputs/challenge-04.json"),
    src("pilot_output", "../../../pilot/outputs/challenge-04.json", "First saved reading (passage-pilot-v1)",
        input_path="research/sage-network/pilot/outputs/challenge-04.json"),
    src("previous_review", "previous-review.json", "Earlier independent review of the first reading",
        input_path="research/sage-network/followup-v1/cases/challenge-04/previous-review.json"),
    web("bb170b", "bb170b_v3.json", "Sefaria v3: Wikisource Talmud Bavli; William Davidson vocalized Aramaic; William Davidson English (HTML kept)"),
    web("bb170a", "bb170a_v3.json", "Sefaria v3: Wikisource Talmud Bavli; William Davidson English"),
    web("bb171a", "bb171a_v3.json", "Sefaria v3: Wikisource Talmud Bavli; William Davidson English"),
    web("links_170b3", "bb170b3_related.json", "Sefaria related-links API"),
    web("links_170b4", "bb170b4_related.json", "Sefaria related-links API"),
    web("links_170b5", "bb170b5_related.json", "Sefaria related-links API"),
    web("links_171a1", "bb171a1_related.json", "Sefaria related-links API"),
    web("links_171a5", "bb171a5_related.json", "Sefaria related-links API"),
    web("rashbam_170b3", "rashbam_170b3.json", "Rashbam, Vilna edition (Sefaria)"),
    web("rashbam_170b4", "rashbam_170b4.json", "Rashbam, Vilna edition (Sefaria)"),
    web("rashbam_170b5", "rashbam_170b5.json", "Rashbam, Vilna edition (Sefaria)"),
    web("rashbam_171a1", "rashbam_171a1.json", "Rashbam, Vilna edition (Sefaria)"),
    web("tosafot_170b3", "tosafot_170b3.json", "Tosafot, Vilna edition (Sefaria)"),
    web("tosafot_171a1", "tosafot_171a1.json", "Tosafot, Vilna edition (Sefaria)"),
    web("shitah_170b2", "shitah_170b2.json", "Shita Mekubetzet, Vilna edition (Sefaria), quoting Tosfot HaRosh"),
    web("ramban_170b2", "ramban_170b2.json", "Chiddushei HaRamban, Jerusalem 1928-29 (Sefaria)"),
    web("ramban_171a1", "ramban_171a1.json", "Chiddushei HaRamban, Jerusalem 1928-29 (Sefaria)"),
    web("rashba_171a1", "rashba_171a1.json", "Rashba, Gerlitz edition, Oraita (Sefaria)"),
    web("gershom_170b10", "gershom_170b10.json", "Rabbeinu Gershom, Vilna edition (Sefaria)"),
    web("gershom_170b11", "gershom_170b11.json", "Rabbeinu Gershom, Vilna edition (Sefaria)"),
    web("meiri_170b4", "meiri_170b4.json", "Meiri on Shas (Sefaria)"),
    web("meiri_170b5", "meiri_170b5.json", "Meiri on Shas (Sefaria)"),
    web("chokhmat_shlomo", "chokhmat_shlomo_170b1.json", "Chokhmat Shlomo, Vilna edition (Sefaria)"),
    web("steinsaltz_170b4", "steinsaltz_170b4.json", "Steinsaltz Hebrew, William Davidson Edition (Sefaria)"),
    web("steinsaltz_170b5", "steinsaltz_170b5.json", "Steinsaltz Hebrew, William Davidson Edition (Sefaria)"),
    web("soncino", "soncino_bb170_halakhah_com.html", "Soncino English translation, Baba Bathra 170b (halakhah.com HTML)"),
    web("jt_bb_10_6", "jt_bb_10_6.json", "Sefaria v3: Jerusalem Talmud Bava Batra 10:6 - Guggenheimer Hebrew and English, Mechon-Mamre, Venice edition"),
    web("links_jt", "jt_bb_10_6_2_related.json", "Sefaria related-links API"),
    web("penei_moshe", "penei_moshe_jt_10_6_2.json", "Penei Moshe, Piotrkow 1898-1900 (Sefaria)"),
    web("mareh_hapanim", "mareh_hapanim_jt_10_6_2.json", "Mareh HaPanim, Piotrkow 1898-1900 (Sefaria)"),
    web("ridbaz", "ridbaz_jt_10_6_2.json", "Chiddushei Ridbaz, Piotrkow 1898-1900 (Sefaria)"),
    web("noam_yerushalmi", "noam_yerushalmi_10_6_2.json", "Noam Yerushalmi, Vilna 1869 (Sefaria)"),
    web("shaarei_tey_1", "shaarei_tey_10_6_2_1.json", "Sha'arei Torat Eretz Yisrael, Jerusalem 1940 (Sefaria)"),
    web("shaarei_tey_2", "shaarei_tey_10_6_2_2.json", "Sha'arei Torat Eretz Yisrael, Jerusalem 1940 (Sefaria)"),
    web("mt_23_15", "mt_malveh_23_15.json", "Mishneh Torah, Creditor and Debtor 23:15, Torat Emet (Sefaria)"),
    web("sa_54_1", "sa_cm_54_1.json", "Shulchan Arukh, Choshen Mishpat 54:1 (Sefaria)"),
    web("intro_tosefta", "intro_tosefta_101.json", "Introductions to Tannaitic Literature, Introduction to Tosefta 101, Jerusalem 1957 (Sefaria)"),
]

FINDINGS = json.loads((HERE / "findings.json").read_text())
REST = json.loads((HERE / "dossier_parts.json").read_text())

dossier = {
    "job_id": "challenge-04",
    "focal_ref": "Bava Batra 170b:4",
    "status": "researched",
    "question": REST["question"],
    "scope_checked": REST["scope_checked"],
    "sources": SOURCES,
    "failed_requests": REST["failed_requests"],
    "sources_checked_without_relevant_content": REST["sources_checked_without_relevant_content"],
    "findings": FINDINGS,
    "alternative_readings": REST["alternative_readings"],
    "unresolved": REST["unresolved"],
    "proposed_corrections": REST["proposed_corrections"],
    "review_assessment": REST["review_assessment"],
    "ontology_lessons": REST["ontology_lessons"],
    "notes": REST["notes"],
}
part = HERE / "dossier.json.part"
part.write_text(json.dumps(dossier, ensure_ascii=False, indent=1) + "\n")
part.replace(HERE / "dossier.json")
print("findings", len(FINDINGS), "sources", len(SOURCES))
