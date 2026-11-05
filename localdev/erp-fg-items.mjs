// The new finished-goods codes, into the LOCAL ERPNext copy as Items, from what fg-items-read.mjs read out of the
// SAP test companies (sap/out/fg-items-from-sap.json).
//
//     node localdev/erp-fg-items.mjs            dry run: what would be created, and what cannot be
//     node localdev/erp-fg-items.mjs --apply    create them
//
// Only creates. An item already in ERPNext is reported and left alone — PMB00101002 and PMB00101502 were made by
// hand for the first order tests (3 Nov 2026). No prices, no stock, no item defaults: prices reach the phone from
// SAP Pricing Control's snapshot and stock from the stock sync, not from the Item.
//
// Set the way the old finished goods are (I-14089 and the rest): stock, sales and purchase item, Kg. The group is
// Hi-Tech's SAP group when ERPNext has it, because ERPNext's codes and groups are Hi-Tech's; otherwise "FG", as the
// two hand-made items have. The roll figures are SAP's own, so custom_packing_push_pending — which
// manna_item_packing_handover raises on any new figure, to push it INTO SAP — is put back to 0.
//
// Refuses any ERPNext but 127.0.0.1: the key it uses (Manna_CMMS/server/.env) is the local Administrator's.

import fs from "node:fs";
import path from "node:path";
import { CMMS_ENV, LOCALDEV } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const SOURCE = path.join(LOCALDEV, "sap", "out", "fg-items-from-sap.json");
const FALLBACK_GROUP = "FG";

const env = Object.fromEntries(
	fs.readFileSync(CMMS_ENV, "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = (env.ERPNEXT_URL || "").replace(/\/+$/, "");
if (BASE !== "http://127.0.0.1:8000") throw new Error(`Refusing: ${CMMS_ENV} points at ${BASE || "nothing"}, not the local copy`);
const auth = `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}`;
const call = async (method, p, body) => {
	const r = await fetch(BASE + p, { method, headers: { Authorization: auth, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await r.text();
	if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
	return text ? JSON.parse(text) : null;
};
const q = (o) => encodeURIComponent(JSON.stringify(o));
const names = async (dt, filters = []) => new Set((await call("GET", `/api/resource/${encodeURIComponent(dt)}?fields=${q(["name"])}&filters=${q(filters)}&limit_page_length=0`)).data.map((d) => d.name));

const rows = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
const groups = await names("Item Group");
const hsns = await names("GST HSN Code");
const existing = await names("Item", [["name", "in", rows.map((r) => r.code)]]);
if (!groups.has(FALLBACK_GROUP)) throw new Error(`Item Group ${FALLBACK_GROUP} is not on the site`);

const plan = [];
const notes = { exists: [], not_in_sap: [], no_hsn: [], unit: [], fallback_group: [], inactive: [] };
for (const r of rows) {
	if (existing.has(r.code)) { notes.exists.push(r.code); continue; }
	if (!r.in_manna && !r.in_hitech) { notes.not_in_sap.push(r.code); continue; }
	if (!/^kgs?$/i.test(String(r.uom || "kg"))) { notes.unit.push(`${r.code} ${r.uom}`); continue; }
	const group = [r.hitech_group, r.manna_group].find((g) => g && groups.has(g)) || FALLBACK_GROUP;
	if (group === FALLBACK_GROUP) notes.fallback_group.push(`${r.code} (${r.hitech_group ?? r.manna_group ?? "none"})`);
	const hsn = r.hsn && hsns.has(r.hsn) ? r.hsn : null;
	if (!hsn) notes.no_hsn.push(`${r.code} ${r.hsn ?? "none in SAP"}`);
	if (!r.active) notes.inactive.push(r.code);
	const name = String(r.name || r.hitech_name).trim();
	plan.push({
		doctype: "Item",
		item_code: r.code,
		item_name: name.slice(0, 140),
		description: name,
		item_group: group,
		stock_uom: "Kg",
		uoms: [{ uom: "Kg", conversion_factor: 1 }],
		is_stock_item: 1,
		is_sales_item: 1,
		is_purchase_item: 1,
		include_item_in_manufacturing: 1,
		grant_commission: 1,
		disabled: r.active ? 0 : 1,
		...(hsn ? { gst_hsn_code: hsn } : {}),
		...(Number(r.belts_per_roll) > 0 ? { custom_belts_per_roll: Number(r.belts_per_roll) } : {}),
		...(Number(r.weight_per_roll) > 0 ? { custom_weight_per_roll: Number(r.weight_per_roll) } : {}),
	});
}

const byGroup = plan.reduce((t, p) => ((t[p.item_group] = (t[p.item_group] || 0) + 1), t), {});
console.log(`${rows.length} codes read from SAP. ${plan.length} to create; ${notes.exists.length} already in ERPNext (left alone).`);
console.log("By group:", byGroup);
console.log(`With roll figures: ${plan.filter((p) => p.custom_weight_per_roll).length}. Disabled (inactive in SAP): ${notes.inactive.length}.`);
for (const [k, v] of Object.entries(notes)) if (v.length && k !== "exists") console.log(`${k} (${v.length}): ${v.slice(0, 12).join(", ")}${v.length > 12 ? " …" : ""}`);
if (notes.no_hsn.length) console.log("  (no_hsn: created without an HSN; ERPNext's GST checks will ask for one on a sale)");

if (!apply) { console.log("\nDry run. Run again with --apply."); process.exit(0); }

let made = 0;
const failed = [];
for (const p of plan) {
	try {
		await call("POST", "/api/resource/Item", p);
		if (p.custom_weight_per_roll || p.custom_belts_per_roll) {
			await call("PUT", `/api/resource/Item/${encodeURIComponent(p.item_code)}`, { custom_packing_push_pending: 0 });
		}
		made++;
	} catch (e) {
		failed.push(`${p.item_code}: ${e.message}`);
	}
}
console.log(`\nCreated ${made} of ${plan.length} on ${BASE}.`);
if (failed.length) console.log(`Failed (${failed.length}):\n  ${failed.slice(0, 20).join("\n  ")}`);
process.exitCode = failed.length ? 1 : 0;
