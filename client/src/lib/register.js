/* ---------------------------------------------------------------------------
   The wages register (Form 25, muster roll) as rows — what goes in each person's
   line for one company and one month. Pure, so a test can argue with it without
   a site; lib/registerxlsx.js lays the rows over the workbook's layout and
   api/register.js reads what they are made from.

   **Nothing here works out a salary.** Every rupee is the Salary Slip's own, as
   hrms made it: gross, deductions and net are the slip's totals, and each
   component column is the sum of the slip's lines that carry that component's
   name. What this adds is the days (from Attendance), who is a PF or ESI member
   (the slip has a line for it or it has not) and where each line goes.

   **The pay on the register is the pay on the slip.** There is no second figure
   "for filing": the PF, ESI, Professional Tax and Labour Welfare columns are the
   amounts hrms deducted on the person's real wage, and the net payable is what
   the slip says is paid.
   --------------------------------------------------------------------------- */

import { LEAVE_TYPE_NAME, monthCarry } from "@/lib/monthlyleave";
import { workDateOf, workDayPunches } from "@/lib/roster";

const n = (v) => Number(v) || 0;
const cents = (v) => Math.round(n(v) * 100) / 100;

/** Which of a slip's lines go in which column, by component name — the same way
    lib/salarysheet.js tells an advance from a loan. A site names its components
    as it likes; these are the names hrms and India Compliance use. */
export const PATTERNS = {
	basic: /^basic/i,
	da: /dearness|^d\.?a\.?$/i,
	hra: /house rent|^hra$/i,
	conveyance: /conveyance/i,
	overtime: /overtime|^ot\b/i,
	bata: /\bbata\b/i,
	food: /food|mess/i,
	pf: /provident|\bepf\b|^pf\b/i,
	esi: /\besi\b|state insurance|^esic/i,
	ptax: /professional tax|^p\.?tax/i,
	lwf: /welfare|\blwf\b/i,
};

/** How much of a person's net pay goes to their bank account, off their
    Employee record: a share (`custom_bank_percent`, 50 for half) or a fixed sum
    (`custom_bank_amount`), the rest in cash. Neither set is "" — the register
    then uses the one limit HR types for everybody. It changes nothing but how
    the net is handed over: the wage, ESI, PF and PT on the register are the
    full figures (9 October 2026). */
export function bankShareOf(e = {}) {
	const pct = Number(e.custom_bank_percent);
	const amt = Number(e.custom_bank_amount);
	return {
		bankPercent: pct > 0 ? Math.min(pct, 100) : "",
		bankAmount: !(pct > 0) && amt > 0 ? amt : "",
	};
}

/** Days hrms has not marked, filled in from the person's punches — the same
    fallback Daily Detail and Monthly Basic make (lib/dailydetail.js), so the
    register cannot read a day as empty that those read as worked. A company
    whose shifts do not turn punches into Attendance otherwise comes out with
    every day blank (12 October 2026).

    A day with an In or an Out is Present: somebody who was there is the
    expensive one to miss (CLAUDE.md §4). A day hrms *has* marked keeps hrms's
    word, punches or not. A night shift's morning leaving counts on the night it
    began (`workDateOf`), off the person's own shift.

    @param attendance Map employee → { day: status }, as readAttendance gives it
    @param punches    Employee Checkin rows: employee, time, log_type
    @param people     the company's Employee rows, as a Map by id or an array
    @param shifts     Map Shift Type name → {start_time, end_time}, or null
    @returns {{attendance: Map, filled: number}} a new Map; the one passed in is not changed */
export function fillFromPunches(attendance, punches, { people, ym, shifts = null }) {
	const out = new Map([...(attendance || new Map())].map(([k, v]) => [k, { ...v }]));
	const who = people instanceof Map ? people : new Map((people || []).map((p) => [p.name, p]));
	const byDay = new Map();
	for (const c of punches || []) {
		const e = who.get(c.employee);
		if (!e) continue;
		const own = shifts && e.default_shift ? shifts.get(e.default_shift) || null : null;
		const iso = workDateOf(c, () => own);
		if (iso.slice(0, 7) !== ym) continue;
		const k = `${c.employee}|${iso}`;
		(byDay.get(k) || byDay.set(k, []).get(k)).push(c);
	}
	let filled = 0;
	for (const [k, rows] of byDay) {
		const at = k.lastIndexOf("|");
		const emp = k.slice(0, at);
		const iso = k.slice(at + 1);
		const day = Number(iso.slice(8, 10));
		const marks = out.get(emp) || {};
		if (marks[day]) continue;
		const p = workDayPunches(rows, iso);
		if (!p.inAt && !p.outAt) continue;
		marks[day] = "Present";
		out.set(emp, marks);
		filled += 1;
	}
	return { attendance: out, filled };
}

/** What a day on the register says. The legend is the workbook's: 1, 0.5, L, SNDY, HOL. */
export const LEGEND = [1, 0.5, "L", "SNDY", "HOL"];

/** Day of the week of "YYYY-MM" day `d`; 0 is Sunday. */
export const weekday = (ym, d) => {
	const [y, m] = ym.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const daysIn = (ym) => {
	const [y, m] = ym.split("-").map(Number);
	return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** One day's cell.
    @param {string} [status] the Attendance row's status for the day, if any
    @param {object} o { sunday, off, holiday } what the calendar says of the day
    @returns {number|string} 1, 0.5, "L", "SNDY", "HOL", 0 for absent, "" for nothing recorded */
export function dayCell(status, { sunday = false, off = false, holiday = false } = {}) {
	if (status === "Present" || status === "Work From Home") return 1;
	if (status === "Half Day") return 0.5;
	if (status === "On Leave") return "L";
	if (sunday || off) return "SNDY";
	if (holiday) return "HOL";
	return status === "Absent" ? 0 : "";
}

/** The sum of a slip's lines whose component matches `re`, and which ones they were. */
function pick(lines, re, taken) {
	let t = 0;
	for (const [name, amount] of Object.entries(lines || {})) {
		if (!re.test(name)) continue;
		t += n(amount);
		if (taken) taken.add(name);
	}
	return cents(t);
}

/** The earnings and deductions of one slip, sorted into the register's columns. */
export function columnsOf(row, dedKinds = {}) {
	const took = new Set();
	const basic = pick(row.earn, PATTERNS.basic, took);
	const da = pick(row.earn, PATTERNS.da, took);
	const hra = pick(row.earn, PATTERNS.hra, took);
	const conveyance = pick(row.earn, PATTERNS.conveyance, took);
	const overtime = pick(row.earn, PATTERNS.overtime, took);
	const bata = pick(row.earn, PATTERNS.bata, took);
	const food = pick(row.earn, PATTERNS.food, took);
	const rest = cents(Object.entries(row.earn || {}).reduce((t, [k, v]) => (took.has(k) ? t : t + n(v)), 0));
	const due = cents(basic + da + hra + conveyance + rest);

	const pf = pick(row.ded, PATTERNS.pf);
	const esi = pick(row.ded, PATTERNS.esi);
	const ptax = pick(row.ded, PATTERNS.ptax);
	const lwf = pick(row.ded, PATTERNS.lwf);
	const sum = (kind) => cents(Object.entries(row.ded || {}).reduce((t, [k, v]) => (dedKinds[k] === kind ? t + n(v) : t), 0));

	/* A deduction the register has no column of its own for — Income Tax, say. It is
	   in the slip's total deduction and so in the net, and is named so that nobody
	   has to wonder why the columns do not add up. */
	const known = [PATTERNS.pf, PATTERNS.esi, PATTERNS.ptax, PATTERNS.lwf];
	const unmapped = Object.entries(row.ded || {})
		.filter(([k, v]) => n(v) && !known.some((re) => re.test(k)) && dedKinds[k] !== "advance" && dedKinds[k] !== "loan")
		.map(([k, v]) => [k, cents(v)]);

	return { basic, da, hra, conveyance, other: rest, overtime, bata, food, due, pf, esi, ptax, lwf, advance: sum("advance"), loan: sum("loan"), unmapped };
}

/**
 * The register's rows for one company and month.
 *
 * @param {object} p
 * @param {object} p.sheet        lib/salarysheet.js buildSheet's return (the month's slips, one row each)
 * @param {string} p.ym           "2026-09"
 * @param {Map<string,object>} [p.people]      Employee rows by id: gender, date_of_joining, employee_number, branch
 * @param {Map<string,Object<number,string>>} [p.attendance] employee → { day: status }
 * @param {{off:Set<number>,holiday:Set<number>}} [p.calendar] the company's weekly offs and holidays, as days of the month
 * @param {object[]} [p.assignments] Salary Structure Assignment rows, for the agreed monthly pay
 * @param {(a:object[],e:string,d:string)=>object|null} [p.structureFor]
 * @param {string} [p.company]
 */
export function registerRows({ sheet, ym, people = new Map(), attendance = new Map(), calendar = { off: new Set(), holiday: new Set() }, assignments = [], structureFor = () => null, company = "", ledger = null }) {
	const last = daysIn(ym);
	/* Casual Leave brought forward and earned this month, off hrms's ledger — the
	   same figures the preview carries, so a month with slips fills the CL columns
	   too. No ledger read leaves them empty rather than zero. */
	const clOf = new Map();
	for (const e of ledger || []) {
		if (e.leave_type && e.leave_type !== LEAVE_TYPE_NAME) continue;
		(clOf.get(e.employee) || clOf.set(e.employee, []).get(e.employee)).push(e);
	}
	const end = `${ym}-${String(last).padStart(2, "0")}`;
	const dedKinds = Object.fromEntries((sheet.dedCols || []).map((c) => [c.name, c.kind]));

	return (sheet.rows || []).map((r, i) => {
		const who = people.get(r.employee) || {};
		const marks = attendance.get(r.employee) || {};
		const days = Array.from({ length: last }, (_, k) => {
			const d = k + 1;
			return dayCell(marks[d], { sunday: weekday(ym, d) === 0, off: calendar.off.has(d), holiday: calendar.holiday.has(d) });
		});
		const c = columnsOf(r, dedKinds);
		const ssa = structureFor(assignments, r.employee, end);
		const carry = ledger ? monthCarry(clOf.get(r.employee) || [], ym) : null;
		return {
			srl: i + 1,
			company,
			cashPay: ssa && Number(ssa.custom_cash_amount) > 0 ? Number(ssa.custom_cash_amount) : "",
			branch: who.branch || company,
			employee: r.employee,
			code: who.employee_number || r.employee,
			name: r.name,
			salaryMode: who.salary_mode || "",
			...bankShareOf(who),
			status: who.status || "",
			employmentType: who.employment_type || "",
			department: who.department || "",
			designation: who.designation || "",
			gender: who.gender || "",
			joined: who.date_of_joining || "",
			days,
			paymentDays: r.paymentDays,
			clBrought: carry ? Number(carry.brought.toFixed(2)) : "",
			clEarned: carry ? Number(carry.earned.toFixed(2)) : "",
			agreed: ssa ? n(ssa.base) : 0,
			...c,
			pfMember: c.pf > 0,
			esiMember: c.esi > 0,
			gross: r.gross,
			deduction: r.deduction,
			net: r.net,
			state: r.state,
		};
	});
}

/**
 * What is wrong, or may be, with this register before anybody pays from it. The
 * register never changes a figure to make a check pass — these are said, so a
 * person decides.
 *
 * @param {object[]} rows registerRows' return
 * @param {object[]} sheet.rows the slips behind them (for the lines-do-not-add flag)
 * @returns {string[]} one plain sentence each; empty when nothing is wrong
 */
export function registerChecks(rows, sheetRows = [], { attendanceRead = true, peopleRead = true } = {}) {
	const out = [];
	const names = (list) => list.slice(0, 6).join(", ") + (list.length > 6 ? ` and ${list.length - 6} more` : "");

	const drafts = rows.filter((r) => r.state !== "Submitted");
	if (drafts.length) {
		out.push(`${drafts.length} of ${rows.length} slips are still drafts (${names(drafts.map((r) => r.name))}). A draft can still change — do not pay from this register until the slips are submitted.`);
	}
	const gap = rows.filter((r) => Math.abs(n(r.gross) - n(r.deduction) - n(r.net)) > 1);
	if (gap.length) {
		out.push(`For ${names(gap.map((r) => r.name))}, gross minus deductions is not the net the slip shows (rounding or a component outside the totals). The register shows the slip's own net.`);
	}
	const off = sheetRows.filter((r) => r.off);
	if (off.length) {
		out.push(`The lines on ${names(off.map((r) => r.name))}'s slip do not add to its own gross or deductions — a component opted out of the totals. Check the slip.`);
	}
	const extra = rows.filter((r) => r.unmapped && r.unmapped.length);
	if (extra.length) {
		const what = [...new Set(extra.flatMap((r) => r.unmapped.map(([k]) => k)))];
		out.push(`${what.join(", ")} ${what.length === 1 ? "is" : "are"} deducted on some slips but have no column on the register. They are inside Total Deductions and the net, and a note on each person's Total Deductions cell names them.`);
	}
	if (attendanceRead) {
		const bare = rows.filter((r) => r.paymentDays > 0 && !r.days.some((d) => d === 1 || d === 0.5 || d === "L"));
		if (bare.length) out.push(`No attendance was found for ${names(bare.map((r) => r.name))}, so their day cells are empty although the slip pays them.`);
	}
	if (!peopleRead) out.push("Employee details could not be read, so codes are the employee IDs and joining dates are empty.");
	const nobody = rows.filter((r) => !n(r.net));
	if (nobody.length) out.push(`${names(nobody.map((r) => r.name))} ${nobody.length === 1 ? "has" : "have"} a net pay of zero on the slip.`);
	return out;
}
