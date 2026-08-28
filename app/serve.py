"""Serve the HR dashboard locally, against the live ERPNext site.

    set ERP_KEY=...  &  set ERP_SECRET=...        (Windows: setx, or see below)
    python app/serve.py
    ->  http://localhost:8770

## Why this needs a server at all, rather than just opening the HTML

The browser will not let a file:// page — or a page on any other origin — call
`mannarubber.m.frappe.cloud` directly. Frappe pins its CORS header to its own
origin, so the request is refused before ERPNext ever sees it.

So this process serves the page *and* proxies `/api/...` through to ERPNext,
attaching the token server-side. The browser then only ever talks to one origin,
which is the same reason the sales dashboard needs its Cloudflare function.

## The token never reaches the browser

It is read from the environment here and attached on the way out. Nothing in
`index.html` knows it, so the page can be opened, shared or screenshotted
without leaking a key that can write attendance for the whole group.

Read-only by design: only GET is proxied. This is a window, not a console.
"""

import http.server
import json
import os
import socketserver
import sys
import urllib.error
import urllib.parse
import urllib.request

PORT = int(os.environ.get("PORT", "8770"))
ERP_URL = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
ERP_KEY = os.environ.get("ERP_KEY", "")
ERP_SECRET = os.environ.get("ERP_SECRET", "")

HERE = os.path.dirname(os.path.abspath(__file__))

# Only these are reachable through the proxy. An allowlist rather than a
# passthrough: this process holds a System Manager token, and a generic proxy
# would hand the whole site to anything that can reach localhost.
ALLOWED = {
	"/api/resource/Employee",
	"/api/resource/Company",
	"/api/resource/Department",
	"/api/resource/Designation",
	"/api/resource/Holiday List",
	"/api/resource/Shift Type",
	"/api/resource/Employee Checkin",
	"/api/resource/Attendance",
	"/api/resource/Leave Application",
	"/api/resource/Employee Attendance Regularization",
	"/api/resource/Shift Assignment",
	"/api/resource/Letter Type",
	"/api/resource/Employee Letter",
	"/api/resource/Leave Type",
	"/api/method/frappe.client.get_count",
}


class Handler(http.server.SimpleHTTPRequestHandler):
	def __init__(self, *a, **kw):
		super().__init__(*a, directory=HERE, **kw)

	def log_message(self, fmt, *args):
		# One line per API call, nothing for static files. Enough to see the
		# dashboard working without burying it in favicon requests.
		if self.path.startswith("/api/"):
			sys.stderr.write("  {0}\n".format(self.path[:110]))

	def do_GET(self):
		if self.path.startswith("/api/"):
			return self._proxy()
		if self.path == "/":
			self.path = "/index.html"
		return super().do_GET()

	def _proxy(self):
		parsed = urllib.parse.urlparse(self.path)
		path = urllib.parse.unquote(parsed.path)

		# An allowed doctype covers both its list endpoint and single documents
		# under it — `/api/resource/Letter Type` and `.../Letter Type/Gratuity`.
		# Still an allowlist: a doctype absent from ALLOWED is unreachable either
		# way, which is what stops this becoming a general proxy onto a site the
		# token can rewrite.
		if not any(path == a or path.startswith(a + "/") for a in ALLOWED):
			return self._json(403, {"error": "not allowed through this proxy: " + path})

		target = ERP_URL + parsed.path + (("?" + parsed.query) if parsed.query else "")
		req = urllib.request.Request(target, headers={
			"Authorization": "token {0}:{1}".format(ERP_KEY, ERP_SECRET),
			"Accept": "application/json",
		})
		try:
			with urllib.request.urlopen(req, timeout=90) as r:
				body = r.read()
			self.send_response(200)
			self.send_header("Content-Type", "application/json")
			self.send_header("Cache-Control", "no-store")
			self.send_header("Content-Length", str(len(body)))
			self.end_headers()
			self.wfile.write(body)
		except urllib.error.HTTPError as e:
			detail = e.read().decode(errors="replace")[:400]
			# 429 is the daily compute limit, and it arrives as an HTML page.
			# Saying so beats the page rendering an empty list as "no staff".
			hint = ("The site has hit its daily compute limit. It resets daily."
			        if e.code == 429 else "")
			self._json(e.code, {"error": detail, "hint": hint, "status": e.code})
		except Exception as e:
			self._json(502, {"error": str(e)[:300]})

	def _json(self, code, payload):
		body = json.dumps(payload).encode()
		self.send_response(code)
		self.send_header("Content-Type", "application/json")
		self.send_header("Content-Length", str(len(body)))
		self.end_headers()
		self.wfile.write(body)


class Server(socketserver.ThreadingTCPServer):
	# Otherwise a restart inside the TIME_WAIT window fails with "address
	# already in use", which looks like the port being taken by something else.
	allow_reuse_address = True
	daemon_threads = True


def main():
	if not ERP_KEY or not ERP_SECRET:
		sys.exit(
			"ERP_KEY and ERP_SECRET are not set.\n\n"
			"  PowerShell:  $env:ERP_KEY='...'; $env:ERP_SECRET='...'; python app/serve.py\n"
			"  Git Bash:    ERP_KEY=... ERP_SECRET=... python app/serve.py\n"
		)

	print("Manna HR dashboard")
	print("   site   {0}".format(ERP_URL))
	print("   open   http://localhost:{0}".format(PORT))
	print("   stop   Ctrl+C\n")

	with Server(("127.0.0.1", PORT), Handler) as httpd:
		try:
			httpd.serve_forever()
		except KeyboardInterrupt:
			print("\nstopped")


if __name__ == "__main__":
	main()
