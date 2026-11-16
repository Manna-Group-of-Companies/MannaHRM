// The order flow's switch in the two LIVE companies: @MANNA_IC's ENABLED row, which every B1if step reads before it
// writes anything (SALES_DASHBOARD/sap-b1if). Built 13 Nov 2026 at the user's word, so the flow can be switched on
// for the go-live, and off in an emergency, without opening SAP.
//
//     node localdev/sap/b1if-enable-live.mjs                  read only: ENABLED in both companies
//     node localdev/sap/b1if-enable-live.mjs --on             Hi-Tech, then Manna Treads, to Y; read back
//     node localdev/sap/b1if-enable-live.mjs --off            Manna Treads, then Hi-Tech, to N; read back
//     ... --only MT | HT                                      one company
//
// On: HI-TECH FIRST. Manna Treads' step makes the purchase order and, in the same run, Hi-Tech's sales order; with
// Manna on and Hi-Tech off, the purchase order is made, Hi-Tech's order is skipped, and nothing retries it.
// Off: MANNA TREADS FIRST, so no new purchase order is made from the first moment.
//
// The guard lets the live set-up change this one row to Y or N and nothing else (sapguard.mjs, liveSetupAllows).
// The login is `live_setup` in sap.local.json. A login SAP refuses is reported and never tried again: SAP locks a
// user after three wrong passwords. A company whose row is missing is reported, not created - that is
// b1if-setup-live.mjs's job.

import { loadConfig, openLiveSetupSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const on = args.includes("--on");
const off = args.includes("--off");
if (on && off) throw new Error("--on or --off, not both");
const want = on ? "Y" : off ? "N" : "";
const oi = args.indexOf("--only");
const only = oi >= 0 ? String(args[oi + 1] || "").toUpperCase() : "";
if (oi >= 0 && !["MT", "HT"].includes(only)) throw new Error("--only takes MT (Manna Treads) or HT (Hi-Tech)");
const NAME = { MT: "MANNA_TREADS_LIVE", HT: "HITECH_PRETREADS_LIVE" };
const DBS = (on ? ["HT", "MT"] : ["MT", "HT"]).filter((k) => !only || k === only).map((k) => NAME[k]);

const cfg = loadConfig();
console.log(`\n${want ? `SETTING ENABLED = ${want}` : "READ ONLY"} - live companies\n`);

for (const db of DBS) {
	const say = (m) => console.log(`${db}: ${m}`);
	let s;
	try { s = openLiveSetupSession(cfg, db); } catch (e) { say(e.message); process.exitCode = 1; break; }
	try {
		try { await s.login(); } catch (e) {
			say(`LOGIN REFUSED - ${e.message}`);
			say("Stopped, nothing changed here or after. Check the login in sap.local.json before any second try.");
			process.exitCode = 1;
			break;
		}
		// The Service Layer's workers learn of a user table one by one; one may answer "Service Not Found" where
		// another reads it (4 and 13 Nov 2026), and the list form with $select is the one that has always worked.
		// A new login lands on another worker. Only "Service Not Found" is retried: SAP answered without doing
		// anything, so a retried PATCH of the same value is the same request, not a second change.
		// A new session object, not just a new login: the old one's kept-alive connection carried every retry back to
		// the same worker (13 Nov 2026, eight refusals in a row on Hi-Tech).
		const retrying = async (fn) => {
			for (let a = 1; ; a++) {
				try { return await fn(); } catch (e) {
					if (a >= 8 || !/Service Not Found/i.test(e.message)) throw e;
					await s.logout();
					s.agent.destroy();
					await new Promise((r) => setTimeout(r, 1500));
					s = openLiveSetupSession(cfg, db);
					await s.login();
				}
			}
		};
		// The exact read b1if-setup-live.mjs made on both companies on 13 Nov; the row is picked here.
		const readSwitch = () => retrying(async () => {
			const row = (await s.get("U_MANNA_IC?$select=Code,U_Value")).value.find((r) => r.Code === "ENABLED");
			return row ? row.U_Value : null;
		});
		const was = await readSwitch();
		if (was === null) { say("no ENABLED row in @MANNA_IC - nothing changed (run b1if-setup-live.mjs first)"); process.exitCode = 1; break; }
		if (!want) { say(`ENABLED = ${was}`); continue; }
		if (was === want) { say(`ENABLED = ${was} already`); continue; }
		await retrying(() => s.request("PATCH", "U_MANNA_IC('ENABLED')", { U_Value: want }));
		const now = await readSwitch();
		say(`ENABLED ${was} -> ${now}${now === want ? "" : "   NOT WHAT WAS SET - look at it in SAP"}`);
		if (now !== want) { process.exitCode = 1; break; }
	} catch (e) {
		say(`FAILED - ${e.message}`);
		say("Stopped here; a company after this one was not touched.");
		process.exitCode = 1;
		break;
	} finally {
		await s.logout();
	}
}
if (want && !process.exitCode) console.log(`\nBoth companies read back ENABLED = ${want}. B1if reads it on its next message - no restart.`);
