import type { Model } from "mongoose";
import { EmployeeModel } from "./Employee.js";
import {
	AssetCategoryModel, CompanyModel, DepartmentModel, DesignationModel, HolidayListModel,
	LeaveTypeModel, LetterTypeModel, SalaryComponentModel, ShiftTypeModel,
} from "./masters.js";
import {
	AttendanceModel, AttendanceRegularizationModel, EmployeeAttendanceRegularizationModel,
	EmployeeCheckinModel, ShiftAssignmentModel,
} from "./attendance.js";
import { LeaveApplicationModel } from "./leave.js";
import { SalaryStructureAssignmentModel, SalaryStructureModel } from "./payroll.js";
import {
	AssetModel, AssetMovementModel, EmployeeLetterModel, EmployeeOnboardingModel,
} from "./onboard.js";
import { FileModel } from "./file.js";

/* ---------------------------------------------------------------------------
   Every doctype this API serves, and what may be done to it.

   **This file is the security model.** Not the client — a rule enforced in a
   browser is a suggestion to anyone holding curl, and the dashboard says so
   about itself in half a dozen comments. So the three questions the client's
   own docs describe as the proxy's job are answered here, once, in a table
   somebody can read in one sitting:

     readable    is this doctype served at all
     creatable   may a POST make one
     writable    which fields, if any, may a PUT change

   The defaults are the safe ones. A doctype absent from this table 417s rather
   than 404s, because "no such doctype" and "no such field" are the same class
   of answer to a caller probing what a site carries, and the client's own
   fallback reads depend on that being a refusal of the whole request.

   Three further rules ride on top of the table:

     1. **Nothing is written at all unless the process was started with
        `ERP_WRITE=1`.** The default run is read-only, so a dashboard opened to
        look at something cannot change it.
     2. **Nothing is created except as a draft.** `docstatus` must be 0 or
        absent on a POST. Submitting is what decides that somebody is paid, and
        it does not happen from a dashboard.
     3. **A PUT may only set the fields named here.** Not "may not set the
        dangerous ones" — an allowlist, so a field added to a schema later is
        unwritable until somebody says otherwise in this file.
   --------------------------------------------------------------------------- */

/** How a document gets its `name`. */
export type Naming =
	/** Prompt-named: the caller supplies it, or it is copied off a field. */
	| { kind: "prompt"; from?: string }
	/** Series-named: `HR-EMP-` plus a zero-padded counter. */
	| { kind: "series"; prefix: string; width?: number };

/** What has to be true before a document may be deleted.

    A master is pointed at by string: an `Asset` carries `asset_category:
    "Furniture"`, not a foreign key, so deleting the category leaves every asset
    in it pointing at nothing and no database constraint notices. Frappe answers
    this with link validation and refuses; so does this, and the refusal names
    how many records are in the way rather than saying no.

    Listed per doctype rather than derived, because "which fields elsewhere are
    links to this" is not knowable from a Mongoose schema — they are plain
    strings — and a delete guard that silently knows about none of them is worse
    than no delete at all. */
export interface UsedBy {
	label: string;
	model: Model<any>;
	field: string;
}

export interface Doctype {
	/** The doctype's name on the wire, e.g. `Holiday List`. */
	label: string;
	model: Model<any>;
	naming: Naming;
	/** May a POST create one. */
	creatable: boolean;
	/** Which fields a PUT may set. `null` means the doctype is read-only. */
	writable: string[] | null;
	/** May a DELETE remove one, and what must not point at it first. Absent
	    means no — the safe default, and the answer for all but one of these. */
	deletable?: UsedBy[];
	/** Carries a docstatus that means something — so a create must be a draft. */
	submittable: boolean;
	/** What a list read is sorted by when nobody says. */
	defaultSort: Record<string, 1 | -1>;
}

const NEWEST_FIRST: Record<string, 1 | -1> = { creation: -1 };
const BY_NAME: Record<string, 1 | -1> = { name: 1 };

/* The decision fields on a correction queue, and the only ones a PUT may touch
   on either spelling of it. Setting `status` is how the decision is *invoked*,
   not a way around the rule: on the system of record it fires the self-approval
   guard and writes the missing checkin rows. */
const DECISION = ["status", "decision_note", "decided_by", "decided_on", "remarks"];

/* The document numbers On Board's Document Entry dialog edits, and **the only
   fields on `Employee` this API will change.**

   This is a deliberate exception to the rule the rest of this dashboard states
   about itself, so it is worth saying exactly how far it goes. Everything else
   here reads, and a correction is made on the system of record where the
   validation and the audit trail live. These five are different in one respect
   that decides it: a document number on this side is not a record anybody
   maintains elsewhere — it is a field that is empty on almost every employee,
   and the screen that shows it empty is the screen somebody would fix it from.
   Sending them to a desk to type a passport number into the same field, by
   hand, is the read-only rule protecting nothing.

   What it is not: `status`, `ctc`, `date_of_joining`, or anything that decides
   what somebody is paid or whether they still work here. Those stay unwritable,
   and an allowlist is the way round that keeps them so — a field added to the
   Employee schema tomorrow cannot be written until it is named here. */
const EMPLOYEE_DOCUMENTS = [
	"passport_number", "valid_upto", "date_of_issue", "place_of_issue", "custom_pan_no",
];

/* The boxes On Board's Assets Details form types into — nine of its thirteen.

   Four are not here and none of them is an oversight:

     Detail, Qty On Hand, Attachment   no field on ERPNext's Asset under any
                                       name, so there is nothing to write to.
     Rate                              not stored on either side. It is
                                       `gross_purchase_amount / asset_quantity`,
                                       computed for display — writing it would
                                       mean deciding which of the two it changed.

   `status` and `custodian` are absent too, and deliberately: an asset's status
   is moved by submitting an Asset Movement, and its custodian *is* that
   movement's destination. Setting either directly on the record would leave the
   movement history saying one thing and the asset another. That is a screen of
   its own — Assets Assignment — not a box on this form. */
const ASSET_FIELDS = [
	"item_code", "asset_name", "asset_category", "asset_quantity",
	"gross_purchase_amount", "warranty_expiry_date", "purchase_date",
	"serial_no", "supplier",
];

/* The two fields Employee Master's Import From Onboarding may set on a
   candidate, and the only ones. Pulling somebody creates an `Employee` and then
   says so on the candidate they came from — the link, and the state that
   follows from it.

   **The link is the point, not the tidying.** A pulled candidate whose record
   still says Pending is a candidate the next person pulls again, and the second
   Employee is a duplicate nobody notices until two people are on one machine
   code. Writing `employee` is what makes that unrepeatable, and it is why this
   is a write at all on a dashboard whose rule is that it reads.

   Nothing else on the doctype is writable — not the name, not the joining date,
   not the code. A candidate's details are corrected where they were entered. */
const ONBOARDING_PULL = ["employee", "boarding_status"];

const TABLE: Doctype[] = [
	/* ------------------------------------------------------------- people */
	{
		label: "Employee",
		model: EmployeeModel,
		naming: { kind: "series", prefix: "HR-EMP-" },
		/* The one doctype outside payroll this API creates. An Employee is a
		   person on file rather than a transaction: it is not submittable, so
		   there is nothing for the draft rule to guard, and on its own it pays
		   nobody — that still needs a Salary Structure Assignment, which only
		   ever goes in as a draft. */
		creatable: true,
		/* The five document fields and nothing else — see EMPLOYEE_DOCUMENTS. */
		writable: EMPLOYEE_DOCUMENTS,
		submittable: false,
		defaultSort: { employee_name: 1 },
	},

	/* ------------------------------------------------------------ masters */
	{ label: "Company", model: CompanyModel, naming: { kind: "prompt" }, creatable: false, writable: null, submittable: false, defaultSort: BY_NAME },
	{ label: "Department", model: DepartmentModel, naming: { kind: "prompt" }, creatable: false, writable: null, submittable: false, defaultSort: BY_NAME },
	{ label: "Designation", model: DesignationModel, naming: { kind: "prompt" }, creatable: false, writable: null, submittable: false, defaultSort: BY_NAME },
	{
		label: "Holiday List",
		model: HolidayListModel,
		naming: { kind: "prompt" },
		/* Still not creatable and still not writable, and the two are a pair with
		   the delete below rather than an inconsistency with it. Creating or
		   editing a calendar decides *what* somebody's weekly off is, which is a
		   judgement with a spreadsheet behind it — the dashboard collects it and
		   Data Import writes it, where every row is previewed.

		   Deleting is the one act on this doctype with a mechanical answer to
		   "is it safe", and the guards below are that answer. */
		creatable: false,
		writable: null,
		/* Their Delete, on the calendar toolbar, and the second doctype on this
		   table to have one.

		   The argument is the one Asset Category makes: an empty list is a typo
		   somebody wants gone, and a list with people on it is a decision about
		   those people. It is sharper here, because the consequence is known and
		   this dashboard already reports it — an employee with no holiday list has
		   no weekly off, so the shift job expects them at the gate on a Sunday and
		   marks them absent when they do not come. It costs them the day.

		   So all three referrers are named. `Employee` is the one that costs
		   somebody money; `Company` is the default a new hire would inherit, which
		   fails silently later rather than now; and `Shift Type` decides which days
		   generate attendance at all. Missing any one of them would make this a
		   delete that looked guarded and was not. */
		deletable: [
			{ label: "Employee", model: EmployeeModel, field: "holiday_list" },
			{ label: "Company", model: CompanyModel, field: "default_holiday_list" },
			{ label: "Shift Type", model: ShiftTypeModel, field: "holiday_list" },
		],
		submittable: false,
		defaultSort: BY_NAME,
	},
	{ label: "Leave Type", model: LeaveTypeModel, naming: { kind: "prompt" }, creatable: false, writable: null, submittable: false, defaultSort: BY_NAME },
	{ label: "Shift Type", model: ShiftTypeModel, naming: { kind: "prompt" }, creatable: false, writable: null, submittable: false, defaultSort: BY_NAME },
	{ label: "Letter Type", model: LetterTypeModel, naming: { kind: "prompt" }, creatable: false, writable: null, submittable: false, defaultSort: BY_NAME },
	{
		label: "Asset Category",
		model: AssetCategoryModel,
		/* Named by the thing itself, like every master here. Which is why the
		   dialog that maintains it can add and delete and cannot rename: the
		   name is the id and every Asset points at it by that string. */
		naming: { kind: "prompt", from: "asset_category_name" },
		creatable: true,
		/* **Not `["asset_category_name"]`, and the temptation is the point.**
		   Writing that field without moving `name` leaves the two disagreeing and
		   every Asset still pointing at the old string — a rename that looks like
		   it worked and silently did half of itself. A real rename rewrites the
		   referring records too, which is `rename_doc` on the site. */
		writable: null,
		submittable: false,
		/* The one doctype here a DELETE may remove, and only while nothing is in
		   it. An empty category is a typo somebody wants gone; a category with
		   assets in it is a decision about those assets. */
		deletable: [{ label: "Asset", model: AssetModel, field: "asset_category" }],
		defaultSort: BY_NAME,
	},

	/* --------------------------------------------------------- attendance */
	{ label: "Employee Checkin", model: EmployeeCheckinModel, naming: { kind: "series", prefix: "EMP-CKIN-", width: 8 }, creatable: false, writable: null, submittable: false, defaultSort: { time: -1 } },
	{ label: "Attendance", model: AttendanceModel, naming: { kind: "series", prefix: "HR-ATT-", width: 8 }, creatable: false, writable: null, submittable: true, defaultSort: { attendance_date: -1 } },
	{ label: "Shift Assignment", model: ShiftAssignmentModel, naming: { kind: "series", prefix: "HR-SHA-" }, creatable: false, writable: null, submittable: true, defaultSort: { start_date: -1 } },
	{
		label: "Attendance Regularization",
		model: AttendanceRegularizationModel,
		naming: { kind: "series", prefix: "HR-AREG-" },
		creatable: false,
		writable: DECISION,
		submittable: false,
		defaultSort: NEWEST_FIRST,
	},
	{
		label: "Employee Attendance Regularization",
		model: EmployeeAttendanceRegularizationModel,
		naming: { kind: "series", prefix: "HR-EAREG-" },
		creatable: false,
		writable: DECISION,
		submittable: false,
		defaultSort: NEWEST_FIRST,
	},

	/* -------------------------------------------------------------- leave */
	{
		label: "Leave Application",
		model: LeaveApplicationModel,
		naming: { kind: "series", prefix: "HR-LAP-" },
		creatable: false,
		writable: DECISION,
		submittable: true,
		defaultSort: NEWEST_FIRST,
	},

	/* ------------------------------------------------------------ payroll */
	{
		label: "Salary Component",
		model: SalaryComponentModel,
		/* Prompt-named off the component's own name, the way hrms names it — so
		   "Basic" is `name: "Basic"` and a structure can name it directly. */
		naming: { kind: "prompt", from: "salary_component" },
		creatable: true,
		writable: null,
		submittable: false,
		defaultSort: BY_NAME,
	},
	{
		label: "Salary Structure",
		model: SalaryStructureModel,
		/* Prompt-named, and the client supplies a name it has already checked is
		   free — see `freeStructureName`. No slashes in it, because a document
		   name goes into a URL and a slash there breaks the link to the very
		   document somebody is being sent to read. */
		naming: { kind: "prompt" },
		creatable: true,
		writable: null,
		submittable: true,
		defaultSort: NEWEST_FIRST,
	},
	{
		label: "Salary Structure Assignment",
		model: SalaryStructureAssignmentModel,
		naming: { kind: "series", prefix: "HR-SSA-" },
		creatable: true,
		writable: null,
		submittable: true,
		defaultSort: { from_date: -1 },
	},

	/* ----------------------------------------------------------- on board */
	{
		label: "Asset",
		model: AssetModel,
		naming: { kind: "series", prefix: "ACC-ASS-" },
		/* On Board's Assets Details New button creates one. Safe to allow where
		   most of this table is not, because of the rule that rides on top of
		   every POST here: **nothing is created except as a draft.** An Asset at
		   docstatus 0 is a record on file and nothing else — it depreciates
		   nobody's books and pays nobody until it is submitted, and submitting is
		   an act this API refuses outright. So the worst a bad create can do is
		   leave a draft somebody deletes. */
		creatable: true,
		/* The nine boxes the Assets Details form edits — see ASSET_FIELDS.
		   `submittable: true` is doing real work beside this: the PUT route
		   refuses any document at docstatus 1, so an asset that has been
		   submitted is history and this allowlist cannot touch it. */
		writable: ASSET_FIELDS,
		submittable: true,
		/* Their Delete, on the Assets Details toolbar. An asset that has been
		   moved has a history that outlives it: an Asset Movement names the
		   asset by string, so deleting one that has been issued to somebody
		   leaves a movement recording a handover of nothing. The DELETE route
		   counts them and refuses with the number. */
		deletable: [{ label: "Asset Movement", model: AssetMovementModel, field: "asset" }],
		defaultSort: BY_NAME,
	},
	{
		label: "Employee Onboarding",
		model: EmployeeOnboardingModel,
		naming: { kind: "series", prefix: "HR-ONB-" },
		/* Not creatable, and the omission is deliberate rather than pending. A
		   candidate is entered where the hire was agreed — a vacancy, an offer, an
		   HR inbox — and a dashboard that could conjure one would be a second
		   place for a joiner to exist. What this API adds is the read that shows
		   who is waiting and the write that records who has been taken. */
		creatable: false,
		writable: ONBOARDING_PULL,
		/* ERPNext's own `Employee Onboarding` is submittable and so is this, which
		   costs nothing today and buys the guard on the PUT route: a candidate
		   that has been submitted on the system of record is history, and the
		   allowlist above cannot touch one. */
		submittable: true,
		/* Their screen numbers the rows [#1], [#2] and lists the oldest first —
		   a queue is read in the order it formed. */
		defaultSort: BY_NAME,
	},
	{ label: "Asset Movement", model: AssetMovementModel, naming: { kind: "series", prefix: "ACC-ASM-" }, creatable: false, writable: null, submittable: true, defaultSort: { transaction_date: -1 } },
	{
		label: "Employee Letter",
		model: EmployeeLetterModel,
		naming: { kind: "series", prefix: "HR-LTR-" },
		/* On Board's Generate Bulk Letter creates these, one per row of an
		   uploaded sheet. It was `false`, and the note on NewLetter.jsx's Save
		   still describes that: their single-letter form hands off to the site
		   rather than writing here.

		   **The two are not inconsistent, they are different acts.** Issuing one
		   letter is a person filling a form with an employee picker, a date and
		   a reference on it — the site's form does that better and validates the
		   link. Issuing four hundred from a spreadsheet is not a form at all;
		   there is nowhere on the desk to paste a sheet into, which is the whole
		   reason their screen has a bulk dialog beside the single one. */
		creatable: true,
		writable: null,
		submittable: false,
		defaultSort: NEWEST_FIRST,
	},

	/* ---------------------------------------------------------- attachments */
	{
		label: "File",
		model: FileModel,
		/* Frappe names a File with a hash of its content. Nothing here creates
		   one, so the naming is never reached — it is written down rather than
		   left off so that whoever adds the upload has to decide it deliberately
		   rather than inherit a series that would number people's scans. */
		naming: { kind: "prompt" },
		/* **Not creatable, and that is the whole of the upload story today.**
		   A POST here would have to carry bytes, and this API takes JSON: an
		   upload is a multipart route with a size cap, a type check and somewhere
		   to put a file that fails halfway. The paperclip on the Document
		   register reads what is here and its Upload button stays dead with that
		   reason on it. */
		creatable: false,
		writable: null,
		submittable: false,
		/* Newest first, so a scan re-taken after a renewal is the one the
		   popover offers first. */
		defaultSort: NEWEST_FIRST,
	},
];

const BY_LABEL = new Map(TABLE.map((d) => [d.label, d]));

/** The doctype, or undefined. The caller decides what a miss means — the
    resource route answers 417, because a caller probing what this site carries
    reads "no such doctype" and "no such field" the same way. */
export function doctypeFor(label: string): Doctype | undefined {
	return BY_LABEL.get(label);
}

export const allDoctypes = (): readonly Doctype[] => TABLE;
