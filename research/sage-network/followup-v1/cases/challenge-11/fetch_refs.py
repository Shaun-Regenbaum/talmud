"""Fetch Sefaria v3 texts (all Hebrew and English versions) for named refs via fetch.py."""
import subprocess, sys, urllib.parse
pairs = []
for line in open(sys.argv[1]):
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    ref, name = line.split("|")
    url = "https://www.sefaria.org/api/v3/texts/" + urllib.parse.quote(ref.strip()) + "?version=hebrew%7Call&version=english%7Call"
    pairs += [url, name.strip()]
subprocess.run([sys.executable, "fetch.py", *pairs], check=False)
