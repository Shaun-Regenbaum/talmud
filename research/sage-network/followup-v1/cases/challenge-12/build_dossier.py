"""Build dossier.json for challenge-12 from saved sources.

Hashes and fetch times are read from the saved files so they always match the bytes."""

import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
S = "https://www.sefaria.org/api/v3/texts/"

SOURCES = [
    ("pilot_input", "../../../pilot/inputs/challenge-12.json", None,
     "research/sage-network/pilot/inputs/challenge-12.json",
     "Frozen pilot input (Wikisource Talmud Bavli segments 97a:6-7)"),
    ("pilot_output", "../../../pilot/outputs/challenge-12.json", None,
     "research/sage-network/pilot/outputs/challenge-12.json", "Frozen first reading"),
    ("previous_review", "previous-review.json", None,
     "research/sage-network/followup-v1/cases/challenge-12/previous-review.json",
     "Earlier independent review, copied unchanged"),
    ("wikisource_he", "sources/sefaria_v3_sanhedrin_97a_wikisource_he.json",
     S + "Sanhedrin%2097a?version=hebrew%7CWikisource%20Talmud%20Bavli", None,
     "Wikisource Talmud Bavli (Vilna text) via Sefaria"),
    ("koren_he", "sources/sefaria_v3_sanhedrin_97a_davidson_he.json",
     S + "Sanhedrin%2097a?version=hebrew%7CWilliam%20Davidson%20Edition%20-%20Vocalized%20Aramaic", None,
     "William Davidson Edition - Vocalized Aramaic (Koren), via Sefaria"),
    ("davidson_en", "sources/sefaria_v3_sanhedrin_97a_davidson_en.json",
     S + "Sanhedrin%2097a?version=english%7CWilliam%20Davidson%20Edition%20-%20English", None,
     "William Davidson Edition - English (Koren-Steinsaltz), via Sefaria"),
    ("steinsaltz_he", "sources/steinsaltz_sanhedrin_97a_6-7.json",
     S + "Steinsaltz%20on%20Sanhedrin%2097a%3A6-7?version=source", None,
     "Steinsaltz on Sanhedrin (William Davidson Edition - Hebrew), via Sefaria"),
    ("soncino_en", "sources/soncino_halakhah_sanhedrin_97.html",
     "https://www.halakhah.com/sanhedrin/sanhedrin_97.html", None,
     "Soncino English translation as posted on halakhah.com"),
    ("glick_he", "sources/ein_yaakov_sanhedrin_11.json",
     S + "Ein%20Yaakov%20%28Glick%20Edition%29%2C%20Sanhedrin%2011?version=source", None,
     "Ein Yaakov, Hebrew/Aramaic text of the Glick edition (1916), via Sefaria"),
    ("glick_en", "sources/ein_yaakov_sanhedrin_11_42_glick_en.json",
     S + "Ein%20Yaakov%20(Glick%20Edition)%2C%20Sanhedrin%2011%3A42?version=english", None,
     "En Jacob, translated by S. H. Glick, 1916, via Sefaria"),
    ("rashi", "sources/rashi_sanhedrin_97a.json",
     S + "Rashi%20on%20Sanhedrin%2097a?version=source", None, "Rashi on Sanhedrin, Vilna edition, via Sefaria"),
    ("chokhmat_shlomo", "sources/chokhmat_shlomo_sanhedrin_97a.json",
     S + "Chokhmat%20Shlomo%20on%20Sanhedrin%2097a?version=source", None,
     "Chokhmat Shlomo on Sanhedrin, Vilna edition, via Sefaria"),
    ("chidushei_agadot", "sources/chidushei_agadot_sanhedrin_97a.json",
     S + "Chidushei%20Agadot%20on%20Sanhedrin%2097a?version=source", None,
     "Maharsha, Chidushei Agadot, Vilna edition, via Sefaria"),
    ("ben_yehoyada", "sources/ben_yehoyada_sanhedrin_97a.json",
     S + "Ben%20Yehoyada%20on%20Sanhedrin%2097a?version=source", None,
     "Ben Yehoyada, Senlake 2019 edition based on Jerusalem 1897, via Sefaria"),
    ("petach_einayim", "sources/petach_einayim_sanhedrin_97a.json",
     S + "Petach%20Einayim%20on%20Sanhedrin%2097a?version=source", None,
     "Petach Einayim, Jerusalem 1959, via Sefaria"),
    ("maharal", "sources/netivot_olam_netiv_haemet_1.json",
     S + "Netivot%20Olam%2C%20Netiv%20Haemet%201?version=source", None,
     "Maharal, Netivot Olam, Netiv HaEmet ch. 1 (OYW), via Sefaria"),
    ("reshit_chokhmah", "sources/reshit_chokhmah_kedusha_12.json",
     S + "Reshit%20Chokhmah%2C%20Gate%20of%20Holiness%2012%3A76?version=source", None,
     "Reshit Chokhmah, Gate of Holiness 12:76, Hamesorah 2005, via Sefaria"),
    ("shaarei_kedusha", "sources/shaarei_kedusha_2_5.json",
     S + "Sha%27arei%20Kedusha%2C%20Part%202%205%3A20?version=source", None,
     "Sha'arei Kedusha, Part 2 5:20, via Sefaria"),
    ("bm49a_wikisource", "sources/bava_metzia_49a_wikisource_he.json",
     S + "Bava%20Metzia%2049a?version=hebrew%7CWikisource%20Talmud%20Bavli", None,
     "Bava Metzia 49a, Wikisource Talmud Bavli, via Sefaria"),
    ("bm49a_koren_he", "sources/bava_metzia_49a_davidson_he.json",
     S + "Bava%20Metzia%2049a?version=hebrew%7CWilliam%20Davidson%20Edition%20-%20Vocalized%20Aramaic", None,
     "Bava Metzia 49a, William Davidson Vocalized Aramaic, via Sefaria"),
    ("bm49a_en", "sources/bava_metzia_49a_davidson_en.json",
     S + "Bava%20Metzia%2049a?version=english%7CWilliam%20Davidson%20Edition%20-%20English", None,
     "Bava Metzia 49a, William Davidson English, via Sefaria"),
    ("beer_sheva", "sources/beer_sheva_13.json",
     S + "Be%27er%20Sheva%2013?version=source", None, "Be'er Sheva 13, Warsaw 1890, via Sefaria"),
    ("gilyon_hashas", "sources/gilyon_hashas_bava_metzia_49a.json",
     S + "Gilyon%20HaShas%20on%20Bava%20Metzia%2049a?version=source", None,
     "Gilyon HaShas on Bava Metzia, Vilna edition, via Sefaria"),
    ("seder_hadorot", "sources/seder_hadorot_1577.json",
     S + "Seder%20HaDorot%2C%20Tanaim%20and%20Amoraim%201577?version=source", None,
     "Seder HaDorot, Tanaim and Amoraim, Warsaw 1878-1882, via Sefaria"),
    ("jastrow_tavut", "sources/jastrow_tavut.json",
     S + "Jastrow%2C%20%D7%98%D6%B8%D7%91%D7%95%D6%BC%D7%AA%20II%201", None, "Jastrow Dictionary, London 1903, via Sefaria"),
    ("jastrow_tavyomi", "sources/jastrow_tavyomi.json",
     S + "Jastrow%2C%20%D7%98%D6%B7%D7%91%D6%B0%D7%99%D7%95%D6%B9%D7%9E%D6%B4%D7%99%201", None,
     "Jastrow Dictionary, London 1903, via Sefaria"),
    ("jastrow_shivava", "sources/jastrow_shivava.json",
     S + "Jastrow%2C%20%D7%A9%D7%B5%D6%BC%D7%99%D7%91%D6%B8%D7%91%D6%B8%D7%90%201", None,
     "Jastrow Dictionary, London 1903, via Sefaria"),
    ("links", "sources/sefaria_links_sanhedrin_97a_6-7.json",
     "https://www.sefaria.org/api/links/Sanhedrin%2097a:6-7?with_text=1", None,
     "Sefaria links API with text, used to find commentaries"),
    ("manuscript_list", "sources/sefaria_manuscripts_sanhedrin_97a.json",
     "https://www.sefaria.org/api/manuscripts/Sanhedrin%2097a", None, "Sefaria manuscripts API listing"),
    ("vilna_image", "sources/vilna_sanhedrin_97a.jpg",
     "https://manuscripts.sefaria.org/vilna-romm/Sanhedrin_97a.jpg", None,
     "Romm Vilna print, Sanhedrin 97a, page image (via Sefaria, from NLI)"),
    ("bomberg_image", "sources/bomberg_1523_sanhedrin_97a.jpg",
     "https://manuscripts.sefaria.org/bomberg/masekhet_09_0196.jpg", None,
     "Bomberg Venice print (1523), Sanhedrin 97a, page image (via Sefaria, from NLI)"),
    ("munich95_image", "sources/munich95_pg0709.jpg",
     "https://manuscripts.sefaria.org/munich-manuscript/munich-manuscript-95Cod.hebr.95pg.0709.jpg", None,
     "Munich, Cod. hebr. 95 (1342), page 0709 covering Sanhedrin 96b-98b, image (via Sefaria, from digitale-sammlungen.de)"),
]

VR = "researcher_visual_reading_of_page_image"


def ev(sid, quote, **extra):
    return {"source_id": sid, "exact_quote": quote, **extra}


def vis(sid, quote, note):
    return {"source_id": sid, "exact_quote": quote, "evidence_type": VR, "note": note}


exec((ROOT / "findings_data.py").read_text(encoding="utf-8"))


def main():
    sources = []
    for sid, rel, url, input_path, edition in SOURCES:
        path = (ROOT / rel).resolve()
        data = path.read_bytes()
        entry = {"source_id": sid, "edition": edition, "saved_file": rel,
                 "sha256": hashlib.sha256(data).hexdigest()}
        if url:
            entry["url"] = url
            entry["fetched_at"] = datetime.datetime.fromtimestamp(
                path.stat().st_mtime, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        if input_path:
            entry["input_path"] = input_path
        sources.append(entry)
    dossier = {
        "job_id": "challenge-12",
        "focal_ref": "Sanhedrin 97a:6",
        "status": "researched",
        "question": QUESTION,
        "scope_checked": SCOPE,
        "sources": sources,
        "findings": FINDINGS,
        "alternative_readings": ALTERNATIVES,
        "unresolved": UNRESOLVED,
        "proposed_corrections": CORRECTIONS,
        "ontology_lessons": LESSONS,
    }
    out = ROOT / "dossier.json"
    part = out.with_suffix(".part")
    part.write_text(json.dumps(dossier, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    part.replace(out)
    print(f"{len(sources)} sources, {len(FINDINGS)} findings")


if __name__ == "__main__":
    main()
