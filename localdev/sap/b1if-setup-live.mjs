// What B1if's order flow needs in the two LIVE SAP companies, added through the Service Layer.
// The one script here that may reach a live company (sapguard.mjs says why and how narrowly).
//
//     node localdev/sap/b1if-setup-live.mjs                 dry run: what is there, what would be added
//     node localdev/sap/b1if-setup-live.mjs --only MT       ...Manna Treads only (HT = Hi-Tech)
//     node localdev/sap/b1if-setup-live.mjs --apply         adds what is missing
//
// Manna Treads: user table @MANNA_IC (Code = setting, U_Value), its 14 settings, and OPOR.U_MannaMtSo.
//               (13 went in on 13 Nov 2026; DATE_SYNC = N, for the delivery-date step, is the one a later run adds.)
// Hi-Tech:      @MANNA_IC, its 8 settings, ORDR.U_MannaMtPo, ORDR.U_MannaMtSoNo, OPKL.U_Confirmed and
//               PKL1.U_ActualKg. (OVER_PCT and U_ActualKg, 16 Nov 2026, are what a later run adds.)
// The same things b1if-setup.mjs put on the TEST companies on 4 and 9 Nov 2026, where the flow was proved.
//
// It only ADDS. A table, field or setting that is already there is left exactly as it is and reported, even
// when its value is not the one below - somebody may have set it on purpose. It cannot change or delete:
// the guard refuses anything but a read or one of these three kinds of add, whatever this file asks for.
// ENABLED goes in as N. Nothing starts because this ran; switching on is done by a person, in SAP, last.
//
// Adding a field changes the company's database structure. People who are in SAP at that moment are told
// to log out and in again, as they would be if it were added in the SAP client. Pick the moment.
//
// The login is `live_setup` in sap.local.json, typed there by a person. A login SAP refuses is reported and
// never tried again: SAP locks a user after three wrong passwords, and this is a live user.

import { loadConfig, openLiveSetupSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] ?? "") : fallback; };
const apply = args.includes("--apply");
const only = opt("--only", "").toUpperCase();
if (only && !["MT", "HT"].includes(only)) throw new Error("--only takes MT (Manna Treads) or HT (Hi-Tech)");
const start = opt("--start", "2026-11-14");
if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error(`--start must be yyyy-mm-dd (got ${start})`);

// Every value was read off the live companies on 13 Nov 2026 (the 8 Nov copies, and SAP itself for the
// delivery series): Manna Treads' own purchase orders to S-1010 are series 199 KL-PO, branch 1 Kerala,
// warehouse 01, location 2, CG+SG@18; Hi-Tech's sales orders are series 179 HT-SO. DN_SERIES 9 is the
// delivery series renamed MT-DN that day (Kerala, FY26-27) - Manna Treads had never made a delivery.
const want = {
	MT: {
		db: "MANNA_TREADS_LIVE",
		fields: [{ TableName: "OPOR", Name: "MannaMtSo", Description: "Manna Treads SO DocEntry (B1if)", Size: 11 }],
		settings: {
			ENABLED: "N", START_DATE: start, MARGIN: "20", VENDOR: "S-1010",
			PO_SERIES: "199", PO_BRANCH: "1", PO_WHS: "01", PO_LOCATION: "2",
			HOME_STATE: "KL", TAX_IN_STATE: "CG+SG@18", TAX_OUT_STATE: "IGST@18", ERP_PREFIX: "SAL-ORD-",
			DN_SERIES: "9",
			// Step 6, the delivery-date step (13 Nov 2026) - not part of the 14 Nov go-live. N, and it stays N
			// until the step has been proved on TEST and a person turns it on here, in SAP.
			DATE_SYNC: "N",
		},
	},
	HT: {
		db: "HITECH_PRETREADS_LIVE",
		fields: [
			{ TableName: "ORDR", Name: "MannaMtPo", Description: "Manna Treads PO DocEntry (B1if)", Size: 11 },
			{ TableName: "ORDR", Name: "MannaMtSoNo", Description: "Manna Treads SO No.", Size: 20 },
			// The store ticks this on the pick list once it is picked; B1if invoices only a confirmed list.
			{ TableName: "OPKL", Name: "Confirmed", Description: "Confirmed - invoice it", Size: 1, DefaultValue: "N",
				ValidValuesMD: [{ Value: "Y", Description: "Yes" }, { Value: "N", Description: "No" }] },
			// What the store weighed, over or under the released kilos; step 3 invoices that (16 Nov 2026).
			{ TableName: "PKL1", Name: "ActualKg", Description: "Actual kg (weighed)", Type: "db_Float", SubType: "st_Quantity" },
		],
		settings: {
			ENABLED: "N", CUSTOMER: "10118", SO_SERIES: "179", SO_WHS: "01",
			HOME_STATE: "KL", TAX_IN_STATE: "CG+SG@18", TAX_OUT_STATE: "IGST@18",
			// Step 3 refuses a line weighed more than this % over what was released.
			OVER_PCT: "15",
		},
	},
};

const cfg = loadConfig();
console.log(`\n${apply ? "APPLY" : "DRY RUN"} - LIVE companies${only ? `, ${only} only` : ""}. Adds only; ENABLED stays N.\n`);
let added = 0;
let missing = 0;

for (const key of ["MT", "HT"]) {
	if (only && only !== key) continue;
	const w = want[key];
	const say = (m) => console.log(`${w.db}: ${m}`);
	let s;
	try {
		s = openLiveSetupSession(cfg, w.db);
	} catch (e) {
		say(e.message);
		process.exitCode = 1;
		continue;
	}
	try {
		try {
			await s.login();
		} catch (e) {
			// Not retried, here or by running this again blindly: three wrong passwords lock the user.
			say(`LOGIN REFUSED - ${e.message}`);
			say("Stopped. Check the user name and this company's password in sap.local.json before any second try.");
			process.exitCode = 1;
			break;
		}
		const has = async (table, name) => (await s.get("UserFieldsMD?$select=Name&$filter=" + encodeURIComponent(`TableName eq '${table}' and Name eq '${name}'`))).value.length > 0;
		const add = async (what, path, body) => {
			if (!apply) { say(`WOULD add ${what}`); missing++; return false; }
			await s.request("POST", path, body);
			say(`added ${what}`);
			added++;
			return true;
		};

		let tableThere = (await s.get("UserTablesMD?$select=TableName&$filter=" + encodeURIComponent("TableName eq 'MANNA_IC'"))).value.length > 0;
		if (tableThere) say("table @MANNA_IC is there");
		else tableThere = await add("table @MANNA_IC", "UserTablesMD", { TableName: "MANNA_IC", TableDescription: "Manna inter-company", TableType: "bott_NoObject" });

		if (tableThere) {
			if (await has("@MANNA_IC", "Value")) say("field @MANNA_IC.U_Value is there");
			else await add("field @MANNA_IC.U_Value", "UserFieldsMD", { TableName: "@MANNA_IC", Name: "Value", Description: "Value", Type: "db_Alpha", Size: 100 });
		} else { say("WOULD add field @MANNA_IC.U_Value"); missing++; }

		for (const f of w.fields) {
			if (await has(f.TableName, f.Name)) say(`field ${f.TableName}.U_${f.Name} is there`);
			else await add(`field ${f.TableName}.U_${f.Name}`, "UserFieldsMD", { Type: "db_Alpha", ...f });
		}

		// The rows can only be read once the table and its field exist. A read that fails is NOT an empty table:
		// the Service Layer's workers learn of a new table one by one and some answer "Service Not Found" for a
		// while (4 Nov 2026) - taking that as empty would add every setting a second time.
		if (!tableThere) {
			for (const [code, value] of Object.entries(w.settings)) { say(`WOULD add ${code} = ${value}`); missing++; }
			continue;
		}
		let rows;
		try {
			rows = (await s.get("U_MANNA_IC?$select=Code,U_Value")).value;
		} catch (e) {
			say(`could not read @MANNA_IC yet (${e.message}) - its settings were left alone. Run this again in a minute.`);
			process.exitCode = 1;
			continue;
		}
		const have = Object.fromEntries(rows.map((r) => [r.Code, r.U_Value]));
		for (const [code, value] of Object.entries(w.settings)) {
			if (code in have) say(`${code} = ${have[code]}${have[code] !== value ? `   <- left as it is; this file has ${value}` : ""}`);
			else await add(`${code} = ${value}`, "U_MANNA_IC", { Code: code, Name: code, U_Value: value });
		}
		for (const code of Object.keys(have)) if (!(code in w.settings)) say(`${code} = ${have[code]}   <- a setting this file does not know; left alone`);
	} catch (e) {
		say(`FAILED - ${e.message}`);
		process.exitCode = 1;
	} finally {
		await s.logout();
	}
}

console.log(apply
	? `\n${added} thing(s) added.${process.exitCode ? " Something failed above: read it before running this again." : " Run it once more without --apply: every line should say \"is there\" or show its value."}`
	: `\n${missing} thing(s) to add. Nothing was written. --apply adds them.`);
