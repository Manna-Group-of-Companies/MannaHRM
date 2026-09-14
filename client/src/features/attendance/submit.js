import { listAll } from "@/api/client";
import { cancel, create, remove, submit } from "@/api/crud";
import { MON } from "@/lib/format";

/* ---------------------------------------------------------------------------
   Submit Attendance — closing one company's month.

   **The site decides all of it.** Submitting an `Attendance Submission` is the
   freeze, and what makes it one is `manna_hr/freeze.py`: from then on the site
   refuses any Attendance, approved leave or approved correction that would
   change a day in that month. The controller refuses the submit itself while
   the month has not ended, has no attendance, or still has a correction or a
   leave waiting — and refuses to reopen it once salary has been paid from it.

   What is here is the same arithmetic in the same words, so the page can say
   *before* the click what the site will say after it (CLAUDE.md §1). Each rule
   below has its twin in `manna_hr/rules.py`, and the sentences match so that
   the page and the site's refusal read as one voice.
   --------------------------------------------------------------------------- */

export const DOCTYPE = "Attendance Submission";

export const SUB_FIELDS = [
	"name", "company", "period", "from_date", "to_date", "docstatus", "attendance_rows",
	"employee_count", "submitted_by", "submitted_on", "reopened_by", "reopened_on", "remarks",
];

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The month before the one `today` is in — the month a close is normally for.
    The current month cannot be submitted until it has ended, so opening the
    picker on it would open on a refusal. */
export function lastMonth(today) {
	const [y, m] = String(today).slice(0, 7).split("-").map(Number);
	return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** `YYYY-MM` → `[first, last]` as `YYYY-MM-DD`, or null. The real last day. */
export function periodBounds(ym) {
	const m = PERIOD.exec(String(ym || ""));
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]);
	/* Day 0 of the next month is the last of this one — built from parts, never
	   through `toISOString`, which at UTC+5:30 lands on the day before. */
	const last = new Date(y, mo, 0).getDate();
	return [`${m[1]}-${m[2]}-01`, `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`];
}

/** `2026-08` → `Aug-26`, Factor HR's spelling. */
export function periodLabel(ym) {
	const b = periodBounds(ym);
	return b ? `${MON[Number(ym.slice(5, 7)) - 1]}-${ym.slice(2, 4)}` : String(ym || "");
}

/** Why the site will refuse this month today, or "". `rules.period_problem`. */
export function periodProblem(ym, today) {
	const b = periodBounds(ym);
	if (!b) return "The period has to be a month, written YYYY-MM — 2026-08 for August 2026.";
	if (String(today).slice(0, 10) <= b[1]) {
		return `${periodLabel(ym)} has not ended yet — its last day is ${b[1]}. A month is submitted `
			+ "once every day in it has been worked; submitting it now would freeze the days still to "
			+ "come as days nobody attended.";
	}
	return "";
}

/** Frappe's docstatus, as the word the list prints. */
export const stateOf = (doc) => ["Draft", "Submitted", "Cancelled"][Number(doc && doc.docstatus) || 0];

/** The live submission for a company's month, if there is one — a draft counts,
    exactly as `freeze.refuse_a_second` counts it. */
export const liveFor = (rows, company, ym) =>
	(rows || []).find((r) => r.company === company && r.period === ym && Number(r.docstatus) < 2) || null;

/** hrms's Attendance statuses, each counted under its own figure. */
export const COUNTED = [
	["Present", "present"], ["Half Day", "half_day"], ["Absent", "absent"],
	["On Leave", "on_leave"], ["Work From Home", "work_from_home"],
];
const KEY = Object.fromEntries(COUNTED);

const zero = () => ({ rows: 0, present: 0, half_day: 0, absent: 0, on_leave: 0, work_from_home: 0, other: 0 });

/** A month's Attendance counted per person and in total. `rules.attendance_summary`,
    with the per-person split the preview needs. An unknown status is `other`,
    never dropped — a total that omits rows does not add up. */
export function summarise(rows) {
	const byEmp = {};
	const total = zero();
	for (const r of rows || []) {
		const k = KEY[r.status] || "other";
		const e = byEmp[r.employee] || (byEmp[r.employee] = zero());
		e.rows++; e[k]++;
		total.rows++; total[k]++;
	}
	total.employees = Object.keys(byEmp).length;
	return { byEmp, total };
}

/** Why the site will refuse to freeze this month. `rules.submission_blockers`. */
export function blockers(rows, corrections, leave) {
	const out = [];
	if (!(Number(rows) > 0)) {
		out.push("No attendance has been generated for this month. Submitting it would freeze a month "
			+ "of nothing and hand it to payroll as fact.");
	}
	const c = Number(corrections) || 0;
	if (c) {
		out.push(`${c} attendance correction${c === 1 ? "" : "s"} for this month ${c === 1 ? "is" : "are"} `
			+ "still open — waiting for a decision, or approved and not yet rebuilt. Each one changes a "
			+ "day; settle them first.");
	}
	const l = Number(leave) || 0;
	if (l) {
		const it = l === 1 ? "it" : "them";
		out.push(`${l} leave application${l === 1 ? "" : "s"} touching this month ${l === 1 ? "is" : "are"} `
			+ `still Open. Once the month is frozen nobody could approve ${it}, so decide ${it} first.`);
	}
	return out;
}

/** Whether a date range overlaps a month. Strings, compared as strings — every
    date on this site is one (client/README.md). */
export const overlaps = (from, to, [first, last]) =>
	String(from || "") <= last && String(to || from || "") >= first;

/* ------------------------------------------------------------------ the site */

/** Every submission this reader may see. Throws, so the page can tell "none
    yet" from "the site has not got the doctype" — until the app is installed it
    has not, and those are opposite findings. */
export const readSubmissions = () => listAll(DOCTYPE, SUB_FIELDS);

/** Whether a refused read means the doctype is not on the site at all. */
export const isAbsent = (e) =>
	e?.status === 404 || /not found|does not exist|DoesNotExistError/i.test(String(e?.message || ""));

/**
 * One company's month as it stands — the rows Preview Data draws and the three
 * counts the site will check. Never throws: each read carries its own failure,
 * because "nobody was marked" and "the rows could not be read" are opposite
 * findings on a screen about pay.
 */
export async function readMonth(company, ym, regDoctype) {
	const b = periodBounds(ym);
	if (!b || !company) return { rows: [], corrections: null, leave: null, err: "" };
	const [first, last] = b;
	const [rows, corrections, leave] = await Promise.all([
		listAll("Attendance", ["name", "employee", "employee_name", "attendance_date", "status"],
			[["company", "=", company], ["docstatus", "=", 1],
				["attendance_date", ">=", first], ["attendance_date", "<=", last]], 1000).catch(() => null),
		/* Pending and Approved both count, exactly as the controller counts them:
		   an approved correction has written its punches and not yet had its day
		   rebuilt, so the figure about to be frozen is still the old one. */
		listAll(regDoctype || "Employee Attendance Regularization", ["name"],
			[["company", "=", company], ["status", "in", ["Pending Approval", "Approved"]],
				["attendance_date", ">=", first], ["attendance_date", "<=", last]]).catch(() => null),
		listAll("Leave Application", ["name"],
			[["company", "=", company], ["status", "=", "Open"], ["docstatus", "<", 2],
				["from_date", "<=", last], ["to_date", ">=", first]]).catch(() => null),
	]);
	const refused = [rows === null && "attendance", corrections === null && "corrections",
		leave === null && "leave"].filter(Boolean);
	return {
		rows: rows || [],
		corrections: corrections === null ? null : corrections.length,
		leave: leave === null ? null : leave.length,
		read: rows !== null,
		err: refused.length ? `The site would not answer for ${refused.join(", ")}.` : "",
	};
}

/**
 * Close a month: make the submission, then submit it.
 *
 * Two steps because that is Frappe's shape — a document is saved and then
 * submitted — and the second is where the controller's checks run. If the
 * second is refused the first is kept, as a draft the list can submit again
 * once whatever was open has been settled; saying so is the caller's job.
 */
export async function closeMonth({ company, period, remarks }) {
	const made = await create(DOCTYPE, { company, period, remarks: remarks || undefined });
	if (!made.ok) return { ok: false, stage: "create", error: made.error };
	const done = await submit(DOCTYPE, made.name);
	if (!done.ok) return { ok: false, stage: "submit", name: made.name, error: done.error };
	return { ok: true, name: made.name };
}

export const submitDraft = (name) => submit(DOCTYPE, name);
export const reopenMonth = (name) => cancel(DOCTYPE, name);
export const discardDraft = (name) => remove(DOCTYPE, name);
