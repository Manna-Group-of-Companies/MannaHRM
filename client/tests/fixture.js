/* ---------------------------------------------------------------------------
   A site with something on it.

   Every screen here draws two ways — with rows and without — and the empty one
   is the state the app opens in, so a suite that only ever renders the initial
   store tests the half of each page that says "nothing yet". This is the other
   half: a small site with the shapes the real one returns, including the gaps
   that make the reports worth having.

   **The gaps are the point and are deliberate.** One person has no department,
   one has no shift, one has no biometric id, one is Left, one company has no
   default holiday list. Every screen that reports on a gap is a screen that
   renders a different branch when it finds one, and a fixture without any gap
   never reaches that branch — which is how a report that has been broken for a
   month still passes its tests.

   Dates are strings throughout, `YYYY-MM-DD`, because that is what the site
   returns and what `lib/format.js` expects. Punch times are
   `YYYY-MM-DD HH:MM:SS` for the second reason: today's punches are filtered
   with a lexicographic `>=` against exactly that shape.
   --------------------------------------------------------------------------- */

import { todayIso } from "@/lib/format";

const TODAY = todayIso();

export const COMPANIES = [
	{ name: "Manna Rubber", abbr: "MR", default_holiday_list: "Manna 2026" },
	/* No default holiday list, which is what the Calendar screen's "Default
	   Calendar" tick reports on. */
	{ name: "Manna Tyre UAE", abbr: "MTU", default_holiday_list: "" },
];

export const EMPLOYEES = [
	{
		name: "HR-EMP-00001", employee_name: "Anand Raghavan", employee_number: "MR001",
		company: "Manna Rubber", department: "Production - MR", designation: "Operator",
		attendance_device_id: "1001", reports_to: "", date_of_joining: "2019-04-01",
		status: "Active", default_shift: "General", grade: "G3", branch: "Kochi",
		employment_type: "Full-time", holiday_list: "Manna 2026", ctc: 480000,
		cell_number: "9000000001", prefered_email: "anand@example.invalid",
		company_email: "", personal_email: "anand@example.invalid",
		passport_number: "", valid_upto: "", date_of_issue: "", place_of_issue: "",
		custom_pan_no: "ABCDE1234F",
	},
	{
		name: "HR-EMP-00002", employee_name: "Priya Menon", employee_number: "MR002",
		company: "Manna Rubber", department: "Accounts - MR", designation: "Accountant",
		attendance_device_id: "1002", reports_to: "HR-EMP-00001", date_of_joining: "2021-07-15",
		status: "Active", default_shift: "General", grade: "G5", branch: "Kochi",
		employment_type: "Full-time", holiday_list: "Manna 2026", ctc: 720000,
		cell_number: "9000000002", prefered_email: "priya@example.invalid",
		company_email: "priya@manna.invalid", personal_email: "",
		passport_number: "Z1234567", valid_upto: "2031-01-31",
		date_of_issue: "2021-02-01", place_of_issue: "Kochi", custom_pan_no: "",
	},
	{
		/* No department, no shift, no biometric id — the three gaps the setup
		   readiness panel counts, on one person so a screen can find all three. */
		name: "HR-EMP-00003", employee_name: "Rahul Nair", employee_number: "MTU001",
		company: "Manna Tyre UAE", department: "", designation: "Fitter",
		attendance_device_id: "", reports_to: "HR-EMP-00001", date_of_joining: "2024-01-08",
		status: "Active", default_shift: "", grade: "", branch: "",
		employment_type: "Full-time", holiday_list: "", ctc: 0,
		cell_number: "", prefered_email: "", company_email: "", personal_email: "",
		passport_number: "", valid_upto: "", date_of_issue: "", place_of_issue: "",
		custom_pan_no: "",
	},
	{
		/* Left, so every screen that filters on Active has somebody to leave out
		   and Final Settlement has somebody to list. */
		name: "HR-EMP-00004", employee_name: "Sunitha Joseph", employee_number: "MR003",
		company: "Manna Rubber", department: "Production - MR", designation: "Supervisor",
		attendance_device_id: "1004", reports_to: "HR-EMP-00001", date_of_joining: "2018-02-01",
		status: "Left", default_shift: "General", grade: "G4", branch: "Kochi",
		employment_type: "Full-time", holiday_list: "Manna 2026", ctc: 600000,
		relieving_date: "2026-06-30", resignation_letter_date: "2026-05-15",
		cell_number: "9000000004", prefered_email: "", company_email: "", personal_email: "",
		custom_pan_no: "PQRSX9876L",
	},
];

/** Two punches for one person today, and nobody else — so "who has not punched"
    is a question with a real answer rather than an empty set. */
export const CHECKINS = [
	{ name: "EMP-CKIN-00000001", employee: "HR-EMP-00001", time: `${TODAY} 08:58:12`, log_type: "IN" },
	{ name: "EMP-CKIN-00000002", employee: "HR-EMP-00001", time: `${TODAY} 17:31:44`, log_type: "OUT" },
	/* An IN with no OUT, which is the row every In/Out report has to decide how
	   to draw and the one a naive pairing gets wrong. */
	{ name: "EMP-CKIN-00000003", employee: "HR-EMP-00002", time: `${TODAY} 09:12:03`, log_type: "IN",
		/* From the phone app, so Today's Punches draws a Location with a value in it. */
		device_id: "PHONE-HR-EMP-00002", latitude: 9.591412, longitude: 76.522318 },
];

export const REGULARIZATIONS = [
	{
		name: "HR-AREG-00001", employee: "HR-EMP-00002", employee_name: "Priya Menon",
		company: "Manna Rubber", attendance_date: TODAY, requested_in: "09:00:00",
		requested_out: "18:00:00", reason: "Forgot to punch out", status: "Pending Approval",
		approver_type: "Reporting Manager", decided_by: "", decided_on: "", decision_note: "",
		creation: `${TODAY} 18:40:00`, owner: "priya@example.invalid",
		modified: `${TODAY} 18:40:00`, modified_by: "priya@example.invalid",
	},
];

export const LEAVE_APPLICATIONS = [
	{
		name: "HR-LAP-00001", employee: "HR-EMP-00001", employee_name: "Anand Raghavan",
		company: "Manna Rubber", leave_type: "Casual Leave", from_date: "2026-09-10",
		to_date: "2026-09-11", half_day: 0, half_day_date: "", total_leave_days: 2,
		leave_balance: 6, leave_approver: "", leave_approver_name: "",
		posting_date: "2026-09-01", status: "Open", description: "Family function",
		creation: "2026-09-01 10:00:00", owner: "anand@example.invalid",
		modified: "2026-09-01 10:00:00", modified_by: "anand@example.invalid",
	},
];

/** What `load()` writes into the store when the site answers. Kept in the shape
    that function uses rather than as a flat object, so the two cannot drift
    apart without this failing to compile into anything sensible. */
export function loadedState() {
	const employees = EMPLOYEES;
	return {
		employees,
		byName: Object.fromEntries(employees.map((e) => [e.name, e])),
		checkins: CHECKINS,
		approvals: {
			attendance: REGULARIZATIONS, leave: LEAVE_APPLICATIONS,
			profile: [], onboarding: [], transfer: [], letter: [], other: [],
		},
		letterTypes: [
			{ name: "Offer Letter", category: "Onboarding", is_active: 1, fields_used: "" },
			{ name: "Experience Letter", category: "Exit", is_active: 1, fields_used: "" },
		],
		letters: [{
			name: "HR-LTR-00001", employee: "HR-EMP-00001", employee_name: "Anand Raghavan",
			letter_type: "Offer Letter", letter_date: "2026-08-01",
			letter_number: "1", reference_number: "MR/2026/1", remarks: "",
		}],
		letterCols: true,
		companies: COMPANIES,
		holidayLists: [{ name: "Manna 2026" }],
		holidays: { "Manna 2026": [{ holiday_date: "2026-01-26", description: "Republic Day" }] },
		leaveTypes: [{ name: "Casual Leave" }, { name: "Sick Leave" }],
		shiftTypes: [{ name: "General" }, { name: "Night" }],
		departments: [
			{ name: "Production - MR", disabled: 0 },
			{ name: "Accounts - MR", disabled: 0 },
			/* One disabled, which is the Status column behind View Category. */
			{ name: "Stores - MR", disabled: 1 },
		],
		designations: [{ name: "Operator" }, { name: "Accountant" },
			{ name: "Fitter" }, { name: "Supervisor" }],
		counts: {
			companies: 2, shift: 2, holiday: 1, leavetype: 2, attendance: 0,
			departments: 3, designations: 4, left: 344,
		},
		/* The screens with a read of their own, each with the state flag that
		   says it has been asked — otherwise the page fires its loader on mount
		   and the mocked axios answers `{}`, which is a different test. */
		seps: employees.filter((e) => e.status !== "Active"), sepState: "ok",
		shAssign: [{
			name: "HR-SHA-00001", employee: "HR-EMP-00001", employee_name: "Anand Raghavan",
			shift_type: "General", company: "Manna Rubber",
			start_date: "2026-01-01", end_date: "", status: "Active", docstatus: 1,
		}],
		shAssignState: "ok",
		docs: employees, docTier: "full", docErr: "",
		docFiles: {},
		empFiles: [], empFilesState: "ok",
		assets: [{
			name: "ACC-ASS-00001", asset_name: "Bench grinder", item_code: "TOOL-001",
			asset_category: "Plant", company: "Manna Rubber", status: "Submitted",
			docstatus: 1, location: "Shop floor", custodian: "HR-EMP-00001",
			purchase_date: "2025-03-01", gross_purchase_amount: 45000,
			asset_quantity: 1, warranty_expiry_date: "2027-03-01",
			supplier: "Kochi Tools", serial_no: "BG-9912",
		}],
		assetTier: "full",
		assetCats: [{ name: "Plant", asset_category_name: "Plant", creation: "2025-01-01 00:00:00" }],
		assetMoves: [{
			name: "ACC-ASM-00001", purpose: "Issue", transaction_date: "2025-03-02",
			company: "Manna Rubber", asset: "ACC-ASS-00001",
			from_employee: "", to_employee: "HR-EMP-00001",
		}],
		moveTier: "full",
		cands: [{
			name: "HR-ONB-00001", employee_name: "Deepa Krishnan", salutation: "Ms",
			first_name: "Deepa", last_name: "Krishnan", employee_number: "",
			employee_code_series: "MR", date_of_birth: "1998-11-02",
			date_of_joining: "2026-10-01", cell_number: "9000000005",
			personal_email: "deepa@example.invalid", company: "Manna Rubber",
			department: "Accounts - MR", designation: "Accountant", employee_grade: "G5",
			job_applicant: "", boarding_begins_on: "2026-09-20", boarding_status: "Pending",
			employee: "", docstatus: 0, owner: "hr@example.invalid",
			creation: "2026-09-01 09:00:00", modified: "2026-09-01 09:00:00",
			modified_by: "hr@example.invalid",
		}],
		candTier: "full", candState: "ok",
		lvbRows: LEAVE_APPLICATIONS.map((l) => ({ ...l, status: "Approved" })),
		lvbState: "done",
		applyHist: LEAVE_APPLICATIONS,
		applyAtt: {},
		/* Signed in, with the site answering — the state every screen below the
		   sign-in form is drawn in. */
		user: "hr@example.invalid",
		site: "https://erp.example.invalid",
		conn: "live", connState: "live",
	};
}
