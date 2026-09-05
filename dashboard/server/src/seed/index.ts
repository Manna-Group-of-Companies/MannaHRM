import fs from "node:fs";
import path from "node:path";
import type { Model } from "mongoose";
import { connect, disconnect } from "../db.js";
import { bumpSeries, CounterModel } from "../doctypes/base.js";
import { EmployeeModel } from "../doctypes/Employee.js";
import {
	AssetCategoryModel, CompanyModel, DepartmentModel, DesignationModel, HolidayListModel,
	LeaveTypeModel, LetterTypeModel, SalaryComponentModel, ShiftTypeModel,
} from "../doctypes/masters.js";
import {
	AttendanceModel, AttendanceRegularizationModel, EmployeeCheckinModel, ShiftAssignmentModel,
} from "../doctypes/attendance.js";
import { LeaveApplicationModel } from "../doctypes/leave.js";
import {
	AssetModel, AssetMovementModel, EmployeeLetterModel, EmployeeOnboardingModel,
} from "../doctypes/onboard.js";
import { FileModel } from "../doctypes/file.js";
import {
	ASSET_KINDS, ASSET_VENDORS, BLOOD_GROUPS, BRANCHES, COMPANY, DEPARTMENTS, DESIGNATIONS,
	EMPLOYMENT_TYPES, FIRST_NAMES, GENDERS, GRADES, HOLIDAYS_2026, LAST_NAMES,
	LEAVE_TYPES, LETTER_REMARKS, LETTER_TYPES, MARITAL, SALARY_COMPONENTS, SHIFT_TYPES,
} from "./data.js";

/* ---------------------------------------------------------------------------
   A site with people on it.

   Run once against an empty database and the dashboard has something to draw:
   sixty-two employees across nine departments, a month of punches, a month of
   attendance, two live approval queues, assets that are out with people, and
   the masters everything links to.

   **It clears the collections it writes.** Not the database — only the twelve
   collections listed in `wipe()` — but that is still destructive, and it is
   guarded: the seed refuses to run against a URI that does not look like a
   development one unless `SEED_FORCE=1` is set. A seed that can be pointed at
   production by a mistyped environment variable is a seed that eventually is.

   Everything below is deterministic. The generator is seeded, so two runs
   produce the same sixty-two people with the same codes — which means a bug
   somebody found on employee HR-EMP-00023 is still on HR-EMP-00023 after they
   reseed to reproduce it.
   --------------------------------------------------------------------------- */

/* ------------------------------------------------------------------- random */

/** mulberry32 — small, fast, and seeded. The point is not the quality of the
    randomness, it is that it repeats. */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const rand = rng(20260903);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const between = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p: number): boolean => rand() < p;

/* --------------------------------------------------------------------- dates */

const iso = (d: Date): string => d.toISOString().slice(0, 10);

function addDays(from: Date, days: number): Date {
	const out = new Date(from);
	out.setDate(out.getDate() + days);
	return out;
}

/** Two digits, for building `HH:MM:SS` without a Date and its timezone. */
const pad = (n: number): string => String(n).padStart(2, "0");
const clock = (h: number, m: number): string => `${pad(h)}:${pad(m)}:00`;

const TODAY = new Date();
const HOLIDAY_DATES = new Set(HOLIDAYS_2026.map(([date]) => date));

/** Sunday, or a listed holiday. Saturdays are working days here — this is a
    plant, and a seed that gave everybody a five-day week would make the
    attendance screens look wrong to the people who use them. */
function isOff(day: Date): boolean {
	return day.getDay() === 0 || HOLIDAY_DATES.has(iso(day));
}

/* --------------------------------------------------------------------- wipe */

/* Typed as the base model rather than as the union of eighteen concrete ones.
   TypeScript will not call `deleteMany` on that union — each member has its own
   overload set and none of them is assignable to the others — and the only
   thing this list is ever used for is calling it on all of them. */
const COLLECTIONS: Model<any>[] = [
	CompanyModel, DepartmentModel, DesignationModel, HolidayListModel, LeaveTypeModel,
	ShiftTypeModel, LetterTypeModel, SalaryComponentModel, AssetCategoryModel, EmployeeModel,
	EmployeeCheckinModel, AttendanceModel, ShiftAssignmentModel,
	AttendanceRegularizationModel, LeaveApplicationModel,
	AssetModel, AssetMovementModel, EmployeeLetterModel, EmployeeOnboardingModel,
	FileModel, CounterModel,
];

/** Refuse a URI that does not read as a development one. Names containing
    `prod`, and any host that is not local, need `SEED_FORCE=1` said out loud. */
function guard(uri: string): void {
	if (process.env.SEED_FORCE === "1") return;
	const local = /(localhost|127\.0\.0\.1|mongo:)/.test(uri);
	const named = /(prod|production|live)/i.test(uri);
	if (local && !named) return;
	throw new Error(
		`Refusing to seed ${uri.replace(/\/\/([^:@/]+):([^@]+)@/, "//$1:***@")} — it does not look `
		+ "like a development database, and seeding drops every collection it writes. "
		+ "Set SEED_FORCE=1 if this is really what you want.",
	);
}

async function wipe(): Promise<void> {
	for (const model of COLLECTIONS) await model.deleteMany({});
}

/* ------------------------------------------------------------------ masters */

async function seedMasters(): Promise<void> {
	await CompanyModel.create({ ...COMPANY, default_currency: "INR", country: "India" });

	await DepartmentModel.insertMany(
		DEPARTMENTS.map(([name, disabled]) => ({
			name, department_name: name, company: COMPANY.name, disabled,
		})),
	);

	await DesignationModel.insertMany(
		DESIGNATIONS.map((name) => ({ name, designation_name: name })),
	);

	await ShiftTypeModel.insertMany(
		SHIFT_TYPES.map((s) => ({ ...s, holiday_list: COMPANY.default_holiday_list, enable_auto_attendance: 1 })),
	);

	await LeaveTypeModel.insertMany(
		LEAVE_TYPES.map((t) => ({ ...t, leave_type_name: t.name })),
	);

	await LetterTypeModel.insertMany(LETTER_TYPES);

	await SalaryComponentModel.insertMany(
		SALARY_COMPONENTS.map((c) => ({
			name: c.name,
			salary_component: c.name,
			salary_component_abbr: c.abbr,
			type: c.type,
			do_not_include_in_total: c.ctc,
			amount_based_on_formula: 0,
		})),
	);

	/* The dates are a child table, which is why the client fetches this document
	   whole rather than reading the dates off a list call. */
	await HolidayListModel.create({
		name: COMPANY.default_holiday_list,
		holiday_list_name: COMPANY.default_holiday_list,
		from_date: "2026-01-01",
		to_date: "2026-12-31",
		weekly_off: "Sunday",
		holidays: [
			...HOLIDAYS_2026.map(([holiday_date, description]) => ({
				holiday_date, description, weekly_off: 0,
			})),
			...sundaysOf(2026).map((holiday_date) => ({
				holiday_date, description: "Sunday", weekly_off: 1,
			})),
		],
	});
}

function sundaysOf(year: number): string[] {
	const out: string[] = [];
	const day = new Date(Date.UTC(year, 0, 1));
	while (day.getUTCDay() !== 0) day.setUTCDate(day.getUTCDate() + 1);
	while (day.getUTCFullYear() === year) {
		out.push(day.toISOString().slice(0, 10));
		day.setUTCDate(day.getUTCDate() + 7);
	}
	return out;
}

/* ---------------------------------------------------------------- employees */

const HEADCOUNT = 62;

interface Person {
	name: string;
	/* The code people actually quote, as against `name`, which is the record id.
	   Carried here so the onboarding fixture can name a pulled candidate's code
	   after the employee they became rather than inventing a second one. */
	employee_number: string;
	employee_name: string;
	department: string;
	designation: string;
	default_shift: string;
	status: string;
	date_of_joining: string;
	attendance_device_id: string;
}

async function seedEmployees(): Promise<Person[]> {
	const activeDepartments = DEPARTMENTS.filter(([, off]) => !off).map(([name]) => name);
	const people: Person[] = [];
	const docs: Record<string, unknown>[] = [];

	for (let i = 1; i <= HEADCOUNT; i++) {
		const first = pick(FIRST_NAMES);
		const last = pick(LAST_NAMES);
		const name = `HR-EMP-${String(i).padStart(5, "0")}`;
		const code = `MRI${String(1000 + i)}`;

		/* Most people are Active. A handful have left and a couple are suspended,
		   because a directory where every status is the same never exercises the
		   filter that exists to separate them — and because Final Settlement's
		   whole queue is the people with a relieving date. */
		const status = chance(0.86) ? "Active" : chance(0.55) ? "Left" : "Inactive";

		const joined = addDays(TODAY, -between(45, 3600));
		const relieving = status === "Left" ? iso(addDays(joined, between(400, 2000))) : undefined;

		/* Machine codes are issued in a block and reissued when somebody leaves —
		   which is exactly the condition the client's duplicate check is careful
		   about. Left deliberately reusable here so the check has something real
		   to be right about. */
		const device = String(100 + (i % 90));

		const shift = chance(0.55) ? "General" : pick(SHIFT_TYPES).name;
		const department = pick(activeDepartments);
		const designation = pick(DESIGNATIONS);
		const dob = iso(addDays(TODAY, -between(21 * 365, 56 * 365)));

		/* A CTC that reads like one: a round monthly figure times twelve, spread
		   over a grade rather than uniform. */
		const monthly = between(18, 95) * 1000;

		docs.push({
			name,
			employee_number: code,
			first_name: first,
			last_name: last,
			salutation: chance(0.5) ? "Mr" : "Ms",
			gender: pick(GENDERS),
			date_of_birth: dob,
			blood_group: pick(BLOOD_GROUPS),
			marital_status: pick(MARITAL),

			status,
			company: COMPANY.name,
			department,
			designation,
			branch: pick(BRANCHES),
			grade: pick(GRADES),
			employment_type: pick(EMPLOYMENT_TYPES),
			date_of_joining: iso(joined),
			final_confirmation_date: chance(0.7) ? iso(addDays(joined, 180)) : undefined,
			relieving_date: relieving,
			reason_for_leaving: relieving ? pick(["Resigned", "Contract ended", "Retired"]) : undefined,

			attendance_device_id: device,
			default_shift: shift,
			holiday_list: COMPANY.default_holiday_list,
			custom_allow_remote_punch: chance(0.15) ? 1 : 0,

			cell_number: `9${between(100000000, 899999999)}`,
			personal_email: `${first}.${last}${i}`.toLowerCase() + "@example.com",
			company_email: `${first}.${last}${i}`.toLowerCase() + "@mannarubber.example",
			prefered_email: `${first}.${last}${i}`.toLowerCase() + "@mannarubber.example",
			current_address: `${between(1, 90)}, ${pick(["Anna Nagar", "Avadi", "Poonamallee", "Ambattur", "Porur"])}, Chennai`,
			person_to_be_contacted: `${pick(FIRST_NAMES)} ${last}`,
			relation: pick(["Spouse", "Father", "Mother", "Sibling"]),
			emergency_phone_number: `9${between(100000000, 899999999)}`,

			/* PAN and PF are filled in for most but not all. The screens that
			   report on them exist to find the gap, and a seed with no gap makes
			   every one of those reports look like it is broken. */
			pan_number: chance(0.8) ? panLike() : undefined,
			custom_pan_no: chance(0.8) ? panLike() : undefined,

			/* Passports, on about one person in six — and the fixture is the
			   ratio rather than the number. On the live tenant this field is
			   empty on all 504, which is what On Board's expiry watch reports and
			   should keep reporting; a seed that filled it in on everybody would
			   make the one screen written to find that gap look like it could not
			   find one, and a seed that filled it in on nobody would leave the
			   whole expiry path — the pill, the countdown chip, the watch list,
			   the attachment against a passport — running only in production.
			   Both states are wanted, so both are here.

			   The dates deliberately straddle today: a passport issued ten years
			   ago and valid for ten is expired, and the chip that says so is the
			   one thing this dashboard does that Factor HR's own register does
			   not. */
			...(chance(0.18)
				? (() => {
					const issued = addDays(TODAY, -between(200, 3600));
					return {
						passport_number: passportLike(),
						date_of_issue: iso(issued),
						valid_upto: iso(addDays(issued, 3650)),
						place_of_issue: pick(["Chennai", "Madurai", "Trichy", "Coimbatore"]),
					};
				})()
				: {}),
			provident_fund_account: chance(0.75) ? `TN/AMB/${between(10000, 99999)}/${between(1, 999)}` : undefined,

			ctc: monthly * 12,
			salary_currency: "INR",
			salary_mode: pick(["Bank", "Bank", "Bank", "Cash"]),
			bank_name: chance(0.85) ? pick(["State Bank of India", "HDFC Bank", "Indian Bank", "ICICI Bank"]) : undefined,
			bank_ac_no: chance(0.85) ? String(between(10000000000, 99999999999)) : undefined,

			employee_education: chance(0.6)
				? [{
					school_univ: pick(["Anna University", "Madras University", "ITI Ambattur", "Govt Polytechnic"]),
					qualification: pick(["B.E.", "Diploma", "ITI", "B.Com"]),
					level: pick(["Graduate", "Under Graduate"]),
					year_of_passing: between(2004, 2024),
					class_per: `${between(58, 88)}%`,
				}]
				: [],
			employee_external_work_history: chance(0.4)
				? [{
					company_name: pick(["Rane TRW", "Sundaram Fasteners", "TVS Rubber", "Lucas Indian Service"]),
					designation: pick(DESIGNATIONS),
					salary: between(12, 45) * 1000,
					total_experience: `${between(1, 8)} years`,
				}]
				: [],
			employee_internal_work_history: [],
		});

		people.push({
			name, employee_number: code, employee_name: `${first} ${last}`, department, designation,
			default_shift: shift, status, date_of_joining: iso(joined),
			attendance_device_id: device,
		});
	}

	/* `reports_to` in a second pass, because a manager has to exist before
	   anybody can point at them. Supervisors and above report to the plant
	   manager; everybody else reports to a supervisor in their own department,
	   which is what makes the approval routing on the queues mean anything. */
	const supervisors = docs.filter((d) =>
		String(d.designation).includes("Supervisor") || String(d.designation) === "Plant Manager");
	for (const doc of docs) {
		if (supervisors.includes(doc)) continue;
		const own = supervisors.filter((s) => s.department === doc.department);
		const boss = own.length ? own[between(0, own.length - 1)] : supervisors[0];
		if (boss) {
			doc.reports_to = boss.name;
			doc.leave_approver = boss.company_email;
		}
	}

	await EmployeeModel.insertMany(docs);
	/* Move the series past what was just written, so the first employee created
	   through the API does not collide with HR-EMP-00001. */
	await bumpSeries("HR-EMP-", HEADCOUNT);

	return people;
}

/** Something PAN-shaped: five letters, four digits, a letter. Not a real one,
    and not checksummed — this is a value for a column to hold, not an identity. */
function panLike(): string {
	const letter = (): string => "ABCDEFGHJKLMNPQRSTUVWXYZ"[between(0, 23)] as string;
	return `${letter()}${letter()}${letter()}${letter()}${letter()}`
		+ String(between(1000, 9999))
		+ letter();
}

/** Something passport-shaped: a letter and seven digits, which is the Indian
    format. Not a real one and not issued to anybody — same rule as `panLike`. */
function passportLike(): string {
	return "ABCEFGHJKLMNPRSTUVWXYZ"[between(0, 21)] + String(between(1000000, 9999999));
}

/* --------------------------------------------------------- shifts and punches */

const HISTORY_DAYS = 35;

async function seedAttendance(people: Person[]): Promise<void> {
	const active = people.filter((p) => p.status === "Active");

	/* Who is measured against which shift, and from when. Open-ended: somebody
	   is on the general shift until they are moved off it, and an assignment
	   with no end date is the normal case rather than a missing value. */
	await ShiftAssignmentModel.insertMany(
		active.map((p, i) => ({
			name: `HR-SHA-${String(i + 1).padStart(5, "0")}`,
			employee: p.name,
			employee_name: p.employee_name,
			shift_type: p.default_shift,
			start_date: p.date_of_joining,
			company: COMPANY.name,
			department: p.department,
			status: "Active",
		})),
	);
	await bumpSeries("HR-SHA-", active.length);

	const shiftStart = new Map(SHIFT_TYPES.map((s) => [s.name, Number(s.start_time.slice(0, 2))]));

	const checkins: Record<string, unknown>[] = [];
	const attendance: Record<string, unknown>[] = [];
	let ckin = 0;
	let att = 0;

	for (let back = HISTORY_DAYS; back >= 0; back--) {
		const day = addDays(TODAY, -back);
		const date = iso(day);
		if (isOff(day)) continue;

		for (const person of active) {
			if (person.date_of_joining > date) continue;

			/* Ninety-two per cent present is what a plant roll actually looks like.
			   The rest is what the absence reports exist to find. */
			const roll = rand();
			const status = roll < 0.92 ? "Present" : roll < 0.965 ? "On Leave" : roll < 0.985 ? "Absent" : "Half Day";

			const start = shiftStart.get(person.default_shift) ?? 9;
			/* A few minutes either side, and a late entry now and then. */
			const late = chance(0.08);
			const inMin = late ? between(20, 75) : between(-25, 8);
			const workedHours = status === "Half Day" ? 4 : 8;

			if (status === "Present" || status === "Half Day") {
				const inH = start + Math.floor(inMin / 60);
				const inM = ((inMin % 60) + 60) % 60;
				checkins.push({
					name: `EMP-CKIN-${String(++ckin).padStart(8, "0")}`,
					employee: person.name,
					employee_name: person.employee_name,
					/* `YYYY-MM-DD HH:MM:SS`, because the client filters today's punches
					   with a lexicographic `>=` against exactly that shape. */
					time: `${date} ${clock((inH + 24) % 24, inM)}`,
					log_type: "IN",
					device_id: person.attendance_device_id,
					shift: person.default_shift,
				});
				checkins.push({
					name: `EMP-CKIN-${String(++ckin).padStart(8, "0")}`,
					employee: person.name,
					employee_name: person.employee_name,
					time: `${date} ${clock((start + workedHours + 24) % 24, between(0, 40))}`,
					log_type: "OUT",
					device_id: person.attendance_device_id,
					shift: person.default_shift,
				});
			}

			attendance.push({
				name: `HR-ATT-${String(++att).padStart(8, "0")}`,
				employee: person.name,
				employee_name: person.employee_name,
				attendance_date: date,
				status,
				company: COMPANY.name,
				shift: person.default_shift,
				working_hours: status === "Present" ? workedHours : status === "Half Day" ? 4 : 0,
				late_entry: late ? 1 : 0,
				/* Submitted, because these are days that have been judged. It is
				   also what makes the PUT rule real: a submitted document refuses
				   to be edited through this API. */
				docstatus: 1,
			});
		}
	}

	await EmployeeCheckinModel.insertMany(checkins);
	await AttendanceModel.insertMany(attendance);
	await bumpSeries("EMP-CKIN-", ckin);
	await bumpSeries("HR-ATT-", att);

	console.log(`[seed]   ${checkins.length} punches, ${attendance.length} attendance days`);
}

/* ---------------------------------------------------------------- the queues */

async function seedQueues(people: Person[]): Promise<void> {
	const active = people.filter((p) => p.status === "Active");

	/* Corrections waiting for a decision — the attendance queue on the dashboard.
	   All Pending Approval, because a queue seeded with decided rows is a queue
	   that opens empty and teaches nobody anything about the screen. */
	const regs = active.slice(0, 14).map((p, i) => ({
		name: `HR-AREG-${String(i + 1).padStart(5, "0")}`,
		employee: p.name,
		employee_name: p.employee_name,
		company: COMPANY.name,
		attendance_date: iso(addDays(TODAY, -between(1, 20))),
		requested_in: clock(between(6, 10), between(0, 59)),
		requested_out: clock(between(15, 21), between(0, 59)),
		reason: pick([
			"Finger not read at the gate", "Was on the Sriperumbudur line",
			"Machine was down at shift change", "Came in through the goods gate",
			"Forgot to punch out",
		]),
		status: "Pending Approval",
		approver_type: "Reporting Manager",
	}));
	await AttendanceRegularizationModel.insertMany(regs);
	await bumpSeries("HR-AREG-", regs.length);

	/* Leave, in three populations, because the client reads it three ways: Open
	   is the queue, everything for one person is the history, and Approved is the
	   availed half of the balance report. A seed with only Open rows leaves two
	   of those three screens empty. */
	const leaves: Record<string, unknown>[] = [];
	let n = 0;
	for (const person of active) {
		const count = between(0, 4);
		for (let i = 0; i < count; i++) {
			const from = addDays(TODAY, -between(-20, 200));
			const days = between(1, 4);
			const half = days === 1 && chance(0.2);
			const status = i === 0 && chance(0.3) ? "Open" : pick(["Approved", "Approved", "Approved", "Rejected"]);
			leaves.push({
				name: `HR-LAP-${String(++n).padStart(5, "0")}`,
				employee: person.name,
				employee_name: person.employee_name,
				company: COMPANY.name,
				leave_type: pick(LEAVE_TYPES).name,
				from_date: iso(from),
				to_date: iso(addDays(from, days - 1)),
				half_day: half ? 1 : 0,
				half_day_date: half ? iso(from) : undefined,
				total_leave_days: half ? 0.5 : days,
				leave_balance: between(0, 18),
				posting_date: iso(addDays(from, -between(1, 10))),
				status,
				description: pick([
					"Family function", "Not well", "Personal work",
					"Out of station", "Medical appointment",
				]),
				/* Only decided applications are submitted. An Open one is a draft,
				   which is what lets the approval queue write a decision onto it. */
				docstatus: status === "Open" ? 0 : 1,
			});
		}
	}
	await LeaveApplicationModel.insertMany(leaves);
	await bumpSeries("HR-LAP-", n);

	const open = leaves.filter((l) => l.status === "Open").length;
	console.log(`[seed]   ${regs.length} regularizations, ${leaves.length} leave applications (${open} open)`);
}

/* -------------------------------------------------------------- on board */

async function seedOnboard(people: Person[]): Promise<void> {
	const active = people.filter((p) => p.status === "Active");

	/* The Asset Type master, off the categories the assets below actually use.
	   Derived rather than listed twice: a master holding a category no asset is
	   in, or an asset in a category the master has not got, is the kind of
	   disagreement a seed should not be the source of. */
	const categories = [...new Set(ASSET_KINDS.map(([category]) => category))].sort();
	await AssetCategoryModel.insertMany(
		categories.map((name) => ({ name, asset_category_name: name })),
	);

	const assets: Record<string, unknown>[] = [];
	const moves: Record<string, unknown>[] = [];

	for (let i = 1; i <= 48; i++) {
		const [category, item] = pick(ASSET_KINDS);
		/* Two thirds are out with somebody; the rest are in a store room. An
		   asset with no custodian and an asset whose custodian was never recorded
		   look the same here, which is worth knowing before reading a coverage
		   figure off this collection. */
		const holder = chance(0.68) ? pick(active) : null;
		const assetName = `ACC-ASS-${String(i).padStart(5, "0")}`;

		assets.push({
			name: assetName,
			asset_name: `${item} ${String(i).padStart(3, "0")}`,
			item_code: `${category.slice(0, 2).toUpperCase()}-${item.replace(/\s+/g, "").slice(0, 6).toUpperCase()}`,
			asset_category: category,
			custodian: holder?.name,
			location: holder ? pick(BRANCHES) : "Central Store",
			purchase_date: iso(addDays(TODAY, -between(60, 1500))),
			gross_purchase_amount: between(2, 90) * 1000,
			status: holder ? "In Use" : "Available",
			company: COMPANY.name,
			/* Most assets are one of a thing; a few are a batch bought together,
			   which is what makes Factor HR's Quantity and Rate pair worth
			   drawing rather than a column of 1s. */
			asset_quantity: chance(0.8) ? 1 : between(2, 12),
			/* Warranty runs from the purchase, and plenty have run out — an
			   expired warranty is the row somebody actually needs to see, the
			   same way an expired passport is on Document Entry. */
			warranty_expiry_date: chance(0.75)
				? iso(addDays(TODAY, -between(60, 1500) + between(365, 1460)))
				: undefined,
			supplier: chance(0.85) ? pick(ASSET_VENDORS) : undefined,
			/* Serialised kit only. A chair has no serial number, and a blank here
			   is a fact about the asset rather than a gap in the record. */
			serial_no: chance(0.55)
				? `${category.slice(0, 3).toUpperCase()}${between(10000, 99999)}${between(100, 999)}`
				: undefined,
			/* **Mostly drafts, and that is the state this dashboard is about.** An
			   asset is submitted when it goes on the books; a site that has just
			   been migrated has its assets loaded and not yet submitted, because an
			   import writes records and somebody submits them in batches
			   afterwards. That is exactly the site this whole app exists to look
			   at, and it is what the register underneath shows.

			   It decides what On Board's Assets Details can do with a row, which is
			   why the ratio is a fixture rather than a detail: submitted is history,
			   so the PUT and DELETE routes both refuse it and the form can only be
			   typed into on a draft. All submitted would leave the editing path
			   running in production only; none would hide the refusal the form has
			   to explain. A quarter, so both are met without looking for them.

			   Rolled independently of the custodian, unlike the first cut of this:
			   tying the two made every held asset unwritable and every writable one
			   free of movements, so neither Delete's link guard nor Edit's
			   submitted guard could be met on the same record. */
			docstatus: chance(0.25) ? 1 : 0,
		});

		if (holder) {
			moves.push({
				name: `ACC-ASM-${String(moves.length + 1).padStart(5, "0")}`,
				transaction_date: `${iso(addDays(TODAY, -between(1, 400)))} ${clock(between(9, 17), between(0, 59))}`,
				purpose: "Issue",
				company: COMPANY.name,
				asset: assetName,
				to_employee: holder.name,
				docstatus: 1,
			});
		}
	}

	await AssetModel.insertMany(assets);
	await AssetMovementModel.insertMany(moves);
	await bumpSeries("ACC-ASS-", assets.length);
	await bumpSeries("ACC-ASM-", moves.length);

	/* Letters that have been issued. Their bodies are kept as they went out
	   rather than re-merged from the record, because a letter re-merged from a
	   record that has since changed is not the letter somebody was handed. */
	const letters = active.slice(0, 20).map((p, i) => ({
		name: `HR-LTR-${String(i + 1).padStart(5, "0")}`,
		employee: p.name,
		employee_name: p.employee_name,
		letter_type: pick(LETTER_TYPES.filter((t) => t.is_active === 1)).name,
		letter_date: iso(addDays(TODAY, -between(5, 500))),
		/* A running number across the register, which is the reading of Factor
		   HR's column that assumes least: theirs shows 2 against a list holding
		   one row, so it is neither the row's position nor a per-person count. */
		letter_number: i + 1,
		/* Mostly blank, deliberately. Both columns are maintained on their screen
		   and empty on the one letter that exists there — a list where every cell
		   is filled would hide exactly the thing this page is for. */
		reference_number: i % 4 === 0 ? `REF/${2020 + (i % 5)}/${String(i + 1).padStart(3, "0")}` : "",
		remarks: i % 5 === 2 ? pick(LETTER_REMARKS) : "",
		body: `This is to certify that ${p.employee_name} is employed with ${COMPANY.name} `
			+ `as ${p.designation} in the ${p.department} department.`,
	}));
	await EmployeeLetterModel.insertMany(letters);
	await bumpSeries("HR-LTR-", letters.length);

	console.log(`[seed]   ${assets.length} assets in ${categories.length} categories, `
		+ `${moves.length} movements, ${letters.length} letters`);
}

/* ------------------------------------------------------------- candidates */

/** The queue behind Employee Master → Import From Onboarding.

    Eight people who have been hired and are not on the payroll yet, and the
    shape of the eight is the point rather than the number:

      · **Six are waiting and two have already been pulled.** A screen whose
        every row offers the same button never shows what the button does once
        it has been pressed, and "pulled" is a state somebody has to be able to
        recognise on a list they come back to. The two carry an `employee` and
        a code, because that is what a pull leaves behind.
      · **Two of the six have no mobile number and one has no personal email.**
        Those are the columns the card draws as a dash, and a fixture with no
        dash in it makes a screen that reports gaps look like it cannot find
        one — the same bargain the passport dates upstairs make.
      · **Joining dates straddle today.** Somebody who was due to start last
        week and has not been created is the row this screen exists to surface;
        somebody starting next month is merely early. The screen sorts on it
        and says which is which, so the fixture has to contain both.

    Deterministic like everything else here: the same eight people with the same
    ids after a reseed. */
async function seedCandidates(people: Person[]): Promise<void> {
	const rows: Record<string, unknown>[] = [];
	/* The two already-pulled rows point at real employees, and they are named
	   after them. A candidate whose card links to somebody with a different name
	   on it is a fixture that makes the join look broken. */
	const taken = people.filter((p) => p.status === "Active").slice(0, 2);

	for (let i = 1; i <= 8; i++) {
		/* The last two are the pulled ones, so the queue above them reads the way
		   it would on a Monday morning: the finished work at the bottom. */
		const was = i > 6 ? taken[i - 7] : undefined;
		const [wasFirst, ...wasRest] = (was?.employee_name || "").split(" ");
		const first = was ? wasFirst : pick(FIRST_NAMES);
		const last = was ? wasRest.join(" ") : pick(LAST_NAMES);
		const name = `HR-ONB-${String(i).padStart(5, "0")}`;
		/* Two thirds start in the next six weeks and the rest were due already.
		   `-14` rather than `-1` so the overdue ones are unmistakably overdue. */
		const joining = addDays(TODAY, between(-14, 45));
		const pulled = Boolean(was);

		rows.push({
			name,
			employee_name: was ? was.employee_name : `${first} ${last}`,
			salutation: chance(0.5) ? "Mr" : "Ms",
			first_name: first,
			last_name: last,

			/* A code exists only once somebody has been created. Both halves of
			   that are visible here on purpose — see the note on the doctype. */
			employee_number: was ? was.employee_number : "",
			employee_code_series: "Manual Entry",

			date_of_birth: iso(addDays(TODAY, -between(20 * 365, 44 * 365))),
			date_of_joining: was ? was.date_of_joining : iso(joining),
			boarding_begins_on: iso(addDays(joining, -7)),

			/* The gaps this screen is for. Two rows with no number to ring and one
			   with no address to write to — which is exactly the state a joiner
			   entered off a paper form arrives in. */
			cell_number: i === 2 || i === 5 ? "" : `9${between(100000000, 899999999)}`,
			personal_email: i === 4 ? "" : `${first}.${last}${i}`.toLowerCase() + "@example.com",

			company: COMPANY.name,
			department: was ? was.department : pick(DEPARTMENTS.filter(([, off]) => !off).map(([dept]) => dept)),
			designation: was ? was.designation : pick(DESIGNATIONS),
			employee_grade: pick(GRADES),

			boarding_status: pulled ? "Completed" : i % 3 === 0 ? "In Process" : "Pending",
			/* The join that makes a pulled candidate unrepeatable, and it names an
			   employee the seed has really written — so the ↗ on the card opens a
			   record rather than a 404, and opens the right person. */
			employee: was ? was.name : "",

			/* Their LAST ACTION BY / LAST ACTION ON columns. Two different people,
			   because a column that only ever says "Administrator" is a column
			   nobody would notice was broken. */
			owner: i % 2 ? "admin@example.com" : "hr.desk@example.com",
			modified_by: pulled ? "admin@example.com" : "hr.desk@example.com",
		});
	}

	await EmployeeOnboardingModel.insertMany(rows);
	await bumpSeries("HR-ONB-", rows.length);

	const waiting = rows.filter((r) => !r.employee).length;
	console.log(`[seed]   ${rows.length} onboarding candidates (${waiting} waiting to be pulled)`);
}

/* ------------------------------------------------------------- attachments */

/* The scans behind the Document register's paperclip.

   **These are placeholders and they say so on their face.** A seed cannot ship
   a photograph of somebody's passport, and one that shipped a blank 1x1 pixel
   would give the popover something to open that looks like a broken file rather
   than like a stand-in — which is the same failure the rest of this dashboard
   spends its comments avoiding.

   So each one is a drawn card, in SVG, naming the record it belongs to and
   saying in as many words that it is not a document. SVG rather than a JPEG
   because it is the only image format this repo can generate honestly: a real
   raster placeholder means a binary blob in source control, and a fake `.jpg`
   holding text would be a file whose extension lies. The `File` row carries
   whatever the bytes actually are, which is the point.

   The number on the card is masked to its last four. A placeholder does not
   need the whole of an identifier to prove which row it is for, and a seed that
   writes complete PAN-shaped strings into files on disk is a habit that
   survives into the run where the strings are real. */
function placeholderScan(who: string, code: string, kind: string, number: string): string {
	const masked = number.length > 4 ? "•".repeat(number.length - 4) + number.slice(-4) : number;
	/* `<` and `&` only — the values here are names and identifiers from this
	   seed, but an escape that depends on knowing that is an escape that breaks
	   the first time the function is reused. */
	const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

	return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" role="img"`
		+ ` aria-label="Placeholder scan for ${esc(who)}">`
		+ `<rect width="640" height="400" rx="10" fill="#f4f6f8" stroke="#c9d2da" stroke-width="2"/>`
		+ `<rect x="1" y="1" width="638" height="56" rx="10" fill="#1f4e79"/>`
		+ `<text x="24" y="37" font-family="Georgia, serif" font-size="21" fill="#ffffff">${esc(kind)}</text>`
		+ `<text x="616" y="37" text-anchor="end" font-family="monospace" font-size="15" fill="#c8dcf0">PLACEHOLDER</text>`
		+ `<text x="24" y="112" font-family="system-ui, sans-serif" font-size="13" fill="#6b7885">HOLDER</text>`
		+ `<text x="24" y="140" font-family="system-ui, sans-serif" font-size="24" fill="#16222c">${esc(who)}</text>`
		+ `<text x="24" y="186" font-family="system-ui, sans-serif" font-size="13" fill="#6b7885">EMPLOYEE CODE</text>`
		+ `<text x="24" y="212" font-family="monospace" font-size="19" fill="#16222c">${esc(code)}</text>`
		+ `<text x="330" y="186" font-family="system-ui, sans-serif" font-size="13" fill="#6b7885">NUMBER</text>`
		+ `<text x="330" y="212" font-family="monospace" font-size="19" fill="#16222c">${esc(masked)}</text>`
		+ `<line x1="24" y1="248" x2="616" y2="248" stroke="#c9d2da" stroke-width="1"/>`
		+ `<text x="24" y="286" font-family="system-ui, sans-serif" font-size="14" fill="#6b7885">`
		+ `This is not a document. It is a seeded stand-in for the scan that would</text>`
		+ `<text x="24" y="308" font-family="system-ui, sans-serif" font-size="14" fill="#6b7885">`
		+ `hang off this field, so the attachment popover has something real to open.</text>`
		+ `<text x="24" y="356" font-family="monospace" font-size="12" fill="#8b97a3">`
		+ `manna-hrm seed &#183; npm run seed</text>`
		+ `</svg>`;
}

/** A stand-in profile picture, on the same terms as the scan above: **it says
    on its face that it is not a photograph.**

    A seed cannot ship photographs of people. It could ship a grey silhouette,
    and that would be worse — a silhouette is what a real site shows for
    somebody who has *no* picture, so a fixture full of them would make a
    populated column and an empty one look identical. This is a coloured round
    of initials with the person's name under it and the word PLACEHOLDER on it,
    which is unmistakably neither a photograph nor an empty slot.

    The hue is derived from the employee code, so the same person is the same
    colour after a reseed and a wall of them is not one flat block. */
function placeholderFace(who: string, code: string): string {
	const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
	const initials = who.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
	/* Off the code rather than off `rand()`: this has to be stable per person,
	   and the generator's position depends on how many people came before. */
	let h = 0;
	for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320" role="img"`
		+ ` aria-label="Placeholder profile picture for ${esc(who)}">`
		+ `<rect width="320" height="320" fill="hsl(${h} 32% 93%)"/>`
		+ `<circle cx="160" cy="132" r="72" fill="hsl(${h} 42% 74%)"/>`
		+ `<text x="160" y="158" text-anchor="middle" font-family="Georgia, serif" font-size="60"`
		+ ` fill="hsl(${h} 55% 26%)">${esc(initials)}</text>`
		+ `<text x="160" y="240" text-anchor="middle" font-family="system-ui, sans-serif" font-size="19"`
		+ ` fill="#16222c">${esc(who)}</text>`
		+ `<text x="160" y="266" text-anchor="middle" font-family="monospace" font-size="14"`
		+ ` fill="#6b7885">${esc(code)}</text>`
		+ `<text x="160" y="300" text-anchor="middle" font-family="monospace" font-size="12"`
		+ ` fill="#8b97a3">PLACEHOLDER &#183; NOT A PHOTOGRAPH</text>`
		+ `</svg>`;
}

/** Which document fields carry a scan, and what a person would call the file.

    Keyed by the field rather than by a document "type", because that is the
    join the register makes: a synthesised row *is* an employee and a field, and
    `attached_to_field` is the only column on `File` that can hold the second
    half of that pair. See DOC_KINDS in client/src/data/onboard.js. */
const SCANNED = [
	{ field: "passport_number", kind: "Passport", label: "Passport" },
	{ field: "custom_pan_no", kind: "PAN Card", label: "PAN" },
] as const;

async function seedAttachments(): Promise<void> {
	const dir = (await import("../env.js")).env.filesDir;
	await fs.promises.mkdir(dir, { recursive: true });

	/* Only what a previous run of this seed wrote. The collection is dropped by
	   `wipe()`, so leaving the bytes behind would orphan them permanently — but
	   the directory is a real one that an upload route will one day share, and a
	   seed that empties a whole directory is a seed that eventually eats
	   somebody's uploads. The prefix is the contract. */
	for (const entry of await fs.promises.readdir(dir).catch(() => [])) {
		if (/^HR-EMP-\d+\.[a-z_]+\.svg$/.test(entry)) {
			await fs.promises.unlink(path.join(dir, entry)).catch(() => {});
		}
	}

	const rows = await EmployeeModel.find(
		{},
		{ name: 1, employee_name: 1, employee_number: 1, passport_number: 1, custom_pan_no: 1 },
	).lean();

	const files: Record<string, unknown>[] = [];
	let faces = 0;

	for (const emp of rows) {
		/* A profile picture on about half of them. Half rather than all, for the
		   reason every other gap in this seed is deliberate: Employee Detail's
		   Download Document dialog counts what it would actually download, and a
		   fixture where everybody has a picture would never show the count that
		   matters — the people who have not got one. */
		if (chance(0.52)) {
			const stored = `${emp.name}.image.svg`;
			const svg = placeholderFace(
				String(emp.employee_name ?? emp.name),
				String(emp.employee_number ?? emp.name),
			);
			await fs.promises.writeFile(path.join(dir, stored), svg, "utf8");
			const url = `/files/${encodeURIComponent(stored)}`;

			files.push({
				name: `${emp.name}-image`,
				file_name: `${emp.employee_name} Profile Picture.svg`,
				file_url: url,
				file_type: "SVG",
				file_size: Buffer.byteLength(svg, "utf8"),
				/* Not private, unlike the scans. A profile picture is what the
				   directory draws beside somebody's name; a passport is not. */
				is_private: 0,
				attached_to_doctype: "Employee",
				attached_to_name: emp.name,
				attached_to_field: "image",
			});
			/* ERPNext's `image` holds the URL as well as there being a File row
			   pointing back — both halves, because both are how a real site reads
			   it: the record renders from the field, and the attachment list finds
			   it through `attached_to_field`. */
			await EmployeeModel.updateOne({ name: emp.name }, { $set: { image: url } });
			faces++;
		}

		for (const doc of SCANNED) {
			const number = (emp as Record<string, unknown>)[doc.field];
			if (typeof number !== "string" || !number) continue;

			/* Not every numbered document has been scanned, and that is the state
			   the paperclip exists to distinguish. Two thirds, so a person opening
			   the register sees both a live clip and a dead one without paging. */
			if (!chance(0.66)) continue;

			/* Two names, and they are different on purpose. On disk: the record
			   and the field, which is unique. On screen: what somebody would call
			   it, which is not — two people's passports are both "Passport.svg". */
			const stored = `${emp.name}.${doc.field}.svg`;
			const shown = `${emp.employee_name} ${doc.label}.svg`;

			const svg = placeholderScan(
				String(emp.employee_name ?? emp.name),
				String(emp.employee_number ?? emp.name),
				doc.kind,
				number,
			);
			await fs.promises.writeFile(path.join(dir, stored), svg, "utf8");

			files.push({
				name: `${emp.name}-${doc.field}`,
				file_name: shown,
				/* Encoded here rather than in the client. The stored name has no
				   spaces in it today, but the column is a URL and a URL that is
				   only valid while the naming above stays lucky is not one. */
				file_url: `/files/${encodeURIComponent(stored)}`,
				file_type: "SVG",
				file_size: Buffer.byteLength(svg, "utf8"),
				is_private: 1,
				attached_to_doctype: "Employee",
				attached_to_name: emp.name,
				attached_to_field: doc.field,
			});
		}
	}

	if (files.length) await FileModel.insertMany(files);
	console.log(`[seed]   ${files.length} attachments written to ${dir} (${faces} profile pictures)`);
}

/* ---------------------------------------------------------------------- run */

async function main(): Promise<void> {
	const { env } = await import("../env.js");
	guard(env.mongoUri);

	await connect();
	console.log("[seed]   clearing");
	await wipe();

	await seedMasters();
	console.log(`[seed]   masters: ${DEPARTMENTS.length} departments, ${DESIGNATIONS.length} designations, `
		+ `${SHIFT_TYPES.length} shifts, ${LEAVE_TYPES.length} leave types`);

	const people = await seedEmployees();
	console.log(`[seed]   ${people.length} employees (${people.filter((p) => p.status === "Active").length} active)`);

	await seedAttendance(people);
	await seedQueues(people);
	await seedOnboard(people);
	await seedCandidates(people);
	await seedAttachments();

	await disconnect();
	console.log("[seed]   done");
}

main().catch((err: unknown) => {
	console.error("[seed]   failed:", err);
	process.exit(1);
});
