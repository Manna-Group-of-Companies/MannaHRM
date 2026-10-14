/* What the wages register is made from besides the slips: who each person is,
   what Attendance says of each day, and the company's weekly offs and holidays.
   Read only. lib/register.js says what goes where.

   Before there are slips, the preview (lib/registerpreview.js) reads the rest of
   what its formulas need from the site's own documents: shifts, the overtime HR
   entered, the Casual Leave ledger, the month's advances and loan instalments.
   Still read only — nothing here writes, and nothing here works out pay. */

import { getDoc, listAll } from "@/api/client";
import { OT_FIELDS } from "@/api/attendance";
import { loadLoansDue } from "@/api/salarysheet";
import { LEAVE_TYPE_NAME } from "@/lib/monthlyleave";
import { fillFromPunches } from "@/lib/register";
import { byMachine } from "@/lib/direction";
import { dayAfter } from "@/lib/roster";

const PERSON_WIDE = ["name", "employee_name", "status", "gender", "date_of_joining", "employee_number", "branch",
	"salary_mode", "employment_type", "department", "designation"];
const PERSON_NARROW = ["name", "employee_name", "status", "gender", "date_of_joining", "branch"];

/** A wide read, and a narrower one if the site has not got a field — the same
    fall-back api/payroll.js makes, since a missing field fails the whole read. */
async function listSome(label, wide, narrow, filters) {
	try {
		return await listAll(label, wide, filters, 500);
	} catch (e) {
		if (e.status === 403) throw e;
		return listAll(label, narrow, filters, 500);
	}
}

/** The Employee rows of a company, by id. */
async function readPeople(company) {
	/* `*` first, so a custom field the site may or may not have — the bank share
	   below all — arrives when it is there without failing the read when it is
	   not; the named list is for a login refused the wide read. */
	const co = company ? [["company", "=", company]] : [];
	const rows = await listSome("Employee", ["*"], PERSON_WIDE, co).catch((e) => {
		if (e.status === 403) throw e;
		return listAll("Employee", PERSON_NARROW, co, 500);
	});
	return new Map(rows.map((r) => [r.name, r]));
}

/** Each person's Attendance for the month: employee → { day of month: status }. */
async function readAttendance(company, start, end) {
	const co = company ? [["company", "=", company]] : [];
	const rows = await listAll("Attendance", ["employee", "attendance_date", "status"],
		[["attendance_date", ">=", start], ["attendance_date", "<=", end], ["docstatus", "<", 2], ...co], 500);
	const out = new Map();
	for (const r of rows) {
		const marks = out.get(r.employee) || {};
		marks[Number(String(r.attendance_date).slice(8, 10))] = r.status;
		out.set(r.employee, marks);
	}
	return out;
}

/** The month's punches of these people, through the morning after the month
    ends (a night shift's leaving), each machine's direction settled as the
    attendance screens settle it. A few people at a time: an `in` list of a
    whole company is too long for one address. */
async function readPunches(ids, start, end) {
	const out = [];
	const list = [...ids];
	for (let i = 0; i < list.length; i += 120) {
		const filters = [["employee", "in", list.slice(i, i + 120)], ["time", ">=", `${start} 00:00:00`], ["time", "<=", `${dayAfter(end)} 11:59:59`]];
		out.push(...await listAll("Employee Checkin", ["name", "employee", "time", "log_type", "device_id"], filters, 1000)
			.catch(() => listAll("Employee Checkin", ["name", "employee", "time", "log_type"], filters, 1000)));
	}
	return byMachine(out);
}

/** The days punches filled, as a sentence for the page. */
const filledSaid = (n) => `${n} day${n === 1 ? "" : "s"} had no Attendance in Frappe and ${n === 1 ? "was" : "were"} taken from the punches.`;

/** The company's Holiday List, as the days of the month that are a weekly off and
    the days that are a holiday. Sundays are the register's own business. */
async function readCalendar(company, ym) {
	const none = { off: new Set(), holiday: new Set() };
	if (!company) return none;
	const co = await getDoc("Company", company);
	const list = co && co.default_holiday_list;
	if (!list) return none;
	const doc = await getDoc("Holiday List", list);
	const out = { off: new Set(), holiday: new Set() };
	for (const h of (doc && doc.holidays) || []) {
		const d = String(h.holiday_date || "");
		if (d.slice(0, 7) !== ym) continue;
		(Number(h.weekly_off) ? out.off : out.holiday).add(Number(d.slice(8, 10)));
	}
	return out;
}

/**
 * Everything the register needs from the site. Each read stands alone: one that
 * fails leaves the others, and says so in `warnings` rather than failing the
 * whole register — a register with the pay and no days is still worth having,
 * provided it says the days are missing.
 *
 * @returns {Promise<{people:Map, attendance:Map, calendar:{off:Set,holiday:Set}, warnings:string[]}>}
 */
export async function loadRegisterReads(company, ym, start, end) {
	const warnings = [];
	const safe = async (what, run, fallback) => {
		try {
			return await run();
		} catch (e) {
			warnings.push(`${what} could not be read (${e.status === 403 ? "this login may not read it" : e.message || e}).`);
			return fallback;
		}
	};
	const [people, attendance, calendar, ledger] = await Promise.all([
		safe("The people's details", () => readPeople(company), new Map()),
		safe("Attendance", () => readAttendance(company, start, end), new Map()),
		safe("The holiday list", () => readCalendar(company, ym), { off: new Set(), holiday: new Set() }),
		/* The Casual Leave columns, as the preview fills them (loadPreviewReads). */
		safe("The Casual Leave ledger", () => listSome("Leave Ledger Entry", LEDGER_WIDE, LEDGER_NARROW,
			[["leave_type", "=", LEAVE_TYPE_NAME], ["docstatus", "=", 1], ["from_date", "<=", end]]), null),
	]);
	/* Days hrms has not marked come from the punches (lib/register.js fillFromPunches). */
	let marks = attendance;
	let punchDays = 0;
	if (people.size) {
		const [punches, shifts] = await Promise.all([
			safe("The punches", () => readPunches(people.keys(), start, end), null),
			readShifts().catch(() => null),
		]);
		if (punches) ({ attendance: marks, filled: punchDays } = fillFromPunches(attendance, punches, { people, ym, shifts }));
		if (punchDays) warnings.push(filledSaid(punchDays));
	}
	return { people, attendance: marks, calendar, ledger, warnings, punchDays };
}

/* The preview's Employee read. `*` is every flat field the site has, so the
   UAN, PF and ESIC numbers arrive under whichever spelling it holds them
   (lib/statutory.js); the narrow list is stock fields only, for a login the
   wide read is refused to. */
const CREW_NARROW = ["name", "employee_name", "employee_number", "gender", "date_of_joining", "relieving_date",
	"status", "branch", "designation", "default_shift", "salary_mode", "employment_type", "department"];

const LEDGER_WIDE = ["employee", "leave_type", "leaves", "from_date", "transaction_type", "is_carry_forward", "is_expired"];
const LEDGER_NARROW = ["employee", "leave_type", "leaves", "from_date", "transaction_type"];

/** Every Employee Actual Salary row for a company. A site without the doctype
    answers nothing rather than failing the workbook — the column is then blank. */
export async function loadActualSalaries(company) {
	try {
		return await listAll("Employee Actual Salary", ["employee", "from_date", "actual_salary"], company ? [["company", "=", company]] : undefined, 500);
	} catch {
		return [];
	}
}

/** Shift Type by name, for each person's hours in a day. */
async function readShifts() {
	const rows = await listAll("Shift Type", ["name", "start_time", "end_time"], undefined, 500);
	return new Map(rows.map((r) => [r.name, r]));
}

/**
 * Everything the preview register needs from the site, for a month with no
 * salary slips. Each read stands alone, as in loadRegisterReads: one the site
 * refuses is `null` (or empty, for the people and the days) and a plain
 * sentence in `warnings`, and the rest of the register is still made.
 *
 * @returns {Promise<{people:object[], attendance:Map, attendanceRead:boolean, calendar:{off:Set,holiday:Set},
 *   shifts:Map|null, overtime:object[]|null, ledger:object[]|null, extras:object[]|null, loans:object[]|null,
 *   loanComponents:string[], warnings:string[]}>}
 */
export async function loadPreviewReads(company, ym, start, end) {
	const warnings = [];
	let attendanceRead = true;
	const safe = async (what, then, run, fallback) => {
		try {
			return await run();
		} catch (e) {
			warnings.push(`${what} could not be read (${e.status === 403 ? "this login may not read it" : e.message || e}), so ${then}.`);
			return fallback;
		}
	};
	const co = company ? [["company", "=", company]] : [];
	const [people, attendance, calendar, shifts, overtime, ledger, extras, loans] = await Promise.all([
		safe("The people's details", "nobody could be listed", () => listSome("Employee", ["*"], CREW_NARROW, co), []),
		safe("Attendance", "the day cells are empty", () => readAttendance(company, start, end), null),
		safe("The holiday list", "only Sundays are marked off", () => readCalendar(company, ym), { off: new Set(), holiday: new Set() }),
		safe("The shifts", "every OT rate divides a day's pay by 8 hours", readShifts, null),
		/* HR's own overtime entries — the only overtime this app counts (16 Sep 2026). */
		safe("Overtime", "the OT hours are empty", () => listAll("Employee Overtime", OT_FIELDS,
			[["ot_date", ">=", start], ["ot_date", "<=", end]], 1000), null),
		/* Casual Leave's ledger up to the month's end, submitted only: lib/monthlyleave.js
		   monthCarry reads what came in before the month and what the month added. */
		safe("The Casual Leave ledger", "the Casual Leave columns are empty", () => listSome("Leave Ledger Entry", LEDGER_WIDE, LEDGER_NARROW,
			[["leave_type", "=", LEAVE_TYPE_NAME], ["docstatus", "=", 1], ["from_date", "<=", end]]), null),
		/* Drafts too, so the page can say one is waiting; only a submitted one is counted. */
		safe("This month's advances and loan instalments", "those columns are empty", () => listAll("Additional Salary",
			["name", "employee", "salary_component", "amount", "docstatus"],
			[["payroll_date", ">=", start], ["payroll_date", "<=", end], ["docstatus", "<", 2], ...co], 500), null),
		loadLoansDue(company, ym),
	]);
	if (attendance === null) attendanceRead = false;
	if (loans.state !== "ok") {
		warnings.push(`Staff loans could not be read (${loans.err}), so loan instalments come only from what was added for the month.`);
	}
	/* Days hrms has not marked come from the punches, as on a month with slips.
	   Not when Attendance itself was refused: the page says so, and a register
	   of punches alone would read as if hrms had marked nothing. */
	let marks = attendance || new Map();
	let punchDays = 0;
	if (attendance !== null && people.length) {
		const punches = await safe("The punches", "days hrms has not marked stay empty",
			() => readPunches(people.map((p) => p.name), start, end), null);
		if (punches) ({ attendance: marks, filled: punchDays } = fillFromPunches(attendance, punches, { people, ym, shifts }));
		if (punchDays) warnings.push(filledSaid(punchDays));
	}
	return {
		people, attendance: marks, attendanceRead, calendar, shifts, overtime, ledger, extras,
		loans: loans.state === "ok" ? loans.due : null, loanComponents: loans.components || [], warnings, punchDays,
	};
}
