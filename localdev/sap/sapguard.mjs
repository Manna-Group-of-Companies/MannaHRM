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
	constructor(cfg, db) {
		const why = refusalFor(db, cfg.test_dbs);
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
