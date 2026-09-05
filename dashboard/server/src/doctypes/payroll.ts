import { model, type Model } from "mongoose";
import { childSchema, docSchema, type DocBase } from "./base.js";

/* ---------------------------------------------------------------------------
   The two payroll documents this API will write, and the rule that governs
   both of them.

   **Neither can be submitted from here.** Every create goes in at
   `docstatus: 0` — see DRAFT_ONLY in doctypes/registry.ts — so a save from the
   dashboard is a document sitting here waiting for a human to read and submit
   it on the system of record. Submitting is the act that decides what somebody
   is paid, and it belongs where the approval and the audit trail on it live.

   `Salary Slip` and `Payroll Entry` are not modelled at all, for the same
   reason and one further one: those are the documents that actually pay people,
   and a dashboard that can create one is a dashboard that can pay somebody by
   accident.
   --------------------------------------------------------------------------- */

const DATE = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };

/** One line of a structure — a component and what it is worth.

    `parentfield` says which half of the structure the row belongs to, and it is
    carried on the row itself rather than being implied by which array it sits
    in. That is redundant and it is Frappe's shape; keeping it means a row read
    out of context still knows whether it is an earning. */
const salaryDetail = childSchema({
	salary_component: { type: String, required: true },
	abbr: String,
	amount: { type: Number, default: 0 },
	parentfield: { type: String, enum: ["earnings", "deductions"] },
	parenttype: { type: String, default: "Salary Structure" },
	amount_based_on_formula: { type: Number, enum: [0, 1], default: 0 },
	formula: String,
	do_not_include_in_total: { type: Number, enum: [0, 1], default: 0 },
});

/* ----------------------------------------------------------- SalaryStructure */

export interface SalaryStructure extends DocBase {
	company?: string;
	currency?: string;
	is_active?: string;
	earnings?: unknown[];
	deductions?: unknown[];
}

export const SalaryStructureModel: Model<SalaryStructure> = model<SalaryStructure>(
	"SalaryStructure",
	docSchema<SalaryStructure>({
		company: { type: String, required: true },
		currency: { type: String, default: "INR" },
		payroll_frequency: { type: String, default: "Monthly" },
		/* "Yes" / "No", as a string, because that is what hrms carries and what
		   the client sends. A boolean here would be tidier and would not match. */
		is_active: { type: String, enum: ["Yes", "No"], default: "Yes" },
		salary_slip_based_on_timesheet: { type: Number, enum: [0, 1], default: 0 },
		earnings: { type: [salaryDetail], default: [] },
		deductions: { type: [salaryDetail], default: [] },
	}),
	"salary_structures",
);

/* ------------------------------------------------- SalaryStructureAssignment */

export interface SalaryStructureAssignment extends DocBase {
	employee?: string;
	salary_structure?: string;
	from_date?: string;
	base?: number;
}

export const SalaryStructureAssignmentModel: Model<SalaryStructureAssignment> =
	model<SalaryStructureAssignment>(
		"SalaryStructureAssignment",
		docSchema<SalaryStructureAssignment>({
			employee: { type: String, required: true, index: true },
			employee_name: String,
			salary_structure: { type: String, required: true },
			/* The date the structure takes effect. The client's second button looks
			   for assignments *later* than this one for the same person — a revision
			   dated before an existing one is the case that silently pays the old
			   figures, so it is found and reported rather than overwritten. */
			from_date: { ...DATE, index: true },
			company: { type: String, required: true },
			currency: { type: String, default: "INR" },
			/* CTC TOTAL, if it was typed. hrms carries it here rather than as a row
			   in the structure. */
			base: { type: Number, default: 0 },
			variable: { type: Number, default: 0 },
		}),
		"salary_structure_assignments",
	);
