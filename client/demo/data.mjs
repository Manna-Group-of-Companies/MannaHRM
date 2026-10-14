/* ---------------------------------------------------------------------------
   The practice site's dummy data — every person, company and rupee made up.

   Built for "last month" by the clock it runs on, because that is the month
   the Payroll page opens on (lib/payrollrun.js lastMonth), and for the month
   before it, so a carry-forward has somewhere to come from. DEMO_MONTH=YYYY-MM
   pins it; DEMO_SLIPS=off makes the same people with no payroll run at all.

   Two companies, deliberately different:
     Manna Rubber Products Pvt Ltd (Demo)  last month run and its slips submitted —
                                          every payroll download works from the slips
     Soorya Rubbers (Demo)                pay set, no slips — its wages register is
                                          the preview, the sheet's own formulas

   The people are chosen to put something in every column of the wages register:
   monthly salary and daily wage, 12-hour and 9-hour shifts, PF and ESI members
   and not, a PF wage over the 25,000 cap, a manager in the top Professional Tax
   slab, food allowance, LWF, bata, OT, an advance, a loan, Casual Leave carried
   in and earned, leave past what was available, a joiner and a leaver.

   Nothing in client/src may import this file (tests/demosite.test.js checks).
   --------------------------------------------------------------------------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n) => String(n).padStart(2, "0");
const ymOf = (y, m) => `${y}-${pad(m)}`;
const daysIn = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const dayOf = (ym, d) => `${ym}-${pad(d)}`;
const weekday = (ym, d) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const shiftYm = (ym, by) => { const [y, m] = ym.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + by, 1)); return ymOf(t.getUTCFullYear(), t.getUTCMonth() + 1); };
const labelOf = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Two decimals, as a slip line is stored. */
const c2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
/** Excel's ROUNDUP(x, 0) for the positive amounts here — with the float noise
    taken off first, so 120.00000000001 is 120 and not 121. */
const up = (v) => Math.ceil(Number((Number(v) || 0).toFixed(6)));

/* ------------------------------------------------------------ the practice slip */

/** Kerala Professional Tax for a half-year wage, as the sheet's slabs — with
    "else 1,250" for 125,000 and over, which is the owner's rule; the sheet's own
    formula gives nothing there. */
export function ptSlab(halfYear) {
	if (halfYear < 17999) return 320;
	if (halfYear < 29999) return 450;
	if (halfYear < 44999) return 600;
	if (halfYear < 99999) return 750;
	if (halfYear < 124999) return 1000;
	return 1250;
}

/**
 * **Practice figures, standing in for what hrms calculates on the real site.**
 *
 * On the real site nobody's pay is worked out by this repo: hrms makes the
 * salary slip and the dashboard only reads it. The practice site cannot run
 * hrms, so its slips are made here instead, with the MRPPL Salary-1 sheet's own
 * formulas — the same ones the preview register writes into its cells — so a
 * slip register and a preview of the same inputs agree, and either can be
 * checked against the other. Nothing outside client/demo may import this.
 *
 * @param {object} p   the person: kind "Salary" | "Wages", base, pf, esi, lwf, food
 * @param {object} x   the month: D, AL worked, AM Sundays, AN holidays, AP CL brought in,
 *                     AQ CL earned, ot hours, h hours in their day, bataDays, bataRate,
 *                     advance, loan
 */
export function practiceSlip(p, x) {
	const BE = p.base;
	const AO = x.D - x.AL - x.AM - x.AN;
	const AR = x.AP + x.AQ;
	const wages = p.kind === "Wages";
	const AT = wages ? x.AL : (AO >= AR ? x.D - AO + AR : x.D);
	const AU = x.D - AT;
	const BL = wages ? (BE / 26) * AT : BE - (BE / x.D) * AU;
	const BA = x.ot * ((wages ? BE / 26 : BE / x.D) / x.h);
	const BB = (x.bataDays || 0) * (x.bataRate || 0);
	const BO = p.food || 0;
	const BP = BL + BA + BB + BO;
	const BM = p.pf ? BL * 0.5 : 0;
	const BX = p.pf ? up(BM < 25000 ? BM * 0.12 : 25000 * 0.12) : 0;
	const BY = p.esi ? up(BP * 0.0075) : 0;
	const CK = ptSlab(BE * 3) / 6;
	const CL = p.lwf ? 7.5 : 0;

	const earnings = [["Basic", "B", BL], ["Overtime", "OT", BA], ["Bata", "BATA", BB], ["Food Allowance", "FA", BO]]
		.filter(([, , v]) => c2(v) > 0).map(([salary_component, abbr, v]) => ({ salary_component, abbr, amount: c2(v) }));
	const deductions = [["Provident Fund", "PF", BX], ["ESI", "ESI", BY], ["Professional Tax", "PT", CK], ["Labour Welfare Fund", "LWF", CL],
		["Salary Advance", "SADV", x.advance || 0], ["Loan EMI", "LEMI", x.loan || 0]]
		.filter(([, , v]) => c2(v) > 0).map(([salary_component, abbr, v]) => ({ salary_component, abbr, amount: c2(v) }));
	const gross = c2(earnings.reduce((t, l) => t + l.amount, 0));
	const ded = c2(deductions.reduce((t, l) => t + l.amount, 0));
	const net = c2(gross - ded);
	return {
		earnings, deductions, gross_pay: gross, total_deduction: ded, net_pay: net, rounded_total: up(net),
		payment_days: AT, total_working_days: x.D, leave_without_pay: wages ? 0 : AU,
	};
}

/* ------------------------------------------------------------ who */

const A = { name: "Manna Rubber Products Pvt Ltd (Demo)", abbr: "MRD" };
const B = { name: "Soorya Rubbers (Demo)", abbr: "SRD" };

const SHIFT_TIMES = { Day: ["08:30:00", "20:30:00", 12], Night: ["20:30:00", "08:30:00", 12], General: ["09:00:00", "18:00:00", 9] };

/* Exceptions are by working day of the month — the 5th working day, not the
   5th — so the same people make sense in any month. `cl` is Casual Leave,
   `sick` Sick Leave, both approved. `ap` is the Casual Leave brought into last
   month; `prevCl` the CL days taken the month before. */
const PEOPLE = [
	{ code: "DEMO-001", name: "Rajan Pillai", father: "Krishnan Pillai", gender: "Male", co: A, dept: "Accounts", desig: "Accountant",
		kind: "Salary", base: 28000, shift: "General", pf: true, esi: false, lwf: true, cl: true, ap: 1, last: { cl: [11] } },
	{ code: "DEMO-002", name: "Suma Thomas", father: "Thomas Mathew", gender: "Female", co: A, dept: "Administration", desig: "HR Executive", bankPct: 50,
		kind: "Salary", base: 18500, shift: "General", pf: false, esi: true, food: 1000, cl: true, ap: 0, prevCl: [8], last: { cl: [6], absent: [17] } },
	{ code: "DEMO-003", name: "Biju Varghese", father: "Varghese Kurian", gender: "Male", co: A, dept: "Transport", desig: "Driver", bankAmt: 10000,
		kind: "Salary", base: 17000, shift: "Day", pf: false, esi: true, cl: true, ap: 0, prevCl: [4], ot: 12, bata: [6, 150], advance: 1500 },
	{ code: "DEMO-004", name: "Shiju Joseph", father: "Joseph Antony", gender: "Male", co: A, dept: "Production", desig: "Production Supervisor",
		kind: "Salary", base: 32000, shift: "General", pf: true, esi: false, lwf: true, cl: true, ap: 1, last: { cl: [20] } },
	{ code: "DEMO-005", name: "Vinod Menon", father: "Gopalan Menon", gender: "Male", co: A, dept: "Production", desig: "Plant Manager",
		kind: "Salary", base: 60000, shift: "General", pf: true, esi: false, lwf: true, cl: true, ap: 2 },
	{ code: "DEMO-006", name: "Ramesh Kumar", father: "Suresh Kumar", gender: "Male", co: A, dept: "Production", desig: "Machine Operator",
		kind: "Wages", daily: 650, shift: "Day", pf: true, esi: true, ot: 30.5, last: { absent: [3, 15], half: [9], sick: [21] }, loan: 1000 },
	{ code: "DEMO-007", name: "Sanjay Mahato", father: "Bhola Mahato", gender: "Male", co: A, dept: "Production", desig: "Helper", mode: "Cash",
		kind: "Wages", daily: 550, shift: "Night", pf: false, esi: true, ot: 18, last: { absent: [12] } },
	{ code: "DEMO-008", name: "Anjali Nair", father: "Mohanan Nair", gender: "Female", co: A, dept: "Quality", desig: "Quality Inspector", bankPct: 50,
		kind: "Wages", daily: 600, shift: "General", pf: true, esi: true, food: 1000, ot: 6, last: { half: [4, 19] } },
	{ code: "DEMO-009", name: "Arun Das", father: "Haridas K", gender: "Male", co: A, dept: "Production", desig: "Helper", etype: "Contract",
		kind: "Wages", daily: 550, shift: "Day", pf: false, esi: true, joinsDay: 14, ot: 8 },
	{ code: "DEMO-010", name: "Mohan Lal", father: "Kishan Lal", gender: "Male", co: A, dept: "Production", desig: "Helper",
		kind: "Wages", daily: 520, shift: "Day", pf: false, esi: true, leavesPrevDay: 20 },
	{ code: "DEMO-011", name: "Sunny Mathew", father: "Mathew Joseph", gender: "Male", co: B, dept: "Administration", desig: "Manager",
		kind: "Salary", base: 48000, shift: "General", pf: true, esi: false, lwf: true, cl: true, ap: 3, advance: 15000 },
	{ code: "DEMO-012", name: "Deepa Raj", father: "Rajendran P", gender: "Female", co: B, dept: "Administration", desig: "Office Assistant",
		kind: "Salary", base: 15000, shift: "General", pf: false, esi: true, cl: true, ap: 1, last: { cl: [7, 8] } },
	{ code: "DEMO-013", name: "Manoj Kujur", father: "Somra Kujur", gender: "Male", co: B, dept: "Production", desig: "Machine Operator",
		kind: "Wages", daily: 700, shift: "Day", pf: true, esi: true, ot: 40, last: { half: [10] }, loanPlan: [8000, 800] },
	{ code: "DEMO-014", name: "Rakesh Oraon", father: "Budhu Oraon", gender: "Male", co: B, dept: "Production", desig: "Helper",
		kind: "Wages", daily: 560, shift: "Night", pf: false, esi: true, ot: 10, last: { absent: [2, 13, 22] }, draftAdvance: 500 },
].map((p, i) => ({
	...p,
	id: `HR-EMP-D${String(i + 1).padStart(4, "0")}`,
	/* A daily-wage person's monthly pay is 26 days of it, as the sheet's BE = BD × 26. */
	base: p.base || p.daily * 26,
}));

/* ------------------------------------------------------------ the data */

/**
 * The practice site's seed: `docs` by doctype, `singles`, and `meta`.
 * @param {{today?: Date, month?: string, slips?: boolean}} [opts]
 */
export function makeData({ today = new Date(), month = process.env.DEMO_MONTH, slips = process.env.DEMO_SLIPS !== "off" } = {}) {
	const thisYm = ymOf(today.getFullYear(), today.getMonth() + 1);
	const last = month && /^\d{4}-\d{2}$/.test(month) ? month : shiftYm(thisYm, -1);
	const prev = shiftYm(last, -1);
	const current = shiftYm(last, 1);
	const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
	const lastEnd = dayOf(last, daysIn(last));
	const stampOf = (d, t = "10:00:00") => `${d} ${t}.000000`;

	/* The calendar: every Sunday off, and one company holiday a month. */
	const holidayDay = (ym) => (weekday(ym, 15) === 0 ? 16 : 15);
	const holidays = [prev, last, current].flatMap((ym) => Array.from({ length: daysIn(ym) }, (_, k) => k + 1).flatMap((d) => {
		if (weekday(ym, d) === 0) return [{ holiday_date: dayOf(ym, d), weekly_off: 1, description: "Sunday" }];
		if (d === holidayDay(ym)) return [{ holiday_date: dayOf(ym, d), weekly_off: 0, description: "Company holiday (demo)" }];
		return [];
	}));
	const offDays = new Set(holidays.map((h) => h.holiday_date));
	const workingDays = (ym) => Array.from({ length: daysIn(ym) }, (_, k) => k + 1).filter((d) => !offDays.has(dayOf(ym, d)));

	const docs = {};
	const add = (dt, row) => { (docs[dt] = docs[dt] || []).push(row); return row; };
	let seq = 0;
	const next = (prefix) => `${prefix}-D${String(++seq).padStart(5, "0")}`;

	/* Companies, and what pages read off them. */
	for (const co of [A, B]) {
		add("Company", {
			name: co.name, company_name: co.name, abbr: co.abbr, country: "India", default_currency: "INR",
			default_holiday_list: "Demo Holidays", default_payroll_payable_account: `Payroll Payable - ${co.abbr}`,
			cost_center: `Main - ${co.abbr}`, round_off_cost_center: `Main - ${co.abbr}`,
			tax_id: "DEMO-NOT-A-REAL-GSTIN", phone_no: "0000 000000", email: "practice@example.invalid",
			registration_details: "Practice data — not a real company", docstatus: 0, modified: stampOf(dayOf(prev, 1)),
		});
		for (const [s, [start, end]] of Object.entries(SHIFT_TIMES)) {
			add("Shift Type", { name: `${co.abbr}-${s} Shift`, start_time: start, end_time: end, holiday_list: "Demo Holidays", enable_auto_attendance: 0, modified: stampOf(dayOf(prev, 1)) });
		}
		for (const d of ["Accounts", "Administration", "Production", "Quality", "Transport"]) {
			add("Department", { name: `${d} - ${co.abbr}`, department_name: d, company: co.name, disabled: 0, modified: stampOf(dayOf(prev, 1)) });
		}
	}
	add("Holiday List", { name: "Demo Holidays", holiday_list_name: "Demo Holidays", from_date: dayOf(prev, 1), to_date: dayOf(current, daysIn(current)), holidays, modified: stampOf(dayOf(prev, 1)) });
	for (const d of [...new Set(PEOPLE.map((p) => p.desig))]) add("Designation", { name: d, designation_name: d, modified: stampOf(dayOf(prev, 1)) });
	add("Branch", { name: "Rubber Park (Demo)", branch: "Rubber Park (Demo)", modified: stampOf(dayOf(prev, 1)) });
	for (const [name, lwp, earned] of [["Casual Leave", 0, 1], ["Leave Without Pay", 1, 0], ["Sick Leave", 0, 0], ["Privilege Leave", 0, 0], ["Compensatory Off", 0, 0]]) {
		add("Leave Type", { name, leave_type_name: name, is_lwp: lwp, is_earned_leave: earned, is_carry_forward: earned, modified: stampOf(dayOf(prev, 1)) });
	}

	/* Salary components, as the site will have them once set up. */
	for (const [name, abbr, type] of [["Basic", "B", "Earning"], ["Overtime", "OT", "Earning"], ["Bata", "BATA", "Earning"], ["Food Allowance", "FA", "Earning"],
		["Leave Encashment", "LENC", "Earning"], ["Provident Fund", "PF", "Deduction"], ["ESI", "ESI", "Deduction"], ["Professional Tax", "PT", "Deduction"],
		["Labour Welfare Fund", "LWF", "Deduction"], ["Salary Advance", "SADV", "Deduction"], ["Loan EMI", "LEMI", "Deduction"]]) {
		add("Salary Component", { name, salary_component: name, salary_component_abbr: abbr, type, disabled: 0, depends_on_payment_days: 0, modified: stampOf(dayOf(prev, 1)) });
	}
	const structureOf = (co) => `Demo Monthly Structure - ${co.abbr}`;
	for (const co of [A, B]) {
		add("Salary Structure", {
			name: structureOf(co), company: co.name, docstatus: 1, is_active: "Yes", payroll_frequency: "Monthly", currency: "INR",
			earnings: [{ salary_component: "Basic", abbr: "B", amount_based_on_formula: 1, formula: "base" }],
			deductions: [{ salary_component: "Professional Tax", abbr: "PT" }],
			modified: stampOf(dayOf(prev, 1)),
		});
	}
	add("Employee Loan Type", { name: "Staff Loan (Demo)", loan_type_name: "Staff Loan (Demo)", is_active: 1, interest_type: "Interest free", rate_of_interest: 0, term_months: 10, maximum_amount: 50000, salary_component: "Loan EMI", modified: stampOf(dayOf(prev, 1)) });

	/* People, and each one's two months. */
	const facts = new Map();
	for (const [i, p] of PEOPLE.entries()) {
		const joined = p.joinsDay ? dayOf(last, p.joinsDay) : `${Number(prev.slice(0, 4)) - 2}-${pad((i % 12) + 1)}-0${(i % 8) + 1}`;
		const relieved = p.leavesPrevDay ? dayOf(prev, p.leavesPrevDay) : "";
		const shiftName = `${p.co.abbr}-${p.shift} Shift`;
		add("Employee", {
			name: p.id, employee: p.id, employee_name: p.name, first_name: p.name.split(" ")[0], last_name: p.name.split(" ").slice(1).join(" "),
			employee_number: p.code, attendance_device_id: String(9001 + i), company: p.co.name, department: `${p.dept} - ${p.co.abbr}`,
			designation: p.desig, branch: "Rubber Park (Demo)", gender: p.gender, date_of_birth: `${1975 + (i * 2) % 25}-0${(i % 9) + 1}-1${i % 9}`,
			date_of_joining: joined, relieving_date: relieved || null, status: relieved ? "Left" : "Active",
			default_shift: shiftName, holiday_list: "Demo Holidays", employment_type: p.etype || "Full-time", salary_mode: p.mode || "Bank",
			custom_bank_percent: p.bankPct || "", custom_bank_amount: p.bankAmt || "",
			custom_father_name: p.father, custom_uan: p.pf ? `1000000000${String(i + 1).padStart(2, "0")}` : "",
			custom_pf_number: p.pf ? `KR/DEMO/${String(i + 1).padStart(5, "0")}` : "",
			custom_esic_number: p.esi ? `99000000${String(i + 1).padStart(2, "0")}` : "",
			bank_name: "Demo Bank", bank_ac_no: `00009${String(i + 1).padStart(6, "0")}`, ifsc_code: "DEMO0000001",
			cell_number: `90000000${String(i + 1).padStart(2, "0")}`, personal_email: "", company_email: "", prefered_email: "",
			salutation: p.gender === "Female" ? "Ms" : "Mr", reports_to: "", user_id: "", image: "", grade: "",
			ctc: p.base * 12, modified: stampOf(dayOf(prev, 1)), creation: stampOf(dayOf(prev, 1)),
		});
		add("Salary Structure Assignment", {
			name: next("HR-SSA"), employee: p.id, employee_name: p.name, salary_structure: structureOf(p.co), company: p.co.name,
			from_date: [joined, `${Number(prev.slice(0, 4)) - 1}-04-01`].sort()[1], base: p.base, variable: 0, currency: "INR", docstatus: 1,
			department: `${p.dept} - ${p.co.abbr}`, designation: p.desig, modified: stampOf(dayOf(prev, 1)),
		});

		/* Attendance, as hrms's shift job leaves it: a row for every working day
		   the person was employed, and none for a Sunday or a holiday. */
		const [inT, outT, hrs] = SHIFT_TIMES[p.shift];
		const tally = { [prev]: { worked: 0, absent: 0 }, [last]: { worked: 0, absent: 0 } };
		for (const ym of [prev, last]) {
			const plan = ym === last ? p.last || {} : { cl: p.prevCl || [] };
			workingDays(ym).forEach((d, k) => {
				const date = dayOf(ym, d);
				if (date < joined || (relieved && date > relieved)) return;
				const n = k + 1;
				const leave = (plan.cl || []).includes(n) ? "Casual Leave" : (plan.sick || []).includes(n) ? "Sick Leave" : "";
				const status = (plan.absent || []).includes(n) ? "Absent" : (plan.half || []).includes(n) ? "Half Day" : leave ? "On Leave" : "Present";
				const worked = status === "Present" ? 1 : status === "Half Day" ? 0.5 : 0;
				tally[ym].worked += worked;
				if (status === "Absent") tally[ym].absent += 1;
				const outDay = p.shift === "Night" ? dayOf(...(d === daysIn(ym) ? [shiftYm(ym, 1), 1] : [ym, d + 1])) : date;
				add("Attendance", {
					name: next("HR-ATT"), employee: p.id, employee_name: p.name, company: p.co.name, department: `${p.dept} - ${p.co.abbr}`,
					attendance_date: date, status, leave_type: leave || null, shift: shiftName, docstatus: 1,
					in_time: worked ? `${date} ${inT}` : null,
					out_time: worked ? (status === "Half Day" ? `${p.shift === "Night" ? outDay : date} ${p.shift === "General" ? "13:30:00" : p.shift === "Day" ? "14:30:00" : "02:30:00"}` : `${outDay} ${outT}`) : null,
					working_hours: worked * hrs, late_entry: 0, early_exit: 0, modified: stampOf(date, "23:00:00"), creation: stampOf(date, "23:00:00"),
				});
				if (leave) {
					add("Leave Application", {
						name: next("HR-LAP"), employee: p.id, employee_name: p.name, company: p.co.name, department: `${p.dept} - ${p.co.abbr}`,
						leave_type: leave, from_date: date, to_date: date, total_leave_days: 1, half_day: 0, status: "Approved", docstatus: 1,
						posting_date: date, description: "Personal work (demo)", leave_approver: "", leave_approver_name: "",
						modified: stampOf(date, "09:00:00"), creation: stampOf(date, "09:00:00"), owner: "practice@example.invalid", modified_by: "practice@example.invalid",
					});
				}
			});
		}

		/* Casual Leave — office staff, supervisors and drivers only, as on the
		   real site: a credit a month, last year's left-over carried in, a debit
		   for each day taken. Brought into last month: carry + 1 − prevCl = ap. */
		let AP = 0, AQ = 0;
		if (p.cl) {
			const prevTaken = (p.prevCl || []).length;
			const carry = p.ap - 1 + prevTaken;
			const ledger = (from_date, leaves, transaction_type, extra = {}) => add("Leave Ledger Entry", {
				name: next("HR-LLE"), employee: p.id, employee_name: p.name, company: p.co.name, leave_type: "Casual Leave",
				from_date, to_date: `${last.slice(0, 4)}-12-31`, leaves, transaction_type, is_carry_forward: 0, is_expired: 0, is_lwp: 0, docstatus: 1,
				modified: stampOf(from_date), creation: stampOf(from_date), ...extra,
			});
			if (carry > 0) ledger(dayOf(prev, 1), carry, "Leave Allocation", { is_carry_forward: 1 });
			ledger(dayOf(prev, 1), 1, "Leave Allocation");
			ledger(dayOf(last, 1), 1, "Leave Allocation");
			for (const ym of [prev, last]) {
				const plan = ym === last ? (p.last || {}).cl || [] : p.prevCl || [];
				for (const n of plan) ledger(dayOf(ym, workingDays(ym)[n - 1]), -1, "Leave Application");
			}
			add("Leave Allocation", {
				name: next("HR-LAL"), employee: p.id, employee_name: p.name, company: p.co.name, leave_type: "Casual Leave",
				from_date: dayOf(prev, 1), to_date: `${last.slice(0, 4)}-12-31`, new_leaves_allocated: 2, carry_forwarded_leaves: Math.max(carry, 0),
				total_leaves_allocated: Math.max(carry, 0) + 2, docstatus: 1, modified: stampOf(dayOf(prev, 1)),
			});
			AP = p.ap; AQ = 1;
		}

		/* Overtime, as HR enters it: a few hours on some of the days worked. */
		let left = p.ot || 0;
		const present = docs.Attendance.filter((a) => a.employee === p.id && a.attendance_date.startsWith(last) && a.status === "Present");
		for (let k = 2; left > 0 && k < present.length; k += 2) {
			const hours = Math.min(4, left);
			left = c2(left - hours);
			add("Employee Overtime", {
				name: next("HR-OT"), employee: p.id, employee_name: p.name, company: p.co.name, ot_date: present[k].attendance_date,
				hours, reason: "Production target (demo)", entered_by: "practice@example.invalid", docstatus: 0,
				modified: stampOf(present[k].attendance_date, "21:00:00"), creation: stampOf(present[k].attendance_date, "21:00:00"),
			});
		}

		facts.set(p.id, { p, joined, relieved, shiftHours: hrs, AL: tally[last].worked, absent: tally[last].absent, AP, AQ });
	}

	/* What was added for last month: two advances, a loan instalment and one
	   advance still a draft — Frappe takes nothing from pay until it is submitted. */
	const extra = (p, component, amount, docstatus, more = {}) => add("Additional Salary", {
		name: next("HR-ADS"), employee: p.id, employee_name: p.name, company: p.co.name, salary_component: component,
		type: "Deduction", amount, payroll_date: lastEnd, overwrite_salary_structure_amount: 1, docstatus,
		currency: "INR", modified: stampOf(dayOf(last, 25)), creation: stampOf(dayOf(last, 25)), ...more,
	});
	for (const p of PEOPLE) {
		if (p.advance) extra(p, "Salary Advance", p.advance, 1);
		if (p.draftAdvance) extra(p, "Salary Advance", p.draftAdvance, 0);
	}

	/* Two staff loans: one running for months, whose instalment is already on
	   last month's slip; one starting last month, not yet added. */
	const loan = (p, amount, instalment, startYm, name) => {
		const schedule = Array.from({ length: Math.ceil(amount / instalment) }, (_, k) => {
			const period = shiftYm(startYm, k);
			return { period, due_date: dayOf(period, daysIn(period)), principal_amount: instalment, interest_amount: 0, total_amount: instalment,
				paid_amount: period < last ? instalment : 0, status: period < last ? "Paid" : "Pending" };
		});
		const paid = schedule.filter((s) => s.status === "Paid").length * instalment;
		return add("Employee Loan Application", {
			name, employee: p.id, employee_name: p.name, company: p.co.name, loan_type: "Staff Loan (Demo)", interest_type: "Interest free",
			loan_status: "Running", amount_requested: amount, sanctioned_amount: amount, disbursed_amount: amount, opening_balance: 0,
			recovered_amount: paid, outstanding_amount: amount - paid, loan_date: dayOf(startYm, 1), deduction_start_from: dayOf(startYm, 1),
			monthly_instalment: instalment, salary_component: "Loan EMI", repayment_schedule: schedule, loan_completed: 0,
			docstatus: 0, modified: stampOf(dayOf(startYm, 1)), creation: stampOf(dayOf(startYm, 1)),
		});
	};
	const ramesh = PEOPLE.find((p) => p.loan);
	const running = loan(ramesh, 10000, ramesh.loan, shiftYm(last, -3), "HR-LOAN-D0001");
	extra(ramesh, "Loan EMI", ramesh.loan, 1, { ref_doctype: "Employee Loan Application", ref_docname: running.name });
	const manoj = PEOPLE.find((p) => p.loanPlan);
	loan(manoj, manoj.loanPlan[0], manoj.loanPlan[1], last, "HR-LOAN-D0002");

	/* Last month's payroll run for the first company: the entry, and a
	   submitted slip for everybody on it. */
	const D = daysIn(last);
	const sundays = Array.from({ length: D }, (_, k) => k + 1).filter((d) => weekday(last, d) === 0).length;
	const holidayCount = holidays.filter((h) => h.holiday_date.startsWith(last) && !h.weekly_off).length;
	if (slips) {
		const onRun = PEOPLE.filter((p) => p.co === A && !facts.get(p.id).relieved);
		const entry = add("Payroll Entry", {
			name: "HR-PRUN-D0001", company: A.name, start_date: dayOf(last, 1), end_date: lastEnd, posting_date: lastEnd,
			payroll_frequency: "Monthly", currency: "INR", docstatus: 1, status: "Submitted", number_of_employees: onRun.length,
			salary_slips_created: 1, salary_slips_submitted: 1, owner: "practice@example.invalid",
			employees: onRun.map((p) => ({ employee: p.id, employee_name: p.name, department: `${p.dept} - ${p.co.abbr}`, designation: p.desig })),
			modified: stampOf(lastEnd, "18:00:00"), creation: stampOf(lastEnd, "17:00:00"),
		});
		for (const [k, p] of onRun.entries()) {
			const f = facts.get(p.id);
			const ot = (docs["Employee Overtime"] || []).filter((o) => o.employee === p.id && o.ot_date.startsWith(last)).reduce((t, o) => t + o.hours, 0);
			const advance = (docs["Additional Salary"] || []).filter((x) => x.employee === p.id && x.docstatus === 1 && x.salary_component === "Salary Advance").reduce((t, x) => t + x.amount, 0);
			const loanCut = (docs["Additional Salary"] || []).filter((x) => x.employee === p.id && x.docstatus === 1 && x.salary_component === "Loan EMI").reduce((t, x) => t + x.amount, 0);
			const slip = practiceSlip(p, {
				D, AL: f.AL, AM: sundays, AN: holidayCount, AP: f.AP, AQ: f.AQ, ot, h: f.shiftHours >= 11 ? 12 : 8,
				bataDays: (p.bata || [])[0] || 0, bataRate: (p.bata || [])[1] || 0, advance, loan: loanCut,
			});
			add("Salary Slip", {
				name: `Sal Slip/${p.id}/${String(k + 1).padStart(5, "0")}`, employee: p.id, employee_name: p.name, company: A.name,
				department: `${p.dept} - ${p.co.abbr}`, designation: p.desig, branch: "Rubber Park (Demo)",
				start_date: dayOf(last, 1), end_date: lastEnd, posting_date: lastEnd, docstatus: 1, status: "Submitted",
				payroll_entry: entry.name, salary_structure: structureOf(A), payroll_frequency: "Monthly", currency: "INR",
				absent_days: f.absent, bank_name: "Demo Bank", bank_account_no: docs.Employee.find((e) => e.name === p.id).bank_ac_no,
				...slip, modified: stampOf(lastEnd, "18:00:00"), creation: stampOf(lastEnd, "17:00:00"),
			});
		}
	}

	/* A few punches today, so the dashboard has a morning on it. */
	for (const [i, p] of PEOPLE.filter((x) => !x.leavesPrevDay && !x.joinsDay).slice(0, 9).entries()) {
		const [inT] = SHIFT_TIMES[p.shift];
		const [h, m] = inT.split(":").map(Number);
		add("Employee Checkin", {
			name: next("EMP-CKIN"), employee: p.id, employee_name: p.name, log_type: "IN", device_id: "BIO-DEMO-GATE1",
			time: `${todayIso} ${pad(h)}:${pad(Math.max(0, m - 10 + i * 3) % 60)}:00`, modified: stampOf(todayIso, inT), creation: stampOf(todayIso, inT),
		});
	}

	return {
		docs,
		singles: {
			"Payroll Settings": { payroll_based_on: "Attendance", include_holidays_in_total_working_days: 1, consider_unmarked_attendance_as: "Absent",
				daily_wages_fraction_for_half_day: 0.5, email_salary_slip_to_employee: 0, show_leave_balances_in_salary_slip: 1 },
			"HR Settings": { leave_approver_mandatory_in_leave_application: 0, standard_working_hours: 8, emp_created_by: "Naming Series" },
			"Manna HR Settings": {},
		},
		meta: {
			month: last, monthLabel: labelOf(last), prevMonth: prev, companies: [A.name, B.name],
			slipsCompany: slips ? A.name : null, people: PEOPLE.length,
		},
	};
}
