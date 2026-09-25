"""Get a Google OAuth refresh token for the Onboarding page's Sheet sync.

    python tools/google_form_oauth.py <client_id> <client_secret>

Standard library only — no `pip install` needed. Written this way after
`google-auth-oauthlib` turned out to need a package install that this
machine's Application Control policy refuses to run at all; the OAuth
"installed app" flow it wraps is a handful of HTTP calls and a five-line local
server, and doing that by hand here is cheaper than fighting the policy.

## Why this exists and why it runs nowhere near the bench

`manna_hr/onboard_sync.py` reads the Onboarding Form's Google Sheet as a
signed-in Google account rather than as a service account, because the GCP
org this runs under carries `iam.disableServiceAccountKeyCreation` and refuses
to mint a service-account key at all. The account it signs in as needs to
consent once, in a browser, to let that client read Sheets — and the bench has
no browser and nobody sitting at it. So this script is the one-time step that
happens on *your* machine instead: it opens a browser, you sign in as whichever
Google account can read the linked Sheet, and it prints a refresh token that
is good until that account revokes it.

## Before running it

1. In the same GCP project the Sheet's API calls will be billed to, enable the
   Google Sheets API (APIs & Services → Library).
2. APIs & Services → Credentials → Create Credentials → OAuth client ID →
   **Desktop app**. Not a service account — that path is blocked here, which
   is the whole reason this exists at all. Copy its Client ID and Client
   Secret.
3. Make sure the signed-in-as account can actually open the Sheet — share it
   with that account if it is not already the owner.

## What comes out

Paste all three onto Manna HR Settings → Onboarding Google Form:
OAuth Client ID, OAuth Client Secret, and the refresh token this prints.
Nothing here talks to `manna_hr` or the ERPNext site at all — it only talks to
Google, and the token is the thing that lets the site do that later.
"""

import json
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"


def _post_form(url, fields):
	body = urllib.parse.urlencode(fields).encode()
	req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
	try:
		with urllib.request.urlopen(req) as resp:
			return json.loads(resp.read())
	except urllib.error.HTTPError as e:
		sys.exit(f"Google refused the request ({e.code}): {e.read().decode(errors='replace')}")


def main():
	if len(sys.argv) != 3:
		sys.exit(f"usage: python {sys.argv[0]} <client_id> <client_secret>")
	client_id, client_secret = sys.argv[1], sys.argv[2]

	# A random, unguessable value round-tripped through the browser and checked
	# on the way back — the standard defence against a redirect that is not
	# actually the one this run started.
	state = secrets.token_urlsafe(24)

	# The redirect URI has to be registered before the port is known, so this
	# opens the browser pointed at a fixed loopback address on an arbitrary
	# free port, and only then starts listening on that same port.
	import socket
	probe = socket.socket()
	probe.bind(("127.0.0.1", 0))
	port = probe.getsockname()[1]
	probe.close()
	redirect_uri = f"http://localhost:{port}/"

	auth_url = AUTH_URI + "?" + urllib.parse.urlencode({
		"client_id": client_id,
		"redirect_uri": redirect_uri,
		"response_type": "code",
		"scope": SCOPE,
		"access_type": "offline",
		# Forces a fresh refresh token even for an account that has already
		# granted this client access before — without it, a second run can
		# come back with no refresh token at all, only an access token.
		"prompt": "consent",
		"state": state,
	})

	print("Opening a browser to sign in and consent. If it does not open, visit:")
	print(auth_url)
	webbrowser.open(auth_url)

	code, _ = _catch_redirect(state, port)

	token = _post_form(TOKEN_URI, {
		"client_id": client_id,
		"client_secret": client_secret,
		"code": code,
		"grant_type": "authorization_code",
		"redirect_uri": redirect_uri,
	})

	refresh_token = token.get("refresh_token")
	if not refresh_token:
		sys.exit(
			"Google did not send a refresh token. This usually means this client already has a "
			"grant from this account with no way to re-issue one visibly — go to "
			"https://myaccount.google.com/permissions, remove this app's access, and run this again."
		)

	print("======================================")
	print("REFRESH TOKEN:", refresh_token)
	print("======================================")
	print("Paste this into Manna HR Settings → Onboarding Google Form → OAuth Refresh Token,")
	print("alongside the Client ID and Client Secret you already have.")


def _catch_redirect(expected_state, port):
	"""A local server for exactly one request: the browser's redirect back
	after consent, carrying the authorization code in its query string.

	Bound to the port `main` already opened the browser against, on localhost
	only — nothing outside this machine can reach it — and it answers once and
	stops, so it cannot be left listening by an interrupted run.
	"""
	caught = {}

	class Handler(BaseHTTPRequestHandler):
		def do_GET(self):
			qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
			caught["code"] = (qs.get("code") or [None])[0]
			caught["state"] = (qs.get("state") or [None])[0]
			caught["error"] = (qs.get("error") or [None])[0]
			self.send_response(200)
			self.send_header("Content-Type", "text/plain")
			self.end_headers()
			self.wfile.write(
				b"Signed in. You can close this tab and go back to the terminal."
				if caught.get("code")
				else b"That did not carry an authorization code. Close this tab and check the terminal."
			)

		def log_message(self, *args):
			pass

	server = HTTPServer(("127.0.0.1", port), Handler)
	server.handle_request()
	server.server_close()

	if caught.get("error"):
		sys.exit(f"Google refused consent: {caught['error']}")
	if caught.get("state") != expected_state:
		sys.exit("The redirect's state did not match what was sent — refusing it rather than trusting it.")
	if not caught.get("code"):
		sys.exit("No authorization code came back.")
	return caught["code"], port


if __name__ == "__main__":
	main()
