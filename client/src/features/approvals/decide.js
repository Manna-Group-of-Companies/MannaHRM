import { apiCreate, apiWrite, listAll } from "@/api/client";
import { load, REG_DOCTYPE } from "@/api/load";
import { getState } from "@/store";
import { dmy } from "@/lib/format";

/* ---------------------------------------------------------------------------
   Deciding one time correction — the tick and the cross on a card.

   **Approving writes the missing punch, never `Attendance`.** Attendance is
   generated from `Employee Checkin` by the shift job; a hand-written row is
   invisible to the thing that would have created it (CLAUDE.md §5). So an
   approval here is two writes: the request's status, then the punches.

   ## Why the site goes first

   The status is written before any punch, because the status write is where
   the site gets its say. Frappe checks the person's roles on it, and — once
   `manna_hr` is installed — the approval workflow's routing and self-approval
   rules, and `regularization.on_update` writes the punches itself, in the same
   transaction. Writing punches first would put a refused approval's punches on
   the record anyway, which is the client deciding.

   ## Why this page then writes whatever the site did not

   Today the site keeps this doctype as `custom: 1`, and a custom doctype's
   controller does not run (CLAUDE.md §7). Approving there flips the status and
   nothing else: a request that says Approved, on a day that is still missing
   its punch, is the worst of the three outcomes because it looks handled. So
   after the status, the day's punches are read back and any requested one the
   site does not hold is written from here — as the approver, under the
   approver's own permission on `Employee Checkin`.

   On a site where the hook did run, that read finds its punches and nothing is
   written twice. The read is the same check that makes a retry safe.

   ## If a punch is refused

   The status goes back to Pending Approval, so the request stays in the queue
   rather than leaving it half done. A punch that did land stays — a punch is
   evidence and this app never deletes one — and the next attempt finds it and
   skips it.
   --------------------------------------------------------------------------- */

export const OPEN = "Pending Approval";
export const APPROVED = "Approved";
export const REJECTED = "Rejected";

/** `device_id` on a punch written for a correction. The prefix is what
    `checkin.py` reads to call it a regularization — not geofenced and not
    stamped with the server's clock, because recording a time other than now is
    the point of it. The same spelling `regularization.apply` uses. */
export const regDevice = (user) => "REG-" + (user || "dashboard");

/**
 * A requested time as the datetime a punch carries.
 *
 * The doctype's two fields are Datetimes, but a row can come back as a bare
 * clock time — `"16:10:00"` — and that is pinned to the day the request is
 * about. Cut to the second, because Frappe may add microseconds and an exact
 * match against an existing punch is how a retry avoids writing it twice.
 */
export function punchTime(day, v) {
	const s = String(v == null ? "" : v).trim();
	if (!s) return "";
	const bare = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
	if (bare) return `${day} ${bare[1].padStart(2, "0")}:${bare[2]}:${bare[3] || "00"}`;
	return s.replace("T", " ").slice(0, 19);
}

/** The punches an approval of `r` records, in order. */
export function punchesFor(r) {
	const day = String(r.attendance_date || "").slice(0, 10);
	return [["IN", r.requested_in], ["OUT", r.requested_out]]
		.map(([log_type, v]) => ({ log_type, time: punchTime(day, v) }))
		.filter((p) => p.time);
}

/** The punches still to write, given what the site already holds.
    Matched on the second alone: two punches for one person at the same second
    add nothing to how a day pairs, and a retry of this page's own write is the
    case this exists for. */
export function missingPunches(wanted, existing) {
	const have = new Set((existing || []).map((c) => String(c.time || "").slice(0, 19)));
	return wanted.filter((p) => !have.has(p.time));
}

/**
 * Why the signed-in person may not decide this one, or "".
 *
 * Both halves of the workflow's rule, said here so the refusal is a sentence
 * rather than a Frappe error — the site still checks, once it can. Raising a
 * request and deciding it is one person agreeing with themselves; so is
 * deciding a request about your own attendance, whoever raised it.
 */
export function notYours(r, user, myEmployee) {
	if (!user) return "";
	if (r.owner && r.owner === user) {
		return "You raised this correction, so deciding it is somebody else's job.";
	}
	if (myEmployee && myEmployee === r.employee) {
		return "This is your own attendance. It goes to HR, not to you.";
	}
	return "";
}

/** Now, as the site writes a datetime — `YYYY-MM-DD HH:MM:SS` on the browser's
    own clock. Local rather than ISO: the site stores naive times in its own
    zone, Asia/Kolkata, and an ISO string would land five and a half hours out. */
export function localStamp(d = new Date()) {
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
		+ `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const said = (p) => `${p.log_type} ${p.time.slice(11, 16)}`;

/**
 * Approve or reject one correction, and read the queue back.
 *
 * @param {object} r the request as the queue holds it
 * @param {"Approve"|"Reject"} action
 * @param {string} [note] the decision note, shown back to the employee
 * @returns {Promise<{ok: boolean, msg: string, persisted: boolean}>}
 */
export async function decideCorrection(r, action, note) {
	const s = getState();
	const dt = s.regDoctype || REG_DOCTYPE;
	const user = s.user || "";
	const approve = action === "Approve";
	const verb = approve ? "approve" : "reject";
	const fail = (msg, persisted = false) => ({ ok: false, msg, persisted });

	if (!r || !r.name) return fail("This request has no document behind it, so there is nothing to decide.");
	if (r.status !== OPEN) return fail(`${r.name} is ${r.status || "not open"} — only a pending request is decided.`);

	const wanted = punchesFor(r);
	if (approve && !wanted.length) {
		return fail(`${r.name} has neither a punch-in nor a punch-out time, so approving it would record nothing.`);
	}

	/* A failed lookup lets the decision through rather than blocking every
	   approver on a read — the site's own permissions still stand behind it. */
	const mine = user
		? await listAll("Employee", ["name"], [["user_id", "=", user]])
			.then((rows) => (rows && rows[0] ? rows[0].name : ""))
			.catch(() => "")
		: "";
	const why = notYours(r, user, mine);
	if (why) return fail(why);

	const res = await apiWrite(dt, r.name, {
		status: approve ? APPROVED : REJECTED,
		decided_by: user || null,
		decided_on: localStamp(),
		decision_note: String(note || "").trim() || null,
	});
	if (!res.ok) return fail(`The site refused to ${verb} ${r.name}: ${res.error || "no reason given"}.`);

	if (!approve) {
		await load();
		return { ok: true, persisted: true, msg: `${r.name} rejected. Nothing was written to attendance.` };
	}

	const day = String(r.attendance_date || "").slice(0, 10);
	const undo = async (why) => {
		const back = await apiWrite(dt, r.name, { status: OPEN, decided_by: null, decided_on: null });
		await load();
		return fail(back.ok
			? `${r.name} is back to Pending Approval: ${why}`
			: `${r.name} is marked Approved but its punches are not all written, and putting it back to `
				+ `Pending failed too (${back.error}). ${why} HR has to finish this one on the desk.`,
		back.ok ? false : true);
	};

	let existing;
	try {
		existing = await listAll("Employee Checkin", ["name", "time", "log_type"],
			[["employee", "=", r.employee], ["time", "in", wanted.map((p) => p.time)]]);
	} catch (e) {
		return undo(`the day's punches could not be read, so writing them could have doubled one (${e.message}).`);
	}

	const todo = missingPunches(wanted, existing);
	const made = [];
	for (const p of todo) {
		try {
			await apiCreate("Employee Checkin", {
				employee: r.employee,
				time: p.time,
				log_type: p.log_type,
				device_id: regDevice(user),
				// The shift job must see these. An approved punch it skips changes nothing.
				skip_auto_attendance: 0,
			});
			made.push(p);
		} catch (e) {
			return undo(`the site refused the ${said(p)} punch (${e.message}).`
				+ (made.length ? ` ${made.map(said).join(", ")} did land and will be skipped next time.` : ""));
		}
	}

	/* `hrms` will not rebuild a day it has already marked — it returns quietly
	   when a row exists. Cancelling it is `regularization.py`'s job, on the
	   server; this page never writes Attendance, so it says so instead. */
	const marked = await listAll("Attendance", ["name", "status"],
		[["employee", "=", r.employee], ["attendance_date", "=", day], ["docstatus", "=", 1]])
		.catch(() => []);

	await load();

	const kept = wanted.filter((p) => !made.includes(p));
	return {
		ok: true,
		persisted: true,
		msg: `${r.name} approved. `
			+ (made.length ? `Punches written for ${dmy(day)}: ${made.map(said).join(", ")}. ` : "")
			+ (kept.length ? `Already on the site: ${kept.map(said).join(", ")}. ` : "")
			+ (marked.length
				? `${marked[0].name} already marks the day ${marked[0].status || "decided"}, and the shift job `
					+ "will not rebuild it until that row is cancelled on the desk."
				: "Attendance for the day is built from these when the shift job next runs."),
	};
}
