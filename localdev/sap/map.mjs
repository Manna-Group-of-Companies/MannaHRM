// What the CMMS's SAP sync needs from the Service Layer, and whether this
// login has it — read only.
//
//     node localdev/sap/map.mjs [DB]        default: the first of test_dbs
//
// Writes localdev/sap/out/<DB>-metadata.xml (the Service Layer's whole schema)
// and localdev/sap/out/<DB>-map.md (the report). out/ is gitignored: it names
// users and holds sample rows.
//
// Every call after Login is a GET. Whether the user may *write* is read off
// the user record (Superuser) rather than tried, because trying is writing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

// Everything Manna_CMMS/sap-sync calls, from Sync-SapItemCategories.ps1 and
// the scripts beside it (2 Nov 2026), with the fields it reads or sets.
const RESOURCES = [
	["Items", "ItemCode,ItemName,ItemsGroupCode,ChapterID,U_SubTypeA,U_SubTypeB,U_TaxRate,MinInventory", "item master: create, edit"],
	["ItemGroups", "Number,GroupName", "item groups: create"],
	["IndiaHsn", null, "HSN codes: create (PASS H)"],
	["UnitOfMeasurements", "AbsEntry,Code,Name", "units, for new items"],
	["UnitOfMeasurementGroups", "AbsEntry,Code,Name", "unit groups"],
	["SalesTaxCodes", "Code,Name", "tax codes"],
	["BusinessPartners", "CardCode,CardName,CardType", "vendors on POs"],
	["PurchaseRequests", "DocEntry,DocNum,DocDate,DocumentStatus", "purchase requests: post"],
	["PurchaseQuotations", "DocEntry,DocNum,DocDate,DocumentStatus", "quotations → POs"],
	["PurchaseOrders", "DocEntry,DocNum,DocDate,DocumentStatus,CardCode", "open PO lines; Close"],
	["PurchaseDeliveryNotes", "DocEntry,DocNum,DocDate,CardCode", "goods receipt PO (GRPO): post"],
	["InventoryGenEntries", "DocEntry,DocNum,DocDate", "nil-value stock additions"],
	["InventoryGenExits", "DocEntry,DocNum,DocDate", "spares issued to breakdowns"],
	["MaterialRevaluation", "DocEntry,DocNum,DocDate", "revaluing nil-value stock"],
	["Warehouses", "WarehouseCode,WarehouseName", "where receipts land"],
];
// Actions the sync calls (all POST, so only their presence is checked).
const ACTIONS = ["SeriesService_GetDocumentSeries", "SeriesService_AddSeries", "CompanyService_GetAdminInfo", "Close"];
// The item master's own fields the sync writes (OITM user-defined fields).
const UDFS = ["SubTypeA", "SubTypeB", "TaxRate"];

const cfg = loadConfig();
const db = process.argv[2] || cfg.test_dbs[0];
const s = new SapSession(cfg, db);
const lines = [];
const say = (l = "") => { lines.push(l); console.log(l); };
const short = (e) => String(e.message).replace(/^GET \S+ -> /, "").slice(0, 140);

fs.mkdirSync(OUT, { recursive: true });
try {
	const login = await s.login();
	say(`# SAP Service Layer — ${db}`);
	say();
	say(`Read ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC as \`${cfg.username}\`, through \`sapguard.mjs\`. Nothing was written.`);
	say();
	say(`- Service Layer ${login?.Version ?? "?"}, session timeout ${login?.SessionTimeout ?? "?"} min, ${cfg.url}`);

	const users = await s.get(`Users?$filter=UserCode eq '${cfg.username}'&$select=UserCode,UserName,Superuser,Locked,Department,Branch`).catch((e) => ({ error: short(e) }));
	const u = users?.value?.[0];
	if (u) {
		say(`- User \`${u.UserCode}\` (${u.UserName ?? "?"}): **Superuser ${u.Superuser === "tYES" ? "yes" : "no"}**, locked ${u.Locked === "tYES" ? "yes" : "no"}`);
	} else {
		say(`- User record not readable: ${users?.error ?? "no row"}`);
	}

	const metadata = await s.getText("$metadata");
	const metaFile = path.join(OUT, `${db}-metadata.xml`);
	fs.writeFileSync(metaFile, metadata);
	// Attributes in any order: this Service Layer writes EntityType before Name
	// (OData v3, `/b1s/v1`), and a pattern pinned to `<EntitySet Name=` finds
	// none of them — which read as "nothing exists" on the first run.
	const named = (tag) => new Set([...metadata.matchAll(new RegExp(`<${tag}\\b[^>]*?\\bName="([^"]+)"`, "g"))].map((m) => m[1]));
	const sets = named("EntitySet");
	const actions = new Set([...named("FunctionImport"), ...named("ActionImport"), ...named("Action")]);
	say(`- \`$metadata\`: ${sets.size} entity sets, ${actions.size} actions — saved to \`out/${db}-metadata.xml\` (${Math.round(metadata.length / 1024)} KB)`);
	say();

	say("## What the CMMS sync uses");
	say();
	say("| Resource | In schema | Readable | Rows | Sample | Used for |");
	say("|---|---|---|---|---|---|");
	for (const [name, select, why] of RESOURCES) {
		const inSchema = sets.has(name) ? "yes" : "**no**";
		let readable = "—", rows = "", sample = "";
		if (sets.has(name)) {
			try {
				const q = select ? `${name}?$top=1&$select=${select}` : `${name}?$top=1`;
				const r = await s.get(q);
				readable = "yes";
				const row = r?.value?.[0];
				sample = row ? Object.entries(row).filter(([k]) => !k.startsWith("odata")).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(", ") : "(empty)";
				rows = String(await s.get(`${name}/$count`).catch(() => "?"));
			} catch (e) {
				readable = `**no** — ${short(e)}`;
			}
		}
		say(`| ${name} | ${inSchema} | ${readable} | ${rows} | ${sample.replace(/\|/g, "/").slice(0, 70)} | ${why} |`);
	}
	say();

	say("## Actions the sync calls");
	say();
	for (const a of ACTIONS) {
		const found = [...actions].filter((x) => x === a || x.endsWith(`_${a}`) || x.endsWith(`.${a}`) || x === a.split("_").pop());
		say(`- \`${a}\`: ${found.length ? "in schema" : "**not found in $metadata**"}`);
	}
	say();

	say("## Item master user-defined fields (OITM)");
	say();
	const udf = await s.get("UserFieldsMD?$filter=TableName eq 'OITM'&$select=Name,Description,Type,Size").catch((e) => ({ error: short(e) }));
	if (udf.error) {
		say(`Not readable: ${udf.error}`);
	} else {
		const have = new Map(udf.value.map((f) => [f.Name, f]));
		for (const n of UDFS) {
			const f = have.get(n);
			say(`- \`U_${n}\`: ${f ? `present — ${f.Description} (${f.Type}, ${f.Size})` : "**missing** — the sync writes it"}`);
		}
		say(`- ${udf.value.length} OITM user fields in all`);
	}
	say();

	say("## Item groups the CMMS maps");
	say();
	const groups = await s.get("ItemGroups?$select=Number,GroupName&$orderby=Number").catch(() => ({ value: [] }));
	say(groups.value.map((g) => `${g.Number} ${g.GroupName}`).join(" · ") || "(none)");
} catch (e) {
	say(`\nFAILED: ${e.message}${e.sapCode ? ` (SAP code ${e.sapCode})` : ""}`);
	process.exitCode = 1;
} finally {
	await s.logout();
	const report = path.join(OUT, `${db}-map.md`);
	fs.writeFileSync(report, lines.join("\n") + "\n");
	console.log(`\nReport: ${report}`);
}
