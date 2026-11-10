// Make one small, reversible change in a SAP TEST company through the Service Layer, to fire a B1 event for B1if.
//
//     node localdev/sap/sl-touch.mjs bp C-1058            flips the last digit of the customer's mobile number
//     node localdev/sap/sl-touch.mjs bp C-1058 --back     flips it back
//     node localdev/sap/sl-touch.mjs item PMB00101002     adds " " + a dot to the item's foreign name; --back removes it
//
// TEST_MANNA_TREADS only, through sapguard (which refuses any _LIVE company). Prints no phone number in full.
import { loadConfig, SapSession } from "./sapguard.mjs";

const [kind, code] = process.argv.slice(2);
const back = process.argv.includes("--back");
if (!["bp", "item"].includes(kind) || !code) throw new Error("usage: sl-touch.mjs bp|item <code> [--back]");
const s = new SapSession(loadConfig(), "TEST_MANNA_TREADS");
try {
	await s.login();
	if (kind === "bp") {
		const key = `BusinessPartners('${code.replace(/'/g, "''")}')`;
		const bp = await s.get(`${key}?$select=CardCode,CardName,Cellular,CardType`);
		const old = String(bp.Cellular || "");
		const digits = old.replace(/\D/g, "");
		if (digits.length < 6) throw new Error(`${code} has no usable mobile number to flip`);
		const i = old.search(/\d(?=\D*$)/);
		const d = Number(old[i]);
		const next = old.slice(0, i) + String(back ? (d + 9) % 10 : (d + 1) % 10) + old.slice(i + 1);
		await s.request("PATCH", key, { Cellular: next });
		console.log(`${code} ${bp.CardName}: mobile ...${old.slice(-2)} -> ...${next.slice(-2)} (${new Date().toLocaleTimeString()})`);
	} else {
		const key = `Items('${code.replace(/'/g, "''")}')`;
		const it = await s.get(`${key}?$select=ItemCode,ItemName,ForeignName`);
		const old = String(it.ForeignName || "");
		// SAP trims the value, so a blank name plus " ." is stored as "." - take either form off.
		const next = back ? old.replace(/ ?\.$/, "") : old + " .";
		await s.request("PATCH", key, { ForeignName: next });
		console.log(`${code} ${it.ItemName}: foreign name '${old}' -> '${next}' (${new Date().toLocaleTimeString()})`);
	}
} finally {
	await s.logout();
}
