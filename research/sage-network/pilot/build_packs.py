"""Small, source-backed decisions about readings; no historical identity merges."""

import json
from pathlib import Path

from run import atomic, file_sha

ROOT = Path(__file__).resolve().parent


def main():
    definitions = [
        {"id": "imma-family", "job": "challenge-20", "claims": ["c1", "c2"],
         "question": "How does this passage connect Imma Shalom to Eliezer and Gamliel?",
         "candidates": [("family", "Imma Shalom is described as Eliezer’s wife and Gamliel’s sister.", ["c1", "c2"])],
         "status": "supported_as_text", "conclusion": "Keep Imma Shalom as a person with both family links.",
         "reason": "The opening sentence names her and states both relations directly. These links share one passage; they are not independent witnesses.",
         "limits": ["This does not identify every Eliezer or Gamliel elsewhere.", "The story’s prayer and death report do not independently prove historical causation."]},
        {"id": "reversed-speakers", "job": "challenge-05", "claims": ["c8", "c9", "c10", "c11"],
         "question": "Who explains Rabbi’s ruling to whom?",
         "candidates": [("hisda", "Hisda explains to Hamnuna.", ["c8", "c9"]), ("hamnuna", "Hamnuna explains to Hisda.", ["c10", "c11"])],
         "status": "keep_alternatives", "conclusion": "Keep both reported directions under one alternative group.",
         "reason": "The text explicitly reverses the names after ‘some say’. Each speaker keeps the explanation that follows within that reading.",
         "limits": ["Two transmitted versions do not prove two separate conversations.", "The scope of the later baraita quotation needs its own reading."]},
        {"id": "parenthesized-negation", "job": "challenge-01", "claims": ["c6", "c7"],
         "question": "Does Rav Huna rule like Rabbi Yosi?",
         "candidates": [("negative", "Retain the parenthesized negation: he does not rule like Yosi.", ["c6"]), ("positive", "Omit the parenthesized negation: he rules like Yosi.", ["c7"])],
         "status": "needs_source_research", "conclusion": "Keep both local readings while checking what the edition’s parentheses mean.",
         "reason": "The saved Hebrew contains (אין). This source-only pack has no independent witness or commentary snapshot that resolves the editorial convention.",
         "limits": ["Earlier research found commentary support for the positive reading. That evidence must be added to this pack before weighing the readings.", "Two saved candidates do not mean equal probabilities."]},
        {"id": "woman-or-tractate", "job": "challenge-28", "claims": ["c1", "c2", "c3", "c4"],
         "question": "Does the cryptic phrase describe a woman or a tractate?",
         "candidates": [("woman", "The phrase refers to a woman.", ["c3"]), ("tractate", "The phrase refers to a tractate.", ["c4"])],
         "status": "keep_alternatives", "conclusion": "Keep separate person and work readings of the same phrase.",
         "reason": "The following passages explicitly report ‘a woman’ and ‘a tractate’. A single fixed person node would erase the second reading.",
         "limits": ["The woman reading does not by itself establish marriage.", "The supplied wording does not name a particular tractate."]},
    ]
    packs, decisions = [], []
    for definition in definitions:
        jid = definition["job"]
        reading_path = ROOT / "compiled" / f"{jid}.json"
        reading = json.loads(reading_path.read_text())["record"]
        claims = {c["id"]: c for c in reading["claims"]}
        job = json.loads((ROOT / "inputs" / f"{jid}.json").read_text())
        claim_refs = [f"{jid}/{cid}" for cid in definition["claims"]]
        assert all(cid in claims for cid in definition["claims"])
        sources = {a["source_id"] for cid in definition["claims"] for a in claims[cid]["evidence"]}
        # Alternative markers can occur after the action they qualify.
        if jid == "challenge-28":
            sources.update(s["source_id"] for s in job["sources"])
        candidates = [{"id": cid, "description": text, "supporting_claims": [f"{jid}/{c}" for c in refs],
                       "opposing_claims": [], "probability": None,
                       "probability_note": "Not estimated; these are saved readings, not calibrated historical probabilities."}
                      for cid, text, refs in definition["candidates"]]
        packs.append({"id": definition["id"], "question": definition["question"], "job_id": jid,
                      "scope": "local passage reading", "compiled_sha256": file_sha(reading_path),
                      "claim_refs": claim_refs, "source_snapshots": job["sources"],
                      "candidates": candidates, "shared_dependencies": ["All candidates use the same saved edition and episode."],
                      "search_coverage": "Only supplied primary text was read for this extraction. No biography or manuscript search.",
                      "limits": definition["limits"]})
        decisions.append({"id": definition["id"] + "-v1", "pack_id": definition["id"], "supersedes": None,
                          "authority": "automated_review", "status": definition["status"],
                          "conclusion": definition["conclusion"], "reason": definition["reason"],
                          "supporting_claims": claim_refs, "opposing_claims": [], "open_questions": definition["limits"],
                          "historical_graph_eligible": False,
                          "identity_confidence": None, "historical_confidence": None})
    atomic(ROOT / "evidence-packs.json", {"version": "evidence-pack-pilot-v1", "packs": packs, "decisions": decisions})
    print(json.dumps({"packs": len(packs), "decisions": len(decisions)}))


if __name__ == "__main__":
    main()
