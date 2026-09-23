"""Check restored research using the frozen source map, without the old checkout."""

import argparse
import hashlib
import json
from pathlib import Path

from followup_store import CONTRACTS, checker


def verify(root):
    root = root.resolve()
    manifest = json.loads((root / "manifest.json").read_text())
    if manifest["contract"] not in CONTRACTS:
        raise ValueError("Unknown research contract")
    for relative, expected in manifest["files"].items():
        path = (root / relative).resolve()
        if Path(relative).is_absolute() or not path.is_relative_to(root):
            raise ValueError("Unsafe restored file path")
        expected = manifest.get("binary_files", {}).get(relative, expected)
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Restored file differs: {relative}")
    relative, pinned = CONTRACTS[manifest["contract"]]
    if hashlib.sha256((root / relative).read_bytes()).hexdigest() != manifest["validator_sha256"] or pinned != manifest["validator_sha256"]:
        raise ValueError("Restored checker differs from the frozen contract file")
    module = checker(manifest["contract"])
    checked = []
    for case in manifest["cases"]:
        dossier = json.loads((root / case["dossier"]).read_text())
        def read_source(source):
            relative = case["source_files"][source["source_id"]]
            if relative not in manifest["files"]:
                raise ValueError("Source file is absent from the manifest")
            return (root / relative).read_bytes()
        result = module.check(dossier, read_source)
        if not result["valid"]:
            raise ValueError(result["errors"])
        checked.append({"job_id": case["job_id"], "findings": result["finding_count"], "checked_quotes": len(result["citations"])})
    return {"files": len(manifest["files"]), "cases": checked, "scope": "Frozen source bytes and quote matches; no historical approval."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.root), ensure_ascii=False, indent=2))
