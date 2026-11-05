// What the B1if inter-company scenario (SALES_DASHBOARD/sap-b1if) needs in the two SAP test companies.
//
//     node localdev/sap/b1if-setup.mjs                  what is there and what would be added
//     node localdev/sap/b1if-setup.mjs --apply          adds what is missing, with ENABLED = N
//     node localdev/sap/b1if-setup.mjs --apply --enable  ...and switches the scenario on (ENABLED = Y)
//
// Manna Treads: user table @MANNA_IC (Code = setting, U_Value) and OPOR.U_MannaMtSo, the sales order's DocEntry.
// Hi-Tech:      user table @MANNA_IC and ORDR.U_MannaMtPo, the purchase order's DocEntry.
//
// A setting already in @MANNA_IC is never overwritten - somebody may have changed it on purpose - except
// ENABLED by --enable. Test companies only, through sapguard; the live companies get the same by hand, from
// sap-b1if/README.md. A new field is only seen by a SAP client that logs in again after it.

import { loadConfig, SapSession } from "./sapguard.mjs";

const MT = "TEST_MANNA_TREADS";
const HT = "TEST_HITECH_PRETREADS";
const apply = process.argv.includes("--apply");
const enable = process.argv.includes("--enable");
const today = new Date().toLocaleDateString("en-CA");

// The values the sync uses for the same documents (run-order-sync.mjs, order_flow defaults), read off the
// test companies on 4 Nov 2026: S-1010 and 10118 are both billed in KL; PASS P's POs are series 199 branch 1,
// PASS H's orders series 179.
const want = {
	[MT]: {
		fields: [{ TableName: "OPOR", Name: "MannaMtSo", Description: "Manna Treads SO DocEntry (B1if)", Size: 11 }],
		settings: {
			ENABLED: "N", START_DATE: today, MARGIN: "20", VENDOR: "S-1010",
			PO_SERIES: "199", PO_BRANCH: "1", PO_WHS: "01", PO_LOCATION: "2",
			HOME_STATE: "KL", TAX_IN_STATE: "CG+SG@18", TAX_OUT_STATE: "IGST@18", ERP_PREFIX: "SAL-ORD-",
			// Stage 4 (5 Nov 2026), step 3's delivery: Manna Treads had no delivery series of its own, so KL-DN
			// (Kerala, FY26-27) was added on TEST as series 211. Live needs one made in Administration first.
			DN_SERIES: "211",
		},
	},
	[HT]: {
		fields: [
			{ TableName: "ORDR", Name: "MannaMtPo", Description: "Manna Treads PO DocEntry (B1if)", Size: 11 },
			// The number on Manna Treads' sales order, for people to search Hi-Tech's orders by.
			{ TableName: "ORDR", Name: "MannaMtSoNo", Description: "Manna Treads SO No.", Size: 20 },
		],
		settings: {
			ENABLED: "N", CUSTOMER: "10118", SO_SERIES: "179", SO_WHS: "07",
			HOME_STATE: "KL", TAX_IN_STATE: "CG+SG@18", TAX_OUT_STATE: "IGST@18",
		},
	},
};

const cfg = loadConfig();
console.log(`\n${apply ? "APPLY" : "DRY RUN"}${enable ? " + ENABLE" : ""}\n`);

for (const db of [MT, HT]) {
	const w = want[db];
	const s = new SapSession(cfg, db);
	try {
		await s.login();
		const say = (m) => console.log(`${db}: ${m}`);

		const tables = (await s.get("UserTablesMD?$select=TableName&$filter=" + encodeURIComponent("TableName eq 'MANNA_IC'"))).value;
		if (tables.length) say("table @MANNA_IC is there");
		else if (!apply) say("WOULD add table @MANNA_IC");
		else { await s.request("POST", "UserTablesMD", { TableName: "MANNA_IC", TableDescription: "Manna inter-company", TableType: "bott_NoObject" }); say("added table @MANNA_IC"); }

		const valueField = (await s.get("UserFieldsMD?$select=Name&$filter=" + encodeURIComponent("TableName eq '@MANNA_IC' and Name eq 'Value'"))).value;
		if (valueField.length) say("field @MANNA_IC.U_Value is there");
		else if (!apply) say("WOULD add field @MANNA_IC.U_Value");
		else { await s.request("POST", "UserFieldsMD", { TableName: "@MANNA_IC", Name: "Value", Description: "Value", Type: "db_Alpha", Size: 100 }); say("added field @MANNA_IC.U_Value"); }

		for (const f of w.fields) {
			const link = (await s.get("UserFieldsMD?$select=Name&$filter=" + encodeURIComponent(`TableName eq '${f.TableName}' and Name eq '${f.Name}'`))).value;
			if (link.length) say(`field ${f.TableName}.U_${f.Name} is there`);
			else if (!apply) say(`WOULD add field ${f.TableName}.U_${f.Name}`);
			else { await s.request("POST", "UserFieldsMD", { ...f, Type: "db_Alpha" }); say(`added field ${f.TableName}.U_${f.Name}`); }
		}

		// Rows can only be read once the table exists. A read that fails is not an empty table: the Service
		// Layer's workers learn of a new table one by one, and some answer "Service Not Found" for a while
		// (4 Nov 2026) - taking that as empty would try to add every setting again.
		let have = {};
		if (tables.length) {
			let rows;
			try { rows = (await s.get("U_MANNA_IC?$select=Code,U_Value&$top=100")).value; }
			catch (e) { say(`could not read @MANNA_IC (${e.message}) - settings left alone; run this again`); continue; }
			have = Object.fromEntries(rows.map((r) => [r.Code, r.U_Value]));
		} else if (!apply) {
			for (const [code, value] of Object.entries(w.settings)) say(`WOULD add ${code} = ${code === "ENABLED" && enable ? "Y" : value}`);
			continue;
		}
		for (const [code, value] of Object.entries(w.settings)) {
			const v = code === "ENABLED" && enable ? "Y" : value;
			if (code in have) {
				if (code === "ENABLED" && enable && have[code] !== "Y") {
					if (apply) { await s.request("PATCH", `U_MANNA_IC('${code}')`, { U_Value: "Y" }); say("ENABLED set to Y"); }
					else say("WOULD set ENABLED to Y");
				} else say(`${code} = ${have[code]}${have[code] !== v ? `  (left as it is; the default is ${v})` : ""}`);
			} else if (!apply) say(`WOULD add ${code} = ${v}`);
			else { await s.request("POST", "U_MANNA_IC", { Code: code, Name: code, U_Value: v }); say(`added ${code} = ${v}`); }
		}
	} catch (e) {
		console.log(`${db}: FAILED - ${e.message}`);
		process.exitCode = 1;
	} finally {
		await s.logout();
	}
}
