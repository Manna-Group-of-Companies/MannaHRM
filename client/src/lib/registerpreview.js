/* ---------------------------------------------------------------------------
   The wages register before there are salary slips: a PREVIEW in the company's
   own register layout (sheet "MRPPL Salary-1"), with that sheet's formulas live
   in the cells so HR can see how the month works out.

   **Nothing here works out pay.** This only places what the site holds into
   the cells the formulas read — the days from Attendance, the Casual Leave
   brought forward and earned off hrms's leave ledger, the overtime hours HR
   entered, the base of a salary structure where there is one, the advance and
   the loan instalment. Every rupee after that is an Excel formula written by
   lib/registerxlsx.js. Excel works the month out — not this file, and not
   hrms — which is why the workbook says PREVIEW, NOT FROM SALARY SLIPS at the
   top and why nobody is paid from it. The register made from slips
   (lib/register.js) is the one that is paid from.

   What the site has no field for is left empty for HR to type: daily wage,
   food allowance, bata, Labour Welfare Fund, mess, the Covid-19 advance,
   insurance, food deduction, project incentive and round off. Every formula
   reads an empty cell as 0.
   --------------------------------------------------------------------------- */

import { bankShareOf, dayCell, daysIn, weekday } from "@/lib/register";
import { structureFor } from "@/lib/payroll";
import { kindOf } from "@/lib/salarysheet";
import { LEAVE_TYPE_NAME, monthCarry } from "@/lib/monthlyleave";
import { ESIC, PF, UAN } from "@/lib/statutory";
import { ratesOf } from "@/lib/salaryupload";

const n = (v) => Number(v) || 0;
/* Leave days and hours as the site wrote them, without the float dust a sum of
   0.5s and 1.5s picks up on the way. */
const tidy = (v) => Math.round(n(v) * 100) / 100;
const day = (v) => String(v || "").slice(0, 10);
const names = (list) => list.slice(0, 6).join(", ") + (list.length > 6 ? ` and ${list.length - 6} more` : "");
const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;

/** Whether somebody belongs on the month's register: joined by its last day,
    and either still Active or relieved on or after its first. A record still
    marked Active with a relieving date before the month is somebody who left
    and whose status nobody changed — they are not on this month's muster. */
export function inRegister(person, start, end) {
	const joined = day(person.date_of_joining);
	if (joined && joined > end) return false;
	const left = day(person.relieving_date);
	if (left) return left >= start;
	return person.status === "Active";
}

/** A shift's length in hours, from its Shift Type's start and end; a shift that
    ends before it starts runs past midnight. null when the times are missing. */
export function shiftHours(shift) {
	const mins = (t) => {
		const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
		return m ? Number(m[1]) * 60 + Number(m[2]) : null;
	};
	const a = mins(shift && shift.start_time);
	const b = mins(shift && shift.end_time);
	if (a === null || b === null) return null;
	const len = b > a ? b - a : b + 24 * 60 - a;
	return len / 60;
}

/** The hours the OT rate divides a day's pay by.

    **An inference from the sheet, to be confirmed with HR:** its OT rate is a
    day's pay over 12 for some people and over 8 for others, and the people on
    12 are the ones on twelve-hour shifts. So a shift of 11 hours or more is 12,
    anything shorter is 8, and somebody with no shift on record is 8: the
    smaller day is the higher rate, and underpaying somebody's overtime is the
    expensive mistake (CLAUDE.md §4). */
export function otHoursPerDay(hours) {
	return hours !== null && hours !== undefined && hours >= 11 ? 12 : 8;
}

/** Yes when the record carries the number that membership needs. */
export const pfMember = (person) => Boolean(String(UAN(person) || PF(person) || "").trim());
export const esiMember = (person) => Boolean(String(ESIC(person) || "").trim());

/** What the site has no field for, in the words of the sheet's own headings —
    named on the page so HR knows which cells are theirs to fill. */
export const LEFT_EMPTY = [
	"daily wage", "food allowance", "bata", "Labour Welfare Fund", "mess", "Covid-19 advance",
	"insurance", "food deduction", "project incentive", "round off",
];

const words = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list.join(""));

/** The page's message once the preview is made: what it is, that it is not to
    be paid from, what HR has to fill in, and anything the reads or the notes said. */
export function previewSummary({ label, rows, notes = [], warnings = [] }) {
	const empty = [...(rows.some((r) => r.base === "") ? ["monthly pay"] : []), ...LEFT_EMPTY];
	return [
		`A preview of the wages register for ${label} was made, with ${plural(rows.length, "person", "people")}.`,
		"It is worked out by Excel from the sheet's own formulas and the attendance, not by the salary slips, so do not pay from it.",
		`Left empty for you to fill in the file: ${words(empty)}. An empty cell counts as zero.`,
		...notes,
		...warnings,
	].join(" ");
}

/**
 * The preview register's rows for one company and month, and what HR should
 * know about them.
 *
 * Each read is `null` when the site would not give it — api/register.js says
 * so in a warning — which is not the same as "nobody had any".
 *
 * @param {object} p
 * @param {string} p.ym
 * @param {string} [p.company]
 * @param {object[]|Map} p.people      Employee rows (any fields; the statutory ones under any spelling)
 * @param {Map<string,Object<number,string>>} [p.attendance] employee → { day: status }
 * @param {{off:Set<number>,holiday:Set<number>}} [p.calendar]
 * @param {object[]} [p.assignments]   Salary Structure Assignment rows
 * @param {object[]|null} [p.overtime] Employee Overtime rows of the month
 * @param {Map<string,object>|null} [p.shifts] Shift Type by name
 * @param {object[]|null} [p.ledger]   Casual Leave's Leave Ledger Entry rows, submitted
 * @param {object[]|null} [p.extras]   the month's Additional Salary rows
 * @param {object[]|null} [p.loans]    loan instalments due this month (lib/salarysheet.js loanInstalmentsDue)
 * @param {string[]} [p.loanComponents]
 * @param {boolean} [p.attendanceRead] false when Attendance could not be read, so nobody is called absent for it
 * @returns {{rows: object[], notes: string[]}}
 */
export function previewRows({
	ym, company = "", people = [], attendance = new Map(), calendar = { off: new Set(), holiday: new Set() },
	assignments = [], overtime = [], shifts = new Map(), ledger = [], extras = [], loans = [], loanComponents = [],
	attendanceRead = true,
}) {
	const last = daysIn(ym);
	const start = `${ym}-01`;
	const end = `${ym}-${String(last).padStart(2, "0")}`;
	const list = (people instanceof Map ? [...people.values()] : people || [])
		.filter((p) => inRegister(p, start, end))
		.sort((a, b) => String(a.employee_number || a.name).localeCompare(String(b.employee_number || b.name), "en", { numeric: true }));

	const by = (rows, key = "employee") => {
		const out = new Map();
		for (const r of rows || []) (out.get(r[key]) || out.set(r[key], []).get(r[key])).push(r);
		return out;
	};
	const ot = by(overtime);
	const cl = by((ledger || []).filter((e) => !e.leave_type || e.leave_type === LEAVE_TYPE_NAME));
	const live = (extras || []).filter((x) => Number(x.docstatus) === 1);
	const extra = by(live);
	const due = by(loans);
	const kind = (x) => kindOf(x.salary_component, loanComponents);
	const sum = (rows, pick) => tidy((rows || []).reduce((t, r) => t + n(pick(r)), 0));
	const blank = (v) => (v ? v : "");

	const rows = list.map((p, i) => {
		const marks = attendance.get(p.name) || {};
		const days = Array.from({ length: last }, (_, k) => {
			const d = k + 1;
			return dayCell(marks[d], { sunday: weekday(ym, d) === 0, off: calendar.off.has(d), holiday: calendar.holiday.has(d) });
		});
		const ssa = structureFor(assignments, p.name, end);
		const shift = shifts && p.default_shift ? shifts.get(p.default_shift) : null;
		const carry = ledger ? monthCarry(cl.get(p.name) || [], ym) : null;
		const mine = extra.get(p.name) || [];
		const owed = due.get(p.name) || [];
		/* A loan instalment reaches a slip as an Additional Salary — "Add loan
		   instalments" makes one from the schedule, and HR keys one by hand where
		   the site has no loans. When both are there they are the same money, so
		   the Additional Salary is the one counted. */
		const posted = sum(mine.filter((x) => kind(x) === "loan"), (x) => x.amount);
		const outstanding = owed.filter((d) => d.outstanding !== null && d.outstanding !== undefined);
		return {
			srl: i + 1,
			employee: p.name,
			company,
			branch: p.branch || company,
			employee: p.name,
			code: p.employee_number || p.name,
			name: p.employee_name || p.name,
			salaryMode: p.salary_mode || "",
			...bankShareOf(p),
			status: p.status || "",
			employmentType: p.employment_type || "",
			department: p.department || "",
			designation: p.designation || "",
			gender: p.gender || "",
			father: p.custom_father_name || "",
			joined: p.date_of_joining || "",
			days,
			kind: "Salary",
			daily: "",
			base: ssa && n(ssa.base) > 0 ? n(ssa.base) : "",
			otHours: blank(sum(ot.get(p.name), (r) => r.hours)),
			otPerDay: otHoursPerDay(shift ? shiftHours(shift) : null),
			hasShift: Boolean(shift && shiftHours(shift) !== null),
			clBrought: carry ? tidy(carry.brought) : "",
			cashPay: ssa && Number(ssa.custom_cash_amount) > 0 ? Number(ssa.custom_cash_amount) : "",
			/* EPF wages as a share of the pay due: the company's EPF calculation, off
			   the person's structure (Salary Setup's upload names it). Half, as the
			   reference sheet has it, for a structure that does not say. */
			pfShare: ssa && ratesOf(ssa.salary_structure) && ratesOf(ssa.salary_structure).method === "full" ? 100 : 50,
			clEarned: carry ? tidy(carry.earned) : "",
			pfMember: pfMember(p),
			esiMember: esiMember(p),
			pfGovt: "No",
			advance: blank(sum(mine.filter((x) => kind(x) === "advance"), (x) => x.amount)),
			loanInstalment: blank(posted || sum(owed, (d) => d.amount)),
			loanOutstanding: outstanding.length ? sum(outstanding, (d) => d.outstanding) : "",
		};
	});

	return { rows, notes: previewNotes(rows, { attendance, shifts, extras, loanComponents, attendanceRead }) };
}

/** What HR should know before reading the preview, one plain sentence each.
    A read the site refused is said by api/register.js, once, and not again here. */
export function previewNotes(rows, { attendance = new Map(), shifts = new Map(), extras = [], loanComponents = [], attendanceRead = true } = {}) {
	const out = [];
	if (!rows.length) return out;
	out.push("Everybody is marked Salary, because the site does not record who is paid a daily wage. "
		+ "For a wage worker, change Type of Remuneration to Wages and put 26 days of their daily wage in the monthly pay column — the row works itself out again.");
	out.push("EPF and ESI membership were taken from the UAN, PF and ESIC numbers on each person's record. "
		+ "If one is wrong, change the Yes or No in the file and the PF and ESI columns follow.");

	const noBase = rows.filter((r) => r.base === "");
	if (noBase.length === rows.length) {
		out.push("Nobody has a salary structure yet, so the monthly pay column is empty. Type each person's monthly pay and the row works out.");
	} else if (noBase.length) {
		out.push(`${plural(noBase.length, "person has", "people have")} no salary structure, so their monthly pay is empty: ${names(noBase.map((r) => r.name))}.`);
	}
	const noShift = shifts === null ? [] : rows.filter((r) => !r.hasShift);
	if (noShift.length) {
		out.push(`${plural(noShift.length, "person has", "people have")} no shift with its times on record (${names(noShift.map((r) => r.name))}), so their OT rate divides a day's pay by 8 hours.`);
	}
	const bare = attendanceRead ? rows.filter((r) => !attendance.has(r.employee)) : [];
	if (bare.length === rows.length) {
		out.push("No attendance was found for anybody this month, so every day that is not a Sunday or a holiday counts as leave.");
	} else if (bare.length) {
		out.push(`No attendance was found for ${names(bare.map((r) => r.name))}, so every day of theirs that is not a Sunday or a holiday counts as leave.`);
	}

	const owing = rows.filter((r) => r.loanInstalment !== "" && r.loanOutstanding === "");
	if (owing.length) {
		out.push(`The site does not hold what is still owed on the loans of ${names(owing.map((r) => r.name))}. `
			+ "Type the outstanding loan amount for them, or their loan balance shows less than nothing.");
	}

	const live = (extras || []).filter((x) => Number(x.docstatus) < 2);
	const ours = (x) => ["advance", "loan"].includes(kindOf(x.salary_component, loanComponents));
	const drafts = live.filter((x) => Number(x.docstatus) === 0 && ours(x));
	if (drafts.length) {
		out.push(`${plural(drafts.length, "advance or loan instalment is", "advances or loan instalments are")} still a draft on the site and not in the file. Submit them and make the file again.`);
	}
	const other = [...new Set(live.filter((x) => Number(x.docstatus) === 1 && !ours(x)).map((x) => x.salary_component))];
	if (other.length) {
		const one = other.length === 1;
		out.push(`${other.join(", ")} ${one ? "is" : "are"} added on the site this month but ${one ? "has" : "have"} no column on this register, so ${one ? "it is" : "they are"} not in it.`);
	}
	return out;
}
