"""Build dossier.json for original-07 (Pesachim 37a:4) from saved sources.

Every exact_quote is checked against the raw or HTML-stripped strings of its saved file.
The build fails if a quote is missing, so the dossier cannot drift from sources.
"""
import hashlib, json, pathlib, re, time

HERE = pathlib.Path(__file__).parent
MAN = json.loads((HERE / "sources/manifest.json").read_text())

EDITIONS = {
    "pes37a_v3": "Sefaria v3 API; William Davidson Edition - Vocalized Aramaic + William Davidson Edition - English (Koren Noé / Steinsaltz), CC-BY-NC",
    "pes36b_v3": "Sefaria v3 API; William Davidson Edition - Vocalized Aramaic + English, CC-BY-NC (preceding context)",
    "links_37a4": "Sefaria links API with text for Pesachim 37a:4 (Rashi, Steinsaltz, Ritva, Arukh, Jastrow, Melekhet Shelomoh and others)",
    "rashi_37a": "Sefaria v3 API; Rashi on Pesachim 37a:4, Vilna Edition",
    "steinsaltz_37a4": "Sefaria v3 API; Steinsaltz on Pesachim 37a:4, William Davidson Edition - Hebrew",
    "beitzah22b_v3": "Sefaria v3 API; Beitzah 22b, William Davidson Edition - Vocalized Aramaic + English (parallel sugya)",
    "tosafot_37a": "Sefaria v3 API; Tosafot on Pesachim 37a, Vilna Edition",
    "links_37a": "Sefaria links API (no text) for all of Pesachim 37a",
    "rashi_beitzah22b": "Sefaria v3 API; Rashi on Beitzah 22b, Vilna Edition",
    "rosh_pes_2_15": "Sefaria v3 API; Rosh on Pesachim 2:15, Vilna Edition",
    "rif_pes_10b": "Sefaria v3 API; Rif Pesachim 10b, Vilna Edition",
    "meiri_pes_37a": "Sefaria v3 API; Meiri on Pesachim 37a (Meiri on Shas)",
    "links_beitzah22b": "Sefaria links API (no text) for Beitzah 22b",
    "links_beitzah22b7": "Sefaria links API with text for Beitzah 22b:7",
    "links_beitzah22b6": "Sefaria links API with text for Beitzah 22b:6 (includes Seder HaDorot entry)",
    "pes37a_wikisource": "Sefaria v3 API; Pesachim 37a, Wikisource Talmud Bavli (unvocalized Hebrew/Aramaic), CC-BY-SA",
    "beitzah22b_wikisource": "Sefaria v3 API; Beitzah 22b, Wikisource Talmud Bavli, CC-BY-SA",
    "pes37a_goldschmidt": "Sefaria texts API; Pesachim 37a, Lazarus Goldschmidt German translation, 1929, public domain",
    "beitzah22b_goldschmidt": "Sefaria texts API; Beitzah 22b, Lazarus Goldschmidt German translation, 1929, public domain",
    "seder_hadorot_2232": "Sefaria v3 API; Seder HaDorot, Tanaim and Amoraim 2232 (Warsaw 1878-1882 edition)",
    "tosafot_kid46a": "Sefaria v3 API; Tosafot on Kiddushin 46a, Vilna Edition",
    "rashi_beitzah22b7": "Sefaria v3 API; Rashi on Beitzah 22b:7, Vilna Edition",
}


def strings(o):
    if isinstance(o, str):
        # Raw form keeps edition markup (bold = translated source words); stripped form is plain text.
        yield o
        yield re.sub(r"<[^>]+>", "", o)
    elif isinstance(o, list):
        for i in o:
            yield from strings(i)
    elif isinstance(o, dict):
        for v in o.values():
            yield from strings(v)


def source_text(sid):
    if sid == "input":
        return list(strings(json.loads((HERE / "input.json").read_text())))
    return list(strings(json.loads((HERE / MAN[sid]["saved_file"]).read_text())))


sources = [{
    "source_id": "input",
    "input_path": "research/sage-network/followup-v1/cases/original-07/input.json",
    "edition": "Assigned job input with frozen segment text, reader pairs and earlier cross-check",
    "saved_file": "input.json",
    "sha256": hashlib.sha256((HERE / "input.json").read_bytes()).hexdigest(),
}]
for sid, m in MAN.items():
    data = (HERE / m["saved_file"]).read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    assert sha == m["sha256"], sid
    sources.append({"source_id": sid, "url": m["url"], "edition": EDITIONS[sid],
                    "fetched_at": m["fetched_at"], "saved_file": m["saved_file"], "sha256": sha})

findings = json.loads((HERE / "findings.json").read_text())

# Verify every quote.
cache = {}
for f in findings["findings"] + findings["alternative_readings"]:
    for ev in f.get("evidence", []):
        sid = ev["source_id"]
        cache.setdefault(sid, source_text(sid))
        if not any(ev["exact_quote"] in s for s in cache[sid]):
            raise SystemExit(f"quote not found in {sid}: {ev['exact_quote']!r} ({f.get('finding_id') or f.get('reading_id')})")

dossier = {
    "job_id": "original-07",
    "focal_ref": "Pesachim 37a:4",
    "status": "researched",
    "question": "Investigate branch-scoped teacher/student statements and participant identity. Preserve which relationship belongs to which reported version. Read wider context and commentary for exactly who is called a teacher.",
    "scope_checked": findings["scope_checked"],
    "sources": sources,
    "findings": findings["findings"],
    "branch_scoped_graph_proposal": findings["branch_scoped_graph_proposal"],
    "alternative_readings": findings["alternative_readings"],
    "unresolved": findings["unresolved"],
    "proposed_corrections": findings["proposed_corrections"],
    "ontology_lessons": findings["ontology_lessons"],
    "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}
(HERE / "dossier.json").write_text(json.dumps(dossier, ensure_ascii=False, indent=2) + "\n")
print("ok", len(sources), "sources", len(findings["findings"]), "findings")
