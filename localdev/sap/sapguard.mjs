// The only way anything in localdev reaches SAP Business One.
//
// Two rules, both checked here before a request leaves this PC:
//
// 1. Test companies only. A company database must be named in the config's
//    `test_dbs`, and no name ending `_LIVE` — or any of the four live ones the
//    CMMS sync was built against — is accepted even if somebody lists it
//    there. The sync takes its database names from ERPNext
//    (`item_master_options.<abbr>.sap_db`), and the local site is a copy of
//    production, so every name it would offer is a live one. This file is
//    where that stops.
// 2. The certificate is pinned. The Service Layer's is self-signed and expired
//    in July 2025, so ordinary checking fails and the usual workaround is to
//    switch checking off — which would hand the SAP password to anything that
//    answers on 192.168.100.200:50000. Its SHA-256 fingerprint is the check
//    instead.
//
// SAP locks a user after three wrong passwords (Manna_CMMS/sap-sync, 13 Oct
// 2026), so a failed login is reported and never retried.
//
// ONE EXCEPTION to rule 1, the user's decision on 13 Nov 2026, for going live:
// `openLiveSetupSession` may reach MANNA_TREADS_LIVE and HITECH_PRETREADS_LIVE,
// and nothing else may. It is kept this narrow on purpose:
//   - those two names only, written here and not read from any config;
//   - it can read anything, and ADD only a user table, a user field and a row
//     of @MANNA_IC. No change, no delete, no document, whatever the caller
//     asks (`liveSetupAllows`) - except ONE change, added on the evening of
//     13 Nov 2026 at the user's explicit word, to switch the order flow on
//     and off without opening SAP: @MANNA_IC's ENABLED row set to "Y" or "N",
//     that row, that field and those two values only;
//   - it signs in with its own login, `live_setup` in sap.local.json, which a
//     person types there - never the test login, tried against live to see;
//   - the door itself is a value this file does not export, so no other
//     script can open it by passing an option.
// Every other tool here is as shut out of live as before. Used by
// b1if-setup-live.mjs and b1if-enable-live.mjs.

import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIVE_DBS = new Set([
	"MANNA_RUBBER_LIVE",
	"HITECH_PRETREADS_LIVE",
	"HITECH_RUBBER_LIVE",
	"MANNA_TYRE_LIVE",
	// The pricing and order syncs' book, named in production's server scripts.
	"MANNA_TREADS_LIVE",
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = path.join(HERE, "sap.local.json");

/** Why this database may not be used, or "" when it may. Pure, so it is testable. */
export const refusalFor = (db, testDbs) => {
	const name = String(db || "").trim().toUpperCase();
	if (!name) return "no company database given";
	if (LIVE_DBS.has(name)) return `${name} is a live company`;
	if (/_LIVE$/.test(name)) return `${name} ends in _LIVE`;
	const allowed = (testDbs || []).map((d) => String(d).trim().toUpperCase());
	if (!allowed.includes(name)) return `${name} is not in test_dbs`;
	return "";
};

/** The two live companies the go-live set-up may reach (13 Nov 2026). */
export const LIVE_SETUP_DBS = new Set(["MANNA_TREADS_LIVE", "HITECH_PRETREADS_LIVE"]);

/** Why the live set-up may not use this database, or "" when it may. Pure. */
export const liveSetupRefusal = (db) => {
	const name = String(db || "").trim().toUpperCase();
	if (!name) return "no company database given";
	if (!LIVE_SETUP_DBS.has(name)) return `${name} is not one of the two companies the live set-up may reach`;
	return "";
};

const LIVE_SETUP_ADDS = new Set(["Login", "Logout", "UserTablesMD", "UserFieldsMD", "U_MANNA_IC"]);

/** The one change the live set-up may make: the order flow's switch, on or off (the user's decision, 13 Nov 2026 evening). */
const LIVE_SETUP_SWITCH = "U_MANNA_IC('ENABLED')";

/** May the live set-up send this? It reads anything, adds three kinds of thing, and changes one value - ENABLED, to
 * Y or N - and deletes nothing. The body is checked too: a PATCH carrying any other field or value is refused. Pure. */
export const liveSetupAllows = (method, rel, body) => {
	const m = String(method || "").toUpperCase();
	if (m === "GET") return true;
	const path = String(rel || "").replace(/^\/+/, "");
	if (m === "PATCH") {
		if (path !== LIVE_SETUP_SWITCH) return false;
		if (!body || typeof body !== "object" || Array.isArray(body)) return false;
		const keys = Object.keys(body);
		return keys.length === 1 && keys[0] === "U_Value" && (body.U_Value === "Y" || body.U_Value === "N");
	}
	if (m !== "POST") return false;
	const first = path.split(/[?(/]/)[0];
	return LIVE_SETUP_ADDS.has(first);
};

/** Not exported: only `openLiveSetupSession` below can hand this to a session. */
const LIVE_SETUP = Symbol("the live set-up's door");

export const loadConfig = () => {
	if (!fs.existsSync(CONFIG_PATH)) {
		throw new Error(`No ${CONFIG_PATH}. Copy sap.local.example.json to it and fill it in.`);
	}
	const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
	for (const k of ["url", "fingerprint256", "username", "password"]) {
		if (!String(cfg[k] || "").trim() || /PUT_.*_HERE/.test(cfg[k])) {
			throw new Error(`${k} is missing or still a placeholder in sap.local.json`);
		}
	}
	if (!Array.isArray(cfg.test_dbs) || cfg.test_dbs.length === 0) {
		throw new Error("test_dbs is empty in sap.local.json — name the test company databases");
	}
	// A live name in the allow-list is a mistake worth stopping on, not skipping.
	for (const db of cfg.test_dbs) {
		const why = refusalFor(db, cfg.test_dbs);
		if (why) throw new Error(`test_dbs refused: ${why}`);
	}
	return cfg;
};

/** Connections whose certificate matched the pin when they were opened. */
const verified = new WeakSet();

const normalise = (fp) => String(fp).replace(/[^0-9A-F]/gi, "").toUpperCase();

export class SapSession {
	constructor(cfg, db, door) {
		this.liveSetup = door === LIVE_SETUP;
		const why = this.liveSetup ? liveSetupRefusal(db) : refusalFor(db, cfg.test_dbs);
		if (why) throw new Error(`Refusing SAP company: ${why}`);
		this.cfg = cfg;
		this.db = db;
		this.base = new URL(cfg.url.replace(/\/+$/, "") + "/");
		this.cookies = "";
		this.agent = new https.Agent({
			// Off only because the fingerprint check below replaces it.
			rejectUnauthorized: false,
			keepAlive: true,
			// No TLS session resumption: a resumed session reports no peer
			// certificate, so the pin would have nothing to check (seen 24
			// Oct 2026 — the Login's connection passed, the next one had
			// none). A full handshake per connection costs nothing here.
			maxCachedSessions: 0,
		});
	}

	request(method, rel, body, { raw = false } = {}) {
		if (this.liveSetup && !liveSetupAllows(method, rel, body)) {
			return Promise.reject(new Error(`Refused on a live company: ${method} ${String(rel).split("?")[0]} - the live set-up reads, adds a user table, a user field or a @MANNA_IC row, sets ENABLED to Y or N, and nothing else`));
		}
		const url = new URL(rel.replace(/^\/+/, ""), this.base);
		const payload = body === undefined ? undefined : JSON.stringify(body);
		return new Promise((resolve, reject) => {
			const req = https.request(
				url,
				{
					method,
					agent: this.agent,
					headers: {
						"Content-Type": "application/json",
						...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
						...(this.cookies ? { Cookie: this.cookies } : {}),
					},
					timeout: 60_000,
				},
				(res) => {
					const set = res.headers["set-cookie"];
					if (set) this.cookies = set.map((c) => c.split(";")[0]).join("; ");
					let text = "";
					res.setEncoding("utf8");
					res.on("data", (c) => (text += c));
					res.on("end", () => {
						if (raw && res.statusCode < 400) return resolve(text);
						let json;
						try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
						if (res.statusCode >= 400) {
							const m = json?.error?.message;
							const msg = typeof m === "string" ? m : m?.value || JSON.stringify(json).slice(0, 300);
							return reject(Object.assign(new Error(`${method} ${rel} -> ${res.statusCode}: ${msg}`), { status: res.statusCode, sapCode: json?.error?.code }));
						}
						resolve(json);
					});
				},
			);
			// The pin is checked once per connection, when its handshake
			// finishes and before the body is written, so a server that is not
			// ours never sees the password. A kept-alive connection reused for
			// the next request reports no certificate at all, which is why the
			// verdict is remembered on the socket rather than asked again.
			req.on("socket", (sock) => {
				if (verified.has(sock)) return;
				const check = () => {
					const got = normalise(sock.getPeerCertificate()?.fingerprint256 || "");
					if (got === normalise(this.cfg.fingerprint256)) {
						verified.add(sock);
					} else {
						req.destroy(new Error(`SAP certificate fingerprint mismatch (got ${got || "none"}) — nothing was sent`));
					}
				};
				if (sock.connecting || !sock.encrypted || sock.getPeerCertificate === undefined) {
					sock.once("secureConnect", check);
				} else {
					// Handed over already connected but never checked: refuse
					// rather than trust a socket this code did not see open.
					req.destroy(new Error("SAP connection reused without a certificate check — nothing was sent"));
				}
			});
			req.on("timeout", () => req.destroy(new Error(`${method} ${rel} timed out`)));
			req.on("error", reject);
			if (payload) req.write(payload);
			req.end();
		});
	}

	async login() {
		if (this.liveSetup) {
			const l = this.cfg.live_setup;
			return this.request("POST", "Login", { CompanyDB: this.db, UserName: l.username, Password: l.passwords[this.db] });
		}
		const pw = this.cfg.password_overrides?.[this.db] ?? this.cfg.password;
		return this.request("POST", "Login", { CompanyDB: this.db, UserName: this.cfg.username, Password: pw });
	}

	get(rel) {
		return this.request("GET", rel);
	}

	/** The body as text — `$metadata` is XML, not JSON. */
	getText(rel) {
		return this.request("GET", rel, undefined, { raw: true });
	}

	async logout() {
		try { await this.request("POST", "Logout"); } catch { /* the session dies on its own after 30 minutes */ }
	}
}

/**
 * A session on one of the two live companies, for the go-live set-up only (see the top of this file).
 * Needs `live_setup` in sap.local.json: { "username": "...", "passwords": { "<company>": "..." } } - a password
 * for each company by its own name, with no fallback, so nothing is ever tried against live on a guess.
 */
export const openLiveSetupSession = (cfg, db) => {
	const name = String(db || "").trim().toUpperCase();
	const why = liveSetupRefusal(name);
	if (why) throw new Error(`Refusing SAP company: ${why}`);
	const l = cfg.live_setup;
	const pw = l?.passwords?.[name];
	if (!String(l?.username || "").trim() || !String(pw || "").trim() || /PUT_.*_HERE/.test(`${l.username}${pw}`)) {
		throw new Error(`No live login for ${name}: add "live_setup": { "username": "...", "passwords": { "${name}": "..." } } to sap.local.json`);
	}
	return new SapSession(cfg, name, LIVE_SETUP);
};
