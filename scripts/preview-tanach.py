"""Preview built Tanach pages using saved content and cached upstream results.

Run after pnpm --filter tanach build. New source explanations remain unavailable.
"""

import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = 'https://tanach.dev'
SOURCE_ROUTES = (
    '/api/chapter/', '/api/chapter-runs/', '/api/run-tree/',
    '/api/commentary/', '/api/sources-index/', '/api/gemara/', '/api/midrash/',
)
CACHED_PRODUCERS = {'geography', 'midrash-synthesis', 'synthesis'}


def upstream(path):
    return urlopen(Request(UPSTREAM + path, headers={'User-Agent': 'Mozilla/5.0'}), timeout=25)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'packages/tanach/dist/client'), **kwargs)

    def respond(self, status, body, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.end_headers()
        self.wfile.write(body)

    def cached(self, path):
        parts = path.split('/')
        if len(parts) not in (5, 6) or parts[2] not in CACHED_PRODUCERS:
            return False
        try:
            with upstream('/api/chapter-runs/' + parts[3] + '/' + parts[4]) as response:
                runs = json.load(response)['runs']
            return any(
                row['id'] == parts[2] and row['cached']
                and (len(parts) == 5 or row['instanceRaw'] == parts[5])
                for row in runs
            )
        except Exception:
            return False

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/parsha-study':
            saved = json.loads((ROOT / 'packages/ui/src/gallery/content/parsha.json').read_text())
            self.respond(200, json.dumps(saved['data']).encode())
            return
        if path.startswith('/api/'):
            allowed = path in ('/api/usage', '/api/parsha') or path.startswith(SOURCE_ROUTES)
            if not allowed:
                allowed = self.cached(path)
            if not allowed:
                self.respond(503, b'{"error":"Generation disabled in this local preview","preview":true}')
                return
            try:
                with upstream(self.path) as response:
                    self.respond(response.status, response.read(), response.headers.get('Content-Type', 'application/json'))
            except HTTPError as error:
                self.respond(error.code, error.read())
            except Exception:
                self.respond(502, b'{"error":"Upstream unavailable"}')
            return
        if path in ('/align', '/usage', '/connect'):
            self.path = '/index.html'
        super().do_GET()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 5211), Handler).serve_forever()
