/* ---------------------------------------------------------------------------
   **What each unbuilt item of theirs would take.**

   106 of Factor HR's 160 menu items have no page here that does the work. Every
   one of them now has a page — `features/reports/Blueprint.jsx` — and this file
   is what those pages say.

   Two levels, deliberately:

   - `DEFAULT` answers per module and kind. Forty-nine of the fifty-six unbuilt
     Payroll items are reports over a `Salary Slip`, and writing the same
     sentence forty-nine times would bury the seven that are different.
   - `NEEDS` overrides it, per item, wherever the real answer is specific — a
     doctype that already exists, a decision nobody has taken, or a reason the
     thing should not be built at all.

   **The honest shape of this list is that most of it is not blocked on code.**
   Payroll's reports are waiting on a payroll being run; leave's are waiting on
   a leave ledger; the attendance policy engine is waiting on somebody writing
   down what the policy is. Saying that on each page is the difference between a
   backlog somebody can act on and a list of 106 things that all look equally
   far away.

   `doctype` is what the answer would be read from, where there is one. It is
   the most useful single fact on the page for whoever picks the item up: about
   seventy per cent of Factor HR is stock Frappe HR, and the commonest mistake
   on this project has been building something hrms already had.
   --------------------------------------------------------------------------- */

/** Per module and kind, for the items whose answer is the same answer. */
export const DEFAULT = {
	"payroll:Reports": {
		doctype: "Salary Slip",
		need: "A submitted <code>Salary Slip</code> to read. <b>No payroll has ever been run on this "
			+ "site</b> — Salary Structure, Payroll Entry and Salary Slip are all untouched — so this "
			+ "report has nothing to read rather than no code to run. Forty-nine of their Payroll "
			+ "reports are in this position, and one payroll run unblocks nearly all of them at once.",
	},
	"payroll:Transaction": {
		doctype: "Payroll Entry, Salary Slip",
		need: "Frappe HR ships the payroll module and nothing on this site has used it. The Payroll "
			+ "section of this app draws Factor HR's screens against it and is marked Deferred on the "
			+ "rail for that reason — attendance first, because attendance is what payroll reads.",
	},
	"payroll:Setup": {
		doctype: "Fiscal Year, Payroll Period",
		need: "Stock ERPNext configuration, and cheap. It is deferred only because nothing downstream "
			+ "of it exists yet.",
	},
	"attendance:Reports": {
		doctype: "Employee Checkin",
		need: "The punches are on the site and this is arithmetic over them. What usually blocks one "
			+ "of these is a <b>shift window</b> — this app reads Shift Type for its names and not its "
			+ "timings, so anything about early, late or short has nothing to measure against.",
	},
	"attendance:Setup": {
		doctype: "Shift Type, Attendance Policy (none)",
		need: "This is the attendance policy engine — roughly the thirty per cent of Factor HR that is "
			+ "not stock Frappe HR, and the part that decides what people are paid. It is a decision "
			+ "before it is code.",
	},
	"leave:Reports": {
		doctype: "Leave Application, Leave Ledger Entry",
		need: "Applications are on the site; the <b>ledger is not</b>. Leave Type, Leave Period, Leave "
			+ "Policy and Leave Allocation are all stock hrms and all empty here, so nothing can be "
			+ "drawn down from an entitlement — which is what most of these reports are.",
	},
	"leave:Transaction": {
		doctype: "Leave Allocation, Leave Period",
		need: "Stock hrms, unused on this site. 1,300 days of unpaid leave are sitting in Factor HR's "
			+ "balances — see docs/FACTOHR_SCREENS.md §4 — and whatever migrates them lands here.",
	},
	"leave:Setup": {
		doctype: "Leave Type, Leave Policy, Leave Period",
		need: "All three are stock hrms and none has a row on this site. Leave is untouched by "
			+ "decision, not by oversight: attendance first.",
	},
	"employees:Transaction": {
		doctype: "Employee",
		need: "A field or a tab on the Employee record. Most of these are cheap; what decides the "
			+ "order is which of them somebody actually opens.",
	},
	"employees:Reports": {
		doctype: "Employee",
		need: "Arithmetic over the employee list, which this dashboard already holds. These are the "
			+ "cheapest items on their whole menu — the blocker is a column the migration never "
			+ "filled, not a doctype that does not exist.",
	},
	"employees:Setup": {
		doctype: "—",
		need: "A master list. ERPNext has most of these as stock doctypes under different names.",
	},
	"onboard:Transaction": {
		doctype: "Employee Onboarding",
		need: "Stock hrms. On Board → Import From Onboarding already reads it.",
	},
	"onboard:Reports": {
		doctype: "Employee Letter, Employee Document, Asset",
		need: "All three doctypes exist here and hold rows. These are list-and-filter reports over "
			+ "data the site already has, which puts them among the cheapest unbuilt items.",
	},
	"loans:Reports": {
		doctype: "Loan Application",
		need: "The site's loan design makes the application the loan, and the recovery schedule is on "
			+ "it. The arithmetic is in <code>manna_hr/rules.py</code> already.",
	},
	"loans:Setup": {
		doctype: "Loan Application",
		need: "The type sits on the application here rather than in a master of its own. See "
			+ "docs/DOCTYPES.md.",
	},
};

/**
 * Per item, where the real answer is not the default.
 *
 * `refuse: true` marks the two that would be **built and then regretted**.
 * They are drawn like every other item, with the reason in place of the plan —
 * an item quietly missing from this list reads as an oversight, and these are
 * the opposite of that.
 */
export const NEEDS = {
	/* ---- the ones that should not be built ---- */
	"Online Attendance": {
		refuse: true, doctype: "Employee Checkin",
		need: "A punch typed into a browser, with no device and no coordinate — <b>which is exactly "
			+ "what the geofence exists to catch</b>. A punch that cannot be placed has to arrive as a "
			+ "correction carrying a reason, and that screen is built: Attendance Regularization. "
			+ "Building this one would put a hole beside the lock.",
	},
	"Manual Process Attendance": {
		refuse: true, doctype: "Attendance",
		need: "This would let somebody hand-write an <code>Attendance</code> row. That row is "
			+ "generated from <code>Employee Checkin</code> by the shift job, and a hand-written one is "
			+ "invisible to the thing that would have created it — the two disagree the moment anything "
			+ "is reprocessed. CLAUDE.md §5. Re-running a day is the job's business; correcting one is "
			+ "a correction's.",
	},

	/* ---- the ones worth doing first ---- */
	"Organization Chart": {
		doctype: "Employee",
		need: "Built on 8 Sep 2026 — this row is stale if you are reading it. It was the cheapest "
			+ "item on their menu: <code>reports_to</code> already holds the tree.",
	},
	"Employee Identity Report": {
		doctype: "Employee",
		need: "PAN, Aadhaar, UAN, PF and ESI numbers off the Employee record. <b>The read does not ask "
			+ "for those columns yet</b> — adding a field a site has not got refuses the whole read, so "
			+ "each one has to be checked against the live doctype first. That is the work, and it is "
			+ "an hour.",
		warn: "Factor HR's own data has <code>PANNOTAVBL</code> in 502 of 504 rows — their placeholder "
			+ "for \"none on record\". A report drawing that as a PAN would print a fake number on "
			+ "three hundred people.",
	},
	"Employee Confirmation": {
		doctype: "Employee",
		need: "<code>final_confirmation_date</code> against <code>date_of_joining</code>. Stock "
			+ "ERPNext, one column, same caveat as the identity report: ask the live doctype before "
			+ "adding it to the read.",
	},
	"Rejected Offline Punches Report": {
		doctype: "Employee Checkin",
		need: "The punches the server turned away — outside the geofence, or from a device id nobody "
			+ "has registered. <b>Nothing keeps them today.</b> `manna_hr/checkin.py` refuses and does "
			+ "not record, so this report needs the refusal written down first, which is a small "
			+ "server change and a real one: a refused punch is somebody standing at a gate.",
	},
	"Absent Report": {
		doctype: "Employee Checkin",
		need: "Built on 8 Sep 2026 — see Attendance → Absent Report.",
	},
	"Change Employee Shift": {
		doctype: "Shift Assignment",
		need: "One person, one date, a different shift. <code>Shift Assignment</code> is stock hrms "
			+ "and nothing here writes one yet. It matters more than it looks: a night worker on the "
			+ "wrong shift is marked absent two days running.",
	},
	"Overtime & CompOff Approval": {
		doctype: "Attendance Request, Compensatory Leave Request",
		need: "Overtime is the open requirement from 23 August 2026 — docs/FACTOHR_SCREENS.md §3. "
			+ "<b>Nothing can be approved until somebody decides what counts as overtime</b>, and that "
			+ "decision has a cost attached, so it is not one this app can take.",
	},
	"Manage Attendance Policy": {
		doctype: "— none, on either side",
		need: "<b>The largest single item on this project.</b> Late marks, grace, half days, short "
			+ "hours, week-off rules, and what each of them does to a day's pay. Factor HR has it as "
			+ "one screen; hrms has no equivalent at all. It is the thirty per cent that is not stock, "
			+ "and it is a policy document before it is a doctype.",
	},
	"Assign Attendance Policy": {
		doctype: "— none",
		need: "Per employee or per category. Meaningless until the policy engine above exists.",
	},
	"Leave Opening Balance": {
		doctype: "Leave Allocation",
		need: "Where Factor HR's balances land. 1,300 days of unpaid leave are in theirs — "
			+ "docs/FACTOHR_SCREENS.md §4 — and every one is somebody's entitlement. This is a "
			+ "migration with a number attached, so it wants a reconciliation, not just an import.",
	},
	"Stop Payment": {
		doctype: "— no field in hrms",
		need: "A per-person hold on pay. Factor HR carries it; hrms has nothing equivalent, so it "
			+ "would be a Custom Field on Employee plus a check in the payroll run. <b>Nobody has "
			+ "asked for it</b>, and their own tenant has it set on zero people.",
	},
	"Stop Tax Deduction": {
		doctype: "— no field in hrms",
		need: "As Stop Payment: a Custom Field and a check, unused on their side too.",
	},
	"ECR File": {
		doctype: "Salary Slip",
		need: "The EPFO return — a fixed-width file with a schema of its own. <b>The first question is "
			+ "not how to generate it but whether PF is filed through this system at all</b>, and that "
			+ "is a question for whoever files it today.",
	},
	"Form 16": {
		doctype: "Salary Slip",
		need: "Statutory, annual, and the one payroll output an employee will chase. It cannot exist "
			+ "before a payroll has been run, and it must be right the first time.",
	},
	"Form 24Q": {
		doctype: "Salary Slip",
		need: "The quarterly TDS return, with the same dependency as Form 16: it is computed from "
			+ "submitted salary slips and there are none. It is also filed to a deadline with a penalty "
			+ "attached, so it belongs to whoever files it today until they say otherwise — a half-"
			+ "right return is worse than no return generated here.",
	},
	"Letter Report": {
		doctype: "Employee Letter",
		need: "The doctype exists here and holds rows — this is a list with filters over data already "
			+ "loaded. One of the cheapest unbuilt items on the whole menu.",
	},
	"Expiry in Days": {
		doctype: "Employee Document",
		need: "Documents expiring inside a window. The doctype is ours, it is on the site, and Document "
			+ "Entry already reads its expiry dates — this is a filter and a sort.",
	},
	"Assets By Employee": {
		doctype: "Asset, Asset Assignment",
		need: "Both are on the site and Assets Assignment already reads them. A grouping.",
	},
	"Assets Expiry Report": {
		doctype: "Asset",
		need: "Warranty and AMC dates off the Asset record, filtered to what expires next. The "
			+ "doctype is stock ERPNext and Assets Details already reads it — this is a sort and a "
			+ "window, and it is the kind of report that pays for itself the first time a warranty is "
			+ "noticed before it lapses rather than after.",
	},
	"Assets Stock Report": {
		doctype: "Asset",
		need: "What is held against what is issued. Assets Details holds the first half already.",
	},
	"Assets Details Report": {
		doctype: "Asset",
		need: "The asset list with its categories. Assets Details is that screen; this is its export.",
	},
	"Employees Head Count": {
		doctype: "Employee",
		need: "Headcount reconciliation month on month — joined, left, net. Off the employee list, "
			+ "which this dashboard holds; the only missing input is people who have already gone, and "
			+ "<code>relieving_date</code> is stock.",
	},
	"Candidate Master": {
		doctype: "Employee Onboarding",
		need: "Dropped as a page on 3 September 2026 because nothing backed it. hrms has "
			+ "<code>Employee Onboarding</code> and On Board → Import From Onboarding reads it, so the "
			+ "capability is here under a different name.",
	},
	"Employees Directory": {
		doctype: "Employee",
		need: "Built on 8 Sep 2026 — see Employees → Employees Directory.",
	},
	"Send Email Notification": {
		doctype: "Email Queue, Notification",
		need: "Frappe has the queue and the templates. <b>What is missing is a decision about who may "
			+ "send to everybody</b>, which is a permission question rather than a screen.",
	},
	"PAN Aadhaar Verification & Linkage": {
		doctype: "— external service",
		need: "Calls a government verification API. Outside this app entirely, and it costs per check.",
	},
	"FactoBot Document": {
		doctype: "— factoHR's own",
		need: "Documents for factoHR's own assistant. It goes with the product.",
	},
	"Separation / Exit Clearance": {
		doctype: "Employee Separation",
		need: "<code>Employee Separation</code> is stock hrms and unused on this site; the clearance "
			+ "checklist is Factor HR's own and has no equivalent. Their own F&F panel reads zero on a "
			+ "tenant with 347 leavers, so this is unused on both sides.",
	},
	"Flexi Benefits Plan": {
		doctype: "Employee Benefit Application",
		need: "Stock hrms, and it needs a salary structure with flexible components on it before it "
			+ "means anything.",
	},
	"Bank Master": {
		doctype: "Bank, Bank Account",
		need: "Both are stock ERPNext and both are already on the site. Factor HR keeps banks and "
			+ "branches as a master of its own; here they are ordinary records, so what is missing is a "
			+ "screen rather than a schema — and the only thing downstream of it is Bank Transfer, "
			+ "which is deferred with payroll.",
	},
	"Calendar": {
		doctype: "Holiday List",
		need: "Built — see Employees → Calendar, which reads the site's Holiday Lists and the days on "
			+ "each. This row is stale if you are reading it on a blueprint page.",
	},
	"Financial Year": {
		doctype: "Fiscal Year",
		need: "Stock ERPNext, and the site already has one — it is what every other dated record is "
			+ "filed against. Factor HR gives it a screen because their payroll year is configurable; "
			+ "here it is set once at install and rarely touched again.",
	},
	"Months": {
		doctype: "Payroll Period",
		need: "The payout period each month's payroll belongs to. Stock hrms, and it is created as "
			+ "part of setting up a payroll rather than on its own — so this is not a missing screen so "
			+ "much as a step of a process nobody has started.",
	},
	"List of Reason": {
		doctype: "— none",
		need: "Reasons for leaving, as a master. ERPNext has no such list; it would be a small custom "
			+ "doctype or a Select field on Employee.",
	},
	"Loan Type": {
		doctype: "Loan Application",
		need: "The site's design puts the type on the application rather than in a master. Changing "
			+ "that is a schema decision, not a screen.",
	},
	"Survey Setup": {
		doctype: "Employee Survey",
		need: "Built — see the Survey module. Empty in Factor HR too: no employee there has ever "
			+ "answered one.",
	},
};

/** What a page should say for one of their items. */
export function needFor(section, kind, title) {
	return NEEDS[title] || DEFAULT[`${section}:${kind}`] || {
		doctype: "—",
		need: "Nothing here answers this yet, and nobody has written down what it would take. That is "
			+ "the honest answer rather than an estimate.",
	};
}
