// Read only: the new finished-goods codes (out/fg-mapping.json) as the two test companies hold them, for
// erp-fg-items.mjs to put into the local ERPNext. Writes out/fg-items-from-sap.json.
//
//     node localdev/sap/fg-items-read.mjs                      name, HSN, unit from TEST_MANNA_TREADS
//     node localdev/sap/fg-items-read.mjs --names-from-hitech  all of it from TEST_HITECH_PRETREADS
//
// Name, group, HSN and unit come from TEST_MANNA_TREADS (the user's choice, 5 Nov 2026). Roll weight and belts per
// roll come from TEST_HITECH_PRETREADS: Manna Treads has no U_WeightPerRoll / U_BeltsPerRoll, and Hi-Tech's SAP is
// the master for packing (manna_item_packing_handover). Hi-Tech's group is read too, because ERPNext's item codes
// and groups are Hi-Tech's. The switch exists because TEST_MANNA_TREADS stopped answering on 5 Nov 2026; the
// names were checked identical in both companies the day before.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const MANNA = "TEST_MANNA_TREADS";
const HITECH = "TEST_HITECH_PRETREADS";

const mapping = JSON.parse(fs.readFileSync(path.join(OUT, "fg-mapping.json"), "utf8"));
const codes = [...new Set((Array.isArray(mapping) ? mapping : Object.values(mapping)).map((r) => r.new).filter(Boolean))];
const cfg = loadConfig();

const readCompany = async (db, select) => {
	const s = new SapSession(cfg, db);
	try {
		await s.login();
		const groups = new Map((await s.get("ItemGroups?$select=Number,GroupName&$top=5000")).value.map((g) => [g.Number, g.GroupName]));
		const hsn = new Map();
		for (let skip = 0; ; skip += 500) {
			const page = (await s.get(`IndiaHsn?$select=AbsEntry,Chapter,Heading,SubHeading&$top=500&$skip=${skip}`)).value;
			for (const h of page) hsn.set(h.AbsEntry, `${h.Chapter ?? ""}${h.Heading ?? ""}${h.SubHeading ?? ""}`.replace(/\D/g, ""));
			if (page.length < 500) break;
		}
		const items = new Map();
		for (let i = 0; i < codes.length; i += 20) {
			const f = codes.slice(i, i + 20).map((c) => `ItemCode eq '${c}'`).join(" or ");
			for (const it of (await s.get(`Items?$select=${select}&$filter=${encodeURIComponent(f)}&$top=50`)).value) items.set(it.ItemCode, it);
		}
		return { groups, hsn, items };
	} finally {
		await s.logout();
	}
};

const COMMON = "ItemCode,ItemName,ItemsGroupCode,ChapterID,InventoryUOM,SalesUnit,Valid,Frozen,SalesItem,InventoryItem";
const fromHitech = process.argv.includes("--names-from-hitech");
const h = await readCompany(HITECH, `${COMMON},U_BeltsPerRoll,U_WeightPerRoll`);
const m = fromHitech ? h : await readCompany(MANNA, COMMON);
console.log(`Name, HSN and unit from ${fromHitech ? HITECH : MANNA}.`);

const rows = codes.map((code) => {
	const a = m.items.get(code);
	const b = h.items.get(code);
	return {
		code,
		in_manna: !!a,
		in_hitech: !!b,
		name: a?.ItemName ?? null,
		hitech_name: b?.ItemName ?? null,
		manna_group: a ? m.groups.get(a.ItemsGroupCode) ?? String(a.ItemsGroupCode) : null,
		hitech_group: b ? h.groups.get(b.ItemsGroupCode) ?? String(b.ItemsGroupCode) : null,
		hsn: a?.ChapterID != null && a.ChapterID !== -1 ? m.hsn.get(a.ChapterID) ?? null : null,
		uom: a?.InventoryUOM || a?.SalesUnit || null,
		active: a ? a.Valid === "tYES" && a.Frozen !== "tYES" : false,
		sales_item: a ? a.SalesItem === "tYES" : false,
		belts_per_roll: b?.U_BeltsPerRoll ?? null,
		weight_per_roll: b?.U_WeightPerRoll ?? null,
	};
});
fs.writeFileSync(path.join(OUT, "fg-items-from-sap.json"), JSON.stringify(rows, null, 1));

const count = (f) => rows.filter(f).length;
console.log(`${codes.length} codes. In ${fromHitech ? HITECH : MANNA}: ${count((r) => r.in_manna)}, active: ${count((r) => r.active)}, sales item: ${count((r) => r.sales_item)}.`);
console.log(`In ${HITECH}: ${count((r) => r.in_hitech)}. Names differ: ${count((r) => r.in_manna && r.in_hitech && r.name !== r.hitech_name)}.`);
console.log(`HSN: ${count((r) => r.hsn)}. Unit: ${[...new Set(rows.map((r) => r.uom))].join(", ")}.`);
console.log(`Packing (Hi-Tech): belts ${count((r) => Number(r.belts_per_roll) > 0)}, weight ${count((r) => Number(r.weight_per_roll) > 0)}.`);
const tally = (k) => Object.entries(rows.reduce((t, r) => ((t[r[k]] = (t[r[k]] || 0) + 1), t), {})).sort((x, y) => y[1] - x[1]);
console.log("Manna groups:", tally("manna_group"));
console.log("Hi-Tech groups:", tally("hitech_group"));
console.log(`Saved out/fg-items-from-sap.json`);
