import { model, type Model } from "mongoose";
import { docSchema, type DocBase } from "./base.js";

/* ---------------------------------------------------------------------------
   On Board's three reads: what somebody was given, where it went, and what was
   written for them.

   These are fetched after the dashboard rather than with it. A module nobody
   has opened must not be able to hold up the load everybody does open — see
   `onboardRead` in the client store, which is the flag that keeps a re-render
   from asking twice.
   --------------------------------------------------------------------------- */

const DATE = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };

/* --------------------------------------------------------------------- Asset */

export interface Asset extends DocBase {
	asset_name?: string;
	item_code?: string;
	custodian?: string;
	location?: string;
	asset_quantity?: number;
	warranty_expiry_date?: string;
	supplier?: string;
	serial_no?: string;
}

export const AssetModel: Model<Asset> = model<Asset>(
	"Asset",
	docSchema<Asset>({
		asset_name: String,
		item_code: String,
		asset_category: String,
		/* The employee currently holding it. Empty is a real answer — an asset in
		   a store room has no custodian, and it is not the same as one whose
		   custodian was never recorded. Nothing here can tell those apart, which
		   is worth knowing before reading a coverage figure off this collection. */
		custodian: { type: String, index: true },
		location: String,
		purchase_date: DATE,
		gross_purchase_amount: { type: Number, default: 0 },
		status: { type: String, default: "In Use" },
		company: String,
		/* Four more of ERPNext's own Asset fields, added 3 Sep 2026 for Factor
		   HR's Assets Details form — which was screenshotted that day and asks
		   for all four. Stock fields on the real doctype, not inventions: this
		   collection stands in for ERPNext's `Asset`, and a field here that
		   ERPNext has not got would make the comparison the whole build exists
		   for a comparison against something else.

		   Their form asks for three more that are *not* on Asset anywhere —
		   Detail, Qty On Hand and Attachment — and those stay off. See
		   ASSET_FORM in client/src/data/onboard.js, which is where each of the
		   thirteen says which side of that line it is on. */
		asset_quantity: { type: Number, default: 1 },
		warranty_expiry_date: DATE,
		supplier: String,
		serial_no: String,
	}),
	"assets",
);

/* ------------------------------------------------------------ Asset Movement */

export interface AssetMovement extends DocBase {
	transaction_date?: string;
	purpose?: string;
}

export const AssetMovementModel: Model<AssetMovement> = model<AssetMovement>(
	"AssetMovement",
	docSchema<AssetMovement>({
		/* `YYYY-MM-DD HH:MM:SS` — a movement is an instant, unlike the calendar
		   dates elsewhere in this schema, and the client sorts on it as text. */
		transaction_date: { type: String, index: true },
		purpose: { type: String, enum: ["Issue", "Receipt", "Transfer"] },
		company: String,
		asset: String,
		from_employee: String,
		to_employee: String,
		reference_name: String,
	}),
	"asset_movements",
);

/* ----------------------------------------------------------- Employee Letter */

export interface EmployeeLetter extends DocBase {
	employee?: string;
	letter_type?: string;
	letter_date?: string;
	letter_number?: number;
	reference_number?: string;
	remarks?: string;
}

export const EmployeeLetterModel: Model<EmployeeLetter> = model<EmployeeLetter>(
	"EmployeeLetter",
	docSchema<EmployeeLetter>({
		employee: { type: String, index: true },
		employee_name: String,
		letter_type: { type: String, index: true },
		letter_date: DATE,
		/* The three columns Factor HR's Create Letters list carries beside the
		   type and the date. They are on the schema rather than drawn as gaps
		   because this doctype is ours — the Employee fields that page cannot
		   fill (PAN, Aadhaar) are ERPNext's and are a different argument.

		   `reference_number` and `remarks` are empty on Factor HR's own one row,
		   and empty is what they mostly are here too. That is the finding rather
		   than a hole: the columns are maintained and nobody fills them. */
		letter_number: { type: Number, index: true },
		reference_number: String,
		remarks: String,
		/* The merged text, kept as it was issued. Re-merging a letter from the
		   current record would produce a different document from the one the
		   person was handed the moment anything on their record changes. */
		body: String,
	}),
	"employee_letters",
);

/* ------------------------------------------------------ Employee Onboarding */

/** A joiner who has been agreed to and is not on the payroll yet.

    **Why this doctype exists at all.** Employee Master's ⋯ menu has carried an
    *Import From Onboarding* item since it was drawn, and until now it opened
    the ERPNext desk — which is the right answer for a write and the wrong one
    for a *list*: the thing somebody wants when they press it is to see who is
    waiting, and that is a read. Candidate Master was dropped on 3 Sep 2026 for
    exactly the reason this fixes — "no doctype behind it". So the doctype comes
    first and the screen second, rather than the other way round.

    **Which fields are ERPNext's and which are ours**, because that line matters
    on every other doctype here and it matters on this one too:

      ERPNext's own `Employee Onboarding`, field for field —
        job_applicant, employee_name, date_of_joining, company, department,
        designation, employee_grade, boarding_begins_on, boarding_status,
        employee.

      Ours, and named after the column on Factor HR's own import screen —
        employee_number, employee_code_series, salutation, first_name,
        last_name, date_of_birth, cell_number, personal_email.

    The second group is on the schema rather than drawn as gaps for the same
    reason `Employee Letter`'s three late columns are: **this doctype is ours.**
    ERPNext keeps a candidate's phone and email one link away on `Job Applicant`
    and keeps a date of birth nowhere at all, and a screen that drew four of its
    eight columns as "no field on this site" would be a screen nobody could pull
    a candidate from — the Employee it creates needs a name, a date of birth and
    a joining date before the site will take it.

    `employee` is the join that makes this list finite. It is empty on a
    candidate nobody has pulled and holds the `Employee` name once somebody
    has — which is what stops the same person being created twice from two
    browser tabs, and what lets the screen draw a pulled row as pulled instead
    of quietly offering the button again. It is one of the two fields on the PUT
    allowlist for that reason; see registry.ts. */
export interface EmployeeOnboarding extends DocBase {
	employee_name?: string;
	employee_number?: string;
	employee_code_series?: string;
	salutation?: string;
	first_name?: string;
	last_name?: string;
	date_of_birth?: string;
	date_of_joining?: string;
	cell_number?: string;
	personal_email?: string;
	company?: string;
	department?: string;
	designation?: string;
	employee_grade?: string;
	job_applicant?: string;
	boarding_begins_on?: string;
	boarding_status?: string;
	employee?: string;
}

export const EmployeeOnboardingModel: Model<EmployeeOnboarding> = model<EmployeeOnboarding>(
	"EmployeeOnboarding",
	docSchema<EmployeeOnboarding>({
		/* Held whole *and* in parts. ERPNext derives `employee_name` from the
		   three name fields on Employee and this mirrors that, because the pull
		   posts the parts and the list draws the whole — a candidate list that
		   could only show "RAGHAV" because the surname lives somewhere else is a
		   list nobody can find anybody on. */
		employee_name: { type: String, index: true },
		salutation: String,
		first_name: String,
		last_name: String,

		/* Empty on almost every row, and that is the finding rather than a hole:
		   a code is issued when somebody is created, so a candidate carrying one
		   already is a record being back-filled. Factor HR's own screen shows a
		   dash in this column on both of its rows. */
		employee_number: { type: String, index: true },
		/* Factor HR's EMPLOYEE CODE SERIES column. "Manual Entry" means whoever
		   pulls the candidate types the code; a series name here means the site
		   hands one out. Only the first is honest on this site today — nothing
		   here allocates from a series — so the pull refuses to invent a code
		   and asks for it. */
		employee_code_series: { type: String, default: "Manual Entry" },

		date_of_birth: DATE,
		date_of_joining: DATE,
		cell_number: String,
		personal_email: String,

		company: String,
		department: String,
		designation: String,
		employee_grade: String,

		/* ERPNext's link to the applicant this joiner came in as. Kept as a plain
		   string like every other link in this schema, and empty for a candidate
		   entered by hand rather than hired through a vacancy. */
		job_applicant: String,
		boarding_begins_on: DATE,
		/* ERPNext's own three. `Completed` is what a pulled candidate becomes and
		   is the state the screen greys the button on. */
		boarding_status: {
			type: String,
			enum: ["Pending", "In Process", "Completed"],
			default: "Pending",
			index: true,
		},
		/* The Employee this candidate became, once somebody pulled them. Empty is
		   the whole of the queue this screen exists to draw. */
		employee: { type: String, index: true },
	}),
	"employee_onboarding",
);
