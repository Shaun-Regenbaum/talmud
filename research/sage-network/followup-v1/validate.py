"""Check saved sources and quotations without deciding whether a reading is right.

The checks themselves live in the frozen contract file named below, so a stored
research run and this working copy always use the same code."""

import argparse
import importlib.util
import json
from pathlib import Path

_FROZEN = Path(__file__).resolve().parent.parent / "lake/validators/source_investigation_v1.py"
_spec = importlib.util.spec_from_file_location("source_investigation_v1", _FROZEN)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
check, quote_matches, sha = _module.check, _module.quote_matches, _module.sha


def check_case(path):
    root = path.parent.resolve()
    pilot = root.parents[2] / "pilot"

    def read_source(source):
        name = Path(source["saved_file"])
        if name.is_absolute():
            raise ValueError("Source path must be relative to the case directory")
        resolved = (root / name).resolve()
        if not (resolved.is_relative_to(root) or resolved.is_relative_to(pilot.resolve())):
            raise ValueError("Source path is outside this case and the frozen pilot")
        return resolved.read_bytes()

    dossier = json.loads(path.read_text())
    result = check(dossier, read_source)
    if dossier.get("job_id") != root.name:
        result["errors"].append("Job ID differs from case directory")
        result["valid"] = False
    result["dossier_sha256"] = sha(path.read_bytes())
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cases", type=Path, nargs="*")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    paths = args.cases or sorted((Path(__file__).parent / "cases").glob("*/dossier.json"))
    results = []
    for path in paths:
        try:
            results.append(check_case(path))
        except (ValueError, KeyError, TypeError, OSError) as error:
            results.append({"job_id": path.parent.name, "valid": False, "errors": [str(error)]})
    report = {"checked_cases": len(results), "valid_cases": sum(r["valid"] for r in results), "cases": results}
    if args.out:
        part = args.out.with_suffix(".part")
        part.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        part.replace(args.out)
    print(json.dumps({"checked_cases": len(results), "valid_cases": report["valid_cases"],
                      "errors": {r["job_id"]: r["errors"] for r in results if not r["valid"]}}, ensure_ascii=False, indent=2))
    return 0 if results and all(r["valid"] for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
