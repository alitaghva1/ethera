"""Dev server with no-store caching.

Sends Cache-Control: no-store on every response so ES-module imports never
get served stale after an edit. Replaces the need for ?v=<tag> cache-busts
on import paths.

Always serves this script's own directory, regardless of where invoked from.

Usage: python serve.py [port]   (port defaults to 5173)
"""
import os
import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    script_dir = os.path.dirname(os.path.abspath(__file__))
    handler = partial(NoCacheHandler, directory=script_dir)
    print(f"slime-depths dev server on http://localhost:{port} (no-cache)")
    try:
        HTTPServer(("", port), handler).serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
