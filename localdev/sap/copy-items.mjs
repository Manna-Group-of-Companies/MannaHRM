// The local copy's HRI items that a SAP test company lacks, created there under the same codes.
//
//     node localdev/sap/copy-items.mjs                      dry run: what would be created, HITECH_RUBBER
//     node localdev/sap/copy-items.mjs --apply              create them
//     node localdev/sap/copy-items.mjs --apply OTHER_DB     another test company
//
// The copy's items carry the live company's SAP codes, so a test company restored before an item was made
// refuses every request for it ("Item number is missing"). The payload is PASS A's (Sync-SapItemCategories.ps1)
// with the code given rather than drawn from the series, so the sync, reading the copy, finds what it expects.
// SapSession refuses any company outside test_dbs.

import fs from "node:fs";
import { CMMS_ENV } from "../paths.mjs";
import { loadConfig, SapSession } from "./sapguard.mjs";

const apply = process.argv.includes("--apply");
const db = process.argv.slice(2).find((a) => !a.startsWith("--")) || "HITECH_RUBBER";
const abbr = "HRI";

const env = Object.fromEntries(
	fs.readFileSync(CMMS_ENV, "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.ERPNEXT_URL || "")) throw new Error("not the local copy");
const erp = async (path) => {
	const r = await fetch(`${env.ERPNEXT_URL}/api/${path}`, { headers: { Authorization: `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}` } });
	if (!r.ok) throw new Error(`ERPNext ${r.status} on ${path}`);
	return (await r.json()).data;
};

const ctl = await erp(`resource/${encodeURIComponent("SAP Item Category Sync Control")}/${encodeURIComponent("SAP Item Category Sync Control")}`);
const opt = JSON.parse(ctl.item_master_options || "{}")[abbr];
if (!opt) throw new Error(`no item_master_options for ${abbr}`);
const groupOf = new Map((opt.groups || []).map((g) => [String(g.name).trim().toLowerCase(), g]));
const wh = String(opt.warehouse || "").trim() || "01";

const fields = ["name", "item_name", "stock_uom", "safety_stock", "custom_sap_item_code", "custom_sap_item_group", "custom_sap_sub_type_a",
	"custom_sap_sub_type_b", "custom_sap_foreign_name", "custom_sap_hsn_code", "custom_sap_tax_rate"];
const items = await erp(`resource/Item?${new URLSearchParams({
	fields: JSON.stringify(fields),
	filters: JSON.stringify([["name", "like", `${abbr}-%`], ["custom_sap_item_code", "is", "set"]]),
	limit_page_length: "2000",
})}`);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const digits = (s) => String(s ?? "").replace(/[^0-9]/g, "");
const all = async (s, rel) => {
	const rows = [];
	for (let next = rel; next;) {
		const r = await s.get(next);
		rows.push(...(r?.value ?? []));
		const lnk = r?.["odata.nextLink"] || r?.["@odata.nextLink"];
		next = lnk ? lnk.replace(/^.*\/b1s\/v\d\//, "") : null;
	}
	return rows;
};

const s = new SapSession(loadConfig(), db);
await s.login();
let failed = 0;
try {
	const have = new Set();
	for (let i = 0; i < items.length; i += 20) {
		const f = items.slice(i, i + 20).map((it) => `ItemCode eq '${String(it.custom_sap_item_code).replace(/'/g, "''")}'`).join(" or ");
		for (const v of (await s.get(`Items?$select=ItemCode&$filter=${encodeURIComponent(f)}&$top=20`))?.value ?? []) have.add(v.ItemCode);
	}
	const missing = items.filter((it) => !have.has(it.custom_sap_item_code))
		.sort((a, b) => a.custom_sap_item_code.localeCompare(b.custom_sap_item_code, "en", { numeric: true }));
	console.log(`${apply ? "APPLY" : "DRY RUN"} ${db}: ${missing.length} of ${items.length} ${abbr} items missing; series ${opt.series}, warehouse ${wh}`);

	const hsn = new Map();
	for (const h of await all(s, "IndiaHsn?$select=AbsEntry,Chapter,Heading,SubHeading")) {
		const d = digits(`${h.Chapter}${h.Heading}${h.SubHeading}`);
		if (d && !hsn.has(d)) hsn.set(d, h.AbsEntry);
	}
	const units = new Map((await all(s, "UnitOfMeasurements?$select=Code")).map((u) => [String(u.Code).toUpperCase(), u.Code]));

	for (const it of missing) {
		const code = it.custom_sap_item_code;
		try {
			const g = groupOf.get(norm(it.custom_sap_item_group).toLowerCase());
			if (!g) throw new Error(`'${it.custom_sap_item_group}' is not an engineering item group of ${abbr}`);
			const name = norm(it.item_name);
			if (!name || name.length > 100) throw new Error("the name is empty or longer than SAP allows (100)");
			const want = norm(it.stock_uom).toUpperCase();
			const unit = units.get(want) || want;
			if (!unit) throw new Error("no unit");
			const payload = {
				ItemCode: code, ItemName: name, ItemsGroupCode: Number(g.code), ItemType: "itItems",
				InventoryItem: "tYES", SalesItem: "tYES", PurchaseItem: "tYES", ProcurementMethod: "bom_Buy",
				UoMGroupEntry: -1, InventoryUOM: unit, PurchaseUnit: unit, SalesUnit: unit,
				Series: Number(opt.series), GSTRelevnt: "tYES", GSTTaxCategory: "gtc_Regular",
			};
			if (norm(it.custom_sap_foreign_name)) payload.ForeignName = norm(it.custom_sap_foreign_name);
			if (norm(it.custom_sap_sub_type_a)) payload.U_SubTypeA = norm(it.custom_sap_sub_type_a);
			if (norm(it.custom_sap_sub_type_b)) payload.U_SubTypeB = norm(it.custom_sap_sub_type_b);
			if (norm(it.custom_sap_tax_rate)) payload.U_TaxRate = norm(it.custom_sap_tax_rate);
			const d = digits(it.custom_sap_hsn_code);
			if (d) {
				if (!hsn.has(d)) throw new Error(`HSN ${d} is not in ${db}'s HSN list`);
				payload.ChapterID = hsn.get(d);
			}
			if (Number(it.safety_stock) > 0) {
				payload.MinInventory = Number(it.safety_stock);
				payload.ItemWarehouseInfoCollection = [{ WarehouseCode: wh, MinimalStock: Number(it.safety_stock) }];
			}
			if (!apply) { console.log(`would create ${code}: ${JSON.stringify(payload)}`); continue; }
			await s.request("POST", "Items", payload);
			const back = await s.get(`Items('${encodeURIComponent(code.replace(/'/g, "''"))}')?$select=ItemCode,ItemName,ItemsGroupCode,InventoryUOM,ChapterID,U_TaxRate,GSTRelevnt`);
			console.log(`created ${code}: ${JSON.stringify(back, (k, v) => (k.startsWith("odata") ? undefined : v))}`);
		} catch (e) {
			failed++;
			console.log(`FAILED ${code} (${it.name}): ${e.message}`);
		}
	}
} finally {
	await s.logout();
}
if (failed) process.exitCode = 1;
