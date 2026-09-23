"""Build the standalone design comparison from saved text and display labels."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent
page = (root / "template.html").read_text()
data = json.loads((root / "data.json").read_text())
page = page.replace("/* __STYLE__ */", (root / "style.css").read_text())
page = re.sub(r'(<script type="application/json" id="data">).*?(</script>)', lambda m: m[1] + json.dumps(data, ensure_ascii=False).replace("</", "<\\/") + m[2], page, flags=re.S)
(root / "index.html").write_text(page)
