# -*- coding: utf-8 -*-
"""Rebuild `tools/install_all.console.js` from the doctype JSON.

    python tools/build_console_bundle.py

The console bundle is generated, and it is committed anyway — the whole point of
it is that somebody with a browser and no Python can install the schema, and a
file they have to build first is not that. So this exists to regenerate it after
a doctype changes, and the file it writes says at the top that it is generated.

The install logic is imported from `install_all.py` rather than restated, so the
two cannot disagree about the order things go in.
"""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("ia", HERE / "install_all.py")
ia = importlib.util.module_from_spec(spec); spec.loader.exec_module(ia)

specs = ia.load_specs()
order, broken = ia.in_link_order(specs)
assert not broken, broken

DROP = {"doctype", "creation", "modified", "modified_by", "owner", "idx", "docstatus", "field_order"}
payload = []
for name in order:
	s = specs[name]
	d = {k: v for k, v in s.items() if k not in DROP}
	d["doctype"] = "DocType"
	d["custom"] = 1
	payload.append(d)

header = '''/* =========================================================================
   Put every doctype in this app onto the site — from the site's own console.

     1. Sign in to https://mannarubber.m.frappe.cloud and open /app
     2. F12 → Console
     3. Paste this whole file, press Enter
     4. Read what it prints

   No API key. It runs as you, in your own session, and everything it does is
   logged on the site under your name — which is the same arrangement the
   dashboard itself works under (client/src/api/client.js).

   ## What it does

   Creates each doctype that is **missing**, in the order they link in: every
   doctype a Link or Table field points at goes first, because Frappe refuses a
   link to a doctype that is not there and the error names the field rather than
   the missing table.

   ## What it will not do

   **It never touches a doctype that is already there.** Overwriting a
   definition somebody edited on the site loses whatever they changed —
   including, on a doctype with rows behind it, columns that still hold data.
   Set UPDATE_EXISTING to true only when you mean exactly that.

   **It deletes nothing, ever.** Not a doctype, not a field, not a column.

   **It carries no code.** These arrive as *custom* doctypes, which is what lets
   them be created at all without developer mode. The controllers beside the
   JSON in the repo do not run — so nothing on the server yet derives a loan's
   outstanding balance, refuses an over-recovery, or strips the name off an
   anonymous survey response. This is the way in until there is a bench, not the
   destination. See docs/DOCTYPES.md §14.

   Generated from the doctype JSON under manna_hr — edit those files, not this one.
   ========================================================================= */

const UPDATE_EXISTING = false;

'''

body = '''
const DOCTYPES = __PAYLOAD__;

(async () => {
	const api = async (path, opts) => {
		const r = await fetch(path, {
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"X-Frappe-CSRF-Token": window.frappe && window.frappe.csrf_token,
			},
			...opts,
		});
		const text = await r.text();
		let json = null;
		try { json = JSON.parse(text); } catch (e) { /* Frappe answers an error with HTML */ }
		return { ok: r.ok, status: r.status, json,
		         text: text.replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").slice(0, 300) };
	};

	if (!window.frappe || !window.frappe.csrf_token) {
		console.error("Open /app first and stay signed in — this needs the desk's CSRF token.");
		return;
	}

	const list = async (dt, params) => {
		const r = await api(`/api/resource/${encodeURIComponent(dt)}?${new URLSearchParams(params)}`);
		return r.ok ? r.json.data : [];
	};

	const roles = new Set((await list("Role", { fields: '["name"]', limit_page_length: 0 })).map((x) => x.name));
	const modules = new Set((await list("Module Def", { fields: '["name"]', limit_page_length: 500 })).map((x) => x.name));
	const there = new Set((await list("DocType", {
		fields: '["name"]',
		filters: JSON.stringify([["name", "in", DOCTYPES.map((d) => d.name)]]),
		limit_page_length: 0,
	})).map((x) => x.name));

	console.log(`site      ${location.origin}`);
	console.log(`signed in ${frappe.session.user}`);
	console.log(`doctypes  ${DOCTYPES.length} in this app, ${there.size} already on the site`);
	console.log("");

	const done = [];
	for (const spec of DOCTYPES) {
		const doc = JSON.parse(JSON.stringify(spec));

		/* `Manna HR` is a Module Def the app creates when a bench installs it.
		   On a site where it has never been installed it is absent, and `Custom`
		   is where Frappe itself puts a custom doctype. Printed, because which
		   module a doctype is in decides where it shows up on the desk. */
		if (!modules.has(doc.module)) doc.module = "Custom";

		/* A role the site has not got is refused on the way in. Dropping it
		   leaves a doctype only System Manager can reach — a permission to add
		   later rather than a wall — and dropping it silently would read to HR
		   as the save button being broken, so it is said out loud. */
		const want = doc.permissions || [];
		const kept = want.filter((p) => roles.has(p.role));
		const gone = want.filter((p) => !roles.has(p.role)).map((p) => p.role);
		if (!doc.istable && !kept.some((p) => p.create)) {
			kept.push({ role: "System Manager", read: 1, write: 1, create: 1, delete: 1,
			            report: 1, export: 1, print: 1, email: 1, share: 1 });
		}
		doc.permissions = kept;

		const exists = there.has(doc.name);
		if (exists && !UPDATE_EXISTING) {
			console.log(`  skip    ${doc.name.padEnd(42)} already there`);
			done.push({ doctype: doc.name, action: "left alone" });
			continue;
		}

		const r = exists
			? await api(`/api/resource/DocType/${encodeURIComponent(doc.name)}`,
			            { method: "PUT", body: JSON.stringify(doc) })
			: await api("/api/resource/DocType", { method: "POST", body: JSON.stringify(doc) });

		if (r.ok) {
			console.log(`  ${exists ? "updated" : "created"} ${doc.name}${gone.length ? "   (roles dropped: " + gone.join(", ") + ")" : ""}`);
			done.push({ doctype: doc.name, action: exists ? "updated" : "created" });
		} else {
			console.error(`  FAILED  ${doc.name}\\n          HTTP ${r.status}: ${r.text}`);
			done.push({ doctype: doc.name, action: `FAILED ${r.status}`, why: r.text });
		}
	}

	console.log("");
	console.table(done);
	console.log("Reload the desk to see them in the sidebar.");
})();
'''

js = header + body.replace("__PAYLOAD__", json.dumps(payload, indent=1, ensure_ascii=False))
(HERE / "install_all.console.js").write_text(js, encoding="utf-8")
print("wrote tools/install_all.console.js", len(js), "bytes,", len(payload), "doctypes")
