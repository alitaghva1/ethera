"""Dev server with no-store caching.

Sends Cache-Control: no-store on every response so ES-module imports never
get served stale after an edit. Replaces the need for ?v=<tag> cache-busts
on import paths.

Always serves this script's own directory, regardless of where invoked from.

Uses ThreadingHTTPServer (not HTTPServer) so per-request errors don't crash
the accept loop. On Windows + Python 3.14, abrupt browser disconnects raise
ConnectionAbortedError / ConnectionResetError inside copyfileobj during
long streaming responses (e.g. audio files). With a non-threaded server,
that exception propagated up and killed the whole process mid-playtest.
Threading isolates each request; handle_one_request catches the common
network-abort errors so the thread dies quietly instead of bubbling.

Usage: python serve.py [port]   (port defaults to 5173)
"""
import os
import sys
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def handle_one_request(self):
        # Wrap the request handler so a client disconnect mid-response
        # (WinError 10053/10054) logs quietly instead of propagating up
        # and killing the server. Every other exception still bubbles.
        try:
            super().handle_one_request()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # Browser closed the socket mid-stream — normal during reloads.
            pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    script_dir = os.path.dirname(os.path.abspath(__file__))
    handler = partial(NoCacheHandler, directory=script_dir)
    print(f"slime-depths dev server on http://localhost:{port} (no-cache, threaded)")
    try:
        ThreadingHTTPServer(("", port), handler).serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
