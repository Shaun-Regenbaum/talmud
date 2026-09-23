"""Fetch Sefaria refs into sources/ and log url, time and sha256 of the saved bytes."""
import hashlib
import json
import subprocess
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
LOG = HERE / "sources" / "fetch_log.json"


def fetch(ref, name, versions=("hebrew", "english")):
    q = "&".join("version=" + urllib.parse.quote(v) for v in versions)
    url = f"https://www.sefaria.org/api/v3/texts/{urllib.parse.quote(ref)}?{q}"
    out = HERE / "sources" / name
    subprocess.run(["curl", "-s", "-m", "40", "-o", str(out), url], check=True)
    data = out.read_bytes()
    log = json.loads(LOG.read_text()) if LOG.exists() else {}
    log[name] = {"ref": ref, "url": url, "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 "sha256": hashlib.sha256(data).hexdigest()}
    LOG.write_text(json.dumps(log, ensure_ascii=False, indent=1))
    try:
        d = json.loads(data)
        for v in d.get("versions", []):
            print("==", name, v.get("versionTitle"), v.get("language"))
            print(json.dumps(v.get("text"), ensure_ascii=False)[:6000])
    except ValueError:
        print("non-json", data[:300])


if __name__ == "__main__":
    args = sys.argv[1:]
    for i in range(0, len(args), 3):
        fetch(args[i], args[i + 1], tuple(args[i + 2].split(";")))
