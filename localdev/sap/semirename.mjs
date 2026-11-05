// The semi-finished items' names onto the new quality labels, in one SAP test company.
//
//     node localdev/sap/semirename.mjs TEST_HITECH_PRETREADS                   dry run → out/<DB>-semirename-plan.json
//     node localdev/sap/semirename.mjs TEST_HITECH_PRETREADS --only I-10982    one item
//     node localdev/sap/semirename.mjs TEST_HITECH_PRETREADS --apply ...       rename them
//
// Semi-finished means EXTRUDED, CURED and SANDERED items outside the finished-
// goods groups — by U_ProductType or by the word in the name, since 501 of them
// leave the type blank. Finished goods are not renamed: they get new codes.
//
// Only the compound word changes, and only for the five compounds with a new
// label (management, 2 Nov 2026):
//   Black Pearl B → DOUBLE BLUE B   Black Pearl, BP → DOUBLE BLUE   Platinum, PL → BLUE
//   Polygold → ORANGE/VERDO          Silver → YELLOW/ROX             Diamond → SINGLE WHITE
// MEDIUM, EXCELLENT, RUBCO, GOLD and MSP are left as they are until somebody
// decides their labels. A sandered item follows its cured one by the same rule.
//
// U_Quality goes to the same label. The name is the truth when the two
// disagree, and the disagreement is reported.
//
// An item whose new name another item already has, or would get, is left alone
// and reported: two items under one name is how the wrong one gets issued.
// Item codes do not change, so BOMs keep pointing at the same items — but SAP
// keeps a copy of the item name on every BOM line, and the BOM screen shows
// that copy. So after the renames, every BOM line whose copy no longer matches
// its item is refreshed, the rest of the BOM sent back as it was and checked.
// --bom-names does only that step, for renames already made.
// SapSession refuses any company outside test_dbs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const bomNamesOnly = args.includes("--bom-names");
const db = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
if (!db) throw new Error("name the test company: node semirename.mjs TEST_HITECH_PRETREADS [--only CODE] [--apply]");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

// Longest first: "Black Pearl B" before "Black Pearl", typos as they are in SAP.
export const RULES = [
	[/\bBLACK\s+PEARL\s+B\b/gi, "DOUBLE BLUE B"],
	[/\bBLACK\s*PEA?RA?L\b|\bBACKPEARL\b|\bB\s?P\b/gi, "DOUBLE BLUE"],
	[/\bPLATINUM\b|\bPL\b/gi, "BLUE"],
	[/\bPOLY\s*GOLD\b|\bPOLGOLD\b/gi, "ORANGE/VERDO"],
	[/\bSILVER\b|\bSIVER\b|\bSLVER\b/gi, "YELLOW/ROX"],
	[/\bDIAMOND\b|\bDAIMOND\b|\bDIAMAND\b/gi, "SINGLE WHITE"],
];
const OLD_QUALITY = { BP: "DOUBLE BLUE", "BLACK PEARL": "DOUBLE BLUE", PLATINUM: "BLUE", PL: "BLUE", POLYGOLD: "ORANGE/VERDO",
	SILVER: "YELLOW/ROX", SIVER: "YELLOW/ROX", DIAMOND: "SINGLE WHITE" };

/** The new name and label for an old name, or null when no compound word in it has a new label. Pure. */
export const relabel = (name) => {
	let out = name;
	const labels = [];
	for (const [re, label] of RULES) {
		out = out.replace(re, () => { labels.push(label); return label; });
	}
	return labels.length ? { name: out, label: labels[0], labels } : null;
};

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
const norm = (v) => String(v || "").replace(/\s+/g, " ").trim().toUpperCase();

const s = new SapSession(loadConfig(), db);
await s.login();
const plan = { db, rename: [], unchanged: [], clash: [] };
let failed = 0;
try {
	const groups = new Map((await all(s, "ItemGroups?$select=Number,GroupName")).map((g) => [g.Number, g.GroupName]));
	const items = await all(s, "Items?$select=ItemCode,ItemName,ItemsGroupCode,U_ProductType,U_Quality");
	const semi = items.filter((i) => !/^(FG|HOT$|Seconds$)/i.test(groups.get(i.ItemsGroupCode) || "")
		&& (/^(CURED|EXTRUDED|SANDERED)$/i.test(i.U_ProductType || "") || /\b(CURED|EXTRUDED|SANDERED)\b/i.test(i.ItemName))
		&& (!only || i.ItemCode === only));

	const proposed = [];
	for (const i of semi) {
		const r = relabel(i.ItemName);
		if (!r) { plan.unchanged.push({ code: i.ItemCode, name: i.ItemName, quality: i.U_Quality }); continue; }
		const oldQ = norm(i.U_Quality);
		const note = oldQ && OLD_QUALITY[oldQ] !== r.label && oldQ !== r.label ? `U_Quality was ${i.U_Quality}` : "";
		proposed.push({ code: i.ItemCode, group: groups.get(i.ItemsGroupCode), type: i.U_ProductType, from: i.ItemName, to: r.name,
			qualityFrom: i.U_Quality, qualityTo: r.label, note: [note, new Set(r.labels).size > 1 ? `two labels: ${r.labels.join(", ")}` : ""].filter(Boolean).join("; ") });
	}
	// A new name is refused when any other item has it now, or would have it after the rename.
	const after = new Map();
	for (const i of items) after.set(norm(i.ItemName), (after.get(norm(i.ItemName)) || []).concat(i.ItemCode));
	for (const p of proposed) after.set(norm(p.to), (after.get(norm(p.to)) || []).concat(p.code));
	// Items whose names already differ only in spacing (233 of them) stay as alike as they were:
	// the rename carries that along rather than causing it, so they go ahead and are flagged.
	const before = new Map();
	for (const i of items) before.set(norm(i.ItemName), (before.get(norm(i.ItemName)) || []).concat(i.ItemCode));
	for (const p of proposed) {
		const others = (after.get(norm(p.to)) || []).filter((c) => c !== p.code);
		const already = new Set(before.get(norm(p.from)) || []);
		if (p.to.length > 200) plan.clash.push({ ...p, why: "longer than SAP allows (200)" });
		else if (others.some((c) => !already.has(c))) plan.clash.push({ ...p, why: `same name as ${others.join(", ")}` });
		else {
			if (others.length) p.note = [p.note, `already named like ${others.join(", ")} (spacing only)`].filter(Boolean).join("; ");
			plan.rename.push(p);
		}
	}
	console.log(`${apply ? "APPLY" : "DRY RUN"} ${db}: ${semi.length} semi-finished, ${plan.rename.length} to rename, ${plan.unchanged.length} unchanged, ${plan.clash.length} held back`);
	const byType = {};
	for (const p of plan.rename) byType[p.type || "(blank)"] = (byType[p.type || "(blank)"] || 0) + 1;
	console.log("  to rename by type:", JSON.stringify(byType));

	if (apply && !bomNamesOnly) {
		for (const p of plan.rename) {
			try {
				await s.request("PATCH", `Items('${encodeURIComponent(p.code.replace(/'/g, "''"))}')`, { ItemName: p.to, U_Quality: p.qualityTo });
				const back = await s.get(`Items('${encodeURIComponent(p.code.replace(/'/g, "''"))}')?$select=ItemName,U_Quality`);
				if (back.ItemName !== p.to || back.U_Quality !== p.qualityTo) throw new Error(`reads back as "${back.ItemName}" / ${back.U_Quality}`);
				p.done = true;
			} catch (e) {
				failed++;
				p.error = e.message;
				console.log(`FAILED  ${p.code} "${p.from}": ${e.message}`);
			}
		}
		console.log(`renamed ${plan.rename.filter((p) => p.done).length}, failed ${failed}`);
	}

	// BOM lines carrying a stale copy of an item's name.
	// Only the semi-finished items in scope (--only narrows it), so a pilot touches only its own BOMs.
	const inScope = new Set(semi.map((i) => i.ItemCode));
	const nameNow = new Map((apply ? await all(s, "Items?$select=ItemCode,ItemName") : items).filter((i) => inScope.has(i.ItemCode)).map((i) => [i.ItemCode, i.ItemName]));
	if (!apply) for (const p of plan.rename) nameNow.set(p.code, p.to);
	const boms = await all(s, "ProductTrees?$select=TreeCode,ProductDescription,ProductTreeLines");
	// The header keeps a copy of its own item's name too.
	const stale = boms.filter((b) => (nameNow.has(b.TreeCode) && b.ProductDescription !== nameNow.get(b.TreeCode)) || (b.ProductTreeLines || []).some((l) => nameNow.has(l.ItemCode) && l.ItemName !== nameNow.get(l.ItemCode)));
	plan.staleBoms = stale.length;
	console.log(`  BOMs with a stale line name${apply ? "" : " after the renames"}: ${stale.length}`);
	if (apply) {
		let fixed = 0;
		for (const b of stale) {
			try {
				const t = await s.get(`ProductTrees('${encodeURIComponent(b.TreeCode.replace(/'/g, "''"))}')`);
				const lines = t.ProductTreeLines.map((l) => (nameNow.has(l.ItemCode) ? { ...l, ItemName: nameNow.get(l.ItemCode) } : l));
				await s.request("PATCH", `ProductTrees('${encodeURIComponent(b.TreeCode.replace(/'/g, "''"))}')`, { ProductTreeLines: lines, ...(nameNow.has(b.TreeCode) ? { ProductDescription: nameNow.get(b.TreeCode) } : {}) });
				const back = await s.get(`ProductTrees('${encodeURIComponent(b.TreeCode.replace(/'/g, "''"))}')`);
				const sig = (ls) => ls.map((l) => `${l.ItemCode}:${l.Quantity}:${l.Warehouse}:${l.IssueMethod}`).join(",");
				if (sig(back.ProductTreeLines) !== sig(t.ProductTreeLines) || back.Quantity !== t.Quantity) throw new Error("BOM reads back changed");
				fixed++;
			} catch (e) {
				failed++;
				console.log(`FAILED  BOM ${b.TreeCode}: ${e.message}`);
			}
		}
		console.log(`  BOM line names refreshed: ${fixed}`);
	}
} finally {
	await s.logout();
}
const file = path.join(OUT, `${db}-semirename-plan${apply ? "-applied" : ""}.json`);
fs.writeFileSync(file, JSON.stringify(plan, null, 1));
console.log(`plan → ${file}`);
if (failed) process.exitCode = 1;
