/* ---------------------------------------------------------------------------
   The Onboarding Form's responses Sheet, read in the browser as whoever is
   signed in to Google — Onboarding's "Sync from Google Sheet" (24 September
   2026), for while the manna_hr app, and so Sync Now, is not on the site.

   **No secret is involved, which is why this may live in a browser.** The
   server's sync holds a client secret and a refresh token and must stay on the
   server (manna_hr/onboard_sync.py). This is Google's browser token flow
   instead: a *Web* OAuth client id, which is public by design and only works
   from the origins listed against it, and a short-lived read-only token that
   exists in this tab's memory and nowhere else. The person has to be a Google
   account that can open the Sheet — the Sheet stays private, and that is the
   point: it holds candidates' phone numbers and dates of birth.

   What the rows then do is lib/onboardimport.js, the same as an upload.
   --------------------------------------------------------------------------- */

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

/** The Web OAuth client id. Not a secret; see .env.example. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

/** The responses Sheet, as HR shared it on 24 September 2026. Manna HR
    Settings' `onboarding_sheet_id` wins once the site holds one. */
export const DEFAULT_SHEET = { id: "1ocKXzWOov_CFD2he-29UKtb16_SppzF7tWbbjDVDIV0", gid: 389438614 };

/** A Sheet's id and tab out of whatever was pasted: its full URL or a bare id. */
export function sheetRef(v) {
	const t = String(v || "").trim();
	const id = (/\/spreadsheets\/d\/([\w-]+)/.exec(t) || [])[1] || (/^[\w-]{20,}$/.test(t) ? t : "");
	const gid = (/[#&?]gid=(\d+)/.exec(t) || [])[1];
	return id ? { id, gid: gid == null ? null : Number(gid) } : null;
}

/** Header row + data rows → header-keyed objects. Pure. */
export function rowsOf(values) {
	const [head = [], ...rest] = values || [];
	const cols = head.map((h) => String(h).trim());
	return rest
		.filter((r) => r.some((v) => String(v ?? "").trim() !== ""))
		.map((r) => Object.fromEntries(cols.map((h, i) => [h, String(r[i] ?? "").trim()])));
}

let gis;
/** Google's sign-in script, once. Loaded when the page opens rather than on
    the click, so the popup opens inside the click and is not blocked. */
export function loadGoogle() {
	if (!gis) {
		gis = new Promise((ok, fail) => {
			if (window.google?.accounts?.oauth2) return ok();
			const s = document.createElement("script");
			s.src = "https://accounts.google.com/gsi/client";
			s.async = true;
			s.onload = () => ok();
			s.onerror = () => { gis = null; fail(new Error("Google's sign-in could not be loaded.")); };
			document.head.appendChild(s);
		});
	}
	return gis;
}

let token = null;

function signIn() {
	return new Promise((ok, fail) => {
		const client = window.google.accounts.oauth2.initTokenClient({
			client_id: GOOGLE_CLIENT_ID,
			scope: SCOPE,
			callback: (r) => {
				if (r.error) return fail(new Error(r.error_description || r.error));
				token = { value: r.access_token, until: Date.now() + (Number(r.expires_in) - 60) * 1000 };
				ok(token.value);
			},
			error_callback: (e) => fail(new Error(e?.message || "Google sign-in was closed.")),
		});
		client.requestAccessToken({ prompt: token ? "" : "select_account" });
	});
}

async function sheetsApi(path, bearer) {
	const r = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + path, {
		headers: { Authorization: "Bearer " + bearer },
	});
	const body = await r.json().catch(() => ({}));
	if (!r.ok) {
		const why = body?.error?.message || `Google answered ${r.status}`;
		if (r.status === 403 || r.status === 404) {
			throw new Error(`${why} — sign in with a Google account the Sheet is shared with.`);
		}
		throw new Error(why);
	}
	return body;
}

/** The Sheet's rows, header-keyed. Signs in first when there is no live token. */
export async function readGoogleSheet(ref) {
	if (!GOOGLE_CLIENT_ID) throw new Error("No Google client id is set (VITE_GOOGLE_CLIENT_ID).");
	await loadGoogle();
	const bearer = token && token.until > Date.now() ? token.value : await signIn();
	const meta = await sheetsApi(`${ref.id}?fields=sheets.properties(sheetId,title)`, bearer);
	const tabs = (meta.sheets || []).map((s) => s.properties);
	const tab = tabs.find((p) => p.sheetId === ref.gid) || tabs[0];
	if (!tab) return [];
	const range = encodeURIComponent(`'${tab.title.replace(/'/g, "''")}'`);
	/* Unformatted, with dates as serial numbers: the Sheet's display format is
	   its locale's, and a US Sheet's 9/13/2026 read as India's is month 13.
	   A serial number has no order to get wrong (lib/onboardimport.js). */
	const vals = await sheetsApi(`${ref.id}/values/${range}`
		+ "?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER", bearer);
	return rowsOf(vals.values);
}
