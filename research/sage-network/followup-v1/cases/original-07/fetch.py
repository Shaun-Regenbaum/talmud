"""Fetch public source texts for Pesachim 37a:4 into sources/ with a manifest of hashes."""
import hashlib, json, sys, time, urllib.request, urllib.parse, pathlib
HERE = pathlib.Path(__file__).parent
SRC = HERE / "sources"
MAN = SRC / "manifest.json"

def fetch(source_id, url, fname):
    req = urllib.request.Request(url, headers={"User-Agent": "sage-network-research/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    (SRC / fname).write_bytes(data)
    man = json.loads(MAN.read_text()) if MAN.exists() else {}
    man[source_id] = {"url": url, "saved_file": f"sources/{fname}",
                      "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                      "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    MAN.write_text(json.dumps(man, ensure_ascii=False, indent=2))
    print(source_id, len(data))

if __name__ == "__main__":
    fetch(sys.argv[1], sys.argv[2], sys.argv[3])
