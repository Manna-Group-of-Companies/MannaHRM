import { apiCreate, apiDelete, apiWrite, listAll } from "@/api/client";
import { REG_DOCTYPE } from "@/api/load";
import { getState, set } from "@/store";
import { dmy } from "@/lib/format";
import { editPlan } from "@/lib/punchedit";
import { correctionSummary, localStamp, writeCorrection } from "@/features/approvals/decide";

/* The write behind an edited day. What an edit is allowed to be, and why, is
   lib/punchedit.js; this is only what the site hears.

   **Saving changes the time now** (17 September 2026, asked for by HR). It
   raised a request for hr@mannarubber.com to approve from the morning of the
   same day, and HR asked for the time to go in at once instead. So Save writes
   the correction as Approved, decided by whoever saved it, and then the punch —
   through `writeCorrection`, the same function Approve uses, so a saved day and
   an approved one are written identically.

   What that gives up is a second pair of eyes on somebody's wages. What it
   keeps is the trail: the correction, who saved it and when, the reason, the
   punch marked REG-<user>, and the machine's punch set aside rather than
   deleted. */

const REG_FIELDS = ["name", "status", "owner"];

/**
 * Save one edited day's Time In / Time Out: an Approved correction, then the punches.
 *
 * @param {object} emp  the Employee row
 * @param {string} day  `YYYY-MM-DD`
 * @param {{in: string, out: string, reason: string}} next
 * @returns {Promise<{ok: boolean, msg: string}>}
 */
export async function saveDayEdit(emp, day, next) {
	const s = getState();
	const dt = s.regDoctype || REG_DOCTYPE;
	const user = s.user || "";
	/* Optional since 17 September 2026: requiring one kept Save grey with nothing
	   saying why, which HR read as Save not working. Blank still leaves a trail —
	   who changed it is on the correction, and on the punch as REG-<user>. */
	const reason = String(next.reason || "").trim()
		|| `Changed on Attendance Regularization by ${user || "the dashboard"}`;

	let punches;
	let open;
	try {
		[punches, open] = await Promise.all([
			listAll("Employee Checkin",
				["name", "time", "log_type", "skip_auto_attendance"],
				[["employee", "=", emp.name], ["time", ">=", day + " 00:00:00"], ["time", "<=", day + " 23:59:59"]]),
			listAll(dt, REG_FIELDS,
				[["employee", "=", emp.name], ["attendance_date", "=", day], ["status", "in", ["Draft", "Pending Approval"]]]),
		]);
	} catch (e) {
		return { ok: false, msg: `The day could not be read, so nothing was saved (${e.message}).` };
	}

	const plan = editPlan(day, punches, next);
	if (!plan.ok) return { ok: false, msg: plan.why };
	/* A correction carries times, not the absence of one: an empty Punch In reads
	   as "not asked about", so saving it could never remove anything. */
	const cleared = (side) => plan.skip.some((c) => (c.log_type === "OUT") === (side === "OUT"))
		&& !(side === "OUT" ? plan.requestedOut : plan.requestedIn);
	if (cleared("IN") || cleared("OUT")) {
		return { ok: false, msg: "A correction can change a time but not remove one. Removing a punch is done on the desk." };
	}

	const times = {
		requested_in: plan.requestedIn || null,
		requested_out: plan.requestedOut || null,
		reason,
	};
	const decided = { status: "Approved", decided_by: user || null, decided_on: localStamp() };

	/* One correction per person per day. A request still waiting from before
	   Save changed the time directly is the one this saves, rather than leaving
	   it in the queue to be approved a second time on top. */
	const waiting = (open || [])[0];
	let regName;
	if (waiting) {
		const r = await apiWrite(dt, waiting.name, { ...times, ...decided });
		if (!r.ok) return { ok: false, msg: `The site refused to change ${waiting.name}, so nothing was saved: ${r.error}` };
		regName = waiting.name;
	} else {
		try {
			const reg = await apiCreate(dt, {
				employee: emp.name,
				employee_name: emp.employee_name,
				company: emp.company,
				attendance_date: day,
				...times,
				approver_type: "HR",
				...decided,
			});
			regName = (reg && reg.name) || "";
		} catch (e) {
			return { ok: false, msg: `The site refused the correction, so nothing was saved: ${e.message}` };
		}
	}

	const w = await writeCorrection({ employee: emp.name, attendance_date: day, ...times }, user);
	if (!w.ok) {
		/* Approved with its punch missing looks handled and is not. Put back to
		   Pending, where it is listed on this page to be finished, and say so. */
		const back = regName
			? await apiWrite(dt, regName, { status: "Pending Approval", decided_by: null, decided_on: null })
			: { ok: false, error: "the correction has no name" };
		return {
			ok: false,
			msg: `The time was not saved: ${w.error} `
				+ (back.ok
					? `${regName} is left under Waiting for approval to try again.`
					: `${regName || "The correction"} still says Approved (${back.error}) — fix it on the desk.`),
		};
	}

	if (regName) {
		const cur = getState().approvals;
		set({ approvals: { ...cur, attendance: (cur.attendance || []).filter((r) => r.name !== regName) } });
	}

	const said = [plan.requestedIn && `In ${plan.requestedIn.slice(11, 16)}`, plan.requestedOut && `Out ${plan.requestedOut.slice(11, 16)}`]
		.filter(Boolean).join(", ");
	return {
		ok: true,
		msg: `${dmy(day)} saved${said ? ` (${said})` : ""}${regName ? ` — ${regName}` : ""}. ${correctionSummary(w, day)}`,
	};
}

/* ---------------------------------------------------------------------------
   Overtime HR grants for one person and one day — Employee Overtime.

   Since 16 September 2026 this row is the only OT anywhere in the app. One row
   per person per day: the day's existing row is read first and changed rather
   than a second one added (the doctype's controller refuses a second once the
   app is installed; until then this read is what stops a day being paid twice).
   Zero hours removes the row.
   --------------------------------------------------------------------------- */
export async function saveOvertime(emp, day, hours, reason) {
	/* Six places: the OT clock has seconds, and two places is 36 of them. */
	const h = Math.round(Number(hours) * 1e6) / 1e6;
	if (!isFinite(h) || h < 0 || h > 16) return { ok: false, msg: "OT hours must be between 0 and 16." };
	let rows;
	try {
		rows = await listAll("Employee Overtime", ["name", "hours"], [["employee", "=", emp.name], ["ot_date", "=", day]]);
	} catch (e) {
		return { ok: false, msg: `The day's overtime could not be read, so nothing was changed (${e.message}).` };
	}
	const cur = rows[0];
	try {
		if (!h) {
			if (!cur) return { ok: true, msg: "" };
			await apiDelete("Employee Overtime", cur.name);
			return { ok: true, msg: `OT for ${dmy(day)} removed.` };
		}
		const doc = { hours: h, reason: String(reason || "").trim() || null, entered_by: getState().user || null };
		if (cur) {
			const r = await apiWrite("Employee Overtime", cur.name, doc);
			if (!r.ok) return { ok: false, msg: `The site refused the OT change: ${r.error}` };
			return { ok: true, msg: `OT for ${dmy(day)} is now ${h} hrs.` };
		}
		await apiCreate("Employee Overtime", {
			...doc, employee: emp.name, employee_name: emp.employee_name, company: emp.company, ot_date: day,
		});
		return { ok: true, msg: `${h} hrs OT added for ${dmy(day)}.` };
	} catch (e) {
		return { ok: false, msg: `The site refused the OT: ${e.message}` };
	}
}
