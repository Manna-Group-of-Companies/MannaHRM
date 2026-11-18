import { apiCreate, apiWrite, listAll } from "@/api/client";
import { getState } from "@/store";
import { dmy, nowStamp } from "@/lib/format";
import { OT_APPROVED, OT_REJECTED } from "@/lib/overtime";

/* ---------------------------------------------------------------------------
   Deciding one day's overtime — approving it (at the punches' figure or one
   somebody typed) or rejecting it. Asked for 18 November 2026; the rule is in
   lib/overtime.js.

   One Employee Overtime row per person per day, as before: the day's row is
   read first and changed rather than a second one added, because the
   doctype's controller is not running on the site (it is a custom doctype
   until manna_hr is installed) and two rows would pay the day twice.

   **A rejection is a row with 0 hours, not a missing row.** Deleting it would
   bring the punches' figure straight back as pending, and the same day would
   be asked about again tomorrow. And 0 hours is the half that is safe on a
   site that has not got the `status` field yet: there the row reads as an
   approved 0, which pays nothing either way.
   --------------------------------------------------------------------------- */

/**
 * @param {object} emp   the Employee row
 * @param {string} day   `YYYY-MM-DD`
 * @param {object} d
 * @param {number} d.minutes  OT to approve; 0 rejects
 * @param {number} [d.autoMin] what the punches earned, kept beside it
 * @param {string} [d.reason]
 * @returns {Promise<{ok: boolean, msg: string, row?: object}>}
 */
export async function decideOvertime(emp, day, { minutes, autoMin = 0, reason = "" }) {
	const mins = Math.round(Number(minutes));
	if (!isFinite(mins) || mins < 0 || mins > 16 * 60) return { ok: false, msg: "OT must be between 0 and 16 hours." };
	let rows;
	try {
		rows = await listAll("Employee Overtime", ["name"], [["employee", "=", emp.name], ["ot_date", "=", day]]);
	} catch (e) {
		return { ok: false, msg: `The day's overtime could not be read, so nothing was changed (${e.message}).` };
	}
	const cur = rows[0];
	const user = getState().user || null;
	/* Six places, as the field has: a clock's seconds survive. */
	const hours = (m) => Math.round((m / 60) * 1e6) / 1e6;
	const doc = {
		hours: hours(mins),
		status: mins ? OT_APPROVED : OT_REJECTED,
		auto_hours: hours(Math.max(0, Number(autoMin) || 0)),
		approved_by: user,
		approved_on: nowStamp() + ":00",
		entered_by: user,
		reason: String(reason || "").trim() || null,
	};
	const said = mins ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")} OT approved` : "OT rejected";
	try {
		if (cur) {
			const r = await apiWrite("Employee Overtime", cur.name, doc);
			if (!r.ok) return { ok: false, msg: `The site refused the OT change: ${r.error}` };
			return { ok: true, msg: `${emp.employee_name || emp.name}, ${dmy(day)}: ${said}.`, row: { ...doc, name: cur.name, employee: emp.name, ot_date: day } };
		}
		const made = await apiCreate("Employee Overtime", {
			...doc, employee: emp.name, employee_name: emp.employee_name, company: emp.company, ot_date: day,
		});
		return { ok: true, msg: `${emp.employee_name || emp.name}, ${dmy(day)}: ${said}.`, row: { ...doc, ...made, employee: emp.name, ot_date: day } };
	} catch (e) {
		return { ok: false, msg: `The site refused the OT: ${e.message}` };
	}
}
